import { getSessionCookieName, parseCookies, verifySessionToken } from './session.js';
import { createRepository } from '../repository.js';

export function json(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

export function redirect(location, headers = {}) {
  return {
    statusCode: 302,
    headers: {
      location,
      ...headers,
    },
    body: '',
  };
}

export async function getAuthedUser(event, appEnv) {
  const cookies = parseCookies(event.headers?.cookie || '');
  const token = cookies[getSessionCookieName()];
  const payload = verifySessionToken(token, appEnv.security.sessionSecret);
  if (!payload?.userId) return null;

  const repo = createRepository({
    supabaseUrl: appEnv.supabase.url,
    supabaseServiceRoleKey: appEnv.supabase.serviceRoleKey,
  });

  const user = await repo.getUserById(payload.userId);
  if (!user) return null;

  return { user, repo };
}
