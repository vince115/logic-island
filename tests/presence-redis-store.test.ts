import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PRESENCE } from '@/lib/presence/config';
import type { Heartbeat } from '@/lib/presence/engine';
import type { PresenceLocation } from '@/lib/presence/locations';
import { RedisPresenceStore, SWEEP_SCRIPT, WRITE_SCRIPT, decodeRecord, encodeRecord, sharedStoreConfig, upstashRest, type RedisLike } from '@/lib/presence/redis-store';
import { handlePresenceGet, handlePresencePost } from '@/lib/presence/service';
import { MemoryPresenceStore, presenceStore, sharedStorePrefix } from '@/lib/presence/store';
import { FakeRedis } from './helpers/fake-redis';
import { presenceOrderingContract, presenceStoreContract } from './helpers/presence-store-contract';
import { RespClient } from './helpers/resp-client';

/*
 * P4: the shared (Redis) presence store. It runs the same contract as the memory store, twice:
 *
 *   - against a stand-in that does what the store's Lua scripts and commands do and shuffles the order of concurrent
 *     calls, always;
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
      expect(decodeRecord([...redis.hashes.get(`${name}:sessions`)!.values()][0])!.writes).toBe(5);
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
  /*
   * P6-C. The bill is Upstash's: a plain command is one, a script is one plus one for every command it runs
   * (https://upstash.com/docs/redis/overall/billing). The stand-in counts the same way; the real Redis's own command
   * statistics are held against the same numbers further down.
   */
  it('bills three commands for a heartbeat this instance saw before, four when another instance wrote the session last', async () => {
    const redis = new FakeRedis(false), name = prefix();
    const a = new RedisPresenceStore(redis, { prefix: name }), b = new RedisPresenceStore(redis, { prefix: name });
    const cost = async (run: () => Promise<unknown>) => { const before = redis.billed; await run(); return redis.billed - before; };
    // The very first write of a database: HGET (nobody remembers the session), then EVAL + HMGET + HLEN + HSET, the
    // first sweep (HGETALL, nothing to remove) and the key's lifetime (PEXPIRE).
    expect(await cost(() => a.touch('s1', beat('taba0001', 1, F), T0))).toBe(7);
    // The steady state: EVAL + HMGET + HSET.
    expect(await cost(() => a.touch('s1', beat('taba0001', 1, F), T0 + 30_000))).toBe(3);
    expect(await cost(() => a.touch('s1', beat('taba0001', 1, F), T0 + 60_000))).toBe(3);
    // Another instance has to ask first (HGET); nothing else is different for it, however new it is.
    expect(await cost(() => b.touch('s1', beat('taba0001', 1, F), T0 + 90_000))).toBe(4);
    expect(await cost(() => b.touch('s1', beat('taba0001', 1, F), T0 + 120_000))).toBe(3);
    // Then the first one's memory is out of date: a lost attempt (EVAL + HMGET) and the write.
    expect(await cost(() => a.touch('s1', beat('taba0001', 1, F), T0 + 150_000))).toBe(5);
    // A second session on a warm instance: HGET, then EVAL + HMGET + HLEN + HSET.
    expect(await cost(() => a.touch('s2', beat('tabq0003', 1, ML), T0 + 150_500))).toBe(5);
    // A goodbye is a write like any other.
    expect(await cost(() => a.leave('s1', { tab: 'taba0001', at: 5 }, T0 + 151_000))).toBe(3);
    // A count is one command; with sessions that are over, the sweep on top (EVAL + HGETALL + HDEL).
    expect(await cost(() => a.counts(T0 + 152_000))).toBe(1);
    expect(await cost(() => a.counts(T0 + 150_500 + PRESENCE.ttlMs + 1))).toBe(4);
    expect(await cost(() => a.counts(T0 + 150_500 + PRESENCE.ttlMs + 2))).toBe(1);
    expect(redis.calls.every(call => call.script ? [WRITE_SCRIPT, SWEEP_SCRIPT].includes(call.script) : ['HGET', 'HGETALL', 'HLEN'].includes(call.command!))).toBe(true);
  });

  it('sweeps with the first write every ten minutes, whichever instance makes it, and removes what is over', async () => {
    const redis = new FakeRedis(false), name = prefix(), store = new RedisPresenceStore(redis, { prefix: name });
    const cost = async (run: () => Promise<unknown>) => { const before = redis.billed; await run(); return redis.billed - before; };
    await store.touch('stays', beat('taba0001', 1, F), T0);
    await store.touch('goes', beat('taba0001', 1, DB), T0);
    for (let t = 30_000; t < 600_000; t += 30_000) expect(await cost(() => store.touch('stays', beat('taba0001', 1, F), T0 + t))).toBe(3);
    // Nobody asked for a count in ten minutes, so the session that went is still held; the next write removes it:
    // EVAL + HMGET + HSET, and HGETALL + HDEL. A brand-new instance does it just the same (HGET first).
    expect(await store.held()).toBe(2);
    expect(await cost(() => new RedisPresenceStore(redis, { prefix: name }).touch('stays', beat('taba0001', 1, F), T0 + 600_000))).toBe(6);
    expect(await store.held()).toBe(1);
    // And not again before another ten minutes, by any instance (one whose memory is out of date loses an attempt first).
    expect(await cost(() => store.touch('stays', beat('taba0001', 1, F), T0 + 630_000))).toBe(5);
    expect(await cost(() => new RedisPresenceStore(redis, { prefix: name }).touch('stays', beat('taba0001', 1, F), T0 + 660_000))).toBe(4);
    expect(await cost(() => store.touch('stays', beat('taba0001', 1, F), T0 + 690_000))).toBe(5);
    for (let t = 720_000; t < 1_200_000; t += 30_000) expect(await cost(() => store.touch('stays', beat('taba0001', 1, F), T0 + t))).toBe(3);
    // Ten minutes after the last sweep, with nothing over: one command more (HGETALL).
    expect(await cost(() => store.touch('stays', beat('taba0001', 1, F), T0 + 1_200_000))).toBe(4);
  });

  it('bills nothing for a write refused inside a full rate window, once the window is known', async () => {
    const redis = new FakeRedis(false), store = new RedisPresenceStore(redis, { prefix: prefix() });
    for (let i = 0; i < PRESENCE.rateLimit; i++) await store.touch('s1', beat('taba0001', 1, F), T0 + i);
    const before = redis.billed;
    for (let i = 0; i < 500; i++) expect(await store.touch('s1', beat('taba0001', 1, F), T0 + 1_000 + i)).toBe('rate-limited');
    expect(redis.billed).toBe(before);
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

  it('gives the key a lifetime and renews it a quarter of it apart, so a switched-off feature leaves nothing behind', async () => {
    const redis = new FakeRedis(false), name = prefix(), store = new RedisPresenceStore(redis, { prefix: name, keyTtlMs: 3_600_000 });
    await store.touch('s1', beat('taba0001', 1, F), T0);
    expect(Object.fromEntries(redis.ttl)).toEqual({ [`${name}:sessions`]: 3_600_000 });
    expect([...redis.hashes.keys()]).toEqual([`${name}:sessions`]);
    expect(redis.renewals).toBe(1);
    await store.touch('s1', beat('taba0001', 1, F), T0 + 899_999);
    expect(redis.renewals).toBe(1);
    // A new instance does not renew by itself: the hash remembers when it was last done.
    await new RedisPresenceStore(redis, { prefix: name, keyTtlMs: 3_600_000 }).touch('s1', beat('taba0001', 1, F), T0 + 899_999);
    expect(redis.renewals).toBe(1);
    await store.touch('s1', beat('taba0001', 1, F), T0 + 900_000);
    expect(redis.renewals).toBe(2);
    // The hash's own two fields are no sessions: not held, not counted.
    expect([...redis.hashes.get(`${name}:sessions`)!.keys()].sort()).toEqual(['s1', '~renewed', '~swept']);
    expect(await store.held()).toBe(1);
    expect((await store.counts(T0 + 900_001)).total).toBe(1);
  });

  it('stores a session\'s place and times, and nothing about the visitor', async () => {
    const redis = new FakeRedis(false), name = prefix(), store = new RedisPresenceStore(redis, { prefix: name });
    await store.touch('sid-1', beat('taba0001', 123, F), T0);
    const stored = redis.hashes.get(`${name}:sessions`)!.get('sid-1')!;
    expect(stored.startsWith(`${T0}:{`)).toBe(true);
    expect(Object.keys(decodeRecord(stored)!).sort()).toEqual(['away', 'location', 'ownerSeen', 'seen', 'since', 'tab', 'windowStart', 'writes']);
    // After goodbyes it also remembers when which tab left: a tab's random label and a time, nothing more.
    await store.leave('sid-1', { tab: 'taba0001', at: 200 }, T0 + 1);
    const after = decodeRecord(redis.hashes.get(`${name}:sessions`)!.get('sid-1'))!;
    expect(Object.keys(after).sort()).toEqual(['away', 'left', 'location', 'ownerSeen', 'seen', 'since', 'tab', 'windowStart', 'writes']);
    expect(after.left).toEqual({ taba0001: 200 });
    expect(encodeRecord(after)).toBe(redis.hashes.get(`${name}:sessions`)!.get('sid-1'));
  });

  it('ignores a value it cannot read instead of failing the count, and clears away what is no record at all', async () => {
    const redis = new FakeRedis(false), name = prefix(), store = new RedisPresenceStore(redis, { prefix: name });
    await store.touch('s1', beat('taba0001', 1, F), T0);
    const records = redis.hashes.get(`${name}:sessions`)!;
    records.set('broken', '{not json');
    records.set('odd', `${T0}:{"seen":"yesterday"}`);
    records.set('cut', `${T0}:{"seen":`);
    expect((await store.counts(T0 + 1)).total).toBe(1);
    // What does not even start with a time is no record: the count's sweep removed it. The others go at their time.
    expect([...records.keys()].filter(field => !field.startsWith('~')).sort()).toEqual(['cut', 'odd', 's1']);
    // The same session id, written properly, replaces an unreadable record.
    expect(await store.touch('odd', beat('taba0001', 1, ML), T0 + 2)).toBe('counted');
    expect((await store.counts(T0 + 3)).total).toBe(2);
    expect((await store.counts(T0 + PRESENCE.ttlMs + 3)).total).toBe(0);
    expect(await store.held()).toBe(0);
  });

  it('gives up loudly when a session changes under every attempt, and says so when the store answers nonsense', async () => {
    const moving: RedisLike = { command: async () => null,
      eval: async () => ['conflict', encodeRecord({ location: F, seen: T0 + Math.random(), tab: 'taba0001', since: 1, ownerSeen: T0, away: false, windowStart: T0, writes: 1 })] };
    await expect(new RedisPresenceStore(moving, { prefix: prefix() }).touch('s1', beat('taba0001', 1, F), T0)).rejects.toThrow('changed under every attempt');
    for (const reply of [null, 'OK', [], [1]]) {
      const odd: RedisLike = { command: async () => null, eval: async () => reply };
      await expect(new RedisPresenceStore(odd, { prefix: prefix() }).touch('s1', beat('taba0001', 1, F), T0)).rejects.toThrow('unexpected reply');
    }
    await expect(new RedisPresenceStore({ command: async () => 'OK', eval: async () => 0 }, { prefix: prefix() }).counts(T0)).rejects.toThrow('unexpected reply');
  });
});

