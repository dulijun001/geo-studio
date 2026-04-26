-- ============================================================================
-- 0006_knowledge_base.sql
-- V1.5: knowledge-base-as-source-of-truth.
--
-- The customer maintains a markdown knowledge base on their machine. A Mac
-- launchd watcher rsyncs it to ECS /opt/kb/松鼠/. A pg-boss worker (added in
-- V1.5-4) scans the mirror every 5 min and indexes paths/titles/excerpts/hash
-- into knowledge_sources. RAG-driven content generation (V1.5-8) writes
-- content_citations linking generated content_items / variants back to source.
--
-- This migration: adds the two new tables, the privacy_level enum, and small
-- column additions on existing tables (staff_accounts.bio_md_path,
-- compliance_keywords.source_path, content_item_status += 'ai_drafted').
--
-- All additions are non-destructive — existing W1-W7 flows keep working with
-- the legacy "upload Word, no citations" path. Customers without a knowledge
-- base run in degraded mode (no RAG drafts, hand-seeded compliance keywords).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Enum additions
-- ----------------------------------------------------------------------------

CREATE TYPE public.privacy_level AS ENUM ('L1', 'L2', 'L3', 'L4');--> statement-breakpoint

-- 'ai_drafted' = AI-generated draft awaiting doctor review.
-- IF NOT EXISTS for idempotency (re-running the migration is safe).
ALTER TYPE public.content_item_status ADD VALUE IF NOT EXISTS 'ai_drafted';--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 2. knowledge_sources — index of customer's md files
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  source_path text NOT NULL,
  title text,
  excerpt text,
  category text,
  privacy_level public.privacy_level NOT NULL DEFAULT 'L1',
  source_hash text NOT NULL,
  byte_size integer NOT NULL DEFAULT 0,
  embedding vector(1536),
  indexed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS knowledge_sources_tenant_path_uq
  ON public.knowledge_sources (tenant_id, source_path);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS knowledge_sources_tenant_category_idx
  ON public.knowledge_sources (tenant_id, category);--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 3. content_citations — generated content → knowledge_source back-references
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.content_citations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  content_item_id uuid REFERENCES public.content_items(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.content_variants(id) ON DELETE CASCADE,
  knowledge_source_id uuid NOT NULL REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
  excerpt_used text,
  confidence real,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  -- Exactly one of (content_item_id, variant_id) must be non-null
  CONSTRAINT content_citations_target_chk CHECK (
    (content_item_id IS NOT NULL AND variant_id IS NULL)
    OR (content_item_id IS NULL AND variant_id IS NOT NULL)
  )
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS content_citations_tenant_idx
  ON public.content_citations (tenant_id);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS content_citations_source_idx
  ON public.content_citations (knowledge_source_id);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS content_citations_content_item_idx
  ON public.content_citations (content_item_id)
  WHERE content_item_id IS NOT NULL;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS content_citations_variant_idx
  ON public.content_citations (variant_id)
  WHERE variant_id IS NOT NULL;--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 4. Existing-table column additions
-- ----------------------------------------------------------------------------

ALTER TABLE public.staff_accounts
  ADD COLUMN IF NOT EXISTS bio_md_path text;--> statement-breakpoint

ALTER TABLE public.compliance_keywords
  ADD COLUMN IF NOT EXISTS source_path text;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS compliance_keywords_source_path_idx
  ON public.compliance_keywords (source_path);--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 5. RLS — same model as existing tables (see 0001_rls_policies.sql).
--    Tenant members read; owner/admin/operator write. Service role bypasses.
-- ----------------------------------------------------------------------------

ALTER TABLE public.knowledge_sources ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.content_citations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "knowledge_sources_read" ON public.knowledge_sources FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_user_tenant_ids()));--> statement-breakpoint

CREATE POLICY "knowledge_sources_write" ON public.knowledge_sources FOR ALL TO authenticated
  USING (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator']))
  WITH CHECK (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator']));--> statement-breakpoint

CREATE POLICY "content_citations_read" ON public.content_citations FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_user_tenant_ids()));--> statement-breakpoint

CREATE POLICY "content_citations_write" ON public.content_citations FOR ALL TO authenticated
  USING (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator']))
  WITH CHECK (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator']));--> statement-breakpoint
