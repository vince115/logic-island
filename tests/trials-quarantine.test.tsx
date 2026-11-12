// @vitest-environment jsdom
import { act, render, renderHook, screen } from '@testing-library/react';
import { ReviewBook } from '../src/components/trials/review-book';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetTrialsForTests, useTrials } from '../src/components/trials/use-trials';
import { digestOf } from '../src/lib/trials/digest';
import { finish, answerQuestion, startSession, type EnginePaper } from '../src/lib/trials/engine';
import { MAX_QUARANTINE, QUARANTINE_FORMAT, QUARANTINE_PREFIX, preserveRaw, quarantineEntries } from '../src/lib/trials/quarantine';
import { TRIALS_BACKUP_KEY, TRIALS_KEY, TRIALS_V1_BACKUP_KEY, TRIALS_VERSION, emptyTrials, parseTrials, putSession, type TrialStore } from '../src/lib/trials/store';

// Shared Trial System T.3I (docs/exam-system/33 §6–8): unreadable trial data is kept without overwrite, and nothing is
// written over the original until it is kept. Every store here is synthetic; localStorage is jsdom's.
const T = (min: number) => new Date(Date.UTC(2026, 11, 9, 9, min)).toISOString();
const paper: EnginePaper = { id: 'p', version: '1.0.0', examId: 'exam-x', durationMinutes: 30, shuffleOptions: false, passPoints: 10, items: [
  { questionId: 'q1', revision: 1, hash: 'v2-0123456789abcdef', hashVersion: 2, points: 10, optionIds: ['a', 'b'], fixed: [], correct: ['a'], tags: ['t'] },
] };
const taken = (id: string, min: number, pick = 'a') => finish(answerQuestion(startSession(paper, T(min), { id, seed: 1 }), 'q1', pick, T(min + 1)), T(min + 2));
const addOne = (s: TrialStore) => putSession(s, taken(`new-${s.sessions.length}`, 60 + s.sessions.length * 10));
const dump = () => Object.fromEntries(Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!).map(k => [k, localStorage.getItem(k)]));
const entries = () => Object.keys(dump()).filter(k => k.startsWith(QUARANTINE_PREFIX)).sort();
const v2 = (s: Partial<TrialStore>) => JSON.stringify({ ...emptyTrials(), ...s });
/** A fresh page load: forget the module's snapshot and memory, as a reload does. */
function load() { resetTrialsForTests(); return renderHook(() => useTrials()).result; }
const failing = (when: (k: string) => boolean, name = 'QuotaExceededError') => {
  const setItem = Storage.prototype.setItem;
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
    if (when(k)) throw new DOMException('refused', name);
    setItem.call(this, k, v);
  });
};

beforeEach(() => { localStorage.clear(); resetTrialsForTests(); });
afterEach(() => vi.restoreAllMocks());

