import { sha1 } from './tls';
import { fields, MONTHS, WEEKDAYS } from './clock';

/*
 * Engine stage E25 (docs/curriculum/CICD0_E25_GIT.md): the Git model. Real Git objects — blobs, trees, commits and annotated
 * tags — serialized exactly as Git writes them and named by the SHA-1 of `<type> <size>\0<body>` (sha1 of tls.ts), so a
 * commit of the same content, author, committer, time, zone and message has the same ID as in real Git. Pure functions
 * and data: the object store, trees, the history (ancestry, merge bases, the walk orders of git log), a port of xdiff's
 * Myers diff with its compaction and indent heuristic (unified diffs, --stat), the three-way line merge of xdiff (conflict
 * markers, the zealous refinement) and the commit graph of git log --graph (graph.c). The command line is git-cli*.ts; the
 * lesson data is git-lesson.ts and the checks git-checks.ts.
 */

export type Sha = string;
/** A file's mode in a tree or the index: a regular file, an executable, a symbolic link. */
export type FileMode = '100644' | '100755' | '120000';
export interface Ident { name: string; email: string; /** Unix seconds. */ time: number; /** '+0800' */ tz: string }
export interface TreeEntry { mode: FileMode | '40000'; name: string; id: Sha }
export type GitObject =
  | { type: 'blob'; data: string }
  | { type: 'tree'; entries: readonly TreeEntry[] }
  | { type: 'commit'; tree: Sha; parents: readonly Sha[]; author: Ident; committer: Ident; message: string }
  | { type: 'tag'; object: Sha; objectType: 'commit'; tag: string; tagger: Ident; message: string };
export type CommitObject = Extract<GitObject, { type: 'commit' }>;
export type TagObject = Extract<GitObject, { type: 'tag' }>;
/** A file of a tree, the index or the worktree: its blob and mode. */
export interface Entry { id: Sha; mode: FileMode }
export type Files = ReadonlyMap<string, Entry>;
export type Objects = ReadonlyMap<Sha, GitObject>;

export const EMPTY_BLOB = 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391';
export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
export const ZERO = '0'.repeat(40);

// ------------------------------------------------------------------------------------------------------- objects

const encoder = new TextEncoder();
export const utf8 = (s: string) => encoder.encode(s);
export const byteLength = (s: string) => utf8(s).length;
const hexOf = (b: Uint8Array) => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
const bytesOfHex = (h: string) => Uint8Array.from((h.match(/../g) ?? []).map(x => parseInt(x, 16)));
function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
export const identText = (i: Ident) => `${i.name} <${i.email}> ${i.time} ${i.tz}`;
/** The body of an object as Git serializes it (trees: `<mode> <name>\0<20 bytes>` per entry, in Git's order). */
export function objectBody(o: GitObject): Uint8Array {
  switch (o.type) {
    case 'blob': return utf8(o.data);
    case 'tree': return concat(o.entries.flatMap(e => [utf8(`${e.mode} ${e.name}\0`), bytesOfHex(e.id)]));
    case 'commit': return utf8(`tree ${o.tree}\n${o.parents.map(p => `parent ${p}\n`).join('')}author ${identText(o.author)}\ncommitter ${identText(o.committer)}\n\n${o.message}`);
    case 'tag': return utf8(`object ${o.object}\ntype ${o.objectType}\ntag ${o.tag}\ntagger ${identText(o.tagger)}\n\n${o.message}`);
  }
}
/** The object's ID: SHA-1 of `<type> <body length>\0<body>`. */
export function objectId(o: GitObject): Sha {
  const body = objectBody(o);
  return hexOf(sha1(concat([utf8(`${o.type} ${body.length}\0`), body])));
}
/** git cat-file -p: a tree as `<mode> <type> <id>\t<name>` lines (trees' mode 040000). */
export function prettyObject(o: GitObject): string {
  if (o.type === 'tree') return o.entries.map(e => `${e.mode === '40000' ? '040000' : e.mode} ${e.mode === '40000' ? 'tree' : 'blob'} ${e.id}\t${e.name}\n`).join('');
  return new TextDecoder().decode(objectBody(o));
}

/** Byte order of UTF-8 strings (Git's order of paths and tree entries). */
export function compareBytes(a: string, b: string): number {
  if (/^[\x00-\x7f]*$/.test(a + b)) return a < b ? -1 : a > b ? 1 : 0;
  const x = utf8(a), y = utf8(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
}
export const sortPaths = (paths: Iterable<string>) => [...paths].sort(compareBytes);

/** A mutable object store for one command: new objects are added by ID (the same content is the same object). */
export class Store {
  readonly added = new Map<Sha, GitObject>();
  constructor(readonly base: Objects) {}
  get(id: Sha): GitObject | undefined { return this.added.get(id) ?? this.base.get(id); }
  has(id: Sha) { return this.added.has(id) || this.base.has(id); }
  put(o: GitObject): Sha { const id = objectId(o); if (!this.has(id)) this.added.set(id, o); return id; }
  blob(data: string): Sha { return this.put({ type: 'blob', data }); }
  commit(id: Sha): CommitObject { const o = this.get(id); if (o?.type !== 'commit') throw new Error(`not a commit ${id}`); return o; }
  blobText(id: Sha): string { const o = this.get(id); return o?.type === 'blob' ? o.data : ''; }
  /** Every object (the base with what this command added). */
  all(): Map<Sha, GitObject> { return new Map([...this.base, ...this.added]); }
  ids(): Sha[] { return [...this.base.keys(), ...this.added.keys()]; }
}

/** Writes the trees of a flat list of files (path → blob and mode) and returns the root tree's ID. */
export function writeTree(store: Store, files: Files): Sha {
  const build = (prefix: string, paths: readonly string[]): Sha => {
    const groups = new Map<string, string[]>();
    const entries: TreeEntry[] = [];
    for (const p of paths) {
      const rest = p.slice(prefix.length), slash = rest.indexOf('/');
      if (slash < 0) { const e = files.get(p)!; entries.push({ mode: e.mode, name: rest, id: e.id }); continue; }
      const name = rest.slice(0, slash);
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name)!.push(p);
    }
    for (const [name, sub] of groups) entries.push({ mode: '40000', name, id: build(`${prefix}${name}/`, sub) });
    entries.sort((a, b) => compareBytes(a.name + (a.mode === '40000' ? '/' : ''), b.name + (b.mode === '40000' ? '/' : '')));
    return store.put({ type: 'tree', entries });
  };
  return build('', sortPaths(files.keys()));
}
/** The files of a tree, by path. */
export function readTree(store: Pick<Store, 'get'>, tree: Sha): Map<string, Entry> {
  const out = new Map<string, Entry>();
  const walk = (id: Sha, prefix: string) => {
    const t = store.get(id);
    if (t?.type !== 'tree') return;
    for (const e of t.entries) {
      if (e.mode === '40000') walk(e.id, `${prefix}${e.name}/`);
      else out.set(`${prefix}${e.name}`, { id: e.id, mode: e.mode });
    }
  };
  walk(tree, '');
  return out;
}
export const sameEntry = (a: Entry | undefined, b: Entry | undefined) => a === b || (!!a && !!b && a.id === b.id && a.mode === b.mode);

