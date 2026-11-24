import { type FsState } from './fs';
import { clockOf, commOf } from './processes';
import { fields, MONTHS, WEEKDAYS } from './clock';
import { openWrite, OPEN_TEXT } from './shell';
import { basicResolver, hostsLookup, indexByName, isIPv4, nameOf, reach, sourceAddress, viewFrom, type NetIo, type NetResult, type Reached, type Socket } from './sockets';
import { asNotModified, bodyEtag, cdnServe, notModified, purgeEdge, type CdnConfig, type OriginResult } from './cache';
import { rttTo } from './diag';
import { parseTime } from './clock';
import { alertFor, builtin, certsIn, cnOf, curlHandshake, dnCurl, asn1Time, keyBits, nameMatches, nowOf, presentedBy, readAs, sha1, sigAlg, TRUST_BUNDLE, trustOf, VERIFY_TEXT, verifyChain, type Cert } from './tls';
import { nginxCertificate, nginxServe, plainOnTls, type UpstreamFn, type UpstreamResult } from './nginx';
import { base64 } from './ssh';
import { resolvePath } from './fs';
import { containerAccess } from './docker';
import { containerReader } from './storage-net';
import { kubeServe, sniPresented } from './kube-route-serve';
import type { KubeRouter } from './kube-route';

/*
 * Engine stage E12 (docs/curriculum/SRV0_SERVER_CAPABILITY.md §8): HTTP/1.1 with curl. A machine's responders are lesson
 * data: routes (an exact path or a prefix ending in *, optionally a Host) with a status, headers and a body, or a redirect.
 * A listening socket names the responder that answers on it (listen.http), so a request needs a name that resolves, a
 * machine that has the address, something listening on the port, and a responder there; each failure is curl's own error.
 * The response headers are built like nginx's (Server, Date from the fixed clock, Content-Type, Content-Length, Connection,
 * Location, then the route's own headers). Connections are kept alive unless the responder says otherwise, and curl
 * reuses one for the next URL of the same host and port. HTTPS needs TLS, which is engine stage E13: until then a request
 * to an https:// URL connects (so 6, 7 and 28 are real) and then stops with a clear error 35.
 */

export interface Route {
  /** An exact path ("/about") or a prefix ending in * ("/static/*"); the query string is not part of it. */
  path: string;
  /** Only for this Host header (a virtual host); default any. */
  host?: string;
  /** Default GET (and HEAD with it). */
  methods?: string[];
  /** Default 200, or 301 with a redirect. */
  status?: number;
  /** Extra response headers, in order. */
  headers?: [string, string][];
  body?: string;
  /** The Location of a redirect. */
  redirect?: string;
  /** Content-Type; default text/html. */
  type?: string;
  /** E13: serves the file root + path from the machine (read as www-data; 404 when it is missing), e.g. ACME's webroot. */
  root?: string;
  /** E15: the body is the request as the application received it (its client address, request line and headers): what a proxy forwards. */
  echo?: true;
  /** E15: a WebSocket endpoint: a valid upgrade request gets 101 Switching Protocols, any other request 426 Upgrade Required. */
  websocket?: true;
  /** E15: seconds before the answer (nginx's proxy_read_timeout turns a slow application into a 504). */
  delay?: number;
  /** E18 (edge): an ETag (true: computed from the body) and a Last-Modified time (UTC); conditional requests then get 304. */
  etag?: true | string;
  lastModified?: string;
  /** E18 (edge): the fictional CDN purge API: POST url=… (or all=1) removes those URLs from the named edges' caches. */
  purge?: { edges: string[]; token?: string };
}
/** E12: an HTTP server's behaviour: its Server header, whether it keeps connections alive (default yes), its routes in order. E15: a delay for every answer. */
export interface Responder {
  id: string; server?: string; keepAlive?: boolean; routes: Route[]; delay?: number; /** E18: a CDN edge in front of an origin (routes unused). */ cdn?: CdnConfig;
  /** E20 (set by the engine, not by lessons): the container whose published port this responder answers on (its access log). */
  container?: string;
  /** E22 (set by the engine): the request reaches the container directly (from another container, or with --network host), so its log shows the real client; via: the address docker-proxy connects from (a user-defined network's gateway). */
  direct?: true;
  via?: string;
  /** E37 (set by the engine): an ingress controller's or a Gateway's router (kube-route.ts); routes unused. */
  kube?: KubeRouter;
}

export const CURL_VERSION = '8.5.0';
const REASONS: Readonly<Record<number, string>> = {
  100: 'Continue', 200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content', 206: 'Partial Content', 301: 'Moved Permanently', 302: 'Found', 303: 'See Other',
  304: 'Not Modified', 307: 'Temporary Redirect', 308: 'Permanent Redirect', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 101: 'Switching Protocols', 426: 'Upgrade Required',
  405: 'Method Not Allowed', 408: 'Request Timeout', 409: 'Conflict', 410: 'Gone', 413: 'Payload Too Large', 418: "I'm a teapot", 429: 'Too Many Requests',
  500: 'Internal Server Error', 501: 'Not Implemented', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout',
};
/** nginx's own reason phrases where they differ. */
const NGINX_REASONS: Readonly<Record<number, string>> = { 302: 'Moved Temporarily', 405: 'Not Allowed', 413: 'Request Entity Too Large', 503: 'Service Temporarily Unavailable', 504: 'Gateway Time-out' };
export const reasonOf = (status: number, server?: string) => (server?.startsWith('nginx') ? NGINX_REASONS[status] : undefined) ?? REASONS[status] ?? '';
export const HTTP_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'] as const;

/** Date: Sun, 22 Nov 2026 10:00:00 GMT (RFC 9110's IMF-fixdate). */
export function httpDate(t: number): string {
  const f = fields(t), two = (n: number) => String(n).padStart(2, '0');
  return `${WEEKDAYS[f.weekday]}, ${two(f.day)} ${MONTHS[f.month]} ${f.year} ${two(f.hour)}:${two(f.minute)}:${two(f.second)} GMT`;
}
const bytes = (text: string) => new TextEncoder().encode(text).length;
/** nginx's error page for a status (the body of 3xx, 4xx and 5xx responses without one of their own). */
export function errorPage(status: number, server?: string): string {
  const title = `${status} ${reasonOf(status, server)}`;
  return `<html>\n<head><title>${title}</title></head>\n<body>\n<center><h1>${title}</h1></center>\n${server ? `<hr><center>${server}</center>\n` : ''}</body>\n</html>\n`;
}

/** version: E15, the HTTP version of the request line (nginx's proxy sends 1.0 unless proxy_http_version 1.1); default 1.1. */
export interface Request { method: string; path: string; headers: [string, string][]; body?: string; version?: '1.0' | '1.1'; /** E37: it came over TLS to a router's port (kubeTls). */ tls?: true }
/** wait: E15, the seconds the answer took (an upstream's delay, nginx's timeouts); curl -m compares it. */
export interface Response {
  status: number; reason: string; headers: [string, string][]; body: string; close: boolean; wait?: number;
  /** E18: the cache's verdict (nginx's $upstream_cache_status, or the CDN edge's X-Cache), for the lesson's cache check; not a header. */
  cache?: string;
  /** E18: milliseconds the server spent on the network behind it (nginx to its upstreams, the edge to its origin), for curl -w. */
  upstreamMs?: number;
}
const header = (h: readonly [string, string][], name: string) => h.find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1];

