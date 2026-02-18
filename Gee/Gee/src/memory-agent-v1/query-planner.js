import {
  endOfDay, startOfDay, subDays, subMonths,
} from 'date-fns';
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

function resolveDateRange(understanding, now) {
  const type = understanding?.date_constraints?.type || 'none';
  if (type === 'today') {
    return {
      dateFrom: startOfDay(now).toISOString(),
      dateTo: endOfDay(now).toISOString(),
    };
  }
  if (type === 'yesterday') {
    const day = subDays(now, 1);
    return {
      dateFrom: startOfDay(day).toISOString(),
      dateTo: endOfDay(day).toISOString(),
    };
  }
  if (type === 'last_7_days') {
    return {
      dateFrom: subDays(now, 7).toISOString(),
      dateTo: now.toISOString(),
    };
  }
  if (type === 'last_30_days') {
    return {
      dateFrom: subDays(now, 30).toISOString(),
      dateTo: now.toISOString(),
    };
  }
  if (type === 'iso_range' && understanding?.date_constraints?.date_from && understanding?.date_constraints?.date_to) {
    return {
      dateFrom: new Date(understanding.date_constraints.date_from).toISOString(),
      dateTo: new Date(understanding.date_constraints.date_to).toISOString(),
    };
  }
  return {
    dateFrom: subMonths(now, RETRIEVAL_POLICY.timeWindowMonths).toISOString(),
    dateTo: now.toISOString(),
  };
}

function toolsFromUnderstanding(normalized, understanding) {
  const pref = understanding?.source_preference;
  if (pref === 'email') return ['email'];
  if (pref === 'calendar') return ['calendar'];
  return pickTools(normalized.cleaned);
}

export function buildQueryPlan(normalized, understanding) {
  const tools = toolsFromUnderstanding(normalized, understanding);
  const fallbackVariants = buildVariants(normalized);
  const now = new Date();
  const { dateFrom, dateTo } = resolveDateRange(understanding, now);
  const mergedEntities = distinct([...(understanding?.entities || []), ...(normalized.entities || [])]).slice(0, 5);
  const recentOrCountIntent = understanding?.intent === 'recent_activity' || understanding?.intent === 'count_by_time';

  const calls = [];
  for (const tool of tools) {
    const toolVariants = distinct(
      understanding?.query_variants_by_tool?.[tool]?.length
        ? understanding.query_variants_by_tool[tool]
        : fallbackVariants,
    ).slice(0, RETRIEVAL_POLICY.maxSemanticVariantsPerTool);
    const variants = toolVariants.length ? toolVariants : [''];

    for (const query of variants) {
      if (calls.length >= RETRIEVAL_POLICY.maxToolCallsPerRequest) break;
      if (tool === 'email') {
        calls.push({
          tool,
          query,
          filters: {
            date_from: dateFrom,
            date_to: dateTo,
            participants: mergedEntities,
            thread_only: !recentOrCountIntent,
            max_results: recentOrCountIntent
              ? Math.max(8, understanding?.requested_count || 3)
              : RETRIEVAL_POLICY.maxResultsPerToolCall,
          },
        });
      } else {
        calls.push({
          tool,
          query,
          filters: {
            date_from: dateFrom,
            date_to: dateTo,
            attendees: mergedEntities,
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
