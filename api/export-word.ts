export const runtime = 'nodejs';

import { connect } from '@tidbcloud/serverless';
import { SCHOOL_CONFIG } from './school-config';
import { Buffer } from 'node:buffer';
import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  VerticalMergeType,
  WidthType
} from 'docx';

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

const PHOTO_BATCH_SIZE = 20;
const PHOTO_CONCURRENCY = 3;

const TABLE_WIDTH = 16000;

const COLUMN_WIDTHS = [
  500,   // NO
  3500,  // IDENTITAS
  1000,  // TANGGAL
  1400,  // JAM
  1500,  // STATUS
  1600,  // KETERANGAN
  3250,  // FOTO MASUK
  3250   // FOTO PULANG
];

const CELL_MARGINS = {
  top: 70,
  bottom: 70,
  left: 90,
  right: 90
};

const CELL_BORDER = {
  style: BorderStyle.SINGLE,
  size: 4,
  color: '000000'
};

function badRequest(message: string) {
  return Response.json(
    {
      status: 'error',
      message
    },
    {
      status: 400
    }
  );
}

function formatDateIndonesia(value: string) {
  const parts =
    String(value)
      .split('-');

  if (parts.length !== 3) {
    return value || '-';
  }

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
  const text =
    String(time || '');

  const parts =
    text.split(' - ');

  if (status === 'MASUK & PULANG') {
    return target === 'masuk'
      ? parts[0] || null
      : parts[1] || null;
  }

  if (status === 'PULANG') {
    return target === 'pulang'
      ? parts[0] || null
      : null;
  }

  return target === 'masuk'
    ? parts[0] || null
    : null;
}

function normalizeJam(row: RowData) {
  return {
    masuk:
      row.jam_masuk ||
      parseTimeFromCombined(
        row.time,
        row.status,
        'masuk'
      ) ||
      '-',

    pulang:
      row.jam_pulang ||
      parseTimeFromCombined(
        row.time,
        row.status,
        'pulang'
      ) ||
      '-'
  };
}

function chunkArray<T>(
  items: T[],
  size: number
) {
  const chunks: T[][] = [];

  for (
    let i = 0;
    i < items.length;
    i += size
  ) {
    chunks.push(
      items.slice(i, i + size)
    );
  }

  return chunks;
}

async function fetchPhotoBatch(
  appsScriptUrl: string,
  fileIds: string[]
) {
  const response =
    await fetch(
      appsScriptUrl,
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'text/plain;charset=utf-8'
        },

        body:
          JSON.stringify({
            action:
              'get_photos_base64',

            file_ids:
              fileIds
          })
      }
    );

  const text =
    await response.text();

  let result: PhotoBatchPayload;

  try {
    result =
      JSON.parse(text) as PhotoBatchPayload;
  } catch {
    throw new Error(
      'Response foto dari Apps Script bukan JSON.'
    );
  }

  if (
    result.status !== 'success' ||
    !Array.isArray(result.photos)
  ) {
    throw new Error(
      result.message ||
      'Apps Script gagal mengambil foto dari Google Drive.'
    );
  }

  return result.photos;
}

async function fetchPhotoBatchWithRetry(
  appsScriptUrl: string,
  fileIds: string[],
  maxAttempts = 2
) {
  let lastError: unknown;

  for (
    let attempt = 1;
    attempt <= maxAttempts;
    attempt++
  ) {
    try {
      return await fetchPhotoBatch(
        appsScriptUrl,
        fileIds
      );
    } catch (error) {
      lastError = error;

      if (attempt < maxAttempts) {
        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              500 * attempt
            )
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
  const photoMap =
    new Map<string, PhotoItem>();

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
        wave.map(
          (batch) =>
            fetchPhotoBatchWithRetry(
              appsScriptUrl,
              batch
            )
        )
      );

    results
      .flat()
      .forEach(
        (photo) => {
          photoMap.set(
            photo.file_id,
            photo
          );
        }
      );
  }

  return photoMap;
}

