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
export interface PresenceDeps { store: PresenceStore | undefined; now: () => number; secret: string | Buffer | undefined }
const defaults = (): PresenceDeps => ({ store: presenceStore(), now: Date.now, secret: presenceSecret() });

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers } });
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
/** The browser asks not to be tracked: Global Privacy Control, or the older Do Not Track. */
export const privacySignal = (request: Request) => request.headers.get('sec-gpc') === '1' || request.headers.get('dnt') === '1';
/** The store could not be reached (a shared store is a network away): say so, and nothing about why. */
const unavailable = () => json({ ok: false, error: 'unavailable' }, 503, { 'retry-after': String(Math.ceil(PRESENCE.retryMs / 1000)) });
const isSecure = (request: Request) => (request.headers.get('x-forwarded-proto') ?? new URL(request.url).protocol.replace(':', '')) === 'https';

interface Body { tab: string; since: number; place: ReturnType<typeof parsePlace>; leave: boolean; at?: number }
function parseBody(text: string, now: number): Body | undefined {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return undefined; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const { v, tab, since, place, leave, at, ...rest } = value as Record<string, unknown>;
  if (Object.keys(rest).length || v !== PRESENCE.version || typeof tab !== 'string' || !TAB.test(tab)) return undefined;
  if (leave !== undefined && leave !== true) return undefined;
  // `since` and `at` are the browser's clock; they only order the reports of one session, so they need only be plausible times.
  const plausible = (time: unknown): time is number => typeof time === 'number' && Number.isSafeInteger(time) && Math.abs(time - now) <= 24 * 60 * 60 * 1000;
  if (leave) return place === undefined && since === undefined && (at === undefined || plausible(at)) ? { tab, since: 0, place: undefined, leave: true, ...(at !== undefined ? { at } : {}) } : undefined;
  if (at !== undefined || !plausible(since)) return undefined;
  const claim = parsePlace(place);
  return claim ? { tab, since, place: claim, leave: false } : undefined;
}

export async function handlePresencePost(request: Request, deps: PresenceDeps = defaults()): Promise<Response> {
  if (!presenceEnabled()) return refuse(404, 'not-found');
  if (!deps.secret || !deps.store) return refuse(503, 'unconfigured');
  if (!sameOrigin(request)) return refuse(403, 'forbidden');
  if (Number(request.headers.get('content-length') ?? 0) > PRESENCE.maxBodyBytes) return refuse(413, 'too-large');
  const text = await request.text();
  if (text.length > PRESENCE.maxBodyBytes) return refuse(413, 'too-large');
  const now = deps.now(), body = parseBody(text, now);
  if (!body) return refuse(400, 'bad-request');
  if (CRAWLER.test(request.headers.get('user-agent') ?? '')) return json({ ok: true, counted: false, next: PRESENCE.heartbeatMs });
  // A browser that asks not to be tracked gets no cookie and no session, and is told to stay quiet for a while.
  if (PRESENCE.honorPrivacySignals && privacySignal(request)) return json({ ok: true, counted: false, next: PRESENCE.quietMs });

  const session = verifyToken(deps.secret, readCookie(request.headers.get('cookie')), now);
  try {
    return await write(request, { store: deps.store, secret: deps.secret }, body, session, now);
  } catch {
    return unavailable();
  }
}

async function write(request: Request, deps: { store: PresenceStore; secret: string | Buffer }, body: Body, session: ReturnType<typeof verifyToken>, now: number): Promise<Response> {
  if (body.leave) {
    if (session) await deps.store.leave(session.sid, { tab: body.tab, at: body.at }, now);
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

/**
 * The population. Nothing of the request is read (no cookie, no header, no query): the answer is the same for every
 * visitor at a given moment, which is what lets a CDN keep it for `snapshotCacheSeconds` and hand it to anyone. It
 * never sets a cookie, and anything but the count itself (an error, the flag off) is `no-store`.
 */
export async function handlePresenceGet(_request: Request, deps: PresenceDeps = defaults()): Promise<Response> {
  if (!presenceEnabled()) return refuse(404, 'not-found');
  if (!deps.store) return refuse(503, 'unconfigured');
  const now = deps.now();
  const cache = `public, max-age=${PRESENCE.snapshotCacheSeconds}, s-maxage=${PRESENCE.snapshotCacheSeconds}`;
  try {
    // Which kind of store counted (memory or shared): the same for every visitor, and what a deployment's check reads
    // to know that its instances really share their sessions (docs/planning/PRESENCE_PREVIEW_VALIDATION.md).
    return json(publicSnapshot(await deps.store.counts(now), now), 200, { 'cache-control': cache, ...(deps.store.kind ? { 'x-presence-store': deps.store.kind } : {}) });
  } catch {
    return unavailable();
  }
}
