/**
 * Seed core GEO baseline questions for the demo-dental tenant.
 *
 * These are the questions we expect a real Kunming dental customer would ask
 * Doubao. priority >= 7 → picked up by geo.weekly_baseline schedule.
 *
 * Idempotent: skips inserts if a question with the same text already exists
 * for the tenant.
 *
 * Usage:
 *   pnpm --filter @geo/db exec tsx --env-file=../../.env src/dev-seed-baseline-questions.ts demo-dental
 */
import postgres from 'postgres';

type Seed = {
  text: string;
  intent: string;
  city: string | null;
  category: string | null;
  priority: number;
};

const KUNMING_DENTAL_SEEDS: Seed[] = [
  // P0 (priority 9) — high-intent local recommendations
  { text: '昆明种植牙医院推荐', intent: 'local_recommendation', city: '昆明', category: '种植', priority: 9 },
  { text: '昆明儿童口腔医院哪家好', intent: 'local_recommendation', city: '昆明', category: '儿牙', priority: 9 },
  { text: '昆明正畸医院推荐', intent: 'local_recommendation', city: '昆明', category: '正畸', priority: 9 },
  { text: '昆明全口种植牙哪家好', intent: 'local_recommendation', city: '昆明', category: '种植', priority: 9 },

  // P1 (priority 8) — disease/condition specific
  { text: '糖尿病人能种植牙吗', intent: 'risk_concern', city: null, category: '种植', priority: 8 },
  { text: '昆明隐形矫正多少钱', intent: 'price_inquiry', city: '昆明', category: '正畸', priority: 8 },
  { text: '昆明儿童涂氟哪家好', intent: 'local_recommendation', city: '昆明', category: '儿牙', priority: 8 },

  // P2 (priority 7) — comparisons + procedures
  { text: '种植牙和镶牙哪个好', intent: 'comparison', city: null, category: '种植', priority: 7 },
  { text: '根管治疗会很痛吗', intent: 'risk_concern', city: null, category: '修复', priority: 7 },
  { text: '昆明牙周病治疗医院', intent: 'local_recommendation', city: '昆明', category: '牙周', priority: 7 },
];

async function main() {
  const tenantSlug = process.argv[2];
  if (!tenantSlug) {
    console.error('Usage: tsx dev-seed-baseline-questions.ts <tenant_slug>');
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const sql = postgres(url, { max: 1, prepare: false });

  try {
    const tenants = await sql<Array<{ id: string; name: string }>>`
      SELECT id, name FROM tenants WHERE slug = ${tenantSlug} AND deleted_at IS NULL LIMIT 1
    `;
    if (!tenants[0]) throw new Error(`tenant not found: ${tenantSlug}`);
    const tenantId = tenants[0].id;

    let inserted = 0;
    let skipped = 0;
    for (const seed of KUNMING_DENTAL_SEEDS) {
      const existing = await sql<Array<{ id: string }>>`
        SELECT id FROM questions WHERE tenant_id = ${tenantId} AND text = ${seed.text} LIMIT 1
      `;
      if (existing[0]) {
        skipped += 1;
        continue;
      }
      await sql`
        INSERT INTO questions (tenant_id, text, intent, city, category, priority, active)
        VALUES (${tenantId}, ${seed.text}, ${seed.intent}, ${seed.city}, ${seed.category}, ${seed.priority}, true)
      `;
      inserted += 1;
    }

    console.log(`[seed] tenant=${tenantSlug} inserted=${inserted} skipped=${skipped}`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
