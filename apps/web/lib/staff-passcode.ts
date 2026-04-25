/**
 * Staff passcode hashing + verification.
 *
 * Using SHA-256 (not bcrypt) because:
 *   1. Passcodes are 6-digit short-lived (15 min), so brute-force economics differ
 *      from password hashing — the expiry dominates.
 *   2. Zero external deps keeps the worker image slim.
 *
 * The salt is per-invite (16 random bytes, stored as the first segment of the hash).
 * Format stored in passcode_hash: `<salt_b64>.<sha256_b64>`
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

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
