/**
 * docs/08 断点1「追踪 → 选题」自检:不发早报,只把那一段渲染出来看(D66)。
 *
 * 直接跑 handleDailyReport 会真发企微群消息,所以只调计算 + 渲染两个函数。
 *
 * Usage: pnpm --filter @geo/worker exec tsx src/trackers/_dev/_check-weak-questions.ts
 */
import { computeWeakQuestions, renderWeakQuestions } from '../../jobs/daily-report';
import { getServiceClient } from '../../lib/supabase';

async function main() {
  const slug = process.argv[2] ?? 'songshu';
  const client = getServiceClient();
  const { data } = await client.from('tenants').select('id').eq('slug', slug).limit(1);
  const tenant = data?.[0];
  if (!tenant) throw new Error(`tenant '${slug}' not found`);

  const w = await computeWeakQuestions(tenant.id);
  console.log('\n--- 早报里会长这样 ---');
  console.log(renderWeakQuestions(w));
  console.log('\n--- 原始数据 ---');
  console.log(JSON.stringify(w, null, 2));

  const sum = w.ranked + w.mentioned_unranked + w.nobody + w.rival_only.length;
  if (w.tracked === 0) throw new Error('FAIL: 一道追踪过的题都没统计到');
  if (sum !== w.tracked) throw new Error(`FAIL: 四档相加 ${sum} ≠ 追踪总数 ${w.tracked},有题掉档`);
  console.log('\n✅ 自检通过(四档相加等于追踪总数,没有题掉档)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
