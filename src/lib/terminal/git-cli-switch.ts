import { reachable, sameEntry, sortPaths, subjectOf, type Entry, type Sha } from './git';
import { shortRef, validRefName, type Git, type Repo } from './git-core';
import { localChanges } from './git-format';
import { has, parseOpts, value } from './git-cli';
import { matches, trackingLines } from './git-cli-status';

/*
 * Engine stage E25 (docs/curriculum/CICD0_E25_GIT.md): moving HEAD — git switch, checkout (branches, -b, detached HEAD,
 * paths), restore and reset (--soft, --mixed, --hard, paths). Local changes travel with a switch unless the switch would
 * overwrite them (git's two-way merge, then "Your local changes … would be overwritten").
 */

/** Makes index and worktree the files of `to` (HEAD's files → to, local changes kept where they do not collide); false after git's error. */
export function checkoutFiles(g: Git, r: Repo, to: Map<string, Entry>, verb: 'checkout' | 'merge', force = false): boolean {
  const from = g.files(g.head(r)), wt = g.worktree(r), dirty: string[] = [], untracked: string[] = [];
  const paths = sortPaths(new Set([...from.keys(), ...to.keys(), ...force ? [...r.index.keys(), ...r.unmerged.keys()] : []]));
  for (const p of paths) {
    const old = from.get(p), neu = to.get(p), idx = r.index.get(p), w = wt.get(p);
    if (force || (sameEntry(old, neu) && !r.unmerged.has(p))) continue;
    if (sameEntry(idx, neu) && sameEntry(w, neu)) continue;
    if (!old && !idx) { if (w) untracked.push(p); continue; }
    if (!sameEntry(idx, old) || !sameEntry(w, idx)) dirty.push(p);
  }
  const why = verb === 'merge' ? 'merge' : 'switch branches';
  if (dirty.length) { g.err(`error: Your local changes to the following files would be overwritten by ${verb}:`, ...dirty.map(p => `\t${p}`), `Please commit your changes or stash them before you ${why}.`, 'Aborting'); return false; }
  if (untracked.length) { g.err(`error: The following untracked working tree files would be overwritten by ${verb}:`, ...untracked.map(p => `\t${p}`), `Please move or remove them before you ${why}.`, 'Aborting'); return false; }
  for (const p of paths) {
    const old = from.get(p), neu = to.get(p);
    if (!force && sameEntry(old, neu)) continue;
    if (!force && sameEntry(r.index.get(p), neu) && sameEntry(wt.get(p), neu)) continue;
    r.unmerged.delete(p);
    if (neu) { r.index.set(p, neu); if (!sameEntry(wt.get(p), neu)) g.write(r, p, neu); }
    else { r.index.delete(p); if (wt.has(p) && (old || force)) g.remove(r, p); }
  }
  return true;
}

const headLine = (g: Git, id: Sha) => `HEAD is now at ${g.abbrev(id)} ${subjectOf(g.commit(id).message)}`;
/** Commits only the detached HEAD reaches (git's "you are leaving N commits behind"). */
function orphans(g: Git, r: Repo, next: Sha): Sha[] {
  const head = g.head(r);
  if (g.attached(r) || !head) return [];
  const kept = reachable(g.store, [next, ...[...r.refs.values()].map(id => g.peel(id)!)]);
  return [...reachable(g.store, [head])].filter(id => !kept.has(id));
}

/** Points HEAD at a branch (or detaches it at a commit) after moving the files; the messages of git switch and checkout. */
export function moveHead(g0: Git, r: Repo, target: { branch?: string; commit: Sha; name: string; created?: boolean; force?: boolean; note?: boolean; quiet?: boolean }): boolean {
  if (!checkoutFiles(g0, r, g0.files(target.commit), 'checkout', target.force)) return false;
  const g = target.quiet ? quietGit(g0) : g0;
  const before = g.attached(r) ? g.branch(r)! : g.head(r);
  const lost = orphans(g, r, target.commit), oldHead = g.head(r);
  if (lost.length) g.err(`Warning: you are leaving ${lost.length} commit${lost.length > 1 ? 's' : ''} behind, not connected to any of your branches:`, '', ...lost.slice(0, 5).map(id => `  ${g.abbrev(id)} ${subjectOf(g.commit(id).message)}`), '');
  else if (!g.attached(r) && oldHead && oldHead !== target.commit) g.err(`Previous HEAD position was ${g.abbrev(oldHead)} ${subjectOf(g.commit(oldHead).message)}`);
  if (before && before !== (target.branch ?? target.commit)) r.previous = before;
  if (target.branch) {
    const same = r.head === `refs/heads/${target.branch}`;
    r.head = `refs/heads/${target.branch}`; r.detached = undefined;
    g.out(...localChanges(g, r));
    g.err(target.created ? `Switched to a new branch '${target.branch}'` : same ? `Already on '${target.branch}'` : `Switched to branch '${target.branch}'`);
    g.out(...trackingLines(g, r).filter(l => l));
  } else {
    r.head = target.commit; r.detached = { name: g.dwim(r, target.name) ? target.name : g.abbrev(target.commit), at: target.commit };
    g.out(...localChanges(g, r));
    if (target.note) g.err(`Note: switching to '${target.name}'.`, '', "You are in 'detached HEAD' state.", '');
    g.err(headLine(g, target.commit));
  }
  return true;
}

