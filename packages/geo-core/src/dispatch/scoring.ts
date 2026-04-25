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
