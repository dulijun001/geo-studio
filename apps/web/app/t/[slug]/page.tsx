import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireTenantMember } from '@/lib/tenant';
import { PageHeader } from '@/components/page-header';
import { InlineGuide } from '@/components/inline-guide';
import { fmtDateTime } from '@/lib/format';
import { AnimatedNumber } from '@/components/motion/animated-number';
import { Reveal } from '@/components/motion/reveal';

export const dynamic = 'force-dynamic';

// =====================================================================
// Tenant Dashboard — V1.8.1 redesigned
// 双栏 dashboard:
//   - 主区: Hero SOV + 4 KPI strip + 5 层金字塔 (主战场) + 引导
//   - 右栏: Mini stats + Discoverability bar + Quick actions
// =====================================================================

export default async function TenantHomePage({ params }: { params: { slug: string } }) {
  const tenant = await requireTenantMember(params.slug);
  const supabase = createSupabaseServerClient();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  // Headline KPIs in parallel — RLS scopes to current tenant.
  const [
    contentCountRes,
    pendingComplianceRes,
    approvedVariantsRes,
    todayTasksRes,
    publishedTasksRes,
    questionsRes,
    snapshotsDoneRes,
    conversionsRes,
    tenantSettingsRes,
    artifactsRes,
  ] = await Promise.all([
    supabase.from('content_items').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id).is('deleted_at', null),
    supabase.from('content_variants').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('compliance_status', 'pending').is('deleted_at', null),
    supabase.from('content_variants').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id).in('compliance_status', ['auto_approved', 'manual_approved']).is('deleted_at', null),
    supabase.from('publish_tasks').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id).gte('created_at', startOfDay.toISOString()).is('deleted_at', null),
    supabase.from('publish_tasks').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('status', 'published').is('deleted_at', null),
    supabase.from('questions').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('active', true).is('deleted_at', null),
    supabase.from('geo_snapshots').select('question_id').eq('tenant_id', tenant.id).eq('status', 'done').is('deleted_at', null),
    supabase.from('conversion_events').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id).is('deleted_at', null),
    supabase.from('tenants').select('settings').eq('id', tenant.id).single(),
    supabase.from('discoverability_artifacts').select('generated_at').eq('tenant_id', tenant.id).order('generated_at', { ascending: false }).limit(1),
  ]);

  const discoSettings = ((tenantSettingsRes.data?.settings as Record<string, unknown> | undefined)?.discoverability ?? {}) as Record<string, unknown>;
  const discoPublicEnabled = discoSettings.public_enabled === true;
  const discoLastGenerated = (artifactsRes.data?.[0]?.generated_at as string | null | undefined) ?? null;

  // ─────────────────────────────────────────────────────────────────
  // Doubao GEO Health (V1.6-4) — 5-tier pyramid
  // ─────────────────────────────────────────────────────────────────
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString();

  // P2-P4: count published variants this week per platform tier
  const { data: pubByPlatformRaw } = await supabase
    .from('publish_tasks')
    .select('variant_id')
    .eq('tenant_id', tenant.id)
    .eq('status', 'published')
    .gte('published_at', sevenDaysAgo)
    .is('deleted_at', null);
  const pubVariantIds = ((pubByPlatformRaw ?? []) as Array<{ variant_id: string }>)
    .map((r) => r.variant_id);
  let pubPlatforms: string[] = [];
  if (pubVariantIds.length > 0) {
    const { data: variants } = await supabase
      .from('content_variants')
      .select('id, platform')
      .in('id', pubVariantIds);
    pubPlatforms = ((variants ?? []) as Array<{ platform: string }>).map((v) => v.platform);
  }
  const countPlatforms = (set: readonly string[]) =>
    pubPlatforms.filter((p) => set.includes(p)).length;
  const p2Done = countPlatforms(['wechat_mp', 'zhihu', 'toutiao_article']);
  const p3Done = countPlatforms(['douyin_script']);
  const p4Done = countPlatforms(['xiaohongshu', 'baijiahao', 'souhu']);

  // SOV: latest done snapshot's brand-vs-competitor citation counts
  const { data: latestSnap } = await supabase
    .from('geo_snapshots')
    .select('id, asked_at, session_url')
    .eq('tenant_id', tenant.id)
    .eq('status', 'done')
    .order('asked_at', { ascending: false, nullsFirst: false })
    .limit(1);
  let sovOwn = 0;
  let sovComp = 0;
  let sovAskedAt: string | null = null;
  let sovSessionUrl: string | null = null;
  const latest = (latestSnap ?? [])[0];
  if (latest) {
    sovAskedAt = (latest.asked_at as string | null) ?? null;
    sovSessionUrl = (latest.session_url as string | null) ?? null;
    const { data: cits } = await supabase
      .from('citations')
      .select('term_type')
      .eq('snapshot_id', latest.id);
    for (const c of (cits ?? []) as Array<{ term_type: string | null }>) {
      if (c.term_type === 'brand') sovOwn++;
      if (c.term_type === 'competitor') sovComp++;
    }
  }

  // P0/P1: read brand.location.geo_checklist (admin-curated)
  const { data: brandRows } = await supabase
    .from('brands')
    .select('location')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1);
  const checklist =
    (((brandRows ?? [])[0]?.location ?? {}) as { geo_checklist?: GeoChecklist }).geo_checklist ??
    {};

  const contentCount = contentCountRes.count ?? 0;
  const pendingCompliance = pendingComplianceRes.count ?? 0;
  const approvedVariants = approvedVariantsRes.count ?? 0;
  const todayTasks = todayTasksRes.count ?? 0;
  const publishedTasks = publishedTasksRes.count ?? 0;
  const questionsTotal = questionsRes.count ?? 0;
  const conversionEvents = conversionsRes.count ?? 0;
  const snapshotsCovered = new Set(
    ((snapshotsDoneRes.data ?? []) as Array<{ question_id: string }>).map((r) => r.question_id),
  ).size;
  const trackingCoveragePct = questionsTotal === 0
    ? 0
    : Math.round((snapshotsCovered / questionsTotal) * 100);

  const isFreshTenant = contentCount === 0 && approvedVariants === 0 && publishedTasks === 0;

  const sovTotal = sovOwn + sovComp;
  const sovPct = sovTotal > 0 ? (sovOwn / sovTotal) * 100 : null;

  // ─────────────────────────────────────────────────────────────────
  // Daily ops briefing — 本周每天派单数 mini bar chart (P2-3)
  // 7 桶 (今天 + 过去 6 天). 每桶 = 当天派单 count.
  // 用于顶部"今日运营节奏" hero,代替之前静态 SOV 数字独占视觉焦点.
  // ─────────────────────────────────────────────────────────────────
  const sevenDayBuckets: Array<{ label: string; count: number; isToday: boolean }> = [];
  {
    const startOfRange = new Date(startOfDay);
    startOfRange.setDate(startOfRange.getDate() - 6);
    const { data: weekTasksRaw } = await supabase
      .from('publish_tasks')
      .select('created_at')
      .eq('tenant_id', tenant.id)
      .gte('created_at', startOfRange.toISOString())
      .is('deleted_at', null);
    const weekTasks = (weekTasksRaw ?? []) as Array<{ created_at: string }>;
    for (let i = 6; i >= 0; i--) {
      const d = new Date(startOfDay);
      d.setDate(d.getDate() - i);
      const dEnd = new Date(d);
      dEnd.setDate(dEnd.getDate() + 1);
      const count = weekTasks.filter((t) => {
        const ts = new Date(t.created_at).getTime();
        return ts >= d.getTime() && ts < dEnd.getTime();
      }).length;
      sevenDayBuckets.push({
        label: ['日', '一', '二', '三', '四', '五', '六'][d.getDay()] ?? '',
        count,
        isToday: i === 0,
      });
    }
  }
  const weekTotal = sevenDayBuckets.reduce((s, b) => s + b.count, 0);
  const prevWeekStart = new Date(startOfDay);
  prevWeekStart.setDate(prevWeekStart.getDate() - 13);
  const prevWeekEnd = new Date(startOfDay);
  prevWeekEnd.setDate(prevWeekEnd.getDate() - 6);
  const { count: prevWeekCount } = await supabase
    .from('publish_tasks')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id)
    .gte('created_at', prevWeekStart.toISOString())
    .lt('created_at', prevWeekEnd.toISOString())
    .is('deleted_at', null);
  const weekDelta = weekTotal - (prevWeekCount ?? 0);

  // Compliance stuck > 2h (operational red flag)
  const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const { count: stuckComplianceCount } = await supabase
    .from('content_variants')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id)
    .eq('compliance_status', 'pending')
    .lte('created_at', twoHoursAgo)
    .is('deleted_at', null);

  // ─────────────────────────────────────────────────────────────────
  // Next-best-action — 基于现状给 1-2 个建议
  // ─────────────────────────────────────────────────────────────────
  const nextActions = computeNextActions({
    pendingCompliance,
    approvedVariants,
    todayTasks,
    p0Done: countP0(checklist),
    p1Reviews: checklist.dianping_reviews ?? 0,
    sovPct,
    isFreshTenant,
    slug: tenant.slug,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="今日运营"
        subtitle={
          <>
            <span className="font-medium text-foreground">{tenant.name}</span>
            <span className="mx-1.5 text-muted-foreground/60">·</span>
            <span>{tenant.industry === 'dental' ? '口腔行业' : tenant.industry}</span>
            <span className="mx-1.5 text-muted-foreground/60">·</span>
            <span>
              今天派 <span className="font-medium text-foreground">{todayTasks}</span> 条 · 卡合规{' '}
              <span className={`font-medium ${(stuckComplianceCount ?? 0) > 0 ? 'text-rose-400' : 'text-foreground'}`}>
                {stuckComplianceCount ?? 0}
              </span>
              {(stuckComplianceCount ?? 0) > 0 ? ' (>2h 待处理)' : ''}
            </span>
          </>
        }
        actions={
          <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            最近追踪 · {sovAskedAt ? fmtDateTime(sovAskedAt) : '尚未运行'}
          </div>
        }
      />

      <DailyOpsBriefing
        buckets={sevenDayBuckets}
        weekTotal={weekTotal}
        weekDelta={weekDelta}
        prevWeekTotal={prevWeekCount ?? 0}
        stuckCompliance={stuckComplianceCount ?? 0}
        slug={tenant.slug}
      />

      <InlineGuide
        storageKey={`guide:overview:${tenant.slug}`}
        title="欢迎使用 GEO Studio"
        body="GEO Studio 把内容生产 → 合规审查 → 员工矩阵发布 → AI 引擎追踪 → 转化归因这五件事串成一条流水线。下面是今天 + 累计的关键数字,左边菜单可以钻到具体环节。"
        linkLabel="详细说明书"
        linkHref={`/t/${tenant.slug}/help`}
      />

      {/* ─────────────────────────────────────────────────────
         HERO STAT — 豆包 SOV (核心数字)
         ───────────────────────────────────────────────────── */}
      <HeroStat
        sovPct={sovPct}
        sovOwn={sovOwn}
        sovComp={sovComp}
        sovAskedAt={sovAskedAt}
        sovSessionUrl={sovSessionUrl}
        slug={tenant.slug}
      />

      {/* ─────────────────────────────────────────────────────
         4 KPI STRIP with sparklines + stagger reveal
         ───────────────────────────────────────────────────── */}
      <section className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Reveal delay={0}>
          <KpiCard
            title="待人工审合规"
            value={pendingCompliance}
            hint={pendingCompliance === 0 ? '无待审 · 系统正常' : '建议 2 小时内处理'}
            tone={pendingCompliance > 0 ? 'warning' : 'good'}
            href={`/t/${tenant.slug}/compliance?tab=pending`}
            spark={genSpark(pendingCompliance, 'compliance')}
            animate
          />
        </Reveal>
        <Reveal delay={80}>
          <KpiCard
            title="可派变体"
            value={approvedVariants}
            hint={approvedVariants === 0 ? '先生成几条变体' : '到派单页一键分配'}
            tone={approvedVariants > 0 ? 'good' : 'neutral'}
            href={`/t/${tenant.slug}/publish`}
            spark={genSpark(approvedVariants, 'variants')}
            animate
          />
        </Reveal>
        <Reveal delay={160}>
          <KpiCard
            title="今日派单"
            value={todayTasks}
            hint={`已发布 ${publishedTasks} 条 (累计)`}
            tone="brand"
            href={`/t/${tenant.slug}/publish`}
            spark={genSpark(todayTasks + publishedTasks, 'tasks')}
            animate
          />
        </Reveal>
        <Reveal delay={240}>
          <KpiCard
            title="追踪覆盖率"
            value={`${trackingCoveragePct}%`}
            hint={`${snapshotsCovered} / ${questionsTotal} 个问题已抓`}
            tone={trackingCoveragePct >= 50 ? 'good' : 'neutral'}
            href={`/t/${tenant.slug}/tracking`}
            spark={genSpark(trackingCoveragePct, 'coverage')}
            animateValue={trackingCoveragePct}
            suffix="%"
          />
        </Reveal>
      </section>

      {/* ─────────────────────────────────────────────────────
         主双栏: 左 60% 主战场, 右 40% 信息侧栏
         ───────────────────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* === MAIN — 5 层金字塔 === */}
        <Reveal delay={320}>
          <PyramidPanel
            slug={tenant.slug}
            weekly={{ p2: p2Done, p3: p3Done, p4: p4Done }}
            checklist={checklist}
          />
        </Reveal>

        {/* === SIDEBAR — Mini stats + Disco + Next actions === */}
        <aside className="flex flex-col gap-4">
          <Reveal delay={400}>
            <NextActionsPanel actions={nextActions} />
          </Reveal>
          <Reveal delay={480}>
            <MiniStatRow
              stats={[
                { label: '内容总数', value: contentCount, caption: '原始素材 + 解析后' },
                { label: '问题库', value: questionsTotal, caption: 'active = true' },
                { label: '转化事件', value: conversionEvents, caption: '患者通过暗号回报' },
              ]}
            />
          </Reveal>
          <Reveal delay={560}>
            <DiscoverabilityBar
              slug={tenant.slug}
              enabled={discoPublicEnabled}
              lastGenerated={discoLastGenerated}
            />
          </Reveal>
        </aside>
      </div>

      {/* ─────────────────────────────────────────────────────
         FRESH TENANT — Quick start (仅新租户)
         ───────────────────────────────────────────────────── */}
      {isFreshTenant ? <QuickStart slug={tenant.slug} /> : null}
    </div>
  );
}

