import { useEffect, useMemo, useState } from 'react';
import {
  LogOut,
  User as UserIcon,
  Clock,
  CheckCircle2,
  FileText,
  CalendarDays,
  Camera,
  Sparkles,
  LayoutGrid,
  GraduationCap,
  ChevronRight
} from 'lucide-react';

import { User, AttendanceRecord, AbsenMode } from '../types';
import { SCHOOL_CONFIG } from '../schoolConfig';

interface GuruDashboardProps {
  user: User;
  database: AttendanceRecord[];
  onTriggerAbsen: (mode: AbsenMode) => void;
  onLogout: () => void;
}

export default function GuruDashboard({
  user,
  database,
  onTriggerAbsen,
  onLogout
}: GuruDashboardProps) {
  const [timeStr, setTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();

      setTimeStr(
        now.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }) + ' WITA'
      );

      setDateStr(
        now.toLocaleDateString('id-ID', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        })
      );
    };

    updateTime();

    const interval = window.setInterval(
      updateTime,
      1000
    );

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const getTodayISO = () => {
    const now = new Date();

    const yyyy =
      now.getFullYear();

    const mm =
      String(
        now.getMonth() + 1
      ).padStart(
        2,
        '0'
      );

    const dd =
      String(
        now.getDate()
      ).padStart(
        2,
        '0'
      );

    return `${yyyy}-${mm}-${dd}`;
  };

  const todayStr =
    getTodayISO();

  const myLogs =
    database.filter(
      (record) =>
        String(record.id_user) ===
          String(user.id) &&
        String(record.date) ===
          todayStr
    );

  const dataMasuk =
    myLogs.find(
      (log) =>
        log.status === 'MASUK' ||
        log.status === 'MASUK & PULANG'
    );

  const dataPulang =
    myLogs.find(
      (log) =>
        log.status === 'PULANG' ||
        log.status === 'MASUK & PULANG'
    );

  const getDisplayTime = (
    record: AttendanceRecord,
    targetMode: 'masuk' | 'pulang'
  ) => {
    if (!record.time) {
      return '-';
    }

    if (
      record.time.includes(' - ')
    ) {
      const parts =
        record.time.split(' - ');

      return targetMode === 'masuk'
        ? parts[0]
        : parts[1];
    }

    return record.time;
  };

  const jamMasuk =
    dataMasuk
      ? getDisplayTime(
          dataMasuk,
          'masuk'
        )
      : null;

  const jamPulang =
    dataPulang
      ? getDisplayTime(
          dataPulang,
          'pulang'
        )
      : null;

  const completedCount =
    Number(Boolean(dataMasuk)) +
    Number(Boolean(dataPulang));


  const roleLabel =
    user.role === 'kepsek'
      ? 'Kepala Sekolah'
      : user.role === 'pegawai'
        ? 'Pegawai / TU'
        : 'Guru';

  return (
    <div className="min-h-screen bg-[#f5f7fb] px-4 py-5 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-40px)] w-full max-w-[430px] flex-col overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]">

        {/* TOP BAR */}
        <header className="flex items-center justify-between px-5 pb-4 pt-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
              <LayoutGrid className="h-5 w-5" />
            </div>

            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">
                Absensi Digital
              </p>
              <p className="mt-0.5 text-sm font-extrabold text-slate-900">
                {SCHOOL_CONFIG.schoolName}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition hover:bg-red-50 hover:text-red-500"
            title="Keluar"
            aria-label="Keluar"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </header>

        <main className="flex-1 space-y-5 px-5 pb-5">

          {/* PROFILE / GREETING */}
          <section className="flex items-center justify-between gap-4 pt-1">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-slate-400">
                Selamat datang,
              </p>

              <h1 className="mt-1 truncate text-[24px] font-black leading-tight tracking-tight text-slate-950">
                {user.name.split(',')[0]}
              </h1>

              <div className="mt-2 inline-flex items-center rounded-full bg-blue-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-blue-700">
                {roleLabel}
              </div>
            </div>

            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.3rem] bg-gradient-to-br from-blue-600 to-blue-800 text-white shadow-lg shadow-blue-600/20 ring-4 ring-blue-50">
              <GraduationCap className="h-7 w-7" strokeWidth={2.2} />
            </div>
          </section>

          {/* TODAY FOCUS */}
          <section className="relative overflow-hidden rounded-[1.8rem] bg-gradient-to-br from-blue-700 via-blue-700 to-indigo-800 p-5 text-white shadow-xl shadow-blue-900/15">
            <div className="absolute -right-7 -top-7 h-28 w-28 rounded-full bg-sky-300/15 blur-2xl" />
            <div className="absolute -bottom-10 left-10 h-24 w-24 rounded-full bg-white/10 blur-2xl" />

            <div className="relative">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-blue-100/80">
                    Hari ini
                  </p>

                  <p className="mt-1 text-sm font-semibold text-white/95">
                    {dateStr}
                  </p>
                </div>

                <div className="rounded-xl bg-white/10 p-2.5 ring-1 ring-white/10">
                  <CalendarDays className="h-4 w-4" />
                </div>
              </div>

              <div className="mt-5 flex items-end justify-between gap-4">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-blue-100/70">
                    Waktu sekarang
                  </p>

                  <p className="mt-1 font-mono text-[25px] font-black tracking-tight">
                    {timeStr || '--:--:-- WITA'}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-blue-100/70">
                    Progress
                  </p>

                  <p className="mt-1 text-2xl font-black">
                    {completedCount}/2
                  </p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-white/10 px-3 py-2.5 ring-1 ring-white/10">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black uppercase tracking-wider text-blue-100/80">
                      Masuk
                    </span>
                    <span
                      className={
                        dataMasuk
                          ? 'h-2 w-2 rounded-full bg-emerald-300'
                          : 'h-2 w-2 rounded-full bg-white/30'
                      }
                    />
                  </div>

                  <p className="mt-1 text-sm font-black">
                    {jamMasuk || '--:--'}
                  </p>
                </div>

                <div className="rounded-2xl bg-white/10 px-3 py-2.5 ring-1 ring-white/10">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black uppercase tracking-wider text-blue-100/80">
                      Pulang
                    </span>
                    <span
                      className={
                        dataPulang
                          ? 'h-2 w-2 rounded-full bg-amber-300'
                          : 'h-2 w-2 rounded-full bg-white/30'
                      }
                    />
                  </div>

                  <p className="mt-1 text-sm font-black">
                    {jamPulang || '--:--'}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION TITLE */}
          <div className="flex items-center justify-between pt-1">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Aktivitas utama
              </p>
              <h2 className="mt-1 text-lg font-black tracking-tight text-slate-900">
                Absensi hari ini
              </h2>
            </div>

            <div className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider text-slate-500">
              <Sparkles className="h-3 w-3" />
              {completedCount === 2
                ? 'Selesai'
                : 'Berjalan'}
            </div>
          </div>

          {/* ACTION CARDS */}
          <section className="grid grid-cols-2 gap-3">

            {/* MASUK */}
            {dataMasuk ? (
              <div className="min-h-[148px] rounded-[1.5rem] border border-blue-100 bg-blue-50 p-4">
                <div className="flex h-full flex-col justify-between">
                  <div className="flex items-start justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/15">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>

                    <span className="rounded-full bg-white px-2 py-1 text-[8px] font-black uppercase tracking-wider text-blue-700">
                      Berhasil
                    </span>
                  </div>

                  <div>
                    <p className="text-sm font-black text-slate-900">
                      Absen Masuk
                    </p>
                    <p className="mt-1 text-[10px] font-semibold text-slate-500">
                      Terekam {jamMasuk || '--:--'} WITA
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() =>
                  onTriggerAbsen('MASUK')
                }
                className="group min-h-[148px] rounded-[1.5rem] bg-gradient-to-br from-blue-600 to-blue-700 p-4 text-left text-white shadow-lg shadow-blue-600/20 transition duration-300 hover:-translate-y-0.5 hover:shadow-blue-600/30 active:scale-[0.98]"
              >
                <div className="flex h-full flex-col justify-between">
                  <div className="flex items-start justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/10">
                      <Camera className="h-5 w-5" />
                    </div>

                    <ChevronRight className="h-4 w-4 opacity-60 transition group-hover:translate-x-1" />
                  </div>

                  <div>
                    <p className="text-sm font-black">
                      Absen Masuk
                    </p>
                    <p className="mt-1 text-[10px] font-medium leading-relaxed text-blue-100">
                      Ambil foto dan kirim absensi
                    </p>
                  </div>
                </div>
              </button>
            )}

            {/* PULANG */}
            {dataPulang ? (
              <div className="min-h-[148px] rounded-[1.5rem] border border-amber-100 bg-amber-50 p-4">
                <div className="flex h-full flex-col justify-between">
                  <div className="flex items-start justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-lg shadow-amber-500/15">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>

                    <span className="rounded-full bg-white px-2 py-1 text-[8px] font-black uppercase tracking-wider text-amber-700">
                      Berhasil
                    </span>
                  </div>

                  <div>
                    <p className="text-sm font-black text-slate-900">
                      Absen Pulang
                    </p>
                    <p className="mt-1 text-[10px] font-semibold text-slate-500">
                      Terekam {jamPulang || '--:--'} WITA
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() =>
                  onTriggerAbsen('PULANG')
                }
                className="group min-h-[148px] rounded-[1.5rem] bg-gradient-to-br from-amber-500 to-orange-500 p-4 text-left text-white shadow-lg shadow-amber-500/20 transition duration-300 hover:-translate-y-0.5 hover:shadow-amber-500/30 active:scale-[0.98]"
              >
                <div className="flex h-full flex-col justify-between">
                  <div className="flex items-start justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/10">
                      <Camera className="h-5 w-5" />
                    </div>

                    <ChevronRight className="h-4 w-4 opacity-60 transition group-hover:translate-x-1" />
                  </div>

                  <div>
                    <p className="text-sm font-black">
                      Absen Pulang
                    </p>
                    <p className="mt-1 text-[10px] font-medium leading-relaxed text-amber-50">
                      Ambil foto saat selesai bertugas
                    </p>
                  </div>
                </div>
              </button>
            )}
          </section>

          {/* TODAY SUMMARY */}
          <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">
                  Ringkasan
                </p>
                <h3 className="mt-1 text-base font-black text-slate-900">
                  Status absensi
                </h3>
              </div>

              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                <Clock className="h-4 w-4" />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Jam Masuk
                </p>
                <p className="mt-1 text-xl font-black tracking-tight text-slate-900">
                  {jamMasuk || '--:--'}
                </p>
                <p className="mt-1 text-[9px] font-semibold text-slate-400">
                  {dataMasuk ? 'Sudah direkam' : 'Belum direkam'}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Jam Pulang
                </p>
                <p className="mt-1 text-xl font-black tracking-tight text-slate-900">
                  {jamPulang || '--:--'}
                </p>
                <p className="mt-1 text-[9px] font-semibold text-slate-400">
                  {dataPulang ? 'Sudah direkam' : 'Belum direkam'}
                </p>
              </div>
            </div>
          </section>

          {/* ACTIVITY FEED */}
          <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                  <FileText className="h-4 w-4" />
                </div>

                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
                    Hari ini
                  </p>
                  <h3 className="mt-0.5 text-sm font-black text-slate-900">
                    Aktivitas absensi
                  </h3>
                </div>
              </div>

              <span className="rounded-full bg-slate-100 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider text-slate-500">
                {myLogs.length} Entri
              </span>
            </div>

            <div className="mt-4 space-y-2.5">
              {myLogs.length > 0 ? (
                myLogs.map(
                  (log, index) => {
                    const isMasuk =
                      log.status.includes('MASUK');

                    return (
                      <div
                        key={`${log.id_user}-${log.date}-${index}-${log.time}`}
                        className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3"
                      >
                        <div
                          className={
                            isMasuk
                              ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-[11px] font-black text-blue-700'
                              : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-[11px] font-black text-amber-700'
                          }
                        >
                          {isMasuk
                            ? 'M'
                            : 'P'}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-black text-slate-800">
                            Absensi {log.status}
                          </p>

                          <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                            {log.time} WITA
                          </p>
                        </div>

                        <CheckCircle2
                          className={
                            isMasuk
                              ? 'h-5 w-5 shrink-0 text-blue-600'
                              : 'h-5 w-5 shrink-0 text-amber-500'
                          }
                        />
                      </div>
                    );
                  }
                )
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center">
                  <Clock className="mx-auto mb-2 h-7 w-7 text-slate-300" />

                  <p className="text-xs font-semibold text-slate-400">
                    Belum ada riwayat absensi hari ini.
                  </p>
                </div>
              )}
            </div>
          </section>
        </main>

        {/* FOOTER */}
        <footer className="border-t border-slate-100 bg-slate-50/80 px-5 py-4 text-center">
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
            Sistem Absensi Foto • {SCHOOL_CONFIG.schoolName}
          </p>
        </footer>
      </div>
    </div>
  );
}
