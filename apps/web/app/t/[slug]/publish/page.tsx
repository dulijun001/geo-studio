import { requireRole } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/page-header';
import { InlineGuide } from '@/components/inline-guide';
import { DispatchButton } from './dispatch-button';

export const dynamic = 'force-dynamic';

type TaskRow = {
  id: string;
  status: string;
  variant_id: string;
  staff_account_id: string;
  scheduled_at: string | null;
  published_url: string | null;
  skip_reason: string | null;
  created_at: string;
};
type VariantLite = { id: string; title: string; platform: string };
type StaffLite = { id: string; real_name: string; phone: string | null };

const STATUS_LABEL: Record<string, string> = {
  pending: '待派发',
  dispatched: '已派发',
  published: '已发布',
  skipped: '已跳过',
  failed: '失败',
};

const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-800',
  dispatched: 'bg-sky-100 text-sky-800',
  published: 'bg-emerald-100 text-emerald-800',
  skipped: 'bg-amber-100 text-amber-800',
  failed: 'bg-rose-100 text-rose-800',
};

export default async function PublishPage({ params }: { params: { slug: string } }) {
  const tenant = await requireRole(params.slug, ['owner', 'admin', 'operator']);
  const supabase = createSupabaseServerClient();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data: tasksRaw } = await supabase
    .from('publish_tasks')
    .select(
      'id, status, variant_id, staff_account_id, scheduled_at, published_url, skip_reason, created_at',
    )
    .eq('tenant_id', tenant.id)
    .gte('created_at', startOfDay.toISOString())
    .is('deleted_at', null)
    .order('scheduled_at', { ascending: true })
    .limit(200);

  const tasks = (tasksRaw ?? []) as TaskRow[];

  // Two-step: no PG FKs exist, so PostgREST embeds return nothing.
  const variantIds = Array.from(new Set(tasks.map((t) => t.variant_id)));
  const staffIds = Array.from(new Set(tasks.map((t) => t.staff_account_id)));
  const taskIds = tasks.map((t) => t.id);
  const [{ data: vRows }, { data: sRows }, { data: hRows }] = await Promise.all([
    variantIds.length > 0
      ? supabase.from('content_variants').select('id, title, platform').in('id', variantIds)
      : Promise.resolve({ data: [] as VariantLite[] }),
    staffIds.length > 0
      ? supabase.from('staff_accounts').select('id, real_name, phone').in('id', staffIds)
      : Promise.resolve({ data: [] as StaffLite[] }),
    taskIds.length > 0
      ? supabase
          .from('hooks')
          .select('publish_task_id, hook_type, hook_value')
          .in('publish_task_id', taskIds)
          .eq('hook_type', 'activity_code')
          .is('deleted_at', null)
      : Promise.resolve({ data: [] as Array<{ publish_task_id: string; hook_value: string }> }),
  ]);
  const variantById = new Map((vRows ?? []).map((v) => [v.id as string, v as VariantLite]));
  const staffById = new Map((sRows ?? []).map((s) => [s.id as string, s as StaffLite]));
  const codeByTask = new Map(
    ((hRows ?? []) as Array<{ publish_task_id: string; hook_value: string }>).map(
      (h) => [h.publish_task_id, h.hook_value],
    ),
  );

  const OVERDUE_HOURS = 24;
  const overdueDeadline = Date.now() - OVERDUE_HOURS * 3600 * 1000;
  const isOverdue = (t: TaskRow) =>
    (t.status === 'dispatched' || t.status === 'pending') &&
    new Date(t.created_at).getTime() < overdueDeadline;

  const counts = {
    total: tasks.length,
    pending: tasks.filter((t) => t.status === 'pending' || t.status === 'dispatched').length,
    published: tasks.filter((t) => t.status === 'published').length,
    skipped: tasks.filter((t) => t.status === 'skipped').length,
    overdue: tasks.filter(isOverdue).length,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="派单"
        subtitle="今日员工矩阵的发布计划 · 派单算法自动匹配平台 / 人设 / 节奏"
        actions={<DispatchButton tenantSlug={tenant.slug} />}
      />

      <InlineGuide
        storageKey={`guide:publish:${tenant.slug}`}
        title="派单做的事"
        body="把已通过合规的变体分配给员工矩阵。算法考虑:平台匹配(员工的账号)、人设匹配(医生 vs 咨询 vs 前台)、节奏控制(每人每天 ≤ 2 条不撞车)、新颖度(避免同一员工连发相似)。"
        steps={[
          '点右上角「派单今日」一键计算并分配',
          '每个任务自动 mint 6 位暗号(activity_code),员工卡片会显示',
          '员工在 /staff 看到任务,「复制文案」会自动加 CTA 含暗号',
        ]}
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="今日总任务" value={counts.total} />
        <Stat label="待发布" value={counts.pending} accent="slate" />
        <Stat label="已发布" value={counts.published} accent="emerald" />
        <Stat label="已跳过" value={counts.skipped} accent="amber" />
        <Stat
          label="逾期未发"
          value={counts.overdue}
          accent={counts.overdue > 0 ? 'rose' : 'slate'}
        />
      </section>

      {tasks.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-10 text-center text-sm text-muted-foreground">
          今日还没有派单。点击右上角「派单今日」把已通过合规的变体分派给员工矩阵。
          <br />
          前提:至少有 1 条 compliance_status = auto_approved/manual_approved 的变体,并且已录入员工账号。
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">变体</th>
                <th className="px-4 py-2 font-medium">平台</th>
                <th className="px-4 py-2 font-medium">派给</th>
                <th className="px-4 py-2 font-medium">档位</th>
                <th className="px-4 py-2 font-medium">暗号</th>
                <th className="px-4 py-2 font-medium">状态</th>
                <th className="px-4 py-2 font-medium">链接 / 原因</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tasks.map((t) => {
                const v = variantById.get(t.variant_id);
                const s = staffById.get(t.staff_account_id);
                const overdue = isOverdue(t);
                return (
                <tr key={t.id} className={overdue ? 'bg-rose-50/40 hover:bg-rose-50' : 'hover:bg-muted/30'}>
                  <td className="max-w-[260px] truncate px-4 py-2.5 font-medium">
                    {v?.title ?? '(变体已删除)'}
                  </td>
                  <td className="px-4 py-2.5 text-xs uppercase tracking-wider text-muted-foreground">
                    {v?.platform.replace(/_/g, ' ')}
                  </td>
                  <td className="px-4 py-2.5">
                    {s?.real_name ?? '?'}
                    {s?.phone ? (
                      <span className="ml-1 text-xs text-muted-foreground">
                        {maskPhone(s.phone)}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {formatWindow(t.scheduled_at)}
                  </td>
                  <td className="px-4 py-2.5">
                    {codeByTask.get(t.id) ? (
                      <code className="rounded bg-amber-50 px-1.5 py-0.5 font-mono text-xs text-amber-900">
                        {codeByTask.get(t.id)}
                      </code>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[t.status] ?? 'bg-muted'}`}
                    >
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                    {overdue ? (
                      <span
                        title={`派发于 ${new Date(t.created_at).toLocaleString('zh-CN')},超过 ${OVERDUE_HOURS} 小时未回填发布链接`}
                        className="ml-1.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-800"
                      >
                        逾期
                      </span>
                    ) : null}
                  </td>
                  <td className="max-w-[260px] px-4 py-2.5 text-xs text-muted-foreground">
                    {t.published_url ? (
                      <a
                        href={t.published_url}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate underline"
                      >
                        {t.published_url}
                      </a>
                    ) : t.skip_reason ? (
                      <span>跳过:{t.skip_reason}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent = 'default',
}: {
  label: string;
  value: number;
  accent?: 'default' | 'slate' | 'emerald' | 'amber' | 'rose';
}) {
  const bg: Record<string, string> = {
    default: 'bg-background',
    slate: 'bg-slate-50',
    emerald: 'bg-emerald-50',
    amber: 'bg-amber-50',
    rose: 'bg-rose-50',
  };
  return (
    <div className={`rounded-md border border-border ${bg[accent]} p-3`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function formatWindow(ts: string | null): string {
  if (!ts) return '—';
  const h = new Date(ts).getHours();
  if (h < 12) return '上午档';
  if (h < 17) return '下午档';
  return '晚间';
}

function maskPhone(phone: string): string {
  if (phone.length < 11) return phone;
  return `${phone.slice(0, 3)}****${phone.slice(7)}`;
}
