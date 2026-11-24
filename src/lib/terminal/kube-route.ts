import { DAY, type Seconds } from './clock';
import type { DockerState } from './docker';
import type { FsNode } from './fs';
import type { Responder } from './http';
import type { KubeTls, Listen } from './sockets';
import { certPem, certsIn, keyIn, keyMatches, keyPem, serialFrom, skiOf, type Cert } from './tls';
import { proxyTargets } from './kube-endpoints';
import { portsOf } from './kube-service-spec';
import { secretText } from './kube-config-spec';
import { ingressRules, isNginxPod, servedIngresses } from './kube-ingress';
import { attachments, backendOf, gatewayAddress, hostsMeet, isTrue, listenerSecret, listenersOf, ourGateways } from './kube-gateway';
import { arr, kindOf, nameOf, nsOf, obj, str, uidOf, type J, type JObj, type KubeState } from './kube-model';

/*
 * Engine stage E37 (docs/curriculum/KUB0_E37_INGRESS.md §4, §7): the data plane as routing tables. ingress-nginx's ports
 * 80 and 443 answer through a router built from the Ingresses it serves — one server per host ("" is the default server:
 * rules without a host), its paths, its TLS and its fallback (the first such Ingress's defaultBackend, else the
 * controller's 404) — and a TLS table (the Secret's certificate per TLS host, the Fake Certificate for every other name).
 * A Gateway the controller programmed is a machine at its address: per port its listeners and the routes attached to
 * each. Backends are resolved here to their ready endpoints with what each pod answers (podServing), so the request
 * itself (kube-route-serve.ts) only matches and picks.
 */

export interface RouteEp { ip: string; port: number; responder?: Responder }
/** A backend: the key of its turn, its weight, its endpoints; error 500: an invalid backend (the Gateway API's rule). */
export interface RouteTarget { key: string; weight: number; eps: readonly RouteEp[]; error?: 500 }
/** A path of a host (hosts: none for any); rank: the order among equals; key: the turn of a weighted split. */
export interface RouteEntry { hosts: readonly string[]; path: string; exact: boolean; targets: readonly RouteTarget[]; rank: number; key: string }
export interface NginxServer { host: string; tls: boolean; paths: RouteEntry[]; fallback?: RouteTarget }
export interface KubeRouter {
  kind: 'ingress' | 'gateway'; https: boolean; port: number; client: string;
  servers?: readonly NginxServer[];
  listeners?: readonly { hostname?: string; entries: readonly RouteEntry[] }[];
}
type Serve = (d: DockerState | undefined, k: KubeState, pod: JObj, t: Seconds) => { listen: Listen[]; responders: Responder[]; nodes?: ReadonlyMap<string, FsNode> };

/** The endpoints of a Service port (by number or name) with what each pod answers there (pods' answers cached per build). */
function targetOf(x: { d: DockerState | undefined; k: KubeState; t: Seconds; serve: Serve; cache: Map<string, ReturnType<Serve>> }, ns: string, name: string, port: J | undefined, weight: number, prefix: string): RouteTarget {
  const svc = x.k.objects.find(o => kindOf(o) === 'Service' && nsOf(o) === ns && nameOf(o) === name);
  const p = svc ? portsOf(svc).find(sp => typeof port === 'number' ? sp.port === port : str(sp.name) === port) : undefined, key = `${prefix}/${ns}/${name}/${String(port)}`;
  if (!svc || !p) return { key, weight, eps: [] };
  const eps = proxyTargets(x.k, svc, str(p.name) ?? '').map(e => {
    const pod = x.k.objects.find(o => kindOf(o) === 'Pod' && x.k.pods[uidOf(o)]?.ip === e.ip && !x.k.pods[uidOf(o)]?.static);
    if (!pod || isNginxPod(x.k, pod)) return { ip: e.ip, port: e.port };
    const s = x.cache.get(uidOf(pod)) ?? x.serve(x.d, x.k, pod, x.t);
    x.cache.set(uidOf(pod), s);
    const id = s.listen.find(l => l.port === e.port)?.http, responder = id ? s.responders.find(r => r.id === id) : undefined;
    return { ip: e.ip, port: e.port, ...responder ? { responder } : {} };
  });
  return { key, weight, eps };
}

