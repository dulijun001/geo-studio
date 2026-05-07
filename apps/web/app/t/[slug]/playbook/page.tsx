import Link from 'next/link';
import { requireTenantMember } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { InlineGuide } from '@/components/inline-guide';
import { PageHeader } from '@/components/page-header';
import { fmtDateTime } from '@/lib/format';
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
  const [
    { data: brand },
    { data: pubByPlatformRaw },
    { data: snapshots },
    { data: questions },
    { data: aiDraftsRaw },
    { count: pendingCompliance },
  ] = await Promise.all([
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
      .select('id, asked_at, question_id')
      .eq('tenant_id', tenant.id)
      .eq('status', 'done')
      .order('asked_at', { ascending: false, nullsFirst: false })
      .limit(50),
    supabase
      .from('questions')
      .select('id, text')
      .eq('tenant_id', tenant.id)
      .eq('active', true)
      .is('deleted_at', null),
    supabase
      .from('content_items')
      .select('id, title, topics, status')
      .eq('tenant_id', tenant.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('content_variants')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('compliance_status', 'pending')
      .is('deleted_at', null),
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

  // Compute SOV per question (latest done snapshot per question_id)
  const latestSnapPerQuestion = new Map<string, { id: string; asked_at: string | null }>();
  for (const s of (snapshots ?? []) as Array<{ id: string; asked_at: string | null; question_id: string }>) {
    if (!latestSnapPerQuestion.has(s.question_id)) {
      latestSnapPerQuestion.set(s.question_id, { id: s.id, asked_at: s.asked_at });
    }
  }

  // Map question text → {own, comp, sessionId}
  const questionByText = new Map<string, { id: string; latestSnapId: string | null }>();
  for (const q of (questions ?? []) as Array<{ id: string; text: string }>) {
    const latest = latestSnapPerQuestion.get(q.id);
    questionByText.set(q.text, { id: q.id, latestSnapId: latest?.id ?? null });
  }

  // Pull citation counts for the latest snapshots in one batch
  const allLatestSnapIds = Array.from(latestSnapPerQuestion.values())
    .map((s) => s.id)
    .slice(0, 20);
  const sovBySnap = new Map<string, { own: number; comp: number }>();
  if (allLatestSnapIds.length > 0) {
    const { data: cits } = await supabase
      .from('citations')
      .select('snapshot_id, term_type')
      .in('snapshot_id', allLatestSnapIds);
    for (const c of (cits ?? []) as Array<{ snapshot_id: string; term_type: string | null }>) {
      const cur = sovBySnap.get(c.snapshot_id) ?? { own: 0, comp: 0 };
      if (c.term_type === 'brand') cur.own += 1;
      if (c.term_type === 'competitor') cur.comp += 1;
      sovBySnap.set(c.snapshot_id, cur);
    }
  }

  // Build query progress map: query → { drafts, sov }
  const queryProgress = new Map<string, { drafts: number; sovPct: number | null; latestSnapId: string | null }>();
  const aiDrafts = (aiDraftsRaw ?? []) as Array<{ title: string; topics: string[] }>;
  for (const phase of PHASES) {
    if (!phase.coreQueries) continue;
    for (const q of phase.coreQueries) {
      // Heuristic: drafts whose title or topics contain the query string's
      // most distinctive 2-3 char substrings (e.g. "种植", "正畸", "儿童"…)
      const keywords = extractKeywords(q);
      const drafts = aiDrafts.filter(
        (d) =>
          keywords.some((k) => d.title.includes(k)) ||
          d.topics.some((t) => keywords.some((k) => t.includes(k))),
      ).length;

      const qInfo = questionByText.get(q);
      const sov = qInfo?.latestSnapId ? sovBySnap.get(qInfo.latestSnapId) : null;
      const sovPct =
        sov && sov.own + sov.comp > 0 ? (sov.own / (sov.own + sov.comp)) * 100 : null;

      queryProgress.set(q, {
        drafts,
        sovPct,
        latestSnapId: qInfo?.latestSnapId ?? null,
      });
    }
  }

  // Compute next-baseline countdown (Mondays 09:00 Asia/Shanghai)
  const nextBaselineDays = daysUntilNextMonday();

  // Action items — "this week's 5 things"
  const actions = computeWeeklyActions({
    currentPhase,
    checklistDone,
    pubByPlatform,
    queryProgress,
    pendingCompliance: pendingCompliance ?? 0,
    nextBaselineDays,
    dianpingReviews: checklist.dianping_reviews ?? 0,
    tenantSlug: tenant.slug,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="GEO 执行计划"
        subtitle="豆包 GEO 8 周冷启动路线图。每个阶段有目标 / 内容主题 / 推荐节奏 + 自动算的进度。强执行,按部就班。"
      />

      <InlineGuide
        storageKey={`guide:playbook:${tenant.slug}`}
        title="这页是干嘛的"
        body={'8 周冷启动 GEO 的"军令状"——每周做什么、产出多少、看哪些数据,系统帮你算到哪了。新接入客户从这里开始最稳。每个阶段会自动从你的 KB 进度 / 内容产出 / SOV 趋势拉数据,显示当前完成度,不是死的咨询模板。'}
        steps={[
          'W1-2 基础阶段:百科 + POI + 大众点评(基础设施先立起来)',
          'W3-4 内容阶段:每周 4-6 篇科普,覆盖核心治疗项目',
          'W5-6 矩阵阶段:40 人员工真人发布,跨平台分发',
          'W7-8 验证阶段:跑 SOV baseline,看引用率,迭代弱项',
        ]}
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
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              下次 baseline:{nextBaselineDays === 0 ? '今天' : `${nextBaselineDays} 天后`}
            </span>
            <span className="text-muted-foreground">·</span>
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
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {PHASES[currentPhase]!.rationale}
        </p>
      </section>

      {/* This week's 5 things — top action list */}
      {actions.length > 0 ? (
        <section className="space-y-2 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.08] p-5">
          <header className="flex items-baseline justify-between">
            <h2 className="text-base font-semibold">本周这 {actions.length} 件事最该做</h2>
            <p className="text-xs text-muted-foreground">按优先级排序,从上往下</p>
          </header>
          <ol className="space-y-2">
            {actions.map((a, i) => (
              <li
                key={i}
                className={`flex items-start gap-3 rounded-md border bg-card px-3 py-2.5 ${
                  a.tone === 'critical' ? 'border-rose-500/30' : a.tone === 'warning' ? 'border-amber-500/30' : 'border-border'
                }`}
              >
                <span
                  className={`mt-0.5 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    a.tone === 'critical'
                      ? 'bg-rose-600 text-white'
                      : a.tone === 'warning'
                      ? 'bg-amber-500 text-white'
                      : 'bg-indigo-600 text-white'
                  }`}
                >
                  {i + 1}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium">{a.title}</p>
                  <p className="text-xs text-muted-foreground">{a.detail}</p>
                </div>
                <Link
                  href={a.href}
                  className="self-center rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background hover:opacity-85"
                >
                  {a.cta} →
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* Phase sections */}
      {PHASES.map((phase) => (
        <PhaseSection
          key={phase.id}
          phase={phase}
          isCurrent={phase.id === currentPhase}
          isDone={phase.id < currentPhase}
          checklistDone={checklistDone}
          pubByPlatform={pubByPlatform}
          queryProgress={queryProgress}
          tenantSlug={tenant.slug}
        />
      ))}

      {/* Footer status */}
      {latestSnap?.asked_at ? (
        <section className="rounded-md border border-dashed border-border bg-muted/20 p-4 text-xs text-muted-foreground">
          最近一次 GEO 追踪 baseline:
          {fmtDateTime(latestSnap.asked_at)} ·{' '}
          <Link href={`/t/${tenant.slug}/tracking`} className="text-emerald-400 hover:underline">
            去 GEO 追踪页看 SOV →
          </Link>
        </section>
      ) : (
        <section className="rounded-md border border-dashed border-border bg-amber-500/[0.10] p-4 text-xs text-amber-300">
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
    done: 'bg-emerald-500/[0.12] text-emerald-300 border-emerald-500/40',
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
  queryProgress,
  tenantSlug,
}: {
  phase: PhaseSpec;
  isCurrent: boolean;
  isDone: boolean;
  checklistDone: Record<string, boolean>;
  pubByPlatform: Map<string, number>;
  queryProgress: Map<string, { drafts: number; sovPct: number | null; latestSnapId: string | null }>;
  tenantSlug: string;
}) {
  const stateBg = isDone
    ? 'border-emerald-500/30 bg-emerald-500/[0.08]'
    : isCurrent
    ? 'border-emerald-500/30 bg-card'
    : 'border-border bg-muted/30';

  return (
    <section className={`space-y-3 rounded-lg border p-5 ${stateBg}`}>
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {phase.weekRange}
            {isCurrent ? <span className="ml-2 text-emerald-400">· 当前</span> : null}
            {isDone ? <span className="ml-2 text-emerald-400">· 已完成</span> : null}
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
                      ? 'border-emerald-500/30 bg-emerald-500/[0.10]'
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
            className="inline-block pt-1 text-xs text-emerald-400 hover:underline"
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
                          ? 'bg-amber-500/[0.10] text-amber-300 border border-amber-500/30'
                          : PLATFORM_TIER[platform] === 'P3'
                          ? 'bg-rose-500/[0.10] text-rose-300 border border-rose-500/30'
                          : 'bg-sky-500/[0.10] text-sky-300 border border-sky-500/30'
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
          <ul className="space-y-1.5">
            {phase.coreQueries.map((q) => {
              const prog = queryProgress.get(q);
              const sovBadge =
                prog?.sovPct === null || prog?.sovPct === undefined
                  ? null
                  : prog.sovPct >= 5
                  ? { label: `${prog.sovPct.toFixed(1)}%`, cls: 'bg-emerald-500/[0.12] text-emerald-300 border border-emerald-500/30' }
                  : prog.sovPct > 0
                  ? { label: `${prog.sovPct.toFixed(1)}%`, cls: 'bg-amber-500/[0.10] text-amber-300 border border-amber-500/30' }
                  : { label: '0%', cls: 'bg-rose-500/[0.10] text-rose-300 border border-rose-500/30' };
              return (
                <li
                  key={q}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <span className="flex-1 truncate">{q}</span>
                  <span className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground" title="已生成草稿数(标题/topics 含 query 关键词)">
                      草稿 {prog?.drafts ?? 0}
                    </span>
                    {sovBadge ? (
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${sovBadge.cls}`}
                        title="本品牌在该 query 豆包答案的 SOV"
                      >
                        SOV {sovBadge.label}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">未追踪</span>
                    )}
                  </span>
                  <Link
                    href={`/t/${tenantSlug}/content?prefill_query=${encodeURIComponent(q)}`}
                    className="rounded-md bg-indigo-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-indigo-700"
                  >
                    去生成 →
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-muted-foreground">
            草稿数 = 标题或 topics 命中关键词的 ai_drafted。SOV = 该 query 最近一次豆包答案里本品牌占比。
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

function extractKeywords(query: string): string[] {
  // Pull notable Chinese substrings (3-grams) that distinguish queries.
  // Hand-crafted — knows口腔行业 keywords; expand for other industries.
  const KEYWORD_LIBRARY = [
    '种植牙', '种植', '正畸', '隐形矫正', '矫正',
    '儿童口腔', '儿童', '涂氟', '窝沟封闭',
    '根管治疗', '根管', '牙周病', '牙周', '洁牙', '镶牙',
    '糖尿病', '种牙', '拔牙', '美学', '修复',
  ];
  return KEYWORD_LIBRARY.filter((k) => query.includes(k));
}

function daysUntilNextMonday(): number {
  const now = new Date();
  const dow = now.getDay(); // 0=Sun, 1=Mon, ...
  if (dow === 1 && now.getHours() < 9) return 0;
  return (8 - dow) % 7;
}

type ActionItem = {
  title: string;
  detail: string;
  cta: string;
  href: string;
  tone: 'critical' | 'warning' | 'normal';
};

function computeWeeklyActions(args: {
  currentPhase: 0 | 1 | 2 | 3;
  checklistDone: Record<string, boolean>;
  pubByPlatform: Map<string, number>;
  queryProgress: Map<string, { drafts: number; sovPct: number | null; latestSnapId: string | null }>;
  pendingCompliance: number;
  nextBaselineDays: number;
  dianpingReviews: number;
  tenantSlug: string;
}): ActionItem[] {
  const { currentPhase, checklistDone, pubByPlatform, queryProgress, pendingCompliance, dianpingReviews, tenantSlug } = args;
  const items: ActionItem[] = [];

  // 1. P0 missing items (highest priority always)
  const p0Missing = Object.entries(checklistDone).filter(([, v]) => !v);
  if (p0Missing.length > 0) {
    items.push({
      title: `补齐 P0 实体认知(还差 ${p0Missing.length} 项)`,
      detail: 'P0 不达标,后面发再多内容豆包都不会引用你。优先做免费的:高德 / 百度地图 POI(今天就能完成)。百度百科代办 ¥800-2000,2 周审核',
      cta: '维护 P0',
      href: `/t/${tenantSlug}/settings/geo-checklist`,
      tone: 'critical',
    });
  }

  // 2. Pending compliance
  if (pendingCompliance > 0) {
    items.push({
      title: `${pendingCompliance} 条变体待人工审`,
      detail: '合规审是发布瓶颈。建议每天上午 30 分钟批量过完,不要堆到一周后',
      cta: '去合规审',
      href: `/t/${tenantSlug}/compliance?tab=pending`,
      tone: 'warning',
    });
  }

  // 3. Phase 2: queries with 0 drafts (Phase 2+ only)
  if (currentPhase >= 1) {
    const queriesWithoutDrafts: string[] = [];
    for (const [q, p] of queryProgress.entries()) {
      if (p.drafts === 0) queriesWithoutDrafts.push(q);
    }
    if (queriesWithoutDrafts.length > 0 && queriesWithoutDrafts[0]) {
      items.push({
        title: `还有 ${queriesWithoutDrafts.length} 个核心 query 没生成内容`,
        detail: `先做最高优:「${queriesWithoutDrafts[0]}」— 用 Query 矩阵 5 分钟产 7 条草稿`,
        cta: '去 Query 矩阵',
        href: `/t/${tenantSlug}/content`,
        tone: queriesWithoutDrafts.length >= 8 ? 'critical' : 'warning',
      });
    }
  }

  // 4. Phase 1+: low platform throughput
  if (currentPhase >= 1) {
    const wechat = pubByPlatform.get('wechat_mp') ?? 0;
    const douyin = pubByPlatform.get('douyin_script') ?? 0;
    if (wechat < 2) {
      items.push({
        title: `本阶段公众号才发了 ${wechat} 篇`,
        detail: '公众号是 P2 主力,豆包高度信任。建议每周 2 篇深度文(医生 IP / 案例 / 数据)',
        cta: '去 AI 草稿',
        href: `/t/${tenantSlug}/content`,
        tone: 'warning',
      });
    } else if (douyin < 3) {
      items.push({
        title: `抖音脚本只产了 ${douyin} 条`,
        detail: '抖音是字节系,豆包加分最多。让医生本人出镜 60s 口播,3 个医生轮值',
        cta: '去 AI 草稿',
        href: `/t/${tenantSlug}/content`,
        tone: 'warning',
      });
    }
  }

  // 5. P1 evaluation aggregation
  if (dianpingReviews < 30) {
    items.push({
      title: `大众点评只有 ${dianpingReviews} 条评价`,
      detail: '豆包看评价数排序你。让前台引导每位满意患者真实点评(不要刷),目标 ≥ 30 条',
      cta: '维护 P0/P1',
      href: `/t/${tenantSlug}/settings/geo-checklist`,
      tone: dianpingReviews === 0 ? 'critical' : 'warning',
    });
  }

  // 6. Baseline countdown nudge
  if (args.nextBaselineDays === 0) {
    items.push({
      title: '今天 09:00 自动跑 GEO baseline',
      detail: '看 10 个核心 query 的 SOV 周一变化,根据结果调下周策略',
      cta: '去 GEO 追踪',
      href: `/t/${tenantSlug}/tracking`,
      tone: 'normal',
    });
  }

  return items.slice(0, 6);
}
