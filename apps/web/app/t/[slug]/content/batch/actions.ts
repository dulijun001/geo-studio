/**
 * Batch AI-draft (V1.9).
 *
 * Submit N (questions) × M (platforms) drafts in one click. Each
 * (question, platform) pair becomes a `draft_batch_items` row + one pg-boss
 * job (`content.batch_draft_item`). Worker concurrency teamSize=5 caps LLM
 * QPS to safe water-line for Doubao Pro.
 *
 * Why N×M items rather than 1 item per question + worker fans out:
 *   - per-platform retry + visibility from the UI, not "this whole question
 *     batch failed"
 *   - the existing variant-generate path already handles "one content_item
 *     → N variants for N platforms", but THAT path improves a master draft
 *     with platform-flavored *rewrites* of the same content. For a real
 *     30-staff-matrix push we want 30 *different topics* across 3 platforms,
 *     not 1 topic re-styled 3 ways.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { VARIANT_PLATFORMS, type VariantPlatform } from '@geo/shared';

type Platform = VariantPlatform;
const ALLOWED_PLATFORMS = VARIANT_PLATFORMS;
import { getCurrentUser } from '@/lib/current-user';
import { enqueueJob } from '@/lib/pgboss';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { requireRole } from '@/lib/tenant';

export type CreateBatchInput = {
  /** Either question_ids OR custom_topics (or both) — must yield at least 1 item. */
  question_ids: string[];
  custom_topics?: string[];
  platforms: Platform[];
  audience: string;
  writing_template_id?: string | null;
  /**
   * D21 / ADR 009 P3-3 — batch-wide query intent. NULL = legacy V1.9 path.
   * Non-NULL = each item passes this intent + its topic as primary_query
   * into prompt-builder's intentBlock for D21 anchoring.
   */
  query_intent?:
    | 'what_is'
    | 'is_it_true'
    | 'which_is_better'
    | 'why_happens'
    | 'what_to_do'
    | 'how_long'
    | 'when_to_seek_care'
    | 'how_to_choose_local';
};

export type CreateBatchResult = {
  batch_id: string;
  total: number;
};

const MAX_QUESTIONS_PER_BATCH = 15;  // 15 题 × 3 平台 = 45 任务上限
const MAX_PLATFORMS_PER_BATCH = 5;

