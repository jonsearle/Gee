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

function pickHeader(headers, name) {
  return headers.find((h) => String(h.name || '').toLowerCase() === name.toLowerCase())?.value || '';
}

function toIso(value) {
  const asNum = Number(value);
  if (Number.isFinite(asNum)) return new Date(asNum).toISOString();
  const asDate = new Date(value);
  if (!Number.isNaN(asDate.getTime())) return asDate.toISOString();
  return new Date().toISOString();
}

function unique(values) {
  return [...new Set(values.map((x) => String(x || '').trim()).filter(Boolean))];
}

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => x.length >= 3);
}

function overlapScore(aText, bText) {
  const a = new Set(tokenize(aText));
  const b = new Set(tokenize(bText));
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  return shared / Math.max(1, Math.min(a.size, b.size));
}

function extractEmailAddress(value) {
  const m = String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0].toLowerCase() : '';
}

function compactEvent(event) {
  return {
    id: String(event.id || ''),
    title: String(event.summary || '(No title)'),
    start_time: String(event.start?.dateTime || event.start?.date || ''),
    end_time: String(event.end?.dateTime || event.end?.date || ''),
    organizer: String(event.organizer?.email || event.organizer?.displayName || ''),
    attendees: (event.attendees || []).map((a) => a.email || a.displayName).filter(Boolean),
    description_preview: String(event.description || '').slice(0, 260),
    url: String(event.htmlLink || ''),
  };
}

function compactMessage(msg) {
  const headers = msg.payload?.headers || [];
  return {
    id: String(msg.id || ''),
    thread_id: String(msg.threadId || ''),
    subject: pickHeader(headers, 'Subject'),
    from: pickHeader(headers, 'From'),
    to: pickHeader(headers, 'To'),
    timestamp: toIso(msg.internalDate || pickHeader(headers, 'Date')),
    snippet: String(msg.snippet || ''),
    url: `https://mail.google.com/mail/u/0/#inbox/${msg.id}`,
  };
}

function fallbackResponse(event, emails) {
  const items = [];
  if (event) {
    items.push({
      title: event.title,
      source_type: 'calendar',
      source_id: event.id,
      why_relevant: 'next scheduled meeting',
      date: event.start_time,
      participants: [event.organizer, ...(event.attendees || [])].filter(Boolean).slice(0, 8),
      snippet: event.description_preview || '',
      url: event.url || '',
      score: 0.9,
    });
  }
  for (const e of emails.slice(0, 3)) {
    items.push({
      title: e.subject || '(No subject)',
      source_type: 'email',
      source_id: e.id,
      why_relevant: e.why_relevant || 'recent email related to meeting context',
      date: e.timestamp,
      participants: [e.from, e.to].filter(Boolean),
      snippet: e.snippet || '',
      url: e.url || '',
      score: 0.75,
    });
  }

  if (!event) {
    return {
      summary: 'No upcoming meeting found to prepare for.',
      confidence: 'low',
      items: [],
      fallback_message: 'I didn’t find anything clearly relevant.',
    };
  }

  return {
    summary: `Next meeting is "${event.title}". I pulled recent attendee-related emails to help you prepare.`,
    confidence: 'medium',
    items: items.slice(0, 5),
    fallback_message: null,
  };
}

export async function runMeetingPrep({ gmail, calendar, llm }) {
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
  if (!nextEvent) return fallbackResponse(null, []);

  const profile = await gmail.users.getProfile({ userId: 'me' });
  const me = String(profile.data?.emailAddress || '').toLowerCase();

  const people = unique([nextEvent.organizer, ...(nextEvent.attendees || [])])
    .map((x) => extractEmailAddress(x) || String(x || '').toLowerCase())
    .filter(Boolean)
    .filter((x) => x !== me)
    .slice(0, 5);

  let list;
  if (people.length) {
    const personTerms = people.map((p) => (p.includes('@') ? `from:${p}` : `"${p}"`)).join(' OR ');
    list = await gmail.users.messages.list({
      userId: 'me',
      q: `${personTerms} newer_than:30d -in:chats`.trim(),
      maxResults: 10,
    });
  } else {
    list = await gmail.users.messages.list({
      userId: 'me',
      q: 'newer_than:30d -in:chats',
      maxResults: 25,
    });
  }

  const ids = (list.data.messages || []).map((m) => m.id).filter(Boolean);
  const rawEmails = await Promise.all(ids.map(async (id) => {
    const detail = await gmail.users.messages.get({
      userId: 'me',
      id,
      format: 'metadata',
      metadataHeaders: ['Subject', 'From', 'To', 'Date'],
    });
    return detail.data;
  }));
  const eventText = `${nextEvent.title} ${nextEvent.description_preview}`.trim();
  const emails = rawEmails
    .map(compactMessage)
    .map((e) => {
      const text = `${e.subject} ${e.snippet}`.trim();
      const topicScore = overlapScore(eventText, text);
      return {
        ...e,
        _topicScore: topicScore,
        why_relevant: people.length
          ? 'recent email from meeting participant'
          : 'topic overlap with next meeting',
      };
    })
    .filter((e) => (people.length ? true : e._topicScore >= 0.15))
    .sort((a, b) => {
      if (!people.length && b._topicScore !== a._topicScore) return b._topicScore - a._topicScore;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

  const fallback = fallbackResponse(nextEvent, emails);
  if (!llm || !emails.length) return fallback;

  const client = llm.client || llm;
  const model = llm.model || 'gpt-4.1-mini';
  const prompt = [
    'You are a meeting prep assistant.',
    'Use only provided context.',
    'Return JSON only in this schema:',
    '{"summary":"string (1-3 sentences)","confidence":"high|medium|low","bullets":["string"],"risks":["string"]}',
    'Keep bullets practical and specific.',
    '',
    `Next event: ${JSON.stringify(nextEvent)}`,
    `Recent emails: ${JSON.stringify(emails.slice(0, 5))}`,
  ].join('\n');

  const out = await client.responses.create({
    model,
    input: prompt,
    max_output_tokens: 240,
  });
  const parsed = parseJsonSafely(out.output_text || '');
  if (!parsed || typeof parsed.summary !== 'string') return fallback;

  const bulletText = Array.isArray(parsed.bullets) && parsed.bullets.length
    ? parsed.bullets.slice(0, 4).map((x) => `- ${String(x)}`).join('\n')
    : '';
  const riskText = Array.isArray(parsed.risks) && parsed.risks.length
    ? `\nRisks: ${parsed.risks.slice(0, 3).join('; ')}`
    : '';

  return {
    summary: `${parsed.summary}${bulletText ? `\n${bulletText}` : ''}${riskText}`,
    confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : fallback.confidence,
    items: fallback.items,
    fallback_message: null,
  };
}