/**
 * What a responder answers: the first route whose path (and Host) matches, 405 for another method, else 404. E12 fix: a
 * 204 has no Content-Length (and no body). E13: a route with root serves files through `read` (missing: 404).
 */
/** The first route of a responder for the request's path and Host. */
export function routeOf(r: Responder, req: Request): Route | undefined {
  const host = (header(req.headers, 'Host') ?? '').replace(/:\d+$/, '').toLowerCase(), path = req.path.split('?')[0];
  return r.routes.find(x => (!x.host || x.host.toLowerCase() === host) && (x.path.endsWith('*') ? path.startsWith(x.path.slice(0, -1)) : path === x.path));
}
export function respond(r: Responder, req: Request, now: number, read?: (path: string) => string | undefined, client?: string): Response {
  const path = req.path.split('?')[0];
  const route = routeOf(r, req);
  const methods = route?.methods ?? ['GET'];
  const allowed = route && (methods.includes(req.method) || (req.method === 'HEAD' && methods.includes('GET')));
  const wait = route?.delay ?? r.delay;
  // E15: a WebSocket endpoint and an echo of the request.
  if (allowed && route.websocket) return { ...upgrade(r, req, now), ...wait ? { wait } : {} };
  if (allowed && route.echo) {
    const text = [`remote_addr: ${client ?? '127.0.0.1'}`, `${req.method} ${req.path} HTTP/${req.version ?? '1.1'}`, ...req.headers.map(([k, v]) => `${k}: ${v}`)].join('\n') + '\n' + (req.body !== undefined ? `\n${req.body}\n` : '');
    const res = respond({ ...r, delay: undefined, routes: [{ path: req.path.split('?')[0], methods: [req.method], body: text, type: 'text/plain', ...route.headers ? { headers: route.headers } : {} }] }, req, now);
    return { ...res, ...wait ? { wait } : {} };
  }
  const file = allowed && route.root !== undefined ? read?.(`${route.root.replace(/\/$/, '')}${path}`) : undefined;
  const missing = !!allowed && route.root !== undefined && file === undefined;
  const status = !route || missing ? 404 : !allowed ? 405 : route.status ?? (route.redirect ? 301 : 200);
  const body = status === 204 ? '' : file !== undefined ? file : allowed && !missing && route.body !== undefined ? route.body : status >= 300 ? errorPage(status, r.server) : '';
  const close = r.keepAlive === false, ok = allowed && !missing;
  const headers: [string, string][] = [
    ...r.server ? [['Server', r.server] as [string, string]] : [], ['Date', httpDate(now)], ['Content-Type', ok && route.type ? route.type : file !== undefined ? 'text/plain' : 'text/html'],
    ...status === 204 ? [] : [['Content-Length', String(bytes(body))] as [string, string]], ['Connection', close ? 'close' : 'keep-alive'],
    ...ok && route.redirect ? [['Location', route.redirect] as [string, string]] : [], ...ok ? route.headers ?? [] : [],
  ];
  return { status, reason: reasonOf(status, r.server), headers, body: req.method === 'HEAD' ? '' : body, close, ...wait ? { wait } : {} };
}
/** RFC 6455's handshake: Sec-WebSocket-Accept is base64(SHA-1(key + the protocol's GUID)). */
export const websocketAccept = (key: string) => base64(sha1(new TextEncoder().encode(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)));
/** E15: the answer of a WebSocket endpoint: 101 for an HTTP/1.1 request with Upgrade: websocket, Connection: upgrade and a key; else 426. */
function upgrade(r: Responder, req: Request, now: number): Response {
  const key = header(req.headers, 'Sec-WebSocket-Key');
  const ok = (req.version ?? '1.1') === '1.1' && (header(req.headers, 'Upgrade') ?? '').toLowerCase() === 'websocket'
    && (header(req.headers, 'Connection') ?? '').toLowerCase().split(/\s*,\s*/).includes('upgrade') && !!key;
  if (ok) return { status: 101, reason: 'Switching Protocols', headers: [...r.server ? [['Server', r.server] as [string, string]] : [], ['Upgrade', 'websocket'], ['Connection', 'Upgrade'], ['Sec-WebSocket-Accept', websocketAccept(key!)]], body: '', close: true };
  const body = 'Upgrade Required';
  return { status: 426, reason: 'Upgrade Required', headers: [...r.server ? [['Server', r.server] as [string, string]] : [], ['Date', httpDate(now)], ['Content-Type', 'text/plain'], ['Content-Length', String(bytes(body))], ['Connection', r.keepAlive === false ? 'close' : 'keep-alive'], ['Upgrade', 'websocket']], body: req.method === 'HEAD' ? '' : body, close: r.keepAlive === false };
}

