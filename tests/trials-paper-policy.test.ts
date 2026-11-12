import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { sourceById, trialBank } from '../src/content/trials';
import { trialContext } from '../src/content/trials/context';
import { paperOriginOf, paperStatusOf, validateTrials, type ExamPaper, type TrialBank } from '../src/content/trials/schema';
import { examResolver } from '../src/lib/trials/lifecycle';
import { checkPaperVersions, planAdaptedPaper, planPaperRevision, type PaperVersions } from '../src/lib/trials/paper-versions';
import registryFile from '../src/content/trials/paper-versions.json';
import { replan, revoke, syntheticWorld } from './helpers/publication-harness';

// Shared Trial System T.3H (docs/exam-system/32 §6): original, adapted practice and retired papers. The MOEX drill runs
// in memory with a SYNTHETIC reviewer; the committed files are compared byte for byte at the end.
const ROOT = path.join(__dirname, '..');
const digest = (rel: string) => createHash('sha256').update(readFileSync(path.join(ROOT, rel))).digest('hex');
const protectedFiles = ['src/content/trials/ledger.json', 'src/content/trials/published-hashes.json', 'src/content/trials/assessment-manifest.json', 'src/content/trials/paper-versions.json', 'src/content/trials/papers.ts',
  ...readdirSync(path.join(ROOT, 'src/content/trials/generated')).map(f => `src/content/trials/generated/${f}`)];
const before = new Map(protectedFiles.map(f => [f, digest(f)]));

const registry = registryFile as PaperVersions, examOf = examResolver(trialBank), ctx = trialContext();
const MOEX = 'moex-114-pukao-3448', MOEX_Q = 'moex-114-pukao-3448-q05', ADAPTED = 'moex-114-pukao-3448-adapted-a';
const byId = (bank: TrialBank) => new Map(bank.questions.map(q => [q.id, q]));
const paperOf = (bank: TrialBank, id: string) => bank.papers.find(p => p.id === id)!;
const withPaper = (bank: TrialBank, ...papers: ExamPaper[]): TrialBank => ({ ...bank, papers: [...bank.papers.filter(p => !papers.some(x => x.id === p.id)), ...papers] });

const w0 = syntheticWorld();
const out = replan({ ...w0, ledger: revoke(w0, [MOEX_Q], '2026-12-10', 'SYNTHETIC: official original withdrawal drill').ledger! }, 'moex-114');

describe('what each paper is', () => {
  it('the MOEX paper is an official original; the APCS and bank papers (Logic Island originals) are practice papers; all open', () => {
    const qs = byId(trialBank);
    expect(trialBank.papers.filter(p => p.kind === 'fixed').map(p => [p.id, paperOriginOf(p, qs), paperStatusOf(p, qs)])).toEqual([
      ['apcs-reading-mock-a', 'practice', 'open'], ['bank-it-mock-a', 'practice', 'open'], [MOEX, 'official-original', 'open']]);
    expect(trialBank.papers.filter(p => p.kind === 'generated').every(p => paperOriginOf(p, qs) === 'practice')).toBe(true);
  });
});

