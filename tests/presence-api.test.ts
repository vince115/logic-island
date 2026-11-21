import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lessons } from '@/content/curriculum/lessons';
import { PRESENCE, PRESENCE_COOKIE } from '@/lib/presence/config';
import { populationNpcSource, presenceEnabled } from '@/lib/presence/flag';
import type { PlaceClaim } from '@/lib/presence/place';
import { handlePresenceGet, handlePresencePost, privacySignal, type PresenceDeps } from '@/lib/presence/service';
import type { PresenceStore } from '@/lib/presence/store';
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
    expect(Object.keys(snapshot).sort()).toEqual(['at', 'commons', 'hub', 'islands', 'regions', 'total', 'ttlMs', 'v']);
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

describe('security: what an attacker can and cannot do', () => {
  it('ignores a cookie it did not sign: forged, tampered, of another deployment, or oversized', async () => {
    const real = browser();
    await real.arrive(F01);
    const [v, sid, issued, signature] = real.cookie!.split('=')[1].split('.');
    const other = mintToken('another-secret-another-secret-another!!', now).token;
    const forged = [`${v}.${sid}.${issued}.${signature.slice(0, -2)}AA`, `${v}.AAAAAAAAAAAAAAAAAAAAAA.${issued}.${signature}`, `v2.${sid}.${issued}.${signature}`, other,
      `${v}.${sid}.${(now + 3_600_000).toString(36)}.${signature}`, 'x'.repeat(4_000), `${v}.${sid}.${issued}`, '', '....'];
    for (const token of forged) {
      const response = await post(heartbeat(DB01, 'bbbbbbbb00000002'), { cookie: `${PRESENCE_COOKIE}=${token}` });
      expect(response.status, token.slice(0, 30)).toBe(200);
      // Treated as a first contact: a fresh cookie, nothing counted, and the real session untouched.
      expect(await response.json(), token.slice(0, 30)).toMatchObject({ counted: false });
      expect(response.headers.get('set-cookie'), token.slice(0, 30)).toContain(`${PRESENCE_COOKIE}=v1.`);
    }
    expect(await population()).toMatchObject({ total: 1, islands: { foundations: 1 } });
  });

  it('counts one session once, however many clients replay its cookie', async () => {
    const visitor = browser();
    await visitor.arrive(F01);
    const replays = await Promise.all(Array.from({ length: 20 }, (_, i) => post(heartbeat(i % 2 ? F01 : DB01, `cccccccc000000${String(i).padStart(2, '0')}`, now + i), { cookie: visitor.cookie })));
    expect(replays.every(r => r.status === 200)).toBe(true);
    expect((await population()).total).toBe(1);
  });

  it('gives two first requests that race two different sessions, and counts neither until one comes back', async () => {
    const [a, b] = await Promise.all([post(heartbeat(F01)), post(heartbeat(F01))]);
    const cookies = [a, b].map(r => r.headers.get('set-cookie')!.split(';')[0]);
    expect(cookies[0]).not.toBe(cookies[1]);
    expect((await population()).total).toBe(0);
    // The browser kept one of them (the last it was given); the other id is never heard of again.
    now += PRESENCE.warmupMs + 500;
    await post(heartbeat(F01), { cookie: cookies[1] });
    expect((await population()).total).toBe(1);
    expect((deps.store as MemoryPresenceStore).size).toBe(1);
  });

  it('holds no memory for clients that keep no cookie, however many requests they send', async () => {
    for (let i = 0; i < 300; i++) await post(heartbeat(F01, `dddddddd${String(i).padStart(8, '0')}`));
    expect((deps.store as MemoryPresenceStore).size).toBe(0);
    expect((await population()).total).toBe(0);
  });

  it('refuses look-alike origins', async () => {
    for (const origin of ['https://logic-island.test.evil.example', 'https://evil-logic-island.test', 'https://logic-island.test:8443', 'null', 'https://', 'javascript:alert(1)', 'https://logic-island.test@evil.example'])
      expect((await post(heartbeat(F01), { headers: { origin } })).status, origin).toBe(403);
    // A browser's own word (Sec-Fetch-Site) wins over a matching Origin header.
    expect((await post(heartbeat(F01), { headers: { 'sec-fetch-site': 'cross-site', origin: ORIGIN } })).status).toBe(403);
    expect((await post(heartbeat(F01), { headers: { 'sec-fetch-site': 'none' } })).status).toBe(403);
  });

  it('takes ids as ids: names of object properties, paths and markup change nothing', async () => {
    const visitor = browser();
    await visitor.arrive(F01);
    for (const id of ['constructor', 'tostring', 'hasownproperty', 'valueof']) {
      for (const place of [{ t: 'island', id }, { t: 'region', id }, { t: 'lesson', id }, { t: 'lab', id }, { t: 'island', id: 'foundations', r: id }] as PlaceClaim[]) {
        expect((await visitor.send(heartbeat(place))).status, JSON.stringify(place)).toBe(200);
        now += 2_000;
      }
    }
    const counts = await population();
    expect(counts.total).toBe(1);
    expect(Object.keys(counts.regions).sort()).toEqual(['ai', 'cs', 'design', 'sys', 'web']);
    for (const id of ['__proto__', 'Constructor', '<script>', '../x', 'a b', 'a'.repeat(65), '', 'ｆoundations'])
      expect((await visitor.send({ v: 1, tab: 'aaaaaaaa00000001', since: now, place: { t: 'island', id } })).status, id).toBe(400);
    // A body that tries to reach the prototype is just a body with an unknown key.
    expect((await post(null, { raw: `{"__proto__":{"polluted":1},"v":1,"tab":"aaaaaaaa00000001","since":${now},"place":{"t":"hub"}}` })).status).toBe(400);
    expect((await post(null, { raw: `{"v":1,"tab":"aaaaaaaa00000001","since":${now},"place":{"t":"hub","__proto__":{"t":"island"}}}` })).status).toBe(400);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('answers with JSON nobody can read across origins or mistake for a page', async () => {
    const visitor = browser();
    const responses = [await visitor.send(heartbeat(F01)), await handlePresenceGet(new Request(`${ORIGIN}/api/presence?callback=alert(1)&x=<script>`, { headers: { origin: 'https://evil.example' } }), deps),
      await post(heartbeat(F01), { headers: { origin: 'https://evil.example' } }), await post(null, { raw: '<script>alert(1)</script>' })];
    for (const response of responses) {
      expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      for (const header of ['access-control-allow-origin', 'access-control-allow-credentials']) expect(response.headers.get(header)).toBeNull();
      const text = await response.text();
      expect(text).not.toContain('alert');
      expect(text).not.toContain('<');
      expect(() => JSON.parse(text)).not.toThrow();
    }
  });

  it('says only that it is unavailable when the store fails, and nothing about why', async () => {
    const broken: PresenceStore = { touch: async () => { throw new Error('ECONNREFUSED redis://user:hunter2@10.0.0.5:6379'); }, leave: async () => { throw new Error('boom'); }, counts: async () => { throw new Error('boom at /var/task/store.ts:12'); } };
    const visitor = browser();
    await visitor.arrive(F01);
    deps = { ...deps, store: broken };
    const responses = [await visitor.send(heartbeat(F01)), await visitor.send({ v: 1, tab: 'aaaaaaaa00000001', leave: true }), await handlePresenceGet(new Request(`${ORIGIN}/api/presence`), deps)];
    for (const response of responses) {
      expect(response.status).toBe(503);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
      expect(await response.json()).toEqual({ ok: false, error: 'unavailable' });
    }
  });

  it('takes a goodbye\'s time only when it is a plausible time, and nothing else beside it', async () => {
    const visitor = browser();
    await visitor.arrive(F01);
    const bye = { v: 1, tab: 'aaaaaaaa00000001', leave: true };
    for (const body of [{ ...bye, at: 'now' }, { ...bye, at: now - 3 * 86_400_000 }, { ...bye, at: 1.5 }, { ...bye, at: now, since: now }, { ...bye, at: now, place: { t: 'hub' } }, { ...heartbeat(F01), at: now }])
      expect((await visitor.send(body)).status, JSON.stringify(body)).toBe(400);
    expect((await population()).total).toBe(1);
    expect((await visitor.send({ ...bye, at: now })).status).toBe(200);
    expect((await population()).total).toBe(0);
  });
});

describe('privacy signals: Global Privacy Control and Do Not Track', () => {
  it('reads either signal, and only a clear one', () => {
    const request = (headers: Record<string, string>) => new Request(`${ORIGIN}/api/presence`, { headers });
    expect(privacySignal(request({ 'sec-gpc': '1' }))).toBe(true);
    expect(privacySignal(request({ dnt: '1' }))).toBe(true);
    for (const headers of [{}, { 'sec-gpc': '0' }, { dnt: '0' }, { dnt: 'unspecified' }, { 'sec-gpc': 'true' }] as Record<string, string>[]) expect(privacySignal(request(headers)), JSON.stringify(headers)).toBe(false);
    expect(PRESENCE.honorPrivacySignals).toBe(true);
  });

  it('gives a browser that sends one no cookie and no session, and tells it to stay quiet', async () => {
    for (const headers of [{ 'sec-gpc': '1' }, { dnt: '1' }] as Record<string, string>[]) {
      const response = await post(heartbeat(F01), { headers });
      expect(response.status).toBe(200);
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(await response.json()).toEqual({ ok: true, counted: false, next: PRESENCE.quietMs });
    }
    expect((deps.store as MemoryPresenceStore).size).toBe(0);
    expect((await population()).total).toBe(0);
  });

  it('stops counting a visitor who turns the signal on, and lets them read the totals all the same', async () => {
    const visitor = browser();
    await visitor.arrive(F01);
    expect((await population()).total).toBe(1);
    // The signal is on from now: heartbeats change nothing, and the session ends with its timeout.
    now += 30_000;
    expect(await (await visitor.send(heartbeat(DB01), { headers: { 'sec-gpc': '1' } })).json()).toMatchObject({ counted: false });
    expect(await population()).toMatchObject({ total: 1, islands: { foundations: 1 } });
    now += PRESENCE.ttlMs;
    expect((await population()).total).toBe(0);
    const read = await handlePresenceGet(new Request(`${ORIGIN}/api/presence`, { headers: { 'sec-gpc': '1', dnt: '1' } }), deps);
    expect(read.status).toBe(200);
    expect(read.headers.get('set-cookie')).toBeNull();
  });

  it('still refuses what it refuses anyone: the signal is no way round the checks', async () => {
    expect((await post(heartbeat(F01), { headers: { 'sec-gpc': '1', origin: 'https://evil.example' } })).status).toBe(403);
    expect((await post({ v: 9 }, { headers: { dnt: '1' } })).status).toBe(400);
  });
});
