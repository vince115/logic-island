/*
 * Shared Trial System T.3H: the commit CI compares the release files against (docs/exam-system/32 §8).
 *
 * The append-only checks (trials:integrity --base / --base-papers, trials:ledger --base) are only as good as the base
 * they are given. Before T.3H the workflow took `pull_request.base.sha || before` and skipped the comparison whenever
 * that commit was missing — a first push (before = 000…), a force-push whose old tip was not fetched, a shallow clone —
 * so the guard failed open. resolveBase decides the base from the event and the local history, and says why; when it
 * cannot be trusted it fails, and the workflow stops before any check runs.
 *
 *   pull_request       base.sha, which must be in the history: an ancestor of HEAD (the merge commit GitHub checks
 *                      out), or else the merge-base of base.sha and HEAD (the PR head checked out). No merge-base:
 *                      unrelated histories, fail.
 *   push               `after` must be HEAD. A normal push: `before`, an ancestor of HEAD. A force-push (forced, or
 *                      `before` not an ancestor): still `before` — what the remote held must not be lost — so it must
 *                      be present (the workflow fetches it); missing, fail. A new branch (before = 000…): the merge-base
 *                      with the default branch (for a first push of the default branch itself, the pushed commit: the
 *                      remote held nothing before it). Anything else without a base fails.
 *   workflow_dispatch  the merge-base with the default branch; none, fail.
 *   anything else      fail (pull_request_target and the like never run this workflow's checks).
 *
 * A shallow clone fails whatever the event: ancestry and merge-bases cannot be trusted on a cut history. Pure: git is
 * read through GitReader, so the tests drive it against local fixture repositories.
 *
 * T.3I (docs/exam-system/33 §2–3): a trusted base must also hold the release files. One that holds none of them is
 * a bootstrap only when ci-bootstrap.ts allows it; one that holds some of them fails (scripts/trials/ci-base.ts).
 */
export const CI_BASE_FORMAT = 'logic-island.trials-ci-base/1';
export const ZERO_SHA = /^0{40}$/;
const SHA = /^[0-9a-f]{40}$/;

export interface GitReader {
  shallow(): boolean;
  head(): string;
  /** The commit a SHA or ref names, when it is in the local history. */
  commit(ref: string): string | undefined;
  isAncestor(ancestor: string, of: string): boolean;
  mergeBase(a: string, b: string): string | undefined;
}
export interface CiEvent {
  name: string;
  payload: {
    before?: string; after?: string; forced?: boolean; created?: boolean; ref?: string;
    pull_request?: { base?: { sha?: string; ref?: string }; head?: { sha?: string; ref?: string; repo?: { full_name?: string } } };
    repository?: { default_branch?: string; full_name?: string };
  };
}
export type BaseStrategy = 'pull-request-base' | 'pull-request-merge-base' | 'push-before' | 'force-push-before' | 'new-branch-merge-base' | 'dispatch-merge-base';
export interface BaseResolution { format: typeof CI_BASE_FORMAT; ok: boolean; event: string; head: string; base?: string; strategy?: BaseStrategy; reason: string }

export function resolveBase(event: CiEvent, git: GitReader, remote = 'origin'): BaseResolution {
  const head = git.head(), out = (r: Omit<BaseResolution, 'format' | 'event' | 'head'>): BaseResolution => ({ format: CI_BASE_FORMAT, event: event.name, head, ...r });
  const fail = (reason: string) => out({ ok: false, reason });
  if (git.shallow()) return fail('shallow clone: ancestry cannot be checked on a cut history (check out with fetch-depth: 0)');
  const defaultBranch = event.payload.repository?.default_branch;
  const fromDefault = (strategy: BaseStrategy, what: string) => {
    if (!defaultBranch) return fail(`${what}: the event names no default branch`);
    const tip = git.commit(`refs/remotes/${remote}/${defaultBranch}`);
    if (!tip) return fail(`${what}: ${remote}/${defaultBranch} is not in the local history`);
    const base = git.mergeBase(tip, head);
    return base ? out({ ok: true, base, strategy, reason: `${what}: merge-base with ${remote}/${defaultBranch}` }) : fail(`${what}: no common history with ${remote}/${defaultBranch} (unrelated histories)`);
  };

  if (event.name === 'pull_request') {
    const sha = event.payload.pull_request?.base?.sha;
    if (!sha || !SHA.test(sha)) return fail('pull request: no base SHA in the event');
    if (!git.commit(sha)) return fail(`pull request: base ${sha} is not in the local history`);
    if (git.isAncestor(sha, head)) return out({ ok: true, base: sha, strategy: 'pull-request-base', reason: 'pull request: the base is an ancestor of the checked-out commit' });
    const base = git.mergeBase(sha, head);
    return base ? out({ ok: true, base, strategy: 'pull-request-merge-base', reason: `pull request: merge-base of ${sha} and the checked-out head` }) : fail(`pull request: base ${sha} shares no history with the head (unrelated histories)`);
  }
  if (event.name === 'push') {
    const { before, after } = event.payload;
    if (!after || after !== head) return fail(`push: the checked-out commit ${head} is not the pushed one (${after ?? 'none'})`);
    if (!before || !SHA.test(before)) return fail('push: no previous SHA in the event');
    if (ZERO_SHA.test(before)) return fromDefault('new-branch-merge-base', 'push of a new branch');
    if (!git.commit(before)) return fail(`push: the previous tip ${before} is not in the local history${event.payload.forced ? ' (force-push: fetch it, or the base cannot be trusted)' : ''}`);
    if (!event.payload.forced && git.isAncestor(before, head)) return out({ ok: true, base: before, strategy: 'push-before', reason: 'push: the previous tip is an ancestor of the pushed commit' });
    // Rewritten history: compared with what the remote held before, so nothing recorded there can disappear.
    return out({ ok: true, base: before, strategy: 'force-push-before', reason: 'force-push: compared with the previous tip, which the rewritten history must still keep' });
  }
  if (event.name === 'workflow_dispatch') return fromDefault('dispatch-merge-base', 'manual run');
  return fail(`event ${event.name}: no trusted base for this event`);
}

/** The release files compared with the base, by the name the CI step gives each copy. */
export const BASE_FILES = {
  manifest: 'src/content/trials/assessment-manifest.json',
  'paper-versions': 'src/content/trials/paper-versions.json',
  ledger: 'src/content/trials/ledger.json',
} as const;
