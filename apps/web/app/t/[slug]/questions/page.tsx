/**
 * V1.9-2 — Question library admin page.
 */
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/tenant';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { PageHeader } from '@/components/page-header';
import { InlineGuide } from '@/components/inline-guide';
import { QuestionsUI, type QuestionRow } from './questions-ui';

export const dynamic = 'force-dynamic';

export default async function QuestionsPage({ params }: { params: { slug: string } }) {
  const tenant = await requireRole(params.slug, ['owner', 'admin', 'operator']);
  if (!tenant) notFound();

  // Service client — admin pages run under HMAC, RLS would 0-row.
  const service = getSupabaseServiceClient();

  const { data: rows } = await service
    .from('questions')
    .select('id, text, intent, city, category, priority, active, created_at, updated_at, parent_id, subtopic_source, expansion_seed_topic')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null)
    .order('priority', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  const questions = (rows ?? []) as QuestionRow[];
  const activeCount = questions.filter((q) => q.active).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="问题库"
        subtitle={`${questions.length} 条问题(${activeCount} 启用) · 批量起草页从这里挑选题`}
      />

      <InlineGuide
        storageKey={`guide:questions:${tenant.slug}`}
        title="问题库怎么用"
        body="问题库 = 用户在豆包/元宝/夸克等 AI 搜索里**真实会问**的问题清单。批量起草页直接从这里挑题派给员工。"
        steps={[
          '一篇文章 = 一个问题(用户搜索意图)。priority 越高越优先派单',
          '一天派 10 篇 → 至少要常备 50+ 启用问题(够 5 天 + 缓冲)',
          '点「🔍 AI 自动挖掘」让豆包基于行业 + 已有问题 gap 推荐 20 条',
          '或「📋 批量粘贴」每行一题,适合从竞品 SOV 报告直接 copy',
        ]}
      />

      <QuestionsUI tenantSlug={tenant.slug} rows={questions} />
    </div>
  );
}
