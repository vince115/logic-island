import { can, groupOf, groupsOf, isInside, modeString, parentOf, resolvePath, type FsNode, type FsState } from './fs';
import { accountsOf } from './accounts';
import { clockOf } from './processes';
import { fields } from './clock';
import { openWrite, OPEN_TEXT, readPath, walk } from './shell';

/*
 * Engine stage E22 (docs/curriculum/DKR0_CONTAINER_CAPABILITY.md §12): tar, enough for the volume backup pattern
 * (docker run --rm -v vol:/data -v $(pwd):/backup alpine tar czf /backup/x.tgz -C /data .) and for reading the backup
 * back: create (c), list (t) and extract (x), gzip (z) or not, -v, -f and -C, GNU tar 1.35's messages and listing. The
 * archive is a file of the simulated file system whose content is the simulation's own encoding of the members (their
 * names, kinds, modes, owners with their numeric IDs, times and contents), not the real ustar and gzip bytes: its size is
 * not a real archive's size. Reading detects gzip by itself, as GNU tar does.
 */

/** A member of an archive: its name (./a.txt; folders end in /), its kind, mode, owner and group (names and IDs), time and content. */
export interface TarMember { name: string; kind: 'file' | 'dir' | 'link'; mode: number; user: string; group: string; uid: number; gid: number; mtime: number; content?: string; target?: string }
export interface TarIo { out(data: string): void; err(line: string): void }

const GZIP = '\u001f\u008b\u0008\u0000';
const TAR = 'ustar\u0000';
const toBase64 = (text: string) => { const b = new TextEncoder().encode(text); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); };
const fromBase64 = (text: string) => { const s = atob(text), b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return new TextDecoder().decode(b); };
/** The archive's content (gzip: the gzip magic first, as file(1) would see it). */
export const encodeTar = (members: readonly TarMember[], gzip: boolean) => `${gzip ? GZIP : TAR}${toBase64(JSON.stringify(members))}`;
/** The members of an archive's content, or null when it is not one. */
export function decodeTar(content: string): { members: TarMember[]; gzip: boolean } | null {
  const gzip = content.startsWith(GZIP);
  if (!gzip && !content.startsWith(TAR)) return null;
  try { const v = JSON.parse(fromBase64(content.slice(gzip ? GZIP.length : TAR.length))) as unknown; return Array.isArray(v) ? { members: v as TarMember[], gzip } : null; } catch { return null; }
}

const TRY = "Try 'tar --help' or 'tar --usage' for more information.";
const MODES = "'-Acdtrux', '--delete' or '--test-label'";

