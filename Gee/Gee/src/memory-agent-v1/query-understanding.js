function parseJsonSafely(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('empty parse response');
  try {
    return JSON.parse(raw);
  } catch {
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
      return JSON.parse(raw.slice(first, last + 1));
    }
    throw new Error('invalid parse response');
  }
}

function clampCount(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return Math.max(1, Math.min(5, n));
}

function uniqueTrimmed(items, limit = 8) {
  if (!Array.isArray(items)) return [];
  return [...new Set(items.map((x) => String(x || '').trim()).filter(Boolean))].slice(0, limit);
}

function normalizeVariants(value, fallback) {
  const next = uniqueTrimmed(value, 2);
  if (next.length) return next;
  return fallback;
}

function sanitizeUnderstanding(raw, normalizedInput) {
  const intent = ['recent_activity', 'count_by_time', 'decision_history', 'reply_support', 'general_context']
    .includes(raw?.intent)
    ? raw.intent
    : 'general_context';

  const sourcePreference = ['email', 'calendar', 'both'].includes(raw?.source_preference)
    ? raw.source_preference
    : 'both';

  const dateConstraints = {
    type: ['none', 'yesterday', 'today', 'last_7_days', 'last_30_days', 'iso_range'].includes(raw?.date_constraints?.type)
      ? raw.date_constraints.type
      : 'none',
    date_from: raw?.date_constraints?.date_from || null,
    date_to: raw?.date_constraints?.date_to || null,
  };

  return {
    intent,
    source_preference: sourcePreference,
    requested_count: clampCount(raw?.requested_count) || normalizedInput.requestedCount || null,
    entities: uniqueTrimmed(raw?.entities, 12),
    date_constraints: dateConstraints,
    query_variants_by_tool: {
      email: normalizeVariants(raw?.query_variants_by_tool?.email, [normalizedInput.cleaned]),
      calendar: normalizeVariants(raw?.query_variants_by_tool?.calendar, [normalizedInput.cleaned]),
    },
  };
}

function fallbackUnderstanding(normalizedInput) {
  const lower = normalizedInput.cleaned.toLowerCase();
  const emailSignal = /(email|emails|inbox|message|messages|thread|sender|sent)/.test(lower);
  const calendarSignal = /(calendar|meeting|event|schedule|invite|attendee)/.test(lower);
  const countSignal = /(how many|count|number of)/.test(lower);
  const recentSignal = /(last|latest|recent)/.test(lower);

  let intent = 'general_context';
  if (countSignal) intent = 'count_by_time';
  else if (recentSignal) intent = 'recent_activity';
  else if (/(decision|approved|approval|sign[- ]off)/.test(lower)) intent = 'decision_history';
  else if (/(reply|respond|follow up|follow-up)/.test(lower)) intent = 'reply_support';

  const sourcePreference = emailSignal && !calendarSignal
    ? 'email'
    : calendarSignal && !emailSignal
      ? 'calendar'
      : 'both';

  return {
    intent,
    source_preference: sourcePreference,
    requested_count: normalizedInput.requestedCount || null,
    entities: normalizedInput.entities || [],
    date_constraints: {
      type: normalizedInput.dateHints.includes('yesterday')
        ? 'yesterday'
        : normalizedInput.dateHints.includes('today')
          ? 'today'
          : 'none',
      date_from: null,
      date_to: null,
    },
    query_variants_by_tool: {
      email: [normalizedInput.cleaned],
      calendar: [normalizedInput.cleaned],
    },
  };
}

export async function interpretQuery({ llm, userInput, normalizedInput }) {
  const fallback = fallbackUnderstanding(normalizedInput);
  if (!llm) return fallback;

  try {
    const client = llm.client || llm;
    const model = llm.model || 'gpt-4.1-mini';
    const prompt = [
      'Classify the user query for a memory retrieval system.',
      'Return JSON only.',
      'Schema:',
      '{',
      '  "intent":"recent_activity|count_by_time|decision_history|reply_support|general_context",',
      '  "source_preference":"email|calendar|both",',
      '  "requested_count": number|null,',
      '  "date_constraints":{"type":"none|yesterday|today|last_7_days|last_30_days|iso_range","date_from":string|null,"date_to":string|null},',
      '  "entities":[string],',
      '  "query_variants_by_tool":{"email":[string],"calendar":[string]}',
      '}',
      'Constraints: max 2 query variants per tool, concise search-style variants, no explanations.',
      `User input: ${userInput}`,
    ].join('\n');

    const out = await client.responses.create({
      model,
      input: prompt,
      max_output_tokens: 220,
    });

    const parsed = parseJsonSafely(out.output_text || '');
    return sanitizeUnderstanding(parsed, normalizedInput);
  } catch {
    return fallback;
  }
}
