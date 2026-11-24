import type { Seconds } from './clock';
import { hex } from './docker';
import { printPod } from './kube-status';
import { resourceName } from './kube-output';
import { selectorText } from './kube-workload-spec';
import { externalIp, portsText } from './kube-service-spec';
import { formatEndpoints, sliceAddresses, slicePorts } from './kube-endpoints';
import {
  arr, CONTAINERD_VERSION, createdOf, goTab, humanDuration, KUBE_VERSION, labelsOf, nameOf, NODE_KERNEL, NODE_OS, nsOf, obj, stamp, str, uid,
  type J, type JObj, type KubeEvent, type KubeNode, type KubeState,
} from './kube-model';

/*
 * Engine stage E32 (docs/curriculum/KUB0_E32_CLUSTER.md §9): kubectl get's tables — the columns of each kind (pods, nodes,
 * namespaces, events, and the system's services, deployments and daemonsets), -o wide's extra columns, -A's NAMESPACE
 * and --show-labels' LABELS — and nodes and events as API objects (for -o yaml/json/jsonpath).
 */

const age = (t: Seconds | undefined, now: Seconds) => t === undefined ? '<unknown>' : humanDuration(now - t);
const labelText = (l: Readonly<Record<string, string>>) => Object.keys(l).length ? Object.keys(l).sort().map(k => `${k}=${l[k]}`).join(',') : '<none>';
export const rolesOf = (labels: Readonly<Record<string, string>>) => Object.keys(labels).filter(k => k.startsWith('node-role.kubernetes.io/')).map(k => k.slice(24)).sort().join(',') || '<none>';

/** A node as the API returns it (capacity is its allocatable: the simulation keeps no reserve). */
export function nodeJson(k: KubeState, n: KubeNode, now: Seconds): JObj {
  const res = { cpu: n.cpuText, 'ephemeral-storage': '19221248Ki', memory: n.memoryText, pods: String(n.pods) };
  // E34: a failed node's kubelet stopped posting status (Unknown since it was marked NotReady).
  const lost = k.down?.[n.name], beat = k.failures?.find(f => f.node === n.name)?.at;
  const cond = (type: string, status: string, reason: string, message: string): J => lost !== undefined
    ? { lastHeartbeatTime: stamp(beat ?? lost), lastTransitionTime: stamp(lost), message: 'Kubelet stopped posting node status.', reason: 'NodeStatusUnknown', status: 'Unknown', type }
    : { lastHeartbeatTime: stamp(now), lastTransitionTime: stamp(n.created), message, reason, status, type };
  return { apiVersion: 'v1', kind: 'Node',
    metadata: { annotations: { 'kubeadm.alpha.kubernetes.io/cri-socket': 'unix:///var/run/containerd/containerd.sock', 'node.alpha.kubernetes.io/ttl': '0', 'volumes.kubernetes.io/controller-managed-attach-detach': 'true' },
      creationTimestamp: stamp(n.created), labels: { ...n.labels }, name: n.name, resourceVersion: String(k.rv), uid: uid(`node/${n.name}`) },
    spec: { podCIDR: n.cidr, podCIDRs: [n.cidr], ...n.unschedulable ? { unschedulable: true } : {}, ...n.taints.length ? { taints: n.taints.map(t => ({ effect: t.effect, key: t.key, ...t.value ? { value: t.value } : {} })) } : {} },
    status: { addresses: [{ address: n.address, type: 'InternalIP' }, { address: n.name, type: 'Hostname' }], allocatable: res, capacity: res,
      conditions: [cond('MemoryPressure', 'False', 'KubeletHasSufficientMemory', 'kubelet has sufficient memory available'), cond('DiskPressure', 'False', 'KubeletHasNoDiskPressure', 'kubelet has no disk pressure'),
        cond('PIDPressure', 'False', 'KubeletHasSufficientPID', 'kubelet has sufficient PID available'), cond('Ready', 'True', 'KubeletReady', 'kubelet is posting ready status')],
      daemonEndpoints: { kubeletEndpoint: { Port: 10250 } },
      nodeInfo: { architecture: 'amd64', bootID: uid(`boot/${n.name}`), containerRuntimeVersion: `containerd://${CONTAINERD_VERSION}`, kernelVersion: NODE_KERNEL, kubeProxyVersion: KUBE_VERSION, kubeletVersion: KUBE_VERSION,
        machineID: hex(`machine/${n.name}`).slice(0, 32), operatingSystem: 'linux', osImage: NODE_OS, systemUUID: uid(`system/${n.name}`) } } };
}
export function eventJson(e: KubeEvent): JObj {
  return { apiVersion: 'v1', count: e.count, eventTime: null, firstTimestamp: stamp(e.first), involvedObject: { apiVersion: 'v1', kind: e.kind, name: e.name, ...e.kind === 'Node' ? {} : { namespace: e.ns }, uid: e.uid },
    kind: 'Event', lastTimestamp: stamp(e.last), message: e.message, metadata: { creationTimestamp: stamp(e.first), name: `${e.name}.${hex(`event/${e.seq}`).slice(0, 16)}`, namespace: e.ns },
    reason: e.reason, reportingComponent: e.source, reportingInstance: '', source: { component: e.source }, type: e.type };
}

