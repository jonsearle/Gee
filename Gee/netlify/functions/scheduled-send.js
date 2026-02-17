import { getAppEnv } from '../../src/netlify/env.js';
import { createRepository } from '../../src/repository.js';
import { decryptToken } from '../../src/crypto.js';
import { runForUser } from '../../src/daily-core.js';

function utcHourNow() {
  return new Date().getUTCHours();
}

export const handler = async () => {
  try {
    const appEnv = getAppEnv();

    const repo = createRepository({
      supabaseUrl: appEnv.supabase.url,
      supabaseServiceRoleKey: appEnv.supabase.serviceRoleKey,
    });

    const hourOverride = process.env.GEE_SCHEDULE_HOUR_OVERRIDE
      ? Number(process.env.GEE_SCHEDULE_HOUR_OVERRIDE)
      : null;

    const targetHour = Number.isInteger(hourOverride) ? hourOverride : utcHourNow();
    const users = await repo.listUsersForHour(targetHour);

    const results = [];

    for (const row of users) {
      try {
        if (!row.google_refresh_token_enc) {
          results.push({ email: row.email, status: 'skipped', reason: 'missing refresh token' });
          continue;
        }

        const stateRow = await repo.getUserState(row.id);
        const refreshToken = decryptToken(row.google_refresh_token_enc, appEnv.security.tokenEncryptionKey);

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
            security: {
              sessionSecret: appEnv.security.sessionSecret,
            },
            web: {
              baseUrl: appEnv.web.baseUrl,
            },
          },
          user: {
            id: row.id,
            email: row.email,
            name: row.name,
            toEmail: row.email,
            sendHourUtc: row.send_hour_utc,
          },
          refreshToken,
          repo,
          state: {
            firstRunCompleted: stateRow?.first_run_completed || false,
            lastRunAt: stateRow?.last_run_at || null,
            lastThreadIds: Array.isArray(stateRow?.last_thread_ids) ? stateRow.last_thread_ids : [],
          },
          forceWelcomeEmail: (process.env.FORCE_WELCOME_EMAIL || 'false').toLowerCase() === 'true',
          dryRun: (process.env.GEE_DRY_RUN || 'false').toLowerCase() === 'true',
        });

        await repo.saveUserState(row.id, nextState);
        results.push({ email: row.email, status: 'sent' });
      } catch (err) {
        results.push({ email: row.email, status: 'failed', error: err.message || String(err) });
      }
    }

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        ok: true,
        targetHour,
        processed: users.length,
        results,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ ok: false, error: err.message || String(err) }),
    };
  }
};
