-- ============================================================================
-- 0008_staff_password.sql
-- V1.6-3: switch staff login from disposable 6-digit passcodes to permanent
-- self-service passwords. Admin generates a one-time invite link; staff opens
-- it and sets their own password (bcrypt-hashed). Subsequent logins are
-- phone + password — no SMS, no admin-mediated codes.
--
-- Backwards compatible: staff_invites.kind defaults to 'login' for existing
-- rows (the legacy 6-digit dev-passcode flow). New 'setup' / 'reset' kinds
-- carry 32-byte invite tokens with a 24h TTL instead of 6-digit + 15min.
-- ============================================================================

-- 1. Password column on staff_accounts (nullable until first setup)
ALTER TABLE public.staff_accounts
  ADD COLUMN IF NOT EXISTS password_hash text;--> statement-breakpoint

-- 2. Kind enum on staff_invites (login = legacy passcode, setup/reset = link)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'staff_invite_kind') THEN
    CREATE TYPE public.staff_invite_kind AS ENUM ('login', 'setup', 'reset');
  END IF;
END$$;--> statement-breakpoint

ALTER TABLE public.staff_invites
  ADD COLUMN IF NOT EXISTS kind public.staff_invite_kind NOT NULL DEFAULT 'login';--> statement-breakpoint

CREATE INDEX IF NOT EXISTS staff_invites_kind_idx
  ON public.staff_invites (kind, staff_account_id)
  WHERE consumed_at IS NULL;--> statement-breakpoint

NOTIFY pgrst, 'reload schema';--> statement-breakpoint
