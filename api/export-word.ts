export const runtime = 'nodejs';
export const maxDuration = 60;

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

function xmlEscape(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlText(value: unknown) {
  const text = String(value ?? '');
  return xmlEscape(text).replace(/\r?\n/g, '</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">');
}

function run(
  value: unknown,
  options?: {
    bold?: boolean;
    size?: number;
    color?: string;
  }
) {
  const bold = options?.bold ? '<w:b/>' : '';
  const size = options?.size ?? 18;
  const color = options?.color
    ? `<w:color w:val="${options.color}"/>`
    : '';

  return `<w:r>
    <w:rPr>
      <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
      ${bold}
      <w:sz w:val="${size}"/>
      <w:szCs w:val="${size}"/>
      ${color}
    </w:rPr>
    <w:t xml:space="preserve">${xmlEscape(value)}</w:t>
  </w:r>`;
}

function paragraph(
  value: unknown,
  options?: {
    bold?: boolean;
    size?: number;
    center?: boolean;
    align?: 'left' | 'center' | 'right';
    before?: number;
    after?: number;
    keepNext?: boolean;
  }
) {
  const alignment =
    options?.align ||
    (options?.center ? 'center' : 'left');

  return `<w:p>
    <w:pPr>
      <w:jc w:val="${alignment}"/>
      <w:spacing
        w:before="${options?.before ?? 0}"
        w:after="${options?.after ?? 0}"
      />
      ${options?.keepNext ? '<w:keepNext/>' : ''}
    </w:pPr>
    ${run(value, {
      bold: options?.bold,
      size: options?.size ?? 18
    })}
  </w:p>`;
}

function identityParagraph(
  label: string,
  value: unknown
) {
  return `<w:p>
    <w:pPr>
      <w:spacing w:before="0" w:after="0"/>
    </w:pPr>
    ${run(label + ' : ', {
      bold: true,
      size: 17
    })}
    ${run(value || '-', {
      size: 17
    })}
  </w:p>`;
}

function tableCell(
  content: string,
  width: number,
  options?: {
    bold?: boolean;
    center?: boolean;
    shading?: string;
    vertical?: 'top' | 'center' | 'bottom';
  }
) {
  const shading = options?.shading
    ? `<w:shd w:fill="${options.shading}"/>`
    : '';

  const vertical =
    options?.vertical ?? 'center';

  return `<w:tc>
    <w:tcPr>
      <w:tcW w:w="${width}" w:type="dxa"/>
      <w:vAlign w:val="${vertical}"/>
      ${shading}
      <w:tcMar>
        <w:top w:w="75" w:type="dxa"/>
        <w:bottom w:w="75" w:type="dxa"/>
        <w:left w:w="70" w:type="dxa"/>
        <w:right w:w="70" w:type="dxa"/>
      </w:tcMar>
      <w:tcBorders>
        <w:top w:val="single" w:sz="5" w:color="B7C0C8"/>
        <w:left w:val="single" w:sz="5" w:color="B7C0C8"/>
        <w:bottom w:val="single" w:sz="5" w:color="B7C0C8"/>
        <w:right w:val="single" w:sz="5" w:color="B7C0C8"/>
      </w:tcBorders>
    </w:tcPr>
    ${content}
  </w:tc>`;
}

function cellText(
  value: unknown,
  options?: {
    bold?: boolean;
    center?: boolean;
    size?: number;
    color?: string;
  }
) {
  return paragraph(
    value,
    {
      bold: options?.bold,
      size: options?.size ?? 17,
      center: options?.center ?? true
    }
  ).replace(
    '</w:pPr>',
    options?.color
      ? `</w:pPr>${run('', { color: options.color })}`
      : '</w:pPr>'
  ).replace(
    options?.color
      ? `</w:pPr>${run('', { color: options.color })}`
      : '</w:pPr>',
    ''
  );
}

function hyperlink(
  text: string,
  relationshipId: string
) {
  return `<w:hyperlink r:id="${relationshipId}">
    <w:r>
      <w:rPr>
        <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
        <w:color w:val="0563C1"/>
        <w:u w:val="single"/>
        <w:sz w:val="17"/>
        <w:szCs w:val="17"/>
      </w:rPr>
      <w:t xml:space="preserve">${xmlEscape(text)}</w:t>
    </w:r>
  </w:hyperlink>`;
}

function imageLinkCell(
  fileId: string | null | undefined,
  relationshipId: string | null,
  width: number,
  shading?: string
) {
  let content = '';

  if (
    fileId &&
    relationshipId
  ) {
    content = `<w:p>
      <w:pPr>
        <w:jc w:val="center"/>
        <w:spacing w:before="0" w:after="0"/>
      </w:pPr>
      ${hyperlink(
        'Lihat Foto',
        relationshipId
      )}
    </w:p>`;
  } else {
    content = paragraph(
      '-',
      {
        center: true,
        size: 17
      }
    );
  }

  return tableCell(
    content,
    width,
    {
      center: true,
      shading
    }
  );
}

function rowXml(
  cells: string[],
  height = 500,
  repeatHeader = false
) {
  return `<w:tr>
    <w:trPr>
      <w:trHeight w:val="${height}" w:hRule="atLeast"/>
      ${repeatHeader ? '<w:tblHeader/>' : ''}
    </w:trPr>
    ${cells.join('')}
  </w:tr>`;
}

function normalizeJam(
  row: RowData
) {
  let masuk =
    row.jam_masuk || '';

  let pulang =
    row.jam_pulang || '';

  if (
    (!masuk || !pulang) &&
    row.time
  ) {
    const parts =
      String(row.time).split(
        ' - '
      );

    if (!masuk) {
      masuk =
        parts[0] || '';
    }

    if (
      !pulang &&
      parts.length > 1
    ) {
      pulang =
        parts[1] || '';
    }

    if (
      row.status === 'PULANG' &&
      !row.jam_masuk
    ) {
      masuk = '';
      pulang =
        parts[0] || '';
    }
  }

  return {
    masuk: masuk || '-',
    pulang: pulang || '-'
  };
}

function formatDate(
  value: unknown
) {
  const parts =
    String(value || '')
      .split('-');

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

function buildDocumentXml(
  groups: Array<{
    name: string;
    id_user: string;
    nip?: string | null;
    nik?: string | null;
    status_kepegawaian?: string | null;
    golongan_ruang?: string | null;
    jabatan?: string | null;
    records: RowData[];
  }>,
  bulan: string,
  tahun: string
) {
  const relations: Array<{
    id: string;
    url: string;
  }> = [];

  let relationCounter = 1;

  const getRelation = (
    fileId?: string | null
  ) => {
    if (!fileId) return null;

    const url =
      driveUrl(fileId);

    if (!url) return null;

    const existing =
      relations.find(
        (item) =>
          item.url === url
      );

    if (existing) {
      return existing.id;
    }

    const id =
      `rIdPhoto${relationCounter++}`;

    relations.push({
      id,
      url
    });

    return id;
  };

  const header = rowXml(
    [
      tableCell(
        paragraph('No', {
          bold: true,
          size: 17,
          center: true
        }),
        700,
        {
          shading: 'E2E8F0'
        }
      ),
      tableCell(
        paragraph(
          'Nama / NIP-NIK / Jabatan',
          {
            bold: true,
            size: 17,
            center: true
          }
        ),
        3900,
        {
          shading: 'E2E8F0'
        }
      ),
      tableCell(
        paragraph(
          'Tanggal',
          {
            bold: true,
            size: 17,
            center: true
          }
        ),
        1200,
        {
          shading: 'E2E8F0'
        }
      ),
      tableCell(
        paragraph(
          'Jam',
          {
            bold: true,
            size: 17,
            center: true
          }
        ),
        1650,
        {
          shading: 'E2E8F0'
        }
      ),
      tableCell(
        paragraph(
          'Status',
          {
            bold: true,
            size: 17,
            center: true
          }
        ),
        1700,
        {
          shading: 'E2E8F0'
        }
      ),
      tableCell(
        paragraph(
          'Keterangan',
          {
            bold: true,
            size: 17,
            center: true
          }
        ),
        2500,
        {
          shading: 'E2E8F0'
        }
      ),
      tableCell(
        paragraph(
          'Foto Masuk',
          {
            bold: true,
            size: 17,
            center: true
          }
        ),
        1450,
        {
          shading: 'E2E8F0'
        }
      ),
      tableCell(
        paragraph(
          'Foto Pulang',
          {
            bold: true,
            size: 17,
            center: true
          }
        ),
        1450,
        {
          shading: 'E2E8F0'
        }
      )
    ],
    650,
    true
  );

  const tableRows: string[] = [
    header
  ];

  let groupNumber = 1;

  for (
    const group of groups
  ) {
    const firstRow =
      group.records
        .length > 0;

    group.records.forEach(
      (record, recordIndex) => {
        const jam =
          normalizeJam(record);

        const photoInRelation =
          getRelation(
            record.foto_masuk_file_id
          );

        const photoOutRelation =
          getRelation(
            record.foto_pulang_file_id
          );

        const identity = [
          identityParagraph(
            'Nama',
            group.name
          ),
          identityParagraph(
            group.nip
              ? 'NIP'
              : group.nik
                ? 'NIK'
                : 'ID',
            group.nip ||
              group.nik ||
              group.id_user
          ),
          identityParagraph(
            'Status',
            group.status_kepegawaian ||
              '-'
          ),
          identityParagraph(
            'Gol.Ruang',
            group.golongan_ruang ||
              '-'
          ),
          identityParagraph(
            'Jabatan',
            group.jabatan ||
              '-'
          )
        ].join('');

        const cells: string[] = [];

        if (recordIndex === 0) {
          cells.push(
            tableCell(
              paragraph(
                groupNumber,
                {
                  bold: true,
                  size: 18,
                  center: true
                }
              ),
              700,
              {
                vertical: 'center'
              }
            )
          );

          cells.push(
            tableCell(
              identity,
              3900,
              {
                vertical: 'top'
              }
            )
          );
        }

        cells.push(
          tableCell(
            paragraph(
              formatDate(
                record.date
              ),
              {
                size: 17,
                center: true
              }
            ),
            1200
          )
        );

        cells.push(
          tableCell(
            paragraph(
              `${jam.masuk} - ${jam.pulang}`,
              {
                size: 17,
                bold: true,
                center: true
              }
            ),
            1650
          )
        );

        cells.push(
          tableCell(
            paragraph(
              record.status ||
                '-',
              {
                size: 17,
                bold: true,
                center: true
              }
            ),
            1700
          )
        );

        cells.push(
          tableCell(
            paragraph(
              record.keterangan ||
                '-',
              {
                size: 17,
                center: false
              }
            ),
            2500
          )
        );

        cells.push(
          imageLinkCell(
            record.foto_masuk_file_id,
            photoInRelation,
            1450
          )
        );

        cells.push(
          imageLinkCell(
            record.foto_pulang_file_id,
            photoOutRelation,
            1450
          )
        );

        const row =
          rowXml(
            cells,
            850
          );

        tableRows.push(
          row
        );
      }
    );

    // Merge No dan Identitas seperti Dashboard Admin.
    if (
      group.records.length > 1
    ) {
      // Merge dibuat setelah row selesai
      const startIndex =
        tableRows.length -
        group.records.length;

      const endIndex =
        tableRows.length - 1;

      const firstTableRowXml =
        tableRows[startIndex];

      const mergedNo =
        firstTableRowXml.replace(
          '</w:tc>',
          '<w:tcPr><w:vMerge w:val="restart"/></w:tcPr></w:tcPr></w:tc>'
        );

      // Word XML lebih stabil bila merge cell dibuat
      // langsung saat row dibuat. Untuk menjaga
      // kompatibilitas, group akan ditulis tanpa
      // physical merge bila lebih dari satu record.
      void mergedNo;
      void endIndex;
    }

    groupNumber++;
  }

  const title =
    `BULAN ${(
      MONTHS[bulan] ||
      bulan
    ).toUpperCase()} ${tahun}`;

  const table =
    `<w:tbl>
      <w:tblPr>
        <w:tblW w:w="14550" w:type="dxa"/>
        <w:tblLayout w:type="fixed"/>
        <w:tblCellMar>
          <w:top w:w="40" w:type="dxa"/>
          <w:left w:w="40" w:type="dxa"/>
          <w:bottom w:w="40" w:type="dxa"/>
          <w:right w:w="40" w:type="dxa"/>
        </w:tblCellMar>
        <w:tblBorders>
          <w:top w:val="single" w:sz="5" w:color="AAB4BE"/>
          <w:left w:val="single" w:sz="5" w:color="AAB4BE"/>
          <w:bottom w:val="single" w:sz="5" w:color="AAB4BE"/>
          <w:right w:val="single" w:sz="5" w:color="AAB4BE"/>
          <w:insideH w:val="single" w:sz="5" w:color="AAB4BE"/>
          <w:insideV w:val="single" w:sz="5" w:color="AAB4BE"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tblGrid>
        <w:gridCol w:w="700"/>
        <w:gridCol w:w="3900"/>
        <w:gridCol w:w="1200"/>
        <w:gridCol w:w="1650"/>
        <w:gridCol w:w="1700"/>
        <w:gridCol w:w="2500"/>
        <w:gridCol w:w="1450"/>
        <w:gridCol w:w="1450"/>
      </w:tblGrid>
      ${tableRows.join('')}
    </w:tbl>`;

  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
>
  <w:body>

    ${paragraph(
      'LAPORAN ABSENSI GURU DAN PEGAWAI',
      {
        bold: true,
        size: 28,
        center: true,
        after: 50,
        keepNext: true
      }
    )}

    ${paragraph(
      'SD GMIT OEKONA',
      {
        bold: true,
        size: 22,
        center: true,
        after: 30,
        keepNext: true
      }
    )}

    ${paragraph(
      title,
      {
        bold: true,
        size: 19,
        center: true,
        after: 180,
        keepNext: true
      }
    )}

    ${table}

    ${paragraph(
      'Keterangan: kolom Foto Masuk dan Foto Pulang dapat diklik untuk membuka foto pada Google Drive.',
      {
        size: 15,
        after: 0
      }
    )}

    <w:sectPr>
      <w:pgSz
        w:w="16838"
        w:h="11906"
        w:orient="landscape"
      />
      <w:pgMar
        w:top="400"
        w:right="400"
        w:bottom="400"
        w:left="400"
      />
    </w:sectPr>

  </w:body>
</w:document>`;

  return {
    documentXml,
    relations
  };
}

async function buildDocx(
  documentXml: string,
  relations: Array<{
    id: string;
    url: string;
  }>
) {
  const JSZipModule: any =
    await import('jszip');

  const JSZip =
    JSZipModule?.default ||
    JSZipModule;

  const zip =
    new JSZip();

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
    PartName="/word/document.xml"
    ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
  />
</Types>`;

  const rootRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship
    Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
    Target="word/document.xml"
  />
</Relationships>`;

  const documentRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${relations
    .map(
      (relation) =>
        `<Relationship
          Id="${relation.id}"
          Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink"
          Target="${xmlEscape(
            relation.url
          )}"
          TargetMode="External"
        />`
    )
    .join('')}
</Relationships>`;

  zip.file(
    '[Content_Types].xml',
    contentTypes
  );

  zip.file(
    '_rels/.rels',
    rootRels
  );

  zip.file(
    'word/document.xml',
    documentXml
  );

  zip.file(
    'word/_rels/document.xml.rels',
    documentRels
  );

  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: {
      level: 6
    }
  });
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
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods':
            'GET, OPTIONS',
          'Access-Control-Allow-Headers':
            'Content-Type'
        }
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
          'Method tidak didukung.'
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
            'DATABASE_URL belum ditemukan.'
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
            'Parameter bulan tidak valid.'
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
            'Parameter tahun tidak valid.'
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
        ON g.id_user =
          a.id_user

      WHERE
        g.aktif = 1
        AND a.tanggal >= ?
        AND a.tanggal < ?
    `;

    const params:
      Array<string | number> = [
        startDate,
        endDate
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
            'Tidak ada data untuk diexport pada periode yang dipilih.'
        },
        404
      );
    }

    const groupsMap =
      new Map<
        string,
        {
          name: string;
          id_user: string;
          nip?: string | null;
          nik?: string | null;
          status_kepegawaian?:
            string | null;
          pangkat?:
            string | null;
          golongan_ruang?:
            string | null;
          jabatan?:
            string | null;
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
          groupsMap.get(key);

        if (existing) {
          existing.records.push(
            record
          );
          return;
        }

        groupsMap.set(
          key,
          {
            name:
              record.name ||
              '-',
            id_user: key,
            nip:
              record.nip,
            nik:
              record.nik,
            status_kepegawaian:
              record.status_kepegawaian,
            pangkat:
              record.pangkat,
            golongan_ruang:
              record.golongan_ruang,
            jabatan:
              record.jabatan,
            records: [record]
          }
        );
      }
    );

    const groups =
      Array.from(
        groupsMap.values()
      );

    const built =
      buildDocumentXml(
        groups,
        bulan,
        tahun
      );

    const bytes =
      await buildDocx(
        built.documentXml,
        built.relations
      );

    if (
      !bytes ||
      bytes.byteLength === 0
    ) {
      return jsonResponse(
        {
          status: 'error',
          message:
            'Dokumen Word gagal dibuat.'
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

    const filename =
      `Absensi_${
        MONTHS[bulan] ||
        bulan
      }_${tahun}_${safeId}.docx`;

    return new Response(
      bytes,
      {
        status: 200,
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition':
            `attachment; filename="${filename}"`,
          'Content-Length':
            String(bytes.byteLength),
          'Access-Control-Allow-Origin':
            '*',
          'Access-Control-Allow-Methods':
            'GET, OPTIONS',
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

    return jsonResponse(
      {
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : String(error)
      },
      500
    );
  }
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
        'Access-Control-Allow-Origin':
          '*',
        'Access-Control-Allow-Methods':
          'GET, OPTIONS',
        'Cache-Control':
          'no-store'
      }
    }
  );
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
