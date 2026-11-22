import { baseName, childrenOf, joinPath, parentOf, physicalPath, resolvePath, type FsNode, type FsState } from './fs';
import { accountsOf, findUser, loginGroups } from './accounts';
import { fields, MONTHS } from './clock';
import { offsetAt, offsetText, toLocal, zoneOf } from './calendar';
import { clockOf, commOf, nextPid, tableOf, type Proc } from './processes';
import { afterSignal, MAX_JOURNAL } from './services';
import { walk } from './shell';
import { matchName } from './glob';
import { isIPv4, ownsAddress, type Listen, type NetIo, type NetResult } from './sockets';
import { errorPage, httpDate, reasonOf, type Request, type Response } from './http';
import { certsIn, keyIn, keyMatches, readAs, type Cert } from './tls';
import { freshPeers, pickPeer, peerFailed, peerSucceeded, timeValue, type PeerState, type UpServer, type Upstream } from './proxy';
import { cacheFile, cacheText, headerOf, md5, nginxEtag, notModified, storable, validFor, varyKey, varyNames, varyOf, writeCacheFile, type CacheZone, type NgEntry } from './cache';
import { LIMITS } from './fs';

/*
 * Engine stage E14 (docs/curriculum/SRV0_SERVER_CAPABILITY.md §12): nginx 1.24.0 as Ubuntu 24.04 packages it. The
 * configuration is really parsed — /etc/nginx/nginx.conf with include (globs, the sites-enabled links), events, http,
 * server and location blocks — into what the master process runs with. Like named (E11) and sshd (E7), the running nginx
 * keeps the configuration it loaded at start or at the last successful reload: editing a file changes nothing until
 * `nginx -s reload` or `systemctl reload nginx`, and a reload that fails the configuration test keeps the old one (a
 * restart with a broken file takes the site down). The listening sockets come from the applied listen directives, and
 * requests are answered from the simulated file system: server selection by address, port and Host (or SNI), location
 * selection in nginx's documented order, root/alias/index/try_files/return/rewrite/error_page/add_header, files read as
 * the worker user, combined access-log lines and error-log lines on the fixed clock. Reverse proxying (proxy_pass,
 * upstream) is engine stage E15: below the proxy profile such a configuration fails the test with a message that says so;
 * from it up, proxy_pass sends the request to an upstream (round robin, least_conn, ip_hash, backup, passive health checks;
 * proxy.ts) through the caller's network (Exchange2.upstream) and answers 502/504 with nginx's error-log lines.
 * E18 (the edge profile and above): proxy_cache (proxy_cache_path's zones, keys, proxy_cache_valid, bypass and no_cache,
 * use_stale, background updates, revalidation; cache.ts) with $upstream_cache_status, `expires`, and the static module's
 * Last-Modified, ETag and Accept-Ranges with conditional requests (304); fail_timeout passes with the clock.
 */

export const NGINX_VERSION = 'nginx/1.24.0 (Ubuntu)';
export const NGINX_CONF = '/etc/nginx/nginx.conf';
const PREFIX = '/etc/nginx';
const DEFAULT_ACCESS = '/var/log/nginx/access.log', DEFAULT_ERROR = '/var/log/nginx/error.log';
export const NGINX_MASTER = 'nginx: master process /usr/sbin/nginx -g daemon on; master_process on;';
export const NGINX_WORKER = 'nginx: worker process';

// ---------------------------------------------------------------------------------------------------------- parsing

/** A directive as parsed: its name, arguments, where it was written and (for a block) what is inside. */
export interface Dir { name: string; args: string[]; file: string; line: number; block?: Dir[] }
type Ctx = 'main' | 'events' | 'http' | 'server' | 'location' | 'types' | 'if' | 'upstream' | 'map';
interface Spec { ctx: readonly Ctx[]; min: number; max: number; block?: true; flag?: true; once?: true }
const ANY = Infinity, HSL: Ctx[] = ['http', 'server', 'location'], HS: Ctx[] = ['http', 'server'];
const SPEC: Record<string, Spec> = {
  user: { ctx: ['main'], min: 1, max: 2, once: true }, worker_processes: { ctx: ['main'], min: 1, max: 1, once: true }, pid: { ctx: ['main'], min: 1, max: 1, once: true },
  worker_rlimit_nofile: { ctx: ['main'], min: 1, max: 1 }, error_log: { ctx: ['main', ...HSL], min: 1, max: 2 },
  include: { ctx: ['main', 'events', 'http', 'server', 'location', 'types'], min: 1, max: 1 },
  events: { ctx: ['main'], min: 0, max: 0, block: true, once: true }, worker_connections: { ctx: ['events'], min: 1, max: 1, once: true },
  multi_accept: { ctx: ['events'], min: 1, max: 1, flag: true }, use: { ctx: ['events'], min: 1, max: 1 },
  http: { ctx: ['main'], min: 0, max: 0, block: true, once: true }, server: { ctx: ['http'], min: 0, max: 0, block: true },
  location: { ctx: ['server', 'location'], min: 1, max: 2, block: true }, types: { ctx: HSL, min: 0, max: 0, block: true },
  listen: { ctx: ['server'], min: 1, max: ANY }, server_name: { ctx: ['server'], min: 1, max: ANY },
  root: { ctx: HSL, min: 1, max: 1, once: true }, alias: { ctx: ['location'], min: 1, max: 1, once: true }, index: { ctx: HSL, min: 1, max: ANY },
  try_files: { ctx: ['server', 'location'], min: 2, max: ANY, once: true }, return: { ctx: ['server', 'location', 'if'], min: 1, max: 2 },
  rewrite: { ctx: ['server', 'location', 'if'], min: 2, max: 3 }, if: { ctx: ['server', 'location'], min: 1, max: 4, block: true }, add_header: { ctx: HSL, min: 2, max: 3 }, error_page: { ctx: HSL, min: 2, max: ANY },
  access_log: { ctx: HSL, min: 1, max: 3 }, keepalive_timeout: { ctx: HSL, min: 1, max: 2, once: true }, default_type: { ctx: HSL, min: 1, max: 1, once: true },
  allow: { ctx: HSL, min: 1, max: 1 }, deny: { ctx: HSL, min: 1, max: 1 },
  ssl_certificate: { ctx: HS, min: 1, max: 1 }, ssl_certificate_key: { ctx: HS, min: 1, max: 1 }, ssl_protocols: { ctx: HS, min: 1, max: ANY },
  ssl_ciphers: { ctx: HS, min: 1, max: 1 }, ssl_prefer_server_ciphers: { ctx: HS, min: 1, max: 1, flag: true }, ssl_session_cache: { ctx: HS, min: 1, max: 2 },
  ssl_session_timeout: { ctx: HS, min: 1, max: 1 }, ssl_session_tickets: { ctx: HS, min: 1, max: 1, flag: true }, ssl_dhparam: { ctx: HS, min: 1, max: 1 },
  sendfile: { ctx: HSL, min: 1, max: 1, flag: true }, tcp_nopush: { ctx: HSL, min: 1, max: 1, flag: true }, tcp_nodelay: { ctx: HSL, min: 1, max: 1, flag: true },
  gzip: { ctx: HSL, min: 1, max: 1, flag: true }, gzip_vary: { ctx: HSL, min: 1, max: 1, flag: true }, gzip_types: { ctx: HSL, min: 1, max: ANY },
  gzip_proxied: { ctx: HSL, min: 1, max: ANY }, gzip_comp_level: { ctx: HSL, min: 1, max: 1 }, gzip_min_length: { ctx: HSL, min: 1, max: 1 },
  server_tokens: { ctx: HSL, min: 1, max: 1, flag: true }, autoindex: { ctx: HSL, min: 1, max: 1, flag: true }, log_not_found: { ctx: HSL, min: 1, max: 1, flag: true },
  absolute_redirect: { ctx: HSL, min: 1, max: 1, flag: true }, port_in_redirect: { ctx: HSL, min: 1, max: 1, flag: true }, server_name_in_redirect: { ctx: HSL, min: 1, max: 1, flag: true },
  types_hash_max_size: { ctx: HSL, min: 1, max: 1 }, server_names_hash_bucket_size: { ctx: ['http'], min: 1, max: 1 }, client_max_body_size: { ctx: HSL, min: 1, max: 1 },
  charset: { ctx: HSL, min: 1, max: 1 }, expires: { ctx: HSL, min: 1, max: 2 }, etag: { ctx: HSL, min: 1, max: 1, flag: true },
};
/** E15 (the proxy profile and above): reverse proxying, upstream blocks and map. */
const PROXY_SPEC: Record<string, Spec> = {
  proxy_pass: { ctx: ['location'], min: 1, max: 1 }, proxy_set_header: { ctx: HSL, min: 2, max: 2 }, proxy_http_version: { ctx: HSL, min: 1, max: 1, once: true },
  proxy_connect_timeout: { ctx: HSL, min: 1, max: 1, once: true }, proxy_read_timeout: { ctx: HSL, min: 1, max: 1, once: true }, proxy_send_timeout: { ctx: HSL, min: 1, max: 1, once: true },
  proxy_redirect: { ctx: HSL, min: 1, max: 2 }, proxy_buffering: { ctx: HSL, min: 1, max: 1, flag: true }, proxy_request_buffering: { ctx: HSL, min: 1, max: 1, flag: true },
  proxy_intercept_errors: { ctx: HSL, min: 1, max: 1, flag: true }, proxy_next_upstream: { ctx: HSL, min: 1, max: ANY }, proxy_next_upstream_tries: { ctx: HSL, min: 1, max: 1 },
  proxy_hide_header: { ctx: HSL, min: 1, max: 1 }, proxy_pass_header: { ctx: HSL, min: 1, max: 1 }, proxy_buffer_size: { ctx: HSL, min: 1, max: 1 }, proxy_buffers: { ctx: HSL, min: 2, max: 2 },
  upstream: { ctx: ['http'], min: 1, max: 1, block: true }, map: { ctx: ['http'], min: 2, max: 2, block: true },
};
/** E18 (the edge profile and above): nginx's proxy cache and the validators of the static module. */
const EDGE_SPEC: Record<string, Spec> = {
  proxy_cache_path: { ctx: ['http'], min: 2, max: ANY }, proxy_cache: { ctx: HSL, min: 1, max: 1, once: true }, proxy_cache_key: { ctx: HSL, min: 1, max: 1, once: true },
  proxy_cache_valid: { ctx: HSL, min: 1, max: ANY }, proxy_cache_bypass: { ctx: HSL, min: 1, max: ANY }, proxy_no_cache: { ctx: HSL, min: 1, max: ANY },
  proxy_cache_use_stale: { ctx: HSL, min: 1, max: ANY }, proxy_cache_lock: { ctx: HSL, min: 1, max: 1, flag: true }, proxy_cache_lock_timeout: { ctx: HSL, min: 1, max: 1, once: true },
  proxy_cache_lock_age: { ctx: HSL, min: 1, max: 1, once: true }, proxy_cache_background_update: { ctx: HSL, min: 1, max: 1, flag: true }, proxy_cache_revalidate: { ctx: HSL, min: 1, max: 1, flag: true },
  proxy_cache_methods: { ctx: HSL, min: 1, max: ANY }, proxy_cache_min_uses: { ctx: HSL, min: 1, max: 1, once: true }, proxy_ignore_headers: { ctx: HSL, min: 1, max: ANY },
  if_modified_since: { ctx: HSL, min: 1, max: 1, once: true },
};
/** Fix (E19 batch): directives that only an upstream block has ("not allowed here" elsewhere, from the proxy profile up). */
const UPSTREAM_ONLY = ['least_conn', 'ip_hash', 'keepalive', 'zone', 'hash', 'random', 'least_time', 'sticky', 'ntlm'];
/** E15: the directives of an upstream block. */
const UPSTREAM_SPEC: Record<string, Spec> = {
  server: { ctx: ['upstream'], min: 1, max: ANY }, least_conn: { ctx: ['upstream'], min: 0, max: 0 }, ip_hash: { ctx: ['upstream'], min: 0, max: 0 },
  keepalive: { ctx: ['upstream'], min: 1, max: 1 }, keepalive_timeout: { ctx: ['upstream'], min: 1, max: 1 }, keepalive_requests: { ctx: ['upstream'], min: 1, max: 1 }, zone: { ctx: ['upstream'], min: 1, max: 2 },
};
/** Directives of reverse proxying and upstreams: engine stage E15. */
const E15 = ['proxy_pass', 'proxy_set_header', 'proxy_redirect', 'proxy_http_version', 'proxy_read_timeout', 'proxy_connect_timeout', 'proxy_buffering', 'upstream', 'fastcgi_pass', 'uwsgi_pass', 'grpc_pass'];
const UNSUPPORTED: Readonly<Record<string, string>> = { log_format: '模擬環境的 access_log 只支援預設的 combined 格式（log_format 不支援）', map: '模擬環境不支援 map', set: '模擬環境不支援 set' };

export class ConfError extends Error {}
const at = (d: { file: string; line: number }) => ` in ${d.file}:${d.line}`;

interface Token { t: string; line: number; special?: ';' | '{' | '}' }
/** The escapes nginx's tokenizer replaces in every word (\\. or \\d of a regex stay as they are). */
const ESCAPES: Readonly<Record<string, string>> = { '"': '"', "'": "'", '\\': '\\', t: '\t', r: '\r', n: '\n' };
function tokenize(text: string, file: string): Token[] {
  const out: Token[] = [];
  let i = 0, line = 1;
  const cs = text;
  while (i < cs.length) {
    const ch = cs[i];
    if (ch === '\n') { line++; i++; continue; }
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '#') { while (i < cs.length && cs[i] !== '\n') i++; continue; }
    if (ch === ';' || ch === '{' || ch === '}') { out.push({ t: ch, line, special: ch }); i++; continue; }
    if (ch === '"' || ch === "'") {
      const start = line;
      let word = '';
      i++;
      while (i < cs.length && cs[i] !== ch) {
        const e = cs[i] === '\\' ? ESCAPES[cs[i + 1]] : undefined;
        if (e !== undefined) { word += e; i += 2; continue; }
        if (cs[i] === '\n') line++;
        word += cs[i++];
      }
      if (i >= cs.length) throw new ConfError(`unexpected end of file, expecting ";" or "}" in ${file}:${line}`);
      i++;
      if (i < cs.length && !/[\s;{}]/.test(cs[i])) throw new ConfError(`unexpected "${cs[i]}" in ${file}:${line}`);
      out.push({ t: word, line: start });
      continue;
    }
    let word = '';
    while (i < cs.length && !/[\s;{}]/.test(cs[i])) {
      // ${var} keeps its braces inside a word.
      if (cs[i] === '$' && cs[i + 1] === '{') { const end = cs.indexOf('}', i); if (end > 0) { word += cs.slice(i, end + 1); i = end + 1; continue; } }
      const e = cs[i] === '\\' ? ESCAPES[cs[i + 1]] : undefined;
      if (e !== undefined) { word += e; i += 2; continue; }
      word += cs[i++];
    }
    out.push({ t: word, line });
  }
  return out;
}

