import type { Seconds } from './clock';
import { eventLines, mapLines, multi } from './kube-describe';
import { arr, goTab, humanDuration, createdOf, meta, nameOf, nsOf, obj, quantityText, rfc1123, str, uidOf, type J, type JObj, type KubeState } from './kube-model';

/*
 * Engine stage E40 (docs/curriculum/KUB0_E40_AUTOSCALING.md §6): kubectl get hpa (NAME REFERENCE TARGETS MINPODS MAXPODS
 * REPLICAS AGE; TARGETS as formatHPAMetrics writes it since v1.30: "cpu: 45%/50%", at most two metrics then "+ N more...")
 * and kubectl describe hpa as describeHorizontalPodAutoscalerV2 writes it (Metrics, Min/Max replicas, Behavior,
 * "Deployment pods: 3 current / 3 desired", Conditions, Events).
 */

/** One metric as current/target (utilization: 45%/50%; average value: 120m/200m; current unknown: <unknown>). */
function metricText(spec0: J, status0: J | undefined, describe: boolean): string {
  const r = obj(obj(spec0).resource), target = obj(r.target), cur = obj(obj(obj(status0).resource).current), has = !!obj(status0).resource;
  if (str(target.type) === 'AverageValue') {
    const current = has ? quantityText(cur.averageValue) ?? '<unknown>' : '<unknown>', goal = quantityText(target.averageValue) ?? '';
    return describe ? `${current} / ${goal}` : `${str(r.name)}: ${current}/${goal}`;
  }
  const pct = has && typeof cur.averageUtilization === 'number' ? `${cur.averageUtilization}%` : '<unknown>', goal = typeof target.averageUtilization === 'number' ? `${target.averageUtilization}%` : '<auto>';
  return describe ? `${has && typeof cur.averageUtilization === 'number' ? `${pct} (${quantityText(cur.averageValue) ?? ''})` : '<unknown>'} / ${goal}` : `${str(r.name)}: ${pct}/${goal}`;
}

/** formatHPAMetrics: the TARGETS column. */
export function hpaTargets(o: JObj): string {
  const specs = arr(obj(o.spec).metrics), statuses = arr(obj(o.status).currentMetrics);
  if (!specs.length) return '<none>';
  const list = specs.slice(0, 2).map((m, i) => metricText(m, statuses[i], false));
  return specs.length > 2 ? `${list.join(', ')} + ${specs.length - 2} more...` : list.join(', ');
}
export const HPA_COLUMNS = (now: Seconds) => ({ head: ['NAME', 'REFERENCE', 'TARGETS', 'MINPODS', 'MAXPODS', 'REPLICAS', 'AGE'],
  row: (o: JObj) => { const s = obj(o.spec), ref = obj(s.scaleTargetRef), c = createdOf(o);
    return [nameOf(o), `${str(ref.kind)}/${str(ref.name)}`, hpaTargets(o), s.minReplicas === undefined ? '<unset>' : String(s.minReplicas), String(s.maxReplicas ?? 0), String(obj(o.status).currentReplicas ?? 0), c === undefined ? '<unknown>' : humanDuration(now - c)]; } });

function behaviorLines(head: string, r0: J | undefined): string[] {
  if (r0 === undefined || r0 === null) return [];
  const r = obj(r0), out = [`  ${head}:`];
  if (typeof r.stabilizationWindowSeconds === 'number') out.push(`    Stabilization Window: ${r.stabilizationWindowSeconds} seconds`);
  if (arr(r.policies).length) {
    out.push(`    Select Policy: ${str(r.selectPolicy) ?? 'Max'}`, '    Policies:');
    for (const p of arr(r.policies).map(obj)) out.push(`      - Type=${str(p.type)}  Value=${String(p.value)}  Period=${String(p.periodSeconds)} seconds`);
  }
  return out;
}

export function describeHpa(k: KubeState, o: JObj, now: Seconds): string[] {
  const m = meta(o), s = obj(o.spec), st = obj(o.status), ref = obj(s.scaleTargetRef), statuses = arr(st.currentMetrics);
  const lines = [`Name:\t${nameOf(o)}`, `Namespace:\t${nsOf(o) ?? 'default'}`, ...multi('Labels:', mapLines(m.labels, '=')), ...multi('Annotations:', mapLines(m.annotations, ': ')),
    `CreationTimestamp:\t${rfc1123(createdOf(o) ?? now)}`, `Reference:\t${str(ref.kind)}/${str(ref.name)}`, 'Metrics:\t( current / target )',
    ...arr(s.metrics).map((x, i) => { const r = obj(obj(x).resource), avg = str(obj(r.target).type) === 'AverageValue';
      return `  resource ${str(r.name)} on pods${avg ? '' : '  (as a percentage of request)'}:\t${metricText(x, statuses[i], true)}`; }),
    `Min replicas:\t${s.minReplicas === undefined ? '<unset>' : String(s.minReplicas)}`, `Max replicas:\t${String(s.maxReplicas ?? 0)}`];
  // Behavior is printed only when the HPA has one (its lines are not tab cells: they break the tabwriter's block).
  if (s.behavior) lines.push('Behavior:', ...behaviorLines('Scale Up', obj(s.behavior).scaleUp), ...behaviorLines('Scale Down', obj(s.behavior).scaleDown));
  lines.push(`${str(ref.kind)} pods:\t${String(st.currentReplicas ?? 0)} current / ${String(st.desiredReplicas ?? 0)} desired`);
  const conds = arr(st.conditions).map(obj);
  if (conds.length) lines.push('Conditions:', '  Type\tStatus\tReason\tMessage', '  ----\t------\t------\t-------', ...conds.map(c => `  ${str(c.type)}\t${str(c.status)}\t${str(c.reason)}\t${str(c.message)}`));
  lines.push(...eventLines(k, uidOf(o), now));
  return goTab(lines, 0, 2);
}
