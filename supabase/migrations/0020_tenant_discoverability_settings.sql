-- 0020_tenant_discoverability_settings: initialize tenants.settings.discoverability
--   defaults for all existing tenants, and document the expected shape.
--
-- D15: public_enabled default false — every tenant must opt in explicitly.
-- D17: thresholds copied from Laravel aigeo defaults; tune per-tenant in
--   /t/[slug]/discoverability/settings later.
--
-- This migration is idempotent: only sets the key if missing.
--
-- See: docs/06-discoverability.md §四 tenants.settings 扩展, ADR 005.

UPDATE public.tenants
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{discoverability}',
  '{
    "public_enabled": false,
    "public_slug": null,
    "llms_txt_overrides": null,
    "thresholds": {
      "min_description_words": 150,
      "min_reviews_for_signal": 10,
      "min_rating_for_signal": 4.0,
      "min_business_hours_completeness": 0.8,
      "min_specialty_count": 1
    }
  }'::jsonb,
  true
)
WHERE NOT (settings ? 'discoverability');

-- Sanity: every tenant should now have the key
DO $$
DECLARE missing int;
BEGIN
  SELECT count(*) INTO missing FROM public.tenants
    WHERE NOT (settings ? 'discoverability') AND deleted_at IS NULL;
  IF missing > 0 THEN
    RAISE EXCEPTION 'discoverability settings missing on % tenant(s) — defaults not applied', missing;
  END IF;
END $$;

COMMENT ON COLUMN public.tenants.settings IS
  'JSONB merged config. Known top-level keys: discoverability (D14-D17). New keys MUST be documented here on add.';
