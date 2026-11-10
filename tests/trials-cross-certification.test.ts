import { describe, expect, it } from 'vitest';
import { playableQuestions, trialBank } from '../src/content/trials';
import { mockBlueprints } from '../src/content/trials/mock-exams';
import { hasPrivateBank } from '../src/content/trials/private-bank';
import { currentRevisionOf, paperOriginOf, paperStatusOf, revisionHash, withdrawnItems } from '../src/content/trials/schema';
import paperVersions from '../src/content/trials/paper-versions.json';
import published from '../src/content/trials/published-hashes.json';
import { finish, startSession } from '../src/lib/trials/engine';
import { examResolver } from '../src/lib/trials/lifecycle';
import { identityOf } from '../src/lib/trials/review';
import { emptyTrials, parseTrials, putSession } from '../src/lib/trials/store';
import { paperView, reviewViews } from '../src/lib/trials/views';

// Shared Trial System T.3I (docs/exam-system/33 §11): one regression across every certification, read from the bank as
// it is committed. The browser side runs in the Playwright fixture builds; the draws in the quality gates.
const examOf = examResolver(trialBank);
const of = (exam: string) => trialBank.questions.filter(q => examOf(q) === exam);
const playable = new Set(playableQuestions.map(q => q.id)), byId = new Map(trialBank.questions.map(q => [q.id, q]));
const blueprints = (exam: string) => mockBlueprints.filter(b => b.examId === exam);

// T.3J: every CCAR-F and iPAS question is unpublished, in the private bank.
describe.skipIf(!hasPrivateBank)('CCAR-F', () => {
  const qs = of('ccarf');
  it('150 questions, every one in review and none playable (published-only gating)', () => {
    expect(qs).toHaveLength(150);
    expect(new Set(qs.map(q => q.review.status))).toEqual(new Set(['in-review']));
    expect(qs.some(q => playable.has(q.id))).toBe(false);
  });
  it('a 60-question assembly in two modes on one blueprint: 120-minute official-style, 150-minute practice', () => {
    const [bp] = blueprints('ccarf');
    expect([blueprints('ccarf').length, bp.questionCount]).toEqual([1, 60]);
    expect(bp.modes.map(m => [m.examMode, m.durationMinutes])).toEqual([['official-style', 120], ['extended-practice', 150]]);
    expect(trialBank.papers.some(p => p.id.startsWith(bp.id))).toBe(false); // no paper until questions are published
  });
  it('single and multiple response questions', () => {
    expect(new Set(qs.map(q => q.type))).toEqual(new Set(['single-choice', 'multiple-response']));
  });
});

describe.skipIf(!hasPrivateBank)('iPAS AI application planner (basic)', () => {
  const qs = of('ipas-aiap-basic');
  it('200 questions in review, none playable; L11 and L12 each on their own blueprint in both modes', () => {
    expect(qs).toHaveLength(200);
    expect(new Set(qs.map(q => q.review.status))).toEqual(new Set(['in-review']));
    expect(qs.some(q => playable.has(q.id))).toBe(false);
    expect(blueprints('ipas-aiap-basic').map(b => [b.subjectId, b.questionCount, b.modes.map(m => m.examMode).join()])).toEqual([
      ['ipas-aiap-basic-115.s1', 50, 'official-style,extended-practice'], ['ipas-aiap-basic-115.s2', 50, 'official-style,extended-practice']]);
  });
});

describe('the fixed papers (APCS, MOEX, Bank IT)', () => {
  const fixed = trialBank.papers.filter(p => p.kind === 'fixed');
  it('every fixed paper is registered at its version, open, and holds published questions only', () => {
    expect(fixed.map(p => p.id).sort()).toEqual(['apcs-reading-mock-a', 'bank-it-mock-a', 'moex-114-pukao-3448']);
    for (const p of fixed) {
      expect(paperVersions.versions.some(v => v.paperId === p.id && v.version === p.version), p.id).toBe(true);
      expect([paperStatusOf(p, byId), withdrawnItems(p, byId)], p.id).toEqual(['open', []]);
      expect(paperView(p.id)!.questions.every(q => playable.has(q.id)), p.id).toBe(true);
    }
  });
  it('MOEX is an official original; the others are practice; none is adapted or retired', () => {
    expect(Object.fromEntries(fixed.map(p => [p.id, paperOriginOf(p, byId)]))).toEqual({
      'apcs-reading-mock-a': 'practice', 'bank-it-mock-a': 'practice', 'moex-114-pukao-3448': 'official-original' });
    expect(fixed.some(p => p.adaptedFrom || p.retired)).toBe(false);
  });
  it('the 57 published hashes are the content every playable question shows', () => {
    expect(Object.keys(published)).toHaveLength(57);
    for (const q of playableQuestions) {
      const rev = currentRevisionOf(q)!;
      expect((published as Record<string, string>)[`${q.id}@${rev.revision}`], q.id).toBe(revisionHash(rev));
    }
  });
});

describe('history and the review book across certifications', () => {
  it('a session taken on each fixed paper keeps its exam, grades once, and fills the review book under the same identity', () => {
    for (const p of trialBank.papers.filter(x => x.kind === 'fixed')) {
      const v = paperView(p.id)!, done = finish(startSession(v.engine, '2026-12-09T09:00:00.000Z', { id: `s-${p.id}`, seed: 1 }), '2026-12-09T09:30:00.000Z');
      const store = putSession(emptyTrials(), done), again = parseTrials(JSON.stringify(store)).store;
      expect([again.sessions[0].examId, again.sessions[0].result], p.id).toEqual([v.examId, done.result]);
      expect(putSession(again, { ...done, result: { ...done.result!, score: 999 } }), p.id).toBe(again); // never regraded
      const views = new Map(reviewViews().map(q => [q.id, q]));
      for (const [id, r] of Object.entries(again.reviews)) expect(identityOf(r, views.get(id)).state, id).toBe('current');
    }
  });
});
