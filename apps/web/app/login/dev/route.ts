/**
 * Dev-only one-click login. Hits this URL and you're in.
 *
 * Why it exists: Supabase auth + magic-link email is brittle on the 2C 4G
 * ECS we self-host on. For single-operator development, this skips the
 * whole auth dance and sets an HMAC cookie directly.
 *
 * Disabled when NODE_ENV === 'production'. Bookmarks /login/dev for the
 * dev workflow:
 *
 *   1. Set DEV_ADMIN_EMAIL + DEV_ADMIN_USER_ID in .env
 *   2. Open /login/dev in browser
 *   3. Redirected to /app, signed in for 30 days
 */
import { NextResponse } from 'next/server';
import { issueAdminSession, SUPER_ADMIN_USER_ID } from '@/lib/admin-session';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse('Dev login disabled in production', { status: 404 });
  }

  const email = process.env.DEV_ADMIN_EMAIL?.trim();
  if (!email) {
    return new NextResponse(
      'DEV_ADMIN_EMAIL not set in .env.\n\nAdd this line to /Users/dulijuner/projects/geo-studio/.env:\n\n  DEV_ADMIN_EMAIL=lnian7914@gmail.com\n  DEV_ADMIN_USER_ID=<your supabase auth.users id>\n\nThen restart `pnpm dev` and re-open /login/dev.',
      { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  }

  let userId = process.env.DEV_ADMIN_USER_ID?.trim();

  // If user_id wasn't in .env, look up the first 'owner' membership via
  // PostgREST. Skip silently if the DB is unreachable — we'll fall through
  // to the super-admin placeholder below, since this is dev-only.
  // 3s timeout: ECS PostgREST in zombie state accepts TCP but never replies,
  // and the supabase client has no default fetch timeout.
  if (!userId) {
    try {
      const service = getSupabaseServiceClient();
      const query = service
        .from('tenant_memberships')
        .select('user_id')
        .eq('role', 'owner')
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      const result = await Promise.race([
        query,
        new Promise<{ data: null; error: Error }>((resolve) =>
          setTimeout(() => resolve({ data: null, error: new Error('DB timeout (3s)') }), 3000),
        ),
      ]);
      if (result.error) throw result.error;
      if (result.data?.user_id) userId = result.data.user_id as string;
    } catch (err) {
      console.warn('[login/dev] tenant_memberships lookup failed (DB likely down):', err);
    }
  }

  // Final fallback: a deterministic super-admin UUID. The admin-session
  // cookie carries this; lib/tenant.ts treats SUPER_ADMIN_USER_ID as
  // "owner of any tenant" without consulting the DB. Useful when ECS is
  // mid-restart but you need to read pages.
  if (!userId) {
    userId = SUPER_ADMIN_USER_ID;
    console.log('[login/dev] using SUPER_ADMIN_USER_ID placeholder (DB unreachable)');
  }

  issueAdminSession({ user_id: userId, email });

  const url = new URL(request.url);
  const next = url.searchParams.get('next') || '/app';
  return NextResponse.redirect(new URL(next, request.url));
}
