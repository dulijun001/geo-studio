/**
 * 手工出题的四道入库闸预检 —— 与 topic-replenish.ts 的自动补货同闸,
 * 保证手工补的题和 LLM 补的题过同一套标准(D52)。
 * Run: SCREEN_DIR=<dir> pnpm --filter @geo/geo-core exec tsx src/_dev/screen-candidates.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { isNearDuplicateQuestion, questionGeoTier, type QuestionLike } from '../tracking/question-dedup';

const DIR = process.env.SCREEN_DIR ?? '/tmp';
const GEO_ANCHOR_RE = /昆明|西山|双塔|希望路/;
const SEED_REDLINE_RE = /最好|最佳|第一名|排名第一|根治|治愈|无痛|保证|包治/;

const existing: QuestionLike[] = readFileSync(`${DIR}/existing.tsv`, 'utf8')
  .split('\n').filter(Boolean)
  .map((l) => { const [text, intent] = l.split('\t'); return { text: text ?? '', intent: intent || null }; });
const competitors: string[] = JSON.parse(readFileSync(`${DIR}/competitors.json`, 'utf8').trim() || '[]');

type Cand = { text: string; intent: string; kb: string };
const cands: Cand[] = readFileSync(`${DIR}/candidates.tsv`, 'utf8')
  .split('\n').filter(Boolean)
  .map((l) => { const [text, intent, kb] = l.split('\t'); return { text: text ?? '', intent: intent ?? '', kb: kb ?? '' }; });

const passed: Cand[] = [];
const rejected: Array<Cand & { gate: string; detail: string }> = [];

for (const c of cands) {
  if (!GEO_ANCHOR_RE.test(c.text)) { rejected.push({ ...c, gate: '闸1 地域锚定', detail: '无昆明/西山/双塔' }); continue; }
  const lower = c.text.toLowerCase();
  const hitComp = competitors.find((k) => k && lower.includes(k));
  if (hitComp) { rejected.push({ ...c, gate: '闸2 竞品名', detail: hitComp }); continue; }
  const v = isNearDuplicateQuestion({ text: c.text, intent: c.intent }, existing);
  if (v.duplicate) { rejected.push({ ...c, gate: '闸3 语义查重', detail: `${v.score.toFixed(2)} ~ ${v.matched}` }); continue; }
  const red = c.text.match(SEED_REDLINE_RE);
  if (red) { rejected.push({ ...c, gate: '闸4 题面红线', detail: red[0] }); continue; }
  passed.push(c);
  existing.push({ text: c.text, intent: c.intent }); // 候选之间也互查
}

console.log(`候选 ${cands.length} → 通过 ${passed.length} / 拒绝 ${rejected.length}\n`);
if (rejected.length) {
  console.log('── 被拦下的 ──');
  for (const r of rejected) console.log(`  [${r.gate}] ${r.text}\n      ${r.detail}`);
  console.log();
}
const tiers = new Map<string, number>();
for (const p of passed) { const t = questionGeoTier(p.text); tiers.set(t, (tiers.get(t) ?? 0) + 1); }
console.log('通过题的地域层级分布:', Object.fromEntries(tiers));
const intents = new Map<string, number>();
for (const p of passed) intents.set(p.intent, (intents.get(p.intent) ?? 0) + 1);
console.log('意图分布:', Object.fromEntries([...intents.entries()].sort((a,b)=>b[1]-a[1])));
writeFileSync(`${DIR}/passed.tsv`, passed.map((p) => `${p.text}\t${p.intent}\t${p.kb}`).join('\n'));
console.log(`\n已写出 ${DIR}/passed.tsv`);
