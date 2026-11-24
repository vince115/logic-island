import { bytesOf, cpuMilli, arr, obj, quantityText, str, type J, type JObj } from './kube-model';

/*
 * Engine stage E40 (docs/curriculum/KUB0_E40_AUTOSCALING.md §4): the HorizontalPodAutoscaler object (autoscaling/v2) —
 * the API server's defaults (minReplicas 1; no metrics: cpu at 80% of the requests; a behavior given: each direction's
 * missing fields from the defaults, as SetDefaults_HorizontalPodAutoscalerBehavior fills them; no behavior stays none)
 * and its validation. Only Resource metrics of cpu and memory are simulated; Pods, Object, External and ContainerResource
 * metrics are prose, as is autoscaling/v1 in a manifest (kubectl autoscale writes v1, stored and read as v2).
 */

export const HPA = 'HorizontalPodAutoscaler';
/** The controller's --horizontal-pod-autoscaler-sync-period, the tolerance and --…-downscale-stabilization (v1.32 defaults). */
export const SYNC_SECONDS = 15, TOLERANCE = 0.1, DOWNSCALE_WINDOW = 300;
export const SCALE_UP: JObj = { policies: [{ periodSeconds: 15, type: 'Pods', value: 4 }, { periodSeconds: 15, type: 'Percent', value: 100 }], selectPolicy: 'Max', stabilizationWindowSeconds: 0 };
export const SCALE_DOWN: JObj = { policies: [{ periodSeconds: 15, type: 'Percent', value: 100 }], selectPolicy: 'Max' };
/** The kinds an HPA can scale (their /scale subresource). */
export const SCALABLE = ['Deployment', 'ReplicaSet', 'StatefulSet'];

/** copyHPAScalingRules: the given fields over the defaults. */
function rules(from: J | undefined, defaults: JObj): JObj {
  if (from === undefined || from === null) return { ...defaults };
  const f = obj(from);
  return { ...defaults, ...f.selectPolicy !== undefined ? { selectPolicy: f.selectPolicy } : {}, ...f.stabilizationWindowSeconds !== undefined ? { stabilizationWindowSeconds: f.stabilizationWindowSeconds } : {},
    ...f.policies !== undefined ? { policies: f.policies } : {} };
}
export function defaultHpa(o: JObj): JObj {
  const spec: JObj = { ...obj(o.spec) };
  spec.minReplicas ??= 1;
  if (!arr(spec.metrics).length) spec.metrics = [{ resource: { name: 'cpu', target: { averageUtilization: 80, type: 'Utilization' } }, type: 'Resource' }];
  if (spec.behavior !== undefined && spec.behavior !== null) { const b = obj(spec.behavior); spec.behavior = { scaleDown: rules(b.scaleDown, SCALE_DOWN), scaleUp: rules(b.scaleUp, SCALE_UP) }; }
  return { ...o, spec };
}

/** A metric target's value in milli-units (cpu: millicores; memory: bytes × 1000), or null. */
export function milliOf(resource: string, v: J | undefined): number | null {
  const t = quantityText(v);
  if (t === undefined) return null;
  if (resource === 'cpu') return cpuMilli(t);
  const b = bytesOf(t);
  return b === null ? null : b * 1000;
}

/** The first metric of a kind the simulation leaves to the prose, as its message (or null). */
export function hpaProse(o: JObj): string | null {
  for (const [i, m0] of arr(obj(o.spec).metrics).entries()) {
    const m = obj(m0), type = str(m.type);
    if (type && type !== 'Resource' && ['Pods', 'Object', 'External', 'ContainerResource'].includes(type)) return `（模擬環境：spec.metrics[${i}] 的 ${type} 指標只在課文說明；模擬環境的 HPA 只讀 metrics-server 的 cpu 與 memory）`;
    const name = str(obj(m.resource).name);
    if (type === 'Resource' && name && name !== 'cpu' && name !== 'memory') return `（模擬環境：spec.metrics[${i}].resource.name 只模擬 cpu 與 memory）`;
  }
  return null;
}

