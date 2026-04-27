'use server';

import PgBoss from 'pg-boss';
import { revalidatePath } from 'next/cache';
import { chat, isAvailable as llmAvailable } from '@geo/geo-core';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/current-user';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { requireRole } from '@/lib/tenant';

/**
 * Edit a variant's title/body and re-queue compliance review.
 *
 * Available while the variant has not been dispatched yet — once it's in a
 * staff member's hands, content drift would mean the post they're publishing
 * doesn't match what we approved. Reset compliance_status to 'pending' and
 * re-enqueue the worker job so the new text gets scanned + LLM-reviewed.
 */
export async function updateVariantContent(
  tenantSlug: string,
  variantId: string,
  title: string,
  body: string,
): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const t = title.trim();
  const b = body.trim();
  if (t.length < 4) throw new Error('标题至少 4 字');
  if (b.length < 30) throw new Error('正文至少 30 字');
  if (b.length > 20000) throw new Error('正文超过 20000 字,请精简');

  const service = getSupabaseServiceClient();

  const { data: variant, error: vErr } = await service
    .from('content_variants')
    .select('id, tenant_id, status')
    .eq('id', variantId)
    .eq('tenant_id', tenant.id)
    .single();
  if (vErr || !variant) throw new Error('变体不存在');
  if (['dispatched', 'published'].includes(variant.status)) {
    throw new Error('已派发或已发布的变体不能再改文案,以免和员工手里的版本不一致');
  }

  const { error: upErr } = await service
    .from('content_variants')
    .update({
      title: t,
      body: b,
      status: 'draft',
      compliance_status: 'pending',
      compliance_review_id: null,
    })
    .eq('id', variantId);
  if (upErr) throw new Error(`保存失败: ${upErr.message}`);

  // Re-queue compliance review.
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    const boss = new PgBoss({ connectionString: databaseUrl, schema: 'pgboss' });
    await boss.start();
    try {
      await boss.createQueue('compliance.review');
      await boss.send('compliance.review', { variant_id: variantId, tenant_id: tenant.id });
    } finally {
      await boss.stop({ graceful: true, timeout: 5000 });
    }
  }

  await service.from('audit_logs').insert({
    tenant_id: tenant.id,
    action: 'content.variant_edited',
    target_type: 'content_variant',
    target_id: variantId,
    payload: { title_len: t.length, body_len: b.length },
  });

  revalidatePath(`/t/${tenantSlug}/compliance/${variantId}`);
  revalidatePath(`/t/${tenantSlug}/compliance`);
}

/**
 * Stage-3 manual approval. Records a `manual` compliance_review, flips variant
 * state, writes audit trail.
 *
 * Only owner/admin/auditor can approve. Auditor is deliberately included so
 * medical-compliance consultants can be given a narrow-scope seat.
 */
export async function approveVariant(
  tenantSlug: string,
  variantId: string,
  rationale: string,
): Promise<void> {
  await transition(tenantSlug, variantId, 'approve', rationale);
}

export async function rejectVariant(
  tenantSlug: string,
  variantId: string,
  reason: string,
): Promise<void> {
  if (reason.trim().length < 3) {
    throw new Error('请填写拒绝原因(至少 3 字),方便运营收到打回后改稿。');
  }
  await transition(tenantSlug, variantId, 'reject', reason);
}

/**
 * Batch approve / reject many variants at once.
 *
 * Failures are isolated per row so one bad ID doesn't lose the whole submit.
 * Returns the count succeeded + a list of (id, error) pairs the UI can display.
 */
