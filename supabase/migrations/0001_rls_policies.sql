-- ============================================================================
-- 0001_rls_policies.sql
-- Row-Level Security helper functions + enable RLS + policies for all 17 tables.
-- See docs/adr/001-rls-strategy.md for design rationale.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER to bypass RLS on tenant_memberships)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_tenant_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.tenant_memberships
  WHERE user_id = auth.uid() AND deleted_at IS NULL
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.current_user_has_tenant_role(t_id uuid, required_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND tenant_id = t_id
      AND role::text = ANY(required_roles)
      AND deleted_at IS NULL
  )
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.current_user_is_staff_for(sa_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.staff_accounts
    WHERE id = sa_id AND auth_user_id = auth.uid() AND deleted_at IS NULL
  )
$$;--> statement-breakpoint

-- Grant execute to authenticated role (anon stays denied by default)
GRANT EXECUTE ON FUNCTION public.current_user_tenant_ids() TO authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.current_user_has_tenant_role(uuid, text[]) TO authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.current_user_is_staff_for(uuid) TO authenticated;--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- Enable RLS on all 17 business tables
-- ----------------------------------------------------------------------------

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.staff_accounts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.brand_vocab ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.content_variants ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.publish_tasks ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.tracking_accounts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.geo_snapshots ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.citations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.compliance_keywords ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.compliance_reviews ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.hooks ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.conversion_events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- tenants
-- ----------------------------------------------------------------------------

CREATE POLICY "tenants_read_members"
  ON public.tenants FOR SELECT TO authenticated
  USING (id IN (SELECT public.current_user_tenant_ids()));--> statement-breakpoint

CREATE POLICY "tenants_update_admins"
  ON public.tenants FOR UPDATE TO authenticated
  USING (public.current_user_has_tenant_role(id, ARRAY['owner','admin']));--> statement-breakpoint

-- INSERT/DELETE on tenants: only service_role (provisioning is backend-only)

-- ----------------------------------------------------------------------------
-- tenant_memberships
-- ----------------------------------------------------------------------------

CREATE POLICY "tenant_memberships_read"
  ON public.tenant_memberships FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin'])
  );--> statement-breakpoint

