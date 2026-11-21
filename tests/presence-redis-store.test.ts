import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PRESENCE } from '@/lib/presence/config';
import type { Heartbeat } from '@/lib/presence/engine';
import type { PresenceLocation } from '@/lib/presence/locations';
import { HELD_SCRIPT, LIVE_SCRIPT, RedisPresenceStore, WRITE_SCRIPT, sharedStoreConfig, upstashRest, type RedisLike } from '@/lib/presence/redis-store';
import { handlePresenceGet, handlePresencePost } from '@/lib/presence/service';
import { MemoryPresenceStore, presenceStore } from '@/lib/presence/store';
import { FakeRedis } from './helpers/fake-redis';
import { presenceOrderingContract, presenceStoreContract } from './helpers/presence-store-contract';
import { RespClient } from './helpers/resp-client';

/*
 * P4: the shared (Redis) presence store. It runs the same contract as the memory store, twice:
 *
 *   - against a stand-in that does what the store's Lua scripts do and shuffles the order of concurrent calls, always;
 *   - against a real Redis, when PRESENCE_TEST_REDIS_URL names one (a local `redis-server`; see
 *     docs/planning/PRESENCE_SHARED_STORE.md §6). That run executes the Lua itself. Without the variable it is skipped,
 *     and reported as skipped, not passed.
 *
 * No test here reaches a hosted service: the Upstash adapter is checked against a stand-in for `fetch`.
 */

const F: PresenceLocation = { region: 'cs', island: 'foundations', course: 'F01' };
const DB: PresenceLocation = { region: 'cs', island: 'databases', course: 'DB01' };
const ML: PresenceLocation = { region: 'ai', island: 'machine-learning', course: null };
const beat = (tab: string, since: number, location: PresenceLocation): Heartbeat => ({ tab, since, location });
const T0 = 1_800_000_000_000;
let run = 0;
const prefix = () => `li:test:${process.pid}:${++run}`;

presenceStoreContract('the shared store (stand-in Redis)', max => {
  const store = new RedisPresenceStore(new FakeRedis(), { prefix: prefix(), maxSessions: max });
  return { store, held: () => store.held() };
});

presenceOrderingContract('the shared store (stand-in Redis, three instances)', () => {
  const redis = new FakeRedis(), name = prefix(), instances = [0, 1, 2].map(() => new RedisPresenceStore(redis, { prefix: name }));
  return { instances, held: () => instances[0].held() };
});

describe('the shared store: several server instances, one database', () => {
  it('ends in a state some order of the writes would give when two instances write one session at once', async () => {
    for (let round = 0; round < 25; round++) {
      const redis = new FakeRedis(), name = prefix();
      const a = new RedisPresenceStore(redis, { prefix: name }), b = new RedisPresenceStore(redis, { prefix: name });
      await a.touch('s1', beat('taba0001', 1, F), T0);
      // The visitor turns to a second tab (later `since`) while the first still reports: one request lands on each instance.
      const results = await Promise.all([a.touch('s1', beat('taba0001', 1, F), T0 + 10 + round), b.touch('s1', beat('tabb0002', 5, DB), T0 + 10 + round),
        a.touch('s1', beat('taba0001', 1, F), T0 + 20 + round), b.touch('s1', beat('tabb0002', 5, DB), T0 + 20 + round)]);
      expect(results).toEqual(['counted', 'counted', 'counted', 'counted']);
      for (const store of [a, b]) {
        const counts = await store.counts(T0 + 100);
        expect(counts.total, `round ${round}`).toBe(1);
        expect(counts.islands, `round ${round}`).toEqual({ databases: 1 });
      }
      expect(await a.held()).toBe(1);
      // No write was lost: all five were counted against the session's rate window.
      expect(JSON.parse([...redis.hashes.get(`${name}:records`)!.values()][0]).writes).toBe(5);
    }
  });

  it('counts the same from every instance, and a leave on one is seen by the other', async () => {
    const redis = new FakeRedis(), name = prefix();
    const a = new RedisPresenceStore(redis, { prefix: name }), b = new RedisPresenceStore(redis, { prefix: name });
    await Promise.all([a.touch('s1', beat('taba0001', 1, F), T0), b.touch('s2', beat('tabz0009', 1, ML), T0), a.touch('s3', beat('tabq0003', 1, ML), T0)]);
    expect(await a.counts(T0 + 1)).toEqual(await b.counts(T0 + 1));
    expect((await b.counts(T0 + 1)).islands).toEqual({ foundations: 1, 'machine-learning': 2 });
    await b.leave('s1', { tab: 'taba0001', at: 5 }, T0 + 2);
    expect((await a.counts(T0 + 3)).islands).toEqual({ 'machine-learning': 2 });
  });

  it('keeps the rate limit across instances: a flood spread over them is refused all the same', async () => {
    const redis = new FakeRedis(), name = prefix();
    const stores = [new RedisPresenceStore(redis, { prefix: name }), new RedisPresenceStore(redis, { prefix: name }), new RedisPresenceStore(redis, { prefix: name })];
    // Three requests at a time, one on each instance, for as long as the flood lasts.
    const results: string[] = [];
    for (let i = 0; i < PRESENCE.rateLimit + 20; i += 3) results.push(...await Promise.all(stores.map((store, k) => store.touch('s1', beat('taba0001', 1, F), T0 + i + k))));
    expect(results.filter(r => r === 'counted')).toHaveLength(PRESENCE.rateLimit);
    expect(results.filter(r => r === 'rate-limited')).toHaveLength(20);
    expect(await stores[0].touch('s1', beat('taba0001', 2, ML), T0 + PRESENCE.rateWindowMs + 1)).toBe('counted');
  });
});

