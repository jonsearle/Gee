export function renderDailyEmail({ userName, plan, isFirstRun = false, nextSendUtcText = '' }) {
  const lines = [];

  lines.push(`Good morning, ${userName} —`);
  lines.push('');

  lines.push(plan.contextSentence || 'Today has a few moving parts, but a clear order will keep it manageable.');
  lines.push('');

  lines.push('Main things to get done today:');
  const main = plan.mainThings.length
    ? plan.mainThings
    : [{ title: 'Confirm your top priority outcome for today', detail: 'Start with one concrete result by noon.' }];
  for (const item of main.slice(0, 5)) {
    lines.push(`- ${item.title}${item.detail ? ` (${item.detail})` : ''}`);
  }
  lines.push('');

  lines.push(plan.microNudge || 'If you only do one thing today, finish the most time-sensitive commitment first.');
  lines.push('');

  if (isFirstRun) {
    lines.push('What I am seeing so far:');
    if (plan.observedWorkstreams?.length) {
      for (const item of plan.observedWorkstreams) lines.push(`- ${item}`);
    } else {
      lines.push('- A mix of meeting coordination, short confirmations, and follow-ups with time-sensitive dependencies.');
    }
    lines.push('');
    lines.push('I will learn with you as we progress, so this will get sharper over time.');
    if (nextSendUtcText) {
      lines.push(`Your next daily plan email is scheduled for ${nextSendUtcText}, and then every morning at 9:00 a.m. GMT.`);
    } else {
      lines.push('Your next daily plan email is scheduled for tomorrow at 9:00 a.m. GMT, and then every morning.');
    }
    lines.push('');
  }

  lines.push('Things that can safely wait:');
  if (plan.canWait.length) {
    for (const item of plan.canWait) lines.push(`- ${item}`);
  } else {
    lines.push('- Non-urgent follow-ups can wait until after your priority commitments are complete.');
  }

  if (plan.efficiencySuggestions.length) {
    lines.push('');
    lines.push('Efficiency suggestions:');
    for (const item of plan.efficiencySuggestions) lines.push(`- ${item}`);
  }

  lines.push('');
  lines.push('— G');

  return lines.join('\n');
}
