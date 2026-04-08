import Parser from 'rss-parser';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Env {
  DB: D1Database;
  GEMINI_API_KEY: string;
  ALLOWED_ORIGIN?: string;
  ADMIN_SECRET?: string;
}

interface NewsPost {
  id: number;
  source: string;
  original_url: string;
  title: string;
  content_summary: string;
  published_at: string;
  created_at: string;
}

interface FeedSource {
  name: string;
  url: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FEED_SOURCES: FeedSource[] = [
  { name: 'Il Post', url: 'https://www.ilpost.it/feed/' },
  { name: 'Valigia Blu', url: 'https://www.valigiablu.it/feed/' },
  { name: 'Linkiesta', url: 'https://www.linkiesta.it/feed/' },
];

const SYSTEM_PROMPT = `Sei un assistente editoriale. Riceverai un testo proveniente da una di queste tre testate: Il Post (spiegazioni chiare), Valigia Blu (approfondimenti basati su dati), Linkiesta (analisi politica/culturale).

Il tuo obiettivo: Crea un post per una PWA mobile.

Analizza la fonte:
- Se la fonte è 'Il Post', sii estremamente didascalico.
- Se è 'Valigia Blu', evidenzia il contesto sociale.
- Se è 'Linkiesta', focalizzati sull'opinione e l'analisi.

Formato:
- Titolo: 💡 [Titolo breve]
- Corpo: Max 3 paragrafi da 2 righe l'uno.
- Focus: 'Cosa devi sapere' (bullet points).

Regole di Stile:
- Tono: Neutro, asciutto ma moderno. Evita il sensazionalismo.
- Formattazione: Usa emoji sobrie per i bullet points. Non usare Markdown complesso, solo grassetti per i punti chiave.
- Lunghezza: Massimo 1000 caratteri.
- Output: Restituisci solo il testo del post, senza preamboli come 'Ecco il riassunto'.

Regola d'oro: Non inventare mai fatti non presenti nel testo fornito.`;

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const MIN_CONTENT_LENGTH = 50;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip HTML tags from a string */
function stripHtml(html: string): string {
  // Use a loop to fully remove nested/recursive HTML tags
  let text = html;
  let previous: string;
  do {
    previous = text;
    text = text.replace(/<[^>]*>/g, '');
  } while (text !== previous);

  // Decode common HTML entities
  const entities: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'",
  };
  for (const [entity, char] of Object.entries(entities)) {
    text = text.split(entity).join(char);
  }

  return text.replace(/\s+/g, ' ').trim();
}

/** Build CORS headers */
function corsHeaders(env: Env): Record<string, string> {
  const origin = env.ALLOWED_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

/** JSON response helper */
function jsonResponse(
  data: unknown,
  env: Env,
  status = 200,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(env),
    },
  });
}

// ---------------------------------------------------------------------------
// Content Extraction
// ---------------------------------------------------------------------------

/** Extract the best available text from an RSS feed item */
function extractArticleText(item: Record<string, unknown>): string {
  // 1. Prefer 'content:encoded' (RSS 2.0 extension field for full article HTML).
  //    Valigia Blu typically provides the entire article in this field.
  if (item['content:encoded']) return String(item['content:encoded']);

  // 2. Il Post and Linkiesta often use contentSnippet or description
  if (item['contentSnippet']) return String(item['contentSnippet']);
  if (item['content']) return String(item['content']);

  // 3. Fallback: title only
  return String(item['title'] ?? '');
}

// ---------------------------------------------------------------------------
// Gemini Integration
// ---------------------------------------------------------------------------

async function callGemini(
  articleContent: string,
  sourceName: string,
  apiKey: string,
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const prompt = `Fonte: ${sourceName}\n\nTrasforma questo articolo in un post social:\n\n${articleContent}`;

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    systemInstruction: { role: 'system', parts: [{ text: SYSTEM_PROMPT }] },
  });

  const response = result.response;
  return response.text();
}

// ---------------------------------------------------------------------------
// RSS Fetcher (Cron Trigger)
// ---------------------------------------------------------------------------

