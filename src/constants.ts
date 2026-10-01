import { User } from './types';

// Tidak lagi menunjuk ke Apps Script sekolah lama.
// Upload foto diproses melalui API Vercel menggunakan APPS_SCRIPT_URL di environment Vercel.
export const GOOGLE_SCRIPT_URL = '';

export const MASTER_USERS: User[] = [
  { id: 'admin', name: 'Admin Sistem', role: 'admin' },
  { id: '197001162000122002', name: 'Lebrina Bengu, S.Pd', role: 'kepsek' },
  { id: '196612312006042132', name: 'Yuliana Seuk, S.Pd', role: 'guru' },
  { id: '197406132008012010', name: 'Joksi Asred Bano, A.Ma', role: 'guru' },
  // ID internal sementara karena NIP belum dicantumkan pada data sumber.
  { id: 'OEKONA-GRU-004', name: 'Santi Silawasti Tino, S.Pd', role: 'guru' },
  { id: 'OEKONA-TU-005', name: 'Priskilla Dwiguna Lisin, S.ST', role: 'pegawai' },
  { id: 'OEKONA-GRU-006', name: 'Yelita Boki, S.Pd', role: 'guru' },
  { id: 'OEKONA-GRU-007', name: 'Asni Blandina Silli, S.Pd', role: 'guru' },
  { id: 'OEKONA-GRU-008', name: 'Esthefania Ide Riwu, S.Pd', role: 'guru' },
];