export async function bulkReviewVariants(
  tenantSlug: string,
  variantIds: string[],
  verb: 'approve' | 'reject',
  rationale: string,
): Promise<{ succeeded: number; failed: Array<{ id: string; error: string }> }> {
  if (variantIds.length === 0) throw new Error('请先勾选变体');
  if (variantIds.length > 200) throw new Error('一次最多处理 200 条,请分批');
  if (verb === 'reject' && rationale.trim().length < 3) {
    throw new Error('请填写拒绝原因(至少 3 字)');
  }
  await requireRole(tenantSlug, ['owner', 'admin', 'auditor']);

  let succeeded = 0;
  const failed: Array<{ id: string; error: string }> = [];
  for (const id of variantIds) {
    try {
      await transition(tenantSlug, id, verb, rationale);
      succeeded += 1;
    } catch (e) {
      failed.push({ id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { succeeded, failed };
}

async function transition(
  tenantSlug: string,
  variantId: string,
  verb: 'approve' | 'reject',
  rationale: string,
): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'auditor']);
  const supabase = createSupabaseServerClient();
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthenticated');

  // Reload variant to verify it belongs to this tenant AND hasn't already been finalized by someone else.
  const { data: variant, error: vErr } = await supabase
    .from('content_variants')
    .select('id, tenant_id, compliance_status')
    .eq('id', variantId)
    .single();
  if (vErr || !variant) throw new Error(`Variant not found: ${vErr?.message}`);
  if (variant.tenant_id !== tenant.id) throw new Error('Tenant mismatch');
  if (
    variant.compliance_status === 'manual_approved' ||
    variant.compliance_status === 'rejected'
  ) {
    throw new Error(`变体已经处于终态 (${variant.compliance_status}),不能再改。`);
  }

  const verdict = verb === 'approve' ? 'pass' : 'reject';
  const risk_level = verb === 'approve' ? 'low' : 'high';

  const { data: review, error: rErr } = await supabase
    .from('compliance_reviews')
    .insert({
      tenant_id: tenant.id,
      target_type: 'content_variant',
      target_id: variantId,
      stage: 'manual',
      verdict,
      risk_level,
      findings: [],
      reviewer_id: user.id,
      rationale,
    })
    .select('id')
    .single();
  if (rErr || !review) throw new Error(`Insert review: ${rErr?.message}`);

  const newComplianceStatus = verb === 'approve' ? 'manual_approved' : 'rejected';
  const newVariantStatus = verb === 'approve' ? 'manual_approved' : 'rejected';

  const { error: upErr } = await supabase
    .from('content_variants')
    .update({
      compliance_status: newComplianceStatus,
      compliance_review_id: review.id,
      status: newVariantStatus,
    })
    .eq('id', variantId);
  if (upErr) throw new Error(`Update variant: ${upErr.message}`);

  await supabase.from('audit_logs').insert({
    tenant_id: tenant.id,
    actor_user_id: user.id,
    action: verb === 'approve' ? 'compliance.manual_approve' : 'compliance.manual_reject',
    target_type: 'content_variant',
    target_id: variantId,
    payload: { review_id: review.id, rationale },
  });

  revalidatePath(`/t/${tenantSlug}/compliance`);
  revalidatePath(`/t/${tenantSlug}/compliance/${variantId}`);
}

// ============================================================================
// AI rewrite (V1.6-1)
//
// When a variant is rejected by compliance review, give the admin a one-click
// "let AI rewrite this" path: feed the original body + the keyword findings
// to the LLM with a strict rewrite-for-compliance prompt, replace the body,
// reset compliance_status, and re-enqueue the review job.
//
// Audit-logged. Original body preserved in audit payload so we can roll back.
// ============================================================================

type Finding = {
  term: string;
  level: 'A' | 'B';
  category: string;
  matched_span?: string;
  context_snippet?: string;
};

const REWRITE_SYSTEM = `你是医疗行业合规改写专家。把违规文案改写为合规版本,严格遵守:

1. 不引入新违规词:绝对化(最/第一/独家/根治/包治)、效果承诺(保证/100%/治愈率/无效退款/永久/立竿见影)、夸大安全(无痛/零风险/绝对安全/无并发症)、违规比较(比XX好/碾压同行)、恐吓营销(不治后果严重/再不治就晚了)
2. 替代策略:
   - "最好" → "适合的" / "经过验证的"
   - "保证" → "在严格遵循医嘱的前提下"
   - "100%成功率" → "X 年存留率约 XX%(数据来源:具体研究/指南)"
   - "无痛" → "舒适化技术 + 局部麻醉,大幅减轻不适"
   - "比XX好" → 删除直接比较,改为陈述自身特点
3. 保留原文事实:数字、医生姓名、诊疗细节不要改;只改违规表述
4. 保留结构和大致字数(±20%)
5. 保留平台调性(如小红书的痛点开头/列表)`;

export async function aiRewriteVariant(
  tenantSlug: string,
  variantId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'auditor']);
  if (!llmAvailable()) {
    throw new Error('LLM 未配置(ARK_API_KEY 缺失),无法 AI 改写');
  }

  const service = getSupabaseServiceClient();

  // Load variant + most recent rejecting review with findings
  const { data: variant, error: vErr } = await service
    .from('content_variants')
    .select('id, tenant_id, title, body, platform, status, compliance_status')
    .eq('id', variantId)
    .single();
  if (vErr || !variant) throw new Error('变体不存在');
  if (variant.tenant_id !== tenant.id) throw new Error('Tenant mismatch');
  if (variant.compliance_status !== 'rejected') {
    throw new Error('只有被拒绝的变体才能 AI 改写');
  }
  if (['dispatched', 'published'].includes(variant.status)) {
    throw new Error('已派发或发布的变体不能再改');
  }

  // Pull findings from the most recent keyword stage review (LLM stage may have
  // reasoning text but keyword findings have the term-level evidence we need).
  const { data: reviews } = await service
    .from('compliance_reviews')
    .select('stage, findings, rationale, created_at')
    .eq('target_id', variantId)
    .eq('target_type', 'content_variant')
    .order('created_at', { ascending: false });
  const latestKeyword = (reviews ?? []).find((r) => r.stage === 'keyword');
  const findings: Finding[] = (latestKeyword?.findings as Finding[] | null) ?? [];

  const llmRationale =
    (reviews ?? []).find((r) => r.stage === 'llm')?.rationale ??
    (reviews ?? []).find((r) => r.stage === 'manual')?.rationale ??
    null;

  // Build user prompt
  const findingsBlock = findings.length
    ? findings
        .map(
          (f, i) =>
            `${i + 1}. 「${f.term}」(类别: ${f.category}, ${f.level} 级)${f.context_snippet ? ` — 上下文: "${f.context_snippet.slice(0, 80)}"` : ''}`,
        )
        .join('\n')
    : '(关键词扫描无具体命中,改写时综合考虑 LLM 评审意见)';

  const userPrompt =
    `# 任务\n` +
    `把下列被拒绝的医疗营销文案改写为合规版本。\n\n` +
    `# 平台\n${variant.platform}\n\n` +
    `# 原始标题\n${variant.title}\n\n` +
    `# 原始正文\n${variant.body}\n\n` +
    `# 合规扫描发现的违规词\n${findingsBlock}\n\n` +
    (llmRationale ? `# LLM 审查意见\n${llmRationale}\n\n` : '') +
    `# 输出 JSON\n` +
    `- title: 合规改写后的标题(可保持不变,只要不违规)\n` +
    `- body: 合规改写后的正文(markdown,字数与原文 ±20%)\n` +
    `- changes: 列出主要替换(原词 → 替代词)的字符串数组\n`;

  let parsed: { title?: string; body?: string; changes?: string[] };
  try {
    const result = await chat({
      messages: [
        { role: 'system', content: REWRITE_SYSTEM },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.5,
      max_tokens: 3000,
      response_format: 'json_object',
      timeout_ms: 180_000,
    });
    parsed = JSON.parse(result.content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: /abort/i.test(msg)
        ? 'AI 超时未返回,请稍后重试'
        : `AI 调用失败: ${msg.slice(0, 100)}`,
    };
  }

  const newBody = parsed.body?.trim() ?? '';
  const newTitle = parsed.title?.trim() || variant.title;
  if (newBody.length < 30) {
    return { ok: false, reason: 'AI 返回正文过短(< 30 字),改写失败' };
  }

  const supabase = createSupabaseServerClient();
  const user = await getCurrentUser();

  // Update variant: replace body + reset compliance state
  const { error: upErr } = await service
    .from('content_variants')
    .update({
      title: newTitle,
      body: newBody,
      status: 'draft',
      compliance_status: 'pending',
      compliance_review_id: null,
    })
    .eq('id', variantId);
  if (upErr) {
    return { ok: false, reason: `保存失败: ${upErr.message}` };
  }

  await service.from('audit_logs').insert({
    tenant_id: tenant.id,
    actor_user_id: user?.id ?? null,
    action: 'compliance.ai_rewrite',
    target_type: 'content_variant',
    target_id: variantId,
    payload: {
      original_title: variant.title,
      original_body: variant.body,
      changes: parsed.changes ?? [],
      findings_count: findings.length,
    },
  });

  // Re-enqueue compliance review for the new body
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    const boss = new PgBoss({ connectionString: databaseUrl, schema: 'pgboss' });
    await boss.start();
    try {
      await boss.createQueue('compliance.review');
      await boss.send('compliance.review', {
        variant_id: variantId,
        tenant_id: tenant.id,
        triggered_by: user?.id ?? null,
      });
    } finally {
      await boss.stop({ graceful: true, timeout: 5000 });
    }
  }

  revalidatePath(`/t/${tenantSlug}/compliance`);
  revalidatePath(`/t/${tenantSlug}/compliance/${variantId}`);
  return { ok: true };
}
