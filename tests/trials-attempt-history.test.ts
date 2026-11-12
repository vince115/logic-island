// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetTrialsForTests, useTrials } from '../src/components/trials/use-trials';
import { abandon, answerQuestion, finish, hashVersionOf, startSession, type EnginePaper, type ExamSession } from '../src/lib/trials/engine';
import {
  KEPT_PER_PAPER, TRIALS_KEY, TRIALS_V1_BACKUP_KEY, TRIALS_VERSION, downgradeToV1, emptyTrials, getSession, parseTrials, putSession, type TrialStore,
} from '../src/lib/trials/store';

// Shared Trial System T.3H (docs/exam-system/32 §3–5): versioned historical attempts and the version-1 → 2 migration.
// Every store here is synthetic; the version-1 fixtures are written the way the T.0–T.3G code wrote them.
const T = (min: number) => new Date(Date.UTC(2026, 11, 9, 9, min)).toISOString();
const H1 = 'a1b2c3d4', H2 = 'v2-0123456789abcdef';
const paper: EnginePaper = { id: 'p', version: '1.0.0', examId: 'exam-x', durationMinutes: 30, shuffleOptions: false, passPoints: 10, items: [
  { questionId: 'q1', revision: 1, hash: H1, hashVersion: 1, points: 10, optionIds: ['a', 'b', 'c'], fixed: [], correct: ['a'], tags: ['t'] },
  { questionId: 'q2', revision: 3, hash: H2, hashVersion: 2, points: 10, optionIds: ['a', 'b', 'c'], fixed: [], correct: ['b'], tags: ['t'] },
] };
const taken = (id: string, min: number, pick = ['a', 'a']) => {
  let s = startSession(paper, T(min), { id, seed: 1 });
  s = answerQuestion(s, 'q1', pick[0], T(min + 1));
  s = answerQuestion(s, 'q2', pick[1], T(min + 1));
  return finish(s, T(min + 2));
};

describe('Phase 2: the identity of a new attempt', () => {
  it('freezes the exam, each item’s revision, hash and hash version, order and answer, and what each item was graded on', () => {
    const s = taken('s1', 0);
    expect(s).toMatchObject({ id: 's1', examId: 'exam-x', paperId: 'p', paperVersion: '1.0.0', endedAt: T(2), status: 'submitted' });
    expect(s.items.map(i => [i.questionId, i.revision, i.hash, i.hashVersion, i.optionOrder.join(''), i.answer?.selected.join('')])).toEqual([['q1', 1, H1, 1, 'abc', 'a'], ['q2', 3, H2, 2, 'abc', 'a']]);
    expect(s.result!.perItem.map(p => [p.questionId, p.revision, p.hash, p.correct])).toEqual([['q1', 1, H1, true], ['q2', 3, H2, false]]);
    expect(s.result).toMatchObject({ score: 10, maxScore: 20, passed: true, gradedAt: T(2) });
  });
  it('reads a hash version only from the hash’s form, never guesses one', () => {
    expect([hashVersionOf(H1), hashVersionOf(H2), hashVersionOf('h-q1'), hashVersionOf('v2-short'), hashVersionOf('A1B2C3D4')]).toEqual([1, 2, undefined, undefined, undefined]);
  });
});

describe('Phase 2: an ended attempt is final', () => {
  it('a graded session is never replaced: not regraded, not edited, not graded again under other rules', () => {
    const s = taken('s1', 0), store = putSession(emptyTrials(), s);
    const regraded: ExamSession = { ...s, result: { ...s.result!, score: 20, passed: true, correct: 2, perItem: s.result!.perItem.map(p => ({ ...p, correct: true, earned: p.max })) } };
    const edited: ExamSession = { ...s, items: s.items.map(i => ({ ...i, answer: { selected: i.correct, at: T(5) } })) };
    for (const attempt of [regraded, edited, { ...s, status: 'in-progress' as const, result: undefined }]) expect(putSession(store, attempt)).toBe(store);
    expect(getSession(store, 's1')!.result!.score).toBe(10);
    expect(store.reviews.q2.attempts).toHaveLength(1);
  });
  it('an abandoned session is never resumed or graded', () => {
    const open = startSession(paper, T(0), { id: 'gone', seed: 1 }), store = putSession(emptyTrials(), abandon(open, T(1)));
    expect(putSession(store, open)).toBe(store);
    expect(putSession(store, finish(open, T(2)))).toBe(store);
    expect(getSession(store, 'gone')).toMatchObject({ status: 'abandoned' });
    expect(getSession(store, 'gone')!.result).toBeUndefined();
  });
  it('the review book keeps the content each attempt answered, where it was answered and what was chosen', () => {
    const store = putSession(emptyTrials(), taken('s1', 0));
    expect(store.reviews.q2.attempts[0]).toEqual({ sessionId: 's1', revision: 3, hash: H2, hashVersion: 2, correct: false, at: T(2), examId: 'exam-x', paperId: 'p', paperVersion: '1.0.0',
      answer: { selected: ['a'], correct: ['b'], order: ['a', 'b', 'c'] } });
  });
});

