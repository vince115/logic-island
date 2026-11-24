import { defaultTemplate } from './kube-workload-spec';
import { claimSpecErrors } from './kube-storage-model';
import { validLabelName } from './kube-manifest';
import { arr, nameOf, obj, sameJ, sortJ, str, suffix, type J, type JObj } from './kube-model';

/*
 * Engine stage E38 (docs/curriculum/KUB0_E38_KUBE_STORAGE.md §6): a StatefulSet (apps/v1) as the API server keeps it —
 * the defaults (replicas 1, OrderedReady, RollingUpdate with partition 0, revisionHistoryLimit 10, the claim retention
 * policy Retain/Retain, each volumeClaimTemplate's apiVersion, kind, volumeMode and status), the validation of its own
 * fields (on top of a workload's: selector, template), what an update may change, the revision of a template (the
 * controller revision's name, set-<10 characters of SHA-256>) and kubectl rollout status's statefulset viewer.
 */

const set = (v: J | undefined) => v !== undefined && v !== null;
export const REVISION_LABEL = 'controller-revision-hash', POD_NAME_LABEL = 'statefulset.kubernetes.io/pod-name', POD_INDEX_LABEL = 'apps.kubernetes.io/pod-index';

export function defaultSet(o: JObj): JObj {
  const s = { ...obj(o.spec) }, st = { ...obj(s.updateStrategy) };
  s.replicas ??= 1;
  s.podManagementPolicy ??= 'OrderedReady';
  s.revisionHistoryLimit ??= 10;
  st.type ??= 'RollingUpdate';
  if (st.type === 'RollingUpdate') st.rollingUpdate = { partition: 0, ...obj(st.rollingUpdate) };
  s.updateStrategy = st;
  s.persistentVolumeClaimRetentionPolicy = { whenDeleted: 'Retain', whenScaled: 'Retain', ...obj(s.persistentVolumeClaimRetentionPolicy) };
  s.template = defaultTemplate(s.template);
  if (s.volumeClaimTemplates) s.volumeClaimTemplates = arr(s.volumeClaimTemplates).map(c0 => {
    const c = obj(c0);
    return { ...c, apiVersion: 'v1', kind: 'PersistentVolumeClaim', metadata: { creationTimestamp: null, ...obj(c.metadata) }, spec: { volumeMode: 'Filesystem', ...obj(c.spec) }, status: { phase: 'Pending' } };
  });
  return { ...o, spec: s };
}

