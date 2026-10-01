import { connect } from '@tidbcloud/serverless';
import { SCHOOL_CONFIG } from './school-config';
import ExcelJS from 'exceljs';

type RowData = {
  id_user: string;
  name: string;
  date: string;
  time?: string | null;
  jam_masuk?: string | null;
  jam_pulang?: string | null;
  status?: string | null;
  keterangan?: string | null;
  foto_masuk_file_id?: string | null;
  foto_pulang_file_id?: string | null;
  nip?: string | null;
  nik?: string | null;
  status_kepegawaian?: string | null;
  golongan_ruang?: string | null;
  jabatan?: string | null;
  role?: string | null;
};

type PhotoItem = {
  status: 'success' | 'error';
  file_id: string;
  file_name?: string;
  mime_type?: string;
  base64?: string;
  message?: string;
};

type PhotoBatchPayload = {
  status: string;
  message?: string;
  photos?: PhotoItem[];
};

const MONTHS: Record<string, string> = {
  '01': 'Januari',
  '02': 'Februari',
  '03': 'Maret',
  '04': 'April',
  '05': 'Mei',
  '06': 'Juni',
  '07': 'Juli',
  '08': 'Agustus',
  '09': 'September',
  '10': 'Oktober',
  '11': 'November',
  '12': 'Desember'
};


function corsJson(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Cache-Control', 'no-store');

  return Response.json(data, {
    ...init,
    headers
  });
}

function badRequest(message: string) {
  return corsJson(
    { status: 'error', message },
    { status: 400 }
  );
}

function formatDateIndonesia(value: string) {
  const parts = String(value).split('-');
  if (parts.length !== 3) return value || '-';
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function escapeFileName(value: string) {
  return value
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '_');
}

function parseTimeFromCombined(
  time: string | null | undefined,
  status: string | null | undefined,
  target: 'masuk' | 'pulang'
) {
  const text = String(time || '');
  const parts = text.split(' - ');

  if (status === 'MASUK & PULANG') {
    return target === 'masuk' ? parts[0] || null : parts[1] || null;
  }

  if (status === 'PULANG') {
    return target === 'pulang' ? parts[0] || null : null;
  }

  return target === 'masuk' ? parts[0] || null : null;
}

function normalizeJam(row: RowData) {
  return {
    masuk:
      row.jam_masuk ||
      parseTimeFromCombined(row.time, row.status, 'masuk') ||
      '-',

    pulang:
      row.jam_pulang ||
      parseTimeFromCombined(row.time, row.status, 'pulang') ||
      '-'
  };
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }

  return chunks;
}

async function fetchPhotoBatch(
  appsScriptUrl: string,
  fileIds: string[]
) {
  const response = await fetch(appsScriptUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify({
      action: 'get_photos_base64',
      file_ids: fileIds
    })
  });

  const text = await response.text();

  let result: PhotoBatchPayload;

  try {
    result = JSON.parse(text) as PhotoBatchPayload;
  } catch {
    throw new Error('Response foto dari Apps Script bukan JSON.');
  }

  if (result.status !== 'success' || !Array.isArray(result.photos)) {
    throw new Error(
      result.message ||
      'Apps Script gagal mengambil foto dari Google Drive.'
    );
  }

  return result.photos;
}

const PHOTO_BATCH_SIZE = 20;
const PHOTO_CONCURRENCY = 3;

async function fetchPhotoBatchWithRetry(
  appsScriptUrl: string,
  fileIds: string[],
  maxAttempts = 2
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fetchPhotoBatch(
        appsScriptUrl,
        fileIds
      );
    } catch (error) {
      lastError = error;

      if (attempt < maxAttempts) {
        await new Promise((resolve) =>
          setTimeout(resolve, 500 * attempt)
        );
      }
    }
  }

  throw lastError;
}

async function fetchAllPhotos(
  appsScriptUrl: string,
  fileIds: string[]
) {
  const photoMap = new Map<string, PhotoItem>();

  /*
   * OPTIMASI:
   * - 20 foto per request
   * - 3 batch diproses paralel
   * - retry 1x jika Apps Script sementara gagal
   *
   * Jadi maksimal sekitar 60 foto sedang diproses
   * dalam satu gelombang, bukan menunggu batch satu per satu.
   */
  const batches =
    chunkArray(
      fileIds,
      PHOTO_BATCH_SIZE
    );

  for (
    let i = 0;
    i < batches.length;
    i += PHOTO_CONCURRENCY
  ) {
    const wave =
      batches.slice(
        i,
        i + PHOTO_CONCURRENCY
      );

    const results =
      await Promise.all(
        wave.map((batch) =>
          fetchPhotoBatchWithRetry(
            appsScriptUrl,
            batch
          )
        )
      );

    results
      .flat()
      .forEach((photo) => {
        photoMap.set(
          photo.file_id,
          photo
        );
      });
  }

  return photoMap;
}

