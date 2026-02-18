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

function renderThemeRow(theme, state) {
  return `<li class="theme-row" data-theme="${esc(theme)}" data-state="${esc(state)}">
    <span class="theme-chip">${esc(theme)}</span>
    <div class="theme-actions">
      <button type="button" class="action ${state === 'more' ? 'selected' : ''}" data-pref="more">More</button>
      <button type="button" class="action ${state === 'less' ? 'selected' : ''}" data-pref="less">Less</button>
      <details class="overflow-wrap">
        <summary class="overflow">...</summary>
        <div class="overflow-menu">
          <button type="button" class="danger-link" data-pref="hidden">Don't show me again</button>
          ${state !== 'neutral' ? '<button type="button" class="danger-link" data-pref="neutral">Clear preference</button>' : ''}
        </div>
      </details>
    </div>
  </li>`;
}

function preferencesPage({ token, prefs, activeThemes, hiddenThemes, message = '', error = '' }) {
  const dayButtons = daysOfWeek()
    .map((day) => `<button type="button" class="day-dot ${prefs.sendDaysUtc.includes(day.value) ? 'selected' : ''}" data-day="${day.value}">${day.label}</button>`)
    .join('');

  const activeRows = activeThemes.length
    ? activeThemes.map((theme) => renderThemeRow(theme, themeState(theme, prefs))).join('')
    : '<li class="empty">No recent themes yet. Themes appear here as you use G.</li>';

  const hiddenRows = hiddenThemes.length
    ? hiddenThemes.map((theme) => `<li class="theme-row" data-theme="${esc(theme)}" data-state="hidden">
      <span class="theme-chip">${esc(theme)}</span>
      <div class="theme-actions">
        <button type="button" class="action" data-pref="neutral">Show again</button>
      </div>
    </li>`).join('')
    : '<li class="empty" id="noHidden">No hidden themes.</li>';

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>G Preferences</title>
    <style>
      :root { --bg:#f5f7fb; --card:#fff; --ink:#111827; --muted:#4b5563; --line:#dbe3ef; --brand:#0f766e; }
      body { margin:0; background:radial-gradient(circle at top right,#dff5f2 0%,var(--bg) 40%); color:var(--ink); font:15px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif; }
      .wrap { max-width:880px; margin:0 auto; padding:26px 18px 120px; }
      .card { background:var(--card); border:1px solid var(--line); border-radius:16px; box-shadow:0 5px 28px rgba(15,23,42,.05); padding:22px; margin-bottom:14px; }
      h1 { margin:0 0 6px; font-size:34px; line-height:1.1; letter-spacing:-.02em; }
      h2 { margin:0 0 12px; font-size:21px; letter-spacing:-.01em; }
      p { margin:0; color:var(--muted); }
      .status { margin-top:12px; min-height:20px; font-weight:600; color:#0f5f58; }
      .status.error { color:#b42318; }
      .days { display:flex; flex-wrap:wrap; gap:10px; margin-top:14px; }
      .day-dot { width:36px; height:36px; border-radius:999px; border:1px solid var(--line); background:#f8fafc; color:#334155; font-weight:700; cursor:pointer; }
      .day-dot.selected { background:var(--brand); border-color:var(--brand); color:#fff; }
      ul { margin:0; padding:0; list-style:none; }
      .theme-row { display:flex; align-items:center; gap:10px; border-top:1px solid var(--line); padding:11px 0; flex-wrap:wrap; }
      .theme-row:first-child { border-top:0; padding-top:0; }
      .theme-chip { background:#eef3ff; color:#1f2a55; border-radius:999px; padding:5px 10px; font-weight:600; }
      .theme-actions { margin-left:auto; display:inline-flex; align-items:center; gap:8px; }
      .action { color:#0f5f58; border:1px solid #b7d9d5; background:#fff; border-radius:8px; padding:5px 10px; font-weight:600; cursor:pointer; }
      .action.selected { background:var(--brand); border-color:var(--brand); color:#fff; }
      details.overflow-wrap { position:relative; }
      .overflow { border:1px solid #d4dbe7; background:#fff; border-radius:8px; width:32px; height:32px; cursor:pointer; color:#334155; font-weight:700; display:inline-flex; align-items:center; justify-content:center; list-style:none; }
      .overflow::-webkit-details-marker { display:none; }
      .overflow-menu { position:absolute; right:0; top:38px; background:#fff; border:1px solid #d4dbe7; border-radius:10px; padding:6px; box-shadow:0 8px 24px rgba(15,23,42,.12); min-width:180px; z-index:20; display:grid; gap:4px; }
      .danger-link { border:0; background:#fff; text-align:left; color:#9a3412; border-radius:8px; padding:7px 9px; font-weight:600; cursor:pointer; }
      .danger-link:hover { background:#fff7ed; }
      .save-bar { position:fixed; left:0; right:0; bottom:0; background:rgba(15,23,42,.92); backdrop-filter:blur(4px); padding:14px 18px; display:none; }
      .save-bar.visible { display:block; }
      .save-inner { max-width:880px; margin:0 auto; display:flex; align-items:center; justify-content:space-between; gap:12px; }
      .save-copy { color:#e5e7eb; font-weight:600; }
      .save-btn { border:1px solid #0ea5a0; background:#0f766e; color:#fff; border-radius:10px; padding:12px 18px; font-weight:700; font-size:16px; cursor:pointer; }
      .empty { color:var(--muted); }
      .hidden { display:none !important; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <section class="card">
        <h1>Plan preferences</h1>
        <p>Update your email days and theme controls.</p>
        <div class="status ${error ? 'error' : ''}">${esc(error || message || '')}</div>
      </section>

      <form id="prefsForm" method="post" action="/feedback">
        <input type="hidden" name="t" value="${esc(token)}">
        <div id="dynamicFields"></div>

        <section class="card">
          <h2>Email days</h2>
          <p>Pick the days you want G to send your plan.</p>
          <div class="days" id="dayToggles">${dayButtons}</div>
        </section>

        <section class="card">
          <h2>Theme controls</h2>
          <p>Use More or Less. Use ... to hide a theme.</p>
          <ul id="activeThemes">${activeRows}</ul>
        </section>

        <section class="card">
          <h2>Hidden themes</h2>
          <ul id="hiddenThemes">${hiddenRows}</ul>
        </section>
      </form>
    </div>

    <div class="save-bar" id="saveBar">
      <div class="save-inner">
        <div class="save-copy">You have unsaved changes</div>
        <button type="submit" form="prefsForm" class="save-btn">Save changes</button>
      </div>
    </div>

    <script>
      (() => {
        const form = document.getElementById('prefsForm');
        const saveBar = document.getElementById('saveBar');
        const dynamicFields = document.getElementById('dynamicFields');
        const activeList = document.getElementById('activeThemes');
        const hiddenList = document.getElementById('hiddenThemes');
        let dirty = false;

        function setDirty() {
          dirty = true;
          saveBar.classList.add('visible');
        }

        function setRowState(row, state) {
          row.setAttribute('data-state', state);
          const more = row.querySelector('[data-pref="more"]');
          const less = row.querySelector('[data-pref="less"]');
          if (more) more.classList.toggle('selected', state === 'more');
          if (less) less.classList.toggle('selected', state === 'less');
        }

        function moveToHidden(row) {
          const empty = hiddenList.querySelector('#noHidden');
          if (empty) empty.remove();
          row.remove();
          const showAgain = document.createElement('li');
          showAgain.className = 'theme-row';
          showAgain.setAttribute('data-theme', row.getAttribute('data-theme'));
          showAgain.setAttribute('data-state', 'hidden');
          showAgain.innerHTML = '<span class="theme-chip">'
            + row.querySelector('.theme-chip').textContent
            + '</span><div class="theme-actions"><button type="button" class="action" data-pref="neutral">Show again</button></div>';
          hiddenList.prepend(showAgain);
        }

        function moveToActive(row) {
          row.remove();
          const theme = row.getAttribute('data-theme');
          const li = document.createElement('li');
          li.className = 'theme-row';
          li.setAttribute('data-theme', theme);
          li.setAttribute('data-state', 'neutral');
          li.innerHTML = '<span class="theme-chip">'
            + row.querySelector('.theme-chip').textContent
            + '</span><div class="theme-actions"><button type="button" class="action" data-pref="more">More</button><button type="button" class="action" data-pref="less">Less</button><details class="overflow-wrap"><summary class="overflow">...</summary><div class="overflow-menu"><button type="button" class="danger-link" data-pref="hidden">Don\\'t show me again</button></div></details></div>';
          activeList.prepend(li);
        }

        document.addEventListener('click', (event) => {
          const day = event.target.closest('.day-dot');
          if (day) {
            day.classList.toggle('selected');
            setDirty();
            return;
          }

          const prefBtn = event.target.closest('[data-pref]');
          if (!prefBtn) return;

          const row = prefBtn.closest('.theme-row');
          if (!row) return;
          const pref = prefBtn.getAttribute('data-pref');

          if (pref === 'hidden') {
            moveToHidden(row);
            setDirty();
            return;
          }

          if (pref === 'neutral' && row.parentElement?.id === 'hiddenThemes') {
            moveToActive(row);
            setDirty();
            return;
          }

          if (pref === 'more' || pref === 'less') {
            const next = row.getAttribute('data-state') === pref ? 'neutral' : pref;
            setRowState(row, next);
            setDirty();
            return;
          }

          if (pref === 'neutral') {
            setRowState(row, 'neutral');
            setDirty();
          }
        });

        form.addEventListener('submit', () => {
          dynamicFields.innerHTML = '';

          for (const el of document.querySelectorAll('.day-dot.selected')) {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = 'send_days';
            input.value = el.getAttribute('data-day');
            dynamicFields.appendChild(input);
          }

          for (const row of document.querySelectorAll('.theme-row[data-theme]')) {
            const theme = row.getAttribute('data-theme');
            const state = row.getAttribute('data-state') || 'neutral';
            if (!theme || state === 'neutral') continue;

            const input = document.createElement('input');
            input.type = 'hidden';
            input.value = theme;

            if (state === 'more') input.name = 'more_themes';
            if (state === 'less') input.name = 'less_themes';
            if (state === 'hidden') input.name = 'hidden_themes';
            if (input.name) dynamicFields.appendChild(input);
          }
        });
      })();
    </script>
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

    if (event.httpMethod === 'POST') {
      const body = parseBody(event);
      const sendDaysUtc = body.getAll('send_days').map((x) => Number(x)).filter((x) => Number.isInteger(x) && x >= 0 && x <= 6);
      const moreThemes = body.getAll('more_themes');
      const lessThemes = body.getAll('less_themes');
      const hiddenThemes = body.getAll('hidden_themes');

      await repo.upsertMasterPreferences(payload.userId, {
        sendDaysUtc,
        moreThemes,
        lessThemes,
        hiddenThemes,
      });

      await repo.createFeedbackEvent({
        userId: payload.userId,
        runId: payload.runId,
        feedbackType: 'set_master_preferences',
        metadata: {
          sendDaysUtc,
          moreCount: moreThemes.length,
          lessCount: lessThemes.length,
          hiddenCount: hiddenThemes.length,
        },
      });

      return html(200, await renderPreferences(repo, payload, token, 'Saved: preferences updated.'));
    }

    return html(200, await renderPreferences(repo, payload, token));
  } catch (err) {
    return html(500, `<p>Preferences failed: ${esc(err.message || String(err))}</p>`);
  }
};
