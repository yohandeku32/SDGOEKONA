export const runtime = 'nodejs';

import { connect } from '@tidbcloud/serverless';
import JSZip from 'jszip';


function xmlEscape(value: unknown): string {
  if (value === null || value === undefined) return '';

  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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
        'Content-Type':
          'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods':
          'GET, OPTIONS',
        'Access-Control-Allow-Headers':
          'Content-Type',
        'Cache-Control':
          'no-store',
      },
    }
  );
}

function fileResponse(
  data: Uint8Array,
  mimeType: string,
  filename: string
) {
  return new Response(data, {
    status: 200,
    headers: {
      'Content-Type': mimeType,
      'Content-Disposition':
        `attachment; filename="${filename}"`,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods':
        'GET, OPTIONS',
      'Cache-Control':
        'no-store',
    },
  });
}

async function zipFiles(
  files: Array<{
    name: string;
    data: string;
  }>
) {
  const zip =
    new JSZip();

  for (const file of files) {
    zip.file(
      file.name,
      file.data
    );
  }

  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: {
      level: 6,
    },
  });
}

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

    if (row.status === 'PULANG' && !row.jam_masuk) {
      masuk = '';
      pulang = parts[0] || '';
    }
  }

  return {
    masuk: masuk || '-',
    pulang: pulang || '-',
  };
}

function driveUrl(fileId?: string | null) {
  return fileId
    ? `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`
    : '';
}

function cell(value: unknown, style = 0) {
  return (
    `<c t="inlineStr" s="${style}"><is><t xml:space="preserve">${xmlEscape(
      value
    )}</t></is></c>`
  );
}

function linkCell(
  text: string,
  url: string,
  style = 3
) {
  if (!url) {
    return cell('Tidak ada', style);
  }

  return (
    `<c s="${style}"><f>HYPERLINK(&quot;${xmlEscape(
      url
    )}&quot;,&quot;${xmlEscape(
      text
    )}&quot;)</f><v>${xmlEscape(
      text
    )}</v></c>`
  );
}


function formatDate(value: unknown): string {
  const text = String(value ?? '');

  if (!text) {
    return '-';
  }

  const parts = text.split('-');

  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }

  return text;
}

