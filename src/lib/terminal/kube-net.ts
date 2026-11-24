import type { Seconds } from './clock';
import type { FsNode, FsState } from './fs';
import type { DockerState } from './docker';
import { findResponder, type Responder } from './http';
import { clockOf, tableOf, type Clock, type Proc } from './processes';
import { interfacesOf, isLoopback, listenersOf, macFor, ownsAddress, type Listen } from './sockets';
import type { RemoteHost } from './ssh';
import { healthOf, serviceOf } from './kube-health';
import { podContainer, resolveImage } from './kube-image';
import { proxyTargets } from './kube-endpoints';
import { kubeDns, type KubeDns } from './kube-dns';
import { deadAt } from './kube-controllers';
import { hasNodePorts, isHeadless, lbIpOf, portKey, portsOf } from './kube-service-spec';
import { isNginxPod } from './kube-ingress';
import { gatewayServing, nginxServing } from './kube-route';
import { arr, kindOf, nameOf, nsOf, obj, str, uidOf, type JObj, type KubeState } from './kube-model';

/*
 * Engine stage E35 (docs/curriculum/KUB0_E35_KUBE_NET.md §6): the cluster's network as E10–E12 see it. A pod is a machine
 * of the network (its address on eth0, its containers' listeners and E12 responders once they listen; a route's body may
 * say {{hostname}} and {{ip}}, replaced by the pod's name and address). kube-proxy is a
 * table of Service addresses (ClusterIP:port, every node's address:nodePort, a LoadBalancer's address:port): each new
 * connection (curl, nc, wget: NetIo.connect) binds the address to the Service's next ready endpoint in address order and
 * moves the turn on — round-robin, deterministic; no ready endpoint (or one that does not listen) refuses the connection,
 * as kube-proxy's REJECT does. A pod sees the other pods, the ClusterIPs, NodePorts and LoadBalancers; the learner's
 * machine sees only the NodePorts and LoadBalancers (a ClusterIP or a pod address times out from outside) and the pods a
 * kubectl port-forward reaches. The turns are kept in the cluster (KubeState.turns) after each command.
 */

/** A Service address of kube-proxy: where a connection to address:port may go (in turn). */
export interface KubeVip { address: string; port: number; key: string; to: readonly { ip: string; port: number }[] }
export interface KubeNetView { vips: readonly KubeVip[]; turns: Readonly<Record<string, number>>; dns?: KubeDns; forwards?: readonly number[] }

const proc = (listen: readonly Listen[], t: Seconds, command = 'app'): Proc => ({ pid: 1, ppid: 0, user: 'root', command, stat: 'Ss', cpu: 0, rss: 4096, vsz: 8192, shr: 2048, tty: '?', start: t, time: 0, nice: 0, ...listen.length ? { listen } : {} });
const bare = (host: string, address: string, iface: string, prefix: number): FsState => ({ nodes: new Map(), cwd: '/', user: 'root', home: '/root', host,
  sockets: { interfaces: [{ name: iface, address, prefix, mac: macFor(host) }], connections: [] }, processes: [], http: { responders: [] } });

