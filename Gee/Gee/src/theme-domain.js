function clean(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toKey(text) {
  return clean(text)
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

export function deriveThemeKey(name, summary = '') {
  const text = `${clean(name)} ${clean(summary)}`.trim();
  if (!text) return '';

  if (/(career|interview|job|application|network|skill|development|preparation)/.test(text)) return 'career_growth';
  if (/(project|product|team|meeting|follow|feedback|update|execution|planning|time management)/.test(text)) return 'work_execution';
  if (/(learning|study|course|training)/.test(text)) return 'learning';
  if (/(personal project|side project)/.test(text)) return 'personal_projects';
  if (/(invest|investment|finance|fund|portfolio)/.test(text)) return 'finance';

  return toKey(name || summary);
}

export function themeDisplayName(key) {
  const map = {
    career_growth: 'career growth',
    work_execution: 'work execution',
    learning: 'learning',
    personal_projects: 'personal projects',
    finance: 'finance',
  };
  return map[key] || String(key || '').replaceAll('_', ' ');
}

export function themeDefaultSummary(key) {
  const map = {
    career_growth: 'Interviews, applications, and career progression actions.',
    work_execution: 'Projects, meetings, follow-ups, and delivery work.',
    learning: 'Study, training, and skill-building tasks.',
    personal_projects: 'Personal initiatives and side projects.',
    finance: 'Money, investment, and financial admin topics.',
  };
  return map[key] || '';
}

export function uniqueStrings(items = []) {
  return [...new Set(
    (Array.isArray(items) ? items : [])
      .map((x) => String(x || '').trim())
      .filter(Boolean),
  )];
}

export function normalizePreferenceThemeKey(input) {
  return deriveThemeKey(String(input || ''));
}

export function buildThemeCluster(candidates = [], maxThemes = 8) {
  const byKey = new Map();
  for (const candidate of candidates) {
    const key = deriveThemeKey(candidate?.name, candidate?.summary);
    if (!key) continue;

    const existing = byKey.get(key) || {
      key,
      name: themeDisplayName(key),
      summary: '',
      examples: [],
      count: 0,
      lastSeenAt: '',
    };

    existing.count += 1;
    if (candidate?.lastSeenAt && String(candidate.lastSeenAt) > String(existing.lastSeenAt)) {
      existing.lastSeenAt = String(candidate.lastSeenAt);
    }
    if (!existing.summary && candidate?.summary) existing.summary = String(candidate.summary);

    const raw = String(candidate?.raw || candidate?.name || '').trim();
    if (raw && existing.examples.length < 3 && !existing.examples.includes(raw)) {
      existing.examples.push(raw);
    }

    byKey.set(key, existing);
  }

  return [...byKey.values()]
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return String(b.lastSeenAt).localeCompare(String(a.lastSeenAt));
    })
    .slice(0, maxThemes)
    .map((x) => ({
      ...x,
      summary: x.summary || themeDefaultSummary(x.key),
    }));
}
