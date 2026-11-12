import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { trialBank } from '../src/content/trials';
import { hasPrivateBank, privateFile } from '../src/content/trials/private-bank';
import { trialContext } from '../src/content/trials/context';
import { revisionHash, type GeneratedBatch, type TrialBank } from '../src/content/trials/schema';
import { batchFileOf, importReport, planImport, type ImportBatch, type ImportQuestion } from '../src/lib/trials/import';
import { committedLedger, type Ledger } from '../src/lib/trials/lifecycle';
import { writeAllOrNothing } from '../scripts/trials/write-files';
import published from '../src/content/trials/published-hashes.json';

// Shared Trial System T.1: the question import flow (src/lib/trials/import.ts) and the committed batches.
const ctx = trialContext();
const DIR = path.join(__dirname, '../src/content/trials');
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const human = { by: 'owner', reviewer: 'human' as const, at: '2026-11-03', verdict: 'approve' as const, checks: [] };
const checked = { by: 'claude-code', reviewer: 'ai' as const, at: '2026-11-03', verdict: 'approve' as const, checks: ['source-checked' as const, 'answer-verified' as const] };

const question = (n: number, over: Partial<ImportQuestion> = {}): ImportQuestion => ({
  id: `test-q${n}`, type: 'single-choice', number: String(n), stem: `測試題 ${n}：下列何者正確？`,
  options: [`甲 ${n}`, `乙 ${n}`, `丙 ${n}`, `丁 ${n}`], answer: 'B', tags: ['cs.general'], ...over,
});
const batch = (over: Partial<ImportBatch> = {}): ImportBatch => ({
  format: 'logic-island.trials-import/1',
  batch: { id: 'test-batch', title: '測試批次', preparedBy: { kind: 'ai', name: 'test' }, preparedAt: '2026-11-03' },
  origin: 'official-original', source: 'moex-114-pukao-3448',
  answerKey: { sourceId: 'moex-114-pukao-3448-key', answers: { 1: 'B', 2: 'C' } },
  paper: { subjectId: 'moex-info-processing-114.pukao-computer', paperId: 'test-paper' },
  revisionNote: '測試', reviews: [checked, human], questions: [question(1), question(2, { answer: 'C' })], ...over,
});
const plan = (raw: unknown, bank: TrialBank = trialBank, previous?: GeneratedBatch, hashes: Record<string, string> = published, file = batchFileOf('test-batch'), ledger: Ledger = committedLedger) =>
  planImport(raw, bank, ctx, previous, hashes, file, undefined, ledger);
/** T.2C: a ledger with the owner's approval of every question's current revision, and optionally its publication. */
const ledgerFor = (out: GeneratedBatch, publish: boolean, extra: Partial<Ledger> = {}): Ledger => {
  // T.3B: every ledger record names its exam (these test questions are MOEX ones).
  const current = out.questions.map(q => ({ exam: 'moex-info-processing', questionId: q.id, revision: q.currentRevision, hash: revisionHash(q.revisions[q.currentRevision - 1]), by: 'owner', at: '2026-11-05' }));
  return { ...committedLedger, reviews: current.map(c => ({ ...c, verdict: 'approve' as const, checks: ['source-checked' as const, 'answer-verified' as const] })),
    publications: publish ? current : [], ...extra };
};
const withOutput = (out: GeneratedBatch): TrialBank => ({ ...trialBank, questions: [...trialBank.questions, ...out.questions] });

