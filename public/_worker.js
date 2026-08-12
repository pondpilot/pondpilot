const MANIFEST_URL =
  'https://github.com/pondpilot/quackridge/releases/latest/download/release-manifest.json';

const responseHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
  'Content-Type': 'application/json; charset=utf-8',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'X-Content-Type-Options': 'nosniff',
};

const jsonError = (message, status) =>
  Response.json(
    { error: message },
    {
      status,
      headers: responseHeaders,
    },
  );

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: responseHeaders });
    }

    if (request.method !== 'GET') {
      return jsonError('Method not allowed.', 405);
    }

    let upstream;
    try {
      upstream = await fetch(MANIFEST_URL, {
        headers: { Accept: 'application/json' },
        redirect: 'follow',
        cf: {
          cacheEverything: true,
          cacheTtl: 300,
        },
      });
    } catch (error) {
      console.error('Failed to fetch the QuackRidge release manifest.', error);
      return jsonError('Release manifest is temporarily unavailable.', 502);
    }

    if (!upstream.ok || !upstream.body) {
      console.error('QuackRidge release manifest returned an error.', {
        status: upstream.status,
      });
      return jsonError('Release manifest is temporarily unavailable.', 502);
    }

    return new Response(upstream.body, {
      status: 200,
      headers: responseHeaders,
    });
  },
};
