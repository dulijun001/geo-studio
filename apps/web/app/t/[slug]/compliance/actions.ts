'use server';

import PgBoss from 'pg-boss';
import { revalidatePath } from 'next/cache';
import {
  buildRewriteHint,
  chat,
  isAvailable as llmAvailable,
  scoreGeo,
  type GeoScore,
} from '@geo/geo-core';
import { lookupNeedlesInKb } from '@/lib/kb-needle-lookup';
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
  options?: { acknowledgeUnverifiedCitations?: boolean },
): Promise<void> {
  await transition(tenantSlug, variantId, 'approve', rationale, options);
}

/**
 * Manual override on a rejected variant. Escape hatch for the case where the
 * automated four-gate flow rejects something the business needs to publish
 * (false positive / off-platform context / legal sign-off out of band).
 *
 * Deliberately stricter than approveVariant:
 *   - Role: owner|admin only. Auditor (legal) is excluded — they're typically
 *     the ones whose review WAS the rejection, so self-overriding their own
 *     no-go defeats the purpose.
 *   - Rationale ≥ 20 chars: regulator-readable, not "ok lgtm".
 *   - Distinct audit action: 'compliance.manual_override_approve'
 *     so dashboards can surface override rate separately from normal approvals.
 *
 * Bypasses transition()'s "already terminal" guard since that's literally the
 * state we're acting on.
 */
