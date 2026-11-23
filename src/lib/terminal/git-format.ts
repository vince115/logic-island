import { isIgnored, lineCounts, parseIgnore, sameEntry, sortPaths, unifiedHunks, ZERO, type Entry, type Files, type IgnoreRule, type Sha } from './git';
import { plural, type Git, type Repo } from './git-core';

/*
 * Engine stage E25 (docs/curriculum/CICD0_E25_GIT.md): what several git commands print the same way — the changes
 * between two sets of files (exact renames), git diff's patches, --stat and the summary lines (create mode, rename), and
 * the staged, unstaged, unmerged and untracked paths of git status (and commit, switch, reset).
 */

/** One file of a diff: a (old) and b (new); from is a rename's source path. */
export interface FileChange { path: string; from?: string; a?: Entry; b?: Entry }

/** The changes from files a to files b (exact renames paired, git's default rename detection limited to identical content). */
export function fileChanges(a: Files, b: Files, renames = true): FileChange[] {
  const out: FileChange[] = [];
  const deleted: string[] = [], added: string[] = [];
  for (const p of sortPaths(new Set([...a.keys(), ...b.keys()]))) {
    const x = a.get(p), y = b.get(p);
    if (sameEntry(x, y)) continue;
    if (x && !y) deleted.push(p);
    else if (!x && y) added.push(p);
    else out.push({ path: p, a: x, b: y });
  }
  for (const p of added) {
    const k = renames ? deleted.findIndex(d => a.get(d)!.id === b.get(p)!.id) : -1;
    if (k >= 0) { const [from] = deleted.splice(k, 1); out.push({ path: p, from, a: a.get(from), b: b.get(p) }); }
    else out.push({ path: p, b: b.get(p) });
  }
  for (const p of deleted) out.push({ path: p, a: a.get(p) });
  return out.sort((x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : 0));
}

/** pprint_rename: a/{b => c}/d when the paths share leading or trailing folders. */
export function renameText(a: string, b: string): string {
  let pfx = 0;
  for (let i = 0; i < Math.min(a.length, b.length) && a[i] === b[i]; i++) if (a[i] === '/') pfx = i + 1;
  let sfx = 0;
  for (let i = 1; i <= Math.min(a.length, b.length) - pfx && a[a.length - i] === b[b.length - i]; i++) if (a[a.length - i] === '/') sfx = i;
  if (!pfx && !sfx) return `${a} => ${b}`;
  return `${a.slice(0, pfx)}{${a.slice(pfx, a.length - sfx)} => ${b.slice(pfx, b.length - sfx)}}${a.slice(a.length - sfx)}`;
}

export function summaryLine(files: number, ins: number, del: number): string {
  const parts = [` ${plural(files, 'file')} changed`];
  if (ins || !del) parts.push(`${ins} insertion${ins === 1 ? '' : 's'}(+)`);
  if (del || !ins) parts.push(`${del} deletion${del === 1 ? '' : 's'}(-)`);
  return parts.join(', ');
}

/** --stat (80 columns, git's scaling of the graph) and its summary line. */
/** Blob texts: the store's, or the worktree's for blobs git hashed without writing. */
export type TextOf = (id: Sha) => string;
const storeText = (git: Git): TextOf => id => git.store.blobText(id);

