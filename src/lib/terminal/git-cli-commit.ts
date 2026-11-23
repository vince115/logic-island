import { gitDate, isIgnored, sameEntry, sortPaths, stripspace, subjectOf, writeTree, type Sha } from './git';
import { canonicalKey, type Git, type Repo } from './git-core';
import { fileChanges, ignoreRules, modeLines, shortStat } from './git-format';
import { has, parseOpts, value } from './git-cli';
import { longStatus, matches, pathspecs } from './git-cli-status';

/*
 * Engine stage E25 (docs/curriculum/CICD0_E25_GIT.md): git init, config, add, rm, mv and commit (-m, -a, --amend; the
 * summary [branch abc1234] subject with --shortstat and --summary). There is no editor: a commit needs -m, except the
 * prepared message of a merge or revert (taken as saved) and --amend (the old message, like --no-edit).
 */

const GLOB = /[*?[]/;
const globRe = (spec: string) => new RegExp(`^${spec.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`);

/** The repository paths a pathspec names among these paths (a folder: everything in it; *?[ : git's glob, * crossing /). */
function expandSpec(g: Git, r: Repo, spec: string, paths: readonly string[]): string[] | undefined {
  const rel = g.rel(r, g.abs(spec));
  if (rel === undefined) { g.err(`fatal: ${spec}: '${spec}' is outside repository at '${r.path}'`); return undefined; }
  if (GLOB.test(rel)) { const re = globRe(rel); return paths.filter(p => re.test(p)); }
  return paths.filter(p => matches([rel], p));
}

/** git add [-A|--all] [-u|--update] [-f|--force] [--] 路徑… */
export function addCommand(g: Git, args: string[]): number {
  const o = parseOpts(g, 'add', args, ['A|all', 'u|update', 'f|force', 'v|verbose', 'n|dry-run'], '[<options>] [--] <pathspec>...');
  if (!o) return 129;
  const r = g.repo();
  if (!r) return 128;
  const specs = [...o.rest, ...o.paths ?? []];
  if (!specs.length && !has(o, 'A') && !has(o, 'u')) { g.err('Nothing specified, nothing added.', "hint: Maybe you wanted to say 'git add .'?"); return 0; }
  const wt = g.worktree(r), rules = ignoreRules(g, r, wt), tracked = new Set([...r.index.keys(), ...r.unmerged.keys()]);
  const all = sortPaths(new Set([...wt.keys(), ...tracked]));
  const chosen = new Set<string>(), ignored: string[] = [];
  for (const spec of specs.length ? specs : [g.rel(r, g.cwd) === '' || has(o, 'A') || has(o, 'u') ? r.path : g.cwd]) {
    const hits = expandSpec(g, r, spec, all);
    if (!hits) return 128;
    if (!hits.length) { g.err(`fatal: pathspec '${spec}' did not match any files`); return 128; }
    const exact = g.rel(r, g.abs(spec));
    for (const p of hits) {
      if (has(o, 'u') && !tracked.has(p)) continue;
      if (!tracked.has(p) && !has(o, 'f') && isIgnored(rules, p)) { if (p === exact) ignored.push(spec); continue; }
      chosen.add(p);
    }
  }
  for (const p of chosen) {
    if (has(o, 'n')) { g.out(wt.has(p) ? `add '${p}'` : `remove '${p}'`); continue; }
    r.unmerged.delete(p);
    const e = wt.has(p) ? g.stage(r, p) : undefined;
    if (e) r.index.set(p, e); else r.index.delete(p);
    if (has(o, 'v')) g.out(e ? `add '${p}'` : `remove '${p}'`);
  }
  if (ignored.length) { g.err('The following paths are ignored by one of your .gitignore files:', ...ignored, 'hint: Use -f if you really want to add them.'); return 1; }
  return 0;
}

/** git rm [-r] [--cached] [-f] [-q] [--] 路徑… */
export function rmCommand(g: Git, args: string[]): number {
  const o = parseOpts(g, 'rm', args, ['r', 'cached', 'f|force', 'q|quiet'], '[<options>] [--] <file>...');
  if (!o) return 129;
  const r = g.repo();
  if (!r) return 128;
  const specs = [...o.rest, ...o.paths ?? []];
  if (!specs.length) { g.err('usage: git rm [<options>] [--] <file>...'); return 129; }
  const tracked = sortPaths(new Set([...r.index.keys(), ...r.unmerged.keys()])), chosen: string[] = [];
  for (const spec of specs) {
    const hits = expandSpec(g, r, spec, tracked);
    if (!hits) return 128;
    if (!hits.length) { g.err(`fatal: pathspec '${spec}' did not match any files`); return 128; }
    const rel = g.rel(r, g.abs(spec));
    if (!has(o, 'r') && !GLOB.test(spec) && hits.some(p => p !== rel)) { g.err(`fatal: not removing '${spec}' recursively without -r`); return 128; }
    for (const p of hits) if (!chosen.includes(p)) chosen.push(p);
  }
  if (!has(o, 'f')) {
    const head = g.files(g.head(r)), wt = g.worktree(r);
    const staged = chosen.filter(p => !r.unmerged.has(p) && !sameEntry(r.index.get(p), head.get(p)) && wt.has(p) && !sameEntry(r.index.get(p), wt.get(p)));
    const local = chosen.filter(p => !r.unmerged.has(p) && wt.has(p) && !sameEntry(r.index.get(p), wt.get(p)) && !staged.includes(p));
    const stagedOnly = has(o, 'cached') ? [] : chosen.filter(p => !r.unmerged.has(p) && !sameEntry(r.index.get(p), head.get(p)) && sameEntry(r.index.get(p), wt.get(p)));
    const report = (what: string, list: string[], hint: string) => {
      g.err(`error: the following file${list.length > 1 ? 's have' : ' has'} ${what}:`, ...list.map(p => `    ${p}`), hint);
    };
    if (staged.length) { report('staged content different from both the file and the HEAD', staged, '(use -f to force removal)'); return 1; }
    if (!has(o, 'cached') && (local.length || stagedOnly.length)) {
      if (stagedOnly.length) report('changes staged in the index', stagedOnly, '(use --cached to keep the file, or -f to force removal)');
      if (local.length) report('local modifications', local, '(use --cached to keep the file, or -f to force removal)');
      return 1;
    }
  }
  for (const p of chosen) {
    if (!has(o, 'q')) g.out(`rm '${p}'`);
    r.index.delete(p); r.unmerged.delete(p);
    if (!has(o, 'cached')) g.remove(r, p);
  }
  return 0;
}

/** git mv [-f] 來源 目的地 | 來源… 目錄 */
export function mvCommand(g: Git, args: string[]): number {
  const o = parseOpts(g, 'mv', args, ['f|force', 'v|verbose', 'n|dry-run', 'k'], '[<options>] <source>... <destination>');
  if (!o) return 129;
  const r = g.repo();
  if (!r) return 128;
  const words = [...o.rest, ...o.paths ?? []];
  if (words.length < 2) { g.err('usage: git mv [<options>] <source>... <destination>'); return 129; }
  const relOf = (w: string) => g.rel(r, g.abs(w));
  const dest = relOf(words.at(-1)!), sources = words.slice(0, -1);
  if (dest === undefined) { g.err(`fatal: ${words.at(-1)}: '${words.at(-1)}' is outside repository at '${r.path}'`); return 128; }
  const destDir = g.nodes.get(g.full(r, dest))?.kind === 'dir';
  if (sources.length > 1 && !destDir) { g.err(`fatal: destination '${words.at(-1)}' is not a directory`); return 128; }
  const moves: [string, string][] = [];
  for (const s of sources) {
    const src = relOf(s);
    const to = destDir ? (dest ? `${dest}/` : '') + (src ?? '').slice((src ?? '').lastIndexOf('/') + 1) : dest;
    const where = `source=${src}, destination=${to}`;
    if (src === undefined || !g.nodes.has(g.full(r, src))) { g.err(`fatal: bad source, ${where}`); return 128; }
    const files = [...r.index.keys()].filter(p => matches([src], p));
    if (!files.length) { g.err(`fatal: not under version control, ${where}`); return 128; }
    if (g.nodes.has(g.full(r, to)) && !has(o, 'f')) { g.err(`fatal: destination exists, ${where}`); return 128; }
    moves.push([src, to]);
  }
  for (const [src, to] of moves) {
    if (has(o, 'v') || has(o, 'n')) g.out(`Renaming ${src} to ${to}`);
    if (has(o, 'n')) continue;
    const from = g.full(r, src), target = g.full(r, to);
    for (const [p, n] of [...g.nodes].filter(([p]) => p === from || p.startsWith(`${from}/`))) { g.nodes.delete(p); g.nodes.set(target + p.slice(from.length), n); }
    for (const p of [...r.index.keys()].filter(p => matches([src], p))) { const e = r.index.get(p)!; r.index.delete(p); r.index.set(to + p.slice(src.length), e); }
  }
  return 0;
}

/** The summary git commit prints: [branch (root-commit) abc1234] subject, then --shortstat and --summary (not for a merge). */
export function commitSummary(g: Git, r: Repo, id: Sha, amendDate = false): string[] {
  const c = g.commit(id), where = g.attached(r) ? g.branch(r)! : 'detached HEAD';
  const out = [`[${where}${c.parents.length || amendDate ? '' : ' (root-commit)'} ${g.abbrev(id)}] ${subjectOf(c.message)}`];
  if (c.author.name !== c.committer.name || c.author.email !== c.committer.email) out.push(` Author: ${c.author.name} <${c.author.email}>`);
  if (amendDate) out.push(` Date: ${gitDate(c.author.time, c.author.tz)}`);
  if (c.parents.length > 1) return out;
  const changes = fileChanges(g.files(c.parents[0]), g.files(id));
  return [...out, shortStat(g, changes), ...modeLines(changes)];
}

/** git commit [-a] [-m 訊息]… [--amend] [--no-edit] [--allow-empty] [-q] */
export function commitCommand(g: Git, args: string[]): number {
  const o = parseOpts(g, 'commit', args, ['a|all', 'm|message=', 'amend', 'no-edit', 'allow-empty', 'q|quiet', 'v|verbose'], '[<options>] [--] <pathspec>...');
  if (!o) return 129;
  const r = g.repo();
  if (!r) return 128;
  if (o.rest.length || o.paths?.length) { g.err('git commit 路徑：模擬環境不支援只提交部分路徑，請先 git add 再 git commit'); return 128; }
  if (has(o, 'a')) {
    const wt = g.worktree(r);
    for (const p of [...r.index.keys(), ...r.unmerged.keys()]) { r.unmerged.delete(p); const e = wt.has(p) ? g.stage(r, p) : undefined; if (e) r.index.set(p, e); else r.index.delete(p); }
  }
  if (r.unmerged.size) {
    g.out(...sortPaths(r.unmerged.keys()).map(p => `U\t${g.shown(r, p)}`));
    g.err('error: Committing is not possible because you have unmerged files.', "hint: Fix them up in the work tree, and then use 'git add/rm <file>'", 'fatal: Exiting because of an unresolved conflict.');
    return 128;
  }
  const head = g.head(r), amend = has(o, 'amend');
  if (amend && !head) { g.err('fatal: You have nothing to amend.'); return 128; }
  if (amend && r.op?.kind === 'merge') { g.err('fatal: You are in the middle of a merge -- cannot amend.'); return 128; }
  const old = amend ? g.commit(head!) : undefined;
  const given = o.flags.get('m');
  let message: string;
  if (given) message = stripspace(given.join('\n\n'));
  else if (old) message = old.message;
  else if (r.op?.kind === 'merge' || r.op?.kind === 'revert') message = r.op.message;
  else { g.err('git commit：模擬環境沒有文字編輯器，請用 -m 寫提交訊息（例如 git commit -m "說明"）'); return 1; }
  if (!message) { g.err('Aborting commit due to empty commit message.'); return 1; }
  const tree = writeTree(g.store, r.index);
  const parents = old ? [...old.parents] : r.op?.kind === 'merge' ? [head!, r.op.head] : head ? [head] : [];
  const parentTree = parents.length ? g.commit(parents[0]).tree : undefined;
  if (!amend && r.op?.kind !== 'merge' && !has(o, 'allow-empty') && (parentTree === tree || (!parents.length && !r.index.size))) {
    g.out(...longStatus(g, r));
    return 1;
  }
  const id = g.makeCommit(r, tree, parents, message, old?.author);
  if (!id) return 128;
  g.setHead(r, id);
  if (r.op?.kind === 'merge' || r.op?.kind === 'revert') r.op = undefined;
  if (!has(o, 'q')) g.out(...commitSummary(g, r, id, amend));
  return 0;
}

/** git config [--global|--local] [--list | --get | --unset] 名稱 [值] */
export function configCommand(g: Git, args: string[]): number {
  const o = parseOpts(g, 'config', args, ['global', 'local', 'system', 'l|list', 'get', 'unset', 'add', 'show-origin'], '[<options>]');
  if (!o) return 129;
  if (has(o, 'system')) { g.err('git config --system：模擬環境沒有系統層級的設定（/etc/gitconfig）'); return 1; }
  const r = g.find(), global = has(o, 'global') || (!has(o, 'local') && !r && !has(o, 'l') && o.rest.length === 1);
  if (!global && !r && (has(o, 'local') || o.rest.length === 2 || has(o, 'unset'))) { g.err('fatal: not in a git directory'); return 128; }
  const local = (): [string, string][] => r ? [...r.config] : [];
  if (has(o, 'l')) {
    const pairs = has(o, 'global') ? g.global() : has(o, 'local') ? local() : [...g.global(), ...local()];
    g.out(...pairs.map(([k, v]) => `${k}=${v}`));
    return 0;
  }
  const [key, val] = o.rest;
  if (key === undefined || o.rest.length > 2 || (has(o, 'unset') && val !== undefined)) { g.err('error: wrong number of arguments, should be from 1 to 2'); return 129; }
  if (!key.includes('.') || key.endsWith('.')) { g.err(`error: key does not contain a section: ${key}`); return 1; }
  if (!/^[A-Za-z0-9-]+(\..*)?\.[A-Za-z][A-Za-z0-9-]*$/.test(key)) { g.err(`error: invalid key: ${key}`); return 1; }
  const k = canonicalKey(key);
  if (has(o, 'unset')) {
    if (global) { if (!g.global().some(([x]) => x === k)) return 5; g.setGlobal(k, undefined); return 0; }
    if (!r!.config.has(k)) return 5;
    r!.config.delete(k);
    return 0;
  }
  if (val === undefined) {
    const v = has(o, 'global') ? g.global().filter(([x]) => x === k).at(-1)?.[1] : has(o, 'local') ? r?.config.get(k) : g.config(r, k);
    if (v === undefined) return 1;
    g.out(v);
    return 0;
  }
  if (global) g.setGlobal(k, val); else r!.config.set(k, val);
  return 0;
}

/** A new repository's own configuration (as git init writes .git/config on Linux). */
export const INIT_CONFIG: [string, string][] = [['core.repositoryformatversion', '0'], ['core.filemode', 'true'], ['core.bare', 'false'], ['core.logallrefupdates', 'true']];

/** git init [-b 分支] [-q] [資料夾] */
export function initCommand(g: Git, args: string[]): number {
  const o = parseOpts(g, 'init', args, ['b|initial-branch=', 'q|quiet', 'bare'], '[-q | --quiet] [--bare] [--initial-branch=<name>] [<directory>]');
  if (!o) return 129;
  if (has(o, 'bare')) { g.err('git init --bare：模擬環境的遠端儲存庫在 github.example 上，請用 git clone 或 git remote add'); return 1; }
  if (o.rest.length > 1) { g.err('usage: git init [-q | --quiet] [--bare] [--initial-branch=<name>] [<directory>]'); return 129; }
  const dir = g.abs(o.rest[0] ?? '.');
  if (g.nodes.has(dir) && g.nodes.get(dir)!.kind !== 'dir') { g.err(`fatal: cannot mkdir ${o.rest[0]}: File exists`); return 128; }
  const umask = g.state.umask ?? 0o022, owner = g.state.user;
  const parts = dir.split('/').filter(Boolean);
  for (let k = 1; k <= parts.length; k++) { const p = `/${parts.slice(0, k).join('/')}`; if (!g.nodes.has(p)) g.nodes.set(p, { kind: 'dir', mode: 0o777 & ~umask, owner }); }
  const gitDir = `${dir === '/' ? '' : dir}/.git`;
  if (g.hasGitDir(dir) && g.repos.some(r => r.path === dir)) { if (!has(o, 'q')) g.out(`Reinitialized existing Git repository in ${gitDir}/`); return 0; }
  const name = value(o, 'b') ?? g.config(undefined, 'init.defaultBranch');
  if (!name) g.err("hint: Using 'master' as the name for the initial branch.");
  const branch = name ?? 'master';
  g.nodes.set(gitDir, { kind: 'dir', mode: 0o777 & ~umask, owner });
  const at = g.repos.findIndex(r => r.path === dir);
  if (at >= 0) g.repos.splice(at, 1);
  g.repos.push({ path: dir, head: `refs/heads/${branch}`, refs: new Map(), symrefs: new Map(), index: new Map(), unmerged: new Map(), config: new Map(INIT_CONFIG), known: new Set(), stash: [] });
  if (!has(o, 'q')) g.out(`Initialized empty Git repository in ${gitDir}/`);
  return 0;
}
