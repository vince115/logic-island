import { DAY, parseTime, type Seconds } from './clock';
import { generateSeries, seriesProblems, type SeriesShape } from '@/lib/devops/series';
import { defaultPod, put } from './kube-api';
import { freeIp } from './kube-sched';
import type { AutoscaleState, KubeLoad } from './kube-metrics';
import { bytesOf, containerId, cpuMilli, stamp, suffix, uid, type CSim, type JObj, type KubeState } from './kube-model';

/*
 * Engine stage E40 as lesson data (docs/curriculum/KUB0_E40_AUTOSCALING.md §7): kube.metricsServer installs
 * metrics-server v0.7.2 when the cluster was created (a Deployment of one pod in kube-system, on the first worker; it
 * serves the Metrics API that kubectl top and the HPA read), and kube.load declares the requests a Service or a
 * Deployment receives over time — requests per second for each minute from start, written out or generated from a D3
 * shape (src/lib/devops/series.ts), and what each request per second costs a pod in CPU (and memory).
 */

export interface TerminalKubeLoad {
  /** The Service whose ready endpoints share the requests, or the Deployment whose ready pods do (one of them). */
  service?: string; deployment?: string; namespace?: string;
  /** When minute 0 begins (UTC; default the machine's now); minutes 1..360 of requests per second (values or a D3 shape). */
  start?: string; minutes: number; rps: number[] | SeriesShape;
  /** CPU per request per second (2m: 100 req/s cost 200m), and memory per request per second (optional). */
  cpuPerRequest: string; memoryPerRequest?: string;
}
export interface MetricsLesson { metricsServer?: boolean; load?: TerminalKubeLoad[] }

export const METRICS_SERVER_IMAGE = 'registry.k8s.io/metrics-server/metrics-server:v0.7.2';
const LINE = (t: unknown, max = 63) => typeof t === 'string' && /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(t) && t.length <= max;

export function metricsProblems(kube: MetricsLesson, autoscaling: boolean, created: Seconds, now: Seconds): string[] {
  const out: string[] = [];
  if (kube.metricsServer !== undefined) {
    if (!autoscaling) out.push('kube: metricsServer needs the autoscaling profile (engine stage E40)');
    else if (typeof kube.metricsServer !== 'boolean') out.push('kube: metricsServer is true or false');
  }
  if (kube.load === undefined) return out;
  if (!autoscaling) return [...out, 'kube: load needs the autoscaling profile (engine stage E40)'];
  if (!Array.isArray(kube.load) || kube.load.length > 6) return [...out, 'kube: load is at most 6 of { service | deployment, namespace?, start?, minutes, rps, cpuPerRequest, memoryPerRequest? }'];
  kube.load.forEach((l, i) => {
    const fail = (s: string) => out.push(`kube: load[${i}]: ${s}`);
    if ((l.service === undefined) === (l.deployment === undefined) || ![l.service, l.deployment].filter(v => v !== undefined).every(v => LINE(v, 253))) fail('names a service or a deployment (one of them)');
    if (l.namespace !== undefined && !LINE(l.namespace)) fail('namespace is a namespace name');
    const start = l.start === undefined ? now : parseTime(l.start);
    if (start === undefined || start < created || start > now + DAY) fail('start is a UTC time between created and a day after now');
    if (!Number.isInteger(l.minutes) || l.minutes < 1 || l.minutes > 360) { fail('minutes is 1..360'); return; }
    const series = { id: 'load', label: 'load', unit: 'req/s', signal: 'traffic' as const, ...Array.isArray(l.rps) ? { values: l.rps } : { shape: l.rps } };
    for (const p of typeof l.rps === 'object' && l.rps !== null ? seriesProblems(series, l.minutes) : ['needs either values or a shape (not both)']) fail(`rps ${p}`);
    if (typeof l.cpuPerRequest !== 'string' || cpuMilli(l.cpuPerRequest) === null) fail('cpuPerRequest is a cpu quantity such as 2m');
    if (l.memoryPerRequest !== undefined && (typeof l.memoryPerRequest !== 'string' || bytesOf(l.memoryPerRequest) === null)) fail('memoryPerRequest is a memory quantity such as 1Mi');
  });
  return out;
}

