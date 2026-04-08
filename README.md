# 📰 Real News – Notizie reali, senza rumore

A Progressive Web App (PWA) that aggregates Italian news from trusted sources and transforms them into engaging social-style posts using AI.

## 🏗️ Architecture

| Component | Technology |
|-----------|-----------|
| **Frontend** | Angular 17+ (PWA) → Cloudflare Pages |
| **Backend / API** | Cloudflare Workers (TypeScript) |
| **Database** | Cloudflare D1 (SQLite) |
| **AI** | Google Gemini API (gemini-1.5-flash) |
| **Scheduling** | Cloudflare Workers Cron Triggers |

### News Sources
- 🔴 **Il Post** (`ilpost.it/feed/`)
- 🔵 **Valigia Blu** (`valigiablu.it/feed/`)
- 🟢 **Linkiesta** (`linkiesta.it/feed/`)

## 📁 Project Structure

```
real-news/
├── frontend/                 # Angular PWA
│   ├── src/
│   │   ├── app/
│   │   │   ├── components/   # Header, NewsCard, NewsFeed
│   │   │   ├── models/       # TypeScript interfaces
│   │   │   ├── services/     # NewsService (API client)
│   │   │   └── ...
│   │   ├── environments/     # Dev & Prod configs
│   │   └── ...
│   ├── angular.json
│   └── package.json
├── worker/                   # Cloudflare Worker
│   ├── src/
│   │   └── index.ts          # Main Worker logic
│   ├── migrations/
│   │   └── 0001_create_news_posts.sql
│   ├── wrangler.toml
│   └── package.json
└── .github/
    └── workflows/
        └── deploy.yml        # CI/CD pipeline
```

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- npm 10+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npm install -g wrangler`)
- A Cloudflare account
- A Google AI (Gemini) API key

### Frontend Setup

```bash
cd frontend
npm install
npx ng serve
```

The app runs at `http://localhost:4200`.

### Worker Setup

```bash
cd worker
npm install

# Create D1 database
wrangler d1 create real-news-db
# Update wrangler.toml with the returned database_id

# Run local migration
npm run db:migrate:local

# Set your Gemini API key
wrangler secret put GEMINI_API_KEY

# Start local dev server
npm run dev
```

The Worker runs at `http://localhost:8787`.

## 🔌 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/news` | Paginated news feed |
| `GET` | `/api/news?date=2024-05-20` | News by specific date |
| `GET` | `/api/news?source=Il Post` | Filter by source |
| `GET` | `/api/news?page=2&limit=20` | Pagination |
| `GET` | `/api/sources` | Available news sources |
| `GET` | `/api/health` | Health check |

### Response Format

```json
{
  "data": [
    {
      "id": 1,
      "source": "Il Post",
      "original_url": "https://...",
      "title": "...",
      "content_summary": "...",
      "published_at": "2024-05-20T10:00:00Z",
      "created_at": "2024-05-20T10:05:00Z",
      "day": "2024-05-20"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

## 🔐 Security

- **CORS**: Worker only accepts requests from the configured Cloudflare Pages domain.
- **API Keys**: `GEMINI_API_KEY` stored as a Cloudflare Secret (never exposed to frontend).
- **Environment Variables**: Set `ALLOWED_ORIGIN` in `wrangler.toml` for production.

## 🚢 Deployment

### GitHub Secrets Required
- `CLOUDFLARE_API_TOKEN` – Cloudflare API token with Workers & Pages permissions
- `CLOUDFLARE_ACCOUNT_ID` – Your Cloudflare account ID

### CI/CD
Every push to `main` automatically:
1. Builds the Angular frontend
2. Deploys to Cloudflare Pages
3. Deploys the Worker to Cloudflare Workers

### Manual Deploy

```bash
# Frontend
cd frontend
npx ng build --configuration production
npx wrangler pages deploy dist/frontend/browser --project-name=real-news

# Worker
cd worker
npm run deploy

# Database migration (remote)
npm run db:migrate:remote
```

## ⚙️ Cron Trigger

The Worker runs an RSS fetch every hour (`0 * * * *`). It:
1. Fetches RSS feeds from all three sources
2. Filters out already-processed articles (by URL)
3. Cleans HTML content
4. Sends content to Gemini API for social-style transformation
5. Stores the result in D1

## 📱 PWA Features

- **Installable** on mobile and desktop
- **Offline support** via Angular Service Workers (cached news remain readable)
- **Responsive design** optimized for mobile-first reading
- **Infinite scroll** for seamless browsing