import { type FsNode, type FsState } from './fs';
import { clockOf } from './processes';
import { httpDate, type Request, type Response } from './http';
import { sha256 } from './ssh';

/*
 * Engine stage E18 (docs/curriculum/SRV0_SERVER_CAPABILITY.md §23): HTTP caching, as pure functions shared by nginx's
 * proxy_cache (nginx.ts) and the CDN edge (a responder with `cdn`, served from http.ts). Freshness follows RFC 9111 as
 * the two read it: s-maxage before max-age before Expires − Date, and no-store, no-cache, private, Set-Cookie and Vary: *
 * make a response uncacheable (nginx's rules; the CDN uses the same ones, with a declared default TTL when the origin says
 * nothing). Validators are RFC 9110's: a strong or weak ETag compared weakly by If-None-Match, which wins over
 * If-Modified-Since. A cache key is hashed with MD5, as nginx names its cache files (levels=1:2 → /c/29/b7f…29c); the files
 * are text in the simulation (KEY:, the status line, the headers and the body), so grep -r "KEY:" and rm work on them as
 * on a real server. Time is the machine's clock, which moves only with sleep from the edge profile up.
 */

// --------------------------------------------------------------------------------------------------------------- MD5

const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
/** RFC 1321's MD5 of the UTF-8 bytes of a text, as 32 hex digits (nginx's cache key hash). */
export function md5(text: string): string {
  const msg = new TextEncoder().encode(text), len = msg.length;
  const total = ((len + 8) >> 6) + 1, words = new Uint32Array(total * 16);
  for (let i = 0; i < len; i++) words[i >> 2] |= msg[i] << ((i % 4) * 8);
  words[len >> 2] |= 0x80 << ((len % 4) * 8);
  words[total * 16 - 2] = (len * 8) >>> 0;
  words[total * 16 - 1] = Math.floor(len / 0x20000000);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let blk = 0; blk < total; blk++) {
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number, g: number;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      const tmp = d;
      d = c; c = b;
      const x = (a + f + K[i] + words[blk * 16 + g]) >>> 0;
      b = (b + ((x << S[i]) | (x >>> (32 - S[i])))) >>> 0;
      a = tmp;
    }
    a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0;
  }
  return [a0, b0, c0, d0].map(w => [0, 8, 16, 24].map(s => ((w >>> s) & 255).toString(16).padStart(2, '0')).join('')).join('');
}

// ----------------------------------------------------------------------------------------------- headers and freshness

export const headerOf = (h: readonly [string, string][], name: string) => h.find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1];
const headersOf = (h: readonly [string, string][], name: string) => h.filter(([k]) => k.toLowerCase() === name.toLowerCase()).map(([, v]) => v);

/** Cache-Control's directives (every Cache-Control header, comma separated). */
export interface CacheControl { noStore: boolean; noCache: boolean; private: boolean; maxAge?: number; sMaxage?: number; mustRevalidate: boolean; any: boolean }
export function cacheControl(h: readonly [string, string][]): CacheControl {
  const cc: CacheControl = { noStore: false, noCache: false, private: false, mustRevalidate: false, any: false };
  for (const v of headersOf(h, 'Cache-Control')) for (const raw of v.split(',')) {
    const [k, val] = raw.trim().toLowerCase().split('=', 2);
    if (!k) continue;
    cc.any = true;
    const n = val !== undefined && /^\d+$/.test(val.replace(/"/g, '')) ? Number(val.replace(/"/g, '')) : undefined;
    if (k === 'no-store') cc.noStore = true;
    else if (k === 'no-cache') cc.noCache = true;
    else if (k === 'private') cc.private = true;
    else if (k === 'must-revalidate' || k === 'proxy-revalidate') cc.mustRevalidate = true;
    else if (k === 'max-age' && n !== undefined) cc.maxAge = n;
    else if (k === 's-maxage' && n !== undefined) cc.sMaxage = n;
  }
  return cc;
}
const MONTH = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** An IMF-fixdate (Sun, 22 Nov 2026 10:00:00 GMT) as seconds; undefined when it is not one. */
export function parseHttpDate(text: string | undefined): number | undefined {
  const m = /^\w{3}, (\d{2}) (\w{3}) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/.exec((text ?? '').trim());
  if (!m) return undefined;
  const mon = MONTH.indexOf(m[2].toLowerCase());
  return mon < 0 ? undefined : Date.UTC(Number(m[3]), mon, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6])) / 1000;
}

