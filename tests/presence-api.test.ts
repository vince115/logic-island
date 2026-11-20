import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lessons } from '@/content/curriculum/lessons';
import { PRESENCE, PRESENCE_COOKIE } from '@/lib/presence/config';
import { populationNpcSource, presenceEnabled } from '@/lib/presence/flag';
import type { PlaceClaim } from '@/lib/presence/place';
import { handlePresenceGet, handlePresencePost, type PresenceDeps } from '@/lib/presence/service';
import { mintToken, presenceSecret, readCookie, sessionCookie, verifyToken } from '@/lib/presence/session';
import { MemoryPresenceStore } from '@/lib/presence/store';

/*
 * Dynamic Island Population: the presence API end to end, through the same two functions the route file exports
 * (src/app/api/presence/route.presence.ts), with a store and a clock of the test's own. Covers the flags, the session
 * cookie, the server-side validation of places, timeouts, several tabs, and what the API tells the outside.
 */

const ORIGIN = 'https://logic-island.test';
const SECRET = 'test-secret-test-secret-test-secret-1234';
const slugOf = (lessonId: string) => lessons.find(l => l.lessonId === lessonId)!.slug;
const F01: PlaceClaim = { t: 'lesson', id: slugOf('F01') }, DB01: PlaceClaim = { t: 'lesson', id: slugOf('DB01') };

let now = 1_800_000_000_000;
let deps: PresenceDeps;
beforeEach(() => {
  now = 1_800_000_000_000;
  vi.stubEnv('LOGIC_ISLAND_PRESENCE', '1');
  deps = { store: new MemoryPresenceStore(), now: () => now, secret: SECRET };
});
afterEach(() => { vi.unstubAllEnvs(); });

interface Extra { cookie?: string; headers?: Record<string, string>; raw?: string }
function post(body: unknown, { cookie, headers, raw }: Extra = {}) {
  return handlePresencePost(new Request(`${ORIGIN}/api/presence`, {
    method: 'POST', body: raw ?? JSON.stringify(body),
    headers: { 'content-type': 'application/json', origin: ORIGIN, host: 'logic-island.test', 'user-agent': 'Mozilla/5.0 Chrome/140', ...(cookie ? { cookie } : {}), ...headers },
  }), deps);
}
const heartbeat = (place: PlaceClaim, tab = 'aaaaaaaa00000001', since = now) => ({ v: 1, tab, since, place });
const population = async () => (await handlePresenceGet(new Request(`${ORIGIN}/api/presence`), deps)).json();

/** A browser: keeps the cookie the API sets and sends it back, like every tab of one browser session does. */
function browser() {
  let cookie: string | undefined;
  return {
    get cookie() { return cookie; },
    async send(body: unknown, extra: Extra = {}) {
      const response = await post(body, { cookie, ...extra });
      const set = response.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      return response;
    },
    /** First contact, the wait the server asks for, then the heartbeat that counts. */
    async arrive(place: PlaceClaim, tab = 'aaaaaaaa00000001') {
      const first = await (await this.send(heartbeat(place, tab))).json();
      now += first.retryMs;
      return this.send(heartbeat(place, tab));
    },
  };
}

describe('feature flags', () => {
  it('reads the presence flag and the NPC source on the server only', () => {
    expect(presenceEnabled()).toBe(true);
    vi.stubEnv('LOGIC_ISLAND_PRESENCE', '');
    expect(presenceEnabled()).toBe(false);
    vi.stubEnv('LOGIC_ISLAND_POPULATION_NPC', 'live');
    expect(populationNpcSource()).toBeNull();
    vi.stubEnv('LOGIC_ISLAND_PRESENCE', '1');
    expect(populationNpcSource()).toBe('live');
    vi.stubEnv('LOGIC_ISLAND_POPULATION_NPC', 'mock');
    expect(populationNpcSource()).toBe('mock');
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(populationNpcSource()).toBeNull();
    vi.stubEnv('LOGIC_ISLAND_POPULATION_NPC', '1');
    expect(populationNpcSource()).toBeNull();
  });

  it('answers 404 to everything without the flag', async () => {
    vi.stubEnv('LOGIC_ISLAND_PRESENCE', '');
    expect((await post(heartbeat(F01))).status).toBe(404);
    expect((await handlePresenceGet(new Request(`${ORIGIN}/api/presence`), deps)).status).toBe(404);
  });

  it('answers 503 in a Vercel Production build that has no signing secret', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('LOGIC_ISLAND_PRESENCE_SECRET', '');
    expect(presenceSecret()).toBeUndefined();
    expect((await post(heartbeat(F01), {})).status).toBe(200);
    deps = { ...deps, secret: presenceSecret() };
    expect((await post(heartbeat(F01))).status).toBe(503);
    vi.stubEnv('LOGIC_ISLAND_PRESENCE_SECRET', 'short');
    expect(presenceSecret()).toBeUndefined();
    vi.stubEnv('LOGIC_ISLAND_PRESENCE_SECRET', SECRET);
    expect(presenceSecret()).toBe(SECRET);
  });
});

