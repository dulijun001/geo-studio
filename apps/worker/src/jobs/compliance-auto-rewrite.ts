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
import {
  buildRewriteHint,
  chat,
  isAvailable as llmAvailable,
  renderDoctorBlock,
  scoreGeo,
  type DoctorCandidate,
  type GeoScore,
} from '@geo/geo-core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { prettifyMarkdown, reportError } from '@geo/shared';
import { enqueueViaSharedBoss } from '../lib/boss-ref';
import { getServiceClient } from '../lib/supabase';

export type ComplianceAutoRewriteJob = {
  variant_id: string;
  tenant_id: string;
  /**
   * V1.10.2 2026-05-19:
   *  - 'compliance' (default, D5/D12 §13.3 reject 触发):用 REWRITE_SYSTEM,
   *    findings-based 改写违规词。
   *  - 'geo_score' (V1.11 T4 yellow 触发):用 GEO_REWRITE_SYSTEM,
   *    buildRewriteHint-based 改写 GEO 9 法薄弱项。镜像 web 端
   *    aiRewriteForGeoScore server action 的逻辑。
   *  - 'local_geo' (V1.13 触发):本地化 GEO 结构(地域分布/转化入口/机构植入)
   *    不达标,用 GEO_REWRITE_SYSTEM + geo_hints 逐条定向补强。计数同 compliance(cap=1)。
   */
  mode?: 'compliance' | 'geo_score' | 'local_geo';
  /**
   * V1.13 D33 — trigger context. When 'warn-d33', the upstream stage-2 LLM
   * gave warn (soft) so compliance_status stayed 'pending' rather than
   * flipping to 'rejected'. The mode=compliance gate normally requires
   * rejected; this flag bypasses it for the warn path while keeping all
   * other guards (auto_rewrite_count cap, dispatch state, etc).
   * 'localgeo' (V1.13) → 本地化 GEO 结构不达标触发。
   */
  reason?: 'reject' | 'warn-d33' | 'localgeo';
  /** V1.13 — local_geo 模式的逐条修复提示(来自 evaluateDod 的 local_geo_failures)。 */
  geo_hints?: string[];
};

type Finding = {
  term: string;
  level: 'A' | 'B';
  category: string;
  matched_span?: string;
  context_snippet?: string;
};

// 2026-05-28: 与 web actions.ts loadDoctorBlockForRewrite 对齐 — auto-rewrite
// 路径也要给 LLM 看 doctor candidates + credentials,让 LLM 在改写时补全
// "审核信息" / "Trust Block" 这种本应带医生资质的 section。
async function loadDoctorBlockForRewrite(
  client: SupabaseClient,
  tenantId: string,
): Promise<string> {
  const { data: rows } = await client
    .from('staff_accounts')
    .select('real_name, persona, credentials')
    .eq('tenant_id', tenantId)
    .eq('kind', 'doctor')
    .eq('status', 'active')
    .is('deleted_at', null)
    .limit(8);
  const doctors: DoctorCandidate[] = (rows ?? []).map((d) => {
    const tagsArr = (d.persona as { tags?: unknown } | null)?.tags;
    const tags = Array.isArray(tagsArr)
      ? (tagsArr as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];
    return { name: (d.real_name as string | null) ?? '', tags, credentials: d.credentials };
  });
  return renderDoctorBlock(doctors, { mode: 'rewrite' });
}

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

// V1.10.2 2026-05-19: mirror of web app aiRewriteForGeoScore's system prompt.
// Used when mode='geo_score' (cron T4 yellow rewrite). Different focus than
// REWRITE_SYSTEM: not stripping violations, but补GEO 9-tactic 弱项.
const GEO_REWRITE_SYSTEM = `你是一位医疗内容编辑助手。任务:基于「GEO 9 法」评分薄弱项,把一条已发布或已审通过的医疗营销文案改写得更容易被 AI 引擎(豆包/元宝/Perplexity 等)引用。

铁律:
1. 不引入任何医疗广告法 A 级违规词(如「根治」「永不复发」「最好」「第一」)
2. 不编造数据 / 引用 / 医生姓名 — 只在原文已有事实周围补充权威短语 + 句式重组
3. 保留原文事实数字、医生姓名、诊疗细节;不要改这些
4. 保留原文结构和大致字数(±20%)
5. 严格按 user 的"最弱项提示"针对性改写,不要全文重写`;

