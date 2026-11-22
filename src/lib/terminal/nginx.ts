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
 * upstream) is engine stage E15: such a configuration fails the test with a message that says so.
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
type Ctx = 'main' | 'events' | 'http' | 'server' | 'location' | 'types' | 'if';
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
export interface Reader { read(path: string): { text: string } | { error: string }; list(dir: string): string[] | null; isDir(path: string): boolean }
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
      if (ctx === 'types') {
        if (end.special !== ';') throw new ConfError(`unexpected "{" in ${file}:${end.line}`);
        if (d.name !== 'include') { out.push(d); continue; }
      }
      if (E15.includes(d.name)) throw new ConfError(`模擬環境："${d.name}" 是反向代理的設定，在引擎階段 E15 才模擬${at(d)}`);
      if (UNSUPPORTED[d.name]) throw new ConfError(`${UNSUPPORTED[d.name]}${at(d)}`);
      const spec = SPEC[d.name];
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
export interface Loc { mod: '' | '=' | '^~' | '~' | '~*' | '@'; path: string; re?: RegExp; dirs: Dir[]; children: Loc[]; parent?: Loc; file: string; line: number }
export interface Srv { listens: NgListen[]; names: string[]; dirs: Dir[]; locs: Loc[]; file: string; line: number; cert?: { chain: Cert[]; path: string } }
/** What the master runs with: the servers, the http and main directives, the worker user and count, the mime types and the files read. */
export interface NgConf { main: Dir[]; http: Dir[]; servers: Srv[]; user: string; workers: number | 'auto'; mime: ReadonlyMap<string, string>; files: { path: string; text: string }[]; warnings: string[] }
/** E14: the running nginx's configuration and the connection counter of its error log (*N). */
export interface NginxState { applied?: NgConf; connections: number }

const VARS = ['uri', 'request_uri', 'host', 'scheme', 'args', 'query_string', 'is_args', 'server_name', 'server_port', 'remote_addr', 'request_method', 'document_root', 'request_filename', 'http_host', 'server_addr', 'status'];
/** Variables must be known: nginx's own, the named captures of the configuration's regexes (captures), $1..$9. */
function checkVars(values: readonly string[], captureNames: ReadonlySet<string>) {
  for (const v of values) for (const m of v.matchAll(/\$(?:\{(\w+)\}|(\w+))/g)) {
    const name = m[1] ?? m[2];
    if (/^\d$/.test(name) || VARS.includes(name) || captureNames.has(name) || /^(http|arg|cookie|sent_http)_\w+$/.test(name)) continue;
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
const DIRECTIVE_VARS = ['try_files', 'return', 'rewrite', 'add_header', 'root', 'alias', 'index', 'error_page'];
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
  }
}
function walkLocs(locs: Loc[], f: (l: Loc) => void) { for (const l of locs) { f(l); walkLocs(l.children, f); } }

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
  return { main, http, servers, user, workers: wp?.args[0] === 'auto' || !wp ? (wp ? 'auto' : 1) : Number(wp.args[0]), mime, files: parsed.files, warnings };
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
  if (!master) return { ...state, nginx: { ...nginxOf(state), applied: conf } };
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
  for (const p of logPaths(conf)) {
    const real = physicalPath(nodes, p, true);
    if (!nodes.has(real) && nodes.get(parentOf(real))?.kind === 'dir') nodes.set(real, { kind: 'file', mode: 0o644, owner: 'root', content: '' });
  }
  return { ...state, nodes, processes: procs, lastPid: last, nginx: { ...nginxOf(state), applied: conf } };
}
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
export interface Exchange2 { address: string; port: number; https: boolean; client: string; req: Request; now: number }

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
  const errors: string[] = [];
  const logError = (msg: string) => errors.push(msg);
  const vars = (c: Ctx2, captures: string[]) => (text: string) => text.replace(/\$(?:\{(\w+)\}|(\w+))/g, (_m, a: string | undefined, b: string | undefined) => {
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
      default:
        if (name.startsWith('http_')) return x.req.headers.find(([k]) => k.toLowerCase().replace(/-/g, '_') === name.slice(5))?.[1] ?? '';
        if (name.startsWith('arg_')) return new URLSearchParams(args).get(name.slice(4)) ?? '';
        return sel.captures[name] ?? '';
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
  type Out = { status: number; body?: string; type?: string; location?: string; c: Ctx2 };
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
    return { status: 200, body: f.node.content ?? '', type: contentType(c, path), c };
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
        if (flagName === 'last') return { last: to };
        if (flagName === 'break') return { brk: true };
      }
    }
    return null;
  };
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
      if (r && 'brk' in r) return serveStatic(c, uri, captures, redirects);
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
  if (ep && out.status >= 300 && !out.location) {
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
  const type = status === 204 ? undefined : out.body !== undefined ? out.type ?? 'text/html' : 'text/html';
  const headers: [string, string][] = [['Server', serverHeader], ['Date', httpDate(x.now)]];
  if (status === 204) body = '';
  if (type) headers.push(['Content-Type', type]);
  if (status !== 204) headers.push(['Content-Length', String(new TextEncoder().encode(body).length)]);
  if (location && relative) headers.push(['Location', location]);
  headers.push(['Connection', keepAlive ? 'keep-alive' : 'close']);
  if (location && !relative) headers.push(['Location', location]);
  const always = [200, 201, 204, 206, 301, 302, 303, 304, 307, 308].includes(status);
  for (const d of levelWith(c, 'add_header')) if (always || d.args[2] === 'always') headers.push([d.args[0], vars(c, [])(d.args[1])]);
  const res: Response = { status, reason: reasonOf(status, NGINX_VERSION), headers, body: x.req.method === 'HEAD' ? '' : body, close: !keepAlive };
  // Logs: the access log of the final context (combined format), the error log of that context.
  const ua = x.req.headers.find(([k]) => k.toLowerCase() === 'user-agent')?.[1] ?? '-', ref = x.req.headers.find(([k]) => k.toLowerCase() === 'referer')?.[1] ?? '-';
  const line = `${x.client} - - [${timeLocal(host)}] "${x.req.method} ${rawUri} HTTP/1.1" ${status} ${new TextEncoder().encode(res.body).length} "${ref}" "${ua}"`;
  const accessDirs = levelWith(c, 'access_log');
  const accessPaths = accessDirs.length ? accessDirs.filter(d => d.args[0] !== 'off').map(d => d.args[0]) : [DEFAULT_ACCESS];
  for (const p of accessPaths) host = appendLog(host, p, line);
  if (errors.length) {
    const el = levelWith(c, 'error_log')[0] ?? conf.main.find(d => d.name === 'error_log');
    const path = el?.args[0] && el.args[0].startsWith('/') ? el.args[0] : DEFAULT_ERROR, level = el?.args[1] ?? 'error';
    if (['debug', 'info', 'notice', 'warn', 'error'].includes(level)) {
      for (const e of errors) host = appendLog(host, path, logStamp(host, 'error', wpid, `*${n.connections} ${e}, client: ${x.client}, server: ${srv.names[0] ?? ''}, request: "${x.req.method} ${rawUri} HTTP/1.1", host: "${hostHeader ?? ''}"`));
    }
  }
  return { res, host };
}
const ipNum = (ip: string) => ip.split('.').reduce((a, p) => a * 256 + Number(p), 0) >>> 0;
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
