import { physicalPath, type FsState } from './fs';
import { accountsOf, loginGroups } from './accounts';
import { clockOf, commOf, tableOf, type Proc } from './processes';
import { MAX_JOURNAL } from './services';
import { zoneDate, zoneOf } from './calendar';
import { readPath } from './shell';
import { sha256 } from './ssh';
import { hostsLookup, isIPv4, reach, type NetIo, type NetResult, type Resolved, type Resolver } from './sockets';

/*
 * Engine stage E11 (docs/curriculum/SRV0_SERVER_CAPABILITY.md §7): DNS. Three parts, all pure data of the lesson:
 *
 * - Authoritative zones. A machine with `named` runs BIND 9.18 (generated unless listed: named.conf, the unit, the bind
 *   user, the process listening on port 53). Its zones are declared in /etc/bind/named.conf.local and read from zone files,
 *   a subset of the master file format ($ORIGIN, $TTL, SOA, NS, A, AAAA, CNAME, MX, TXT; relative names, @, parentheses,
 *   comments). What named serves is what it loaded when it started or at the last `rndc reload`: editing a zone file
 *   changes nothing until then, and a zone that fails to load keeps its old data (or, never loaded, answers SERVFAIL).
 * - The rest of the internet: zones the lesson declares as data on the local machine (internet), always reachable.
 * - The stub resolver of systemd-resolved on 127.0.0.53, with a cache whose entries record when they were cached: the
 *   remaining TTL is ttl − (now − cachedAt) on the fixed clock, so a changed record keeps its old answer until the
 *   cached one expires (or resolvectl flush-caches). It answers /etc/hosts names (TTL 0) before DNS, as resolved does.
 *   On a miss it asks the authoritative data directly: the zone with the longest origin that contains the name (a zone
 *   served by a machine of the lesson first). Delegation (root, TLD, NS and glue) is CN12's subject and not simulated.
 *
 * dig and host never read /etc/hosts themselves; from the dns profile up, ssh, curl, nc and getent look names up like
 * glibc (files, then DNS through the nameserver of /etc/resolv.conf).
 */

export const RR_TYPES = ['SOA', 'NS', 'A', 'AAAA', 'CNAME', 'MX', 'TXT'] as const;
export type RrType = typeof RR_TYPES[number];
/** A resource record: an absolute owner (with its trailing dot, case as written), the TTL and the data in presentation form. */
export interface Rr { name: string; ttl: number; type: RrType; data: string; line: number }
export interface Zone { origin: string; records: readonly Rr[]; serial: number; soa: Rr; negativeTtl: number }
/** A zone named loads from named.conf.local: the file, the text it loaded, the zone (none when it never loaded) and why it failed. */
export interface NamedZone { origin: string; file: string; text?: string; zone?: Zone; error?: string }
/** E11: the resolver cache (systemd-resolved): positive RRsets and negative answers (NXDOMAIN covers every type of the name). */
export type CacheEntry = { name: string; type: RrType; ttl: number; cachedAt: number; data: readonly string[] }
  | { name: string; type: RrType; ttl: number; cachedAt: number; negative: 'NXDOMAIN' | 'NODATA'; soa?: string };
/** E11: a machine's DNS: its resolver cache, the zones its named loaded, the internet's zones (the local machine), a query counter (dig's ids). */
export interface DnsState { cache: readonly CacheEntry[]; named?: readonly NamedZone[]; internet?: readonly Zone[]; queries: number }

export const DIG_VERSION = 'DiG 9.18.30-0ubuntu0.24.04.2-Ubuntu';
export const NAMED_CONF_LOCAL = '/etc/bind/named.conf.local';

// ----------------------------------------------------------------------------------------------------------- names

const lower = (n: string) => n.toLowerCase();
export const absolute = (name: string) => name.endsWith('.') ? name : `${name}.`;
export const shownName = (name: string) => name === '.' ? '.' : name.replace(/\.$/, '');
/** Whether `name` is `origin` or below it (both absolute). */
export const within = (name: string, origin: string) => lower(name) === lower(origin) || lower(name).endsWith(`.${lower(origin)}`) || origin === '.';
function nameProblem(name: string): string | null {
  if (name === '.') return null;
  if (name.length > 255) return 'name too long';
  for (const label of name.replace(/\.$/, '').split('.')) {
    if (!label) return 'empty label';
    if (label.length > 63) return 'label too long';
    if (!/^[A-Za-z0-9_*-]+$/.test(label)) return `bad name (${label})`;
  }
  return null;
}
/** A zone file name made absolute: @ is the origin, a name without a final dot is relative to it. */
const qualify = (name: string, origin: string) => name === '@' ? origin : name.endsWith('.') ? name : origin === '.' ? `${name}.` : `${name}.${origin}`;

/** A TTL: seconds, or with units (1h, 30m, 1d, 1w, 1h30m). */
export function parseTtl(text: string): number | undefined {
  if (/^\d+$/.test(text)) { const n = Number(text); return n <= 2147483647 ? n : undefined; }
  const m = /^(?:\d+[smhdw])+$/i.exec(text);
  if (!m) return undefined;
  let total = 0;
  for (const [, n, u] of text.matchAll(/(\d+)([smhdw])/gi)) total += Number(n) * { s: 1, m: 60, h: 3600, d: 86400, w: 604800 }[u.toLowerCase() as 's']!;
  return total <= 2147483647 ? total : undefined;
}

/** An IPv6 address in RFC 5952's canonical form (lowercase, no leading zeros, the longest run of zero groups as ::). */
export function canonicalIPv6(text: string): string | undefined {
  if (!/^[0-9a-fA-F:]+$/.test(text) || (text.match(/::/g) ?? []).length > 1) return undefined;
  const [head, tail] = text.includes('::') ? text.split('::') : [text, undefined];
  const parts = (s: string) => s ? s.split(':') : [];
  const h = parts(head), t = tail === undefined ? [] : parts(tail);
  if ([...h, ...t].some(g => !/^[0-9a-fA-F]{1,4}$/.test(g))) return undefined;
  const missing = 8 - h.length - t.length;
  if (tail === undefined ? missing !== 0 : missing < 1) return undefined;
  const groups = [...h, ...Array(tail === undefined ? 0 : missing).fill('0'), ...t].map(g => parseInt(g, 16).toString(16));
  let best = -1, bestLen = 1;
  for (let i = 0; i < 8;) {
    if (groups[i] !== '0') { i++; continue; }
    let j = i;
    while (j < 8 && groups[j] === '0') j++;
    if (j - i > bestLen) { best = i; bestLen = j - i; }
    i = j;
  }
  if (best < 0) return groups.join(':');
  return `${groups.slice(0, best).join(':')}::${groups.slice(best + bestLen).join(':')}`;
}