export async function handleComplianceAutoRewrite(
  data: ComplianceAutoRewriteJob,
): Promise<void> {
  const { variant_id, tenant_id } = data;
  const mode: 'compliance' | 'geo_score' | 'local_geo' = data.mode ?? 'compliance';
  const client = getServiceClient();
  const started = Date.now();

  if (!llmAvailable()) {
    console.warn(`[compliance-auto-rewrite] ARK_API_KEY missing, skipping variant=${variant_id}`);
    return;
  }

  // 1. Load variant (V1.10.2 also pull geo_score + content_item_id for geo mode)
  const { data: variant, error: vErr } = await client
    .from('content_variants')
    .select('id, tenant_id, title, body, platform, status, compliance_status, auto_rewrite_count, geo_score, content_item_id')
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
  // V1.10.2: guard depends on mode
  if (mode === 'compliance') {
    // V1.13 D33 — warn-d33 path: stage-2 LLM gave warn so compliance_status
    // stayed 'pending'; we still want to rewrite. Treat 'pending' as a
    // valid entry state ONLY when reason='warn-d33', otherwise stick with
    // the original 'rejected'-only gate.
    const okStatus =
      variant.compliance_status === 'rejected' ||
      (data.reason === 'warn-d33' && variant.compliance_status === 'pending');
    if (!okStatus) {
      return; // Already moved on (manual approve / rewrite happened first)
    }
  } else if (mode === 'local_geo') {
    // V1.13 — 本地化 GEO 结构不达标。compliance 本身可能 pending 或 auto_approved
    // (结构失败与合规独立);两种状态都允许进入定向结构改写。
    if (!['pending', 'auto_approved'].includes(variant.compliance_status as string)) {
      return;
    }
  } else {
    // mode === 'geo_score' — yellow (pending) variants with low GEO score
    if (variant.compliance_status !== 'pending') {
      return; // No longer yellow
    }
    const geoTotal = (variant.geo_score as GeoScore | null)?.total ?? null;
    if (geoTotal === null || geoTotal >= 70) {
      // Already at auto-approve threshold or no score → skip
      return;
    }
  }
  if ((variant.auto_rewrite_count ?? 0) >= 1) {
    // Auto cap reached — operator's turn (D5/D12 §13.3 max 1×).
    return;
  }
  if (['dispatched', 'published'].includes(variant.status as string)) {
    return;
  }

  // 2. Build mode-specific user prompt
  let userPrompt: string;
  let systemPrompt: string;
  let promptMeta: { findings_count?: number; rewrite_hint?: string } = {};

  if (mode === 'compliance') {
    // Pull most-recent keyword findings for evidence-grounded rewrite
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

    systemPrompt = REWRITE_SYSTEM;
    const doctorBlock = await loadDoctorBlockForRewrite(client, tenant_id);
    userPrompt =
      `# 任务\n把下列被拒绝的医疗营销文案改写为合规版本。\n\n` +
      `# 平台\n${variant.platform}\n\n` +
      `# 原始标题\n${variant.title}\n\n` +
      `# 原始正文\n${variant.body}\n\n` +
      `# 合规扫描发现的违规词\n${findingsBlock}\n\n` +
      (llmRationale ? `# LLM 审查意见\n${llmRationale}\n\n` : '') +
      doctorBlock +
      `\n\n# 输出 JSON\n` +
      `- title: 合规改写后的标题(可保持不变,只要不违规)\n` +
      `- body: 合规改写后的正文(markdown,字数与原文 ±20%)\n` +
      `- changes: 列出主要替换(原词 → 替代词)的字符串数组\n`;
    promptMeta.findings_count = findings.length;
  } else if (mode === 'local_geo') {
    // V1.13 — 本地化 GEO 结构定向补强。合规没问题,只补 地域分布/转化入口/机构植入。
    systemPrompt = GEO_REWRITE_SYSTEM;
    const doctorBlock = await loadDoctorBlockForRewrite(client, tenant_id);
    const hints =
      (data.geo_hints ?? []).map((h, i) => `${i + 1}. ${h}`).join('\n') ||
      '(无具体提示,按本地化 GEO 标准补强:地域词分布、转化引导、品牌自然植入)';
    userPrompt =
      `# 任务\n下面这条医疗文案合规没问题,但「本地化 GEO 结构」不达标。请在**不改事实、不引入违规词**的前提下,逐条修复下列问题,提升被 AI 引擎引用的概率。\n\n` +
      `# 平台\n${variant.platform}\n\n` +
      `# 原始标题\n${variant.title}\n\n` +
      `# 原始正文\n${variant.body}\n\n` +
      `# 需逐条修复的结构问题\n${hints}\n\n` +
      `# 改写要求\n` +
      `- 地域词自然分布到 标题 / 首段 / 小标题 / 结尾,但**禁止堆砌**(一句不重复多次)\n` +
      `- 转化引导用「面诊 / 咨询」邀约语气,首段答案后 + 中部 + 结尾各一处,**禁优惠 / 促销 / 疗效承诺**\n` +
      `- 品牌名 + 服务自然融入正文 ≥3 个场景(适用人群 / 护理流程 / 如何选择),不堆文末\n` +
      `- **绝不编造**价格 / 医保比例 / 术式时长 / 案例 — 没有真实数据就定性表达或写"建议到院咨询"\n` +
      doctorBlock +
      `\n\n# 输出 JSON\n` +
      `- title: 改写后标题(需含地域词)\n` +
      `- body: 改写后正文(markdown,字数 ±20%)\n` +
      `- changes: 主要改进点字符串数组\n`;
    promptMeta.rewrite_hint = (data.geo_hints ?? []).join(' | ').slice(0, 100);
  } else {
    // mode === 'geo_score' — mirror of web aiRewriteForGeoScore
    const geoScore = variant.geo_score as GeoScore;
    let primaryKeyword = variant.title.slice(0, 8);
    if (variant.content_item_id) {
      const { data: item } = await client
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

    systemPrompt = GEO_REWRITE_SYSTEM;
    const doctorBlock = await loadDoctorBlockForRewrite(client, tenant_id);
    userPrompt =
      `# 任务\n基于下方"最弱项提示",对一条医疗营销文案做精准改写,提升其在 AI 搜索引擎里的被引概率。\n\n` +
      `# 平台\n${variant.platform}\n\n` +
      `# 主题关键词(请保持出现频率)\n${primaryKeyword}\n\n` +
      `# 原始标题\n${variant.title}\n\n` +
      `# 原始正文\n${variant.body}\n\n` +
      `# 最弱项提示\n${rewriteHint}\n\n` +
      doctorBlock +
      `\n\n# 输出 JSON\n` +
      `- title: 改写后的标题(原则上不变,违规或不达标才动)\n` +
      `- body: 改写后的正文(markdown,字数 ±20%)\n` +
      `- changes: 主要改进点的字符串数组(例如 ["补充《XX 指南》引用", "首句加入主题词"])\n`;
    promptMeta.rewrite_hint = rewriteHint.slice(0, 100);
  }

  // 3. Call LLM (thinking model with Pro fallback)
  let parsed: { title?: string; body?: string; changes?: string[] };
  try {
    const result = await chat({
      messages: [
        { role: 'system', content: systemPrompt },
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
    reportError(err, { scope: 'compliance-auto-rewrite', tenant_id, extra: { variant_id, mode } });
    // V1.10.3: bump appropriate counter to prevent infinite retry.
    // compliance / local_geo mode → auto_rewrite_count (D5/D12 §13.3 max 1×)
    // geo_score mode  → geo_score.rewrite_count (soft cap max 3)
    if (mode === 'compliance' || mode === 'local_geo') {
      await client
        .from('content_variants')
        .update({ auto_rewrite_count: (variant.auto_rewrite_count ?? 0) + 1 })
        .eq('id', variant_id);
    } else {
      const oldScore = (variant.geo_score as GeoScore | null) ?? null;
      if (oldScore) {
        await client
          .from('content_variants')
          .update({
            geo_score: { ...oldScore, rewrite_count: (oldScore.rewrite_count ?? 0) + 1 },
          })
          .eq('id', variant_id);
      }
    }
    return;
  }

  const newBody = prettifyMarkdown(parsed.body?.trim() ?? '');
  const newTitle = parsed.title?.trim() || variant.title;
  if (newBody.length < 30) {
    console.warn(`[compliance-auto-rewrite] body too short (${newBody.length}) variant=${variant_id}`);
    // Same bump logic as LLM-fail branch
    if (mode === 'compliance' || mode === 'local_geo') {
      await client
        .from('content_variants')
        .update({ auto_rewrite_count: (variant.auto_rewrite_count ?? 0) + 1 })
        .eq('id', variant_id);
    } else {
      const oldScore = (variant.geo_score as GeoScore | null) ?? null;
      if (oldScore) {
        await client
          .from('content_variants')
          .update({
            geo_score: { ...oldScore, rewrite_count: (oldScore.rewrite_count ?? 0) + 1 },
          })
          .eq('id', variant_id);
      }
    }
    return;
  }

  // 4. Persist rewrite + reset compliance state so review re-runs.
  // V1.10.3 mode-dependent counter bump:
  //   compliance: bump auto_rewrite_count (D5/D12 §13.3 max 1×, then operator手动)
  //   geo_score:  scoreGeo + write back geo_score (with rewrite_count bumped).
  //               Mirrors web aiRewriteForGeoScore exactly — no auto_rewrite_count bump
  //               so cron can re-touch until GEO ≥ 70 or geo_score.rewrite_count = 3 cap.
  let updatePayload: Record<string, unknown> = {
    title: newTitle,
    body: newBody,
    status: 'draft',
    compliance_status: 'pending',
    compliance_review_id: null,
  };
  if (mode === 'compliance' || mode === 'local_geo') {
    updatePayload.auto_rewrite_count = (variant.auto_rewrite_count ?? 0) + 1;
  } else {
    // geo_score mode: re-score + bump geo_score.rewrite_count, NOT auto_rewrite_count.
    const oldScore = (variant.geo_score as GeoScore | null) ?? null;
    const primaryKeyword = (() => {
      // Recompute primary keyword for consistency (same logic as prompt builder above)
      return newTitle.slice(0, 8);
    })();
    const newScore = scoreGeo({
      title: newTitle,
      body: newBody,
      primary_keyword: primaryKeyword,
      rewrite_count: (oldScore?.rewrite_count ?? 0) + 1,
    });
    updatePayload.geo_score = newScore;
  }
  const { error: upErr } = await client
    .from('content_variants')
    .update(updatePayload)
    .eq('id', variant_id);
  if (upErr) {
    console.error(`[compliance-auto-rewrite] persist failed variant=${variant_id}: ${upErr.message}`);
    return;
  }

  // 5. Audit log
  await client.from('audit_logs').insert({
    tenant_id,
    actor_user_id: null, // automated
    action: mode === 'geo_score' ? 'compliance.auto_rewrite_geo' : 'compliance.auto_rewrite',
    target_type: 'content_variant',
    target_id: variant_id,
    payload: {
      original_title: variant.title,
      original_body: variant.body,
      changes: parsed.changes ?? [],
      mode,
      auto: true,
      ...promptMeta,
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
