const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const MAX_MEM = 32 * 1024 * 1024;

/**
 * Format:
 * scrypt$N$r$p$saltHex$hashHex
 *
 * node:crypto is loaded lazily so module initialization cannot crash the
 * Vercel Function before the request handler reaches its try/catch.
 */
export async function hashPassword(password: string): Promise<string> {
  const { randomBytes, scryptSync } = await import('node:crypto');
  const salt = randomBytes(16).toString('hex');
  const derivedKey = scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: MAX_MEM,
  });

  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derivedKey.toString('hex')}`;
}

export async function verifyPassword(
  password: string,
  encoded: string
): Promise<boolean> {
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

  try {
    const { scryptSync, timingSafeEqual } = await import('node:crypto');
    const expected = Buffer.from(expectedHex, 'hex');
    const actual = scryptSync(password, salt, expected.length, {
      N,
      r,
      p,
      maxmem: MAX_MEM,
    });

    return (
      actual.length === expected.length &&
      timingSafeEqual(actual, expected)
    );
  } catch (error) {
    console.error('PASSWORD VERIFY ERROR:', error);
    throw new Error('Password verification service unavailable.');
  }
}
