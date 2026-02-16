const emailInput = document.getElementById('emailInput');
const loadBtn = document.getElementById('loadBtn');
const saveBtn = document.getElementById('saveBtn');
const panel = document.getElementById('prefsPanel');
const toggle = document.getElementById('autoSendToggle');
const statusText = document.getElementById('statusText');

function setStatus(text, isError = false) {
  statusText.textContent = text;
  statusText.style.color = isError ? '#b3261e' : '#5f7466';
}

async function loadPrefs() {
  const email = emailInput.value.trim();
  if (!email) {
    setStatus('Enter an email address first.', true);
    return;
  }

  setStatus('Loading...');
  try {
    const res = await fetch(`/api/preferences?email=${encodeURIComponent(email)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load preferences');

    toggle.checked = Boolean(data.autoSendDailyEmail);
    panel.classList.remove('hidden');
    setStatus('Loaded.');
  } catch (err) {
    setStatus(err.message || 'Load failed', true);
  }
}

async function savePrefs() {
  const email = emailInput.value.trim();
  if (!email) {
    setStatus('Enter an email address first.', true);
    return;
  }

  setStatus('Saving...');
  try {
    const res = await fetch('/api/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        autoSendDailyEmail: toggle.checked,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save preferences');

    setStatus(`Saved. Daily email is ${data.autoSendDailyEmail ? 'ON' : 'OFF'}.`);
  } catch (err) {
    setStatus(err.message || 'Save failed', true);
  }
}

loadBtn.addEventListener('click', loadPrefs);
saveBtn.addEventListener('click', savePrefs);
