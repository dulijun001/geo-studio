/**
 * Brand mention scanner — finds occurrences of brand-vocab terms in raw_response.
 *
 * Per ADR-002, this is the PRIMARY signal for GEO tracking. citation URLs are
 * a bonus, not the headline metric.
 *
 * Why a separate file from compliance/scanner.ts:
 *   - Compliance scanning emits a verdict (pass/warn/reject); brand scanning
 *     just emits a list of mentions for downstream analytics.
 *   - The shapes of input rows differ (compliance has level A/B; brand has
 *     term_type brand/doctor/service/location_alias/competitor).
 *   - A premature shared abstraction would constrain both. We can extract the
 *     normalize() / mapOffset() helpers later if a third caller appears.
 */

export type VocabRow = {
  id: string;
  term: string;
  term_type: 'brand' | 'doctor' | 'service' | 'location_alias' | 'competitor';
  aliases: string[];
};

export type BrandMention = {
  vocab_id: string;
  term: string;
  term_type: VocabRow['term_type'];
  /** The exact substring in the original text (after normalization mapping). */
  matched_span: string;
  /** Char offset in the ORIGINAL text. */
  offset: number;
  /** ~30 chars around the hit for UI preview. */
  context_snippet: string;
};

export type BrandScanResult = {
  mentions: BrandMention[];
  /** Counts grouped by term_type for quick SOV math. */
  count_by_type: Record<VocabRow['term_type'], number>;
  /** Distinct terms hit (vocab_id set size). */
  distinct_terms: number;
  duration_ms: number;
};

const EMPTY_COUNTS: Record<VocabRow['term_type'], number> = {
  brand: 0,
  doctor: 0,
  service: 0,
  location_alias: 0,
  competitor: 0,
};

export function scanBrandMentions(text: string, vocab: VocabRow[]): BrandScanResult {
  const started = Date.now();
  const normalized = normalize(text);
  const mentions: BrandMention[] = [];
  const seen = new Set<string>();

  for (const v of vocab) {
    const needles = [v.term, ...v.aliases].map(normalize).filter((s) => s.length > 0);
    for (const needle of needles) {
      let from = 0;
      while (from <= normalized.length - needle.length) {
        const idx = normalized.indexOf(needle, from);
        if (idx < 0) break;

        const origOffset = mapOffset(text, idx);
        const dedupKey = `${v.id}:${origOffset}`;
        if (!seen.has(dedupKey)) {
          seen.add(dedupKey);
          mentions.push({
            vocab_id: v.id,
            term: v.term,
            term_type: v.term_type,
            matched_span: text.slice(origOffset, origOffset + needle.length) || v.term,
            offset: origOffset,
            context_snippet: extractContext(text, origOffset, needle.length),
          });
        }
        from = idx + needle.length;
      }
    }
  }

  const count_by_type = { ...EMPTY_COUNTS };
  const distinct = new Set<string>();
  for (const m of mentions) {
    count_by_type[m.term_type] += 1;
    distinct.add(m.vocab_id);
  }

  return {
    mentions: mentions.sort((a, b) => a.offset - b.offset),
    count_by_type,
    distinct_terms: distinct.size,
    duration_ms: Date.now() - started,
  };
}

/**
 * SOV: own brand mentions / (own + competitor mentions).
 * Returns null when there are no brand mentions at all (denominator = 0).
 */
export function shareOfVoice(result: BrandScanResult): number | null {
  const own = result.count_by_type.brand;
  const comp = result.count_by_type.competitor;
  const denom = own + comp;
  if (denom === 0) return null;
  return own / denom;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s​‌‍﻿]+/g, '')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[Ａ-Ｚ]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0).toLowerCase(),
    )
    .replace(/[ａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

function mapOffset(original: string, normalizedOffset: number): number {
  let normIdx = 0;
  for (let i = 0; i < original.length; i++) {
    if (normIdx === normalizedOffset) return i;
    const ch = original[i];
    if (!ch) continue;
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
