import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import type { MemberRole } from '@geo/shared';
import { getCurrentUser } from './current-user';
import { readAdminSession, isSuperAdmin } from './admin-session';
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

  // 5s timeout protects against ECS PostgREST zombie state (TCP accept but
  // no HTTP response). Without this, page render blocks forever.
  const tenantQuery = client
    .from('tenants')
    .select('id, slug, name, industry')
    .eq('slug', slug)
    .maybeSingle();
  const tenantResult = await Promise.race([
    tenantQuery,
    new Promise<{ data: null; error: Error }>((resolve) =>
      setTimeout(() => resolve({ data: null, error: new Error('DB timeout (5s)') }), 5000),
    ),
  ]);
  const { data: tenantRow, error: tenantErr } = tenantResult;
  if (tenantErr) {
    console.error('[resolveTenantBySlug] tenant query error:', tenantErr.message);
    return null;
  }
  if (!tenantRow) {
    console.log(`[resolveTenantBySlug] tenant slug=${slug} not readable by user=${user.id}`);
    return null;
  }

  // Super-admin (dev fallback when DB unreachable): skip membership lookup,
  // grant 'owner' role on any tenant. Trust comes from the cookie HMAC.
  if (isSuperAdmin(adminCookie)) {
    return {
      id: tenantRow.id,
      slug: tenantRow.slug,
      name: tenantRow.name,
      industry: tenantRow.industry,
      role: 'owner' as MemberRole,
    };
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

  // Super-admin: list all tenants directly, not filtered by membership.
  // Race against a 5s timeout — when ECS PostgREST is in zombie state
  // (TCP accept but no HTTP response), the default supabase fetch hangs
  // indefinitely and blocks the whole page render. Empty list → /app
  // shows onboarding instead of spinning forever.
  if (isSuperAdmin(adminCookie)) {
    const query = client
      .from('tenants')
      .select('id, slug, name, industry')
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    const result = await Promise.race([
      query,
      new Promise<{ data: null; error: Error }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: new Error('DB timeout (5s)') }), 5000),
      ),
    ]);

    if (result.error || !result.data) {
      console.warn('[listMyTenants] super-admin query failed:', result.error?.message);
      return [];
    }
    return result.data.map((t) => ({
      id: t.id as string,
      slug: t.slug as string,
      name: t.name as string,
      industry: t.industry as string,
      role: 'owner' as MemberRole,
    }));
  }

  // Two-step query instead of PostgREST embed. The FK was restored in
  // migration 0014, so embed would work now — left as two queries because
  // the extra round-trip is cheap and the code reads more cleanly than a
  // nested embed selector.
  const { data: memberships, error: memErr } = await client
    .from('tenant_memberships')
    .select('role, tenant_id')
    .eq('user_id', user.id)
    .is('deleted_at', null);

  if (memErr || !memberships?.length) return [];

  const tenantIds = memberships.map((m) => m.tenant_id);
  const { data: tenantRows, error: tenantErr } = await client
    .from('tenants')
    .select('id, slug, name, industry')
    .in('id', tenantIds)
    .is('deleted_at', null);

  if (tenantErr || !tenantRows) return [];

  const byId = new Map(tenantRows.map((t) => [t.id, t]));
  return memberships
    .map((m): ActiveTenant | null => {
      const t = byId.get(m.tenant_id);
      if (!t) return null;
      return {
        id: t.id as string,
        slug: t.slug as string,
        name: t.name as string,
        industry: t.industry as string,
        role: m.role as MemberRole,
      };
    })
    .filter((t): t is ActiveTenant => t !== null);
}
