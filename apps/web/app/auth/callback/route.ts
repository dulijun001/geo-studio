import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Exchange the magic-link `code` for a Supabase session cookie, then
 * redirect to `next` (or /app). If exchange fails, bounce back to /login
 * with an `error` flag so the UI can explain.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/app';

  if (code) {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin));
    }
    console.error('[auth/callback] exchange failed:', error.message);
  }

  const loginUrl = new URL('/login', url.origin);
  loginUrl.searchParams.set('error', 'callback_failed');
  return NextResponse.redirect(loginUrl);
}
