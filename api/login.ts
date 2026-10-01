import { connect } from '@tidbcloud/serverless';
import {
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

export const runtime = 'nodejs';

// ======================================================
// CORS
// ======================================================

const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || '*')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);

function getCorsHeaders(request: Request) {
  const origin =
    request.headers.get('Origin') || '';

  const allowedOrigin =
    ALLOWED_ORIGINS.has(origin)
      ? origin
      : '*';

  return {
    'Access-Control-Allow-Origin':
      allowedOrigin,

    'Access-Control-Allow-Methods':
      'GET, POST, OPTIONS',

    'Access-Control-Allow-Headers':
      'Content-Type',

    'Access-Control-Max-Age':
      '86400',

    'Vary':
      'Origin',

    'Cache-Control':
      'no-store',
  };
}

// ======================================================
// JSON RESPONSE
// ======================================================

function json(
  request: Request,
  data: unknown,
  status = 200
) {
  return Response.json(
    data,
    {
      status,
      headers:
        getCorsHeaders(request),
    }
  );
}

// ======================================================
// PASSWORD VERIFICATION
// Format:
// scrypt$N$r$p$saltHex$hashHex
// ======================================================

function verifyPassword(
  password: string,
  encoded: string
): boolean {

  try {

    const parts =
      String(encoded || '')
        .split('$');

    if (
      parts.length !== 6 ||
      parts[0] !== 'scrypt'
    ) {
      return false;
    }

    const N =
      Number(parts[1]);

    const r =
      Number(parts[2]);

    const p =
      Number(parts[3]);

    const salt =
      parts[4];

    const expectedHex =
      parts[5];

    if (
      !Number.isInteger(N) ||
      !Number.isInteger(r) ||
      !Number.isInteger(p) ||
      N <= 1 ||
      r <= 0 ||
      p <= 0 ||
      !salt ||
      !expectedHex ||
      !/^[0-9a-f]+$/i.test(
        expectedHex
      ) ||
      expectedHex.length % 2 !== 0
    ) {
      return false;
    }

    const expected =
      Buffer.from(
        expectedHex,
        'hex'
      );

    if (
      expected.length === 0
    ) {
      return false;
    }

    const actual =
      scryptSync(
        password,
        salt,
        expected.length,
        {
          N,
          r,
          p,
          maxmem:
            128 * 1024 * 1024,
        }
      );

    if (
      actual.length !==
      expected.length
    ) {
      return false;
    }

    return timingSafeEqual(
      actual,
      expected
    );

  } catch (error) {

    console.error(
      'PASSWORD VERIFY ERROR:',
      error
    );

    return false;
  }
}

// ======================================================
// GET
// Hanya untuk mengetes apakah Function hidup
// ======================================================

export async function GET(
  request: Request
) {
  return json(
    request,
    {
      status: 'success',
      message:
        'API login aktif.',
      method:
        request.method,
    },
    200
  );
}

// ======================================================
// OPTIONS
// ======================================================

export async function OPTIONS(
  request: Request
) {
  return new Response(
    null,
    {
      status: 204,
      headers:
        getCorsHeaders(request),
    }
  );
}

// ======================================================
// POST LOGIN
// ======================================================

