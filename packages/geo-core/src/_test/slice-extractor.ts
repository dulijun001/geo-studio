/**
 * Slice extractor smoke test (D21 / ADR 009 P1).
 *
 * Pure function — no DB, no LLM. Run:
 *   pnpm --filter @geo/geo-core tsx src/_test/slice-extractor.ts
 */
import { extractSlices } from '../generation/slice-extractor';

type Result = { name: string; pass: boolean; detail?: string };
const results: Result[] = [];
function ok(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`);
}

const goodBody = `
洗牙不会让牙缝变大。 大家以为洗牙会破坏牙齿,其实那是误解—— 牙缝是牙结石被清除后,牙齿之间原本就有的间隙暴露出来的。

## 为什么会有这种误解

很多准备洁牙的成年人会观察到一个现象:洗完牙后照镜子,牙缝看上去更明显。其实这是因为牙结石之前填补了牙缝,清除后视觉上空隙就显现了。

## 风险边界

如果洗牙后**长期疼痛**、牙龈持续肿胀或者**牙齿明显松动**,这些都属于风险信号。 建议尽快线下检查,不要只在网上继续查。

## FAQ

Q1: 多久洗一次牙?
答: 健康人群建议每年 1 次,牙周易感人群 3-6 个月 1 次。

Q2: 洗牙会伤牙吗?
答: 规范的超声波洁牙不会伤害釉质。

Q3: 洗牙后多久能正常吃饭?
答: 2 小时内不要喝过冷过热的饮品。

Q4: 牙缝洗完真的会变大吗?
答: 视觉上会变明显,但物理上没有变大。

Q5: 多年没洗牙,第一次洗会很疼吗?
答: 牙结石较厚时可能有酸胀感。

## Trust Block

本文适用于:关注口腔健康、准备做洁牙的成年人。
本文不替代:面诊检查、影像评估。
出现以下情况建议尽快就诊:洗牙后持续疼痛、牙龈大面积出血、牙齿松动加剧。
审核: 昆明松鼠口腔医疗团队 / 贾真真医生。
更新: 2026-05。
机构信息: 昆明松鼠口腔。
地域: 昆明 / 云南。
`.trim();

const slices = extractSlices({
  body: goodBody,
  ctx: { brand_name: '昆明松鼠口腔', city: '昆明' },
});

ok('direct_answer extracted', !!slices.direct_answer, slices.direct_answer);
ok('direct_answer length OK', (slices.direct_answer?.length ?? 0) <= 120);
ok('myth_busting_block found', !!slices.myth_busting_block);
ok('when_to_seek_care found', !!slices.when_to_seek_care);
ok('faq_pairs >= 5', (slices.faq_pairs?.length ?? 0) >= 5,
   `found ${slices.faq_pairs?.length ?? 0} pairs`);
ok('faq Q4 captured', !!slices.faq_pairs?.find((p) => p.q.includes('牙缝洗完')));
ok('trust_block applicable_to', !!slices.trust_block?.applicable_to);
ok('trust_block not_replace', !!slices.trust_block?.not_replace);
ok('trust_block seek_care_if', !!slices.trust_block?.seek_care_if);
ok('trust_block reviewed_by', !!slices.trust_block?.reviewed_by);
ok('trust_block updated_at', !!slices.trust_block?.updated_at);
ok('trust_block institution', !!slices.trust_block?.institution);
ok('trust_block region', !!slices.trust_block?.region);
ok('entity brand_name', slices.entity_snapshot?.brand_name === '昆明松鼠口腔');
ok('entity city', slices.entity_snapshot?.city === '昆明');
ok('entity reviewed_by', !!slices.entity_snapshot?.reviewed_by);
ok('summary_1 present', !!slices.summary_1);
ok('summary_3 present', !!slices.summary_3);
ok('version pinned to 1', slices.version === 1);
ok('extracted_at ISO format', /^\d{4}-\d{2}-\d{2}T/.test(slices.extracted_at));

// ── Edge: empty body ──────────────────────────────────────────────────────
const empty = extractSlices({ body: '' });
ok('empty body: no direct_answer', empty.direct_answer === undefined);
ok('empty body: no faq', empty.faq_pairs === undefined);

// ── Markdown bold Q pattern — what LLM actually emits ─────────────────────
const boldQBody = `
### 一句话结论
洗牙不会让牙缝变大。

### FAQ
1. **洗牙会损伤牙齿吗？**
洗牙一般不会损伤牙齿。超声波频率严格控制,正常操作不伤牙。

2. **洗牙后要注意什么？**
短期避免冷热辛辣食物,注意口腔卫生,正确刷牙使用牙线。

3. **多久洗一次牙合适？**
建议每 6-12 个月一次,具体按个人口腔情况和医生建议。

4. **洗牙能去除所有污渍吗？**
主要去除牙结石和外源性色素,内源性色素效果有限。

5. **洗牙过程会很痛吗？**
大多数人只有轻微酸胀感,牙龈炎症重时可能稍明显。
`.trim();
const bold = extractSlices({ body: boldQBody });
ok('markdown bold Q: extracts 5 FAQ pairs', (bold.faq_pairs?.length ?? 0) === 5,
   `extracted ${bold.faq_pairs?.length ?? 0} pairs`);
ok('markdown bold Q: Q stripped of ** wrappers', !bold.faq_pairs?.[0]?.q.includes('**'),
   `first Q: ${bold.faq_pairs?.[0]?.q}`);

// ── Edge: short body ──────────────────────────────────────────────────────
const short = extractSlices({ body: '随便一句话。' });
ok('short body: no faq', (short.faq_pairs?.length ?? 0) === 0 || short.faq_pairs === undefined);
ok('short body: still has direct_answer attempt', !!short.direct_answer || short.direct_answer === undefined);

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed > 0) {
  console.error('\nFAILED:');
  results.filter((r) => !r.pass).forEach((r) => console.error(`  ✗ ${r.name}${r.detail ? `: ${r.detail}` : ''}`));
  process.exit(1);
}