/** A version-1 store as the T.0–T.3G code saved it: no exam, no hash version, attempts with a revision only. */
function legacy() {
  const strip = (s: ExamSession): ExamSession => {
    const { examId: _e, ...rest } = s;
    void _e;
    return { ...rest, items: s.items.map(({ hashVersion: _h, ...i }) => { void _h; return i; }),
      ...s.result ? { result: { ...s.result, perItem: s.result.perItem.map(({ revision: _r, hash: _x, ...p }) => { void _r; void _x; return p; }) } } : {} };
  };
  const old = strip(taken('old-1', 0)), open = strip(startSession(paper, T(30), { id: 'open-1', seed: 2 }));
  return {
    version: 1,
    sessions: [old, open, { id: 'broken' }, { ...old, id: 'mismatched', result: { ...old.result!, perItem: [...old.result!.perItem].reverse() } }],
    reviews: {
      q2: { questionId: 'q2', status: 'reviewing', correctStreak: 0, lastWrongAt: T(2), attempts: [{ sessionId: 'old-1', revision: 3, correct: false, at: T(2) }] },
      // From a session no longer stored (beyond the cap), from a retry in the book, and naming another revision.
      q1: { questionId: 'q1', status: 'reviewing', correctStreak: 1, lastWrongAt: T(0), attempts: [
        { sessionId: 'dropped', revision: 1, correct: false, at: T(0) }, { revision: 1, correct: true, at: T(1) }, { sessionId: 'old-1', revision: 2, correct: false, at: T(2) }] },
      // A question withdrawn since: its record stays as it was.
      'orig-withdrawn': { questionId: 'orig-withdrawn', status: 'reviewing', correctStreak: 0, attempts: [{ revision: 1, correct: false, at: T(0) }] },
      bad: { questionId: 'bad', status: 'reviewing', correctStreak: 0, attempts: [{ revision: 'one' }] },
    },
  };
}

describe('Phase 4: the version-1 migration', () => {
  const raw = JSON.stringify(legacy());
  it('migrates in memory: version 2, every readable session as it was (no regrading), the original text named for its backup', () => {
    const loaded = parseTrials(raw);
    expect(loaded).toMatchObject({ writable: true, migrated: { from: 1, raw } });
    expect(loaded.store.version).toBe(TRIALS_VERSION);
    expect(loaded.store.sessions).toEqual(legacy().sessions.slice(0, 2));
    expect(loaded.store.sessions[0].result).toEqual((legacy().sessions[0] as ExamSession).result);
  });
  it('isolates the corrupted records in quarantine, exactly as stored, and keeps the rest usable', () => {
    const { quarantine, reviews } = parseTrials(raw).store, l = legacy();
    expect(quarantine).toEqual([
      { id: expect.stringMatching(/^[0-9a-f]{16}$/), kind: 'session', reason: 'session fields', raw: l.sessions[2] },
      { id: expect.stringMatching(/^[0-9a-f]{16}$/), kind: 'session', reason: 'result does not match its items', raw: l.sessions[3] },
      { id: expect.stringMatching(/^[0-9a-f]{16}$/), kind: 'review', key: 'bad', reason: 'review attempts', raw: l.reviews.bad },
    ]);
    expect(Object.keys(reviews).sort()).toEqual(['orig-withdrawn', 'q1', 'q2']);
  });
  it('confirms an attempt’s content only from the stored session it names; otherwise its identity stays unknown', () => {
    const { reviews } = parseTrials(raw).store;
    expect(reviews.q2.attempts[0]).toEqual({ sessionId: 'old-1', revision: 3, correct: false, at: T(2), hash: H2, hashVersion: 2, paperId: 'p', paperVersion: '1.0.0' });
    // No exam: the version-1 session did not record one, and none is filled in from today's bank.
    expect(reviews.q2.attempts[0]).not.toHaveProperty('examId');
    for (const a of reviews.q1.attempts) expect(a).not.toHaveProperty('hash');
    expect(reviews['orig-withdrawn']).toEqual(legacy().reviews['orig-withdrawn']);
  });
  it('is idempotent: reading the same text twice, or reading back what was written, gives the same store', () => {
    const once = parseTrials(raw).store;
    expect(parseTrials(raw).store).toEqual(once);
    const again = parseTrials(JSON.stringify(once));
    expect(again).toEqual({ store: once, writable: true });
    expect(parseTrials(JSON.stringify(again.store)).store).toEqual(once);
  });
  it('rolls back: the version-1 form reads as the same sessions and reviews; version-2 data is newer to a version-1 site', () => {
    const store = parseTrials(raw).store, back = parseTrials(downgradeToV1(store));
    expect(back.migrated?.from).toBe(1);
    expect(back.store.sessions).toEqual(store.sessions);
    expect(back.store.reviews).toEqual(store.reviews);
    // What a version-1 site does with version-2 data: it is newer, so read-only (store.ts T.0 rule, unchanged).
    expect(JSON.parse(JSON.stringify(store)).version).toBeGreaterThan(1);
  });
});

