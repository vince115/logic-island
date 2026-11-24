import type { Seconds } from './clock';
import { about, created, put, record, remove } from './kube-api';
import { ownedBy, ownerRef, podFacts, visible } from './kube-replicaset';
import {
  CHANGE_CAUSE, defaultWorkload, DESIRED, fenceposts, HASH, HISTORY, MAX_REPLICAS, replicasOf, REVISION, templateHash, withoutHash,
} from './kube-workload-spec';
import { arr, clone, createdOf, kindOf, meta, nameOf, nsOf, obj, parseStamp, sameJ, stamp, str, uidOf, type J, type JObj, type KubeState, objectByUid } from './kube-model';
import { LAST_APPLIED } from './kube-write';

/*
 * Engine stage E34 (docs/curriculum/KUB0_E34_WORKLOADS.md §4): the Deployment controller, one sync at a time as
 * pkg/controller/deployment does it. The new ReplicaSet is the one whose template (without pod-template-hash) is the
 * Deployment's; it gets the next revision and the Deployment's annotations. RollingUpdate scales it up within maxSurge
 * and the old ones down within maxUnavailable (unhealthy old pods first, then by availability); Recreate scales the old
 * ones to 0 and waits until their pods are gone. A paused Deployment only scales. The status counts the ReplicaSets'
 * pods; Available and Progressing follow the real reasons (NewReplicaSetCreated, ReplicaSetUpdated,
 * NewReplicaSetAvailable, ProgressDeadlineExceeded, DeploymentPaused, DeploymentResumed). Old ReplicaSets beyond
 * revisionHistoryLimit are deleted once the rollout is complete.
 */

export const revisionOf = (o: JObj) => Number(str(obj(meta(o).annotations)[REVISION]) ?? 0);
const live = (k: KubeState, o: JObj) => objectByUid(k, uidOf(o)) ?? o;
const specReplicas = (rs: JObj) => Number(obj(rs.spec).replicas ?? 0);
const st = (rs: JObj, key: string) => Number(obj(rs.status)[key] ?? 0);
const byCreation = (a: JObj, b: JObj) => (createdOf(a) ?? 0) - (createdOf(b) ?? 0) || (nameOf(a) < nameOf(b) ? -1 : 1);
const SKIP = [LAST_APPLIED, REVISION, HISTORY, DESIRED, MAX_REPLICAS, 'deprecated.deployment.rollback.to'];

/** The Deployment's ReplicaSets at t: the new one (its template) and the others, oldest first. */
export function replicaSetsOf(k: KubeState, dep: JObj, t: Seconds): { rsNew?: JObj; olds: JObj[] } {
  const all = ownedBy(k, dep, 'ReplicaSet', t).sort(byCreation), want = withoutHash(obj(dep.spec).template);
  const rsNew = all.find(rs => sameJ(withoutHash(obj(rs.spec).template), want));
  return { rsNew, olds: all.filter(rs => rs !== rsNew) };
}

/** Scales a ReplicaSet (its desired/max annotations too) and records ScalingReplicaSet on the Deployment. */
function scale(k0: KubeState, dep: JObj, rs0: JObj, n: number, t: Seconds): KubeState {
  const rs = live(k0, rs0), from = specReplicas(rs), m = meta(rs), ann = obj(m.annotations);
  const notes = { [DESIRED]: String(replicasOf(dep)), [MAX_REPLICAS]: String(replicasOf(dep) + fenceposts(dep).surge) };
  if (from === n && ann[DESIRED] === notes[DESIRED] && ann[MAX_REPLICAS] === notes[MAX_REPLICAS]) return k0;
  let k = put(k0, { ...rs, metadata: { ...m, annotations: { ...ann, ...notes }, generation: Number(m.generation ?? 1) + (from === n ? 0 : 1) }, spec: { ...obj(rs.spec), replicas: n } });
  if (from !== n) k = record(k, t, about(dep), 'Normal', 'ScalingReplicaSet', `Scaled ${n > from ? 'up' : 'down'} replica set ${nameOf(rs)} from ${from} to ${n}`, 'deployment-controller');
  return k;
}
/** The Deployment's annotations a ReplicaSet carries (change-cause and the user's), with its revision. */
function carried(dep: JObj, rs: JObj | undefined, revision: number): JObj {
  const ann: JObj = { ...obj(meta(rs ?? {}).annotations) };
  for (const [a, b] of Object.entries(obj(meta(dep).annotations))) if (!SKIP.includes(a)) ann[a] = b;
  const old = Number(str(ann[REVISION]) ?? 0);
  if (old && old < revision) ann[HISTORY] = [...str(ann[HISTORY])?.split(',') ?? [], String(old)].join(',');
  if (!old || old < revision) ann[REVISION] = String(revision);
  return ann;
}
function createReplicaSet(k0: KubeState, dep: JObj, revision: number, t: Seconds): { k: KubeState; rs: JObj } {
  const ns = nsOf(dep) ?? 'default', spec = obj(dep.spec), tpl = clone(obj(spec.template)), tm = obj(tpl.metadata);
  let hash = templateHash(tpl), n = 0;
  while (visible(k0, 'ReplicaSet', ns, Infinity).some(o => nameOf(o) === `${nameOf(dep)}-${hash}`)) hash = templateHash(tpl, ++n);
  const labels = { ...obj(tm.labels), [HASH]: hash }, sel = obj(spec.selector);
  const doc: JObj = { apiVersion: 'apps/v1', kind: 'ReplicaSet',
    metadata: { annotations: carried(dep, undefined, revision), labels, name: `${nameOf(dep)}-${hash}`, ownerReferences: [ownerRef(dep)] },
    spec: { ...spec.minReadySeconds ? { minReadySeconds: spec.minReadySeconds } : {}, replicas: 0, selector: { ...sel, matchLabels: { ...obj(sel.matchLabels), [HASH]: hash } }, template: { ...tpl, metadata: { ...tm, labels } } } };
  const r = created(k0, doc, ns, t), rs = { ...defaultWorkload(r.o), metadata: { ...meta(r.o), generation: 1 }, status: { replicas: 0 } };
  return { k: put(r.k, rs), rs };
}

