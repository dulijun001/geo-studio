/**
 * Shared pg-boss singleton for the web process.
 *
 * Why this exists: each `new PgBoss({...}).start()` opens a pg connection
 * pool (default 10). Doing that per server-action call multiplies by
 * concurrent requests and exhausts the upstream Supabase pool
 * (MaxClientsInSessionMode). One process-wide instance keeps the footprint
 * to a single 10-conn pool regardless of request volume.
 *
 * Lifecycle: lazy-started on first use; never explicitly stopped (Next.js
 * dev / Vercel function recycles the process). Worker has its own boss
 * in apps/worker/src/index.ts — that's intentional, the pools should not
 * be shared across processes.
 */
import PgBoss from 'pg-boss';

let _boss: PgBoss | null = null;
let _starting: Promise<PgBoss> | null = null;
const _knownQueues = new Set<string>();

async function getBoss(): Promise<PgBoss> {
  if (_boss) return _boss;
  if (_starting) return _starting;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');

  _starting = (async () => {
    const boss = new PgBoss({
      connectionString: url,
      schema: 'pgboss',
      max: 2,
    });
    // Self-heal — when Supavisor terminates the conn (idle timeout / pool
    // churn / db restart), drop the singleton so the next enqueueJob()
    // bootstraps a fresh boss. Without this, a single transient error
    // wedges the entire web process until restart.
    boss.on('error', (err) => {
      console.error('[pg-boss web] error, resetting singleton:', err);
      _boss = null;
      _starting = null;
      _knownQueues.clear();
    });
    await boss.start();
    _boss = boss;
    return boss;
  })();
  try {
    return await _starting;
  } catch (err) {
    _starting = null;
    throw err;
  }
}

/**
 * Enqueue a job. Ensures the queue exists once per process — subsequent
 * sends to the same name skip the createQueue roundtrip.
 */
export async function enqueueJob(name: string, data: object): Promise<void> {
  const boss = await getBoss();
  if (!_knownQueues.has(name)) {
    await boss.createQueue(name);
    _knownQueues.add(name);
  }
  await boss.send(name, data);
}
