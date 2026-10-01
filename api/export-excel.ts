export const runtime = 'nodejs';
export const maxDuration = 300;

import { connect } from '@tidbcloud/serverless';
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
  pangkat?: string | null;
  golongan_ruang?: string | null;
  jabatan?: string | null;
};

type PhotoData = {
  file_id: string;
  base64: string;
  mime_type: string;
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

const MAX_PHOTOS_PER_REQUEST = 25;

function getHeaders() {
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
        ...getHeaders(),
        'Content-Type':
          'application/json; charset=utf-8',
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
      ...getHeaders(),
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

function formatDate(value: unknown) {
  const parts =
    String(value || '').split('-');

  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }

  return String(value || '-');
}

function driveUrl(
  fileId?: string | null
) {
  return fileId
    ? `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`
    : '';
}

function safeFileName(
  value: string
) {
  return String(value || 'file')
    .replace(
      /[\\/:*?"<>|]/g,
      '-'
    )
    .replace(
      /\s+/g,
      '_'
    )
    .trim();
}

async function fetchPhotos(
  fileIds: string[]
) {
  const appsScriptUrl =
    process.env.APPS_SCRIPT_URL;

  const photoMap =
    new Map<string, PhotoData>();

  if (
    !appsScriptUrl ||
    fileIds.length === 0
  ) {
    return photoMap;
  }

  const uniqueIds =
    Array.from(
      new Set(
        fileIds
          .map((id) => String(id || '').trim())
          .filter(Boolean)
      )
    );

  for (
    let start = 0;
    start < uniqueIds.length;
    start += MAX_PHOTOS_PER_REQUEST
  ) {
    const chunk =
      uniqueIds.slice(
        start,
        start + MAX_PHOTOS_PER_REQUEST
      );

    try {
      const response =
        await fetch(
          appsScriptUrl,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'text/plain;charset=utf-8',
            },
            body: JSON.stringify({
              action:
                'get_photos_base64',
              file_ids: chunk,
            }),
          }
        );

      const text =
        await response.text();

      if (!response.ok) {
        console.error(
          'PHOTO EXPORT HTTP ERROR:',
          response.status,
          text
        );
        continue;
      }

      let result: any;

      try {
        result =
          JSON.parse(text);
      } catch {
        console.error(
          'PHOTO EXPORT INVALID JSON:',
          text
        );
        continue;
      }

      if (
        result?.status !==
        'success'
      ) {
        console.error(
          'PHOTO EXPORT APP SCRIPT ERROR:',
          result?.message ||
            'Unknown error'
        );
        continue;
      }

      const photos =
        Array.isArray(
          result?.photos
        )
          ? result.photos
          : [];

      for (
        const photo of photos
      ) {
        const fileId =
          String(
            photo?.file_id ||
              ''
          ).trim();

        const base64 =
          String(
            photo?.base64 ||
              ''
          ).trim();

        const mimeType =
          String(
            photo?.mime_type ||
              ''
          ).trim();

        if (
          fileId &&
          base64 &&
          mimeType
        ) {
          photoMap.set(
            fileId,
            {
              file_id:
                fileId,
              base64,
              mime_type:
                mimeType,
            }
          );
        }
      }
    } catch (error) {
      console.error(
        'PHOTO EXPORT FETCH ERROR:',
        error
      );
    }
  }

  return photoMap;
}

function getImageExtension(
  mimeType: string
) {
  const mime =
    mimeType.toLowerCase();

  if (
    mime.includes('png')
  ) {
    return 'png';
  }

  if (
    mime.includes('webp')
  ) {
    return 'jpeg';
  }

  return 'jpeg';
}

