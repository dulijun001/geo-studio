-- ============================================================================
-- 0004_w5_dispatch.sql
-- V1 Week 5: employee dispatch + mobile staff login.
--
-- Additions:
--   1. staff_accounts.phone — login identifier for /staff (tenant-unique).
--   2. staff_invites table — one-time passcodes (dev stub; production will
--      replace the issuance path with Aliyun SMS OTP, same schema).
--   3. RLS policies on staff_invites (only tenant admins can read; service_role
--      bypasses). The staff-login action uses service_role to verify codes
--      because the end user is not yet authenticated.
--   4. Extra publish_tasks index to accelerate "today's tasks for staff X".
-- ============================================================================

ALTER TABLE public.staff_accounts
  ADD COLUMN IF NOT EXISTS phone text;--> statement-breakpoint

-- Tenant-unique partial unique index: same phone can be reused across tenants
-- (common — agencies sometimes have the same person on two brands), but not
-- twice inside one tenant.
CREATE UNIQUE INDEX IF NOT EXISTS staff_accounts_tenant_phone_uq
  ON public.staff_accounts (tenant_id, phone)
  WHERE phone IS NOT NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.staff_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  staff_account_id uuid NOT NULL REFERENCES public.staff_accounts(id) ON DELETE CASCADE,
  passcode_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS staff_invites_staff_active_idx
  ON public.staff_invites (staff_account_id, expires_at);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS staff_invites_tenant_idx
  ON public.staff_invites (tenant_id);--> statement-breakpoint

ALTER TABLE public.staff_invites ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Only tenant admins/owners can see invites. Staff themselves do NOT need to
-- read this table; the login flow uses service_role to verify codes.
CREATE POLICY "staff_invites_admin_select"
  ON public.staff_invites FOR SELECT TO authenticated
  USING (
    tenant_id IN (
      SELECT tm.tenant_id
      FROM public.tenant_memberships tm
      WHERE tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin', 'operator')
    )
  );--> statement-breakpoint

CREATE POLICY "staff_invites_admin_insert"
  ON public.staff_invites FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tm.tenant_id
      FROM public.tenant_memberships tm
      WHERE tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin', 'operator')
    )
  );--> statement-breakpoint

CREATE POLICY "staff_invites_admin_update"
  ON public.staff_invites FOR UPDATE TO authenticated
  USING (
    tenant_id IN (
      SELECT tm.tenant_id
      FROM public.tenant_memberships tm
      WHERE tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin', 'operator')
    )
  );--> statement-breakpoint

-- Speed up the "today's tasks for staff X" query on mobile home page.
CREATE INDEX IF NOT EXISTS publish_tasks_staff_scheduled_idx
  ON public.publish_tasks (staff_account_id, scheduled_at)
  WHERE status IN ('pending', 'dispatched');--> statement-breakpoint
