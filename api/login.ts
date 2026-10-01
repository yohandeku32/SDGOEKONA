          500
        );
      }

      let body: any;
      try {
        body = await request.json();
      } catch {
        return json(
          request,
          { status: 'error', message: 'Body request bukan JSON yang valid.' },
          400
        );
      }

      const username = String(body?.username || body?.id || '').trim();
      const password = String(body?.password || '');
      const role = String(body?.role || '').trim().toLowerCase();

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

      let rows: any[];

      if (role === 'admin') {
        rows = (await conn.execute(
          `
            SELECT
              id_user,
              nama,
              role,
              password_hash,
              aktif
            FROM system_users
            WHERE LOWER(id_user) = LOWER(?)
              AND role = 'admin'
              AND aktif = 1
            LIMIT 1
          `,
          [username]
        )) as any[];
      } else {
        rows = (await conn.execute(
          `
            SELECT
              id_user,
              nama,
              role,
              password_hash,
              aktif
            FROM guru
            WHERE LOWER(id_user) = LOWER(?)
              AND role = ?
              AND aktif = 1
            LIMIT 1
          `,
          [username, role]
        )) as any[];
      }

      if (!Array.isArray(rows) || rows.length === 0) {
        return json(
          request,
          { status: 'error', message: 'Username atau password salah.' },
          401
        );
      }

      const account = rows[0];

      if (!verifyPassword(password, String(account.password_hash || ''))) {
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
          message:
            error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  },
};
