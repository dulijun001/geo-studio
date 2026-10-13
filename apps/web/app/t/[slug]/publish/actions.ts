'use server';

import { revalidatePath } from 'next/cache';
import { dispatchDaily, type DispatchInput } from '@geo/geo-core';
import { requireRole } from '@/lib/tenant';
import { getCurrentUser } from '@/lib/current-user';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import {
  notifyNewDispatchedTasksFromWeb,
  notifyPublishProgressDigestFromWeb,
} from '@/lib/wecom-notifier';

/**
 * DSP-1 — dispatch tunables, all read from tenants.settings.dispatch.
 * Defaults preserved from the original hardcoded values so untouched tenants
 * behave identically. Operators can override via raw settings JSON for now;
 * a settings UI is deferred tech-debt.
 */
type DispatchSettings = {
  /** Max tasks per staff per day. Default 2. */
  daily_cap_per_staff: number;
  /** Hours after dispatch that cancellation is still allowed. Default 2. */
  cancel_grace_hours: number;
  /** First-half time window. "HH:MM". Default 10:00 (or business_hours-derived). */
  morning_at: string;
  /** Second-half time window. "HH:MM". Default 15:00 (or business_hours-derived). */
  afternoon_at: string;
};

const DISPATCH_DEFAULTS: DispatchSettings = {
  daily_cap_per_staff: 2,
  cancel_grace_hours: 2,
  morning_at: '10:00',
  afternoon_at: '15:00',
};

