export const runtime = 'nodejs';
export const maxDuration = 300;

import { connect } from '@tidbcloud/serverless';

type AbsenStatus = 'MASUK' | 'PULANG';

const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || '*')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);


// ======================================================
// CORS
// - Origin GitHub Pages akun yohandeku32 diizinkan secara default
// - Custom domain dapat ditambahkan melalui ALLOWED_ORIGINS
// ======================================================

function getCorsHeaders(
  request: Request
) {
  const origin =
    request.headers.get('Origin') || '';

  const allowedOrigin =
    ALLOWED_ORIGINS.has('*')
      ? '*'
      : ALLOWED_ORIGINS.has(origin)
        ? origin
        : '*';

  return {
    'Access-Control-Allow-Origin':
      allowedOrigin,

    'Access-Control-Allow-Methods':
      'GET, POST, DELETE, OPTIONS',

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
      headers: {
        ...getCorsHeaders(request),
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0'
      }
    }
  );
}


// ======================================================
// API UTAMA
// ======================================================

async function handleRequest(request: Request) {

    // ==================================================
    // CORS PREFLIGHT
    // ==================================================

    if (request.method === 'OPTIONS') {
      return new Response(
        null,
        {
          status: 204,
          headers: getCorsHeaders(request),
        }
      );
    }


    try {

      const databaseUrl =
        process.env.DATABASE_URL;

      const appsScriptUrl =
        process.env.APPS_SCRIPT_URL;


      if (!databaseUrl) {
        return json(request, 
          {
            status: 'error',
            message:
              'DATABASE_URL belum ditemukan di Vercel.',
          },
          500
        );
      }


      const conn = connect({
        url: databaseUrl,
      });


      const url =
        new URL(request.url);


      // ==================================================
      // GET
      // MEMBACA DATA ABSENSI DARI TIDB
      // ==================================================

      if (request.method === 'GET') {

        const bulan =
          url.searchParams.get('bulan');

        const tahun =
          url.searchParams.get('tahun');

        const idUser =
          url.searchParams.get('id_user');


        let sql = `
          SELECT
            a.id_user,

            g.nama AS name,

            DATE_FORMAT(
              a.tanggal,
              '%Y-%m-%d'
            ) AS date,

            CASE

              WHEN
                a.jam_masuk IS NOT NULL
                AND
                a.jam_pulang IS NOT NULL

              THEN CONCAT(
                TIME_FORMAT(
                  a.jam_masuk,
                  '%H:%i'
                ),
                ' - ',
                TIME_FORMAT(
                  a.jam_pulang,
                  '%H:%i'
                )
              )


              WHEN
                a.jam_masuk IS NOT NULL

              THEN
                TIME_FORMAT(
                  a.jam_masuk,
                  '%H:%i'
                )


              WHEN
                a.jam_pulang IS NOT NULL

              THEN
                TIME_FORMAT(
                  a.jam_pulang,
                  '%H:%i'
                )


              ELSE ''

            END AS time,


            TIME_FORMAT(
              a.jam_masuk,
              '%H:%i'
            ) AS jam_masuk,


            TIME_FORMAT(
              a.jam_pulang,
              '%H:%i'
            ) AS jam_pulang,


            a.status,

            a.keterangan,


            a.foto_masuk_file_id,

            a.foto_pulang_file_id,


            g.nip,

            g.nik,

            g.status_kepegawaian,

            g.pangkat,

            g.golongan_ruang,

            g.jabatan,

            g.role


          FROM absensi a


          INNER JOIN guru g

            ON g.id_user = a.id_user


          WHERE g.aktif = 1
        `;


        const params: any[] = [];


        // ----------------------------------------------
        // FILTER USER
        // ----------------------------------------------

        if (idUser) {

          sql += `
            AND a.id_user = ?
          `;

          params.push(idUser);
        }


        // ----------------------------------------------
        // FILTER BULAN
        // ----------------------------------------------

        if (bulan) {

          const nomorBulan =
            Number(bulan);

          if (
            !Number.isInteger(nomorBulan) ||
            nomorBulan < 1 ||
            nomorBulan > 12
          ) {
            return json(request, 
              {
                status: 'error',
                message:
                  'Bulan tidak valid.',
              },
              400
            );
          }

          sql += `
            AND MONTH(a.tanggal) = ?
          `;

          params.push(nomorBulan);
        }


        // ----------------------------------------------
        // FILTER TAHUN
        // ----------------------------------------------

        if (tahun) {

          const nomorTahun =
            Number(tahun);

          if (
            !Number.isInteger(nomorTahun) ||
            nomorTahun < 2000 ||
            nomorTahun > 2100
          ) {
            return json(request, 
              {
                status: 'error',
                message:
                  'Tahun tidak valid.',
              },
              400
            );
          }

          sql += `
            AND YEAR(a.tanggal) = ?
          `;

          params.push(nomorTahun);
        }


        sql += `
          ORDER BY
            g.nama ASC,
            a.tanggal ASC
        `;


        const data =
          await conn.execute(
            sql,
            params
          );


        // Tetap ARRAY agar cocok
        // dengan App.tsx lama
        return json(request, data);
      }





      // ==================================================
      // DELETE
      // HAPUS SATU DATA ABSENSI + FOTO GOOGLE DRIVE
      // KUNCI DATA: id_user + tanggal
      // ==================================================

      if (request.method === 'DELETE') {

        const idUser =
          String(
            url.searchParams.get('id_user') || ''
          ).trim();

        const tanggal =
          String(
            url.searchParams.get('tanggal') || ''
          ).trim();


        if (!idUser || !tanggal) {
          return json(request, 
            {
              status: 'error',
              message:
                'id_user dan tanggal wajib diisi.',
            },
            400
          );
        }


        if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
          return json(request, 
            {
              status: 'error',
              message:
                'Format tanggal tidak valid.',
            },
            400
          );
        }


        const existing =
          await conn.execute(
            `
              SELECT
                a.id,
                a.foto_masuk_file_id,
                a.foto_pulang_file_id
              FROM absensi a
              WHERE
                a.id_user = ?
                AND a.tanggal = ?
              LIMIT 1
            `,
            [
              idUser,
              tanggal
            ]
          ) as any[];


        if (
          !Array.isArray(existing) ||
          existing.length === 0
        ) {
          return json(request, 
            {
              status: 'error',
              message:
                'Data absensi tidak ditemukan.',
            },
            404
          );
        }


        const row =
          existing[0];


        const fileIds =
          [
            row.foto_masuk_file_id,
            row.foto_pulang_file_id
          ]
            .filter(Boolean)
            .map((value) => String(value));


        // Hapus data TiDB terlebih dahulu.
        await conn.execute(
          `
            DELETE FROM absensi
            WHERE
              id_user = ?
              AND tanggal = ?
          `,
          [
            idUser,
            tanggal
          ]
        );


        // Foto dipindahkan ke Sampah Google Drive.
        // Jika gagal, data TiDB tetap dianggap sudah terhapus.
        let fotoWarning:
          string | null = null;


        if (
          appsScriptUrl &&
          fileIds.length > 0
        ) {

          const hasilHapusFoto =
            await hapusFotoDrive(
              appsScriptUrl,
              fileIds
            );


          if (
            hasilHapusFoto.status !==
            'success'
          ) {
            fotoWarning =
              hasilHapusFoto.message ||
              'Foto Google Drive tidak dapat dihapus.';
          }
        }


        return json(request, {
          status:
            'success',

          message:
            fotoWarning

              ? 'Data absensi berhasil dihapus dari TiDB, tetapi ada foto Drive yang tidak dapat dipindahkan ke Sampah.'

              : 'Data absensi dan foto berhasil dihapus.',

          warning:
            fotoWarning
        });
      }


      // ==================================================
      // POST
      // MENYIMPAN ABSENSI
      // ==================================================

      if (request.method === 'POST') {


        if (!appsScriptUrl) {

          return json(request, 
            {
              status: 'error',
              message:
                'APPS_SCRIPT_URL belum ditemukan di Vercel.',
            },
            500
          );
        }


        // ----------------------------------------------
        // BACA BODY JSON
        // ----------------------------------------------

        let body: any;

        try {

          body =
            await request.json();

        } catch {

          return json(request, 
            {
              status: 'error',
              message:
                'Body request bukan JSON yang valid.',
            },
            400
          );
        }


        const idUser =
          String(
            body.id_user || ''
          ).trim();


        const tanggal =
          String(
            body.date || ''
          ).trim();


        let jam =
          String(
            body.time || ''
          ).trim();


        const status = String(
          body.status || ''
        )
          .trim()
          .toUpperCase() as AbsenStatus;


        const photo =
          String(
            body.photo || ''
          );


        const keterangan =
          String(
            body.note ||
            body.keterangan ||
            '-'
          ).trim() || '-';


        const adminManual =
          body.admin_manual === true ||
          String(body.action || '')
            .trim()
            .toLowerCase() === 'admin_manual_upload';


        const manualNote =
          String(
            body.note ||
            body.keterangan ||
            ''
          ).trim();



        // ==================================================
        // NORMALISASI JAM
        // ==================================================

        jam =
          jam.replace(
            /\./g,
            ':'
          );



        // ==================================================
        // VALIDASI DATA WAJIB
        // ==================================================

        if (
          !idUser ||
          !tanggal ||
          !status ||
          !photo ||
          (!adminManual && !jam)
        ) {

          return json(request, 
            {
              status: 'error',
              message:
                adminManual
                  ? 'Guru, tanggal, status, dan foto wajib diisi.'
                  : 'Data absensi belum lengkap.',
            },
            400
          );
        }



        // ==================================================
        // VALIDASI STATUS
        // ==================================================

        if (
          status !== 'MASUK' &&
          status !== 'PULANG'
        ) {

          return json(request, 
            {
              status: 'error',
              message:
                'Status absensi tidak valid.',
            },
            400
          );
        }



        // ==================================================
        // VALIDASI TANGGAL
        // ==================================================

        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(
            tanggal
          )
        ) {

          return json(request, 
            {
              status: 'error',
              message:
                'Format tanggal tidak valid.',
            },
            400
          );
        }



        // ==================================================
        // VALIDASI JAM
        // ==================================================

        if (
          jam &&
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(
            jam
          )
        ) {

          return json(request, 
            {
              status: 'error',
              message:
                'Format jam tidak valid.',
            },
            400
          );
        }



        // ==================================================
        // VALIDASI FOTO BASE64
        // ==================================================

        if (
          !photo.startsWith(
            'data:image/'
          )
        ) {

          return json(request, 
            {
              status: 'error',
              message:
                'Format foto tidak valid.',
            },
            400
          );
        }



        // ==================================================
        // CEK DATA GURU
        // ==================================================

        const guruRows =
          await conn.execute(
            `
              SELECT
                id_user,
                nama,
                aktif

              FROM guru

              WHERE
                id_user = ?
                AND aktif = 1

              LIMIT 1
            `,
            [
              idUser
            ]
          ) as any[];


        if (
          !Array.isArray(guruRows) ||
          guruRows.length === 0
        ) {

          return json(request, 
            {
              status: 'error',
              message:
                'Data guru tidak ditemukan.',
            },
            404
          );
        }


        const guru =
          guruRows[0];


        const namaGuru =
          String(
            guru.nama
          );



        // ==================================================
        // CEK ABSENSI GURU PADA TANGGAL TERSEBUT
        // ==================================================

        const absenRows =
          await conn.execute(
            `
              SELECT

                id,

                jam_masuk,

                jam_pulang,

                status,

                keterangan,

                foto_masuk_file_id,

                foto_pulang_file_id


              FROM absensi


              WHERE
                id_user = ?
                AND tanggal = ?


              LIMIT 1
            `,
            [
              idUser,
              tanggal
            ]
          ) as any[];


        const absenHariIni =
          Array.isArray(absenRows) &&
          absenRows.length > 0

            ? absenRows[0]

            : null;



        // ==================================================
        // UPLOAD MANUAL OLEH ADMIN
        // - Boleh memilih tanggal lama
        // - Jam boleh kosong
        // - Bisa mengisi Foto Masuk saja / Foto Pulang saja
        // - Jika data sudah ada, bagian yang dipilih akan diperbarui
        // ==================================================

        if (adminManual) {

          const hasilFoto =
            await uploadFoto(
              appsScriptUrl,
              {
                id_user:
                  idUser,

                name:
                  namaGuru,

                date:
                  tanggal,

                status:
                  status,

                photo:
                  photo,
              }
            );


          if (
            hasilFoto.status !== 'success' ||
            !hasilFoto.file_id
          ) {

            return json(request, 
              {
                status: 'error',
                message:
                  hasilFoto.message ||
                  'Foto manual gagal disimpan ke Google Drive.',
              },
              500
            );
          }


          // ----------------------------------------------
          // FOTO MASUK MANUAL
          // ----------------------------------------------

          if (status === 'MASUK') {

            if (absenHariIni) {

              const statusBaru =
                absenHariIni.jam_pulang ||
                absenHariIni.foto_pulang_file_id

                  ? 'MASUK & PULANG'
                  : 'MASUK';


              await conn.execute(
                `
                  UPDATE absensi

                  SET
                    jam_masuk = ?,
                    foto_masuk_file_id = ?,
                    status = ?,
                    keterangan = ?,
                    updated_at = CURRENT_TIMESTAMP

                  WHERE
                    id_user = ?
                    AND tanggal = ?
                `,
                [
                  jam || absenHariIni.jam_masuk || null,
                  hasilFoto.file_id,
                  statusBaru,
                  manualNote || absenHariIni.keterangan || '-',
                  idUser,
                  tanggal
                ]
              );

            } else {

              await conn.execute(
                `
                  INSERT INTO absensi
                  (
                    id_user,
                    tanggal,
                    jam_masuk,
                    status,
                    keterangan,
                    foto_masuk_file_id
                  )

                  VALUES
                  (
                    ?,
                    ?,
                    ?,
                    'MASUK',
                    ?,
                    ?
                  )
                `,
                [
                  idUser,
                  tanggal,
                  jam || null,
                  manualNote || '-',
                  hasilFoto.file_id
                ]
              );
            }


            return json(request, {
              status: 'success',
              message:
                'Foto MASUK manual berhasil disimpan.',
              data: {
                id_user: idUser,
                name: namaGuru,
                date: tanggal,
                status: 'MASUK',
                foto_masuk_file_id:
                  hasilFoto.file_id
              }
            });
          }


          // ----------------------------------------------
          // FOTO PULANG MANUAL
          // ----------------------------------------------

          if (status === 'PULANG') {

            if (absenHariIni) {

              const statusBaru =
                absenHariIni.jam_masuk ||
                absenHariIni.foto_masuk_file_id

                  ? 'MASUK & PULANG'
                  : 'PULANG';


              await conn.execute(
                `
                  UPDATE absensi

                  SET
                    jam_pulang = ?,
                    foto_pulang_file_id = ?,
                    status = ?,
                    keterangan = ?,
                    updated_at = CURRENT_TIMESTAMP

                  WHERE
                    id_user = ?
                    AND tanggal = ?
                `,
                [
                  jam || absenHariIni.jam_pulang || null,
                  hasilFoto.file_id,
                  statusBaru,
                  manualNote || absenHariIni.keterangan || '-',
                  idUser,
                  tanggal
                ]
              );

            } else {

              await conn.execute(
                `
                  INSERT INTO absensi
                  (
                    id_user,
                    tanggal,
                    jam_pulang,
                    status,
                    keterangan,
                    foto_pulang_file_id
                  )

                  VALUES
                  (
                    ?,
                    ?,
                    ?,
                    'PULANG',
                    ?,
                    ?
                  )
                `,
                [
                  idUser,
                  tanggal,
                  jam || null,
                  manualNote || '-',
                  hasilFoto.file_id
                ]
              );
            }


            return json(request, {
              status: 'success',
              message:
                'Foto PULANG manual berhasil disimpan.',
              data: {
                id_user: idUser,
                name: namaGuru,
                date: tanggal,
                status: 'PULANG',
                foto_pulang_file_id:
                  hasilFoto.file_id
              }
            });
          }
        }


        // ==================================================
        // ABSEN MASUK
        // ==================================================

        if (
          status === 'MASUK'
        ) {


          // ----------------------------------------------
          // CEGAH MASUK DUA KALI
          // ----------------------------------------------

          if (
            absenHariIni &&
            absenHariIni.jam_masuk
          ) {

            return json(request, 
              {
                status: 'error',
                message:
                  'Anda sudah melakukan absen MASUK hari ini.',
              },
              409
            );
          }



          // ----------------------------------------------
          // UPLOAD FOTO MASUK
          // GOOGLE DRIVE VIA APPS SCRIPT
          // ----------------------------------------------

          const hasilFoto =
            await uploadFoto(
              appsScriptUrl,
              {
                id_user:
                  idUser,

                name:
                  namaGuru,

                date:
                  tanggal,

                status:
                  'MASUK',

                photo:
                  photo,
              }
            );



          if (
            hasilFoto.status !== 'success' ||
            !hasilFoto.file_id
          ) {

            return json(request, 
              {
                status: 'error',

                message:
                  hasilFoto.message ||
                  'Foto masuk gagal disimpan ke Google Drive.',
              },
              500
            );
          }



          // ----------------------------------------------
          // SIMPAN ABSENSI KE TIDB
          // ----------------------------------------------

          try {

            await conn.execute(
              `
                INSERT INTO absensi
                (
                  id_user,
                  tanggal,
                  jam_masuk,
                  status,
                  keterangan,
                  foto_masuk_file_id
                )

                VALUES
                (
                  ?,
                  ?,
                  ?,
                  'MASUK',
                  ?,
                  ?
                )
              `,
              [
                idUser,
                tanggal,
                jam,
                keterangan,
                hasilFoto.file_id
              ]
            );

          } catch (error) {

            console.error(
              'INSERT ABSENSI ERROR:',
              error
            );

            return json(request, 
              {
                status: 'error',
                message:
                  'Data absensi gagal disimpan ke TiDB.',
              },
              500
            );
          }



          return json(request, {
            status:
              'success',

            message:
              'Absensi MASUK berhasil disimpan.',

            data: {

              id_user:
                idUser,

              name:
                namaGuru,

              date:
                tanggal,

              time:
                jam,

              jam_masuk:
                jam,

              jam_pulang:
                null,

              status:
                'MASUK',

              keterangan:
                keterangan,

              foto_masuk_file_id:
                hasilFoto.file_id,

              foto_pulang_file_id:
                null
            }
          });
        }



        // ==================================================
        // ABSEN PULANG
        // TIDAK WAJIB SUDAH ABSEN MASUK
        // ==================================================

        if (
          status === 'PULANG'
        ) {


          // ----------------------------------------------
          // CEGAH PULANG DUA KALI
          // ----------------------------------------------

          if (
            absenHariIni &&
            absenHariIni.jam_pulang
          ) {

            return json(request,
              {
                status: 'error',
                message:
                  'Anda sudah melakukan absen PULANG hari ini.',
              },
              409
            );
          }



          // ----------------------------------------------
          // UPLOAD FOTO PULANG
          // ----------------------------------------------

          const hasilFoto =
            await uploadFoto(
              appsScriptUrl,
              {
                id_user:
                  idUser,

                name:
                  namaGuru,

                date:
                  tanggal,

                status:
                  'PULANG',

                photo:
                  photo,
              }
            );



          if (
            hasilFoto.status !== 'success' ||
            !hasilFoto.file_id
          ) {

            return json(request,
              {
                status: 'error',

                message:
                  hasilFoto.message ||
                  'Foto pulang gagal disimpan ke Google Drive.',
              },
              500
            );
          }



          // ----------------------------------------------
          // JIKA SUDAH ADA DATA HARI INI -> UPDATE
          // ----------------------------------------------

          if (absenHariIni) {

            const punyaMasuk =
              Boolean(absenHariIni.jam_masuk);

            const statusBaru =
              punyaMasuk
                ? 'MASUK & PULANG'
                : 'PULANG';


            await conn.execute(
              `
                UPDATE absensi

                SET
                  jam_pulang = ?,
                  status = ?,
                  keterangan = ?,
                  foto_pulang_file_id = ?,
                  updated_at = CURRENT_TIMESTAMP

                WHERE
                  id_user = ?
                  AND tanggal = ?
              `,
              [
                jam,
                statusBaru,
                keterangan,
                hasilFoto.file_id,
                idUser,
                tanggal
              ]
            );


            const jamMasuk =
              punyaMasuk
                ? formatJam(absenHariIni.jam_masuk)
                : null;


            return json(request, {
              status:
                'success',

              message:
                'Absensi PULANG berhasil disimpan.',

              data: {
                id_user:
                  idUser,

                name:
                  namaGuru,

                date:
                  tanggal,

                time:
                  jamMasuk
                    ? jamMasuk + ' - ' + jam
                    : jam,

                jam_masuk:
                  jamMasuk,

                jam_pulang:
                  jam,

                status:
                  statusBaru,

                keterangan:
                  keterangan,

                foto_masuk_file_id:
                  absenHariIni.foto_masuk_file_id || null,

                foto_pulang_file_id:
                  hasilFoto.file_id
              }
            });
          }



          // ----------------------------------------------
          // BELUM ADA ABSEN HARI INI
          // BOLEH LANGSUNG ABSEN PULANG
          // ----------------------------------------------

          await conn.execute(
            `
              INSERT INTO absensi
              (
                id_user,
                tanggal,
                jam_pulang,
                status,
                keterangan,
                foto_pulang_file_id
              )

              VALUES
              (
                ?,
                ?,
                ?,
                'PULANG',
                ?,
                ?
              )
            `,
            [
              idUser,
              tanggal,
              jam,
              keterangan,
              hasilFoto.file_id
            ]
          );


          return json(request, {
            status:
              'success',

            message:
              'Absensi PULANG berhasil disimpan.',

            data: {
              id_user:
                idUser,

              name:
                namaGuru,

              date:
                tanggal,

              time:
                jam,

              jam_masuk:
                null,

              jam_pulang:
                jam,

              status:
                'PULANG',

              keterangan:
                keterangan,

              foto_masuk_file_id:
                null,

              foto_pulang_file_id:
                hasilFoto.file_id
            }
          });
        }
      }



      // ==================================================
      // METHOD TIDAK DIDUKUNG
      // ==================================================

      return json(request, 
        {
          status:
            'error',

          message:
            'Method tidak didukung.',
        },
        405
      );


    } catch (error) {

      console.error(
        'API ABSENSI ERROR:',
        error
      );


      return json(request, 
        {
          status:
            'error',

          message:
            error instanceof Error

              ? error.message

              : String(error),
        },
        500
      );
    }
  }
}





