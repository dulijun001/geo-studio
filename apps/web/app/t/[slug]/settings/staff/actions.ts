'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { generatePasscode, hashPasscode } from '@/lib/staff-passcode';

const INVITE_TTL_MINUTES = 15;

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
