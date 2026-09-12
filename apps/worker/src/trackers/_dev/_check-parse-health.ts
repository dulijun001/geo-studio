/** D75 自检:解析健康度算得对不对、会不会误报 —— 只算不发。 */
import { computeParseHealth } from '../../jobs/daily-report';
import { getServiceClient } from '../../lib/supabase';

async function main() {
  const client = getServiceClient();
  const { data: t } = await client.from('tenants').select('id').eq('slug', 'songshu').limit(1);
  const ph = await computeParseHealth(t?.[0]?.id);
  console.log(JSON.stringify(ph, null, 2));
  if (!ph) { console.log('近期没有追踪批次可评'); return; }
  console.log(
    ph.zeroed.length
      ? `\n🔴 会告警:${ph.zeroed.join('、')}`
      : `\n✅ 不告警(名次 ${ph.ranked} / 引用 ${ph.with_citations} / 提及 ${ph.mentioned},共 ${ph.done} 条)`,
  );
  console.log('(只判定,没有真发企微)');
}
main().catch((e) => { console.error(e); process.exit(1); });
