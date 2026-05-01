-- 0015_brand_discoverability: extend brands with fields needed for
--   schema.org MedicalBusiness / Organization JSON-LD + llms.txt.
--
-- Why these specific fields: each maps directly to a schema.org property
-- that豆包/元宝 indexers consume. Without these, the schema we emit is
-- empty boilerplate (D18: don't fill placeholders).
--
-- See: docs/06-discoverability.md §四 数据模型 diff, ADR 005.

ALTER TABLE public.brands
  ADD COLUMN IF NOT EXISTS medical_specialties text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS business_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS website_url text,
  ADD COLUMN IF NOT EXISTS social_urls jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS description_md text,
  ADD COLUMN IF NOT EXISTS verified_credentials jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.brands.medical_specialties IS
  'schema.org/medicalSpecialty values, e.g. ["Dentistry","OrthopaedicSurgery"]. Empty array = unset (no schema emit).';
COMMENT ON COLUMN public.brands.business_hours IS
  'schema.org/openingHoursSpecification flattened: {"mon":"09:00-18:00","tue":"09:00-18:00",...}.';
COMMENT ON COLUMN public.brands.website_url IS
  'Customer-owned website. Null = host llms.txt/feed under our subdomain.';
COMMENT ON COLUMN public.brands.social_urls IS
  '{wechat_mp, weibo, douyin, xiaohongshu, ...} — public profile URLs. Used as Organization.sameAs in JSON-LD.';
COMMENT ON COLUMN public.brands.description_md IS
  'Long-form brand description. Used in llms-full.txt + Organization.description (truncated to 5000 chars on emit).';
COMMENT ON COLUMN public.brands.verified_credentials IS
  '{licenses: [{number, issuer, valid_until}], accreditations: [{name, issuer, valid_until}]}. JCI / 三甲 / 医保定点 etc.';
