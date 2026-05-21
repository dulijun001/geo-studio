/**
 * Service-callable dispatch (V1.11.3 / D2).
 *
 * Mirror of `apps/web/app/t/[slug]/publish/actions.ts:dispatchToday` minus
 * the `requireRole` + `revalidatePath` web concerns. Lets the worker's
 * `auto-dispatch-timeout` cron close the last hop of daily-ops automation:
 * variants tagged dispatchable → publish_tasks rows ready for staff.
 *
 * Keep this file in lockstep with `dispatchToday` until V2 absorbs both into
 * a shared package — the algorithm + data model is the same, only the
 * trigger differs (user button vs cron).
 *
 * Why duplicated (not extracted to a shared lib yet):
 *   - geo-core is supabase-client-free on purpose (pure scoring algorithm)
 *   - apps/web's lib/ can't be imported from apps/worker (workspace boundary)
 *   - copy-with-comment is faster + safer than a third package for ~80 lines
 *
 * Sync checklist when you touch dispatchToday:
 *   - dispatcher H0/H1/H2/H3 filter changes → mirror here
 *   - business_hours-derived morning_at/afternoon_at logic → mirror here
 *   - scheduled_at write convention → mirror here
 *   - hooks generation (currently disabled) → enable here too
 */
import { dispatchDaily, type DispatchInput } from '@geo/geo-core';
import { reportError, reportEvent } from '@geo/shared';
import { getServiceClient } from './supabase';

type DispatchSettings = {
  daily_cap_per_staff: number;
  morning_at: string;
  afternoon_at: string;
};

const DISPATCH_DEFAULTS: DispatchSettings = {
  daily_cap_per_staff: 2,
  morning_at: '10:00',
  afternoon_at: '15:00',
};

function resolveDispatchSettings(
  tenantSettings: Record<string, unknown> | null | undefined,
  businessHours: Record<string, unknown> | null | undefined,
): DispatchSettings {
  const raw = (tenantSettings?.dispatch ?? {}) as Record<string, unknown>;
  let morningDefault = DISPATCH_DEFAULTS.morning_at;
  let afternoonDefault = DISPATCH_DEFAULTS.afternoon_at;
  for (const day of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) {
    const range = businessHours?.[day];
    if (typeof range === 'string') {
      const m = range.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
      if (m) {
        const openH = Math.min(Math.max(Number(m[1]) + 1, 0), 23);
        const closeH = Math.min(Math.max(Number(m[3]) - 1, 0), 23);
        morningDefault = `${String(openH).padStart(2, '0')}:00`;
        afternoonDefault = `${String(closeH).padStart(2, '0')}:00`;
        break;
      }
    }
  }
  const dailyCap = Number(raw.daily_cap_per_staff);
  return {
    daily_cap_per_staff:
      Number.isFinite(dailyCap) && dailyCap > 0 && dailyCap <= 50
        ? Math.floor(dailyCap)
        : DISPATCH_DEFAULTS.daily_cap_per_staff,
    morning_at:
      typeof raw.morning_at === 'string' && /^\d{1,2}:\d{2}$/.test(raw.morning_at)
        ? raw.morning_at
        : morningDefault,
    afternoon_at:
      typeof raw.afternoon_at === 'string' && /^\d{1,2}:\d{2}$/.test(raw.afternoon_at)
        ? raw.afternoon_at
        : afternoonDefault,
  };
}

function applyHHMM(date: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(date);
  d.setHours(h ?? 10, m ?? 0, 0, 0);
  return d;
}

export type AutoDispatchResult = {
  /** publish_tasks rows actually inserted. */
  dispatched: number;
  /** Variants the dispatcher couldn't place. */
  unmatched: number;
  /** Active staff that got zero tasks this round. */
  idle_staff: number;
};

/**
 * Run dispatch for a tenant. Picks all eligible variants not yet on any
 * publish_task, calls the pure dispatcher algorithm, and writes
 * publish_tasks + audit_log rows. Idempotent on collision (anti-collision
 * H1 in dispatcher).
 *
 * Returns counts. Throws on data-layer error; caller (cron) decides retry.
 */
