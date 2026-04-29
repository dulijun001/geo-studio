-- 0009_geo_score: per-variant GEO 9-tactic score breakdown.
--
-- Stores rule-based + LLM-blended scoring of how well a generated variant
-- applies the GEO 9 tactics (Aggarwal 2023). Auto-rewrite kicks in if
-- total < 70 (configurable). UI shows the breakdown so editors know
-- whether a variant lacks data, lacks quotations, etc.
--
-- Schema (jsonb):
--   {
--     "total": 73,                    -- 0-100
--     "version": 1,                   -- bump when scoring rules change
--     "scored_at": "2026-04-29T...",
--     "rewrite_count": 0,             -- how many times rewritten to lift score
--     "breakdown": {
--       "statistics":   { "score": 14, "max": 15, "evidence": ["95%", "5 年存留率", ...] },
--       "quotation":    { "score":  6, "max": 15, "evidence": [...] },
--       "citation":     { "score": 18, "max": 20, "evidence": ["《种植牙临床指南 2023》"] },
--       "fluency":      { "score":  8, "max": 10 },
--       "readability":  { "score":  9, "max": 10 },
--       "keyword_freq": { "score":  8, "max": 10 },
--       "position":     { "score": 10, "max": 10 },
--       "unique":       { "score":  4, "max":  5 },
--       "authority":    { "score":  3, "max":  5 }
--     }
--   }
--
-- NULL = not yet scored. Empty {} reserved for future.

ALTER TABLE content_variants
  ADD COLUMN IF NOT EXISTS geo_score JSONB;

-- Index for "find low-score variants" queries (treat missing total as 0)
CREATE INDEX IF NOT EXISTS content_variants_geo_score_total_idx
  ON content_variants (((geo_score->>'total')::int))
  WHERE geo_score IS NOT NULL;

COMMENT ON COLUMN content_variants.geo_score IS
  'GEO 9-tactic score breakdown. See migration 0009 for schema.';