// ======================================================
// HAPUS FOTO GOOGLE DRIVE MELALUI APPS SCRIPT
// FOTO DIPINDAHKAN KE SAMPAH, BUKAN HAPUS PERMANEN
// ======================================================

async function hapusFotoDrive(
  appsScriptUrl: string,
  fileIds: string[]
) {

  try {

    const response =
      await fetch(
        appsScriptUrl,
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'text/plain;charset=utf-8',
          },

          body:
            JSON.stringify({
              action:
                'trash_photos_by_ids',

              file_ids:
                fileIds,
            }),
        }
      );


    const text =
      await response.text();


    try {

      return JSON.parse(
        text
      );

    } catch {

      console.error(
        'RESPONSE HAPUS FOTO APPS SCRIPT:',
        text
      );

      return {
        status:
          'error',

        message:
          'Response Apps Script bukan JSON.',
      };
    }


  } catch (error) {

    console.error(
      'HAPUS FOTO DRIVE ERROR:',
      error
    );


    return {
      status:
        'error',

      message:
        error instanceof Error

          ? error.message

          : String(error),
    };
  }
}

// ======================================================
// UPLOAD FOTO KE GOOGLE APPS SCRIPT
// ======================================================

let driveUploadQueue: Promise<void> = Promise.resolve();
let driveUploadLastCompletedAt = 0;

