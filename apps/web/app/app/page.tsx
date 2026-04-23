import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { listMyTenants } from '@/lib/tenant';
import { CreateTenantForm } from './create-tenant-form';

/**
 * Post-login landing. Three cases:
 *   1. No memberships → onboarding (create first tenant)
 *   2. One membership → auto-redirect to /t/<slug>
 *   3. Many memberships → render chooser
 */
export default async function AppHomePage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const tenants = await listMyTenants();

  if (tenants.length === 1) {
    redirect(`/t/${tenants[0]!.slug}`);
  }

  if (tenants.length === 0) {
    return (
      <main className="mx-auto max-w-xl space-y-8 px-6 py-16">
        <header className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            欢迎,{user.email}
          </p>
          <h1 className="text-3xl font-semibold">先创建你的第一个租户</h1>
          <p className="text-sm text-muted-foreground">
            租户(tenant)代表一家机构或品牌 —— 所有内容、员工账号、发布任务、追踪数据都按租户隔离。
          </p>
        </header>
        <CreateTenantForm defaultName="" defaultSlug={suggestSlug(user.email ?? '')} />
        <form action="/auth/sign-out" method="post">
          <button
            type="submit"
            className="text-xs text-muted-foreground underline underline-offset-2"
          >
            退出登录
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-6 py-16">
      <header className="space-y-1">
        <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          {user.email}
        </p>
        <h1 className="text-3xl font-semibold">选择要进入的租户</h1>
      </header>

      <ul className="divide-y divide-border rounded-md border border-border">
        {tenants.map((t) => (
          <li key={t.id}>
            <Link
              href={`/t/${t.slug}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-muted/50"
            >
              <div>
                <p className="font-medium">{t.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t.industry} · /{t.slug}
                </p>
              </div>
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                {t.role}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <details className="rounded-md border border-border bg-muted/30 p-4">
        <summary className="cursor-pointer text-sm font-medium">创建新租户</summary>
        <div className="mt-4">
          <CreateTenantForm defaultName="" defaultSlug="" />
        </div>
      </details>

      <form action="/auth/sign-out" method="post">
        <button
          type="submit"
          className="text-xs text-muted-foreground underline underline-offset-2"
        >
          退出登录
        </button>
      </form>
    </main>
  );
}

function suggestSlug(email: string): string {
  const prefix = email.split('@')[0]?.toLowerCase().replace(/[^a-z0-9-]/g, '-') ?? '';
  return prefix ? `${prefix}-org` : '';
}
