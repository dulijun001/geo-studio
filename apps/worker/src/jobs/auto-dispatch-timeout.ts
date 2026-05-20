/**
 * V1.10 / docs/09 cron #2 — Auto-dispatch timeout poller.
 *
 * Polled every 30 min by pg-boss. Two responsibilities:
 *
 *   1. drafting → awaiting_review: when the V1.9 batch_drafts attached to a
 *      run reaches terminal status (completed/partial/failed), backfill
 *      daily_run_id on all variants produced by it, compute the green/yellow/
 *      red/black counts via classify-readiness, then advance the run.
 *
 *   2. awaiting_review → auto_dispatched_partial: when timeout_hours have
 *      elapsed since notified_at, the run goes into auto-dispatch state.
 *      Green variants stay status='draft' but are marked dispatchable; the
 *      operator still has to click "批量派单" on /today (V1.10 limitation).
 *      The full "auto-write-to-publish_tasks" hop will arrive in V1.11 when
 *      dispatchToday is refactored to be service-callable.
 *
 * Failure handling: per-run try/catch; one stuck run doesn't block siblings.
 * pg-boss retry on top-level exception.
 */
import { classifyVariant, countByClass, type VariantReadinessInput } from '@geo/geo-core';
import { reportError, reportEvent } from '@geo/shared';
import { notifyAwaitingReview } from '../lib/daily-ops-notify';
import { getServiceClient } from '../lib/supabase';

export const AUTO_DISPATCH_TIMEOUT_JOB = 'daily-ops.auto-dispatch-timeout';

type RunRow = {
  id: string;
  tenant_id: string;
  run_date: string;
  status: string;
  batch_draft_id: string | null;
  notified_at: string | null;
};

type SettingsLite = {
  tenant_id: string;
  timeout_hours: number;
  notify_channels: string[];
  notify_email: string | null;
};

export async function handleAutoDispatchTimeout(): Promise<void> {
  const client = getServiceClient();

  const { data: runs, error } = await client
    .from('daily_ops_runs')
    .select('id, tenant_id, run_date, status, batch_draft_id, notified_at')
    .in('status', ['drafting', 'awaiting_review'])
    .is('deleted_at', null);

  if (error) {
    reportError(error, { scope: 'daily-ops.auto-dispatch-timeout.list_runs' });
    throw error;
  }

  if (!runs || runs.length === 0) {
    console.log('[auto-dispatch-timeout] no runs to advance');
    return;
  }

  let advanced = 0;
  let unchanged = 0;
  let failed = 0;

  for (const run of runs as RunRow[]) {
    try {
      const moved = await advanceRun(client, run);
      if (moved) advanced++;
      else unchanged++;
    } catch (err) {
      failed++;
      reportError(err, {
        scope: 'daily-ops.auto-dispatch-timeout.run',
        tenant_id: run.tenant_id,
        extra: { run_id: run.id, status: run.status },
      });
    }
  }

  reportEvent('daily-ops.auto-dispatch-timeout.completed', {
    scope: 'daily-ops.auto-dispatch-timeout',
    extra: { advanced, unchanged, failed, total: runs.length },
  });
  console.log(
    `[auto-dispatch-timeout] advanced=${advanced} unchanged=${unchanged} failed=${failed} of ${runs.length}`,
  );
}

async function advanceRun(
  client: ReturnType<typeof getServiceClient>,
  run: RunRow,
): Promise<boolean> {
  if (run.status === 'drafting') {
    return await advanceDraftingToAwaiting(client, run);
  }
  if (run.status === 'awaiting_review') {
    return await advanceAwaitingToDispatch(client, run);
  }
  return false;
}

/**
 * Stage 1: drafting → awaiting_review.
 * Pre-conditions: associated draft_batch reached terminal status.
 */
