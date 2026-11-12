import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { trialBank } from '@/content/trials';
import { appendEntries, appendOnlyFailures, integrityFailures, verifyManifest, type Manifest } from '@/lib/trials/integrity';
import { examResolver } from '@/lib/trials/lifecycle';
import { appendPaperVersions, checkPaperVersions, paperVersionFailures, paperVersionsAppendOnly, type PaperVersions } from '@/lib/trials/paper-versions';
import { MANIFEST, ROOT, manifestWrites, readManifest } from './ledger-io';
import { writeAllOrNothing } from './write-files';

/*
 * Shared Trial System T.3F: the assessment integrity guard (docs/exam-system/30 §3).
 *
 *   integrity.ts [--json report.json] [--base earlier-manifest.json]     verify (read-only); exit 1 on any mismatch
 *   integrity.ts --append                                                 dry run: list the revisions it would add
 *   integrity.ts --append --confirm N                                     add N unrecorded revisions to the manifest
 *
 * Verification compares every revision of the bank with src/content/trials/assessment-manifest.json, and with --base
 * also checks that no earlier entry was rewritten or dropped. It never repairs: --append only adds revisions the
 * manifest has not seen, refuses while any recorded revision mismatches, and asks for the count explicitly.
 * Reports name revisions, parts and hashes only, never question text or answers. Exit codes: 0 pass, 1 fail, 2 usage.
 *
 * T.3G (docs/exam-system/31 §6): the same for fixed papers. src/content/trials/paper-versions.json holds every version
 * of every fixed paper, each item pinned to its revision and hash; a fixed paper that differs from its registered
 * version fails, and --append also registers a new version a human wrote (append-only; --base-papers checks that no
 * registered version was rewritten or dropped).
 */
const PAPERS = path.join(ROOT, 'src/content/trials/paper-versions.json');
const args = process.argv.slice(2);
const opt = (name: string) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Manifest;
const known = new Set(['--json', '--base', '--base-papers', '--append', '--confirm']);
const unknown = args.filter((a, i) => a.startsWith('--') ? !known.has(a) : !['--json', '--base', '--base-papers', '--confirm'].includes(args[i - 1]));
if (unknown.length) { console.error(`unknown argument ${unknown[0]}`); process.exit(2); }
const manifest = readManifest();
const registry = existsSync(PAPERS) ? JSON.parse(readFileSync(PAPERS, 'utf8')) as PaperVersions : undefined;
const papers = checkPaperVersions(registry, trialBank, examResolver(trialBank));

if (args.includes('--append')) {
  const plan = appendEntries(trialBank.questions, manifest), confirm = opt('--confirm');
  const problems = [...plan.problems, ...papers.problems];
  if (problems.length) { console.error(['append refused (nothing was changed):', ...problems.map(p => `- ${p}`)].join('\n')); process.exit(1); }
  const added = [...plan.added, ...papers.unregistered.map(v => `paper ${v.paperId}@${v.version}`)];
  if (!added.length) { console.log('nothing to append: every revision and every fixed paper version is recorded'); process.exit(0); }
  if (confirm === undefined) { console.log(`dry run: ${added.length} entr(y/ies) would be added:\n${added.map(k => `- ${k}`).join('\n')}\nAdd them with --confirm ${added.length}.`); process.exit(0); }
  if (Number(confirm) !== added.length) { console.error(`not confirmed: ${added.length} entries would be added, --confirm says ${confirm}`); process.exit(1); }
  writeAllOrNothing([
    ...plan.added.length ? manifestWrites(plan.manifest!) : [],
    ...papers.unregistered.length ? [{ path: PAPERS, content: `${JSON.stringify(appendPaperVersions(registry!, papers.unregistered), null, 1)}\n` }] : [],
  ]);
  console.log(`appended ${plan.added.length} revision(s) and ${papers.unregistered.length} paper version(s)`);
  process.exit(0);
}

if (!manifest) { console.error(`no manifest at ${path.relative(ROOT, MANIFEST)}`); process.exit(1); }
const report = verifyManifest(trialBank.questions, manifest);
const failures = integrityFailures(report);
const baseFile = opt('--base');
let base: { file: string; checked: number; failures: string[] } | undefined;
if (baseFile) {
  if (!existsSync(baseFile)) { console.error(`no base manifest at ${baseFile}`); process.exit(2); }
  const b = read(baseFile);
  base = { file: baseFile, checked: Object.keys(b.entries ?? {}).length, failures: appendOnlyFailures(b, manifest) };
  failures.push(...base.failures);
}
failures.push(...paperVersionFailures(papers));
const basePapersFile = opt('--base-papers');
if (basePapersFile) {
  if (!existsSync(basePapersFile)) { console.error(`no base paper registry at ${basePapersFile}`); process.exit(2); }
  failures.push(...paperVersionsAppendOnly(JSON.parse(readFileSync(basePapersFile, 'utf8')) as PaperVersions, registry ?? { versions: [] } as unknown as PaperVersions));
}
const paperSummary = { registered: papers.registered, unregistered: papers.unregistered.map(v => `${v.paperId}@${v.version}`), maintenance: papers.maintenance };
const json = opt('--json');
if (json) writeFileSync(json, `${JSON.stringify({ format: 'logic-island.trials-integrity/1', ok: !failures.length, revisions: report.revisions, hashVersions: report.hashVersions,
  mismatched: report.mismatched, unrecorded: report.unrecorded, missing: report.missing, problems: report.problems, base, papers: paperSummary, failures }, null, 1)}\n`);
console.log(`fixed papers: ${papers.registered} registered version(s)${papers.maintenance.length ? `; under maintenance: ${papers.maintenance.map(m => `${m.paperId}@${m.version}`).join(', ')}` : ''}`);
console.log(`assessment integrity: ${report.revisions} revisions (${report.hashVersions.legacy} legacy, ${report.hashVersions.v2} version 2) against ${Object.keys(manifest.entries).length} manifest entries${base ? `; ${base.checked} entries of ${base.file} kept` : ''}`);
if (failures.length) { console.error(['INTEGRITY FAILED (nothing was repaired):', ...failures.map(f => `- ${f}`)].join('\n')); process.exit(1); }
console.log('every revision matches its recorded fingerprint; nothing was written');
