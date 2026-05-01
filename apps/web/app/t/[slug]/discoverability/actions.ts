'use server';

import { revalidatePath } from 'next/cache';
import { enqueueRegenerate } from '@/lib/discoverability/enqueue';
import { requireRole } from '@/lib/tenant';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

/**
 * Toggle the tenant's `public_enabled` flag. When turning ON, also enqueue
 * a regenerate so the artifacts are warm by the time the first crawler hits.
 */
export async function setPublicEnabled(
  tenantSlug: string,
  enabled: boolean,
): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin']);

  const service = getSupabaseServiceClient();

  // Read existing settings, merge in new public_enabled.
  const { data: t, error: rerr } = await service
    .from('tenants')
    .select('settings')
    .eq('id', tenant.id)
    .single();
  if (rerr) throw new Error(`tenant read failed: ${rerr.message}`);

  const current = (t?.settings ?? {}) as Record<string, unknown>;
  const disco = (current.discoverability ?? {}) as Record<string, unknown>;
  const next = { ...current, discoverability: { ...disco, public_enabled: enabled } };

  const { error: werr } = await service
    .from('tenants')
    .update({ settings: next })
    .eq('id', tenant.id);
  if (werr) throw new Error(`tenant write failed: ${werr.message}`);

  if (enabled) await enqueueRegenerate(tenant.id);

  revalidatePath(`/t/${tenantSlug}/discoverability`);
}

/**
 * Force a regenerate of all four artifacts. UI shows "立即重建" button.
 */
export async function triggerRegenerate(tenantSlug: string): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  await enqueueRegenerate(tenant.id);
  revalidatePath(`/t/${tenantSlug}/discoverability`);
}

