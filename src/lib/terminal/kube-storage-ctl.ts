import type { Seconds } from './clock';
import { about, created, put, record, remove } from './kube-api';
import { mountPod } from './kube-volumes';
import { attachBlocked } from './kube-storage-sched';
import {
  affinityAllows, claimClass, defaultClassOf, findIn, keysOfVolume, modesOf, NO_PROVISIONER, PV_PROTECTION, SELECTED_NODE, storageObjects, usersOf, volumeClass, WAIT, withData,
} from './kube-storage-model';
import { selectorMatches } from './kube-workload-spec';
import { arr, bytesOf, changed, kindOf, labelsOf, meta, nameOf, nsOf, obj, quantityText, stamp, str, uidOf, type J, type JObj, type KubeState } from './kube-model';

/*
 * Engine stage E38 (docs/curriculum/KUB0_E38_KUBE_STORAGE.md §3): the PersistentVolume controller, run with the other
 * controllers. A pending claim binds to a volume named for it, else the smallest Available volume of its class that has
 * its access modes, capacity, volume mode and selector; without one it is provisioned by its class's provisioner when the
 * lesson runs it (pvc-<claim uid>), or it waits with the real events. WaitForFirstConsumer delays all of that until the
 * scheduler picks a node for a pod of the claim. A claim being deleted goes once no pod uses it; its volume is Released,
 * then Retain keeps it, Delete removes a provisioned one with its data (a static one Fails), Recycle empties it. Claims
 * without a class get the default class when one appears; a bound claim grows when its class allows expansion.
 */

const CTRL = 'persistentvolume-controller';
const bytes = (v: J | undefined) => bytesOf(quantityText(v) ?? '') ?? 0;
const request = (pvc: JObj) => obj(obj(obj(pvc.spec).resources).requests).storage;
const live = (k: KubeState, o: JObj) => k.objects.find(x => uidOf(x) === uidOf(o));
function once(k: KubeState, t: Seconds, o: JObj, type: 'Normal' | 'Warning', reason: string, message: string, source = CTRL): KubeState {
  return k.events.some(e => e.uid === uidOf(o) && e.reason === reason && e.message === message) ? k : record(k, t, about(o), type, reason, message, source);
}
const annotate = (o: JObj, add: Record<string, string>): JObj => ({ ...o, metadata: { ...meta(o), annotations: { ...obj(meta(o).annotations), ...add } } });
/** A volume's new phase (and when it changed); the same phase is no write. */
function phase(k: KubeState, pv: JObj, p: string, t: Seconds, message?: string): KubeState {
  if (str(obj(pv.status).phase) === p && str(obj(pv.status).message) === message) return k;
  return put(k, { ...pv, status: { lastPhaseTransitionTime: stamp(t), ...message ? { message } : {}, phase: p } });
}

