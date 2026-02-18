const signedOut = document.getElementById('signedOut');
const signedIn = document.getElementById('signedIn');
const whoami = document.getElementById('whoami');
const sendNowBtn = document.getElementById('sendNowBtn');
const openInboxChatBtn = document.getElementById('openInboxChatBtn');
const logoutBtn = document.getElementById('logoutBtn');
const statusText = document.getElementById('statusText');
const inboxChatOverlay = document.getElementById('inboxChatOverlay');
const closeInboxChatBtn = document.getElementById('closeInboxChatBtn');
const inboxChatSelect = document.getElementById('inboxChatSelect');
const inboxMessages = document.getElementById('inboxMessages');
const inboxInput = document.getElementById('inboxInput');
const newChatBtn = document.getElementById('newChatBtn');
const sendChatBtn = document.getElementById('sendChatBtn');
const sendToGBtn = document.getElementById('sendToGBtn');
const workstreamList = document.getElementById('workstreamList');
const planSelect = document.getElementById('planSelect');
const planActionList = document.getElementById('planActionList');
const planChatInput = document.getElementById('planChatInput');
const sendPlanChatBtn = document.getElementById('sendPlanChatBtn');

let workspaceState = null;

function setStatus(text, isError = false) {
  statusText.textContent = text;
  statusText.style.color = isError ? '#b3261e' : '#5f7466';
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

  await loadWorkspace();
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

function selectedChatId() {
  return inboxChatSelect.value || '';
}

function selectedPlanId() {
  return planSelect.value || '';
}

function renderWorkspace() {
  const ws = workspaceState;
  if (!ws) return;

  const chats = Array.isArray(ws.inboxChats) ? ws.inboxChats : [];
  inboxChatSelect.innerHTML = chats.length
    ? chats.map((c) => `<option value="${c.id}">${c.title || 'Chat'}</option>`).join('')
    : '<option value="">No chats yet</option>';

  const activeChat = chats.find((c) => c.id === selectedChatId()) || chats[0] || null;
  if (activeChat) inboxChatSelect.value = activeChat.id;
  const chatMessages = activeChat?.messages || [];
  inboxMessages.innerHTML = chatMessages.length
    ? chatMessages.map((m) => `<div class="msg ${m.role === 'user' ? 'user' : ''}">${m.content}</div>`).join('')
    : '<div class="msg">No messages yet.</div>';

  const streams = Array.isArray(ws.workstreams) ? ws.workstreams : [];
  workstreamList.innerHTML = streams.length
    ? streams.map((w) => `<li><strong>${w.name}</strong><br>${w.summary || ''}</li>`).join('')
    : '<li>No workstreams yet.</li>';

  const plans = Array.isArray(ws.dailyPlans) ? ws.dailyPlans : [];
  planSelect.innerHTML = plans.length
    ? plans.map((p) => `<option value="${p.id}">${p.date} · ${p.focusSummary}</option>`).join('')
    : '<option value="">No daily plans yet</option>';

  const activePlan = plans.find((p) => p.id === selectedPlanId()) || plans[0] || null;
  if (activePlan) planSelect.value = activePlan.id;

  const actions = Array.isArray(ws.actions) ? ws.actions : [];
  const actionById = new Map(actions.map((a) => [a.id, a]));
  const planLines = activePlan?.actionIds?.length
    ? activePlan.actionIds
        .map((id) => actionById.get(id))
        .filter(Boolean)
        .map((a) => `<div class="msg user"><strong>${a.title}</strong><br>${a.whyNow || ''}</div>`)
        .join('')
    : '<div class="msg">No actions on this plan yet.</div>';

  const planChats = Array.isArray(ws.planChats) ? ws.planChats : [];
  const chat = activePlan ? planChats.find((c) => c.planId === activePlan.id) : null;
  const chatLines = chat?.messages?.length
    ? chat.messages.map((m) => `<div class="msg">${m.content}</div>`).join('')
    : '';
  planActionList.innerHTML = `${planLines}${chatLines}`;
}

async function callWorkspace(action, payload = {}) {
  const res = await fetch('/api/workspace', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Workspace action failed');
  workspaceState = data.workspace;
  renderWorkspace();
}

async function loadWorkspace() {
  const res = await fetch('/api/workspace');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to load workspace');
  workspaceState = data.workspace;
  renderWorkspace();
}

async function createChat() {
  const content = String(inboxInput.value || '').trim();
  if (!content) return setStatus('Write something to start a chat.', true);
  setStatus('Creating inbox chat...');
  await callWorkspace('create_inbox_chat', { content });
  inboxInput.value = '';
  setStatus('Inbox chat created.');
}

async function sendChatMessage() {
  const content = String(inboxInput.value || '').trim();
  const chatId = selectedChatId();
  if (!content) return setStatus('Write a message first.', true);
  if (!chatId) return setStatus('Select or create a chat first.', true);
  setStatus('Sending message...');
  await callWorkspace('append_inbox_message', { chatId, content });
  inboxInput.value = '';
  setStatus('Message added.');
}

async function sendToG() {
  const chatId = selectedChatId();
  if (!chatId) return setStatus('Select a chat to commit.', true);
  setStatus('Sending to G and updating workstreams...');
  await callWorkspace('send_to_g', { chatId });
  inboxChatOverlay?.classList.add('hidden');
  setStatus('Committed to G.');
}

async function sendPlanChat() {
  const planId = selectedPlanId();
  const content = String(planChatInput.value || '').trim();
  if (!planId) return setStatus('Select a daily plan first.', true);
  if (!content) return setStatus('Write a plan chat message first.', true);
  setStatus('Updating plan chat...');
  await callWorkspace('append_plan_chat_message', { planId, content });
  planChatInput.value = '';
  setStatus('Plan chat updated.');
}

sendNowBtn?.addEventListener('click', sendNow);
openInboxChatBtn?.addEventListener('click', () => inboxChatOverlay?.classList.remove('hidden'));
closeInboxChatBtn?.addEventListener('click', () => inboxChatOverlay?.classList.add('hidden'));
logoutBtn?.addEventListener('click', logout);
newChatBtn?.addEventListener('click', () => createChat().catch((err) => setStatus(err.message || 'Failed', true)));
sendChatBtn?.addEventListener('click', () => sendChatMessage().catch((err) => setStatus(err.message || 'Failed', true)));
sendToGBtn?.addEventListener('click', () => sendToG().catch((err) => setStatus(err.message || 'Failed', true)));
sendPlanChatBtn?.addEventListener('click', () => sendPlanChat().catch((err) => setStatus(err.message || 'Failed', true)));
inboxChatSelect?.addEventListener('change', renderWorkspace);
planSelect?.addEventListener('change', renderWorkspace);
loadSession().catch((err) => setStatus(err.message || 'Failed to load session', true));
