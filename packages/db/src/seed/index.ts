/**
 * Seed script.
 * Populates compliance keyword dictionary (global) and a demo tenant for local dev.
 * Safe to run multiple times (idempotent on slug / term conflicts).
 *
 * Run: pnpm db:seed
 */
import { db } from '../index';
import { complianceKeywords } from '../schema/compliance';
import { tenants } from '../schema/tenants';
import { A_LEVEL_KEYWORDS, B_LEVEL_KEYWORDS } from './compliance-seed';

async function main() {
  console.log('Seeding compliance keywords...');
  const rows = [
    ...A_LEVEL_KEYWORDS.map((k) => ({ ...k, level: 'A' as const })),
    ...B_LEVEL_KEYWORDS.map((k) => ({ ...k, level: 'B' as const })),
  ];
  await db.insert(complianceKeywords).values(rows).onConflictDoNothing();
  console.log(`  inserted ${rows.length} keywords (skipped on conflict)`);

  console.log('Seeding demo tenant...');
  await db
    .insert(tenants)
    .values({
      name: 'Demo Dental Hospital',
      slug: 'demo-dental',
      industry: 'dental',
      plan: 'trial',
    })
    .onConflictDoNothing();
  console.log('  done');

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
