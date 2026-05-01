'use server';

import PgBoss from 'pg-boss';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/tenant';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { SUPPORTED_ENGINES, type SupportedEngine } from './engines';

/**
 * Enqueue a GEO snapshot for one question.
 *
 * Creates the geo_snapshots row at status=pending here so the UI immediately
 * shows the new run; the worker flips it to running → done/failed as it
 * progresses. We use the service-role client because the snapshot is owned by
 * the tenant, not the operator's user account.
 */
export async function enqueueGeoSnapshot(
  tenantSlug: string,
  questionId: string,
  engine: SupportedEngine = 'doubao',
): Promise<{ snapshot_id: string }> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  if (!(SUPPORTED_ENGINES as readonly string[]).includes(engine)) {
    throw new Error(`不支持的引擎:${engine}`);
  }

  const service = getSupabaseServiceClient();

  // Sanity-check the question belongs to this tenant.
  const { data: q, error: qErr } = await service
    .from('questions')
    .select('id, tenant_id, active')
    .eq('id', questionId)
    .single();
  if (qErr || !q) throw new Error(`Question not found: ${qErr?.message}`);
  if (q.tenant_id !== tenant.id) throw new Error('Tenant mismatch');
  if (!q.active) throw new Error('该问题已停用,先去问题库重新启用再追踪。');

  const { data: snap, error: sErr } = await service
    .from('geo_snapshots')
    .insert({
      tenant_id: tenant.id,
      question_id: questionId,
      engine,
      status: 'pending',
    })
    .select('id')
    .single();
  if (sErr || !snap) throw new Error(`创建 snapshot 失败: ${sErr?.message}`);
  const snapshotId = snap.id as string;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not set');
  const boss = new PgBoss({ connectionString: databaseUrl, schema: 'pgboss' });
  await boss.start();
  try {
    await boss.createQueue('geo.snapshot');
    await boss.send('geo.snapshot', {
      snapshot_id: snapshotId,
      tenant_id: tenant.id,
      question_id: questionId,
      engine,
    });
  } finally {
    await boss.stop({ graceful: true, timeout: 5000 });
  }

  revalidatePath(`/t/${tenantSlug}/tracking`);
  return { snapshot_id: snapshotId };
}
