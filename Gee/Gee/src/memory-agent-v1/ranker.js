import { RETRIEVAL_POLICY, SCORE_THRESHOLDS, SCORE_WEIGHTS } from './constants.js';

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'give', 'get', 'hi', 'how', 'i',
  'if', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'please', 'show', 'the', 'there', 'to', 'we',
  'what', 'when', 'where', 'which', 'who', 'with', 'you', 'your',
]);

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9@._-]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => !STOPWORDS.has(x));
}

function overlapRatio(a, b) {
  if (!a.length || !b.length) return 0;
  const bSet = new Set(b);
  const hits = a.filter((x) => bSet.has(x)).length;
  return hits / Math.max(1, Math.min(a.length, b.length));
}

function sourceText(item, sourceType) {
  if (sourceType === 'email') {
    return [item.subject, item.from, ...(item.to || []), ...(item.cc || []), item.snippet, item.body_preview].join(' ');
  }
  return [item.title, item.organizer, ...(item.attendees || []), item.description_preview].join(' ');
}

function scoreEntityMatch(item, sourceType, normalized) {
  const entities = tokenize(normalized.entities.join(' '));
  if (!entities.length) return 0.2;
  const itemTerms = tokenize(sourceText(item, sourceType));
  return Math.min(1, overlapRatio(entities, itemTerms) * 1.2);
}

function scoreIntentMatch(item, sourceType, normalized) {
  if (!normalized.toneHints.length) return 0.15;
  const text = sourceText(item, sourceType).toLowerCase();
  let hits = 0;
  for (const hint of normalized.toneHints) {
    if (hint === 'urgent' && /(urgent|asap|priority|immediately)/.test(text)) hits += 1;
    if (hint === 'delay' && /(delay|blocked|stuck|late|pending)/.test(text)) hits += 1;
    if (hint === 'decision' && /(decision|approve|approved|sign-off|go\/no-go)/.test(text)) hits += 1;
    if (hint === 'reply' && /(reply|respond|follow up|follow-up)/.test(text)) hits += 1;
  }
  return hits ? Math.min(1, hits / normalized.toneHints.length) : 0.1;
}

