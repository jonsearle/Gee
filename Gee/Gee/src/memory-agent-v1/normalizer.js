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
  const capitalizedPhrases = input.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g) || [];
  const acronyms = input.match(/\b[A-Z]{2,}\b/g) || [];
  const emails = input.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) || [];
  entities.push(...capitalizedPhrases, ...acronyms, ...emails);
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

function detectRetrievalIntent(input) {
  const lower = input.toLowerCase();
  const recentEmailPattern = /(last|latest|recent)\s+\d*\s*(email|emails|messages)|who\s+were\s+the\s+last.*(email|emails|messages).*(from)/;
  if (recentEmailPattern.test(lower)) return 'recent_email_senders';
  return 'default';
}

function extractRequestedCount(input) {
  const m = input.toLowerCase().match(/\b(last|latest|recent)\s+(\d+)\b/);
  if (!m) return null;
  const n = Number(m[2]);
  if (!Number.isInteger(n) || n <= 0) return null;
  return Math.min(5, n);
}

export function normalizeInput(userInput) {
  const cleaned = compactWhitespace(userInput);
  return {
    cleaned,
    entities: extractEntities(cleaned),
    dateHints: extractDateHints(cleaned),
    toneHints: extractToneHints(cleaned),
    retrievalIntent: detectRetrievalIntent(cleaned),
    requestedCount: extractRequestedCount(cleaned),
  };
}
