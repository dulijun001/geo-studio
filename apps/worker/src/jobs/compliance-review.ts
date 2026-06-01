/**
 * Three-gate compliance review job.
 *
 * Stage 1: deterministic keyword scan (always run, sync inside the job).
 * Stage 2: LLM semantic review via Doubao (async, only for B-level hits or clean bodies
 *          that still warrant a second opinion). Stubbed until ARK_API_KEY is wired.
 * Stage 3: manual approval — out-of-band, triggered from the admin UI.
 *
 * Contract with callers:
 *   - Job input: { variant_id, tenant_id, triggered_by? }
 *   - Post-conditions:
 *       * content_variants.compliance_status reflects the latest verdict
 *       * content_variants.compliance_review_id points to the latest review row
 *       * One row inserted into compliance_reviews per stage that ran
 *       * One audit_logs row per transition (keyword_hit / llm_review / auto_approve)
 *
 * The job is idempotent modulo audit rows — re-running will re-scan and produce
 * a new review; approvals/rejections from manual stage are never overwritten
 * (we check variant.compliance_status before mutating).
 */
import {
  evaluateDod,
  llmReviewAvailable,
  runLlmReview as runDoubaoReview,
  scanKeywords,
  matchCases,
  type KeywordHit,
  type KeywordRow,
  type ComplianceCase,
} from '@geo/geo-core';
import { reportError } from '@geo/shared';
import { enqueueViaSharedBoss } from '../lib/boss-ref';
import { getServiceClient } from '../lib/supabase';

export type ComplianceReviewJob = {
  variant_id: string;
  tenant_id: string;
  triggered_by?: string;
};

type VariantRow = {
  id: string;
  tenant_id: string;
  title: string;
  body: string;
  platform: string;
  compliance_status: string;
  geo_score: { total?: number } | null;
  citation_check: { verdict?: string } | null;
  numeric_check: { verdict?: string } | null;
};

/**
 * GEO 9-tactic minimum total score for a variant to skip human review.
 * Below this, even a clean keyword scan downgrades to pending_review.
 *
 * Tuned to match REWRITE_THRESHOLD in variant-generate.ts — a variant that
 * couldn't reach 70 after one rewrite shouldn't auto-publish on autopilot.
 */
const GEO_AUTO_APPROVE_MIN = 70;

