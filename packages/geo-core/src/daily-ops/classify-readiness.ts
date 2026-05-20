/**
 * V1.10 / docs/09 §2.1 自动放行规则 — variant readiness classification.
 *
 * Pure function. Maps a variant's quality+compliance state to a 4-class
 * traffic light. Used by:
 *   - cron #2 (auto-dispatch-timeout): batch UPDATE 'green' variants to
 *     status='ready_for_dispatch' after 6h review window expires.
 *   - /t/[slug]/today UI: render 4 buckets (绿/黄/红/黑) with counts.
 *
 * Priority (highest wins): black > red > yellow > green > yellow-fallback.
 *
 * 绿(green):  DoD ok AND compliance auto-approved AND no rewrite AND no numeric warn
 *              → can auto-dispatch without human review
 * 黄(yellow): auto_rewrite_count >= 1 OR numeric warn → soft anomaly, human glance
 * 红(red):    compliance rejected (D5/D12 four-gate triggered) → human decision
 * 黑(black):  DoD failed (D21 §9 quality bar miss) → human decision
 *
 * D-Ops-5: 黄/红/黑 永不自动派. 只有 green 在超时后默认进 ready_for_dispatch.
 */

import type { DodStatus } from '../generation/dod-evaluator';

export type ReadinessClass = 'green' | 'yellow' | 'red' | 'black';

/** Mirrors content_variants.compliance_status enum + permissive string fallback. */
export type ReadinessComplianceStatus =
  | 'pending'
  | 'auto_approved'
  | 'manual_approved'
  | 'rejected'
  | string;

export type VariantReadinessInput = {
  dod_status: DodStatus;
  compliance_status: ReadinessComplianceStatus;
  auto_rewrite_count: number;
  /** numeric_check jsonb (0025_numeric_fact_check) — { verdict?: 'pass'|'warn'|'reject' } */
  numeric_check: { verdict?: string } | null;
};

export function classifyVariant(v: VariantReadinessInput): ReadinessClass {
  // 黑: DoD 系统判定 failed (highest priority).
  if (v.dod_status === 'failed') return 'black';

  // 红: compliance 系统判定 rejected (D5/D12 4-gate triggered).
  if (v.compliance_status === 'rejected') return 'red';

  // 绿: compliance approved (auto OR manual) + dod 通过 → 可派单.
  // V1.10.4 reorder (2026-05-20): approval check FIRST. Earlier
  // implementation put auto_rewrite_count >= 1 ahead of this and
  // (mis)classified approved-but-once-rewritten variants as yellow,
  // hiding them from /today's green bucket. auto_rewrite_count and
  // numeric_check warnings are *signals while pending*, not overrides
  // of an explicit human/system approval.
  const dodOk =
    v.dod_status === 'passed' ||
    v.dod_status === 'legacy_passed' ||
    v.dod_status === 'manual_pass';
  const complianceOk =
    v.compliance_status === 'auto_approved' ||
    v.compliance_status === 'manual_approved';
  if (dodOk && complianceOk) return 'green';

  // 黄: soft anomalies in pending/unknown states — needs human glance.
  // 这些信号只在 compliance 尚未拍板时有意义:已 approved 的变体即使曾被
  // auto-rewrite 或数值检查警告过,客户/系统已经接受了改写后的版本,
  // 不应该再回退到 yellow.
  if (v.auto_rewrite_count >= 1) return 'yellow';
  if (
    v.numeric_check?.verdict === 'warn' ||
    v.numeric_check?.verdict === 'reject'
  ) {
    return 'yellow';
  }

  // 兜底 yellow: unknown / pending / partial state.
  // 不算 green 是因为还没全部 evaluated;daily-ops 不能在不确定时自动派.
  return 'yellow';
}

/**
 * Counts variants by readiness class. Used by:
 *   - daily_ops_runs.counts snapshot writer
 *   - /today UI hero counts
 */
export function countByClass(
  variants: VariantReadinessInput[],
): Record<ReadinessClass, number> {
  const counts: Record<ReadinessClass, number> = {
    green: 0,
    yellow: 0,
    red: 0,
    black: 0,
  };
  for (const v of variants) {
    counts[classifyVariant(v)]++;
  }
  return counts;
}