/** Whether the volume can serve the claim (on that node, when one was picked). */
function fits(pv: JObj, pvc: JObj, node?: KubeState['nodes'][number]): boolean {
  const s = obj(pv.spec), ref = obj(s.claimRef), want = obj(pvc.spec), modes = modesOf(pv);
  if (meta(pv).deletionTimestamp || (str(ref.name) && !(str(ref.name) === nameOf(pvc) && str(ref.namespace) === nsOf(pvc) && (!str(ref.uid) || str(ref.uid) === uidOf(pvc))))) return false;
  if (volumeClass(pv) !== (claimClass(pvc) ?? '') || !modesOf(pvc).every(m => modes.includes(m)) || bytes(obj(s.capacity).storage) < bytes(request(pvc))) return false;
  if ((str(s.volumeMode) ?? 'Filesystem') !== (str(want.volumeMode) ?? 'Filesystem')) return false;
  if (want.selector && !selectorMatches(want.selector, labelsOf(pv))) return false;
  return !node || affinityAllows(pv, node.labels);
}
/** The volume a claim binds to: one named for it, else the smallest that fits (ties: by name). */
export function matchVolume(k: KubeState, pvc: JObj, t: Seconds, node?: KubeState['nodes'][number]): JObj | undefined {
  const all = storageObjects(k, 'PersistentVolume', t), named = str(obj(pvc.spec).volumeName);
  if (named) { const pv = all.find(v => nameOf(v) === named); return pv && fits(pv, pvc, node) ? pv : undefined; }
  const pre = all.find(v => { const r = obj(obj(v.spec).claimRef); return str(r.name) === nameOf(pvc) && str(r.namespace) === nsOf(pvc); });
  if (pre) return fits(pre, pvc, node) ? pre : undefined;
  return all.filter(v => !str(obj(obj(v.spec).claimRef).name) && fits(v, pvc, node)).sort((a, b) => bytes(obj(obj(a.spec).capacity).storage) - bytes(obj(obj(b.spec).capacity).storage) || nameOf(a).localeCompare(nameOf(b)))[0];
}
function bind(k0: KubeState, pv: JObj, pvc: JObj, t: Seconds, picked: boolean): KubeState {
  const ref = obj(obj(pv.spec).claimRef), mine = !!str(ref.uid);
  const claimRef: J = { apiVersion: 'v1', kind: 'PersistentVolumeClaim', name: nameOf(pvc), namespace: nsOf(pvc) ?? 'default', resourceVersion: str(meta(pvc).resourceVersion) ?? '', uid: uidOf(pvc) };
  let k = put(k0, { ...(mine || str(ref.name) ? pv : annotate(pv, { 'pv.kubernetes.io/bound-by-controller': 'yes' })), spec: { ...obj(pv.spec), claimRef }, status: { lastPhaseTransitionTime: stamp(t), phase: 'Bound' } });
  const claim = annotate(pvc, { 'pv.kubernetes.io/bind-completed': 'yes', ...picked ? { 'pv.kubernetes.io/bound-by-controller': 'yes' } : {} });
  k = put(k, { ...claim, spec: { ...obj(pvc.spec), volumeName: nameOf(pv) }, status: { accessModes: modesOf(pv), capacity: { storage: obj(obj(pv.spec).capacity).storage ?? '' }, phase: 'Bound' } });
  return changed(k, t);
}

/** The dynamic provisioning of a claim by its class's provisioner (or the events of a claim that waits for it). */
function provision(k0: KubeState, pvc: JObj, sc: JObj, t: Seconds): KubeState {
  const prov = str(sc.provisioner) ?? '', cls = nameOf(sc), node = str(obj(meta(pvc).annotations)[SELECTED_NODE]);
  if (prov === NO_PROVISIONER) return once(k0, t, pvc, 'Warning', 'ProvisioningFailed', `no volume plugin matched name: ${prov}`);
  let k = k0, claim = live(k, pvc)!;
  if (str(obj(meta(claim).annotations)['volume.kubernetes.io/storage-provisioner']) !== prov) { claim = annotate(claim, { 'volume.beta.kubernetes.io/storage-provisioner': prov, 'volume.kubernetes.io/storage-provisioner': prov }); k = put(k, claim); claim = live(k, claim)!; }
  k = once(k, t, claim, 'Normal', 'ExternalProvisioning', `Waiting for a volume to be created either by the external provisioner '${prov}' or manually by the system administrator. If volume creation is delayed, please verify that the provisioner is running and correctly registered.`);
  const p = k.storage!.provisioners.find(x => x.name === prov), src = `${prov}_${prov.split('/')[0].split('.')[0]}-provisioner-0`;
  if (!p) return k;
  k = once(k, t, claim, 'Normal', 'Provisioning', `External provisioner is provisioning volume for claim "${nsOf(claim)}/${nameOf(claim)}"`, src);
  if (p.local && !node) return once(k, t, claim, 'Warning', 'ProvisioningFailed', `failed to provision volume with StorageClass "${cls}": configuration error, no node was specified`, src);
  const name = `pvc-${uidOf(claim)}`, ns = nsOf(claim) ?? 'default', s = obj(claim.spec);
  const source: J = p.local ? { hostPath: { path: `/opt/local-path-provisioner/${name}_${ns}_${nameOf(claim)}`, type: 'DirectoryOrCreate' },
    nodeAffinity: { required: { nodeSelectorTerms: [{ matchExpressions: [{ key: 'kubernetes.io/hostname', operator: 'In', values: [node!] }] }] } } } : { csi: { driver: prov, fsType: 'ext4', volumeHandle: name } };
  const claimRef: J = { apiVersion: 'v1', kind: 'PersistentVolumeClaim', name: nameOf(claim), namespace: ns, resourceVersion: str(meta(claim).resourceVersion) ?? '', uid: uidOf(claim) };
  const doc: JObj = { apiVersion: 'v1', kind: 'PersistentVolume', metadata: { annotations: { 'pv.kubernetes.io/provisioned-by': prov }, finalizers: [PV_PROTECTION], name },
    spec: { accessModes: modesOf(claim), capacity: { storage: request(claim) ?? '' }, claimRef, persistentVolumeReclaimPolicy: str(sc.reclaimPolicy) ?? 'Delete', storageClassName: cls, volumeMode: str(s.volumeMode) ?? 'Filesystem', ...obj(source) },
    status: { phase: 'Pending' } };
  const r = created(k, doc, undefined, t);
  k = once(put(r.k, r.o), t, claim, 'Normal', 'ProvisioningSucceeded', `Successfully provisioned volume ${name}`, src);
  return bind(k, live(k, r.o)!, live(k, claim)!, t, true);
}

