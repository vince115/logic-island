import { isInside, parentOf, resolvePath, type Account, type FsNode, type FsState, type GroupEntry } from './fs';
import { clockOf } from './processes';
import { sha256 } from './ssh';
import { apt, type PackageDb, type PackageDef } from './packages';
import { runInput, type CommandName, type ShellProfile } from './shell';
import { matchName } from './glob';
import type { DockerImage, DockerState, HistoryRow, ImageRef } from './docker';
import type { Seconds } from './clock';

/*
 * Engine stage E21 (docs/curriculum/DKR0_CONTAINER_CAPABILITY.md §11): images — docker build with BuildKit (the default
 * builder of Docker CE 27.5.1) on the simulated daemon of E20. A Dockerfile of the learner's files is parsed (comments,
 * line continuations, the # syntax line, JSON and shell forms, variable substitution with ARG and ENV), and the target
 * stage runs: FROM takes a base image's file system (a lesson image, or an image built before), RUN runs its command line
 * in the simulation's own shell on the build container's files (apt-get with E5's package engine on the image's package
 * table, pip and npm with declared tables, useradd and the file commands), COPY and ADD copy files of the build context
 * (what .dockerignore does not exclude), WORKDIR makes its folder, and the other instructions change the image's config.
 * Every filesystem step makes a layer with a deterministic diff ID and size (the bytes of the files it added or changed;
 * a package's file weighs its declared size), and its cache key is its parent's key with the step's definition (for COPY
 * and ADD the checksums of the copied files): a key the daemon has seen is CACHED, and a change misses that step and
 * every later one. The progress is BuildKit's plain format (what a build prints when standard error is not a terminal).
 * Nothing is downloaded and no real program runs; what is not modelled is said, never faked.
 */

/** A package an image's package manager can install: what it weighs once installed, what it needs and the files it writes. */
export interface BuildPackage { name: string; version: string; size: number; depends?: readonly string[]; files?: readonly { path: string; content: string }[] }
/** The package tables of a base image (apt for Debian and Ubuntu; pip and npm when the image has Python or Node.js). */
export interface ImagePackages { apt?: readonly BuildPackage[]; pip?: readonly BuildPackage[]; npm?: readonly BuildPackage[]; /** Bytes apt-get update writes to /var/lib/apt/lists. */ aptLists?: number }
/** A file whose content is not kept as text (a package's payload): its bytes, while the node still has this content. */
export interface Weight { content: string; size: number }

const enc = (text: string) => new TextEncoder().encode(text);
export const hex = (text: string) => [...sha256(enc(text))].map(b => b.toString(16).padStart(2, '0')).join('');
const bytes = (text: string) => enc(text).length;
const short = (id: string) => id.slice(0, 12);

// ------------------------------------------------------------------------------------------------- the Dockerfile

export type Instruction = { keyword: string; args: string; line: number; end: number; flags: Record<string, string>; json?: string[] };
export type Parsed = { instructions: Instruction[] } | { error: string; line: number };
const KNOWN = ['FROM', 'RUN', 'CMD', 'LABEL', 'MAINTAINER', 'EXPOSE', 'ENV', 'ADD', 'COPY', 'ENTRYPOINT', 'VOLUME', 'USER', 'WORKDIR', 'ARG', 'ONBUILD', 'STOPSIGNAL', 'HEALTHCHECK', 'SHELL'];

/** A JSON array of strings (the exec form), or undefined (the shell form). */
function jsonArgs(text: string): string[] | undefined {
  if (!text.trim().startsWith('[')) return undefined;
  try { const v = JSON.parse(text) as unknown; return Array.isArray(v) && v.every(x => typeof x === 'string') ? v as string[] : undefined; } catch { return undefined; }
}

/** The Dockerfile's instructions: parser directives and comments dropped, continuations joined (the backslash and new line removed). */
export function parseDockerfile(text: string): Parsed {
  const lines = text.split('\n').map(l => l.replace(/\r$/, ''));
  const out: Instruction[] = [];
  let i = 0;
  // Parser directives (# syntax=…, # escape=…) are only at the top; the simulation ignores them.
  while (i < lines.length && /^\s*#\s*[a-zA-Z]+\s*=/.test(lines[i])) i++;
  for (; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim() || /^\s*#/.test(raw)) continue;
    const start = i + 1;
    let joined = raw;
    // A line ending in \ continues on the next one; comment lines inside are dropped.
    while (/\\\s*$/.test(joined) && i + 1 < lines.length) {
      joined = joined.replace(/\\\s*$/, '');
      i++;
      while (i < lines.length && /^\s*#/.test(lines[i])) i++;
      if (i < lines.length) joined += lines[i];
    }
    joined = joined.replace(/\\\s*$/, '');
    const m = /^\s*(\S+)\s*(.*)$/s.exec(joined)!;
    const keyword = m[1].toUpperCase();
    if (!KNOWN.includes(keyword)) return { error: `dockerfile parse error on line ${start}: unknown instruction: ${m[1]}`, line: start };
    let rest = m[2].trim();
    const flags: Record<string, string> = {};
    if (['FROM', 'RUN', 'COPY', 'ADD'].includes(keyword)) {
      for (let f = /^--([a-z-]+)(?:=(\S*))?\s*/.exec(rest); f; f = /^--([a-z-]+)(?:=(\S*))?\s*/.exec(rest)) { flags[f[1]] = f[2] ?? ''; rest = rest.slice(f[0].length); }
    }
    if (/^<</.test(rest)) return { error: `dockerfile parse error on line ${start}: 模擬環境不支援 here-document（${keyword} <<EOF）`, line: start };
    const ins: Instruction = { keyword, args: rest, line: start, end: i + 1, flags };
    const json = ['RUN', 'CMD', 'ENTRYPOINT', 'COPY', 'ADD', 'SHELL', 'VOLUME'].includes(keyword) ? jsonArgs(rest) : undefined;
    if (json) ins.json = json;
    out.push(ins);
  }
  return { instructions: out };
}

/** Dockerfile variable substitution: $VAR, ${VAR}, ${VAR:-word}, ${VAR:+word}; \$ is a literal $. */
export function substitute(text: string, vars: ReadonlyMap<string, string>): string {
  return text.replace(/\\\$|\$\{([A-Za-z_][A-Za-z0-9_]*)(?::([-+])([^}]*))?\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (all, braced: string | undefined, op: string | undefined, word: string | undefined, bare: string | undefined) => {
    if (all === '\\$') return '$';
    const name = braced ?? bare!, v = vars.get(name);
    if (op === '-') return v ? v : word ?? '';
    if (op === '+') return v ? word ?? '' : '';
    return v ?? '';
  });
}

/** KEY=value pairs (quotes allowed) of ENV, LABEL and ARG; legacy "ENV KEY value" when there is no =. */
function pairs(text: string): { pairs: [string, string][]; legacy: boolean } | null {
  const t = text.trim();
  const first = /^(\S+)/.exec(t)?.[1] ?? '';
  if (!first.includes('=')) {
    const sp = /^(\S+)\s+(.*)$/s.exec(t);
    return sp ? { pairs: [[sp[1], sp[2].trim()]], legacy: true } : first ? { pairs: [[first, '']], legacy: true } : null;
  }
  const out: [string, string][] = [];
  const re = /\s*([^\s=]+)=("(?:[^"\\]|\\.)*"|'[^']*'|(?:[^\s\\]|\\.)*)/gy;
  let m: RegExpExecArray | null, at = 0;
  while ((m = re.exec(t))) {
    let v = m[2];
    if (v.startsWith('"')) v = v.slice(1, -1).replace(/\\(.)/g, '$1');
    else if (v.startsWith("'")) v = v.slice(1, -1);
    else v = v.replace(/\\(.)/g, '$1');
    out.push([m[1], v]);
    at = re.lastIndex;
    if (at >= t.length) break;
  }
  return at < t.trim().length && out.length === 0 ? null : { pairs: out, legacy: false };
}

// ------------------------------------------------------------------------------------------------- .dockerignore

/** A .dockerignore pattern as a regular expression on a context path (Go's filepath.Match, ** for any folders). */
function ignoreRegExp(pattern: string): RegExp {
  const p = pattern.replace(/^\/+/, '').replace(/\/+$/, '').replace(/^\.\//, '');
  let re = '';
  for (let i = 0; i < p.length; i++) {
    const ch = p[i];
    if (ch === '*' && p[i + 1] === '*') { re += '.*'; i++; if (p[i + 1] === '/') i++; continue; }
    if (ch === '*') re += '[^/]*';
    else if (ch === '?') re += '[^/]';
    else if (ch === '\\' && i + 1 < p.length) re += `\\${p[++i]}`;
    else if (ch === '[') { const end = p.indexOf(']', i); if (end < 0) re += '\\['; else { re += `[${p.slice(i + 1, end).replace(/^!/, '^')}]`; i = end; } }
    else re += /[.+^${}()|]/.test(ch) ? `\\${ch}` : ch;
  }
  return new RegExp(`^${re}$`);
}
/** Whether a context path is excluded: the last pattern that matches it or one of its folders decides (! re-includes). */
export function ignoredBy(patterns: readonly string[], rel: string): boolean {
  let out = false;
  for (const raw of patterns) {
    const neg = raw.startsWith('!'), pat = neg ? raw.slice(1).trim() : raw;
    if (!pat) continue;
    const re = ignoreRegExp(pat);
    let p = rel, hit = false;
    for (;;) { if (re.test(p)) { hit = true; break; } const at = p.lastIndexOf('/'); if (at < 0) break; p = p.slice(0, at); }
    if (hit) out = !neg;
  }
  return out;
}
const ignorePatterns = (text: string) => text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));

