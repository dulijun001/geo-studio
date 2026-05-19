/**
 * V1.10 / docs/09 /today actions.
 *
 * bulkApproveGreen: one click, approves all green variants in today's run
 * via the existing compliance.bulkReviewVariants pipeline (reuses
 * D5/D12 four-gate audit trail).
 *
 * Why not write a fresh approval flow:
 *   - compliance/actions.ts already handles status transitions + audit_logs
 *   - keeping a single source of approval truth = D5/D12 invariant safe
 */
'use server';

import { unstable_noStore as noStore } from 'next/cache';
import { revalidatePath } from 'next/cache';
import { classifyVariant, type VariantReadinessInput } from '@geo/geo-core';
import { reportError } from '@geo/shared';
import { bulkReviewVariants } from '@/app/t/[slug]/compliance/actions';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { requireRole } from '@/lib/tenant';

export type BulkApproveResult = {
  total: number;
  succeeded: number;
  failed: Array<{ id: string; error: string }>;
};

/**
 * Approve all green-classified variants attached to today's run.
 *
 * D-Ops-5 guard: only variants that ALREADY classify as green are touched.
 * If operator hit this 5 minutes ago and one slipped from yellow → red via
 * auto-rewrite, this re-classification before bulk acts as a safety net.
 */
export async function bulkApproveTodayGreens(
  tenantSlug: string,
): Promise<BulkApproveResult> {
  noStore();
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'auditor']);

  const service = getSupabaseServiceClient();

  // Find today's run (the latest one for this tenant)
  const { data: run, error: runErr } = await service
    .from('daily_ops_runs')
    .select('id, status')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null)
    .order('run_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (runErr) {
    reportError(runErr, {
      scope: 'daily-ops.bulk_approve.load_run',
      tenant_id: tenant.id,
    });
    throw new Error(`加载今日 run 失败: ${runErr.message}`);
  }
  if (!run) {
    return { total: 0, succeeded: 0, failed: [] };
  }

  // Load variants on this run
  const { data: variants, error: vErr } = await service
    .from('content_variants')
    .select('id, dod_status, compliance_status, auto_rewrite_count, numeric_check, status')
    .eq('daily_run_id', run.id)
    // T0b 2026-05-19: mirror today-view filter — V1.9 cascade pushes to
    // pending_review/auto_approved. bulkReviewVariants then transitions them.
    .in('status', ['draft', 'pending_review', 'auto_approved'])
    .is('deleted_at', null);

  if (vErr) {
    throw new Error(`加载变体失败: ${vErr.message}`);
  }

  const greenIds = (variants ?? [])
    .filter((v) => {
      const input: VariantReadinessInput = {
        dod_status: (v.dod_status ?? 'unknown') as VariantReadinessInput['dod_status'],
        compliance_status: (v.compliance_status ?? 'pending') as string,
        auto_rewrite_count: (v.auto_rewrite_count ?? 0) as number,
        numeric_check: (v.numeric_check ?? null) as { verdict?: string } | null,
      };
      return classifyVariant(input) === 'green';
    })
    .map((v) => v.id as string);

  if (greenIds.length === 0) {
    return { total: 0, succeeded: 0, failed: [] };
  }

  const rationale =
    `daily-ops 一键批量 approve(${greenIds.length} 条绿色)。` +
    `自动放行规则:DoD=passed + compliance=auto_approved + auto_rewrite=0 + numeric_check OK。` +
    `(docs/09 §2.1)`;

  const result = await bulkReviewVariants(tenantSlug, greenIds, 'approve', rationale);

  revalidatePath(`/t/${tenantSlug}/today`);
  revalidatePath(`/t/${tenantSlug}`);

  return {
    total: greenIds.length,
    succeeded: result.succeeded,
    failed: result.failed,
  };
}
