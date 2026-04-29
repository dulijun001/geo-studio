/**
 * GEO snapshot job (W6.2).
 *
 * Input: { snapshot_id, tenant_id, question_id, engine }
 * Pre-condition: a geo_snapshots row already exists at status=pending
 * (created by the web action that enqueued this job).
 *
 * Flow:
 *   1. Mark snapshot running.
 *   2. Load question text + tenant brand_vocab.
 *   3. Look up the engine adapter and run query() — currently only Doubao.
 *   4. On done: persist raw_response + citation_urls, run scanBrandMentions,
 *      insert one citations row per mention.
 *   5. On failed/rate_limited: write status + failure_reason; no citations.
 *
 * Adapters return TrackerResult instead of throwing for expected outcomes
 * (rate limit, captcha) per the TrackerAdapter contract, so we don't need
 * a try/catch around adapter.query here for those — only for unexpected bugs.
 */
import { scanBrandMentions, type VocabRow } from '@geo/geo-core';
import { reportError, type Engine } from '@geo/shared';
import { getServiceClient } from '../lib/supabase';
import { getAdapter } from '../trackers/registry';

export type GeoSnapshotJob = {
  snapshot_id: string;
  tenant_id: string;
  question_id: string;
  engine: Engine;
};

export async function handleGeoSnapshot(data: GeoSnapshotJob): Promise<void> {
  const { snapshot_id, tenant_id, question_id, engine } = data;
  const client = getServiceClient();
  const started = Date.now();

  console.log(`[geo-snapshot] snapshot=${snapshot_id} q=${question_id} engine=${engine}`);

  await client
    .from('geo_snapshots')
    .update({ status: 'running' })
    .eq('id', snapshot_id);

  const { data: q, error: qErr } = await client
    .from('questions')
    .select('id, text, city')
    .eq('id', question_id)
    .single<{ id: string; text: string; city: string | null }>();
  if (qErr || !q) {
    await markFailed(snapshot_id, `question not found: ${qErr?.message}`);
    return;
  }

  const { data: vocabRows, error: vErr } = await client
    .from('brand_vocab')
    .select('id, term, term_type, aliases')
    .eq('tenant_id', tenant_id);
  if (vErr) {
    await markFailed(snapshot_id, `brand_vocab fetch: ${vErr.message}`);
    return;
  }
  const vocab: VocabRow[] = (vocabRows ?? []).map((r) => ({
    id: r.id as string,
    term: r.term as string,
    term_type: r.term_type as VocabRow['term_type'],
    aliases: (r.aliases as string[]) ?? [],
  }));

  // Engine is now dispatched through the registry (apps/worker/src/trackers/
  // registry.ts). doubao + yuanbao are implemented; others return a clear
  // "not implemented" failure so the UI can mark them 扩展中 instead of red.
  const adapter = getAdapter(engine);
  const result = await adapter.query(
    { engine, question: q.text, city: q.city ?? undefined, snapshot_id },
    {
      account_id: 'guest',
      // V1 default: headful. Bundled-Chromium headless gets hard-blocked by
      // both doubao + yuanbao (ERR_CONNECTION_CLOSED / silent reject). Each
      // adapter uses system Chrome + persistent userDataDir so the login
      // cookie survives. Set PLAYWRIGHT_HEADLESS=true on the eventual
      // Xvfb-equipped Linux worker.
      headless: process.env.PLAYWRIGHT_HEADLESS === 'true',
      timeout_ms: 120_000,
    },
  );

  const sessionUrl =
    typeof (result.meta as { session_url?: unknown } | undefined)?.session_url === 'string'
      ? ((result.meta as { session_url: string }).session_url)
      : null;

  if (result.status !== 'done') {
    await client
      .from('geo_snapshots')
      .update({
        status: result.status,
        failure_reason: result.failure_reason ?? null,
        raw_response: result.raw_response ?? null,
        citation_urls: result.citation_urls ?? [],
        session_url: sessionUrl,
        asked_at: new Date().toISOString(),
      })
      .eq('id', snapshot_id);
    console.log(
      `[geo-snapshot] ${snapshot_id} → ${result.status} (${result.failure_reason ?? '—'})`,
    );
    return;
  }

  // Done — persist response + scan mentions.
  await client
    .from('geo_snapshots')
    .update({
      status: 'done',
      raw_response: result.raw_response ?? '',
      citation_urls: result.citation_urls ?? [],
      session_url: sessionUrl,
      asked_at: new Date().toISOString(),
    })
    .eq('id', snapshot_id);

  const scan = scanBrandMentions(result.raw_response ?? '', vocab);
  if (scan.mentions.length > 0) {
    const rows = scan.mentions.map((m) => ({
      tenant_id,
      snapshot_id,
      brand_mentioned: true,
      mention_position: m.offset,
      mention_text: m.matched_span,
      vocab_id: m.vocab_id,
      term_type: m.term_type,
    }));
    const { error: cErr } = await client.from('citations').insert(rows);
    if (cErr) console.error(`[geo-snapshot] citations insert: ${cErr.message}`);
  }

  console.log(
    `[geo-snapshot] ${snapshot_id} done — ${scan.mentions.length} mentions ` +
      `(brand=${scan.count_by_type.brand} comp=${scan.count_by_type.competitor} ` +
      `doc=${scan.count_by_type.doctor}) total=${Date.now() - started}ms`,
  );
}

async function markFailed(snapshotId: string, reason: string): Promise<void> {
  const client = getServiceClient();
  reportError(new Error(reason), {
    scope: 'tracker.geo_snapshot',
    extra: { snapshot_id: snapshotId },
  });
  await client
    .from('geo_snapshots')
    .update({ status: 'failed', failure_reason: reason })
    .eq('id', snapshotId);
}
