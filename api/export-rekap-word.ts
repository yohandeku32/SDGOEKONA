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
function displayStatus(g:GuruRow){
  const nip=String(g.nip||'').replace(/\D/g,'');
  return nip ? 'PNS' : 'YAYASAN';
}

function category(v?:string|null){const t=String(v||'').trim().toLowerCase();if(t.includes('tanpa berita')||t.includes('alpa')||t.includes('alpha'))return 'tanpa';if(t.includes('ijin')||t.includes('izin'))return 'ijin';if(t.includes('sakit'))return 'sakit';if(t.includes('dinas luar')||t==='dl'||t.includes('dinas'))return 'dinas';return 'hadir';}

function documentXml(rows:any[],bulan:string,tahun:string){
 const heads=['NO','NAMA','NIP/NIK','GOL.','JABATAN','STATUS','HARI KERJA','TANPA BERITA','IJIN','SAKIT','DINAS LUAR','JUMLAH TIDAK HADIR','TERLAMBAT','HARI HADIR'];
 const trs=[row(heads.map(h=>tc(h,true)))]; rows.forEach((r,i)=>trs.push(row([tc(i+1),tc(r.nama),tc(r.nipNik),tc(r.golongan),tc(r.jabatan),tc(r.statusKepegawaian),tc(r.jumlahHariKerja),tc(r.tanpaBerita),tc(r.ijin),tc(r.sakit),tc(r.dinasLuar),tc(r.jumlahTidakHadir),tc(r.terlambat),tc(r.jumlahHariHadir)])));
 const tbl=`<w:tbl><w:tblPr><w:tblW w:w="15000" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr>${trs.join('')}</w:tbl>`;
 return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${p('REKAPITULASI ABSENSI GURU DAN PEGAWAI',true,28,true)}${p(SCHOOL_CONFIG.government,true,18,true)}${p(SCHOOL_CONFIG.department,true,18,true)}${p(SCHOOL_CONFIG.schoolName,true,23,true)}${p(SCHOOL_CONFIG.address,false,16,true)}${p(`BULAN ${(MONTHS[bulan] || bulan).toUpperCase()}${tahun}`,true,18,true)}${tbl}${p(`Catatan: Hari kerja dihitung Senin-Sabtu. Batas terlambat ${BATAS_TERLAMBAT}.`,false,14,false)}${p('Mengetahui,',false,16,true)}${p('Kepala Sekolah',false,16,true)}${p(' ',false,18,true)}${p(SCHOOL_CONFIG.headmasterName,true,16,true)}${p(`${SCHOOL_CONFIG.headmasterIdentityLabel}${SCHOOL_CONFIG.headmasterIdentity}`,false,15,true)}<w:sectPr><w:pgSz w:w="11906" w:h="16838" w:orient="landscape"/><w:pgMar w:top="400" w:right="400" w:bottom="400" w:left="400"/></w:sectPr></w:body></w:document>`;
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
  
  const dates=workDates(Number(tahun),Number(bulan));const dateSet=new Set(dates);const by=new Map<string,AttendanceRow[]>();for(const a of att){if(!dateSet.has(a.tanggal))continue;if(!by.has(a.id_user))by.set(a.id_user,[]);by.get(a.id_user)!.push(a);}const late=mins(BATAS_TERLAMBAT)||0;const recap=guru.map(g=>{const rec=by.get(g.id_user)||[];const day=new Map<string,string>();const lateDates=new Set<string>();for(const a of rec){const c=category(a.keterangan);day.set(a.tanggal,c);if(c==='hadir'){const m=mins(a.jam_masuk);if(m!==null&&m>late)lateDates.add(a.tanggal);}}let hadir=0,ijin=0,sakit=0,dinasLuar=0,tanpa=0;for(const c of day.values()){if(c==='hadir')hadir++;if(c==='ijin')ijin++;if(c==='sakit')sakit++;if(c==='dinas')dinasLuar++;if(c==='tanpa')tanpa++;}const tanpaAuto=Math.max(0,dates.length-(hadir+ijin+sakit+dinasLuar+tanpa));tanpa+=tanpaAuto;return{id_user:g.id_user,nama:g.nama,nipNik:g.nip||g.nik||g.id_user||'-',golongan:g.golongan_ruang||'-',jabatan:g.jabatan||'-',statusKepegawaian:displayStatus(g),jumlahHariKerja:dates.length,tanpaBerita:tanpa,ijin,sakit,dinasLuar,jumlahTidakHadir:tanpa+ijin+sakit+dinasLuar,terlambat:lateDates.size,jumlahHariHadir:hadir};});
  
  const bytes=await buildDocx(recap,bulan,tahun);
  return fileResponse(bytes,'application/vnd.openxmlformats-officedocument.wordprocessingml.document',`Rekap_Absensi_${MONTHS[bulan]||bulan}_${tahun}.docx`);
 } catch(error) {
  console.error('EXPORT REKAP WORD ERROR:', error);
  return corsJson({status:'error', message: error instanceof Error ? error.message : String(error)}, 500);
 }
}