type Cond = JObj;
const condition = (type: string, status: string, reason: string, message: string, t: Seconds): Cond => ({ lastTransitionTime: stamp(t), lastUpdateTime: stamp(t), message, reason, status, type });
/** SetDeploymentCondition: the same status and reason change nothing; the same status keeps lastTransitionTime. */
function setCondition(list: Cond[], c: Cond, progress = false): Cond[] {
  const old = list.find(x => x.type === c.type);
  if (old && !progress && old.status === c.status && old.reason === c.reason) return list;
  const keep: JObj = old && old.status === c.status ? { lastTransitionTime: old.lastTransitionTime } : {};
  return [...list.filter(x => x.type !== c.type), { ...c, ...keep }];
}
export const conditionOf = (o: JObj, type: string) => arr(obj(o.status).conditions).map(obj).find(c => c.type === type);

/** One sync of a Deployment at t. */
export function syncDeployment(k0: KubeState, dep0: JObj, t: Seconds): KubeState {
  let k = k0, dep = dep0;
  const spec = obj(dep.spec), n = replicasOf(dep), paused = spec.paused === true, recreate = str(obj(spec.strategy).type) === 'Recreate', fp = fenceposts(dep);
  let { rsNew, olds } = replicaSetsOf(k, dep, t), conds: Cond[] = arr(obj(dep.status).conditions).map(obj);
  const progressing = () => conds.find(c => c.type === 'Progressing');
  const pausedCond = progressing()?.reason === 'DeploymentPaused';
  if (progressing()?.reason !== 'ProgressDeadlineExceeded') {
    if (paused && !pausedCond) conds = setCondition(conds, condition('Progressing', 'Unknown', 'DeploymentPaused', 'Deployment is paused', t));
    else if (!paused && pausedCond) conds = setCondition(conds, condition('Progressing', 'Unknown', 'DeploymentResumed', 'Deployment is resumed', t));
  }
  const maxOld = Math.max(0, ...olds.map(revisionOf));
  const refresh = () => { const r = replicaSetsOf(k, dep, t); rsNew = r.rsNew; olds = r.olds; };
  if (rsNew) {
    const ann = carried(dep, rsNew, maxOld + 1), mr = obj(rsNew.spec).minReadySeconds ?? 0, want = spec.minReadySeconds ?? 0;
    if (!sameJ(ann, obj(meta(rsNew).annotations)) || mr !== want) {
      k = put(k, { ...rsNew, metadata: { ...meta(rsNew), annotations: ann }, spec: { ...obj(rsNew.spec), minReadySeconds: want } });
      if (!progressing()) conds = setCondition(conds, condition('Progressing', 'True', 'FoundNewReplicaSet', `Found new replica set "${nameOf(rsNew)}"`, t));
    }
  } else if (!paused && (!recreate || !olds.some(rs => specReplicas(rs) > 0 || oldPodsRunning(k, rs, t)))) {
    const r = createReplicaSet(k, dep, maxOld + 1, t);
    k = r.k;
    conds = setCondition(conds, condition('Progressing', 'True', 'NewReplicaSetCreated', `Created new replica set "${nameOf(r.rs)}"`, t));
  }
  refresh();
  if (paused) {
    const active = [rsNew, ...olds].filter((x): x is JObj => !!x && specReplicas(x) > 0);
    const target = active.length === 1 ? active[0] : !active.length ? rsNew ?? [...olds].sort(byCreation).at(-1) : undefined;
    if (target) k = scale(k, dep, target, n, t);
    else if (rsNew && specReplicas(rsNew) === n && st(rsNew, 'availableReplicas') === n) for (const rs of olds) k = scale(k, dep, rs, 0, t);
  } else if (recreate) {
    for (const rs of olds) if (specReplicas(live(k, rs)) > 0) k = scale(k, dep, rs, 0, t);
    if (rsNew && !olds.some(rs => oldPodsRunning(k, rs, t))) k = scale(k, dep, rsNew, n, t);
  } else if (rsNew) k = rolling(k, dep, rsNew, olds, n, fp, t);
  refresh();
  const all = [...rsNew ? [rsNew] : [], ...olds].map(rs => live(k, rs)), sum = (f: (rs: JObj) => number) => all.reduce((a, rs) => a + f(rs), 0);
  const available = sum(rs => st(rs, 'availableReplicas'));
  const status: JObj = { availableReplicas: available, observedGeneration: Number(meta(dep).generation ?? 1), readyReplicas: sum(rs => st(rs, 'readyReplicas')), replicas: sum(rs => st(rs, 'replicas')),
    unavailableReplicas: Math.max(0, sum(specReplicas) - available), updatedReplicas: rsNew ? st(live(k, rsNew), 'replicas') : 0 };
  conds = available >= n - fp.unavailable
    ? setCondition(conds, condition('Available', 'True', 'MinimumReplicasAvailable', 'Deployment has minimum availability.', t))
    : setCondition(conds, condition('Available', 'False', 'MinimumReplicasUnavailable', 'Deployment does not have minimum availability.', t));
  const complete = status.updatedReplicas === n && status.replicas === n && available === n;
  if (!paused) {
    const old = obj(dep.status), was = (x: string) => Number(old[x] ?? 0), name = rsNew ? `ReplicaSet "${nameOf(rsNew)}"` : `Deployment "${nameOf(dep)}"`, cur = progressing();
    const moved = Number(status.updatedReplicas) > was('updatedReplicas') || Number(status.replicas) - Number(status.updatedReplicas) < was('replicas') - was('updatedReplicas')
      || Number(status.readyReplicas) > was('readyReplicas') || available > was('availableReplicas');
    if (complete) conds = setCondition(conds, condition('Progressing', 'True', 'NewReplicaSetAvailable', `${name} has successfully progressed.`, t));
    else if (moved) conds = setCondition(conds, condition('Progressing', 'True', 'ReplicaSetUpdated', `${name} is progressing.`, t), true);
    else if (deadlineOf(dep, cur) !== undefined && deadlineOf(dep, cur)! <= t) conds = setCondition(conds, condition('Progressing', 'False', 'ProgressDeadlineExceeded', `${name} has timed out progressing.`, t));
  }
  if (paused || complete) k = cleanup(k, dep, olds);
  for (const key of ['availableReplicas', 'readyReplicas', 'replicas', 'unavailableReplicas', 'updatedReplicas']) if (status[key] === 0) delete status[key];
  dep = live(k, dep);
  const revision = rsNew ? String(revisionOf(live(k, rsNew))) : str(obj(meta(dep).annotations)[REVISION]);
  const ann = { ...obj(meta(dep).annotations), ...revision ? { [REVISION]: revision } : {} }, next: JObj = { ...dep, metadata: { ...meta(dep), annotations: ann }, status: { ...status, conditions: conds } };
  return sameJ(next, dep) ? k : put(k, next);
}

