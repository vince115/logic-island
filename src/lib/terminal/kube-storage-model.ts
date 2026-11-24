import type { Seconds } from './clock';
import type { FsNode } from './fs';
import { put, remove } from './kube-api';
import { arr, bytesOf, changed, createdOf, kindOf, meta, nameOf, nsOf, obj, quantityText, stamp, str, type J, type JObj, type KubeState } from './kube-model';

/*
 * Engine stage E38 (docs/curriculum/KUB0_E38_KUBE_STORAGE.md §1): the storage model of the kube-storage profile. A
 * volume's contents are a file tree kept by its backing identity — a PersistentVolume's source (hostPath and local per
 * node, an NFS export, a CSI volume handle) or a pod's emptyDir — so data outlives the pods that mount it, and a PV
 * deleted and created again over the same source sees the same files. The lesson declares which provisioners run in the
 * cluster (node-local like local-path, or attachable network disks); StatefulSet revisions keep their pod templates.
 */

/** A provisioner the lesson installed: its name (a StorageClass's provisioner) and whether its volumes are node-local. */
export interface Provisioner { name: string; local: boolean }
export interface StorageState {
  provisioners: readonly Provisioner[];
  /** Volume contents by backing identity (sourceKey; emptyDir/<pod uid>/<volume>): path inside the volume → node. */
  data: Readonly<Record<string, Readonly<Record<string, FsNode>>>>;
  /** StatefulSet revisions (<set uid>/<revision name>): the pod template of each. */
  revisions?: Readonly<Record<string, JObj>>;
  /** What the scheduler last saw of the claims and volumes (a change makes it try its pending pods again). */
  sig?: string;
}

export const STORAGE_KINDS: readonly string[] = ['StorageClass', 'PersistentVolume', 'PersistentVolumeClaim', 'StatefulSet'];
/** A mount that waits for its volume to be attached (Multi-Attach): the storage controller tries it again, no timer does. */
export const WAIT = Number.MAX_SAFE_INTEGER;
export const DEFAULT_CLASS = 'storageclass.kubernetes.io/is-default-class';
export const SELECTED_NODE = 'volume.kubernetes.io/selected-node';
export const NO_PROVISIONER = 'kubernetes.io/no-provisioner';
export const PVC_PROTECTION = 'kubernetes.io/pvc-protection', PV_PROTECTION = 'kubernetes.io/pv-protection';

/** Mount points of storage volumes (podContainer hides the image's files under them, as a mount does). */
const points = new WeakSet<FsNode>();
export const mountPoint = (n: FsNode): FsNode => { points.add(n); return n; };
export const isMountPoint = (n: FsNode | undefined) => !!n && points.has(n);

const MODES: [string, string][] = [['ReadWriteOnce', 'RWO'], ['ReadOnlyMany', 'ROX'], ['ReadWriteMany', 'RWX'], ['ReadWriteOncePod', 'RWOP']];
export const ACCESS_MODES = MODES.map(m => m[0]);
/** GetAccessModesAsString: RWO,ROX,RWX,RWOP in that order. */
export const modesText = (list: unknown) => MODES.filter(([m]) => arr(list as never).includes(m)).map(([, s]) => s).join(',');
export const modesOf = (o: JObj) => arr(obj(o.spec).accessModes).map(m => String(m));

/** The objects of a kind that exist at t (boot manifests of a later time are not there yet). */
export const storageObjects = (k: KubeState, kind: string, t: Seconds) => k.objects.filter(o => kindOf(o) === kind && (createdOf(o) ?? 0) <= t);
export const isDefaultClass = (sc: JObj) => str(obj(meta(sc).annotations)[DEFAULT_CLASS]) === 'true';
/** The default StorageClass (the newest, as the admission plugin picks among several). */
export function defaultClassOf(k: KubeState, t: Seconds): JObj | undefined {
  return storageObjects(k, 'StorageClass', t).filter(isDefaultClass).sort((a, b) => (createdOf(b) ?? 0) - (createdOf(a) ?? 0) || nameOf(a).localeCompare(nameOf(b)))[0];
}
/** A claim's class: the name it asks for ('' is no class), undefined when it asks for none at all. */
export const claimClass = (pvc: JObj) => str(obj(pvc.spec).storageClassName);
export const volumeClass = (pv: JObj) => str(obj(pv.spec).storageClassName) ?? '';
export const findIn = (k: KubeState, kind: string, ns: string | undefined, name: string) =>
  k.objects.find(o => kindOf(o) === kind && nameOf(o) === name && (ns === undefined || nsOf(o) === ns));

/** The claims a pod's volumes use: the volume's name, the claim's name, read-only. */
export function claimsOf(pod: JObj): { vol: string; claim: string; readOnly: boolean }[] {
  return arr(obj(pod.spec).volumes).map(obj).filter(v => v.persistentVolumeClaim).map(v => ({ vol: str(v.name) ?? '', claim: str(obj(v.persistentVolumeClaim).claimName) ?? '', readOnly: obj(v.persistentVolumeClaim).readOnly === true }));
}
/** The pods that use a claim (not finished; a Terminating pod still does). */
export function usersOf(k: KubeState, pvc: JObj): JObj[] {
  return k.objects.filter(o => kindOf(o) === 'Pod' && nsOf(o) === nsOf(pvc) && !['Succeeded', 'Failed'].includes(str(obj(o.status).phase) ?? '') && claimsOf(o).some(c => c.claim === nameOf(pvc)));
}
/** The volume a claim is bound to (or undefined). */
export function boundVolume(k: KubeState, pvc: JObj): JObj | undefined {
  const name = str(obj(pvc.spec).volumeName);
  if (!name || str(obj(pvc.status).phase) !== 'Bound') return undefined;
  return findIn(k, 'PersistentVolume', undefined, name);
}

