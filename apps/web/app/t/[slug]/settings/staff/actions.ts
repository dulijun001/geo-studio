'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import {
  generatePasscode,
  hashPasscode,
  generateInviteToken,
  hashInviteToken,
} from '@/lib/staff-passcode';

const INVITE_TTL_MINUTES = 15;
const SETUP_LINK_TTL_HOURS = 24;

const STAFF_ROLES = ['doctor', 'consultant', 'receptionist', 'marketing', 'nurse', 'other'] as const;
type StaffRole = (typeof STAFF_ROLES)[number];

const PLATFORMS = ['toutiao_article', 'douyin_script', 'wechat_mp', 'zhihu', 'xiaohongshu', 'baijiahao', 'souhu'] as const;

export type CreateStaffInput = {
  real_name: string;
  role: StaffRole;
  phone: string;
  /** Comma-separated persona tags. */
  tags?: string;
  /** Subset of PLATFORMS the staff has accounts on. */
  platforms?: string[];
};

/**
 * Create a new staff_account in the current tenant's default brand.
 *
 * V1 simplification: every tenant has exactly one brand (per D2 — no industry-
 * specific assumptions, but each tenant is a single dental hospital / clinic
 * for now). Pick the first active brand. V3 SaaS will surface a brand picker.
 */
export async function createStaffAccount(
  tenantSlug: string,
  input: CreateStaffInput,
): Promise<{ id: string }> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);

  const real_name = input.real_name.trim();
  const phone = input.phone.trim();
  if (!real_name) throw new Error('请填写姓名');
  if (!/^1[3-9]\d{9}$/.test(phone)) throw new Error('请填写正确的中国大陆手机号(11 位)');
  if (!STAFF_ROLES.includes(input.role)) throw new Error('请选择岗位');

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  const service = getSupabaseServiceClient();

  // Pick the first brand for this tenant.
  const { data: brand, error: bErr } = await service
    .from('brands')
    .select('id')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (bErr || !brand) {
    throw new Error('当前租户还没有 brand。请先在数据库 seed 一个,或等 V2 加品牌管理 UI。');
  }

  // Phone uniqueness within tenant — schema has a partial unique index but the
  // user-facing error is much friendlier than a 23505 constraint violation.
  const { data: dup } = await service
    .from('staff_accounts')
    .select('id')
    .eq('tenant_id', tenant.id)
    .eq('phone', phone)
    .is('deleted_at', null)
    .limit(1);
  if (dup && dup.length > 0) {
    throw new Error('该手机号已经在员工列表里,不能重复');
  }

  const tags = (input.tags ?? '')
    .split(/[,,、\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8);

  const platformsObj: Record<string, { handle?: string }> = {};
  for (const p of input.platforms ?? []) {
    if ((PLATFORMS as readonly string[]).includes(p)) {
      platformsObj[p] = {};
    }
  }

  const { data: inserted, error: insErr } = await service
    .from('staff_accounts')
    .insert({
      tenant_id: tenant.id,
      brand_id: brand.id,
      real_name,
      role: input.role,
      phone,
      persona: { tags },
      platforms: platformsObj,
      status: 'active',
    })
    .select('id')
    .single();
  if (insErr || !inserted) throw new Error(`新建失败: ${insErr?.message}`);

  await service.from('audit_logs').insert({
    tenant_id: tenant.id,
    actor_user_id: user.id,
    action: 'staff.created',
    target_type: 'staff_account',
    target_id: inserted.id,
    payload: { real_name, role: input.role, platforms: Object.keys(platformsObj) },
  });

  revalidatePath(`/t/${tenantSlug}/settings/staff`);
  return { id: inserted.id as string };
}

/**
 * Generate a new 6-digit passcode for a staff account and store its hash.
 *
 * Returns the plaintext passcode so the admin can share it once — we never
 * show it again after this call. Caller is responsible for closing the
 * "show once" modal before the user navigates away.
 */