describe('Phase 4: copy-on-write in the browser', () => {
  beforeEach(() => { localStorage.clear(); resetTrialsForTests(); });
  afterEach(() => vi.restoreAllMocks());
  const raw = JSON.stringify(legacy());
  const addOne = (s: TrialStore) => putSession(s, taken('new-1', 60));

  it('reading changes nothing; the first write saves the exact version-1 text first, then version 2', () => {
    localStorage.setItem(TRIALS_KEY, raw);
    const { result } = renderHook(() => useTrials());
    expect(result.current.store.sessions.map(s => s.id)).toEqual(['old-1', 'open-1']);
    expect([localStorage.getItem(TRIALS_KEY), localStorage.getItem(TRIALS_V1_BACKUP_KEY)]).toEqual([raw, null]);
    act(() => { expect(result.current.update(addOne)).toBe(true); });
    expect(localStorage.getItem(TRIALS_V1_BACKUP_KEY)).toBe(raw);
    const stored = JSON.parse(localStorage.getItem(TRIALS_KEY)!) as TrialStore;
    expect([stored.version, stored.sessions.map(s => s.id), stored.quarantine.length]).toEqual([2, ['old-1', 'open-1', 'new-1'], 3]);
    act(() => { result.current.update(s => putSession(s, taken('new-2', 90))); });
    expect(localStorage.getItem(TRIALS_V1_BACKUP_KEY)).toBe(raw);
  });
  it('never replaces an earlier backup', () => {
    localStorage.setItem(TRIALS_KEY, raw);
    localStorage.setItem(TRIALS_V1_BACKUP_KEY, 'earlier');
    const { result } = renderHook(() => useTrials());
    act(() => { result.current.update(addOne); });
    expect(localStorage.getItem(TRIALS_V1_BACKUP_KEY)).toBe('earlier');
  });
  it('when the backup cannot be saved, the version-1 data is not written over (this visit continues in memory)', () => {
    localStorage.setItem(TRIALS_KEY, raw);
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === TRIALS_V1_BACKUP_KEY) throw new DOMException('full', 'QuotaExceededError');
      setItem.call(this, k, v);
    });
    const { result } = renderHook(() => useTrials());
    act(() => { expect(result.current.update(addOne)).toBe(false); });
    expect(localStorage.getItem(TRIALS_KEY)).toBe(raw);
    expect(result.current.saved).toBe(false);
  });
  it('data of a newer version is shown read-only and never written', () => {
    const newer = JSON.stringify({ version: TRIALS_VERSION + 1, sessions: [], reviews: {} });
    localStorage.setItem(TRIALS_KEY, newer);
    const { result } = renderHook(() => useTrials());
    act(() => { expect(result.current.update(addOne)).toBe(false); });
    expect([result.current.writable, localStorage.getItem(TRIALS_KEY)]).toEqual([false, newer]);
  });
});

describe('Phase 4: what the store keeps over time', () => {
  it(`the cap of ${KEPT_PER_PAPER} ended sessions per paper leaves the review book’s attempts (and their identity) in place`, () => {
    let store = emptyTrials();
    for (let i = 0; i < KEPT_PER_PAPER + 2; i++) store = putSession(store, taken(`s${i}`, i * 10, ['b', 'a']));
    expect(store.sessions).toHaveLength(KEPT_PER_PAPER);
    expect(store.reviews.q1.attempts.at(-1)).toMatchObject({ sessionId: `s${KEPT_PER_PAPER + 1}`, hash: H1, hashVersion: 1 });
    expect(store.reviews.q1.attempts[0].sessionId).toBe(`s${KEPT_PER_PAPER + 2 - 5}`);
  });
});
