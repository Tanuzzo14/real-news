import Parser from 'rss-parser';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Env {
  DB: D1Database;
  GEMINI_API_KEY: string;
  ALLOWED_ORIGIN?: string;
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

const SYSTEM_PROMPT = `Agisci come un Social Media Editor esperto. Il tuo compito è trasformare articoli di giornale in post social brevi, chiari e coinvolgenti.

Regole di Stile:
- Tono: Neutro, asciutto ma moderno. Evita il sensazionalismo.
- Struttura:
  - Un titolo breve in Bold (senza usare #).
  - 3-4 punti elenco (bullet points) che sintetizzano i fatti chiave.
  - Una 'Chiusura' che spieghi perché questa notizia è importante oggi.
- Formattazione: Usa emoji sobrie per i bullet points. Non usare Markdown complesso, solo grassetti per i punti chiave.
- Lunghezza: Massimo 1000 caratteri.
- Output: Restituisci solo il testo del post, senza preamboli come 'Ecco il riassunto'.`;

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
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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
// Gemini Integration
// ---------------------------------------------------------------------------

async function callGemini(
  articleContent: string,
  apiKey: string,
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const prompt = `Trasforma questo articolo in un post social:\n\n${articleContent}`;

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
    feed = await parser.parseURL(source.url);
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

    // Clean content and call Gemini
    // 'content:encoded' is a standard RSS 2.0 extension field for full article content
    const rawContent = item['content:encoded'] || item.content || item.contentSnippet || item.title || '';
    const cleanContent = stripHtml(rawContent);

    if (cleanContent.length < MIN_CONTENT_LENGTH) continue; // Skip very short content

    let summary: string;
    try {
      summary = await callGemini(cleanContent, env.GEMINI_API_KEY);
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

async function fetchAllFeeds(env: Env): Promise<void> {
  console.log('Starting RSS feed fetch...');

  for (const source of FEED_SOURCES) {
    const count = await processFeed(source, env);
    console.log(`${source.name}: ${count} new posts`);
  }

  console.log('Feed fetch complete.');
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
    query = 'SELECT *, DATE(published_at) as day FROM news_posts WHERE DATE(published_at) = ?';
    params.push(date);
  } else {
    query = 'SELECT *, DATE(published_at) as day FROM news_posts WHERE 1=1';
  }

  if (source) {
    query += ' AND source = ?';
    params.push(source);
  }

  // Count total
  const countQuery = query.replace(
    /SELECT .* FROM/,
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
      data: results,
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
