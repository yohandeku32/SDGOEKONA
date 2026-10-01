import { connect } from '@tidbcloud/serverless';
import { verifyPassword } from './lib/password';

const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || '*')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);

function getCorsHeaders(request: Request) {
  const origin = request.headers.get('Origin') || '';
  const allowAll = ALLOWED_ORIGINS.has('*');
  const allowedOrigin = allowAll
    ? '*'
    : ALLOWED_ORIGINS.has(origin)
      ? origin
      : '';

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  };
}

function json(request: Request, data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: getCorsHeaders(request),
  });
}

// Konfigurasi ini memberitahu Vercel untuk menggunakan Edge Runtime
export const config = {
  runtime: 'edge',
};

// Menggunakan format fungsi standar untuk Vercel Edge Function
export default async function handler(request: Request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(request),
    });
  }

  if (request.method !== 'POST') {
    return json(
      request,
      { status: 'error', message: 'Method tidak didukung.' },
      405
    );
  }

  try {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      return json(
        request,
        {
          status: 'error',
          message: 'DATABASE_URL belum ditemukan di Vercel.',
        },
        500
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json(
        request,
        { status: 'error', message: 'Body request bukan JSON yang valid.' },
        400
      );
    }

    const payload = (body && typeof body === 'object') ? body as Record<string, unknown> : {};
    const username = String(payload.username ?? payload.id ?? '').trim();
    const password = String(payload.password ?? '');
    const role = String(payload.role ?? '').trim().toLowerCase();

    if (!username || !password || !role) {
      return json(
        request,
        {
          status: 'error',
          message: 'Username, password, dan peran wajib diisi.',
        },
        400
      );
    }

    const allowedRoles = new Set(['admin', 'kepsek', 'guru', 'pegawai']);
    if (!allowedRoles.has(role)) {
      return json(
        request,
        { status: 'error', message: 'Peran tidak valid.' },
        400
      );
    }

    const conn = connect({ url: databaseUrl });

    if (role === 'admin') {
      const rows = await conn.execute(
        `
          SELECT id_user, nama, role, password_hash, aktif
          FROM system_users
          WHERE LOWER(id_user) = LOWER(?)
            AND role = 'admin'
            AND aktif = 1
          LIMIT 1
        `,
        [username]
      );

      if (!Array.isArray(rows) || rows.length === 0) {
        return json(
          request,
          { status: 'error', message: 'Username atau password salah.' },
          401
        );
      }

      const account = rows[0] as Record<string, unknown>;
      const valid = await verifyPassword(
        password,
        String(account.password_hash ?? '')
      );

      if (!valid) {
        return json(
          request,
          { status: 'error', message: 'Username atau password salah.' },
          401
        );
      }

      return json(request, {
        status: 'success',
        message: 'Login berhasil.',
        user: {
          id: String(account.id_user),
          name: String(account.nama),
          role: String(account.role),
        },
      });
    }

    const rows = await conn.execute(
      `
        SELECT id_user, nama, role, password_hash, aktif
        FROM guru
        WHERE LOWER(id_user) = LOWER(?)
          AND role = ?
          AND aktif = 1
        LIMIT 1
      `,
      [username, role]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return json(
        request,
        { status: 'error', message: 'Username atau password salah.' },
        401
      );
    }

    const account = rows[0] as Record<string, unknown>;
    const valid = await verifyPassword(
      password,
      String(account.password_hash ?? '')
    );

    if (!valid) {
      return json(
        request,
        { status: 'error', message: 'Username atau password salah.' },
        401
      );
    }

    return json(request, {
      status: 'success',
      message: 'Login berhasil.',
      user: {
        id: String(account.id_user),
        name: String(account.nama),
        role: String(account.role),
      },
    });
  } catch (error) {
    console.error('LOGIN API ERROR:', error);

    return json(
      request,
      {
        status: 'error',
        message: 'Terjadi kesalahan pada server login.',
      },
      500
    );
  }
}
