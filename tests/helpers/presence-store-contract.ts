import { describe, expect, it } from 'vitest';
import { PRESENCE } from '@/lib/presence/config';
import type { Heartbeat } from '@/lib/presence/engine';
import type { PresenceLocation } from '@/lib/presence/locations';
import type { PresenceStore } from '@/lib/presence/store';

/*
 * What every presence store must do, whatever it keeps its sessions in: the memory store and the shared (Redis) store
 * run the same tests (tests/presence-engine.test.ts, tests/presence-redis-store.test.ts). The tests only use the
 * store's interface and a clock they pass in; `held` asks a store how many sessions it still holds, where it can say.
 */
export interface StoreUnderTest { store: PresenceStore; held?: () => Promise<number> | number }

const F: PresenceLocation = { region: 'cs', island: 'foundations', course: 'F01' };
const DB: PresenceLocation = { region: 'cs', island: 'databases', course: 'DB01' };
const ML: PresenceLocation = { region: 'ai', island: 'machine-learning', course: null };
const AI: PresenceLocation = { region: 'ai', island: null, course: null };
const beat = (tab: string, since: number, location: PresenceLocation): Heartbeat => ({ tab, since, location });
const T0 = 1_800_000_000_000, TTL = PRESENCE.ttlMs;
const sum = (record: Record<string, number>) => Object.values(record).reduce((a, b) => a + b, 0);