// ------------------------------------------------------------------------------------------------------ zone files

interface Token { text: string; quoted: boolean }
interface Logical { tokens: Token[]; indented: boolean; line: number }

/** Splits a master file into records: comments dropped, parentheses join lines, quoted strings kept whole. */
function logicalLines(text: string): Logical[] | { error: string; line: number } {
  const out: Logical[] = [];
  let tokens: Token[] = [], depth = 0, line = 1, start = 1, indented = false, atStart = true, cur = '', quoted = false, inQuote = false;
  const flush = () => { if (cur || quoted) tokens.push({ text: cur, quoted }); cur = ''; quoted = false; };
  const end = () => { flush(); if (tokens.length) out.push({ tokens, indented, line: start }); tokens = []; };
  for (let i = 0; i <= text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === undefined || ch === '\n') return { error: 'unbalanced quotes', line };
      if (ch === '\\' && i + 1 < text.length) { cur += text[++i]; continue; }
      if (ch === '"') { inQuote = false; continue; }
      cur += ch;
      continue;
    }
    if (ch === undefined || ch === '\n') {
      if (depth === 0) { end(); atStart = true; }
      else flush();
      if (ch === '\n') line++;
      continue;
    }
    if (atStart && depth === 0) { start = line; indented = ch === ' ' || ch === '\t'; atStart = false; }
    if (ch === ';') { while (i + 1 < text.length && text[i + 1] !== '\n') i++; continue; }
    if (ch === '"') { flush(); inQuote = true; quoted = true; continue; }
    if (ch === '(') { flush(); depth++; continue; }
    if (ch === ')') { flush(); depth--; if (depth < 0) return { error: 'unbalanced parentheses', line }; continue; }
    if (ch === ' ' || ch === '\t' || ch === '\r') { flush(); continue; }
    cur += ch;
  }
  if (depth !== 0) return { error: 'unbalanced parentheses', line: line - 1 };
  return out;
}

const KNOWN_ELSEWHERE = ['PTR', 'SRV', 'CAA', 'NAPTR', 'DS', 'DNSKEY', 'RRSIG', 'SPF', 'HINFO', 'SSHFP', 'TLSA', 'HTTPS', 'SVCB', 'DNAME', 'LOC'];
/** What named-checkzone and named print about a zone file, and the zone when it loads. */
export interface ZoneLoad { zone?: Zone; messages: string[]; failure?: string }

/**
 * Loads a zone file as BIND does (the subset above): the first error stops the load ("loading from master file … failed"),
 * then the zone's checks (one SOA at the origin, NS records, CNAME and other data, NS and MX targets in the zone with an
 * address). `file` is the file name as given (it appears in the messages).
 */
