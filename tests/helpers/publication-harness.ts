import { readFileSync } from 'node:fs';
import { sourceById, tagById, trialBank } from '../../src/content/trials';
import { conflictPairs } from '../../src/content/trials/conflicts';
import { trialContext } from '../../src/content/trials/context';
import { mockBlueprints } from '../../src/content/trials/mock-exams';
import { currentRevisionOf, revisionHash, type Question, type TrialBank } from '../../src/content/trials/schema';
import { batchFileOf, planImport, type ImportBatch } from '../../src/lib/trials/import';
import { batchIds, batchPathOf, generatedOf } from '../../scripts/trials/ledger-io';
import {
  DECISIONS_FORMAT, committedLedger, examResolver, planDecisions, planPublication, planRevocation, requiredChecks, type Ledger, type Reviewer,
} from '../../src/lib/trials/lifecycle';
import { assembleMockPapers } from '../../src/lib/trials/mock-assembly';
import published from '../../src/content/trials/published-hashes.json';

/*
 * Shared Trial System T.3F: the isolated publication lifecycle harness (docs/exam-system/30 §6).
 *
 * Everything here lives in memory: a copy of the committed ledger with one SYNTHETIC reviewer (not a person, never a
 * real approval), the batch files read from disk and re-planned with that ledger, and the papers assembled from the
 * result. Nothing is written, so no record can reach src/content/trials/ledger.json; the release preflight also fails
 * any ledger that holds a synthetic reviewer or record.
 */
export const SYNTHETIC: Reviewer = { id: 'synthetic-reviewer', name: 'SYNTHETIC test reviewer (not a person)', roles: ['review', 'publish'] };
export const SYNTHETIC_NOTE = 'SYNTHETIC: test fixture record, not a human approval';
export const examOf = examResolver(trialBank);

export interface World { ledger: Ledger; bank: TrialBank; hashes: Record<string, string> }

/** The committed state with the synthetic reviewer added to a deep copy of the ledger. */
export function syntheticWorld(): World {
  const ledger: Ledger = { ...structuredClone(committedLedger), reviewers: [...structuredClone(committedLedger.reviewers), SYNTHETIC] };
  return { ledger, bank: trialBank, hashes: { ...published as Record<string, string> } };
}

// T.3J: this repository's batches and the private bank's (scripts/trials/ledger-io.ts).
const batches = (match: string) => batchIds().filter(id => id.includes(match));

/**
 * Re-plans every batch whose id contains `match` with the world's ledger, as the review and publish CLIs do before
 * writing (in memory here). `edit` may change a batch file's content first (a new revision needs a change note).
 */
export function replan(w: World, match: string, edit?: (raw: ImportBatch) => ImportBatch): World {
  const ctx = trialContext();
  let { bank, hashes } = w;
  for (const id of batches(match)) {
    const file = batchFileOf(id), previous = generatedOf(id);
    // The previous output is the bank's current state of the batch (it carries any revision an earlier replan added).
    const mine = new Set(previous.questions.map(q => q.id));
    const before = { ...previous, questions: bank.questions.filter(q => mine.has(q.id)) };
    const batch = JSON.parse(readFileSync(batchPathOf(id), 'utf8')) as ImportBatch;
    const raw = edit ? edit(batch) : batch;
    const plan = planImport(raw, bank, ctx, before, hashes, file, undefined, w.ledger);
    if (!plan.ok) throw new Error(`${id}: ${[...plan.errors, ...plan.bankProblems].join('; ')}`);
    hashes = plan.hashes!;
    const out = new Map(plan.output!.questions.map(q => [q.id, q]));
    bank = { ...bank, questions: bank.questions.map(q => out.get(q.id) ?? q) };
  }
  return { ...w, bank, hashes };
}

const q = (w: World, id: string) => w.bank.questions.find(x => x.id === id)!;
export const head = (x: Question) => { const r = currentRevisionOf(x)!; return { revision: r.revision, hash: revisionHash(r) }; };

/** Synthetic human-review input: one decision file per 25 questions, each decision on the current revision and hash. */
export function approve(w: World, ids: string[], at: string, exam = 'ccarf'): World {
  let ledger = w.ledger;
  for (let i = 0; i < ids.length; i += 25) {
    const part = ids.slice(i, i + 25);
    const file = { format: DECISIONS_FORMAT, exam, by: SYNTHETIC.id, at, decisions: part.map(id => ({ questionId: id, ...head(q(w, id)), verdict: 'approve' as const, checks: [...new Set([...requiredChecks(q(w, id)), 'answer-verified' as const])], note: SYNTHETIC_NOTE })) };
    const plan = planDecisions(file, w.bank.questions, ledger, part.length, examOf);
    if (!plan.ok) throw new Error(plan.errors.join('; '));
    ledger = plan.ledger!;
  }
  return { ...w, ledger };
}

export function publish(w: World, ids: string[], at: string, options: { republish?: boolean; exam?: string } = {}) {
  const targets = ids.map(id => `${id}@${q(w, id).currentRevision}`);
  return planPublication(targets, w.bank.questions, w.ledger, SYNTHETIC.id, at, targets.length, w.hashes, examOf, options);
}

export function revoke(w: World, ids: string[], at: string, reason = 'SYNTHETIC withdrawal drill', exam?: string) {
  const targets = ids.map(id => `${id}@${q(w, id).currentRevision}`);
  return planRevocation(targets, w.bank.questions, w.ledger, SYNTHETIC.id, at, reason, targets.length, w.hashes, examOf, exam);
}

export const blueprint = (examId: string) => mockBlueprints.find(b => b.examId === examId)!;
export const assemble = (w: World, examId: string) => assembleMockPapers(blueprint(examId), w.bank.questions, sourceById, w.hashes, conflictPairs(), tagById);
