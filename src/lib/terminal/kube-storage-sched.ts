import type { Seconds } from './clock';
import { about, put, record } from './kube-api';
import { matchVolume, syncClaim } from './kube-storage-ctl';
import {
  affinityAllows, attachable, boundVolume, claimClass, claimsOf, findIn, modesOf, NO_PROVISIONER, SELECTED_NODE, storageObjects, WAIT,
} from './kube-storage-model';
import { kindOf, meta, nameOf, nsOf, obj, str, uidOf, type JObj, type KubeNode, type KubeState, type PodSim } from './kube-model';

/*
 * Engine stage E38 (docs/curriculum/KUB0_E38_KUBE_STORAGE.md §4–§5): the scheduler's volume plugins and the
 * attach/detach controller. Before any node is tried, a pod whose claim is missing, being deleted or not bound (an
 * Immediate class) cannot be scheduled at all; then a node fails on a volume's node affinity, a ReadWriteOncePod claim
 * another pod uses, or (WaitForFirstConsumer) no volume it could bind there. Once a node is picked, the pod's delayed
 * claims are bound or provisioned for it (volume.kubernetes.io/selected-node). On the node, an attachable volume (a CSI
 * network disk) that only one node may use waits with the Multi-Attach error while a pod on another node has it.
 */

export type NodeFit = { reason: string; preempt: string } | null;
const NOT_HELPFUL = 'Preemption is not helpful for scheduling';
const claimOf = (k: KubeState, pod: JObj, name: string, t: Seconds) => storageObjects(k, 'PersistentVolumeClaim', t).find(c => nsOf(c) === nsOf(pod) && nameOf(c) === name);
const delayed = (k: KubeState, pvc: JObj, t: Seconds) => {
  const sc = storageObjects(k, 'StorageClass', t).find(c => nameOf(c) === claimClass(pvc));
  return !!sc && str(sc.volumeBindingMode) === 'WaitForFirstConsumer' ? sc : undefined;
};
const bound = (pvc: JObj) => str(obj(pvc.status).phase) === 'Bound';

/** What the pod's volumes ask of scheduling: nothing (null), a reason no node will do, or a filter of each node. */
export function volumeNeeds(k: KubeState, pod: JObj, t: Seconds): { message: string } | { fits: (n: KubeNode) => NodeFit } | null {
  const claims = claimsOf(pod);
  if (!claims.length) return null;
  const pvcs: JObj[] = [];
  for (const c of claims) {
    const pvc = claimOf(k, pod, c.claim, t);
    if (!pvc) return { message: `persistentvolumeclaim "${c.claim}" not found` };
    if (meta(pvc).deletionTimestamp) return { message: `persistentvolumeclaim "${c.claim}" is being deleted` };
    pvcs.push(pvc);
  }
  if (pvcs.some(p => !bound(p) && !delayed(k, p, t))) return { message: 'pod has unbound immediate PersistentVolumeClaims' };
  return { fits: (n: KubeNode) => {
    for (const pvc of pvcs) {
      const pv = bound(pvc) ? boundVolume(k, pvc) : undefined;
      if (pv && !affinityAllows(pv, n.labels)) return { reason: 'node(s) had volume node affinity conflict', preempt: NOT_HELPFUL };
      if (modesOf(pvc).includes('ReadWriteOncePod') && usedElsewhere(k, pod, pvc)) return { reason: 'node has pod using PersistentVolumeClaim with the same name and ReadWriteOncePod access mode', preempt: 'No preemption victims found for incoming pod' };
      const sc = bound(pvc) ? undefined : delayed(k, pvc, t);
      if (sc && !matchVolume(k, pvc, t, n) && str(sc.provisioner) === NO_PROVISIONER) return { reason: "node(s) didn't find available persistent volumes to bind", preempt: NOT_HELPFUL };
    }
    return null;
  } };
}
const usedElsewhere = (k: KubeState, pod: JObj, pvc: JObj) =>
  k.objects.some(o => kindOf(o) === 'Pod' && uidOf(o) !== uidOf(pod) && nsOf(o) === nsOf(pvc) && !!k.pods[uidOf(o)] && claimsOf(o).some(c => c.claim === nameOf(pvc)));

