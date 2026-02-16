const signedOut = document.getElementById('signedOut');
const signedIn = document.getElementById('signedIn');
const whoami = document.getElementById('whoami');
const toggle = document.getElementById('autoSendToggle');
const sendHour = document.getElementById('sendHour');
const saveBtn = document.getElementById('saveBtn');
const logoutBtn = document.getElementById('logoutBtn');
const statusText = document.getElementById('statusText');

for (let h = 0; h <= 23; h += 1) {
  const opt = document.createElement('option');
  opt.value = String(h);
  opt.textContent = `${String(h).padStart(2, '0')}:00 UTC`;
  sendHour.appendChild(opt);
}

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

  const prefRes = await fetch('/api/preferences');
  const pref = await prefRes.json();

  toggle.checked = Boolean(pref.autoSendDailyEmail);
  sendHour.value = String(pref.sendHourUtc ?? 9);
  setStatus(data.user.hasRefreshToken ? 'Connected successfully.' : 'Connected, but refresh token missing. Re-connect Google.', !data.user.hasRefreshToken);
}

async function savePreferences() {
  setStatus('Saving...');

  try {
    const res = await fetch('/api/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        autoSendDailyEmail: toggle.checked,
        sendHourUtc: Number(sendHour.value),
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Save failed');

    setStatus(`Saved. Daily email is ${data.autoSendDailyEmail ? 'ON' : 'OFF'} at ${String(data.sendHourUtc).padStart(2, '0')}:00 UTC.`);
  } catch (err) {
    setStatus(err.message || 'Save failed', true);
  }
}

async function logout() {
  await fetch('/auth/logout', { method: 'POST' });
  window.location.reload();
}

saveBtn.addEventListener('click', savePreferences);
logoutBtn.addEventListener('click', logout);
loadSession().catch((err) => setStatus(err.message || 'Failed to load session', true));
