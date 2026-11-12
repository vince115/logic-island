import { describe, expect, it } from 'vitest';
import { answerQuestion, exactMatch, finish, grade, startSession, toggleOption, type EnginePaper, type ExamSession } from '../src/lib/trials/engine';
import { emptyTrials, parseTrials, putSession } from '../src/lib/trials/store';

// Shared Trial System T.3B (docs/exam-system/26 §3): multiple-response items in the shared engine — selecting at most
// `select` options, Logic Island's exact-match grading (no partial credit), persistence and the review book.
const T0 = '2026-12-01T09:00:00.000Z', later = (min: number) => new Date(Date.parse(T0) + min * 60_000).toISOString();

const paper: EnginePaper = {
  id: 'mr-test', version: '1', durationMinutes: 10, shuffleOptions: false, items: [
    { questionId: 'mr', revision: 1, hash: 'h', points: 1, optionIds: ['a', 'b', 'c', 'd', 'e'], fixed: [], correct: ['b', 'd'], tags: [], select: 2 },
    { questionId: 'sc', revision: 1, hash: 'h', points: 1, optionIds: ['a', 'b', 'c', 'd'], fixed: [], correct: ['c'], tags: [] },
  ],
};
const fresh = () => startSession(paper, T0, { id: 's', seed: 1 });
const pick = (s: ExamSession, ...ids: string[]) => ids.reduce((x, id) => toggleOption(x, 'mr', id, later(1)), s);
const mrResult = (s: ExamSession) => grade(s, later(2)).perItem[0];

describe('multiple-response: selecting', () => {
  it('freezes the select count into the session and caps the selection at it', () => {
    const s = pick(fresh(), 'b', 'a', 'd');
    expect(s.items[0].select).toBe(2);
    expect(s.items[1].select).toBeUndefined();
    expect(s.items[0].answer?.selected).toEqual(['a', 'b']);
  });
  it('clears an option when toggled again, and the item is unanswered once nothing is left', () => {
    const s = pick(fresh(), 'b', 'b');
    expect(s.items[0].answer).toBeUndefined();
  });
  it('keeps the shown order whatever order the clicks came in', () => {
    expect(pick(fresh(), 'd', 'b').items[0].answer?.selected).toEqual(['b', 'd']);
  });
  it('ignores unknown options, answerQuestion on a multiple-response item, and anything after the time is up', () => {
    const s = fresh();
    expect(toggleOption(s, 'mr', 'z', later(1))).toBe(s);
    expect(answerQuestion(s, 'mr', 'b', later(1))).toBe(s);
    expect(toggleOption(s, 'mr', 'b', later(11))).toBe(s);
  });
  it('treats toggleOption on a single-answer item as choosing it', () => {
    const s = toggleOption(toggleOption(fresh(), 'sc', 'a', later(1)), 'sc', 'c', later(1));
    expect(s.items[1].answer?.selected).toEqual(['c']);
  });
});

describe('multiple-response: exact-match grading (Logic Island rule, no partial credit)', () => {
  it('scores only the exact set of correct options, in any order', () => {
    expect(mrResult(pick(fresh(), 'd', 'b'))).toMatchObject({ correct: true, earned: 1, answered: true });
    expect(exactMatch(['d', 'b'], ['b', 'd'])).toBe(true);
  });
  it('gives nothing for too few, a wrong one, or none', () => {
    expect(mrResult(pick(fresh(), 'b'))).toMatchObject({ correct: false, earned: 0, answered: true });
    expect(mrResult(pick(fresh(), 'b', 'c'))).toMatchObject({ correct: false, earned: 0 });
    expect(mrResult(fresh())).toMatchObject({ correct: false, earned: 0, answered: false });
  });
  it('gives nothing for too many, duplicates beyond the set, or an option not on the item (stored data edited by hand)', () => {
    const forged = (selected: string[]): ExamSession => ({ ...fresh(), items: fresh().items.map((i, n) => n ? i : { ...i, answer: { selected, at: later(1) } }) });
    expect(mrResult(forged(['b', 'd', 'e']))).toMatchObject({ correct: false, earned: 0 });
    expect(mrResult(forged(['b', 'b']))).toMatchObject({ correct: false });
    expect(mrResult(forged(['b', 'd', 'x']))).toMatchObject({ correct: false });
    // A repeated correct option collapses: the set is still exactly {b, d}.
    expect(mrResult(forged(['b', 'd', 'd']))).toMatchObject({ correct: true });
  });
  it('leaves single-answer grading as it was', () => {
    const s = answerQuestion(fresh(), 'sc', 'c', later(1));
    expect(grade(s, later(2)).perItem[1]).toMatchObject({ correct: true, earned: 1 });
    expect(grade(answerQuestion(fresh(), 'sc', 'a', later(1)), later(2)).perItem[1]).toMatchObject({ correct: false, earned: 0 });
  });
});

describe('multiple-response: session persistence and the review book', () => {
  it('survives a reload with its selection and select count, and grades the same', () => {
    const s = pick(fresh(), 'd', 'b');
    const back = parseTrials(JSON.stringify(putSession(emptyTrials(), s))).store.sessions[0];
    expect(back.items[0]).toMatchObject({ select: 2, answer: { selected: ['b', 'd'] } });
    expect(grade(back, later(2))).toEqual(grade(s, later(2)));
  });
  it('drops a stored session whose select count is not a valid multiple-response count', () => {
    for (const select of [1, 5, 2.5]) {
      const s = { ...fresh(), items: fresh().items.map((i, n) => n ? i : { ...i, select }) };
      expect(parseTrials(JSON.stringify(putSession(emptyTrials(), s))).store.sessions).toEqual([]);
    }
  });
  it('puts a wrong multiple-response answer in the review book', () => {
    const done = finish(pick(fresh(), 'b', 'c'), later(3));
    expect(putSession(emptyTrials(), done).reviews.mr).toMatchObject({ status: 'reviewing' });
  });
});

