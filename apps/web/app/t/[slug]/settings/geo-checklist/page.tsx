import Link from 'next/link';
import { requireRole } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { InlineGuide } from '@/components/inline-guide';
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

      <InlineGuide
        storageKey={`guide:geo-checklist:${tenant.slug}`}
        title="这页是干嘛的"
        body={'豆包 / 元宝答「南京哪家诊所」这类问题时,引用源 90% 来自这几张牌:百度百科 / 搜狗百科 / 高德 POI / 百度地图 POI / 大众点评。这页让你勾选 + 维护这些「基础设施」的当下状态。没建百科 = 在豆包答案里几乎拿不到品牌引用,这是先行条件,得先把这几张表立起来再说后面。'}
        steps={[
          '逐项勾选已经建好的:百度百科 ✓ / 搜狗百科 ✓ / 高德 POI ✓ / 百度 POI ✓',
          '大众点评:填实际分数 + 评价数量(评价 < 50 条 = 信号弱)',
          '没建的尽快补 — 百科类自助提交,POI 高德百度都是免费认领,点评把分做到 4.5+',
        ]}
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
