import crypto from 'node:crypto';
import { normalizeInput } from './normalizer.js';
import { buildQueryPlan } from './query-planner.js';
import { searchCalendar, searchEmail } from './connectors.js';
import { rankCandidates } from './ranker.js';
import { synthesizeResponse } from './synthesizer.js';
import { assertResponseSchema } from './schema.js';
import { getInteractionSignal, logInteraction } from './telemetry.js';

function summarizeInput(input) {
  return String(input || '').slice(0, 240);
}

export async function runMemoryQuery({
  userId,
  userInput,
  sessionId,
  gmail,
  calendar,
  llm = null,
}) {
  const interactionId = crypto.randomUUID();
  const normalized = normalizeInput(userInput);
  const plan = buildQueryPlan(normalized);

  const queryLogs = [];
  const retrievedIds = [];
  const toolsUsed = [...new Set(plan.calls.map((c) => c.tool))];
  const retrievedCount = { email: 0, calendar: 0 };

  const results = await Promise.all(plan.calls.map(async (call) => {
    queryLogs.push({
      tool: call.tool,
      query: call.query,
      filters: call.filters,
    });
    if (call.tool === 'email') {
      const out = await searchEmail(gmail, call.query, call.filters);
      retrievedCount.email += out.items.length;
      for (const i of out.items) retrievedIds.push(i.id);
      return { tool: 'email', items: out.items };
    }
    const out = await searchCalendar(calendar, call.query, call.filters);
    retrievedCount.calendar += out.items.length;
    for (const i of out.items) retrievedIds.push(i.id);
    return { tool: 'calendar', items: out.items };
  }));

  const emailItems = results.filter((r) => r.tool === 'email').flatMap((r) => r.items);
  const calendarItems = results.filter((r) => r.tool === 'calendar').flatMap((r) => r.items);

  const ranked = rankCandidates({
    normalized,
    emailItems,
    calendarItems,
    interactionSignalProvider: getInteractionSignal,
  });
  const response = await synthesizeResponse({
    llm,
    userInput,
    confidence: ranked.confidence,
    surfaced: ranked.surfaced,
  });
  assertResponseSchema(response);

  const telemetry = {
    interaction_id: interactionId,
    user_id: String(userId),
    timestamp: new Date().toISOString(),
    input_summary: summarizeInput(userInput),
    session_id: String(sessionId || ''),
    tools_used: toolsUsed,
    queries: queryLogs,
    retrieved_count: retrievedCount,
    retrieved_ids: [...new Set(retrievedIds)],
    surfaced_ids: response.items.map((item) => item.source_id),
    scores: ranked.scored.map((x) => ({
      id: x.item.id,
      score: Number(x.score.toFixed(4)),
    })),
    response_confidence: response.confidence,
  };

  logInteraction(telemetry);

  // Termination rule: single retrieval+synthesis cycle per user prompt.
  // This function returns immediately after synthesis and does not re-enter retrieval.
  return {
    interactionId,
    response,
    telemetry,
  };
}
