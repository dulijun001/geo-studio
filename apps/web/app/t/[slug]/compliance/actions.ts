'use server';

import PgBoss from 'pg-boss';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { requireRole } from '@/lib/tenant';

/**
 * Edit a variant's title/body and re-queue compliance review.
 *
 * Available while the variant has not been dispatched yet — once it's in a
 * staff member's hands, content drift would mean the post they're publishing
 * doesn't match what we approved. Reset compliance_status to 'pending' and
 * re-enqueue the worker job so the new text gets scanned + LLM-reviewed.
 */
export async function updateVariantContent(
  tenantSlug: string,
  variantId: string,
  title: string,
  body: string,
): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const t = title.trim();
  const b = body.trim();
  if (t.length < 4) throw new Error('标题至少 4 字');
  if (b.length < 30) throw new Error('正文至少 30 字');
  if (b.length > 20000) throw new Error('正文超过 20000 字,请精简');

  const service = getSupabaseServiceClient();

  const { data: variant, error: vErr } = await service
    .from('content_variants')
    .select('id, tenant_id, status')
    .eq('id', variantId)
    .eq('tenant_id', tenant.id)
    .single();
  if (vErr || !variant) throw new Error('变体不存在');
  if (['dispatched', 'published'].includes(variant.status)) {
    throw new Error('已派发或已发布的变体不能再改文案,以免和员工手里的版本不一致');
  }

  const { error: upErr } = await service
    .from('content_variants')
    .update({
      title: t,
      body: b,
      status: 'draft',
      compliance_status: 'pending',
      compliance_review_id: null,
    })
    .eq('id', variantId);
  if (upErr) throw new Error(`保存失败: ${upErr.message}`);

  // Re-queue compliance review.
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    const boss = new PgBoss({ connectionString: databaseUrl, schema: 'pgboss' });
    await boss.start();
    try {
      await boss.createQueue('compliance.review');
      await boss.send('compliance.review', { variant_id: variantId, tenant_id: tenant.id });
    } finally {
      await boss.stop({ graceful: true, timeout: 5000 });
    }
  }

  await service.from('audit_logs').insert({
    tenant_id: tenant.id,
    action: 'content.variant_edited',
    target_type: 'content_variant',
    target_id: variantId,
    payload: { title_len: t.length, body_len: b.length },
  });

  revalidatePath(`/t/${tenantSlug}/compliance/${variantId}`);
  revalidatePath(`/t/${tenantSlug}/compliance`);
}

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

/**
 * Batch approve / reject many variants at once.
 *
 * Failures are isolated per row so one bad ID doesn't lose the whole submit.
 * Returns the count succeeded + a list of (id, error) pairs the UI can display.
 */
export async function bulkReviewVariants(
  tenantSlug: string,
  variantIds: string[],
  verb: 'approve' | 'reject',
  rationale: string,
): Promise<{ succeeded: number; failed: Array<{ id: string; error: string }> }> {
  if (variantIds.length === 0) throw new Error('请先勾选变体');
  if (variantIds.length > 200) throw new Error('一次最多处理 200 条,请分批');
  if (verb === 'reject' && rationale.trim().length < 3) {
    throw new Error('请填写拒绝原因(至少 3 字)');
  }
  await requireRole(tenantSlug, ['owner', 'admin', 'auditor']);

  let succeeded = 0;
  const failed: Array<{ id: string; error: string }> = [];
  for (const id of variantIds) {
    try {
      await transition(tenantSlug, id, verb, rationale);
      succeeded += 1;
    } catch (e) {
      failed.push({ id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { succeeded, failed };
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
