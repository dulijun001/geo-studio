/**
 * Compliance auto-rewrite (P3).
 *
 * Worker variant of apps/web/app/t/[slug]/compliance/actions.ts::aiRewriteVariant.
 * Triggered automatically by compliance-review when a variant is rejected
 * AND auto_rewrite_count = 0. Runs the same LLM rewrite path the manual
 * button uses, then re-enqueues compliance.review to verify.
 *
 * Hard cap: only the first reject auto-triggers. If the rewrite also gets
 * rejected, compliance-review sees auto_rewrite_count = 1 and does NOT
 * re-enqueue — operator takes over via existing manual rewrite button.
 *
 * No new DB write paths — reuses content_variants + compliance_reviews +
 * audit_logs schemas identical to the manual path.
 */
import { chat, isAvailable as llmAvailable } from '@geo/geo-core';
import { reportError } from '@geo/shared';
import { enqueueViaSharedBoss } from '../lib/boss-ref';
import { getServiceClient } from '../lib/supabase';

export type ComplianceAutoRewriteJob = {
  variant_id: string;
  tenant_id: string;
};

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

export async function handleComplianceAutoRewrite(
  data: ComplianceAutoRewriteJob,
): Promise<void> {
  const { variant_id, tenant_id } = data;
  const client = getServiceClient();
  const started = Date.now();

  if (!llmAvailable()) {
    console.warn(`[compliance-auto-rewrite] ARK_API_KEY missing, skipping variant=${variant_id}`);
    return;
  }

  // 1. Load variant
  const { data: variant, error: vErr } = await client
    .from('content_variants')
    .select('id, tenant_id, title, body, platform, status, compliance_status, auto_rewrite_count')
    .eq('id', variant_id)
    .single();
  if (vErr || !variant) {
    console.error(`[compliance-auto-rewrite] variant ${variant_id} not found: ${vErr?.message}`);
    return;
  }
  if (variant.tenant_id !== tenant_id) {
    console.error('[compliance-auto-rewrite] tenant mismatch');
    return;
  }
  if (variant.compliance_status !== 'rejected') {
    // Already moved on (manual approve / rewrite happened first) — skip.
    return;
  }
  if ((variant.auto_rewrite_count ?? 0) >= 1) {
    // Auto cap reached — operator's turn.
    return;
  }
  if (['dispatched', 'published'].includes(variant.status as string)) {
    return;
  }

  // 2. Pull most-recent keyword findings for evidence-grounded rewrite.
  const { data: reviews } = await client
    .from('compliance_reviews')
    .select('stage, findings, rationale, created_at')
    .eq('target_id', variant_id)
    .eq('target_type', 'content_variant')
    .order('created_at', { ascending: false });

  const latestKeyword = (reviews ?? []).find((r) => r.stage === 'keyword');
  const findings: Finding[] = (latestKeyword?.findings as Finding[] | null) ?? [];
  const llmRationale =
    (reviews ?? []).find((r) => r.stage === 'llm')?.rationale ??
    (reviews ?? []).find((r) => r.stage === 'manual')?.rationale ??
    null;

  const findingsBlock =
    findings.length > 0
      ? findings
          .map(
            (f, i) =>
              `${i + 1}. 「${f.term}」(类别: ${f.category}, ${f.level} 级)${f.context_snippet ? ` — 上下文: "${f.context_snippet.slice(0, 80)}"` : ''}`,
          )
          .join('\n')
      : '(关键词扫描无具体命中,综合 LLM 评审意见改写)';

  const userPrompt =
    `# 任务\n把下列被拒绝的医疗营销文案改写为合规版本。\n\n` +
    `# 平台\n${variant.platform}\n\n` +
    `# 原始标题\n${variant.title}\n\n` +
    `# 原始正文\n${variant.body}\n\n` +
    `# 合规扫描发现的违规词\n${findingsBlock}\n\n` +
    (llmRationale ? `# LLM 审查意见\n${llmRationale}\n\n` : '') +
    `# 输出 JSON\n` +
    `- title: 合规改写后的标题(可保持不变,只要不违规)\n` +
    `- body: 合规改写后的正文(markdown,字数与原文 ±20%)\n` +
    `- changes: 列出主要替换(原词 → 替代词)的字符串数组\n`;

  // 3. Call LLM (thinking model with Pro fallback)
  let parsed: { title?: string; body?: string; changes?: string[] };
  try {
    const result = await chat({
      messages: [
        { role: 'system', content: REWRITE_SYSTEM },
        { role: 'user', content: userPrompt },
      ],
      model: process.env.ARK_MODEL_THINKING || process.env.ARK_MODEL_PRO,
      temperature: 0.5,
      max_tokens: 3000,
      response_format: 'json_object',
      timeout_ms: 180_000,
    });
    parsed = JSON.parse(result.content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[compliance-auto-rewrite] LLM failed variant=${variant_id}: ${msg.slice(0, 200)}`);
    reportError(err, { scope: 'compliance-auto-rewrite', tenant_id, extra: { variant_id } });
    // Bump count anyway so we don't infinite-retry LLM-failing variants
    await client
      .from('content_variants')
      .update({ auto_rewrite_count: (variant.auto_rewrite_count ?? 0) + 1 })
      .eq('id', variant_id);
    return;
  }

  const newBody = parsed.body?.trim() ?? '';
  const newTitle = parsed.title?.trim() || variant.title;
  if (newBody.length < 30) {
    console.warn(`[compliance-auto-rewrite] body too short (${newBody.length}) variant=${variant_id}`);
    await client
      .from('content_variants')
      .update({ auto_rewrite_count: (variant.auto_rewrite_count ?? 0) + 1 })
      .eq('id', variant_id);
    return;
  }

  // 4. Persist rewrite + bump counter + reset compliance state so review re-runs
  const { error: upErr } = await client
    .from('content_variants')
    .update({
      title: newTitle,
      body: newBody,
      status: 'draft',
      compliance_status: 'pending',
      compliance_review_id: null,
      auto_rewrite_count: (variant.auto_rewrite_count ?? 0) + 1,
    })
    .eq('id', variant_id);
  if (upErr) {
    console.error(`[compliance-auto-rewrite] persist failed variant=${variant_id}: ${upErr.message}`);
    return;
  }

  // 5. Audit log
  await client.from('audit_logs').insert({
    tenant_id,
    actor_user_id: null, // automated
    action: 'compliance.auto_rewrite',
    target_type: 'content_variant',
    target_id: variant_id,
    payload: {
      original_title: variant.title,
      original_body: variant.body,
      changes: parsed.changes ?? [],
      findings_count: findings.length,
      auto: true,
    },
  });

  // 6. Re-enqueue compliance review for the rewritten body
  try {
    await enqueueViaSharedBoss('compliance.review', {
      variant_id,
      tenant_id,
      triggered_by: 'auto_rewrite',
    });
  } catch (err) {
    reportError(err, { scope: 'compliance-auto-rewrite.re_enqueue', tenant_id, extra: { variant_id } });
  }

  console.log(
    `[compliance-auto-rewrite] variant=${variant_id} rewritten in ${Date.now() - started}ms — re-queued for review`,
  );
}
