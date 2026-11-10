import { describe, expect, it } from 'vitest';
import { recoverAfter, runTimeline, type TimelineScript } from '../src/lib/txn/recovery';
import { runSchedule, weakestSafeLevel, type Schedule, type ScheduleStep } from '../src/lib/txn/schedule';

// Phase F.1c: the transaction timeline engines behind DB14 and DB15, on textbook cases with known answers.
const transfer: TimelineScript = { items: { A: 1000, B: 500 }, min: 0, steps: [
  { op: 'begin' }, { op: 'update', item: 'A', delta: -300 }, { op: 'update', item: 'B', delta: 300 }, { op: 'commit' },
  { op: 'update', item: 'B', delta: -100 },
  { op: 'begin' }, { op: 'update', item: 'A', delta: -2000, note: '餘額不足' }, { op: 'rollback' },
] };

describe('transaction timeline: one session and recovery (F.1c)', () => {
  it('shows working values inside the transaction and committed values outside it', () => {
    const s = runTimeline(transfer);
    expect(s[2]).toMatchObject({ committed: { A: 1000, B: 500 }, working: { A: 700, B: 500 }, open: 1 });
    expect(s[4]).toMatchObject({ committed: { A: 700, B: 800 } });
    expect(s[4].working).toBeUndefined();
    expect(s[5]).toMatchObject({ committed: { A: 700, B: 700 }, text: expect.stringMatching(/自動提交/) });
    expect(s[7]).toMatchObject({ outcome: 'rejected', working: { A: 700, B: 700 }, text: expect.stringMatching(/違反 CHECK/) });
    expect(s[8].committed).toEqual({ A: 700, B: 700 });
    expect(s[4].log.map(r => r.kind)).toEqual(['begin', 'update', 'update', 'commit']);
  });

  it('recovers exactly what was committed, after a crash at any step', () => {
    const states = runTimeline(transfer);
    for (let k = 0; k < states.length; k++) expect(recoverAfter(transfer, k).state, `crash after step ${k}`).toEqual(states[k].committed);
    expect(recoverAfter(transfer, 3)).toEqual({ state: { A: 1000, B: 500 }, redone: [], discarded: [1] });
    expect(recoverAfter(transfer, 4)).toEqual({ state: { A: 700, B: 800 }, redone: [1], discarded: [] });
  });

  it('rolls back to a savepoint and keeps the earlier changes', () => {
    const script: TimelineScript = { items: { A: 100, B: 100, C: 100 }, steps: [
      { op: 'begin' }, { op: 'update', item: 'A', delta: -10 }, { op: 'savepoint', name: 's1' }, { op: 'update', item: 'B', delta: -20 },
      { op: 'update', item: 'C', delta: 5 }, { op: 'rollback-to', name: 's1' }, { op: 'update', item: 'C', delta: 30 }, { op: 'commit' }] };
    const s = runTimeline(script);
    expect(s[6]).toMatchObject({ working: { A: 90, B: 100, C: 100 }, text: expect.stringMatching(/撤銷儲存點之後的 2 個修改/) });
    expect(s[8].committed).toEqual({ A: 90, B: 100, C: 130 });
    expect(recoverAfter(script, 8).state).toEqual({ A: 90, B: 100, C: 130 });
    expect(recoverAfter(script, 7).state).toEqual({ A: 100, B: 100, C: 100 });
  });
});

const sched = (items: Record<string, number>, ...steps: ScheduleStep[]): Schedule => ({ items, steps });
const dirty = sched({ A: 100 }, { tx: 'T1', op: 'write', item: 'A', value: 50 }, { tx: 'T2', op: 'read', item: 'A' }, { tx: 'T1', op: 'abort' }, { tx: 'T2', op: 'commit' });
const nonRepeatable = sched({ A: 100 }, { tx: 'T1', op: 'read', item: 'A' }, { tx: 'T2', op: 'write', item: 'A', value: 80 }, { tx: 'T2', op: 'commit' },
  { tx: 'T1', op: 'read', item: 'A' }, { tx: 'T1', op: 'commit' });
const phantom = sched({ A: 600, B: 300 }, { tx: 'T1', op: 'count', min: 500 }, { tx: 'T2', op: 'insert', item: 'C', value: 900 }, { tx: 'T2', op: 'commit' },
  { tx: 'T1', op: 'count', min: 500 }, { tx: 'T1', op: 'commit' });
const lostUpdate = sched({ A: 100 }, { tx: 'T1', op: 'read', item: 'A', into: 'a' }, { tx: 'T2', op: 'read', item: 'A', into: 'a' },
  { tx: 'T1', op: 'write', item: 'A', value: { from: 'a', delta: 10 } }, { tx: 'T1', op: 'commit' },
  { tx: 'T2', op: 'write', item: 'A', value: { from: 'a', delta: 20 } }, { tx: 'T2', op: 'commit' });
const kinds = (r: ReturnType<typeof runSchedule>) => r.anomalies.map(a => a.kind);

