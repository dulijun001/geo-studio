import Link from 'next/link';
import { requireRole } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { InlineGuide } from '@/components/inline-guide';
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

      <InlineGuide
        storageKey={`guide:disco-faqs:${tenant.slug}`}
        title="这页是干嘛的"
        body={'维护医院 FAQ 问答库 — 医保 / 价格 / 流程 / 风险等高频问题。AI 引擎在答「XX 医院能用医保吗」这类直接问句时,会优先引用我们结构化的 FAQPage 数据,而不是去爬非结构化网页。覆盖率高的 FAQ 库 = 更多被引用机会。'}
        steps={[
          '建议至少 5-10 条:覆盖医保、典型价格区间、术后注意、儿童年龄要求等高频疑问',
          '用 markdown 写答案 — 列表 / 加粗 / 引用都支持',
          '默认全公开(FAQ 性质本身公开),特殊条目可关掉 geo_visible 仅内部参考',
        ]}
      />

      <FaqsTable tenantSlug={tenant.slug} rows={rows} />
    </div>
  );
}
