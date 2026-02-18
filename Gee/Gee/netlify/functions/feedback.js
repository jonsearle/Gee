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
    { value: 1, label: 'M' },
    { value: 2, label: 'T' },
    { value: 3, label: 'W' },
    { value: 4, label: 'T' },
    { value: 5, label: 'F' },
    { value: 6, label: 'S' },
    { value: 0, label: 'S' },
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
  return `<li class="theme-row">
    <span class="theme-chip">${esc(theme)}</span>
    <div class="theme-actions">
      <a class="action ${state === 'more' ? 'selected' : ''}" href="${esc(actionUrl(token, 'more', theme))}">More</a>
      <a class="action ${state === 'less' ? 'selected' : ''}" href="${esc(actionUrl(token, 'less', theme))}">Less</a>
      <details class="overflow-wrap">
        <summary class="overflow">...</summary>
        <div class="overflow-menu">
          <a class="danger-link" href="${esc(actionUrl(token, 'hidden', theme))}">Don't show me again</a>
          ${state !== 'neutral' ? `<a class="danger-link" href="${esc(actionUrl(token, 'neutral', theme))}">Clear preference</a>` : ''}
        </div>
      </details>
    </div>
  </li>`;
}

function preferencesPage({ token, prefs, activeThemes, hiddenThemes, message = '', error = '' }) {
  const dayButtons = daysOfWeek()
    .map((day) => `<label class="day-dot ${prefs.sendDaysUtc.includes(day.value) ? 'selected' : ''}">
      <input type="checkbox" name="send_days" value="${day.value}" ${prefs.sendDaysUtc.includes(day.value) ? 'checked' : ''}>
      <span>${day.label}</span>
    </label>`)
    .join('');

  const activeRows = activeThemes.length
    ? activeThemes.map((theme) => renderThemeRow(token, theme, prefs)).join('')
    : '<li class="empty">No recent themes yet. Themes appear here as you use G.</li>';

  const hiddenRows = hiddenThemes.length
    ? hiddenThemes.map((theme) => `<li class="theme-row">
      <span class="theme-chip">${esc(theme)}</span>
      <div class="theme-actions">
        <a class="action" href="${esc(actionUrl(token, 'neutral', theme))}">Show again</a>
      </div>
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
        --danger: #b42318;
      }
      body { margin: 0; background: radial-gradient(circle at top right, #dff5f2 0%, var(--bg) 40%); color: var(--ink); font: 15px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; }
      .wrap { max-width: 880px; margin: 0 auto; padding: 26px 18px 42px; }
      .card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; box-shadow: 0 5px 28px rgba(15, 23, 42, 0.05); padding: 22px; margin-bottom: 14px; }
      h1 { margin: 0 0 6px; font-size: 34px; line-height: 1.1; letter-spacing: -0.02em; }
      h2 { margin: 0 0 12px; font-size: 21px; letter-spacing: -0.01em; }
      p { margin: 0; color: var(--muted); }
      .status { margin-top: 12px; min-height: 20px; font-weight: 600; color: #0f5f58; }
      .status.error { color: #b42318; }
      .days { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
      .day-dot { width: 36px; height: 36px; border-radius: 999px; border: 1px solid var(--line); background: #f8fafc; color: #334155; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; position: relative; }
      .day-dot input { position: absolute; opacity: 0; pointer-events: none; }
      .day-dot.selected { background: var(--brand); border-color: var(--brand); color: #fff; }
      .save { margin-top: 14px; border: 1px solid var(--brand); background: var(--brand); color: #fff; border-radius: 9px; padding: 8px 12px; font-weight: 600; cursor: pointer; }
      ul { margin: 0; padding: 0; list-style: none; }
      .theme-row { display: flex; align-items: center; gap: 10px; border-top: 1px solid var(--line); padding: 11px 0; flex-wrap: wrap; }
      .theme-row:first-child { border-top: 0; padding-top: 0; }
      .theme-chip { background: #eef3ff; color: #1f2a55; border-radius: 999px; padding: 5px 10px; font-weight: 600; }
      .theme-actions { margin-left: auto; display: inline-flex; align-items: center; gap: 8px; }
      .action { text-decoration: none; color: #0f5f58; border: 1px solid #b7d9d5; background: #fff; border-radius: 8px; padding: 5px 10px; font-weight: 600; }
      .action.selected { background: var(--brand); border-color: var(--brand); color: #fff; }
      details.overflow-wrap { position: relative; }
      .overflow { border: 1px solid #d4dbe7; background: #fff; border-radius: 8px; width: 32px; height: 32px; cursor: pointer; color: #334155; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; list-style: none; }
      .overflow::-webkit-details-marker { display: none; }
      .overflow-menu { position: absolute; right: 0; top: 38px; background: #fff; border: 1px solid #d4dbe7; border-radius: 10px; padding: 6px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12); min-width: 180px; z-index: 20; display: grid; gap: 4px; }
      .danger-link { text-decoration: none; color: #9a3412; border-radius: 8px; padding: 7px 9px; font-weight: 600; }
      .danger-link:hover { background: #fff7ed; }
      .empty { color: var(--muted); }
    </style>
  </head>
  <body>
    <div class="wrap">
      <section class="card">
        <h1>Plan preferences</h1>
        <p>Set your email days and theme controls.</p>
        <div class="status ${error ? 'error' : ''}">${esc(error || message || '')}</div>
      </section>

      <section class="card">
        <h2>Email days</h2>
        <p>Pick the days you want G to send your plan.</p>
        <form method="post" action="/feedback">
          <input type="hidden" name="t" value="${esc(token)}">
          <div class="days">${dayButtons}</div>
          <button class="save" type="submit">Save changes</button>
        </form>
      </section>

      <section class="card">
        <h2>Theme controls</h2>
        <p>Use More or Less. Use ... to hide a theme.</p>
        <ul>${activeRows}</ul>
      </section>

      <section class="card">
        <h2>Hidden themes</h2>
        <ul>${hiddenRows}</ul>
      </section>
    </div>
  </body>
</html>`;
}

async function renderPreferences(repo, payload, token, message = '', error = '') {
  const prefs = await repo.getUserMasterPreferences(payload.userId);
  const recentThemes = await repo.getRecentThemesForUser(payload.userId, 35);
  const activeThemes = [...new Set([
    ...recentThemes,
    ...prefs.moreThemes,
    ...prefs.lessThemes,
  ])].filter((theme) => !prefs.hiddenThemes.includes(theme));

  return preferencesPage({
    token,
    prefs,
    activeThemes,
    hiddenThemes: prefs.hiddenThemes,
    message,
    error,
  });
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

    if (event.httpMethod === 'GET') {
      const action = String(event.queryStringParameters?.a || '').trim();
      const theme = String(event.queryStringParameters?.theme || '').trim();

      if (['more', 'less', 'hidden', 'neutral'].includes(action) && theme) {
        const result = await repo.setThemePreference(payload.userId, theme, action);
        await repo.createFeedbackEvent({
          userId: payload.userId,
          runId: payload.runId,
          feedbackType: `theme_${action}`,
          metadata: { theme: result.theme },
        });
        return html(200, await renderPreferences(repo, payload, token, `Saved: ${action} ${result.theme}`));
      }

      return html(200, await renderPreferences(repo, payload, token));
    }

    if (event.httpMethod === 'POST') {
      const body = parseBody(event);
      const sendDaysUtc = body
        .getAll('send_days')
        .map((x) => Number(x))
        .filter((x) => Number.isInteger(x) && x >= 0 && x <= 6);

      await repo.upsertMasterPreferences(payload.userId, { sendDaysUtc });
      await repo.createFeedbackEvent({
        userId: payload.userId,
        runId: payload.runId,
        feedbackType: 'set_send_days',
        metadata: { sendDaysUtc },
      });

      return html(200, await renderPreferences(repo, payload, token, 'Saved: preferences updated.'));
    }

    return html(405, '<p>Method not allowed.</p>');
  } catch (err) {
    return html(500, `<p>Preferences failed: ${esc(err.message || String(err))}</p>`);
  }
};
