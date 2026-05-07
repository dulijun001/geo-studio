import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/current-user';
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
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const tenants = await listMyTenants();

  if (tenants.length === 1) {
    redirect(`/t/${tenants[0]!.slug}`);
  }

  if (tenants.length === 0) {
    return (
      <main className="mx-auto max-w-xl space-y-8 px-6 py-16">
        <header className="space-y-2">
          <p className="text-sm text-muted-foreground">
            欢迎,<span className="font-mono">{user.email}</span>
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
    <div className="relative min-h-screen overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 -top-32 h-[44rem] w-[44rem] -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: 'rgba(52,211,153,0.14)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          maskImage:
            'radial-gradient(ellipse 80% 50% at 50% 20%, black 50%, transparent 100%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 80% 50% at 50% 20%, black 50%, transparent 100%)',
        }}
      />
      <main className="relative mx-auto max-w-2xl space-y-8 px-6 py-20">
        <header className="space-y-3">
          <div className="flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-400">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: '#34d399',
                boxShadow: '0 0 0 3px rgba(52,211,153,0.2)',
              }}
            />
            <span className="font-mono normal-case tracking-normal text-muted-foreground">
              {user.email}
            </span>
          </div>
          <h1 className="text-4xl font-semibold tracking-[-0.025em]">
            选择要进入的
            <span
              className="italic font-medium"
              style={{
                backgroundImage:
                  'linear-gradient(135deg, #fafafa 0%, #34d399 100%)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              租户
            </span>
          </h1>
        </header>

        <ul className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          {tenants.map((t, i) => (
            <li
              key={t.id}
              className={i > 0 ? 'border-t border-border' : ''}
            >
              <Link
                href={`/t/${t.slug}`}
                className="lift flex items-center justify-between px-5 py-4"
              >
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                    {t.industry} · /{t.slug}
                  </p>
                </div>
                <span
                  className="rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider"
                  style={{
                    border: '1px solid rgba(52,211,153,0.30)',
                    background: 'rgba(52,211,153,0.10)',
                    color: '#34d399',
                  }}
                >
                  {t.role}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <details className="rounded-2xl border border-border bg-card/40 p-5">
          <summary className="cursor-pointer text-sm font-medium hover:text-emerald-400">
            ＋ 创建新租户
          </summary>
          <div className="mt-5">
            <CreateTenantForm defaultName="" defaultSlug="" />
          </div>
        </details>

        <form action="/auth/sign-out" method="post">
          <button
            type="submit"
            className="text-xs text-muted-foreground transition hover:text-foreground underline underline-offset-2"
          >
            退出登录
          </button>
        </form>
      </main>
    </div>
  );
}

function suggestSlug(email: string): string {
  const prefix = email.split('@')[0]?.toLowerCase().replace(/[^a-z0-9-]/g, '-') ?? '';
  return prefix ? `${prefix}-org` : '';
}
