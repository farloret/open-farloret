/**
 * RFC 4122 version-4 UUIDs for Open Farloret.
 * Do not use timestamps or Math.random for conversation identity.
 */
export const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isChatId(id) {
  return typeof id === 'string' && UUID_V4.test(id);
}

export function newChatId() {
  const secure = globalThis.crypto;
  if (typeof secure?.randomUUID === 'function') return secure.randomUUID();
  if (typeof secure?.getRandomValues !== 'function') {
    throw new Error('Secure random UUIDs require HTTPS or localhost');
  }
  const bytes = new Uint8Array(16);
  secure.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}

export function chatIdFromLocation(urlString) {
  const candidate = new URL(urlString).searchParams.get('chat');
  return isChatId(candidate) ? candidate.toLowerCase() : null;
}
