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
export async function pickTopicsForToday(
  client: SupabaseClient,
  settings: SettingsRow,
): Promise<TopicPickResult> {
  // 1. Auto pick via RPC (RLS-aware; service-role bypasses, which is what
  // cron wants — it iterates all tenants).
  const autoLimit = clamp(settings.topic_count_auto, 0, 15);
  let picked: PickedQuestion[] = [];

  if (autoLimit > 0) {
    if (
      settings.topic_source !== 'questions_priority' &&
      settings.topic_source !== 'hybrid'
    ) {
      // feedback_loop not implemented yet (V1.11 docs/08 §8). Fall back +
      // surface so we can see this flag was set early.
      reportError(
        new Error(`topic_source=${settings.topic_source} not yet implemented; falling back to questions_priority`),
        {
          scope: 'daily-ops.topic-picker.fallback',
          tenant_id: settings.tenant_id,
          extra: { configured_source: settings.topic_source },
        },
      );
    }

    const { data, error } = await client.rpc('daily_ops_pick_topics', {
      p_tenant_id: settings.tenant_id,
      p_limit: autoLimit,
      p_exclude_days: 7,
    });

    if (error) {
      reportError(error, {
        scope: 'daily-ops.topic-picker.rpc_failed',
        tenant_id: settings.tenant_id,
        extra: { autoLimit },
      });
      // Hard fail — without auto picks the run is meaningless. Let cron
      // catch + mark run.status='failed'.
      throw new Error(`pick_topics RPC failed: ${error.message}`);
    }

    picked = (data ?? []) as PickedQuestion[];
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