/** tar [-]c|t|x[z][v]f ARCHIVE [-C DIR] [MEMBER…] (and the long options). */
export function tar(state0: FsState, args: readonly string[], io: TarIo): { state: FsState; status: number } {
  let state = state0;
  const fail = (lines: readonly string[], status = 2) => { lines.forEach(l => io.err(l)); return { state: state0, status }; };
  let mode: 'c' | 't' | 'x' | undefined, gzip = false, verbose = false, file: string | undefined, dir: string | undefined;
  const members: { name: string; dir?: string }[] = [];
  const words = [...args];
  // The old style: the first word's letters are options without a dash (tar czf x.tgz …).
  if (words[0] !== undefined && !words[0].startsWith('-') && /^[A-Za-z]+$/.test(words[0])) words[0] = `-${words[0]}`;
  const setMode = (m: 'c' | 't' | 'x') => { if (mode && mode !== m) return false; mode = m; return true; };
  const LONG: Record<string, () => boolean> = {
    '--create': () => setMode('c'), '--list': () => setMode('t'), '--extract': () => setMode('x'), '--get': () => setMode('x'),
    '--gzip': () => (gzip = true), '--gunzip': () => (gzip = true), '--ungzip': () => (gzip = true), '--verbose': () => (verbose = true),
  };
  for (let i = 0; i < words.length; i++) {
    const a = words[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('='), name = eq < 0 ? a : a.slice(0, eq), inline = eq < 0 ? undefined : a.slice(eq + 1);
      if (name === '--file' || name === '--directory') {
        const v = inline ?? words[++i];
        if (v === undefined) return fail([`tar: option '${name}' requires an argument`, TRY]);
        if (name === '--file') file = v; else dir = v;
        continue;
      }
      const f = LONG[name];
      if (!f) return fail([`tar: unrecognized option '${a}'`, TRY]);
      if (!f()) return fail([`tar: You may not specify more than one ${MODES} option`, TRY]);
      continue;
    }
    if (a.startsWith('-') && a.length > 1) {
      for (let k = 1; k < a.length; k++) {
        const ch = a[k];
        if (ch === 'c' || ch === 't' || ch === 'x') { if (!setMode(ch)) return fail([`tar: You may not specify more than one ${MODES} option`, TRY]); }
        else if (ch === 'z') gzip = true;
        else if (ch === 'v') verbose = true;
        else if (ch === 'f' || ch === 'C') {
          const v = k + 1 < a.length ? a.slice(k + 1) : words[++i];
          if (v === undefined) return fail([`tar: option requires an argument -- '${ch}'`, TRY]);
          if (ch === 'f') file = v; else dir = v;
          break;
        } else return fail([`tar: invalid option -- '${ch}'`, TRY]);
      }
      continue;
    }
    members.push({ name: a, ...dir !== undefined ? { dir } : {} });
  }
  void gzip;
  if (!mode) return fail([`tar: You must specify one of the ${MODES} options`, TRY]);
  if (file === undefined || file === '-') {
    if (mode === 'c') return fail(['tar: Refusing to write archive contents to terminal (missing -f option?)', 'tar: Error is not recoverable: exiting now']);
    return fail(['tar：模擬環境的 tar 需要 -f 封存檔（不讀標準輸入）']);
  }
  const acc = accountsOf(state), groups = groupsOf(state);
  const time = (t: number) => { const f = fields(t), two = (n: number) => String(n).padStart(2, '0'); return `${f.year}-${two(f.month + 1)}-${two(f.day)} ${two(f.hour)}:${two(f.minute)}`; };
  let width = 19;
  const show = (m: TarMember) => {
    if (!verbose) { io.out(`${m.name}\n`); return; }
    const size = String(m.kind === 'file' ? new TextEncoder().encode(m.content ?? '').length : 0), ug = `${m.user}/${m.group}`;
    // GNU tar's list.c: the owner/group and size columns share a width (ugswidth, 19 at first, growing as needed).
    width = Math.max(width, ug.length + 1 + size.length);
    io.out(`${modeString({ kind: m.kind, mode: m.mode, owner: m.user })} ${ug} ${size.padStart(width - ug.length - 1)} ${time(m.mtime)} ${m.name}${m.kind === 'link' ? ` -> ${m.target ?? ''}` : ''}\n`);
  };

  if (mode === 'c') {
    if (!members.length) return fail(['tar: Cowardly refusing to create an empty archive', TRY]);
    const nodes = new Map(state.nodes);
    // The archive is opened first (GNU tar writes it while it reads the members).
    const opened = openWrite(nodes, state, file, false);
    if ('error' in opened) return fail([`tar: ${file}: Cannot open: ${OPEN_TEXT[opened.error]}`, 'tar: Error is not recoverable: exiting now']);
    const archivePath = opened.path, now = clockOf(state).now, out: TarMember[] = [];
    let failed = false, warned = false;
    const uidOf = (name: string) => acc.users.find(u => u.name === name)?.uid ?? (/^\d+$/.test(name) ? Number(name) : 0);
    const gidOf = (name: string) => acc.groups.find(g => g.name === name)?.gid ?? (/^\d+$/.test(name) ? Number(name) : uidOf(name));
    const member = (name: string, node: FsNode): TarMember => ({
      name: node.kind === 'dir' && !name.endsWith('/') ? `${name}/` : name, kind: node.kind, mode: node.mode, user: node.owner, group: groupOf(node), uid: uidOf(node.owner), gid: gidOf(groupOf(node)),
      mtime: node.mtime ?? now, ...node.kind === 'file' ? { content: node.content ?? '' } : {}, ...node.kind === 'link' ? { target: node.target ?? '' } : {},
    });
    for (const m of members) {
      const base = m.dir === undefined ? state.cwd : resolvePath(state, m.dir);
      if (m.dir !== undefined && nodes.get(base)?.kind !== 'dir') return fail([`tar: ${m.dir}: Cannot open: No such file or directory`, 'tar: Error is not recoverable: exiting now']);
      let shown = m.name;
      if (shown.startsWith('/')) { if (!warned) io.err("tar: Removing leading `/' from member names"); warned = true; shown = shown.replace(/^\/+/, '') || '.'; }
      const abs = resolvePath({ ...state, cwd: base }, m.name);
      const w = walk({ ...state, nodes }, abs, false);
      if ('error' in w || !w.node) { io.err(`tar: ${m.name}: Cannot stat: ${'error' in w ? OPEN_TEXT[w.error] : 'No such file or directory'}`); failed = true; continue; }
      const add = (path: string, name: string) => {
        const node = nodes.get(path)!;
        if (path === archivePath) { io.err(`tar: ${name}: file is the archive; not dumped`); return; }
        if (node.kind === 'file' && !can(node, state.user, 'r', groups)) { io.err(`tar: ${name}: Cannot open: Permission denied`); failed = true; return; }
        const entry = member(name, node);
        out.push(entry);
        if (verbose) io.out(`${entry.name}\n`);
        if (node.kind !== 'dir') return;
        if (!can(node, state.user, 'r', groups) || !can(node, state.user, 'x', groups)) { io.err(`tar: ${name}: Cannot open: Permission denied`); failed = true; return; }
        const kids = [...nodes.keys()].filter(p => p !== path && parentOf(p) === path).sort();
        for (const k of kids) add(k, `${name.replace(/\/$/, '')}/${k.slice(path === '/' ? 1 : path.length + 1)}`);
      };
      add(w.path, shown);
    }
    if (archivePath) { const node = nodes.get(archivePath)!; nodes.set(archivePath, { ...node, content: encodeTar(out, gzip) }); }
    state = { ...state, nodes };
    if (failed) { io.err('tar: Exiting with failure status due to previous errors'); return { state, status: 2 }; }
    return { state, status: 0 };
  }

  // t and x read the archive (gzip or not: GNU tar recognizes it).
  const read = readPath(state, file);
  if ('error' in read) return fail([`tar: ${file}: Cannot open: ${read.error === 'EISDIR' ? 'Is a directory' : read.error === 'NOINPUT' ? 'No such file or directory' : OPEN_TEXT[read.error]}`, 'tar: Error is not recoverable: exiting now']);
  const archive = decodeTar(read.text);
  if (!archive) return fail(['tar: This does not look like a tar archive', 'tar: Exiting with failure status due to previous errors']);
  const wanted = (m: TarMember) => !members.length || members.some(x => { const n = x.name.replace(/\/$/, ''), mn = m.name.replace(/\/$/, ''); return mn === n || mn.startsWith(`${n}/`); });
  if (mode === 't') {
    archive.members.filter(wanted).forEach(show);
    return { state, status: 0 };
  }
  const base = dir === undefined ? state.cwd : resolvePath(state, dir);
  if (state.nodes.get(base)?.kind !== 'dir') return fail([`tar: ${dir}: Cannot open: No such file or directory`, 'tar: Error is not recoverable: exiting now']);
  const nodes = new Map(state.nodes), root = state.user === 'root';
  let failed = false;
  // As root, the archive's owners are kept (by name when this system has it, else the number); otherwise the files are the user's.
  const ownerOf = (m: TarMember) => {
    if (!root) return { owner: state.user };
    const user = acc.users.some(u => u.name === m.user) ? m.user : acc.users.find(u => u.uid === m.uid)?.name ?? String(m.uid);
    const group = acc.groups.some(g => g.name === m.group) ? m.group : acc.groups.find(g => g.gid === m.gid)?.name ?? String(m.gid);
    return { owner: user, ...group !== user ? { group } : {} };
  };
  for (const m of archive.members.filter(wanted)) {
    const name = m.name.replace(/\/$/, '') || '.';
    const path = resolvePath({ ...state, cwd: base }, name.replace(/^\/+/, ''));
    // x with one -v lists the names only (t -v is the long listing).
    if (verbose) io.out(`${m.name}\n`);
    if (!isInside(path, base)) continue;
    const parent = nodes.get(parentOf(path)), old = nodes.get(path);
    const writable = (n: FsNode | undefined) => !!n && can(n, state.user, 'w', groups) && can(n, state.user, 'x', groups);
    if (path !== base && (!parent || parent.kind !== 'dir' || (!root && !writable(parent) && !(m.kind === 'dir' && old?.kind === 'dir')))) {
      io.err(`tar: ${name}: Cannot ${m.kind === 'dir' ? 'mkdir' : 'open'}: ${parent ? 'Permission denied' : 'No such file or directory'}`); failed = true; continue;
    }
    if (m.kind === 'dir') {
      nodes.set(path, old?.kind === 'dir' && !root ? old : { kind: 'dir', mode: m.mode, ...ownerOf(m), mtime: m.mtime });
      continue;
    }
    if (old?.kind === 'dir') { io.err(`tar: ${name}: Cannot open: File exists`); failed = true; continue; }
    if (old && !root && !can(old, state.user, 'w', groups)) { io.err(`tar: ${name}: Cannot open: Permission denied`); failed = true; continue; }
    nodes.set(path, m.kind === 'link' ? { kind: 'link', mode: 0o777, ...ownerOf(m), target: m.target ?? '' } : { kind: 'file', mode: m.mode, ...ownerOf(m), content: m.content ?? '', mtime: m.mtime });
  }
  state = { ...state, nodes };
  if (failed) { io.err('tar: Exiting with failure status due to previous errors'); return { state, status: 2 }; }
  return { state, status: 0 };
}
