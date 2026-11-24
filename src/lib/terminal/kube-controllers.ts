import type { Seconds } from './clock';
import type { DockerState } from './docker';
import { about, put, record } from './kube-api';
import { collectGarbage, endPod, isAvailable, ownedBy, podFacts, syncReplicaSet, visible } from './kube-replicaset';
import { deadlineOf, syncDeployment } from './kube-deployment';
import { syncStatefulSet } from './kube-statefulset';
import { syncStorage } from './kube-storage-ctl';
import { STORAGE_KINDS } from './kube-storage-model';
import { tolerates } from './kube-sched';
import { hpaTimes, syncHpas } from './kube-hpa';
import { DESIRED, HASH, MAX_REPLICAS, REVISION } from './kube-workload-spec';
import { arr, clone, createdOf, systemNs, kindOf, meta, nameOf, nsOf, obj, stamp, str, uid, uidOf, type J, type JObj, type KubeState, type Taint } from './kube-model';

/*
 * Engine stage E34 (docs/curriculum/KUB0_E34_WORKLOADS.md §5): when the controllers run. They run at a time t after a
 * step changed what they watch (a pod's readiness, phase, deletion or existence), when a command changed the cluster
 * (dirty), when a boot manifest's object appears, when a pod becomes available (minReadySeconds), when a rollout's
 * progress deadline passes, and at the node lifecycle's times: a lesson-declared failure at T stops that node's kubelet,
 * the node is NotReady (Unknown) at T + 50 s with the unreachable taints, and its pods are evicted when their
 * not-ready/unreachable toleration (300 s by default) runs out — they stay Terminating, as no kubelet confirms. Each run
 * repeats garbage collection, the ReplicaSet syncs and the Deployment syncs until nothing changes.
 */

/** kube-controller-manager's --node-monitor-grace-period (v1.32: 50 s). */
export const NODE_GRACE = 50;
const UNREACHABLE = 'node.kubernetes.io/unreachable';
/** When a node's kubelet stops (the lesson's failure), or undefined. */
export const deadAt = (k: KubeState, node: string) => k.failures?.find(f => f.node === node)?.at;

/** When the pod is evicted from a NotReady node (its NoExecute toleration of unreachable; none: at once; no seconds: never). */
function evictAt(pod: JObj, notReady: Seconds): Seconds | undefined {
  const taint: Taint = { key: UNREACHABLE, effect: 'NoExecute' }, tol = arr(obj(pod.spec).tolerations).map(obj).find(x => tolerates(x, taint));
  if (!tol) return notReady;
  return typeof tol.tolerationSeconds === 'number' ? notReady + Math.max(0, tol.tolerationSeconds) : undefined;
}
const onDownNode = (k: KubeState) => k.objects.filter(o => kindOf(o) === 'Pod' && !systemNs(k, nsOf(o)) && !meta(o).deletionTimestamp && k.down?.[k.pods[uidOf(o)]?.node ?? ''] !== undefined);

/** The node lifecycle controller at t: failed nodes become NotReady (taints, events), their pods are evicted when due. */
function nodeLifecycle(d: DockerState | undefined, k0: KubeState, t: Seconds): KubeState {
  let k = k0;
  for (const f of k.failures ?? []) {
    const at = f.at + NODE_GRACE;
    if (at > t || k.down?.[f.node] !== undefined) continue;
    const add: Taint[] = [{ key: UNREACHABLE, effect: 'NoSchedule' }, { key: UNREACHABLE, effect: 'NoExecute' }];
    k = { ...k, rv: k.rv + 1, down: { ...k.down, [f.node]: at }, nodes: k.nodes.map(n => n.name === f.node ? { ...n, taints: [...n.taints, ...add.filter(a => !n.taints.some(x => x.key === a.key && x.effect === a.effect))] } : n) };
    k = record(k, at, { kind: 'Node', name: f.node, ns: 'default', uid: `node/${f.node}` }, 'Normal', 'NodeNotReady', `Node ${f.node} status is now: NodeNotReady`, 'node-controller');
    for (const pod of onDownNode(k).filter(p => k.pods[uidOf(p)]?.node === f.node)) k = record(k, at, about(pod), 'Warning', 'NodeNotReady', 'Node is not ready', 'node-controller');
  }
  for (const pod of onDownNode(k)) {
    const when = evictAt(pod, k.down![k.pods[uidOf(pod)].node]);
    if (when === undefined || when > t) continue;
    k = record(k, when, about(pod), 'Normal', 'TaintManagerEviction', `Marking for deletion Pod ${nsOf(pod) ?? 'default'}/${nameOf(pod)}`, 'taint-eviction-controller');
    k = endPod(d, k, k.objects.find(o => uidOf(o) === uidOf(pod))!, when);
  }
  return k;
}

