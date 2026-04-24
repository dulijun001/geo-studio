import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireTenantMember } from '@/lib/tenant';
import { UploadForm } from './upload-form';

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
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">内容</h1>
          <p className="text-sm text-muted-foreground">
            上传 Word / PDF / 纯文本,系统会自动解析为 markdown,供下游 GEO 改写使用。
          </p>
        </div>
        {canEdit && <UploadForm tenantSlug={tenant.slug} />}
      </header>

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
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-sm">
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
                {new Date(it.created_at).toLocaleString('zh-CN')}
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
    draft: { label: '待解析', className: 'bg-amber-100 text-amber-800' },
    parsed: { label: '已解析', className: 'bg-emerald-100 text-emerald-800' },
    variant_generated: { label: '已改写', className: 'bg-blue-100 text-blue-800' },
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
