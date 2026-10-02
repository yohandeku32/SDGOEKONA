export const runtime = 'nodejs';

import { connect } from '@tidbcloud/serverless';
import { SCHOOL_CONFIG } from './school-config';
import { corsJson, fileResponse, xmlEscape, zipFiles } from './lib/export-utils';

type GuruRow={id_user:string;nama:string;nip?:string|null;nik?:string|null;status_kepegawaian?:string|null;role?:string|null;golongan_ruang?:string|null;jabatan?:string|null};
type AttendanceRow={id_user:string;tanggal:string;jam_masuk?:string|null;keterangan?:string|null};
const MONTHS:Record<string,string>={'01':'Januari','02':'Februari','03':'Maret','04':'April','05':'Mei','06':'Juni','07':'Juli','08':'Agustus','09':'September','10':'Oktober','11':'November','12':'Desember'};
const BATAS_TERLAMBAT='07:15';

function esc(v:unknown){return xmlEscape(v).replace(/\n/g,'&#xA;');}
function trun(t:unknown,b=false,s=18){return `<w:r><w:rPr>${b?'<w:b/>':''}<w:sz w:val="${s}"/><w:szCs w:val="${s}"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;}
function p(t:unknown,b=false,s=18,c=false){return `<w:p><w:pPr><w:jc w:val="${c?'center':'left'}"/><w:spacing w:before="0" w:after="0"/></w:pPr>${trun(t,b,s)}</w:p>`;}
function tc(t:unknown,b=false){return `<w:tc><w:tcPr><w:tcW w:w="1050" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/></w:tcBorders><w:tcMar><w:top w:w="35" w:type="dxa"/><w:bottom w:w="35" w:type="dxa"/><w:left w:w="40" w:type="dxa"/><w:right w:w="40" w:type="dxa"/></w:tcMar></w:tcPr>${p(t,b,14,true)}</w:tc>`;}
function row(c:string[]){return `<w:tr>${c.join('')}</w:tr>`;}
function workDates(year:number,month:number,today=new Date()){const out:string[]=[];const last=new Date(year,month,0).getDate();const current=year===today.getFullYear()&&month===today.getMonth()+1;const future=year>today.getFullYear()||(year===today.getFullYear()&&month>today.getMonth()+1);if(future)return out;const end=current?Math.min(today.getDate(),last):last;for(let d=1;d<=end;d++){const x=new Date(year,month-1,d);if(x.getDay()===0)continue;out.push(`${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`);}return out;}
function mins(v?:string|null){const m=String(v||'').match(/^(\d{1,2}):(\d{2})/);return m?Number(m[1])*60+Number(m[2]):null;}

function category(v?: string | null) {
  const t = String(v || '').trim().toLowerCase();

  if (t === 'tb' || t.includes('tanpa berita') || t.includes('alpa') || t.includes('alpha')) {
    return 'tanpa';
  }

  if (t === 'ts' || t.includes('tugas belajar')) {
    return 'belajar';
  }

  if (t === 'td' || t.includes('tugas dinas') || t.includes('dinas luar') || t.includes('dinas')) {
    return 'dinas';
  }

  if (t === 'c' || t.includes('cuti')) {
    return 'cuti';
  }

  if (t === 'i' || t.includes('ijin') || t.includes('izin')) {
    return 'ijin';
  }

  if (t === 's' || t.includes('sakit')) {
    return 'sakit';
  }

  return 'hadir';
}

function dayMark(value?: string | null) {
  const c = String(value || '');
  if (c === 'hadir') return 'H';
  if (c === 'ijin') return 'I';
  if (c === 'sakit') return 'S';
  if (c === 'cuti') return 'C';
  if (c === 'dinas') return 'TD';
  if (c === 'tanpa') return 'TB';
  if (c === 'belajar') return 'TS';
  return 'TB';
}

function displayStatus(g: GuruRow) {
  const nip = String(g.nip || '').replace(/\D/g, '');
  return nip ? 'PNS' : 'YAYASAN';
}


function documentXml(rows: any[], bulan: string, tahun: string) {
  const year = Number(tahun);
  const month = Number(bulan);
  const lastDay = new Date(year, month, 0).getDate();

  const headers = ['NO', 'NAMA', 'NIP', 'JABATAN', 'PANGKAT', 'GOL'];
  const top = '<w:tr>' +
    headers.map((h) => tc(h, true, 1100)).join('') +
    '<w:tc><w:tcPr><w:gridSpan w:val="' + lastDay + '"/></w:tcPr>' + p('TANGGAL', true, 12, true) + '</w:tc>' +
    '<w:tc><w:tcPr><w:gridSpan w:val="7"/></w:tcPr>' + p('REKAPAN', true, 12, true) + '</w:tc>' +
    '</w:tr>';

  const second = '<w:tr>' +
    Array.from({ length: lastDay }, (_, index) => {
      const day = index + 1;
      const date = new Date(year, month - 1, day);
      const sunday = date.getDay() === 0;
      const shade = sunday ? '<w:shd w:fill="D1D1D1"/>' : '';
      return '<w:tc>' +
        '<w:tcPr>' + shade + '</w:tcPr>' +
        p(day, true, 10, true) +
        '</w:tc>';
    }).join('') +
    ['HADIR (H)', 'IJIN (I)', 'SAKIT (S)', 'CUTI (C)', 'TUGAS DINAS (TD)', 'TANPA BERITA (TB)', 'TUGAS BELAJAR (TS)']
      .map((h) => tc(h, true, 900))
      .join('') +
    '</w:tr>';

  const body = rows.map((r, index) => {
    const days = Array.from({ length: lastDay }, (_, i) => {
      const value = r.daily?.[String(i + 1)] || '';
      const date = new Date(year, month - 1, i + 1);
      const sunday = date.getDay() === 0;
      const shade = sunday ? '<w:shd w:fill="D1D1D1"/>' : '';
      return '<w:tc>' +
        '<w:tcPr>' + shade + '</w:tcPr>' +
        p(value, false, 11, true) +
        '</w:tc>';
    }).join('');

    return '<w:tr>' +
      tc(index + 1, false, 500) +
      tc(r.nama, false, 1500) +
      tc(r.nip, false, 1500) +
      tc(r.jabatan, false, 1100) +
      tc(r.pangkat, false, 900) +
      tc(r.gol, false, 650) +
      days +
      tc(r.hadir, false, 700) +
      tc(r.ijin, false, 600) +
      tc(r.sakit, false, 600) +
      tc(r.cuti, false, 600) +
      tc(r.dinas, false, 850) +
      tc(r.tanpa, false, 800) +
      tc(r.belajar, false, 850) +
      '</w:tr>';
  }).join('');

  const table = '<w:tbl>' +
    '<w:tblPr><w:tblW w:w="28000" w:type="dxa"/>' +
    '<w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/>' +
    '<w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/>' +
    '<w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr>' +
    top + second + body +
    '</w:tbl>';

  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    p('UNIT KERJA : ' + SCHOOL_CONFIG.schoolName, true, 16, false) +
    p('REKAPAN ABSENSI BULAN ' + (MONTHS[bulan] || bulan).toUpperCase() + ' ' + tahun, true, 20, true) +
    table +
    p('Keterangan: H = Hadir, I = Ijin, S = Sakit, C = Cuti, TD = Tugas Dinas, TB = Tanpa Berita, TS = Tugas Belajar.', false, 11, false) +
    p('Mengetahui,', false, 12, true) +
    p('Kepala Sekolah', false, 12, true) +
    p(' ', false, 12, true) +
    p(SCHOOL_CONFIG.headmasterName, true, 12, true) +
    p(SCHOOL_CONFIG.headmasterIdentityLabel + SCHOOL_CONFIG.headmasterIdentity, false, 11, true) +
    '<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="300" w:right="300" w:bottom="300" w:left="300"/></w:sectPr>' +
    '</w:body></w:document>';
}
function buildDocx(rows:any[],bulan:string,tahun:string){const ct=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;const rels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;return zipFiles([{name:'[Content_Types].xml',data:ct},{name:'_rels/.rels',data:rels},{name:'word/document.xml',data:documentXml(rows,bulan,tahun)}]);}

// FORMAT EXPORT KOMPATIBEL UNTUK VERCEL
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
  if(!databaseUrl) return corsJson({status:'error', message:'DATABASE_URL belum ditemukan.'}, 500);
  
  const url = new URL(request.url, `http://${request.headers?.get('host') || 'localhost'}`);
  let bulan = url.searchParams.get('bulan') || '';
  bulan = bulan.padStart(2, '0'); 
  
  const tahun = url.searchParams.get('tahun') || '';
  const idUser = url.searchParams.get('id_user') || '';
  const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
  
  if(!/^(0[1-9]|1[0-2])$/.test(bulan)) return corsJson({status:'error', message:'Parameter bulan tidak valid.'}, 400);
  if(!/^\d{4}$/.test(tahun)) return corsJson({status:'error', message:'Parameter tahun tidak valid.'}, 400);
  
  const conn = connect({url:databaseUrl});
  
  let gs='SELECT id_user,nama,nip,nik,status_kepegawaian,role,golongan_ruang,jabatan FROM guru WHERE aktif=1 AND role<>"admin"';
  const gp:string[]=[]; if(idUser){gs+=' AND id_user=?';gp.push(idUser);} gs+=' ORDER BY nama ASC';
  
  const rawGuru = await conn.execute(gs,gp) as any;
  let guru = (rawGuru?.rows ? rawGuru.rows : rawGuru) as GuruRow[];
  
  if(q){guru=guru.filter(g=>[g.nama,g.id_user,g.nip,g.nik,g.status_kepegawaian,g.golongan_ruang,g.jabatan].filter(Boolean).join(' ').toLowerCase().includes(q));}
  if(guru.length===0) return corsJson({status:'error',message:'Tidak ada guru/pegawai pada filter yang dipilih.'}, 404);

  // OPTIMASI ANTI-TIMEOUT TiDB
  const startDate = `${tahun}-${bulan}-01`;
  const nextMonth = Number(bulan) === 12 ? 1 : Number(bulan) + 1;
  const nextYear = Number(bulan) === 12 ? Number(tahun) + 1 : Number(tahun);
  const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

  let as='SELECT id_user,DATE_FORMAT(tanggal,\'%Y-%m-%d\') AS tanggal,TIME_FORMAT(jam_masuk,\'%H:%i\') AS jam_masuk,keterangan FROM absensi WHERE tanggal >= ? AND tanggal < ?';
  const ap:(string|number)[] = [startDate, endDate];
  if(idUser){as+=' AND id_user=?'; ap.push(idUser);}
  as += ' ORDER BY id_user ASC,tanggal ASC';
  
  const rawAtt = await conn.execute(as,ap) as any;
  const att = (rawAtt?.rows ? rawAtt.rows : rawAtt) as AttendanceRow[];
  
  const dates = workDates(Number(tahun), Number(bulan));
  const dateSet = new Set(dates);
  const by = new Map<string, AttendanceRow[]>();
  for (const a of att) {
    if (!dateSet.has(a.tanggal)) continue;
    if (!by.has(a.id_user)) by.set(a.id_user, []);
    by.get(a.id_user)!.push(a);
  }

  const recap = guru.map((g) => {
    const rec = by.get(g.id_user) || [];
    const day = new Map<string, string>();
    for (const a of rec) {
      day.set(a.tanggal, category(a.keterangan));
    }

    let hadir = 0, ijin = 0, sakit = 0, cuti = 0, dinas = 0, tanpa = 0, belajar = 0;
    for (const c of day.values()) {
      if (c === 'hadir') hadir++;
      if (c === 'ijin') ijin++;
      if (c === 'sakit') sakit++;
      if (c === 'cuti') cuti++;
      if (c === 'dinas') dinas++;
      if (c === 'tanpa') tanpa++;
      if (c === 'belajar') belajar++;
    }
    tanpa += Math.max(0, dates.length - (hadir + ijin + sakit + cuti + dinas + tanpa + belajar));

    const daily: Record<string, string> = {};
    const lastDay = new Date(Number(tahun), Number(bulan), 0).getDate();
    for (let d = 1; d <= lastDay; d++) {
      const dateKey = tahun + '-' + bulan + '-' + String(d).padStart(2, '0');
      const date = new Date(Number(tahun), Number(bulan) - 1, d);
      if (date.getDay() === 0) {
        daily[String(d)] = '';
      } else if (!dateSet.has(dateKey)) {
        daily[String(d)] = '';
      } else {
        daily[String(d)] = dayMark(day.get(dateKey));
      }
    }

    const nip = String(g.nip || '').replace(/\D/g, '');
    return {
      nama: g.nama || '-',
      nip: nip || '',
      jabatan: g.jabatan || '-',
      pangkat: displayStatus(g),
      gol: g.golongan_ruang || '-',
      daily,
      hadir,
      ijin,
      sakit,
      cuti,
      dinas,
      tanpa,
      belajar
    };
  });
  const bytes=await buildDocx(recap,bulan,tahun);
  return fileResponse(bytes,'application/vnd.openxmlformats-officedocument.wordprocessingml.document',`Rekap_Absensi_${MONTHS[bulan]||bulan}_${tahun}.docx`);
 } catch(error) {
  console.error('EXPORT REKAP WORD ERROR:', error);
  return corsJson({status:'error', message: error instanceof Error ? error.message : String(error)}, 500);
 }
}
