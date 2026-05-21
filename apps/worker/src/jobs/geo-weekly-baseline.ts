/**
 * Weekly GEO baseline job (V1.6-2 → V1.11.5 multi-engine + 错峰).
 *
 * Triggered by pg-boss schedule (Mondays 09:00 Asia/Shanghai = Mon 01:00 UTC).
 *
 * V1.11.5 changes:
 *   - 多引擎:从 tenants.settings.tracking.engines 读 enabled engines,
 *     default ['doubao']。每 question × 每 enabled engine 各 1 个 snapshot
 *   - 错峰:每个 enqueue 加 `start_after` 随机延迟(60-300s 均匀),不同
 *     engine 启动时刻偏移半小时,防反爬识别批量 / 单 IP 高频
 *   - 节流:每 tenant × 每 engine 限 max_questions(default 50),防 quota 爆
 *   - reportEvent 在 queued/completed 两个时刻,Sentry breadcrumb 可观测
 *
 * Per-tenant fan-out:
 *   1. List active tenants
 *   2. For each tenant: 读 enabled engines + priority>=N questions
 *   3. For each (question, engine) pair: insert pending snapshot + enqueue
 *      with staggered start_after
 *
 * Why split: keeping the actual engine call inside geo.snapshot worker means
 * we reuse all existing logic (adapter, scanBrandMentions, citations write).
 * This job is pure orchestration.
 */
import type PgBoss from 'pg-boss';
import { reportEvent } from '@geo/shared';
import { listImplementedEngines } from '../trackers/registry';
import { getServiceClient } from '../lib/supabase';

export type GeoWeeklyBaselineJob = {
  /** Optional: only process this tenant. Useful for manual replays. */
  tenant_slug?: string;
  /** Override priority threshold (default 7). */
  min_priority?: number;
  /** Override engine offset cadence in minutes. Default 30. */
  engine_offset_min?: number;
};

/**
 * Pick (question, engine) interleave delay (seconds) for anti-detection.
 * Uniformly random in [60, 300] to prevent regular interval fingerprinting.
 */
function jitter(): number {
  return 60 + Math.floor(Math.random() * 240);
}

export async function handleGeoWeeklyBaseline(
  boss: PgBoss,
  data: GeoWeeklyBaselineJob = {},
): Promise<void> {
  const minPriority = data.min_priority ?? 7;
  const engineOffsetSec = (data.engine_offset_min ?? 30) * 60;
  const client = getServiceClient();
  const implementedEngines = listImplementedEngines();

  const { data: tenants } = await client
    .from('tenants')
    .select('id, slug, name, settings')
    .is('deleted_at', null);
  if (!tenants?.length) {
    console.log('[geo-weekly-baseline] no tenants');
    return;
  }

  const targets = data.tenant_slug
    ? tenants.filter((t) => t.slug === data.tenant_slug)
    : tenants;

  let totalQueued = 0;
  let totalTenants = 0;

  for (const t of targets as Array<{ id: string; slug: string; name: string; settings: Record<string, unknown> | null }>) {
    // V1.11.5: per-tenant enabled engines
    const trackingSettings = (t.settings?.tracking ?? {}) as Record<string, unknown>;
    const requestedEngines = Array.isArray(trackingSettings.engines)
      ? (trackingSettings.engines as string[])
      : ['doubao'];
    // 安全网:不让没实现的 engine(stub)进入 baseline → 防止 50 道题全 stub-fail
    const engines = requestedEngines.filter((e) =>
      (implementedEngines as string[]).includes(e),
    );
    if (engines.length === 0) {
      console.log(
        `[geo-weekly-baseline] tenant=${t.slug} no implemented engines (requested=${requestedEngines.join(',')}), skip`,
      );
      continue;
    }

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

    let tenantQueued = 0;
    for (let engineIdx = 0; engineIdx < engines.length; engineIdx++) {
      const engine = engines[engineIdx] as 'doubao' | 'yuanbao' | 'deepseek';
      // 错峰:每 engine 启动时刻向后偏移 engineOffsetSec
      const engineBaseDelay = engineIdx * engineOffsetSec;

      for (let qIdx = 0; qIdx < questions.length; qIdx++) {
        const q = questions[qIdx] as { id: string; text: string; priority: number };

        const { data: snap, error: snapErr } = await client
          .from('geo_snapshots')
          .insert({
            tenant_id: t.id,
            question_id: q.id,
            engine,
            status: 'pending',
          })
          .select('id')
          .single();
        if (snapErr || !snap) {
          console.error(`[geo-weekly-baseline] snap insert q=${q.id} engine=${engine}:`, snapErr);
          continue;
        }

        // 错峰:题内随机 60-300s,累计偏移防同时 fire
        const cumulativeDelay = engineBaseDelay + qIdx * jitter();
        const startAfter = new Date(Date.now() + cumulativeDelay * 1000);

        await boss.send('geo.snapshot', {
          snapshot_id: snap.id,
          tenant_id: t.id,
          question_id: q.id,
          engine,
        }, {
          startAfter,
        });
        tenantQueued += 1;
      }
    }

    totalQueued += tenantQueued;
    totalTenants += 1;
    reportEvent('geo.weekly_baseline.queued', {
      scope: 'geo-weekly-baseline',
      tenant_id: t.id,
      extra: {
        tenant_slug: t.slug,
        engines,
        questions_count: questions.length,
        snapshots_queued: tenantQueued,
        min_priority: minPriority,
      },
    });

    console.log(
      `[geo-weekly-baseline] tenant=${t.slug} engines=[${engines.join(',')}] queued=${tenantQueued} (${questions.length} q × ${engines.length} engines)`,
    );
  }

  reportEvent('geo.weekly_baseline.completed', {
    scope: 'geo-weekly-baseline',
    extra: {
      tenants_processed: totalTenants,
      snapshots_queued: totalQueued,
    },
  });
}
