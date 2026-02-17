function getMainItems(plan) {
  return plan.mainThings.length
    ? plan.mainThings.slice(0, 5)
    : [{ title: 'Confirm your top priority outcome for today', detail: 'Start with one concrete result by noon.' }];
}

function getCanWaitItems(plan) {
  return plan.canWait.length
    ? plan.canWait
    : ['Non-urgent follow-ups can wait until after your priority commitments are complete.'];
}

function getWorkstreams(plan) {
  return plan.observedWorkstreams?.length
    ? plan.observedWorkstreams
    : ['A mix of meeting coordination, short confirmations, and follow-ups with time-sensitive dependencies.'];
}

function escapeHtml(text) {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sectionTitle(text) {
  return `<h2 style="margin:20px 0 8px;font:700 14px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;letter-spacing:.02em;text-transform:uppercase;color:#0f172a;">${escapeHtml(text)}</h2>`;
}

function renderHtmlList(items, formatItem = (x) => x) {
  const rows = items.map((item) => `<li style="margin:0 0 8px;">${formatItem(item)}</li>`).join('');
  return `<ul style="margin:0;padding:0 0 0 20px;color:#0f172a;font:400 15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">${rows}</ul>`;
}

export function renderDailyEmail({ userName, plan, isFirstRun = false, nextSendUtcText = '' }) {
  const lines = [];
  const main = getMainItems(plan);
  const canWait = getCanWaitItems(plan);
  const microNudge = plan.microNudge || 'If you only do one thing today, finish the most time-sensitive commitment first.';

  lines.push(`Good morning, ${userName}`);
  lines.push('');
  lines.push(plan.contextSentence || 'Today has a few moving parts, but a clear order will keep it manageable.');
  lines.push('');

  lines.push('MAIN THINGS TO GET DONE TODAY');
  for (const [index, item] of main.entries()) {
    lines.push(`${index + 1}. ${item.title}${item.detail ? ` (${item.detail})` : ''}`);
  }
  lines.push('');

  lines.push('PRIORITIZE FIRST');
  lines.push(microNudge);
  lines.push('');

  if (isFirstRun) {
    lines.push('WHAT I AM SEEING SO FAR');
    for (const item of getWorkstreams(plan)) lines.push(`- ${item}`);
    lines.push('');

    if (nextSendUtcText) {
      lines.push(`Next daily plan email: ${nextSendUtcText} (then every morning at 9:00 a.m. GMT).`);
    } else {
      lines.push('Next daily plan email: tomorrow at 9:00 a.m. GMT (then every morning).');
    }
    lines.push('');
  }

  lines.push('THINGS THAT CAN SAFELY WAIT');
  for (const item of canWait) lines.push(`- ${item}`);

  if (plan.efficiencySuggestions.length) {
    lines.push('');
    lines.push('EFFICIENCY SUGGESTIONS');
    for (const item of plan.efficiencySuggestions) lines.push(`- ${item}`);
  }

  lines.push('');
  lines.push('- G');
  return lines.join('\n');
}

export function renderDailyEmailHtml({ userName, plan, isFirstRun = false, nextSendUtcText = '' }) {
  const main = getMainItems(plan);
  const canWait = getCanWaitItems(plan);
  const microNudge = plan.microNudge || 'If you only do one thing today, finish the most time-sensitive commitment first.';

  const mainList = renderHtmlList(
    main,
    (item) => `<strong>${escapeHtml(item.title)}</strong>${item.detail ? ` <span style="color:#475569;">(${escapeHtml(item.detail)})</span>` : ''}`,
  );

  const canWaitList = renderHtmlList(canWait, (item) => escapeHtml(item));
  const efficiencyList = plan.efficiencySuggestions.length
    ? `${sectionTitle('Efficiency Suggestions')}${renderHtmlList(plan.efficiencySuggestions, (item) => escapeHtml(item))}`
    : '';

  const firstRunBlock = isFirstRun
    ? `${sectionTitle('What I Am Seeing So Far')}
       ${renderHtmlList(getWorkstreams(plan), (item) => escapeHtml(item))}
       <p style="margin:14px 0 0;color:#334155;font:400 14px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
         ${escapeHtml(nextSendUtcText
    ? `Next daily plan email: ${nextSendUtcText} (then every morning at 9:00 a.m. GMT).`
    : 'Next daily plan email: tomorrow at 9:00 a.m. GMT (then every morning).')}
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
                <p style="margin:0 0 8px;font:700 22px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#0f172a;">Good morning, ${escapeHtml(userName)}</p>
                <p style="margin:0;font:400 15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#334155;">
                  ${escapeHtml(plan.contextSentence || 'Today has a few moving parts, but a clear order will keep it manageable.')}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 22px 24px;">
                ${sectionTitle('Main Things To Get Done Today')}
                ${mainList}
                ${sectionTitle('Prioritize First')}
                <p style="margin:0;color:#0f172a;font:600 15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">${escapeHtml(microNudge)}</p>
                ${firstRunBlock}
                ${sectionTitle('Things That Can Safely Wait')}
                ${canWaitList}
                ${efficiencyList}
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
