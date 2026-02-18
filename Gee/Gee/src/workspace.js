import crypto from 'node:crypto';

function nowIso() {
  return new Date().toISOString();
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function uid(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function trimText(value) {
  return String(value || '').trim();
}

function firstWords(text, count = 6) {
  return trimText(text).split(/\s+/).filter(Boolean).slice(0, count).join(' ');
}

function overlapScore(a, b) {
  const ta = new Set(trimText(a).toLowerCase().split(/\W+/).filter((x) => x.length > 2));
  const tb = new Set(trimText(b).toLowerCase().split(/\W+/).filter((x) => x.length > 2));
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / Math.max(ta.size, tb.size);
}

export function createEmptyWorkspace() {
  return {
    inboxChats: [],
    workstreams: [],
    actions: [],
    dailyPlans: [],
    planChats: [],
    updatedAt: nowIso(),
  };
}

export function ensureWorkspaceShape(state) {
  const base = createEmptyWorkspace();
  const next = state && typeof state === 'object' ? state : {};
  return {
    inboxChats: Array.isArray(next.inboxChats) ? next.inboxChats : base.inboxChats,
    workstreams: Array.isArray(next.workstreams) ? next.workstreams : base.workstreams,
    actions: Array.isArray(next.actions) ? next.actions : base.actions,
    dailyPlans: Array.isArray(next.dailyPlans) ? next.dailyPlans : base.dailyPlans,
    planChats: Array.isArray(next.planChats) ? next.planChats : base.planChats,
    updatedAt: trimText(next.updatedAt) || base.updatedAt,
  };
}

export function createInboxChat(state, { title, content }) {
  const next = ensureWorkspaceShape(state);
  const text = trimText(content);
  if (!text) throw new Error('Message content is required');
  const createdAt = nowIso();
  const chat = {
    id: uid('chat'),
    title: trimText(title) || firstWords(text, 7) || 'New chat',
    status: 'open',
    createdAt,
    updatedAt: createdAt,
    committedAt: null,
    messages: [
      { id: uid('msg'), role: 'user', content: text, createdAt },
    ],
    linkedWorkstreamIds: [],
    linkedPlanIds: [],
  };
  next.inboxChats = [chat, ...next.inboxChats];
  next.updatedAt = createdAt;
  return { state: next, chat };
}

export function appendInboxMessage(state, { chatId, content }) {
  const next = ensureWorkspaceShape(state);
  const text = trimText(content);
  if (!text) throw new Error('Message content is required');
  const index = next.inboxChats.findIndex((c) => c.id === chatId);
  if (index === -1) throw new Error('Inbox chat not found');
  const createdAt = nowIso();
  const chat = next.inboxChats[index];
  chat.messages = [
    ...(Array.isArray(chat.messages) ? chat.messages : []),
    { id: uid('msg'), role: 'user', content: text, createdAt },
  ];
  chat.updatedAt = createdAt;
  next.updatedAt = createdAt;
  return { state: next, chat };
}

function findOrCreateWorkstream(next, text) {
  const label = firstWords(text, 5) || 'General progress';
  let best = null;
  let bestScore = 0;
  for (const ws of next.workstreams) {
    const score = overlapScore(ws.name, text) + overlapScore(ws.summary || '', text);
    if (score > bestScore) {
      bestScore = score;
      best = ws;
    }
  }

  if (best && bestScore >= 0.25) return best;

  const createdAt = nowIso();
  const ws = {
    id: uid('ws'),
    name: label,
    summary: `Progress thread: ${firstWords(text, 12)}`,
    status: 'active',
    preference: 'neutral',
    priority: 0.6,
    createdAt,
    updatedAt: createdAt,
  };
  next.workstreams = [ws, ...next.workstreams];
  return ws;
}

function upsertDailyPlan(next, actionId, workstreamId) {
  const today = todayUtc();
  const createdAt = nowIso();
  let plan = next.dailyPlans.find((p) => p.date === today);
  if (!plan) {
    plan = {
      id: uid('plan'),
      date: today,
      focusSummary: 'Current top actions across active workstreams.',
      actionIds: [],
      workstreamIds: [],
      createdAt,
      updatedAt: createdAt,
    };
    next.dailyPlans = [plan, ...next.dailyPlans];
  }
  if (!plan.actionIds.includes(actionId)) plan.actionIds.unshift(actionId);
  if (!plan.workstreamIds.includes(workstreamId)) plan.workstreamIds.unshift(workstreamId);
  plan.actionIds = plan.actionIds.slice(0, 8);
  plan.workstreamIds = plan.workstreamIds.slice(0, 6);
  plan.updatedAt = createdAt;
  return plan;
}

function ensurePlanChat(next, planId) {
  let chat = next.planChats.find((c) => c.planId === planId);
  if (!chat) {
    const createdAt = nowIso();
    chat = {
      id: uid('pchat'),
      planId,
      createdAt,
      updatedAt: createdAt,
      messages: [],
    };
    next.planChats = [chat, ...next.planChats];
  }
  return chat;
}

export function sendInboxToG(state, { chatId }) {
  const next = ensureWorkspaceShape(state);
  const chat = next.inboxChats.find((c) => c.id === chatId);
  if (!chat) throw new Error('Inbox chat not found');
  const latest = [...(chat.messages || [])].reverse().find((m) => m.role === 'user' && trimText(m.content));
  if (!latest) throw new Error('Inbox chat has no user content');

  const now = nowIso();
  const ws = findOrCreateWorkstream(next, latest.content);
  ws.updatedAt = now;
  ws.status = ws.status === 'done' ? 'active' : ws.status;

  const action = {
    id: uid('act'),
    workstreamId: ws.id,
    title: firstWords(latest.content, 12) || 'Follow up on this item',
    whyNow: 'Captured from inbox chat and promoted to active plan.',
    efficiencyHint: 'Do a short focused pass, then decide next concrete step.',
    status: 'todo',
    salience: 0.65,
    createdAt: now,
    updatedAt: now,
  };
  next.actions = [action, ...next.actions];

  const plan = upsertDailyPlan(next, action.id, ws.id);
  const pchat = ensurePlanChat(next, plan.id);
  pchat.messages.push({
    id: uid('msg'),
    role: 'system',
    content: `Added action to plan from inbox chat: ${action.title}`,
    createdAt: now,
  });
  pchat.updatedAt = now;

  chat.updatedAt = now;
  chat.committedAt = now;
  if (!chat.linkedWorkstreamIds.includes(ws.id)) chat.linkedWorkstreamIds.push(ws.id);
  if (!chat.linkedPlanIds.includes(plan.id)) chat.linkedPlanIds.push(plan.id);

  next.updatedAt = now;
  return { state: next, action, workstream: ws, plan };
}

export function appendPlanChatMessage(state, { planId, content }) {
  const next = ensureWorkspaceShape(state);
  const plan = next.dailyPlans.find((p) => p.id === planId);
  if (!plan) throw new Error('Daily plan not found');
  const text = trimText(content);
  if (!text) throw new Error('Message content is required');

  const now = nowIso();
  const chat = ensurePlanChat(next, planId);
  chat.messages.push({
    id: uid('msg'),
    role: 'user',
    content: text,
    createdAt: now,
  });
  chat.updatedAt = now;
  next.updatedAt = now;
  return { state: next, planChat: chat };
}
