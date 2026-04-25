'use server';

import { revalidatePath } from 'next/cache';
import { dispatchDaily, type DispatchInput } from '@geo/geo-core';
import { requireRole } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

const DEFAULT_DAILY_CAP = 2;

/** 6-char activity code, base32 minus easily-confused chars (0/O, 1/I/L). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generateActivityCode(): string {
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

const CANCEL_GRACE_HOURS = 2;

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  const service = getSupabaseServiceClient();
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
  if (ageHours > CANCEL_GRACE_HOURS) {
    throw new Error(
      `任务派发已超 ${CANCEL_GRACE_HOURS} 小时,员工可能已经发布,不能撤回。请改用「跳过」或直接联系员工。`,
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

export type DispatchResult = {
  /** Detailed proposals for UI preview / display. */
  proposals: DispatchProposal[];
  /** Variants the algorithm couldn't place (no matching staff). */
  unmatched: number;
  /** Staff that got nothing today (low fresh variant count or no platform fit). */
  idle_staff: number;
  /** Whether the rows were actually inserted. */
  committed: boolean;
};

export async function dispatchToday(
  tenantSlug: string,
  confirm = false,
): Promise<DispatchResult> {
  const tenant = await requireRole(tenantSlug, ['owner', 'admin', 'operator']);

  // requireRole already verified the user is authenticated; reuse the id via a
  // cheap call on the already-warm server client.
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  const service = getSupabaseServiceClient();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  // Parallel fetch: variants + all publish_tasks + active staff. All
  // independent, all on the same tenant_id.
  const [variantsRes, tasksRes, staffRes] = await Promise.all([
    service
      .from('content_variants')
      .select('id, platform, content_item_id, updated_at')
      .eq('tenant_id', tenant.id)
      .in('compliance_status', ['auto_approved', 'manual_approved'])
      .not('status', 'in', '(archived,rejected)')
      .is('deleted_at', null),
    service
      .from('publish_tasks')
      .select('variant_id, staff_account_id, created_at')
      .eq('tenant_id', tenant.id)
      .is('deleted_at', null),
    service
      .from('staff_accounts')
      .select('id, persona, platforms, real_name')
      .eq('tenant_id', tenant.id)
      .eq('status', 'active')
      .is('deleted_at', null),
  ]);

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
    return { proposals: [], unmatched: 0, idle_staff: 0, committed: false };
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
    return {
      id: s.id as string,
      persona_tags: personaTags,
      platforms: Object.keys(platformsObj),
      tasks_today: staffTodayCount.get(s.id as string) ?? 0,
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
    daily_cap_per_staff: DEFAULT_DAILY_CAP,
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
  const detailedProposals: DispatchProposal[] = result.proposals.map((p) => {
    const v = variantById.get(p.variant_id);
    const s = staffMap.get(p.staff_id);
    return {
      variant_id: p.variant_id,
      variant_title: (v as { title?: string })?.title ?? '(未知)',
      variant_platform: (v as { platform?: string })?.platform ?? 'unknown',
      staff_id: p.staff_id,
      staff_name: s?.name ?? '医生',
      staff_phone: s?.phone ?? null,
      time_window: p.time_window,
    };
  });

  // Dry-run path — return proposals without inserting.
  if (!confirm) {
    return {
      proposals: detailedProposals,
      unmatched: result.unmatched.length,
      idle_staff: result.idle_staff.length,
      committed: false,
    };
  }

  const morningAt = new Date(startOfDay);
  morningAt.setHours(10, 0, 0, 0);
  const afternoonAt = new Date(startOfDay);
  afternoonAt.setHours(15, 0, 0, 0);

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
          daily_cap: DEFAULT_DAILY_CAP,
          pool_size: freshVariants.length,
          active_staff_count: staff.length,
        },
      }),
    ]);
    if (insRes.error) throw new Error(`派单写入失败: ${insRes.error.message}`);

    // W7 hooks: per-task doctor_name + activity_code.
    // Both close in 30 days — rough match for the typical conversion window
    // for high-ticket dental services. Configurable later via tenant settings.
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
      const hookRows = inserted.flatMap((t) => [
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
          hook_value: generateActivityCode(),
          valid_until: validUntil,
        },
      ]);
      const { error: hErr } = await service.from('hooks').insert(hookRows);
      if (hErr) console.error(`[dispatch] hooks insert: ${hErr.message}`);
    }
  }

  revalidatePath(`/t/${tenantSlug}/publish`);
  return {
    proposals: detailedProposals,
    unmatched: result.unmatched.length,
    idle_staff: result.idle_staff.length,
    committed: true,
  };
}