/** The StatefulSet's own errors (the workload's selector and template are checked as a Deployment's). */
export function setErrors(o: JObj): string[] {
  const s = obj(o.spec), out: string[] = [], policy = str(s.podManagementPolicy), st = obj(s.updateStrategy), type = str(st.type);
  if (policy && policy !== 'OrderedReady' && policy !== 'Parallel') out.push(`spec.podManagementPolicy: Invalid value: "${policy}": must be 'OrderedReady' or 'Parallel'`);
  if (type === 'OnDelete' && set(st.rollingUpdate)) out.push("spec.updateStrategy.rollingUpdate: Invalid value: \"\": only allowed for updateStrategy 'RollingUpdate'");
  else if (type && type !== 'RollingUpdate' && type !== 'OnDelete') out.push(`spec.updateStrategy: Invalid value: apps.StatefulSetUpdateStrategy{Type:"${type}", RollingUpdate:(*apps.RollingUpdateStatefulSetStrategy)(nil)}: must be 'RollingUpdate' or 'OnDelete'`);
  const partition = obj(st.rollingUpdate).partition;
  if (typeof partition === 'number' && partition < 0) out.push(`spec.updateStrategy.rollingUpdate.partition: Invalid value: ${partition}: must be greater than or equal to 0`);
  const rp = obj(s.persistentVolumeClaimRetentionPolicy);
  for (const f of ['whenDeleted', 'whenScaled']) if (str(rp[f]) && !['Retain', 'Delete'].includes(str(rp[f])!)) out.push(`spec.persistentVolumeClaimRetentionPolicy.${f}: Unsupported value: "${str(rp[f])}": supported values: "Retain", "Delete"`);
  if (str(s.serviceName) && !validLabelName(str(s.serviceName)!)) out.push(`spec.serviceName: Invalid value: "${str(s.serviceName)}": a lowercase RFC 1123 label must consist of lower case alphanumeric characters or '-', and must start and end with an alphanumeric character (e.g. 'my-name',  or '123-abc', regex used for validation is '[a-z0-9]([-a-z0-9]*[a-z0-9])?')`);
  const names = new Set<string>();
  arr(s.volumeClaimTemplates).map(obj).forEach((c, i) => {
    const at = `spec.volumeClaimTemplates[${i}]`, name = str(obj(c.metadata).name) ?? '';
    if (!name) out.push(`${at}.metadata.name: Required value: name or generateName is required`);
    else if (names.has(name)) out.push(`${at}.metadata.name: Duplicate value: "${name}"`);
    names.add(name);
    out.push(...claimSpecErrors(obj(c.spec), `${at}.spec`));
  });
  return out;
}
const UPDATABLE = ['replicas', 'ordinals', 'template', 'updateStrategy', 'revisionHistoryLimit', 'persistentVolumeClaimRetentionPolicy', 'minReadySeconds'];
/** Only replicas, ordinals, template, updateStrategy, revisionHistoryLimit, the retention policy and minReadySeconds may change. */
export function setUpdateErrors(live: JObj, next: JObj): string[] {
  const rest = (o: JObj) => Object.fromEntries(Object.entries(obj(o.spec)).filter(([key]) => !UPDATABLE.includes(key))) as JObj;
  return sameJ(rest(live), rest(next)) ? [] : ["spec: Forbidden: updates to statefulset spec for fields other than 'replicas', 'ordinals', 'template', 'updateStrategy', 'revisionHistoryLimit', 'persistentVolumeClaimRetentionPolicy' and 'minReadySeconds' are forbidden"];
}

/** The revision of a template: set-<10 characters from SHA-256 of it> (real Kubernetes: FNV of the ControllerRevision's data). */
export const revisionName = (sts: JObj, template: J | undefined) => `${nameOf(sts)}-${suffix(`revision/${JSON.stringify(sortJ(template ?? null))}`, 10)}`;
export const partitionOf = (sts: JObj) => Number(obj(obj(obj(sts.spec).updateStrategy).rollingUpdate).partition ?? 0);

/** kubectl rollout status's StatefulSetStatusViewer: its message and whether the rollout is done (or its error). */
export function setRolloutStatus(sts: JObj): { msg: string; done: boolean } | { error: string } {
  const s = obj(sts.spec), st = obj(s.updateStrategy), status = obj(sts.status), want = Number(s.replicas ?? 1), n = (v: J | undefined) => Number(v ?? 0);
  if (str(st.type) !== 'RollingUpdate') return { error: 'error: rollout status is only available for RollingUpdate strategy type' };
  if (!n(status.observedGeneration) || n(obj(sts.metadata).generation) > n(status.observedGeneration)) return { msg: 'Waiting for statefulset spec update to be observed...', done: false };
  if (n(status.readyReplicas) < want) return { msg: `Waiting for ${want - n(status.readyReplicas)} pods to be ready...`, done: false };
  if (set(st.rollingUpdate)) {
    const p = partitionOf(sts);
    if (n(status.updatedReplicas) < want - p) return { msg: `Waiting for partitioned roll out to finish: ${n(status.updatedReplicas)} out of ${want - p} new pods have been updated...`, done: false };
    return { msg: `partitioned roll out complete: ${n(status.updatedReplicas)} new pods have been updated...`, done: true };
  }
  if (str(status.updateRevision) !== str(status.currentRevision)) return { msg: `waiting for statefulset rolling update to complete ${n(status.updatedReplicas)} pods at revision ${str(status.updateRevision)}...`, done: false };
  return { msg: `statefulset rolling update complete ${n(status.currentReplicas)} pods at revision ${str(status.currentRevision)}...`, done: true };
}
