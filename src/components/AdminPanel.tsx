import { useMemo, useRef, useState } from 'react';
import { User, AttendanceRecord } from '../types';
import { MASTER_USERS } from '../constants';
import { API_BASE_URL, SCHOOL_CONFIG } from '../schoolConfig';
import {
  CalendarCheck,
  Download,
  FileText,
  Filter,
  LogOut,
  Printer,
  RefreshCw,
  Search,
  Trash2,
  UploadCloud,
  X,
  AlertTriangle,
  CheckCircle2,
  Info
} from 'lucide-react';

interface AdminPanelProps {
  user: User;
  database: AttendanceRecord[];
  onLogout: () => void;
  onRefresh: () => Promise<void>;
  showLoader: (text: string) => void;
  hideLoader: () => void;
}

type AdminDialogVariant =
  | 'success'
  | 'error'
  | 'warning'
  | 'info';

interface AdminDialogState {
  open: boolean;
  title: string;
  message: string;
  variant: AdminDialogVariant;
  mode: 'message' | 'confirm';
  confirmLabel: string;
  cancelLabel: string;
}

const INITIAL_ADMIN_DIALOG: AdminDialogState = {
  open: false,
  title: '',
  message: '',
  variant: 'info',
  mode: 'message',
  confirmLabel: 'OK',
  cancelLabel: 'Batal'
};

interface GuruGroup {
  id_user: string;
  name: string;
  nip?: string | null;
  nik?: string | null;
  status_kepegawaian?: string | null;
  pangkat?: string | null;
  golongan_ruang?: string | null;
  jabatan?: string | null;
  records: AttendanceRecord[];
}

const MONTHS = [
  { value: '01', label: 'Januari' },
  { value: '02', label: 'Februari' },
  { value: '03', label: 'Maret' },
  { value: '04', label: 'April' },
  { value: '05', label: 'Mei' },
  { value: '06', label: 'Juni' },
  { value: '07', label: 'Juli' },
  { value: '08', label: 'Agustus' },
  { value: '09', label: 'September' },
  { value: '10', label: 'Oktober' },
  { value: '11', label: 'November' },
  { value: '12', label: 'Desember' }
];


const BATAS_TERLAMBAT = '07:15';

interface MonthlyRecapRow {
  id_user: string;
  nama: string;
  nipNik: string;
  golongan: string;
  jabatan: string;
  statusKepegawaian: string;
  jumlahHariKerja: number;
  tanpaBerita: number;
  ijin: number;
  sakit: number;
  dinasLuar: number;
  jumlahTidakHadir: number;
  terlambat: number;
  jumlahHariHadir: number;
  keterangan: string;
}

function parseTimeToMinutes(value?: string | null) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return hour * 60 + minute;
}

function getWorkDatesMondayToSaturday(
  year: number,
  month: number,
  today = new Date()
) {
  const result: string[] = [];
  const lastDay = new Date(year, month, 0).getDate();

  const isCurrentMonth =
    year === today.getFullYear() &&
    month === today.getMonth() + 1;

  const isFutureMonth =
    year > today.getFullYear() ||
    (year === today.getFullYear() &&
      month > today.getMonth() + 1);

  if (isFutureMonth) return result;

  const endDay = isCurrentMonth
    ? Math.min(today.getDate(), lastDay)
    : lastDay;

  for (let day = 1; day <= endDay; day++) {
    const date = new Date(year, month - 1, day);

    // Minggu = 0. Hari kerja sekolah: Senin sampai Sabtu.
    if (date.getDay() === 0) continue;

    result.push(
      `${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    );
  }

  return result;
}

function getRecordCategory(record: AttendanceRecord) {
  const text = String(record.keterangan || '')
    .trim()
    .toLowerCase();

  if (
    text.includes('tanpa berita') ||
    text.includes('alpa') ||
    text.includes('alpha')
  ) {
    return 'tanpaBerita' as const;
  }

  if (text.includes('ijin') || text.includes('izin')) {
    return 'ijin' as const;
  }

  if (text.includes('sakit')) {
    return 'sakit' as const;
  }

  if (
    text.includes('dinas luar') ||
    text === 'dl' ||
    text.includes('dinas')
  ) {
    return 'dinasLuar' as const;
  }

  return 'hadir' as const;
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDateIndonesia(value: string) {
  const parts = String(value).split('-');
  if (parts.length !== 3) return value || '-';
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function getJam(record: AttendanceRecord) {
  if (record.jam_masuk || record.jam_pulang) {
    return {
      masuk: record.jam_masuk || '-',
      pulang: record.jam_pulang || '-'
    };
  }

  const parts = String(record.time || '').split(' - ');

  if (record.status === 'MASUK & PULANG') {
    return {
      masuk: parts[0] || '-',
      pulang: parts[1] || '-'
    };
  }

  if (record.status === 'PULANG') {
    return { masuk: '-', pulang: parts[0] || '-' };
  }

  return { masuk: parts[0] || '-', pulang: '-' };
}

function driveThumbnail(fileId?: string | null) {
  if (!fileId) return '';
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w700`;
}

function driveViewUrl(fileId?: string | null) {
  if (!fileId) return '#';
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
}

const PHOTO_FALLBACK_API_URL =
  `${API_BASE_URL}/api/photos`;

const KOP_LOGO_KABUPATEN =
  `${import.meta.env.BASE_URL}logo-kabupaten-kupang.png`;

const KOP_LOGO_TUT_WURI =
  `${import.meta.env.BASE_URL}logo-tut-wuri.png`;


const KEPALA_SEKOLAH_NAMA = SCHOOL_CONFIG.headmasterName;

const KEPALA_SEKOLAH_IDENTITAS =
  'NIP. 197001162000122002';

function AttendancePhoto({
  fileId,
  alt
}: {
  fileId?: string | null;
  alt: string;
}) {
  const [fallbackSrc, setFallbackSrc] = useState('');
  const [fallbackLoading, setFallbackLoading] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);

  if (!fileId) {
    return (
      <div className="photo-placeholder">
        <span>Tidak ada foto</span>
      </div>
    );
  }

  const loadFallback = async () => {
    if (fallbackLoading || fallbackSrc || fallbackFailed) {
      return;
    }

    setFallbackLoading(true);

    try {
      const response = await fetch(PHOTO_FALLBACK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          file_ids: [fileId]
        })
      });

      const result = await response.json();

      if (!response.ok || result.status !== 'success') {
        throw new Error(
          result.message || 'Foto gagal dimuat.'
        );
      }

      const photo = Array.isArray(result.photos)
        ? result.photos.find(
            (item: any) =>
              item.file_id === fileId &&
              item.status === 'success' &&
              item.base64 &&
              item.mime_type
          )
        : null;

      if (!photo) {
        throw new Error('Foto tidak tersedia.');
      }

      setFallbackSrc(
        `data:${photo.mime_type};base64,${photo.base64}`
      );
    } catch (error) {
      console.error(
        'PHOTO FALLBACK ERROR:',
        error
      );

      setFallbackFailed(true);
    } finally {
      setFallbackLoading(false);
    }
  };

  if (fallbackSrc) {
    return (
      <a
        href={driveViewUrl(fileId)}
        target="_blank"
        rel="noreferrer"
        className="block"
        title="Buka foto di Google Drive"
      >
        <img
          src={fallbackSrc}
          alt={alt}
          loading="lazy"
          className="attendance-photo"
        />
      </a>
    );
  }

  if (fallbackFailed) {
    return (
      <a
        href={driveViewUrl(fileId)}
        target="_blank"
        rel="noreferrer"
        className="photo-placeholder no-underline"
      >
        <span>Buka foto di Drive</span>
      </a>
    );
  }

  return (
    <a
      href={driveViewUrl(fileId)}
      target="_blank"
      rel="noreferrer"
      className="block"
      title="Buka foto di Google Drive"
    >
      <div className="relative">
        <img
          src={driveThumbnail(fileId)}
          alt={alt}
          loading="lazy"
          className="attendance-photo"
          onError={() => {
            void loadFallback();
          }}
        />

        {fallbackLoading && (
          <div className="absolute inset-0 flex items-center justify-center rounded-[10px] bg-slate-50/95 px-2 text-center text-[10px] font-bold text-slate-400">
            Memuat ulang foto...
          </div>
        )}
      </div>
    </a>
  );
}


function getLocalDateInputValue() {
  const now = new Date();
  const local = new Date(
    now.getTime() - now.getTimezoneOffset() * 60000
  );

  return local.toISOString().slice(0, 10);
}

function formatUploadFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function manualBlobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Gagal membaca foto.'));
      }
    };

    reader.onerror = () => {
      reject(new Error('Gagal membaca foto.'));
    };

    reader.readAsDataURL(blob);
  });
}

function manualLoadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(
        new Error(
          'Foto tidak dapat dibaca. Gunakan JPEG, PNG, atau WebP.'
        )
      );
    };

    image.src = objectUrl;
  });
}

function manualCanvasToBlob(
  canvas: HTMLCanvasElement,
  quality: number
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Gagal mengoptimalkan foto.'));
        }
      },
      'image/jpeg',
      quality
    );
  });
}

async function optimizeAdminPhoto(file: File) {
  /*
   * Sama seperti upload absensi normal:
   * foto dioptimalkan di browser sebelum masuk Vercel.
   * Satu request hanya membawa satu foto agar aman dari limit payload.
   */
  const TARGET_BYTES = 1.8 * 1024 * 1024;
  const MAX_DIMENSION = 1600;

  const image = await manualLoadImage(file);

  let width = image.naturalWidth;
  let height = image.naturalHeight;

  const scale = Math.min(
    1,
    MAX_DIMENSION / Math.max(width, height)
  );

  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Browser tidak mendukung pemrosesan foto.');
  }

  ctx.drawImage(image, 0, 0, width, height);

  let quality = 0.84;
  let blob = await manualCanvasToBlob(canvas, quality);

  while (blob.size > TARGET_BYTES && quality > 0.52) {
    quality -= 0.08;
    blob = await manualCanvasToBlob(canvas, quality);
  }

  if (blob.size > TARGET_BYTES) {
    const reducedCanvas = document.createElement('canvas');

    reducedCanvas.width = Math.max(
      1,
      Math.round(canvas.width * 0.75)
    );

    reducedCanvas.height = Math.max(
      1,
      Math.round(canvas.height * 0.75)
    );

    const reducedCtx = reducedCanvas.getContext('2d');

    if (!reducedCtx) {
      throw new Error('Browser tidak mendukung pemrosesan foto.');
    }

    reducedCtx.drawImage(
      canvas,
      0,
      0,
      reducedCanvas.width,
      reducedCanvas.height
    );

    blob = await manualCanvasToBlob(
      reducedCanvas,
      0.7
    );
  }

  return blob;
}

