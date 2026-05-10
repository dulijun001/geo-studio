/**
 * Re-queue failed draft_batch_items where the failure was a transient
 * "fetch failed" (web service was down, not real LLM failure).
 *
 * Resets matching items to status='pending', clears error_msg, and re-sends
 * a content.batch_draft_item job for each. Worker will pick them up.
 *
 * Usage: pnpm --filter @geo/db tsx src/_dev/requeue-failed-batch-items.ts demo-dental
 */
import { createClient } from '@supabase/supabase-js';
import PgBoss from 'pg-boss';

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error('Usage: tsx requeue-failed-batch-items.ts <tenant_slug>');
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dbUrl = process.env.DATABASE_URL;
  if (!url || !key || !dbUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + DATABASE_URL required');
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: tenant } = await sb.from('tenants').select('id').eq('slug', slug).single();
  if (!tenant) throw new Error(`tenant ${slug} not found`);

  // Match transient/parse failures only — leave true LLM failures alone.
  const { data: items } = await sb
    .from('draft_batch_items')
    .select('id, batch_id, topic, platform, error_msg')
    .eq('tenant_id', tenant.id)
    .eq('status', 'failed')
    .or('error_msg.ilike.%fetch failed%,error_msg.ilike.%返回格式异常%,error_msg.ilike.%超过 90 秒%')
    .order('created_at', { ascending: false })
    .limit(50);

  if (!items || items.length === 0) {
    console.log('No matching failed items.');
    return;
  }
  console.log(`Found ${items.length} fetch-failed items to requeue.`);

  // Pull batch metadata for each
  const batchIds = Array.from(new Set(items.map((i) => i.batch_id as string)));
  const { data: batches } = await sb
    .from('draft_batches')
    .select('id, audience, writing_template_id')
    .in('id', batchIds);
  const batchMeta = new Map<string, { audience: string; writing_template_id: string | null }>(
    (batches ?? []).map((b) => [
      b.id as string,
      { audience: b.audience as string, writing_template_id: (b.writing_template_id as string) ?? null },
    ]),
  );

  const boss = new PgBoss({ connectionString: dbUrl, schema: 'pgboss', max: 2 });
  await boss.start();
  await boss.createQueue('content.batch_draft_item');

  let requeued = 0;
  for (const item of items) {
    const meta = batchMeta.get(item.batch_id as string);
    if (!meta) {
      console.warn(`  skip item ${item.id}: batch metadata missing`);
      continue;
    }

    // Reset state to pending
    await sb
      .from('draft_batch_items')
      .update({ status: 'pending', error_msg: null, attempts: 0, updated_at: new Date().toISOString() })
      .eq('id', item.id);

    // If parent batch is in 'failed'/'partial' rollup, flip back to running
    await sb
      .from('draft_batches')
      .update({ status: 'running', completed_at: null })
      .eq('id', item.batch_id);

    await boss.send('content.batch_draft_item', {
      batch_id: item.batch_id,
      item_id: item.id,
      tenant_id: tenant.id,
      topic: item.topic,
      platform: item.platform,
      audience: meta.audience,
      writing_template_id: meta.writing_template_id,
    });
    requeued++;
    console.log(`  ↻ ${item.topic} × ${item.platform}`);
  }

  await boss.stop({ graceful: true, timeout: 5000 });
  console.log(`Requeued ${requeued}/${items.length} items.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
