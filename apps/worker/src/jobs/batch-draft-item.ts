/**
 * V1.9 — Batch AI-draft single-item executor.
 *
 * Triggered by createAiDraftsBatch (server action). One job per
 * (topic, platform) pair. teamSize=5 caps concurrent LLM calls.
 *
 * Flow:
 *   1. Mark item status='running'
 *   2. HTTP POST /api/internal/ai-draft → web reuses runAiDraft core
 *   3. On 200: write item.content_item_id + status='succeeded',
 *      bump batch.succeeded, then enqueue content.variant_generate so the
 *      content_item produces a dispatchable content_variants row.
 *   4. On non-200 / network err: write item.error_msg + status='failed',
 *      bump batch.failed.
 *   5. After bump, check if (succeeded + failed == total) → roll up
 *      batch.status to completed/partial/failed.
 *
 * Failure handling: a thrown error from this handler causes pg-boss to retry
 * (retryLimit=3 set globally in worker entry). We DO bump batch counters
 * before throwing so retries don't keep adding +1.
 */
import { reportError } from '@geo/shared';
import { enqueueViaSharedBoss } from '../lib/boss-ref';
import { getServiceClient } from '../lib/supabase';

export type BatchDraftItemJob = {
  batch_id: string;
  item_id: string;
  tenant_id: string;
  topic: string;
  platform: string;
  audience: string;
  writing_template_id?: string | null;
  keyword_ids?: string[];
  /** D21 / ADR 009 P3-3 — pass-through to internal AI draft API. */
  query_intent?: string | null;
  primary_query?: string | null;
  /**
   * V1.11 S3 fix: source question id (when the topic came from questions table
   * via nightly-draft). Written into `content_items.target_questions[]` on
   * success so RPC `daily_ops_pick_topics` (last_used_at via target_questions
   * back-reference) can exclude it from future picks. Without this field the
   * question is invisible to recency tracking and gets re-picked every night.
   */
  question_id?: string | null;
};

// 默认 4 min。2026-09-11:备用通道(claudeproxy → claude CLI)真实起草 prompt 实测 >180s,
// 欠费期间在 .env 设 INTERNAL_API_TIMEOUT_MS=600000,并同步 AI_DRAFT_LLM_TIMEOUT_MS < 本值。
const INTERNAL_API_TIMEOUT_MS = Number(process.env.INTERNAL_API_TIMEOUT_MS) || 240_000;

function getInternalApiUrl(): string {
  // Prefer INTERNAL_API_BASE (loopback) — worker lives on the same host as
  // web in self-hosted setups, so it should NOT route fetch traffic through
  // the public IP (Caddy / hairpin NAT / cloud egress can drop or stall it).
  // Default loopback. Fall back to NEXT_PUBLIC_APP_URL only if explicitly set.
  const base =
    process.env.INTERNAL_API_BASE ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://127.0.0.1:3000';
  return `${base.replace(/\/$/, '')}/api/internal/ai-draft`;
}

function getInternalSecret(): string {
  const secret = process.env.DRAFT_INTERNAL_SECRET;
  if (!secret) throw new Error('DRAFT_INTERNAL_SECRET not set');
  return secret;
}

