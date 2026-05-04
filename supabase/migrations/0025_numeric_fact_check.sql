-- 0025_numeric_fact_check: ground-truth claims for numeric hallucination checks
--
-- Decision: 档位 C1 (data hallucination is the most dangerous medical-content
-- failure mode — borrowing real guideline names while wrapping fake numbers).
--
-- D5/D12 four-gate currently catches:
--   gate 1: keyword blacklist (deterministic)
--   gate 2: LLM semantic review (vibes-based)
--   gate 3: historical case match (jaccard against past 罚单)
--   gate 4: human review
--
-- None of the four checks "the claim 《X 指南》 says 72% recovery rate" against
-- what 《X 指南》 actually says. checkCitations() (V1.6) only verifies that the
-- title 《X》 itself is in our whitelist, not the numbers around it.
--
-- This migration adds the operator-curated "key_claims" array — verifiable
-- statements pulled from each cited source. The numeric-fact-check module
-- (geo-core) uses these to ground an LLM judge: "is the article's claim
-- consistent with what the source actually says?"
--
-- key_claims is OPTIONAL — when empty, the checker falls back to heuristic-
-- only mode (flagging suspicious patterns like "100% 治愈" near citations).
-- This keeps the upgrade non-breaking for tenants who haven't filled it yet.

ALTER TABLE public.verified_citations
  ADD COLUMN IF NOT EXISTS key_claims text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.verified_citations.key_claims IS
  'Verifiable claims/data points extracted from the real source by the operator. Each entry is a sentence-or-fact like "种植体 5 年存活率 92-98%". The numeric fact-checker (geo-core/generation/numeric-fact-check) uses these as ground truth for the LLM judge. Empty = heuristic-only mode.';

-- ----------------------------------------------------------------------
-- content_variants extension — store numeric_check verdict
-- ----------------------------------------------------------------------
-- Mirror citation_check / case_match — same JSONB shape, surfaced by the
-- compliance UI. Compliance-review reads numeric_check.verdict and forces
-- pending_review when it equals 'reject'.

ALTER TABLE public.content_variants
  ADD COLUMN IF NOT EXISTS numeric_check jsonb;

COMMENT ON COLUMN public.content_variants.numeric_check IS
  'Result of geo-core/numeric-fact-check. Shape: {verdict: pass|suspect|reject, claims: [{citation, number, sentence, verdict, reason, mode: heuristic|llm}]}. 档位 C1 — supplements citation_check (which only verifies title) with data-level grounding.';
