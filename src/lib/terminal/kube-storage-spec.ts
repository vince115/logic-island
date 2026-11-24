import type { Seconds } from './clock';
import { fieldErrors } from './kube-manifest';
import { podConfigErrors } from './kube-pod-config';
import { workloadErrors } from './kube-workload-spec';
import { defaultSet, setErrors, setUpdateErrors } from './kube-statefulset-spec';
import { claimSpecErrors, defaultClassOf, modeErrors, modeOf, QTY, PV_PROTECTION, PVC_PROTECTION, findIn } from './kube-storage-model';
import { arr, bytesOf, kindOf, meta, obj, quantityText, sameJ, str, type J, type JObj, type KubeState } from './kube-model';

/*
 * Engine stage E38 (docs/curriculum/KUB0_E38_KUBE_STORAGE.md §2): StorageClass, PersistentVolume, PersistentVolumeClaim
 * (and StatefulSet, kube-statefulset-spec.ts) as the API server keeps them — the defaults (reclaimPolicy Delete and
 * Immediate binding for a class, Retain and Filesystem for a volume), the admission plugins (DefaultStorageClass gives a
 * new claim without storageClassName the default class; the protection finalizers), the validation of each kind (all the
 * errors at once) and what an update may change (a class's provisioner, parameters, reclaimPolicy and binding mode, a
 * claim's spec but its storage request, a volume's source are fixed).
 */

const SOURCES = ['hostPath', 'local', 'nfs', 'csi'];
const set = (v: J | undefined) => v !== undefined && v !== null;

function volumeErrors(o: JObj): string[] {
  const s = obj(o.spec), out = fieldErrors(o), q = quantityText(obj(s.capacity).storage), given = SOURCES.filter(k => set(s[k]));
  if (q === undefined) out.push('spec.capacity: Required value');
  else if (bytesOf(q) === null) out.push(`spec.capacity[storage]: Invalid value: "${q}": ${QTY}`);
  out.push(...modeErrors(s.accessModes, 'spec.accessModes', false));
  const policy = str(s.persistentVolumeReclaimPolicy);
  if (policy && !['Delete', 'Recycle', 'Retain'].includes(policy)) out.push(`spec.persistentVolumeReclaimPolicy: Unsupported value: "${policy}": supported values: "Delete", "Recycle", "Retain"`);
  if (!given.length) out.push('spec: Required value: must specify a volume type');
  for (const extra of given.slice(1)) out.push(`spec.${extra}: Forbidden: may not specify more than 1 volume type`);
  const need: Record<string, string[]> = { hostPath: ['path'], local: ['path'], nfs: ['server', 'path'], csi: ['driver', 'volumeHandle'] };
  for (const g of given) for (const f of need[g]) if (!str(obj(s[g])[f])) out.push(`spec.${g}.${f}: Required value`);
  if (given.includes('local') && !set(s.nodeAffinity)) out.push('spec.nodeAffinity: Required value: Local volume requires node affinity');
  return [...out, ...modeOf(s.volumeMode, 'spec.volumeMode')];
}
function classErrors(o: JObj): string[] {
  const out = fieldErrors(o), policy = str(o.reclaimPolicy), mode = str(o.volumeBindingMode);
  if (!str(o.provisioner)) out.push('provisioner: Required value');
  if (policy && !['Delete', 'Retain'].includes(policy)) out.push(`reclaimPolicy: Unsupported value: "${policy}": supported values: "Delete", "Retain"`);
  if (mode && !['Immediate', 'WaitForFirstConsumer'].includes(mode)) out.push(`volumeBindingMode: Unsupported value: "${mode}": supported values: "Immediate", "WaitForFirstConsumer"`);
  return out;
}
/** The pod's own errors of its storage volumes (a claim's name). */
export function podStorageErrors(doc: JObj): string[] {
  const pod = kindOf(doc) === 'Pod', spec = pod ? obj(doc.spec) : obj(obj(obj(doc.spec).template).spec), base = pod ? 'spec' : 'spec.template.spec';
  return arr(spec.volumes).map(obj).flatMap((v, i) => set(v.persistentVolumeClaim) && !str(obj(v.persistentVolumeClaim).claimName) ? [`${base}.volumes[${i}].persistentVolumeClaim.claimName: Required value`] : []);
}

