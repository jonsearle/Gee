import { getAppEnv } from '../../src/netlify/env.js';
import { buildLogoutSetCookie } from '../../src/netlify/session.js';
import { json } from '../../src/netlify/http.js';

export const handler = async () => {
  const appEnv = getAppEnv();
  const isSecure = appEnv.web.baseUrl.startsWith('https://');

  return json(200, { ok: true }, {
    'set-cookie': buildLogoutSetCookie(isSecure),
  });
};
