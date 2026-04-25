/**
 * Core dispatch algorithm.
 *
 * Hard constraints (enforced — violations = bug):
 *   H1. No variant assigned to >1 staff in the same day (anti-collision).
 *   H2. Staff.platforms must include variant.platform (platform capability).
 *   H3. No staff receives more than `daily_cap_per_staff` tasks (including pre-existing).
 *
 * Soft scoring (used to rank candidates after hard-filtering):
 *   S1. Jaccard similarity between variant.topics and staff.persona_tags.
 *   S2. When two staff tie on S1, break deterministically with stableHash(seed + ids).
 *
 * Time window split:
 *   - First half of each staff's quota goes to 'morning' (09-12).
 *   - Second half goes to 'afternoon' (14-18).
 *   This spreads feed activity and makes one-shot "whole-matrix-at-noon" detection harder.
 *
 * Greedy loop: for each variant (ready_at asc), pick the best-fit available staff.
 * Greedy is fine for ~40 staff × ~50 variants/day; optimality would be overkill.
 */

import { jaccardSimilarity, stableHash } from './scoring';
import type {
  DispatchInput,
  DispatchProposal,
  DispatchResult,
  StaffCandidate,
  VariantCandidate,
} from './types';

export function dispatchDaily(input: DispatchInput): DispatchResult {
  const { variants, staff, existing_assignments, daily_cap_per_staff, seed } = input;

  // Mutable per-staff counters. Start from existing tasks so caps account for previous runs.
  const taskCount = new Map<string, number>(staff.map((s) => [s.id, s.tasks_today]));
  // Variants already taken today (H1).
  const takenVariants = new Set(existing_assignments.map((a) => a.variant_id));

  // Sort variants: oldest-ready first (fairness — don't let a backlog starve).
  const sortedVariants = [...variants]
    .filter((v) => !takenVariants.has(v.id))
    .sort((a, b) => a.ready_at.getTime() - b.ready_at.getTime());

  const proposals: DispatchProposal[] = [];
  const unmatched: Array<{ variant_id: string; reason: string }> = [];

  for (const variant of sortedVariants) {
    const pick = pickBestStaff(variant, staff, taskCount, daily_cap_per_staff, seed);
    if (!pick) {
      unmatched.push({
        variant_id: variant.id,
        reason: diagnoseUnmatchReason(variant, staff, taskCount, daily_cap_per_staff),
      });
      continue;
    }

    const current = taskCount.get(pick.staff.id) ?? 0;
    const timeWindow: 'morning' | 'afternoon' = current < Math.ceil(daily_cap_per_staff / 2)
      ? 'morning'
      : 'afternoon';

    proposals.push({
      variant_id: variant.id,
      staff_id: pick.staff.id,
      match_score: pick.score,
      time_window: timeWindow,
    });
    taskCount.set(pick.staff.id, current + 1);
  }

  const idle_staff = staff
    .filter((s) => (taskCount.get(s.id) ?? 0) === s.tasks_today)
    .map((s) => s.id);

  return { proposals, unmatched, idle_staff };
}

function pickBestStaff(
  variant: VariantCandidate,
  staff: StaffCandidate[],
  taskCount: Map<string, number>,
  dailyCap: number,
  seed: string,
): { staff: StaffCandidate; score: number } | null {
  const eligible = staff.filter((s) => {
    if (!s.platforms.includes(variant.platform)) return false; // H2
    if ((taskCount.get(s.id) ?? 0) >= dailyCap) return false; // H3
    return true;
  });
  if (eligible.length === 0) return null;

  // Score each.
  const scored = eligible.map((s) => ({
    staff: s,
    score: jaccardSimilarity(variant.topics, s.persona_tags),
    tiebreak: stableHash(`${seed}:${variant.id}:${s.id}`),
  }));

  // Higher score > lower taskCount (prefer less-loaded) > stable tiebreak.
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const loadA = taskCount.get(a.staff.id) ?? 0;
    const loadB = taskCount.get(b.staff.id) ?? 0;
    if (loadA !== loadB) return loadA - loadB;
    return a.tiebreak - b.tiebreak;
  });

  const best = scored[0];
  if (!best) return null;
  return { staff: best.staff, score: best.score };
}

function diagnoseUnmatchReason(
  variant: VariantCandidate,
  staff: StaffCandidate[],
  taskCount: Map<string, number>,
  dailyCap: number,
): string {
  const platformCapable = staff.filter((s) => s.platforms.includes(variant.platform));
  if (platformCapable.length === 0) return `no staff supports platform ${variant.platform}`;
  const underCap = platformCapable.filter((s) => (taskCount.get(s.id) ?? 0) < dailyCap);
  if (underCap.length === 0) return `all ${platformCapable.length} eligible staff at daily cap`;
  return 'unknown — check dispatcher logic';
}
