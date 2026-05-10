/**
 * V1.9 — Batch AI-draft entry page.
 *
 * Picks today's selection of questions + platforms + audience and dispatches
 * N×M generations to the worker. Per the matrix-design analysis (10 articles
 * × 3 platforms = 30 daily tasks, one per staff), this page is the daily
 * "今日生成" launchpad.
 */
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/tenant';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { PageHeader } from '@/components/page-header';
import { InlineGuide } from '@/components/inline-guide';
import { BatchForm } from './batch-form';

export const dynamic = 'force-dynamic';

type QuestionRow = {
  id: string;
  text: string;
  priority: number | null;
};

type WritingTplRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_system: boolean;
};

export default async function BatchPage({ params }: { params: { slug: string } }) {
  const tenant = await requireRole(params.slug, ['owner', 'admin', 'operator']);
  if (!tenant) notFound();

  // Use service client throughout — admin pages run under HMAC cookie, not
  // Supabase auth, so user-bound RLS would return zero rows (D11).
  const service = getSupabaseServiceClient();

  // Top 30 priority questions for the operator to hand-pick from.
  const [questionsRes, systemTplRes, customTplRes] = await Promise.all([
    service
      .from('questions')
      .select('id, text, priority')
      .eq('tenant_id', tenant.id)
      .eq('active', true)
      .is('deleted_at', null)
      .order('priority', { ascending: false, nullsFirst: false })
      .limit(30),
    service
      .from('writing_templates')
      .select('id, slug, name, description, is_system')
      .is('tenant_id', null)
      .eq('visible', true)
      .is('deleted_at', null)
      .order('name', { ascending: true }),
    service
      .from('writing_templates')
      .select('id, slug, name, description, is_system')
      .eq('tenant_id', tenant.id)
      .eq('visible', true)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false }),
  ]);

  const questions = (questionsRes.data ?? []) as QuestionRow[];
  const templates = [
    ...((systemTplRes.data ?? []) as WritingTplRow[]),
    ...((customTplRes.data ?? []) as WritingTplRow[]),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="批量起草"
        subtitle="一次提交 N 题 × M 平台,后台并发 5 路跑,完成自动入派单池。"
      />

      <InlineGuide
        storageKey="guide:content-batch"
        title="什么时候用这个页面"
        body="每天只点一次:勾选今天要写的 5-10 个选题 + 三个目标平台,一次性生成 15-30 篇主稿。worker 完成后自动级联 variant_generate → 合规审查 → 派单。"
        steps={[
          '同源不要发到多个号(平台风控判搬运)— 所以一个 (题, 平台) 只生成 1 篇',
          '失败的 item 在进度页可单条重试,不影响其他 item',
          'LLM 并发上限 5,30 任务约 5-8 分钟跑完',
        ]}
      />

      {questions.length === 0 ? (
        <div className="rounded border border-amber-500/30 bg-amber-500/[0.10] p-4 text-sm text-amber-200">
          问题库还没有问题,先到「问题库」录一些再回来批量起草。
        </div>
      ) : (
        <BatchForm
          tenantSlug={tenant.slug}
          questions={questions}
          templates={templates}
        />
      )}
    </div>
  );
}