describe('append-only copies of unreadable data', () => {
  it('1. the first corrupted store is kept, exactly, under its own key before the first write', () => {
    localStorage.setItem(TRIALS_KEY, '{oops');
    const page = load();
    expect(dump()).toEqual({ [TRIALS_KEY]: '{oops' }); // reading changes nothing
    act(() => { expect(page.current.update(addOne)).toBe(true); });
    const [key] = entries();
    expect(key).toBe(QUARANTINE_PREFIX + digestOf('{oops'));
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ format: QUARANTINE_FORMAT, id: digestOf('{oops'), reason: 'unreadable', detectedAt: expect.any(String), length: 5, raw: '{oops' });
    expect(JSON.parse(localStorage.getItem(TRIALS_KEY)!).version).toBe(TRIALS_VERSION);
  });
  it('2. a second, different corruption is kept beside the first; the first is untouched', () => {
    localStorage.setItem(TRIALS_KEY, '{oops');
    { const pg1 = load(); act(() => { pg1.current.update(addOne); }); }
    const first = dump()[entries()[0]];
    localStorage.setItem(TRIALS_KEY, '{"version":0,"other":true}');
    { const pg2 = load(); act(() => { pg2.current.update(addOne); }); }
    expect(entries()).toHaveLength(2);
    expect(localStorage.getItem(entries().find(k => k.endsWith(digestOf('{oops')))!)).toBe(first);
    expect(entries().map(k => JSON.parse(localStorage.getItem(k)!).reason).sort()).toEqual(['unknown-version', 'unreadable']);
  });
  it('3. the same corruption again is the same entry: no second copy, nothing rewritten', () => {
    localStorage.setItem(TRIALS_KEY, '{oops');
    { const pg3 = load(); act(() => { pg3.current.update(addOne); }); }
    const before = dump()[entries()[0]];
    localStorage.setItem(TRIALS_KEY, '{oops');
    { const pg4 = load(); act(() => { expect(pg4.current.update(addOne)).toBe(true); }); }
    expect([entries().length, dump()[entries()[0]]]).toEqual([1, before]);
    expect(preserveRaw(localStorage, '{oops', 'unreadable', T(9))).toEqual({ ok: true, key: entries()[0], existed: true });
  });
  it('a different text under an existing entry\'s name is refused, never written over (a digest collision)', () => {
    localStorage.setItem(QUARANTINE_PREFIX + digestOf('{oops'), JSON.stringify({ format: QUARANTINE_FORMAT, raw: 'something else' }));
    localStorage.setItem(TRIALS_KEY, '{oops');
    const page = load();
    act(() => { expect(page.current.update(addOne)).toBe(false); });
    expect([localStorage.getItem(TRIALS_KEY), page.current.recovery.blocked]).toEqual(['{oops', 'collision']);
  });
});

describe('storage failures never lose the original', () => {
  it('5. a partial write (the copy saved, the store not): the original is in place, and the retry adds no second copy', () => {
    localStorage.setItem(TRIALS_KEY, '{oops');
    const spy = failing(k => k === TRIALS_KEY);
    const page = load();
    act(() => { expect(page.current.update(addOne)).toBe(false); });
    expect([localStorage.getItem(TRIALS_KEY), entries().length, page.current.saved, page.current.recovery.blocked]).toEqual(['{oops', 1, false, 'quota']);
    spy.mockRestore();
    { const pg5 = load(); act(() => { expect(pg5.current.update(addOne)).toBe(true); }); }
    expect(entries()).toHaveLength(1);
  });
  it('6. quota exceeded while keeping the copy: nothing is written over, and the page says so', () => {
    localStorage.setItem(TRIALS_KEY, '{oops');
    failing(k => k.startsWith(QUARANTINE_PREFIX));
    const page = load();
    act(() => { expect(page.current.update(addOne)).toBe(false); });
    expect(dump()).toEqual({ [TRIALS_KEY]: '{oops' });
    expect([page.current.saved, page.current.recovery.blocked, page.current.store.sessions.length]).toEqual([false, 'quota', 1]);
  });
  it('7. storage that cannot be read is never written (an empty read there is not "no data")', () => {
    localStorage.setItem(TRIALS_KEY, v2({ sessions: [taken('kept', 0)] }));
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    const set = vi.spyOn(Storage.prototype, 'setItem');
    const page = load();
    act(() => { expect(page.current.update(addOne)).toBe(false); });
    expect([set.mock.calls.length, page.current.recovery.blocked, page.current.saved]).toEqual([0, 'unreadable-storage', false]);
    vi.restoreAllMocks();
    expect(JSON.parse(localStorage.getItem(TRIALS_KEY)!).sessions.map((s: { id: string }) => s.id)).toEqual(['kept']);
  });
  it('7b. storage that refuses writes (access denied): reported as denied, the original untouched', () => {
    localStorage.setItem(TRIALS_KEY, '{oops');
    failing(() => true, 'SecurityError');
    const page = load();
    act(() => { page.current.update(addOne); });
    expect([page.current.recovery.blocked, localStorage.getItem(TRIALS_KEY)]).toEqual(['denied', '{oops']);
  });
  it(`8. no copy slot left (${MAX_QUARANTINE} kept): nothing deleted, nothing written over, the page keeps this visit in memory`, () => {
    for (let i = 0; i < MAX_QUARANTINE; i++) expect(preserveRaw(localStorage, `{bad ${i}`, 'unreadable', T(i)).ok).toBe(true);
    const before = dump();
    localStorage.setItem(TRIALS_KEY, '{one more');
    const page = load();
    act(() => { expect(page.current.update(addOne)).toBe(false); });
    expect(dump()).toEqual({ ...before, [TRIALS_KEY]: '{one more' });
    expect([page.current.recovery, page.current.store.sessions.length]).toEqual([{ kept: MAX_QUARANTINE, blocked: 'full' }, 1]);
  });
});

