import { isInside, LIMITS, resolvePath, type FsState } from './fs';
import { parseTime } from './clock';
import { offsetAt, offsetText, UTC_ZONE, zoneNamed } from './calendar';
import { readTree, reachable, Store, writeTree, type Entry, type FileMode, type Sha } from './git';
import { FORGE_URL, type ForgeRepo, type GitRepo } from './git-state';
import { canonicalKey, editConfig, validRefName } from './git-core';
import { INIT_CONFIG } from './git-cli-commit';
import type { TerminalFile, TerminalMachine } from './lesson';

/*
 * Engine stage E25 as lesson data (docs/curriculum/CICD0_E25_GIT.md §4). A machine of the git profile may declare
 * commits (labels, parents, the files each changes, messages, authors and times), bare repositories on the simulated forge
 * https://github.example/<owner>/<repo>.git and repositories on the machine (a worktree folder, its branches, HEAD, its
 * origin, upstreams, tags, staged changes, configuration). The engine computes Git's objects and real IDs; the worktree
 * is HEAD's files written as the user's files (a file the lesson lists itself is a local change), with a .git folder.
 */

export interface TerminalGitIdent { name: string; email: string }
export interface TerminalGitCommit {
  /** The lesson's label for the commit (branches, tags and checks use it; Git's ID is computed). */
  id: string;
  /** The parents' labels (default: the commit listed before it; [] makes a root commit). */
  parents?: string[];
  message: string;
  /** What changes from the first parent: path (relative to the repository) → content, or null to delete it. */
  files?: Record<string, string | null>;
  /** Paths among files that are executable (mode 100755). */
  executable?: string[];
  /** Default: git.user, else Logic Island <island@github.example>. */
  author?: TerminalGitIdent;
  /** UTC 'YYYY-MM-DD HH:MM:SS' (author and committer time). */
  time: string;
  /** The zone recorded with the time ('+0800'); default the machine's time zone at that time. */
  tz?: string;
  /** Another committer (a rebased or merged commit); default the author. */
  committer?: TerminalGitIdent & { time?: string };
}
/** A tag: lightweight (no message) or annotated (message; tagger default the commit's author, time default the commit's). */
export interface TerminalGitTag { name: string; at: string; message?: string; tagger?: TerminalGitIdent; time?: string }
export interface TerminalGitRemote { url: string; branches: Record<string, string>; /** Default main, else the first branch. */ head?: string; tags?: TerminalGitTag[] }
export interface TerminalGitRepo {
  /** The worktree (absolute); its folders are created for the user when the lesson does not list them. */
  path: string;
  /** A remote's URL: origin (remote.origin.*), its branches as origin/* unless tracking says otherwise, origin/HEAD. */
  origin?: string;
  /** Local branches → commit labels (default with an origin: its head branch). */
  branches?: Record<string, string>;
  /** The branch HEAD is on (default main, else the first branch), or a commit label for a detached HEAD. */
  head?: string;
  /** Remote-tracking branches origin/<name> → labels (what the clone last fetched; default the remote's branches now). */
  tracking?: Record<string, string>;
  /** Local branches that track origin/<same name> (default: the head branch, when origin has it). */
  upstream?: string[];
  /** Default with an origin: the remote's tags whose commits the repository has. */
  tags?: TerminalGitTag[];
  /** Changes already in the index (git add): path → content or null; the worktree has them too unless the machine lists the file. */
  staged?: Record<string, string | null>;
  /** The repository's own configuration (key → value), e.g. { 'pull.rebase': 'false' }. */
  config?: Record<string, string>;
}
export interface TerminalGit {
  commits?: TerminalGitCommit[];
  remotes?: TerminalGitRemote[];
  repos?: TerminalGitRepo[];
  /** user.name and user.email in ~/.gitconfig (unless the machine lists that file). */
  user?: TerminalGitIdent;
}

