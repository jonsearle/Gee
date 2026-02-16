import { config } from './config.js';
import { createRepository } from './repository.js';
import { decryptToken } from './crypto.js';
import { runForUser } from './daily-core.js';

function utcHourNow() {
  return new Date().getUTCHours();
}

async function main() {
  const repo = createRepository({
    supabaseUrl: config.supabase.url,
    supabaseServiceRoleKey: config.supabase.serviceRoleKey,
  });

  const targetHour = Number.isInteger(config.scheduler.hourOverride)
    ? config.scheduler.hourOverride
    : utcHourNow();

  const users = await repo.listUsersForHour(targetHour);
  console.log(`Gee scheduled run: ${users.length} user(s) at hour ${targetHour} UTC`);

  for (const row of users) {
    if (!row.google_refresh_token_enc) {
      console.log(`Skipping ${row.email}: missing refresh token`);
      continue;
    }

    const stateRow = await repo.getUserState(row.id);
    const refreshToken = decryptToken(row.google_refresh_token_enc, config.security.tokenEncryptionKey);

    try {
      const nextState = await runForUser({
        appConfig: config,
        user: {
          email: row.email,
          name: row.name,
          toEmail: row.email,
          sendHourUtc: row.send_hour_utc,
        },
        refreshToken,
        state: {
          firstRunCompleted: stateRow?.first_run_completed || false,
          lastRunAt: stateRow?.last_run_at || null,
          lastThreadIds: Array.isArray(stateRow?.last_thread_ids) ? stateRow.last_thread_ids : [],
        },
        forceWelcomeEmail: config.forceWelcomeEmail,
        dryRun: config.dryRun,
      });

      await repo.saveUserState(row.id, nextState);
      console.log(`Completed ${row.email}`);
    } catch (err) {
      console.error(`Failed for ${row.email}:`, err.message || err);
    }
  }
}

main().catch((err) => {
  console.error('Scheduled run failed:', err);
  process.exit(1);
});
