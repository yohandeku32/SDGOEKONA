
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

      const body = await request.json();
      const username = String(body?.username || body?.id || '').trim();
      const password = String(body?.password || '');
      const role = String(body?.role || '').trim().toLowerCase();

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
      let rows: any[];

      if (role === 'admin') {
        rows = (await conn.execute(
          `
            SELECT id_user, nama, role, password_hash, aktif
            FROM system_users
            WHERE LOWER(id_user) = LOWER(?)
              AND LOWER(role) = 'admin'
              AND aktif = 1
            LIMIT 1
          `,
          [username]
        )) as any[];
      } else {
        rows = (await conn.execute(
          `
            SELECT id_user, nama, role, password_hash, aktif
            FROM guru
            WHERE LOWER(id_user) = LOWER(?)
              AND LOWER(role) = LOWER(?)
              AND aktif = 1
            LIMIT 1
          `,
          [username, role]
        )) as any[];
      }

      console.log('LOGIN ACCOUNT LOOKUP', {
        username,
        role,
        rowsFound: Array.isArray(rows) ? rows.length : -1,
      });

      if (!Array.isArray(rows) || rows.length === 0) {
        return json(
          request,
          { status: 'error', message: 'Username atau password salah.' },
          401
        );
      }

      const account = rows[0];
      const passwordHash = String(account?.password_hash ?? '').trim();

      if (!verifyScrypt(password, passwordHash)) {
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
          role: String(account.role).toLowerCase(),
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
