import { describe, expect, it } from 'vitest';
import { getPaper, playableQuestions, trialBank } from '../src/content/trials';
import { hasPrivateBank } from '../src/content/trials/private-bank';
import { trialContext } from '../src/content/trials/context';
import { LICENSE_DISPLAY, revisionHash, validateTrials, type Question, type TrialBank } from '../src/content/trials/schema';
import published from '../src/content/trials/published-hashes.json';

// Shared Trial System T.0: the question bank and its checks (docs/exam-system/04 §4).
const ctx = trialContext();
const clone = (): TrialBank => structuredClone(trialBank);
const q = (bank: TrialBank, id: string) => bank.questions.find(x => x.id === id)!;
const problems = (bank: TrialBank) => validateTrials(bank, ctx);

describe('trial bank (T.0)', () => {
  it('passes every check', () => expect(problems(trialBank)).toEqual([]));

  it('holds the MVP papers of original questions and the first official paper (T.1)', () => {
    expect(trialBank.papers.map(p => [p.id, p.items.length])).toEqual([['apcs-reading-mock-a', 7], ['bank-it-mock-a', 6], ['moex-114-pukao-3448', 40]]);
    const byOrigin = (o: string) => trialBank.questions.filter(x => x.provenance.origin === o).length;
    // T.2B-2 to T.2B-4 and T.2E add iPAS originals in review, T.3B the 25 CCAR-F ones; the 53 playable questions are unchanged.
    // T.3J: without the private bank only the 53 published questions are in the bank.
    expect([byOrigin('original'), byOrigin('official-original'), trialBank.questions.length]).toEqual(hasPrivateBank ? [363, 40, 403] : [13, 40, 53]);
    expect(playableQuestions).toHaveLength(53);
    expect(getPaper('apcs-reading-mock-a')!.items.reduce((a, i) => a + i.points, 0)).toBe(70);
    expect(getPaper('moex-114-pukao-3448')!.items.reduce((a, i) => a + i.points, 0)).toBe(100);
  });

  it('T.1.1: questions 1, 6, 7 and 36 have an explanation-only revision 2; revision 1 and its hash stay', () => {
    for (const n of ['01', '06', '07', '36']) {
      const x = trialBank.questions.find(q => q.id === `moex-114-pukao-3448-q${n}`)!;
      const [r1, r2] = x.revisions;
      expect([x.currentRevision, r1.change, r2.change], x.id).toEqual([2, 'initial', 'editorial']);
      expect(revisionHash(r2), x.id).toBe(revisionHash(r1));
      expect(r2.explanation!.origin).toBe('logic-island-original');
      expect(JSON.stringify(r2.explanation), x.id).not.toBe(JSON.stringify(r1.explanation));
      expect({ ...r2, revision: 1, change: 'initial', note: r1.note, explanation: r1.explanation }, x.id).toEqual(r1);
    }
    // iPAS batch A has its own revision 2s (T.2B-2B), checked in trials-ipas-batch-a.test.ts; CCAR-F's T.3D ones are
    // checked in trials-ccarf-bank.test.ts.
    const revised = trialBank.questions.filter(q => q.revisions.length > 1 && !q.id.startsWith('ipas-') && !q.id.startsWith('ccarf-')).map(q => q.id);
    expect(revised).toEqual(['01', '06', '07', '36'].map(n => `moex-114-pukao-3448-q${n}`));
  });

  it('official questions credit their source and keep the official answer', () => {
    for (const x of trialBank.questions.filter(q => q.provenance.origin !== 'original')) {
      const rev = x.revisions[x.revisions.length - 1];
      expect(trialBank.sources.find(s => s.id === x.provenance.sourceId)!.license, x.id).toBe('free-use-statute');
      expect(rev.display.attributionRequired, x.id).toBe(true);
      expect(rev.answer, x.id).toMatchObject({ kind: 'choice', official: true, verifiedBy: 'official-key' });
      expect(x.provenance.locator?.questionNumber, x.id).toBe(String(Number(x.id.slice(-2))));
    }
  });

  it('never rewrites a published revision (published-hashes.json lists each one)', () => {
    const now = Object.fromEntries(trialBank.questions.flatMap(x => x.revisions.map(r => [`${x.id}@${r.revision}`, revisionHash(r)])));
    for (const [key, hash] of Object.entries(published)) expect(now[key], key).toBe(hash);
    const shipped = new Set(trialBank.questions.filter(x => x.review.status === 'published').flatMap(x => x.revisions.map(r => `${x.id}@${r.revision}`)));
    expect([...shipped].filter(k => !(k in published)), 'add new revisions to published-hashes.json').toEqual([]);
  });
});