describe('the shared store: what it costs and what it keeps', () => {
  it('takes one command for a heartbeat this instance saw before, two for one it did not', async () => {
    const redis = new FakeRedis(false), name = prefix();
    const a = new RedisPresenceStore(redis, { prefix: name }), b = new RedisPresenceStore(redis, { prefix: name });
    await a.touch('s1', beat('taba0001', 1, F), T0);
    expect(redis.calls).toHaveLength(2);
    await a.touch('s1', beat('taba0001', 1, F), T0 + 30_000);
    expect(redis.calls).toHaveLength(3);
    // Another instance has to ask first; after that it knows too. Then the first one's memory is out of date: one retry.
    await b.touch('s1', beat('taba0001', 1, F), T0 + 60_000);
    expect(redis.calls).toHaveLength(5);
    await a.touch('s1', beat('taba0001', 1, F), T0 + 90_000);
    expect(redis.calls).toHaveLength(7);
    await a.counts(T0 + 90_000);
    expect(redis.calls).toHaveLength(8);
    expect(redis.calls.every(call => [WRITE_SCRIPT, LIVE_SCRIPT, HELD_SCRIPT].includes(call.script))).toBe(true);
  });

  it('reuses a count inside an instance for the time it is told to, and not a moment longer', async () => {
    const redis = new FakeRedis(false), store = new RedisPresenceStore(redis, { prefix: prefix(), countsCacheMs: 5_000 });
    await store.touch('s1', beat('taba0001', 1, F), T0);
    const before = redis.calls.length;
    const first = await store.counts(T0 + 1_000);
    expect(await store.counts(T0 + 5_999)).toBe(first);
    expect(redis.calls.length).toBe(before + 1);
    await store.counts(T0 + 6_000);
    expect(redis.calls.length).toBe(before + 2);
    // A clock that went back is not a reason to trust an old count.
    await store.counts(T0);
    expect(redis.calls.length).toBe(before + 3);
  });

  it('gives both keys a lifetime with every write, so a switched-off feature leaves nothing behind', async () => {
    const redis = new FakeRedis(false), name = prefix(), store = new RedisPresenceStore(redis, { prefix: name, keyTtlMs: 3_600_000 });
    await store.touch('s1', beat('taba0001', 1, F), T0);
    expect(Object.fromEntries(redis.ttl)).toEqual({ [`${name}:records`]: 3_600_000, [`${name}:seen`]: 3_600_000 });
    expect([...redis.hashes.keys(), ...redis.sets.keys()].sort()).toEqual([`${name}:records`, `${name}:seen`]);
  });

  it('stores a session\'s place and times, and nothing about the visitor', async () => {
    const redis = new FakeRedis(false), name = prefix(), store = new RedisPresenceStore(redis, { prefix: name });
    await store.touch('sid-1', beat('taba0001', 123, F), T0);
    const stored = JSON.parse(redis.hashes.get(`${name}:records`)!.get('sid-1')!);
    expect(Object.keys(stored).sort()).toEqual(['away', 'location', 'ownerSeen', 'seen', 'since', 'tab', 'windowStart', 'writes']);
    expect(redis.sets.get(`${name}:seen`)!.get('sid-1')).toBe(T0);
  });

  it('ignores a record it cannot read instead of failing the count', async () => {
    const redis = new FakeRedis(false), name = prefix(), store = new RedisPresenceStore(redis, { prefix: name });
    await store.touch('s1', beat('taba0001', 1, F), T0);
    redis.hashes.get(`${name}:records`)!.set('broken', '{not json');
    redis.sets.get(`${name}:seen`)!.set('broken', T0);
    redis.hashes.get(`${name}:records`)!.set('odd', '{"seen":"yesterday"}');
    redis.sets.get(`${name}:seen`)!.set('odd', T0);
    expect((await store.counts(T0 + 1)).total).toBe(1);
    // The same session id, written properly, replaces the unreadable record.
    expect(await store.touch('broken', beat('taba0001', 1, ML), T0 + 2)).toBe('counted');
    expect((await store.counts(T0 + 3)).total).toBe(2);
  });

  it('gives up loudly when a session changes under every attempt, and says so when the store answers nonsense', async () => {
    const moving: RedisLike = { eval: async () => ['conflict', JSON.stringify({ location: F, seen: T0 + Math.random(), tab: 'taba0001', since: 1, ownerSeen: T0, away: false, windowStart: T0, writes: 1 })] };
    await expect(new RedisPresenceStore(moving, { prefix: prefix() }).touch('s1', beat('taba0001', 1, F), T0)).rejects.toThrow('changed under every attempt');
    for (const reply of [null, 'OK', [], [1]]) {
      const odd: RedisLike = { eval: async () => reply };
      await expect(new RedisPresenceStore(odd, { prefix: prefix() }).touch('s1', beat('taba0001', 1, F), T0)).rejects.toThrow('unexpected reply');
    }
    await expect(new RedisPresenceStore({ eval: async () => 'OK' }, { prefix: prefix() }).counts(T0)).rejects.toThrow('unexpected reply');
  });
});

