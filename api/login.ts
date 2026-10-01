import { connect } from '@tidbcloud/serverless';
import { verifyPassword } from './lib/password';

const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || '*')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);

// ======================================================
// CORS
// ======================================================

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
      'POST, OPTIONS',

    'Access-Control-Allow-Headers':
      'Content-Type',

    'Access-Control-Max-Age':
      '86400',

    'Vary':
      'Origin',
  };
}

// ======================================================
// RESPONSE JSON + CORS
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
// API LOGIN
// ======================================================

export default {
  async fetch(request: Request) {

    // ==================================================
    // CORS PREFLIGHT
    // ==================================================

    if (request.method === 'OPTIONS') {
      return new Response(
        null,
        {
          status: 204,
          headers:
            getCorsHeaders(request),
        }
      );
    }

    // ==================================================
    // METHOD CHECK
    // ==================================================

    if (request.method !== 'POST') {
      return json(
        request,
        {
          status: 'error',
          message:
            'Method tidak didukung.',
        },
        405
      );
    }

    try {

      // ==================================================
      // DATABASE URL
      // ==================================================

      const databaseUrl =
        process.env.DATABASE_URL;

      if (!databaseUrl) {
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
      // BACA BODY REQUEST
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
          body?.password || ''
        );

      const role =
        String(
          body?.role || ''
        )
          .trim()
          .toLowerCase();

      // ==================================================
      // VALIDASI INPUT
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
      // VALIDASI ROLE
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
      // CONNECT DATABASE
      // ==================================================

      const conn =
        connect({
          url: databaseUrl,
        });

      let rows: any[];

      // ==================================================
      // LOGIN ADMIN
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

                AND
                LOWER(role) =
                'admin'

                AND
                aktif = 1

              LIMIT 1
            `,
            [username]
          )) as any[];

      }

      // ==================================================
      // LOGIN GURU / KEPSEK / PEGAWAI
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

                AND
                LOWER(role) =
                LOWER(?)

                AND
                aktif = 1

              LIMIT 1
            `,
            [
              username,
              role,
            ]
          )) as any[];

      }

      // ==================================================
      // DEBUG LOG
      // ==================================================

      console.log(
        'LOGIN ACCOUNT LOOKUP',
        {
          username,
          role,
          rowsFound:
            Array.isArray(rows)
              ? rows.length
              : -1,
        }
      );

      // ==================================================
      // USER TIDAK DITEMUKAN
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
      // DATA ACCOUNT
      // ==================================================

      const account =
        rows[0];

      const passwordHash =
        String(
          account?.password_hash ??
          ''
        ).trim();

      // ==================================================
      // PASSWORD CHECK
      // ==================================================

      if (
        !verifyPassword(
          password,
          passwordHash
        )
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
        }
      );

    } catch (error) {

      // ==================================================
      // ERROR HANDLER
      // ==================================================

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
  },
};
