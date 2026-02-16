import { cleanEmailText } from './cleaner.js';

function b64DecodeUrlSafe(input) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function extractPayloadText(payload) {
  if (!payload) return '';

  if (payload.body?.data) return b64DecodeUrlSafe(payload.body.data);

  if (Array.isArray(payload.parts)) {
    const preferred = payload.parts.find((p) => p.mimeType === 'text/plain')
      || payload.parts.find((p) => p.mimeType === 'text/html')
      || payload.parts[0];

    if (preferred?.body?.data) return b64DecodeUrlSafe(preferred.body.data);

    for (const part of payload.parts) {
      const nested = extractPayloadText(part);
      if (nested) return nested;
    }
  }

  return '';
}

function pickHeader(headers, name) {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

export async function fetchRelevantEmails(gmail, state) {
  const query = state.firstRunCompleted
    ? `newer_than:2d -in:chats`
    : `newer_than:7d -in:chats`;

  const listRes = await gmail.users.threads.list({
    userId: 'me',
    q: query,
    maxResults: 80,
  });

  const threads = listRes.data.threads || [];
  const threadIds = threads.map((t) => t.id).filter(Boolean);

  const newThreadIds = state.firstRunCompleted
    ? threadIds.filter((id) => !state.lastThreadIds.includes(id))
    : threadIds;

  const limitedIds = newThreadIds.slice(0, 50);

  const rawItems = [];
  for (const threadId of limitedIds) {
    const t = await gmail.users.threads.get({
      userId: 'me',
      id: threadId,
      format: 'full',
    });

    const messages = t.data.messages || [];
    const latest = messages[messages.length - 1];
    if (!latest) continue;

    const headers = latest.payload?.headers || [];
    const snippet = latest.snippet || '';
    const bodyRaw = extractPayloadText(latest.payload) || snippet;
    const body = cleanEmailText(bodyRaw);

    rawItems.push({
      threadId,
      messageId: latest.id,
      subject: pickHeader(headers, 'Subject'),
      from: pickHeader(headers, 'From'),
      date: pickHeader(headers, 'Date') || new Date(Number(latest.internalDate || Date.now())).toISOString(),
      snippet,
      body,
    });
  }

  return {
    emails: rawItems,
    threadIds,
  };
}
