'use server';

import PgBoss from 'pg-boss';
import { revalidatePath } from 'next/cache';
import {
  generateVariant,
  scoreGeo,
  buildRewriteHint,
  checkCitations,
  type VerifiedCitation,
} from '@geo/geo-core';
import { requireRole } from '@/lib/tenant';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

/**
 * AI 救援:对低分变体跑一轮重写,新变体附入同一 content_item.
 *
 * 流程:
 *   1. 加载原变体 + 原 content_item.markdown(作为重写的 source)
 *   2. 用原变体的 geo_score 弱项构造 rewrite_hint
 *   3. 调用 generateVariant 产新变体
 *   4. 重新评分 + citation_check
 *   5. 写入 content_variants(同 content_item_id, 同 platform, 新 row)
 *   6. 入队 compliance.review,自动跑三道门
 *
 * 不改原变体 — 救援是新增,不是覆盖. 这样万一新版本反而更差,
 * 老版本依然可用.
 */
export async function rescueVariant(
  tenantSlug: string,
  variantId: string,
): Promise<
  | { ok: true; new_variant_id: string; new_score: number; old_score: number }
  | { ok: false; error: string }
> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const service = getSupabaseServiceClient();

  // 1. Load origin variant
  const { data: origin } = await service
    .from('content_variants')
    .select('id, tenant_id, content_item_id, platform, title, body, geo_tactics, geo_score, extra_assets')
    .eq('id', variantId)
    .single();
  if (!origin) return { ok: false, error: '原变体未找到' };
  if (origin.tenant_id !== tenant.id) return { ok: false, error: '租户不匹配' };

  const oldScore = (origin.geo_score?.total as number | undefined) ?? 0;

  // RES-1 (P0-2) — cap rescue attempts. extra_assets.rescued_into is the
  // forward link maintained by previous rescue runs. Default cap 3 — anything
  // more probably means the source markdown itself is the bottleneck (no
  // amount of rewriting will reach 80 without better material).
  const RESCUE_MAX_ATTEMPTS = 3;
  const existingRescues = Array.isArray(
    (origin.extra_assets as Record<string, unknown> | null)?.rescued_into,
  )
    ? ((origin.extra_assets as Record<string, unknown>).rescued_into as string[])
    : [];
  if (existingRescues.length >= RESCUE_MAX_ATTEMPTS) {
    return {
      ok: false,
      error: `该变体已救援 ${existingRescues.length} 次,达到上限 ${RESCUE_MAX_ATTEMPTS}。再救多半也救不动 — 建议改写源 markdown 后重新生成,或人工编辑这条变体。`,
    };
  }

  // 2. Load source content_item
  const { data: item } = await service
    .from('content_items')
    .select('id, markdown, topics')
    .eq('id', origin.content_item_id)
    .single();
  if (!item || !item.markdown) {
    return { ok: false, error: '原内容条目缺失 markdown,无法重写' };
  }

  // 3. Tenant brand info + verified citations
  const { data: tenantRow } = await service
    .from('tenants')
    .select('name, industry')
    .eq('id', tenant.id)
    .single();
  const { data: verifiedRows } = await service
    .from('verified_citations')
    .select('id, title, title_aliases')
    .eq('tenant_id', tenant.id)
    .eq('active', true)
    .is('deleted_at', null);
  const verifiedCitations: VerifiedCitation[] = (verifiedRows ?? []).map((r) => ({
    id: r.id as string,
    title: r.title as string,
    aliases: (r.title_aliases as string[] | null) ?? [],
  }));

  // 4. Build rewrite hint from origin's geo_score
  const oldScoreObj = origin.geo_score as Parameters<typeof buildRewriteHint>[0] | null;
  // RES-1 (P1-3) — fallback hint says "≥ 70" to match REWRITE_THRESHOLD in
  // variant-generate. Saying "≥ 80" set a target the actual scorer never
  // enforced, leaving operators puzzled when "rescue succeeded" still meant
  // "below your stated goal".
  const hint = oldScoreObj?.breakdown
    ? buildRewriteHint(oldScoreObj)
    : '上一版整体偏弱,本轮请加强数据/引用/句式精简,综合分目标 ≥ 70.';

  // 5. Generate
  const result = await generateVariant({
    source_markdown: item.markdown,
    platform: origin.platform as Parameters<typeof generateVariant>[0]['platform'],
    tactics: (origin.geo_tactics as Parameters<typeof generateVariant>[0]['tactics']) ?? [],
    brand_name: tenantRow?.name as string | undefined,
    industry: tenantRow?.industry as string | undefined,
    topic_hints: (item.topics as string[] | null) ?? undefined,
    verified_citations: verifiedCitations.map((c) => ({ title: c.title, aliases: c.aliases })),
    rewrite_hint: hint,
  });
  if (!result.ok) {
    return { ok: false, error: `AI 重写失败:${result.reason}` };
  }
  const v = result.variant;

  // 6. Score + citation check
  const primaryKeyword = (item.topics as string[] | null)?.[0]?.trim() ?? v.title.slice(0, 8);
  const newScore = scoreGeo({
    title: v.title,
    body: v.body,
    primary_keyword: primaryKeyword,
    rewrite_count: 1,
  });
  const citationCheck = checkCitations(v.body, verifiedCitations);

  // 7. Insert new variant
  const { data: inserted, error: insErr } = await service
    .from('content_variants')
    .insert({
      tenant_id: tenant.id,
      content_item_id: origin.content_item_id,
      platform: origin.platform,
      title: v.title,
      body: v.body,
      geo_tactics: v.tactics_applied,
      extra_assets: {
        notes: v.notes,
        llm_provider: v.provider,
        llm_usage: v.usage ?? null,
        rescued_from_variant_id: origin.id,
      },
      geo_score: newScore,
      citation_check: citationCheck,
      compliance_status: 'pending',
      status: 'draft',
    })
    .select('id')
    .single();
  if (insErr || !inserted) {
    return { ok: false, error: `写入新变体失败:${insErr?.message}` };
  }

  // RES-1 (P0-3) — record forward link on origin so the rescue page can
  // hide already-rescued variants and operators see the lineage. Best-effort:
  // a failure here doesn't unwind the new variant (it's already valid).
  const updatedRescuedInto = [...existingRescues, inserted.id as string];
  const newOriginAssets = {
    ...((origin.extra_assets as Record<string, unknown> | null) ?? {}),
    rescued_into: updatedRescuedInto,
  };
  const { error: markErr } = await service
    .from('content_variants')
    .update({ extra_assets: newOriginAssets })
    .eq('id', origin.id);
  if (markErr) {
    console.warn('[rescue] mark origin failed:', markErr.message);
  }

  // 8. Audit
  await service.from('audit_logs').insert({
    tenant_id: tenant.id,
    action: 'content.variant_rescued',
    target_type: 'content_variant',
    target_id: inserted.id,
    payload: {
      origin_variant_id: origin.id,
      old_score: oldScore,
      new_score: newScore.total,
      rescue_attempt: updatedRescuedInto.length,
      hint_excerpt: hint.slice(0, 200),
    },
  });

  // 9. Enqueue compliance
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    const boss = new PgBoss({ connectionString: databaseUrl, schema: 'pgboss' });
    await boss.start();
    try {
      await boss.createQueue('compliance.review');
      await boss.send('compliance.review', {
        variant_id: inserted.id,
        tenant_id: tenant.id,
      });
    } finally {
      await boss.stop({ graceful: true, timeout: 5000 });
    }
  }

  revalidatePath(`/t/${tenantSlug}/content/rescue`);
  revalidatePath(`/t/${tenantSlug}/compliance/${inserted.id}`);
  return { ok: true, new_variant_id: inserted.id as string, new_score: newScore.total, old_score: oldScore };
}
