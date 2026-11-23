import type { Seconds } from './clock';
import { containerLines, eventLines, mapLines, multi } from './kube-describe';
import { controllerOf, ownedBy } from './kube-replicaset';
import { replicaSetsOf } from './kube-deployment';
import { rollingText, selectorText } from './kube-workload-spec';
import { arr, goTab, kindOf, meta, nameOf, nsOf, obj, rfc1123, str, uidOf, createdOf, type J, type JObj, type KubeState } from './kube-model';

/*
 * Engine stage E34 (docs/curriculum/KUB0_E34_WORKLOADS.md §7): kubectl describe deployment and replicaset as kubectl's
 * describers write them — the pod template (DescribePodTemplate: container names one space deeper than a Pod's), the
 * Deployment's Replicas line, StrategyType, RollingUpdateStrategy, Conditions, OldReplicaSets and NewReplicaSet, the
 * ReplicaSet's Controlled By, Replicas and Pods Status — and the template kubectl rollout history --revision prints.
 */

/** DescribePodTemplate (its lines before the tabwriter). */
export function templateLines(t0: J | undefined): string[] {
  const t = obj(t0), m = obj(t.metadata), spec = obj(t.spec), lines = ['Pod Template:', ...multi('Labels:', mapLines(m.labels, '='), '  ')];
  if (Object.keys(obj(m.annotations)).length) lines.push(...multi('Annotations:', mapLines(m.annotations, ': '), '  '));
  const cs = (head: string, list: J | undefined) => [`  ${head}:`, ...arr(list).flatMap(c => containerLines(c, undefined).map((l, i) => i === 0 ? ` ${l}` : l))];
  if (arr(spec.initContainers).length) lines.push(...cs('Init Containers', spec.initContainers));
  lines.push(...cs('Containers', spec.containers), '  Volumes:\t<none>', ...multi('Node-Selectors:', mapLines(spec.nodeSelector, '='), '  '));
  const tol = arr(spec.tolerations).map(obj).map(x => `${str(x.key) ?? ''}${str(x.value) ? `=${str(x.value)}` : ''}${str(x.effect) ? `:${str(x.effect)}` : ''} op=${str(x.operator) ?? 'Equal'}${typeof x.tolerationSeconds === 'number' ? ` for ${x.tolerationSeconds}s` : ''}`);
  lines.push(...multi('Tolerations:', tol, '  '));
  return lines;
}
const head = (o: JObj) => [`Name:\t${nameOf(o)}`, `Namespace:\t${nsOf(o) ?? 'default'}`];
const n = (v: J | undefined) => Number(v ?? 0);

function describeDeployment(k: KubeState, d: JObj, now: Seconds): string[] {
  const m = meta(d), spec = obj(d.spec), s = obj(d.status), type = str(obj(spec.strategy).type) ?? 'RollingUpdate';
  const lines = [...head(d), `CreationTimestamp:\t${rfc1123(createdOf(d) ?? now)}`, ...multi('Labels:', mapLines(m.labels, '=')), ...multi('Annotations:', mapLines(m.annotations, ': ')),
    `Selector:\t${selectorText(spec.selector)}`,
    `Replicas:\t${n(spec.replicas)} desired | ${n(s.updatedReplicas)} updated | ${n(s.replicas)} total | ${n(s.availableReplicas)} available | ${n(s.unavailableReplicas)} unavailable`,
    `StrategyType:\t${type}`, `MinReadySeconds:\t${n(spec.minReadySeconds)}`, ...type === 'RollingUpdate' ? [`RollingUpdateStrategy:\t${rollingText(d)}`] : [], ...templateLines(spec.template)];
  const conds = arr(s.conditions).map(obj);
  if (conds.length) lines.push('Conditions:', '  Type\tStatus\tReason', '  ----\t------\t------', ...conds.map(c => `  ${str(c.type)} \t${str(c.status)}\t${str(c.reason)}`));
  const { rsNew, olds } = kindOf(d) === 'Deployment' && nsOf(d) !== 'kube-system' ? replicaSetsOf(k, d, Infinity) : systemSets(k, d);
  const created = (rs: JObj) => `${nameOf(rs)} (${n(obj(rs.status).replicas)}/${n(obj(rs.spec).replicas)} replicas created)`;
  const old = olds.filter(rs => n(obj(rs.spec).replicas) > 0);
  lines.push(`OldReplicaSets:\t${old.length ? old.map(created).join(', ') : '<none>'}`, `NewReplicaSet:\t${rsNew ? created(rsNew) : '<none>'}`, ...eventLines(k, uidOf(d), now));
  return lines;
}
/** kube-system's Deployment (coredns) is not reconciled: its one ReplicaSet is the new one. */
function systemSets(k: KubeState, d: JObj): { rsNew?: JObj; olds: JObj[] } {
  return { rsNew: k.objects.find(o => kindOf(o) === 'ReplicaSet' && str(controllerOf(o)?.uid) === uidOf(d)), olds: [] };
}

function describeReplicaSet(k: KubeState, rs: JObj, now: Seconds): string[] {
  const m = meta(rs), spec = obj(rs.spec), owner = controllerOf(rs);
  const pods = nsOf(rs) === 'kube-system' ? k.objects.filter(o => kindOf(o) === 'Pod' && str(controllerOf(o)?.uid) === uidOf(rs)) : ownedBy(k, rs, 'Pod', Infinity);
  const phase = (p: string) => pods.filter(o => (str(obj(o.status).phase) ?? 'Pending') === p).length;
  const lines = [...head(rs), `Selector:\t${selectorText(spec.selector)}`, ...multi('Labels:', mapLines(m.labels, '=')), ...multi('Annotations:', mapLines(m.annotations, ': ')),
    ...owner ? [`Controlled By:\t${str(owner.kind)}/${str(owner.name)}`] : [], `Replicas:\t${n(obj(rs.status).replicas)} current / ${n(spec.replicas)} desired`,
    `Pods Status:\t${phase('Running')} Running / ${phase('Pending')} Waiting / ${phase('Succeeded')} Succeeded / ${phase('Failed')} Failed`, ...templateLines(spec.template), ...eventLines(k, uidOf(rs), now)];
  return lines;
}

/** describe of a Deployment or ReplicaSet (through describe's tabwriter). */
export function describeWorkload(k: KubeState, o: JObj, now: Seconds): string[] {
  return goTab(kindOf(o) === 'Deployment' ? describeDeployment(k, o, now) : describeReplicaSet(k, o, now), 0, 2);
}
/** rollout history --revision=N: the ReplicaSet's template, as kubectl prints it. */
export const historyTemplate = (rs: JObj) => goTab(templateLines(obj(rs.spec).template), 0, 2);