CREATE POLICY "tenant_memberships_insert_admins"
  ON public.tenant_memberships FOR INSERT TO authenticated
  WITH CHECK (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin']));--> statement-breakpoint

CREATE POLICY "tenant_memberships_update_admins"
  ON public.tenant_memberships FOR UPDATE TO authenticated
  USING (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin']));--> statement-breakpoint

CREATE POLICY "tenant_memberships_delete_admins"
  ON public.tenant_memberships FOR DELETE TO authenticated
  USING (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin']));--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- Class A: standard tenant-scoped (brands, brand_vocab, content_items,
--                                  content_variants, questions,
--                                  hooks, conversion_events)
-- SELECT: any tenant member; WRITE: owner/admin/operator
-- ----------------------------------------------------------------------------

CREATE POLICY "brands_read" ON public.brands FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_user_tenant_ids()));--> statement-breakpoint
CREATE POLICY "brands_write" ON public.brands FOR ALL TO authenticated
  USING (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator']))
  WITH CHECK (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator']));--> statement-breakpoint

CREATE POLICY "brand_vocab_read" ON public.brand_vocab FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_user_tenant_ids()));--> statement-breakpoint
CREATE POLICY "brand_vocab_write" ON public.brand_vocab FOR ALL TO authenticated
  USING (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator']))
  WITH CHECK (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator']));--> statement-breakpoint

CREATE POLICY "content_items_read" ON public.content_items FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_user_tenant_ids()));--> statement-breakpoint
CREATE POLICY "content_items_write" ON public.content_items FOR ALL TO authenticated
  USING (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator']))
  WITH CHECK (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator']));--> statement-breakpoint

-- content_variants: staff can READ variants for tasks dispatched to them,
-- operators can read all and write.
CREATE POLICY "content_variants_read" ON public.content_variants FOR SELECT TO authenticated
  USING (
    tenant_id IN (SELECT public.current_user_tenant_ids())
    AND (
      public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator','auditor'])
      OR EXISTS(
        SELECT 1 FROM public.publish_tasks pt
        WHERE pt.variant_id = content_variants.id
          AND public.current_user_is_staff_for(pt.staff_account_id)
      )
    )
  );--> statement-breakpoint
CREATE POLICY "content_variants_write" ON public.content_variants FOR ALL TO authenticated
  USING (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator']))
  WITH CHECK (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator']));--> statement-breakpoint

CREATE POLICY "questions_read" ON public.questions FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_user_tenant_ids()));--> statement-breakpoint
CREATE POLICY "questions_write" ON public.questions FOR ALL TO authenticated
  USING (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator']))
  WITH CHECK (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator']));--> statement-breakpoint

CREATE POLICY "hooks_read" ON public.hooks FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_user_tenant_ids()));--> statement-breakpoint
CREATE POLICY "hooks_write" ON public.hooks FOR ALL TO authenticated
  USING (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator']))
  WITH CHECK (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator']));--> statement-breakpoint

CREATE POLICY "conversion_events_read" ON public.conversion_events FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_user_tenant_ids()));--> statement-breakpoint
CREATE POLICY "conversion_events_write" ON public.conversion_events FOR ALL TO authenticated
  USING (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator']))
  WITH CHECK (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator']));--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- Class B: staff-aware tables (staff_accounts, publish_tasks)
-- ----------------------------------------------------------------------------

CREATE POLICY "staff_accounts_read" ON public.staff_accounts FOR SELECT TO authenticated
  USING (
    tenant_id IN (SELECT public.current_user_tenant_ids())
    OR auth_user_id = auth.uid()
  );--> statement-breakpoint
CREATE POLICY "staff_accounts_self_update" ON public.staff_accounts FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid());--> statement-breakpoint
CREATE POLICY "staff_accounts_admin_write" ON public.staff_accounts FOR ALL TO authenticated
  USING (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator']))
  WITH CHECK (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator']));--> statement-breakpoint

CREATE POLICY "publish_tasks_read" ON public.publish_tasks FOR SELECT TO authenticated
  USING (
    public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator','auditor'])
    OR public.current_user_is_staff_for(staff_account_id)
  );--> statement-breakpoint
CREATE POLICY "publish_tasks_staff_update" ON public.publish_tasks FOR UPDATE TO authenticated
  USING (public.current_user_is_staff_for(staff_account_id))
  WITH CHECK (public.current_user_is_staff_for(staff_account_id));--> statement-breakpoint
CREATE POLICY "publish_tasks_admin_write" ON public.publish_tasks FOR ALL TO authenticated
  USING (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator']))
  WITH CHECK (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','operator']));--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- Class C: audit-visible (audit_logs, compliance_reviews)
-- ----------------------------------------------------------------------------

CREATE POLICY "audit_logs_read" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','auditor']));--> statement-breakpoint
CREATE POLICY "audit_logs_insert_members" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT public.current_user_tenant_ids()));--> statement-breakpoint
-- No UPDATE/DELETE policies => immutable from client

CREATE POLICY "compliance_reviews_read" ON public.compliance_reviews FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_user_tenant_ids()));--> statement-breakpoint
CREATE POLICY "compliance_reviews_manual_update" ON public.compliance_reviews FOR UPDATE TO authenticated
  USING (public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin','auditor']));--> statement-breakpoint
CREATE POLICY "compliance_reviews_insert_members" ON public.compliance_reviews FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT public.current_user_tenant_ids()));--> statement-breakpoint
-- DELETE forbidden

-- ----------------------------------------------------------------------------
-- Class D: dual-scope (compliance_keywords: global rows + tenant rows)
-- ----------------------------------------------------------------------------

CREATE POLICY "compliance_keywords_read" ON public.compliance_keywords FOR SELECT TO authenticated
  USING (
    tenant_id IS NULL
    OR tenant_id IN (SELECT public.current_user_tenant_ids())
  );--> statement-breakpoint

CREATE POLICY "compliance_keywords_tenant_write" ON public.compliance_keywords FOR ALL TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin'])
  )
  WITH CHECK (
    tenant_id IS NOT NULL
    AND public.current_user_has_tenant_role(tenant_id, ARRAY['owner','admin'])
  );--> statement-breakpoint
-- Global rows (tenant_id IS NULL) are only writable by service_role

-- ----------------------------------------------------------------------------
-- Class E: worker-owned (geo_snapshots, citations, tracking_accounts)
-- Readable by tenant members (except tracking_accounts), writable only by service_role
-- ----------------------------------------------------------------------------

CREATE POLICY "geo_snapshots_read" ON public.geo_snapshots FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_user_tenant_ids()));--> statement-breakpoint
-- No client write policies -> only service_role can insert/update

CREATE POLICY "citations_read" ON public.citations FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.current_user_tenant_ids()));--> statement-breakpoint
-- No client write policies

-- tracking_accounts: zero client access. No SELECT / INSERT / UPDATE / DELETE policies.
-- Only service_role (RLS bypass) touches it.

-- ----------------------------------------------------------------------------
-- Force RLS on table owners too (belt-and-suspenders).
-- Without FORCE, the table owner role bypasses RLS; with FORCE, it doesn't.
-- Supabase runs app traffic as non-owner roles anyway, but this prevents
-- accidents if a future migration runs as postgres.
-- ----------------------------------------------------------------------------

ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.tenant_memberships FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.brands FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.staff_accounts FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.brand_vocab FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.content_items FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.content_variants FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.publish_tasks FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.questions FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.tracking_accounts FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.geo_snapshots FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.citations FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.compliance_keywords FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.compliance_reviews FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.hooks FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.conversion_events FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;
