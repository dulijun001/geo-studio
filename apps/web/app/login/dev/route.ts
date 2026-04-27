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
import { issueAdminSession } from '@/lib/admin-session';
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

  // If user_id wasn't in .env, look up the first 'owner' membership for any
  // tenant — that's almost certainly the dev operator. Uses PostgREST, NOT
  // the Supabase auth container, so this works even when supabase-auth is
  // down (the very reason we built this bypass).
  if (!userId) {
    try {
      const service = getSupabaseServiceClient();
      const { data, error } = await service
        .from('tenant_memberships')
        .select('user_id')
        .eq('role', 'owner')
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (data?.user_id) userId = data.user_id as string;
    } catch (err) {
      console.error('[login/dev] tenant_memberships lookup failed:', err);
    }
  }

  if (!userId) {
    return new NextResponse(
      `Couldn't find user_id for ${email}. Set DEV_ADMIN_USER_ID in .env (run on a terminal with ECS access:\n  docker exec supabase-db psql -U postgres -d postgres -tAc "SELECT id FROM auth.users WHERE email='${email}'"\n).`,
      { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  }

  issueAdminSession({ user_id: userId, email });

  const url = new URL(request.url);
  const next = url.searchParams.get('next') || '/app';
  return NextResponse.redirect(new URL(next, request.url));
}
