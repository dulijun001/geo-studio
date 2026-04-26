/**
 * Weekly GEO baseline job (V1.6-2).
 *
 * Triggered by pg-boss schedule (Mondays 09:00 Asia/Shanghai = Mon 01:00 UTC).
 * Runs Doubao tracking for every priority-tagged question in every active
 * tenant, so the customer wakes up to a fresh SOV snapshot week-over-week.
 *
 * Per-tenant fan-out:
 *   1. List active tenants
 *   2. For each tenant, find questions with active=true AND priority >= 7
 *      (the "core" question set — local recommendations + price + comparisons)
 *   3. For each question: insert geo_snapshots row (status=pending),
 *      enqueue geo.snapshot job, which the existing W6 worker will pick up
 *
 * Why split: keeping the actual Doubao call inside geo.snapshot worker means
 * we reuse all existing logic (adapter, scanBrandMentions, citations write,
 * session_url capture). This job is pure orchestration.
 */
import type PgBoss from 'pg-boss';
import { getServiceClient } from '../lib/supabase';

export type GeoWeeklyBaselineJob = {
  /** Optional: only process this tenant. Useful for manual replays. */
  tenant_slug?: string;
  /** Override priority threshold (default 7). */
  min_priority?: number;
};

export async function handleGeoWeeklyBaseline(
  boss: PgBoss,
  data: GeoWeeklyBaselineJob = {},
): Promise<void> {
  const minPriority = data.min_priority ?? 7;
  const client = getServiceClient();

  const { data: tenants } = await client
    .from('tenants')
    .select('id, slug, name')
    .is('deleted_at', null);
  if (!tenants?.length) {
    console.log('[geo-weekly-baseline] no tenants');
    return;
  }

  const targets = data.tenant_slug
    ? tenants.filter((t) => t.slug === data.tenant_slug)
    : tenants;

  for (const t of targets as Array<{ id: string; slug: string; name: string }>) {
    const { data: questions } = await client
      .from('questions')
      .select('id, text, priority')
      .eq('tenant_id', t.id)
      .eq('active', true)
      .gte('priority', minPriority)
      .is('deleted_at', null);

    if (!questions?.length) {
      console.log(`[geo-weekly-baseline] tenant=${t.slug} no priority>=${minPriority} questions, skip`);
      continue;
    }

    let queued = 0;
    for (const q of questions as Array<{ id: string; text: string; priority: number }>) {
      // Insert pending snapshot row first (geo.snapshot worker will mark it
      // running → done as it processes)
      const { data: snap, error: snapErr } = await client
        .from('geo_snapshots')
        .insert({
          tenant_id: t.id,
          question_id: q.id,
          engine: 'doubao',
          status: 'pending',
        })
        .select('id')
        .single();
      if (snapErr || !snap) {
        console.error(`[geo-weekly-baseline] snap insert q=${q.id}:`, snapErr);
        continue;
      }
      // Enqueue work (60-90s of Doubao headful + scan); worker processes
      // serially because Doubao rate-limits same IP, so this throttles itself.
      await boss.send('geo.snapshot', {
        snapshot_id: snap.id,
        tenant_id: t.id,
        question_id: q.id,
        engine: 'doubao',
      });
      queued += 1;
    }

    console.log(
      `[geo-weekly-baseline] tenant=${t.slug} queued=${queued}/${questions.length}`,
    );
  }
}