export function loadZone(originText: string, text: string, file: string): ZoneLoad {
  const origin0 = absolute(originText), zoneLabel = `zone ${shownName(origin0)}/IN`;
  const messages: string[] = [];
  const failed = (reason: string): ZoneLoad => ({ messages: [...messages, `${zoneLabel}: loading from master file ${file} failed: ${reason}`, `${zoneLabel}: not loaded due to errors.`], failure: reason });
  const lines = logicalLines(text);
  if (!Array.isArray(lines)) { messages.push(`dns_master_load: ${file}:${lines.line}: ${lines.error}`); return failed(lines.error); }
  let origin = origin0, defaultTtl: number | undefined, lastTtl: number | undefined, owner: string | undefined, warnedTtl = false;
  const records: Rr[] = [];
  for (const l of lines) {
    const t = l.tokens.map(x => x.text);
    const here = `${file}:${l.line}`;
    const rdataError = (near: string, why: string) => { messages.push(`dns_rdata_fromtext: ${here}: near '${near}': ${why}`); return failed(why); };
    const loadError = (why: string) => { messages.push(`dns_master_load: ${here}: ${why}`); return failed(why); };
    if (!l.indented && t[0].startsWith('$')) {
      const d = t[0].toUpperCase();
      if (d === '$ORIGIN') { if (!t[1]) return loadError('unexpected end of input'); const p = nameProblem(qualify(t[1], origin)); if (p) return loadError(p); origin = qualify(t[1], origin); continue; }
      if (d === '$TTL') { const v = parseTtl(t[1] ?? ''); if (v === undefined) return loadError('bad ttl'); defaultTtl = v; continue; }
      if (d === '$INCLUDE' || d === '$GENERATE') return loadError(`模擬環境的區域檔不支援 ${d}`);
      return loadError(`unknown $ directive '${t[0]}'`);
    }
    const toks = [...l.tokens];
    if (!l.indented) {
      const o = toks.shift()!;
      owner = qualify(o.text, origin);
      const p = nameProblem(owner);
      if (p) return loadError(p);
    } else if (owner === undefined) return loadError('no current owner name');
    let ttl: number | undefined, sawClass = false;
    while (toks.length) {
      const w = toks[0].text;
      if (!toks[0].quoted && ttl === undefined && /^\d/.test(w)) { const v = parseTtl(w); if (v === undefined) return loadError('bad ttl'); ttl = v; toks.shift(); continue; }
      if (!sawClass && /^(IN|CH|HS)$/i.test(w)) { if (w.toUpperCase() !== 'IN') return loadError(`class '${w.toUpperCase()}' != zone class 'IN'`); sawClass = true; toks.shift(); continue; }
      break;
    }
    const typeTok = toks.shift();
    if (!typeTok) return loadError('unexpected end of input');
    const type = typeTok.text.toUpperCase();
    if (!(RR_TYPES as readonly string[]).includes(type)) {
      if (KNOWN_ELSEWHERE.includes(type)) return loadError(`模擬環境的區域檔只支援 SOA、NS、A、AAAA、CNAME、MX、TXT（${type}）`);
      return loadError(`unknown RR type '${typeTok.text}'`);
    }
    const data = toks.map(x => x.text);
    const need = (n: number) => data.length < n ? 'unexpected end of input' : data.length > n ? 'extra input text' : null;
    let rdata: string;
    switch (type as RrType) {
      case 'A': { const e = need(1); if (e) return loadError(e); if (!isIPv4(data[0])) return rdataError(data[0], 'bad dotted quad'); rdata = data[0]; break; }
      case 'AAAA': { const e = need(1); if (e) return loadError(e); const v = canonicalIPv6(data[0]); if (!v) return rdataError(data[0], 'bad IPv6 address'); rdata = v; break; }
      case 'NS': case 'CNAME': { const e = need(1); if (e) return loadError(e); const n = qualify(data[0], origin), p = nameProblem(n); if (p) return rdataError(data[0], p); rdata = n; break; }
      case 'MX': {
        const e = need(2); if (e) return loadError(e);
        if (!/^\d+$/.test(data[0]) || Number(data[0]) > 65535) return rdataError(data[0], 'bad number');
        const n = qualify(data[1], origin), p = nameProblem(n); if (p) return rdataError(data[1], p);
        rdata = `${Number(data[0])} ${n}`; break;
      }
      case 'TXT': {
        if (!toks.length) return loadError('unexpected end of input');
        const long = toks.find(x => new TextEncoder().encode(x.text).length > 255);
        if (long) return rdataError(long.text.slice(0, 20), 'text too long');
        rdata = toks.map(x => `"${x.text.replace(/["\\]/g, '\\$&')}"`).join(' '); break;
      }
      case 'SOA': {
        const e = need(7); if (e) return loadError(e);
        const names = [qualify(data[0], origin), qualify(data[1], origin)];
        for (const [k, n] of names.entries()) { const p = nameProblem(n); if (p) return rdataError(data[k], p); }
        if (!/^\d+$/.test(data[2]) || Number(data[2]) > 4294967295) return rdataError(data[2], 'bad number');
        const times = data.slice(3).map(parseTtl);
        const bad = times.findIndex(x => x === undefined);
        if (bad >= 0) return rdataError(data[3 + bad], 'bad ttl');
        rdata = [...names, String(Number(data[2])), ...times.map(String)].join(' '); break;
      }
    }
    if (ttl === undefined) ttl = defaultTtl ?? lastTtl;
    if (ttl === undefined) {
      if (type !== 'SOA') return loadError('no TTL specified');
      ttl = Number(rdata.split(' ')[6]);
      if (!warnedTtl) { messages.push(`dns_master_load: ${here}: no TTL specified; using SOA MINTTL instead`); warnedTtl = true; }
    }
    lastTtl = ttl;
    if (!within(owner, origin0)) { messages.push(`${here}: ignoring out-of-zone data (${shownName(owner)})`); continue; }
    records.push({ name: owner, ttl, type: type as RrType, data: rdata, line: l.line });
  }
  // The zone's own checks.
  const at = (name: string) => records.filter(r => lower(r.name) === lower(name));
  for (const r of records) {
    const same = at(r.name);
    if (r.type === 'CNAME' && same.some(x => x.type !== 'CNAME')) { messages.push(`${file}:${Math.max(...same.map(x => x.line))}: ${shownName(r.name)}: CNAME and other data`); return failed('CNAME and other data'); }
    if ((r.type === 'CNAME' || r.type === 'SOA') && same.filter(x => x.type === r.type).length > 1) { messages.push(`${file}:${same.filter(x => x.type === r.type)[1].line}: multiple RRs of singleton type`); return failed('multiple RRs of singleton type'); }
  }
  const soas = at(origin0).filter(r => r.type === 'SOA'), nss = at(origin0).filter(r => r.type === 'NS');
  const errors: string[] = [];
  if (soas.length !== 1) errors.push(`${zoneLabel}: has ${soas.length} SOA records`);
  if (!nss.length) errors.push(`${zoneLabel}: has no NS records`);
  const target = (r: Rr) => r.type === 'MX' ? r.data.split(' ')[1] : r.data;
  for (const r of records.filter(x => x.type === 'NS' || x.type === 'MX')) {
    const tgt = target(r);
    if (!within(tgt, origin0)) continue;
    const there = at(tgt), what = r.type === 'NS' ? `NS '${shownName(tgt)}'` : `${shownName(r.name)}/MX '${shownName(tgt)}'`;
    if (there.some(x => x.type === 'CNAME')) errors.push(`${zoneLabel}: ${what} is a CNAME (illegal)`);
    else if (!there.some(x => x.type === 'A' || x.type === 'AAAA')) (r.type === 'NS' ? errors : messages).push(`${zoneLabel}: ${what} has no address records (A or AAAA)`);
  }
  if (errors.length) return { messages: [...messages, ...errors, `${zoneLabel}: not loaded due to errors.`], failure: errors[0].replace(`${zoneLabel}: `, '') };
  const soa = soas[0], f = soa.data.split(' ');
  const zone: Zone = { origin: origin0, records, serial: Number(f[2]), soa, negativeTtl: Math.min(soa.ttl, Number(f[6])) };
  return { zone, messages: [...messages, `${zoneLabel}: loaded serial ${zone.serial}`] };
}

/** The zones named.conf.local declares: zone "name" { type master|primary; file "path"; }; (relative files are in /var/cache/bind). */
export function namedConf(text: string): { origin: string; file: string }[] {
  const out: { origin: string; file: string }[] = [];
  const clean = text.replace(/\/\/.*$|#.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of clean.matchAll(/zone\s+"([^"]+)"\s*(?:IN\s*)?\{([^}]*)\}\s*;/gi)) {
    const type = /type\s+(\w+)\s*;/i.exec(m[2])?.[1].toLowerCase(), file = /file\s+"([^"]+)"\s*;/i.exec(m[2])?.[1];
    if ((type === 'master' || type === 'primary') && file) out.push({ origin: absolute(m[1]), file: file.startsWith('/') ? file : `/var/cache/bind/${file}` });
  }
  return out;
}

/** named's process on the machine (it runs as bind). */
export const namedProcess = (state: FsState): Proc | undefined => tableOf(state).find(p => commOf(p.command) === 'named' && !p.stat.startsWith('Z'));

/** A file's text as `user` may read it (named reads its zones as bind). */
function readAs(state: FsState, user: string, path: string): { text: string } | { error: string } {
  const acc = accountsOf(state), view = { ...state, user, groups: loginGroups(acc, user) };
  const r = readPath(view, path);
  if ('error' in r) return { error: r.error === 'EACCES' ? 'permission denied' : r.error === 'EISDIR' ? 'is a directory' : 'file not found' };
  return { text: r.text };
}

/**
 * named (re)loads: named.conf.local's zones from their files, as bind. `previous`: what it served before (a zone that
 * fails to reload keeps it, as BIND does); none on a fresh start. Returns the zones and the lines named journals.
 */
