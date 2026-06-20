# Deploying MarketPulse

Plain-English, click-by-click guide. Two pieces get deployed:

- **Backend** (the API + database) → **Railway**
- **Frontend** (the website) → **Vercel**

They talk to each other over the internet, so each needs to know the other's
web address. That's the only tricky part, and it's explained in Part 3.

> The code is already deploy-ready and lives on the `main` branch. You won't
> change any code — this is all clicking through dashboards and pasting in keys.

---

## Before you start

You'll need accounts on:
- [ ] **Railway** (railway.app) — runs the backend + Postgres database
- [ ] **Vercel** (vercel.com) — runs the frontend
- [ ] **GitHub** — already done; both connect to your repo `neilk225/Marketpulse`

Have your API keys handy (the same ones in `backend/.env`):
`OPENROUTER_API_KEY`, `FINNHUB_API_KEY`, `COINGECKO_API_KEY`, `FMP_API_KEY`.

---

## Part 1 — Backend on Railway

1. **New Project** → *Deploy from GitHub repo* → pick `Marketpulse`.
2. Open the service → **Settings**:
   - **Root Directory** = `backend`  ← important, the backend lives in a subfolder.
   - Railway auto-detects Python and starts it using the `Procfile` (already in the repo).
3. **Add a database**: in the project, click **New → Database → PostgreSQL**.
   Railway creates it and exposes a `DATABASE_URL`.
4. Go to your backend service → **Variables** and add:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Reference the Postgres you just made (Railway lets you link it) |
   | `OPENROUTER_API_KEY` | your key |
   | `FINNHUB_API_KEY` | your key |
   | `COINGECKO_API_KEY` | your key |
   | `FMP_API_KEY` | your key |
   | `SCORING_DAILY_CAP` | `300` |
   | `ALLOWED_ORIGINS` | leave blank for now — you'll fill it in Part 3 |

5. **Deploy.** When it's up, the database tables are created automatically.
6. **Seed the tickers** (one time): in Railway, open the service's shell / run
   command and run:
   ```
   python scripts/seed_tickers.py
   ```
   This loads the ~610 starting tickers.
7. **Copy the backend URL** — something like
   `https://marketpulse-production.up.railway.app`. You'll need it in Part 2.

✅ Backend is live. (You can test it by visiting `<backend-url>/health` — it
should say `{"status":"ok"}`.)

---

## Part 2 — Frontend on Vercel

1. **Add New Project** → import the `Marketpulse` repo.
2. **Root Directory** = `frontend`  ← again, it's in a subfolder. Vercel detects Next.js.
3. **Environment Variables** → add:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | the backend URL from Part 1, Step 7 |

4. **Deploy.** Copy the frontend URL — something like
   `https://marketpulse.vercel.app`.

✅ Frontend is live — but it can't talk to the backend yet. That's Part 3.

---

## Part 3 — Connect them (the one fiddly step)

The backend, for security, only accepts requests from web addresses you approve.
Right now it approves none, so the site can't load data. Fix it:

1. Go back to **Railway → backend → Variables**.
2. Set:
   ```
   ALLOWED_ORIGINS = https://marketpulse.vercel.app
   ```
   (use your actual Vercel URL from Part 2)
3. Railway redeploys automatically.

✅ Done — open your Vercel URL and the app works end to end.

> **Why this is a two-step shuffle:** the frontend needs the backend's address,
> and the backend needs the frontend's address — but neither address exists
> until you deploy. So you deploy both first, then paste each one's address into
> the other. The custom domain below removes this, because *you* pick the
> addresses ahead of time.

---

## Part 4 — Custom domain (optional, recommended)

Buy a domain from a cheap registrar (**Cloudflare** or **Porkbun** are at-cost,
~$10/yr for `.com`; `.app` ~$13 and forces HTTPS). Vercel can also sell you one
in-dashboard for zero DNS hassle.

Say you buy `marketpulse.app`:

1. **Frontend domain** — Vercel → your project → **Domains** → add
   `marketpulse.app`. Vercel shows DNS records; add them at your registrar.
2. **Backend domain** — Railway → backend → **Settings → Networking → Custom
   Domain** → add `api.marketpulse.app`. Add the CNAME it shows at your registrar.
3. **Point the two env vars at the final names** and redeploy both:
   - Vercel: `NEXT_PUBLIC_API_URL = https://api.marketpulse.app`
   - Railway: `ALLOWED_ORIGINS = https://marketpulse.app`

HTTPS certificates are issued automatically by both. Because you chose the names
up front, you can set these once and skip the Part 3 back-and-forth.

---

## Quick reference — all environment variables

**Railway (backend)**
```
DATABASE_URL          (from Railway Postgres)
OPENROUTER_API_KEY
FINNHUB_API_KEY
COINGECKO_API_KEY
FMP_API_KEY
SCORING_DAILY_CAP=300
ALLOWED_ORIGINS=https://<your-frontend-url>
```

**Vercel (frontend)**
```
NEXT_PUBLIC_API_URL=https://<your-backend-url>
```

---

## If something's wrong

- **Site loads but no data / console CORS error** → `ALLOWED_ORIGINS` doesn't
  exactly match your frontend URL (check `https://`, no trailing slash).
- **Frontend can't reach API** → `NEXT_PUBLIC_API_URL` is wrong, or you changed
  it without redeploying the frontend (Vercel bakes it in at build time).
- **Backend won't start** → check Railway logs; usually a missing env var.
- **Tickers don't autocomplete / movers empty** → you skipped the seed step
  (Part 1, Step 6) or an API key is missing.
- **Scoring stops after a while** → that's the daily cost cap (`SCORING_DAILY_CAP`)
  doing its job; raise it if you want more fresh scorings per day.