/** The API server's validation of a defaulted HPA (a subset of ValidateHorizontalPodAutoscaler). */
export function hpaErrors(o: JObj): string[] {
  const spec = obj(o.spec), ref = obj(spec.scaleTargetRef), out: string[] = [];
  if (!str(ref.kind)) out.push('spec.scaleTargetRef.kind: Required value');
  if (!str(ref.name)) out.push('spec.scaleTargetRef.name: Required value');
  const min = Number(spec.minReplicas ?? 1), max = Number(spec.maxReplicas ?? 0);
  if (min < 1) out.push(`spec.minReplicas: Invalid value: ${min}: must be greater than or equal to 1`);
  if (max < 1) out.push(`spec.maxReplicas: Invalid value: ${max}: must be greater than 0`);
  else if (max < min) out.push(`spec.maxReplicas: Invalid value: ${max}: must be greater than or equal to \`minReplicas\``);
  arr(spec.metrics).forEach((m0, i) => {
    const m = obj(m0), at = `spec.metrics[${i}]`, r = obj(m.resource), target = obj(r.target), type = str(target.type), name = str(r.name) ?? '';
    if (!str(m.type)) { out.push(`${at}.type: Required value: must specify a metric source type`); return; }
    if (str(m.type) !== 'Resource') return;
    if (!m.resource) { out.push(`${at}.resource: Required value: must populate information for the given metric source`); return; }
    if (!name) out.push(`${at}.resource.name: Required value: must specify a resource name`);
    if (!type) out.push(`${at}.resource.target.type: Required value: must specify a metric target type`);
    else if (type !== 'Utilization' && type !== 'AverageValue') out.push(`${at}.resource.target.type: Invalid value: "${type}": must be either Utilization or AverageValue`);
    if (type === 'Utilization' && target.averageUtilization === undefined) out.push(`${at}.resource.target.averageUtilization: Required value: must set either a target raw value or a target utilization`);
    if (type === 'Utilization' && typeof target.averageUtilization === 'number' && target.averageUtilization <= 0) out.push(`${at}.resource.target.averageUtilization: Invalid value: ${target.averageUtilization}: must be greater than 0`);
    if (type === 'AverageValue') {
      const v = milliOf(name, target.averageValue);
      if (target.averageValue === undefined) out.push(`${at}.resource.target.averageValue: Required value: must set either a target raw value or a target utilization`);
      else if (v === null || v <= 0) out.push(`${at}.resource.target.averageValue: Invalid value: "${quantityText(target.averageValue) ?? ''}": must be positive`);
    }
  });
  const b = obj(spec.behavior);
  for (const dir of ['scaleUp', 'scaleDown'] as const) {
    if (!spec.behavior || b[dir] === undefined) continue;
    const r = obj(b[dir]), at = `spec.behavior.${dir}`, win = r.stabilizationWindowSeconds, pick = str(r.selectPolicy);
    if (typeof win === 'number' && win < 0) out.push(`${at}.stabilizationWindowSeconds: Invalid value: ${win}: must be greater than or equal to zero`);
    if (typeof win === 'number' && win > 3600) out.push(`${at}.stabilizationWindowSeconds: Invalid value: ${win}: must be less than or equal to 3600`);
    if (pick !== undefined && !['Disabled', 'Max', 'Min'].includes(pick)) out.push(`${at}.selectPolicy: Unsupported value: "${pick}": supported values: "Disabled", "Max", "Min"`);
    if (!arr(r.policies).length) out.push(`${at}.policies: Required value: must specify at least one Policy`);
    arr(r.policies).forEach((p0, i) => {
      const p = obj(p0), pat = `${at}.policies[${i}]`, period = Number(p.periodSeconds ?? 0), value = Number(p.value ?? 0);
      if (!['Pods', 'Percent'].includes(str(p.type) ?? '')) out.push(`${pat}.type: Unsupported value: "${str(p.type) ?? ''}": supported values: "Percent", "Pods"`);
      if (value <= 0) out.push(`${pat}.value: Invalid value: ${value}: must be greater than zero`);
      if (period <= 0) out.push(`${pat}.periodSeconds: Invalid value: ${period}: must be greater than zero`);
      else if (period > 1800) out.push(`${pat}.periodSeconds: Invalid value: ${period}: must be less than or equal to 1800`);
    });
  }
  return out;
}

/** The metric's name in the controller's messages (cpu resource utilization (percentage of request), cpu resource). */
export const metricName = (m0: J): string => { const r = obj(obj(m0).resource); return str(obj(r.target).type) === 'AverageValue' ? `${str(r.name)} resource` : `${str(r.name)} resource utilization (percentage of request)`; };
