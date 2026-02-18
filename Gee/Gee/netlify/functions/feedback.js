import { getAppEnv } from '../../src/netlify/env.js';
import { createRepository } from '../../src/repository.js';
import { verifyFeedbackToken } from '../../src/feedback-token.js';

function html(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body,
  };
}

function parseBody(event) {
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : String(event.body || '');
  return new URLSearchParams(raw);
}

function esc(text) {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function daysOfWeek() {
  return [
    { value: 0, label: 'Sun' },
    { value: 1, label: 'Mon' },
    { value: 2, label: 'Tue' },
    { value: 3, label: 'Wed' },
    { value: 4, label: 'Thu' },
    { value: 5, label: 'Fri' },
    { value: 6, label: 'Sat' },
  ];
}

function themeState(theme, prefs) {
  if (prefs.hiddenThemes.includes(theme)) return 'hidden';
  if (prefs.moreThemes.includes(theme)) return 'more';
  if (prefs.lessThemes.includes(theme)) return 'less';
  return 'neutral';
}

function actionUrl(token, action, theme) {
  return `/feedback?t=${encodeURIComponent(token)}&a=${encodeURIComponent(action)}&theme=${encodeURIComponent(theme)}`;
}

function renderThemeRow(token, theme, prefs) {
  const state = themeState(theme, prefs);
  const stateText = state === 'more'
    ? 'More'
    : state === 'less'
      ? 'Less'
      : state === 'hidden'
        ? 'Hidden'
        : 'Neutral';

  return `<li class="theme-row">
    <span class="theme-chip">${esc(theme)}</span>
    <span class="theme-state theme-state-${esc(state)}">${esc(stateText)}</span>
    <span class="theme-actions">
      <a class="action" href="${esc(actionUrl(token, 'more', theme))}">More</a>
      <a class="action" href="${esc(actionUrl(token, 'less', theme))}">Less</a>
      <a class="action danger" href="${esc(actionUrl(token, 'hidden', theme))}">Hidden</a>
    </span>
  </li>`;
}

function preferencesPage({ token, prefs, activeThemes, hiddenThemes, message = '' }) {
  const dayOptions = daysOfWeek()
    .map((day) => `<label class="day-pill">
      <input type="checkbox" name="send_days" value="${day.value}" ${prefs.sendDaysUtc.includes(day.value) ? 'checked' : ''}>
      <span>${day.label}</span>
    </label>`)
    .join('');

  const activeRows = activeThemes.length
    ? activeThemes.map((theme) => renderThemeRow(token, theme, prefs)).join('')
    : '<li class="empty">No recent themes yet. Themes will appear here once G sends more plans.</li>';

  const hiddenRows = hiddenThemes.length
    ? hiddenThemes.map((theme) => `<li class="theme-row">
      <span class="theme-chip">${esc(theme)}</span>
      <span class="theme-state theme-state-hidden">Hidden</span>
      <span class="theme-actions">
        <a class="action" href="${esc(actionUrl(token, 'reset', theme))}">Show again</a>
      </span>
    </li>`).join('')
    : '<li class="empty">No hidden themes.</li>';

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>G Preferences</title>
    <style>
      :root {
        --bg: #f5f7fb;
        --card: #ffffff;
        --ink: #111827;
        --muted: #4b5563;
        --line: #dbe3ef;
        --brand: #0f766e;
        --brand-soft: #e6f6f4;
        --danger: #b42318;
      }
      body { margin: 0; background: radial-gradient(circle at top right, #dff5f2 0%, var(--bg) 40%); color: var(--ink); font: 15px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; }
      .wrap { max-width: 880px; margin: 0 auto; padding: 26px 18px 42px; }
      .card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; box-shadow: 0 5px 28px rgba(15, 23, 42, 0.05); padding: 22px; margin-bottom: 14px; }
      h1 { margin: 0 0 6px; font-size: 34px; line-height: 1.1; letter-spacing: -0.02em; }
      h2 { margin: 0 0 12px; font-size: 21px; letter-spacing: -0.01em; }
      p { margin: 0; color: var(--muted); }
      .message { margin-top: 12px; background: var(--brand-soft); border: 1px solid #b4e7e1; color: #0f5f58; border-radius: 10px; padding: 10px 12px; font-weight: 500; }
      .days { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
      .day-pill { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--line); background: #f8fafc; border-radius: 999px; padding: 6px 10px; }
      .day-pill input { margin: 0; }
      .save { margin-top: 12px; background: var(--brand); color: #fff; border: 0; border-radius: 9px; padding: 8px 14px; font-weight: 600; cursor: pointer; }
      ul { margin: 0; padding: 0; list-style: none; }
      .theme-row { display: flex; align-items: center; gap: 10px; border-top: 1px solid var(--line); padding: 11px 0; flex-wrap: wrap; }
      .theme-row:first-child { border-top: 0; padding-top: 0; }
      .theme-chip { background: #eef3ff; color: #1f2a55; border-radius: 999px; padding: 5px 10px; font-weight: 600; }
      .theme-state { border-radius: 999px; padding: 4px 9px; font-size: 12px; font-weight: 600; }
      .theme-state-more { background: #e7f8ee; color: #166534; }
      .theme-state-less { background: #fff7ed; color: #9a3412; }
      .theme-state-hidden { background: #fef2f2; color: #991b1b; }
      .theme-state-neutral { background: #eef2f7; color: #334155; }
      .theme-actions { margin-left: auto; display: inline-flex; gap: 8px; }
      .action { text-decoration: none; color: #0f5f58; border: 1px solid #b7d9d5; border-radius: 8px; padding: 5px 9px; font-weight: 600; }
      .action.danger { color: var(--danger); border-color: #f3b8b2; }
      .empty { color: var(--muted); }
    </style>
  </head>
  <body>
    <div class="wrap">
      <section class="card">
        <h1>Plan preferences</h1>
        <p>Choose your delivery days and tune themes. These settings shape all future daily plans.</p>
        ${message ? `<div class="message">${esc(message)}</div>` : ''}
      </section>

      <section class="card">
        <h2>Email days</h2>
        <p>Select the days when G should email your plan.</p>
        <form method="post" action="/feedback">
          <input type="hidden" name="t" value="${esc(token)}">
          <div class="days">${dayOptions}</div>
          <button class="save" type="submit">Save day preferences</button>
        </form>
      </section>

      <section class="card">
        <h2>Theme controls</h2>
        <p>Use More, Less, or Hidden to steer what appears in your plan.</p>
        <ul>${activeRows}</ul>
      </section>

      <section class="card">
        <h2>Hidden themes</h2>
        <p>Themes you asked us not to show. You can restore them here.</p>
        <ul>${hiddenRows}</ul>
      </section>
    </div>
  </body>
</html>`;
}

export const handler = async (event) => {
  try {
    const appEnv = getAppEnv();
    const token = String(
      event.httpMethod === 'POST'
        ? parseBody(event).get('t') || ''
        : event.queryStringParameters?.t || '',
    );
    const payload = verifyFeedbackToken(token, appEnv.security.sessionSecret);
    if (!payload) return html(400, '<p>Invalid or expired preferences link.</p>');

    const repo = createRepository({
      supabaseUrl: appEnv.supabase.url,
      supabaseServiceRoleKey: appEnv.supabase.serviceRoleKey,
    });

    let message = '';

    if (event.httpMethod === 'GET') {
      const action = String(event.queryStringParameters?.a || '').trim();
      const theme = String(event.queryStringParameters?.theme || '').trim();

      if (['more', 'less', 'hidden', 'reset'].includes(action) && theme) {
        const preference = action === 'reset' ? 'neutral' : action;
        const result = await repo.setThemePreference(payload.userId, theme, preference);
        await repo.createFeedbackEvent({
          userId: payload.userId,
          runId: payload.runId,
          feedbackType: `theme_${action}`,
          metadata: { theme: result.theme },
        });
        message = action === 'reset'
          ? `Theme restored: ${result.theme}`
          : `Saved: ${action} ${result.theme}`;
      }

      const prefs = await repo.getUserMasterPreferences(payload.userId);
      const recentThemes = await repo.getRecentThemesForUser(payload.userId, 35);
      const activeThemes = [...new Set([
        ...recentThemes,
        ...prefs.moreThemes,
        ...prefs.lessThemes,
      ])].filter((theme) => !prefs.hiddenThemes.includes(theme));

      return html(200, preferencesPage({
        token,
        prefs,
        activeThemes,
        hiddenThemes: prefs.hiddenThemes,
        message,
      }));
    }

    if (event.httpMethod === 'POST') {
      const body = parseBody(event);
      const sendDaysUtc = body
        .getAll('send_days')
        .map((x) => Number(x))
        .filter((x) => Number.isInteger(x) && x >= 0 && x <= 6);

      await repo.upsertMasterPreferences(payload.userId, { sendDaysUtc });
      const prefs = await repo.getUserMasterPreferences(payload.userId);
      const recentThemes = await repo.getRecentThemesForUser(payload.userId, 35);
      const activeThemes = [...new Set([
        ...recentThemes,
        ...prefs.moreThemes,
        ...prefs.lessThemes,
      ])].filter((theme) => !prefs.hiddenThemes.includes(theme));

      return html(200, preferencesPage({
        token,
        prefs,
        activeThemes,
        hiddenThemes: prefs.hiddenThemes,
        message: 'Delivery days saved.',
      }));
    }

    return html(405, '<p>Method not allowed.</p>');
  } catch (err) {
    return html(500, `<p>Preferences failed: ${esc(err.message || String(err))}</p>`);
  }
};
