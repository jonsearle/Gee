import OpenAI from 'openai';

export function createLlmClient(apiKey) {
  return new OpenAI({ apiKey });
}

function buildPrompt({
  userName, nowIso, emails, calendar, isFirstRun, userPreferences,
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
- Keep tone calm, professional, enabling.
- Max 5 main items.

Return ONLY valid JSON with this exact shape:
{
  "context_sentence": "string",
  "main_things": [
    {
      "title": "outcome-focused item",
      "detail": "light grounding detail (person/date/why today)"
    }
  ],
  "micro_nudge": "string",
  "can_wait": ["string"],
  "efficiency_suggestions": ["string"],
  "observed_workstreams": ["string"]
}

For "observed_workstreams":
- On first run (${isFirstRun ? 'true' : 'false'}), include 3-5 concise bullets describing the main active areas inferred from recent messages and calendar.
- On non-first-run, return [].
- Keep this grounded and conservative.

If data is thin, still return useful conservative guidance.

Preference signals (if present):
- planning constraints: ${JSON.stringify(userPreferences?.planningConstraints || {})}
- preferred sections/topics: ${JSON.stringify(userPreferences?.preferredSections || [])}
- suppressed sections/topics: ${JSON.stringify(userPreferences?.suppressedSections || [])}
- tone preferences: ${JSON.stringify(userPreferences?.tonePrefs || {})}

Apply preferences only when supported by the provided data. Do not override factual grounding.

Data follows:
EMAILS=${JSON.stringify(emails)}
CALENDAR=${JSON.stringify(calendar)}
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

export async function synthesizeDailyPlan(client, model, payload) {
  const prompt = buildPrompt(payload);

  const res = await client.responses.create({
    model,
    input: prompt,
    temperature: 0.3,
  });

  const text = res.output_text || '';
  const json = parseJsonSafely(text);

  return {
    contextSentence: String(json.context_sentence || '').trim(),
    mainThings: Array.isArray(json.main_things)
      ? json.main_things
          .map((i) => ({
            title: String(i?.title || '').trim(),
            detail: String(i?.detail || '').trim(),
          }))
          .filter((i) => i.title)
          .slice(0, 5)
      : [],
    microNudge: String(json.micro_nudge || '').trim(),
    canWait: Array.isArray(json.can_wait)
      ? json.can_wait.map((x) => String(x).trim()).filter(Boolean).slice(0, 3)
      : [],
    efficiencySuggestions: Array.isArray(json.efficiency_suggestions)
      ? json.efficiency_suggestions.map((x) => String(x).trim()).filter(Boolean).slice(0, 3)
      : [],
    observedWorkstreams: Array.isArray(json.observed_workstreams)
      ? json.observed_workstreams.map((x) => String(x).trim()).filter(Boolean).slice(0, 5)
      : [],
  };
}