describe('the session cookie', () => {
  it('is a session cookie only the presence API gets, unreadable by scripts', async () => {
    const response = await post(heartbeat(F01));
    const cookie = response.headers.get('set-cookie')!;
    expect(cookie.startsWith(`${PRESENCE_COOKIE}=v1.`)).toBe(true);
    expect(cookie).toContain('Path=/api/presence');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Secure');
    expect(cookie).not.toMatch(/Expires|Max-Age/i);
    expect(sessionCookie('x', false)).not.toContain('Secure');
    expect(readCookie(`theme=dark; ${PRESENCE_COOKIE}=abc; other=1`)).toBe('abc');
    expect(readCookie(null)).toBeUndefined();
  });

  it('accepts only tokens this server signed, and not for ever', () => {
    const { token, session } = mintToken(SECRET, now);
    expect(verifyToken(SECRET, token, now + 1_000)).toEqual(session);
    expect(verifyToken('another-secret-another-secret-another!!', token, now)).toBeUndefined();
    const [v, sid, issued, signature] = token.split('.');
    expect(verifyToken(SECRET, [v, sid, (now + 5).toString(36), signature].join('.'), now)).toBeUndefined();
    expect(verifyToken(SECRET, [v, 'AAAAAAAAAAAAAAAAAAAAAA', issued, signature].join('.'), now)).toBeUndefined();
    expect(verifyToken(SECRET, `${token}.x`, now)).toBeUndefined();
    expect(verifyToken(SECRET, undefined, now)).toBeUndefined();
    expect(verifyToken(SECRET, token, now + PRESENCE.tokenMaxAgeMs + 1)).toBeUndefined();
    // Two tokens never share an id.
    expect(mintToken(SECRET, now).session.sid).not.toBe(session.sid);
  });
});