/** The controllers at t, until nothing changes (garbage collection, ReplicaSets, Deployments). */
export function runControllers(d: DockerState | undefined, k0: KubeState, t: Seconds): KubeState {
  let k = nodeLifecycle(d, k0, t);
  // E40: the HPAs due now scale their targets first (the workload controllers below take it from there).
  if (k.autoscale) k = syncHpas(d, k, t);
  for (let i = 0; i < 8; i++) {
    const before = k;
    k = collectGarbage(d, k, t);
    for (const rs of visible(k, 'ReplicaSet', undefined, t)) { const live = k.objects.find(o => uidOf(o) === uidOf(rs)); if (live && !meta(live).deletionTimestamp) k = syncReplicaSet(d, k, live, t); }
    for (const dep of visible(k, 'Deployment', undefined, t)) { const live = k.objects.find(o => uidOf(o) === uidOf(dep)); if (live) k = syncDeployment(k, live, t); }
    // E38: the StatefulSet controller, then the PersistentVolume controller (and the attach/detach retries).
    if (k.storage) {
      for (const set of visible(k, 'StatefulSet', undefined, t)) { const live = k.objects.find(o => uidOf(o) === uidOf(set)); if (live) k = syncStatefulSet(d, k, live, t); }
      k = syncStorage(k, t);
    }
    if (k === before) break;
  }
  return { ...k, ctrl: t, dirty: k.dirty !== undefined && k.dirty <= t ? undefined : k.dirty };
}

/** The times the controllers must run at (after the last run): see the comment above. */
export function controllerTimes(k: KubeState): Seconds[] {
  const after = k.ctrl ?? -Infinity, out: Seconds[] = [];
  if (k.dirty !== undefined) out.push(k.dirty);
  for (const o of k.objects) {
    if (systemNs(k, nsOf(o))) continue;
    const kind = kindOf(o), c = createdOf(o) ?? 0;
    if ((kind === 'Deployment' || kind === 'ReplicaSet' || kind === 'Pod' || (k.storage && STORAGE_KINDS.includes(kind))) && c > after) out.push(c);
    if (kind === 'Deployment') { const at = deadlineOf(o); if (at !== undefined && at > after) out.push(at); }
    if (kind === 'ReplicaSet') {
      const min = Number(obj(o.spec).minReadySeconds ?? 0);
      if (min > 0) for (const p of ownedBy(k, o, 'Pod', Infinity)) { const f = podFacts(k, p, Infinity); if (f.ready && f.since + min > after && !isAvailable(f, min, after)) out.push(f.since + min); }
    }
  }
  for (const f of k.failures ?? []) if (k.down?.[f.node] === undefined) out.push(f.at + NODE_GRACE);
  // E40: each HPA's next sync (every 15 s).
  if (k.autoscale) out.push(...hpaTimes(k));
  for (const pod of onDownNode(k)) { const at = evictAt(pod, k.down![k.pods[uidOf(pod)].node]); if (at !== undefined) out.push(at); }
  return out.filter(t => t > after || t === k.dirty);
}

/** What the controllers watch of the pods (a step that changes it makes them run). */
export function watched(k: KubeState): string {
  return k.objects.filter(o => kindOf(o) === 'Pod' && !systemNs(k, nsOf(o))).map(p => { const f = podFacts(k, p, Infinity); return `${uidOf(p)}:${f.ready ? 1 : 0}${f.phase}${f.deleting ? 'd' : ''}`; }).join(',');
}

/** A pod on a node marked NotReady: its Ready condition is False from then on (the node controller's MarkPodsNotReady). */
export function lostStatus(k: KubeState, pod: JObj, status: JObj): JObj {
  const at = k.down?.[k.pods[uidOf(pod)]?.node ?? ''];
  if (at === undefined) return status;
  const conditions = arr(status.conditions).map(obj).map((c): J => c.type === 'Ready' && c.status === 'True' ? { ...c, lastTransitionTime: stamp(at), status: 'False' } : c);
  return { ...status, conditions };
}

/** E34: kube-system's ReplicaSet of CoreDNS and its Deployment's revision and conditions (shown, never reconciled). */
export function systemWorkloads(k: KubeState): KubeState {
  const dep = k.objects.find(o => kindOf(o) === 'Deployment' && nameOf(o) === 'coredns');
  if (!dep) return k;
  const hash = str(obj(obj(k.objects.find(o => kindOf(o) === 'Pod' && str(obj(meta(o).labels)['k8s-app']) === 'kube-dns')?.metadata).labels)[HASH]) ?? '', t = createdOf(dep) ?? 0;
  const tpl = clone(obj(obj(dep.spec).template)), labels = { ...obj(obj(tpl.metadata).labels), [HASH]: hash };
  const rs: JObj = { apiVersion: 'apps/v1', kind: 'ReplicaSet',
    metadata: { annotations: { [DESIRED]: '2', [MAX_REPLICAS]: '3', [REVISION]: '1' }, creationTimestamp: stamp(t), generation: 1, labels, name: `coredns-${hash}`, namespace: 'kube-system',
      ownerReferences: [{ apiVersion: 'apps/v1', blockOwnerDeletion: true, controller: true, kind: 'Deployment', name: 'coredns', uid: uidOf(dep) }], uid: uid('rs/coredns') },
    spec: { replicas: 2, selector: { matchLabels: labels }, template: { ...tpl, metadata: { ...obj(tpl.metadata), labels } } },
    status: { availableReplicas: 2, fullyLabeledReplicas: 2, observedGeneration: 1, readyReplicas: 2, replicas: 2 } };
  const cond = (type: string, reason: string, message: string): J => ({ lastTransitionTime: stamp(t), lastUpdateTime: stamp(t), message, reason, status: 'True', type });
  const d2: JObj = { ...dep, metadata: { ...meta(dep), annotations: { [REVISION]: '1' } },
    status: { ...obj(dep.status), conditions: [cond('Available', 'MinimumReplicasAvailable', 'Deployment has minimum availability.'), cond('Progressing', 'NewReplicaSetAvailable', `ReplicaSet "coredns-${hash}" has successfully progressed.`)] } };
  return put(put(k, d2), rs);
}
