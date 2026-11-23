import { aheadBehind, mergeBases, sortPaths, type Entry, type Sha } from './git';
import { shortRef, type Git, type Repo } from './git-core';
import { fileChanges, patchLines, shortStat, statLines, statusOf, UNMERGED_HOW, type FileChange, type Listed, type Status } from './git-format';
import { has, parseOpts } from './git-cli';

/*
 * Engine stage E25 (docs/curriculum/CICD0_E25_GIT.md): git status (long and short, the branch line, ahead/behind, merge
 * and rebase states) and git diff (index, --staged, commits, A..B, A...B, paths; patches, --stat, --name-only, --name-status).
 */

/** The tracking lines of git status for the current branch (none without an upstream). */
export function trackingLines(g: Git, r: Repo): string[] {
  const branch = g.branch(r), up = g.upstream(r, branch);
  if (!up) return [];
  const name = shortRef(up), tip = r.refs.get(up), ours = g.head(r);
  if (!tip) return [`Your branch is based on '${name}', but the upstream is gone.`, '  (use "git branch --unset-upstream" to fixup)'];
  if (!ours) return [];
  const { ahead, behind } = aheadBehind(g.store, ours, tip);
  const commits = (n: number) => `${n} commit${n === 1 ? '' : 's'}`;
  if (!ahead && !behind) return [`Your branch is up to date with '${name}'.`];
  if (!behind) return [`Your branch is ahead of '${name}' by ${commits(ahead)}.`, '  (use "git push" to publish your local commits)'];
  if (!ahead) return [`Your branch is behind '${name}' by ${commits(behind)}, and can be fast-forwarded.`, '  (use "git pull" to update your local branch)'];
  return [`Your branch and '${name}' have diverged,`, `and have ${ahead} and ${behind} different commits each, respectively.`, '  (use "git pull" if you want to integrate the remote branch with yours)'];
}
/** ahead 1, behind 2 / gone (git status -sb, git branch -v). */
export function trackingShort(g: Git, r: Repo, branch: string): { up?: string; text: string } {
  const up = g.upstream(r, branch);
  if (!up) return { text: '' };
  const tip = r.refs.get(up), ours = r.refs.get(`refs/heads/${branch}`);
  if (!tip) return { up, text: 'gone' };
  if (!ours) return { up, text: '' };
  const { ahead, behind } = aheadBehind(g.store, ours, tip);
  return { up, text: [ahead ? `ahead ${ahead}` : '', behind ? `behind ${behind}` : ''].filter(Boolean).join(', ') };
}

const label = (how: string, width: number) => `${how}:`.padEnd(width);
function headerLines(g: Git, r: Repo): string[] {
  const op = r.op;
  if (op?.kind === 'rebase') return [`interactive rebase in progress; onto ${g.abbrev(op.onto)}`];
  if (g.attached(r)) { const t = trackingLines(g, r); return [`On branch ${g.branch(r)}`, ...t, ...t.length ? [''] : []]; }
  const d = r.detached, head = g.head(r)!;
  return [d && d.at === head ? `HEAD detached at ${d.name}` : d ? `HEAD detached from ${d.name}` : `HEAD detached at ${g.abbrev(head)}`];
}
function opLines(g: Git, r: Repo, s: Status): string[] {
  const op = r.op, open = s.unmerged.length > 0;
  if (op?.kind === 'merge') return open ? ['You have unmerged paths.', '  (fix conflicts and run "git commit")', '  (use "git merge --abort" to abort the merge)', '']
    : ['All conflicts fixed but you are still merging.', '  (use "git commit" to conclude merge)', ''];
  if (op?.kind === 'rebase') return [`You are currently rebasing${op.branch ? ` branch '${op.branch}'` : ''} on '${g.abbrev(op.onto)}'.`,
    open ? '  (fix conflicts and then run "git rebase --continue")' : '  (all conflicts fixed: run "git rebase --continue")', ''];
  if (op?.kind === 'revert') return [`You are currently reverting commit ${g.abbrev(op.commit)}.`, open ? '  (fix conflicts and run "git revert --continue")' : '  (all conflicts fixed: run "git revert --continue")', ''];
  return [];
}
const listed = (g: Git, r: Repo, l: Listed) => l.from ? `${g.shown(r, l.from)} -> ${g.shown(r, l.path)}` : g.shown(r, l.path);

