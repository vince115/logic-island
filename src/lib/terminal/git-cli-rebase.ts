import { isAncestor, subjectOf, walk, writeTree, type Sha } from './git';
import { type Git, type Repo } from './git-core';
import { fileChanges, statusOf } from './git-format';
import { has, parseOpts, value } from './git-cli';
import { checkoutFiles } from './git-cli-switch';
import { commitSummary } from './git-cli-commit';
import { applyMerge, mergeTrees } from './git-cli-merge';
import { longStatus } from './git-cli-status';

/*
 * Engine stage E25 (docs/curriculum/CICD0_E25_GIT.md): git rebase <upstream> (the commits of the branch that upstream does
 * not have, replayed one by one on it with merge-ort's cherry-pick; merges dropped, changes already upstream skipped;
 * stops on a conflict; --continue, --skip, --abort) and git revert (the reverse change as a new commit; -m for a merge).
 */

const label = (g: Git, id: Sha) => `${g.abbrev(id)} (${subjectOf(g.commit(id).message)})`;
const signature = (g: Git, id: Sha) => JSON.stringify(fileChanges(g.files(g.commit(id).parents[0]), g.files(id)).map(c => [c.from, c.path, c.a?.id, c.b?.id]));

/** Replays the rest of the rebase's commits; status 1 when one stops on a conflict. */
function proceed(g: Git, r: Repo): number {
  const op = r.op;
  if (op?.kind !== 'rebase') return 0;
  const todo = [...op.todo], done = [...op.done];
  while (todo.length) {
    const c = todo[0], head = g.head(r)!, commit = g.commit(c);
    const m = mergeTrees(g, g.files(commit.parents[0]), g.files(head), g.files(c), 'HEAD', label(g, c));
    applyMerge(g, r, m);
    g.out(...m.messages);
    if (m.unmerged.size) {
      r.op = { ...op, todo, done, current: c };
      const line = `${g.abbrev(c)}... ${subjectOf(commit.message)}`;
      g.err(`error: could not apply ${line}`, 'hint: Resolve the conflicts, mark them resolved with "git add/rm <conflicted_files>", then run "git rebase --continue".', `Could not apply ${line}`);
      return 1;
    }
    const tree = writeTree(g.store, r.index);
    if (tree !== g.commit(head).tree) g.setHead(r, g.makeCommit(r, tree, [head], commit.message, commit.author)!);
    todo.shift(); done.push(c);
  }
  finish(g, r, op.branch);
  return 0;
}
function finish(g: Git, r: Repo, branch: string | null) {
  const op = r.op as Extract<NonNullable<Repo['op']>, { kind: 'rebase' }>;
  const tip = g.head(r)!;
  r.origHead = op.orig;
  r.op = undefined;
  if (branch) { r.refs.set(`refs/heads/${branch}`, tip); r.head = `refs/heads/${branch}`; r.detached = undefined; g.err(`Successfully rebased and updated refs/heads/${branch}.`); }
  else g.err('Successfully rebased and updated detached HEAD.');
}

