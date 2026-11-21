import { describe, expect, it } from 'vitest';
import { PRESENCE } from '@/lib/presence/config';
import { MAX_LEFT, aggregate, applyHeartbeat, applyLeave, isActive, leaveFirst, publicSnapshot, type Heartbeat, type SessionRecord } from '@/lib/presence/engine';
import { HUB_LOCATION, type PresenceLocation } from '@/lib/presence/locations';
import { MemoryPresenceStore } from '@/lib/presence/store';
import { presenceOrderingContract, presenceStoreContract } from './helpers/presence-store-contract';

/*
 * Dynamic Island Population: the population engine and its memory store. One session is in one place; several tabs,
 * background tabs, timeouts and floods are all decided here, with the clock passed in.
 */

const F: PresenceLocation = { region: 'cs', island: 'foundations', course: 'F01' };
const DB: PresenceLocation = { region: 'cs', island: 'databases', course: 'DB01' };
const ML: PresenceLocation = { region: 'ai', island: 'machine-learning', course: null };
const AI: PresenceLocation = { region: 'ai', island: null, course: null };
const beat = (tab: string, since: number, location: PresenceLocation): Heartbeat => ({ tab, since, location });
const T0 = 1_800_000_000_000;

describe('one session, one place', () => {
  it('moves a session with its tab and never counts it twice', () => {
    let record: SessionRecord | undefined = applyHeartbeat(undefined, beat('taba0001', 10, F), T0);
    expect(aggregate([record], T0)).toMatchObject({ total: 1, islands: { foundations: 1 }, courses: { F01: 1 } });
    record = applyHeartbeat(record, beat('taba0001', 20, ML), T0 + 5_000);
    const counts = aggregate([record], T0 + 5_000);
    expect(counts.total).toBe(1);
    expect(counts.regions).toEqual({ cs: 0, ai: 1, design: 0, web: 0, sys: 0, hub: 0 });
    expect(counts.islands).toEqual({ 'machine-learning': 1 });
    expect(counts.courses).toEqual({});
  });

  it('gives the place to the tab the visitor turned to last; older visible tabs only keep the session alive', () => {
    let record = applyHeartbeat(undefined, beat('taba0001', 100, F), T0);
    record = applyHeartbeat(record, beat('tabb0002', 200, DB), T0 + 1_000);
    expect(record.location).toEqual(DB);
    // Tab A is still visible in another window and keeps reporting: the session stays where tab B put it.
    record = applyHeartbeat(record, beat('taba0001', 100, F), T0 + 31_000);
    expect(record.location).toEqual(DB);
    expect(record.seen).toBe(T0 + 31_000);
    // The visitor clicks into tab A: its `since` is now the newest.
    record = applyHeartbeat(record, beat('taba0001', 300, F), T0 + 40_000);
    expect(record.location).toEqual(F);
    expect(record.tab).toBe('taba0001');
  });

  it('hands a session over when its owning tab has gone silent without saying goodbye', () => {
    let record = applyHeartbeat(undefined, beat('taba0001', 100, F), T0);
    record = applyHeartbeat(record, beat('tabb0002', 200, DB), T0 + 1_000);
    // Tab B crashed. Tab A's reports do not move the session at first, then they do.
    record = applyHeartbeat(record, beat('taba0001', 100, F), T0 + 30_000);
    expect(record.location).toEqual(DB);
    record = applyHeartbeat(record, beat('taba0001', 100, F), T0 + 1_000 + PRESENCE.ownerSilenceMs + 1);
    expect(record.location).toEqual(F);
  });
});

