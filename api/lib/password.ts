import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

// Scrypt can need more than the nominal cost during OpenSSL allocation.
// Keep a generous limit so Vercel Node runtime does not reject valid hashes.
const MAX_MEM = 128 * 1024 * 1024;

/**
 * Format:
 * scrypt$N$r$p$saltHex$hashHex
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: MAX_MEM,
  });

  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derivedKey.toString('hex')}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  const parts = String(encoded || '').split('$');

  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = parts[4];
  const expectedHex = parts[5];

  if (
    !Number.isInteger(N) ||
    !Number.isInteger(r) ||
    !Number.isInteger(p) ||
    !salt ||
    !/^[0-9a-f]+$/i.test(expectedHex) ||
    expectedHex.length % 2 !== 0
  ) {
    return false;
  }

  try {
    const expected = Buffer.from(expectedHex, 'hex');
    const actual = scryptSync(password, salt, expected.length, {
      N,
      r,
      p,
      maxmem: Math.max(MAX_MEM, 128 * 1024 * 1024),
    });

    return (
      actual.length === expected.length &&
      timingSafeEqual(actual, expected)
    );
  } catch (error) {
    console.error('PASSWORD VERIFY ERROR:', error);
    return false;
  }
}
