import { requireStaff } from '@/lib/staff';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { TaskCard } from './task-card';

export const dynamic = 'force-dynamic';

type TaskRow = {
  id: string;
  status: string;
  variant_id: string;
  scheduled_at: string | null;
  dispatched_at: string | null;
  created_at: string;
  published_url: string | null;
  skip_reason: string | null;
  feedback: string | null;
};
type VariantLite = {
  id: string;
  platform: string;
  title: string;
  body: string;
  extra_assets: { time_window?: string } | null;
};
type HookLite = {
  publish_task_id: string;
  hook_type: string;
  hook_value: string;
};

export default async function StaffHomePage() {
  const ctx = await requireStaff();
  const client = getSupabaseServiceClient();

  // "Today" = local calendar day. Since we can't know the viewer's timezone reliably
  // on the server, we window on [now - 12h, now + 12h] and bucket by status.
  //
  // 2026-06-15 bug fix: 之前只有上界 lte(horizon) + ORDER scheduled_at ASC + LIMIT 20。
  // 老员工历史 published 任务一多,ASC 排序让最老的 20 条占满结果集,**当天新派的
  // 任务排在 20 名开外被 LIMIT 截断 → 员工端永远显示 0 条新任务**(林光曦 "已完成 18
  // 条 / 今天 0 条" 就是这么来的)。修复:加下界 gte(floor),只取今天窗口的任务。
  const horizon = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  const floor = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

  const { data: rawTasks, error } = await client
    .from('publish_tasks')
    .select(
      'id, status, variant_id, scheduled_at, dispatched_at, created_at, published_url, skip_reason, feedback',
    )
    .eq('staff_account_id', ctx.staff_id)
    .eq('tenant_id', ctx.tenant_id)
    .in('status', ['pending', 'dispatched', 'published', 'skipped'])
    .gte('scheduled_at', floor)
    .lte('scheduled_at', horizon)
    .is('deleted_at', null)
    .order('scheduled_at', { ascending: true })
    .limit(20);

  if (error) {
    return (
      <div className="rounded-md border border-rose-500/30 bg-rose-500/[0.10] p-4 text-sm text-rose-300">
        载入任务失败:{error.message}
      </div>
    );
  }

  const tasks = (rawTasks ?? []) as TaskRow[];
  const variantIds = Array.from(new Set(tasks.map((t) => t.variant_id)));
  const taskIds = tasks.map((t) => t.id);

  // Variants + per-task hooks in parallel. Hooks lookup is needed so the staff
  // sees the activity_code they should embed in their post (W7).
  const [vRes, hRes] = await Promise.all([
    variantIds.length
      ? client
          .from('content_variants')
          .select('id, platform, title, body, extra_assets')
          .in('id', variantIds)
      : Promise.resolve({ data: [] as VariantLite[] }),
    taskIds.length
      ? client
          .from('hooks')
          .select('publish_task_id, hook_type, hook_value')
          .in('publish_task_id', taskIds)
          .is('deleted_at', null)
      : Promise.resolve({ data: [] as HookLite[] }),
  ]);
  const variantById = new Map(
    (vRes.data ?? []).map((v) => [v.id as string, v as VariantLite]),
  );
  const hooksByTask = new Map<string, HookLite[]>();
  for (const h of (hRes.data ?? []) as HookLite[]) {
    const list = hooksByTask.get(h.publish_task_id) ?? [];
    list.push(h);
    hooksByTask.set(h.publish_task_id, list);
  }

  const pending = tasks.filter((t) => t.status === 'pending' || t.status === 'dispatched');
  const done = tasks.filter((t) => t.status === 'published');
  const skipped = tasks.filter((t) => t.status === 'skipped');

  return (
    <div className="space-y-6">
      <section className="space-y-1">
        <h1 className="text-xl font-semibold">今日任务</h1>
        <p className="text-sm text-muted-foreground">
          Hi {ctx.staff_name},今天要发 {pending.length} 条。
          {done.length > 0 ? ` 已完成 ${done.length} 条。` : ''}
        </p>
      </section>

      {pending.length === 0 && done.length === 0 && skipped.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-background p-6 text-center text-sm text-muted-foreground">
          今日还没有派单。管理员会在上午 9 点前下发当日任务。
        </div>
      ) : null}

      {pending.length > 0 ? (
        <div className="space-y-3">
          {pending.map((t) => (
            <TaskCard
              key={t.id}
              task={taskToProps(t, variantById.get(t.variant_id), hooksByTask.get(t.id))}
            />
          ))}
        </div>
      ) : null}

      {done.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">已完成</h2>
          <div className="space-y-3">
            {done.map((t) => (
              <TaskCard
              key={t.id}
              task={taskToProps(t, variantById.get(t.variant_id), hooksByTask.get(t.id))}
            />
            ))}
          </div>
        </section>
      ) : null}

      {skipped.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">已跳过</h2>
          <div className="space-y-3">
            {skipped.map((t) => (
              <TaskCard
              key={t.id}
              task={taskToProps(t, variantById.get(t.variant_id), hooksByTask.get(t.id))}
            />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function taskToProps(
  t: TaskRow,
  v: VariantLite | undefined,
  hooks: HookLite[] | undefined,
) {
  const hookList = hooks ?? [];
  return {
    id: t.id,
    platform: v?.platform ?? 'unknown',
    title: v?.title ?? '(变体已删除)',
    body: v?.body ?? '',
    status: t.status,
    scheduled_at: t.scheduled_at,
    dispatched_at: t.dispatched_at ?? t.created_at,
    published_url: t.published_url,
    time_window: v?.extra_assets?.time_window ?? null,
    activity_code:
      hookList.find((h) => h.hook_type === 'activity_code')?.hook_value ?? null,
    doctor_name:
      hookList.find((h) => h.hook_type === 'doctor_name')?.hook_value ?? null,
  };
}
