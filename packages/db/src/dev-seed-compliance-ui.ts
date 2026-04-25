/**
 * Dev-only: populate the compliance approval queue with representative variants
 * so the UI has something to render. Safe to run multiple times — uses
 * deterministic titles and upserts.
 *
 * Usage: pnpm --filter @geo/db exec tsx --env-file=../../.env src/dev-seed-compliance-ui.ts <email>
 *
 * Steps:
 *   1. Ensure user exists and is owner of the `demo-dental` tenant.
 *   2. Create one parent content_item.
 *   3. Create 3 variants: A-hit (rejected), B-hit (pending), clean (auto_approved).
 *   4. For each variant, insert a matching compliance_reviews row so the detail
 *      page can render hits.
 */
import { createClient } from '@supabase/supabase-js';
import { scanKeywords, type KeywordRow } from '@geo/geo-core';

const email = process.argv[2];
if (!email) {
  console.error('Usage: tsx src/dev-seed-compliance-ui.ts <email>');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !serviceKey) throw new Error('Missing Supabase env');

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

async function ensureUser(email: string): Promise<string> {
  const { data: list } = await admin.auth.admin.listUsers();
  const found = list.users.find((u) => u.email === email);
  if (found) return found.id;
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (error || !created?.user) throw new Error(`createUser: ${error?.message}`);
  return created.user.id;
}

async function ensureTenant(): Promise<string> {
  const { data: t } = await admin.from('tenants').select('id').eq('slug', 'demo-dental').maybeSingle();
  if (t) return t.id as string;
  const { data: created, error } = await admin
    .from('tenants')
    .insert({ name: 'Demo Dental Hospital', slug: 'demo-dental', industry: 'dental', plan: 'trial' })
    .select('id')
    .single();
  if (error || !created) throw new Error(`create tenant: ${error?.message}`);
  return created.id as string;
}

async function ensureMembership(userId: string, tenantId: string): Promise<void> {
  const { data: existing } = await admin
    .from('tenant_memberships')
    .select('role')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (existing) return;
  const { error } = await admin.from('tenant_memberships').insert({
    user_id: userId,
    tenant_id: tenantId,
    role: 'owner',
  });
  if (error) throw new Error(`insert membership: ${error.message}`);
}

async function ensureContentItem(tenantId: string): Promise<string> {
  const title = 'UI-fixture parent';
  const { data: existing } = await admin
    .from('content_items')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('title', title)
    .maybeSingle();
  if (existing) return existing.id as string;
  const { data: created, error } = await admin
    .from('content_items')
    .insert({ tenant_id: tenantId, title, source_type: 'manual', status: 'parsed', markdown: '(fixture)' })
    .select('id')
    .single();
  if (error || !created) throw new Error(`content_item: ${error?.message}`);
  return created.id as string;
}

type Fixture = {
  marker: string;
  title: string;
  body: string;
  complianceStatus: 'rejected' | 'pending' | 'auto_approved';
  variantStatus: 'rejected' | 'pending_review' | 'auto_approved';
  stage: 'keyword' | 'llm' | 'keyword+llm';
  verdict: 'pass' | 'warn' | 'reject';
  riskLevel: 'low' | 'medium' | 'high';
};

const FIXTURES: Fixture[] = [
  {
    marker: 'UI-FIX-A',
    title: '根治牙周病的新方法 [UI-FIX-A]',
    body: '本疗程 100% 见效,永不复发,立竿见影,全市第一。',
    complianceStatus: 'rejected',
    variantStatus: 'rejected',
    stage: 'keyword',
    verdict: 'reject',
    riskLevel: 'high',
  },
  {
    marker: 'UI-FIX-B',
    title: '临床研究:新型正畸方案 [UI-FIX-B]',
    body: '对照组结果显示该方案效果显著,值得信赖,领先业内水平。',
    complianceStatus: 'pending',
    variantStatus: 'pending_review',
    // Mirrors real worker flow: B-level goes through keyword (warn) THEN llm (warn).
    stage: 'keyword+llm',
    verdict: 'warn',
    riskLevel: 'medium',
  },
  {
    marker: 'UI-FIX-C',
    title: '种植牙术后护理指南 [UI-FIX-C]',
    body: '术后 24 小时内避免刷术区,遵循医生医嘱按时复诊,并按时服用医生开具的消炎药物。',
    complianceStatus: 'auto_approved',
    variantStatus: 'auto_approved',
    stage: 'keyword',
    verdict: 'pass',
    riskLevel: 'low',
  },
];