/** What a pod serves now: its running containers' listeners (once they listen) and responders (the lesson's kube.health paths first). */
export function podServing(d: DockerState | undefined, k: KubeState, pod: JObj, t: Seconds): { listen: Listen[]; responders: Responder[]; nodes?: ReadonlyMap<string, FsNode> } {
  // E37: the ingress-nginx controller answers through its router.
  if (isNginxPod(k, pod)) return nginxServing(d, k, pod, t, podServing);
  const sim = k.pods[uidOf(pod)], listen: Listen[] = [], responders: Responder[] = [];
  let nodes: ReadonlyMap<string, FsNode> | undefined;
  if (!sim?.ip) return { listen, responders };
  sim.main.forEach((c, i) => {
    if (c.state !== 'running') return;
    const spec = arr(obj(pod.spec).containers)[i], svc = serviceOf({ d, k, pod, spec, c, ip: sim.ip, t }), age = t - (c.started ?? t);
    if (age < svc.listen) return;
    for (const port of svc.ports) {
      if (listen.some(l => l.port === port)) continue;
      const id = `kube-${uidOf(pod)}-${i}-${port}`, http = svc.http?.port === port ? svc.http.responder : undefined;
      if (http) {
        const rules = (healthOf(k, c.image)?.paths ?? []).filter(p => age >= (p.after ?? 0) && (p.until === undefined || age < p.until));
        // A route's body may name the pod serving it ({{hostname}}, {{ip}}): how a lesson shows which endpoint answered.
        const mine = http.routes.map(r => r.body === undefined ? r : { ...r, body: r.body.replaceAll('{{hostname}}', nameOf(pod)).replaceAll('{{ip}}', sim.ip) });
        responders.push({ ...http, id, routes: [...rules.map(r => ({ path: r.path, status: r.status ?? 500, ...r.delay ? { delay: r.delay } : {} })), ...mine] });
        if (!nodes && http.routes.some(r => r.root)) { const img = resolveImage(d, c.image, k.config ? 'pulled' : undefined); if (!('error' in img)) nodes = podContainer(img.img, spec, nameOf(pod), c.cid ?? '', t, c.layer).nodes; }
      }
      listen.push({ port, fd: 3 + listen.length, ...http ? { http: id } : {} });
    }
  });
  return { listen, responders, ...nodes ? { nodes } : {} };
}
export const podHostName = (ns: string, pod: string) => `kube:pod/${ns}/${pod}`;
/** A pod as a machine of the network (hidden: nobody else reaches it — the learner's view, or a failed node). */
// KUB-4: a pod keeps the clock of the machine its cluster runs on (its responses' Date header said the default day).
function podHost(d: DockerState | undefined, k: KubeState, pod: JObj, t: Seconds, hidden: boolean, clock: Clock): RemoteHost {
  const sim = k.pods[uidOf(pod)]!, s = podServing(d, k, pod, t), name = podHostName(nsOf(pod) ?? 'default', nameOf(pod)), dead = deadAt(k, sim.node), base = bare(name, sim.ip, 'eth0', 24);
  const off = hidden || (dead !== undefined && dead <= t);
  return { host: name, address: sim.ip, aliases: [], passwords: [], state: { ...base, clock, ...s.nodes ? { nodes: new Map(s.nodes) } : {}, sockets: { ...base.sockets!, ...off ? { onlyFrom: [] } : {} },
    processes: [proc(s.listen, t)], http: { responders: s.responders } } };
}

/** kube-proxy's Service addresses (inside: a pod's view, with the ClusterIPs). Only TCP ports are simulated. */
export function vipsOf(k: KubeState, inside: boolean): KubeVip[] {
  const out: KubeVip[] = [];
  const services = k.objects.filter(o => kindOf(o) === 'Service').sort((a, b) => (nsOf(a) ?? '').localeCompare(nsOf(b) ?? '') || nameOf(a).localeCompare(nameOf(b)));
  for (const svc of services) for (const p of portsOf(svc)) {
    if ((str(p.protocol) ?? 'TCP') !== 'TCP' || typeof p.port !== 'number') continue;
    const key = portKey(svc, p), to = proxyTargets(k, svc, str(p.name) ?? '').map(e => ({ ip: e.ip, port: e.port }));
    const ip = str(obj(svc.spec).clusterIP);
    if (inside && ip && !isHeadless(svc)) out.push({ address: ip, port: p.port, key, to });
    if (hasNodePorts(svc) && typeof p.nodePort === 'number') for (const n of k.nodes) out.push({ address: n.address, port: p.nodePort, key, to });
    const lb = lbIpOf(svc);
    if (lb) out.push({ address: lb, port: p.port, key, to });
  }
  return out;
}

