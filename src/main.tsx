import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Elemen dengan ID root tidak ditemukan.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Daftarkan Service Worker hanya pada production.
// Service Worker membantu SDGOEKONA berperilaku lebih seperti aplikasi
// dan menyediakan fallback cache untuk shell aplikasi saat koneksi bermasalah.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const serviceWorkerUrl = new URL('sw.js', document.baseURI);

    navigator.serviceWorker
      .register(serviceWorkerUrl, { scope: './' })
      .then((registration) => {
        console.info('SDGOEKONA PWA service worker aktif.', registration.scope);
      })
      .catch((error) => {
        console.warn('Service worker SDGOEKONA gagal didaftarkan:', error);
      });
  });
}
