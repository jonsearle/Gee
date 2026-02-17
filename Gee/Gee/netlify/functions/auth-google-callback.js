import { google } from 'googleapis';
import { getAppEnv } from '../../src/netlify/env.js';
import { createRepository } from '../../src/repository.js';
import { encryptToken } from '../../src/crypto.js';
import { buildSessionSetCookie, createSessionToken } from '../../src/netlify/session.js';
import { redirect } from '../../src/netlify/http.js';

export const handler = async (event) => {
  try {
    const appEnv = getAppEnv();
    const code = event.queryStringParameters?.code || '';
    if (!code) {
      return { statusCode: 400, body: 'Missing code' };
    }

    const oauth2Client = new google.auth.OAuth2(
      appEnv.google.clientId,
      appEnv.google.clientSecret,
      appEnv.google.redirectUri,
    );

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const me = await oauth2.userinfo.get();
    const email = me.data.email;
    const name = me.data.name || email;

    if (!email) return { statusCode: 400, body: 'Google account email not available' };

    const repo = createRepository({
      supabaseUrl: appEnv.supabase.url,
      supabaseServiceRoleKey: appEnv.supabase.serviceRoleKey,
    });

    const encryptedRefresh = tokens.refresh_token
      ? encryptToken(tokens.refresh_token, appEnv.security.tokenEncryptionKey)
      : null;

    const user = await repo.upsertOAuthUser({
      email,
      name,
      encryptedRefreshToken: encryptedRefresh,
    });

    const sessionToken = createSessionToken(
      { userId: user.id, email: user.email },
      appEnv.security.sessionSecret,
    );

    const isSecure = appEnv.web.baseUrl.startsWith('https://');
    return redirect('/', {
      'set-cookie': buildSessionSetCookie(sessionToken, isSecure),
    });
  } catch (err) {
    return {
      statusCode: 500,
      body: `OAuth failed: ${err.message || 'unknown error'}`,
    };
  }
};