/** ingress-nginx's default certificate (generated when it starts: self-signed, one year, ingress.local). */
export function fakeCertificate(start: Seconds): { crt: string; key: string } {
  const dn = [['O', 'Acme Co'], ['CN', 'Kubernetes Ingress Controller Fake Certificate']] as const, seed = 'ingress-nginx/fake-certificate';
  const c: Cert = { serial: serialFrom(seed), subject: dn, issuer: dn, notBefore: start, notAfter: start + 365 * DAY, key: 'rsa2048', ski: skiOf(seed), sans: ['ingress.local'], ca: false };
  return { crt: certPem(c), key: keyPem({ type: 'rsa2048', seed }) };
}
/** A kubernetes.io/tls Secret's certificate and key, when they parse and match. */
export function secretPair(secret: JObj | undefined): { crt: string; key: string } | undefined {
  if (!secret || str(secret.type) !== 'kubernetes.io/tls') return undefined;
  const crt = secretText(obj(secret.data)['tls.crt']), key = secretText(obj(secret.data)['tls.key']), chain = certsIn(crt), pk = keyIn(key);
  return chain.length && pk && keyMatches(pk, chain[0]) ? { crt, key } : undefined;
}

/** What the ingress-nginx pod serves: ports 80 and 443 (its TLS table), each answering through the router. */
export function nginxServing(d: DockerState | undefined, k: KubeState, pod: JObj, t: Seconds, serve: Serve): { listen: Listen[]; responders: Responder[] } {
  const sim = k.pods[uidOf(pod)], c = sim?.main[0];
  if (!sim?.ip || c?.state !== 'running') return { listen: [], responders: [] };
  const x = { d, k, t, serve, cache: new Map<string, ReturnType<Serve>>() }, servers = new Map<string, NginxServer>(), certs: KubeTls['certs'][number][] = [];
  const target = (ns: string, b: J | undefined) => { const s = obj(obj(b).service), p = obj(s.port); return targetOf(x, ns, str(s.name) ?? '', str(p.name) || p.number, 1, 'ingress'); };
  let rank = 0, fallback: RouteTarget | undefined;
  const ings = servedIngresses(k);
  for (const ing of ings) {
    const ns = nsOf(ing) ?? 'default', def = obj(ing.spec).defaultBackend === undefined ? undefined : target(ns, obj(ing.spec).defaultBackend), rules = ingressRules(ing);
    // A defaultBackend is the catch-all only from an Ingress without rules; else the fallback of the hosts it brings first.
    if (def && !rules.length) fallback ??= def;
    for (const r of rules) {
      const host = str(r.host) ?? '', srv = servers.get(host) ?? { host, tls: false, paths: [], ...def && host ? { fallback: def } : {} };
      servers.set(host, srv);
      for (const p0 of arr(obj(r.http).paths)) {
        const p = obj(p0), path = str(p.path) || '/', exact = str(p.pathType) === 'Exact';
        if (!srv.paths.some(e => e.path === path && e.exact === exact)) srv.paths.push({ hosts: host ? [host] : [], path, exact, targets: [target(ns, p.backend)], rank: rank++, key: '' });
      }
    }
  }
  if (fallback) { const def = servers.get('') ?? { host: '', tls: false, paths: [] }; servers.set('', { ...def, fallback: def.fallback ?? fallback }); }
  for (const ing of ings) for (const e of arr(obj(ing.spec).tls).map(obj)) for (const h of arr(e.hosts).map(String)) {
    const srv = servers.get(h);
    if (srv) srv.tls = true;
    if (certs.some(c2 => c2.names.includes(h))) continue;
    const secret = k.objects.find(o => kindOf(o) === 'Secret' && nsOf(o) === nsOf(ing) && nameOf(o) === str(e.secretName));
    const pair = secretPair(secret) ?? fakeCertificate(c.started ?? t);
    certs.push({ names: [h], ...pair });
  }
  const list = [...servers.values()], id = (port: number) => `kube-ingress-${uidOf(pod)}-${port}`;
  const responder = (port: number, https: boolean): Responder => ({ id: id(port), routes: [], kube: { kind: 'ingress', https, port, client: sim.ip, servers: list } });
  return { listen: [{ port: 80, fd: 3, http: id(80) }, { port: 443, fd: 4, http: id(443), kubeTls: { certs, fallback: fakeCertificate(c.started ?? t) } }, { port: 8443, fd: 5 }],
    responders: [responder(80, false), responder(443, true)] };
}

