# Gee

Gee sends a once-daily planning email using read-only Gmail + Calendar context.

Current architecture supports:
- Google sign-in onboarding UI
- Per-user preferences (auto send + UTC hour)
- Supabase-backed user/token storage
- Scheduled multi-user daily runs
- Resend for outbound email

## Safety model

Google scopes:
- `openid`
- `email`
- `profile`
- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/calendar.readonly`

No Gmail send/modify permissions are requested.

## 1. Environment

Copy template:

```bash
cp .env.example .env
```

Fill required values in `.env`:
- `OPENAI_API_KEY`
- `RESEND_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEE_TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`)
- `GEE_SESSION_SECRET`
- `GEE_FROM_EMAIL`

## 2. Supabase schema

Run SQL in Supabase SQL editor:

`/Users/jonsearle/Desktop/codex-prototype/Gee/supabase/schema.sql`

## 3. Google OAuth setup

In Google Cloud OAuth client, add redirect URIs:
- Local: `http://localhost:8787/auth/google/callback`
- Netlify: `https://<your-site>.netlify.app/auth/google/callback`

Ensure your OAuth consent screen is External and test users are added.

## 4. Run locally

Install deps:

```bash
npm install
```

Start web app:

```bash
npm run start:web
```

Open:

`http://localhost:8787`

Sign in with Google and save preferences.

Run scheduled worker manually:

```bash
npm run run:scheduled
```

## 5. Netlify deployment (lean path)

1. Push repo to GitHub.
2. Create Netlify site from repo.
3. Build command: none (or `npm ci`).
4. Publish directory: not required for Node server mode; for Netlify Functions refactor, do that next.
5. Add all `.env` values as Netlify environment variables.
6. Configure cron/scheduled trigger to run `npm run run:scheduled` externally (for now use GitHub Actions/cron runner).

Note:
- This repo currently uses an Express web server. Netlify-native runtime requires a small Functions refactor. For immediate uptime tonight, deploy web on a Node host (Railway/Render/Fly) and keep Netlify for static landing until refactor.

## Commands

- Single-user local test run: `npm start`
- Web app: `npm run start:web`
- Multi-user scheduled run: `npm run run:scheduled`