// ------------------------------------------------------------------------------------------------- build state

/** A stage's file system and config while it is built. */
interface Stage {
  nodes: Map<string, FsNode>;
  weights: Map<string, Weight>;
  apt?: PackageDb;
  env: string[];
  workdir: string;
  user: string;
  cmd: string[];
  entrypoint: string[];
  expose: number[];
  labels: Record<string, string>;
  /** E22: VOLUME paths. */
  volumes: string[];
  history: HistoryRow[];
  rootfs: string[];
  chain: string[];
  layerSizes: number[];
  base: DockerImage | null;
}
/** What the daemon remembers of a step (the build cache): the file system after it and its layer. */
export interface CacheEntry { nodes: ReadonlyMap<string, FsNode>; weights: ReadonlyMap<string, Weight>; apt?: PackageDb; created: Seconds; size: number; diffId?: string }

export const BASE_DIRS = ['/bin', '/boot', '/dev', '/etc', '/home', '/lib', '/media', '/mnt', '/opt', '/proc', '/root', '/run', '/sbin', '/srv', '/sys', '/tmp', '/usr', '/usr/bin', '/usr/local', '/usr/share', '/var', '/var/log'];
/** An image's own file system (no /etc/hostname or /etc/hosts: Docker writes those into each container). */
export function imageFs(img: DockerImage): Map<string, FsNode> {
  if (img.nodes) return new Map(img.nodes);
  const nodes = new Map<string, FsNode>([['/', { kind: 'dir', mode: 0o755, owner: 'root' }]]);
  if (img.scratch) return nodes;
  const dir = (path: string) => { if (!nodes.has(path)) { if (path !== '/') dir(parentOf(path)); nodes.set(path, { kind: 'dir', mode: path === '/root' ? 0o700 : path === '/tmp' ? 0o777 : 0o755, owner: 'root' }); } };
  BASE_DIRS.forEach(dir);
  const file = (path: string, content: string) => { dir(parentOf(path)); nodes.set(path, { kind: 'file', mode: 0o644, owner: 'root', content }); };
  file('/etc/os-release', img.osRelease);
  for (const f of img.files) file(f.path, f.content);
  dir(img.workdir);
  return nodes;
}

/** The history docker history shows (oldest first): the lesson's, a built image's, or one row per layer and the config. */
export function historyOf(img: DockerImage): HistoryRow[] {
  if (img.history) return img.history;
  const rows: HistoryRow[] = [], n = img.layers, each = Math.floor(img.size / n);
  for (let k = 0; k < n; k++) rows.push({ created: img.created, createdBy: k === 0 ? 'ADD rootfs.tar.xz / # buildkit' : `（模擬：課程沒有宣告第 ${k + 1} 層的指令）`, size: k === 0 ? img.size - each * (n - 1) : each, empty: false, comment: 'buildkit.dockerfile.v0' });
  const meta = (createdBy: string) => rows.push({ created: img.created, createdBy, size: 0, empty: true, comment: 'buildkit.dockerfile.v0' });
  for (const e of img.env) meta(`ENV ${e}`);
  if (img.workdir !== '/') meta(`WORKDIR ${img.workdir}`);
  if (img.expose.length) meta(`EXPOSE map[${img.expose.map(p => `${p}/tcp:{}`).join(' ')}]`);
  if (img.entrypoint.length) meta(`ENTRYPOINT ${goList(img.entrypoint)}`);
  if (img.cmd.length) meta(`CMD ${goList(img.cmd)}`);
  return rows;
}
/** The diff IDs of an image's layers (E20's images: one per pulled layer). */
export const rootfsOf = (img: DockerImage): string[] => img.rootfs ?? Array.from({ length: img.layers }, (_, k) => hex(`layer/${img.repo}:${img.tag}/${k}`));
/**
 * The layers as the daemon stores them (chain IDs: a layer on another parent is another layer), which rmi deletes: E20's
 * images keep their own IDs; a built image's are its base's, then each new layer chained to the one below it.
 */
export const chainOf = (img: DockerImage): string[] => img.chain ?? rootfsOf(img);
const chained = (below: readonly string[], diffId: string) => below.length ? hex(`${below.at(-1)} ${diffId}`) : diffId;
/** Each layer's size, in rootfs order. */
export const layerSizesOf = (img: DockerImage): number[] => historyOf(img).filter(r => !r.empty).map(r => r.size);
/** Go's %q of a []string: ["nginx" "-g" "daemon off;"]. */
export const goList = (list: readonly string[]) => `[${list.map(goQuote).join(' ')}]`;
export const goQuote = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t')}"`;

// ------------------------------------------------------------------------------------------------- RUN

/** The commands a RUN line may use besides the image's own: the file commands of a base system and the accounts tools. */
const RUN_FILE_COMMANDS = ['pwd', 'ls', 'cd', 'mkdir', 'touch', 'cat', 'cp', 'mv', 'rm', 'echo', 'head', 'tail', 'grep', 'wc', 'hostname', 'uname', 'chmod', 'chown', 'chgrp', 'ln', 'id', 'whoami', 'sort', 'cut', 'tr', 'tee', 'uniq'] as const satisfies readonly CommandName[];
let runProfile: ShellProfile | undefined;
const RUN_PROFILE = () => runProfile ??= { id: 'build', commands: RUN_FILE_COMMANDS, features: ['glob', 'multi-source', 'ls-extra', 'pipes', 'accounts'] };
/** What the build's shell handles itself (apt-get is added for Debian and Ubuntu images only). */
const SPECIAL = ['pip', 'pip3', 'python', 'python3', 'npm', 'useradd', 'groupadd', 'adduser', 'addgroup', 'set', 'export', 'true', 'false', 'exit', 'cd', 'sh', 'bash'];

type RunIo = { log: string[]; seconds: number };
const isAlpine = (osRelease: string) => /^ID="?alpine"?$/m.test(osRelease);
const distroOf = (osRelease: string) => /^ID="?([a-z]+)"?$/m.exec(osRelease)?.[1] ?? '';
const codenameOf = (osRelease: string) => /^VERSION_CODENAME="?([a-z]+)"?$/m.exec(osRelease)?.[1] ?? /^VERSION="?[^(\n]*\(([a-z]+)\)/m.exec(osRelease)?.[1] ?? (distroOf(osRelease) === 'ubuntu' ? 'noble' : 'bookworm');

/** The system accounts of a base image whose /etc/passwd the lesson does not list (Debian's uids; nobody is 65534). */
const SYSTEM_USERS: [string, number, number, string][] = [['root', 0, 0, '/root'], ['daemon', 1, 1, '/usr/sbin'], ['bin', 2, 2, '/bin'], ['sys', 3, 3, '/dev'], ['www-data', 33, 33, '/var/www'], ['nobody', 65534, 65534, '/nonexistent']];
const SYSTEM_GROUPS: [string, number][] = [['root', 0], ['daemon', 1], ['bin', 2], ['sys', 3], ['www-data', 33], ['nogroup', 65534]];
/** /etc/passwd and /etc/group of the build container as E3's accounts (the system accounts when the files are missing). */
export function accountsOf(nodes: ReadonlyMap<string, FsNode>): { users: Account[]; groups: GroupEntry[] } {
  const users: Account[] = [], groups: GroupEntry[] = [];
  for (const l of (nodes.get('/etc/passwd')?.content ?? '').split('\n')) {
    const f = l.split(':');
    if (f.length >= 7) users.push({ name: f[0], uid: Number(f[2]), gid: Number(f[3]), comment: f[4], home: f[5], shell: f[6] });
  }
  for (const l of (nodes.get('/etc/group')?.content ?? '').split('\n')) {
    const f = l.split(':');
    if (f.length >= 4) groups.push({ name: f[0], gid: Number(f[2]), members: f[3] ? f[3].split(',') : [] });
  }
  // An image without /etc/passwd (the lesson did not list it) has the system accounts every base image has.
  if (!nodes.has('/etc/passwd')) users.push(...SYSTEM_USERS.map(([name, uid, gid, home]) => ({ name, uid, gid, comment: name, home, shell: name === 'root' ? '/bin/sh' : '/usr/sbin/nologin' })));
  if (!nodes.has('/etc/group')) groups.push(...SYSTEM_GROUPS.map(([name, gid]) => ({ name, gid, members: [] })));
  if (!users.some(u => u.name === 'root')) users.unshift({ name: 'root', uid: 0, gid: 0, comment: 'root', home: '/root', shell: '/bin/sh' });
  if (!groups.some(g => g.name === 'root')) groups.unshift({ name: 'root', gid: 0, members: [] });
  return { users, groups };
}
/** A user's name, uid and home in an image (a numeric USER without a passwd entry is that uid with home /). */
export function userOf(nodes: ReadonlyMap<string, FsNode>, spec: string): { name: string; home: string } | null {
  const name = spec.split(':')[0] || 'root', acc = accountsOf(nodes);
  const u = acc.users.find(x => x.name === name) ?? (/^\d+$/.test(name) ? acc.users.find(x => x.uid === Number(name)) : undefined);
  if (u) return { name: u.name, home: u.home };
  return /^\d+$/.test(name) ? { name, home: '/' } : null;
}
const writeAccounts = (nodes: Map<string, FsNode>, acc: { users: Account[]; groups: GroupEntry[] }) => {
  const mk = (p: string, content: string) => nodes.set(p, { kind: 'file', mode: 0o644, owner: 'root', content });
  if (!nodes.has('/etc')) nodes.set('/etc', { kind: 'dir', mode: 0o755, owner: 'root' });
  mk('/etc/passwd', acc.users.map(u => `${u.name}:x:${u.uid}:${u.gid}:${u.comment}:${u.home}:${u.shell}\n`).join(''));
  mk('/etc/group', acc.groups.map(g => `${g.name}:x:${g.gid}:${g.members.join(',')}\n`).join(''));
};