export const GIT_LIMITS = { commits: 60, remotes: 4, repos: 4, message: 2000, files: 40 } as const;
const DEFAULT_AUTHOR: TerminalGitIdent = { name: 'Logic Island', email: 'island@github.example' };
const LABEL = /^[A-Za-z0-9_.-]{1,40}$/;
const IDENT_TEXT = /^[^<>\n]{1,80}$/;
const EMAIL = /^[^<>\s@]{1,64}@[^<>\s@]{1,128}$/;
const homeOf = (m: TerminalMachine) => m.home ?? (m.user === 'root' ? '/root' : `/home/${m.user}`);
const normalized = (p: string) => p.startsWith('/') && resolvePath({ cwd: '/', home: '/' }, p) === p;
const relPath = (p: string) => typeof p === 'string' && /^[^/]/.test(p) && !p.endsWith('/') && p.split('/').every(s => s && s !== '.' && s !== '..' && s !== '.git' && s.length <= LIMITS.nameLength) && p.split('/').length <= 8;

/** The files of every labelled commit (path → content and executable bit), in list order. */
function snapshots(git: TerminalGit): Map<string, Map<string, { content: string; exec: boolean }>> {
  const out = new Map<string, Map<string, { content: string; exec: boolean }>>();
  (git.commits ?? []).forEach((c, i) => {
    const parents = c.parents ?? (i ? [git.commits![i - 1].id] : []);
    const files = new Map(parents.length ? out.get(parents[0]) ?? [] : []);
    for (const [p, v] of Object.entries(c.files ?? {})) { if (v === null) files.delete(p); else files.set(p, { content: v, exec: (c.executable ?? []).includes(p) }); }
    out.set(c.id, files);
  });
  return out;
}

/** E25: adds each repository's worktree (HEAD's files and staged changes, as the user's files), its .git folder and ~/.gitconfig. */
export function expandGit(m: TerminalMachine, git: boolean, add: { file(f: TerminalFile): void }): void {
  if (!git || !m.git || gitProblems(m, git).length) return;
  const home = homeOf(m), snaps = snapshots(m.git);
  const ownerOf = (p: string) => isInside(p, home) ? m.user : 'root';
  const dirs = (p: string) => { const parts = p.split('/').filter(Boolean); for (let k = 1; k <= parts.length; k++) { const d = `/${parts.slice(0, k).join('/')}`; add.file({ path: d, kind: 'dir', mode: 0o755, owner: ownerOf(d) }); } };
  if (m.git.user) { dirs(home); add.file({ path: `${home === '/' ? '' : home}/.gitconfig`, kind: 'file', mode: 0o644, owner: m.user, content: editConfig(editConfig('', 'user.name', m.git.user.name), 'user.email', m.git.user.email) }); }
  for (const r of m.git.repos ?? []) {
    dirs(r.path);
    add.file({ path: `${r.path}/.git`, kind: 'dir', mode: 0o755, owner: ownerOf(r.path) });
    const files = new Map(snaps.get(headLabel(m.git, r) ?? '') ?? []);
    for (const [p, v] of Object.entries(r.staged ?? {})) { if (v === null) files.delete(p); else files.set(p, { content: v, exec: false }); }
    for (const [p, f] of files) {
      const parts = p.split('/');
      for (let k = 1; k < parts.length; k++) add.file({ path: `${r.path}/${parts.slice(0, k).join('/')}`, kind: 'dir', mode: 0o755, owner: m.user });
      add.file({ path: `${r.path}/${p}`, kind: 'file', mode: f.exec ? 0o755 : 0o644, owner: m.user, content: f.content });
    }
  }
}
/** The label of the commit HEAD names (undefined: an unborn branch). */
function headLabel(git: TerminalGit, r: TerminalGitRepo): string | undefined {
  const branches = repoBranches(git, r), head = r.head ?? defaultBranch(branches);
  return head === undefined ? undefined : branches[head] ?? ((git.commits ?? []).some(c => c.id === head) ? head : undefined);
}
const defaultBranch = (branches: Record<string, string>) => 'main' in branches ? 'main' : Object.keys(branches)[0];
function repoBranches(git: TerminalGit, r: TerminalGitRepo): Record<string, string> {
  if (r.branches) return r.branches;
  const remote = (git.remotes ?? []).find(x => x.url === r.origin);
  if (!remote) return {};
  const head = remote.head ?? defaultBranch(remote.branches);
  return head && remote.branches[head] ? { [head]: remote.branches[head] } : {};
}