/** A URL curl accepts: http or https, a host, an optional port, a path with its query (the fragment is dropped). */
export interface Url { scheme: 'http' | 'https'; host: string; port: number; path: string }
export function parseUrl(text: string): Url | { code: number; message: string } {
  const m = /^(?:([A-Za-z][A-Za-z0-9+.-]*):\/\/)?([^/?#:]*)(?::(\d*))?([^#]*)/.exec(text);
  const scheme = (m?.[1] ?? 'http').toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') return { code: 1, message: `Protocol "${scheme}" not supported` };
  if (!m || !m[2]) return { code: 3, message: 'URL rejected: No host part in the URL' };
  const port = m[3] ? Number(m[3]) : scheme === 'https' ? 443 : 80;
  if (m[3] !== undefined && (!m[3] || port > 65535)) return { code: 3, message: 'URL rejected: Port number was not a decimal number between 0 and 65535' };
  const path = m[4] ? (m[4].startsWith('/') ? m[4] : `/${m[4]}`) : '/';
  return { scheme, host: m[2].toLowerCase(), port, path };
}
export const urlText = (u: Url) => `${u.scheme}://${u.host}${u.port === (u.scheme === 'https' ? 443 : 80) ? '' : `:${u.port}`}${u.path}`;
/** A Location made absolute against the URL that answered. */
function resolveLocation(base: Url, location: string): string {
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(location)) return location;
  if (location.startsWith('//')) return `${base.scheme}:${location}`;
  const origin = `${base.scheme}://${base.host}${base.port === (base.scheme === 'https' ? 443 : 80) ? '' : `:${base.port}`}`;
  if (location.startsWith('/')) return origin + location;
  const dir = base.path.split('?')[0].replace(/[^/]*$/, '');
  return origin + dir + location;
}

const CURL_TRY = "curl: try 'curl --help' or 'curl --manual' for more information";
const VALUE_SHORT = 'oHXdwAmC';
const LONG: Readonly<Record<string, string>> = {
  verbose: 'v', silent: 's', 'show-error': 'S', head: 'I', include: 'i', location: 'L', insecure: 'k', fail: 'f', output: 'o', header: 'H', request: 'X',
  data: 'd', 'data-raw': 'd', 'write-out': 'w', 'user-agent': 'A', 'max-time': 'm', cacert: 'C', 'no-buffer': 'N',
};

interface Opts {
  verbose: boolean; silent: boolean; showError: boolean; head: boolean; include: boolean; follow: boolean; fail: boolean; output?: string; writeOut?: string; method?: string;
  data?: string; agent: string; headers: [string, string][]; resolve: { host: string; port: number; address: string }[]; maxRedirs: number; connectTimeout?: number; urls: string[];
  /** E13: -k (do not verify the server's certificate) and --cacert. */
  insecure: boolean; cacert?: string;
  /** E15: -m, the longest the whole transfer may take (an answer that takes longer is error 28). */
  maxTime?: number;
}
function curlOptions(args: readonly string[], io: NetIo): Opts | { status: number } {
  const o: Opts = { verbose: false, silent: false, showError: false, head: false, include: false, follow: false, fail: false, agent: `curl/${CURL_VERSION}`, headers: [], resolve: [], maxRedirs: 50, urls: [], insecure: false };
  const bad = (msg: string) => { io.err(msg); io.err(CURL_TRY); return { status: 2 }; };
  const take = (flag: string, value: string | undefined): { status: number } | null => {
    if (value === undefined) return bad(`curl: option -${flag}: requires parameter`);
    switch (flag) {
      case 'o': o.output = value; return null;
      case 'w': o.writeOut = value; return null;
      case 'X': o.method = value; return null;
      case 'd': o.data = o.data === undefined ? value : `${o.data}&${value}`; return null;
      case 'A': o.agent = value; return null;
      case 'm': o.connectTimeout = Number(value); o.maxTime = Number(value); return null;
      case 'C': o.cacert = value; return null;
      case 'H': {
        const at = value.indexOf(':');
        if (at <= 0) return null;
        const name = value.slice(0, at).trim(), v = value.slice(at + 1).trim();
        o.headers = [...o.headers.filter(([k]) => k.toLowerCase() !== name.toLowerCase()), [name, v]];
        return null;
      }
    }
    return null;
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const [nameEq, inline] = a.slice(2).split(/=(.*)/s, 2) as [string, string | undefined];
      const name = nameEq;
      if (['http1.1', 'ipv4', 'no-progress-meter', 'compressed', 'no-keepalive'].includes(name)) continue;
      if (name === 'resolve') {
        const v = inline ?? args[++i];
        const m = /^([^:]+):(\d+):(\d+\.\d+\.\d+\.\d+)$/.exec(v ?? '');
        if (!m) return bad(`curl: option --resolve: 模擬環境的 --resolve 寫法是 主機:埠:IPv4 位址（${v ?? ''}）`);
        o.resolve.push({ host: m[1].toLowerCase(), port: Number(m[2]), address: m[3] });
        continue;
      }
      if (name === 'max-redirs') { const v = inline ?? args[++i]; if (!/^-?\d+$/.test(v ?? '')) return bad(`curl: option --max-redirs: expected a proper numerical parameter`); o.maxRedirs = Number(v); continue; }
      if (name === 'connect-timeout') { const v = inline ?? args[++i]; if (!/^\d+(\.\d+)?$/.test(v ?? '')) return bad(`curl: option --connect-timeout: expected a proper numerical parameter`); o.connectTimeout = Number(v); continue; }
      if (name === 'http2' || name === 'http3' || name === 'http2-prior-knowledge') { io.err(`curl: 模擬環境的 curl 只說 HTTP/1.1（--${name} 不支援）`); return { status: 1 }; }
      const f = LONG[name];
      if (!f) return bad(`curl: option --${name}: is unknown`);
      if (VALUE_SHORT.includes(f)) { const r = take(f, inline ?? args[++i]); if (r) return r; continue; }
      if (f === 'v') o.verbose = true; else if (f === 's') o.silent = true; else if (f === 'S') o.showError = true; else if (f === 'I') o.head = true;
      else if (f === 'i') o.include = true; else if (f === 'L') o.follow = true; else if (f === 'f') o.fail = true; else if (f === 'k') o.insecure = true;
      continue;
    }
    if (a.startsWith('-') && a.length > 1) {
      for (let j = 1; j < a.length; j++) {
        const f = a[j];
        if (VALUE_SHORT.includes(f)) { const r = take(f, j + 1 < a.length ? a.slice(j + 1) : args[++i]); if (r) return r; break; }
        if (f === 'v') o.verbose = true; else if (f === 's') o.silent = true; else if (f === 'S') o.showError = true; else if (f === 'I') o.head = true;
        else if (f === 'i') o.include = true; else if (f === 'L') o.follow = true; else if (f === 'f') o.fail = true;
        else if (f === 'k') o.insecure = true;
        else if (f === '4' || f === 'N') continue;
        else return bad(`curl: option -${f}: is unknown`);
      }
      continue;
    }
    o.urls.push(a);
  }
  return o;
}

/** What one exchange produced (for -w and -f). */
interface Exchange {
  url: Url; res?: Response; address?: string; request?: number; method: string; exit: number; error?: string; redirects: number; connects: number; location?: string;
  /** E18: curl's timers for -w (seconds since the transfer started; redirect: the redirects before the last request). */
  times?: { namelookup: number; connect: number; appconnect: number; pretransfer: number; starttransfer: number; total: number; redirect: number };
}

const SSL_HELP = ['More details here: https://curl.se/docs/sslcerts.html', '', 'curl failed to verify the legitimacy of the server and therefore could not',
  'establish a secure connection to it. To learn more about this situation and', 'how to fix it, please visit the web page mentioned above.'];
const WRONG_VERSION = 'OpenSSL/3.0.13: error:0A00010B:SSL routines::wrong version number';

/** E13: what a TLS client finds on a socket: the chain the server presents (for this SNI), or no TLS at all. */
export function tlsServer(reached: Extract<Reached, { result: 'ok' }>, address: string, sni: string): { chain: Cert[]; keyOk: boolean } | { plain: true } | { error: string } {
  const s = reached.socket;
  if (s.tls) return presentedBy(reached.host, s.tls.certificate, s.tls.key);
  if (s.kubeTls) return sniPresented(s.kubeTls, sni);
  if (s.nginx && s.ssl) { const chain = nginxCertificate(reached.host, address, s.local.port, sni); return chain ? { chain, keyOk: true } : { error: 'no certificate' }; }
  return { plain: true };
}
/** The address a request comes from as the server sees it (the client's interface toward it; loopback stays loopback). */
export function clientAddress(state: FsState, at: 'self' | number, dest: string): string {
  if (at === 'self') return dest.startsWith('127.') ? '127.0.0.1' : dest;
  return sourceAddress(state, dest);
}

