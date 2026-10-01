import { connect } from '@tidbcloud/serverless';
import { SCHOOL_CONFIG, LOGO_KABUPATEN_URL, LOGO_TUT_WURI_URL } from './school-config';
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

type GuruRow = {
  id_user: string;
  nama: string;
  nip?: string | null;
  nik?: string | null;
  status_kepegawaian?: string | null;
  golongan_ruang?: string | null;
  jabatan?: string | null;
};

type AttendanceRow = {
  id_user: string;
  tanggal: string;
  jam_masuk?: string | null;
  keterangan?: string | null;
};

type Category =
  | 'hadir'
  | 'tanpaBerita'
  | 'ijin'
  | 'sakit'
  | 'dinasLuar';

type RecapRow = {
  id_user: string;
  nama: string;
  nipNik: string;
  golongan: string;
  jabatan: string;
  statusKepegawaian: string;
  jumlahHariKerja: number;
  tanpaBerita: number;
  ijin: number;
  sakit: number;
  dinasLuar: number;
  jumlahTidakHadir: number;
  terlambat: number;
  jumlahHariHadir: number;
  keterangan: string;
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

const BATAS_TERLAMBAT = '07:15';




const KEPALA_SEKOLAH_NAMA = SCHOOL_CONFIG.headmasterName;

const KEPALA_SEKOLAH_IDENTITAS =
  `${SCHOOL_CONFIG.headmasterIdentityLabel} ${SCHOOL_CONFIG.headmasterIdentity}`;

/*
 * Lebar tabel dibuat agar muat A4 Landscape.
 */
const COLUMN_WIDTHS = [
  500,  // No
  2300, // Nama
  1800, // NIP/NIK
  900,  // Pangkat/Gol
  1400, // Jabatan
  1000, // Status
  900,  // Hari Kerja
  700,  // Tanpa Berita
  500,  // Ijin
  500,  // Sakit
  700,  // Dinas Luar
  600,  // Jumlah
  700,  // Terlambat
  900,  // Hari Hadir
  1200  // Keterangan
];

const TABLE_WIDTH =
  COLUMN_WIDTHS.reduce((sum, width) => sum + width, 0);

const BORDER = {
  style: BorderStyle.SINGLE,
  size: 4,
  color: '000000'
};

const CELL_MARGINS = {
  top: 60,
  bottom: 60,
  left: 70,
  right: 70
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
    {
      status: 'error',
      message
    },
    {
      status: 400
    }
  );
}

function parseTimeToMinutes(value?: string | null) {
  const match =
    String(value || '').match(/^(\d{1,2}):(\d{2})/);

  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return hour * 60 + minute;
}

function getTodayMakassar() {
  const parts =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone: 'Asia/Makassar',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }
    ).formatToParts(new Date());

  const map =
    Object.fromEntries(
      parts.map((part) => [part.type, part.value])
    );

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day)
  };
}

