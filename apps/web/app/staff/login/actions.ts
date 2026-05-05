'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { issueStaffSession } from '@/lib/staff-session';
import { verifyPasscode, verifyPassword } from '@/lib/staff-passcode';
import {
  checkLoginAllowed,
  clearLoginThrottle,
  clientIpFromHeaders,
  recordLoginFailure,
} from '@/lib/login-throttle';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

/**
 * STF-2 — collapse all "user existence" branches into a single error code so
 * an attacker can't tell from the response whether a phone number is registered.
 * The legacy codes (not_found / no_password / ambiguous / expired) only differ
 * to ops in the audit log, never to the user.
 */
function denyLogin(
  phone: string,
  reason: 'invalid' | 'rate_limited' | 'missing_secret' | 'unknown',
  retryAfter?: number,
): never {
  const params = new URLSearchParams({
    error: reason === 'rate_limited' ? 'rate_limited' : reason === 'missing_secret' ? 'missing_secret' : 'invalid',
    phone,
  });
  if (retryAfter && retryAfter > 0) params.set('retry_after', String(retryAfter));
  redirect(`/staff/login?${params.toString()}`);
}

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
    denyLogin(phone, 'invalid');
  }
  if (!process.env.STAFF_SESSION_SECRET || process.env.STAFF_SESSION_SECRET.length < 32) {
    denyLogin(phone, 'missing_secret');
  }

  // STF-1 — throttle BEFORE the credential check so attackers can't bypass
  // it by causing an early abort on validation.
  const ip = clientIpFromHeaders(headers());
  const throttle = checkLoginAllowed(phone, ip);
  if (!throttle.allowed) {
    denyLogin(phone, 'rate_limited', throttle.retryAfterSec);
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
    denyLogin(phone, 'unknown');
  }
  // STF-2 — collapse not_found / ambiguous / no_password / wrong_password into
  // one indistinguishable error. Always record a failure, even for the
  // not_found path, so brute-forcing different phones from the same IP still
  // hits the throttle.
  if (
    !staffRows ||
    staffRows.length === 0 ||
    staffRows.length > 1 ||
    !staffRows[0]?.password_hash ||
    !verifyPassword(password, staffRows[0].password_hash)
  ) {
    recordLoginFailure(phone, ip);
    denyLogin(phone, 'invalid');
  }
  const staff = staffRows[0]!;

  clearLoginThrottle(phone, ip);
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
    denyLogin(phone, 'invalid');
  }

  if (!process.env.STAFF_SESSION_SECRET || process.env.STAFF_SESSION_SECRET.length < 32) {
    denyLogin(phone, 'missing_secret');
  }

  // STF-1 — same throttle key as password path so an attacker can't switch
  // between the two flows to dodge limits.
  const ip = clientIpFromHeaders(headers());
  const throttle = checkLoginAllowed(phone, ip);
  if (!throttle.allowed) {
    denyLogin(phone, 'rate_limited', throttle.retryAfterSec);
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
    denyLogin(phone, 'unknown');
  }

  // STF-2 — same collapse as password path; not_found / ambiguous become invalid.
  if (!staffRows || staffRows.length !== 1) {
    recordLoginFailure(phone, ip);
    denyLogin(phone, 'invalid');
  }
  const staff = staffRows[0]!;

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
    denyLogin(phone, 'unknown');
  }

  const now = Date.now();
  const match = invites!.find(
    (inv) =>
      new Date(inv.expires_at).getTime() > now && verifyPasscode(passcode, inv.passcode_hash),
  );

  if (!match) {
    recordLoginFailure(phone, ip);
    denyLogin(phone, 'invalid');
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

  clearLoginThrottle(phone, ip);
  issueStaffSession(staff.id, staff.tenant_id);
  redirect('/staff');
}
