import { describe, expect, it } from 'vitest';
import { getSubject, playableQuestions, regionTrialEntries, trialBank } from '../src/content/trials';
import { trialContext } from '../src/content/trials/context';
import { overdueReviews, validateTrials, type Question, type TrialBank } from '../src/content/trials/schema';
import { batchFileOf, planImport, type ImportBatch, type ImportQuestion } from '../src/lib/trials/import';
import published from '../src/content/trials/published-hashes.json';

// Shared Trial System T.2B-1: the iPAS AI 應用規劃師 (basic) data foundation, before any iPAS question exists.
const ctx = trialContext();
const clone = (): TrialBank => structuredClone(trialBank);
const problems = (bank: TrialBank) => validateTrials(bank, ctx);
const SUBJECTS = ['ipas-aiap-basic-115.s1', 'ipas-aiap-basic-115.s2'];
/** The 16 basic-level items of 評鑑內容範圍參考 115.06 (docs/exam-system/10 §2), and nothing else. */
const CODES = ['L11101', 'L11102', 'L11201', 'L11202', 'L11203', 'L11301', 'L11302', 'L11401', 'L11402',
  'L12101', 'L12102', 'L12201', 'L12202', 'L12301', 'L12302', 'L12303'];

const original = (n: number, over: Partial<ImportQuestion> = {}): ImportQuestion => ({
  id: `test-ipas-q${n}`, type: 'single-choice', stem: `某公司導入生成式 AI 的情境 ${n}：下列何者最適當？`,
  options: [`做法甲 ${n}`, `做法乙 ${n}`, `做法丙 ${n}`, `做法丁 ${n}`], answer: 'A', tags: ['ipas.l12301'],
  appearances: [{ kind: 'targets', subjectId: 'ipas-aiap-basic-115.s2' }], ...over,
});
const ipasBatch = (over: Partial<ImportBatch> = {}): ImportBatch => ({
  format: 'logic-island.trials-import/1',
  batch: { id: 'test-ipas', title: '測試 iPAS 原創', preparedBy: { kind: 'ai', name: 'test' }, preparedAt: '2026-11-03' },
  origin: 'original', source: 'basis-ipas-aiap-basic', generatedBy: { model: 'test-model', at: '2026-11-03' },
  revisionNote: '測試', reviews: [], questions: [original(1)], ...over,
});
const plan = (raw: unknown, today?: string) => planImport(raw, trialBank, ctx, undefined, published, batchFileOf('test-ipas'), today);