/** The node is picked: the pod's delayed claims are bound or provisioned there (wait: one still is not, so the pod is not bound yet). */
export function claimNode(k0: KubeState, pod: JObj, node: KubeNode, t: Seconds): { k: KubeState; wait: boolean } {
  let k = k0, wait = false;
  for (const c of claimsOf(pod)) {
    let pvc = claimOf(k, pod, c.claim, t);
    if (!pvc || bound(pvc) || !delayed(k, pvc, t)) continue;
    if (!matchVolume(k, pvc, t, node) && str(obj(meta(pvc).annotations)[SELECTED_NODE]) !== node.name) {
      k = put(k, { ...pvc, metadata: { ...meta(pvc), annotations: { ...obj(meta(pvc).annotations), [SELECTED_NODE]: node.name } } });
      pvc = findIn(k, 'PersistentVolumeClaim', nsOf(pvc), nameOf(pvc))!;
    }
    k = syncClaim(k, pvc, t, node.name);
    if (!bound(findIn(k, 'PersistentVolumeClaim', nsOf(pvc), nameOf(pvc))!)) wait = true;
  }
  return { k, wait };
}

/** The pods on other nodes that have the PV attached (an attachable volume only one node may use). */
function holders(k: KubeState, pod: JObj, node: string, pv: JObj): JObj[] {
  if (!attachable(pv) || modesOf(pv).some(m => m === 'ReadWriteMany' || m === 'ReadOnlyMany')) return [];
  return k.objects.filter(o => {
    const sim = kindOf(o) === 'Pod' && uidOf(o) !== uidOf(pod) ? k.pods[uidOf(o)] : undefined;
    return !!sim && sim.node !== node && sim.mount?.next !== WAIT && claimsOf(o).some(c => { const p = claimOf(k, o, c.claim, Infinity); return !!p && str(obj(p.spec).volumeName) === nameOf(pv); });
  });
}
/** Whether a pod's volumes still cannot be attached on its node (a claim not bound, or Multi-Attach). */
export function attachBlocked(k: KubeState, pod: JObj, node: string): boolean {
  return claimsOf(pod).some(c => { const pvc = claimOf(k, pod, c.claim, Infinity), pv = pvc ? boundVolume(k, pvc) : undefined; return !pv || holders(k, pod, node, pv).length > 0; });
}
/** The attach/detach controller for a pod on its node at t: attached (SuccessfulAttachVolume), or waiting (Multi-Attach error). */
export function attachVolumes(k0: KubeState, pod: JObj, sim: PodSim, t: Seconds): { k: KubeState; wait: boolean } {
  let k = k0, wait = false;
  const once = (reason: string, type: 'Normal' | 'Warning', msg: string) => { if (!k.events.some(e => e.uid === uidOf(pod) && e.reason === reason && e.message === msg)) k = record(k, t, about(pod), type, reason, msg, 'attachdetach-controller'); };
  for (const c of claimsOf(pod)) {
    const pvc = claimOf(k, pod, c.claim, Infinity), pv = pvc ? boundVolume(k, pvc) : undefined;
    if (!pv) { wait = true; continue; }
    const others = holders(k, pod, sim.node, pv);
    if (others.length) {
      const local = others.filter(o => nsOf(o) === nsOf(pod)).map(nameOf), away = others.length - local.length;
      const who = local.length ? `Volume is already used by pod(s) ${local.join(', ')}${away ? ` and ${away} pod(s) in different namespaces` : ''}` : `Volume is already used by ${away} pod(s) in different namespaces`;
      once('FailedAttachVolume', 'Warning', `Multi-Attach error for volume "${nameOf(pv)}" ${who}`);
      wait = true;
      continue;
    }
    // A network disk is attached to the node once (another pod there already has it: nothing to attach).
    const there = k.objects.some(o => kindOf(o) === 'Pod' && uidOf(o) !== uidOf(pod) && k.pods[uidOf(o)]?.node === sim.node && k.pods[uidOf(o)]?.mount?.next !== WAIT
      && claimsOf(o).some(x => str(obj(claimOf(k, o, x.claim, Infinity)?.spec).volumeName) === nameOf(pv)));
    if (attachable(pv) && !there) once('SuccessfulAttachVolume', 'Normal', `AttachVolume.Attach succeeded for volume "${nameOf(pv)}"`);
  }
  return { k, wait };
}