/** The same repository state with feedback messages dropped (-q). */
const quietGit = (g: Git): Git => Object.assign(Object.create(Object.getPrototypeOf(g)) as Git, g, { io: { ...g.io, out: () => {}, err: () => {} } });

/** Starts a branch at a commit; from a remote-tracking branch it tracks it (branch.autoSetupMerge). */
export function createBranch(g: Git, r: Repo, name: string, start: string, at: Sha, track?: boolean): void {
  r.refs.set(`refs/heads/${name}`, at);
  const full = g.dwim(r, start);
  if (track !== false && full?.startsWith('refs/remotes/') && !full.endsWith('/HEAD')) {
    const [, remote, ...rest] = full.slice('refs/'.length).split('/');
    r.config.set(`branch.${name}.remote`, remote); r.config.set(`branch.${name}.merge`, `refs/heads/${rest.join('/')}`);
    g.out(`branch '${name}' set up to track '${shortRef(full)}'.`);
  }
}
/** The remote-tracking branch git switch NAME would create NAME from (exactly one remote has it). */
const dwimRemote = (r: Repo, name: string) => { const hits = [...r.refs.keys()].filter(k => /^refs\/remotes\/[^/]+\//.test(k) && k.replace(/^refs\/remotes\/[^/]+\//, '') === name && name !== 'HEAD'); return hits.length === 1 ? hits[0] : undefined; };

function needsResolved(g: Git, r: Repo): boolean {
  if (!r.unmerged.size) return false;
  g.err(...sortPaths(r.unmerged.keys()).map(p => `${p}: needs merge`), 'error: you need to resolve your current index first');
  return true;
}
function kindOf(g: Git, r: Repo, spec: string): string {
  const full = g.dwim(r, spec);
  return full?.startsWith('refs/tags/') ? 'tag' : full?.startsWith('refs/remotes/') ? 'remote branch' : 'commit';
}

/** git switch [-c|-C 分支 [起點]] [--detach [起點]] [-f] [-] 分支 */
export function switchCommand(g: Git, args: string[]): number {
  const o = parseOpts(g, 'switch', args, ['c|create=', 'C|force-create=', 'd|detach', 'f|discard-changes|force', 't|track', 'no-track', 'q|quiet'], '[<options>] [<branch>]');
  if (!o) return 129;
  const r = g.repo();
  if (!r) return 128;
  return switchTo(g, r, o.rest, { create: value(o, 'c') ?? value(o, 'C'), force: has(o, 'f'), recreate: has(o, 'C'), detach: has(o, 'd'), track: has(o, 'no-track') ? false : undefined, quiet: has(o, 'q') }, 'switch');
}

function switchTo(g: Git, r: Repo, rest: string[], opt: { create?: string; recreate?: boolean; force?: boolean; detach?: boolean; track?: false; quiet?: boolean }, cmd: 'switch' | 'checkout'): number {
  const quiet = opt.quiet, blocked = () => !opt.force && needsResolved(g, r);
  let spec = rest[0];
  const typed = spec === '-' ? (cmd === 'switch' ? '@{-1}' : '-') : spec;
  if (spec === '-') { if (!r.previous) { g.err(cmd === 'switch' ? 'fatal: invalid reference: @{-1}' : "error: pathspec '-' did not match any file(s) known to git"); return cmd === 'switch' ? 128 : 1; } spec = r.previous; }
  if (opt.create !== undefined) {
    const name = opt.create;
    if (!validRefName(name)) { g.err(`fatal: '${name}' is not a valid branch name`); return 128; }
    if (r.refs.has(`refs/heads/${name}`) && !opt.recreate) { g.err(`fatal: a branch named '${name}' already exists`); return 128; }
    const start = spec ?? 'HEAD', at = g.commitOf(r, start);
    if (!at) {
      if (start === 'HEAD') { r.head = `refs/heads/${name}`; if (!quiet) g.err(`Switched to a new branch '${name}'`); return 0; }
      g.err(cmd === 'switch' ? `fatal: invalid reference: ${start}` : `fatal: '${start}' is not a commit and a branch '${name}' cannot be created from it`); return 128;
    }
    if (blocked()) return 1;
    if (!checkoutFiles(g, r, g.files(at), 'checkout', opt.force)) return 1;
    createBranch(g, r, name, start, at, opt.track);
    return moveHead(g, r, { branch: name, commit: at, name, created: true, quiet }) ? 0 : 1;
  }
  if (spec === undefined) {
    if (opt.detach && blocked()) return 1;
    if (opt.detach) return moveHead(g, r, { commit: g.head(r)!, name: g.abbrev(g.head(r)!), quiet }) ? 0 : 1;
    if (cmd === 'checkout') { g.out(...trackingLines(g, r)); return 0; }
    g.err('fatal: missing branch or commit argument'); return 128;
  }
  const local = r.refs.get(`refs/heads/${spec}`);
  if (local && !opt.detach && blocked()) return 1;
  if (local && !opt.detach) return moveHead(g, r, { branch: spec, commit: local, name: spec, force: opt.force, quiet }) ? 0 : 1;
  const remote = !local && !opt.detach ? dwimRemote(r, spec) : undefined;
  if (remote) {
    const at = r.refs.get(remote)!;
    if (blocked()) return 1;
    if (!checkoutFiles(g, r, g.files(at), 'checkout', opt.force)) return 1;
    createBranch(g, r, spec, shortRef(remote), at, opt.track);
    return moveHead(g, r, { branch: spec, commit: at, name: spec, created: true, quiet }) ? 0 : 1;
  }
  const at = g.commitOf(r, spec);
  if (!at) { g.err(cmd === 'switch' ? `fatal: invalid reference: ${typed}` : `error: pathspec '${typed}' did not match any file(s) known to git`); return cmd === 'switch' ? 128 : 1; }
  if (cmd === 'switch' && !opt.detach) { g.err(`fatal: a branch is expected, got ${kindOf(g, r, spec)} '${spec}'`, 'hint: If you want to detach HEAD at the commit, try again with the --detach option.'); return 128; }
  if (blocked()) return 1;
  return moveHead(g, r, { commit: at, name: spec, force: opt.force, note: cmd === 'checkout' && !opt.detach, quiet }) ? 0 : 1;
}

/** git restore [-S|--staged] [-W|--worktree] [-s|--source 修訂] [--] 路徑… (and git checkout [修訂] -- 路徑…) */
function restorePaths(g: Git, r: Repo, specs: string[], source: string | undefined, staged: boolean, worktree: boolean, report: boolean): number {
  const rels = specs.map(s => g.rel(r, g.abs(s)));
  const bad = rels.findIndex(x => x === undefined);
  if (bad >= 0) { g.err(`fatal: ${specs[bad]}: '${specs[bad]}' is outside repository at '${r.path}'`); return 128; }
  let from: Map<string, Entry>;
  if (source !== undefined || staged) {
    const id = g.commitOf(r, source ?? 'HEAD');
    if (!id && source !== undefined) { g.err(`fatal: could not resolve ${source}`); return 128; }
    from = g.files(id);
  } else from = new Map(r.index);
  const known = new Set([...from.keys(), ...r.index.keys(), ...r.unmerged.keys()]);
  let count = 0;
  for (let k = 0; k < specs.length; k++) {
    const hits = [...known].filter(p => matches([rels[k]!], p));
    if (!hits.length) { g.err(`error: pathspec '${specs[k]}' did not match any file(s) known to git`); return 1; }
    for (const p of sortPaths(hits)) {
      if (worktree && !staged && source === undefined && r.unmerged.has(p)) { g.err(`error: path '${p}' is unmerged`); return 1; }
      const e = from.get(p);
      if (staged) { if (e) r.index.set(p, e); else r.index.delete(p); r.unmerged.delete(p); }
      if (worktree) { if (e) g.write(r, p, e); else if (source !== undefined || staged) g.remove(r, p); }
      count++;
    }
  }
  if (report) g.err(`Updated ${count} path${count === 1 ? '' : 's'} from ${source === undefined ? 'the index' : g.abbrev(g.commitOf(r, source)!)}`);
  return 0;
}

export function restoreCommand(g: Git, args: string[]): number {
  const o = parseOpts(g, 'restore', args, ['S|staged', 'W|worktree', 's|source=', 'q|quiet'], '[<options>] [--source=<branch>] <file>...');
  if (!o) return 129;
  const r = g.repo();
  if (!r) return 128;
  const specs = [...o.rest, ...o.paths ?? []];
  if (!specs.length) { g.err('fatal: you must specify path(s) to restore'); return 128; }
  const staged = has(o, 'S'), worktree = has(o, 'W') || !staged;
  return restorePaths(g, r, specs, value(o, 's') ?? (staged && worktree ? 'HEAD' : undefined), staged, worktree, false);
}

/** git checkout [-b|-B 分支] [-f] [--detach] [分支 | 修訂] | [修訂] -- 路徑… */
export function checkoutCommand(g: Git, args: string[]): number {
  const o = parseOpts(g, 'checkout', args, ['b=', 'B=', 'f|force', 'detach', 't|track', 'no-track', 'q|quiet'], '[<options>] <branch>');
  if (!o) return 129;
  const r = g.repo();
  if (!r) return 128;
  const create = value(o, 'b') ?? value(o, 'B');
  if (o.paths !== undefined && create === undefined) return restorePaths(g, r, o.paths, o.rest[0], o.rest[0] !== undefined, true, true);
  if (create === undefined && o.rest.length && !has(o, 'detach')) {
    const first = o.rest[0], isRev = first === '-' || r.refs.has(`refs/heads/${first}`) || dwimRemote(r, first) || g.commitOf(r, first);
    if (!isRev || o.rest.length > 1) return isRev ? restorePaths(g, r, o.rest.slice(1), first, true, true, true) : restorePaths(g, r, o.rest, undefined, false, true, true);
  }
  return switchTo(g, r, o.rest, { create, recreate: has(o, 'B'), force: has(o, 'f'), detach: has(o, 'detach'), track: has(o, 'no-track') ? false : undefined, quiet: has(o, 'q') }, 'checkout');
}

/** git reset [--soft|--mixed|--hard] [修訂] | git reset [修訂] [--] 路徑… */
export function resetCommand(g: Git, args: string[]): number {
  const o = parseOpts(g, 'reset', args, ['soft', 'mixed', 'hard', 'merge', 'keep', 'q|quiet'], '[--mixed | --soft | --hard | --merge | --keep] [-q] [<commit>]');
  if (!o) return 129;
  const r = g.repo();
  if (!r) return 128;
  const first = o.rest[0], isRev = first !== undefined && g.commitOf(r, first) !== undefined;
  const paths = [...isRev ? o.rest.slice(1) : o.rest, ...o.paths ?? []];
  if (first !== undefined && !isRev && o.paths === undefined && !g.nodes.has(g.abs(first))) { g.err(g.badRev(r, first)); return 128; }
  const unstaged = () => { const l = localChanges(g, r).filter(x => !x.startsWith('A\t')); if (l.length && !has(o, 'q')) g.out('Unstaged changes after reset:', ...l); };
  if (paths.length) {
    if (has(o, 'soft') || has(o, 'hard')) { g.err(`fatal: Cannot do ${has(o, 'soft') ? 'soft' : 'hard'} reset with paths.`); return 128; }
    const code = restorePaths(g, r, paths, isRev ? first : 'HEAD', true, false, false);
    if (!code) unstaged();
    return code;
  }
  const target = g.commitOf(r, isRev ? first : 'HEAD');
  const old = g.head(r);
  if (!target) { g.err("fatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree."); return 128; }
  if (has(o, 'soft') && r.op?.kind === 'merge') { g.err('fatal: Cannot do a soft reset in the middle of a merge.'); return 128; }
  if (has(o, 'merge') || has(o, 'keep')) { g.err(`git reset --${has(o, 'merge') ? 'merge' : 'keep'}：模擬環境不支援，請用 --soft、--mixed 或 --hard`); return 1; }
  if (has(o, 'hard')) {
    checkoutFiles(g, r, g.files(target), 'checkout', true);
    for (const p of [...r.index.keys()]) if (!g.files(target).has(p)) r.index.delete(p);
  } else if (!has(o, 'soft')) { r.index = g.files(target); r.unmerged.clear(); }
  if (old) r.origHead = old;
  g.setHead(r, target);
  if (r.op?.kind !== 'rebase') r.op = undefined;
  if (has(o, 'hard')) { r.unmerged.clear(); if (!has(o, 'q')) g.out(headLine(g, target)); }
  else if (!has(o, 'soft')) unstaged();
  return 0;
}