/**
 * E15: how nginx on the machine `at` (of the network rooted at get()) reaches an upstream: through the network seen from
 * there (firewalls and tunnels included), to a responder or another nginx (whose logs are written back with set()). An
 * upstream on the proxy's own machine is served on the state nginx hands in, and handed back.
 */
export function upstreamOf(get: () => FsState, set: (s: FsState) => void, at: 'self' | number, depth = 0): UpstreamFn {
  return (proxyHost, address, port, scheme, req) => {
    const stripNet = (s: FsState): FsState => { const { net: _n, ...rest } = s; void _n; return rest; };
    // SRV-5 fix: the root machine reached from elsewhere (a CDN edge, another proxy) comes without its network; nginx
    // there proxies on exactly as for a local request, through the network of the root.
    const bare = at === 'self' && !proxyHost.net && !!get().net;
    const origin = placed(get, at, proxyHost);
    const done = (result: UpstreamResult, host = proxyHost) => ({ result, host });
    const r = reach(origin, address, port);
    if (r.result === 'timeout') return done({ kind: 'timeout' });
    if (r.result === 'refused') return done({ kind: 'refused' });
    if (r.channel) return done({ kind: 'closed' });
    const s = r.socket, client = r.at === 'self' ? (address.startsWith('127.') ? '127.0.0.1' : address) : sourceAddress(origin, address);
    if (scheme === 'https') {
      const t = tlsServer(r, address, '');
      if ('plain' in t) return done({ kind: 'plain' });
      if ('error' in t || !t.keyOk) return done({ kind: 'closed' });
    }
    const now = clockOf(r.host).now, ms = rttTo(origin, address) ?? 0;
    let res: Response, served = r.host;
    if (s.nginx && r.host.nginx?.applied) {
      if (depth >= 3) return done({ kind: 'closed' });
      const x = { address, port, https: scheme === 'https', client, req, now };
      if (scheme === 'http' && s.ssl) res = plainOnTls(r.host, x);
      else {
        // The upstream nginx proxies on from its own place in the network.
        const endAt = r.at === 'self' ? at : indexByName(get(), nameOf(r.host)) ?? 'self';
        const out = nginxServe(r.host, { ...x, upstream: upstreamOf(get, set, endAt, depth + 1) });
        res = out.res; served = out.host;
      }
    } else {
      const responder = findResponder(r.host, s);
      if (!responder || (scheme === 'http' && s.tls)) return done({ kind: 'closed' });
      const endAt = r.at === 'self' ? at : indexByName(get(), nameOf(r.host)) ?? 'self';
      const a = serveResponder(get, set, endAt, r.host, responder.r, req, now, client, depth);
      res = a.res; served = a.host;
    }
    const delay = (res.wait ?? 0) + (res.upstreamMs ?? 0) / 1000;
    if (r.at === 'self') return { ...done({ kind: 'response', res, delay }, at === 'self' && !bare ? served : stripNet(served)), ms };
    const idx = indexByName(get(), nameOf(r.host));
    if (idx !== undefined) {
      const root = get();
      set(idx === 'self' ? { ...stripNet(served), ...root.net ? { net: root.net } : {}, ...root.session ? { session: root.session } : {} } : withHost(root, idx, served));
    }
    return { ...done({ kind: 'response', res, delay }), ms };
  };
}

/**
 * A machine of the network rooted at get() as it sees the network from its place: a host of it through viewFrom, the root
 * itself with the root's network (the root reached from another machine arrives without it, its net stripped).
 */
function placed(get: () => FsState, at: 'self' | number, host: FsState): FsState {
  if (at !== 'self') return viewFrom(withHost(get(), at, host), at);
  const net = get().net;
  return host.net || !net ? host : { ...host, net };
}

/**
 * E18: a responder's answer on a host of the network rooted at get() (its place: at). From the edge profile up a CDN
 * edge (cdn) fetches its origin through the network from its own place and keeps what it may; the purge API changes the
 * edges it names; routes may carry validators, and a conditional GET gets 304. Below the edge profile: respond().
 */
