export const runtime = 'nodejs';

const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || '*')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);

function getCorsHeaders(request: Request) {
  const origin = request.headers.get('Origin') || '';

  const allowedOrigin =
    ALLOWED_ORIGINS.has('*')
      ? '*'
      : ALLOWED_ORIGINS.has(origin)
        ? origin
        : '';

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(
  request: Request,
  data: unknown,
  status = 200
) {
  return Response.json(data, {
    status,
    headers: {
      ...getCorsHeaders(request),
      'Cache-Control': 'no-store'
    }
  });
}

async function handleRequest(request: Request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(request)
      });
    }

    if (request.method !== 'POST') {
      return json(
        request,
        {
          status: 'error',
          message: 'Method tidak didukung.'
        },
        405
      );
    }

    try {
      const appsScriptUrl = process.env.APPS_SCRIPT_URL;

      if (!appsScriptUrl) {
        return json(
          request,
          {
            status: 'error',
            message: 'APPS_SCRIPT_URL belum ditemukan di Vercel.'
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
          {
            status: 'error',
            message: 'Body request bukan JSON yang valid.'
          },
          400
        );
      }

      const fileIds = Array.isArray(body?.file_ids)
        ? body.file_ids
            .map((value: unknown) => String(value || '').trim())
            .filter(Boolean)
        : [];

      if (fileIds.length === 0) {
        return json(request, {
          status: 'success',
          photos: []
        });
      }

      if (fileIds.length > 25) {
        return json(
          request,
          {
            status: 'error',
            message: 'Maksimal 25 foto per request.'
          },
          400
        );
      }

      const response = await fetch(appsScriptUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify({
          action: 'get_photos_base64',
          file_ids: fileIds
        })
      });

      const text = await response.text();

      let result: any;

      try {
        result = JSON.parse(text);
      } catch {
        return json(
          request,
          {
            status: 'error',
            message: 'Response Apps Script bukan JSON.'
          },
          502
        );
      }

      if (result.status !== 'success') {
        return json(
          request,
          {
            status: 'error',
            message:
              result.message ||
              'Google Drive gagal mengembalikan foto.'
          },
          502
        );
      }

      return json(request, {
        status: 'success',
        photos: Array.isArray(result.photos)
          ? result.photos
          : []
      });

    } catch (error) {
      console.error('PHOTOS API ERROR:', error);

      return json(
        request,
        {
          status: 'error',
          message:
            error instanceof Error
              ? error.message
              : String(error)
        },
        500
      );
    }
  }
}

export async function POST(request: Request) {
  return handleRequest(request);
}

export async function OPTIONS(request: Request) {
  return handleRequest(request);
}
