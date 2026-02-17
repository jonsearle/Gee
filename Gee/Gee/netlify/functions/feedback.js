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

function thanksPage(message, detailsUrl = '') {
  return `<!doctype html>
<html><body style="font:16px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;padding:24px;max-width:720px;margin:auto;">
  <h1 style="margin:0 0 12px;">Thanks for the feedback</h1>
  <p style="margin:0 0 14px;">${esc(message)}</p>
  ${detailsUrl ? `<p style="margin:0;"><a href="${esc(detailsUrl)}">Give more detail</a></p>` : ''}
</body></html>`;
}

function detailPage({ token, run, sections }) {
  const quickBase = `/feedback?t=${encodeURIComponent(token)}`;
  const sectionRows = sections.length
    ? sections.map((section) => {
      const keep = `${quickBase}&a=keep&section=${encodeURIComponent(section.id)}`;
      const less = `${quickBase}&a=less&section=${encodeURIComponent(section.id)}`;
      const remove = `${quickBase}&a=remove&section=${encodeURIComponent(section.id)}`;
      return `<li style="margin:0 0 10px;">
        <strong>${esc(section.title)}</strong><br>
        <a href="${esc(keep)}">Keep this</a> ·
        <a href="${esc(less)}">Less of this</a> ·
        <a href="${esc(remove)}">Don’t include this</a>
      </li>`;
    }).join('')
    : '<li>No sections found for this run.</li>';

  return `<!doctype html>
<html><body style="font:16px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;padding:24px;max-width:760px;margin:auto;">
  <h1 style="margin:0 0 8px;">Feedback for your daily plan</h1>
  <p style="margin:0 0 16px;color:#334155;">${esc(run?.subject || 'Daily plan')}</p>
  <p style="margin:0 0 12px;">
    Quick rating:
    <a href="${esc(`${quickBase}&a=helpful`)}">Helpful</a> ·
    <a href="${esc(`${quickBase}&a=not_helpful`)}">Not helpful</a>
  </p>
  <h2 style="margin:18px 0 8px;">Section preferences</h2>
  <ul style="margin:0 0 18px;padding-left:20px;">${sectionRows}</ul>
  <h2 style="margin:18px 0 8px;">Tell us more</h2>
  <form method="post" action="/feedback" style="display:block;">
    <input type="hidden" name="t" value="${esc(token)}">
    <label>Rating (optional):
      <select name="rating">
        <option value="">Select</option>
        <option value="5">5 - Excellent</option>
        <option value="4">4 - Good</option>
        <option value="3">3 - OK</option>
        <option value="2">2 - Weak</option>
        <option value="1">1 - Poor</option>
      </select>
    </label>
    <br><br>
    <label>What should G include more often?</label><br>
    <input type="text" name="prefer_sections" style="width:100%;max-width:560px;" placeholder="e.g. meal planning, prep checklists">
    <br><br>
    <label>What should G include less often?</label><br>
    <input type="text" name="suppress_sections" style="width:100%;max-width:560px;" placeholder="e.g. efficiency suggestions">
    <br><br>
    <label>Additional notes</label><br>
    <textarea name="comment" rows="6" style="width:100%;max-width:640px;"></textarea>
    <br><br>
    <button type="submit">Submit feedback</button>
  </form>
</body></html>`;
}

function splitCsv(text) {
  return String(text || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
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
    if (!payload) return html(400, '<p>Invalid or expired feedback link.</p>');

    const repo = createRepository({
      supabaseUrl: appEnv.supabase.url,
      supabaseServiceRoleKey: appEnv.supabase.serviceRoleKey,
    });

    if (event.httpMethod === 'GET') {
      const action = String(event.queryStringParameters?.a || '').trim();
      const sectionId = String(event.queryStringParameters?.section || '').trim() || null;
      const detailsUrl = `/feedback?t=${encodeURIComponent(token)}`;

      if (['helpful', 'not_helpful', 'keep', 'less', 'remove'].includes(action)) {
        await repo.createFeedbackEvent({
          userId: payload.userId,
          runId: payload.runId,
          sectionId,
          feedbackType: action,
          metadata: sectionId ? { sectionId } : {},
        });
        return html(200, thanksPage('Recorded. This will shape future emails.', detailsUrl));
      }

      const runData = await repo.getDailyRunWithSections({
        userId: payload.userId,
        runId: payload.runId,
      });
      if (!runData) return html(404, '<p>This email run could not be found.</p>');
      return html(200, detailPage({ token, run: runData.run, sections: runData.sections }));
    }

    if (event.httpMethod === 'POST') {
      const body = parseBody(event);
      const rating = Number(body.get('rating') || 0);
      const comment = String(body.get('comment') || '').trim();
      const preferSections = splitCsv(body.get('prefer_sections'));
      const suppressSections = splitCsv(body.get('suppress_sections'));

      await repo.createFeedbackEvent({
        userId: payload.userId,
        runId: payload.runId,
        feedbackType: 'detailed',
        rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null,
        comment,
        metadata: {
          preferSections,
          suppressSections,
        },
      });

      if (preferSections.length || suppressSections.length) {
        const current = await repo.getUserPromptPreferences(payload.userId);
        const preferred = [...new Set([...(current?.preferred_sections || []), ...preferSections])];
        const suppressed = [...new Set([...(current?.suppressed_sections || []), ...suppressSections])];
        await repo.upsertUserPromptPreferences(payload.userId, {
          preferredSections: preferred,
          suppressedSections: suppressed,
        });
      }

      return html(200, thanksPage('Thanks. Your preferences have been saved.'));
    }

    return html(405, '<p>Method not allowed.</p>');
  } catch (err) {
    return html(500, `<p>Feedback failed: ${esc(err.message || String(err))}</p>`);
  }
};
