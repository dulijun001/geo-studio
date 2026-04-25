/**
 * Dev-only: apply a single SQL migration file over DATABASE_URL.
 * Reads the file path from argv[2]. Splits on the Drizzle --> statement-breakpoint
 * marker and runs each chunk inside one transaction.
 *
 * NEVER run against production without explicit user confirmation.
 * Usage:
 *   pnpm exec tsx src/dev-apply-migration.ts ../../supabase/migrations/0004_w5_dispatch.sql
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postgres from 'postgres';

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: tsx dev-apply-migration.ts <path-to-sql>');
    process.exit(1);
  }
  const abs = resolve(process.cwd(), file);
  const sql = readFileSync(abs, 'utf-8');
  console.log(`[apply-migration] file: ${abs}`);

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');

  const client = postgres(url, { max: 1, prepare: false });

  const chunks = sql
    .split('--> statement-breakpoint')
    .map((c) => c.trim())
    .filter((c) => c.length > 0 && !/^(--[^\n]*\n?\s*)+$/.test(c));

  console.log(`[apply-migration] ${chunks.length} statement(s)`);

  try {
    await client.begin(async (tx) => {
      for (let i = 0; i < chunks.length; i++) {
        const preview = chunks[i].replace(/\s+/g, ' ').slice(0, 80);
        console.log(`  [${i + 1}/${chunks.length}] ${preview}…`);
        await tx.unsafe(chunks[i]);
      }
    });
    console.log('[apply-migration] ✓ committed');
  } catch (err) {
    console.error('[apply-migration] ✗ rolled back:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
