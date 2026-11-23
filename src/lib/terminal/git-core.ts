import { isInside, resolvePath, type FsNode, type FsState } from './fs';
import { clockOf } from './processes';
import { offsetAt, offsetText, zoneOf } from './calendar';
import { objectId, readTree, Store, type CommitObject, type Entry, type Ident, type Sha } from './git';
import type { GitOp, Unmerged } from './git-state';
import type { ForgeSite } from './forge-state';

/*
 * Engine stage E25 (docs/curriculum/CICD0_E25_GIT.md): what every git command shares — the machine being changed, the
 * repository the working directory is in, its worktree (the machine's own files), refs and revisions, configuration and
 * identity. The commands are in git-cli*.ts, the formats they share in git-format.ts.
 */

export interface GitIo { out(line: string): void; err(line: string): void; user: string; tty?: boolean }
/** A repository while a command changes it (GitRepo with mutable collections). */
export interface Repo {
  path: string; head: string; refs: Map<string, Sha>; symrefs: Map<string, string>; index: Map<string, Entry>; unmerged: Map<string, Unmerged>;
  config: Map<string, string>; known: Set<Sha>; op?: GitOp; origHead?: Sha; previous?: string; detached?: { name: string; at: Sha }; stash: Sha[];
}
export interface Forge { url: string; head: string; refs: Map<string, Sha>; known: Set<Sha>; site?: ForgeSite }

