import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    /*
     * Gunakan path relatif agar build tetap aman saat transisi:
     * - https://yohandeku32.github.io/<repo-oekona>/
     * - https://<custom-domain-oekona>/
     *
     * Setelah custom domain aktif, asset tetap dimuat dengan benar.
     */
    base: './',

    plugins: [
      react(),
      tailwindcss(),
    ],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },

    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
