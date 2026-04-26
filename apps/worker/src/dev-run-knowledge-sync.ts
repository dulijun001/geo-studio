/**
 * Run knowledge-sync job once, immediately. Bypasses pg-boss schedule.
 *
 * Usage:
 *   pnpm exec tsx --env-file=../../.env src/dev-run-knowledge-sync.ts
 *   pnpm exec tsx --env-file=../../.env src/dev-run-knowledge-sync.ts demo-dental
 */
import { handleKnowledgeSync } from './jobs/knowledge-sync';

async function main() {
  const tenant_slug = process.argv[2];
  console.log(`[dev] running knowledge-sync${tenant_slug ? ` for ${tenant_slug}` : ' for all tenants'}`);
  console.log(`[dev] KB root: ${process.env.KNOWLEDGE_BASE_ROOT ?? `${process.env.HOME}/Workspace/songshu-knowledge-base`}`);
  const start = Date.now();
  const stats = await handleKnowledgeSync(tenant_slug ? { tenant_slug } : {});
  const elapsed = Date.now() - start;
  console.log(`[dev] done in ${elapsed}ms`);
  for (const s of stats) {
    console.log(`  ${s.tenant_slug}: scanned=${s.scanned} added=${s.added} updated=${s.updated} deleted=${s.deleted} unchanged=${s.unchanged}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
