'use server';

import { redirect } from 'next/navigation';
import { issueStaffSession } from '@/lib/staff-session';
import {
  hashPassword,
  validatePasswordStrength,
  verifyInviteToken,
} from '@/lib/staff-passcode';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

/**
 * Validate a setup/reset invite token without consuming it. Used by the
 * setup page to render the staff member's name and decide whether to show
 * the form vs an "expired/invalid" message.
 */
export async function inspectSetupToken(token: string): Promise<
  | { ok: true; staff_name: string; phone: string; kind: 'setup' | 'reset' }
  | { ok: false; reason: 'invalid' | 'expired' | 'consumed' }
> {
  if (!token || token.length < 16) return { ok: false, reason: 'invalid' };

  const service = getSupabaseServiceClient();
  const { data: invites } = await service
    .from('staff_invites')
    .select('id, staff_account_id, passcode_hash, expires_at, consumed_at, kind')
    .in('kind', ['setup', 'reset'])
    .order('created_at', { ascending: false })
    .limit(50);
  if (!invites?.length) return { ok: false, reason: 'invalid' };

  const match = invites.find((inv) => verifyInviteToken(token, inv.passcode_hash));
  if (!match) return { ok: false, reason: 'invalid' };

  if (match.consumed_at) return { ok: false, reason: 'consumed' };
  if (new Date(match.expires_at).getTime() <= Date.now()) {
    return { ok: false, reason: 'expired' };
  }

  const { data: staff } = await service
    .from('staff_accounts')
    .select('real_name, phone')
    .eq('id', match.staff_account_id)
    .single();
  if (!staff) return { ok: false, reason: 'invalid' };

  return {
    ok: true,
    staff_name: staff.real_name as string,
    phone: (staff.phone as string) ?? '',
    kind: match.kind as 'setup' | 'reset',
  };
}

/**
 * Consume a setup/reset token and set the staff member's password. On success
 * issues a session cookie and redirects to /staff.
 */
export async function setupStaffPassword(form: FormData): Promise<void> {
  const tokenRaw = form.get('token');
  const passwordRaw = form.get('password');
  const confirmRaw = form.get('confirm');
  const token = typeof tokenRaw === 'string' ? tokenRaw : '';
  const password = typeof passwordRaw === 'string' ? passwordRaw : '';
  const confirm = typeof confirmRaw === 'string' ? confirmRaw : '';

  if (!token) redirect('/staff/login?error=missing_secret');
  if (password !== confirm) {
    redirect(`/staff/setup?token=${encodeURIComponent(token)}&error=mismatch`);
  }
  const strength = validatePasswordStrength(password);
  if (!strength.ok) {
    redirect(
      `/staff/setup?token=${encodeURIComponent(token)}&error=weak&detail=${encodeURIComponent(
        strength.reason,
      )}`,
    );
  }

  if (!process.env.STAFF_SESSION_SECRET || process.env.STAFF_SESSION_SECRET.length < 32) {
    redirect('/staff/login?error=missing_secret');
  }

  const service = getSupabaseServiceClient();
  const { data: invites } = await service
    .from('staff_invites')
    .select('id, staff_account_id, passcode_hash, expires_at, consumed_at, kind, tenant_id')
    .in('kind', ['setup', 'reset'])
    .order('created_at', { ascending: false })
    .limit(50);

  const match = (invites ?? []).find((inv) => verifyInviteToken(token, inv.passcode_hash));
  if (!match) redirect('/staff/login?error=invalid');
  if (match.consumed_at) redirect('/staff/login?error=consumed');
  if (new Date(match.expires_at).getTime() <= Date.now()) {
    redirect('/staff/login?error=expired');
  }

  // Consume + set password atomically-ish: mark token first to prevent races,
  // then write password_hash. If the second write fails the token is gone but
  // admin can issue a new one — preferable to a token that lingers usable.
  const { error: cErr } = await service
    .from('staff_invites')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', match.id)
    .is('consumed_at', null);
  if (cErr) {
    console.error('[staff-setup] consume token failed:', cErr.message);
    redirect('/staff/login?error=unknown');
  }

  const { error: pErr } = await service
    .from('staff_accounts')
    .update({ password_hash: hashPassword(password) })
    .eq('id', match.staff_account_id);
  if (pErr) {
    console.error('[staff-setup] set password failed:', pErr.message);
    redirect('/staff/login?error=unknown');
  }

  await service.from('audit_logs').insert({
    tenant_id: match.tenant_id,
    action: match.kind === 'reset' ? 'staff.password_reset_completed' : 'staff.password_setup',
    target_type: 'staff_account',
    target_id: match.staff_account_id,
    payload: {},
  });

  issueStaffSession(match.staff_account_id, match.tenant_id);
  redirect('/staff');
}
