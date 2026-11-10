import { describe, expect, it } from 'vitest';
import { PROGRESS_VERSION, empty, markRead, parse, quizPassed, recordQuiz, start, statusOf } from '../src/lib/progress';

// Phase E.1: learning progress in localStorage (src/lib/progress.ts).
const T = (n: number) => new Date(Date.UTC(2026, 10, 1, 10, n)).toISOString();

describe('progress status and completion (E.1)', () => {
  it('goes not started → in progress → completed only when read and quiz passed', () => {
    let p = empty();
    expect(statusOf(p.lessons.F01)).toBe('not-started');
    p = start(p, 'F01', T(0));
    expect(statusOf(p.lessons.F01)).toBe('in-progress');
    p = recordQuiz(p, 'F01', 3, 4, T(1));
    expect(statusOf(p.lessons.F01)).toBe('in-progress');  // not read yet
    p = markRead(p, 'F01', T(2));
    expect(p.lessons.F01).toMatchObject({ startedAt: T(0), readAt: T(2), quiz: { correct: 3, total: 4 }, completedAt: T(2) });
    expect(statusOf(p.lessons.F01)).toBe('completed');
  });

  it('needs two thirds of the quiz, keeps the best attempt, and never un-completes', () => {
    expect([quizPassed({ correct: 1, total: 3, at: T(0) }), quizPassed({ correct: 2, total: 3, at: T(0) }), quizPassed({ correct: 2, total: 4, at: T(0) }), quizPassed({ correct: 3, total: 4, at: T(0) })])
      .toEqual([false, true, false, true]);
    let p = markRead(start(empty(), 'F02', T(0)), 'F02', T(1));
    p = recordQuiz(p, 'F02', 1, 4, T(2));
    expect(statusOf(p.lessons.F02)).toBe('in-progress');
    p = recordQuiz(p, 'F02', 4, 4, T(3));
    expect(p.lessons.F02).toMatchObject({ quiz: { correct: 4 }, completedAt: T(3) });
    p = recordQuiz(p, 'F02', 0, 4, T(4));
    expect(p.lessons.F02).toMatchObject({ quiz: { correct: 4, at: T(3) }, completedAt: T(3) });
    expect(start(p, 'F02', T(5)).lessons.F02.startedAt).toBe(T(0));
  });

  it('only touches the lesson it is given', () => {
    const before = start(empty(), 'F01', T(0));
    const after = recordQuiz(before, 'F02', 3, 3, T(1));
    expect(after.lessons.F01).toBe(before.lessons.F01);
    expect(before.lessons.F02).toBeUndefined();
  });
});

describe('progress storage and migration (E.1)', () => {
  it('reads nothing as empty and writable', () => {
    expect(parse(null)).toEqual({ progress: { version: PROGRESS_VERSION, lessons: {} }, writable: true });
  });

  it('reads version 1 and drops only malformed entries', () => {
    const raw = JSON.stringify({ version: 1, lessons: { F01: { startedAt: T(0), quiz: { correct: 3, total: 4, at: T(1) } }, F02: { quiz: 'x' }, F03: { startedAt: T(2), quiz: { correct: 9, total: 4, at: T(2) } } } });
    expect(parse(raw)).toEqual({ progress: { version: 1, lessons: { F01: { startedAt: T(0), quiz: { correct: 3, total: 4, at: T(1) } }, F03: { startedAt: T(2) } } }, writable: true });
  });

  it('keeps unreadable data as a backup instead of losing it', () => {
    for (const raw of ['{not json', JSON.stringify({ lessons: { F01: {} } }), JSON.stringify([1, 2])]) {
      expect(parse(raw), raw).toEqual({ progress: empty(), writable: true, backup: raw });
    }
  });

  it('never overwrites data from a newer version', () => {
    expect(parse(JSON.stringify({ version: 2, lessons: { F01: { done: true } } }))).toEqual({ progress: empty(), writable: false });
  });
});
