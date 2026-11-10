import path from 'node:path';
import { trialBank } from '@/content/trials';
import { examResolver, planRevocation } from '@/lib/trials/lifecycle';
import { ROOT, bankQuestions, readHashes, readLedger, rebuild } from './ledger-io';
import { writeAllOrNothing } from './write-files';

/*
 * Shared Trial System T.3F: the withdrawal gate (docs/exam-system/30 §5).
 *
 *   node … scripts/trials/revoke.ts <question id>@<revision> … --by owner --at YYYY-MM-DD --reason "…" [--exam ccarf]             dry run
 *   node … scripts/trials/revoke.ts <question id>@<revision> … --by owner --at YYYY-MM-DD --reason "…" [--exam ccarf] --confirm N  withdraw
 *
 * Withdraws the named live revisions: appends one revocation per revision to the ledger (the publication stays), then
 * rebuilds the generated questions so each becomes `revoked` and leaves every new paper. Writes all files or none;
 * published-hashes.json is never changed. Publishing a withdrawn revision again needs a new human approval and
 * `publish.ts --republish`.
 */
const args = process.argv.slice(2);
const opt = (name: string) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const flags = new Set(['--by', '--at', '--confirm', '--reason', '--exam']);
const targets = args.filter((a, i) => !a.startsWith('--') && !flags.has(args[i - 1]));
const by = opt('--by'), at = opt('--at'), reason = opt('--reason'), confirm = opt('--confirm'), exam = opt('--exam');
if (!targets.length || !by || !at || !reason) {
  console.error('usage: revoke.ts <question id>@<revision> … --by <reviewer id> --at YYYY-MM-DD --reason "<why>" [--exam <exam>] [--confirm <count>]');
  process.exit(2);
}

const committed = readLedger();
const plan = planRevocation(targets, bankQuestions(), committed, by, at, reason, confirm === undefined ? undefined : Number(confirm), readHashes(), examResolver(trialBank), exam);
const dryRun = confirm === undefined;
if (!plan.ok && !(dryRun && plan.errors.every(e => e.startsWith('not confirmed')))) {
  console.error(['withdrawal refused (nothing was changed):', ...plan.errors.map(e => `- ${e}`)].join('\n'));
  process.exit(1);
}
if (dryRun) {
  console.log(`dry run: ${targets.length} revision(s) can be withdrawn by ${by}. Withdraw them with --confirm ${targets.length}.`);
  process.exit(0);
}
const result = rebuild(plan.ledger!, committed);
const still = targets.filter(t => result.statuses.get(t.split('@')[0]) !== 'revoked');
if (!result.ok || still.length) {
  console.error(['withdrawal refused (nothing was changed):', ...result.errors.map(e => `- ${e}`), ...still.map(t => `- ${t} would not be withdrawn`)].join('\n'));
  process.exit(1);
}
writeAllOrNothing(result.files);
console.log(`withdrew ${plan.added} revision(s); wrote ${result.files.map(f => path.relative(ROOT, f.path)).join(', ')}`);
