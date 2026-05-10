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
  | { ok: true; staff_name: string; phone_tail: string; kind: 'setup' | 'reset' }
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

  // Don't return full phone — leaking it defeats the binding check (anyone
  // with the link could just read the phone and type it back). Return last
  // 4 digits only as a hint so the right person knows they're at the right
  // page, but anyone forwarding the link can't bypass the check.
  const phone = (staff.phone as string) ?? '';
  const phone_tail = phone.length >= 4 ? phone.slice(-4) : '';

  return {
    ok: true,
    staff_name: staff.real_name as string,
    phone_tail,
    kind: match.kind as 'setup' | 'reset',
  };
}

export type SetupResult = { ok: true } | { ok: false; error: string };

/**
 * Consume a setup/reset token and set the staff member's password. Returns a
 * result object instead of throwing redirect — the client wraps this in
 * useTransition + router.push so we don't depend on Next.js form-action
 * redirect plumbing (which has been flaky in 14.2 dev).
 */
export async function setupStaffPassword(input: {
  token: string;
  phone: string;
  password: string;
  confirm: string;
}): Promise<SetupResult> {
  const { token, phone, password, confirm } = input;

  if (!token) return { ok: false, error: '链接缺失,请重新打开邀请链接' };
  if (!phone || !/^\d{11}$/.test(phone.trim())) {
    return { ok: false, error: '请填写 11 位手机号' };
  }
  if (password !== confirm) return { ok: false, error: '两次输入的密码不一致' };

  const strength = validatePasswordStrength(password);
  if (!strength.ok) return { ok: false, error: strength.reason };

  if (!process.env.STAFF_SESSION_SECRET || process.env.STAFF_SESSION_SECRET.length < 32) {
    return { ok: false, error: '系统未配置 STAFF_SESSION_SECRET' };
  }

  const service = getSupabaseServiceClient();
  const { data: invites, error: invErr } = await service
    .from('staff_invites')
    .select('id, staff_account_id, passcode_hash, expires_at, consumed_at, kind, tenant_id')
    .in('kind', ['setup', 'reset'])
    .order('created_at', { ascending: false })
    .limit(50);
  if (invErr) {
    console.error('[staff-setup] invite query failed:', invErr.message);
    return { ok: false, error: `数据库查询失败: ${invErr.message}` };
  }

  const match = (invites ?? []).find((inv) => verifyInviteToken(token, inv.passcode_hash));
  if (!match) return { ok: false, error: '邀请链接不正确或已被替换' };
  if (match.consumed_at) return { ok: false, error: '邀请链接已使用过' };
  if (new Date(match.expires_at).getTime() <= Date.now()) {
    return { ok: false, error: '邀请链接已过期(超过 7 天)' };
  }

  // Phone binding check — defends against link forwarding/leak.
  // Looks up the pre-registered phone on staff_accounts and rejects setup
  // if the entered phone doesn't match. Mismatches go into audit log so we
  // can spot phishing attempts.
  const { data: staff } = await service
    .from('staff_accounts')
    .select('phone')
    .eq('id', match.staff_account_id)
    .single();
  const expectedPhone = (staff?.phone as string | null) ?? '';
  const enteredPhone = phone.trim();
  if (!expectedPhone) {
    return { ok: false, error: '该员工档案未绑定手机号,请联系管理员' };
  }
  if (expectedPhone !== enteredPhone) {
    await service.from('audit_logs').insert({
      tenant_id: match.tenant_id,
      action: 'staff.setup_phone_mismatch',
      target_type: 'staff_account',
      target_id: match.staff_account_id,
      payload: { entered_tail: enteredPhone.slice(-4) },
    });
    return {
      ok: false,
      error: '手机号不匹配。请填写你向管理员注册时提供的那个手机号(注:链接里只显示尾号 4 位)',
    };
  }

  console.log(`[staff-setup] step 1: consuming token ${match.id}`);
  const { error: cErr } = await service
    .from('staff_invites')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', match.id)
    .is('consumed_at', null);
  if (cErr) {
    console.error('[staff-setup] consume token failed:', cErr.message);
    return { ok: false, error: `保存失败: ${cErr.message}` };
  }

  console.log(`[staff-setup] step 2: hashing + writing password`);
  const newHash = hashPassword(password);
  console.log(`[staff-setup] hash computed, length=${newHash.length}`);
  const { error: pErr } = await service
    .from('staff_accounts')
    .update({ password_hash: newHash })
    .eq('id', match.staff_account_id);
  if (pErr) {
    console.error('[staff-setup] set password failed:', pErr.message);
    return { ok: false, error: `保存密码失败: ${pErr.message}` };
  }

  console.log(`[staff-setup] step 3: audit + session`);
  await service.from('audit_logs').insert({
    tenant_id: match.tenant_id,
    action: match.kind === 'reset' ? 'staff.password_reset_completed' : 'staff.password_setup',
    target_type: 'staff_account',
    target_id: match.staff_account_id,
    payload: {},
  });

  try {
    issueStaffSession(match.staff_account_id, match.tenant_id);
  } catch (err) {
    console.error('[staff-setup] issueStaffSession threw:', err);
    return { ok: false, error: '会话创建失败,请联系管理员' };
  }

  console.log(`[staff-setup] step 4: ok, client will redirect`);
  return { ok: true };
}
