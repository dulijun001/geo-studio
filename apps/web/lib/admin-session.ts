/**
 * Admin session — HMAC-signed cookie for the GEO Studio operator (you).
 *
 * Why this exists separately from Supabase auth:
 *   - Supabase auth requires the auth container + email link delivery, both of
 *     which fail constantly on the 2C 4G ECS that hosts the stack. Every flake
 *     blocks development. For a single-tenant single-operator product (V1
 *     reality, not the multi-tenant SaaS goal), an HMAC cookie minted by the
 *     web app itself is more reliable.
 *
 *   - Staff already have their own HMAC scheme (lib/staff-session.ts). This
 *     mirrors that approach for admins, sharing the same STAFF_SESSION_SECRET
 *     so we don't multiply secrets.
 *
 * The dev-bypass route /login/dev mints this cookie without password — it's
 * gated by NODE_ENV !== 'production'. Production deploys go back to Supabase
 * auth (or eventually a phone+password flow that mirrors staff).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'geo_admin_session';
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Sentinel UUID used by /login/dev when the DB is unreachable and we can't
 * find a real user_id. lib/tenant.ts recognizes this and treats the holder
 * as a "super admin" of any tenant, bypassing tenant_memberships entirely.
 *
 * NEVER use this in production — gated by NODE_ENV in /login/dev.
 */
export const SUPER_ADMIN_USER_ID = '00000000-0000-0000-0000-000000000001';

export function isSuperAdmin(session: AdminSession | null): boolean {
  return session?.user_id === SUPER_ADMIN_USER_ID;
}

export type AdminSession = {
  user_id: string;
  email: string;
  iat: number;
  exp: number;
};

function secret(): string {
  const s = process.env.STAFF_SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error('STAFF_SESSION_SECRET missing or too short. Set it in .env');
  }
  return s;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

function encode(s: AdminSession): string {
  const payload = Buffer.from(JSON.stringify(s)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function decode(token: string): AdminSession | null {
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as AdminSession;
    if (!parsed.user_id || !parsed.email || !parsed.exp) return null;
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function issueAdminSession(input: { user_id: string; email: string }): void {
  const now = Date.now();
  const session: AdminSession = {
    user_id: input.user_id,
    email: input.email,
    iat: now,
    exp: now + SESSION_DURATION_MS,
  };
  cookies().set(COOKIE_NAME, encode(session), {
    httpOnly: true,
    // Secure cookies require HTTPS. We honour the actual public URL scheme
    // rather than NODE_ENV so the IP-only HTTP demo phase (备案前) doesn't
    // silently drop the cookie. Once dulijun.icu beian clears and we flip
    // NEXT_PUBLIC_APP_URL to https, this auto-flips to true.
    secure: process.env.NEXT_PUBLIC_APP_URL?.startsWith('https://') ?? false,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_DURATION_MS / 1000),
  });
}

export function readAdminSession(): AdminSession | null {
  const cookie = cookies().get(COOKIE_NAME);
  if (!cookie?.value) return null;
  return decode(cookie.value);
}

export function clearAdminSession(): void {
  cookies().delete(COOKIE_NAME);
}
