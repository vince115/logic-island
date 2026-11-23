import { isAncestor, merge3, mergeBases, sameEntry, sortPaths, stripspace, writeTree, type Entry, type Files, type Sha } from './git';
import { shortRef, type Git, type Repo } from './git-core';
import { fileChanges, modeLines, statLines } from './git-format';
import type { Unmerged } from './git-state';
import { has, parseOpts, value } from './git-cli';
import { checkoutFiles } from './git-cli-switch';
import { commitSummary } from './git-cli-commit';

/*
 * Engine stage E25 (docs/curriculum/CICD0_E25_GIT.md): the three-way merge of two trees (merge-ort's results without
 * rename detection: a file changed on one side takes that side; changed on both, xdiff's line merge with conflict markers;
 * deleted on one side and changed on the other, a modify/delete conflict) and git merge (fast-forward, --no-ff, --ff-only,
 * conflicts, --abort, --continue). Rebase, revert and pull reuse mergeTrees and applyMerge.
 */

export interface TreeMerge { clean: Map<string, Entry>; worktree: Map<string, Entry>; unmerged: Map<string, Unmerged>; messages: string[] }

/** Merges ours and theirs from base path by path; labels name the sides in markers and messages (HEAD, feature, abc1234 (subject)). */
export function mergeTrees(g: Git, base: Files, ours: Files, theirs: Files, oursLabel: string, theirsLabel: string): TreeMerge {
  const out: TreeMerge = { clean: new Map(), worktree: new Map(), unmerged: new Map(), messages: [] };
  const text = (e: Entry | undefined) => e ? g.store.blobText(e.id) : '';
  for (const p of sortPaths(new Set([...base.keys(), ...ours.keys(), ...theirs.keys()]))) {
    const b = base.get(p), o = ours.get(p), t = theirs.get(p);
    const take = (e: Entry | undefined) => { if (e) { out.clean.set(p, e); out.worktree.set(p, e); } };
    if (sameEntry(o, t) || sameEntry(b, t)) { take(o); continue; }
    if (sameEntry(b, o)) { take(t); continue; }
    if (o && t) {
      out.messages.push(`Auto-merging ${p}`);
      const m = merge3(text(b), text(o), text(t), oursLabel, theirsLabel);
      const mode = o.mode === t.mode || !b ? o.mode : b.mode === o.mode ? t.mode : o.mode;
      const id = g.store.blob(m.text);
      if (!m.conflicts) { take({ id, mode }); continue; }
      out.messages.push(`CONFLICT (${b ? 'content' : 'add/add'}): Merge conflict in ${p}`);
      out.unmerged.set(p, { ...b ? { base: b } : {}, ours: o, theirs: t });
      out.worktree.set(p, { id, mode });
      continue;
    }
    // One side deleted the file, the other changed it: the changed version stays in the worktree.
    const [deletedIn, modifiedIn, kept] = o ? [theirsLabel, oursLabel, o] : [oursLabel, theirsLabel, t!];
    out.messages.push(`CONFLICT (modify/delete): ${p} deleted in ${deletedIn} and modified in ${modifiedIn}.  Version ${modifiedIn} of ${p} left in tree.`);
    out.unmerged.set(p, { base: b, ...o ? { ours: o } : {}, ...t ? { theirs: t } : {} });
    out.worktree.set(p, kept);
  }
  return out;
}

