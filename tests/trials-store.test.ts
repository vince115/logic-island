import { describe, expect, it } from 'vitest';
import { answerQuestion, finish, startSession, type EnginePaper } from '../src/lib/trials/engine';
import { KEPT_PER_PAPER, TRIALS_VERSION, emptyTrials, endedSessionsOf, openSessionOf, parseTrials, putSession } from '../src/lib/trials/store';

// Shared Trial System T.0: trial records in localStorage (src/lib/trials/store.ts), following progress.ts's rules.
const T = (min: number) => new Date(Date.UTC(2026, 10, 3, 9, min)).toISOString();
const paper: EnginePaper = { id: 'p', version: '1.0.0', durationMinutes: 10, shuffleOptions: false,
  items: [{ questionId: 'q1', revision: 1, hash: 'h', points: 10, optionIds: ['a', 'b'], fixed: [], correct: ['a'], tags: ['t'] }] };
const session = (id: string, min: number) => startSession(paper, T(min), { id, seed: 1 });

describe('trial store (T.0)', () => {
  it('reads nothing as empty, round-trips its own data, and keeps a session in progress', () => {
    expect(parseTrials(null)).toEqual({ store: emptyTrials(), writable: true });
    const store = putSession(emptyTrials(), answerQuestion(session('s1', 0), 'q1', 'a', T(1)));
    const back = parseTrials(JSON.stringify(store));
    expect(back).toEqual({ store, writable: true });
    expect(openSessionOf(back.store, 'p')?.id).toBe('s1');
  });

  it('backs up unreadable data, and never writes over a newer version', () => {
    expect(parseTrials('{oops')).toEqual({ store: emptyTrials(), writable: true, backup: '{oops', backupReason: 'unreadable' });
    expect(parseTrials('{"sessions":[]}')).toMatchObject({ writable: true, backup: '{"sessions":[]}', backupReason: 'unknown-version' });
    expect(parseTrials(JSON.stringify({ version: TRIALS_VERSION + 1, sessions: [] }))).toEqual({ store: emptyTrials(), writable: false });
  });

  it('sets malformed sessions and reviews aside (T.3H: kept in quarantine, never dropped) and keeps the rest', () => {
    const good = session('ok', 0);
    const raw = JSON.stringify({ version: TRIALS_VERSION, sessions: [good, { id: 'bad' }, { ...good, id: 'ended-without-result', status: 'submitted' }],
      reviews: { q1: { questionId: 'q1', status: 'reviewing', correctStreak: 0, attempts: [] }, q2: { questionId: 'other', status: 'new', correctStreak: 0, attempts: [] }, q3: 7 } });
    const { store } = parseTrials(raw);
    expect(store.sessions.map(s => s.id)).toEqual(['ok']);
    expect(Object.keys(store.reviews)).toEqual(['q1']);
    expect(store.quarantine.map(x => [x.kind, x.key, x.reason])).toEqual([['session', undefined, 'session fields'], ['session', undefined, 'ended without a result'],
      ['review', 'q2', 'review filed under another question'], ['review', 'q3', 'review fields']]);
  });

  it('folds a session into the review book once, when it is first graded', () => {
    const s = answerQuestion(session('s1', 0), 'q1', 'b', T(1));
    let store = putSession(emptyTrials(), s);
    expect(store.reviews).toEqual({});
    const done = finish(s, T(2));
    store = putSession(store, done);
    expect(store.reviews.q1).toMatchObject({ status: 'reviewing', attempts: [{ sessionId: 's1', correct: false }] });
    store = putSession(store, done);
    expect(store.reviews.q1.attempts).toHaveLength(1);
  });

  it(`keeps the newest ${KEPT_PER_PAPER} ended sessions per paper and every unfinished one`, () => {
    let store = emptyTrials();
    for (let i = 0; i < KEPT_PER_PAPER + 3; i++) store = putSession(store, finish(session(`s${i}`, i * 20), T(i * 20 + 1)));
    store = putSession(store, session('open', 999));
    expect(endedSessionsOf(store, 'p')).toHaveLength(KEPT_PER_PAPER);
    expect(endedSessionsOf(store, 'p')[0].id).toBe(`s${KEPT_PER_PAPER + 2}`);
    expect(openSessionOf(store, 'p')?.id).toBe('open');
  });
});
