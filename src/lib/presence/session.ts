import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { PRESENCE, PRESENCE_COOKIE } from './config';

/**
 * Server only: the anonymous session token. The server issues it; it holds a random id and the time it was issued,
 * signed (HMAC-SHA256), and nothing about the visitor: no IP address, no user agent, no name. It lives in a session
 * cookie that only the presence API receives (Path), scripts cannot read (HttpOnly) and other sites cannot send
 * (SameSite=Strict); it ends with the browser session, and the server replaces it after `tokenMaxAgeMs`.
 *
 * All tabs of a browser share the cookie, so they are one session. A client cannot mint a session: an id the server
 * did not sign is ignored.
 */
const VERSION = 'v1';
const b64 = (bytes: Buffer) => bytes.toString('base64url');
const sign = (secret: string | Buffer, sid: string, issued: string) => b64(createHmac('sha256', secret).update(`${VERSION}.${sid}.${issued}`).digest());

const holder = globalThis as typeof globalThis & { __logicIslandPresenceSecret?: Buffer };
/**
 * The signing secret: LOGIC_ISLAND_PRESENCE_SECRET (at least 32 characters). Without one, a random secret made for
 * this process, so sessions last until the server restarts: fine for local review, but not for several instances
 * (a cookie one instance signed would be refused by the next, and every visitor would keep starting over). So a
 * Vercel deployment without the variable gets none and the API answers 503: Production, and Preview too (P6-E: a
 * Preview that counts wrongly without saying so validates nothing).
 */
export function presenceSecret(): string | Buffer | undefined {
  const configured = process.env.LOGIC_ISLAND_PRESENCE_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview') return undefined;
  return (holder.__logicIslandPresenceSecret ??= randomBytes(32));
}

export interface SessionToken { sid: string; issuedAt: number }

export function mintToken(secret: string | Buffer, now: number): { token: string; session: SessionToken } {
  const sid = b64(randomBytes(16)), issued = now.toString(36);
  return { token: `${VERSION}.${sid}.${issued}.${sign(secret, sid, issued)}`, session: { sid, issuedAt: now } };
}

/** The session of a token this server signed and that is not too old; undefined for anything else. */
export function verifyToken(secret: string | Buffer, token: string | undefined, now: number): SessionToken | undefined {
  if (!token || token.length > 160) return undefined;
  const [version, sid, issued, signature, ...rest] = token.split('.');
  if (version !== VERSION || !sid || !issued || !signature || rest.length) return undefined;
  const expected = Buffer.from(sign(secret, sid, issued)), given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return undefined;
  const issuedAt = parseInt(issued, 36);
  if (!Number.isSafeInteger(issuedAt) || issuedAt > now + 60_000 || now - issuedAt > PRESENCE.tokenMaxAgeMs) return undefined;
  return { sid, issuedAt };
}

/** The presence cookie's value in a Cookie header. */
export function readCookie(header: string | null): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at).trim() === PRESENCE_COOKIE) return part.slice(at + 1).trim();
  }
  return undefined;
}

/** The Set-Cookie value: a session cookie (no Expires or Max-Age), sent only to the presence API. */
export const sessionCookie = (token: string, secure: boolean) =>
  `${PRESENCE_COOKIE}=${token}; Path=${PRESENCE.endpoint}; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
