function parseJsonSafely(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
      try {
        return JSON.parse(raw.slice(first, last + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function compactEvent(event) {
  return {
    id: String(event.id || ''),
    title: String(event.summary || '(No title)'),
    start_time: String(event.start?.dateTime || event.start?.date || ''),
    end_time: String(event.end?.dateTime || event.end?.date || ''),
    organizer: String(event.organizer?.email || event.organizer?.displayName || ''),
    attendees: (event.attendees || []).map((a) => a.email || a.displayName).filter(Boolean),
    description_preview: String(event.description || '').slice(0, 600),
    url: String(event.htmlLink || ''),
  };
}

function fallbackResponse(event) {
  if (!event) {
    return {
      summary: 'No upcoming meeting found to prepare for.',
      confidence: 'low',
      items: [],
      fallback_message: 'I didn’t find anything clearly relevant.',
    };
  }

  return {
    summary: `Next meeting is "${event.title}". I could not generate the full prep brief, so this is the raw invite context.`,
    confidence: 'medium',
    items: [
      {
        title: event.title,
        source_type: 'calendar',
        source_id: event.id,
        why_relevant: 'next scheduled meeting',
        date: event.start_time,
        participants: [event.organizer, ...(event.attendees || [])].filter(Boolean).slice(0, 8),
        snippet: event.description_preview || '',
        url: event.url || '',
        score: 0.9,
      },
    ],
    fallback_message: null,
  };
}

function asLines(value, max = 4) {
  if (!Array.isArray(value) || !value.length) return '';
  return value.slice(0, max).map((x) => `- ${String(x)}`).join('\n');
}

function deterministicMiniBrief(event) {
  const context = `${event.title} ${event.description_preview}`.trim();
  const lines = context
    .split(/\n+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 4);
  const snippets = lines.length ? lines : ['Review role scope and responsibilities from the invite text.'];
  return [
    `Objective: Prepare for "${event.title}" using the invite details.`,
    `Talking points:\n${snippets.map((x) => `- ${x}`).join('\n')}`,
    'Questions to ask:\n- What are the top outcomes expected in the first 90 days?\n- How is product success measured for this role?',
  ].join('\n\n');
}

export async function runMeetingPrep({ calendar, llm }) {
  const now = new Date().toISOString();
  const cal = await calendar.events.list({
    calendarId: 'primary',
    timeMin: now,
    maxResults: 3,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = (cal.data.items || []).map(compactEvent).filter((e) => e.id);
  const nextEvent = events[0] || null;
  const fallback = fallbackResponse(nextEvent);
  if (!nextEvent) return fallback;

  if (!llm) {
    return {
      ...fallback,
      summary: `${fallback.summary}\n\n${deterministicMiniBrief(nextEvent)}`,
    };
  }

  const client = llm.client || llm;
  const model = llm.model || 'gpt-4.1-mini';
  const prompt = [
    'You are a meeting prep assistant.',
    'Use ONLY this meeting invite context. Do not invent facts.',
    'Return JSON only with this exact schema:',
    '{"summary":"string","confidence":"high|medium|low","objective":"string","talking_points":["string"],"smart_questions":["string"],"recommended_opener":"string","risks":["string"],"next_steps":["string"]}',
    'Keep language practical and concise.',
    '',
    `Meeting context: ${JSON.stringify(nextEvent)}`,
  ].join('\n');

  const out = await client.responses.create({
    model,
    input: prompt,
    max_output_tokens: 320,
  });

  const parsed = parseJsonSafely(out.output_text || '');
  if (!parsed || typeof parsed.summary !== 'string') {
    return {
      ...fallback,
      summary: `${fallback.summary}\n\n${deterministicMiniBrief(nextEvent)}`,
    };
  }

  const sections = [
    `Objective: ${String(parsed.objective || '').trim() || 'Clarify the meeting objective based on the invite.'}`,
    asLines(parsed.talking_points, 4) ? `Talking points:\n${asLines(parsed.talking_points, 4)}` : '',
    asLines(parsed.smart_questions, 3) ? `Questions to ask:\n${asLines(parsed.smart_questions, 3)}` : '',
    parsed.recommended_opener ? `Opener: ${String(parsed.recommended_opener)}` : '',
    asLines(parsed.risks, 3) ? `Risks:\n${asLines(parsed.risks, 3)}` : '',
    asLines(parsed.next_steps, 3) ? `Suggested next steps:\n${asLines(parsed.next_steps, 3)}` : '',
  ].filter(Boolean);

  return {
    summary: `${String(parsed.summary).trim()}\n\n${sections.join('\n\n')}`,
    confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium',
    items: fallback.items,
    fallback_message: null,
  };
}
