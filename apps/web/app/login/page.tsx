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
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-24">
      <div className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          GEO Studio
        </p>
        <h1 className="text-3xl font-semibold">登录</h1>
        <p className="text-sm text-muted-foreground">
          输入邮箱,我们会发送一条一键登录链接到你的邮箱。
        </p>
      </div>
      <Suspense fallback={<div className="text-sm text-muted-foreground">加载中…</div>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
