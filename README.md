# 📰 Real News – Notizie reali, senza rumore

A Progressive Web App (PWA) that aggregates Italian news from trusted sources and transforms them into engaging social-style posts using AI.

## 🏗️ Architecture

| Component | Technology |
|-----------|-----------|
| **Frontend** | Angular 19 (PWA) → Cloudflare Pages |
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

---

## 🚀 Da zero a live su Cloudflare (tutto online, senza installare nulla)

Questa guida spiega come mettere il progetto online partendo da zero, usando solo il browser. Non è necessario installare Node.js, Wrangler o qualsiasi altro strumento in locale.

### Strumenti necessari (tutti online)
- Un account **GitHub** → [github.com](https://github.com)
- Un account **Cloudflare** (gratuito) → [cloudflare.com](https://cloudflare.com)
- Una **Google Gemini API key** → [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

---

### Passo 1 – Fork del repository su GitHub

1. Vai su [github.com/Tanuzzo14/real-news](https://github.com/Tanuzzo14/real-news).
2. Clicca su **Fork** (in alto a destra) per creare una copia nel tuo account GitHub.

---

### Passo 2 – Crea il database D1 su Cloudflare

1. Vai su [dash.cloudflare.com](https://dash.cloudflare.com) e accedi.
2. Dal menu laterale clicca su **Workers & Pages** → **D1 SQL Database**.
3. Clicca **Create database**, inserisci il nome `real-news-db` e clicca **Create**.
4. Una volta creato, apri il database e annota il valore di **Database ID** (ti servirà al passo 4).
5. Clicca sulla scheda **Console** ed esegui la migration iniziale incollando questo SQL:

```sql
CREATE TABLE IF NOT EXISTS news_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  original_url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  content_summary TEXT,
  published_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  day TEXT
);
```

6. Clicca **Execute** per creare la tabella.

---

### Passo 3 – Crea il Cloudflare API Token

1. Vai su [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens).
2. Clicca **Create Token**.
3. Seleziona il template **Edit Cloudflare Workers** oppure crea un token personalizzato con i permessi:
   - `Account → Cloudflare Pages → Edit`
   - `Account → Workers Scripts → Edit`
   - `Account → Workers KV Storage → Edit`
   - `Account → D1 → Edit`
4. Clicca **Continue to summary** → **Create Token**.
5. **Copia il token** e conservalo (viene mostrato una sola volta).
6. Dalla home del dashboard, annota il tuo **Account ID** (visibile in alto a destra nella sidebar).

---

### Passo 4 – Aggiorna `wrangler.toml` con il Database ID

1. Sul tuo fork GitHub, apri il file `worker/wrangler.toml`.
2. Clicca l'icona matita ✏️ per modificarlo direttamente nel browser.
3. Trova la sezione `[[d1_databases]]` e sostituisci il valore di `database_id` con quello ottenuto al passo 2:

```toml
[[d1_databases]]
binding = "DB"
database_name = "real-news-db"
database_id = "INCOLLA_QUI_IL_TUO_DATABASE_ID"
```

4. Clicca **Commit changes** per salvare.

---

### Passo 5 – Aggiungi i secret su GitHub

1. Sul tuo fork GitHub, vai su **Settings** → **Secrets and variables** → **Actions**.
2. Clicca **New repository secret** e aggiungi i seguenti secret uno alla volta:

| Nome secret | Valore |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Il token creato al passo 3 |
| `CLOUDFLARE_ACCOUNT_ID` | Il tuo Account ID di Cloudflare |
| `GEMINI_API_KEY` | La tua Google Gemini API key |

---

### Passo 6 – Avvia il deploy tramite GitHub Actions

1. Sul tuo fork GitHub, vai su **Actions**.
2. Se GitHub Actions non è ancora abilitato, clicca **I understand my workflows, go ahead and enable them**.
3. Vai su **Actions** → seleziona il workflow **Deploy**.
4. Clicca **Run workflow** → **Run workflow** per avviare il primo deploy manuale.

In alternativa, ogni push sul branch `main` attiverà automaticamente il deploy.

Il workflow si occuperà di:
1. Buildare il frontend Angular
2. Deployare il frontend su **Cloudflare Pages**
3. Deployare il Worker su **Cloudflare Workers**
4. Eseguire la migration del database D1 in remoto

---

### Passo 7 – Configura CORS sul Worker

Una volta completato il primo deploy, Cloudflare Pages assegnerà un dominio al frontend (es. `real-news.pages.dev`).

1. Vai su **Workers & Pages** nel dashboard Cloudflare.
2. Apri il Worker `real-news-worker`.
3. Vai su **Settings** → **Variables and Secrets**.
4. Aggiungi una variabile di ambiente:
   - **Key**: `ALLOWED_ORIGIN`
   - **Value**: `https://real-news.pages.dev` (o il tuo dominio personalizzato)
5. Clicca **Save**.

In alternativa, puoi aggiornare `ALLOWED_ORIGIN` direttamente in `worker/wrangler.toml` e fare commit:

```toml
[vars]
ALLOWED_ORIGIN = "https://real-news.pages.dev"
```

---

### ✅ Risultato finale

Dopo questi passi, l'app sarà accessibile all'indirizzo assegnato da Cloudflare Pages (es. `https://real-news.pages.dev`). Il Worker recupererà automaticamente le notizie ogni ora tramite il Cron Trigger.

---

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