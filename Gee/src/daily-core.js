import { formatISO } from 'date-fns';
import { createGoogleClients } from './google.js';
import { fetchRelevantEmails } from './gmail.js';
import { extractReferencedDates } from './cleaner.js';
import { fetchCalendarContext } from './calendar.js';
import { createLlmClient, synthesizeDailyPlan } from './llm.js';
import { renderDailyEmail } from './renderer.js';
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
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  }).format(next);
  const timeStr = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC',
  }).format(next);

  return `${dateStr} at ${timeStr} GMT`;
}

export async function runForUser({
  appConfig,
  user,
  refreshToken,
  state,
  forceWelcomeEmail = false,
  dryRun = false,
}) {
  const isFirstRun = forceWelcomeEmail || !state.firstRunCompleted;

  const { gmail, calendar } = createGoogleClients(appConfig.google, refreshToken);
  const llm = createLlmClient(appConfig.openai.apiKey);
  const resend = createResendClient(appConfig.resend.apiKey);

  const emailResult = await fetchRelevantEmails(gmail, {
    firstRunCompleted: Boolean(state.firstRunCompleted),
    lastRunAt: state.lastRunAt || null,
    lastThreadIds: Array.isArray(state.lastThreadIds) ? state.lastThreadIds : [],
  });

  const referencedDates = [...new Set(emailResult.emails.flatMap((e) => extractReferencedDates(`${e.subject}\n${e.body}`)))];
  const calendarContext = await fetchCalendarContext(calendar, referencedDates);

  const plan = await synthesizeDailyPlan(llm, appConfig.openai.model, {
    userName: user.name,
    nowIso: formatISO(new Date()),
    emails: emailResult.emails.slice(0, 35),
    calendar: calendarContext,
    isFirstRun,
  });

  const text = renderDailyEmail({
    userName: user.name,
    plan,
    isFirstRun,
    nextSendUtcText: nextSendUtcText(user.sendHourUtc),
  });

  const subject = isFirstRun
    ? `Welcome to Gee: your daily plan for ${new Date().toLocaleDateString()}`
    : `Daily plan for ${new Date().toLocaleDateString()}`;

  if (dryRun) {
    console.log(`--- GEE DRY RUN (${user.email}) ---`);
    console.log(subject);
    console.log(text);
  } else {
    await sendSummaryEmail(resend, {
      to: user.toEmail,
      fromEmail: appConfig.delivery.fromEmail,
      fromName: appConfig.delivery.fromName,
      subject,
      plainText: text,
    });
  }

  return {
    firstRunCompleted: true,
    lastRunAt: new Date().toISOString(),
    lastThreadIds: emailResult.threadIds,
  };
}
