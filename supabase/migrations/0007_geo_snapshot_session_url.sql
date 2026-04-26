-- ============================================================================
-- 0007_geo_snapshot_session_url.sql
-- V1.6-2: persist Doubao session URL on each geo_snapshot.
--
-- The Doubao Web adapter returns a meta.session_url like
-- https://www.doubao.com/chat/38423405237614338 — this is the only way to
-- re-open the original AI conversation after the fact (e.g. for a customer
-- to verify the answer that was scored, or to look at follow-up questions
-- Doubao suggested). We were dropping it on the floor.
--
-- Nullable because non-doubao engines (V2: Yuanbao, DeepSeek, etc) may not
-- expose a stable URL.
-- ============================================================================

ALTER TABLE public.geo_snapshots
  ADD COLUMN IF NOT EXISTS session_url text;--> statement-breakpoint

NOTIFY pgrst, 'reload schema';--> statement-breakpoint
