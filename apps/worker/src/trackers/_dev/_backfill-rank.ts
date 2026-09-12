/**
 * 回填历史快照的 brand_rank + brand_scan,并修补漏写的 citations 明细(D64/D66)。
 *
 * geo-snapshot.ts 从今天起会给新快照自动算名次,但库里已有的历史快照没有。
 * 这个脚本把它们补上,顺便算出「上榜率 / 第 1 名占比 / 平均名次」三个对外能讲的数。
 *
 * 只改 geo_snapshots.meta 里的 brand_rank 这一个 key,其余 meta 原样保留。
 * 幂等:重跑会按当前解析器重算覆盖,不会重复写。
 *
 * Usage:
 *   set -a && . ./.env && set +a
 *   pnpm --filter @geo/worker exec tsx src/trackers/_dev/_backfill-rank.ts [tenant_slug] [--apply]
 *
 * 不带 --apply = 干跑,只统计不写库。
 */
import { bestBrandRank, scanBrandMentions } from '@geo/geo-core';
import { getServiceClient } from '../../lib/supabase';

async function main() {
  const slug = process.argv[2] ?? 'songshu';
  const apply = process.argv.includes('--apply');
  const client = getServiceClient();

  const { data: tenants } = await client.from('tenants').select('id, slug').eq('slug', slug).limit(1);
  const tenant = tenants?.[0];
  if (!tenant) throw new Error(`tenant slug='${slug}' not found`);

  const { data: vocabRows } = await client
    .from('brand_vocab')
    .select('id, term, term_type, aliases')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null);
  if (!vocabRows?.length) throw new Error('brand_vocab is empty');
  const vocab = vocabRows.map((v) => ({ ...v, aliases: v.aliases ?? [] }));

  const { data: snaps, error } = await client
    .from('geo_snapshots')
    .select('id, tenant_id, raw_response, meta, question_id')
    .eq('tenant_id', tenant.id)
    .eq('status', 'done')
    .order('asked_at', { ascending: false })
    .limit(1000);
  if (error) throw new Error(`snapshot query failed: ${JSON.stringify(error)}`);
  if (!snaps?.length) throw new Error('没有 done 快照');

  const { data: qRows } = await client.from('questions').select('id, text').eq('tenant_id', tenant.id);
  const qText = new Map((qRows ?? []).map((q) => [q.id, q.text as string]));

  let mentioned = 0;
  let ranked = 0;
  let first = 0;
  let rankSum = 0;
  let written = 0;
  let citationsRepaired = 0;
  let citationsMissing = 0;
  const top: string[] = [];

  for (const s of snaps) {
    const text: string = s.raw_response ?? '';
    const scan = scanBrandMentions(text, vocab);
    const brandOffsets = scan.mentions.filter((m) => m.term_type === 'brand').map((m) => m.offset);
    const orgOffsets = scan.mentions
      .filter((m) => m.term_type === 'brand' || m.term_type === 'competitor')
      .map((m) => m.offset);

    let payload: Record<string, unknown> | null = null;
    if (brandOffsets.length > 0) {
      mentioned += 1;
      const best = bestBrandRank(text, brandOffsets, { orgOffsets });
      if (best) {
        ranked += 1;
        rankSum += best.rank;
        if (best.rank === 1) {
          first += 1;
          if (top.length < 12) top.push(`  #1/${best.totalInSection}  ${qText.get(s.question_id) ?? s.id}`);
        }
        payload = {
          rank: best.rank,
          total_in_section: best.totalInSection,
          section_index: best.sectionIndex,
          section_title: best.sectionTitle,
          item_label: best.itemLabel,
        };
      }
    }

    const brandScan = {
      brand: scan.count_by_type.brand,
      competitor: scan.count_by_type.competitor,
      doctor: scan.count_by_type.doctor,
      distinct_terms: scan.distinct_terms,
    };

    // D66:补 citations 明细。实测 100 条 done 快照里 12 条一行都没有(批量 insert
    // 失败被 console.error 吞了),导致下游「从没被提及」判断读到假 0。
    if (scan.mentions.length > 0) {
      const { count } = await client
        .from('citations')
        .select('id', { count: 'exact', head: true })
        .eq('snapshot_id', s.id);
      if ((count ?? 0) === 0) {
        citationsMissing += 1;
        if (apply) {
          const rows = scan.mentions.map((m) => ({
            tenant_id: s.tenant_id,
            snapshot_id: s.id,
            brand_mentioned: true,
            mention_position: m.offset,
            mention_text: m.matched_span,
            vocab_id: m.vocab_id,
            term_type: m.term_type,
          }));
          let ok = 0;
          for (const row of rows) {
            const { error: rErr } = await client.from('citations').insert(row);
            if (!rErr) ok += 1;
          }
          if (ok > 0) citationsRepaired += 1;
        }
      }
    }

    if (apply) {
      const meta = (s.meta ?? {}) as Record<string, unknown>;
      const { error: uErr } = await client
        .from('geo_snapshots')
        .update({ meta: { ...meta, brand_rank: payload, brand_scan: brandScan } })
        .eq('id', s.id);
      if (uErr) console.error(`[backfill] ${s.id}: ${uErr.message}`);
      else written += 1;
    }
  }

  console.log(`\n${apply ? '已写库' : '干跑(未写库,加 --apply 才写)'}`);
  console.log(`done 快照总数:      ${snaps.length}`);
  console.log(`品牌被提及:         ${mentioned}`);
  console.log(`解析出推荐名次:     ${ranked}`);
  console.log(`其中排第 1 的:      ${first}  (占上榜的 ${((first / Math.max(ranked, 1)) * 100).toFixed(0)}%)`);
  console.log(`平均名次:           ${ranked ? (rankSum / ranked).toFixed(2) : '—'}`);
  console.log(`citations 缺失的快照: ${citationsMissing}`);
  if (apply) {
    console.log(`meta 已更新行数:    ${written}`);
    console.log(`citations 已修补:   ${citationsRepaired}`);
  }
  if (top.length) console.log(`\n拿到第 1 的题(抽样):\n${top.join('\n')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
