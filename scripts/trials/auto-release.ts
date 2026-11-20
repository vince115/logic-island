import path from 'node:path';
import { sourceById, tagById, trialBank } from '@/content/trials';
import { currentRevisionOf, revisionHash } from '@/content/trials/schema';
import { DECISIONS_FORMAT, MAX_DECISIONS, STRUCTURAL, examResolver, planDecisions, planPublication, type Ledger } from '@/lib/trials/lifecycle';
import { structuralProblems } from '@/lib/trials/structural';
import { ROOT, readHashes, readLedger, rebuild } from './ledger-io';
import { writeAllOrNothing } from './write-files';

/*
 * Docs 35: release for practice on a structural check (the owner's decision of 2026-11-12: do not hold practice
 * questions back for a human review).
 *
 *   auto-release.ts --exam ipas-aiap-basic --at YYYY-MM-DD [--by owner]                  dry run: who passes, who fails and why
 *   auto-release.ts --exam ipas-aiap-basic --at YYYY-MM-DD [--by owner] --confirm <N>    records and publishes the N that pass
 *
 * For every question of the exam that is waiting for review, passes src/lib/trials/structural.ts and is an original, it
 * appends (1) a structural-check decision by the automated reviewer `auto-structural` and (2) the publication by `--by`
 * (a person with the publish role, who is the one releasing). Both go through the same gates as a human review
 * (planDecisions, planPublication, rebuild): the content hash is bound, the ledger is append-only, files are written all
 * or none. Questions that fail stay as they are and are listed with the reasons. Nothing here is a human approval or a
 * content verification; scripts/trials/release-gate.ts keeps saying so.
 */
const args = process.argv.slice(2);
const opt = (name: string) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const exam = opt('--exam'), at = opt('--at'), by = opt('--by') ?? 'owner', confirm = opt('--confirm');
const AUTO = 'auto-structural';
if (!exam || !at) { console.error('usage: auto-release.ts --exam <exam id> --at YYYY-MM-DD [--by <publisher>] [--confirm <count>]'); process.exit(2); }

const committed = readLedger(), examOf = examResolver(trialBank);
if (!committed.reviewers.some(r => r.id === AUTO && r.kind === 'automated')) { console.error(`the ledger has no automated reviewer ${AUTO}`); process.exit(1); }

const mine = trialBank.questions.filter(q => examOf(q) === exam && q.review.status === 'in-review');
const pass: typeof mine = [], fail: { id: string; why: string[] }[] = [];
for (const q of mine) {
  const why = structuralProblems(q, sourceById, tagById);
  if (why.length) fail.push({ id: q.id, why }); else pass.push(q);
}
const exams = new Set(trialBank.questions.filter(q => examOf(q) === exam).map(q => q.id));
console.log(`${exam}: ${exams.size} question(s) in the bank, ${mine.length} waiting for review, ${pass.length} pass the structural check, ${fail.length} fail.`);
for (const f of fail) console.log(`  FAIL ${f.id}: ${f.why.join('；')}`);
if (!pass.length) process.exit(fail.length ? 1 : 0);
if (confirm === undefined) { console.log(`dry run: nothing written. Release the ${pass.length} with --confirm ${pass.length}.`); process.exit(0); }
if (Number(confirm) !== pass.length) { console.error(`not confirmed: ${pass.length} would be released, --confirm says ${confirm}`); process.exit(1); }

let ledger: Ledger = committed;
for (let i = 0; i < pass.length; i += MAX_DECISIONS) {
  const chunk = pass.slice(i, i + MAX_DECISIONS);
  const file = { format: DECISIONS_FORMAT, exam, by: AUTO, at, basis: STRUCTURAL, decisions: chunk.map(q => { const rev = currentRevisionOf(q)!; return { questionId: q.id, revision: rev.revision, hash: revisionHash(rev), verdict: 'approve', checks: [], note: '僅通過自動結構檢查（docs/exam-system/35），尚未經人工專業驗證' }; }) };
  const plan = planDecisions(file, trialBank.questions, ledger, chunk.length, examOf);
  if (!plan.ok) { console.error(['structural decisions refused (nothing was changed):', ...plan.errors.map(e => `- ${e}`)].join('\n')); process.exit(1); }
  ledger = plan.ledger!;
}
const targets = pass.map(q => `${q.id}@${currentRevisionOf(q)!.revision}`);
const publication = planPublication(targets, trialBank.questions, ledger, by, at, targets.length, readHashes(), examOf, { exam });
if (!publication.ok) { console.error(['publication refused (nothing was changed):', ...publication.errors.map(e => `- ${e}`)].join('\n')); process.exit(1); }
const result = rebuild(publication.ledger!, committed);
const notPublished = targets.filter(t => result.statuses.get(t.split('@')[0]) !== 'published');
if (!result.ok || notPublished.length) {
  console.error(['release refused (nothing was changed):', ...result.errors.map(e => `- ${e}`), ...notPublished.map(t => `- ${t} would not be published`)].join('\n'));
  process.exit(1);
}
writeAllOrNothing(result.files);
console.log(`released ${targets.length} question(s) for practice on a structural check; wrote ${result.files.map(f => path.relative(ROOT, f.path)).join(', ')}`);