function addPhotoToCell(
  workbook: any,
  worksheet: any,
  cellAddress: string,
  photo: PhotoData | undefined,
  hyperlink: string
) {
  const cell =
    worksheet.getCell(
      cellAddress
    );

  cell.alignment = {
    horizontal: 'center',
    vertical: 'middle',
    wrapText: true,
  };

  if (!photo) {
    cell.value =
      hyperlink
        ? {
            text: 'Lihat Foto',
            hyperlink,
          }
        : 'Tidak ada foto';

    if (hyperlink) {
      cell.font = {
        name: 'Arial',
        size: 9,
        color: {
          argb: 'FF0563C1',
        },
        underline: true,
      };
    }

    return;
  }

  try {
    const imageId =
      workbook.addImage({
        base64:
          `data:${photo.mime_type};base64,${photo.base64}`,
        extension:
          getImageExtension(
            photo.mime_type
          ),
      });

    const column =
      cell.column;
    const row =
      cell.row;

    worksheet.addImage(
      imageId,
      {
        tl: {
          col: column - 1 + 0.08,
          row: row - 1 + 0.08,
        },
        ext: {
          width: 105,
          height: 78,
        },
      }
    );

    cell.value =
      hyperlink
        ? {
            text: ' ',
            hyperlink,
          }
        : ' ';
  } catch (error) {
    console.error(
      'ADD EXCEL IMAGE ERROR:',
      error
    );

    cell.value =
      hyperlink
        ? {
            text: 'Lihat Foto',
            hyperlink,
          }
        : 'Foto gagal dimuat';

    if (hyperlink) {
      cell.font = {
        name: 'Arial',
        size: 9,
        color: {
          argb: 'FF0563C1',
        },
        underline: true,
      };
    }
  }
}

