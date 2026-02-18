import { decryptToken } from '../../src/crypto.js';
import { createGoogleClients } from '../../src/google.js';
import { createLlmClient } from '../../src/llm.js';
import { runMemoryQuery } from '../../src/memory-agent-v1/index.js';
import { getAppEnv } from '../../src/netlify/env.js';
import { getAuthedUser, json } from '../../src/netlify/http.js';

function parseJsonBody(event) {
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : String(event.body || '');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export const handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'method not allowed' });

    const appEnv = getAppEnv();
    const authed = await getAuthedUser(event, appEnv);
    if (!authed) return json(401, { error: 'unauthorized' });

    const body = parseJsonBody(event);
    const userInput = String(body?.user_input || '').trim();
    const sessionId = String(body?.session_id || '').trim();
    if (!userInput) return json(400, { error: 'user_input is required' });

    const { user } = authed;
    if (!user.google_refresh_token_enc) {
      return json(400, { error: 'Google refresh token missing. Please reconnect your Google account.' });
    }

    const refreshToken = decryptToken(user.google_refresh_token_enc, appEnv.security.tokenEncryptionKey);
    const clients = createGoogleClients(appEnv.google, refreshToken);
    const llm = createLlmClient(appEnv.openai.apiKey);

    const result = await runMemoryQuery({
      userId: user.id,
      userInput,
      sessionId,
      gmail: clients.gmail,
      calendar: clients.calendar,
      llm: {
        client: llm,
        model: appEnv.openai.model,
      },
    });

    return json(200, result.response, {
      'x-memory-interaction-id': result.interactionId,
    });
  } catch (err) {
    return json(500, { error: err.message || 'memory query failed' });
  }
};