// ------------------------------------------------------------------------------------------------- text and dates

/** git's message clean-up for -m (whitespace mode): trailing spaces off every line, no leading or trailing blank lines, runs of blank lines as one, a final newline. */
export function stripspace(text: string): string {
  const lines = text.split('\n').map(l => l.replace(/[ \t\r\f\v]+$/, ''));
  const out: string[] = [];
  for (const l of lines) if (l || (out.length && out.at(-1) !== '')) out.push(l);
  while (out.length && out.at(-1) === '') out.pop();
  return out.length ? `${out.join('\n')}\n` : '';
}
/** %s: the first paragraph of the message on one line. */
export function subjectOf(message: string): string {
  const lines = message.split('\n');
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  const parts: string[] = [];
  for (; i < lines.length && lines[i].trim(); i++) parts.push(lines[i].trim());
  return parts.join(' ');
}
/** '+0800' as seconds east of UTC. */
export const tzSeconds = (tz: string) => { const m = /^([+-])(\d\d)(\d\d)$/.exec(tz); return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 3600 + Number(m[3]) * 60) : 0; };
const two = (n: number) => String(n).padStart(2, '0');
/** Git's default date format: `Fri Nov 20 9:00:00 2026 +0800` (day not padded), in the zone recorded with the time. */
export function gitDate(time: number, tz: string): string {
  const f = fields(time + tzSeconds(tz));
  return `${WEEKDAYS[f.weekday]} ${MONTHS[f.month]} ${f.day} ${two(f.hour)}:${two(f.minute)}:${two(f.second)} ${f.year} ${tz}`;
}

// ------------------------------------------------------------------------------------------------------- history

/** Every commit reachable from the tips (the tips included). */
export function reachable(store: Pick<Store, 'get'>, tips: Iterable<Sha>): Set<Sha> {
  const seen = new Set<Sha>(), stack = [...tips];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    const o = store.get(id);
    if (o?.type !== 'commit') continue;
    seen.add(id);
    stack.push(...o.parents);
  }
  return seen;
}
export const isAncestor = (store: Pick<Store, 'get'>, ancestor: Sha, of: Sha) => reachable(store, [of]).has(ancestor);
/** The best common ancestors (merge bases) of two commits: common ancestors that are not ancestors of another one. */
export function mergeBases(store: Pick<Store, 'get'>, a: Sha, b: Sha): Sha[] {
  const ra = reachable(store, [a]), common = [...reachable(store, [b])].filter(x => ra.has(x));
  const below = new Set<Sha>();
  for (const c of common) for (const p of (store.get(c) as CommitObject).parents) for (const x of reachable(store, [p])) below.add(x);
  return byDate(store, common.filter(c => !below.has(c)));
}
/** Commits newest first by committer time (ties keep their order). */
export function byDate(store: Pick<Store, 'get'>, ids: readonly Sha[]): Sha[] {
  return ids.map((id, i) => ({ id, i, t: (store.get(id) as CommitObject).committer.time })).sort((x, y) => y.t - x.t || x.i - y.i).map(x => x.id);
}
/** How many commits each side has that the other has not (git's ahead/behind). */
export function aheadBehind(store: Pick<Store, 'get'>, ours: Sha, theirs: Sha): { ahead: number; behind: number } {
  const a = reachable(store, [ours]), b = reachable(store, [theirs]);
  return { ahead: [...a].filter(x => !b.has(x)).length, behind: [...b].filter(x => !a.has(x)).length };
}

/**
 * The commits git log lists: reachable from the included tips and not from the excluded ones, in the walk's order — by
 * committer date, newest first, ties in the order they were reached (git's date-ordered priority queue); with topo (log
 * --graph), git's sort_in_topological_order with a LIFO queue, so a commit's last parent's line comes first.
 */
export function walk(store: Pick<Store, 'get'>, include: readonly Sha[], exclude: readonly Sha[] = [], topo = false): Sha[] {
  const hidden = reachable(store, exclude);
  const queue: { id: Sha; t: number; n: number }[] = [];
  let counter = 0;
  const seen = new Set<Sha>();
  const push = (id: Sha) => {
    if (seen.has(id) || hidden.has(id)) return;
    const o = store.get(id);
    if (o?.type !== 'commit') return;
    seen.add(id);
    queue.push({ id, t: o.committer.time, n: counter++ });
  };
  include.forEach(push);
  const order: Sha[] = [];
  while (queue.length) {
    let best = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i].t > queue[best].t || (queue[i].t === queue[best].t && queue[i].n < queue[best].n)) best = i;
    const [next] = queue.splice(best, 1);
    order.push(next.id);
    (store.get(next.id) as CommitObject).parents.forEach(push);
  }
  if (!topo) return order;
  // sort_in_topological_order (REV_SORT_IN_GRAPH_ORDER): indegree counts the children in the list; tips start the stack.
  const inList = new Set(order), indegree = new Map<Sha, number>(order.map(id => [id, 1]));
  for (const id of order) for (const p of (store.get(id) as CommitObject).parents) if (inList.has(p)) indegree.set(p, indegree.get(p)! + 1);
  const stack = order.filter(id => indegree.get(id) === 1).reverse();
  const out: Sha[] = [];
  while (stack.length) {
    const id = stack.pop()!;
    for (const p of (store.get(id) as CommitObject).parents) {
      const d = indegree.get(p);
      if (!d) continue;
      indegree.set(p, d - 1);
      if (d - 1 === 1) stack.push(p);
    }
    indegree.set(id, 0);
    out.push(id);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- diff (xdiff port)

/** The lines of a text with their newlines (the last line may have none). */
export const splitLines = (text: string): string[] => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];

