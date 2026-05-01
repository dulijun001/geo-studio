import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireTenantMember } from '@/lib/tenant';
import { PageHeader } from '@/components/page-header';
import { InlineGuide } from '@/components/inline-guide';
import { fmtDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="概览"
        subtitle={
          <>
            <span className="font-medium text-foreground">{tenant.name}</span>
            <span className="mx-1.5 text-muted-foreground/60">·</span>
            <span>{tenant.industry === 'dental' ? '口腔行业' : tenant.industry}</span>
          </>
        }
      />

      <InlineGuide
        storageKey={`guide:overview:${tenant.slug}`}
        title="欢迎使用 GEO Studio"
        body="GEO Studio 把内容生产 → 合规审查 → 员工矩阵发布 → AI 引擎追踪 → 转化归因这五件事串成一条流水线。下面是今天 + 累计的关键数字,左边菜单可以钻到具体环节。"
        linkLabel="详细说明书"
        linkHref={`/t/${tenant.slug}/help`}
      />

      {/* Headline KPIs */}
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="待人工审合规"
          value={pendingCompliance}
          hint={pendingCompliance === 0 ? '无待审,系统正常' : '建议 2 小时内处理'}
          tone={pendingCompliance > 0 ? 'warning' : 'neutral'}
          href={`/t/${tenant.slug}/compliance?tab=pending`}
        />
        <KpiCard
          title="可派变体"
          value={approvedVariants}
          hint={approvedVariants === 0 ? '先生成几条变体' : '到派单页一键分配'}
          tone={approvedVariants > 0 ? 'good' : 'neutral'}
          href={`/t/${tenant.slug}/publish`}
        />
        <KpiCard
          title="今日派单"
          value={todayTasks}
          hint={`已发布 ${publishedTasks} 条 (累计)`}
          tone="brand"
          href={`/t/${tenant.slug}/publish`}
        />
        <KpiCard
          title="追踪覆盖率"
          value={`${trackingCoveragePct}%`}
          hint={`${snapshotsCovered}/${questionsTotal} 个问题已抓`}
          tone={trackingCoveragePct >= 50 ? 'good' : 'neutral'}
          href={`/t/${tenant.slug}/tracking`}
        />
      </section>

      {/* Doubao GEO Health pyramid */}
      <GeoHealthSection
        slug={tenant.slug}
        sov={{ own: sovOwn, comp: sovComp, askedAt: sovAskedAt, sessionUrl: sovSessionUrl }}
        weekly={{ p2: p2Done, p3: p3Done, p4: p4Done }}
        checklist={checklist}
      />

      {/* Secondary metrics */}
      <section className="grid gap-4 md:grid-cols-3">
        <MiniStat label="内容总数" value={contentCount} caption="原始素材 + 解析后" />
        <MiniStat label="问题库" value={questionsTotal} caption="active = true 的问题" />
        <MiniStat label="转化事件" value={conversionEvents} caption="患者通过暗号回报" />
      </section>

      {/* V1.7 — Discoverability layer status */}
      <Link
        href={`/t/${tenant.slug}/discoverability`}
        className={`flex flex-wrap items-center gap-3 rounded-md border p-4 transition hover:shadow-sm ${
          discoPublicEnabled
            ? 'border-emerald-200 bg-emerald-50/40'
            : 'border-border bg-card'
        }`}
      >
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            discoPublicEnabled ? 'bg-emerald-500' : 'bg-muted-foreground/40'
          }`}
        />
        <div className="flex-1 text-sm">
          <span className="font-medium">可发现层</span>
          <span className="ml-2 text-muted-foreground">
            {discoPublicEnabled ? '公开开启' : '关闭(尚未对外)'}
            {discoLastGenerated
              ? ` · artifacts 最近重建 ${fmtDateTime(discoLastGenerated)}`
              : ' · artifacts 未生成'}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">前往配置 →</span>
      </Link>

      {/* Quick start (only if tenant is empty) */}
      {isFreshTenant ? (
        <section className="card-surface p-6">
          <h2 className="mb-1 text-lg font-medium">5 步走完一遍流程</h2>
          <p className="mb-5 text-sm text-muted-foreground">
            首次接入,跟着下面顺序走一遍能体验全链路。每一步都有自己的页面。
          </p>
          <ol className="space-y-3">
            <QuickStep
              n={1}
              title="上传第一份素材"
              body="支持 Word / PDF。系统会解析为 markdown 进入下一步。"
              cta="上传内容"
              href={`/t/${tenant.slug}/content`}
            />
            <QuickStep
              n={2}
              title="生成变体"
              body="选目标平台(头条号 / 抖音 / 知乎 ...),AI 按 GEO 9 法改写 N 份。"
              cta="去内容详情"
              href={`/t/${tenant.slug}/content`}
            />
            <QuickStep
              n={3}
              title="合规通过"
              body="自动跑关键词扫描 + 豆包 LLM 审查。命中 B 级的会落到「待人工审批」。"
              cta="去合规审核"
              href={`/t/${tenant.slug}/compliance`}
            />
            <QuickStep
              n={4}
              title="派给员工"
              body="算法自动按平台 / 人设 / 节奏匹配。每个任务自动 mint 一个暗号。"
              cta="去派单"
              href={`/t/${tenant.slug}/publish`}
            />
            <QuickStep
              n={5}
              title="患者来店报暗号"
              body="发布的内容里带暗号 → 患者来店报 → 自动归到具体内容。看转化漏斗。"
              cta="看归因看板"
              href={`/t/${tenant.slug}/attribution`}
            />
          </ol>
        </section>
      ) : null}
    </div>
  );
}

function KpiCard({
  title,
  value,
  hint,
  tone,
  href,
}: {
  title: string;
  value: number | string;
  hint: string;
  tone: 'neutral' | 'good' | 'warning' | 'brand';
  href: string;
}) {
  const dotClass: Record<string, string> = {
    neutral: 'bg-slate-300',
    good: 'bg-emerald-500',
    warning: 'bg-amber-500',
    brand: 'bg-gradient-to-br from-indigo-500 to-violet-500',
  };
  return (
    <Link
      href={href}
      className="card-surface group block p-5 transition-shadow hover:shadow-md"
    >
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass[tone]}`} />
        {title}
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
    </Link>
  );
}

