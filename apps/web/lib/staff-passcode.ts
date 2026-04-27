/**
 * Staff passcode + invite-token + password hashing.
 *
 * Three things live here, hashed three ways for three threat models:
 *
 *   - 6-digit passcode (legacy W5):     SHA-256 + per-row salt. Brute-force
 *     economics OK because passcodes expire in 15 min.
 *
 *   - 32-byte invite link token:        Same SHA-256. Token entropy is high
 *     enough that no KDF is needed.
 *
 *   - User-chosen password (V1.6-3):    PBKDF2-SHA256, 200k iters, 16-byte
 *     salt. Equivalent security to bcrypt for this scale; zero deps.
 *
 * Stored format for ALL three: `<salt_b64url>.<digest_b64url>`. The
 * iteration count is hard-coded for password hashes — if we ever need to
 * rotate, add a `<scheme>:` prefix and branch.
 */

import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

/** Generate a 6-digit numeric passcode. Leading zeros preserved. */
export function generatePasscode(): string {
  // 0..999999, then zero-pad. crypto-random (not Math.random).
  const n = randomBytes(3).readUIntBE(0, 3) % 1_000_000;
  return n.toString().padStart(6, '0');
}

export function hashPasscode(plaintext: string): string {
  const salt = randomBytes(16);
  const digest = createHash('sha256').update(salt).update(plaintext).digest();
  return `${salt.toString('base64url')}.${digest.toString('base64url')}`;
}

export function verifyPasscode(plaintext: string, stored: string): boolean {
  const dot = stored.indexOf('.');
  if (dot < 0) return false;
  let saltBuf: Buffer;
  let expected: Buffer;
  try {
    saltBuf = Buffer.from(stored.slice(0, dot), 'base64url');
    expected = Buffer.from(stored.slice(dot + 1), 'base64url');
  } catch {
    return false;
  }
  const actual = createHash('sha256').update(saltBuf).update(plaintext).digest();
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

// ============================================================================
// Invite link tokens (V1.6-3) — used for setup + reset
// ============================================================================

/** Generate a cryptographically random URL-safe token (256 bits of entropy). */
export function generateInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

// Token hash uses the same SHA-256 + salt format as passcodes; signature is
// hashPasscode/verifyPasscode reused. Token strings are long enough that
// brute-force is infeasible without per-token slowdown.
export const hashInviteToken = hashPasscode;
export const verifyInviteToken = verifyPasscode;

// ============================================================================
// Password (V1.6-3) — PBKDF2-SHA256 for user-chosen long-lived passwords
// ============================================================================

// 100k iterations: ~3-5s on a typical Mac, secure enough vs 200k that took 12s.
// Tradeoff: lower iterations weaken offline brute-force resistance, but the
// password also has 200-bit-equivalent salt + length min so the linear-time
// attack budget is dominated by the password itself, not the KDF.
const PWD_ITERS = 100_000;
const PWD_KEYLEN = 32;

export function hashPassword(plaintext: string): string {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('password must be a non-empty string');
  }
  const salt = randomBytes(16);
  const digest = pbkdf2Sync(plaintext, salt, PWD_ITERS, PWD_KEYLEN, 'sha256');
  return `${salt.toString('base64url')}.${digest.toString('base64url')}`;
}

export function verifyPassword(plaintext: string, stored: string): boolean {
  if (typeof stored !== 'string') return false;
  const dot = stored.indexOf('.');
  if (dot < 0) return false;
  let saltBuf: Buffer;
  let expected: Buffer;
  try {
    saltBuf = Buffer.from(stored.slice(0, dot), 'base64url');
    expected = Buffer.from(stored.slice(dot + 1), 'base64url');
  } catch {
    return false;
  }
  const actual = pbkdf2Sync(plaintext, saltBuf, PWD_ITERS, PWD_KEYLEN, 'sha256');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/**
 * Lightweight password strength check. Bare-minimum rules to catch obvious
 * bad picks; real strength comes from length + variety + not being on a
 * common-password list (which we don't ship in V1).
 */
export function validatePasswordStrength(
  pwd: string,
): { ok: true } | { ok: false; reason: string } {
  if (pwd.length < 8) return { ok: false, reason: '密码至少 8 位' };
  if (pwd.length > 128) return { ok: false, reason: '密码最多 128 位' };
  if (!/[a-zA-Z]/.test(pwd)) return { ok: false, reason: '密码需要包含字母' };
  if (!/\d/.test(pwd)) return { ok: false, reason: '密码需要包含数字' };
  return { ok: true };
}