/** One change of an edit script: chg1 lines at i1 of the old file become chg2 lines at i2 of the new one (0-based). */
export interface Change { i1: number; i2: number; chg1: number; chg2: number }

const bogosqrt = (n: number) => { let i = 1; for (; n > 0; n >>= 2) i <<= 1; return i; };

/** Marks changed lines like xdiff's prepare + Myers (xdl_recs_cmp/xdl_split, no cost heuristics), without compaction. */
function myersMarks(a: readonly string[], b: readonly string[]): { r1: Uint8Array; r2: Uint8Array } {
  // rchg arrays carry a 0 sentinel on each side (index + 1).
  const r1 = new Uint8Array(a.length + 2), r2 = new Uint8Array(b.length + 2);
  // xdl_trim_ends
  let start = 0;
  const lim = Math.min(a.length, b.length);
  while (start < lim && a[start] === b[start]) start++;
  let tail = 0;
  while (tail < lim - start && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const end1 = a.length - tail - 1, end2 = b.length - tail - 1;
  // xdl_cleanup_records: lines with no match on the other side are changes; lines with very many matches may be.
  const count = (lines: readonly string[]) => { const m = new Map<string, number>(); for (const l of lines) m.set(l, (m.get(l) ?? 0) + 1); return m; };
  const inA = count(a), inB = count(b);
  const keep = (lines: readonly string[], other: Map<string, number>, s: number, e: number, rchg: Uint8Array): number[] => {
    const mlim = Math.min(bogosqrt(lines.length), 1024);
    const dis = new Map<number, number>();
    for (let i = s; i <= e; i++) { const nm = other.get(lines[i]) ?? 0; dis.set(i, nm === 0 ? 0 : nm >= mlim ? 2 : 1); }
    const kept: number[] = [];
    for (let i = s; i <= e; i++) {
      const d = dis.get(i)!;
      if (d === 1 || (d === 2 && !cleanMmatch(dis, i, s, e))) kept.push(i);
      else rchg[i + 1] = 1;
    }
    return kept;
  };
  const k1 = keep(a, inB, start, end1, r1), k2 = keep(b, inA, start, end2, r2);
  const h1 = k1.map(i => a[i]), h2 = k2.map(i => b[i]);
  recsCmp(h1, 0, h1.length, h2, 0, h2.length, k1, k2, r1, r2);
  return { r1, r2 };
}
/** xhistogram.c: the histogram diff merge-ort uses (lines are 1-based here, as there), falling back to Myers when every common line is too frequent. */
function histogramMarks(a: readonly string[], b: readonly string[]): { r1: Uint8Array; r2: Uint8Array } {
  const r1 = new Uint8Array(a.length + 2), r2 = new Uint8Array(b.length + 2);
  const run = (line1: number, count1: number, line2: number, count2: number): void => {
    for (;;) {
      if (count1 <= 0 && count2 <= 0) return;
      if (!count1) { while (count2--) r2[line2++] = 1; return; }
      if (!count2) { while (count1--) r1[line1++] = 1; return; }
      const end1 = line1 + count1 - 1, end2 = line2 + count2 - 1;
      type Rec = { ptr: number; cnt: number };
      const recs = new Map<string, Rec>(), nextPtr = new Map<number, number>(), lineMap = new Map<number, Rec>();
      for (let ptr = end1; ptr >= line1; ptr--) {
        const rec = recs.get(a[ptr - 1]);
        if (rec) { nextPtr.set(ptr, rec.ptr); rec.ptr = ptr; rec.cnt++; lineMap.set(ptr, rec); }
        else { const fresh = { ptr, cnt: 1 }; recs.set(a[ptr - 1], fresh); lineMap.set(ptr, fresh); }
      }
      let cnt = 65, hasCommon = false;
      const lcs = { begin1: 0, end1: 0, begin2: 0, end2: 0 };
      for (let bPtr = line2; bPtr <= end2;) {
        let bNext = bPtr + 1;
        const rec = recs.get(b[bPtr - 1]);
        if (rec && rec.cnt > cnt) hasCommon = true;
        else if (rec) {
          hasCommon = true;
          let as = rec.ptr;
          for (;;) {
            let np = nextPtr.get(as) ?? 0, bs = bPtr, ae = as, be = bs, rc = rec.cnt;
            while (line1 < as && line2 < bs && a[as - 2] === b[bs - 2]) { as--; bs--; if (1 < rc) rc = Math.min(rc, lineMap.get(as)!.cnt); }
            while (ae < end1 && be < end2 && a[ae] === b[be]) { ae++; be++; if (1 < rc) rc = Math.min(rc, lineMap.get(ae)!.cnt); }
            if (bNext <= be) bNext = be + 1;
            if (lcs.end1 - lcs.begin1 < ae - as || rc < cnt) { lcs.begin1 = as; lcs.begin2 = bs; lcs.end1 = ae; lcs.end2 = be; cnt = rc; }
            if (np === 0) break;
            let stop = false;
            while (np <= ae) { np = nextPtr.get(np) ?? 0; if (np === 0) { stop = true; break; } }
            if (stop) break;
            as = np;
          }
        }
        bPtr = bNext;
      }
      if (hasCommon && 64 < cnt) {
        const sub = myersMarks(a.slice(line1 - 1, end1), b.slice(line2 - 1, end2));
        for (let i = 0; i < count1; i++) r1[line1 + i] = sub.r1[i + 1];
        for (let i = 0; i < count2; i++) r2[line2 + i] = sub.r2[i + 1];
        return;
      }
      if (lcs.begin1 === 0 && lcs.begin2 === 0) {
        while (count1--) r1[line1++] = 1;
        while (count2--) r2[line2++] = 1;
        return;
      }
      run(line1, lcs.begin1 - line1, line2, lcs.begin2 - line2);
      count1 = end1 - lcs.end1; line1 = lcs.end1 + 1;
      count2 = end2 - lcs.end2; line2 = lcs.end2 + 1;
    }
  };
  run(1, a.length, 1, b.length);
  return { r1, r2 };
}
/** Changed lines with xdl_change_compact: Myers with the indent heuristic for git diff, histogram without it for merges (merge-ort). */
function changedLines(a: readonly string[], b: readonly string[], forMerge: boolean): { r1: Uint8Array; r2: Uint8Array } {
  const { r1, r2 } = forMerge ? histogramMarks(a, b) : myersMarks(a, b);
  compact(a, b, r1, r2, !forMerge);
  compact(b, a, r2, r1, !forMerge);
  return { r1, r2 };
}
function cleanMmatch(dis: Map<number, number>, i: number, s0: number, e0: number): boolean {
  const s = i - s0 > 100 ? i - 100 : s0, e = e0 - i > 100 ? i + 100 : e0;
  let r: number, rdis0 = 0, rpdis0 = 1;
  for (r = 1; i - r >= s; r++) { const d = dis.get(i - r)!; if (!d) rdis0++; else if (d === 2) rpdis0++; else break; }
  if (rdis0 === 0) return false;
  let rdis1 = 0, rpdis1 = 1;
  for (r = 1; i + r <= e; r++) { const d = dis.get(i + r)!; if (!d) rdis1++; else if (d === 2) rpdis1++; else break; }
  if (rdis1 === 0) return false;
  rdis1 += rdis0; rpdis1 += rpdis0;
  return rpdis1 * 4 < rpdis1 + rdis1;
}
function recsCmp(h1: readonly string[], off1: number, lim1: number, h2: readonly string[], off2: number, lim2: number, x1: readonly number[], x2: readonly number[], r1: Uint8Array, r2: Uint8Array): void {
  while (off1 < lim1 && off2 < lim2 && h1[off1] === h2[off2]) { off1++; off2++; }
  while (off1 < lim1 && off2 < lim2 && h1[lim1 - 1] === h2[lim2 - 1]) { lim1--; lim2--; }
  if (off1 === lim1) { for (; off2 < lim2; off2++) r2[x2[off2] + 1] = 1; return; }
  if (off2 === lim2) { for (; off1 < lim1; off1++) r1[x1[off1] + 1] = 1; return; }
  const [s1, s2] = split(h1, off1, lim1, h2, off2, lim2);
  recsCmp(h1, off1, s1, h2, off2, s2, x1, x2, r1, r2);
  recsCmp(h1, s1, lim1, h2, s2, lim2, x1, x2, r1, r2);
}
/** xdl_split: the middle snake of the box (forward and backward diagonals). */
function split(h1: readonly string[], off1: number, lim1: number, h2: readonly string[], off2: number, lim2: number): [number, number] {
  const dmin = off1 - lim2, dmax = lim1 - off2, fmid = off1 - off2, bmid = lim1 - lim2, odd = ((fmid - bmid) & 1) !== 0;
  const kf = new Map<number, number>(), kb = new Map<number, number>();
  const F = (d: number) => kf.get(d) ?? -1, B = (d: number) => kb.get(d) ?? Number.MAX_SAFE_INTEGER;
  let fmin = fmid, fmax = fmid, bmin = bmid, bmax = bmid;
  kf.set(fmid, off1); kb.set(bmid, lim1);
  for (;;) {
    if (fmin > dmin) kf.set(--fmin - 1, -1); else ++fmin;
    if (fmax < dmax) kf.set(++fmax + 1, -1); else --fmax;
    for (let d = fmax; d >= fmin; d -= 2) {
      let i1 = F(d - 1) >= F(d + 1) ? F(d - 1) + 1 : F(d + 1);
      let i2 = i1 - d;
      while (i1 < lim1 && i2 < lim2 && h1[i1] === h2[i2]) { i1++; i2++; }
      kf.set(d, i1);
      if (odd && bmin <= d && d <= bmax && B(d) <= i1) return [i1, i2];
    }
    if (bmin > dmin) kb.set(--bmin - 1, Number.MAX_SAFE_INTEGER); else ++bmin;
    if (bmax < dmax) kb.set(++bmax + 1, Number.MAX_SAFE_INTEGER); else --bmax;
    for (let d = bmax; d >= bmin; d -= 2) {
      let i1 = B(d - 1) < B(d + 1) ? B(d - 1) : B(d + 1) - 1;
      let i2 = i1 - d;
      while (i1 > off1 && i2 > off2 && h1[i1 - 1] === h2[i2 - 1]) { i1--; i2--; }
      kb.set(d, i1);
      if (!odd && fmin <= d && d <= fmax && i1 <= F(d)) return [i1, i2];
    }
  }
}

// xdl_change_compact with the indent heuristic (on by default since Git 2.14).
type Group = { start: number; end: number };
const isSpace = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v';
function indentOf(line: string): number {
  let ret = 0;
  for (const c of line) {
    if (!isSpace(c)) return ret;
    if (c === ' ') ret += 1; else if (c === '\t') ret += 8 - ret % 8;
    if (ret >= 200) return 200;
  }
  return -1;
}
interface Split { endOfFile: boolean; indent: number; preBlank: number; preIndent: number; postBlank: number; postIndent: number }
function measure(recs: readonly string[], at: number): Split {
  const m: Split = { endOfFile: at >= recs.length, indent: at >= recs.length ? -1 : indentOf(recs[at]), preBlank: 0, preIndent: -1, postBlank: 0, postIndent: -1 };
  for (let i = at - 1; i >= 0; i--) { m.preIndent = indentOf(recs[i]); if (m.preIndent !== -1) break; m.preBlank++; if (m.preBlank === 20) { m.preIndent = 0; break; } }
  for (let i = at + 1; i < recs.length; i++) { m.postIndent = indentOf(recs[i]); if (m.postIndent !== -1) break; m.postBlank++; if (m.postBlank === 20) { m.postIndent = 0; break; } }
  return m;
}
function addScore(m: Split, s: { effective: number; penalty: number }) {
  if (m.preIndent === -1 && m.preBlank === 0) s.penalty += 1;
  if (m.endOfFile) s.penalty += 21;
  const postBlank = m.indent === -1 ? 1 + m.postBlank : 0, totalBlank = m.preBlank + postBlank;
  s.penalty += -30 * totalBlank + 6 * postBlank;
  const indent = m.indent !== -1 ? m.indent : m.postIndent, anyBlanks = totalBlank !== 0;
  s.effective += indent;
  if (indent === -1 || m.preIndent === -1) return;
  if (indent > m.preIndent) s.penalty += anyBlanks ? 10 : -4;
  else if (indent === m.preIndent) return;
  else if (m.postIndent !== -1 && m.postIndent > indent) s.penalty += anyBlanks ? 17 : 24;
  else s.penalty += anyBlanks ? 17 : 23;
}
function compact(recs: readonly string[], other: readonly string[], rchg: Uint8Array, ochg: Uint8Array, heuristic: boolean): void {
  const n = recs.length, on = other.length;
  const R = (i: number) => rchg[i + 1], setR = (i: number, v: number) => { rchg[i + 1] = v; };
  const O = (i: number) => ochg[i + 1];
  const init = (c: (i: number) => number): Group => { const g = { start: 0, end: 0 }; while (c(g.end)) g.end++; return g; };
  const next = (g: Group, c: (i: number) => number, len: number) => { if (g.end === len) return false; g.start = g.end + 1; for (g.end = g.start; c(g.end); g.end++); return true; };
  const previous = (g: Group, c: (i: number) => number) => { if (g.start === 0) return false; g.end = g.start - 1; for (g.start = g.end; c(g.start - 1); g.start--); return true; };
  const slideDown = (g: Group) => {
    if (g.end < n && recs[g.start] === recs[g.end]) { setR(g.start++, 0); setR(g.end++, 1); while (R(g.end)) g.end++; return true; }
    return false;
  };
  const slideUp = (g: Group) => {
    if (g.start > 0 && recs[g.start - 1] === recs[g.end - 1]) { setR(--g.start, 1); setR(--g.end, 0); while (R(g.start - 1)) g.start--; return true; }
    return false;
  };
  const g = init(R), go = init(O);
  for (;;) {
    if (g.end !== g.start) {
      let groupsize: number, earliestEnd: number, endMatchingOther: number;
      do {
        groupsize = g.end - g.start;
        endMatchingOther = -1;
        while (slideUp(g)) previous(go, O);
        earliestEnd = g.end;
        if (go.end > go.start) endMatchingOther = g.end;
        for (;;) {
          if (!slideDown(g)) break;
          next(go, O, on);
          if (go.end > go.start) endMatchingOther = g.end;
        }
      } while (groupsize !== g.end - g.start);
      if (g.end === earliestEnd) { /* it cannot move */ }
      else if (endMatchingOther !== -1) {
        while (go.end === go.start) { slideUp(g); previous(go, O); }
      } else if (heuristic) {
        let shift = Math.max(earliestEnd, g.end - groupsize - 1, g.end - 100), bestShift = -1;
        let best = { effective: 0, penalty: 0 };
        for (; shift <= g.end; shift++) {
          const score = { effective: 0, penalty: 0 };
          addScore(measure(recs, shift), score);
          addScore(measure(recs, shift - groupsize), score);
          const cmp = 60 * (Math.sign(score.effective - best.effective)) + (score.penalty - best.penalty);
          if (bestShift === -1 || cmp <= 0) { best = score; bestShift = shift; }
        }
        while (g.end > bestShift) { slideUp(g); previous(go, O); }
      }
    }
    if (!next(g, R, n)) break;
    next(go, O, on);
  }
}

/** xdiff's edit script of two lists of lines (forMerge: merge-ort's histogram diff without the indent heuristic). */
export function diffLines(a: readonly string[], b: readonly string[], forMerge = false): Change[] {
  const { r1, r2 } = changedLines(a, b, forMerge);
  const out: Change[] = [];
  for (let i1 = a.length, i2 = b.length; i1 >= 0 || i2 >= 0; i1--, i2--) {
    if (r1[i1] || r2[i2]) {
      const l1 = i1, l2 = i2;
      while (r1[i1]) i1--;
      while (r2[i2]) i2--;
      out.unshift({ i1, i2, chg1: l1 - i1, chg2: l2 - i2 });
    }
  }
  return out;
}

/** Lines added and removed between two texts. */
export function lineCounts(a: string, b: string): { added: number; removed: number } {
  const ch = diffLines(splitLines(a), splitLines(b));
  return { added: ch.reduce((n, c) => n + c.chg2, 0), removed: ch.reduce((n, c) => n + c.chg1, 0) };
}

const funcLine = (line: string) => /^[A-Za-z_$]/.test(line) ? line.replace(/\n$/, '').slice(0, 80).replace(/\s+$/, '') : undefined;
/** The hunks of a unified diff (3 lines of context, xdiff's hunk headers with the function line). */
export function unifiedHunks(a: string, b: string): string[] {
  const x = splitLines(a), y = splitLines(b), script = diffLines(x, y), out: string[] = [];
  const line = (sign: string, text: string) => { out.push(sign + text.replace(/\n$/, '')); if (!text.endsWith('\n')) out.push('\\ No newline at end of file'); };
  let func = '', funcPrev = -1;
  for (let k = 0; k < script.length;) {
    let last = k;
    while (last + 1 < script.length && script[last + 1].i1 - (script[last].i1 + script[last].chg1) <= 6) last++;
    const first = script[k], end = script[last];
    const s1 = Math.max(first.i1 - 3, 0), s2 = Math.max(first.i2 - 3, 0);
    const e1 = Math.min(end.i1 + end.chg1 + 3, x.length), e2 = Math.min(end.i2 + end.chg2 + 3, y.length);
    for (let l = s1 - 1; l !== funcPrev && l >= 0 && l < x.length; l--) { const f = funcLine(x[l]); if (f !== undefined) { func = f; break; } }
    funcPrev = s1 - 1;
    const c1 = e1 - s1, c2 = e2 - s2;
    const range = (s: number, c: number) => `${c ? s + 1 : s}${c !== 1 ? `,${c}` : ''}`;
    out.push(`@@ -${range(s1, c1)} +${range(s2, c2)} @@${func ? ` ${func}` : ''}`);
    let i1 = s1;
    for (let j = k; j <= last; j++) {
      const c = script[j];
      for (; i1 < c.i1; i1++) line(' ', x[i1]);
      for (let i = 0; i < c.chg1; i++) line('-', x[c.i1 + i]);
      for (let i = 0; i < c.chg2; i++) line('+', y[c.i2 + i]);
      i1 = c.i1 + c.chg1;
    }
    for (; i1 < e1; i1++) line(' ', x[i1]);
    k = last + 1;
  }
  return out;
}

// --------------------------------------------------------------------------------------------- three-way merge

export interface MergeResult { text: string; conflicts: number }
interface MergePart { mode: number; i0: number; chg0: number; i1: number; chg1: number; i2: number; chg2: number }

/**
 * xdiff's three-way merge (XDL_MERGE_ZEALOUS, the merge style): the changes of each side against the base; changes that
 * overlap or touch are a conflict, refined by diffing the two sides inside it (identical changes merge cleanly, common
 * lines are left out of the markers) and conflicts at most three lines apart joined. Markers are <<<<<<< ours, =======,
 * >>>>>>> theirs.
 */
export function merge3(base: string, ours: string, theirs: string, oursName: string, theirsName: string): MergeResult {
  const b = splitLines(base), o = splitLines(ours), t = splitLines(theirs);
  const x1 = diffLines(b, o, true), x2 = diffLines(b, t, true);
  const parts: MergePart[] = [];
  const append = (mode: number, i0: number, chg0: number, i1: number, chg1: number, i2: number, chg2: number) => {
    const m = parts.at(-1);
    if (m && (i1 <= m.i1 + m.chg1 || i2 <= m.i2 + m.chg2)) {
      if (mode !== m.mode) m.mode = 0;
      m.chg0 = i0 + chg0 - m.i0; m.chg1 = i1 + chg1 - m.i1; m.chg2 = i2 + chg2 - m.i2;
    } else parts.push({ mode, i0, chg0, i1, chg1, i2, chg2 });
  };
  let p = 0, q = 0;
  while (p < x1.length && q < x2.length) {
    const s1 = x1[p], s2 = x2[q];
    if (s1.i1 + s1.chg1 < s2.i1) { append(1, s1.i1, s1.chg1, s1.i2, s1.chg2, s2.i2 - s2.i1 + s1.i1, s1.chg1); p++; continue; }
    if (s2.i1 + s2.chg1 < s1.i1) { append(2, s2.i1, s2.chg1, s1.i2 - s1.i1 + s2.i1, s2.chg1, s2.i2, s2.chg2); q++; continue; }
    const same = s1.i1 === s2.i1 && s1.chg1 === s2.chg1 && s1.chg2 === s2.chg2 && o.slice(s1.i2, s1.i2 + s1.chg2).every((l, i) => l === t[s2.i2 + i]);
    if (!same) {
      const off = s1.i1 - s2.i1, ffo = off + s1.chg1 - s2.chg1;
      let i0 = s1.i1, i1 = s1.i2, i2 = s2.i2;
      if (off > 0) { i0 -= off; i1 -= off; } else i2 += off;
      let chg0 = s1.i1 + s1.chg1 - i0, chg1 = s1.i2 + s1.chg2 - i1, chg2 = s2.i2 + s2.chg2 - i2;
      if (ffo < 0) { chg0 -= ffo; chg1 -= ffo; } else chg2 += ffo;
      append(0, i0, chg0, i1, chg1, i2, chg2);
    }
    const e1 = s1.i1 + s1.chg1, e2 = s2.i1 + s2.chg1;
    if (e1 >= e2) q++;
    if (e2 >= e1) p++;
  }
  for (; p < x1.length; p++) { const s = x1[p]; append(1, s.i1, s.chg1, s.i2, s.chg2, s.i1 + t.length - b.length, s.chg1); }
  for (; q < x2.length; q++) { const s = x2[q]; append(2, s.i1, s.chg1, s.i1 + o.length - b.length, s.chg1, s.i2, s.chg2); }
  // xdl_refine_conflicts: a conflict becomes the changes between its two sides (none: they agree).
  const refined: MergePart[] = [];
  for (const m of parts) {
    if (m.mode !== 0 || m.chg1 === 0 || m.chg2 === 0) { refined.push(m); continue; }
    const inner = diffLines(o.slice(m.i1, m.i1 + m.chg1), t.slice(m.i2, m.i2 + m.chg2), true);
    if (!inner.length) { refined.push({ ...m, mode: 4 }); continue; }
    for (const c of inner) refined.push({ ...m, i1: m.i1 + c.i1, chg1: c.chg1, i2: m.i2 + c.i2, chg2: c.chg2 });
  }
  // xdl_simplify_non_conflicts: conflicts at most three lines apart become one.
  const merged: MergePart[] = [];
  for (const m of refined) {
    const prev = merged.at(-1);
    if (prev && prev.mode === 0 && m.mode === 0 && m.i1 - (prev.i1 + prev.chg1) <= 3) {
      prev.chg0 = m.i0 + m.chg0 - prev.i0; prev.chg1 = m.i1 + m.chg1 - prev.i1; prev.chg2 = m.i2 + m.chg2 - prev.i2;
    } else merged.push({ ...m });
  }
  let text = '', i = 0, conflicts = 0;
  const copy = (lines: readonly string[], from: number, n: number, nl = false) => {
    const part = lines.slice(from, from + n).join('');
    return nl && part && !part.endsWith('\n') ? `${part}\n` : part;
  };
  for (const m of merged) {
    if (m.mode === 0) {
      conflicts++;
      text += copy(o, i, m.i1 - i) + `<<<<<<< ${oursName}\n` + copy(o, m.i1, m.chg1, true) + '=======\n' + copy(t, m.i2, m.chg2, true) + `>>>>>>> ${theirsName}\n`;
    } else if (m.mode & 3) {
      text += copy(o, i, m.i1 - i);
      if (m.mode & 1) text += copy(o, m.i1, m.chg1, (m.mode & 2) !== 0);
      if (m.mode & 2) text += copy(t, m.i2, m.chg2);
    } else continue;
    i = m.i1 + m.chg1;
  }
  text += copy(o, i, o.length - i);
  return { text, conflicts };
}

// ---------------------------------------------------------------------------------------------------- .gitignore

export interface IgnoreRule { base: string; negate: boolean; dirOnly: boolean; re: RegExp; basename: boolean }
function globRegExp(pattern: string): string {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        const atStart = i === 0 || pattern[i - 1] === '/', after = pattern[i + 2];
        if (atStart && (after === '/' || after === undefined)) { re += after === '/' ? '(?:.*/)?' : '.*'; i += after === '/' ? 2 : 1; continue; }
      }
      re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '[') {
      const close = pattern.indexOf(']', i + 2);
      if (close < 0) { re += '\\['; continue; }
      let body = pattern.slice(i + 1, close);
      if (body.startsWith('!')) body = `^${body.slice(1)}`;
      re += `[${body.replace(/\\/g, '\\\\')}]`;
      i = close;
    } else if (c === '\\' && i + 1 < pattern.length) re += `\\${pattern[++i]}`;
    else re += /[.+^${}()|\]\\/]/.test(c) ? `\\${c}` : c;
  }
  return re;
}
/** The rules of one .gitignore (base: its folder relative to the worktree, '' or 'a/b/'). */
export function parseIgnore(text: string, base: string): IgnoreRule[] {
  const rules: IgnoreRule[] = [];
  for (const raw of text.split('\n')) {
    let line = raw.replace(/(?<!\\)\s+$/, '');
    if (!line || line.startsWith('#')) continue;
    const negate = line.startsWith('!');
    if (negate) line = line.slice(1);
    if (line.startsWith('\\#') || line.startsWith('\\!')) line = line.slice(1);
    const dirOnly = line.endsWith('/');
    if (dirOnly) line = line.slice(0, -1);
    if (!line) continue;
    const basename = !line.includes('/');
    if (line.startsWith('/')) line = line.slice(1);
    rules.push({ base, negate, dirOnly, basename, re: new RegExp(`^${globRegExp(line)}$`) });
  }
  return rules;
}
/** Whether a path (relative to the worktree) is ignored: the last matching rule decides, an ignored folder ignores everything in it. */
export function isIgnored(rules: readonly IgnoreRule[], path: string, dir = false): boolean {
  const parts = path.split('/');
  for (let k = 1; k < parts.length; k++) if (matchIgnore(rules, parts.slice(0, k).join('/'), true)) return true;
  return matchIgnore(rules, path, dir);
}
function matchIgnore(rules: readonly IgnoreRule[], path: string, dir: boolean): boolean {
  let result = false;
  for (const r of rules) {
    if (!path.startsWith(r.base)) continue;
    if (r.dirOnly && !dir) continue;
    const rel = path.slice(r.base.length);
    if (r.basename ? r.re.test(rel.slice(rel.lastIndexOf('/') + 1)) : r.re.test(rel)) result = !r.negate;
  }
  return result;
}

