import type { Seconds } from './clock';
import type { DockerState } from './docker';
import { about, created, put, record, remove } from './kube-api';
import { readyOf } from './kube-probes';
import { phaseOf } from './kube-status';
import { beginDelete } from './kube-stop';
import { markDeleting } from './kube-storage-model';
import { selectorMatches, replicasOf } from './kube-workload-spec';
import {
  arr, changed, clone, createdOf, systemNs, KUBE_LIMITS, kindOf, labelsOf, meta, nameOf, nsOf, obj, sameJ, stamp, str, suffix, uidOf,
  type J, type JObj, type KubeState,
} from './kube-model';

/*
 * Engine stage E34 (docs/curriculum/KUB0_E34_WORKLOADS.md §3): the ReplicaSet controller and the garbage collector. A
 * ReplicaSet claims its pods — it adopts an orphan whose labels its selector matches (an ownerReference with controller:
 * true) and releases an owned pod whose labels no longer match — then creates or deletes pods until the active ones
 * (not being deleted, not Succeeded or Failed) are spec.replicas. It deletes in the real ranking: unscheduled before
 * scheduled, Pending before Running, not ready before ready, more restarts first, newer first (ties: name). Its status
 * counts the active, fully labeled, ready and available (ready for minReadySeconds) pods. The garbage collector deletes
 * an object every owner of which is gone (background cascade); kube-system is the system's and is left alone.
 */

/** What the controllers see of a pod at t (a pod on a node marked NotReady is not ready from then on). */
export interface PodFacts { pod: JObj; ready: boolean; since: Seconds; phase: string; deleting: boolean; node?: string; restarts: number; created: Seconds }
export function podFacts(k: KubeState, pod: JObj, t: Seconds): PodFacts {
  const sim = k.pods[uidOf(pod)], phase = sim ? phaseOf(sim, str(obj(pod.spec).restartPolicy) ?? 'Always') : 'Pending';
  const lost = sim ? k.down?.[sim.node] : undefined, isLost = lost !== undefined && lost <= t;
  const since = isLost ? lost : sim ? Math.max(sim.bound, ...[...sim.init, ...sim.main].flatMap(c => [c.started ?? 0, c.finished ?? 0, c.probe?.changed ?? 0])) : createdOf(pod) ?? t;
  return { pod, phase, since, deleting: !!meta(pod).deletionTimestamp, node: sim?.node, created: createdOf(pod) ?? t,
    ready: !!sim && !isLost && phase === 'Running' && sim.main.every(readyOf), restarts: Math.max(0, ...(sim?.main ?? []).map(c => c.restarts)) };
}
export const isActive = (f: PodFacts) => !f.deleting && f.phase !== 'Succeeded' && f.phase !== 'Failed';
export const isAvailable = (f: PodFacts, minReady: number, t: Seconds) => f.ready && f.since + minReady <= t;

const PHASE_RANK: Record<string, number> = { Pending: 0, Unknown: 1, Running: 2 };
/** ActivePodsWithRanks: the pod to delete first sorts first. */
export function rankForDeletion(a: PodFacts, b: PodFacts): number {
  if (!a.node !== !b.node) return a.node ? 1 : -1;
  const pa = PHASE_RANK[a.phase] ?? 3, pb = PHASE_RANK[b.phase] ?? 3;
  if (pa !== pb) return pa - pb;
  if (a.ready !== b.ready) return a.ready ? 1 : -1;
  if (a.restarts !== b.restarts) return b.restarts - a.restarts;
  if (a.created !== b.created) return b.created - a.created;
  return nameOf(a.pod) < nameOf(b.pod) ? -1 : nameOf(a.pod) > nameOf(b.pod) ? 1 : 0;
}

/** The controller ownerReference of an object (or undefined). */
export const controllerOf = (o: JObj) => arr(meta(o).ownerReferences).map(obj).find(r => r.controller === true);
export const ownerRef = (o: JObj): J => ({ apiVersion: 'apps/v1', blockOwnerDeletion: true, controller: true, kind: kindOf(o), name: nameOf(o), uid: uidOf(o) });
const withOwners = (o: JObj, refs: J[]): JObj => { const m: JObj = { ...meta(o) }; if (refs.length) m.ownerReferences = refs; else delete m.ownerReferences; return { ...o, metadata: m }; };
/** The objects of a namespace the controllers see at t (what existed then). */
export const visible = (k: KubeState, kind: string, ns: string | undefined, t: Seconds) =>
  k.objects.filter(o => kindOf(o) === kind && (ns === undefined || nsOf(o) === ns) && !systemNs(k, nsOf(o)) && (createdOf(o) ?? 0) <= t);
export const ownedBy = (k: KubeState, owner: JObj, kind: string, t: Seconds) => visible(k, kind, nsOf(owner), t).filter(o => str(controllerOf(o)?.uid) === uidOf(owner));

/** kubectl delete --cascade=orphan: the dependents of the object lose their ownerReference to it. */
export function orphan(k0: KubeState, owner: JObj): KubeState {
  let k = k0;
  for (const o of k0.objects) { const refs = arr(meta(o).ownerReferences); if (refs.some(r => str(obj(r).uid) === uidOf(owner))) k = put(k, withOwners(o, refs.filter(r => str(obj(r).uid) !== uidOf(owner)))); }
  return k;
}
/** Ends a pod the way the API server and kubelet do (graceful; on a node marked NotReady it stays Terminating). */
export function endPod(d: DockerState | undefined, k: KubeState, pod: JObj, t: Seconds): KubeState {
  if (meta(pod).deletionTimestamp) return k;
  const grace = Number(obj(pod.spec).terminationGracePeriodSeconds ?? 30), node = k.pods[uidOf(pod)]?.node;
  if (node && k.down?.[node] !== undefined) return put(k, { ...pod, metadata: { ...meta(pod), deletionGracePeriodSeconds: grace, deletionTimestamp: stamp(t + grace) } });
  return beginDelete(d, k, pod, grace, t).k;
}

