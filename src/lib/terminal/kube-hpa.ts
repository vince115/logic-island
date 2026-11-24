import type { Seconds } from './clock';
import type { DockerState } from './docker';
import { about, find, put, record } from './kube-api';
import { usageAt, type HpaMemory } from './kube-metrics';
import { resourceProposal } from './kube-hpa-calc';
import { normalize, type Normalized } from './kube-hpa-rate';
import { HPA, metricName, SCALABLE, SYNC_SECONDS } from './kube-hpa-spec';
import { selectorMatches } from './kube-workload-spec';
import { arr, createdOf, kindOf, labelsOf, meta, nsOf, obj, sameJ, stamp, str, systemNs, uidOf, type J, type JObj, type KubeState } from './kube-model';

/*
 * Engine stage E40 (docs/curriculum/KUB0_E40_AUTOSCALING.md §5): the horizontal pod autoscaler controller. Each HPA is
 * synced when it is created and every 15 s after (a controller time, kube-controllers.ts), as reconcileAutoscaler does:
 * get the target's scale (Deployment, ReplicaSet, StatefulSet), remember its replicas as the first recommendation, clamp
 * a count outside min..max, otherwise take the largest proposal of the metrics (kube-hpa-calc.ts), stabilize and limit it
 * (kube-hpa-rate.ts), write the target's spec.replicas, record SuccessfulRescale, and write the HPA's status and
 * conditions (AbleToScale, ScalingActive, ScalingLimited). Metric failures are the controller's warning events.
 */

const SOURCE = 'horizontal-pod-autoscaler';
const EMPTY: HpaMemory = { at: -Infinity, recs: [], ups: [], downs: [] };
const PLURAL: Record<string, string> = { Deployment: 'deployments.apps', ReplicaSet: 'replicasets.apps', StatefulSet: 'statefulsets.apps' };

/** When each HPA syncs next (after the controllers' last run). */
export function hpaTimes(k: KubeState): Seconds[] {
  if (!k.autoscale) return [];
  return k.objects.filter(o => kindOf(o) === HPA && !systemNs(k, nsOf(o))).map(o => { const m = k.autoscale!.hpa[uidOf(o)]; return m ? m.at + SYNC_SECONDS : createdOf(o) ?? 0; });
}

/** Every HPA due at t (its first sync or 15 s after its last). */
export function syncHpas(d: DockerState | undefined, k0: KubeState, t: Seconds): KubeState {
  let k = k0;
  for (const h of k0.objects) {
    if (kindOf(h) !== HPA || systemNs(k, nsOf(h))) continue;
    const m = k.autoscale?.hpa[uidOf(h)], due = m ? m.at + SYNC_SECONDS : createdOf(h) ?? t;
    if (due <= t && (m?.at ?? -Infinity) < t) k = syncHpa(d, k, k.objects.find(o => uidOf(o) === uidOf(h))!, t);
  }
  return k;
}

