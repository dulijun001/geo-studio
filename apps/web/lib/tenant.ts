/**
 * Tenant resolution utilities. V0 placeholder.
 *
 * In V1 Week 2 this module resolves the active tenant from:
 *   1. subdomain (e.g. "xx-dental.geo-studio.com") — production
 *   2. path prefix (e.g. "/t/xx-dental/...") — dev / preview
 * and validates that `auth.uid()` is a member of that tenant via `tenant_memberships`.
 *
 * Server Components and Server Actions MUST call `requireTenantMember()` before
 * touching any tenant-scoped data. Never trust tenant_id passed from the client.
 */

export type ResolvedTenant = {
  id: string;
  slug: string;
  role: 'owner' | 'admin' | 'operator' | 'auditor' | 'staff';
};

export async function resolveTenant(_host: string, _path: string): Promise<ResolvedTenant | null> {
  // TODO: implement in Week 2
  return null;
}
