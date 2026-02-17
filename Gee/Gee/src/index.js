import { loadState, saveState } from './state.js';
import { runForUser } from './daily-core.js';
import { config } from './config.js';

async function main() {
  if (!config.user.email || !config.google.refreshToken) {
    throw new Error('Single-user mode requires GEE_USER_EMAIL and GOOGLE_REFRESH_TOKEN in .env');
  }

  const state = await loadState(config.stateFile);

  const nextState = await runForUser({
    appConfig: config,
    user: {
      email: config.user.email,
      name: config.user.name || config.user.email,
      toEmail: process.env.GEE_TO_EMAIL || config.user.email,
      sendHourUtc: config.delivery.dailySendHourUtc,
    },
    refreshToken: config.google.refreshToken,
    state,
    forceWelcomeEmail: config.forceWelcomeEmail,
    dryRun: config.dryRun,
  });

  await saveState(config.stateFile, nextState);
  console.log('Gee daily summary complete.');
}

main().catch((err) => {
  console.error('Gee failed:', err);
  process.exit(1);
});
