import { describe, expect, it } from 'vitest';
import { abandon, answerQuestion, ENGINE_VERSION, finish, isOver, remaining, startSession, unanswered, type EnginePaper } from '../src/lib/trials/engine';
import { inReview, recordAttempt, recordSession, type Reviews } from '../src/lib/trials/review';
import { mulberry32, shuffleIds } from '../src/lib/trials/shuffle';

// Shared Trial System T.0: the exam engine and review rules as pure functions (docs/exam-system/05 §4).
const T = (min: number, sec = 0) => new Date(Date.UTC(2026, 10, 3, 9, min, sec)).toISOString();
const item = (id: string, correct: string, points = 10, tags = ['prog.loops.for']) =>
  ({ questionId: id, revision: 1, hash: `h-${id}`, points, optionIds: ['a', 'b', 'c', 'd'], fixed: [], correct: [correct], tags });
const paper: EnginePaper = { id: 'p', version: '1.0.0', durationMinutes: 10, passPoints: 20, shuffleOptions: false,
  items: [item('q1', 'a'), item('q2', 'b', 2.5, ['prog.recursion']), item('q3', 'c', 10, ['prog.loops.for', 'prog.recursion'])] };
const start = (p = paper) => startSession(p, T(0), { id: 's1', seed: 7 });

describe('exam session (T.0)', () => {
  it('starts with a frozen snapshot and an absolute deadline', () => {
    const s = start();
    expect(s).toMatchObject({ status: 'in-progress', startedAt: T(0), deadline: T(10), paperVersion: '1.0.0', passPoints: 20 });
    expect(s.items.map(i => [i.questionId, i.hash, i.correct[0], i.optionOrder.join('')])).toEqual([['q1', 'h-q1', 'a', 'abcd'], ['q2', 'h-q2', 'b', 'abcd'], ['q3', 'h-q3', 'c', 'abcd']]);
    expect(remaining(s, T(4))).toBe(6 * 60_000);
    expect(unanswered(s)).toBe(3);
  });

  it('records answers until the deadline and ignores unknown options and later answers', () => {
    let s = answerQuestion(start(), 'q1', 'a', T(1));
    s = answerQuestion(s, 'q1', 'b', T(2));
    expect(s.items[0].answer).toEqual({ selected: ['b'], at: T(2) });
    expect(answerQuestion(s, 'q1', 'z', T(3))).toBe(s);
    expect(answerQuestion(s, 'nope', 'a', T(3))).toBe(s);
    expect(answerQuestion(s, 'q2', 'b', T(10))).toBe(s);   // time is up
    expect(isOver(s, T(10))).toBe(true);
  });

  it('grades on submit: points in hundredths, unanswered as zero, by tag, pass mark', () => {
    let s = start();
    s = answerQuestion(s, 'q1', 'a', T(1));
    s = answerQuestion(s, 'q2', 'b', T(2));
    const done = finish(s, T(5));
    expect(done.status).toBe('submitted');
    expect(done.result).toMatchObject({ score: 12.5, maxScore: 22.5, passPoints: 20, passed: false, answered: 2, correct: 2, engineVersion: ENGINE_VERSION, gradedAt: T(5) });
    expect(done.result!.byTag).toEqual({ 'prog.loops.for': { earned: 10, max: 20 }, 'prog.recursion': { earned: 2.5, max: 12.5 } });
    expect(done.result!.perItem[2]).toEqual({ questionId: 'q3', earned: 0, max: 10, correct: false, answered: false, revision: 1, hash: 'h-q3' }); // T.3H: what it was graded on
    expect(finish(done, T(6))).toBe(done);                  // the result is frozen
    expect(answerQuestion(done, 'q3', 'c', T(6))).toBe(done);
  });

  it('expires at the deadline, graded on what was answered in time', () => {
    const s = finish(answerQuestion(start(), 'q3', 'c', T(9, 59)), T(30));
    expect(s).toMatchObject({ status: 'expired', endedAt: T(10), result: { score: 10, gradedAt: T(10) } });
  });

  it('abandons without a result', () => {
    const s = abandon(start(), T(2));
    expect(s).toMatchObject({ status: 'abandoned', endedAt: T(2) });
    expect(s.result).toBeUndefined();
  });

  it('shuffles options reproducibly and keeps fixed options in place', () => {
    const order = (seed: number) => shuffleIds(['a', 'b', 'c', 'd', 'e'], ['e'], mulberry32(seed));
    expect(order(1)).toEqual(order(1));
    expect(order(1).at(-1)).toBe('e');
    expect(new Set(Array.from({ length: 20 }, (_, i) => order(i).join(''))).size).toBeGreaterThan(5);
    const s = start({ ...paper, shuffleOptions: true });
    expect(s.items.map(i => i.optionOrder.join(''))).toEqual(start({ ...paper, shuffleOptions: true }).items.map(i => i.optionOrder.join('')));
    expect(s.items.every(i => [...i.optionOrder].sort().join('') === 'abcd')).toBe(true);
  });
});

describe('review book rules (T.0)', () => {
  const at = (n: number) => ({ revision: 1, at: T(n) });
  it('a miss enters the book; two right answers in a row master it; a later miss brings it back', () => {
    let r: Reviews = recordAttempt({}, 'q', { ...at(1), correct: false });
    expect(r.q).toMatchObject({ status: 'reviewing', correctStreak: 0, lastWrongAt: T(1) });
    r = recordAttempt(r, 'q', { ...at(2), correct: true });
    expect(r.q.status).toBe('reviewing');
    r = recordAttempt(r, 'q', { ...at(3), correct: true });
    expect(r.q).toMatchObject({ status: 'mastered', correctStreak: 2 });
    r = recordAttempt(r, 'q', { ...at(4), correct: false });
    expect(r.q).toMatchObject({ status: 'reviewing', correctStreak: 0, lastWrongAt: T(4) });
    expect(r.q.attempts).toHaveLength(4);
  });

  it('a question never missed stays out of the book; attempts are capped', () => {
    let r: Reviews = {};
    for (let i = 0; i < 7; i++) r = recordAttempt(r, 'q', { ...at(i), correct: true });
    expect(r.q.status).toBe('new');
    expect(r.q.attempts).toHaveLength(5);
    expect(inReview(r)).toEqual([]);
  });

  it('only graded sessions count', () => {
    const s = answerQuestion(start(), 'q1', 'd', T(1));
    expect(recordSession({}, abandon(s, T(2)))).toEqual({});
    const book = recordSession({}, finish(s, T(2)));
    expect(Object.keys(book).sort()).toEqual(['q1', 'q2', 'q3']);
    expect(inReview(book).map(x => x.questionId).sort()).toEqual(['q1', 'q2', 'q3']);
    // T.3H: the attempt keeps the content it answered, where, and what was chosen ('h-q1' is no real hash form: no version).
    expect(book.q1.attempts[0]).toEqual({ sessionId: 's1', revision: 1, hash: 'h-q1', correct: false, at: T(2), paperId: 'p', paperVersion: '1.0.0',
      answer: { selected: ['d'], correct: ['a'], order: ['a', 'b', 'c', 'd'] } });
  });
});
