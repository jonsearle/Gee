import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import dotenv from 'dotenv';
import { google } from 'googleapis';
import { createRepository } from './repository.js';
import { encryptToken } from './crypto.js';

dotenv.config();

const webPort = Number(process.env.GEE_WEB_PORT || 8787);
const baseUrl = process.env.GEE_BASE_URL || `http://localhost:${webPort}`;
const sessionSecret = process.env.GEE_SESSION_SECRET;

if (!sessionSecret) throw new Error('Missing GEE_SESSION_SECRET');
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}
if (!process.env.GEE_TOKEN_ENCRYPTION_KEY) {
  throw new Error('Missing GEE_TOKEN_ENCRYPTION_KEY');
}
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
}

const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/auth/google/callback`;
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  redirectUri,
);

const repo = createRepository({
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDir = path.resolve(__dirname, '../web');

const app = express();
app.use(express.json());
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 1000 * 60 * 60 * 24 * 30,
  },
}));
app.use(express.static(webDir));

function requireAuth(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: 'unauthorized' });
  return next();
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/auth/google/start', (_req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/calendar.readonly',
    ],
  });
  res.redirect(url);
});

app.get('/auth/google/callback', async (req, res) => {
  try {
    const code = String(req.query.code || '');
    if (!code) return res.status(400).send('Missing code');

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const me = await oauth2.userinfo.get();
    const email = me.data.email;
    const name = me.data.name || email;

    if (!email) return res.status(400).send('Google account email not available');

    const encryptedRefresh = tokens.refresh_token
      ? encryptToken(tokens.refresh_token, process.env.GEE_TOKEN_ENCRYPTION_KEY)
      : null;

    const user = await repo.upsertOAuthUser({
      email,
      name,
      encryptedRefreshToken: encryptedRefresh,
    });

    req.session.userId = user.id;
    req.session.email = user.email;

    return res.redirect('/');
  } catch (err) {
    return res.status(500).send(`OAuth failed: ${err.message || 'unknown error'}`);
  }
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', async (req, res) => {
  try {
    if (!req.session?.userId) return res.json({ authenticated: false });

    const user = await repo.getUserById(req.session.userId);
    if (!user) return res.json({ authenticated: false });

    return res.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        autoSendDailyEmail: user.auto_send_daily_email,
        sendHourUtc: user.send_hour_utc,
        hasRefreshToken: Boolean(user.google_refresh_token_enc),
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'failed to load session' });
  }
});

app.get('/api/preferences', requireAuth, async (req, res) => {
  try {
    const user = await repo.getUserById(req.session.userId);
    if (!user) return res.status(404).json({ error: 'user not found' });

    return res.json({
      autoSendDailyEmail: user.auto_send_daily_email,
      sendHourUtc: user.send_hour_utc,
      email: user.email,
      name: user.name,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'failed to load preferences' });
  }
});

app.post('/api/preferences', requireAuth, async (req, res) => {
  try {
    const nextHour = Number(req.body?.sendHourUtc);
    const sendHourUtc = Number.isInteger(nextHour) && nextHour >= 0 && nextHour <= 23 ? nextHour : undefined;

    const updated = await repo.updateUserPreferences({
      userId: req.session.userId,
      autoSendDailyEmail: typeof req.body?.autoSendDailyEmail === 'boolean' ? req.body.autoSendDailyEmail : undefined,
      sendHourUtc,
    });

    return res.json({
      autoSendDailyEmail: updated.auto_send_daily_email,
      sendHourUtc: updated.send_hour_utc,
      email: updated.email,
      name: updated.name,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'failed to update preferences' });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(webDir, 'index.html'));
});

app.listen(webPort, () => {
  console.log(`Gee web app running on ${baseUrl}`);
});
