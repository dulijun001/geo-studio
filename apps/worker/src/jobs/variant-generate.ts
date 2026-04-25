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
import { generateVariant } from '@geo/geo-core';
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

  // 2–4. Per-platform generate + insert + enqueue
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not set');
  const boss = new PgBoss({ connectionString: databaseUrl, schema: 'pgboss' });
  await boss.start();
  let successCount = 0;
  try {
    await boss.createQueue('compliance.review');

    for (const platform of platforms) {
      const t0 = Date.now();
      const result = await generateVariant({
        source_markdown: item.markdown,
        platform,
        tactics: chosenTactics,
        brand_name: tenant?.name,
        industry: tenant?.industry,
        topic_hints: item.topics?.length ? item.topics : undefined,
      });
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
        continue;
      }

      const v = result.variant;
      const { data: inserted, error: insErr } = await client
        .from('content_variants')
        .insert({
          tenant_id,
          content_item_id,
          platform,
          title: v.title,
          body: v.body,
          geo_tactics: v.tactics_applied,
          extra_assets: { notes: v.notes, llm_provider: v.provider, llm_usage: v.usage ?? null },
          compliance_status: 'pending',
          status: 'draft',
        })
        .select('id')
        .single();
      if (insErr || !inserted) {
        console.error(`[variant-generate] insert variant failed: ${insErr?.message}`);
        continue;
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

      // 4. Kick off compliance review — reviews will flip variant state asynchronously.
      await boss.send('compliance.review', {
        variant_id: inserted.id,
        tenant_id,
        triggered_by,
      });

      successCount++;
      console.log(
        `[variant-generate] ${platform} → variant=${inserted.id} (${v.provider}, ${elapsed}ms)`,
      );
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
