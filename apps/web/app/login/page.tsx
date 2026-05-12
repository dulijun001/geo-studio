import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { LoginForm } from './login-form';

/**
 * 开发模式下,跳过邮箱魔链直接走 /login/dev(HMAC cookie 一键登录)。
 * supabase-auth 在自托管 ECS 上跑不动,邮件投递也不稳,V1 单运营场景下
 * 整个邮箱流程是死代码。生产环境再切回 LoginForm,或换成 phone+password。
 */
export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; err?: string };
}) {
  if (process.env.NODE_ENV !== 'production') {
    const next = searchParams.next ? `?next=${encodeURIComponent(searchParams.next)}` : '';
    redirect(`/login/dev${next}`);
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* atmospheric emerald glow + dotted grid — landing-page DNA */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 -top-32 h-[44rem] w-[44rem] -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: 'rgba(52,211,153,0.18)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          maskImage:
            'radial-gradient(ellipse 70% 60% at 50% 30%, black 50%, transparent 100%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 70% 60% at 50% 30%, black 50%, transparent 100%)',
        }}
      />
      <main className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-24">
        <div className="space-y-3">
          <div className="flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-400">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: '#34d399',
                boxShadow: '0 0 0 3px rgba(52,211,153,0.2)',
              }}
            />
            GEO Studio
          </div>
          <h1 className="text-4xl font-semibold tracking-[-0.025em]">
            登
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
              录
            </span>
          </h1>
          <p className="text-sm text-muted-foreground">
            输入邮箱，我们会发送一条一键登录链接到你的邮箱。
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <Suspense
            fallback={<div className="text-sm text-muted-foreground">加载中…</div>}
          >
            <LoginForm />
          </Suspense>
        </div>

        {/* TEMPORARY 临时账号密码登录 — 见 apps/web/app/login/quick/route.ts */}
        <details className="rounded-2xl border border-border bg-card/40 p-5 text-sm">
          <summary className="cursor-pointer font-medium text-muted-foreground">
            管理员快速登录
          </summary>
          <form action="/login/quick" method="POST" className="mt-4 space-y-3">
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">账号</span>
              <input
                name="username"
                type="text"
                required
                autoComplete="username"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">密码</span>
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>
            {searchParams.err === 'bad' && (
              <p className="rounded-md border border-rose-500/30 bg-rose-500/[0.10] px-3 py-2 text-xs text-rose-300">
                账号或密码错误
              </p>
            )}
            <button
              type="submit"
              className="w-full rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-emerald-950 hover:bg-emerald-400"
            >
              登录
            </button>
          </form>
        </details>
      </main>
    </div>
  );
}
