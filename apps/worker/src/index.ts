/**
 * GEO Studio worker entry.
 *
 * Responsibilities (V1):
 *   1. Parse uploaded content (Word/PDF → markdown)
 *   2. Run LLM compliance review (stage 2 of three-gate)
 *   3. Generate publish-task hooks
 *   4. Poll engines via @geo/geo-core for GEO snapshots (V1 = manual trigger; V2 = cron)
 *
 * Queue: pg-boss on top of the same Postgres instance as the web app.
 */
import PgBoss from 'pg-boss';
import { registerJobs } from './jobs/index';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');

  const boss = new PgBoss({
    connectionString,
    schema: 'pgboss',
    retryLimit: 3,
    retryBackoff: true,
  });

  boss.on('error', (err) => {
    console.error('[pg-boss] error:', err);
  });

  await boss.start();
  console.log('[worker] pg-boss started');

  await registerJobs(boss);
  console.log('[worker] jobs registered');

  const shutdown = async (sig: string) => {
    console.log(`[worker] received ${sig}, draining...`);
    await boss.stop({ graceful: true, timeout: 30_000 });
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
