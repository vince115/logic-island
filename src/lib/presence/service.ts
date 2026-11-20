import { PRESENCE } from './config';
import { publicSnapshot } from './engine';
import { presenceEnabled } from './flag';
import { resolvePlace } from './locations';
import { parsePlace } from './place';
import { mintToken, presenceSecret, readCookie, sessionCookie, verifyToken } from './session';
import { presenceStore, type PresenceStore } from './store';

/**
 * Server only: the presence API as two functions over the Web Request and Response, so the route file is two lines
 * and tests call them directly.
 *
 * POST  a tab's heartbeat `{ v, tab, since, place }` or its leave `{ v, tab, leave: true }`.
 * GET   the aggregate population (engine.ts PopulationSnapshot); public and cacheable for a few seconds.
 *
 * Privacy: the API reads the request's body, its Origin headers, its presence cookie and, for one test against a
 * list of crawler names, its User-Agent. It never reads or stores an IP address, and it stores nothing but the random
 * session id, the session's place and its times. Responses never hold a session id or anything about one session.
 */
export interface PresenceDeps { store: PresenceStore; now: () => number; secret: string | Buffer | undefined }
const defaults = (): PresenceDeps => ({ store: presenceStore(), now: Date.now, secret: presenceSecret() });

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const refuse = (status: number, error: string) => json({ ok: false, error }, status);

/** Declared crawlers and link previewers: answered politely, never counted (their requests keep no cookie anyway). */
const CRAWLER = /bot\b|crawl|spider|slurp|preview|monitor|lighthouse|pingdom|curl\/|wget\/|python-requests|httpclient/i;
const TAB = /^[a-z0-9]{8,24}$/;

/** A request made by a page of this site: browsers say so (Sec-Fetch-Site) and name the page's origin (Origin). */
function sameOrigin(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site'), origin = request.headers.get('origin');
  if (site) return site === 'same-origin';
  if (!origin) return false;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? new URL(request.url).host;
  try { return new URL(origin).host === host; } catch { return false; }
}
const isSecure = (request: Request) => (request.headers.get('x-forwarded-proto') ?? new URL(request.url).protocol.replace(':', '')) === 'https';

interface Body { tab: string; since: number; place: ReturnType<typeof parsePlace>; leave: boolean }
function parseBody(text: string, now: number): Body | undefined {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return undefined; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const { v, tab, since, place, leave, ...rest } = value as Record<string, unknown>;
  if (Object.keys(rest).length || v !== PRESENCE.version || typeof tab !== 'string' || !TAB.test(tab)) return undefined;
  if (leave !== undefined && leave !== true) return undefined;
  if (leave) return place === undefined && since === undefined ? { tab, since: 0, place: undefined, leave: true } : undefined;
  // `since` is the browser's clock; it only orders tabs of one session, so it need only be a plausible time.
  if (typeof since !== 'number' || !Number.isSafeInteger(since) || Math.abs(since - now) > 24 * 60 * 60 * 1000) return undefined;
  const claim = parsePlace(place);
  return claim ? { tab, since, place: claim, leave: false } : undefined;
}

export async function handlePresencePost(request: Request, deps: PresenceDeps = defaults()): Promise<Response> {
  if (!presenceEnabled()) return refuse(404, 'not-found');
  if (!deps.secret) return refuse(503, 'unconfigured');
  if (!sameOrigin(request)) return refuse(403, 'forbidden');
  if (Number(request.headers.get('content-length') ?? 0) > PRESENCE.maxBodyBytes) return refuse(413, 'too-large');
  const text = await request.text();
  if (text.length > PRESENCE.maxBodyBytes) return refuse(413, 'too-large');
  const now = deps.now(), body = parseBody(text, now);
  if (!body) return refuse(400, 'bad-request');
  if (CRAWLER.test(request.headers.get('user-agent') ?? '')) return json({ ok: true, counted: false, next: PRESENCE.heartbeatMs });

  const session = verifyToken(deps.secret, readCookie(request.headers.get('cookie')), now);
  if (body.leave) {
    if (session) await deps.store.leave(session.sid, body.tab, now);
    return json({ ok: true, counted: false });
  }
  // No session yet (or an old one): issue the cookie and count nothing. A browser comes back with it; a client that
  // keeps no cookies never gets past this line, and costs the server no memory.
  if (!session) {
    const { token } = mintToken(deps.secret, now);
    return json({ ok: true, counted: false, retryMs: PRESENCE.warmupMs + 500 }, 200, { 'set-cookie': sessionCookie(token, isSecure(request)) });
  }
  const age = now - session.issuedAt;
  if (age < PRESENCE.warmupMs) return json({ ok: true, counted: false, retryMs: PRESENCE.warmupMs - age + 250 });

  const result = await deps.store.touch(session.sid, { tab: body.tab, since: body.since, location: resolvePlace(body.place!) }, now);
  if (result === 'rate-limited') return json({ ok: false, error: 'rate-limited' }, 429, { 'retry-after': String(Math.ceil(PRESENCE.rateWindowMs / 1000)) });
  if (result === 'full') return json({ ok: true, counted: false, next: PRESENCE.retryMs });
  return json({ ok: true, counted: true, next: PRESENCE.heartbeatMs });
}

export async function handlePresenceGet(_request: Request, deps: PresenceDeps = defaults()): Promise<Response> {
  if (!presenceEnabled()) return refuse(404, 'not-found');
  const now = deps.now();
  const cache = `public, max-age=${PRESENCE.snapshotCacheSeconds}, s-maxage=${PRESENCE.snapshotCacheSeconds}`;
  return json(publicSnapshot(await deps.store.counts(now), now), 200, { 'cache-control': cache });
}
