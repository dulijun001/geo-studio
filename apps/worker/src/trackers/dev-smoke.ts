/**
 * Dev-only smoke for the Doubao Web tracker.
 *
 * Usage:
 *   pnpm --filter @geo/worker exec tsx src/trackers/dev-smoke.ts "南京正畸推荐哪家?" [--headful]
 *
 * Prints the adapter's result (status, text length, citation URLs, first 400
 * chars of the answer). Useful for eyeballing whether a question triggers
 * RAG-mode or knowledge-card mode, and for debugging selector rot.
 */
import { doubaoWebAdapter } from './doubao-web';

async function main() {
  const question = process.argv[2];
  if (!question) {
    console.error('Usage: tsx src/trackers/dev-smoke.ts <question> [--headful]');
    process.exit(1);
  }
  const headful = process.argv.includes('--headful');

  console.log(`[smoke] question: ${question}`);
  console.log(`[smoke] headless: ${!headful}`);
  const t0 = Date.now();

  const result = await doubaoWebAdapter.query(
    {
      engine: 'doubao',
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
