/**
 * V1.10 / docs/09 cron #1 — Nightly Daily Ops draft trigger.
 *
 * Triggered by pg-boss schedule. Default 18:00 UTC = 02:00 Asia/Shanghai (next day).
 * Per-tenant flow:
 *   1. Find enabled tenants (daily_ops_settings.enabled=true).
 *   2. Skip weekend if weekend_skip.
 *   3. Acquire today's run lock via UNIQUE(tenant_id, run_date).
 *   4. Pick topics via topic-picker (auto via RPC + manual slots).
 *   5. Apply max_variants_day throttle by trimming auto picks.
 *   6. Create draft_batches + draft_batch_items (V1.9 schema, reused).
 *   7. Enqueue `content.batch_draft_item` × N (V1.9 worker handler).
 *   8. Update run.batch_draft_id + status='drafting'.
 *
 * What this job does NOT do (subsequent jobs handle these):
 *   - Wait for batch completion → V1.9 worker cascade hands off to
 *     content.variant_generate → compliance.review → auto-rewrite.
 *   - Classify readiness / 4-class buckets → cron #2 (auto-dispatch-timeout)
 *     polls drafting → awaiting_review when batch is done, then applies
 *     classify-readiness (geo-core/daily-ops).
 *   - Notify customer → cron #2 also fires email/in-app banner.
 *
 * Failure handling: per-tenant try/catch. One tenant blowing up doesn't
 * affect siblings. pg-boss retry on top-level exception (rare; we catch
 * inside the loop).
 */
import { reportError, reportEvent, VARIANT_PLATFORMS } from '@geo/shared';
import { enqueueViaSharedBoss } from '../lib/boss-ref';
import { getServiceClient } from '../lib/supabase';
import { pickTopicsForToday, type ManualSlot } from '../lib/topic-picker';

export const NIGHTLY_DRAFT_JOB = 'daily-ops.nightly-draft';

type Settings = {
  tenant_id: string;
  enabled: boolean;
  topic_count_auto: number;
  manual_slot_max: number;
  topic_source: 'questions_priority' | 'feedback_loop' | 'hybrid';
  platforms: string[];
  weekend_skip: boolean;
  max_variants_day: number;
  pending_manual_slots: unknown;
};

export async function handleNightlyDraft(): Promise<void> {
  const client = getServiceClient();

  const { data: settingsRows, error: sErr } = await client
    .from('daily_ops_settings')
    .select(
      'tenant_id, enabled, topic_count_auto, manual_slot_max, topic_source, platforms, weekend_skip, max_variants_day, pending_manual_slots',
    )
    .eq('enabled', true);

  if (sErr) {
    reportError(sErr, { scope: 'daily-ops.nightly-draft.list_settings' });
    throw sErr;
  }

  const settings = (settingsRows ?? []) as Settings[];
  if (settings.length === 0) {
    console.log('[nightly-draft] no enabled tenants, skip');
    return;
  }

  const today = formatRunDate(new Date());
  const dayOfWeek = new Date().getDay(); // 0=Sun, 6=Sat
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const s of settings) {
    try {
      // Weekend skip
      if (s.weekend_skip && isWeekend) {
        skipped++;
        continue;
      }

      const result = await processTenant(client, s, today);
      if (result === 'skipped') skipped++;
      else processed++;
    } catch (err) {
      failed++;
      reportError(err, {
        scope: 'daily-ops.nightly-draft.tenant',
        tenant_id: s.tenant_id,
        extra: { today },
      });
      // Continue with siblings
    }
  }

  reportEvent('daily-ops.nightly-draft.completed', {
    scope: 'daily-ops.nightly-draft',
    extra: { processed, skipped, failed, total: settings.length, run_date: today },
  });
  console.log(
    `[nightly-draft] done: processed=${processed} skipped=${skipped} failed=${failed} of ${settings.length}`,
  );
}

type ProcessOutcome = 'created' | 'skipped';

