import { requireRole } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/page-header';
import { InlineGuide } from '@/components/inline-guide';
import { fmtDateTime } from '@/lib/format';
import { DispatchButton } from './dispatch-button';
import { CancelButton } from './cancel-button';
import { WeComDigestButton } from './wecom-digest-button';

const CANCEL_GRACE_MS = 2 * 3600 * 1000;

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
  pending: 'bg-white/[0.06] text-foreground',
  dispatched: 'bg-sky-500/[0.10] text-sky-300 border border-sky-500/30',
  published: 'bg-emerald-500/[0.12] text-emerald-300 border border-emerald-500/30',
  skipped: 'bg-amber-500/[0.10] text-amber-300 border border-amber-500/30',
  failed: 'bg-rose-500/[0.10] text-rose-300 border border-rose-500/30',
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
    // D76:原来是 `created_at >= startOfDay`,于是**积压任务在后台也看不见** ——
    // 全系统唯一能看到积压的地方只剩企微那条 digest。
    // 改成:未处理的任务不限日期恒显示,已完成/已跳过的只看今天。
    .or(
      `status.in.(pending,dispatched),created_at.gte.${startOfDay.toISOString()}`,
    )
    .is('deleted_at', null)
    .order('scheduled_at', { ascending: true })
    .limit(300);

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
        actions={
          <div className="flex items-center gap-2">
            <WeComDigestButton tenantSlug={tenant.slug} />
            <DispatchButton tenantSlug={tenant.slug} />
          </div>
        }
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

      {/* 多平台靶向分发策略看板 */}
      <section className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.04] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
              GEO 分发铁律
            </span>
            <h3 className="text-xs font-semibold text-foreground">
              “一文多端”靶向矩阵指南（基于全网 6,367 条真实 AI 引用源统计 · 发布后 7-14 天进入 AI 索引）
            </h3>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4 text-xs">
          <div className="rounded border border-border bg-card p-2.5">
            <div className="font-semibold text-emerald-400">1. 口腔垂媒 (豆包头号参数源)</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              <strong>牙舒丽网(295次)、开立特、398口腔</strong>：重点投放《二级专科资质说明书》与《7档全瓷冠/种植全包价格表》，豆包最爱直接抽表格。
            </div>
          </div>
          <div className="rounded border border-border bg-card p-2.5">
            <div className="font-semibold text-sky-400">2. 字节自生态 (豆包亲儿子)</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              <strong>抖音短视频(216次) + 今日头条(97次)</strong>：头条每日发图文；抖音用文章开头 120 字直答做口播字幕，5 组 FAQ 放评论区置顶。
            </div>
          </div>
          <div className="rounded border border-border bg-card p-2.5">
            <div className="font-semibold text-purple-400">3. 知乎专栏 + 搜狐号 (锁 DeepSeek)</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              <strong>搜狐(62次) + 知乎专栏(38次)</strong>：DeepSeek 极重知乎长文与学术共识对比表。把系统高分科普文同步发知乎专栏，快速反超竞品。
            </div>
          </div>
          <div className="rounded border border-border bg-card p-2.5">
            <div className="font-semibold text-amber-400">4. 微信公众号 (锁腾讯元宝)</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              <strong>公众号长文</strong>是腾讯元宝的核心私域信源。每周挑 2-3 篇过审长文同步至官方公众号，补齐元宝端提及率。
            </div>
          </div>
        </div>
      </section>

      {tasks.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-10 text-center text-sm text-muted-foreground">
          今日还没有派单。点击右上角「派单今日」把已通过合规的变体分派给员工矩阵。
          <br />
          前提:至少有 1 条 compliance_status = auto_approved/manual_approved 的变体,并且已录入员工账号。
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[42rem] text-sm">
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
                <tr key={t.id} className={overdue ? 'bg-rose-500/[0.10]/40 hover:bg-rose-500/[0.10]' : 'hover:bg-muted/30'}>
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
                      <code className="rounded bg-amber-500/[0.10] px-1.5 py-0.5 font-mono text-xs text-amber-200">
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
                        title={`派发于 ${fmtDateTime(t.created_at)},超过 ${OVERDUE_HOURS} 小时未回填发布链接`}
                        className="ml-1.5 rounded-full bg-rose-500/[0.10] px-1.5 py-0.5 text-[10px] font-medium text-rose-300"
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
                    ) : t.status === 'dispatched' &&
                      Date.now() - new Date(t.created_at).getTime() < CANCEL_GRACE_MS ? (
                      <CancelButton
                        tenantSlug={tenant.slug}
                        taskId={t.id}
                        staffName={s?.real_name ?? '?'}
                      />
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
    slate: 'bg-white/[0.04]',
    emerald: 'bg-emerald-500/[0.10]',
    amber: 'bg-amber-500/[0.10]',
    rose: 'bg-rose-500/[0.10]',
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