/** A pending claim: bind, wait for a consumer, provision, or say why it cannot. */
export function syncClaim(k: KubeState, pvc: JObj, t: Seconds, at?: string): KubeState {
  const cls = claimClass(pvc), sc = cls ? storageObjects(k, 'StorageClass', t).find(c => nameOf(c) === cls) : undefined, node = at ?? str(obj(meta(pvc).annotations)[SELECTED_NODE]);
  const delay = !!sc && str(sc.volumeBindingMode) === 'WaitForFirstConsumer' && !node && !str(obj(pvc.spec).volumeName);
  if (delay) {
    const waiting = k.objects.filter(o => kindOf(o) === 'Pod' && nsOf(o) === nsOf(pvc) && !k.pods[uidOf(o)] && arr(obj(o.spec).volumes).some(v => str(obj(obj(v).persistentVolumeClaim).claimName) === nameOf(pvc))).map(nameOf);
    const msg = !waiting.length ? 'waiting for first consumer to be created before binding' : waiting.length > 1 ? `waiting for pods ${waiting.join(',')} to be scheduled` : `waiting for pod ${waiting[0]} to be scheduled`;
    return once(k, t, pvc, 'Normal', waiting.length ? 'WaitForPodScheduled' : 'WaitForFirstConsumer', msg);
  }
  const pv = matchVolume(k, pvc, t, node ? k.nodes.find(n => n.name === node) : undefined);
  if (pv) return bind(k, pv, pvc, t, !str(obj(pvc.spec).volumeName));
  if (str(obj(pvc.spec).volumeName)) return k;
  if (!cls) return once(k, t, pvc, 'Normal', 'FailedBinding', 'no persistent volumes available for this claim and no storage class is set');
  if (!sc) return once(k, t, pvc, 'Warning', 'ProvisioningFailed', `storageclass.storage.k8s.io "${cls}" not found`);
  return provision(k, pvc, sc, t);
}

/** A volume whose claim is gone: Released, then its reclaim policy. */
function syncVolume(k: KubeState, pv: JObj, t: Seconds): KubeState {
  const ref = obj(obj(pv.spec).claimRef), status = str(obj(pv.status).phase);
  const claim = str(ref.name) ? findIn(k, 'PersistentVolumeClaim', str(ref.namespace), str(ref.name)!) : undefined, mine = !!claim && (!str(ref.uid) || str(ref.uid) === uidOf(claim));
  // pv-protection: a volume being deleted goes once no claim is bound to it.
  if (meta(pv).deletionTimestamp) return mine && str(obj(claim!.spec).volumeName) === nameOf(pv) ? k : changed(remove(k, pv), t);
  if (!str(ref.name)) return phase(k, pv, 'Available', t);
  if (mine) return str(obj(claim!.spec).volumeName) === nameOf(pv) ? phase(k, pv, 'Bound', t) : phase(k, pv, 'Available', t);
  if (!str(ref.uid)) return phase(k, pv, 'Available', t);
  if (status === 'Released' || status === 'Failed') return k;
  const policy = str(obj(pv.spec).persistentVolumeReclaimPolicy) ?? 'Retain', by = str(obj(meta(pv).annotations)['pv.kubernetes.io/provisioned-by']);
  if (policy === 'Retain') return phase(k, pv, 'Released', t);
  if (policy === 'Recycle') {
    let r = k;
    for (const key of keysOfVolume(k, pv)) r = withData(r, key, undefined);
    const { claimRef: _c, ...spec } = obj(pv.spec);
    void _c;
    return put(r, { ...pv, spec, status: { lastPhaseTransitionTime: stamp(t), phase: 'Available' } });
  }
  if (by && k.storage!.provisioners.some(p => p.name === by)) {
    let r = changed(remove(k, pv), t);
    for (const key of keysOfVolume(k, pv)) r = withData(r, key, undefined);
    return r;
  }
  if (by) return phase(k, pv, 'Released', t);
  const msg = `error getting deleter volume plugin for volume "${nameOf(pv)}": no deletable volume plugin matched`;
  return once(phase(k, pv, 'Failed', t, msg), t, pv, 'Warning', 'VolumeFailedDelete', msg);
}

