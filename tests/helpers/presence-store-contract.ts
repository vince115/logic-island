import { describe, expect, it } from 'vitest';
import { PRESENCE } from '@/lib/presence/config';
import type { Heartbeat } from '@/lib/presence/engine';
import type { PresenceLocation } from '@/lib/presence/locations';
import { MemoryPresenceStore, type PresenceStore } from '@/lib/presence/store';

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

/*
 * P7: minutes, not milliseconds. The tests above send their requests within a second; a visitor's tab reports once a
 * minute for as long as the page is open, and almost all of those reports say nothing new. The shared store keeps
 * such a report as a pulse beside the session's record instead of rewriting the record (redis-store.ts); the memory
 * store rewrites the record every time. Whatever a store does with them, its counts must be the ones the engine's
 * rules give, at every moment, on every instance:
 *
 *   - a visitor who stays is counted for as long as they report and for the timeout after their last report;
 *   - a tab in the background is not counted, and is counted again the moment it is back;
 *   - a visitor who vanishes without a goodbye is counted until the timeout, to the millisecond, then let go of;
 *   - a session whose tabs have all left is not counted, whichever request lands last and however much later
 *     (KNOWN_ISSUES P1-44), also when the late one is a report that "says nothing new" on an instance that did not
 *     see the goodbye.
 *
 * `reference` in the last tests is the memory store given the same requests at the same times.
 */
