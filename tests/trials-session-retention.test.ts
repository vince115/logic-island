import { describe, expect, it } from 'vitest';
import { trialBank } from '../src/content/trials';
import { unresumable } from '../src/lib/trials/draw';
import { answerQuestion, finish, startSession, type EnginePaper } from '../src/lib/trials/engine';
import type { PaperVersions } from '../src/lib/trials/paper-versions';
import { TRIALS_KEY, emptyTrials, parseTrials, putSession } from '../src/lib/trials/store';
import registryFile from '../src/content/trials/paper-versions.json';

// Shared Trial System T.3G (docs/exam-system/31 §8): what a withdrawal does to sessions — before one starts, while it
// is open, after it is submitted — and to the review book. Engine papers are built from the paper version registry.
const registry = registryFile as PaperVersions;
const APCS = 'apcs-reading-mock-a', WITHDRAWN = 'orig-apcs-read-03';

describe('Phase 6, 8: sessions and results across a withdrawal', () => {
  // The engine paper of version 1.0.0, from the registry and the questions (what the page served before).
  const qs = new Map(trialBank.questions.map(q => [q.id, q]));
  const engineOf = (version: string, items: { questionId: string; revision: number; hash: string; points: number }[]): EnginePaper => ({
    id: APCS, version, durationMinutes: 21, shuffleOptions: false, passPoints: 42,
    items: items.map(it => { const rev = qs.get(it.questionId)!.revisions.find(r => r.revision === it.revision)!; return { ...it, tags: qs.get(it.questionId)!.tags, optionIds: (rev.options ?? []).map(o => o.id), fixed: [], correct: rev.answer?.kind === 'choice' ? rev.answer.correct : [] }; }),
  });
  const v1 = engineOf('1.0.0', registry.versions[0].items);
  const maintenance = { ...v1, items: v1.items.filter(i => i.questionId !== WITHDRAWN) };
  const v11 = engineOf('1.1.0', registry.versions[0].items.filter(i => i.questionId !== WITHDRAWN));
  const T = '2026-12-09T09:00:00.000Z';
  const taken = (() => { let s = startSession(v1, T, { id: 's1', seed: 1 }); for (const it of s.items) s = answerQuestion(s, it.questionId, it.correct[0], T); return finish(s, '2026-12-09T09:10:00.000Z'); })();

  it('revocation before a session: the paper under maintenance serves no withdrawn item (and the runner offers no start)', () => {
    expect(maintenance.items.map(i => i.questionId)).not.toContain(WITHDRAWN);
    expect(maintenance.items).toHaveLength(6);
  });
  it('revocation during a session: it is not resumed, neither under maintenance nor on the new version; nothing is swapped in', () => {
    const open = startSession(v1, T, { id: 's2', seed: 2 });
    expect(unresumable(open, maintenance, true)).toEqual({ items: [WITHDRAWN] });
    expect(unresumable(open, v11, true)).toEqual({ items: [WITHDRAWN], version: { from: '1.0.0', to: '1.1.0' } });
    expect(unresumable(open, v1, true)).toEqual({ items: [] });
    // A generated paper keeps its own version semantics: only its drawn items count.
    expect(unresumable(open, { ...v1, version: 'other' }, false)).toEqual({ items: [] });
  });
  it('revocation after submission: the result is frozen and the session still names version 1.0.0 exactly', () => {
    expect(taken.result).toMatchObject({ score: 70, maxScore: 70, passed: true, correct: 7 });
    const v = registry.versions.find(x => x.paperId === taken.paperId && x.version === taken.paperVersion)!;
    expect(taken.items.map(({ questionId, revision, hash, points }) => ({ questionId, revision, hash, points }))).toEqual(v.items);
  });
  it('historical results and the review book survive in storage, whatever the bank holds now', () => {
    const wrong = (() => { let s = startSession(v1, T, { id: 's3', seed: 3 }); s = answerQuestion(s, WITHDRAWN, s.items.find(i => i.questionId === WITHDRAWN)!.optionOrder.find(o => !s.items.find(i => i.questionId === WITHDRAWN)!.correct.includes(o))!, T); return finish(s, '2026-12-09T09:05:00.000Z'); })();
    const store = putSession(putSession(emptyTrials(), taken), wrong);
    const back = parseTrials(JSON.stringify(store)).store;
    expect(back.sessions.map(s => [s.id, s.paperVersion, s.result!.score]).sort()).toEqual([['s1', '1.0.0', 70], ['s3', '1.0.0', 0]]);
    expect(back.reviews[WITHDRAWN]).toMatchObject({ questionId: WITHDRAWN, status: 'reviewing' });
    expect(TRIALS_KEY).toBe('logic-island.trials');
  });
});