export default function AdminPanel({
  user,
  database,
  onLogout,
  onRefresh,
  showLoader,
  hideLoader
}: AdminPanelProps) {
  const now = new Date();
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
  const currentYear = now.getFullYear();

  const [activeView, setActiveView] = useState<'laporan' | 'rekap'>('laporan');
  const [selectedGuru, setSelectedGuru] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingKey, setDeletingKey] = useState('');
  const [manualUploadOpen, setManualUploadOpen] = useState(false);
  const [manualGuru, setManualGuru] = useState('');
  const [manualDate, setManualDate] = useState(getLocalDateInputValue());
  const [manualJamMasuk, setManualJamMasuk] = useState('');
  const [manualJamPulang, setManualJamPulang] = useState('');
  const [manualPhotoMasuk, setManualPhotoMasuk] = useState<File | null>(null);
  const [manualPhotoPulang, setManualPhotoPulang] = useState<File | null>(null);
  const [manualNote, setManualNote] = useState('');
  const [manualSaving, setManualSaving] = useState(false);
  const [adminDialog, setAdminDialog] = useState<AdminDialogState>(
    INITIAL_ADMIN_DIALOG
  );

  const dialogResolveRef = useRef<
    ((value: boolean) => void) | null
  >(null);

  const staffList = useMemo(
    () => MASTER_USERS.filter((u) => u.role !== 'admin'),
    []
  );

  const availableYears = useMemo(() => {
    const years = new Set<number>([currentYear]);

    database.forEach((record) => {
      const year = Number(String(record.date).slice(0, 4));
      if (Number.isInteger(year) && year >= 2000 && year <= 2100) {
        years.add(year);
      }
    });

    return Array.from(years).sort((a, b) => b - a);
  }, [database, currentYear]);

  const filteredRecords = useMemo(() => {
    const monthPrefix = `${selectedYear}-${selectedMonth}`;
    const query = searchQuery.trim().toLowerCase();

    return database
      .filter((record) => {
        const matchesMonth = String(record.date).startsWith(monthPrefix);
        const matchesGuru = selectedGuru
          ? String(record.id_user) === selectedGuru
          : true;

        const searchable = [
          record.name,
          record.id_user,
          record.nip,
          record.nik,
          record.jabatan,
          record.status_kepegawaian
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        const matchesSearch = query ? searchable.includes(query) : true;

        return matchesMonth && matchesGuru && matchesSearch;
      })
      .sort((a, b) => {
        const byName = String(a.name).localeCompare(String(b.name), 'id');
        if (byName !== 0) return byName;
        return String(a.date).localeCompare(String(b.date));
      });
  }, [database, searchQuery, selectedGuru, selectedMonth, selectedYear]);

  const groupedRecords = useMemo<GuruGroup[]>(() => {
    const groups = new Map<string, GuruGroup>();

    filteredRecords.forEach((record) => {
      const key = String(record.id_user);
      const existing = groups.get(key);

      if (existing) {
        existing.records.push(record);
        return;
      }

      groups.set(key, {
        id_user: key,
        name: record.name,
        nip: record.nip,
        nik: record.nik,
        status_kepegawaian: record.status_kepegawaian,
        pangkat: record.pangkat,
        golongan_ruang: record.golongan_ruang,
        jabatan: record.jabatan,
        records: [record]
      });
    });

    return Array.from(groups.values());
  }, [filteredRecords]);

  const manualExistingRecord = useMemo(() => {
    if (!manualGuru || !manualDate) {
      return undefined;
    }

    return database.find(
      (record) =>
        String(record.id_user) === manualGuru &&
        String(record.date) === manualDate
    );
  }, [database, manualDate, manualGuru]);

  const monthlyRecap = useMemo<MonthlyRecapRow[]>(() => {
    const year = Number(selectedYear);
    const month = Number(selectedMonth);

    const workDates = getWorkDatesMondayToSaturday(year, month);
    const workDateSet = new Set(workDates);
    const monthPrefix = `${selectedYear}-${selectedMonth}`;
    const lateLimit = parseTimeToMinutes(BATAS_TERLAMBAT) ?? 0;
    const query = searchQuery.trim().toLowerCase();

    const metadataMap = new Map<string, AttendanceRecord>();

    [...database]
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .forEach((record) => {
        metadataMap.set(String(record.id_user), record);
      });

    return staffList
      .filter((staff) => {
        if (selectedGuru && staff.id !== selectedGuru) {
          return false;
        }

        const meta = metadataMap.get(staff.id);

        const searchable = [
          meta?.name || staff.name,
          staff.id,
          meta?.nip,
          meta?.nik,
          meta?.jabatan,
          meta?.status_kepegawaian,
          meta?.golongan_ruang
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return query ? searchable.includes(query) : true;
      })
      .map((staff) => {
        const meta = metadataMap.get(staff.id);

        const records = database
          .filter(
            (record) =>
              String(record.id_user) === staff.id &&
              String(record.date).startsWith(monthPrefix) &&
              workDateSet.has(String(record.date))
          )
          .sort((a, b) =>
            String(a.date).localeCompare(String(b.date))
          );

        const dayCategory = new Map<
          string,
          ReturnType<typeof getRecordCategory>
        >();

        const lateDates = new Set<string>();

        records.forEach((record) => {
          const date = String(record.date);
          const category = getRecordCategory(record);

          dayCategory.set(date, category);

          if (category === 'hadir') {
            const masukMinutes = parseTimeToMinutes(
              getJam(record).masuk
            );

            if (
              masukMinutes !== null &&
              masukMinutes > lateLimit
            ) {
              lateDates.add(date);
            }
          }
        });

        let hadir = 0;
        let ijin = 0;
        let sakit = 0;
        let dinasLuar = 0;
        let explicitTanpaBerita = 0;

        dayCategory.forEach((category) => {
          if (category === 'hadir') hadir++;
          if (category === 'ijin') ijin++;
          if (category === 'sakit') sakit++;
          if (category === 'dinasLuar') dinasLuar++;
          if (category === 'tanpaBerita') explicitTanpaBerita++;
        });

        const accounted =
          hadir +
          ijin +
          sakit +
          dinasLuar +
          explicitTanpaBerita;

        const automaticTanpaBerita = Math.max(
          0,
          workDates.length - accounted
        );

        const tanpaBerita =
          explicitTanpaBerita + automaticTanpaBerita;

        const jumlahTidakHadir =
          tanpaBerita + ijin + sakit + dinasLuar;

        return {
          id_user: staff.id,
          nama: meta?.name || staff.name,
          nipNik:
            meta?.nip ||
            meta?.nik ||
            staff.id ||
            '-',
          golongan: meta?.golongan_ruang || '-',
          jabatan: meta?.jabatan || '-',
          statusKepegawaian:
            meta?.status_kepegawaian || '-',
          jumlahHariKerja: workDates.length,
          tanpaBerita,
          ijin,
          sakit,
          dinasLuar,
          jumlahTidakHadir,
          terlambat: lateDates.size,
          jumlahHariHadir: hadir,
          keterangan: '-'
        };
      });
  }, [
    database,
    searchQuery,
    selectedGuru,
    selectedMonth,
    selectedYear,
    staffList
  ]);

  const selectedMonthLabel =
    MONTHS.find((month) => month.value === selectedMonth)?.label || '';

  const ABSENSI_API_URL =
    `${API_BASE_URL}/api/absensi`;

  const EXPORT_EXCEL_URL =
    `${API_BASE_URL}/api/export-excel`;

  const EXPORT_WORD_URL =
    `${API_BASE_URL}/api/export-word`;

  const EXPORT_REKAP_WORD_URL =
    `${API_BASE_URL}/api/export-rekap-word`;

  const closeAdminDialog = (result = false) => {
    const resolver = dialogResolveRef.current;
    dialogResolveRef.current = null;

    setAdminDialog(INITIAL_ADMIN_DIALOG);

    if (resolver) {
      resolver(result);
    }
  };

  const showAdminMessage = (
    title: string,
    message: string,
    variant: AdminDialogVariant = 'info',
    confirmLabel = 'OK'
  ) => {
    dialogResolveRef.current = null;

    setAdminDialog({
      open: true,
      title,
      message,
      variant,
      mode: 'message',
      confirmLabel,
      cancelLabel: 'Batal'
    });
  };

  const askAdminConfirm = (
    title: string,
    message: string,
    options?: {
      variant?: AdminDialogVariant;
      confirmLabel?: string;
      cancelLabel?: string;
    }
  ) => {
    return new Promise<boolean>((resolve) => {
      dialogResolveRef.current = resolve;

      setAdminDialog({
        open: true,
        title,
        message,
        variant: options?.variant || 'warning',
        mode: 'confirm',
        confirmLabel: options?.confirmLabel || 'Lanjutkan',
        cancelLabel: options?.cancelLabel || 'Batal'
      });
    });
  };

  const handleRefresh = async () => {
    showLoader('Memperbarui Data TiDB...');
    try {
      await onRefresh();
    } finally {
      hideLoader();
    }
  };


  const resetManualUploadForm = () => {
    setManualGuru('');
    setManualDate(getLocalDateInputValue());
    setManualJamMasuk('');
    setManualJamPulang('');
    setManualPhotoMasuk(null);
    setManualPhotoPulang(null);
    setManualNote('');
  };

  const closeManualUpload = () => {
    if (manualSaving) return;

    setManualUploadOpen(false);
    resetManualUploadForm();
  };

  const sendManualPhoto = async (
    status: 'MASUK' | 'PULANG',
    file: File,
    time: string
  ) => {
    const optimized = await optimizeAdminPhoto(file);
    const photo = await manualBlobToDataUrl(optimized);

    const response = await fetch(
      ABSENSI_API_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          admin_manual: true,
          id_user: manualGuru,
          date: manualDate,
          time,
          status,
          photo,
          note: manualNote
        })
      }
    );

    const result = await response.json();

    if (!response.ok || result.status !== 'success') {
      throw new Error(
        result.message ||
        `Upload foto ${status.toLowerCase()} gagal.`
      );
    }

    return result;
  };

  const handleManualUpload = async () => {
    if (!manualGuru) {
      showAdminMessage(
        'Guru Belum Dipilih',
        'Pilih guru / pegawai terlebih dahulu.',
        'warning'
      );
      return;
    }

    if (!manualDate) {
      showAdminMessage(
        'Tanggal Belum Dipilih',
        'Pilih tanggal absensi terlebih dahulu.',
        'warning'
      );
      return;
    }

    if (!manualPhotoMasuk && !manualPhotoPulang) {
      showAdminMessage(
        'Foto Belum Dipilih',
        'Pilih minimal Foto Masuk atau Foto Pulang.',
        'warning'
      );
      return;
    }

    const replacingMasuk =
      Boolean(manualPhotoMasuk) &&
      Boolean(manualExistingRecord?.foto_masuk_file_id);

    const replacingPulang =
      Boolean(manualPhotoPulang) &&
      Boolean(manualExistingRecord?.foto_pulang_file_id);

    if (replacingMasuk || replacingPulang) {
      const parts = [
        replacingMasuk ? 'Foto Masuk' : '',
        replacingPulang ? 'Foto Pulang' : ''
      ].filter(Boolean);

      const confirmed = await askAdminConfirm(
        'Ganti Foto Absensi?',
        `${parts.join(' dan ')} pada tanggal ini sudah ada.\n\n` +
        'Foto yang dipilih akan menggantikan foto lama.',
        {
          variant: 'warning',
          confirmLabel: 'Ya, Ganti Foto',
          cancelLabel: 'Batalkan'
        }
      );

      if (!confirmed) {
        return;
      }
    }

    setManualSaving(true);
    showLoader('Menyiapkan upload manual...');

    const berhasil: string[] = [];

    try {
      /*
       * Sengaja dikirim satu per satu.
       * Dua foto tidak digabung dalam satu request supaya payload Vercel aman.
       */
      if (manualPhotoMasuk) {
        showLoader('Mengunggah Foto Masuk...');

        await sendManualPhoto(
          'MASUK',
          manualPhotoMasuk,
          manualJamMasuk
        );

        berhasil.push('Foto Masuk');
      }

      if (manualPhotoPulang) {
        showLoader('Mengunggah Foto Pulang...');

        await sendManualPhoto(
          'PULANG',
          manualPhotoPulang,
          manualJamPulang
        );

        berhasil.push('Foto Pulang');
      }

      showLoader('Memperbarui laporan...');
      await onRefresh();

      const [year, month] = manualDate.split('-');

      if (year && month) {
        setSelectedYear(year);
        setSelectedMonth(month);
      }

      setSelectedGuru(manualGuru);

      setManualUploadOpen(false);
      resetManualUploadForm();

      showAdminMessage(
        'Upload Berhasil',
        `${berhasil.join(' + ')} sudah disimpan.`,
        'success',
        'Selesai'
      );

    } catch (error) {
      /*
       * Jika Foto Masuk sudah berhasil tetapi Foto Pulang gagal,
       * data pertama tetap aman. Admin cukup ulangi bagian yang gagal.
       */
      await onRefresh();

      showAdminMessage(
        berhasil.length > 0
          ? 'Upload Sebagian Berhasil'
          : 'Upload Gagal',
        `${
          berhasil.length > 0
            ? `${berhasil.join(' + ')} sudah berhasil disimpan.\n\n`
            : ''
        }${
          error instanceof Error
            ? error.message
            : 'Upload manual gagal.'
        }`,
        berhasil.length > 0 ? 'warning' : 'error'
      );

    } finally {
      setManualSaving(false);
      hideLoader();
    }
  };

  const handleDeleteAttendance = async (
    record: AttendanceRecord
  ) => {
    const key = `${record.id_user}-${record.date}`;

    if (deletingKey) {
      return;
    }

    const confirmed = await askAdminConfirm(
      'Hapus Data Absensi?',
      `Nama: ${record.name}\n` +
      `Tanggal: ${formatDateIndonesia(record.date)}\n\n` +
      'Data absensi akan dihapus dari TiDB dan Foto Masuk/Pulang dipindahkan ke Sampah Google Drive.',
      {
        variant: 'error',
        confirmLabel: 'Ya, Hapus',
        cancelLabel: 'Batalkan'
      }
    );

    if (!confirmed) {
      return;
    }

    setDeletingKey(key);
    showLoader('Menghapus data absensi...');

    try {
      const params = new URLSearchParams({
        id_user: String(record.id_user),
        tanggal: String(record.date)
      });

      const response = await fetch(
        `${ABSENSI_API_URL}?${params.toString()}`,
        {
          method: 'DELETE'
        }
      );

      const result = await response.json();

      if (!response.ok || result.status !== 'success') {
        throw new Error(
          result.message ||
          'Data absensi gagal dihapus.'
        );
      }

      await onRefresh();

      if (result.warning) {
        showAdminMessage(
          'Data Berhasil Dihapus',
          `Data absensi berhasil dihapus.\n\nCatatan: ${result.warning}`,
          'warning'
        );
      }
    } catch (error) {
      showAdminMessage(
        'Gagal Menghapus Data',
        error instanceof Error
          ? error.message
          : 'Data absensi gagal dihapus.',
        'error'
      );
    } finally {
      setDeletingKey('');
      hideLoader();
    }
  };


  const downloadExportFile = async (
    url: string,
    fallbackName: string,
    loaderText: string
  ) => {
    showLoader(loaderText);

    try {
      const response = await fetch(url, {
        method: 'GET',
        cache: 'no-store'
      });

      const contentType =
        String(
          response.headers.get(
            'content-type'
          ) || ''
        ).toLowerCase();

      if (!response.ok) {
        const text =
          await response.text();

        let message =
          `Server export gagal (${response.status}).`;

        try {
          const data = JSON.parse(text);

          if (data?.message) {
            message =
              String(data.message);
          }
        } catch {
          if (text.trim()) {
            message =
              text.trim();
          }
        }

        throw new Error(message);
      }

      if (
        contentType.includes(
          'application/json'
        ) ||
        contentType.includes(
          'text/plain'
        ) ||
        contentType.includes(
          'text/html'
        )
      ) {
        const text =
          await response.text();

        let message =
          'Server tidak mengirim file export.';

        try {
          const data = JSON.parse(text);

          if (data?.message) {
            message =
              String(data.message);
          }
        } catch {
          if (text.trim()) {
            message =
              text.trim();
          }
        }

        throw new Error(message);
      }

      const blob =
        await response.blob();

      if (blob.size === 0) {
        throw new Error(
          'File export kosong.'
        );
      }

      let fileName =
        fallbackName;

      const disposition =
        response.headers.get(
          'content-disposition'
        ) || '';

      const utf8Match =
        disposition.match(
          /filename\*=UTF-8''([^;]+)/i
        );

      const normalMatch =
        disposition.match(
          /filename="([^"]+)"/i
        ) ||
        disposition.match(
          /filename=([^;]+)/i
        );

      if (utf8Match?.[1]) {
        try {
          fileName =
            decodeURIComponent(
              utf8Match[1]
            );
        } catch {
          fileName =
            utf8Match[1];
        }
      } else if (normalMatch?.[1]) {
        fileName =
          normalMatch[1].trim();
      }

      const objectUrl =
        URL.createObjectURL(blob);

      const anchor =
        document.createElement('a');

      anchor.href = objectUrl;
      anchor.download = fileName;
      anchor.style.display = 'none';

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      window.setTimeout(() => {
        URL.revokeObjectURL(
          objectUrl
        );
      }, 1000);

    } catch (error) {
      showAdminMessage(
        'Export Gagal',
        error instanceof Error
          ? error.message
          : 'File export gagal dibuat.',
        'error'
      );
    } finally {
      hideLoader();
    }
  };

  const handleDownloadExcel = async () => {
    if (filteredRecords.length === 0) {
      showAdminMessage(
        'Data Tidak Tersedia',
        'Tidak ada data absensi pada periode yang dipilih.',
        'warning'
      );
      return;
    }

    const params = new URLSearchParams({
      bulan: selectedMonth,
      tahun: selectedYear
    });

    if (selectedGuru) {
      params.set('id_user', selectedGuru);
    }

    const url =
      `${EXPORT_EXCEL_URL}?${params.toString()}`;

    await downloadExportFile(
      url,
      `Absensi_${selectedMonth}_${selectedYear}.xlsx`,
      'Menyiapkan file Excel...'
    );
  };

  const handleDownloadWord = async () => {
    if (filteredRecords.length === 0) {
      showAdminMessage(
        'Data Tidak Tersedia',
        'Tidak ada data absensi pada periode yang dipilih.',
        'warning'
      );
      return;
    }

    const params = new URLSearchParams({
      bulan: selectedMonth,
      tahun: selectedYear
    });

    if (selectedGuru) {
      params.set('id_user', selectedGuru);
    }

    const url =
      `${EXPORT_WORD_URL}?${params.toString()}`;

    await downloadExportFile(
      url,
      `Absensi_${selectedMonth}_${selectedYear}.docx`,
      'Menyiapkan file Word...'
    );
  };

  const handleDownloadMonthlyRecapWord = async () => {
    if (monthlyRecap.length === 0) {
      showAdminMessage(
        'Rekap Tidak Tersedia',
        'Tidak ada data rekap pada periode yang dipilih.',
        'warning'
      );
      return;
    }

    const params = new URLSearchParams({
      bulan: selectedMonth,
      tahun: selectedYear
    });

    if (selectedGuru) {
      params.set('id_user', selectedGuru);
    }

    if (searchQuery.trim()) {
      params.set('q', searchQuery.trim());
    }

    const url =
      `${EXPORT_REKAP_WORD_URL}?${params.toString()}`;

    await downloadExportFile(
      url,
      `Rekap_Absensi_${selectedMonth}_${selectedYear}.docx`,
      'Menyiapkan rekap Word...'
    );
  };

  const handlePrintMonthlyRecap = () => {
    const printWindow = window.open(
      '',
      '_blank',
      'width=1600,height=900'
    );

    if (!printWindow) {
      showAdminMessage(
        'Cetak Rekap Tidak Dapat Dibuka',
        'Browser memblokir jendela cetak. Izinkan pembukaan jendela baru untuk fitur Cetak Rekap.',
        'warning'
      );
      return;
    }

    const rowsHtml = monthlyRecap
      .map(
        (row, index) => `
          <tr>
            <td>${index + 1}</td>
            <td class="left">${escapeHtml(row.nama)}</td>
            <td>${escapeHtml(row.nipNik)}</td>
            <td>${escapeHtml(row.golongan)}</td>
            <td class="left">${escapeHtml(row.jabatan)}</td>
            <td>${escapeHtml(row.statusKepegawaian)}</td>
            <td>${row.jumlahHariKerja}</td>
            <td>${row.tanpaBerita}</td>
            <td>${row.ijin}</td>
            <td>${row.sakit}</td>
            <td>${row.dinasLuar}</td>
            <td>${row.jumlahTidakHadir}</td>
            <td>${row.terlambat}</td>
            <td>${row.jumlahHariHadir}</td>
            <td>${escapeHtml(row.keterangan)}</td>
          </tr>
        `
      )
      .join('');

    const kopLogoKabupatenPrint =
      new URL(
        KOP_LOGO_KABUPATEN,
        window.location.href
      ).href;

    const kopLogoTutWuriPrint =
      new URL(
        KOP_LOGO_TUT_WURI,
        window.location.href
      ).href;

    printWindow.document.open();

    printWindow.document.write(`
      <!doctype html>
      <html lang="id">
        <head>
          <meta charset="utf-8" />
          <title>Rekap Absensi ${escapeHtml(selectedMonthLabel)} ${escapeHtml(selectedYear)}</title>
          <style>
            @page {
              size: A4 landscape;
              margin: 6mm;
            }

            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              font-family: Arial, sans-serif;
              color: #000;
              background: #fff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            .kop {
              display: grid;
              grid-template-columns: 24mm 1fr 24mm;
              align-items: center;
              gap: 3mm;
              padding: 0 3mm 2.5mm;
              border-bottom: 3px double #000;
              margin-bottom: 3mm;
            }

            .kop-logo {
              display: flex;
              align-items: center;
              justify-content: center;
            }

            .kop-logo img {
              width: 20mm;
              height: 20mm;
              object-fit: contain;
            }

            .kop-text {
              text-align: center;
              line-height: 1.12;
            }

            .kop-line-1 {
              font-size: 11pt;
              font-weight: 700;
            }

            .kop-line-2 {
              margin-top: 1mm;
              font-size: 11pt;
              font-weight: 700;
            }

            .kop-school {
              margin-top: 1mm;
              font-size: 12pt;
              font-weight: 800;
            }

            .kop-address {
              margin-top: 1mm;
              font-size: 8.5pt;
              font-style: italic;
              font-weight: 600;
            }

            h1 {
              margin: 0;
              text-align: center;
              font-size: 12pt;
            }

            .period {
              margin: 1.5mm 0 4mm;
              text-align: center;
              font-size: 9pt;
              font-weight: 700;
              text-transform: uppercase;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
            }

            thead {
              display: table-header-group;
            }

            th,
            td {
              border: 1px solid #000;
              padding: 1.5mm 1mm;
              text-align: center;
              vertical-align: middle;
              font-size: 6.8pt;
              line-height: 1.15;
              overflow-wrap: anywhere;
            }

            th {
              font-weight: 700;
            }

            td.left {
              text-align: left;
            }

            tr {
              break-inside: avoid;
              page-break-inside: avoid;
            }

            .note {
              margin-top: 3mm;
              font-size: 7pt;
            }

            .signature-wrap {
              display: flex;
              justify-content: flex-end;
              margin-top: 6mm;
              page-break-inside: avoid;
              break-inside: avoid;
            }

            .signature-box {
              width: 62mm;
              text-align: center;
              font-size: 9pt;
              line-height: 1.25;
            }

            .signature-space {
              height: 19mm;
            }

            .signature-name {
              font-weight: 700;
              text-decoration: underline;
              text-underline-offset: 2px;
            }
          </style>
        </head>

        <body>
          <div class="kop">
            <div class="kop-logo">
              <img
                src="${kopLogoKabupatenPrint}"
                alt="Logo Kabupaten Kupang"
              />
            </div>

            <div class="kop-text">
              <div class="kop-line-1">
                ${SCHOOL_CONFIG.government}
              </div>
              <div class="kop-line-2">
                ${SCHOOL_CONFIG.department}
              </div>
              <div class="kop-school">
                ${SCHOOL_CONFIG.schoolName}
              </div>
              <div class="kop-address">
                ${SCHOOL_CONFIG.address}
              </div>
            </div>

            <div class="kop-logo">
              <img
                src="${kopLogoTutWuriPrint}"
                alt="Logo Tut Wuri Handayani"
              />
            </div>
          </div>

          <h1>REKAPITULASI ABSENSI GURU DAN PEGAWAI</h1>

          <div class="period">
            BULAN ${escapeHtml(selectedMonthLabel)} ${escapeHtml(selectedYear)}
          </div>

          <table>
            <thead>
              <tr>
                <th rowspan="2">No.</th>
                <th rowspan="2">NAMA</th>
                <th rowspan="2">NIP / NIK</th>
                <th rowspan="2">PANGKAT / GOL</th>
                <th rowspan="2">JABATAN</th>
                <th rowspan="2">STATUS</th>
                <th rowspan="2">JUMLAH<br>HARI KERJA</th>
                <th colspan="6">KETERANGAN</th>
                <th rowspan="2">JUMLAH<br>HARI HADIR</th>
                <th rowspan="2">KETERANGAN</th>
              </tr>

              <tr>
                <th>TANPA<br>BERITA</th>
                <th>IJIN</th>
                <th>SAKIT</th>
                <th>DINAS<br>LUAR</th>
                <th>JUMLAH</th>
                <th>TERLAMBAT</th>
              </tr>
            </thead>

            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div class="note">
            Hari kerja dihitung Senin s.d. Sabtu.
            Untuk bulan berjalan hanya dihitung sampai tanggal hari ini.
            Batas terlambat: ${escapeHtml(BATAS_TERLAMBAT)}.
          </div>


          <div class="signature-wrap">
            <div class="signature-box">
              <div>Mengetahui,</div>
              <div>Kepala Sekolah</div>
              <div class="signature-space"></div>
              <div class="signature-name">
                ${escapeHtml(KEPALA_SEKOLAH_NAMA)}
              </div>
              <div>
                ${escapeHtml(KEPALA_SEKOLAH_IDENTITAS)}
              </div>
            </div>
          </div>

          <script>
            window.onload = function () {
              setTimeout(function () {
                window.print();
              }, 250);
            };
          <\/script>
        </body>
      </html>
    `);

    printWindow.document.close();
  };

  const handlePrint = async () => {
    showLoader('Menyiapkan Foto untuk Dicetak...');

    try {
      const images = Array.from(
        document.querySelectorAll<HTMLImageElement>('img.attendance-photo')
      );

      await Promise.race([
        Promise.all(
          images.map(
            (img) =>
              new Promise<void>((resolve) => {
                if (img.complete) {
                  resolve();
                  return;
                }

                const done = () => resolve();
                img.addEventListener('load', done, { once: true });
                img.addEventListener('error', done, { once: true });
              })
          )
        ),
        new Promise<void>((resolve) => setTimeout(resolve, 7000))
      ]);
    } finally {
      hideLoader();
    }

    setTimeout(() => window.print(), 100);
  };

  return (
    <div className="min-h-screen bg-slate-50 admin-report-page">
      <style>{`
        .attendance-photo {
          width: 132px;
          height: 170px;
          object-fit: cover;
          display: block;
          margin: 0 auto;
          border-radius: 10px;
          background: #f1f5f9;
        }

        @media (max-width: 1023px) {
          .admin-report-page {
            padding: 12px;
          }

          .admin-report-page aside {
            border-radius: 24px;
          }
        }

        .photo-placeholder {
          width: 132px;
          height: 170px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 10px;
          border: 1px dashed #cbd5e1;
          border-radius: 10px;
          background: #f8fafc;
          color: #94a3b8;
          font-size: 11px;
          font-weight: 700;
        }

        @media print {
          @page {
            size: A4 landscape;
            margin: 7mm;
          }

          html,
          body,
          #root {
            background: #ffffff !important;
          }

          body {
            margin: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .admin-report-page {
            min-height: 0 !important;
            background: #ffffff !important;
            padding: 0 !important;
          }

          .report-shell {
            max-width: none !important;
            width: 100% !important;
            margin: 0 !important;
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            overflow: visible !important;
          }

          .report-table-wrap {
            overflow: visible !important;
          }

          .report-table {
            width: 100% !important;
            min-width: 0 !important;
            table-layout: fixed !important;
            border-collapse: collapse !important;
            font-family: Arial, sans-serif !important;
            color: #000 !important;
          }

          .report-table thead {
            display: table-header-group !important;
          }

          .report-table th,
          .report-table td {
            border: 1px solid #000 !important;
            padding: 2.2mm 1.5mm !important;
            color: #000 !important;
            background: #fff !important;
            font-size: 8pt !important;
            line-height: 1.3 !important;
          }

          .report-table th {
            font-size: 7.5pt !important;
            font-weight: 700 !important;
            text-align: center !important;
            vertical-align: middle !important;
          }

          .report-table tr {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          .report-no-col {
            width: 8mm !important;
          }

          .report-identity-col {
            width: 58mm !important;
          }

          .report-date-col {
            width: 24mm !important;
          }

          .report-time-col {
            width: 30mm !important;
          }

          .report-status-col {
            width: 34mm !important;
          }

          .report-note-col {
            width: 25mm !important;
          }

          .report-photo-col {
            width: 43mm !important;
          }

          .attendance-photo,
          .photo-placeholder {
            width: 38mm !important;
            height: 49mm !important;
            border-radius: 0 !important;
          }

          .photo-placeholder {
            border: 1px solid #777 !important;
            color: #555 !important;
            font-size: 7pt !important;
          }

          .identity-label {
            display: inline-block !important;
            width: 14mm !important;
            font-weight: 700 !important;
          }

          .screen-only {
            display: none !important;
          }

          .print-only {
            display: block !important;
          }
        }
      `}</style>

      <div className="min-h-screen">
        {adminDialog.open && (
          <div className="screen-only fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
              <div className="p-6 sm:p-7">
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                      adminDialog.variant === 'success'
                        ? 'bg-emerald-50 text-emerald-600'
                        : adminDialog.variant === 'error'
                          ? 'bg-red-50 text-red-600'
                          : adminDialog.variant === 'warning'
                            ? 'bg-amber-50 text-amber-600'
                            : 'bg-blue-50 text-blue-600'
                    }`}
                  >
                    {adminDialog.variant === 'success' ? (
                      <CheckCircle2 className="h-6 w-6" />
                    ) : adminDialog.variant === 'error' || adminDialog.variant === 'warning' ? (
                      <AlertTriangle className="h-6 w-6" />
                    ) : (
                      <Info className="h-6 w-6" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-lg font-black text-slate-900">
                      {adminDialog.title}
                    </h3>

                    <p className="mt-2 whitespace-pre-line font-sans text-sm font-medium leading-6 text-slate-500">
                      {adminDialog.message}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/70 px-6 py-4 sm:flex-row sm:justify-end">
                {adminDialog.mode === 'confirm' && (
                  <button
                    type="button"
                    onClick={() => closeAdminDialog(false)}
                    className="cursor-pointer rounded-xl bg-white px-5 py-3 text-xs font-bold text-slate-600 ring-1 ring-slate-200 transition-colors hover:bg-slate-100"
                  >
                    {adminDialog.cancelLabel}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => closeAdminDialog(true)}
                  className={`cursor-pointer rounded-xl px-5 py-3 text-xs font-black text-white transition-colors ${
                    adminDialog.variant === 'error'
                      ? 'bg-red-600 hover:bg-red-700'
                      : adminDialog.variant === 'warning'
                        ? 'bg-amber-500 hover:bg-amber-600'
                        : adminDialog.variant === 'success'
                          ? 'bg-emerald-600 hover:bg-emerald-700'
                          : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {adminDialog.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        )}

        {manualUploadOpen && (
          <div className="screen-only fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6">
            <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
                <div>
                  <h3 className="font-display text-xl font-black text-slate-900">
                    Upload Absensi Manual
                  </h3>
                  <p className="mt-1 text-xs font-semibold text-slate-400">
                    Untuk guru / pegawai yang lupa mengunggah foto absensi.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeManualUpload}
                  disabled={manualSaving}
                  className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-5 p-5 sm:p-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
                      Guru / Pegawai
                    </label>

                    <select
                      value={manualGuru}
                      onChange={(e) => setManualGuru(e.target.value)}
                      disabled={manualSaving}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 font-semibold text-slate-700 outline-none focus:border-amber-500 focus:bg-white"
                    >
                      <option value="">-- Pilih Guru / Pegawai --</option>
                      {staffList.map((staff) => (
                        <option key={staff.id} value={staff.id}>
                          {staff.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
                      Tanggal
                    </label>

                    <input
                      type="date"
                      value={manualDate}
                      onChange={(e) => setManualDate(e.target.value)}
                      disabled={manualSaving}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 font-semibold text-slate-700 outline-none focus:border-amber-500 focus:bg-white"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
                      Keterangan
                    </label>

                    <input
                      type="text"
                      value={manualNote}
                      onChange={(e) => setManualNote(e.target.value)}
                      disabled={manualSaving}
                      placeholder="Opsional"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 font-semibold text-slate-700 outline-none placeholder:text-slate-400 focus:border-amber-500 focus:bg-white"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
                      Jam Masuk
                    </label>

                    <input
                      type="time"
                      value={manualJamMasuk}
                      onChange={(e) => setManualJamMasuk(e.target.value)}
                      disabled={manualSaving}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 font-semibold text-slate-700 outline-none focus:border-emerald-500 focus:bg-white"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
                      Jam Pulang
                    </label>

                    <input
                      type="time"
                      value={manualJamPulang}
                      onChange={(e) => setManualJamPulang(e.target.value)}
                      disabled={manualSaving}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 font-semibold text-slate-700 outline-none focus:border-orange-500 focus:bg-white"
                    />
                  </div>
                </div>

                {manualExistingRecord && (
                  <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs font-semibold text-blue-800">
                    <div className="font-black">Data tanggal ini sudah ada.</div>
                    <div className="mt-1 leading-5">
                      Jam: {getJam(manualExistingRecord).masuk} - {getJam(manualExistingRecord).pulang}
                      {' • '}
                      Foto Masuk: {manualExistingRecord.foto_masuk_file_id ? 'Ada' : 'Belum'}
                      {' • '}
                      Foto Pulang: {manualExistingRecord.foto_pulang_file_id ? 'Ada' : 'Belum'}
                    </div>
                    <div className="mt-1 font-medium text-blue-600">
                      Jika Anda memilih foto yang sudah ada, foto lama akan diganti. Jam yang dikosongkan tidak akan mengubah jam lama.
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="cursor-pointer rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50/50 p-5 transition-colors hover:border-emerald-400 hover:bg-emerald-50">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={manualSaving}
                      onChange={(e) =>
                        setManualPhotoMasuk(e.target.files?.[0] || null)
                      }
                    />

                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white">
                        <UploadCloud className="h-5 w-5" />
                      </div>

                      <div className="min-w-0">
                        <div className="text-xs font-black uppercase tracking-wide text-emerald-700">
                          Foto Masuk
                        </div>
                        <div className="mt-1 truncate text-xs font-semibold text-slate-500">
                          {manualPhotoMasuk
                            ? `${manualPhotoMasuk.name} • ${formatUploadFileSize(manualPhotoMasuk.size)}`
                            : 'Pilih foto dari perangkat'}
                        </div>
                      </div>
                    </div>
                  </label>

                  <label className="cursor-pointer rounded-2xl border-2 border-dashed border-orange-200 bg-orange-50/50 p-5 transition-colors hover:border-orange-400 hover:bg-orange-50">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={manualSaving}
                      onChange={(e) =>
                        setManualPhotoPulang(e.target.files?.[0] || null)
                      }
                    />

                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-600 text-white">
                        <UploadCloud className="h-5 w-5" />
                      </div>

                      <div className="min-w-0">
                        <div className="text-xs font-black uppercase tracking-wide text-orange-700">
                          Foto Pulang
                        </div>
                        <div className="mt-1 truncate text-xs font-semibold text-slate-500">
                          {manualPhotoPulang
                            ? `${manualPhotoPulang.name} • ${formatUploadFileSize(manualPhotoPulang.size)}`
                            : 'Pilih foto dari perangkat'}
                        </div>
                      </div>
                    </div>
                  </label>
                </div>

                <div className="rounded-2xl bg-slate-50 p-4 text-[11px] font-semibold leading-5 text-slate-500">
                  Foto Masuk dan Foto Pulang tidak wajib dipilih bersamaan. Anda bisa mengisi salah satu saja. Jam juga opsional; jika data tanggal tersebut sudah ada dan jam dikosongkan, jam lama tetap dipertahankan. Foto otomatis dioptimalkan sebelum dikirim.
                </div>
              </div>

              <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
                <button
                  type="button"
                  onClick={closeManualUpload}
                  disabled={manualSaving}
                  className="cursor-pointer rounded-xl bg-slate-100 px-5 py-3 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Batal
                </button>

                <button
                  type="button"
                  onClick={handleManualUpload}
                  disabled={
                    manualSaving ||
                    !manualGuru ||
                    !manualDate ||
                    (!manualPhotoMasuk && !manualPhotoPulang)
                  }
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 py-3 text-xs font-black text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <UploadCloud className="h-4 w-4" />
                  {manualSaving ? 'Menyimpan...' : 'Simpan Upload Manual'}
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="min-h-screen">
          {/* SIDEBAR ADMIN */}
          <aside className="no-print screen-only overflow-hidden bg-slate-950 text-white shadow-xl shadow-slate-900/10 lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:h-screen lg:w-[280px] lg:flex-col lg:overflow-y-auto lg:border-r lg:border-white/10">
            <div className="border-b border-white/10 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-400 text-slate-950 shadow-lg shadow-amber-400/10">
                  <CalendarCheck className="h-6 w-6" />
                </div>

                <div className="min-w-0">
                  <div className="truncate font-display text-base font-black">
                    Administrator
                  </div>
                  <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    Absensi Guru
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-2xl bg-white/[0.06] px-4 py-3">
                <div className="truncate text-xs font-bold text-white">
                  {user.name}
                </div>
                <div className="mt-1 text-[10px] font-semibold text-slate-400">
                  {SCHOOL_CONFIG.schoolName}
                </div>
              </div>
            </div>

            <div className="p-3 lg:flex-1">
              <div className="px-3 pb-2 pt-1 text-[9px] font-black uppercase tracking-[0.22em] text-slate-500">
                Menu Utama
              </div>

              <nav className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => setActiveView('laporan')}
                  className={`flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3.5 py-3.5 text-left transition-all ${
                    activeView === 'laporan'
                      ? 'bg-white text-slate-950 shadow-sm'
                      : 'text-slate-300 hover:bg-white/[0.07] hover:text-white'
                  }`}
                >
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      activeView === 'laporan'
                        ? 'bg-slate-950 text-white'
                        : 'bg-white/[0.07] text-slate-300'
                    }`}
                  >
                    <FileText className="h-4 w-4" />
                  </div>

                  <div className="min-w-0">
                    <div className="text-xs font-black">
                      Laporan Absensi
                    </div>
                    <div className="mt-0.5 text-[10px] font-semibold text-slate-500">
                      Data harian &amp; foto
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveView('rekap')}
                  className={`flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3.5 py-3.5 text-left transition-all ${
                    activeView === 'rekap'
                      ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/15'
                      : 'text-slate-300 hover:bg-white/[0.07] hover:text-white'
                  }`}
                >
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      activeView === 'rekap'
                        ? 'bg-white/15 text-white'
                        : 'bg-white/[0.07] text-slate-300'
                    }`}
                  >
                    <CalendarCheck className="h-4 w-4" />
                  </div>

                  <div className="min-w-0">
                    <div className="text-xs font-black">
                      Rekap Bulanan
                    </div>
                    <div
                      className={`mt-0.5 text-[10px] font-semibold ${
                        activeView === 'rekap'
                          ? 'text-violet-100'
                          : 'text-slate-500'
                      }`}
                    >
                      Rekap &amp; tanda tangan
                    </div>
                  </div>
                </button>
              </nav>

              <div className="my-4 border-t border-white/10" />

              <div className="px-3 pb-2 text-[9px] font-black uppercase tracking-[0.22em] text-slate-500">
                Aksi Cepat
              </div>

              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => setManualUploadOpen(true)}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3.5 py-3 text-left text-slate-300 transition-all hover:bg-amber-400 hover:text-slate-950"
                >
                  <UploadCloud className="h-4 w-4" />
                  <span className="text-xs font-bold">
                    Upload Manual
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleRefresh}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3.5 py-3 text-left text-slate-300 transition-all hover:bg-white/[0.07] hover:text-white"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span className="text-xs font-bold">
                    Perbarui Data
                  </span>
                </button>
              </div>
            </div>

            <div className="border-t border-white/10 p-3">
              <button
                type="button"
                onClick={onLogout}
                className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3.5 py-3 text-left text-red-300 transition-all hover:bg-red-500/15 hover:text-red-200"
              >
                <LogOut className="h-4 w-4" />
                <span className="text-xs font-bold">
                  Keluar Sesi
                </span>
              </button>
            </div>
          </aside>

          {/* KONTEN UTAMA */}
          <main className="admin-main min-w-0 space-y-5 p-3 pt-5 sm:p-5 lg:ml-[280px] lg:p-7">
            <header className="no-print screen-only flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                  Panel Administrator
                </div>

                <h2 className="mt-1 font-display text-xl font-black text-slate-900 sm:text-2xl">
                  {activeView === 'laporan'
                    ? 'Laporan Absensi'
                    : 'Rekap Bulanan'}
                </h2>

                <p className="mt-1 max-w-2xl font-sans text-xs font-semibold text-slate-400">
                  {activeView === 'laporan'
                    ? 'Kelola data kehadiran, foto masuk/pulang, dan laporan absensi.'
                    : 'Rekapitulasi kehadiran bulanan guru dan pegawai untuk laporan resmi.'}
                </p>
              </div>

              <div className="flex items-center gap-2 self-start rounded-2xl bg-slate-50 px-4 py-3 sm:self-auto">
                <CalendarCheck className="h-4 w-4 text-violet-600" />
                <div className="font-sans text-xs font-black text-slate-700">
                  {selectedMonthLabel} {selectedYear}
                </div>
              </div>
            </header>

        {/* FILTER */}
        <div className="no-print screen-only grid grid-cols-1 gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1.5">
            <label className="block font-sans text-[10px] font-black uppercase tracking-wider text-slate-400">
              Guru / Pegawai
            </label>
            <div className="relative">
              <select
                value={selectedGuru}
                onChange={(e) => setSelectedGuru(e.target.value)}
                className="w-full cursor-pointer appearance-none rounded-2xl border border-slate-200 bg-slate-50/50 p-4 font-sans font-semibold text-slate-700 outline-none transition-all focus:border-emerald-500 focus:bg-white"
              >
                <option value="">Semua Guru &amp; Pegawai</option>
                {staffList.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.name}
                  </option>
                ))}
              </select>
              <Filter className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block font-sans text-[10px] font-black uppercase tracking-wider text-slate-400">
              Bulan
            </label>
            <div className="relative">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full cursor-pointer appearance-none rounded-2xl border border-slate-200 bg-slate-50/50 p-4 font-sans font-semibold text-slate-700 outline-none transition-all focus:border-emerald-500 focus:bg-white"
              >
                {MONTHS.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
              <Filter className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block font-sans text-[10px] font-black uppercase tracking-wider text-slate-400">
              Tahun
            </label>
            <div className="relative">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full cursor-pointer appearance-none rounded-2xl border border-slate-200 bg-slate-50/50 p-4 font-sans font-semibold text-slate-700 outline-none transition-all focus:border-emerald-500 focus:bg-white"
              >
                {availableYears.map((year) => (
                  <option key={year} value={String(year)}>
                    {year}
                  </option>
                ))}
              </select>
              <Filter className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block font-sans text-[10px] font-black uppercase tracking-wider text-slate-400">
              Pencarian
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Nama, NIP/NIK, jabatan..."
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 p-4 pr-11 font-sans font-semibold text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white"
              />
              <Search className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </div>
        </div>

        {/* ACTION */}
        <div className="no-print screen-only flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="font-sans text-xs font-semibold text-slate-500">
            {activeView === 'laporan' ? (
              <>
                <span className="font-black text-slate-900">{groupedRecords.length}</span> guru/pegawai
                <span className="mx-2 text-slate-300">•</span>
                <span className="font-black text-slate-900">{filteredRecords.length}</span> baris absensi
              </>
            ) : (
              <>
                <span className="font-black text-slate-900">{monthlyRecap.length}</span> guru/pegawai
                <span className="mx-2 text-slate-300">•</span>
                Rekap <span className="font-black text-slate-900">{selectedMonthLabel} {selectedYear}</span>
              </>
            )}
          </p>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            {activeView === 'laporan' ? (
              <>
                <button
                  onClick={handleDownloadExcel}
                  disabled={filteredRecords.length === 0}
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 font-sans text-[11px] font-bold text-white transition-all hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Download className="h-4 w-4" />
                  Excel
                </button>

                <button
                  onClick={handleDownloadWord}
                  disabled={filteredRecords.length === 0}
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 font-sans text-[11px] font-bold text-white transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <FileText className="h-4 w-4" />
                  Word
                </button>

                <button
                  onClick={handlePrint}
                  disabled={filteredRecords.length === 0}
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 font-sans text-[11px] font-bold text-white transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Printer className="h-4 w-4" />
                  Cetak
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleDownloadMonthlyRecapWord}
                  disabled={monthlyRecap.length === 0}
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 font-sans text-[11px] font-bold text-white transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <FileText className="h-4 w-4" />
                  Word Rekap
                </button>

                <button
                  onClick={handlePrintMonthlyRecap}
                  disabled={monthlyRecap.length === 0}
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 font-sans text-[11px] font-bold text-white transition-all hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Printer className="h-4 w-4" />
                  Cetak Rekap
                </button>
              </>
            )}
          </div>
        </div>

        {/* REKAP BULANAN */}
        <section
          className={`screen-only overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm ${
            activeView === 'rekap' ? '' : 'hidden'
          }`}
        >
          <div className="border-b border-slate-200 px-5 py-4">
            <h3 className="font-display text-lg font-black text-slate-900">
              Rekap Bulanan
            </h3>
            <p className="mt-1 font-sans text-xs font-semibold text-slate-400">
              Hari kerja Senin–Sabtu • Batas terlambat {BATAS_TERLAMBAT}
            </p>
          </div>

          <div className="mx-4 mt-4 border-b-4 border-double border-slate-900 px-3 pb-4">
            <div className="grid grid-cols-[88px_minmax(0,1fr)_88px] items-center gap-3 sm:grid-cols-[105px_minmax(0,1fr)_105px]">
              <div className="flex items-center justify-center">
                <img
                  src={KOP_LOGO_KABUPATEN}
                  alt="Logo Kabupaten Kupang"
                  className="h-20 w-20 object-contain sm:h-24 sm:w-24"
                />
              </div>

              <div className="text-center font-serif text-slate-950">
                <div className="text-[11px] font-bold leading-tight sm:text-base">
                  {SCHOOL_CONFIG.government}
                </div>
                <div className="mt-1 text-[10px] font-bold leading-tight sm:text-[15px]">
                  {SCHOOL_CONFIG.department}
                </div>
                <div className="mt-1 text-sm font-black leading-tight sm:text-lg">
                  {SCHOOL_CONFIG.schoolName}
                </div>
                <div className="mt-1 text-[9px] font-semibold italic leading-tight sm:text-xs">
                  {SCHOOL_CONFIG.address}
                </div>
              </div>

              <div className="flex items-center justify-center">
                <img
                  src={KOP_LOGO_TUT_WURI}
                  alt="Logo Tut Wuri Handayani"
                  className="h-20 w-20 object-contain sm:h-24 sm:w-24"
                />
              </div>
            </div>
          </div>

          <div className="px-4 pb-3 pt-4 text-center">
            <h4 className="font-serif text-base font-black text-slate-950 sm:text-lg">
              REKAPITULASI ABSENSI GURU DAN PEGAWAI
            </h4>
            <p className="mt-1 font-serif text-xs font-bold uppercase text-slate-700">
              Bulan {selectedMonthLabel} {selectedYear}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1500px] border-collapse font-sans text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-700">
                  <th rowSpan={2} className="border border-slate-200 px-2 py-3">No.</th>
                  <th rowSpan={2} className="border border-slate-200 px-3 py-3">Nama</th>
                  <th rowSpan={2} className="border border-slate-200 px-3 py-3">NIP / NIK</th>
                  <th rowSpan={2} className="border border-slate-200 px-3 py-3">Pangkat/Gol</th>
                  <th rowSpan={2} className="border border-slate-200 px-3 py-3">Jabatan</th>
                  <th rowSpan={2} className="border border-slate-200 px-3 py-3">Status</th>
                  <th rowSpan={2} className="border border-slate-200 px-3 py-3">Jumlah Hari Kerja</th>
                  <th colSpan={6} className="border border-slate-200 px-3 py-2">Keterangan</th>
                  <th rowSpan={2} className="border border-slate-200 px-3 py-3">Jumlah Hari Hadir</th>
                  <th rowSpan={2} className="border border-slate-200 px-3 py-3">Keterangan</th>
                </tr>

                <tr className="bg-slate-50 text-slate-700">
                  <th className="border border-slate-200 px-2 py-2">Tanpa Berita</th>
                  <th className="border border-slate-200 px-2 py-2">Ijin</th>
                  <th className="border border-slate-200 px-2 py-2">Sakit</th>
                  <th className="border border-slate-200 px-2 py-2">Dinas Luar</th>
                  <th className="border border-slate-200 px-2 py-2">Jumlah</th>
                  <th className="border border-slate-200 px-2 py-2">Terlambat</th>
                </tr>
              </thead>

              <tbody>
                {monthlyRecap.map((row, index) => (
                  <tr key={row.id_user} className="text-slate-700">
                    <td className="border border-slate-200 px-2 py-3 text-center">{index + 1}</td>
                    <td className="border border-slate-200 px-3 py-3 font-bold text-slate-900">{row.nama}</td>
                    <td className="border border-slate-200 px-3 py-3 text-center">{row.nipNik}</td>
                    <td className="border border-slate-200 px-3 py-3 text-center">{row.golongan}</td>
                    <td className="border border-slate-200 px-3 py-3">{row.jabatan}</td>
                    <td className="border border-slate-200 px-3 py-3 text-center">{row.statusKepegawaian}</td>
                    <td className="border border-slate-200 px-2 py-3 text-center font-bold">{row.jumlahHariKerja}</td>
                    <td className="border border-slate-200 px-2 py-3 text-center">{row.tanpaBerita}</td>
                    <td className="border border-slate-200 px-2 py-3 text-center">{row.ijin}</td>
                    <td className="border border-slate-200 px-2 py-3 text-center">{row.sakit}</td>
                    <td className="border border-slate-200 px-2 py-3 text-center">{row.dinasLuar}</td>
                    <td className="border border-slate-200 px-2 py-3 text-center font-bold">{row.jumlahTidakHadir}</td>
                    <td className="border border-slate-200 px-2 py-3 text-center">{row.terlambat}</td>
                    <td className="border border-slate-200 px-2 py-3 text-center font-bold text-emerald-700">{row.jumlahHariHadir}</td>
                    <td className="border border-slate-200 px-3 py-3 text-center">{row.keterangan}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end border-t border-slate-200 px-6 py-6 sm:px-10">
            <div className="w-full max-w-[310px] text-center font-serif text-sm text-slate-900">
              <div>Mengetahui,</div>
              <div className="font-semibold">Kepala Sekolah</div>
              <div className="h-20 sm:h-24" />
              <div className="font-bold underline underline-offset-4">
                {KEPALA_SEKOLAH_NAMA}
              </div>
              <div className="mt-1 text-xs font-semibold">
                {KEPALA_SEKOLAH_IDENTITAS}
              </div>
            </div>
          </div>
        </section>

        {/* REPORT */}
        <div
          className={`report-shell overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm ${
            activeView === 'laporan' ? '' : 'hidden'
          }`}
        >
          <div className="border-b border-slate-200 px-5 py-5 text-center sm:px-8">
            <h1 className="font-display text-xl font-black uppercase text-slate-900 print:text-[14pt]">
              Laporan Absensi Guru dan Pegawai
            </h1>
            <p className="mt-1 font-sans text-sm font-bold uppercase text-slate-600 print:text-[10pt]">
              {SCHOOL_CONFIG.schoolName}
            </p>
            <p className="mt-1 font-sans text-xs font-semibold text-slate-500 print:text-[9pt]">
              Bulan {selectedMonthLabel} {selectedYear}
              {selectedGuru
                ? ` • ${staffList.find((staff) => staff.id === selectedGuru)?.name || ''}`
                : ''}
            </p>
            <p className="print-only hidden mt-1 font-sans text-[8pt] text-slate-500">
              Dicetak pada{' '}
              {new Date().toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })}
            </p>
          </div>

          <div className="report-table-wrap overflow-x-auto">
            <table className="report-table w-full min-w-[1450px] border-collapse text-left font-sans">
              <thead className="bg-slate-100 text-slate-700">
                <tr className="text-[10px] font-black uppercase tracking-wide">
                  <th className="report-no-col border border-slate-300 p-3 text-center">No</th>
                  <th className="report-identity-col border border-slate-300 p-3 text-center">
                    Nama / NIP-NIK / Jabatan
                  </th>
                  <th className="report-date-col border border-slate-300 p-3 text-center">Tanggal</th>
                  <th className="report-time-col border border-slate-300 p-3 text-center">Jam</th>
                  <th className="report-status-col border border-slate-300 p-3 text-center">Status</th>
                  <th className="report-note-col border border-slate-300 p-3 text-center">Keterangan</th>
                  <th className="report-photo-col border border-slate-300 p-3 text-center">Foto Masuk</th>
                  <th className="report-photo-col border border-slate-300 p-3 text-center">Foto Pulang</th>
                  <th className="screen-only border border-slate-300 p-3 text-center">Aksi</th>
                </tr>
              </thead>

              <tbody className="text-sm text-slate-700">
                {groupedRecords.length > 0 ? (
                  groupedRecords.flatMap((group, groupIndex) =>
                    group.records.map((record, recordIndex) => {
                      const jam = getJam(record);
                      const isFirstRecord = recordIndex === 0;
                      const identityNumber = group.nip || group.nik || group.id_user || '-';
                      const identityLabel = group.nip ? 'NIP' : group.nik ? 'NIK' : 'ID';

                      return (
                        <tr
                          key={`${group.id_user}-${record.date}-${recordIndex}`}
                          className="align-top transition-colors hover:bg-slate-50"
                        >
                          {isFirstRecord && (
                            <>
                              <td
                                rowSpan={group.records.length}
                                className="border border-slate-300 p-3 text-center align-top font-bold text-slate-700"
                              >
                                {groupIndex + 1}
                              </td>

                              <td
                                rowSpan={group.records.length}
                                className="border border-slate-300 p-4 align-top text-[12px] leading-6 text-slate-800"
                              >
                                <div>
                                  <span className="identity-label inline-block w-[72px] font-bold">Nama</span>
                                  <span className="mr-1">:</span>
                                  <span className="font-semibold">{group.name || '-'}</span>
                                </div>
                                <div>
                                  <span className="identity-label inline-block w-[72px] font-bold">{identityLabel}</span>
                                  <span className="mr-1">:</span>
                                  <span>{identityNumber}</span>
                                </div>
                                <div>
                                  <span className="identity-label inline-block w-[72px] font-bold">Status</span>
                                  <span className="mr-1">:</span>
                                  <span>{group.status_kepegawaian || '-'}</span>
                                </div>
                                <div>
                                  <span className="identity-label inline-block w-[72px] font-bold">Gol.Ruang</span>
                                  <span className="mr-1">:</span>
                                  <span>{group.golongan_ruang || '-'}</span>
                                </div>
                                <div>
                                  <span className="identity-label inline-block w-[72px] font-bold">Jabatan</span>
                                  <span className="mr-1">:</span>
                                  <span>{group.jabatan || '-'}</span>
                                </div>
                              </td>
                            </>
                          )}

                          <td className="border border-slate-300 p-3 text-center align-middle font-mono text-xs font-semibold">
                            {formatDateIndonesia(record.date)}
                          </td>

                          <td className="border border-slate-300 p-3 text-center align-middle font-mono text-xs font-bold">
                            <span className="text-emerald-700">{jam.masuk}</span>
                            <span className="mx-1 text-slate-400">-</span>
                            <span className="text-orange-700">{jam.pulang}</span>
                          </td>

                          <td className="border border-slate-300 p-3 text-center align-middle text-[11px] font-black">
                            {record.status || '-'}
                          </td>

                          <td className="border border-slate-300 p-3 text-center align-middle text-xs">
                            {record.keterangan || '-'}
                          </td>

                          <td className="border border-slate-300 p-2 text-center align-middle">
                            <AttendancePhoto
                              fileId={record.foto_masuk_file_id}
                              alt={`Foto masuk ${record.name} ${record.date}`}
                            />
                          </td>

                          <td className="border border-slate-300 p-2 text-center align-middle">
                            <AttendancePhoto
                              fileId={record.foto_pulang_file_id}
                              alt={`Foto pulang ${record.name} ${record.date}`}
                            />
                          </td>

                          <td className="screen-only border border-slate-300 p-2 text-center align-middle">
                            <button
                              type="button"
                              onClick={() => handleDeleteAttendance(record)}
                              disabled={
                                deletingKey === `${record.id_user}-${record.date}` ||
                                Boolean(deletingKey)
                              }
                              className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-[11px] font-black text-red-600 transition-colors hover:bg-red-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                              title="Hapus data absensi"
                            >
                              <Trash2 className="h-4 w-4" />
                              Hapus
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )
                ) : (
                  <tr>
                    <td colSpan={9} className="p-14 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <FileText className="h-10 w-10 text-slate-300" />
                        <span className="font-medium italic">
                          Tidak ada data absensi pada bulan dan tahun yang dipilih.
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
          </main>
        </div>
      </div>
    </div>
  );
}