export function loadNamed(state: FsState, previous?: readonly NamedZone[], only?: string): { zones: NamedZone[]; log: string[]; failed: string[] } {
  const conf = readAs(state, 'bind', NAMED_CONF_LOCAL);
  const declared = 'error' in conf ? [] : namedConf(conf.text);
  const zones: NamedZone[] = [], log: string[] = [], failed: string[] = [];
  for (const d of declared) {
    const old = previous?.find(z => lower(z.origin) === lower(d.origin) && z.file === d.file);
    if (only !== undefined && lower(absolute(only)) !== lower(d.origin) && old) { zones.push(old); continue; }
    const read = readAs(state, 'bind', d.file);
    if ('error' in read) {
      const msg = `zone ${shownName(d.origin)}/IN: loading from master file ${d.file} failed: ${read.error}`;
      log.push(msg, `zone ${shownName(d.origin)}/IN: not loaded due to errors.`);
      failed.push(read.error);
      zones.push(old?.zone ? { ...old, error: read.error } : { origin: d.origin, file: d.file, error: read.error });
      continue;
    }
    const z = loadZone(d.origin, read.text, d.file);
    log.push(...z.messages);
    if (z.zone) zones.push({ origin: d.origin, file: d.file, text: read.text, zone: z.zone });
    else { failed.push(z.failure!); zones.push(old?.zone ? { ...old, error: z.failure } : { origin: d.origin, file: d.file, text: read.text, error: z.failure }); }
  }
  return { zones, log, failed };
}

function journal(state: FsState, messages: readonly string[], priority = 6): FsState {
  if (!state.journal || !messages.length) return state;
  const p = namedProcess(state), now = clockOf(state).now;
  const entries = messages.map(message => ({ time: now, unit: 'named.service', id: 'named', ...p ? { pid: p.pid } : {}, priority: /failed|not loaded|error/.test(message) ? 3 : priority, message }));
  return { ...state, journal: [...state.journal, ...entries].slice(-MAX_JOURNAL) };
}
const dnsOf = (state: FsState): DnsState => state.dns ?? { cache: [], queries: 0 };

/** E11: after systemctl, a named that started (a new pid) loaded its zones afresh; systemctl reload named is rndc reload. */
export function afterSystemctl(before: FsState, after: FsState, args: readonly string[], status: number): FsState {
  if (!after.dns?.named) return after;
  const a = namedProcess(before)?.pid, b = namedProcess(after)?.pid;
  if (b !== undefined && a !== b) {
    const r = loadNamed(after);
    return journal({ ...after, dns: { ...dnsOf(after), named: r.zones } }, [...r.log, 'all zones loaded', 'running']);
  }
  const verb = args.find(x => !x.startsWith('-')), units = args.filter(x => !x.startsWith('-')).slice(1).map(u => u.replace(/\.service$/, ''));
  if (status === 0 && b !== undefined && (verb === 'reload' || verb === 'reload-or-restart') && units.some(u => u === 'named' || u === 'bind9')) {
    const r = loadNamed(after, after.dns.named);
    return journal({ ...after, dns: { ...dnsOf(after), named: r.zones } }, ['received SIGHUP or control channel command \'reload\'', ...r.log, 'reloading zones succeeded']);
  }
  return after;
}

// ------------------------------------------------------------------------------------------------------- answering

export type Rcode = 'NOERROR' | 'NXDOMAIN' | 'SERVFAIL' | 'REFUSED';
const RCODE_NUMBER: Record<Rcode, number> = { NOERROR: 0, SERVFAIL: 2, NXDOMAIN: 3, REFUSED: 5 };
/** An answer: records with the TTL to show, the authority section, the flags. */
export interface Answer { rcode: Rcode; answer: Rr[]; authority: Rr[]; aa: boolean; ra: boolean; cached: boolean }

/** The authoritative answer of a zone (in-zone CNAME targets followed, as BIND does). */
export function zoneAnswer(zone: Zone, qname: string, qtype: RrType): { rcode: 'NOERROR' | 'NXDOMAIN'; answer: Rr[]; authority: Rr[] } {
  const answer: Rr[] = [];
  let name = qname;
  for (let hop = 0; hop < 16; hop++) {
    const here = zone.records.filter(r => lower(r.name) === lower(name));
    const match = here.filter(r => r.type === qtype);
    if (match.length) return { rcode: 'NOERROR', answer: [...answer, ...match], authority: [] };
    const cname = qtype !== 'CNAME' ? here.find(r => r.type === 'CNAME') : undefined;
    if (cname) {
      answer.push(cname);
      if (!within(cname.data, zone.origin)) return { rcode: 'NOERROR', answer, authority: [] };
      name = cname.data;
      continue;
    }
    const soa = { ...zone.soa, ttl: zone.negativeTtl };
    const exists = here.length > 0 || zone.records.some(r => lower(r.name).endsWith(`.${lower(name)}`));
    return { rcode: exists ? 'NOERROR' : 'NXDOMAIN', answer, authority: [soa] };
  }
  return { rcode: 'NOERROR', answer, authority: [] };
}

/** Where the data of a name lives: a zone, or a zone whose server cannot answer (SERVFAIL), or nothing known. */
type Source = { zone: Zone } | { servfail: string } | undefined;
function sourceFor(state: FsState, name: string): Source {
  const named: { origin: string; zone?: Zone; up: boolean }[] = [];
  const add = (s: FsState) => { const up = !!namedProcess(s); for (const z of s.dns?.named ?? []) named.push({ origin: z.origin, ...z.zone ? { zone: z.zone } : {}, up }); };
  add(state);
  for (const h of state.net?.hosts ?? []) add(h.state);
  const candidates = [...named.map(n => ({ ...n, internet: false })), ...(state.dns?.internet ?? []).map(z => ({ origin: z.origin, zone: z as Zone | undefined, up: true, internet: true }))]
    .filter(c => within(name, c.origin))
    .sort((a, b) => b.origin.length - a.origin.length || Number(a.internet) - Number(b.internet));
  const best = candidates[0];
  if (!best) return undefined;
  if (!best.up) return { servfail: `the server of ${shownName(best.origin)} is down` };
  return best.zone ? { zone: best.zone } : { servfail: `${shownName(best.origin)} did not load` };
}

const alive = (e: CacheEntry, now: number) => e.ttl - (now - e.cachedAt) > 0;
const remaining = (e: CacheEntry, now: number) => e.ttl - (now - e.cachedAt);
const rrOf = (name: string, type: RrType, ttl: number, data: string): Rr => ({ name, type, ttl, data, line: 0 });
const soaRr = (text: string, ttl: number): Rr => { const [name, ...rest] = text.split(' '); return rrOf(name, 'SOA', ttl, rest.join(' ')); };

