function isConfidence(value) {
  return value === 'high' || value === 'medium' || value === 'low';
}

export function assertResponseSchema(response) {
  if (!response || typeof response !== 'object') throw new Error('response must be an object');
  if (typeof response.summary !== 'string') throw new Error('summary must be a string');
  if (!isConfidence(response.confidence)) throw new Error('confidence must be high|medium|low');
  if (!Array.isArray(response.items)) throw new Error('items must be an array');
  if (response.items.length > 5) throw new Error('items.length must be <= 5');
  if (response.items.length === 0 && !response.fallback_message) {
    throw new Error('fallback_message is required when items is empty');
  }
  for (const item of response.items) {
    if (typeof item.title !== 'string') throw new Error('item.title must be a string');
    if (!['email', 'calendar'].includes(item.source_type)) throw new Error('item.source_type must be email|calendar');
    if (typeof item.source_id !== 'string') throw new Error('item.source_id must be a string');
    if (typeof item.why_relevant !== 'string') throw new Error('item.why_relevant must be a string');
    if (typeof item.date !== 'string') throw new Error('item.date must be a string');
    if (!Array.isArray(item.participants)) throw new Error('item.participants must be an array');
    if (typeof item.snippet !== 'string') throw new Error('item.snippet must be a string');
    if (typeof item.url !== 'string') throw new Error('item.url must be a string');
    if (typeof item.score !== 'number') throw new Error('item.score must be a number');
  }
}