describe('an official original that loses a question (MOEX drill)', () => {
  const moex = paperOf(out.bank, MOEX);
  it('is under maintenance, keeps its identity and its registered version; it is never revised under its own id', () => {
    expect(paperStatusOf(moex, byId(out.bank))).toBe('maintenance');
    expect(checkPaperVersions(registry, out.bank, examOf)).toMatchObject({ problems: [], maintenance: [{ paperId: MOEX, version: '1.0.0', withdrawn: [MOEX_Q] }] });
    expect(planPaperRevision(moex, out.bank, sourceById, '1.1.0').ok).toBe(false);
  });
  const plan = planAdaptedPaper(moex, out.bank, sourceById, ADAPTED);
  it('an adapted practice paper is only proposed: its own id, its source and version, 39 pinned items, no pass mark, no replacement', () => {
    expect(plan.ok).toBe(true);
    const p = plan.paper!;
    expect([p.id, p.version, p.adaptedFrom, p.title, p.passPoints, p.items.length, p.retired]).toEqual([ADAPTED, '1.0.0', { paperId: MOEX, version: '1.0.0' }, '114 年普考《計算機概要》改編練習卷', undefined, 39, undefined]);
    expect(p.items.map(i => i.questionId)).toEqual(moex.items.map(i => i.questionId).filter(id => id !== MOEX_Q));
    const registered = registry.versions.find(v => v.paperId === MOEX)!.items.filter(i => i.questionId !== MOEX_Q);
    expect(plan.entry!.items).toEqual(registered);
    expect(plan.removed).toEqual([MOEX_Q]);
  });
  it('lists what a human decides: the total, the pass mark, the wording, and what becomes of the original', () => {
    expect(plan.decisions).toEqual([
      'total 100 → 97.5 points (40 → 39 questions): a human decides whether that total stands',
      'pass mark: none, as on the original; a human confirms',
      'title "114 年普考《計算機概要》改編練習卷", description and note: a human writes them; they must say it is an adapted practice paper and which questions are missing',
      `${MOEX}: stays under maintenance, or a human retires it; it is never served with fewer questions as the original`,
    ]);
  });
  it('the proposal is a valid adapted paper once written (never under a title that says 原卷), and is not registered by itself', () => {
    expect(validateTrials(withPaper(out.bank, { ...plan.paper!, title: moex.title }), ctx)).toEqual([`paper ${ADAPTED}: an adapted paper is never called the original paper`]);
    expect(validateTrials(withPaper(out.bank, plan.paper!), ctx)).toEqual([]);
    const written = { ...plan.paper!, description: '改編自考選部 114 年普考《計算機概要》試題，缺第 5 題（已撤回），共 39 題。不是完整的官方原卷。', note: '缺 1 題，總分 97.5 分；不設及格線。' };
    const bank = withPaper(out.bank, written);
    expect(validateTrials(bank, ctx)).toEqual([]);
    expect([paperOriginOf(written, byId(bank)), paperStatusOf(written, byId(bank))]).toEqual(['adapted', 'open']);
    // Registering it is a human step (trials:integrity --append): until then the check lists it as unregistered.
    expect(checkPaperVersions(registry, bank, examOf).unregistered.map(v => `${v.paperId}@${v.version}`)).toEqual([`${ADAPTED}@1.0.0`]);
  });
  it('refuses: the original id, an id in use, a paper with nothing withdrawn, a bad version, a generated paper', () => {
    expect(planAdaptedPaper(moex, out.bank, sourceById, MOEX).errors).toEqual([`${MOEX}: an adapted paper needs an id of its own, unused`]);
    expect(planAdaptedPaper(moex, out.bank, sourceById, 'bank-it-mock-a').errors).toEqual(['bank-it-mock-a: an adapted paper needs an id of its own, unused']);
    expect(planAdaptedPaper(paperOf(trialBank, MOEX), trialBank, sourceById, ADAPTED).errors).toEqual([`${MOEX}: holds no withdrawn question; nothing to adapt`]);
    expect(planAdaptedPaper(moex, out.bank, sourceById, ADAPTED, '2').errors).toEqual([`${ADAPTED}: the version is x.y.z`]);
    const generated: ExamPaper = { ...moex, id: 'generated-x', kind: 'generated' };
    expect(planAdaptedPaper(generated, out.bank, sourceById, 'x-adapted')).toMatchObject({ ok: false, errors: expect.arrayContaining(['generated-x: only a fixed paper is adapted']) });
  });
});

describe('validation of adapted and retired papers', () => {
  const apcs = paperOf(trialBank, 'apcs-reading-mock-a');
  const problems = (p: ExamPaper) => validateTrials(withPaper(trialBank, p), ctx);
  it('an adapted paper names a fixed paper of its subject, other than itself, by an x.y.z version', () => {
    const base = { ...apcs, id: 'apcs-adapted', adaptedFrom: { paperId: apcs.id, version: '1.0.0' } };
    expect(problems(base)).toEqual([]);
    expect(problems({ ...base, adaptedFrom: { paperId: 'apcs-adapted', version: '1.0.0' } })).toEqual(['paper apcs-adapted: an adapted paper has its own id, not the id of the paper it comes from']);
    expect(problems({ ...base, adaptedFrom: { paperId: 'nowhere', version: '1.0.0' } })).toEqual(['paper apcs-adapted: adapted from nowhere, which is not a fixed paper here']);
    expect(problems({ ...base, adaptedFrom: { paperId: 'bank-it-mock-a', version: '1.0.0' } })).toEqual(['paper apcs-adapted: adapted from bank-it-mock-a of another subject']);
    expect(problems({ ...base, adaptedFrom: { paperId: apcs.id, version: 'v1' } })).toEqual(['paper apcs-adapted: adapted from a paper version x.y.z']);
    expect(problems({ ...base, title: '程式識讀 原卷' })).toEqual(['paper apcs-adapted: an adapted paper is never called the original paper']);
  });
  it('a retired paper names its date and reason; it is retired whatever else holds', () => {
    expect(problems({ ...apcs, retired: { since: '2026-12-20', reason: '改版為新試卷' } })).toEqual([]);
    expect(problems({ ...apcs, retired: { since: '2026-13-01', reason: 'x' } })).toEqual(['paper apcs-reading-mock-a: a retired paper names the date (YYYY-MM-DD) and the reason']);
    expect(problems({ ...apcs, retired: { since: '2026-12-20', reason: ' ' } })).toEqual(['paper apcs-reading-mock-a: a retired paper names the date (YYYY-MM-DD) and the reason']);
    expect(paperStatusOf({ ...paperOf(out.bank, MOEX), retired: { since: '2026-12-20', reason: 'x' } }, byId(out.bank))).toBe('retired');
  });
});

describe('after the drill', () => {
  it('no protected file changed, and nothing in the committed bank is withdrawn, adapted or retired', () => {
    expect(protectedFiles.filter(f => digest(f) !== before.get(f))).toEqual([]);
    expect(trialBank.questions.filter(q => q.review.status === 'revoked')).toEqual([]);
    expect(trialBank.papers.filter(p => p.adaptedFrom || p.retired)).toEqual([]);
  });
});