/** A RUN line split at ;, && and || outside quotes (the build's /bin/sh -c). */
function splitLine(line: string): { text: string; op: string }[] {
  const out: { text: string; op: string }[] = [];
  let cur = '', q: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { cur += ch; if (ch === q) q = null; else if (ch === '\\' && q === '"' && i + 1 < line.length) cur += line[++i]; continue; }
    if (ch === "'" || ch === '"') { q = ch; cur += ch; continue; }
    if (ch === '\\' && i + 1 < line.length) { cur += ch + line[++i]; continue; }
    const two = line.slice(i, i + 2);
    if (two === '&&' || two === '||') { out.push({ text: cur, op: two }); cur = ''; i++; continue; }
    if (ch === ';' || ch === '\n') { out.push({ text: cur, op: ';' }); cur = ''; continue; }
    cur += ch;
  }
  out.push({ text: cur, op: '' });
  return out.filter(p => p.text.trim() || p.op);
}
/** The shell's parameter expansion of a part ($VAR, ${VAR}, ${VAR:-x}) outside single quotes. */
function expandVars(text: string, env: ReadonlyMap<string, string>): string {
  let out = '', q = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "'") { q = !q; out += text[i]; continue; }
    if (!q && text[i] === '$') {
      const m = /^\$(?:\{([A-Za-z_]\w*)(?::-([^}]*))?\}|([A-Za-z_]\w*))/.exec(text.slice(i));
      if (m) { out += env.get(m[1] ?? m[3]) || (m[2] ?? ''); i += m[0].length - 1; continue; }
    }
    out += text[i];
  }
  return out;
}
const words = (text: string) => (text.match(/"(?:[^"\\]|\\.)*"|'[^']*'|\S+/g) ?? []).map(w => w.startsWith('"') ? w.slice(1, -1).replace(/\\(.)/g, '$1') : w.startsWith("'") ? w.slice(1, -1) : w);

export interface RunEnv { stage: Stage; img: DockerImage | null; env: Map<string, string>; user: string; packages: ImagePackages; available: readonly string[]; alpine: boolean }

/** Runs a RUN instruction's command line in the build container: its output (merged), its exit status, the changed stage. */
function runLine(r: RunEnv, argv: string[] | null, line: string, io: RunIo): number {
  const notFound = (cmd: string) => { io.log.push(r.alpine ? `/bin/sh: ${cmd}: not found` : `/bin/sh: 1: ${cmd}: not found`); return 127; };
  const parts = argv ? [{ text: '', op: '', argv }] : splitLine(line).map(p => ({ ...p, argv: undefined as string[] | undefined }));
  let status = 0, cwd = r.stage.workdir;
  for (let k = 0; k < parts.length; k++) {
    // sh's lists: && runs the next command only after success, || only after a failure, ; always (no set -e).
    const before = k ? parts[k - 1].op : ';';
    if ((before === '&&' && status !== 0) || (before === '||' && status === 0)) continue;
    const p = parts[k];
    if (p.text.includes('$(') || p.text.includes('`')) { io.log.push('/bin/sh: 模擬環境的 RUN 不支援命令替換 $(…)'); status = 2; continue; }
    const text = argv ? '' : expandVars(p.text.trim(), r.env);
    const w = p.argv ?? words(text);
    if (!w.length) continue;
    status = runPart(r, w, text, () => cwd, c => { cwd = c; }, io, notFound);
    if (status === -1) return 0;
    if (status >= 1000) return status - 1000;
  }
  return status;
}

