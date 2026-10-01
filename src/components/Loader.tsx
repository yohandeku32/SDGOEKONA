import { motion } from 'motion/react';

interface LoaderProps {
  text?: string;
}

export default function Loader({ text = 'Menyiapkan Data...' }: LoaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 w-full h-screen bg-slate-900/40 backdrop-blur-md z-[9999] flex flex-col items-center justify-center gap-4 text-center"
    >
      <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-4 max-w-xs w-full mx-4 border border-slate-100">
        <div className="relative flex items-center justify-center">
          {/* Inner pulse */}
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 animate-ping absolute" />
          {/* Spinning border */}
          <div className="w-12 h-12 border-4 border-slate-100 border-t-emerald-500 rounded-full animate-spin" />
        </div>
        <div>
          <h3 className="font-display font-extrabold text-slate-800 text-lg">Sinkronisasi</h3>
          <p className="text-slate-400 font-sans font-semibold text-[10px] mt-1 uppercase tracking-widest leading-none">
            {text}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