/** A PV's node-local source puts its node in the key (hostPath, local); others are one volume wherever it is mounted. */
export function sourceKey(pv: JObj, node: string): string {
  const s = obj(pv.spec);
  if (s.hostPath) return `hostPath:${node}:${str(obj(s.hostPath).path) ?? ''}`;
  if (s.local) return `local:${affinityNode(pv) ?? node}:${str(obj(s.local).path) ?? ''}`;
  if (s.nfs) return `nfs:${str(obj(s.nfs).server) ?? ''}:${str(obj(s.nfs).path) ?? ''}`;
  if (s.csi) return `csi:${str(obj(s.csi).driver) ?? ''}:${str(obj(s.csi).volumeHandle) ?? ''}`;
  return `pv:${nameOf(pv)}`;
}
/** Every key of a PV's contents (a hostPath one has one per node). */
export const keysOfVolume = (k: KubeState, pv: JObj) => {
  const s = obj(pv.spec);
  if (!s.hostPath) return [sourceKey(pv, '')];
  const path = `:${str(obj(s.hostPath).path) ?? ''}`;
  return Object.keys(k.storage?.data ?? {}).filter(key => key.startsWith('hostPath:') && key.endsWith(path));
};
/** Whether the volume is attached to one node at a time (CSI: a network disk). */
export const attachable = (pv: JObj) => !!obj(pv.spec).csi;
/** The node a PV's nodeAffinity requires (kubernetes.io/hostname In [node]), if any. */
export function affinityNode(pv: JObj): string | undefined {
  for (const term of arr(obj(obj(obj(pv.spec).nodeAffinity).required).nodeSelectorTerms).map(obj)) for (const e of arr(term.matchExpressions).map(obj)) {
    if (str(e.key) === 'kubernetes.io/hostname' && str(e.operator) === 'In') return str(arr(e.values)[0]);
  }
  return undefined;
}
/** Whether a node may use the PV (its nodeAffinity's terms: any term whose expressions all hold for the node's labels). */
export function affinityAllows(pv: JObj, labels: Readonly<Record<string, string>>): boolean {
  const terms = arr(obj(obj(obj(pv.spec).nodeAffinity).required).nodeSelectorTerms).map(obj);
  if (!terms.length) return true;
  return terms.some(term => arr(term.matchExpressions).map(obj).every(e => {
    const v = labels[str(e.key) ?? ''], values = arr(e.values).map(String), op = str(e.operator);
    return op === 'In' ? v !== undefined && values.includes(v) : op === 'NotIn' ? v === undefined || !values.includes(v) : op === 'Exists' ? v !== undefined : op === 'DoesNotExist' ? v === undefined : false;
  }));
}

/** The storage state with one key's contents replaced (undefined: removed). */
export function withData(k: KubeState, key: string, files: Readonly<Record<string, FsNode>> | undefined): KubeState {
  const data = { ...k.storage!.data };
  if (files === undefined) delete data[key]; else data[key] = files;
  return { ...k, storage: { ...k.storage!, data } };
}
/** kubectl delete of a claim or volume: its protection finalizer keeps it Terminating until the storage controller lets it go. */
export function markDeleting(k: KubeState, o: JObj, t: Seconds): KubeState {
  if (meta(o).deletionTimestamp) return k;
  if (!arr(meta(o).finalizers).length) return changed(remove(k, o), t);
  return put(k, { ...o, metadata: { ...meta(o), deletionGracePeriodSeconds: 0, deletionTimestamp: stamp(t) } });
}

const MODES_TEXT = '"ReadOnlyMany", "ReadWriteMany", "ReadWriteOnce", "ReadWriteOncePod"';
export const QTY = "quantities must match the regular expression '^([+-]?[0-9.]+)([eEinumkKMGTP]*[-+]?[0-9]*)$'";

/** The access modes' errors (a claim's at least one; a volume's required). */
export function modeErrors(modes: J | undefined, at: string, claim: boolean): string[] {
  const list = arr(modes).map(String), out: string[] = [];
  if (!list.length) out.push(claim ? `${at}: Required value: at least 1 access mode is required` : `${at}: Required value`);
  for (const m of list) if (!ACCESS_MODES.includes(m)) out.push(`${at}: Unsupported value: "${m}": supported values: ${MODES_TEXT}`);
  if (list.includes('ReadWriteOncePod') && list.length > 1) out.push(`${at}: Forbidden: may not use ReadWriteOncePod with other access modes`);
  return out;
}
export const modeOf = (v: J | undefined, at: string) => v !== undefined && v !== null && !['Filesystem', 'Block'].includes(String(v)) ? [`${at}: Unsupported value: "${String(v)}": supported values: "Block", "Filesystem"`] : [];
/** A claim's spec (a PVC's, or a StatefulSet's volumeClaimTemplates[i].spec). */
export function claimSpecErrors(spec: JObj, at: string): string[] {
  const out = modeErrors(spec.accessModes, `${at}.accessModes`, true), q = quantityText(obj(obj(spec.resources).requests).storage);
  if (q === undefined) out.push(`${at}.resources[storage]: Required value`);
  else if (bytesOf(q) === null) out.push(`${at}.resources.requests[storage]: Invalid value: "${q}": ${QTY}`);
  return [...out, ...modeOf(spec.volumeMode, `${at}.volumeMode`)];
}
