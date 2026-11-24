import { arr, kindOf, nameOf, obj, str, type J, type JObj, type KubeNode, type KubeState, type Taint } from './kube-model';
import { podRequests } from './kube-api';

/*
 * Engine stage E32 (docs/curriculum/KUB0_E32_CLUSTER.md §5): the scheduler. The filters run in kube-scheduler's order and
 * a node fails at the first one: TaintToleration (a NoSchedule or NoExecute taint the pod does not tolerate), NodeAffinity
 * (nodeSelector), NodeResourcesFit (Too many pods, Insufficient cpu, Insufficient memory: the requests of the pods bound
 * there, limits standing in for missing requests). Among the nodes left the highest LeastAllocated score wins (requests
 * with the scheduler's non-zero defaults, 100m and 200Mi), ties broken by the node's name: real kube-scheduler adds more
 * scores and breaks ties at random. Without a node, FailedScheduling says why with the real message and its preemption
 * suffix. A pod with spec.nodeName is not scheduled: the kubelet of that node runs it.
 */

export const UNSCHEDULABLE: Taint = { key: 'node.kubernetes.io/unschedulable', effect: 'NoSchedule' };
/** Whether one toleration tolerates the taint. */
export function tolerates(t0: J, taint: Taint): boolean {
  const t = obj(t0), key = str(t.key) ?? '', op = str(t.operator) ?? 'Equal', effect = str(t.effect) ?? '';
  if (effect && effect !== taint.effect) return false;
  if (!key) return op === 'Exists';
  if (key !== taint.key) return false;
  return op === 'Exists' || (str(t.value) ?? '') === (taint.value ?? '');
}
export const untolerated = (pod: JObj, node: KubeNode) =>
  node.taints.find(x => x.effect !== 'PreferNoSchedule' && !arr(obj(pod.spec).tolerations).some(t => tolerates(t, x)));
const selects = (pod: JObj, node: KubeNode) => Object.entries(obj(obj(pod.spec).nodeSelector)).every(([k, v]) => node.labels[k] === v);

/** The pods that take a node's resources: bound to it and not finished. */
export function podsOnNode(k: KubeState, node: string): JObj[] {
  return k.objects.filter(o => kindOf(o) === 'Pod' && k.pods[str(obj(o.metadata).uid) ?? '']?.node === node && !['Succeeded', 'Failed'].includes(str(obj(o.status).phase) ?? ''));
}
export function usedOn(k: KubeState, node: string, nonzero = false) {
  return podsOnNode(k, node).map(p => podRequests(p, nonzero)).reduce((a, b) => ({ cpu: a.cpu + b.cpu, memory: a.memory + b.memory }), { cpu: 0, memory: 0 });
}

type Why = 'taint' | 'selector' | 'pods' | 'cpu' | 'memory';
const REASON: Record<Exclude<Why, 'taint'>, string> = { selector: "node(s) didn't match Pod's node affinity/selector", pods: 'Too many pods', cpu: 'Insufficient cpu', memory: 'Insufficient memory' };

/** Where the scheduler binds the pod, or the FailedScheduling message. */
export function schedule(k: KubeState, pod: JObj): { node: KubeNode } | { message: string } {
  const want = podRequests(pod), counts = new Map<string, number>(), preempt = new Map<string, number>();
  const add = (m: Map<string, number>, r: string) => m.set(r, (m.get(r) ?? 0) + 1);
  const fits: KubeNode[] = [];
  for (const n of k.nodes) {
    // E34: NodeUnschedulable runs first — a cordoned node takes only pods that tolerate node.kubernetes.io/unschedulable.
    if (n.unschedulable && !arr(obj(pod.spec).tolerations).some(t => tolerates(t, UNSCHEDULABLE))) { add(counts, 'node(s) were unschedulable'); add(preempt, 'Preemption is not helpful for scheduling'); continue; }
    const taint = untolerated(pod, n);
    if (taint) { add(counts, `node(s) had untolerated taint {${taint.key}: ${taint.value ?? ''}}`); add(preempt, 'Preemption is not helpful for scheduling'); continue; }
    if (!selects(pod, n)) { add(counts, REASON.selector); add(preempt, 'Preemption is not helpful for scheduling'); continue; }
    const used = usedOn(k, n.name), whys: Why[] = [];
    if (podsOnNode(k, n.name).length + 1 > n.pods) whys.push('pods');
    if (used.cpu + want.cpu > n.cpu) whys.push('cpu');
    if (used.memory + want.memory > n.memory) whys.push('memory');
    if (whys.length) { for (const w of whys) add(counts, REASON[w as Exclude<Why, 'taint'>]); add(preempt, 'No preemption victims found for incoming pod'); continue; }
    fits.push(n);
  }
  if (!fits.length) {
    const total = k.nodes.length, list = (m: Map<string, number>) => [...m].map(([r, c]) => `${c} ${r}`).sort().join(', ');
    if (!total) return { message: 'no nodes available to schedule pods' };
    return { message: `0/${total} nodes are available: ${list(counts)}. preemption: 0/${total} nodes are available: ${list(preempt)}.` };
  }
  const nz = podRequests(pod, true);
  const score = (n: KubeNode) => {
    const u = usedOn(k, n.name, true);
    const part = (alloc: number, used: number) => alloc > 0 ? Math.max(0, Math.floor((alloc - used) * 100 / alloc)) : 0;
    return Math.floor((part(n.cpu, u.cpu + nz.cpu) + part(n.memory, u.memory + nz.memory)) / 2);
  };
  const best = [...fits].sort((a, b) => score(b) - score(a) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))[0];
  return { node: best };
}

/** The lowest free pod address of the node's CIDR (from .2; host-network pods use the node's own address). */
export function freeIp(k: KubeState, node: KubeNode): string {
  const base = node.cidr.replace(/\.0\/24$/, '');
  const taken = new Set(Object.values(k.pods).filter(p => p.node === node.name).map(p => p.ip));
  for (let i = 2; i < 255; i++) if (!taken.has(`${base}.${i}`)) return `${base}.${i}`;
  return `${base}.254`;
}
export const nodeNamed = (k: KubeState, name: string) => k.nodes.find(n => n.name === name);
export const podName = (pod: JObj) => `${str(obj(pod.metadata).namespace) ?? 'default'}/${nameOf(pod)}`;
