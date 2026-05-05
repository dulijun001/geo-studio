'use server';

import { revalidatePath } from 'next/cache';
import { enqueueRegenerate } from '@/lib/discoverability/enqueue';
import { requireRole } from '@/lib/tenant';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

type ServiceInput = {
  name: string;
  description_md: string;
  category: string;
  duration_minutes: number | null;
  price_min: number | null;
  price_max: number | null;
  price_typical: number | null;
  procedure_code: string;
  geo_visible: boolean;
};

// DSC-1 sanity bounds. Generous but block obviously-wrong values.
const MAX_DESC_LEN = 2000;
const MAX_PRICE = 1_000_000; // ¥1M cap — anything higher is probably a typo.

function normalizeInput(raw: ServiceInput) {
  const name = raw.name.trim();
  if (!name) throw new Error('请填写服务名');
  if (name.length > 100) throw new Error('服务名过长');

  const desc = raw.description_md.trim();
  if (desc.length > MAX_DESC_LEN) {
    throw new Error(`服务描述过长(${desc.length} 字,上限 ${MAX_DESC_LEN} 字)`);
  }
  const category = raw.category.trim() || null;
  const code = raw.procedure_code.trim() || null;

  // DSC-1 — price sanity.
  for (const [label, v] of Object.entries({
    price_min: raw.price_min,
    price_max: raw.price_max,
    price_typical: raw.price_typical,
  })) {
    if (v === null) continue;
    if (!Number.isFinite(v)) throw new Error(`${label} 必须是数字`);
    if (v < 0) throw new Error(`${label} 不能是负数`);
    if (v > MAX_PRICE) {
      throw new Error(`${label} 超过 ¥${MAX_PRICE.toLocaleString()},请确认是否填错`);
    }
  }
  if (
    raw.price_min !== null &&
    raw.price_max !== null &&
    raw.price_min > raw.price_max
  ) {
    throw new Error('最低价不能高于最高价');
  }
  if (
    raw.price_typical !== null &&
    raw.price_min !== null &&
    raw.price_typical < raw.price_min
  ) {
    throw new Error('典型价不能低于最低价');
  }
  if (
    raw.price_typical !== null &&
    raw.price_max !== null &&
    raw.price_typical > raw.price_max
  ) {
    throw new Error('典型价不能高于最高价');
  }
  if (raw.duration_minutes !== null) {
    if (!Number.isFinite(raw.duration_minutes)) {
      throw new Error('治疗时长必须是数字');
    }
    if (raw.duration_minutes < 0 || raw.duration_minutes > 24 * 60) {
      throw new Error('治疗时长应在 0-1440 分钟之间');
    }
  }

  let priceRange: Record<string, unknown> | null = null;
  if (raw.price_min !== null || raw.price_max !== null || raw.price_typical !== null) {
    priceRange = {
      currency: 'CNY',
      ...(raw.price_min !== null && { min: raw.price_min }),
      ...(raw.price_max !== null && { max: raw.price_max }),
      ...(raw.price_typical !== null && { typical: raw.price_typical }),
    };
  }

  return {
    name,
    description_md: desc || null,
    category,
    medical_procedure_code: code,
    duration_minutes: raw.duration_minutes,
    price_range: priceRange,
    geo_visible: raw.geo_visible,
  };
}

export async function createService(tenantSlug: string, input: ServiceInput): Promise<{ id: string }> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const service = getSupabaseServiceClient();

  // Need brand_id — we use the first non-deleted brand for this tenant
  const { data: brand } = await service
    .from('brands')
    .select('id')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!brand) throw new Error('该租户没有 brand,请先建 brand');

  const payload = normalizeInput(input);
  const { data, error } = await service
    .from('services')
    .insert({ tenant_id: tenant.id, brand_id: brand.id, ...payload })
    .select('id')
    .single();
  if (error || !data) throw new Error(`创建服务失败: ${error?.message}`);

  await enqueueRegenerate(tenant.id);
  revalidatePath(`/t/${tenantSlug}/discoverability/services`);
  revalidatePath(`/t/${tenantSlug}/discoverability`);
  return { id: data.id as string };
}

export async function updateService(
  tenantSlug: string,
  id: string,
  input: ServiceInput,
): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const service = getSupabaseServiceClient();
  const payload = normalizeInput(input);
  const { error } = await service
    .from('services')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenant.id);
  if (error) throw new Error(`更新服务失败: ${error.message}`);

  await enqueueRegenerate(tenant.id);
  revalidatePath(`/t/${tenantSlug}/discoverability/services`);
  revalidatePath(`/t/${tenantSlug}/discoverability`);
}

export async function toggleServiceVisibility(
  tenantSlug: string,
  id: string,
  visible: boolean,
): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const service = getSupabaseServiceClient();
  const { error } = await service
    .from('services')
    .update({ geo_visible: visible, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenant.id);
  if (error) throw new Error(`切换可见性失败: ${error.message}`);

  await enqueueRegenerate(tenant.id);
  revalidatePath(`/t/${tenantSlug}/discoverability/services`);
}

export async function deleteService(tenantSlug: string, id: string): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin']);
  const service = getSupabaseServiceClient();
  const { error } = await service
    .from('services')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenant.id);
  if (error) throw new Error(`删除服务失败: ${error.message}`);

  await enqueueRegenerate(tenant.id);
  revalidatePath(`/t/${tenantSlug}/discoverability/services`);
  revalidatePath(`/t/${tenantSlug}/discoverability`);
}
