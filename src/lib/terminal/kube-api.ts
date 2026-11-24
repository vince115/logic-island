import type { Seconds } from './clock';
import { parseRef } from './docker';
import { defaultProbes } from './kube-probe-spec';
import { defaultConfigVolume } from './kube-pod-config';
import {
  arr, bytesOf, cpuMilli, KUBE_LIMITS, kindOf, meta, nameOf, nsOf, obj, quantityText, stamp, str, suffix, uid,
  type J, type JObj, type KubeEvent, type KubeState,
} from './kube-model';

/*
 * Engine stage E32 (docs/curriculum/KUB0_E32_CLUSTER.md §4): the API server's store. Objects are found by kind, namespace
 * and name; every write bumps the cluster's resourceVersion; a new object gets a UID from the object counter, its
 * creationTimestamp and (a Pod) the API server's defaults — the service account token volume kube-api-access-xxxxx and
 * its mount, the two NoExecute tolerations of 300 s, imagePullPolicy (Always for :latest), terminationMessagePath… —
 * so -o yaml shows what a real API server returns. Events are aggregated like the kubelet's event correlator.
 */

export const NAMESPACED: Record<string, boolean> = { Pod: true, Namespace: false, Node: false, Event: true, Service: true, Deployment: true, ReplicaSet: true, DaemonSet: true, ConfigMap: true, Secret: true, Endpoints: true, EndpointSlice: true };
export const find = (k: KubeState, kind: string, ns: string | undefined, name: string) =>
  k.objects.find(o => kindOf(o) === kind && nameOf(o) === name && (NAMESPACED[kind] ? nsOf(o) === ns : true));
export const ofKind = (k: KubeState, kind: string, ns?: string) => k.objects.filter(o => kindOf(o) === kind && (ns === undefined || nsOf(o) === ns));
export const namespaceExists = (k: KubeState, ns: string) => !!find(k, 'Namespace', undefined, ns);

/** Inserts or replaces the object (same kind, namespace and name) with the next resourceVersion. */
export function put(k: KubeState, o: JObj): KubeState {
  const rv = k.rv + 1, m = { ...meta(o), resourceVersion: String(rv) }, next = { ...o, metadata: m };
  const at = k.objects.findIndex(x => kindOf(x) === kindOf(o) && nameOf(x) === nameOf(o) && nsOf(x) === nsOf(o));
  const objects = at >= 0 ? k.objects.map((x, i) => i === at ? next : x) : [...k.objects, next];
  return { ...k, rv, objects };
}
export function remove(k: KubeState, o: JObj): KubeState {
  const { [uidOfObj(o)]: _gone, ...pods } = k.pods;
  void _gone;
  return { ...k, rv: k.rv + 1, objects: k.objects.filter(x => x !== o && !(kindOf(x) === kindOf(o) && nameOf(x) === nameOf(o) && nsOf(x) === nsOf(o))), pods };
}
const uidOfObj = (o: JObj) => str(meta(o).uid) ?? '';

/** A new object's server-set metadata (uid from the object counter, creationTimestamp) and, for a Pod, the defaults. */
export function created(k: KubeState, doc: JObj, ns: string | undefined, t: Seconds): { k: KubeState; o: JObj } {
  const seq = k.seq + 1, id = uid(`${seq}/${kindOf(doc)}/${ns ?? ''}/${nameOf(doc)}`);
  const m: JObj = { ...meta(doc), ...ns !== undefined ? { namespace: ns } : {}, uid: id, creationTimestamp: stamp(t) };
  for (const key of ['resourceVersion', 'managedFields', 'generation']) delete m[key];
  let o: JObj = { ...doc, metadata: m };
  if (kindOf(o) === 'Pod') o = { ...defaultPod(o), status: { phase: 'Pending', qosClass: qosOf(o) } };
  if (kindOf(o) === 'Namespace') o = { ...o, metadata: { ...m, labels: { ...obj(m.labels), 'kubernetes.io/metadata.name': nameOf(o) } }, spec: { finalizers: ['kubernetes'] }, status: { phase: 'Active' } };
  return { k: { ...k, seq }, o };
}

