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
  bytes: Uint8Array;
  width: number;
  height: number;
  extension: 'jpg' | 'png';
};

type ImageRelation = {
  id: string;
  target: string;
  fileId: string;
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

const PHOTO_BATCH_SIZE = 25;

// Ukuran maksimum foto tetap proporsional terhadap foto asli.
// Kolom foto dibuat cukup longgar agar foto tidak menempel pada garis tabel.
const PHOTO_COLUMN_WIDTH_TWIPS = 2600;
const PHOTO_COLUMN_HORIZONTAL_PADDING_TWIPS = 110;
const PHOTO_COLUMN_VERTICAL_PADDING_TWIPS = 120;

const MAX_IMAGE_WIDTH_EMU = 1520000;
const MAX_IMAGE_HEIGHT_EMU = 2650000;

function headers() {
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
        ...headers(),
        'Content-Type':
          'application/json; charset=utf-8',
      },
    }
  );
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

function xmlEscape(
  value: unknown
) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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
    pulang: pulang || '-',
  };
}

function formatDate(
  value: unknown
) {
  const parts =
    String(value || '')
      .split('-');

  return parts.length === 3
    ? `${parts[2]}-${parts[1]}-${parts[0]}`
    : String(value || '-');
}

function base64ToBytes(
  value: string
) {
  const clean =
    value.includes(',')
      ? value.substring(
          value.indexOf(',') + 1
        )
      : value;

  const binary =
    atob(clean);

  const bytes =
    new Uint8Array(
      binary.length
    );

  for (
    let i = 0;
    i < binary.length;
    i++
  ) {
    bytes[i] =
      binary.charCodeAt(i);
  }

  return bytes;
}

function readUint32(
  bytes: Uint8Array,
  offset: number
) {
  return (
    (((bytes[offset] || 0) << 24) >>> 0) +
    ((bytes[offset + 1] || 0) << 16) +
    ((bytes[offset + 2] || 0) << 8) +
    (bytes[offset + 3] || 0)
  );
}

function getImageDimensions(
  bytes: Uint8Array,
  mimeType: string
) {
  const mime =
    mimeType.toLowerCase();

  // PNG
  if (
    mime.includes('png') &&
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return {
      width:
        readUint32(bytes, 16),
      height:
        readUint32(bytes, 20),
    };
  }

  // JPEG / JPG
  if (
    (mime.includes('jpeg') ||
      mime.includes('jpg')) &&
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8
  ) {
    let offset = 2;

    while (
      offset + 9 <
      bytes.length
    ) {
      if (
        bytes[offset] !== 0xff
      ) {
        offset++;
        continue;
      }

      while (
        offset < bytes.length &&
        bytes[offset] === 0xff
      ) {
        offset++;
      }

      if (
        offset >= bytes.length
      ) {
        break;
      }

      const marker =
        bytes[offset++];

      // Standalone JPEG markers.
      if (
        marker === 0xd8 ||
        marker === 0xd9 ||
        (marker >= 0xd0 &&
          marker <= 0xd7)
      ) {
        continue;
      }

      if (
        offset + 1 >=
        bytes.length
      ) {
        break;
      }

      const segmentLength =
        (bytes[offset] << 8) |
        bytes[offset + 1];

      if (
        segmentLength < 2 ||
        offset +
          segmentLength >
          bytes.length
      ) {
        break;
      }

      const isSizeMarker =
        (marker >= 0xc0 &&
          marker <= 0xc3) ||
        (marker >= 0xc5 &&
          marker <= 0xc7) ||
        (marker >= 0xc9 &&
          marker <= 0xcb) ||
        (marker >= 0xcd &&
          marker <= 0xcf);

      if (
        isSizeMarker &&
        offset + 7 <
          bytes.length
      ) {
        return {
          height:
            (bytes[offset + 3] << 8) |
            bytes[offset + 4],
          width:
            (bytes[offset + 5] << 8) |
            bytes[offset + 6],
        };
      }

      offset +=
        segmentLength;
    }
  }

  return {
    width: 4,
    height: 3,
  };
}