describe('transaction timeline: two sessions (F.1c)', () => {
  it('dirty read: only READ UNCOMMITTED under locking; a locking reader waits, an MVCC reader sees the committed value', () => {
    const ru = runSchedule(dirty, 'locking', 'READ UNCOMMITTED');
    expect(kinds(ru)).toEqual(['dirty-read']);
    expect(ru.events[1]).toMatchObject({ tx: 'T2', result: 'ok', value: 50 });
    const rc = runSchedule(dirty, 'locking', 'READ COMMITTED');
    expect(kinds(rc)).toEqual([]);
    expect(rc.events.map(e => [e.tx, e.result, e.value])).toEqual([['T1', 'ok', 50], ['T2', 'wait', undefined], ['T1', 'ok', undefined], ['T2', 'ok', 100], ['T2', 'ok', undefined]]);
    const mvcc = runSchedule(dirty, 'mvcc', 'READ COMMITTED');
    expect([kinds(mvcc), mvcc.events[1].value, mvcc.events[1].result]).toEqual([[], 100, 'ok']);
    expect(rc.final).toEqual({ A: 100 });
  });

  it('non-repeatable read: READ COMMITTED allows it; REPEATABLE READ prevents it by waiting (locks) or by a snapshot (MVCC)', () => {
    expect(kinds(runSchedule(nonRepeatable, 'locking', 'READ COMMITTED'))).toEqual(['non-repeatable-read']);
    expect(kinds(runSchedule(nonRepeatable, 'mvcc', 'READ COMMITTED'))).toEqual(['non-repeatable-read']);
    const rr = runSchedule(nonRepeatable, 'locking', 'REPEATABLE READ');
    expect([kinds(rr), rr.events.find(e => e.tx === 'T2')!.result, rr.final]).toEqual([[], 'wait', { A: 80 }]);
    const snap = runSchedule(nonRepeatable, 'mvcc', 'REPEATABLE READ');
    expect([kinds(snap), snap.events.filter(e => e.tx === 'T1' && e.value !== undefined).map(e => e.value), snap.final]).toEqual([[], [100, 100], { A: 80 }]);
  });

  it('phantom: REPEATABLE READ under locking still sees new rows; SERIALIZABLE makes the insert wait; an MVCC snapshot hides it', () => {
    expect(kinds(runSchedule(phantom, 'locking', 'REPEATABLE READ'))).toEqual(['phantom']);
    const ser = runSchedule(phantom, 'locking', 'SERIALIZABLE');
    expect([kinds(ser), ser.events.find(e => e.tx === 'T2')!.result, ser.final]).toEqual([[], 'wait', { A: 600, B: 300, C: 900 }]);
    expect(kinds(runSchedule(phantom, 'mvcc', 'REPEATABLE READ'))).toEqual([]);
    expect(kinds(runSchedule(phantom, 'mvcc', 'READ COMMITTED'))).toEqual(['phantom']);
  });

  it('lost update: READ COMMITTED loses T1\'s +10; REPEATABLE READ aborts one transaction (deadlock, or first updater wins)', () => {
    const rc = runSchedule(lostUpdate, 'locking', 'READ COMMITTED');
    expect([kinds(rc), rc.final]).toEqual([['lost-update'], { A: 120 }]);
    expect(kinds(runSchedule(lostUpdate, 'mvcc', 'READ COMMITTED'))).toEqual(['lost-update']);
    const rr = runSchedule(lostUpdate, 'locking', 'REPEATABLE READ');
    expect([kinds(rr), rr.outcome, rr.final]).toEqual([[], { T1: 'committed', T2: 'aborted' }, { A: 110 }]);
    expect(rr.events.some(e => e.result === 'aborted' && /死結/.test(e.text))).toBe(true);
    const si = runSchedule(lostUpdate, 'mvcc', 'REPEATABLE READ');
    expect([kinds(si), si.outcome, si.final]).toEqual([[], { T1: 'committed', T2: 'aborted' }, { A: 110 }]);
    expect(si.events.find(e => e.result === 'aborted')!.text).toMatch(/無法序列化/);
  });

  it('finds the weakest level that prevents an anomaly, per model', () => {
    expect(weakestSafeLevel(dirty, 'locking', ['dirty-read'])).toBe('READ COMMITTED');
    expect(weakestSafeLevel(nonRepeatable, 'locking', ['non-repeatable-read'])).toBe('REPEATABLE READ');
    expect(weakestSafeLevel(phantom, 'locking', ['phantom'])).toBe('SERIALIZABLE');
    expect(weakestSafeLevel(phantom, 'mvcc', ['phantom'])).toBe('REPEATABLE READ');
    expect(weakestSafeLevel(lostUpdate, 'mvcc', ['lost-update'])).toBe('REPEATABLE READ');
    expect(() => runSchedule(dirty, 'mvcc', 'SERIALIZABLE')).toThrow();
  });

  it('a step of a finished transaction is skipped; a schedule that ends while waiting says so', () => {
    const r = runSchedule(sched({ A: 1 }, { tx: 'T1', op: 'abort' }, { tx: 'T1', op: 'read', item: 'A' }), 'locking', 'READ COMMITTED');
    expect(r.events[1]).toMatchObject({ result: 'skipped' });
    const stuck = runSchedule(sched({ A: 1 }, { tx: 'T1', op: 'write', item: 'A', value: 2 }, { tx: 'T2', op: 'read', item: 'A' }), 'locking', 'READ COMMITTED');
    expect(stuck.events.at(-1)).toMatchObject({ tx: 'T2', result: 'wait', text: expect.stringMatching(/仍在等待/) });
    expect(stuck.outcome).toEqual({ T1: 'unfinished', T2: 'unfinished' });
  });
});
