import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireTenantMember } from '@/lib/tenant';
import { PageHeader } from '@/components/page-header';
import { InlineGuide } from '@/components/inline-guide';

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
  ] = await Promise.all([
    supabase.from('content_items').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id).is('deleted_at', null),
    supabase.from('content_variants').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('compliance_status', 'pending').is('deleted_at', null),
    supabase.from('content_variants').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id).in('compliance_status', ['auto_approved', 'manual_approved']).is('deleted_at', null),
    supabase.from('publish_tasks').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id).gte('created_at', startOfDay.toISOString()).is('deleted_at', null),
    supabase.from('publish_tasks').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('status', 'published').is('deleted_at', null),
    supabase.from('questions').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('active', true).is('deleted_at', null),
    supabase.from('geo_snapshots').select('question_id').eq('tenant_id', tenant.id).eq('status', 'done').is('deleted_at', null),
    supabase.from('conversion_events').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id).is('deleted_at', null),
  ]);

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

      {/* Secondary metrics */}
      <section className="grid gap-4 md:grid-cols-3">
        <MiniStat label="内容总数" value={contentCount} caption="原始素材 + 解析后" />
        <MiniStat label="问题库" value={questionsTotal} caption="active = true 的问题" />
        <MiniStat label="转化事件" value={conversionEvents} caption="患者通过暗号回报" />
      </section>

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
