import path from 'node:path';
import { trialBank } from '@/content/trials';
import { examResolver, planPublication } from '@/lib/trials/lifecycle';
import { ROOT, bankQuestions, readHashes, readLedger, rebuild } from './ledger-io';
import { writeAllOrNothing } from './write-files';

/*
 * Shared Trial System T.2C: the publication gate (docs/exam-system/19).
 *
 *   node … scripts/trials/publish.ts <question id>@<revision> … --by owner --at YYYY-MM-DD             dry run
 *   node … scripts/trials/publish.ts <question id>@<revision> … --by owner --at YYYY-MM-DD --confirm N  publish
 *
 * Publishes the named revisions only if each is the current revision, its content hash recomputed now equals the hash a
 * human approved, the latest decision on it is that approval, and `--by` may publish. N must equal the number of
 * revisions named. Writes the ledger, the regenerated questions and published-hashes.json, all or none. Importing,
 * reviewing and building never publish.
 *
 * T.3F: a withdrawn revision is published again only with --republish, on a human approval that comes after the
 * withdrawal; --exam restricts every target to one certification.
 */
const args = process.argv.slice(2);
const opt = (name: string) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const flags = new Set(['--by', '--at', '--confirm', '--exam']);
const targets = args.filter((a, i) => !a.startsWith('--') && !flags.has(args[i - 1]));
const by = opt('--by'), at = opt('--at'), confirm = opt('--confirm'), exam = opt('--exam'), republish = args.includes('--republish');
if (!targets.length || !by || !at) {
  console.error('usage: publish.ts <question id>@<revision> … --by <reviewer id> --at YYYY-MM-DD [--exam <exam>] [--republish] [--confirm <count>]');
  process.exit(2);
}

const committed = readLedger();
const plan = planPublication(targets, bankQuestions(), committed, by, at, confirm === undefined ? undefined : Number(confirm), readHashes(), examResolver(trialBank), { republish, exam });
const dryRun = confirm === undefined;
if (!plan.ok && !(dryRun && plan.errors.every(e => e.startsWith('not confirmed')))) {
  console.error(['publication refused (nothing was changed):', ...plan.errors.map(e => `- ${e}`)].join('\n'));
  process.exit(1);
}
if (dryRun) {
  console.log(`dry run: ${targets.length} revision(s) can be published by ${by}. Publish them with --confirm ${targets.length}.`);
  process.exit(0);
}
const result = rebuild(plan.ledger!, committed);
const notPublished = targets.filter(t => result.statuses.get(t.split('@')[0]) !== 'published');
if (!result.ok || notPublished.length) {
  console.error(['publication refused (nothing was changed):', ...result.errors.map(e => `- ${e}`), ...notPublished.map(t => `- ${t} would not be published`)].join('\n'));
  process.exit(1);
}
writeAllOrNothing(result.files);
console.log(`published ${plan.added} revision(s); wrote ${result.files.map(f => path.relative(ROOT, f.path)).join(', ')}`);
