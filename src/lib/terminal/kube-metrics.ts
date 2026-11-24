import type { Seconds } from './clock';
import type { DockerState } from './docker';
import { find } from './kube-api';
import { endpointsOf } from './kube-endpoints';
import { mainRuntime, resolveImage } from './kube-image';
import { podFacts } from './kube-replicaset';
import { selectorMatches } from './kube-workload-spec';
import { arr, cpuMilli, kindOf, labelsOf, nsOf, obj, quantityText, str, systemNs, uidOf, type JObj, type KubeNode, type KubeState } from './kube-model';

/*
 * Engine stage E40 (docs/curriculum/KUB0_E40_AUTOSCALING.md §3): what metrics-server reports. Usage is a teaching model
 * on the lesson's data, deterministic: metrics-server scrapes every SCRAPE seconds (on the clock's multiples of 15), so a
 * reading at t is the one of the last scrape S = ⌊t ÷ 15⌋ × 15. A container's usage at S:
 *   CPU    = its base (the program's E24 cpu, percent of one CPU × 10 millicores; else 1m for a service, 0m for a shell)
 *          + for the pod's first container, per declared load: cpuPerRequest × the load's requests per second at S × the
 *            pod's share (1 ÷ the ready endpoints of the load's Service, or the ready pods of its Deployment; 0 when not one)
 *          then at most its CPU limit (CFS throttling, the rest is prose);
 *   memory = the program's E24 memory model at S (start + growth × seconds running, up to max; else 8Mi for a service,
 *            512Ki for a shell) + memoryPerRequest × the same requests (this term never OOM-kills: documented).
 * A pod is reported once every container has run for a whole scrape interval before S (two scrapes); kube-system's pods
 * use fixed figures, and a node adds its own overhead (kubelet, containerd, the OS) to its pods.
 */

export const SCRAPE = 15;
export const scrapeAt = (t: Seconds) => Math.floor(t / SCRAPE) * SCRAPE;
/** A load the lesson declared, resolved: the Service or Deployment it goes to, its requests per second per minute from start. */
export interface KubeLoad { ns: string; service?: string; deployment?: string; start: Seconds; rps: readonly number[]; cpu: number; memory: number }
/** The HPA controller's memory of one HPA (by uid): its last sync, recommendations, scale events, and the extremes it scaled to. */
export interface HpaMemory { at: Seconds; recs: readonly Sample[]; ups: readonly Sample[]; downs: readonly Sample[]; hi?: number; lo?: number }
export interface Sample { t: Seconds; n: number }
/** E40 (the autoscaling profile): metrics-server installed or not, the lesson's loads, the HPA controller's memory. */
export interface AutoscaleState { metrics: boolean; load: readonly KubeLoad[]; hpa: Readonly<Record<string, HpaMemory>> }
export interface Usage { name: string; cpu: number; memory: number }

const MI = 1024 * 1024;
/** kube-system's containers (and ingress-nginx's controller, metrics-server): fixed usage in millicores and bytes. */
const SYSTEM: Record<string, [number, number]> = { etcd: [25, 45 * MI], 'kube-apiserver': [50, 260 * MI], 'kube-controller-manager': [15, 55 * MI], 'kube-scheduler': [4, 22 * MI],
  coredns: [2, 14 * MI], 'kube-proxy': [1, 18 * MI], 'metrics-server': [4, 20 * MI], controller: [3, 90 * MI] };
/** What a node uses besides its pods (kubelet, containerd, the OS). */
const overhead = (n: KubeNode): [number, number] => n.control ? [60, 700 * MI] : [30, 400 * MI];

/** Requests per second of a load at time t (0 before its start and after its last minute). */
export function rpsAt(l: KubeLoad, t: Seconds): number {
  const m = Math.floor((t - l.start) / 60);
  return m < 0 || m >= l.rps.length ? 0 : l.rps[m];
}

