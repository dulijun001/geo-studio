import Link from 'next/link';
import { requireRole } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/page-header';
import { InlineGuide } from '@/components/inline-guide';
import { InviteButton } from './invite-button';
import { NewStaffForm } from './new-staff-form';

export const dynamic = 'force-dynamic';

type StaffRow = {
  id: string;
  real_name: string;
  role: string;
  phone: string | null;
  status: string;
  kind: 'doctor' | 'operator';
  persona: { tags?: string[] } | null;
  platforms: Record<string, unknown> | null;
  auth_user_id: string | null;
  password_hash: string | null;
};

const ROLE_LABEL: Record<string, string> = {
  doctor: '医生',
  consultant: '咨询',
  receptionist: '前台',
  marketing: '市场',
  nurse: '护理',
  other: '其他',
};

export default async function StaffSettingsPage({ params }: { params: { slug: string } }) {
  const tenant = await requireRole(params.slug, ['owner', 'admin', 'operator']);
  const supabase = createSupabaseServerClient();

  const { data: staffRaw } = await supabase
    .from('staff_accounts')
    .select('id, real_name, role, phone, status, kind, persona, platforms, auth_user_id, password_hash')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null)
    .order('kind', { ascending: false }) // operator(o) before doctor(d)
    .order('created_at', { ascending: true });

  const staff = (staffRaw ?? []) as unknown as StaffRow[];
  const operators = staff.filter((s) => s.kind === 'operator');
  const doctors = staff.filter((s) => s.kind === 'doctor');

  return (
    <div className="space-y-6">
      <PageHeader
        title="员工管理"
        subtitle="员工矩阵 · 人设标签 · 平台账号 · 登录访问码"
        actions={
          <div className="flex items-center gap-2">
            <NewStaffForm tenantSlug={tenant.slug} />
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
        storageKey={`guide:staff:${tenant.slug}`}
        title="两种员工类型 + 怎么登录"
        body={'员工分两类:**派单接收人(operator)**——真正登录头条 / 百家号 / 抖音等平台账号发布内容的运营 / 市场专员;**医生(doctor)**——从客户知识库的「团队/医生/XX.md」自动导入,用作内容署名 + persona 匹配,但不接派单。登录方式:管理员点「生成访问码」→ 弹 6 位数字 → 手机号 + 这 6 位告诉员工 → /staff/login 登录。访问码 15 分钟内有效。'}
      />

      {staff.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-10 text-center text-sm text-muted-foreground">
          还没有员工。点右上角「+新建员工」开始添加。
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <div className="border-b border-border bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">
            派单接收人 · {operators.length} 人 — 真正登录平台账号发布内容的运营
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">姓名</th>
                <th className="px-4 py-2 font-medium">岗位</th>
                <th className="px-4 py-2 font-medium">手机号</th>
                <th className="px-4 py-2 font-medium">人设标签</th>
                <th className="px-4 py-2 font-medium">平台</th>
                <th className="px-4 py-2 font-medium">状态</th>
                <th className="px-4 py-2 font-medium">登录</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {operators.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-xs text-muted-foreground">
                    还没有派单接收人。点右上角「+新建员工」添加运营 / 市场专员。
                  </td>
                </tr>
              ) : null}
              {operators.map((s) => {
                const tags = s.persona?.tags ?? [];
                const platforms = Object.keys(s.platforms ?? {});
                return (
                  <tr key={s.id} className="align-top hover:bg-muted/30">
                    <td className="px-4 py-2.5 font-medium">{s.real_name}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {ROLE_LABEL[s.role] ?? s.role}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {s.phone ?? <span className="text-muted-foreground">未录</span>}
                    </td>
                    <td className="max-w-[220px] px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {tags.length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          tags.map((t) => (
                            <span
                              key={t}
                              className="rounded-full bg-muted px-2 py-0.5 text-[11px]"
                            >
                              {t}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="max-w-[200px] px-4 py-2.5 text-xs text-muted-foreground">
                      {platforms.length === 0 ? '—' : platforms.join(', ')}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-4 py-2.5">
                      <InviteButton
                        tenantSlug={tenant.slug}
                        staffAccountId={s.id}
                        hasPassword={!!s.password_hash}
                        disabled={!s.phone || s.status !== 'active'}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {doctors.length > 0 && (
        <details className="overflow-hidden rounded-md border border-border">
          <summary className="cursor-pointer border-b border-border bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">
            医生 · {doctors.length} 人 — 内容署名 + persona 匹配,不接派单(从知识库自动同步)
          </summary>
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">姓名</th>
                <th className="px-4 py-2 font-medium">岗位</th>
                <th className="px-4 py-2 font-medium">人设标签</th>
                <th className="px-4 py-2 font-medium">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {doctors.map((s) => {
                const tags = s.persona?.tags ?? [];
                return (
                  <tr key={s.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-medium">{s.real_name}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {ROLE_LABEL[s.role] ?? s.role}
                    </td>
                    <td className="max-w-[260px] px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {tags.length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          tags.map((t) => (
                            <span
                              key={t}
                              className="rounded-full bg-muted px-2 py-0.5 text-[11px]"
                            >
                              {t}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={s.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </details>
      )}

      <section className="rounded-md border border-dashed border-border bg-muted/20 p-4 text-xs text-muted-foreground">
        <p className="mb-2 font-medium text-foreground">登录流程</p>
        <ol className="list-inside list-decimal space-y-1">
          <li>点「生成访问码」→ 页面会显示 6 位数字(仅显示一次)。</li>
          <li>把手机号 + 访问码通过企微/电话告诉员工。</li>
          <li>员工打开 <code>/staff/login</code>,输入手机号和访问码即可进入任务页。</li>
          <li>访问码 15 分钟内有效;新生成一次,旧的立刻作废。</li>
        </ol>
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    active: { label: '在岗', className: 'bg-emerald-100 text-emerald-800' },
    paused: { label: '暂停', className: 'bg-amber-100 text-amber-800' },
    offboarding: { label: '离职中', className: 'bg-rose-100 text-rose-800' },
  };
  const c = config[status] ?? { label: status, className: 'bg-muted' };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.className}`}>
      {c.label}
    </span>
  );
}
