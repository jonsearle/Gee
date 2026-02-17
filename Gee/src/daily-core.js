import { formatISO } from 'date-fns';
import fs from 'node:fs/promises';
import { createGoogleClients } from './google.js';
import { fetchRelevantEmails } from './gmail.js';
import { extractReferencedDates } from './cleaner.js';
import { fetchCalendarContext } from './calendar.js';
import { createLlmClient, synthesizeDailyPlan } from './llm.js';
import { renderDailyEmail, renderDailyEmailHtml } from './renderer.js';
import { createResendClient, sendSummaryEmail } from './resend.js';
import { createFeedbackToken } from './feedback-token.js';

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
  repo = null,
  forceWelcomeEmail = false,
  dryRun = false,
}) {
  const isFirstRun = forceWelcomeEmail || !state.firstRunCompleted;

  const { gmail, calendar } = createGoogleClients(appConfig.google, refreshToken);
  const llm = createLlmClient(appConfig.openai.apiKey);
  const resend = createResendClient(appConfig.resend.apiKey);
  const userPromptPreferences = repo && user.id
    ? await repo.getUserPromptPreferences(user.id)
    : null;

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
    userPreferences: userPromptPreferences
      ? {
        planningConstraints: userPromptPreferences.planning_constraints || {},
        preferredSections: Array.isArray(userPromptPreferences.preferred_sections)
          ? userPromptPreferences.preferred_sections
          : [],
        suppressedSections: Array.isArray(userPromptPreferences.suppressed_sections)
          ? userPromptPreferences.suppressed_sections
          : [],
        tonePrefs: userPromptPreferences.tone_prefs || {},
      }
      : null,
  });

  const todayHuman = formatHumanDateUtc(new Date());
  const subject = isFirstRun
    ? `Welcome to G: your daily plan for ${todayHuman}`
    : `Daily plan for ${todayHuman}`;

  let feedbackLinks = null;
  if (!dryRun && repo && user.id) {
    const run = await repo.createDailyRun({
      userId: user.id,
      subject,
      model: appConfig.openai.model,
      planJson: plan,
    });

    await repo.createRunSections(run.id, [
      {
        sectionKey: 'focus',
        title: 'Focus for today',
        confidence: 0.8,
        contentJson: { contextSentence: plan.contextSentence, microNudge: plan.microNudge },
      },
      {
        sectionKey: 'main_things',
        title: 'Main things to get done today',
        confidence: 0.8,
        contentJson: { mainThings: plan.mainThings },
      },
      {
        sectionKey: 'can_wait',
        title: 'Things that can safely wait',
        confidence: 0.75,
        contentJson: { canWait: plan.canWait },
      },
      {
        sectionKey: 'efficiency',
        title: 'Efficiency suggestions',
        confidence: 0.7,
        contentJson: { efficiencySuggestions: plan.efficiencySuggestions },
      },
    ]);

    const secret = appConfig.security?.sessionSecret || appConfig.web?.sessionSecret || '';
    const baseUrl = appConfig.web?.baseUrl || '';
    if (secret && baseUrl) {
      const token = createFeedbackToken({
        userId: user.id,
        runId: run.id,
        expiresAt: Date.now() + (14 * 24 * 60 * 60 * 1000),
      }, secret);
      const base = `${baseUrl.replace(/\/$/, '')}/feedback?t=${encodeURIComponent(token)}`;
      feedbackLinks = {
        helpful: `${base}&a=helpful`,
        notHelpful: `${base}&a=not_helpful`,
        detailed: base,
      };
    }
  }

  const text = renderDailyEmail({
    userName: user.name,
    plan,
    isFirstRun,
    nextSendUtcText: nextSendUtcText(user.sendHourUtc),
    feedbackLinks,
  });
  const html = renderDailyEmailHtml({
    userName: user.name,
    plan,
    isFirstRun,
    nextSendUtcText: nextSendUtcText(user.sendHourUtc),
    feedbackLinks,
  });

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
