import Link from 'next/link';
import {
  type ArtifactInput,
  type AuditReport,
  buildArticleProfile,
  buildBrandProfile,
  buildFaqProfile,
  buildPhysicianProfile,
  buildServiceProfile,
  buildTestimonialProfile,
  runDiscoverabilityAudit,
} from '@geo/geo-core';
import { requireRole } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/page-header';
import { InlineGuide } from '@/components/inline-guide';
import { fmtDateTime } from '@/lib/format';
import { PublicToggle, RegenerateButton } from './hub-controls';

export const dynamic = 'force-dynamic';

const PUBLIC_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://geo.studio';

export default async function DiscoverabilityHubPage({
  params,
}: {
  params: { slug: string };
}) {
  const tenant = await requireRole(params.slug, ['owner', 'admin', 'operator']);
  const supabase = createSupabaseServerClient();

  // ── 1. Settings + flag ──────────────────────────────────────────────
  const { data: tenantRow } = await supabase
    .from('tenants')
    .select('settings')
    .eq('id', tenant.id)
    .single();
  const settings = (tenantRow?.settings ?? {}) as Record<string, unknown>;
  const disco = (settings.discoverability ?? {}) as Record<string, unknown>;
  const publicEnabled = disco.public_enabled === true;

  // ── 2. Brand (single) ───────────────────────────────────────────────
  const { data: brandRow } = await supabase
    .from('brands')
    .select('*')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const opts = { publicBaseUrl: PUBLIC_BASE_URL, tenantSlug: tenant.slug };

  if (!brandRow) {
    return (
      <div className="space-y-6">
        <PageHeader title="可发现层" subtitle="你品牌的对外 GEO 索引基础" />
        <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          这个租户还没有 brand 记录。请先在租户初始化阶段创建一个 brand。
        </div>
      </div>
    );
  }

  // ── 3. Filtered entities (D16 双闸) ──────────────────────────────
  const [staff, services, testimonials, faqs, articles, artifacts] = await Promise.all([
    supabase
      .from('staff_accounts')
      .select('id, tenant_id, brand_id, real_name, role, persona, credentials, bio_md_path, updated_at')
      .eq('tenant_id', tenant.id)
      .eq('geo_profile_visible', true)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    supabase
      .from('services')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('geo_visible', true)
      .is('deleted_at', null),
    supabase
      .from('testimonials')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('geo_visible', true)
      .eq('compliance_status', 'approved')
      .is('deleted_at', null),
    supabase
      .from('faqs')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('geo_visible', true)
      .is('deleted_at', null),
    supabase
      .from('content_items')
      .select('id, tenant_id, title, markdown, status, created_at, updated_at')
      .eq('tenant_id', tenant.id)
      .eq('status', 'published')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('discoverability_artifacts')
      .select('artifact_type, generated_at, content')
      .eq('tenant_id', tenant.id),
  ]);

  // ── 4. Build profiles ───────────────────────────────────────────────
  const brand = buildBrandProfile(brandRow, opts);
  const physicians = (staff.data ?? []).map((r) => buildPhysicianProfile(r, opts));
  const serviceProfiles = (services.data ?? []).map((r) => buildServiceProfile(r, opts));
  const testimonialProfiles = (testimonials.data ?? []).map((r) =>
    buildTestimonialProfile(r, opts),
  );
  const faqProfiles = (faqs.data ?? []).map((r) => buildFaqProfile(r, opts));
  const articleProfiles = (articles.data ?? []).map((r) => buildArticleProfile(r, opts));

  // ── 5. Audit ────────────────────────────────────────────────────────
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentArticles = (articles.data ?? []).filter(
    (a) => new Date(a.created_at).getTime() >= thirtyDaysAgo,
  ).length;

  const lastGen = (artifacts.data ?? [])
    .map((a) => a.generated_at as string)
    .sort()
    .at(-1) ?? null;

  const input: ArtifactInput = {
    tenant_id: tenant.id,
    tenant_slug: tenant.slug,
    public_base_url: PUBLIC_BASE_URL,
    generated_at: new Date().toISOString(),
    brand,
    physicians,
    services: serviceProfiles,
    testimonials: testimonialProfiles,
    faqs: faqProfiles,
    articles: articleProfiles,
  };

  const audit = runDiscoverabilityAudit(input, {
    artifacts_generated_at: lastGen,
    public_enabled: publicEnabled,
    articles_recent: recentArticles,
  });

  // Counts for stat cards
  const counts = {
    physicians: physicians.length,
    services: serviceProfiles.length,
    testimonials: testimonialProfiles.length,
    faqs: faqProfiles.length,
    articles: articleProfiles.length,
  };

  // Public URLs (only meaningful if publicEnabled)
  const publicUrls = {
    llms: `${PUBLIC_BASE_URL}/c/${tenant.slug}/llms.txt`,
    llmsFull: `${PUBLIC_BASE_URL}/c/${tenant.slug}/llms-full.txt`,
    feed: `${PUBLIC_BASE_URL}/c/${tenant.slug}/ai-content-feed.json`,
    sitemap: `${PUBLIC_BASE_URL}/c/${tenant.slug}/ai-sitemap.xml`,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="可发现层"
        subtitle="让你的品牌、医生、服务、客户见证、FAQ 在 AI 引擎答案里被结构化引用"
        actions={<RegenerateButton tenantSlug={tenant.slug} />}
      />

      <InlineGuide
        storageKey={`guide:discoverability:${tenant.slug}`}
        title="什么是可发现层"
        body={'GEO 工程分三层:可发现 / 生产 / 验证。这一层让豆包 / 元宝 / Perplexity 等 AI 爬虫能「读懂」你站点的结构(Schema.org JSON-LD),知道重要页面(llms.txt + sitemap),拿到聚合实体清单(Content Feed)。是 SOV 数据真正能改善的上游杠杆。'}
        steps={[
          '完成基础数据填充(brand 资料、医生 geo 可见、服务、FAQ、客户见证)',
          '右上角点「立即重建」或等 cron(每日 09:00)生成 4 个 artifact',
          '打开公开开关,豆包 / 元宝爬虫就能在 /c/{slug}/llms.txt 拿到信号',
        ]}
        linkLabel="完整设计 + ADR-005"
        linkHref={`/t/${tenant.slug}/help#discoverability`}
      />

      {/* Public toggle banner */}
      <PublicToggle
        tenantSlug={tenant.slug}
        enabled={publicEnabled}
        publicUrls={publicUrls}
      />

      {/* Audit summary */}
      <AuditCard audit={audit} lastGenerated={lastGen} />

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="医生(已公开)" value={counts.physicians} link={`/t/${tenant.slug}/settings/staff`} />
        <Stat label="服务" value={counts.services} link={`/t/${tenant.slug}/discoverability/services`} />
        <Stat label="客户见证(已通过)" value={counts.testimonials} link={`/t/${tenant.slug}/discoverability/testimonials`} />
        <Stat label="FAQ" value={counts.faqs} link={`/t/${tenant.slug}/discoverability/faqs`} />
        <Stat label="近期文章" value={counts.articles} link={`/t/${tenant.slug}/content`} />
      </div>

      {/* Sub-pages */}
      <div className="rounded-md border border-border bg-card">
        <div className="border-b border-border px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          管理
        </div>
        <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0">
          <SubPageLink
            slug={tenant.slug}
            sub="brand"
            title="品牌资料"
            sub_text="地址 / 营业时间 / 医疗专科 / 资质 — schema.org/MedicalBusiness 来源"
          />
          <SubPageLink
            slug={tenant.slug}
            sub="services"
            title="服务目录"
            sub_text="种植 / 正畸 / 儿牙等核心项目,每项可独立公开"
          />
          <SubPageLink
            slug={tenant.slug}
            sub="testimonials"
            title="客户见证"
            sub_text="必须先过合规四道门 + 默认匿名 + 显式开 geo_visible"
          />
          <SubPageLink
            slug={tenant.slug}
            sub="faqs"
            title="FAQ 问答"
            sub_text="医保 / 价格 / 流程 / 风险 等,默认 geo_visible=true"
          />
        </div>
      </div>

      {/* Artifact previews */}
      <ArtifactPreviews artifacts={(artifacts.data ?? []) as Array<{ artifact_type: string; generated_at: string; content: string }>} />
    </div>
  );
}

