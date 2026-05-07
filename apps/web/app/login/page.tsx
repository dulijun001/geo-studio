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
  searchParams: { next?: string };
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
      </main>
    </div>
  );
}
