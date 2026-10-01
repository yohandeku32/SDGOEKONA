export const runtime = 'nodejs';

import { deflateRawSync } from 'node:zlib';

export function xmlEscape(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function corsJson(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
    },
  });
}

export function fileResponse(
  bytes: Uint8Array,
  contentType: string,
  fileName: string,
) {
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
    },
  });
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Uint8Array {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
  ]);
}

function u32(value: number): Uint8Array {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, part) => n + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;

  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return result;
}

function dosTimeAndDate() {
  const now = new Date();
  const year = Math.max(1980, now.getFullYear());
  const time =
    ((now.getHours() & 0x1f) << 11) |
    ((now.getMinutes() & 0x3f) << 5) |
    Math.floor(now.getSeconds() / 2);
  const date =
    (((year - 1980) & 0x7f) << 9) |
    (((now.getMonth() + 1) & 0x0f) << 5) |
    (now.getDate() & 0x1f);

  return { time, date };
}

export function zipFiles(
  files: Array<{ name: string; data: Uint8Array | string }>
): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  const { time, date } = dosTimeAndDate();
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const raw =
      typeof file.data === 'string'
        ? encoder.encode(file.data)
        : file.data;
    const compressed = deflateRawSync(raw);
    const crc = crc32(raw);

    const local = concat([
      u32(0x04034b50),
      u16(20),
      u16(0x0800),
      u16(8),
      u16(time),
      u16(date),
      u32(crc),
      u32(compressed.length),
      u32(raw.length),
      u16(name.length),
      u16(0),
      name,
      compressed,
    ]);

    localParts.push(local);

    const central = concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0x0800),
      u16(8),
      u16(time),
      u16(date),
      u32(crc),
      u32(compressed.length),
      u32(raw.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]);

    centralParts.push(central);
    offset += local.length;
  }

  const local = concat(localParts);
  const central = concat(centralParts);

  const end = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(central.length),
    u32(local.length),
    u16(0),
  ]);

  return concat([local, central, end]);
}
