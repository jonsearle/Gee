import OpenAI from 'openai';
import { deriveThemeKey, themeDisplayName, uniqueStrings } from './theme-domain.js';

export function createLlmClient(apiKey) {
  return new OpenAI({ apiKey });
}

function buildPrompt({
  userName, nowIso, emails, calendar, isFirstRun, userPreferences, workspace,
}) {
  return `You are G, a calm and pragmatic daily planning assistant.

Today is ${nowIso}.
User name: ${userName}.

Task:
Synthesize a short daily planning email from Gmail + Calendar context.
Focus on outcomes and what should happen today.

Hard constraints:
- Do NOT suggest inbox management tactics.
- Do NOT mention labels/stars/archive/read status.
- Do NOT invent facts.
- Write in plain English.
- Keep tone calm, friendly, and practical.
- Sound helpful, not corporate.
- Never use jargon, buzzwords, or management-speak.
- Do not pretend to be human.
- Keep sentences short and direct.
- Max 5 main items.
- Avoid generic filler advice. If you cannot ground an item, omit it.

Style examples:
- Good: "Quiet day today. Good chance to finish X before lunch."
- Avoid: "Today is a strategic opportunity to optimize your commitments."

Return ONLY valid JSON with this exact shape:
{
  "focus_themes": [
    {
      "id": "stable_focus_theme_id",
      "name": "short focus theme name",
      "summary": "one-sentence description of this focus area",
      "anchor_terms": ["3-8 short anchor terms"]
    }
  ],
  "context_sentence": "string",
  "main_things": [
    {
      "focus_theme_id": "id from focus_themes",
      "theme": "short normalized theme label",
      "title": "outcome-focused item",
      "detail": "light grounding detail (person/date/why today)",
      "efficiency_hint": "short practical way to do this faster today",
      "help_links": [
        {
          "type": "email_thread | calendar_event | url",
          "label": "short action label",
          "thread_id": "gmail thread id when type=email_thread",
          "event_id": "calendar event id when type=calendar_event",
          "url": "https URL when type=url"
        }
      ]
    }
  ],
  "micro_nudge": "string",
  "can_wait": ["string"],
  "candidate_themes": ["string"],
  "observed_workstreams": ["string"]
}

For "observed_workstreams":
- On first run (${isFirstRun ? 'true' : 'false'}), include 3-5 concise bullets describing the main active areas inferred from recent messages and calendar.
- On non-first-run, return [].
- Keep this grounded and conservative.

If data is thin, still return useful conservative guidance.

Preference signals (if present):
- planning constraints: ${JSON.stringify(userPreferences?.planningConstraints || {})}
- preferred themes/topics: ${JSON.stringify(userPreferences?.preferredSections || [])}
- hidden themes/topics: ${JSON.stringify(userPreferences?.suppressedSections || [])}
- less-of themes/topics: ${JSON.stringify(userPreferences?.planningConstraints?.lessThemes || [])}
- tone preferences: ${JSON.stringify(userPreferences?.tonePrefs || {})}

Apply preferences only when supported by the provided data. Do not override factual grounding.
When deciding what matters, prioritize significance signals (deadlines, commitments, key people, explicit asks, calendar anchors) over raw message frequency.

For "help_links":
- Optional, 0-3 per main item.
- Include only when directly useful for doing the task.
- Use only references that appear in provided data:
  - email_thread: must use a real thread_id from EMAILS.
  - calendar_event: must use a real event_id from CALENDAR.
  - url: must use a real URL found in EMAILS or CALENDAR.
- Never invent links, IDs, or URLs.
- Keep labels short and plain (e.g. "Open thread", "Open event", "Open link").

For "theme":
- Keep it 1-4 words.
- Use broad, reusable labels (e.g. "career growth", "investments", "project planning").
- Avoid splitting very similar items into separate themes.
- Avoid dates, names, or sentence-like themes.

For "focus_themes":
- Return 3-6 focus areas total.
- Each should be broad enough to cover multiple related actions.
- "id" must be lowercase snake_case and stable for related items.
- Keep summaries practical and concrete.

For "candidate_themes":
- Return 5-12 themes that are relevant from provided context, including plausible but not selected topics.
- Exclude hidden themes if provided in preferences.
- Use the same style as "theme" and avoid near-duplicate variants.

Workspace guidance:
- WORKSPACE includes user-curated workstreams/actions from chat commits.
- Prefer unresolved workspace actions when they are still relevant today.
- Do not ignore strong workspace actions in favor of generic tasks.

Quality bar:
- Every main_things item must include at least one concrete anchor in title or detail:
  - person/team/company name, specific meeting/event, project name, email thread context, or explicit time/date.
- Do NOT output vague task titles such as:
  - "work on urgent tasks", "focus on high-impact tasks", "handle pending work", "prioritize important items".
- For can_wait, avoid generic placeholders like:
  - "non-urgent emails", "routine admin tasks", "long-term projects".
- If data is insufficient, return fewer, higher-quality items rather than generic filler.

Data follows:
EMAILS=${JSON.stringify(emails)}
CALENDAR=${JSON.stringify(calendar)}
WORKSPACE=${JSON.stringify(workspace || {})}
`;
}

