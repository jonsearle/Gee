const signedOut = document.getElementById('signedOut');
const signedIn = document.getElementById('signedIn');
const whoami = document.getElementById('whoami');
const sendNowBtn = document.getElementById('sendNowBtn');
const logoutBtn = document.getElementById('logoutBtn');
const statusText = document.getElementById('statusText');
const memoryChatLog = document.getElementById('memoryChatLog');
const memoryChatForm = document.getElementById('memoryChatForm');
const memoryChatInput = document.getElementById('memoryChatInput');
const memoryChatSendBtn = document.getElementById('memoryChatSendBtn');

const sessionId = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `session_${Date.now()}`;
let lastInteractionId = '';

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function setStatus(text, isError = false) {
  statusText.textContent = text;
  statusText.style.color = isError ? '#b3261e' : '#5f7466';
}

function appendUserMessage(text) {
  const row = document.createElement('div');
  row.className = 'chat-row user';
  row.innerHTML = `<div class="bubble user">${escapeHtml(text)}</div>`;
  memoryChatLog.appendChild(row);
  memoryChatLog.scrollTop = memoryChatLog.scrollHeight;
}

function appendAssistantThinking() {
  const row = document.createElement('div');
  row.className = 'chat-row assistant pending';
  row.innerHTML = '<div class="bubble assistant">Thinking…</div>';
  memoryChatLog.appendChild(row);
  memoryChatLog.scrollTop = memoryChatLog.scrollHeight;
  return row;
}

function buildSourcesHtml(items = [], interactionId = '') {
  if (!items.length) return '';
  const cards = items.map((item) => {
    const dateText = item.date ? new Date(item.date).toLocaleString() : '';
    const participants = Array.isArray(item.participants) ? item.participants.filter(Boolean).slice(0, 4) : [];
    return `
      <article class="source-card">
        <div class="source-meta">${escapeHtml(item.source_type)} · score ${Number(item.score || 0).toFixed(2)}</div>
        <h4>${escapeHtml(item.title || '(No title)')}</h4>
        <p>${escapeHtml(item.why_relevant || '')}</p>
        ${item.snippet ? `<blockquote>${escapeHtml(item.snippet)}</blockquote>` : ''}
        <div class="source-foot">
          <span>${escapeHtml(dateText)}</span>
          ${participants.length ? `<span>${escapeHtml(participants.join(', '))}</span>` : ''}
          ${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer" data-source-id="${escapeHtml(item.source_id || '')}" data-interaction-id="${escapeHtml(interactionId)}">Open source</a>` : ''}
        </div>
      </article>
    `;
  }).join('');
  return `<div class="source-list">${cards}</div>`;
}

function renderAssistantMessage(row, payload, interactionId = '') {
  row.classList.remove('pending');
  const summary = payload.summary || payload.fallback_message || 'No grounded context found.';
  const confidence = payload.confidence || 'low';
  row.innerHTML = `
    <div class="bubble assistant">
      <p>${escapeHtml(summary)}</p>
      <div class="confidence-tag">Confidence: ${escapeHtml(confidence)}</div>
      ${buildSourcesHtml(payload.items || [], interactionId)}
    </div>
  `;
  memoryChatLog.scrollTop = memoryChatLog.scrollHeight;
}

async function loadSession() {
  const res = await fetch('/api/me');
  const data = await res.json();

  if (!data.authenticated) {
    signedOut.classList.remove('hidden');
    signedIn.classList.add('hidden');
    return;
  }

  signedOut.classList.add('hidden');
  signedIn.classList.remove('hidden');
  whoami.textContent = `Signed in as ${data.user.name} (${data.user.email})`;
  statusText.textContent = '';
  if (!data.user.hasRefreshToken) {
    setStatus('Connected, but refresh token missing. Re-connect Google.', true);
  }

  const intro = document.createElement('div');
  intro.className = 'chat-row assistant';
  intro.innerHTML = '<div class="bubble assistant">Ask a question and I will retrieve relevant email/calendar context before responding.</div>';
  memoryChatLog.appendChild(intro);
}

async function sendNow() {
  setStatus('Sending your summary now...');
  sendNowBtn.disabled = true;

  try {
    const res = await fetch('/api/send-now', { method: 'POST' });
    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await res.json() : { error: await res.text() };
    if (!res.ok) throw new Error(data.error || 'Failed to send summary');
    setStatus('Summary sent. Check your email.');
  } catch (err) {
    const msg = String(err.message || 'Failed to send summary');
    if (msg.includes('<!DOCTYPE') || msg.includes('<html')) {
      setStatus('Server returned HTML instead of API JSON. Restart `npm run start:web` and try again.', true);
    } else {
      setStatus(msg, true);
    }
  } finally {
    sendNowBtn.disabled = false;
  }
}

async function logout() {
  await fetch('/auth/logout', { method: 'POST' });
  window.location.reload();
}

async function sendMemoryQuery() {
  const text = String(memoryChatInput.value || '').trim();
  if (!text) return;

  appendUserMessage(text);
  memoryChatInput.value = '';
  memoryChatSendBtn.disabled = true;
  const pending = appendAssistantThinking();
  setStatus('Retrieving context...');

  try {
    if (lastInteractionId) {
      await fetch('/memory/event', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          event_type: 'followup_prompt',
          interaction_id: lastInteractionId,
          timestamp: new Date().toISOString(),
          text_summary: text.slice(0, 200),
        }),
      });
    }

    const res = await fetch('/memory/query', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        user_input: text,
        session_id: sessionId,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Memory query failed');

    const interactionId = res.headers.get('x-memory-interaction-id') || '';
    if (interactionId) lastInteractionId = interactionId;

    renderAssistantMessage(pending, data, interactionId);
    setStatus('');
  } catch (err) {
    pending.classList.remove('pending');
    pending.innerHTML = `<div class="bubble assistant error">${escapeHtml(err.message || 'Failed to query memory')}</div>`;
    setStatus(err.message || 'Failed to query memory', true);
  } finally {
    memoryChatSendBtn.disabled = false;
    memoryChatInput.focus();
  }
}

memoryChatForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  sendMemoryQuery().catch((err) => setStatus(err.message || 'Failed', true));
});

memoryChatInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMemoryQuery().catch((err) => setStatus(err.message || 'Failed', true));
  }
});

memoryChatLog?.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.tagName !== 'A') return;
  const sourceId = target.getAttribute('data-source-id') || '';
  const interactionId = target.getAttribute('data-interaction-id') || '';
  if (!sourceId || !interactionId) return;

  try {
    await fetch('/memory/event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        event_type: 'item_opened',
        interaction_id: interactionId,
        source_id: sourceId,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch {
    // ignore telemetry failures in UI
  }
});

sendNowBtn?.addEventListener('click', sendNow);
logoutBtn?.addEventListener('click', logout);
loadSession().catch((err) => setStatus(err.message || 'Failed to load session', true));