/**
 * systemd-resolved: /etc/hosts first (TTL 0), then the cache (remaining TTL), then the authoritative data (cached with
 * cachedAt = now). CNAME chains are followed across zones. Returns the answer and the state with its cache updated.
 */
export function recursive(state: FsState, qname0: string, qtype: RrType): { state: FsState; answer: Answer } {
  const now = clockOf(state).now, dns = dnsOf(state), qname = absolute(qname0);
  if (qtype === 'A' || qtype === 'AAAA') {
    const e = hostsLookup(state, qname, qtype === 'A' ? 4 : 6);
    if (e) {
      const address = qtype === 'AAAA' ? canonicalIPv6(e.address) ?? e.address : e.address;
      return { state, answer: { rcode: 'NOERROR', answer: [rrOf(qname, qtype, 0, address)], authority: [], aa: false, ra: true, cached: true } };
    }
  }
  let cache = dns.cache.filter(e => alive(e, now));
  const answer: Rr[] = [];
  let name = qname, cached = true;
  const store = (rrs: readonly Rr[]) => {
    const groups = new Map<string, Rr[]>();
    for (const r of rrs) { const k = `${lower(r.name)} ${r.type}`; groups.set(k, [...groups.get(k) ?? [], r]); }
    for (const g of groups.values()) {
      cache = cache.filter(e => !(lower(e.name) === lower(g[0].name) && e.type === g[0].type));
      cache.push({ name: lower(g[0].name), type: g[0].type, ttl: g[0].ttl, cachedAt: now, data: g.map(r => r.data) });
    }
  };
  const done = (rcode: Rcode, authority: Rr[] = []) => ({ state: { ...state, dns: { ...dns, cache } }, answer: { rcode, answer, authority, aa: false, ra: true, cached } });
  for (let hop = 0; hop < 16; hop++) {
    const hit = (type: RrType) => cache.find(e => lower(e.name) === lower(name) && (e.type === type || ('negative' in e && e.negative === 'NXDOMAIN')));
    const direct = hit(qtype);
    if (direct) {
      if ('negative' in direct) return done(direct.negative === 'NXDOMAIN' ? 'NXDOMAIN' : 'NOERROR', direct.soa ? [soaRr(direct.soa, remaining(direct, now))] : []);
      answer.push(...direct.data.map(d => rrOf(name, qtype, remaining(direct, now), d)));
      return done('NOERROR');
    }
    const alias = qtype !== 'CNAME' ? cache.find(e => lower(e.name) === lower(name) && e.type === 'CNAME' && 'data' in e) : undefined;
    if (alias && 'data' in alias) { answer.push(rrOf(name, 'CNAME', remaining(alias, now), alias.data[0])); name = alias.data[0]; continue; }
    cached = false;
    const src = sourceFor(state, name);
    if (!src) return done('NXDOMAIN');
    if ('servfail' in src) return done('SERVFAIL');
    const r = zoneAnswer(src.zone, name, qtype);
    store(r.answer);
    answer.push(...r.answer);
    if (r.rcode === 'NXDOMAIN' || !r.answer.length || (r.answer.length && r.authority.length)) {
      const soa = r.authority[0], at = r.answer.length ? r.answer[r.answer.length - 1].data : name;
      if (soa) {
        cache = cache.filter(e => !(lower(e.name) === lower(at) && (e.type === qtype || r.rcode === 'NXDOMAIN')));
        cache.push({ name: lower(at), type: qtype, ttl: soa.ttl, cachedAt: now, negative: r.rcode === 'NXDOMAIN' ? 'NXDOMAIN' : 'NODATA', soa: `${soa.name} ${soa.data}` });
      }
      return done(r.rcode, r.authority);
    }
    const last = r.answer[r.answer.length - 1];
    if (last.type === 'CNAME' && qtype !== 'CNAME') { name = last.data; continue; }
    return done('NOERROR');
  }
  return done('SERVFAIL');
}

/** named answering directly: authoritative for its loaded zones, REFUSED for any other name (recursion is off). */
export function authoritative(server: FsState, qname0: string, qtype: RrType): Answer {
  const qname = absolute(qname0);
  const zones = (server.dns?.named ?? []).filter(z => within(qname, z.origin)).sort((a, b) => b.origin.length - a.origin.length);
  const z = zones[0];
  if (!z) return { rcode: 'REFUSED', answer: [], authority: [], aa: false, ra: false, cached: false };
  if (!z.zone) return { rcode: 'SERVFAIL', answer: [], authority: [], aa: false, ra: false, cached: false };
  const r = zoneAnswer(z.zone, qname, qtype);
  return { rcode: r.rcode, answer: r.answer, authority: r.authority, aa: true, ra: false, cached: false };
}

// ------------------------------------------------------------------------------------------------- nameservers, NSS

/** The first nameserver of /etc/resolv.conf (127.0.0.53 on Ubuntu; dig falls back to 127.0.0.1 without one). */
export function nameserverOf(state: FsState): string {
  const n = state.nodes.get(physicalPath(state.nodes, '/etc/resolv.conf', true));
  const m = n?.kind === 'file' ? /^\s*nameserver\s+(\S+)/m.exec(n.content ?? '') : null;
  return m ? m[1] : '127.0.0.1';
}
type Asked = { kind: 'answer'; state: FsState; answer: Answer; via: 'resolved' | 'named'; server: FsState }
  | { kind: 'error'; state: FsState; error: 'refused' | 'timeout' };
/** Sends a query to address:53 from `state`: systemd-resolved recurses with its cache, named answers authoritatively. */
export function ask(state: FsState, address: string, qname: string, qtype: RrType): Asked {
  const r = reach(state, address, 53, 'udp');
  if (r.result === 'timeout') return { kind: 'error', state, error: 'timeout' };
  if (r.result === 'refused') return { kind: 'error', state, error: 'refused' };
  const comm = commOf(r.socket.holders[0]?.proc.command ?? '');
  if (comm === 'named') return { kind: 'answer', state, answer: authoritative(r.host, qname, qtype), via: 'named', server: r.host };
  if (comm.startsWith('systemd-resolve') && r.at === 'self') {
    const x = recursive(state, qname, qtype);
    return { kind: 'answer', state: x.state, answer: x.answer, via: 'resolved', server: x.state };
  }
  return { kind: 'error', state, error: 'timeout' };
}