/** Each pod's shares of the loads (by pod uid), as kube-proxy (a Service) or the clients (a Deployment) spread the requests. */
function shares(k: KubeState): Map<string, { l: KubeLoad; share: number }[]> {
  const out = new Map<string, { l: KubeLoad; share: number }[]>();
  for (const l of k.autoscale?.load ?? []) {
    let pods: JObj[] = [];
    if (l.service) { const svc = find(k, 'Service', l.ns, l.service); pods = svc ? endpointsOf(k, svc).filter(e => e.ready).map(e => e.pod) : []; }
    else if (l.deployment) {
      const dep = find(k, 'Deployment', l.ns, l.deployment), sel = obj(dep?.spec).selector;
      pods = dep ? k.objects.filter(o => kindOf(o) === 'Pod' && nsOf(o) === l.ns && selectorMatches(sel, labelsOf(o)) && (f => f.ready && !f.deleting)(podFacts(k, o, Infinity))) : [];
    }
    for (const p of pods) out.set(uidOf(p), [...out.get(uidOf(p)) ?? [], { l, share: 1 / pods.length }]);
  }
  return out;
}

/** A reader of the cluster's usage at t (the shares worked out once). */
export function usageAt(d: DockerState | undefined, k: KubeState, t: Seconds) {
  const s = scrapeAt(t), share = shares(k);
  const container = (pod: JObj, name: string, first: boolean, started: Seconds): Usage => {
    if (systemNs(k, nsOf(pod))) { const [cpu, memory] = SYSTEM[name] ?? [1, 10 * MI]; return { name, cpu, memory }; }
    const spec = obj(arr(obj(pod.spec).containers).map(obj).find(c => str(c.name) === name)), img = resolveImage(d, str(spec.image) ?? '', 'pulled');
    const main = 'img' in img ? mainRuntime(d, img.img, spec) : { service: false }, rt = 'rt' in main ? main.rt : undefined, m = rt?.memory;
    let cpu = rt?.cpu !== undefined ? rt.cpu * 10 : main.service ? 1 : 0;
    let memory = m ? Math.min(m.max ?? Infinity, m.start + m.growth * Math.max(0, s - started)) : main.service ? 8 * MI : 512 * 1024;
    if (first) for (const { l, share: part } of share.get(uidOf(pod)) ?? []) { const r = rpsAt(l, s) * part; cpu += l.cpu * r; memory += l.memory * r; }
    const limit = quantityText(obj(obj(spec.resources).limits).cpu), max = limit ? cpuMilli(limit) : null;
    return { name, cpu: Math.round(max !== null ? Math.min(cpu, max) : cpu), memory: Math.round(memory) };
  };
  /** A pod's containers as metrics-server reports them (undefined: not reported yet, or not running). strict: the two-scrape rule. */
  const pod = (p: JObj, strict = true): Usage[] | undefined => {
    const sim = k.pods[uidOf(p)];
    if (!sim?.main.length) return undefined;
    if (sim.main.some(c => c.state !== 'running' || (c.started ?? Infinity) > (strict ? s - SCRAPE : s))) return undefined;
    return sim.main.map((c, i) => container(p, c.name, i === 0, c.started ?? s));
  };
  /** A node: its overhead and its running pods' usage, in millicores and bytes. */
  const node = (n: KubeNode): { cpu: number; memory: number } => {
    let [cpu, memory] = overhead(n);
    for (const p of k.objects) {
      if (kindOf(p) !== 'Pod' || k.pods[uidOf(p)]?.node !== n.name) continue;
      for (const u of pod(p, false) ?? []) { cpu += u.cpu; memory += u.memory; }
    }
    return { cpu, memory };
  };
  return { pod, node, scrape: s };
}

/** A quantity of milli-units as resource.Quantity prints a DecimalSI one (45m, 1, 1500m, 50M, 104857600). */
export function decimalSI(milli: number): string {
  const v = Math.round(milli);
  if (v % 1000) return `${v}m`;
  let n = v / 1000;
  for (const suffix of ['', 'k', 'M', 'G', 'T']) { if (n % 1000 || !n || suffix === 'T') return `${n}${suffix}`; n /= 1000; }
  return String(n);
}
