/**
 * TEMPORARY (added 2026-05-12) — 临时账号密码登录.
 *
 * 上下文: HTTPS 上线时客户口头交付,同事邮箱魔链不方便,先用账号密码顶一下.
 * 凭证写死在源码 (USER / PASS),没有 DB 表、没有 hash、没有 rate-limit.
 *
 * 安全模型: "靠 URL/账号不公开" — 一旦泄露,任何撞到 /login/quick 并提交对
 * 凭证的人都成 super-admin.HTTPS 域名进 Certificate Transparency 公开日志,
 * 域名层面已无隐蔽性,这里只多一道弱口令门.
 *
 * 必须替换为之一,且不晚于 2026-06-30:
 *   (a) Supabase Auth 邮箱魔链 (D11 原设计)
 *   (b) Supabase Auth 邮箱+强密码,真实多用户
 *   (c) phone+passcode like staff (D11 风格,延伸到 admin)
 *
 * 替换后删除整个目录 apps/web/app/login/quick/ + page.tsx 里的 form.
 */
import { NextResponse } from 'next/server';
import { issueAdminSession, SUPER_ADMIN_USER_ID } from '@/lib/admin-session';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

const USER = 'songshu';
const PASS = '123456';

export async function POST(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const next = url.searchParams.get('next') || '/app';

  const form = await request.formData();
  const u = String(form.get('username') ?? '').trim();
  const p = String(form.get('password') ?? '');

  if (u !== USER || p !== PASS) {
    return NextResponse.redirect(new URL('/login?err=bad', request.url));
  }

  const email = process.env.DEV_ADMIN_EMAIL?.trim() || 'lnian7914@gmail.com';
  let userId = process.env.DEV_ADMIN_USER_ID?.trim();

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
          setTimeout(() => resolve({ data: null, error: new Error('DB timeout') }), 3000),
        ),
      ]);
      if (result.data?.user_id) userId = result.data.user_id as string;
    } catch (err) {
      console.warn('[login/quick] owner lookup failed:', err);
    }
  }
  if (!userId) userId = SUPER_ADMIN_USER_ID;

  issueAdminSession({ user_id: userId, email });
  return NextResponse.redirect(new URL(next, request.url));
}
