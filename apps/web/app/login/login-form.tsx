'use client';

import { useSearchParams } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/app';

  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);

    const supabase = createSupabaseBrowserClient();
    const redirectUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectUrl,
        shouldCreateUser: true,
      },
    });

    setSending(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-2 rounded-md border border-border bg-muted/40 p-4">
        <p className="font-medium">登录链接已发送</p>
        <p className="text-sm text-muted-foreground">
          请去 <strong>{email}</strong> 的邮箱收件箱点开链接。几秒内没收到就看看垃圾邮件。
        </p>
        <button
          type="button"
          onClick={() => {
            setSent(false);
            setEmail('');
          }}
          className="text-sm text-accent underline underline-offset-2"
        >
          换个邮箱
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">邮箱</span>
        <input
          type="email"
          required
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </label>
      <button
        type="submit"
        disabled={sending || !email}
        className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {sending ? '发送中…' : '发送登录链接'}
      </button>
      {error && (
        <p className="rounded-md border border-rose-500/30 bg-rose-500/[0.10] p-3 text-sm text-rose-300">
          {error}
        </p>
      )}
    </form>
  );
}
