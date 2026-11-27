# Blunderless

A chess analysis platform & AI coach ("Chester") grounded strictly in Stockfish evaluations and structured board features.

## Run Locally (Windows)

```powershell
py app.py
```

Or double-click `run.bat`, then open `http://127.0.0.1:8000`.

## Share With Testers (Discord URL)

### Option 1: Free 24/7 Public URL via Render (Recommended)
1. Push this repo to GitHub (the included `Dockerfile`, `requirements.txt`, and `render.yaml` install Linux Stockfish automatically).
2. Go to [render.com](https://render.com) → **New + → Blueprint** (or **Web Service** → select your repo → Runtime: **Docker**).
3. Click **Deploy** — Render gives you a live `https://blunderless-xxxx.onrender.com` URL you can drop straight into Discord (complete with a rich Discord preview card).

### Option 2: Instant Temporary Link From Your PC (Cloudflare Tunnel)
While `py app.py` is running locally, open a second PowerShell window and run:
```powershell
winget install Cloudflare.cloudflared
cloudflared tunnel --url http://127.0.0.1:8000
```
Copy the `https://....trycloudflare.com` link it prints and paste it in Discord. *(Note: the link stays live while both windows remain open.)*

## Environment Variables (Optional)
- `DATABASE_URL` — PostgreSQL connection URL (e.g., free Neon, Supabase, or Render Postgres) for persistent cloud user accounts, cross-device login, synced games, cached analyses, and settings. Falls back automatically to local SQLite (`data/blunderless.db`) when unset.
- `STOCKFISH_PATH` — custom path to Stockfish binary (auto-detected on Windows & Linux).
- `BLUNDERLESS_DB_PATH` — custom SQLite path when not using `DATABASE_URL` (defaults to `data/blunderless.db`).
- `GEMINI_API_KEY` — optional Gemini API key for LLM-phrased Chester explanations (falls back to grounded comparative explanations without it).
- `GEMINI_MODEL` — optional Gemini model override (defaults to `gemini-3.8-flash`).
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — optional Google OAuth login (automatically hidden when unset so testers can sign in via Email/Password account, Chess.com / Lichess, or a quick profile).
