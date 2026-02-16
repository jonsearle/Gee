import fs from 'node:fs/promises';

export async function loadState(path) {
  try {
    const raw = await fs.readFile(path, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      firstRunCompleted: Boolean(parsed.firstRunCompleted),
      lastRunAt: parsed.lastRunAt || null,
      lastThreadIds: Array.isArray(parsed.lastThreadIds) ? parsed.lastThreadIds : [],
    };
  } catch {
    return {
      firstRunCompleted: false,
      lastRunAt: null,
      lastThreadIds: [],
    };
  }
}

export async function saveState(path, state) {
  await fs.writeFile(path, JSON.stringify(state, null, 2), 'utf8');
}
