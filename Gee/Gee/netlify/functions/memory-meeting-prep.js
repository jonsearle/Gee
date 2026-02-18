import { decryptToken } from '../../src/crypto.js';
import { createGoogleClients } from '../../src/google.js';
import { createLlmClient } from '../../src/llm.js';
import { runMeetingPrep } from '../../src/memory-agent-v1/meeting-prep.js';
import { getAppEnv } from '../../src/netlify/env.js';
import { getAuthedUser, json } from '../../src/netlify/http.js';

export const handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'method not allowed' });

    const appEnv = getAppEnv();
    const authed = await getAuthedUser(event, appEnv);
    if (!authed) return json(401, { error: 'unauthorized' });

    const user = authed.user;
    if (!user.google_refresh_token_enc) {
      return json(400, { error: 'Google refresh token missing. Please reconnect your Google account.' });
    }

    const refreshToken = decryptToken(user.google_refresh_token_enc, appEnv.security.tokenEncryptionKey);
    const clients = createGoogleClients(appEnv.google, refreshToken);
    const llm = createLlmClient(appEnv.openai.apiKey);

    const response = await runMeetingPrep({
      gmail: clients.gmail,
      calendar: clients.calendar,
      llm: {
        client: llm,
        model: appEnv.openai.model,
      },
    });
    return json(200, response);
  } catch (err) {
    return json(500, { error: err.message || 'meeting prep failed' });
  }
};
