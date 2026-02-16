# Gee (v1)

Gee is a read-only daily planning agent for Google Workspace (Gmail + Calendar).
It sends one daily email summary via Resend and does not modify inbox state.

## What v1 does

- Reads Gmail threads (7 days on first run, then incremental-ish via recent + unseen thread IDs)
- Reads Calendar events for today + tomorrow
- Optionally reads events on dates referenced in recent emails
- Synthesizes a daily plan with one LLM call
- Sends one plain-text email signed `Gee`
- Sends a first-run welcome email that confirms the next scheduled send time
- Includes a simple per-user preferences page to toggle daily email on/off

## Constraints respected

- Gmail read-only fetch for inbox content
- Calendar read-only fetch
- No labels, stars, archive, read/unread changes
- No replies, no task system

## Setup

1. Create a Google Cloud project and OAuth credentials.
2. Enable Gmail API and Google Calendar API.
3. Grant these scopes during OAuth consent:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/calendar.readonly`
4. Obtain a refresh token for your user.
5. Create a Resend account, verify a sending domain/address, and generate an API key.
6. Copy `.env.example` to `.env` and fill values.
7. Install deps and run:

```bash
npm install
npm start
```

## Environment variables

See `.env.example`.

Key vars:
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (default `gpt-4.1-mini`)
- `RESEND_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_REFRESH_TOKEN`
- `GEE_USER_EMAIL`
- `GEE_USER_NAME`
- `GEE_TO_EMAIL` (optional; defaults to user email)
- `GEE_FROM_EMAIL` (required; must be a verified Resend sender)
- `GEE_DAILY_SEND_HOUR_UTC` (default `9`, i.e. 9:00 a.m. GMT)
- `GEE_DRY_RUN=true` to print instead of send
- `FORCE_WELCOME_EMAIL=true` to force the welcome-format email for testing
- `GEE_PREFERENCES_FILE` (default `.gee-preferences.json`)
- `GEE_WEB_PORT` (default `8787`)

## Preferences page

Run:

```bash
npm run start:web
```

Open:

`http://localhost:8787`

Current v1 controls:
- Email identity (per-user key)
- Toggle: `Send me my daily Gee email automatically`

Notes:
- This is intentionally lightweight and does not include authentication yet.
- Replace `/web/icon.svg` with your own icon when ready.

## Run daily

Use any scheduler, for example cron:

```bash
0 9 * * * cd /Users/jonsearle/Desktop/codex-prototype/Gee && TZ=UTC /usr/bin/env node src/index.js >> gee.log 2>&1
```

## v1 shortcuts / intentional simplifications

- Uses lightweight thread-ID memory instead of Gmail history sync
- Uses simple regex date extraction from email text
- Uses plain-text email output only
- Uses one LLM prompt for synthesis + writing

These are intentional to keep build time to hours.

## Netlify Go-Live (fast path)

Use Netlify for hosting the preferences/home web app, and use a scheduled function for the daily run.

1. Push this repo to GitHub.
2. Create a Netlify site connected to the repo.
3. Add all env vars from `.env.example` in Netlify Site settings.
4. Ensure `GEE_FROM_EMAIL` is verified in Resend.
5. In Google Cloud OAuth settings, add Netlify callback URLs you use.
6. Set a daily schedule at 9:00 UTC (09:00 GMT in winter; 10:00 BST in summer if you want local UK 9).

Note:
- Current code is single-user `.env` based for agent execution.
- For full multi-user production, move user tokens/preferences into a database and run per-user in the daily job.
