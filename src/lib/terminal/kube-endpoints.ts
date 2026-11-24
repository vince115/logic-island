import type { Seconds } from './clock';
import { about, put, record, remove } from './kube-api';
import { podFacts } from './kube-replicaset';
import { ipNumber } from './sockets';
import { isHeadless, lbIpOf, portsOf, selectorOf, typeOfSvc } from './kube-service-spec';
import {
  arr, createdOf, kindOf, labelsOf, meta, nameOf, nsOf, obj, sameJ, stamp, str, suffix, uid, uidOf,
  type J, type JObj, type KubeState,
} from './kube-model';

/*
 * Engine stage E35 (docs/curriculum/KUB0_E35_KUBE_NET.md §3): the endpoints and EndpointSlice controllers. A Service with
 * a selector gets an Endpoints object (ready pods in addresses, not-ready ones in notReadyAddresses, terminating ones left
 * out) and EndpointSlices (every pod with its ready, serving and terminating conditions), one per set of resolved ports:
 * a named targetPort is looked up in each pod's container ports, and a pod without it is left out for that port. The
 * controller runs in settle whenever a pod's address, readiness, deletion or phase changes and when a Service appears,
 * and once more at the end (labels, selectors and Services a command changed); objects change only when their content
 * does. The kubernetes Service's endpoints (the API server, 10.0.0.50:6443) and LoadBalancer addresses from the lesson's
 * pool (a MetalLB-like provider, in creation order) are written here too.
 */

export const TRIGGER = 'endpoints.kubernetes.io/last-change-trigger-time';
export const MANAGED_BY = 'endpointslice.kubernetes.io/managed-by';
export const SERVICE_NAME = 'kubernetes.io/service-name';
export interface EpPort { name: string; port: number; protocol: string }
/** A pod behind a Service: its address and node, its conditions, the ports it resolves. */
export interface Ep { pod: JObj; ip: string; node: string; ready: boolean; serving: boolean; terminating: boolean; ports: EpPort[] }

/** A named targetPort of a pod (the first container port with that name and protocol), or undefined. */
export function namedPort(pod: JObj, name: string, protocol: string): number | undefined {
  for (const c of arr(obj(pod.spec).containers)) for (const p0 of arr(obj(c).ports)) {
    const p = obj(p0);
    if (str(p.name) === name && (str(p.protocol) ?? 'TCP') === protocol && typeof p.containerPort === 'number') return p.containerPort;
  }
  return undefined;
}
/** The pods a Service selects (same namespace, with an address, not finished), sorted by address, with their ports. */
export function endpointsOf(k: KubeState, svc: JObj): Ep[] {
  const sel = selectorOf(svc);
  if (!sel) return [];
  const out: Ep[] = [];
  for (const pod of k.objects) {
    if (kindOf(pod) !== 'Pod' || nsOf(pod) !== nsOf(svc)) continue;
    const labels = labelsOf(pod), sim = k.pods[uidOf(pod)];
    if (!Object.entries(sel).every(([a, b]) => labels[a] === b) || !sim?.ip) continue;
    const f = podFacts(k, pod, Infinity);
    if (f.phase === 'Succeeded' || f.phase === 'Failed') continue;
    const ports: EpPort[] = [];
    for (const p of portsOf(svc)) {
      const proto = str(p.protocol) ?? 'TCP', tp = p.targetPort ?? p.port;
      const port = typeof tp === 'string' ? namedPort(pod, tp, proto) : typeof tp === 'number' ? tp : undefined;
      if (port !== undefined) ports.push({ name: str(p.name) ?? '', port, protocol: proto });
    }
    if (portsOf(svc).length && !ports.length) continue;
    out.push({ pod, ip: sim.ip, node: sim.node, ready: f.ready && !f.deleting, serving: f.ready, terminating: f.deleting, ports });
  }
  return out.sort((a, b) => ipNumber(a.ip) - ipNumber(b.ip) || nameOf(a.pod).localeCompare(nameOf(b.pod)));
}
/** The endpoints kube-proxy sends a Service port's connections to: the ready ones (none: the serving terminating ones), in order. */
export function proxyTargets(k: KubeState, svc: JObj, portName: string): { ip: string; port: number; node: string }[] {
  const eps = endpointsOf(k, svc).filter(e => e.ports.some(p => p.name === portName));
  const ready = eps.filter(e => e.ready), use = ready.length ? ready : eps.filter(e => e.serving && e.terminating);
  return use.map(e => ({ ip: e.ip, node: e.node, port: e.ports.find(p => p.name === portName)!.port }));
}