/** git status's long format. */
export function longStatus(g: Git, r: Repo, s = statusOf(g, r)): string[] {
  const out = headerLines(g, r);
  const born = g.head(r) !== undefined;
  if (!born) out.push('', 'No commits yet', '');
  out.push(...opLines(g, r, s));
  if (s.staged.length) {
    out.push('Changes to be committed:');
    if (!r.op) out.push(born ? '  (use "git restore --staged <file>..." to unstage)' : '  (use "git rm --cached <file>..." to unstage)');
    out.push(...s.staged.map(l => `\t${label(l.how, 12)}${listed(g, r, l)}`), '');
  }
  if (s.unmerged.length) {
    const rm = s.unmerged.some(u => u.how !== 'both modified' && u.how !== 'both added');
    out.push('Unmerged paths:', rm ? '  (use "git add/rm <file>..." as appropriate to mark resolution)' : '  (use "git add <file>..." to mark resolution)',
      ...s.unmerged.map(u => `\t${label(u.how, 17)}${g.shown(r, u.path)}`), '');
  }
  if (s.unstaged.length) {
    const rm = s.unstaged.some(l => l.how === 'deleted');
    out.push('Changes not staged for commit:', rm ? '  (use "git add/rm <file>..." to update what will be committed)' : '  (use "git add <file>..." to update what will be committed)',
      '  (use "git restore <file>..." to discard changes in working directory)', ...s.unstaged.map(l => `\t${label(l.how, 12)}${listed(g, r, l)}`), '');
  }
  if (s.untracked.length) out.push('Untracked files:', '  (use "git add <file>..." to include in what will be committed)', ...s.untracked.map(p => `\t${g.shown(r, p)}${p.endsWith('/') ? '/' : ''}`.replace(/\/\/$/, '/')), '');
  if (s.staged.length) return out;
  if (s.unstaged.length || s.unmerged.length) out.push('no changes added to commit (use "git add" and/or "git commit -a")');
  else if (s.untracked.length) out.push('nothing added to commit but untracked files present (use "git add" to track)');
  else if (!born) out.push('nothing to commit (create/copy files and use "git add" to track)');
  else out.push('nothing to commit, working tree clean');
  return out;
}

const CODE = { 'new file': 'A', modified: 'M', deleted: 'D', renamed: 'R', typechange: 'T' } as const;
function shortStatus(g: Git, r: Repo, s: Status, branch: boolean): string[] {
  const out: string[] = [];
  if (branch) {
    const b = g.branch(r);
    if (!b) out.push('## HEAD (no branch)');
    else if (g.head(r) === undefined) out.push(`## No commits yet on ${b}`);
    else { const t = trackingShort(g, r, b); out.push(`## ${b}${t.up ? `...${shortRef(t.up)}` : ''}${t.text ? ` [${t.text}]` : ''}`); }
  }
  const rows = new Map<string, string>();
  for (const u of s.unmerged) rows.set(u.path, `${UNMERGED_HOW[u.how]} ${g.shown(r, u.path)}`);
  const paths = sortPaths(new Set([...s.staged.map(l => l.path), ...s.unstaged.map(l => l.path), ...rows.keys()]));
  for (const p of paths) {
    if (rows.has(p)) { out.push(rows.get(p)!); continue; }
    const x = s.staged.find(l => l.path === p), y = s.unstaged.find(l => l.path === p);
    out.push(`${x ? CODE[x.how] : ' '}${y ? CODE[y.how] : ' '} ${x?.from ? `${g.shown(r, x.from)} -> ` : ''}${g.shown(r, p)}`);
  }
  out.push(...s.untracked.map(p => `?? ${g.shown(r, p)}${p.endsWith('/') && !g.shown(r, p).endsWith('/') ? '/' : ''}`));
  return out;
}

/** git status [-s|--short] [-b|--branch] [--long] */
export function statusCommand(g: Git, args: string[]): number {
  const o = parseOpts(g, 'status', args, ['s|short', 'b|branch', 'long', 'porcelain'], '[<options>] [--] [<pathspec>...]');
  if (!o) return 129;
  const r = g.repo();
  if (!r) return 128;
  const s = statusOf(g, r);
  if (has(o, 's') || has(o, 'porcelain')) g.out(...shortStatus(g, r, s, has(o, 'b')));
  else g.out(...longStatus(g, r, s));
  return 0;
}

