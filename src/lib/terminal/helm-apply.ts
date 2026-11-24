import type { Seconds } from './clock';
import type { FsState } from './fs';
import { find, NAMESPACED } from './kube-api';
import { applyDoc, checkDoc, createDoc, deleteObject } from './kube-write';
import { beginDelete } from './kube-stop';
import { replicaSetsOf } from './kube-deployment';
import { fenceposts, replicasOf } from './kube-workload-spec';
import { partitionOf } from './kube-statefulset-spec';
import { settleKube, waitStep } from './kube-settle';
import { clockOf } from './processes';
import { advanceClock } from './shell';
import { arr, kindOf, meta, nameOf, obj, str, type J, type JObj, type KubeState } from './kube-model';
import { byKind, UNINSTALL_ORDER } from './helm-render';

/*
 * Engine stage E39 (docs/curriculum/KUB0_E39_HELM.md §7): what Helm does to the cluster. The rendered manifests are
 * built first (kubectl's decoding and validation; an error there is "unable to build kubernetes objects from release
 * manifest"), objects that exist and do not carry this release's ownership metadata stop the install or upgrade
 * ("invalid ownership metadata"), then objects are created in install order with app.kubernetes.io/managed-by: Helm and
 * the meta.helm.sh/release-name and -namespace annotations, through kube-write.ts as kubectl apply writes them. An upgrade
 * or rollback updates with the three-way merge of the previous manifest, the live object and the new one, creates what
 * is new and deletes what the new manifest no longer has. --wait polls every 2 seconds (the clock jumps to the
 * cluster's next step) until Helm's ready checks hold or the timeout ("context deadline exceeded").
 */

export interface Res { kind: string; ns: string | undefined; name: string; doc: JObj }
export const resKey = (r: Res) => `${r.kind}/${r.ns ?? ''}/${r.name}`;
export const MANAGED_BY = 'app.kubernetes.io/managed-by', RELEASE_NAME = 'meta.helm.sh/release-name', RELEASE_NAMESPACE = 'meta.helm.sh/release-namespace';

/** The manifests' objects, each with the release's ownership metadata, in their namespace (the release's by default). */
export function resources(docs: readonly JObj[], release: string, ns: string): Res[] {
  return docs.map(d => {
    const kind = kindOf(d), m = meta(d), space = NAMESPACED[kind] === false ? undefined : str(m.namespace) ?? ns;
    const doc: JObj = { ...d, metadata: { ...m, labels: { ...obj(m.labels), [MANAGED_BY]: 'Helm' }, annotations: { ...obj(m.annotations), [RELEASE_NAME]: release, [RELEASE_NAMESPACE]: ns } } };
    return { kind, ns: space, name: nameOf(d), doc };
  });
}
const serverText = (e: string) => e.replace(/^Error from server \([A-Za-z]+\): error when (?:creating|patching) "[^"]*": /, '').replace(/^error: /, '');
const atCreate = (e: string) => /^Error from server \(NotFound\)/.test(e) || e.startsWith('The ') || e.startsWith('Error from server (Forbidden)');

/** KubeClient.Build: the first object the API's schemas refuse (namespaces and validation are the server's, later). */
export function buildError(k: KubeState, res: readonly Res[], ns: string): string | null {
  for (const r of res) {
    const e = checkDoc(k, r.doc, r.ns ?? ns, '');
    if (e && !atCreate(e)) return e.startsWith('（') ? e : `unable to build kubernetes objects from release manifest: ${serverText(e)}`;
  }
  return null;
}
/** existingResourceConflict: an object that exists without this release's ownership metadata. */
export function ownershipError(k: KubeState, res: readonly Res[], release: string, ns: string, verb: 'install' | 'update', skip: ReadonlySet<string> = new Set()): string | null {
  for (const r of res) {
    if (skip.has(resKey(r))) continue;
    const live = find(k, r.kind, r.ns, r.name);
    if (!live) continue;
    const labels = obj(meta(live).labels), notes = obj(meta(live).annotations), errs: string[] = [];
    const want = (what: 'label' | 'annotation', key: string, value: string, have: J | undefined) => {
      if (have === undefined) errs.push(`${what} validation error: missing key "${key}": must be set to "${value}"`);
      else if (have !== value) errs.push(`${what} validation error: key "${key}" must equal "${value}": current value is "${String(have)}"`);
    };
    want('label', MANAGED_BY, 'Helm', labels[MANAGED_BY]);
    want('annotation', RELEASE_NAME, release, notes[RELEASE_NAME]);
    want('annotation', RELEASE_NAMESPACE, ns, notes[RELEASE_NAMESPACE]);
    if (errs.length) return `Unable to continue with ${verb}: ${r.kind} "${r.name}" in namespace "${r.ns ?? ''}" exists and cannot be imported into the current release: invalid ownership metadata; ${errs.join('; ')}`;
  }
  return null;
}

