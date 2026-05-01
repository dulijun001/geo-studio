import Link from 'next/link';
import { requireRole } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/page-header';
import { fmtDateTime } from '@/lib/format';
import { ServicesTable } from './services-table';

export const dynamic = 'force-dynamic';

type ServiceRow = {
  id: string;
  name: string;
  category: string | null;
  description_md: string | null;
  duration_minutes: number | null;
  price_range: Record<string, unknown> | null;
  medical_procedure_code: string | null;
  geo_visible: boolean;
  created_at: string;
  updated_at: string;
};

export default async function ServicesListPage({ params }: { params: { slug: string } }) {
  const tenant = await requireRole(params.slug, ['owner', 'admin', 'operator']);
  const supabase = createSupabaseServerClient();

  const { data: rowsRaw } = await supabase
    .from('services')
    .select('id, name, category, description_md, duration_minutes, price_range, medical_procedure_code, geo_visible, created_at, updated_at')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null)
    .order('category', { ascending: true })
    .order('created_at', { ascending: false });

  const rows = (rowsRaw ?? []) as ServiceRow[];
  const visibleCount = rows.filter((r) => r.geo_visible).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="服务目录"
        subtitle={`${rows.length} 项 · ${visibleCount} 已公开 — 每项一条 schema.org/MedicalProcedure 或 Service`}
        actions={
          <Link
            href={`/t/${tenant.slug}/discoverability`}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            ← 可发现层
          </Link>
        }
      />
      <ServicesTable tenantSlug={tenant.slug} rows={rows} />
    </div>
  );
}
