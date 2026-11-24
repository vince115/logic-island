import type { Seconds } from './clock';
import { eventLines, mapLines, multi } from './kube-describe';
import { templateLines } from './kube-describe-workload';
import { ownedBy } from './kube-replicaset';
import { selectorText } from './kube-workload-spec';
import { claimsOf, isDefaultClass, modesText } from './kube-storage-model';
import { arr, createdOf, goTab, humanDuration, kindOf, meta, nameOf, nsOf, obj, parseStamp, quantityText, rfc1123, str, uidOf, type J, type JObj, type KubeState } from './kube-model';

/*
 * Engine stage E38 (docs/curriculum/KUB0_E38_KUBE_STORAGE.md §8): kubectl get's columns of StorageClass, PV, PVC and
 * StatefulSet (1.32's printers, VOLUMEATTRIBUTESCLASS included; a claim's CAPACITY and ACCESS MODES once it names its
 * volume; Terminating while a protection finalizer holds it) and their describers.
 */

const age = (o: JObj, now: Seconds) => { const t = createdOf(o); return t === undefined ? '<unknown>' : humanDuration(now - t); };
const phaseText = (o: JObj) => meta(o).deletionTimestamp ? 'Terminating' : str(obj(o.status).phase) ?? '';
const storage = (v: J | undefined) => quantityText(obj(v).storage) ?? '';
const vac = (s: JObj) => str(s.volumeAttributesClassName) ?? '<unset>';
type Cols = { head: string[]; wide?: string[]; row: (o: JObj) => string[]; more?: (o: JObj) => string[] };
export const STORAGE_COLUMNS: Record<string, (now: Seconds) => Cols> = {
  StorageClass: now => ({ head: ['NAME', 'PROVISIONER', 'RECLAIMPOLICY', 'VOLUMEBINDINGMODE', 'ALLOWVOLUMEEXPANSION', 'AGE'],
    row: o => [`${nameOf(o)}${isDefaultClass(o) ? ' (default)' : ''}`, str(o.provisioner) ?? '', str(o.reclaimPolicy) ?? 'Delete', str(o.volumeBindingMode) ?? 'Immediate', String(o.allowVolumeExpansion === true), age(o, now)] }),
  PersistentVolume: now => ({ head: ['NAME', 'CAPACITY', 'ACCESS MODES', 'RECLAIM POLICY', 'STATUS', 'CLAIM', 'STORAGECLASS', 'VOLUMEATTRIBUTESCLASS', 'REASON', 'AGE'], wide: ['VOLUMEMODE'],
    row: o => { const s = obj(o.spec), ref = obj(s.claimRef); return [nameOf(o), storage(s.capacity), modesText(s.accessModes), str(s.persistentVolumeReclaimPolicy) ?? '', phaseText(o), str(ref.name) ? `${str(ref.namespace)}/${str(ref.name)}` : '',
      str(s.storageClassName) ?? '', vac(s), str(obj(o.status).reason) ?? '', age(o, now)]; }, more: o => [str(obj(o.spec).volumeMode) ?? 'Filesystem'] }),
  PersistentVolumeClaim: now => ({ head: ['NAME', 'STATUS', 'VOLUME', 'CAPACITY', 'ACCESS MODES', 'STORAGECLASS', 'VOLUMEATTRIBUTESCLASS', 'AGE'], wide: ['VOLUMEMODE'],
    row: o => { const s = obj(o.spec), named = !!str(s.volumeName); return [nameOf(o), phaseText(o), str(s.volumeName) ?? '', named ? storage(obj(o.status).capacity) : '', named ? modesText(obj(o.status).accessModes) : '', str(s.storageClassName) ?? '', vac(s), age(o, now)]; },
    more: o => [str(obj(o.spec).volumeMode) ?? 'Filesystem'] }),
  StatefulSet: now => ({ head: ['NAME', 'READY', 'AGE'], wide: ['CONTAINERS', 'IMAGES'],
    row: o => [nameOf(o), `${Number(obj(o.status).readyReplicas ?? 0)}/${Number(obj(o.spec).replicas ?? 1)}`, age(o, now)],
    more: o => { const cs = arr(obj(obj(obj(o.spec).template).spec).containers).map(obj); return [cs.map(c => str(c.name)).join(','), cs.map(c => str(c.image)).join(',')]; } }),
};

