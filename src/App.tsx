import { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'motion/react';
import { User, AttendanceRecord, AbsenMode } from './types';

import LoginView from './components/LoginView';
import GuruDashboard from './components/GuruDashboard';
import AdminPanel from './components/AdminPanel';
import CameraCapture from './components/CameraCapture';
import Loader from './components/Loader';
import SuccessModal from './components/SuccessModal';
import { API_BASE_URL } from './schoolConfig';

const SESSION_STORAGE_KEY = 'sdgoekona_session_v1';

type StoredSession = {
  user: User;
};

function readStoredSession(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(
      SESSION_STORAGE_KEY
    );

    if (!raw) return null;

    const session = JSON.parse(raw) as {
      user?: User | null;
    };

    if (
      !session ||
      !session.user ||
      !session.user.id ||
      !session.user.role
    ) {
      window.localStorage.removeItem(
        SESSION_STORAGE_KEY
      );
      return null;
    }

    // Sesi tidak memiliki batas waktu.
    // Selama data sesi masih tersimpan di browser,
    // pengguna tetap login sampai menekan tombol Keluar.
    return {
      user: session.user
    };
  } catch {
    window.localStorage.removeItem(
      SESSION_STORAGE_KEY
    );
    return null;
  }
}

// API Vercel -> TiDB
const ABSENSI_API_URL = `${API_BASE_URL}/api/absensi`;

