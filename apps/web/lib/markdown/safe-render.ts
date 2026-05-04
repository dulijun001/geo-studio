/**
 * Safe markdown → sanitized HTML for public-facing rendering.
 *
 * Defense in depth:
 *   - marked configured with `gfm: true, breaks: false` and NO custom HTML
 *     pass-through. Any raw HTML in source is escaped, not parsed.
 *   - sanitize-html runs on the output as a second wall: only the structural
 *     subset content actually uses (headings, paragraphs, lists, emphasis,
 *     links, blockquote, code, hr) is allowed. Everything else stripped.
 *
 * Why both: marked has had bypass CVEs in the past (e.g. CVE-2023-26056).
 * Pairing with sanitize-html ensures even a parser bug can't yield script
 * injection. Source markdown is LLM-generated — adversarial prompt injection
 * could attempt HTML smuggling.
 */

import 'server-only';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr',
  'ul', 'ol', 'li',
  'strong', 'em', 'b', 'i', 's',
  'a',
  'blockquote',
  'code', 'pre',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
];

const ALLOWED_ATTRS: sanitizeHtml.IOptions['allowedAttributes'] = {
  a: ['href', 'rel', 'target', 'title'],
  th: ['scope'],
  td: ['colspan', 'rowspan'],
};

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: ALLOWED_ATTRS,
  allowedSchemes: ['http', 'https', 'mailto'],
  // Force every external link to be opener-isolated and noindex-friendly.
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer ugc', target: '_blank' }),
  },
  // No iframes, no images (V1 — images come via separate field, not body).
  disallowedTagsMode: 'discard',
};

marked.setOptions({
  gfm: true,
  breaks: false,
});

export async function renderMarkdownSafe(md: string): Promise<string> {
  if (!md || md.trim().length === 0) return '';
  // marked.parse can run sync or async depending on extensions; we don't use
  // any so the sync overload is safe but we keep async for parity with future
  // additions like async highlighters.
  const rawHtml = await marked.parse(md, { async: true });
  return sanitizeHtml(rawHtml, SANITIZE_OPTIONS);
}