/** The cluster's autoscaling state from valid lesson data. */
export function autoscaleState(kube: MetricsLesson, now: Seconds): AutoscaleState {
  const load: KubeLoad[] = (kube.load ?? []).map(l => ({ ns: l.namespace ?? 'default', ...l.service ? { service: l.service } : { deployment: l.deployment }, start: parseTime(l.start ?? '') ?? now,
    rps: Array.isArray(l.rps) ? [...l.rps] : generateSeries(l.rps, l.minutes), cpu: cpuMilli(l.cpuPerRequest) ?? 0, memory: l.memoryPerRequest ? bytesOf(l.memoryPerRequest) ?? 0 : 0 }));
  return { metrics: !!kube.metricsServer, load, hpa: {} };
}

/** metrics-server in kube-system: its Deployment and ReplicaSet (shown, never reconciled) and its pod on the first worker. */
export function installMetricsServer(k: KubeState, t: Seconds): KubeState {
  const node = k.nodes.find(n => !n.control) ?? k.nodes[0], hash = suffix('metrics-server-template', 10), labels = { 'k8s-app': 'metrics-server' };
  const meta = (kind: string, name: string, more: JObj = {}): JObj => ({ creationTimestamp: stamp(t), generation: 1, labels, name, namespace: 'kube-system', uid: uid(`${kind}/metrics-server`), ...more });
  const container = { args: ['--cert-dir=/tmp', '--secure-port=10250', '--kubelet-preferred-address-types=InternalIP,ExternalIP,Hostname', '--kubelet-use-node-status-port', '--metric-resolution=15s'],
    image: METRICS_SERVER_IMAGE, name: 'metrics-server', resources: { requests: { cpu: '100m', memory: '200Mi' } } };
  const template = { metadata: { labels }, spec: { containers: [container], priorityClassName: 'system-cluster-critical', serviceAccountName: 'metrics-server' } };
  const owner = (kind: string, name: string) => ({ ownerReferences: [{ apiVersion: 'apps/v1', blockOwnerDeletion: true, controller: true, kind, name, uid: uid(`${kind}/metrics-server`) }] });
  const dep: JObj = { apiVersion: 'apps/v1', kind: 'Deployment', metadata: meta('Deployment', 'metrics-server', { annotations: { 'deployment.kubernetes.io/revision': '1' } }),
    spec: { replicas: 1, selector: { matchLabels: labels }, template }, status: { availableReplicas: 1, observedGeneration: 1, readyReplicas: 1, replicas: 1, updatedReplicas: 1 } };
  const rsLabels = { ...labels, 'pod-template-hash': hash }, rsName = `metrics-server-${hash}`;
  const rs: JObj = { apiVersion: 'apps/v1', kind: 'ReplicaSet', metadata: { ...meta('ReplicaSet', rsName, owner('Deployment', 'metrics-server')), labels: rsLabels },
    spec: { replicas: 1, selector: { matchLabels: rsLabels }, template: { ...template, metadata: { labels: rsLabels } } }, status: { availableReplicas: 1, fullyLabeledReplicas: 1, observedGeneration: 1, readyReplicas: 1, replicas: 1 } };
  const name = `${rsName}-${suffix('metrics-server/1')}`, id = uid(`sys/${name}`), ip = freeIp(k, node);
  const pod = defaultPod({ apiVersion: 'v1', kind: 'Pod', metadata: { creationTimestamp: stamp(t), labels: rsLabels, name, namespace: 'kube-system', uid: id, ...owner('ReplicaSet', rsName) },
    spec: { containers: [container], nodeName: node.name, priority: 2000000000, priorityClassName: 'system-cluster-critical', serviceAccountName: 'metrics-server' } });
  const c: CSim = { name: 'metrics-server', image: METRICS_SERVER_IMAGE, init: false, state: 'running', started: t, restarts: 0, crashes: 0, pullFails: 0, logs: [], prev: [], cid: containerId(`sys/${name}`),
    imageId: `registry.k8s.io/metrics-server/metrics-server@sha256:${containerId(`img/${METRICS_SERVER_IMAGE}`)}` };
  const next = { ...k, pods: { ...k.pods, [id]: { node: node.name, bound: t, ip, init: [], main: [c], static: true as const } }, cache: { ...k.cache, [node.name]: [...k.cache[node.name] ?? [], METRICS_SERVER_IMAGE] } };
  return put(put(put(next, dep), rs), pod);
}
