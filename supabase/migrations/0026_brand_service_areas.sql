-- 0026_brand_service_areas: brand-level multi-area drainage scope
--
-- Why this is separate from brands.location:
--   brands.location = ONE physical clinic address (street + city + lat/lng)
--   brands.service_areas = MULTIPLE drainage areas the brand serves
--
-- Example for 昆明松鼠口腔:
--   location = {city: '昆明', district: '西山区', street: 'XXX 路 100 号', lat: 24.95, lng: 102.7}
--   service_areas = ['昆明', '云南']  -- physically in Kunming, but pulls clients from Yunnan
--
-- Why we need this:
--   AI dig + variant generation prompts must know the brand's geographic scope
--   so they don't suggest "北京种植牙价格" for a Kunming brand. Without this
--   field, the LLM defaults to top-tier cities (北京/上海/广州/深圳) because
--   those have the largest search volume — a Kunming brand drowns in noise.
--
--   Also: schema.org/MedicalBusiness.areaServed signals AI engines (豆包/元宝/
--   Perplexity) the geographic relevance of this brand for "city + service"
--   queries, materially improving GEO match probability for local searches.
--
-- Granularity: city-level by convention. District-level fragments search
-- volume too thin to be useful. Province-level OK as drainage signal
-- (e.g. ['昆明', '云南'] = primary city + provincial drainage).

ALTER TABLE public.brands
  ADD COLUMN IF NOT EXISTS service_areas text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.brands.service_areas IS
  'Drainage scope: cities/regions the brand serves. Distinct from `location` (single physical address). Used by (1) AI dig / variant prompt to constrain geographic suggestions; (2) Schema.org/MedicalBusiness.areaServed for GEO local-query matching. Example: [''昆明'', ''云南''] = clinic in Kunming + serves Yunnan-wide.';

-- ----------------------------------------------------------------------
-- Backfill for the seed tenant (昆明松鼠口腔) — best effort.
-- ----------------------------------------------------------------------
-- We don't know which row is "松鼠口腔" by name alone (could be renamed),
-- so backfill any brand whose location.city = '昆明' to get sensible
-- defaults. Operators can refine via the brand admin UI.

UPDATE public.brands
   SET service_areas = ARRAY['昆明', '云南']
 WHERE location->>'city' = '昆明'
   AND (service_areas IS NULL OR cardinality(service_areas) = 0);
