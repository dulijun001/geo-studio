/**
 * Dev-only: delete all variants (+ their compliance_reviews and audit_logs)
 * for a given content_item, so you can re-generate cleanly.
 * Run: pnpm db:dev-clear-variants <content_item_id>
 */
import { createClient } from '@supabase/supabase-js';

async function main() {
  const contentItemId = process.argv[2];
  if (!contentItemId) {
    console.error('Usage: pnpm db:dev-clear-variants <content_item_id>');
    process.exit(1);
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: vs } = await admin
    .from('content_variants')
    .select('id')
    .eq('content_item_id', contentItemId);
  const ids = (vs ?? []).map((r) => r.id as string);
  if (ids.length === 0) {
    console.log('no variants to clear');
    return;
  }

  await admin.from('compliance_reviews').delete().in('target_id', ids);
  await admin.from('audit_logs').delete().in('target_id', ids);
  const { error } = await admin.from('content_variants').delete().in('id', ids);
  if (error) throw new Error(error.message);

  // Reset content_item status so UI shows the "parsed" state again
  await admin.from('content_items').update({ status: 'parsed' }).eq('id', contentItemId);

  console.log(`cleared ${ids.length} variants (+ reviews + audit) for content_item=${contentItemId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
