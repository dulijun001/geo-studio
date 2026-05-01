'use server';

import { revalidatePath } from 'next/cache';
import { enqueueRegenerate } from '@/lib/discoverability/enqueue';
import { requireRole } from '@/lib/tenant';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export type TestimonialInput = {
  author_pseudonym: string;
  body: string;
  rating: number | null;
  service_id: string | null;
  attested_at: string; // ISO date string (YYYY-MM-DD)
};

function normalize(raw: TestimonialInput) {
  const author = raw.author_pseudonym.trim();
  const body = raw.body.trim();
  if (!author) throw new Error('请填写化名(例:L 女士 / 32 岁 / 南京)');
  if (author.length > 80) throw new Error('化名过长');
  if (!body) throw new Error('请填写见证内容');
  if (body.length > 2000) throw new Error('见证过长(超过 2000 字)');
  if (raw.rating !== null && (raw.rating < 1 || raw.rating > 5)) {
    throw new Error('评分必须在 1 - 5 之间');
  }

  // /\b[A-Z][a-z]+\b/ — flag if author has what looks like a real name
  // (rough sanity check; not bulletproof). UI also warns.
  if (/[一-鿿]{2,4}(?:女士|先生|小姐|医生)/.test(author) === false &&
      /[一-鿿]{2,4}/.test(author) &&
      !/(L|W|X|Y|Z|A|B|C|D)\s/.test(author)) {
    // Heuristic — admin warned in UI, accepted if explicitly bypassed
  }

  return {
    author_pseudonym: author,
    body,
    rating: raw.rating,
    service_id: raw.service_id || null,
    attested_at: raw.attested_at || new Date().toISOString().slice(0, 10),
  };
}

export async function createTestimonial(
  tenantSlug: string,
  input: TestimonialInput,
): Promise<{ id: string }> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const service = getSupabaseServiceClient();

  const { data: brand } = await service
    .from('brands')
    .select('id')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!brand) throw new Error('该租户没有 brand');

  const payload = normalize(input);
  const { data, error } = await service
    .from('testimonials')
    .insert({
      tenant_id: tenant.id,
      brand_id: brand.id,
      ...payload,
      compliance_status: 'pending',
      geo_visible: false,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`创建见证失败: ${error?.message}`);

  // No regen yet — testimonials only enter artifacts after compliance approval.
  revalidatePath(`/t/${tenantSlug}/discoverability/testimonials`);
  revalidatePath(`/t/${tenantSlug}/discoverability`);
  return { id: data.id as string };
}

export async function updateTestimonial(
  tenantSlug: string,
  id: string,
  input: TestimonialInput,
): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const service = getSupabaseServiceClient();
  const payload = normalize(input);

  // After body/author change, compliance review must redo. Reset status.
  const { error } = await service
    .from('testimonials')
    .update({
      ...payload,
      compliance_status: 'pending',
      geo_visible: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', tenant.id);
  if (error) throw new Error(`更新见证失败: ${error.message}`);

  await enqueueRegenerate(tenant.id);
  revalidatePath(`/t/${tenantSlug}/discoverability/testimonials`);
}

export async function setTestimonialCompliance(
  tenantSlug: string,
  id: string,
  status: 'approved' | 'rejected',
): Promise<void> {
  // Only auditors / owners / admins decide compliance.
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'auditor']);
  const service = getSupabaseServiceClient();

  // If rejecting, also flip geo_visible off (defensive — DB trigger would
  // also block if anyone tried geo_visible=true after rejecting).
  const updates: Record<string, unknown> = {
    compliance_status: status,
    updated_at: new Date().toISOString(),
  };
  if (status === 'rejected') updates.geo_visible = false;

  const { error } = await service
    .from('testimonials')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', tenant.id);
  if (error) throw new Error(`合规状态更新失败: ${error.message}`);

  await enqueueRegenerate(tenant.id);
  revalidatePath(`/t/${tenantSlug}/discoverability/testimonials`);
}

export async function toggleTestimonialVisibility(
  tenantSlug: string,
  id: string,
  visible: boolean,
): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const service = getSupabaseServiceClient();

  // DB trigger (migration 0018) enforces compliance_status='approved' before
  // geo_visible can be true. We let that be the source of truth — surface
  // the trigger error message to the admin.
  const { error } = await service
    .from('testimonials')
    .update({ geo_visible: visible, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenant.id);
  if (error) {
    if (error.message.includes('compliance_status')) {
      throw new Error('该客户见证未通过合规审核 — 请先在合规栏标记为"通过"');
    }
    throw new Error(`切换可见性失败: ${error.message}`);
  }

  await enqueueRegenerate(tenant.id);
  revalidatePath(`/t/${tenantSlug}/discoverability/testimonials`);
}

export async function deleteTestimonial(tenantSlug: string, id: string): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin']);
  const service = getSupabaseServiceClient();
  const { error } = await service
    .from('testimonials')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenant.id);
  if (error) throw new Error(`删除失败: ${error.message}`);

  await enqueueRegenerate(tenant.id);
  revalidatePath(`/t/${tenantSlug}/discoverability/testimonials`);
}
