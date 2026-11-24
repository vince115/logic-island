import type { Seconds } from './clock';
import { base64 } from './ssh';
import {
  ADMIN_CONTEXT, ADMIN_USER, API_SERVER, CLUSTER_NAME, containerId, CONTROL_TAINT, KUBE_VERSION, stamp, suffix, uid,
  type CSim, type J, type JObj, type KubeNode, type KubeState, type PodSim, type Taint,
} from './kube-model';
import { defaultPod } from './kube-api';

/*
 * Engine stage E32 (docs/curriculum/KUB0_E32_CLUSTER.md §2): the cluster as kubeadm leaves it. Nodes cp-01 (the
 * control-plane taint), node-01 and node-02 unless the lesson lists its own; the four system namespaces; the services
 * kubernetes (10.96.0.1) and kube-dns (10.96.0.10); in kube-system the static pods of the control plane on the control
 * plane node, CoreDNS (a Deployment of two) and kube-proxy (a DaemonSet) — shown, already running, never pulled. There is
 * no CNI's pods (the network plugin is prose). ~/.kube/config is kubeadm's admin.conf with simulated certificate data.
 */

/** A node as the lesson declares it (allocatable cpu, memory and pods; taints as key[=value]:Effect). */
export interface TerminalKubeNode { name: string; address?: string; control?: boolean; cpu?: string; memory?: string; pods?: number; labels?: Record<string, string>; taints?: string[] }
export const DEFAULT_NODES: TerminalKubeNode[] = [{ name: 'cp-01', control: true }, { name: 'node-01' }, { name: 'node-02' }];
export const DEFAULT_CPU = '2', DEFAULT_MEMORY = '3911796Ki';
const IMAGES = { etcd: 'registry.k8s.io/etcd:3.5.16-0', apiserver: `registry.k8s.io/kube-apiserver:${KUBE_VERSION}`, cm: `registry.k8s.io/kube-controller-manager:${KUBE_VERSION}`,
  scheduler: `registry.k8s.io/kube-scheduler:${KUBE_VERSION}`, coredns: 'registry.k8s.io/coredns/coredns:v1.11.3', proxy: `registry.k8s.io/kube-proxy:${KUBE_VERSION}`, pause: 'registry.k8s.io/pause:3.10' };
export const SYSTEM_IMAGES: readonly string[] = Object.values(IMAGES);

/** key[=value]:Effect → a taint (null when it is not one). */
export function parseTaint(text: string): Taint | null {
  const m = /^([A-Za-z0-9][-A-Za-z0-9_./]*)(?:=([A-Za-z0-9_.-]*))?:(NoSchedule|PreferNoSchedule|NoExecute)$/.exec(text);
  return m ? { key: m[1], ...m[2] ? { value: m[2] } : {}, effect: m[3] as Taint['effect'] } : null;
}
export const taintText = (t: Taint) => `${t.key}${t.value ? `=${t.value}` : ''}:${t.effect}`;

export function nodesOf(list: readonly TerminalKubeNode[], created: Seconds, cpu: (t: string) => number, mem: (t: string) => number): KubeNode[] {
  return list.map((n, i) => {
    const control = !!n.control, cpuText = n.cpu ?? DEFAULT_CPU, memoryText = n.memory ?? DEFAULT_MEMORY;
    const labels: Record<string, string> = { 'beta.kubernetes.io/arch': 'amd64', 'beta.kubernetes.io/os': 'linux', 'kubernetes.io/arch': 'amd64', 'kubernetes.io/hostname': n.name, 'kubernetes.io/os': 'linux',
      ...control ? { 'node-role.kubernetes.io/control-plane': '', 'node.kubernetes.io/exclude-from-external-load-balancers': '' } : {}, ...n.labels };
    const taints = n.taints ? n.taints.map(t => parseTaint(t)!).filter(Boolean) : control ? [CONTROL_TAINT] : [];
    return { name: n.name, address: n.address ?? `10.0.0.${50 + i}`, cidr: `10.244.${i}.0/24`, control, created, labels, taints, cpu: cpu(cpuText), memory: mem(memoryText), pods: n.pods ?? 110, cpuText, memoryText };
  });
}

const namespace = (name: string, t: Seconds): JObj => ({ apiVersion: 'v1', kind: 'Namespace', metadata: { creationTimestamp: stamp(t), labels: { 'kubernetes.io/metadata.name': name }, name, uid: uid(`ns/${name}`) },
  spec: { finalizers: ['kubernetes'] }, status: { phase: 'Active' } });