/** When the rollout times out: Progressing's lastUpdateTime plus progressDeadlineSeconds (none once it completed or timed out). */
export function deadlineOf(dep: JObj, cur = conditionOf(dep, 'Progressing')): Seconds | undefined {
  if (!cur || obj(dep.spec).paused === true || ['NewReplicaSetAvailable', 'ProgressDeadlineExceeded'].includes(str(cur.reason) ?? '')) return undefined;
  const from = parseStamp(str(cur.lastUpdateTime));
  return from === undefined ? undefined : from + Number(obj(dep.spec).progressDeadlineSeconds ?? 600);
}

/** Whether an old ReplicaSet still has pods that are not finished (Recreate waits for them). */
function oldPodsRunning(k: KubeState, rs: JObj, t: Seconds): boolean {
  return st(live(k, rs), 'replicas') > 0 || ownedBy(k, rs, 'Pod', t).some(p => { const f = podFacts(k, p, t); return f.phase !== 'Succeeded' && f.phase !== 'Failed'; });
}

/** rolloutRolling: reconcileNewReplicaSet, then reconcileOldReplicaSets (cleanupUnhealthyReplicas, scaleDownOldReplicaSetsForRollingUpdate). */
function rolling(k0: KubeState, dep: JObj, rsNew0: JObj, olds0: JObj[], n: number, fp: { surge: number; unavailable: number }, t: Seconds): KubeState {
  let k = k0;
  const rsNew = () => live(k, rsNew0), olds = () => olds0.map(rs => live(k, rs)), total = () => [rsNew(), ...olds()].reduce((a, rs) => a + specReplicas(rs), 0);
  const cur = specReplicas(rsNew());
  if (cur > n) k = scale(k, dep, rsNew(), n, t);
  else if (cur < n && total() < n + fp.surge) k = scale(k, dep, rsNew(), cur + Math.min(n + fp.surge - total(), n - cur), t);
  if (!olds().some(rs => specReplicas(rs) > 0)) return k;
  const minAvailable = n - fp.unavailable, maxDown = total() - minAvailable - (specReplicas(rsNew()) - st(rsNew(), 'availableReplicas'));
  if (maxDown <= 0) return k;
  let cleaned = 0;
  for (const rs of olds()) {
    if (cleaned >= maxDown) break;
    const r = specReplicas(rs), unhealthy = r - st(rs, 'availableReplicas');
    if (!r || unhealthy <= 0) continue;
    const down = Math.min(maxDown - cleaned, unhealthy);
    k = scale(k, dep, rs, r - down, t);
    cleaned += down;
  }
  const available = [rsNew(), ...olds()].reduce((a, rs) => a + Math.min(st(rs, 'availableReplicas'), specReplicas(rs)), 0);
  if (available <= minAvailable) return k;
  let left = available - minAvailable;
  for (const rs of olds()) {
    if (left <= 0) break;
    const r = specReplicas(rs);
    if (!r) continue;
    const down = Math.min(r, left);
    k = scale(k, dep, rs, r - down, t);
    left -= down;
  }
  return k;
}

