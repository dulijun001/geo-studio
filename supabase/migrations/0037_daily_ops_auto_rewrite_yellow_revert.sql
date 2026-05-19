-- Revert 0037.
BEGIN;
ALTER TABLE public.daily_ops_settings DROP COLUMN IF EXISTS auto_rewrite_yellow;
COMMIT;
