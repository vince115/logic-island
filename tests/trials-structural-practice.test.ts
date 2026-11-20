import { describe, expect, it } from 'vitest';
import { sourceById, tagById, trialBank } from '../src/content/trials';
import { mockBlueprints } from '../src/content/trials/mock-exams';
import { FREE_CODE, currentRevisionOf, revisionHash, type Question } from '../src/content/trials/schema';
import { DECISIONS_FORMAT, STRUCTURAL, checkLedger, committedLedger, examResolver, planDecisions } from '../src/lib/trials/lifecycle';
import { assembleMockPapers } from '../src/lib/trials/mock-assembly';
import { FREE_COUNT, practicePapers } from '../src/lib/trials/practice';
import { structuralProblems } from '../src/lib/trials/structural';

// Docs 35: the structural check and free practice, on synthetic questions cloned from public ones. The release of the
// iPAS and CCAR-F questions that uses them is data of the private bank; nothing here depends on it.
const examOf = examResolver(trialBank);
const clone = <T,>(x: T): T => structuredClone(x);
const rev = (q: Question) => currentRevisionOf(q)!;
const inReview = (q: Question): Question => ({ ...clone(q), review: { ...q.review, status: 'in-review', reviews: [], publication: undefined } } as Question);
const fix = (q: Question, edit: (r: ReturnType<typeof rev>) => void): Question => { const c = inReview(q); edit(rev(c)); return c; };
const problems = (q: Question) => structuralProblems(q, sourceById, tagById);
// A public single-choice question, made into an original, waiting-for-review CCAR-F question with one syllabus item.
const base = trialBank.questions.find(q => q.type === 'single-choice' && rev(q).options?.length && rev(q).explanation)!;
const sample: Question = (() => {
  const q = clone(base);
  q.provenance = { origin: 'original', sourceId: 'basis-ccarf' } as Question['provenance'];
  q.tags = ['ccarf.d1-1'];
  q.appearances = [{ kind: 'targets', subjectId: 'ccarf-2026-07.foundations', relevance: 'core' }];
  return q;
})();
const AUTO = 'auto-structural';
const ledger = { ...committedLedger, reviewers: [...committedLedger.reviewers, { id: AUTO, name: 'auto', roles: ['review' as const], kind: 'automated' as const }], reviews: [], publications: [] };

describe('the structural check', () => {
  it('has a public original question that passes it once it is waiting for review', () => {
    expect(sample).toBeDefined();
    expect(problems(inReview(sample))).toEqual([]);
  });
  it('fails what is incomplete or inconsistent, naming why', () => {
    expect(problems(fix(sample, r => { r.stem = [{ type: 'p', text: '  ' }]; }))).toContain('the stem is blank');
    expect(problems(fix(sample, r => { r.options![1].body = []; })).join()).toMatch(/option .* is blank/);
    expect(problems(fix(sample, r => { r.options![1].id = r.options![0].id; }))).toContain('duplicate option ids');
    expect(problems(fix(sample, r => { (r.answer as { correct: string[] }).correct = ['zz']; })).join()).toMatch(/the right answer zz is not an option/);
    expect(problems(fix(sample, r => { (r.answer as { correct: string[] }).correct = []; })).join()).toMatch(/no right answer/);
    expect(problems(fix(sample, r => { r.explanation = undefined; }))).toContain('the explanation is blank');
    expect(problems(fix(sample, r => { r.display.explanation = false; }))).toContain('display hides the text, options, answer or explanation');
  });
  it('catches an answer key that disagrees with an explanation naming its answer', () => {
    const named = fix(sample, r => { r.explanation!.body = [{ type: 'p', text: '正解（A）。' }]; (r.answer as { correct: string[] }).correct = [r.options![1].id]; });
    expect(problems(named).join()).toMatch(/the explanation names （A）, the answer key is/);
  });
  it('refuses a question that is not original or not waiting for review', () => {
    expect(problems({ ...inReview(sample), provenance: { ...sample.provenance, origin: 'official-original' } } as Question).join()).toMatch(/not an original/);
    expect(problems(sample).join()).toMatch(/status is published, not in-review/);
  });
});

