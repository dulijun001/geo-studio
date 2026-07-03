/**
 * Title-query hard gate smoke test (docs/11 P0-1 / D45 候选).
 *
 * Pure function — no DB, no LLM. Run:
 *   pnpm --filter @geo/geo-core tsx src/_test/title-gate.ts
 *
 * 用例来源:2026-07-03 生产库真实抽检(songshu 最近 12 篇头条标题 vs 目标子问题)。
 * 验证闸门方向:关键词保住(语序可变)= 放行;关键词丢失/被换词 = 拦截。
 */
import { checkTitleQueryMatch, extractQuerySegments } from '../generation/title-gate';
import { evaluateDod } from '../generation/dod-evaluator';

type Result = { name: string; pass: boolean; detail?: string };
const results: Result[] = [];
function ok(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`);
}

// ── 1. 照抄原句必过(prompt 要求的理想形态) ─────────────────────────────
{
  const q = '昆明西山区做隐形矫正的靠谱机构有哪些';
  const r = checkTitleQueryMatch(q, q);
  ok('原句作标题必过', r.ok, `segments=${r.segments.join('/')}`);
}

// ── 2. 原句 + 后缀必过 ──────────────────────────────────────────────────
{
  const r = checkTitleQueryMatch(
    '昆明西山区做种植牙怎么挑医生?一文讲清',
    '昆明西山区做种植牙怎么挑医生'
  );
  ok('原句加后缀必过', r.ok);
}

// ── 3. 生产真实漂移 case:关键词全在但语序重排 → 放行(匹配面保住了) ────
{
  const r = checkTitleQueryMatch(
    '昆明西山区靠谱的隐形矫正机构推荐',
    '昆明西山区做隐形矫正的靠谱机构有哪些'
  );
  ok('关键词齐+语序重排 → 放行', r.ok, `missing=${r.missing.join('/')}`);
}

// ── 4. 生产真实漂移 case:实词覆盖完整的改写 → 放行 ─────────────────────
{
  const r = checkTitleQueryMatch(
    '昆明西山区韩国种植牙术后护理指南(松鼠口腔总院临床科普)',
    '昆明西山区做了韩国种植牙之后该怎么护理'
  );
  ok('护理指南体(实词齐) → 放行', r.ok, `missing=${r.missing.join('/')}`);
}

// ── 5. 丢地域词 → 拦截(区县词是 D44 分级的命根) ───────────────────────
{
  const r = checkTitleQueryMatch(
    '隐形矫正机构怎么选?看这篇就够',
    '昆明西山区做隐形矫正的靠谱机构有哪些'
  );
  ok('丢"昆明西山区" → 拦截', !r.ok && r.missing.includes('昆明西山区'), `missing=${r.missing.join('/')}`);
}

// ── 6. 换核心术语 → 拦截("集采种植牙"被写成"平价种植") ────────────────
{
  const r = checkTitleQueryMatch(
    '昆明西山区平价种植好选择',
    '昆明西山区做集采种植牙的整个流程是啥'
  );
  ok('丢"集采"/"流程" → 拦截', !r.ok, `missing=${r.missing.join('/')}`);
}

// ── 7. 营销体完全脱钩 → 拦截(历史被引前的老标题风格) ───────────────────
{
  const r = checkTitleQueryMatch(
    '种植牙集采后价格降低,缺牙人群福音',
    '昆明西山区民营口腔和公立医院种植牙价格差多少'
  );
  ok('营销体脱钩 → 拦截', !r.ok, `missing=${r.missing.join('/')}`);
}

// ── 8. 分词器:停用词剥离正确 ───────────────────────────────────────────
{
  const segs = extractQuerySegments('昆明西山区做儿童早期矫正可以用医保报销吗?');
  const expect = ['昆明西山区', '儿童早期矫正', '医保报销'];
  const pass = expect.every((e) => segs.includes(e));
  ok('停用词剥离出实词段', pass, `segments=${segs.join('/')}`);
}

// ── 9. evaluateDod 集成:标题闸门失败 → 硬 failed + evidence 可见 ────────
{
  const dod = evaluateDod({
    title: '平价种植好选择',
    body: '任意正文',
    skip_required_slices: true,
    is_long_form: true,
    ctx: { is_medical: true, primary_query: '昆明西山区做集采种植牙的整个流程是啥' },
  });
  ok(
    'DoD 集成:闸门失败即 failed',
    dod.status === 'failed' && (dod.evidence.title_gate_misses?.length ?? 0) > 0,
    `reasons=${dod.evidence.reasons.join(' | ')}`
  );
}

// ── 10. evaluateDod 集成:短文平台(is_long_form=false)不套闸门 ──────────
{
  const dod = evaluateDod({
    title: '这个视频告诉你种植牙真相',
    body: '任意脚本',
    skip_required_slices: true,
    is_long_form: false,
    ctx: { is_medical: true, primary_query: '昆明西山区做集采种植牙的整个流程是啥' },
  });
  const gateFired = dod.evidence.reasons.some((r) => r.includes('标题缺失查询实词'));
  ok('短文平台不套标题闸门', !gateFired, `reasons=${dod.evidence.reasons.join(' | ')}`);
}

// ── 11. primary_query 缺省:闸门静默跳过(向后兼容) ─────────────────────
{
  const dod = evaluateDod({
    title: '随便什么标题',
    body: '任意正文',
    skip_required_slices: true,
    is_long_form: true,
    ctx: { is_medical: true },
  });
  const gateFired = dod.evidence.reasons.some((r) => r.includes('标题缺失查询实词'));
  ok('无 primary_query 不误伤', !gateFired);
}

// ── Summary ─────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) {
  console.error('FAILED:', failed.map((f) => f.name).join(', '));
  process.exit(1);
}
