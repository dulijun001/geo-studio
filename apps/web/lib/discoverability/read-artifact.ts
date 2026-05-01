/**
 * Read a single materialized artifact for a tenant.
 *
 * Uses service-role client because the visitor is anonymous and the
 * discoverability_artifacts table has no policy for unauthenticated reads.
 * The double-gate at the worker job (compliance + geo_visible) means whatever
 * lands in this table is safe to serve publicly — but the route handler
 * still gatekeeps via resolvePublicTenant before getting here.
 */

import { unstable_noStore as noStore } from 'next/cache';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export type ArtifactType = 'llms_txt' | 'llms_full' | 'feed_json' | 'sitemap_xml';

export type ArtifactRecord = {
  content: string;
  etag: string;
  generated_at: string;
};

export async function readArtifact(
  tenantId: string,
  type: ArtifactType,
): Promise<ArtifactRecord | null> {
  noStore();
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('discoverability_artifacts')
    .select('content, etag, generated_at')
    .eq('tenant_id', tenantId)
    .eq('artifact_type', type)
    .maybeSingle();
  if (error || !data) return null;
  return {
    content: data.content as string,
    etag: data.etag as string,
    generated_at: data.generated_at as string,
  };
}
