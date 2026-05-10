/**
 * Process-wide pg-boss reference for worker handlers.
 *
 * Worker entry creates the boss, registers jobs, then sets the ref. Handlers
 * needing to enqueue follow-up jobs (e.g. batch-draft-item enqueues
 * variant_generate after success) call enqueueViaSharedBoss() to reuse the
 * existing connection pool instead of opening a new PgBoss instance per
 * job invocation.
 *
 * Pre-this-fix: each batch-item handler opened its own PgBoss → 10 conns
 * each. With teamSize=5 concurrent items × 5 batches/day = pool exhausted.
 */
import type PgBoss from 'pg-boss';

let _boss: PgBoss | null = null;
const _knownQueues = new Set<string>();

export function setSharedBoss(b: PgBoss): void {
  _boss = b;
}

export async function enqueueViaSharedBoss(name: string, data: object): Promise<void> {
  if (!_boss) throw new Error('shared boss not initialized — call setSharedBoss() in worker entry');
  if (!_knownQueues.has(name)) {
    await _boss.createQueue(name);
    _knownQueues.add(name);
  }
  await _boss.send(name, data);
}