/** Pathspecs as repository paths (a folder means everything in it); git's error for one outside the repository. */
export function pathspecs(g: Git, r: Repo, specs: readonly string[]): string[] | undefined {
  const out: string[] = [];
  for (const s of specs) {
    const rel = g.rel(r, g.abs(s));
    if (rel === undefined) { g.err(`fatal: ${s}: '${s}' is outside repository at '${r.path}'`); return undefined; }
    out.push(rel);
  }
  return out;
}
export const matches = (specs: readonly string[] | undefined, path: string) => !specs || specs.some(s => s === '' || path === s || path.startsWith(`${s}/`));
const limit = (files: Map<string, Entry>, specs?: readonly string[]) => specs ? new Map([...files].filter(([p]) => matches(specs, p))) : files;

/** git diff [--staged|--cached] [--stat] [--name-only] [--name-status] [修訂 [修訂]] [--] [路徑…] */
export function diffCommand(g: Git, args: string[]): number {
  const o = parseOpts(g, 'diff', args, ['staged|cached', 'stat', 'name-only', 'name-status', 'shortstat', 'no-renames', 'p|patch'], '[<options>] [<commit>] [--] [<path>...]');
  if (!o) return 129;
  const r = g.repo();
  if (!r) return 128;
  const revs: string[] = [], paths: string[] = [...o.paths ?? []];
  for (const w of o.rest) {
    if (!o.paths && !paths.length && (/\.\.\.?/.test(w) ? w.split(/\.\.\.?/).every(x => !x || g.commitOf(r, x)) : g.commitOf(r, w))) { revs.push(w); continue; }
    if (!o.paths && !g.nodes.has(g.abs(w))) { g.err(g.badRev(r, w)); return 128; }
    paths.push(w);
  }
  const specs = paths.length ? pathspecs(g, r, paths) : undefined;
  if (paths.length && !specs) return 128;
  const texts = new Map<Sha, string>();
  const worktree = () => {
    const wt = g.worktree(r), out = new Map<string, Entry>();
    for (const [p, e] of wt) if (r.index.has(p) || r.unmerged.has(p)) { out.set(p, e); texts.set(e.id, g.text(r, p) ?? ''); }
    return out;
  };
  const commitFiles = (spec: string) => g.files(g.commitOf(r, spec === '' ? 'HEAD' : spec));
  let a: Map<string, Entry>, b: Map<string, Entry>, unmerged: string[] = [];
  const range = revs.length === 1 ? /^(.*?)(\.\.\.?)(.*)$/.exec(revs[0]) : null;
  if (range) {
    const left = g.commitOf(r, range[1] || 'HEAD')!, right = g.commitOf(r, range[3] || 'HEAD')!;
    a = g.files(range[2] === '...' ? mergeBases(g.store, left, right)[0] : left); b = g.files(right);
  } else if (revs.length >= 2) { a = commitFiles(revs[0]); b = commitFiles(revs[1]); }
  else if (has(o, 'staged')) {
    a = revs.length ? commitFiles(revs[0]) : g.files(g.head(r));
    b = new Map(r.index); unmerged = [...r.unmerged.keys()];
    for (const p of unmerged) { a.delete(p); b.delete(p); }
  } else if (revs.length) { a = commitFiles(revs[0]); b = worktree(); }
  else {
    a = new Map(r.index); b = worktree(); unmerged = [...r.unmerged.keys()];
    for (const p of unmerged) b.delete(p);
    for (const [p] of [...b]) if (!a.has(p)) b.delete(p);
  }
  const changes: FileChange[] = fileChanges(limit(a, specs), limit(b, specs), !has(o, 'no-renames'));
  const text = (id: Sha) => texts.get(id) ?? g.store.blobText(id);
  const out: string[] = sortPaths(unmerged.filter(p => matches(specs, p))).map(p => `* Unmerged path ${p}`);
  if (has(o, 'name-only')) out.push(...changes.map(c => c.path));
  else if (has(o, 'name-status')) out.push(...changes.map(c => c.from ? `R100\t${c.from}\t${c.path}` : `${!c.a ? 'A' : !c.b ? 'D' : 'M'}\t${c.path}`));
  else if (has(o, 'stat')) out.push(...statLines(g, changes, text));
  else if (has(o, 'shortstat')) { if (changes.length) out.push(shortStat(g, changes, text)); }
  else out.push(...patchLines(g, changes, text));
  g.out(...out);
  return 0;
}
