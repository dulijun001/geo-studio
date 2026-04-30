/**
 * Dev-only smoke for any registered tracker engine.
 *
 * Usage:
 *   pnpm --filter @geo/worker exec tsx src/trackers/_dev/smoke.ts <engine> "<question>" [--headful]
 *
 * engine ∈ doubao | yuanbao | deepseek (others are stubs)
 *
 * Prints status, text length, citation URLs, and full raw_response. Useful
 * for eyeballing whether a question triggers RAG-mode and for debugging
 * selector rot.
 */
import type { Engine } from '@geo/shared';
import { getAdapter, isImplemented } from '../registry';

async function main() {
  const engine = process.argv[2] as Engine | undefined;
  const question = process.argv[3];
  const headful = process.argv.includes('--headful');

  if (!engine || !question) {
    console.error('Usage: tsx src/trackers/_dev/smoke.ts <engine> "<question>" [--headful]');
    console.error('  engine ∈ doubao | yuanbao | deepseek');
    process.exit(1);
  }
  if (!isImplemented(engine)) {
    console.error(`engine "${engine}" has no real adapter (stub only). Aborting.`);
    process.exit(1);
  }

  const adapter = getAdapter(engine);
  console.log(`[smoke] engine:   ${engine}`);
  console.log(`[smoke] question: ${question}`);
  console.log(`[smoke] headless: ${!headful}`);
  const t0 = Date.now();

  const result = await adapter.query(
    {
      engine,
      question,
      snapshot_id: 'smoke',
    },
    {
      account_id: 'smoke',
      headless: !headful,
      timeout_ms: 120_000,
    },
  );

  console.log('\n─── result ───');
  console.log(`status: ${result.status}`);
  if (result.failure_reason) console.log(`failure_reason: ${result.failure_reason}`);
  console.log(`text_len: ${result.raw_response?.length ?? 0}`);
  console.log(`citation_urls (${result.citation_urls?.length ?? 0}):`);
  for (const u of result.citation_urls ?? []) console.log(`  ${u}`);
  console.log(`meta: ${JSON.stringify(result.meta, null, 2)}`);
  console.log('\n─── full raw_response ───');
  console.log(result.raw_response ?? '');
  console.log(`\n[smoke] total elapsed: ${Date.now() - t0}ms`);
}

main().catch((err) => {
  console.error('[smoke] fatal:', err);
  process.exit(1);
});
