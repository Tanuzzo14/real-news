interface Env {
  WORKER_URL: string;
}

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

// Only forward headers that are safe to proxy to the upstream Worker
const FORWARDED_HEADERS = [
  'accept',
  'accept-language',
  'authorization',
  'cache-control',
  'content-type',
  'x-requested-with',
];

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (!env.WORKER_URL) {
    return new Response(
      JSON.stringify({ error: 'WORKER_URL environment variable is not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (!ALLOWED_METHODS.has(request.method)) {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const url = new URL(request.url);
  let targetUrl: URL;
  try {
    targetUrl = new URL(url.pathname + url.search, env.WORKER_URL);
  } catch (err) {
    console.error('Pages proxy: failed to construct target URL from WORKER_URL:', err);
    return new Response(
      JSON.stringify({ error: 'WORKER_URL is invalid or misconfigured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) {
      headers.set(name, value);
    }
  }

  try {
    // Buffer the body for methods that include a request body to avoid stream issues
    const body = BODY_METHODS.has(request.method) ? await request.arrayBuffer() : undefined;

    return await fetch(targetUrl.toString(), {
      method: request.method,
      headers,
      body,
    });
  } catch (err) {
    console.error('Pages proxy error forwarding to Worker:', err);
    return new Response(
      JSON.stringify({ error: 'Failed to reach the Worker. Please try again later.' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
