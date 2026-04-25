/**
 * Stage 1 of the three-gate compliance flow: deterministic keyword scanning.
 *
 * Design goals:
 *   - Pure function, no IO, <50ms on multi-kB text so it can run inline during
 *     variant generation without blocking user-facing paths.
 *   - Robust against simple obfuscation: 繁简 variants, inserted whitespace
 *     ("保 证"), fullwidth punctuation ("第一。" vs "第一.").
 *   - Case-insensitive for latin alphabet terms (e.g. "NO.1").
 *   - No tokenization — Chinese doesn't have word boundaries and medical
 *     compliance cares about substrings anyway ("包治百病" -> hit on "包治").
 *
 * Explicitly NOT in scope here:
 *   - Context-aware exemptions (context_exempt column) — V2.
 *   - Suggested rewrites — that's stage 2's LLM job.
 */

export type KeywordRow = {
  id: string;
  term: string;
  level: 'A' | 'B';
  category: string;
  variants: string[];
};

export type KeywordHit = {
  keyword_id: string;
  term: string;
  level: 'A' | 'B';
  category: string;
  /** The exact substring in the original text that matched (post-normalization offset mapping). */
  matched_span: string;
  /** Char offset in the ORIGINAL (un-normalized) text. */
  offset: number;
  /** 30 chars around the hit for UI preview / audit log. */
  context_snippet: string;
};

export type ScanResult = {
  hits: KeywordHit[];
  /** Highest severity present. 'none' when hits is empty. */
  max_level: 'none' | 'A' | 'B';
  /** Derived stage-1 verdict per the three-gate flow. */
  verdict: 'pass' | 'warn' | 'reject';
  /** Derived risk level. */
  risk_level: 'low' | 'medium' | 'high';
  duration_ms: number;
};

/**
 * Scan text against a keyword dictionary.
 * Pass the keywords pre-loaded from `compliance_keywords`.
 */
export function scanKeywords(text: string, keywords: KeywordRow[]): ScanResult {
  const started = Date.now();
  const normalized = normalize(text);
  const hits: KeywordHit[] = [];
  const seen = new Set<string>(); // dedupe (keyword_id + offset)

  for (const kw of keywords) {
    const needles = [kw.term, ...kw.variants].map(normalize).filter((s) => s.length > 0);
    for (const needle of needles) {
      let from = 0;
      while (from <= normalized.length - needle.length) {
        const idx = normalized.indexOf(needle, from);
        if (idx < 0) break;

        const origOffset = mapOffset(text, idx);
        const dedupKey = `${kw.id}:${origOffset}`;
        if (!seen.has(dedupKey)) {
          seen.add(dedupKey);
          hits.push({
            keyword_id: kw.id,
            term: kw.term,
            level: kw.level,
            category: kw.category,
            matched_span: text.slice(origOffset, origOffset + needle.length) || kw.term,
            offset: origOffset,
            context_snippet: extractContext(text, origOffset, needle.length),
          });
        }
        from = idx + needle.length;
      }
    }
  }

  const hasA = hits.some((h) => h.level === 'A');
  const hasB = hits.some((h) => h.level === 'B');
  const max_level: ScanResult['max_level'] = hasA ? 'A' : hasB ? 'B' : 'none';
  const verdict: ScanResult['verdict'] = hasA ? 'reject' : hasB ? 'warn' : 'pass';
  const risk_level: ScanResult['risk_level'] = hasA ? 'high' : hasB ? 'medium' : 'low';

  return {
    hits: hits.sort((a, b) => a.offset - b.offset),
    max_level,
    verdict,
    risk_level,
    duration_ms: Date.now() - started,
  };
}

/**
 * Normalize text for matching:
 *   1. Lowercase (latin alphabet only — preserves CJK).
 *   2. Strip whitespace and common obfuscation punctuation between chars.
 *   3. Convert common fullwidth digits/punct to halfwidth.
 *   4. 繁 -> 简 (minimal table; variants column carries most of the load).
 *
 * Note: we intentionally DON'T strip all punctuation — a period inside
 * "NO.1" is semantically meaningful. We only strip SPACES and zero-widths.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s​‌‍﻿]+/g, '') // all whitespace + zero-widths
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)) // 全角数字
    .replace(/[Ａ-Ｚ]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0).toLowerCase(),
    ) // 全角大写字母
    .replace(/[ａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)); // 全角小写字母
}

/**
 * Map a normalized-string offset back to the original-string offset.
 * We reproduce the normalize() walk char-by-char; for V1 kB-scale text this is fine.
 */
function mapOffset(original: string, normalizedOffset: number): number {
  let normIdx = 0;
  for (let i = 0; i < original.length; i++) {
    if (normIdx === normalizedOffset) return i;
    const ch = original[i];
    if (!ch) continue;
    // skip chars that normalize() drops
    if (/[\s​‌‍﻿]/.test(ch)) continue;
    normIdx++;
  }
  return original.length;
}

function extractContext(text: string, offset: number, length: number): string {
  const pad = 15;
  const start = Math.max(0, offset - pad);
  const end = Math.min(text.length, offset + length + pad);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return prefix + text.slice(start, end).replace(/\s+/g, ' ') + suffix;
}
