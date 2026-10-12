'use server';

import { revalidatePath } from 'next/cache';
import { enqueueRegenerate } from '@/lib/discoverability/enqueue';
import { pushUrlsForTenant } from '@/lib/discoverability/push';
import { requireRole } from '@/lib/tenant';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import type { UnifiedPushSummary } from '@geo/geo-core';

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

/**
 * 手动/一键触发全站已发布文章与 Sitemap 提交给百度和神马站长接口
 */
export async function triggerSearchPush(
  tenantSlug: string,
  extraUrls?: string[],
): Promise<{ ok: boolean; summary?: UnifiedPushSummary; error?: string }> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const service = getSupabaseServiceClient();

  const publicBase = process.env.NEXT_PUBLIC_APP_URL ?? 'https://geo.studio';

  // 收集所有已发布的文章
  const { data: publishedArticles } = await service
    .from('content_items')
    .select('id')
    .eq('tenant_id', tenant.id)
    .eq('status', 'published')
    .is('deleted_at', null)
    .limit(500);

  const urls: string[] = [
    `${publicBase}/c/${tenant.slug}/ai-sitemap.xml`,
    `${publicBase}/c/${tenant.slug}/llms.txt`,
    `${publicBase}/c/${tenant.slug}/llms-full.txt`,
    ...((publishedArticles ?? []).map((a) => `${publicBase}/c/${tenant.slug}/articles/${a.id}`)),
    ...(extraUrls ?? []).filter((u) => /^https?:\/\//i.test(u.trim())),
  ];

  try {
    const summary = await pushUrlsForTenant(tenant.id, urls);
    revalidatePath(`/t/${tenantSlug}/discoverability`);
    return { ok: true, summary };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

export type SearchPushConfigInput = {
  baidu_site?: string;
  baidu_token?: string;
  shenma_site?: string;
  shenma_username?: string;
  shenma_access_key?: string;
};

/**
 * 保存搜索引擎推送凭据设置
 */
export async function saveSearchPushSettings(
  tenantSlug: string,
  input: SearchPushConfigInput,
): Promise<{ ok: boolean; error?: string }> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin']);
  const service = getSupabaseServiceClient();

  const { data: t, error: rerr } = await service
    .from('tenants')
    .select('settings')
    .eq('id', tenant.id)
    .single();
  if (rerr) return { ok: false, error: rerr.message };

  const current = (t?.settings ?? {}) as Record<string, unknown>;
  const disco = (current.discoverability ?? {}) as Record<string, unknown>;
  const existingPush = (disco.search_push ?? {}) as Record<string, string | undefined>;

  const nextPush: Record<string, string | undefined> = {
    baidu_site: input.baidu_site?.trim() || existingPush.baidu_site,
    baidu_token:
      input.baidu_token && !input.baidu_token.includes('***')
        ? input.baidu_token.trim()
        : existingPush.baidu_token,
    shenma_site: input.shenma_site?.trim() || existingPush.shenma_site,
    shenma_username: input.shenma_username?.trim() || existingPush.shenma_username,
    shenma_access_key:
      input.shenma_access_key && !input.shenma_access_key.includes('***')
        ? input.shenma_access_key.trim()
        : existingPush.shenma_access_key,
  };

  const next = {
    ...current,
    discoverability: {
      ...disco,
      search_push: nextPush,
    },
  };

  const { error: werr } = await service
    .from('tenants')
    .update({ settings: next })
    .eq('id', tenant.id);
  if (werr) return { ok: false, error: werr.message };

  revalidatePath(`/t/${tenantSlug}/discoverability`);
  return { ok: true };
}


