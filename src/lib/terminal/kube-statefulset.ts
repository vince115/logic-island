import type { Seconds } from './clock';
import type { DockerState } from './docker';
import { about, created, put, record } from './kube-api';
import { endPod, ownedBy, ownerRef, podFacts } from './kube-replicaset';
import { defaultStorage } from './kube-storage-spec';
import { findIn } from './kube-storage-model';
import { partitionOf, POD_INDEX_LABEL, POD_NAME_LABEL, REVISION_LABEL, revisionName } from './kube-statefulset-spec';
import { arr, clone, labelsOf, meta, nameOf, nsOf, obj, sameJ, str, uidOf, type J, type JObj, type KubeState } from './kube-model';

/*
 * Engine stage E38 (docs/curriculum/KUB0_E38_KUBE_STORAGE.md §6): the StatefulSet controller. Pods are <set>-0 …
 * <set>-(N-1) with the stable hostname and the headless Service as subdomain, and a claim per volumeClaimTemplate
 * (<template>-<set>-<i>) made before the pod. OrderedReady makes one pod at a time, each after the one before it is
 * Running and Ready, and removes the highest ordinal first, one at a time; Parallel makes and removes them all at once.
 * A deleted pod comes back with the same name and the same claims. RollingUpdate replaces pods from the highest ordinal
 * down to the partition, one at a time (OnDelete: only pods the learner deletes); scale-down and deletion keep the claims
 * unless persistentVolumeClaimRetentionPolicy says Delete. Its status counts the pods of each revision.
 */

const CTRL = 'statefulset-controller';
const ordinalOf = (set: JObj, pod: JObj) => { const n = nameOf(pod), base = `${nameOf(set)}-`; return n.startsWith(base) && /^\d+$/.test(n.slice(base.length)) ? Number(n.slice(base.length)) : -1; };
const claimTemplates = (set: JObj) => arr(obj(set.spec).volumeClaimTemplates).map(obj).sort((a, b) => (str(obj(a.metadata).name) ?? '').localeCompare(str(obj(b.metadata).name) ?? ''));
const claimName = (set: JObj, c: JObj, i: number) => `${str(obj(c.metadata).name) ?? ''}-${nameOf(set)}-${i}`;
const revisionOf = (pod: JObj) => labelsOf(pod)[REVISION_LABEL];

/** The claims of ordinal i, made when missing (false: one is being deleted, so the pod waits). */
function ensureClaims(k0: KubeState, set: JObj, i: number, t: Seconds): { k: KubeState; ok: boolean } {
  let k = k0;
  const ns = nsOf(set) ?? 'default', owned = str(obj(obj(set.spec).persistentVolumeClaimRetentionPolicy).whenDeleted) === 'Delete';
  for (const c of claimTemplates(set)) {
    const name = claimName(set, c, i), have = findIn(k, 'PersistentVolumeClaim', ns, name);
    if (have) { if (meta(have).deletionTimestamp) return { k, ok: false }; continue; }
    const cm = obj(c.metadata), labels = { ...obj(cm.labels), ...obj(obj(obj(set.spec).selector).matchLabels) };
    const doc: JObj = { apiVersion: 'v1', kind: 'PersistentVolumeClaim', metadata: { ...cm.annotations ? { annotations: clone(cm.annotations) } : {}, labels, name, ...owned ? { ownerReferences: [ownerRef(set)] } : {} }, spec: clone(obj(c.spec)) };
    const r = created(k, doc, ns, t);
    k = record(put(r.k, defaultStorage(r.k, r.o, t, true)), t, about(set), 'Normal', 'SuccessfulCreate', `create Claim ${name} Pod ${nameOf(set)}-${i} in StatefulSet ${nameOf(set)} success`, CTRL);
  }
  return { k, ok: true };
}
/** Pod i at a revision (the template that revision recorded). */
function newPod(k0: KubeState, set: JObj, i: number, rev: string, t: Seconds): KubeState {
  const s = obj(set.spec), tpl = obj(k0.storage?.revisions?.[`${uidOf(set)}/${rev}`] ?? s.template), tm = obj(tpl.metadata), name = `${nameOf(set)}-${i}`;
  const claims = claimTemplates(set), names = new Set(claims.map(c => str(obj(c.metadata).name))), spec = clone(obj(tpl.spec));
  const volumes: J[] = [...claims.map(c => ({ name: str(obj(c.metadata).name) ?? '', persistentVolumeClaim: { claimName: claimName(set, c, i) } })), ...arr(spec.volumes).filter(v => !names.has(str(obj(v).name)))];
  const doc: JObj = { apiVersion: 'v1', kind: 'Pod', metadata: { ...tm.annotations ? { annotations: clone(tm.annotations) } : {}, labels: { ...obj(tm.labels), [REVISION_LABEL]: rev, [POD_INDEX_LABEL]: String(i), [POD_NAME_LABEL]: name },
    name, ownerReferences: [ownerRef(set)] }, spec: { ...spec, ...volumes.length ? { volumes } : {}, hostname: name, ...str(s.serviceName) ? { subdomain: str(s.serviceName) } : {} } };
  const r = created(k0, doc, nsOf(set) ?? 'default', t);
  return record(put(r.k, r.o), t, about(set), 'Normal', 'SuccessfulCreate', `create Pod ${name} in StatefulSet ${nameOf(set)} successful`, CTRL);
}
function deletePod(d: DockerState | undefined, k: KubeState, set: JObj, pod: JObj, t: Seconds): KubeState {
  return record(endPod(d, k, pod, t), t, about(set), 'Normal', 'SuccessfulDelete', `delete Pod ${nameOf(pod)} in StatefulSet ${nameOf(set)} successful`, CTRL);
}

