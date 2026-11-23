import { isAncestor, lineCounts, mergeBases, stripspace, subjectOf, walk, writeTree, type Ident, type Sha } from './git';
import type { Forge, Git } from './git-core';
import { mergeTrees, type TreeMerge } from './git-cli-merge';
import { fileChanges } from './git-format';
import { approvalsOf, checksOf, decisions, type ForgeAccount, type ForgePull, type ForgeSite, type MergeMethod } from './forge-state';

/*
 * Engine stage E26 (docs/curriculum/CICD0_E26_FORGE.md): what github.example computes for a pull request — its test merge
 * (the E25 three-way merge of base and head), the numbers gh shows (commits, additions, deletions), the merge state
 * (CLEAN, BLOCKED by protection, BEHIND, DIRTY with conflicts, UNSTABLE with a failing check) and the three merge methods
 * with the histories GitHub writes: a merge commit, one squashed commit, or the commits replayed on the base.
 */

/** island/shop for https://github.example/island/shop.git */
export const repoPath = (f: Pick<Forge, 'url'>) => f.url.replace(/^https:\/\/github\.example\//, '').replace(/\.git$/, '');
export const webUrl = (f: Pick<Forge, 'url'>) => `https://github.example/${repoPath(f)}`;
export const pullUrl = (f: Pick<Forge, 'url'>, n: number) => `${webUrl(f)}/pull/${n}`;
export const headOf = (pr: ForgePull) => pr.heads.at(-1)!.sha;
export const defaultBranch = (f: Pick<Forge, 'head'>) => f.head.replace(/^refs\/heads\//, '');
/** The committer GitHub records for what it writes itself (merges, squashes, rebases). */
const forgeIdent = (now: number): Ident => ({ name: 'GitHub', email: 'noreply@github.example', time: now, tz: '+0000' });
export const accountIdent = (a: ForgeAccount, now: number): Ident => ({ name: a.name, email: a.email, time: now, tz: '+0000' });

/** Replaces a pull request of the repository (sites are immutable data). */
export function savePull(f: Forge, pr: ForgePull) { f.site = { ...f.site!, pulls: f.site!.pulls.map(p => p.number === pr.number ? pr : p) }; }

export interface TestMerge { base: Sha; head: Sha; mergeBase?: Sha; merge: TreeMerge }
/** GitHub's test merge of the head into the base branch's tip (undefined when the base branch is gone). */
export function testMerge(g: Git, f: Forge, pr: ForgePull): TestMerge | undefined {
  const base = f.refs.get(`refs/heads/${pr.base}`), head = headOf(pr);
  if (!base) return undefined;
  const mergeBase = mergeBases(g.store, base, head)[0];
  return { base, head, mergeBase, merge: mergeTrees(g, g.files(mergeBase), g.files(base), g.files(head), 'HEAD', pr.head) };
}

/** Commits, added and removed lines of the pull request (the three-dot diff; frozen when it was merged). */
export function pullStats(g: Git, f: Forge, pr: ForgePull): { commits: number; additions: number; deletions: number } {
  if (pr.merged) return pr.merged;
  const base = f.refs.get(`refs/heads/${pr.base}`), head = headOf(pr), mb = base ? mergeBases(g.store, base, head)[0] : undefined;
  let additions = 0, deletions = 0;
  for (const c of fileChanges(g.files(mb), g.files(head))) {
    const n = lineCounts(c.a ? g.store.blobText(c.a.id) : '', c.b ? g.store.blobText(c.b.id) : '');
    additions += n.added; deletions += n.removed;
  }
  return { commits: walk(g.store, [head], base ? [base] : []).length, additions, deletions };
}

export type MergeState = 'CLEAN' | 'BLOCKED' | 'BEHIND' | 'DIRTY' | 'UNSTABLE';
/** The pull request's mergeStateStatus at the machine's time. */
export function mergeState(g: Git, f: Forge, pr: ForgePull): MergeState {
  const t = testMerge(g, f, pr), site = f.site!;
  if (!t) return 'BLOCKED';
  if (t.merge.unmerged.size) return 'DIRTY';
  const p = site.protection.get(pr.base), checks = checksOf(site, g.store, t.head);
  if (p?.reviews) {
    const d = decisions(site, g.store, pr, g.now);
    if (d.some(x => x.state === 'CHANGES_REQUESTED') || approvalsOf(d) < p.reviews.approvals) return 'BLOCKED';
  }
  if (p?.checks?.contexts.some(c => !checks.some(x => x.context === c && x.conclusion === 'success'))) return 'BLOCKED';
  if (p?.checks?.strict && !isAncestor(g.store, t.base, t.head)) return 'BEHIND';
  if (checks.some(c => c.conclusion === 'failure')) return 'UNSTABLE';
  return 'CLEAN';
}

const bodyOf = (message: string) => { const k = message.indexOf('\n\n'); return k < 0 ? '' : stripspace(message.slice(k + 2)).replace(/\n$/, ''); };
const identOf = (site: ForgeSite, account: ForgeAccount, login: string, now: number): Ident => {
  if (login === account.login) return accountIdent(account, now);
  const p = site.personas.find(x => x.login === login);
  return { name: p?.name ?? login, email: `${login}@users.noreply.github.example`, time: now, tz: '+0000' };
};

/**
 * Merges the pull request on the forge with a method (the caller checked its merge state): the base branch moves to the
 * result and the pull request is merged. Returns the GraphQL error GitHub gives when the method cannot be used.
 */
export function mergePull(g: Git, f: Forge, pr: ForgePull, method: MergeMethod, account: ForgeAccount): { sha: Sha } | { error: string } {
  const site = f.site!, t = testMerge(g, f, pr), now = g.now;
  if (!t) return { error: 'GraphQL: Base ref must be a branch (mergePullRequest)' };
  if (!site.methods[method]) return { error: `GraphQL: ${{ merge: 'Merge commits are', squash: 'Squash merges are', rebase: 'Rebase merges are' }[method]} not allowed on this repository. (mergePullRequest)` };
  if (method === 'merge' && site.protection.get(pr.base)?.linear) return { error: 'GraphQL: Merge commits are not allowed on this protected branch. (mergePullRequest)' };
  const stats = pullStats(g, f, pr), commits = walk(g.store, [t.head], [t.base], true).reverse();
  let sha: Sha;
  if (method === 'rebase') {
    let cur = t.base;
    for (const c of commits) {
      const commit = g.commit(c);
      if (commit.parents.length > 1) continue;
      const m = mergeTrees(g, g.files(commit.parents[0]), g.files(cur), g.files(c), 'HEAD', g.abbrev(c));
      if (m.unmerged.size) return { error: "GraphQL: This branch can't be rebased (mergePullRequest)" };
      const tree = writeTree(g.store, m.clean);
      if (tree === g.commit(cur).tree) continue;
      cur = g.store.put({ type: 'commit', tree, parents: [cur], author: commit.author, committer: forgeIdent(now), message: commit.message });
    }
    sha = cur;
  } else {
    const tree = writeTree(g.store, t.merge.clean);
    if (method === 'merge') {
      const owner = repoPath(f).split('/')[0];
      sha = g.store.put({ type: 'commit', tree, parents: [t.base, t.head], author: accountIdent(account, now), committer: forgeIdent(now), message: `Merge pull request #${pr.number} from ${owner}/${pr.head}\n\n${pr.title}\n` });
    } else {
      const single = commits.length === 1 ? g.commit(commits[0]).message : undefined;
      const title = single !== undefined ? subjectOf(single) : pr.title;
      const body = single !== undefined ? bodyOf(single) : commits.map(c => `* ${stripspace(g.commit(c).message).replace(/\n$/, '')}`).join('\n\n');
      sha = g.store.put({ type: 'commit', tree, parents: [t.base], author: identOf(site, account, pr.author, now), committer: forgeIdent(now), message: `${title} (#${pr.number})\n${body ? `\n${body}\n` : ''}` });
    }
  }
  f.refs.set(`refs/heads/${pr.base}`, sha);
  g.learn(f.known, [sha]);
  savePull(f, { ...pr, state: 'MERGED', merged: { method, sha, by: account.login, at: now, ...stats, ...t.mergeBase ? { from: t.mergeBase } : {} } });
  return { sha };
}
