/**
 * Public article page — V1.7 + V1.8 wiring (D14, ADR 005, post-档位-A).
 *
 * Two render modes, decided per-content-item by what variants exist:
 *
 *   1. MIRROR mode (platform allows content reuse — wechat_mp / zhihu /
 *      baijiahao / toutiao_article / souhu): render the platform variant's
 *      body as sanitized HTML. AI engines (Doubao/元宝/Perplexity) get the
 *      same authoritative source we published externally — strongest GEO
 *      signal.
 *
 *   2. HUB mode (platform forbids content mirroring — douyin_image_text /
 *      douyin_script / xiaohongshu): render summary + outbound links to all
 *      published external URLs. Crawlers see the topic + author signals plus
 *      a fan-out to canonical sources, without us redistributing content
 *      that violates platform exclusivity TOS.
 *
 * Either mode emits Article / MedicalWebPage JSON-LD inline. The artifact
 * pipeline (llms.txt / feed.json / sitemap.xml) already references this URL
 * shape — we're filling in the actual destination they point at.
 *
 * Security:
 *   - Public-gate (slug + opt-in) reused from llms.txt route family
 *   - service-role read; no auth context
 *   - Markdown sanitized via lib/markdown/safe-render
 *   - notFound() for any tenant/content/variant resolution failure (D15:
 *     never reveal whether tenants exist)
 */

import { notFound } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import type { Metadata } from 'next';
import {
  buildArticleProfile,
  buildArticleSchema,
} from '@geo/geo-core';
import { resolvePublicTenant } from '@/lib/discoverability/public-gate';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { renderMarkdownSafe } from '@/lib/markdown/safe-render';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Platforms whose TOS / common practice allow content mirroring on the
 * publisher's own domain. Matched against content_variants.platform.
 *
 * Excluded by design:
 *   - douyin_*: short-video / image-text exclusive ecosystems
 *   - xiaohongshu: ToS forbids cross-posting same content elsewhere
 */
const MIRRORABLE_PLATFORMS = new Set([
  'wechat_mp',
  'zhihu',
  'baijiahao',
  'toutiao_article',
  'souhu',
]);

/** Min GEO score for a variant to be eligible as the mirrored copy. */
const MIRROR_GEO_MIN = 70;

const PUBLIC_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://geo.studio';

