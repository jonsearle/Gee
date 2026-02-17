import { getAppEnv } from '../../src/netlify/env.js';
import { getAuthedUser, json } from '../../src/netlify/http.js';

export const handler = async (event) => {
  try {
    const appEnv = getAppEnv();
    const authed = await getAuthedUser(event, appEnv);

    if (!authed) return json(200, { authenticated: false });

    const user = authed.user;
    return json(200, {
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
    return json(500, { error: err.message || 'failed to load session' });
  }
};
