-- 0018_testimonials_table: client testimonials, anonymized by default.
--
-- D16: testimonials going public must pass the four-gate compliance review
-- (compliance_status='approved'). The pipeline adds target_type='testimonial'
-- alongside the existing target_type='content_variant'.
--
-- Why pseudonym + no PII: medical privacy law forbids exposing patient
-- identifiers without explicit written consent. Even with consent, we keep
-- the data minimal — first-name initial + age bracket + city.
--
-- attested_at: when the patient gave the testimony (vs created_at = when we
-- captured it). schema.org/Review.datePublished prefers attested_at.
--
-- D14/D19: explicit FK, no tenantFk() helper.
--
-- See: docs/06-discoverability.md §四, ADR 005.

CREATE TABLE IF NOT EXISTS public.testimonials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  -- Optional: which service the testimonial is about
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  -- 'L 女士 / 32 岁 / 南京' style. Never store real name without explicit consent + DPO sign-off.
  author_pseudonym text NOT NULL,
  body text NOT NULL,
  rating numeric(2,1) CHECK (rating >= 1.0 AND rating <= 5.0),
  attested_at timestamptz NOT NULL DEFAULT now(),
  -- Compliance pipeline status. Default 'pending' — must pass four gates before geo_visible can be true.
  compliance_status text NOT NULL DEFAULT 'pending'
    CHECK (compliance_status IN ('pending','approved','rejected','needs_review')),
  -- Reference to the latest compliance_reviews row for this testimonial (nullable).
  compliance_review_id uuid,
  geo_visible boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS testimonials_tenant_idx
  ON public.testimonials (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS testimonials_brand_idx
  ON public.testimonials (brand_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS testimonials_service_idx
  ON public.testimonials (service_id) WHERE deleted_at IS NULL AND service_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS testimonials_compliance_idx
  ON public.testimonials (tenant_id, compliance_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS testimonials_public_idx
  ON public.testimonials (tenant_id, brand_id)
  WHERE geo_visible = true AND compliance_status = 'approved' AND deleted_at IS NULL;

ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "testimonials_read" ON public.testimonials FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_user_tenant_ids()));

CREATE POLICY "testimonials_write" ON public.testimonials FOR ALL TO authenticated
  USING (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator','auditor']))
  WITH CHECK (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator','auditor']));

-- DB-level guard: geo_visible cannot be set to true unless compliance_status='approved'.
CREATE OR REPLACE FUNCTION public.testimonials_enforce_compliance_gate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.geo_visible = true AND NEW.compliance_status <> 'approved' THEN
    RAISE EXCEPTION 'testimonial cannot be geo_visible until compliance_status=approved (got %)', NEW.compliance_status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER testimonials_compliance_gate
  BEFORE INSERT OR UPDATE OF geo_visible, compliance_status
  ON public.testimonials
  FOR EACH ROW
  EXECUTE FUNCTION public.testimonials_enforce_compliance_gate();

COMMENT ON TABLE public.testimonials IS
  'Client testimonials. D16: must be compliance_status=approved to be geo_visible (DB trigger enforces).';