function AuditCard({ audit, lastGenerated }: { audit: AuditReport; lastGenerated: string | null }) {
  const colorByGrade = {
    A: 'text-emerald-400 bg-emerald-500/[0.10] border-emerald-500/30',
    B: 'text-emerald-400 bg-sky-500/[0.10] border-sky-500/30',
    C: 'text-amber-300 bg-amber-500/[0.10] border-amber-500/30',
    D: 'text-orange-700 bg-orange-50 border-orange-200',
    F: 'text-rose-300 bg-rose-500/[0.10] border-rose-500/30',
  } as const;

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex items-baseline justify-between border-b border-border px-5 py-3">
        <div>
          <h2 className="text-sm font-medium">GEO 基础设施健康度</h2>
          <p className="text-xs text-muted-foreground">
            {lastGenerated ? `artifacts 最近重建于 ${fmtDateTime(lastGenerated)}` : 'artifacts 尚未生成 — 点右上角"立即重建"'}
          </p>
        </div>
        <div className={`rounded-md border px-3 py-1.5 text-xl font-semibold tracking-tight ${colorByGrade[audit.grade]}`}>
          {audit.total}<span className="ml-1 text-xs font-normal opacity-60">/ 100</span>
          <span className="ml-2 text-sm font-medium">{audit.grade}</span>
        </div>
      </div>
      <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-4 md:divide-x md:divide-y-0">
        <DimCard label="完整度" dim={audit.dimensions.completeness} />
        <DimCard label="数据规模" dim={audit.dimensions.data_scale} />
        <DimCard label="可信度" dim={audit.dimensions.trust} />
        <DimCard label="时效性" dim={audit.dimensions.freshness} />
      </div>
    </div>
  );
}

