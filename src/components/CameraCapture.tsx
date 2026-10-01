import React, { useState, useRef } from 'react';
import { UploadCloud, RefreshCw, Check } from 'lucide-react';
import { AbsenMode } from '../types';

interface CameraCaptureProps {
  mode: AbsenMode;
  onCapture: (base64Photo: string) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  uploadProgress: number;
}

export default function CameraCapture({
  mode,
  onCapture,
  onCancel,
  isSubmitting,
  uploadProgress
}: CameraCaptureProps) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [photoInfo, setPhotoInfo] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const blobToDataUrl = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Gagal membaca hasil kompresi foto.'));
        }
      };

      reader.onerror = () => {
        reject(new Error('Gagal membaca hasil kompresi foto.'));
      };

      reader.readAsDataURL(blob);
    });

  const loadImage = (file: File) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
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
            'Foto tidak dapat dibaca. Gunakan gambar JPEG, PNG, atau WebP.'
          )
        );
      };

      image.src = objectUrl;
    });

  const canvasToBlob = (
    canvas: HTMLCanvasElement,
    quality: number
  ) =>
    new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Gagal mengompres foto.'));
          }
        },
        'image/jpeg',
        quality
      );
    });

  const compressImage = async (file: File) => {
    /*
     * Foto dikompres SEBELUM dikirim ke Vercel.
     * Target dibuat jauh di bawah limit payload Vercel agar aman
     * setelah foto diubah menjadi Base64 dan dibungkus JSON.
     */
    const TARGET_BYTES = 1.8 * 1024 * 1024;
    const MAX_DIMENSION = 1600;

    const image = await loadImage(file);

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

    let quality = 0.82;
    let blob = await canvasToBlob(canvas, quality);

    while (blob.size > TARGET_BYTES && quality > 0.5) {
      quality -= 0.08;
      blob = await canvasToBlob(canvas, quality);
    }

    /*
     * Jika foto masih besar, perkecil resolusi satu tahap lagi.
     */
    if (blob.size > TARGET_BYTES) {
      const reducedCanvas = document.createElement('canvas');
      const reducedScale = 0.75;

      reducedCanvas.width = Math.max(
        1,
        Math.round(canvas.width * reducedScale)
      );

      reducedCanvas.height = Math.max(
        1,
        Math.round(canvas.height * reducedScale)
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

      blob = await canvasToBlob(reducedCanvas, 0.68);
    }

    return blob;
  };

  const processFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('File harus berupa gambar.');
      return;
    }

    setIsProcessingPhoto(true);
    setPhotoInfo('');

    try {
      const compressed = await compressImage(file);
      const dataUrl = await blobToDataUrl(compressed);

      setPhoto(dataUrl);
      setPhotoInfo(
        `${formatSize(file.size)} → ${formatSize(compressed.size)}`
      );
    } catch (error) {
      console.error('PHOTO COMPRESSION ERROR:', error);

      alert(
        error instanceof Error
          ? error.message
          : 'Foto gagal diproses.'
      );

      setPhoto(null);
    } finally {
      setIsProcessingPhoto(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleSubmit = () => {
    if (photo) {
      onCapture(photo);
    }
  };

  const handleResetPhoto = () => {
    setPhoto(null);
    setPhotoInfo('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-800 flex flex-col my-8 transition-colors duration-300">
        
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between transition-colors duration-300">
          <div>
            <h3 className="font-display font-black text-slate-800 dark:text-white text-lg sm:text-xl">
              Unggah Foto Absen {mode}
            </h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 font-medium font-sans">
              Pilih foto bukti kehadiran Anda dari galeri handphone / komputer
            </p>
          </div>
          <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider font-sans ${
            mode === 'MASUK' ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400' : 'bg-orange-100 dark:bg-orange-950/50 text-orange-700 dark:text-orange-400'
          }`}>
            {mode}
          </span>
        </div>

        {/* Capture Body */}
        <div className="p-6 flex-1 flex flex-col justify-center min-h-[280px]">
          {isProcessingPhoto ? (
            <div className="text-center py-12 space-y-5">
              <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-slate-100 dark:border-slate-800 border-t-emerald-500 rounded-full animate-spin" />
              </div>

              <div>
                <h4 className="font-display font-black text-slate-800 dark:text-white text-lg">
                  Menyiapkan Foto...
                </h4>
                <p className="text-slate-400 dark:text-slate-500 font-sans font-medium text-xs mt-1">
                  Foto besar sedang diperkecil agar upload lebih cepat
                </p>
              </div>
            </div>
          ) : isSubmitting ? (
            <div className="text-center py-12 space-y-6">
              <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-emerald-500/15 animate-ping absolute" />
                <div className="w-12 h-12 border-4 border-slate-100 dark:border-slate-800 border-t-emerald-500 rounded-full animate-spin" />
              </div>
              <div>
                <h4 className="font-display font-black text-slate-800 dark:text-white text-lg">Mengirim Absensi...</h4>
                <p className="text-slate-400 dark:text-slate-500 font-sans font-medium text-xs mt-1">Jangan menutup halaman ini</p>
              </div>

              {/* Progress bar */}
              <div className="max-w-xs mx-auto">
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-emerald-600 dark:text-emerald-400 font-mono text-xs font-bold mt-2">
                  {uploadProgress}% Berhasil Diunggah
                </p>
              </div>
            </div>
          ) : photo ? (
            /* PHOTO PREVIEW */
            <div className="space-y-4">
              <div className="relative rounded-2xl overflow-hidden bg-slate-900 border-2 border-emerald-500 aspect-video shadow-lg">
                <img src={photo} alt="Preview Absensi" className="w-full h-full object-cover" />
                <div className="absolute top-4 right-4 bg-emerald-500 text-white p-2 rounded-full shadow-lg">
                  <Check className="w-5 h-5 stroke-[2.5]" />
                </div>
              </div>
              {photoInfo && (
                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 px-4 py-2 text-center">
                  <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 font-sans">
                    Foto dioptimalkan: {photoInfo}
                  </p>
                </div>
              )}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleResetPhoto}
                  className="w-full sm:flex-1 py-4 px-5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-2xl transition-all flex items-center justify-center gap-2 text-xs sm:text-sm font-sans cursor-pointer border-none shadow-sm"
                >
                  <RefreshCw className="w-4 h-4 shrink-0" />
                  <span>Ganti Foto</span>
                </button>
                <button
                  onClick={handleSubmit}
                  className="w-full sm:flex-1 py-4 px-5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2 text-xs sm:text-sm shadow-lg shadow-emerald-500/25 font-sans cursor-pointer border-none"
                >
                  <Check className="w-4 h-4 shrink-0" />
                  <span>Kirim Absen Sekarang</span>
                </button>
              </div>
            </div>
          ) : (
            /* FILE UPLOAD / GALLERY SELECT */
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => {
                if (!isProcessingPhoto) {
                  fileInputRef.current?.click();
                }
              }}
              className={`border-3 border-dashed rounded-3xl p-10 text-center cursor-pointer transition-all duration-300 flex flex-col items-center justify-center gap-4 ${
                dragOver
                  ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 scale-[1.02]'
                  : 'border-slate-200 dark:border-slate-800 hover:border-emerald-400 hover:bg-slate-50/50 dark:hover:bg-slate-800/10'
              }`}
            >
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900 flex items-center justify-center text-emerald-500 shadow-sm">
                <UploadCloud className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h4 className="font-display font-extrabold text-slate-800 dark:text-slate-200 text-sm">
                  Pilih Foto dari Galeri
                </h4>
                <p className="text-xs text-slate-400 dark:text-slate-500 font-sans font-medium max-w-[280px] mx-auto leading-relaxed">
                  Sentuh area ini untuk membuka album foto / galeri handphone Anda. Dukungan format gambar JPEG, PNG, atau WebP.
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          )}
        </div>

        {/* Modal Footer */}
        {!isSubmitting && (
          <div className="p-6 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800 flex justify-end transition-colors duration-300">
            <button
              onClick={onCancel}
              className="px-6 py-3 bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-bold text-xs hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-200 transition-all font-sans cursor-pointer border-none"
            >
              Batalkan
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