/** labels.FormatLabels: k=v,… sorted (<none> when empty). */
const formatMap = (m: J | undefined) => { const keys = Object.keys(obj(m)).sort(); return keys.length ? keys.map(k => `${k}=${String(obj(m)[k])}`).join(',') : '<none>'; };
const finalizers = (o: JObj) => `[${arr(meta(o).finalizers).map(String).join(' ')}]`;
const status = (o: JObj, now: Seconds) => { const del = parseStamp(str(meta(o).deletionTimestamp)); return del === undefined ? str(obj(o.status).phase) ?? '' : `Terminating (lasts ${humanDuration(now - del)})`; };
function sourceLines(s: JObj): string[] {
  if (s.hostPath) { const h = obj(s.hostPath); return ['    Type:\tHostPath (bare host directory volume)', `    Path:\t${str(h.path) ?? ''}`, `    HostPathType:\t${str(h.type) ?? ''}`]; }
  if (s.local) return ['    Type:\tLocalVolume (a persistent volume backed by local storage on a node)', `    Path:\t${str(obj(s.local).path) ?? ''}`];
  if (s.nfs) { const n = obj(s.nfs); return ['    Type:\tNFS (an NFS mount)', `    Server:\t${str(n.server) ?? ''}`, `    Path:\t${str(n.path) ?? ''}`, `    ReadOnly:\t${n.readOnly === true}`]; }
  const c = obj(s.csi), attrs = mapLines(c.volumeAttributes, '=');
  return ['    Type:\tCSI (a Container Storage Interface (CSI) volume source)', `    Driver:\t${str(c.driver) ?? ''}`, `    FSType:\t${str(c.fsType) ?? ''}`, `    VolumeHandle:\t${str(c.volumeHandle) ?? ''}`, `    ReadOnly:\t${c.readOnly === true}`,
    ...multi('VolumeAttributes:', attrs, '    ')];
}
function affinityLines(s: JObj): string[] {
  const terms = arr(obj(obj(s.nodeAffinity).required).nodeSelectorTerms).map(obj);
  if (!s.nodeAffinity) return ['Node Affinity:\t<none>'];
  return ['Node Affinity:\t', '  Required Terms:\t', ...terms.flatMap((term, i) => multi(`Term ${i}:`, arr(term.matchExpressions).map(obj).map(e => `${str(e.key)} ${(str(e.operator) ?? '').toLowerCase()} [${arr(e.values).map(String).join(', ')}]`), '    '))];
}

