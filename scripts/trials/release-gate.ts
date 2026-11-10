import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { trialBank } from '@/content/trials';
import { privateFile } from '@/content/trials/private-bank';
import { dataChecks } from '@/lib/trials/preflight';
import { releaseGate } from '@/lib/trials/release-gate';
import { gitReader } from './git-reader';
import { ROOT, readLedger } from './ledger-io';
import { preflightInput } from './preflight-input';

/*
 * Shared Trial System T.3I: the release authorization gate, on this repository (docs/exam-system/33 §10). Reads only.
 *
 *   release-gate.ts --targets <id@revision>,… [--preflight-build report.json] [--json report.json]
 *
 * Fills in what can be known here: the human approvals in the ledger, the local data checks, the priority-1 lists of
 * the review queues, and (with --preflight-build) the bundle, route and probe results of a preflight report. It has no
 * way to record remote CI, branch protection, a compliance review or a release authorization: those are observed or
 * given by people, in the release pull request (governance/RELEASE_AUTHORIZATION_CHECKLIST.md). So on its own it never
 * says releasable. Exit codes: 0 releasable, 1 not releasable, 2 usage.
 */
const args = process.argv.slice(2);
const OPTS = ['--targets', '--preflight-build', '--json'];
const opt = (name: string) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const unknown = args.filter((a, i) => a.startsWith('--') ? !OPTS.includes(a) : !OPTS.includes(args[i - 1]));
const targets = (opt('--targets') ?? '').split(',').filter(Boolean);
if (unknown.length || !targets.length || !targets.every(t => /^[\w-]+@\d+$/.test(t))) { console.error('give --targets <id@revision>,…'); process.exit(2); }

const local = dataChecks(preflightInput({ today: new Date().toISOString().slice(0, 10), baselineFile: path.join(ROOT, 'tests/fixtures/published-hashes-baseline.json') }));
const checks: Record<string, string> = Object.fromEntries(local.map(c => [c.id, c.status]));
const buildReport = opt('--preflight-build');
if (buildReport) {
  if (!existsSync(buildReport)) { console.error(`no preflight report at ${buildReport}`); process.exit(2); }
  for (const c of (JSON.parse(readFileSync(buildReport, 'utf8')) as { checks: { id: string; status: string }[] }).checks) if (['bundle-leak', 'routes', 'probe'].includes(c.id)) checks[c.id] = c.status;
}
const priority1 = ['ccarf', 'ipas'].flatMap(exam => {
  const f = privateFile(`data/${exam}-review-queue.json`); // T.3J: the queues are in the private bank
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as { items: { id: string; priority?: number }[] }).items.filter(i => i.priority === 1).map(i => i.id) : [];
});
// Without a git checkout there is no commit to authorize: the remote and authorization gates then cannot match it.
let head = '(no git checkout)';
try { head = gitReader.head(); } catch { /* reported through the gates */ }
const result = releaseGate({ targets, questions: trialBank.questions, ledger: readLedger(), head, checks, priority1 });
const json = opt('--json');
if (json) writeFileSync(json, `${JSON.stringify({ format: 'logic-island.trials-release-gate/1', targets, ...result }, null, 1)}\n`);
for (const g of result.gates) console.log(`${g.status.padEnd(20)} ${g.kind.padEnd(11)} ${g.title}${g.status.endsWith('verified') && !g.status.startsWith('not') ? '' : `: ${g.details[0] ?? ''}`}`);
console.log(result.releasable ? 'RELEASABLE' : 'NOT RELEASABLE: every gate needs its own kind of evidence; nothing was published or written');
process.exit(result.releasable ? 0 : 1);
