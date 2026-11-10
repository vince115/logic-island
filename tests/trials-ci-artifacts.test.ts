import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { playableQuestions, trialBank } from '../src/content/trials';
import { mockBlueprints } from '../src/content/trials/mock-exams';
import { hasPrivateBank } from '../src/content/trials/private-bank';
import { contentText, currentRevisionOf } from '../src/content/trials/schema';
import { exposureNeedles } from '../src/lib/trials/preflight';

// Shared Trial System T.3I (docs/exam-system/33 §4, §12): the JSON reports CI keeps as artifacts (14 days) hold ids,
// hashes, counts and dates only — never an unpublished question's wording, options, answers or explanations. Each CLI
// runs here as CI runs it (fewer quality seeds), and its report is scanned.
const ROOT = path.join(__dirname, '..');
const out = mkdtempSync(path.join(tmpdir(), 'trials-artifacts-'));
afterAll(() => rmSync(out, { recursive: true, force: true }));
const run = (script: string, ...args: string[]) => spawnSync(process.execPath, ['--experimental-transform-types', '--no-warnings', '--import', path.join(ROOT, 'scripts/trials/register.mjs'),
  path.join(ROOT, `scripts/trials/${script}.ts`), ...args], { cwd: ROOT, encoding: 'utf8' });

// Unpublished text: the preflight's needles (stems), plus every option and explanation of an unpublished question.
const shown = new Set(playableQuestions.map(q => q.id));
const sources = new Map<string, string>(exposureNeedles(trialBank, playableQuestions, mockBlueprints, trialBank.papers.map(p => p.id)).filter(n => !/^[\w.-]+$/.test(n)).map(n => [n, 'stem']));
for (const q of trialBank.questions.filter(x => !shown.has(x.id))) {
  const r = currentRevisionOf(q)!;
  const parts: [string, string][] = [...(r.options ?? []).map((o, i) => [`option ${i + 1}`, contentText(o.body)] as [string, string]), ['explanation', contentText(r.explanation?.body ?? [])],
    ...(r.explanation?.options ?? []).map((e, i) => [`option explanation ${i + 1}`, contentText(e.body)] as [string, string])];
  for (const [part, t] of parts) { const flat = t.replace(/\s+/g, ''); if (flat.length >= 20) sources.set(flat.slice(4, 20), `${q.id} ${part}`); }
}
const needles = [...sources.keys()];
/** Where each hit comes from (question and part), never the text itself. */
const hits = (text: string) => needles.filter(n => text.includes(n)).map(n => sources.get(n));

describe('CI report artifacts', () => {
  // T.3J: the unpublished text is in the private bank; without it there is none here to leak (nor to look for).
  it.skipIf(!hasPrivateBank)('there is unpublished text to look for', () => expect(needles.length).toBeGreaterThan(500));
  it.each([
    ['integrity', ['--json', 'trials-integrity.json']],
    ['ledger', ['--json', 'trials-ledger.json']],
    ['volatility', ['--exam', 'ccarf', '--json', 'trials-volatility-ccarf.json']],
    ['quality', ['--exam', 'ccarf', '--seeds', '200', '--json', 'quality-ccarf.json']],
    ['quality', ['--exam', 'ipas-aiap-basic', '--seeds', '100', '--json', 'quality-ipas.json']],
    ['release-gate', ['--targets', 'ccarf-b-35@2,ipas-aiap-basic-b-26@1', '--json', 'release-gate.json']],
  ])('%s %s', (script, args) => {
    const file = path.join(out, args.at(-1)!);
    run(script, ...args.slice(0, -1), file);
    const text = readFileSync(file, 'utf8').replace(/\s+/g, '');
    expect(hits(text)).toEqual([]);
    expect(text).not.toMatch(/"(correct|answer|explanation|stem)":/);
  }, 120_000);
  it('preflight (data) prints its report on stdout: the same holds', () => {
    const r = run('preflight', '--json'), text = r.stdout.replace(/\s+/g, '');
    expect(JSON.parse(r.stdout).ok).toBe(true);
    expect(hits(text)).toEqual([]);
  }, 120_000);
});