describe('the Upstash REST adapter and the deployment\'s configuration', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('sends one EVAL a call with the token, and returns the result', async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => { seen.push({ url: String(url), init: init! }); return new Response(JSON.stringify({ result: ['ok'] })); }) as typeof fetch;
    const redis = upstashRest('https://example-db.upstash.io', 'TOKEN-VALUE', fetchImpl);
    expect(await redis.eval('return 1', ['k1', 'k2'], ['a', 'b'])).toEqual(['ok']);
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe('https://example-db.upstash.io');
    expect(seen[0].init.method).toBe('POST');
    expect((seen[0].init.headers as Record<string, string>).authorization).toBe('Bearer TOKEN-VALUE');
    expect(JSON.parse(String(seen[0].init.body))).toEqual(['EVAL', 'return 1', 2, 'k1', 'k2', 'a', 'b']);
  });

  it('fails without ever naming the address or the token', async () => {
    const failing = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    for (const fetchImpl of [failing(401, { error: 'WRONGPASS invalid token TOKEN-VALUE' }), failing(500, {}), failing(200, { error: 'ERR at https://example-db.upstash.io TOKEN-VALUE' })]) {
      const error = await upstashRest('https://example-db.upstash.io', 'TOKEN-VALUE', fetchImpl).eval('return 1', [], []).then(() => null, e => e as Error);
      expect(error).toBeInstanceOf(Error);
      expect(error!.message).not.toContain('TOKEN-VALUE');
      expect(error!.message).not.toContain('example-db');
    }
  });

  it('runs the whole store through the adapter', async () => {
    const backing = new FakeRedis(false);
    const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      const [command, script, count, ...rest] = JSON.parse(String(init!.body)) as [string, string, number, ...string[]];
      expect(command).toBe('EVAL');
      return new Response(JSON.stringify({ result: await backing.eval(script, rest.slice(0, count), rest.slice(count)) }));
    }) as typeof fetch;
    const store = new RedisPresenceStore(upstashRest('https://example-db.upstash.io', 't', fetchImpl), { prefix: prefix() });
    expect(await store.touch('s1', beat('taba0001', 1, F), T0)).toBe('counted');
    expect((await store.counts(T0 + 1)).islands).toEqual({ foundations: 1 });
  });

  it('finds a shared store only when both its address and its token are set, over https', () => {
    expect(sharedStoreConfig({})).toBeUndefined();
    expect(sharedStoreConfig({ KV_REST_API_URL: 'https://a.upstash.io' })).toBeUndefined();
    expect(sharedStoreConfig({ KV_REST_API_TOKEN: 't' })).toBeUndefined();
    expect(sharedStoreConfig({ KV_REST_API_URL: 'http://a.upstash.io', KV_REST_API_TOKEN: 't' })).toBeUndefined();
    expect(sharedStoreConfig({ KV_REST_API_URL: 'https://a.upstash.io', KV_REST_API_TOKEN: 't' })).toEqual({ url: 'https://a.upstash.io', token: 't' });
    expect(sharedStoreConfig({ UPSTASH_REDIS_REST_URL: 'https://b.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'u' })).toEqual({ url: 'https://b.upstash.io', token: 'u' });
  });

  it('gives a Vercel Production deployment no store without a shared one, and the API says it is not configured', async () => {
    expect(presenceStore({})).toBeInstanceOf(MemoryPresenceStore);
    expect(presenceStore({ VERCEL_ENV: 'preview' })).toBeInstanceOf(MemoryPresenceStore);
    expect(presenceStore({ VERCEL_ENV: 'production' })).toBeUndefined();
    const shared = presenceStore({ VERCEL_ENV: 'production', KV_REST_API_URL: 'https://a.upstash.io', KV_REST_API_TOKEN: 't' });
    expect(shared).toBeInstanceOf(RedisPresenceStore);
    // One store an address, kept for the life of the instance.
    expect(presenceStore({ VERCEL_ENV: 'production', KV_REST_API_URL: 'https://a.upstash.io', KV_REST_API_TOKEN: 't' })).toBe(shared);

    vi.stubEnv('LOGIC_ISLAND_PRESENCE', '1');
    const deps = { store: undefined, now: () => T0, secret: 'test-secret-test-secret-test-secret-1234' };
    const post = await handlePresencePost(new Request('https://logic-island.test/api/presence', { method: 'POST', headers: { origin: 'https://logic-island.test', host: 'logic-island.test' },
      body: JSON.stringify({ v: 1, tab: 'aaaaaaaa00000001', since: T0, place: { t: 'hub' } }) }), deps);
    const get = await handlePresenceGet(new Request('https://logic-island.test/api/presence'), deps);
    for (const response of [post, get]) {
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ ok: false, error: 'unconfigured' });
      expect(response.headers.get('set-cookie')).toBeNull();
    }
  });
});

