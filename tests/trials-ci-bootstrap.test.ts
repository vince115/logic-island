import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { resolveBase, type CiEvent } from '../src/lib/trials/ci-base';
import {
  BOOTSTRAP_DECLARATION, BOOTSTRAP_FILES, DECLARATION_FORMAT, baseHolds, bootstrapEligibility, declarationProblems, historyReplay, type BootstrapGit,
} from '../src/lib/trials/ci-bootstrap';

// Shared Trial System T.3I (docs/exam-system/33 §2–4): the explicit CI bootstrap, against local fixture repositories.
// Nothing here talks to GitHub: these are local git histories and hand-written event payloads, not Actions runs.
const ROOT = path.join(__dirname, '..');
const scratch = mkdtempSync(path.join(tmpdir(), 'trials-ci-bootstrap-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
const ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_NAME: 'fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid', GIT_AUTHOR_DATE: '2026-12-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-12-01T00:00:00Z' };
let n = 0;
const git = (dir: string, ...a: string[]) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: ENV, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
function commit(dir: string, msg: string, files: Record<string, string> = { [`f-${msg}.txt`]: msg }) {
  for (const [f, text] of Object.entries(files)) { mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); writeFileSync(path.join(dir, f), text); }
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', msg);
  return git(dir, 'rev-parse', 'HEAD');
}
const reader = (dir: string): BootstrapGit => {
  const ok = (...a: string[]) => { try { git(dir, ...a); return true; } catch { return false; } };
  return {
    shallow: () => git(dir, 'rev-parse', '--is-shallow-repository') === 'true',
    head: () => git(dir, 'rev-parse', 'HEAD'),
    commit: ref => { try { return git(dir, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`) || undefined; } catch { return undefined; } },
    isAncestor: (a, b) => ok('merge-base', '--is-ancestor', a, b),
    mergeBase: (a, b) => { try { return git(dir, 'merge-base', a, b) || undefined; } catch { return undefined; } },
    has: (c, p) => ok('cat-file', '-e', `${c}:${p}`),
    digestAt: (c, p) => { try { return sha256(execFileSync('git', ['-C', dir, 'show', `${c}:${p}`], { env: ENV, stdio: ['ignore', 'pipe', 'ignore'] })); } catch { return undefined; } },
  };
};
const ZERO = '0'.repeat(40), REPO = 'fixture/logic-island';
/** The release files: synthetic here, or the project's own bytes (`real`) for the CLI run that checks them. */
const releaseFiles = (real = false): Record<string, string> => Object.fromEntries(Object.values(BOOTSTRAP_FILES).map(f => [f, real ? readFileSync(path.join(ROOT, f), 'utf8') : `{"synthetic":"${f}"}\n`]));

/** main (no release file) → trials/mvp: the release files (the anchor), then the declaration. */
function fixture(o: { real?: boolean; declaration?: (d: Record<string, unknown>) => unknown } = {}) {
  const dir = path.join(scratch, `r${n++}`);
  mkdirSync(dir);
  git(dir, 'init', '-q', '-b', 'main');
  const base = commit(dir, 'main');
  git(dir, 'update-ref', 'refs/remotes/origin/main', base);
  git(dir, 'checkout', '-q', '-b', 'trials/mvp');
  const files = releaseFiles(o.real);
  const anchor = commit(dir, 'release files', files);
  const d: Record<string, unknown> = { format: DECLARATION_FORMAT, repository: REPO, branch: 'trials/mvp', defaultBranch: 'main', base, anchor, declaredAt: '2026-12-01',
    files: Object.fromEntries(Object.entries(BOOTSTRAP_FILES).map(([k, f]) => [k, sha256(files[f])])) };
  const declaration = o.declaration ? o.declaration(d) : d;
  const head = commit(dir, 'declaration', { [BOOTSTRAP_DECLARATION]: `${JSON.stringify(declaration, null, 1)}\n` });
  return { dir, base, anchor, head, declaration };
}
const firstPush = (head: string, extra: Partial<CiEvent['payload']> = {}): CiEvent => ({ name: 'push',
  payload: { before: ZERO, after: head, ref: 'refs/heads/trials/mvp', created: true, repository: { default_branch: 'main', full_name: REPO }, ...extra } });
const eligibility = (dir: string, event: CiEvent, declaration: unknown) => bootstrapEligibility(event, resolveBase(event, reader(dir)), declaration, reader(dir));
const failed = (e: { checks: { id: string; ok: boolean }[] }) => e.checks.filter(c => !c.ok).map(c => c.id);

describe('bootstrap eligibility: only the declared first run', () => {
  const f = fixture();
  it('the first push of the declared branch, on the declared base, with the declared files: allowed', () => {
    const e = eligibility(f.dir, firstPush(f.head), f.declaration);
    expect(e.eligible).toBe(true);
    expect(e.checks.map(c => c.id)).toEqual(['resolved', 'declaration', 'event', 'base', 'base-without-release-files', 'anchor', 'anchor-files', 'head-files']);
  });
  it('a pull request from the declared branch into the default branch: allowed', () => {
    const pr: CiEvent = { name: 'pull_request', payload: { pull_request: { base: { sha: f.base, ref: 'main' }, head: { ref: 'trials/mvp', repo: { full_name: REPO } } }, repository: { default_branch: 'main', full_name: REPO } } };
    expect(eligibility(f.dir, pr, f.declaration).eligible).toBe(true);
    expect(failed(eligibility(f.dir, { ...pr, payload: { ...pr.payload, pull_request: { ...pr.payload.pull_request, head: { ref: 'trials/other', repo: { full_name: REPO } } } } }, f.declaration))).toEqual(['event']);
    // T.3J: a fork's branch of the same name is not the declared branch (the event's repository is the base one).
    for (const repo of [{ full_name: 'someone/logic-island' }, {}, undefined])
      expect(failed(eligibility(f.dir, { ...pr, payload: { ...pr.payload, pull_request: { ...pr.payload.pull_request, head: { ref: 'trials/mvp', repo } } } }, f.declaration))).toEqual(['event']);
  });
  it('another branch, another repository, a manual run or a push that is not a branch creation: refused', () => {
    expect(failed(eligibility(f.dir, firstPush(f.head, { ref: 'refs/heads/trials/other' }), f.declaration))).toEqual(['event']);
    expect(failed(eligibility(f.dir, firstPush(f.head, { repository: { default_branch: 'main', full_name: 'someone/fork' } }), f.declaration))).toEqual(['event']);
    expect(failed(eligibility(f.dir, { name: 'workflow_dispatch', payload: { repository: { default_branch: 'main', full_name: REPO } } }, f.declaration))).toEqual(['event']);
    // A normal push whose previous tip predates the release files (the branch re-pushed from the old base): not a creation.
    expect(failed(eligibility(f.dir, firstPush(f.head, { before: f.base, created: false }), f.declaration))).toEqual(['event']);
  });
  it('no trusted base is never a bootstrap: a missing base, a shallow clone, an invalid SHA', () => {
    for (const ev of [firstPush(f.head, { after: 'f'.repeat(40) }), firstPush(f.head, { before: 'not-a-sha' }), { name: 'pull_request', payload: { pull_request: { base: { sha: 'e'.repeat(40) } } } } as CiEvent]) {
      const e = eligibility(f.dir, ev, f.declaration);
      expect([e.eligible, failed(e)]).toEqual([false, ['resolved']]);
    }
    const shallow = path.join(scratch, `shallow${n++}`);
    execFileSync('git', ['clone', '-q', '--depth', '1', '--branch', 'trials/mvp', `file://${f.dir}`, shallow], { env: ENV, stdio: 'ignore' });
    expect(failed(eligibility(shallow, firstPush(f.head), f.declaration))).toEqual(['resolved']);
  });
  it('a missing or malformed declaration: refused', () => {
    expect(failed(eligibility(f.dir, firstPush(f.head), undefined))).toEqual(['declaration']);
    expect(declarationProblems({ ...f.declaration as object, base: 'f45c867' })).toEqual(['base is not a full commit SHA']);
    expect(declarationProblems({ ...f.declaration as object, files: { manifest: 'x' } })).toContain('files.ledger is not a sha256 digest');
    expect(declarationProblems({ ...f.declaration as object, files: { ...(f.declaration as { files: object }).files, extra: 'a'.repeat(64) } })).toEqual(['files.extra is not a release file']);
  });
  it('release files changed after the declaration: refused (declare the new baseline)', () => {
    git(f.dir, 'checkout', '-q', 'trials/mvp');
    const changed = commit(f.dir, 'change', { [BOOTSTRAP_FILES.ledger]: '{"synthetic":"changed"}\n' });
    expect(failed(eligibility(f.dir, firstPush(changed), f.declaration))).toEqual(['head-files']);
    git(f.dir, 'reset', '-q', '--hard', f.head);
  });
  it('an anchor outside the history, or one whose files differ from the declaration: refused', () => {
    expect(failed(eligibility(f.dir, firstPush(f.head), { ...f.declaration as object, anchor: 'a'.repeat(40) }))).toEqual(['anchor', 'anchor-files']);
    expect(failed(eligibility(f.dir, firstPush(f.head), { ...f.declaration as object, anchor: f.base }))).toEqual(['anchor-files']);
  });
});

describe('a bootstrap never replaces a trusted base', () => {
  it('a base that holds the release files is compared with; one that holds some of them is never a bootstrap', () => {
    const f = fixture();
    expect(baseHolds(reader(f.dir), f.head).state).toBe('all');
    expect(baseHolds(reader(f.dir), f.base).state).toBe('none');
    // The default branch now holds every release file: the merge-base holds them, so the declaration no longer applies.
    git(f.dir, 'update-ref', 'refs/remotes/origin/main', f.anchor);
    const e = eligibility(f.dir, firstPush(f.head), f.declaration);
    expect(failed(e)).toEqual(['base', 'base-without-release-files']);
    expect(e.checks.find(c => c.id === 'base-without-release-files')!.detail).toContain('it is a trusted base, compare with it');
    // A base with some of the files.
    const g = fixture();
    git(g.dir, 'checkout', '-q', 'main');
    const partial = commit(g.dir, 'partial', { [BOOTSTRAP_FILES.manifest]: '{}\n' });
    expect(baseHolds(reader(g.dir), partial)).toMatchObject({ state: 'some', present: ['manifest'], absent: ['paper-versions', 'ledger'] });
  });
  it('the declared base moved (the branch rebased onto a newer main): refused', () => {
    const f = fixture();
    git(f.dir, 'checkout', '-q', 'main');
    const moved = commit(f.dir, 'main moved');
    git(f.dir, 'update-ref', 'refs/remotes/origin/main', moved);
    git(f.dir, 'checkout', '-q', 'trials/mvp');
    git(f.dir, 'rebase', '-q', moved);
    const head = git(f.dir, 'rev-parse', 'HEAD');
    expect(failed(eligibility(f.dir, firstPush(head), f.declaration))).toEqual(['base', 'anchor', 'anchor-files']);
  });
});

describe('the release files through the local history (consistent, not proven)', () => {
  const v = (commit: string, data: unknown) => ({ commit: commit.repeat(40).slice(0, 40), text: data === null ? null : JSON.stringify(data) });
  it('a manifest entry dropped, a published hash changed or a file removed is a break; a withdrawal is a note', () => {
    const e = { hashVersion: 2, contentHash: 'v2-0123456789abcdef', algorithm: 'sha256', parts: {} };
    expect(historyReplay('manifest', [v('a', { entries: { 'q@1': e } }), v('b', { entries: {} })]).failures).toHaveLength(1);
    expect(historyReplay('manifest', [v('a', { entries: { 'q@1': e } }), v('b', { entries: { 'q@1': e, 'q@2': e } })]).failures).toEqual([]);
    const h = historyReplay('published-hashes', [v('a', { 'q@1': 'x', 'r@1': 'y' }), v('b', { 'q@1': 'z' })]);
    expect([h.failures, h.notes.length]).toEqual([['published-hashes q@1: recorded hash changed (aaaaaaa → bbbbbbb)'], 1]);
    expect(historyReplay('ledger', [v('a', { reviews: [], publications: [] }), v('b', null)]).failures).toEqual(['ledger: removed at bbbbbbb']);
  });
});

const cli = (script: string, dir: string, event: CiEvent, extra: string[] = []) => {
  const eventPath = path.join(scratch, `event-${n++}.json`), json = path.join(scratch, `report-${n++}.json`), out = path.join(scratch, `out-${n++}`), gh = path.join(scratch, `gh-${n++}.txt`);
  writeFileSync(eventPath, typeof event.payload === 'string' ? event.payload : JSON.stringify(event.payload));
  const outArgs = script === 'ci-base' ? ['--out-dir', out, '--github-output', gh] : [];
  const r = spawnSync(process.execPath, ['--experimental-transform-types', '--no-warnings', '--import', path.join(ROOT, 'scripts/trials/register.mjs'), path.join(ROOT, `scripts/trials/${script}.ts`),
    '--event-name', event.name, '--event-path', eventPath, '--json', json, ...outArgs, ...extra], { cwd: dir, env: ENV, encoding: 'utf8' });
  return { status: r.status, stderr: r.stderr, stdout: r.stdout, report: JSON.parse(readFileSync(json, 'utf8')), output: script === 'ci-base' ? readFileSync(gh, 'utf8') : '' };
};

describe('the CLIs on fixture repositories', () => {
  it('trials:ci-base: the declared first push is mode=bootstrap with no base copies; any other base without the files fails', () => {
    const f = fixture();
    const ok = cli('ci-base', f.dir, firstPush(f.head));
    expect([ok.status, ok.report.mode, ok.report.files]).toEqual([0, 'bootstrap', {}]);
    expect(ok.output.split('\n').slice(0, 3)).toEqual(['ok=true', 'mode=bootstrap', `base=${f.base}`]);
    const other = cli('ci-base', f.dir, firstPush(f.head, { ref: 'refs/heads/trials/other' }));
    expect([other.status, other.report.ok, other.report.mode]).toEqual([1, false, undefined]);
    expect(other.report.reason).toContain('holds no release file and this run is not the declared bootstrap: event:');
    expect(other.output.split('\n').slice(0, 3)).toEqual(['ok=false', 'mode=', 'base=']);
  }, 30_000);
  it('trials:ci-base: an event file that is not a JSON object fails closed with a report', () => {
    const f = fixture();
    for (const payload of ['not json', '[1,2]', 'null']) {
      const r = cli('ci-base', f.dir, { name: 'push', payload } as unknown as CiEvent);
      expect([r.status, r.report.ok, r.report.reason]).toEqual([1, false, expect.stringContaining('is not a JSON object')]);
    }
  }, 30_000);
  it('trials:ci-bootstrap refuses anything but the declared run, before any check', () => {
    const f = fixture();
    const r = cli('ci-bootstrap', f.dir, firstPush(f.head, { ref: 'refs/heads/trials/other' }));
    expect([r.status, r.report.ok, r.report.eligible, r.report.verified, r.report.baseline]).toEqual([1, false, false, [], undefined]);
    expect(r.stderr).toContain('BOOTSTRAP REFUSED (no check was run');
    // After the bootstrap the next push has a trusted base: asking for a bootstrap again is refused.
    const next = commit(f.dir, 'next');
    expect(cli('ci-bootstrap', f.dir, { name: 'push', payload: { before: f.head, after: next, ref: 'refs/heads/trials/mvp', repository: { default_branch: 'main', full_name: REPO } } }).report.eligible).toBe(false);
  }, 30_000);
  it('trials:ci-bootstrap on the declared run: current-state checks over the project\'s release files, and what it cannot verify', () => {
    const f = fixture({ real: true });
    const r = cli('ci-bootstrap', f.dir, firstPush(f.head));
    expect(r.status, r.stderr).toBe(0);
    expect(r.report).toMatchObject({ format: 'logic-island.trials-ci-bootstrap/1', ok: true, eligible: true, base: f.base, baseline: { sha: f.head, anchor: f.anchor, base: f.base } });
    expect(r.report.verified.map((c: { id: string; status: string }) => `${c.id}:${c.status}`)).toEqual(['working-tree', 'bank', 'ledger', 'ledger-replay', 'revision-hash',
      'assessment-integrity', 'paper-versions', 'published-hashes', 'exposure-data', 'cross-exam', 'local-history'].map(id => `${id}:pass`));
    expect(r.report.unverifiable.length).toBeGreaterThanOrEqual(4);
    expect(r.report.unverifiable.join(' ')).toContain('57 published hashes');
    expect([r.report.trustAssumptions.length > 0, r.report.futureComparison.length > 0]).toEqual([true, true]);
  }, 60_000);
});