/** One sync of a StatefulSet at t: create, condemn, update, then its status. */
export function syncStatefulSet(d: DockerState | undefined, k0: KubeState, set: JObj, t: Seconds): KubeState {
  const s = obj(set.spec), want = Number(s.replicas ?? 1), monotonic = str(s.podManagementPolicy) !== 'Parallel', rolling = str(obj(s.updateStrategy).type) === 'RollingUpdate';
  const update = revisionName(set, s.template), current = str(obj(set.status).currentRevision) ?? update, key = `${uidOf(set)}/${update}`;
  let k = k0.storage!.revisions?.[key] ? k0 : { ...k0, storage: { ...k0.storage!, revisions: { ...k0.storage!.revisions, [key]: clone(obj(s.template)) } } };
  const pods = () => ownedBy(k, set, 'Pod', t).filter(p => ordinalOf(set, p) >= 0);
  const healthy = (p: JObj) => { const f = podFacts(k, p, t); return f.ready && !f.deleting; };
  const done = () => setStatus(k, set, t, current, update);
  for (let i = 0; i < want; i++) {
    const pod = pods().find(p => ordinalOf(set, p) === i);
    if (!pod) {
      const c = ensureClaims(k, set, i, t);
      k = c.k;
      if (c.ok) k = newPod(k, set, i, rolling && i < partitionOf(set) ? current : update, t);
      if (monotonic) return done();
      continue;
    }
    const f = podFacts(k, pod, t);
    // A pod that failed or finished is deleted and made again.
    if ((f.phase === 'Failed' || f.phase === 'Succeeded') && !f.deleting) { k = deletePod(d, k, set, pod, t); if (monotonic) return done(); continue; }
    if (monotonic && !healthy(pod)) return done();
  }
  for (const pod of pods().filter(p => ordinalOf(set, p) >= want).sort((a, b) => ordinalOf(set, b) - ordinalOf(set, a))) {
    if (podFacts(k, pod, t).deleting) { if (monotonic) return done(); continue; }
    if (monotonic && pods().some(p => p !== pod && !healthy(p))) return done();
    // whenScaled: Delete — the claims of the condemned ordinal are owned by its pod, so they go with it.
    if (str(obj(s.persistentVolumeClaimRetentionPolicy).whenScaled) === 'Delete') for (const c of claimTemplates(set)) {
      const pvc = findIn(k, 'PersistentVolumeClaim', nsOf(set) ?? 'default', claimName(set, c, ordinalOf(set, pod)));
      if (pvc) k = put(k, { ...pvc, metadata: { ...meta(pvc), ownerReferences: [{ apiVersion: 'v1', kind: 'Pod', name: nameOf(pod), uid: uidOf(pod) }] } });
    }
    k = deletePod(d, k, set, pod, t);
    if (monotonic) return done();
  }
  if (rolling && !pods().some(p => ordinalOf(set, p) < want && !healthy(p))) {
    for (let i = want - 1; i >= partitionOf(set); i--) {
      const pod = pods().find(p => ordinalOf(set, p) === i);
      if (pod && revisionOf(pod) !== update) { k = deletePod(d, k, set, pod, t); break; }
    }
  }
  return done();
}

/** The status: pods made, ready, of the current and the update revision (the rollout completes when every pod is updated and ready). */
function setStatus(k: KubeState, set0: JObj, t: Seconds, current: string, update: string): KubeState {
  const set = k.objects.find(o => uidOf(o) === uidOf(set0)) ?? set0, pods = ownedBy(k, set, 'Pod', t).filter(p => ordinalOf(set, p) >= 0);
  const facts = pods.map(p => podFacts(k, p, t)), live = facts.filter(f => !f.deleting), ready = facts.filter(f => f.ready).length;
  const updated = live.filter(f => revisionOf(f.pod) === update).length, rolling = str(obj(obj(set.spec).updateStrategy).type) === 'RollingUpdate';
  const complete = rolling && updated === pods.length && ready === pods.length, cur = complete ? update : current;
  const status: JObj = { availableReplicas: ready, collisionCount: 0, currentReplicas: complete ? updated : live.filter(f => revisionOf(f.pod) === cur).length, currentRevision: cur,
    observedGeneration: Number(meta(set).generation ?? 1), readyReplicas: ready, replicas: pods.length, updateRevision: update, updatedReplicas: updated };
  for (const f of ['readyReplicas', 'currentReplicas', 'updatedReplicas'] as const) if (status[f] === 0) delete status[f];
  return sameJ(set.status, status) ? k : put(k, { ...set, status });
}