export async function createAiDraftsBatch(
  tenantSlug: string,
  input: CreateBatchInput,
): Promise<CreateBatchResult> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);

  const platforms = input.platforms.filter((p): p is Platform =>
    (ALLOWED_PLATFORMS as readonly string[]).includes(p),
  );
  if (platforms.length === 0) throw new Error('请至少选 1 个目标平台');
  if (platforms.length > MAX_PLATFORMS_PER_BATCH) {
    throw new Error(`最多 ${MAX_PLATFORMS_PER_BATCH} 个平台`);
  }
  const audience = input.audience.trim();
  if (!audience) throw new Error('请填写受众');

  // Use service client — admin user (HMAC cookie) doesn't have Supabase
  // session, so user-bound RLS would return zero rows.
  const service = getSupabaseServiceClient();

  // Resolve topics: load question rows for question_ids; merge with custom_topics.
  const topics: Array<{ question_id: string | null; topic: string }> = [];
  if (input.question_ids?.length) {
    if (input.question_ids.length > MAX_QUESTIONS_PER_BATCH) {
      throw new Error(`一次最多选 ${MAX_QUESTIONS_PER_BATCH} 个问题`);
    }
    const { data: questions, error: qErr } = await service
      .from('questions')
      .select('id, text')
      .in('id', input.question_ids)
      .eq('tenant_id', tenant.id)
      .is('deleted_at', null);
    if (qErr) throw new Error(`读取问题失败: ${qErr.message}`);
    for (const q of questions ?? []) {
      topics.push({ question_id: q.id, topic: q.text as string });
    }
  }
  for (const t of input.custom_topics ?? []) {
    const trimmed = t.trim();
    if (trimmed.length >= 2) topics.push({ question_id: null, topic: trimmed });
  }
  if (topics.length === 0) throw new Error('请选择问题或填写自定义主题');
  if (topics.length > MAX_QUESTIONS_PER_BATCH) {
    throw new Error(`一次最多 ${MAX_QUESTIONS_PER_BATCH} 个主题(含自定义)`);
  }

  const total = topics.length * platforms.length;

  // 1. Create batch row
  const user = await getCurrentUser();
  const { data: batch, error: bErr } = await service
    .from('draft_batches')
    .insert({
      tenant_id: tenant.id,
      created_by: user?.id ?? null,
      total,
      audience,
      platforms,
      writing_template_id: input.writing_template_id ?? null,
      query_intent: input.query_intent ?? null,
      status: 'running',
    })
    .select('id')
    .single();
  if (bErr || !batch) throw new Error(`创建 batch 失败: ${bErr?.message}`);

  // 2. Bulk-insert items (one row per topic × platform)
  const itemRows = topics.flatMap((t) =>
    platforms.map((platform) => ({
      batch_id: batch.id,
      tenant_id: tenant.id,
      question_id: t.question_id,
      topic: t.topic,
      platform,
      status: 'pending' as const,
    })),
  );
  const { data: items, error: iErr } = await service
    .from('draft_batch_items')
    .insert(itemRows)
    .select('id, topic, platform');
  if (iErr || !items) {
    // Roll back the batch row so we don't leave a stuck container
    await service.from('draft_batches').delete().eq('id', batch.id);
    throw new Error(`创建 items 失败: ${iErr?.message}`);
  }

  // 3. Enqueue one boss job per item via the singleton pool
  await Promise.all(
    items.map((it) =>
      enqueueJob('content.batch_draft_item', {
        batch_id: batch.id,
        item_id: it.id,
        tenant_id: tenant.id,
        topic: it.topic,
        platform: it.platform,
        audience,
        writing_template_id: input.writing_template_id ?? null,
        // D21 — pass through to worker so it lands in the internal API call.
        // primary_query defaults to the item's topic (the question text IS
        // the surface form the reader would search for).
        query_intent: input.query_intent ?? null,
        primary_query: input.query_intent ? it.topic : null,
      }),
    ),
  );

  revalidatePath(`/t/${tenantSlug}/content`);
  return { batch_id: batch.id, total };
}

/**
 * Re-enqueue one failed item. UI shows a "重试" button next to each failed
 * item in the realtime progress view.
 */
export async function retryBatchItem(
  tenantSlug: string,
  itemId: string,
): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const service = getSupabaseServiceClient();

  const { data: item, error } = await service
    .from('draft_batch_items')
    .select('id, batch_id, tenant_id, topic, platform, status')
    .eq('id', itemId)
    .single();
  if (error || !item) throw new Error('item 不存在');
  if (item.tenant_id !== tenant.id) throw new Error('Tenant mismatch');
  if (item.status !== 'failed') throw new Error('只能重试失败的 item');

  // Reset to pending; worker will mark running → succeeded/failed.
  await service
    .from('draft_batch_items')
    .update({ status: 'pending', error_msg: null, updated_at: new Date().toISOString() })
    .eq('id', itemId);

  // Read the batch's audience + writing_template_id (they may have changed?
  // No — they're frozen at batch create time. But fetching them here keeps
  // job payload self-contained.)
  const { data: batch } = await service
    .from('draft_batches')
    .select('audience, writing_template_id')
    .eq('id', item.batch_id)
    .single();

  await enqueueJob('content.batch_draft_item', {
    batch_id: item.batch_id,
    item_id: item.id,
    tenant_id: tenant.id,
    topic: item.topic,
    platform: item.platform,
    audience: batch?.audience ?? '通用',
    writing_template_id: batch?.writing_template_id ?? null,
  });
  revalidatePath(`/t/${tenantSlug}/content/batch/${item.batch_id}`);
}
