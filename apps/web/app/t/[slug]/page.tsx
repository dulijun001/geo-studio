import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireTenantMember } from '@/lib/tenant';

export default async function TenantHomePage({ params }: { params: { slug: string } }) {
  const tenant = await requireTenantMember(params.slug);
  const supabase = createSupabaseServerClient();

  // Counts. RLS scopes everything to this tenant automatically.
  const [{ count: contentCount }, { count: taskCount }, { count: questionCount }] =
    await Promise.all([
      supabase
        .from('content_items')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id),
      supabase
        .from('publish_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id),
      supabase
        .from('questions')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id),
    ]);

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">概览</h1>
        <p className="text-sm text-muted-foreground">
          {tenant.name} · {tenant.industry} · 你是 <code>{tenant.role}</code>
        </p>
      </header>

      <section className="grid grid-cols-3 gap-4">
        <StatCard label="内容条目" value={contentCount ?? 0} />
        <StatCard label="发布任务" value={taskCount ?? 0} />
        <StatCard label="追踪问题" value={questionCount ?? 0} />
      </section>

      <section className="rounded-md border border-border bg-muted/30 p-5 text-sm text-muted-foreground">
        <p className="mb-2 font-medium text-foreground">W2.3 完成</p>
        <ul className="list-inside list-disc space-y-1">
          <li>多租户路由 <code>/t/[slug]</code> 已就绪</li>
          <li>Layout 按角色过滤菜单</li>
          <li>RLS 自动 scope 所有查询到当前租户</li>
          <li>W2.4 将填充内容调度中台,W2.5 员工端</li>
        </ul>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-background p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
