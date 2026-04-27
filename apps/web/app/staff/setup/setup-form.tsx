'use client';

import { type FormEvent, useState, useTransition } from 'react';
import { setupStaffPassword } from './actions';

export function SetupForm({ token, isReset }: { token: string; isReset: boolean }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Read directly from FormData so autofill / paste / IME edge cases all
    // hand us the current input value — no React state lag.
    const fd = new FormData(e.currentTarget);
    const password = (fd.get('password') as string | null) ?? '';
    const confirm = (fd.get('confirm') as string | null) ?? '';

    setErr(null);
    start(async () => {
      try {
        const result = await setupStaffPassword({ token, password, confirm });
        if (!result.ok) {
          setErr(result.error);
          return;
        }
        // Full page navigation — the server has already set the session
        // cookie, so the next GET /staff sees a logged-in user.
        window.location.href = '/staff';
      } catch (e) {
        setErr(e instanceof Error ? e.message : '保存失败,请重试');
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">新密码</span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
          placeholder="至少 8 位 · 字母 + 数字"
          disabled={pending}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/10 disabled:opacity-60"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">再次确认</span>
        <input
          name="confirm"
          type="password"
          required
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
          placeholder="重新输入相同的密码"
          disabled={pending}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/10 disabled:opacity-60"
        />
      </label>

      {err ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {err}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-60"
      >
        {pending ? '保存中… (3-5 秒)' : isReset ? '保存新密码并登录' : '保存密码并登录'}
      </button>
    </form>
  );
}
