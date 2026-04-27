import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import type { MemberRole } from '@geo/shared';
import { getCurrentUser } from './current-user';
import { readAdminSession } from './admin-session';
import { createSupabaseServerClient } from './supabase/server';
import { getSupabaseServiceClient } from './supabase/service';

export type ActiveTenant = {
  id: string;
  slug: string;
  name: string;
  industry: string;
  role: MemberRole;
};

/**
 * Resolve the current user's membership for a tenant slug.
 *
 * Two paths:
 *   - Admin HMAC cookie present (dev-bypass / future password flow): use
 *     service-role client to bypass RLS. Trust comes from cookie HMAC.
 *   - Otherwise: Supabase auth → RLS-scoped SELECT (legacy magic-link).
 *
 * Returns null when no user, slug not found, or user not a member.
 *
 * `cache()` dedupes identical calls within one request.
 */
export const resolveTenantBySlug = cache(async (slug: string): Promise<ActiveTenant | null> => {
  const user = await getCurrentUser();
  if (!user) {
    console.log('[resolveTenantBySlug] no user in session');
    return null;
  }

  // Admin cookie holders bypass RLS — they're the operator, trust the HMAC.
  // Supabase-auth users go through RLS as before.
  const adminCookie = readAdminSession();
  const client = adminCookie ? getSupabaseServiceClient() : createSupabaseServerClient();

  const { data: tenantRow, error: tenantErr } = await client
    .from('tenants')
    .select('id, slug, name, industry')
    .eq('slug', slug)
    .maybeSingle();
  if (tenantErr) {
    console.error('[resolveTenantBySlug] tenant query error:', tenantErr.message);
    return null;
  }
  if (!tenantRow) {
    console.log(`[resolveTenantBySlug] tenant slug=${slug} not readable by user=${user.id}`);
    return null;
  }

  const { data: memRow, error: memErr } = await client
    .from('tenant_memberships')
    .select('role')
    .eq('tenant_id', tenantRow.id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (memErr) {
    console.error('[resolveTenantBySlug] membership query error:', memErr.message);
    return null;
  }
  if (!memRow) {
    console.log(`[resolveTenantBySlug] no membership for user=${user.id} tenant=${tenantRow.id}`);
    return null;
  }

  return {
    id: tenantRow.id,
    slug: tenantRow.slug,
    name: tenantRow.name,
    industry: tenantRow.industry,
    role: memRow.role as MemberRole,
  };
});

/**
 * Require an active tenant + membership. Redirects to /login if not authed,
 * 404 if tenant doesn't exist or user is not a member.
 */
export async function requireTenantMember(slug: string): Promise<ActiveTenant> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/t/${slug}`)}`);
  }

  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) notFound();
  return tenant;
}

/**
 * Require one of the given roles on the active tenant.
 * Useful for gating admin-only routes and server actions.
 */
export async function requireRole(
  slug: string,
  allowed: readonly MemberRole[],
): Promise<ActiveTenant> {
  const tenant = await requireTenantMember(slug);
  if (!allowed.includes(tenant.role)) notFound();
  return tenant;
}

/**
 * List all tenants the current user belongs to.
 * Used by /app to render the tenant switcher / onboarding state.
 */
export async function listMyTenants(): Promise<ActiveTenant[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  // Admin cookie holders bypass RLS for read.
  const adminCookie = readAdminSession();
  const client = adminCookie ? getSupabaseServiceClient() : createSupabaseServerClient();

  const { data, error } = await client
    .from('tenant_memberships')
    .select('role, tenant:tenants!inner(id, slug, name, industry)')
    .eq('user_id', user.id);

  if (error || !data) return [];

  return data
    .map((row): ActiveTenant | null => {
      const tenant = Array.isArray(row.tenant) ? row.tenant[0] : row.tenant;
      if (!tenant) return null;
      return {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        industry: tenant.industry,
        role: row.role as MemberRole,
      };
    })
    .filter((t): t is ActiveTenant => t !== null);
}
