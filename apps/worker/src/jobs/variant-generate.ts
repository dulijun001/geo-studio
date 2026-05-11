/**
 * Variant generation job.
 *
 * Input: { content_item_id, tenant_id, platforms, tactics?, triggered_by? }
 *
 * Flow:
 *   1. Load content_item.markdown + tenant brand info
 *   2. For each requested platform, call generator.ts
 *   3. Insert a content_variants row per generated variant (status=draft, compliance_status=pending)
 *   4. Enqueue compliance.review for each new variant
 *   5. Flip content_items.status → 'variant_generated' (if at least one succeeded)
 *   6. Audit trail per variant produced / failed
 *
 * Failure policy:
 *   - Per-platform generation failures do NOT abort the whole job — we record them
 *     in audit_logs and carry on. Partial success is better than all-or-nothing
 *     because running this again would re-burn LLM tokens.
 */
import {
  generateVariant,
  scoreGeo,
  checkCitations,
  buildRewriteHint,
  computeSimilarity,
  classifySimilarity,
  checkNumericFacts,
  chat,
  isAvailable as llmAvailable,
  scanKeywords,
  type KeywordRow,
  type VerifiedCitation,
} from '@geo/geo-core';
import { RECOMMENDED_COMBO, type GeoTacticId, type VariantPlatform } from '@geo/shared';
import PgBoss from 'pg-boss';
import { getServiceClient } from '../lib/supabase';

export type VariantGenerateJob = {
  content_item_id: string;
  tenant_id: string;
  platforms: VariantPlatform[];
  tactics?: GeoTacticId[];
  triggered_by?: string;
};

type ContentItemRow = {
  id: string;
  tenant_id: string;
  title: string;
  markdown: string;
  topics: string[];
  status: string;
  keyword_ids: string[] | null;
};

type TenantRow = {
  id: string;
  name: string;
  industry: string;
};

