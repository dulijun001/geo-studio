/**
 * Smoke test for 档位 C1 — numeric fact-check.
 *
 * Covers the heuristic + no-ground-truth paths (no LLM dependency).
 * The LLM-judge path is exercised only when ARK_API_KEY is set; we don't
 * wire that into this smoke runner because it'd require real network.
 *
 * Run: npx tsx packages/geo-core/src/_test/numeric-fact-check.ts
 */
import { checkNumericFacts } from '../generation/numeric-fact-check';

type Result = { name: string; pass: boolean; detail?: string };
const results: Result[] = [];
function ok(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`);
}

async function main() {
  // ──────────────────────────────────────────────────────────────────
  // 1. Hard-reject heuristics
  // ──────────────────────────────────────────────────────────────────
  console.log('═══ Section 1: 硬拒绝启发式 ═══');

  const r1 = await checkNumericFacts(
    '据《种植学指南》数据,种植牙根治率 95%,可终身保证。',
    [{ title: '种植学指南', aliases: [], key_claims: [] }],
    { allowLlm: false },
  );
  ok(
    '"根治率 95%" 触发硬拒绝',
    r1.verdict === 'reject' &&
      r1.claims.some((c) => c.mode === 'heuristic_reject' && /根治/.test(c.reason)),
    `verdict=${r1.verdict}, claims=${r1.claims.length}`,
  );

  const r2 = await checkNumericFacts(
    '《指南》提到有效率 100%。',
    [{ title: '指南', aliases: [], key_claims: [] }],
    { allowLlm: false },
  );
  ok(
    '"有效率 100%" 触发硬拒绝',
    r2.verdict === 'reject',
    r2.claims.map((c) => `${c.verdict}:${c.reason}`).join(' | '),
  );

  const r3 = await checkNumericFacts(
    '中华口腔医学会指出,该术式终身保证不复发。',
    [{ title: '中华口腔医学会', aliases: [], key_claims: [] }],
    { allowLlm: false },
  );
  ok(
    '"终身保证不复发" 触发硬拒绝(无数字也算)',
    r3.verdict === 'reject',
  );

  // ──────────────────────────────────────────────────────────────────
  // 2. No-ground-truth path
  // ──────────────────────────────────────────────────────────────────
  console.log('\n═══ Section 2: 无 key_claims 时不拦截 ═══');

  const r4 = await checkNumericFacts(
    '据《种植学指南》,5 年存活率为 92%。',
    [{ title: '种植学指南', aliases: [], key_claims: [] }],
    { allowLlm: false },
  );
  ok(
    '无 key_claims → pass + mode=no_ground_truth',
    r4.verdict === 'pass' &&
      r4.claims.length > 0 &&
      r4.claims.every((c) => c.mode === 'no_ground_truth'),
    `verdict=${r4.verdict}, modes=${r4.claims.map((c) => c.mode).join(',')}`,
  );

  // ──────────────────────────────────────────────────────────────────
  // 3. Skip when no citation+number co-occur
  // ──────────────────────────────────────────────────────────────────
  console.log('\n═══ Section 3: 没有引用就不检查 ═══');

  const r5 = await checkNumericFacts(
    '种植牙价格 1.2 万到 2 万。',
    [{ title: '种植学指南', aliases: [], key_claims: [] }],
    { allowLlm: false },
  );
  ok(
    '无引用源 → 0 claims, verdict=pass',
    r5.verdict === 'pass' && r5.claims.length === 0,
    `claims=${r5.claims.length}`,
  );

  // ──────────────────────────────────────────────────────────────────
  // 4. LLM-disabled fallback for citations with key_claims
  // ──────────────────────────────────────────────────────────────────
  console.log('\n═══ Section 4: 有 key_claims 但 LLM 不可用 → suspect ═══');

  const r6 = await checkNumericFacts(
    '据《种植学指南》记载,5 年存活率达 92%。',
    [
      {
        title: '种植学指南',
        aliases: [],
        key_claims: ['种植体 5 年存活率 92-98%(指南 2024 版第三章)'],
      },
    ],
    { allowLlm: false },
  );
  ok(
    '有 key_claims + LLM 关闭 → 保守 suspect',
    r6.verdict === 'suspect' &&
      r6.claims.every((c) => c.mode === 'llm_judged' && c.verdict === 'suspect'),
    `verdict=${r6.verdict}, modes=${r6.claims.map((c) => c.mode).join(',')}`,
  );

  // ──────────────────────────────────────────────────────────────────
  // 5. Citation alias matching
  // ──────────────────────────────────────────────────────────────────
  console.log('\n═══ Section 5: alias 命中 ═══');

  const r7 = await checkNumericFacts(
    '据《指南 2024》报道,有效率 100%。',
    [
      {
        title: '中华口腔医学会种植学指南 2024 版',
        aliases: ['指南 2024', '种植学指南 2024'],
        key_claims: ['存活率 92-98%'],
      },
    ],
    { allowLlm: false },
  );
  ok(
    'alias 命中 + 硬拒绝模式优先于 LLM',
    r7.verdict === 'reject' &&
      r7.claims.some((c) => c.mode === 'heuristic_reject'),
    `verdict=${r7.verdict}`,
  );

  // ──────────────────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) {
    console.error(`✗ ${failed.length} failed`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