const target = (e: Ep): J => ({ kind: 'Pod', name: nameOf(e.pod), namespace: nsOf(e.pod) ?? 'default', uid: uidOf(e.pod) });
const portsKey = (ps: readonly EpPort[]) => JSON.stringify([...ps].sort((a, b) => a.name.localeCompare(b.name) || a.port - b.port));
/** Endpoints v1 subsets: addresses grouped by identical port sets (RepackSubsets). */
function subsets(svc: JObj, eps: readonly Ep[]): J[] {
  const publish = obj(svc.spec).publishNotReadyAddresses === true, groups = new Map<string, { ports: EpPort[]; ready: Ep[]; notReady: Ep[] }>();
  for (const e of eps) {
    if (e.terminating && !publish) continue;
    const key = portsKey(e.ports), g = groups.get(key) ?? { ports: [...e.ports].sort((a, b) => a.name.localeCompare(b.name) || a.port - b.port), ready: [], notReady: [] };
    (e.ready || publish ? g.ready : g.notReady).push(e);
    groups.set(key, g);
  }
  return [...groups.values()].map(g => ({
    ...g.ready.length ? { addresses: g.ready.map(e => ({ ip: e.ip, nodeName: e.node, targetRef: target(e) })) } : {},
    ...g.notReady.length ? { notReadyAddresses: g.notReady.map(e => ({ ip: e.ip, nodeName: e.node, targetRef: target(e) })) } : {},
    ...g.ports.length ? { ports: g.ports.map(p => ({ ...p.name ? { name: p.name } : {}, port: p.port, protocol: p.protocol })) } : {},
  }));
}
const svcLabels = (svc: JObj): JObj => ({ ...labelsOf(svc), ...isHeadless(svc) ? { 'service.kubernetes.io/headless': '' } : {} });

/** The Endpoints object and EndpointSlices a Service should have now (content only; metadata is completed by sync). */
function desired(k: KubeState, svc: JObj): { ep: JObj; slices: JObj[] } {
  const ns = nsOf(svc) ?? 'default', name = nameOf(svc), cp = k.nodes.find(n => n.control) ?? k.nodes[0];
  if (ns === 'default' && name === 'kubernetes') {
    const port = { name: 'https', port: 6443, protocol: 'TCP' };
    return { ep: { apiVersion: 'v1', kind: 'Endpoints', metadata: { labels: { 'endpointslice.kubernetes.io/skip-mirror': 'true' }, name, namespace: ns }, subsets: [{ addresses: [{ ip: cp.address }], ports: [port] }] },
      slices: [{ addressType: 'IPv4', apiVersion: 'discovery.k8s.io/v1', endpoints: [{ addresses: [cp.address], conditions: { ready: true } }], kind: 'EndpointSlice',
        metadata: { labels: { [SERVICE_NAME]: name }, name, namespace: ns }, ports: [port] }] };
  }
  const eps = endpointsOf(k, svc), subs = subsets(svc, eps);
  const own = svcLabels(svc), ep: JObj = { apiVersion: 'v1', kind: 'Endpoints', metadata: { ...Object.keys(own).length ? { labels: own } : {}, name, namespace: ns }, ...subs.length ? { subsets: subs } : {} };
  const groups = new Map<string, Ep[]>();
  for (const e of eps) groups.set(portsKey(e.ports), [...groups.get(portsKey(e.ports)) ?? [], e]);
  const owner: J = { apiVersion: 'v1', blockOwnerDeletion: true, controller: true, kind: 'Service', name, uid: uidOf(svc) };
  const labels: JObj = { ...svcLabels(svc), [MANAGED_BY]: 'endpointslice-controller.k8s.io', [SERVICE_NAME]: name };
  const slice = (list: readonly Ep[], i: number): JObj => ({ addressType: 'IPv4', apiVersion: 'discovery.k8s.io/v1',
    endpoints: list.length ? list.map(e => ({ addresses: [e.ip], conditions: { ready: e.ready, serving: e.serving, terminating: e.terminating }, nodeName: e.node, targetRef: target(e) })) : null, kind: 'EndpointSlice',
    metadata: { generateName: `${name}-`, labels, name: `${name}-${suffix(`slice/${uidOf(svc)}/${i}`)}`, namespace: ns, ownerReferences: [owner] },
    ports: list.length && list[0].ports.length ? [...list[0].ports].sort((a, b) => a.name.localeCompare(b.name) || a.port - b.port).map(p => ({ name: p.name, port: p.port, protocol: p.protocol })) : null });
  const lists = [...groups.values()];
  return { ep, slices: lists.length ? lists.map(slice) : [slice([], 0)] };
}