export function presenceLifetimeContract(name: string, make: () => StoresUnderTest) {
  const A = 'taba0001', B = 'tabb0002', MIN = 60_000, BEAT = PRESENCE.heartbeatMs;

  describe(`${name}: a visitor over minutes (P7)`, () => {
    it('counts a visitor who only stays, on every instance, for as long as they report and the timeout after', async () => {
      const { instances, held } = make();
      let last = T0;
      for (let i = 0; i <= 45; i++) {
        last = T0 + i * BEAT;
        expect(await instances[i % instances.length].touch('s1', beat(A, 10, F), last)).toBe('counted');
        // Asked half a report later, on another instance.
        const counts = await instances[(i + 1) % instances.length].counts(last + BEAT / 2);
        expect(counts.total, `minute ${i}`).toBe(1);
        expect(counts.islands).toEqual({ foundations: 1 });
      }
      if (held) expect(await held()).toBe(1);
      for (const store of instances) expect((await store.counts(last + TTL)).total).toBe(1);
      for (const store of instances) expect((await store.counts(last + TTL + 1)).total).toBe(0);
      await instances[0].counts(last + TTL + 30_000);
      if (held) expect(await held()).toBe(0);
    });

    it('counts a visitor who vanishes until the timeout after their last report, then lets go of everything', async () => {
      const { instances, held } = make(), [first] = instances, other = instances[instances.length - 1];
      for (let i = 0; i < 7; i++) await first.touch('s1', beat(A, 10, DB), T0 + i * BEAT);
      // One report is lost on the way; the next comes a minute late. Never a gap in the count.
      const late = T0 + 8 * BEAT;
      expect((await other.counts(late - 1)).total).toBe(1);
      await other.touch('s1', beat(A, 10, DB), late);
      // Then nothing, and no goodbye (a crash, a lost connection).
      expect((await first.counts(late + TTL)).islands).toEqual({ databases: 1 });
      expect((await first.counts(late + TTL + 1)).total).toBe(0);
      expect((await other.counts(late + TTL + 1)).total).toBe(0);
      await other.counts(late + TTL + 20_000);
      if (held) expect(await held()).toBe(0);
      // The same visitor, back an hour later: a session like any new one.
      expect(await first.touch('s1', beat(A, 10, DB), late + 60 * MIN)).toBe('counted');
      expect((await other.counts(late + 60 * MIN + 1)).total).toBe(1);
    });

    it('does not count a tab in the background, however long, and counts it again the moment it is back', async () => {
      const { instances } = make(), at = (i: number) => instances[i % instances.length];
      for (let i = 0; i < 4; i++) await at(i).touch('s1', beat(A, 10, F), T0 + i * BEAT);
      const hidden = T0 + 3 * BEAT + 20_000;
      await at(1).leave('s1', { tab: A, at: 5_000 }, hidden);
      for (const store of instances) expect((await store.counts(hidden + 1)).total).toBe(0);
      // A report the tab sent just before it was hidden lands after the goodbye, on an instance that still thinks the
      // tab is there: nothing comes back.
      for (const [i, store] of instances.entries()) await store.touch('s1', beat(A, 10, F), hidden + 1_000 + i * 20_000);
      for (const store of instances) expect((await store.counts(hidden + 70_000)).total).toBe(0);
      // Ten minutes in the background: the session is long over. The tab comes to the front (a later `since`).
      const back = hidden + 10 * MIN;
      expect(await at(2).touch('s1', beat(A, 6_000, F), back)).toBe('counted');
      for (const store of instances) expect((await store.counts(back + 1)).islands).toEqual({ foundations: 1 });
      // Hidden and shown again inside one minute: counted, not counted, counted.
      await at(0).leave('s1', { tab: A, at: 7_000 }, back + 20_000);
      expect((await at(1).counts(back + 20_001)).total).toBe(0);
      await at(1).touch('s1', beat(A, 7_001, F), back + 25_000);
      expect((await at(2).counts(back + 25_001)).total).toBe(1);
    });

    it('keeps a session away when both its tabs left minutes apart and their old reports land last, on any instance (P1-44)', async () => {
      const { instances } = make(), at = (i: number) => instances[i % instances.length];
      // A reports for five minutes on one instance; then the visitor opens B (it owns the session from then on).
      for (let i = 0; i < 5; i++) await at(0).touch('s1', beat(A, 10, F), T0 + i * BEAT);
      const opened = T0 + 5 * BEAT;
      await at(1).touch('s1', beat(B, 20, DB), opened);
      // Both windows are visible and report: A to the instance that has known it all along, B elsewhere.
      for (let i = 1; i <= 3; i++) {
        await at(0).touch('s1', beat(A, 10, F), opened + i * BEAT - 20_000);
        await at(1).touch('s1', beat(B, 20, DB), opened + i * BEAT);
        for (const store of instances) expect((await store.counts(opened + i * BEAT + 1)).total).toBe(1);
      }
      // A's window closes; its goodbye lands on an instance that never heard from A.
      const closed = opened + 3 * BEAT + 10_000;
      await at(2).leave('s1', { tab: A, at: 30 }, closed);
      for (const store of instances) expect((await store.counts(closed + 1)).islands).toEqual({ databases: 1 });
      // B is hidden a little later.
      await at(1).leave('s1', { tab: B, at: 31 }, closed + 30_000);
      for (const store of instances) expect((await store.counts(closed + 30_001)).total).toBe(0);
      // Reports each tab sent before it left, landing after everything, on every instance, in both orders, spread
      // over a minute and a half (each of them "says nothing new" to an instance that missed the goodbyes). All of
      // them inside the timeout: what a session that is over has forgotten is another matter (a report that is that
      // late starts a session like any first report; engine.ts).
      let now = closed + 31_000;
      const step = Math.floor(90_000 / (2 * instances.length));
      for (const store of instances) { await store.touch('s1', beat(A, 10, F), now); await store.touch('s1', beat(B, 20, DB), now + 1); now += step; }
      for (const store of [...instances].reverse()) { await store.touch('s1', beat(B, 20, DB), now); await store.touch('s1', beat(A, 10, F), now + 1); now += step; }
      for (const store of instances) expect((await store.counts(now)).total).toBe(0);
      // Nobody ever comes back: gone at the timeout like any session, and the same id starts over later.
      expect((await at(0).counts(now + TTL + MIN)).total).toBe(0);
      await at(1).touch('s1', beat(A, 40, ML), now + 30 * MIN);
      for (const store of instances) expect((await store.counts(now + 30 * MIN + 1)).islands).toEqual({ 'machine-learning': 1 });
    });

    it('keeps the rate limit when the same report is repeated faster than a tracker ever sends it', async () => {
      const { instances } = make(), at = (i: number) => instances[i % instances.length];
      await at(0).touch('s1', beat(A, 10, F), T0);
      await at(0).touch('s1', beat(A, 10, F), T0 + BEAT);
      // A flood of the very same report, a second apart, over every instance.
      const start = T0 + 2 * BEAT, results: string[] = [];
      for (let i = 0; i < PRESENCE.rateLimit + 15; i++) results.push(await at(i).touch('s1', beat(A, 10, F), start + i * 1_000));
      expect(results.filter(result => result === 'counted')).toHaveLength(PRESENCE.rateLimit);
      expect(results.filter(result => result === 'rate-limited')).toHaveLength(15);
    });
  });

  /*
   * The same visitors, request for request, through the store under test and through the memory store: the counts
   * must be the same whenever anyone asks. Visitors behave like trackers do (client.ts): a visible tab reports once
   * a minute; moving to another page, or turning to a window, is a new `since` and an immediate report; a hidden or
   * closed tab says goodbye; some vanish without one; some come back.
   */
  interface Sent { now: number; sid: string; tab: string; since?: number; place?: PresenceLocation; at?: number }
  function story(seed: number, sessions: number, tabsEach: number, minutes: number): Sent[] {
    const random = seeded(seed), places = [F, DB, ML, AI], out: Sent[] = [], end = T0 + minutes * MIN;
    for (let s = 0; s < sessions; s++) {
      const sid = `v${seed}-${s}`, offset = Math.floor(random() * 20_000) - 10_000; // the browser's clock is its own
      for (let t = 0; t < tabsEach; t++) {
        const tab = `tab${String.fromCharCode(97 + t)}${String(s).padStart(4, '0')}`;
        let now = T0 + Math.floor(random() * 3 * MIN), visible = true, gone = false, since = now + offset, place = places[Math.floor(random() * places.length)];
        let next = now;
        while (now < end && !gone) {
          if (visible && next <= now) { out.push({ now, sid, tab, since, place }); next = now + BEAT; }
          // What happens before the next report is due.
          const roll = random(), step = 5_000 + Math.floor(random() * 50_000);
          if (visible && roll < 0.18) { now += step; place = places[Math.floor(random() * places.length)]; since = now + offset; next = now; } // another page
          else if (visible && roll < 0.26) { now += step; since = now + offset; next = now; } // turned to this window
          else if (visible && roll < 0.36) { now += step; out.push({ now, sid, tab, at: now + offset }); visible = false; } // hidden or closed
          else if (visible && roll < 0.40) gone = true; // vanished: no goodbye
          else if (!visible && roll < 0.5) { now += step + Math.floor(random() * 5 * MIN); visible = true; since = now + offset + 1; next = now; } // back
          else now = visible ? next : now + step;
        }
      }
    }
    return out.sort((a, b) => a.now - b.now);
  }
  const deliver = (store: PresenceStore, sent: Sent) => sent.at === undefined ? store.touch(sent.sid, beat(sent.tab, sent.since!, sent.place!), sent.now) : store.leave(sent.sid, { tab: sent.tab, at: sent.at }, sent.now);

  describe(`${name}: the same counts as the memory store, request for request (P7)`, () => {
    it('for visitors with one tab each, over 40 minutes, whichever instance hears each request', async () => {
      for (const seed of [21, 22, 23]) {
        const { instances } = make(), reference = new MemoryPresenceStore(), random = seeded(seed * 7), sent = story(seed, 20, 1, 40);
        expect(sent.length).toBeGreaterThan(300);
        let asked = 0;
        for (const [i, request] of sent.entries()) {
          const store = instances[Math.floor(random() * instances.length)];
          expect(await deliver(store, request), `seed ${seed} request ${i}`).toEqual(await deliver(reference, request));
          // Ask now and again: right away, and a while later (before the next request).
          const later = Math.min(request.now + Math.floor(random() * 40_000), (sent[i + 1]?.now ?? request.now + 1) - 1);
          for (const when of i % 3 ? [request.now] : [request.now, Math.max(request.now, later)]) {
            expect(await instances[Math.floor(random() * instances.length)].counts(when), `seed ${seed} request ${i} at +${when - T0}`).toEqual(await reference.counts(when));
            asked += 1;
          }
        }
        const end = sent[sent.length - 1].now;
        for (const when of [end + 30_000, end + TTL, end + TTL + 1, end + 2 * TTL]) for (const store of instances) expect(await store.counts(when)).toEqual(await reference.counts(when));
        expect(asked).toBeGreaterThan(400);
      }
    });

    it('for visitors with two and three tabs, on one instance at a time: every count the same; across instances: nobody lost, nobody twice', async () => {
      for (const [seed, tabs] of [[31, 2], [32, 3], [33, 2]] as const) {
        const { instances } = make(), reference = new MemoryPresenceStore(), random = seeded(seed * 11), sent = story(seed, 10, tabs, 30);
        for (const [i, request] of sent.entries()) {
          const store = instances[Math.floor(random() * instances.length)];
          await deliver(store, request); await deliver(reference, request);
          const counts = await instances[Math.floor(random() * instances.length)].counts(request.now), expected = await reference.counts(request.now);
          // One instance: its memory is the truth, and every count is the reference's. Several: a session is still
          // counted exactly when the reference counts it (where two visible windows of one visitor report to
          // different instances, which of the two pages it is counted on may differ for a while: KNOWN_ISSUES P1-49).
          if (instances.length === 1) expect(counts, `seed ${seed} request ${i}`).toEqual(expected);
          expect(counts.total, `seed ${seed} request ${i}`).toBe(expected.total);
          expect(sum(counts.regions)).toBe(counts.total);
          expect(sum(counts.islands) + sum(counts.commons)).toBe(counts.total);
        }
        const end = sent[sent.length - 1].now;
        for (const store of instances) expect((await store.counts(end + TTL + 1)).total).toBe(0);
      }
    });
  });
}