async function advanceDraftingToAwaiting(
  client: ReturnType<typeof getServiceClient>,
  run: RunRow,
): Promise<boolean> {
  if (!run.batch_draft_id) {
    // run created but batch creation failed; mark as failed
    await client
      .from('daily_ops_runs')
      .update({
        status: 'failed',
        failure_reason: 'no batch_draft_id linked to run',
        completed_at: new Date().toISOString(),
      })
      .eq('id', run.id);
    return true;
  }

  const { data: batch, error: bErr } = await client
    .from('draft_batches')
    .select('status, succeeded, failed, total')
    .eq('id', run.batch_draft_id)
    .single();

  if (bErr || !batch) {
    throw new Error(`load draft_batch ${run.batch_draft_id} failed: ${bErr?.message}`);
  }

  // Batch still running — nothing to do, check next poll
  if (batch.status === 'running') {
    return false;
  }

  // Backfill daily_run_id on variants produced by this batch.
  // draft_batch_items → content_items → content_variants chain.
  const { data: items, error: iErr } = await client
    .from('draft_batch_items')
    .select('content_item_id')
    .eq('batch_id', run.batch_draft_id)
    .not('content_item_id', 'is', null);

  if (iErr) {
    throw new Error(`load batch items failed: ${iErr.message}`);
  }

  const contentItemIds = (items ?? [])
    .map((it) => it.content_item_id as string | null)
    .filter((id): id is string => id != null);

  if (contentItemIds.length === 0) {
    // Batch terminated but produced no content_items (all failed). Run goes
    // to 'failed' so customer sees it on /today, not silently dropped.
    await client
      .from('daily_ops_runs')
      .update({
        status: 'failed',
        failure_reason: `batch finished with 0 successful items (batch.status=${batch.status}, ${batch.failed}/${batch.total} failed)`,
        completed_at: new Date().toISOString(),
        drafted_at: new Date().toISOString(),
      })
      .eq('id', run.id);
    return true;
  }

  // Backfill daily_run_id on the variants (idempotent via WHERE daily_run_id IS NULL)
  const { error: updVErr } = await client
    .from('content_variants')
    .update({ daily_run_id: run.id })
    .in('content_item_id', contentItemIds)
    .eq('tenant_id', run.tenant_id)
    .is('daily_run_id', null)
    .is('deleted_at', null);

  if (updVErr) {
    throw new Error(`backfill daily_run_id failed: ${updVErr.message}`);
  }

  // Re-load variants now scoped to this run to compute counts.
  const { data: variants } = await client
    .from('content_variants')
    .select('dod_status, compliance_status, auto_rewrite_count, numeric_check')
    .eq('daily_run_id', run.id)
    .is('deleted_at', null);

  const inputs: VariantReadinessInput[] = (variants ?? []).map((v) => ({
    dod_status: (v.dod_status ?? 'unknown') as VariantReadinessInput['dod_status'],
    compliance_status: (v.compliance_status ?? 'pending') as string,
    auto_rewrite_count: (v.auto_rewrite_count ?? 0) as number,
    numeric_check: (v.numeric_check ?? null) as { verdict?: string } | null,
  }));
  const counts = countByClass(inputs);

  // T0c 2026-05-19 fix: stillEvaluating only blocks on `dod_status='unknown'`,
  // NOT `compliance_status='pending'`. Pending compliance means "needs human
  // review" — a valid terminal state that should appear in the yellow bucket,
  // not pause the entire run. Without this fix, runs with many GEO-low-score
  // variants (LLM medical content typically scores 60-70) get stuck forever in
  // 'drafting' because compliance-review downgrades auto→pending instead of
  // approving outright.
  const stillEvaluating = inputs.some(
    (v) => v.dod_status === 'unknown',
  );
  if (stillEvaluating && inputs.length > 0) {
    return false; // wait for next poll
  }

  const { error: updRErr } = await client
    .from('daily_ops_runs')
    .update({
      status: 'awaiting_review',
      drafted_at: new Date().toISOString(),
      notified_at: new Date().toISOString(),
      counts: {
        ...counts,
        total_evaluated: inputs.length,
        batch_status: batch.status,
        batch_succeeded: batch.succeeded,
        batch_failed: batch.failed,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', run.id);

  if (updRErr) throw new Error(`advance run failed: ${updRErr.message}`);

  // T4 2026-05-19: 自动给 yellow 变体 enqueue compliance.auto_rewrite.
  // 现实:V1.10 生产 22/25 variants 落 yellow (GEO score 低,compliance pending).
  // 客户不应该手动点 22 次「AI 一键改写」. settings.auto_rewrite_yellow 控制开关.
  // D5/D12 §13.3 max 1× 限制保留(compliance-auto-rewrite handler 自己 bump 计数).
  try {
    await autoRewriteYellows(client, run.id, run.tenant_id, variants ?? []);
  } catch (err) {
    reportError(err, {
      scope: 'daily-ops.auto-dispatch-timeout.rewrite_yellows',
      tenant_id: run.tenant_id,
      extra: { run_id: run.id },
    });
    // best-effort: 失败不阻塞 advance
  }

  // T7 — send "今日待审" email (best-effort, doesn't throw on failure)
  await notifyAwaitingReview(client, {
    tenant_id: run.tenant_id,
    run_id: run.id,
    run_date: run.run_date,
    counts,
  });

  return true;
}

/**
 * T4 2026-05-19 — V1.11 cron 自动改写 yellow.
 *
 * 在 cron #2 advance run 到 awaiting_review 后,扫所有 classified 为 yellow
 * 且 auto_rewrite_count=0 的 variants → enqueue compliance.auto_rewrite.
 * Worker handler 跑 LLM 改写,bump 计数,re-enqueue compliance.review.
 *
 * 客户体验:不用手动点 22 次「AI 一键改写」按钮.
 * settings.auto_rewrite_yellow=false 退回 V1.10 仅 D5/D12 reject 触发模式.
 */
async function autoRewriteYellows(
  client: ReturnType<typeof getServiceClient>,
  runId: string,
  tenantId: string,
  rawVariants: Array<{
    dod_status: string | null;
    compliance_status: string | null;
    auto_rewrite_count: number | null;
    numeric_check: { verdict?: string } | null;
  }>,
): Promise<void> {
  // 1. settings.auto_rewrite_yellow toggle
  const { data: settings } = await client
    .from('daily_ops_settings')
    .select('auto_rewrite_yellow')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  const enabled = (settings?.auto_rewrite_yellow as boolean | undefined) ?? true;
  if (!enabled) {
    console.log(`[auto-rewrite-yellows] tenant=${tenantId} auto_rewrite_yellow=false, skip`);
    return;
  }

  // 2. Re-fetch with variant ids + geo_score (V1.10.3: filter by geo_score.rewrite_count)
  const { data: vids } = await client
    .from('content_variants')
    .select('id, dod_status, compliance_status, auto_rewrite_count, numeric_check, geo_score, tenant_id')
    .eq('daily_run_id', runId)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null);
  if (!vids?.length) return;

  // 3. Filter to yellow + geo_score.rewrite_count < 3 (V1.10.3 soft cap).
  // Mirrors web aiRewriteForGeoScore behavior — geo-mode rewrites bump
  // geo_score.rewrite_count not auto_rewrite_count, so cron can re-touch
  // until GEO ≥ 70 or 3-attempt cap (whichever first).
  const MAX_GEO_REWRITES = 3;
  const targets = vids.filter((v) => {
    const rewriteCount =
      (v.geo_score as { rewrite_count?: number } | null)?.rewrite_count ?? 0;
    if (rewriteCount >= MAX_GEO_REWRITES) return false;
    const cls = classifyVariant({
      dod_status: (v.dod_status ?? 'unknown') as VariantReadinessInput['dod_status'],
      compliance_status: (v.compliance_status ?? 'pending') as string,
      auto_rewrite_count: (v.auto_rewrite_count ?? 0) as number,
      numeric_check: (v.numeric_check ?? null) as { verdict?: string } | null,
    });
    return cls === 'yellow';
  });

  if (targets.length === 0) {
    console.log(`[auto-rewrite-yellows] run=${runId} no yellow variants to rewrite`);
    return;
  }

  // 4. Enqueue compliance.auto_rewrite for each. Empty findings is fine —
  // compliance-auto-rewrite.ts handler reads variant + applies LLM rewrite
  // hint from GEO score / sanitizer / etc.
  const { enqueueViaSharedBoss } = await import('../lib/boss-ref');
  let enqueued = 0;
  for (const v of targets) {
    try {
      // V1.10.2 yellow → 'geo_score' mode (GEO_REWRITE_SYSTEM + buildRewriteHint).
      // V1.10.3 handler now mirrors web aiRewriteForGeoScore: re-scores +
      // bumps geo_score.rewrite_count (NOT auto_rewrite_count) so cron can
      // re-touch until GEO ≥ 70 or 3-attempt cap.
      await enqueueViaSharedBoss('compliance.auto_rewrite', {
        variant_id: v.id as string,
        tenant_id: tenantId,
        mode: 'geo_score',
      });
      enqueued++;
    } catch (err) {
      reportError(err, {
        scope: 'daily-ops.auto-rewrite-yellows.enqueue',
        tenant_id: tenantId,
        extra: { run_id: runId, variant_id: v.id },
      });
    }
  }

  reportEvent('daily-ops.auto-rewrite-yellows.enqueued', {
    scope: 'daily-ops.auto-rewrite-yellows',
    tenant_id: tenantId,
    extra: { run_id: runId, count: enqueued, total_yellow: targets.length },
  });
  console.log(
    `[auto-rewrite-yellows] run=${runId} enqueued=${enqueued}/${targets.length} yellow variants for auto-rewrite`,
  );
}

/**
 * Stage 2: awaiting_review → auto_dispatched_partial.
 * Triggered when notified_at + timeout_hours <= now.
 *
 * V1.10 limitation: we DO NOT write publish_tasks here. The dispatchToday()
 * server action lives in apps/web and depends on user session. The /today
 * page surfaces a "批量派单" button (visible after timeout) the operator
 * clicks to actually push tasks to staff. V1.11 will refactor dispatchToday
 * into a service-callable lib so this cron can fully close the loop.
 */
async function advanceAwaitingToDispatch(
  client: ReturnType<typeof getServiceClient>,
  run: RunRow,
): Promise<boolean> {
  if (!run.notified_at) return false; // shouldn't happen but defend

  // Load tenant's timeout_hours
  const { data: settings } = await client
    .from('daily_ops_settings')
    .select('timeout_hours')
    .eq('tenant_id', run.tenant_id)
    .maybeSingle();
  const timeoutHours = (settings?.timeout_hours as number | undefined) ?? 6;

  const notifiedAt = new Date(run.notified_at).getTime();
  const elapsedMs = Date.now() - notifiedAt;
  const elapsedHours = elapsedMs / 3_600_000;
  if (elapsedHours < timeoutHours) return false; // still within review window

  // Recount green variants (current state, in case operator already approved some)
  const { data: variants } = await client
    .from('content_variants')
    .select('id, dod_status, compliance_status, auto_rewrite_count, numeric_check, status')
    .eq('daily_run_id', run.id)
    .is('deleted_at', null);

  const greenIds = (variants ?? [])
    .filter((v) => {
      // skip variants the operator already moved out of draft (approved,
      // rejected, archived) — we only auto-advance still-in-draft greens
      if (v.status !== 'draft') return false;
      const cls = classifyVariant({
        dod_status: (v.dod_status ?? 'unknown') as VariantReadinessInput['dod_status'],
        compliance_status: (v.compliance_status ?? 'pending') as string,
        auto_rewrite_count: (v.auto_rewrite_count ?? 0) as number,
        numeric_check: (v.numeric_check ?? null) as { verdict?: string } | null,
      });
      return cls === 'green';
    })
    .map((v) => v.id as string);

  if (greenIds.length === 0) {
    // No green variants to auto-dispatch. Mark run as awaiting_manual so
    // /today shows "等你来审" rather than "auto-dispatched 0".
    await client
      .from('daily_ops_runs')
      .update({
        status: 'awaiting_manual',
        updated_at: new Date().toISOString(),
      })
      .eq('id', run.id);
    return true;
  }

  // V1.10 limitation: don't write publish_tasks; flip variants to a state
  // that dispatchToday() picks up + advance the run. dispatchToday's filter
  // is `compliance_status IN ('auto_approved','manual_approved') AND
  // dod_status != 'failed' AND status NOT IN ('archived','rejected')` — green
  // variants already match. So we just advance the run; /today page shows
  // a "批量派单" CTA when status='auto_dispatched_partial'.

  const { error: updErr } = await client
    .from('daily_ops_runs')
    .update({
      status: 'auto_dispatched_partial',
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', run.id);

  if (updErr) throw new Error(`advance run to auto_dispatched failed: ${updErr.message}`);

  reportEvent('daily-ops.auto-dispatch-timeout.window_expired', {
    scope: 'daily-ops.auto-dispatch-timeout',
    tenant_id: run.tenant_id,
    extra: {
      run_id: run.id,
      green_count: greenIds.length,
      elapsed_hours: elapsedHours.toFixed(1),
    },
  });

  return true;
}
