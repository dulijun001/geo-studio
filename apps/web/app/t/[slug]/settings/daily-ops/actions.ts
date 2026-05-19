/**
 * V1.10 / docs/09 — daily-ops settings update.
 *
 * One server action `updateDailyOpsSettings` covers all editable fields.
 * Service-role write (admin-cookie session has no Supabase JWT).
 */
'use server';

import { revalidatePath } from 'next/cache';
import { reportError } from '@geo/shared';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { requireRole } from '@/lib/tenant';

export type DailyOpsSettingsInput = {
  enabled: boolean;
  topic_count_auto: number;
  manual_slot_max: number;
  timeout_hours: number;
  weekend_skip: boolean;
  max_variants_day: number;
  notify_email: string | null;
};

const VALID_TIMEOUT = [2, 4, 6, 8, 12, 24] as const;

export async function updateDailyOpsSettings(
  tenantSlug: string,
  input: DailyOpsSettingsInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin']);

  // Validate
  if (!Number.isInteger(input.topic_count_auto) || input.topic_count_auto < 0 || input.topic_count_auto > 15) {
    return { ok: false, error: '自动选题数须在 0-15 之间' };
  }
  if (!Number.isInteger(input.manual_slot_max) || input.manual_slot_max < 0 || input.manual_slot_max > 5) {
    return { ok: false, error: '手填位上限须在 0-5 之间' };
  }
  if (!VALID_TIMEOUT.includes(input.timeout_hours as (typeof VALID_TIMEOUT)[number])) {
    return { ok: false, error: '审核超时须从 2/4/6/8/12/24 中选' };
  }
  if (!Number.isInteger(input.max_variants_day) || input.max_variants_day < 5 || input.max_variants_day > 200) {
    return { ok: false, error: '每日变体上限须在 5-200 之间' };
  }
  if (input.topic_count_auto === 0 && input.manual_slot_max === 0 && input.enabled) {
    return { ok: false, error: '启用 daily-ops 时,自动选题或手填位至少要留 1 个' };
  }
  const email = input.notify_email?.trim() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: '邮箱格式不正确' };
  }

  const service = getSupabaseServiceClient();

  // Upsert — DB has the row from migration backfill, but be defensive in case
  // a tenant was created mid-migration.
  const { error } = await service
    .from('daily_ops_settings')
    .upsert(
      {
        tenant_id: tenant.id,
        enabled: input.enabled,
        topic_count_auto: input.topic_count_auto,
        manual_slot_max: input.manual_slot_max,
        timeout_hours: input.timeout_hours,
        weekend_skip: input.weekend_skip,
        max_variants_day: input.max_variants_day,
        notify_email: email,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id' },
    );

  if (error) {
    reportError(error, {
      scope: 'daily-ops.settings.update',
      tenant_id: tenant.id,
      extra: { enabled: input.enabled },
    });
    return { ok: false, error: `保存失败: ${error.message}` };
  }

  revalidatePath(`/t/${tenantSlug}/settings/daily-ops`);
  revalidatePath(`/t/${tenantSlug}/today`);
  return { ok: true };
}
