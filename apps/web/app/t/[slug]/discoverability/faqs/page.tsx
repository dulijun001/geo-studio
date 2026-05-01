import Link from 'next/link';
import { requireRole } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/page-header';
import { FaqsTable } from './faqs-table';

export const dynamic = 'force-dynamic';

type FaqRow = {
  id: string;
  question: string;
  answer_md: string;
  category: string | null;
  sort_order: number;
  geo_visible: boolean;
  updated_at: string;
};

export default async function FaqsListPage({ params }: { params: { slug: string } }) {
  const tenant = await requireRole(params.slug, ['owner', 'admin', 'operator']);
  const supabase = createSupabaseServerClient();

  const { data: rowsRaw } = await supabase
    .from('faqs')
    .select('id, question, answer_md, category, sort_order, geo_visible, updated_at')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null)
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true });

  const rows = (rowsRaw ?? []) as FaqRow[];
  const visibleCount = rows.filter((r) => r.geo_visible).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="FAQ"
        subtitle={`${rows.length} 条 · ${visibleCount} 已公开 — 进 schema.org/FAQPage 集合`}
        actions={
          <Link
            href={`/t/${tenant.slug}/discoverability`}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            ← 可发现层
          </Link>
        }
      />
      <FaqsTable tenantSlug={tenant.slug} rows={rows} />
    </div>
  );
}