/** E11: glibc's lookup from the dns profile up: /etc/hosts, then DNS through resolv.conf's nameserver (CNAMEs give the canonical name). */
export const dnsResolver: Resolver = (state, name, family): Resolved => {
  if (family === 4 && isIPv4(name)) return { state, found: { address: name, name, aliases: [] } };
  const e = hostsLookup(state, name, family);
  if (e) return { state, found: { address: e.address, name: e.names[0], aliases: e.names.slice(1) } };
  const q = ask(state, nameserverOf(state), name, family === 4 ? 'A' : 'AAAA');
  if (q.kind === 'error') return { state: q.state, error: 'tryagain' };
  const a = q.answer;
  if (a.rcode === 'NXDOMAIN') return { state: q.state, error: 'notfound' };
  if (a.rcode !== 'NOERROR') return { state: q.state, error: 'tryagain' };
  const addr = a.answer.find(r => r.type === (family === 4 ? 'A' : 'AAAA'));
  if (!addr) return { state: q.state, error: 'notfound' };
  const aliases = a.answer.filter(r => r.type === 'CNAME').map(r => shownName(r.name));
  return { state: q.state, found: { address: addr.data, name: shownName(addr.name), aliases }, cached: q.via === 'resolved' && !!a.cached };
};

// ----------------------------------------------------------------------------------------------------- dig output

/** BIND's column rule: tabs to the target column, or one space when already past it. */
function indent(col: number, target: number): { text: string; col: number } {
  if (col >= target) return { text: ' ', col: col + 1 };
  const tabs = Math.floor(target / 8) - Math.floor(col / 8);
  return { text: '\t'.repeat(tabs), col: target };
}
/** A record as dig prints it: the TTL, class, type and data start at columns 24, 32, 40 and 48 (a question has no TTL or data). */
export function rrText(r: { name: string; ttl?: number; type: string; data?: string }, question = false): string {
  let s = question ? `;${r.name}` : r.name, col = s.length;
  const pad = (target: number) => { const i = indent(col, target); s += i.text; col = i.col; };
  const put = (text: string) => { s += text; col += text.length; };
  pad(24);
  if (!question) put(String(r.ttl));
  pad(32); put('IN');
  pad(40); put(r.type);
  if (!question) { pad(48); put(r.data ?? ''); }
  return s;
}

/** The size of the message on the wire (with name compression), for dig's MSG SIZE line. */
function wireSize(qname: string, answer: readonly Rr[], authority: readonly Rr[], edns: boolean): number {
  const offsets = new Map<string, number>();
  let size = 12;
  const name = (n: string) => {
    const labels = n.replace(/\.$/, '').split('.').filter(Boolean);
    for (let i = 0; i < labels.length; i++) {
      const suffix = lower(labels.slice(i).join('.'));
      if (offsets.has(suffix)) { size += 2; return; }
      if (size < 0x3fff) offsets.set(suffix, size);
      size += 1 + new TextEncoder().encode(labels[i]).length;
    }
    size += 1;
  };
  name(qname); size += 4;
  for (const r of [...answer, ...authority]) {
    name(r.name); size += 10;
    switch (r.type) {
      case 'A': size += 4; break;
      case 'AAAA': size += 16; break;
      case 'NS': case 'CNAME': name(r.data); break;
      case 'MX': size += 2; name(r.data.split(' ')[1]); break;
      case 'TXT': for (const m of r.data.matchAll(/"((?:[^"\\]|\\.)*)"/g)) size += 1 + new TextEncoder().encode(m[1].replace(/\\(.)/g, '$1')).length; break;
      case 'SOA': { const f = r.data.split(' '); name(f[0]); name(f[1]); size += 20; break; }
    }
  }
  return size + (edns ? 11 : 0);
}

const qid = (state: FsState, name: string, type: string) => { const d = sha256(new TextEncoder().encode(`${state.host ?? ''}/${dnsOf(state).queries}/${lower(name)}/${type}`)); return (d[0] << 8) | d[1]; };
const counted = (state: FsState): FsState => ({ ...state, dns: { ...dnsOf(state), queries: dnsOf(state).queries + 1 } });

const DIG_SECTIONS = ['cmd', 'comments', 'question', 'answer', 'authority', 'additional', 'stats'] as const;
type DigSection = typeof DIG_SECTIONS[number];

/**
 * dig [@server] name [type] [+short] [+noall] [+answer] [+[no]section] [+norecurse] [-t type]: BIND 9.18's layout. The
 * query id is fixed per machine and query; the query time is 0 ms from a cache or an authoritative server on the
 * network and 24 ms when the resolver had to ask; the EDNS line is resolved's (udp 65494) or named's (1232), without
 * named's COOKIE line.
 */
