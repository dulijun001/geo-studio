import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieItem = { name: string; value: string; options?: CookieOptions };

/**
 * Supabase SSR session refresh + auth gate.
 *
 * Called from apps/web/middleware.ts. Does three things:
 *   1. Refreshes the Supabase session cookie if it's close to expiring.
 *   2. Exposes the current user to downstream handlers via request context
 *      (not used directly yet, but in place for W2.3 tenant resolution).
 *   3. Redirects unauthenticated users away from /app/* → /login?next=...
 *
 * IMPORTANT: do NOT call supabase.auth.getSession() in between cookie set
 * operations — it would read stale cookies. Use getUser() which re-validates
 * the JWT against the server.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    // In dev, surface the misconfiguration instead of silently passing through.
    console.error('[middleware] Supabase env vars missing');
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieItem[]) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isProtected = pathname.startsWith('/app') || pathname.startsWith('/t/');
  const isLoginRoute = pathname === '/login';

  if (!user && isProtected) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Logged-in users on /login bounce to /app
  if (user && isLoginRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/app';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
