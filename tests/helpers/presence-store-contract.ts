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
