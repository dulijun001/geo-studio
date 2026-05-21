/**
 * One-shot backfill: re-run scanBrandMentions on existing done snapshots
 * that have raw_response but no citations rows. Use when V1.11.4d FK bug
 * silently dropped citations for a window of snapshots.
 *
 * Usage:
 *   pnpm --filter @geo/worker exec tsx src/_dev/backfill-citations.ts <tenant_slug>
 *
 * Safe to re-run: skips snapshots that already have citations + uses upsert
 * semantics (won't double-insert mentions).
 */
import { scanBrandMentions, type VocabRow } from '@geo/geo-core';
import { getServiceClient } from '../lib/supabase';

async function main() {
  const slug = process.argv[2] ?? 'songshu';
  const client = getServiceClient();

  const { data: tenant } = await client
    .from('tenants')
    .select('id, slug')
    .eq('slug', slug)
    .single();
  if (!tenant) throw new Error(`tenant not found: ${slug}`);

  const { data: vocabRows } = await client
    .from('brand_vocab')
    .select('id, term, term_type, aliases')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null);
  const vocab: VocabRow[] = (vocabRows ?? []).map((r) => ({
    id: r.id as string,
    term: r.term as string,
    term_type: r.term_type as VocabRow['term_type'],
    aliases: (r.aliases as string[]) ?? [],
  }));
  console.log(`[backfill] tenant=${slug} vocab=${vocab.length} active rows`);

  // Snapshots with non-empty raw_response that have NO citations yet.
  const { data: snaps } = await client
    .from('geo_snapshots')
    .select('id, raw_response')
    .eq('tenant_id', tenant.id)
    .eq('status', 'done')
    .not('raw_response', 'is', null)
    .is('deleted_at', null);
  const candidates = (snaps ?? []) as Array<{ id: string; raw_response: string }>;

  const { data: existing } = await client
    .from('citations')
    .select('snapshot_id')
    .in(
      'snapshot_id',
      candidates.map((s) => s.id),
    );
  const withCitations = new Set((existing ?? []).map((c) => c.snapshot_id as string));

  const toScan = candidates.filter((s) => !withCitations.has(s.id) && s.raw_response.length > 0);
  console.log(`[backfill] candidate=${candidates.length}, missing citations=${toScan.length}`);

  let totalMentions = 0;
  let processed = 0;
  for (const s of toScan) {
    const scan = scanBrandMentions(s.raw_response, vocab);
    if (scan.mentions.length === 0) {
      processed++;
      continue;
    }
    const rows = scan.mentions.map((m) => ({
      tenant_id: tenant.id,
      snapshot_id: s.id,
      brand_mentioned: true,
      mention_position: m.offset,
      mention_text: m.matched_span,
      vocab_id: m.vocab_id,
      term_type: m.term_type,
    }));
    const { error } = await client.from('citations').insert(rows);
    if (error) {
      console.error(`[backfill] insert error snapshot=${s.id}: ${error.message}`);
      continue;
    }
    totalMentions += rows.length;
    processed++;
    if (processed % 10 === 0) console.log(`[backfill] ${processed}/${toScan.length} processed`);
  }

  console.log(`[backfill] done. processed=${processed}, total_mentions_inserted=${totalMentions}`);
}

main().catch((err) => {
  console.error('[backfill] fatal:', err);
  process.exit(1);
});