/** Each Gateway the controller programmed: its address, and per port the listeners with their routes (and TLS table). */
export function gatewayServing(d: DockerState | undefined, k: KubeState, t: Seconds, serve: Serve): { name: string; address: string; listen: Listen[]; responders: Responder[] }[] {
  const x = { d, k, t, serve, cache: new Map<string, ReturnType<Serve>>() }, attached = attachments(k), out: ReturnType<typeof gatewayServing> = [];
  for (const gw of ourGateways(k)) {
    const address = gatewayAddress(gw);
    if (!address || !isTrue(obj(gw.status).conditions, 'Programmed')) continue;
    const ok = listenersOf(gw).filter(l => isTrue(arr(obj(gw.status).listeners).map(obj).find(s => str(s.name) === str(l.name))?.conditions, 'Programmed'));
    const listen: Listen[] = [], responders: Responder[] = [];
    for (const port of [...new Set(ok.map(l => l.port as number))]) {
      const on = ok.filter(l => l.port === port), https = str(on[0].protocol) === 'HTTPS', id = `kube-gw-${uidOf(gw)}-${port}`;
      let rank = 0;
      const listeners = on.map(l => ({ ...str(l.hostname) ? { hostname: str(l.hostname) } : {}, entries: attached.filter(a => a.gw === gw && a.listeners.includes(str(l.name) ?? '')).flatMap(a => {
        const hosts = arr(obj(a.route.spec).hostnames).map(String).filter(h => hostsMeet(str(l.hostname), h)), rid = `gw/${nsOf(a.route)}/${nameOf(a.route)}`;
        return arr(obj(a.route.spec).rules).map(obj).flatMap((r, ri) => {
          const targets = arr(r.backendRefs).map(obj).map(b => {
            const w = typeof b.weight === 'number' ? b.weight : 1, ok2 = backendOf(k, a.route, b);
            return 'svc' in ok2 ? targetOf(x, nsOf(a.route) ?? 'default', str(b.name) ?? '', b.port, w, 'gw') : { key: `gw/${str(b.name)}`, weight: w, eps: [], error: 500 as const };
          });
          return arr(r.matches).map(obj).map(m => { const p = obj(m.path); return { hosts, path: str(p.value) ?? '/', exact: str(p.type) === 'Exact', targets: targets.length ? targets : [{ key: `${rid}/${ri}`, weight: 1, eps: [], error: 500 as const }], rank: rank++, key: `${rid}/${ri}` }; });
        });
      }) }));
      const certs = https ? on.flatMap(l => { const s = listenerSecret(k, gw, l), pair = 'secret' in s ? secretPair(s.secret) : undefined; return pair ? [{ names: str(l.hostname) ? [str(l.hostname)!] : [], ...pair }] : []; }) : [];
      listen.push({ port, fd: 3 + listen.length, http: id, ...https ? { kubeTls: { certs } } : {} });
      responders.push({ id, routes: [], kube: { kind: 'gateway', https, port, client: address, listeners } });
    }
    out.push({ name: `${nsOf(gw)}/${nameOf(gw)}`, address, listen, responders });
  }
  return out;
}