/** A small seeded generator, so a failing order can be run again. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function presenceStoreContract(name: string, make: (maxSessions?: number) => StoreUnderTest) {
  describe(`${name}: one session, one place`, () => {
    it('counts a session once, where its newest tab is, and moves it without a trace', async () => {
      const { store } = make();
      expect(await store.touch('s1', beat('taba0001', 1, F), T0)).toBe('counted');
      expect(await store.touch('s1', beat('tabb0002', 2, ML), T0 + 1_000)).toBe('counted');
      const counts = await store.counts(T0 + 1_000);
      expect(counts.total).toBe(1);
      expect(counts.islands).toEqual({ 'machine-learning': 1 });
      expect(counts.regions).toMatchObject({ cs: 0, ai: 1 });
      expect(counts.courses).toEqual({});
      expect(sum(counts.regions)).toBe(counts.total);
    });

    it('counts a region\'s own visitors in its commons, never on an island', async () => {
      const { store } = make();
      await store.touch('s1', beat('taba0001', 1, AI), T0);
      await store.touch('s2', beat('taba0001', 1, ML), T0);
      const counts = await store.counts(T0);
      expect(counts.regions.ai).toBe(2);
      expect(counts.commons.ai).toBe(1);
      expect(counts.islands).toEqual({ 'machine-learning': 1 });
    });
  });

  describe(`${name}: several tabs and sessions at once`, () => {
    it('keeps one record a session when its tabs report at the same moment', async () => {
      const { store, held } = make();
      await store.touch('s1', beat('taba0001', 1, F), T0);
      const results = await Promise.all(Array.from({ length: 24 }, (_, i) => store.touch('s1', beat(i % 2 ? 'taba0001' : 'tabb0002', 10 + i, i % 2 ? F : DB), T0 + 100 + i)));
      expect(results.every(r => r === 'counted')).toBe(true);
      const counts = await store.counts(T0 + 200);
      expect(counts.total).toBe(1);
      expect(sum(counts.islands)).toBe(1);
      // The newest report (the greatest `since`) is where the session is.
      expect(counts.islands).toEqual({ foundations: 1 });
      if (held) expect(await held()).toBe(1);
    });

    it('never counts a session twice or loses one, whatever order many sessions\' reports land in', async () => {
      for (const seed of [1, 2, 3]) {
        const { store } = make(), random = seeded(seed), places = [F, DB, ML, AI];
        const sessions = Array.from({ length: 40 }, (_, i) => `s${i}`), last = new Map<string, PresenceLocation>();
        await Promise.all(sessions.map(sid => store.touch(sid, beat('taba0001', 1, F), T0)));
        const jobs: Promise<unknown>[] = [];
        for (let round = 0; round < 5; round++) for (const sid of sessions) {
          const place = places[Math.floor(random() * places.length)];
          last.set(sid, place);
          jobs.push(store.touch(sid, beat('taba0001', 10 + round, place), T0 + 1_000 + round));
        }
        await Promise.all(jobs);
        const counts = await store.counts(T0 + 2_000);
        expect(counts.total, `seed ${seed}`).toBe(sessions.length);
        expect(sum(counts.regions)).toBe(sessions.length);
        expect(sum(counts.islands) + sum(counts.commons)).toBe(sessions.length);
        // Each session's rounds were sent in order of `since`: the last one is where it is.
        const expected: Record<string, number> = {};
        for (const place of last.values()) if (place.island) expected[place.island] = (expected[place.island] ?? 0) + 1;
        expect(counts.islands, `seed ${seed}`).toEqual(expected);
      }
    });

    it('takes a session away when its owner leaves while another session arrives, and neither disturbs the other', async () => {
      const { store } = make();
      await store.touch('s1', beat('taba0001', 1, F), T0);
      await Promise.all([store.leave('s1', { tab: 'taba0001', at: 5 }, T0 + 10), store.touch('s2', beat('tabz0009', 1, DB), T0 + 10), store.leave('nobody', 'taba0001', T0 + 10)]);
      expect((await store.counts(T0 + 20)).islands).toEqual({ databases: 1 });
      // A goodbye and the same tab's return, landing together in either order: the return wins (its `since` is later).
      for (const order of [0, 1]) {
        const { store: other } = make();
        await other.touch('s1', beat('taba0001', 1, F), T0);
        const back = () => other.touch('s1', beat('taba0001', 50, F), T0 + 30), bye = () => other.leave('s1', { tab: 'taba0001', at: 40 }, T0 + 30);
        await (order ? Promise.all([back(), bye()]) : Promise.all([bye(), back()]));
        expect((await other.counts(T0 + 40)).total, `order ${order}`).toBe(1);
      }
    });

    it('does not bring a session back for a heartbeat its tab sent before it left', async () => {
      const { store } = make();
      await store.touch('s1', beat('taba0001', 10, F), T0);
      await store.leave('s1', { tab: 'taba0001', at: 30 }, T0 + 1_000);
      // Sent at 25 (before the goodbye), delivered after it.
      await store.touch('s1', beat('taba0001', 20, DB), T0 + 1_100);
      expect((await store.counts(T0 + 1_200)).total).toBe(0);
      // The tab comes back (a later `since`): counted again.
      await store.touch('s1', beat('taba0001', 60, DB), T0 + 2_000);
      expect((await store.counts(T0 + 2_100)).islands).toEqual({ databases: 1 });
    });
  });

  describe(`${name}: expiry and cleanup`, () => {
    it('stops counting a silent session after the timeout, to the millisecond', async () => {
      const { store } = make();
      await store.touch('s1', beat('taba0001', 1, F), T0);
      expect((await store.counts(T0 + TTL)).total).toBe(1);
      expect((await store.counts(T0 + TTL + 1)).total).toBe(0);
    });

    it('does not count an expired session even before it is cleaned up, then lets go of it', async () => {
      const { store, held } = make();
      await store.touch('s1', beat('taba0001', 1, F), T0);
      await store.touch('s2', beat('taba0001', 1, DB), T0 + TTL - 5_000);
      expect((await store.counts(T0 + TTL + 1)).islands).toEqual({ databases: 1 });
      const later = T0 + TTL + 60_000;
      expect((await store.counts(later)).islands).toEqual({ databases: 1 });
      if (held) expect(await held()).toBe(1);
      expect((await store.counts(T0 + 3 * TTL)).total).toBe(0);
      if (held) expect(await held()).toBe(0);
    });

    it('lets a session that left expire like any other: a goodbye keeps nothing alive', async () => {
      const { store, held } = make();
      await store.touch('s1', beat('taba0001', 1, F), T0);
      await store.leave('s1', { tab: 'taba0001', at: 2 }, T0 + TTL - 1_000);
      expect((await store.counts(T0 + TTL - 500)).total).toBe(0);
      // A goodbye is not a sign of life: the session ends TTL after its last heartbeat.
      expect((await store.counts(T0 + TTL + 20_000)).total).toBe(0);
      if (held) expect(await held()).toBe(0);
      // After that the same id starts over, wherever it is now.
      expect(await store.touch('s1', beat('tabc0003', 9, ML), T0 + TTL + 30_000)).toBe('counted');
      expect((await store.counts(T0 + TTL + 30_000)).islands).toEqual({ 'machine-learning': 1 });
    });

    it('lets refused writes keep nothing alive either', async () => {
      const { store } = make();
      for (let i = 0; i < PRESENCE.rateLimit; i++) await store.touch('s1', beat('taba0001', i, F), T0 + i);
      // A flood for the rest of the minute: every write refused, none of them a sign of life.
      for (let t = T0 + 1_000; t < T0 + PRESENCE.rateWindowMs; t += 5_000) expect(await store.touch('s1', beat('taba0001', 999, F), t)).toBe('rate-limited');
      expect((await store.counts(T0 + PRESENCE.rateLimit + TTL + 1)).total).toBe(0);
    });

    it('frees everything once a crowd has gone, and takes new sessions up to its limit again', async () => {
      const { store, held } = make(200);
      for (let i = 0; i < 200; i++) expect(await store.touch(`s${i}`, beat('taba0001', 1, i % 2 ? F : ML), T0 + i)).toBe('counted');
      expect(await store.touch('one-too-many', beat('taba0001', 1, F), T0 + 500)).toBe('full');
      expect((await store.counts(T0 + 1_000)).total).toBe(200);
      // A session already held is never refused for lack of room.
      expect(await store.touch('s7', beat('taba0001', 2, DB), T0 + 1_500)).toBe('counted');
      const after = T0 + TTL + 30_000;
      expect((await store.counts(after)).total).toBe(0);
      if (held) expect(await held()).toBe(0);
      for (let i = 0; i < 200; i++) expect(await store.touch(`n${i}`, beat('taba0001', 1, DB), after + i)).toBe('counted');
      const counts = await store.counts(after + 1_000);
      expect(counts.total).toBe(200);
      expect(counts.islands).toEqual({ databases: 200 });
    });
  });
}

/*
 * P6-A: requests that land in any order, on any server instance. `instances` are stores over one set of sessions
 * (one for the memory store; several over one database for the shared store): each request goes to one of them, all
 * of a round at the same moment, in a shuffled order. What must hold at the end does not depend on that order:
 *
 *   - a session whose tabs have all said goodbye is not counted, whichever request landed last (KNOWN_ISSUES P1-44);
 *   - a session whose newest tab is still there is counted once, at that tab's place;
 *   - a session is one record, never two.
 */