const content = (o: JObj): J => { const m = { ...meta(o) }; for (const x of ['resourceVersion', 'uid', 'creationTimestamp', 'generation', 'annotations']) delete m[x]; return { ...o, metadata: m }; };
/** Writes the object if its content changed (keeping uid and creation time, a new trigger time and slice generation). */
function upsert(k: KubeState, want: JObj, live: JObj | undefined, t: Seconds, created: Seconds): KubeState {
  if (live && sameJ(content(live), content(want))) return k;
  const m = meta(want), plain = nsOf(want) === 'default' && nameOf(want) === 'kubernetes';
  const md: JObj = { ...plain ? {} : { annotations: { [TRIGGER]: stamp(t) } }, creationTimestamp: live ? meta(live).creationTimestamp ?? stamp(created) : stamp(plain ? created : t), ...m,
    ...kindOf(want) === 'EndpointSlice' ? { generation: live ? Number(meta(live).generation ?? 1) + 1 : 1 } : {}, uid: live ? uidOf(live) : uid(`${kindOf(want)}/${nsOf(want)}/${nameOf(want)}`) };
  return put(k, { ...want, metadata: md });
}

/** The controllers at t: every Service's Endpoints and EndpointSlices, stale ones removed, LoadBalancer addresses given. */
export function syncNet(k0: KubeState, t: Seconds): KubeState {
  let k = k0;
  const services = k.objects.filter(o => kindOf(o) === 'Service' && (createdOf(o) ?? 0) <= t);
  const keep = new Set<string>();
  for (const svc of services) {
    if (!selectorOf(svc) && !(nsOf(svc) === 'default' && nameOf(svc) === 'kubernetes')) continue;
    const d = desired(k, svc), created = nsOf(svc) === 'default' && nameOf(svc) === 'kubernetes' ? k.created : createdOf(svc) ?? t;
    const same = (o: JObj, kind: string, name: string) => kindOf(o) === kind && nsOf(o) === nsOf(svc) && nameOf(o) === name;
    for (const want of [d.ep, ...d.slices]) {
      keep.add(`${kindOf(want)}/${nsOf(svc)}/${nameOf(want)}`);
      k = upsert(k, want, k.objects.find(o => same(o, kindOf(want), nameOf(want))), t, created);
    }
  }
  for (const o of k.objects) {
    if ((kindOf(o) === 'Endpoints' || kindOf(o) === 'EndpointSlice') && !keep.has(`${kindOf(o)}/${nsOf(o)}/${nameOf(o)}`)) k = remove(k, o);
  }
  return { ...assignLb(k, t), netAt: t, netDirty: k.netDirty !== undefined && k.netDirty <= t ? undefined : k.netDirty };
}

