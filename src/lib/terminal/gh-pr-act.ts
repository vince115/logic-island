import type { Forge, Git, Repo } from './git-core';
import { switchCommand } from './git-cli-switch';
import { mergeCommand } from './git-cli-merge';
import { checksOf, pushed, type ForgeReview } from './forge-state';
import { completedAt } from './actions-model';
import { defaultBranch, headOf, repoPath, savePull, webUrl } from './forge';
import { flag, on, parseFlags, type Gh } from './gh';
import { findPull, table } from './gh-pr';

/*
 * Engine stage E26 (docs/curriculum/CICD0_E26_FORGE.md): gh pr checkout (git fetch of the head branch, then the branch
 * checked out and fast-forwarded, git's own lines shown), gh pr review (you cannot approve or request changes on your
 * own pull request), gh pr checks (the declared check results of the head; E28 produces real ones) and gh pr close.
 */

/** The name of the local remote that points at the forge repository (origin in a clone). */
export function remoteOf(r: Repo, forge: Forge): string | undefined {
  const bare = (u: string) => u.replace(/\/+$/, '').replace(/\.git$/, '');
  return [...r.config].find(([k, v]) => /^remote\..+\.url$/.test(k) && bare(v) === bare(forge.url))?.[0].slice(7, -4);
}
/** git branch -D without its output (gh deletes the local branch itself). */
export function dropLocalBranch(r: Repo, name: string) {
  r.refs.delete(`refs/heads/${name}`);
  for (const k of [...r.config.keys()]) if (k.startsWith(`branch.${name}.`)) r.config.delete(k);
}
/** Deletes the head branch on the forge (and closes open pull requests from or into it). */
export function dropRemoteBranch(g: Git, forge: Forge, name: string): boolean {
  if (!forge.refs.delete(`refs/heads/${name}`)) return false;
  forge.site = pushed(forge.site!, name, undefined, g.now);
  return true;
}

export function checkoutPr(h: Gh, args: string[]): number {
  const { g } = h;
  const f = parseFlags(g, 'pr checkout {<number> | <url> | <branch>}', args, ['b|branch=', 'f|force', 'detach', 'R|repo=']);
  if (!f) return 1;
  if (!f.rest.length) { g.err('accepts 1 arg(s), received 0'); return 1; }
  const found = findPull(h, f);
  if (!found) return 1;
  const { forge, pr } = found, r = g.find();
  if (!r) { g.err('failed to run git: fatal: not a git repository (or any of the parent directories): .git'); return 1; }
  const remote = remoteOf(r, forge) ?? 'origin', branch = flag(f, 'branch') ?? pr.head, tip = forge.refs.get(`refs/heads/${pr.head}`);
  const row = (s: string, from: string, to: string) => `${s} ${from.padEnd(Math.max(10, from.length))} -> ${to}`;
  if (tip) {
    // git fetch origin +refs/heads/<head>:refs/remotes/origin/<head>
    const track = `refs/remotes/${remote}/${pr.head}`, old = r.refs.get(track);
    if (old !== tip) {
      g.learn(r.known, [tip]);
      r.refs.set(track, tip);
      g.err(`From ${forge.url.replace(/\.git$/, '')}`, row(old ? `   ${g.abbrev(old)}..${g.abbrev(tip)} ` : ' * [new branch]     ', pr.head, `${remote}/${pr.head}`));
    }
    if (r.refs.has(`refs/heads/${branch}`)) {
      if (switchCommand(g, [branch])) return 1;
      return mergeCommand(g, ['--ff-only', track]) ? 1 : 0;
    }
    return switchCommand(g, branch === pr.head ? [branch] : ['-c', branch, `${remote}/${pr.head}`]) ? 1 : 0;
  }
  // The head branch is gone (a merged or closed pull request): git fetch origin refs/pull/N/head:<branch>
  if (!r.refs.has(`refs/heads/${branch}`)) {
    g.learn(r.known, [headOf(pr)]);
    r.refs.set(`refs/heads/${branch}`, headOf(pr));
    g.err(`From ${forge.url.replace(/\.git$/, '')}`, row(' * [new ref]        ', `refs/pull/${pr.number}/head`, branch));
  }
  return switchCommand(g, [branch]) ? 1 : 0;
}

export function reviewPr(h: Gh, args: string[]): number {
  const { g, account } = h;
  const f = parseFlags(g, 'pr review [<number> | <url> | <branch>]', args, ['a|approve', 'r|request-changes', 'c|comment', 'b|body=', 'R|repo=']);
  if (!f) return 1;
  const modes = (['approve', 'request-changes', 'comment'] as const).filter(m => on(f, m));
  if (modes.length !== 1) { g.err('need exactly one of --approve, --request-changes, or --comment'); return 1; }
  const mode = modes[0], body = flag(f, 'body') ?? '';
  if (mode !== 'approve' && !body.trim()) { g.err(`body cannot be blank for ${mode} review`); return 1; }
  const found = findPull(h, f);
  if (!found) return 1;
  const { forge, pr } = found, name = `${repoPath(forge)}#${pr.number}`;
  if (pr.author === account.login && mode !== 'comment') {
    g.err(`failed to create review: GraphQL: Review Can not ${mode === 'approve' ? 'approve' : 'request changes on'} your own pull request (addPullRequestReview)`);
    return 1;
  }
  if (pr.state !== 'OPEN' && mode !== 'comment') { g.err(`failed to create review: GraphQL: Pull request is ${pr.state === 'MERGED' ? 'merged' : 'closed'} (addPullRequestReview)`); return 1; }
  const review: ForgeReview = { by: account.login, state: mode === 'approve' ? 'APPROVED' : mode === 'comment' ? 'COMMENTED' : 'CHANGES_REQUESTED', body, commit: headOf(pr), at: g.now };
  savePull(forge, { ...pr, reviews: [...pr.reviews, review] });
  g.err(mode === 'approve' ? `✓ Approved pull request ${name}` : mode === 'comment' ? `- Reviewed pull request ${name}` : `+ Requested changes to pull request ${name}`);
  return 0;
}