export interface StoresUnderTest { instances: PresenceStore[]; held?: () => Promise<number> | number }

export function presenceOrderingContract(name: string, make: () => StoresUnderTest) {
  const A = 'taba0001', B = 'tabb0002', C = 'tabc0003';
  type Request = { sid: string; tab: string; since?: number; place?: PresenceLocation; at?: number };
  const send = (store: PresenceStore, request: Request, now: number) => request.at === undefined
    ? store.touch(request.sid, beat(request.tab, request.since!, request.place!), now)
    : store.leave(request.sid, { tab: request.tab, at: request.at }, now);
  const shuffled = <T>(list: T[], random: () => number) => { const out = [...list]; for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; };

  describe(`${name}: tabs leaving and reporting in any order (P6-A)`, () => {
    it('keeps a session away when both its tabs left and the other tab\'s heartbeat lands last (P1-44)', async () => {
      const { instances } = make(), at = (i: number) => instances[i % instances.length];
      await at(0).touch('s1', beat(A, 10, F), T0);
      await at(1).touch('s1', beat(B, 20, DB), T0 + 100);
      await at(2).leave('s1', { tab: A, at: 30 }, T0 + 200);
      expect((await at(0).counts(T0 + 250)).islands).toEqual({ databases: 1 });
      await at(1).leave('s1', { tab: B, at: 31 }, T0 + 300);
      // A's heartbeat, sent before both windows were hidden, lands now.
      await at(2).touch('s1', beat(A, 10, F), T0 + 400);
      for (const store of instances) expect((await store.counts(T0 + 500)).total).toBe(0);
      // A comes back for real.
      await at(0).touch('s1', beat(A, 40, ML), T0 + 600);
      expect((await at(1).counts(T0 + 700)).islands).toEqual({ 'machine-learning': 1 });
    });

    it('starts no session for a heartbeat whose goodbye landed first, and lets the remembered goodbye expire', async () => {
      const { instances, held } = make(), [first] = instances, last = instances[instances.length - 1];
      await first.leave('s1', { tab: A, at: 30 }, T0);
      if (held) expect(await held()).toBe(1);
      await last.touch('s1', beat(A, 20, F), T0 + 50);
      expect((await first.counts(T0 + 100)).total).toBe(0);
      // A goodbye with no time (an older page) for a session nobody holds is nothing at all.
      await first.leave('s2', A, T0);
      if (held) expect(await held()).toBe(1);
      // Sent after the goodbye: the visitor is back.
      await last.touch('s1', beat(A, 31, F), T0 + 200);
      expect((await first.counts(T0 + 300)).islands).toEqual({ foundations: 1 });
      // A remembered goodbye nobody follows goes like a session does.
      await first.leave('s3', { tab: B, at: 5 }, T0 + 1_000);
      expect((await last.counts(T0 + 1_000 + TTL + 1)).total).toBe(0);
      await last.counts(T0 + 1_000 + TTL + 20_000);
      if (held) expect(await held()).toBe(0);
    });

    it('ends the same for every order and every instance: all gone is nobody, the newest tab staying is one', async () => {
      for (const seed of [11, 12, 13, 14, 15, 16]) {
        const { instances, held } = make(), random = seeded(seed), requests: Request[] = [], gone: string[] = [], here = new Map<string, PresenceLocation>();
        const places = [F, DB, ML, AI];
        for (let i = 0; i < 60; i++) {
          const sid = `s${seed}-${i}`, last = places[Math.floor(random() * places.length)];
          // Three tabs; B is the one the visitor turned to last. In half of the sessions B leaves too.
          requests.push({ sid, tab: A, since: 10, place: F }, { sid, tab: A, since: 10, place: F }, { sid, tab: C, since: 14, place: ML }, { sid, tab: B, since: 12, place: AI },
            { sid, tab: B, since: 20, place: last }, { sid, tab: B, since: 20, place: last }, { sid, tab: A, at: 30 }, { sid, tab: C, at: 32 });
          if (i % 2) { requests.push({ sid, tab: B, at: 31 }); gone.push(sid); } else here.set(sid, last);
        }
        // Everything at the same moment, in a shuffled order, each request on an instance of its own choosing.
        await Promise.all(shuffled(requests, random).map((request, i) => send(instances[Math.floor(random() * instances.length)], request, T0 + i)));
        const expected: Record<string, number> = {};
        for (const place of here.values()) if (place.island) expected[place.island] = (expected[place.island] ?? 0) + 1;
        for (const store of instances) {
          const counts = await store.counts(T0 + 5_000);
          expect(counts.total, `seed ${seed}`).toBe(here.size);
          expect(counts.islands, `seed ${seed}`).toEqual(expected);
          expect(sum(counts.regions)).toBe(counts.total);
          expect(sum(counts.islands) + sum(counts.commons)).toBe(counts.total);
        }
        // One record a session, the ones nobody is in included (they go at the timeout).
        if (held) expect(await held(), `seed ${seed}`).toBe(60);
        // The late heartbeats of the sessions that are gone land once more, after everything: still nobody.
        await Promise.all(gone.flatMap(sid => [send(instances[0], { sid, tab: A, since: 10, place: F }, T0 + 6_000), send(instances[instances.length - 1], { sid, tab: B, since: 20, place: DB }, T0 + 6_000)]));
        expect((await instances[0].counts(T0 + 7_000)).total, `seed ${seed}`).toBe(here.size);
      }
    });

    it('counts one session once when every instance hears from it at the same moment', async () => {
      const { instances, held } = make();
      // Two requests an instance, all at once: more than a session's tabs ever send together. (A write can lose its
      // turn only to another instance's write of the same session; the shared store tries ten times: redis-store.ts.)
      const results = await Promise.all(Array.from({ length: Math.max(8, instances.length * 2) }, (_, i) => instances[i % instances.length].touch('s1', beat(i % 3 ? A : B, i % 3 ? 10 : 20, i % 3 ? F : DB), T0 + (i * 7) % 13)));
      expect(results.every(result => result === 'counted')).toBe(true);
      for (const store of instances) {
        const counts = await store.counts(T0 + 100);
        expect(counts.total).toBe(1);
        expect(counts.islands).toEqual({ databases: 1 });
      }
      if (held) expect(await held()).toBe(1);
    });

    it('does not let a request handled late take a session\'s last sign of life back', async () => {
      const { instances } = make(), [first] = instances, last = instances[instances.length - 1];
      await first.touch('s1', beat(A, 10, F), T0);
      await first.touch('s1', beat(A, 10, F), T0 + 60_000);
      // Handled by an instance whose clock is a minute behind: the session must not expire a minute early for it.
      await last.touch('s1', beat(A, 10, F), T0 + 1_000);
      expect((await first.counts(T0 + 60_000 + TTL)).total).toBe(1);
      expect((await last.counts(T0 + 60_000 + TTL + 1)).total).toBe(0);
    });
  });
}
