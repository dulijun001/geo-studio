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
import { writingTemplates } from '../schema/templates';
import { A_LEVEL_KEYWORDS, B_LEVEL_KEYWORDS } from './compliance-seed';
import { WRITING_TEMPLATE_SEEDS } from './writing-templates-seed';

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

  console.log('Seeding system writing templates (12 presets, ADR 007)...');
  const templateRows = WRITING_TEMPLATE_SEEDS.map((t) => ({
    tenant_id: null,
    slug: t.slug,
    name: t.name,
    description: t.description,
    prompt_skeleton: t.prompt_skeleton,
    structure_hint: t.structure_hint,
    is_system: true,
    visible: true,
  }));
  await db
    .insert(writingTemplates)
    .values(templateRows)
    .onConflictDoNothing();
  console.log(`  inserted ${templateRows.length} system templates (skipped on conflict)`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
