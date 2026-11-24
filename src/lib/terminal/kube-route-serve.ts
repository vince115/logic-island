import type { FsState } from './fs';
import { errorPage, httpDate, reasonOf, respond, type Request, type Responder, type Response } from './http';
import { pickPeer, type UpServer } from './proxy';
import type { KubeTls } from './sockets';
import { certsIn, keyIn, keyMatches, type Presented } from './tls';
import type { KubeRouter, NginxServer, RouteEntry, RouteTarget } from './kube-route';

/*
 * Engine stage E37 (docs/curriculum/KUB0_E37_INGRESS.md §4, §7): a request at ingress-nginx or at a Gateway. ingress-nginx
 * picks the server by Host (exact, then a *.wildcard of one label, then the default server), redirects HTTP to HTTPS with
 * 308 when the server has TLS (ssl-redirect), picks the path — Exact or Prefix (by path elements; ImplementationSpecific
 * is Prefix), the longest wins, Exact before Prefix of the same length — else the fallback, else its default backend's 404,
 * and proxies to the Service's ready endpoints in turn (503 when there are none; the next endpoint is tried when one does
 * not answer, at most three, then 502). A Gateway picks the listener by Host, then the route (the most specific hostname,
 * Exact, the longest prefix, the oldest route), splits by weight with nginx's smooth weighted round robin (E15, a turn
 * replayed from the start of its cycle) and answers 404 / 500 / 503 itself. Turns live in the view's kubeNet.turns.
 */

const hostOf = (req: Request) => (req.headers.find(([k]) => k.toLowerCase() === 'host')?.[1] ?? '').replace(/:\d+$/, '').toLowerCase();
const wildcard = (pattern: string, host: string, oneLabel: boolean) => pattern.startsWith('*.') && host.endsWith(pattern.slice(1)) && host.length > pattern.length - 1 && (!oneLabel || !host.slice(0, host.length - pattern.length + 1).includes('.'));
/** Whether a path matches: Exact, or Prefix by path elements (/foo matches /foo, /foo/ and /foo/bar, not /foobar). */
export function pathMatches(e: Pick<RouteEntry, 'path' | 'exact'>, path: string): boolean {
  if (e.exact) return path === e.path;
  const p = e.path.replace(/\/+$/, '');
  return p === '' || path === p || path.startsWith(`${p}/`);
}
const better = (a: RouteEntry, b: RouteEntry) => b.path.replace(/\/+$/, '').length - a.path.replace(/\/+$/, '').length || Number(b.exact) - Number(a.exact) || a.rank - b.rank;
/** ingress-nginx's server for a host (exact, a one-label wildcard, else the default server). */
export function nginxServer(servers: readonly NginxServer[], host: string): NginxServer | undefined {
  return servers.find(s => s.host === host && s.host) ?? servers.filter(s => wildcard(s.host, host, true)).sort((a, b) => b.host.length - a.host.length)[0] ?? servers.find(s => s.host === '');
}
/** The entry (and target) a request reaches at ingress-nginx: its path's, the server's fallback, or none (the 404). */
export function nginxRoute(r: KubeRouter, host: string, path: string): { srv?: NginxServer; entry?: RouteEntry; target?: RouteTarget } {
  const srv = nginxServer(r.servers ?? [], host), entry = srv?.paths.filter(e => pathMatches(e, path)).sort(better)[0];
  return { srv, entry, target: entry?.targets[0] ?? srv?.fallback };
}
const hostScore = (e: RouteEntry, host: string) => !e.hosts.length ? 0 : e.hosts.includes(host) ? 1000 + host.length : Math.max(-1, ...e.hosts.filter(h => wildcard(h, host, false)).map(h => h.length));
/** The route entry a request reaches at a Gateway's port (the listener by hostname, then the route). */
export function gatewayRoute(r: KubeRouter, host: string, path: string): RouteEntry | undefined {
  const ls = (r.listeners ?? []).filter(l => !l.hostname || l.hostname === host || wildcard(l.hostname, host, false)).sort((a, b) => (b.hostname === host ? 1 : 0) - (a.hostname === host ? 1 : 0) || (b.hostname?.length ?? 0) - (a.hostname?.length ?? 0));
  for (const l of ls.slice(0, 1)) {
    const c = l.entries.filter(e => hostScore(e, host) >= 0 && pathMatches(e, path)).sort((a, b) => hostScore(b, host) - hostScore(a, host) || better(a, b));
    return c[0];
  }
  return undefined;
}
/** The weighted pick of turn n: nginx's smooth weighted round robin replayed from the start of its cycle (weights over their GCD). */
export function weightedPick(weights: readonly number[], n: number): number | undefined {
  const live = weights.map((w, i) => ({ w, i })).filter(x => x.w > 0);
  if (!live.length) return undefined;
  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a, g = live.reduce((a, x) => gcd(a, x.w), 0), total = live.reduce((a, x) => a + x.w / g, 0);
  const servers: UpServer[] = live.map(x => ({ text: String(x.i), address: '', port: 0, weight: x.w / g, maxFails: 0, failTimeout: 0, backup: false, down: false }));
  const peers = { primary: servers.map(s => ({ cw: 0, ew: s.weight, fails: 0 })), backup: [] }, up = { name: 'split', servers, method: 'round-robin' as const, file: '', line: 0 };
  let at = 0;
  for (let i = 0; i <= n % total; i++) at = pickPeer(up, peers, new Set(), '', () => 0) ?? 0;
  return live[at].i;
}