export async function POST(
  request: Request
) {

  try {

    // ==================================================
    // DATABASE URL
    // ==================================================

    const databaseUrl =
      process.env.DATABASE_URL;

    if (!databaseUrl) {

      console.error(
        'DATABASE_URL tidak tersedia'
      );

      return json(
        request,
        {
          status: 'error',
          message:
            'DATABASE_URL belum ditemukan di Vercel.',
        },
        500
      );
    }

    // ==================================================
    // REQUEST BODY
    // ==================================================

    let body: any;

    try {

      body =
        await request.json();

    } catch {

      return json(
        request,
        {
          status: 'error',
          message:
            'Body request bukan JSON yang valid.',
        },
        400
      );
    }

    const username =
      String(
        body?.username ||
        body?.id ||
        ''
      ).trim();

    const password =
      String(
        body?.password ||
        ''
      );

    const role =
      String(
        body?.role ||
        ''
      )
        .trim()
        .toLowerCase();

    // ==================================================
    // VALIDASI
    // ==================================================

    if (
      !username ||
      !password ||
      !role
    ) {

      return json(
        request,
        {
          status: 'error',
          message:
            'Username, password, dan peran wajib diisi.',
        },
        400
      );
    }

    // ==================================================
    // ROLE YANG DIIZINKAN
    // ==================================================

    const allowedRoles =
      new Set([
        'admin',
        'kepsek',
        'guru',
        'pegawai',
      ]);

    if (
      !allowedRoles.has(role)
    ) {

      return json(
        request,
        {
          status: 'error',
          message:
            'Peran tidak valid.',
        },
        400
      );
    }

    // ==================================================
    // DATABASE
    // ==================================================

    const conn =
      connect({
        url: databaseUrl,
      });

    let rows: any[];

    // ==================================================
    // ADMIN
    // ==================================================

    if (role === 'admin') {

      rows =
        (await conn.execute(
          `
            SELECT
              id_user,
              nama,
              role,
              password_hash,
              aktif
            FROM system_users
            WHERE
              LOWER(id_user) =
              LOWER(?)
              AND LOWER(role) =
              'admin'
              AND aktif = 1
            LIMIT 1
          `,
          [username]
        )) as any[];

    }

    // ==================================================
    // GURU / KEPSEK / PEGAWAI
    // ==================================================

    else {

      rows =
        (await conn.execute(
          `
            SELECT
              id_user,
              nama,
              role,
              password_hash,
              aktif
            FROM guru
            WHERE
              LOWER(id_user) =
              LOWER(?)
              AND LOWER(role) =
              LOWER(?)
              AND aktif = 1
            LIMIT 1
          `,
          [
            username,
            role,
          ]
        )) as any[];

    }

    console.log(
      'LOGIN LOOKUP:',
      {
        username,
        role,
        rows:
          Array.isArray(rows)
            ? rows.length
            : -1,
      }
    );

    // ==================================================
    // USER TIDAK ADA
    // ==================================================

    if (
      !Array.isArray(rows) ||
      rows.length === 0
    ) {

      return json(
        request,
        {
          status: 'error',
          message:
            'Username atau password salah.',
        },
        401
      );
    }

    // ==================================================
    // ACCOUNT
    // ==================================================

    const account =
      rows[0];

    const passwordHash =
      String(
        account?.password_hash ||
        ''
      ).trim();

    if (!passwordHash) {

      console.error(
        'PASSWORD HASH KOSONG:',
        username
      );

      return json(
        request,
        {
          status: 'error',
          message:
            'Data password pengguna tidak tersedia.',
        },
        500
      );
    }

    // ==================================================
    // PASSWORD
    // ==================================================

    const passwordValid =
      verifyPassword(
        password,
        passwordHash
      );

    if (!passwordValid) {

      return json(
        request,
        {
          status: 'error',
          message:
            'Username atau password salah.',
        },
        401
      );
    }

    // ==================================================
    // LOGIN BERHASIL
    // ==================================================

    return json(
      request,
      {
        status: 'success',
        message:
          'Login berhasil.',

        user: {
          id:
            String(
              account.id_user
            ),

          name:
            String(
              account.nama
            ),

          role:
            String(
              account.role
            ).toLowerCase(),
        },
      },
      200
    );

  } catch (error) {

    console.error(
      'LOGIN API ERROR:',
      error
    );

    return json(
      request,
      {
        status: 'error',

        message:
          error instanceof Error
            ? error.message
            : String(error),
      },
      500
    );
  }
}

// ======================================================
// FALLBACK
// ======================================================

export default {
  fetch(request: Request) {

    if (
      request.method === 'GET'
    ) {
      return GET(request);
    }

    if (
      request.method === 'POST'
    ) {
      return POST(request);
    }

    if (
      request.method === 'OPTIONS'
    ) {
      return OPTIONS(request);
    }

    return json(
      request,
      {
        status: 'error',
        message:
          'Method tidak didukung.',
      },
      405
    );
  },
};