function imageType(
  mimeType?: string
): 'png' | 'jpg' | null {
  const mime =
    String(mimeType || '')
      .toLowerCase();

  if (
    mime.includes('png')
  ) {
    return 'png';
  }

  if (
    mime.includes('jpeg') ||
    mime.includes('jpg')
  ) {
    return 'jpg';
  }

  return null;
}

function photoParagraph(
  photo: PhotoItem | undefined,
  label: string
) {
  if (
    !photo ||
    photo.status !== 'success' ||
    !photo.base64 ||
    !photo.mime_type
  ) {
    return new Paragraph({
      alignment:
        AlignmentType.CENTER,

      children: [
        new TextRun({
          text:
            'Tidak ada foto',
          size: 14,
          color: '777777'
        })
      ]
    });
  }

  const type =
    imageType(
      photo.mime_type
    );

  if (!type) {
    return new Paragraph({
      alignment:
        AlignmentType.CENTER,

      children: [
        new TextRun({
          text:
            'Format foto tidak didukung',
          size: 14,
          color: '777777'
        })
      ]
    });
  }

  return new Paragraph({
    alignment:
      AlignmentType.CENTER,

    spacing: {
      before: 0,
      after: 0
    },

    children: [
      new ImageRun({
        type,

        data:
          Buffer.from(
            photo.base64,
            'base64'
          ),

        transformation: {
          width: 105,
          height: 135
        },

        altText: {
          title: label,
          description: label,
          name: label
        }
      })
    ]
  });
}

function simpleParagraph(
  text: string,
  options?: {
    bold?: boolean;
    size?: number;
    center?: boolean;
    color?: string;
  }
) {
  return new Paragraph({
    alignment:
      options?.center
        ? AlignmentType.CENTER
        : AlignmentType.LEFT,

    spacing: {
      before: 0,
      after: 0
    },

    children: [
      new TextRun({
        text,
        bold:
          options?.bold || false,
        size:
          options?.size || 14,
        color:
          options?.color || '000000',
        font:
          'Arial'
      })
    ]
  });
}

function textCell(
  text: string,
  width: number,
  options?: {
    bold?: boolean;
    size?: number;
    shading?: string;
    center?: boolean;
    verticalMerge?:
      typeof VerticalMergeType[
        keyof typeof VerticalMergeType
      ];
  }
) {
  return new TableCell({
    width: {
      size: width,
      type:
        WidthType.DXA
    },

    verticalAlign:
      VerticalAlign.CENTER,

    verticalMerge:
      options?.verticalMerge,

    margins:
      CELL_MARGINS,

    shading:
      options?.shading
        ? {
            type:
              ShadingType.CLEAR,
            fill:
              options.shading
          }
        : undefined,

    borders: {
      top:
        CELL_BORDER,
      bottom:
        CELL_BORDER,
      left:
        CELL_BORDER,
      right:
        CELL_BORDER
    },

    children: [
      new Paragraph({
        alignment:
          options?.center
            ? AlignmentType.CENTER
            : AlignmentType.LEFT,

        spacing: {
          before: 0,
          after: 0
        },

        children: [
          new TextRun({
            text,
            bold:
              options?.bold ||
              false,
            size:
              options?.size ||
              14,
            font:
              'Arial'
          })
        ]
      })
    ]
  });
}

function paragraphCell(
  children: Paragraph[],
  width: number,
  options?: {
    verticalMerge?:
      typeof VerticalMergeType[
        keyof typeof VerticalMergeType
      ];
  }
) {
  return new TableCell({
    width: {
      size: width,
      type: WidthType.DXA
    },

    verticalAlign:
      VerticalAlign.CENTER,

    verticalMerge:
      options?.verticalMerge,

    margins:
      CELL_MARGINS,

    borders: {
      top: CELL_BORDER,
      bottom: CELL_BORDER,
      left: CELL_BORDER,
      right: CELL_BORDER
    },

    children
  });
}