async function buildExcel(
  rows: RowData[],
  bulan: string,
  tahun: string
) {
  const ExcelJSModule: any =
    await import('exceljs');

  const ExcelJS =
    ExcelJSModule?.default ||
    ExcelJSModule;

  const workbook =
    new ExcelJS.Workbook();

  workbook.creator =
    'SD GMIT OEKONA';

  workbook.lastModifiedBy =
    'SD GMIT OEKONA';

  workbook.created =
    new Date();

  workbook.modified =
    new Date();

  const worksheet =
    workbook.addWorksheet(
      'Dashboard Admin',
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
      }
    );

  worksheet.columns = [
    {
      key: 'no',
      width: 7,
    },
    {
      key: 'identity',
      width: 38,
    },
    {
      key: 'date',
      width: 14,
    },
    {
      key: 'time',
      width: 19,
    },
    {
      key: 'status',
      width: 22,
    },
    {
      key: 'note',
      width: 25,
    },
    {
      key: 'photo_in',
      width: 18,
    },
    {
      key: 'photo_out',
      width: 18,
    },
  ];

  // Judul mengikuti konteks Dashboard Admin.
  worksheet.mergeCells(
    'A1:H1'
  );
  worksheet.mergeCells(
    'A2:H2'
  );
  worksheet.mergeCells(
    'A3:H3'
  );

  worksheet.getCell('A1').value =
    'REKAP ABSENSI GURU DAN PEGAWAI';

  worksheet.getCell('A2').value =
    'SD GMIT OEKONA';

  worksheet.getCell('A3').value =
    `BULAN ${MONTHS[bulan] || bulan} ${tahun}`;

  for (
    const address of [
      'A1',
      'A2',
      'A3',
    ]
  ) {
    worksheet.getCell(
      address
    ).alignment = {
      horizontal: 'center',
      vertical: 'middle',
    };
  }

  worksheet.getCell('A1').font = {
    name: 'Arial',
    size: 15,
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

  worksheet.getRow(1).height = 26;
  worksheet.getRow(2).height = 22;
  worksheet.getRow(3).height = 22;

  worksheet.addRow([]);

  const headerRow =
    worksheet.getRow(5);

  const headers = [
    'No',
    'Nama / NIP-NIK / Jabatan',
    'Tanggal',
    'Jam',
    'Status',
    'Keterangan',
    'Foto Masuk',
    'Foto Pulang',
  ];

  headerRow.values =
    headers;

  headerRow.height = 32;

  headerRow.eachCell(
    (cell) => {
      cell.font = {
        name: 'Arial',
        size: 10,
        bold: true,
      };

      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      };

      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: {
          argb: 'FFF1F5F9',
        },
      };

      cell.border = {
        top: {
          style: 'thin',
        },
        bottom: {
          style: 'thin',
        },
        left: {
          style: 'thin',
        },
        right: {
          style: 'thin',
        },
      };
    }
  );

  /*
   * Data disusun sama seperti groupedRecords
   * pada Dashboard Admin:
   * satu group = satu guru/pegawai,
   * kolom No dan Identitas digabung
   * selama guru tersebut mempunyai
   * beberapa record absensi.
   */
  const groups =
    new Map<
      string,
      {
        id_user: string;
        name: string;
        nip?: string | null;
        nik?: string | null;
        status_kepegawaian?:
          string | null;
        golongan_ruang?:
          string | null;
        jabatan?: string | null;
        records: RowData[];
      }
    >();

  rows.forEach(
    (record) => {
      const key =
        String(
          record.id_user
        );

      const existing =
        groups.get(key);

      if (existing) {
        existing.records.push(
          record
        );
        return;
      }

      groups.set(
        key,
        {
          id_user: key,
          name:
            record.name ||
            '-',
          nip:
            record.nip,
          nik:
            record.nik,
          status_kepegawaian:
            record.status_kepegawaian,
          golongan_ruang:
            record.golongan_ruang,
          jabatan:
            record.jabatan,
          records: [record],
        }
      );
    }
  );

  const groupList =
    Array.from(
      groups.values()
    );

  const allPhotoIds =
    rows.flatMap(
      (row) => [
        row.foto_masuk_file_id || '',
        row.foto_pulang_file_id || '',
      ]
    );

  const photoMap =
    await fetchPhotos(
      allPhotoIds
    );

  let excelRowNumber = 6;

  for (
    let groupIndex = 0;
    groupIndex < groupList.length;
    groupIndex++
  ) {
    const group =
      groupList[groupIndex];

    const firstRow =
      excelRowNumber;

    const lastRow =
      excelRowNumber +
      group.records.length -
      1;

    const identityNumber =
      group.nip ||
      group.nik ||
      group.id_user ||
      '-';

    const identityLabel =
      group.nip
        ? 'NIP'
        : group.nik
          ? 'NIK'
          : 'ID';

    group.records.forEach(
      (record, recordIndex) => {
        const rowNumber =
          excelRowNumber;

        const jam =
          normalizeJam(record);

        worksheet.getCell(
          `C${rowNumber}`
        ).value =
          formatDate(
            record.date
          );

        worksheet.getCell(
          `D${rowNumber}`
        ).value =
          `${jam.masuk} - ${jam.pulang}`;

        worksheet.getCell(
          `E${rowNumber}`
        ).value =
          record.status || '-';

        worksheet.getCell(
          `F${rowNumber}`
        ).value =
          record.keterangan ||
          '-';

        const photoIn =
          record.foto_masuk_file_id
            ? photoMap.get(
                record.foto_masuk_file_id
              )
            : undefined;

        const photoOut =
          record.foto_pulang_file_id
            ? photoMap.get(
                record.foto_pulang_file_id
              )
            : undefined;

        addPhotoToCell(
          workbook,
          worksheet,
          `G${rowNumber}`,
          photoIn,
          driveUrl(
            record.foto_masuk_file_id
          )
        );

        addPhotoToCell(
          workbook,
          worksheet,
          `H${rowNumber}`,
          photoOut,
          driveUrl(
            record.foto_pulang_file_id
          )
        );

        for (
          const column of [
            'C',
            'D',
            'E',
            'F',
            'G',
            'H',
          ]
        ) {
          const cell =
            worksheet.getCell(
              `${column}${rowNumber}`
            );

          cell.font =
            cell.font || {
              name: 'Arial',
              size: 10,
            };

          cell.alignment = {
            horizontal:
              column === 'F'
                ? 'left'
                : 'center',
            vertical:
              'middle',
            wrapText:
              true,
          };

          cell.border = {
            top: {
              style: 'thin',
            },
            bottom: {
              style: 'thin',
            },
            left: {
              style: 'thin',
            },
            right: {
              style: 'thin',
            },
          };
        }

        worksheet.getRow(
          rowNumber
        ).height = 68;

        if (
          recordIndex === 0
        ) {
          worksheet.getCell(
            `A${rowNumber}`
          ).value =
            groupIndex + 1;

          worksheet.getCell(
            `B${rowNumber}`
          ).value =
            `Nama : ${group.name || '-'}
${identityLabel} : ${identityNumber}
Status : ${group.status_kepegawaian || '-'}
Gol.Ruang : ${group.golongan_ruang || '-'}
Jabatan : ${group.jabatan || '-'}`;

          for (
            const cellAddress of [
              `A${rowNumber}`,
              `B${rowNumber}`,
            ]
          ) {
            const cell =
              worksheet.getCell(
                cellAddress
              );

            cell.font = {
              name: 'Arial',
              size: 10,
              bold:
                cellAddress.startsWith(
                  'B'
                ),
            };

            cell.alignment = {
              horizontal:
                cellAddress.startsWith(
                  'A'
                )
                  ? 'center'
                  : 'left',
              vertical:
                'middle',
                wrapText:
                  true,
            };

            cell.border = {
              top: {
                style: 'thin',
              },
              bottom: {
                style: 'thin',
              },
              left: {
                style: 'thin',
              },
              right: {
                style: 'thin',
              },
            };
          }
        }
      }
    );

    if (
      lastRow > firstRow
    ) {
      worksheet.mergeCells(
        `A${firstRow}:A${lastRow}`
      );

      worksheet.mergeCells(
        `B${firstRow}:B${lastRow}`
      );
    }

    excelRowNumber =
      lastRow + 1;
  }

  const actualLastRow =
    Math.max(
      5,
      excelRowNumber - 1
    );

  worksheet.autoFilter = {
    from: 'A5',
    to: `H${actualLastRow}`,
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

  const buffer =
    await workbook.xlsx.writeBuffer();

  return new Uint8Array(
    buffer as ArrayBuffer
  );
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
        headers: getHeaders(),
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
      new URL(
        request.url,
        `https://${
          request.headers.get(
            'host'
          ) ||
          'sdgoekona.vercel.app'
        }`
      );

    let bulan =
      url.searchParams.get(
        'bulan'
      ) || '';

    bulan =
      bulan.padStart(
        2,
        '0'
      );

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
      !/^\d{4}$/.test(
        tahun
      )
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
      ).padStart(
        2,
        '0'
      )}-01`;

    const conn =
      connect({
        url: databaseUrl,
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
        g.pangkat,
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
      Array<string | number> = [
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

    let rows =
      (
        rawResult?.rows
          ? rawResult.rows
          : rawResult
      ) as RowData[];

    if (!Array.isArray(rows)) {
      rows = [];
    }

    if (
      rows.length === 0
    ) {
      return jsonResponse(
        {
          status: 'error',
          message:
            'Tidak ada data untuk diexport pada periode yang dipilih.',
        },
        404
      );
    }

    rows = rows
      .slice()
      .sort(
        (a, b) => {
          const byName =
            String(
              a.name || ''
            ).localeCompare(
              String(
                b.name || ''
              ),
              'id'
            );

          if (
            byName !== 0
          ) {
            return byName;
          }

          return String(
            a.date || ''
          ).localeCompare(
            String(
              b.date || ''
            )
          );
        }
      );

    const bytes =
      await buildExcel(
        rows,
        bulan,
        tahun
      );

    if (
      !bytes ||
      bytes.byteLength === 0
    ) {
      return jsonResponse(
        {
          status: 'error',
          message:
            'File Excel gagal dibuat.',
        },
        500
      );
    }

    const safeId =
      idUser
        ? safeFileName(
            rows[0]?.name ||
              'Guru'
          )
        : 'Semua_Guru';

    return fileResponse(
      bytes,
      `Absensi_${MONTHS[bulan] || bulan}_${tahun}_${safeId}.xlsx`
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