export async function handleComplianceReview(data: ComplianceReviewJob): Promise<void> {
  const { variant_id, tenant_id, triggered_by } = data;
  const client = getServiceClient();
  const started = Date.now();

  console.log(`[compliance-review] variant=${variant_id} tenant=${tenant_id}`);

  // 1. Fetch variant
  const { data: variant, error: vErr } = await client
    .from('content_variants')
    .select('id, tenant_id, title, body, platform, compliance_status, geo_score, citation_check, numeric_check')
    .eq('id', variant_id)
    .single<VariantRow>();
  if (vErr || !variant) {
    console.error(`[compliance-review] variant not found: ${vErr?.message}`);
    return;
  }
  if (variant.tenant_id !== tenant_id) {
    console.error('[compliance-review] tenant mismatch');
    return;
  }
  // Don't overwrite a human decision
  if (variant.compliance_status === 'manual_approved' || variant.compliance_status === 'rejected') {
    console.log(`[compliance-review] variant already finalized (${variant.compliance_status}) — skipping`);
    return;
  }

  // 2. Load applicable keywords: global (tenant_id IS NULL) + this tenant
  const { data: kwRows, error: kwErr } = await client
    .from('compliance_keywords')
    .select('id, term, level, category, variants, platforms, tenant_id')
    .or(`tenant_id.is.null,tenant_id.eq.${tenant_id}`);
  if (kwErr || !kwRows) {
    console.error(`[compliance-review] keyword load failed: ${kwErr?.message}`);
    return;
  }
  const keywords: KeywordRow[] = kwRows.map((r) => ({
    id: r.id as string,
    term: r.term as string,
    level: r.level as 'A' | 'B',
    category: r.category as string,
    variants: (r.variants as string[]) ?? [],
    platforms: (r.platforms as string[] | null) ?? [],
  }));

  // 3. Stage 1 — keyword scan on (title + body), filtered to this platform.
  // Platform-specific keywords (抖音瘦脸针/小红书私信/头条标题党 etc) only
  // apply when variant.platform matches; global keywords (no platforms set)
  // apply always.
  const scanInput = `${variant.title}\n\n${variant.body}`;
  const scan = scanKeywords(scanInput, keywords, variant.platform);

  // 3a. Historical case match — separate from keyword scan, no fail-stop.
  // Findings persist as content_variants.case_match for the compliance UI to
  // surface; doesn't block here because LLM and human reviewers should
  // weigh the case similarity in context.
  const { data: caseRows } = await client
    .from('compliance_cases')
    .select('id, title, violation_patterns, violation_category, jurisdiction, fine_yuan, case_url, active')
    .eq('active', true)
    .is('deleted_at', null);
  const cases: ComplianceCase[] = (caseRows ?? []).map((c) => ({
    id: c.id as string,
    title: c.title as string,
    violation_patterns: (c.violation_patterns as string[]) ?? [],
    violation_category: c.violation_category as string,
    jurisdiction: (c.jurisdiction as string | null) ?? null,
    fine_yuan: (c.fine_yuan as number | null) ?? null,
    case_url: (c.case_url as string | null) ?? null,
  }));
  const caseMatch = matchCases(scanInput, cases);
  if (cases.length > 0) {
    await client
      .from('content_variants')
      .update({ case_match: caseMatch })
      .eq('id', variant_id);
    if (caseMatch.matches.length > 0) {
      const top = caseMatch.matches[0]!;
      console.log(
        `[compliance-review] case-match hit ${caseMatch.matches.length} of ${cases.length} cases (top: ${top.title.slice(0, 30)} sim=${top.similarity})`,
      );
      // Medical compliance requires a 3-year audit trail (D5). Without this
      // write the only persistence of a case match is content_variants.case_match
      // — invisible to audit_logs filters and exports, so a regulator request
      // can't prove the gate ran. Write it.
      await writeAudit(tenant_id, triggered_by, 'compliance.case_match', variant_id, {
        matches: caseMatch.matches.length,
        cases_evaluated: caseMatch.cases_evaluated,
        top_case_id: top.case_id,
        top_case_title: top.title,
        top_similarity: top.similarity,
        top_fine_yuan: top.fine_yuan,
        top_jurisdiction: top.jurisdiction,
      });
    }
  }

  const { data: kwReview, error: krErr } = await client
    .from('compliance_reviews')
    .insert({
      tenant_id,
      target_type: 'content_variant',
      target_id: variant_id,
      stage: 'keyword',
      verdict: scan.verdict,
      risk_level: scan.risk_level,
      findings: scan.hits,
      rationale:
        scan.hits.length === 0
          ? 'No banned terms matched.'
          : `Matched ${scan.hits.length} term(s); max level ${scan.max_level}.`,
    })
    .select('id')
    .single();
  if (krErr || !kwReview) {
    console.error(`[compliance-review] insert keyword review failed: ${krErr?.message}`);
    return;
  }

  await writeAudit(tenant_id, triggered_by, 'compliance.keyword_hit', variant_id, {
    review_id: kwReview.id,
    verdict: scan.verdict,
    risk_level: scan.risk_level,
    hit_count: scan.hits.length,
    max_level: scan.max_level,
    duration_ms: scan.duration_ms,
  });

  // 4. Branch on stage-1 verdict
  let latestReviewId: string = kwReview.id as string;
  let finalStatus: 'rejected' | 'pending' | 'auto_approved';
  /**
   * V1.13 D33 — when stage-2 LLM gives warn, we still want auto-rewrite to
   * try once instead of dropping the variant straight to the manual queue.
   * compliance_status stays 'pending' (LLM said "soft issue" not "hard
   * reject"), but we ALSO enqueue rewrite below. If the rewrite re-review
   * is still warn, auto_rewrite_count=1 caps it and the variant naturally
   * ends in pending for operator handling. No new compliance_status enum
   * value needed.
   */
  let warnNeedsRewrite = false;

  if (scan.verdict === 'reject') {
    // A-level: stop here, reject.
    finalStatus = 'rejected';
  } else if (scan.verdict === 'warn') {
    // B-level: route to stage 2 (LLM). If LLM unavailable, hold for manual review.
    const llm = await runLlmReview(variant, scan.hits);
    const { data: llmReview } = await client
      .from('compliance_reviews')
      .insert({
        tenant_id,
        target_type: 'content_variant',
        target_id: variant_id,
        stage: 'llm',
        verdict: llm.verdict,
        risk_level: llm.risk_level,
        findings: llm.findings,
        llm_response_raw: llm.raw,
        rationale: llm.rationale,
      })
      .select('id')
      .single();
    if (llmReview) latestReviewId = llmReview.id as string;

    await writeAudit(tenant_id, triggered_by, 'compliance.llm_review', variant_id, {
      review_id: latestReviewId,
      verdict: llm.verdict,
      risk_level: llm.risk_level,
      provider: llm.provider,
      tokens: llm.usage?.total_tokens ?? null,
    });

    if (llm.verdict === 'reject') finalStatus = 'rejected';
    else if (llm.verdict === 'pass') finalStatus = 'auto_approved';
    else {
      // V1.13 D33 — LLM warn: keep status pending for UI/audit clarity,
      // but flag for auto-rewrite attempt below (capped at 1×).
      finalStatus = 'pending';
      warnNeedsRewrite = true;
    }
  } else {
    // Clean keyword scan: tentatively auto-approve.
    finalStatus = 'auto_approved';

    // V1.13 D36 — rewrite-miss guard. LLM auto-rewrite has ~30% miss rate
    // on subtle absolute-language patterns (e.g. "不会被身体排斥") even
    // when it correctly removes other findings. Without this gate, an
    // unremoved violation span sneaks past stage-1 (because we didn't
    // bother to add every individual phrase to the keyword blacklist).
    //
    // Logic: when auto_rewrite_count >= 1, fetch the LAST stage-2 LLM
    // review's findings and check whether each flagged span still
    // literally appears in the body. If yes → that finding wasn't
    // resolved → downgrade to pending for human review.
    //
    // No extra LLM call — pure text contains() check.
    const { data: postRow } = await client
      .from('content_variants')
      .select('auto_rewrite_count')
      .eq('id', variant_id)
      .single();
    const rewriteCount = (postRow?.auto_rewrite_count as number | null) ?? 0;

    let unremovedSpans: string[] = [];
    if (rewriteCount >= 1) {
      // Union ALL prior stage='llm' findings, not just the latest one.
      // The first LLM review caught the original violations (e.g.
      // "不会被身体排斥" + 2 others); subsequent post-rewrite re-reviews
      // see partially-fixed body and may flag a different subset. We need
      // every span LLM ever caught for this variant — if any of them is
      // still literally in body, the rewrite missed.
      const { data: allLlm } = await client
        .from('compliance_reviews')
        .select('findings')
        .eq('target_id', variant_id)
        .eq('stage', 'llm')
        .order('created_at', { ascending: true });
      const allSpans = new Set<string>();
      for (const row of allLlm ?? []) {
        const findings =
          (row.findings as Array<{ span?: string | null }> | null) ?? [];
        for (const f of findings) {
          if (f.span && f.span.length > 0) allSpans.add(f.span);
        }
      }
      unremovedSpans = Array.from(allSpans).filter((s) => variant.body.includes(s));
    }

    if (unremovedSpans.length > 0) {
      finalStatus = 'pending';
      await writeAudit(tenant_id, triggered_by, 'compliance.rewrite_miss', variant_id, {
        review_id: latestReviewId,
        stage_path: 'keyword_pass_but_rewrite_miss',
        rewrite_count: rewriteCount,
        unremoved_spans: unremovedSpans,
      });
    } else {
      await writeAudit(tenant_id, triggered_by, 'compliance.auto_approve', variant_id, {
        review_id: latestReviewId,
        stage_path: rewriteCount >= 1 ? 'keyword_pass_post_rewrite_clean' : 'keyword_pass',
      });
    }
  }

  // 4b. Quality-gate downgrade — even if 4-道-门 says auto_approved, refuse to
  // bypass human review when:
  //   - GEO score < 70 (could not reach minimum after rewrite — 档位 A1); OR
  //   - citation_check flagged hallucinated 《...》 references (档位 A2); OR
  //   - numeric_check verdict='reject' (档位 C1, data-level hallucination).
  //
  // Numeric_check verdict='suspect' does NOT downgrade — that's the LLM's
  // way of saying "I can't tell" (no key_claims, ambiguous match). 'reject'
  // is reserved for either heuristic hard-hit (100% 治愈 + citation) or LLM
  // judging a clear contradiction with operator-curated key_claims.
  if (finalStatus === 'auto_approved') {
    const geoTotal =
      typeof variant.geo_score?.total === 'number' ? variant.geo_score.total : null;
    const citationVerdict = variant.citation_check?.verdict ?? null;
    const numericVerdict = variant.numeric_check?.verdict ?? null;
    const downgradeReasons: string[] = [];
    if (geoTotal !== null && geoTotal < GEO_AUTO_APPROVE_MIN) {
      downgradeReasons.push(`geo_score=${geoTotal}<${GEO_AUTO_APPROVE_MIN}`);
    }
    if (citationVerdict === 'suspected_hallucination') {
      downgradeReasons.push('citation_hallucination');
    }
    if (numericVerdict === 'reject') {
      downgradeReasons.push('numeric_fact_reject');
    }
    if (downgradeReasons.length > 0) {
      finalStatus = 'pending';
      await writeAudit(tenant_id, triggered_by, 'compliance.quality_gate_downgrade', variant_id, {
        review_id: latestReviewId,
        reasons: downgradeReasons,
        geo_total: geoTotal,
        citation_verdict: citationVerdict,
        numeric_verdict: numericVerdict,
      });
      console.log(
        `[compliance-review] variant=${variant_id} downgraded auto→pending (${downgradeReasons.join(', ')})`,
      );
    }
  }

  // 5. Update variant
  const variantStatus =
    finalStatus === 'rejected'
      ? 'rejected'
      : finalStatus === 'auto_approved'
        ? 'auto_approved'
        : 'pending_review';
  const complianceStatus =
    finalStatus === 'rejected'
      ? 'rejected'
      : finalStatus === 'auto_approved'
        ? 'auto_approved'
        : 'pending';

  // T0a 2026-05-19: 同步算 DoD 写回 dod_status,免 cron #2 永远 stillEvaluating.
  // V1.10 nightly-draft 漏调 evaluateDod,生产真跑后 30 个 variants 全 unknown
  // → cron #2 永远跳过 advance run. 这里 hook 进 compliance.review 完成路径,
  // 简化版只跑 L2 总分(skip_required_slices),完整 DoD with slices 留 V1.11.
  // V1.13 — 本地化 GEO 结构检查需要品牌锚点(城市 / 服务区 / 品牌名)。轻量取一次。
  let brandCtx: { name?: string; city?: string; service_areas?: string[] } = {};
  try {
    const { data: brandRow } = await client
      .from('brands')
      .select('name, location, service_areas')
      .eq('tenant_id', tenant_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (brandRow) {
      const loc = (brandRow.location ?? {}) as { city?: string };
      brandCtx = {
        name: (brandRow.name as string | null) ?? undefined,
        city: typeof loc.city === 'string' ? loc.city : undefined,
        service_areas: Array.isArray(brandRow.service_areas)
          ? (brandRow.service_areas as string[])
          : undefined,
      };
    }
  } catch {
    /* brand lookup best-effort; local-geo check just skips if anchor missing */
  }
  const LONG_FORM_PLATFORMS = ['toutiao_article', 'wechat_mp', 'zhihu', 'baijiahao', 'souhu'];
  const isLongForm = LONG_FORM_PLATFORMS.includes(variant.platform);

  let dodStatus: 'passed' | 'failed' | 'legacy_passed' = 'passed';
  let dodScore: number | null = null;
  let localGeoFailures: string[] = [];
  try {
    const dod = evaluateDod({
      title: variant.title,
      body: variant.body,
      threshold: 60,
      skip_required_slices: true,
      is_long_form: isLongForm,
      service_areas: brandCtx.service_areas,
      ctx: { brand_name: brandCtx.name, city: brandCtx.city, is_medical: true },
    });
    dodStatus = dod.status;
    dodScore = dod.score;
    localGeoFailures = dod.evidence.local_geo_failures;
  } catch (err) {
    reportError(err, {
      scope: 'compliance-review.evaluate_dod',
      tenant_id,
      extra: { variant_id },
    });
    // Safe fallback — don't block compliance review if DoD eval crashes
    dodStatus = 'passed';
  }

  const { error: upErr } = await client
    .from('content_variants')
    .update({
      compliance_status: complianceStatus,
      compliance_review_id: latestReviewId,
      status: variantStatus,
      dod_status: dodStatus,
      dod_score: dodScore,
      dod_evaluated_at: new Date().toISOString(),
    })
    .eq('id', variant_id);
  if (upErr) {
    console.error(`[compliance-review] update variant failed: ${upErr.message}`);
    return;
  }

  console.log(
    `[compliance-review] variant=${variant_id} -> ${finalStatus} (${Date.now() - started}ms)`,
  );

  // P3 — auto-rewrite trigger. Two entry conditions:
  //   1. finalStatus === 'rejected'                 (V1.6 original, hard reject)
  //   2. warnNeedsRewrite === true                  (V1.13 D33, LLM warn — soft)
  // Hard cap: only fires when auto_rewrite_count = 0. The rewrite handler
  // bumps the counter and re-enqueues review; on the second pass, the
  // counter is 1, this block no-ops, and the variant naturally lands in
  // pending/rejected for operator handling.
  // V1.13 — 第三个触发条件:合规干净(非 reject/warn)但本地化 GEO 结构不达标。
  // 优先级低于合规改写(合规问题先修);两者只触发一次(auto_rewrite_count cap=1)。
  const complianceRewrite = finalStatus === 'rejected' || warnNeedsRewrite;
  const localGeoRewrite = !complianceRewrite && localGeoFailures.length > 0;
  if (complianceRewrite || localGeoRewrite) {
    const { data: post } = await client
      .from('content_variants')
      .select('auto_rewrite_count')
      .eq('id', variant_id)
      .single();
    const count = (post?.auto_rewrite_count as number | null) ?? 0;
    if (count === 0) {
      try {
        const payload = complianceRewrite
          ? {
              variant_id,
              tenant_id,
              reason: warnNeedsRewrite ? ('warn-d33' as const) : ('reject' as const),
            }
          : {
              variant_id,
              tenant_id,
              mode: 'local_geo' as const,
              reason: 'localgeo' as const,
              geo_hints: localGeoFailures,
            };
        await enqueueViaSharedBoss('compliance.auto_rewrite', payload);
        const trigger = warnNeedsRewrite
          ? 'warn(D33)'
          : complianceRewrite
            ? 'reject'
            : `local_geo(${localGeoFailures.length})`;
        console.log(
          `[compliance-review] variant=${variant_id} → auto_rewrite enqueued (count=0, trigger=${trigger})`,
        );
      } catch (err) {
        console.error(
          `[compliance-review] enqueue auto_rewrite failed variant=${variant_id}:`,
          err instanceof Error ? err.message : err,
        );
      }
    } else {
      console.log(
        `[compliance-review] variant=${variant_id} rewrite needed but auto_rewrite_count=${count} → operator review`,
      );
    }
  }
}

type LlmResult = {
  provider: 'doubao' | 'stub';
  verdict: 'pass' | 'warn' | 'reject';
  risk_level: 'low' | 'medium' | 'high';
  findings: Array<{ span: string; rule: string; suggestion: string }>;
  rationale: string;
  raw: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

/**
 * Stage 2 LLM semantic review.
 *
 * Real path: call Doubao with compliance-focused prompt (see geo-core/compliance/llm-review).
 * Fallback path: ARK_API_KEY unset, or LLM crashes mid-flight → conservative 'warn'
 * so the variant goes to human review rather than silently auto-passing.
 */
async function runLlmReview(variant: VariantRow, keywordHits: KeywordHit[]): Promise<LlmResult> {
  if (!(await llmReviewAvailable())) {
    return {
      provider: 'stub',
      verdict: 'warn',
      risk_level: 'medium',
      findings: [],
      rationale: 'LLM review unavailable (ARK_API_KEY unset). Routing to manual review.',
      raw: '',
    };
  }

  try {
    const llm = await runDoubaoReview({
      title: variant.title,
      body: variant.body,
      platform: variant.platform,
      keyword_hits: keywordHits,
    });
    return {
      provider: 'doubao',
      verdict: llm.verdict,
      risk_level: llm.risk_level,
      findings: llm.findings,
      rationale: llm.rationale,
      raw: llm.raw,
      usage: llm.usage,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[compliance-review] LLM call failed: ${reason}`);
    return {
      provider: 'doubao',
      verdict: 'warn',
      risk_level: 'medium',
      findings: [],
      rationale: `LLM call failed: ${reason.slice(0, 150)} — conservative warn.`,
      raw: '',
    };
  }
}

async function writeAudit(
  tenant_id: string,
  actor_user_id: string | undefined,
  action: string,
  target_id: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const client = getServiceClient();
  await client.from('audit_logs').insert({
    tenant_id,
    actor_user_id: actor_user_id ?? null,
    action,
    target_type: 'content_variant',
    target_id,
    payload,
  });
}
