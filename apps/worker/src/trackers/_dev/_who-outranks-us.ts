/**
 * 「提到了但没进推荐位」的 74 道题里,推荐位上坐的是谁?(2026-09-12)
 *
 * 为什么做这个:D66 修完数据后暴露的真瓶颈不是「没被提及」(提及率 90%),
 * 是 74 道题**提到了我们、却没把我们放进编号推荐榜**。docs/08 那 5 个断点
 * 没有一个覆盖这件事 —— 因为 08 立项(2026-05-14)时还没有名次数据(D64 昨天才做)。
 *
 * 这个脚本回答的是「该打谁」:把这些题的推荐榜前三名统计出来,
 * 谁反复占着本该是我们的位置,一眼看到。
 *
 * Usage: pnpm --filter @geo/worker exec tsx src/trackers/_dev/_who-outranks-us.ts
 */
import { parseAnswerRanking, scanBrandMentions } from '@geo/geo-core';
import { getServiceClient } from '../../lib/supabase';

async function main() {
  const slug = process.argv[2] ?? 'songshu';
  const client = getServiceClient();

  const { data: tenants } = await client.from('tenants').select('id').eq('slug', slug).limit(1);
  const tenant = tenants?.[0];
  if (!tenant) throw new Error(`tenant '${slug}' not found`);

  const { data: vocabRows } = await client
    .from('brand_vocab')
    .select('id, term, term_type, aliases')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null);
  const vocab = (vocabRows ?? []).map((v) => ({
    id: v.id as string,
    term: v.term as string,
    term_type: v.term_type as 'brand' | 'doctor' | 'service' | 'location_alias' | 'competitor',
    aliases: (v.aliases ?? []) as string[],
  }));
  const ownTerms = (vocabRows ?? [])
    .filter((v) => v.term_type === 'brand')
    .flatMap((v) => [v.term as string, ...((v.aliases ?? []) as string[])]);

  const { data: snaps } = await client
    .from('geo_snapshots')
    .select('id, question_id, raw_response, meta')
    .eq('tenant_id', tenant.id)
    .eq('status', 'done')
    .limit(2000);

  const { data: qRows } = await client.from('questions').select('id, text').eq('tenant_id', tenant.id);
  const qText = new Map((qRows ?? []).map((q) => [q.id as string, q.text as string]));

  // 只看「提到了我们但没上榜」的快照
  const target = (snaps ?? []).filter((s) => {
    const meta = (s.meta ?? {}) as Record<string, unknown>;
    const bs = (meta.brand_scan ?? {}) as Record<string, number>;
    return (bs.brand ?? 0) > 0 && meta.brand_rank == null;
  });

  const occupant = new Map<string, { n: number; top1: number; samples: string[] }>();
  let withBoard = 0;

  for (const s of target) {
    const text = s.raw_response ?? '';
    const scan = scanBrandMentions(text, vocab);
    const orgOffsets = scan.mentions
      .filter((m) => m.term_type === 'brand' || m.term_type === 'competitor')
      .map((m) => m.offset);
    const sections = parseAnswerRanking(text);

    // 只统计「真机构榜」板块:至少 2 条命中机构词(与 rank.ts 的 isOrgRanking 同判据)
    const boards = sections.filter(
      (sec) => sec.items.filter((it) => orgOffsets.some((o) => o >= it.start && o < it.end)).length >= 2,
    );
    if (boards.length === 0) continue;
    withBoard += 1;

    for (const sec of boards) {
      for (const it of sec.items.slice(0, 3)) {
        const name = shortName(it.label);
        if (!name || ownTerms.some((t) => name.includes(t))) continue;
        const cur = occupant.get(name) ?? { n: 0, top1: 0, samples: [] };
        cur.n += 1;
        if (it.ordinal === 1) cur.top1 += 1;
        const q = qText.get(s.question_id as string);
        if (q && cur.samples.length < 2 && !cur.samples.includes(q)) cur.samples.push(q);
        occupant.set(name, cur);
      }
    }
  }

  // 对照组:同一套检测跑「已上榜」的快照。那些一定有榜,若这里也是 0 就是解析坏了。
  const control = (snaps ?? []).filter((s2) => {
    const meta = (s2.meta ?? {}) as Record<string, unknown>;
    return meta.brand_rank != null;
  });
  let controlBoards = 0;
  for (const s2 of control) {
    const text = s2.raw_response ?? '';
    const scan = scanBrandMentions(text, vocab);
    const orgOffsets = scan.mentions
      .filter((m) => m.term_type === 'brand' || m.term_type === 'competitor')
      .map((m) => m.offset);
    const hit = parseAnswerRanking(text).some(
      (sec) => sec.items.filter((it) => orgOffsets.some((o) => o >= it.start && o < it.end)).length >= 2,
    );
    if (hit) controlBoards += 1;
  }
  console.log(`对照组(已上榜快照 ${control.length} 条)检出机构榜:${controlBoards} 条`);
  console.log(controlBoards > 0
    ? '  → 检测逻辑有效。目标组 0 榜是真的「答案里没有推荐榜」,不是解析坏了。\n'
    : '  → 🔴 对照组也是 0,检测逻辑本身失效,上面的结论不能信。\n');

  const ranked = [...occupant.entries()].sort((a, b) => b[1].n - a[1].n);

  console.log(`\n「提到了但没进推荐位」的快照:  ${target.length}`);
  console.log(`其中答案里确实有机构榜的:      ${withBoard}  ← 这些是真被别人挤掉的`);
  console.log(`剩下 ${target.length - withBoard} 条答案压根没有机构榜(问法不产生榜单,不是被挤掉)\n`);

  console.log('占着推荐位的机构 Top 15(出现次数 / 其中拿第1):');
  for (const [name, v] of ranked.slice(0, 15)) {
    console.log(`  ${String(v.n).padStart(3)}次 (第1 ${v.top1})  ${name}`);
    if (v.samples[0]) console.log(`        例:${v.samples[0]}`);
  }

  console.log('\n✅ 跑完(结论以对照组那行为准)');
}

/** 从条目标题里截出机构名:切到第一个括号/标点前,最多 14 字。 */
function shortName(label: string): string {
  const head = label.split(/[（(【\[:：,，。]/, 1)[0] ?? '';
  const clean = head.replace(/^[\s·•\-—]+/, '').trim();
  return clean.length > 14 ? clean.slice(0, 14) : clean;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
