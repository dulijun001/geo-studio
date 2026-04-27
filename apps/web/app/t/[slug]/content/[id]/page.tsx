import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireTenantMember } from '@/lib/tenant';
import { GenerateVariantsForm } from './generate-variants-form';
import { DeriveForm } from './derive-form';

export const dynamic = 'force-dynamic';

type VariantRow = {
  id: string;
  platform: string;
  title: string;
  body: string;
  status: string;
  compliance_status: string;
  geo_tactics: string[];
  extra_assets: { llm_provider?: string; notes?: string } | null;
  created_at: string;
};

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

  const { data: variants } = await supabase
    .from('content_variants')
    .select(
      'id, platform, title, body, status, compliance_status, geo_tactics, extra_assets, created_at',
    )
    .eq('content_item_id', params.id)
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  const variantRows = (variants ?? []) as VariantRow[];

  const canEdit = (['owner', 'admin', 'operator'] as const).includes(
    tenant.role as 'owner' | 'admin' | 'operator',
  );
  const generateDisabled = !canEdit || item.status === 'draft';
  const disabledReason = !canEdit
    ? '你的角色无权生成变体。'
    : item.status === 'draft'
      ? '内容正在解析,请等解析完成后再生成变体。'
      : undefined;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/t/${tenant.slug}/content`}
          className="text-xs text-muted-foreground hover:underline"
        >
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

      {canEdit && item.status === 'ai_drafted' && item.markdown ? (
        <section className="space-y-3">
          <DeriveForm tenantSlug={tenant.slug} contentItemId={item.id} />
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-medium">生成平台变体</h2>
        <GenerateVariantsForm
          tenantSlug={tenant.slug}
          contentItemId={item.id}
          disabled={generateDisabled}
          disabledReason={disabledReason}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-medium">已生成变体</h2>
          <span className="text-xs text-muted-foreground">{variantRows.length} 条</span>
        </div>
        {variantRows.length > 0 ? (
          <VariantsTable variants={variantRows} tenantSlug={tenant.slug} />
        ) : (
          <p className="rounded-md border border-dashed border-border bg-muted/20 p-5 text-sm text-muted-foreground">
            还没生成过变体。上面选目标平台点"生成"即可。
          </p>
        )}
      </section>
    </div>
  );
}

function VariantsTable({ variants, tenantSlug }: { variants: VariantRow[]; tenantSlug: string }) {
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">平台</th>
            <th className="px-4 py-2 font-medium">标题</th>
            <th className="px-4 py-2 font-medium">GEO 技法</th>
            <th className="px-4 py-2 font-medium">合规</th>
            <th className="px-4 py-2 font-medium">生成于</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {variants.map((v) => (
            <tr key={v.id} className="hover:bg-muted/30">
              <td className="px-4 py-2.5 text-xs uppercase tracking-wider text-muted-foreground">
                {v.platform.replace(/_/g, ' ')}
                {v.extra_assets?.llm_provider === 'stub' && (
                  <span className="ml-1.5 rounded-sm bg-amber-100 px-1 text-[10px] text-amber-800">
                    STUB
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5">
                <Link
                  href={`/t/${tenantSlug}/compliance/${v.id}`}
                  className="font-medium hover:underline"
                >
                  {v.title}
                </Link>
                <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                  {v.body.slice(0, 120)}
                  {v.body.length > 120 && '…'}
                </p>
              </td>
              <td className="px-4 py-2.5 text-xs text-muted-foreground">
                <div className="flex flex-wrap gap-1">
                  {v.geo_tactics.slice(0, 3).map((t) => (
                    <span key={t} className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px]">
                      {t.replace(/_/g, ' ')}
                    </span>
                  ))}
                  {v.geo_tactics.length > 3 && (
                    <span className="text-[10px]">+{v.geo_tactics.length - 3}</span>
                  )}
                </div>
              </td>
              <td className="px-4 py-2.5">
                <ComplianceBadge status={v.compliance_status} />
              </td>
              <td className="px-4 py-2.5 text-xs text-muted-foreground">
                {new Date(v.created_at).toLocaleString('zh-CN')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ComplianceBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    pending: { label: '审查中', className: 'bg-amber-100 text-amber-800' },
    rejected: { label: '已拒绝', className: 'bg-rose-100 text-rose-800' },
    auto_approved: { label: '自动通过', className: 'bg-emerald-100 text-emerald-800' },
    manual_approved: { label: '人工通过', className: 'bg-emerald-100 text-emerald-800' },
  };
  const c = config[status] ?? { label: status, className: 'bg-muted' };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.className}`}>
      {c.label}
    </span>
  );
}
