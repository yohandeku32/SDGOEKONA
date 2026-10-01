# ABSEN SD GMIT OEKONA

Sistem absensi foto online untuk guru dan pegawai SD GMIT OEKONA.

## Login

Login menggunakan username dan password yang diverifikasi melalui TiDB.

- Username: NIP jika tersedia; jika belum ada, gunakan ID internal Oekona.
- Password awal: nama depan pengguna.
- Password tidak disimpan sebagai teks biasa; database menyimpan hash scrypt.

## Setup TiDB

Jalankan `SETUP-TIDB-OEKONA.sql` pada database/schema TiDB khusus SD GMIT OEKONA.

## Environment Vercel

Set minimal:

- `DATABASE_URL`
- `APPS_SCRIPT_URL`
- `ALLOWED_ORIGINS` (isi URL GitHub Pages/custom domain Oekona)
- `VITE_API_BASE_URL` saat build frontend, berisi URL deployment Vercel Oekona

Jangan memasukkan password pengguna ke source code frontend.