/** What reading the configuration needs: the files as some user reads them (nginx -t as a user, the master as root). */
export interface Reader { read(path: string): { text: string } | { error: string }; list(dir: string): string[] | null; isDir(path: string): boolean; /** E15: the machine has the proxy profile. */ proxy?: boolean; /** E18: the edge profile. */ edge?: boolean }
export function readerOf(state: FsState, user = 'root'): Reader {
  const acc = accountsOf(state), view: FsState = { ...state, user, groups: loginGroups(acc, user), cwd: '/' };
  return {
    read: path => { const r = readAs(view, user, path); return 'text' in r ? r : { error: r.error === 'EACCES' ? '13: Permission denied' : r.error === 'EISDIR' ? '21: Is a directory' : '2: No such file or directory' }; },
    list: dir => {
      const w = walk(view, physicalPath(state.nodes, dir, true));
      if ('error' in w || w.node?.kind !== 'dir') return null;
      return childrenOf(state.nodes, w.path).map(baseName);
    },
    isDir: path => { const w = walk(view, physicalPath(state.nodes, path, true)); return !('error' in w) && w.node?.kind === 'dir'; },
    ...state.nginx?.proxy ? { proxy: true } : {}, ...state.nginx?.edge ? { edge: true } : {},
  };
}

/** The parsed configuration: the main directives and every file read, in the order nginx read them (nginx -T). */
export interface Parsed { main: Dir[]; files: { path: string; text: string }[] }
export function parseConfig(reader: Reader, conf = NGINX_CONF): Parsed {
  const files: { path: string; text: string }[] = [];
  const read = (path: string, from?: Dir): Token[] => {
    const r = reader.read(path);
    if ('error' in r) throw new ConfError(`open() "${path}" failed (${r.error})${from ? at(from) : ''}`);
    files.push({ path, text: r.text });
    return tokenize(r.text, path);
  };
  const parse = (tokens: Token[], file: string, ctx: Ctx, pos: { i: number }, inBlock: Dir | null): Dir[] => {
    const out: Dir[] = [];
    const seen = new Set<string>();
    for (;;) {
      const words: Token[] = [];
      let end: Token | undefined;
      while (pos.i < tokens.length) {
        const tk = tokens[pos.i++];
        if (tk.special) { end = tk; break; }
        words.push(tk);
      }
      if (!end) {
        if (words.length) throw new ConfError(`unexpected end of file, expecting ";" or "}" in ${file}:${words.at(-1)!.line}`);
        if (inBlock) throw new ConfError(`unexpected end of file, expecting "}" in ${file}:${tokens.at(-1)?.line ?? 1}`);
        return out;
      }
      if (end.special === '}') {
        if (words.length) throw new ConfError(`unexpected "}" in ${file}:${end.line}`);
        if (!inBlock) throw new ConfError(`unexpected "}" in ${file}:${end.line}`);
        return out;
      }
      if (!words.length) { if (end.special === '{') throw new ConfError(`unexpected "{" in ${file}:${end.line}`); continue; }
      const [head, ...rest] = words, d: Dir = { name: head.t, args: rest.map(w => w.t), file, line: head.line };
      if (ctx === 'types' || ctx === 'map') {
        if (end.special !== ';') throw new ConfError(`unexpected "{" in ${file}:${end.line}`);
        if (ctx === 'map' && d.args.length !== 1) throw new ConfError(`invalid number of the map parameters${at(d)}`);
        if (d.name !== 'include') { out.push(d); continue; }
      }
      const proxy = reader.proxy === true, edge = reader.edge === true;
      if (proxy && ctx !== 'upstream' && UPSTREAM_ONLY.includes(d.name)) throw new ConfError(`"${d.name}" directive is not allowed here${at(d)}`);
      if (proxy && ctx === 'upstream' && !UPSTREAM_SPEC[d.name]) throw new ConfError(['hash', 'random', 'least_time', 'sticky', 'ntlm'].includes(d.name) ? `模擬環境的 upstream 支援 round robin、least_conn 與 ip_hash（"${d.name}" 不支援）${at(d)}` : `"${d.name}" directive is not allowed here${at(d)}`);
      if (proxy && ['fastcgi_pass', 'uwsgi_pass', 'grpc_pass', 'scgi_pass', 'memcached_pass'].includes(d.name)) throw new ConfError(`模擬環境只模擬 HTTP 的反向代理（proxy_pass）；"${d.name}" 不支援${at(d)}`);
      if (!proxy && E15.includes(d.name)) throw new ConfError(`模擬環境："${d.name}" 是反向代理的設定，在引擎階段 E15 才模擬${at(d)}`);
      if (UNSUPPORTED[d.name] && !(proxy && d.name === 'map')) throw new ConfError(`${UNSUPPORTED[d.name]}${at(d)}`);
      const spec = proxy ? (ctx === 'upstream' ? UPSTREAM_SPEC[d.name] : (edge ? EDGE_SPEC[d.name] : undefined) ?? PROXY_SPEC[d.name] ?? SPEC[d.name]) : SPEC[d.name];
      if (!spec) throw new ConfError(`unknown directive "${d.name}"${at(d)}`);
      if (!spec.ctx.includes(ctx)) throw new ConfError(ctx === 'if' ? `模擬環境的 if 裡只支援 return 與 rewrite${at(d)}` : `"${d.name}" directive is not allowed here${at(d)}`);
      if (spec.block && end.special !== '{') throw new ConfError(`directive "${d.name}" has no opening "{"${at(d)}`);
      if (!spec.block && end.special === '{') throw new ConfError(`directive "${d.name}" is not terminated by ";"${at(d)}`);
      if (d.args.length < spec.min || d.args.length > spec.max) throw new ConfError(`invalid number of arguments in "${d.name}" directive${at(d)}`);
      if (spec.flag && !['on', 'off'].includes(d.args[0])) throw new ConfError(`invalid value "${d.args[0]}" in "${d.name}" directive, it must be "on" or "off"${at(d)}`);
      if (spec.once) { if (seen.has(d.name)) throw new ConfError(`"${d.name}" directive is duplicate${at(d)}`); seen.add(d.name); }
      if (d.name === 'alias' && seen.has('root')) throw new ConfError(`"alias" directive is duplicate, "root" directive was specified earlier${at(d)}`);
      if (d.name === 'root' && seen.has('alias')) throw new ConfError(`"root" directive is duplicate, "alias" directive was specified earlier${at(d)}`);
      if (d.name === 'alias' || d.name === 'root') seen.add(d.name);
      if (d.name === 'include') {
        const pattern = d.args[0].startsWith('/') ? d.args[0] : `${PREFIX}/${d.args[0]}`;
        const paths = /[*?[]/.test(pattern) ? globFiles(reader, pattern) : [pattern];
        for (const p of paths) {
          const sub = read(p, d);
          out.push(...parse(sub, p, ctx, { i: 0 }, null));
        }
        continue;
      }
      if (d.name === 'if') ifCondition(d);
      if (d.name === 'proxy_http_version' && !['1.0', '1.1'].includes(d.args[0])) throw new ConfError(`invalid value "${d.args[0]}" in "proxy_http_version" directive, it must be "1.0" or "1.1"${at(d)}`);
      if (spec.block) {
        const inner: Ctx = d.name === 'location' ? 'location' : d.name as Ctx;
        d.block = parse(tokens, file, inner, pos, d);
      }
      out.push(d);
    }
  };
  const main = parse(read(conf), conf, 'main', { i: 0 }, null);
  if (!main.some(d => d.name === 'events')) throw new ConfError('no "events" section in configuration');
  return { main, files };
}
/** if (cond): $var, $var = text, $var != text, $var ~ regex, $var ~* regex, $var !~ regex (the rewrite module's subset). */
export interface IfCond { variable: string; op?: '=' | '!=' | '~' | '~*' | '!~' | '!~*'; value?: string; re?: RegExp }
export function ifCondition(d: Dir): IfCond {
  const text = d.args.join(' ');
  const m = /^\(\s*(\$\w+)\s*(?:(=|!=|~\*|~|!~\*|!~)\s*(.+?))?\s*\)$/.exec(text);
  if (!m) throw new ConfError(`模擬環境的 if 只支援 ($變數)、($變數 = 值)、($變數 != 值) 與 ~ ~* 的比對：${text}${at(d)}`);
  const op = m[2] as IfCond['op'], value = m[3]?.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  return { variable: m[1], ...op ? { op } : {}, ...value !== undefined ? { value } : {}, ...op && op.includes('~') ? { re: regex(value!, op.endsWith('*') ? 'i' : '', d) } : {} };
}

/** include with a glob: the matching names of the folder (not hidden ones), sorted; folders are skipped. */
function globFiles(reader: Reader, pattern: string): string[] {
  const dir = parentOf(pattern), seg = baseName(pattern);
  if (/[*?[]/.test(dir)) return [];
  const names = reader.list(dir) ?? [];
  return names.filter(n => matchName(seg, n)).sort().map(n => joinPath(dir, n)).filter(p => !reader.isDir(p));
}

// --------------------------------------------------------------------------------------------------- configuration

export interface NgListen { address: string; port: number; def: boolean; ssl: boolean; file: string; line: number }
export interface Loc { mod: '' | '=' | '^~' | '~' | '~*' | '@'; path: string; re?: RegExp; dirs: Dir[]; children: Loc[]; parent?: Loc; file: string; line: number; /** E15 */ proxy?: ProxyPass }
/** E15: proxy_pass as loaded: the URL, its scheme, the upstream (a block, or the implicit one of host:port) and the URI part (undefined: none). */
export interface ProxyPass { url: string; scheme: 'http' | 'https'; upstream: string; hostPort: string; uri?: string }
/** E15: a map block: the variable it reads, the one it defines, exact keys (and ~regex keys) with values, and the default. */
export interface MapDef { source: string; target: string; entries: { key: string; re?: RegExp; value: string }[]; def: string }
export interface Srv { listens: NgListen[]; names: string[]; dirs: Dir[]; locs: Loc[]; file: string; line: number; cert?: { chain: Cert[]; path: string } }
/** What the master runs with: the servers, the http and main directives, the worker user and count, the mime types and the files read. */
export interface NgConf { main: Dir[]; http: Dir[]; servers: Srv[]; user: string; workers: number | 'auto'; mime: ReadonlyMap<string, string>; files: { path: string; text: string }[]; warnings: string[]; /** E15 */ upstreams: Upstream[]; maps: MapDef[]; /** E18 */ zones?: CacheZone[] }
/**
 * E14: the running nginx's configuration and the connection counter of its error log (*N). E15: whether the machine has the
 * proxy profile, each upstream's peer table (reset by every start and reload) and the active connections the lesson
 * declares per upstream server (least_conn reads them; requests in the simulation are instantaneous and add none).
 */
export interface NginxState {
  applied?: NgConf; connections: number; proxy?: true; peers?: Record<string, { primary: PeerState[]; backup: PeerState[] }>; conns?: Record<string, number>;
  /** E18: the machine has the edge profile; each cache zone's entries; proxy_cache_min_uses' counts per zone and key. */
  edge?: true; cache?: Record<string, NgEntry[]>; uses?: Record<string, number>;
}

const VARS = ['uri', 'request_uri', 'host', 'scheme', 'args', 'query_string', 'is_args', 'server_name', 'server_port', 'remote_addr', 'request_method', 'document_root', 'request_filename', 'http_host', 'server_addr', 'status'];
/** E15: the proxy module's and upstream module's variables. */
const PROXY_VARS = ['proxy_add_x_forwarded_for', 'proxy_host', 'proxy_port', 'upstream_addr', 'upstream_status', 'remote_port', 'server_protocol'];
/** E18: the cache's variable. */
const EDGE_VARS = ['upstream_cache_status'];
/** Variables must be known: nginx's own, the named captures of the configuration's regexes (captures), $1..$9. */
function checkVars(values: readonly string[], captureNames: ReadonlySet<string>) {
  for (const v of values) for (const m of v.matchAll(/\$(?:\{(\w+)\}|(\w+))/g)) {
    const name = m[1] ?? m[2];
    if (/^\d$/.test(name) || VARS.includes(name) || captureNames.has(name) || /^(http|arg|cookie|sent_http)_\w+$/.test(name)) continue;
    if (captureNames.has('\u0001proxy') && PROXY_VARS.includes(name)) continue;
    if (captureNames.has('\u0001edge') && EDGE_VARS.includes(name)) continue;
    throw new ConfError(`unknown "${name}" variable`);
  }
}
const regex = (src: string, flags: string, d: Dir): RegExp => {
  try { return new RegExp(src.replace(/\(\?P</g, '(?<'), flags); } catch { throw new ConfError(`pcre2_compile() failed: 模擬環境無法編譯這個正規表示式 in "${src}"${at(d)}`); }
};
function parseListen(d: Dir): NgListen | null {
  const [addr, ...params] = d.args;
  if (addr.startsWith('[')) return null;
  let address = '0.0.0.0', portText = addr;
  const m = /^(.*):(\w*)$/.exec(addr);
  if (m) { address = m[1] === '*' ? '0.0.0.0' : m[1] === 'localhost' ? '127.0.0.1' : m[1]; portText = m[2]; }
  else if (!/^\d+$/.test(addr)) { address = addr === 'localhost' ? '127.0.0.1' : addr; portText = '80'; }
  if (!isIPv4(address)) throw new ConfError(`host not found in "${addr}" of the "listen" directive${at(d)}`);
  if (!/^\d+$/.test(portText) || Number(portText) < 1 || Number(portText) > 65535) throw new ConfError(`invalid port in "${addr}" of the "listen" directive${at(d)}`);
  for (const p of params) if (!['default_server', 'default', 'ssl', 'http2', 'reuseport', 'ipv6only=on', 'ipv6only=off'].includes(p) && !/^backlog=\d+$/.test(p)) throw new ConfError(`invalid parameter "${p}"${at(d)}`);
  return { address, port: Number(portText), def: params.includes('default_server') || params.includes('default'), ssl: params.includes('ssl'), file: d.file, line: d.line };
}
function buildLocs(dirs: Dir[], parent?: Loc): Loc[] {
  const out: Loc[] = [];
  for (const d of dirs.filter(x => x.name === 'location')) {
    let mod: Loc['mod'] = '', path = d.args[0];
    if (d.args.length === 2) {
      if (!['=', '^~', '~', '~*'].includes(d.args[0])) throw new ConfError(`invalid location modifier "${d.args[0]}"${at(d)}`);
      mod = d.args[0] as Loc['mod']; path = d.args[1];
    } else if (path.startsWith('@')) mod = '@';
    else if (path.startsWith('=') && path.length > 1) { mod = '='; path = path.slice(1); }
    else if (path.startsWith('~*') && path.length > 2) { mod = '~*'; path = path.slice(2); }
    else if (path.startsWith('~') && path.length > 1) { mod = '~'; path = path.slice(1); }
    else if (path.startsWith('^~') && path.length > 2) { mod = '^~'; path = path.slice(2); }
    if (out.some(o => o.path === path && (o.mod === mod || (o.mod === '' && mod === '^~') || (o.mod === '^~' && mod === '')))) throw new ConfError(`duplicate location "${path}"${at(d)}`);
    if (parent?.mod === '=') throw new ConfError(`location "${path}" cannot be inside the exact location "${parent.path}"${at(d)}`);
    if (parent && (mod === '' || mod === '^~' || mod === '=') && !path.startsWith(parent.path) && parent.mod !== '~' && parent.mod !== '~*') throw new ConfError(`location "${path}" is outside location "${parent.path}"${at(d)}`);
    const loc: Loc = { mod, path, dirs: (d.block ?? []).filter(x => x.name !== 'location'), children: [], ...parent ? { parent } : {}, file: d.file, line: d.line, ...mod === '~' || mod === '~*' ? { re: regex(path, mod === '~*' ? 'i' : '', d) } : {} };
    loc.children = buildLocs(d.block ?? [], loc);
    out.push(loc);
  }
  return out;
}
const DIRECTIVE_VARS = ['try_files', 'return', 'rewrite', 'add_header', 'root', 'alias', 'index', 'error_page', 'proxy_set_header', 'proxy_cache_key', 'proxy_cache_bypass', 'proxy_no_cache'];
function checkLevel(dirs: Dir[], captures: ReadonlySet<string>) {
  for (const d of dirs) {
    if (d.name === 'if') { checkVars([ifCondition(d).variable], captures); checkLevel(d.block ?? [], captures); continue; }
    if (DIRECTIVE_VARS.includes(d.name)) checkVars(d.name === 'rewrite' ? d.args.slice(1) : d.args, captures);
    if (d.name === 'return') {
      const [a, b] = d.args;
      if (d.args.length === 2 || /^\d+$/.test(a)) {
        const code = Number(a);
        if (!/^\d+$/.test(a) || code > 999 || code < 0) throw new ConfError(`invalid return code "${a}"${at(d)}`);
        void b;
      } else if (!/^(https?:\/\/|\$scheme)/.test(a)) throw new ConfError(`invalid return code "${a}"${at(d)}`);
    }
    if (d.name === 'rewrite') { regex(d.args[0], '', d); if (d.args[2] && !['last', 'break', 'redirect', 'permanent'].includes(d.args[2])) throw new ConfError(`invalid parameter "${d.args[2]}"${at(d)}`); }
    if (d.name === 'error_page') {
      const uri = d.args.at(-1)!, codes = d.args.slice(0, -1);
      for (const c of codes) {
        if (c.startsWith('=')) { if (c !== codes.at(-1) || !/^=\d*$/.test(c)) throw new ConfError(`invalid value "${c}"${at(d)}`); continue; }
        if (!/^\d+$/.test(c) || Number(c) < 300 || Number(c) > 599) throw new ConfError(`value "${c}" must be between 300 and 599${at(d)}`);
      }
      void uri;
    }
    if (d.name === 'add_header' && d.args[2] !== undefined && d.args[2] !== 'always') throw new ConfError(`invalid parameter "${d.args[2]}"${at(d)}`);
    if ((d.name === 'allow' || d.name === 'deny') && d.args[0] !== 'all' && !/^\d+\.\d+\.\d+\.\d+(\/\d{1,2})?$/.test(d.args[0])) throw new ConfError(`invalid parameter "${d.args[0]}"${at(d)}`);
    if (d.name === 'keepalive_timeout' && !/^\d+[sm]?$/.test(d.args[0])) throw new ConfError(`invalid value "${d.args[0]}"${at(d)}`);
    if (d.name === 'access_log' && d.args[0] !== 'off' && d.args[1] !== undefined && d.args[1] !== 'combined') throw new ConfError(`unknown log format "${d.args[1]}"${at(d)}`);
    if (['proxy_connect_timeout', 'proxy_read_timeout', 'proxy_send_timeout'].includes(d.name) && timeValue(d.args[0]) === undefined) throw new ConfError(`"${d.name}" directive invalid value${at(d)}`);
    if (d.name === 'proxy_next_upstream') for (const a of d.args) if (!['error', 'timeout', 'invalid_header', 'http_500', 'http_502', 'http_503', 'http_504', 'http_403', 'http_404', 'http_429', 'non_idempotent', 'off'].includes(a)) throw new ConfError(`invalid value "${a}"${at(d)}`);
    if (d.name === 'proxy_redirect' && d.args.length === 1 && !['off', 'default'].includes(d.args[0])) throw new ConfError(`invalid parameter "${d.args[0]}"${at(d)}`);
    if (d.name === 'proxy_next_upstream_tries' && !/^\d+$/.test(d.args[0])) throw new ConfError(`invalid value "${d.args[0]}"${at(d)}`);
    // E18: the cache's directives and expires (the nginx profile accepts expires without checking it, as before).
    if (d.name === 'proxy_cache_valid') { const t = d.args.at(-1)!; if (timeValue(t) === undefined) throw new ConfError(`invalid time value "${t}" in "proxy_cache_valid" directive${at(d)}`); for (const c of d.args.slice(0, -1)) if (c !== 'any' && !/^[1-5]\d\d$/.test(c)) throw new ConfError(`invalid value "${c}"${at(d)}`); }
    if (d.name === 'proxy_cache_use_stale') for (const a of d.args) if (!['error', 'timeout', 'invalid_header', 'updating', 'http_500', 'http_502', 'http_503', 'http_504', 'http_403', 'http_404', 'http_429', 'off'].includes(a)) throw new ConfError(`invalid value "${a}"${at(d)}`);
    if (d.name === 'proxy_cache_methods') for (const a of d.args) if (!['GET', 'HEAD', 'POST'].includes(a)) throw new ConfError(`invalid value "${a}"${at(d)}`);
    if (d.name === 'proxy_ignore_headers') for (const a of d.args) if (!['X-Accel-Redirect', 'X-Accel-Expires', 'X-Accel-Limit-Rate', 'X-Accel-Buffering', 'X-Accel-Charset', 'Expires', 'Cache-Control', 'Set-Cookie', 'Vary'].includes(a)) throw new ConfError(`invalid value "${a}"${at(d)}`);
    if ((d.name === 'proxy_cache_lock_timeout' || d.name === 'proxy_cache_lock_age') && timeValue(d.args[0]) === undefined) throw new ConfError(`"${d.name}" directive invalid value${at(d)}`);
    if (d.name === 'proxy_cache_min_uses' && !/^\d+$/.test(d.args[0])) throw new ConfError(`invalid value "${d.args[0]}"${at(d)}`);
    if (d.name === 'if_modified_since' && !['off', 'exact', 'before'].includes(d.args[0])) throw new ConfError(`invalid value "${d.args[0]}" in "if_modified_since" directive, it must be "off", "exact" or "before"${at(d)}`);
    if (d.name === 'expires' && captures.has('\u0001edge') && expiresOf(d) === undefined) throw new ConfError(`invalid value "${d.args.join(' ')}"${at(d)}`);
  }
}
/** E18: expires as nginx reads it: off, epoch, max, [modified] ±time (a negative or past time sends no-cache). */
export type Expires = { kind: 'off' | 'epoch' | 'max' } | { kind: 'time'; seconds: number; modified: boolean };
export function expiresOf(d: Dir): Expires | undefined {
  const args = d.args, modified = args[0] === 'modified', v = modified ? args[1] : args[0];
  if (args.length > (modified ? 2 : 1) || v === undefined) return undefined;
  if (!modified && (v === 'off' || v === 'epoch' || v === 'max')) return { kind: v };
  const m = /^([+-]?)(\d+(?:ms|s|m|h|d|w|M|y)?)$/.exec(v);
  if (!m) return undefined;
  const unit = /[a-zA-Z]+$/.exec(m[2])?.[0], n = Number(m[2].replace(/[a-zA-Z]+$/, ''));
  const mult = unit === 'w' ? 604800 : unit === 'M' ? 2592000 : unit === 'y' ? 31536000 : unit === undefined ? 1 : timeValue(`1${unit}`) ?? 1;
  return { kind: 'time', seconds: (m[1] === '-' ? -1 : 1) * n * mult, modified };
}

/** E15: a host name nginx resolves while it loads the configuration: an IPv4 address, localhost, or /etc/hosts (read as root). */
function resolveAtLoad(reader: Reader, host: string): string | undefined {
  if (isIPv4(host)) return host;
  if (host === 'localhost') return '127.0.0.1';
  const r = reader.read('/etc/hosts');
  if ('error' in r) return undefined;
  for (const raw of r.text.split('\n')) {
    const [address, ...names] = raw.replace(/#.*/, '').trim().split(/\s+/);
    if (address && isIPv4(address) && names.some(n => n.toLowerCase() === host.toLowerCase())) return address;
  }
  return undefined;
}
/** E15: host[:port] of proxy_pass or of an upstream server (default port 80, or 443 for https). */
function hostPort(text: string, defPort: number): { host: string; port: number } | null {
  const m = /^([^:/]+)(?::(\d+))?$/.exec(text);
  if (!m || (m[2] !== undefined && (Number(m[2]) < 1 || Number(m[2]) > 65535))) return null;
  return { host: m[1], port: m[2] !== undefined ? Number(m[2]) : defPort };
}
/** E15: the upstream blocks of the http block, checked as nginx does when it loads them. */
function buildUpstreams(http: Dir[], reader: Reader, warnings: string[]): Upstream[] {
  const out: Upstream[] = [];
  for (const u of http.filter(d => d.name === 'upstream')) {
    const name = u.args[0];
    if (out.some(o => o.name === name)) throw new ConfError(`duplicate upstream "${name}"${at(u)}`);
    const dirs = u.block ?? [];
    const methods = dirs.filter(d => d.name === 'least_conn' || d.name === 'ip_hash');
    if (methods.length > 1) warnings.push(`load balancing method redefined${at(methods[1])}`);
    const method = methods.at(-1)?.name === 'ip_hash' ? 'ip_hash' : methods.length ? 'least_conn' : 'round-robin';
    const servers: UpServer[] = [];
    for (const d of dirs.filter(x => x.name === 'server')) {
      const [addr, ...params] = d.args;
      if (addr.startsWith('unix:')) throw new ConfError(`模擬環境的 upstream 只支援 TCP 的 server（${addr} 不支援）${at(d)}`);
      const hp = hostPort(addr, 80);
      if (!hp) throw new ConfError(`invalid host in upstream "${addr}"${at(d)}`);
      const address = resolveAtLoad(reader, hp.host);
      if (!address) throw new ConfError(`host not found in upstream "${addr}"${at(d)}`);
      const s: UpServer = { text: `${address}:${hp.port}`, address, port: hp.port, weight: 1, maxFails: 1, failTimeout: 10, backup: false, down: false };
      for (const p of params) {
        const m = /^(weight|max_fails|fail_timeout|max_conns)=(\w+)$/.exec(p);
        if (m && m[1] === 'weight' && /^\d+$/.test(m[2]) && Number(m[2]) >= 1) s.weight = Number(m[2]);
        else if (m && m[1] === 'max_fails' && /^\d+$/.test(m[2])) s.maxFails = Number(m[2]);
        else if (m && m[1] === 'fail_timeout' && timeValue(m[2]) !== undefined) s.failTimeout = timeValue(m[2])!;
        else if (m && m[1] === 'max_conns' && /^\d+$/.test(m[2])) continue;
        else if (p === 'backup' && method !== 'ip_hash') s.backup = true;
        else if (p === 'down') s.down = true;
        else throw new ConfError(`invalid parameter "${p}"${at(d)}`);
      }
      servers.push(s);
    }
    if (!servers.length) throw new ConfError(`no servers are inside upstream${at(u)}`);
    const ka = dirs.find(d => d.name === 'keepalive');
    if (ka && (!/^\d+$/.test(ka.args[0]) || Number(ka.args[0]) < 1)) throw new ConfError(`invalid value "${ka.args[0]}" in "keepalive" directive${at(ka)}`);
    out.push({ name, servers, method, ...ka ? { keepalive: Number(ka.args[0]) } : {}, file: u.file, line: u.line });
  }
  return out;
}
/** E15: proxy_pass's URL: an upstream block's name, or host:port (an implicit upstream of one server, resolved now). */
function buildProxy(d: Dir, loc: Loc, upstreams: Upstream[], reader: Reader): ProxyPass {
  const url = d.args[0];
  if (url.includes('$')) throw new ConfError(`模擬環境的 proxy_pass 不支援變數（${url}）${at(d)}`);
  const m = /^(https?):\/\/([^/]+)(\/.*)?$/i.exec(url);
  if (!m) throw new ConfError(/^unix:/i.test(url.replace(/^https?:\/\//, '')) ? `模擬環境的 proxy_pass 只支援 TCP（${url}）${at(d)}` : `invalid URL prefix in "${url}"${at(d)}`);
  const scheme = m[1].toLowerCase() as 'http' | 'https', hp = m[2], uri = m[3];
  if (uri !== undefined && (loc.re || loc.mod === '@')) throw new ConfError(`"proxy_pass" cannot have URI part in location given by regular expression, or inside named location, or inside "if" statement, or inside "limit_except" block${at(d)}`);
  const named = upstreams.find(u => u.name === hp.replace(/:\d+$/, ''));
  if (named) {
    if (hp.includes(':')) throw new ConfError(`upstream "${named.name}" may not have port ${hp.split(':')[1]}${at(d)}`);
    return { url, scheme, upstream: named.name, hostPort: named.name, ...uri !== undefined ? { uri } : {} };
  }
  const p = hostPort(hp, scheme === 'https' ? 443 : 80);
  if (!p) throw new ConfError(`invalid host in upstream "${hp}"${at(d)}`);
  const address = resolveAtLoad(reader, p.host);
  if (!address) throw new ConfError(`host not found in upstream "${hp}"${at(d)}`);
  const key = `${address}:${p.port}`;
  if (!upstreams.some(u => u.name === key)) {
    upstreams.push({ name: key, implicit: true, servers: [{ text: key, address, port: p.port, weight: 1, maxFails: 1, failTimeout: 10, backup: false, down: false }], method: 'round-robin', file: d.file, line: d.line });
  }
  const shown = p.port === (scheme === 'https' ? 443 : 80) ? p.host : `${p.host}:${p.port}`;
  return { url, scheme, upstream: key, hostPort: shown, ...uri !== undefined ? { uri } : {} };
}
/** E15: map $source $target { key value; … default value; }: exact keys (case-insensitive like nginx's hostnames off) and ~regex keys. */
function buildMaps(http: Dir[]): MapDef[] {
  return http.filter(d => d.name === 'map').map(d => {
    const entries: MapDef['entries'] = [];
    let def = '';
    for (const e of d.block ?? []) {
      if (e.name === 'default') { def = e.args[0]; continue; }
      if (e.name.startsWith('~')) entries.push({ key: e.name, re: regex(e.name.replace(/^~\*?/, ''), e.name.startsWith('~*') ? 'i' : '', e), value: e.args[0] });
      else entries.push({ key: e.name.replace(/^\\/, ''), value: e.args[0] });
    }
    if (!/^\$\w+$/.test(d.args[1])) throw new ConfError(`invalid variable name "${d.args[1]}"${at(d)}`);
    return { source: d.args[0], target: d.args[1].slice(1), entries, def };
  });
}
function walkLocs(locs: Loc[], f: (l: Loc) => void) { for (const l of locs) { f(l); walkLocs(l.children, f); } }
const flatLocs = (locs: Loc[]): Loc[] => { const out: Loc[] = []; walkLocs(locs, l => out.push(l)); return out; };
const dirs0 = (s: Dir) => (s.block ?? []).filter(d => d.name !== 'location');
/** E18: proxy_cache_path path [levels=1:2] keys_zone=name:size [inactive=time] [max_size=size] [use_temp_path=on|off]… */
function buildZones(http: Dir[], reader: Reader): CacheZone[] {
  const out: CacheZone[] = [];
  for (const d of http.filter(x => x.name === 'proxy_cache_path')) {
    const [path, ...params] = d.args;
    let name: string | undefined, levels: number[] = [], inactive = 600, maxSize: string | undefined;
    for (const p of params) {
      const [k, v = ''] = p.split(/=(.*)/s, 2);
      if (k === 'levels') { const ls = v.split(':'); if (!ls.length || ls.length > 3 || ls.some(x => x !== '1' && x !== '2')) throw new ConfError(`invalid "levels" "${v}"${at(d)}`); levels = ls.map(Number); }
      else if (k === 'keys_zone') { const m = /^([A-Za-z0-9_-]+):(\d+[kKmM]?)$/.exec(v); if (!m) throw new ConfError(`invalid keys zone size "${v}"${at(d)}`); name = m[1]; }
      else if (k === 'inactive') { const t = timeValue(v); if (t === undefined) throw new ConfError(`invalid inactive value "${p}"${at(d)}`); inactive = t; }
      else if (k === 'max_size') { if (!/^\d+[kKmMgG]?$/.test(v)) throw new ConfError(`invalid max_size value "${p}"${at(d)}`); maxSize = v; }
      else if (['use_temp_path', 'min_free', 'manager_files', 'manager_sleep', 'manager_threshold', 'loader_files', 'loader_sleep', 'loader_threshold', 'purger'].includes(k)) continue;
      else throw new ConfError(`invalid parameter "${p}"${at(d)}`);
    }
    if (!name) throw new ConfError(`"proxy_cache_path" must have "keys_zone" parameter${at(d)}`);
    if (out.some(z => z.name === name)) throw new ConfError(`duplicate zone "${name}"${at(d)}`);
    if (out.some(z => z.path === path)) throw new ConfError(`duplicate proxy_cache_path "${path}"${at(d)}`);
    if (!path.startsWith('/') || !reader.isDir(parentOf(path))) throw new ConfError(`mkdir() "${path}" failed (2: No such file or directory)`);
    out.push({ name, path: path.replace(/\/$/, ''), levels, inactive, ...maxSize ? { maxSize } : {}, file: d.file, line: d.line });
  }
  return out;
}

/**
 * The configuration test (nginx -t) and what a start or reload applies: parse, then the checks nginx makes while it
 * builds the configuration — listen addresses, duplicate default servers, server name conflicts (a warning), variables,
 * the worker user, certificates and their keys (read as root), the log folders. Throws ConfError with nginx's message.
 */
export function loadConfig(state: FsState, reader: Reader = readerOf(state), conf = NGINX_CONF): NgConf {
  const parsed = parseConfig(reader, conf), main = parsed.main, warnings: string[] = [];
  const http = main.find(d => d.name === 'http')?.block ?? [];
  const captures = new Set<string>(), scan = (dirs: Dir[]) => { for (const d of dirs) {
    if (['server_name', 'location', 'rewrite', 'if'].includes(d.name)) for (const a of d.args) for (const m of a.matchAll(/\(\?P?<(\w+)>/g)) captures.add(m[1]);
    scan(d.block ?? []);
  } };
  scan(http);
  // E15: the variables map defines, and the proxy module's own (only from the proxy profile up).
  const maps = reader.proxy ? buildMaps(http) : [];
  if (reader.proxy) { captures.add('\u0001proxy'); for (const m of maps) captures.add(m.target); }
  const upstreams = reader.proxy ? buildUpstreams(http, reader, warnings) : [];
  // E18: proxy_cache_path's zones (the folder's parent must exist; nginx creates the folder itself).
  if (reader.edge) captures.add('\u0001edge');
  const zones = reader.edge ? buildZones(http, reader) : [];
  const userDir = main.find(d => d.name === 'user'), user = userDir?.args[0] ?? 'nobody';
  if (userDir && !findUser(accountsOf(state), user)) throw new ConfError(`getpwnam("${user}") failed${at(userDir)}`);
  const wp = main.find(d => d.name === 'worker_processes');
  if (wp && wp.args[0] !== 'auto' && !/^\d+$/.test(wp.args[0])) throw new ConfError(`invalid value "${wp.args[0]}"${at(wp)}`);
  const mime = new Map<string, string>();
  const collectTypes = (dirs: Dir[]) => { for (const t of dirs.filter(d => d.name === 'types')) for (const e of t.block ?? []) for (const ext of e.args) mime.set(ext.toLowerCase(), e.name); };
  collectTypes(http);
  checkLevel(http, captures);
  const servers: Srv[] = [];
  for (const s of http.filter(d => d.name === 'server')) {
    const dirs = (s.block ?? []).filter(d => d.name !== 'location');
    checkLevel(dirs, captures);
    const listens = dirs.filter(d => d.name === 'listen').map(parseListen).filter((l): l is NgListen => !!l);
    if (!dirs.some(d => d.name === 'listen')) listens.push({ address: '0.0.0.0', port: 80, def: false, ssl: false, file: s.file, line: s.line });
    const names = dirs.filter(d => d.name === 'server_name').flatMap(d => d.args);
    for (const n of names) if (n.startsWith('~')) regex(n.slice(1), 'i', s);
    const locs = buildLocs(s.block ?? []);
    walkLocs(locs, l => checkLevel(l.dirs, captures));
    // E15: each location's proxy_pass (nginx resolves its host now; an upstream block's name stands for the block).
    if (reader.proxy) walkLocs(locs, l => { const pp = l.dirs.find(d => d.name === 'proxy_pass'); if (pp) l.proxy = buildProxy(pp, l, upstreams, reader); });
    // E18: proxy_cache names a zone of proxy_cache_path.
    if (reader.edge) for (const level of [http, dirs0(s), ...flatLocs(locs).map(l => l.dirs)]) for (const d of level.filter(x => x.name === 'proxy_cache')) {
      if (d.args[0] !== 'off' && !zones.some(z => z.name === d.args[0])) throw new ConfError(`"proxy_cache" zone "${d.args[0]}" is unknown${at(d)}`);
    }
    servers.push({ listens, names: names.length ? names : [''], dirs, locs, file: s.file, line: s.line });
  }
  // Default servers and server names, per address and port.
  const keys = new Map<string, Srv[]>();
  for (const s of servers) for (const l of s.listens) { const k = `${l.address}:${l.port}`; if (!keys.get(k)?.includes(s)) keys.set(k, [...keys.get(k) ?? [], s]); }
  for (const [k, list] of keys) {
    const defs = list.flatMap(s => s.listens.filter(l => `${l.address}:${l.port}` === k && l.def));
    if (defs.length > 1) throw new ConfError(`a duplicate default server for ${k}${at(defs[1])}`);
    const seen = new Set<string>();
    for (const s of list) for (const n of s.names) {
      if (!n || n === '_' || n.startsWith('~')) continue;
      if (seen.has(n.toLowerCase())) warnings.push(`conflicting server name "${n}" on ${k}, ignored`);
      seen.add(n.toLowerCase());
    }
  }
  // Certificates: every server with an ssl listen needs one; nginx loads them (as root) while it reads the configuration.
  const value = (dirs: Dir[], name: string) => dirs.find(d => d.name === name);
  for (const s of servers) {
    const ssl = s.listens.find(l => l.ssl);
    const certDir = value(s.dirs, 'ssl_certificate') ?? value(http, 'ssl_certificate'), keyDir = value(s.dirs, 'ssl_certificate_key') ?? value(http, 'ssl_certificate_key');
    if (!ssl) continue;
    if (!certDir) throw new ConfError(`no "ssl_certificate" is defined for the "listen ... ssl" directive${at(ssl)}`);
    const cp = certDir.args[0], c = readAs(state, 'root', cp);
    if ('error' in c) throw new ConfError(`cannot load certificate "${cp}": BIO_new_file() failed (SSL: error:80000002:system library::${c.error === 'EACCES' ? 'Permission denied' : 'No such file or directory'}:calling fopen(${cp}, r) error:10000080:BIO routines::${c.error === 'EACCES' ? 'system lib' : 'no such file'})`);
    const chain = certsIn(c.text);
    if (!chain.length) throw new ConfError(`cannot load certificate "${cp}": PEM_read_bio_X509_AUX() failed (SSL: error:0480006C:PEM routines::no start line:Expecting: TRUSTED CERTIFICATE)`);
    if (!keyDir) throw new ConfError(`no "ssl_certificate_key" is defined for certificate "${cp}"${at(certDir)}`);
    const kp = keyDir.args[0], k = readAs(state, 'root', kp);
    if ('error' in k) throw new ConfError(`cannot load certificate key "${kp}": BIO_new_file() failed (SSL: error:80000002:system library::${k.error === 'EACCES' ? 'Permission denied' : 'No such file or directory'}:calling fopen(${kp}, r) error:10000080:BIO routines::${k.error === 'EACCES' ? 'system lib' : 'no such file'})`);
    const key = keyIn(k.text);
    if (!key) throw new ConfError(`cannot load certificate key "${kp}": PEM_read_bio_PrivateKey() failed (SSL: error:1E08010C:DECODER routines::unsupported:No supported data to decode.)`);
    if (!keyMatches(key, chain[0])) throw new ConfError(`SSL_CTX_use_PrivateKey("${kp}") failed (SSL: error:05800074:x509 certificate routines::key values mismatch)`);
    s.cert = { chain, path: cp };
  }
  // Log files: nginx opens (and creates) them; a missing folder is an error.
  const logs = new Set<string>();
  const collect = (dirs: Dir[]) => { for (const d of dirs) if ((d.name === 'access_log' || d.name === 'error_log') && d.args[0] !== 'off' && d.args[0] !== 'stderr' && !d.args[0].startsWith('syslog:')) logs.add(d.args[0].startsWith('/') ? d.args[0] : `/usr/share/nginx/${d.args[0]}`); };
  collect(main); collect(http);
  for (const s of servers) { collect(s.dirs); walkLocs(s.locs, l => collect(l.dirs)); }
  for (const p of logs) if (!reader.isDir(parentOf(p))) throw new ConfError(`open() "${p}" failed (2: No such file or directory)`);
  for (const m of maps) checkVars([m.source], captures);
  return { main, http, servers, user, workers: wp?.args[0] === 'auto' || !wp ? (wp ? 'auto' : 1) : Number(wp.args[0]), mime, files: parsed.files, warnings, upstreams, maps, ...reader.edge ? { zones } : {} };
}
/** The configuration test's result as nginx -t prints it. */
export function testConfig(state: FsState, reader: Reader = readerOf(state), conf = NGINX_CONF): { conf: NgConf } | { error: string } {
  try { return { conf: loadConfig(state, reader, conf) }; } catch (e) { if (e instanceof ConfError) return { error: e.message }; throw e; }
}

/** The sockets the master listens on: one per address and port (a wildcard on a port covers the specific addresses, as without bind). */
export function listensOf(conf: NgConf): Listen[] {
  const out: Listen[] = [];
  const all = conf.servers.flatMap(s => s.listens);
  for (const l of all) {
    if (l.address !== '0.0.0.0' && all.some(o => o.port === l.port && o.address === '0.0.0.0')) continue;
    const have = out.find(o => o.port === l.port && (o.address ?? '0.0.0.0') === l.address);
    if (have) { if (l.ssl) have.ssl = true; continue; }
    out.push({ port: l.port, ...l.address !== '0.0.0.0' ? { address: l.address } : {}, fd: 6 + out.length, backlog: 511, nginx: true, ...l.ssl ? { ssl: true } : {} });
  }
  // A port is TLS when any server's listen on it says ssl.
  for (const o of out) if (all.some(l => l.port === o.port && (l.address === (o.address ?? '0.0.0.0') || (o.address ?? '0.0.0.0') === '0.0.0.0') && l.ssl)) o.ssl = true;
  return out;
}

// ------------------------------------------------------------------------------------------------ the master process

const nginxOf = (state: FsState): NginxState => state.nginx ?? { connections: 0 };
export const masterOf = (state: FsState): Proc | undefined => tableOf(state).find(p => p.unit === 'nginx.service' && commOf(p.command) === 'nginx' && p.command.includes('master process') && !p.stat.startsWith('Z'));
function workerCount(state: FsState, conf: NgConf) { return conf.workers === 'auto' ? clockOf(state).cpus : Math.max(1, Math.min(conf.workers, 8)); }
/** Applies a configuration to the running master: its sockets, new workers (the old ones leave), the log files it opens. */
export function applyConfig(state: FsState, conf: NgConf, initial = false): FsState {
  const master = masterOf(state);
  if (!master) return { ...state, nginx: { ...nginxOf(state), applied: conf, ...conf.upstreams.length ? { peers: peersOf(conf) } : {} } };
  let procs = tableOf(state).map(p => p.pid === master.pid ? { ...p, command: NGINX_MASTER, listen: listensOf(conf) } : p);
  let last = state.lastPid ?? Math.max(0, ...procs.map(p => p.pid));
  procs = procs.filter(p => !(p.ppid === master.pid && commOf(p.command) === 'nginx'));
  // At the start of a lesson the workers follow the master's pid; a (re)load gives them the next free pids.
  let next = initial ? master.pid : last;
  for (let i = 0; i < workerCount(state, conf); i++) {
    do next++; while (procs.some(p => p.pid === next));
    procs.push({ pid: next, ppid: master.pid, user: conf.user, command: NGINX_WORKER, stat: 'S', cpu: 0, rss: 5632, vsz: 55804, shr: 3712, tty: '?', start: initial ? master.start : clockOf(state).now, time: 0, nice: 0, unit: 'nginx.service', hup: 'ignore' });
    last = Math.max(last, next);
  }
  const nodes = new Map(state.nodes);
  // E18: the cache folders (owned by the worker user, as nginx's cache manager makes them).
  for (const z of conf.zones ?? []) if (!nodes.has(z.path) && nodes.get(parentOf(z.path))?.kind === 'dir') nodes.set(z.path, { kind: 'dir', mode: 0o700, owner: conf.user });
  for (const p of logPaths(conf)) {
    const real = physicalPath(nodes, p, true);
    if (!nodes.has(real) && nodes.get(parentOf(real))?.kind === 'dir') nodes.set(real, { kind: 'file', mode: 0o644, owner: 'root', content: '' });
  }
  return { ...state, nodes, processes: procs, lastPid: last, nginx: { ...nginxOf(state), applied: conf, ...conf.upstreams.length ? { peers: peersOf(conf) } : {} } };
}
/** E15: a fresh peer table for every upstream (a start or reload forgets the failures, as nginx's new workers do). */
const peersOf = (conf: NgConf) => Object.fromEntries(conf.upstreams.map(u => [u.name, { primary: freshPeers(u.servers.filter(s => !s.backup)), backup: freshPeers(u.servers.filter(s => s.backup)) }]));
function logPaths(conf: NgConf): string[] {
  const out = new Set<string>([DEFAULT_ERROR]);
  const add = (dirs: Dir[]) => { for (const d of dirs) if ((d.name === 'access_log' || d.name === 'error_log') && d.args[0].startsWith('/')) out.add(d.args[0]); };
  add(conf.main); add(conf.http);
  if (!conf.http.some(d => d.name === 'access_log')) out.add(DEFAULT_ACCESS);
  for (const s of conf.servers) { add(s.dirs); walkLocs(s.locs, l => add(l.dirs)); }
  return [...out];
}
const journalAdd = (state: FsState, entries: { id: string; priority: number; message: string; pid?: number }[]): FsState => {
  if (!state.journal) return state;
  const now = clockOf(state).now;
  return { ...state, journal: [...state.journal, ...entries.map(e => ({ time: now, unit: 'nginx.service', id: e.id, ...e.pid !== undefined ? { pid: e.pid } : {}, priority: e.priority, message: e.message }))].slice(-MAX_JOURNAL) };
};
const TITLE = 'nginx.service - A high performance web server and a reverse proxy server';

/** Whether the sockets of a configuration can be bound: another process's socket, or an address the machine does not have. */
function bindProblem(state: FsState, conf: NgConf): string | null {
  const master = masterOf(state);
  for (const l of listensOf(conf)) {
    const address = l.address ?? '0.0.0.0';
    if (address !== '0.0.0.0' && !ownsAddress(state, address)) return `bind() to ${address}:${l.port} failed (99: Cannot assign requested address)`;
    const other = tableOf(state).find(p => p.pid !== master?.pid && p.ppid !== master?.pid && !p.stat.startsWith('Z') && (p.listen ?? []).some(o => (o.proto ?? 'tcp') === 'tcp' && o.port === l.port
      && ((o.address ?? '0.0.0.0') === '0.0.0.0' || address === '0.0.0.0' || o.address === address)));
    if (other) return `bind() to ${address}:${l.port} failed (98: Address already in use)`;
  }
  return null;
}

/**
 * E14: systemctl start/restart/reload of nginx. Before: as root, the configuration test (ExecStartPre= nginx -t, and the
 * parse that `nginx -s reload` does in ExecReload=): when it fails, a start leaves the unit failed (a restart stops it
 * first — the site is down), a reload fails and keeps the running configuration. After: a master that started loads the
 * configuration and gets its workers; a reload applies the new one (or keeps the old when a socket cannot be bound).
 */
export function nginxControl(state: FsState, args: readonly string[], user: string, phase: 'before' | 'after', before?: FsState, status = 0): { state: FsState; refused?: string[] } {
  const verb = args.find(a => !a.startsWith('-')), units = args.filter(a => !a.startsWith('-')).slice(1);
  if (!state.nginx || !verb || !units.some(u => /^nginx(\.service)?$/.test(u)) || user !== 'root') return { state };
  const runtime = state.services?.runtime['nginx.service'];
  if (phase === 'before') {
    const active = runtime?.active === 'active';
    if (!['start', 'restart', 'reload', 'try-restart', 'reload-or-restart'].includes(verb)) return { state };
    if (verb === 'start' && active) return { state };
    if ((verb === 'reload' || verb === 'try-restart') && !active) return { state };
    const t = testConfig(state);
    const failedStart = (s: FsState, lines: string[]): { state: FsState; refused: string[] } => {
      const pid = nextPid(s);
      let next: FsState = { ...s, lastPid: pid };
      next = journalAdd(next, [{ id: 'systemd', priority: 6, message: `Starting ${TITLE}...`, pid: 1 }, ...lines.map(message => ({ id: 'nginx', priority: 3, message, pid })),
        { id: 'systemd', priority: 3, message: 'nginx.service: Control process exited, code=exited, status=1/FAILURE', pid: 1 },
        { id: 'systemd', priority: 4, message: "nginx.service: Failed with result 'exit-code'.", pid: 1 }, { id: 'systemd', priority: 3, message: `Failed to start ${TITLE}.`, pid: 1 }]);
      const services = next.services!;
      next = { ...next, services: { ...services, runtime: { ...services.runtime, 'nginx.service': { active: 'failed', sub: 'failed', since: clockOf(next).now, result: 'exit-code', exit: { pid, code: 'exited', status: 1 } } } } };
      return { state: next, refused: ['Job for nginx.service failed because the control process exited with error code.', 'See "systemctl status nginx.service" and "journalctl -xeu nginx.service" for details.'] };
    };
    const stopFirst = (s: FsState): FsState => {
      const master = masterOf(s);
      if (!master) return s;
      const procs = tableOf(s).filter(p => p.unit !== 'nginx.service');
      return journalAdd({ ...s, processes: procs }, [{ id: 'systemd', priority: 6, message: `Stopping ${TITLE}...`, pid: 1 }, { id: 'systemd', priority: 6, message: 'nginx.service: Deactivated successfully.', pid: 1 },
        { id: 'systemd', priority: 6, message: `Stopped ${TITLE}.`, pid: 1 }]);
    };
    const reloads = verb === 'reload' || (verb === 'reload-or-restart' && active);
    if ('error' in t) {
      const lines = [`nginx: [emerg] ${t.error}`, `nginx: configuration file ${NGINX_CONF} test failed`];
      if (reloads) {
        const pid = nextPid(state);
        const next = journalAdd({ ...state, lastPid: pid }, [{ id: 'systemd', priority: 6, message: `Reloading ${TITLE}...`, pid: 1 }, { id: 'nginx', priority: 3, message: `nginx: [emerg] ${t.error}`, pid },
          { id: 'systemd', priority: 3, message: 'nginx.service: Control process exited, code=exited, status=1/FAILURE', pid: 1 }, { id: 'systemd', priority: 3, message: `Reload failed for ${TITLE}.`, pid: 1 }]);
        return { state: next, refused: ['Job for nginx.service failed because the control process exited with error code.', 'See "systemctl status nginx.service" and "journalctl -xeu nginx.service" for details.'] };
      }
      return failedStart(verb === 'start' ? state : stopFirst(state), lines);
    }
    if (!reloads) {
      const base = verb === 'start' ? state : stopFirst(state);
      const bind = bindProblem(base, t.conf);
      if (bind) return failedStart(base, [`nginx: [emerg] ${bind}`, ...bind.includes('(98:') ? Array(4).fill(`nginx: [emerg] ${bind}`) as string[] : [], ...bind.includes('(98:') ? ['nginx: [emerg] still could not bind()'] : []]);
    }
    return { state };
  }
  if (status !== 0) return { state };
  const a = before ? masterOf(before)?.pid : undefined, b = masterOf(state)?.pid;
  if (b !== undefined && a !== b) {
    const t = testConfig(state);
    return { state: 'conf' in t ? applyConfig(state, t.conf) : state };
  }
  if (b !== undefined && (verb === 'reload' || verb === 'reload-or-restart')) return { state: reloadRunning(state) };
  return { state };
}
/**
 * E14: whether kill/pkill sent SIGHUP to the master (kill -HUP pid, -1, -s HUP; pkill -HUP with a pattern matching nginx):
 * the master then reloads, as with nginx -s reload.
 */
export function hupsMaster(cmd: string, args: readonly string[], master: Proc): boolean {
  const hup = args.some((a, i) => /^-(SIG)?HUP$|^-1$/.test(a) || ((a === '-s' || a === '-n') && /^((SIG)?HUP|1)$/.test(args[i + 1] ?? '')));
  if (!hup) return false;
  const operands = args.filter((a, i) => !a.startsWith('-') && args[i - 1] !== '-s' && args[i - 1] !== '-n');
  if (cmd === 'kill') return operands.includes(String(master.pid));
  try { return operands.length > 0 && new RegExp(operands.at(-1)!).test(commOf(master.command)); } catch { return false; }
}
/** The master re-reads the configuration (SIGHUP): applied with new workers, or kept when a socket cannot be bound (error.log). */
export function reloadRunning(state: FsState): FsState {
  const t = testConfig(state);
  if ('error' in t) return appendLog(state, errorLogOf(state.nginx?.applied), logStamp(state, 'emerg', masterOf(state)!.pid, t.error));
  const bind = bindProblem(state, t.conf);
  if (bind) return appendLog(state, errorLogOf(state.nginx?.applied), logStamp(state, 'emerg', masterOf(state)!.pid, bind));
  return applyConfig(state, t.conf);
}

// ------------------------------------------------------------------------------------------------- the nginx command

const two = (n: number) => String(n).padStart(2, '0');
function localFields(state: FsState) { const z = zoneOf(state), now = clockOf(state).now; return { f: fields(toLocal(z, now)), offset: offsetAt(z, now).offset }; }
/** An error-log line: 2026/11/22 10:00:00 [error] 813#813: message (local time). */
export function logStamp(state: FsState, level: string, pid: number, message: string): string {
  const { f } = localFields(state);
  return `${f.year}/${two(f.month + 1)}/${two(f.day)} ${two(f.hour)}:${two(f.minute)}:${two(f.second)} [${level}] ${pid}#${pid}: ${message}`;
}
/** The access log's $time_local: 22/Nov/2026:10:00:00 +0000. */
function timeLocal(state: FsState): string {
  const { f, offset } = localFields(state);
  return `${two(f.day)}/${MONTHS[f.month]}/${f.year}:${two(f.hour)}:${two(f.minute)}:${two(f.second)} ${offsetText(offset)}`;
}
function errorLogOf(conf: NgConf | undefined): string {
  const d = conf?.main.find(x => x.name === 'error_log');
  return d && d.args[0].startsWith('/') ? d.args[0] : DEFAULT_ERROR;
}
/** Appends a line to a file (nginx's descriptors were opened by root at start). */
function appendLog(state: FsState, path: string, line: string): FsState {
  const nodes = new Map(state.nodes), real = physicalPath(nodes, path, true), node = nodes.get(real);
  if (node && node.kind !== 'file') return state;
  if (!node && nodes.get(parentOf(real))?.kind !== 'dir') return state;
  const base: FsNode = node ?? { kind: 'file', mode: 0o644, owner: 'root', content: '' };
  nodes.set(real, { ...base, content: `${base.content ?? ''}${line}\n` });
  return { ...state, nodes };
}

/**
 * nginx -t [-q] | -T | -s reload|stop|quit|reopen | -v | -V [-c file] [-g directives]: the test messages of nginx 1.24 on
 * standard error; an ordinary user's test fails on the error log and the pid file, as on Ubuntu.
 */
export function nginxCommand(state: FsState, args: readonly string[], io: NetIo): NetResult {
  let test = false, dump = false, quiet = false, signal: string | undefined, conf = NGINX_CONF;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-t') test = true;
    else if (a === '-T') { test = true; dump = true; }
    else if (a === '-q') quiet = true;
    else if (a === '-v' || a === '-V') {
      io.err(`nginx version: ${NGINX_VERSION}`);
      if (a === '-V') { io.err('built with OpenSSL 3.0.13 30 Jan 2024'); io.err('TLS SNI support enabled'); io.err('configure arguments: --with-cc-opt=… --prefix=/usr/share/nginx --conf-path=/etc/nginx/nginx.conf --http-log-path=/var/log/nginx/access.log --error-log-path=stderr --user=www-data …（模擬環境省略）'); }
      return { state, status: 0 };
    }
    else if (a === '-s') { signal = args[++i]; if (!['reload', 'stop', 'quit', 'reopen'].includes(signal ?? '')) { io.err(`nginx: invalid option: "-s ${signal ?? ''}"`); return { state, status: 1 }; } }
    else if (a === '-c') { const v = args[++i]; if (!v) { io.err('nginx: option "-c" requires file name'); return { state, status: 1 }; } conf = resolvePath(state, v); }
    else if (a === '-g') i++;
    else if (a === '-h' || a === '-?') { io.err(`nginx version: ${NGINX_VERSION}`); io.err('Usage: nginx [-?hvVtTq] [-s signal] [-p prefix]'); io.err('             [-e filename] [-c filename] [-g directives]'); return { state, status: 0 }; }
    else { io.err(`nginx: invalid option: "${a.replace(/^-/, '')}"`); return { state, status: 1 }; }
  }
  const root = io.user === 'root';
  const alert = () => io.err(`nginx: [alert] could not open error log file: open() "${DEFAULT_ERROR}" failed (13: Permission denied)`);
  const pid = nextPid(state);
  if (test) {
    if (!root) alert();
    const t = testConfig(state, readerOf(state, io.user), conf);
    if ('error' in t) { io.err(`nginx: [emerg] ${t.error}`); io.err(`nginx: configuration file ${conf} test failed`); return { state, status: 1 }; }
    for (const w of t.conf.warnings) io.err(root ? `nginx: [warn] ${w}` : logStamp(state, 'warn', pid, w));
    if (!root) {
      if (t.conf.main.some(d => d.name === 'user')) { const u = t.conf.main.find(d => d.name === 'user')!; io.err(logStamp(state, 'warn', pid, `the "user" directive makes sense only if the master process runs with super-user privileges, ignored${at(u)}`)); }
      io.err(`nginx: the configuration file ${conf} syntax is ok`);
      io.err(logStamp(state, 'emerg', pid, 'open() "/run/nginx.pid" failed (13: Permission denied)'));
      io.err(`nginx: configuration file ${conf} test failed`);
      return { state, status: 1 };
    }
    if (!quiet) { io.err(`nginx: the configuration file ${conf} syntax is ok`); io.err(`nginx: configuration file ${conf} test is successful`); }
    if (dump) for (const f of t.conf.files) io.out(`# configuration file ${f.path}:\n${f.text}${f.text.endsWith('\n') || !f.text ? '' : '\n'}\n`);
    return { state, status: 0 };
  }
  if (signal) {
    if (!root) { alert(); io.err(`nginx: [error] open() "/run/nginx.pid" failed (13: Permission denied)`); return { state, status: 1 }; }
    const t = testConfig(state, readerOf(state), conf);
    if ('error' in t) { io.err(`nginx: [emerg] ${t.error}`); return { state, status: 1 }; }
    const master = masterOf(state);
    if (!master) { io.err(`nginx: [error] open() "/run/nginx.pid" failed (2: No such file or directory)`); return { state, status: 1 }; }
    if (signal === 'reload') return { state: reloadRunning(state), status: 0 };
    if (signal === 'reopen') return { state, status: 0 };
    return { state: afterSignal(state, [{ proc: master, signal: 15 }]), status: 0 };
  }
  // nginx alone starts a master outside systemd: here only the classic failure while one already runs.
  const t = testConfig(state, readerOf(state, io.user), conf);
  if (!root) { alert(); io.err(`nginx: [emerg] ${'error' in t ? t.error : `bind() to 0.0.0.0:${t.conf.servers[0]?.listens[0]?.port ?? 80} failed (13: Permission denied)`}`); return { state, status: 1 }; }
  if ('error' in t) { io.err(`nginx: [emerg] ${t.error}`); return { state, status: 1 }; }
  if (masterOf(state)) {
    const ls = listensOf(t.conf);
    for (let k = 0; k < 5; k++) for (const l of ls) io.err(`nginx: [emerg] bind() to ${l.address ?? '0.0.0.0'}:${l.port} failed (98: Address already in use)`);
    io.err('nginx: [emerg] still could not bind()');
    return { state, status: 1 };
  }
  io.err('nginx：模擬環境請用 sudo systemctl start nginx 啟動 nginx（由 systemd 管理，才看得到 status 與 journal）');
  return { state, status: 1 };
}

// ---------------------------------------------------------------------------------------------- answering requests

/** The servers that may answer a connection to address:port (the specific address's, else the wildcard's) and the default. */
function candidates(conf: NgConf, address: string, port: number): { list: Srv[]; def: Srv } | undefined {
  const exact = conf.servers.filter(s => s.listens.some(l => l.port === port && l.address === address));
  const list = exact.length ? exact : conf.servers.filter(s => s.listens.some(l => l.port === port && l.address === '0.0.0.0'));
  if (!list.length) return undefined;
  const key = exact.length ? address : '0.0.0.0';
  const def = list.find(s => s.listens.some(l => l.port === port && l.address === key && l.def)) ?? list[0];
  return { list, def };
}
/** nginx's server_name order: exact, the longest *.wildcard, the longest wildcard.*, the first regex, else the default server. */
export function selectServer(conf: NgConf, address: string, port: number, host: string | undefined): { srv: Srv; captures: Record<string, string> } | undefined {
  const c = candidates(conf, address, port);
  if (!c) return undefined;
  const name = (host ?? '').toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  if (!name) return { srv: c.def, captures: {} };
  const exact = c.list.find(s => s.names.some(n => n.toLowerCase() === name));
  if (exact) return { srv: exact, captures: {} };
  let best: { srv: Srv; len: number } | undefined;
  for (const s of c.list) for (const n of s.names.map(x => x.toLowerCase())) {
    const lead = n.startsWith('*.') ? n.slice(1) : n.startsWith('.') ? n : undefined;
    if (lead && (name.endsWith(lead) || `.${name}` === lead) && (!best || lead.length > best.len)) best = { srv: s, len: lead.length };
  }
  if (best) return { srv: best.srv, captures: {} };
  for (const s of c.list) for (const n of s.names.map(x => x.toLowerCase())) {
    if (n.endsWith('.*') && name.startsWith(n.slice(0, -1)) && (!best || n.length > best.len)) best = { srv: s, len: n.length };
  }
  if (best) return { srv: best.srv, captures: {} };
  for (const s of c.list) for (const n of s.names) {
    if (!n.startsWith('~')) continue;
    const m = new RegExp(n.slice(1).replace(/\(\?P</g, '(?<'), 'i').exec(name);
    if (m) return { srv: s, captures: { ...m.groups ?? {}, ...Object.fromEntries(m.slice(1).map((v, i) => [String(i + 1), v ?? ''])) } };
  }
  return { srv: c.def, captures: {} };
}
/** E14 (TLS): the certificate chain nginx presents for a connection with this SNI (the server chosen by name, as at the handshake). */
export function nginxCertificate(host: FsState, address: string, port: number, sni: string): Cert[] | undefined {
  const conf = host.nginx?.applied;
  if (!conf) return undefined;
  const sel = selectServer(conf, address, port, sni || undefined);
  return sel?.srv.cert?.chain ?? conf.servers.find(s => s.cert && s.listens.some(l => l.port === port))?.cert?.chain;
}

/** nginx's documented location order: exact (=), the longest prefix (^~ stops there), regexes in order, else that prefix. */
export function findLocation(locs: readonly Loc[], uri: string): { loc: Loc; captures: string[] } | undefined {
  const exact = locs.find(l => l.mod === '=' && l.path === uri);
  if (exact) return { loc: exact, captures: [] };
  let prefix: Loc | undefined;
  for (const l of locs) if ((l.mod === '' || l.mod === '^~') && uri.startsWith(l.path) && (!prefix || l.path.length > prefix.path.length)) prefix = l;
  let found: { loc: Loc; captures: string[] } | undefined = prefix ? { loc: prefix, captures: [] } : undefined;
  if (prefix && prefix.children.length) {
    const inner = findLocation(prefix.children, uri);
    if (inner && (inner.loc.mod === '=' || inner.loc.mod === '~' || inner.loc.mod === '~*' || inner.loc.mod === '^~')) return inner;
    if (inner) found = inner;
  }
  if (prefix?.mod === '^~') return found;
  for (const l of locs) {
    if (!l.re) continue;
    const m = l.re.exec(uri);
    if (m) return { loc: l, captures: m.slice(1).map(v => v ?? '') };
  }
  return found;
}

interface Ctx2 { srv: Srv; loc?: Loc; conf: NgConf }
/** The directives of the innermost level (location, its parents, the server, http) that has `name`. */
function levelWith(c: Ctx2, name: string): Dir[] {
  const levels: Dir[][] = [];
  for (let l = c.loc; l; l = l.parent) levels.push(l.dirs);
  levels.push(c.srv.dirs, c.conf.http);
  for (const dirs of levels) { const own = dirs.filter(d => d.name === name); if (own.length) return own; }
  return [];
}
const flag = (c: Ctx2, name: string, def: boolean) => { const d = levelWith(c, name)[0]; return d ? d.args[0] === 'on' : def; };

export interface Served { res: Response; host: FsState }
/** E15: what an upstream answered (or how the attempt failed); delay is how long the response took (seconds). */
export type UpstreamResult = { kind: 'refused' } | { kind: 'timeout' } | { kind: 'closed' } | { kind: 'plain' } | { kind: 'response'; res: Response; delay: number };
/**
 * E15: how nginx's machine reaches an upstream server, given by the caller that knows the network (curl, the lesson checks):
 * proxyHost is the nginx machine's state now (an upstream on the same machine is served on it and handed back).
 */
export type UpstreamFn = (proxyHost: FsState, address: string, port: number, scheme: 'http' | 'https', req: Request) => { result: UpstreamResult; host: FsState; /** E18: the round trip to it (ms) */ ms?: number };
export interface Exchange2 { address: string; port: number; https: boolean; client: string; req: Request; now: number; /** E15 */ upstream?: UpstreamFn }

/** E14: nginx answers one request; the access and error logs are written on the host (its new state is returned). */
export function nginxServe(host0: FsState, x: Exchange2): Served {
  const conf = host0.nginx!.applied!;
  const n = { ...nginxOf(host0), connections: nginxOf(host0).connections + 1 };
  let host: FsState = { ...host0, nginx: n };
  const workers = tableOf(host).filter(p => p.ppid === masterOf(host)?.pid && commOf(p.command) === 'nginx');
  const wpid = workers[0]?.pid ?? masterOf(host)?.pid ?? 0;
  const hostHeader = x.req.headers.find(([k]) => k.toLowerCase() === 'host')?.[1];
  const sel = selectServer(conf, x.address, x.port, hostHeader)!;
  const srv = sel.srv;
  const rawUri = x.req.path, qAt = rawUri.indexOf('?');
  const args = qAt >= 0 ? rawUri.slice(qAt + 1) : '';
  let uri = normalizeUri(qAt >= 0 ? rawUri.slice(0, qAt) : rawUri);
  const serverTokens = flag({ srv, conf }, 'server_tokens', true);
  const serverHeader = serverTokens ? NGINX_VERSION : 'nginx';
  const hostName = (hostHeader ?? srv.names[0] ?? '').replace(/:\d+$/, '');
  const errors: { msg: string; level: 'error' | 'warn'; upstream?: string }[] = [];
  const logError = (msg: string, upstream?: string, level: 'error' | 'warn' = 'error') => errors.push({ msg, level, ...upstream !== undefined ? { upstream } : {} });
  // E15: what the proxy module tried ($upstream_addr, $upstream_status) and the variables of map blocks.
  let upstreamAddr = '', upstreamStatus = '', proxyHostVar = '', proxyPortVar = '';
  // E18: the cache's verdict ($upstream_cache_status) and the time spent reaching upstreams (curl -w).
  let cacheStatus = '', upstreamMs = 0;
  const edge = !!host0.nginx?.edge;
  const vars = (c: Ctx2, captures: string[]) => (text: string): string => text.replace(/\$(?:\{(\w+)\}|(\w+))/g, (_m, a: string | undefined, b: string | undefined): string => {
    const name = a ?? b ?? '';
    if (/^\d$/.test(name)) return captures[Number(name) - 1] ?? sel.captures[name] ?? '';
    switch (name) {
      case 'uri': return uri;
      case 'request_uri': return rawUri;
      case 'host': return hostName.toLowerCase();
      case 'http_host': return hostHeader ?? '';
      case 'scheme': return x.https ? 'https' : 'http';
      case 'args': case 'query_string': return args;
      case 'is_args': return args ? '?' : '';
      case 'server_name': return srv.names[0] ?? '';
      case 'server_port': return String(x.port);
      case 'server_addr': return x.address;
      case 'remote_addr': return x.client;
      case 'request_method': return x.req.method;
      case 'document_root': return rootOf(c) ?? '';
      case 'proxy_add_x_forwarded_for': { const xff = x.req.headers.find(([k]) => k.toLowerCase() === 'x-forwarded-for')?.[1]; return xff ? `${xff}, ${x.client}` : x.client; }
      case 'proxy_host': return proxyHostVar;
      case 'proxy_port': return proxyPortVar;
      case 'upstream_addr': return upstreamAddr;
      case 'upstream_status': return upstreamStatus;
      case 'server_protocol': return 'HTTP/1.1';
      case 'upstream_cache_status': return cacheStatus;
      default: {
        const map = conf.maps?.find(m => m.target === name);
        if (map) {
          const source: string = vars(c, captures)(map.source);
          const hit: MapDef['entries'][number] | undefined = map.entries.find(e => e.re ? e.re.test(source) : e.key.toLowerCase() === source.toLowerCase());
          return vars(c, captures)(hit ? hit.value : map.def);
        }
        if (name.startsWith('http_')) return x.req.headers.find(([k]) => k.toLowerCase().replace(/-/g, '_') === name.slice(5))?.[1] ?? '';
        if (name.startsWith('arg_')) return new URLSearchParams(args).get(name.slice(4)) ?? '';
        if (name.startsWith('cookie_')) { const jar = x.req.headers.find(([k]) => k.toLowerCase() === 'cookie')?.[1] ?? ''; return jar.split(';').map(c => c.trim().split('=')).find(([k]) => k === name.slice(7))?.[1] ?? ''; }
        return sel.captures[name] ?? '';
      }
    }
  });
  const rootOf = (c: Ctx2) => levelWith(c, 'root')[0]?.args[0] ?? '/usr/share/nginx/html';
  const workerUser = conf.user, acc = accountsOf(host), view: FsState = { ...host, user: workerUser, groups: loginGroups(acc, workerUser), cwd: '/' };
  type Look = { kind: 'file'; node: FsNode; path: string } | { kind: 'dir'; path: string } | { kind: 'none'; errno: 2 | 13 };
  const look = (path: string): Look => {
    const w = walk(view, physicalPath(host.nodes, path, false));
    if ('error' in w) return { kind: 'none', errno: w.error === 'EACCES' ? 13 : 2 };
    if (!w.node) return { kind: 'none', errno: 2 };
    return w.node.kind === 'dir' ? { kind: 'dir', path: w.path } : { kind: 'file', node: w.node, path: w.path };
  };
  const fileFor = (c: Ctx2, u: string, captures: string[]): string => {
    const alias = c.loc ? c.loc.dirs.find(d => d.name === 'alias') : undefined;
    if (alias && c.loc) {
      const a = vars(c, captures)(alias.args[0]);
      if (c.loc.re) return a;
      return a + u.slice(c.loc.path.length);
    }
    return vars(c, captures)(rootOf(c)) + u;
  };
  const contentType = (c: Ctx2, path: string) => {
    const ext = /\.([^./]+)$/.exec(path)?.[1]?.toLowerCase();
    return (ext && conf.mime.get(ext)) ?? levelWith(c, 'default_type')[0]?.args[0] ?? 'text/plain';
  };
  type Out = {
    status: number; body?: string; type?: string; location?: string; c: Ctx2; /** E15: an upstream's response (its other headers, in order) */ proxied?: { headers: [string, string][]; upgrade: boolean; length?: string };
    /** E18: a static file (its mtime and size give Last-Modified and ETag); a cached upstream response (nginx answers conditional requests for it). */
    file?: { mtime: number; size: number }; cached?: true;
  };
  const fail = (status: number, c: Ctx2): Out => ({ status, c });
  const access = (c: Ctx2): Out | null => {
    for (const d of [...levelWith(c, 'allow'), ...levelWith(c, 'deny')].sort((p, q) => p.line - q.line || (p.file < q.file ? -1 : 1))) {
      const [net, bits] = d.args[0].split('/');
      const hit = d.args[0] === 'all' || (bits === undefined ? net === x.client : (ipNum(net) >>> (32 - Number(bits))) === (ipNum(x.client) >>> (32 - Number(bits))) || Number(bits) === 0);
      if (hit) { if (d.name === 'deny') { logError('access forbidden by rule'); return fail(403, c); } return null; }
    }
    return null;
  };
  // Static file module (and index): GET and HEAD only.
  const serveStatic = (c: Ctx2, u: string, captures: string[], redirects: number): Out => {
    if (u.endsWith('/')) {
      const dir = fileFor(c, u, captures), d = look(dir);
      for (const idx of levelWith(c, 'index').flatMap(x2 => x2.args).concat(levelWith(c, 'index').length ? [] : ['index.html'])) {
        const name = vars(c, captures)(idx), target = idx.startsWith('/') ? name : u + name;
        const f = look(idx.startsWith('/') ? fileFor(c, name, captures) : dir + name);
        if (f.kind === 'file') return internal(target, redirects + 1, c.srv);
        if (f.kind === 'none' && f.errno === 13) { logError(`open() "${dir}${name}" failed (13: Permission denied)`); return fail(403, c); }
      }
      if (d.kind === 'dir' && flag(c, 'autoindex', false)) {
        const names = childrenOf(host.nodes, d.path).map(baseName).filter(nm => !nm.startsWith('.')).sort();
        const rows = names.map(nm => { const nd = host.nodes.get(joinPath(d.path, nm)); const slash = nd?.kind === 'dir' ? '/' : ''; return `<a href="${nm}${slash}">${nm}${slash}</a>`; });
        return { status: 200, body: `<html>\n<head><title>Index of ${u}</title></head>\n<body>\n<h1>Index of ${u}</h1><hr><pre><a href="../">../</a>\n${rows.map(r => `${r}\n`).join('')}</pre><hr></body>\n</html>\n`, type: 'text/html', c };
      }
      if (d.kind === 'dir') { logError(`directory index of "${dir}" is forbidden`); return fail(403, c); }
      if (d.kind === 'none' && d.errno === 13) { logError(`"${dir}index.html" is forbidden (13: Permission denied)`); return fail(403, c); }
      logError(`"${dir}${levelWith(c, 'index')[0]?.args[0] ?? 'index.html'}" is not found (2: No such file or directory)`);
      return fail(404, c);
    }
    const path = fileFor(c, u, captures), f = look(path);
    if (f.kind === 'dir') return { status: 301, location: `${u}/${args ? `?${args}` : ''}`, c };
    if (f.kind === 'none') {
      if (f.errno === 13) { logError(`open() "${path}" failed (13: Permission denied)`); return fail(403, c); }
      if (flag(c, 'log_not_found', true)) logError(`open() "${path}" failed (2: No such file or directory)`);
      return fail(404, c);
    }
    if (!modeAllows(f.node, view)) { logError(`open() "${path}" failed (13: Permission denied)`); return fail(403, c); }
    if (x.req.method !== 'GET' && x.req.method !== 'HEAD') return fail(405, c);
    const content = f.node.content ?? '';
    return { status: 200, body: content, type: contentType(c, path), c, ...edge ? { file: { mtime: f.node.mtime ?? clockOf(host).boot, size: new TextEncoder().encode(content).length } } : {} };
  };
  const runRewrites = (dirs: Dir[], c: Ctx2, captures: string[]): Out | { last: string } | { brk: true } | null => {
    for (const d of dirs) {
      if (d.name === 'if') {
        const cond = ifCondition(d), v = vars(c, captures)(cond.variable);
        const hit = !cond.op ? v !== '' && v !== '0' : cond.op === '=' ? v === vars(c, captures)(cond.value!) : cond.op === '!=' ? v !== vars(c, captures)(cond.value!)
          : cond.op.startsWith('!') ? !cond.re!.test(v) : cond.re!.test(v);
        if (!hit) continue;
        const r = runRewrites(d.block ?? [], c, captures);
        if (r) return r;
        continue;
      }
      if (d.name === 'return') {
        const v = vars(c, captures);
        if (d.args.length === 1 && !/^\d+$/.test(d.args[0])) return { status: 302, location: v(d.args[0]), c };
        const code = Number(d.args[0]), text = d.args[1] !== undefined ? v(d.args[1]) : undefined;
        if ([301, 302, 303, 307, 308].includes(code) && text !== undefined) return { status: code, location: text, c };
        if (text !== undefined) return { status: code, body: text, type: levelWith(c, 'default_type')[0]?.args[0] ?? 'text/plain', c };
        return { status: code, c };
      }
      if (d.name === 'rewrite') {
        const m = regex(d.args[0], '', d).exec(uri);
        if (!m) continue;
        const caps = m.slice(1).map(s => s ?? '');
        let to = vars(c, caps)(d.args[1]);
        const flagName = d.args[2];
        if (/^https?:\/\//.test(to) || flagName === 'redirect' || flagName === 'permanent') return { status: flagName === 'permanent' ? 301 : 302, location: to, c };
        if (to.includes('?')) to = to.split('?')[0];
        uri = to;
        rewritten = true;
        if (flagName === 'last') return { last: to };
        if (flagName === 'break') return { brk: true };
      }
    }
    return null;
  };
  let rewritten = false;
  /** E15: proxy_pass — the upstream request (URI, proxy_set_header and the defaults), the peers in turn, 502/504 and their log lines. */
  const proxyTo = (c: Ctx2, loc: Loc, captures: string[]): Out => {
    const p = loc.proxy!, up = conf.upstreams.find(u => u.name === p.upstream)!, v = vars(c, captures);
    proxyHostVar = p.hostPort; proxyPortVar = String(up.implicit ? up.servers[0].port : 80);
    const prefix = loc.mod === '' || loc.mod === '^~' || loc.mod === '=';
    const query = args ? `?${args}` : '';
    const path = rewritten ? uri + query : p.uri !== undefined ? p.uri + (prefix ? uri.slice(loc.path.length) : '') + query : rawUri;
    // E18: the cache of this location (proxy_cache with a zone of proxy_cache_path), for the methods it caches.
    const cdir = edge ? levelWith(c, 'proxy_cache')[0] : undefined;
    const zone = cdir && cdir.args[0] !== 'off' ? conf.zones?.find(z => z.name === cdir.args[0]) : undefined;
    const cacheMethods = new Set(['GET', 'HEAD', ...levelWith(c, 'proxy_cache_methods').flatMap(d => d.args)]);
    const caching = !!zone && cacheMethods.has(x.req.method);
    const userSet = levelWith(c, 'proxy_set_header').map(d => [d.args[0], v(d.args[1])] as [string, string]);
    const body = x.req.body;
    // With a cache nginx asks for the whole response itself: the client's conditional and range headers are not passed on.
    const cacheDefaults: [string, string][] = caching ? [['If-Modified-Since', ''], ['If-Unmodified-Since', ''], ['If-None-Match', ''], ['If-Match', ''], ['Range', ''], ['If-Range', '']] : [];
    const defaults: [string, string][] = [['Host', p.hostPort], ['Connection', 'close'], ...body !== undefined ? [['Content-Length', String(new TextEncoder().encode(body).length)] as [string, string]] : [],
      ['Transfer-Encoding', ''], ['TE', ''], ['Keep-Alive', ''], ['Expect', ''], ['Upgrade', ''], ...cacheDefaults];
    const merged = [...userSet, ...defaults.filter(([k]) => !userSet.some(([u]) => u.toLowerCase() === k.toLowerCase()))];
    const keys = new Set(merged.map(([k]) => k.toLowerCase()));
    const headers: [string, string][] = [...merged.filter(([, val]) => val !== ''), ...x.req.headers.filter(([k]) => !keys.has(k.toLowerCase()))];
    const version = levelWith(c, 'proxy_http_version')[0]?.args[0] === '1.1' ? '1.1' : '1.0';
    // proxy_cache_convert_head: a cached HEAD is fetched with GET.
    const req: Request = { method: caching && x.req.method === 'HEAD' ? 'GET' : x.req.method, path, headers, ...body !== undefined ? { body } : {}, version };
    const time = (name: string, def: number) => { const d = levelWith(c, name)[0]; return d ? timeValue(d.args[0]) ?? def : def; };
    const connectTimeout = Math.min(time('proxy_connect_timeout', 60), 75), readTimeout = time('proxy_read_timeout', 60);
    const nextOn = levelWith(c, 'proxy_next_upstream').flatMap(d => d.args), retryOn = nextOn.length ? (nextOn.includes('off') ? [] : nextOn) : ['error', 'timeout'];
    const triesDir = levelWith(c, 'proxy_next_upstream_tries')[0], maxTries = triesDir ? Number(triesDir.args[0]) : 0;
    const idempotent = ['GET', 'HEAD', 'OPTIONS', 'TRACE', 'PUT', 'DELETE'].includes(x.req.method) || retryOn.includes('non_idempotent');
    /** The upstream request through the peers in turn (502/504 and their log lines); extra: conditional headers of a revalidation. */
    const fetch = (extra: [string, string][] = []): { res?: Response; last?: 'error' | 'timeout'; seconds: number } => {
      const n0 = host.nginx!, table = n0.peers?.[up.name] ?? { primary: freshPeers(up.servers.filter(z => !z.backup)), backup: freshPeers(up.servers.filter(z => z.backup)) };
      const peers = { primary: table.primary.map(z => ({ ...z })), backup: table.backup.map(z => ({ ...z })) };
      const peerOf = (i: number) => { const srv = up.servers[i], list = srv.backup ? peers.backup : peers.primary, group = up.servers.filter(z => z.backup === srv.backup); return { srv, state: list[group.indexOf(srv)], single: up.servers.length === 1 }; };
      const tried = new Set<number>(), addrs: string[] = [], statuses: string[] = [];
      const sent: Request = extra.length ? { ...req, headers: [...req.headers, ...extra] } : req;
      let res: Response | undefined, last: 'error' | 'timeout' | undefined, waited = 0;
      for (;;) {
        const i = pickPeer(up, peers, tried, x.client, srv => n0.conns?.[`${up.name}/${srv.text}`] ?? 0, edge ? x.now : undefined);
        if (i === undefined) {
          if (!tried.size) { logError('no live upstreams while connecting to upstream', `${p.scheme}://${up.name}${path}`); addrs.push(up.name); last = 'error'; }
          break;
        }
        tried.add(i);
        const { srv, state: ps, single } = peerOf(i), upstreamUrl = `${p.scheme}://${srv.text}${path}`;
        addrs.push(srv.text);
        const r = x.upstream ? x.upstream(host, srv.address, srv.port, p.scheme, sent) : { result: { kind: 'refused' } as UpstreamResult, host };
        host = r.host;
        if (edge) upstreamMs += r.ms ?? 0;
        const a = r.result;
        if (a.kind === 'response' && a.delay < readTimeout) { res = a.res; waited += a.delay; statuses.push(String(a.res.status)); peerSucceeded(ps); break; }
        const failure: { kind: 'error' | 'timeout'; msg: string; phase: string } =
          a.kind === 'refused' ? { kind: 'error', msg: 'connect() failed (111: Connection refused) while connecting to upstream', phase: 'connecting to' }
            : a.kind === 'timeout' ? { kind: 'timeout', msg: 'upstream timed out (110: Connection timed out) while connecting to upstream', phase: 'connecting to' }
              : a.kind === 'closed' ? { kind: 'error', msg: 'upstream prematurely closed connection while reading response header from upstream', phase: 'reading response header from' }
                : a.kind === 'plain' ? { kind: 'error', msg: 'SSL_do_handshake() failed (SSL: error:0A00010B:SSL routines::wrong version number) while SSL handshaking to upstream', phase: 'SSL handshaking to' }
                  : { kind: 'timeout', msg: 'upstream timed out (110: Connection timed out) while reading response header from upstream', phase: 'reading response header from' };
        waited += failure.kind === 'timeout' ? (a.kind === 'timeout' ? connectTimeout : readTimeout) : 0;
        logError(failure.msg, upstreamUrl);
        statuses.push(failure.kind === 'timeout' ? '504' : '502');
        if (peerFailed(srv, ps, single, edge ? x.now : undefined)) logError(`upstream server temporarily disabled while ${failure.phase} upstream`, upstreamUrl, 'warn');
        last = failure.kind;
        const wasSent = a.kind === 'closed' || a.kind === 'response';
        if (!retryOn.includes(failure.kind) || (wasSent && !idempotent) || (maxTries && tried.size >= maxTries)) break;
      }
      host = { ...host, nginx: { ...host.nginx!, peers: { ...host.nginx!.peers, [up.name]: peers } } };
      upstreamAddr = addrs.join(', ');
      upstreamStatus = res ? statuses.join(', ') : statuses.length ? statuses.join(', ') : '';
      return { ...res ? { res } : {}, ...last && !res ? { last } : {}, seconds: waited };
    };
    // The upstream's response: nginx's own Server and Date, the hop-by-hop headers dropped, proxy_redirect on Location.
    const shape = (res: Response): Out => {
      const hide = new Set(['server', 'date', 'connection', 'keep-alive', 'transfer-encoding', 'content-length', 'content-type', 'x-pad', 'x-accel-expires', 'x-accel-redirect', 'x-accel-limit-rate', 'x-accel-buffering', 'x-accel-charset',
        ...levelWith(c, 'proxy_hide_header').map(d => d.args[0].toLowerCase())].filter(h => !levelWith(c, 'proxy_pass_header').some(d => d.args[0].toLowerCase() === h)));
      const redirect = levelWith(c, 'proxy_redirect');
      const rewriteLocation = (l: string) => {
        if (redirect[0]?.args[0] === 'off') return l;
        const rules = redirect.length && redirect[0].args[0] !== 'default' ? redirect.map(d => [d.args[0], d.args[1] ?? ''] as [string, string])
          : [p.uri !== undefined ? [p.url, loc.path] as [string, string] : [`${p.url}/`, '/'] as [string, string]];
        for (const [from, to] of rules) if (l.startsWith(from)) return to + l.slice(from.length);
        return l;
      };
      const passed: [string, string][] = [];
      let location: string | undefined;
      for (const [k, val] of res.headers) {
        const key = k.toLowerCase();
        if (key === 'location') { location = rewriteLocation(val); if (!location.startsWith('/')) passed.push([k, location]); continue; }
        if (res.status === 101 && key === 'upgrade') { passed.push([k, val]); continue; }
        if (!hide.has(key)) passed.push([k, val]);
      }
      const type = res.headers.find(([k]) => k.toLowerCase() === 'content-type')?.[1], length = res.headers.find(([k]) => k.toLowerCase() === 'content-length')?.[1];
      return { status: res.status, body: res.body, ...type !== undefined ? { type } : {}, ...location?.startsWith('/') ? { location } : {}, c, proxied: { headers: passed, upgrade: res.status === 101, ...length !== undefined ? { length } : {} } };
    };
    const failed = (last: 'error' | 'timeout' | undefined): Out => ({ status: last === 'timeout' ? 504 : 502, c });
    if (!caching) {
      const f = fetch();
      wait += f.seconds;
      return f.res ? shape(f.res) : failed(f.last);
    }
    return cached(zone!, c, v, fetch, shape, failed);
  };
  /** E18: proxy_cache — HIT, MISS, EXPIRED, BYPASS, STALE, UPDATING and REVALIDATED, the entries and their files on the host. */
  const cached = (zone: CacheZone, c: Ctx2, v: (t: string) => string, fetch: (extra?: [string, string][]) => { res?: Response; last?: 'error' | 'timeout'; seconds: number },
    shape: (res: Response) => Out, failed: (last: 'error' | 'timeout' | undefined) => Out): Out => {
    const now = x.now, key = v(levelWith(c, 'proxy_cache_key')[0]?.args[0] ?? '$scheme$proxy_host$request_uri');
    const truthy = (name: string) => levelWith(c, name).flatMap(d => d.args).some(a => { const t = v(a); return t !== '' && t !== '0'; });
    const bypass = truthy('proxy_cache_bypass'), noStore = truthy('proxy_no_cache');
    const useStale = new Set(levelWith(c, 'proxy_cache_use_stale').flatMap(d => d.args));
    const background = flag(c, 'proxy_cache_background_update', false), revalidate = flag(c, 'proxy_cache_revalidate', false);
    const ignored = new Set(levelWith(c, 'proxy_ignore_headers').flatMap(d => d.args.map(a => a.toLowerCase())));
    const validDirs = levelWith(c, 'proxy_cache_valid'), minUses = Number(levelWith(c, 'proxy_cache_min_uses')[0]?.args[0] ?? 1);
    const nodes = new Map(host.nodes);
    const uses = { ...host.nginx!.uses };
    // The cache manager: entries not used for `inactive` go, and so does an entry whose file was deleted (rm is the purge of open-source nginx).
    let entries = (host.nginx!.cache?.[zone.name] ?? []).filter(e => {
      const ok = now - e.access <= zone.inactive && nodes.get(e.file)?.kind === 'file';
      if (!ok) nodes.delete(e.file);
      return ok;
    }).map(e => e.next && now >= e.next.ready ? e.next.entry : e);
    const found = entries.find(e => e.key === key && e.vary === varyOf(e.varyNames, x.req));
    const store = (res: Response): NgEntry | undefined => {
      if (noStore) return undefined;
      const st = storable(res, now, ignored);
      if (!st.store) return undefined;
      const ttl = st.ttl ?? validFor(validDirs, res.status, timeValue);
      if (!ttl) return undefined;
      const counted = `${zone.name}\n${key}`;
      uses[counted] = (uses[counted] ?? 0) + 1;
      if (uses[counted] < minUses) return undefined;
      const vary = varyKey(res, x.req, ignored), file = cacheFile(zone, md5(vary ? `${key}\n${vary}` : key));
      if (!writeCacheFile(nodes, zone, file, cacheText(key, res), conf.user, LIMITS.nodes)) return undefined;
      delete uses[counted];
      return { key, vary, varyNames: ignored.has('vary') ? [] : varyNames(res), file, res, stored: now, valid: now + ttl, access: now };
    };
    const put = (e: NgEntry | undefined, replacing?: NgEntry) => { entries = [...entries.filter(z => z !== replacing && !(e && z.key === e.key && z.vary === e.vary)), ...e ? [e] : []]; };
    const fromCache = (e: NgEntry, status: string): Out => { cacheStatus = status; put({ ...e, access: now }, e); return { ...shape(e.res), cached: true }; };
    const fresh = (res: Response, status: string): Out => { cacheStatus = status; const e = store(res); if (e) put(e); return { ...shape(res), ...e ? { cached: true as const } : {} }; };
    const staleFor = (r: { res?: Response; last?: 'error' | 'timeout' }) => r.res ? useStale.has(`http_${r.res.status}`) : useStale.has(r.last ?? 'error');
    let out: Out;
    if (bypass) {
      cacheStatus = 'BYPASS';
      const f = fetch();
      wait += f.seconds;
      out = f.res ? fresh(f.res, 'BYPASS') : failed(f.last);
    } else if (found && now < found.valid) out = fromCache(found, 'HIT');
    else if (found) {
      const updating = found.next && now < found.next.ready;
      if (updating && useStale.has('updating')) out = fromCache(found, 'UPDATING');
      else if (background && useStale.has('updating')) {
        // The client gets the stale response at once; a background request refreshes the entry (ready when the upstream has answered).
        out = fromCache(found, 'STALE');
        const saved = { upstreamAddr, upstreamStatus, upstreamMs };
        const f = fetch();
        ({ upstreamAddr, upstreamStatus, upstreamMs } = saved);
        const e = f.res ? store(f.res) : undefined;
        if (e) put({ ...found, access: now, next: { entry: e, ready: now + f.seconds } }, found);
      } else {
        const lm = headerOf(found.res.headers, 'Last-Modified'), etag = headerOf(found.res.headers, 'ETag');
        const extra: [string, string][] = revalidate ? [...lm ? [['If-Modified-Since', lm] as [string, string]] : [], ...etag ? [['If-None-Match', etag] as [string, string]] : []] : [];
        const f = fetch(extra);
        wait += f.seconds;
        if (f.res && f.res.status === 304 && extra.length) {
          // REVALIDATED: the stored response is fresh again (the 304's own freshness, else proxy_cache_valid for the stored status).
          const st = storable({ ...found.res, headers: [...found.res.headers.filter(([k]) => !f.res!.headers.some(([n]) => n.toLowerCase() === k.toLowerCase())), ...f.res.headers] }, now, ignored);
          const ttl = (st.store ? st.ttl : 0) ?? validFor(validDirs, found.res.status, timeValue) ?? 0;
          out = fromCache({ ...found, stored: now, valid: now + ttl }, 'REVALIDATED');
        } else if ((!f.res || useStale.has(`http_${f.res.status}`)) && staleFor(f)) out = fromCache(found, 'STALE');
        else out = f.res ? fresh(f.res, 'EXPIRED') : (cacheStatus = 'EXPIRED', failed(f.last));
      }
    } else {
      const f = fetch();
      wait += f.seconds;
      out = f.res ? fresh(f.res, 'MISS') : (cacheStatus = 'MISS', failed(f.last));
    }
    host = { ...host, nodes, nginx: { ...host.nginx!, cache: { ...host.nginx!.cache, [zone.name]: entries }, uses } };
    return out;
  };
  let wait = 0;
  const internal = (u: string, redirects: number, s: Srv): Out => {
    if (redirects > 10) { logError(`rewrite or internal redirection cycle while internally redirecting to "${u}"`); return fail(500, { srv: s, conf }); }
    uri = u;
    const found = u.startsWith('@') ? (() => { const l = s.locs.find(z => z.mod === '@' && z.path === u); return l ? { loc: l, captures: [] as string[] } : undefined; })() : findLocation(s.locs.filter(l => l.mod !== '@'), u);
    const c: Ctx2 = { srv: s, conf, ...found ? { loc: found.loc } : {} };
    const captures = found?.captures ?? [];
    const denied = access(c);
    if (denied) return denied;
    if (found) {
      const r = runRewrites(found.loc.dirs.filter(d => d.name === 'return' || d.name === 'rewrite' || d.name === 'if'), c, captures);
      if (r && 'last' in r) return internal(r.last, redirects + 1, s);
      if (r && 'status' in r) return r;
      if (r && 'brk' in r) return found.loc.proxy ? proxyTo(c, found.loc, captures) : serveStatic(c, uri, captures, redirects);
      // E15: a location with proxy_pass hands the request to its upstream (try_files there is not modelled).
      if (found.loc.proxy) return proxyTo(c, found.loc, captures);
    }
    // try_files is not inherited: the location's own, or the server's when no location matched.
    const tf = found ? found.loc.dirs.find(d => d.name === 'try_files') : s.dirs.find(d => d.name === 'try_files');
    if (tf) {
      const v = vars(c, captures), list = tf.args.slice(0, -1), last = tf.args.at(-1)!;
      // A parameter ending in / tests a directory: the URI becomes the value without that slash, so /about (a folder) gets the 301.
      for (const p of list) {
        const dirTest = p.endsWith('/'), value = dirTest ? v(p).slice(0, -1) : v(p), f = look(fileFor(c, value || '/', captures));
        if (dirTest ? f.kind === 'dir' : f.kind === 'file') { uri = value || '/'; return serveStatic(c, uri, captures, redirects); }
      }
      if (/^=\d+$/.test(last)) return fail(Number(last.slice(1)), c);
      return internal(v(last), redirects + 1, s);
    }
    return serveStatic(c, uri, captures, redirects);
  };
  // The server-level rewrite phase, then the location.
  const sc: Ctx2 = { srv, conf };
  const serverLevel = runRewrites(srv.dirs.filter(d => d.name === 'return' || d.name === 'rewrite' || d.name === 'if'), sc, []);
  let out: Out = serverLevel && 'status' in serverLevel ? serverLevel : internal(uri, 0, srv);
  // error_page: an internal redirect for the listed status (once), the page's own status unless =code.
  const ep = levelWith(out.c, 'error_page').find(d => d.args.slice(0, -1).includes(String(out.status)));
  // E15: an upstream's own error passes through unless proxy_intercept_errors is on.
  if (ep && out.status >= 300 && !out.location && (!out.proxied || flag(out.c, 'proxy_intercept_errors', false))) {
    const target = ep.args.at(-1)!, eq = ep.args.slice(0, -1).find(a => a.startsWith('='));
    if (/^https?:\/\//.test(target)) out = { status: 302, location: target, c: out.c };
    else {
      const status = out.status, method = x.req.method;
      const again = (() => { const saved = x.req.method; x.req = { ...x.req, method: method === 'HEAD' ? 'HEAD' : 'GET' }; const r = internal(target, 1, srv); x.req = { ...x.req, method: saved }; return r; })();
      if (again.status === 200 && again.body !== undefined) out = { ...again, status: eq ? (eq.length > 1 ? Number(eq.slice(1)) : 200) : status };
    }
  }
  // The response: nginx's header order; a relative Location is made absolute (before Connection), an absolute one comes after it.
  const c = out.c, status = out.status;
  const keepAlive = (() => { const d = levelWith(c, 'keepalive_timeout')[0]; return !d || !/^0[sm]?$/.test(d.args[0]); })();
  let body = out.body ?? (status >= 300 || status === 0 ? errorPage(status, serverHeader) : '');
  const relative = out.location?.startsWith('/') ?? false;
  const scheme = x.https ? 'https' : 'http', portPart = (x.https && x.port === 443) || (!x.https && x.port === 80) ? '' : `:${x.port}`;
  const location = out.location === undefined ? undefined : relative ? `${scheme}://${hostName.toLowerCase() || x.address}${portPart}${out.location}` : out.location;
  // E18: the static module's validators, and the not_modified filter (a 304 for a matching conditional request).
  const file = edge && status === 200 ? out.file : undefined;
  const lastModified = file ? httpDate(file.mtime) : undefined, etag = file && flag(c, 'etag', true) ? nginxEtag(file.mtime, file.size) : undefined;
  let final = status;
  if (edge && status === 200 && (file || out.cached)) {
    const validators: [string, string][] = [...lastModified ? [['Last-Modified', lastModified] as [string, string]] : [], ...etag ? [['ETag', etag] as [string, string]] : [], ...out.proxied?.headers ?? []];
    const mode = (levelWith(c, 'if_modified_since')[0]?.args[0] ?? 'exact') as 'exact' | 'before' | 'off';
    if (notModified(x.req, { status: 200, reason: 'OK', headers: validators, body: '', close: false }, mode)) final = 304;
  }
  const noBody = final === 204 || final === 101 || final === 304;
  const type = noBody ? undefined : out.proxied ? out.type : out.body !== undefined ? out.type ?? 'text/html' : 'text/html';
  const headers: [string, string][] = [['Server', serverHeader], ['Date', httpDate(x.now)]];
  if (noBody) body = '';
  if (type) headers.push(['Content-Type', type]);
  if (!noBody) headers.push(['Content-Length', out.proxied?.length ?? String(new TextEncoder().encode(body).length)]);
  if (lastModified) headers.push(['Last-Modified', lastModified]);
  if (location && relative) headers.push(['Location', location]);
  headers.push(['Connection', out.proxied?.upgrade ? 'upgrade' : keepAlive ? 'keep-alive' : 'close']);
  if (location && !relative) headers.push(['Location', location]);
  if (etag) headers.push(['ETag', etag]);
  const always = [200, 201, 204, 206, 301, 302, 303, 304, 307, 308].includes(final);
  // E18: expires replaces the upstream's Expires and Cache-Control (nginx reuses those headers).
  const expDir = edge && always ? levelWith(c, 'expires')[0] : undefined, exp = expDir ? expiresOf(expDir) : undefined;
  const expHeaders: [string, string][] = [];
  if (exp && exp.kind !== 'off') {
    if (exp.kind === 'epoch') expHeaders.push(['Expires', 'Thu, 01 Jan 1970 00:00:01 GMT'], ['Cache-Control', 'no-cache']);
    else if (exp.kind === 'max') expHeaders.push(['Expires', 'Thu, 31 Dec 2037 23:55:55 GMT'], ['Cache-Control', 'max-age=315360000']);
    else if (exp.kind === 'time') {
      const upstreamLm = out.proxied ? headerOf(out.proxied.headers, 'Last-Modified') : undefined;
      const since = exp.modified ? file?.mtime ?? parseLm(upstreamLm) : x.now;
      if (since !== undefined) {
        const at = since + exp.seconds;
        expHeaders.push(['Expires', httpDate(Math.max(0, at))], ['Cache-Control', exp.seconds < 0 || at < x.now ? 'no-cache' : `max-age=${at - x.now}`]);
      }
    }
  }
  if (out.proxied) headers.push(...expHeaders.length ? out.proxied.headers.filter(([k]) => !['expires', 'cache-control'].includes(k.toLowerCase())) : out.proxied.headers);
  headers.push(...expHeaders);
  for (const d of levelWith(c, 'add_header')) if (always || d.args[2] === 'always') headers.push([d.args[0], vars(c, [])(d.args[1])]);
  if (file && final === 200) headers.push(['Accept-Ranges', 'bytes']);
  const res: Response = {
    status: final, reason: reasonOf(final, NGINX_VERSION), headers, body: x.req.method === 'HEAD' ? '' : body, close: !keepAlive || !!out.proxied?.upgrade, ...wait ? { wait } : {},
    ...cacheStatus ? { cache: cacheStatus } : {}, ...upstreamMs ? { upstreamMs } : {},
  };
  // Logs: the access log of the final context (combined format), the error log of that context.
  const ua = x.req.headers.find(([k]) => k.toLowerCase() === 'user-agent')?.[1] ?? '-', ref = x.req.headers.find(([k]) => k.toLowerCase() === 'referer')?.[1] ?? '-';
  const line = `${x.client} - - [${timeLocal(host)}] "${x.req.method} ${rawUri} HTTP/1.1" ${final} ${new TextEncoder().encode(res.body).length} "${ref}" "${ua}"`;
  const accessDirs = levelWith(c, 'access_log');
  const accessPaths = accessDirs.length ? accessDirs.filter(d => d.args[0] !== 'off').map(d => d.args[0]) : [DEFAULT_ACCESS];
  for (const p of accessPaths) host = appendLog(host, p, line);
  if (errors.length) {
    const el = levelWith(c, 'error_log')[0] ?? conf.main.find(d => d.name === 'error_log');
    const path = el?.args[0] && el.args[0].startsWith('/') ? el.args[0] : DEFAULT_ERROR, level = el?.args[1] ?? 'error';
    const LEVELS = ['debug', 'info', 'notice', 'warn', 'error'];
    for (const e of errors) {
      if (!LEVELS.includes(level) || LEVELS.indexOf(e.level) < LEVELS.indexOf(level)) continue;
      host = appendLog(host, path, logStamp(host, e.level, wpid, `*${n.connections} ${e.msg}, client: ${x.client}, server: ${srv.names[0] ?? ''}, request: "${x.req.method} ${rawUri} HTTP/1.1", ${e.upstream !== undefined ? `upstream: "${e.upstream}", ` : ''}host: "${hostHeader ?? ''}"`));
    }
  }
  return { res, host };
}
const ipNum = (ip: string) => ip.split('.').reduce((a, p) => a * 256 + Number(p), 0) >>> 0;
/** An upstream's Last-Modified as seconds (expires modified). */
function parseLm(text: string | undefined): number | undefined {
  const m = /^\w{3}, (\d{2}) (\w{3}) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/.exec(text ?? '');
  return m ? Date.UTC(Number(m[3]), MONTHS.indexOf(m[2] as typeof MONTHS[number]), Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6])) / 1000 : undefined;
}
function modeAllows(node: FsNode, view: FsState): boolean {
  const groups = view.groups ?? [view.user];
  if (view.user === 'root') return true;
  if (node.owner === view.user) return (node.mode & 0o400) !== 0;
  if (groups.includes(node.group ?? node.owner)) return (node.mode & 0o040) !== 0;
  return (node.mode & 0o004) !== 0;
}
/** The URI nginx works with: %XX decoded, // merged, . and .. resolved (a .. above / is a 400 in nginx; here it stops at /). */
function normalizeUri(raw: string): string {
  let u: string;
  try { u = decodeURIComponent(raw); } catch { u = raw; }
  const trailing = u.endsWith('/') || u.endsWith('/.') || u.endsWith('/..');
  const parts: string[] = [];
  for (const p of u.split('/')) { if (!p || p === '.') continue; if (p === '..') parts.pop(); else parts.push(p); }
  return `/${parts.join('/')}${trailing && parts.length ? '/' : ''}`;
}

/** The plain HTTP request nginx refuses on a TLS port. */
export function plainOnTls(host: FsState, x: Exchange2): Response {
  const conf = host.nginx?.applied, hostHeader = x.req.headers.find(([k]) => k.toLowerCase() === 'host')?.[1];
  const sel = conf ? selectServer(conf, x.address, x.port, hostHeader) : undefined;
  const server = sel && !flag({ srv: sel.srv, conf: conf! }, 'server_tokens', true) ? 'nginx' : NGINX_VERSION;
  const body = `<html>\n<head><title>400 The plain HTTP request was sent to HTTPS port</title></head>\n<body>\n<center><h1>400 Bad Request</h1></center>\n<center>The plain HTTP request was sent to HTTPS port</center>\n<hr><center>${server}</center>\n</body>\n</html>\n`;
  return { status: 400, reason: 'Bad Request', headers: [['Server', server], ['Date', httpDate(x.now)], ['Content-Type', 'text/html'], ['Content-Length', String(new TextEncoder().encode(body).length)], ['Connection', 'close']], body: x.req.method === 'HEAD' ? '' : body, close: true };
}

/** E14 (lesson checks): the root a server of the applied configuration serves / from (location / or the server's root). */
export function servedRoot(conf: NgConf, name: string, port?: number): { root: string; ssl: boolean } | undefined {
  const srv = conf.servers.find(s => s.names.some(n => n.toLowerCase() === name.toLowerCase()) && (port === undefined || s.listens.some(l => l.port === port)));
  if (!srv) return undefined;
  const found = findLocation(srv.locs, '/');
  const c: Ctx2 = { srv, conf, ...found ? { loc: found.loc } : {} };
  return { root: levelWith(c, 'root')[0]?.args[0] ?? '/usr/share/nginx/html', ssl: srv.listens.some(l => l.ssl) };
}
