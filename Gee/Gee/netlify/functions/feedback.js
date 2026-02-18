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

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  };
}

function parseBody(event) {
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : String(event.body || '');
  return new URLSearchParams(raw);
}

function parseJsonBody(event) {
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : String(event.body || '');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
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

function selectedClass(state, target) {
  return state === target ? 'selected' : '';
}

function renderThemeRow(theme, prefs) {
  const state = themeState(theme, prefs);
  return `<li class="theme-row" data-theme="${esc(theme)}">
    <span class="theme-chip">${esc(theme)}</span>
    <div class="theme-actions">
      <button type="button" class="action ${selectedClass(state, 'more')}" data-pref="more">More</button>
      <button type="button" class="action ${selectedClass(state, 'less')}" data-pref="less">Less</button>
      <div class="overflow-wrap">
        <button type="button" class="overflow" data-role="menu-toggle" aria-label="Theme options">...</button>
        <div class="overflow-menu" data-role="menu" hidden>
          <button type="button" class="danger-link" data-pref="hidden">Don't show me again</button>
          ${state !== 'neutral' ? '<button type="button" class="danger-link" data-pref="neutral">Clear preference</button>' : ''}
        </div>
      </div>
    </div>
  </li>`;
}

function preferencesPage({ token, prefs, activeThemes, hiddenThemes }) {
  const dayButtons = daysOfWeek()
    .map((day) => `<button type="button" class="day-dot ${prefs.sendDaysUtc.includes(day.value) ? 'selected' : ''}" data-day="${day.value}" aria-label="${day.label}">${day.label}</button>`)
    .join('');

  const activeRows = activeThemes.length
    ? activeThemes.map((theme) => renderThemeRow(theme, prefs)).join('')
    : '<li class="empty">No recent themes yet. Themes appear here as you use G.</li>';

  const hiddenRows = hiddenThemes.length
    ? hiddenThemes.map((theme) => `<li class="theme-row" data-theme="${esc(theme)}">
      <span class="theme-chip">${esc(theme)}</span>
      <div class="theme-actions">
        <button type="button" class="action" data-pref="neutral">Show again</button>
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
        --brand-soft: #e6f6f4;
        --danger: #b42318;
      }
      body { margin: 0; background: radial-gradient(circle at top right, #dff5f2 0%, var(--bg) 40%); color: var(--ink); font: 15px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; }
      .wrap { max-width: 880px; margin: 0 auto; padding: 26px 18px 42px; }
      .card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; box-shadow: 0 5px 28px rgba(15, 23, 42, 0.05); padding: 22px; margin-bottom: 14px; }
      h1 { margin: 0 0 6px; font-size: 34px; line-height: 1.1; letter-spacing: -0.02em; }
      h2 { margin: 0 0 12px; font-size: 21px; letter-spacing: -0.01em; }
      p { margin: 0; color: var(--muted); }
      .sync { margin-top: 12px; color: #0f5f58; font-weight: 600; min-height: 20px; }
      .days { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
      .day-dot { width: 36px; height: 36px; border-radius: 999px; border: 1px solid var(--line); background: #f8fafc; color: #334155; font-weight: 700; cursor: pointer; }
      .day-dot.selected { background: var(--brand); border-color: var(--brand); color: #fff; }
      ul { margin: 0; padding: 0; list-style: none; }
      .theme-row { display: flex; align-items: center; gap: 10px; border-top: 1px solid var(--line); padding: 11px 0; flex-wrap: wrap; }
      .theme-row:first-child { border-top: 0; padding-top: 0; }
      .theme-chip { background: #eef3ff; color: #1f2a55; border-radius: 999px; padding: 5px 10px; font-weight: 600; }
      .theme-actions { margin-left: auto; display: inline-flex; align-items: center; gap: 8px; }
      .action { text-decoration: none; color: #0f5f58; border: 1px solid #b7d9d5; background: #fff; border-radius: 8px; padding: 5px 10px; font-weight: 600; cursor: pointer; }
      .action.selected { background: var(--brand); border-color: var(--brand); color: #fff; }
      .overflow-wrap { position: relative; }
      .overflow { border: 1px solid #d4dbe7; background: #fff; border-radius: 8px; width: 32px; height: 32px; cursor: pointer; color: #334155; font-weight: 700; }
      .overflow-menu { position: absolute; right: 0; top: 38px; background: #fff; border: 1px solid #d4dbe7; border-radius: 10px; padding: 6px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12); min-width: 170px; z-index: 20; }
      .danger-link { display: block; width: 100%; text-align: left; border: 0; background: #fff; color: #9a3412; border-radius: 8px; padding: 7px 9px; cursor: pointer; font-weight: 600; }
      .danger-link:hover { background: #fff7ed; }
      .empty { color: var(--muted); }
    </style>
  </head>
  <body>
    <div class="wrap" data-token="${esc(token)}">
      <section class="card">
        <h1>Plan preferences</h1>
        <p>Set your email days and theme controls. Changes save automatically.</p>
        <div class="sync" id="syncState"></div>
      </section>

      <section class="card">
        <h2>Email days</h2>
        <p>Pick the days you want G to send your plan.</p>
        <div class="days" id="dayToggles">${dayButtons}</div>
      </section>

      <section class="card">
        <h2>Theme controls</h2>
        <p>Use More or Less. Use ... for hidden.</p>
        <ul id="activeThemes">${activeRows}</ul>
      </section>

      <section class="card">
        <h2>Hidden themes</h2>
        <ul id="hiddenThemes">${hiddenRows}</ul>
      </section>
    </div>

    <script>
      (() => {
        const root = document.querySelector('[data-token]');
        const token = root?.getAttribute('data-token') || '';
        const syncState = document.getElementById('syncState');
        let inflight = 0;

        function setSync(text, isError = false) {
          syncState.textContent = text;
          syncState.style.color = isError ? '#b42318' : '#0f5f58';
        }

        function beginSync() {
          inflight += 1;
          setSync('Saving...');
        }

        function endSync(ok = true) {
          inflight = Math.max(0, inflight - 1);
          if (inflight === 0) setSync(ok ? 'Saved' : 'Unable to save');
        }

        async function save(payload, onRevert) {
          beginSync();
          try {
            const res = await fetch('/feedback', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ token, ...payload }),
            });
            if (!res.ok) throw new Error('Failed');
            endSync(true);
          } catch {
            if (typeof onRevert === 'function') onRevert();
            endSync(false);
          }
        }

        function updateThemeSelection(row, pref) {
          const more = row.querySelector('[data-pref="more"]');
          const less = row.querySelector('[data-pref="less"]');
          more?.classList.toggle('selected', pref === 'more');
          less?.classList.toggle('selected', pref === 'less');
        }

        document.addEventListener('click', (event) => {
          const toggle = event.target.closest('[data-role="menu-toggle"]');
          if (toggle) {
            const menu = toggle.parentElement.querySelector('[data-role="menu"]');
            if (menu) menu.hidden = !menu.hidden;
            return;
          }

          const dayButton = event.target.closest('.day-dot');
          if (dayButton) {
            dayButton.classList.toggle('selected');
            const selected = [...document.querySelectorAll('.day-dot.selected')].map((el) => Number(el.getAttribute('data-day')));
            save({ op: 'set_days', sendDaysUtc: selected }, () => dayButton.classList.toggle('selected'));
            return;
          }

          const prefButton = event.target.closest('[data-pref]');
          if (!prefButton) {
            document.querySelectorAll('[data-role="menu"]').forEach((menu) => { menu.hidden = true; });
            return;
          }

          const row = prefButton.closest('.theme-row');
          const theme = row?.getAttribute('data-theme');
          const pref = prefButton.getAttribute('data-pref');
          if (!row || !theme || !pref) return;

          const previous = {
            more: row.querySelector('[data-pref="more"]')?.classList.contains('selected') || false,
            less: row.querySelector('[data-pref="less"]')?.classList.contains('selected') || false,
            parentId: row.parentElement?.id || '',
          };

          if (pref === 'hidden') {
            row.remove();
            const hiddenList = document.getElementById('hiddenThemes');
            const li = document.createElement('li');
            li.className = 'theme-row';
            li.setAttribute('data-theme', theme);
            li.innerHTML = '<span class="theme-chip"></span><div class="theme-actions"><button type="button" class="action" data-pref="neutral">Show again</button></div>';
            li.querySelector('.theme-chip').textContent = theme;
            hiddenList.prepend(li);
            save({ op: 'set_theme', theme, preference: 'hidden' }, () => {
              li.remove();
              const active = document.getElementById('activeThemes');
              active.prepend(row);
              updateThemeSelection(row, previous.more ? 'more' : previous.less ? 'less' : 'neutral');
            });
            return;
          }

          if (pref === 'neutral' && previous.parentId === 'hiddenThemes') {
            row.remove();
            const active = document.getElementById('activeThemes');
            const li = document.createElement('li');
            li.className = 'theme-row';
            li.setAttribute('data-theme', theme);
            li.innerHTML = '<span class="theme-chip"></span><div class="theme-actions"><button type="button" class="action" data-pref="more">More</button><button type="button" class="action" data-pref="less">Less</button><div class="overflow-wrap"><button type="button" class="overflow" data-role="menu-toggle" aria-label="Theme options">...</button><div class="overflow-menu" data-role="menu" hidden><button type="button" class="danger-link" data-pref="hidden">Don\'t show me again</button></div></div></div>';
            li.querySelector('.theme-chip').textContent = theme;
            active.prepend(li);
            save({ op: 'set_theme', theme, preference: 'neutral' }, () => {
              li.remove();
              document.getElementById('hiddenThemes').prepend(row);
            });
            return;
          }

          const nextPref = pref === 'more' || pref === 'less' ? pref : 'neutral';
          updateThemeSelection(row, nextPref);
          const menu = row.querySelector('[data-role="menu"]');
          if (menu) menu.hidden = true;
          save({ op: 'set_theme', theme, preference: nextPref }, () => {
            updateThemeSelection(row, previous.more ? 'more' : previous.less ? 'less' : 'neutral');
          });
        });
      })();
    </script>
  </body>
</html>`;
}

export const handler = async (event) => {
  try {
    const appEnv = getAppEnv();

    if (event.httpMethod === 'POST' && String(event.headers?.['content-type'] || '').includes('application/json')) {
      const body = parseJsonBody(event);
      const token = String(body.token || '');
      const payload = verifyFeedbackToken(token, appEnv.security.sessionSecret);
      if (!payload) return json(400, { error: 'invalid token' });

      const repo = createRepository({
        supabaseUrl: appEnv.supabase.url,
        supabaseServiceRoleKey: appEnv.supabase.serviceRoleKey,
      });

      if (body.op === 'set_days') {
        const sendDaysUtc = (Array.isArray(body.sendDaysUtc) ? body.sendDaysUtc : [])
          .map((x) => Number(x))
          .filter((x) => Number.isInteger(x) && x >= 0 && x <= 6);
        await repo.upsertMasterPreferences(payload.userId, { sendDaysUtc });
        await repo.createFeedbackEvent({
          userId: payload.userId,
          runId: payload.runId,
          feedbackType: 'set_send_days',
          metadata: { sendDaysUtc },
        });
        return json(200, { ok: true });
      }

      if (body.op === 'set_theme') {
        const theme = String(body.theme || '');
        const preference = String(body.preference || 'neutral');
        if (!['more', 'less', 'hidden', 'neutral'].includes(preference)) {
          return json(400, { error: 'invalid preference' });
        }
        const result = await repo.setThemePreference(payload.userId, theme, preference);
        await repo.createFeedbackEvent({
          userId: payload.userId,
          runId: payload.runId,
          feedbackType: `theme_${preference}`,
          metadata: { theme: result.theme },
        });
        return json(200, { ok: true, theme: result.theme, preference });
      }

      return json(400, { error: 'invalid op' });
    }

    const token = String(event.queryStringParameters?.t || '');
    const payload = verifyFeedbackToken(token, appEnv.security.sessionSecret);
    if (!payload) return html(400, '<p>Invalid or expired preferences link.</p>');

    const repo = createRepository({
      supabaseUrl: appEnv.supabase.url,
      supabaseServiceRoleKey: appEnv.supabase.serviceRoleKey,
    });

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
    }));
  } catch (err) {
    return html(500, `<p>Preferences failed: ${esc(err.message || String(err))}</p>`);
  }
};
