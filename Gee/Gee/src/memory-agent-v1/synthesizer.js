import { LOW_CONFIDENCE_MESSAGE } from './constants.js';

function itemDate(row) {
  return row.source_type === 'email' ? row.item.timestamp : row.item.start_time;
}

function itemParticipants(row) {
  if (row.source_type === 'email') {
    return [row.item.from, ...(row.item.to || []), ...(row.item.cc || [])].filter(Boolean).slice(0, 8);
  }
  return [row.item.organizer, ...(row.item.attendees || [])].filter(Boolean).slice(0, 8);
}

function itemTitle(row) {
  return row.source_type === 'email' ? row.item.subject || '(No subject)' : row.item.title || '(No title)';
}

function itemSnippet(row) {
  return row.source_type === 'email'
    ? row.item.snippet || row.item.body_preview || ''
    : row.item.description_preview || '';
}

function makeSummary(rows, confidence) {
  if (!rows.length) return '';
  const top = rows[0];
  const first = `Top relevant context is ${itemTitle(top)} (${top.source_type}, ${top.item.id}).`;
  if (rows.length === 1) return first;
  const second = `Also found ${rows.length - 1} related ${rows.length > 2 ? 'items' : 'item'} grounded in retrieved sources.`;
  if (confidence === 'high') return `${first} ${second}`;
  return `${first} Relevance may be partial based on available matches.`;
}

async function llmSummary({
  llm,
  userInput,
  queryUnderstanding,
  retrievalFacts,
  surfaced,
  fallbackSummary,
}) {
  if (!llm || !surfaced.length) return fallbackSummary;
  const client = llm.client || llm;
  const model = llm.model || 'gpt-4.1-mini';

  const evidence = surfaced.slice(0, 5).map((row, i) => ({
    rank: i + 1,
    source_type: row.source_type,
    source_id: row.item.id,
    title: itemTitle(row),
    date: itemDate(row),
    participants: itemParticipants(row),
    snippet: itemSnippet(row).slice(0, 260),
  }));

  const prompt = [
    'You are a grounded assistant.',
    'Answer in 1-3 sentences using only the provided evidence.',
    'If the user asks for counts or most recent senders, answer that directly from the facts.',
    'Do not invent facts and do not mention any source id not listed.',
    '',
    `User prompt: ${userInput}`,
    `Query understanding: ${JSON.stringify(queryUnderstanding || {})}`,
    `Retrieval facts: ${JSON.stringify(retrievalFacts || {})}`,
    `Evidence: ${JSON.stringify(evidence)}`,
  ].join('\n');

  const out = await client.responses.create({
    model,
    input: prompt,
    max_output_tokens: 180,
  });
  const text = String(out.output_text || '').trim();
  return text || fallbackSummary;
}

export async function synthesizeResponse({
  llm,
  userInput,
  queryUnderstanding,
  retrievalFacts,
  confidence,
  surfaced,
}) {
  const items = surfaced.slice(0, 5).map((row) => ({
    title: itemTitle(row),
    source_type: row.source_type,
    source_id: row.item.id,
    why_relevant: row.why_relevant,
    date: itemDate(row),
    participants: itemParticipants(row),
    snippet: itemSnippet(row),
    url: row.item.url || '',
    score: Number(row.score.toFixed(4)),
  }));

  if (!items.length) {
    return {
      summary: '',
      confidence: 'low',
      items: [],
      fallback_message: LOW_CONFIDENCE_MESSAGE,
    };
  }

  const fallback = makeSummary(surfaced, confidence);
  const summary = await llmSummary({
    llm,
    userInput,
    queryUnderstanding,
    retrievalFacts,
    surfaced,
    fallbackSummary: fallback,
  });

  return {
    summary,
    confidence,
    items,
    fallback_message: null,
  };
}
