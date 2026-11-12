/**
 * T.3I: a stable 64-bit digest of a text (two 32-bit FNV-1a variants), as 16 hex digits. A name for a stored record
 * (quarantine.ts, store.ts), not a security hash: it runs in the browser without crypto.subtle and is synchronous.
 */
export function digestOf(text: string): string {
  let a = 0x811c9dc5, b = 0x9747b28c;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995) ^ (b >>> 15);
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