/** The validation of a (defaulted) storage object; a StatefulSet's pod template too. */
export function storageErrors(o: JObj): string[] {
  switch (kindOf(o)) {
    case 'StorageClass': return classErrors(o);
    case 'PersistentVolume': return volumeErrors(o);
    case 'PersistentVolumeClaim': return [...fieldErrors(o), ...claimSpecErrors(obj(o.spec), 'spec')];
    default: {
      // A StatefulSet's template may mount its claim templates by name (they are its pods' volumes).
      const claims = arr(obj(o.spec).volumeClaimTemplates).map(c => ({ name: str(obj(obj(c).metadata).name) ?? '', persistentVolumeClaim: { claimName: 'x' } }));
      const t = obj(obj(o.spec).template), withClaims = { ...o, spec: { ...obj(o.spec), template: { ...t, spec: { ...obj(t.spec), volumes: [...arr(obj(t.spec).volumes), ...claims] } } } };
      return [...workloadErrors(o), ...setErrors(o), ...podConfigErrors(withClaims), ...podStorageErrors(o)];
    }
  }
}
/** What the simulation leaves to the lesson text (a message), or null. */
export function storageProse(o: JObj): string | null {
  const s = obj(o.spec), claim = (spec: JObj, at: string) => str(spec.volumeMode) === 'Block' ? `${at}.volumeMode Block` : set(spec.dataSource) || set(spec.dataSourceRef) ? `${at}.dataSource（快照與複製）` : null;
  const kind = kindOf(o), what = kind === 'PersistentVolumeClaim' ? claim(s, 'spec') : kind === 'PersistentVolume' ? str(s.volumeMode) === 'Block' ? 'spec.volumeMode Block' : null
    : kind === 'StorageClass' ? set(o.allowedTopologies) ? 'allowedTopologies' : null
    : set(s.ordinals) ? 'spec.ordinals' : arr(s.volumeClaimTemplates).map((c, i) => claim(obj(obj(c).spec), `spec.volumeClaimTemplates[${i}].spec`)).find(Boolean) ?? null;
  return what ? `（模擬環境：${kindOf(o)} 的 ${what} 只在課文說明）` : null;
}

/** The defaults of a storage object (idempotent; a new claim also gets the default class and both kinds their finalizers). */
export function defaultStorage(k: KubeState, o: JObj, t: Seconds, creating = false): JObj {
  const kind = kindOf(o), s = { ...obj(o.spec) }, fin = (f: string): JObj => creating ? { ...meta(o), finalizers: [...new Set([...arr(meta(o).finalizers).map(String), f])] } : meta(o);
  if (kind === 'StorageClass') return { ...o, reclaimPolicy: o.reclaimPolicy ?? 'Delete', volumeBindingMode: o.volumeBindingMode ?? 'Immediate' };
  if (kind === 'StatefulSet') return defaultSet(o);
  if (kind === 'PersistentVolume') {
    s.persistentVolumeReclaimPolicy ??= 'Retain';
    s.volumeMode ??= 'Filesystem';
    if (set(s.hostPath)) s.hostPath = { type: '', ...obj(s.hostPath) };
    return { ...o, metadata: fin(PV_PROTECTION), spec: s, ...creating ? { status: { phase: 'Pending' } } : {} };
  }
  s.volumeMode ??= 'Filesystem';
  // DefaultStorageClass admission: a claim created without storageClassName gets the default class ("" asks for none).
  if (creating && !('storageClassName' in s)) { const d = defaultClassOf(k, t); if (d) s.storageClassName = String(obj(d.metadata).name); }
  return { ...o, metadata: fin(PVC_PROTECTION), spec: s, ...creating ? { status: { phase: 'Pending' } } : {} };
}

const FORBID_CLASS: [string, string][] = [['parameters', 'parameters: Forbidden: updates to parameters are forbidden.'], ['provisioner', 'provisioner: Forbidden: updates to provisioner are forbidden.'],
  ['reclaimPolicy', 'reclaimPolicy: Forbidden: updates to reclaimPolicy are forbidden.']];
/** What an update may not change (the live object and the merged one). */
export function storageUpdateErrors(k: KubeState, live: JObj, next: JObj): { errors: string[]; forbidden?: string } {
  const kind = kindOf(live), a = obj(live.spec), b = obj(next.spec);
  if (kind === 'StorageClass') {
    const errors = FORBID_CLASS.filter(([f]) => !sameJ(live[f], next[f])).map(([, m]) => m);
    if (!sameJ(live.volumeBindingMode, next.volumeBindingMode)) errors.push(`volumeBindingMode: Invalid value: "${str(next.volumeBindingMode)}": field is immutable`);
    return { errors };
  }
  if (kind === 'StatefulSet') return { errors: setUpdateErrors(live, next) };
  if (kind === 'PersistentVolume') {
    const errors = SOURCES.some(f => !sameJ(a[f], b[f])) ? ['spec.persistentvolumesource: Forbidden: spec.persistentvolumesource is immutable after creation'] : [];
    if (!sameJ(a.volumeMode, b.volumeMode)) errors.push(`spec.volumeMode: Invalid value: "${str(b.volumeMode)}": field is immutable`);
    return { errors };
  }
  const strip = (s: JObj) => { const { resources: _r, volumeName: _v, ...rest } = s; void _r; void _v; return rest; };
  if (!sameJ(strip(a), strip(b))) return { errors: ['spec: Forbidden: spec is immutable after creation except resources.requests and volumeAttributesClassName for bound claims'] };
  const was = bytesOf(quantityText(obj(obj(a.resources).requests).storage) ?? '') ?? 0, want = bytesOf(quantityText(obj(obj(b.resources).requests).storage) ?? '') ?? 0;
  const capacity = bytesOf(quantityText(obj(obj(live.status).capacity).storage) ?? '') ?? 0;
  if (want < was && want < capacity) return { errors: ['spec.resources.requests.storage: Forbidden: field can not be less than status.capacity'] };
  if (want > was) {
    const cls = findIn(k, 'StorageClass', undefined, str(a.storageClassName) ?? ''), dynamic = str(obj(live.status).phase) === 'Bound' && !!cls && cls.allowVolumeExpansion === true;
    if (!dynamic) return { errors: [], forbidden: 'only dynamically provisioned pvc can be resized and the storageclass that provisions the pvc must support resize' };
  }
  return { errors: [] };
}