// ------------------------------------------------------------------------------------- git log --graph (graph.c)

type Column = Sha;
enum GraphState { Padding, Skip, PreCommit, Commit, PostMerge, Collapsing }

/** A port of Git's graph.c for commits of at most two (interesting) parents: the lines before and after each commit. */
export class Graph {
  private commit: Sha | undefined;
  private parents: Sha[] = [];
  private width = 0;
  private state = GraphState.Padding;
  private prevState = GraphState.Padding;
  private commitIndex = 0;
  private prevCommitIndex = 0;
  private mergeLayout = 0;
  private edgesAdded = 0;
  private prevEdgesAdded = 0;
  private columns: Column[] = [];
  private newColumns: Column[] = [];
  private mapping: number[] = [];
  private oldMapping: number[] = [];
  constructor(private readonly parentsOf: (id: Sha) => Sha[]) {}

  /** graph_update: the next commit to draw. */
  update(commit: Sha) {
    this.commit = commit;
    this.parents = this.parentsOf(commit);
    this.prevCommitIndex = this.commitIndex;
    this.updateColumns();
    this.state = this.state !== GraphState.Padding ? GraphState.Skip : GraphState.Commit;
  }
  /** Whether the lines of the current commit are all out (the next line would be padding). */
  get finished() { return this.state === GraphState.Padding; }