export function describeStorage(k: KubeState, o: JObj, now: Seconds): string[] {
  const m = meta(o), s = obj(o.spec), labels = multi('Labels:', mapLines(m.labels, '=')), notes = multi('Annotations:', mapLines(m.annotations, ': ')), events = eventLines(k, uidOf(o), now);
  let lines: string[];
  switch (kindOf(o)) {
    case 'StorageClass':
      lines = [`Name:\t${nameOf(o)}`, `IsDefaultClass:\t${isDefaultClass(o) ? 'Yes' : 'No'}`, `Annotations:\t${formatMap(m.annotations)}`, `Provisioner:\t${str(o.provisioner) ?? ''}`, `Parameters:\t${formatMap(o.parameters)}`,
        `AllowVolumeExpansion:\t${typeof o.allowVolumeExpansion === 'boolean' ? String(o.allowVolumeExpansion) : '<unset>'}`, ...multi('MountOptions:', arr(o.mountOptions).map(String)),
        `ReclaimPolicy:\t${str(o.reclaimPolicy) ?? 'Delete'}`, `VolumeBindingMode:\t${str(o.volumeBindingMode) ?? 'Immediate'}`, ...events];
      break;
    case 'PersistentVolume': {
      const ref = obj(s.claimRef);
      lines = [`Name:\t${nameOf(o)}`, ...labels, ...notes, `Finalizers:\t${finalizers(o)}`, `StorageClass:\t${str(s.storageClassName) ?? ''}`, `Status:\t${status(o, now)}`, `Claim:\t${str(ref.name) ? `${str(ref.namespace)}/${str(ref.name)}` : ''}`,
        `Reclaim Policy:\t${str(s.persistentVolumeReclaimPolicy) ?? ''}`, `Access Modes:\t${modesText(s.accessModes)}`, `VolumeMode:\t${str(s.volumeMode) ?? 'Filesystem'}`, `Capacity:\t${storage(s.capacity)}`,
        ...affinityLines(s), `Message:\t${str(obj(o.status).message) ?? ''}`, 'Source:', ...sourceLines(s), ...events];
      break;
    }
    case 'PersistentVolumeClaim': {
      const named = !!str(s.volumeName), users = k.objects.filter(p => kindOf(p) === 'Pod' && nsOf(p) === nsOf(o) && claimsOf(p).some(c => c.claim === nameOf(o))).map(nameOf).sort();
      lines = [`Name:\t${nameOf(o)}`, `Namespace:\t${nsOf(o) ?? 'default'}`, `StorageClass:\t${str(s.storageClassName) ?? ''}`, `Status:\t${status(o, now)}`, `Volume:\t${str(s.volumeName) ?? ''}`, ...labels, ...notes,
        `Finalizers:\t${finalizers(o)}`, `Capacity:\t${named ? storage(obj(o.status).capacity) : ''}`, `Access Modes:\t${named ? modesText(obj(o.status).accessModes) : ''}`, `VolumeMode:\t${str(s.volumeMode) ?? 'Filesystem'}`,
        ...multi('Used By:', users), ...events];
      break;
    }
    default: {
      const st = obj(s.updateStrategy), ru = obj(st.rollingUpdate), pods = ownedBy(k, o, 'Pod', Infinity), phase = (p: string) => pods.filter(x => (str(obj(x.status).phase) ?? 'Pending') === p).length;
      const claims = arr(s.volumeClaimTemplates).map(obj);
      lines = [`Name:\t${nameOf(o)}`, `Namespace:\t${nsOf(o) ?? 'default'}`, `CreationTimestamp:\t${rfc1123(createdOf(o) ?? now)}`, `Selector:\t${selectorText(s.selector)}`, ...labels, ...notes,
        `Replicas:\t${Number(s.replicas ?? 1)} desired | ${Number(obj(o.status).replicas ?? 0)} total`, `Update Strategy:\t${str(st.type) ?? 'RollingUpdate'}`,
        ...st.rollingUpdate ? [`  Partition:\t${Number(ru.partition ?? 0)}`, ...ru.maxUnavailable !== undefined ? [`  MaxUnavailable:\t${String(ru.maxUnavailable)}`] : []] : [],
        `Pods Status:\t${phase('Running')} Running / ${phase('Pending')} Waiting / ${phase('Succeeded')} Succeeded / ${phase('Failed')} Failed`, ...templateLines(s.template),
        ...claims.length ? ['Volume Claims:', ...claims.flatMap(c => [`  Name:\t${str(obj(c.metadata).name) ?? ''}`, `  StorageClass:\t${str(obj(c.spec).storageClassName) ?? ''}`,
          ...multi('Labels:', mapLines(obj(c.metadata).labels, '='), '  '), ...multi('Annotations:', mapLines(obj(c.metadata).annotations, ': '), '  '),
          `  Capacity:\t${quantityText(obj(obj(obj(c.spec).resources).requests).storage) ?? '<default>'}`, `  Access Modes:\t[${arr(obj(c.spec).accessModes).map(String).join(' ')}]`])] : ['Volume Claims:\t<none>'], ...events];
    }
  }
  return goTab(lines, 0, 2);
}