/** What the response's own headers say about storing it (ignored: proxy_ignore_headers, lower case). */
export type Storable = { store: false; why: string } | { store: true; ttl?: number };
export function storable(res: Response, now: number, ignored: ReadonlySet<string> = new Set()): Storable {
  const h = res.headers;
  if (!ignored.has('x-accel-expires')) {
    const xa = headerOf(h, 'X-Accel-Expires');
    if (xa !== undefined && /^\d+$/.test(xa)) return Number(xa) === 0 ? { store: false, why: 'X-Accel-Expires: 0' } : { store: true, ttl: Number(xa) };
  }
  if (!ignored.has('set-cookie') && headerOf(h, 'Set-Cookie') !== undefined) return { store: false, why: 'Set-Cookie' };
  if (!ignored.has('vary') && (headerOf(h, 'Vary') ?? '').split(',').some(v => v.trim() === '*')) return { store: false, why: 'Vary: *' };
  if (!ignored.has('cache-control')) {
    const cc = cacheControl(h);
    if (cc.noStore || cc.noCache || cc.private) return { store: false, why: `Cache-Control: ${headerOf(h, 'Cache-Control')}` };
    const age = cc.sMaxage ?? cc.maxAge;
    if (age !== undefined) return age === 0 ? { store: false, why: `Cache-Control: ${headerOf(h, 'Cache-Control')}` } : { store: true, ttl: age };
  }
  if (!ignored.has('expires')) {
    const e = headerOf(h, 'Expires');
    if (e !== undefined) {
      const t = parseHttpDate(e), date = parseHttpDate(headerOf(h, 'Date')) ?? now;
      if (t === undefined || t <= date) return { store: false, why: `Expires: ${e}` };
      return { store: true, ttl: t - date };
    }
  }
  return { store: true };
}

