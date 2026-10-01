import { useState, useEffect } from 'react';
import { User, AttendanceRecord, AbsenMode } from '../types';
import { LogOut, User as UserIcon, Calendar, Clock, CheckCircle2, ChevronRight, FileText } from 'lucide-react';

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

  // Running local clock
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
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Get today's local date in YYYY-MM-DD format
  const getTodayISO = () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const todayStr = getTodayISO();

  // Filter logs for this specific user today
  const myLogs = database.filter(
    (record) =>
      String(record.id_user) === String(user.id) && String(record.date) === todayStr
  );

  const dataMasuk = myLogs.find(
    (l) => l.status === 'MASUK' || l.status === 'MASUK & PULANG'
  );
  const dataPulang = myLogs.find(
    (l) => l.status === 'PULANG' || l.status === 'MASUK & PULANG'
  );

  // Extract recorded clock strings
  const getDisplayTime = (record: AttendanceRecord, targetMode: 'masuk' | 'pulang') => {
    if (!record.time) return '-';
    // If the record.time includes ' - ', like '07:15 - 14:00'
    if (record.time.includes(' - ')) {
      const parts = record.time.split(' - ');
      return targetMode === 'masuk' ? parts[0] : parts[1];
    }
    return record.time;
  };

  const jamMasuk = dataMasuk ? getDisplayTime(dataMasuk, 'masuk') : null;
  const jamPulang = dataPulang ? getDisplayTime(dataPulang, 'pulang') : null;

  return (
    <div className="min-h-screen py-6 px-4 bg-slate-50">
      <div className="max-w-md mx-auto bg-white min-h-[90vh] rounded-[2.5rem] shadow-2xl border border-slate-100 flex flex-col overflow-hidden relative">
        
        {/* Dashboard Header */}
        <header className="p-6 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-50 flex items-center justify-center border border-blue-100 text-blue-700">
              <UserIcon className="w-5 h-5" />
            </div>
            <div className="max-w-[200px]">
              <h2 className="font-display font-extrabold text-slate-900 leading-tight truncate">
                {user.name}
              </h2>
              <p className="text-[9px] font-sans font-black text-blue-700 uppercase tracking-widest leading-none mt-1">
                {user.role === 'kepsek' ? 'Kepala Sekolah' : user.role === 'pegawai' ? 'Pegawai / TU' : 'Guru Kelas'}
              </p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="p-3 rounded-2xl bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-500 transition-all cursor-pointer"
            title="Keluar"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </header>

        <main className="flex-1 p-6 space-y-6">
          {/* Greeting Banner */}
          <div className="bg-gradient-to-tr from-blue-950 via-blue-900 to-slate-900 p-6 rounded-[2rem] text-white shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl translate-x-1/3 -translate-y-1/3" />
            <p className="font-sans font-bold text-sky-300 text-xs tracking-wider uppercase mb-1">
              Hari ini • {dateStr}
            </p>
            <h3 className="font-display font-black text-xl tracking-tight text-white">
              Halo, {user.name.split(',')[0]}!
            </h3>
            
            {/* Live Clock Display */}
            <div className="mt-4 flex items-center gap-2 text-white/95">
              <Clock className="w-4 h-4 text-sky-300 shrink-0 animate-pulse" />
              <span className="font-mono font-bold text-sm bg-white/10 px-3 py-1 rounded-full border border-white/10">
                {timeStr || 'Memuat waktu...'}
              </span>
            </div>

            {/* Quick Status Badges */}
            <div className="mt-4 flex flex-wrap gap-2 pt-4 border-t border-white/10">
              <span className={`px-3 py-1.5 rounded-full text-[9px] font-bold border font-sans uppercase tracking-wider ${
                dataMasuk ? 'bg-blue-500/20 text-sky-200 border-sky-400/20' : 'bg-white/5 text-white/50 border-white/5'
              }`}>
                Masuk: {jamMasuk || '--:--'}
              </span>
              <span className={`px-3 py-1.5 rounded-full text-[9px] font-bold border font-sans uppercase tracking-wider ${
                dataPulang ? 'bg-amber-400/20 text-amber-200 border-amber-400/20' : 'bg-white/5 text-white/50 border-white/5'
              }`}>
                Pulang: {jamPulang || '--:--'}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-4">
            
            {/* ABSEN MASUK BUTTON */}
            {dataMasuk ? (
              <div className="p-6 bg-slate-50 border border-blue-100 rounded-[2rem] flex justify-between items-center opacity-85">
                <div>
                  <h3 className="font-display font-black text-blue-700 text-lg">Absen Masuk Berhasil</h3>
                  <p className="text-slate-400 text-xs font-semibold font-sans mt-0.5">
                    Sudah absen pukul {jamMasuk || '-'} WITA
                  </p>
                </div>
                <div className="w-12 h-12 bg-blue-100 text-blue-700 rounded-2xl flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 stroke-[2.5]" />
                </div>
              </div>
            ) : (
              <button
                onClick={() => onTriggerAbsen('MASUK')}
                className="w-full p-6 bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-[2rem] text-left flex justify-between items-center shadow-lg shadow-blue-600/20 hover:shadow-blue-600/35 hover:-translate-y-1 transition-all duration-300 active:scale-98 cursor-pointer border-none"
              >
                <div>
                  <h3 className="font-display font-black text-white text-lg">Absen Masuk</h3>
                  <p className="text-blue-50 text-xs font-medium font-sans opacity-90 mt-0.5">
                    Ketuk untuk mengambil foto &amp; kirim
                  </p>
                </div>
                <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-white shadow-inner">
                  <Clock className="w-5 h-5" />
                </div>
              </button>
            )}

            {/* ABSEN PULANG BUTTON */}
            {dataPulang ? (
              <div className="p-6 bg-slate-50 border border-blue-100 rounded-[2rem] flex justify-between items-center opacity-85">
                <div>
                  <h3 className="font-display font-black text-amber-700 text-lg">Absen Pulang Berhasil</h3>
                  <p className="text-slate-400 text-xs font-semibold font-sans mt-0.5">
                    Sudah absen pukul {jamPulang || '-'} WITA
                  </p>
                </div>
                <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 stroke-[2.5]" />
                </div>
              </div>
            ) : (
              <button
                onClick={() => onTriggerAbsen('PULANG')}
                className="w-full p-6 bg-gradient-to-br from-amber-500 to-orange-500 text-white rounded-[2rem] text-left flex justify-between items-center shadow-lg shadow-amber-500/20 hover:shadow-amber-500/35 hover:-translate-y-1 transition-all duration-300 active:scale-98 cursor-pointer border-none"
              >
                <div>
                  <h3 className="font-display font-black text-white text-lg">Absen Pulang</h3>
                  <p className="text-amber-50 text-xs font-medium font-sans opacity-90 mt-0.5">
                    Bisa dikirim meski belum absen masuk
                  </p>
                </div>
                <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-white shadow-inner">
                  <Clock className="w-5 h-5" />
                </div>
              </button>
            )}

          </div>

          {/* Today's History Feed */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-extrabold text-slate-800 text-base flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                Aktivitas Absen Hari Ini
              </h3>
              <span className="text-[10px] bg-slate-100 text-slate-500 font-bold px-2 py-1 rounded-full font-sans uppercase">
                {myLogs.length} Entri
              </span>
            </div>

            <div className="space-y-3">
              {myLogs.length > 0 ? (
                myLogs.map((log, index) => {
                  const isMasuk = log.status.includes('MASUK');
                  return (
                    <div
                      key={index}
                      className="flex items-center gap-4 p-4 bg-slate-50/50 hover:bg-slate-50 rounded-2xl border border-slate-100 shadow-sm transition-all"
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-display font-black text-xs ${
                        isMasuk ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {isMasuk ? 'M' : 'P'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800 text-xs sm:text-sm font-sans truncate">
                          Absensi {log.status}
                        </p>
                        <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider mt-0.5 font-sans">
                          {log.time} WITA
                        </p>
                      </div>
                      <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0" />
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                  <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-slate-400 italic text-xs font-semibold font-sans">
                    Belum ada riwayat absensi hari ini.
                  </p>
                </div>
              )}
            </div>
          </div>
        </main>

        <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
          <p className="text-[10px] text-slate-400 font-bold font-sans uppercase tracking-wider">
            Sistem Absensi Foto • {SCHOOL_CONFIG.schoolName}
          </p>
        </div>
      </div>
    </div>
  );
}