/** Binds a Service address's port to the endpoint of this turn (its listener and responder), or to nothing (refused). */
export function bindVip(view: FsState, vip: KubeVip, turn: number): FsState {
  const hosts = view.net?.hosts ?? [], at = hosts.findIndex(h => h.address === vip.address && h.host.startsWith('kube:vip/'));
  if (at < 0) return view;
  const host = hosts[at].state, id = `kube-vip-${vip.address}-${vip.port}`;
  const old = tableOf(host)[0]?.listen ?? [], keep = old.filter(l => l.port !== vip.port);
  const responders = (host.http?.responders ?? []).filter(r => r.id !== id);
  let added: Listen | undefined, nodes = host.nodes;
  const ep = vip.to.length ? vip.to[turn % vip.to.length] : undefined;
  const src = ep ? (ownsAddress(view, ep.ip) ? view : hosts.find(h => h.address === ep.ip && h.host.startsWith('kube:pod/'))?.state) : undefined;
  const l = src && ep ? listenersOf(src).find(x => x.proto === 'tcp' && x.local.port === ep.port) : undefined;
  if (src && l) {
    const r = findResponder(src, l)?.r;
    if (r) { responders.push({ ...r, id }); nodes = src.nodes; }
    added = { port: vip.port, fd: 3 + keep.length, ...r ? { http: id } : {}, ...l.kubeTls ? { kubeTls: l.kubeTls } : {} };
  }
  const listen = added ? [...keep, added] : keep;
  const next: FsState = { ...host, clock: clockOf(view), nodes, processes: [proc(listen, clockOf(view).now, 'kube-proxy')], http: { responders } };
  return { ...view, net: { ...view.net!, hosts: hosts.map((h, i) => i === at ? { ...h, state: next } : h) } };
}
/** NetIo.connect: a new connection to address:port takes the Service's next endpoint (port-forward: kubectl says it handles it). */
export function kubeConnect(state: FsState, address: string, port: number, say?: (line: string) => void): FsState {
  const v = state.kubeNet;
  if (!v) return state;
  if (isLoopback(address) && v.forwards?.includes(port)) say?.(`Handling connection for ${port}`);
  const vip = v.vips.find(x => x.address === address && x.port === port);
  if (!vip) return state;
  const turn = v.turns[vip.key] ?? 0;
  return { ...bindVip(state, vip, turn), kubeNet: { ...v, turns: { ...v.turns, [vip.key]: turn + 1 } } };
}
/** The Service addresses as hosts, each bound to its current turn. */
function withVips(view: FsState, vips: readonly KubeVip[]): FsState {
  const seen = new Set<string>(), hosts: RemoteHost[] = [];
  for (const v of vips) if (!seen.has(v.address)) { seen.add(v.address); const name = `kube:vip/${v.address}`; hosts.push({ host: name, address: v.address, aliases: [], passwords: [], state: bare(name, v.address, 'kube-ipvs0', 32) }); }
  let out: FsState = { ...view, net: { ...view.net!, hosts: [...view.net!.hosts, ...hosts] } };
  for (const v of vips) out = bindVip(out, v, view.kubeNet?.turns[v.key] ?? 0);
  return out;
}
/** E37: the Gateways the controller programmed, as machines at their addresses. */
const gatewayHosts = (d: DockerState | undefined, k: KubeState, t: Seconds): RemoteHost[] => !k.ingress?.gateway ? [] : gatewayServing(d, k, t, podServing).map(g => {
  const name = `kube:gw/${g.name}`, base = bare(name, g.address, 'eth0', 32);
  return { host: name, address: g.address, aliases: [], passwords: [], state: { ...base, processes: [proc(g.listen, t, 'gateway')], http: { responders: g.responders } } };
});
const livePods = (k: KubeState, except?: string) => k.objects.filter(o => kindOf(o) === 'Pod' && uidOf(o) !== except && !!k.pods[uidOf(o)]?.ip && !k.pods[uidOf(o)]?.static);

