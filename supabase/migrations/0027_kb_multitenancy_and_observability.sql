-- 0027_kb_multitenancy_and_observability: 板块 #1 KB 第一波修复.
--
-- Three issues addressed:
--
-- P0-1  Multi-tenant pollution: knowledge-sync.ts hardcodes a single
--       KB_ROOT, fed to every tenant in the loop, so two tenants ended
--       up with byte-identical 211-row mirrors of one client's KB. Add
--       per-tenant `knowledge_base_path` so sync skips tenants without
--       a configured path (and never cross-pollinates).
--
-- P0-2  "最近同步" UI is permanently red: it reads MAX(indexed_at)
--       which only updates when a file's hash changes. After 9 days
--       of unchanged files the badge says "13000 分钟前 (warn)" even
--       though sync has been running every 5 minutes. Introduce
--       `last_synced_at` on knowledge_sources tied to the actual sync
--       run, decoupled from file-level indexed_at.
--
-- P1-2  L2 content has no second-pass guard: privacy_level=L2 (internal-
--       only) is currently happily served to AI drafting downstream,
--       which can leak it into public content. Add `is_public_eligible`
--       column derived from privacy_level so downstream filters can
--       refuse anything not eligible.

-- ── 1. tenants.knowledge_base_path ─────────────────────────────────────
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS knowledge_base_path text;

COMMENT ON COLUMN public.tenants.knowledge_base_path IS
  'Filesystem root of this tenant''s markdown knowledge base, mirrored from the customer''s own machine via fswatch+rsync. NULL = no KB configured for this tenant; sync job skips. Each tenant must point to a different path — never share.';

-- Backfill the only tenant that was actually meant to use the existing
-- KB. The other tenant (demo placeholder) is left NULL on purpose so
-- the next sync run will cleanse its polluted 211 rows.
UPDATE public.tenants
   SET knowledge_base_path = '/Users/dulijuner/Workspace/songshu-knowledge-base'
 WHERE slug = 'demo-dental';

-- ── 2. knowledge_sources.last_synced_at ────────────────────────────────
ALTER TABLE public.knowledge_sources
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

COMMENT ON COLUMN public.knowledge_sources.last_synced_at IS
  'Wall-clock of the last sync run that observed this row, regardless of whether contents changed. Populated by knowledge-sync.ts on every run. Distinct from indexed_at (which only ticks on hash change). Used by the settings UI "最近同步" badge.';

-- Backfill from indexed_at so the UI doesn't show NULL on day-one.
UPDATE public.knowledge_sources
   SET last_synced_at = indexed_at
 WHERE last_synced_at IS NULL;

-- ── 3. knowledge_sources.is_public_eligible ────────────────────────────
ALTER TABLE public.knowledge_sources
  ADD COLUMN IF NOT EXISTS is_public_eligible boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.knowledge_sources.is_public_eligible IS
  'Second-pass downstream guard: false means this source must NOT feed any AI drafting / variant prompt that produces externally-visible content. Derived from privacy_level (L1=true, L2=false; L3/L4 never reach this table). Even if upstream miss-classifies, the createAiDraft recall step filters on this.';

-- Backfill: L2 sources are not public-eligible.
UPDATE public.knowledge_sources
   SET is_public_eligible = false
 WHERE privacy_level = 'L2';

-- ── 4. Cleanup the cross-tenant pollution from P0-1 ─────────────────────
-- Soft-delete every knowledge_sources row whose tenant has no KB path
-- configured. This wipes the 211 polluted rows on `lnian7914-org` while
-- leaving demo-dental untouched (it has the path now).
UPDATE public.knowledge_sources ks
   SET deleted_at = NOW()
  FROM public.tenants t
 WHERE ks.tenant_id = t.id
   AND t.knowledge_base_path IS NULL
   AND ks.deleted_at IS NULL;

-- Optional helpful index for the new sync filter.
CREATE INDEX IF NOT EXISTS knowledge_sources_public_eligible_idx
  ON public.knowledge_sources (tenant_id, is_public_eligible)
  WHERE deleted_at IS NULL;
