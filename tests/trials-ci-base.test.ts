import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { BASE_FILES, resolveBase, type CiEvent, type GitReader } from '../src/lib/trials/ci-base';

// Shared Trial System T.3H (docs/exam-system/32 §8): the CI base commit, resolved against local fixture repositories
// for every event shape GitHub sends. Nothing here talks to GitHub: these are local git histories, not Actions runs.
const ROOT = path.join(__dirname, '..');
const scratch = mkdtempSync(path.join(tmpdir(), 'trials-ci-base-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
const ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_NAME: 'fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid', GIT_AUTHOR_DATE: '2026-12-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-12-01T00:00:00Z' };
let n = 0;
const git = (dir: string, ...a: string[]) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: ENV, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function repo() {
  const dir = path.join(scratch, `r${n++}`);
  mkdirSync(dir);
  git(dir, 'init', '-q', '-b', 'main');
  return dir;
}
/** Commits `files` (path → text) and returns the new commit. */
function commit(dir: string, msg: string, files: Record<string, string> = { [`f-${msg}.txt`]: msg }) {
  for (const [f, text] of Object.entries(files)) { mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); writeFileSync(path.join(dir, f), text); }
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', msg);
  return git(dir, 'rev-parse', 'HEAD');
}
const reader = (dir: string): GitReader => {
  const ok = (...a: string[]) => { try { git(dir, ...a); return true; } catch { return false; } };
  return {
    shallow: () => git(dir, 'rev-parse', '--is-shallow-repository') === 'true',
    head: () => git(dir, 'rev-parse', 'HEAD'),
    commit: ref => { try { return git(dir, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`) || undefined; } catch { return undefined; } },
    isAncestor: (a, b) => ok('merge-base', '--is-ancestor', a, b),
    mergeBase: (a, b) => { try { return git(dir, 'merge-base', a, b) || undefined; } catch { return undefined; } },
  };
};
const ZERO = '0'.repeat(40), MISSING = 'f'.repeat(40);
const push = (before: string, after: string, extra: Partial<CiEvent['payload']> = {}): CiEvent => ({ name: 'push', payload: { before, after, ref: 'refs/heads/trials/mvp', repository: { default_branch: 'main' }, ...extra } });

describe('push', () => {
  const dir = repo(), a = commit(dir, 'a'), b = commit(dir, 'b');
  it('a normal push compares with the previous tip', () => {
    expect(resolveBase(push(a, b), reader(dir))).toMatchObject({ ok: true, base: a, head: b, strategy: 'push-before' });
  });
  it('fails when the checked-out commit is not the pushed one, or the event names no previous tip', () => {
    expect(resolveBase(push(a, a), reader(dir))).toMatchObject({ ok: false, reason: `push: the checked-out commit ${b} is not the pushed one (${a})` });
    expect(resolveBase(push('', b), reader(dir)).ok).toBe(false);
  });
  it('fails closed when the previous tip is not in the history (a missing base)', () => {
    expect(resolveBase(push(MISSING, b), reader(dir))).toMatchObject({ ok: false, reason: `push: the previous tip ${MISSING} is not in the local history` });
  });
});

describe('a new branch (first push)', () => {
  const dir = repo(), a = commit(dir, 'a');
  git(dir, 'update-ref', 'refs/remotes/origin/main', a);
  git(dir, 'checkout', '-q', '-b', 'trials/mvp');
  const b = commit(dir, 'b');
  it('compares with the merge-base with the default branch', () => {
    expect(resolveBase(push(ZERO, b, { created: true }), reader(dir))).toMatchObject({ ok: true, base: a, strategy: 'new-branch-merge-base' });
  });
  it('fails closed without the default branch, or without the event naming it', () => {
    git(dir, 'update-ref', '-d', 'refs/remotes/origin/main');
    expect(resolveBase(push(ZERO, b, { created: true }), reader(dir))).toMatchObject({ ok: false, reason: 'push of a new branch: origin/main is not in the local history' });
    expect(resolveBase({ name: 'push', payload: { before: ZERO, after: b } }, reader(dir))).toMatchObject({ ok: false, reason: 'push of a new branch: the event names no default branch' });
  });
  it('the first push of the default branch: the remote held nothing before, so the pushed commit is the base', () => {
    const d = repo(), c = commit(d, 'c');
    git(d, 'update-ref', 'refs/remotes/origin/main', c);
    expect(resolveBase(push(ZERO, c, { ref: 'refs/heads/main', created: true }), reader(d))).toMatchObject({ ok: true, base: c, strategy: 'new-branch-merge-base' });
  });
});

describe('force-push', () => {
  const dir = repo(), a = commit(dir, 'a'), old = commit(dir, 'old', { 'src/content/trials/ledger.json': '{"old":true}' });
  git(dir, 'reset', '-q', '--hard', a);
  const rewritten = commit(dir, 'rewritten');
  it('compares with the previous tip when it is available: what the remote held must still be kept', () => {
    expect(resolveBase(push(old, rewritten, { forced: true }), reader(dir))).toMatchObject({ ok: true, base: old, strategy: 'force-push-before' });
    // A rewrite GitHub does not flag as forced is caught by the ancestry check all the same.
    expect(resolveBase(push(old, rewritten), reader(dir))).toMatchObject({ ok: true, base: old, strategy: 'force-push-before' });
  });
  it('fails closed when the previous tip could not be fetched', () => {
    expect(resolveBase(push(MISSING, rewritten, { forced: true }), reader(dir))).toMatchObject({ ok: false, reason: `push: the previous tip ${MISSING} is not in the local history (force-push: fetch it, or the base cannot be trusted)` });
  });
});

describe('pull request', () => {
  const dir = repo(), a = commit(dir, 'a');
  git(dir, 'checkout', '-q', '-b', 'feature');
  const f = commit(dir, 'f');
  git(dir, 'checkout', '-q', 'main');
  const m = commit(dir, 'm');
  const pr = (sha: string): CiEvent => ({ name: 'pull_request', payload: { pull_request: { base: { sha, ref: 'main' } }, repository: { default_branch: 'main' } } });
  it('on the merge commit GitHub checks out, the base is base.sha (an ancestor)', () => {
    git(dir, 'merge', '-q', '--no-edit', 'feature');
    expect(resolveBase(pr(m), reader(dir))).toMatchObject({ ok: true, base: m, strategy: 'pull-request-base' });
  });
  it('on the PR head itself, the merge-base of base.sha and the head', () => {
    git(dir, 'checkout', '-q', f);
    expect(resolveBase(pr(m), reader(dir))).toMatchObject({ ok: true, base: a, strategy: 'pull-request-merge-base' });
  });
  it('fails closed on a base outside the history, a missing SHA, or unrelated histories', () => {
    expect(resolveBase(pr(MISSING), reader(dir))).toMatchObject({ ok: false, reason: `pull request: base ${MISSING} is not in the local history` });
    expect(resolveBase({ name: 'pull_request', payload: {} }, reader(dir))).toMatchObject({ ok: false, reason: 'pull request: no base SHA in the event' });
    git(dir, 'checkout', '-q', '--orphan', 'other');
    git(dir, 'rm', '-rq', '--cached', '.');
    const orphan = commit(dir, 'orphan');
    expect(resolveBase(pr(m), reader(dir))).toMatchObject({ ok: false, head: orphan, reason: `pull request: base ${m} shares no history with the head (unrelated histories)` });
  });
});

describe('other events and shallow clones', () => {
  const dir = repo(), a = commit(dir, 'a');
  git(dir, 'update-ref', 'refs/remotes/origin/main', a);
  const b = commit(dir, 'b');
  it('a manual run compares with the merge-base with the default branch', () => {
    expect(resolveBase({ name: 'workflow_dispatch', payload: { repository: { default_branch: 'main' } } }, reader(dir))).toMatchObject({ ok: true, base: a, head: b, strategy: 'dispatch-merge-base' });
  });
  it('any other event has no trusted base (pull_request_target never runs these checks)', () => {
    for (const name of ['pull_request_target', 'schedule', 'release']) expect(resolveBase({ name, payload: { before: a, after: b } }, reader(dir))).toMatchObject({ ok: false, reason: `event ${name}: no trusted base for this event` });
  });
  it('a shallow clone fails whatever the event', () => {
    const shallow = path.join(scratch, `shallow${n++}`);
    execFileSync('git', ['clone', '-q', '--depth', '1', `file://${dir}`, shallow], { env: ENV, stdio: 'ignore' });
    expect(resolveBase(push(a, b), reader(shallow))).toMatchObject({ ok: false, reason: 'shallow clone: ancestry cannot be checked on a cut history (check out with fetch-depth: 0)' });
  });
});

describe('the CLI (trials:ci-base) on a fixture repository', () => {
  const dir = repo();
  const a = commit(dir, 'a', { [BASE_FILES.manifest]: '{"base":"manifest"}\n', [BASE_FILES.ledger]: '{"base":"ledger"}\n', [BASE_FILES['paper-versions']]: '{"base":"papers"}\n' });
  const b = commit(dir, 'b', { [BASE_FILES.manifest]: '{"head":"manifest"}\n' });
  const run = (event: CiEvent, cwd = dir) => {
    const eventPath = path.join(dir, '..', `event-${n++}.json`), out = path.join(dir, '..', `out-${n++}`), gh = path.join(dir, '..', `gh-${n++}.txt`), json = `${out}.json`;
    writeFileSync(eventPath, JSON.stringify(event.payload));
    const r = spawnSync(process.execPath, ['--experimental-transform-types', '--no-warnings', '--import', path.join(ROOT, 'scripts/trials/register.mjs'), path.join(ROOT, 'scripts/trials/ci-base.ts'),
      '--event-name', event.name, '--event-path', eventPath, '--out-dir', out, '--json', json, '--github-output', gh], { cwd, env: ENV, encoding: 'utf8' });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, report: JSON.parse(readFileSync(json, 'utf8')), output: readFileSync(gh, 'utf8'), out };
  };
  it('writes the base copies (exact bytes) and the step outputs, mode=compare', () => {
    const r = run(push(a, b));
    expect(r.status).toBe(0);
    expect(r.report).toMatchObject({ format: 'logic-island.trials-ci-base/1', ok: true, mode: 'compare', base: a, head: b, strategy: 'push-before',
      files: { manifest: path.join(r.out, 'base-manifest.json'), 'paper-versions': path.join(r.out, 'base-paper-versions.json'), ledger: path.join(r.out, 'base-ledger.json') } });
    expect(readFileSync(path.join(r.out, 'base-manifest.json'), 'utf8')).toBe('{"base":"manifest"}\n');
    expect(r.output.split('\n')).toEqual(['ok=true', 'mode=compare', `base=${a}`, `manifest=${path.join(r.out, 'base-manifest.json')}`, `paper-versions=${path.join(r.out, 'base-paper-versions.json')}`, `ledger=${path.join(r.out, 'base-ledger.json')}`, '']);
  }, 30_000);
  it('without a trusted base: exit 1, the reason in the report, no copies, an empty base output', () => {
    const r = run(push(MISSING, b));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('NO TRUSTED BASE (push)');
    expect(r.report).toMatchObject({ ok: false, files: {} });
    expect(r.output.split('\n').slice(0, 3)).toEqual(['ok=false', 'mode=', 'base=']);
  }, 30_000);
  it('T.3I: a base holding some release files fails; a release file is never compared "without a base"', () => {
    const d = repo(), p = commit(d, 'p', { [BASE_FILES.manifest]: '{}\n', [BASE_FILES.ledger]: '{}\n' }), q = commit(d, 'q');
    const r = run(push(p, q), d);
    expect([r.status, r.report.ok, r.report.files]).toEqual([1, false, {}]);
    expect(r.report.reason).toBe(`the base ${p} holds manifest, ledger but not paper-versions: a release file cannot be compared in part`);
  }, 30_000);
});
