import crypto from 'node:crypto';

function keyFromBase64(base64Key) {
  const key = Buffer.from(base64Key || '', 'base64');
  if (key.length !== 32) {
    throw new Error('GEE_TOKEN_ENCRYPTION_KEY must be base64 for exactly 32 bytes');
  }
  return key;
}

export function encryptToken(plainText, base64Key) {
  const key = keyFromBase64(base64Key);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

export function decryptToken(payload, base64Key) {
  const key = keyFromBase64(base64Key);
  const [ivB64, tagB64, dataB64] = String(payload || '').split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Invalid encrypted token format');

  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const encrypted = Buffer.from(dataB64, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return plain.toString('utf8');
}
