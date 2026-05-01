/**
 * Lightweight pg-boss enqueue helper for discoverability artifact regen.
 *
 * Server actions that mutate any entity feeding the discoverability layer
 * (brand fields / staff geo flag / services / testimonials / faqs) should
 * call enqueueRegenerate(tenantId) after their write succeeds.
 *
 * The pattern of spinning up a pg-boss client per action is consistent with
 * other action files in this codebase (content / publish / etc). It pays a
 * fresh-handshake cost per action but stays simple.
 */

import 'server-only';
import PgBoss from 'pg-boss';

export async function enqueueRegenerate(tenantId: string): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[enqueueRegenerate] DATABASE_URL missing — skipping enqueue');
    return;
  }

  const boss = new PgBoss({ connectionString, schema: 'pgboss' });
  await boss.start();
  try {
    await boss.createQueue('discoverability.regenerate');
    await boss.send('discoverability.regenerate', { tenant_id: tenantId });
  } finally {
    await boss.stop({ graceful: true, timeout: 5000 });
  }
}
