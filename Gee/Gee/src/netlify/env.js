function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export function getAppEnv() {
  const webPort = Number(process.env.GEE_WEB_PORT || 8790);

  return {
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
      redirectUri: process.env.GOOGLE_REDIRECT_URI || `${process.env.GEE_BASE_URL || `http://localhost:${webPort}`}/auth/google/callback`,
    },
    delivery: {
      fromName: process.env.GEE_FROM_NAME || 'Gee',
      fromEmail: required('GEE_FROM_EMAIL'),
    },
    supabase: {
      url: required('SUPABASE_URL'),
      serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    },
    security: {
      tokenEncryptionKey: required('GEE_TOKEN_ENCRYPTION_KEY'),
      sessionSecret: required('GEE_SESSION_SECRET'),
    },
    web: {
      baseUrl: process.env.GEE_BASE_URL || `http://localhost:${webPort}`,
    },
    behavior: {
      forceWelcomeEmail: (process.env.FORCE_WELCOME_EMAIL || 'false').toLowerCase() === 'true',
      dryRun: (process.env.GEE_DRY_RUN || 'false').toLowerCase() === 'true',
    },
  };
}