/** The pool's addresses to LoadBalancer Services without one, oldest first (spec.loadBalancerIP asks for one of them). */
function assignLb(k0: KubeState, t: Seconds): KubeState {
  let k = k0;
  const lbs = k.objects.filter(o => kindOf(o) === 'Service' && typeOfSvc(o) === 'LoadBalancer' && (createdOf(o) ?? 0) <= t).sort((a, b) => (createdOf(a) ?? 0) - (createdOf(b) ?? 0) || nameOf(a).localeCompare(nameOf(b)));
  // A Service that is no longer a LoadBalancer gives its address back.
  for (const o of k.objects) if (kindOf(o) === 'Service' && typeOfSvc(o) !== 'LoadBalancer' && lbIpOf(o)) k = put(k, { ...o, status: { loadBalancer: {} } });
  const pool = k.lb ?? [];
  if (!pool.length) return k;
  const used = new Set(lbs.map(lbIpOf).filter((x): x is string => !!x));
  for (const svc of lbs) {
    if (lbIpOf(svc)) continue;
    const ask = str(obj(svc.spec).loadBalancerIP), ip = ask ? (pool.includes(ask) && !used.has(ask) ? ask : undefined) : pool.find(a => !used.has(a));
    const who = `${nsOf(svc) ?? 'default'}/${nameOf(svc)}`;
    if (!ip) { if (!k.events.some(e => e.uid === uidOf(svc) && e.reason === 'AllocationFailed')) k = record(k, t, about(svc), 'Warning', 'AllocationFailed', `Failed to allocate IP for "${who}": ${ask ? `"${ask}" is not allowed in config` : 'no available IPs'}`, 'metallb-controller'); continue; }
    used.add(ip);
    k = put(k, { ...svc, status: { loadBalancer: { ingress: [{ ip, ipMode: 'VIP' }] } } });
    k = record(k, t, about(svc), 'Normal', 'IPAllocated', `Assigned IP ["${ip}"]`, 'metallb-controller');
  }
  return k;
}

/** What the controllers watch of the pods (a settle step that changes it makes them run at its time). */
export function netSig(k: KubeState): string {
  return k.objects.filter(o => kindOf(o) === 'Pod').map(p => { const f = podFacts(k, p, Infinity); return `${uidOf(p)}:${k.pods[uidOf(p)]?.ip ?? ''}:${f.ready ? 1 : 0}${f.deleting ? 'd' : ''}${f.phase}`; }).join(',');
}
/** The times the controllers must run at: a Service's creation after their last run, and a command's change. */
export const netTimes = (k: KubeState): Seconds[] => [...k.objects.filter(o => kindOf(o) === 'Service').map(o => createdOf(o) ?? 0).filter(t => t > (k.netAt ?? -Infinity)), ...k.netDirty !== undefined ? [k.netDirty] : []];

const capped = (list: readonly string[], max = 3) => list.length > max ? `${list.slice(0, max).join(',')} + ${list.length - max} more...` : list.join(',');
/** kubectl's ENDPOINTS of an Endpoints object (ready addresses, ip:port per port; at most three, then "+ N more..."), or of one port. */
export function formatEndpoints(ep: JObj, portName?: string): string {
  const subs = arr(ep.subsets).map(obj);
  if (!subs.length) return '<none>';
  const list: string[] = [];
  for (const ss of subs) {
    const addrs = arr(ss.addresses).map(a => str(obj(a).ip) ?? ''), ports = arr(ss.ports).map(obj);
    if (!ports.length) { list.push(...addrs); continue; }
    for (const p of ports) if (portName === undefined || (str(p.name) ?? '') === portName) list.push(...addrs.map(a => `${a}:${String(p.port)}`));
  }
  return capped(list);
}
/** kubectl's PORTS and ENDPOINTS of an EndpointSlice (every address, ready or not; <unset> for none). */
export const slicePorts = (s: JObj) => arr(s.ports).map(p => String(obj(p).port)).join(',') || '<unset>';
export const sliceAddresses = (s: JObj) => capped(arr(s.endpoints).flatMap(e => arr(obj(e).addresses).map(String))) || '<unset>';
