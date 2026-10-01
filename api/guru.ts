import { connect } from '@tidbcloud/serverless';

const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || '*')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);

function getCorsHeaders(request: Request) {
  const origin = request.headers.get('Origin') || '';

  const allowedOrigin = ALLOWED_ORIGINS.has(origin)
    ? origin
    : ALLOWED_ORIGINS.has('*')
      ? '*'
      : '';

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(
  request: Request,
  data: unknown,
  status = 200
) {
  return Response.json(data, {
    status,
    headers: getCorsHeaders(request),
  });
}

async function handleRequest(request: Request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(request),
      });
    }

    if (request.method !== 'GET') {
      return json(
        request,
        {
          status: 'error',
          message: 'Method tidak didukung.',
        },
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
            message: 'DATABASE_URL belum ditemukan',
          },
          500
        );
      }

      const conn = connect({
        url: databaseUrl,
      });

      const guru = await conn.execute(`
        SELECT
          id_user,
          nama,
          nip,
          nik,
          status_kepegawaian,
          pangkat,
          golongan_ruang,
          jabatan,
          role,
          aktif
        FROM guru
        WHERE aktif = 1
        ORDER BY nama ASC
      `);

      return json(request, {
        status: 'success',
        total: guru.length,
        data: guru,
      });

    } catch (error) {
      console.error('GURU API ERROR:', error);

      return json(
        request,
        {
          status: 'error',
          message:
            error instanceof Error
              ? error.message
              : String(error),
        },
        500
      );
    }
  }

export async function GET(request: Request) {
  return handleRequest(request);
}

export async function OPTIONS(request: Request) {
  return handleRequest(request);
}
