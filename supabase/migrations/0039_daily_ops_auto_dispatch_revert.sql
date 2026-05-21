-- Revert 0039.
BEGIN;
ALTER TABLE public.daily_ops_settings DROP COLUMN IF EXISTS auto_dispatch_enabled;
COMMIT;
