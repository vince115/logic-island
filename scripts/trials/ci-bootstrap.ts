import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { trialBank } from '@/content/trials';
import { trialContext } from '@/content/trials/context';
import { validateTrials } from '@/content/trials/schema';
import { resolveBase, type CiEvent } from '@/lib/trials/ci-base';
import {
  BOOTSTRAP_DECLARATION, BOOTSTRAP_FILES, BOOTSTRAP_FORMAT, FUTURE_COMPARISON, TRUST_ASSUMPTIONS, UNVERIFIABLE, bootstrapEligibility, historyReplay,
  type BootstrapDeclaration, type BootstrapFile, type Eligibility,
} from '@/lib/trials/ci-bootstrap';
import { dataChecks, type Check } from '@/lib/trials/preflight';
import { blobAt, commitsTouching, gitReader as reader, sha256 } from './git-reader';
import { ROOT } from './ledger-io';
import { preflightInput } from './preflight-input';

/*
 * Shared Trial System T.3I: the CI bootstrap check (docs/exam-system/33 §2–3). Reads only: nothing is approved,
 * published, repaired or written but the report.
 *
 *   ci-bootstrap.ts [--event-name push] [--event-path event.json] [--remote origin] [--json report.json]
 *
 * It runs only on the run the bootstrap declaration names (bootstrapEligibility: the first push of the declared
 * branch, or a pull request from it, on the declared base, with the release files exactly as declared). Anything
 * else is refused before any check — it is never a way around a failed or missing base. When allowed it checks the
 * current state (bank, ledger and its replay, revision hashes, assessment manifest, fixed paper versions, published
 * hashes, unpublished exposure, cross-exam isolation), replays the release files through the local history, and
 * reports what it verified, what it cannot verify, what it trusts, and what every later run must compare.
 * Exit codes: 0 allowed and every check passed, 1 refused or a check failed, 2 usage.
 */
const args = process.argv.slice(2);
const OPTS = ['--event-name', '--event-path', '--remote', '--json'];
const opt = (name: string) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const unknown = args.filter((a, i) => a.startsWith('--') ? !OPTS.includes(a) : !OPTS.includes(args[i - 1]));
if (unknown.length) { console.error(`unknown argument ${unknown[0]}`); process.exit(2); }
const name = opt('--event-name') ?? process.env.GITHUB_EVENT_NAME, eventPath = opt('--event-path') ?? process.env.GITHUB_EVENT_PATH;
if (!name || !eventPath || !existsSync(eventPath)) { console.error('give the event: --event-name and --event-path (or GITHUB_EVENT_NAME and GITHUB_EVENT_PATH)'); process.exit(2); }

let payload: CiEvent['payload'] | undefined;
try { const p = JSON.parse(readFileSync(eventPath, 'utf8')); if (p && typeof p === 'object' && !Array.isArray(p)) payload = p; } catch { /* refused below */ }
const event: CiEvent = { name, payload: payload ?? {} };
const head = reader.head();
let declaration: unknown;
try { const b = blobAt(head, BOOTSTRAP_DECLARATION); declaration = b && JSON.parse(b.toString('utf8')); } catch { declaration = { invalid: true }; }
const resolution = payload ? resolveBase(event, reader, opt('--remote') ?? 'origin') : undefined;
const eligibility: Eligibility = resolution ? bootstrapEligibility(event, resolution, declaration, reader)
  : { eligible: false, checks: [{ id: 'event', ok: false, detail: `the event payload at ${eventPath} is not a JSON object` }] };

const checks: Check[] = [];
let history: Record<string, ReturnType<typeof historyReplay>> | undefined;
if (eligibility.eligible) {
  const d = declaration as BootstrapDeclaration, base = resolution!.base!;
  // The checks read the files on disk: they must be the pushed commit's, byte for byte.
  const onDisk = (Object.keys(BOOTSTRAP_FILES) as BootstrapFile[]).filter(k => {
    const f = path.join(ROOT, BOOTSTRAP_FILES[k]);
    return !existsSync(f) || sha256(readFileSync(f)) !== d.files[k];
  });
  checks.push({ id: 'working-tree', title: 'Release files on disk are the pushed commit\'s', status: onDisk.length ? 'fail' : 'pass', details: onDisk.map(k => `${BOOTSTRAP_FILES[k]} differs from ${head}`) });
  const problems = validateTrials(trialBank, trialContext());
  checks.push({ id: 'bank', title: 'Bank validates', status: problems.length ? 'fail' : 'pass', details: problems });
  const wanted = new Set(['ledger', 'ledger-replay', 'revision-hash', 'assessment-integrity', 'paper-versions', 'published-hashes', 'exposure-data', 'cross-exam']);
  const input = preflightInput({ today: new Date().toISOString().slice(0, 10), baselineFile: path.join(ROOT, 'tests/fixtures/published-hashes-baseline.json') });
  checks.push(...dataChecks(input).filter(c => wanted.has(c.id)));
  history = Object.fromEntries((Object.keys(BOOTSTRAP_FILES) as BootstrapFile[]).map(k => {
    const file = BOOTSTRAP_FILES[k];
    return [k, historyReplay(k, commitsTouching(base, head, file).map(commit => ({ commit, text: blobAt(commit, file)?.toString('utf8') ?? null })))];
  }));
  const breaks = Object.values(history).flatMap(h => h.failures);
  checks.push({ id: 'local-history', title: 'Release files through the local history (consistent, not proven)', status: breaks.length ? 'fail' : 'pass',
    details: [...breaks, ...Object.entries(history).map(([k, h]) => `${k}: ${h.commits} version(s) from ${base.slice(0, 7)} to ${head.slice(0, 7)}`), ...Object.values(history).flatMap(h => h.notes)] });
}

const failed = checks.filter(c => c.status === 'fail');
const ok = eligibility.eligible && !failed.length;
const d = eligibility.eligible ? declaration as BootstrapDeclaration : undefined;
const report = {
  format: BOOTSTRAP_FORMAT, ok, event: name, head, base: resolution?.base, strategy: resolution?.strategy,
  eligible: eligibility.eligible, eligibility: eligibility.checks,
  baseline: d ? { sha: head, branch: d.branch, repository: d.repository, base: d.base, anchor: d.anchor, files: d.files, declaration: BOOTSTRAP_DECLARATION, declaredAt: d.declaredAt } : undefined,
  verified: checks.map(c => ({ id: c.id, title: c.title, status: c.status, details: c.details })),
  history, unverifiable: UNVERIFIABLE, trustAssumptions: TRUST_ASSUMPTIONS, futureComparison: FUTURE_COMPARISON,
};
const json = opt('--json');
if (json) writeFileSync(json, `${JSON.stringify(report, null, 1)}\n`);
if (!eligibility.eligible) {
  console.error(['BOOTSTRAP REFUSED (no check was run; this is not the declared first run):', ...eligibility.checks.filter(c => !c.ok).map(c => `- ${c.id}: ${c.detail}`)].join('\n'));
  process.exit(1);
}
for (const c of checks) console.log(`${c.status.toUpperCase().padEnd(4)}  ${c.title}`);
console.log(`bootstrap baseline ${head} (base ${resolution!.base}); ${UNVERIFIABLE.length} historical properties are not verifiable (see the report)`);
if (!ok) { console.error(`BOOTSTRAP FAILED: ${failed.map(c => c.id).join(', ')}`); process.exit(1); }
console.log('bootstrap checks passed; every later run must compare with a trusted base. Nothing was written but the report.');