export function serveResponder(get: () => FsState, set: (s: FsState) => void, at: 'self' | number, host: FsState, r: Responder, req: Request, now: number, client: string, depth = 0): { res: Response; host: FsState } {
  const out = serveOn(get, set, at, host, r, req, now, client, depth);
  // E20: a container's service writes the request to the container's log (docker logs).
  return r.container ? { ...out, host: containerAccess(out.host, r, req, out.res, now, client) } : out;
}
function serveOn(get: () => FsState, set: (s: FsState) => void, at: 'self' | number, host: FsState, r: Responder, req: Request, now: number, client: string, depth: number): { res: Response; host: FsState } {
  // E37: an ingress controller's or a Gateway's router.
  // The cluster runs on the learner's machine (the network's root): its routers keep that machine's clock, not the
  // stand-in host's (KUB-2: the Date header said the default day).
  if (r.kube) return { res: kubeServe(get, set, r, req, clockOf(get()).now), host };
  if (!host.http?.edge) return { res: respond(r, req, now, readerOf(host, r), client), host };
  if (r.cdn) {
    if (depth >= 3) return { res: respond({ ...r, routes: [] }, req, now), host };
    const cfg = r.cdn;
    const fetch = (originReq: Request): OriginResult => {
      const view = placed(get, at, host);
      const found = isIPv4(cfg.origin) ? cfg.origin : (() => { const x = basicResolver(view, cfg.origin, 4); return 'found' in x ? x.found.address : undefined; })();
      if (!found) return { kind: 'failed', status: 502, ms: 0 };
      const fwd: Request = { ...originReq, headers: [...originReq.headers.filter(([k]) => k.toLowerCase() !== 'x-forwarded-for'), ['X-Forwarded-For', [header(req.headers, 'X-Forwarded-For'), client].filter(Boolean).join(', ')]] };
      const u = upstreamOf(get, set, at, depth + 1)(host, found, cfg.port ?? (cfg.scheme === 'https' ? 443 : 80), cfg.scheme ?? 'http', fwd);
      host = u.host;
      const ms = u.ms ?? 0;
      // SRV-5 fix: the origin's time (its waits and its own upstreams) counted once, as the edge's wait; ms is the network.
      if (u.result.kind === 'response') return { kind: 'response', res: u.result.res, ms, ...u.result.delay ? { wait: u.result.delay } : {} };
      return { kind: 'failed', status: u.result.kind === 'timeout' ? 504 : 502, ms: ms + (u.result.kind === 'timeout' ? 60000 : 0) };
    };
    const out = cdnServe(host, r.id, cfg, req, fetch);
    return { res: { ...out.res, ...out.ms ? { upstreamMs: out.ms } : {}, ...out.wait ? { wait: out.wait } : {} }, host: out.host };
  }
  const route = routeOf(r, req);
  if (route?.purge && (route.methods ?? ['POST']).includes(req.method)) return purgeApi(get, set, at, host, r, route, req, now);
  let res = respond(r, req, now, readerOf(host, r), client);
  if (route && res.status === 200 && (route.etag || route.lastModified)) {
    const lm = route.lastModified !== undefined ? parseTime(route.lastModified) : undefined;
    const etag = route.etag === true ? bodyEtag(res.body) : route.etag;
    res = { ...res, headers: [...res.headers.filter(([k]) => !['etag', 'last-modified'].includes(k.toLowerCase())), ...lm !== undefined ? [['Last-Modified', httpDate(lm)] as [string, string]] : [], ...etag ? [['ETag', etag] as [string, string]] : []] };
  }
  if (notModified(req, res)) res = asNotModified(res);
  return { res, host };
}
/** E18: POST url=…|all=1 (form or JSON) with Authorization: Bearer token: the named edges forget those URLs. */
function purgeApi(get: () => FsState, set: (s: FsState) => void, at: 'self' | number, host: FsState, r: Responder, route: Route, req: Request, now: number): { res: Response; host: FsState } {
  const json = (status: number, value: unknown): { res: Response; host: FsState } => {
    const body = `${JSON.stringify(value)}\n`;
    return { res: { status, reason: reasonOf(status, r.server), headers: [...r.server ? [['Server', r.server] as [string, string]] : [], ['Date', httpDate(now)], ['Content-Type', 'application/json'], ['Content-Length', String(bytes(body))], ['Connection', 'keep-alive']], body: req.method === 'HEAD' ? '' : body, close: false }, host };
  };
  const p = route.purge!;
  if (p.token !== undefined && header(req.headers, 'Authorization') !== `Bearer ${p.token}`) return json(401, { error: 'unauthorized' });
  const text = req.body ?? '';
  let url: string | undefined, all = false;
  try {
    if (text.trim().startsWith('{')) { const o = JSON.parse(text) as { url?: unknown; all?: unknown }; url = typeof o.url === 'string' ? o.url : undefined; all = o.all === true; }
    else { const q = new URLSearchParams(text); url = q.get('url') ?? undefined; all = q.get('all') === '1' || q.get('all') === 'true'; }
  } catch { return json(400, { error: 'invalid JSON' }); }
  if (!url && !all) return json(400, { error: 'missing url' });
  let purged = 0;
  for (const name of p.edges) {
    const root = get(), idx = indexByName(root, name);
    if (idx === undefined) continue;
    const edgeState = idx === at ? host : idx === 'self' ? root : root.net!.hosts[idx].state;
    const out = purgeEdge(edgeState, all ? 'all' : url!);
    purged += out.purged;
    if (idx === at) host = out.host;
    else set(idx === 'self' ? { ...out.host, ...root.net ? { net: root.net } : {} } : withHost(root, idx, out.host));
  }
  return json(200, { status: 'ok', purged });
}
/** A host's state written back after a request (nginx's logs): the machine itself or a host of its network. */
export function withHost(state: FsState, at: 'self' | number, host: FsState): FsState {
  if (at === 'self') return host;
  if (!state.net) return state;
  return { ...state, net: { ...state.net, hosts: state.net.hosts.map((h, i) => i === at ? { ...h, state: host } : h) } };
}
/** The files a responder's root route reads (as www-data, or root on a machine without it). */
export const fileReader = (host: FsState) => (path: string) => { const r = readAs(host, 'www-data', path); return 'text' in r ? r.text : undefined; };
/** E22: a container's service (storage-net profile) reads its root from the container's own files, mounts included. */
const readerOf = (host: FsState, r: Responder) => r.container && host.docker?.storageNet ? containerReader(host, r.container) : fileReader(host);

/**
 * curl [-v] [-s] [-S] [-I] [-i] [-L] [-f] [-k] [-o file] [-w format] [-H header] [-X method] [-d data] [-A agent] [--cacert f]
 * [--resolve h:p:a] [--max-redirs n] [--connect-timeout s] URL…: curl 8.5.0's messages and exit codes. The progress meter
 * (real speeds and times) is never printed, as with --no-progress-meter. E13 (the tls profile and above): https:// completes
 * the TLS handshake against the machine's trust store (error 60 when the certificate does not verify or does not name the
 * host; -k goes on anyway); nginx (E14) answers from its applied configuration and writes its logs.
 */