export async function runAutoDispatch(tenantId: string): Promise<AutoDispatchResult> {
  const service = getServiceClient();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [variantsRes, tasksRes, staffRes, tenantRes, brandRes] = await Promise.all([
    service
      .from('content_variants')
      .select('id, platform, content_item_id, updated_at, dod_status')
      .eq('tenant_id', tenantId)
      .in('compliance_status', ['auto_approved', 'manual_approved'])
      .neq('dod_status', 'failed')
      .not('status', 'in', '(archived,rejected)')
      .is('deleted_at', null),
    service
      .from('publish_tasks')
      .select('variant_id, staff_account_id, created_at')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null),
    service
      .from('staff_accounts')
      .select('id, persona, platforms, settings')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .eq('kind', 'operator')
      .is('deleted_at', null),
    service.from('tenants').select('settings').eq('id', tenantId).maybeSingle(),
    service
      .from('brands')
      .select('business_hours')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (variantsRes.error) throw new Error(`load variants failed: ${variantsRes.error.message}`);
  if (tasksRes.error) throw new Error(`load tasks failed: ${tasksRes.error.message}`);
  if (staffRes.error) throw new Error(`load staff failed: ${staffRes.error.message}`);

  const dispatchSettings = resolveDispatchSettings(
    tenantRes.data?.settings as Record<string, unknown> | null,
    brandRes.data?.business_hours as Record<string, unknown> | null,
  );

  const variants = variantsRes.data ?? [];
  const allTasks = tasksRes.data ?? [];
  const staffRows = staffRes.data ?? [];

  const takenIds = new Set(allTasks.map((r) => r.variant_id as string));
  const freshVariants = variants.filter((v) => !takenIds.has(v.id as string));
  if (freshVariants.length === 0) {
    return { dispatched: 0, unmatched: 0, idle_staff: 0 };
  }

  const todayStart = startOfDay.getTime();
  const staffTodayCount = new Map<string, number>();
  const existing_assignments: Array<{ variant_id: string; staff_id: string }> = [];
  for (const row of allTasks) {
    if (new Date(row.created_at as string).getTime() < todayStart) continue;
    const sid = row.staff_account_id as string;
    staffTodayCount.set(sid, (staffTodayCount.get(sid) ?? 0) + 1);
    existing_assignments.push({
      variant_id: row.variant_id as string,
      staff_id: sid,
    });
  }

  const contentItemIds = Array.from(
    new Set(
      freshVariants
        .map((v) => v.content_item_id as string | null)
        .filter((id): id is string => !!id),
    ),
  );
  const topicsByItem = new Map<string, string[]>();
  if (contentItemIds.length > 0) {
    const { data: ciRows } = await service
      .from('content_items')
      .select('id, topics')
      .in('id', contentItemIds);
    for (const ci of ciRows ?? []) {
      topicsByItem.set(ci.id as string, (ci.topics as string[]) ?? []);
    }
  }

  // V1.11 D22 H0 — opt-in publishers only
  const staff = staffRows.map((s) => {
    const persona = (s.persona ?? {}) as Record<string, unknown>;
    const personaTags = Array.isArray(persona.tags) ? (persona.tags as string[]) : [];
    const platformsObj = (s.platforms ?? {}) as Record<string, unknown>;
    const settings = (s.settings ?? {}) as Record<string, unknown>;
    const publishing = (settings.publishing ?? {}) as Record<string, unknown>;
    const isActive = publishing.is_active === true;
    const dailyQuota =
      typeof publishing.daily_quota === 'number' && publishing.daily_quota > 0
        ? (publishing.daily_quota as number)
        : undefined;
    return {
      id: s.id as string,
      persona_tags: personaTags,
      platforms: Object.keys(platformsObj),
      tasks_today: staffTodayCount.get(s.id as string) ?? 0,
      is_active: isActive,
      daily_quota: dailyQuota,
    };
  });

  // Bail safely if there's no active publisher — don't no-op silently.
  const activeCount = staff.filter((s) => s.is_active).length;
  if (activeCount === 0) {
    reportEvent('daily-ops.auto-dispatch.no_active_publishers', {
      scope: 'auto-dispatch-runner',
      tenant_id: tenantId,
    });
    return { dispatched: 0, unmatched: freshVariants.length, idle_staff: 0 };
  }

  const input: DispatchInput = {
    variants: freshVariants.map((v) => ({
      id: v.id as string,
      platform: v.platform as string,
      topics: topicsByItem.get(v.content_item_id as string) ?? [],
      ready_at: new Date(v.updated_at as string),
    })),
    staff,
    existing_assignments,
    daily_cap_per_staff: dispatchSettings.daily_cap_per_staff,
    seed: startOfDay.toISOString().slice(0, 10),
  };

  const result = dispatchDaily(input);

  if (result.proposals.length === 0) {
    return {
      dispatched: 0,
      unmatched: result.unmatched.length,
      idle_staff: result.idle_staff.length,
    };
  }

  const morningAt = applyHHMM(startOfDay, dispatchSettings.morning_at);
  const afternoonAt = applyHHMM(startOfDay, dispatchSettings.afternoon_at);
  const nowIso = new Date().toISOString();

  const rows = result.proposals.map((p) => ({
    tenant_id: tenantId,
    variant_id: p.variant_id,
    staff_account_id: p.staff_id,
    scheduled_at: (p.time_window === 'morning' ? morningAt : afternoonAt).toISOString(),
    status: 'dispatched' as const,
    dispatched_at: nowIso,
  }));

  const { error: insErr } = await service
    .from('publish_tasks')
    .insert(rows);
  if (insErr) throw new Error(`publish_tasks insert failed: ${insErr.message}`);

  // Audit log — actor_user_id intentionally null for cron-originated dispatch
  // (the row's mere existence identifies the source; downstream UIs read
  // `payload.triggered_by='cron'` to differentiate from human-triggered runs).
  await service
    .from('audit_logs')
    .insert({
      tenant_id: tenantId,
      actor_user_id: null,
      action: 'publish.dispatch',
      target_type: 'tenant',
      target_id: tenantId,
      payload: {
        triggered_by: 'cron',
        assigned: result.proposals.length,
        unmatched: result.unmatched.length,
        idle_staff_count: result.idle_staff.length,
        daily_cap: dispatchSettings.daily_cap_per_staff,
        pool_size: freshVariants.length,
        active_staff_count: activeCount,
      },
    })
    .then((r) => {
      if (r.error) {
        reportError(r.error, {
          scope: 'auto-dispatch-runner.audit_insert',
          tenant_id: tenantId,
        });
      }
    });

  return {
    dispatched: result.proposals.length,
    unmatched: result.unmatched.length,
    idle_staff: result.idle_staff.length,
  };
}
