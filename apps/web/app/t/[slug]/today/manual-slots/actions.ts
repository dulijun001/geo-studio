/**
 * V1.10 / docs/09 — manual slots editor (T4).
 *
 * Replaces settings.pending_manual_slots wholesale. Cron #1 reads this field
 * at 02:00 CST + writes a snapshot to daily_ops_runs.manual_slots.
 *
 * D-Ops-6 simplified: no "23:59 lock" — what's in pending_manual_slots at
 * cron time is what's used. Customer can change anytime; takes effect next
 * cron run.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { VARIANT_PLATFORMS, reportError, type VariantPlatform } from '@geo/shared';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { requireRole } from '@/lib/tenant';

export type ManualSlotInput = {
  topic: string;
  audience: string;
  platforms: string[];
};

export async function saveManualSlots(
  tenantSlug: string,
  slots: ManualSlotInput[],
): Promise<{ ok: true; saved: number } | { ok: false; error: string }> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const service = getSupabaseServiceClient();

  // Fetch the cap to validate against
  const { data: settings, error: sErr } = await service
    .from('daily_ops_settings')
    .select('manual_slot_max')
    .eq('tenant_id', tenant.id)
    .maybeSingle();

  if (sErr) {
    reportError(sErr, {
      scope: 'daily-ops.manual_slots.load_settings',
      tenant_id: tenant.id,
    });
    return { ok: false, error: `加载设置失败: ${sErr.message}` };
  }
  const cap = (settings?.manual_slot_max as number | undefined) ?? 2;

  // Sanitize + validate input
  const clean: ManualSlotInput[] = [];
  for (const s of slots) {
    if (clean.length >= cap) break;
    const topic = (s.topic ?? '').trim();
    const audience = (s.audience ?? '').trim();
    if (topic.length < 2) continue;
    if (audience.length < 1) continue;
    const platforms = (s.platforms ?? []).filter((p): p is VariantPlatform =>
      (VARIANT_PLATFORMS as readonly string[]).includes(p),
    );
    if (platforms.length === 0) continue;
    clean.push({ topic, audience, platforms });
  }

  if (clean.length === 0 && slots.length > 0) {
    return { ok: false, error: '没有有效的手填位(标题至少 2 字 / 受众非空 / 至少选 1 个平台)' };
  }

  const { error: upErr } = await service
    .from('daily_ops_settings')
    .upsert(
      {
        tenant_id: tenant.id,
        pending_manual_slots: clean,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id' },
    );

  if (upErr) {
    reportError(upErr, {
      scope: 'daily-ops.manual_slots.save',
      tenant_id: tenant.id,
      extra: { count: clean.length },
    });
    return { ok: false, error: `保存失败: ${upErr.message}` };
  }

  revalidatePath(`/t/${tenantSlug}/today/manual-slots`);
  revalidatePath(`/t/${tenantSlug}/today`);
  return { ok: true, saved: clean.length };
}