const service = (ns: string, name: string, ip: string, ports: J[], labels: Record<string, string>, selector: Record<string, string> | undefined, t: Seconds): JObj => ({
  apiVersion: 'v1', kind: 'Service', metadata: { creationTimestamp: stamp(t), labels, name, namespace: ns, uid: uid(`svc/${ns}/${name}`) },
  spec: { clusterIP: ip, clusterIPs: [ip], internalTrafficPolicy: 'Cluster', ipFamilies: ['IPv4'], ipFamilyPolicy: 'SingleStack', ports, ...selector ? { selector } : {}, sessionAffinity: 'None', type: 'ClusterIP' },
  status: { loadBalancer: {} } });

interface SysPod { name: string; image: string; labels: Record<string, string>; node: KubeNode; ip: string; requests?: Record<string, string>; limits?: Record<string, string>; owner: JObj; host?: true; tolerate?: true }
function sysPod(p: SysPod, t: Seconds): { pod: JObj; sim: PodSim } {
  const id = uid(`sys/${p.name}`), cname = p.labels.component ?? (p.labels['k8s-app'] === 'kube-dns' ? 'coredns' : 'kube-proxy');
  const resources = { ...p.requests ? { requests: p.requests } : {}, ...p.limits ? { limits: p.limits } : {} };
  const pod = defaultPod({ apiVersion: 'v1', kind: 'Pod',
    metadata: { creationTimestamp: stamp(t), labels: p.labels, name: p.name, namespace: 'kube-system', ownerReferences: [p.owner], uid: id },
    spec: { containers: [{ image: p.image, name: cname, resources }], nodeName: p.node.name, priority: 2000001000, priorityClassName: p.host ? 'system-node-critical' : 'system-cluster-critical',
      ...p.host ? { hostNetwork: true } : {}, ...p.tolerate ? { tolerations: [{ key: 'CriticalAddonsOnly', operator: 'Exists' }, { effect: 'NoSchedule', key: CONTROL_TAINT.key }] } : {} } });
  const c: CSim = { name: cname, image: p.image, init: false, state: 'running', started: t, restarts: 0, crashes: 0, pullFails: 0, logs: [], prev: [], cid: containerId(`sys/${p.name}`), imageId: `${p.image.split(':')[0]}@sha256:${containerId(`img/${p.image}`)}` };
  return { pod, sim: { node: p.node.name, bound: t, ip: p.ip, init: [], main: [c], static: true } };
}