/** A pod's network (kubectl exec): its interface and listeners, the other pods, kube-proxy's addresses and CoreDNS. */
export function podView(state: FsState, pod: JObj): Pick<FsState, 'sockets' | 'processes' | 'http' | 'net' | 'kubeNet'> {
  const k = state.kube!, t = clockOf(state).now, d = state.docker, sim = k.pods[uidOf(pod)]!, own = podServing(d, k, pod, t);
  const gw = sim.ip.replace(/\.\d+$/, '.1'), vips = vipsOf(k, true);
  let view: FsState = { ...bare(nameOf(pod), sim.ip, 'eth0', 24), clock: clockOf(state), processes: [proc(own.listen, t)], http: { responders: own.responders },
    net: { address: sim.ip, seed: uidOf(pod), hosts: [...livePods(k, uidOf(pod)).map(p => podHost(d, k, p, t, false, clockOf(state))), ...gatewayHosts(d, k, t)], connections: 0 },
    kubeNet: { vips, turns: { ...k.turns }, dns: kubeDns(k, nsOf(pod) ?? 'default') } };
  view = { ...view, sockets: { ...view.sockets!, gateway: gw } };
  view = withVips(view, vips);
  return { sockets: view.sockets, processes: view.processes, http: view.http, net: view.net, kubeNet: view.kubeNet };
}

/**
 * The learner's machine with the cluster's outside (shell net commands of the kube-net profile, and checks): the nodes'
 * NodePorts and the LoadBalancer addresses, and the pods (unreachable by address; port-forward reaches them). A
 * port-forward whose pod is gone stops listening; one whose pod does not listen on the port answers nothing.
 */
export function clusterView(state: FsState): FsState {
  const k = state.kube;
  if (!k?.net) return state;
  const t = clockOf(state).now, d = state.docker, vips = vipsOf(k, false), pids = new Set(tableOf(state).map(p => p.pid));
  const forwards = (k.forwards ?? []).filter(f => pids.has(f.pid));
  const processes = tableOf(state).map(p => {
    const f = forwards.find(x => x.pid === p.pid);
    if (!f) return p;
    const pod = k.objects.find(o => kindOf(o) === 'Pod' && nameOf(o) === f.pod && nsOf(o) === f.ns), sim = pod ? k.pods[uidOf(pod)] : undefined;
    if (!pod || !sim?.ip || sim.main.every(c => c.state !== 'running')) return { ...p, listen: [] };
    const serves = podServing(d, k, pod, t).listen.some(l => l.port === f.port);
    return serves ? p : { ...p, listen: (p.listen ?? []).map(l => { const { forward: _f, ...rest } = l; void _f; return rest; }) };
  });
  const own = state.net, address = own?.address ?? interfacesOf(state)[1]?.address ?? '10.0.0.10';
  const view: FsState = { ...state, processes, net: { address, seed: own?.seed ?? 'kube', hosts: [...own?.hosts ?? [], ...livePods(k).map(p => podHost(d, k, p, t, true, clockOf(state))), ...gatewayHosts(d, k, t)], connections: own?.connections ?? 0 },
    kubeNet: { vips, turns: { ...k.turns }, forwards: forwards.filter(f => processes.some(p => p.pid === f.pid && p.listen?.length)).map(f => f.local) } };
  return withVips(view, vips);
}
/** The learner's machine after a command on clusterView: its own network and processes back, kube-proxy's turns kept. */
export function afterCluster(base: FsState, after: FsState): FsState {
  if (!after.kubeNet) return after;
  const { kubeNet, net, processes: _p, ...rest } = after;
  void _p;
  const out: FsState = { ...rest, ...base.processes ? { processes: base.processes } : {} };
  if (base.net && net) out.net = { ...net, hosts: net.hosts.filter(h => !h.host.startsWith('kube:')) };
  if (out.kube) out.kube = { ...out.kube, turns: kubeNet.turns };
  return out;
}