const elapsed = (s: number) => !s ? '' : s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m${s % 60}s` : `${Math.floor(s / 3600)}h${Math.floor(s / 60) % 60}m${s % 60}s`;
export function checksPr(h: Gh, args: string[]): number {
  const { g } = h;
  const f = parseFlags(g, 'pr checks [<number> | <url> | <branch>]', args, ['R|repo=', 'required', 'watch', 'fail-fast', 'i|interval=', 'w|web']);
  if (!f) return 1;
  // E28 (actions profile): --watch moves the clock to the end of the head's runs and prints the final table (gh run watch's decision).
  if ((on(f, 'watch') && !h.ci) || on(f, 'web')) { g.err('gh pr checks --watch／--web：模擬環境不支援（結果由課程宣告；GitHub Actions 的執行在引擎階段 E28）'); return 1; }
  const found = findPull(h, f);
  if (!found) return 1;
  const { forge, pr } = found, required = forge.site!.protection.get(pr.base)?.checks?.contexts ?? [];
  let at = g.now;
  if (on(f, 'watch')) {
    const ends = (forge.site!.runs ?? []).filter(r => r.headSha === headOf(pr) && r.createdAt <= g.now).map(r => completedAt(r));
    if (ends.some(e => e === undefined)) { g.err('gh pr checks --watch：有 job 一直在等 runner（沒有符合 runs-on 的 runner），真實的 gh 會一直等下去'); return 1; }
    at = Math.max(g.now, ...ends as number[]);
    h.advance = at - g.now;
  }
  const results = checksOf(forge.site!, g.store, headOf(pr), at, webUrl(forge)).filter(c => !on(f, 'required') || required.includes(c.context));
  if (!results.length) { g.err(`no ${on(f, 'required') ? 'required ' : ''}checks reported on the '${pr.head}' branch`); return 1; }
  // E28: Actions' results add cancelled and skipped, gh's names (CI/test (push)) and the jobs' URLs.
  const order = { failure: 0, cancelled: 1, pending: 2, success: 3, skipped: 4 } as const, mark = { failure: 'X', cancelled: '-', pending: '*', success: '✓', skipped: '-' } as const;
  const n = (c: string) => results.filter(x => x.conclusion === c).length;
  g.out(n('failure') ? 'Some checks were not successful' : n('pending') ? 'Some checks are still pending' : n('cancelled') ? 'Some checks were cancelled' : 'All checks were successful',
    `${n('cancelled')} cancelled, ${n('failure')} failing, ${n('success')} successful, ${n('skipped')} skipped, and ${n('pending')} pending checks`, '');
  const nameOf = (c: typeof results[number]) => c.name ?? c.context;
  const rows = [...results].sort((a, b) => order[a.conclusion] - order[b.conclusion] || (nameOf(a) < nameOf(b) ? -1 : 1));
  g.out(...table([['', 'NAME', 'DESCRIPTION', 'ELAPSED', 'URL'], ...rows.map(c => [mark[c.conclusion], nameOf(c), c.description, elapsed(c.seconds), c.url ?? ''])]));
  return n('failure') || n('cancelled') ? 1 : n('pending') ? 8 : 0;
}

export function closePr(h: Gh, args: string[]): number {
  const { g } = h;
  const f = parseFlags(g, 'pr close {<number> | <url> | <branch>}', args, ['c|comment=', 'd|delete-branch', 'R|repo=']);
  if (!f) return 1;
  if (!f.rest.length) { g.err('accepts 1 arg(s), received 0'); return 1; }
  const found = findPull(h, f);
  if (!found) return 1;
  const { forge, pr } = found, name = `${repoPath(forge)}#${pr.number} (${pr.title})`;
  if (pr.state === 'MERGED') { g.err(`X Pull request ${name} can't be closed because it was already merged`); return 1; }
  if (pr.state === 'CLOSED') { g.err(`! Pull request ${name} is already closed`); return 0; }
  savePull(forge, { ...pr, state: 'CLOSED', closedAt: g.now });
  g.err(`✓ Closed pull request ${name}`);
  if (!on(f, 'delete-branch')) return 0;
  const r = g.find();
  let switched = '';
  if (r && r.refs.has(`refs/heads/${pr.head}`)) {
    if (g.branch(r) === pr.head) {
      const to = defaultBranch(forge);
      if (h.quiet(() => switchCommand(g, [to]))) return 1;
      switched = ` and switched to branch ${to}`;
    }
    dropLocalBranch(r, pr.head);
  }
  dropRemoteBranch(g, forge, pr.head);
  g.err(`✓ Deleted branch ${pr.head}${switched}`);
  return 0;
}