function DimCard({ label, dim }: { label: string; dim: AuditReport['dimensions']['completeness'] }) {
  const pct = Math.round((dim.score / dim.max) * 100);
  return (
    <div className="space-y-2 p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold">{dim.score}/{dim.max}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-foreground/70"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ul className="space-y-1 text-xs">
        {dim.checks.map((c) => (
          <li key={c.name} className="flex items-start gap-1.5">
            <span className={c.passed ? 'text-emerald-400' : 'text-muted-foreground'}>
              {c.passed ? '✓' : '○'}
            </span>
            <span className={c.passed ? '' : 'text-muted-foreground'}>{c.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value, link }: { label: string; value: number; link: string }) {
  return (
    <Link
      href={link}
      className="rounded-md border border-border bg-card p-4 transition hover:border-foreground/30 hover:bg-muted/50"
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
    </Link>
  );
}

function SubPageLink({
  slug,
  sub,
  title,
  sub_text,
}: {
  slug: string;
  sub: string;
  title: string;
  sub_text: string;
}) {
  return (
    <Link
      href={`/t/${slug}/discoverability/${sub}`}
      className="block px-5 py-4 transition hover:bg-muted/50"
    >
      <div className="flex items-center justify-between">
        <div className="font-medium">{title}</div>
        <span className="text-muted-foreground">→</span>
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{sub_text}</div>
    </Link>
  );
}

function ArtifactPreviews({
  artifacts,
}: {
  artifacts: Array<{ artifact_type: string; generated_at: string; content: string }>;
}) {
  if (artifacts.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        artifacts 尚未生成。点右上角「立即重建」启动一次 worker 任务(几秒完成)。
      </div>
    );
  }

  const byType = new Map(artifacts.map((a) => [a.artifact_type, a]));
  const order: Array<{ key: string; label: string; lang: string }> = [
    { key: 'llms_txt', label: 'llms.txt', lang: 'plaintext' },
    { key: 'llms_full', label: 'llms-full.txt', lang: 'plaintext' },
    { key: 'feed_json', label: 'feed.json', lang: 'json' },
    { key: 'sitemap_xml', label: 'sitemap.xml', lang: 'xml' },
  ];

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium">artifacts 预览</h2>
      <div className="space-y-2">
        {order.map((o) => {
          const a = byType.get(o.key);
          if (!a) return null;
          return (
            <details
              key={o.key}
              className="rounded-md border border-border bg-card"
            >
              <summary className="flex cursor-pointer items-center justify-between px-4 py-2.5 text-sm">
                <span className="font-mono">{o.label}</span>
                <span className="text-xs text-muted-foreground">
                  {(a.content.length / 1024).toFixed(1)} KB · {fmtDateTime(a.generated_at)}
                </span>
              </summary>
              <pre className="max-h-96 overflow-auto border-t border-border bg-muted/30 px-4 py-3 text-xs leading-relaxed">
                {a.content.length > 8000
                  ? `${a.content.slice(0, 8000)}\n\n… (${(a.content.length - 8000).toLocaleString()} more chars truncated in preview)`
                  : a.content}
              </pre>
            </details>
          );
        })}
      </div>
    </div>
  );
}
