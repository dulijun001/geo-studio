'use server';

import PgBoss from 'pg-boss';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/tenant';

/**
 * Manually enqueue a knowledge-sync run for this tenant. Useful when the
 * customer just edited a critical md (e.g. 红线词库) and doesn't want to
 * wait up to 5 min for the next scheduled sync.
 */
export async function forceKnowledgeSync(tenantSlug: string): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin']);

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not set');

  const boss = new PgBoss({ connectionString: databaseUrl, schema: 'pgboss' });
  await boss.start();
  try {
    await boss.createQueue('knowledge.sync');
    await boss.send('knowledge.sync', { tenant_slug: tenant.slug });
  } finally {
    await boss.stop({ graceful: true, timeout: 5000 });
  }

  revalidatePath(`/t/${tenantSlug}/settings/knowledge`);
}
