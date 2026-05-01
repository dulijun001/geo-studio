/**
 * Content uniqueness detection (V1.7 / borrowed from AIGEOTOOLS).
 *
 * Why we want this: the variant generator produces N platform-specific
 * versions of one source content_item. If two of those variants end up
 * substantively identical (LLM repeats itself, source signal is too thin),
 * publishing both wastes a slot and gets penalized by AI engines as
 * "duplicate content."
 *
 * Three-component scoring(借鉴 AIGEOTOOLS algo,中文做了适配):
 *   1. Jaccard token overlap     (40%) — character bigrams + Latin words
 *   2. Structural similarity     (30%) — paragraph / heading / list counts
 *   3. Key-information overlap   (30%) — numbers, quoted strings, citations
 *
 * Threshold convention:
 *   < 0.30  good       (variants are meaningfully different)
 *   < 0.70  warn       (some overlap, OK if topics are inherently close)
 *   >= 0.70 bad        (auto-trigger rewrite)
 *
 * Pure functions — no IO, no async. Worker integration enqueues a rewrite
 * when threshold breached.
 */

const JACCARD_WEIGHT = 0.4;
const STRUCTURAL_WEIGHT = 0.3;
const KEY_INFO_WEIGHT = 0.3;

const REWRITE_THRESHOLD = 0.7;
const WARN_THRESHOLD = 0.3;

export type SimilarityBreakdown = {
  jaccard: number;
  structural: number;
  key_info: number;
  /** Weighted total 0-1. */
  total: number;
};

export type SimilarityVerdict = 'good' | 'warn' | 'rewrite';

export type Comparison = {
  similarity: SimilarityBreakdown;
  verdict: SimilarityVerdict;
};

export function computeSimilarity(a: string, b: string): SimilarityBreakdown {
  const aTokens = tokens(a);
  const bTokens = tokens(b);
  const jaccard = jaccardOverlap(aTokens, bTokens);
  const tokensSignal = aTokens.size + bTokens.size > 0;

  const aStruct = structuralFeatures(a);
  const bStruct = structuralFeatures(b);
  const structural = cosineSimilarity(aStruct, bStruct);
  const structSignal = hasStructSignal(aStruct) || hasStructSignal(bStruct);

  const aKeys = keyInfo(a);
  const bKeys = keyInfo(b);
  const key_info = jaccardOverlap(aKeys, bKeys);
  const keySignal = aKeys.size + bKeys.size > 0;

  // Weighted average over components that have signal in at least one side.
  // This way: identical short text (no key info) → still 1.0; empty/empty → 0.
  const components: Array<{ sim: number; weight: number; on: boolean }> = [
    { sim: jaccard, weight: JACCARD_WEIGHT, on: tokensSignal },
    { sim: structural, weight: STRUCTURAL_WEIGHT, on: structSignal },
    { sim: key_info, weight: KEY_INFO_WEIGHT, on: keySignal },
  ];
  const active = components.filter((c) => c.on);
  const wSum = active.reduce((s, c) => s + c.weight, 0);
  const total =
    wSum === 0 ? 0 : active.reduce((s, c) => s + c.sim * c.weight, 0) / wSum;

  return { jaccard, structural, key_info, total };
}

export function classifySimilarity(total: number): SimilarityVerdict {
  if (total >= REWRITE_THRESHOLD) return 'rewrite';
  if (total >= WARN_THRESHOLD) return 'warn';
  return 'good';
}

export function compare(a: string, b: string): Comparison {
  const similarity = computeSimilarity(a, b);
  return { similarity, verdict: classifySimilarity(similarity.total) };
}

/**
 * Find the most-similar candidate to `target`. Returns null when no candidates.
 */
export function findMostSimilar(
  target: string,
  candidates: Array<{ id: string; body: string }>,
): { id: string; comparison: Comparison } | null {
  if (candidates.length === 0) return null;
  let best: { id: string; comparison: Comparison } | null = null;
  for (const c of candidates) {
    const cmp = compare(target, c.body);
    if (best === null || cmp.similarity.total > best.comparison.similarity.total) {
      best = { id: c.id, comparison: cmp };
    }
  }
  return best;
}

