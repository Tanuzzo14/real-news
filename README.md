# 📰 Real News

Una web app che raccoglie notizie da fonti italiane affidabili, le rielabora con AI in formato leggibile "social-style" e le mostra in un feed semplice da usare anche da mobile.

## Per chi è questo progetto

- **Utenti non tecnici**: puoi capire subito cosa fa l'app e come pubblicarla online.
- **Sviluppatori**: trovi stack, architettura, endpoint API, variabili ambiente e workflow di deploy.

---

## Cosa fa (in breve)

1. Recupera periodicamente articoli RSS da:
   - Il Post
   - Valigia Blu
   - Linkiesta
2. Evita duplicati usando l'URL originale come chiave univoca.
3. Pulisce il testo e lo invia a un LLM (Groq) per creare un riassunto strutturato.
4. Salva tutto su Cloudflare D1.
5. Espone API per feed notizie, fonti disponibili e health check.
6. Mostra i contenuti in una PWA Angular con scroll infinito, filtri e supporto offline.

---

## Stack tecnico

| Area | Tecnologie |
|---|---|
| Frontend | Angular 19 + Service Worker (PWA) |
| API/Backend | Cloudflare Workers (TypeScript) |
| Database | Cloudflare D1 (SQLite) |
| AI | Groq API (`llama-3.3-70b-versatile`) |
| Hosting frontend | Cloudflare Pages |
| CI/CD | GitHub Actions |

---

## Architettura

```text
Browser (PWA Angular)
   │
   ├── /api/* su Cloudflare Pages Functions (proxy)
   ▼
Cloudflare Worker (router + cron + AI pipeline)
   │
   ├── D1 (news_posts)
   └── Feed RSS / scraping (Il Post homepage)
```

> In produzione il frontend usa **same-origin** (`apiUrl: ''`) e le richieste API passano da `functions/api/[[path]].ts` verso il Worker tramite variabile `WORKER_URL`.

---

## Struttura repository

```text
real-news/
├── frontend/                 # Angular app (PWA)
├── worker/                   # Cloudflare Worker + migration D1
├── functions/api/[[path]].ts # Proxy Pages -> Worker
└── .github/workflows/        # Build/deploy e manutenzione lockfile
```

---

## Setup locale (sviluppatori)

### Prerequisiti

- Node.js 22+
- npm
- Cloudflare account (per deploy reale)

### 1) Frontend

```bash
cd frontend
npm ci
npm run build
npm test -- --watch=false --browsers=ChromeHeadless
npm start
```

Frontend locale: `http://localhost:4200`

### 2) Worker

```bash
cd worker
npm ci
npm run db:migrate:local
npm run dev
```

Worker locale: `http://localhost:8787`

In sviluppo, il frontend punta già a `http://localhost:8787` (`frontend/src/environments/environment.ts`).

---

## Deploy su Cloudflare (overview)

Il workflow GitHub (`.github/workflows/deploy.yml`) su `main`:

1. builda il frontend Angular,
2. deploya su Cloudflare Pages,
3. deploya il Worker.

### Secret GitHub richiesti

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

### Variabili/secret lato Worker (Cloudflare)

- `GROQ_API_KEY` (obbligatoria)
- `ALLOWED_ORIGIN` (consigliata per CORS)
- `ADMIN_SECRET` (opzionale, per endpoint admin)

### Variabile lato Pages Functions

- `WORKER_URL` (URL base del Worker da usare come upstream del proxy)

---

## Database

Migration: `worker/migrations/0001_create_news_posts.sql`

Tabella principale: `news_posts`
- `source`
- `original_url` (unique)
- `title`
- `content_summary`
- `published_at`
- `created_at`

---

## API

Base path: `/api`

| Metodo | Endpoint | Descrizione |
|---|---|---|
| GET | `/api/news` | Feed paginato |
| GET | `/api/news?source=Il%20Post` | Filtro per fonte |
| GET | `/api/news?date=YYYY-MM-DD` | Filtro per data |
| GET | `/api/news?page=2&limit=20` | Paginazione |
| GET | `/api/sources` | Fonti disponibili |
| GET | `/api/health` | Health check |
| POST | `/api/admin/refresh` | Forza refresh feed (Bearer token) |

### Esempio risposta `/api/news`

```json
{
  "data": [
    {
      "id": 1,
      "source": "Il Post",
      "original_url": "https://...",
      "title": "...",
      "content_summary": "...",
      "published_at": "2026-04-20T10:00:00.000Z",
      "created_at": "2026-04-20T10:05:00.000Z",
      "period_label": "Oggi"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 120,
    "totalPages": 6
  }
}
```

---

## Sicurezza

- CORS gestito dal Worker (`ALLOWED_ORIGIN`).
- Chiavi AI non esposte al frontend (secret lato Cloudflare).
- Endpoint admin protetto da `Authorization: Bearer <ADMIN_SECRET>`.
- Proxy Pages inoltra solo header consentiti verso il Worker.

---

## Automazioni

- **Cron Worker**: ogni ora (`0 * * * *`) esegue il fetch/elaborazione delle notizie.
- **Workflow lockfile**: aggiornamento settimanale automatico dei `package-lock.json`.

---

## Stato del progetto

Repository pronta per uso pubblico: documentazione allineata al codice attuale, setup locale, deploy cloud e riferimenti API inclusi.