export async function overrideRejection(
  tenantSlug: string,
  variantId: string,
  rationale: string,
): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin']);
  if (rationale.trim().length < 20) {
    throw new Error('翻案理由至少 20 字 — 这是医疗合规底线,必须可追溯。');
  }
  const supabase = createSupabaseServerClient();
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthenticated');

  const { data: variant, error: vErr } = await supabase
    .from('content_variants')
    .select('id, tenant_id, compliance_status, compliance_review_id')
    .eq('id', variantId)
    .single();
  if (vErr || !variant) throw new Error('变体不存在');
  if (variant.tenant_id !== tenant.id) throw new Error('Tenant mismatch');
  if (variant.compliance_status !== 'rejected') {
    throw new Error(`只有 rejected 状态可翻案,当前: ${variant.compliance_status}`);
  }

  const { data: review, error: rErr } = await supabase
    .from('compliance_reviews')
    .insert({
      tenant_id: tenant.id,
      target_type: 'content_variant',
      target_id: variantId,
      stage: 'manual',
      verdict: 'pass',
      risk_level: 'low',
      findings: [],
      reviewer_id: user.id,
      rationale: `[OVERRIDE] ${rationale}`,
    })
    .select('id')
    .single();
  if (rErr || !review) throw new Error(`Insert review: ${rErr?.message}`);

  const { error: upErr } = await supabase
    .from('content_variants')
    .update({
      compliance_status: 'manual_approved',
      compliance_review_id: review.id,
      status: 'manual_approved',
    })
    .eq('id', variantId);
  if (upErr) throw new Error(`Update variant: ${upErr.message}`);

  await supabase.from('audit_logs').insert({
    tenant_id: tenant.id,
    actor_user_id: user.id,
    action: 'compliance.manual_override_approve',
    target_type: 'content_variant',
    target_id: variantId,
    payload: {
      review_id: review.id,
      rationale,
      previous_review_id: variant.compliance_review_id,
    },
  });

  revalidatePath(`/t/${tenantSlug}/compliance`);
  revalidatePath(`/t/${tenantSlug}/compliance/${variantId}`);
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
  options?: { acknowledgeUnverifiedCitations?: boolean },
): Promise<{ succeeded: number; failed: Array<{ id: string; error: string }> }> {
  if (variantIds.length === 0) throw new Error('请先勾选变体');
  if (variantIds.length > 200) throw new Error('一次最多处理 200 条,请分批');
  // CMP-1 — bulk approve also needs a real rationale so audit_log isn't a wall
  // of identical "批量人工通过" rows. Min 10 chars matches the operator effort
  // of one short sentence ("种植成功率数据已核对 + 公司新品发布合规审过").
  if (rationale.trim().length < 10) {
    const verbZh = verb === 'reject' ? '拒绝' : '通过';
    throw new Error(
      `请填写${verbZh}原因(≥10 字,会写进每条 audit_log;事后审计要看得懂)`,
    );
  }
  await requireRole(tenantSlug, ['owner', 'admin', 'auditor']);

  let succeeded = 0;
  const failed: Array<{ id: string; error: string }> = [];
  for (const id of variantIds) {
    try {
      // CMP-1 — bubble the hallucination acknowledgement through to each row.
      // Without it, transition() throws on suspected_hallucination variants
      // and the bulk job silently drops them to `failed[]` (just console.warn,
      // no UI surface). With it, the operator's explicit consent is recorded.
      await transition(tenantSlug, id, verb, rationale, options);
      succeeded += 1;
    } catch (e) {
      failed.push({ id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { succeeded, failed };
}

/**
 * CMP-1 — peek which of the selected variants need explicit acknowledgement
 * (suspected_hallucination), so the bulk UI can surface them BEFORE submitting
 * a 30-row job that silently skips half. Reads citation_check.verdict only.
 */
export async function inspectBulkHallucinations(
  tenantSlug: string,
  variantIds: string[],
): Promise<{ id: string; title: string; unmatched: number }[]> {
  if (variantIds.length === 0) return [];
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'auditor']);
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from('content_variants')
    .select('id, title, citation_check')
    .eq('tenant_id', tenant.id)
    .in('id', variantIds);
  const out: { id: string; title: string; unmatched: number }[] = [];
  for (const v of data ?? []) {
    const cc = v.citation_check as { verdict?: string; unmatched?: Array<unknown> } | null;
    if (cc?.verdict === 'suspected_hallucination' && (cc.unmatched?.length ?? 0) > 0) {
      out.push({
        id: v.id as string,
        title: (v.title as string) ?? '(无标题)',
        unmatched: cc.unmatched!.length,
      });
    }
  }
  return out;
}

async function transition(
  tenantSlug: string,
  variantId: string,
  verb: 'approve' | 'reject',
  rationale: string,
  options?: { acknowledgeUnverifiedCitations?: boolean },
): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'auditor']);
  const supabase = createSupabaseServerClient();
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthenticated');

  // Reload variant to verify it belongs to this tenant AND hasn't already been finalized by someone else.
  const { data: variant, error: vErr } = await supabase
    .from('content_variants')
    .select('id, tenant_id, compliance_status, citation_check')
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

  // Hallucination gate: variants with verdict=suspected_hallucination need
  // explicit acknowledgement. We allow approval (operator may have verified
  // out-of-band) but the action must record it as an explicit choice for
  // audit. Two paths accepted:
  //
  //   1. options.acknowledgeUnverifiedCitations === true (modern UI uses
  //      a dedicated checkbox — clear consent, recorded in audit_logs).
  //   2. rationale contains 核实|verified|手工|手动|确认 (legacy fallback
  //      for any pre-V1.7 callers that still pass the magic word).
  if (verb === 'approve') {
    const cc = variant.citation_check as
      | { verdict?: string; unmatched?: Array<{ needle: string }> }
      | null;
    if (cc?.verdict === 'suspected_hallucination' && (cc.unmatched?.length ?? 0) > 0) {
      const acknowledged =
        options?.acknowledgeUnverifiedCitations === true ||
        /核实|verified|手工|手动|确认/.test(rationale);
      if (!acknowledged) {
        throw new Error(
          `这条变体有 ${cc.unmatched!.length} 处可疑引用未通过白名单核实。请在审批面板勾选「我已手工核实」复选框后再批准。`,
        );
      }
    }
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

// ─────────────────────────────────────────────────────────────────────────
// GEO-score-driven rewrite (V1.7+)
//
// Different intent from aiRewriteVariant:
//   - aiRewriteVariant     : variant got REJECTED by compliance gates →
//                            rewrite to remove violation language. Locked
//                            to compliance_status='rejected'.
//   - aiRewriteForGeoScore : variant's GEO 9-tactic score < 70 → rewrite
//                            to lift the weakest 3 tactics. Works on any
//                            non-final state(pending / approved /
//                            rejected). Reuses buildRewriteHint(score)
//                            so the same advisor strings the UI banner
//                            shows are exactly what the LLM gets.
//
// Both rewrites reset compliance_status='pending' and re-enqueue a fresh
// four-gate review on the new body.
// ─────────────────────────────────────────────────────────────────────────

const GEO_REWRITE_SYSTEM = `你是一位医疗内容编辑助手。任务:基于「GEO 9 法」评分薄弱项,把一条已发布或已审通过的医疗营销文案改写得更容易被 AI 引擎(豆包/元宝/Perplexity 等)引用。

铁律:
1. 不引入任何医疗广告法 A 级违规词(如「根治」「永不复发」「最好」「第一」)
2. 不编造数据 / 引用 / 医生姓名 — 只在原文已有事实周围补充权威短语 + 句式重组
3. 保留原文事实数字、医生姓名、诊疗细节;不要改这些
4. 保留原文结构和大致字数(±20%)
5. 严格按 user 的"最弱项提示"针对性改写,不要全文重写`;

export async function aiRewriteForGeoScore(
  tenantSlug: string,
  variantId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator', 'auditor']);
  if (!llmAvailable()) {
    throw new Error('LLM 未配置(ARK_API_KEY 缺失),无法 AI 改写');
  }

  const service = getSupabaseServiceClient();

  const { data: variant, error: vErr } = await service
    .from('content_variants')
    .select('id, tenant_id, title, body, platform, status, compliance_status, geo_score, content_item_id')
    .eq('id', variantId)
    .single();
  if (vErr || !variant) throw new Error('变体不存在');
  if (variant.tenant_id !== tenant.id) throw new Error('Tenant mismatch');
  if (['dispatched', 'published'].includes(variant.status)) {
    return { ok: false, reason: '已派发或发布的变体不能再改 — 先撤回派单或废弃后重新生成' };
  }

  const geoScore = variant.geo_score as GeoScore | null;
  if (!geoScore || typeof geoScore.total !== 'number') {
    return { ok: false, reason: '该变体没有 GEO 评分,无法基于评分改写' };
  }

  // Fetch the source content_item to recover the primary keyword that the
  // original scorer used. Falls back to first 8 chars of title.
  let primaryKeyword = variant.title.slice(0, 8);
  if (variant.content_item_id) {
    const { data: item } = await service
      .from('content_items')
      .select('topics')
      .eq('id', variant.content_item_id)
      .maybeSingle();
    const topics = (item?.topics as string[] | null) ?? null;
    if (Array.isArray(topics) && topics.length > 0 && typeof topics[0] === 'string') {
      primaryKeyword = topics[0];
    }
  }

  const rewriteHint = buildRewriteHint(geoScore);

  const userPrompt =
    `# 任务\n基于下方"最弱项提示",对一条医疗营销文案做精准改写,提升其在 AI 搜索引擎里的被引概率。\n\n` +
    `# 平台\n${variant.platform}\n\n` +
    `# 主题关键词(请保持出现频率)\n${primaryKeyword}\n\n` +
    `# 原始标题\n${variant.title}\n\n` +
    `# 原始正文\n${variant.body}\n\n` +
    `# 最弱项提示\n${rewriteHint}\n\n` +
    `# 输出 JSON\n` +
    `- title: 改写后的标题(原则上不变,违规或不达标才动)\n` +
    `- body: 改写后的正文(markdown,字数 ±20%)\n` +
    `- changes: 主要改进点的字符串数组(例如 ["补充《XX 指南》引用", "首句加入主题词"])\n`;

  let parsed: { title?: string; body?: string; changes?: string[] };
  try {
    const result = await chat({
      messages: [
        { role: 'system', content: GEO_REWRITE_SYSTEM },
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

  // Re-score after rewrite. We accept the new body even if score regresses —
  // human reviewer makes the final call. But surface the delta in audit_logs
  // so we can later see how often LLM helps vs hurts.
  const newScore = scoreGeo({
    title: newTitle,
    body: newBody,
    primary_keyword: primaryKeyword,
    rewrite_count: (geoScore.rewrite_count ?? 0) + 1,
  });

  const user = await getCurrentUser();

  const { error: upErr } = await service
    .from('content_variants')
    .update({
      title: newTitle,
      body: newBody,
      status: 'draft',
      compliance_status: 'pending',
      compliance_review_id: null,
      geo_score: newScore,
    })
    .eq('id', variantId);
  if (upErr) {
    return { ok: false, reason: `保存失败: ${upErr.message}` };
  }

  await service.from('audit_logs').insert({
    tenant_id: tenant.id,
    actor_user_id: user?.id ?? null,
    action: 'compliance.ai_rewrite_geo_score',
    target_type: 'content_variant',
    target_id: variantId,
    payload: {
      original_title: variant.title,
      original_body: variant.body,
      changes: parsed.changes ?? [],
      score_before: geoScore.total,
      score_after: newScore.total,
      rewrite_hint: rewriteHint,
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

// ─────────────────────────────────────────────────────────────────────────
// Citation-targeted rewrite (V1.9)
//
// Scoped to the "引用核实 — 疑似 AI 编造" panel. Different from
// aiRewriteVariant (which addresses keyword-stage rejections):
//   - Trigger: citation_check.verdict = 'suspected_hallucination'
//   - Two needle classes:
//      🟢 in-KB     → KB has it but verified_citations white-list doesn't.
//                     LLM softens marketing phrasing (e.g. "国内唯一" → "云南较早一批").
//      🔴 not-in-KB → True LLM fabrication. LLM REMOVES the sentence with the
//                     fabricated citation, or replaces with "据相关临床指南" generic.
//   - Works on any non-final compliance_status (pending / auto_approved /
//     manual_approved). Does NOT require rejected status.
// ─────────────────────────────────────────────────────────────────────────

const CITATION_REWRITE_SYSTEM = `你是医疗内容编辑,任务是把一篇文章里**白名单未匹配**的可疑引用清理掉,同时保留其余所有事实和结构。

铁律:
1. 输出必须仍然合规(不引入"最/根治/100%/无痛"等违规词)
2. 数字、医生姓名、其他段落不要乱动 — 只针对指定的可疑引用修改
3. 输出严格 JSON: { "title": "新标题", "body": "新正文 markdown", "changes": ["原句 → 改后" 字符串数组] }`;

export async function aiRewriteCitations(
  tenantSlug: string,
  variantId: string,
): Promise<{ ok: true; changes: string[] } | { ok: false; reason: string }> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'auditor']);
  if (!llmAvailable()) {
    return { ok: false, reason: 'LLM 未配置(ARK_API_KEY 缺失)' };
  }

  const service = getSupabaseServiceClient();
  const user = await getCurrentUser();

  const { data: variant, error: vErr } = await service
    .from('content_variants')
    .select('id, tenant_id, title, body, platform, status, compliance_status, citation_check')
    .eq('id', variantId)
    .single();
  if (vErr || !variant) return { ok: false, reason: '变体不存在' };
  if (variant.tenant_id !== tenant.id) return { ok: false, reason: 'Tenant mismatch' };
  if (['dispatched', 'published'].includes(variant.status as string)) {
    return { ok: false, reason: '已派发或发布,不能改写' };
  }

  const cc = variant.citation_check as
    | { verdict?: string; unmatched?: Array<{ needle: string; context_snippet?: string }> }
    | null;
  if (cc?.verdict !== 'suspected_hallucination' || !cc.unmatched?.length) {
    return { ok: false, reason: '该变体没有可疑引用,无需改写' };
  }

  const needles = cc.unmatched.map((u) => u.needle).filter(Boolean);
  const verdicts = await lookupNeedlesInKb(needles);

  const inKbList = verdicts.filter((v) => v.in_kb);
  const notInKbList = verdicts.filter((v) => !v.in_kb);

  const instructions: string[] = [];
  if (inKbList.length) {
    instructions.push(
      `## 🟢 这些引用 KB 里有(医院营销话术,但没获得第三方背书),**软化措辞**不要直接抄:\n` +
        inKbList
          .map(
            (v) =>
              `- "${v.needle}" → 改成弱化表达(如"国内唯一一家"→"云南较早一批","X 项国际金标准"→"X 项内部质控流程","包治牙周炎"→"针对性诊疗牙周炎")`,
          )
          .join('\n'),
    );
  }
  if (notInKbList.length) {
    instructions.push(
      `## 🔴 这些引用 KB 里也没有(LLM 真编造),**整句删除或替换为"据相关临床指南"**这种通用表述:\n` +
        notInKbList.map((v) => `- "${v.needle}"`).join('\n'),
    );
  }

  const userPrompt =
    `# 平台\n${variant.platform}\n\n` +
    `# 原始标题\n${variant.title}\n\n` +
    `# 原始正文\n${variant.body}\n\n` +
    `# 引用核实问题\n\n` +
    instructions.join('\n\n') +
    `\n\n# 输出 JSON\n` +
    `- title: 标题(可保持不变)\n` +
    `- body: 改写后的正文(其他段落原样保留,只动指定引用所在的句子)\n` +
    `- changes: 列出每处实际改动的字符串数组`;

  let parsed: { title?: string; body?: string; changes?: string[] };
  try {
    const result = await chat({
      messages: [
        { role: 'system', content: CITATION_REWRITE_SYSTEM },
        { role: 'user', content: userPrompt },
      ],
      model: process.env.ARK_MODEL_FAST,
      temperature: 0.4,
      max_tokens: 4000,
      response_format: 'json_object',
      timeout_ms: 120_000,
    });
    parsed = JSON.parse(result.content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `LLM 调用/解析失败: ${msg.slice(0, 150)}` };
  }

  const newTitle = (parsed.title ?? variant.title).trim().slice(0, 200);
  const newBody = (parsed.body ?? '').trim();
  if (newBody.length < 30) {
    return { ok: false, reason: 'LLM 返回的正文过短,改写失败' };
  }

  const { error: upErr } = await service
    .from('content_variants')
    .update({
      title: newTitle,
      body: newBody,
      citation_check: null,
      compliance_status: 'pending',
      updated_at: new Date().toISOString(),
    })
    .eq('id', variantId);
  if (upErr) return { ok: false, reason: `保存失败: ${upErr.message}` };

  await service.from('audit_logs').insert({
    tenant_id: tenant.id,
    actor_user_id: user?.id ?? null,
    action: 'compliance.ai_rewrite_citations',
    target_type: 'content_variant',
    target_id: variantId,
    payload: {
      changes: parsed.changes ?? [],
      in_kb_needles: inKbList.map((v) => v.needle),
      not_in_kb_needles: notInKbList.map((v) => v.needle),
    },
  });

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
  return { ok: true, changes: parsed.changes ?? [] };
}
