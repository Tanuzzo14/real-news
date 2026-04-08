# 🚀 Guida For Dummies – Da Zero a Live con Cloudflare

Questa guida ti porta **da zero** (account mai creato, repo mai clonato) a un'app **live su Cloudflare** in meno di 30 minuti.

---

## 📋 Cosa ti serve (prerequisites)

Prima di iniziare, assicurati di avere:

| Cosa | Dove ottenerlo | Gratis? |
|------|----------------|---------|
| **Account Cloudflare** | [cloudflare.com](https://cloudflare.com) | ✅ Sì |
| **Account GitHub** | [github.com](https://github.com) | ✅ Sì |
| **Google AI API Key** (Gemini) | [aistudio.google.com](https://aistudio.google.com) | ✅ Sì (con limiti) |
| **Node.js 20+** | [nodejs.org](https://nodejs.org) | ✅ Sì |
| **Git** | [git-scm.com](https://git-scm.com) | ✅ Sì |

> 💡 **Tip**: Per verificare che Node.js e Git siano installati, apri il terminale e scrivi:
> ```bash
> node --version   # deve mostrare v20 o superiore
> git --version
> ```

---

## 🗺️ Mappa del viaggio

```
[Tu] → [Clone repo] → [Crea DB su Cloudflare] → [Deploy Worker] → [Deploy Frontend] → [🎉 Live!]
```

---

## STEP 1 – Installa Wrangler (la CLI di Cloudflare)

Wrangler è lo strumento a riga di comando per gestire tutto su Cloudflare.

```bash
npm install -g wrangler
```

Poi fai il login al tuo account Cloudflare:

```bash
wrangler login
```

Si aprirà il browser: clicca **Allow** per autorizzare l'accesso. Fatto!

---

## STEP 2 – Clona il repository

```bash
git clone https://github.com/Tanuzzo14/real-news.git
cd real-news
```

La struttura del progetto è questa:

```
real-news/
├── frontend/    ← App Angular (quello che vede l'utente)
└── worker/      ← Backend Cloudflare (API + logica + cron)
```

---

## STEP 3 – Crea il database D1 su Cloudflare

D1 è il database SQLite **gratuito** di Cloudflare, che vive direttamente sul loro edge network.

```bash
cd worker
npm install

wrangler d1 create real-news-db
```

Il comando restituirà un output simile a questo:

```
✅ Successfully created DB 'real-news-db'
{
  "uuid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",   ← QUESTO è il tuo database_id
  "name": "real-news-db"
}
```

**Copia il valore `uuid`** e aprilo in `worker/wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "real-news-db"
database_id = "INCOLLA_QUI_IL_TUO_UUID"   ← sostituisci questa riga
```

---

## STEP 4 – Esegui la migrazione del database

Questo comando crea la tabella nel database **remoto** (quello vero su Cloudflare):

```bash
npm run db:migrate:remote
```

> 💡 Se vuoi anche testare in locale prima, usa: `npm run db:migrate:local`

---

## STEP 5 – Aggiungi la API Key di Gemini come Secret

La chiave Gemini **non va mai scritta nel codice**. Cloudflare ha un sistema sicuro di "secrets":

```bash
wrangler secret put GEMINI_API_KEY
```

Ti verrà chiesto di incollare la chiave. Ottienila da [aistudio.google.com](https://aistudio.google.com) → **Get API key**.

---

## STEP 6 – Deploy del Worker

```bash
npm run deploy
```

Al termine vedrai un URL tipo:
```
https://real-news-api.TUO_ACCOUNT.workers.dev
```

Annotalo: è l'URL del tuo backend. Puoi verificare che funzioni visitando:
```
https://real-news-api.TUO_ACCOUNT.workers.dev/api/health
```

---

## STEP 7 – Configura il CORS (collega frontend e backend)

Ora che conosci l'URL del Worker, devi dirgli da dove arrivano le richieste del frontend.

Apri `worker/wrangler.toml` e decommenta la variabile `ALLOWED_ORIGIN`:

```toml
[vars]
ALLOWED_ORIGIN = "https://real-news.pages.dev"   ← metti qui l'URL del tuo frontend Pages (lo vedrai al STEP 8)
```

> ⚠️ Se il nome del tuo progetto Pages è diverso, l'URL sarà diverso. Aggiorna dopo aver fatto il deploy del frontend.

Dopo aver aggiornato il file, ri-deploya il worker:

```bash
npm run deploy
```

---

## STEP 8 – Build e Deploy del Frontend su Cloudflare Pages

```bash
cd ../frontend
npm install
npx ng build --configuration production
```

Il build produce i file statici in `frontend/dist/frontend/browser/`.

Ora fai il deploy su **Cloudflare Pages**:

```bash
npx wrangler pages deploy dist/frontend/browser --project-name=real-news
```

Al primo deploy, Cloudflare crea automaticamente il progetto Pages.
L'URL sarà qualcosa tipo: `https://real-news.pages.dev`

> 💡 Controlla l'URL reale nel dashboard Cloudflare → **Workers & Pages** → `real-news`

---

## STEP 9 – Configura il Frontend per puntare al Worker

Apri `frontend/src/environments/environment.prod.ts` e assicurati che l'URL del Worker sia quello corretto:

```typescript
export const environment = {
  production: true,
  apiUrl: 'https://real-news-api.TUO_ACCOUNT.workers.dev'  ← URL del tuo Worker
};
```

Se devi modificarlo, ri-fai il build e il deploy del frontend (ripeti il STEP 8).

---

## STEP 10 – Automatizza tutto con GitHub Actions (CI/CD)

Invece di fare deploy manualmente ogni volta, puoi automatizzarlo: ogni push su `main` pubblica in automatico sia il frontend che il worker.

### 10.1 – Ottieni le credenziali Cloudflare

Vai su [dash.cloudflare.com](https://dash.cloudflare.com):

- **Account ID**: visibile in basso a destra nella Home del dashboard
- **API Token**: vai in **My Profile** → **API Tokens** → **Create Token** → usa il template **"Edit Cloudflare Workers"**

### 10.2 – Aggiungi i Secret su GitHub

Nel tuo repository GitHub, vai in **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Nome Secret | Valore |
|-------------|--------|
| `CLOUDFLARE_API_TOKEN` | Il token creato sopra |
| `CLOUDFLARE_ACCOUNT_ID` | Il tuo Account ID |

### 10.3 – Fai un push!

```bash
git add .
git commit -m "configurazione iniziale"
git push origin main
```

GitHub Actions farà tutto il resto: build + deploy frontend + deploy worker. Puoi seguire il progresso nella tab **Actions** del repository su GitHub.

---

## ✅ Checklist finale

Prima di considerarti live, verifica questi punti:

- [ ] `wrangler.toml` ha il `database_id` corretto
- [ ] Il secret `GEMINI_API_KEY` è stato aggiunto con `wrangler secret put`
- [ ] La variabile `ALLOWED_ORIGIN` in `wrangler.toml` punta all'URL del tuo Pages
- [ ] `environment.prod.ts` punta all'URL corretto del tuo Worker
- [ ] `/api/health` risponde correttamente sul Worker
- [ ] Il frontend si apre e carica le notizie senza errori di rete
- [ ] I secret GitHub (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) sono configurati

---

## 🐛 Problemi comuni

### "Error: Missing script: deploy" nel Worker
Assicurati di essere nella cartella `worker/` prima di eseguire i comandi:
```bash
cd worker && npm run deploy
```

### Il frontend non riesce a caricare le notizie (errore di rete / CORS)
- Controlla che `ALLOWED_ORIGIN` in `wrangler.toml` corrisponda esattamente all'URL del frontend (senza `/` finale)
- Ri-deploya il Worker dopo ogni modifica al `wrangler.toml`

### Il Worker non chiama Gemini (notizie vuote)
- Verifica che il secret `GEMINI_API_KEY` sia stato impostato: `wrangler secret list`
- Assicurati che la chiave sia attiva su [aistudio.google.com](https://aistudio.google.com)

### GitHub Actions fallisce con "authentication error"
- Controlla che i secret `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` siano scritti **esattamente** con quei nomi (case-sensitive)

---

## 📚 Link utili

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- [Cloudflare D1 Docs](https://developers.cloudflare.com/d1/)
- [Wrangler CLI Reference](https://developers.cloudflare.com/workers/wrangler/)
- [Google AI Studio (Gemini)](https://aistudio.google.com)
