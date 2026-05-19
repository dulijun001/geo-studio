/**
 * V1.10 docs/09 §2.1 — classify-readiness pure function tests.
 *
 * Run:
 *   pnpm --filter @geo/geo-core tsx src/_test/classify-readiness.ts
 *
 * Covers all 4 readiness classes + priority precedence + count aggregator.
 */
import { classifyVariant, countByClass, type VariantReadinessInput } from '../daily-ops';

type Result = { name: string; pass: boolean; detail?: string };
const results: Result[] = [];
function ok(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`);
}

const base: VariantReadinessInput = {
  dod_status: 'passed',
  compliance_status: 'auto_approved',
  auto_rewrite_count: 0,
  numeric_check: { verdict: 'pass' },
};

// ── 1. Green happy path
ok('green: full pass', classifyVariant(base) === 'green');

// ── 2. Green with legacy_passed dod (V1.5-1.6 grandfather)
ok(
  'green: legacy_passed dod',
  classifyVariant({ ...base, dod_status: 'legacy_passed' }) === 'green',
);

// ── 3. Green with manual_pass dod (admin override)
ok(
  'green: manual_pass dod',
  classifyVariant({ ...base, dod_status: 'manual_pass' }) === 'green',
);

// ── 4. Black: DoD failed (highest priority, beats everything else)
ok(
  'black: dod_failed beats compliance_rejected',
  classifyVariant({
    ...base,
    dod_status: 'failed',
    compliance_status: 'rejected',
  }) === 'black',
);

// ── 5. Red: compliance rejected (when DoD ok)
ok(
  'red: compliance rejected',
  classifyVariant({ ...base, compliance_status: 'rejected' }) === 'red',
);

// ── 6. Yellow: auto_rewrite_count >= 1
ok(
  'yellow: auto_rewrite_count=1',
  classifyVariant({ ...base, auto_rewrite_count: 1 }) === 'yellow',
);

// ── 7. Yellow: numeric warn
ok(
  'yellow: numeric warn',
  classifyVariant({ ...base, numeric_check: { verdict: 'warn' } }) === 'yellow',
);

// ── 8. Yellow: numeric reject (soft anomaly, not red — red is reserved for compliance)
ok(
  'yellow: numeric reject',
  classifyVariant({ ...base, numeric_check: { verdict: 'reject' } }) === 'yellow',
);

// ── 9. Yellow fallback: unknown dod + pending compliance
ok(
  'yellow fallback: unknown+pending',
  classifyVariant({
    ...base,
    dod_status: 'unknown',
    compliance_status: 'pending',
  }) === 'yellow',
);

// ── 10. Yellow: dod passed but compliance still pending (not auto_approved yet)
ok(
  'yellow: dod passed but compliance pending',
  classifyVariant({ ...base, compliance_status: 'pending' }) === 'yellow',
);

// ── 11. Black wins over yellow softness
ok(
  'black: dod failed even if auto_rewrite=0',
  classifyVariant({ ...base, dod_status: 'failed' }) === 'black',
);

// ── 12. countByClass aggregator
const variants: VariantReadinessInput[] = [
  base, // green
  { ...base, auto_rewrite_count: 2 }, // yellow
  { ...base, compliance_status: 'rejected' }, // red
  { ...base, dod_status: 'failed' }, // black
  { ...base, numeric_check: { verdict: 'warn' } }, // yellow
];
const counts = countByClass(variants);
ok(
  'countByClass: 1 green / 2 yellow / 1 red / 1 black',
  counts.green === 1 && counts.yellow === 2 && counts.red === 1 && counts.black === 1,
  JSON.stringify(counts),
);

// ── 13. null numeric_check
ok(
  'green: null numeric_check (no warning)',
  classifyVariant({ ...base, numeric_check: null }) === 'green',
);

// ── Summary
const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
