/** 验名次解析:新格式能不能解出来 + 老格式有没有被改坏(回归)。 */
import { readFileSync } from 'node:fs';
import { bestBrandRank, parseAnswerRanking, scanBrandMentions } from '@geo/geo-core';
import { getServiceClient } from '../../lib/supabase';

async function main() {
  const client = getServiceClient();
  const { data: t } = await client.from('tenants').select('id').eq('slug', 'songshu').limit(1);
  const { data: v } = await client
    .from('brand_vocab').select('id, term, term_type, aliases')
    .eq('tenant_id', t?.[0]?.id).is('deleted_at', null);
  const vocab = (v ?? []).map((x) => ({
    id: x.id as string, term: x.term as string,
    term_type: x.term_type as 'brand' | 'doctor' | 'service' | 'location_alias' | 'competitor',
    aliases: (x.aliases ?? []) as string[],
  }));

  console.log('=== 新格式(2026-09-12 改版后的真实答案) ===');
  const nt = readFileSync('/tmp/doubao-submit/after.txt', 'utf-8');
  for (const s of parseAnswerRanking(nt)) {
    if (s.items.length) console.log(`  板块[${s.index}] ${s.title} — ${s.items.length} 条: ${s.items.map((i) => i.label.slice(0, 14)).join(' | ')}`);
  }
  const sc = scanBrandMentions(nt, vocab);
  const bo = sc.mentions.filter((m) => m.term_type === 'brand').map((m) => m.offset);
  const oo = sc.mentions.filter((m) => m.term_type === 'brand' || m.term_type === 'competitor').map((m) => m.offset);
  const best = bestBrandRank(nt, bo, { orgOffsets: oo });
  console.log(best ? `  ✅ 松鼠名次:板块「${best.sectionTitle}」第 ${best.rank}/${best.totalInSection}` : '  ❌ 仍解不出名次');

  console.log('\n=== 老格式回归(库里 100 条历史快照,改前是 8 条有名次) ===');
  const { data: snaps } = await client
    .from('geo_snapshots').select('raw_response')
    .eq('tenant_id', t?.[0]?.id).eq('status', 'done').limit(500);
  let ranked = 0;
  for (const s of snaps ?? []) {
    const txt = (s.raw_response as string) ?? '';
    if (txt.length < 400) continue;
    const sc2 = scanBrandMentions(txt, vocab);
    const b2 = sc2.mentions.filter((m) => m.term_type === 'brand').map((m) => m.offset);
    const o2 = sc2.mentions.filter((m) => m.term_type === 'brand' || m.term_type === 'competitor').map((m) => m.offset);
    if (b2.length && bestBrandRank(txt, b2, { orgOffsets: o2 })) ranked += 1;
  }
  console.log(`  历史解出名次: ${ranked} 条  ${ranked >= 8 ? '✅ 没退化' : '🔴 退化了(改前是 8)'}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
