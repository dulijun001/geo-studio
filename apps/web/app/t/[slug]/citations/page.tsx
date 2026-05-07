import Link from 'next/link';
import { requireRole } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { InlineGuide } from '@/components/inline-guide';
import { PageHeader } from '@/components/page-header';
import { CitationsUI, type CitationRow } from './citations-ui';

export const dynamic = 'force-dynamic';

export default async function CitationsPage({
  params,
}: {
  params: { slug: string };
}) {
  const tenant = await requireRole(params.slug, ['owner', 'admin', 'operator']);
  const supabase = createSupabaseServerClient();

  const { data: rows } = await supabase
    .from('verified_citations')
    .select(
      'id, title, title_aliases, source_type, issuer, publication_year, url, notes, key_claims, active, updated_at',
    )
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });

  const citations = (rows ?? []) as CitationRow[];

  // Tally how many citations actually have key_claims filled — drives the
  // "C1 LLM 裁判 N/M 条已激活" badge so operators see the gap.
  const claimsFilled = citations.filter((c) => (c.key_claims?.length ?? 0) > 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="引用源白名单"
        subtitle={`${citations.length} 条引用源 · ${claimsFilled} 条已配置 key_claims(C1 数字幻觉裁判依赖)`}
        actions={
          <Link
            href={`/t/${tenant.slug}/citations/discover`}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background transition hover:opacity-90"
          >
            🔍 自动发现引用源
          </Link>
        }
      />

      <InlineGuide
        storageKey={`guide:citations:${tenant.slug}`}
        title="什么是引用源 + 为什么要填 key_claims"
        body={
          '引用源白名单 = 「内容里允许出现的具名指南/学会/政府文件」。AI 生成时,prompt 强约束只能引这些;变体落库后第二道扫描验证 — 出现非白名单的《...》= suspected_hallucination,会拦下来。\n\n' +
          'key_claims(关键陈述)是这条引用源里"运营人确认过"的真实数据点(例如《ITI 指南》第 3 章原文:"种植体 5 年存活率 92-98%")。AI 生成里出现引用 + 数字时,**C1 数字幻觉裁判**会用这些 ground truth 去 LLM-judge,判定文中数字与原文是否一致。' +
          '不填 key_claims = C1 完全失活(只能走启发式拦绝对化用语,不能识别"借真书名包假数据")。'
        }
        steps={[
          '至少给 5-10 条最常用引用源填 2-3 条 key_claims(例:"种植体 5 年存活率 92-98%")',
          'key_claims 越具体越好(带数据 + 章节出处)',
          '已发布过的内容里出现的指南名,如未在白名单里,要么补进来,要么改写',
        ]}
      />

      <CitationsUI tenantSlug={tenant.slug} rows={citations} />
    </div>
  );
}