export function statLines(git: Git, changes: readonly FileChange[], text: TextOf = storeText(git)): string[] {
  if (!changes.length) return [];
  const rows = changes.map(c => {
    const n = lineCounts(c.a ? text(c.a.id) : '', c.b ? text(c.b.id) : '');
    return { name: c.from ? renameText(c.from, c.path) : c.path, add: n.added, del: n.removed };
  });
  let width = 80;
  const maxChange = Math.max(...rows.map(r => r.add + r.del)), numberWidth = String(maxChange).length;
  let nameWidth = Math.max(...rows.map(r => r.name.length)), graphWidth = maxChange;
  if (width < 16 + 6 + numberWidth) width = 16 + 6 + numberWidth;
  if (nameWidth + numberWidth + 6 + graphWidth > width) {
    if (graphWidth > Math.floor(width * 3 / 8) - numberWidth - 6) graphWidth = Math.max(6, Math.floor(width * 3 / 8) - numberWidth - 6);
    if (nameWidth > width - numberWidth - 6 - graphWidth) nameWidth = width - numberWidth - 6 - graphWidth;
    else graphWidth = width - numberWidth - 6 - nameWidth;
  }
  const scale = (it: number) => it ? 1 + Math.floor(it * (graphWidth - 1) / maxChange) : 0;
  const lines = rows.map(r => {
    let name = r.name;
    if (name.length > nameWidth) { name = name.slice(name.length - (nameWidth - 3)); const slash = name.indexOf('/'); name = `...${slash >= 0 ? name.slice(slash) : name}`; }
    let add = r.add, del = r.del;
    if (graphWidth <= maxChange) {
      let total = scale(add + del);
      if (total < 2 && add && del) total = 2;
      if (add < del) { add = scale(add); del = total - add; } else { del = scale(del); add = total - del; }
    }
    const n = r.add + r.del;
    return ` ${name}${' '.repeat(Math.max(0, nameWidth - name.length))} | ${String(n).padStart(numberWidth)}${n ? ' ' : ''}${'+'.repeat(add)}${'-'.repeat(del)}`;
  });
  return [...lines, summaryLine(rows.length, rows.reduce((s, r) => s + r.add, 0), rows.reduce((s, r) => s + r.del, 0))];
}

/** The summary line only (git commit's), counting the changed lines. */
export function shortStat(git: Git, changes: readonly FileChange[], text: TextOf = storeText(git)): string {
  let ins = 0, del = 0;
  for (const c of changes) { const n = lineCounts(c.a ? text(c.a.id) : '', c.b ? text(c.b.id) : ''); ins += n.added; del += n.removed; }
  return summaryLine(changes.length, ins, del);
}

/** --summary: create mode, delete mode, rename, mode change. */
export function modeLines(changes: readonly FileChange[]): string[] {
  return changes.flatMap(c => {
    if (c.from) return [` rename ${renameText(c.from, c.path)} (100%)`];
    if (!c.a) return [` create mode ${c.b!.mode} ${c.path}`];
    if (!c.b) return [` delete mode ${c.a.mode} ${c.path}`];
    return c.a.mode !== c.b.mode ? [` mode change ${c.a.mode} => ${c.b.mode} ${c.path}`] : [];
  });
}

/** git diff's patch of the changes (texts of blobs from the store or, for the worktree, the files). */
export function patchLines(git: Git, changes: readonly FileChange[], text: TextOf = storeText(git)): string[] {
  const out: string[] = [];
  for (const c of changes) {
    const from = c.from ?? c.path, ta = c.a ? text(c.a.id) : '', tb = c.b ? text(c.b.id) : '';
    out.push(`diff --git a/${from} b/${c.path}`);
    if (!c.a) out.push(`new file mode ${c.b!.mode}`);
    else if (!c.b) out.push(`deleted file mode ${c.a.mode}`);
    else if (c.a.mode !== c.b.mode) out.push(`old mode ${c.a.mode}`, `new mode ${c.b.mode}`);
    if (c.from) out.push('similarity index 100%', `rename from ${c.from}`, `rename to ${c.path}`);
    if (c.a && c.b && c.a.id === c.b.id) continue;
    const same = c.a && c.b && c.a.mode === c.b.mode;
    out.push(`index ${c.a ? git.abbrev(c.a.id) : ZERO.slice(0, 7)}..${c.b ? git.abbrev(c.b.id) : ZERO.slice(0, 7)}${same ? ` ${c.b!.mode}` : ''}`);
    if (ta === tb) continue;
    out.push(c.a ? `--- a/${from}` : '--- /dev/null', c.b ? `+++ b/${c.path}` : '+++ /dev/null', ...unifiedHunks(ta, tb));
  }
  return out;
}

// --------------------------------------------------------------------------------------------------------- status
export type How = 'new file' | 'modified' | 'deleted' | 'renamed' | 'typechange';
export interface Listed { path: string; how: How; from?: string }
const howOf = (c: FileChange): How => c.from ? 'renamed' : !c.a ? 'new file' : !c.b ? 'deleted' : (c.a.mode === '120000') !== (c.b.mode === '120000') ? 'typechange' : 'modified';
export const UNMERGED_HOW = { 'both deleted': 'DD', 'added by us': 'AU', 'deleted by them': 'UD', 'added by them': 'UA', 'deleted by us': 'DU', 'both added': 'AA', 'both modified': 'UU' } as const;
export type UnmergedHow = keyof typeof UNMERGED_HOW;