describe('committed batches (T.1 first batch)', () => {
  const files = readdirSync(path.join(DIR, 'batches')).filter(f => f.endsWith('.json')).sort();

  // T.3J: the published batches are here; the iPAS and CCAR-F batches (every question in review) are in the private bank.
  it('are the MVP originals and 114 普考計算機概要', () => {
    expect(files).toEqual(['2026-11-03-moex-114-pukao-computer.json', '2026-11-03-mvp-originals.json']);
  });
  it.skipIf(!hasPrivateBank)('the private bank holds the iPAS batches (T.2B-2 to T.2B-4, T.2E) and the CCAR-F ones', () => {
    expect(readdirSync(privateFile('batches')).filter(f => f.endsWith('.json')).sort()).toEqual(['2026-11-03-ipas-aiap-basic-a.json',
      ...['b', 'c', 'd', 'e', 'f', 'g', 'h'].map(l => `2026-11-04-ipas-aiap-basic-${l}.json`), ...['a', 'b', 'c', 'd', 'e'].map(l => `2026-11-05-ccarf-${l}.json`), ...['f', 'g'].map(l => `2026-11-09-ccarf-${l}.json`)]);
  });
  // The iPAS and CCAR-F batches are AI-written and have no human approval yet: every question stays in review.
  const statusOf = (file: string) => file.includes('ipas') || file.includes('ccarf') ? 'in-review' : 'published';

  it.each(files)('%s imports again with nothing to change (the generated file and hashes are in sync)', file => {
    const raw = read(path.join(DIR, 'batches', file)), out = path.join(DIR, 'generated', file);
    const p = planImport(raw, trialBank, ctx, read(out), published, `src/content/trials/batches/${file}`);
    expect([...p.errors, ...p.bankProblems, ...p.warnings]).toEqual([]);
    expect(p.lines.every(l => l.outcome === 'unchanged' && l.status === statusOf(file))).toBe(true);
    expect(`${JSON.stringify(p.output, null, 1)}\n`).toBe(readFileSync(out, 'utf8'));
    expect(p.hashes).toEqual(published);
  });

  it('kept the 13 accepted originals exactly (their T.0 hashes) and took every MOEX answer from the official key', () => {
    const originals = read(path.join(DIR, 'generated/2026-11-03-mvp-originals.json')) as GeneratedBatch;
    expect(originals.questions).toHaveLength(13);
    expect(originals.questions.map(q => published[`${q.id}@1` as keyof typeof published])).not.toContain(undefined);
    const moex = read(path.join(DIR, 'batches/2026-11-03-moex-114-pukao-computer.json')) as ImportBatch;
    expect(moex.questions.map(q => q.answer).join('')).toBe(Object.values(moex.answerKey!.answers).join(''));
    expect(moex.questions.map(q => q.number)).toEqual(Object.keys(moex.answerKey!.answers));
  });
});

