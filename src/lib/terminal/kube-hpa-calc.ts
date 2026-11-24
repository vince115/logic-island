import { containerRequests } from './kube-api';
import { podFacts } from './kube-replicaset';
import { decimalSI, type Usage } from './kube-metrics';
import { milliOf, TOLERANCE } from './kube-hpa-spec';
import { arr, nameOf, obj, str, type JObj, type KubeState } from './kube-model';

/*
 * Engine stage E40 (docs/curriculum/KUB0_E40_AUTOSCALING.md §5): the HPA's ReplicaCalculator for a Resource metric, as
 * pkg/controller/podautoscaler/replica_calculator.go computes it. The target's pods are grouped: deleting or Failed pods
 * are ignored; Pending pods are unready; pods without metrics are missing; for cpu, a pod whose Ready condition is not
 * True is unready too (the simulation's simplification of the 5-minute initialization period). Utilization is
 * ⌊Σ usage × 100 ÷ Σ requests⌋ over the ready pods with metrics, the ratio that ÷ the target; within the tolerance (0.1)
 * the replicas stay, otherwise ⌈ratio × ready pods⌉. With missing pods (assumed at 100% — at least the target — when
 * scaling down, 0 when scaling up) or unready ones while scaling up (assumed 0), the ratio is worked out again and a
 * proposal that would reverse the direction keeps the current count. Values are milli-units (cpu millicores, bytes × 1000).
 */

export type Proposal = { replicas: number; status: JObj } | { error: string };
const NO_API = 'unable to fetch metrics from resource metrics API: the server could not find the requested resource (get pods.metrics.k8s.io)';

/** pod name → its usage of the resource (milli-units) for the pods metrics-server reports. */
function podMetrics(pods: readonly JObj[], usage: (p: JObj) => Usage[] | undefined, resource: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of pods) { const u = usage(p); if (u) out.set(nameOf(p), u.reduce((t, c) => t + (resource === 'cpu' ? c.cpu : c.memory * 1000), 0)); }
  return out;
}

export function resourceProposal(k: KubeState, pods: readonly JObj[], usage: ((p: JObj) => Usage[] | undefined) | undefined, metric: JObj, current: number): Proposal {
  const r = obj(metric.resource), resource = str(r.name) ?? 'cpu', target = obj(r.target), util = str(target.type) !== 'AverageValue';
  const fail = (e: string): Proposal => ({ error: `failed to get ${resource} ${util ? 'utilization' : 'usage'}: ${e}` });
  if (!usage) return fail(`unable to get metrics for resource ${resource}: ${NO_API}`);
  const metrics = podMetrics(pods, usage, resource);
  if (!metrics.size) return fail(`unable to get metrics for resource ${resource}: no metrics returned from resource metrics API`);
  if (!pods.length) return fail('no pods returned by selector while calculating replica count');
  // groupPods
  let ready = 0;
  const unready: string[] = [], missing: string[] = [], ignored: string[] = [];
  for (const p of pods) {
    const f = podFacts(k, p, Infinity), name = nameOf(p);
    if (f.deleting || f.phase === 'Failed') { ignored.push(name); continue; }
    if (f.phase === 'Pending') { unready.push(name); continue; }
    if (!metrics.has(name)) { missing.push(name); continue; }
    if (resource === 'cpu' && !f.ready) { unready.push(name); continue; }
    ready++;
  }
  for (const n of [...ignored, ...unready]) metrics.delete(n);
  if (!metrics.size) return fail('did not receive metrics for targeted pods (pods might be unready)');
  // calculatePodRequests (utilization only): every pod's containers need a request of the resource (a limit stands in, as the API server defaults it).
  const requests = new Map<string, number>();
  if (util) for (const p of pods) {
    let sum = 0;
    for (const c of arr(obj(p.spec).containers)) {
      const q = containerRequests(c);
      if (!(resource === 'cpu' ? q.cpuSet : q.memSet)) return fail(`missing request for ${resource} in container ${str(obj(c).name) ?? ''} of Pod ${nameOf(p)}`);
      sum += resource === 'cpu' ? q.cpu : q.memory * 1000;
    }
    requests.set(nameOf(p), sum);
  }
  const goal = util ? Number(target.averageUtilization ?? 80) : milliOf(resource, target.averageValue) ?? 1;
  const measure = (m: Map<string, number>): { ratio: number; value: number; raw: number } | null => {
    if (!util) { let total = 0; for (const v of m.values()) total += v; const value = Math.trunc(total / m.size); return { ratio: value / goal, value, raw: value }; }
    let used = 0, requested = 0, n = 0;
    for (const [p, v] of m) { const q = requests.get(p); if (q === undefined) continue; used += v; requested += q; n++; }
    if (!requested) return null;
    const value = Math.trunc(used * 100 / requested);
    return { ratio: value / goal, value, raw: Math.trunc(used / n) };
  };
  const first = measure(metrics);
  if (!first) return fail('no metrics returned matched known pods');
  const status: JObj = { resource: { current: util ? { averageUtilization: first.value, averageValue: decimalSI(first.raw) } : { averageValue: decimalSI(first.value) }, name: resource }, type: 'Resource' };
  const done = (replicas: number): Proposal => ({ replicas, status });
  const withUnready = unready.length > 0 && first.ratio > 1;
  if (!withUnready && !missing.length) return done(Math.abs(1 - first.ratio) <= TOLERANCE ? current : Math.ceil(first.ratio * ready));
  for (const n of missing) metrics.set(n, first.ratio < 1 ? (util ? Math.trunc((requests.get(n) ?? 0) * Math.max(100, goal) / 100) : goal) : 0);
  if (withUnready) for (const n of unready) metrics.set(n, 0);
  const again = measure(metrics);
  if (!again) return fail('no metrics returned matched known pods');
  const r2 = again.ratio;
  if (Math.abs(1 - r2) <= TOLERANCE || (first.ratio < 1 && r2 > 1) || (first.ratio > 1 && r2 < 1)) return done(current);
  const next = Math.ceil(r2 * metrics.size);
  return done((r2 < 1 && next > current) || (r2 > 1 && next < current) ? current : next);
}