export function curl(state0: FsState, args: readonly string[], io: NetIo): NetResult {
  const parsed = curlOptions(args, io);
  if ('status' in parsed) return { state: state0, status: parsed.status };
  const o = parsed;
  if (!o.urls.length) { io.err('curl: no URL specified!'); io.err(CURL_TRY); return { state: state0, status: 2 }; }
  if (o.method === 'HEAD' && !o.head) io.err('Warning: Setting custom HTTP method to HEAD with -X/--request may not work the way you want. Consider using -I/--head instead.');
  if (o.method === 'POST' && o.data !== undefined && !o.silent) io.err('Note: Unnecessary use of -X or --request, POST is already inferred.');
  let state = state0, nextId = 0, last = 0;
  const pool = new Map<string, { id: number; address: string; tls: boolean; tickets: boolean }>();
  // E18: curl -w's timers come from the lesson's latencies (diag.ts) and the server's time; below the edge profile there are none.
  let timing: { lookup: number; rtt: number; tls: boolean; fresh: boolean } | undefined;
  const say = (line: string) => { if (o.verbose) io.err(line); };
  const error = (code: number, message: string, more: readonly string[] = []) => { if (!o.silent || o.showError) { io.err(`curl: (${code}) ${message}`); more.forEach(l => io.err(l)); } return code; };
  let sink: string | undefined, sinkPath: string | null | undefined;
  if (o.output !== undefined) {
    const nodes = new Map(state.nodes), opened = openWrite(nodes, state, o.output, false);
    if ('error' in opened) { io.err(`Warning: Failed to open the file ${o.output}: ${OPEN_TEXT[opened.error]}`); return { state, status: error(23, 'Failure writing output to destination') }; }
    state = { ...state, nodes };
    sinkPath = opened.path;
    sink = '';
  }
  // E12 fix: -o names the output of the first URL only; the later ones go to standard output, as in curl.
  let urlIndex = 0;
  const emit = (data: string) => { if (sink !== undefined && urlIndex === 0) sink += data; else io.out(data); };
  // E13: the trust store (and --cacert) of this machine.
  let trusted: Cert[] | undefined;
  const trust = (): Cert[] | { error: string } => {
    if (trusted) return trusted;
    const base = trustOf(state);
    if (o.cacert !== undefined) {
      const r = readAs(state, io.user, resolvePath(state, o.cacert));
      if ('error' in r) return { error: o.cacert };
      return trusted = [...certsIn(r.text), ...base];
    }
    return trusted = base;
  };
  for (const [index, text] of o.urls.entries()) {
    urlIndex = index;
    let target = text, method = o.method ?? (o.head ? 'HEAD' : o.data !== undefined ? 'POST' : 'GET');
    const ex: Exchange = { url: undefined as unknown as Url, method, exit: 0, redirects: 0, connects: 0 };
    for (;;) {
      const u = parseUrl(target);
      if ('code' in u) { ex.exit = error(u.code, u.message); break; }
      ex.url = u;
      ex.method = method;
      const key = `${u.scheme}://${u.host}:${u.port}`;
      let conn = pool.get(key);
      let address: string;
      if (conn) { address = conn.address; say(`* Re-using existing connection with host ${u.host}`); timing = { lookup: 0.00001, rtt: rttTo(state, address) ?? 0, tls: false, fresh: false }; }
      else {
        const forced = o.resolve.find(r => r.host === u.host && r.port === u.port);
        let lookup = 0.000012;
        if (forced) { address = forced.address; say(`* Added ${u.host}:${u.port}:${forced.address} to DNS cache`); say(`* Hostname ${u.host} was found in DNS cache`); }
        else {
          const viaHosts = !isIPv4(u.host) && !!hostsLookup(state, u.host, 4);
          const r = io.resolve(state, u.host, 4);
          state = r.state;
          if ('error' in r) { ex.exit = error(6, `Could not resolve host: ${u.host}`); break; }
          address = r.found.address;
          // An address, /etc/hosts, the resolver's cache, or a query the resolver had to send (dig's 24 msec).
          lookup = isIPv4(u.host) ? 0.000012 : viaHosts ? 0.00018 : r.cached ? 0.00045 : 0.0243;
        }
        timing = { lookup, rtt: rttTo(state, address) ?? 0, tls: u.scheme === 'https', fresh: true };
        say(`*   Trying ${address}:${u.port}...`);
        // E35: a new connection (kube-proxy picks a Service's endpoint for it).
        if (io.connect) state = io.connect(state, address, u.port);
        const reached = reach(state, address, u.port);
        if (reached.result !== 'ok') {
          if (reached.result === 'timeout' && o.connectTimeout !== undefined) ex.exit = error(28, `Failed to connect to ${u.host} port ${u.port} after ${Math.round(o.connectTimeout * 1000)} ms: Timeout was reached`);
          else ex.exit = error(7, `Failed to connect to ${u.host} port ${u.port} after ${reached.result === 'timeout' ? 127000 : 0} ms: Couldn't connect to server`);
          break;
        }
        conn = { id: nextId++, address, tls: u.scheme === 'https', tickets: false };
        ex.connects++;
        say(`* Connected to ${u.host} (${address}) port ${u.port}`);
        // E17: an SSH tunnel accepted the connection but its other end could not open it (the ssh in the background says so).
        if (reached.channel) io.err(`channel 2: open failed: ${reached.channel}`);
        if (u.scheme === 'https') {
          if (!io.tls) { ex.exit = error(35, '模擬環境：HTTPS 的 TLS 交握在引擎階段 E13 才模擬；請先用 http:// 觀察 HTTP'); say(`* Closing connection`); break; }
          const caFile = o.cacert ?? TRUST_BUNDLE, hs = curlHandshake(caFile);
          say(hs.before[0]); say(hs.before[1]);
          const t = trust();
          if ('error' in t) { say(`* error setting certificate file: ${t.error}`); say('* Closing connection'); ex.exit = error(77, `error setting certificate file: ${t.error}`); break; }
          say(hs.before[2]); say(hs.before[3]);
          const server = tlsServer(reached, address, /^\d+\.\d+\.\d+\.\d+$/.test(u.host) ? '' : u.host);
          if ('plain' in server) { say(`* ${WRONG_VERSION}`); say('* Closing connection'); ex.exit = error(35, WRONG_VERSION); break; }
          if ('error' in server || !server.keyOk) { const m = 'OpenSSL/3.0.13: error:0A000410:SSL routines::sslv3 alert handshake failure'; say(hs.before[4]); say(`* ${m}`); say('* Closing connection'); ex.exit = error(35, m); break; }
          hs.before.slice(4).forEach(say);
          const v = verifyChain(server.chain, t, nowOf(state)), leaf = server.chain[0];
          if (v.first && !o.insecure) {
            const why = `SSL certificate problem: ${VERIFY_TEXT[v.first]}`;
            say(`* TLSv1.3 (OUT), TLS alert, ${alertFor(v.first)}`); say(`* ${why}`); say('* Closing connection');
            ex.exit = error(60, why, SSL_HELP); break;
          }
          hs.after(server.chain).forEach(say);
          say('* Server certificate:');
          say(`*  subject: ${dnCurl(leaf.subject)}`);
          say(`*  start date: ${asn1Time(leaf.notBefore)}`);
          say(`*  expire date: ${asn1Time(leaf.notAfter)}`);
          if (!o.insecure) {
            const host = u.host, matched = nameMatches(leaf, host), cn = cnOf(leaf.subject) ?? '';
            if (!matched) {
              const why = leaf.sans.length ? `SSL: no alternative certificate subject name matches target host name '${host}'` : `SSL: certificate subject name '${cn}' does not match target host name '${host}'`;
              say(leaf.sans.length ? `*  subjectAltName does not match ${host}` : `*  common name: ${cn} (does not match '${host}')`);
              say(`* ${why}`); say('* Closing connection');
              ex.exit = error(60, why, SSL_HELP); break;
            }
            say(leaf.sans.length ? `*  subjectAltName: host "${host}" matched cert's "${matched}"` : `*  common name: ${cn} (matched)`);
          }
          say(`*  issuer: ${dnCurl(leaf.issuer)}`);
          say(v.first ? `*  SSL certificate verify result: ${VERIFY_TEXT[v.first]} (${v.first}), continuing anyway.` : '*  SSL certificate verify ok.');
          server.chain.forEach((c, i) => {
            // Fix (E15 batch): an issuer neither sent nor trusted is still known by its name (Let's Encrypt's R11 signs with RSA).
            const issuerKey = server.chain[i + 1]?.key ?? t.find(x => dnCurl(x.subject) === dnCurl(c.issuer))?.key ?? Object.values(builtin()).find(x => dnCurl(x.subject) === dnCurl(c.issuer))?.key ?? c.key, [kind, bits, sec] = keyBits[c.key];
            say(`*   Certificate level ${i}: Public key type ${kind} (${bits}/${sec} Bits/secBits), signed using ${sigAlg(issuerKey)}`);
          });
        }
        pool.set(key, conn);
      }
      ex.address = address;
      const reached = reach(state, address, u.port);
      const socket = reached.result === 'ok' ? reached.socket : undefined;
      const responder = socket && reached.result === 'ok' ? findResponder(reached.host, socket) : undefined;
      const nginx = socket?.nginx && reached.result === 'ok' && reached.host.nginx?.applied;
      if (!responder && !nginx) {
        pool.delete(key);
        if (socket && !socket.forward && socket.holders.some(h => commOf(h.proc.command) === 'sshd')) { say('* Closing connection'); ex.exit = error(1, 'Received HTTP/0.9 when not allowed'); }
        else { say('* Empty reply from server'); say('* Closing connection'); ex.exit = error(52, 'Empty reply from server'); }
        break;
      }
      // E12 fix: -H 'User-Agent: …' and -H 'Accept: …' replace curl's own header (and an empty value removes it); custom headers follow curl's.
      const custom = (name: string) => o.headers.find(([k]) => k.toLowerCase() === name.toLowerCase());
      const posting = o.data !== undefined && method !== 'GET' && method !== 'HEAD';
      const reqHeaders: [string, string][] = [['Host', custom('Host')?.[1] ?? (u.port === (u.scheme === 'https' ? 443 : 80) ? u.host : `${u.host}:${u.port}`)],
        ...custom('User-Agent') ? [] : [['User-Agent', o.agent] as [string, string]], ...custom('Accept') ? [] : [['Accept', '*/*'] as [string, string]],
        ...o.headers.filter(([k, v]) => k.toLowerCase() !== 'host' && v !== ''),
        ...posting && !custom('Content-Length') ? [['Content-Length', String(bytes(o.data!))] as [string, string]] : [],
        ...posting && !custom('Content-Type') ? [['Content-Type', 'application/x-www-form-urlencoded'] as [string, string]] : []];
      const requestLines = [`${method} ${u.path} HTTP/1.1`, ...reqHeaders.map(([k, v]) => `${k}: ${v}`)];
      ex.request = requestLines.reduce((n, l) => n + bytes(l) + 2, 2) + (posting ? bytes(o.data!) : 0);
      requestLines.forEach(l => say(`> ${l}`));
      say('>');
      if (conn.tls && !conn.tickets) { say('* TLSv1.3 (IN), TLS handshake, Newsession Ticket (4):'); say('* TLSv1.3 (IN), TLS handshake, Newsession Ticket (4):'); conn.tickets = true; }
      const ok = reached as Extract<Reached, { result: 'ok' }>;
      const req: Request = { method, path: u.path, headers: reqHeaders, ...o.data !== undefined ? { body: o.data } : {}, ...u.scheme === 'https' && socket?.kubeTls ? { tls: true as const } : {} }, now = clockOf(ok.host).now;
      let res: Response;
      if (nginx) {
        const x = { address, port: u.port, https: u.scheme === 'https', client: clientAddress(state, ok.at, address), req, now };
        if (u.scheme === 'http' && socket?.ssl) res = plainOnTls(ok.host, x);
        else {
          // E15: nginx reaches its upstreams through this machine's network (their logs are written back as it goes).
          const served = nginxServe(ok.host, { ...x, upstream: upstreamOf(() => state, next => { state = next; }, ok.at) });
          res = served.res;
          state = ok.at === 'self' ? { ...served.host, ...state.net ? { net: state.net } : {} } : withHost(state, ok.at, served.host);
        }
      } else if (u.scheme === 'http' && socket?.tls) {
        pool.delete(key); say('* Empty reply from server'); say('* Closing connection'); ex.exit = error(52, 'Empty reply from server'); break;
      } else {
        // E18: a CDN edge, the purge API, validators (serveResponder); below the edge profile respond() as before.
        const a = serveResponder(() => state, next => { state = next; }, ok.at, ok.host, responder!.r, req, now, clientAddress(state, ok.at, address));
        res = a.res;
        if (a.host !== ok.host) state = ok.at === 'self' ? { ...a.host, ...state.net ? { net: state.net } : {}, ...state.session ? { session: state.session } : {} } : withHost(state, ok.at, a.host);
      }
      // E15: an answer slower than -m is curl's error 28 (nothing of it is written).
      if (o.maxTime !== undefined && (res.wait ?? 0) > o.maxTime) { pool.delete(key); ex.exit = error(28, `Operation timed out after ${Math.round(o.maxTime * 1000)} milliseconds with 0 bytes received`); break; }
      ex.res = res;
      if (io.edge && timing) {
        const prior = ex.times ? ex.times.total : 0, s0 = timing.lookup, connect = s0 + (timing.fresh ? timing.rtt / 1000 : 0);
        const app = timing.tls && timing.fresh ? connect + timing.rtt / 1000 + 0.0021 : 0, pre = (app || connect) + 0.00005;
        const start = pre + timing.rtt / 1000 + (res.wait ?? 0) + (res.upstreamMs ?? 0) / 1000, total = start + 0.00008 + bytes(res.body) / 1.25e8;
        const at = (t: number) => t ? prior + t : 0;
        ex.times = { namelookup: prior + s0, connect: prior + connect, appconnect: at(app), pretransfer: prior + pre, starttransfer: prior + start, total: prior + total, redirect: prior };
      }
      const statusLine = `HTTP/1.1 ${res.status} ${res.reason}`.trimEnd();
      [statusLine, ...res.headers.map(([k, v]) => `${k}: ${v}`)].forEach(l => say(`< ${l}`));
      say('<');
      const headText = `${[statusLine, ...res.headers.map(([k, v]) => `${k}: ${v}`)].join('\n')}\n\n`;
      const location = header(res.headers, 'Location');
      const redirect = res.status >= 300 && res.status < 400 && location !== undefined;
      ex.location = redirect ? resolveLocation(u, location) : undefined;
      const failing = o.fail && res.status >= 400;
      // -L: the body of a redirect curl follows is never written (its headers are, with -i or -I).
      if (!failing) {
        if (o.head || o.include) emit(headText);
        if (!o.head && !(o.follow && redirect)) emit(res.body);
      }
      if (res.close) { pool.delete(key); say('* Closing connection'); }
      else say(`* Connection #${conn.id} to host ${u.host} left intact`);
      if (failing) { ex.exit = error(22, `The requested URL returned error: ${res.status}`); break; }
      if (o.follow && redirect) {
        if (ex.redirects >= o.maxRedirs) { ex.exit = error(47, `Maximum (${o.maxRedirs}) redirects followed`); break; }
        ex.redirects++;
        target = ex.location!;
        say(`* Issue another request to this URL: '${target}'`);
        if (!o.method && (res.status === 303 || ((res.status === 301 || res.status === 302) && method === 'POST'))) {
          if (method === 'POST') say(`* Switch to GET`);
          method = method === 'HEAD' ? 'HEAD' : 'GET';
        }
        continue;
      }
      break;
    }
    // -w goes to standard output, never into the -o file.
    if (o.writeOut !== undefined) io.out(writeOut(o.writeOut, ex, io));
    last = ex.exit;
  }
  if (sink !== undefined && sinkPath) {
    const node = state.nodes.get(sinkPath);
    if (node?.kind === 'file') { const nodes = new Map(state.nodes); nodes.set(sinkPath, { ...node, content: sink }); state = { ...state, nodes }; }
  }
  return { state, status: last };
}