/** E25: Git's state of the (expanded) machine: objects with their real IDs, the repositories and the forge. */
export function gitState(m: TerminalMachine, state: FsState, git: boolean): FsState {
  // Invalid data builds no Git state (machineProblems reports it).
  if (!git || !m.git || gitProblems(m, git).length) return state;
  const zone = zoneNamed(m.timezone) ?? UTC_ZONE, store = new Store(new Map()), ids = new Map<string, Sha>();
  const tzAt = (t: number) => offsetText(offsetAt(zone, t).offset);
  const commits = m.git.commits ?? [], user = m.git.user ?? DEFAULT_AUTHOR;
  commits.forEach((c, i) => {
    const parents = (c.parents ?? (i ? [commits[i - 1].id] : [])).map(p => ids.get(p)!);
    const files = new Map<string, Entry>(parents.length ? readTree(store, store.commit(parents[0]).tree) : []);
    for (const [p, v] of Object.entries(c.files ?? {})) { if (v === null) files.delete(p); else files.set(p, { id: store.blob(v), mode: ((c.executable ?? []).includes(p) ? '100755' : '100644') as FileMode }); }
    const time = parseTime(c.time) ?? 0, author = { ...c.author ?? user, time, tz: c.tz ?? tzAt(time) };
    const ctime = c.committer?.time !== undefined ? parseTime(c.committer.time) ?? time : time;
    const committer = c.committer ? { name: c.committer.name, email: c.committer.email, time: ctime, tz: c.tz ?? tzAt(ctime) } : author;
    ids.set(c.id, store.put({ type: 'commit', tree: writeTree(store, files), parents, author, committer, message: c.message.endsWith('\n') ? c.message : `${c.message}\n` }));
  });
  const tagRef = (t: TerminalGitTag): Sha => {
    const at = ids.get(t.at)!;
    if (t.message === undefined) return at;
    const commit = store.commit(at), time = t.time !== undefined ? parseTime(t.time) ?? commit.author.time : commit.author.time;
    return store.put({ type: 'tag', object: at, objectType: 'commit', tag: t.name, tagger: { ...t.tagger ?? { name: commit.author.name, email: commit.author.email }, time, tz: tzAt(time) }, message: t.message.endsWith('\n') ? t.message : `${t.message}\n` });
  };
  const known = (tips: Iterable<Sha>) => { const k = new Set<Sha>(); for (const id of tips) { if (store.get(id)?.type === 'tag') k.add(id); } for (const id of reachable(store, [...tips].map(id => { const o = store.get(id); return o?.type === 'tag' ? o.object : id; }))) k.add(id); return k; };
  const forge: ForgeRepo[] = (m.git.remotes ?? []).map(f => {
    const refs = new Map<string, Sha>([...Object.entries(f.branches).map(([b, l]) => [`refs/heads/${b}`, ids.get(l)!] as [string, Sha]), ...(f.tags ?? []).map(t => [`refs/tags/${t.name}`, tagRef(t)] as [string, Sha])]);
    return { url: f.url, head: `refs/heads/${f.head ?? defaultBranch(f.branches) ?? 'main'}`, refs, known: known(refs.values()) };
  });
  const repos: GitRepo[] = (m.git.repos ?? []).map(r => {
    const remote = (m.git!.remotes ?? []).find(x => x.url === r.origin), branches = repoBranches(m.git!, r);
    const refs = new Map<string, Sha>(Object.entries(branches).map(([b, l]) => [`refs/heads/${b}`, ids.get(l)!]));
    const config = new Map<string, string>(INIT_CONFIG);
    const symrefs = new Map<string, string>();
    if (remote) {
      config.set('remote.origin.url', remote.url); config.set('remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*');
      for (const [b, l] of Object.entries(r.tracking ?? remote.branches)) refs.set(`refs/remotes/origin/${b}`, ids.get(l)!);
      symrefs.set('refs/remotes/origin/HEAD', `refs/remotes/origin/${remote.head ?? defaultBranch(remote.branches)}`);
    }
    const head = r.head ?? defaultBranch(branches) ?? 'main', detached = !(head in branches) && ids.has(head);
    for (const b of r.upstream ?? (remote && !detached && refs.has(`refs/remotes/origin/${head}`) ? [head] : [])) { config.set(`branch.${b}.remote`, 'origin'); config.set(`branch.${b}.merge`, `refs/heads/${b}`); }
    for (const [k, v] of Object.entries(r.config ?? {})) config.set(canonicalKey(k), v);
    const have = known(refs.values());
    for (const t of r.tags ?? (remote?.tags ?? []).filter(t => have.has(ids.get(t.at)!))) refs.set(`refs/tags/${t.name}`, tagRef(t));
    const headId = detached ? ids.get(head)! : refs.get(`refs/heads/${head}`);
    const index = new Map<string, Entry>(headId ? readTree(store, store.commit(headId).tree) : []);
    for (const [p, v] of Object.entries(r.staged ?? {})) { if (v === null) index.delete(p); else index.set(p, { id: store.blob(v), mode: '100644' }); }
    return { path: r.path, head: detached ? headId! : `refs/heads/${head}`, refs, symrefs, index, unmerged: new Map(), config, known: known(refs.values()), stash: [] };
  });
  return { ...state, git: { objects: store.all(), repos, forge, labels: ids } };
}

