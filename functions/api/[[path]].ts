interface Env {
  WORKER_URL: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (!env.WORKER_URL) {
    return new Response(
      JSON.stringify({ error: 'WORKER_URL environment variable is not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const url = new URL(request.url);
  const targetUrl = new URL(url.pathname + url.search, env.WORKER_URL);

  return fetch(targetUrl.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
  });
};
