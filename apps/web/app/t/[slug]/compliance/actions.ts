'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/tenant';

/**
 * Stage-3 manual approval. Records a `manual` compliance_review, flips variant
 * state, writes audit trail.
 *
 * Only owner/admin/auditor can approve. Auditor is deliberately included so
 * medical-compliance consultants can be given a narrow-scope seat.
 */
export async function approveVariant(
  tenantSlug: string,
  variantId: string,
  rationale: string,
): Promise<void> {
  await transition(tenantSlug, variantId, 'approve', rationale);
}

export async function rejectVariant(
  tenantSlug: string,
  variantId: string,
  reason: string,
): Promise<void> {
  if (reason.trim().length < 3) {
    throw new Error('请填写拒绝原因(至少 3 字),方便运营收到打回后改稿。');
  }
  await transition(tenantSlug, variantId, 'reject', reason);
}

async function transition(
  tenantSlug: string,
  variantId: string,
  verb: 'approve' | 'reject',
  rationale: string,
): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'auditor']);
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  // Reload variant to verify it belongs to this tenant AND hasn't already been finalized by someone else.
  const { data: variant, error: vErr } = await supabase
    .from('content_variants')
    .select('id, tenant_id, compliance_status')
    .eq('id', variantId)
    .single();
  if (vErr || !variant) throw new Error(`Variant not found: ${vErr?.message}`);
  if (variant.tenant_id !== tenant.id) throw new Error('Tenant mismatch');
  if (
    variant.compliance_status === 'manual_approved' ||
    variant.compliance_status === 'rejected'
  ) {
    throw new Error(`变体已经处于终态 (${variant.compliance_status}),不能再改。`);
  }

  const verdict = verb === 'approve' ? 'pass' : 'reject';
  const risk_level = verb === 'approve' ? 'low' : 'high';

  const { data: review, error: rErr } = await supabase
    .from('compliance_reviews')
    .insert({
      tenant_id: tenant.id,
      target_type: 'content_variant',
      target_id: variantId,
      stage: 'manual',
      verdict,
      risk_level,
      findings: [],
      reviewer_id: user.id,
      rationale,
    })
    .select('id')
    .single();
  if (rErr || !review) throw new Error(`Insert review: ${rErr?.message}`);

  const newComplianceStatus = verb === 'approve' ? 'manual_approved' : 'rejected';
  const newVariantStatus = verb === 'approve' ? 'manual_approved' : 'rejected';

  const { error: upErr } = await supabase
    .from('content_variants')
    .update({
      compliance_status: newComplianceStatus,
      compliance_review_id: review.id,
      status: newVariantStatus,
    })
    .eq('id', variantId);
  if (upErr) throw new Error(`Update variant: ${upErr.message}`);

  await supabase.from('audit_logs').insert({
    tenant_id: tenant.id,
    actor_user_id: user.id,
    action: verb === 'approve' ? 'compliance.manual_approve' : 'compliance.manual_reject',
    target_type: 'content_variant',
    target_id: variantId,
    payload: { review_id: review.id, rationale },
  });

  revalidatePath(`/t/${tenantSlug}/compliance`);
  revalidatePath(`/t/${tenantSlug}/compliance/${variantId}`);
}
