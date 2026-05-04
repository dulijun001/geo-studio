import { requireRole } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { InlineGuide } from '@/components/inline-guide';
import { PageHeader } from '@/components/page-header';
import { KeywordsUI, type GroupRow, type KeywordRow } from './keywords-ui';

export const dynamic = 'force-dynamic';

export default async function KeywordsPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { group?: string };
}) {
  const tenant = await requireRole(params.slug, ['owner', 'admin', 'operator']);
  const supabase = createSupabaseServerClient();

  const [groupsRes, kwRes] = await Promise.all([
    supabase
      .from('keyword_groups')
      .select('id, name, parent_id')
      .eq('tenant_id', tenant.id)
      .is('deleted_at', null)
      .order('name', { ascending: true }),
    supabase
      .from('keywords')
      .select('id, group_id, text, source, intent, created_at')
      .eq('tenant_id', tenant.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(2000),
  ]);

  const groups = (groupsRes.data ?? []) as GroupRow[];
  const keywords = (kwRes.data ?? []) as KeywordRow[];
  const selectedGroupId = searchParams.group ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="关键词词库"
        subtitle={`${groups.length} 个分组 · ${keywords.length} 个关键词`}
      />

      <InlineGuide
        storageKey={`guide:keywords:${tenant.slug}`}
        title="什么是关键词词库"
        body={
          '关键词词库 = "我们要在 GEO 内容里反复植入的目标搜索词"。' +
          '在创作向导第 2 步选词后,AI 起草会把它们自然嵌入正文。三种拓词方式:' +
          '手动粘贴(已有词)、6 维组合(笛卡尔积长尾)、AI 智能挖掘(豆包扩 50 候选,自动过合规黑名单)。'
        }
        steps={[
          '按行业 / 项目 / 客户分组,主题聚焦',
          '冷启动建议先 AI 智能挖掘(输入"种植牙"等核心词),50 候选过完合规筛一筛',
          '不要堆几千个词 — 聚焦的几十个长尾词价值远超几千个杂词',
        ]}
        linkLabel="架构决策 ADR-007"
        linkHref={`/t/${tenant.slug}/help#keywords`}
      />

      <KeywordsUI
        tenantSlug={tenant.slug}
        groups={groups}
        keywords={keywords}
        selectedGroupId={selectedGroupId}
      />
    </div>
  );
}
