import { requireRole } from '@/lib/tenant';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function SettingsPage({ params }: { params: { slug: string } }) {
  const tenant = await requireRole(params.slug, ['owner', 'admin']);
  const supabase = createSupabaseServerClient();

  const { data: members } = await supabase
    .from('tenant_memberships')
    .select('user_id, role, created_at')
    .eq('tenant_id', tenant.id);

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">设置</h1>
        <p className="text-sm text-muted-foreground">租户配置、成员、品牌词典、合规词库</p>
      </header>

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
        <h2 className="text-lg font-medium">成员({members?.length ?? 0})</h2>
        {members && members.length > 0 ? (
          <ul className="divide-y divide-border rounded-md border border-border">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center justify-between px-4 py-2 text-sm">
                <code className="text-xs text-muted-foreground">{m.user_id}</code>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{m.role}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">暂无成员(此情况不应发生)</p>
        )}
      </section>

      <section className="rounded-md border border-dashed border-border bg-muted/20 p-5 text-sm text-muted-foreground">
        <p className="mb-2 text-foreground">后续功能(W2 后):</p>
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
