/**
 * D73 自检:引擎失联告警的触发条件对不对 —— 只判定,不真发企微。
 *
 * 用真实历史数据验:豆包 9-07 起连续失败且原因是欢迎页,应该判「会告警」;
 * 刚修好之后新采的成功记录进来,应该判「不告警」。
 *
 * Usage: pnpm --filter @geo/worker exec tsx src/trackers/_dev/_check-engine-alert.ts
 */
import { getServiceClient } from '../../lib/supabase';

const ENGINE_DOWN_PATTERNS =
  /welcome page|submit not accepted|login expired|登录|captcha|验证|circuit breaker/i;
const STREAK = 3;

async function main() {
  const client = getServiceClient();
  const { data: t } = await client.from('tenants').select('id').eq('slug', 'songshu').limit(1);
  const tenantId = t?.[0]?.id;
  if (!tenantId) throw new Error('tenant not found');

  for (const engine of ['doubao', 'yuanbao', 'deepseek'] as const) {
    const { data } = await client
      .from('geo_snapshots')
      .select('status, failure_reason, created_at')
      .eq('tenant_id', tenantId)
      .eq('engine', engine)
      .order('created_at', { ascending: false })
      .limit(STREAK);
    const rows = data ?? [];
    if (rows.length < STREAK) {
      console.log(`${engine.padEnd(9)} 记录不足 ${STREAK} 条(${rows.length})→ 不告警`);
      continue;
    }
    const allDown = rows.every(
      (r) =>
        (r.status === 'failed' || r.status === 'rate_limited') &&
        ENGINE_DOWN_PATTERNS.test(String(r.failure_reason ?? '')),
    );
    console.log(
      `${engine.padEnd(9)} 最近 ${STREAK} 条: ${rows.map((r) => r.status).join(',')} → ${allDown ? '🔴 会告警' : '✅ 不告警'}`,
    );
  }
  console.log('\n(只判定,没有真发企微)');
}
main().catch((e) => { console.error(e); process.exit(1); });
