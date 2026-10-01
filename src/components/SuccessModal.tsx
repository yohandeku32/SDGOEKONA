import { motion } from 'motion/react';
import { CheckCircle } from 'lucide-react';

interface SuccessModalProps {
  onClose: () => void;
  message?: string;
}

export default function SuccessModal({ onClose, message = 'Data absensi Anda telah disimpan.' }: SuccessModalProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        className="bg-white w-full max-w-sm p-8 rounded-[2.5rem] shadow-2xl text-center border border-slate-100"
      >
        <div className="w-20 h-20 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-500/30">
          <CheckCircle className="w-10 h-10 stroke-[2.5]" />
        </div>
        <h3 className="font-display font-black text-slate-900 text-2xl">Berhasil!</h3>
        <p className="text-slate-500 mt-2 text-sm leading-relaxed font-sans font-medium">
          {message}
        </p>
        <button
          onClick={onClose}
          className="w-full mt-6 py-4 bg-emerald-500 text-white font-bold rounded-2xl hover:bg-emerald-600 active:scale-95 transition-all shadow-lg shadow-emerald-500/20 font-sans"
        >
          Selesai & Muat Ulang
        </button>
      </motion.div>
    </div>
  );
}