describe('background tabs and timeouts', () => {
  it('stops counting when the owning tab leaves, and resumes with any tab', () => {
    let record = applyHeartbeat(undefined, beat('taba0001', 100, F), T0);
    record = applyLeave(record, 'taba0001');
    expect(isActive(record, T0 + 1)).toBe(false);
    expect(aggregate([record], T0 + 1).total).toBe(0);
    // A background tab of the session that was never the owner comes forward with an older `since`: it still takes over.
    record = applyHeartbeat(record, beat('tabb0002', 50, DB), T0 + 2_000);
    expect(isActive(record, T0 + 2_000)).toBe(true);
    expect(record.location).toEqual(DB);
  });

  it('ignores a goodbye from a tab that does not own the session (a hidden tab while another is in front)', () => {
    let record = applyHeartbeat(undefined, beat('taba0001', 100, F), T0);
    record = applyHeartbeat(record, beat('tabb0002', 200, DB), T0 + 500);
    record = applyLeave(record, 'taba0001');
    expect(isActive(record, T0 + 600)).toBe(true);
    expect(record.location).toEqual(DB);
  });

  it('counts a silent session until the timeout and not after', () => {
    const record = applyHeartbeat(undefined, beat('taba0001', 100, F), T0);
    expect(aggregate([record], T0 + PRESENCE.ttlMs).total).toBe(1);
    expect(aggregate([record], T0 + PRESENCE.ttlMs + 1).total).toBe(0);
  });

  it('starts an expired session over at its new place', () => {
    let record = applyHeartbeat(undefined, beat('taba0001', 500, F), T0);
    record = applyHeartbeat(record, beat('tabb0002', 100, AI), T0 + PRESENCE.ttlMs + 5_000);
    expect(record.location).toEqual(AI);
    expect(record.tab).toBe('tabb0002');
  });
});

describe('aggregate and the public snapshot', () => {
  it('counts by region, island and course, the hub included', () => {
    const records = [F, F, DB, ML, AI, HUB_LOCATION, { region: 'hub', island: 'labs', course: 'lab:bfs' } as PresenceLocation]
      .map((location, i) => applyHeartbeat(undefined, beat(`tab0000${i}`, i, location), T0));
    const counts = aggregate(records, T0);
    expect(counts.total).toBe(7);
    expect(counts.regions).toEqual({ cs: 3, ai: 2, design: 0, web: 0, sys: 0, hub: 2 });
    expect(counts.islands).toEqual({ foundations: 2, databases: 1, 'machine-learning': 1, labs: 1 });
    expect(counts.courses).toEqual({ F01: 2, DB01: 1, 'lab:bfs': 1 });
    // Commons: the visitors of a region who are on none of its islands (a region's own page, the hub with no island).
    expect(counts.commons).toEqual({ cs: 0, ai: 1, design: 0, web: 0, sys: 0, hub: 1 });
    expect(publicSnapshot(counts, T0).commons).toEqual({ cs: 0, ai: 1, design: 0, web: 0, sys: 0, hub: 1 });
    // Every visitor is in exactly one region: the regions add up to the total.
    expect(Object.values(counts.regions).reduce((a, b) => a + b, 0)).toBe(counts.total);
  });

  it('publishes totals only: no course counts, no session, tab or time of a session', () => {
    const record = applyHeartbeat(undefined, beat('taba0001', 123456, F), T0);
    const snapshot = publicSnapshot(aggregate([record], T0), T0);
    expect(snapshot).toEqual({ v: 1, at: T0, ttlMs: PRESENCE.ttlMs, total: 1, hub: 0,
      regions: { cs: 1, ai: 0, design: 0, web: 0, sys: 0 }, islands: { foundations: 1 },
      // The visitor is on an island, so no region's commons counts it.
      commons: { cs: 0, ai: 0, design: 0, web: 0, sys: 0, hub: 0 } });
    const text = JSON.stringify(snapshot);
    for (const secret of ['taba0001', '123456', 'F01', 'course', 'since', 'seen']) expect(text).not.toContain(secret);
  });
});

