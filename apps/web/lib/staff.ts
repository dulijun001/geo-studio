import { redirect } from 'next/navigation';
import { cache } from 'react';
import { readStaffSession } from './staff-session';
import { getSupabaseServiceClient } from './supabase/service';

export type StaffContext = {
  staff_id: string;
  staff_name: string;
  phone: string | null;
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
};

/**
 * Resolve the current staff session and hydrate with staff + tenant info.
 *
 * Uses service-role client: the staff cookie scheme is independent of Supabase auth,
 * so RLS would see an anonymous user and return nothing. We apply authorization
 * by scoping every query to the cookie's staff_id + tenant_id.
 */
export const getStaffContext = cache(async (): Promise<StaffContext | null> => {
  const session = readStaffSession();
  if (!session) return null;

  const client = getSupabaseServiceClient();
  const { data: staff, error: sErr } = await client
    .from('staff_accounts')
    .select('id, tenant_id, real_name, phone, status')
    .eq('id', session.staff_id)
    .single();
  if (sErr || !staff) return null;
  if (staff.tenant_id !== session.tenant_id) return null; // cookie tampering
  if (staff.status !== 'active') return null;

  const { data: tenant, error: tErr } = await client
    .from('tenants')
    .select('id, name, slug')
    .eq('id', staff.tenant_id)
    .single();
  if (tErr || !tenant) return null;

  return {
    staff_id: staff.id as string,
    staff_name: staff.real_name as string,
    phone: (staff.phone as string) ?? null,
    tenant_id: tenant.id as string,
    tenant_name: tenant.name as string,
    tenant_slug: tenant.slug as string,
  };
});

export async function requireStaff(): Promise<StaffContext> {
  const ctx = await getStaffContext();
  if (!ctx) {
    // Don't clear the cookie here — Next.js 14 only allows cookie writes from
    // Server Actions / Route Handlers, not Server Components. A stale or
    // tampered cookie is harmless: getStaffContext keeps returning null, and
    // a successful login overwrites it via issueStaffSession.
    redirect('/staff/login');
  }
  return ctx;
}
