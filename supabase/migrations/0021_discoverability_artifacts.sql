-- 0021_discoverability_artifacts: materialized cache of public-facing
--   artifacts(llms.txt / llms-full.txt / feed.json / sitemap.xml).
--
-- D17 build-on-write strategy:
--   1. Admin saves service/FAQ/testimonial → revalidatePath + enqueue
--      'discoverability.regenerate' job
--   2. Worker rebuilds 4 artifacts for that tenant, upserts here
--   3. Public route reads single row (artifact_type, tenant_id) — sub-50ms
--
-- Worker writes are service-role (bypass RLS). Public routes read via
-- service-role too because public visitors have no auth context (D16 explicit
-- filter at code layer instead of relying on RLS policy).
--
-- etag: SHA-256 of content for HTTP If-None-Match support on public routes.
--
-- See: docs/06-discoverability.md §六 缓存策略, ADR 005.

CREATE TABLE IF NOT EXISTS public.discoverability_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  artifact_type text NOT NULL
    CHECK (artifact_type IN ('llms_txt','llms_full','feed_json','sitemap_xml')),
  -- Body of the artifact (text or stringified JSON).
  content text NOT NULL,
  -- SHA-256 of content. Public routes use this for ETag / 304 Not Modified.
  etag text NOT NULL,
  -- When this was rebuilt by the worker. Public routes may reject stale rows
  -- older than tenant settings.discoverability.thresholds.cache_max_age (TBD).
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS discoverability_artifacts_tenant_type_uq
  ON public.discoverability_artifacts (tenant_id, artifact_type);

-- RLS: this table is system-managed. Tenant members can READ to preview;
-- only service-role can WRITE (worker job).
ALTER TABLE public.discoverability_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "discoverability_artifacts_read" ON public.discoverability_artifacts
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_user_tenant_ids()));

-- No INSERT/UPDATE/DELETE policy → only service_role can write.

COMMENT ON TABLE public.discoverability_artifacts IS
  'Materialized cache of public artifacts (llms.txt/feed.json/sitemap.xml). Worker writes via service_role.';
