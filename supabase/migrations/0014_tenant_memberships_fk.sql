-- Restore the missing FK from tenant_memberships → tenants.
-- Why: PostgREST embed (memberships → tenants) fails with PGRST200 because
-- the constraint never existed in 0000_initial — Drizzle's tenantFk() helper
-- never emitted .references(). lib/tenant.ts works around it with two queries;
-- this lets us go back to a single embed and gives us cascade-delete safety
-- on tenant removal.
--
-- NOT VALID + VALIDATE: avoid blocking on a long table scan against existing
-- rows. Validation runs separately and won't lock writers.
--
-- Before applying, verify there are no orphan rows:
--   SELECT count(*) FROM tenant_memberships m
--     LEFT JOIN tenants t ON t.id = m.tenant_id WHERE t.id IS NULL;
-- Must return 0. Non-zero means dirty data — clean before applying.

ALTER TABLE public.tenant_memberships
  ADD CONSTRAINT tenant_memberships_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)
  ON DELETE CASCADE
  NOT VALID;

ALTER TABLE public.tenant_memberships
  VALIDATE CONSTRAINT tenant_memberships_tenant_id_fkey;