describe('planImport checks', () => {
  it('imports a clean batch and reports a dry run', () => {
    const p = plan(batch());
    expect(p.ok).toBe(true);
    // T.2C: importing publishes nothing, even with approvals written in the batch file.
    expect(p.lines.map(l => [l.id, l.answer, l.answerCheck, l.status, l.outcome])).toEqual([
      ['test-q1', 'B', '與官方答案相符', 'in-review', 'new'], ['test-q2', 'C', '與官方答案相符', 'in-review', 'new']]);
    expect(p.output!.questions[0].revisions[0].answer).toEqual({ kind: 'choice', correct: ['b'], official: true, verifiedBy: 'official-key' });
    expect(Object.keys(p.hashes!).filter(k => k.startsWith('test-'))).toEqual([]);
    const report = importReport(batch(), p, 'dry-run', 'test.json');
    expect(report).toMatch(/\*\*dry-run\*\*（只檢查，沒有寫入任何檔案）/);
    expect(report).toBe(importReport(batch(), plan(batch()), 'dry-run', 'test.json'));
  });

  it('rejects a broken file before anything else', () => {
    expect(plan({ format: 'x', questions: [] }).errors).toEqual(expect.arrayContaining([expect.stringMatching(/^shape: format/), expect.stringMatching(/^shape: questions is a non-empty list/)]));
    expect(plan(batch({ questions: [question(1, { options: ['只有一個'] })] })).errors.join('\n')).toMatch(/has 1 options/);
  });

  it('duplicates: the same id, the same question under another id, and the same stem', () => {
    const existing = trialBank.questions.find(q => q.id === 'moex-114-pukao-3448-q12')!.revisions[0];
    const copy = question(1, { stem: existing.stem!, options: existing.options!.map(o => o.body).reverse() });
    const p = plan(batch({ questions: [copy, question(2, { id: 'orig-bank-01', answer: 'C' })] }));
    expect(p.errors).toContain('question test-q1: duplicates moex-114-pukao-3448-q12 (same stem and options)');
    expect(p.errors).toContain('question orig-bank-01: id already used by a question outside this batch');
    const sameStem = plan(batch({ questions: [question(1, { stem: existing.stem! }), question(2, { answer: 'C' })] }));
    expect(sameStem.warnings).toEqual(['question test-q1: same stem as moex-114-pukao-3448-q12, different options']);
  });

  it('answers: against the official key, a voided key, and every number accounted for', () => {
    const p = plan(batch({ questions: [question(1, { answer: 'A' }), question(2, { number: '9', answer: 'C' })] }));
    expect(p.errors).toEqual(expect.arrayContaining(['question test-q1: answer A disagrees with the official key (B)', 'question test-q2: the answer key has no question 9']));
    expect(p.warnings).toContain('answer key question 2 is neither imported nor listed in skipped');
    const voided = plan(batch({ answerKey: { sourceId: 'moex-114-pukao-3448-key', answers: { 1: 'B', 2: '一律給分' } }, questions: [question(1), question(2, { answer: undefined })] }));
    expect(voided.ok).toBe(true);
    expect(voided.lines[1]).toMatchObject({ status: 'in-review', held: expect.arrayContaining(['官方答案為「一律給分」']) });
    expect(plan(batch({ answerKey: undefined })).errors).toContain('an official batch carries the official answer key (answerKey)');
  });

  it('licences: an unconfirmed source is never imported, an original cites an original basis', () => {
    expect(plan(batch({ source: 'ipas-aiap-official-site' })).errors.join('\n')).toMatch(/unconfirmed licence: its questions are not imported/);
    const original = plan(batch({ origin: 'original', answerKey: undefined, paper: undefined }));
    expect(original.errors.join('\n')).toMatch(/an original question cites an original basis/);
  });

  it('reviews (T.2C): batch-file approvals approve nothing; a bound approval makes it approved, only the gate publishes', () => {
    const p = plan(batch());
    const hash = (n: number) => revisionHash(p.output!.questions[n].revisions[0]);
    expect(p.lines[0].held).toEqual([`第 1 版（${hash(0)}）尚無人工審核`]);
    expect(p.output!.questions.map(q => q.review.status)).toEqual(['in-review', 'in-review']);

    const approved = plan(batch(), trialBank, undefined, published, batchFileOf('test-batch'), ledgerFor(p.output!, false));
    expect(approved.lines.map(l => [l.status, l.held])).toEqual([['approved', ['已核准，尚未發布（發布需另外執行發布動作）']], ['approved', ['已核准，尚未發布（發布需另外執行發布動作）']]]);
    expect(approved.output!.questions[0].review.reviews.at(-1)).toMatchObject({ reviewer: 'human', verdict: 'approve', revision: 1, hash: hash(0) });
    expect(Object.keys(approved.hashes!).some(k => k.startsWith('test-'))).toBe(false);

    const gated = plan(batch(), trialBank, undefined, published, batchFileOf('test-batch'), ledgerFor(p.output!, true));
    expect(gated.ok).toBe(true);
    expect(gated.lines.map(l => l.status)).toEqual(['published', 'published']);
    expect(gated.output!.questions[0].review.publication).toEqual({ revision: 1, hash: hash(0), by: 'owner', at: '2026-11-05' });
    expect(Object.keys(gated.hashes!).filter(k => k.startsWith('test-'))).toEqual(['test-q1@1', 'test-q2@1']);

    // An approval without the checks the question needs, or a decision asking for changes, approves nothing.
    const noCheck = ledgerFor(p.output!, false);
    noCheck.reviews = noCheck.reviews.map(r => ({ ...r, checks: ['answer-verified'] }));
    expect(plan(batch(), trialBank, undefined, published, batchFileOf('test-batch'), noCheck).lines[0]).toMatchObject({ status: 'in-review', held: ['核准未確認：source-checked'] });
    const changes = ledgerFor(p.output!, false);
    changes.reviews.push({ ...changes.reviews[0], verdict: 'changes', checks: [], note: '選項 C 有歧義' });
    expect(plan(batch(), trialBank, undefined, published, batchFileOf('test-batch'), changes).lines[0]).toMatchObject({ status: 'in-review', held: ['第 1 版經人工審核要求修改'] });
  });

  it('revisions: unchanged on a re-run, a change needs a note and adds a revision, a published one never changes', () => {
    const L = ledgerFor(plan(batch()).output!, true);
    const first = plan(batch(), trialBank, undefined, published, batchFileOf('test-batch'), L), out = first.output!, bank = withOutput(out);
    const again = plan(batch(), bank, out, first.hashes, batchFileOf('test-batch'), L);
    expect(again.lines.map(l => l.outcome)).toEqual(['unchanged', 'unchanged']);
    expect(again.output).toEqual(out);

    const edited = batch({ questions: [question(1, { stem: '改過的題幹' }), question(2, { answer: 'C' })] });
    expect(plan(edited, bank, out, first.hashes, batchFileOf('test-batch'), L).errors).toContain('question test-q1: what a learner sees changed since revision 1: add "change" {kind, note, at} for a new revision');
    edited.questions[0].change = { kind: 'editorial', note: '修正錯字', at: '2026-11-04' };
    const revised = plan(edited, bank, out, first.hashes, batchFileOf('test-batch'), L);
    expect(revised.lines[0].outcome).toBe('revised');
    const q1 = revised.output!.questions[0];
    expect(q1.revisions.map(r => [r.revision, r.change])).toEqual([[1, 'initial'], [2, 'editorial']]);
    expect(q1.revisions[0]).toEqual(out.questions[0].revisions[0]);
    expect(revised.hashes!['test-q1@1']).toBe(first.hashes!['test-q1@1']);
    // T.2C: revision 1's approval and publication do not carry over; revision 2 is back in review and not published.
    expect(revised.lines[0]).toMatchObject({ status: 'in-review', held: [`第 2 版（${revisionHash(q1.revisions[1])}）尚無人工審核`] });
    expect(revised.hashes!['test-q1@2']).toBeUndefined();

    expect(plan(batch({ questions: [question(1)] }), bank, out, first.hashes, batchFileOf('test-batch'), L).errors).toContain('question test-q2: imported before but missing from the batch (retire it instead of deleting it)');
    const tampered = { ...first.hashes!, 'test-q1@1': '00000000' };
    expect(plan(batch(), bank, out, tampered, batchFileOf('test-batch'), L).errors.join('\n')).toMatch(/published revision 1 would change \(00000000 → /);
  });

  it('validates the whole bank with the batch in place', () => {
    const p = plan(batch({ questions: [question(1, { tags: ['no.such-tag'] }), question(2, { answer: 'C' })] }));
    expect(p.ok).toBe(false);
    expect(p.bankProblems).toContain('question test-q1: unknown tag no.such-tag');
    expect(p.output).toBeUndefined();
  });
});

describe('T.1.1 acceptance fixes', () => {
  it('I1: the generated file records the batch\'s own location, wherever the CLI was given it', () => {
    const elsewhere = plan(batch(), trialBank, undefined, published, '../scratch/copy.json');
    expect(elsewhere.ok).toBe(true);
    expect(elsewhere.warnings).toContain('the batch file is ../scratch/copy.json, not src/content/trials/batches/test-batch.json: only a batch at its own location can be written (--write)');
    expect(elsewhere.output!.batch.file).toBe('src/content/trials/batches/test-batch.json');
    expect(plan(batch()).output).toEqual(elsewhere.output);
    expect(plan(batch()).warnings).toEqual([]);
  });

  describe('I2: --write puts all three files in place or none', () => {
    let dir = '';
    const at = (name: string) => path.join(dir, name);
    const files = () => ['a.json', 'b.json', 'index.ts'].map(n => ({ path: at(n), content: `new ${n}` }));
    const contents = () => readdirSync(dir).sort().map(n => [n, existsSync(at(n)) && !n.includes('.bak-dir') ? readFileSync(at(n), 'utf8') : 'dir']);
    beforeEach(() => {
      dir = mkdtempSync(path.join(tmpdir(), 'trials-write-'));
      for (const n of ['a.json', 'b.json', 'index.ts']) writeFileSync(at(n), `old ${n}`);
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it('writes every file and leaves nothing temporary behind', () => {
      writeAllOrNothing(files(), 't');
      expect(contents()).toEqual([['a.json', 'new a.json'], ['b.json', 'new b.json'], ['index.ts', 'new index.ts']]);
    });

    it('a new file is created alongside replaced ones', () => {
      writeAllOrNothing([...files(), { path: at('c.json'), content: 'new c.json' }], 't');
      expect(contents().map(([n]) => n)).toEqual(['a.json', 'b.json', 'c.json', 'index.ts']);
    });

    it('a failure while placing the last file puts the first two back as they were', () => {
      // The last original cannot be moved aside (its backup name is taken by a folder), after two files were placed.
      mkdirSync(at('index.ts.bak-dir'));
      writeFileSync(path.join(at('index.ts.bak-dir'), 'x'), 'x');
      expect(() => writeAllOrNothing(files(), 'dir')).toThrow();
      expect(contents()).toEqual([['a.json', 'old a.json'], ['b.json', 'old b.json'], ['index.ts', 'old index.ts'], ['index.ts.bak-dir', 'dir']]);
    });

    it('a failure while writing the temporary files changes nothing', () => {
      expect(() => writeAllOrNothing([...files(), { path: path.join(dir, 'missing', 'c.json'), content: 'x' }], 't')).toThrow();
      expect(contents()).toEqual([['a.json', 'old a.json'], ['b.json', 'old b.json'], ['index.ts', 'old index.ts']]);
    });
  });
});

