/** UUID v4 identifiers for drawings, entities and annotations, including HTTP origins. */
export function newId(): string {
  const crypto = globalThis.crypto;
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();

  // getRandomValues is available on HTTP too; randomUUID requires a secure context.
  if (typeof crypto?.getRandomValues !== 'function') {
    throw new Error('This browser cannot generate drawing IDs. Please use a modern browser.');
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
