export type UserRole = 'admin' | 'kepsek' | 'guru' | 'pegawai';

export interface User {
  id: string;
  name: string;
  role: UserRole;
}

export interface AttendanceRecord {
  id_user: string;
  name: string;
  date: string; // YYYY-MM-DD
  time: string; // "HH:MM" atau "HH:MM - HH:MM"
  status: 'MASUK' | 'PULANG' | 'MASUK & PULANG';

  // Data jam terpisah dari API TiDB
  jam_masuk?: string | null;
  jam_pulang?: string | null;

  // Keterangan absensi
  keterangan?: string | null;

  // File ID foto di Google Drive
  foto_masuk_file_id?: string | null;
  foto_pulang_file_id?: string | null;

  // Identitas guru / pegawai dari tabel guru TiDB
  nip?: string | null;
  nik?: string | null;
  status_kepegawaian?: string | null;
  pangkat?: string | null;
  golongan_ruang?: string | null;
  jabatan?: string | null;
  role?: UserRole | string | null;

  // Dipertahankan untuk kompatibilitas kode lama bila masih ada
  photo?: string;
}

export type AbsenMode = 'MASUK' | 'PULANG';
