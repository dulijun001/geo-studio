import Link from 'next/link';
import { requireRole } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/page-header';
import { ChecklistForm } from './checklist-form';
import type { GeoChecklistInput } from './actions';

export const dynamic = 'force-dynamic';

const EMPTY: GeoChecklistInput = {
  baidu_baike: false,
  souguo_baike: false,
  amap_poi: false,
  baidu_map_poi: false,
  dianping_score: 0,
  dianping_reviews: 0,
};

export default async function GeoChecklistPage({
  params,
}: {
  params: { slug: string };
}) {
  const tenant = await requireRole(params.slug, ['owner', 'admin']);
  const supabase = createSupabaseServerClient();

  const { data: brand } = await supabase
    .from('brands')
    .select('location')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  const stored =
    (((brand?.location as Record<string, unknown> | null) ?? {}).geo_checklist as
      | Partial<GeoChecklistInput>
      | undefined) ?? {};
  const initial: GeoChecklistInput = { ...EMPTY, ...stored };

  return (
    <div className="space-y-6">
      <PageHeader
        title="豆包 GEO · P0 / P1 维护"
        subtitle="实体认知 + 评价聚合是 GEO 的先决条件。这两层不达标,后面 GEO Studio 帮你产出再多内容,豆包都不会引用你。"
      />

      <ChecklistForm tenantSlug={tenant.slug} initial={initial} />

      <p className="text-xs text-muted-foreground">
        <Link href={`/t/${tenant.slug}/settings`} className="hover:underline">
          ← 返回设置
        </Link>
      </p>
    </div>
  );
}
