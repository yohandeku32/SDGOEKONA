export const runtime = 'nodejs';

import { connect } from '@tidbcloud/serverless';
import { SCHOOL_CONFIG } from './school-config';
import { corsJson, fileResponse, xmlEscape, zipFiles } from './lib/export-utils';

type RowData = {
  id_user: string; name: string; date: string; time?: string|null; jam_masuk?: string|null; jam_pulang?: string|null;
  status?: string|null; keterangan?: string|null; foto_masuk_file_id?: string|null; foto_pulang_file_id?: string|null;
  nip?: string|null; nik?: string|null; status_kepegawaian?: string|null; golongan_ruang?: string|null; jabatan?: string|null;
};

const MONTHS: Record<string,string> = {'01':'Januari','02':'Februari','03':'Maret','04':'April','05':'Mei','06':'Juni','07':'Juli','08':'Agustus','09':'September','10':'Oktober','11':'November','12':'Desember'};

function esc(value: unknown) { return xmlEscape(value).replace(/\n/g,'&#xA;'); }
function textRun(text: unknown, bold=false, size=20) { return `<w:r><w:rPr>${bold?'<w:b/>':''}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`; }
function para(text: unknown, bold=false, size=20, center=false) { return `<w:p><w:pPr><w:jc w:val="${center?'center':'left'}"/><w:spacing w:before="0" w:after="0"/></w:pPr>${textRun(text,bold,size)}</w:p>`; }
function cell(text: unknown, bold=false, center=true) { return `<w:tc><w:tcPr><w:tcW w:w="1300" w:type="dxa"/><w:tcMar><w:top w:w="40" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:left w:w="50" w:type="dxa"/><w:right w:w="50" w:type="dxa"/></w:tcMar><w:tcBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/></w:tcBorders></w:tcPr>${para(text,bold,16,center)}</w:tc>`; }
function row(cells:string[]) { return `<w:tr>${cells.join('')}</w:tr>`; }
function formatDate(value:string) { const p=String(value||'').split('-'); return p.length===3?`${p[2]}-${p[1]}-${p[0]}`:value||'-'; }
function jams(r:RowData) { if(r.jam_masuk||r.jam_pulang) return {in:r.jam_masuk||'-',out:r.jam_pulang||'-'}; const p=String(r.time||'').split(' - '); if(r.status==='PULANG') return {in:'-',out:p[0]||'-'}; return {in:p[0]||'-',out:p[1]||'-'}; }

function documentXml(rows:RowData[], bulan:string, tahun:string) {
  const headers=['NO','NAMA','TANGGAL','JAM MASUK','JAM PULANG','STATUS','KETERANGAN','FOTO MASUK','FOTO PULANG'];
  const tableRows=[row(headers.map(h=>cell(h,true)))];
  rows.forEach((r,i)=>{
    const j=jams(r);
    tableRows.push(row([
      cell(i+1), cell(r.name||'-',false,false), cell(formatDate(r.date)), cell(j.in), cell(j.out), cell(r.status||'-'), cell(r.keterangan||'-',false,false), cell(r.foto_masuk_file_id?'Tersedia':'-'), cell(r.foto_pulang_file_id?'Tersedia':'-')
    ]));
  });

  const note = rows.some(r=>r.foto_masuk_file_id||r.foto_pulang_file_id)
    ? 'Catatan: kolom foto menunjukkan foto tersedia di Google Drive. Foto tidak ditanam ke dokumen agar proses export ringan dan stabil.'
    : 'Catatan: belum ada foto yang terhubung pada data absensi.';

  const tbl=`<w:tbl><w:tblPr><w:tblW w:w="15000" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr>${tableRows.join('')}</w:tbl>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
${para('LAPORAN ABSENSI GURU DAN PEGAWAI',true,28,true)}
${para(SCHOOL_CONFIG.schoolName,true,24,true)}
${para(`BULAN ${(MONTHS[bulan]\vert{}\vert{}bulan).toUpperCase()}${tahun}`,true,20,true)}
${tbl}
${para(note,false,16,false)}
<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="400" w:right="400" w:bottom="400" w:left="400"/></w:sectPr>
</w:body></w:document>`;
}

function buildDocx(rows:RowData[], bulan:string, tahun:string) {
 const ct=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
 const rels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
 return zipFiles([{name:'[Content_Types].xml',data:ct},{name:'_rels/.rels',data:rels},{name:'word/document.xml',data:documentXml(rows,bulan,tahun)}]);
}