/** prefix: several types in one get (each name is kind/name). */
export interface TableOpts { wide: boolean; all: boolean; labels: boolean; now: Seconds; prefix?: boolean; /** -L: a column per label key. */ columns?: readonly string[] }
type Cols = { head: string[]; wide?: string[]; row: (o: JObj) => string[]; more?: (o: JObj) => string[] };
const selText = (m: J | undefined) => Object.keys(obj(m)).length ? Object.entries(obj(m)).map(([a, b]) => `${a}=${String(b)}`).join(',') : '<none>';
const COLUMNS: Record<string, (now: Seconds, k: KubeState) => Cols> = {
  Pod: now => ({ head: ['NAME', 'READY', 'STATUS', 'RESTARTS', 'AGE'], wide: ['IP', 'NODE', 'NOMINATED NODE', 'READINESS GATES'],
    row: o => { const p = printPod(o, now); return [nameOf(o), p.ready, p.status, p.restarts, age(createdOf(o), now)]; },
    more: o => [str(obj(o.status).podIP) ?? '<none>', str(obj(o.spec).nodeName) ?? '<none>', '<none>', '<none>'] }),
  Node: now => ({ head: ['NAME', 'STATUS', 'ROLES', 'AGE', 'VERSION'], wide: ['INTERNAL-IP', 'EXTERNAL-IP', 'OS-IMAGE', 'KERNEL-VERSION', 'CONTAINER-RUNTIME'],
    row: o => [nameOf(o), `${nodeReady(o) ? 'Ready' : 'NotReady'}${obj(o.spec).unschedulable ? ',SchedulingDisabled' : ''}`, rolesOf(labelsOf(o)), age(createdOf(o), now), KUBE_VERSION],
    more: o => [str(obj(arr(obj(o.status).addresses)[0]).address) ?? '<none>', '<none>', NODE_OS, NODE_KERNEL, `containerd://${CONTAINERD_VERSION}`] }),
  Namespace: now => ({ head: ['NAME', 'STATUS', 'AGE'], row: o => [nameOf(o), str(obj(o.status).phase) ?? 'Active', age(createdOf(o), now)] }),
  Service: now => ({ head: ['NAME', 'TYPE', 'CLUSTER-IP', 'EXTERNAL-IP', 'PORT(S)', 'AGE'], wide: ['SELECTOR'],
    row: o => [nameOf(o), str(obj(o.spec).type) ?? 'ClusterIP', str(obj(o.spec).clusterIP) ?? '<none>', externalIp(o), portsText(o), age(createdOf(o), now)], more: o => [selText(obj(o.spec).selector)] }),
  // E35: Endpoints and EndpointSlices.
  Endpoints: now => ({ head: ['NAME', 'ENDPOINTS', 'AGE'], row: o => [nameOf(o), formatEndpoints(o), age(createdOf(o), now)] }),
  EndpointSlice: now => ({ head: ['NAME', 'ADDRESSTYPE', 'PORTS', 'ENDPOINTS', 'AGE'], row: o => [nameOf(o), str(o.addressType) ?? 'IPv4', slicePorts(o), sliceAddresses(o), age(createdOf(o), now)] }),
  // E36: ConfigMaps and Secrets (DATA counts data and binaryData keys).
  ConfigMap: now => ({ head: ['NAME', 'DATA', 'AGE'], row: o => [nameOf(o), String(Object.keys(obj(o.data)).length + Object.keys(obj(o.binaryData)).length), age(createdOf(o), now)] }),
  Secret: now => ({ head: ['NAME', 'TYPE', 'DATA', 'AGE'], row: o => [nameOf(o), str(o.type) ?? 'Opaque', String(Object.keys(obj(o.data)).length), age(createdOf(o), now)] }),
  Deployment: now => ({ head: ['NAME', 'READY', 'UP-TO-DATE', 'AVAILABLE', 'AGE'], wide: ['CONTAINERS', 'IMAGES', 'SELECTOR'],
    row: o => { const s = obj(o.status); return [nameOf(o), `${String(s.readyReplicas ?? 0)}/${String(obj(o.spec).replicas ?? 1)}`, String(s.updatedReplicas ?? 0), String(s.availableReplicas ?? 0), age(createdOf(o), now)]; },
    more: o => tmpl(o) }),
  DaemonSet: now => ({ head: ['NAME', 'DESIRED', 'CURRENT', 'READY', 'UP-TO-DATE', 'AVAILABLE', 'NODE SELECTOR', 'AGE'], wide: ['CONTAINERS', 'IMAGES', 'SELECTOR'],
    row: o => { const s = obj(o.status); return [nameOf(o), ...['desiredNumberScheduled', 'currentNumberScheduled', 'numberReady', 'updatedNumberScheduled', 'numberAvailable'].map(x => String(s[x] ?? 0)), selText(obj(obj(obj(o.spec).template).spec).nodeSelector), age(createdOf(o), now)]; },
    more: o => tmpl(o) }),
  ReplicaSet: now => ({ head: ['NAME', 'DESIRED', 'CURRENT', 'READY', 'AGE'], wide: ['CONTAINERS', 'IMAGES', 'SELECTOR'],
    row: o => [nameOf(o), String(obj(o.spec).replicas ?? 1), String(obj(o.status).replicas ?? 0), String(obj(o.status).readyReplicas ?? 0), age(createdOf(o), now)], more: o => tmpl(o) }),
  Event: now => ({ head: ['LAST SEEN', 'TYPE', 'REASON', 'OBJECT', 'MESSAGE'],
    row: o => [age(parseLast(o), now), str(o.type) ?? '', str(o.reason) ?? '', `${(str(obj(o.involvedObject).kind) ?? '').toLowerCase()}/${str(obj(o.involvedObject).name) ?? ''}`, str(o.message) ?? ''] }),
};
const tmpl = (o: JObj) => { const cs = arr(obj(obj(obj(o.spec).template).spec).containers).map(obj); return [cs.map(c => str(c.name)).join(','), cs.map(c => str(c.image)).join(','), selectorText(obj(o.spec).selector)]; };
const nodeReady = (o: JObj) => arr(obj(o.status).conditions).some(c => str(obj(c).type) === 'Ready' && str(obj(c).status) === 'True');
const parseLast = (o: JObj) => { const v = str(o.lastTimestamp); return v ? createdOf({ metadata: { creationTimestamp: v } }) : undefined; };

/** The table of these objects of one kind (the caller prints "No resources found" for none). */
export function table(k: KubeState, kind: string, items: readonly JObj[], o: TableOpts): string[] {
  const c = COLUMNS[kind](o.now, k), ns = o.all && kind !== 'Node' && kind !== 'Namespace';
  const cols = o.columns ?? [], head = [...ns ? ['NAMESPACE'] : [], ...c.head, ...o.wide ? c.wide ?? [] : [], ...cols.map(l => l.replace(/^.*\//, '').toUpperCase()), ...o.labels ? ['LABELS'] : []];
  const rows = items.map(x => [...ns ? [nsOf(x) ?? ''] : [], ...named(c.row(x), x, kind, o.prefix), ...o.wide && c.more ? c.more(x) : [], ...cols.map(l => labelsOf(x)[l] ?? ''), ...o.labels ? [labelText(labelsOf(x))] : []]);
  return goTabRows([head, ...rows]);
}
const named = (row: string[], x: JObj, kind: string, prefix?: boolean) => prefix ? [resourceName({ ...x, kind }), ...row.slice(1)] : row;
const goTabRows = (rows: string[][]) => goTab(rows.map(r => r.join('\t')));