describe('counting visitors', () => {
  it('counts a browser only after it has sent the cookie back, and a client without cookies never', async () => {
    const visitor = browser();
    const first = await visitor.send(heartbeat(F01));
    expect(await first.json()).toMatchObject({ ok: true, counted: false, retryMs: expect.any(Number) });
    expect((await population()).total).toBe(0);
    // Too soon: still warming up.
    now += 500;
    expect(await (await visitor.send(heartbeat(F01))).json()).toMatchObject({ counted: false });
    now += PRESENCE.warmupMs;
    expect(await (await visitor.send(heartbeat(F01))).json()).toEqual({ ok: true, counted: true, next: PRESENCE.heartbeatMs });
    expect(await population()).toMatchObject({ total: 1, hub: 0, regions: { cs: 1, ai: 0, design: 0, web: 0, sys: 0 }, islands: { foundations: 1 } });
    // A script that keeps no cookie: a thousand requests, no session, no memory.
    for (let i = 0; i < 1_000; i++) await post(heartbeat(DB01, `bbbbbbbb${String(i).padStart(8, '0')}`));
    expect((await population()).total).toBe(1);
    expect((deps.store as MemoryPresenceStore).size).toBe(1);
  });

  it('moves a visitor between archipelagos without counting them twice', async () => {
    const visitor = browser();
    await visitor.arrive(F01);
    expect((await population()).islands).toEqual({ foundations: 1 });
    now += 4_000;
    await visitor.send(heartbeat({ t: 'island', id: 'machine-learning', r: 'ai' }));
    expect(await population()).toMatchObject({ total: 1, regions: { cs: 0, ai: 1 }, islands: { 'machine-learning': 1 } });
    now += 4_000;
    await visitor.send(heartbeat({ t: 'hub' }));
    expect(await population()).toMatchObject({ total: 1, hub: 1, regions: { cs: 0, ai: 0 }, islands: {} });
  });

  it('counts two tabs of one browser as one visitor, where the newer tab is', async () => {
    const visitor = browser();
    await visitor.arrive(F01, 'aaaaaaaa00000001');
    now += 1_000;
    await visitor.send(heartbeat(DB01, 'bbbbbbbb00000002'));
    expect(await population()).toMatchObject({ total: 1, islands: { databases: 1 } });
    // The older tab is still visible and keeps reporting its own place: nothing moves, nothing is added.
    now += 20_000;
    await visitor.send(heartbeat(F01, 'aaaaaaaa00000001', now - 21_000));
    expect(await population()).toMatchObject({ total: 1, islands: { databases: 1 } });
    // A second browser is a second visitor.
    await browser().arrive(F01, 'cccccccc00000003');
    expect(await population()).toMatchObject({ total: 2, islands: { databases: 1, foundations: 1 } });
  });

  it('keeps a visitor across a reload (the page leaves, a new page of the same session arrives)', async () => {
    const visitor = browser();
    await visitor.arrive(F01, 'aaaaaaaa00000001');
    await visitor.send({ v: 1, tab: 'aaaaaaaa00000001', leave: true });
    expect((await population()).total).toBe(0);
    now += 800;
    // The reloaded page is a new tab id with the same cookie: counted at once, no second warm-up.
    expect(await (await visitor.send(heartbeat(F01, 'dddddddd00000004'))).json()).toMatchObject({ counted: true });
    expect(await population()).toMatchObject({ total: 1, islands: { foundations: 1 } });
  });

  it('stops counting a background tab at once, and only its owner can take the session away', async () => {
    const visitor = browser();
    await visitor.arrive(F01, 'aaaaaaaa00000001');
    now += 1_000;
    await visitor.send(heartbeat(DB01, 'bbbbbbbb00000002'));
    // Tab A goes to the background while tab B is in front: the visitor still counts, on tab B's island.
    await visitor.send({ v: 1, tab: 'aaaaaaaa00000001', leave: true });
    expect(await population()).toMatchObject({ total: 1, islands: { databases: 1 } });
    await visitor.send({ v: 1, tab: 'bbbbbbbb00000002', leave: true });
    expect((await population()).total).toBe(0);
    // A leave without a session does nothing and sets no cookie.
    const stray = await post({ v: 1, tab: 'eeeeeeee00000005', leave: true });
    expect(stray.status).toBe(200);
    expect(stray.headers.get('set-cookie')).toBeNull();
  });

  it('lets a silent visitor go after the timeout', async () => {
    const visitor = browser();
    await visitor.arrive(F01);
    now += PRESENCE.heartbeatMs;
    await visitor.send(heartbeat(F01));
    now += PRESENCE.ttlMs;
    expect((await population()).total).toBe(1);
    now += 1;
    expect(await population()).toMatchObject({ total: 0, islands: {} });
  });

  it('replaces a session token that is too old', async () => {
    const visitor = browser();
    await visitor.arrive(F01);
    const before = visitor.cookie;
    now += PRESENCE.tokenMaxAgeMs + 1;
    const response = await visitor.send(heartbeat(F01));
    expect(await response.json()).toMatchObject({ counted: false, retryMs: expect.any(Number) });
    expect(visitor.cookie).not.toBe(before);
  });
});