function streamBytes(
  bytes: Uint8Array
) {
  let offset = 0;

  const chunkSize =
    64 * 1024;

  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (
        offset >=
        bytes.byteLength
      ) {
        controller.close();
        return;
      }

      const end =
        Math.min(
          offset + chunkSize,
          bytes.byteLength
        );

      controller.enqueue(
        bytes.subarray(
          offset,
          end
        )
      );

      offset = end;
    }
  });
}

export default {
  async fetch(
    request: Request
  ) {
    if (
      request.method !== 'GET'
    ) {
      return Response.json(
        {
          status: 'error',
          message:
            'Method tidak didukung.'
        },
        {
          status: 405
        }
      );
    }

    try {
      const databaseUrl =
        process.env.DATABASE_URL;

      const appsScriptUrl =
        process.env.APPS_SCRIPT_URL;

      if (!databaseUrl) {
        return Response.json(
          {
            status: 'error',
            message:
              'DATABASE_URL belum ditemukan di Vercel.'
          },
          {
            status: 500
          }
        );
      }

      if (!appsScriptUrl) {
        return Response.json(
          {
            status: 'error',
            message:
              'APPS_SCRIPT_URL belum ditemukan di Vercel.'
          },
          {
            status: 500
          }
        );
      }

      const url =
        new URL(
          request.url
        );

      const bulan =
        url.searchParams.get(
          'bulan'
        ) || '';

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
        return badRequest(
          'Parameter bulan tidak valid.'
        );
      }

      if (
        !/^\d{4}$/.test(
          tahun
        )
      ) {
        return badRequest(
          'Parameter tahun tidak valid.'
        );
      }

      const conn =
        connect({
          url:
            databaseUrl
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
          g.jabatan

        FROM absensi a

        INNER JOIN guru g
          ON g.id_user =
             a.id_user

        WHERE g.aktif = 1
          AND MONTH(a.tanggal) = ?
          AND YEAR(a.tanggal) = ?
      `;

      const params:
        (string | number)[] = [
          Number(bulan),
          Number(tahun)
        ];

      if (idUser) {
        sql += `
          AND a.id_user = ?
        `;

        params.push(
          idUser
        );
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
        return Response.json(
          {
            status: 'error',
            message:
              'Tidak ada data untuk diexport.'
          },
          {
            status: 404
          }
        );
      }

      // ================================================
      // AMBIL FOTO DARI DRIVE
      // ================================================

      const allFileIds =
        Array.from(
          new Set(
            rows
              .flatMap(
                (row) => [
                  row.foto_masuk_file_id,
                  row.foto_pulang_file_id
                ]
              )
              .filter(
                (
                  id
                ): id is string =>
                  Boolean(id)
              )
          )
        );

      const photoStartedAt =
        Date.now();

      console.log(
        `[EXPORT WORD] Mengambil ${allFileIds.length} foto...`
      );

      const photoMap =
        await fetchAllPhotos(
          appsScriptUrl,
          allFileIds
        );

      console.log(
        `[EXPORT WORD] Foto selesai dalam ${
          Date.now() -
          photoStartedAt
        } ms.`
      );

      // ================================================
      // KELOMPOKKAN DATA PER GURU
      // ================================================

      const grouped =
        new Map<
          string,
          RowData[]
        >();

      rows.forEach(
        (row) => {
          const key =
            row.id_user ||
            row.name;

          if (
            !grouped.has(key)
          ) {
            grouped.set(
              key,
              []
            );
          }

          grouped
            .get(key)!
            .push(row);
        }
      );

      // ================================================
      // HEADER TABEL
      // ================================================

      const headerTitles = [
        'NO',
        'NAMA / NIP-NIK / JABATAN',
        'TANGGAL',
        'JAM',
        'STATUS',
        'KETERANGAN',
        'FOTO MASUK',
        'FOTO PULANG'
      ];

      const tableRows:
        TableRow[] = [
          new TableRow({
            tableHeader: true,
            cantSplit: true,

            children:
              headerTitles.map(
                (
                  title,
                  index
                ) =>
                  textCell(
                    title,
                    COLUMN_WIDTHS[
                      index
                    ],
                    {
                      bold:
                        true,
                      size:
                        13,
                      center:
                        true,
                      shading:
                        'D9EAF7'
                    }
                  )
              )
          })
        ];

      let no = 1;

      for (
        const [, groupRows]
        of grouped
      ) {
        const first =
          groupRows[0];

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

        const identityParagraphs = [
          simpleParagraph(
            `Nama: ${first.name || '-'}`,
            {
              bold: true,
              size: 14
            }
          ),

          simpleParagraph(
            `${identityLabel}: ${identityNumber}`,
            {
              size: 13
            }
          ),

          simpleParagraph(
            `Status: ${first.status_kepegawaian || '-'}`,
            {
              size: 13
            }
          ),

          simpleParagraph(
            `Gol.Ruang: ${first.golongan_ruang || '-'}`,
            {
              size: 13
            }
          ),

          simpleParagraph(
            `Jabatan: ${first.jabatan || '-'}`,
            {
              size: 13
            }
          )
        ];

        for (
          let index = 0;
          index < groupRows.length;
          index++
        ) {
          const row =
            groupRows[index];

          const jam =
            normalizeJam(row);

          const jamParagraphs = [
            simpleParagraph(
              `Masuk: ${jam.masuk}`,
              {
                size: 13,
                center: true
              }
            ),

            simpleParagraph(
              `Pulang: ${jam.pulang}`,
              {
                size: 13,
                center: true
              }
            )
          ];

          const photoMasuk =
            row.foto_masuk_file_id
              ? photoMap.get(
                  row.foto_masuk_file_id
                )
              : undefined;

          const photoPulang =
            row.foto_pulang_file_id
              ? photoMap.get(
                  row.foto_pulang_file_id
                )
              : undefined;

          const isFirst =
            index === 0;

          const mergeType =
            isFirst
              ? VerticalMergeType.RESTART
              : VerticalMergeType.CONTINUE;

          const numberCell =
            isFirst
              ? textCell(
                  String(no),
                  COLUMN_WIDTHS[0],
                  {
                    center: true,
                    verticalMerge:
                      mergeType
                  }
                )
              : textCell(
                  '',
                  COLUMN_WIDTHS[0],
                  {
                    center: true,
                    verticalMerge:
                      mergeType
                  }
                );

          const identityCell =
            isFirst
              ? paragraphCell(
                  identityParagraphs,
                  COLUMN_WIDTHS[1],
                  {
                    verticalMerge:
                      mergeType
                  }
                )
              : paragraphCell(
                  [
                    simpleParagraph(
                      ''
                    )
                  ],
                  COLUMN_WIDTHS[1],
                  {
                    verticalMerge:
                      mergeType
                  }
                );

          tableRows.push(
            new TableRow({
              cantSplit: true,

              children: [
                numberCell,

                identityCell,

                textCell(
                  formatDateIndonesia(
                    row.date
                  ),
                  COLUMN_WIDTHS[2],
                  {
                    center:
                      true,
                    size:
                      13
                  }
                ),

                paragraphCell(
                  jamParagraphs,
                  COLUMN_WIDTHS[3]
                ),

                textCell(
                  row.status || '-',
                  COLUMN_WIDTHS[4],
                  {
                    center:
                      true,
                    size:
                      13
                  }
                ),

                textCell(
                  row.keterangan || '-',
                  COLUMN_WIDTHS[5],
                  {
                    size:
                      13
                  }
                ),

                paragraphCell(
                  [
                    photoParagraph(
                      photoMasuk,
                      `Foto Masuk ${first.name} ${row.date}`
                    )
                  ],
                  COLUMN_WIDTHS[6]
                ),

                paragraphCell(
                  [
                    photoParagraph(
                      photoPulang,
                      `Foto Pulang ${first.name} ${row.date}`
                    )
                  ],
                  COLUMN_WIDTHS[7]
                )
              ]
            })
          );
        }

        no++;
      }

      // ================================================
      // BUAT DOKUMEN WORD
      // ================================================

      const title =
        new Paragraph({
          alignment:
            AlignmentType.CENTER,

          spacing: {
            after: 40
          },

          children: [
            new TextRun({
              text:
                'LAPORAN ABSENSI GURU DAN PEGAWAI',
              bold:
                true,
              size:
                28,
              font:
                'Arial'
            })
          ]
        });

      const school =
        new Paragraph({
          alignment:
            AlignmentType.CENTER,

          spacing: {
            after: 20
          },

          children: [
            new TextRun({
              text:
                SCHOOL_CONFIG.schoolName,
              bold:
                true,
              size:
                22,
              font:
                'Arial'
            })
          ]
        });

      const period =
        new Paragraph({
          alignment:
            AlignmentType.CENTER,

          spacing: {
            after: 120
          },

          children: [
            new TextRun({
              text:
                `BULAN ${MONTHS[bulan] || bulan} ${tahun}`,
              bold:
                true,
              size:
                18,
              font:
                'Arial'
            })
          ]
        });

      const reportTable =
        new Table({
          rows:
            tableRows,

          width: {
            size:
              TABLE_WIDTH,
            type:
              WidthType.DXA
          },

          columnWidths:
            COLUMN_WIDTHS,

          layout:
            TableLayoutType.FIXED,

          alignment:
            AlignmentType.CENTER,

          margins:
            CELL_MARGINS
        });

      const doc =
        new Document({
          creator:
            `Sistem Absensi ${SCHOOL_CONFIG.schoolName}`,

          title:
            `Laporan Absensi ${MONTHS[bulan] || bulan} ${tahun}`,

          styles: {
            default: {
              document: {
                run: {
                  font:
                    'Arial',
                  size:
                    14
                },

                paragraph: {
                  spacing: {
                    after:
                      0
                  }
                }
              }
            }
          },

          sections: [
            {
              properties: {
                page: {
                  size: {
                    width:
                      11906,
                    height:
                      16838,
                    orientation:
                      PageOrientation.LANDSCAPE
                  },

                  margin: {
                    top:
                      340,
                    right:
                      340,
                    bottom:
                      340,
                    left:
                      340,
                    header:
                      0,
                    footer:
                      0,
                    gutter:
                      0
                  }
                }
              },

              children: [
                title,
                school,
                period,
                reportTable
              ]
            }
          ]
        });

      const wordStartedAt =
        Date.now();

      const buffer =
        await Packer.toBuffer(
          doc
        );

      console.log(
        `[EXPORT WORD] DOCX selesai dalam ${
          Date.now() -
          wordStartedAt
        } ms.`
      );

      const bytes =
        new Uint8Array(
          buffer.buffer,
          buffer.byteOffset,
          buffer.byteLength
        );

      const guruName =
        idUser
          ? rows[0]?.name ||
            'Guru'
          : 'Semua_Guru';

      const fileName =
        `Absensi_${MONTHS[bulan] || bulan}_${tahun}_${escapeFileName(guruName)}.docx`;

      return new Response(
        streamBytes(bytes),
        {
          status:
            200,

          headers: {
            'Content-Type':
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',

            'Content-Disposition':
              `attachment; filename="${fileName}"`,

            'Cache-Control':
              'no-store'
          }
        }
      );

    } catch (error) {
      console.error(
        'EXPORT WORD ERROR:',
        error
      );

      return Response.json(
        {
          status:
            'error',

          message:
            error instanceof Error
              ? error.message
              : String(error)
        },
        {
          status:
            500
        }
      );
    }
  }
};
