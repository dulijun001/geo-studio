-- ============================================================================
-- 0005_w6_tracking.sql
-- V1 Week 6: GEO tracking schema additions.
--
-- Per ADR-002, citations rows now represent individual brand-vocab mentions
-- (not "did this snapshot mention any brand"). To compute SOV without joining
-- brand_vocab on every dashboard query, we denormalize term_type onto citations
-- and keep a vocab_id back-reference for drill-down.
--
-- The legacy brand_mentioned column is kept (always true under the new model)
-- to avoid breaking earlier seeds. V2 will reshape citations once the dashboard
-- queries settle.
-- ============================================================================

ALTER TABLE public.citations
  ADD COLUMN IF NOT EXISTS vocab_id uuid
    REFERENCES public.brand_vocab(id) ON DELETE SET NULL;--> statement-breakpoint

ALTER TABLE public.citations
  ADD COLUMN IF NOT EXISTS term_type public.vocab_type;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS citations_term_type_idx
  ON public.citations (snapshot_id, term_type);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS citations_vocab_idx
  ON public.citations (vocab_id)
  WHERE vocab_id IS NOT NULL;--> statement-breakpoint