describe('the Upstash REST adapter and the deployment\'s configuration', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('sends one command a call with the token, and returns the result', async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => { seen.push({ url: String(url), init: init! }); return new Response(JSON.stringify({ result: ['ok'] })); }) as typeof fetch;
    const redis = upstashRest('https://example-db.upstash.io', 'TOKEN-VALUE', fetchImpl);
    expect(await redis.eval('return 1', ['k1', 'k2'], ['a', 'b'])).toEqual(['ok']);
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe('https://example-db.upstash.io');
    expect(seen[0].init.method).toBe('POST');
    expect((seen[0].init.headers as Record<string, string>).authorization).toBe('Bearer TOKEN-VALUE');
    expect(JSON.parse(String(seen[0].init.body))).toEqual(['EVAL', 'return 1', 2, 'k1', 'k2', 'a', 'b']);
    await redis.command('HGET', 'k1', 'field');
    expect(JSON.parse(String(seen[1].init.body))).toEqual(['HGET', 'k1', 'field']);
    expect((seen[1].init.headers as Record<string, string>).authorization).toBe('Bearer TOKEN-VALUE');
  });

  it('fails without ever naming the address or the token', async () => {
    const failing = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    for (const fetchImpl of [failing(401, { error: 'WRONGPASS invalid token TOKEN-VALUE' }), failing(500, {}), failing(200, { error: 'ERR at https://example-db.upstash.io TOKEN-VALUE' })]) {
      const redis = upstashRest('https://example-db.upstash.io', 'TOKEN-VALUE', fetchImpl);
      for (const call of [() => redis.eval('return 1', [], []), () => redis.command('HGETALL', 'k')]) {
        const error = await call().then(() => null, e => e as Error);
        expect(error).toBeInstanceOf(Error);
        expect(error!.message).not.toContain('TOKEN-VALUE');
        expect(error!.message).not.toContain('example-db');
      }
    }
  });

  it('runs the whole store through the adapter', async () => {
    const backing = new FakeRedis(false);
    const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      const [command, ...parts] = JSON.parse(String(init!.body)) as [string, ...(string | number)[]];
      if (command !== 'EVAL') return new Response(JSON.stringify({ result: await backing.command(command, ...parts.map(String)) }));
      const [script, count, ...rest] = parts as [string, number, ...string[]];
      return new Response(JSON.stringify({ result: await backing.eval(script, rest.slice(0, count), rest.slice(count)) }));
    }) as typeof fetch;
    const store = new RedisPresenceStore(upstashRest('https://example-db.upstash.io', 't', fetchImpl), { prefix: prefix() });
    expect(await store.touch('s1', beat('taba0001', 1, F), T0)).toBe('counted');
    expect((await store.counts(T0 + 1)).islands).toEqual({ foundations: 1 });
    expect((await store.counts(T0 + PRESENCE.ttlMs + 1)).total).toBe(0);
    expect(await store.held()).toBe(0);
  });

  it('keeps each environment\'s sessions apart in one database: a Preview visitor is never counted in Production (P6-E)', async () => {
    expect(sharedStorePrefix({ VERCEL_ENV: 'production' })).toBe('li:presence:production');
    expect(sharedStorePrefix({ VERCEL_ENV: 'preview' })).toBe('li:presence:preview');
    expect(sharedStorePrefix({})).toBe('li:presence:local');
    // Whatever the variable holds, the prefix is a plain word.
    for (const odd of ['', 'Preview', 'a:b', '../x', 'x'.repeat(40)]) expect(sharedStorePrefix({ VERCEL_ENV: odd })).toBe('li:presence:local');
    // Two environments on one database (the stand-in), each through the prefix its deployment would use.
    const redis = new FakeRedis(false);
    const preview = new RedisPresenceStore(redis, { prefix: sharedStorePrefix({ VERCEL_ENV: 'preview' }) }), production = new RedisPresenceStore(redis, { prefix: sharedStorePrefix({ VERCEL_ENV: 'production' }) });
    await preview.touch('s1', beat('taba0001', 1, F), T0);
    await preview.touch('s2', beat('taba0001', 1, DB), T0);
    await production.touch('s1', beat('tabz0009', 1, ML), T0);
    expect((await preview.counts(T0 + 1)).islands).toEqual({ foundations: 1, databases: 1 });
    expect((await production.counts(T0 + 1)).islands).toEqual({ 'machine-learning': 1 });
    await production.leave('s1', { tab: 'tabz0009', at: 5 }, T0 + 2);
    expect((await preview.counts(T0 + 3)).total).toBe(2);
    expect([...redis.hashes.keys()].sort()).toEqual(['li:presence:preview:sessions', 'li:presence:production:sessions']);
    // The deployment's own store uses its environment's prefix, and a GET says the store is shared.
    vi.stubEnv('LOGIC_ISLAND_PRESENCE', '1');
    const response = await handlePresenceGet(new Request('https://logic-island.test/api/presence'), { store: preview, now: () => T0 + 4, secret: 'test-secret-test-secret-test-secret-1234' });
    expect(response.headers.get('x-presence-store')).toBe('shared');
    expect((await response.json()).total).toBe(2);
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
    expect(shared!.kind).toBe('shared');
    expect(presenceStore({})!.kind).toBe('memory');

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
 * The tests reset that server's command statistics (CONFIG RESETSTAT): a server of the test's own, never a shared one.
 */
const REAL = process.env.PRESENCE_TEST_REDIS_URL;
const local = (() => { try { return REAL ? ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(REAL).hostname) : false; } catch { return false; } })();
describe.skipIf(!REAL || !local)('the shared store on a real Redis (PRESENCE_TEST_REDIS_URL, this machine only)', () => {
  let client: RespClient;
  const used: string[] = [];
  const name = () => { const p = prefix(); used.push(p); return p; };
  beforeAll(async () => { client = await RespClient.open(REAL!); });
  afterAll(async () => {
    for (const p of used) await client.command('DEL', `${p}:sessions`);
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
    const p = name(), connections: Promise<RespClient>[] = [];
    // Each instance opens its connection once, with its first call.
    const connection = (i: number) => connections[i] ??= opened();
    const instances = [0, 1, 2, 3].map(i => new RedisPresenceStore({ eval: async (script, keys, args) => (await connection(i)).eval(script, keys, args), command: async (...parts) => (await connection(i)).command(...parts) }, { prefix: p }));
    return { instances, held: () => instances[0].held() };
  });
  const opened = async () => { const connection = await RespClient.open(REAL!); extra.push(connection); return connection; };

  it('keeps one value a session, starting with its record\'s last sign of life, after a storm of requests', async () => {
    const p = name(), connections = await Promise.all([opened(), opened(), opened()]);
    const stores = connections.map(connection => new RedisPresenceStore(connection, { prefix: p }));
    const jobs: Promise<unknown>[] = [];
    for (let i = 0; i < 300; i++) {
      const sid = `s${i % 25}`, store = stores[i % 3], now = T0 + (i * 37) % 1_000;
      jobs.push(i % 7 === 3 ? store.leave(sid, { tab: i % 2 ? 'taba0001' : 'tabb0002', at: 100 + i }, now) : store.touch(sid, beat(i % 2 ? 'taba0001' : 'tabb0002', 100 + i, i % 2 ? F : DB), now));
    }
    await Promise.all(jobs);
    expect(await stores[0].held()).toBe(25);
    for (let i = 0; i < 25; i++) {
      const stored = String(await client.command('HGET', `${p}:sessions`, `s${i}`)), record = decodeRecord(stored)!;
      expect(stored.startsWith(`${record.seen}:`)).toBe(true);
      expect(Object.keys(record.left ?? {}).length).toBeLessThanOrEqual(2);
    }
    expect((await stores[0].counts(T0 + 2_000)).total).toBeLessThanOrEqual(25);
  });

  it('writes, conflicts, refuses and sweeps exactly as the scripts say', async () => {
    const key = `${name()}:sessions`;
    const write = (sid: string, expected: string, next: string, { max = 2, cutoff = 0, now = 1_000, ttl = 60_000, every = 600_000 } = {}) =>
      client.eval(WRITE_SCRIPT, [key], [sid, expected, next, String(max), String(cutoff), String(ttl), String(now), String(every)]);
    const sessions = async () => { const all = await client.command('HGETALL', key) as string[], out: Record<string, string> = {}; for (let i = 0; i < all.length; i += 2) out[all[i]] = all[i + 1]; return out; };
    expect(await write('a', '', '100:A1')).toEqual(['ok']);
    // The first write swept (nothing) and gave the key its lifetime; the hash remembers both.
    expect(await sessions()).toEqual({ a: '100:A1', '~swept': '1000', '~renewed': '1000' });
    expect(await write('a', '', '110:A2')).toEqual(['conflict', '100:A1']);
    expect(await write('a', '100:A1', '110:A2')).toEqual(['ok']);
    expect(await write('b', '', '120:B1')).toEqual(['ok']);
    // Full: a third session is refused, a held one is not; once the others are over there is room again.
    expect(await write('c', '', '130:C1')).toEqual(['full']);
    expect(await write('a', '110:A2', '140:A3')).toEqual(['ok']);
    expect(await write('c', '', '500:C1', { cutoff: 130 })).toEqual(['ok']);
    expect(await sessions()).toEqual({ a: '140:A3', c: '500:C1', '~swept': '1000', '~renewed': '1000' });
    // Ten minutes on, a write sweeps what is over (and what is no record) on its way, and notes that it did.
    await client.command('HSET', key, 'junk', 'no time at all');
    expect(await write('c', '500:C1', '600:C2', { cutoff: 141, now: 601_000, max: 9 })).toEqual(['ok']);
    expect(await sessions()).toEqual({ c: '600:C2', '~swept': '601000', '~renewed': '601000' });
    // The sweep on its own removes the same, says how many, and leaves the hash's own fields alone.
    await client.command('HSET', key, 'd', '10:D1', 'junk', 'again');
    expect(await client.eval(SWEEP_SCRIPT, [key], ['141'])).toBe(2);
    expect(await client.eval(SWEEP_SCRIPT, [key], ['141'])).toBe(0);
    expect(await sessions()).toEqual({ c: '600:C2', '~swept': '601000', '~renewed': '601000' });
    // The key carries the lifetime a write gave it; a quarter of it later a write renews it, not before.
    const ttl = Number(await client.command('PTTL', key));
    expect(ttl).toBeGreaterThan(0); expect(ttl).toBeLessThanOrEqual(60_000);
    await client.command('PEXPIRE', key, 5_000_000);
    expect(await write('c', '600:C2', '700:C3', { now: 615_999, max: 9 })).toEqual(['ok']);
    expect(Number(await client.command('PTTL', key))).toBeGreaterThan(60_000);
    expect(await write('c', '700:C3', '800:C4', { now: 616_000, max: 9 })).toEqual(['ok']);
    expect(Number(await client.command('PTTL', key))).toBeLessThanOrEqual(60_000);
    expect(await sessions()).toEqual({ c: '800:C4', '~swept': '601000', '~renewed': '616000' });
    // A clock that went back sweeps and renews rather than waiting for the old time to come round again.
    expect(await write('c', '800:C4', '900:C5', { now: 5, max: 9 })).toEqual(['ok']);
    expect(await sessions()).toEqual({ c: '900:C5', '~swept': '5', '~renewed': '5' });
  });

  it('runs as many commands as the bill says: the server\'s own statistics against Upstash\'s rule', async () => {
    // On a connection of its own, with nothing else running: the statistics are the whole server's.
    const stats = await opened(), p = name(), store = new RedisPresenceStore(stats, { prefix: p }), other = new RedisPresenceStore(stats, { prefix: p });
    const BILLED = ['eval', 'hget', 'hmget', 'hset', 'hlen', 'hgetall', 'hdel', 'pexpire'];
    const cost = async (run: () => Promise<unknown>) => {
      await stats.command('CONFIG', 'RESETSTAT');
      await run();
      const info = String(await stats.command('INFO', 'commandstats')), calls: Record<string, number> = {};
      for (const [, command, count] of info.matchAll(/cmdstat_([a-z|]+):calls=(\d+)/g)) if (BILLED.includes(command)) calls[command] = Number(count);
      return { total: Object.values(calls).reduce((a, b) => a + b, 0), calls };
    };
    expect(await cost(() => store.touch('s1', beat('taba0001', 1, F), T0))).toEqual({ total: 7, calls: { hget: 1, eval: 1, hmget: 1, hlen: 1, hgetall: 1, hset: 1, pexpire: 1 } });
    expect(await cost(() => store.touch('s1', beat('taba0001', 1, F), T0 + 30_000))).toEqual({ total: 3, calls: { eval: 1, hmget: 1, hset: 1 } });
    expect(await cost(() => store.touch('s2', beat('tabq0003', 1, ML), T0 + 30_000))).toEqual({ total: 5, calls: { hget: 1, eval: 1, hmget: 1, hlen: 1, hset: 1 } });
    expect(await cost(() => other.touch('s1', beat('taba0001', 1, F), T0 + 60_000))).toEqual({ total: 4, calls: { hget: 1, eval: 1, hmget: 1, hset: 1 } });
    expect(await cost(() => store.touch('s1', beat('taba0001', 1, F), T0 + 90_000))).toEqual({ total: 5, calls: { eval: 2, hmget: 2, hset: 1 } });
    expect(await cost(() => store.leave('s1', { tab: 'taba0001', at: 5 }, T0 + 91_000))).toEqual({ total: 3, calls: { eval: 1, hmget: 1, hset: 1 } });
    expect(await cost(() => store.counts(T0 + 92_000))).toEqual({ total: 1, calls: { hgetall: 1 } });
    expect(await cost(() => store.counts(T0 + 30_000 + PRESENCE.ttlMs + 1))).toEqual({ total: 4, calls: { hgetall: 2, eval: 1, hdel: 1 } });
    expect(await cost(() => store.held())).toEqual({ total: 1, calls: { hlen: 1 } });
    // A session that is over and comes back is a write like any other (its old record is simply replaced).
    expect(await cost(() => store.touch('s1', beat('taba0001', 9, F), T0 + 540_000))).toEqual({ total: 3, calls: { eval: 1, hmget: 1, hset: 1 } });
    // Ten minutes after the last sweep a write sweeps on its way: one more command, two when something is over.
    expect(await cost(() => store.touch('s1', beat('taba0001', 9, F), T0 + 601_000))).toEqual({ total: 4, calls: { eval: 1, hmget: 1, hgetall: 1, hset: 1 } });
    await store.touch('s3', beat('tabz0009', 1, DB), T0 + 602_000);
    expect(await cost(() => store.touch('s1', beat('taba0001', 9, F), T0 + 6 * 3_600_000 - 30_000))).toEqual({ total: 5, calls: { eval: 1, hmget: 1, hgetall: 1, hdel: 1, hset: 1 } });
    // Six hours after the first write the key's lifetime is renewed.
    expect(await cost(() => store.touch('s1', beat('taba0001', 9, F), T0 + 6 * 3_600_000))).toEqual({ total: 4, calls: { eval: 1, hmget: 1, hset: 1, pexpire: 1 } });
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