export interface Status { staged: Listed[]; unstaged: Listed[]; unmerged: { path: string; how: UnmergedHow }[]; untracked: string[]; ignored: IgnoreRule[] }

/** The .gitignore rules of the worktree (outer files first, so inner rules win). */
export function ignoreRules(git: Git, r: Repo, wt: Map<string, Entry>): IgnoreRule[] {
  const files = [...wt.keys()].filter(p => p === '.gitignore' || p.endsWith('/.gitignore')).sort((a, b) => a.split('/').length - b.split('/').length);
  return files.flatMap(p => parseIgnore(git.text(r, p) ?? '', p.slice(0, p.length - '.gitignore'.length)));
}

export function statusOf(git: Git, r: Repo): Status {
  const head = git.files(git.head(r)), wt = git.worktree(r), rules = ignoreRules(git, r, wt);
  const indexNoConflicts = new Map([...r.index].filter(([p]) => !r.unmerged.has(p)));
  const headNoConflicts = new Map([...head].filter(([p]) => !r.unmerged.has(p)));
  const staged = fileChanges(headNoConflicts, indexNoConflicts).map(c => ({ path: c.path, how: howOf(c), ...c.from ? { from: c.from } : {} }));
  const unstaged: Listed[] = [];
  for (const p of sortPaths(indexNoConflicts.keys())) {
    const i = r.index.get(p)!, w = wt.get(p);
    if (!w) unstaged.push({ path: p, how: 'deleted' });
    else if (!sameEntry(i, w)) unstaged.push({ path: p, how: (i.mode === '120000') !== (w.mode === '120000') ? 'typechange' : 'modified' });
  }
  const unmerged = sortPaths(r.unmerged.keys()).map(p => {
    const u = r.unmerged.get(p)!;
    const how: UnmergedHow = u.ours && u.theirs ? (u.base ? 'both modified' : 'both added') : u.ours ? (u.base ? 'deleted by them' : 'added by us') : u.theirs ? (u.base ? 'deleted by us' : 'added by them') : 'both deleted';
    return { path: p, how };
  });
  const tracked = new Set([...r.index.keys(), ...r.unmerged.keys()]);
  const loose = sortPaths([...wt.keys()].filter(p => !tracked.has(p) && !isIgnored(rules, p)));
  // A folder with no tracked file in it is listed once, as dir/ (status.showUntrackedFiles=normal).
  const untracked: string[] = [];
  for (const p of loose) {
    const parts = p.split('/');
    let shown = p;
    for (let k = 1; k < parts.length; k++) {
      const dir = `${parts.slice(0, k).join('/')}/`;
      if (![...tracked].some(t => t.startsWith(dir))) { shown = dir; break; }
    }
    if (!untracked.includes(shown)) untracked.push(shown);
  }
  return { staged, unstaged, unmerged, untracked, ignored: rules };
}
export const isClean = (s: Status) => !s.staged.length && !s.unstaged.length && !s.unmerged.length;

/** Lines like `M\tf.txt` (git switch's and reset's list of local changes); tracked: what HEAD now has. */
export function localChanges(git: Git, r: Repo): string[] {
  const head = git.files(git.head(r)), wt = git.worktree(r);
  const paths = sortPaths(new Set([...head.keys(), ...r.index.keys()]));
  return paths.flatMap(p => {
    const h = head.get(p), i = r.index.get(p), w = i ? wt.get(p) : undefined;
    if (r.unmerged.has(p)) return [`U\t${git.shown(r, p)}`];
    if (!i) return h ? [`D\t${git.shown(r, p)}`] : [];
    if (!h) return [`A\t${git.shown(r, p)}`];
    if (!w) return [`D\t${git.shown(r, p)}`];
    return !sameEntry(h, i) || !sameEntry(i, w) ? [`M\t${git.shown(r, p)}`] : [];
  });
}
export const entryOf = (id: Sha, mode: Entry['mode'] = '100644'): Entry => ({ id, mode });