describe('the memory store', () => {
  it('moves the population from one archipelago to another', async () => {
    const store = new MemoryPresenceStore();
    await store.touch('s1', beat('taba0001', 1, F), T0);
    await store.touch('s2', beat('tabb0002', 1, F), T0);
    expect((await store.counts(T0)).islands).toEqual({ foundations: 2 });
    await store.touch('s1', beat('taba0001', 2, ML), T0 + 3_000);
    const counts = await store.counts(T0 + 3_000);
    expect(counts.islands).toEqual({ foundations: 1, 'machine-learning': 1 });
    expect(counts.regions.cs + counts.regions.ai).toBe(2);
    expect(counts.total).toBe(2);
  });

  it('drops a session after the timeout and frees its memory', async () => {
    const store = new MemoryPresenceStore();
    await store.touch('s1', beat('taba0001', 1, F), T0);
    await store.touch('s2', beat('tabb0002', 1, DB), T0 + 60_000);
    expect((await store.counts(T0 + PRESENCE.ttlMs)).total).toBe(2);
    expect((await store.counts(T0 + PRESENCE.ttlMs + 20_000)).islands).toEqual({ databases: 1 });
    expect(store.size).toBe(1);
  });

  it('takes a session away on leave and brings it back on the next heartbeat', async () => {
    const store = new MemoryPresenceStore();
    await store.touch('s1', beat('taba0001', 1, F), T0);
    await store.leave('s1', 'taba0001', T0 + 1_000);
    expect((await store.counts(T0 + 1_000)).total).toBe(0);
    await store.leave('unknown', 'taba0001', T0 + 1_000);
    await store.touch('s1', beat('taba0001', 2, F), T0 + 2_000);
    expect((await store.counts(T0 + 2_000)).total).toBe(1);
  });

  it('refuses a flood of writes from one session without moving it', async () => {
    const store = new MemoryPresenceStore();
    for (let i = 0; i < PRESENCE.rateLimit; i++) expect(await store.touch('s1', beat('taba0001', i, F), T0 + i)).toBe('counted');
    expect(await store.touch('s1', beat('taba0001', 999, ML), T0 + 100)).toBe('rate-limited');
    expect((await store.counts(T0 + 100)).islands).toEqual({ foundations: 1 });
    // The window passes: writes are taken again.
    expect(await store.touch('s1', beat('taba0001', 1000, ML), T0 + PRESENCE.rateWindowMs + 1)).toBe('counted');
    expect((await store.counts(T0 + PRESENCE.rateWindowMs + 1)).islands).toEqual({ 'machine-learning': 1 });
  });

  it('holds no more sessions than its limit, and makes room once sessions expire', async () => {
    const store = new MemoryPresenceStore(3);
    for (const sid of ['a', 'b', 'c']) expect(await store.touch(sid, beat('taba0001', 1, F), T0)).toBe('counted');
    expect(await store.touch('d', beat('taba0001', 1, F), T0 + 1)).toBe('full');
    expect(await store.touch('a', beat('taba0001', 2, DB), T0 + 2)).toBe('counted');
    expect((await store.counts(T0 + 2)).total).toBe(3);
    expect(await store.touch('d', beat('taba0001', 1, F), T0 + PRESENCE.ttlMs + 10)).toBe('counted');
  });
});

// P5: the same contract the shared store runs (races between tabs and sessions, expiry, cleanup).
presenceStoreContract('the memory store (contract)', max => { const store = new MemoryPresenceStore(max); return { store, held: () => store.size }; });
presenceOrderingContract('the memory store (contract)', () => { const store = new MemoryPresenceStore(); return { instances: [store], held: () => store.size }; });

