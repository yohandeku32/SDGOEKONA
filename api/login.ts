export const runtime = 'nodejs';
import { connect } from '@tidbcloud/serverless';
import { verifyPassword } from './lib/password';

const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || '*')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);

function getCorsHeaders(request: Request) {
  const origin = request.headers.get('Origin') || '';
  const allowAll = ALLOWED_ORIGINS.has('*');
  const allowedOrigin = allowAll
    ? '*'
    : ALLOWED_ORIGINS.has(origin)
      ? origin
      : '';

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  };
}

function json(request: Request, data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: getCorsHeaders(request),
  });
}

export default {
  async fetch(request: Request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(request),
      });
    }

    if (request.method !== 'POST') {
      return json(
        request,
        { status: 'error', message: 'Method tidak didukung.' },
        405
      );
    }

    try {
      const databaseUrl = process.env.DATABASE_URL;

      if (!databaseUrl) {
        return json(
          request,
          {
            status: 'error',
            message: 'DATABASE_URL belum ditemukan di Vercel.',
          },
          500
        );
      }

      let body: any;
      try {
        body = await request.json();
      } catch {
        return json(
          request,
          { status: 'error', message: 'Body request bukan JSON yang valid.' },
          400
        );
      }

      const username = String(body?.username || body?.id || '').trim();
      const password = String(body?.password || '');
      const role = String(body?.role || '').trim().toLowerCase();

      if (!username || !password || !role) {
        return json(
          request,
          {
            status: 'error',
            message: 'Username, password, dan peran wajib diisi.',
          },
          400
        );
      }

      const allowedRoles = new Set(['admin', 'kepsek', 'guru', 'pegawai']);
      if (!allowedRoles.has(role)) {
