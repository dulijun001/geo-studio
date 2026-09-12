/**
 * 按 D68 新规则重排全池 priority(2026-09-12)。
 *
 * 不写 SQL 而写脚本,是为了直接调 `questionPriority()` —— 规则只有一处定义。
 * 用 SQL 就得把那两条正则再抄一份进数据库,以后改规则必然漏改一边(D56 的老坑)。
 *
 * Usage:
 *   set -a && . ./.env && set +a
 *   pnpm --filter @geo/worker exec tsx src/trackers/_dev/_reprioritize-topics.ts [slug] [--apply]
 *
 * 干跑打印变更前后对照;--apply 才写库。可回滚:旧值就是 D55 的 10/7/4 三档。
 */
import { questionKind, questionPriority } from '@geo/geo-core';
import { getServiceClient } from '../../lib/supabase';

async function main() {
  const slug = process.argv[2]?.startsWith('--') ? 'songshu' : (process.argv[2] ?? 'songshu');
  const apply = process.argv.includes('--apply');
  const client = getServiceClient();

  const { data: tenants } = await client.from('tenants').select('id').eq('slug', slug).limit(1);
  const tenant = tenants?.[0];
  if (!tenant) throw new Error(`tenant '${slug}' not found`);

  const { data: qs, error } = await client
    .from('questions')
    .select('id, text, priority')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null)
    .limit(5000);
  if (error) throw new Error(JSON.stringify(error));
  if (!qs?.length) throw new Error('题库是空的');

  const byKind: Record<string, number> = { seek_org: 0, price: 0, knowledge: 0 };
  const bump = (k: string) => { byKind[k] = (byKind[k] ?? 0) + 1; };
  const moves = new Map<string, number>();
  let changed = 0;

  for (const q of qs) {
    const text = q.text as string;
    bump(questionKind(text));
    const want = questionPriority(text);
    if (want === q.priority) continue;
    changed += 1;
    const key = `${q.priority} → ${want}`;
    moves.set(key, (moves.get(key) ?? 0) + 1);
    if (apply) {
      const { error: uErr } = await client.from('questions').update({ priority: want }).eq('id', q.id);
      if (uErr) console.error(`  ${q.id}: ${uErr.message}`);
    }
  }

  console.log(`\n题库总数:   ${qs.length}`);
  console.log(`找机构型:   ${byKind.seek_org}   ← 唯一实测能上榜的类型(D67:25% 上榜)`);
  console.log(`价格型:     ${byKind.price}   (历史上榜 0)`);
  console.log(`知识型:     ${byKind.knowledge}   (历史上榜 0)`);
  console.log(`\n${apply ? '已改' : '将改'}: ${changed} 道`);
  for (const [k, n] of [...moves.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  priority ${k}:  ${n} 道`);
  }
  if (!apply) console.log('\n(干跑。加 --apply 才写库)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
