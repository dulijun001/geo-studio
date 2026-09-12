/**
 * GEO snapshot job (W6.2).
 *
 * Input: { snapshot_id, tenant_id, question_id, engine }
 * Pre-condition: a geo_snapshots row already exists at status=pending
 * (created by the web action that enqueued this job).
 *
 * Flow:
 *   1. Mark snapshot running.
 *   2. Load question text + tenant brand_vocab.
 *   3. Look up the engine adapter and run query() — currently only Doubao.
 *   4. On done: persist raw_response + citation_urls, run scanBrandMentions,
 *      insert one citations row per mention.
 *   5. On failed/rate_limited: write status + failure_reason; no citations.
 *
 * Adapters return TrackerResult instead of throwing for expected outcomes
 * (rate limit, captcha) per the TrackerAdapter contract, so we don't need
 * a try/catch around adapter.query here for those — only for unexpected bugs.
 */
import { bestBrandRank, scanBrandMentions, type VocabRow } from '@geo/geo-core';
import { reportError, type Engine } from '@geo/shared';
import { getServiceClient } from '../lib/supabase';
import { getAdapter } from '../trackers/registry';

export type GeoSnapshotJob = {
  snapshot_id: string;
  tenant_id: string;
  question_id: string;
  engine: Engine;
};

/**
 * V1.12.1 熔断器(D43)。2026-06-08 周一 baseline 458 题批次在 ~60 题后被
 * 豆包风控,worker 继续打了 30+ 小时(350+ 次全失败),每次失败都在加深
 * 设备黑分。熔断规则(纯 DB 查询,无进程状态):
 *   - 同 engine 最近 BREAKER_WINDOW 次「真实尝试」(done/failed,不含
 *     rate_limited 快速失败,防止熔断输出污染自身判定)全部 failed
 *   - 且最近一次尝试距今 < BREAKER_COOLDOWN_MS
 *   → 不启动浏览器,直接标 rate_limited。
 * 冷却到期后下一个 job 真实放行(half-open):成功 → 熔断闭合;再失败 →
 * 窗口刷新,重新冷却。
 */
const BREAKER_WINDOW = 5;
const BREAKER_COOLDOWN_MS = 2 * 3600 * 1000;

async function breakerIsOpen(
  client: ReturnType<typeof getServiceClient>,
  engine: Engine,
): Promise<boolean> {
  const { data: recent, error } = await client
    .from('geo_snapshots')
    .select('status, asked_at')
    .eq('engine', engine)
    .in('status', ['done', 'failed'])
    .not('asked_at', 'is', null)
    .order('asked_at', { ascending: false })
    .limit(BREAKER_WINDOW);
  // 查询失败时保守放行 — 熔断是优化不是闸门,不能因为它自己挂了阻塞追踪
  if (error || !recent || recent.length < BREAKER_WINDOW) return false;
  const allFailed = recent.every((r) => r.status === 'failed');
  if (!allFailed) return false;
  const newestAskedAt = recent[0]?.asked_at;
  if (typeof newestAskedAt !== 'string') return false;
  return Date.now() - new Date(newestAskedAt).getTime() < BREAKER_COOLDOWN_MS;
}

