/**
 * V1.10 / docs/09 — Topic picker (混合 5 抽 + 2 手填位).
 *
 * Called by `nightly-draft` cron (T3). Pure-ish: only reads questions +
 * settings, no mutation. Returns picked_question_ids + manual_slots ready
 * to be persisted into `daily_ops_runs`.
 *
 * Algorithm (D-Ops-9 hybrid):
 *   1. Auto pick: call RPC `daily_ops_pick_topics` (priority desc + recency).
 *   2. Manual slots: read `settings.pending_manual_slots`, validate shape,
 *      pass through. Empty array = no manual contribution.
 *
 * Selection limits are honored:
 *   - `settings.topic_count_auto` (0..15, default 5)
 *   - `settings.manual_slot_max`  (0..5,  default 2)
 *
 * Variant cap (`settings.max_variants_day`) is NOT enforced here — the cron
 * checks total variant count (auto + manual) × platforms.length before
 * enqueueing the batch, and may spill into next day's run.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { reportError } from '@geo/shared';

/** Shape of a single auto-picked question (row from RPC `daily_ops_pick_topics`). */
export type PickedQuestion = {
  id: string;
  text: string;
  intent: string | null;
  priority: number;
  last_used_at: string | null;
};

/** Shape of a manual slot (validated from settings.pending_manual_slots jsonb). */
export type ManualSlot = {
  topic: string;
  audience: string;
  platforms: string[];
};

export type TopicPickResult = {
  picked_question_ids: string[];
  /** Full meta for telemetry / counts.planned in daily_ops_runs.counts */
  picked_questions: PickedQuestion[];
  manual_slots: ManualSlot[];
};

type SettingsRow = {
  tenant_id: string;
  topic_count_auto: number;
  manual_slot_max: number;
  pending_manual_slots: unknown;
  topic_source: 'questions_priority' | 'feedback_loop' | 'hybrid';
};

/**
 * Pick today's topics for a tenant. Returns auto picks + sanitized manual slots.
 *
 * `topic_source`:
 *   - questions_priority (V1.10 default): auto = RPC priority+recency, manual = settings
 *   - feedback_loop      (V1.11, docs/08 §8 断点 1): swap auto picker to zero-citation queries
 *   - hybrid             (V2): mix half-half
 *
 * For V1.10 only questions_priority is wired; others fall back to it with
 * a reportEvent so we can see when tenants flip the flag prematurely.
 */
async function pickCompetitorLostQuestions(
  client: SupabaseClient,
  tenantId: string,
  limit: number,
  excludeDays = 7,
): Promise<PickedQuestion[]> {
  try {
    const { data: rawSnapshots, error: snapErr } = await client
      .from('geo_snapshots')
      .select('question_id, raw_response')
      .eq('tenant_id', tenantId)
      .eq('status', 'done');

    if (snapErr || !rawSnapshots) return [];

    const compRegex = /柏德|团圆|德韩|拜博|美奥|蓝橙|韩美|长鹏/;
    const lostQIds = new Set<string>();
    for (const s of rawSnapshots) {
      const text = (s.raw_response as string) || '';
      if (compRegex.test(text) && !text.includes('松鼠')) {
        lostQIds.add(s.question_id as string);
      }
    }

    if (lostQIds.size === 0) return [];

    const cutoff = new Date(Date.now() - excludeDays * 86400 * 1000).toISOString();
    const { data: recentItems } = await client
      .from('content_items')
      .select('target_questions, created_at')
      .eq('tenant_id', tenantId)
      .gte('created_at', cutoff)
      .is('deleted_at', null);

    const recentlyUsedQIds = new Set<string>();
    for (const item of recentItems ?? []) {
      const tqs = (item.target_questions as string[]) ?? [];
      for (const qid of tqs) recentlyUsedQIds.add(qid);
    }

    const candidateIds = Array.from(lostQIds).filter((id) => !recentlyUsedQIds.has(id));
    if (candidateIds.length === 0) return [];

    const { data: qRows, error: qErr } = await client
      .from('questions')
      .select('id, text, intent, priority')
      .eq('tenant_id', tenantId)
      .in('id', candidateIds)
      .eq('active', true)
      .is('deleted_at', null)
      .order('priority', { ascending: false })
      .limit(limit);

    if (qErr || !qRows) return [];

    return qRows.map((q: any) => ({
      id: q.id,
      text: q.text,
      intent: q.intent ?? null,
      priority: q.priority ?? 10,
      last_used_at: null,
    }));
  } catch (err) {
    console.error('[topic-picker] pickCompetitorLostQuestions error:', err);
    return [];
  }
}

export async function pickTopicsForToday(
  client: SupabaseClient,
  settings: SettingsRow,
): Promise<TopicPickResult> {
  // 1. Auto pick: prioritize competitor-lost queries first, then fill with RPC
  const autoLimit = clamp(settings.topic_count_auto, 0, 15);
  let picked: PickedQuestion[] = [];

  if (autoLimit > 0) {
    const competitorLost = await pickCompetitorLostQuestions(
      client,
      settings.tenant_id,
      autoLimit,
      7,
    );
    const existingIds = new Set(competitorLost.map((q) => q.id));

    const remainingLimit = autoLimit - competitorLost.length;
    let rpcPicked: PickedQuestion[] = [];

    if (remainingLimit > 0) {
      const { data, error } = await client.rpc('daily_ops_pick_topics', {
        p_tenant_id: settings.tenant_id,
        p_limit: autoLimit,
        p_exclude_days: 7,
      });

      if (error && competitorLost.length === 0) {
        reportError(error, {
          scope: 'daily-ops.topic-picker.rpc_failed',
          tenant_id: settings.tenant_id,
          extra: { autoLimit },
        });
        throw new Error(`pick_topics RPC failed: ${error.message}`);
      }

      if (data) {
        rpcPicked = (data as PickedQuestion[])
          .filter((q) => !existingIds.has(q.id))
          .slice(0, remainingLimit);
      }
    }

    picked = [...competitorLost, ...rpcPicked];
  }

  // 2. Manual slots: validate shape, clamp count.
  const manualLimit = clamp(settings.manual_slot_max, 0, 5);
  const manual_slots = sanitizeManualSlots(settings.pending_manual_slots, manualLimit);

  return {
    picked_question_ids: picked.map((p) => p.id),
    picked_questions: picked,
    manual_slots,
  };
}

/**
 * Validate jsonb pending_manual_slots into typed ManualSlot[]. Rejects rows
 * that are missing topic / audience / non-empty platforms. Soft-trim to
 * `manualLimit`. Garbage in → empty array out, no exception (cron should
 * continue with auto picks).
 */
export function sanitizeManualSlots(raw: unknown, manualLimit: number): ManualSlot[] {
  if (!Array.isArray(raw)) return [];
  const result: ManualSlot[] = [];
  for (const item of raw) {
    if (result.length >= manualLimit) break;
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const topic = typeof obj.topic === 'string' ? obj.topic.trim() : '';
    const audience = typeof obj.audience === 'string' ? obj.audience.trim() : '';
    const platforms = Array.isArray(obj.platforms)
      ? obj.platforms.filter((p): p is string => typeof p === 'string' && p.length > 0)
      : [];
    if (topic.length < 2 || audience.length < 1 || platforms.length === 0) continue;
    result.push({ topic, audience, platforms });
  }
  return result;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
