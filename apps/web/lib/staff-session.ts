/**
 * Staff session tokens for /staff — HMAC-signed cookies, not Supabase auth.
 *
 * Why not Supabase auth: staff don't have email addresses, and the V1 dev-passcode
 * flow doesn't produce a Supabase user. Production (V1 final) will either:
 *   (a) keep this cookie scheme if Aliyun SMS OTP is the final auth, or
 *   (b) migrate to Supabase Phone Auth, in which case this file gets deleted.
 *
 * Cookie: geo_staff_session (HttpOnly, Secure in prod, SameSite=Lax)
 * Payload: { staff_id, tenant_id, iat, exp } — 12h session.
 * Signing: HMAC-SHA256 with STAFF_SESSION_SECRET (required, >= 32 chars).
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies, headers } from 'next/headers';

const COOKIE_NAME = 'geo_staff_session';
// 7-day session: empirically the right balance for staff. Longer than a single
// shift so coming back the next morning doesn't force a re-login, short enough
// that a phone left at home eventually goes stale. Multi-device login is
// supported out of the box — each successful issue mints an independent cookie.
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export type StaffSession = {
  staff_id: string;
  tenant_id: string;
  iat: number;
  exp: number;
};

function secret(): string {
  const s = process.env.STAFF_SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      'STAFF_SESSION_SECRET missing or too short (need >= 32 chars). Set it in .env',
    );
  }
  return s;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

function encode(session: StaffSession): string {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

function decode(token: string): StaffSession | null {
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  // timingSafeEqual requires equal-length buffers
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as StaffSession;
    if (!parsed.staff_id || !parsed.tenant_id || !parsed.exp) return null;
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function issueStaffSession(staffId: string, tenantId: string): void {
  const now = Date.now();
  const session: StaffSession = {
    staff_id: staffId,
    tenant_id: tenantId,
    iat: now,
    exp: now + SESSION_DURATION_MS,
  };
  // 2026-06-26 fix: secure 必须跟「当前请求的实际协议」走,不能锁死在
  // NEXT_PUBLIC_APP_URL。ICP 拦截期员工被迫两种入口并存:域名(https) +
  // IP:9443(http)。若 secure 恒为 true(因 APP_URL 是 https 域名),走 http 的
  // IP 链接登录时浏览器拒存 secure cookie → 一提交就被踢回登录页(保媛的 bug)。
  // Caddy 两个反代块都传 X-Forwarded-Proto {scheme}(域名=https / IP=http),
  // 读它判断真实协议;读不到再 fallback 到 APP_URL 判断(本地 dev / 直连)。
  const fwdProto = headers().get('x-forwarded-proto');
  const isHttps = fwdProto
    ? fwdProto.split(',')[0]?.trim() === 'https'
    : (process.env.NEXT_PUBLIC_APP_URL?.startsWith('https://') ?? false);
  cookies().set(COOKIE_NAME, encode(session), {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax',
    path: '/staff',
    maxAge: Math.floor(SESSION_DURATION_MS / 1000),
  });
}

export function readStaffSession(): StaffSession | null {
  const cookie = cookies().get(COOKIE_NAME);
  if (!cookie?.value) return null;
  return decode(cookie.value);
}

export function clearStaffSession(): void {
  cookies().delete(COOKIE_NAME);
}