/** One run of the controller at t (unchanged state when there is nothing to do). */
export function syncStorage(k0: KubeState, t: Seconds): KubeState {
  let k = k0;
  for (const c0 of storageObjects(k0, 'PersistentVolumeClaim', t)) {
    const c = live(k, c0);
    if (!c) continue;
    const s = obj(c.spec), st = str(obj(c.status).phase);
    if (meta(c).deletionTimestamp) { if (!usersOf(k, c).length) k = changed(remove(k, c), t); continue; }
    // Retroactive default class (1.28+): a claim that asked for no class at all gets the default one when it appears.
    if (st !== 'Bound' && !('storageClassName' in s)) { const d = defaultClassOf(k, t); if (d) { k = put(k, { ...c, spec: { ...s, storageClassName: nameOf(d) } }); continue; } }
    if (st !== 'Bound' && st !== 'Lost') { k = syncClaim(k, c, t); continue; }
    const pv = findIn(k, 'PersistentVolume', undefined, str(s.volumeName) ?? '');
    if (!pv) { if (st === 'Bound') k = record(put(k, { ...c, status: { ...obj(c.status), phase: 'Lost' } }), t, about(c), 'Warning', 'ClaimLost', 'Bound claim has lost its PersistentVolume. Data on the volume is lost!', CTRL); continue; }
    // A bound claim that asks for more (its class allows expansion): the volume and the claim's capacity grow.
    const want = request(c);
    if (bytes(want) > bytes(obj(obj(c.status).capacity).storage)) {
      k = put(k, { ...pv, spec: { ...obj(pv.spec), capacity: { ...obj(obj(pv.spec).capacity), storage: want ?? '' } } });
      k = put(k, { ...c, status: { ...obj(c.status), capacity: { storage: want ?? '' } } });
    }
  }
  for (const v of storageObjects(k, 'PersistentVolume', t)) { const pv = live(k, v); if (pv) k = syncVolume(k, pv, t); }
  // Pods waiting for an attachable volume (Multi-Attach) mount it once its other user is gone.
  for (const pod of k.objects) {
    const sim = kindOf(pod) === 'Pod' ? k.pods[uidOf(pod)] : undefined;
    if (!sim || sim.mount?.next !== WAIT || attachBlocked(k, pod, sim.node)) continue;
    const m = mountPod(k, pod, sim, t);
    k = { ...m.k, pods: { ...m.k.pods, [uidOf(pod)]: m.sim } };
  }
  // emptyDir volumes live as long as their pod.
  const pods = new Set(Object.keys(k.pods)), gone = Object.keys(k.storage!.data).filter(key => key.startsWith('emptyDir/') && !pods.has(key.split('/')[1]));
  for (const key of gone) k = withData(k, key, undefined);
  // The scheduler tries its pending pods again when claims or volumes changed.
  const sig = k.objects.filter(o => kindOf(o) === 'PersistentVolumeClaim' || kindOf(o) === 'PersistentVolume').map(o => `${uidOf(o)}:${str(obj(o.status).phase)}:${str(obj(o.spec).volumeName)}:${meta(o).deletionTimestamp ? 'd' : ''}`).join(',');
  if (sig !== k.storage!.sig) k = { ...changed(k, t), storage: { ...k.storage!, sig } };
  return k;
}
