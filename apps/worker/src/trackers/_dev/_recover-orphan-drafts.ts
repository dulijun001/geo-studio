/**
 * 回收「孤儿稿」（D76,2026-09-19）。
 *
 * 孤儿稿 = 起草时服务端已写库、但客户端超时没拿到 id，于是没生成变体、
 * 也没回填 target_questions 的内容。它们永远不可能被派单，等于白花的钱。
 * 实测 132 条（7-20 ~ 9-18）。根因已在 batch-draft-item.ts 修掉（超时认领），
 * 这个脚本只处理存量。
 *
 * ⚠️ 默认干跑。--apply 才会真的投 variant_generate 任务 ——
 * 那一步要调 LLM 生成变体，在方舟欠费期间吃的是用户自己的 Claude 额度，
 * 属于花钱动作，必须人来决定。
 *
 * 顺带做去重：同标题的孤儿稿只回收 DoD 最高的一份，其余列出来让人决定是否软删。
 *
 * Usage:
 *   set -a && . ./.env && set +a
 *   pnpm --filter @geo/worker exec tsx src/trackers/_dev/_recover-orphan-drafts.ts [slug] [--apply]
 */
import { getServiceClient } from '../../lib/supabase';

async function main() {
  const slug = process.argv[2]?.startsWith('--') ? 'songshu' : (process.argv[2] ?? 'songshu');
  const apply = process.argv.includes('--apply');
  const client = getServiceClient();

  const { data: t } = await client.from('tenants').select('id').eq('slug', slug).limit(1);
  const tenantId = t?.[0]?.id;
  if (!tenantId) throw new Error(`tenant '${slug}' not found`);

  const { data: items, error } = await client
    .from('content_items')
    .select('id, title, created_at, target_questions, dod_score')
    .eq('tenant_id', tenantId)
    .eq('status', 'ai_drafted')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1000);
  if (error) throw new Error(JSON.stringify(error));

  // 只要没有变体的
  const orphans: typeof items = [];
  for (const it of items ?? []) {
    const { count } = await client
      .from('content_variants')
      .select('id', { count: 'exact', head: true })
      .eq('content_item_id', it.id as string)
      .is('deleted_at', null);
    if ((count ?? 0) === 0) orphans.push(it);
  }

  // 同标题去重:留 geo_score 最高的
  const byTitle = new Map<string, typeof orphans>();
  for (const o of orphans) {
    const k = String(o.title ?? '').trim();
    if (!byTitle.has(k)) byTitle.set(k, []);
    byTitle.get(k)?.push(o);
  }
  const keep: typeof orphans = [];
  const dup: typeof orphans = [];
  for (const [, group] of byTitle) {
    const sorted = [...group].sort(
      (a, b) =>
        (Number(b.dod_score) || 0) - (Number(a.dod_score) || 0),
    );
    const [first, ...rest] = sorted;
    if (first) keep.push(first);
    dup.push(...rest);
  }

  console.log(`\n孤儿稿总数:        ${orphans.length}`);
  console.log(`去重后值得回收:    ${keep.length}`);
  console.log(`同标题重复(建议软删): ${dup.length}`);
  console.log(`缺 target_questions: ${keep.filter((o) => !(o.target_questions as unknown[])?.length).length}`);
  console.log('\n抽样 8 条:');
  for (const o of keep.slice(0, 8)) {
    console.log(`  ${String(o.created_at).slice(0, 10)}  ${String(o.title).slice(0, 34)}`);
  }

  if (!apply) {
    console.log(`\n(干跑。加 --apply 会给这 ${keep.length} 条投 variant_generate —— 那是花钱动作)`);
    return;
  }

  const { enqueueViaSharedBoss } = await import('../../lib/boss-ref');
  let ok = 0;
  for (const o of keep) {
    try {
      await enqueueViaSharedBoss('content.variant_generate', {
        content_item_id: o.id,
        tenant_id: tenantId,
        // 平台在 variants 上,content_items 没有这一列;交给 variant_generate 用租户默认平台
        platforms: undefined,
      });
      ok += 1;
    } catch (e) {
      console.error(`  投递失败 ${o.id}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`\n已投递 variant_generate: ${ok}/${keep.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