// ─── helpers ────────────────────────────────────────────────────────────

const STRIP_MD =
  /[#*_>`~\[\]()!\\]|\n{2,}/g;

function tokens(text: string): Set<string> {
  const stripped = text.replace(STRIP_MD, ' ').toLowerCase();
  const set = new Set<string>();
  // Latin words (≥ 2 chars)
  for (const m of stripped.matchAll(/[a-z0-9]{2,}/g)) set.add(m[0]);
  // Chinese character bigrams (every adjacent CJK char pair)
  const cn = stripped.replace(/[^一-鿿]+/g, ' ').trim();
  for (const seg of cn.split(/\s+/)) {
    for (let i = 0; i + 1 < seg.length; i += 1) {
      set.add(seg.slice(i, i + 2));
    }
  }
  return set;
}

function jaccardOverlap<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersect = 0;
  const smaller = a.size <= b.size ? a : b;
  const larger = a.size <= b.size ? b : a;
  for (const x of smaller) if (larger.has(x)) intersect += 1;
  const union = a.size + b.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

type StructFeatures = {
  paragraphs: number;
  headings: number;
  list_items: number;
  code_blocks: number;
  quotes: number;
};

function structuralFeatures(text: string): StructFeatures {
  return {
    // 0 paragraphs for empty input; otherwise paragraph count = breaks + 1.
    paragraphs: text.trim().length === 0 ? 0 : (text.match(/\n\s*\n/g) ?? []).length + 1,
    headings: (text.match(/^#{1,6}\s+/gm) ?? []).length,
    list_items: (text.match(/^\s*(?:[-*+]|\d+\.)\s+/gm) ?? []).length,
    code_blocks: (text.match(/```[\s\S]*?```/g) ?? []).length,
    quotes: (text.match(/^>\s+/gm) ?? []).length,
  };
}

function hasStructSignal(s: StructFeatures): boolean {
  return s.paragraphs + s.headings + s.list_items + s.code_blocks + s.quotes > 0;
}

function cosineSimilarity(a: StructFeatures, b: StructFeatures): number {
  const keys = ['paragraphs', 'headings', 'list_items', 'code_blocks', 'quotes'] as const;
  let dot = 0;
  let aMag = 0;
  let bMag = 0;
  for (const k of keys) {
    const av = a[k];
    const bv = b[k];
    dot += av * bv;
    aMag += av * av;
    bMag += bv * bv;
  }
  if (aMag === 0 || bMag === 0) return 0;
  return dot / (Math.sqrt(aMag) * Math.sqrt(bMag));
}

/**
 * Key information: the things AI engines / readers latch on to. Numbers
 * (prices, percentages, years), quoted strings, and citation-like patterns.
 *
 * Returned as a set of normalized tokens for Jaccard.
 */
function keyInfo(text: string): Set<string> {
  const set = new Set<string>();
  // Numbers (integers, decimals, percentages, ¥/$ prices, years)
  for (const m of text.matchAll(/[¥$]?\d[\d,.]*%?/g)) set.add(`num:${m[0]}`);
  // 「..」 / "..." quoted phrases (Chinese + English)
  for (const m of text.matchAll(/[「『"]([^」』"]{2,40})[」』"]/g)) {
    const q = m[1]?.trim();
    if (q) set.add(`q:${q}`);
  }
  // Citations: 《 ... 》 / 卫健委 / 中华医学会 / 期刊名等
  for (const m of text.matchAll(/《([^》]{2,40})》/g)) {
    if (m[1]) set.add(`cite:${m[1]}`);
  }
  for (const word of [
    '卫健委',
    '医学会',
    '指南',
    '协会',
    '研究',
    'JCI',
    '三甲',
    '医保',
    'WHO',
  ]) {
    if (text.includes(word)) set.add(`kw:${word}`);
  }
  return set;
}
