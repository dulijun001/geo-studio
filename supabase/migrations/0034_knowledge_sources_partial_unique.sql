-- 0034_knowledge_sources_partial_unique: fix unique-key collision with
-- soft-deleted rows (P0, found 2026-05-13).
--
-- Symptom: tenant could not re-add a knowledge source after a previous
-- sync run had soft-deleted it. INSERT raised:
--   duplicate key value violates unique constraint
--   "knowledge_sources_tenant_path_uq"
-- ...even though the conflicting row had deleted_at IS NOT NULL.
--
-- Root cause: the original unique index (created in an early migration)
-- was a full unique on (tenant_id, source_path), no partial predicate.
-- Soft-deleted rows occupied the slot and blocked re-INSERT, so every
-- KB sync after a soft-delete cycle returned scanned=N but
-- added=0 / unchanged=0 (the INSERT path failed silently inside the
-- try-catch and "unchanged" only counts rows hit via existingByPath).
--
-- Incident: songshu tenant had 443 ghost soft-deleted rows. AI draft API
-- reported "知识库为空" because all active rows were already gone, and
-- KB sync could not re-INSERT (unique collision). Manually purged the
-- soft-deletes + rebuilt the index in prod 2026-05-13 13:48.
--
-- Fix: replace with partial unique (deleted_at IS NULL). Soft-deleted
-- rows are now invisible to the uniqueness check, so re-INSERT works.

DROP INDEX IF EXISTS public.knowledge_sources_tenant_path_uq;

CREATE UNIQUE INDEX knowledge_sources_tenant_path_uq
  ON public.knowledge_sources (tenant_id, source_path)
  WHERE deleted_at IS NULL;

COMMENT ON INDEX public.knowledge_sources_tenant_path_uq IS
  'Partial unique — soft-deleted rows are excluded so re-INSERT after soft-delete works (see migration 0034 + 2026-05-13 incident).';
