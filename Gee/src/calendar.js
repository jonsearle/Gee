import { addDays, endOfDay, startOfDay } from 'date-fns';

function toIsoDate(d) {
  return d.toISOString().slice(0, 10);
}

export async function fetchCalendarContext(calendar, referencedDates = []) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowEnd = endOfDay(addDays(now, 1));

  const base = await listEvents(calendar, todayStart.toISOString(), tomorrowEnd.toISOString(), 20);

  const extraDates = referencedDates
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .filter((d) => d !== toIsoDate(now) && d !== toIsoDate(addDays(now, 1)))
    .slice(0, 5);

  const extraEvents = [];
  for (const dateStr of extraDates) {
    const day = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(day.getTime())) continue;

    const events = await listEvents(
      calendar,
      startOfDay(day).toISOString(),
      endOfDay(day).toISOString(),
      10,
    );

    extraEvents.push(...events.map((e) => ({ ...e, referencedDate: dateStr })));
  }

  return {
    todayTomorrow: base,
    referenced: extraEvents,
  };
}

async function listEvents(calendar, timeMin, timeMax, maxResults) {
  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults,
  });

  return (res.data.items || []).map((evt) => ({
    id: evt.id,
    summary: evt.summary || '(No title)',
    start: evt.start?.dateTime || evt.start?.date,
    end: evt.end?.dateTime || evt.end?.date,
    location: evt.location || '',
    attendeesCount: Array.isArray(evt.attendees) ? evt.attendees.length : 0,
  }));
}