/** Puts a tree merge into index and worktree (HEAD's files → the result); false after git's error when local changes are in the way. */
export function applyMerge(g: Git, r: Repo, m: TreeMerge): boolean {
  const head = g.files(g.head(r)), wt = g.worktree(r), dirty: string[] = [], untracked: string[] = [];
  const paths = sortPaths(new Set([...head.keys(), ...m.worktree.keys(), ...m.unmerged.keys()]));
  for (const p of paths) {
    const h = head.get(p), w = m.worktree.get(p);
    if (sameEntry(h, w) && !m.unmerged.has(p)) continue;
    const i = r.index.get(p), x = wt.get(p);
    if (!h && !i) { if (x && !sameEntry(x, w)) untracked.push(p); continue; }
    if (!sameEntry(i, h) || !sameEntry(x, i)) dirty.push(p);
  }
  if (dirty.length) { g.err('error: Your local changes to the following files would be overwritten by merge:', ...dirty.map(p => `\t${p}`), 'Please commit your changes or stash them before you merge.', 'Aborting'); return false; }
  if (untracked.length) { g.err('error: The following untracked working tree files would be overwritten by merge:', ...untracked.map(p => `\t${p}`), 'Please move or remove them before you merge.', 'Aborting'); return false; }
  for (const p of paths) {
    const h = head.get(p), w = m.worktree.get(p), c = m.clean.get(p);
    if (m.unmerged.has(p)) { r.index.delete(p); r.unmerged.set(p, m.unmerged.get(p)!); }
    else if (c) r.index.set(p, c); else r.index.delete(p);
    if (sameEntry(h, w) && !m.unmerged.has(p)) continue;
    if (w) { if (!sameEntry(wt.get(p), w)) g.write(r, p, w); } else if (wt.has(p)) g.remove(r, p);
  }
  return true;
}

/** git merge's default message for what was named (fmt-merge-msg; " into X" unless X is main or master). */
export function mergeMessage(g: Git, r: Repo, spec: string): string {
  const full = g.dwim(r, spec), branch = g.branch(r);
  const what = full?.startsWith('refs/heads/') ? `branch '${shortRef(full)}'` : full?.startsWith('refs/remotes/') ? `remote-tracking branch '${shortRef(full)}'`
    : full?.startsWith('refs/tags/') ? `tag '${shortRef(full)}'` : `commit '${spec}'`;
  return `Merge ${what}${branch && branch !== 'main' && branch !== 'master' ? ` into ${branch}` : ''}\n`;
}

/** Fast-forwards HEAD to a commit (Updating a..b, Fast-forward, the diffstat); false when local changes are in the way. */
export function fastForward(g: Git, r: Repo, to: Sha, quiet = false): boolean {
  const from = g.head(r)!;
  if (!checkoutFiles(g, r, g.files(to), 'merge')) return false;
  r.origHead = from;
  g.setHead(r, to);
  const changes = fileChanges(g.files(from), g.files(to));
  if (!quiet) g.out(`Updating ${g.abbrev(from)}..${g.abbrev(to)}`, 'Fast-forward', ...statLines(g, changes), ...modeLines(changes));
  return true;
}

/** Merges a commit into HEAD: fast-forward, already up to date, a merge commit or conflicts (status 1). */
export function mergeInto(g: Git, r: Repo, theirs: Sha, opt: { label: string; message: string; ff: 'default' | 'no' | 'only'; quiet?: boolean }): number {
  const head = g.head(r);
  if (!head) {
    if (!checkoutFiles(g, r, g.files(theirs), 'merge')) return 128;
    g.setHead(r, theirs);
    return 0;
  }
  const base = mergeBases(g.store, head, theirs)[0];
  if (!base) { g.err('fatal: refusing to merge unrelated histories'); return 128; }
  if (isAncestor(g.store, theirs, head)) { if (!opt.quiet) g.out('Already up to date.'); return 0; }
  if (base === head && opt.ff !== 'no') return fastForward(g, r, theirs, opt.quiet) ? 0 : 1;
  if (opt.ff === 'only') { g.err('fatal: Not possible to fast-forward, aborting.'); return 128; }
  if (!g.ident(r)) return 128;
  const m = mergeTrees(g, g.files(base), g.files(head), g.files(theirs), 'HEAD', opt.label);
  if (!applyMerge(g, r, m)) return 2;
  r.origHead = head;
  g.out(...m.messages);
  if (m.unmerged.size) {
    r.op = { kind: 'merge', head: theirs, message: opt.message };
    g.out('Automatic merge failed; fix conflicts and then commit the result.');
    return 1;
  }
  const id = g.makeCommit(r, writeTree(g.store, r.index), [head, theirs], opt.message)!;
  g.setHead(r, id);
  const changes = fileChanges(g.files(head), g.files(id));
  if (!opt.quiet) g.out("Merge made by the 'ort' strategy.", ...statLines(g, changes), ...modeLines(changes));
  return 0;
}

