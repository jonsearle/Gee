import { subMonths } from 'date-fns';
import { RETRIEVAL_POLICY } from './constants.js';

function pickTools(text) {
  const lower = text.toLowerCase();
  const emailSignal = /(email|inbox|thread|message|subject|reply|sent)/.test(lower);
  const calendarSignal = /(calendar|meeting|event|schedule|invite|attendee)/.test(lower);

  if (emailSignal && calendarSignal) return ['email', 'calendar'];
  if (emailSignal) return ['email'];
  if (calendarSignal) return ['calendar'];
  return ['email', 'calendar'];
}

function distinct(values) {
  return [...new Set(values.map((x) => String(x || '').trim()).filter(Boolean))];
}

function buildVariants(normalized) {
  const variants = [normalized.cleaned];
  if (normalized.entities.length) variants.push(normalized.entities.slice(0, 5).join(' '));
  if (variants.length < RETRIEVAL_POLICY.maxSemanticVariantsPerTool && normalized.toneHints.length) {
    variants.push(normalized.toneHints.join(' '));
  }
  return distinct(variants).slice(0, RETRIEVAL_POLICY.maxSemanticVariantsPerTool);
}

export function buildQueryPlan(normalized) {
  const tools = pickTools(normalized.cleaned);
  const variants = buildVariants(normalized);
  const now = new Date();
  const dateFrom = subMonths(now, RETRIEVAL_POLICY.timeWindowMonths).toISOString();
  const dateTo = now.toISOString();

  const calls = [];
  for (const tool of tools) {
    for (const query of variants) {
      if (calls.length >= RETRIEVAL_POLICY.maxToolCallsPerRequest) break;
      if (tool === 'email') {
        calls.push({
          tool,
          query,
          filters: {
            date_from: dateFrom,
            date_to: dateTo,
            participants: normalized.entities.slice(0, 5),
            thread_only: true,
            max_results: RETRIEVAL_POLICY.maxResultsPerToolCall,
          },
        });
      } else {
        calls.push({
          tool,
          query,
          filters: {
            date_from: dateFrom,
            date_to: dateTo,
            attendees: normalized.entities.slice(0, 5),
            max_results: RETRIEVAL_POLICY.maxResultsPerToolCall,
          },
        });
      }
    }
  }

  return {
    tools,
    calls: calls.slice(0, RETRIEVAL_POLICY.maxToolCallsPerRequest),
  };
}
