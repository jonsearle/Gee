import crypto from 'node:crypto';

function toBase64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(input) {
  const normalized = String(input || '').replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function signPayload(payload, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/g, '');
}

export function createFeedbackToken({ userId, runId, expiresAt }, secret) {
  const payload = JSON.stringify({
    userId,
    runId,
    exp: expiresAt,
  });
  const payloadEncoded = toBase64Url(payload);
  const sig = signPayload(payloadEncoded, secret);
  return `${payloadEncoded}.${sig}`;
}

export function verifyFeedbackToken(token, secret) {
  const [payloadEncoded, sig] = String(token || '').split('.');
  if (!payloadEncoded || !sig) return null;
  const expectedSig = signPayload(payloadEncoded, secret);
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  let payload;
  try {
    payload = JSON.parse(fromBase64Url(payloadEncoded));
  } catch {
    return null;
  }

  if (!payload?.userId || !payload?.runId || !payload?.exp) return null;
  if (Date.now() > Number(payload.exp)) return null;
  return payload;
}