/** One simple command of a RUN line (status; 1000 + N is exit N; -1 is exit 0). */
function runPart(r: RunEnv, w: string[], text: string, cwd: () => string, setCwd: (c: string) => void, io: RunIo, notFound: (c: string) => number): number {
  const [cmd0, ...args] = w;
  const cmd = cmd0.slice(cmd0.lastIndexOf('/') + 1);
  const s = r.stage;
  switch (cmd) {
    case 'set': return 0;
    case 'true': return 0;
    case 'false': return 1;
    case 'exit': { const n = Number(args[0] ?? 0); return n === 0 ? -1 : 1000 + (n % 256); }
    case 'export': { for (const a of args) { const eq = a.indexOf('='); if (eq > 0) r.env.set(a.slice(0, eq), a.slice(eq + 1)); } return 0; }
    case 'cd': {
      const to = resolvePath({ cwd: cwd(), home: '/root' }, args[0] ?? '/root');
      if (s.nodes.get(to)?.kind !== 'dir') { io.log.push(r.alpine ? `/bin/sh: cd: can't cd to ${args[0]}: No such file or directory` : `/bin/sh: 1: cd: can't cd to ${args[0]}`); return 2; }
      setCwd(to); return 0;
    }
    case 'sh': case 'bash': {
      if (args[0] === '-c' && args[1] !== undefined) return runLine(r, null, args[1], io);
      if (!r.available.includes(cmd)) return notFound(cmd0);
      return 0;
    }
    case 'apt-get': case 'apt': return !r.available.includes('apt-get') ? notFound(cmd0) : aptRun(r, cmd, args, io);
    case 'pip': case 'pip3': return r.packages.pip ? pipRun(r, args, cwd(), io) : notFound(cmd0);
    case 'python': case 'python3':
      if (!r.packages.pip) return notFound(cmd0);
      if (args[0] === '-m' && args[1] === 'pip') return pipRun(r, args.slice(2), cwd(), io);
      io.log.push(`${cmd}：模擬環境的 RUN 只支援 ${cmd} -m pip install`); return 1;
    case 'npm': return r.packages.npm ? npmRun(r, args, cwd(), io) : notFound(cmd0);
    case 'useradd': case 'groupadd': case 'adduser': case 'addgroup': return accountsRun(r, cmd, args, io, notFound);
  }
  if (!r.available.includes(cmd)) return notFound(cmd0);
  // The file commands run in the simulation's shell on the build container's files, as the stage's user.
  const acc = accountsOf(s.nodes), who = userOf(s.nodes, r.user) ?? { name: r.user, home: '/' };
  const groups = acc.groups.filter(g => g.members.includes(who.name) || g.gid === acc.users.find(u => u.name === who.name)?.gid).map(g => g.name);
  const state: FsState = { nodes: s.nodes, cwd: cwd(), user: who.name, home: who.home, host: 'buildkitsandbox', groups: groups.length ? groups : [who.name], accounts: acc };
  const quote = (a: string) => /^[A-Za-z0-9_./=:,@%+-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`;
  const res = runInput(state, text || w.map(quote).join(' '), RUN_PROFILE(), null, false);
  for (const l of res.lines) io.log.push(l.text);
  s.nodes = new Map(res.state.nodes);
  io.seconds += 0.05;
  return res.lines.some(l => l.kind === 'err') ? 1 : 0;
}

/** apt-get (and apt) on the build container: E5's engine on the image's package table, as root, without a terminal. */
function aptRun(r: RunEnv, cmd: string, args: string[], io: RunIo): number {
  const s = r.stage, who = userOf(s.nodes, r.user)?.name ?? r.user;
  s.apt ??= aptDbOf(r.packages, r.img?.osRelease ?? '');
  const before = s.apt;
  const lines: string[] = [];
  const res = apt({ nodes: s.nodes, cwd: '/', user: who, home: '/root', packages: s.apt }, args, {
    out: l => lines.push(l), err: l => lines.push(l), user: who, tty: false,
  });
  // apt-get prints no "Done" without a terminal and has no upgrade summary; apt warns about its CLI (E5 prints that).
  const update = args.find(a => !a.startsWith('-')) === 'update';
  for (const l of lines) {
    if (cmd === 'apt-get' && (l === '' || l.startsWith('WARNING: apt does not have a stable CLI') || /can be upgraded|All packages are up to date/.test(l))) continue;
    // apt-get update ends with the package lists (no dependency tree).
    if (cmd === 'apt-get' && update && /^(Building dependency tree|Reading state information)/.test(l)) continue;
    io.log.push(l.replace(/^(Reading package lists|Building dependency tree|Reading state information)\.\.\. Done$/, '$1...'));
  }
  if (res.status !== 0) return res.status;
  s.nodes = new Map(res.state.nodes);
  s.apt = res.state.packages;
  if (update) {
    const repo = s.apt!.repositories[0], file = `/var/lib/apt/lists/${repo.url.replace(/^https?:\/\//, '').replace(/\//g, '_')}_dists_${repo.suite}_main_binary-amd64_Packages.lz4`;
    mkdirs(s.nodes, '/var/lib/apt/lists');
    const content = `Packages of ${repo.suite}\n`;
    s.nodes.set(file, { kind: 'file', mode: 0o644, owner: 'root', content });
    s.weights.set(file, { content, size: r.packages.aptLists ?? 18_000_000 });
    io.seconds += 1.2;
  }
  // Each newly installed package's first file weighs the package.
  for (const p of s.apt!.installed) {
    if (before?.installed.some(q => q.name === p.name && q.version === p.version)) continue;
    const def = (r.packages.apt ?? []).find(d => d.name === p.name), path = mainFile(def, 'apt');
    const node = path ? s.nodes.get(path) : undefined;
    if (def && path && node?.kind === 'file') s.weights.set(path, { content: node.content ?? '', size: def.size });
    io.seconds += 0.6;
  }
  return 0;
}
const mainFile = (def: BuildPackage | undefined, kind: 'apt') => def ? def.files?.[0]?.path ?? (kind === 'apt' ? `/usr/bin/${def.name}` : undefined) : undefined;
/** The image's apt database: its distribution's repositories (lists not downloaded yet) and its package table. */
function aptDbOf(p: ImagePackages, osRelease: string): PackageDb {
  const code = codenameOf(osRelease), ubuntu = distroOf(osRelease) === 'ubuntu';
  const repositories = ubuntu
    ? [{ name: 'main', url: 'http://archive.ubuntu.com/ubuntu', suite: code, components: ['main'], enabled: true }, { name: 'updates', url: 'http://archive.ubuntu.com/ubuntu', suite: `${code}-updates`, components: ['main'], enabled: true },
      { name: 'security', url: 'http://security.ubuntu.com/ubuntu', suite: `${code}-security`, components: ['main'], enabled: true }]
    : [{ name: 'main', url: 'http://deb.debian.org/debian', suite: code, components: ['main'], enabled: true }, { name: 'updates', url: 'http://deb.debian.org/debian', suite: `${code}-updates`, components: ['main'], enabled: true },
      { name: 'security', url: 'http://deb.debian.org/debian-security', suite: `${code}-security`, components: ['main'], enabled: true }];
  const available: PackageDef[] = (p.apt ?? []).map(d => ({ name: d.name, version: d.version, repo: 'main', description: d.name, depends: [...d.depends ?? []],
    files: (d.files ?? [{ path: `/usr/bin/${d.name}`, content: '' }]).map(f => ({ path: f.path, kind: 'file' as const, mode: f.path.includes('/bin/') ? 0o755 : 0o644, content: f.content })) }));
  return { repositories, available, installed: [], holds: [], current: false };
}
function mkdirs(nodes: Map<string, FsNode>, path: string, owner = 'root') {
  const chain: string[] = [];
  for (let q = path; q !== '/' && !nodes.has(q); q = parentOf(q)) chain.unshift(q);
  for (const q of chain) nodes.set(q, { kind: 'dir', mode: 0o755, owner });
}
const norm = (n: string) => n.toLowerCase().replace(/[-_.]+/g, '-');

/** pip install [-r FILE] [NAME[==VERSION]…] [--no-cache-dir]: the image's pip table (dependencies first); writes site-packages. */
function pipRun(r: RunEnv, args: string[], cwd: string, io: RunIo): number {
  const s = r.stage, table = r.packages.pip ?? [];
  if (args[0] !== 'install') { io.log.push('pip：模擬環境的 RUN 只支援 pip install'); return 1; }
  let noCache = false;
  const reqs: { spec: string; from?: string }[] = [];
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === '--no-cache-dir') noCache = true;
    else if (a === '-q' || a === '--quiet' || a === '--upgrade' || a === '-U' || a === '--user' || a === '--root-user-action=ignore') continue;
    else if (a === '-r' || a === '--requirement') {
      const file = args[++i] ?? '', path = resolvePath({ cwd, home: '/root' }, file), node = s.nodes.get(path);
      if (node?.kind !== 'file') { io.log.push(`ERROR: Could not open requirements file: [Errno 2] No such file or directory: '${file}'`); return 1; }
      (node.content ?? '').split('\n').forEach((l, n) => { const t = l.replace(/#.*/, '').trim(); if (t) reqs.push({ spec: t, from: `-r ${file} (line ${n + 1})` }); });
    } else if (a.startsWith('-')) { io.log.push(`ERROR: 模擬環境的 pip 不支援 ${a}`); return 1; }
    else reqs.push({ spec: a });
  }
  if (!reqs.length) { io.log.push('ERROR: You must give at least one requirement to install (see "pip help install")'); return 1; }
  const order: BuildPackage[] = [], seen = new Set<string>();
  const want = (spec: string, from: string | undefined): string | null => {
    const m = /^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:(==|>=|<=|~=|>|<)\s*([^\s;,]+))?/.exec(spec);
    if (!m) return `ERROR: Invalid requirement: '${spec}'`;
    const hits = table.filter(p => norm(p.name) === norm(m[1]));
    const ok = hits.filter(p => !m[2] || (m[2] === '==' ? p.version === m[3] : true));
    if (ok.length && seen.has(norm(ok[0].name))) return null;
    io.log.push(`Collecting ${spec}${from ? ` (from ${from})` : ''}`);
    if (!ok.length) return `ERROR: Could not find a version that satisfies the requirement ${spec} (from versions: ${hits.map(h => h.version).join(', ') || 'none'})\nERROR: No matching distribution found for ${spec}`;
    const p = ok[0];
    if (seen.has(norm(p.name))) return null;
    seen.add(norm(p.name));
    for (const d of p.depends ?? []) { const e = want(d, `${p.name}==${p.version}`); if (e) return e; }
    order.push(p);
    return null;
  };
  for (const q of reqs) { const e = want(q.spec, q.from); if (e) { e.split('\n').forEach(l => io.log.push(l)); return 1; } }
  const version = /^PYTHON_VERSION=(\d+\.\d+)/m.exec(r.stage.env.join('\n'))?.[1];
  const site = `/usr/local/lib/python${version ?? '3'}/site-packages`, home = userOf(s.nodes, r.user)?.home ?? '/root';
  if (r.user !== 'root' && userOf(s.nodes, r.user)?.name !== 'root' && !canWrite(s, site, r.user)) {
    io.log.push('ERROR: Could not install packages due to an OSError: [Errno 13] Permission denied'); return 1;
  }
  io.log.push(`Installing collected packages: ${order.map(p => p.name).join(', ')}`);
  for (const p of order) {
    const path = `${site}/${norm(p.name).replace(/-/g, '_')}/__init__.py`, content = `# ${p.name} ${p.version}\n`;
    mkdirs(s.nodes, parentOf(path));
    s.nodes.set(path, { kind: 'file', mode: 0o644, owner: 'root', content });
    s.weights.set(path, { content, size: p.size });
    if (!noCache) {
      // pip keeps the downloaded wheels in its cache (in the layer) unless --no-cache-dir.
      const cache = `${home === '/' ? '/root' : home}/.cache/pip/http-v2/${hex(`wheel/${p.name}/${p.version}`).slice(0, 32)}`, body = `${p.name}-${p.version}.whl\n`;
      mkdirs(s.nodes, parentOf(cache));
      s.nodes.set(cache, { kind: 'file', mode: 0o644, owner: 'root', content: body });
      s.weights.set(cache, { content: body, size: Math.ceil(p.size / 3) });
    }
    io.seconds += 0.4;
  }
  io.log.push(`Successfully installed ${[...order].sort((a, b) => norm(a.name) < norm(b.name) ? -1 : 1).map(p => `${p.name}-${p.version}`).join(' ')}`);
  return 0;
}
const canWrite = (s: Stage, path: string, user: string) => {
  let q = path;
  while (!s.nodes.has(q)) q = parentOf(q);
  const n = s.nodes.get(q)!;
  return n.owner === user && (n.mode & 0o200) !== 0;
};

/** npm ci | install [NAME…] [--omit=dev]: the dependencies of package.json from the image's npm table, into node_modules. */
function npmRun(r: RunEnv, args: string[], cwd: string, io: RunIo): number {
  const s = r.stage, table = r.packages.npm ?? [];
  const [verb, ...rest] = args;
  if (verb !== 'ci' && verb !== 'install' && verb !== 'i') { io.log.push(`npm：模擬環境的 RUN 只支援 npm ci 與 npm install`); return 1; }
  const omitDev = rest.includes('--omit=dev') || rest.includes('--production') || rest.includes('--only=production');
  const pkgPath = `${cwd === '/' ? '' : cwd}/package.json`, pkg = s.nodes.get(pkgPath);
  const named = rest.filter(a => !a.startsWith('-'));
  if (pkg?.kind !== 'file' && !named.length) {
    io.log.push('npm error code ENOENT', 'npm error syscall open', `npm error path ${pkgPath}`, `npm error errno -2`, `npm error enoent Could not read package.json: Error: ENOENT: no such file or directory, open '${pkgPath}'`);
    return 254;
  }
  if (verb === 'ci' && s.nodes.get(`${cwd === '/' ? '' : cwd}/package-lock.json`)?.kind !== 'file') {
    ['npm error code EUSAGE', 'npm error', 'npm error The `npm ci` command can only install with an existing package-lock.json or', 'npm error npm-shrinkwrap.json with lockfileVersion >= 1. Run an install with npm@5 or',
      'npm error later to generate a package-lock.json file, then try again.'].forEach(l => io.log.push(l));
    return 1;
  }
  let deps: string[] = [...named];
  if (!named.length) {
    let json: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    try { json = JSON.parse(pkg!.content ?? '') as typeof json; } catch { io.log.push('npm error code EJSONPARSE', `npm error JSON.parse Invalid package.json: ${pkgPath}`); return 1; }
    deps = [...Object.keys(json.dependencies ?? {}), ...omitDev ? [] : Object.keys(json.devDependencies ?? {})];
  }
  const order: BuildPackage[] = [], seen = new Set<string>();
  const want = (name: string): string | null => {
    const p = table.find(x => x.name === name.replace(/@[^@/]*$/, '') || x.name === name);
    if (!p) return `npm error code E404\nnpm error 404 Not Found - GET https://registry.npmjs.org/${name} - Not found`;
    if (seen.has(p.name)) return null;
    seen.add(p.name);
    for (const d of p.depends ?? []) { const e = want(d); if (e) return e; }
    order.push(p);
    return null;
  };
  for (const d of deps) { const e = want(d); if (e) { e.split('\n').forEach(l => io.log.push(l)); return 1; } }
  for (const p of order) {
    const path = `${cwd === '/' ? '' : cwd}/node_modules/${p.name}/package.json`, content = `{"name":"${p.name}","version":"${p.version}"}\n`;
    mkdirs(s.nodes, parentOf(path), userOf(s.nodes, r.user)?.name ?? 'root');
    s.nodes.set(path, { kind: 'file', mode: 0o644, owner: userOf(s.nodes, r.user)?.name ?? 'root', content });
    s.weights.set(path, { content, size: p.size });
    io.seconds += 0.3;
  }
  const secs = Math.max(1, Math.round(order.length * 0.3));
  io.log.push(order.length ? `added ${order.length} package${order.length === 1 ? '' : 's'}, and audited ${order.length + 1} packages in ${secs}s` : `up to date, audited 1 package in ${secs}s`, '', 'found 0 vulnerabilities');
  return 0;
}

/** useradd, groupadd (Debian) and adduser -S, addgroup -S (Alpine's BusyBox): /etc/passwd and /etc/group. */
function accountsRun(r: RunEnv, cmd: string, args: string[], io: RunIo, notFound: (c: string) => number): number {
  // Debian and Ubuntu images have useradd and groupadd; Alpine's BusyBox has adduser and addgroup.
  if ((cmd === 'adduser' || cmd === 'addgroup') !== r.alpine) return notFound(cmd);
  const s = r.stage, acc = accountsOf(s.nodes), who = userOf(s.nodes, r.user)?.name ?? r.user;
  if (who !== 'root') { io.log.push(`${cmd}: Permission denied.`); return 1; }
  const opts = new Map<string, string>(), names: string[] = [];
  const takes = new Set(['-u', '-g', '-G', '-s', '-d', '-h', '-c']);
  for (let i = 0; i < args.length; i++) { const a = args[i]; if (takes.has(a)) opts.set(a, args[++i] ?? ''); else if (a.startsWith('-')) opts.set(a, ''); else names.push(a); }
  const name = names[0];
  if (!name) { io.log.push(`Usage: ${cmd} [options] NAME`); return 2; }
  const system = opts.has('-r') || opts.has('-S') || opts.has('--system');
  const nextId = (used: number[]) => { let id = system ? 999 : 1000; while (used.includes(id)) id += system ? -1 : 1; return id; };
  if (cmd === 'groupadd' || cmd === 'addgroup') {
    if (acc.groups.some(g => g.name === name)) { io.log.push(r.alpine ? `addgroup: group '${name}' in use` : `groupadd: group '${name}' already exists`); return r.alpine ? 1 : 9; }
    acc.groups.push({ name, gid: Number(opts.get('-g') ?? nextId(acc.groups.map(g => g.gid))), members: [] });
    writeAccounts(s.nodes, acc);
    return 0;
  }
  if (acc.users.some(u => u.name === name)) { io.log.push(r.alpine ? `adduser: user '${name}' in use` : `useradd: user '${name}' already exists`); return r.alpine ? 1 : 9; }
  const uid = Number(opts.get('-u') ?? nextId(acc.users.map(u => u.uid)));
  const groupName = opts.get(r.alpine ? '-G' : '-g') ?? name;
  let group = acc.groups.find(g => g.name === groupName || String(g.gid) === groupName);
  if (!group) {
    if (opts.has(r.alpine ? '-G' : '-g')) { io.log.push(`${cmd}: group '${groupName}' does not exist`); return 6; }
    group = { name, gid: acc.groups.some(g => g.gid === uid) ? nextId(acc.groups.map(g => g.gid)) : uid, members: [] };
    acc.groups.push(group);
  }
  const home = opts.get(r.alpine ? '-h' : '-d') ?? `/home/${name}`;
  const shell = opts.get('-s') ?? (r.alpine ? '/sbin/nologin' : '/bin/sh');
  acc.users.push({ name, uid, gid: group.gid, comment: opts.get('-c') ?? '', home, shell });
  writeAccounts(s.nodes, acc);
  // useradd -m, and adduser (which makes the home unless -H), create the home folder owned by the user.
  if (opts.has('-m') || opts.has('--create-home') || (cmd === 'adduser' && !opts.has('-H'))) { mkdirs(s.nodes, parentOf(home)); s.nodes.set(home, { kind: 'dir', mode: 0o755, owner: name, ...group.name !== name ? { group: group.name } : {} }); }
  return 0;
}

// ------------------------------------------------------------------------------------------------- layers

/** The layer between two file systems: its diff ID (none: an empty layer) and size (the bytes of added or changed files). */
function diffOf(before: ReadonlyMap<string, FsNode>, after: ReadonlyMap<string, FsNode>, weights: ReadonlyMap<string, Weight>): { id?: string; size: number } {
  const entries: string[] = [];
  let size = 0;
  const weigh = (path: string, node: FsNode) => { const w = weights.get(path); return w && w.content === node.content ? w.size : bytes(node.content ?? ''); };
  for (const [path, node] of after) {
    const old = before.get(path);
    if (old && old.kind === node.kind && old.mode === node.mode && old.owner === node.owner && old.group === node.group && old.content === node.content && old.target === node.target) continue;
    entries.push(`${path}\t${node.kind}\t${node.mode.toString(8)}\t${node.owner}:${node.group ?? ''}\t${node.kind === 'file' ? hex(`${node.content}/${weights.get(path)?.content === node.content ? weights.get(path)!.size : ''}`) : node.target ?? ''}`);
    if (node.kind === 'file') size += weigh(path, node);
  }
  for (const path of before.keys()) if (!after.has(path)) entries.push(`${path}\twhiteout`);
  if (!entries.length) return { size: 0 };
  return { id: hex(`diff\n${entries.sort().join('\n')}`), size };
}

// ------------------------------------------------------------------------------------------------- docker build

export interface BuildOptions {
  tags: ImageRef[];
  file?: string;
  context: string;
  args: Record<string, string>;
  noCache: boolean;
  target?: string;
  quiet: boolean;
  /** E22 (the storage-net profile): VOLUME is supported. */
  storageNet?: boolean;
}
export interface BuildStep { label: string; cached: boolean }
export interface BuildResult { state: FsState; status: number; steps: BuildStep[]; id?: string }
export interface BuildHooks {
  /** A local image (by reference) or one Docker Hub serves (for FROM). */
  local(ref: ImageRef): DockerImage | undefined;
  remote(ref: ImageRef): DockerImage | undefined | 'unknown-tag';
  parseRef(text: string): ImageRef | null;
  qualified(ref: ImageRef): string;
  humanSize(n: number, precision?: number): string;
}
interface Io { out(line: string): void; err(line: string): void }

/** BuildKit's way to print a step's time: one decimal (0.0s, 1.2s). */
const secs = (s: number) => `${(Math.round(s * 10) / 10).toFixed(1)}s`;
const stamp = (s: number) => (Math.round(s * 1000) / 1000).toFixed(3);
const refId = (seed: string) => { const h = hex(seed); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}::${[...hex(`${seed}/k`).slice(0, 25)].map(c => /\d/.test(c) ? c : String.fromCharCode(c.charCodeAt(0) + 10)).join('')}`; };

/**
 * docker build: the progress (BuildKit's plain format on standard error; -q prints only the image ID on standard output),
 * the new image and its tags, and the build cache. The caller has checked the socket and the options.
 */
export function build(state: FsState, d: DockerState, o: BuildOptions, io: Io, hooks: BuildHooks): BuildResult {
  const now = clockOf(state).now;
  const steps: BuildStep[] = [];
  // The build cache keeps what a build downloaded and the steps that succeeded, even when a later step fails.
  const cache: Record<string, CacheEntry> = { ...d.buildCache ?? {} };
  const kept = () => ({ ...state, docker: { ...d, buildCache: cache } });
  // Progress lines (only without -q); an error's details always print.
  const show = (l: string) => { if (!o.quiet) io.err(l); };
  let n = 1;
  const block = (name: string, body: readonly string[], end: string) => { const k = n++; show(`#${k} ${name}`); body.forEach(b => show(`#${k} ${b}`)); show(`#${k} ${end}`); show(''); };
  const fail = (message: string, source?: Source, logs?: { name: string; lines: readonly string[] }): BuildResult => {
    if (logs) { io.err('------'); io.err(` > ${logs.name}:`); logs.lines.slice(-10).forEach(l => io.err(l)); io.err('------'); }
    if (source) printSource(source, io.err);
    io.err(`ERROR: ${message}`);
    return { state: kept(), status: 1, steps };
  };
  // The context and the Dockerfile (-f is relative to the current folder, as the CLI reads it).
  const ctx = resolvePath(state, o.context);
  if (state.nodes.get(ctx)?.kind !== 'dir') { io.err(`ERROR: unable to prepare context: path "${o.context}" not found`); return { state, status: 1, steps }; }
  show('#0 building with "default" instance using docker driver');
  show('');
  const filePath = o.file ? resolvePath(state, o.file) : `${ctx === '/' ? '' : ctx}/Dockerfile`;
  const shownName = (o.file ?? 'Dockerfile').slice((o.file ?? 'Dockerfile').lastIndexOf('/') + 1);
  const df = state.nodes.get(filePath);
  if (df?.kind !== 'file') {
    block(`[internal] load build definition from ${shownName}`, ['transferring dockerfile: 2B done'], 'DONE 0.0s');
    return fail(`failed to solve: failed to read dockerfile: open ${shownName}: no such file or directory`);
  }
  const text = df.content ?? '';
  block(`[internal] load build definition from ${shownName}`, [`transferring dockerfile: ${hooks.humanSize(bytes(text))} done`], 'DONE 0.0s');
  const src = (from: number, to: number): Source => ({ text, name: shownName, from, to });
  const parsed = parseDockerfile(text);
  if ('error' in parsed) return fail(`failed to solve: ${parsed.error}`, src(parsed.line, parsed.line));
  // Stages: FROM … [AS name]; ARGs before the first FROM are for the FROM lines only.
  const globalArgs = new Map<string, string>();
  const stages: { from: Instruction; name?: string; body: Instruction[] }[] = [];
  for (const ins of parsed.instructions) {
    if (ins.keyword === 'FROM') {
      const w = ins.args.split(/\s+/).filter(Boolean);
      if (!(w.length === 1 || (w.length === 3 && w[1].toLowerCase() === 'as'))) return fail(`failed to solve: dockerfile parse error on line ${ins.line}: FROM requires either one or three arguments`, src(ins.line, ins.end));
      stages.push({ from: ins, ...w[2] ? { name: w[2].toLowerCase() } : {}, body: [] });
      continue;
    }
    if (!stages.length) {
      if (ins.keyword !== 'ARG') return fail('failed to solve: no build stage in current context', src(ins.line, ins.end));
      const p = pairs(ins.args);
      for (const [k, v] of p?.pairs ?? []) globalArgs.set(k, o.args[k] ?? (p!.legacy ? '' : v));
      continue;
    }
    stages.at(-1)!.body.push(ins);
  }
  if (!stages.length) return fail('failed to solve: the Dockerfile cannot be empty');
  // Only the target stage (the last one, or --target) is built: BuildKit skips the stages it does not need.
  let at = stages.length - 1;
  if (o.target !== undefined) {
    at = stages.findIndex(s => s.name === o.target!.toLowerCase());
    if (at < 0) return fail(`failed to solve: target stage "${o.target}" could not be found`);
  }
  const stage = stages[at];
  const LATER: Record<string, string> = { VOLUME: 'E22（Volume 與網路）', HEALTHCHECK: 'E24（健康檢查、資源限制與重新啟動）', STOPSIGNAL: 'E24（健康檢查、資源限制與重新啟動）', ONBUILD: '之後的階段', SHELL: '之後的階段', MAINTAINER: '之後的階段（請用 LABEL）' };
  for (const ins of stage.body) {
    if ((ins.keyword === 'COPY' || ins.keyword === 'ADD') && ins.flags.from !== undefined) return fail(`failed to solve: ${ins.keyword} --from（多階段建置）：模擬環境在引擎階段 E23 才支援`, src(ins.line, ins.end));
    if (ins.keyword === 'RUN' && Object.keys(ins.flags).length) return fail(`failed to solve: 模擬環境不支援 RUN --${Object.keys(ins.flags)[0]}`, src(ins.line, ins.end));
    if ((ins.keyword === 'COPY' || ins.keyword === 'ADD') && Object.keys(ins.flags).some(f => f !== 'chown' && f !== 'chmod')) return fail(`failed to solve: 模擬環境的 ${ins.keyword} 只支援 --chown 與 --chmod`, src(ins.line, ins.end));
    if (LATER[ins.keyword] && !(o.storageNet && ins.keyword === 'VOLUME')) return fail(`failed to solve: ${ins.keyword}：模擬環境在引擎階段 ${LATER[ins.keyword]} 才支援`, src(ins.line, ins.end));
  }
  // The base image (ARG substitution on the FROM line): local first, else what Docker Hub serves.
  const fromText = substitute(stage.from.args.split(/\s+/)[0], globalArgs);
  const scratch = fromText === 'scratch';
  const baseRef = scratch ? null : hooks.parseRef(fromText);
  if (!scratch && !baseRef) return fail(`failed to solve: failed to parse stage name "${fromText}": invalid reference format`, src(stage.from.line, stage.from.end));
  let base: DockerImage | null = null;
  const nameOf = (r: ImageRef) => hooks.qualified(r);
  if (baseRef) {
    base = hooks.local(baseRef) ?? null;
    const remote = base ? undefined : hooks.remote(baseRef);
    if (!base && (remote === undefined || remote === 'unknown-tag')) {
      const why = remote === 'unknown-tag' ? `${nameOf(baseRef)}: not found` : 'pull access denied, repository does not exist or may require authorization: server message: insufficient_scope: authorization failed';
      block(`[internal] load metadata for ${nameOf(baseRef)}`, [], `ERROR: ${why}`);
      return fail(`failed to solve: ${fromText}: failed to resolve source metadata for ${nameOf(baseRef)}: ${why}`, src(stage.from.line, stage.from.end), { name: `[internal] load metadata for ${nameOf(baseRef)}`, lines: [] });
    }
    base ??= remote as DockerImage;
    block(`[internal] load metadata for ${nameOf(baseRef)}`, [], 'DONE 0.5s');
  }
  // .dockerignore, then the context: every file under the folder that .dockerignore does not exclude.
  const ignoreNode = state.nodes.get(`${ctx === '/' ? '' : ctx}/.dockerignore`), patterns = ignoreNode?.kind === 'file' ? ignorePatterns(ignoreNode.content ?? '') : [];
  block('[internal] load .dockerignore', [`transferring context: ${ignoreNode?.kind === 'file' ? hooks.humanSize(bytes(ignoreNode.content ?? '')) : '2B'} done`], 'DONE 0.0s');
  const context = new Map<string, FsNode>();
  for (const [p, node] of state.nodes) {
    if (p === ctx || !isInside(p, ctx)) continue;
    const rel = p.slice(ctx === '/' ? 1 : ctx.length + 1);
    if (!ignoredBy(patterns, rel)) context.set(rel, node);
  }
  // FROM, then RUN, COPY, ADD and WORKDIR are the steps ([k/N]); the other instructions change only the config.
  const total = stage.body.filter(i => ['RUN', 'COPY', 'ADD', 'WORKDIR'].includes(i.keyword)).length + 1, prefix = stages.length > 1 ? `${stage.name ?? `stage-${at}`} ` : '';
  const s: Stage = {
    nodes: base ? imageFs(base) : new Map<string, FsNode>([['/', { kind: 'dir', mode: 0o755, owner: 'root' }]]), weights: new Map(base?.weights ?? []), ...base?.apt ? { apt: base.apt } : {},
    env: [...base?.env ?? []], workdir: base?.workdir ?? '/', user: base?.user ?? '', cmd: [...base?.cmd ?? []], entrypoint: [...base?.entrypoint ?? []], expose: [...base?.expose ?? []],
    labels: { ...base?.labels ?? {} }, volumes: [...base?.volumes ?? []], history: base ? historyOf(base).map(r => ({ ...r })) : [], rootfs: base ? rootfsOf(base) : [], chain: base ? chainOf(base) : [], layerSizes: base ? layerSizesOf(base) : [], base,
  };
  const inherited = s.history.length;
  const fromKey = base ? `from/${base.id}` : 'from/scratch';
  if (base) {
    const ref = nameOf({ repo: base.repo, tag: base.tag }), name = base.built ? ref : `${ref}@sha256:${base.digest}`;
    const known = base.local || !!cache[fromKey], body = [`resolve ${name} done`];
    // A base that is neither local nor in the build cache is downloaded into the build cache (it does not become a local image).
    if (!known) rootfsOf(base).forEach((id, k) => { const size = hooks.humanSize(layerSizesOf(base!)[k] ?? 0); body.push(`sha256:${id} ${size} / ${size} 0.4s done`, `extracting sha256:${id} 0.2s done`); });
    block(`[${prefix}1/${total}] FROM ${name}`, body, `DONE ${known ? '0.0s' : secs(0.6 * rootfsOf(base).length)}`);
    cache[fromKey] = { nodes: new Map(), weights: new Map(), created: now, size: 0 };
  } else block(`[${prefix}1/${total}] FROM scratch`, [], 'DONE 0.0s');
  steps.push({ label: `FROM ${fromText}`, cached: false });
  // The context transfer: the files the COPY and ADD steps name.
  const copies = stage.body.filter(i => i.keyword === 'COPY' || i.keyword === 'ADD');
  if (copies.length) {
    const needs = new Set<string>();
    for (const ins of copies) for (const sp of (ins.json ?? ins.args.split(/\s+/).filter(Boolean)).slice(0, -1))
      for (const [rel, node] of context) if (node.kind === 'file' && copyMatch(sp, rel) !== undefined) needs.add(rel);
    block('[internal] load build context', [`transferring context: ${hooks.humanSize([...needs].reduce((t, r) => t + bytes(context.get(r)!.content ?? ''), 0))} done`], 'DONE 0.0s');
  }
  // The stage's variables: its ARGs (a --build-arg wins over the default) and ENV.
  const args = new Map<string, string>(), declared: string[] = [];
  const envMap = () => new Map(s.env.map(e => [e.slice(0, e.indexOf('=')), e.slice(e.indexOf('=') + 1)] as [string, string]));
  const vars = () => new Map([...args, ...envMap()]);
  const warnings: string[] = [];
  let key = fromKey, k = 1, newLayers = 0, cmdSet = false;
  const meta = (createdBy: string) => s.history.push({ created: -1, createdBy, size: 0, empty: true, comment: 'buildkit.dockerfile.v0' });
  for (const ins of stage.body) {
    const sub = (t: string) => substitute(t, vars());
    switch (ins.keyword) {
      case 'ARG': {
        const p = pairs(ins.args);
        for (const [name, v] of p?.pairs ?? []) {
          const value = o.args[name] ?? (p!.legacy ? globalArgs.get(name) ?? '' : sub(v));
          args.set(name, value);
          if (!declared.includes(name)) declared.push(name);
          meta(`ARG ${name}=${value}`);
        }
        continue;
      }
      case 'ENV': case 'LABEL': {
        const p = pairs(ins.args);
        if (!p || !p.pairs.length || p.pairs.some(([name]) => !name)) return fail(`failed to solve: dockerfile parse error on line ${ins.line}: ${ins.keyword} names can not be blank`, src(ins.line, ins.end));
        if (p.legacy) warnings.push(`LegacyKeyValueFormat: "${ins.keyword} key=value" should be used instead of legacy "${ins.keyword} key value" format (line ${ins.line})`);
        const set: string[] = [];
        for (const [name, v] of p.pairs) {
          const value = sub(v);
          if (ins.keyword === 'ENV') s.env = [...s.env.filter(e => e.slice(0, e.indexOf('=')) !== name), `${name}=${value}`];
          else s.labels[name] = value;
          set.push(`${name}=${value}`);
        }
        meta(`${ins.keyword} ${set.join(' ')}`);
        continue;
      }
      case 'EXPOSE': {
        const ports: number[] = [];
        for (const w of sub(ins.args).split(/\s+/).filter(Boolean)) {
          const m = /^(\d+)(?:\/(tcp|udp))?$/i.exec(w);
          if (!m || Number(m[1]) < 1 || Number(m[1]) > 65535) return fail(`failed to solve: invalid containerPort: ${w}`, src(ins.line, ins.end));
          if (m[2]?.toLowerCase() === 'udp') return fail('failed to solve: 模擬環境的 EXPOSE 只支援 TCP 的連接埠', src(ins.line, ins.end));
          ports.push(Number(m[1]));
        }
        s.expose = [...new Set([...s.expose, ...ports])];
        meta(`EXPOSE map[${[...new Set(ports)].map(p => `${p}/tcp`).sort().map(p => `${p}:{}`).join(' ')}]`);
        continue;
      }
      case 'CMD': case 'ENTRYPOINT': {
        const list = ins.json ?? ['/bin/sh', '-c', ins.args];
        if (!ins.json) warnings.push(`JSONArgsRecommended: JSON arguments recommended for ${ins.keyword} to prevent unintended behavior related to OS signals (line ${ins.line})`);
        // ENTRYPOINT resets a CMD the base image set (one set earlier in this stage stays).
        if (ins.keyword === 'CMD') { s.cmd = list; cmdSet = true; }
        else { s.entrypoint = list; if (!cmdSet) s.cmd = []; }
        meta(`${ins.keyword} ${goList(list)}`);
        continue;
      }
      case 'VOLUME': {
        // E22: VOLUME ["/data"] or VOLUME /data /logs: config only (each container gets an anonymous volume there).
        const paths = (ins.json ?? sub(ins.args).split(/\s+/).filter(Boolean)).map(p => sub(p));
        if (!paths.length) return fail(`failed to solve: dockerfile parse error on line ${ins.line}: VOLUME requires at least one argument`, src(ins.line, ins.end));
        if (paths.some(p => !p.startsWith('/'))) return fail(`failed to solve: 模擬環境的 VOLUME 需要絕對路徑（${paths.find(p => !p.startsWith('/'))}）`, src(ins.line, ins.end));
        s.volumes = [...new Set([...s.volumes, ...paths])];
        meta(`VOLUME [${paths.join(' ')}]`);
        continue;
      }
      case 'USER': {
        const u = sub(ins.args.trim());
        if (!u || /\s/.test(u)) return fail(`failed to solve: dockerfile parse error on line ${ins.line}: USER requires exactly one argument`, src(ins.line, ins.end));
        s.user = u;
        meta(`USER ${u}`);
        continue;
      }
    }
    // A filesystem step: its definition and cache key, then CACHED or run.
    k++;
    const flagText = Object.entries(ins.flags).map(([f, v]) => `--${f}=${v} `).join('');
    const label = `[${prefix}${k}/${total}] ${ins.keyword} ${flagText}${ins.args}`.replace(/\s+$/, '');
    const stepLabel = label.replace(/^\[[^\]]*\] /, '');
    const runEnv = vars();
    let def: string, createdBy: string;
    const plan: { from: string; to: string }[] = [];
    if (ins.keyword === 'WORKDIR') {
      const dir = resolvePath({ cwd: s.workdir, home: '/' }, sub(ins.args.trim()));
      def = `workdir\n${dir}`;
      createdBy = `WORKDIR ${dir}`;
      s.workdir = dir;
    } else if (ins.keyword === 'RUN') {
      // Build args reach RUN as environment variables (and its history line: |N NAME=value …).
      const argPrefix = declared.length ? `|${declared.length} ${declared.map(a => `${a}=${args.get(a) ?? ''}`).join(' ')} ` : '';
      def = `run\n${JSON.stringify(ins.json ?? ins.args)}\n${[...runEnv].map(([a, b]) => `${a}=${b}`).join('\n')}\n${s.workdir}\n${s.user}`;
      createdBy = ins.json ? `RUN ${argPrefix}${ins.json.join(' ')} # buildkit` : `RUN ${argPrefix}/bin/sh -c ${ins.args} # buildkit`;
    } else {
      // COPY and ADD: sources are context paths (globs; a folder copies its contents), the destination is relative to WORKDIR.
      const list = (ins.json ?? ins.args.split(/\s+/).filter(Boolean)).map(sub);
      if (list.length < 2) return fail(`failed to solve: dockerfile parse error on line ${ins.line}: ${ins.keyword} requires at least two arguments, but only one was provided. Destination could not be determined`, src(ins.line, ins.end));
      const dest = list.at(-1)!, sources = list.slice(0, -1);
      if (ins.keyword === 'ADD' && sources.some(x => /^(https?|git):\/\//.test(x) || /\.(tar|tar\.gz|tgz|tar\.xz|txz|tar\.bz2)$/.test(x)))
        return fail('failed to solve: ADD：模擬環境只支援複製本機的一般檔案（網址的下載與壓縮檔的自動解開不模擬；請用 COPY）', src(ins.line, ins.end));
      const destAbs = resolvePath({ cwd: s.workdir, home: '/' }, dest), into = (tail: string) => `${destAbs === '/' ? '' : destAbs}/${tail}`;
      // Several sources need a destination that ends with / (the Dockerfile's rule); one file goes into an existing folder too.
      const slash = dest.endsWith('/') || dest === '.', destDir = slash || s.nodes.get(destAbs)?.kind === 'dir';
      if (sources.length > 1 && !slash) return fail(`failed to solve: When using ${ins.keyword} with more than one source file, the destination must be a directory and end with a /`, src(ins.line, ins.end));
      let files = 0;
      for (const sp of sources) {
        const hits = [...context.keys()].filter(rel => copyMatch(sp, rel) !== undefined).sort();
        if (!hits.length) {
          const why = `failed to calculate checksum of ref ${refId(`${state.host}/${ctx}/${ins.line}/${sp}`)}: "/${sp.replace(/^\.?\/+/, '').replace(/\/+$/, '')}": not found`;
          block(label, [], `ERROR: ${why}`);
          steps.push({ label: stepLabel, cached: false });
          return fail(`failed to solve: failed to compute cache key: ${why}`, src(ins.line, ins.end), { name: label, lines: [] });
        }
        for (const rel of hits) {
          const tail = copyMatch(sp, rel)!, node = context.get(rel)!;
          if (tail === '' && node.kind === 'dir') { plan.push({ from: rel, to: destAbs }); continue; }
          if (tail !== '') { plan.push({ from: rel, to: into(tail) }); continue; }
          files++;
          plan.push({ from: rel, to: destDir ? into(rel.slice(rel.lastIndexOf('/') + 1)) : destAbs });
        }
      }
      if (files > 1 && !slash) return fail(`failed to solve: When using ${ins.keyword} with more than one source file, the destination must be a directory and end with a /`, src(ins.line, ins.end));
      const sums = plan.map(p => { const node = context.get(p.from)!; return `${p.from}\t${p.to}\t${node.kind}\t${node.mode.toString(8)}\t${node.kind === 'file' ? hex(node.content ?? '') : node.target ?? ''}`; });
      def = `${ins.keyword.toLowerCase()}\n${JSON.stringify(ins.flags)}\n${sums.join('\n')}`;
      createdBy = `${ins.keyword} ${flagText}${ins.args} # buildkit`;
    }
    const nextKey = hex(`${key}\n${def}`);
    const hit = o.noCache ? undefined : cache[nextKey];
    key = nextKey;
    if (hit) {
      s.nodes = new Map(hit.nodes); s.weights = new Map(hit.weights); if (hit.apt) s.apt = hit.apt;
      block(label, [], 'CACHED');
      steps.push({ label: stepLabel, cached: true });
      if (hit.diffId) { s.chain.push(chained(s.chain, hit.diffId)); s.rootfs.push(hit.diffId); s.layerSizes.push(hit.size); }
      s.history.push({ created: hit.created, createdBy, size: hit.size, empty: !hit.diffId, comment: 'buildkit.dockerfile.v0' });
      continue;
    }
    const before = s.nodes, run: RunIo = { log: [], seconds: 0 };
    s.nodes = new Map(s.nodes);
    let body: string[] = [];
    if (ins.keyword === 'WORKDIR') mkdirs(s.nodes, s.workdir);
    else if (ins.keyword !== 'RUN') {
      const owner = ins.flags.chown ? ins.flags.chown.split(':') : undefined;
      if (owner && !/^\d+$/.test(owner[0]) && !accountsOf(s.nodes).users.some(u => u.name === owner[0])) {
        const why = `unable to convert uid/gid chown string to host mapping: can't find uid for user ${owner[0]}: no such user: ${owner[0]}`;
        block(label, [], `ERROR: ${why}`);
        steps.push({ label: stepLabel, cached: false });
        return fail(`failed to solve: ${why}`, src(ins.line, ins.end), { name: label, lines: [] });
      }
      const mode = ins.flags.chmod ? parseInt(ins.flags.chmod, 8) : undefined;
      const own = owner ? { owner: owner[0], ...owner[1] && owner[1] !== owner[0] ? { group: owner[1] } : {} } : { owner: 'root' };
      for (const p of plan) {
        const node = context.get(p.from)!;
        mkdirs(s.nodes, parentOf(p.to));
        s.nodes.set(p.to, node.kind === 'dir' ? { kind: 'dir', mode: mode ?? node.mode, ...own } : node.kind === 'link' ? { kind: 'link', mode: 0o777, ...own, target: node.target ?? '' }
          : { kind: 'file', mode: mode ?? node.mode, ...own, content: node.content ?? '' });
      }
    } else {
      // RUN in a build container on the stage's files: the shell form is /bin/sh -c, so the image needs a shell.
      const process = ins.json ? ins.json.join(' ') : `/bin/sh -c ${ins.args}`;
      const own = base?.commands ?? [], hasSh = own.includes('sh'), distro = distroOf(base?.osRelease ?? '');
      const available = hasSh ? [...new Set([...own, ...RUN_FILE_COMMANDS, ...SPECIAL, ...['debian', 'ubuntu'].includes(distro) ? ['apt-get'] : []])] : own;
      const stop = (why: string, lines: readonly string[]) => { block(label, lines, `ERROR: ${why}`); steps.push({ label: stepLabel, cached: false }); return fail(`failed to solve: ${why}`, src(ins.line, ins.end), { name: label, lines }); };
      if (!ins.json && !hasSh) return stop(`process "${process}" did not complete successfully: runc run failed: unable to start container process: error during container init: exec: "/bin/sh": stat /bin/sh: no such file or directory: unknown`, []);
      const user = s.user || 'root';
      if (!userOf(s.nodes, user)) return stop(`process "${process}" did not complete successfully: unable to find user ${user}: no matching entries in passwd file`, []);
      const r: RunEnv = { stage: s, img: base, env: runEnv, user, packages: base?.packages ?? {}, available, alpine: isAlpine(base?.osRelease ?? '') };
      const status = runLine(r, ins.json ?? null, ins.args, run);
      const span = Math.max(0.1, run.seconds);
      body = run.log.map((l, i) => `${stamp(0.1 + (span * (i + 1)) / (run.log.length + 1))} ${l}`);
      if (status !== 0) return stop(`process "${process}" did not complete successfully: exit code: ${status}`, body);
      run.seconds = span + 0.2;
    }
    block(label, body, `DONE ${secs(run.seconds)}`);
    steps.push({ label: stepLabel, cached: false });
    // The step's layer (none when it changed nothing) and its entry in the build cache.
    const diff = diffOf(before, s.nodes, s.weights);
    if (diff.id) { s.chain.push(chained(s.chain, diff.id)); s.rootfs.push(diff.id); s.layerSizes.push(diff.size); newLayers++; }
    s.history.push({ created: now, createdBy, size: diff.size, empty: !diff.id, comment: 'buildkit.dockerfile.v0' });
    cache[nextKey] = { nodes: new Map(s.nodes), weights: new Map(s.weights), ...s.apt ? { apt: s.apt } : {}, created: now, size: diff.size, ...diff.id ? { diffId: diff.id } : {} };
  }
  // Config rows take the time of the step before them (the first step's when none): a build that only hits the cache
  // makes the same config, so the same image ID and CREATED time.
  const own = s.history.slice(inherited);
  for (let i = 0; i < own.length; i++) if (own[i].created < 0) own[i].created = own.slice(0, i).reverse().find(r => r.created >= 0)?.created ?? own.find(r => r.created >= 0)?.created ?? now;
  const created = own.length ? Math.max(...own.map(r => r.created)) : base?.created ?? now;
  const config = { env: s.env, cmd: s.cmd, entrypoint: s.entrypoint, workdir: s.workdir, expose: s.expose, user: s.user, labels: s.labels, rootfs: s.rootfs, history: s.history.map(r => [r.created, r.createdBy, r.size, r.empty]), created, ...s.volumes.length ? { volumes: s.volumes } : {} };
  const id = hex(`image-config/${JSON.stringify(config)}`);
  const kk = n++;
  show(`#${kk} exporting to image`);
  show(`#${kk} exporting layers ${newLayers ? `${secs(0.1 * newLayers)} ` : ''}done`);
  show(`#${kk} writing image sha256:${id} done`);
  for (const t of o.tags) show(`#${kk} naming to ${hooks.qualified(t)} done`);
  show(`#${kk} DONE ${secs(0.1 * Math.max(1, newLayers))}`);
  if (warnings.length) { show(''); show(` ${warnings.length} warning${warnings.length === 1 ? '' : 's'} found (use docker --debug to expand):`); warnings.forEach(w => show(` - ${w}`)); }
  if (o.quiet) io.out(`sha256:${id}`);
  // The main process: an image whose ENTRYPOINT and CMD are its base's behaves as the base does; otherwise the command runs.
  const same = !!base && JSON.stringify([...base.entrypoint, ...base.cmd]) === JSON.stringify([...s.entrypoint, ...s.cmd]);
  const img: DockerImage = {
    repo: '', tag: '', id, digest: '', size: s.layerSizes.reduce((a, b) => a + b, 0), created, cmd: s.cmd, entrypoint: s.entrypoint, env: s.env, workdir: s.workdir, expose: s.expose,
    ...same && base?.http ? { http: base.http } : {}, service: same && !!base?.service, logs: same ? [...base?.logs ?? []] : [], ...same && base?.output !== undefined ? { output: base.output } : {},
    exit: same ? base?.exit ?? 0 : 0, ...same && base?.stopExit !== undefined ? { stopExit: base.stopExit } : {}, commands: [...base?.commands ?? []], files: [], osRelease: base?.osRelease ?? '',
    layers: s.rootfs.length, local: true, pullable: false, built: true, nodes: s.nodes, weights: s.weights, history: s.history, rootfs: s.rootfs, chain: s.chain, user: s.user, labels: s.labels,
    ...base?.packages ? { packages: base.packages } : {}, ...s.apt ? { apt: s.apt } : {}, ...!same || base?.ownMain ? { ownMain: true } : {}, ...scratch ? { scratch: true } : {},
    ...s.volumes.length ? { volumes: s.volumes } : {},
  };
  // The tags move to the new image; an image left without a tag is dangling (<none> <none>).
  let images = [...d.images];
  for (const t of o.tags) {
    const old = images.find(i => i.local && !i.dangling && i.repo === t.repo && i.tag === t.tag);
    if (old?.id === id) continue;
    if (old) images = images.some(i => i !== old && i.local && !i.dangling && i.id === old.id) ? images.filter(i => i !== old) : images.map(i => i === old ? { ...i, dangling: true } : i);
    images = images.filter(i => !(i.dangling && i.id === id));
    images.push({ ...img, repo: t.repo, tag: t.tag });
  }
  if (!o.tags.length && !images.some(i => i.local && i.id === id)) images.push({ ...img, dangling: true });
  return { state: { ...state, docker: { ...d, images, buildCache: cache } }, status: 0, steps, id };
}
type Source = { text: string; name: string; from: number; to: number };
/** The part of a context path a COPY source names (its path under a folder source, '' for the source itself), or undefined. */
function copyMatch(source: string, rel: string): string | undefined {
  const s = source.replace(/^\.\//, '').replace(/\/+$/, '');
  if (s === '' || s === '.') return rel;
  const segs = s.split('/'), parts = rel.split('/');
  if (parts.length < segs.length) return undefined;
  for (let i = 0; i < segs.length; i++) if (!matchName(segs[i], parts[i])) return undefined;
  return parts.slice(segs.length).join('/');
}

/** BuildKit's source excerpt: the file and line, the lines around the instruction (>>> marks it). */
function printSource(s: { text: string; name: string; from: number; to: number }, show: (l: string) => void) {
  const lines = s.text.split('\n');
  let start = s.from, end = Math.min(s.to, lines.length);
  const pad = end === start ? 4 : 2;
  for (let p = 0; p < pad;) { if (start > 1) { start--; p++; } if (end !== lines.length) { end++; p++; } p++; }
  show(`${s.name}:${s.from}`);
  show('--------------------');
  for (let i = start; i <= end; i++) show(` ${String(i).padStart(3)} | ${i >= s.from && i <= s.to ? '>>>' : '   '} ${lines[i - 1]}`);
  show('--------------------');
}
