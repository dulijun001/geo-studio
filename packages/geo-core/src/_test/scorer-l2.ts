/**
 * Scorer L2 smoke test (D21 / ADR 009).
 *
 * Pure function — no DB, no LLM. Run:
 *   pnpm --filter @geo/geo-core tsx src/_test/scorer-l2.ts
 *
 * Validates:
 *   1. Bad article gets low total
 *   2. Good article gets high total
 *   3. Trust block dimension actually counts 7 fields
 *   4. Citation worthiness penalises anaphora
 *   5. Entity explicitness rewards brand + city present
 *   6. unknown=true on missing primary_query doesn't pollute total
 */
import { scoreGeoL2 } from '../generation/scorer-l2';

type Result = { name: string; pass: boolean; detail?: string };
const results: Result[] = [];
function ok(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`);
}

// ── Test 1: Bad article (no structure, no trust, lots of anaphora) ─────────
const bad = scoreGeoL2({
  title: '关于洗牙的一些事',
  body: '这种情况其实很常见,前面提到的那个原因可以解释。' +
        '那种感觉很多人都有过。后者更常见。' +
        '上面说的就是这个意思,前文提到的内容大家应该都懂。',
  ctx: { primary_query: '洗牙会不会让牙缝变大', brand_name: '昆明松鼠口腔', city: '昆明', is_medical: true },
});
ok('bad article: total < 40', bad.total < 40, `total=${bad.total}`);
ok('bad article: anaphora penalised', bad.breakdown.citation_worthiness.score < 50,
   `citation_worthiness=${bad.breakdown.citation_worthiness.score}`);

// ── Test 2: Good article (full Trust Block + FAQ + direct answer) ──────────
const goodBody = `
洗牙不会让牙缝变大。 大家以为洗牙会破坏牙齿,其实那是误解—— 牙缝是牙结石被清除后,牙齿之间原本就有的间隙暴露出来的,与洗牙这一动作本身无关。

## 为什么会有这种误解

很多准备洁牙的成年人会观察到一个现象:洗完牙后照镜子,牙缝看上去更明显。其实这是因为牙结石之前填补了牙缝,清除后视觉上空隙就显现了。

## 适用人群

本文适用于:准备做洁牙、或刚做完洁牙觉得"牙缝变大"的成年人;还在评估洁牙必要性的患者。

## 不适用人群

牙周炎中重度患者、近 3 个月做过牙龈手术者,需要先线下面诊评估,不能用一篇科普文章替代医生判断。

## 风险边界

如果洗牙后**长期疼痛**、牙龈持续肿胀或者**牙齿明显松动**,这些都属于风险信号。 建议尽快线下检查,不要只在网上继续查。

## FAQ

Q1: 多久洗一次牙?
答: 健康人群建议每年 1 次,牙周易感人群 3-6 个月 1 次。具体周期请医生评估。

Q2: 洗牙会伤牙吗?
答: 规范的超声波洁牙不会伤害釉质。但操作不规范的小诊所可能划伤牙面,选择正规口腔机构是关键。

Q3: 洗牙后多久能正常吃饭?
答: 2 小时内不要喝过冷过热的饮品。当天可以正常进食,但不建议吃染色食物例如咖喱、红酒。

Q4: 牙缝洗完真的会变大吗?
答: 视觉上会变明显,但物理上没有变大。 牙结石占据的位置回归到本该是空隙的状态。

Q5: 多年没洗牙,第一次洗会很疼吗?
答: 牙结石较厚时洗牙过程中可能有酸胀感,但医生会按你的耐受度调节强度。 强烈不适请立即举手示意。

## Trust Block

本文适用于:关注口腔健康、准备做洁牙或刚做完洁牙的成年人。
本文不替代:面诊检查、影像评估、专业牙周评估。
出现以下情况建议尽快就诊:洗牙后持续疼痛、牙龈大面积出血、牙齿松动加剧。
审核: 昆明松鼠口腔医疗团队 / 贾真真医生。
更新: 2026-05。
机构信息: 昆明松鼠口腔位于昆明西山区。
地域: 昆明 / 云南。
`.trim();

const good = scoreGeoL2({
  title: '洗牙会不会让牙缝变大?医生从牙结石讲起',
  body: goodBody,
  ctx: { primary_query: '洗牙会不会让牙缝变大', brand_name: '昆明松鼠口腔', city: '昆明', is_medical: true },
});
ok('good article: total >= 70', good.total >= 70, `total=${good.total}`);
ok('good article: trust block ≥ 80', good.breakdown.trust_block_completeness.score >= 80,
   `trust=${good.breakdown.trust_block_completeness.score}, evidence=${JSON.stringify(good.breakdown.trust_block_completeness.evidence)}`);
ok('good article: entity ≥ 70', good.breakdown.entity_explicitness.score >= 70,
   `entity=${good.breakdown.entity_explicitness.score}`);
ok('good article: query coverage > 50', good.breakdown.query_coverage.score > 50,
   `qc=${good.breakdown.query_coverage.score}`);
ok('good article: sliceability >= 70', good.breakdown.sliceability.score >= 70,
   `slice=${good.breakdown.sliceability.score}`);

// ── Test 3: Unknown query_intent doesn't pollute total ─────────────────────
const noQuery = scoreGeoL2({
  title: '洗牙小百科',
  body: goodBody,
  ctx: { brand_name: '昆明松鼠口腔', city: '昆明', is_medical: true },
});
ok('no primary_query: query_coverage marked unknown', noQuery.breakdown.query_coverage.unknown === true);
ok('no primary_query: total still computed without it', noQuery.total > 0,
   `total=${noQuery.total} (uses 85 weight not 100)`);

// ── Test 4: Non-medical defaults Trust block to 100 ────────────────────────
const nonMed = scoreGeoL2({
  title: '随便写一篇',
  body: '这就是一篇普通文章。',
  ctx: { is_medical: false },
});
ok('non-medical: trust_block scored 100 (not required)',
   nonMed.breakdown.trust_block_completeness.score === 100);

// ── Test 5: Anaphora detection sensitivity ─────────────────────────────────
const heavyAnaphora = scoreGeoL2({
  title: 't',
  body: '这种情况 那种问题 前者 后者 这种 那种 这个 上面提到 上述 刚才说的 前文 这种 那种'.repeat(3),
  ctx: { is_medical: false },
});
ok('heavy anaphora: citation_worthiness penalised hard',
   heavyAnaphora.breakdown.citation_worthiness.score < 40,
   `cw=${heavyAnaphora.breakdown.citation_worthiness.score}`);

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed > 0) {
  console.error('\nFAILED:');
  results.filter((r) => !r.pass).forEach((r) => console.error(`  ✗ ${r.name}${r.detail ? `: ${r.detail}` : ''}`));
  process.exit(1);
}
