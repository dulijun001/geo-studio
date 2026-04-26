/**
 * Dev demo: query Doubao Web + scan answer with brand_vocab → SOV report.
 *
 * This is the "magic moment" demo — proves the full chain works:
 *   1. Real Chrome opens Doubao
 *   2. Asks the question
 *   3. Captures the answer
 *   4. Scans for brand mentions (target tenant + competitors)
 *   5. Reports SOV
 *
 * Usage:
 *   pnpm exec tsx src/trackers/dev-baseline.ts <tenant_slug> "<question>"
 */
import { doubaoWebAdapter } from './doubao-web';
import { scanBrandMentions } from '@geo/geo-core';
import { getServiceClient } from '../lib/supabase';

async function main() {
  const tenantSlug = process.argv[2];
  const question = process.argv[3];
  if (!tenantSlug || !question) {
    console.error('Usage: tsx dev-baseline.ts <tenant_slug> "<question>"');
    process.exit(1);
  }

  console.log(`[baseline] tenant=${tenantSlug}  question="${question}"`);
  console.log('[baseline] step 1/3: load brand vocab');
  const client = getServiceClient();
  const { data: tenants, error: tenantErr } = await client
    .from('tenants')
    .select('id, name, slug')
    .eq('slug', tenantSlug)
    .limit(1);
  if (tenantErr) throw new Error(`tenant query error: ${JSON.stringify(tenantErr)}`);
  const tenant = tenants?.[0];
  if (!tenant) {
    const { data: all } = await client.from('tenants').select('slug, name').limit(20);
    throw new Error(
      `tenant slug='${tenantSlug}' not found. Available: ${JSON.stringify(all)}`,
    );
  }

  const { data: vocab } = await client
    .from('brand_vocab')
    .select('id, term, term_type, aliases')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null);
  if (!vocab?.length) throw new Error('brand_vocab is empty for this tenant');
  console.log(
    `[baseline]   loaded ${vocab.length} terms (` +
      `brand=${vocab.filter((v) => v.term_type === 'brand').length} ` +
      `doctor=${vocab.filter((v) => v.term_type === 'doctor').length} ` +
      `service=${vocab.filter((v) => v.term_type === 'service').length} ` +
      `location_alias=${vocab.filter((v) => v.term_type === 'location_alias').length} ` +
      `competitor=${vocab.filter((v) => v.term_type === 'competitor').length})`,
  );

  console.log('[baseline] step 2/3: ask Doubao (headful Chrome will pop up)');
  const t0 = Date.now();
  const result = await doubaoWebAdapter.query(
    { engine: 'doubao', question, snapshot_id: 'baseline-demo' },
    { account_id: 'baseline', headless: false, timeout_ms: 120_000 },
  );
  const elapsed = Date.now() - t0;
  console.log(`[baseline]   status=${result.status} text_len=${result.raw_response?.length ?? 0} elapsed=${elapsed}ms`);

  if (result.status !== 'done' || !result.raw_response) {
    console.error('[baseline] Doubao did not return a usable answer:', result.failure_reason);
    process.exit(1);
  }

  console.log('[baseline] step 3/3: scan answer for brand mentions');
  const scan = scanBrandMentions(result.raw_response, vocab);
  const mentions = scan.mentions;

  // Build report
  const byType: Record<string, Array<{ term: string; count: number }>> = {
    brand: [],
    doctor: [],
    service: [],
    location_alias: [],
    competitor: [],
  };
  const seen = new Map<string, number>();
  for (const m of mentions) {
    const key = `${m.term_type}|${m.term}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const [key, count] of seen) {
    const [type, term] = key.split('|');
    byType[type!]?.push({ term: term!, count });
  }
  for (const arr of Object.values(byType)) arr.sort((a, b) => b.count - a.count);

  const myMentions = byType.brand!.reduce((a, b) => a + b.count, 0);
  const competitorMentions = byType.competitor!.reduce((a, b) => a + b.count, 0);
  const totalBrandLevel = myMentions + competitorMentions;
  const sov = totalBrandLevel > 0 ? (myMentions / totalBrandLevel * 100).toFixed(1) : '—';

  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log(`📊 GEO BASELINE 报告 — ${tenant.name}`);
  console.log('══════════════════════════════════════════════════════════════════');
  console.log(`问题: "${question}"`);
  console.log(`豆包返回: ${result.raw_response.length} 字  /  ${elapsed}ms`);
  console.log('');
  console.log(`🎯 你的 SOV(品牌级):${sov}%`);
  console.log(`   · ${tenant.name} 被提到 ${myMentions} 次`);
  console.log(`   · 竞品被提到 ${competitorMentions} 次`);
  console.log('');
  if (byType.brand!.length) {
    console.log(`✓ 你的品牌(${byType.brand!.length} 项命中):`);
    for (const x of byType.brand!) console.log(`    ${x.term} × ${x.count}`);
  } else {
    console.log(`✗ 你的品牌:未被提及`);
  }
  if (byType.competitor!.length) {
    console.log(`✗ 竞品(${byType.competitor!.length} 项命中):`);
    for (const x of byType.competitor!.slice(0, 8)) console.log(`    ${x.term} × ${x.count}`);
  }
  if (byType.doctor!.length) {
    console.log(`👩‍⚕️ 你的医生(${byType.doctor!.length} 项命中):`);
    for (const x of byType.doctor!) console.log(`    ${x.term} × ${x.count}`);
  } else {
    console.log(`👩‍⚕️ 你的医生:无人被提及`);
  }
  if (byType.service!.length) {
    console.log(`🦷 你的服务项目(${byType.service!.length} 项命中):`);
    for (const x of byType.service!) console.log(`    ${x.term} × ${x.count}`);
  }
  console.log('══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('豆包答案前 800 字:');
  console.log('──────────────────────────────────────────────────────────────────');
  console.log(result.raw_response.slice(0, 800));
  console.log('──────────────────────────────────────────────────────────────────');
}

main().catch((err) => {
  console.error('[baseline] fatal:', err);
  process.exit(1);
});
