/**
 * STF-1 — sliding-window login throttle for /staff/login.
 *
 * Why: phone numbers of clinic staff are easy to discover (medical brands list
 * doctors publicly). Without a throttle, a 6-digit passcode is 10^6 attempts —
 * a few hours of unattended brute force per phone. HMAC signing on the cookie
 * does NOT defend against brute-forcing the login itself; this layer must.
 *
 * Design:
 *   - Key: `${phone}:${ip}` so attackers can't pivot off a single key.
 *   - Window: 5 minutes, max 5 failed attempts. After that the (phone,IP)
 *     pair is locked for 30 minutes.
 *   - Successful login resets the counter for that key.
 *   - In-memory only; single-process. V2 multi-replica deploy needs Redis or
 *     a Postgres counter — this is a single-instance limitation, marked.
 */

import 'server-only';

type Bucket = { firstFailureAt: number; failures: number; lockedUntil: number };
const buckets = new Map<string, Bucket>();

const WINDOW_MS = 5 * 60_000;
const MAX_FAILURES = 5;
const LOCKOUT_MS = 30 * 60_000;
const SWEEP_INTERVAL_MS = 5 * 60_000;
let lastSweep = 0;

function key(phone: string, ip: string): string {
  return `${phone}:${ip}`;
}

/**
 * Check if a login attempt is allowed. Call BEFORE the credential check.
 * If allowed=false, the caller should redirect to a generic error page
 * (don't expose remaining attempts — that's another enumeration vector).
 */
export function checkLoginAllowed(
  phone: string,
  ip: string,
): { allowed: boolean; retryAfterSec: number } {
  sweep();
  const k = key(phone, ip);
  const b = buckets.get(k);
  if (!b) return { allowed: true, retryAfterSec: 0 };

  const now = Date.now();
  if (now < b.lockedUntil) {
    return { allowed: false, retryAfterSec: Math.ceil((b.lockedUntil - now) / 1000) };
  }
  // Window expired without lockout → reset.
  if (now - b.firstFailureAt > WINDOW_MS) {
    buckets.delete(k);
    return { allowed: true, retryAfterSec: 0 };
  }
  return { allowed: true, retryAfterSec: 0 };
}

/** Record a failed attempt. Locks the key after MAX_FAILURES inside WINDOW_MS. */
export function recordLoginFailure(phone: string, ip: string): void {
  const k = key(phone, ip);
  const now = Date.now();
  const b = buckets.get(k);
  if (!b || now - b.firstFailureAt > WINDOW_MS) {
    buckets.set(k, { firstFailureAt: now, failures: 1, lockedUntil: 0 });
    return;
  }
  b.failures += 1;
  if (b.failures >= MAX_FAILURES) {
    b.lockedUntil = now + LOCKOUT_MS;
  }
}

/** Record success — wipe the bucket so the user starts fresh. */
export function clearLoginThrottle(phone: string, ip: string): void {
  buckets.delete(key(phone, ip));
}

function sweep(): void {
  const now = Date.now();
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [k, b] of buckets) {
    if (now > b.lockedUntil && now - b.firstFailureAt > WINDOW_MS) {
      buckets.delete(k);
    }
  }
}

/**
 * Best-effort client IP from headers. Server actions don't get a NextRequest;
 * the caller must pass a Headers object pulled from `headers()` in server-action
 * context.
 */
export function clientIpFromHeaders(h: Headers): string {
  const xff = h.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return h.get('x-real-ip') ?? 'unknown';
}