export async function handleBatchDraftItem(data: BatchDraftItemJob): Promise<void> {
  const client = getServiceClient();
  const started = Date.now();

  // 1. Mark running. If already succeeded (rare retry edge case), short-circuit.
  const { data: existing, error: rErr } = await client
    .from('draft_batch_items')
    .select('status, attempts')
    .eq('id', data.item_id)
    .single();
  if (rErr || !existing) {
    console.error(`[batch-draft-item] item ${data.item_id} not found:`, rErr?.message);
    return;
  }
  if (existing.status === 'succeeded') {
    console.log(`[batch-draft-item] item ${data.item_id} already succeeded, skipping`);
    return;
  }
  await client
    .from('draft_batch_items')
    .update({
      status: 'running',
      attempts: (existing.attempts ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', data.item_id);

  // 2. Call internal API
  let succeeded = false;
  let contentItemId: string | undefined;
  let errorMsg: string | undefined;
  // D76:认领窗口的起点 —— 服务端若已写库,那条记录一定晚于这个时刻
  const requestStartedAt = new Date().toISOString();
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), INTERNAL_API_TIMEOUT_MS);
    const resp = await fetch(getInternalApiUrl(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': getInternalSecret(),
      },
      body: JSON.stringify({
        tenant_id: data.tenant_id,
        topic: data.topic,
        audience: data.audience,
        platform: data.platform,
        writing_template_id: data.writing_template_id ?? null,
        keyword_ids: data.keyword_ids ?? [],
        // D21 — only forwarded when batch creator selected an intent
        query_intent: data.query_intent ?? undefined,
        primary_query: data.primary_query ?? undefined,
      }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timeout));

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      errorMsg = `HTTP ${resp.status}: ${txt.slice(0, 300)}`;
    } else {
      const json = (await resp.json()) as { content_item_id?: string; error?: string };
      if (json.content_item_id) {
        contentItemId = json.content_item_id;
        succeeded = true;
      } else {
        errorMsg = json.error ?? 'API returned no content_item_id';
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Node 22 fetch undici wraps real network error in err.cause — pull it out
    // so we see ECONNREFUSED / ENOTFOUND / EHOSTUNREACH instead of just
    // "fetch failed" surfacing to the UI.
    const cause =
      err instanceof Error && 'cause' in err && err.cause
        ? ` cause=${err.cause instanceof Error ? err.cause.message : String(err.cause)}`
        : '';
    errorMsg = `${msg}${cause}`;
    // Verbose stderr so we can debug worker fetch issues even when
    // succeeded/failed counters obscure the real network error.
    console.error(
      `[batch-draft-item] FETCH EXC item=${data.item_id} url=${getInternalApiUrl()} msg="${msg}"${cause}`,
    );
  }

  // 2b. D76(2026-09-19)超时认领 —— 修「孤儿稿」。
  //
  // 下面所有收尾动作(回填 target_questions、投 variant_generate)都挂在
  // `succeeded && contentItemId` 上,而那个 id 只能从 HTTP 200 的响应体里拿。
  // 于是只要客户端超时(Headers Timeout 这几天天天发生),**服务端其实已经把稿子
  // 写进库了,我们却什么都不知道**:没有变体 → 永远不可派单;target_questions 空
  // → 选题器以为这题没用过 → 明晚再抽一次、再花一次钱。
  // 实测后果:132 条孤儿稿(7-20 至 9-18),704 条内容只有 270 个不同标题,
  // 同一道题最多生成过 13 份。
  //
  // 修法:失败路径上回头去库里认领。判据三条同时成立才认 ——
  // 本请求发出之后创建、平台一致、且还没被任何 draft_batch_item 认领过。
  // 最后一条是防并发误认的关键(DRAFT_CONCURRENCY 可能 >1)。
  if (!succeeded && !contentItemId && requestStartedAt) {
    const { data: candidates } = await client
      .from('content_items')
      // 注意:content_items **没有** platform 列(平台在 variants 上),
      // 所以判据只能是 租户 + 时间窗 + 未被认领。
      .select('id, created_at')
      .eq('tenant_id', data.tenant_id)
      .gte('created_at', requestStartedAt)
      .order('created_at', { ascending: true })
      .limit(10);
    for (const cand of candidates ?? []) {
      const { count } = await client
        .from('draft_batch_items')
        .select('id', { count: 'exact', head: true })
        .eq('content_item_id', cand.id as string);
      if ((count ?? 0) === 0) {
        contentItemId = cand.id as string;
        succeeded = true;
        errorMsg = undefined;
        console.log(
          `[batch-draft-item] 超时认领成功 item=${data.item_id} → content_item=${contentItemId}` +
            `(服务端已写库,客户端没收到响应)`,
        );
        break;
      }
    }
  }

  // 3. Write item terminal state
  if (succeeded && contentItemId) {
    await client
      .from('draft_batch_items')
      .update({
        status: 'succeeded',
        content_item_id: contentItemId,
        error_msg: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.item_id);

    // V1.11 S3 fix: back-link the source question so recency dedupe works.
    // Without this, daily_ops_pick_topics never sees last_used_at and picks
    // the same top-priority questions every night (observed 2026-05-20: same
    // 5 question ids in 2 consecutive runs).
    if (data.question_id) {
      const { error: tqErr } = await client
        .from('content_items')
        .update({ target_questions: [data.question_id] })
        .eq('id', contentItemId);
      if (tqErr) {
        // Non-fatal — log + continue. Re-picking is still better than failing
        // the item; ops can manually fix target_questions later.
        console.warn(
          `[batch-draft-item] target_questions backfill failed item=${data.item_id}: ${tqErr.message}`,
        );
      }
    }

    // Enqueue variant_generate so dispatch can pick it up. We pass the single
    // platform this item was drafted for; later the operator can run more
    // variants from the content/[id] page if they want cross-platform reuse.
    try {
      await enqueueViaSharedBoss('content.variant_generate', {
        content_item_id: contentItemId,
        tenant_id: data.tenant_id,
        platforms: [data.platform],
      });
    } catch (err) {
      // Don't fail the whole batch item just because variant enqueue glitched —
      // the operator can manually re-trigger from /content/[id].
      reportError(err, {
        scope: 'batch-draft-item.variant_enqueue',
        tenant_id: data.tenant_id,
        extra: { item_id: data.item_id, batch_id: data.batch_id },
      });
    }
  } else {
    // Retryable detection — if the upstream signaled a transient (LLM
    // timeout / abort) AND we have retries left, THROW so pg-boss
    // re-schedules. Don't write `failed` yet — keep status='running' so
    // the UI shows "进行中…" while retry happens.
    const isRetryable = errorMsg
      ? /超过 \d+ 秒|abort|timeout|HTTP 50[234]/i.test(errorMsg)
      : false;
    const attemptsSoFar = (existing.attempts ?? 0) + 1; // we just bumped above
    if (isRetryable && attemptsSoFar < 3) {
      console.log(
        `[batch-draft-item] retryable failure (attempt ${attemptsSoFar}/3) item=${data.item_id} — throwing for pg-boss retry`,
      );
      // Reset to 'pending' so progress UI shows it's queued for retry, not
      // stuck mid-run. attempts stays bumped so we converge.
      await client
        .from('draft_batch_items')
        .update({ status: 'pending', error_msg: errorMsg, updated_at: new Date().toISOString() })
        .eq('id', data.item_id);
      throw new Error(`Retryable: ${errorMsg ?? 'unknown'}`);
    }

    await client
      .from('draft_batch_items')
      .update({
        status: 'failed',
        error_msg: errorMsg ?? 'unknown error',
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.item_id);
  }

  // 4. Roll up batch counters from items table. Re-counting from items is
  //    safe under concurrency because items.status is single-writer per row.
  await rollupBatchStatus(client, data.batch_id);

  console.log(
    `[batch-draft-item] batch=${data.batch_id} item=${data.item_id} ` +
      `${succeeded ? 'OK' : 'FAIL'} dur=${Date.now() - started}ms` +
      (errorMsg ? ` err="${errorMsg.slice(0, 100)}"` : ''),
  );
}

/**
 * Atomic-ish status rollup: read current counts, write final status when
 * succeeded+failed == total. Status='running' guard prevents double-write.
 */
async function rollupBatchStatus(
  client: ReturnType<typeof getServiceClient>,
  batchId: string,
): Promise<void> {
  const { data: batch } = await client
    .from('draft_batches')
    .select('total, succeeded, failed, status')
    .eq('id', batchId)
    .single();
  if (!batch || batch.status !== 'running') return;

  // Recount from items in case the RPC missed (idempotent safety net).
  const { data: items } = await client
    .from('draft_batch_items')
    .select('status')
    .eq('batch_id', batchId);
  if (!items) return;

  const succeeded = items.filter((i) => i.status === 'succeeded').length;
  const failed = items.filter((i) => i.status === 'failed').length;

  if (succeeded + failed < (batch.total as number)) {
    // Not done yet — just keep the live counters fresh.
    await client
      .from('draft_batches')
      .update({ succeeded, failed })
      .eq('id', batchId)
      .eq('status', 'running');
    return;
  }

  // Terminal: roll up status.
  let finalStatus: 'completed' | 'partial' | 'failed';
  if (failed === 0) finalStatus = 'completed';
  else if (succeeded === 0) finalStatus = 'failed';
  else finalStatus = 'partial';

  await client
    .from('draft_batches')
    .update({
      succeeded,
      failed,
      status: finalStatus,
      completed_at: new Date().toISOString(),
    })
    .eq('id', batchId)
    .eq('status', 'running');
}
