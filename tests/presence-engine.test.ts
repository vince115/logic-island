import { describe, expect, it } from 'vitest';
import { PRESENCE } from '@/lib/presence/config';
import { aggregate, applyHeartbeat, applyLeave, isActive, publicSnapshot, type Heartbeat, type SessionRecord } from '@/lib/presence/engine';
import { HUB_LOCATION, type PresenceLocation } from '@/lib/presence/locations';
import { MemoryPresenceStore } from '@/lib/presence/store';

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
    // Every visitor is in exactly one region: the regions add up to the total.
    expect(Object.values(counts.regions).reduce((a, b) => a + b, 0)).toBe(counts.total);
  });

  it('publishes totals only: no course counts, no session, tab or time of a session', () => {
    const record = applyHeartbeat(undefined, beat('taba0001', 123456, F), T0);
    const snapshot = publicSnapshot(aggregate([record], T0), T0);
    expect(snapshot).toEqual({ v: 1, at: T0, ttlMs: PRESENCE.ttlMs, total: 1, hub: 0,
      regions: { cs: 1, ai: 0, design: 0, web: 0, sys: 0 }, islands: { foundations: 1 } });
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