describe('recovery reads, never restores', () => {
  it('9. listing the kept copies changes nothing and puts nothing back into the store', () => {
    localStorage.setItem(TRIALS_BACKUP_KEY, '{legacy');
    preserveRaw(localStorage, '{bad', 'unreadable', T(1));
    localStorage.setItem(TRIALS_KEY, v2({}));
    const before = dump(), page = load();
    expect(quarantineEntries(localStorage).map(e => [e.source, e.key, e.length])).toEqual([['legacy-backup', TRIALS_BACKUP_KEY, 7], ['entry', QUARANTINE_PREFIX + digestOf('{bad'), 4]]);
    expect([dump(), page.current.store.sessions, page.current.recovery.kept]).toEqual([before, [], 2]);
  });
  it('10. valid attempts stay usable beside a set-aside record, before and after a write, and when the write is blocked', () => {
    const good = taken('good', 0);
    localStorage.setItem(TRIALS_KEY, v2({ sessions: [good, { id: 'broken' } as never] }));
    const page = load();
    expect(page.current.store.sessions.map(s => s.id)).toEqual(['good']);
    act(() => { page.current.update(addOne); });
    const stored = JSON.parse(localStorage.getItem(TRIALS_KEY)!) as TrialStore;
    expect([stored.sessions.map(s => s.id), stored.quarantine.map(q => q.raw)]).toEqual([['good', 'new-1'], [{ id: 'broken' }]]);
    failing(() => true);
    const blocked = load();
    act(() => { blocked.current.update(addOne); });
    expect(blocked.current.store.sessions.map(s => s.id)).toEqual(['good', 'new-1', 'new-2']);
  });
  it('nothing is logged: kept data may hold what a person answered', () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(m => vi.spyOn(console, m));
    localStorage.setItem(TRIALS_KEY, '{oops');
    failing(k => k === TRIALS_KEY);
    { const pg6 = load(); act(() => { pg6.current.update(addOne); }); }
    expect(spies.map(s => s.mock.calls.length)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('compatibility and migration', () => {
  const v1 = (sessions: unknown[]) => JSON.stringify({ version: 1, sessions, reviews: {} });
  it('4. a corrupted record inside version-1 data: set aside in the store, the version-1 text kept exactly', () => {
    const raw = v1([taken('ok', 0), { id: 'broken' }]);
    localStorage.setItem(TRIALS_KEY, raw);
    { const pg7 = load(); act(() => { pg7.current.update(addOne); }); }
    const stored = JSON.parse(localStorage.getItem(TRIALS_KEY)!) as TrialStore;
    expect([localStorage.getItem(TRIALS_V1_BACKUP_KEY), stored.sessions.map(s => s.id), stored.quarantine.map(q => [q.reason, q.raw])])
      .toEqual([raw, ['ok', 'new-1'], [['session fields', { id: 'broken' }]]]);
  });
  it('11. the slots of earlier versions are read, never changed; another version-1 text gets its own copy', () => {
    localStorage.setItem(TRIALS_BACKUP_KEY, '{legacy');
    localStorage.setItem(TRIALS_V1_BACKUP_KEY, v1([]));
    const second = v1([taken('again', 0)]);
    localStorage.setItem(TRIALS_KEY, second);
    { const pg8 = load(); act(() => { expect(pg8.current.update(addOne)).toBe(true); }); }
    expect([localStorage.getItem(TRIALS_BACKUP_KEY), localStorage.getItem(TRIALS_V1_BACKUP_KEY)]).toEqual(['{legacy', v1([])]);
    expect(entries().map(k => JSON.parse(localStorage.getItem(k)!)).map(e => [e.reason, e.raw])).toEqual([['version-1-again', second]]);
    // The legacy slot already holding a corrupted text counts as its copy.
    localStorage.setItem(TRIALS_KEY, '{legacy');
    { const pg9 = load(); act(() => { expect(pg9.current.update(addOne)).toBe(true); }); }
    expect(entries()).toHaveLength(1);
  });
  it('12. a T.3H version-2 store (quarantine without ids) reads as before, its records unchanged, now with ids', () => {
    const raw = v2({ sessions: [taken('ok', 0)], quarantine: [{ kind: 'session', reason: 'session fields', raw: { id: 'x' } }] });
    const { store } = parseTrials(raw);
    expect(store.quarantine).toEqual([{ id: expect.stringMatching(/^[0-9a-f]{16}$/), kind: 'session', reason: 'session fields', raw: { id: 'x' } }]);
    expect(store.sessions.map(s => s.id)).toEqual(['ok']);
  });
  it('13. migration and quarantine ids are idempotent: the same text always reads the same, before and after a write', () => {
    const raw = v1([taken('ok', 0), { id: 'broken' }, { id: 'broken' }]);
    expect(parseTrials(raw)).toEqual(parseTrials(raw));
    expect(parseTrials(raw).store.quarantine).toHaveLength(1); // the same record twice is one record
    localStorage.setItem(TRIALS_KEY, raw);
    { const pg10 = load(); act(() => { pg10.current.update(s => s); }); }
    expect(localStorage.getItem(TRIALS_KEY)).toBe(raw); // no change, no write
    { const pg11 = load(); act(() => { pg11.current.update(addOne); }); }
    const id = parseTrials(raw).store.quarantine[0].id;
    expect(parseTrials(localStorage.getItem(TRIALS_KEY)).store.quarantine.map(q => q.id)).toEqual([id]);
  });
  it('14. no historical score changes: a graded result is the same after corruption handling, migration and writes', () => {
    const graded = taken('graded', 0, 'b');
    localStorage.setItem(TRIALS_KEY, v1([graded, { id: 'broken' }]));
    { const pg12 = load(); act(() => { pg12.current.update(addOne); }); }
    { const pg13 = load(); act(() => { pg13.current.update(s => putSession(s, { ...graded, result: { ...graded.result!, score: 999 } })); }); }
    const after = JSON.parse(localStorage.getItem(TRIALS_KEY)!) as TrialStore;
    expect(after.sessions.find(s => s.id === 'graded')!.result).toEqual(graded.result);
  });
});

describe('the page says what was kept, not what it holds', () => {
  it('the review book counts the kept copies and set-aside records; their content is not on the page', () => {
    preserveRaw(localStorage, '{"secret answer":"b"', 'unreadable', T(1));
    localStorage.setItem(TRIALS_KEY, v2({ quarantine: [{ kind: 'review', key: 'q9', reason: 'review fields', raw: { private: 'note' } }] }));
    resetTrialsForTests();
    const { container } = render(<ReviewBook questions={[]}/>);
    expect(screen.getByRole('note').textContent).toBe('有 2 筆無法讀取的作答資料原樣保留在這個瀏覽器，沒有被使用，也沒有被刪除。');
    expect(container.textContent).not.toMatch(/secret answer|private|note"/);
  });
});

