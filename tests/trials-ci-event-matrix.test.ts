import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { CiEvent } from '../src/lib/trials/ci-base';
import { BOOTSTRAP_DECLARATION, BOOTSTRAP_FILES, DECLARATION_FORMAT, decideBase, type BootstrapGit } from '../src/lib/trials/ci-bootstrap';

// Shared Trial System T.3I (docs/exam-system/33 §5): the CI event matrix. Each event GitHub can send, against one local
// fixture history, decides compare / bootstrap / fail. Local git and hand-written payloads, not GitHub Actions runs.
const ROOT = path.join(__dirname, '..');
const scratch = mkdtempSync(path.join(tmpdir(), 'trials-ci-matrix-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
const ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_NAME: 'fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid', GIT_AUTHOR_DATE: '2026-12-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-12-01T00:00:00Z' };
const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const git = (dir: string, ...a: string[]) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: ENV, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
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
const ZERO = '0'.repeat(40), REPO = 'fixture/logic-island', MISSING = 'e'.repeat(40);
const repo = { default_branch: 'main', full_name: REPO };

// main: m0 (no release file) ← trials/mvp: anchor (release files) ← h1 (declaration) ← h2; a rewritten h2x off h1;
// an orphan; and a clone with the declared run's history only.
const dir = path.join(scratch, 'repo');
mkdirSync(dir);
git(dir, 'init', '-q', '-b', 'main');
const m0 = commit(dir, 'main');
git(dir, 'update-ref', 'refs/remotes/origin/main', m0);
git(dir, 'checkout', '-q', '-b', 'trials/mvp');
const files = Object.fromEntries(Object.values(BOOTSTRAP_FILES).map(f => [f, `{"synthetic":"${f}"}\n`]));
const anchor = commit(dir, 'release files', files);
const declaration = { format: DECLARATION_FORMAT, repository: REPO, branch: 'trials/mvp', defaultBranch: 'main', base: m0, anchor, declaredAt: '2026-12-01',
  files: Object.fromEntries(Object.entries(BOOTSTRAP_FILES).map(([k, f]) => [k, sha256(files[f])])) };
const h1 = commit(dir, 'declaration', { [BOOTSTRAP_DECLARATION]: JSON.stringify(declaration) });
const h2 = commit(dir, 'h2');
git(dir, 'checkout', '-q', '-b', 'rewritten', h1);
const h2x = commit(dir, 'h2 rewritten');
git(dir, 'checkout', '-q', '--orphan', 'orphan');
git(dir, 'rm', '-rq', '--cached', '.');
const orphan = commit(dir, 'orphan');
// R5 (2026-11-12): main once the declared pull request is merged (a merge commit on m0), and one more commit after it.
git(dir, 'checkout', '-q', '--detach', m0);
git(dir, 'merge', '-q', '--no-ff', '-m', 'land trials/mvp', h2);
const landed = git(dir, 'rev-parse', 'HEAD');
const m2 = commit(dir, 'after landing');
/** main merged with `tip` from `from` (detached): what a push to main would carry. */
function landOn(from: string, tip: string) { git(dir, 'checkout', '-q', '--detach', from); git(dir, 'merge', '-q', '--no-ff', '-m', 'land', tip); return git(dir, 'rev-parse', 'HEAD'); }

/** Checks out `at` and decides; `origin` moves the remote default branch for the case, then puts it back. */
function decide(at: string, name: string, payload: CiEvent['payload'] | undefined, o: { origin?: string | null; d?: unknown; in?: string } = {}) {
  const where = o.in ?? dir;
  if (!o.in) git(dir, 'checkout', '-q', '--detach', at);
  if (o.origin === null) git(dir, 'update-ref', '-d', 'refs/remotes/origin/main');
  else if (o.origin) git(dir, 'update-ref', 'refs/remotes/origin/main', o.origin);
  try {
    const r = decideBase(name, payload, reader(where), 'd' in o ? o.d : declaration);
    return { mode: r.resolution.ok ? r.mode : 'fail', base: r.resolution.ok ? r.resolution.base : undefined, reason: r.resolution.reason };
  } finally { git(dir, 'update-ref', 'refs/remotes/origin/main', m0); }
}
const push = (before: string, after: string, extra: Partial<CiEvent['payload']> = {}) => ({ before, after, ref: 'refs/heads/trials/mvp', repository: repo, ...extra });
const toMain = (before: string, after: string, extra: Partial<CiEvent['payload']> = {}) => push(before, after, { ref: 'refs/heads/main', ...extra });
const pr = (sha: string, head = 'trials/mvp', extra: Partial<CiEvent['payload']> = {}, from = repo.full_name) => ({ pull_request: { base: { sha, ref: 'main' }, head: { ref: head, repo: { full_name: from } } }, repository: repo, ...extra });

describe('the CI event matrix (local fixtures)', () => {
  it.each([
    ['first branch push (the declared run)', () => decide(h1, 'push', push(ZERO, h1, { created: true })), { mode: 'bootstrap', base: m0 }],
    ['first branch push, two commits later (release files unchanged)', () => decide(h2, 'push', push(ZERO, h2, { created: true })), { mode: 'bootstrap', base: m0 }],
    ['first push of another branch from the same history', () => decide(h2, 'push', push(ZERO, h2, { created: true, ref: 'refs/heads/trials/x' })), { mode: 'fail', reason: expect.stringContaining('event:') }],
    ['normal push', () => decide(h2, 'push', push(h1, h2)), { mode: 'compare', base: h1 }],
    ['pull request from the declared branch while main holds no release file', () => decide(h2, 'pull_request', pr(m0)), { mode: 'bootstrap', base: m0 }],
    ['pull request after main holds the release files (merge-base)', () => decide(h2, 'pull_request', pr(h1), { origin: h1 }), { mode: 'compare', base: h1 }],
    ['pull request from another branch into a main without release files', () => decide(h2, 'pull_request', pr(m0, 'feature')), { mode: 'fail', reason: expect.stringContaining('event:') }],
    ['pull request from a fork whose branch has the declared name (T.3J)', () => decide(h2, 'pull_request', pr(m0, 'trials/mvp', {}, 'someone/logic-island')), { mode: 'fail', reason: expect.stringContaining('event:') }],
    ['force-push: compared with the previous tip', () => decide(h2x, 'push', push(h2, h2x, { forced: true })), { mode: 'compare', base: h2 }],
    ['force-push whose previous tip was not fetched', () => decide(h2x, 'push', push(MISSING, h2x, { forced: true })), { mode: 'fail', reason: expect.stringContaining('force-push: fetch it') }],
    ['missing base (previous tip not in the history)', () => decide(h2, 'push', push(MISSING, h2)), { mode: 'fail', reason: expect.stringContaining('is not in the local history') }],
    ['unrelated history', () => decide(orphan, 'pull_request', pr(m0)), { mode: 'fail', reason: expect.stringContaining('unrelated histories') }],
    ['deleted base: the default branch is gone from the remote', () => decide(h1, 'push', push(ZERO, h1, { created: true }), { origin: null }), { mode: 'fail', reason: expect.stringContaining('origin/main is not in the local history') }],
    ['deleted and re-created branch after the release files changed', () => {
      git(dir, 'checkout', '-q', '-b', 'changed', h2);
      const c = commit(dir, 'changed', { [BOOTSTRAP_FILES.ledger]: '{"synthetic":"changed"}\n' });
      return decide(c, 'push', push(ZERO, c, { created: true }));
    }, { mode: 'fail', reason: expect.stringContaining('head-files') }],
    // R5: the push GitHub sends when the declared pull request is merged. Once, from the declared base; never forced.
    ['push that lands the declared branch on main (merge commit)', () => decide(landed, 'push', toMain(m0, landed)), { mode: 'bootstrap', base: m0 }],
    ['push that lands the declared branch on main (fast-forward)', () => decide(h2, 'push', toMain(m0, h2)), { mode: 'bootstrap', base: m0 }],
    ['the next push to main compares with the landed tip', () => decide(m2, 'push', toMain(landed, m2)), { mode: 'compare', base: landed }],
    ['force-push onto main from the declared base', () => decide(landed, 'push', toMain(m0, landed, { forced: true })), { mode: 'fail', reason: expect.stringContaining('event:') }],
    ['push from the declared base to a branch that is not main', () => decide(landed, 'push', push(m0, landed, { ref: 'refs/heads/release' })), { mode: 'fail', reason: expect.stringContaining('event:') }],
    ['push to main from another repository', () => decide(landed, 'push', toMain(m0, landed, { repository: { default_branch: 'main', full_name: 'someone/logic-island' } })), { mode: 'fail', reason: expect.stringContaining('event:') }],
    ['push to main whose previous tip is not the declared base', () => {
      git(dir, 'checkout', '-q', '--detach', m0);
      const m1 = commit(dir, 'main moved on');
      const tip = landOn(m1, h2);
      return decide(tip, 'push', toMain(m1, tip));
    }, { mode: 'fail', reason: expect.stringMatching(/event:.*base:/) }],
    ['push that lands changed release files on main', () => {
      git(dir, 'checkout', '-q', '--detach', h2);
      const c = commit(dir, 'changed before landing', { [BOOTSTRAP_FILES.ledger]: '{"synthetic":"changed again"}\n' });
      const tip = landOn(m0, c);
      return decide(tip, 'push', toMain(m0, tip));
    }, { mode: 'fail', reason: expect.stringContaining('head-files') }],
    ['manual dispatch on a branch whose merge-base holds no release file', () => decide(h2, 'workflow_dispatch', { repository: repo }), { mode: 'fail', reason: expect.stringContaining('event:') }],
    ['manual dispatch after main holds the release files', () => decide(h2, 'workflow_dispatch', { repository: repo }, { origin: h1 }), { mode: 'compare', base: h1 }],
    ['invalid event payload', () => decide(h1, 'push', undefined), { mode: 'fail', reason: 'the event payload is not a JSON object' }],
    ['schedule / pull_request_target', () => decide(h2, 'pull_request_target', pr(m0)), { mode: 'fail', reason: 'event pull_request_target: no trusted base for this event' }],
  ])('%s', (_name, run, expected) => expect(run()).toMatchObject(expected));

  it('shallow clone: fails whatever the event', () => {
    const shallow = path.join(scratch, 'shallow');
    execFileSync('git', ['clone', '-q', '--depth', '1', '--branch', 'trials/mvp', `file://${dir}`, shallow], { env: ENV, stdio: 'ignore' });
    expect(decide(h2, 'push', push(h1, h2), { in: shallow })).toMatchObject({ mode: 'fail', reason: expect.stringContaining('shallow clone') });
    expect(decide(h2, 'push', push(ZERO, h2, { created: true }), { in: shallow })).toMatchObject({ mode: 'fail', reason: expect.stringContaining('shallow clone') });
  });

  it('malicious or inconsistent SHAs and payloads fail closed', () => {
    for (const [name, payload] of [
      ['push', push(h1, h2x)], // the pushed SHA is not the checked-out commit
      ['push', push(h1.toUpperCase(), h2)], // not a lowercase full SHA
      ['push', push(h1.slice(0, 12), h2)], // short SHA
      ['push', push('HEAD~1', h2)], // a ref expression
      ['pull_request', pr('HEAD')],
      ['pull_request', pr(`${m0}\nmalicious`)],
      ['push', push(ZERO, h2, { created: true, repository: { default_branch: 'main', full_name: 'attacker/fork' } })], // another repository
      ['push', push(ZERO, h2, { created: true, repository: { default_branch: 'trials/mvp', full_name: REPO } })], // a lying default branch
    ] as [string, CiEvent['payload']][]) expect(decide(h2, name, payload).mode, JSON.stringify(payload)).toBe('fail');
  });

  it('a declaration cannot reach past a trusted base or widen itself', () => {
    // Declaring the head's own parent as the base: the resolved base is still the merge-base, so it does not match.
    expect(decide(h2, 'push', push(ZERO, h2, { created: true }), { d: { ...declaration, base: h1 } }).mode).toBe('fail');
    // A normal push never asks for the declaration: a trusted base exists.
    expect(decide(h2, 'push', push(h1, h2), { d: undefined })).toMatchObject({ mode: 'compare', base: h1 });
  });

  it('deciding writes nothing: the project\'s release files are untouched', () => {
    const before = Object.values(BOOTSTRAP_FILES).map(f => sha256(readFileSync(path.join(ROOT, f))));
    decide(h1, 'push', push(ZERO, h1, { created: true }));
    expect(Object.values(BOOTSTRAP_FILES).map(f => sha256(readFileSync(path.join(ROOT, f))))).toEqual(before);
  });
});