// FORMAT EXPORT KOMPATIBEL UNTUK VERCEL (App Router & Pages Router)
export async function GET(request: Request) { return handleExport(request); }
export async function OPTIONS(request: Request) { return corsJson(null, 204); }
export default async function handler(request: Request) {
  if (request.method === 'OPTIONS') return corsJson(null, 204);
  if (request.method !== 'GET') return corsJson({status:'error', message:'Method tidak didukung.'}, 405);
  return handleExport(request);
}

async function handleExport(request: Request) {
  try {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) return corsJson({status:'error', message:'DATABASE_URL belum ditemukan di Vercel.'}, 500);
    
    // Fallback base URL agar Vercel Nodejs tidak crash membaca endpoint relatif
    const url = new URL(request.url, `http://${request.headers?.get('host') || 'localhost'}`); 
    
    let bulan = url.searchParams.get('bulan') || ''; 
    bulan = bulan.padStart(2, '0');
    
    const tahun = url.searchParams.get('tahun') || ''; 
    const idUser = url.searchParams.get('id_user') || '';
    
    if(!/^(0[1-9]|1[0-2])$/.test(bulan)) return corsJson({status:'error', message:'Parameter bulan tidak valid.'}, 400);
    if(!/^\d{4}$/.test(tahun)) return corsJson({status:'error', message:'Parameter tahun tidak valid.'}, 400);
    
    // OPTIMASI ANTI-TIMEOUT: Menggunakan range indeks tanggal
    const startDate = `${tahun}-${bulan}-01`;
    const nextMonth = Number(bulan) === 12 ? 1 : Number(bulan) + 1;
    const nextYear = Number(bulan) === 12 ? Number(tahun) + 1 : Number(tahun);
    const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    const conn = connect({url: databaseUrl}); 
    let sql = `SELECT a.id_user, g.nama AS name, DATE_FORMAT(a.tanggal,'%Y-%m-%d') AS date, 
      CASE WHEN a.jam_masuk IS NOT NULL AND a.jam_pulang IS NOT NULL THEN CONCAT(TIME_FORMAT(a.jam_masuk,'%H:%i'),' - ',TIME_FORMAT(a.jam_pulang,'%H:%i')) 
      WHEN a.jam_masuk IS NOT NULL THEN TIME_FORMAT(a.jam_masuk,'%H:%i') 
      WHEN a.jam_pulang IS NOT NULL THEN TIME_FORMAT(a.jam_pulang,'%H:%i') ELSE '' END AS time, 
      TIME_FORMAT(a.jam_masuk,'%H:%i') AS jam_masuk, TIME_FORMAT(a.jam_pulang,'%H:%i') AS jam_pulang, 
      a.status, a.keterangan, a.foto_masuk_file_id, a.foto_pulang_file_id, 
      g.nip, g.nik, g.status_kepegawaian, g.golongan_ruang, g.jabatan 
      FROM absensi a INNER JOIN guru g ON g.id_user=a.id_user 
      WHERE g.aktif=1 AND a.tanggal >= ? AND a.tanggal < ?`;
    
    const params: (string|number)[] = [startDate, endDate]; 
    if(idUser){sql += ' AND a.id_user=?'; params.push(idUser);} 
    sql += ' ORDER BY g.nama ASC, a.tanggal ASC';
    
    // Pengecekan data array untuk driver TiDB Serverless 
    const rawResult = await conn.execute(sql, params) as any; 
    const rows = (rawResult?.rows ? rawResult.rows : rawResult) as RowData[];
    
    if(!Array.isArray(rows) || rows.length === 0) return corsJson({status:'error', message:'Tidak ada data untuk diexport.'}, 404);
    
    const bytes = buildDocx(rows, bulan, tahun); 
    const name = idUser ? String(rows[0]?.name || 'Guru').replace(/[\\/:*?"<>|]/g,'-').replace(/\s+/g,'_') : 'Semua_Guru';
    
    return fileResponse(bytes, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', `Absensi_${MONTHS[bulan]||bulan}_${tahun}_${name}.docx`);
  } catch(error) {
    console.error('EXPORT WORD ERROR:', error);
    return corsJson({status:'error', message: error instanceof Error ? error.message : String(error)}, 500);
  }
}
