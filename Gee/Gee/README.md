# Gee (Netlify Functions)

Gee sends a once-daily planning email from read-only Gmail + Calendar context.

## Architecture

- Static UI from `/web`
- Netlify Functions for auth + API
- Supabase for users + encrypted Google refresh tokens + run state
- Resend for outbound email
- OpenAI for synthesis

## Required env vars

Set these in local `.env` and in Netlify site environment variables:

- `OPENAI_API_KEY`
- `OPENAI_MODEL` (optional, default `gpt-4.1-mini`)
- `RESEND_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEE_TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`)
- `GEE_SESSION_SECRET` (`openssl rand -base64 32`)
- `GEE_FROM_NAME`
- `GEE_FROM_EMAIL`
- `GEE_BASE_URL`
- `GEE_DRY_RUN` (optional)
- `FORCE_WELCOME_EMAIL` (optional)
- `GEE_SCHEDULE_HOUR_OVERRIDE` (optional)

## Supabase setup

1. Open Supabase SQL Editor.
2. Run `/Users/jonsearle/Desktop/codex-prototype/Gee/supabase/schema.sql`.

## Google OAuth setup

In your Google OAuth Web client add redirect URIs:

- Local dev: `http://localhost:8790/auth/google/callback`
- Netlify prod: `https://<your-site>.netlify.app/auth/google/callback`

Scopes used:

- `openid`
- `email`
- `profile`
- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/calendar.readonly`

## Local run (Netlify-style)

1. Install dependencies:

```bash
npm install
```

2. Run Netlify dev:

```bash
npx netlify dev
```

3. Open `http://localhost:8790`.

## Deploy to Netlify

1. Push repo to GitHub.
2. Create Netlify site from repo.
3. Netlify will use `netlify.toml`:
   - publish dir: `web`
   - functions dir: `netlify/functions`
   - redirects for `/auth/*` and `/api/*`
4. Add all env vars in Netlify site settings.
5. Redeploy.

## Endpoints

- `GET /auth/google/start`
- `GET /auth/google/callback`
- `POST /auth/logout`
- `GET /api/me`
- `POST /api/send-now`
- `GET /api/scheduled-send` (manual trigger)

## Scheduled sends

`scheduled-send` function is configured hourly in `netlify.toml` and only sends for users whose `send_hour_utc` matches the current UTC hour.

