import { healthSnapshot } from '../../src/memory-agent-v1/index.js';
import { json } from '../../src/netlify/http.js';

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'method not allowed' });
  return json(200, healthSnapshot());
};