async function uploadFoto(
  appsScriptUrl: string,
  data: {
    id_user: string;
    name: string;
    date: string;
    status: AbsenStatus;
    photo: string;
  }
) {
  const waitForPrevious = driveUploadQueue.catch(() => undefined);

  let releaseQueue!: () => void;

  driveUploadQueue = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });

  await waitForPrevious;

  const MIN_SERVER_UPLOAD_GAP_MS = 1500;

  const elapsed =
    Date.now() -
    driveUploadLastCompletedAt;

  if (
    driveUploadLastCompletedAt > 0 &&
    elapsed < MIN_SERVER_UPLOAD_GAP_MS
  ) {
    await new Promise<void>((resolve) => {
      setTimeout(
        resolve,
        MIN_SERVER_UPLOAD_GAP_MS - elapsed
      );
    });
  }

  try {
    return await uploadFotoNow(
      appsScriptUrl,
      data
    );
  } finally {
    driveUploadLastCompletedAt = Date.now();
    releaseQueue();
  }
}

async function uploadFotoNow(
  appsScriptUrl: string,

  data: {

    id_user:
      string;

    name:
      string;

    date:
      string;

    status:
      AbsenStatus;

    photo:
      string;
  }
) {

  const controller =
    new AbortController();

  const timeoutId =
    setTimeout(() => {
      controller.abort();
    }, 90000);

  try {

    const response =
      await fetch(
        appsScriptUrl,
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'text/plain;charset=utf-8',
          },

          body:
            JSON.stringify({
              action:
                'upload_photo_only',

              id_user:
                data.id_user,

              name:
                data.name,

              date:
                data.date,

              status:
                data.status,

              photo:
                data.photo,
            }),

          signal:
            controller.signal,
        }
      );

    const responseText =
      await response.text();

    let result: any;

    try {

      result =
        JSON.parse(
          responseText
        );

    } catch {

      console.error(
        'RESPONSE APPS SCRIPT:',
        responseText
      );

      return {
        status:
          'error',

        message:
          response.ok
            ? 'Response Apps Script bukan JSON.'
            : `Apps Script HTTP ${response.status}: response tidak valid.`,
      };
    }

    if (!response.ok) {

      return {
        status:
          'error',

        message:
          result?.message ||
          `Apps Script gagal memproses upload (HTTP ${response.status}).`,
      };
    }

    if (
      !result ||
      result.status !==
        'success' ||
      !result.file_id
    ) {

      return {
        status:
          'error',

        message:
          result?.message ||
          'Google Drive belum mengembalikan file ID foto.',
      };
    }

    /*
     * Beri waktu singkat agar file Google Drive
     * selesai dipropagasikan sebelum file ID disimpan
     * dan dibaca kembali oleh dashboard.
     */
    await new Promise<void>((resolve) => {
      setTimeout(
        resolve,
        1200
      );
    });

    return result;

  } catch (error) {

    console.error(
      'UPLOAD FOTO ERROR:',
      error
    );

    if (
      error instanceof DOMException &&
      error.name === 'AbortError'
    ) {

      return {
        status:
          'error',

        message:
          'Upload foto ke Google Drive terlalu lama dan dihentikan. Silakan coba lagi.',
      };
    }

    return {

      status:
        'error',

      message:
        error instanceof Error

          ? error.message

          : String(error),
    };

  } finally {

    clearTimeout(
      timeoutId
    );
  }
}


// ======================================================
// FORMAT TIME TIDB MENJADI HH:MM
// ======================================================

function formatJam(
  value: unknown
) {

  if (!value) {
    return '';
  }


  const text =
    String(value);


  if (
    /^\d{2}:\d{2}/.test(
      text
    )
  ) {

    return text.substring(
      0,
      5
    );
  }


  return text;
}


export async function GET(
  request: Request
) {
  return handleRequest(request);
}

export async function POST(
  request: Request
) {
  return handleRequest(request);
}

export async function DELETE(
  request: Request
) {
  return handleRequest(request);
}

export async function OPTIONS(
  request: Request
) {
  return handleRequest(request);
}
