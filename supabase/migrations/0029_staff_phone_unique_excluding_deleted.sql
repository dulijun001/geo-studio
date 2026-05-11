-- 0029_staff_phone_unique_excluding_deleted: fix partial unique index so
-- soft-deleted staff don't permanently lock their phone number.
--
-- Bug found 2026-05-11: trying to re-create an employee with phone X after
-- a previous record (same phone, deleted_at IS NOT NULL) was soft-deleted
-- raises `duplicate key value violates unique constraint
-- "staff_accounts_tenant_phone_uq"`. Every terminated employee permanently
-- holds the phone slot until the row is hard-deleted, breaking the natural
-- "soft-delete then rejoin" flow that D11 designed for.
--
-- Original (0004_w5_dispatch.sql:21-23):
--   WHERE phone IS NOT NULL
-- This commit:
--   WHERE phone IS NOT NULL AND deleted_at IS NULL
--
-- Same name (drop + re-create) so application code that references the
-- index name continues to work.

DROP INDEX IF EXISTS public.staff_accounts_tenant_phone_uq;

CREATE UNIQUE INDEX staff_accounts_tenant_phone_uq
  ON public.staff_accounts (tenant_id, phone)
  WHERE phone IS NOT NULL AND deleted_at IS NULL;