// =====================================================================
// HERO STAT — 豆包 SOV (核心数字)
// =====================================================================

function HeroStat({
  sovPct,
  sovOwn,
  sovComp,
  sovAskedAt,
  sovSessionUrl,
  slug,
}: {
  sovPct: number | null;
  sovOwn: number;
  sovComp: number;
  sovAskedAt: string | null;
  sovSessionUrl: string | null;
  slug: string;
}) {
  const total = sovOwn + sovComp;
  const ownWidth = total > 0 ? (sovOwn / total) * 100 : 0;
  const compWidth = total > 0 ? (sovComp / total) * 100 : 0;

  return (
    <section
      className="relative overflow-hidden rounded-2xl p-6 md:p-9"
      style={{
        background: '#08090a',
        boxShadow:
          '0 28px 60px -20px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.15), inset 0 0 0 1px rgba(255,255,255,0.06)',
      }}
    >
      {/* atmospheric emerald glow — landing-page DNA */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-24 h-[32rem] w-[32rem] rounded-full blur-3xl"
        style={{ background: 'rgba(52,211,153,0.28)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-24 h-[24rem] w-[24rem] rounded-full blur-3xl"
        style={{ background: 'rgba(52,211,153,0.10)' }}
      />
      {/* dotted grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          maskImage:
            'radial-gradient(ellipse 80% 70% at 70% 0%, black 30%, transparent 100%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 80% 70% at 70% 0%, black 30%, transparent 100%)',
        }}
      />
      <div className="relative grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div>
          <div
            className="flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.16em]"
            style={{ color: '#34d399' }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: '#34d399',
                boxShadow: '0 0 0 3px rgba(52,211,153,0.2)',
              }}
            />
            豆包 SOV · 最新一次追踪
          </div>
          <div className="mt-4 flex items-baseline gap-3">
            <span
              className="text-7xl tabular-nums tracking-[-0.04em] md:text-8xl"
              style={{
                fontStyle: 'italic',
                fontWeight: 500,
                backgroundImage:
                  'linear-gradient(135deg, #fafafa 0%, #34d399 100%)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              {sovPct === null ? (
                '—'
              ) : (
                <AnimatedNumber value={sovPct} decimals={1} />
              )}
            </span>
            {sovPct !== null ? (
              <span className="pb-2 text-3xl" style={{ color: '#a1a1aa' }}>
                %
              </span>
            ) : null}
            {sovPct !== null ? (
              <span
                className="ml-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
                style={{
                  border: '1px solid rgba(52,211,153,0.30)',
                  background: 'rgba(52,211,153,0.10)',
                  color: '#34d399',
                }}
              >
                品牌 / 总引用
              </span>
            ) : null}
          </div>
          <p className="mt-3 text-sm" style={{ color: '#a1a1aa' }}>
            本品牌{' '}
            <span
              className="font-semibold tabular-nums"
              style={{ color: '#fafafa' }}
            >
              {sovOwn}
            </span>{' '}
            次 · 竞品{' '}
            <span
              className="font-semibold tabular-nums"
              style={{ color: '#fafafa' }}
            >
              {sovComp}
            </span>{' '}
            次
            {sovAskedAt ? <> · {fmtDateTime(sovAskedAt)}</> : <> · 还没跑过追踪</>}
          </p>

          {/* SOV bar */}
          {total > 0 ? (
            <div
              className="mt-5 h-2 overflow-hidden rounded-full"
              style={{ background: 'rgba(255,255,255,0.06)' }}
            >
              <div className="flex h-full">
                <div
                  className="transition-all"
                  style={{
                    width: `${ownWidth}%`,
                    background: '#34d399',
                    boxShadow: '0 0 12px rgba(52,211,153,0.6)',
                  }}
                  title={`本品牌 ${ownWidth.toFixed(1)}%`}
                />
                <div
                  className="transition-all"
                  style={{
                    width: `${compWidth}%`,
                    background: 'rgba(244,114,182,0.7)',
                  }}
                  title={`竞品 ${compWidth.toFixed(1)}%`}
                />
              </div>
            </div>
          ) : (
            <div
              className="mt-5 h-2 rounded-full"
              style={{ background: 'rgba(255,255,255,0.06)' }}
            />
          )}
        </div>

        <div className="flex flex-col items-start gap-2 md:items-end">
          {sovSessionUrl ? (
            <a
              href={sovSessionUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition"
              style={{
                color: '#fafafa',
                border: '1px solid rgba(255,255,255,0.10)',
                background: 'rgba(255,255,255,0.02)',
              }}
            >
              打开豆包页面 ↗
            </a>
          ) : null}
          <Link
            href={`/t/${slug}/sov`}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition hover:opacity-90"
            style={{ background: '#fafafa', color: '#0a0a0a' }}
          >
            看 8 周 SOV 热力图 →
          </Link>
        </div>
      </div>
    </section>
  );
}

// =====================================================================
// KPI CARD — 含微缩 sparkline
// =====================================================================

function KpiCard({
  title,
  value,
  hint,
  tone,
  href,
  spark,
  animate,
  animateValue,
  suffix = '',
}: {
  title: string;
  value: number | string;
  hint: string;
  tone: 'neutral' | 'good' | 'warning' | 'brand';
  href: string;
  spark: number[];
  /** When `value` is a number, animate it from 0 → value on mount */
  animate?: boolean;
  /** Override the number to animate (use when value is a formatted string) */
  animateValue?: number;
  suffix?: string;
}) {
  const dotClass: Record<string, string> = {
    neutral: 'bg-slate-300',
    good: 'bg-emerald-500',
    warning: 'bg-amber-500',
    brand: 'bg-gradient-to-br from-slate-900 to-emerald-500',
  };
  const sparkColor: Record<string, string> = {
    neutral: '#94a3b8',
    good: '#10b981',
    warning: '#f59e0b',
    brand: '#fafafa',
  };

  const animatedNum =
    animateValue !== undefined
      ? animateValue
      : animate && typeof value === 'number'
        ? value
        : null;

  return (
    <Link
      href={href}
      className="lift group block rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            <span className={`h-1.5 w-1.5 rounded-full ${dotClass[tone]}`} />
            {title}
          </div>
          <p className="mt-2.5 text-3xl font-semibold tabular-nums tracking-tight text-foreground">
            {animatedNum !== null ? (
              <AnimatedNumber value={animatedNum} decimals={0} suffix={suffix} />
            ) : (
              value
            )}
          </p>
        </div>
        <Sparkline points={spark} color={sparkColor[tone]!} className="mt-1 flex-shrink-0" />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
    </Link>
  );
}

// =====================================================================
// SPARKLINE — 微缩趋势图 (mock 数据基于 hash, 后续 V1.8.1 接真实日聚合)
// =====================================================================

function Sparkline({
  points,
  color,
  className,
}: {
  points: number[];
  color: string;
  className?: string;
}) {
  if (points.length < 2) {
    return (
      <svg
        className={className}
        width="64"
        height="22"
        viewBox="0 0 64 22"
        aria-hidden
      >
        <line x1="4" y1="11" x2="60" y2="11" stroke={color} strokeWidth="1.5" strokeOpacity="0.4" strokeDasharray="2 3" />
      </svg>
    );
  }
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const w = 64;
  const h = 22;
  const step = (w - 8) / (points.length - 1);
  const path = points
    .map((p, i) => {
      const x = 4 + i * step;
      const y = h - 4 - ((p - min) / range) * (h - 8);
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  const lastX = 4 + (points.length - 1) * step;
  const lastY = h - 4 - ((points[points.length - 1]! - min) / range) * (h - 8);
  return (
    <svg
      className={className}
      width="64"
      height="22"
      viewBox="0 0 64 22"
      aria-hidden
    >
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="2" fill={color} />
    </svg>
  );
}

/**
 * Deterministic sparkline data from a seed (KPI value + label).
 * TODO V1.8.1 — 接真实日聚合查询替换 mock。
 */
function genSpark(seed: number, label: string): number[] {
  const len = 8;
  const out: number[] = [];
  // simple xorshift-ish hash
  let h = (seed * 9301 + 49297) % 233280;
  for (const ch of label) {
    h = (h * 31 + ch.charCodeAt(0)) % 233280;
  }
  for (let i = 0; i < len; i++) {
    h = (h * 1103515245 + 12345) % 2 ** 31;
    const noise = (h / 2 ** 31) * 0.6 - 0.3;
    out.push(Math.max(0, seed * (0.6 + 0.4 * (i / len)) + seed * noise));
  }
  return out;
}

// =====================================================================
// PYRAMID PANEL — 5 层金字塔主战场
// =====================================================================

type GeoChecklist = {
  baidu_baike?: boolean;
  souguo_baike?: boolean;
  amap_poi?: boolean;
  baidu_map_poi?: boolean;
  dianping_score?: number;
  dianping_reviews?: number;
};

const WEEKLY_TARGETS = { p2: 5, p3: 3, p4: 14 } as const;

function PyramidPanel({
  slug,
  weekly,
  checklist,
}: {
  slug: string;
  weekly: { p2: number; p3: number; p4: number };
  checklist: GeoChecklist;
}) {
  const p0Items = [
    { label: '百度百科', done: !!checklist.baidu_baike },
    { label: '搜狗百科', done: !!checklist.souguo_baike },
    { label: '高德地图', done: !!checklist.amap_poi },
    { label: '百度地图', done: !!checklist.baidu_map_poi },
  ];
  const p0Done = p0Items.filter((x) => x.done).length;

  const p1Score = checklist.dianping_score ?? 0;
  const p1Reviews = checklist.dianping_reviews ?? 0;
  const p1Status =
    p1Reviews === 0 ? 'critical' : p1Score < 4 || p1Reviews < 30 ? 'weak' : 'ok';

  return (
    <section
      className="relative overflow-hidden rounded-2xl p-6 md:p-8"
      style={{
        background: '#08090a',
        boxShadow:
          '0 28px 60px -20px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.15), inset 0 0 0 1px rgba(255,255,255,0.06)',
      }}
    >
      {/* atmospheric emerald glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-20 h-80 w-80 rounded-full blur-3xl"
        style={{ background: 'rgba(52,211,153,0.20)' }}
      />
      {/* dotted backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          maskImage:
            'radial-gradient(ellipse 80% 50% at 100% 0%, black 30%, transparent 100%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 80% 50% at 100% 0%, black 30%, transparent 100%)',
        }}
      />
      <header className="relative mb-6 flex items-start justify-between gap-4">
        <div>
          <div
            className="flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.16em]"
            style={{ color: '#34d399' }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: '#34d399',
                boxShadow: '0 0 0 3px rgba(52,211,153,0.2)',
              }}
            />
            CORE · 豆包 GEO 健康度
          </div>
          <h2
            className="mt-3 text-2xl font-semibold tracking-[-0.022em] md:text-3xl"
            style={{ color: '#fafafa' }}
          >
            五层
            <span
              className="italic font-medium"
              style={{
                backgroundImage:
                  'linear-gradient(135deg, #fafafa 0%, #34d399 100%)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              优先级
            </span>
            金字塔
          </h2>
          <p className="mt-1.5 text-sm" style={{ color: '#a1a1aa' }}>
            P0 不达标，后面再多内容也进不了豆包。
          </p>
        </div>
        <Link
          href={`/t/${slug}/settings/geo-checklist`}
          className="rounded-md px-3 py-1.5 text-xs font-medium transition"
          style={{
            color: '#fafafa',
            border: '1px solid rgba(255,255,255,0.10)',
            background: 'rgba(255,255,255,0.04)',
          }}
        >
          维护 P0 / P1
        </Link>
      </header>

      <div className="relative space-y-2">
        <PyramidRow
          tier="P0"
          label="实体认知"
          desc="让豆包知道你存在"
          state={p0Done === 0 ? 'critical' : p0Done < 3 ? 'weak' : 'ok'}
          progress={`${p0Done} / ${p0Items.length}`}
          progressPct={(p0Done / p0Items.length) * 100}
          rightLabel={
            p0Done === 0
              ? '未配置 — 必做'
              : p0Done < p0Items.length
              ? `${p0Items.filter((x) => !x.done).map((x) => x.label).join(' · ')} 缺`
              : '齐全'
          }
        />
        <PyramidRow
          tier="P1"
          label="评价聚合"
          desc="决定豆包给你排第几"
          state={p1Status}
          progress={
            p1Reviews === 0 ? '未录入' : `${p1Score.toFixed(1)}★ · ${p1Reviews} 评价`
          }
          progressPct={p1Status === 'critical' ? 0 : Math.min(100, (p1Reviews / 100) * 100)}
          rightLabel={
            p1Status === 'critical'
              ? '入驻大众点评'
              : p1Status === 'weak'
              ? '评价数太少 (≥ 30)'
              : '稳健'
          }
        />
        <PyramidRow
          tier="P2"
          label="专业内容"
          desc="本周公众号 / 知乎 / 头条"
          state={
            weekly.p2 >= WEEKLY_TARGETS.p2
              ? 'ok'
              : weekly.p2 >= WEEKLY_TARGETS.p2 / 2
              ? 'weak'
              : 'critical'
          }
          progress={`${weekly.p2} / ${WEEKLY_TARGETS.p2}`}
          progressPct={Math.min(100, (weekly.p2 / WEEKLY_TARGETS.p2) * 100)}
          rightLabel={`周目标 ${WEEKLY_TARGETS.p2} 篇`}
        />
        <PyramidRow
          tier="P3"
          label="视频内容"
          desc="本周抖音 (字节生态加分)"
          state={
            weekly.p3 >= WEEKLY_TARGETS.p3
              ? 'ok'
              : weekly.p3 >= 1
              ? 'weak'
              : 'critical'
          }
          progress={`${weekly.p3} / ${WEEKLY_TARGETS.p3}`}
          progressPct={Math.min(100, (weekly.p3 / WEEKLY_TARGETS.p3) * 100)}
          rightLabel={`周目标 ${WEEKLY_TARGETS.p3} 条`}
        />
        <PyramidRow
          tier="P4"
          label="个人化"
          desc="本周小红书 / 百家号"
          state={
            weekly.p4 >= WEEKLY_TARGETS.p4
              ? 'ok'
              : weekly.p4 >= WEEKLY_TARGETS.p4 / 3
              ? 'weak'
              : 'critical'
          }
          progress={`${weekly.p4} / ${WEEKLY_TARGETS.p4}`}
          progressPct={Math.min(100, (weekly.p4 / WEEKLY_TARGETS.p4) * 100)}
          rightLabel={`周目标 ${WEEKLY_TARGETS.p4} 条`}
        />
      </div>
    </section>
  );
}

function PyramidRow({
  tier,
  label,
  desc,
  state,
  progress,
  progressPct,
  rightLabel,
}: {
  tier: string;
  label: string;
  desc: string;
  state: 'ok' | 'weak' | 'critical';
  progress: string;
  progressPct: number;
  rightLabel: string;
}) {
  const stateColor = {
    ok: '#34d399',
    weak: '#fbbf24',
    critical: '#fb7185',
  }[state];
  const stateGlow = {
    ok: '0 0 12px rgba(52,211,153,0.5)',
    weak: '0 0 12px rgba(251,191,36,0.4)',
    critical: '0 0 12px rgba(251,113,133,0.4)',
  }[state];
  const tierStyle = {
    ok: {
      background: 'rgba(52,211,153,0.12)',
      color: '#34d399',
      border: '1px solid rgba(52,211,153,0.30)',
    },
    weak: {
      background: 'rgba(251,191,36,0.12)',
      color: '#fbbf24',
      border: '1px solid rgba(251,191,36,0.30)',
    },
    critical: {
      background: 'rgba(251,113,133,0.12)',
      color: '#fb7185',
      border: '1px solid rgba(251,113,133,0.30)',
    },
  }[state];

  return (
    <div
      className="grid grid-cols-[44px_1fr_140px_1fr] items-center gap-4 rounded-xl px-4 py-3 text-sm transition"
      style={{
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <span
        className="inline-flex h-7 w-10 items-center justify-center rounded-md font-mono text-[11px] font-bold tracking-wider"
        style={tierStyle}
      >
        {tier}
      </span>
      <div>
        <p className="font-medium leading-tight" style={{ color: '#fafafa' }}>
          {label}
        </p>
        <p className="mt-0.5 text-xs" style={{ color: '#71717a' }}>
          {desc}
        </p>
      </div>
      <div>
        <p
          className="text-right text-sm font-semibold tabular-nums"
          style={{ color: '#fafafa' }}
        >
          {progress}
        </p>
        <div
          className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          <div
            className="progress-anim h-full"
            style={{
              ['--progress-target' as string]: `${progressPct}%`,
              background: stateColor,
              boxShadow: stateGlow,
            }}
          />
        </div>
      </div>
      <p className="text-right text-xs" style={{ color: '#a1a1aa' }}>
        {rightLabel}
      </p>
    </div>
  );
}

// =====================================================================
// NEXT ACTIONS PANEL — 基于现状的智能建议
// =====================================================================

type NextAction = {
  priority: 'high' | 'med' | 'low';
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
};

function computeNextActions(args: {
  pendingCompliance: number;
  approvedVariants: number;
  todayTasks: number;
  p0Done: number;
  p1Reviews: number;
  sovPct: number | null;
  isFreshTenant: boolean;
  slug: string;
}): NextAction[] {
  const { pendingCompliance, approvedVariants, todayTasks, p0Done, p1Reviews, sovPct, isFreshTenant, slug } = args;
  const actions: NextAction[] = [];

  if (isFreshTenant) {
    actions.push({
      priority: 'high',
      title: '先跑通一遍 5 步流程',
      body: '从上传素材 → 生成变体 → 合规审 → 派单 → 看转化，建议从一个最小用例开始。',
      ctaLabel: '看下面 5 步引导',
      ctaHref: '#fresh-quickstart',
    });
    return actions;
  }

  if (p0Done < 3) {
    actions.push({
      priority: 'high',
      title: '先把 P0 实体认知补齐',
      body: 'P0 不达标，豆包都不知道你存在。优先做百度百科 + 高德地图 POI。',
      ctaLabel: '维护 P0 配置',
      ctaHref: `/t/${slug}/settings/geo-checklist`,
    });
  }

  if (pendingCompliance > 0) {
    actions.push({
      priority: 'high',
      title: `${pendingCompliance} 条变体待人工审核`,
      body: '建议 2 小时内处理。卡在合规会拖慢整条流水线。',
      ctaLabel: '去合规审核',
      ctaHref: `/t/${slug}/compliance?tab=pending`,
    });
  }

  if (approvedVariants > 0 && todayTasks === 0) {
    actions.push({
      priority: 'med',
      title: `${approvedVariants} 条已合规变体可派单`,
      body: '今天还没派出去，趁早派完员工才有时间打卡发布。',
      ctaLabel: '去派单',
      ctaHref: `/t/${slug}/publish`,
    });
  }

  if (p1Reviews > 0 && p1Reviews < 30) {
    actions.push({
      priority: 'med',
      title: '大众点评评价数偏少',
      body: '当前只有少量评价，建议 ≥ 30 条才稳。可以考虑做一波到院反馈引导。',
      ctaLabel: '维护 P1 配置',
      ctaHref: `/t/${slug}/settings/geo-checklist`,
    });
  }

  if (sovPct !== null && sovPct < 30) {
    actions.push({
      priority: 'med',
      title: 'SOV 偏低，竞品占据更多',
      body: '看 8 周 SOV 热力图找出哪些问题被竞品抢走，重点补这些问题的内容。',
      ctaLabel: '看 SOV 战况图',
      ctaHref: `/t/${slug}/sov`,
    });
  }

  if (actions.length === 0) {
    actions.push({
      priority: 'low',
      title: '一切运转正常',
      body: '今天没有紧急事项。可以看下 SOV 趋势或者维护问题库。',
      ctaLabel: '看 SOV 战况图',
      ctaHref: `/t/${slug}/sov`,
    });
  }

  return actions.slice(0, 3);
}

function NextActionsPanel({ actions }: { actions: NextAction[] }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <header className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        下一步建议
      </header>
      <ul className="space-y-3">
        {actions.map((a, i) => {
          const priorityDot = {
            high: 'bg-rose-500',
            med: 'bg-amber-500',
            low: 'bg-emerald-500',
          }[a.priority];
          const priorityLabel = {
            high: '高',
            med: '中',
            low: '低',
          }[a.priority];
          return (
            <li
              key={i}
              className="rounded-lg border border-border bg-background p-3.5 transition hover:border-foreground/20"
            >
              <div className="flex items-start gap-2.5">
                <span
                  className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${priorityDot}`}
                  title={`优先级 ${priorityLabel}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-tight text-foreground">
                    {a.title}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {a.body}
                  </p>
                  <Link
                    href={a.ctaHref}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:underline underline-offset-2"
                  >
                    {a.ctaLabel} →
                  </Link>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// =====================================================================
// MINI STAT ROW — 累计指标
// =====================================================================

function MiniStatRow({
  stats,
}: {
  stats: Array<{ label: string; value: number; caption: string }>;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <header className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
        累计指标
      </header>
      <div className="grid grid-cols-3 divide-x divide-border">
        {stats.map((s) => (
          <div key={s.label} className="px-3 first:pl-0 last:pr-0">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {s.label}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
              {s.value}
            </p>
            <p className="mt-0.5 text-[10.5px] leading-tight text-muted-foreground">
              {s.caption}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

// =====================================================================
// DISCOVERABILITY BAR — Layer A 状态
// =====================================================================

function DiscoverabilityBar({
  slug,
  enabled,
  lastGenerated,
}: {
  slug: string;
  enabled: boolean;
  lastGenerated: string | null;
}) {
  return (
    <Link
      href={`/t/${slug}/discoverability`}
      className={
        enabled
          ? 'group block rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.08] p-5 shadow-sm transition hover:bg-emerald-500/[0.12]'
          : 'group block rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:border-foreground/20'
      }
    >
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em]">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            enabled ? 'bg-emerald-500' : 'bg-slate-400'
          }`}
        />
        <span className={enabled ? 'text-emerald-400' : 'text-muted-foreground'}>
          可发现层 (V1.7)
        </span>
      </div>
      <p className="mt-2 text-sm font-medium">
        {enabled ? '公开开启' : '关闭 · 尚未对外'}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {lastGenerated
          ? `artifacts 最近重建 ${fmtDateTime(lastGenerated)}`
          : 'artifacts 尚未生成'}
      </p>
      <p className="mt-3 text-xs font-medium text-emerald-400 group-hover:underline underline-offset-2">
        前往配置 →
      </p>
    </Link>
  );
}

// =====================================================================
// QUICK START — 仅新租户
// =====================================================================

function QuickStart({ slug }: { slug: string }) {
  return (
    <section id="fresh-quickstart" className="rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
      <header className="mb-5">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          QUICK START · 5 STEPS
        </div>
        <h2 className="mt-2 text-xl font-semibold tracking-tight">
          5 步走完一遍流程
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          首次接入，跟着下面顺序走一遍能体验全链路。每一步都有自己的页面。
        </p>
      </header>
      <ol className="space-y-3">
        <QuickStep
          n={1}
          title="上传第一份素材"
          body="支持 Word / PDF。系统会解析为 markdown 进入下一步。"
          cta="上传内容"
          href={`/t/${slug}/content`}
        />
        <QuickStep
          n={2}
          title="生成变体"
          body="选目标平台 (头条号 / 抖音 / 知乎 ...)，AI 按 GEO 9 法改写 N 份。"
          cta="去内容详情"
          href={`/t/${slug}/content`}
        />
        <QuickStep
          n={3}
          title="合规通过"
          body="自动跑关键词扫描 + 豆包 LLM 审查。命中 B 级的会落到「待人工审批」。"
          cta="去合规审核"
          href={`/t/${slug}/compliance`}
        />
        <QuickStep
          n={4}
          title="派给员工"
          body="算法自动按平台 / 人设 / 节奏匹配。每个任务自动 mint 一个暗号。"
          cta="去派单"
          href={`/t/${slug}/publish`}
        />
        <QuickStep
          n={5}
          title="患者来店报暗号"
          body="发布的内容里带暗号 → 患者来店报 → 自动归到具体内容。看转化漏斗。"
          cta="看归因看板"
          href={`/t/${slug}/attribution`}
        />
      </ol>
    </section>
  );
}

function QuickStep({
  n,
  title,
  body,
  cta,
  href,
}: {
  n: number;
  title: string;
  body: string;
  cta: string;
  href: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full gradient-brand text-xs font-medium text-white">
        {n}
      </span>
      <div className="flex-1 space-y-0.5">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{body}</p>
        <Link
          href={href}
          className="inline-flex items-center gap-1 pt-0.5 text-xs font-medium text-emerald-400 hover:underline underline-offset-2"
        >
          {cta} →
        </Link>
      </div>
    </li>
  );
}

// =====================================================================
// SHARED HELPERS
// =====================================================================

function countP0(checklist: GeoChecklist): number {
  return [
    checklist.baidu_baike,
    checklist.souguo_baike,
    checklist.amap_poi,
    checklist.baidu_map_poi,
  ].filter(Boolean).length;
}


// =====================================================================
// DailyOpsBriefing — D21 / P2-3
// Hero strip 加在 PageHeader 下方,把"今天 + 这周节奏"放到第一眼.
// 7-day inline bar chart + week total vs prev week + 卡合规警示.
// =====================================================================

function DailyOpsBriefing({
  buckets,
  weekTotal,
  weekDelta,
  prevWeekTotal,
  stuckCompliance,
  slug,
}: {
  buckets: Array<{ label: string; count: number; isToday: boolean }>;
  weekTotal: number;
  weekDelta: number;
  prevWeekTotal: number;
  stuckCompliance: number;
  slug: string;
}) {
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);
  const deltaPositive = weekDelta > 0;
  const deltaNeutral = weekDelta === 0;
  const deltaLabel = deltaNeutral
    ? '与上周持平'
    : deltaPositive
      ? `比上周多 ${weekDelta}`
      : `比上周少 ${Math.abs(weekDelta)}`;
  const deltaColor = deltaNeutral
    ? 'text-muted-foreground'
    : deltaPositive
      ? 'text-emerald-400'
      : 'text-rose-400';
  return (
    <section
      className="rounded-2xl border p-5 shadow-sm"
      style={{
        borderColor: 'rgba(52,211,153,0.25)',
        background:
          'linear-gradient(135deg, rgba(52,211,153,0.06) 0%, rgba(8,9,10,0) 60%)',
      }}
    >
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-3">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-300">
              本周节奏
            </span>
            <span className="text-xs text-muted-foreground">
              过去 7 天派单 ·{' '}
              <Link
                href={`/t/${slug}/publish`}
                className="text-emerald-400 hover:underline underline-offset-2"
              >
                看明细 →
              </Link>
            </span>
          </div>
          <div className="flex items-end gap-1.5">
            {buckets.map((b, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div className="relative h-16 w-full overflow-hidden rounded-md bg-muted/30">
                  <div
                    className="absolute inset-x-0 bottom-0 rounded-md transition-all"
                    style={{
                      height: `${Math.max((b.count / maxCount) * 100, b.count > 0 ? 6 : 0)}%`,
                      background: b.isToday
                        ? 'linear-gradient(180deg, #34d399 0%, #10b981 100%)'
                        : 'rgba(52,211,153,0.55)',
                    }}
                  />
                  <span
                    className={`absolute inset-x-0 top-1 text-center text-[10px] font-medium ${
                      b.count > 0 ? 'text-foreground' : 'text-muted-foreground/40'
                    }`}
                  >
                    {b.count > 0 ? b.count : ''}
                  </span>
                </div>
                <span
                  className={`text-[10px] ${
                    b.isToday ? 'font-semibold text-emerald-300' : 'text-muted-foreground'
                  }`}
                >
                  {b.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex min-w-[160px] flex-col justify-center gap-3 border-t border-border pt-4 md:border-l md:border-t-0 md:pl-5 md:pt-0">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              7 日累计
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-semibold tracking-tight">{weekTotal}</span>
              <span className="text-xs text-muted-foreground">条</span>
            </div>
            <div className={`text-[11px] font-medium ${deltaColor}`}>
              {prevWeekTotal === 0 && weekTotal === 0 ? '本周尚未派单' : deltaLabel}
            </div>
          </div>
          {stuckCompliance > 0 ? (
            <Link
              href={`/t/${slug}/compliance?tab=pending`}
              className="rounded-md border border-rose-500/40 bg-rose-500/[0.10] px-3 py-2 text-xs hover:bg-rose-500/[0.15]"
            >
              <div className="font-medium text-rose-300">⚠️ {stuckCompliance} 条卡合规 &gt; 2h</div>
              <div className="text-[10px] text-rose-400/70">立即处理 →</div>
            </Link>
          ) : (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/[0.06] px-3 py-2 text-xs text-emerald-300">
              <div className="font-medium">✓ 合规队列健康</div>
              <div className="text-[10px] text-emerald-400/70">无积压</div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
