/**
 * rank.ts 自检 —— 拿库里真实豆包答案跑,不造数据。
 *
 * 验三件事:
 *   1) 解析器能不能从真实答案里切出板块和条目(不是只在我编的样本上 work)
 *   2) 品牌词落到编号条目上的命中率是多少
 *   3) 抽样打印出来给人眼核对名次对不对(防「跑通了但算错了」)
 *
 * Usage:
 *   pnpm --filter @geo/worker exec tsx src/trackers/_dev/_check-rank.ts [tenant_slug]
 */
import { bestBrandRank, parseAnswerRanking, scanBrandMentions } from '@geo/geo-core';
import { getServiceClient } from '../../lib/supabase';

async function main() {
  const slug = process.argv[2] ?? 'songshu';
  const client = getServiceClient();

  const { data: tenants } = await client.from('tenants').select('id, slug').eq('slug', slug).limit(1);
  const tenant = tenants?.[0];
  if (!tenant) throw new Error(`tenant slug='${slug}' not found`);

  const { data: vocabRows } = await client
    .from('brand_vocab')
    .select('id, term, term_type, aliases')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null);
  if (!vocabRows?.length) throw new Error('brand_vocab is empty');
  const vocab = vocabRows.map((v) => ({ ...v, aliases: v.aliases ?? [] }));

  // 注意:geo_snapshots.question_id 没有建 FK 约束,PostgREST 推不出关系,
  // 不能用 questions(text) 嵌套查询——会静默返回空。题面单独捞一次再在内存里配。
  const { data: snaps, error: snapErr } = await client
    .from('geo_snapshots')
    .select('id, raw_response, question_id')
    .eq('tenant_id', tenant.id)
    .eq('status', 'done')
    .order('asked_at', { ascending: false })
    .limit(500);
  if (snapErr) throw new Error(`snapshot query failed: ${JSON.stringify(snapErr)}`);
  if (!snaps?.length) throw new Error('没有 done 状态的快照可验');

  const { data: qRows } = await client.from('questions').select('id, text').eq('tenant_id', tenant.id);
  const qText = new Map((qRows ?? []).map((q) => [q.id, q.text as string]));

  const usable = snaps.filter((s) => (s.raw_response ?? '').length > 400);

  let withSections = 0;
  let withItems = 0;
  let brandMentioned = 0;
  let ranked = 0;
  const samples: string[] = [];

  for (const s of usable) {
    const text: string = s.raw_response ?? '';
    const sections = parseAnswerRanking(text);
    const itemCount = sections.reduce((n, sec) => n + sec.items.length, 0);
    if (sections.some((x) => x.index > 0)) withSections += 1;
    if (itemCount > 0) withItems += 1;

    const scan = scanBrandMentions(text, vocab);
    const brandOffsets = scan.mentions.filter((m) => m.term_type === 'brand').map((m) => m.offset);
    // 机构榜闸门用的词 = 本品牌 + 竞品,两类都是「机构名」
    const orgOffsets = scan.mentions
      .filter((m) => m.term_type === 'brand' || m.term_type === 'competitor')
      .map((m) => m.offset);
    if (brandOffsets.length === 0) continue;
    brandMentioned += 1;

    const best = bestBrandRank(text, brandOffsets, { orgOffsets });
    if (!best) continue;
    ranked += 1;

    if (samples.length < 10) {
      const q = qText.get(s.question_id) ?? s.question_id;
      samples.push(
        `  ${q}\n` +
          `    → 板块「${best.sectionTitle ?? '(无板块)'}」第 ${best.rank}/${best.totalInSection} 名\n` +
          `      条目:${best.itemLabel}`,
      );
    }
  }

  console.log(`\n样本(done 且正文 >400 字): ${usable.length}`);
  console.log(`能切出中文数字板块的:      ${withSections}`);
  console.log(`能切出编号条目的:          ${withItems}`);
  console.log(`品牌词有命中的:            ${brandMentioned}`);
  console.log(
    `其中解析出名次的:          ${ranked}  (占被提及的 ${((ranked / Math.max(brandMentioned, 1)) * 100).toFixed(0)}%)`,
  );
  console.log(`\n抽样人工核对:\n${samples.join('\n')}`);

  // 硬断言:真实数据上必须真解析出东西,否则这个模块等于没写
  if (withItems === 0) throw new Error('FAIL: 真实样本里一个编号条目都没切出来');
  if (ranked === 0) throw new Error('FAIL: 一条名次都没解析出来');
  console.log('\n✅ 自检通过');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