function scoreTemporalRelevance(item, sourceType, normalized) {
  const iso = sourceType === 'email' ? item.timestamp : item.start_time;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 0.2;

  const daysOld = Math.max(0, (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  const recency = Math.max(0, 1 - (daysOld / 365));
  if (!normalized.dateHints.length) return recency;

  const text = normalized.dateHints.join(' ').toLowerCase();
  if (/\d{4}-\d{2}-\d{2}/.test(text)) {
    const isoDate = iso.slice(0, 10);
    if (text.includes(isoDate)) return 1;
    return recency * 0.6;
  }
  return recency;
}

function scoreSourceQuality(item, sourceType) {
  if (sourceType === 'email') {
    let score = 0.4;
    if ((item.subject || '').length >= 10) score += 0.2;
    if ((item.body_preview || '').length >= 80) score += 0.2;
    if ((item.to || []).length + (item.cc || []).length >= 2) score += 0.2;
    return Math.min(1, score);
  }

  let score = 0.4;
  if ((item.attendees || []).length >= 2) score += 0.3;
  if ((item.description_preview || '').length >= 40) score += 0.2;
  if (item.organizer) score += 0.1;
  return Math.min(1, score);
}

function reasonText(item, sourceType, normalized) {
  const parts = [];
  if (normalized.entities.length) {
    const hitEntity = normalized.entities.find((e) => sourceText(item, sourceType).toLowerCase().includes(e.toLowerCase()));
    if (hitEntity) parts.push(`entity match: ${hitEntity}`);
  }
  if (normalized.dateHints.length) parts.push('time context match');
  if (normalized.toneHints.length) parts.push(`intent signal: ${normalized.toneHints.join(', ')}`);
  if (!parts.length) parts.push('semantic relevance to prompt');
  return parts.join('; ');
}

export function rankCandidates({ normalized, emailItems, calendarItems, interactionSignalProvider }) {
  const promptTerms = tokenize(normalized.cleaned);
  const scored = [];
  for (const item of emailItems) {
    const itemTerms = tokenize(sourceText(item, 'email'));
    const promptOverlap = overlapRatio(promptTerms, itemTerms);
    const entityMatch = scoreEntityMatch(item, 'email', normalized);
    const intentMatch = scoreIntentMatch(item, 'email', normalized);
    const temporalRelevance = scoreTemporalRelevance(item, 'email', normalized);
    const interactionSignal = interactionSignalProvider?.(item.id) ?? 0;
    const sourceQuality = scoreSourceQuality(item, 'email');
    let score = (entityMatch * SCORE_WEIGHTS.entityMatch)
      + (intentMatch * SCORE_WEIGHTS.intentMatch)
      + (temporalRelevance * SCORE_WEIGHTS.temporalRelevance)
      + (interactionSignal * SCORE_WEIGHTS.interactionSignal)
      + (sourceQuality * SCORE_WEIGHTS.sourceQuality);

    const hasGroundingSignal = entityMatch >= 0.3
      || promptOverlap >= 0.2
      || (normalized.dateHints.length > 0 && temporalRelevance >= 0.6);
    if (!hasGroundingSignal) score = Math.min(score, SCORE_THRESHOLDS.maybe - 0.01);

    scored.push({ source_type: 'email', item, score, why_relevant: reasonText(item, 'email', normalized) });
  }

  for (const item of calendarItems) {
    const itemTerms = tokenize(sourceText(item, 'calendar'));
    const promptOverlap = overlapRatio(promptTerms, itemTerms);
    const entityMatch = scoreEntityMatch(item, 'calendar', normalized);
    const intentMatch = scoreIntentMatch(item, 'calendar', normalized);
    const temporalRelevance = scoreTemporalRelevance(item, 'calendar', normalized);
    const interactionSignal = interactionSignalProvider?.(item.id) ?? 0;
    const sourceQuality = scoreSourceQuality(item, 'calendar');
    let score = (entityMatch * SCORE_WEIGHTS.entityMatch)
      + (intentMatch * SCORE_WEIGHTS.intentMatch)
      + (temporalRelevance * SCORE_WEIGHTS.temporalRelevance)
      + (interactionSignal * SCORE_WEIGHTS.interactionSignal)
      + (sourceQuality * SCORE_WEIGHTS.sourceQuality);

    const hasGroundingSignal = entityMatch >= 0.3
      || promptOverlap >= 0.2
      || (normalized.dateHints.length > 0 && temporalRelevance >= 0.6);
    if (!hasGroundingSignal) score = Math.min(score, SCORE_THRESHOLDS.maybe - 0.01);

    scored.push({ source_type: 'calendar', item, score, why_relevant: reasonText(item, 'calendar', normalized) });
  }

  scored.sort((a, b) => b.score - a.score);

  const deduped = [];
  const seen = new Set();
  for (const row of scored) {
    if (seen.has(row.item.id)) continue;
    seen.add(row.item.id);
    deduped.push(row);
  }

  const high = deduped.filter((x) => x.score >= SCORE_THRESHOLDS.high);
  let surfaced = high.slice(0, RETRIEVAL_POLICY.maxSurfacedItems);

  if (surfaced.length < RETRIEVAL_POLICY.targetSurfacedItems) {
    const maybe = deduped.filter((x) => x.score >= SCORE_THRESHOLDS.maybe && x.score < SCORE_THRESHOLDS.high);
    for (const candidate of maybe) {
      if (surfaced.length >= RETRIEVAL_POLICY.maxSurfacedItems) break;
      surfaced.push(candidate);
    }
  }

  const topScore = deduped[0]?.score || 0;
  const averageSurfaced = surfaced.length
    ? surfaced.reduce((acc, row) => acc + row.score, 0) / surfaced.length
    : 0;
  const highCount = surfaced.filter((x) => x.score >= SCORE_THRESHOLDS.high).length;
  const confidence = highCount >= 2 && topScore >= SCORE_THRESHOLDS.high && averageSurfaced >= SCORE_THRESHOLDS.maybe
    ? 'high'
    : surfaced.length
      ? 'medium'
      : 'low';

  if (confidence !== 'high' && surfaced.length > 2) surfaced = surfaced.slice(0, 2);

  return {
    confidence,
    scored: deduped,
    surfaced,
  };
}