/** git rebase [上游] | --continue | --skip | --abort */
export function rebaseCommand(g: Git, args: string[]): number {
  const o = parseOpts(g, 'rebase', args, ['continue', 'skip', 'abort', 'q|quiet', 'onto=', 'i|interactive'], '[-i] [options] [--exec <cmd>] [--onto <newbase> | --keep-base] [<upstream> [<branch>]]');
  if (!o) return 129;
  const r = g.repo();
  if (!r) return 128;
  if (has(o, 'i') || has(o, 'onto')) { g.err(`git rebase ${has(o, 'i') ? '-i' : '--onto'}：模擬環境不支援（沒有編輯器），只支援 git rebase 上游`); return 1; }
  const op = r.op;
  if (has(o, 'continue') || has(o, 'skip') || has(o, 'abort')) {
    if (op?.kind !== 'rebase') { g.err('fatal: no rebase in progress'); return 128; }
    if (has(o, 'abort')) {
      checkoutFiles(g, r, g.files(op.orig), 'checkout', true);
      r.unmerged.clear(); r.op = undefined;
      if (op.branch) { r.head = `refs/heads/${op.branch}`; r.detached = undefined; } else r.head = op.orig;
      return 0;
    }
    if (has(o, 'skip')) {
      checkoutFiles(g, r, g.files(g.head(r)), 'checkout', true);
      r.unmerged.clear();
      r.op = { ...op, todo: op.todo.slice(1), done: [...op.done, op.todo[0]] };
      return proceed(g, r);
    }
    if (r.unmerged.size) { g.err(...[...r.unmerged.keys()].sort().map(p => `${p}: needs merge`), 'You must edit all merge conflicts and then', 'mark them as resolved using git add'); return 1; }
    const c = op.todo[0];
    if (c !== undefined && op.current === c) {
      const head = g.head(r)!, tree = writeTree(g.store, r.index);
      if (tree === g.commit(head).tree) { g.err("No changes - did you forget to use 'git add'?", 'hint: If there is nothing left to stage, run "git rebase --skip".'); return 1; }
      const commit = g.commit(c), id = g.makeCommit(r, tree, [head], commit.message, commit.author);
      if (!id) return 128;
      g.setHead(r, id);
      g.out(...commitSummary(g, r, id));
      r.op = { ...op, todo: op.todo.slice(1), done: [...op.done, c] };
    }
    return proceed(g, r);
  }
  if (op) {
    if (op.kind === 'rebase') g.err('fatal: It seems that there is already a rebase-merge directory, and', 'I wonder if you are in the middle of another rebase.');
    else g.err(`error: cannot rebase: You have ${op.kind === 'merge' ? 'unmerged files' : 'a revert in progress'}.`);
    return 1;
  }
  const s = statusOf(g, r);
  if (s.unstaged.length || s.unmerged.length) { g.err('error: cannot rebase: You have unstaged changes.', 'error: Please commit or stash them.'); return 1; }
  if (s.staged.length) { g.err('error: cannot rebase: Your index contains uncommitted changes.', 'error: Please commit or stash them.'); return 1; }
  const branch = g.branch(r) ?? null;
  let spec = o.rest[0];
  if (spec === undefined) {
    const up = g.upstream(r, branch ?? undefined);
    if (!up) { g.err('There is no tracking information for the current branch.', 'Please specify which branch you want to rebase against.'); return 1; }
    spec = up.replace(/^refs\/remotes\//, '').replace(/^refs\/heads\//, '');
  }
  return rebaseOnto(g, r, spec);
}

/** Starts rebasing the current branch (or detached HEAD) onto a revision: fast-forward, up to date, or replay. */
export function rebaseOnto(g: Git, r: Repo, spec: string): number {
  const branch = g.branch(r) ?? null;
  const onto = g.commitOf(r, spec), head = g.head(r);
  if (!onto) { g.err(`fatal: invalid upstream '${spec}'`); return 128; }
  if (!head) { g.err('fatal: invalid upstream \'HEAD\''); return 128; }
  const name = branch ? `Current branch ${branch}` : 'HEAD';
  if (isAncestor(g.store, onto, head)) { g.out(`${name} is up to date.`); return 0; }
  if (!g.ident(r, 'Committer')) return 128;
  const upstreamOnly = new Set(walk(g.store, [onto], [head]).map(id => signature(g, id)));
  const todo = walk(g.store, [head], [onto]).reverse().filter(id => g.commit(id).parents.length <= 1 && !upstreamOnly.has(signature(g, id)));
  checkoutFiles(g, r, g.files(onto), 'checkout');
  r.head = onto; r.detached = undefined;
  r.op = { kind: 'rebase', onto, ontoName: spec, orig: head, branch, todo, done: [], current: onto };
  return proceed(g, r);
}

/** git revert [--no-edit] [-m 父] 修訂 | --continue | --abort */
export function revertCommand(g: Git, args: string[]): number {
  const o = parseOpts(g, 'revert', args, ['no-edit', 'edit', 'm|mainline=', 'continue', 'abort', 'skip', 'n|no-commit'], '[--[no-]edit] [-n] [-m <parent-number>] [-s] [-S[<keyid>]] <commit>...');
  if (!o) return 129;
  const r = g.repo();
  if (!r) return 128;
  if (has(o, 'n')) { g.err('git revert -n：模擬環境不支援，請直接 git revert 修訂'); return 1; }
  const op = r.op;
  if (has(o, 'abort') || has(o, 'continue') || has(o, 'skip')) {
    if (op?.kind !== 'revert') { g.err('error: no cherry-pick or revert in progress', 'fatal: revert failed'); return 128; }
    if (has(o, 'abort') || has(o, 'skip')) { checkoutFiles(g, r, g.files(g.head(r)), 'checkout', true); r.unmerged.clear(); r.op = undefined; return 0; }
    if (r.unmerged.size) { g.err('error: Committing is not possible because you have unmerged files.', "hint: Fix them up in the work tree, and then use 'git add/rm <file>'", 'fatal: Exiting because of an unresolved conflict.'); return 128; }
    const id = g.makeCommit(r, writeTree(g.store, r.index), [g.head(r)!], op.message);
    if (!id) return 128;
    g.setHead(r, id); r.op = undefined;
    g.out(...commitSummary(g, r, id, true));
    return 0;
  }
  if (r.unmerged.size) { g.err('error: Reverting is not possible because you have unmerged files.', "hint: Fix them up in the work tree, and then use 'git add/rm <file>'", 'fatal: revert failed'); return 128; }
  if (op) { g.err(`error: ${op.kind === 'revert' ? 'revert' : op.kind} is already in progress`, 'hint: try "git revert (--continue | --abort)"', 'fatal: revert failed'); return 128; }
  if (o.rest.length !== 1) { g.err(o.rest.length ? 'git revert：模擬環境一次只還原一個 commit' : 'usage: git revert [--[no-]edit] [-n] [-m <parent-number>] <commit>...'); return o.rest.length ? 1 : 129; }
  const c = g.commitOf(r, o.rest[0]), head = g.head(r);
  if (!c || !head) { g.err(`fatal: bad revision '${o.rest[0]}'`); return 128; }
  const commit = g.commit(c), mainline = value(o, 'm');
  if (commit.parents.length > 1 && mainline === undefined) { g.err(`error: commit ${c} is a merge but no -m option was given.`, 'fatal: revert failed'); return 128; }
  if (commit.parents.length <= 1 && mainline !== undefined) { g.err(`error: mainline was specified but commit ${c} is not a merge.`, 'fatal: revert failed'); return 128; }
  const parent = commit.parents[mainline === undefined ? 0 : Number(mainline) - 1];
  if (mainline !== undefined && !parent) { g.err(`error: commit ${c} does not have parent ${mainline}`, 'fatal: revert failed'); return 128; }
  const s = statusOf(g, r);
  if (s.staged.length || s.unmerged.length) { g.err('error: your local changes would be overwritten by revert.', 'hint: commit your changes or stash them to proceed.', 'fatal: revert failed'); return 128; }
  if (!g.ident(r)) return 128;
  const message = `Revert "${subjectOf(commit.message)}"\n\nThis reverts commit ${c}${mainline !== undefined ? `, reversing\nchanges made to ${parent}` : ''}.\n`;
  const m = mergeTrees(g, g.files(c), g.files(head), g.files(parent), 'HEAD', `parent of ${label(g, c)}`);
  if (!applyMerge(g, r, m)) return 128;
  g.out(...m.messages);
  if (m.unmerged.size) {
    r.op = { kind: 'revert', commit: c, message };
    g.err(`error: could not revert ${g.abbrev(c)}... ${subjectOf(commit.message)}`, 'hint: After resolving the conflicts, mark them with "git add/rm <pathspec>", then run "git revert --continue".');
    return 1;
  }
  const tree = writeTree(g.store, r.index);
  if (tree === g.commit(head).tree) { g.out(...longStatus(g, r)); return 1; }
  const id = g.makeCommit(r, tree, [head], message)!;
  g.setHead(r, id);
  g.out(...commitSummary(g, r, id, true));
  return 0;
}
