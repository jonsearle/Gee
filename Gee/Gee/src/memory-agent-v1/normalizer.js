function compactWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function extractDateHints(input) {
  const matches = [];
  const iso = input.match(/\b\d{4}-\d{2}-\d{2}\b/g) || [];
  matches.push(...iso);

  const lower = input.toLowerCase();
  const relative = ['today', 'tomorrow', 'yesterday', 'this week', 'last week', 'this month', 'last month'];
  for (const hint of relative) {
    if (lower.includes(hint)) matches.push(hint);
  }
  return [...new Set(matches)];
}

function extractEntities(input) {
  const entities = [];
  const capitalized = input.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
  const emails = input.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) || [];
  entities.push(...capitalized, ...emails);
  return [...new Set(entities.map((x) => x.trim()).filter(Boolean))].slice(0, 12);
}

function extractToneHints(input) {
  const lower = input.toLowerCase();
  const hints = [];
  if (/urgent|asap|immediately|quick/.test(lower)) hints.push('urgent');
  if (/delay|blocked|stuck|waiting|late/.test(lower)) hints.push('delay');
  if (/decision|decide|approval|approved|sign[- ]off/.test(lower)) hints.push('decision');
  if (/reply|respond|response|follow up|follow-up/.test(lower)) hints.push('reply');
  return hints;
}

export function normalizeInput(userInput) {
  const cleaned = compactWhitespace(userInput);
  return {
    cleaned,
    entities: extractEntities(cleaned),
    dateHints: extractDateHints(cleaned),
    toneHints: extractToneHints(cleaned),
  };
}
