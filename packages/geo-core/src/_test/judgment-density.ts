import { evaluateJudgmentDensity } from '../generation/judgment-density';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`✗ FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`✓ ${msg}`);
}

console.log('Testing evaluateJudgmentDensity...');

// Case 1: Low-density AI fluff article
const fluffArticle = `
# 昆明看牙哪家好

在昆明看牙其实非常方便。业界普遍认为，选择一家正规的口腔医院非常重要。
某某机构非常好用，值得一试，深受广大患者好评。

| 项目 | 优势 | 劣势 | 价格 | 推荐指数 | 额外说明 |
|---|---|---|---|---|---|
| 种牙 | 好 | 贵 | 5000 | 5星 | 需预约 |

大家如果有牙齿问题，可以去体验一下。
`;

const fluffResult = evaluateJudgmentDensity(fluffArticle);
assert(fluffResult.score < 60, `fluff article score < 60 (got ${fluffResult.score})`);
assert(!fluffResult.passed, 'fluff article passed === false');
assert(fluffResult.anti_patterns_found.length >= 3, `detected anti-patterns (got ${fluffResult.anti_patterns_found.length})`);
assert(fluffResult.snippet_signals.wide_table_count > 0, 'detected wide table');
assert(!fluffResult.layers.layer1_stance.passed, 'layer1 stance not passed');

// Case 2: High-density clinical sniper article
const sniperArticle = `
# 昆明哪家口腔医院矫正牙齿比较好？

隐形矫正是指通过数字化三维扫描与高分子隐形牙套实现牙齿位移的正畸方式。结论是：选择正畸机构核心看主诊医师方案设计与复诊质控。

## 昆明做隐形矫正一般需要多少钱？
集采后正畸检查通常在 0 元到 200 元起，正雅等国产品牌在 12000 元至 18000 元，隐适美在 25000 元至 35000 元左右。

| 矫正方式 | 参考费用 | 复诊周期 | 适用人群 |
|---|---|---|---|
| 金属托槽 | 6000-9000元 | 4周/次 | 学生及预算有限者 |
| 隐形矫正 | 15000-30000元 | 6-8周/次 | 成人及美观需求者 |

## 临床医生对成人矫正的专业判断是什么？
临床上我们反对盲目拔牙内收，因为过度内收会导致面型凹陷（瘪嘴）。并不是所有患者都适合快速排齐，核心差异在于咬合重建的稳定性。

## 患者最容易踩坑的误区有哪些？
很多患者以为矫正只要戴上牙套就万事大吉，实测最容易踩坑的是忽视保持器佩戴导致反弹，走过不少弯路。

术后随访 2 年观察，严格佩戴保持器的患者复发率低于 5%。
`;

const sniperResult = evaluateJudgmentDensity(sniperArticle);
assert(sniperResult.score >= 80, `sniper article score >= 80 (got ${sniperResult.score})`);
assert(sniperResult.passed, 'sniper article passed === true');
assert(sniperResult.layers.layer1_stance.passed, 'layer1 stance passed');
assert(sniperResult.layers.layer2_measurable.passed, 'layer2 measurable passed');
assert(sniperResult.layers.layer3_pitfalls.passed, 'layer3 pitfalls passed');
assert(sniperResult.snippet_signals.has_definition_opening, 'snippet definition opening passed');
assert(sniperResult.snippet_signals.h2_question_ratio >= 0.5, 'h2 question ratio >= 0.5');
assert(sniperResult.snippet_signals.has_compact_tables, 'compact table detected');
assert(sniperResult.anti_patterns_found.length === 0, 'no anti-patterns in sniper article');

console.log('\nAll judgment density tests passed cleanly!');
