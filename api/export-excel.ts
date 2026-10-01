export const runtime = 'nodejs';

import { connect } from '@tidbcloud/serverless';
import * as ExcelJS from 'exceljs';
import { SCHOOL_CONFIG } from './school-config';

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
  '12': 'Desember',
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  };
}

function jsonResponse(
  data: unknown,
  status = 200
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...corsHeaders(),
        'Content-Type': 'application/json; charset=utf-8',
      },
    }
  );
}

function fileResponse(
  data: Uint8Array,
  filename: string
) {
  return new Response(data, {
    status: 200,
    headers: {
      ...corsHeaders(),
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition':
        `attachment; filename="${filename}"`,
      'Content-Length':
        String(data.byteLength),
    },
  });
}

function normalizeJam(row: RowData) {
  let masuk = row.jam_masuk || '';
  let pulang = row.jam_pulang || '';

  if ((!masuk || !pulang) && row.time) {
    const parts = String(row.time).split(' - ');

    if (!masuk) {
      masuk = parts[0] || '';
    }

    if (!pulang && parts.length > 1) {
      pulang = parts[1] || '';
    }

    if (
      row.status === 'PULANG' &&
      !row.jam_masuk
    ) {
      masuk = '';
      pulang = parts[0] || '';
    }
  }

  return {
    masuk: masuk || '-',
    pulang: pulang || '-',
  };
}

function driveUrl(
  fileId?: string | null
) {
  return fileId
    ? `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`
    : '';
}

function formatDate(value: unknown) {
  const parts =
    String(value || '').split('-');

  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }

  return String(value || '-');
}

function safeFileName(value: string) {
  return String(value || 'file')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/-+/g, '-')
    .trim();
}

