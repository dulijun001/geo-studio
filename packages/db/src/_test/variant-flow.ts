/**
 * Variant generation end-to-end smoke test.
 * Run: pnpm db:test-variant-flow
 *
 * Requires the worker running (pnpm --filter @geo/worker dev).
 * Works without ARK_API_KEY — the stub path still exercises insert + compliance queue.
 *
 * Validates:
 *   1. enqueue variant_generate → worker inserts N variants
 *   2. Each variant has compliance_status → eventually non-pending (review fired)
 *   3. content_items.status flips to 'variant_generated'
 *   4. audit_logs include content.variant_generated per variant
 */
import { createClient } from '@supabase/supabase-js';
import PgBoss from 'pg-boss';
import { setupTestGuard } from './_runner';

// 90s — variant gen + compliance review chain is slower than other tests.
setupTestGuard({ timeoutMs: 90_000 });

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

// Single platform + long timeout for real-Doubao mode. Multi-platform + stub
// finishes in 10s, but a real generation run is 100-140s per platform.
const PLATFORMS = ['toutiao_article'] as const;
const POLL_BUDGET_MS = 400_000;

async function main() {
  const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });

  const suffix = Date.now().toString().slice(-8);
  const { data: t, error: tErr } = await admin
    .from('tenants')
    .insert({
      name: `Variant Test ${suffix}`,
      slug: `variant-test-${suffix}`,
      industry: 'dental',
      plan: 'trial',
    })
    .select('id')
    .single();
  if (tErr || !t) throw new Error(`tenant: ${tErr?.message}`);
  const tenantId = t.id as string;

  const markdown = `
种植牙是目前缺牙修复的主流选择之一。其核心工艺是将钛合金人工牙根植入牙槽骨,
骨结合稳定后再安装牙冠。针对糖尿病、骨量不足、抽烟等风险因素,术前需做全面评估。
术后护理的关键是控制菌斑,使用冲牙器 + 软毛牙刷清洁植体周围软组织。
国内外指南一致建议,每半年复查一次影像学检查并做专业洁治。
`.trim();

  const { data: item, error: iErr } = await admin
    .from('content_items')
    .insert({
      tenant_id: tenantId,
      title: 'Variant test — 种植牙科普',
      source_type: 'manual',
      status: 'parsed',
      markdown,
      topics: ['种植牙', '术后护理'],
    })
    .select('id')
    .single();
  if (iErr || !item) throw new Error(`content_item: ${iErr?.message}`);
  const contentItemId = item.id as string;

  const boss = new PgBoss({ connectionString: databaseUrl!, schema: 'pgboss' });
  await boss.start();
  try {
    await boss.createQueue('content.variant_generate');
    await boss.send('content.variant_generate', {
      content_item_id: contentItemId,
      tenant_id: tenantId,
      platforms: PLATFORMS,
    });
    console.log(
      `Enqueued variant generation for ${PLATFORMS.length} platform(s); polling ${POLL_BUDGET_MS / 1000}s...\n`,
    );

    const deadline = Date.now() + POLL_BUDGET_MS;
    let variants: Array<{ id: string; platform: string; compliance_status: string; title: string }> = [];
    let itemStatus = '';
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      const { data: vs } = await admin
        .from('content_variants')
        .select('id, platform, compliance_status, title')
        .eq('content_item_id', contentItemId);
      variants = (vs ?? []) as typeof variants;
      const { data: it } = await admin
        .from('content_items')
        .select('status')
        .eq('id', contentItemId)
        .single();
      itemStatus = (it?.status as string) ?? '';
      const allProcessed =
        variants.length === PLATFORMS.length &&
        variants.every((v) => v.compliance_status !== 'pending');
      if (allProcessed) break;
    }

    record(
      'variants inserted for each platform',
      variants.length === PLATFORMS.length,
      `got ${variants.length}/${PLATFORMS.length}`,
    );
    record(
      'all variants processed by compliance (non-pending)',
      variants.length > 0 && variants.every((v) => v.compliance_status !== 'pending'),
      `statuses=${variants.map((v) => v.compliance_status).join(',')}`,
    );
    record(
      "content_items.status flipped to 'variant_generated'",
      itemStatus === 'variant_generated',
      `status=${itemStatus}`,
    );

    const variantIds = variants.map((v) => v.id);
    const { data: audits } = await admin
      .from('audit_logs')
      .select('action, target_id')
      .in('target_id', variantIds);
    const genActions = (audits ?? []).filter((a) => a.action === 'content.variant_generated');
    record(
      'audit_logs include one content.variant_generated per variant',
      genActions.length === variants.length,
      `got ${genActions.length}`,
    );
  } finally {
    await boss.stop({ graceful: true, timeout: 5000 });
    // Cleanup
    const { data: vs } = await admin
      .from('content_variants')
      .select('id')
      .eq('content_item_id', contentItemId);
    const vids = (vs ?? []).map((r) => r.id as string);
    if (vids.length > 0) {
      await admin.from('compliance_reviews').delete().in('target_id', vids);
      await admin.from('audit_logs').delete().in('target_id', vids);
      await admin.from('content_variants').delete().in('id', vids);
    }
    await admin.from('audit_logs').delete().eq('target_id', contentItemId);
    await admin.from('content_items').delete().eq('id', contentItemId);
    await admin.from('tenants').delete().eq('id', tenantId);
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
