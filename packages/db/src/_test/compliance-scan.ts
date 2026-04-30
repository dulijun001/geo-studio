/**
 * Compliance stage-1 keyword scanner smoke test.
 * Run: pnpm db:test-compliance-scan
 *
 * Requires: seed has been run so `compliance_keywords` (global rows) are populated.
 *
 * Validates the scanner against medical-ad-style texts, covering:
 *   - A-level direct hit ("根治")
 *   - A-level variant hit ("100%" -> 百分百)
 *   - A-level whitespace obfuscation ("保 证")
 *   - A-level fullwidth-digit hit ("１００%")
 *   - B-level warn path ("效果显著")
 *   - Clean scientific body (should pass)
 *   - Mixed A+B (A wins)
 */
import { createClient } from '@supabase/supabase-js';
import { scanKeywords, type KeywordRow } from '@geo/geo-core';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');

type Case = {
  name: string;
  text: string;
  expect: {
    max_level: 'none' | 'A' | 'B';
    verdict: 'pass' | 'warn' | 'reject';
    /** If given, at least one hit matched_span must contain one of these. */
    must_hit?: string[];
  };
};

const CASES: Case[] = [
  {
    name: 'direct A-level "根治"',
    text: '我们的新技术可以根治牙周病,欢迎到诊咨询。',
    expect: { max_level: 'A', verdict: 'reject', must_hit: ['根治'] },
  },
  {
    name: 'A-level variant "100%"',
    text: '本诊所种植牙100%成功,术后永不复发。',
    expect: { max_level: 'A', verdict: 'reject', must_hit: ['100%', '永不复发'] },
  },
  {
    name: 'A-level whitespace obfuscation "保 证"',
    text: '我们向每一位患者保 证疗效,放心选择。',
    expect: { max_level: 'A', verdict: 'reject', must_hit: ['保'] },
  },
  {
    name: 'A-level fullwidth digits "１００%"',
    text: '成功率达１００%,业内领先。',
    expect: { max_level: 'A', verdict: 'reject' },
  },
  {
    name: 'B-level "效果显著"',
    text: '某项临床研究显示该方案效果显著,值得信赖。',
    expect: { max_level: 'B', verdict: 'warn', must_hit: ['效果显著'] },
  },
  {
    name: 'clean scientific copy',
    text: '种植牙术后 24 小时内避免刷术区,遵循医生医嘱按时复诊。',
    expect: { max_level: 'none', verdict: 'pass' },
  },
  {
    name: 'mixed A+B (A wins)',
    text: '领先工艺,根治牙周病,立竿见影。',
    expect: { max_level: 'A', verdict: 'reject' },
  },
  {
    name: 'case-insensitive "NO.1"',
    text: '我们是行业 no.1 服务商。',
    expect: { max_level: 'A', verdict: 'reject', must_hit: ['no.1'] },
  },
];

async function main() {
  const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });

  console.log('Loading compliance keywords from DB...');
  const { data: kwRows, error } = await admin
    .from('compliance_keywords')
    .select('id, term, level, category, variants')
    .is('tenant_id', null);
  if (error || !kwRows) throw new Error(`load keywords: ${error?.message}`);

  const keywords: KeywordRow[] = kwRows.map((r) => ({
    id: r.id as string,
    term: r.term as string,
    level: r.level as 'A' | 'B',
    category: r.category as string,
    variants: (r.variants as string[]) ?? [],
  }));
  console.log(`  loaded ${keywords.length} keywords (${keywords.filter((k) => k.level === 'A').length} A, ${keywords.filter((k) => k.level === 'B').length} B)\n`);

  let pass = 0;
  for (const c of CASES) {
    const result = scanKeywords(c.text, keywords);
    const levelOk = result.max_level === c.expect.max_level;
    const verdictOk = result.verdict === c.expect.verdict;
    const hitsOk =
      !c.expect.must_hit ||
      c.expect.must_hit.every((needle) =>
        result.hits.some(
          (h) =>
            h.matched_span.toLowerCase().includes(needle.toLowerCase()) ||
            h.term.includes(needle) ||
            h.context_snippet.toLowerCase().includes(needle.toLowerCase()),
        ),
      );
    const ok = levelOk && verdictOk && hitsOk;
    if (ok) pass++;

    const marker = ok ? '✓' : '✗';
    console.log(`${marker} ${c.name}`);
    console.log(`    text: ${c.text}`);
    console.log(
      `    got: level=${result.max_level} verdict=${result.verdict} hits=${result.hits.length} (${result.duration_ms}ms)`,
    );
    if (!ok) {
      console.log(
        `    expected: level=${c.expect.max_level} verdict=${c.expect.verdict}${
          c.expect.must_hit ? ` must_hit=${c.expect.must_hit.join(',')}` : ''
        }`,
      );
    }
    if (result.hits.length > 0) {
      for (const h of result.hits.slice(0, 3)) {
        console.log(`      - [${h.level}] ${h.term} @${h.offset} (${h.category}) ${h.context_snippet}`);
      }
    }
    console.log('');
  }

  console.log(`${pass}/${CASES.length} cases passed`);
  process.exit(pass === CASES.length ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