describe('validateTrials catches', () => {
  it('unknown references', () => {
    const bank = clone();
    q(bank, 'orig-apcs-read-01').tags.push('no.such-tag');
    q(bank, 'orig-apcs-read-01').links.lessons = ['PL01', 'F99'];
    bank.papers[0].items.push({ questionId: 'missing', points: 1 });
    bank.entries.push({ id: 'x', examId: 'nope', place: { kind: 'region', regionId: 'cs' }, label: 'x', order: 9 });
    const found = problems(bank).join('\n');
    expect(found).toMatch(/unknown tag no\.such-tag/);
    expect(found).toMatch(/lesson PL01 is not a complete lesson/);
    expect(found).toMatch(/lesson F99 is not a complete lesson/);
    expect(found).toMatch(/unknown question missing/);
    expect(found).toMatch(/entry x: unknown exam nope/);
  });

  it('a licence widened, or an unconfirmed question with content or on a paper', () => {
    const bank = clone();
    bank.sources.find(s => s.id === 'basis-apcs-reading')!.license = 'unconfirmed';
    bank.sources.find(s => s.id === 'basis-apcs-reading')!.attribution = 'x';
    const found = problems(bank).join('\n');
    expect(found).toMatch(/display\.text is wider than the unconfirmed licence/);
    expect(found).toMatch(/keeps metadata only/);
    expect(found).toMatch(/licence is unconfirmed is on no paper/);
  });

  it('broken choices', () => {
    const bank = clone(), rev = q(bank, 'orig-bank-01').revisions[0];
    rev.options![1] = { ...rev.options![1], id: 'a' };
    rev.answer = { kind: 'choice', correct: ['a', 'z'], official: false };
    expect(problems(bank).join('\n')).toMatch(/option ids are unique[\s\S]*unknown option z[\s\S]*exactly one correct option/);
  });

  it('an AI-written question published without a human approval', () => {
    const bank = clone();
    q(bank, 'orig-bank-02').review.reviews = q(bank, 'orig-bank-02').review.reviews.filter(r => r.reviewer === 'ai');
    expect(problems(bank)).toContain('question orig-bank-02: an AI-written question needs a human approval before it is published');
  });

  it('code without its indentation, images, and an unexplained total', () => {
    const bank = clone(), rev = q(bank, 'orig-apcs-read-01').revisions[0];
    rev.stem = [...rev.stem!, { type: 'code', language: 'C', text: 'x', indentationPreserved: false }, { type: 'image', assetId: 'fig' }];
    delete bank.papers[0].note;
    const found = problems(bank).join('\n');
    expect(found).toMatch(/keeps its indentation/);
    expect(found).toMatch(/asset registry/);
    expect(found).toMatch(/explained in a note/);
  });

  it('an unplayable question on a paper, and broken revision numbers', () => {
    const bank = clone(), x: Question = q(bank, 'orig-apcs-read-02');
    x.review.status = 'in-review';
    x.revisions[0].revision = 2;
    const found = problems(bank).join('\n');
    expect(found).toMatch(/orig-apcs-read-02 is not playable/);
    expect(found).toMatch(/numbered 1, 2, 3/);
  });

  it('an official question published without being checked against its source', () => {
    const bank = clone();
    q(bank, 'moex-114-pukao-3448-q05').review.reviews = q(bank, 'moex-114-pukao-3448-q05').review.reviews.map(r => ({ ...r, checks: r.checks.filter(c => c !== 'source-checked') }));
    expect(problems(bank)).toContain('question moex-114-pukao-3448-q05: an official question is checked against its source before it is published');
  });

  it('the licence table never widens what unconfirmed sources show', () => {
    expect(Object.values(LICENSE_DISPLAY.unconfirmed).filter((v, i) => i < 4 && v)).toEqual([]);
  });
});
