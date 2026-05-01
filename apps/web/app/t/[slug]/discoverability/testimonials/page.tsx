import Link from 'next/link';
import { requireRole } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/page-header';
import { fmtDateTime } from '@/lib/format';
import { TestimonialsTable } from './testimonials-table';

export const dynamic = 'force-dynamic';

type TestimonialRow = {
  id: string;
  author_pseudonym: string;
  body: string;
  rating: string | number | null;
  service_id: string | null;
  attested_at: string;
  compliance_status: 'pending' | 'approved' | 'rejected' | 'needs_review';
  geo_visible: boolean;
  updated_at: string;
};

type ServiceOption = { id: string; name: string };

export default async function TestimonialsListPage({
  params,
}: {
  params: { slug: string };
}) {
  const tenant = await requireRole(params.slug, ['owner', 'admin', 'operator', 'auditor']);
  const supabase = createSupabaseServerClient();

  const [{ data: rowsRaw }, { data: serviceRows }] = await Promise.all([
    supabase
      .from('testimonials')
      .select('id, author_pseudonym, body, rating, service_id, attested_at, compliance_status, geo_visible, updated_at')
      .eq('tenant_id', tenant.id)
      .is('deleted_at', null)
      .order('attested_at', { ascending: false }),
    supabase
      .from('services')
      .select('id, name')
      .eq('tenant_id', tenant.id)
      .is('deleted_at', null)
      .order('name', { ascending: true }),
  ]);

  const rows = (rowsRaw ?? []) as TestimonialRow[];
  const services = (serviceRows ?? []) as ServiceOption[];
  const stats = {
    pending: rows.filter((r) => r.compliance_status === 'pending').length,
    approved: rows.filter((r) => r.compliance_status === 'approved').length,
    visible: rows.filter((r) => r.geo_visible).length,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="客户见证"
        subtitle={`${rows.length} 条 · ${stats.pending} 待审 · ${stats.approved} 已通过 · ${stats.visible} 已公开`}
        actions={
          <Link
            href={`/t/${tenant.slug}/discoverability`}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            ← 可发现层
          </Link>
        }
      />

      <div className="rounded-md border border-amber-200 bg-amber-50/60 p-4 text-xs text-amber-900">
        <strong>合规闸(D16):</strong> 客户见证默认 pending 状态,不公开。需要先在"合规审核"
        标记为 approved 才能开 geo_visible。DB 触发器兜底(0018)— 即便代码绕过,DB 也会拒绝。
        所有 PII 不准存(姓名 / 手机 / 身份证 / 病历号),只用化名 + 城市 + 年龄段。
      </div>

      <TestimonialsTable tenantSlug={tenant.slug} rows={rows} services={services} />
    </div>
  );
}
