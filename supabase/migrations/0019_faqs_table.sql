-- 0019_faqs_table: FAQ entries.
--
-- Why a separate table from knowledge_sources: FAQs are first-class
-- public-facing entities (schema.org/FAQPage), with an explicit Q&A shape.
-- The KB has free-form documents which the worker auto-extracts FAQs FROM,
-- but the manually curated FAQ list is what we publish.
--
-- brand_id nullable: tenant-wide FAQ ("我们医院能用医保吗?") + brand-specific
-- FAQ ("XX 院区周末营业吗?") both supported.
--
-- See: docs/06-discoverability.md §四, ADR 005.

CREATE TABLE IF NOT EXISTS public.faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  question text NOT NULL,
  answer_md text NOT NULL,
  category text,
  -- Display order within category. Lower = earlier.
  sort_order integer NOT NULL DEFAULT 0,
  geo_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS faqs_tenant_idx
  ON public.faqs (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS faqs_brand_idx
  ON public.faqs (brand_id) WHERE deleted_at IS NULL AND brand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS faqs_public_idx
  ON public.faqs (tenant_id, category, sort_order)
  WHERE geo_visible = true AND deleted_at IS NULL;

ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "faqs_read" ON public.faqs FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_user_tenant_ids()));

CREATE POLICY "faqs_write" ON public.faqs FOR ALL TO authenticated
  USING (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator']))
  WITH CHECK (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator']));

COMMENT ON TABLE public.faqs IS
  'Curated FAQ list. Drives schema.org/FAQPage + llms-full.txt. geo_visible defaults true (FAQs are inherently public).';