  /** graph_next_line: one line; `commit` when it is the commit's own line. */
  nextLine(): { text: string; commit: boolean } {
    let text: string, commit = false;
    switch (this.state) {
      case GraphState.Padding: text = this.newColumns.map(() => '| ').join(''); break;
      case GraphState.Skip: text = '...'; this.setState(GraphState.Commit); break;
      case GraphState.PreCommit: case GraphState.Commit: text = this.commitLine(); commit = true; break;
      case GraphState.PostMerge: text = this.postMergeLine(); break;
      case GraphState.Collapsing: text = this.collapsingLine(); break;
    }
    return { text: text.padEnd(this.width), commit };
  }
  /** graph_padding_line: the line between two commits (and of a commit's other lines once its graph lines are out). */
  paddingLine(): string {
    if (this.state !== GraphState.Commit) return this.nextLine().text;
    const text = this.columns.map(() => '| ').join('');
    this.prevState = GraphState.Padding;
    return text.padEnd(this.width);
  }

  private setState(s: GraphState) { this.prevState = this.state; this.state = s; }
  private findNew(c: Sha) { return this.newColumns.indexOf(c); }
  private updateColumns() {
    [this.columns, this.newColumns] = [this.newColumns, []];
    const maxNew = this.columns.length + this.parents.length;
    this.mapping = new Array(2 * maxNew).fill(-1);
    this.width = 0;
    this.prevEdgesAdded = this.edgesAdded;
    this.edgesAdded = 0;
    let seen = false;
    for (let i = 0; i <= this.columns.length; i++) {
      let col: Sha;
      if (i === this.columns.length) { if (seen) break; col = this.commit!; } else col = this.columns[i];
      if (col === this.commit) {
        seen = true;
        this.commitIndex = i;
        this.mergeLayout = -1;
        for (const p of this.parents) this.insert(p, i);
        if (!this.parents.length) this.width += 2;
      } else this.insert(col, -1);
    }
    while (this.mapping.length > 1 && this.mapping[this.mapping.length - 1] < 0) this.mapping.pop();
  }
  private insert(commit: Sha, idx: number) {
    let i = this.findNew(commit), at: number;
    if (i < 0) { i = this.newColumns.length; this.newColumns.push(commit); }
    if (this.parents.length > 1 && idx > -1 && this.mergeLayout === -1) {
      const dist = idx - i, shift = dist > 1 ? 2 * dist - 3 : 1;
      this.mergeLayout = dist > 0 ? 0 : 1;
      this.edgesAdded = this.parents.length + this.mergeLayout - 2;
      at = this.width + (this.mergeLayout - 1) * shift;
      this.width += 2 * this.mergeLayout;
    } else if (this.edgesAdded > 0 && i === this.mapping[this.width - 2]) {
      at = this.width - 2;
      this.edgesAdded = -1;
    } else {
      at = this.width;
      this.width += 2;
    }
    while (this.mapping.length <= at) this.mapping.push(-1);
    this.mapping[at] = i;
  }
  private mappingCorrect() { return this.mapping.every((t, i) => t < 0 || t === Math.floor(i / 2)); }
  private commitLine(): string {
    let text = '', seen = false;
    for (let i = 0; i <= this.columns.length; i++) {
      let col: Sha;
      if (i === this.columns.length) { if (seen) break; col = this.commit!; } else col = this.columns[i];
      if (col === this.commit) seen = true, text += '*';
      else if (seen && this.edgesAdded > 1) text += '\\';
      else if (seen && this.edgesAdded === 1) text += this.prevState === GraphState.PostMerge && this.prevEdgesAdded > 0 && this.prevCommitIndex < i ? '\\' : '|';
      else if (this.prevState === GraphState.Collapsing && this.oldMapping[2 * i + 1] === i && this.mapping[2 * i] < i) text += '/';
      else text += '|';
      text += ' ';
    }
    this.setState(this.parents.length > 1 ? GraphState.PostMerge : this.mappingCorrect() ? GraphState.Padding : GraphState.Collapsing);
    return text;
  }
  private postMergeLine(): string {
    const merge = '/|\\';
    let text = '', seen = false, parentCol: Sha | undefined;
    for (let i = 0; i <= this.columns.length; i++) {
      let col: Sha;
      if (i === this.columns.length) { if (seen) break; col = this.commit!; } else col = this.columns[i];
      if (col === this.commit) {
        seen = true;
        let idx = this.mergeLayout;
        this.parents.forEach((_, j) => {
          text += merge[idx];
          if (idx === 2) { if (this.edgesAdded > 0 || j < this.parents.length - 1) text += ' '; } else idx++;
        });
        if (this.edgesAdded === 0) text += ' ';
      } else if (seen) text += this.edgesAdded > 0 ? '\\ ' : '| ';
      else {
        text += '|';
        if (this.mergeLayout !== 0 || i !== this.commitIndex - 1) text += parentCol ? '_' : ' ';
      }
      if (col === this.parents[0]) parentCol = col;
    }
    this.setState(this.mappingCorrect() ? GraphState.Padding : GraphState.Collapsing);
    return text;
  }
  private collapsingLine(): string {
    const size = this.mapping.length;
    this.oldMapping = [...this.mapping];
    this.mapping = new Array(size).fill(-1);
    let horizontalEdge = -1, horizontalTarget = -1, usedHorizontal = false;
    for (let i = 0; i < size; i++) {
      const target = this.oldMapping[i];
      if (target < 0) continue;
      if (target * 2 === i) this.mapping[i] = target;
      else if (this.mapping[i - 1] < 0) {
        this.mapping[i - 1] = target;
        if (horizontalEdge === -1) {
          horizontalEdge = i; horizontalTarget = target;
          for (let j = target * 2 + 3; j < i - 2; j += 2) this.mapping[j] = target;
        }
      } else if (this.mapping[i - 1] === target) { /* joins the line to its left */ }
      else {
        this.mapping[i - 2] = target;
        if (horizontalEdge === -1) {
          horizontalTarget = target; horizontalEdge = i - 1;
          for (let j = target * 2 + 3; j < i - 2; j += 2) this.mapping[j] = target;
        }
      }
    }
    this.oldMapping = [...this.mapping];
    if (this.mapping[this.mapping.length - 1] < 0) this.mapping.pop();
    let text = '';
    for (let i = 0; i < this.mapping.length; i++) {
      const target = this.mapping[i];
      if (target < 0) text += ' ';
      else if (target * 2 === i) text += '|';
      else if (target === horizontalTarget && i !== horizontalEdge - 1) {
        if (i !== target * 2 + 3) this.mapping[i] = -1;
        usedHorizontal = true;
        text += '_';
      } else {
        if (usedHorizontal && i < horizontalEdge) this.mapping[i] = -1;
        text += '/';
      }
    }
    if (this.mappingCorrect()) this.setState(GraphState.Padding);
    return text;
  }
}
