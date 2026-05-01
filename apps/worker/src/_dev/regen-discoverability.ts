/**
 * Dev one-shot: regenerate discoverability artifacts for a tenant by slug,
 * bypassing pg-boss. Used for S3 end-to-end smoke testing.
 *
 *   pnpm --filter @geo/worker dev-regen-discoverability demo-dental
 */

import { createClient } from '@supabase/supabase-js';
import { handleDiscoverabilityRegenerate } from '../jobs/discoverability-regenerate';

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error('Usage: pnpm --filter @geo/worker dev-regen-discoverability <slug>');
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`tenant slug=${slug} not found`);

  console.log(`[regen] tenant ${slug} (${data.id}) — kicking off`);
  await handleDiscoverabilityRegenerate({ tenant_id: data.id });
  console.log('[regen] done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
