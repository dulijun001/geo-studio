/**
 * Build an ArticleProfile from a content_items + content_variants pair.
 *
 * Currently we expose ARTICLES (the source content_item) not variants.
 * Reasoning: variants are platform-specific (头条 / 抖音 / 公众号 ...) and live
 * on those platforms; the canonical "we wrote about X" entity is the
 * underlying content_item. Variants stay private to the dispatch flow.
 */

import type { ArticleProfile } from '../types';

type ContentItemRow = {
  id: string;
  tenant_id: string;
  title: string;
  markdown: string | null;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
};

type BuildArticleOpts = {
  publicBaseUrl: string;
  tenantSlug: string;
  /** Optional doctor display name pulled separately (we don't normalize that into content_items). */
  authorName?: string;
  /** Override published_at; default uses created_at. */
  publishedAt?: string;
};

export function buildArticleProfile(
  row: ContentItemRow,
  opts: BuildArticleOpts,
): ArticleProfile {
  const body = row.markdown?.trim() ?? '';
  return {
    kind: 'article',
    id: row.id,
    tenant_id: row.tenant_id,
    url: `${opts.publicBaseUrl}/c/${opts.tenantSlug}/articles/${row.id}`,
    headline: row.title,
    summary: extractSummary(body),
    body,
    author_name: opts.authorName,
    published_at: opts.publishedAt ?? toIsoString(row.created_at),
    updated_at: toIsoString(row.updated_at),
  };
}

/** First paragraph or first 200 chars, whichever is shorter. */
function extractSummary(md: string): string | undefined {
  if (md.length === 0) return undefined;
  const firstPara = md.split(/\n\s*\n/)[0]?.replace(/[#*_>`]/g, '').trim() ?? '';
  if (firstPara.length === 0) return undefined;
  return firstPara.length > 200 ? `${firstPara.slice(0, 200)}…` : firstPara;
}

function toIsoString(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}