describe('what the server refuses', () => {
  it('validates the place on the server: an unknown reference is the hub, a malformed one is refused', async () => {
    const visitor = browser();
    await visitor.arrive({ t: 'island', id: 'atlantis' });
    expect(await population()).toMatchObject({ total: 1, hub: 1, islands: {} });
    for (const place of [{ t: 'island', id: 'foundations', island: 'databases' }, { region: 'ai', island: 'foundations' }, 'foundations', { t: 'lesson', id: '../../etc' }, undefined])
      expect((await visitor.send({ v: 1, tab: 'aaaaaaaa00000001', since: now, place })).status, JSON.stringify(place)).toBe(400);
    // A CS island claimed "in the AI region" counts in CS.
    await visitor.send(heartbeat({ t: 'island', id: 'foundations', r: 'ai' }));
    expect(await population()).toMatchObject({ regions: { cs: 1, ai: 0 }, islands: { foundations: 1 } });
  });

  it('refuses malformed bodies', async () => {
    const good = heartbeat(F01);
    const bad: unknown[] = [{ ...good, v: 2 }, { ...good, tab: 'short' }, { ...good, tab: 'UPPERCASE0000001' }, { ...good, since: 'now' }, { ...good, since: now - 3 * 86_400_000 },
      { ...good, extra: 1 }, { ...good, leave: true }, { v: 1, tab: good.tab, leave: false }, { v: 1, tab: good.tab }, [good], null];
    for (const body of bad) expect((await post(body)).status, JSON.stringify(body)).toBe(400);
    expect((await post(null, { raw: '{not json' })).status).toBe(400);
    expect((await post(null, { raw: JSON.stringify({ ...good, pad: 'x'.repeat(600) }) })).status).toBe(413);
  });

  it('refuses requests that do not come from a page of this site', async () => {
    expect((await post(heartbeat(F01), { headers: { origin: 'https://evil.example' } })).status).toBe(403);
    expect((await post(heartbeat(F01), { headers: { 'sec-fetch-site': 'cross-site' } })).status).toBe(403);
    expect((await post(heartbeat(F01), { headers: { 'sec-fetch-site': 'same-site' } })).status).toBe(403);
    const bare = new Request(`${ORIGIN}/api/presence`, { method: 'POST', body: JSON.stringify(heartbeat(F01)) });
    expect((await handlePresencePost(bare, deps)).status).toBe(403);
    expect((await post(heartbeat(F01), { headers: { 'sec-fetch-site': 'same-origin' } })).status).toBe(200);
    // Behind a proxy the public host is the forwarded one.
    expect((await post(heartbeat(F01), { headers: { host: 'internal:3000', 'x-forwarded-host': 'logic-island.test' } })).status).toBe(200);
  });

  it('never counts declared crawlers and gives them no cookie', async () => {
    for (const agent of ['Mozilla/5.0 (compatible; Googlebot/2.1)', 'curl/8.7.1', 'Slackbot-LinkExpanding 1.0', 'python-requests/2.32']) {
      const response = await post(heartbeat(F01), { headers: { 'user-agent': agent } });
      expect(await response.json()).toMatchObject({ ok: true, counted: false });
      expect(response.headers.get('set-cookie')).toBeNull();
    }
    expect((await population()).total).toBe(0);
  });

  it('refuses a flood from one session', async () => {
    const visitor = browser();
    await visitor.arrive(F01);
    let refused = 0;
    for (let i = 0; i < PRESENCE.rateLimit + 5; i++) if ((await visitor.send(heartbeat(DB01))).status === 429) refused += 1;
    expect(refused).toBeGreaterThanOrEqual(5);
    expect((await population()).total).toBe(1);
  });
});

describe('what the API tells the outside', () => {
  it('publishes aggregate numbers only', async () => {
    const visitor = browser();
    await visitor.arrive(F01, 'aaaaaaaa00000001');
    const response = await handlePresenceGet(new Request(`${ORIGIN}/api/presence`), deps);
    expect(response.headers.get('cache-control')).toBe('public, max-age=5, s-maxage=5');
    expect(response.headers.get('set-cookie')).toBeNull();
    const text = await response.text(), snapshot = JSON.parse(text);
    expect(Object.keys(snapshot).sort()).toEqual(['at', 'hub', 'islands', 'regions', 'total', 'ttlMs', 'v']);
    const sid = visitor.cookie!.split('.')[1];
    for (const secret of [sid, 'aaaaaaaa00000001', 'F01', slugOf('F01'), 'course', 'session']) expect(text).not.toContain(secret);
  });

  it('never puts a session id in a response body, and never caches a heartbeat', async () => {
    const visitor = browser();
    const first = await visitor.send(heartbeat(F01));
    expect(first.headers.get('cache-control')).toBe('no-store');
    const sid = visitor.cookie!.split('.')[1];
    now += 3_000;
    const second = await visitor.send(heartbeat(F01));
    for (const response of [first, second]) expect(JSON.stringify(await response.clone().text())).not.toContain(sid);
  });

  it('reads no address of the visitor: the same count with or without forwarding headers', async () => {
    const visitor = browser();
    await visitor.arrive(F01);
    await visitor.send(heartbeat(F01), { headers: { 'x-forwarded-for': '203.0.113.7', 'x-real-ip': '203.0.113.7' } });
    expect((await population()).total).toBe(1);
    // Nothing the store holds contains the address.
    expect(JSON.stringify([...((deps.store as unknown as { sessions: Map<string, unknown> }).sessions)])).not.toContain('203.0.113');
  });
});
