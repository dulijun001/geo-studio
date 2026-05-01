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
    .select('id, tenant_id, title, markdown, topics, status')
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

  const chosenTactics: GeoTacticId[] = tactics && tactics.length > 0 ? tactics : RECOMMENDED_COMBO;

  // Load tenant's verified-citations whitelist once. Used both for prompt
  // injection (LLM can only cite these) and post-hoc validation (flag any
  // citation in body that isn't in the list as suspected hallucination).
  const { data: verifiedRows } = await client
    .from('verified_citations')
    .select('id, title, title_aliases')
    .eq('tenant_id', tenant_id)
    .eq('active', true)
    .is('deleted_at', null);
  const verifiedCitations: VerifiedCitation[] = (verifiedRows ?? []).map((r) => ({
    id: r.id as string,
    title: r.title as string,
    aliases: (r.title_aliases as string[] | null) ?? [],
  }));

  // 2–4. Per-platform generate + insert + enqueue
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not set');
  const boss = new PgBoss({ connectionString: databaseUrl, schema: 'pgboss' });
  await boss.start();
  let successCount = 0;
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

      // GEO 9-tactic scoring runs before insert so the row carries it from
      // birth — UI / compliance reviewers see the breakdown immediately.
      // Auto-rewrite kicks in if total < REWRITE_THRESHOLD: re-call LLM with
      // a hint focused on the weakest tactics, score the result, keep the
      // higher of the two. Capped at 1 retry per variant to avoid runaway
      // cost (Doubao Pro single call ~ ¥0.05-0.2, 2 calls fine, 5+ wasteful).
      const REWRITE_THRESHOLD = 70;
      const primaryKeyword = item!.topics?.[0]?.trim() ?? result.variant.title.slice(0, 8);
      let v = result.variant;
      let geoScore = scoreGeo({ title: v.title, body: v.body, primary_keyword: primaryKeyword });
      const initialTotal = geoScore.total;

      if (geoScore.total < REWRITE_THRESHOLD && result.variant.provider !== 'stub') {
        const hint = buildRewriteHint(geoScore);
        const t1 = Date.now();
        const retry = await generateVariant({ ...baseInput, rewrite_hint: hint });
        if (retry.ok) {
          const retryScore = scoreGeo({
            title: retry.variant.title,
            body: retry.variant.body,
            primary_keyword: primaryKeyword,
            rewrite_count: 1,
          });
          if (retryScore.total > geoScore.total) {
            v = retry.variant;
            geoScore = retryScore;
            console.log(
              `[variant-generate] ${platform} rewrite improved ${initialTotal}→${retryScore.total} (+${retryScore.total - initialTotal}) in ${Date.now() - t1}ms`,
            );
          } else {
            console.log(
              `[variant-generate] ${platform} rewrite kept original (${initialTotal} >= ${retryScore.total})`,
            );
          }
        }
      }

      // Hallucination check — every 《...》 / 指南 / 学会 mention in the body
      // must trace to verified_citations. Flagged citations land in the
      // citation_check column; downstream compliance UI surfaces them red.
      const citationCheck = checkCitations(v.body, verifiedCitations);

      // Uniqueness check (V1.7 b1): compare this variant body against any
      // sibling variants already generated for the same content_item. Cross-
      // platform variants SHOULD differ — if any pair lands ≥ 0.7 similarity,
      // record it on the variant so admin sees it on the detail page. We do
      // NOT auto-rewrite here (the inner retry loop already used the GEO
      // score signal); auto-rewriting on uniqueness too would risk runaway
      // loops since the LLM may produce another similar variant.
      const { data: siblings } = await client
        .from('content_variants')
        .select('id, platform, body')
        .eq('content_item_id', content_item_id)
        .is('deleted_at', null);
      let uniquenessWarning: { platform: string; total: number; verdict: string } | null = null;
      for (const s of siblings ?? []) {
        const sim = computeSimilarity(v.body, s.body as string);
        const verdict = classifySimilarity(sim.total);
        if (verdict === 'rewrite') {
          uniquenessWarning = {
            platform: s.platform as string,
            total: Number(sim.total.toFixed(3)),
            verdict,
          };
          console.log(
            `[variant-generate] ${platform} 与 ${s.platform} 高度相似(${sim.total.toFixed(3)}),已标记 uniqueness_warning`,
          );
          break;
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
            ...(uniquenessWarning && { uniqueness_warning: uniquenessWarning }),
          },
          geo_score: geoScore,
          citation_check: citationCheck,
          compliance_status: 'pending',
          status: 'draft',
        })
        .select('id')
        .single();
      if (insErr || !inserted) {
        console.error(`[variant-generate] insert variant failed: ${insErr?.message}`);
        return false;
      }

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