describe('requests that arrive out of order', () => {
  const P1: PresenceLocation = F, P2: PresenceLocation = DB, P3: PresenceLocation = ML;

  it('does not let a heartbeat sent before the goodbye bring the session back', () => {
    let record = applyHeartbeat(undefined, beat('taba0001', 10, P1), T0);
    record = applyLeave(record, { tab: 'taba0001', at: 30 });
    expect(isActive(record, T0 + 1)).toBe(false);
    const late = applyHeartbeat(record, beat('taba0001', 20, P2), T0 + 100);
    expect(late).toBe(record);
    // The tab came back: its report is from after the goodbye.
    const back = applyHeartbeat(record, beat('taba0001', 31, P2), T0 + 200);
    expect(isActive(back, T0 + 200)).toBe(true);
    expect(back.location).toEqual(P2);
    expect(back.left).toBeUndefined();
    // Another tab of the session is a visitor too, whatever its clock says.
    expect(isActive(applyHeartbeat(record, beat('tabb0002', 5, P3), T0 + 200), T0 + 200)).toBe(true);
  });

  it('ignores a goodbye that is older than the tab\'s own latest report', () => {
    let record = applyHeartbeat(undefined, beat('taba0001', 10, P1), T0);
    // Hidden at 20, visible again at 40: the return's heartbeat landed first.
    record = applyHeartbeat(record, beat('taba0001', 40, P1), T0 + 50);
    expect(applyLeave(record, { tab: 'taba0001', at: 20 })).toBe(record);
    expect(applyLeave(record, { tab: 'taba0001', at: 40 }).away).toBe(true);
    // A tracker that sends no time (an older page) is taken at its word, as before.
    expect(applyLeave(record, 'taba0001').away).toBe(true);
    expect(applyLeave(record, { tab: 'taba0001' }).left).toBeUndefined();
  });

  it('does not move a session back to where its tab was', () => {
    let record = applyHeartbeat(undefined, beat('taba0001', 10, P1), T0);
    record = applyHeartbeat(record, beat('taba0001', 30, P3), T0 + 100);
    const late = applyHeartbeat(record, beat('taba0001', 20, P2), T0 + 150);
    expect(late.location).toEqual(P3);
    expect(late.since).toBe(30);
    // It is still a sign of life.
    expect(late.seen).toBe(T0 + 150);
    expect(late.ownerSeen).toBe(T0 + 150);
  });

  it('ends in the same state whatever order one tab\'s reports land in', () => {
    // One tab: at P1, hidden, back at P2, on to P3, hidden; and the same story ending with the tab still visible.
    type Event = { kind: 'beat'; since: number; place: PresenceLocation } | { kind: 'leave'; at: number };
    const story: Event[] = [{ kind: 'beat', since: 10, place: P1 }, { kind: 'leave', at: 20 }, { kind: 'beat', since: 30, place: P2 }, { kind: 'beat', since: 30, place: P2 },
      { kind: 'beat', since: 40, place: P3 }, { kind: 'beat', since: 40, place: P3 }];
    const run = (events: Event[]) => {
      let record: SessionRecord | undefined;
      events.forEach((event, i) => {
        if (event.kind === 'beat') record = applyHeartbeat(record, beat('taba0001', event.since, event.place), T0 + i);
        else if (record) record = applyLeave(record, { tab: 'taba0001', at: event.at });
      });
      return record!;
    };
    const permutations = (list: Event[]): Event[][] => list.length <= 1 ? [list] : list.flatMap((event, i) => permutations([...list.slice(0, i), ...list.slice(i + 1)]).map(rest => [event, ...rest]));
    let orders = 0;
    for (const [ending, away] of [[[] as Event[], false], [[{ kind: 'leave', at: 50 }] as Event[], true]] as const) {
      // The session exists once its first report has landed; everything after it may land in any order.
      for (const rest of permutations([...story.slice(1), ...ending])) {
        const record = run([story[0], ...rest]);
        orders++;
        expect(record.away, JSON.stringify(rest)).toBe(away);
        if (!away) expect(record.location, JSON.stringify(rest)).toEqual(P3);
        expect(aggregate([record], T0 + 100).total).toBe(away ? 0 : 1);
      }
    }
    expect(orders).toBe(120 + 720);
  });

  it('never counts one session twice, whatever two tabs do in whatever order', () => {
    const random = (() => { let a = 20261121; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();
    const places = [F, DB, ML, AI, HUB_LOCATION];
    for (let round = 0; round < 400; round++) {
      let record: SessionRecord | undefined, clock = 0;
      for (let step = 0; step < 30; step++) {
        clock += Math.floor(random() * 20_000);
        const tab = random() < 0.5 ? 'taba0001' : 'tabb0002', time = Math.floor(random() * 1_000);
        if (random() < 0.7 || !record) record = applyHeartbeat(record, beat(tab, time, places[Math.floor(random() * places.length)]), T0 + clock);
        else record = applyLeave(record, random() < 0.5 ? tab : { tab, at: time });
        const counts = aggregate([record], T0 + clock);
        expect(counts.total).toBeLessThanOrEqual(1);
        expect(Object.values(counts.regions).reduce((a, b) => a + b, 0)).toBe(counts.total);
        expect(Object.values(counts.islands).reduce((a, b) => a + b, 0) + Object.values(counts.commons).reduce((a, b) => a + b, 0)).toBe(counts.total);
        expect(['taba0001', 'tabb0002']).toContain(record.tab);
      }
    }
  });
});

describe('several tabs, requests in any order (P6-A, KNOWN_ISSUES P1-44)', () => {
  const A = 'taba0001', B = 'tabb0002', C = 'tabc0003';
  type Event = { tab: string; kind: 'beat'; since: number; place: PresenceLocation } | { tab: string; kind: 'leave'; at: number };
  const b = (tab: string, since: number, place: PresenceLocation): Event => ({ tab, kind: 'beat', since, place });
  const l = (tab: string, at: number): Event => ({ tab, kind: 'leave', at });
  /** What a store does with the events, in the order given (store.ts): a goodbye with no session is remembered. */
  const deliver = (events: Event[]) => {
    let record: SessionRecord | undefined;
    events.forEach((event, i) => {
      if (event.kind === 'beat') record = applyHeartbeat(record, beat(event.tab, event.since, event.place), T0 + i);
      else record = record ? applyLeave(record, { tab: event.tab, at: event.at }) : leaveFirst({ tab: event.tab, at: event.at }, T0 + i);
    });
    return record;
  };
  const counted = (record: SessionRecord | undefined) => record ? aggregate([record], T0 + 1_000).total : 0;
  function* permutations<T>(list: T[]): Generator<T[]> {
    if (list.length <= 1) { yield list; return; }
    for (let i = 0; i < list.length; i++) for (const rest of permutations([...list.slice(0, i), ...list.slice(i + 1)])) yield [list[i], ...rest];
  }

  it('keeps a session away when the tab that did not own it left too, and that tab\'s heartbeat lands last (P1-44)', () => {
    // Two windows of one session, B in front. Both are hidden together; A's last heartbeat is still on its way.
    let record = applyHeartbeat(undefined, beat(A, 10, F), T0);
    record = applyHeartbeat(record, beat(B, 20, DB), T0 + 100);
    record = applyLeave(record, { tab: A, at: 30 });
    // A's goodbye does not take the session away (B is in front), but it is remembered.
    expect(isActive(record, T0 + 200)).toBe(true);
    expect(record.left).toEqual({ [A]: 30 });
    record = applyLeave(record, { tab: B, at: 31 });
    expect(isActive(record, T0 + 300)).toBe(false);
    const late = applyHeartbeat(record, beat(A, 10, F), T0 + 400);
    expect(late).toBe(record);
    expect(counted(late)).toBe(0);
    // A really comes back: later than its goodbye.
    const back = applyHeartbeat(record, beat(A, 40, ML), T0 + 500);
    expect(isActive(back, T0 + 500)).toBe(true);
    expect(back.location).toEqual(ML);
    expect(back.left).toEqual({ [B]: 31 });
  });

  it('remembers a goodbye that overtook its session\'s first heartbeat, and counts nobody for it', () => {
    const first = leaveFirst({ tab: A, at: 30 }, T0)!;
    expect(counted(first)).toBe(0);
    expect(first.location).toEqual(HUB_LOCATION);
    // The heartbeat sent before the goodbye lands: still nobody. One sent after it: the visitor is back.
    expect(applyHeartbeat(first, beat(A, 20, F), T0 + 50)).toBe(first);
    expect(counted(applyHeartbeat(first, beat(A, 31, F), T0 + 50))).toBe(1);
    // Another tab of the session is a visitor, whatever the first one did.
    expect(applyHeartbeat(first, beat(B, 5, DB), T0 + 50).location).toEqual(DB);
    // A goodbye with no time cannot be put in order: it starts nothing.
    expect(leaveFirst({ tab: A }, T0)).toBeUndefined();
    expect(leaveFirst(A, T0)).toBeUndefined();
  });

  it('takes a heartbeat that carries its goodbye\'s own time as sent before it (the tracker makes every later one later)', () => {
    let record = applyHeartbeat(undefined, beat(A, 30, F), T0);
    record = applyLeave(record, { tab: A, at: 30 });
    expect(record.away).toBe(true);
    expect(applyHeartbeat(record, beat(A, 30, F), T0 + 10)).toBe(record);
    expect(applyHeartbeat(record, beat(A, 31, F), T0 + 10).away).toBe(false);
  });

  it('never counts a session whose tabs have all left, in every order of their requests', () => {
    const two = [b(A, 10, F), b(A, 10, F), b(B, 20, DB), b(B, 20, DB), l(A, 30), l(B, 31)];
    const three = [b(A, 10, F), b(B, 20, DB), b(C, 25, ML), b(B, 20, DB), l(A, 30), l(B, 31), l(C, 32)];
    // A tab that left, came back and left again; the other one left in between.
    const again = [b(A, 10, F), l(A, 15), b(A, 22, AI), b(B, 20, DB), l(B, 24), l(A, 30)];
    let orders = 0;
    for (const story of [two, three, again]) for (const order of permutations(story)) {
      orders++;
      const record = deliver(order);
      if (counted(record) !== 0) throw new Error(`still counted after ${JSON.stringify(order)}`);
    }
    expect(orders).toBe(720 + 5040 + 720);
  });

  it('counts a session exactly once, where its newest tab is, when that tab stays, in every order', () => {
    // A and C leave, B (the tab the visitor turned to last) stays: counted at B's place, whichever request is last.
    const story = [b(A, 10, F), b(B, 12, AI), b(C, 15, ML), b(B, 20, DB), b(B, 20, DB), l(A, 30), l(C, 31)];
    for (const order of permutations(story)) {
      const record = deliver(order)!;
      if (counted(record) !== 1 || record.tab !== B || record.location !== DB) throw new Error(`wrong end after ${JSON.stringify(order)}: ${JSON.stringify(record)}`);
    }
  });

  it('holds for random stories of three tabs delivered in random order', () => {
    const random = (() => { let a = 20261122; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();
    const places = [F, DB, ML, AI, HUB_LOCATION], tabs = [A, B, C];
    let allLeft = 0, newestStays = 0;
    for (let round = 0; round < 3_000; round++) {
      // The story as it happened in the browser: each tab shows, moves, reports again and hides, on one clock.
      const visible = new Map<string, { since: number; place: PresenceLocation }>(), events: Event[] = [];
      let clock = 100;
      for (let step = 0; step < 4 + Math.floor(random() * 10); step++) {
        clock += 1 + Math.floor(random() * 5);
        const tab = tabs[Math.floor(random() * tabs.length)], state = visible.get(tab), roll = random();
        if (!state || roll < 0.25) { const next = { since: clock, place: places[Math.floor(random() * places.length)] }; visible.set(tab, next); events.push(b(tab, next.since, next.place)); }
        else if (roll < 0.6) events.push(b(tab, state.since, state.place));
        else { visible.delete(tab); events.push(l(tab, clock)); }
      }
      if (round % 3 === 0) for (const tab of [...visible.keys()]) { clock += 1; visible.delete(tab); events.push(l(tab, clock)); }
      const beats = events.filter(event => event.kind === 'beat');
      if (!beats.length) continue;
      const newest = beats.reduce((max, event) => event.since > max.since ? event : max);
      const order = [...events];
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      const record = deliver(order), total = counted(record), context = () => `round ${round}: ${JSON.stringify(order)} -> ${JSON.stringify(record)}`;
      expect(total, context()).toBeLessThanOrEqual(1);
      // Nobody left to count: not counted, whichever request landed last.
      if (visible.size === 0) { allLeft++; expect(total, context()).toBe(0); }
      // Whoever is counted is a tab that is really there.
      if (total === 1) expect(visible.has(record!.tab), context()).toBe(true);
      // The tab the visitor turned to last is still there: the session is counted, and at that tab's place.
      if (visible.get(newest.tab)?.since === newest.since) { newestStays++; expect(total, context()).toBe(1); expect(record!.tab, context()).toBe(newest.tab); expect(record!.location, context()).toBe(newest.place); }
      if (record?.left) expect(Object.keys(record.left).length).toBeLessThanOrEqual(MAX_LEFT);
    }
    // Both ends were really tried.
    expect(allLeft).toBeGreaterThan(800);
    expect(newestStays).toBeGreaterThan(800);
  });

  it('never moves a session\'s last sign of life back in time (a request handled late, by a server whose clock is behind)', () => {
    let record = applyHeartbeat(undefined, beat(A, 10, F), T0);
    record = applyHeartbeat(record, beat(A, 10, F), T0 + 30_000);
    const late = applyHeartbeat(record, beat(A, 10, F), T0 + 12_000);
    expect(late.seen).toBe(T0 + 30_000);
    expect(late.ownerSeen).toBe(T0 + 30_000);
    // The same for another tab's report and for a new owner.
    expect(applyHeartbeat(record, beat(B, 5, DB), T0 + 1).seen).toBe(T0 + 30_000);
    const taken = applyHeartbeat(record, beat(B, 50, DB), T0 + 1);
    expect([taken.seen, taken.ownerSeen, taken.tab]).toEqual([T0 + 30_000, T0 + 30_000, B]);
    // And a late request is no reason to call a live session expired.
    expect(applyHeartbeat(record, beat(A, 10, F), T0 - 5 * PRESENCE.ttlMs).seen).toBe(T0 + 30_000);
  });

  it('remembers a bounded number of goodbyes: the oldest goes first, never the owner\'s', () => {
    let record = applyHeartbeat(undefined, beat('owner001', 1_000, F), T0);
    record = applyLeave(record, { tab: 'owner001', at: 1_001 });
    for (let i = 0; i < 20; i++) record = applyLeave(record, { tab: `other${String(i).padStart(3, '0')}`, at: 2_000 + i });
    const left = record.left!;
    expect(Object.keys(left)).toHaveLength(MAX_LEFT);
    expect(left.owner001).toBe(1_001);
    expect(Object.keys(left).filter(tab => tab !== 'owner001').sort()).toEqual(['other015', 'other016', 'other017', 'other018', 'other019']);
    expect(record.away).toBe(true);
    // A tab id is only a key, whatever it spells.
    const odd = applyLeave(applyHeartbeat(undefined, beat(A, 10, F), T0), { tab: 'constructor', at: 5 });
    expect(odd.left).toEqual({ constructor: 5 });
    expect(applyHeartbeat(odd, beat('tostring1', 1, DB), T0 + 1).away).toBe(false);
    expect(applyHeartbeat(odd, beat('constructor', 4, DB), T0 + 1)).toBe(odd);
  });
});

describe('hostile keys', () => {
  it('counts a record whose ids spell object properties as plain keys (a store may outlive the code that wrote it)', () => {
    const odd = [{ region: 'constructor', island: 'toString', course: '__proto__' }, { region: '__proto__', island: '__proto__', course: 'hasOwnProperty' }] as unknown as PresenceLocation[];
    const counts = aggregate(odd.map((location, i) => applyHeartbeat(undefined, beat(`tab0000${i}`, i, location), T0)), T0);
    expect(counts.total).toBe(2);
    // An unknown region is the hub; nothing leaks onto Object.prototype.
    expect(counts.regions).toEqual({ cs: 0, ai: 0, design: 0, web: 0, sys: 0, hub: 2 });
    expect(Object.keys(counts.islands).sort()).toEqual(['__proto__', 'toString']);
    expect(counts.islands.toString).toBe(1);
    expect(({} as Record<string, unknown>).toString).toBe(Object.prototype.toString);
    expect(JSON.parse(JSON.stringify(publicSnapshot(counts, T0))).total).toBe(2);
  });
});
