import { logEvent } from '../../src/memory-agent-v1/index.js';
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
    const eventType = String(body?.event_type || '').trim();
    if (!eventType) return json(400, { error: 'event_type is required' });

    if (eventType === 'item_opened') {
      logEvent('item_opened', {
        interaction_id: String(body?.interaction_id || ''),
        source_id: String(body?.source_id || ''),
        timestamp: body?.timestamp || new Date().toISOString(),
      });
      return json(200, { ok: true });
    }

    if (eventType === 'followup_prompt') {
      logEvent('followup_prompt', {
        interaction_id: String(body?.interaction_id || ''),
        timestamp: body?.timestamp || new Date().toISOString(),
        text_summary: String(body?.text_summary || '').slice(0, 240),
      });
      return json(200, { ok: true });
    }

    if (eventType === 'no_interaction_timeout') {
      logEvent('no_interaction_timeout', {
        interaction_id: String(body?.interaction_id || ''),
        timeout_s: Number(body?.timeout_s || 0),
        timestamp: body?.timestamp || new Date().toISOString(),
      });
      return json(200, { ok: true });
    }

    return json(400, { error: 'unsupported event_type' });
  } catch (err) {
    return json(500, { error: err.message || 'memory event failed' });
  }
};