async function buildExcel(
  rows: RowData[],
  bulan: string,
  tahun: string
) {
  const workbook =
    new ExcelJS.Workbook();

  workbook.creator =
    'SD GMIT Oekona';
  workbook.lastModifiedBy =
    'SD GMIT Oekona';
  workbook.created =
    new Date();
  workbook.modified =
    new Date();

  const worksheet =
    workbook.addWorksheet(
      'Laporan Absensi',
      {
        views: [
          {
            state: 'frozen',
            ySplit: 5,
          },
        ],
        pageSetup: {
          paperSize: 9,
          orientation: 'landscape',
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
        },
        properties: {
          defaultRowHeight: 18,
        },
      }
    );

  const columns = [
    {
      header: 'NO',
      key: 'no',
      width: 7,
    },
    {
      header: 'NAMA',
      key: 'name',
      width: 30,
    },
    {
      header: 'JENIS IDENTITAS',
      key: 'identity_type',
      width: 15,
    },
    {
      header: 'NIP / NIK',
      key: 'identity_number',
      width: 24,
    },
    {
      header: 'STATUS KEPEGAWAIAN',
      key: 'status_kepegawaian',
      width: 20,
    },
    {
      header: 'GOL.RUANG',
      key: 'golongan_ruang',
      width: 14,
    },
    {
      header: 'JABATAN',
      key: 'jabatan',
      width: 24,
    },
    {
      header: 'TANGGAL',
      key: 'date',
      width: 14,
    },
    {
      header: 'JAM MASUK',
      key: 'jam_masuk',
      width: 14,
    },
    {
      header: 'JAM PULANG',
      key: 'jam_pulang',
      width: 14,
    },
    {
      header: 'STATUS ABSENSI',
      key: 'status',
      width: 19,
    },
    {
      header: 'KETERANGAN',
      key: 'keterangan',
      width: 22,
    },
    {
      header: 'FOTO MASUK',
      key: 'foto_masuk',
      width: 18,
    },
    {
      header: 'FOTO PULANG',
      key: 'foto_pulang',
      width: 18,
    },
  ];

  worksheet.columns = columns;

  worksheet.mergeCells(
    'A1:N1'
  );
  worksheet.mergeCells(
    'A2:N2'
  );
  worksheet.mergeCells(
    'A3:N3'
  );

  worksheet.getCell('A1').value =
    'LAPORAN ABSENSI GURU DAN PEGAWAI';

  worksheet.getCell('A2').value =
    SCHOOL_CONFIG.schoolName;

  worksheet.getCell('A3').value =
    `BULAN ${MONTHS[bulan] || bulan} ${tahun}`;

  worksheet.getCell('A1').alignment = {
    horizontal: 'center',
    vertical: 'middle',
  };

  worksheet.getCell('A2').alignment = {
    horizontal: 'center',
    vertical: 'middle',
  };

  worksheet.getCell('A3').alignment = {
    horizontal: 'center',
    vertical: 'middle',
  };

  worksheet.getCell('A1').font = {
    name: 'Arial',
    size: 14,
    bold: true,
  };

  worksheet.getCell('A2').font = {
    name: 'Arial',
    size: 12,
    bold: true,
  };

  worksheet.getCell('A3').font = {
    name: 'Arial',
    size: 11,
    bold: true,
  };

  worksheet.getRow(1).height = 25;
  worksheet.getRow(2).height = 21;
  worksheet.getRow(3).height = 21;

  worksheet.addRow([]);

  const headerRow =
    worksheet.getRow(5);

  headerRow.values =
    columns.map(
      (column) => column.header
    );

  headerRow.height = 30;

  headerRow.eachCell(
    (cell) => {
      cell.font = {
        name: 'Arial',
        size: 9,
        bold: true,
      };

      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      };

      cell.border = {
        top: {
          style: 'thin',
        },
        left: {
          style: 'thin',
        },
        bottom: {
          style: 'thin',
        },
        right: {
          style: 'thin',
        },
      };

      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: {
          argb: 'FFD9EAF7',
        },
      };
    }
  );

  rows.forEach(
    (row, index) => {
      const jam =
        normalizeJam(row);

      const identityType =
        row.nip
          ? 'NIP'
          : row.nik
            ? 'NIK'
            : '-';

      const identityNumber =
        row.nip ||
        row.nik ||
        '-';

      const excelRow =
        worksheet.addRow({
          no: index + 1,
          name: row.name || '-',
          identity_type:
            identityType,
          identity_number:
            identityNumber,
          status_kepegawaian:
            row.status_kepegawaian ||
            '-',
          golongan_ruang:
            row.golongan_ruang ||
            '-',
          jabatan:
            row.jabatan || '-',
          date:
            formatDate(row.date),
          jam_masuk:
            jam.masuk,
          jam_pulang:
            jam.pulang,
          status:
            row.status || '-',
          keterangan:
            row.keterangan || '-',
          foto_masuk:
            row.foto_masuk_file_id
              ? 'Lihat Foto'
              : 'Tidak ada',
          foto_pulang:
            row.foto_pulang_file_id
              ? 'Lihat Foto'
              : 'Tidak ada',
        });

      excelRow.eachCell(
        (cell) => {
          cell.font = {
            name: 'Arial',
            size: 10,
          };

          cell.alignment = {
            horizontal:
              cell.column === 2
                ? 'left'
                : 'center',
            vertical: 'middle',
            wrapText: true,
          };

          cell.border = {
            top: {
              style: 'thin',
            },
            left: {
              style: 'thin',
            },
            bottom: {
              style: 'thin',
            },
            right: {
              style: 'thin',
            },
          };
        }
      );

      const fotoMasukCell =
        excelRow.getCell(
          'foto_masuk'
        );

      const fotoPulangCell =
        excelRow.getCell(
          'foto_pulang'
        );

      if (
        row.foto_masuk_file_id
      ) {
        fotoMasukCell.value = {
          text: 'Lihat Foto',
          hyperlink: driveUrl(
            row.foto_masuk_file_id
          ),
        };

        fotoMasukCell.font = {
          name: 'Arial',
          size: 10,
          color: {
            argb: 'FF0563C1',
          },
          underline: true,
        };
      }

      if (
        row.foto_pulang_file_id
      ) {
        fotoPulangCell.value = {
          text: 'Lihat Foto',
          hyperlink: driveUrl(
            row.foto_pulang_file_id
          ),
        };

        fotoPulangCell.font = {
          name: 'Arial',
          size: 10,
          color: {
            argb: 'FF0563C1',
          },
          underline: true,
        };
      }
    }
  );

  const lastRow =
    Math.max(
      5,
      rows.length + 5
    );

  worksheet.autoFilter = {
    from: 'A5',
    to: `N${lastRow}`,
  };

  worksheet.printTitlesRow =
    '1:5';

  worksheet.pageSetup.margins = {
    left: 0.25,
    right: 0.25,
    top: 0.35,
    bottom: 0.35,
    header: 0.15,
    footer: 0.15,
  };

  worksheet.eachRow(
    (row) => {
      row.eachCell(
        (cell) => {
          if (
            cell.alignment ==
            null
          ) {
            cell.alignment = {
              vertical: 'middle',
            };
          }
        }
      );
    }
  );

  const buffer =
    await workbook.xlsx.writeBuffer();

  return new Uint8Array(buffer as Uint8Array);
}

