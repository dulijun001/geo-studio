import { dispatchSearchEnginePush, type UnifiedPushSummary } from '@geo/geo-core';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export async function pushUrlsForTenant(
  tenantId: string,
  urls: string[],
): Promise<UnifiedPushSummary> {
  const service = getSupabaseServiceClient();
  const { data: tenant } = await service
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .single();

  const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
  const disco = (settings.discoverability ?? {}) as Record<string, unknown>;
  const pushConfig = (disco.search_push ?? {}) as Record<string, string | undefined>;

  const baiduSite = pushConfig.baidu_site || process.env.BAIDU_PUSH_SITE;
  const baiduToken = pushConfig.baidu_token || process.env.BAIDU_PUSH_TOKEN;
  const shenmaSite = pushConfig.shenma_site || process.env.SHENMA_PUSH_SITE;
  const shenmaUsername = pushConfig.shenma_username || process.env.SHENMA_PUSH_USERNAME;
  const shenmaAccessKey = pushConfig.shenma_access_key || process.env.SHENMA_PUSH_ACCESS_KEY;

  const result = await dispatchSearchEnginePush({
    urls,
    baidu: baiduSite && baiduToken ? { site: baiduSite, token: baiduToken } : undefined,
    shenma:
      shenmaSite && shenmaUsername && shenmaAccessKey
        ? { site: shenmaSite, username: shenmaUsername, accessKey: shenmaAccessKey }
        : undefined,
  });

  if (result.baidu || result.shenma) {
    try {
      await service.from('audit_logs').insert({
        tenant_id: tenantId,
        action: 'discoverability.search_push',
        target_type: 'tenant',
        target_id: tenantId,
        payload: {
          urls_count: urls.length,
          urls: urls.slice(0, 10),
          result,
        },
      });
    } catch (e) {
      console.warn('[pushUrlsForTenant] failed to log audit:', e);
    }
  }

  return result;
}
