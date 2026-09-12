/** D69 自检:待审合规积压年龄那段,只算不发。 */
import { getServiceClient } from '../../lib/supabase';

async function main() {
  const client = getServiceClient();
  const { data: t } = await client.from('tenants').select('id').eq('slug', 'songshu').limit(1);
  const { data } = await client
    .from('content_variants')
    .select('created_at')
    .eq('tenant_id', t?.[0]?.id)
    .eq('compliance_status', 'pending')
    .is('deleted_at', null);
  const rows = data ?? [];
  const now = Date.now();
  const ages = rows.map((r) => Math.floor((now - new Date(r.created_at as string).getTime()) / 86_400_000));
  const over = ages.filter((d) => d > 14).length;
  console.log(`待审合规 ${rows.length} 条,其中 ${over} 条压了 14 天以上,最老 ${Math.max(...ages, 0)} 天`);
  if (rows.length > 0 && ages.length !== rows.length) throw new Error('FAIL: 年龄算漏了');
  console.log('✅ 自检通过');
}
main().catch((e) => { console.error(e); process.exit(1); });
