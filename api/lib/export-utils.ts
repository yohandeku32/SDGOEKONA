import JSZip from 'jszip';

// Fungsi untuk mengirimkan response error/sukses dalam bentuk JSON
export function corsJson(data: any, status: number = 200) {
  return new Response(data ? JSON.stringify(data) : null, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  });
}

// Fungsi untuk men-download file Word/Excel
export function fileResponse(data: Uint8Array, mimeType: string, filename: string) {
  return new Response(data, {
    headers: {
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// Fungsi untuk membersihkan karakter khusus agar XML Word/Excel tidak error (corrupt)
export function xmlEscape(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Fungsi krusial untuk menyatukan XML menjadi file .docx / .xlsx
export async function zipFiles(files: { name: string; data: string }[]) {
  const zip = new JSZip();
  
  files.forEach((file) => {
    zip.file(file.name, file.data);
  });
  
  const content = await zip.generateAsync({ type: 'uint8array' });
  return content;
}
