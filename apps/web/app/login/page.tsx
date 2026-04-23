import { Suspense } from 'react';
import { LoginForm } from './login-form';

export default function LoginPage() {
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
