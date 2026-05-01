-- 0017_services_table: catalog of medical procedures / treatments offered.
--
-- Why a separate table (not inside brands JSONB): services have their own
-- lifecycle (price changes, retired procedures), need indexed queries for
-- schema/feed generation, and can be referenced by testimonials.service_id.
--
-- Map to schema.org/MedicalProcedure (or Service for non-clinical offers).
--
-- D14/D19: explicit FK with ON DELETE CASCADE. Don't use the broken
-- tenantFk() helper from packages/db/src/schema/_shared.ts.
--
-- See: docs/06-discoverability.md §四, ADR 005.

CREATE TABLE IF NOT EXISTS public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  description_md text,
  -- {min: 5000, max: 30000, currency: "CNY", typical: 12000}. Null = price on inquiry.
  price_range jsonb,
  duration_minutes integer,
  -- SNOMED CT code or internal taxonomy. e.g. "DENTAL_IMPLANT" / "ORTHODONTICS".
  -- Used as schema.org/MedicalProcedure.code.
  medical_procedure_code text,
  -- Visible category label for UI grouping. e.g. "种植牙" / "正畸" / "儿牙".
  category text,
  -- Opt-in flag for public exposure. Default false — even after creation,
  -- admin must explicitly mark a service as ready-for-public.
  geo_visible boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS services_tenant_idx
  ON public.services (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS services_brand_idx
  ON public.services (brand_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS services_geo_visible_idx
  ON public.services (tenant_id, brand_id)
  WHERE geo_visible = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS services_category_idx
  ON public.services (tenant_id, category) WHERE deleted_at IS NULL AND category IS NOT NULL;

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "services_read" ON public.services FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_user_tenant_ids()));

CREATE POLICY "services_write" ON public.services FOR ALL TO authenticated
  USING (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator']))
  WITH CHECK (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator']));

COMMENT ON TABLE public.services IS
  'Service catalog (medical procedures / treatments). Drives schema.org/MedicalProcedure JSON-LD + AI Feed.';
