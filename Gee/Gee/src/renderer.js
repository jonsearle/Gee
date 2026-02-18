function getMainItems(plan) {
  return plan.mainThings.length
    ? plan.mainThings.slice(0, 5)
    : [{
      theme: '',
      title: 'Pick one top outcome for today',
      detail: 'Try to finish one concrete result before lunch.',
      efficiencyHint: '',
      helpLinks: [],
    }];
}

function getCanWaitItems(plan) {
  return plan.canWait.length
    ? plan.canWait
    : ['Non-urgent follow-ups can wait until your top task is done.'];
}

function getWorkstreams(plan) {
  return plan.observedWorkstreams?.length
    ? plan.observedWorkstreams
    : ['I can see a mix of coordination, short confirmations, and follow-ups.'];
}

function escapeHtml(text) {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function sectionTitle(text) {
  return `<h2 style="margin:20px 0 8px;font:700 14px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;letter-spacing:.02em;text-transform:uppercase;color:#0f172a;">${escapeHtml(text)}</h2>`;
}

function renderHtmlList(items, formatItem = (x) => x) {
  const rows = items.map((item) => `<li style="margin:0 0 8px;">${formatItem(item)}</li>`).join('');
  return `<ul style="margin:0;padding:0 0 0 20px;color:#0f172a;font:400 15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">${rows}</ul>`;
}

function normalizeHelpLinks(item) {
  return Array.isArray(item?.helpLinks)
    ? item.helpLinks
        .map((link) => ({
          label: String(link?.label || '').trim() || 'Open link',
          href: String(link?.href || '').trim(),
        }))
        .filter((link) => /^https?:\/\//i.test(link.href))
        .slice(0, 3)
    : [];
}

export function renderDailyEmail({
  userName,
  plan,
  isFirstRun = false,
  nextSendUtcText = '',
  feedbackLinks = null,
}) {
  const lines = [];
  const main = getMainItems(plan);
  const canWait = getCanWaitItems(plan);
  const microNudge = plan.microNudge || 'If you only do one thing today, finish the most time-sensitive commitment first.';
  const greeting = getGreeting();

  lines.push(`${greeting}, ${userName}`);
  lines.push('');
  lines.push('Focus for today');
  lines.push(plan.contextSentence || 'Quiet day overall. A clear order will help.');
  lines.push(microNudge);
  lines.push('');

  lines.push('Main things to get done today');
  for (const [index, item] of main.entries()) {
    lines.push(`${index + 1}. ${item.title}${item.detail ? ` (${item.detail})` : ''}`);
    if (item.theme) lines.push(`   Theme: ${item.theme}`);
    if (item.efficiencyHint) lines.push(`   Do it efficiently: ${item.efficiencyHint}`);
    const links = normalizeHelpLinks(item);
    for (const link of links) lines.push(`   - ${link.label}: ${link.href}`);
  }
  lines.push('');

  if (isFirstRun) {
    lines.push('What I am seeing so far');
    for (const item of getWorkstreams(plan)) lines.push(`- ${item}`);
    lines.push('');

    if (nextSendUtcText) {
      lines.push(`Next daily plan email: ${nextSendUtcText} (then every morning at 9:00 a.m. GMT).`);
    } else {
      lines.push('Next daily plan email: tomorrow at 9:00 a.m. GMT (then every morning).');
    }
    lines.push('');
  }

  lines.push('Things that can safely wait');
  for (const item of canWait) lines.push(`- ${item}`);

  lines.push('');
  if (feedbackLinks?.detailed) {
    lines.push('How are we doing?');
    lines.push(`Tell us what you need: ${feedbackLinks.detailed}`);
    lines.push('');
  }

  lines.push('- G');
  return lines.join('\n');
}

export function renderDailyEmailHtml({
  userName,
  plan,
  isFirstRun = false,
  nextSendUtcText = '',
  feedbackLinks = null,
}) {
  const main = getMainItems(plan);
  const canWait = getCanWaitItems(plan);
  const microNudge = plan.microNudge || 'If you only do one thing today, finish the most time-sensitive task first.';
  const greeting = getGreeting();

  const mainList = renderHtmlList(
    main,
    (item) => {
      const links = normalizeHelpLinks(item);
      const themeHtml = item.theme
        ? `<div style="margin-top:6px;font:600 12px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#334155;">Theme: ${escapeHtml(item.theme)}</div>`
        : '';
      const efficiencyHtml = item.efficiencyHint
        ? `<div style="margin-top:6px;font:500 13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#0f766e;">Do it efficiently: ${escapeHtml(item.efficiencyHint)}</div>`
        : '';
      const linksHtml = links.length
        ? `<div style="margin-top:6px;font:500 13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
             ${links.map((link) => `<a href="${escapeHtml(link.href)}" style="display:inline-block;margin:0 8px 6px 0;padding:2px 8px;border:1px solid #cbd5e1;border-radius:999px;color:#0369a1;text-decoration:none;">${escapeHtml(link.label)}</a>`).join('')}
           </div>`
        : '';
      return `<strong>${escapeHtml(item.title)}</strong>${item.detail ? ` <span style="color:#475569;">(${escapeHtml(item.detail)})</span>` : ''}${themeHtml}${efficiencyHtml}${linksHtml}`;
    },
  );

  const canWaitList = renderHtmlList(canWait, (item) => escapeHtml(item));

  const firstRunBlock = isFirstRun
    ? `${sectionTitle('What I Am Seeing So Far')}
       ${renderHtmlList(getWorkstreams(plan), (item) => escapeHtml(item))}
       <p style="margin:14px 0 0;color:#334155;font:400 14px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
         ${escapeHtml(nextSendUtcText
    ? `Next daily plan email: ${nextSendUtcText} (then every morning at 9:00 a.m. GMT).`
    : 'Next daily plan email: tomorrow at 9:00 a.m. GMT (then every morning).')}
       </p>`
    : '';

  const feedbackBlock = feedbackLinks?.detailed
    ? `<p style="margin:20px 0 0;color:#334155;font:400 13px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
         How are we doing?
         <a href="${escapeHtml(feedbackLinks.detailed)}" style="color:#0369a1;">Tell us what you need</a>
       </p>`
    : '';

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="padding:22px 22px 10px;background:#f1f5f9;">
                <p style="margin:0 0 8px;font:700 22px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#0f172a;">${escapeHtml(greeting)}, ${escapeHtml(userName)}</p>
                <p style="margin:0;font:400 15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#334155;">
                  Your daily plan, tuned to your priorities.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 22px 24px;">
                ${sectionTitle('Focus For Today')}
                <p style="margin:0;color:#334155;font:400 15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">${escapeHtml(plan.contextSentence || 'Quiet day overall. A clear order will help.')}</p>
                <p style="margin:8px 0 0;color:#0f172a;font:600 15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">${escapeHtml(microNudge)}</p>
                ${sectionTitle('Main Things To Get Done Today')}
                ${mainList}
                ${firstRunBlock}
                ${sectionTitle('Things That Can Safely Wait')}
                ${canWaitList}
                ${feedbackBlock}
                <p style="margin:20px 0 0;color:#64748b;font:500 13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">- G</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
