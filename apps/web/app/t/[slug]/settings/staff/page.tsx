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
    .select('id, real_name, role, phone, status, persona, platforms, auth_user_id, password_hash')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  const staff = (staffRaw ?? []) as unknown as StaffRow[];

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
        title="员工是怎么登录的(V1 dev-passcode)"
        body="员工没有邮箱,V1 用「管理员手发 6 位访问码」过渡:你点「生成访问码」→ 弹出 6 位数字 → 把手机号 + 这 6 位通过企微 / 电话告诉员工 → 员工去 /staff/login 登录。访问码 15 分钟内有效,新生成会作废旧的。V1 收尾切换到阿里云 SMS OTP,DB schema 不变。"
      />

      {staff.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-10 text-center text-sm text-muted-foreground">
          还没有员工。点右上角「+新建员工」开始添加,或运行 <code>pnpm -F @geo/db dev-seed-w5</code> 导入种子员工。
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
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
              {staff.map((s) => {
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
