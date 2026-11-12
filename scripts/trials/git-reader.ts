import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { BootstrapGit } from '@/lib/trials/ci-bootstrap';

/*
 * Shared Trial System T.3I: the git the CI scripts read (ci-base.ts, ci-bootstrap.ts), in the current directory. Reads
 * only: no fetch, no checkout, nothing written to the repository.
 */
const git = (...a: string[]) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
export const gitOk = (...a: string[]) => { try { execFileSync('git', a, { stdio: 'ignore' }); return true; } catch { return false; } };
/** The bytes of `path` in `commit`, or undefined when it is not there. */
export const blobAt = (commit: string, path: string) => gitOk('cat-file', '-e', `${commit}:${path}`) ? execFileSync('git', ['show', `${commit}:${path}`]) : undefined;
export const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
/** The commits from `base` (excluded) to `head` that touch `path`, oldest first. */
export const commitsTouching = (base: string, head: string, path: string) => git('log', '--reverse', '--format=%H', `${base}..${head}`, '--', path).split('\n').filter(Boolean);

export const gitReader: BootstrapGit = {
  shallow: () => git('rev-parse', '--is-shallow-repository') === 'true',
  head: () => git('rev-parse', 'HEAD'),
  commit: ref => { try { return git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`) || undefined; } catch { return undefined; } },
  isAncestor: (a, b) => gitOk('merge-base', '--is-ancestor', a, b),
  mergeBase: (a, b) => { try { return git('merge-base', a, b) || undefined; } catch { return undefined; } },
  has: (commit, path) => gitOk('cat-file', '-e', `${commit}:${path}`),
  digestAt: (commit, path) => { const b = blobAt(commit, path); return b && sha256(b); },
};
