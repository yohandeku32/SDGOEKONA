import { connect } from '@tidbcloud/serverless';

export const runtime = 'nodejs';

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

export default {
  async fetch(request: Request) {
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
          { status: 'error', message: 'DATABASE_URL belum ditemukan di Vercel.' },
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

      const input = body as Record<string, unknown> | null;
      const username = String(input?.username || input?.id || '').trim();
      const password = String(input?.password || '');
      const role = String(input?.role || '').trim().toLowerCase();

      if (!username || !password || !role) {
        return json(
          request,
          { status: 'error', message: 'Username, password, dan peran wajib diisi.' },
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

      // Password awal disimpan sebagai:
      // sha256v1$SHA2(id_user + ':' + password, 256)
      // Hash dihitung di TiDB agar endpoint login tidak membutuhkan node:crypto.
      const query = `
        SELECT
          id_user,
          nama,
          role,
          aktif
        FROM %s
        WHERE LOWER(id_user) = LOWER(?)
          AND role = ?
          AND aktif = 1
          AND password_hash = CONCAT(
            'sha256v1$',
            SHA2(CONCAT(id_user, ':', ?), 256)
          )
        LIMIT 1
      `;

      const tableName = role === 'admin' ? 'system_users' : 'guru';
      const statement = query.replace('%s', tableName);
      const rows = (await conn.execute(statement, [username, role, password])) as any[];

      if (!Array.isArray(rows) || rows.length === 0) {
        return json(
          request,
          { status: 'error', message: 'Username atau password salah.' },
          401
        );
      }

      const account = rows[0];

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
          message: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  },
};
