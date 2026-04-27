'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/tenant';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export type GeoChecklistInput = {
  baidu_baike: boolean;
  souguo_baike: boolean;
  amap_poi: boolean;
  baidu_map_poi: boolean;
  /** Dianping medical-organization page rating, 0-5. */
  dianping_score: number;
  /** Total review count on Dianping. */
  dianping_reviews: number;
};

/**
 * Persist the GEO checklist into brand.location.geo_checklist (jsonb merge).
 *
 * Stored on the first active brand of the tenant — V1 invariant per D2 is
 * "one tenant = one brand". When V3 SaaS adds multi-brand, this becomes a
 * brand picker instead.
 */
export async function saveGeoChecklist(
  tenantSlug: string,
  input: GeoChecklistInput,
): Promise<{ ok: true }> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin']);

  if (input.dianping_score < 0 || input.dianping_score > 5) {
    throw new Error('大众点评评分必须在 0-5 之间');
  }
  if (input.dianping_reviews < 0 || input.dianping_reviews > 100000) {
    throw new Error('评价数不合理');
  }

  const service = getSupabaseServiceClient();
  const { data: brand, error: bErr } = await service
    .from('brands')
    .select('id, location')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (bErr || !brand) throw new Error('租户下没有 brand,请先初始化');

  const newLocation = {
    ...((brand.location as Record<string, unknown>) ?? {}),
    geo_checklist: input,
  };
  const { error: upErr } = await service
    .from('brands')
    .update({ location: newLocation })
    .eq('id', brand.id);
  if (upErr) throw new Error(`保存失败: ${upErr.message}`);

  revalidatePath(`/t/${tenantSlug}`);
  revalidatePath(`/t/${tenantSlug}/settings/geo-checklist`);
  return { ok: true };
}
