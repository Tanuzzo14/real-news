import Parser from 'rss-parser';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Env {
  DB: D1Database;
  GROQ_API_KEY: string;
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

interface PendingArticle {
  source: string;
  originalUrl: string;
  title: string;
  content: string;
  publishedAt: string;
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
// Max characters of article content sent to Groq per article (keeps token count low)
const MAX_ARTICLE_CONTENT_LENGTH = 1500;
// Max articles per single Groq request (avoids 413 TPM limit errors)
const GROQ_BATCH_SIZE = 5;

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
// Groq Integration (batched)
// ---------------------------------------------------------------------------

/**
 * Send all articles in a single Groq request.
 * Returns one processed post string per input article, in the same order.
 */
async function callGroqBatch(
  articles: PendingArticle[],
  apiKey: string,
): Promise<string[]> {
  const articlesText = articles
    .map(
      (a, i) =>
        `--- ARTICOLO ${i + 1} ---\nFonte: ${a.source}\n\n${a.content}`,
    )
    .join('\n\n');

  const userPrompt =
    `Ti fornirò ${articles.length} articoli. Per ciascuno, crea un post social seguendo le regole del system prompt.\n` +
    `Restituisci SOLO un oggetto JSON con una chiave "articles" contenente un array di ${articles.length} oggetti, uno per ogni articolo, nel formato:\n` +
    `{"articles":[{"index":0,"post":"..."},{"index":1,"post":"..."}]}\n\n` +
    `Articoli:\n\n${articlesText}`;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API error ${response.status}: ${errorText.slice(0, 200)}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  const responseText = data.choices[0]?.message?.content ?? '';
  if (!responseText) {
    throw new Error('Groq API returned an empty response');
  }
  const parsed: { articles?: { index: number; post: string }[] } = JSON.parse(responseText);

  if (!parsed.articles || !Array.isArray(parsed.articles) || parsed.articles.length !== articles.length) {
    throw new Error(
      `Groq batch response length mismatch: expected ${articles.length} items, got ${parsed.articles?.length}`,
    );
  }

  // Sort by index to guarantee correct order, then extract the post text
  return parsed.articles
    .sort((a, b) => a.index - b.index)
    .map((p) => p.post);
}

// ---------------------------------------------------------------------------
// RSS Fetcher (Cron Trigger)
// ---------------------------------------------------------------------------

/** Fetch one RSS feed and return new articles that are not yet in the DB. */
async function collectNewArticles(
  source: FeedSource,
  env: Env,
): Promise<PendingArticle[]> {
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
    return [];
  }

  const pending: PendingArticle[] = [];

  for (const item of feed.items) {
    if (!item.link) continue;

    // Skip articles already stored
    const exists = await env.DB.prepare(
      'SELECT id FROM news_posts WHERE original_url = ?',
    )
      .bind(item.link)
      .first();

    if (exists) continue;

    const rawContent = extractArticleText(item as unknown as Record<string, unknown>);
    const cleanContent = stripHtml(rawContent);

    if (cleanContent.length < MIN_CONTENT_LENGTH) continue;

    pending.push({
      source: source.name,
      originalUrl: item.link,
      title: item.title || '',
      content: cleanContent,
      publishedAt: item.pubDate
        ? new Date(item.pubDate).toISOString()
        : new Date().toISOString(),
    });
  }

  return pending;
}

// ---------------------------------------------------------------------------
// Il Post DOM Scraper
// ---------------------------------------------------------------------------

/**
 * Il Post blocks RSS feed requests with 403 Forbidden.
 * Instead, fetch the homepage and extract articles from the HTML DOM using
 * Cloudflare Workers' built-in HTMLRewriter for robust parsing.
 */
async function collectIlPostArticles(env: Env): Promise<PendingArticle[]> {
  const IL_POST_HOME = 'https://www.ilpost.it/';
  let response: Response;

  try {
    response = await fetch(IL_POST_HOME, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
      },
    });

    if (!response.ok) {
      console.error(
        `[Il Post] Homepage returned HTTP ${response.status} ${response.statusText}`,
      );
      return [];
    }
  } catch (err) {
    console.error('[Il Post] Failed to fetch homepage:', err);
    return [];
  }

  interface ScrapedArticle {
    url: string;
    title: string;
    datetime: string;
    content: string;
  }

  const scraped: ScrapedArticle[] = [];

  // State shared across HTMLRewriter handlers (processed in document order)
  let inArticle = false;
  let current: Partial<ScrapedArticle> = {};
  let titleBuffer = '';
  let inTitle = false;
  let excerptBuffer = '';
  let inExcerpt = false;

  const transformed = new HTMLRewriter()
    .on('article', {
      element(el) {
        inArticle = true;
        current = {};
        titleBuffer = '';
        excerptBuffer = '';
        inTitle = false;
        inExcerpt = false;
        el.onEndTag(() => {
          if (current.url && current.title) {
            scraped.push({
              url: current.url,
              title: current.title,
              datetime: current.datetime || '',
              content: current.content || current.title,
            });
          }
          inArticle = false;
        });
      },
    })
    .on('article h2, article h3', {
      element() {
        inTitle = inArticle && !current.title;
        titleBuffer = '';
      },
      text(chunk) {
        if (inTitle) {
          titleBuffer += chunk.text;
          if (chunk.lastInTextNode) {
            const t = titleBuffer.trim();
            if (t) {
              current.title = t;
            }
            inTitle = false;
          }
        }
      },
    })
    .on('article a[href]', {
      element(el) {
        if (!inArticle || current.url) return;
        const href = el.getAttribute('href') ?? '';
        // Normalise both absolute and root-relative URLs
        const abs = href.startsWith('http')
          ? href
          : `https://www.ilpost.it${href.startsWith('/') ? '' : '/'}${href}`;
        // Only store dated article URLs (e.g. /2024/05/12/slug/)
        if (/https:\/\/www\.ilpost\.it\/\d{4}\/\d{2}\/\d{2}\//.test(abs)) {
          current.url = abs;
        }
      },
    })
    .on('article time[datetime]', {
      element(el) {
        if (inArticle && !current.datetime) {
          current.datetime = el.getAttribute('datetime') ?? '';
        }
      },
    })
    .on('article p', {
      element() {
        inExcerpt = inArticle && !current.content;
        excerptBuffer = '';
      },
      text(chunk) {
        if (inExcerpt) {
          excerptBuffer += chunk.text;
          if (chunk.lastInTextNode) {
            const t = excerptBuffer.trim();
            if (t) {
              current.content = t;
            }
            inExcerpt = false;
          }
        }
      },
    })
    .transform(response);

  // Consume the transformed stream to trigger the handlers above
  await transformed.text();

  console.log(`[Il Post] Found ${scraped.length} article blocks in homepage DOM`);

  const pending: PendingArticle[] = [];

  for (const article of scraped) {
    // Skip articles already stored
    const exists = await env.DB.prepare(
      'SELECT id FROM news_posts WHERE original_url = ?',
    )
      .bind(article.url)
      .first();
    if (exists) continue;

    const content = article.content || article.title;
    if (content.length < MIN_CONTENT_LENGTH) continue;

    let publishedAt: string;
    try {
      publishedAt = article.datetime
        ? new Date(article.datetime).toISOString()
        : new Date().toISOString();
    } catch {
      publishedAt = new Date().toISOString();
    }

    pending.push({
      source: 'Il Post',
      originalUrl: article.url,
      title: article.title,
      content,
      publishedAt,
    });
  }

  return pending;
}

