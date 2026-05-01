/**
 * V1.7 build-on-write artifact regeneration (D17).
 *
 * Trigger: enqueued by admin actions that mutate any entity feeding the
 * Discoverability Layer (brands, staff_accounts.geo_profile_visible,
 * services, testimonials, faqs, content_items). Also runs nightly via cron
 * as a safety net for missed enqueues.
 *
 * Steps:
 *   1. Load tenant + discoverability settings (filter: public_enabled).
 *      If public_enabled=false, no-op (don't waste cycles).
 *   2. Load all entities for tenant, applying the D16 double-gate:
 *        - geo_visible = true (every entity)
 *        - testimonials: compliance_status = 'approved'
 *        - staff_accounts: status = 'active'
 *   3. Convert rows → GeoProfile via builders from @geo/geo-core
 *   4. Run 4 artifact generators (llms.txt / llms-full.txt / feed.json /
 *      sitemap.xml)
 *   5. SHA-256 each → etag
 *   6. UPSERT into discoverability_artifacts (one row per artifact_type)
 *
 * Side effects: writes to discoverability_artifacts. Does NOT touch any
 * tenant-owned table.
 *
 * Failures:
 *   - Tenant not found / public_enabled=false → log + skip (not an error)
 *   - DB error during read/write → reportError + propagate (pg-boss retries)
 */

import { createHash } from 'node:crypto';
import { reportError } from '@geo/shared';
import {
  type ArtifactInput,
  buildArticleProfile,
  buildBrandProfile,
  buildFaqProfile,
  buildPhysicianProfile,
  buildServiceProfile,
  buildTestimonialProfile,
  generateAiSitemap,
  generateContentFeed,
  generateLlmsTxt,
  generateLlmsTxtFull,
} from '@geo/geo-core';
import { getServiceClient } from '../lib/supabase';

export type DiscoverabilityRegenerateJob = {
  tenant_id: string;
};

const PUBLIC_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://geo.studio';
/** Articles to include in artifacts. More = better signal but slower regen + larger files. */
const MAX_ARTICLES = 50;

export async function handleDiscoverabilityRegenerate(
  job: DiscoverabilityRegenerateJob,
): Promise<void> {
  const supabase = getServiceClient();

  // ── 1. Tenant + opt-in check ────────────────────────────────────────
  const { data: tenant, error: tenantErr } = await supabase
    .from('tenants')
    .select('id, slug, settings')
    .eq('id', job.tenant_id)
    .is('deleted_at', null)
    .maybeSingle();
  if (tenantErr) throw new Error(`tenant lookup failed: ${tenantErr.message}`);
  if (!tenant) {
    console.warn(`[discoverability] tenant ${job.tenant_id} not found, skipping`);
    return;
  }

  const settings = (tenant.settings ?? {}) as Record<string, unknown>;
  const disco = (settings.discoverability ?? {}) as Record<string, unknown>;
  if (disco.public_enabled !== true) {
    console.log(`[discoverability] tenant ${tenant.slug} not opted-in, skipping`);
    return;
  }

  // ── 2. Brand (single — first non-deleted) ──────────────────────────
  const { data: brandRow, error: brandErr } = await supabase
    .from('brands')
    .select('*')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (brandErr) throw new Error(`brand lookup failed: ${brandErr.message}`);
  if (!brandRow) {
    console.warn(`[discoverability] tenant ${tenant.slug} has no brand, skipping`);
    return;
  }

  const opts = { publicBaseUrl: PUBLIC_BASE_URL, tenantSlug: tenant.slug };

  // ── 3. Physicians (D16: geo_profile_visible + active + not deleted) ─
  const { data: staffRows } = await supabase
    .from('staff_accounts')
    .select('id, tenant_id, brand_id, real_name, role, persona, credentials, bio_md_path, updated_at')
    .eq('tenant_id', tenant.id)
    .eq('geo_profile_visible', true)
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  // ── 4. Services (D16: geo_visible) ──────────────────────────────────
  const { data: serviceRows } = await supabase
    .from('services')
    .select('*')
    .eq('tenant_id', tenant.id)
    .eq('geo_visible', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  // ── 5. Testimonials (D16: geo_visible + compliance_status='approved') ─
  const { data: testimonialRows } = await supabase
    .from('testimonials')
    .select('*')
    .eq('tenant_id', tenant.id)
    .eq('geo_visible', true)
    .eq('compliance_status', 'approved')
    .is('deleted_at', null)
    .order('attested_at', { ascending: false });

  // ── 6. FAQs (D16: geo_visible) ──────────────────────────────────────
  const { data: faqRows } = await supabase
    .from('faqs')
    .select('*')
    .eq('tenant_id', tenant.id)
    .eq('geo_visible', true)
    .is('deleted_at', null)
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true });

  // ── 7. Recent published content (top N) ─────────────────────────────
  const { data: contentRows } = await supabase
    .from('content_items')
    .select('id, tenant_id, title, markdown, status, created_at, updated_at')
    .eq('tenant_id', tenant.id)
    .eq('status', 'published')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(MAX_ARTICLES);

  // ── 8. Build profiles ───────────────────────────────────────────────
  const brand = buildBrandProfile(brandRow, opts);
  const physicians = (staffRows ?? []).map((r) => buildPhysicianProfile(r, opts));
  const services = (serviceRows ?? []).map((r) => buildServiceProfile(r, opts));
  const testimonials = (testimonialRows ?? []).map((r) =>
    buildTestimonialProfile(r, opts),
  );
  const faqs = (faqRows ?? []).map((r) => buildFaqProfile(r, opts));
  const articles = (contentRows ?? []).map((r) => buildArticleProfile(r, opts));

  const generated_at = new Date().toISOString();
  const input: ArtifactInput = {
    tenant_id: tenant.id,
    tenant_slug: tenant.slug,
    public_base_url: PUBLIC_BASE_URL,
    generated_at,
    brand,
    physicians,
    services,
    testimonials,
    faqs,
    articles,
  };

  // ── 9. Generate + persist 4 artifacts ───────────────────────────────
  const artifacts: Array<{ type: string; content: string }> = [
    { type: 'llms_txt', content: generateLlmsTxt(input) },
    { type: 'llms_full', content: generateLlmsTxtFull(input) },
    { type: 'feed_json', content: generateContentFeed(input) },
    { type: 'sitemap_xml', content: generateAiSitemap(input) },
  ];

  for (const art of artifacts) {
    const etag = createHash('sha256').update(art.content).digest('base64url');
    const { error: upsertErr } = await supabase
      .from('discoverability_artifacts')
      .upsert(
        {
          tenant_id: tenant.id,
          artifact_type: art.type,
          content: art.content,
          etag,
          generated_at,
          updated_at: generated_at,
        },
        { onConflict: 'tenant_id,artifact_type' },
      );
    if (upsertErr) {
      reportError(upsertErr, {
        scope: 'worker.discoverability_regenerate',
        tenant_id: tenant.id,
        extra: { artifact_type: art.type },
      });
      throw new Error(`upsert ${art.type} failed: ${upsertErr.message}`);
    }
  }

  console.log(
    `[discoverability] regenerated for ${tenant.slug}: ` +
      `${physicians.length} doctors, ${services.length} services, ` +
      `${testimonials.length} testimonials, ${faqs.length} faqs, ${articles.length} articles`,
  );
}
