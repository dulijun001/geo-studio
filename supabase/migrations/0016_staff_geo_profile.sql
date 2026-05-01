-- 0016_staff_geo_profile: extend staff_accounts so doctors can be exposed
--   in public discoverability artifacts (Physician schema, llms.txt, feed).
--
-- Default geo_profile_visible=false: public exposure is opt-in per-doctor.
-- Reasons a hospital might NOT expose a doctor: privacy preference,
-- intern/junior status, ongoing legal matter.
--
-- credentials JSONB shape mirrors schema.org/Physician + medical industry
-- norms. license_number is sensitive (regulated identifier) but the field
-- itself is searchable in regulator databases, so storing it is safe.
--
-- See: docs/06-discoverability.md §四, ADR 005.

ALTER TABLE public.staff_accounts
  ADD COLUMN IF NOT EXISTS geo_profile_visible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS credentials jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS staff_accounts_geo_visible_idx
  ON public.staff_accounts (tenant_id)
  WHERE geo_profile_visible = true AND status = 'active' AND deleted_at IS NULL;

COMMENT ON COLUMN public.staff_accounts.geo_profile_visible IS
  'Opt-in flag: false = doctor not exposed in any public artifact (schema/llms.txt/feed).';
COMMENT ON COLUMN public.staff_accounts.credentials IS
  '{license_number, board_certifications: [string], specialties: [string], experience_years, education: [{degree, school, year}]}. Maps to schema.org/Physician.';
