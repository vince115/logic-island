import { parentOf, resolvePath, type FsState } from './fs';
import { DEFAULT_NOW, parseTime } from './clock';
import { edgeKey, type CdnEntry, type CdnSeed } from './cache';
import { captureText, type CapPacket, type PathDecl } from './diag';
import { httpDate, parseUrl, probe, reasonOf, responseHeader, type Response } from './http';
import { isIPv4, type Resolver } from './sockets';
import type { TerminalFile, TerminalMachine } from './lesson';

/*
 * Engine stages E18–E19 as lesson data (docs/curriculum/SRV0_SERVER_CAPABILITY.md §25). edge: a machine's latency (how far
 * it is from the network's core, ms), files with a modification time (nginx's Last-Modified and ETag), responders that are
 * a CDN edge (cdn) with responses already in their cache (cdnCache), routes with validators (etag, lastModified) and the
 * fictional purge API (purge). diagnostics: the local machine's paths of hops to destinations and packet captures (tcpdump
 * -r reads them). Each field only from its own profile up; the check `cache` and the headers of `http` from edge up.
 */

/** E19: a capture file the lesson provides (start: UTC 'YYYY-MM-DD HH:MM:SS'; packets' t: seconds after it). */
export interface TerminalCapture { path: string; owner?: string; group?: string; mode?: number; start?: string; packets: CapPacket[] }
/** E18: responses already in a CDN responder's cache at the start. */
export interface TerminalCdnCache { responder: string; entries: CdnSeed[] }
export interface EdgeLevels { edge: boolean; diagnostics: boolean }

export type EdgeCheck =
  /** E18: a GET of the URL (from host, default the exercise's machine) would be answered with this cache status (nginx's $upstream_cache_status or the edge's X-Cache) and these headers. */
  | { kind: 'cache'; url: string; status?: string; headers?: [string, string][]; host?: string };
export const CACHE_STATUSES = ['HIT', 'MISS', 'EXPIRED', 'STALE', 'UPDATING', 'BYPASS', 'REVALIDATED'] as const;

const whole = (x: unknown, min: number, max: number) => Number.isInteger(x) && (x as number) >= min && (x as number) <= max;
const num = (x: unknown, min: number, max: number) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
const normalized = (path: unknown) => typeof path === 'string' && path.startsWith('/') && resolvePath({ cwd: '/', home: '/' }, path) === path;
const HOST_NAME = /^[a-z0-9](?:[a-z0-9.-]{0,61}[a-z0-9])?$/;
const ENDPOINT = /^(\d+\.\d+\.\d+\.\d+):(\d+)$/;
const ETAG = /^(W\/)?"[\x21\x23-\x7e]*"$/;

/** E19: the capture files (and their missing parent folders), unless the lesson lists them. */
export function expandEdge(m: TerminalMachine, lv: EdgeLevels, add: { file(f: TerminalFile): void; dir(path: string, mode?: number): void }): void {
  if (!lv.diagnostics) return;
  for (const c of m.captures ?? []) {
    if (!normalized(c.path)) continue;
    const parents: string[] = [];
    for (let at = parentOf(c.path); at !== '/'; at = parentOf(at)) parents.unshift(at);
    parents.forEach(p => add.dir(p));
    add.file({ path: c.path, kind: 'file', mode: c.mode ?? 0o644, owner: c.owner ?? 'root', ...c.group ? { group: c.group } : {}, content: captureText({ start: parseTime(c.start ?? m.now ?? DEFAULT_NOW) ?? 0, packets: c.packets }) });
  }
}

/** A seed of a CDN cache as the entry the edge keeps (its origin's response with the Date of when it was stored). */
function seedEntry(e: CdnSeed): CdnEntry | undefined {
  const u = parseUrl(e.url), stored = parseTime(e.cachedAt);
  if ('code' in u || stored === undefined) return undefined;
  const body = e.body ?? '', status = e.status ?? 200;
  const res: Response = {
    status, reason: reasonOf(status), body, close: false,
    headers: [['Date', httpDate(stored)], ['Content-Type', e.type ?? 'text/html'], ['Content-Length', String(new TextEncoder().encode(body).length)], ...e.headers ?? []],
  };
  return { key: edgeKey(u.host, u.path), vary: '', varyNames: [], res, stored, ttl: e.ttl, age: 0 };
}

