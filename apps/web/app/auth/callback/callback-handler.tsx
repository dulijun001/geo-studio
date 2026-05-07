'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'exchanging' | 'error'>('exchanging');
  const [message, setMessage] = useState('正在完成登录…');

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const next = searchParams.get('next') ?? '/app';

    async function run() {
      // Wipe any stale Supabase auth cookies from a previous deployment.
      // After switching the project from Supabase US to a self-hosted instance,
      // the old sb-{oldRef}-auth-token cookies hang around and occasionally win
      // a read race against the new sb-{newRef}-auth-token, kicking the user
      // back to /login. Best-effort: clear anything matching the supabase
      // cookie pattern before we set a fresh session.
      document.cookie
        .split(';')
        .map((c) => c.split('=')[0]?.trim() ?? '')
        .filter((n) => /^sb-.+-auth-token/.test(n))
        .forEach((n) => {
          document.cookie = `${n}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
        });

      // 1. Implicit flow: Supabase admin.generateLink returns #access_token=&refresh_token=
      const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
      if (hash) {
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            setStatus('error');
            setMessage(`设置会话失败:${error.message}`);
            return;
          }
          // Remove hash, hard navigate so middleware re-reads cookies
          window.location.replace(next);
          return;
        }
      }

      // 2. PKCE flow: ?code=xxx (from browser signInWithOtp)
      const code = searchParams.get('code');
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setStatus('error');
          setMessage(`登录失败:${error.message}`);
          return;
        }
        window.location.replace(next);
        return;
      }

      setStatus('error');
      setMessage('未检测到登录凭证,请回到登录页重试。');
    }

    void run();
  }, [router, searchParams]);

  if (status === 'error') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-rose-300">{message}</p>
        <a
          href="/login"
          className="inline-block rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          回到登录页
        </a>
      </div>
    );
  }

  return <p className="text-sm text-muted-foreground">{message}</p>;
}
