import { NextResponse, type NextRequest } from 'next/server';

/**
 * V0 middleware. Placeholder only.
 *
 * TODO (V1 Week 2):
 *   - Resolve tenant from subdomain or path prefix
 *   - Attach Supabase SSR session (via @supabase/ssr)
 *   - Enforce member-role redirects (unauthenticated → /login)
 *
 * Keep this lean: anything heavy belongs in a Server Component / Route Handler.
 */
export function middleware(_req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  // Skip static assets and Next.js internals
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
