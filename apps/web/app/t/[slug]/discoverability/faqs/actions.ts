'use server';

import { revalidatePath } from 'next/cache';
import { enqueueRegenerate } from '@/lib/discoverability/enqueue';
import { requireRole } from '@/lib/tenant';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export type FaqInput = {
  question: string;
  answer_md: string;
  category: string;
  sort_order: number;
  geo_visible: boolean;
};

function normalize(raw: FaqInput) {
  const q = raw.question.trim();
  const a = raw.answer_md.trim();
  if (!q) throw new Error('请填写问题');
  if (q.length > 200) throw new Error('问题过长(超过 200 字)');
  if (!a) throw new Error('请填写答案');
  return {
    question: q,
    answer_md: a,
    category: raw.category.trim() || null,
    sort_order: raw.sort_order,
    geo_visible: raw.geo_visible,
  };
}

export async function createFaq(tenantSlug: string, input: FaqInput): Promise<{ id: string }> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const service = getSupabaseServiceClient();
  const payload = normalize(input);
  const { data, error } = await service
    .from('faqs')
    .insert({ tenant_id: tenant.id, ...payload })
    .select('id')
    .single();
  if (error || !data) throw new Error(`创建 FAQ 失败: ${error?.message}`);
  await enqueueRegenerate(tenant.id);
  revalidatePath(`/t/${tenantSlug}/discoverability/faqs`);
  revalidatePath(`/t/${tenantSlug}/discoverability`);
  return { id: data.id as string };
}

export async function updateFaq(tenantSlug: string, id: string, input: FaqInput): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const service = getSupabaseServiceClient();
  const payload = normalize(input);
  const { error } = await service
    .from('faqs')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenant.id);
  if (error) throw new Error(`更新 FAQ 失败: ${error.message}`);
  await enqueueRegenerate(tenant.id);
  revalidatePath(`/t/${tenantSlug}/discoverability/faqs`);
  revalidatePath(`/t/${tenantSlug}/discoverability`);
}

export async function toggleFaqVisibility(
  tenantSlug: string,
  id: string,
  visible: boolean,
): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const service = getSupabaseServiceClient();
  const { error } = await service
    .from('faqs')
    .update({ geo_visible: visible, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenant.id);
  if (error) throw new Error(`切换可见性失败: ${error.message}`);
  await enqueueRegenerate(tenant.id);
  revalidatePath(`/t/${tenantSlug}/discoverability/faqs`);
}

export async function deleteFaq(tenantSlug: string, id: string): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin']);
  const service = getSupabaseServiceClient();
  const { error } = await service
    .from('faqs')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenant.id);
  if (error) throw new Error(`删除失败: ${error.message}`);
  await enqueueRegenerate(tenant.id);
  revalidatePath(`/t/${tenantSlug}/discoverability/faqs`);
  revalidatePath(`/t/${tenantSlug}/discoverability`);
}
