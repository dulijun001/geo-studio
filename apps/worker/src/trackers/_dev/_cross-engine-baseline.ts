/**
 * 跨引擎基线:同一批题在豆包/元宝/DeepSeek 上分别什么表现(2026-09-12)。
 *
 * 这是三个引擎第一次同时可用后的第一份对照数据。此前所有结论(提及率 84%、
 * 找机构型 25% 上榜)都只在豆包上验证过 —— docs/14 的「待补」段专门标了这点。
 *
 * 刻意**不写 geo_snapshots**:这是手工触发的诊断跑,混进生产快照表会污染
 * 周跑统计(我前面算的提及率/名次都基于那张表)。结果落 JSON,要不要并进去由人定。
 *
 * 节流:轮内三个引擎是不同域名,连着打没问题;轮间等 ROUND_GAP_MS,
 * 保证**同一引擎**两次之间 ≥5 分钟(D43 精神:别对单一引擎高频)。
 *
 * Usage: pnpm --filter @geo/worker exec tsx src/trackers/_dev/_cross-engine-baseline.ts
 */
import { writeFile } from 'node:fs/promises';
import { bestBrandRank, scanBrandMentions } from '@geo/geo-core';
import type { Engine } from '@geo/shared';
import { getServiceClient } from '../../lib/supabase';
import { getAdapter } from '../registry';

const ENGINES: Engine[] = ['doubao', 'yuanbao', 'deepseek'];
const QUESTIONS = [
  '昆明西山区种牙哪家口腔医院比较正规?',
  '昆明西山区孩子看牙哪里比较好?',
  '牙疼得厉害,昆明西山区哪里看牙比较快?',
  '昆明哪家口腔医院做牙齿矫正比较好？',
  '昆明哪家医院做种植牙比较好？',
];
const ROUND_GAP_MS = 300_000; // 5 分钟,同引擎两次之间的最小间隔
const OUT = '/tmp/cross-engine-baseline.json';

type Row = {
  question: string;
  engine: Engine;
  status: string;
  chars: number;
  brand_hits: number;
  competitor_hits: number;
  rank: number | null;
  total_in_section: number | null;
  section: string | null;
  citations: number;
  ms: number;
};

async function main() {
  const client = getServiceClient();
  const { data: t } = await client.from('tenants').select('id').eq('slug', 'songshu').limit(1);
  const tenantId = t?.[0]?.id;
  if (!tenantId) throw new Error('tenant not found');

  const { data: vocabRows } = await client
    .from('brand_vocab')
    .select('id, term, term_type, aliases')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null);
  const vocab = (vocabRows ?? []).map((v) => ({
    id: v.id as string,
    term: v.term as string,
    term_type: v.term_type as 'brand' | 'doctor' | 'service' | 'location_alias' | 'competitor',
    aliases: (v.aliases ?? []) as string[],
  }));

  const rows: Row[] = [];
  for (let i = 0; i < QUESTIONS.length; i += 1) {
    const q = QUESTIONS[i] ?? '';
    for (const engine of ENGINES) {
      const t0 = Date.now();
      let r: Awaited<ReturnType<ReturnType<typeof getAdapter>['query']>>;
      try {
        r = await getAdapter(engine).query(
          { engine, question: q, question_id: 'baseline', tenant_id: tenantId } as never,
          { account_id: 'mac-local', headless: false, timeout_ms: 180_000 } as never,
        );
      } catch (e) {
        r = { status: 'failed', failure_reason: e instanceof Error ? e.message : String(e) } as never;
      }
      const text = r.raw_response ?? '';
      const scan = scanBrandMentions(text, vocab);
      const brandOffsets = scan.mentions.filter((m) => m.term_type === 'brand').map((m) => m.offset);
      const orgOffsets = scan.mentions
        .filter((m) => m.term_type === 'brand' || m.term_type === 'competitor')
        .map((m) => m.offset);
      const best = brandOffsets.length ? bestBrandRank(text, brandOffsets, { orgOffsets }) : null;
      const row: Row = {
        question: q,
        engine,
        status: r.status,
        chars: text.length,
        brand_hits: scan.count_by_type.brand,
        competitor_hits: scan.count_by_type.competitor,
        rank: best?.rank ?? null,
        total_in_section: best?.totalInSection ?? null,
        section: best?.sectionTitle ?? null,
        citations: (r.citation_urls ?? []).length,
        ms: Date.now() - t0,
      };
      rows.push(row);
      console.log(
        `[${i + 1}/${QUESTIONS.length}] ${engine.padEnd(9)} ${row.status.padEnd(6)} ` +
          `${String(row.chars).padStart(5)}字 品牌×${row.brand_hits} 竞品×${row.competitor_hits} ` +
          `名次${row.rank ?? '—'} 引用${row.citations}`,
      );
      await writeFile(OUT, JSON.stringify(rows, null, 2)); // 边跑边存,中断也不丢
    }
    if (i < QUESTIONS.length - 1) {
      console.log(`--- 第 ${i + 1} 轮完,等 ${ROUND_GAP_MS / 60000} 分钟再跑下一轮(节流) ---`);
      await new Promise((res) => setTimeout(res, ROUND_GAP_MS));
    }
  }

  console.log('\n=== 汇总:同一题在三个引擎上 ===');
  for (const q of QUESTIONS) {
    console.log(`\n「${q}」`);
    for (const e of ENGINES) {
      const r = rows.find((x) => x.question === q && x.engine === e);
      if (!r) continue;
      const verdict =
        r.status !== 'done' ? `❌ ${r.status}`
        : r.rank ? `🥇 第 ${r.rank}/${r.total_in_section} 名`
        : r.brand_hits > 0 ? '⚪ 被提到但没上榜'
        : '🔴 完全没提到我们';
      console.log(`  ${e.padEnd(9)} ${verdict}  (竞品×${r.competitor_hits} 引用${r.citations})`);
    }
  }
  console.log(`\n明细已存 ${OUT}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
