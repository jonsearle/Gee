import { formatISO } from 'date-fns';
import { config } from './config.js';
import { loadState, saveState } from './state.js';
import { createGoogleClients } from './google.js';
import { fetchRelevantEmails } from './gmail.js';
import { extractReferencedDates } from './cleaner.js';
import { fetchCalendarContext } from './calendar.js';
import { createLlmClient, synthesizeDailyPlan } from './llm.js';
import { renderDailyEmail } from './renderer.js';
import { getUserPreferences } from './preferences.js';
import { createResendClient, sendSummaryEmail } from './resend.js';

function nextSendUtcText(dailySendHourUtc) {
  const now = new Date();
  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    dailySendHourUtc,
    0,
    0,
    0,
  ));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);

  const dateStr = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(next);

  const timeStr = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  }).format(next);

  return `${dateStr} at ${timeStr} GMT`;
}

async function main() {
  const state = await loadState(config.stateFile);
  const prefs = await getUserPreferences(config.preferencesFile, config.user.email);
  if (!prefs.autoSendDailyEmail && !config.forceWelcomeEmail) {
    console.log(`Gee skipped: daily email is OFF for ${prefs.email}.`);
    return;
  }

  const isFirstRun = config.forceWelcomeEmail || !state.firstRunCompleted;
  const { gmail, calendar } = createGoogleClients(config.google);
  const resend = createResendClient(config.resend.apiKey);

  const emailResult = await fetchRelevantEmails(gmail, state);

  const referencedDates = [...new Set(emailResult.emails.flatMap((e) => extractReferencedDates(`${e.subject}\n${e.body}`)))];
  const calendarContext = await fetchCalendarContext(calendar, referencedDates);

  const llm = createLlmClient(config.openai.apiKey);
  const plan = await synthesizeDailyPlan(llm, config.openai.model, {
    userName: config.user.name,
    nowIso: formatISO(new Date()),
    emails: emailResult.emails.slice(0, 35),
    calendar: calendarContext,
    isFirstRun,
  });

  const text = renderDailyEmail({
    userName: config.user.name,
    plan,
    isFirstRun,
    nextSendUtcText: nextSendUtcText(config.delivery.dailySendHourUtc),
  });

  const subject = isFirstRun
    ? `Welcome to Gee: your daily plan for ${new Date().toLocaleDateString()}`
    : `Daily plan for ${new Date().toLocaleDateString()}`;

  if (config.dryRun) {
    console.log('--- GEE DRY RUN ---');
    console.log(subject);
    console.log(text);
  } else {
    await sendSummaryEmail(resend, {
      to: config.delivery.toEmail,
      fromEmail: config.delivery.fromEmail,
      fromName: config.delivery.fromName,
      subject,
      plainText: text,
    });
  }

  await saveState(config.stateFile, {
    firstRunCompleted: true,
    lastRunAt: new Date().toISOString(),
    lastThreadIds: emailResult.threadIds,
  });

  console.log('Gee daily summary complete.');
}

main().catch((err) => {
  console.error('Gee failed:', err);
  process.exit(1);
});