async function handleExport(
  request: Request
) {
  if (
    request.method === 'OPTIONS'
  ) {
    return new Response(
      null,
      {
        status: 204,
        headers: corsHeaders(),
      }
    );
  }

  if (
    request.method !== 'GET'
  ) {
    return jsonResponse(
      {
        status: 'error',
        message:
          'Method tidak didukung.',
      },
      405
    );
  }

  try {
    const databaseUrl =
      process.env.DATABASE_URL;

    if (!databaseUrl) {
      return jsonResponse(
        {
          status: 'error',
          message:
            'DATABASE_URL belum ditemukan.',
        },
        500
      );
    }

    const url =
      new URL(request.url);

    let bulan =
      url.searchParams.get(
        'bulan'
      ) || '';

    bulan =
      bulan.padStart(2, '0');

    const tahun =
      url.searchParams.get(
        'tahun'
      ) || '';

    const idUser =
      url.searchParams.get(
        'id_user'
      ) || '';

    if (
      !/^(0[1-9]|1[0-2])$/.test(
        bulan
      )
    ) {
      return jsonResponse(
        {
          status: 'error',
          message:
            'Parameter bulan tidak valid.',
        },
        400
      );
    }

    if (
      !/^\d{4}$/.test(tahun)
    ) {
      return jsonResponse(
        {
          status: 'error',
          message:
            'Parameter tahun tidak valid.',
        },
        400
      );
    }

    const startDate =
      `${tahun}-${bulan}-01`;

    const nextMonth =
      Number(bulan) === 12
        ? 1
        : Number(bulan) + 1;

    const nextYear =
      Number(bulan) === 12
        ? Number(tahun) + 1
        : Number(tahun);

    const endDate =
      `${nextYear}-${String(
        nextMonth
      ).padStart(2, '0')}-01`;

    const conn =
      connect({
        url: databaseUrl,
      });

    let sql =
      `
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

            THEN TIME_FORMAT(
              a.jam_masuk,
              '%H:%i'
            )

            WHEN
              a.jam_pulang IS NOT NULL

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
          g.jabatan

        FROM absensi a

        INNER JOIN guru g
          ON g.id_user = a.id_user

        WHERE
          g.aktif = 1
          AND a.tanggal >= ?
          AND a.tanggal < ?
      `;

    const params:
      (string | number)[] = [
        startDate,
        endDate,
      ];

    if (idUser) {
      sql +=
        ' AND a.id_user = ?';

      params.push(idUser);
    }

    sql +=
      ' ORDER BY g.nama ASC, a.tanggal ASC';

    const rawResult =
      await conn.execute(
        sql,
        params
      ) as any;

    const rows =
      (
        rawResult?.rows
          ? rawResult.rows
          : rawResult
      ) as RowData[];

    if (
      !Array.isArray(rows) ||
      rows.length === 0
    ) {
      return jsonResponse(
        {
          status: 'error',
          message:
            'Tidak ada data untuk diexport.',
        },
        404
      );
    }

    const bytes =
      await buildExcel(
        rows,
        bulan,
        tahun
      );

    const safeId =
      idUser
        ? safeFileName(
            rows[0]?.name ||
              'Guru'
          )
        : 'Semua_Guru';

    const filename =
      `Absensi_${MONTHS[bulan] || bulan}_${tahun}_${safeId}.xlsx`;

    return fileResponse(
      bytes,
      filename
    );
  } catch (error) {
    console.error(
      'EXPORT EXCEL ERROR:',
      error
    );

    return jsonResponse(
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

export async function GET(
  request: Request
) {
  return handleExport(request);
}

export async function OPTIONS(
  request: Request
) {
  return handleExport(request);
}

export default async function handler(
  request: Request
) {
  return handleExport(request);
}
