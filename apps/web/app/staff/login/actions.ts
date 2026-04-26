'use server';

import { redirect } from 'next/navigation';
import { issueStaffSession } from '@/lib/staff-session';
import { verifyPasscode, verifyPassword } from '@/lib/staff-passcode';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

/**
 * V1.6-3 default login flow: phone + self-chosen password.
 *
 * The legacy 6-digit passcode flow is preserved below for emergency
 * admin-mediated fallback; the UI no longer surfaces it but devs/admins can
 * still call loginWithPasscode if the password reset path fails.
 */
export async function loginWithPassword(form: FormData): Promise<void> {
  const phoneRaw = form.get('phone');
  const passwordRaw = form.get('password');
  const phone = typeof phoneRaw === 'string' ? phoneRaw.trim() : '';
  const password = typeof passwordRaw === 'string' ? passwordRaw : '';

  if (!/^1[3-9]\d{9}$/.test(phone) || !password) {
    redirect(`/staff/login?error=invalid&phone=${encodeURIComponent(phone)}`);
  }
  if (!process.env.STAFF_SESSION_SECRET || process.env.STAFF_SESSION_SECRET.length < 32) {
    redirect('/staff/login?error=missing_secret');
  }

  const client = getSupabaseServiceClient();
  const { data: staffRows, error: staffErr } = await client
    .from('staff_accounts')
    .select('id, tenant_id, phone, status, password_hash')
    .eq('phone', phone)
    .eq('status', 'active')
    .is('deleted_at', null);
  if (staffErr) {
    console.error('[staff-login-pwd] lookup failed:', staffErr.message);
    redirect(`/staff/login?error=unknown&phone=${encodeURIComponent(phone)}`);
  }
  if (!staffRows || staffRows.length === 0) {
    redirect(`/staff/login?error=not_found&phone=${encodeURIComponent(phone)}`);
  }
  if (staffRows.length > 1) {
    redirect(`/staff/login?error=ambiguous&phone=${encodeURIComponent(phone)}`);
  }
  const staff = staffRows[0]!;

  if (!staff.password_hash) {
    // Staff exists but has never set a password — they need a setup link
    redirect(`/staff/login?error=no_password&phone=${encodeURIComponent(phone)}`);
  }

  if (!verifyPassword(password, staff.password_hash)) {
    redirect(`/staff/login?error=invalid&phone=${encodeURIComponent(phone)}`);
  }

  issueStaffSession(staff.id, staff.tenant_id);
  redirect('/staff');
}

/**
 * Verify (phone, passcode) against staff_invites and issue a staff session cookie.
 *
 * Must use service-role client: the caller is a guest (no Supabase auth yet),
 * so RLS would return zero rows. We apply our own authorization by matching on
 * phone + passcode + expiry.
 */
export async function loginWithPasscode(form: FormData): Promise<void> {
  const phoneRaw = form.get('phone');
  const passcodeRaw = form.get('passcode');
  const phone = typeof phoneRaw === 'string' ? phoneRaw.trim() : '';
  const passcode = typeof passcodeRaw === 'string' ? passcodeRaw.trim() : '';

  if (!/^1[3-9]\d{9}$/.test(phone) || !/^\d{6}$/.test(passcode)) {
    redirect(`/staff/login?error=invalid&phone=${encodeURIComponent(phone)}`);
  }

  if (!process.env.STAFF_SESSION_SECRET || process.env.STAFF_SESSION_SECRET.length < 32) {
    redirect('/staff/login?error=missing_secret');
  }

  const client = getSupabaseServiceClient();

  const { data: staffRows, error: staffErr } = await client
    .from('staff_accounts')
    .select('id, tenant_id, phone, status')
    .eq('phone', phone)
    .eq('status', 'active')
    .is('deleted_at', null);

  if (staffErr) {
    console.error('[staff-login] staff lookup failed:', staffErr.message);
    redirect(`/staff/login?error=unknown&phone=${encodeURIComponent(phone)}`);
  }

  if (!staffRows || staffRows.length === 0) {
    redirect(`/staff/login?error=not_found&phone=${encodeURIComponent(phone)}`);
  }
  if (staffRows.length > 1) {
    // Multi-tenant collision — defer to admin-issued single-use links (not built in V1).
    redirect(`/staff/login?error=ambiguous&phone=${encodeURIComponent(phone)}`);
  }

  const staff = staffRows[0];
  if (!staff) {
    redirect(`/staff/login?error=not_found&phone=${encodeURIComponent(phone)}`);
  }

  // Load non-consumed, non-expired invites for this staff.
  const { data: invites, error: invErr } = await client
    .from('staff_invites')
    .select('id, passcode_hash, expires_at, consumed_at')
    .eq('staff_account_id', staff.id)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(5);

  if (invErr || !invites) {
    console.error('[staff-login] invite lookup failed:', invErr?.message);
    redirect(`/staff/login?error=unknown&phone=${encodeURIComponent(phone)}`);
  }

  const now = Date.now();
  const match = invites.find(
    (inv) =>
      new Date(inv.expires_at).getTime() > now && verifyPasscode(passcode, inv.passcode_hash),
  );

  if (!match) {
    const anyExpired = invites.some((inv) => new Date(inv.expires_at).getTime() <= now);
    const code = invites.length === 0 || !anyExpired ? 'invalid' : 'expired';
    redirect(`/staff/login?error=${code}&phone=${encodeURIComponent(phone)}`);
  }

  // Consume this invite; invalidate siblings so one login burns the whole batch.
  const { error: upErr } = await client
    .from('staff_invites')
    .update({ consumed_at: new Date().toISOString() })
    .eq('staff_account_id', staff.id)
    .is('consumed_at', null);
  if (upErr) {
    console.error('[staff-login] consume invite failed:', upErr.message);
    // Non-fatal — session still issued; but we warn so double-logins are spotted.
  }

  issueStaffSession(staff.id, staff.tenant_id);
  redirect('/staff');
}
