import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import type { MemberRole } from '@geo/shared';
import { createSupabaseServerClient } from './supabase/server';

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
 * Relies on RLS: if the authenticated user isn't a member, the SELECT returns
 * zero rows (not an error). We treat that as a 404 to avoid leaking existence.
 *
 * Returns null if user not authenticated OR slug not found OR user not a member.
 * Use `requireTenantMember()` in route handlers / pages that must fail loudly.
 *
 * `cache()` dedupes identical calls within one request, so a layout + page + client boundary
 * can all call this without N round trips.
 */
export const resolveTenantBySlug = cache(async (slug: string): Promise<ActiveTenant | null> => {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('tenant_memberships')
    .select('role, tenant:tenants!inner(id, slug, name, industry)')
    .eq('user_id', user.id)
    .eq('tenants.slug', slug)
    .maybeSingle();

  if (error || !data) return null;

  const tenant = Array.isArray(data.tenant) ? data.tenant[0] : data.tenant;
  if (!tenant) return null;

  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    industry: tenant.industry,
    role: data.role as MemberRole,
  };
});

/**
 * Require an active tenant + membership. Redirects to /login if not authed,
 * 404 if tenant doesn't exist or user is not a member.
 */
export async function requireTenantMember(slug: string): Promise<ActiveTenant> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
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