function newPod(k0: KubeState, rs: JObj, t: Seconds): KubeState {
  const ns = nsOf(rs) ?? 'default', tpl = obj(obj(rs.spec).template), tm = obj(tpl.metadata), base = `${nameOf(rs)}-`;
  let name = '';
  for (let n = 1; !name || k0.objects.some(o => kindOf(o) === 'Pod' && nsOf(o) === ns && nameOf(o) === name); n++) name = `${base}${suffix(`${nameOf(rs)}/${k0.seq + n}`)}`;
  const doc: JObj = { apiVersion: 'v1', kind: 'Pod', metadata: { generateName: base, ...tm.annotations ? { annotations: clone(tm.annotations) } : {}, labels: { ...obj(tm.labels) }, name, ownerReferences: [ownerRef(rs)] }, spec: clone(obj(tpl.spec)) };
  const r = created(k0, doc, ns, t);
  return record(put(r.k, r.o), t, about(rs), 'Normal', 'SuccessfulCreate', `Created pod: ${name}`, 'replicaset-controller');
}

/** One sync of a ReplicaSet at t: claim, create or delete, status. */
export function syncReplicaSet(d: DockerState | undefined, k0: KubeState, rs0: JObj, t: Seconds): KubeState {
  let k = k0;
  const id = uidOf(rs0), sel = obj(rs0.spec).selector, gone = !!meta(rs0).deletionTimestamp;
  for (const pod of visible(k, 'Pod', nsOf(rs0), t)) {
    const ctl = controllerOf(pod), fits = selectorMatches(sel, labelsOf(pod)), refs = arr(meta(pod).ownerReferences);
    if (str(ctl?.uid) === id && !fits) k = put(k, withOwners(pod, refs.filter(r => str(obj(r).uid) !== id)));
    else if (!ctl && fits && !gone && !meta(pod).deletionTimestamp) k = put(k, withOwners(pod, [...refs, ownerRef(rs0)]));
  }
  const rs = k.objects.find(o => uidOf(o) === id) ?? rs0, want = replicasOf(rs);
  let facts = ownedBy(k, rs, 'Pod', t).map(p => podFacts(k, p, t)).filter(isActive);
  if (facts.length < want) {
    const room = KUBE_LIMITS.pods - k.objects.filter(o => kindOf(o) === 'Pod' && !systemNs(k, nsOf(o))).length;
    for (let n = 0; n < Math.min(want - facts.length, Math.max(0, room)); n++) k = newPod(k, rs, t);
    if (room < want - facts.length && !k.events.some(e => e.uid === id && e.reason === 'FailedCreate' && e.last === t))
      k = record(k, t, about(rs), 'Warning', 'FailedCreate', `Error creating: （模擬環境：叢集最多 ${KUBE_LIMITS.pods} 個 Pod）`, 'replicaset-controller');
  } else if (facts.length > want) {
    for (const f of [...facts].sort(rankForDeletion).slice(0, facts.length - want)) {
      const live = k.objects.find(o => uidOf(o) === uidOf(f.pod));
      if (!live) continue;
      k = record(endPod(d, k, live, t), t, about(rs), 'Normal', 'SuccessfulDelete', `Deleted pod: ${nameOf(f.pod)}`, 'replicaset-controller');
    }
  }
  facts = ownedBy(k, rs, 'Pod', t).map(p => podFacts(k, p, t)).filter(isActive);
  const minReady = Number(obj(rs.spec).minReadySeconds ?? 0), tl = labelsOf({ metadata: obj(obj(obj(rs.spec).template).metadata) });
  const status: JObj = {
    availableReplicas: facts.filter(f => isAvailable(f, minReady, t)).length,
    fullyLabeledReplicas: facts.filter(f => Object.entries(tl).every(([a, b]) => labelsOf(f.pod)[a] === b)).length,
    observedGeneration: Number(meta(rs).generation ?? 1), readyReplicas: facts.filter(f => f.ready).length, replicas: facts.length,
  };
  for (const key of ['availableReplicas', 'readyReplicas', 'fullyLabeledReplicas'] as const) if (status[key] === 0) delete status[key];
  return sameJ(rs.status, status) ? k : put(k, { ...rs, status });
}

/** The garbage collector (background cascade): an object whose owners are all gone is deleted. */
export function collectGarbage(d: DockerState | undefined, k0: KubeState, t: Seconds): KubeState {
  let k = k0;
  const uids = new Set(k0.objects.map(uidOf));
  for (const o of k0.objects) {
    const refs = arr(meta(o).ownerReferences).map(obj);
    if (systemNs(k0, nsOf(o)) || !refs.length || refs.some(r => uids.has(str(r.uid) ?? ''))) continue;
    const live = k.objects.find(x => uidOf(x) === uidOf(o));
    if (!live) continue;
    // E38: a claim (a StatefulSet's whenDeleted or whenScaled: Delete) is deleted through its protection finalizer.
    k = kindOf(o) === 'Pod' ? endPod(d, k, live, t) : k.storage && kindOf(o) === 'PersistentVolumeClaim' ? markDeleting(k, live, t) : changed(remove(k, live), t);
  }
  return k;
}