const bytes = (t: string) => new TextEncoder().encode(t).length;
const page = (status: number, now: number, server: string | undefined, body: string, more: [string, string][] = [], close = false): Response => ({ status, reason: reasonOf(status, server), close,
  headers: [...server ? [['Server', server] as [string, string]] : [], ['Date', httpDate(now)], ['Content-Type', status >= 300 && server ? 'text/html' : 'text/plain'], ['Content-Length', String(bytes(body))], ['Connection', close ? 'close' : 'keep-alive'], ...more], body });
const PLAIN = '<html>\n<head><title>400 The plain HTTP request was sent to HTTPS port</title></head>\n<body>\n<center><h1>400 Bad Request</h1></center>\n<center>The plain HTTP request was sent to HTTPS port</center>\n<hr><center>nginx</center>\n</body>\n</html>\n';
const HSTS: [string, string] = ['Strict-Transport-Security', 'max-age=31536000; includeSubDomains'];

/** E37: a request answered by an ingress controller's or a Gateway's router (the turns it takes are written back with set). */
export function kubeServe(get: () => FsState, set: (s: FsState) => void, r: Responder, req: Request, now: number): Response {
  const router = r.kube!, host = hostOf(req), path = req.path.split('?')[0], nginx = router.kind === 'ingress';
  const head = (res: Response) => req.method === 'HEAD' ? { ...res, body: '' } : res;
  const turns = { ...get().kubeNet?.turns }, save = () => { const s = get(); if (s.kubeNet) set({ ...s, kubeNet: { ...s.kubeNet, turns } }); };
  if (nginx && router.https && !req.tls) return head(page(400, now, 'nginx', PLAIN, [], true));
  let target: RouteTarget | undefined, srv: NginxServer | undefined;
  if (nginx) {
    const m = nginxRoute(router, host, path);
    srv = m.srv;
    if (!router.https && srv?.tls) return head(page(308, now, 'nginx', errorPage(308, 'nginx'), [['Location', `https://${host}${req.path}`]]));
    target = m.target;
    if (!target) return head(page(404, now, 'nginx', errorPage(404, 'nginx')));
  } else {
    const e = gatewayRoute(router, host, path);
    if (!e) return head(page(404, now, undefined, ''));
    const i = weightedPick(e.targets.map(t => t.weight), turns[e.key] ?? 0);
    turns[e.key] = (turns[e.key] ?? 0) + 1;
    target = i === undefined ? undefined : e.targets[i];
    if (!target || target.error) { save(); return head(page(500, now, undefined, '')); }
  }
  if (!target.eps.length) { save(); return head(nginx ? page(503, now, 'nginx', errorPage(503, 'nginx')) : page(503, now, undefined, 'no healthy upstream')); }
  const proto = router.https ? 'https' : 'http', fwd: Request = { ...req, version: '1.1', headers: nginx ? [['Host', host], ['X-Real-IP', router.client], ['X-Forwarded-For', router.client], ['X-Forwarded-Host', host],
    ['X-Forwarded-Port', String(router.port)], ['X-Forwarded-Proto', proto], ['X-Forwarded-Scheme', proto], ['X-Scheme', proto], ...req.headers.filter(([k]) => k.toLowerCase() !== 'host')] : req.headers };
  const start = turns[target.key] ?? 0;
  for (let i = 0; i < Math.min(nginx ? 3 : 1, target.eps.length); i++) {
    const ep = target.eps[(start + i) % target.eps.length];
    turns[target.key] = start + i + 1;
    if (!ep.responder) continue;
    save();
    const res = respond(ep.responder, fwd, now, undefined, router.client);
    if (!nginx) return res;
    const own = ['server', 'date', 'content-type', 'content-length', 'connection'], pick = (n: string) => res.headers.filter(([k]) => k.toLowerCase() === n);
    return { ...res, reason: reasonOf(res.status, 'nginx'), close: false, headers: [['Server', 'nginx'], ['Date', httpDate(now)], ...pick('content-type'), ...pick('content-length'),
      ['Connection', 'keep-alive'], ...res.headers.filter(([k]) => !own.includes(k.toLowerCase())), ...router.https && srv?.tls ? [HSTS] : []] };
  }
  save();
  return head(nginx ? page(502, now, 'nginx', errorPage(502, 'nginx')) : page(503, now, undefined, 'upstream connect error or disconnect/reset before headers. reset reason: connection failure'));
}

/** E37: the certificate a TLS port presents for an SNI name (exact, a *.wildcard of one label, one for any name, else the fallback). */
export function sniPresented(t: KubeTls, sni: string): Presented | { error: string } {
  const name = sni.toLowerCase(), c = t.certs.find(x => x.names.includes(name)) ?? t.certs.find(x => x.names.some(n => wildcard(n, name, true))) ?? t.certs.find(x => !x.names.length) ?? t.fallback;
  if (!c) return { error: 'no certificate' };
  const chain = certsIn(c.crt), pk = keyIn(c.key);
  return chain.length ? { chain, keyOk: !!pk && keyMatches(pk, chain[0]) } : { error: 'no certificate' };
}
