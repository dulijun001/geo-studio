import Link from 'next/link';
import { requireTenantMember } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/page-header';
import {
  PHASES,
  PLATFORM_LABEL,
  PLATFORM_TIER,
  type PhaseSpec,
} from './playbook-data';

export const dynamic = 'force-dynamic';

type GeoChecklist = {
  baidu_baike?: boolean;
  souguo_baike?: boolean;
  amap_poi?: boolean;
  baidu_map_poi?: boolean;
  dianping_score?: number;
  dianping_reviews?: number;
};

export default async function PlaybookPage({ params }: { params: { slug: string } }) {
  const tenant = await requireTenantMember(params.slug);
  const supabase = createSupabaseServerClient();

  // Pull all data we need to compute progress
  const [{ data: brand }, { data: pubByPlatformRaw }, { data: snapshots }] = await Promise.all([
    supabase
      .from('brands')
      .select('location')
      .eq('tenant_id', tenant.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('publish_tasks')
      .select('variant_id, published_at')
      .eq('tenant_id', tenant.id)
      .eq('status', 'published')
      .is('deleted_at', null),
    supabase
      .from('geo_snapshots')
      .select('id, asked_at')
      .eq('tenant_id', tenant.id)
      .eq('status', 'done')
      .order('asked_at', { ascending: false, nullsFirst: false })
      .limit(1),
  ]);

  const checklist =
    (((brand?.location as Record<string, unknown> | null) ?? {}).geo_checklist as
      | GeoChecklist
      | undefined) ?? {};
  const checklistDone = {
    baidu_baike: !!checklist.baidu_baike,
    souguo_baike: !!checklist.souguo_baike,
    amap_poi: !!checklist.amap_poi,
    baidu_map_poi: !!checklist.baidu_map_poi,
  };

  // Total cumulative published per platform (across all time — phase progress
  // is rough, since we don't track which phase a published item belongs to)
  const pubVariantIds = ((pubByPlatformRaw ?? []) as Array<{ variant_id: string }>).map(
    (r) => r.variant_id,
  );
  let pubByPlatform = new Map<string, number>();
  if (pubVariantIds.length > 0) {
    const { data: variants } = await supabase
      .from('content_variants')
      .select('id, platform')
      .in('id', pubVariantIds);
    for (const v of (variants ?? []) as Array<{ platform: string }>) {
      pubByPlatform.set(v.platform, (pubByPlatform.get(v.platform) ?? 0) + 1);
    }
  }

  // Determine current phase from cumulative progress (heuristic):
  //   Phase 0 done = 4 P0 items checked → unlock Phase 1
  //   Phase 1 done ≈ ≥ 50% of platform targets met → unlock Phase 2
  //   Phase 2 done ≈ ≥ 50% of platform targets met → Phase 3
  const phase0Done =
    Object.values(checklistDone).filter(Boolean).length === 4;
  const phase1Done =
    phase0Done && computePhaseProgress(PHASES[1]!, pubByPlatform) >= 0.5;
  const phase2Done =
    phase1Done && computePhaseProgress(PHASES[2]!, pubByPlatform) >= 0.5;

  let currentPhase: 0 | 1 | 2 | 3 = 0;
  if (phase0Done) currentPhase = 1;
  if (phase1Done) currentPhase = 2;
  if (phase2Done) currentPhase = 3;

  const latestSnap = (snapshots ?? [])[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="GEO 执行计划"
        subtitle="豆包 GEO 8 周冷启动路线图。每个阶段有目标 / 内容主题 / 推荐节奏 + 自动算的进度。强执行,按部就班。"
      />

      {/* Top status bar */}
      <section className="rounded-md border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              当前阶段
            </p>
            <p className="text-lg font-semibold">
              {PHASES[currentPhase]!.weekRange} · {PHASES[currentPhase]!.title}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {PHASES.map((p) => (
              <PhaseDot
                key={p.id}
                label={p.weekRange.replace('Week ', 'W')}
                state={
                  p.id < currentPhase ? 'done' : p.id === currentPhase ? 'current' : 'locked'
                }
              />
            ))}
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {PHASES[currentPhase]!.rationale}
        </p>
      </section>

      {/* Phase sections */}
      {PHASES.map((phase) => (
        <PhaseSection
          key={phase.id}
          phase={phase}
          isCurrent={phase.id === currentPhase}
          isDone={phase.id < currentPhase}
          checklistDone={checklistDone}
          pubByPlatform={pubByPlatform}
          tenantSlug={tenant.slug}
        />
      ))}

      {/* Footer status */}
      {latestSnap?.asked_at ? (
        <section className="rounded-md border border-dashed border-border bg-muted/20 p-4 text-xs text-muted-foreground">
          最近一次 GEO 追踪 baseline:
          {new Date(latestSnap.asked_at).toLocaleString('zh-CN')} ·{' '}
          <Link href={`/t/${tenant.slug}/tracking`} className="text-indigo-700 hover:underline">
            去 GEO 追踪页看 SOV →
          </Link>
        </section>
      ) : (
        <section className="rounded-md border border-dashed border-border bg-amber-50 p-4 text-xs text-amber-800">
          还没跑过 GEO 追踪 baseline。等 worker 周一自动跑,或去{' '}
          <Link href={`/t/${tenant.slug}/tracking`} className="font-medium hover:underline">
            GEO 追踪页
          </Link>{' '}
          手动触发一次。
        </section>
      )}
    </div>
  );
}

function PhaseDot({ label, state }: { label: string; state: 'done' | 'current' | 'locked' }) {
  const cls = {
    done: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    current: 'bg-indigo-600 text-white border-indigo-700',
    locked: 'bg-muted text-muted-foreground border-border',
  }[state];
  return (
    <span
      className={`inline-flex h-7 min-w-[44px] items-center justify-center rounded-md border px-2 text-xs font-medium ${cls}`}
    >
      {state === 'done' ? '✓ ' : ''}
      {label}
    </span>
  );
}

function PhaseSection({
  phase,
  isCurrent,
  isDone,
  checklistDone,
  pubByPlatform,
  tenantSlug,
}: {
  phase: PhaseSpec;
  isCurrent: boolean;
  isDone: boolean;
  checklistDone: Record<string, boolean>;
  pubByPlatform: Map<string, number>;
  tenantSlug: string;
}) {
  const stateBg = isDone
    ? 'border-emerald-200 bg-emerald-50/40'
    : isCurrent
    ? 'border-indigo-200 bg-card'
    : 'border-border bg-muted/30';

  return (
    <section className={`space-y-3 rounded-lg border p-5 ${stateBg}`}>
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {phase.weekRange}
            {isCurrent ? <span className="ml-2 text-indigo-700">· 当前</span> : null}
            {isDone ? <span className="ml-2 text-emerald-700">· 已完成</span> : null}
          </p>
          <h2 className="text-lg font-semibold">{phase.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{phase.goal}</p>
        </div>
      </header>

      {/* Manual checklist (Phase 0) */}
      {phase.manualChecklist ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">任务清单</h3>
          <ul className="grid gap-2 md:grid-cols-2">
            {phase.manualChecklist.map((task) => {
              const done = !!checklistDone[task.id];
              return (
                <li
                  key={task.id}
                  className={`flex items-start gap-2.5 rounded-md border px-3 py-2 text-sm ${
                    done
                      ? 'border-emerald-200 bg-emerald-50'
                      : 'border-border bg-background'
                  }`}
                >
                  <span
                    className={`mt-0.5 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-[10px] ${
                      done ? 'bg-emerald-600 text-white' : 'border border-border'
                    }`}
                  >
                    {done ? '✓' : ''}
                  </span>
                  <div>
                    <p className={done ? 'line-through text-muted-foreground' : ''}>
                      {task.label}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{task.hint}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <Link
            href={`/t/${tenantSlug}/settings/geo-checklist`}
            className="inline-block pt-1 text-xs text-indigo-700 hover:underline"
          >
            去维护 P0 / P1 →
          </Link>
        </div>
      ) : null}

      {/* Platform targets (Phase 1-3) */}
      {phase.platformTargets ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">本阶段累计发布目标</h3>
          <ul className="space-y-1.5">
            {Object.entries(phase.platformTargets).map(([platform, target]) => {
              const done = pubByPlatform.get(platform) ?? 0;
              const tgt = target ?? 0;
              const pct = tgt > 0 ? Math.min(100, (done / tgt) * 100) : 0;
              return (
                <li
                  key={platform}
                  className="grid grid-cols-[80px_60px_1fr_60px] items-center gap-3 text-xs"
                >
                  <span className="font-medium">
                    <span
                      className={`mr-1.5 inline-block rounded px-1 py-0.5 text-[9px] font-bold ${
                        PLATFORM_TIER[platform] === 'P2'
                          ? 'bg-amber-100 text-amber-800'
                          : PLATFORM_TIER[platform] === 'P3'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-sky-100 text-sky-800'
                      }`}
                    >
                      {PLATFORM_TIER[platform]}
                    </span>
                    {PLATFORM_LABEL[platform] ?? platform}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {done} / {tgt}
                  </span>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full ${
                        pct >= 100
                          ? 'bg-emerald-500'
                          : pct >= 50
                          ? 'bg-amber-500'
                          : 'bg-rose-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-right tabular-nums text-muted-foreground">
                    {Math.round(pct)}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {/* Core queries (Phase 2) */}
      {phase.coreQueries ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">10 个核心 query — 每个用「Query 矩阵」生成 6-7 条内容</h3>
          <ul className="grid gap-1.5 md:grid-cols-2">
            {phase.coreQueries.map((q) => (
              <li
                key={q}
                className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <span>{q}</span>
                <Link
                  href={`/t/${tenantSlug}/content`}
                  className="rounded-md bg-indigo-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-indigo-700"
                >
                  去生成 →
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground">
            点「去生成」→ content 页 → 「Query 矩阵」按钮 → 输入这条 query → AI 给出 6-7 条建议 → 一键生成草稿。
          </p>
        </div>
      ) : null}

      {/* Content idea library */}
      {phase.contentIdeas && phase.contentIdeas.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">本阶段建议主题</h3>
          {phase.contentIdeas.map((cat, ci) => (
            <div key={ci} className="rounded-md border border-border bg-background p-3">
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">{cat.category}</p>
              <ul className="space-y-1 text-sm">
                {cat.titles.map((t, ti) => (
                  <li key={ti} className="flex items-start gap-1.5">
                    <span className="text-muted-foreground/60">·</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function computePhaseProgress(phase: PhaseSpec, pubByPlatform: Map<string, number>): number {
  if (!phase.platformTargets) return 0;
  let totalDone = 0;
  let totalTarget = 0;
  for (const [platform, target] of Object.entries(phase.platformTargets)) {
    totalDone += Math.min(target ?? 0, pubByPlatform.get(platform) ?? 0);
    totalTarget += target ?? 0;
  }
  return totalTarget === 0 ? 0 : totalDone / totalTarget;
}