function parseJsonSafely(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('LLM returned empty response');

  try {
    return JSON.parse(raw);
  } catch {
    const fencedMatch = raw.match(/```json\s*([\s\S]*?)\s*```/i) || raw.match(/```\s*([\s\S]*?)\s*```/i);
    if (fencedMatch?.[1]) {
      try {
        return JSON.parse(fencedMatch[1].trim());
      } catch {
        // Continue to bracket extraction fallback.
      }
    }

    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
      } catch {
        // Fall through to final error.
      }
    }

    throw new Error('LLM did not return valid JSON');
  }
}

function collectAllowedUrls(payload) {
  const urlRegex = /https?:\/\/[^\s<>)"']+/gi;
  const urls = new Set();
  const text = JSON.stringify(payload || {});
  const matches = text.match(urlRegex) || [];
  for (const match of matches) urls.add(match);
  return urls;
}

function toHelpLink(link, allow) {
  const type = String(link?.type || '').trim();
  const label = String(link?.label || '').trim() || 'Open link';
  const threadId = String(link?.thread_id || '').trim();
  const eventId = String(link?.event_id || '').trim();
  const url = String(link?.url || '').trim();

  if (type === 'email_thread' && threadId && allow.threadIds.has(threadId)) {
    return {
      type,
      label,
      href: `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(threadId)}`,
    };
  }

  if (type === 'calendar_event' && eventId && allow.eventIds.has(eventId)) {
    const htmlLink = allow.eventLinksById.get(eventId);
    return {
      type,
      label,
      href: htmlLink || `https://calendar.google.com/calendar/u/0/r/search?q=${encodeURIComponent(eventId)}`,
    };
  }

  if (type === 'url' && /^https?:\/\//i.test(url) && allow.urls.has(url)) {
    return {
      type,
      label,
      href: url,
    };
  }

  return null;
}

const GENERIC_ACTION_PATTERNS = [
  /\bhigh[-\s]?impact tasks?\b/i,
  /\burgent tasks?\b/i,
  /\bpending work\b/i,
  /\bimportant tasks?\b/i,
  /\bcritical tasks?\b/i,
  /\bmaintain momentum\b/i,
  /\bwork on\b.*\btasks?\b/i,
];

const GENERIC_CAN_WAIT_PATTERNS = [
  /\bnon[-\s]?urgent emails?\b/i,
  /\broutine admin(istrative)? tasks?\b/i,
  /\blong[-\s]?term projects?\b/i,
];

function hasConcreteAnchor(text) {
  const value = String(text || '');
  if (!value) return false;

  // Signals: explicit time/date, proper names, or concrete nouns from context.
  const hasTime = /\b\d{1,2}(:\d{2})?\s?(am|pm)\b/i.test(value) || /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(value);
  const hasCapitalizedEntity = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/.test(value);
  const hasSpecificNoun = /\b(interview|meeting|proposal|contract|application|project|thread|event|brief|report|deck)\b/i.test(value);

  return hasTime || hasCapitalizedEntity || hasSpecificNoun;
}

function isGenericActionItem(item) {
  const text = `${String(item?.title || '')} ${String(item?.detail || '')}`;
  return GENERIC_ACTION_PATTERNS.some((re) => re.test(text));
}

function isGenericCanWaitItem(text) {
  const value = String(text || '').trim();
  if (!value) return true;
  return GENERIC_CAN_WAIT_PATTERNS.some((re) => re.test(value));
}

