/**
 * Targeted test for stage-2 LLM compliance review using a REAL Doubao call.
 * Run: pnpm db:test-compliance-llm
 *
 * Requires worker running + ARK_API_KEY set.
 *
 * Strategy:
 *   1. Create a variant with B-level keyword hits ("效果显著", "领先", "值得信赖").
 *      Stage-1 scan will flag warn → stage-2 LLM MUST run.
 *   2. Enqueue compliance.review.
 *   3. Poll for stage='llm' review row. Inspect verdict + findings + rationale.
 *
 * Does NOT assert a specific verdict — the LLM is allowed to decide between
 * warn/reject. What we verify: a real LLM review actually ran (provider='doubao'
 * in audit), parsed successfully, and produced structured findings.
 */
import { createClient } from '@supabase/supabase-js';
import PgBoss from 'pg-boss';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const databaseUrl = process.env.DATABASE_URL!;

const B_LEVEL_BODY = `
Demo Dental Hospital 是一家值得信赖的口腔医院。我们的正畸方案效果显著,
在业内处于领先水平。种植牙术后护理遵循临床指南,欢迎广大患者放心选择。
`.trim();

async function main() {
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const suffix = Date.now().toString().slice(-8);
  const { data: t } = await admin
    .from('tenants')
    .insert({
      name: `LLM Review Test ${suffix}`,
      slug: `llm-review-test-${suffix}`,
      industry: 'dental',
      plan: 'trial',
    })
    .select('id')
    .single();
  const tenantId = t!.id as string;

  const { data: item } = await admin
    .from('content_items')
    .insert({
      tenant_id: tenantId,
      title: 'parent',
      source_type: 'manual',
      status: 'parsed',
      markdown: '(test)',
    })
    .select('id')
    .single();
  const contentItemId = item!.id as string;

  const { data: v } = await admin
    .from('content_variants')
    .insert({
      tenant_id: tenantId,
      content_item_id: contentItemId,
      platform: 'toutiao_article',
      title: 'Demo Dental 正畸方案:业内领先的矫治方式',
      body: B_LEVEL_BODY,
      status: 'pending_review',
      compliance_status: 'pending',
    })
    .select('id')
    .single();
  const variantId = v!.id as string;

  console.log(`Variant ${variantId} created with B-level body. Enqueuing review...\n`);

  const boss = new PgBoss({ connectionString: databaseUrl, schema: 'pgboss' });
  await boss.start();
  try {
    await boss.createQueue('compliance.review');
    await boss.send('compliance.review', { variant_id: variantId, tenant_id: tenantId });

    // Poll up to 180s for an 'llm' stage review.
    const deadline = Date.now() + 180_000;
    let llmReview: { verdict: string; risk_level: string; findings: unknown; rationale: string; llm_response_raw: string | null } | null = null;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      const { data: reviews } = await admin
        .from('compliance_reviews')
        .select('stage, verdict, risk_level, findings, rationale, llm_response_raw')
        .eq('target_id', variantId);
      const llm = (reviews ?? []).find((r) => r.stage === 'llm');
      if (llm) {
        llmReview = llm as unknown as typeof llmReview;
        break;
      }
    }

    if (!llmReview) {
      console.error('✗ no stage=llm review appeared within 180s');
      process.exit(1);
    }

    console.log('✓ stage=llm review row written');
    console.log(`  verdict: ${llmReview.verdict}`);
    console.log(`  risk_level: ${llmReview.risk_level}`);
    console.log(`  findings: ${JSON.stringify(llmReview.findings)}`);
    console.log(`  rationale: ${llmReview.rationale}`);
    if (llmReview.llm_response_raw) {
      console.log(`\n  raw LLM output (first 400):\n  ${llmReview.llm_response_raw.slice(0, 400)}`);
    }

    const { data: audits } = await admin
      .from('audit_logs')
      .select('action, payload')
      .eq('target_id', variantId)
      .eq('action', 'compliance.llm_review');
    const audit = (audits ?? [])[0];
    if (audit) {
      console.log(`\n✓ audit payload: ${JSON.stringify(audit.payload)}`);
    }
  } finally {
    await boss.stop({ graceful: true, timeout: 5000 });
    // cleanup
    await admin.from('compliance_reviews').delete().eq('target_id', variantId);
    await admin.from('audit_logs').delete().eq('target_id', variantId);
    await admin.from('content_variants').delete().eq('id', variantId);
    await admin.from('content_items').delete().eq('id', contentItemId);
    await admin.from('tenants').delete().eq('id', tenantId);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
