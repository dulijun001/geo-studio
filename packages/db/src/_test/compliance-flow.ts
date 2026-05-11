/**
 * End-to-end compliance review smoke test.
 * Run: pnpm db:test-compliance-flow
 *
 * Requires worker running (pnpm --filter @geo/worker dev).
 *
 * Validates:
 *   1. Variant with A-level hit → status=rejected, compliance_status=rejected, kw review inserted, audit entry
 *   2. Variant with B-level hit → status=pending_review, compliance_status=pending, kw + llm reviews inserted
 *   3. Clean variant → status=auto_approved, compliance_status=auto_approved
 *   4. audit_logs has one row per transition
 */
import { createClient } from '@supabase/supabase-js';
import PgBoss from 'pg-boss';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL;
if (!url || !serviceKey || !databaseUrl) throw new Error('Missing env');

type Result = { name: string; pass: boolean; detail?: string };
const results: Result[] = [];
function record(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`);
}

type Fixture = {
  label: string;
  title: string;
  body: string;
  expect: {
    compliance_status: 'rejected' | 'pending' | 'auto_approved';
    variant_status: 'rejected' | 'pending_review' | 'auto_approved';
    /** Stages we expect to find in compliance_reviews for this variant. */
    stages: Array<'keyword' | 'llm'>;
    /** If set, also assert content_variants.case_match matched ≥ 1 case. */
    case_match?: boolean;
  };
};

// Seeded fake compliance case for the case-match fixture below. Patterns are
// non-keyword to avoid getting blocked by the keyword scan first — the goal
// is to exercise the third gate independently. jurisdiction='_TEST_' tags it
// so accidental survivors in compliance_cases are easy to find and clean.
const TEST_CASE_SEED = {
  title: '[TEST] case-match smoke seed',
  violation_patterns: ['三个月内自然变白', '院长每周亲诊一次', '德国进口微创无痛'],
  violation_category: 'guarantee',
  jurisdiction: '_TEST_',
  fine_yuan: 99999,
  active: true,
};

const FIXTURES: Fixture[] = [
  {
    label: 'A-level hit',
    title: '根治牙周病的新方法',
    body: '本疗程100%见效,永不复发。',
    expect: {
      compliance_status: 'rejected',
      variant_status: 'rejected',
      stages: ['keyword'],
    },
  },
  {
    label: 'B-level hit',
    title: '临床研究:新型正畸方案',
    body: '对照组结果显示该方案效果显著,值得信赖。',
    expect: {
      compliance_status: 'pending',
      variant_status: 'pending_review',
      stages: ['keyword', 'llm'],
    },
  },
  {
    label: 'clean scientific',
    title: '种植牙术后护理指南',
    body: '术后 24 小时内避免刷术区,遵循医生医嘱按时复诊,并按时服用医生开具的消炎药物。',
    expect: {
      compliance_status: 'auto_approved',
      variant_status: 'auto_approved',
      stages: ['keyword'],
    },
  },
  {
    // Third-gate validation: hits seeded case patterns but no A/B keyword,
    // so flow exits as auto_approved while content_variants.case_match
    // captures the hit + audit_logs records compliance.case_match.
    // Current behavior (V1.9.1): case-match is informational, doesn't flip
    // status — recovering "match → force human" is a separate ticket.
    label: 'case-match hit',
    title: '美白服务介绍',
    body: '我们诊所提供美白服务。临床数据显示三个月内自然变白的概率较高。另外院长每周亲诊一次,确保每位顾客方案都经过评估。术后请按医嘱定期复查。',
    expect: {
      compliance_status: 'auto_approved',
      variant_status: 'auto_approved',
      stages: ['keyword'],
      case_match: true,
    },
  },
];

async function main() {
  const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });

  // Set up a throwaway tenant
  const suffix = Date.now().toString().slice(-8);
  const { data: t, error: tErr } = await admin
    .from('tenants')
    .insert({
      name: `Compliance Test ${suffix}`,
      slug: `compliance-test-${suffix}`,
      industry: 'dental',
      plan: 'trial',
    })
    .select('id')
    .single();
  if (tErr || !t) throw new Error(`tenant: ${tErr?.message}`);
  const tenantId = t.id as string;

  // Create one content_item to parent the variants
  const { data: item, error: iErr } = await admin
    .from('content_items')
    .insert({
      tenant_id: tenantId,
      title: 'parent item',
      source_type: 'manual',
      status: 'parsed',
      markdown: '(test)',
    })
    .select('id')
    .single();
  if (iErr || !item) throw new Error(`content_item: ${iErr?.message}`);
  const contentItemId = item.id as string;

  // Seed the third-gate fixture's match target. jurisdiction='_TEST_' makes
  // accidental survivors trivially findable: SELECT FROM compliance_cases
  // WHERE jurisdiction='_TEST_'.
  const { data: seededCase, error: cErr } = await admin
    .from('compliance_cases')
    .insert(TEST_CASE_SEED)
    .select('id, title')
    .single();
  if (cErr || !seededCase) throw new Error(`compliance_case seed: ${cErr?.message}`);
  const seededCaseId = seededCase.id as string;
  const seededCaseTitle = seededCase.title as string;

  const variantIds: Record<string, string> = {};
  const boss = new PgBoss({ connectionString: databaseUrl!, schema: 'pgboss' });
  await boss.start();
  try {
    await boss.createQueue('compliance.review');

    for (const fx of FIXTURES) {
      const { data: v, error: vErr } = await admin
        .from('content_variants')
        .insert({
          tenant_id: tenantId,
          content_item_id: contentItemId,
          platform: 'toutiao_article',
          title: fx.title,
          body: fx.body,
          status: 'draft',
          compliance_status: 'pending',
        })
        .select('id')
        .single();
      if (vErr || !v) throw new Error(`variant ${fx.label}: ${vErr?.message}`);
      variantIds[fx.label] = v.id as string;
      await boss.send('compliance.review', {
        variant_id: v.id,
        tenant_id: tenantId,
      });
    }

    console.log(`Enqueued ${FIXTURES.length} review jobs; polling up to 45s...\n`);

    // Poll until all variants have non-pending compliance_status (or timeout)
    const deadline = Date.now() + 45_000;
    const finalized: Record<string, { compliance: string; status: string } | undefined> = {};
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      const { data: rows } = await admin
        .from('content_variants')
        .select('id, compliance_status, status')
        .in('id', Object.values(variantIds));
      let allDone = true;
      for (const fx of FIXTURES) {
        const vid = variantIds[fx.label];
        const row = rows?.find((r) => r.id === vid);
        if (!row) continue;
        finalized[fx.label] = { compliance: row.compliance_status, status: row.status };
        // Expected terminal states
        const terminalSet = new Set([fx.expect.compliance_status]);
        if (!terminalSet.has(row.compliance_status)) allDone = false;
      }
      if (allDone && Object.keys(finalized).length === FIXTURES.length) break;
    }

    // Verify per-fixture
    for (const fx of FIXTURES) {
      const vid = variantIds[fx.label];
      const final = finalized[fx.label];
      record(
        `${fx.label}: compliance_status=${fx.expect.compliance_status}`,
        final?.compliance === fx.expect.compliance_status,
        `got ${final?.compliance}`,
      );
      record(
        `${fx.label}: variant.status=${fx.expect.variant_status}`,
        final?.status === fx.expect.variant_status,
        `got ${final?.status}`,
      );

      const { data: reviews } = await admin
        .from('compliance_reviews')
        .select('stage, verdict, risk_level')
        .eq('target_id', vid)
        .order('created_at', { ascending: true });
      const stages = reviews?.map((r) => r.stage as string) ?? [];
      const stagesOk =
        stages.length === fx.expect.stages.length &&
        fx.expect.stages.every((s, i) => stages[i] === s);
      record(
        `${fx.label}: review stages=[${fx.expect.stages.join(',')}]`,
        stagesOk,
        `got [${stages.join(',')}]`,
      );

      const { data: audits } = await admin
        .from('audit_logs')
        .select('action')
        .eq('target_id', vid)
        .order('created_at', { ascending: true });
      const actions = audits?.map((a) => a.action as string) ?? [];
      record(
        `${fx.label}: audit trail non-empty`,
        actions.length > 0,
        `actions=[${actions.join(',')}]`,
      );

      // Third-gate-specific assertions: the case_match column captured the hit,
      // the top match is our seeded case, and audit_logs picked up the
      // compliance.case_match action (3-year retention requirement).
      if (fx.expect.case_match) {
        const { data: variantRow } = await admin
          .from('content_variants')
          .select('case_match')
          .eq('id', vid)
          .single();
        const cm = variantRow?.case_match as {
          matches?: Array<{ title?: string; similarity?: number }>;
          cases_evaluated?: number;
        } | null;
        const matchCount = cm?.matches?.length ?? 0;
        record(
          `${fx.label}: content_variants.case_match has ≥ 1 hit`,
          matchCount >= 1,
          `matches=${matchCount} evaluated=${cm?.cases_evaluated ?? '?'}`,
        );
        const topMatch = cm?.matches?.[0];
        record(
          `${fx.label}: top match is the seeded case`,
          topMatch?.title === seededCaseTitle,
          `top=${topMatch?.title ?? 'null'} expected=${seededCaseTitle}`,
        );
        const caseMatchAudits = actions.filter((a) => a === 'compliance.case_match');
        record(
          `${fx.label}: audit_logs include compliance.case_match`,
          caseMatchAudits.length >= 1,
          `count=${caseMatchAudits.length}`,
        );
      }
    }
  } finally {
    await boss.stop({ graceful: true, timeout: 5000 });
    // Cleanup — order matters due to FKs (but FKs are logical here)
    for (const vid of Object.values(variantIds)) {
      await admin.from('compliance_reviews').delete().eq('target_id', vid);
      await admin.from('audit_logs').delete().eq('target_id', vid);
      await admin.from('content_variants').delete().eq('id', vid);
    }
    await admin.from('content_items').delete().eq('id', contentItemId);
    await admin.from('tenants').delete().eq('id', tenantId);
    await admin.from('compliance_cases').delete().eq('id', seededCaseId);
  }

  console.log('');
  const pass = results.filter((r) => r.pass).length;
  console.log(`${pass}/${results.length} checks passed`);
  process.exit(pass === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
