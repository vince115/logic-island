import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PRESENCE } from '@/lib/presence/config';
import type { Heartbeat } from '@/lib/presence/engine';
import type { PresenceLocation } from '@/lib/presence/locations';
import { RedisPresenceStore, SWEEP_SCRIPT, WRITE_SCRIPT, decodePulse, decodeRecord, encodePulse, encodeRecord, sharedStoreConfig, upstashRest, type RedisLike } from '@/lib/presence/redis-store';
import { handlePresenceGet, handlePresencePost } from '@/lib/presence/service';
import { MemoryPresenceStore, presenceStore, sharedStorePrefix } from '@/lib/presence/store';
import { FakeRedis } from './helpers/fake-redis';
import { presenceLifetimeContract, presenceOrderingContract, presenceStoreContract } from './helpers/presence-store-contract';
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

presenceLifetimeContract('the shared store (stand-in Redis, one instance)', () => {
  const store = new RedisPresenceStore(new FakeRedis(), { prefix: prefix() });
  return { instances: [store], held: () => store.held() };
});
presenceLifetimeContract('the shared store (stand-in Redis, three instances)', () => {
  const redis = new FakeRedis(), name = prefix(), instances = [0, 1, 2].map(() => new RedisPresenceStore(redis, { prefix: name }));
  return { instances, held: () => instances[0].held() };
});
// What the store did before P7 (every report rewrites its record) still gives the same counts.
presenceLifetimeContract('the shared store (stand-in Redis, three instances, no pulses)', () => {
  const redis = new FakeRedis(), name = prefix(), instances = [0, 1, 2].map(() => new RedisPresenceStore(redis, { prefix: name, pulses: false }));
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
   * P6-C, P7. The bill is Upstash's: a plain command is one, a script is one plus one for every command it runs
   * (https://upstash.com/docs/redis/overall/billing). The stand-in counts the same way; the real Redis's own command
   * statistics are held against the same numbers further down. A report a minute, as a tracker sends them.
   */
  const MIN = 60_000;
  const billing = (redis: FakeRedis) => async (run: () => Promise<unknown>) => { const before = redis.billed; await run(); return redis.billed - before; };

  it('bills one command for a report that says nothing new, three for one that changes the record, one more to an instance that has to ask', async () => {
    const redis = new FakeRedis(false), name = prefix(), cost = billing(redis);
    const a = new RedisPresenceStore(redis, { prefix: name }), b = new RedisPresenceStore(redis, { prefix: name });
    // The very first write of a database: HMGET (nobody remembers the session), then EVAL + HMGET + HLEN + HSET, the
    // first sweep (HGETALL, nothing to remove) and the key's lifetime (PEXPIRE).
    expect(await cost(() => a.touch('s1', beat('taba0001', 1, F), T0))).toBe(7);
    // The steady state: the same report again, a pulse. One HSET.
    expect(await cost(() => a.touch('s1', beat('taba0001', 1, F), T0 + MIN))).toBe(1);
    expect(await cost(() => a.touch('s1', beat('taba0001', 1, F), T0 + 2 * MIN))).toBe(1);
    // Another instance has to ask first (HMGET); what it finds is the record and the pulse, and its own is a pulse too.
    expect(await cost(() => b.touch('s1', beat('taba0001', 1, F), T0 + 3 * MIN))).toBe(2);
    expect(await cost(() => b.touch('s1', beat('taba0001', 1, F), T0 + 4 * MIN))).toBe(1);
    // Then the first one's memory is out of date (to it, the session was last heard from three minutes ago and is
    // over): its record write loses an attempt (EVAL + HMGET), and what it is handed back makes it a pulse after all.
    expect(await cost(() => a.touch('s1', beat('taba0001', 1, F), T0 + 5 * MIN))).toBe(3);
    // Having seen that others write its sessions, it looks before it trusts its memory for a pulse: HMGET + HSET.
    expect(await cost(() => a.touch('s1', beat('taba0001', 1, F), T0 + 6 * MIN))).toBe(2);
    // The visitor moves to another page: the record changes. EVAL + HMGET + HSET (which also empties the pulse).
    expect(await cost(() => a.touch('s1', beat('taba0001', 2, DB), T0 + 6 * MIN + 20_000))).toBe(3);
    expect(redis.hashes.get(`${name}:sessions`)!.get('+s1')).toBe('');
    // A second session on a warm instance: HMGET, then EVAL + HMGET + HLEN + HSET.
    expect(await cost(() => a.touch('s2', beat('tabq0003', 1, ML), T0 + 6 * MIN + 20_500))).toBe(5);
    // A goodbye is a record write like any other.
    expect(await cost(() => a.leave('s1', { tab: 'taba0001', at: 5 }, T0 + 6 * MIN + 21_000))).toBe(3);
    // A count is one command; with sessions that are over, the sweep on top (EVAL + HGETALL + HDEL).
    expect(await cost(() => a.counts(T0 + 6 * MIN + 22_000))).toBe(1);
    expect(await cost(() => a.counts(T0 + 6 * MIN + 20_500 + PRESENCE.ttlMs + 1))).toBe(4);
    expect(await cost(() => a.counts(T0 + 6 * MIN + 20_500 + PRESENCE.ttlMs + 2))).toBe(1);
    expect(await a.held()).toBe(0);
    expect([...redis.hashes.get(`${name}:sessions`)!.keys()].sort()).toEqual(['~renewed', '~swept']);
    expect(redis.calls.every(call => call.script ? [WRITE_SCRIPT, SWEEP_SCRIPT].includes(call.script) : ['HMGET', 'HSET', 'HGETALL'].includes(call.command!))).toBe(true);
  });

  it('trusts its memory for a pulse again once nothing has contradicted it for a while', async () => {
    const redis = new FakeRedis(false), name = prefix(), cost = billing(redis);
    const a = new RedisPresenceStore(redis, { prefix: name }), b = new RedisPresenceStore(redis, { prefix: name });
    await a.touch('s1', beat('taba0001', 1, F), T0);
    await b.touch('s1', beat('taba0001', 1, F), T0 + MIN);
    // To `a` the session is over (three minutes since it heard from it): a record write, which meets b's pulse where
    // `a` remembered none (EVAL + HMGET), and what it is handed back makes it a pulse (HSET).
    expect(await cost(() => a.touch('s1', beat('taba0001', 1, F), T0 + 3 * MIN))).toBe(3);
    const costs: number[] = [];
    for (let i = 4; i < 20; i++) costs.push(await cost(() => a.touch('s1', beat('taba0001', 1, F), T0 + i * MIN)));
    // It looks first (HMGET + HSET) six times and finds its memory right every time; the seventh right answer is the
    // record's own rewrite at ten minutes (EVAL + HMGET + HSET, and that write's sweep: HGETALL). Then it stops looking.
    expect(costs).toEqual([2, 2, 2, 2, 2, 2, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it('writes a session\'s record again every ten minutes, and takes what the pulses said into it', async () => {
    const redis = new FakeRedis(false), name = prefix(), cost = billing(redis), store = new RedisPresenceStore(redis, { prefix: name });
    const stored = () => decodeRecord(redis.hashes.get(`${name}:sessions`)!.get('s1'))!;
    await store.touch('s1', beat('taba0001', 1, F), T0);
    for (let i = 1; i < 10; i++) expect(await cost(() => store.touch('s1', beat('taba0001', 1, F), T0 + i * MIN))).toBe(1);
    // Nine pulses on, the record is as it was written; the session's last sign of life is the pulse.
    expect(stored()).toMatchObject({ seen: T0, written: T0, writes: 1 });
    expect(decodePulse(redis.hashes.get(`${name}:sessions`)!.get('+s1'))).toEqual({ tab: 'taba0001', since: 1, location: F, at: T0 + 9 * MIN, windowStart: T0 + 9 * MIN, writes: 1 });
    // The tenth report rewrites the record (EVAL + HMGET + HSET) with a sweep on its way (HGETALL: ten minutes since the last).
    expect(await cost(() => store.touch('s1', beat('taba0001', 1, F), T0 + 10 * MIN))).toBe(4);
    expect(stored()).toMatchObject({ seen: T0 + 10 * MIN, ownerSeen: T0 + 10 * MIN, written: T0 + 10 * MIN, tab: 'taba0001', since: 1, away: false });
    expect(redis.hashes.get(`${name}:sessions`)!.get('+s1')).toBe('');
    for (let i = 11; i < 20; i++) expect(await cost(() => store.touch('s1', beat('taba0001', 1, F), T0 + i * MIN))).toBe(1);
    expect(await cost(() => store.touch('s1', beat('taba0001', 1, F), T0 + 20 * MIN))).toBe(4);
    // The same report sooner than a tracker sends it is no pulse: it is written the long way and counted.
    expect(await cost(() => store.touch('s1', beat('taba0001', 1, F), T0 + 20 * MIN + PRESENCE.pulseAfterMs - 1))).toBe(3);
    expect(stored().writes).toBe(2);
    expect(await cost(() => store.touch('s1', beat('taba0001', 1, F), T0 + 20 * MIN + 2 * PRESENCE.pulseAfterMs - 1))).toBe(1);
  });

  it('sweeps with the first record write every ten minutes, whichever instance makes it, and removes what is over', async () => {
    const redis = new FakeRedis(false), name = prefix(), cost = billing(redis), store = new RedisPresenceStore(redis, { prefix: name });
    await store.touch('stays', beat('taba0001', 1, F), T0);
    await store.touch('goes', beat('taba0001', 1, DB), T0);
    await store.touch('goes', beat('taba0001', 1, DB), T0 + MIN);
    for (let i = 1; i < 10; i++) expect(await cost(() => store.touch('stays', beat('taba0001', 1, F), T0 + i * MIN))).toBe(1);
    // Nobody asked for a count in ten minutes, so the session that went is still held, record and pulse; the next
    // record write removes both: EVAL + HMGET + HSET, and HGETALL + HDEL. A brand-new instance does it just the same
    // (HMGET first).
    expect(await store.held()).toBe(2);
    expect([...redis.hashes.get(`${name}:sessions`)!.keys()].sort()).toEqual(['+goes', '+stays', 'goes', 'stays', '~renewed', '~swept']);
    expect(await cost(() => new RedisPresenceStore(redis, { prefix: name }).touch('stays', beat('taba0001', 1, F), T0 + 10 * MIN))).toBe(6);
    expect(await store.held()).toBe(1);
    expect([...redis.hashes.get(`${name}:sessions`)!.keys()].sort()).toEqual(['+stays', 'stays', '~renewed', '~swept']);
    // And not again before another ten minutes, by any instance.
    for (let i = 11; i < 20; i++) expect(await cost(() => new RedisPresenceStore(redis, { prefix: name }).touch('stays', beat('taba0001', 1, F), T0 + i * MIN))).toBe(2);
    // Ten minutes after the last sweep, with nothing over: one command more (HGETALL) on the record's own rewrite.
    expect(await cost(() => new RedisPresenceStore(redis, { prefix: name }).touch('stays', beat('taba0001', 1, F), T0 + 20 * MIN))).toBe(5);
  });

  it('counts by the pulse, not by the age of the record, and never lets a pulse undo what the record says', async () => {
    const redis = new FakeRedis(false), name = prefix(), a = new RedisPresenceStore(redis, { prefix: name }), b = new RedisPresenceStore(redis, { prefix: name });
    const fields = redis.hashes.get(`${name}:sessions`) ?? redis.hashes.set(`${name}:sessions`, new Map()).get(`${name}:sessions`)!;
    await a.touch('s1', beat('taba0001', 1, F), T0);
    for (let i = 1; i <= 9; i++) await a.touch('s1', beat('taba0001', 1, F), T0 + i * MIN);
    // The record is nine minutes old; the visitor was heard from just now.
    expect(decodeRecord(fields.get('s1'))!.seen).toBe(T0);
    expect((await b.counts(T0 + 9 * MIN + PRESENCE.ttlMs)).total).toBe(1);
    expect((await b.counts(T0 + 9 * MIN + PRESENCE.ttlMs + 1)).total).toBe(0);
    // (That count swept the session, record and pulse.) Start again; this time the tab leaves on another instance.
    expect([...fields.keys()].sort()).toEqual(['~renewed', '~swept']);
    // Two instances that have had no sign of each other yet.
    const T1 = T0 + 30 * MIN, c = new RedisPresenceStore(redis, { prefix: name }), d = new RedisPresenceStore(redis, { prefix: name });
    await c.touch('s1', beat('taba0001', 1, F), T1);
    await c.touch('s1', beat('taba0001', 1, F), T1 + MIN);
    await d.leave('s1', { tab: 'taba0001', at: 50 }, T1 + MIN + 30_000);
    expect((await c.counts(T1 + MIN + 30_001)).total).toBe(0);
    // `c` has not heard of the goodbye. A report the tab sent before it left lands on `c`, which takes it for the
    // same report as ever and writes a pulse from memory: one HSET, nothing compared.
    const before = redis.billed;
    await c.touch('s1', beat('taba0001', 1, F), T1 + MIN + 45_000);
    expect(redis.billed - before).toBe(1);
    expect(decodePulse(fields.get('+s1'))!.at).toBe(T1 + MIN + 45_000);
    // The pulse is there, later than the record; the record says the tab left after that report was sent. Nobody.
    for (const store of [a, b, c, d]) expect((await store.counts(T1 + MIN + 46_000)).total).toBe(0);
    expect(decodeRecord(fields.get('s1'))).toMatchObject({ away: true, left: { taba0001: 50 } });
    // The tab comes back for real (a later `since`): a record write, which finds the goodbye it had not heard of.
    await c.touch('s1', beat('taba0001', 60, DB), T1 + 2 * MIN);
    for (const store of [a, b, c, d]) expect((await store.counts(T1 + 2 * MIN + 1)).islands).toEqual({ databases: 1 });
    // A pulse of a session that has no record is nobody, and is cleared away once it is old.
    fields.set('+ghost', `${T1 + 2 * MIN}:${JSON.stringify({ tab: 'tabz0009', since: 1, location: ML, at: T1 + 2 * MIN, windowStart: T1, writes: 1 })}`);
    expect((await b.counts(T1 + 2 * MIN + 2)).total).toBe(1);
    expect(fields.has('+ghost')).toBe(true);
    await b.touch('s1', beat('taba0001', 60, DB), T1 + 4 * MIN);
    await b.counts(T1 + 2 * MIN + PRESENCE.ttlMs + 1);
    expect(fields.has('+ghost')).toBe(false);
    expect(await b.held()).toBe(1);
  });

  it('can be told to keep no pulses: every report then rewrites its record, as before P7', async () => {
    const redis = new FakeRedis(false), name = prefix(), cost = billing(redis), store = new RedisPresenceStore(redis, { prefix: name, pulses: false });
    await store.touch('s1', beat('taba0001', 1, F), T0);
    for (let i = 1; i < 10; i++) expect(await cost(() => store.touch('s1', beat('taba0001', 1, F), T0 + i * MIN))).toBe(3);
    expect([...redis.hashes.get(`${name}:sessions`)!.keys()].sort()).toEqual(['s1', '~renewed', '~swept']);
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
    expect(Object.keys(decodeRecord(stored)!).sort()).toEqual(['away', 'location', 'ownerSeen', 'seen', 'since', 'tab', 'windowStart', 'writes', 'written']);
    // A pulse holds the same kinds of things and no more: the tab's random label, its times, the place, the rate window.
    await store.touch('sid-1', beat('taba0001', 123, F), T0 + 60_000);
    const pulse = redis.hashes.get(`${name}:sessions`)!.get('+sid-1')!;
    expect(pulse.startsWith(`${T0 + 60_000}:{`)).toBe(true);
    expect(Object.keys(decodePulse(pulse)!).sort()).toEqual(['at', 'location', 'since', 'tab', 'windowStart', 'writes']);
    expect(encodePulse(decodePulse(pulse)!)).toBe(pulse);
    expect([...redis.hashes.get(`${name}:sessions`)!.keys()].sort()).toEqual(['+sid-1', 'sid-1', '~renewed', '~swept']);
    // After goodbyes it also remembers when which tab left: a tab's random label and a time, nothing more.
    await store.leave('sid-1', { tab: 'taba0001', at: 200 }, T0 + 60_001);
    const after = decodeRecord(redis.hashes.get(`${name}:sessions`)!.get('sid-1'))!;
    expect(Object.keys(after).sort()).toEqual(['away', 'left', 'location', 'ownerSeen', 'seen', 'since', 'tab', 'windowStart', 'writes', 'written']);
    // The goodbye's record took the pulse in (the session was last heard from at the pulse's time) and emptied it.
    expect(after.seen).toBe(T0 + 60_000);
    expect(redis.hashes.get(`${name}:sessions`)!.get('+sid-1')).toBe('');
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
    const moving: RedisLike = { command: async () => [null, null],
      eval: async () => ['conflict', encodeRecord({ location: F, seen: T0 + Math.random(), tab: 'taba0001', since: 1, ownerSeen: T0, away: false, windowStart: T0, writes: 1 }), ''] };
    await expect(new RedisPresenceStore(moving, { prefix: prefix() }).touch('s1', beat('taba0001', 1, F), T0)).rejects.toThrow('changed under every attempt');
    for (const reply of [null, 'OK', [], [1]]) {
      const odd: RedisLike = { command: async () => [null, null], eval: async () => reply };
      await expect(new RedisPresenceStore(odd, { prefix: prefix() }).touch('s1', beat('taba0001', 1, F), T0)).rejects.toThrow('unexpected reply to a write');
    }
    await expect(new RedisPresenceStore({ command: async () => null, eval: async () => ['ok'] }, { prefix: prefix() }).touch('s1', beat('taba0001', 1, F), T0)).rejects.toThrow('unexpected reply to a read');
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

  it('gives up on a store that does not answer in time, and the API says 503 without waiting or naming anything (P7)', async () => {
    // A store that never answers: the request ends when its signal says so, as a real fetch does.
    let waiting = 0;
    const silent = ((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      waiting += 1;
      init!.signal!.addEventListener('abort', () => reject(new DOMException('The operation timed out at https://example-db.upstash.io with TOKEN-VALUE', 'TimeoutError')));
    })) as typeof fetch;
    const redis = upstashRest('https://example-db.upstash.io', 'TOKEN-VALUE', silent, 40);
    const started = Date.now(), error = await redis.command('HGETALL', 'k').then(() => null, e => e as Error);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(error!.message).toBe('presence store: the shared store did not answer');
    // The same for a store that cannot be reached at all.
    const down = upstashRest('https://example-db.upstash.io', 'TOKEN-VALUE', (async () => { throw new TypeError('fetch failed: connect ECONNREFUSED example-db.upstash.io:443'); }) as typeof fetch);
    expect((await down.eval('return 1', [], []).then(() => null, e => e as Error))!.message).toBe('presence store: the shared store did not answer');

    // Through the API: a heartbeat and a count both answer 503 `unavailable`, with a time to come back, no cookie
    // and nothing of the store's address; the visitor's page is told nothing else and goes on.
    vi.stubEnv('LOGIC_ISLAND_PRESENCE', '1');
    const { mintToken } = await import('@/lib/presence/session');
    const secret = 'test-secret-test-secret-test-secret-1234', now = T0 + 10_000, { token } = mintToken(secret, T0);
    for (const store of [new RedisPresenceStore(redis, { prefix: prefix() }), new RedisPresenceStore(down, { prefix: prefix() })]) {
      const deps = { store, now: () => now, secret };
      const post = await handlePresencePost(new Request('https://logic-island.test/api/presence', { method: 'POST', headers: { origin: 'https://logic-island.test', host: 'logic-island.test', cookie: `li_presence=${token}` },
        body: JSON.stringify({ v: 1, tab: 'aaaaaaaa00000001', since: now, place: { t: 'hub' } }) }), deps);
      const bye = await handlePresencePost(new Request('https://logic-island.test/api/presence', { method: 'POST', headers: { origin: 'https://logic-island.test', host: 'logic-island.test', cookie: `li_presence=${token}` },
        body: JSON.stringify({ v: 1, tab: 'aaaaaaaa00000001', leave: true, at: now }) }), deps);
      const get = await handlePresenceGet(new Request('https://logic-island.test/api/presence'), deps);
      for (const response of [post, bye, get]) {
        expect(response.status).toBe(503);
        const text = await response.text();
        expect(JSON.parse(text)).toEqual({ ok: false, error: 'unavailable' });
        expect(text).not.toMatch(/upstash|TOKEN/);
        expect(response.headers.get('retry-after')).toBe(String(PRESENCE.retryMs / 1000));
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(response.headers.get('set-cookie')).toBeNull();
      }
    }
    expect(waiting).toBeGreaterThan(3);
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
  presenceLifetimeContract('real Redis, one instance', () => {
    const store = new RedisPresenceStore(client, { prefix: name() });
    return { instances: [store], held: () => store.held() };
  });
  presenceLifetimeContract('real Redis, four instances on four connections', () => {
    const p = name(), connections: Promise<RespClient>[] = [];
    const connection = (i: number) => connections[i] ??= opened();
    const instances = [0, 1, 2, 3].map(i => new RedisPresenceStore({ eval: async (script, keys, args) => (await connection(i)).eval(script, keys, args), command: async (...parts) => (await connection(i)).command(...parts) }, { prefix: p }));
    return { instances, held: () => instances[0].held() };
  });

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
    const write = (sid: string, expected: string, next: string, { max = 2, cutoff = 0, now = 1_000, ttl = 60_000, every = 600_000, pulse = '' } = {}) =>
      client.eval(WRITE_SCRIPT, [key], [sid, expected, next, String(max), String(cutoff), String(ttl), String(now), String(every), pulse]);
    const sessions = async () => { const all = await client.command('HGETALL', key) as string[], out: Record<string, string> = {}; for (let i = 0; i < all.length; i += 2) out[all[i]] = all[i + 1]; return out; };
    const meta = (swept: number, renewed: number) => ({ '~swept': String(swept), '~renewed': String(renewed) });
    expect(await write('a', '', '100:A1')).toEqual(['ok']);
    // The first write swept (nothing) and gave the key its lifetime; the hash remembers both. No pulse, so none is made.
    expect(await sessions()).toEqual({ a: '100:A1', ...meta(1000, 1000) });
    expect(await write('a', '', '110:A2')).toEqual(['conflict', '100:A1', '']);
    expect(await write('a', '100:A1', '110:A2')).toEqual(['ok']);
    expect(await write('b', '', '120:B1')).toEqual(['ok']);
    // Full: a third session is refused, a held one is not.
    expect(await write('c', '', '130:C1')).toEqual(['full']);
    expect(await write('a', '110:A2', '140:A3')).toEqual(['ok']);
    // A pulse beside the record (one plain HSET, as the store writes it). A record write that does not know of it is
    // told; one that does takes it in and empties it.
    await client.command('HSET', key, '+a', '150:P1');
    expect(await write('a', '140:A3', '160:A4')).toEqual(['conflict', '140:A3', '150:P1']);
    expect(await write('a', '140:A3', '160:A4', { pulse: '150:P0' })).toEqual(['conflict', '140:A3', '150:P1']);
    expect(await write('a', '140:A3', '160:A4', { pulse: '150:P1' })).toEqual(['ok']);
    expect(await sessions()).toEqual({ a: '160:A4', '+a': '', b: '120:B1', ...meta(1000, 1000) });
    // The limit is of sessions, not of the hash's fields: still full with a pulse in it, and room again once a
    // session is over.
    expect(await write('c', '', '130:C1')).toEqual(['full']);
    expect(await write('c', '', '500:C1', { cutoff: 130 })).toEqual(['ok']);
    expect(await sessions()).toEqual({ a: '160:A4', '+a': '', c: '500:C1', ...meta(1000, 1000) });
    // Ten minutes on, a record write sweeps on its way, and notes that it did. A session is as young as its pulse:
    // `a` (record at 160, pulse at 700) stays; `d` goes with its pulse; so do a value that is no record and an old
    // pulse of no session. A recent pulse of no session is left for its time.
    await client.command('HSET', key, '+a', '700:P2', 'junk', 'no time at all', 'd', '10:D1', '+d', '20:PD', '+ghost', '30:PG', '+fresh', '900:PF');
    expect(await write('c', '500:C1', '650:C2', { cutoff: 600, now: 601_000, max: 9 })).toEqual(['ok']);
    expect(await sessions()).toEqual({ a: '160:A4', '+a': '700:P2', c: '650:C2', '+fresh': '900:PF', ...meta(601_000, 601_000) });
    // The sweep on its own removes the same, says how many fields, and leaves the hash's own fields alone.
    await client.command('HSET', key, 'e', '10:E1', 'junk', 'again');
    expect(await client.eval(SWEEP_SCRIPT, [key], ['600'])).toBe(2);
    expect(await client.eval(SWEEP_SCRIPT, [key], ['600'])).toBe(0);
    expect(await client.eval(SWEEP_SCRIPT, [key], ['800'])).toBe(3);
    expect(await sessions()).toEqual({ '+fresh': '900:PF', ...meta(601_000, 601_000) });
    expect(await client.eval(SWEEP_SCRIPT, [key], ['901'])).toBe(1);
    expect(await sessions()).toEqual(meta(601_000, 601_000));
    // The key carries the lifetime a write gave it; a quarter of it later a write renews it, not before.
    expect(await write('c', '', '600:C2', { now: 601_500, max: 9 })).toEqual(['ok']);
    const ttl = Number(await client.command('PTTL', key));
    expect(ttl).toBeGreaterThan(0); expect(ttl).toBeLessThanOrEqual(60_000);
    await client.command('PEXPIRE', key, 5_000_000);
    expect(await write('c', '600:C2', '700:C3', { now: 615_999, max: 9 })).toEqual(['ok']);
    expect(Number(await client.command('PTTL', key))).toBeGreaterThan(60_000);
    expect(await write('c', '700:C3', '800:C4', { now: 616_000, max: 9 })).toEqual(['ok']);
    expect(Number(await client.command('PTTL', key))).toBeLessThanOrEqual(60_000);
    expect(await sessions()).toEqual({ c: '800:C4', ...meta(601_000, 616_000) });
    // A clock that went back sweeps and renews rather than waiting for the old time to come round again.
    expect(await write('c', '800:C4', '900:C5', { now: 5, max: 9 })).toEqual(['ok']);
    expect(await sessions()).toEqual({ c: '900:C5', ...meta(5, 5) });
  });

  it('runs as many commands as the bill says: the server\'s own statistics against Upstash\'s rule, and against the stand-in', async () => {
    // On a connection of its own, with nothing else running: the statistics are the whole server's.
    const stats = await opened(), p = name(), store = new RedisPresenceStore(stats, { prefix: p }), other = new RedisPresenceStore(stats, { prefix: p });
    // The same calls on the stand-in, whose bill must be the same at every step.
    const fake = new FakeRedis(false), twin = new RedisPresenceStore(fake, { prefix: p }), otherTwin = new RedisPresenceStore(fake, { prefix: p });
    const BILLED = ['eval', 'hget', 'hmget', 'hset', 'hlen', 'hgetall', 'hdel', 'pexpire'], MIN = 60_000;
    const cost = async (run: (s: RedisPresenceStore, o: RedisPresenceStore) => Promise<unknown>) => {
      await stats.command('CONFIG', 'RESETSTAT');
      await run(store, other);
      const info = String(await stats.command('INFO', 'commandstats')), calls: Record<string, number> = {};
      for (const [, command, count] of info.matchAll(/cmdstat_([a-z|]+):calls=(\d+)/g)) if (BILLED.includes(command)) calls[command] = Number(count);
      const total = Object.values(calls).reduce((a, b) => a + b, 0), before = fake.billed;
      await run(twin, otherTwin);
      expect(fake.billed - before, 'the stand-in bills what the server ran').toBe(total);
      return { total, calls };
    };
    expect(await cost(s => s.touch('s1', beat('taba0001', 1, F), T0))).toEqual({ total: 7, calls: { hmget: 2, eval: 1, hlen: 1, hgetall: 1, hset: 1, pexpire: 1 } });
    // The same report a minute later: a pulse, one plain command.
    expect(await cost(s => s.touch('s1', beat('taba0001', 1, F), T0 + MIN))).toEqual({ total: 1, calls: { hset: 1 } });
    expect(await cost(s => s.touch('s2', beat('tabq0003', 1, ML), T0 + MIN))).toEqual({ total: 5, calls: { hmget: 2, eval: 1, hlen: 1, hset: 1 } });
    expect(await cost(s => s.counts(T0 + MIN + 1_000))).toEqual({ total: 1, calls: { hgetall: 1 } });
    // Another instance asks, then writes its own pulse.
    expect(await cost((_, o) => o.touch('s1', beat('taba0001', 1, F), T0 + 2 * MIN))).toEqual({ total: 2, calls: { hmget: 1, hset: 1 } });
    // The first one's memory is out of date: a lost attempt at the record, then a pulse; and it looks first next time.
    expect(await cost(s => s.touch('s1', beat('taba0001', 1, F), T0 + 4 * MIN))).toEqual({ total: 3, calls: { eval: 1, hmget: 1, hset: 1 } });
    expect(await cost(s => s.touch('s1', beat('taba0001', 1, F), T0 + 5 * MIN))).toEqual({ total: 2, calls: { hmget: 1, hset: 1 } });
    // Another page, and a goodbye: record writes.
    expect(await cost(s => s.touch('s1', beat('taba0001', 9, DB), T0 + 5 * MIN + 20_000))).toEqual({ total: 3, calls: { eval: 1, hmget: 1, hset: 1 } });
    expect(await cost(s => s.leave('s1', { tab: 'taba0001', at: 50 }, T0 + 5 * MIN + 21_000))).toEqual({ total: 3, calls: { eval: 1, hmget: 1, hset: 1 } });
    // A count that meets sessions that are over sweeps them: both sessions, s1's emptied pulse with it.
    expect(await cost(s => s.counts(T0 + 5 * MIN + 20_000 + PRESENCE.ttlMs + 1))).toEqual({ total: 4, calls: { hgetall: 2, eval: 1, hdel: 1 } });
    expect(await cost(s => s.held())).toEqual({ total: 1, calls: { hgetall: 1 } });
    expect(await store.held()).toBe(0);
    // A session that is over and comes back: its record is gone, which this instance finds out (a lost attempt), and
    // the new one is a first record; ten minutes after the last sweep, that write sweeps on its way.
    expect(await cost(s => s.touch('s1', beat('taba0001', 99, F), T0 + 20 * MIN))).toEqual({ total: 7, calls: { eval: 2, hmget: 2, hlen: 1, hgetall: 1, hset: 1 } });
    // Six hours after the first write the key's lifetime is renewed, on a record write (here: the visitor is back
    // after hours; the write's sweep removes the old record on its way, HGETALL + HDEL, before the new one is set).
    expect(await cost(s => s.touch('s1', beat('taba0001', 100, DB), T0 + 6 * 3_600_000))).toEqual({ total: 6, calls: { eval: 1, hmget: 1, hgetall: 1, hdel: 1, hset: 1, pexpire: 1 } });
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
