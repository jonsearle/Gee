const interactionLogs = new Map();
const eventLogs = [];
const sourceSignals = new Map();

function bumpSourceSignal(sourceId, delta) {
  if (!sourceId) return;
  const current = sourceSignals.get(sourceId) || 0;
  sourceSignals.set(sourceId, Math.min(10, current + delta));
}

export function logInteraction(log) {
  interactionLogs.set(log.interaction_id, log);
}

export function logEvent(eventName, payload) {
  const timestamp = payload.timestamp || new Date().toISOString();
  eventLogs.push({
    event: eventName,
    ...payload,
    timestamp,
  });

  if (eventName === 'item_opened') {
    bumpSourceSignal(payload.source_id, 1);
  } else if (eventName === 'followup_prompt') {
    const prior = interactionLogs.get(payload.interaction_id);
    const surfacedIds = prior?.surfaced_ids || [];
    for (const id of surfacedIds) bumpSourceSignal(id, 0.5);
  }
}

export function getInteractionSignal(sourceId) {
  const score = sourceSignals.get(sourceId);
  if (!score) return 0;
  return Math.min(1, score / 5);
}

export function healthSnapshot() {
  return {
    connector: 'ok',
    orchestrator: 'ok',
    interactions_logged: interactionLogs.size,
    events_logged: eventLogs.length,
  };
}
