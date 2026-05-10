/**
 * V1.9 — Batch progress view.
 *
 * Initial state SSR'd, then client subscribes to postgres_changes on
 * draft_batch_items so the user sees real-time pending → running → succeeded/failed.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/tenant';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { PageHeader } from '@/components/page-header';
import { BatchProgress } from './batch-progress';

export const dynamic = 'force-dynamic';

export default async function BatchProgressPage({
  params,
}: {
  params: { slug: string; id: string };
}) {
  const tenant = await requireRole(params.slug, ['owner', 'admin', 'operator']);
  if (!tenant) notFound();

  // Service client — admin pages run under HMAC cookie, not Supabase auth.
  const supabase = getSupabaseServiceClient();

  const [batchRes, itemsRes] = await Promise.all([
    supabase
      .from('draft_batches')
      .select('id, total, succeeded, failed, status, audience, platforms, created_at, completed_at')
      .eq('id', params.id)
      .eq('tenant_id', tenant.id)
      .maybeSingle(),
    supabase
      .from('draft_batch_items')
      .select('id, topic, platform, status, content_item_id, error_msg, attempts, updated_at')
      .eq('batch_id', params.id)
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: true }),
  ]);

  if (!batchRes.data) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title="批量起草进度"
        subtitle={`${batchRes.data.total} 任务 · 受众「${batchRes.data.audience}」`}
        actions={
          <Link
            href={`/t/${tenant.slug}/content`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← 返回内容池
          </Link>
        }
      />

      <BatchProgress
        tenantSlug={tenant.slug}
        batchId={params.id}
        initialBatch={batchRes.data}
        initialItems={itemsRes.data ?? []}
      />
    </div>
  );
}
