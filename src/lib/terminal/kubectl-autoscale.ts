import { goJson, kubeYaml } from './kube-output';
import { createDoc } from './kube-write';
import { HPA, SCALABLE } from './kube-hpa-spec';
import { kindOf, nameOf, type JObj } from './kube-model';
import { pick, targets, type Target } from './kubectl-get';
import { topCommand } from './kubectl-top';
import { flag, type KubeResult, type Kx } from './kubectl';

/*
 * Engine stage E40 (docs/curriculum/KUB0_E40_AUTOSCALING.md §6): the autoscaling profile's verbs — kubectl top
 * (kubectl-top.ts) and kubectl autoscale TYPE NAME --max=N [--min=N] [--cpu-percent=N] [--name=…]. kubectl v1.32 writes an
 * autoscaling/v1 HPA (targetCPUUtilizationPercentage; --dry-run=client -o yaml prints it so), which the API server stores
 * and returns as autoscaling/v2: the cpu target becomes a Resource metric, no --cpu-percent is the default 80%.
 */

export function autoscaleVerb(x: Kx): KubeResult | undefined {
  if (x.verb === 'top') return topCommand(x);
  if (x.verb === 'autoscale') return autoscaleCommand(x);
  return undefined;
}
const fail = (x: Kx, line: string): KubeResult => { x.io.err(line); return { state: x.state, status: 1 }; };

function autoscaleCommand(x: Kx): KubeResult {
  const ints: Record<string, number> = {};
  for (const name of ['min', 'max', 'cpu-percent']) {
    const v = flag(x, name);
    if (v !== undefined && !/^-?\d+$/.test(v)) return fail(x, `error: invalid argument "${v}" for "--${name}" flag: strconv.ParseInt: parsing "${v}": invalid syntax`);
    ints[name] = v === undefined ? -1 : Number(v);
  }
  const { min, max } = ints, cpu = ints['cpu-percent'];
  if (!x.pos.length) return fail(x, 'error: You must provide one or more resources by argument or filename.');
  if (max < 1) return fail(x, `error: --max=MAXPODS is required and must be at least 1, max: ${max}`);
  if (max < min) return fail(x, `error: --max=MAXPODS must be larger or equal to --min=MINPODS, max: ${max}, min: ${min}`);
  const ts = targets(x, x.pos);
  if ('error' in ts) return fail(x, ts.error);
  const items: JObj[] = [], errors: string[] = [];
  for (const t of ts as Target[]) {
    if (!t.names.length) return fail(x, 'error: resource(s) were provided, but no name was specified');
    const r = pick(x, t);
    if ('error' in r) return fail(x, r.error);
    items.push(...r.items); errors.push(...r.errors);
  }
  let k = x.k;
  for (const o of items) {
    if (!SCALABLE.includes(kindOf(o))) { errors.push(`error: cannot autoscale a ${kindOf(o)}: cannot autoscale a ${kindOf(o)}`); continue; }
    const name = flag(x, 'name') ?? nameOf(o), ref = { apiVersion: 'apps/v1', kind: kindOf(o), name: nameOf(o) };
    const dry = flag(x, 'dry-run'), out = flag(x, 'output');
    if (dry === 'client') {
      const v1: JObj = { apiVersion: 'autoscaling/v1', kind: HPA, metadata: { creationTimestamp: null, name }, spec: { maxReplicas: max, ...min >= 0 ? { minReplicas: min } : {}, scaleTargetRef: ref,
        ...cpu >= 0 ? { targetCPUUtilizationPercentage: cpu } : {} }, status: { currentReplicas: 0, desiredReplicas: 0 } };
      if (out === 'yaml') kubeYaml(v1).forEach(l => x.io.out(l));
      else if (out === 'json') goJson(v1).split('\n').forEach(l => x.io.out(l));
      else x.io.out(`horizontalpodautoscaler.autoscaling/${name} autoscaled (dry run)`);
      continue;
    }
    const doc: JObj = { apiVersion: 'autoscaling/v2', kind: HPA, metadata: { name }, spec: { maxReplicas: max, ...min >= 0 ? { minReplicas: min } : {}, scaleTargetRef: ref,
      ...cpu >= 0 ? { metrics: [{ resource: { name: 'cpu', target: { averageUtilization: cpu, type: 'Utilization' } }, type: 'Resource' }] } : {} } };
    const r = createDoc(k, doc, x.ns, x.now, 'STDIN');
    if ('error' in r) { errors.push(r.error.replace('error when creating "STDIN": ', '')); continue; }
    k = r.k;
    x.io.out(`horizontalpodautoscaler.autoscaling/${name} autoscaled`);
  }
  errors.forEach(e => x.io.err(e));
  return { state: { ...x.state, kube: k }, status: errors.length ? 1 : 0 };
}
