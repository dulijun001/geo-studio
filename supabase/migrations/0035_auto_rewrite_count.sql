-- 0035_auto_rewrite_count: P3 — compliance auto-rewrite gate counter.
--
-- When a variant is rejected by the compliance review job, the worker
-- automatically enqueues ONE rewrite attempt (D21 §13.3 渐进式 + spec
-- D5/D12 four-gate). After 1 auto-rewrite the variant either:
--   - passed → status='auto_approved' as usual
--   - still rejected → status stays 'rejected', operator must manually
--     intervene via existing 「让 AI 改写一版」button (which bumps
--     auto_rewrite_count further) or 「手动通过」.
--
-- Hard cap = 1 auto attempt:
--   - prevents LLM cost runaway (each retry $0.02 thinking-model)
--   - prevents content drift after multiple rewrites
--   - hands control back to human at the right moment.

ALTER TABLE public.content_variants
  ADD COLUMN IF NOT EXISTS auto_rewrite_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.content_variants.auto_rewrite_count IS
  'D5/D12 + D21 auto-rewrite ticker. 0 = never auto-rewritten. ≥1 = worker has done N auto rewrites; no more auto attempts beyond this — manual aiRewriteVariant or manualPassDod required.';

CREATE INDEX IF NOT EXISTS content_variants_auto_rewrite_idx
  ON public.content_variants (tenant_id, compliance_status, auto_rewrite_count)
  WHERE deleted_at IS NULL;
