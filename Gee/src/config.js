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
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost',
    refreshToken: required('GOOGLE_REFRESH_TOKEN'),
  },
  user: {
    email: required('GEE_USER_EMAIL'),
    name: required('GEE_USER_NAME'),
  },
  delivery: {
    toEmail: process.env.GEE_TO_EMAIL || required('GEE_USER_EMAIL'),
    fromName: process.env.GEE_FROM_NAME || 'Gee',
    fromEmail: required('GEE_FROM_EMAIL'),
    dailySendHourUtc: Number(process.env.GEE_DAILY_SEND_HOUR_UTC || 9),
  },
  stateFile: process.env.GEE_STATE_FILE || '.gee-state.json',
  preferencesFile: process.env.GEE_PREFERENCES_FILE || '.gee-preferences.json',
  dryRun: (process.env.GEE_DRY_RUN || 'false').toLowerCase() === 'true',
  forceWelcomeEmail: (process.env.FORCE_WELCOME_EMAIL || 'false').toLowerCase() === 'true',
  web: {
    port: Number(process.env.GEE_WEB_PORT || 8787),
  },
};
