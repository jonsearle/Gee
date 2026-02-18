function parseCsvList(value) {
  return String(value || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function headerValue(headers, name) {
  return headers.find((h) => String(h.name || '').toLowerCase() === name.toLowerCase())?.value || '';
}

function toIsoTimestamp(value) {
  const ts = Number(value);
  if (Number.isFinite(ts)) return new Date(ts).toISOString();
  const asDate = new Date(value);
  if (!Number.isNaN(asDate.getTime())) return asDate.toISOString();
  return new Date().toISOString();
}

export async function searchEmail(gmail, query, filters = {}) {
  const maxResults = Math.max(1, Math.min(Number(filters.max_results || 25), 25));
  const dateFrom = filters.date_from ? ` after:${Math.floor(new Date(filters.date_from).getTime() / 1000)}` : '';
  const dateTo = filters.date_to ? ` before:${Math.floor(new Date(filters.date_to).getTime() / 1000)}` : '';
  const participants = Array.isArray(filters.participants) && filters.participants.length
    ? ` ${filters.participants.map((p) => `"${p}"`).join(' OR ')}`
    : '';
  const threadScope = filters.thread_only ? ' -in:chats' : '';
  const gmailQuery = `${query || ''}${dateFrom}${dateTo}${participants}${threadScope}`.trim();

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: gmailQuery,
    maxResults,
  });

  const ids = (listRes.data.messages || []).map((m) => m.id).filter(Boolean);
  const messages = await Promise.all(ids.map(async (id) => {
    const detail = await gmail.users.messages.get({
      userId: 'me',
      id,
      format: 'metadata',
      metadataHeaders: ['Subject', 'From', 'To', 'Cc', 'Date'],
    });
    return detail.data;
  }));

  return {
    items: messages.map((msg) => {
      const headers = msg.payload?.headers || [];
      return {
        id: String(msg.id || ''),
        thread_id: String(msg.threadId || ''),
        subject: headerValue(headers, 'Subject'),
        from: headerValue(headers, 'From'),
        to: parseCsvList(headerValue(headers, 'To')),
        cc: parseCsvList(headerValue(headers, 'Cc')),
        timestamp: toIsoTimestamp(msg.internalDate || headerValue(headers, 'Date')),
        snippet: String(msg.snippet || ''),
        body_preview: String(msg.snippet || ''),
        url: `https://mail.google.com/mail/u/0/#inbox/${msg.id}`,
      };
    }),
  };
}

export async function searchCalendar(calendar, query, filters = {}) {
  const maxResults = Math.max(1, Math.min(Number(filters.max_results || 25), 25));
  const timeMin = filters.date_from || new Date(new Date().setFullYear(new Date().getFullYear() - 1)).toISOString();
  const timeMax = filters.date_to || new Date().toISOString();
  const attendeeFilter = Array.isArray(filters.attendees) ? filters.attendees.map((a) => String(a || '').toLowerCase()) : [];

  const res = await calendar.events.list({
    calendarId: 'primary',
    q: String(query || ''),
    timeMin,
    timeMax,
    maxResults,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = (res.data.items || []).map((evt) => ({
    id: String(evt.id || ''),
    title: String(evt.summary || '(No title)'),
    start_time: String(evt.start?.dateTime || evt.start?.date || ''),
    end_time: String(evt.end?.dateTime || evt.end?.date || ''),
    organizer: String(evt.organizer?.email || evt.organizer?.displayName || ''),
    attendees: (evt.attendees || []).map((a) => a.email || a.displayName).filter(Boolean),
    description_preview: String(evt.description || '').slice(0, 280),
    url: String(evt.htmlLink || ''),
  }));

  if (!attendeeFilter.length) return { items: events };
  return {
    items: events.filter((evt) => {
      const haystack = [evt.organizer, ...evt.attendees].join(' ').toLowerCase();
      return attendeeFilter.some((a) => haystack.includes(a));
    }),
  };
}
