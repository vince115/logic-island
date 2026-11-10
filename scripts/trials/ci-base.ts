import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BASE_FILES, type CiEvent } from '@/lib/trials/ci-base';
import { BOOTSTRAP_DECLARATION, decideBase } from '@/lib/trials/ci-bootstrap';
import { blobAt, gitReader as reader } from './git-reader';

/*
 * Shared Trial System T.3H: resolves the base commit of a CI run and copies the release files as they were there
 * (docs/exam-system/32 §8). Reads only: git is asked, never changed (no fetch, no checkout).
 *
 *   ci-base.ts [--event-name push] [--event-path event.json] [--remote origin] [--out-dir dir] [--json report.json]
 *              [--github-output file]
 *
 * The event comes from GITHUB_EVENT_NAME / GITHUB_EVENT_PATH unless given. With a trusted base, each file of BASE_FILES
 * is written to <out-dir>/base-<name>.json, and the report (and --github-output) names it. Without a trusted base
 * nothing is written but the report, and the exit code is 1: the workflow stops before any check.
 * Exit codes: 0 resolved, 1 no trusted base, 2 usage.
 *
 * T.3I (docs/exam-system/33 §2–3): a file absent at the base is no longer compared "without a base". The base must hold
 * every release file (mode=compare); one that holds none of them is a bootstrap only when this run is the one the
 * declaration names (mode=bootstrap, and the workflow then runs trials:ci-bootstrap); anything else fails.
 */
const args = process.argv.slice(2);
const OPTS = ['--event-name', '--event-path', '--remote', '--out-dir', '--json', '--github-output'];
const opt = (name: string) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const unknown = args.filter((a, i) => a.startsWith('--') ? !OPTS.includes(a) : !OPTS.includes(args[i - 1]));
if (unknown.length) { console.error(`unknown argument ${unknown[0]}`); process.exit(2); }

const name = opt('--event-name') ?? process.env.GITHUB_EVENT_NAME, eventPath = opt('--event-path') ?? process.env.GITHUB_EVENT_PATH;
if (!name || !eventPath || !existsSync(eventPath)) { console.error('give the event: --event-name and --event-path (or GITHUB_EVENT_NAME and GITHUB_EVENT_PATH)'); process.exit(2); }
// T.3I: an event file that is not a JSON object is no event: fail closed with the report, like any untrusted base.
let payload: CiEvent['payload'] | undefined;
try { const p = JSON.parse(readFileSync(eventPath, 'utf8')); if (p && typeof p === 'object' && !Array.isArray(p)) payload = p; } catch { /* reported below */ }
let declaration: unknown;
try { const b = blobAt('HEAD', BOOTSTRAP_DECLARATION); declaration = b && JSON.parse(b.toString('utf8')); } catch { declaration = { invalid: true }; }
const { resolution, mode, eligibility } = decideBase(name, payload, reader, declaration, opt('--remote') ?? 'origin');
const outDir = opt('--out-dir') ?? '.trials-base';
const files: Record<string, string | null> = {};
if (mode === 'compare') {
  mkdirSync(outDir, { recursive: true });
  for (const [key, file] of Object.entries(BASE_FILES)) {
    const target = path.join(outDir, `base-${key}.json`);
    writeFileSync(target, blobAt(resolution.base!, file)!);
    files[key] = target;
  }
}
const report = { ...resolution, mode, files, eligibility };
const json = opt('--json');
if (json) writeFileSync(json, `${JSON.stringify(report, null, 1)}\n`);
const output = opt('--github-output');
if (output) appendFileSync(output, [`ok=${resolution.ok}`, `mode=${mode ?? ''}`, `base=${resolution.ok ? resolution.base : ''}`, ...Object.keys(BASE_FILES).map(k => `${k}=${files[k] ?? ''}`)].join('\n') + '\n');

if (!resolution.ok) { console.error(`NO TRUSTED BASE (${name}): ${resolution.reason}`); process.exit(1); }
console.log(`base ${resolution.base} for ${name} at ${resolution.head}: ${resolution.strategy} — ${resolution.reason}`);
if (mode === 'bootstrap') console.log(`  BOOTSTRAP: the base holds no release file; this is the run ${BOOTSTRAP_DECLARATION} declares. The append-only checks have nothing to compare with: run trials:ci-bootstrap.`);
for (const [key, file] of Object.entries(files)) console.log(`  ${key}: ${file}`);