async function processTenant(
  client: ReturnType<typeof getServiceClient>,
  settings: Settings,
  runDate: string,
): Promise<ProcessOutcome> {
  // 1. Acquire the day's run via UNIQUE(tenant_id, run_date). If row already
  // exists, skip (cron triggered twice or admin manually created today's run).
  const { data: runInsert, error: insErr } = await client
    .from('daily_ops_runs')
    .insert({
      tenant_id: settings.tenant_id,
      run_date: runDate,
      status: 'picking_topics',
    })
    .select('id')
    .single();

  if (insErr) {
    // Likely UNIQUE violation = already ran today. Treat as skip, not error.
    if (insErr.code === '23505') {
      console.log(`[nightly-draft] ${settings.tenant_id} already has run for ${runDate}, skip`);
      return 'skipped';
    }
    throw insErr;
  }
  const runId = runInsert.id as string;

  try {
    // 2. Pick topics
    const picks = await pickTopicsForToday(client, settings);

    if (picks.picked_question_ids.length === 0 && picks.manual_slots.length === 0) {
      await markRunFailed(client, runId, 'no topics picked (questions empty + no manual slots)');
      return 'created';
    }

    // 3. Resolve platforms
    const platforms = (settings.platforms ?? []).filter((p) =>
      (VARIANT_PLATFORMS as readonly string[]).includes(p),
    );
    if (platforms.length === 0) {
      await markRunFailed(client, runId, 'no valid platforms in settings');
      return 'created';
    }

    // 4. Build topic list: auto-picked questions + manual slots
    // Manual slots may have their own platforms[] override; for V1.10 simplify
    // by using the tenant-level platforms for ALL items (auto + manual).
    // Manual slot's per-row platforms can override in V1.11 if customers ask.
    const autoTopics: Array<{ question_id: string | null; topic: string; audience: string }> =
      picks.picked_questions.map((q) => ({
        question_id: q.id,
        topic: q.text,
        audience: 'default', // V1.10: questions don't carry audience; pick a sensible default
      }));
    const manualTopics: Array<{ question_id: string | null; topic: string; audience: string }> =
      picks.manual_slots.map((m: ManualSlot) => ({
        question_id: null,
        topic: m.topic,
        audience: m.audience,
      }));
    const allTopics = [...autoTopics, ...manualTopics];

    // 5. Throttle: max_variants_day = (topics × platforms).length cap.
    // If exceeded, trim from auto picks (keep manual slots — customer intent).
    let topics = allTopics;
    const totalVariants = topics.length * platforms.length;
    if (totalVariants > settings.max_variants_day) {
      const maxTopics = Math.floor(settings.max_variants_day / platforms.length);
      const keepManual = manualTopics.slice(0, maxTopics);
      const keepAutoSpace = Math.max(maxTopics - keepManual.length, 0);
      topics = [...autoTopics.slice(0, keepAutoSpace), ...keepManual];
      reportEvent('daily-ops.nightly-draft.throttled', {
        scope: 'daily-ops.nightly-draft',
        tenant_id: settings.tenant_id,
        extra: {
          original_total_variants: totalVariants,
          max_variants_day: settings.max_variants_day,
          trimmed_to_topics: topics.length,
        },
      });
    }

    if (topics.length === 0) {
      await markRunFailed(client, runId, 'all topics trimmed by throttle');
      return 'created';
    }

    // 6. Common audience for batch (V1.9 batch_drafts.audience is a single
    // string for the whole batch). Pick the first manual slot's audience if
    // any, else 'default'. Per-item audience override is V1.11.
    const batchAudience = manualTopics[0]?.audience ?? 'default';

    // 7. Create draft_batches row (reusing V1.9 schema)
    const total = topics.length * platforms.length;
    const { data: batch, error: bErr } = await client
      .from('draft_batches')
      .insert({
        tenant_id: settings.tenant_id,
        created_by: null, // automated, no human user
        total,
        audience: batchAudience,
        platforms,
        writing_template_id: null,
        query_intent: null, // V1.10 doesn't auto-pick query intent; V1.11 can
        status: 'running',
      })
      .select('id')
      .single();
    if (bErr || !batch) {
      throw new Error(`create draft_batches failed: ${bErr?.message ?? 'unknown'}`);
    }
    const batchId = batch.id as string;

    // 8. Bulk-insert draft_batch_items
    const itemRows = topics.flatMap((t) =>
      platforms.map((platform) => ({
        batch_id: batchId,
        tenant_id: settings.tenant_id,
        question_id: t.question_id,
        topic: t.topic,
        platform,
        status: 'pending' as const,
      })),
    );
    const { data: items, error: iErr } = await client
      .from('draft_batch_items')
      .insert(itemRows)
      .select('id, topic, platform');
    if (iErr || !items) {
      // Roll back batch row to keep DB clean
      await client.from('draft_batches').delete().eq('id', batchId);
      throw new Error(`create draft_batch_items failed: ${iErr?.message ?? 'unknown'}`);
    }

    // 9. Enqueue one job per item (reuse V1.9 content.batch_draft_item)
    await Promise.all(
      items.map((it) =>
        enqueueViaSharedBoss('content.batch_draft_item', {
          batch_id: batchId,
          item_id: it.id,
          tenant_id: settings.tenant_id,
          topic: it.topic as string,
          platform: it.platform as string,
          audience: batchAudience,
          writing_template_id: null,
          query_intent: null,
          primary_query: null,
        }),
      ),
    );

    // 10. Update run row with batch_draft_id + counts.planned + status
    const { error: updErr } = await client
      .from('daily_ops_runs')
      .update({
        status: 'drafting',
        picked_question_ids: picks.picked_question_ids,
        manual_slots: picks.manual_slots,
        batch_draft_id: batchId,
        counts: {
          planned: total,
          auto_picks: autoTopics.length,
          manual_picks: manualTopics.length,
          platforms_count: platforms.length,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', runId);
    if (updErr) {
      reportError(updErr, {
        scope: 'daily-ops.nightly-draft.run_update',
        tenant_id: settings.tenant_id,
        extra: { run_id: runId, batch_id: batchId },
      });
      // Don't throw — the batch is queued, run UI just shows stale status.
      // cron #2 will re-poll and self-heal status next pass.
    }

    return 'created';
  } catch (err) {
    await markRunFailed(client, runId, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

async function markRunFailed(
  client: ReturnType<typeof getServiceClient>,
  runId: string,
  reason: string,
): Promise<void> {
  await client
    .from('daily_ops_runs')
    .update({
      status: 'failed',
      failure_reason: reason.slice(0, 500),
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', runId);
}

function formatRunDate(d: Date): string {
  // YYYY-MM-DD in Asia/Shanghai. UTC 18:00 = next day's 02:00 in CST/CST+8.
  // pg-boss runs in UTC. We want the run_date to reflect the customer's
  // business day, which starts when they wake up. Use Asia/Shanghai TZ.
  const cstOffsetMs = 8 * 3600 * 1000;
  const cst = new Date(d.getTime() + cstOffsetMs);
  return cst.toISOString().slice(0, 10);
}
