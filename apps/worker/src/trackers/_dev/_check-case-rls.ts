/** D76 自检:锁了 anon 之后,合规门(service_role)还读得到判例库吗。 */
import { getServiceClient } from '../../lib/supabase';
const c = getServiceClient();
const { data, error } = await c.from('compliance_cases').select('id').limit(50);
if (error) { console.error('🔴 FAIL 服务端读不到了:', error.message); process.exit(1); }
console.log(`✅ service_role 仍可读判例库:${data?.length ?? 0} 条`);
