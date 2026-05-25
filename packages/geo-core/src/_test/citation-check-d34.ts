/**
 * D34 — citation_check 扩展校验单测
 *
 * 覆盖三种新校验:issuer_mismatch / year_mismatch / page_fabricated
 * + 不误伤的边界 case(LLM 写对了不报、缺 attribution 不报、whitelist 缺字段不报)。
 *
 * Run: npx tsx packages/geo-core/src/_test/citation-check-d34.ts
 */
import { checkCitations, type VerifiedCitation } from '../generation/citation-check';

type Result = { name: string; pass: boolean; detail?: string };
const results: Result[] = [];
function ok(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`);
}

const TRUTH: VerifiedCitation[] = [
  {
    id: 'wl-implant-guideline',
    title: '《牙种植体临床应用指南》',
    aliases: [],
    issuer: '国家卫生健康委',
    publication_year: 2022,
  },
  {
    id: 'wl-implantology-textbook',
    title: '《口腔种植学》（第 3 版）',
    aliases: ['《口腔种植学》'],
    issuer: '人民卫生出版社',
    publication_year: 2020,
  },
  {
    id: 'wl-implant-clinical-2025',
    title: '《中国口腔种植临床指南（第 4 版）》',
    aliases: [],
    issuer: '中华口腔医学会',
    publication_year: 2025,
  },
];

// ────────────────────────────────────────────────────────────────────
// 1. issuer_mismatch — LLM 写"中华口腔医学会" 但 ground truth 是"国家卫健委"
// ────────────────────────────────────────────────────────────────────
const r1 = checkCitations(
  '根据中华口腔医学会 2023 年发布的《牙种植体临床应用指南》,种植牙是缺牙修复的有效方式。',
  TRUTH,
);
ok(
  '错配 issuer 被抓 (中华口腔医学会 vs 国家卫健委)',
  r1.verdict === 'suspected_hallucination' &&
    !!r1.detail_issues?.some(
      (d) => d.issue === 'issuer_mismatch' && d.actual === '中华口腔医学会',
    ),
  `verdict=${r1.verdict}, issues=${r1.detail_issues?.length ?? 0}`,
);

// ────────────────────────────────────────────────────────────────────
// 2. year_mismatch — LLM 写 "2023 年" 但 ground truth 是 2022
// ────────────────────────────────────────────────────────────────────
ok(
  '错配 year 被抓 (2023 vs 2022)',
  !!r1.detail_issues?.some(
    (d) => d.issue === 'year_mismatch' && d.actual === '2023 年' && d.expected === '2022',
  ),
  `r1.year_issues=${r1.detail_issues?.filter((d) => d.issue === 'year_mismatch').length ?? 0}`,
);

// ────────────────────────────────────────────────────────────────────
// 3. page_fabricated — LLM 编 "第 127 页"
// ────────────────────────────────────────────────────────────────────
const r3 = checkCitations(
  '人民卫生出版社 2020 年出版的《口腔种植学》（第 3 版）第 127 页指出,钛合金具有良好的生物相容性。',
  TRUTH,
);
ok(
  '页码编造被抓 (第 127 页)',
  r3.verdict === 'suspected_hallucination' &&
    !!r3.detail_issues?.some((d) => d.issue === 'page_fabricated' && d.actual === '第 127 页'),
  `verdict=${r3.verdict}, page_issues=${r3.detail_issues?.filter((d) => d.issue === 'page_fabricated').length ?? 0}`,
);

// 同篇里 issuer/year 都对的 → 只该报 page,不该误报 issuer/year
ok(
  '页码编造时, issuer/year 正确不误报',
  !r3.detail_issues?.some((d) => d.issue === 'issuer_mismatch') &&
    !r3.detail_issues?.some((d) => d.issue === 'year_mismatch'),
  `r3.detail=${JSON.stringify(r3.detail_issues?.map((d) => d.issue) ?? [])}`,
);

// ────────────────────────────────────────────────────────────────────
// 4. clean case — issuer + year 都对 → verdict='ok',无 detail_issues
// ────────────────────────────────────────────────────────────────────
const r4 = checkCitations(
  '根据中华口腔医学会 2025 年发布的《中国口腔种植临床指南（第 4 版）》,年龄不是种植牙的禁忌。',
  TRUTH,
);
ok(
  '正确 attribution 不报 (中华口腔医学会 2025 ✓)',
  r4.verdict === 'ok' && (r4.detail_issues?.length ?? 0) === 0,
  `verdict=${r4.verdict}, issues=${r4.detail_issues?.length ?? 0}`,
);

// ────────────────────────────────────────────────────────────────────
// 5. LLM 没写 attribution — 不该误报
// ────────────────────────────────────────────────────────────────────
const r5 = checkCitations(
  '《口腔种植学》（第 3 版）指出,钛合金生物相容性优异。',
  TRUTH,
);
ok(
  '缺 attribution 不误报',
  r5.verdict === 'ok' && (r5.detail_issues?.length ?? 0) === 0,
  `verdict=${r5.verdict}`,
);

// ────────────────────────────────────────────────────────────────────
// 6. 白名单条目缺 issuer/year 字段 — 不该 crash 也不该误报
// ────────────────────────────────────────────────────────────────────
const r6 = checkCitations(
  '《口腔种植学》指出种植牙修复方式。',
  [{ id: 'wl-bare', title: '《口腔种植学》', aliases: [] }],
);
ok(
  '白名单字段缺失不 crash + 不误报',
  r6.verdict === 'ok',
  `verdict=${r6.verdict}`,
);

// ────────────────────────────────────────────────────────────────────
// 7. issuer 别名 — "人卫出版社" 应当 canonical 到 "人民卫生出版社" ≈ 不误报
// ────────────────────────────────────────────────────────────────────
const r7 = checkCitations(
  '人卫出版社 2020 年的《口腔种植学》（第 3 版）介绍。',
  TRUTH,
);
ok(
  '出版社别名 canonical 匹配 (人卫出版社 = 人民卫生出版社)',
  r7.verdict === 'ok' && (r7.detail_issues?.length ?? 0) === 0,
  `verdict=${r7.verdict}, issues=${JSON.stringify(r7.detail_issues ?? [])}`,
);

// ────────────────────────────────────────────────────────────────────
// 8. 多 citation 同篇 — 一条对一条错,只该报错的那条
// ────────────────────────────────────────────────────────────────────
const r8 = checkCitations(
  `根据中华口腔医学会 2025 年发布的《中国口腔种植临床指南（第 4 版）》,年龄不是禁忌。
人民卫生出版社 2018 年的《口腔种植学》（第 3 版）指出种植牙原理。`,
  TRUTH,
);
ok(
  '多 citation: 第 1 条对 / 第 2 条年错 — 只报第 2 条',
  r8.verdict === 'suspected_hallucination' &&
    r8.detail_issues?.length === 1 &&
    r8.detail_issues[0]?.issue === 'year_mismatch' &&
    r8.detail_issues[0]?.actual === '2018 年',
  `verdict=${r8.verdict}, issues=${JSON.stringify(r8.detail_issues?.map((d) => d.issue) ?? [])}`,
);

// ────────────────────────────────────────────────────────────────────
// 9. unmatched 标题(完全编造) 与 detail_issue 同时存在的复合 case
// ────────────────────────────────────────────────────────────────────
const r9 = checkCitations(
  `根据《完全编造的 2024 口腔白皮书》,种植牙是有效手段。
另据中华口腔医学会 2023 年发布的《牙种植体临床应用指南》,...`,
  TRUTH,
);
ok(
  'unmatched + detail_issue 复合: 都报',
  r9.verdict === 'suspected_hallucination' &&
    r9.unmatched.length === 1 &&
    (r9.detail_issues?.length ?? 0) >= 1,
  `unmatched=${r9.unmatched.length}, detail=${r9.detail_issues?.length ?? 0}`,
);

// ────────────────────────────────────────────────────────────────────
const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