function getWorkDatesMondayToSaturday(
  year: number,
  month: number
) {
  const result: string[] = [];
  const today = getTodayMakassar();

  const lastDay =
    new Date(
      Date.UTC(year, month, 0)
    ).getUTCDate();

  const isCurrentMonth =
    year === today.year &&
    month === today.month;

  const isFutureMonth =
    year > today.year ||
    (
      year === today.year &&
      month > today.month
    );

  if (isFutureMonth) {
    return result;
  }

  const endDay =
    isCurrentMonth
      ? Math.min(today.day, lastDay)
      : lastDay;

  for (let day = 1; day <= endDay; day++) {
    const weekday =
      new Date(
        Date.UTC(year, month - 1, day)
      ).getUTCDay();

    // Minggu tidak dihitung sebagai hari kerja.
    if (weekday === 0) {
      continue;
    }

    result.push(
      `${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    );
  }

  return result;
}

function getCategory(
  keterangan?: string | null
): Category {
  const text =
    String(keterangan || '')
      .trim()
      .toLowerCase();

  if (
    text.includes('tanpa berita') ||
    text.includes('alpa') ||
    text.includes('alpha')
  ) {
    return 'tanpaBerita';
  }

  if (
    text.includes('ijin') ||
    text.includes('izin')
  ) {
    return 'ijin';
  }

  if (text.includes('sakit')) {
    return 'sakit';
  }

  if (
    text.includes('dinas luar') ||
    text === 'dl' ||
    text.includes('dinas')
  ) {
    return 'dinasLuar';
  }

  return 'hadir';
}

function makeParagraph(
  text: string,
  options?: {
    bold?: boolean;
    size?: number;
    center?: boolean;
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
        bold: options?.bold || false,
        size: options?.size || 15,
        font: 'Arial'
      })
    ]
  });
}

function textCell(
  text: string,
  width: number,
  options?: {
    bold?: boolean;
    center?: boolean;
    shading?: string;
    verticalMerge?:
      typeof VerticalMergeType[
        keyof typeof VerticalMergeType
      ];
    columnSpan?: number;
    size?: number;
  }
) {
  return new TableCell({
    width: {
      size: width,
      type: WidthType.DXA
    },

    verticalAlign: VerticalAlign.CENTER,

    verticalMerge:
      options?.verticalMerge,

    columnSpan:
      options?.columnSpan,

    margins:
      CELL_MARGINS,

    shading:
      options?.shading
        ? {
            type: ShadingType.CLEAR,
            fill: options.shading
          }
        : undefined,

    borders: {
      top: BORDER,
      bottom: BORDER,
      left: BORDER,
      right: BORDER
    },

    children: [
      makeParagraph(
        text,
        {
          bold: options?.bold,
          center: options?.center,
          size: options?.size || 15
        }
      )
    ]
  });
}

async function fetchImageBytes(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Logo KOP gagal dimuat: ${response.status}`
    );
  }

  return new Uint8Array(
    await response.arrayBuffer()
  );
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
        {
          status: 405
        }
      );
    }

    try {
      const databaseUrl =
        process.env.DATABASE_URL;

      if (!databaseUrl) {
        return corsJson(
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

      const url = new URL(request.url);

      const bulan =
        url.searchParams.get('bulan') || '';

      const tahun =
        url.searchParams.get('tahun') || '';

      const idUser =
        url.searchParams.get('id_user') || '';

      const q =
        String(
          url.searchParams.get('q') || ''
        )
          .trim()
          .toLowerCase();

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

      const yearNumber = Number(tahun);
      const monthNumber = Number(bulan);

      const conn =
        connect({
          url: databaseUrl
        });

      let guruSql = `
        SELECT
          id_user,
          nama,
          nip,
          nik,
          status_kepegawaian,
          golongan_ruang,
          jabatan
        FROM guru
        WHERE aktif = 1
          AND role <> 'admin'
      `;

      const guruParams: string[] = [];

      if (idUser) {
        guruSql += `
          AND id_user = ?
        `;

        guruParams.push(idUser);
      }

      guruSql += `
        ORDER BY nama ASC
      `;

      let guruRows =
        await conn.execute(
          guruSql,
          guruParams
        ) as GuruRow[];

      if (q) {
        guruRows =
          guruRows.filter((guru) => {
            const searchable = [
              guru.nama,
              guru.id_user,
              guru.nip,
              guru.nik,
              guru.golongan_ruang,
              guru.jabatan,
              guru.status_kepegawaian
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();

            return searchable.includes(q);
          });
      }

      if (guruRows.length === 0) {
        return corsJson(
          {
            status: 'error',
            message:
              'Tidak ada guru/pegawai pada filter yang dipilih.'
          },
          {
            status: 404
          }
        );
      }

      let attendanceSql = `
        SELECT
          id_user,

          DATE_FORMAT(
            tanggal,
            '%Y-%m-%d'
          ) AS tanggal,

          TIME_FORMAT(
            jam_masuk,
            '%H:%i'
          ) AS jam_masuk,

          keterangan

        FROM absensi
        WHERE
          MONTH(tanggal) = ?
          AND YEAR(tanggal) = ?
      `;

      const attendanceParams:
        (string | number)[] = [
          monthNumber,
          yearNumber
        ];

      if (idUser) {
        attendanceSql += `
          AND id_user = ?
        `;

        attendanceParams.push(idUser);
      }

      attendanceSql += `
        ORDER BY
          id_user ASC,
          tanggal ASC
      `;

      const attendanceRows =
        await conn.execute(
          attendanceSql,
          attendanceParams
        ) as AttendanceRow[];

      const workDates =
        getWorkDatesMondayToSaturday(
          yearNumber,
          monthNumber
        );

      const workDateSet =
        new Set(workDates);

      const lateLimit =
        parseTimeToMinutes(
          BATAS_TERLAMBAT
        ) || 0;

      const attendanceByGuru =
        new Map<
          string,
          AttendanceRow[]
        >();

      attendanceRows.forEach((record) => {
        if (!workDateSet.has(record.tanggal)) {
          return;
        }

        if (!attendanceByGuru.has(record.id_user)) {
          attendanceByGuru.set(
            record.id_user,
            []
          );
        }

        attendanceByGuru
          .get(record.id_user)!
          .push(record);
      });

      const recapRows: RecapRow[] =
        guruRows.map((guru) => {
          const records =
            attendanceByGuru.get(guru.id_user) || [];

          const dayCategory =
            new Map<string, Category>();

          const lateDates =
            new Set<string>();

          records.forEach((record) => {
            const category =
              getCategory(record.keterangan);

            dayCategory.set(
              record.tanggal,
              category
            );

            if (category === 'hadir') {
              const masukMinutes =
                parseTimeToMinutes(
                  record.jam_masuk
                );

              if (
                masukMinutes !== null &&
                masukMinutes > lateLimit
              ) {
                lateDates.add(record.tanggal);
              }
            }
          });

          let hadir = 0;
          let ijin = 0;
          let sakit = 0;
          let dinasLuar = 0;
          let explicitTanpaBerita = 0;

          dayCategory.forEach((category) => {
            if (category === 'hadir') hadir++;
            if (category === 'ijin') ijin++;
            if (category === 'sakit') sakit++;
            if (category === 'dinasLuar') dinasLuar++;
            if (category === 'tanpaBerita') {
              explicitTanpaBerita++;
            }
          });

          const accounted =
            hadir +
            ijin +
            sakit +
            dinasLuar +
            explicitTanpaBerita;

          const automaticTanpaBerita =
            Math.max(
              0,
              workDates.length - accounted
            );

          const tanpaBerita =
            explicitTanpaBerita +
            automaticTanpaBerita;

          return {
            id_user: guru.id_user,
            nama: guru.nama || '-',
            nipNik:
              guru.nip ||
              guru.nik ||
              guru.id_user ||
              '-',
            golongan:
              guru.golongan_ruang || '-',
            jabatan:
              guru.jabatan || '-',
            statusKepegawaian:
              guru.status_kepegawaian || '-',
            jumlahHariKerja:
              workDates.length,
            tanpaBerita,
            ijin,
            sakit,
            dinasLuar,
            jumlahTidakHadir:
              tanpaBerita +
              ijin +
              sakit +
              dinasLuar,
            terlambat:
              lateDates.size,
            jumlahHariHadir:
              hadir,
            keterangan: '-'
          };
        });

      // ==================================================
      // HEADER TABEL 2 BARIS
      // ==================================================

      const headerShading = 'EAF2F8';

      const firstHeaderRow =
        new TableRow({
          tableHeader: true,
          cantSplit: true,
          children: [
            textCell(
              'No.',
              COLUMN_WIDTHS[0],
              {
                bold: true,
                center: true,
                shading: headerShading,
                verticalMerge:
                  VerticalMergeType.RESTART
              }
            ),

            textCell(
              'NAMA',
              COLUMN_WIDTHS[1],
              {
                bold: true,
                center: true,
                shading: headerShading,
                verticalMerge:
                  VerticalMergeType.RESTART
              }
            ),

            textCell(
              'NIP / NIK',
              COLUMN_WIDTHS[2],
              {
                bold: true,
                center: true,
                shading: headerShading,
                verticalMerge:
                  VerticalMergeType.RESTART
              }
            ),

            textCell(
              'PANGKAT / GOL',
              COLUMN_WIDTHS[3],
              {
                bold: true,
                center: true,
                shading: headerShading,
                verticalMerge:
                  VerticalMergeType.RESTART
              }
            ),

            textCell(
              'JABATAN',
              COLUMN_WIDTHS[4],
              {
                bold: true,
                center: true,
                shading: headerShading,
                verticalMerge:
                  VerticalMergeType.RESTART
              }
            ),

            textCell(
              'STATUS',
              COLUMN_WIDTHS[5],
              {
                bold: true,
                center: true,
                shading: headerShading,
                verticalMerge:
                  VerticalMergeType.RESTART
              }
            ),

            textCell(
              'JUMLAH\nHARI KERJA',
              COLUMN_WIDTHS[6],
              {
                bold: true,
                center: true,
                shading: headerShading,
                verticalMerge:
                  VerticalMergeType.RESTART
              }
            ),

            textCell(
              'KETERANGAN',
              COLUMN_WIDTHS
                .slice(7, 13)
                .reduce((a, b) => a + b, 0),
              {
                bold: true,
                center: true,
                shading: headerShading,
                columnSpan: 6
              }
            ),

            textCell(
              'JUMLAH\nHARI HADIR',
              COLUMN_WIDTHS[13],
              {
                bold: true,
                center: true,
                shading: headerShading,
                verticalMerge:
                  VerticalMergeType.RESTART
              }
            ),

            textCell(
              'KETERANGAN',
              COLUMN_WIDTHS[14],
              {
                bold: true,
                center: true,
                shading: headerShading,
                verticalMerge:
                  VerticalMergeType.RESTART
              }
            )
          ]
        });

      const secondHeaderRow =
        new TableRow({
          tableHeader: true,
          cantSplit: true,
          children: [
            ...COLUMN_WIDTHS
              .slice(0, 7)
              .map((width) =>
                textCell(
                  '',
                  width,
                  {
                    shading: headerShading,
                    verticalMerge:
                      VerticalMergeType.CONTINUE
                  }
                )
              ),

            textCell(
              'TANPA\nBERITA',
              COLUMN_WIDTHS[7],
              {
                bold: true,
                center: true,
                shading: headerShading
              }
            ),

            textCell(
              'IJIN',
              COLUMN_WIDTHS[8],
              {
                bold: true,
                center: true,
                shading: headerShading
              }
            ),

            textCell(
              'SAKIT',
              COLUMN_WIDTHS[9],
              {
                bold: true,
                center: true,
                shading: headerShading
              }
            ),

            textCell(
              'DINAS\nLUAR',
              COLUMN_WIDTHS[10],
              {
                bold: true,
                center: true,
                shading: headerShading
              }
            ),

            textCell(
              'JUMLAH',
              COLUMN_WIDTHS[11],
              {
                bold: true,
                center: true,
                shading: headerShading
              }
            ),

            textCell(
              'TERLAMBAT',
              COLUMN_WIDTHS[12],
              {
                bold: true,
                center: true,
                shading: headerShading
              }
            ),

            textCell(
              '',
              COLUMN_WIDTHS[13],
              {
                shading: headerShading,
                verticalMerge:
                  VerticalMergeType.CONTINUE
              }
            ),

            textCell(
              '',
              COLUMN_WIDTHS[14],
              {
                shading: headerShading,
                verticalMerge:
                  VerticalMergeType.CONTINUE
              }
            )
          ]
        });

      const bodyRows =
        recapRows.map(
          (row, index) =>
            new TableRow({
              cantSplit: true,
              children: [
                textCell(
                  String(index + 1),
                  COLUMN_WIDTHS[0],
                  { center: true }
                ),

                textCell(
                  row.nama,
                  COLUMN_WIDTHS[1],
                  { bold: true }
                ),

                textCell(
                  row.nipNik,
                  COLUMN_WIDTHS[2],
                  { center: true }
                ),

                textCell(
                  row.golongan,
                  COLUMN_WIDTHS[3],
                  { center: true }
                ),

                textCell(
                  row.jabatan,
                  COLUMN_WIDTHS[4]
                ),

                textCell(
                  row.statusKepegawaian,
                  COLUMN_WIDTHS[5],
                  { center: true }
                ),

                textCell(
                  String(row.jumlahHariKerja),
                  COLUMN_WIDTHS[6],
                  { center: true, bold: true }
                ),

                textCell(
                  String(row.tanpaBerita),
                  COLUMN_WIDTHS[7],
                  { center: true }
                ),

                textCell(
                  String(row.ijin),
                  COLUMN_WIDTHS[8],
                  { center: true }
                ),

                textCell(
                  String(row.sakit),
                  COLUMN_WIDTHS[9],
                  { center: true }
                ),

                textCell(
                  String(row.dinasLuar),
                  COLUMN_WIDTHS[10],
                  { center: true }
                ),

                textCell(
                  String(row.jumlahTidakHadir),
                  COLUMN_WIDTHS[11],
                  { center: true, bold: true }
                ),

                textCell(
                  String(row.terlambat),
                  COLUMN_WIDTHS[12],
                  { center: true }
                ),

                textCell(
                  String(row.jumlahHariHadir),
                  COLUMN_WIDTHS[13],
                  { center: true, bold: true }
                ),

                textCell(
                  row.keterangan,
                  COLUMN_WIDTHS[14],
                  { center: true }
                )
              ]
            })
        );

      const reportTable =
        new Table({
          rows: [
            firstHeaderRow,
            secondHeaderRow,
            ...bodyRows
          ],

          width: {
            size: TABLE_WIDTH,
            type: WidthType.DXA
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

      const [
        logoKabupatenBytes,
        logoTutWuriBytes
      ] = await Promise.all([
        fetchImageBytes(LOGO_KABUPATEN_URL),
        fetchImageBytes(LOGO_TUT_WURI_URL)
      ]);

      const kopTable =
        new Table({
          width: {
            size: TABLE_WIDTH,
            type: WidthType.DXA
          },

          layout:
            TableLayoutType.FIXED,

          alignment:
            AlignmentType.CENTER,

          columnWidths: [
            1800,
            TABLE_WIDTH - 3600,
            1800
          ],

          borders: {
            top: {
              style: BorderStyle.NIL,
              size: 0,
              color: 'FFFFFF'
            },
            left: {
              style: BorderStyle.NIL,
              size: 0,
              color: 'FFFFFF'
            },
            right: {
              style: BorderStyle.NIL,
              size: 0,
              color: 'FFFFFF'
            },
            insideHorizontal: {
              style: BorderStyle.NIL,
              size: 0,
              color: 'FFFFFF'
            },
            insideVertical: {
              style: BorderStyle.NIL,
              size: 0,
              color: 'FFFFFF'
            },
            bottom: {
              style: BorderStyle.DOUBLE,
              size: 12,
              color: '000000'
            }
          },

          rows: [
            new TableRow({
              cantSplit: true,

              children: [
                new TableCell({
                  width: {
                    size: 1800,
                    type: WidthType.DXA
                  },

                  verticalAlign:
                    VerticalAlign.CENTER,

                  margins: {
                    top: 40,
                    bottom: 80,
                    left: 40,
                    right: 40
                  },

                  borders: {
                    top: { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' },
                    left: { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' },
                    right: { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' },
                    bottom: { style: BorderStyle.DOUBLE, size: 12, color: '000000' }
                  },

                  children: [
                    new Paragraph({
                      alignment:
                        AlignmentType.CENTER,

                      children: [
                        new ImageRun({
                          type: 'png',
                          data: logoKabupatenBytes,
                          transformation: {
                            width: 78,
                            height: 64
                          },
                          altText: {
                            title: 'Logo Kabupaten Kupang',
                            description: 'Logo Kabupaten Kupang',
                            name: 'Logo Kabupaten Kupang'
                          }
                        })
                      ]
                    })
                  ]
                }),

                new TableCell({
                  width: {
                    size:
                      TABLE_WIDTH - 3600,
                    type:
                      WidthType.DXA
                  },

                  verticalAlign:
                    VerticalAlign.CENTER,

                  margins: {
                    top: 30,
                    bottom: 70,
                    left: 40,
                    right: 40
                  },

                  borders: {
                    top: { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' },
                    left: { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' },
                    right: { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' },
                    bottom: { style: BorderStyle.DOUBLE, size: 12, color: '000000' }
                  },

                  children: [
                    new Paragraph({
                      alignment:
                        AlignmentType.CENTER,
                      spacing: {
                        after: 0
                      },
                      children: [
                        new TextRun({
                          text:
                            SCHOOL_CONFIG.government,
                          bold: true,
                          size: 20,
                          font: 'Times New Roman'
                        })
                      ]
                    }),

                    new Paragraph({
                      alignment:
                        AlignmentType.CENTER,
                      spacing: {
                        after: 0
                      },
                      children: [
                        new TextRun({
                          text:
                            SCHOOL_CONFIG.department,
                          bold: true,
                          size: 20,
                          font: 'Times New Roman'
                        })
                      ]
                    }),

                    new Paragraph({
                      alignment:
                        AlignmentType.CENTER,
                      spacing: {
                        after: 0
                      },
                      children: [
                        new TextRun({
                          text:
                            SCHOOL_CONFIG.schoolName,
                          bold: true,
                          size: 23,
                          font: 'Times New Roman'
                        })
                      ]
                    }),

                    new Paragraph({
                      alignment:
                        AlignmentType.CENTER,
                      spacing: {
                        after: 0
                      },
                      children: [
                        new TextRun({
                          text:
                            SCHOOL_CONFIG.address,
                          italics: true,
                          bold: true,
                          size: 15,
                          font: 'Times New Roman'
                        })
                      ]
                    })
                  ]
                }),

                new TableCell({
                  width: {
                    size: 1800,
                    type: WidthType.DXA
                  },

                  verticalAlign:
                    VerticalAlign.CENTER,

                  margins: {
                    top: 40,
                    bottom: 80,
                    left: 40,
                    right: 40
                  },

                  borders: {
                    top: { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' },
                    left: { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' },
                    right: { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' },
                    bottom: { style: BorderStyle.DOUBLE, size: 12, color: '000000' }
                  },

                  children: [
                    new Paragraph({
                      alignment:
                        AlignmentType.CENTER,

                      children: [
                        new ImageRun({
                          type: 'png',
                          data: logoTutWuriBytes,
                          transformation: {
                            width: 70,
                            height: 64
                          },
                          altText: {
                            title: 'Logo Tut Wuri Handayani',
                            description: 'Logo Tut Wuri Handayani',
                            name: 'Logo Tut Wuri Handayani'
                          }
                        })
                      ]
                    })
                  ]
                })
              ]
            })
          ]
        });

      const kopSpacer =
        new Paragraph({
          spacing: {
            after: 40
          },
          children: []
        });

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
                'REKAPITULASI ABSENSI GURU DAN PEGAWAI',
              bold: true,
              size: 25,
              font: 'Arial'
            })
          ]
        });

      const period =
        new Paragraph({
          alignment:
            AlignmentType.CENTER,
          spacing: {
            after: 100
          },
          children: [
            new TextRun({
              text:
                `BULAN ${(MONTHS[bulan] || bulan).toUpperCase()} ${tahun}`,
              bold: true,
              size: 17,
              font: 'Arial'
            })
          ]
        });

      const note =
        new Paragraph({
          spacing: {
            before: 100
          },
          children: [
            new TextRun({
              text:
                `Catatan: Hari kerja dihitung Senin–Sabtu. Untuk bulan berjalan dihitung sampai tanggal hari ini. Batas terlambat ${BATAS_TERLAMBAT}.`,
              size: 14,
              font: 'Arial'
            })
          ]
        });


      const signatureTable =
        new Table({
          width: {
            size: TABLE_WIDTH,
            type: WidthType.DXA
          },

          layout:
            TableLayoutType.FIXED,

          columnWidths: [
            Math.floor(TABLE_WIDTH * 0.58),
            TABLE_WIDTH - Math.floor(TABLE_WIDTH * 0.58)
          ],

          borders: {
            top: { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' },
            bottom: { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' },
            left: { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' },
            right: { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' },
            insideHorizontal: { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' },
            insideVertical: { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' }
          },

          rows: [
            new TableRow({
              cantSplit: true,

              children: [
                new TableCell({
                  width: {
                    size: Math.floor(TABLE_WIDTH * 0.58),
                    type: WidthType.DXA
                  },

                  borders: {
                    top: { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' },
                    bottom: { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' },
                    left: { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' },
                    right: { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' }
                  },

                  children: [
                    new Paragraph({
                      children: []
                    })
                  ]
                }),

                new TableCell({
                  width: {
                    size: TABLE_WIDTH - Math.floor(TABLE_WIDTH * 0.58),
                    type: WidthType.DXA
                  },

                  verticalAlign:
                    VerticalAlign.TOP,

                  margins: {
                    top: 180,
                    bottom: 20,
                    left: 40,
                    right: 40
                  },

                  borders: {
                    top: { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' },
                    bottom: { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' },
                    left: { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' },
                    right: { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' }
                  },

                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      spacing: { after: 0 },
                      children: [
                        new TextRun({
                          text: 'Mengetahui,',
                          size: 16,
                          font: 'Arial'
                        })
                      ]
                    }),

                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      spacing: { after: 0 },
                      children: [
                        new TextRun({
                          text: 'Kepala Sekolah',
                          size: 16,
                          font: 'Arial'
                        })
                      ]
                    }),

                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      spacing: {
                        before: 0,
                        after: 0
                      },
                      children: [
                        new TextRun({
                          text: '\n\n\n',
                          size: 18,
                          font: 'Arial'
                        })
                      ]
                    }),

                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      spacing: { after: 0 },
                      children: [
                        new TextRun({
                          text: KEPALA_SEKOLAH_NAMA,
                          bold: true,
                          underline: {},
                          size: 16,
                          font: 'Arial'
                        })
                      ]
                    }),

                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      spacing: { after: 0 },
                      children: [
                        new TextRun({
                          text: KEPALA_SEKOLAH_IDENTITAS,
                          size: 15,
                          font: 'Arial'
                        })
                      ]
                    })
                  ]
                })
              ]
            })
          ]
        });

      const doc =
        new Document({
          creator:
            `Sistem Absensi ${SCHOOL_CONFIG.schoolName}`,

          title:
            `Rekap Absensi ${MONTHS[bulan] || bulan} ${tahun}`,

          styles: {
            default: {
              document: {
                run: {
                  font: 'Arial',
                  size: 15
                },
                paragraph: {
                  spacing: {
                    after: 0
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
                    width: 11906,
                    height: 16838,
                    orientation:
                      PageOrientation.LANDSCAPE
                  },
                  margin: {
                    top: 300,
                    right: 300,
                    bottom: 300,
                    left: 300,
                    header: 0,
                    footer: 0,
                    gutter: 0
                  }
                }
              },

              children: [
                kopTable,
                kopSpacer,
                title,
                period,
                reportTable,
                note,
                signatureTable
              ]
            }
          ]
        });

      const buffer =
        await Packer.toBuffer(doc);

      const bytes =
        new Uint8Array(
          buffer.buffer,
          buffer.byteOffset,
          buffer.byteLength
        );

      const fileName =
        `Rekap_Absensi_${MONTHS[bulan] || bulan}_${tahun}.docx`;

      return new Response(
        streamBytes(bytes),
        {
          status: 200,
          headers: {
            'Content-Type':
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
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
        'EXPORT REKAP WORD ERROR:',
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
        {
          status: 500
        }
      );
    }
  }
};