function normalizeTitleKey(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function workspaceActionsToMainThings(workspace) {
  const actions = Array.isArray(workspace?.actions) ? workspace.actions : [];
  const workstreams = Array.isArray(workspace?.workstreams) ? workspace.workstreams : [];
  const wsById = new Map(workstreams.map((w) => [w.id, w]));

  return actions
    .filter((a) => !['done', 'deferred'].includes(String(a?.status || '').toLowerCase()))
    .map((a) => {
      const ws = wsById.get(a.workstreamId);
      const themeLabel = String(ws?.name || '').trim();
      const themeKey = deriveThemeKey(themeLabel || 'workstream');
      return {
        focusThemeId: '',
        theme: themeLabel || themeDisplayName(themeKey),
        themeKey,
        themeLabel: themeLabel || themeDisplayName(themeKey),
        title: String(a?.title || '').trim(),
        detail: String(a?.whyNow || '').trim(),
        efficiencyHint: String(a?.efficiencyHint || '').trim(),
        helpLinks: [],
        _score: Number(a?.salience) || 0.5,
      };
    })
    .filter((a) => a.title)
    .sort((a, b) => b._score - a._score)
    .slice(0, 3);
}

export async function synthesizeDailyPlan(client, model, payload) {
  const prompt = buildPrompt(payload);
  const calendarEvents = [
    ...(payload?.calendar?.todayTomorrow || []),
    ...(payload?.calendar?.referenced || []),
  ];
  const eventLinksById = new Map(
    calendarEvents
      .map((e) => [String(e?.id || '').trim(), String(e?.htmlLink || '').trim()])
      .filter(([id, href]) => id && /^https?:\/\//i.test(href)),
  );
  const allow = {
    threadIds: new Set((payload?.emails || []).map((e) => String(e?.threadId || '').trim()).filter(Boolean)),
    eventIds: new Set(calendarEvents.map((e) => String(e?.id || '').trim()).filter(Boolean)),
    eventLinksById,
    urls: collectAllowedUrls(payload),
  };

  const res = await client.responses.create({
    model,
    input: prompt,
    temperature: 0.3,
  });

  const text = res.output_text || '';
  const json = parseJsonSafely(text);
  const hiddenThemeKeys = new Set(
    uniqueStrings(payload?.userPreferences?.suppressedSections || [])
      .map((x) => deriveThemeKey(x))
      .filter(Boolean),
  );
  const focusThemes = Array.isArray(json.focus_themes)
    ? json.focus_themes
        .map((t) => ({
          id: String(t?.id || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, ''),
          key: deriveThemeKey(String(t?.name || ''), String(t?.summary || '')),
          name: String(t?.name || '').trim(),
          summary: String(t?.summary || '').trim(),
          anchorTerms: Array.isArray(t?.anchor_terms)
            ? t.anchor_terms.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 8)
            : [],
        }))
        .filter((t) => t.id && t.key)
        .map((t) => ({
          ...t,
          name: themeDisplayName(t.key),
        }))
        .slice(0, 8)
    : [];
  const focusThemeById = new Map(focusThemes.map((t) => [t.id, t]));
  const parsedMainThings = Array.isArray(json.main_things)
    ? json.main_things
        .map((i) => ({
          focusThemeId: String(i?.focus_theme_id || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, ''),
          theme: String(i?.theme || '').trim(),
          title: String(i?.title || '').trim(),
          detail: String(i?.detail || '').trim(),
          efficiencyHint: String(i?.efficiency_hint || '').trim(),
          helpLinks: Array.isArray(i?.help_links)
            ? i.help_links.map((link) => toHelpLink(link, allow)).filter(Boolean).slice(0, 3)
            : [],
        }))
        .map((i) => {
          const matchedTheme = focusThemeById.get(i.focusThemeId);
          const themeKey = matchedTheme?.key || deriveThemeKey(i.theme || i.focusThemeId);
          const themeLabel = themeDisplayName(themeKey);
          return {
            ...i,
            themeKey,
            themeLabel,
          };
        })
        .filter((i) => i.title)
        .filter((i) => !isGenericActionItem(i))
        .filter((i) => hasConcreteAnchor(`${i.title} ${i.detail}`) || i.helpLinks.length > 0)
        .slice(0, 5)
    : [];
  const modelMainThings = parsedMainThings.filter((item) => !hiddenThemeKeys.has(item.themeKey));
  const workspaceMainThings = workspaceActionsToMainThings(payload?.workspace || {})
    .filter((item) => !hiddenThemeKeys.has(item.themeKey));
  const mainThings = [];
  const seen = new Set();
  for (const item of [...workspaceMainThings, ...modelMainThings]) {
    const key = normalizeTitleKey(item.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    mainThings.push(item);
    if (mainThings.length >= 5) break;
  }
  const candidateThemes = Array.isArray(json.candidate_themes)
    ? json.candidate_themes.map((x) => String(x).trim()).filter(Boolean)
    : [];
  const candidateThemeKeys = [];
  for (const theme of focusThemes) {
    if (theme.key) candidateThemeKeys.push(theme.key);
  }
  for (const item of mainThings) {
    if (item.themeKey) candidateThemeKeys.push(item.themeKey);
  }
  for (const ws of Array.isArray(payload?.workspace?.workstreams) ? payload.workspace.workstreams : []) {
    const key = deriveThemeKey(ws?.name || ws?.summary || '');
    if (key) candidateThemeKeys.push(key);
  }
  for (const theme of candidateThemes) {
    const key = deriveThemeKey(theme);
    if (key) candidateThemeKeys.push(key);
  }

  return {
    focusThemes,
    contextSentence: String(json.context_sentence || '').trim(),
    mainThings,
    microNudge: String(json.micro_nudge || '').trim(),
    canWait: Array.isArray(json.can_wait)
      ? json.can_wait
          .map((x) => String(x).trim())
          .filter((x) => !isGenericCanWaitItem(x))
          .slice(0, 3)
      : [],
    candidateThemes: [...new Set(candidateThemeKeys)]
      .filter((key) => !hiddenThemeKeys.has(key))
      .map((key) => themeDisplayName(key))
      .slice(0, 16),
    observedWorkstreams: Array.isArray(json.observed_workstreams)
      ? json.observed_workstreams.map((x) => String(x).trim()).filter(Boolean).slice(0, 5)
      : [],
  };
}