function buildSheet(
  rows: RowData[],
  bulan: string,
  tahun: string
) {
  const headers = [
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
    'FOTO PULANG',
  ];

  const body: string[] = [];

  rows.forEach((row, index) => {
    const jam = normalizeJam(row);

    const identityLabel = row.nip
      ? 'NIP'
      : row.nik
        ? 'NIK'
        : '-';

    const identityNumber =
      row.nip ||
      row.nik ||
      '-';

    body.push(
      `<row r="${index + 6}">` +
        cell(index + 1) +
        cell(row.name || '-', 1) +
        cell(identityLabel) +
        cell(identityNumber) +
        cell(
          row.status_kepegawaian || '-'
        ) +
        cell(
          row.golongan_ruang || '-'
        ) +
        cell(row.jabatan || '-') +
        cell(formatDate(row.date)) +
        cell(jam.masuk) +
        cell(jam.pulang) +
        cell(row.status || '-') +
        cell(row.keterangan || '-') +
        linkCell(
          row.foto_masuk_file_id
            ? 'Lihat Foto'
            : 'Tidak ada',
          driveUrl(
            row.foto_masuk_file_id
          )
        ) +
        linkCell(
          row.foto_pulang_file_id
            ? 'Lihat Foto'
            : 'Tidak ada',
          driveUrl(
            row.foto_pulang_file_id
          )
        ) +
        '</row>'
    );
  });

  const header =
    `<row r="5">${headers
      .map((h) => cell(h, 2))
      .join('')}</row>`;

  const merges = [
    'A1:N1',
    'A2:N2',
    'A3:N3',
  ]
    .map(
      (ref) =>
        `<mergeCell ref="${ref}"/>`
    )
    .join('');

  const lastRow =
    Math.max(
      6,
      rows.length + 5
    );

  const sheetXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetPr>
    <pageSetUpPr fitToPage="1"/>
  </sheetPr>

  <dimension ref="A1:N${lastRow}"/>

  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="5" state="frozen"/>
    </sheetView>
  </sheetViews>

  <sheetFormatPr defaultRowHeight="18"/>

  <cols>
    <col min="1" max="1" width="7" customWidth="1"/>
    <col min="2" max="2" width="30" customWidth="1"/>
    <col min="3" max="3" width="15" customWidth="1"/>
    <col min="4" max="4" width="24" customWidth="1"/>
    <col min="5" max="5" width="20" customWidth="1"/>
    <col min="6" max="6" width="14" customWidth="1"/>
    <col min="7" max="7" width="24" customWidth="1"/>
    <col min="8" max="10" width="14" customWidth="1"/>
    <col min="11" max="11" width="19" customWidth="1"/>
    <col min="12" max="12" width="22" customWidth="1"/>
    <col min="13" max="14" width="18" customWidth="1"/>
  </cols>

  <sheetData>
    <row r="1" ht="25" customHeight="1">
      ${cell(
        'LAPORAN ABSENSI GURU DAN PEGAWAI',
        4
      )}
    </row>

    <row r="2" ht="21" customHeight="1">
      ${cell('SD GMIT OEKONA', 4)}
    </row>

    <row r="3" ht="21" customHeight="1">
      ${cell(
        `BULAN ${MONTHS[bulan] || bulan} ${tahun}`,
        4
      )}
    </row>

    <row r="4">
      ${cell('')}
    </row>

    ${header}

    ${body.join('\n')}
  </sheetData>

  <mergeCells count="3">
    ${merges}
  </mergeCells>

  <pageMargins
    left="0.25"
    right="0.25"
    top="0.35"
    bottom="0.35"
    header="0.15"
    footer="0.15"
  />

  <pageSetup
    paperSize="9"
    orientation="landscape"
    fitToWidth="1"
    fitToHeight="0"
  />

  <autoFilter
    ref="A5:N${Math.max(
      5,
      rows.length + 5
    )}"
  />
</worksheet>`;

  return sheetXml;
}

function buildStyles() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">

  <fonts count="5">
    <font>
      <sz val="10"/>
      <name val="Arial"/>
    </font>
    <font>
      <b/>
      <sz val="10"/>
      <name val="Arial"/>
    </font>
    <font>
      <b/>
      <sz val="9"/>
      <name val="Arial"/>
    </font>
    <font>
      <sz val="10"/>
      <name val="Arial"/>
      <color rgb="0563C1"/>
      <u/>
    </font>
    <font>
      <b/>
      <sz val="14"/>
      <name val="Arial"/>
    </font>
  </fonts>

  <fills count="3">
    <fill>
      <patternFill patternType="none"/>
    </fill>
    <fill>
      <patternFill patternType="gray125"/>
    </fill>
    <fill>
      <patternFill patternType="solid">
        <fgColor rgb="D9EAF7"/>
        <bgColor indexed="64"/>
      </patternFill>
    </fill>
  </fills>

  <borders count="2">
    <border>
      <left/>
      <right/>
      <top/>
      <bottom/>
      <diagonal/>
    </border>
    <border>
      <left style="thin"/>
      <right style="thin"/>
      <top style="thin"/>
      <bottom style="thin"/>
      <diagonal/>
    </border>
  </borders>

  <cellStyleXfs count="1">
    <xf
      numFmtId="0"
      fontId="0"
      fillId="0"
      borderId="0"
    />
  </cellStyleXfs>

  <cellXfs count="5">
    <xf
      numFmtId="0"
      fontId="0"
      fillId="0"
      borderId="1"
      applyAlignment="1"
    >
      <alignment
        vertical="center"
        wrapText="1"
        horizontal="center"
      />
    </xf>

    <xf
      numFmtId="0"
      fontId="1"
      fillId="0"
      borderId="1"
      applyAlignment="1"
    >
      <alignment
        vertical="center"
        wrapText="1"
        horizontal="left"
      />
    </xf>

    <xf
      numFmtId="0"
      fontId="2"
      fillId="2"
      borderId="1"
      applyAlignment="1"
    >
      <alignment
        vertical="center"
        wrapText="1"
        horizontal="center"
      />
    </xf>

    <xf
      numFmtId="0"
      fontId="3"
      fillId="0"
      borderId="1"
      applyAlignment="1"
    >
      <alignment
        vertical="center"
        wrapText="1"
        horizontal="center"
      />
    </xf>

    <xf
      numFmtId="0"
      fontId="4"
      fillId="0"
      borderId="0"
      applyAlignment="1"
    >
      <alignment
        vertical="center"
        horizontal="center"
      />
    </xf>
  </cellXfs>

</styleSheet>`;
}

