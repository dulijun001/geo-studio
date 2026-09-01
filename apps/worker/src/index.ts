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
import { setSharedBoss } from './lib/boss-ref';
import { registerJobs } from './jobs/index';
import { notifyWeCom } from './lib/wecom';

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
    // Self-hosted Supabase pooler (D13) runs in session mode with limited
    // pool_size. Cap pg-boss at 3 conns; with batchSize=5 polling that's
    // enough to keep all teamSize=5 jobs flowing without exhausting upstream.
    max: 3,
  });

  boss.on('error', (err) => {
    reportError(err, { scope: 'pg-boss' });
  });

  await boss.start();
  console.log('[worker] pg-boss started');

  setSharedBoss(boss);
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

main().catch(async (err) => {
  reportError(err, { scope: 'worker.main_fatal' });
  // C4:worker 起不来是"内容自动化全线停摆"的单点,必须触达手机。等推送发完再退出。
  await notifyWeCom(
    '🔴 geo-studio worker 启动失败',
    `worker 进程无法启动，所有定时任务(凌晨起草/追踪/早报)已停摆。\n> ${String((err as Error)?.message ?? err).slice(0, 300)}`,
  ).catch(() => {});
  process.exit(1);
});
