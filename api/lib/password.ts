import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const DEFAULT_N = 16_384;
const DEFAULT_R = 8;
const DEFAULT_P = 1;
const DEFAULT_KEY_LENGTH = 64;
const MAX_MEM = 128 * 1024 * 1024;

/**
 * Format:
 * scrypt$N$r$p$saltHex$hashHex
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = scryptSync(password, salt, DEFAULT_KEY_LENGTH, {
    N: DEFAULT_N,
    r: DEFAULT_R,
    p: DEFAULT_P,
    maxmem: MAX_MEM,
  });

  return `scrypt$${DEFAULT_N}$${DEFAULT_R}$${DEFAULT_P}$${salt}$${derivedKey.toString('hex')}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  try {
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
      N <= 1 ||
      r <= 0 ||
      p <= 0 ||
      !salt ||
      !/^[0-9a-f]+$/i.test(expectedHex) ||
      expectedHex.length % 2 !== 0
    ) {
      return false;
    }

    const expected = Buffer.from(expectedHex, 'hex');

    if (expected.length === 0) {
      return false;
    }

    const actual = scryptSync(password, salt, expected.length, {
      N,
      r,
      p,
      maxmem: MAX_MEM,
    });

    return timingSafeEqual(actual, expected);
  } catch (error) {
    console.error('PASSWORD VERIFY ERROR:', error);
    return false;
  }
}
