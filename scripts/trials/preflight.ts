import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { playableQuestions, trialBank } from '@/content/trials';
import { trialContext } from '@/content/trials/context';
import { mockBlueprints } from '@/content/trials/mock-exams';
import { validateTrials } from '@/content/trials/schema';
import { allowedTrialRoutes, dataChecks, exposureNeedles, leakCheck, routeCheck, type Check } from '@/lib/trials/preflight';
import { ROOT } from './ledger-io';
import { preflightInput } from './preflight-input';

/*
 * Shared Trial System T.2F: the release preflight (docs/exam-system/22 §2). Reads only: it never writes a file,
 * approves or publishes. Exits 1 when any check fails, 2 on a usage error, 0 otherwise (warnings included).
 *
 *   preflight.ts [--build .next] [--probe http://127.0.0.1:3119] [--require-ready ipas-aiap-basic] [--today YYYY-MM-DD]
 *                [--baseline tests/fixtures/published-hashes-baseline.json] [--seeds 50] [--json]
 *
 * --build scans a finished `next build` (client chunks, prerendered pages, route manifests); --probe asks a running
 * server on this machine for the trial routes. Without them those checks are reported as skipped, not passed.
 */
const args = process.argv.slice(2);
const opt = (name: string) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const many = (name: string) => args.flatMap((a, i) => a === name && args[i + 1] ? [args[i + 1]] : []);
const today = opt('--today') ?? new Date().toISOString().slice(0, 10);
const baselineFile = path.resolve(ROOT, opt('--baseline') ?? 'tests/fixtures/published-hashes-baseline.json');
if (!existsSync(baselineFile)) { console.error(`no baseline at ${baselineFile}`); process.exit(2); }

const files = (dir: string): string[] => !existsSync(dir) ? [] : readdirSync(dir).flatMap(f => {
  const p = path.join(dir, f);
  return statSync(p).isDirectory() ? files(p) : [p];
});

const input = preflightInput({ today, baselineFile, requireReady: many('--require-ready'), seeds: Number(opt('--seeds') ?? 50) });
const problems = validateTrials(trialBank, trialContext());
const checks: Check[] = [
  { id: 'bank', title: 'Bank validates', status: problems.length ? 'fail' : 'pass', details: problems },
  ...dataChecks(input),
];

const needles = exposureNeedles(trialBank, playableQuestions, mockBlueprints, trialBank.papers.map(p => p.id));
const allowed = allowedTrialRoutes(trialBank);
const build = opt('--build') && path.resolve(opt('--build')!);
if (build && !existsSync(path.join(build, 'prerender-manifest.json'))) { console.error(`${build} is not a finished next build`); process.exit(2); }
const scanned = build ? [
  ...files(path.join(build, 'static')).filter(f => /\.(js|css|json|txt)$/.test(f)),
  ...files(path.join(build, 'server/app')).filter(f => /\.(html|rsc|body|meta|json)$/.test(f)),
].map(f => ({ path: path.relative(build, f), text: readFileSync(f, 'utf8') })) : undefined;
checks.push(leakCheck(scanned, needles));
const routes = build ? Object.keys(JSON.parse(readFileSync(path.join(build, 'prerender-manifest.json'), 'utf8')).routes) : undefined;
const handlers = build ? Object.keys(JSON.parse(readFileSync(path.join(build, 'server/app-paths-manifest.json'), 'utf8'))).filter(r => r.endsWith('/route')) : undefined;
checks.push(routeCheck(routes, handlers, allowed, needles));

const probe = opt('--probe');
if (probe) {
  const origin = new URL(probe);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)) { console.error('--probe only asks a server on this machine'); process.exit(2); }
  const fails: string[] = [], info: string[] = [];
  const hidden = [...new Set(trialBank.exams.filter(e => !trialBank.papers.some(p => allowed.has(`/trials/${e.id}/${p.id}`))).map(e => e.id))];
  const unready = mockBlueprints.flatMap(bp => bp.modes.map(m => `${bp.id}-${m.idSuffix}`)).filter(id => !trialBank.papers.some(p => p.id === id));
  const urls: [string, number][] = [
    ...[...allowed].map(u => [u, 200] as [string, number]),
    ...hidden.flatMap(e => [`/trials/${e}`, ...unready.map(id => `/trials/${e}/${id}`), ...unready.map(id => `/trials/${e}/${id}/result`)]).map(u => [u, 404] as [string, number]),
    ['/api/trials', 404],
  ];
  for (const [u, want] of urls) {
    const res = await fetch(new URL(u, origin), { redirect: 'manual' }), body = await res.text();
    if (res.status !== want) fails.push(`${u}: ${res.status}, expected ${want}`);
    const hit = needles.find(n => body.includes(n));
    if (hit) fails.push(`${u}: response holds "${hit}"`);
  }
  info.push(`${urls.length} routes asked at ${origin.origin}`);
  checks.push({ id: 'probe', title: 'Runtime route probe', status: fails.length ? 'fail' : 'pass', details: [...fails, ...info] });
} else checks.push({ id: 'probe', title: 'Runtime route probe', status: 'skip', details: ['no server given (--probe http://127.0.0.1:<port>)'] });

const failed = checks.filter(c => c.status === 'fail');
if (args.includes('--json')) console.log(JSON.stringify({ today, ok: !failed.length, checks }, null, 1));
else {
  const mark = { pass: 'PASS', warn: 'WARN', fail: 'FAIL', skip: 'SKIP' };
  for (const c of checks) {
    console.log(`${mark[c.status]}  ${c.title}`);
    for (const d of c.details.slice(0, 20)) console.log(`      ${d}`);
    if (c.details.length > 20) console.log(`      … ${c.details.length - 20} more`);
  }
  console.log(failed.length ? `\npreflight FAILED: ${failed.map(c => c.id).join(', ')}` : `\npreflight passed (${checks.filter(c => c.status === 'skip').length} skipped, ${checks.filter(c => c.status === 'warn').length} with warnings); nothing was written`);
}
process.exit(failed.length ? 1 : 0);