async function fetchAllFeeds(env: Env): Promise<Record<string, number>> {
  const startTime = Date.now();
  const startIso = new Date().toISOString();
  console.log(`[CRON] ===== Feed fetch started at ${startIso} =====`);

  // 1. Collect all new articles from every feed
  const allPending: PendingArticle[] = [];
  for (const source of FEED_SOURCES) {
    // Il Post RSS feed returns 403 — scrape homepage DOM instead
    const articles =
      source.name === 'Il Post'
        ? await collectIlPostArticles(env)
        : await collectNewArticles(source, env);
    console.log(`[CRON] ${source.name}: ${articles.length} new articles to process`);
    allPending.push(...articles);
  }

  if (allPending.length === 0) {
    const duration = Date.now() - startTime;
    console.log(
      `[CRON] No new articles found. Finished at ${new Date().toISOString()} (took ${duration}ms)`,
    );
    return Object.fromEntries(FEED_SOURCES.map((s) => [s.name, 0]));
  }

  // 2. Truncate article content to keep each Groq request within token limits
  const truncated = allPending.map((a) => ({
    ...a,
    content: a.content.length > MAX_ARTICLE_CONTENT_LENGTH
      // Remove any dangling high surrogate left by slice() to avoid encoding issues
      ? a.content.slice(0, MAX_ARTICLE_CONTENT_LENGTH).replace(/[\uD800-\uDBFF]$/, '') + '…'
      : a.content,
  }));

  // 3. Split into chunks and call Groq sequentially to avoid 413 TPM errors
  const summaries: string[] = [];
  for (let i = 0; i < truncated.length; i += GROQ_BATCH_SIZE) {
    const chunk = truncated.slice(i, i + GROQ_BATCH_SIZE);
    console.log(`Processing Groq batch ${Math.floor(i / GROQ_BATCH_SIZE) + 1}: articles ${i + 1}–${i + chunk.length}`);
    try {
      const chunkSummaries = await callGroqBatch(chunk, env.GROQ_API_KEY);
      summaries.push(...chunkSummaries);
    } catch (err) {
      console.error('Groq batch API error:', err);
      // Fill failed chunk with empty strings so indices stay aligned
      summaries.push(...Array(chunk.length).fill(''));
    }
  }

  // 4. Save results to D1
  const counts: Record<string, number> = Object.fromEntries(
    FEED_SOURCES.map((s) => [s.name, 0]),
  );

  for (let i = 0; i < allPending.length; i++) {
    const article = allPending[i];
    const summary = summaries[i];
    if (!summary) {
      console.error(`Missing summary for article index ${i}: "${article.title}"`);
      continue;
    }

    await env.DB.prepare(
      `INSERT INTO news_posts (source, original_url, title, content_summary, published_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(article.source, article.originalUrl, article.title, summary, article.publishedAt)
      .run();

    counts[article.source] = (counts[article.source] || 0) + 1;
  }

  const duration = Date.now() - startTime;
  console.log(
    `[CRON] ===== Feed fetch complete at ${new Date().toISOString()} (took ${duration}ms) =====`,
    counts,
  );
  return counts;
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
