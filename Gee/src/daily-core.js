import { formatISO } from 'date-fns';
import fs from 'node:fs/promises';
import { createGoogleClients } from './google.js';
import { fetchRelevantEmails } from './gmail.js';
import { extractReferencedDates } from './cleaner.js';
import { fetchCalendarContext } from './calendar.js';
import { createLlmClient, synthesizeDailyPlan } from './llm.js';
import { renderDailyEmail, renderDailyEmailHtml } from './renderer.js';
import { createResendClient, sendSummaryEmail } from './resend.js';

function formatHumanDateUtc(d) {
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(d);
  const month = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(d);
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${weekday} ${day} ${month}`;
}

function utcMidnight(d) {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

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

  const timeStr = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC',
  }).format(next);
  const daysAway = Math.round((utcMidnight(next) - utcMidnight(now)) / (24 * 60 * 60 * 1000));

  if (daysAway === 1) return `tomorrow at ${timeStr} GMT`;
  return `${formatHumanDateUtc(next)} at ${timeStr} GMT`;
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
  const html = renderDailyEmailHtml({
    userName: user.name,
    plan,
    isFirstRun,
    nextSendUtcText: nextSendUtcText(user.sendHourUtc),
  });

  const todayHuman = formatHumanDateUtc(new Date());
  const subject = isFirstRun
    ? `Welcome to G: your daily plan for ${todayHuman}`
    : `Daily plan for ${todayHuman}`;

  if (dryRun) {
    console.log(`--- GEE DRY RUN (${user.email}) ---`);
    console.log(subject);
    console.log(text);
    await fs.writeFile('.gee-last-email-preview.txt', `${subject}\n\n${text}\n`, 'utf8');
    await fs.writeFile('.gee-last-email-preview.html', html, 'utf8');
    console.log('Wrote preview files: .gee-last-email-preview.txt, .gee-last-email-preview.html');
  } else {
    await sendSummaryEmail(resend, {
      to: user.toEmail,
      fromEmail: appConfig.delivery.fromEmail,
      fromName: appConfig.delivery.fromName,
      subject,
      plainText: text,
      html,
    });
  }

  return {
    firstRunCompleted: true,
    lastRunAt: new Date().toISOString(),
    lastThreadIds: emailResult.threadIds,
  };
}
