import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireTenantMember } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export default async function ContentDetailPage({
  params,
}: {
  params: { slug: string; id: string };
}) {
  const tenant = await requireTenantMember(params.slug);
  const supabase = createSupabaseServerClient();

  const { data: item } = await supabase
    .from('content_items')
    .select('id, title, source_type, status, topics, markdown, source_url, created_at, updated_at')
    .eq('id', params.id)
    .eq('tenant_id', tenant.id)
    .maybeSingle();

  if (!item) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/t/${tenant.slug}/content`} className="text-xs text-muted-foreground hover:underline">
          ← 返回内容列表
        </Link>
      </div>

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">{item.title}</h1>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="uppercase tracking-wider">{item.source_type}</span>
          <span>·</span>
          <span>{item.status}</span>
          <span>·</span>
          <span>创建于 {new Date(item.created_at).toLocaleString('zh-CN')}</span>
          <span>·</span>
          <span>更新于 {new Date(item.updated_at).toLocaleString('zh-CN')}</span>
        </div>
        {item.topics.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {item.topics.map((t: string) => (
              <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                {t}
              </span>
            ))}
          </div>
        )}
      </header>

      {item.status === 'draft' && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">正在解析中</p>
          <p className="mt-1 text-xs">Worker 正在处理这个文件。30 秒内刷新应该能看到内容。</p>
        </div>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-medium">正文(解析后)</h2>
        {item.markdown ? (
          <pre className="whitespace-pre-wrap rounded-md border border-border bg-background p-5 font-sans text-sm leading-relaxed">
            {item.markdown}
          </pre>
        ) : (
          <p className="rounded-md border border-dashed border-border bg-muted/20 p-5 text-sm text-muted-foreground">
            暂无内容。上传完成后 worker 会自动解析并填入。
          </p>
        )}
      </section>

      <section className="rounded-md border border-dashed border-border bg-muted/20 p-4 text-xs text-muted-foreground">
        <p className="mb-2 text-foreground font-medium">下一步(W3.3-W3.4)</p>
        <ul className="list-inside list-disc space-y-1">
          <li>编辑正文 + 打标签(话题、关键词、目标问题)</li>
          <li>按 GEO 9 法改写成多个平台变体(头条号、抖音脚本、公众号等)</li>
          <li>三道门合规审查后进入派单</li>
        </ul>
      </section>
    </div>
  );
}