/*
 * The same contract, and the scripts themselves, on a real Redis: only when one is named. Start one for the run with
 * `redis-server --port 6391 --bind 127.0.0.1 --save '' --appendonly no` and pass PRESENCE_TEST_REDIS_URL=redis://127.0.0.1:6391.
 */
const REAL = process.env.PRESENCE_TEST_REDIS_URL;
const local = (() => { try { return REAL ? ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(REAL).hostname) : false; } catch { return false; } })();
describe.skipIf(!REAL || !local)('the shared store on a real Redis (PRESENCE_TEST_REDIS_URL, this machine only)', () => {
  let client: RespClient;
  const used: string[] = [];
  const name = () => { const p = prefix(); used.push(p); return p; };
  beforeAll(async () => { client = await RespClient.open(REAL!); });
  afterAll(async () => {
    for (const p of used) await client.command('DEL', `${p}:records`, `${p}:seen`);
    client.close();
  });

  presenceStoreContract('real Redis', max => {
    const store = new RedisPresenceStore(client, { prefix: name(), maxSessions: max });
    return { store, held: () => store.held() };
  });

  // P6-A: four instances, each on a connection of its own, so their scripts really interleave on the server.
  const extra: RespClient[] = [];
  afterAll(() => { for (const connection of extra) connection.close(); });
  presenceOrderingContract('real Redis, four instances on four connections', () => {
    const p = name(), connections: RespClient[] = [];
    const instances = [0, 1, 2, 3].map(i => new RedisPresenceStore({ eval: async (script, keys, args) => (connections[i] ??= await opened()).eval(script, keys, args) }, { prefix: p }));
    return { instances, held: () => instances[0].held() };
  });
  const opened = async () => { const connection = await RespClient.open(REAL!); extra.push(connection); return connection; };

  it('keeps the score of a session at its record\'s last sign of life, and one member a session, after a storm of requests', async () => {
    const p = name(), connections = await Promise.all([opened(), opened(), opened()]);
    const stores = connections.map(connection => new RedisPresenceStore(connection, { prefix: p }));
    const jobs: Promise<unknown>[] = [];
    for (let i = 0; i < 300; i++) {
      const sid = `s${i % 25}`, store = stores[i % 3], now = T0 + (i * 37) % 1_000;
      jobs.push(i % 7 === 3 ? store.leave(sid, { tab: i % 2 ? 'taba0001' : 'tabb0002', at: 100 + i }, now) : store.touch(sid, beat(i % 2 ? 'taba0001' : 'tabb0002', 100 + i, i % 2 ? F : DB), now));
    }
    await Promise.all(jobs);
    expect(Number(await client.command('HLEN', `${p}:records`))).toBe(25);
    expect(Number(await client.command('ZCARD', `${p}:seen`))).toBe(25);
    for (let i = 0; i < 25; i++) {
      const record = JSON.parse(String(await client.command('HGET', `${p}:records`, `s${i}`)));
      expect(Number(await client.command('ZSCORE', `${p}:seen`, `s${i}`))).toBe(record.seen);
      expect(Object.keys(record.left ?? {}).length).toBeLessThanOrEqual(2);
    }
    expect((await stores[0].counts(T0 + 2_000)).total).toBeLessThanOrEqual(25);
  });

  it('writes, conflicts and refuses exactly as the scripts say', async () => {
    const p = name(), keys = [`${p}:records`, `${p}:seen`];
    const write = (sid: string, expected: string, next: string, seen: number, max = 2, cutoff = 0) => client.eval(WRITE_SCRIPT, keys, [sid, expected, next, String(seen), String(max), String(cutoff), '60000']);
    expect(await write('a', '', 'A1', 100)).toEqual(['ok']);
    expect(await write('a', '', 'A2', 110)).toEqual(['conflict', 'A1']);
    expect(await write('a', 'A1', 'A2', 110)).toEqual(['ok']);
    expect(await write('zz', '\u0000', '', 0)).toEqual(['conflict', '']);
    expect(await write('b', '', 'B1', 120)).toEqual(['ok']);
    // Full: a third session is refused, a held one is not; once the others are over there is room again.
    expect(await write('c', '', 'C1', 130)).toEqual(['full']);
    expect(await write('a', 'A2', 'A3', 140)).toEqual(['ok']);
    expect(await write('c', '', 'C1', 500, 2, 130)).toEqual(['ok']);
    expect(await client.eval(HELD_SCRIPT, [keys[0]], [])).toBe(2);
    expect(await client.eval(LIVE_SCRIPT, keys, ['0'])).toEqual(['A3', 'C1']);
    expect(await client.eval(LIVE_SCRIPT, keys, ['141'])).toEqual(['C1']);
    expect(await client.eval(HELD_SCRIPT, [keys[0]], [])).toBe(1);
    // Both keys carry the lifetime the write gave them.
    for (const key of keys) { const ttl = Number(await client.command('PTTL', key)); expect(ttl).toBeGreaterThan(0); expect(ttl).toBeLessThanOrEqual(60_000); }
  });

  it('reads thousands of live sessions and removes thousands of dead ones', async () => {
    const p = name(), store = new RedisPresenceStore(client, { prefix: p, maxSessions: 10_000 });
    await Promise.all(Array.from({ length: 2_500 }, (_, i) => store.touch(`s${i}`, beat('taba0001', 1, i % 2 ? F : ML), T0 + (i % 50))));
    const counts = await store.counts(T0 + 1_000);
    expect(counts.total).toBe(2_500);
    expect(counts.islands).toEqual({ foundations: 1_250, 'machine-learning': 1_250 });
    // Over: a thousand a count are removed, and none is counted meanwhile.
    const later = T0 + PRESENCE.ttlMs + 60_000;
    expect((await store.counts(later)).total).toBe(0);
    expect(await store.held()).toBe(1_500);
    await store.counts(later); await store.counts(later);
    expect(await store.held()).toBe(0);
  });
});
