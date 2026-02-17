import dotenv from 'dotenv';

dotenv.config();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  openai: {
    apiKey: required('OPENAI_API_KEY'),
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
  },
  resend: {
    apiKey: required('RESEND_API_KEY'),
  },
  google: {
    clientId: required('GOOGLE_CLIENT_ID'),
    clientSecret: required('GOOGLE_CLIENT_SECRET'),
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:8787/auth/google/callback',
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN || '',
  },
  delivery: {
    fromName: process.env.GEE_FROM_NAME || 'G',
    fromEmail: required('GEE_FROM_EMAIL'),
    dailySendHourUtc: Number(process.env.GEE_DAILY_SEND_HOUR_UTC || 9),
  },
  user: {
    email: process.env.GEE_USER_EMAIL || '',
    name: process.env.GEE_USER_NAME || '',
  },
  stateFile: process.env.GEE_STATE_FILE || '.gee-state.json',
  preferencesFile: process.env.GEE_PREFERENCES_FILE || '.gee-preferences.json',
  dryRun: (process.env.GEE_DRY_RUN || 'false').toLowerCase() === 'true',
  forceWelcomeEmail: (process.env.FORCE_WELCOME_EMAIL || 'false').toLowerCase() === 'true',
  web: {
    port: Number(process.env.GEE_WEB_PORT || 8787),
    baseUrl: process.env.GEE_BASE_URL || `http://localhost:${process.env.GEE_WEB_PORT || 8787}`,
    sessionSecret: required('GEE_SESSION_SECRET'),
  },
  supabase: {
    url: required('SUPABASE_URL'),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  },
  security: {
    tokenEncryptionKey: required('GEE_TOKEN_ENCRYPTION_KEY'),
  },
  scheduler: {
    hourOverride: process.env.GEE_SCHEDULE_HOUR_OVERRIDE ? Number(process.env.GEE_SCHEDULE_HOUR_OVERRIDE) : null,
  },
};
