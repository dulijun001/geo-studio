/**
 * P1-1 评分器再校准分析(docs/11)— 用自家「发布→被豆包引用」闭环数据
 * 对比被引 vs 未被引文章在 L1 九法 / L2 五维 / 标题闸门上的分布差异。
 *
 * 输入:/tmp/cited-dataset.json(psql 导出,111 篇已发布头条文 + cited 标记)
 * 运行:pnpm --filter @geo/geo-core exec tsx src/_dev/recalib-analysis.ts
 *
 * 统计纪律:n_cited=14 是小样本,输出的是「方向性判别力」不是回归系数;
 * 同时按地域层级(A 区县/B 城市/C 无地域)分层展示,防 D44 混淆
 * (区县题引用率本来就高,别把"选题优势"误读成"写法优势")。
 */
import { readFileSync } from 'fs';
import { scoreGeo } from '../generation/scorer';
import { scoreGeoL2 } from '../generation/scorer-l2';
import { checkTitleQueryMatch } from '../generation/title-gate';

type Row = {
  title: string; body: string; cited: boolean; question: string | null;
  published_at: string; l1_stored: number | null; tier: 'A' | 'B' | 'C' | 'X';
};

const rows: Row[] = JSON.parse(readFileSync('/tmp/cited-dataset.json', 'utf8'));

type Feat = Record<string, number>;
function features(r: Row): Feat {
  const l1 = scoreGeo({ title: r.title, body: r.body });
  const l2 = scoreGeoL2({
    title: r.title, body: r.body,
    ctx: { brand_name: '松鼠口腔', city: '昆明', is_medical: true, primary_query: r.question ?? undefined },
  });
  const gate = r.question ? checkTitleQueryMatch(r.title, r.question) : null;
  const f: Feat = {
    l1_total: l1.total,
    l2_total: l2.total,
    body_len: r.body.length,
    title_len: r.title.length,
    title_gate_pass: gate ? (gate.ok ? 1 : 0) : NaN,
  };
  for (const [k, v] of Object.entries(l1.breakdown)) f[`l1_${k}`] = (v as { score: number }).score;
  for (const [k, v] of Object.entries(l2.breakdown)) {
    const dim = v as { score: number; unknown?: boolean };
    f[`l2_${k}`] = dim.unknown ? NaN : dim.score;
  }
  return f;
}

const enriched = rows.map((r) => ({ r, f: features(r) }));

function mean(xs: number[]): number {
  const v = xs.filter((x) => !Number.isNaN(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
}

function compare(label: string, subset: typeof enriched) {
  const cited = subset.filter((e) => e.r.cited);
  const not = subset.filter((e) => !e.r.cited);
  if (!cited.length) { console.log(`\n── ${label}: 无被引样本,跳过`); return; }
  console.log(`\n── ${label} (cited=${cited.length} / uncited=${not.length}) ──`);
  const keys = Object.keys(subset[0]?.f ?? {});
  const diffs = keys.map((k) => {
    const mc = mean(cited.map((e) => e.f[k] ?? NaN));
    const mn = mean(not.map((e) => e.f[k] ?? NaN));
    return { k, mc, mn, gap: mc - mn };
  }).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  for (const d of diffs) {
    const flag = Math.abs(d.gap) >= 8 ? ' ◀◀' : Math.abs(d.gap) >= 4 ? ' ◀' : '';
    console.log(`  ${d.k.padEnd(28)} 被引=${d.mc.toFixed(1).padStart(7)}  未被引=${d.mn.toFixed(1).padStart(7)}  差=${d.gap >= 0 ? '+' : ''}${d.gap.toFixed(1)}${flag}`);
  }
}

// 全量 + 分层(控制 D44 选题混淆)
compare('全量', enriched);
compare('仅 B 城市级', enriched.filter((e) => e.r.tier === 'B'));
compare('仅 A 区县级', enriched.filter((e) => e.r.tier === 'A'));
compare('仅 C 无地域', enriched.filter((e) => e.r.tier === 'C'));

// 层级本身的引用率(选题效应基准)
console.log('\n── 地域层级引用率(选题效应,写法之外的底盘) ──');
for (const t of ['A', 'B', 'C', 'X'] as const) {
  const s = enriched.filter((e) => e.r.tier === t);
  if (!s.length) continue;
  const c = s.filter((e) => e.r.cited).length;
  console.log(`  ${t}: ${c}/${s.length} = ${((100 * c) / s.length).toFixed(0)}%`);
}
