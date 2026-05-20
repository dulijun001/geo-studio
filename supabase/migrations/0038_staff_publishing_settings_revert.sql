-- Revert 0038.
BEGIN;
DROP INDEX IF EXISTS public.staff_accounts_publishing_active_idx;
ALTER TABLE public.staff_accounts DROP COLUMN IF EXISTS settings;
COMMIT;
