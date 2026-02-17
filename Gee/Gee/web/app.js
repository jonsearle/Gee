const signedOut = document.getElementById('signedOut');
const signedIn = document.getElementById('signedIn');
const whoami = document.getElementById('whoami');
const sendNowBtn = document.getElementById('sendNowBtn');
const logoutBtn = document.getElementById('logoutBtn');
const statusText = document.getElementById('statusText');

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

sendNowBtn?.addEventListener('click', sendNow);
logoutBtn?.addEventListener('click', logout);
loadSession().catch((err) => setStatus(err.message || 'Failed to load session', true));