function excelImageExtension(
  mimeType?: string
): 'jpeg' | 'png' | null {
  const mime = String(mimeType || '').toLowerCase();

  if (mime.includes('png')) return 'png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpeg';

  return null;
}

function applyBorderAndAlignment(
  row: ExcelJS.Row
) {
  for (let col = 1; col <= 14; col++) {
    const cell = row.getCell(col);

    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };

    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true
    };
  }

  row.getCell(2).alignment = {
    horizontal: 'left',
    vertical: 'middle',
    wrapText: true
  };

  row.getCell(7).alignment = {
    horizontal: 'left',
    vertical: 'middle',
    wrapText: true
  };

  row.getCell(12).alignment = {
    horizontal: 'left',
    vertical: 'middle',
    wrapText: true
  };
}

function addPhotoToSheet(
  workbook: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
  photo: PhotoItem | undefined,
  columnIndexZeroBased: number,
  rowNumberOneBased: number
) {
  if (
    !photo ||
    photo.status !== 'success' ||
    !photo.base64 ||
    !photo.mime_type
  ) {
    return;
  }

  const extension =
    excelImageExtension(photo.mime_type);

  if (!extension) {
    return;
  }

  const imageId = workbook.addImage({
    base64:
      `data:${photo.mime_type};base64,${photo.base64}`,
    extension
  });

  /*
   * row/col ExcelJS memakai koordinat 0-based.
   * Foto dibuat sekitar 92x118 px agar pas di sel laporan.
   */
  sheet.addImage(imageId, {
    tl: {
      col: columnIndexZeroBased + 0.08,
      row: rowNumberOneBased - 1 + 0.05
    },
    ext: {
      width: 92,
      height: 118
    }
  });
}

function streamBytes(bytes: Uint8Array) {
  let offset = 0;
  const chunkSize = 64 * 1024;

  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close();
        return;
      }

      const end =
        Math.min(
          offset + chunkSize,
          bytes.byteLength
        );

      controller.enqueue(
        bytes.subarray(offset, end)
      );

      offset = end;
    }
  });
}