/** The objects and kubelet records of a new cluster (statuses are filled in by the first settle). */
export function bootstrap(nodes: readonly KubeNode[], t: Seconds): Pick<KubeState, 'objects' | 'pods' | 'cache'> {
  const objects: JObj[] = ['default', 'kube-node-lease', 'kube-public', 'kube-system'].map(n => namespace(n, t));
  objects.push(service('default', 'kubernetes', '10.96.0.1', [{ name: 'https', port: 443, protocol: 'TCP', targetPort: 6443 }], { component: 'apiserver', provider: 'kubernetes' }, undefined, t));
  objects.push(service('kube-system', 'kube-dns', '10.96.0.10', [{ name: 'dns', port: 53, protocol: 'UDP', targetPort: 53 }, { name: 'dns-tcp', port: 53, protocol: 'TCP', targetPort: 53 }, { name: 'metrics', port: 9153, protocol: 'TCP', targetPort: 9153 }],
    { 'k8s-app': 'kube-dns', 'kubernetes.io/cluster-service': 'true', 'kubernetes.io/name': 'CoreDNS' }, { 'k8s-app': 'kube-dns' }, t));
  const hash = suffix('coredns-template', 10), cp = nodes.find(n => n.control) ?? nodes[0];
  objects.push({ apiVersion: 'apps/v1', kind: 'Deployment', metadata: { creationTimestamp: stamp(t), generation: 1, labels: { 'k8s-app': 'kube-dns' }, name: 'coredns', namespace: 'kube-system', uid: uid('deploy/coredns') },
    spec: { replicas: 2, selector: { matchLabels: { 'k8s-app': 'kube-dns' } }, template: { metadata: { labels: { 'k8s-app': 'kube-dns' } }, spec: { containers: [{ image: IMAGES.coredns, name: 'coredns' }] } } },
    status: { availableReplicas: 2, observedGeneration: 1, readyReplicas: 2, replicas: 2, updatedReplicas: 2 } });
  objects.push({ apiVersion: 'apps/v1', kind: 'DaemonSet', metadata: { creationTimestamp: stamp(t), generation: 1, labels: { 'k8s-app': 'kube-proxy' }, name: 'kube-proxy', namespace: 'kube-system', uid: uid('ds/kube-proxy') },
    spec: { selector: { matchLabels: { 'k8s-app': 'kube-proxy' } }, template: { metadata: { labels: { 'k8s-app': 'kube-proxy' } }, spec: { containers: [{ image: IMAGES.proxy, name: 'kube-proxy' }], nodeSelector: { 'kubernetes.io/os': 'linux' } } } },
    status: { currentNumberScheduled: nodes.length, desiredNumberScheduled: nodes.length, numberAvailable: nodes.length, numberReady: nodes.length, updatedNumberScheduled: nodes.length, observedGeneration: 1 } });
  const nodeOwner = (n: KubeNode): JObj => ({ apiVersion: 'v1', controller: true, kind: 'Node', name: n.name, uid: uid(`node/${n.name}`) });
  const pods: SysPod[] = [
    { name: `etcd-${cp.name}`, image: IMAGES.etcd, labels: { component: 'etcd', tier: 'control-plane' }, node: cp, ip: cp.address, requests: { cpu: '100m', memory: '100Mi' }, owner: nodeOwner(cp), host: true },
    { name: `kube-apiserver-${cp.name}`, image: IMAGES.apiserver, labels: { component: 'kube-apiserver', tier: 'control-plane' }, node: cp, ip: cp.address, requests: { cpu: '250m' }, owner: nodeOwner(cp), host: true },
    { name: `kube-controller-manager-${cp.name}`, image: IMAGES.cm, labels: { component: 'kube-controller-manager', tier: 'control-plane' }, node: cp, ip: cp.address, requests: { cpu: '200m' }, owner: nodeOwner(cp), host: true },
    { name: `kube-scheduler-${cp.name}`, image: IMAGES.scheduler, labels: { component: 'kube-scheduler', tier: 'control-plane' }, node: cp, ip: cp.address, requests: { cpu: '100m' }, owner: nodeOwner(cp), host: true },
    ...[2, 3].map(n => ({ name: `coredns-${hash}-${suffix(`coredns/${n}`)}`, image: IMAGES.coredns, labels: { 'k8s-app': 'kube-dns', 'pod-template-hash': hash }, node: cp, ip: `10.244.0.${n}`,
      requests: { cpu: '100m', memory: '70Mi' }, limits: { memory: '170Mi' }, owner: { apiVersion: 'apps/v1', blockOwnerDeletion: true, controller: true, kind: 'ReplicaSet', name: `coredns-${hash}`, uid: uid('rs/coredns') }, tolerate: true as const })),
    ...nodes.map(n => ({ name: `kube-proxy-${suffix(`proxy/${n.name}`)}`, image: IMAGES.proxy, labels: { 'controller-revision-hash': suffix('proxy-rev', 10), 'k8s-app': 'kube-proxy', 'pod-template-generation': '1' }, node: n, ip: n.address,
      owner: { apiVersion: 'apps/v1', blockOwnerDeletion: true, controller: true, kind: 'DaemonSet', name: 'kube-proxy', uid: uid('ds/kube-proxy') }, host: true as const })),
  ];
  const sims: Record<string, PodSim> = {};
  for (const p of pods) { const r = sysPod(p, t); objects.push(r.pod); sims[String((r.pod.metadata as JObj).uid)] = r.sim; }
  const cache = Object.fromEntries(nodes.map(n => [n.name, n.control ? [...SYSTEM_IMAGES] : [IMAGES.proxy, IMAGES.pause]]));
  return { objects, pods: sims, cache };
}

const data = (text: string) => base64(new TextEncoder().encode(`${text}\n`));
/** kubeadm's admin.conf for the learner (the data fields are the simulation's text, not certificates). */
export function kubeconfigText(namespace?: string): string {
  return ['apiVersion: v1', 'clusters:', '- cluster:', `    certificate-authority-data: ${data('logic-island simulated cluster CA (not a real certificate)')}`, `    server: ${API_SERVER}`, `  name: ${CLUSTER_NAME}`,
    'contexts:', '- context:', `    cluster: ${CLUSTER_NAME}`, ...namespace ? [`    namespace: ${namespace}`] : [], `    user: ${ADMIN_USER}`, `  name: ${ADMIN_CONTEXT}`, `current-context: ${ADMIN_CONTEXT}`,
    'kind: Config', 'preferences: {}', 'users:', `- name: ${ADMIN_USER}`, '  user:', `    client-certificate-data: ${data('logic-island simulated admin certificate (not a real certificate)')}`,
    `    client-key-data: ${data('logic-island simulated admin key (not a real key)')}`, ''].join('\n');
}
