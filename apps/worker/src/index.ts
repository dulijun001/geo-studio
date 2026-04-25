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
import { reportError } from '@geo/shared';
import { registerJobs } from './jobs/index';

process.on('unhandledRejection', (reason) => {
  reportError(reason, { scope: 'worker.unhandled_rejection' });
});
process.on('uncaughtException', (err) => {
  reportError(err, { scope: 'worker.uncaught_exception' });
});

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
    reportError(err, { scope: 'pg-boss' });
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
  reportError(err, { scope: 'worker.main_fatal' });
  process.exit(1);
});