/** The request headers a Vary response names, as one text (the variant of a cache key). */
export function varyKey(res: Response, req: Request, ignored: ReadonlySet<string> = new Set()): string {
  if (ignored.has('vary')) return '';
  const names = (headerOf(res.headers, 'Vary') ?? '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
  return names.map(n => `${n}:${headerOf(req.headers, n) ?? ''}`).join('\n');
}
/** The variant of a stored response that a new request asks for. */
export const varyOf = (names: readonly string[], req: Request) => names.map(n => `${n}:${headerOf(req.headers, n) ?? ''}`).join('\n');
export const varyNames = (res: Response) => (headerOf(res.headers, 'Vary') ?? '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);

// ------------------------------------------------------------------------------------------------------- validators

/** RFC 9110's weak comparison of an If-None-Match list with an ETag. */
export function etagMatches(list: string, etag: string): boolean {
  if (list.trim() === '*') return true;
  const bare = (t: string) => t.trim().replace(/^W\//, '');
  return list.split(',').some(t => bare(t) === bare(etag));
}
/** nginx's ETag of a static file: "mtime in hex-size in hex". */
export const nginxEtag = (mtime: number, size: number) => `"${Math.floor(mtime).toString(16)}-${size.toString(16)}"`;
/** A responder's automatic ETag: the first 16 hex digits of the body's SHA-256. */
export const bodyEtag = (body: string) => `"${Array.from(sha256(new TextEncoder().encode(body)).slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('')}"`;

/**
 * Whether a conditional GET or HEAD gets 304 Not Modified. mode: RFC 9110 (If-None-Match wins; If-Modified-Since when the
 * resource is not newer), or nginx's not_modified filter (every condition present must hold; if_modified_since exact by default).
 */
export function notModified(req: Request, res: Response, mode: 'rfc' | 'exact' | 'before' | 'off' = 'rfc'): boolean {
  if ((req.method !== 'GET' && req.method !== 'HEAD') || res.status !== 200) return false;
  const inm = headerOf(req.headers, 'If-None-Match'), ims = headerOf(req.headers, 'If-Modified-Since');
  const etag = headerOf(res.headers, 'ETag'), lm = parseHttpDate(headerOf(res.headers, 'Last-Modified'));
  if (mode === 'rfc') {
    if (inm !== undefined) return etag !== undefined && etagMatches(inm, etag);
    if (ims !== undefined && lm !== undefined) { const t = parseHttpDate(ims); return t !== undefined && lm <= t; }
    return false;
  }
  if (inm === undefined && ims === undefined) return false;
  if (ims !== undefined && mode !== 'off') {
    const t = parseHttpDate(ims);
    if (lm === undefined || t === undefined || (mode === 'exact' ? t !== lm : t < lm)) return false;
  } else if (ims !== undefined && inm === undefined) return false;
  if (inm !== undefined && (etag === undefined || !etagMatches(inm, etag))) return false;
  return true;
}
/** A 304 built from a 200: no body, no Content-Type or Content-Length; the validators and caching headers stay. */
export function asNotModified(res: Response): Response {
  const drop = new Set(['content-type', 'content-length', 'accept-ranges', 'transfer-encoding']);
  return { ...res, status: 304, reason: 'Not Modified', headers: res.headers.filter(([k]) => !drop.has(k.toLowerCase())), body: '' };
}

// ---------------------------------------------------------------------------------------------- nginx's proxy_cache

/** proxy_cache_path as loaded: the folder, levels, keys_zone name, inactive and max_size. */
export interface CacheZone { name: string; path: string; levels: number[]; inactive: number; maxSize?: string; file: string; line: number }
/** A response nginx keeps: where its file is, the upstream's response, when it was stored and until when it is fresh. */
export interface NgEntry {
  key: string; vary: string; varyNames: string[]; file: string; res: Response; stored: number; valid: number; access: number;
  /** proxy_cache_background_update: the refreshed entry and when it is ready (now + the upstream's time); until then UPDATING. */
  next?: { entry: NgEntry; ready: number };
}
/** The cache file of a key: levels=1:2 → path/c/29/b7f54b2df7773722d382f4809d65029c. */
export function cacheFile(zone: CacheZone, hash: string): string {
  const parts: string[] = [];
  let end = hash.length;
  for (const n of zone.levels) { parts.push(hash.slice(end - n, end)); end -= n; }
  return [zone.path.replace(/\/$/, ''), ...parts, hash].join('/');
}
/** The text of a cache file: KEY:, then the upstream's response as it arrived. */
export const cacheText = (key: string, res: Response) => `KEY: ${key}\nHTTP/1.1 ${res.status} ${res.reason}\n${res.headers.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${res.body}`;

/** Writes a cache file (owned by the worker user, 0600 in 0700 folders); false when the file system is full. */
export function writeCacheFile(nodes: Map<string, FsNode>, zone: CacheZone, path: string, text: string, owner: string, limit: number): boolean {
  const dirs: string[] = [];
  for (let at = path.slice(0, path.lastIndexOf('/')); at.length > zone.path.replace(/\/$/, '').length; at = at.slice(0, at.lastIndexOf('/'))) dirs.unshift(at);
  const missing = dirs.filter(d => !nodes.has(d));
  if (!nodes.has(zone.path.replace(/\/$/, '')) || nodes.size + missing.length + (nodes.has(path) ? 0 : 1) > limit) return false;
  for (const d of missing) nodes.set(d, { kind: 'dir', mode: 0o700, owner });
  nodes.set(path, { kind: 'file', mode: 0o600, owner, content: text });
  return true;
}
/** proxy_cache_valid's time for a status (the list as written: [codes…|any] time; codes default to 200 301 302). */
export function validFor(dirs: readonly { args: string[] }[], status: number, timeValue: (t: string) => number | undefined): number | undefined {
  for (const d of dirs) {
    const time = timeValue(d.args.at(-1)!), codes = d.args.slice(0, -1);
    const list = codes.length ? codes : ['200', '301', '302'];
    if (list.includes('any') || list.includes(String(status))) return time;
  }
  return undefined;
}

// --------------------------------------------------------------------------------------------------------- the CDN edge

/** E18: a CDN edge in front of an origin (a responder with cdn; generic, no provider's brand). */
export interface CdnConfig {
  /** The origin: a host name of the lesson (or one the edge resolves) or an IPv4 address. */
  origin: string;
  port?: number;
  scheme?: 'http' | 'https';
  /** The Host header sent to the origin (default the client's). */
  originHost?: string;
  /** Seconds to keep a response that says nothing about its freshness (default 0: not kept). */
  defaultTtl?: number;
}
/** A response the edge keeps: the origin's response (its own Date), when it was stored, for how long, the origin's Age. */
export interface CdnEntry { key: string; vary: string; varyNames: string[]; res: Response; stored: number; ttl: number; age: number }
export interface EdgeState { caches: Record<string, CdnEntry[]> }
/** E18 (lesson data): a response already in the edge's cache at the start (cachedAt UTC; ttl seconds). */
export interface CdnSeed { url: string; status?: number; headers?: [string, string][]; body?: string; type?: string; cachedAt: string; ttl: number }

export const edgeKey = (host: string, path: string) => `${host.toLowerCase().replace(/:\d+$/, '')}${path}`;
const HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'proxy-connection', 'upgrade', 'te', 'trailer']);

export type OriginResult = { kind: 'response'; res: Response; ms: number } | { kind: 'failed'; status: 502 | 504; ms: number };
/** What the edge answers: HIT from its cache, else the origin's answer (MISS), stored when it may be. Age and X-Cache added. */
export function cdnServe(host: FsState, id: string, cfg: CdnConfig, req: Request, fetch: (req: Request) => OriginResult): { res: Response; host: FsState; ms: number } {
  const now = clockOf(host).now, hostHeader = headerOf(req.headers, 'Host') ?? '', path = req.path, key = edgeKey(hostHeader, path);
  const all = host.edge?.caches[id] ?? [];
  const keep = (entries: CdnEntry[]): FsState => ({ ...host, edge: { caches: { ...host.edge?.caches, [id]: entries } } });
  const shown = (res: Response, age: number, status: string): Response => {
    const headers = res.headers.filter(([k]) => !HOP.has(k.toLowerCase()) && k.toLowerCase() !== 'age' && k.toLowerCase() !== 'x-cache');
    return { ...res, headers: [...headers, ['Connection', 'keep-alive'], ['Age', String(Math.max(0, Math.floor(age)))], ['X-Cache', status]], close: false, cache: status };
  };
  const cacheable = req.method === 'GET' || req.method === 'HEAD';
  const hit = cacheable ? all.find(e => e.key === key && e.vary === varyOf(e.varyNames, req) && now < e.stored + e.ttl) : undefined;
  if (hit) {
    const age = now - hit.stored + hit.age;
    let res = shown({ ...hit.res, body: req.method === 'HEAD' ? '' : hit.res.body }, age, 'HIT');
    if (notModified(req, res)) res = asNotModified(res);
    return { res, host, ms: 0 };
  }
  const originReq: Request = { ...req, method: req.method === 'HEAD' ? 'GET' : req.method, headers: req.headers.map(([k, v]) => [k, k.toLowerCase() === 'host' && cfg.originHost ? cfg.originHost : v] as [string, string]) };
  const r = fetch(originReq);
  if (r.kind === 'failed') {
    const body = `<html><body><h1>${r.status} ${r.status === 502 ? 'Bad Gateway' : 'Gateway Timeout'}</h1><p>edge: the origin did not answer</p></body></html>\n`;
    return { res: { status: r.status, reason: r.status === 502 ? 'Bad Gateway' : 'Gateway Timeout', headers: [['Date', httpDate(now)], ['Content-Type', 'text/html'], ['Content-Length', String(new TextEncoder().encode(body).length)], ['Connection', 'keep-alive'], ['X-Cache', 'MISS']], body: req.method === 'HEAD' ? '' : body, close: false, cache: 'MISS' }, host, ms: r.ms };
  }
  const origin = r.res, s = storable(origin, now);
  const ttl = !cacheable || !s.store ? 0 : s.ttl ?? cfg.defaultTtl ?? 0;
  let next = host;
  if (ttl > 0 && [200, 203, 204, 300, 301, 404, 410].includes(origin.status)) {
    const entry: CdnEntry = { key, vary: varyKey(origin, req), varyNames: varyNames(origin), res: origin, stored: now, ttl, age: Number(headerOf(origin.headers, 'Age') ?? 0) || 0 };
    next = keep([...all.filter(e => !(e.key === key && e.vary === entry.vary)), entry].slice(-50));
  }
  let res = shown({ ...origin, body: req.method === 'HEAD' ? '' : origin.body }, Number(headerOf(origin.headers, 'Age') ?? 0) || 0, 'MISS');
  if (notModified(req, res)) res = asNotModified(res);
  return { res, host: next, ms: r.ms };
}

/** E18: the purge API's work on one edge: every entry of the URL (or of a prefix ending in *; all: everything). */
export function purgeEdge(host: FsState, url: string | 'all'): { host: FsState; purged: number } {
  const caches = host.edge?.caches ?? {};
  let purged = 0;
  const bare = url === 'all' ? '' : url.replace(/^https?:\/\//i, ''), slash = bare.indexOf('/');
  const target = slash < 0 ? `${bare.toLowerCase()}/` : `${bare.slice(0, slash).toLowerCase().replace(/:\d+$/, '')}${bare.slice(slash)}`;
  const next = Object.fromEntries(Object.entries(caches).map(([id, list]) => {
    const kept = list.filter(e => {
      const gone = url === 'all' || (target.endsWith('*') ? e.key.startsWith(target.slice(0, -1)) : e.key === target);
      if (gone) purged++;
      return !gone;
    });
    return [id, kept];
  }));
  return { host: { ...host, edge: { caches: next } }, purged };
}
