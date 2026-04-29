'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export type CheckinResult =
  | {
      ok: true;
      stage: string;
      doctor_name: string | null;
    }
  | {
      ok: false;
      error: string;
    };

/**
 * Public conversion check-in — no auth. The patient (or front desk) submits
 * an activity code and which stage they're at. We service-role write the
 * event so RLS doesn't block it.
 *
 * Match rule for V1:
 *   1. Look up the tenant by slug (must be active).
 *   2. Find a hook of type=activity_code with hook_value = code, scoped to
 *      this tenant, where valid_until > now (or NULL).
 *   3. Insert one conversion_events row pointing at the hook.
 *
 * Anti-abuse for V1:
 *   - Rate limit at the application boundary: dedup (hook_id, stage) — if a
 *     row exists for this (hook, stage), do nothing and return ok with the
 *     prior timestamp. This prevents accidental double-submits without
 *     blocking legitimate stage progression.
 */
/**
 * Optional identity hint — patient_ref or phone last 4. When present, the
 * conversion event is linked to a customer_identities row so the
 * /attribution/journey/[id] page can render the multi-touch journey + 3
 * attribution models. When absent, behavior is unchanged from V1 (single-
 * touch, hook-only attribution still works).
 */
export async function submitCheckin(
  slug: string,
  activityCode: string,
  stage: string,
  doctorName?: string,
  identityKey?: string,
): Promise<CheckinResult> {
  const code = activityCode.trim().toUpperCase();
  if (!/^[A-Z2-9]{4,8}$/.test(code)) {
    return { ok: false, error: '暗号格式不对(应为 6 位字母数字组合)。' };
  }
  if (!['arrived', 'consulted', 'treated', 'paid', 'lost'].includes(stage)) {
    return { ok: false, error: '阶段值无效。' };
  }

  const service = getSupabaseServiceClient();

  const { data: tenant, error: tErr } = await service
    .from('tenants')
    .select('id, slug')
    .eq('slug', slug)
    .single();
  if (tErr || !tenant) return { ok: false, error: '门店未找到。' };

  // Find the hook. valid_until is optional — null means no expiry.
  const { data: hooks, error: hErr } = await service
    .from('hooks')
    .select('id, hook_value, valid_until, publish_task_id')
    .eq('tenant_id', tenant.id)
    .eq('hook_type', 'activity_code')
    .eq('hook_value', code)
    .is('deleted_at', null);
  if (hErr) return { ok: false, error: `查询失败: ${hErr.message}` };

  const now = Date.now();
  const valid = (hooks ?? []).find(
    (h) => !h.valid_until || new Date(h.valid_until as string).getTime() > now,
  );
  if (!valid) {
    return {
      ok: false,
      error: '暗号不存在或已过期。请联系医生确认 6 位暗号。',
    };
  }

  // Dedup on (hook_id, stage) — repeated submits don't double-count.
  const { data: existing } = await service
    .from('conversion_events')
    .select('id')
    .eq('hook_id', valid.id)
    .eq('stage', stage)
    .limit(1);
  if (existing && existing.length > 0) {
    return { ok: true, stage, doctor_name: doctorName?.trim() || null };
  }

  // Upsert customer identity if the operator provided a stable key (patient
  // ref / phone last 4). Without an identityKey we still write the
  // conversion_event but skip the multi-touch path — single-touch hook
  // attribution still works for those rows.
  let identityId: string | null = null;
  if (identityKey?.trim()) {
    const patientRef = identityKey.trim();
    // Look up existing identity for this tenant + ref
    const { data: existingId } = await service
      .from('customer_identities')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('patient_ref', patientRef)
      .is('deleted_at', null)
      .maybeSingle();
    if (existingId) {
      identityId = existingId.id as string;
    } else {
      const { data: newId } = await service
        .from('customer_identities')
        .insert({
          tenant_id: tenant.id,
          patient_ref: patientRef,
          first_hook_value: code,
          notes: doctorName?.trim() ? `首次自报医生: ${doctorName.trim()}` : null,
        })
        .select('id')
        .single();
      identityId = (newId?.id as string | undefined) ?? null;
    }

    // Record this check-in as a touchpoint
    if (identityId && valid.publish_task_id) {
      await service.from('journey_touchpoints').insert({
        tenant_id: tenant.id,
        identity_id: identityId,
        publish_task_id: valid.publish_task_id,
        touchpoint_type: stage === 'arrived' ? 'arrived' : 'follow_up',
        payload: { activity_code: code, stage, self_reported_doctor: doctorName?.trim() ?? null },
      });
    }
  }

  const { error: insErr } = await service.from('conversion_events').insert({
    tenant_id: tenant.id,
    hook_id: valid.id,
    identity_id: identityId,
    stage,
    stage_at: new Date().toISOString(),
    notes: doctorName?.trim() ? `自报医生: ${doctorName.trim()}` : null,
  });
  if (insErr) return { ok: false, error: `提交失败: ${insErr.message}` };

  revalidatePath(`/t/${slug}/attribution`);
  return { ok: true, stage, doctor_name: doctorName?.trim() || null };
}