function resolveDispatchSettings(
  tenantSettings: Record<string, unknown> | null | undefined,
  businessHours: Record<string, unknown> | null | undefined,
): DispatchSettings {
  const raw = (tenantSettings?.dispatch ?? {}) as Record<string, unknown>;

  // Derive sensible defaults from brand opening hours when explicit settings
  // are absent. Pick a representative weekday (mon, fall back to any day with
  // a HH:MM-HH:MM range). morning = 1h after opening; afternoon = 1h before
  // closing — gives staff a buffer, avoids the "矩阵秒发同时段" anti-pattern.
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
  const grace = Number(raw.cancel_grace_hours);

  return {
    daily_cap_per_staff:
      Number.isFinite(dailyCap) && dailyCap > 0 && dailyCap <= 50
        ? Math.floor(dailyCap)
        : DISPATCH_DEFAULTS.daily_cap_per_staff,
    cancel_grace_hours:
      Number.isFinite(grace) && grace > 0 && grace <= 168
        ? grace
        : DISPATCH_DEFAULTS.cancel_grace_hours,
    morning_at: typeof raw.morning_at === 'string' && /^\d{1,2}:\d{2}$/.test(raw.morning_at)
      ? raw.morning_at
      : morningDefault,
    afternoon_at: typeof raw.afternoon_at === 'string' && /^\d{1,2}:\d{2}$/.test(raw.afternoon_at)
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

/** 6-char activity code, base32 minus easily-confused chars (0/O, 1/I/L). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generateActivityCodeRaw(): string {
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * DEBT-2 — generate an activity_code that doesn't collide with any
 * still-valid hook for the same tenant. 31^6 ≈ 8.8e8 combinations so the
 * birthday-style collision rate is microscopic — but in medical attribution
 * a duplicated code makes "to-which-staff did this conversion belong"
 * unanswerable, so we pay the (cheap) check.
 *
 * Service client because the caller (dispatchToday) already holds one.
 */
async function generateActivityCode(
  service: ReturnType<typeof getSupabaseServiceClient>,
  tenantId: string,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateActivityCodeRaw();
    const { data } = await service
      .from('hooks')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('hook_type', 'activity_code')
      .eq('hook_value', code)
      .gt('valid_until', new Date().toISOString())
      .is('deleted_at', null)
      .limit(1);
    if (!data || data.length === 0) return code;
  }
  // 5 collisions in a row on 8.8e8 space is statistically impossible;
  // means the alphabet is exhausted (a tenant minted >50% of all codes).
  throw new Error('activity_code 命名空间冲突,请联系管理员检查 hooks 表');
}

/**
 * Withdraw a misdispatched task. Allowed only on dispatched tasks within
 * a short grace window — once staff has actually published, undispatching
 * silently leaves their post hanging without a tracking trail.
 *
 * Effect: soft-delete the publish_task + soft-delete its hooks, so the
 * variant returns to the "fresh" pool and the next 派单 will pick it up
 * again (possibly to a different staff). Audit logged.
 */
export async function cancelDispatch(
  tenantSlug: string,
  taskId: string,
): Promise<void> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  const supabase = createSupabaseServerClient();
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthenticated');

  const service = getSupabaseServiceClient();
  // DSP-1 — dispatch settings + brand business hours feed the cancel
  // grace window so different industries / clinics can tune their own
  // tolerance without a code change.
  const { data: tenantRow } = await service
    .from('tenants')
    .select('settings')
    .eq('id', tenant.id)
    .maybeSingle();
  const { data: brandRow } = await service
    .from('brands')
    .select('business_hours')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  const dispatchSettings = resolveDispatchSettings(
    tenantRow?.settings as Record<string, unknown> | null,
    brandRow?.business_hours as Record<string, unknown> | null,
  );

  const { data: task, error: tErr } = await service
    .from('publish_tasks')
    .select('id, tenant_id, status, created_at')
    .eq('id', taskId)
    .single();
  if (tErr || !task) throw new Error('任务不存在');
  if (task.tenant_id !== tenant.id) throw new Error('Tenant mismatch');
  if (task.status !== 'dispatched' && task.status !== 'pending') {
    throw new Error(`任务状态是 ${task.status},不是 dispatched/pending,不能撤回`);
  }
  const ageHours = (Date.now() - new Date(task.created_at).getTime()) / 3600 / 1000;
  if (ageHours > dispatchSettings.cancel_grace_hours) {
    throw new Error(
      `任务派发已超 ${dispatchSettings.cancel_grace_hours} 小时,员工可能已经发布,不能撤回。请改用「跳过」或直接联系员工。`,
    );
  }

  const nowIso = new Date().toISOString();
  await service
    .from('publish_tasks')
    .update({ deleted_at: nowIso, status: 'failed', skip_reason: '管理员撤回' })
    .eq('id', taskId);
  await service.from('hooks').update({ deleted_at: nowIso }).eq('publish_task_id', taskId);

  await service.from('audit_logs').insert({
    tenant_id: tenant.id,
    actor_user_id: user.id,
    action: 'publish.dispatch_cancelled',
    target_type: 'publish_task',
    target_id: taskId,
    payload: { age_hours: Math.round(ageHours * 10) / 10 },
  });

  revalidatePath(`/t/${tenantSlug}/publish`);
}

/**
 * Trigger the dispatcher for the current tenant.
 *
 * Queries run in parallel where possible; each Supabase round-trip to the
 * remote project is ~150-300ms, so serialising them adds up fast.
 * We do NOT use PostgREST embeds here — the schema has no FKs declared at
 * the DB level (only Drizzle relations), so PostgREST cannot join. Two-step.
 */
export type DispatchProposal = {
  variant_id: string;
  variant_title: string;
  variant_platform: string;
  staff_id: string;
  staff_name: string;
  staff_phone: string | null;
  time_window: 'morning' | 'afternoon';
};

export type DispatchUnmatched = {
  variant_id: string;
  variant_title: string;
  variant_platform: string;
  reason: string;
};

/**
 * Roster snapshot returned alongside the algorithm proposals so the preview UI
 * can render a per-row staff <select> for manual swap. Filter on the client by
 * matching `platforms.includes(variant_platform)`.
 */
export type EligibleStaff = {
  id: string;
  name: string;
  /** Platforms this staff has accounts on (derived from the platforms JSONB keys). */
  platforms: string[];
};

/**
 * Admin override for a single proposal. When supplied to dispatchToday on the
 * commit pass, the algorithm output is replaced row-by-row with these picks.
 * Server still re-verifies platform fit + variant ownership before insert.
 */