export function dig(state0: FsState, args: readonly string[], io: NetIo): NetResult {
  let server: string | undefined, name: string | undefined, type: RrType | undefined, short = false, recurse = true;
  // Fix (E15 batch): dig a b [type] asks for every name (each name takes the type written after it).
  const more: { name: string; type?: RrType }[] = [];
  const show = new Set<DigSection>(DIG_SECTIONS);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('@')) { server = a.slice(1); continue; }
    if (a === '-t') { const t = (args[++i] ?? '').toUpperCase(); if (!(RR_TYPES as readonly string[]).includes(t)) { io.err(`dig: 模擬環境的 dig 支援 ${RR_TYPES.join('、')}（${t || '-t 後面要有類型'}）`); return { state: state0, status: 1 }; } type = t as RrType; continue; }
    if (a === '-x') { io.err('dig: 模擬環境不模擬反向查詢（PTR）'); return { state: state0, status: 1 }; }
    if (a.startsWith('+')) {
      const opt = a.slice(1).toLowerCase(), no = opt.startsWith('no'), key = no ? opt.slice(2) : opt;
      if (key === 'short') { short = !no; continue; }
      if (key === 'all') { DIG_SECTIONS.forEach(s => no ? show.delete(s) : show.add(s)); continue; }
      if (key === 'recurse' || key === 'rec') { recurse = !no; continue; }
      if ((DIG_SECTIONS as readonly string[]).includes(key)) { if (no) show.delete(key as DigSection); else show.add(key as DigSection); continue; }
      if (['tcp', 'vc', 'ignore', 'search', 'edns', 'cookie', 'ttlid'].includes(key)) continue;
      io.err(`Invalid option: ${a}`);
      io.err('Usage:  dig [@global-server] [domain] [q-type] [q-class] {q-opt}');
      return { state: state0, status: 1 };
    }
    if (a.startsWith('-')) { io.err(`Invalid option: ${a}`); io.err('Usage:  dig [@global-server] [domain] [q-type] [q-class] {q-opt}'); return { state: state0, status: 1 }; }
    const up = a.toUpperCase();
    if (more.length && (RR_TYPES as readonly string[]).includes(up) && more.at(-1)!.type === undefined) { more.at(-1)!.type = up as RrType; continue; }
    if (name !== undefined && (RR_TYPES as readonly string[]).includes(up) && type === undefined && !more.length) { type = up as RrType; continue; }
    if (name !== undefined && up === 'IN') continue;
    if (name === undefined && (RR_TYPES as readonly string[]).includes(up) && args.slice(i + 1).some(x => !x.startsWith('+') && !x.startsWith('@'))) { type = up as RrType; continue; }
    if (name !== undefined && ['PTR', 'SRV', 'CAA', 'ANY', 'AXFR', 'DS', 'DNSKEY'].includes(up)) { io.err(`dig: 模擬環境的 dig 支援 ${RR_TYPES.join('、')}（${up}）`); return { state: state0, status: 1 }; }
    if (name !== undefined) { more.push({ name: a }); continue; }
    name = a;
  }
  if (more.length) {
    // One lookup after another, with the same options (the first prints dig's header line, as dig does).
    const opts = args.filter(a => a.startsWith('+') || a.startsWith('@'));
    let state = state0, status = 0;
    for (const [k, q] of [{ name: name!, type }, ...more].entries()) {
      const r = dig(state, [...opts, ...k ? ['+nocmd'] : [], q.name, ...q.type ? [q.type] : []], io);
      state = r.state;
      status = r.status || status;
    }
    return { state, status };
  }
  const qname = absolute(name ?? '.'), qtype: RrType = type ?? (name === undefined ? 'NS' : 'A');
  const problem = nameProblem(qname);
  if (problem) { io.err(`dig: '${name}' is not a legal name (${problem})`); return { state: state0, status: 10 }; }
  let state = state0;
  let address = server ?? nameserverOf(state);
  if (server !== undefined && !isIPv4(server)) {
    const r = io.resolve(state, server, 4);
    state = r.state;
    if ('error' in r) { io.err(`dig: couldn't get address for '${server}': not found`); return { state, status: 10 }; }
    address = r.found.address;
  }
  const head = () => {
    if (!show.has('cmd') || short) return [];
    return ['', `; <<>> ${DIG_VERSION} <<>> ${args.join(' ')}`.replace(/\s+$/, ''), ...server !== undefined ? ['; (1 server found)'] : [], ';; global options: +cmd'];
  };
  const q = ask(state, address, qname, qtype);
  state = counted(q.state);
  const out: string[] = [];
  if (q.kind === 'error') {
    const why = q.error === 'refused' ? 'connection refused' : 'timed out';
    for (let k = 0; k < 3; k++) io.err(`;; communications error to ${address}#53: ${why}`);
    out.push(...head(), ';; no servers could be reached');
    if (!short && show.has('cmd')) out.push('');
    out.forEach(l => io.out(`${l}\n`));
    return { state, status: 9 };
  }
  const a = q.answer;
  if (short) { a.answer.forEach(r => io.out(`${r.data}\n`)); return { state, status: 0 }; }
  const flags = ['qr', ...a.aa ? ['aa'] : [], ...recurse ? ['rd'] : [], ...a.ra ? ['ra'] : []];
  const comments = show.has('comments');
  out.push(...head());
  if (comments) {
    out.push(';; Got answer:', `;; ->>HEADER<<- opcode: QUERY, status: ${a.rcode}, id: ${qid(q.state, qname, qtype)}`,
      `;; flags: ${flags.join(' ')}; QUERY: 1, ANSWER: ${a.answer.length}, AUTHORITY: ${a.authority.length}, ADDITIONAL: 1`);
    if (recurse && !a.ra) out.push(';; WARNING: recursion requested but not available');
    out.push('');
    if (show.has('additional')) out.push(';; OPT PSEUDOSECTION:', `; EDNS: version: 0, flags:; udp: ${q.via === 'resolved' ? 65494 : 1232}`);
  }
  if (show.has('question')) { if (comments) out.push(';; QUESTION SECTION:'); out.push(rrText({ name: qname, type: qtype }, true)); if (comments) out.push(''); }
  if (show.has('answer') && a.answer.length) { if (comments) out.push(';; ANSWER SECTION:'); a.answer.forEach(r => out.push(rrText(r))); if (comments) out.push(''); }
  if (show.has('authority') && a.authority.length) { if (comments) out.push(';; AUTHORITY SECTION:'); a.authority.forEach(r => out.push(rrText(r))); if (comments) out.push(''); }
  if (show.has('stats')) {
    const ms = q.via === 'resolved' && !a.cached ? 24 : 0;
    out.push(`;; Query time: ${ms} msec`, `;; SERVER: ${address}#53(${address}) (UDP)`, `;; WHEN: ${zoneDate(zoneOf(state), clockOf(state).now)}`,
      `;; MSG SIZE  rcvd: ${wireSize(qname, a.answer, a.authority, true)}`, '');
  }
  out.forEach(l => io.out(`${l}\n`));
  return { state, status: 0 };
}

/** host [-t type] name [server]: the BIND host tool's sentences; NXDOMAIN and other failures exit 1. */
export function host(state0: FsState, args: readonly string[], io: NetIo): NetResult {
  let type: RrType | undefined;
  const operands: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-t') { const t = (args[++i] ?? '').toUpperCase(); if (!(RR_TYPES as readonly string[]).includes(t)) { io.err(`host: 模擬環境的 host 支援 ${RR_TYPES.join('、')}（${t}）`); return { state: state0, status: 1 }; } type = t as RrType; continue; }
    if (a.startsWith('-t')) { const t = a.slice(2).toUpperCase(); if (!(RR_TYPES as readonly string[]).includes(t)) { io.err(`host: 模擬環境的 host 支援 ${RR_TYPES.join('、')}（${t}）`); return { state: state0, status: 1 }; } type = t as RrType; continue; }
    if (a.startsWith('-')) { io.err(`host: invalid option -- '${a.slice(1, 2)}'`); io.err('Usage: host [-t type] hostname [server]'); return { state: state0, status: 1 }; }
    operands.push(a);
  }
  if (!operands.length || operands.length > 2) { io.err('Usage: host [-aCdilrTvVw] [-c class] [-N ndots] [-t type] [-W time]'); io.err('            [-R number] [-m flag] [-p port] hostname [server]'); return { state: state0, status: 1 }; }
  const [name, server] = operands;
  if (isIPv4(name)) { io.err('host: 模擬環境不模擬反向查詢（PTR）'); return { state: state0, status: 1 }; }
  let state = state0, address = server ?? nameserverOf(state);
  if (server !== undefined && !isIPv4(server)) {
    const r = io.resolve(state, server, 4);
    state = r.state;
    if ('error' in r) { io.err(`host: couldn't get address for '${server}': not found`); return { state, status: 1 }; }
    address = r.found.address;
  }
  if (server !== undefined) ['Using domain server:', `Name: ${server}`, `Address: ${address}#53`, 'Aliases:', ''].forEach(l => io.out(`${l}\n`));
  const say = (r: Rr) => {
    const n = shownName(r.name);
    switch (r.type) {
      case 'A': return `${n} has address ${r.data}`;
      case 'AAAA': return `${n} has IPv6 address ${r.data}`;
      case 'CNAME': return `${n} is an alias for ${r.data}`;
      case 'MX': return `${n} mail is handled by ${r.data}`;
      case 'TXT': return `${n} descriptive text ${r.data}`;
      case 'NS': return `${n} name server ${r.data}`;
      case 'SOA': return `${n} has SOA record ${r.data}`;
    }
  };
  const types: RrType[] = type ? [type] : ['A', 'AAAA', 'MX'];
  const seen = new Set<string>();
  const status = 0;
  for (const t of types) {
    const q = ask(state, address, name, t);
    state = counted(q.state);
    if (q.kind === 'error') { io.out(';; connection timed out; no servers could be reached\n'); return { state, status: 1 }; }
    const a = q.answer;
    if (a.rcode !== 'NOERROR') { io.out(`Host ${shownName(absolute(name))} not found: ${RCODE_NUMBER[a.rcode]}(${a.rcode})\n`); return { state, status: 1 }; }
    for (const r of a.answer) { const line = say(r); if (!seen.has(line)) { seen.add(line); io.out(`${line}\n`); } }
    if (type && !a.answer.some(r => r.type === t)) io.out(`${shownName(absolute(name))} has no ${t} record\n`);
  }
  return { state, status };
}