const PLATFORM_LABEL: Record<string, string> = {
  wechat_mp: '微信公众号',
  zhihu: '知乎',
  baijiahao: '百家号',
  toutiao_article: '今日头条',
  souhu: '搜狐号',
  douyin_script: '抖音视频',
  douyin_image_text: '抖音图文',
  xiaohongshu: '小红书',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteParams = { slug: string; id: string };

type ContentItemRow = {
  id: string;
  tenant_id: string;
  title: string;
  markdown: string | null;
  status: string;
  topics: string[] | null;
  created_at: string;
  updated_at: string;
};

type VariantRow = {
  id: string;
  platform: string;
  title: string | null;
  body: string;
  compliance_status: string;
  geo_score: { total?: number } | null;
};

type PublishTaskRow = {
  variant_id: string;
  published_url: string | null;
  published_at: string | null;
  status: string;
};

async function resolveArticle(
  slug: string,
  id: string,
): Promise<{
  tenant: { tenant_id: string; slug: string };
  item: ContentItemRow;
  variants: VariantRow[];
  externalLinks: Array<{ platform: string; url: string; published_at: string | null }>;
} | null> {
  noStore();
  if (!UUID_RE.test(id)) return null;
  const tenant = await resolvePublicTenant(slug);
  if (!tenant) return null;

  const supabase = getSupabaseServiceClient();
  const { data: item } = await supabase
    .from('content_items')
    .select('id, tenant_id, title, markdown, status, topics, created_at, updated_at')
    .eq('id', id)
    .eq('tenant_id', tenant.tenant_id)
    .eq('status', 'published')
    .is('deleted_at', null)
    .maybeSingle<ContentItemRow>();
  if (!item) return null;

  // Approved variants only — D5/D12 four-gate must have cleared. compliance_status
  // values come from compliance-review.ts: 'auto_approved' | 'manual_approved'.
  const { data: variants } = await supabase
    .from('content_variants')
    .select('id, platform, title, body, compliance_status, geo_score')
    .eq('content_item_id', id)
    .eq('tenant_id', tenant.tenant_id)
    .in('compliance_status', ['auto_approved', 'manual_approved'])
    .is('deleted_at', null);

  // Outbound links: published staff tasks across all variants.
  const variantIds = (variants ?? []).map((v) => v.id);
  let publishTasks: PublishTaskRow[] = [];
  if (variantIds.length > 0) {
    const { data } = await supabase
      .from('publish_tasks')
      .select('variant_id, published_url, published_at, status')
      .in('variant_id', variantIds)
      .eq('status', 'published')
      .is('deleted_at', null);
    publishTasks = (data ?? []) as PublishTaskRow[];
  }

  const variantById = new Map((variants ?? []).map((v) => [v.id, v as VariantRow]));
  const externalLinks = publishTasks
    .filter((t) => t.published_url)
    .map((t) => {
      const v = variantById.get(t.variant_id);
      return {
        platform: v?.platform ?? 'unknown',
        url: t.published_url as string,
        published_at: t.published_at,
      };
    });

  return {
    tenant: { tenant_id: tenant.tenant_id, slug: tenant.slug },
    item,
    variants: (variants ?? []) as VariantRow[],
    externalLinks,
  };
}

export async function generateMetadata({
  params,
}: {
  params: RouteParams;
}): Promise<Metadata> {
  const data = await resolveArticle(params.slug, params.id);
  if (!data) return { robots: { index: false, follow: false } };
  const summary = (data.item.markdown ?? '').slice(0, 160).replace(/\s+/g, ' ').trim();
  return {
    title: data.item.title,
    description: summary,
    robots: { index: true, follow: true },
    alternates: {
      canonical: `${PUBLIC_BASE_URL}/c/${params.slug}/articles/${params.id}`,
    },
  };
}

export default async function ArticlePage({ params }: { params: RouteParams }) {
  const data = await resolveArticle(params.slug, params.id);
  if (!data) notFound();

  const { tenant, item, variants, externalLinks } = data;

  // Pick mirrorable variant: first that's on a mirrorable platform AND has
  // a sufficient GEO score AND has a non-trivial body.
  const mirrored =
    variants.find(
      (v) =>
        MIRRORABLE_PLATFORMS.has(v.platform) &&
        (v.geo_score?.total ?? 0) >= MIRROR_GEO_MIN &&
        (v.body ?? '').trim().length > 200,
    ) ?? null;

  // Build Article schema.org JSON-LD. Prefer mirrored body when we have one
  // (richer signal); otherwise use the source content_item markdown so the
  // hub mode still publishes the article body in the JSON-LD payload that
  // AI engines parse — they don't render the page, they consume the JSON-LD.
  const profile = buildArticleProfile(
    {
      ...item,
      markdown: mirrored?.body ?? item.markdown,
    },
    { publicBaseUrl: PUBLIC_BASE_URL, tenantSlug: tenant.slug },
  );
  const schema = buildArticleSchema(profile);

  const renderedHtml = mirrored ? await renderMarkdownSafe(mirrored.body) : '';

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <script
        type="application/ld+json"
        // JSON.stringify is safe — buildArticleSchema returns plain data.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />

      <header className="mb-8 border-b border-gray-200 pb-6">
        <h1 className="text-3xl font-bold leading-tight text-gray-900">{item.title}</h1>
        {item.topics && item.topics.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {item.topics.map((topic) => (
              <span
                key={topic}
                className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600"
              >
                {topic}
              </span>
            ))}
          </div>
        )}
        <p className="mt-4 text-sm text-gray-500">
          发表于 {new Date(item.created_at).toLocaleDateString('zh-CN')}
          {item.updated_at !== item.created_at && (
            <>
              {' · 更新于 '}
              {new Date(item.updated_at).toLocaleDateString('zh-CN')}
            </>
          )}
        </p>
      </header>

      {mirrored ? (
        <article
          className="prose prose-gray max-w-none prose-headings:font-semibold prose-a:text-blue-600 hover:prose-a:underline"
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />
      ) : (
        <HubMode item={item} externalLinks={externalLinks} />
      )}

      {externalLinks.length > 0 && (
        <aside className="mt-12 rounded-lg border border-gray-200 bg-gray-50 p-6">
          <h2 className="mb-3 text-base font-semibold text-gray-900">
            该主题在其他平台的发布版本
          </h2>
          <ul className="space-y-2">
            {externalLinks.map((link, i) => (
              <li key={`${link.platform}-${i}`} className="text-sm">
                <a
                  href={link.url}
                  rel="noopener noreferrer ugc"
                  target="_blank"
                  className="text-blue-600 hover:underline"
                >
                  {PLATFORM_LABEL[link.platform] ?? link.platform}
                </a>
                {link.published_at && (
                  <span className="ml-2 text-xs text-gray-500">
                    {new Date(link.published_at).toLocaleDateString('zh-CN')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </aside>
      )}
    </main>
  );
}

function HubMode({
  item,
  externalLinks,
}: {
  item: ContentItemRow;
  externalLinks: Array<{ platform: string; url: string; published_at: string | null }>;
}) {
  // Hub mode: short summary from the source markdown's first paragraph,
  // then a clear "see it on" message. Don't render the full body — the
  // platforms in question (douyin/xhs) require exclusive content.
  const summary = ((item.markdown ?? '').split(/\n\s*\n/)[0] ?? '')
    .replace(/[#*_>`]/g, '')
    .trim()
    .slice(0, 300);

  return (
    <section className="prose prose-gray max-w-none">
      {summary && <p className="text-lg text-gray-700">{summary}</p>}
      {externalLinks.length === 0 ? (
        <p className="text-sm text-gray-500">
          本主题相关的内容已策划,正在分发到对应平台。
        </p>
      ) : (
        <p className="text-sm text-gray-600">
          本文已在以下平台发布,请前往查阅完整内容(下方链接)。
        </p>
      )}
    </section>
  );
}