async function processFeed(source: FeedSource, env: Env): Promise<number> {
  const parser = new Parser();
  let feed;

  try {
    const response = await fetch(source.url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    const xml = await response.text();
    feed = await parser.parseString(xml);
  } catch (err) {
    console.error(`Failed to fetch feed from ${source.name}:`, err);
    return 0;
  }

  let newPosts = 0;

  for (const item of feed.items) {
    if (!item.link) continue;

    // Check if article already exists
    const exists = await env.DB.prepare(
      'SELECT id FROM news_posts WHERE original_url = ?',
    )
      .bind(item.link)
      .first();

    if (exists) continue;

    // Extract best available content using dynamic extraction
    const rawContent = extractArticleText(item as unknown as Record<string, unknown>);
    const cleanContent = stripHtml(rawContent);

    if (cleanContent.length < MIN_CONTENT_LENGTH) continue; // Skip very short content

    let summary: string;
    try {
      summary = await callGemini(cleanContent, source.name, env.GEMINI_API_KEY);
    } catch (err) {
      console.error(`Gemini API error for "${item.title}":`, err);
      continue;
    }

    // Save to D1
    const publishedAt = item.pubDate
      ? new Date(item.pubDate).toISOString()
      : new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO news_posts (source, original_url, title, content_summary, published_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(source.name, item.link, item.title || '', summary, publishedAt)
      .run();

    newPosts++;
  }

  return newPosts;
}

async function fetchAllFeeds(env: Env): Promise<Record<string, number>> {
  console.log('Starting RSS feed fetch...');

  const results: Record<string, number> = {};
  for (const source of FEED_SOURCES) {
    const count = await processFeed(source, env);
    results[source.name] = count;
    console.log(`${source.name}: ${count} new posts`);
  }

  console.log('Feed fetch complete.');
  return results;
}

// ---------------------------------------------------------------------------
// API Handler
// ---------------------------------------------------------------------------

async function handleApiNews(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const date = url.searchParams.get('date');
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(url.searchParams.get('limit') || String(DEFAULT_PAGE_SIZE), 10)),
  );
  const offset = (page - 1) * pageSize;
  const source = url.searchParams.get('source');

  let query: string;
  const params: (string | number)[] = [];

  if (date) {
    query = `SELECT *,
      CASE
        WHEN date(published_at) = date('now') THEN 'Oggi'
        WHEN date(published_at) = date('now', '-1 day') THEN 'Ieri'
        ELSE strftime('%d/%m/%Y', published_at)
      END as period_label
    FROM news_posts WHERE DATE(published_at) = ?`;
    params.push(date);
  } else {
    query = `SELECT *,
      CASE
        WHEN date(published_at) = date('now') THEN 'Oggi'
        WHEN date(published_at) = date('now', '-1 day') THEN 'Ieri'
        ELSE strftime('%d/%m/%Y', published_at)
      END as period_label
    FROM news_posts WHERE 1=1`;
  }

  if (source) {
    query += ' AND source = ?';
    params.push(source);
  }

  // Count total — use [\s\S]*? to match across newlines in the
  // multi-line CASE/period_label SELECT clause.
  const countQuery = query.replace(
    /SELECT[\s\S]*?FROM/,
    'SELECT COUNT(*) as total FROM',
  );
  const countStmt = env.DB.prepare(countQuery);
  const countResult = await (params.length > 0
    ? countStmt.bind(...params)
    : countStmt
  ).first<{ total: number }>();
  const total = countResult?.total || 0;

  // Fetch page
  query += ' ORDER BY published_at DESC LIMIT ? OFFSET ?';
  params.push(pageSize, offset);

  const stmt = env.DB.prepare(query);
  const { results } = await (params.length > 0
    ? stmt.bind(...params)
    : stmt
  ).all<NewsPost>();

  return jsonResponse(
    {
      data: results ?? [],
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    },
    env,
  );
}

async function handleApiSources(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    'SELECT DISTINCT source FROM news_posts ORDER BY source',
  ).all<{ source: string }>();

  return jsonResponse(
    { data: results?.map((r) => r.source) || [] },
    env,
  );
}

async function handleAdminRefresh(request: Request, env: Env): Promise<Response> {
  // Require a Bearer token matching ADMIN_SECRET
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!env.ADMIN_SECRET || token !== env.ADMIN_SECRET) {
    return jsonResponse({ error: 'Unauthorized' }, env, 401);
  }

  const newPosts = await fetchAllFeeds(env);
  const total = Object.values(newPosts).reduce((sum, n) => sum + n, 0);

  return jsonResponse(
    { ok: true, newPosts, total },
    env,
  );
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

async function handleRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(env) });
  }

  const url = new URL(request.url);
  const path = url.pathname;

  // Admin endpoint — POST only, authenticated
  if (path === '/api/admin/refresh') {
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, env, 405);
    }
    return handleAdminRefresh(request, env);
  }

  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, env, 405);
  }

  if (path === '/api/news') {
    return handleApiNews(request, env);
  }

  if (path === '/api/sources') {
    return handleApiSources(env);
  }

  // Health check
  if (path === '/api/health') {
    return jsonResponse({ status: 'ok', timestamp: new Date().toISOString() }, env);
  }

  return jsonResponse({ error: 'Not found' }, env, 404);
}

// ---------------------------------------------------------------------------
// Worker Export
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (err) {
      console.error('Unhandled error:', err);
      return jsonResponse(
        { error: 'Internal server error' },
        env,
        500,
      );
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(fetchAllFeeds(env));
  },
};