type Cond = { type: string; status: string; reason: string; message: string };
function syncHpa(d: DockerState | undefined, k0: KubeState, hpa: JObj, t: Seconds): KubeState {
  let k = k0;
  const id = uidOf(hpa), spec = obj(hpa.spec), ref = obj(spec.scaleTargetRef), ns = nsOf(hpa) ?? 'default', s0 = obj(hpa.status);
  const min = Number(spec.minReplicas ?? 1), max = Number(spec.maxReplicas ?? 1), kind = str(ref.kind) ?? '', name = str(ref.name) ?? '';
  let mem: HpaMemory = k.autoscale!.hpa[id] ?? EMPTY;
  const conds = arr(s0.conditions).map(obj);
  const set = (c: Cond) => {
    const at = conds.findIndex(x => x.type === c.type), was = at >= 0 ? conds[at] : undefined;
    const next: JObj = { lastTransitionTime: was && was.status === c.status ? was.lastTransitionTime ?? stamp(t) : stamp(t), message: c.message, reason: c.reason, status: c.status, type: c.type };
    if (at >= 0) conds[at] = next; else conds.push(next);
  };
  const warn = (reason: string, message: string) => { k = record(k, t, about(hpa), 'Warning', reason, message, SOURCE); };
  const finish = (status: JObj) => {
    const out = { ...status, conditions: conds as J[], observedGeneration: Number(meta(hpa).generation ?? 1) };
    k = { ...k, autoscale: { ...k.autoscale!, hpa: { ...k.autoscale!.hpa, [id]: { ...mem, at: t } } } };
    const live = k.objects.find(o => uidOf(o) === id)!;
    return sameJ(live.status, out) ? k : put(k, { ...live, status: out });
  };
  const target = SCALABLE.includes(kind) ? find(k, kind, ns, name) : undefined;
  if (!target) {
    const why = `${PLURAL[kind] ?? `${kind.toLowerCase()}s`} "${name}" not found`;
    warn('FailedGetScale', why);
    set({ type: 'AbleToScale', status: 'False', reason: 'FailedGetScale', message: `the HPA controller was unable to get the target's current scale: ${why}` });
    return finish({ ...s0, currentMetrics: s0.currentMetrics ?? null, desiredReplicas: Number(s0.desiredReplicas ?? 0) });
  }
  set({ type: 'AbleToScale', status: 'True', reason: 'SucceededGetScale', message: 'the HPA controller was able to get the target\'s current scale' });
  const current = Number(obj(target.spec).replicas ?? 1);
  if (!mem.recs.length) mem = { ...mem, recs: [{ t, n: current }] };
  let desired = 0, reason = '', statuses: J[] = Array.isArray(s0.currentMetrics) ? s0.currentMetrics : [];
  if (current === 0 && min !== 0) set({ type: 'ScalingActive', status: 'False', reason: 'ScalingDisabled', message: 'scaling is disabled since the replica count of the target is zero' });
  else if (current > max || current < min) { desired = current > max ? max : min; reason = `Current number of replicas ${current > max ? 'above Spec.MaxReplicas' : 'below Spec.MinReplicas'}`; }
  else {
    const sel = obj(target.spec).selector, pods = k.objects.filter(o => kindOf(o) === 'Pod' && nsOf(o) === ns && selectorMatches(sel, labelsOf(o)));
    const reader = k.autoscale!.metrics ? usageAt(d, k, t) : undefined, specs = arr(spec.metrics).map(obj);
    let best = -1, bestName = '', invalid = 0, first = '', bad: Cond | undefined;
    statuses = specs.map(m => {
      const p = resourceProposal(k, pods, reader ? (x: JObj) => reader.pod(x) : undefined, m, current);
      if ('error' in p) {
        invalid++; first ||= `failed to get ${str(obj(m.resource).name)} resource metric value: ${p.error}`;
        warn('FailedGetResourceMetric', p.error);
        bad ??= { type: 'ScalingActive', status: 'False', reason: 'FailedGetResourceMetric', message: `the HPA was unable to compute the replica count: ${p.error}` };
        return { type: '' };
      }
      if (best === -1 || p.replicas > best) { best = p.replicas; bestName = metricName(m); }
      return p.status;
    });
    if (invalid >= specs.length || (invalid > 0 && best < current)) {
      set(bad!);
      warn('FailedComputeMetricsReplicas', `invalid metrics (${invalid} invalid out of ${specs.length}), first error is: ${first}`);
      return finish({ ...s0, currentMetrics: statuses, currentReplicas: current, desiredReplicas: Number(s0.desiredReplicas ?? 0) });
    }
    set({ type: 'ScalingActive', status: 'True', reason: 'ValidMetricFound', message: `the HPA was able to successfully calculate a replica count from ${bestName}` });
    desired = best;
    reason = desired > current ? `${bestName} above target` : desired < current ? 'All metrics below target' : '';
    const r: Normalized = normalize(spec.behavior ? obj(spec.behavior) : undefined, mem, t, current, desired, min, max);
    mem = r.mem; desired = r.replicas;
    set({ type: 'AbleToScale', status: 'True', reason: r.able[0], message: r.able[1] });
    set({ type: 'ScalingLimited', status: r.limited ? 'True' : 'False', reason: r.limit[0], message: r.limit[1] });
  }
  const rescale = desired !== current && !(current === 0 && min !== 0);
  if (!rescale) return finish({ ...s0, currentMetrics: statuses.length ? statuses : null, currentReplicas: current, desiredReplicas: current });
  const live = k.objects.find(o => uidOf(o) === uidOf(target))!;
  k = put(k, { ...live, metadata: { ...meta(live), generation: Number(meta(live).generation ?? 1) + 1 }, spec: { ...obj(live.spec), replicas: desired } });
  set({ type: 'AbleToScale', status: 'True', reason: 'SucceededRescale', message: `the HPA controller was able to update the target scale to ${desired}` });
  k = record(k, t, about(hpa), 'Normal', 'SuccessfulRescale', `New size: ${desired}; reason: ${reason}`, SOURCE);
  if (spec.behavior) mem = desired > current ? { ...mem, ups: [...mem.ups, { t, n: desired - current }] } : { ...mem, downs: [...mem.downs, { t, n: current - desired }] };
  mem = { ...mem, hi: Math.max(mem.hi ?? desired, desired), lo: Math.min(mem.lo ?? desired, desired) };
  return finish({ ...s0, currentMetrics: statuses.length ? statuses : null, currentReplicas: current, desiredReplicas: desired, lastScaleTime: stamp(t) });
}
