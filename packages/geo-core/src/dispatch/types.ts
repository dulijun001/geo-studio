/**
 * Dispatch module types.
 *
 * The dispatcher is pure: it takes a snapshot of variants + staff + existing
 * tasks and returns assignment proposals. It does NOT read or write the DB.
 * Persistence is the caller's responsibility (see worker / server action).
 *
 * Why pure: dispatch is the only V1 feature with enough algorithmic weight
 * that we want to unit-test it deterministically (persona/platform matching,
 * daily caps, anti-collision). DB-coupled code would make tests painful.
 */

export type VariantCandidate = {
  id: string;
  platform: string;
  /** Topic tags inherited from the source content_item. Used for persona matching. */
  topics: string[];
  /** When compliance finished. Variants that have aged past a threshold get priority. */
  ready_at: Date;
};

export type StaffCandidate = {
  id: string;
  /** Persona tags (e.g. 'pediatric', 'implant', 'oral-surgery'). Matched against variant topics. */
  persona_tags: string[];
  /** Which platforms this staff has accounts for. */
  platforms: string[];
  /** Count of tasks already assigned today — subtracted from daily cap. */
  tasks_today: number;
  /**
   * V1.11: 核心发布号开关. `false` (or `undefined` once V1.11 rolled out) = 跳过派单.
   * Source = `staff_accounts.settings.publishing.is_active`.
   * Caller must resolve missing/undefined → false explicitly when building this
   * candidate (we don't default in the algorithm — explicit is safer).
   */
  is_active: boolean;
  /** Per-staff daily quota override. Null/undefined = fallback to dispatch-input global. */
  daily_quota?: number;
};

export type DispatchInput = {
  /** Variants eligible for dispatch (compliance approved, not already dispatched). */
  variants: VariantCandidate[];
  /** Active staff that can receive assignments. */
  staff: StaffCandidate[];
  /** Assignments already made today (for anti-collision: same variant not to two staff). */
  existing_assignments: Array<{ variant_id: string; staff_id: string }>;
  /** Max tasks per staff per day. Caller should read this from tenant.settings. */
  daily_cap_per_staff: number;
  /** Deterministic seed for tie-breaking — pass today's date so same-day re-runs are stable. */
  seed: string;
};

export type DispatchProposal = {
  variant_id: string;
  staff_id: string;
  /** Jaccard similarity 0-1 between variant topics and staff persona tags. */
  match_score: number;
  /** Which time window: 'morning' (09-12) or 'afternoon' (14-18). */
  time_window: 'morning' | 'afternoon';
};

export type DispatchResult = {
  proposals: DispatchProposal[];
  /** Variants that failed to find a staff (no platform match, all caps reached, etc). */
  unmatched: Array<{ variant_id: string; reason: string }>;
  /** Staff who got zero tasks this round. Helpful for ops to investigate. */
  idle_staff: string[];
};
