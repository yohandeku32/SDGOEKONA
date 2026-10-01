import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Eye,
  EyeOff,
  ScanFace,
  UserCheck,
  ChevronDown
} from 'lucide-react';
import { User, UserRole } from '../types';
import { API_BASE_URL, SCHOOL_CONFIG } from '../schoolConfig';

interface LoginViewProps {
  onLoginSuccess: (user: User) => void;
}

type LoginPerson = {
  id_user: string;
  nama: string;
  role: UserRole | string;
};

export default function LoginView({
  onLoginSuccess
}: LoginViewProps) {
  const [role, setRole] =
    useState<UserRole>('guru');

  const [people, setPeople] =
    useState<LoginPerson[]>([]);

  const [selectedUserId, setSelectedUserId] =
    useState('');

  const [password, setPassword] =
    useState('');

  const [showPassword, setShowPassword] =
    useState(false);

  const [isLoading, setIsLoading] =
    useState(false);

  const [isLoadingPeople, setIsLoadingPeople] =
    useState(false);

  const [peopleError, setPeopleError] =
    useState('');

  const [error, setError] =
    useState('');

  const isNamedRole =
    role === 'guru' ||
    role === 'kepsek' ||
    role === 'pegawai';

  useEffect(() => {
    let cancelled = false;

    const loadPeople = async () => {
      if (!isNamedRole) {
        setPeople([]);
        setSelectedUserId('');
        setPeopleError('');
        return;
      }

      if (
        !API_BASE_URL ||
        API_BASE_URL.includes('REPLACE-OEKONA')
      ) {
        setPeople([]);
        setSelectedUserId('');
        setPeopleError(
          'API sekolah belum dikonfigurasi di Vercel.'
        );
        return;
      }

      setIsLoadingPeople(true);
      setPeopleError('');
      setSelectedUserId('');

      try {
        const response =
          await fetch(
            `${API_BASE_URL}/api/guru?t=${Date.now()}`,
            {
              method: 'GET',
              cache: 'no-store'
            }
          );

        const contentType =
          response.headers.get(
            'content-type'
          ) || '';

        let result: any = null;
        let rawText = '';

        if (
          contentType.includes(
            'application/json'
          )
        ) {
          result =
            await response.json();
        } else {
          rawText =
            await response.text();
        }

        if (
          !response.ok ||
          result?.status !==
            'success'
        ) {
          throw new Error(
            result?.message ||
              rawText ||
              `Gagal mengambil daftar nama (${response.status}).`
          );
        }

        const rows =
          Array.isArray(result?.data)
            ? result.data
            : [];

        const filtered =
          rows
            .filter(
              (item: any) =>
                String(
                  item?.role || ''
                ).toLowerCase() ===
                role &&
                String(
                  item?.id_user || ''
                ).trim() &&
                String(
                  item?.nama || ''
                ).trim()
            )
            .map(
              (item: any) => ({
                id_user:
                  String(
                    item.id_user
                  ).trim(),
                nama:
                  String(
                    item.nama
                  ).trim(),
                role:
                  String(
                    item.role
                  ).toLowerCase()
              })
            )
            .sort(
              (a: LoginPerson, b: LoginPerson) =>
                a.nama.localeCompare(
                  b.nama,
                  'id'
                )
            );

        if (!cancelled) {
          setPeople(filtered);

          if (filtered.length === 0) {
            setPeopleError(
              role === 'guru'
                ? 'Belum ada data guru aktif.'
                : role === 'kepsek'
                  ? 'Belum ada data kepala sekolah aktif.'
                  : 'Belum ada data pegawai aktif.'
            );
          }
        }
      } catch (err) {
        console.error(
          'Load login people error:',
          err
        );

        if (!cancelled) {
          setPeople([]);
          setPeopleError(
            err instanceof Error
              ? err.message
              : 'Gagal mengambil daftar nama.'
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingPeople(false);
        }
      }
    };

    void loadPeople();

    return () => {
      cancelled = true;
    };
  }, [role, isNamedRole]);

  const handleSubmit = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();
    setError('');

    if (!API_BASE_URL ||
        API_BASE_URL.includes(
          'REPLACE-OEKONA'
        )) {
      setError(
        'API sekolah belum dikonfigurasi di Vercel.'
      );
      return;
    }

    if (
      isNamedRole &&
      !selectedUserId
    ) {
      setError(
        'Silakan pilih nama terlebih dahulu.'
      );
      return;
    }

    if (!password) {
      setError(
        'Silakan masukkan password.'
      );
      return;
    }

    setIsLoading(true);

    try {
      const response =
        await fetch(
          `${API_BASE_URL}/api/login`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            cache: 'no-store',
            body: JSON.stringify({
              username:
                selectedUserId,
              password,
              role
            })
          }
        );

      const contentType =
        response.headers.get(
          'content-type'
        ) || '';

      let result: any = null;
      let rawText = '';

      if (
        contentType.includes(
          'application/json'
        )
      ) {
        result =
          await response.json();
      } else {
        rawText =
          await response.text();
      }

      if (
        !response.ok ||
        result?.status !==
          'success' ||
        !result?.user
      ) {
        throw new Error(
          result?.message ||
            rawText ||
            `Login gagal (${response.status}).`
        );
      }

      onLoginSuccess(
        result.user as User
      );
    } catch (err) {
      console.error(
        'Login error:',
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Login gagal. Periksa koneksi internet dan data login Anda.'
      );
      setIsLoading(false);
    }
  };

  const roleLabel =
    role === 'guru'
      ? 'Guru'
      : role === 'kepsek'
        ? 'Kepala Sekolah'
        : role === 'pegawai'
          ? 'Pegawai / TU'
          : 'Administrator';

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-blue-50">
      <div className="w-full max-w-md bg-white p-8 sm:p-10 rounded-[2.5rem] shadow-2xl border border-slate-100 text-center relative overflow-hidden">

        <div className="absolute top-0 left-0 w-32 h-32 bg-sky-500/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-32 h-32 bg-sky-500/10 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />

        <div className="w-20 h-20 bg-blue-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-xl shadow-blue-600/25 relative">
          <ScanFace className="w-10 h-10 text-white" />
        </div>

        <h1 className="text-2xl sm:text-3xl font-display font-black text-slate-900 leading-tight">
          {SCHOOL_CONFIG.schoolName}
        </h1>

        <p className="text-slate-400 mt-2 mb-8 uppercase tracking-widest text-[10px] sm:text-xs font-bold font-sans">
          Sistem Absensi Foto &amp; Laporan
        </p>

        <form
          onSubmit={handleSubmit}
          className="space-y-5 text-left"
        >

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 font-sans">
              Pilih Peran Anda
            </label>

            <div className="relative">
              <select
                value={role}
                onChange={(e) =>
                  setRole(
                    e.target.value as UserRole
                  )
                }
                className="w-full px-5 py-4 pr-12 bg-blue-50/50 border border-slate-200 rounded-2xl outline-none font-sans font-medium text-slate-700 focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-600/10 transition-all appearance-none cursor-pointer"
              >
                <option value="guru">
                  🧑‍🏫 Guru Kelas / Mapel
                </option>

                <option value="kepsek">
                  💼 Kepala Sekolah
                </option>

                <option value="pegawai">
                  ⚙️ Pegawai / TU
                </option>

                <option value="admin">
                  🔒 Administrator
                </option>
              </select>

              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-5 text-slate-400">
                <UserCheck className="w-4 h-4" />
              </div>
            </div>
          </div>

          {isNamedRole ? (
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 font-sans">
                Pilih Nama {roleLabel}
              </label>

              <div className="relative">
                <select
                  value={selectedUserId}
                  onChange={(e) =>
                    setSelectedUserId(
                      e.target.value
                    )
                  }
                  disabled={
                    isLoadingPeople ||
                    people.length === 0
                  }
                  className="w-full px-5 py-4 pr-12 bg-blue-50/50 border border-slate-200 rounded-2xl outline-none font-sans font-medium text-slate-700 focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-600/10 transition-all appearance-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <option value="">
                    {isLoadingPeople
                      ? 'Memuat daftar nama...'
                      : `Pilih nama ${roleLabel.toLowerCase()}`}
                  </option>

                  {people.map(
                    (person) => (
                      <option
                        key={
                          person.id_user
                        }
                        value={
                          person.id_user
                        }
                      >
                        {person.nama}
                      </option>
                    )
                  )}
                </select>

                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-5 text-slate-400">
                  <ChevronDown className="w-4 h-4" />
                </div>
              </div>

              {peopleError && (
                <p className="mt-2 text-[10px] text-amber-600 font-semibold font-sans">
                  {peopleError}
                </p>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 font-sans">
                Username Administrator
              </label>

              <input
                type="text"
                value={selectedUserId}
                onChange={(e) =>
                  setSelectedUserId(
                    e.target.value
                  )
                }
                autoComplete="username"
                placeholder="Masukkan username administrator"
                className="w-full px-5 py-4 bg-blue-50/50 border border-slate-200 rounded-2xl outline-none font-sans font-medium placeholder-slate-400 focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-600/10 transition-all"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 font-sans">
              Password
            </label>

            <div className="relative">
              <input
                type={
                  showPassword
                    ? 'text'
                    : 'password'
                }
                value={password}
                onChange={(e) =>
                  setPassword(
                    e.target.value
                  )
                }
                autoComplete="current-password"
                placeholder="Masukkan password"
                className="w-full px-5 py-4 pr-14 bg-blue-50/50 border border-slate-200 rounded-2xl outline-none font-sans font-medium placeholder-slate-400 focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-600/10 transition-all"
              />

              <button
                type="button"
                onClick={() =>
                  setShowPassword(
                    (value) =>
                      !value
                  )
                }
                aria-label={
                  showPassword
                    ? 'Sembunyikan password'
                    : 'Tampilkan password'
                }
                className="absolute inset-y-0 right-0 px-5 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-50 rounded-2xl border border-red-100 flex items-start gap-3 text-red-600 text-xs font-sans font-medium">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={
              isLoading ||
              (isNamedRole &&
                (isLoadingPeople ||
                  !selectedUserId))
            }
            className="w-full py-4.5 bg-blue-600 text-white font-bold rounded-2xl shadow-lg shadow-blue-600/20 hover:bg-blue-700 hover:shadow-blue-600/35 active:scale-98 disabled:opacity-50 transition-all duration-300 flex items-center justify-center gap-2 font-sans text-sm cursor-pointer"
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Memverifikasi...</span>
              </>
            ) : (
              <span>Masuk Sistem</span>
            )}
          </button>
        </form>

        <div className="mt-8 text-[11px] text-slate-400 font-semibold uppercase tracking-wider font-sans">
          &copy; {SCHOOL_CONFIG.schoolName} • 2026
        </div>
      </div>
    </div>
  );
}
