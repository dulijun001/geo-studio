/**
 * D34 — live-data verifier.
 *
 * Pulls the real songshu tenant verified_citations whitelist + runs new
 * checkCitations against the EXACT body that the user pasted in chat
 * (containing "中华口腔医学会 2023 年发布的《牙种植体临床应用指南》" +
 * "人民卫生出版社 2020 年出版的《口腔种植学》（第 3 版）第 127 页"). Should
 * report at least one issuer_mismatch + one year_mismatch + one
 * page_fabricated.
 *
 * Run: pnpm exec tsx src/_test/citation-check-d34-livedata.ts
 */
import { readFile } from 'node:fs/promises';
import { checkCitations, type VerifiedCitation } from '../generation/citation-check';

const WHITELIST_PATH = process.env.WHITELIST_JSON_PATH ?? '/tmp/songshu-whitelist.json';

// The body the user pasted as "诊断报告改版" in 2026-05-25 13:00 chat.
// Includes:
//   - "中华口腔医学会 2023 年发布的《牙种植体临床应用指南》"
//     (whitelist: issuer=国家卫生健康委 / year=2022) — issuer_mismatch + year_mismatch
//   - "人民卫生出版社 2020 年出版的《口腔种植学》（第 3 版）第 127 页"
//     (whitelist: issuer=人民卫生出版社 / year=2020 — both OK)
//     — only page_fabricated should fire on "第 127 页"
const USER_PASTED_BODY = `
核心结论：60 岁以上人群只要全身健康状况和牙槽骨条件允许，完全可以做种植牙。

很多人误以为年纪大了就不能种牙。根据中华口腔医学会 2023 年发布的《牙种植体临床应用指南》，
年龄本身不是种植牙的绝对禁忌证。

根据人民卫生出版社 2020 年出版的《口腔种植学》（第 3 版）第 127 页记载：钛合金具有极佳的
生物相容性，能与牙槽骨形成牢固的骨结合。
`;

type RawRow = {
  id: string;
  title: string;
  title_aliases: string[] | null;
  issuer: string | null;
  publication_year: number | null;
};

async function main() {
  const raw = await readFile(WHITELIST_PATH, 'utf-8');
  const rows = JSON.parse(raw) as RawRow[];
  const whitelist: VerifiedCitation[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    aliases: r.title_aliases ?? [],
    issuer: r.issuer,
    publication_year: r.publication_year,
  }));
  console.log(`Loaded ${whitelist.length} active verified citations.`);

  const result = checkCitations(USER_PASTED_BODY, whitelist);
  console.log('\nVerdict:', result.verdict);
  console.log('Matches:', JSON.stringify(result.matches.map((m) => m.needle), null, 2));
  console.log('Unmatched:', JSON.stringify(result.unmatched.map((u) => u.needle), null, 2));
  console.log('\nDetail issues:');
  for (const issue of result.detail_issues ?? []) {
    console.log(
      `  ✗ ${issue.issue.padEnd(20)} | needle="${issue.needle}" | expected="${issue.expected}" actual="${issue.actual}"`,
    );
  }

  // Assertions
  const hasIssuerMismatch = result.detail_issues?.some(
    (d) => d.issue === 'issuer_mismatch' && d.actual === '中华口腔医学会',
  );
  const hasYearMismatch = result.detail_issues?.some(
    (d) => d.issue === 'year_mismatch' && d.actual === '2023 年',
  );
  const hasPageFabricated = result.detail_issues?.some(
    (d) => d.issue === 'page_fabricated' && d.actual === '第 127 页',
  );
  const allOk = hasIssuerMismatch && hasYearMismatch && hasPageFabricated;
  console.log(
    `\n${allOk ? '✓ ALL P0-1 issues detected' : '✗ MISSING issues'}: issuer=${hasIssuerMismatch}, year=${hasYearMismatch}, page=${hasPageFabricated}`,
  );
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
