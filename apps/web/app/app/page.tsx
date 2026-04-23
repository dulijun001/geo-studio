import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Dashboard placeholder. W2.3 will turn this into the real shell
 * (tenant-scoped sidebar + role-gated menu).
 *
 * Defense-in-depth: middleware already redirects unauthenticated users to /login,
 * but we re-check here because Server Components don't trust middleware output.
 */
export default async function AppHomePage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Read the user's tenant memberships. RLS ensures this only returns their own rows.
  const { data: memberships, error } = await supabase
    .from('tenant_memberships')
    .select('tenant_id, role, tenants(name, slug, industry)')
    .eq('user_id', user.id);

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-16">
      <header className="space-y-1">
        <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          GEO Studio · Dashboard v0.2
        </p>
        <h1 className="text-3xl font-semibold">欢迎,{user.email}</h1>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">你的租户</h2>
        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            读取 memberships 失败:{error.message}
          </p>
        )}
        {memberships && memberships.length === 0 && (
          <div className="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            你还不是任何租户的成员。等管理员把你加入某个租户,或在 Supabase Studio 里手动
            给这个用户(user_id: <code className="text-xs">{user.id}</code>)添加一条
            tenant_memberships 记录。
          </div>
        )}
        {memberships && memberships.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-border">
            {memberships.map((m) => {
              const tenant = Array.isArray(m.tenants) ? m.tenants[0] : m.tenants;
              return (
                <li key={m.tenant_id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="font-medium">{tenant?.name ?? m.tenant_id}</p>
                    <p className="text-xs text-muted-foreground">
                      {tenant?.industry} · slug: {tenant?.slug}
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                    {m.role}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">下一步</h2>
        <p className="text-sm text-muted-foreground">
          W2.3 实现多租户路由:进入具体租户的控制台(/t/[slug]/…),支持品牌切换、角色权限、
          侧边栏导航。当前页是认证闭环的占位。
        </p>
      </section>

      <form action="/auth/sign-out" method="post">
        <button
          type="submit"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          退出登录
        </button>
      </form>
    </main>
  );
}