export default function App() {
  const [currentUser, setCurrentUser] =
    useState<User | null>(() => {
      if (typeof window === 'undefined') {
        return null;
      }

      return readStoredSession()?.user || null;
    });
  const [globalDatabase, setGlobalDatabase] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loaderText, setLoaderText] = useState('Menyiapkan Data...');

  // Camera capture modal state
  const [currentMode, setCurrentMode] = useState<AbsenMode | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Success modal state
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Pertahankan sesi login tanpa batas waktu.
  // Sesi hanya berakhir ketika pengguna menekan tombol Keluar
  // atau data sesi di browser dihapus secara manual.
  useEffect(() => {
    if (!currentUser) {
      return;
    }

    const stored =
      readStoredSession();

    if (!stored) {
      setCurrentUser(null);
    }
  }, [currentUser]);

  // Fetch database whenever currentUser exists
  useEffect(() => {
    if (currentUser) {
      fetchDatabase();
    }
  }, [currentUser]);

  // =====================================================
  // AMBIL DATA ABSENSI DARI TIDB
  // =====================================================
  const databaseFetchSequenceRef = useRef(0);
  const uploadInFlightRef = useRef(false);
  const lastUploadCompletedAtRef = useRef(0);

  const MIN_UPLOAD_GAP_MS = 2500;
  const DATABASE_FETCH_TIMEOUT_MS = 45000;
  const UPLOAD_REQUEST_TIMEOUT_MS = 90000;

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, ms);
    });

  const fetchDatabase = async (showLoader = true) => {
    const requestId = ++databaseFetchSequenceRef.current;

    if (showLoader) {
      setIsLoading(true);
      setLoaderText('Sinkronisasi Database TiDB...');
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, DATABASE_FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(`${ABSENSI_API_URL}?t=${Date.now()}`, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal
      });

      const raw = await res.text();

      let data: any;

      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error('Response database bukan JSON yang valid.');
      }

      if (!res.ok) {
        throw new Error(
          data?.message || `Gagal membaca database (${res.status})`
        );
      }

      // Hanya request GET terbaru yang boleh mengganti state.
      // Ini mencegah response lama menimpa data upload terbaru.
      if (requestId === databaseFetchSequenceRef.current) {
        if (Array.isArray(data)) {
          setGlobalDatabase(data);
        } else {
          console.warn('Data absensi bukan array:', data);
        }
      }
    } catch (e) {
      console.error('Fetch database error:', e);
      // Jangan kosongkan database ketika refresh gagal.
      // Data yang sudah tampil tetap dipertahankan.
    } finally {
      window.clearTimeout(timeoutId);

      if (
        showLoader &&
        requestId === databaseFetchSequenceRef.current
      ) {
        setIsLoading(false);
      }
    }
  };

  const mergeUploadedAttendance = (value: unknown) => {
    if (!value || typeof value !== 'object') {
      return;
    }

    const incoming = value as Partial<AttendanceRecord>;

    if (!incoming.id_user || !incoming.date) {
      return;
    }

    setGlobalDatabase((current) => {
      const incomingKey =
        `${String(incoming.id_user)}__${String(incoming.date)}`;

      const index = current.findIndex(
        (record) =>
          `${String(record.id_user)}__${String(record.date)}` ===
          incomingKey
      );

      if (index === -1) {
        return [
          ...current,
          incoming as AttendanceRecord
        ];
      }

      const next = [...current];

      next[index] = {
        ...next[index],
        ...incoming
      };

      return next;
    });
  };

  const handleLoginSuccess = (user: User) => {
    const session: StoredSession = {
      user
    };

    window.localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify(session)
    );

    setCurrentUser(user);
  };

  const handleLogout = () => {
    window.localStorage.removeItem(
      SESSION_STORAGE_KEY
    );

    setCurrentUser(null);
    setGlobalDatabase([]);
  };

  // =====================================================
  // KIRIM ABSENSI KE VERCEL -> TIDB
  // FOTO AKAN DITERUSKAN API KE APPS SCRIPT -> GOOGLE DRIVE
  // =====================================================
  const handleCapture = async (photoBase64: string) => {
    if (!currentUser || !currentMode) return;

    // Cegah double-submit pada event klik yang sangat cepat.
    if (uploadInFlightRef.current) {
      return;
    }

    uploadInFlightRef.current = true;

    const modeYangDikirim = currentMode;

    setIsSubmitting(true);
    setUploadProgress(10);

    // Google Drive / Apps Script kadang butuh waktu singkat
    // untuk menyelesaikan upload foto sebelumnya.
    // Jeda dibuat otomatis agar guru tidak perlu menunggu atau mencoba ulang.
    const elapsedSinceLastUpload =
      Date.now() - lastUploadCompletedAtRef.current;

    if (
      elapsedSinceLastUpload < MIN_UPLOAD_GAP_MS &&
      lastUploadCompletedAtRef.current > 0
    ) {
      await sleep(
        MIN_UPLOAD_GAP_MS - elapsedSinceLastUpload
      );
    }

    const now = new Date();

    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const localDate = `${yyyy}-${mm}-${dd}`;

    // Dibuat manual agar selalu HH:MM dan tidak berubah menjadi 24:xx
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const localTime = `${hh}:${min}`;

    setUploadProgress(35);

    const payload = {
      id_user: String(currentUser.id),
      date: localDate,
      time: localTime,
      status: modeYangDikirim,
      photo: photoBase64,
      note: '-'
    };

    try {
      setUploadProgress(55);

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => {
        controller.abort();
      }, UPLOAD_REQUEST_TIMEOUT_MS);

      let response: Response;

      try {
        response = await fetch(ABSENSI_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
      } finally {
        window.clearTimeout(timeoutId);
      }

      setUploadProgress(85);

      const raw = await response.text();

      let result: any;

      try {
        result = JSON.parse(raw);
      } catch {
        throw new Error(
          'Server absensi mengembalikan response yang tidak valid.'
        );
      }

      if (!response.ok || result.status === 'error') {
        alert(
          'GAGAL MENGIRIM ABSEN: ' +
            (result.message || `HTTP ${response.status}`)
        );

        setIsSubmitting(false);
        setUploadProgress(0);
        return;
      }

      setUploadProgress(100);
      lastUploadCompletedAtRef.current = Date.now();

      // Tampilkan hasil POST langsung di dashboard.
      // Jadi UI tidak perlu menunggu GET selesai.
      mergeUploadedAttendance(result?.data);

      setTimeout(() => {
        setIsSubmitting(false);
        setUploadProgress(0);
        setCurrentMode(null);
        setSuccessMessage(`Absensi ${modeYangDikirim} Anda sukses direkam.`);
        setShowSuccessModal(true);
      }, 350);

      // Sinkronisasi ulang dijalankan di belakang tanpa menutup UI.
      // Beri sedikit waktu tambahan agar data Drive/DB sudah stabil.
      window.setTimeout(() => {
        void fetchDatabase(false);
      }, 1200);
    } catch (err) {
      console.error(err);

      const message =
        err instanceof DOMException && err.name === 'AbortError'
          ? 'Server sedang terlalu lama merespons. Foto mungkin masih diproses. Silakan cek kembali beberapa saat lagi.'
          : err instanceof Error
            ? err.message
            : 'Gagal mengirim data absensi. Pastikan internet stabil dan coba lagi.';

      alert(
        `GAGAL MENGIRIM ABSEN: ${message}`
      );

      setIsSubmitting(false);
      setUploadProgress(0);
    } finally {
      uploadInFlightRef.current = false;
    }
  };

  const handleCloseSuccessModal = () => {
    setShowSuccessModal(false);
    setSuccessMessage('');

    // Refresh di belakang layar; jangan blokir dashboard guru.
    void fetchDatabase(false);
  };

  return (
    <div className="min-h-screen text-slate-800 bg-slate-50 relative antialiased select-none">
      {/* GLOBAL LOADER */}
      <AnimatePresence>
        {isLoading && <Loader text={loaderText} />}
      </AnimatePresence>

      {/* LOGIN SCREEN */}
      {!currentUser && (
        <LoginView onLoginSuccess={handleLoginSuccess} />
      )}

      {/* USER DASHBOARD SCREEN (GURU/KEPSEK/PEGAWAI) */}
      {currentUser && currentUser.role !== 'admin' && (
        <GuruDashboard
          user={currentUser}
          database={globalDatabase}
          onTriggerAbsen={(mode) => setCurrentMode(mode)}
          onLogout={handleLogout}
        />
      )}

      {/* ADMINISTRATOR SCREEN */}
      {currentUser && currentUser.role === 'admin' && (
        <AdminPanel
          user={currentUser}
          database={globalDatabase}
          onLogout={handleLogout}
          onRefresh={fetchDatabase}
          showLoader={(text) => {
            setLoaderText(text);
            setIsLoading(true);
          }}
          hideLoader={() => setIsLoading(false)}
        />
      )}

      {/* CAMERA CAPTURE DIALOG */}
      {currentMode && (
        <CameraCapture
          mode={currentMode}
          onCapture={handleCapture}
          onCancel={() => setCurrentMode(null)}
          isSubmitting={isSubmitting}
          uploadProgress={uploadProgress}
        />
      )}

      {/* SUCCESS CONFIRMATION POPUP */}
      <AnimatePresence>
        {showSuccessModal && (
          <SuccessModal
            onClose={handleCloseSuccessModal}
            message={successMessage}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
