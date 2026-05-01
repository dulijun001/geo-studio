import Link from 'next/link';
import { requireRole } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { InlineGuide } from '@/components/inline-guide';
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

      <InlineGuide
        storageKey={`guide:disco-testimonials:${tenant.slug}`}
        title="这页是干嘛的"
        body={'录入客户对治疗的真实反馈,审核通过后挂到对外公开 URL,变成 schema.org/Review 给 AI 引擎读。豆包答「XX 医院靠谱吗」这类问题时,AI 会拉取这些 Review 的评分 + 摘要回答用户。'}
        steps={[
          '"+ 新增见证"录入一条 — 化名(L 女士 / 32 岁 / 南京)+ 内容 + 评分 + 见证日期',
          '默认状态是"待审"+不公开,审核通过(通过 / 拒绝按钮)后才能开公开',
          'DB 触发器兜底:即便手动改库,只要 compliance_status≠approved 就不允许 geo_visible=true',
        ]}
        linkLabel="合规四道门"
        linkHref={`/t/${tenant.slug}/help#compliance`}
      />

      <div className="rounded-md border border-amber-200 bg-amber-50/60 p-4 text-xs text-amber-900">
        <strong>⚠ 隐私红线:</strong> 所有 PII(姓名 / 手机 / 身份证 / 病历号)严禁存入。只用 <strong>化名 + 城市 + 年龄段</strong>。医疗个人信息保护法对此有明文约束,违反一次起罚十万。
      </div>

      <TestimonialsTable tenantSlug={tenant.slug} rows={rows} services={services} />
    </div>
  );
}
