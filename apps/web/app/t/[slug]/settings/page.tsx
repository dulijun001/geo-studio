import Link from 'next/link';
import { requireRole } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { PageHeader } from '@/components/page-header';

export default async function SettingsPage({ params }: { params: { slug: string } }) {
  const tenant = await requireRole(params.slug, ['owner', 'admin']);
  const supabase = createSupabaseServerClient();

  const { data: rawMembers } = await supabase
    .from('tenant_memberships')
    .select('user_id, role, created_at')
    .eq('tenant_id', tenant.id);

  // Hydrate auth.users.email per member (needed for display; can't be reached
  // via the anon-key client so use service-role).
  const service = getSupabaseServiceClient();
  const members = await Promise.all(
    (rawMembers ?? []).map(async (m) => {
      const { data: u } = await service.auth.admin.getUserById(m.user_id as string);
      return {
        user_id: m.user_id as string,
        role: m.role as string,
        created_at: m.created_at as string,
        email: u?.user?.email ?? null,
      };
    }),
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="设置"
        subtitle="租户配置 · 成员管理 · 品牌词典 · 合规词库"
      />

      <section className="space-y-3">
        <h2 className="text-lg font-medium">基本信息</h2>
        <dl className="grid grid-cols-[160px_1fr] gap-y-2 rounded-md border border-border bg-background p-4 text-sm">
          <dt className="text-muted-foreground">租户 ID</dt>
          <dd className="font-mono text-xs">{tenant.id}</dd>
          <dt className="text-muted-foreground">名称</dt>
          <dd>{tenant.name}</dd>
          <dt className="text-muted-foreground">URL slug</dt>
          <dd className="font-mono">{tenant.slug}</dd>
          <dt className="text-muted-foreground">行业</dt>
          <dd>{tenant.industry}</dd>
          <dt className="text-muted-foreground">你的角色</dt>
          <dd>{tenant.role}</dd>
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">成员({members.length})</h2>
        {members.length > 0 ? (
          <ul className="divide-y divide-border rounded-md border border-border">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="space-x-2">
                  <span className="font-medium">{m.email ?? '(邮箱缺失)'}</span>
                  <code className="text-[10px] text-muted-foreground">
                    {m.user_id.slice(0, 8)}
                  </code>
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{m.role}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">暂无成员(此情况不应发生)</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">子模块</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Link
            href={`/t/${tenant.slug}/settings/staff`}
            className="rounded-md border border-border bg-background p-4 hover:bg-muted/40"
          >
            <div className="mb-1 text-sm font-medium">员工管理</div>
            <p className="text-xs text-muted-foreground">
              员工矩阵、人设标签、平台账号、登录访问码
            </p>
          </Link>
          <Link
            href={`/t/${tenant.slug}/settings/vocab`}
            className="rounded-md border border-border bg-background p-4 hover:bg-muted/40"
          >
            <div className="mb-1 text-sm font-medium">品牌词典</div>
            <p className="text-xs text-muted-foreground">
              本品牌主名 + 别名、医生姓名、服务名、城市、竞品名 — GEO 追踪基于这本词典做命中识别
            </p>
          </Link>
          <Link
            href={`/t/${tenant.slug}/settings/audit`}
            className="rounded-md border border-border bg-background p-4 hover:bg-muted/40"
          >
            <div className="mb-1 text-sm font-medium">操作日志</div>
            <p className="text-xs text-muted-foreground">
              所有合规审批 / 派单 / 员工创建动作的可追溯时间轴 + CSV 导出,医疗合规审计必备
            </p>
          </Link>
          <Link
            href={`/t/${tenant.slug}/settings/knowledge`}
            className="rounded-md border border-border bg-background p-4 hover:bg-muted/40"
          >
            <div className="mb-1 text-sm font-medium">知识库</div>
            <p className="text-xs text-muted-foreground">
              客户 md 知识库同步状态、派生数据(合规词库 / 医生 / 品牌词典)、立即重扫
            </p>
          </Link>
          <Link
            href={`/t/${tenant.slug}/settings/geo-checklist`}
            className="rounded-md border border-border bg-background p-4 hover:bg-muted/40"
          >
            <div className="mb-1 text-sm font-medium">豆包 GEO · P0/P1 维护</div>
            <p className="text-xs text-muted-foreground">
              百度百科 / 大众点评 / 高德百度地图入驻状态。这两层是豆包 GEO 的先决条件,GEO Studio 之外要做。
            </p>
          </Link>
          <Link
            href={`/t/${tenant.slug}/daily-ops?tab=settings`}
            className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-4 hover:bg-emerald-500/10"
          >
            <div className="mb-1 flex items-center gap-2 text-sm font-medium">
              <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                NEW V1.10
              </span>
              每日自动化(daily-ops)
            </div>
            <p className="text-xs text-muted-foreground">
              凌晨自动选题 + AI 起草 + 合规分类 + 6h 超时机制。开启后,你每天进系统只看异常(从 40 min → 5 min)。
              详见 docs/09。
            </p>
          </Link>
        </div>
      </section>

      <section className="rounded-md border border-dashed border-border bg-muted/20 p-5 text-sm text-muted-foreground">
        <p className="mb-2 text-foreground">后续功能(W6+):</p>
        <ul className="list-inside list-disc space-y-1">
          <li>邀请成员(email + 角色)</li>
          <li>品牌词典管理(医生名、别名、竞品名)</li>
          <li>租户合规词库(在全局词库基础上追加)</li>
          <li>危险操作:删除租户 / 转让 owner</li>
        </ul>
      </section>
    </div>
  );
}