async function buildXlsx(
  rows: RowData[],
  bulan: string,
  tahun: string
) {
  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">

  <Default
    Extension="rels"
    ContentType="application/vnd.openxmlformats-package.relationships+xml"
  />

  <Default
    Extension="xml"
    ContentType="application/xml"
  />

  <Override
    PartName="/xl/workbook.xml"
    ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"
  />

  <Override
    PartName="/xl/worksheets/sheet1.xml"
    ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"
  />

  <Override
    PartName="/xl/styles.xml"
    ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"
  />

</Types>`;

  const rels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship
    Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
    Target="xl/workbook.xml"
  />
</Relationships>`;

  const workbook =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook
  xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
>
  <sheets>
    <sheet
      name="Laporan Absensi"
      sheetId="1"
      r:id="rId1"
    />
  </sheets>
</workbook>`;

  const workbookRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">

  <Relationship
    Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"
    Target="worksheets/sheet1.xml"
  />

  <Relationship
    Id="rId2"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"
    Target="styles.xml"
  />

</Relationships>`;

  return zipFiles([
    {
      name: '[Content_Types].xml',
      data: contentTypes,
    },
    {
      name: '_rels/.rels',
      data: rels,
    },
    {
      name: 'xl/workbook.xml',
      data: workbook,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: workbookRels,
    },
    {
      name: 'xl/styles.xml',
      data: buildStyles(),
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      data: buildSheet(
        rows,
        bulan,
        tahun
      ),
    },
  ]);
}

async function handleExport(
  request: Request
) {
  if (request.method === 'OPTIONS') {
    return jsonResponse(null, 204);
  }

  if (request.method !== 'GET') {
    return jsonResponse(
      {
        status: 'error',
        message: 'Method tidak didukung.',
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

    const rawUrl =
      request.url || '';

    const requestOrigin =
      request.headers.get('origin') ||
      (request.headers.get('x-forwarded-proto') &&
        request.headers.get('host')
        ? `${request.headers.get('x-forwarded-proto')}://${request.headers.get('host')}`
        : request.headers.get('host')
          ? `https://${request.headers.get('host')}`
          : 'https://sdgoekona.vercel.app');

    const url =
      new URL(
        rawUrl,
        requestOrigin
      );

    let bulan =
      url.searchParams.get('bulan') ||
      '';

    bulan =
      bulan.padStart(2, '0');

    const tahun =
      url.searchParams.get('tahun') ||
      '';

    const idUser =
      url.searchParams.get('id_user') ||
      '';

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

    const params: Array<string | number> = [
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
      await buildXlsx(
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
        ? String(
            rows[0]?.name ||
              'Guru'
          )
            .replace(
              /[\\/:*?"<>|]/g,
              '-'
            )
            .replace(
              /\s+/g,
              '_'
            )
        : 'Semua_Guru';

    return fileResponse(
      bytes,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
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