export async function handleVariantGenerate(data: VariantGenerateJob): Promise<void> {
  const { content_item_id, tenant_id, platforms, tactics, triggered_by } = data;
  const client = getServiceClient();
  const started = Date.now();

  console.log(
    `[variant-generate] content=${content_item_id} platforms=[${platforms.join(',')}]`,
  );

  // 1. Load context
  const { data: item, error: iErr } = await client
    .from('content_items')
    .select('id, tenant_id, title, markdown, topics, status, keyword_ids')
    .eq('id', content_item_id)
    .single<ContentItemRow>();
  if (iErr || !item) {
    console.error(`[variant-generate] content_item not found: ${iErr?.message}`);
    return;
  }
  if (item.tenant_id !== tenant_id) {
    console.error('[variant-generate] tenant mismatch');
    return;
  }
  if (!item.markdown || item.markdown.trim().length < 20) {
    console.error(`[variant-generate] markdown too short to generate from (len=${item.markdown?.length ?? 0})`);
    await writeAudit(tenant_id, triggered_by, 'content.variant_generate_skipped', content_item_id, {
      reason: 'markdown too short',
    });
    return;
  }

  const { data: tenant } = await client
    .from('tenants')
    .select('id, name, industry')
    .eq('id', tenant_id)
    .single<TenantRow>();

  // Brand drainage scope (migration 0026). The first non-deleted brand for
  // this tenant carries the service_areas array; passed into every variant
  // prompt below to prevent default tier-1-city framing. Empty array =
  // operator hasn't filled it yet → prompt falls back to legacy behavior.
  const { data: brandRow } = await client
    .from('brands')
    .select('service_areas')
    .eq('tenant_id', tenant_id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  const serviceAreas: string[] = Array.isArray(brandRow?.service_areas)
    ? (brandRow!.service_areas as string[]).map((s) => s.trim()).filter(Boolean)
    : [];

  const chosenTactics: GeoTacticId[] = tactics && tactics.length > 0 ? tactics : RECOMMENDED_COMBO;

  // Load tenant's verified-citations whitelist once. Used both for prompt
  // injection (LLM can only cite these) and post-hoc validation (flag any
  // citation in body that isn't in the list as suspected hallucination).
  const { data: verifiedRows } = await client
    .from('verified_citations')
    .select('id, title, title_aliases, key_claims')
    .eq('tenant_id', tenant_id)
    .eq('active', true)
    .is('deleted_at', null);
  const verifiedCitations: VerifiedCitation[] = (verifiedRows ?? []).map((r) => ({
    id: r.id as string,
    title: r.title as string,
    aliases: (r.title_aliases as string[] | null) ?? [],
  }));
  // 档位 C1 — same rows, with key_claims for the LLM-judge fact checker. Kept
  // separate from `verifiedCitations` because checkCitations only needs
  // titles/aliases (faster path, no extra column allocation).
  const citationsWithClaims = (verifiedRows ?? []).map((r) => ({
    title: r.title as string,
    aliases: (r.title_aliases as string[] | null) ?? [],
    key_claims: (r.key_claims as string[] | null) ?? [],
  }));

  // Prompt-time compliance scan setup (V1.9.1 anti-rejection feature).
  // Load A-level keywords ONCE so each platform's first-pass output can be
  // scanned synchronously; if it breaches, the retry hint includes the exact
  // offending spans, which the LLM cooperates with much better than the
  // abstract red-line list in SYSTEM_PROMPT. Cuts demo-dental's reject rate
  // (64% baseline in V1.9.1 audit) by feeding LLM its own violations.
  const { data: aLevelKwRows } = await client
    .from('compliance_keywords')
    .select('id, term, level, category, variants, platforms')
    .or(`tenant_id.is.null,tenant_id.eq.${tenant_id}`)
    .eq('level', 'A');
  const aLevelKeywords: KeywordRow[] = (aLevelKwRows ?? []).map((r) => ({
    id: r.id as string,
    term: r.term as string,
    level: 'A' as const,
    category: r.category as string,
    variants: (r.variants as string[] | null) ?? [],
    platforms: (r.platforms as string[] | null) ?? [],
  }));

  // ADR 007 — Wizard-selected keywords. variant-generate must:
  //   (1) inject them into the prompt as "must plant"
  //   (2) post-verify each appears in the generated body — missing ones
  //       trigger a combined rewrite hint (B1).
  // Loaded once per content_item, applied to every platform variant.
  const wizardKeywordIds = Array.isArray(item.keyword_ids) ? item.keyword_ids : [];
  let keywordsToPlant: string[] = [];
  if (wizardKeywordIds.length > 0) {
    const { data: kwRows } = await client
      .from('keywords')
      .select('text')
      .eq('tenant_id', tenant_id)
      .in('id', wizardKeywordIds)
      .is('deleted_at', null);
    keywordsToPlant = ((kwRows ?? []) as Array<{ text: string }>).map((r) => r.text);
  }

  // 2–4. Per-platform generate + insert + enqueue
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not set');
  const boss = new PgBoss({ connectionString: databaseUrl, schema: 'pgboss' });
  await boss.start();
  let successCount = 0;
  // Tier-C3: track variants inserted in THIS job run so the post-pass diff-
  // label generation only compares variants from the same generation cycle.
  // Mixing in older variants would make labels confusing ("differs from a
  // version generated 2 weeks ago by a different prompt").
  const processedVariantIds: string[] = [];
  try {
    await boss.createQueue('compliance.review');

    // Per-platform LLM calls run in parallel. A single content_item rarely
    // targets more than ~6 platforms, comfortably under typical Ark RPM
    // limits, so we don't bother with a concurrency cap. Per-platform errors
    // are isolated — one failure does not abort the others.
    const results = await Promise.allSettled(
      platforms.map((platform) => processPlatform(platform)),
    );
    successCount = results.filter((r) => r.status === 'fulfilled' && r.value).length;

    // Tier-C3: cross-platform diff labels — runs after all insertions land.
    // Best-effort: failures here don't fail the job (label is decorative).
    if (processedVariantIds.length >= 2) {
      try {
        await generateDiffLabels(client, processedVariantIds);
      } catch (err) {
        console.warn('[variant-generate] diff-label generation failed:', err);
      }
    }

    async function processPlatform(platform: VariantPlatform): Promise<boolean> {
      const t0 = Date.now();
      const baseInput = {
        source_markdown: item!.markdown,
        platform,
        tactics: chosenTactics,
        brand_name: tenant?.name,
        industry: tenant?.industry,
        topic_hints: item!.topics?.length ? item!.topics : undefined,
        verified_citations: verifiedCitations.map((c) => ({ title: c.title, aliases: c.aliases })),
        keywords_to_plant: keywordsToPlant.length > 0 ? keywordsToPlant : undefined,
        service_areas: serviceAreas.length > 0 ? serviceAreas : undefined,
      };
      const result = await generateVariant(baseInput);
      const elapsed = Date.now() - t0;

      if (!result.ok) {
        console.error(`[variant-generate] ${platform} failed (${elapsed}ms): ${result.reason}`);
        await writeAudit(
          tenant_id,
          triggered_by,
          'content.variant_generate_failed',
          content_item_id,
          { platform, reason: result.reason, provider: result.provider, elapsed_ms: elapsed },
        );
        return false;
      }

      // Prompt-time A-level keyword scan on v0. If breached, the retry hint
      // includes the exact offending spans so the LLM rewrites those specific
      // sentences rather than guessing what's wrong from an abstract rule list.
      const v0Scan = scanKeywords(
        `${result.variant.title}\n\n${result.variant.body}`,
        aLevelKeywords,
        platform,
      );
      const v0AHits = v0Scan.hits;

      const REWRITE_THRESHOLD = 70;
      const primaryKeyword = item!.topics?.[0]?.trim() ?? result.variant.title.slice(0, 8);

      // Sibling load happens once — used by both v0 and (potentially) v1
      // uniqueness checks. Cross-platform variants SHOULD differ.
      const { data: siblings } = await client
        .from('content_variants')
        .select('id, platform, body')
        .eq('content_item_id', content_item_id)
        .is('deleted_at', null);
      const siblingBodies = (siblings ?? []).map((s) => ({
        platform: s.platform as string,
        body: s.body as string,
      }));

      const score0 = evaluateVariant(
        result.variant.body,
        result.variant.title,
        primaryKeyword,
        keywordsToPlant,
        siblingBodies,
        verifiedCitations,
        0,
      );
      const initialTotal = score0.geo.total;

      // ONE combined rewrite covers GEO score gap (existing) + B1 missing
      // keyword planting + B2 cross-platform similarity. Total LLM calls per
      // variant capped at 2 (initial + at most one rewrite) regardless of
      // how many signals fire — runaway cost protection.
      let v = result.variant;
      let chosen = score0;

      const failedSignals = listFailedSignals(score0, REWRITE_THRESHOLD);
      const rewriteEligible =
        result.variant.provider !== 'stub' && (failedSignals.length > 0 || v0AHits.length > 0);

      if (rewriteEligible) {
        const hintParts: string[] = [];
        // Lead with the compliance hint — A-level breaches are non-negotiable.
        // GEO score is optimization, compliance is the floor.
        if (v0AHits.length > 0) {
          const lines = v0AHits
            .slice(0, 8)
            .map((h) => `• "${h.context_snippet}" → 命中: "${h.term}" (${h.category})`)
            .join('\n');
          hintParts.push(
            `# 合规红线触发(必须修复)\n你的上一稿命中了广告法 A 级红线,以下表述必须重写:\n${lines}\n\n重写要求:\n1. 保留 KB 引用的真实数据和品牌信息\n2. 用客观/科普风格替代"保证/绝对/第一/根治"类断言\n3. 患者效果用"临床研究显示"等中性表达\n4. 不再使用上述任何关键词及其变体(繁体、全角、空格分隔也禁用)`,
          );
        }
        if (score0.geo.total < REWRITE_THRESHOLD) {
          hintParts.push(buildRewriteHint(score0.geo));
        }
        if (score0.keyword.missing.length > 0) {
          hintParts.push(
            `# 关键词补漏\n以下关键词上一稿遗漏,本次必须自然嵌入(每个 ≥1 次):\n${score0.keyword.missing.map((k) => `• ${k}`).join('\n')}`,
          );
        }
        if (score0.uniqueness) {
          hintParts.push(
            `# 平台差异化\n与「${score0.uniqueness.platform}」平台变体相似度 ${score0.uniqueness.total} 过高。改写时换一个开头(不同钩子句)、调整段落顺序、用不同的真实案例细节,**不许**只是同义改词。`,
          );
        }

        const t1 = Date.now();
        const retry = await generateVariant({ ...baseInput, rewrite_hint: hintParts.join('\n\n') });
        if (retry.ok) {
          const score1 = evaluateVariant(
            retry.variant.body,
            retry.variant.title,
            primaryKeyword,
            keywordsToPlant,
            siblingBodies,
            verifiedCitations,
            1,
          );
          // Compliance-first override: A-level breaches trump GEO score.
          // If retry cleared (or reduced) the breach while v0 had it, take retry
          // even if combined score is lower — otherwise v0 re-triggers
          // downstream rejection and the retry was wasted.
          const v1Scan = v0AHits.length > 0
            ? scanKeywords(
                `${retry.variant.title}\n\n${retry.variant.body}`,
                aLevelKeywords,
                platform,
              )
            : null;
          const v1AHitCount = v1Scan?.hits.length ?? 0;
          const complianceImproved = v0AHits.length > 0 && v1AHitCount < v0AHits.length;
          const complianceWorsened = v0AHits.length === 0 && v1AHitCount > 0;

          // Combined metric:
          //   geo.total - 5 * missing_keywords - 5 * uniqueness_fail
          // — penalize each failed signal so a higher GEO with missing keywords
          // can still lose to a slightly lower GEO with all keywords planted.
          // Compliance override wins both ways.
          const combined0 = combinedScore(score0);
          const combined1 = combinedScore(score1);
          const takeRetry =
            complianceImproved ||
            (!complianceWorsened && combined1 > combined0);

          if (takeRetry) {
            v = retry.variant;
            chosen = score1;
            console.log(
              `[variant-generate] ${platform} rewrite picked v1 (combined ${combined0.toFixed(1)}→${combined1.toFixed(1)}, A-hits ${v0AHits.length}→${v1AHitCount}, ${Date.now() - t1}ms)`,
            );
          } else {
            console.log(
              `[variant-generate] ${platform} rewrite kept v0 (combined ${combined0.toFixed(1)} ≥ ${combined1.toFixed(1)}, A-hits ${v0AHits.length}/v1=${v1AHitCount})`,
            );
          }

          // Audit prompt-time compliance retry effectiveness (V1.9.1).
          // Emit only when the keyword hint actually fired, so the metric
          // measures the new feature's rescue rate cleanly.
          if (v0AHits.length > 0) {
            await writeAudit(
              tenant_id,
              triggered_by,
              'content.variant_prompt_compliance_retry',
              content_item_id,
              {
                platform,
                v0_a_hits: v0AHits.length,
                v0_hit_terms: v0AHits.slice(0, 5).map((h) => h.term),
                v1_a_hits: v1AHitCount,
                rescued: v1AHitCount === 0,
                picked: takeRetry ? 'v1' : 'v0',
              },
            );
          }
        }
      }

      const finalSignals = listFailedSignals(chosen, REWRITE_THRESHOLD);
      const geoScore = chosen.geo;
      const citationCheck = chosen.citation;

      // 档位 C1 — numeric fact-check runs AFTER citation_check on the chosen
      // variant. Skipped when the body has zero whitelisted citations (the
      // checkCitations() upstream gate already covered "title hallucination";
      // checkNumericFacts adds data-level grounding only when there's a
      // citation+number co-occurrence to verify).
      let numericCheck = null as Awaited<ReturnType<typeof checkNumericFacts>> | null;
      if (citationCheck.matches.length > 0) {
        try {
          numericCheck = await checkNumericFacts(v.body, citationsWithClaims);
        } catch (err) {
          console.warn(
            `[variant-generate] ${platform} numeric-fact-check failed:`,
            err,
          );
        }
      }

      const { data: inserted, error: insErr } = await client
        .from('content_variants')
        .insert({
          tenant_id,
          content_item_id,
          platform,
          title: v.title,
          body: v.body,
          geo_tactics: v.tactics_applied,
          extra_assets: {
            notes: v.notes,
            llm_provider: v.provider,
            llm_usage: v.usage ?? null,
            initial_geo_total: initialTotal,
            keyword_check: {
              total: chosen.keyword.total,
              matched: chosen.keyword.matched,
              missing: chosen.keyword.missing,
            },
            ...(chosen.uniqueness && { uniqueness_warning: chosen.uniqueness }),
            ...(finalSignals.length > 0 && { unresolved_signals: finalSignals }),
          },
          geo_score: geoScore,
          citation_check: citationCheck,
          numeric_check: numericCheck,
          compliance_status: 'pending',
          status: 'draft',
        })
        .select('id')
        .single();
      if (insErr || !inserted) {
        console.error(`[variant-generate] insert variant failed: ${insErr?.message}`);
        return false;
      }
      processedVariantIds.push(inserted.id as string);

      await writeAudit(
        tenant_id,
        triggered_by,
        'content.variant_generated',
        inserted.id as string,
        {
          platform,
          provider: v.provider,
          tactics_applied: v.tactics_applied,
          elapsed_ms: elapsed,
          tokens: v.usage?.total_tokens ?? null,
        },
      );

      await boss.send('compliance.review', {
        variant_id: inserted.id,
        tenant_id,
        triggered_by,
      });

      const cite = citationCheck.unmatched.length > 0
        ? `cite=⚠️${citationCheck.unmatched.length}suspect`
        : `cite=✓${citationCheck.matches.length}`;
      console.log(
        `[variant-generate] ${platform} → variant=${inserted.id} geo=${geoScore.total}/100 ${cite} (${v.provider}, ${elapsed}ms)`,
      );
      return true;
    }
  } finally {
    await boss.stop({ graceful: true, timeout: 5000 });
  }

  // 5. Flip content status only if at least one variant landed and we haven't already done so.
  if (successCount > 0 && item.status !== 'variant_generated') {
    await client
      .from('content_items')
      .update({ status: 'variant_generated' })
      .eq('id', content_item_id);
  }

  console.log(
    `[variant-generate] done content=${content_item_id} success=${successCount}/${platforms.length} total=${Date.now() - started}ms`,
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Quality signal helpers (V1.7+ B1/B2 — combined-rewrite design)
// ─────────────────────────────────────────────────────────────────────────

type VariantScores = {
  geo: ReturnType<typeof scoreGeo>;
  citation: ReturnType<typeof checkCitations>;
  keyword: { total: number; matched: string[]; missing: string[] };
  uniqueness: { platform: string; total: number; verdict: string } | null;
};

function evaluateVariant(
  body: string,
  title: string,
  primaryKeyword: string,
  keywordsToPlant: string[],
  siblings: Array<{ platform: string; body: string }>,
  verifiedCitations: VerifiedCitation[],
  rewriteCount: number,
): VariantScores {
  const geo = scoreGeo({ title, body, primary_keyword: primaryKeyword, rewrite_count: rewriteCount });
  const citation = checkCitations(body, verifiedCitations);
  const keyword = checkKeywordPresence(body, keywordsToPlant);

  let uniqueness: VariantScores['uniqueness'] = null;
  for (const s of siblings) {
    const sim = computeSimilarity(body, s.body);
    if (classifySimilarity(sim.total) === 'rewrite') {
      uniqueness = { platform: s.platform, total: Number(sim.total.toFixed(3)), verdict: 'rewrite' };
      break;
    }
  }
  return { geo, citation, keyword, uniqueness };
}

function checkKeywordPresence(
  body: string,
  keywords: string[],
): { total: number; matched: string[]; missing: string[] } {
  if (keywords.length === 0) return { total: 0, matched: [], missing: [] };
  // Strip whitespace before matching: "种植 牙价格" in keyword should still
  // hit "种植牙价格" in body and vice versa. Punctuation insensitivity isn't
  // worth the false positives — a keyword "种植牙" hitting "无种植牙不可"
  // is fine; that's still natural usage.
  const norm = body.replace(/\s+/g, '');
  const matched: string[] = [];
  const missing: string[] = [];
  for (const k of keywords) {
    const kn = k.replace(/\s+/g, '');
    if (kn.length === 0) continue;
    if (norm.includes(kn)) matched.push(k);
    else missing.push(k);
  }
  return { total: keywords.length, matched, missing };
}

/** Returns short symbolic names of the signals that failed for this variant. */
function listFailedSignals(s: VariantScores, geoMin: number): string[] {
  const out: string[] = [];
  if (s.geo.total < geoMin) out.push(`geo<${geoMin}`);
  if (s.keyword.missing.length > 0) out.push(`kw_miss=${s.keyword.missing.length}`);
  if (s.uniqueness) out.push(`uniq>=0.7`);
  if (s.citation.verdict === 'suspected_hallucination') out.push('cite_hallu');
  return out;
}

/**
 * Combined quality score for v0-vs-v1 selection. Each failed signal subtracts
 * a flat 5 points so a 70-with-all-keywords beats a 75-missing-2-keywords.
 * Citation hallucinations cost more (10) — that's the most dangerous signal
 * because compliance review treats it as hard-block downstream.
 */
function combinedScore(s: VariantScores): number {
  let score = s.geo.total;
  score -= 5 * s.keyword.missing.length;
  score -= s.uniqueness ? 5 : 0;
  score -= s.citation.verdict === 'suspected_hallucination' ? 10 : 0;
  return score;
}

// ─────────────────────────────────────────────────────────────────────────
// 档位 C3 — Cross-platform diff label generation
// ─────────────────────────────────────────────────────────────────────────

const DIFF_LABEL_SIM_THRESHOLD = 0.5;

type DiffLabelVariantRow = {
  id: string;
  platform: string;
  body: string;
  extra_assets: Record<string, unknown> | null;
};

/**
 * Per-variant short label (≤30 chars zh) explaining how this version differs
 * stylistically from its closest sibling. Surfaced in compliance UI so admin
 * sees "this 公众号 version is the long-form one; 抖音 version is the punchy
 * one" without re-reading bodies.
 *
 * Skipped when the variant has no sibling above DIFF_LABEL_SIM_THRESHOLD —
 * if all variants are already very different, there's nothing to explain.
 *
 * Cost: ONE batched LLM call regardless of variant count. Failures are
 * non-blocking (label is decorative).
 */
async function generateDiffLabels(
  client: ReturnType<typeof getServiceClient>,
  variantIds: string[],
): Promise<void> {
  if (!llmAvailable() || variantIds.length < 2) return;

  const { data: rows } = await client
    .from('content_variants')
    .select('id, platform, body, extra_assets')
    .in('id', variantIds);
  const variants = (rows ?? []) as DiffLabelVariantRow[];
  if (variants.length < 2) return;

  // Find each variant's most-similar sibling (above threshold).
  type Pair = {
    variant: DiffLabelVariantRow;
    sibling: DiffLabelVariantRow;
    similarity: number;
  };
  const pairs: Pair[] = [];
  for (const v of variants) {
    let best: DiffLabelVariantRow | null = null;
    let bestSim = 0;
    for (const s of variants) {
      if (s.id === v.id) continue;
      const sim = computeSimilarity(v.body, s.body).total;
      if (sim > bestSim) {
        bestSim = sim;
        best = s;
      }
    }
    if (best && bestSim >= DIFF_LABEL_SIM_THRESHOLD) {
      pairs.push({ variant: v, sibling: best, similarity: bestSim });
    }
  }
  if (pairs.length === 0) return;

  // Batch all pairs into ONE LLM call. Each variant gets its own label.
  const numbered = pairs
    .map((p, i) => {
      const aHead = p.variant.body.slice(0, 200).replace(/\s+/g, ' ');
      const bHead = p.sibling.body.slice(0, 200).replace(/\s+/g, ' ');
      return [
        `案例 ${i + 1} [variant_id=${p.variant.id}]`,
        `  - 当前版本(${p.variant.platform}):${aHead}...`,
        `  - 最相似的兄弟版本(${p.sibling.platform}):${bHead}...`,
      ].join('\n');
    })
    .join('\n\n');

  const messages = [
    {
      role: 'system' as const,
      content:
        '你是一名内容编辑助手。任务:对每个案例,用 ≤25 个汉字概括"当前版本"相比"兄弟版本"在风格/重点/口吻上的差异。' +
        '语气要像编辑给同事的简短备注,不要套话。\n\n' +
        '严格输出 JSON: {"labels": [{"variant_id": "...", "label": "..."}]}',
    },
    { role: 'user' as const, content: numbered },
  ];

  let parsed: { labels?: Array<{ variant_id?: string; label?: string }> };
  try {
    const result = await chat({
      messages,
      temperature: 0.4,
      response_format: 'json_object',
      timeout_ms: 60_000,
      max_tokens: 800,
    });
    parsed = JSON.parse(result.content);
  } catch (err) {
    console.warn('[variant-generate] diff-label LLM call failed:', err);
    return;
  }

  if (!Array.isArray(parsed.labels)) return;

  // Apply labels: SELECT existing extra_assets, merge in JS, UPDATE.
  // Yes, N round-trips for N variants — acceptable since this runs once at
  // end-of-job, and the labels are short. JSONB merge via raw SQL would be
  // faster but adds complexity for limited gain.
  for (const entry of parsed.labels) {
    if (!entry.variant_id || !entry.label) continue;
    const v = variants.find((x) => x.id === entry.variant_id);
    if (!v) continue;
    const trimmed = entry.label.slice(0, 50);
    const merged = {
      ...(v.extra_assets ?? {}),
      diff_label: trimmed,
    };
    const { error } = await client
      .from('content_variants')
      .update({ extra_assets: merged })
      .eq('id', v.id);
    if (error) {
      console.warn(`[variant-generate] diff-label update ${v.id} failed:`, error);
    }
  }

  console.log(
    `[variant-generate] diff-labels generated for ${parsed.labels.length}/${pairs.length} pairs`,
  );
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
    target_type: action.startsWith('content.variant_generated') ? 'content_variant' : 'content_item',
    target_id,
    payload,
  });
}
