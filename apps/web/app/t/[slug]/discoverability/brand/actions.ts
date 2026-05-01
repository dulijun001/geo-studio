'use server';

import { revalidatePath } from 'next/cache';
import { enqueueRegenerate } from '@/lib/discoverability/enqueue';
import { requireRole } from '@/lib/tenant';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export type BrandDiscoverabilityInput = {
  // location flat fields
  city: string;
  district: string;
  address: string;
  postal_code: string;
  region: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  // top-level
  description_md: string;
  medical_specialties: string[]; // strings already split / cleaned
  business_hours: Record<string, string>; // {mon: "09:00-18:00", ...}
  website_url: string;
  social_urls: Record<string, string>; // {wechat_mp: "...", ...}
  // credentials: simple list of {name, issuer, number}
  credentials: Array<{ name: string; issuer: string; number: string }>;
};

export async function updateBrandDiscoverability(
  tenantSlug: string,
  input: BrandDiscoverabilityInput,
): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin']);
  const service = getSupabaseServiceClient();

  // Find the brand row
  const { data: existing } = await service
    .from('brands')
    .select('id, location')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!existing) throw new Error('该租户没有 brand 记录');

  // Merge location: keep any existing fields not in the form
  const existingLoc = (existing.location as Record<string, unknown>) ?? {};
  const newLoc: Record<string, unknown> = { ...existingLoc };
  for (const k of ['city', 'district', 'address', 'postal_code', 'region', 'country'] as const) {
    const v = input[k].trim();
    if (v) newLoc[k] = v;
    else delete newLoc[k];
  }
  if (input.latitude !== null) newLoc.lat = input.latitude;
  else delete newLoc.lat;
  if (input.longitude !== null) newLoc.lng = input.longitude;
  else delete newLoc.lng;

  const cleanSocial: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.social_urls)) {
    const url = v.trim();
    if (url) cleanSocial[k] = url;
  }

  const cleanHours: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.business_hours)) {
    const t = v.trim();
    if (t && /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(t)) cleanHours[k] = t;
  }

  const cleanedCredentials = input.credentials
    .map((c) => ({
      name: c.name.trim(),
      issuer: c.issuer.trim(),
      number: c.number.trim(),
    }))
    .filter((c) => c.name);

  const cleanedSpecialties = input.medical_specialties
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);

  const { error } = await service
    .from('brands')
    .update({
      location: newLoc,
      description_md: input.description_md.trim() || null,
      medical_specialties: cleanedSpecialties,
      business_hours: cleanHours,
      website_url: input.website_url.trim() || null,
      social_urls: cleanSocial,
      verified_credentials: { licenses: cleanedCredentials, accreditations: [] },
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id);
  if (error) throw new Error(`更新 brand 失败: ${error.message}`);

  await enqueueRegenerate(tenant.id);
  revalidatePath(`/t/${tenantSlug}/discoverability/brand`);
  revalidatePath(`/t/${tenantSlug}/discoverability`);
}
