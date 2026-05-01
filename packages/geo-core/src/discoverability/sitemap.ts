/**
 * AI Sitemap (XML) generator.
 *
 * Standard sitemap.xml format with `<priority>` weighted by entity type:
 *   brand homepage     1.0
 *   service pages      0.9
 *   doctor pages       0.8
 *   articles           0.7
 *   testimonials       0.6
 *   faqs page          0.6
 *
 * AI crawlers (Perplexity, ChatGPT, etc.) honor the standard sitemap
 * protocol — no AI-specific extensions needed at V1.7. Future versions
 * could add hints (e.g. <ai:summary>) but the spec is still draft.
 */

import type { ArtifactInput } from './artifact-input';

export function generateAiSitemap(input: ArtifactInput): string {
  const urls: Array<{ loc: string; lastmod?: string; priority: number }> = [];

  urls.push({ loc: input.brand.url, lastmod: dateOnly(input.brand.updated_at), priority: 1.0 });

  for (const s of input.services) {
    urls.push({ loc: s.url, lastmod: dateOnly(s.updated_at), priority: 0.9 });
  }
  for (const p of input.physicians) {
    urls.push({ loc: p.url, lastmod: dateOnly(p.updated_at), priority: 0.8 });
  }
  for (const a of input.articles) {
    urls.push({ loc: a.url, lastmod: dateOnly(a.updated_at), priority: 0.7 });
  }
  for (const t of input.testimonials) {
    urls.push({ loc: t.url, lastmod: dateOnly(t.updated_at), priority: 0.6 });
  }
  if (input.faqs.length > 0) {
    urls.push({
      loc: `${input.public_base_url}/c/${input.tenant_slug}/faqs`,
      priority: 0.6,
    });
  }

  const xmlEntries = urls
    .map((u) => {
      const parts = [`    <loc>${escapeXml(u.loc)}</loc>`];
      if (u.lastmod) parts.push(`    <lastmod>${u.lastmod}</lastmod>`);
      parts.push(`    <priority>${u.priority.toFixed(1)}</priority>`);
      return `  <url>\n${parts.join('\n')}\n  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${xmlEntries}\n</urlset>\n`;
}

function dateOnly(iso: string): string {
  return iso.split('T')[0] ?? '';
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