/** named-checkzone [-q] zone file: loads the file as named would and prints its messages; OK and exit 0 when it loads. */
export function namedCheckzone(state: FsState, args: readonly string[], io: NetIo): NetResult {
  const quiet = args[0] === '-q', rest = quiet ? args.slice(1) : args;
  if (rest.length !== 2 || rest.some(a => a.startsWith('-'))) { io.err('usage: named-checkzone [-djqvD] [-c class] [-f inputformat] [-F outputformat]'); io.err('               zonename [ (filename|-) ]'); return { state, status: 1 }; }
  const [zone, file] = rest;
  const read = readPath(state, file);
  if ('error' in read) {
    const why = read.error === 'EACCES' ? 'permission denied' : read.error === 'EISDIR' ? 'is a directory' : 'file not found';
    if (!quiet) [`zone ${shownName(absolute(zone))}/IN: loading from master file ${file} failed: ${why}`, `zone ${shownName(absolute(zone))}/IN: not loaded due to errors.`].forEach(l => io.out(`${l}\n`));
    return { state, status: 1 };
  }
  const r = loadZone(zone, read.text, file);
  if (!quiet) { r.messages.forEach(l => io.out(`${l}\n`)); if (r.zone) io.out('OK\n'); }
  return { state, status: r.zone ? 0 : 1 };
}

/** rndc reload [zone] (root only): named rereads named.conf.local and the zone files; a zone that fails keeps its old data. */
export function rndc(state: FsState, args: readonly string[], io: NetIo): NetResult {
  if (io.user !== 'root') { io.err('rndc: neither /etc/bind/rndc.conf nor /etc/bind/rndc.key was found'); return { state, status: 1 }; }
  const [cmd, zone, ...extra] = args;
  if (cmd === undefined) { io.err('Usage: rndc [-b address] [-c config] [-s server] [-p port]'); io.err('\t[-k key-file ] [-y key] [-r] [-V] [-4 | -6] command'); return { state, status: 1 }; }
  if (cmd !== 'reload') { io.err(`rndc: 模擬環境的 rndc 只支援 reload（rndc reload、rndc reload 區域）`); return { state, status: 1 }; }
  if (!namedProcess(state) || !state.dns?.named) { io.err('rndc: connect failed: 127.0.0.1#953: connection refused'); return { state, status: 1 }; }
  if (extra.length) { io.err(`rndc: 'reload' failed: extra input text`); return { state, status: 1 }; }
  const before = state.dns.named, conf = readAs(state, 'bind', NAMED_CONF_LOCAL);
  const declared = 'text' in conf ? namedConf(conf.text) : [];
  if (zone !== undefined && !before.some(z => lower(z.origin) === lower(absolute(zone))) && !declared.some(d => lower(d.origin) === lower(absolute(zone)))) {
    io.err(`rndc: 'reload' failed: not found`);
    io.err(`no matching zone '${zone}' in any view`);
    return { state, status: 1 };
  }
  const r = loadNamed(state, before, zone);
  const next = journal({ ...state, dns: { ...state.dns, named: r.zones } }, zone === undefined ? ['received control channel command \'reload\'', ...r.log, 'reloading configuration succeeded', 'reloading zones succeeded'] : [`received control channel command 'reload ${zone}'`, ...r.log]);
  if (zone === undefined) { io.out('server reload successful\n'); return { state: next, status: 0 }; }
  if (r.failed.length) { io.err(`rndc: 'reload' failed: ${r.failed[0]}`); return { state: next, status: 1 }; }
  const old = before.find(z => lower(z.origin) === lower(absolute(zone))), now = r.zones.find(z => lower(z.origin) === lower(absolute(zone)));
  io.out(old?.text !== undefined && old.text === now?.text && !old.error ? 'zone reload up-to-date\n' : 'zone reload queued\n');
  return { state: next, status: 0 };
}

/** resolvectl flush-caches (root, as without a polkit agent): empties systemd-resolved's cache. */
export function resolvectl(state: FsState, args: readonly string[], io: NetIo): NetResult {
  if (args[0] !== 'flush-caches' || args.length !== 1) { io.err('resolvectl: 模擬環境的 resolvectl 只支援 flush-caches'); return { state, status: 1 }; }
  if (io.user !== 'root') { io.err('Failed to flush caches: Interactive authentication required.'); return { state, status: 1 }; }
  return { state: { ...state, dns: { ...dnsOf(state), cache: [] } }, status: 0 };
}

/** E11 (lesson checks): what a name's records are now: at a host's named (authoritative), or through the local resolver. */
export function dnsValues(state: FsState, name: string, type: RrType, server?: FsState): { rcode: Rcode; values: string[] } {
  const a = server ? authoritative(server, name, type) : recursive(state, name, type).answer;
  return { rcode: a.rcode, values: a.answer.filter(r => r.type === type).map(r => r.data) };
}