function normalizeMime(
  mimeType: string
) {
  const mime =
    mimeType.toLowerCase();

  if (
    mime.includes('png')
  ) {
    return 'image/png';
  }

  if (
    mime.includes('jpeg') ||
    mime.includes('jpg')
  ) {
    return 'image/jpeg';
  }

  return '';
}

async function fetchDrivePhoto(
  fileId: string
): Promise<PhotoData | null> {
  const urls = [
    `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1400`,
    `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        redirect: 'follow',
        headers: {
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        }
      });

      if (!response.ok) {
        continue;
      }

      const mimeType = normalizeMime(
        String(
          response.headers.get('content-type') || ''
        )
      );

      if (!mimeType) {
        continue;
      }

      const arrayBuffer =
        await response.arrayBuffer();

      const bytes =
        new Uint8Array(arrayBuffer);

      if (bytes.length < 32) {
        continue;
      }

      const dimensions =
        getImageDimensions(
          bytes,
          mimeType
        );

      console.log(
        'WORD PHOTO DRIVE DIRECT OK:',
        fileId,
        mimeType,
        dimensions.width,
        dimensions.height,
        bytes.length
      );

      return {
        file_id:
          fileId,
        base64:
          '',
        mime_type:
          mimeType,
        bytes,
        width:
          Math.max(
            1,
            dimensions.width
          ),
        height:
          Math.max(
            1,
            dimensions.height
          ),
        extension:
          mimeType === 'image/png'
            ? 'png'
            : 'jpg'
      };
    } catch (error) {
      console.error(
        'WORD PHOTO DRIVE DIRECT ERROR:',
        fileId,
        error
      );
    }
  }

  return null;
}

async function fetchPhotos(
  fileIds: string[]
) {
  const appsScriptUrl =
    process.env.APPS_SCRIPT_URL;

  const result =
    new Map<
      string,
      PhotoData
    >();

  const uniqueIds =
    Array.from(
      new Set(
        fileIds
          .map((id) =>
            String(
              id || ''
            ).trim()
          )
          .filter(Boolean)
      )
    );

  if (
    uniqueIds.length === 0
  ) {
    return result;
  }

  /*
   * Jalur utama: ambil foto langsung dari Google Drive.
   * Ini membuat export Word tetap berjalan walaupun
   * action get_photos_base64 di Apps Script sedang bermasalah.
   */
  for (
    const fileId of uniqueIds
  ) {
    const photo =
      await fetchDrivePhoto(
        fileId
      );

    if (photo) {
      result.set(
        fileId,
        photo
      );
    }
  }

  /*
   * Fallback: Apps Script.
   * Hanya dipanggil untuk foto yang belum berhasil
   * diambil langsung dari Drive.
   */
  const unresolvedIds =
    uniqueIds.filter(
      (fileId) =>
        !result.has(
          fileId
        )
    );

  if (
    !appsScriptUrl ||
    unresolvedIds.length === 0
  ) {
    return result;
  }

  for (
    let start = 0;
    start < unresolvedIds.length;
    start += PHOTO_BATCH_SIZE
  ) {
    const batch =
      unresolvedIds.slice(
        start,
        start + PHOTO_BATCH_SIZE
      );

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
                  'get_photos_base64',
                file_ids:
                  batch,
              }),
          }
        );

      const responseText =
        await response.text();

      if (
        !response.ok
      ) {
        console.error(
          'WORD PHOTO HTTP ERROR:',
          response.status,
          responseText
        );
        continue;
      }

      let payload: any;

      try {
        payload =
          JSON.parse(
            responseText
          );
      } catch {
        console.error(
          'WORD PHOTO INVALID JSON:',
          responseText
        );
        continue;
      }

      if (
        payload?.status !==
        'success'
      ) {
        console.error(
          'WORD PHOTO APPS SCRIPT ERROR:',
          payload?.message ||
            'Unknown error'
        );
        continue;
      }

      const photos =
        Array.isArray(
          payload?.photos
        )
          ? payload.photos
          : [];

      for (
        const item of photos
      ) {
        const fileId =
          String(
            item?.file_id ||
              ''
          ).trim();

        const base64 =
          String(
            item?.base64 ||
              ''
          ).trim();

        const rawMime =
          String(
            item?.mime_type ||
              ''
          ).trim();

        const mimeType =
          normalizeMime(
            rawMime
          );

        if (
          !fileId ||
          !base64 ||
          !mimeType
        ) {
          continue;
        }

        try {
          const bytes =
            base64ToBytes(
              base64
            );

          const dimensions =
            getImageDimensions(
              bytes,
              mimeType
            );

          result.set(
            fileId,
            {
              file_id:
                fileId,
              base64:
                base64,
              mime_type:
                mimeType,
              bytes,
              width:
                Math.max(
                  1,
                  dimensions.width
                ),
              height:
                Math.max(
                  1,
                  dimensions.height
                ),
              extension:
                mimeType ===
                'image/png'
                  ? 'png'
                  : 'jpg',
            }
          );
        } catch (error) {
          console.error(
            'WORD PHOTO DECODE ERROR:',
            fileId,
            error
          );
        }
      }
    } catch (error) {
      console.error(
        'WORD PHOTO FETCH ERROR:',
        error
      );
    }
  }

  return result;
}

function imageSizeEmu(
  photo: PhotoData
) {
  const aspect =
    photo.width /
    Math.max(
      1,
      photo.height
    );

  let width =
    MAX_IMAGE_WIDTH_EMU;

  let height =
    width / aspect;

  if (
    height >
    MAX_IMAGE_HEIGHT_EMU
  ) {
    height =
      MAX_IMAGE_HEIGHT_EMU;

    width =
      height * aspect;
  }

  return {
    width: Math.max(
      100000,
      Math.round(width)
    ),
    height: Math.max(
      100000,
      Math.round(height)
    ),
  };
}

function photoRowHeightTwips(
  photo?: PhotoData
) {
  if (!photo) {
    return 0;
  }

  const size = imageSizeEmu(photo);

  // 1 twip = 635 EMU.
  // Tambahkan sedikit ruang atas/bawah agar foto tidak pas menempel.
  return (
    Math.ceil(size.height / 635) +
    PHOTO_COLUMN_VERTICAL_PADDING_TWIPS
  );
}

function imageDrawing(
  relationId: string,
  photo: PhotoData,
  docPrId: number,
  description: string
) {
  const size =
    imageSizeEmu(photo);

  return `<w:drawing>
    <wp:inline
      distT="0"
      distB="0"
      distL="0"
      distR="0"
    >
      <wp:extent
        cx="${size.width}"
        cy="${size.height}"
      />
      <wp:docPr
        id="${docPrId}"
        name="${xmlEscape(
          description
        )}"
        descr="${xmlEscape(
          description
        )}"
      />
      <a:graphic>
        <a:graphicData
          uri="http://schemas.openxmlformats.org/drawingml/2006/picture"
        >
          <pic:pic>
            <pic:nvPicPr>
              <pic:cNvPr
                id="${docPrId}"
                name="${xmlEscape(
                  description
                )}"
              />
              <pic:cNvPicPr/>
            </pic:nvPicPr>
            <pic:blipFill>
              <a:blip
                r:embed="${relationId}"
              />
              <a:stretch>
                <a:fillRect/>
              </a:stretch>
            </pic:blipFill>
            <pic:spPr>
              <a:xfrm>
                <a:off
                  x="0"
                  y="0"
                />
                <a:ext
                  cx="${size.width}"
                  cy="${size.height}"
                />
              </a:xfrm>
              <a:prstGeom
                prst="rect"
              >
                <a:avLst/>
              </a:prstGeom>
            </pic:spPr>
          </pic:pic>
        </a:graphicData>
      </a:graphic>
    </wp:inline>
  </w:drawing>`;
}

function paragraph(
  content: string,
  options?: {
    bold?: boolean;
    size?: number;
    center?: boolean;
    after?: number;
    before?: number;
    keepNext?: boolean;
  }
) {
  const bold =
    options?.bold
      ? '<w:b/>'
      : '';

  const size =
    options?.size ??
    18;

  const jc =
    options?.center
      ? 'center'
      : 'left';

  const keepNext =
    options?.keepNext
      ? '<w:keepNext/>'
      : '';

  return `<w:p>
    <w:pPr>
      <w:jc w:val="${jc}"/>
      <w:spacing
        w:before="${options?.before ?? 0}"
        w:after="${options?.after ?? 0}"
      />
      ${keepNext}
    </w:pPr>
    <w:r>
      <w:rPr>
        <w:rFonts
          w:ascii="Arial"
          w:hAnsi="Arial"
        />
        ${bold}
        <w:sz w:val="${size}"/>
        <w:szCs w:val="${size}"/>
      </w:rPr>
      <w:t xml:space="preserve">${xmlEscape(
        content
      )}</w:t>
    </w:r>
  </w:p>`;
}

function identityBlock(
  group: {
    name: string;
    id_user: string;
    nip?: string | null;
    nik?: string | null;
    status_kepegawaian?: string | null;
    golongan_ruang?: string | null;
    jabatan?: string | null;
  }
) {
  const identity =
    group.nip
      ? group.nip
      : group.nik
        ? group.nik
        : group.id_user;

  const label =
    group.nip
      ? 'NIP'
      : group.nik
        ? 'NIK'
        : 'ID';

  const items = [
    ['Nama', group.name || '-'],
    [label, identity || '-'],
    [
      'Status',
      group.status_kepegawaian || '-'
    ],
    [
      'Gol.Ruang',
      group.golongan_ruang || '-'
    ],
    [
      'Jabatan',
      group.jabatan || '-'
    ],
  ];

  return items
    .map(
      ([name, value]) =>
        `<w:p>
          <w:pPr>
            <w:spacing
              w:before="0"
              w:after="0"
            />
          </w:pPr>

          <w:r>
            <w:rPr>
              <w:rFonts
                w:ascii="Arial"
                w:hAnsi="Arial"
              />
              <w:b/>
              <w:sz w:val="17"/>
              <w:szCs w:val="17"/>
            </w:rPr>
            <w:t xml:space="preserve">${xmlEscape(
              name
            )} : </w:t>
          </w:r>

          <w:r>
            <w:rPr>
              <w:rFonts
                w:ascii="Arial"
                w:hAnsi="Arial"
              />
              <w:sz w:val="17"/>
              <w:szCs w:val="17"/>
            </w:rPr>
            <w:t xml:space="preserve">${xmlEscape(
              value
            )}</w:t>
          </w:r>
        </w:p>`
    )
    .join('');
}

function tableCell(
  content: string,
  width: number,
  options?: {
    shading?: string;
    vertical?: 'top' | 'center';
    vMerge?: 'restart' | 'continue';
  }
) {
  const shading =
    options?.shading
      ? `<w:shd w:fill="${options.shading}"/>`
      : '';

  const vertical =
    options?.vertical ||
    'center';

  const merge =
    options?.vMerge
      ? `<w:vMerge w:val="${options.vMerge}"/>`
      : '';

  return `<w:tc>
    <w:tcPr>
      <w:tcW
        w:w="${width}"
        w:type="dxa"
      />
      <w:vAlign
        w:val="${vertical}"
      />
      ${merge}
      ${shading}

      <w:tcMar>
        <w:top
          w:w="60"
          w:type="dxa"
        />
        <w:bottom
          w:w="60"
          w:type="dxa"
        />
        <w:left
          w:w="55"
          w:type="dxa"
        />
        <w:right
          w:w="55"
          w:type="dxa"
        />
      </w:tcMar>

      <w:tcBorders>
        <w:top
          w:val="single"
          w:sz="5"
          w:color="AAB4BE"
        />
        <w:left
          w:val="single"
          w:sz="5"
          w:color="AAB4BE"
        />
        <w:bottom
          w:val="single"
          w:sz="5"
          w:color="AAB4BE"
        />
        <w:right
          w:val="single"
          w:sz="5"
          w:color="AAB4BE"
        />
      </w:tcBorders>
    </w:tcPr>

    ${content}
  </w:tc>`;
}

function tableParagraph(
  content: string,
  center = true,
  size = 17,
  bold = false
) {
  return `<w:p>
    <w:pPr>
      <w:jc w:val="${
        center
          ? 'center'
          : 'left'
      }"/>
      <w:spacing
        w:before="0"
        w:after="0"
      />
    </w:pPr>

    <w:r>
      <w:rPr>
        <w:rFonts
          w:ascii="Arial"
          w:hAnsi="Arial"
        />
        ${bold ? '<w:b/>' : ''}
        <w:sz w:val="${size}"/>
        <w:szCs w:val="${size}"/>
      </w:rPr>
      <w:t xml:space="preserve">${xmlEscape(
        content
      )}</w:t>
    </w:r>
  </w:p>`;
}

function photoCell(
  photo:
    | PhotoData
    | undefined,
  relationId:
    | string
    | null,
  docPrId: number
) {
  if (
    !photo ||
    !relationId
  ) {
    return tableCell(
      tableParagraph(
        'Tidak ada foto',
        true,
        15
      ),
      PHOTO_COLUMN_WIDTH_TWIPS,
      {
        vertical: 'center'
      }
    );
  }

  const drawing =
    imageDrawing(
      relationId,
      photo,
      docPrId,
      `Foto absensi ${photo.file_id}`
    );

  return tableCell(
    `<w:p>
      <w:pPr>
        <w:jc w:val="center"/>
        <w:spacing
          w:before="0"
          w:after="0"
        />
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts
            w:ascii="Arial"
            w:hAnsi="Arial"
          />
        </w:rPr>
        ${drawing}
      </w:r>
    </w:p>`,
    PHOTO_COLUMN_WIDTH_TWIPS,
    {
      vertical: 'center'
    }
  );
}
function tableRow(
  cells: string[],
  height: number,
  header = false
) {
  return `<w:tr>
    <w:trPr>
      <w:trHeight
        w:val="${height}"
        w:hRule="atLeast"
      />
      ${header
        ? '<w:tblHeader/>'
        : ''}
    </w:trPr>
    ${cells.join('')}
  </w:tr>`;
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
  tahun: string,
  photoMap: Map<string, PhotoData>
) {
  const imageRelations: ImageRelation[] = [];
  const relationByFileId =
    new Map<string, string>();

  let relationCounter = 1;
  let docPrCounter = 1;

  const getImageRelation =
    (fileId?: string | null) => {
      if (!fileId) {
        return null;
      }

      if (
        relationByFileId.has(
          fileId
        )
      ) {
        return relationByFileId.get(
          fileId
        )!;
      }

      const photo =
        photoMap.get(
          fileId
        );

      if (!photo) {
        return null;
      }

      const extension =
        photo.extension;

      const relationId =
        `rIdImage${relationCounter++}`;

      const mediaName =
        `word/media/image${imageRelations.length + 1}.${extension}`;

      imageRelations.push({
        id: relationId,
        target: `media/image${imageRelations.length + 1}.${extension}`,
        fileId
      });

      relationByFileId.set(
        fileId,
        relationId
      );

      return relationId;
    };

  const header =
    tableRow(
      [
        tableCell(
          tableParagraph(
            'No',
            true,
            17,
            true
          ),
          550,
          {
            shading:
              'E2E8F0'
          }
        ),
        tableCell(
          tableParagraph(
            'Nama / NIP-NIK / Jabatan',
            true,
            17,
            true
          ),
          3750,
          {
            shading:
              'E2E8F0'
          }
        ),
        tableCell(
          tableParagraph(
            'Tanggal',
            true,
            17,
            true
          ),
          1100,
          {
            shading:
              'E2E8F0'
          }
        ),
        tableCell(
          tableParagraph(
            'Jam',
            true,
            17,
            true
          ),
          1450,
          {
            shading:
              'E2E8F0'
          }
        ),
        tableCell(
          tableParagraph(
            'Keterangan',
            true,
            17,
            true
          ),
          3000,
          {
            shading:
              'E2E8F0'
          }
        ),
        tableCell(
          tableParagraph(
            'Foto Masuk',
            true,
            17,
            true
          ),
          PHOTO_COLUMN_WIDTH_TWIPS,
          {
            shading:
              'E2E8F0'
          }
        ),
        tableCell(
          tableParagraph(
            'Foto Pulang',
            true,
            17,
            true
          ),
          PHOTO_COLUMN_WIDTH_TWIPS,
          {
            shading:
              'E2E8F0'
          }
        )
      ],
      650,
      true
    );

  const rows: string[] = [
    header
  ];

  let number = 1;

  for (
    const group of groups
  ) {
    group.records.forEach(
      (record, index) => {
        const jam =
          normalizeJam(record);

        const cells: string[] = [];

        if (index === 0) {
          cells.push(
            tableCell(
              tableParagraph(
                number,
                true,
                18,
                true
              ),
              550,
              {
                vertical:
                  'top',
                vMerge:
                  group.records.length > 1
                    ? 'restart'
                    : undefined
              }
            )
          );

          cells.push(
            tableCell(
              identityBlock(
                group
              ),
              3750,
              {
                vertical:
                  'top',
                vMerge:
                  group.records.length > 1
                    ? 'restart'
                    : undefined
              }
            )
          );
        } else {
          cells.push(
            tableCell(
              '',
              700,
              {
                vertical:
                  'top',
                vMerge:
                  'continue'
              }
            )
          );

          cells.push(
            tableCell(
              '',
              3900,
              {
                vertical:
                  'top',
                vMerge:
                  'continue'
              }
            )
          );
        }

        cells.push(
          tableCell(
            tableParagraph(
              formatDate(
                record.date
              ),
              true,
              16
            ),
            1100
          )
        );

        cells.push(
          tableCell(
            tableParagraph(
              `${jam.masuk} - ${jam.pulang}`,
              true,
              16
            ),
            1450
          )
        );

        cells.push(
          tableCell(
            tableParagraph(
              record.keterangan ||
                '-',
              false,
              16
            ),
            3000,
            {
              vertical:
                'top'
            }
          )
        );

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

        const relationIn =
          getImageRelation(
            record.foto_masuk_file_id
          );

        const relationOut =
          getImageRelation(
            record.foto_pulang_file_id
          );

        cells.push(
          photoCell(
            photoIn,
            relationIn,
            docPrCounter++
          )
        );

        cells.push(
          photoCell(
            photoOut,
            relationOut,
            docPrCounter++
          )
        );

        const photoRowHeight =
          Math.max(
            photoRowHeightTwips(
              photoIn
            ),
            photoRowHeightTwips(
              photoOut
            )
          );

        rows.push(
          tableRow(
            cells,
            Math.max(
              650,
              photoRowHeight
            )
          )
        );
      }
    );

    number++;
  }

  const title =
    `BULAN ${(
      MONTHS[bulan] ||
      bulan
    ).toUpperCase()} ${tahun}`;

  const table =
    `<w:tbl>
      <w:tblPr>
        <w:tblW
          w:w="15050"
          w:type="dxa"
        />
        <w:tblLayout
          w:type="fixed"
        />

        <w:tblCellMar>
          <w:top
            w:w="35"
            w:type="dxa"
          />
          <w:left
            w:w="35"
            w:type="dxa"
          />
          <w:bottom
            w:w="35"
            w:type="dxa"
          />
          <w:right
            w:w="35"
            w:type="dxa"
          />
        </w:tblCellMar>

        <w:tblBorders>
          <w:top
            w:val="single"
            w:sz="5"
            w:color="AAB4BE"
          />
          <w:left
            w:val="single"
            w:sz="5"
            w:color="AAB4BE"
          />
          <w:bottom
            w:val="single"
            w:sz="5"
            w:color="AAB4BE"
          />
          <w:right
            w:val="single"
            w:sz="5"
            w:color="AAB4BE"
          />
          <w:insideH
            w:val="single"
            w:sz="5"
            w:color="AAB4BE"
          />
          <w:insideV
            w:val="single"
            w:sz="5"
            w:color="AAB4BE"
          />
        </w:tblBorders>
      </w:tblPr>

      <w:tblGrid>
        <w:gridCol w:w="550"/>
        <w:gridCol w:w="3750"/>
        <w:gridCol w:w="1100"/>
        <w:gridCol w:w="1450"/>
        <w:gridCol w:w="3000"/>
        <w:gridCol w:w="${PHOTO_COLUMN_WIDTH_TWIPS}"/>
        <w:gridCol w:w="${PHOTO_COLUMN_WIDTH_TWIPS}"/>
      </w:tblGrid>

      ${rows.join('')}
    </w:tbl>`;

  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
>
  <w:body>

    ${paragraph(
      'LAPORAN ABSENSI GURU DAN PEGAWAI',
      {
        bold: true,
        size: 28,
        center: true,
        after: 40,
        keepNext: true
      }
    )}

    ${paragraph(
      'SD GMIT OEKONA',
      {
        bold: true,
        size: 23,
        center: true,
        after: 25,
        keepNext: true
      }
    )}

    ${paragraph(
      title,
      {
        bold: true,
        size: 19,
        center: true,
        after: 160,
        keepNext: true
      }
    )}

    ${table}

    ${paragraph(
      'Foto absensi ditanam langsung ke dalam dokumen Word. Rasio foto dipertahankan sesuai ukuran asli.',
      {
        size: 15,
        before: 70,
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
    imageRelations
  };
}

async function buildDocx(
  documentXml: string,
  imageRelations: ImageRelation[],
  photoMap: Map<string, PhotoData>
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
  <Default
    Extension="jpg"
    ContentType="image/jpeg"
  />
  <Default
    Extension="jpeg"
    ContentType="image/jpeg"
  />
  <Default
    Extension="png"
    ContentType="image/png"
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
  ${imageRelations
    .map(
      (relation) =>
        `<Relationship
          Id="${relation.id}"
          Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"
          Target="${xmlEscape(
            relation.target
          )}"
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

  for (
    const relation of imageRelations
  ) {
    const photo =
      photoMap.get(
        relation.fileId
      );

    if (!photo) {
      continue;
    }

    zip.file(
      `word/${relation.target}`,
      photo.bytes
    );
  }

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
    request.method ===
    'OPTIONS'
  ) {
    return new Response(
      null,
      {
        status: 204,
        headers: {
          ...headers(),
          'Content-Type':
            'text/plain; charset=utf-8'
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
        `https://${request.headers.get('host') || 'sdgoekona.vercel.app'}`
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

      params.push(
        idUser
      );
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
          status_kepegawaian?: string | null;
          golongan_ruang?: string | null;
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
          groupsMap.get(
            key
          );

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
            id_user:
              key,
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
            records: [
              record
            ]
          }
        );
      }
    );

    const groups =
      Array.from(
        groupsMap.values()
      );

    const photoIds =
      rows.flatMap(
        (record) => [
          record.foto_masuk_file_id ||
            '',
          record.foto_pulang_file_id ||
            ''
        ]
      );

    const photoMap =
      await fetchPhotos(
        photoIds
      );

    const built =
      buildDocumentXml(
        groups,
        bulan,
        tahun,
        photoMap
      );

    const bytes =
      await buildDocx(
        built.documentXml,
        built.imageRelations,
        photoMap
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
          ...headers(),
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition':
            `attachment; filename="${filename}"`,
          'Content-Length':
            String(
              bytes.byteLength
            )
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

export async function GET(
  request: Request
) {
  return handleExport(
    request
  );
}

export async function OPTIONS(
  request: Request
) {
  return handleExport(
    request
  );
}
