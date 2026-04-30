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
import { cookies } from 'next/headers';

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
  cookies().set(COOKIE_NAME, encode(session), {
    httpOnly: true,
    // Honour actual public URL scheme — see admin-session.ts for why.
    secure: process.env.NEXT_PUBLIC_APP_URL?.startsWith('https://') ?? false,
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