export function findResponder(host: FsState, socket: Socket): { r: Responder } | undefined {
  const r = socket.http ? host.http?.responders.find(x => x.id === socket.http) : undefined;
  return r ? { r } : undefined;
}

/** -w: the variables of curl 8.5 that do not depend on real time, %header{name}, \n \t \r and %%. */
function writeOut(format: string, ex: Exchange, io: NetIo): string {
  const res = ex.res;
  const value = (name: string): string | undefined => {
    switch (name) {
      case 'http_code': case 'response_code': return String(res?.status ?? 0).padStart(3, '0');
      case 'url_effective': return ex.url ? urlText(ex.url) : '';
      case 'redirect_url': return ex.location ?? '';
      case 'num_redirects': return String(ex.redirects);
      case 'num_connects': return String(ex.connects);
      case 'content_type': return res ? header(res.headers, 'Content-Type') ?? '' : '';
      case 'size_download': return String(res ? bytes(res.body) : 0);
      case 'size_header': return String(res ? [`HTTP/1.1 ${res.status} ${res.reason}`, ...res.headers.map(([k, v]) => `${k}: ${v}`)].reduce((n, l) => n + bytes(l) + 2, 2) : 0);
      case 'size_request': return String(ex.request ?? 0);
      case 'remote_ip': return ex.address ?? '';
      case 'remote_port': return ex.url && ex.address ? String(ex.url.port) : '';
      case 'method': return ex.method;
      case 'http_version': return res ? '1.1' : '0';
      case 'exitcode': return String(ex.exit);
      case 'errormsg': return '';
    }
    // E18: the timers (seconds, six decimals) and the average download speed (bytes per second).
    const t = ex.times;
    if (io.edge && t && name.startsWith('time_')) {
      const v = { time_namelookup: t.namelookup, time_connect: t.connect, time_appconnect: t.appconnect, time_pretransfer: t.pretransfer, time_starttransfer: t.starttransfer, time_total: t.total, time_redirect: t.redirect }[name];
      return v === undefined ? undefined : v.toFixed(6);
    }
    if (io.edge && name.startsWith('time_')) return ['time_namelookup', 'time_connect', 'time_appconnect', 'time_pretransfer', 'time_starttransfer', 'time_total', 'time_redirect'].includes(name) ? '0.000000' : undefined;
    if (io.edge && name === 'speed_download') return String(t && t.total ? Math.round((res ? bytes(res.body) : 0) / t.total) : 0);
    if (io.edge && name === 'speed_upload') return '0';
    return undefined;
  };
  let out = '';
  for (let i = 0; i < format.length; i++) {
    const ch = format[i];
    if (ch === '\\' && i + 1 < format.length) {
      const n = format[i + 1];
      if (n === 'n') { out += '\n'; i++; continue; }
      if (n === 't') { out += '\t'; i++; continue; }
      if (n === 'r') { out += '\r'; i++; continue; }
      if (n === '\\') { out += '\\'; i++; continue; }
      out += ch; continue;
    }
    if (ch === '%' && format[i + 1] === '%') { out += '%'; i++; continue; }
    if (ch === '%' && format.startsWith('header{', i + 1)) {
      const end = format.indexOf('}', i);
      if (end > 0) { out += res ? header(res.headers, format.slice(i + 8, end)) ?? '' : ''; i = end; continue; }
    }
    if (ch === '%' && format[i + 1] === '{') {
      const end = format.indexOf('}', i);
      if (end > 0) {
        const name = format.slice(i + 2, end);
        const v = value(name);
        if (v !== undefined) out += v;
        else if (!io.edge && (name.startsWith('time_') || name.startsWith('speed_'))) io.err(`curl: 模擬環境不提供時間與速度的 --write-out 變數（%{${name}}）：真實的值每次都不同`);
        else io.err(`curl: unknown --write-out variable: '${name}'`);
        i = end;
        continue;
      }
    }
    out += ch;
  }
  return out;
}