/** E25: the problems of a machine's git data (it needs the git profile; labels, paths, names and URLs must be valid). */
export function gitProblems(m: TerminalMachine, git: boolean): string[] {
  const g = m.git;
  if (g === undefined) return [];
  if (!git) return ['git needs the git profile (engine stage E25)'];
  const problems: string[] = [], fail = (what: string) => problems.push(what);
  const commits = g.commits ?? [], remotes = g.remotes ?? [], repos = g.repos ?? [];
  if (commits.length > GIT_LIMITS.commits || remotes.length > GIT_LIMITS.remotes || repos.length > GIT_LIMITS.repos) fail(`git: at most ${GIT_LIMITS.commits} commits, ${GIT_LIMITS.remotes} remotes and ${GIT_LIMITS.repos} repos`);
  const ident = (who: TerminalGitIdent | undefined, at: string) => { if (who !== undefined && (!IDENT_TEXT.test(who.name ?? '') || who.name.trim() !== who.name || !EMAIL.test(who.email ?? ''))) fail(`${at}: needs a name and an email like mei@example.com`); };
  ident(g.user, 'git user');
  const labels = new Set<string>(), snaps = snapshots(g);
  commits.forEach((c, i) => {
    const at = `git commit ${c.id}`;
    if (!LABEL.test(c.id ?? '') || labels.has(c.id)) fail(`${at}: needs a unique label of letters, digits, . _ -`);
    for (const p of c.parents ?? (i ? [commits[i - 1].id] : [])) if (!labels.has(p)) fail(`${at}: parent ${p} is not a commit listed before it`);
    if ((c.parents?.length ?? 0) > 2) fail(`${at}: at most two parents`);
    labels.add(c.id);
    if (typeof c.message !== 'string' || !c.message.trim() || c.message.length > GIT_LIMITS.message) fail(`${at}: needs a message of 1..${GIT_LIMITS.message} characters`);
    if (parseTime(c.time ?? '') === undefined) fail(`${at}: needs a time YYYY-MM-DD HH:MM:SS (UTC)`);
    if (c.tz !== undefined && !/^[+-](0\d|1[0-4])[0-5]\d$/.test(c.tz)) fail(`${at}: tz must look like +0800`);
    if (c.committer?.time !== undefined && parseTime(c.committer.time) === undefined) fail(`${at}: the committer's time must be YYYY-MM-DD HH:MM:SS`);
    ident(c.author, at); ident(c.committer, at);
    const entries = Object.entries(c.files ?? {});
    if (entries.length > GIT_LIMITS.files) fail(`${at}: at most ${GIT_LIMITS.files} files`);
    for (const [p, v] of entries) {
      if (!relPath(p)) fail(`${at}: file ${p} must be a relative, normalized path without .git`);
      if (v !== null && (typeof v !== 'string' || v.length > LIMITS.fileLength)) fail(`${at}: file ${p} needs content of at most ${LIMITS.fileLength} characters (or null to delete it)`);
    }
    for (const p of c.executable ?? []) if (typeof c.files?.[p] !== 'string') fail(`${at}: executable ${p} is not a file it writes`);
    const paths = [...snaps.get(c.id)?.keys() ?? []];
    for (const p of paths) if (paths.some(q => q.startsWith(`${p}/`))) fail(`${at}: ${p} is both a file and a folder`);
  });
  const commit = (l: string, at: string) => { if (!labels.has(l)) fail(`${at}: ${l} is not a commit label`); };
  const tags = (list: TerminalGitTag[] | undefined, at: string) => {
    const seen = new Set<string>();
    for (const t of list ?? []) {
      if (!validRefName(t.name ?? '') || seen.has(t.name)) fail(`${at}: tag ${t.name} needs a unique valid name`);
      seen.add(t.name); commit(t.at, `${at} tag ${t.name}`); ident(t.tagger, `${at} tag ${t.name}`);
      if (t.message !== undefined && (!t.message.trim() || t.message.length > GIT_LIMITS.message)) fail(`${at} tag ${t.name}: the message needs 1..${GIT_LIMITS.message} characters`);
      if (t.time !== undefined && parseTime(t.time) === undefined) fail(`${at} tag ${t.name}: time must be YYYY-MM-DD HH:MM:SS`);
    }
  };
  const branchMap = (b: Record<string, string> | undefined, at: string) => { for (const [n, l] of Object.entries(b ?? {})) { if (!validRefName(n) || n === 'HEAD') fail(`${at}: invalid branch name ${n}`); commit(l, `${at} branch ${n}`); } };
  const urls = new Set<string>();
  for (const f of remotes) {
    const at = `git remote ${f.url}`;
    if (!FORGE_URL.test(f.url ?? '') || urls.has(f.url)) fail(`${at}: needs a unique URL https://github.example/<owner>/<repo>.git`);
    urls.add(f.url);
    branchMap(f.branches, at);
    if (f.head !== undefined && !(f.head in (f.branches ?? {}))) fail(`${at}: head ${f.head} is not one of its branches`);
    tags(f.tags, at);
  }
  const paths: string[] = [];
  for (const r of repos) {
    const at = `git repo ${r.path}`;
    if (typeof r.path !== 'string' || !normalized(r.path) || r.path === '/' || paths.some(p => isInside(r.path, p) || isInside(p, r.path))) fail(`${at}: needs an absolute, normalized path (not /, not inside another repo)`);
    paths.push(r.path);
    if (r.origin !== undefined && !urls.has(r.origin)) fail(`${at}: origin ${r.origin} is not one of git.remotes`);
    branchMap(r.branches, at);
    for (const [b, l] of Object.entries(r.tracking ?? {})) { if (!validRefName(b)) fail(`${at}: invalid tracking branch ${b}`); commit(l, `${at} tracking ${b}`); }
    if (r.tracking !== undefined && r.origin === undefined) fail(`${at}: tracking needs an origin`);
    const branches = repoBranches(g, r);
    if (r.head !== undefined && !(r.head in branches) && !labels.has(r.head) && Object.keys(branches).length) fail(`${at}: head ${r.head} is neither a branch nor a commit label`);
    for (const b of r.upstream ?? []) if (!(b in branches) || r.origin === undefined) fail(`${at}: upstream ${b} needs a local branch and an origin`);
    tags(r.tags, at);
    for (const [p, v] of Object.entries(r.staged ?? {})) if (!relPath(p) || (v !== null && (typeof v !== 'string' || v.length > LIMITS.fileLength))) fail(`${at}: staged ${p} needs a relative path and content (or null)`);
    for (const [k, v] of Object.entries(r.config ?? {})) if (!/^[A-Za-z0-9-]+(\.[^\n]+)?\.[A-Za-z][A-Za-z0-9-]*$/.test(k) || typeof v !== 'string' || v.includes('\n') || v.length > 200) fail(`${at}: config ${k} needs a key section.name and a one-line value`);
  }
  return problems;
}