export type DispatchOverride = {
  variant_id: string;
  staff_id: string;
  time_window?: 'morning' | 'afternoon';
};

export type DispatchResult = {
  /** Detailed proposals for UI preview / display. */
  proposals: DispatchProposal[];
  /** Aggregate count for the legacy summary row. */
  unmatched: number;
  /** DSP-2 — per-variant unmatched detail so admin can see WHY each
   *  variant didn't get assigned (e.g. "no staff supports platform X"). */
  unmatched_details: DispatchUnmatched[];
  /** Staff that got nothing today (low fresh variant count or no platform fit). */
  idle_staff: number;
  /** All active operator staff for client-side manual swap dropdowns. */
  eligible_staff: EligibleStaff[];
  /** Whether the rows were actually inserted. */
  committed: boolean;
};

export async function dispatchToday(
  tenantSlug: string,
  confirm = false,
  overrides?: DispatchOverride[],
): Promise<DispatchResult> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);

  // requireRole already verified the user is authenticated; reuse the id via a
  // cheap call on the already-warm server client.
  const supabase = createSupabaseServerClient();
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthenticated');

  const service = getSupabaseServiceClient();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  // Parallel fetch: variants + all publish_tasks + active staff + tenant
  // settings + brand business_hours (for DSP-1 dispatch tunables).
  const [variantsRes, tasksRes, staffRes, tenantRes, brandRes] = await Promise.all([
    service
      .from('content_variants')
      .select('id, title, platform, content_item_id, updated_at, dod_status')
      .eq('tenant_id', tenant.id)
      .in('compliance_status', ['auto_approved', 'manual_approved'])
      // D21 / ADR 009 P2-4 DoD gate: skip dod_failed variants. unknown /
      // legacy_passed / passed / manual_pass all flow through; only explicit
      // 'failed' is blocked. Tighten to ('passed','manual_pass') if strict
      // enforcement becomes the policy.
      .neq('dod_status', 'failed')
      .not('status', 'in', '(archived,rejected)')
      .is('deleted_at', null),
    service
      .from('publish_tasks')
      .select('variant_id, staff_account_id, created_at')
      .eq('tenant_id', tenant.id)
      .is('deleted_at', null),
    service
      .from('staff_accounts')
      .select('id, persona, platforms, real_name, settings')
      .eq('tenant_id', tenant.id)
      .eq('status', 'active')
      .eq('kind', 'operator')  // 0023: doctors don't receive dispatch tasks
      .is('deleted_at', null),
    service.from('tenants').select('settings').eq('id', tenant.id).maybeSingle(),
    service
      .from('brands')
      .select('business_hours')
      .eq('tenant_id', tenant.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const dispatchSettings = resolveDispatchSettings(
    tenantRes.data?.settings as Record<string, unknown> | null,
    brandRes.data?.business_hours as Record<string, unknown> | null,
  );

  if (variantsRes.error) throw new Error(`加载变体失败: ${variantsRes.error.message}`);
  if (tasksRes.error) throw new Error(`加载任务失败: ${tasksRes.error.message}`);
  if (staffRes.error) throw new Error(`加载员工失败: ${staffRes.error.message}`);

  const variants = variantsRes.data ?? [];
  const allTasks = tasksRes.data ?? [];
  const staffRows = staffRes.data ?? [];

  if (staffRows.length === 0) {
    throw new Error('当前品牌还没有启用的员工账号,请先到设置 → 员工管理添加。');
  }

  // Anti-collision: variants already on ANY publish_task (past or present).
  const takenIds = new Set(allTasks.map((r) => r.variant_id as string));
  const freshVariants = variants.filter((v) => !takenIds.has(v.id as string));
  if (freshVariants.length === 0) {
    return {
      proposals: [],
      unmatched: 0,
      unmatched_details: [],
      idle_staff: 0,
      eligible_staff: [],
      committed: false,
    };
  }

  // Today's tasks: count per staff for daily-cap enforcement.
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

  // Fetch topics only for the fresh variants we actually care about.
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

  const staff = staffRows.map((s) => {
    const persona = (s.persona ?? {}) as Record<string, unknown>;
    const personaTags = Array.isArray(persona.tags) ? (persona.tags as string[]) : [];
    const platformsObj = (s.platforms ?? {}) as Record<string, unknown>;
    // V1.11: settings.publishing.{is_active, daily_quota}. Missing = inactive
    // (explicit opt-in via admin UI / SQL backfill before V1.11 rollout).
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

  // Build the detailed, UI-ready proposal list (joins variant title + staff name in).
  const variantById = new Map(freshVariants.map((v) => [v.id as string, v]));
  const staffMap = new Map(
    staffRows.map((s) => {
      const r = s as { id: string; real_name?: string; phone?: string | null };
      return [r.id, { name: r.real_name ?? '医生', phone: r.phone ?? null }];
    }),
  );

  // Staff roster for client-side manual swap. platforms[] = JSONB keys.
  const eligibleStaff: EligibleStaff[] = staffRows.map((s) => {
    const r = s as { id: string; real_name?: string; platforms?: Record<string, unknown> | null };
    return {
      id: r.id,
      name: r.real_name ?? '医生',
      platforms: Object.keys(r.platforms ?? {}),
    };
  });

  // Manual override: replace algorithm proposals with admin's edits BEFORE any
  // downstream computation, so detailedProposals/rows/hooks all reflect the swap.
  // Re-verify: variant in today's pool, staff active in this tenant, platform fits.
  // Silently drops invalid rows (caller already saw the preview UI).
  const isManualOverride = !!(confirm && overrides && overrides.length > 0);
  if (isManualOverride && overrides) {
    const staffPlatforms = new Map(
      staffRows.map((s) => {
        const r = s as { id: string; platforms?: Record<string, unknown> | null };
        return [r.id, new Set(Object.keys(r.platforms ?? {}))];
      }),
    );
    const seen = new Set<string>();
    const valid = overrides.filter((o) => {
      if (seen.has(o.variant_id)) return false;
      const v = variantById.get(o.variant_id) as { platform?: string } | undefined;
      if (!v?.platform) return false;
      const platforms = staffPlatforms.get(o.staff_id);
      if (!platforms || !platforms.has(v.platform)) return false;
      seen.add(o.variant_id);
      return true;
    });
    result.proposals = valid.map((o) => ({
      variant_id: o.variant_id,
      staff_id: o.staff_id,
      match_score: 0,
      time_window: o.time_window ?? 'morning',
    }));
  }

  const detailedProposals: DispatchProposal[] = result.proposals.map((p) => {
    const v = variantById.get(p.variant_id);
    const s = staffMap.get(p.staff_id);
    return {
      variant_id: p.variant_id,
      // DEBT-2 — title is selected on the SELECT now; the legacy '(未知)'
      // fallback hid the missing-field bug we fixed earlier. Keep a tight
      // fallback only for the truly impossible case (variant deleted between
      // dispatcher run and detail mapping).
      variant_title: (v as { title?: string })?.title ?? '',
      variant_platform: (v as { platform?: string })?.platform ?? 'unknown',
      staff_id: p.staff_id,
      staff_name: s?.name ?? '医生',
      staff_phone: s?.phone ?? null,
      time_window: p.time_window,
    };
  });

  // DSP-2 — hydrate unmatched IDs into UI-displayable rows. The dispatcher
  // already attached a per-row reason (no platform-capable staff / cap full /
  // unknown); we just join the title+platform for display.
  const unmatchedDetails: DispatchUnmatched[] = result.unmatched.map((u) => {
    const v = variantById.get(u.variant_id);
    return {
      variant_id: u.variant_id,
      variant_title: (v as { title?: string })?.title ?? '(无标题)',
      variant_platform: (v as { platform?: string })?.platform ?? 'unknown',
      reason: u.reason,
    };
  });

  // Dry-run path — return proposals without inserting.
  if (!confirm) {
    return {
      proposals: detailedProposals,
      unmatched: result.unmatched.length,
      unmatched_details: unmatchedDetails,
      idle_staff: result.idle_staff.length,
      eligible_staff: eligibleStaff,
      committed: false,
    };
  }

  const morningAt = applyHHMM(startOfDay, dispatchSettings.morning_at);
  const afternoonAt = applyHHMM(startOfDay, dispatchSettings.afternoon_at);

  const nowIso = new Date().toISOString();
  const rows = result.proposals.map((p) => ({
    tenant_id: tenant.id,
    variant_id: p.variant_id,
    staff_account_id: p.staff_id,
    scheduled_at: (p.time_window === 'morning' ? morningAt : afternoonAt).toISOString(),
    status: 'dispatched' as const,
    dispatched_at: nowIso,
  }));

  // Insert + audit in parallel — independent writes.
  if (rows.length > 0) {
    const [insRes] = await Promise.all([
      service.from('publish_tasks').insert(rows).select('id, staff_account_id'),
      service.from('audit_logs').insert({
        tenant_id: tenant.id,
        actor_user_id: user.id,
        action: 'publish.dispatch',
        target_type: 'tenant',
        target_id: tenant.id,
        payload: {
          assigned: result.proposals.length,
          unmatched: result.unmatched,
          idle_staff_count: result.idle_staff.length,
          daily_cap: dispatchSettings.daily_cap_per_staff,
          pool_size: freshVariants.length,
          active_staff_count: staff.length,
          manual_override: isManualOverride,
        },
      }),
    ]);
    if (insRes.error) throw new Error(`派单写入失败: ${insRes.error.message}`);

    // 有新派单时，实时推送到企业微信群
    const inserted = (insRes.data ?? []) as Array<{ id: string }>;
    if (inserted.length > 0) {
      const taskIds = inserted.map((t) => t.id);
      notifyNewDispatchedTasksFromWeb(tenant.id, taskIds).catch((err) => {
        console.error('[publish/actions] notifyNewDispatchedTasksFromWeb error:', err);
      });
    }

    // W7 hooks: per-task doctor_name + activity_code.
    // Both close in 30 days — rough match for the typical conversion window
    // for high-ticket dental services. Configurable later via tenant settings.
    // FEATURE_HOOKS_DISABLED 2026-05-12 — 暗号/医生名 hooks 暂时停止 mint
    // (产品决策:不在头条/知乎类公域用暗号引流,合规风险 + 平台规则禁止)。
    // 旧 hooks 数据保留不动。要恢复:把下面整段从注释里释放出来,并删此注释块。
    /*
    type InsertedTask = { id: string; staff_account_id: string };
    const inserted = (insRes.data ?? []) as InsertedTask[];
    if (inserted.length > 0) {
      const staffNameById = new Map(
        staffRows.map((s) => {
          const r = s as { id: string; real_name?: string };
          return [r.id, r.real_name ?? '医生'];
        }),
      );
      const validUntil = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
      const hookRows = (
        await Promise.all(
          inserted.map(async (t) => {
            const code = await generateActivityCode(service, tenant.id);
            return [
              {
                tenant_id: tenant.id,
                publish_task_id: t.id,
                hook_type: 'doctor_name' as const,
                hook_value: staffNameById.get(t.staff_account_id) ?? '医生',
                valid_until: validUntil,
              },
              {
                tenant_id: tenant.id,
                publish_task_id: t.id,
                hook_type: 'activity_code' as const,
                hook_value: code,
                valid_until: validUntil,
              },
            ];
          }),
        )
      ).flat();
      const { error: hErr } = await service.from('hooks').insert(hookRows);
      if (hErr) console.error(`[dispatch] hooks insert: ${hErr.message}`);
    }
    */
  }

  revalidatePath(`/t/${tenantSlug}/publish`);
  return {
    proposals: detailedProposals,
    unmatched: result.unmatched.length,
    unmatched_details: unmatchedDetails,
    idle_staff: result.idle_staff.length,
    eligible_staff: eligibleStaff,
    committed: true,
  };
}

/**
 * 手动一键推送派单与打卡进度到企业微信群
 */
export async function pushWeComProgressDigestAction(tenantSlug: string) {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);
  return await notifyPublishProgressDigestFromWeb(tenant.id);
}
