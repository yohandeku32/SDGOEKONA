import { connect } from '@tidbcloud/serverless';

type MigrationRecord = {
  id_user: string;
  tanggal: string;
  jam_masuk?: string | null;
  jam_pulang?: string | null;
  status?: string | null;
  keterangan?: string | null;
  foto_masuk_file_id?: string | null;
  foto_pulang_file_id?: string | null;
};

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function cleanNullable(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  const text = String(value).trim();

  if (
    text === '' ||
    text.toLowerCase() === 'null' ||
    text.toLowerCase() === 'undefined'
  ) {
    return null;
  }

  return text;
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validTime(value: string | null) {
  if (value === null) return true;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function resolveStatus(
  jamMasuk: string | null,
  jamPulang: string | null,
  statusLama: string | null
) {
  if (jamMasuk && jamPulang) return 'MASUK & PULANG';
  if (jamMasuk) return 'MASUK';
  if (jamPulang) return 'PULANG';

  const status = (statusLama || '').trim().toUpperCase();
  return status || 'MASUK';
}

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') {
      return json(
        {
          status: 'error',
          message: 'Method tidak didukung.',
        },
        405
      );
    }

    try {
      const databaseUrl = process.env.DATABASE_URL;
      const migrationSecret = process.env.MIGRATION_SECRET;

      if (!databaseUrl) {
        return json(
          {
            status: 'error',
            message: 'DATABASE_URL belum ditemukan di Vercel.',
          },
          500
        );
      }

      if (!migrationSecret) {
        return json(
          {
            status: 'error',
            message: 'MIGRATION_SECRET belum ditemukan di Vercel.',
          },
          500
        );
      }

      const suppliedSecret =
        request.headers.get('x-migration-secret') || '';

      if (suppliedSecret !== migrationSecret) {
        return json(
          {
            status: 'error',
            message: 'Migration secret tidak valid.',
          },
          401
        );
      }

      let body: any;

      try {
        body = await request.json();
      } catch {
        return json(
          {
            status: 'error',
            message: 'Body request bukan JSON yang valid.',
          },
          400
        );
      }

      const records: MigrationRecord[] =
        Array.isArray(body?.records) ? body.records : [];

      if (records.length === 0) {
        return json(
          {
            status: 'error',
            message: 'Tidak ada data migrasi.',
          },
          400
        );
      }

      if (records.length > 100) {
        return json(
          {
            status: 'error',
            message: 'Maksimal 100 baris per batch.',
          },
          400
        );
      }

      const conn = connect({
        url: databaseUrl,
      });

      let sukses = 0;
      const gagal: Array<{
        index: number;
        id_user?: string;
        tanggal?: string;
        message: string;
      }> = [];

      for (let i = 0; i < records.length; i++) {
        const item = records[i] || ({} as MigrationRecord);

        const idUser = String(item.id_user || '').trim();
        const tanggal = String(item.tanggal || '').trim();

        const jamMasuk = cleanNullable(item.jam_masuk);
        const jamPulang = cleanNullable(item.jam_pulang);

        const keterangan =
          cleanNullable(item.keterangan) || '-';

        const fotoMasuk =
          cleanNullable(item.foto_masuk_file_id);

        const fotoPulang =
          cleanNullable(item.foto_pulang_file_id);

        const status = resolveStatus(
          jamMasuk,
          jamPulang,
          cleanNullable(item.status)
        );

        if (!idUser) {
          gagal.push({
            index: i,
            tanggal,
            message: 'id_user kosong.',
          });
          continue;
        }

        if (!validDate(tanggal)) {
          gagal.push({
            index: i,
            id_user: idUser,
            tanggal,
            message: 'Format tanggal tidak valid.',
          });
          continue;
        }

        if (!validTime(jamMasuk) || !validTime(jamPulang)) {
          gagal.push({
            index: i,
            id_user: idUser,
            tanggal,
            message: 'Format jam tidak valid.',
          });
          continue;
        }

        try {
          await conn.execute(
            `
              INSERT INTO absensi
              (
                id_user,
                tanggal,
                jam_masuk,
                jam_pulang,
                status,
                keterangan,
                foto_masuk_file_id,
                foto_pulang_file_id
              )
              VALUES
              (
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?
              )
              ON DUPLICATE KEY UPDATE

                jam_masuk =
                  COALESCE(
                    VALUES(jam_masuk),
                    jam_masuk
                  ),

                jam_pulang =
                  COALESCE(
                    VALUES(jam_pulang),
                    jam_pulang
                  ),

                keterangan =
                  CASE
                    WHEN
                      VALUES(keterangan) IS NULL
                      OR VALUES(keterangan) = ''
                    THEN keterangan
                    ELSE VALUES(keterangan)
                  END,

                foto_masuk_file_id =
                  COALESCE(
                    VALUES(foto_masuk_file_id),
                    foto_masuk_file_id
                  ),

                foto_pulang_file_id =
                  COALESCE(
                    VALUES(foto_pulang_file_id),
                    foto_pulang_file_id
                  ),

                status =
                  CASE
                    WHEN
                      COALESCE(
                        VALUES(jam_pulang),
                        jam_pulang
                      ) IS NOT NULL
                    THEN 'MASUK & PULANG'

                    WHEN
                      COALESCE(
                        VALUES(jam_masuk),
                        jam_masuk
                      ) IS NOT NULL
                    THEN 'MASUK'

                    ELSE VALUES(status)
                  END,

                updated_at =
                  CURRENT_TIMESTAMP
            `,
            [
              idUser,
              tanggal,
              jamMasuk,
              jamPulang,
              status,
              keterangan,
              fotoMasuk,
              fotoPulang,
            ]
          );

          sukses++;
        } catch (error) {
          gagal.push({
            index: i,
            id_user: idUser,
            tanggal,
            message:
              error instanceof Error
                ? error.message
                : String(error),
          });
        }
      }

      return json({
        status: gagal.length === 0 ? 'success' : 'partial',
        diterima: records.length,
        sukses,
        gagal: gagal.length,
        detail_gagal: gagal.slice(0, 20),
      });
    } catch (error) {
      console.error('MIGRATION API ERROR:', error);

      return json(
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