/** Ends a merge: back to HEAD's files (tracked files only; untracked ones stay). */
export function abortTo(g: Git, r: Repo, to: Sha) {
  checkoutFiles(g, r, g.files(to), 'checkout', true);
  r.unmerged.clear();
  r.op = undefined;
}

/** git merge [--no-ff|--ff-only] [-m 訊息] [--no-edit] [--abort|--continue] [修訂] */
export function mergeCommand(g: Git, args: string[]): number {
  const o = parseOpts(g, 'merge', args, ['no-ff', 'ff-only', 'ff', 'm|message=', 'no-edit', 'edit', 'abort', 'continue', 'q|quiet', 'squash', 'allow-unrelated-histories'], '[<options>] [<commit>...]');
  if (!o) return 129;
  const r = g.repo();
  if (!r) return 128;
  if (has(o, 'squash')) { g.err('git merge --squash：模擬環境不支援（PR 的 squash 合併在引擎階段 E26）'); return 1; }
  if (has(o, 'abort')) {
    if (r.op?.kind !== 'merge') { g.err('fatal: There is no merge to abort (MERGE_HEAD missing).'); return 128; }
    abortTo(g, r, g.head(r)!);
    return 0;
  }
  if (has(o, 'continue')) {
    if (r.op?.kind !== 'merge') { g.err('fatal: There is no merge in progress (MERGE_HEAD missing).'); return 128; }
    if (r.unmerged.size) { g.err('error: Committing is not possible because you have unmerged files.', "hint: Fix them up in the work tree, and then use 'git add/rm <file>'", 'fatal: Exiting because of an unresolved conflict.'); return 128; }
    const id = g.makeCommit(r, writeTree(g.store, r.index), [g.head(r)!, r.op.head], r.op.message);
    if (!id) return 128;
    g.setHead(r, id); r.op = undefined;
    g.out(...commitSummary(g, r, id));
    return 0;
  }
  if (r.op?.kind === 'merge') {
    if (r.unmerged.size) g.err('error: Merging is not possible because you have unmerged files.', "hint: Fix them up in the work tree, and then use 'git add/rm <file>'", 'fatal: Exiting because of an unresolved conflict.');
    else g.err('fatal: You have not concluded your merge (MERGE_HEAD exists).', 'Please, commit your changes before you merge.');
    return 128;
  }
  if (r.unmerged.size) { g.err('error: Merging is not possible because you have unmerged files.', "hint: Fix them up in the work tree, and then use 'git add/rm <file>'", 'fatal: Exiting because of an unresolved conflict.'); return 128; }
  let spec = o.rest[0];
  if (o.rest.length > 1) { g.err('git merge：模擬環境一次只合併一個分支（不支援 octopus 合併）'); return 1; }
  if (spec === undefined) {
    const up = g.upstream(r, g.branch(r));
    if (!up) { g.err('fatal: No remote for the current branch.'); return 128; }
    spec = shortRef(up);
  }
  if (spec === '-') { if (!r.previous) { g.err("fatal: No previous branch to merge"); return 128; } spec = r.previous; }
  const theirs = g.commitOf(r, spec);
  if (!theirs) { g.err(`merge: ${spec} - not something we can merge`); return 1; }
  const message = value(o, 'm') !== undefined ? stripspace(o.flags.get('m')!.join('\n\n')) : mergeMessage(g, r, spec);
  return mergeInto(g, r, theirs, { label: spec, message, ff: has(o, 'no-ff') ? 'no' : has(o, 'ff-only') ? 'only' : 'default', quiet: has(o, 'q') });
}
