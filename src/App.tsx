import { useState, useEffect } from 'react';
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
const SESSION_DURATION_MS = 30 * 60 * 1000;

type StoredSession = {
  user: User;
  expiresAt: number;
};

function readStoredSession(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(
      SESSION_STORAGE_KEY
    );

    if (!raw) return null;

    const session = JSON.parse(raw) as StoredSession;

    if (
      !session ||
      !session.user ||
      !session.user.id ||
      !session.user.role ||
      !session.expiresAt ||
      session.expiresAt <= Date.now()
    ) {
      window.localStorage.removeItem(
        SESSION_STORAGE_KEY
      );
      return null;
    }

    return session;
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

  // Pertahankan sesi saat refresh dan otomatis keluar setelah 30 menit.
  useEffect(() => {
    if (!currentUser) {
      return;
    }

    const stored =
      readStoredSession();

    if (!stored) {
      setCurrentUser(null);
      return;
    }

    const remaining =
      Math.max(
        0,
        stored.expiresAt - Date.now()
      );

    const timer =
      window.setTimeout(() => {
        window.localStorage.removeItem(
          SESSION_STORAGE_KEY
        );
        setCurrentUser(null);
        setGlobalDatabase([]);
      }, remaining);

    return () => {
      window.clearTimeout(timer);
    };
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
  const fetchDatabase = async () => {
    setIsLoading(true);
    setLoaderText('Sinkronisasi Database TiDB...');

    try {
      const res = await fetch(`${ABSENSI_API_URL}?t=${Date.now()}`, {
        method: 'GET',
        cache: 'no-store'
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data?.message || `Gagal membaca database (${res.status})`
        );
      }

      if (Array.isArray(data)) {
        setGlobalDatabase(data);
      } else {
        console.warn('Data absensi bukan array:', data);
        setGlobalDatabase([]);
      }
    } catch (e) {
      console.error('Fetch database error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoginSuccess = (user: User) => {
    const session: StoredSession = {
      user,
      expiresAt:
        Date.now() +
        SESSION_DURATION_MS
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

    const modeYangDikirim = currentMode;

    setIsSubmitting(true);
    setUploadProgress(15);

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

      const response = await fetch(ABSENSI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      setUploadProgress(85);

      const result = await response.json();

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

      // Sinkronkan data TiDB setelah berhasil
      await fetchDatabase();

      setTimeout(() => {
        setIsSubmitting(false);
        setUploadProgress(0);
        setCurrentMode(null);
        setSuccessMessage(`Absensi ${modeYangDikirim} Anda sukses direkam.`);
        setShowSuccessModal(true);
      }, 350);
    } catch (err) {
      console.error(err);

      alert(
        'Gagal mengirim data absensi. Pastikan internet stabil dan coba lagi.'
      );

      setIsSubmitting(false);
      setUploadProgress(0);
    }
  };

  const handleCloseSuccessModal = async () => {
    setShowSuccessModal(false);
    setSuccessMessage('');

    // Refresh sekali lagi untuk memastikan UI sinkron
    await fetchDatabase();
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
