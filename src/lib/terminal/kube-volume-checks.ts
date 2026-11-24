import type { FsState } from './fs';
import { settleKube } from './kube-settle';
import { ACCESS_MODES, findIn } from './kube-storage-model';
import { arr, bytesOf, meta, obj, quantityText, str, type JObj } from './kube-model';

/*
 * Engine stage E38 (docs/curriculum/KUB0_E38_KUBE_STORAGE.md §10): the check kube-volume — a PersistentVolumeClaim (in a
 * namespace) or a PersistentVolume exists (or not) with its phase (Terminating while its finalizer holds it), class,
 * capacity (compared as a quantity: 1Gi is 1024Mi), access modes, what it is bound to (a claim: its volume's name; a
 * volume: namespace/claim) and reclaim policy (a claim: its volume's). It reads the cluster settled to the clock.
 */

export type VolumeCheck = { kind: 'kube-volume'; resource: 'PersistentVolumeClaim' | 'PersistentVolume'; name: string; namespace?: string; absent?: true;
  phase?: string; storageClass?: string; capacity?: string; accessModes?: string[]; boundTo?: string; reclaimPolicy?: string };
const LINE = (t: unknown, max = 253) => typeof t === 'string' && t.length >= 1 && t.length <= max && !t.includes('\n');
const PHASES = ['Pending', 'Bound', 'Lost', 'Available', 'Released', 'Failed', 'Terminating'];

export function volumeCheckProblems(c: VolumeCheck, storage: boolean): string | null {
  if (!storage) return 'a kube-volume check needs a kube-storage machine (engine stage E38)';
  if (c.resource !== 'PersistentVolumeClaim' && c.resource !== 'PersistentVolume') return 'a kube-volume check\'s resource is PersistentVolumeClaim or PersistentVolume';
  if (!LINE(c.name) || (c.namespace !== undefined && (!LINE(c.namespace, 63) || c.resource === 'PersistentVolume'))) return 'a kube-volume check needs a name (and a namespace only for a PersistentVolumeClaim)';
  const more = [c.phase, c.storageClass, c.capacity, c.accessModes, c.boundTo, c.reclaimPolicy].some(v => v !== undefined);
  if (c.absent && more) return 'a kube-volume check with absent checks nothing else';
  if (c.phase !== undefined && !PHASES.includes(c.phase)) return `a kube-volume check's phase is one of ${PHASES.join(', ')}`;
  if (c.storageClass !== undefined && (typeof c.storageClass !== 'string' || c.storageClass.length > 253)) return 'a kube-volume check\'s storageClass is a name (or "" for none)';
  if (c.capacity !== undefined && (typeof c.capacity !== 'string' || bytesOf(c.capacity) === null)) return 'a kube-volume check\'s capacity is a quantity such as 1Gi';
  if (c.accessModes !== undefined && (!Array.isArray(c.accessModes) || !c.accessModes.length || c.accessModes.some(m => !ACCESS_MODES.includes(m)))) return `a kube-volume check's accessModes are among ${ACCESS_MODES.join(', ')}`;
  if (c.boundTo !== undefined && !LINE(c.boundTo)) return 'a kube-volume check\'s boundTo is a volume name (a claim) or namespace/claim (a volume)';
  if (c.reclaimPolicy !== undefined && !['Retain', 'Delete', 'Recycle'].includes(c.reclaimPolicy)) return 'a kube-volume check\'s reclaimPolicy is Retain, Delete or Recycle';
  return null;
}

export function describeVolumeCheck(c: VolumeCheck): string {
  const where = c.resource === 'PersistentVolume' ? '叢集' : `${c.namespace ?? 'default'} 命名空間`;
  if (c.absent) return `${where}應該沒有名為 ${c.name} 的 ${c.resource}`;
  const more = [c.phase ? `狀態 ${c.phase}` : '', c.storageClass !== undefined ? `StorageClass ${c.storageClass || '""（不使用 StorageClass）'}` : '', c.capacity ? `容量 ${c.capacity}` : '',
    c.accessModes ? `存取模式 ${c.accessModes.join(',')}` : '', c.boundTo ? `綁定到 ${c.boundTo}` : '', c.reclaimPolicy ? `回收策略 ${c.reclaimPolicy}` : ''].filter(Boolean);
  return `${where}應該有名為 ${c.name} 的 ${c.resource}${more.length ? `（${more.join('、')}）` : ''}`;
}

export function volumeCheckFailure(c: VolumeCheck, end: FsState): string | null {
  const k = settleKube(end).kube;
  if (!k) return '這台機器沒有 Kubernetes 叢集';
  const claim = c.resource === 'PersistentVolumeClaim', o = findIn(k, c.resource, claim ? c.namespace ?? 'default' : undefined, c.name);
  if (c.absent) return o ? `仍然有名為 ${c.name} 的 ${c.resource}` : null;
  if (!o) return `沒有名為 ${c.name} 的 ${c.resource}`;
  const s = obj(o.spec), pv: JObj | undefined = claim ? findIn(k, 'PersistentVolume', undefined, str(s.volumeName) ?? '') : o;
  const phase = meta(o).deletionTimestamp ? 'Terminating' : str(obj(o.status).phase) ?? 'Pending';
  if (c.phase !== undefined && phase !== c.phase) return `它的狀態是 ${phase}`;
  if (c.storageClass !== undefined && (str(s.storageClassName) ?? '') !== c.storageClass) return str(s.storageClassName) ? `它的 StorageClass 是 ${str(s.storageClassName)}` : '它沒有 StorageClass';
  const capacity = quantityText(obj(claim ? obj(o.status).capacity : s.capacity).storage);
  if (c.capacity !== undefined && (capacity === undefined || bytesOf(capacity) !== bytesOf(c.capacity))) return capacity === undefined ? '它還沒有容量（還沒有綁定）' : `它的容量是 ${capacity}`;
  const modes = arr(claim && str(s.volumeName) ? obj(o.status).accessModes : s.accessModes).map(String);
  if (c.accessModes !== undefined && [...modes].sort().join(',') !== [...c.accessModes].sort().join(',')) return `它的存取模式是 ${modes.join(',') || '（沒有）'}`;
  const ref = obj(s.claimRef), bound = claim ? str(s.volumeName) : str(ref.name) ? `${str(ref.namespace)}/${str(ref.name)}` : undefined;
  if (c.boundTo !== undefined && bound !== c.boundTo) return bound ? `它綁定到 ${bound}` : '它還沒有綁定';
  const policy = str(obj(pv?.spec).persistentVolumeReclaimPolicy);
  if (c.reclaimPolicy !== undefined && policy !== c.reclaimPolicy) return policy ? `它的回收策略是 ${policy}` : '它還沒有 PersistentVolume';
  return null;
}