/**
 * E12 (lesson checks): a GET of the URL from this machine, without following redirects (no state changes). E13 (tls):
 * https:// verifies the server's certificate for the host against this machine's trust store, as curl does; E14: nginx
 * answers from its applied configuration (its logs are not kept).
 */
export function probe(state: FsState, url: string, resolve: NetIo['resolve'], tls = false, extra: [string, string][] = []): { status: number; headers: [string, string][]; body: string; cache?: string } | { error: string } {
  const u = parseUrl(url);
  if ('code' in u) return { error: u.message };
  const r = resolve(state, u.host, 4);
  if ('error' in r) return { error: `無法解析 ${u.host}` };
  const reached = reach(r.state, r.found.address, u.port);
  if (reached.result !== 'ok') return { error: reached.result === 'refused' ? `${u.host} 的 ${u.port} 埠沒有程式在監聽` : `連不到 ${r.found.address}` };
  if (u.scheme === 'https') {
    if (!tls) return { error: 'HTTPS 在引擎階段 E13 才模擬' };
    const server = tlsServer(reached, r.found.address, /^\d+\.\d+\.\d+\.\d+$/.test(u.host) ? '' : u.host);
    if ('plain' in server) return { error: `${u.host}:${u.port} 沒有提供 TLS（wrong version number）` };
    if ('error' in server || !server.keyOk) return { error: `${u.host}:${u.port} 的 TLS 交握失敗` };
    const v = verifyChain(server.chain, trustOf(r.state), nowOf(r.state));
    if (v.first) return { error: `憑證驗證失敗：${VERIFY_TEXT[v.first]}` };
    if (!nameMatches(server.chain[0], u.host)) return { error: `憑證沒有 ${u.host} 這個名稱` };
  }
  // E37: a Host among the extra headers replaces the URL's (an ingress check by IP address).
  const own = extra.some(([k]) => k.toLowerCase() === 'host');
  const req: Request = { method: 'GET', path: u.path, headers: [...own ? [] : [['Host', u.port === (u.scheme === 'https' ? 443 : 80) ? u.host : `${u.host}:${u.port}`] as [string, string]], ['User-Agent', `curl/${CURL_VERSION}`], ['Accept', '*/*'], ...extra],
    ...u.scheme === 'https' && reached.socket.kubeTls ? { tls: true as const } : {} };
  const now = clockOf(reached.host).now;
  if (reached.socket.nginx && reached.host.nginx?.applied) {
    const x = { address: r.found.address, port: u.port, https: u.scheme === 'https', client: clientAddress(r.state, reached.at, r.found.address), req, now };
    let root = r.state;
    const res = u.scheme === 'http' && reached.socket.ssl ? plainOnTls(reached.host, x) : nginxServe(reached.host, { ...x, upstream: upstreamOf(() => root, next => { root = next; }, reached.at) }).res;
    return { status: res.status, headers: res.headers, body: res.body, ...res.cache ? { cache: res.cache } : {} };
  }
  const responder = findResponder(reached.host, reached.socket);
  if (!responder) return { error: `${u.host}:${u.port} 上的程式不是 HTTP 伺服器` };
  if (u.scheme === 'http' && reached.socket.tls) return { error: `${u.host}:${u.port} 只接受 HTTPS` };
  let root = r.state;
  const res = serveResponder(() => root, next => { root = next; }, reached.at, reached.host, responder.r, req, now, clientAddress(r.state, reached.at, r.found.address)).res;
  return { status: res.status, headers: res.headers, body: res.body, ...res.cache ? { cache: res.cache } : {} };
}
export { header as responseHeader };