describe('iPAS basic data (T.2B-1)', () => {
  it('leaves the 53 questions and every published hash as they were', () => {
    expect(problems(trialBank)).toEqual([]);
    expect(trialBank.questions.filter(q => !q.appearances.some(a => SUBJECTS.includes(a.subjectId)) && !q.id.startsWith('ccarf-'))).toHaveLength(53);
    expect(Object.keys(published)).toHaveLength(57);
  });

  it('sets the official format of both subjects, and the mock scoring as Logic Island\'s own rule', () => {
    for (const id of SUBJECTS) {
      const s = getSubject(id)!;
      expect(s.format).toEqual({ durationMinutes: 75, questionCount: 50, totalPoints: 100, passPoints: 70 });
      expect(s.questionTypes).toEqual(['single-choice']);
      expect(s.mockScoring).toMatchObject({ pointsPerQuestion: 2, passPoints: 70 });
      expect(s.mockScoring!.note).toMatch(/^Logic Island 模擬計分規則/);
    }
    expect(SUBJECTS.map(id => getSubject(id)!.name)).toEqual(['L11 人工智慧基礎概論', 'L12 生成式 AI 應用與規劃']);
  });

  it('has exactly the 16 official syllabus items, each with its code, name, subject, topic, version and source', () => {
    const items = trialBank.tags.filter(t => t.syllabus && t.id.startsWith('ipas.'));
    expect(items.map(t => t.syllabus!.code)).toEqual(CODES);
    for (const t of items) {
      const y = t.syllabus!;
      expect(t.id).toBe(`ipas.${y.code.toLowerCase()}`);
      expect(y.subjectId).toBe(y.code.startsWith('L11') ? SUBJECTS[0] : SUBJECTS[1]);
      expect(y.code.startsWith(y.parent.code)).toBe(true);
      expect([y.version, y.sourceId]).toEqual(['115.06', 'ipas-aiap-syllabus-115-06']);
      expect(t.lessons).toBeUndefined();
    }
    expect(new Set(items.map(t => t.syllabus!.parent.code))).toEqual(new Set(['L111', 'L112', 'L113', 'L114', 'L121', 'L122', 'L123']));
  });

  it('separates the syllabus (scope), the original basis (questions) and the published papers (research only)', () => {
    const src = new Map(trialBank.sources.map(s => [s.id, s]));
    expect(src.get('ipas-aiap-syllabus-115-06')).toMatchObject({ kind: 'official-syllabus', license: 'unconfirmed', version: '115.06' });
    expect(src.get('ipas-aiap-brochure-115')).toMatchObject({ kind: 'official-syllabus', license: 'unconfirmed', version: '115.04' });
    expect(src.get('basis-ipas-aiap-basic')).toMatchObject({ kind: 'original-basis', license: 'original', basedOn: ['ipas-aiap-syllabus-115-06', 'ipas-aiap-brochure-115'] });
    const papers = trialBank.sources.filter(s => s.researchOnly);
    expect(papers).toHaveLength(8);
    for (const p of papers) expect([p.kind, p.license, p.url.startsWith('https://www.ipas.org.tw/')]).toEqual(['official-paper', 'unconfirmed', true]);
  });

  it('puts no iPAS question on the site; the AI archipelago still shows the exam as in preparation', () => {
    // T.2B-2 imports iPAS originals, all in review until a person approves each one.
    expect(trialBank.questions.filter(q => q.appearances.some(a => SUBJECTS.includes(a.subjectId))).every(q => q.review.status === 'in-review')).toBe(true);
    expect(playableQuestions.some(q => q.tags.some(t => t.startsWith('ipas.')))).toBe(false);
    expect(trialBank.papers.some(p => SUBJECTS.includes(p.subjectId))).toBe(false);
    expect(regionTrialEntries('ai')).toEqual([{ id: 'ai-ipas', label: 'iPAS AI 應用規劃師', detail: '題目準備中' }, { id: 'ai-ccarf', label: 'CCAR-F Claude 架構師（非官方練習）', detail: '題目準備中' }]);
  });
});

describe('validateTrials catches (T.2B-1)', () => {
  it('a syllabus tag with a made-up or misfiled code, or the wrong version', () => {
    const bank = clone(), tag = bank.tags.find(t => t.id === 'ipas.l11101')!;
    tag.syllabus = { ...tag.syllabus!, code: 'L11109' };
    bank.tags.find(t => t.id === 'ipas.l11102')!.syllabus!.parent.code = 'L112';
    bank.tags.find(t => t.id === 'ipas.l11201')!.syllabus!.version = '115.02';
    bank.tags.find(t => t.id === 'ipas.l11202')!.syllabus!.sourceId = 'basis-ipas-aiap-basic';
    expect(problems(bank).join('\n')).toMatch(/l11101: the id ends with the syllabus code[\s\S]*l11102: L11102 is not an item code of ipas-aiap-basic under its topic L112[\s\S]*l11201: version 115.02[\s\S]*l11202: basis-ipas-aiap-basic is not an official syllabus/);
  });

  it('mock scoring that is not labelled, or does not add up to the official total', () => {
    const bank = clone(), [s1, s2] = SUBJECTS.map(id => bank.subjects.find(s => s.id === id)!);
    s1.mockScoring = { ...s1.mockScoring!, note: '每題 2 分' };
    s2.mockScoring = { ...s2.mockScoring!, pointsPerQuestion: 2.5 };
    expect(problems(bank)).toEqual([
      'subject ipas-aiap-basic-115.s1: the mock scoring note says it is Logic Island\'s rule, not the official one',
      'subject ipas-aiap-basic-115.s2: mock points per question times the official question count make the official total',
    ]);
  });

  it('a question citing a research-only paper, and a research-only source that is not an unconfirmed official one', () => {
    const bank = clone();
    bank.questions[0].provenance.sourceId = 'ipas-aiap-basic-paper-115-1-s1';
    bank.sources.find(s => s.id === 'moex-past-papers')!.researchOnly = true;
    const found = problems(bank).join('\n');
    expect(found).toMatch(/is for research only: no question cites it/);
    expect(found).toMatch(/source moex-past-papers: research-only is for official documents whose licence is unconfirmed/);
  });

  it('broken question metadata: shape, traits, review date and planned islands', () => {
    const bank = clone(), [a, b, c, d] = bank.questions;
    Object.assign(a, { stemShape: 'story' });
    Object.assign(b, { stemTraits: ['negative', 'negative'] });
    Object.assign(c, { reviewBy: '2026-02-30' });
    d.reviewBy = d.revisions[0].at;
    d.links = { plannedIslands: ['machine-learning', 'machine-learning', 'nowhere'] };
    const found = problems(bank);
    expect(found).toContain(`question ${a.id}: stemShape is concept, application, scenario`);
    expect(found).toContain(`question ${b.id}: stemTraits are distinct values of negative, regulation, matching-in-options`);
    expect(found).toContain(`question ${c.id}: reviewBy is a date (YYYY-MM-DD)`);
    expect(found).toContain(`question ${d.id}: reviewBy comes after the question was written`);
    expect(found).toContain(`question ${d.id}: lists a planned island twice`);
    expect(found).toContain(`question ${d.id}: unknown island nowhere`);
  });
});