describe('who may record a structural check', () => {
  const q = inReview(sample), r = rev(q), bank = [q];
  const file = (by: string, extra: object = {}) => ({ format: DECISIONS_FORMAT, exam: examOf(q), by, at: '2026-11-12', decisions: [{ questionId: q.id, revision: r.revision, hash: revisionHash(r), verdict: 'approve' as const, checks: [] }], ...extra });
  it('lets only the automated reviewer record it, and never a person', () => {
    expect(planDecisions(file(AUTO, { basis: STRUCTURAL }), bank, ledger, 1, examOf).ok).toBe(true);
    expect(planDecisions(file('owner', { basis: STRUCTURAL }), bank, ledger, 1, examOf).errors.join()).toMatch(/owner is not an automated reviewer/);
    expect(planDecisions(file(AUTO), bank, ledger, 1, examOf).errors.join()).toMatch(/automated reviewer and may record structural-check decisions only/);
  });
  it('confirms no content check, and never releases an official question', () => {
    const withCheck = file(AUTO, { basis: STRUCTURAL, decisions: [{ questionId: q.id, revision: r.revision, hash: revisionHash(r), verdict: 'approve', checks: ['answer-verified'] }] });
    expect(planDecisions(withCheck, bank, ledger, 1, examOf).errors.join()).toMatch(/confirms no content check/);
    const official = { ...q, provenance: { ...q.provenance, origin: 'official-original' } } as Question;
    expect(planDecisions(file(AUTO, { basis: STRUCTURAL }), [official], ledger, 1, examOf).errors.join()).toMatch(/never releases an official question/);
  });
  it('is refused by the ledger check when forged: a person with a basis, or the automated reviewer without one', () => {
    const plan = planDecisions(file(AUTO, { basis: STRUCTURAL }), bank, ledger, 1, examOf).ledger!, real = plan.reviews[0];
    expect(checkLedger({ ...plan, reviews: [{ ...real, by: 'owner' }] }, bank, examOf).join()).toMatch(/is not an automated reviewer/);
    const { basis: _b, ...plain } = real; // eslint-disable-line @typescript-eslint/no-unused-vars
    expect(checkLedger({ ...plan, reviews: [plain] }, bank, examOf).join()).toMatch(/is automated and may only record a structural-check decision/);
  });
});

describe('free practice', () => {
  const bp = mockBlueprints.find(b => b.id === 'ipas-aiap-basic-s1')!;
  const subject = (n: number): Question[] => Array.from({ length: n }, (_, i) => {
    const q = clone(sample); q.id = `synthetic-${String(i).padStart(2, '0')}`;
    q.appearances = [{ kind: 'targets', subjectId: bp.subjectId, relevance: 'core' }];
    return q;
  });
  const hashes = (qs: Question[]) => Object.fromEntries(qs.map(q => [`${q.id}@${q.currentRevision}`, revisionHash(rev(q))]));
  it('shrinks to the published pool and never needs the full quota: 1, 5, 8, 10 and 11 questions each give a practice paper and no mock', () => {
    for (const n of [1, 5, 8, 10, 11]) {
      const qs = subject(n), free = practicePapers([bp], qs, sourceById, hashes(qs), []);
      expect([n, free.length, free[0].draw!.count, free[0].items.length], `n=${n}`).toEqual([n, 1, Math.min(n, FREE_COUNT), n]);
      expect([free[0].free, free[0].kind, Object.keys(free[0].draw!.coverage), free[0].passPoints], `n=${n}`).toEqual([true, 'generated', [FREE_CODE], undefined]);
      expect(assembleMockPapers(bp, qs, sourceById, hashes(qs), [], tagById).papers, `n=${n}`).toEqual([]);
    }
  });
  it('gives nothing for a subject with no published question, and ignores unpublished ones', () => {
    expect(practicePapers([bp], [], sourceById, {}, [])).toEqual([]);
    expect(practicePapers([bp], subject(3), sourceById, {}, [])).toEqual([]);
  });
});
