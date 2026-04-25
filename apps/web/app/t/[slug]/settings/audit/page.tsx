import Link from 'next/link';
import { requireRole } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/page-header';
import { InlineGuide } from '@/components/inline-guide';
import { ExportButton } from './export-button';

export const dynamic = 'force-dynamic';

const ACTION_LABEL: Record<string, string> = {
  'compliance.manual_approve': '人工通过',
  'compliance.manual_reject': '人工拒绝',
  'content.variant_generated': '生成变体',
  'content.variant_generate_failed': '变体生成失败',
  'content.variant_generate_skipped': '变体生成跳过',
  'content.variant_edited': '变体被改稿',
  'publish.dispatch': '派单',
  'publish.task_published': '员工打卡',
  'publish.task_skipped': '员工跳过',
  'staff.created': '新建员工',
  'staff.invite_generated': '生成访问码',
  'vocab.created': '词典新增',
  'vocab.deleted': '词典删除',
};

const ACTION_GROUPS: Array<{ label: string; prefix: string }> = [
  { label: '全部', prefix: '' },
  { label: '合规', prefix: 'compliance.' },
  { label: '内容 / 变体', prefix: 'content.' },
  { label: '派单 / 打卡', prefix: 'publish.' },
  { label: '员工', prefix: 'staff.' },
  { label: '词典', prefix: 'vocab.' },
];

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { action?: string; from?: string; to?: string };
}) {
  const tenant = await requireRole(params.slug, ['owner', 'admin', 'auditor']);
  const supabase = createSupabaseServerClient();

  const action = (searchParams.action ?? '').trim();
  const from = (searchParams.from ?? '').trim();
  const to = (searchParams.to ?? '').trim();

  let q = supabase
    .from('audit_logs')
    .select('id, action, target_type, target_id, actor_user_id, payload, created_at')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false })
    .limit(200);
  if (action) q = q.like('action', `${action}%`);
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lte('created_at', to);
  const { data: rows } = await q;
  type Row = {
    id: string;
    action: string;
    target_type: string | null;
    target_id: string | null;
    actor_user_id: string | null;
    payload: Record<string, unknown> | null;
    created_at: string;
  };
  const logs = (rows ?? []) as Row[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="操作日志"
        subtitle={`${logs.length} 条 · 最多展示 200 条,完整数据请用 CSV 导出`}
        actions={
          <div className="flex items-center gap-2">
            <ExportButton tenantSlug={tenant.slug} action={action} from={from} to={to} />
            <Link
              href={`/t/${tenant.slug}/settings`}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              ← 返回设置
            </Link>
          </div>
        }
      />

      <InlineGuide
        storageKey={`guide:audit:${tenant.slug}`}
        title="为什么需要审计日志"
        body="医疗合规要求所有「谁在什么时间做了什么」都可追溯,保留 ≥ 3 年(医疗广告法诉讼时效)。监管来访时需在 1 小时内提供完整时间段日志 CSV。这页就是为这个场景准备的。"
      />

      <form className="card-surface flex flex-wrap items-end gap-3 p-4">
        <Field label="类别">
          <div className="flex flex-wrap gap-1">
            {ACTION_GROUPS.map((g) => {
              const active = (action || '') === g.prefix;
              return (
                <a
                  key={g.label}
                  href={`?action=${encodeURIComponent(g.prefix)}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`}
                  className={
                    'rounded-full px-3 py-1 text-xs ' +
                    (active
                      ? 'bg-foreground text-background'
                      : 'border border-border bg-background hover:bg-muted')
                  }
                >
                  {g.label}
                </a>
              );
            })}
          </div>
        </Field>
        <Field label="开始时间(>=)">
          <input
            type="datetime-local"
            name="from"
            defaultValue={from}
            className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs"
          />
        </Field>
        <Field label="结束时间(<=)">
          <input
            type="datetime-local"
            name="to"
            defaultValue={to}
            className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs"
          />
        </Field>
        <input type="hidden" name="action" value={action} />
        <button
          type="submit"
          className="rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted"
        >
          应用筛选
        </button>
      </form>

      {logs.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-10 text-center text-sm text-muted-foreground">
          没有匹配的日志。
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">时间</th>
                <th className="px-4 py-2 font-medium">动作</th>
                <th className="px-4 py-2 font-medium">目标</th>
                <th className="px-4 py-2 font-medium">操作人</th>
                <th className="px-4 py-2 font-medium">详情</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString('zh-CN')}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{ACTION_LABEL[r.action] ?? r.action}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {r.target_type ? (
                      <>
                        {r.target_type}
                        {r.target_id ? (
                          <code className="ml-1 text-[10px]">{r.target_id.slice(0, 8)}</code>
                        ) : null}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {r.actor_user_id ? (
                      <code className="text-[10px]">{r.actor_user_id.slice(0, 8)}</code>
                    ) : (
                      <span className="text-muted-foreground/70">系统</span>
                    )}
                  </td>
                  <td className="max-w-[280px] truncate px-4 py-2.5 text-[11px] text-muted-foreground">
                    {r.payload ? JSON.stringify(r.payload) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