export async function handleGeoSnapshot(data: GeoSnapshotJob): Promise<void> {
  const { snapshot_id, tenant_id, question_id, engine } = data;
  const client = getServiceClient();
  const started = Date.now();

  console.log(`[geo-snapshot] snapshot=${snapshot_id} q=${question_id} engine=${engine}`);

  // V1.12.1 熔断检查 — 在标 running / 启动浏览器之前
  if (await breakerIsOpen(client, engine)) {
    await client
      .from('geo_snapshots')
      .update({
        status: 'rate_limited',
        failure_reason:
          `circuit breaker open — last ${BREAKER_WINDOW} ${engine} attempts all failed ` +
          `(rate-limit suspected); fast-fail without launching browser. ` +
          `Auto half-open after ${BREAKER_COOLDOWN_MS / 3600000}h quiet.`,
        asked_at: new Date().toISOString(),
      })
      .eq('id', snapshot_id);
    console.log(`[geo-snapshot] ${snapshot_id} → rate_limited (breaker open, engine=${engine})`);
    return;
  }

  await client
    .from('geo_snapshots')
    .update({ status: 'running' })
    .eq('id', snapshot_id);

  const { data: q, error: qErr } = await client
    .from('questions')
    .select('id, text, city')
    .eq('id', question_id)
    .single<{ id: string; text: string; city: string | null }>();
  if (qErr || !q) {
    await markFailed(snapshot_id, `question not found: ${qErr?.message}`);
    return;
  }

  // V1.11.4d: brand_vocab 必须过滤 deleted_at — soft-deleted 行 id 还在,
  // scanBrandMentions 把它们也算进去后 citations.vocab_id FK 检查会失败
  // (citations_vocab_id_fkey),整批 mentions 0 insert,SOV 战况图永远 0/0。
  const { data: vocabRows, error: vErr } = await client
    .from('brand_vocab')
    .select('id, term, term_type, aliases')
    .eq('tenant_id', tenant_id)
    .is('deleted_at', null);
  if (vErr) {
    await markFailed(snapshot_id, `brand_vocab fetch: ${vErr.message}`);
    return;
  }
  const vocab: VocabRow[] = (vocabRows ?? []).map((r) => ({
    id: r.id as string,
    term: r.term as string,
    term_type: r.term_type as VocabRow['term_type'],
    aliases: (r.aliases as string[]) ?? [],
  }));

  // Engine is now dispatched through the registry (apps/worker/src/trackers/
  // registry.ts). doubao + yuanbao are implemented; others return a clear
  // "not implemented" failure so the UI can mark them 扩展中 instead of red.
  const adapter = getAdapter(engine);
  const result = await adapter.query(
    { engine, question: q.text, city: q.city ?? undefined, snapshot_id },
    {
      account_id: 'guest',
      // V1 default: headful. Bundled-Chromium headless gets hard-blocked by
      // both doubao + yuanbao (ERR_CONNECTION_CLOSED / silent reject). Each
      // adapter uses system Chrome + persistent userDataDir so the login
      // cookie survives. Set PLAYWRIGHT_HEADLESS=true on the eventual
      // Xvfb-equipped Linux worker.
      headless: process.env.PLAYWRIGHT_HEADLESS === 'true',
      timeout_ms: 120_000,
    },
  );

  const sessionUrl =
    typeof (result.meta as { session_url?: unknown } | undefined)?.session_url === 'string'
      ? ((result.meta as { session_url: string }).session_url)
      : null;

  if (result.status !== 'done') {
    await client
      .from('geo_snapshots')
      .update({
        status: result.status,
        failure_reason: result.failure_reason ?? null,
        raw_response: result.raw_response ?? null,
        citation_urls: result.citation_urls ?? [],
        session_url: sessionUrl,
        meta: result.meta ?? {},
        asked_at: new Date().toISOString(),
      })
      .eq('id', snapshot_id);
    console.log(
      `[geo-snapshot] ${snapshot_id} → ${result.status} (${result.failure_reason ?? '—'})`,
    );
    return;
  }

  // Done — persist response + scan mentions.
  // D64(2026-09-11):先扫品牌词再落库,因为名次要跟 meta 一起写进同一次 update。
  const scan = scanBrandMentions(result.raw_response ?? '', vocab);
  const brandRank = computeBrandRank(result.raw_response ?? '', scan);
  // D66:扫描结果同时落在快照自己的 meta 上。
  // 为什么不只靠 citations 子表:那张表是二次 insert,失败只 console.error 就吞了,
  // 实测 100 条 done 快照里 12 条一行 citations 都没有(正文明明有品牌词)。
  // 下游「哪些题从没被提及」的判断读到的就是假 0 —— 会把已经排第 1 的题报成零曝光。
  // meta 跟 status 同一次 update 写入,不存在「主表成功子表失败」的中间态。
  const brandScan = {
    brand: scan.count_by_type.brand,
    competitor: scan.count_by_type.competitor,
    doctor: scan.count_by_type.doctor,
    distinct_terms: scan.distinct_terms,
  };

  await client
    .from('geo_snapshots')
    .update({
      status: 'done',
      raw_response: result.raw_response ?? '',
      citation_urls: result.citation_urls ?? [],
      session_url: sessionUrl,
      // V1.13 (0045): 诊断维度落库 — 前端据 sources_expander / sources_error
      // 区分「无引用面板(真实0)/ 已采集 N 条 / 采集失败」三态
      // V1.14 (D64): brand_rank = 本品牌在答案推荐榜里的名次(带板块),null = 没上榜
      meta: { ...(result.meta ?? {}), brand_rank: brandRank, brand_scan: brandScan },
      asked_at: new Date().toISOString(),
    })
    .eq('id', snapshot_id);
  if (scan.mentions.length > 0) {
    const rows = scan.mentions.map((m) => ({
      tenant_id,
      snapshot_id,
      brand_mentioned: true,
      mention_position: m.offset,
      mention_text: m.matched_span,
      vocab_id: m.vocab_id,
      term_type: m.term_type,
    }));
    const { error: cErr } = await client.from('citations').insert(rows);
    if (cErr) {
      // D66:原来这里只 console.error,整批 insert 失败就悄无声息(实测丢了 12% 快照的
      // 明细)。改成:先吼给告警通道(D49「静默路径零容忍」),再逐行重试 —— 一行坏
      // (比如 vocab 被软删导致 FK 挂)不该把同一快照其余 mentions 全带走。
      reportError(new Error(`citations batch insert failed: ${cErr.message}`), {
        scope: 'tracker.geo_snapshot.citations',
        extra: { snapshot_id, rows: rows.length },
      });
      let ok = 0;
      for (const row of rows) {
        const { error: rowErr } = await client.from('citations').insert(row);
        if (!rowErr) ok += 1;
      }
      console.error(`[geo-snapshot] citations 逐行重试:${ok}/${rows.length} 成功`);
    }
  }

  const meta = (result.meta ?? {}) as Record<string, unknown>;
  console.log(
    `[geo-snapshot] ${snapshot_id} done — ${scan.mentions.length} mentions ` +
      `(brand=${scan.count_by_type.brand} comp=${scan.count_by_type.competitor} ` +
      `doc=${scan.count_by_type.doctor}) sources=${(result.citation_urls ?? []).length} ` +
      `(expander=${meta.sources_expander ?? '—'}) total=${Date.now() - started}ms`,
  );
}

