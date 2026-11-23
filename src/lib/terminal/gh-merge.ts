import { isAncestor } from './git';
import type { Forge, Git, Repo } from './git-core';
import { switchCommand } from './git-cli-switch';
import { fastForward } from './git-cli-merge';
import type { MergeMethod } from './forge-state';
import { mergePull, mergeState, repoPath } from './forge';
import { on, parseFlags, type Gh } from './gh';
import { findPull } from './gh-pr';
import { dropLocalBranch, dropRemoteBranch, remoteOf } from './gh-pr-act';

/*
 * Engine stage E26 (docs/curriculum/CICD0_E26_FORGE.md): gh pr merge --merge|--squash|--rebase [--delete-branch] [--admin].
 * The merge state decides first (conflicts, protection's reviews and required checks, an out-of-date head), then GitHub
 * merges with the method (forge.ts); --delete-branch switches away from the head branch (git pull --ff-only of the base,
 * whose lines are shown), deletes it locally and on the forge.
 */

const ACTION: Record<MergeMethod, string> = { merge: 'Merged', squash: 'Squashed and merged', rebase: 'Rebased and merged' };

/** git pull --ff-only <remote> <branch> as gh runs it: fetches that branch (FETCH_HEAD and the remote-tracking branch) and fast-forwards. */
function pullBase(g: Git, r: Repo, forge: Forge, remote: string, branch: string): boolean {
  const tip = forge.refs.get(`refs/heads/${branch}`);
  if (!tip) return false;
  const track = `refs/remotes/${remote}/${branch}`, old = r.refs.get(track), name = branch.padEnd(10);
  g.learn(r.known, [tip]);
  const rows = [` * branch            ${name} -> FETCH_HEAD`];
  if (old !== tip) {
    rows.push(!old ? ` * [new branch]      ${name} -> ${remote}/${branch}` : isAncestor(g.store, old, tip) ? `   ${g.abbrev(old)}..${g.abbrev(tip)}  ${name} -> ${remote}/${branch}` : ` + ${g.abbrev(old)}...${g.abbrev(tip)} ${name} -> ${remote}/${branch}  (forced update)`);
    r.refs.set(track, tip);
  }
  g.err(`From ${forge.url.replace(/\.git$/, '')}`, ...rows);
  const head = g.head(r);
  if (head && isAncestor(g.store, tip, head)) { g.out('Already up to date.'); return true; }
  if (head && !isAncestor(g.store, head, tip)) { g.err('fatal: Not possible to fast-forward, aborting.'); return false; }
  return fastForward(g, r, tip);
}

export function mergePr(h: Gh, args: string[]): number {
  const { g, account } = h;
  const f = parseFlags(g, 'pr merge [<number> | <url> | <branch>]', args, ['m|merge', 's|squash', 'r|rebase', 'd|delete-branch', 'admin', 'auto', 'disable-auto', 'R|repo=', 't|subject=', 'b|body=']);
  if (!f) return 1;
  if (on(f, 'auto') || on(f, 'disable-auto') || on(f, 'subject') || on(f, 'body')) { g.err('gh pr merge：模擬環境不支援 --auto、--subject、--body（訊息依 GitHub 的預設）'); return 1; }
  const methods = (['merge', 'squash', 'rebase'] as const).filter(m => on(f, m));
  if (methods.length > 1) { g.err('only one of --merge, --rebase, or --squash can be enabled'); return 1; }
  if (!methods.length) { g.err('--merge, --rebase, or --squash required when not running interactively'); return 1; }
  const found = findPull(h, f);
  if (!found) return 1;
  const { forge, pr } = found, site = forge.site!, method = methods[0], name = `${repoPath(forge)}#${pr.number}`;
  if (pr.state === 'CLOSED') { g.err(`X Pull request ${name} (${pr.title}) can't be merged because it is closed`); return 1; }
  if (pr.state === 'OPEN') {
    const state = mergeState(g, forge, pr), p = site.protection.get(pr.base);
    const admin = on(f, 'admin') && site.permission === 'admin' && !p?.enforceAdmins;
    const reason = state === 'DIRTY' ? 'the merge commit cannot be cleanly created' : admin ? '' : state === 'BLOCKED' ? 'the base branch policy prohibits the merge' : state === 'BEHIND' ? 'the head branch is not up to date with the base branch' : '';
    if (reason) {
      g.err(`X Pull request ${name} is not mergeable: ${reason}.`, 'To have the pull request merged after all the requirements have been met, add the `--auto` flag.');
      if (state === 'DIRTY') {
        const r = g.find(), remote = (r && remoteOf(r, forge)) ?? 'origin';
        g.err('Run the following to resolve the merge conflicts locally:', `  gh pr checkout ${pr.number} && git fetch ${remote} ${pr.base} && git merge ${remote}/${pr.base}`);
      } else if (!on(f, 'admin')) g.err('To use administrator privileges to immediately merge the pull request, add the `--admin` flag.');
      return 1;
    }
    const result = mergePull(g, forge, pr, method, account);
    if ('error' in result) { g.err(result.error); return 1; }
    g.err(`✓ ${ACTION[method]} pull request ${name} (${pr.title})`);
  } else g.err(`! Pull request ${name} (${pr.title}) was already merged`);
  const gone = site.deleteBranchOnMerge && pr.state === 'OPEN' ? dropRemoteBranch(g, forge, pr.head) : false;
  if (!on(f, 'delete-branch')) return 0;
  const r = g.find();
  if (r && r.refs.has(`refs/heads/${pr.head}`)) {
    let switched = '';
    if (g.branch(r) === pr.head) {
      // gh checks out the base branch (git's output hidden) and pulls it (git's output shown).
      if (h.quiet(() => switchCommand(g, [pr.base]))) return 1;
      if (!pullBase(g, r, forge, remoteOf(r, forge) ?? 'origin', pr.base)) g.err(`! warning: not possible to fast-forward to: "${pr.base}"`);
      switched = ` and switched to branch ${pr.base}`;
    }
    dropLocalBranch(r, pr.head);
    g.err(`✓ Deleted local branch ${pr.head}${switched}`);
  }
  if (dropRemoteBranch(g, forge, pr.head) || gone) g.err(`✓ Deleted remote branch ${pr.head}`);
  return 0;
}