describe('iPAS originals through the import flow (T.2B-1)', () => {
  it('imports an AI-written original in review with its metadata, off every paper', () => {
    const p = plan(ipasBatch({ questions: [original(1, { stemShape: 'scenario', stemTraits: ['negative'], reviewBy: '2027-05-03', plannedIslands: ['ai-engineering'] })] }));
    expect([...p.errors, ...p.bankProblems]).toEqual([]);
    expect(p.lines[0].status).toBe('in-review');
    const q = p.output!.questions[0];
    expect([q.stemShape, q.stemTraits, q.reviewBy, q.links]).toEqual(['scenario', ['negative'], '2027-05-03', { plannedIslands: ['ai-engineering'] }]);
    expect(Object.keys(p.hashes!).filter(k => k.startsWith('test-ipas'))).toEqual([]);
  });

  it('changing the metadata adds no revision and keeps the hash', () => {
    const first = plan(ipasBatch()).output!;
    const again = planImport(ipasBatch({ questions: [original(1, { stemShape: 'application', reviewBy: '2027-01-01' })] }),
      { ...trialBank, questions: [...trialBank.questions, ...first.questions] }, ctx, first, published, batchFileOf('test-ipas'));
    expect(again.errors).toEqual([]);
    expect([again.lines[0].outcome, again.lines[0].hash, again.output!.questions[0].revisions]).toEqual(['metadata', plan(ipasBatch()).lines[0].hash, first.questions[0].revisions]);
  });

  it('warns about a passed review date without changing the question', () => {
    const raw = ipasBatch({ questions: [original(1, { reviewBy: '2026-12-01' })] });
    const before = plan(raw, '2026-11-03'), after = plan(raw, '2026-12-02');
    expect(before.warnings).toEqual([]);
    expect(after.warnings).toEqual(['question test-ipas-q1: review was due 2026-12-01']);
    expect(after.output).toEqual(before.output);
    expect(overdueReviews(after.output!.questions, '2026-12-02')).toEqual([{ questionId: 'test-ipas-q1', reviewBy: '2026-12-01' }]);
    expect(overdueReviews([{ ...after.output!.questions[0], retired: { at: '2026-11-04', reason: 'x' } } as Question], '2026-12-02')).toEqual([]);
  });

  it('refuses bad metadata and any question taken from a published paper', () => {
    expect(plan(ipasBatch({ questions: [original(1, { stemShape: 'story' as never, reviewBy: '2027-13-01' })] })).errors.join('\n'))
      .toMatch(/stemShape is concept, application, scenario[\s\S]*reviewBy is a date/);
    expect(plan(ipasBatch({ origin: 'official-original', source: 'ipas-aiap-basic-paper-115-1-s2', answerKey: { sourceId: 'moex-114-pukao-3448-key', answers: { 1: 'A' } } })).errors.join('\n'))
      .toMatch(/is for research and statistics only/);
  });
});