export async function generateStaffInvite(
  tenantSlug: string,
  staffAccountId: string,
): Promise<{ passcode: string; expires_at: string }> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  const service = getSupabaseServiceClient();

  // Verify ownership via a scoped read (RLS-equivalent via explicit filter).
  const { data: staff, error: sErr } = await service
    .from('staff_accounts')
    .select('id, tenant_id, phone, status')
    .eq('id', staffAccountId)
    .eq('tenant_id', tenant.id)
    .single();
  if (sErr || !staff) throw new Error('员工不存在或不属于当前租户');
  if (!staff.phone) throw new Error('该员工尚未录入手机号,无法生成访问码');

  const passcode = generatePasscode();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MINUTES * 60 * 1000);

  // Invalidate prior unconsumed invites so old codes stop working immediately.
  await service
    .from('staff_invites')
    .update({ consumed_at: new Date().toISOString() })
    .eq('staff_account_id', staffAccountId)
    .is('consumed_at', null);

  const { error: insErr } = await service.from('staff_invites').insert({
    tenant_id: tenant.id,
    staff_account_id: staffAccountId,
    passcode_hash: hashPasscode(passcode),
    expires_at: expiresAt.toISOString(),
  });
  if (insErr) throw new Error(`生成访问码失败: ${insErr.message}`);

  await service.from('audit_logs').insert({
    tenant_id: tenant.id,
    actor_user_id: user.id,
    action: 'staff.invite_generated',
    target_type: 'staff_account',
    target_id: staffAccountId,
    payload: { ttl_minutes: INVITE_TTL_MINUTES },
  });

  revalidatePath(`/t/${tenantSlug}/settings/staff`);
  return { passcode, expires_at: expiresAt.toISOString() };
}

// ============================================================================
// V1.6-3: setup link + password reset (preferred over disposable passcode)
// ============================================================================

/**
 * Generate a one-time setup invite link. Admin sends the URL to the staff
 * member; they open it and pick their own password. Subsequent logins are
 * phone + password — no SMS, no admin involvement.
 *
 * `kind`:
 *   - 'setup' (default for new staff): just creates an invite. Existing
 *     password (if any) is preserved until the staff actually completes setup.
 *   - 'reset' (when admin clicks 「重置密码」): also nulls password_hash so the
 *     old password stops working immediately. Staff must use the link to set
 *     a new one.
 */
export async function generateStaffSetupLink(
  tenantSlug: string,
  staffAccountId: string,
  kind: 'setup' | 'reset' = 'setup',
): Promise<{ url: string; expires_at: string }> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  const service = getSupabaseServiceClient();

  const { data: staff, error: sErr } = await service
    .from('staff_accounts')
    .select('id, tenant_id, phone, status')
    .eq('id', staffAccountId)
    .eq('tenant_id', tenant.id)
    .single();
  if (sErr || !staff) throw new Error('员工不存在或不属于当前租户');
  if (!staff.phone) throw new Error('该员工尚未录入手机号,无法生成邀请链接');

  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + SETUP_LINK_TTL_HOURS * 3600 * 1000);

  // Invalidate prior unconsumed setup/reset invites for this staff
  await service
    .from('staff_invites')
    .update({ consumed_at: new Date().toISOString() })
    .eq('staff_account_id', staffAccountId)
    .in('kind', ['setup', 'reset'])
    .is('consumed_at', null);

  // For 'reset', also clear the existing password so the old one stops
  // working before the staff actually uses the link
  if (kind === 'reset') {
    await service
      .from('staff_accounts')
      .update({ password_hash: null })
      .eq('id', staffAccountId);
  }

  const { error: insErr } = await service.from('staff_invites').insert({
    tenant_id: tenant.id,
    staff_account_id: staffAccountId,
    kind,
    passcode_hash: hashInviteToken(token),
    expires_at: expiresAt.toISOString(),
  });
  if (insErr) throw new Error(`生成邀请链接失败: ${insErr.message}`);

  await service.from('audit_logs').insert({
    tenant_id: tenant.id,
    actor_user_id: user.id,
    action: kind === 'reset' ? 'staff.password_reset' : 'staff.setup_link_generated',
    target_type: 'staff_account',
    target_id: staffAccountId,
    payload: { ttl_hours: SETUP_LINK_TTL_HOURS },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  const url = `${baseUrl}/staff/setup?token=${encodeURIComponent(token)}`;

  revalidatePath(`/t/${tenantSlug}/settings/staff`);
  return { url, expires_at: expiresAt.toISOString() };
}