function MiniStat({ label, value, caption }: { label: string; value: number; caption: string }) {
  return (
    <div className="card-surface p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold">{value}</p>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground/80">{caption}</p>
    </div>
  );
}

// ============================================================================
// Doubao GEO Health pyramid (V1.6-4)
// ============================================================================

type GeoChecklist = {
  baidu_baike?: boolean;
  souguo_baike?: boolean;
  amap_poi?: boolean;
  baidu_map_poi?: boolean;
  dianping_score?: number;
  dianping_reviews?: number;
};

const WEEKLY_TARGETS = { p2: 5, p3: 3, p4: 14 } as const;

function GeoHealthSection({
  slug,
  sov,
  weekly,
  checklist,
}: {
  slug: string;
  sov: { own: number; comp: number; askedAt: string | null; sessionUrl: string | null };
  weekly: { p2: number; p3: number; p4: number };
  checklist: GeoChecklist;
}) {
  const sovTotal = sov.own + sov.comp;
  const sovPct = sovTotal > 0 ? (sov.own / sovTotal) * 100 : null;

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
    p1Reviews === 0 ? 'missing' : p1Score < 4 || p1Reviews < 30 ? 'weak' : 'ok';

  return (
    <section className="card-surface space-y-4 p-5">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-medium">豆包 GEO 健康度</h2>
          <p className="text-xs text-muted-foreground">
            按豆包 AI 答案构成的优先级金字塔。P0 不达标,后面再多内容也进不了豆包。
          </p>
        </div>
        <Link
          href={`/t/${slug}/settings/geo-checklist`}
          className="rounded-md border border-border bg-background px-2.5 py-1 text-xs hover:bg-muted"
        >
          维护 P0 / P1
        </Link>
      </header>

      {/* SOV — top-line outcome */}
      <div className="rounded-md border border-border bg-background px-4 py-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            豆包 SOV(最新)
          </span>
          <span className="text-2xl font-semibold tabular-nums">
            {sovPct === null ? '—' : `${sovPct.toFixed(1)}%`}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>本品牌 {sov.own} 次 vs 竞品 {sov.comp} 次</span>
          {sov.askedAt ? (
            <span>· {fmtDateTime(sov.askedAt)}</span>
          ) : (
            <span>· 还没跑过追踪</span>
          )}
          {sov.sessionUrl ? (
            <a
              href={sov.sessionUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-auto text-indigo-600 hover:underline"
            >
              打开豆包 ↗
            </a>
          ) : null}
        </div>
      </div>

      {/* P0-P4 tiers */}
      <div className="space-y-2.5">
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
          state={p1Status === 'missing' ? 'critical' : p1Status === 'weak' ? 'weak' : 'ok'}
          progress={
            p1Reviews === 0 ? '未录入' : `${p1Score.toFixed(1)}★ · ${p1Reviews} 评价`
          }
          progressPct={p1Status === 'missing' ? 0 : Math.min(100, (p1Reviews / 100) * 100)}
          rightLabel={
            p1Status === 'missing'
              ? '入驻大众点评'
              : p1Status === 'weak'
              ? '评价数太少 (建议 ≥ 30)'
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
          desc="本周抖音(字节生态加分)"
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
    ok: 'bg-emerald-500',
    weak: 'bg-amber-500',
    critical: 'bg-rose-500',
  }[state];
  const tierBg = {
    ok: 'bg-emerald-100 text-emerald-800',
    weak: 'bg-amber-100 text-amber-800',
    critical: 'bg-rose-100 text-rose-800',
  }[state];

  return (
    <div className="grid grid-cols-[44px_1fr_120px_1fr] items-center gap-3 rounded-md border border-border bg-background px-3 py-2.5 text-sm">
      <span className={`inline-flex h-7 w-9 items-center justify-center rounded-md text-xs font-bold ${tierBg}`}>
        {tier}
      </span>
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold tabular-nums">{progress}</p>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className={`h-full ${stateColor}`} style={{ width: `${progressPct}%` }} />
        </div>
      </div>
      <p className="text-right text-xs text-muted-foreground">{rightLabel}</p>
    </div>
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
          className="inline-flex items-center gap-1 pt-0.5 text-xs font-medium text-indigo-700 hover:underline underline-offset-2"
        >
          {cta} →
        </Link>
      </div>
    </li>
  );
}