async function markFailed(snapshotId: string, reason: string): Promise<void> {
  const client = getServiceClient();
  reportError(new Error(reason), {
    scope: 'tracker.geo_snapshot',
    extra: { snapshot_id: snapshotId },
  });
  await client
    .from('geo_snapshots')
    .update({ status: 'failed', failure_reason: reason })
    .eq('id', snapshotId);
}

/**
 * 算本品牌在这条答案里的推荐名次(D64)。
 *
 * 只在「机构榜」板块里算——闸门用 brand + competitor 两类词,详见 rank.ts 里
 * isOrgRanking 的说明。返回 null 有两种情况,都属于正常:品牌没被提到,或者
 * 被提到了但不在任何编号推荐位上(比如只出现在避坑提示段)。
 */
function computeBrandRank(text: string, scan: ReturnType<typeof scanBrandMentions>) {
  const brandOffsets = scan.mentions.filter((m) => m.term_type === 'brand').map((m) => m.offset);
  if (brandOffsets.length === 0) return null;
  const orgOffsets = scan.mentions
    .filter((m) => m.term_type === 'brand' || m.term_type === 'competitor')
    .map((m) => m.offset);
  const best = bestBrandRank(text, brandOffsets, { orgOffsets });
  if (!best) return null;
  return {
    rank: best.rank,
    total_in_section: best.totalInSection,
    section_index: best.sectionIndex,
    section_title: best.sectionTitle,
    item_label: best.itemLabel,
  };
}
