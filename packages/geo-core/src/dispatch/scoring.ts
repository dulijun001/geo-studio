/**
 * Scoring primitives for the dispatcher.
 * Kept isolated so they can be unit-tested and swapped without touching the main loop.
 */

/**
 * Jaccard similarity between two string sets (case-insensitive).
 * Returns 0 for empty intersection or either empty set.
 */
export function jaccardSimilarity(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a.map((s) => s.toLowerCase()));
  const setB = new Set(b.map((s) => s.toLowerCase()));
  let intersection = 0;
  for (const x of setA) if (setB.has(x)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * V1.11: topic-staff match score with character-trigram fallback.
 *
 * Why: `runAiDraft` writes content_items.topics = [topic_sentence, audience]
 * (e.g. `["种植牙 5 年存活率", "60-75 岁缺牙人群"]`), while staff.persona.tags
 * are short labels (e.g. `["种植牙知识", "复杂植骨"]`). Pure Jaccard returns 0
 * for this combination → dispatcher degenerates to round-robin and "专长派单"
 * becomes a no-op. (V1.10 has been silently doing this since 2026-05-19.)
 *
 * Pure substring also fails: "种植牙知识" is NOT a substring of "种植牙 5 年存
 * 活率", and vice versa. The actual shared signal is the 3-character n-gram
 * "种植牙" appearing in both. Chinese terminology overlap reliably surfaces
 * at the 3-gram level (clinical labels are 2-4 chars; topics embed them).
 *
 * Strategy:
 *   1. Try exact Jaccard first — highest fidelity when both sides are clean tags.
 *   2. If Jaccard = 0, fall back to char-trigram overlap: count how many persona
 *      tags share ≥1 trigram with any topic, scale by personaTags.length, cap
 *      at 0.7 so n-gram matches never out-score a real Jaccard.
 *
 * Known noise: "种植牙" trigram appears in "种植牙 5 年存活率" (correct match)
 * AND in hypothetical "拔种植牙后" / "种植牙周炎术后护理" (boundary cases).
 * Acceptable in V1.11; V1.12 ticket will move specialty into a dedicated tag
 * field on content_items (LLM-extracted at draft time).
 */
export function topicPersonaScore(
  topics: readonly string[],
  personaTags: readonly string[],
): number {
  const exact = jaccardSimilarity(topics, personaTags);
  if (exact > 0) return exact;
  if (topics.length === 0 || personaTags.length === 0) return 0;

  // Build the union of all topic trigrams (whitespace stripped, lowercased).
  const topicGrams = new Set<string>();
  for (const t of topics) {
    for (const g of charNgrams(t, 3)) topicGrams.add(g);
  }
  if (topicGrams.size === 0) return 0;

  let hits = 0;
  for (const tag of personaTags) {
    const tagGrams = charNgrams(tag, 3);
    if (tagGrams.size === 0) continue;
    let tagHit = false;
    for (const g of tagGrams) {
      if (topicGrams.has(g)) {
        tagHit = true;
        break;
      }
    }
    if (tagHit) hits++;
  }
  if (hits === 0) return 0;
  return Math.min(0.7, hits / personaTags.length);
}

function charNgrams(s: string, n: number): Set<string> {
  const out = new Set<string>();
  // Strip whitespace (incl. ideographic space) so "种植牙 5 年" still produces
  // the meaningful "种植牙" trigram instead of being broken by the space.
  const norm = s.toLowerCase().replace(/\s+/g, '');
  if (norm.length === 0) return out;
  if (norm.length < n) {
    out.add(norm);
    return out;
  }
  for (let i = 0; i <= norm.length - n; i++) out.add(norm.slice(i, i + n));
  return out;
}

/**
 * Simple deterministic hash for seeded tie-breaking.
 * Not crypto — just stable enough that two dispatch runs on the same day pick the same staff.
 */
export function stableHash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
