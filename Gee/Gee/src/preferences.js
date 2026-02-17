import fs from 'node:fs/promises';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function defaultPreferences() {
  return {
    autoSendDailyEmail: true,
    updatedAt: new Date().toISOString(),
  };
}

export async function loadPreferencesFile(path) {
  try {
    const raw = await fs.readFile(path, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : { users: {} };
  } catch {
    return { users: {} };
  }
}

export async function savePreferencesFile(path, store) {
  await fs.writeFile(path, JSON.stringify(store, null, 2), 'utf8');
}

export async function getUserPreferences(path, email) {
  const key = normalizeEmail(email);
  if (!key) throw new Error('Email is required');

  const store = await loadPreferencesFile(path);
  const prefs = store.users?.[key] || defaultPreferences();
  return {
    email: key,
    autoSendDailyEmail: Boolean(prefs.autoSendDailyEmail),
    updatedAt: prefs.updatedAt || new Date().toISOString(),
  };
}

export async function setUserPreferences(path, email, updates) {
  const key = normalizeEmail(email);
  if (!key) throw new Error('Email is required');

  const store = await loadPreferencesFile(path);
  const current = store.users?.[key] || defaultPreferences();

  const next = {
    ...current,
    ...updates,
    autoSendDailyEmail: Boolean(
      Object.prototype.hasOwnProperty.call(updates, 'autoSendDailyEmail')
        ? updates.autoSendDailyEmail
        : current.autoSendDailyEmail,
    ),
    updatedAt: new Date().toISOString(),
  };

  if (!store.users) store.users = {};
  store.users[key] = next;

  await savePreferencesFile(path, store);
  return {
    email: key,
    autoSendDailyEmail: next.autoSendDailyEmail,
    updatedAt: next.updatedAt,
  };
}
