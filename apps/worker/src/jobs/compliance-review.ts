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
  llmReviewAvailable,
  runLlmReview as runDoubaoReview,
  scanKeywords,
  matchCases,
  type KeywordHit,
  type KeywordRow,
  type ComplianceCase,
} from '@geo/geo-core';
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
    .select('id, tenant_id, title, body, platform, compliance_status, geo_score, citation_check')
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
      console.log(
        `[compliance-review] case-match hit ${caseMatch.matches.length} of ${cases.length} cases (top: ${caseMatch.matches[0]!.title.slice(0, 30)} sim=${caseMatch.matches[0]!.similarity})`,
      );
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
    else finalStatus = 'pending'; // warn → manual review queue
  } else {
    // Clean: auto-approve.
    finalStatus = 'auto_approved';
    await writeAudit(tenant_id, triggered_by, 'compliance.auto_approve', variant_id, {
      review_id: latestReviewId,
      stage_path: 'keyword_pass',
    });
  }

  // 4b. Quality-gate downgrade — even if 4-道-门 says auto_approved, refuse to
  // bypass human review when:
  //   - GEO score < 70 (could not reach minimum after rewrite); OR
  //   - citation_check flagged hallucinated 《...》 references.
  // Both signals were captured by variant-generate.ts at insert time. Forcing
  // these into pending_review prevents low-quality / hallucinated content from
  // landing on the auto_approved → dispatch path silently.
  if (finalStatus === 'auto_approved') {
    const geoTotal =
      typeof variant.geo_score?.total === 'number' ? variant.geo_score.total : null;
    const citationVerdict = variant.citation_check?.verdict ?? null;
    const downgradeReasons: string[] = [];
    if (geoTotal !== null && geoTotal < GEO_AUTO_APPROVE_MIN) {
      downgradeReasons.push(`geo_score=${geoTotal}<${GEO_AUTO_APPROVE_MIN}`);
    }
    if (citationVerdict === 'suspected_hallucination') {
      downgradeReasons.push('citation_hallucination');
    }
    if (downgradeReasons.length > 0) {
      finalStatus = 'pending';
      await writeAudit(tenant_id, triggered_by, 'compliance.quality_gate_downgrade', variant_id, {
        review_id: latestReviewId,
        reasons: downgradeReasons,
        geo_total: geoTotal,
        citation_verdict: citationVerdict,
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

  const { error: upErr } = await client
    .from('content_variants')
    .update({
      compliance_status: complianceStatus,
      compliance_review_id: latestReviewId,
      status: variantStatus,
    })
    .eq('id', variant_id);
  if (upErr) {
    console.error(`[compliance-review] update variant failed: ${upErr.message}`);
    return;
  }

  console.log(
    `[compliance-review] variant=${variant_id} -> ${finalStatus} (${Date.now() - started}ms)`,
  );
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
