import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireTenantMember } from '@/lib/tenant';
import { PageHeader } from '@/components/page-header';
import { InlineGuide } from '@/components/inline-guide';
import { fmtDateTime } from '@/lib/format';
import { UploadForm } from './upload-form';
import { AiDraftForm } from './ai-draft-form';
import { QueryMatrixForm } from './query-matrix-form';

export const dynamic = 'force-dynamic'; // Always fresh status after uploads

export default async function ContentPage({ params }: { params: { slug: string } }) {
  const tenant = await requireTenantMember(params.slug);
  const canEdit = (['owner', 'admin', 'operator'] as const).includes(
    tenant.role as 'owner' | 'admin' | 'operator',
  );

  const supabase = createSupabaseServerClient();
  const { data: items } = await supabase
    .from('content_items')
    .select('id, title, source_type, status, topics, created_at, markdown')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <div className="space-y-6">
      <PageHeader
        title="内容"
        subtitle="上传素材或 AI 基于知识库生成,系统自动解析为 markdown 供下游 GEO 改写"
        actions={
          canEdit ? (
            <div className="flex items-center gap-2">
              <Link
                href={`/t/${tenant.slug}/content/batch`}
                className="inline-flex items-center gap-1 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
              >
                ⚡ 今日批量生成
              </Link>
              <Link
                href={`/t/${tenant.slug}/content/wizard`}
                className="inline-flex items-center gap-1 rounded-md border border-foreground bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
              >
                ✦ 创作向导
              </Link>
              <QueryMatrixForm tenantSlug={tenant.slug} />
              <AiDraftForm tenantSlug={tenant.slug} />
              <UploadForm tenantSlug={tenant.slug} />
            </div>
          ) : undefined
        }
      />

      <InlineGuide
        storageKey={`guide:content:${tenant.slug}`}
        title="为什么从「上传素材」开始?"
        body="GEO 改写的质量上限取决于源素材。建议上传医院已有的科普文章、临床指南、医生访谈、典型病例(脱敏)— 这些事实密度高的素材改写后引用率明显更好。AI 生成 + AI 改写质量会一代不如一代。"
        steps={[
          '点右上角「上传文件」选 .docx / .pdf / .md / .txt',
          '系统自动解析为 markdown(异步,通常 10-30 秒)',
          '点列表里某条 → 进详情页选平台改写,下一步进合规审核',
        ]}
      />

      {items && items.length > 0 ? (
        <ContentTable items={items} canEdit={canEdit} />
      ) : (
        <EmptyState canEdit={canEdit} />
      )}
    </div>
  );
}

type Item = {
  id: string;
  title: string;
  source_type: string;
  status: string;
  topics: string[];
  created_at: string;
  markdown: string;
};

function ContentTable({ items, canEdit: _canEdit }: { items: Item[]; canEdit: boolean }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[42rem] text-sm">
        <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">标题</th>
            <th className="px-4 py-2 font-medium">类型</th>
            <th className="px-4 py-2 font-medium">状态</th>
            <th className="px-4 py-2 font-medium">字数</th>
            <th className="px-4 py-2 font-medium">创建时间</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((it) => (
            <tr key={it.id} className="hover:bg-muted/30">
              <td className="px-4 py-2.5">
                <Link href={`./content/${it.id}`} className="font-medium hover:underline">
                  {it.title}
                </Link>
              </td>
              <td className="px-4 py-2.5 text-xs uppercase tracking-wider text-muted-foreground">
                {it.source_type}
              </td>
              <td className="px-4 py-2.5">
                <StatusBadge status={it.status} />
              </td>
              <td className="px-4 py-2.5 text-xs text-muted-foreground">
                {it.markdown ? it.markdown.length.toLocaleString() : '—'}
              </td>
              <td className="px-4 py-2.5 text-xs text-muted-foreground">
                {fmtDateTime(it.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    draft: { label: '待解析', className: 'bg-amber-500/[0.10] text-amber-300 border border-amber-500/30' },
    ai_drafted: { label: 'AI 草稿', className: 'bg-emerald-500/[0.12] text-emerald-300 border border-emerald-500/30' },
    parsed: { label: '已解析', className: 'bg-emerald-500/[0.12] text-emerald-300 border border-emerald-500/30' },
    variant_generated: { label: '已改写', className: 'bg-sky-500/[0.10] text-sky-300 border border-sky-500/30' },
    archived: { label: '已归档', className: 'bg-muted text-muted-foreground' },
  };
  const c = config[status] ?? { label: status, className: 'bg-muted' };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.className}`}>
      {c.label}
    </span>
  );
}

function EmptyState({ canEdit }: { canEdit: boolean }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/20 p-10 text-center">
      <p className="mb-2 font-medium">还没有任何内容</p>
      <p className="text-sm text-muted-foreground">
        {canEdit
          ? '点右上角「上传文件」把医院已有的 Word / PDF 传进来开始。'
          : '等 operator 或 admin 上传内容后,你会在这里看到列表。'}
      </p>
    </div>
  );
}
