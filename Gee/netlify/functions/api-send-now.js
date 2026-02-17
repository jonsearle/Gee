import { getAppEnv } from '../../src/netlify/env.js';
import { getAuthedUser, json } from '../../src/netlify/http.js';
import { decryptToken } from '../../src/crypto.js';
import { runForUser } from '../../src/daily-core.js';

export const handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'method not allowed' });

    const appEnv = getAppEnv();
    const authed = await getAuthedUser(event, appEnv);

    if (!authed) return json(401, { error: 'unauthorized' });

    const { user, repo } = authed;
    if (!user.google_refresh_token_enc) {
      return json(400, { error: 'Google refresh token missing. Please reconnect your Google account.' });
    }

    const stateRow = await repo.getUserState(user.id);
    const refreshToken = decryptToken(user.google_refresh_token_enc, appEnv.security.tokenEncryptionKey);

    const nextState = await runForUser({
      appConfig: {
        openai: appEnv.openai,
        resend: appEnv.resend,
        google: {
          ...appEnv.google,
          refreshToken,
        },
        delivery: {
          fromEmail: appEnv.delivery.fromEmail,
          fromName: appEnv.delivery.fromName,
        },
      },
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        toEmail: user.email,
        sendHourUtc: user.send_hour_utc,
      },
      refreshToken,
      repo,
      state: {
        firstRunCompleted: stateRow?.first_run_completed || false,
        lastRunAt: stateRow?.last_run_at || null,
        lastThreadIds: Array.isArray(stateRow?.last_thread_ids) ? stateRow.last_thread_ids : [],
      },
      forceWelcomeEmail: false,
      dryRun: false,
    });

    await repo.saveUserState(user.id, nextState);
    return json(200, { ok: true });
  } catch (err) {
    return json(500, { error: err.message || 'Failed to send summary' });
  }
};