const blobIds = new Map<string, Sha>();
/** A blob's ID without storing it (what git hash-object prints), cached by content. */
export function blobId(data: string): Sha {
  let id = blobIds.get(data);
  if (id) return id;
  if (blobIds.size > 4000) blobIds.clear();
  id = objectId({ type: 'blob', data });
  blobIds.set(data, id);
  return id;
}
/** refs/heads/main → main, refs/remotes/origin/main → origin/main, refs/tags/v1 → v1. */
export const shortRef = (ref: string) => ref.replace(/^refs\/(heads|tags|remotes)\//, '');
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** git check-ref-format's rules for a branch or tag name (the parts lessons and learners use). */
export function validRefName(name: string): boolean {
  if (!name || name.length > 100 || name === '@' || name.startsWith('-') || name.startsWith('/') || name.endsWith('/') || name.endsWith('.') || name.endsWith('.lock')) return false;
  if (/[\x00-\x20~^:?*[\\\x7f]|\.\.|@\{|\/\/|\/\.|^\./.test(name)) return false;
  return true;
}

export class Git {
  readonly nodes: Map<string, FsNode>;
  readonly store: Store;
  readonly repos: Repo[];
  readonly forge: Forge[];
  cwd: string;
  readonly now: number;
  readonly tz: string;
  constructor(readonly state: FsState, readonly io: GitIo) {
    this.nodes = new Map(state.nodes);
    const g = state.git;
    this.store = new Store(g?.objects ?? new Map());
    this.repos = (g?.repos ?? []).map(r => ({ ...r, refs: new Map(r.refs), symrefs: new Map(r.symrefs), index: new Map(r.index), unmerged: new Map(r.unmerged), config: new Map(r.config), known: new Set(r.known), stash: [...r.stash] }));
    this.forge = (g?.forge ?? []).map(f => ({ ...f, refs: new Map(f.refs), known: new Set(f.known) }));
    this.cwd = state.cwd;
    this.now = clockOf(state).now;
    this.tz = offsetText(offsetAt(zoneOf(state), this.now).offset);
  }
  out(...lines: string[]) { lines.forEach(l => this.io.out(l)); }
  err(...lines: string[]) { lines.forEach(l => this.io.err(l)); }
  /** The machine after the command; a repository whose .git folder is gone is forgotten. */
  result(): FsState {
    const repos = this.repos.filter(r => this.hasGitDir(r.path));
    const objects = this.store.added.size ? this.store.all() : this.state.git?.objects ?? new Map();
    return { ...this.state, nodes: this.nodes, git: { objects, repos, forge: this.forge, ...this.state.git?.labels ? { labels: this.state.git.labels } : {}, ...this.state.git?.account ? { account: this.state.git.account } : {} } };
  }

  // ------------------------------------------------------------------------------------------- paths and the worktree
  abs(path: string): string { return resolvePath({ cwd: this.cwd, home: this.state.home }, path); }
  hasGitDir(path: string): boolean { return this.nodes.get(`${path === '/' ? '' : path}/.git`)?.kind === 'dir'; }
  /** The repository the working directory is in (the innermost), if any. */
  find(at = this.cwd): Repo | undefined {
    return this.repos.filter(r => isInside(at, r.path) && this.hasGitDir(r.path)).sort((a, b) => b.path.length - a.path.length)[0];
  }
  /** The repository, or git's error (status 128) when the working directory is not in one. */
  repo(): Repo | undefined {
    const r = this.find();
    if (!r) this.err('fatal: not a git repository (or any of the parent directories): .git');
    return r;
  }
  /** A machine path as a path of the repository ('' is its top), or undefined outside it. */
  rel(r: Repo, abs: string): string | undefined { return abs === r.path ? '' : isInside(abs, r.path) && r.path !== abs ? abs.slice(r.path === '/' ? 1 : r.path.length + 1) : undefined; }
  full(r: Repo, rel: string): string { return rel ? `${r.path === '/' ? '' : r.path}/${rel}` : r.path; }
  /** A repository path as git prints it: relative to the working directory. */
  shown(r: Repo, rel: string): string {
    const to = this.full(r, rel).split('/').filter(Boolean), from = this.cwd.split('/').filter(Boolean);
    let k = 0;
    while (k < to.length && k < from.length && to[k] === from[k]) k++;
    const out = [...Array<string>(from.length - k).fill('..'), ...to.slice(k)].join('/');
    return out || '.';
  }
  /** Folders inside the repository that are other repositories (git leaves them alone). */
  private nested(r: Repo): string[] {
    return [...this.nodes.keys()].filter(p => p.endsWith('/.git') && p !== `${this.full(r, '')}/.git`.replace('//', '/') && isInside(p, r.path)).map(p => p.slice(0, -5));
  }
  /** The worktree's files (path → blob and mode); folders are not tracked, .git and nested repositories are skipped. */
  worktree(r: Repo): Map<string, Entry> {
    const out = new Map<string, Entry>(), nested = this.nested(r);
    for (const [p, n] of this.nodes) {
      if (n.kind === 'dir') continue;
      const rel = this.rel(r, p);
      if (!rel || rel === '.git' || rel.startsWith('.git/') || nested.some(d => isInside(p, d))) continue;
      out.set(rel, n.kind === 'link' ? { id: blobId(n.target ?? ''), mode: '120000' } : { id: blobId(n.content ?? ''), mode: n.mode & 0o100 ? '100755' : '100644' });
    }
    return out;
  }
  /** A worktree file's text (a link's target). */
  text(r: Repo, rel: string): string | undefined { const n = this.nodes.get(this.full(r, rel)); return n?.kind === 'file' ? n.content ?? '' : n?.kind === 'link' ? n.target ?? '' : undefined; }
  /** Stores a worktree file as a blob (git add). */
  stage(r: Repo, rel: string): Entry | undefined {
    const n = this.nodes.get(this.full(r, rel));
    if (!n || n.kind === 'dir') return undefined;
    return n.kind === 'link' ? { id: this.store.blob(n.target ?? ''), mode: '120000' } : { id: this.store.blob(n.content ?? ''), mode: n.mode & 0o100 ? '100755' : '100644' };
  }
  /** Writes a blob to the worktree as a new file of the user (its folders too); a link entry becomes a symbolic link. */
  write(r: Repo, rel: string, e: Entry) {
    const umask = this.state.umask ?? 0o022, owner = this.state.user, path = this.full(r, rel);
    const parts = rel.split('/');
    for (let k = 1; k < parts.length; k++) {
      const dir = this.full(r, parts.slice(0, k).join('/')), n = this.nodes.get(dir);
      if (n?.kind !== 'dir') this.nodes.set(dir, { kind: 'dir', mode: 0o777 & ~umask, owner });
    }
    for (const p of [...this.nodes.keys()]) if (isInside(p, path) && p !== path) this.nodes.delete(p);
    const data = this.store.blobText(e.id);
    this.nodes.set(path, e.mode === '120000' ? { kind: 'link', mode: 0o777, owner, target: data } : { kind: 'file', mode: (e.mode === '100755' ? 0o777 : 0o666) & ~umask, owner, content: data });
  }
  /** Removes a worktree file and the folders it leaves empty. */
  remove(r: Repo, rel: string) {
    let path = this.full(r, rel);
    this.nodes.delete(path);
    for (path = path.slice(0, path.lastIndexOf('/')); path.length > r.path.length && ![...this.nodes.keys()].some(p => p.startsWith(`${path}/`)); path = path.slice(0, path.lastIndexOf('/'))) this.nodes.delete(path);
  }

  // ---------------------------------------------------------------------------------------------------- refs and revisions
  attached(r: Repo): boolean { return r.head.startsWith('refs/'); }
  branch(r: Repo): string | undefined { return this.attached(r) ? r.head.slice('refs/heads/'.length) : undefined; }
  head(r: Repo): Sha | undefined { return this.attached(r) ? r.refs.get(r.head) : r.head; }
  /** Moves the current branch (or the detached HEAD) to a commit. */
  setHead(r: Repo, id: Sha) { if (this.attached(r)) r.refs.set(r.head, id); else r.head = id; }
  files(commit: Sha | undefined): Map<string, Entry> { return commit ? readTree(this.store, this.store.commit(commit).tree) : new Map(); }
  commit(id: Sha): CommitObject { return this.store.commit(id); }
  refValue(r: Repo, full: string): Sha | undefined { return r.refs.get(full) ?? (r.symrefs.has(full) ? r.refs.get(r.symrefs.get(full)!) : undefined); }
  /** The full name a short ref name means, in git's order (refs/, tags, heads, remotes, a remote's HEAD). */
  dwim(r: Repo, name: string): string | undefined {
    if (name === 'HEAD') return undefined;
    return [name, `refs/${name}`, `refs/tags/${name}`, `refs/heads/${name}`, `refs/remotes/${name}`, `refs/remotes/${name}/HEAD`].find(f => f.startsWith('refs/') && this.refValue(r, f) !== undefined);
  }
  peel(id: Sha | undefined): Sha | undefined {
    for (let o = id ? this.store.get(id) : undefined; o?.type === 'tag'; o = this.store.get(id!)) id = o.object;
    return id;
  }
  /** The upstream of a branch (branch.<name>.remote and .merge) as a remote-tracking ref, if configured. */
  upstream(r: Repo, branch: string | undefined): string | undefined {
    if (!branch) return undefined;
    const remote = r.config.get(`branch.${branch}.remote`), merge = r.config.get(`branch.${branch}.merge`);
    if (!remote || !merge?.startsWith('refs/heads/')) return undefined;
    return remote === '.' ? merge : `refs/remotes/${remote}/${merge.slice('refs/heads/'.length)}`;
  }
  /** A revision (the subset of gitrevisions: names, IDs, HEAD, ORIG_HEAD, MERGE_HEAD, @{u}, ~N, ^N) as an object ID (tags not peeled). */
  rev(r: Repo, spec: string): Sha | undefined {
    const m = /^(.*?)((?:[~^]\d*)*)$/.exec(spec);
    if (!m) return undefined;
    let base = m[1];
    let id: Sha | undefined;
    const up = /^(.*)@\{(u|upstream)\}$/.exec(base);
    if (up) { const ref = this.upstream(r, up[1] && up[1] !== 'HEAD' && up[1] !== '@' ? up[1] : this.branch(r)); id = ref ? r.refs.get(ref) : undefined; }
    else {
      if (base === '@' || base === '') base = 'HEAD';
      if (base === 'HEAD') id = this.head(r);
      else if (base === 'ORIG_HEAD') id = r.origHead;
      else if (base === 'MERGE_HEAD') id = r.op?.kind === 'merge' ? r.op.head : undefined;
      else {
        const full = this.dwim(r, base);
        if (full) id = this.refValue(r, full);
        else if (/^[0-9a-f]{4,40}$/.test(base)) {
          const hits = [...r.known].filter(x => x.startsWith(base));
          id = hits.length === 1 ? hits[0] : undefined;
        }
      }
    }
    for (const step of m[2].match(/[~^]\d*/g) ?? []) {
      id = this.peel(id);
      if (!id) return undefined;
      const n = step.length > 1 ? Number(step.slice(1)) : 1;
      if (step[0] === '^') { if (n === 0) continue; id = this.commit(id).parents[n - 1]; }
      else for (let k = 0; k < n && id; k++) id = this.commit(id).parents[0];
    }
    return id;
  }
  /** git's error for a revision that does not resolve (no upstream for @{u}, else an unknown revision). */
  badRev(r: Repo, spec: string): string {
    const up = /^(.*)@\{(u|upstream)\}/.exec(spec);
    if (up) { const b = !up[1] || up[1] === 'HEAD' || up[1] === '@' ? this.branch(r) : up[1]; if (b && !this.upstream(r, b)) return `fatal: no upstream configured for branch '${b}'`; }
    return `fatal: ambiguous argument '${spec}': unknown revision or path not in the working tree.`;
  }
  /** A revision that must name a commit (tags peeled). */
  commitOf(r: Repo, spec: string): Sha | undefined { const id = this.peel(this.rev(r, spec)); return id && this.store.get(id)?.type === 'commit' ? id : undefined; }
  /** The shortest unique prefix of an ID, at least 7 characters (core.abbrev's default for small repositories). */
  abbrev(id: Sha, min = 7): string {
    const ids = this.store.ids();
    let n = min;
    while (n < 40 && ids.some(x => x !== id && x.startsWith(id.slice(0, n)))) n++;
    return id.slice(0, n);
  }

  // -------------------------------------------------------------------------------------------- configuration and identity
  get globalPath() { return `${this.state.home === '/' ? '' : this.state.home}/.gitconfig`; }
  global(): [string, string][] { const n = this.nodes.get(this.globalPath); return n?.kind === 'file' ? parseConfig(n.content ?? '') : []; }
  /** A configuration value: the repository's own wins over ~/.gitconfig. */
  config(r: Repo | undefined, key: string): string | undefined {
    const k = canonicalKey(key);
    return r?.config.get(k) ?? this.global().filter(([x]) => x === k).at(-1)?.[1];
  }
  setGlobal(key: string, value: string | undefined) {
    const n = this.nodes.get(this.globalPath);
    const text = editConfig(n?.kind === 'file' ? n.content ?? '' : '', canonicalKey(key), value);
    this.nodes.set(this.globalPath, n?.kind === 'file' ? { ...n, content: text } : { kind: 'file', mode: 0o666 & ~(this.state.umask ?? 0o022), owner: this.state.user, content: text });
  }
  /** user.name and user.email as an identity at the machine's time, or git's error when one is missing. */
  ident(r: Repo, who: 'Author' | 'Committer' = 'Author'): Ident | undefined {
    const name = this.config(r, 'user.name'), email = this.config(r, 'user.email');
    if (name && email) return { name, email, time: this.now, tz: this.tz };
    this.err(`${who} identity unknown`);
    if (!email) this.err(`fatal: unable to auto-detect email address (got '${this.state.user}@${this.state.host ?? 'logic-island'}.(none)')`);
    else this.err(`fatal: empty ident name (for <${email}>) not allowed`);
    return undefined;
  }
  /** Writes a commit (author: kept when replaying one) and makes it known to the repository. */
  makeCommit(r: Repo, tree: Sha, parents: readonly Sha[], message: string, author?: Ident): Sha | undefined {
    const me = this.ident(r, author ? 'Committer' : 'Author');
    if (!me) return undefined;
    const id = this.store.put({ type: 'commit', tree, parents, author: author ?? me, committer: me, message });
    r.known.add(id);
    return id;
  }
  /** Marks every commit and tag reachable from these IDs as known to the repository. */
  learn(known: Set<Sha>, tips: Iterable<Sha>) {
    const stack = [...tips];
    while (stack.length) {
      const id = stack.pop()!, o = this.store.get(id);
      if (!o || known.has(id)) continue;
      if (o.type === 'tag') { known.add(id); stack.push(o.object); }
      else if (o.type === 'commit') { known.add(id); stack.push(...o.parents); }
    }
  }
}

// ------------------------------------------------------------------------------------------------- config files
/** section.subsection.name with the section and name in lower case (the subsection as written). */
export function canonicalKey(key: string): string {
  const first = key.indexOf('.'), last = key.lastIndexOf('.');
  if (first < 0) return key.toLowerCase();
  return first === last ? key.toLowerCase() : `${key.slice(0, first).toLowerCase()}${key.slice(first, last)}.${key.slice(last + 1).toLowerCase()}`;
}
function unquote(raw: string): string {
  let out = '', quoted = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '"') { quoted = !quoted; continue; }
    if (!quoted && (c === '#' || c === ';')) break;
    if (c === '\\' && i + 1 < raw.length) { const n = raw[++i]; out += n === 'n' ? '\n' : n === 't' ? '\t' : n; continue; }
    out += c;
  }
  return quoted ? out : out.replace(/\s+$/, '');
}
/** The key/value pairs of a git config file, in order (a key without = is true). */
export function parseConfig(text: string): [string, string][] {
  const out: [string, string][] = [];
  let section = '';
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    const head = /^\[\s*([A-Za-z0-9.-]+)(?:\s+"((?:[^"\\]|\\.)*)")?\s*\]/.exec(line);
    if (head) { section = head[2] !== undefined ? `${head[1].toLowerCase()}.${head[2].replace(/\\(.)/g, '$1')}` : head[1].toLowerCase(); continue; }
    const kv = /^([A-Za-z][A-Za-z0-9-]*)\s*(?:=\s*(.*))?$/.exec(line);
    if (kv && section) out.push([`${section}.${kv[1].toLowerCase()}`, kv[2] === undefined ? 'true' : unquote(kv[2])]);
  }
  return out;
}
const quoteValue = (v: string) => /^\s|\s$|[#;"\\\n\t]/.test(v) ? `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t')}"` : v;
/** Sets (or, with undefined, removes) a key in a config file the way git config writes it (a tab, name = value). */
export function editConfig(text: string, key: string, value: string | undefined): string {
  const last = key.lastIndexOf('.'), sect = key.slice(0, last), name = key.slice(last + 1);
  const lines = text ? text.replace(/\n$/, '').split('\n') : [];
  let section = '', lastOfSection = -1, at = -1;
  lines.forEach((raw, i) => {
    const line = raw.trim();
    const head = /^\[\s*([A-Za-z0-9.-]+)(?:\s+"((?:[^"\\]|\\.)*)")?\s*\]/.exec(line);
    if (head) { section = head[2] !== undefined ? `${head[1].toLowerCase()}.${head[2]}` : head[1].toLowerCase(); if (section === sect) lastOfSection = i; return; }
    if (section !== sect) return;
    lastOfSection = i;
    const kv = /^([A-Za-z][A-Za-z0-9-]*)\s*(=|$)/.exec(line);
    if (kv && kv[1].toLowerCase() === name) at = i;
  });
  const entry = `\t${name} = ${quoteValue(value ?? '')}`;
  if (value === undefined) { if (at >= 0) lines.splice(at, 1); }
  else if (at >= 0) lines[at] = entry;
  else if (lastOfSection >= 0) lines.splice(lastOfSection + 1, 0, entry);
  else { const dot = sect.indexOf('.'); lines.push(dot < 0 ? `[${sect}]` : `[${sect.slice(0, dot)} "${sect.slice(dot + 1)}"]`, entry); }
  return lines.length ? `${lines.join('\n')}\n` : '';
}