async function loadKeywords(tenantId: string): Promise<KeywordRow[]> {
  const { data } = await admin
    .from('compliance_keywords')
    .select('id, term, level, category, variants')
    .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    term: r.term as string,
    level: r.level as 'A' | 'B',
    category: r.category as string,
    variants: (r.variants as string[]) ?? [],
  }));
}

async function main() {
  const userId = await ensureUser(email!);
  const tenantId = await ensureTenant();
  await ensureMembership(userId, tenantId);
  const contentItemId = await ensureContentItem(tenantId);
  const keywords = await loadKeywords(tenantId);

  for (const fx of FIXTURES) {
    // idempotent: delete any prior fixture variants by marker
    const { data: prior } = await admin
      .from('content_variants')
      .select('id')
      .eq('tenant_id', tenantId)
      .like('title', `%${fx.marker}%`);
    const priorIds = (prior ?? []).map((r) => r.id as string);
    if (priorIds.length > 0) {
      await admin.from('compliance_reviews').delete().in('target_id', priorIds);
      await admin.from('audit_logs').delete().in('target_id', priorIds);
      await admin.from('content_variants').delete().in('id', priorIds);
    }

    const { data: v, error: vErr } = await admin
      .from('content_variants')
      .insert({
        tenant_id: tenantId,
        content_item_id: contentItemId,
        platform: 'toutiao_article',
        title: fx.title,
        body: fx.body,
        status: fx.variantStatus,
        compliance_status: fx.complianceStatus,
      })
      .select('id')
      .single();
    if (vErr || !v) throw new Error(`insert variant: ${vErr?.message}`);
    const variantId = v.id as string;

    const scan = scanKeywords(`${fx.title}\n\n${fx.body}`, keywords);

    const stagesToInsert: Array<{ stage: 'keyword' | 'llm'; rationale: string; findings: unknown[] }> =
      fx.stage === 'keyword+llm'
        ? [
            {
              stage: 'keyword',
              rationale: `Matched ${scan.hits.length} term(s); max level ${scan.max_level}.`,
              findings: scan.hits,
            },
            {
              stage: 'llm',
              rationale: 'LLM stub verdict: warn (routed to manual review).',
              findings: [],
            },
          ]
        : [
            {
              stage: fx.stage,
              rationale:
                fx.stage === 'keyword'
                  ? `Matched ${scan.hits.length} term(s); max level ${scan.max_level}.`
                  : 'LLM stub verdict: warn (routed to manual review).',
              findings: scan.hits,
            },
          ];

    let lastReviewId: string | undefined;
    for (const s of stagesToInsert) {
      const { data: review, error: rErr } = await admin
        .from('compliance_reviews')
        .insert({
          tenant_id: tenantId,
          target_type: 'content_variant',
          target_id: variantId,
          stage: s.stage,
          verdict: fx.verdict,
          risk_level: fx.riskLevel,
          findings: s.findings,
          rationale: s.rationale,
        })
        .select('id')
        .single();
      if (rErr || !review) throw new Error(`insert review: ${rErr?.message}`);
      lastReviewId = review.id as string;
    }

    await admin
      .from('content_variants')
      .update({ compliance_review_id: lastReviewId })
      .eq('id', variantId);

    console.log(`✓ ${fx.marker} variant=${variantId} status=${fx.complianceStatus} hits=${scan.hits.length}`);
  }

  // Print magic link for the user
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: email as string,
    options: { redirectTo: `${appUrl}/auth/callback?next=/t/demo-dental/compliance` },
  });
  if (linkErr || !link?.properties?.action_link) throw new Error(`link: ${linkErr?.message}`);
  console.log('');
  console.log('Login link:');
  console.log(link.properties.action_link);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
