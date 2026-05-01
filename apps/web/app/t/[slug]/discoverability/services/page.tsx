import Link from 'next/link';
import { requireRole } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { InlineGuide } from '@/components/inline-guide';
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

      <InlineGuide
        storageKey={`guide:disco-services:${tenant.slug}`}
        title="这页是干嘛的"
        body={'维护医院 / 诊所提供的「服务项」目录:种植牙、正畸、儿牙、美白等核心项目。每条服务都会变成一份 schema.org/MedicalProcedure 给 AI 引擎读,在 llms.txt + feed 里也会出现。带价格区间的服务在豆包答「贵不贵」类问题时更容易被引用。'}
        steps={[
          '"+ 新增服务"创建一项 — 至少填名称 + 分类',
          '价格留空 = "面诊报价";填了 min/typical/max 会按 ¥xx,xxx-xx,xxx 格式展示',
          '勾"公开"后下次重建 artifact 就会出现在公开 URL 里;不勾 = 内部记录,不外放',
        ]}
        linkLabel="可发现层完整设计"
        linkHref={`/t/${tenant.slug}/help#discoverability`}
      />

      <ServicesTable tenantSlug={tenant.slug} rows={rows} />
    </div>
  );
}