/** cleanupDeployment: old ReplicaSets beyond revisionHistoryLimit (oldest revisions first), only empty ones. */
function cleanup(k0: KubeState, dep: JObj, olds: JObj[]): KubeState {
  let k = k0;
  const list = olds.map(rs => live(k, rs)).filter(rs => !meta(rs).deletionTimestamp).sort((a, b) => revisionOf(a) - revisionOf(b));
  const diff = list.length - Number(obj(dep.spec).revisionHistoryLimit ?? 10);
  for (const rs of list.slice(0, Math.max(0, diff))) if (!specReplicas(rs) && !st(rs, 'replicas')) k = remove(k, rs);
  return k;
}
export const changeCauseOf = (rs: JObj): string | undefined => str(obj(meta(rs).annotations)[CHANGE_CAUSE]);
export const isDeployment = (o: J) => kindOf(obj(o)) === 'Deployment';

/** The status viewer of a Deployment: a waiting message, success, or the deadline error. */
export function rolloutStatus(d: JObj): { msg: string; done?: true } | { error: string } {
  const s = obj(d.status), n = Number(obj(d.spec).replicas ?? 1), name = nameOf(d), num = (key: string) => Number(s[key] ?? 0);
  if (Number(meta(d).generation ?? 1) > num('observedGeneration')) return { msg: 'Waiting for deployment spec update to be observed...' };
  if (str(conditionOf(d, 'Progressing')?.reason) === 'ProgressDeadlineExceeded') return { error: `error: deployment "${name}" exceeded its progress deadline` };
  const wait = `Waiting for deployment "${name}" rollout to finish: `;
  if (num('updatedReplicas') < n) return { msg: `${wait}${num('updatedReplicas')} out of ${n} new replicas have been updated...` };
  if (num('replicas') > num('updatedReplicas')) return { msg: `${wait}${num('replicas') - num('updatedReplicas')} old replicas are pending termination...` };
  if (num('availableReplicas') < num('updatedReplicas')) return { msg: `${wait}${num('availableReplicas')} of ${num('updatedReplicas')} updated replicas are available...` };
  return { msg: `deployment "${name}" successfully rolled out`, done: true };
}
/** The revisions of a Deployment (its ReplicaSets with a revision), oldest first. */
export function historyOf(k: KubeState, d: JObj): JObj[] {
  const { rsNew, olds } = replicaSetsOf(k, d, Infinity);
  return [...rsNew ? [rsNew] : [], ...olds].filter(rs => revisionOf(rs) > 0).sort((a, b) => revisionOf(a) - revisionOf(b));
}
