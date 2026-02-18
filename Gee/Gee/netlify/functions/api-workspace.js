import { getAppEnv } from '../../src/netlify/env.js';
import { getAuthedUser, json } from '../../src/netlify/http.js';
import {
  appendInboxMessage,
  appendPlanChatMessage,
  createInboxChat,
  sendInboxToG,
} from '../../src/workspace.js';

function parseJsonBody(event) {
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : String(event.body || '');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export const handler = async (event) => {
  try {
    const appEnv = getAppEnv();
    const authed = await getAuthedUser(event, appEnv);
    if (!authed) return json(401, { error: 'unauthorized' });

    const { user, repo } = authed;

    if (event.httpMethod === 'GET') {
      const workspace = await repo.getWorkspaceState(user.id);
      return json(200, { ok: true, workspace });
    }

    if (event.httpMethod === 'POST') {
      const body = parseJsonBody(event);
      const action = String(body?.action || '').trim();
      const workspace = await repo.getWorkspaceState(user.id);

      let result = { workspace };
      if (action === 'create_inbox_chat') {
        result = createInboxChat(workspace, {
          title: body?.title,
          content: body?.content,
        });
      } else if (action === 'append_inbox_message') {
        result = appendInboxMessage(workspace, {
          chatId: body?.chatId,
          content: body?.content,
        });
      } else if (action === 'send_to_g') {
        result = sendInboxToG(workspace, { chatId: body?.chatId });
      } else if (action === 'append_plan_chat_message') {
        result = appendPlanChatMessage(workspace, {
          planId: body?.planId,
          content: body?.content,
        });
      } else {
        return json(400, { error: 'invalid action' });
      }

      await repo.saveWorkspaceState(user.id, result.state);
      return json(200, {
        ok: true,
        workspace: result.state,
      });
    }

    return json(405, { error: 'method not allowed' });
  } catch (err) {
    return json(500, { error: err.message || 'workspace request failed' });
  }
};
