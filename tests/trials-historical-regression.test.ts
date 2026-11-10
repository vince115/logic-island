import { describe, expect, it } from 'vitest';
import { playableQuestions, trialBank } from '../src/content/trials';
import { revisionHash } from '../src/content/trials/schema';
import { finish, hashVersionOf, startSession, type EnginePaper, type ExamSession } from '../src/lib/trials/engine';
import { identityOf, type ReviewRecord } from '../src/lib/trials/review';
import { emptyTrials, parseTrials, putSession } from '../src/lib/trials/store';
import { paperView, reviewViews } from '../src/lib/trials/views';
import manifest from '../src/content/trials/assessment-manifest.json';

// Shared Trial System T.3H (docs/exam-system/32 §10): the regression across historical attempts — the identity matrix
// of the review book, cross-exam isolation, hash mismatches, and how the new identity fields agree with the ledger's
// and manifest's own hashes. The other T.3H files cover migration, the paper policy, the pages and CI.
const entries = (manifest as { entries: Record<string, { hashVersion: number; contentHash: string }> }).entries;
const now = { revision: 3, hash: 'v2-0123456789abcdef', exams: ['ccarf'] };
const record = (...attempts: Partial<ReviewRecord['attempts'][number]>[]): ReviewRecord =>
  ({ questionId: 'q', status: 'reviewing', correctStreak: 0, attempts: attempts.map(a => ({ revision: 3, correct: false, at: '2026-12-09T09:00:00.000Z', ...a })) });

describe('2. the review book’s identity matrix (identityOf)', () => {
  it.each([
    ['current: the same content', record({ hash: now.hash, examId: 'ccarf' }), { state: 'current' }],
    ['current: an explanation-only revision under the legacy hash keeps the hash', record({ revision: 2, hash: now.hash }), { state: 'current' }],
    ['revised: another revision, other content', record({ revision: 2, hash: 'v2-ffffffffffffffff' }), { state: 'revised', from: 2, to: 3 }],
    ['revised: another revision, recorded without a hash', record({ revision: 1 }), { state: 'revised', from: 1, to: 3 }],
    ['legacy: the same revision without a hash, never filled in', record({}), { state: 'legacy', revision: 3 }],
    ['mismatch: the same revision with other content', record({ hash: 'v2-ffffffffffffffff' }), { state: 'mismatch', revision: 3 }],
    ['other exam: recorded in an exam the question is not in', record({ hash: now.hash, examId: 'ipas-aiap-basic' }), { state: 'other-exam', recorded: 'ipas-aiap-basic' }],
    ['other exam: judged by the latest attempt that names one', record({ hash: now.hash, examId: 'ipas-aiap-basic' }, { hash: now.hash }), { state: 'other-exam', recorded: 'ipas-aiap-basic' }],
    ['latest attempt decides: an old wrong revision, then a retry on today’s', record({ revision: 1 }, { hash: now.hash }), { state: 'current' }],
  ])('%s', (_name, r, expected) => expect(identityOf(r, now)).toEqual(expected));
  it('withdrawn: no question on the site', () => expect(identityOf(record({ hash: now.hash }), undefined)).toEqual({ state: 'withdrawn' }));
});

describe('8–9. cross-exam isolation and hash mismatches in storage', () => {
  const paper: EnginePaper = { id: 'p', version: '1.0.0', examId: 'ccarf', durationMinutes: 10, shuffleOptions: false,
    items: [{ questionId: 'ccarf-x', revision: 1, hash: 'v2-0123456789abcdef', hashVersion: 2, points: 1, optionIds: ['a', 'b'], fixed: [], correct: ['a'], tags: [] }] };
  const done = finish(startSession(paper, '2026-12-09T09:00:00.000Z', { id: 's', seed: 1 }), '2026-12-09T09:01:00.000Z');
  const parsed = (s: ExamSession) => parseTrials(JSON.stringify({ ...emptyTrials(), sessions: [s] })).store;
  it('a result graded on other content than its item (hash or revision), or naming another question, is set aside, never shown', () => {
    for (const perItem of [[{ ...done.result!.perItem[0], hash: 'v2-ffffffffffffffff' }], [{ ...done.result!.perItem[0], revision: 2 }], [{ ...done.result!.perItem[0], questionId: 'ipas-x' }]]) {
      const store = parsed({ ...done, result: { ...done.result!, perItem } });
      expect([store.sessions.length, store.quarantine[0]?.reason]).toEqual([0, 'result does not match its items']);
    }
    expect(parsed(done).sessions).toHaveLength(1);
  });
  it('an item with an unknown hash version is set aside; the exam a session froze stays with it', () => {
    expect(parsed({ ...done, items: [{ ...done.items[0], hashVersion: 3 as 2 }] }).quarantine[0].reason).toBe('session items');
    expect(putSession(emptyTrials(), done).reviews['ccarf-x'].attempts[0]).toMatchObject({ examId: 'ccarf', hash: 'v2-0123456789abcdef', hashVersion: 2 });
  });
});

describe('13. the identity an attempt freezes is the ledger’s and manifest’s identity', () => {
  it('every playable question’s page hash and hash version equal its manifest entry (the hash publication records)', () => {
    for (const q of reviewViews()) {
      const e = entries[`${q.id}@${q.revision}`];
      expect([q.hash, q.hashVersion, hashVersionOf(q.hash)], q.id).toEqual([e.contentHash, e.hashVersion, e.hashVersion]);
    }
    expect(reviewViews()).toHaveLength(playableQuestions.length);
  });
  it('every fixed paper’s engine items freeze the exam and the registered hashes', () => {
    for (const p of trialBank.papers.filter(x => x.kind === 'fixed')) {
      const v = paperView(p.id)!;
      expect(v.engine.examId).toBe(v.examId);
      for (const it of v.engine.items) {
        const q = trialBank.questions.find(x => x.id === it.questionId)!, rev = q.revisions.find(r => r.revision === it.revision)!;
        expect([it.hash, it.hashVersion], it.questionId).toEqual([revisionHash(rev), rev.hashVersion ?? 1]);
      }
    }
  });
});

describe('10. no unpublished question reaches the history pages', () => {
  it('the review book and every fixed paper page hold published questions only', () => {
    const published = new Set(playableQuestions.map(q => q.id));
    expect(reviewViews().every(q => published.has(q.id))).toBe(true);
    for (const p of trialBank.papers.filter(x => x.kind === 'fixed')) expect(paperView(p.id)!.questions.every(q => published.has(q.id))).toBe(true);
    expect(trialBank.questions.filter(q => q.id.startsWith('ccarf-') || q.id.startsWith('ipas-')).some(q => published.has(q.id))).toBe(false);
  });
});