/** E18–E19: the machine's links, its HTTP data's edge flag and its CDN caches. */
export function edgeState(m: TerminalMachine, state: FsState, lv: EdgeLevels): FsState {
  if (!lv.edge) return state;
  let next: FsState = state;
  if (m.latency !== undefined || (lv.diagnostics && m.paths?.length)) next = { ...next, links: { ...m.latency !== undefined ? { latency: m.latency } : {}, ...lv.diagnostics && m.paths?.length ? { paths: m.paths.map(p => ({ hops: p.hops.map(h => ({ ...h })) })) } : {} } };
  if (next.http) next = { ...next, http: { ...next.http, edge: true } };
  if (m.cdnCache?.length) {
    const caches: Record<string, CdnEntry[]> = {};
    for (const c of m.cdnCache) caches[c.responder] = c.entries.map(seedEntry).filter((e): e is CdnEntry => !!e);
    next = { ...next, edge: { caches } };
  }
  return next;
}

/** E18–E19: the problems of a machine's edge and diagnostics data (names: the lesson's machine names, for purge's edges). */
export function edgeProblems(m: TerminalMachine, lv: EdgeLevels, names?: readonly string[]): string[] {
  const problems: string[] = [], fail = (what: string) => problems.push(what);
  const responders = m.responders ?? [], routes = responders.flatMap(r => r.routes);
  if (!lv.edge && (m.latency !== undefined || m.cdnCache !== undefined || responders.some(r => r.cdn !== undefined) || routes.some(r => r.etag !== undefined || r.lastModified !== undefined || r.purge !== undefined) || m.files.some(f => f.mtime !== undefined)))
    fail('latency, cdnCache, a responder\'s cdn, a route\'s etag, lastModified and purge, and a file\'s mtime need the edge profile (engine stage E18)');
  if (!lv.diagnostics && (m.paths !== undefined || m.captures !== undefined)) fail('paths and captures need the diagnostics profile (engine stage E19)');
  if (problems.length || !lv.edge) return problems;
  const now = parseTime(m.now ?? DEFAULT_NOW) ?? 0;
  if (m.latency !== undefined && !num(m.latency, 0, 1000)) fail('latency must be 0..1000 ms');
  for (const f of m.files) if (f.mtime !== undefined && (f.kind !== 'file' || parseTime(f.mtime) === undefined || parseTime(f.mtime)! > now)) fail(`file ${f.path}: mtime is for files, a time YYYY-MM-DD HH:MM:SS not after now`);
  for (const r of responders) {
    const at = `responder ${r.id}`;
    if (r.cdn !== undefined) {
      const c = r.cdn;
      if (typeof c.origin !== 'string' || !(isIPv4(c.origin) || HOST_NAME.test(c.origin))) fail(`${at}: cdn needs an origin (a host name or an IPv4 address)`);
      if (c.port !== undefined && !whole(c.port, 1, 65535)) fail(`${at}: cdn port must be 1..65535`);
      if (c.scheme !== undefined && c.scheme !== 'http' && c.scheme !== 'https') fail(`${at}: cdn scheme must be http or https`);
      if (c.defaultTtl !== undefined && !whole(c.defaultTtl, 0, 31536000)) fail(`${at}: cdn defaultTtl must be 0..31536000 seconds`);
      if (c.originHost !== undefined && !HOST_NAME.test(c.originHost)) fail(`${at}: cdn originHost must be a host name`);
      if (r.routes.length) fail(`${at}: a cdn responder has no routes (the origin answers)`);
    }
    for (const x of r.routes) {
      const rt = `${at} route ${x.path}`;
      if (x.etag !== undefined && x.etag !== true && !(typeof x.etag === 'string' && ETAG.test(x.etag))) fail(`${rt}: etag is true or a quoted entity tag like "v1" or W/"v1"`);
      if (x.lastModified !== undefined && (parseTime(x.lastModified) === undefined || parseTime(x.lastModified)! > now)) fail(`${rt}: lastModified must be a time YYYY-MM-DD HH:MM:SS not after now`);
      if (x.purge !== undefined) {
        const p = x.purge;
        if (!Array.isArray(p.edges) || !p.edges.length || p.edges.length > 8 || p.edges.some(e => typeof e !== 'string' || (names && !names.includes(e)))) fail(`${rt}: purge needs 1..8 edges, machines of the lesson`);
        if (p.token !== undefined && !/^[A-Za-z0-9._~-]{1,64}$/.test(p.token)) fail(`${rt}: purge token must be 1..64 characters of A-Z a-z 0-9 . _ ~ -`);
        if (x.echo || x.websocket || x.root !== undefined) fail(`${rt}: purge is a route of its own (no echo, websocket or root)`);
      }
    }
  }
  if ((m.cdnCache ?? []).length > 4) fail('at most 4 cdnCache lists');
  for (const c of m.cdnCache ?? []) {
    if (!responders.some(r => r.id === c.responder && r.cdn)) { fail(`cdnCache ${c.responder}: not a cdn responder of the machine`); continue; }
    if (!Array.isArray(c.entries) || c.entries.length > 20) fail(`cdnCache ${c.responder}: at most 20 entries`);
    for (const e of c.entries ?? []) {
      const u = parseUrl(e.url), t = parseTime(e.cachedAt);
      if ('code' in u || !/^https?:\/\//.test(e.url)) fail(`cdnCache ${c.responder} ${e.url}: needs an http:// or https:// URL`);
      if (t === undefined || t > now) fail(`cdnCache ${c.responder} ${e.url}: cachedAt must be a time YYYY-MM-DD HH:MM:SS not after now`);
      if (!whole(e.ttl, 0, 31536000)) fail(`cdnCache ${c.responder} ${e.url}: ttl must be 0..31536000 seconds`);
      if (e.status !== undefined && !whole(e.status, 100, 599)) fail(`cdnCache ${c.responder} ${e.url}: status must be 100..599`);
      if ((e.body ?? '').length > 4000 || (e.headers ?? []).some(([k, v]) => !/^[A-Za-z0-9-]{1,64}$/.test(k) || typeof v !== 'string' || v.includes('\n'))) fail(`cdnCache ${c.responder} ${e.url}: body at most 4000 characters, headers one line each`);
    }
  }
  if (!lv.diagnostics) return problems;
  if ((m.paths ?? []).length > 8) fail('at most 8 paths');
  for (const [k, p] of (m.paths ?? []).entries()) {
    const at = `path ${k + 1}`;
    if (!Array.isArray(p.hops) || !p.hops.length || p.hops.length > 30) { fail(`${at}: needs 1..30 hops (the last is the destination)`); continue; }
    for (const h of p.hops) {
      if (!isIPv4(h.address)) fail(`${at}: hop ${h.address} is not an IPv4 address`);
      if (h.name !== undefined && !HOST_NAME.test(h.name)) fail(`${at}: hop ${h.address} has an invalid name`);
      if (!num(h.rtt, 0, 10000)) fail(`${at}: hop ${h.address} needs a round trip of 0..10000 ms`);
      if (h.loss !== undefined && !num(h.loss, 0, 100)) fail(`${at}: hop ${h.address} loss must be 0..100 percent`);
      if (h.silent !== undefined && h.silent !== true) fail(`${at}: hop ${h.address} silent is true or absent`);
    }
    if ((m.paths ?? []).some((o, j) => j < k && o.hops.at(-1)?.address === p.hops.at(-1)?.address)) fail(`${at}: another path has the same destination`);
  }
  if ((m.captures ?? []).length > 4) fail('at most 4 captures');
  for (const c of m.captures ?? []) {
    const at = `capture ${c.path}`;
    if (!normalized(c.path) || c.path === '/') fail(`${at}: needs an absolute, normalized path`);
    if (c.start !== undefined && parseTime(c.start) === undefined) fail(`${at}: start must be a time YYYY-MM-DD HH:MM:SS`);
    if (c.mode !== undefined && !whole(c.mode, 0, 0o777)) fail(`${at}: mode must be 0..0777`);
    if (!Array.isArray(c.packets) || !c.packets.length || c.packets.length > 200) { fail(`${at}: needs 1..200 packets`); continue; }
    let last = -1;
    c.packets.forEach((p, i) => {
      const pk = `${at} packet ${i + 1}`;
      if (!num(p.t, 0, 86400) || p.t < last) fail(`${pk}: t must be 0..86400 seconds, in order`);
      last = typeof p.t === 'number' ? p.t : last;
      if (!['tcp', 'udp', 'icmp'].includes(p.proto)) { fail(`${pk}: proto must be tcp, udp or icmp`); return; }
      const ok = (e: string) => p.proto === 'icmp' ? isIPv4(e) : ENDPOINT.test(e) && isIPv4(e.split(':')[0]) && whole(Number(e.split(':')[1]), 0, 65535);
      if (!ok(p.src) || !ok(p.dst)) fail(`${pk}: src and dst are a.b.c.d:port (a.b.c.d for icmp)`);
      if (p.flags !== undefined && (p.proto !== 'tcp' || !/^[FSRP.UEW]{1,6}$/.test(p.flags))) fail(`${pk}: flags are tcp's (S, S., ., P., F., R…)`);
      if ((p.payload ?? '').length > 2000) fail(`${pk}: payload at most 2000 characters`);
      if (p.icmp !== undefined && (p.proto !== 'icmp' || !['echo-request', 'echo-reply', 'port-unreachable', 'host-unreachable', 'time-exceeded'].includes(p.icmp))) fail(`${pk}: icmp is echo-request, echo-reply, port-unreachable, host-unreachable or time-exceeded`);
      if (p.dns !== undefined && (p.proto !== 'udp' || !whole(p.dns.id, 0, 65535) || !HOST_NAME.test(p.dns.name.replace(/\.$/, '')))) fail(`${pk}: dns needs a udp packet, an id 0..65535 and a name`);
      for (const [k, v] of [['seq', p.seq], ['ack', p.ack], ['win', p.win], ['length', p.length]] as const) if (v !== undefined && !whole(v, 0, 4294967295)) fail(`${pk}: ${k} must be a whole number`);
    });
  }
  return problems;
}

export function edgeCheckProblems(c: EdgeCheck, lv: EdgeLevels, known: (host: string) => boolean): string | null {
  if (!lv.edge || !/^https?:\/\/[^\s/]+/.test(c.url) || (c.status !== undefined && !(CACHE_STATUSES as readonly string[]).includes(c.status)) || (c.host !== undefined && !known(c.host))
    || (c.headers ?? []).some(h => !Array.isArray(h) || h.length !== 2) || (c.status === undefined && !c.headers?.length))
    return `a cache check needs an edge machine (engine stage E18), an http:// or https:// URL, a status among ${CACHE_STATUSES.join(' ')} or headers, and a known host`;
  return null;
}
export function describeEdgeCheck(c: EdgeCheck): string {
  const parts = [c.status ? `快取的狀態是 ${c.status}` : '', ...(c.headers ?? []).map(([k, v]) => `標頭 ${k}: ${v}`)].filter(Boolean);
  return `${c.host ? `${c.host} 上` : ''}再 GET 一次 ${c.url} 時，${parts.join('、')}`;
}
/** E18: the cache check, on the state after the commands (the probe itself changes nothing). */
export function edgeFailure(c: EdgeCheck, end: FsState, resolve: Resolver, viewOf: (host?: string) => FsState | undefined): string | null {
  const s = viewOf(c.host);
  if (!s) return `沒有 ${c.host} 這台主機`;
  const r = probe(s, c.url, resolve, true);
  if ('error' in r) return r.error;
  if (c.status !== undefined && r.cache !== c.status) return r.cache ? `快取的狀態是 ${r.cache}` : '這個網址沒有經過快取';
  for (const [k, v] of c.headers ?? []) { const got = responseHeader(r.headers, k); if (got !== v) return got === undefined ? `沒有 ${k} 標頭` : `${k} 是 ${got}`; }
  void end;
  return null;
}
export type { PathDecl };