const TOKEN_MOUNT = '/var/run/secrets/kubernetes.io/serviceaccount';
const DEFAULT_TOLERATIONS: J[] = ['not-ready', 'unreachable'].map(x => ({ effect: 'NoExecute', key: `node.kubernetes.io/${x}`, operator: 'Exists', tolerationSeconds: 300 }));
/** imagePullPolicy's default: Always for :latest (or no tag), IfNotPresent otherwise. */
export const pullPolicyOf = (image: string) => image.includes('@') ? 'IfNotPresent' : (parseRef(image)?.tag ?? 'latest') === 'latest' ? 'Always' : 'IfNotPresent';
/** A container's defaults (a Pod's, and E34: a pod template's). */
export function defaultContainer(c0: J): JObj {
  const c = { ...obj(c0) }, image = str(c.image) ?? '';
  c.imagePullPolicy ??= pullPolicyOf(image);
  c.resources ??= {};
  c.terminationMessagePath ??= '/dev/termination-log';
  c.terminationMessagePolicy ??= 'File';
  if (c.ports) c.ports = arr(c.ports).map(p => ({ protocol: 'TCP', ...obj(p) }));
  defaultProbes(c);
  return c;
}
/** The API server's defaults of a Pod (idempotent: an updated spec is defaulted again). */
export function defaultPod(o: JObj): JObj {
  const spec = { ...obj(o.spec) }, id = str(meta(o).uid) ?? nameOf(o);
  // E36: configMap and secret volumes get defaultMode 420 (no other volume exists below kube-config).
  const volumes = arr(spec.volumes).map(defaultConfigVolume), own = volumes.map(v => str(obj(v).name) ?? '').find(n => n.startsWith('kube-api-access-'));
  const access = own ?? `kube-api-access-${suffix(`api/${id}`)}`;
  const container = (c0: J): J => {
    const c = defaultContainer(c0);
    const mounts = arr(c.volumeMounts);
    if (!mounts.some(m => str(obj(m).mountPath) === TOKEN_MOUNT)) c.volumeMounts = [...mounts, { mountPath: TOKEN_MOUNT, name: access, readOnly: true }];
    return c;
  };
  spec.containers = arr(spec.containers).map(container);
  if (spec.initContainers) spec.initContainers = arr(spec.initContainers).map(container);
  spec.dnsPolicy ??= 'ClusterFirst';
  spec.enableServiceLinks ??= true;
  spec.preemptionPolicy ??= 'PreemptLowerPriority';
  spec.priority ??= 0;
  spec.restartPolicy ??= 'Always';
  spec.schedulerName ??= 'default-scheduler';
  spec.securityContext ??= {};
  spec.serviceAccountName ??= str(spec.serviceAccount) ?? 'default';
  spec.serviceAccount ??= spec.serviceAccountName;
  spec.terminationGracePeriodSeconds ??= 30;
  const tol = arr(spec.tolerations);
  spec.tolerations = [...tol, ...DEFAULT_TOLERATIONS.filter(d => !tol.some(x => str(obj(x).key) === str(obj(d).key)))];
  if (own) spec.volumes = volumes;
  else spec.volumes = [...volumes, { name: access, projected: { defaultMode: 420, sources: [
    { serviceAccountToken: { expirationSeconds: 3607, path: 'token' } },
    { configMap: { items: [{ key: 'ca.crt', path: 'ca.crt' }], name: 'kube-root-ca.crt' } },
    { downwardAPI: { items: [{ fieldRef: { apiVersion: 'v1', fieldPath: 'metadata.namespace' }, path: 'namespace' }] } },
  ] } }];
  return { ...o, spec };
}

/** A container's requests (limits stand in for missing requests), in millicores and bytes. */
export function containerRequests(c0: J): { cpu: number; memory: number; cpuSet: boolean; memSet: boolean } {
  const r = obj(obj(c0).resources), req = obj(r.requests), lim = obj(r.limits);
  const cpuT = quantityText(req.cpu ?? lim.cpu), memT = quantityText(req.memory ?? lim.memory);
  return { cpu: cpuT ? cpuMilli(cpuT) ?? 0 : 0, memory: memT ? bytesOf(memT) ?? 0 : 0, cpuSet: !!cpuT, memSet: !!memT };
}
/** A pod's effective requests: the containers' sum, or the largest init container's when that is more. */
export function podRequests(pod: JObj, nonzero = false): { cpu: number; memory: number } {
  const spec = obj(pod.spec), one = (c: J) => { const r = containerRequests(c); return nonzero ? { cpu: r.cpuSet ? r.cpu : 100, memory: r.memSet ? r.memory : 200 * 1024 ** 2 } : r; };
  const sum = arr(spec.containers).map(one).reduce((a, b) => ({ cpu: a.cpu + b.cpu, memory: a.memory + b.memory }), { cpu: 0, memory: 0 });
  for (const c of arr(spec.initContainers)) { const r = one(c); sum.cpu = Math.max(sum.cpu, r.cpu); sum.memory = Math.max(sum.memory, r.memory); }
  return sum;
}
/** The QoS class: Guaranteed (every container's requests equal its limits, both set), BestEffort (none set), else Burstable. */
export function qosOf(pod: JObj): string {
  const cs = [...arr(obj(pod.spec).containers), ...arr(obj(pod.spec).initContainers)].map(c => obj(obj(c).resources));
  if (cs.every(r => !Object.keys(obj(r.requests)).length && !Object.keys(obj(r.limits)).length)) return 'BestEffort';
  const full = cs.every(r => { const l = obj(r.limits), q = obj(r.requests); return ['cpu', 'memory'].every(k => l[k] !== undefined && (q[k] === undefined || String(q[k]) === String(l[k]))); });
  return full ? 'Guaranteed' : 'Burstable';
}

/** Records an event about an object (the same object, reason and message as the last such event counts up). */
export function record(k: KubeState, t: Seconds, about: { kind: string; name: string; ns: string; uid: string }, type: 'Normal' | 'Warning', reason: string, message: string, source = 'kubelet'): KubeState {
  const at = k.events.findIndex(e => e.uid === about.uid && e.reason === reason && e.message === message && e.kind === about.kind);
  if (at >= 0) return { ...k, events: k.events.map((e, i) => i === at ? { ...e, count: e.count + 1, last: t } : e) };
  const seq = (k.events.at(-1)?.seq ?? 0) + 1;
  const e: KubeEvent = { ns: about.ns, kind: about.kind, name: about.name, uid: about.uid, reason, type, message, first: t, last: t, count: 1, source, seq };
  return { ...k, events: [...k.events, e].slice(-KUBE_LIMITS.events) };
}
export const about = (o: JObj) => ({ kind: kindOf(o), name: nameOf(o), ns: nsOf(o) ?? 'default', uid: str(meta(o).uid) ?? '' });
