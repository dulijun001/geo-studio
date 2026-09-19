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
  /** Override per-tenant × per-engine question cap (default 50). */
  max_questions?: number;
};

/**
 * V1.12.1: 每 tenant × 每 engine 限 max_questions。这个 cap 在 V1.11.5 注释里
 * 承诺过但从未实现 — 2026-06-08 周一 cron 把 458 题(D31 子问题矩阵扩容后)
 * 一次性全部派发,单设备连续打 36h,~60 题后被豆包风控,余下 350+ 次全失败
 * 且持续加深设备黑分。详见 D43。
 */
const DEFAULT_MAX_QUESTIONS = 50;

/**
 * Pick (question, engine) interleave delay (seconds) for anti-detection.
 * V1.12.1: 60-300s → 300-900s。6/8 实测 ~3min 间隔连续 3h(~60 题)即触发
 * 风控;50 题 × 平均 10min ≈ 8.3h,单日跑完且节奏更接近真人。
 */
function jitter(): number {
  return 300 + Math.floor(Math.random() * 600);
}

export async function handleGeoWeeklyBaseline(
  boss: PgBoss,
  data: GeoWeeklyBaselineJob = {},
): Promise<void> {
  // D76(2026-09-19)修 D68 造成的回归:这里默认是 7,而 D68 把「非找机构型」的题
  // 全部压到 priority=5(原意是「只当追踪题,不进起草带」)。两条规则一撞,
  // **268/407 活跃题反而被踢出了追踪池** —— 跟 D68 的意图正好相反。
  //
  // 根子上的问题:D68 之后 `priority` 语义已经专指「起草优先级」,不该再兼任
  // 追踪准入闸门。而且追踪本来就该覆盖全池 —— D67「价格题/知识题 0% 上榜」
  // 这个结论正是靠追踪那些低优先级题才测出来的;把它们踢出样本,就再也无法复验。
  // 选题轮转由下面的 last-tracked 排序负责,不需要 priority 把关。
  const minPriority = data.min_priority ?? 0;
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

    const { data: allQuestions } = await client
      .from('questions')
      .select('id, text, priority')
      .eq('tenant_id', t.id)
      .eq('active', true)
      .gte('priority', minPriority)
      .is('deleted_at', null);

    if (!allQuestions?.length) {
      console.log(`[geo-weekly-baseline] tenant=${t.slug} 无可追踪题(priority>=${minPriority}),skip`);
      continue;
    }

    // V1.12.1 cap + 轮转:tenant settings.tracking.max_questions > job param >
    // default 50。超过 cap 时按「最久未追踪优先」轮转 — 633 题矩阵分周滚动
    // 覆盖,而不是每周打同一批 priority 最高的题。
    const settingsCap = Number(trackingSettings.max_questions);
    const maxQuestions =
      data.max_questions ??
      (Number.isFinite(settingsCap) && settingsCap > 0 ? settingsCap : DEFAULT_MAX_QUESTIONS);

    let questions = allQuestions as Array<{ id: string; text: string; priority: number }>;
    if (questions.length > maxQuestions) {
      // last-tracked map:近 90 天该 tenant 每题最近一次快照时间(任意 status,
      // failed 也算"追踪过" — 防止风控期失败题在下一轮永远霸占队首)
      const { data: recentSnaps } = await client
        .from('geo_snapshots')
        .select('question_id, created_at')
        .eq('tenant_id', t.id)
        .gte('created_at', new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(5000);
      const lastTracked = new Map<string, string>();
      for (const s of (recentSnaps ?? []) as Array<{ question_id: string; created_at: string }>) {
        if (!lastTracked.has(s.question_id)) lastTracked.set(s.question_id, s.created_at);
      }
      questions = [...questions]
        .sort((a, b) => {
          const aT = lastTracked.get(a.id) ?? '';
          const bT = lastTracked.get(b.id) ?? '';
          // 没追踪过的(空串)排最前;其次最久未追踪;同档按 priority 高者先
          if (aT !== bT) return aT < bT ? -1 : 1;
          return b.priority - a.priority;
        })
        .slice(0, maxQuestions);
      console.log(
        `[geo-weekly-baseline] tenant=${t.slug} capped ${allQuestions.length} → ${maxQuestions} (least-recently-tracked rotation)`,
      );
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
        questions_total: allQuestions.length,
        max_questions: maxQuestions,
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