export default {
  async fetch(request: Request) {
    if (request.method !== 'GET') {
      return corsJson(
        {
          status: 'error',
          message: 'Method tidak didukung.'
        },
        { status: 405 }
      );
    }

    try {
      const databaseUrl =
        process.env.DATABASE_URL;

      const appsScriptUrl =
        process.env.APPS_SCRIPT_URL;

      if (!databaseUrl) {
        return corsJson(
          {
            status: 'error',
            message:
              'DATABASE_URL belum ditemukan di Vercel.'
          },
          { status: 500 }
        );
      }

      if (!appsScriptUrl) {
        return corsJson(
          {
            status: 'error',
            message:
              'APPS_SCRIPT_URL belum ditemukan di Vercel.'
          },
          { status: 500 }
        );
      }

      const url = new URL(request.url);

      const bulan =
        url.searchParams.get('bulan') || '';

      const tahun =
        url.searchParams.get('tahun') || '';

      const idUser =
        url.searchParams.get('id_user') || '';

      if (!/^(0[1-9]|1[0-2])$/.test(bulan)) {
        return badRequest(
          'Parameter bulan tidak valid.'
        );
      }

      if (!/^\d{4}$/.test(tahun)) {
        return badRequest(
          'Parameter tahun tidak valid.'
        );
      }

      const conn = connect({
        url: databaseUrl
      });

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
              AND a.jam_pulang IS NOT NULL
            THEN CONCAT(
              TIME_FORMAT(a.jam_masuk, '%H:%i'),
              ' - ',
              TIME_FORMAT(a.jam_pulang, '%H:%i')
            )

            WHEN a.jam_masuk IS NOT NULL
            THEN TIME_FORMAT(
              a.jam_masuk,
              '%H:%i'
            )

            WHEN a.jam_pulang IS NOT NULL
            THEN TIME_FORMAT(
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
          g.golongan_ruang,
          g.jabatan,
          g.role

        FROM absensi a

        INNER JOIN guru g
          ON g.id_user = a.id_user

        WHERE g.aktif = 1
          AND MONTH(a.tanggal) = ?
          AND YEAR(a.tanggal) = ?
      `;

      const params: (string | number)[] = [
        Number(bulan),
        Number(tahun)
      ];

      if (idUser) {
        sql += `
          AND a.id_user = ?
        `;

        params.push(idUser);
      }

      sql += `
        ORDER BY
          g.nama ASC,
          a.tanggal ASC
      `;

      const rows =
        await conn.execute(
          sql,
          params
        ) as RowData[];

      if (
        !Array.isArray(rows) ||
        rows.length === 0
      ) {
        return corsJson(
          {
            status: 'error',
            message:
              'Tidak ada data untuk diexport.'
          },
          { status: 404 }
        );
      }

      // ==================================================
      // AMBIL SEMUA FOTO DARI DRIVE VIA APPS SCRIPT
      // ==================================================

      const allFileIds =
        Array.from(
          new Set(
            rows
              .flatMap((row) => [
                row.foto_masuk_file_id,
                row.foto_pulang_file_id
              ])
              .filter(
                (id): id is string =>
                  Boolean(id)
              )
          )
        );

      const photoStartedAt =
        Date.now();

      console.log(
        `[EXPORT EXCEL] Mengambil ${allFileIds.length} foto ` +
        `dengan concurrency ${PHOTO_CONCURRENCY}...`
      );

      const photoMap =
        await fetchAllPhotos(
          appsScriptUrl,
          allFileIds
        );

      console.log(
        `[EXPORT EXCEL] Foto selesai dalam ` +
        `${Date.now() - photoStartedAt} ms.`
      );

      // ==================================================
      // BUAT WORKBOOK
      // ==================================================

      const workbook =
        new ExcelJS.Workbook();

      workbook.creator =
        `Sistem Absensi ${SCHOOL_CONFIG.schoolName}`;

      workbook.created =
        new Date();

      const sheet =
        workbook.addWorksheet(
          'Laporan Absensi',
          {
            pageSetup: {
              paperSize: 9,
              orientation: 'landscape',
              fitToPage: true,
              fitToWidth: 1,
              fitToHeight: 0,
              margins: {
                left: 0.25,
                right: 0.25,
                top: 0.35,
                bottom: 0.35,
                header: 0.15,
                footer: 0.15
              }
            },
            views: [
              {
                state: 'frozen',
                ySplit: 5
              }
            ]
          }
        );

      sheet.columns = [
        { key: 'no', width: 6 },
        { key: 'nama', width: 28 },
        { key: 'identitas', width: 14 },
        { key: 'nomor', width: 23 },
        { key: 'statusPeg', width: 18 },
        { key: 'gol', width: 12 },
        { key: 'jabatan', width: 21 },
        { key: 'tanggal', width: 14 },
        { key: 'masuk', width: 11 },
        { key: 'pulang', width: 11 },
        { key: 'statusAbsen', width: 18 },
        { key: 'keterangan', width: 20 },
        { key: 'fotoMasuk', width: 18 },
        { key: 'fotoPulang', width: 18 }
      ];

      sheet.mergeCells('A1:N1');
      sheet.mergeCells('A2:N2');
      sheet.mergeCells('A3:N3');

      sheet.getCell('A1').value =
        'LAPORAN ABSENSI GURU DAN PEGAWAI';

      sheet.getCell('A2').value =
        SCHOOL_CONFIG.schoolName;

      sheet.getCell('A3').value =
        `BULAN ${MONTHS[bulan] || bulan} ${tahun}`;

      ['A1', 'A2', 'A3'].forEach(
        (address, index) => {
          const cell =
            sheet.getCell(address);

          cell.font = {
            bold: true,
            size:
              index === 0
                ? 15
                : 12
          };

          cell.alignment = {
            horizontal: 'center',
            vertical: 'middle'
          };
        }
      );

      sheet.getRow(1).height = 24;
      sheet.getRow(2).height = 20;
      sheet.getRow(3).height = 20;

      const headerRow =
        sheet.getRow(5);

      headerRow.values = [
        'NO',
        'NAMA',
        'JENIS IDENTITAS',
        'NIP / NIK',
        'STATUS KEPEGAWAIAN',
        'GOL.RUANG',
        'JABATAN',
        'TANGGAL',
        'JAM MASUK',
        'JAM PULANG',
        'STATUS ABSENSI',
        'KETERANGAN',
        'FOTO MASUK',
        'FOTO PULANG'
      ];

      headerRow.height = 30;

      headerRow.font = {
        bold: true,
        size: 9
      };

      headerRow.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true
      };

      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: {
            argb: 'D9EAF7'
          }
        };

        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // ==================================================
      // KELOMPOKKAN BERDASARKAN GURU
      // ==================================================

      const grouped =
        new Map<
          string,
          RowData[]
        >();

      rows.forEach((row) => {
        const key =
          row.id_user ||
          row.name;

        if (!grouped.has(key)) {
          grouped.set(
            key,
            []
          );
        }

        grouped
          .get(key)!
          .push(row);
      });

      let currentRow = 6;
      let no = 1;

      for (
        const [, groupRows]
        of grouped
      ) {
        const first =
          groupRows[0];

        const startRow =
          currentRow;

        const identityLabel =
          first.nip
            ? 'NIP'
            : first.nik
              ? 'NIK'
              : 'ID';

        const identityNumber =
          first.nip ||
          first.nik ||
          first.id_user ||
          '-';

        for (
          let i = 0;
          i < groupRows.length;
          i++
        ) {
          const row =
            groupRows[i];

          const jam =
            normalizeJam(row);

          const excelRow =
            sheet.getRow(
              currentRow
            );

          /*
           * Tinggi 98 pt kira-kira 130 px.
           * Cukup untuk menampilkan foto thumbnail di Excel.
           */
          excelRow.height = 98;

          excelRow.getCell(8).value =
            formatDateIndonesia(
              row.date
            );

          excelRow.getCell(9).value =
            jam.masuk;

          excelRow.getCell(10).value =
            jam.pulang;

          excelRow.getCell(11).value =
            row.status || '-';

          excelRow.getCell(12).value =
            row.keterangan || '-';

          // Foto benar-benar dimasukkan sebagai image.
          excelRow.getCell(13).value =
            row.foto_masuk_file_id
              ? ''
              : 'Tidak ada foto';

          excelRow.getCell(14).value =
            row.foto_pulang_file_id
              ? ''
              : 'Tidak ada foto';

          if (i === 0) {
            excelRow.getCell(1).value =
              no;

            excelRow.getCell(2).value =
              first.name || '-';

            excelRow.getCell(3).value =
              identityLabel;

            excelRow.getCell(4).value =
              identityNumber;

            excelRow.getCell(5).value =
              first.status_kepegawaian ||
              '-';

            excelRow.getCell(6).value =
              first.golongan_ruang ||
              '-';

            excelRow.getCell(7).value =
              first.jabatan || '-';
          }

          applyBorderAndAlignment(
            excelRow
          );

          // FOTO MASUK
          if (
            row.foto_masuk_file_id
          ) {
            addPhotoToSheet(
              workbook,
              sheet,
              photoMap.get(
                row.foto_masuk_file_id
              ),
              12,
              currentRow
            );
          }

          // FOTO PULANG
          if (
            row.foto_pulang_file_id
          ) {
            addPhotoToSheet(
              workbook,
              sheet,
              photoMap.get(
                row.foto_pulang_file_id
              ),
              13,
              currentRow
            );
          }

          currentRow++;
        }

        const endRow =
          currentRow - 1;

        if (
          endRow > startRow
        ) {
          [
            1, 2, 3, 4,
            5, 6, 7
          ].forEach(
            (column) => {
              sheet.mergeCells(
                startRow,
                column,
                endRow,
                column
              );

              sheet
                .getCell(
                  startRow,
                  column
                )
                .alignment = {
                  horizontal:
                    column === 2 ||
                    column === 7
                      ? 'left'
                      : 'center',

                  vertical:
                    'middle',

                  wrapText:
                    true
                };
            }
          );
        }

        no++;
      }

      sheet.autoFilter = {
        from: 'A5',
        to: 'N5'
      };

      sheet.pageSetup.printTitlesRow =
        '1:5';

      const guruName =
        idUser
          ? rows[0]?.name ||
            'Guru'
          : 'Semua_Guru';

      const fileName =
        `Absensi_${MONTHS[bulan] || bulan}_${tahun}_${escapeFileName(guruName)}.xlsx`;

      // ==================================================
      // WRITE XLSX + STREAM KE BROWSER
      // ==================================================

      const excelStartedAt =
        Date.now();

      const workbookBuffer =
        await workbook.xlsx.writeBuffer();

      console.log(
        `[EXPORT EXCEL] Workbook selesai dalam ` +
        `${Date.now() - excelStartedAt} ms.`
      );

      const bytes =
        workbookBuffer instanceof Uint8Array
          ? workbookBuffer
          : new Uint8Array(
              workbookBuffer as ArrayBuffer
            );

      /*
       * Dikembalikan sebagai ReadableStream.
       * Ini penting untuk file Excel bergambar yang bisa > 4.5 MB.
       */
      const stream =
        streamBytes(bytes);

      return new Response(
        stream,
        {
          status: 200,
          headers: {
            'Content-Type':
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

            'Content-Disposition':
              `attachment; filename="${fileName}"`,

            'Cache-Control':
              'no-store',

            'Access-Control-Allow-Origin':
              '*',

            'Access-Control-Allow-Methods':
              'GET, OPTIONS',

            'Access-Control-Allow-Headers':
              'Content-Type'
          }
        }
      );

    } catch (error) {
      console.error(
        'EXPORT EXCEL ERROR:',
        error
      );

      return corsJson(
        {
          status: 'error',
          message:
            error instanceof Error
              ? error.message
              : String(error)
        },
        { status: 500 }
      );
    }
  }
};