/** Creates (or, adopted, updates) the objects in order; stops at the first error. */
export function createAll(k0: KubeState, res: readonly Res[], ns: string, t: Seconds): { k: KubeState; error?: string } {
  let k = k0;
  for (const r of res) {
    const w = find(k, r.kind, r.ns, r.name) ? applyDoc(k, r.doc, r.ns ?? ns, t, '', { last: undefined }) : createDoc(k, r.doc, r.ns ?? ns, t, '');
    if ('error' in w) return { k, error: serverText(w.error) };
    k = w.k;
  }
  return { k };
}
/** Updates from the current manifest's objects to the target's: create or three-way update in order, then delete the rest. */
export function updateAll(d: FsState['docker'], k0: KubeState, current: readonly Res[], target: readonly Res[], ns: string, t: Seconds): { k: KubeState; error?: string } {
  let k = k0;
  const old = new Map(current.map(r => [resKey(r), r])), keep = new Set(target.map(resKey));
  for (const r of target) {
    const w = find(k, r.kind, r.ns, r.name) ? applyDoc(k, r.doc, r.ns ?? ns, t, '', { last: old.get(resKey(r))?.doc }) : createDoc(k, r.doc, r.ns ?? ns, t, '');
    if ('error' in w) return { k, error: serverText(w.error) };
    k = w.k;
  }
  return { k: deleteAll(d, k, current.filter(r => !keep.has(resKey(r))), t) };
}
/** Deletes the objects that exist, in Helm's uninstall order (a pod ends gracefully on the probes profile). */
export function deleteAll(d: FsState['docker'], k0: KubeState, res: readonly Res[], t: Seconds): KubeState {
  let k = k0;
  for (const r of byKind(res, x => x.kind, UNINSTALL_ORDER)) {
    const live = find(k, r.kind, r.ns, r.name);
    if (!live) continue;
    k = r.kind === 'Pod' && k.probes ? beginDelete(d, k, live, Number(obj(live.spec).terminationGracePeriodSeconds ?? 30), t).k : deleteObject(k, live, t);
  }
  return k;
}
/** A command changed the cluster at t: the controllers (and the endpoints controllers) run then. */
export const dirty = (k: KubeState, t: Seconds): KubeState => ({ ...k, ...k.workloads ? { dirty: Math.min(k.dirty ?? t, t) } : {}, ...k.net ? { netDirty: Math.min(k.netDirty ?? t, t) } : {} });

const num = (o: JObj, key: string) => Number(obj(o.status)[key] ?? 0);
/** Helm's ReadyChecker for one object (others are ready when they exist). */
function ready(k: KubeState, r: Res, now: Seconds): boolean {
  const live = find(k, r.kind, r.ns, r.name);
  if (!live) return false;
  const spec = obj(live.spec);
  switch (r.kind) {
    case 'Pod': return arr(obj(live.status).conditions).some(c => str(obj(c).type) === 'Ready' && str(obj(c).status) === 'True');
    case 'Deployment': {
      if (spec.paused === true) return true;
      const rs = replicaSetsOf(k, live, now).rsNew;
      return !!rs && num(rs, 'readyReplicas') >= replicasOf(live) - fenceposts(live).unavailable;
    }
    case 'StatefulSet': {
      if (Number(meta(live).generation ?? 1) > num(live, 'observedGeneration')) return false;
      if ((str(obj(spec.updateStrategy).type) ?? 'RollingUpdate') !== 'RollingUpdate') return true;
      const n = replicasOf(live), part = partitionOf(live), st = obj(live.status);
      if (num(live, 'updatedReplicas') < n - part || num(live, 'readyReplicas') !== n) return false;
      return part > 0 || str(st.currentRevision) === str(st.updateRevision);
    }
    case 'Service': {
      if (str(spec.type) === 'ExternalName') return true;
      if (!str(spec.clusterIP)) return false;
      return str(spec.type) !== 'LoadBalancer' || arr(spec.externalIPs).length > 0 || arr(obj(obj(live.status).loadBalancer).ingress).length > 0;
    }
    case 'PersistentVolumeClaim': return str(obj(live.status).phase) === 'Bound';
    default: return true;
  }
}
/** --wait: polls every 2 s from the state (settled), the clock moving, until all are ready or the timeout. */
export function waitReady(state0: FsState, res: readonly Res[], timeout: number): { state: FsState; ok: boolean } {
  let s = settleKube(state0), waited = 0;
  for (;;) {
    const now = clockOf(s).now;
    if (res.every(r => ready(s.kube!, r, now))) return { state: s, ok: true };
    if (waited >= timeout) return { state: s, ok: false };
    const step = Math.min(timeout - waited, Math.ceil(waitStep(s, timeout - waited) / 2) * 2);
    s = settleKube(advanceClock(s, step));
    waited += step;
  }
}
