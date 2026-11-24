import type { FsState } from './fs';
import { settleKube } from './kube-settle';
import { conditionOf, changeCauseOf, historyOf, revisionOf, rolloutStatus } from './kube-deployment';
import { arr, kindOf, nameOf, nsOf, obj, str, type JObj } from './kube-model';

/*
 * Engine stage E34 (docs/curriculum/KUB0_E34_WORKLOADS.md §10): the checks kube-workload (a Deployment's or ReplicaSet's
 * replicas, ready, updated and available pods, a container's image, the revision, paused, a condition) and kube-rollout
 * (the rollout is complete as kubectl rollout status says, the current revision, its CHANGE-CAUSE, how many revisions
 * the history lists). Both read the cluster settled to the clock and never move it.
 */

export type WorkloadCheck =
  | { kind: 'kube-workload'; resource?: 'Deployment' | 'ReplicaSet' | 'StatefulSet'; name: string; namespace?: string; replicas?: number; readyReplicas?: number; updatedReplicas?: number; availableReplicas?: number;
    image?: string; container?: string; revision?: number; paused?: boolean; condition?: { type: string; status: string; reason?: string };
    /** E38 (a StatefulSet): its revisions by name, and whether the rollout is done (currentRevision is updateRevision). */ currentRevision?: string; updateRevision?: string; rolledOut?: boolean }
  | { kind: 'kube-rollout'; name: string; namespace?: string; complete?: boolean; revision?: number; changeCause?: string; history?: number };
export const WORKLOAD_CHECK_KINDS = ['kube-workload', 'kube-rollout'] as const;
const LINE = (t: unknown, max = 253) => typeof t === 'string' && t.length >= 1 && t.length <= max && !t.includes('\n');
const COUNT = (v: unknown) => v === undefined || (Number.isInteger(v) && (v as number) >= 0);
const COUNTS = ['replicas', 'readyReplicas', 'updatedReplicas', 'availableReplicas'] as const;
const COUNT_TEXT: Record<typeof COUNTS[number], string> = { replicas: 'spec.replicas', readyReplicas: '就緒的 Pod', updatedReplicas: '已更新的 Pod', availableReplicas: '可用的 Pod' };

export function workloadCheckProblems(c: WorkloadCheck, workloads: boolean, storage = false): string | null {
  if (!workloads) return `a ${c.kind} check needs a workloads machine (engine stage E34)`;
  if (!LINE(c.name) || (c.namespace !== undefined && !LINE(c.namespace, 63))) return `a ${c.kind} check needs a name (and a namespace name)`;
  if (c.kind === 'kube-rollout') {
    if (c.complete === undefined && c.revision === undefined && c.changeCause === undefined && c.history === undefined) return 'a kube-rollout check checks complete, revision, changeCause or history';
    if (c.complete !== undefined && typeof c.complete !== 'boolean') return 'a kube-rollout check\'s complete is true or false';
    if ((c.revision !== undefined && !(Number.isInteger(c.revision) && c.revision >= 1)) || !COUNT(c.history)) return 'a kube-rollout check\'s revision is 1 or more and history a whole number';
    if (c.changeCause !== undefined && !LINE(c.changeCause, 400)) return 'a kube-rollout check\'s changeCause is one line';
    return null;
  }
  const resource = c.resource ?? 'Deployment';
  // E38: a StatefulSet (kube-storage): its counts, image, revisions and rolledOut.
  if (resource === 'StatefulSet' && !storage) return 'a kube-workload check of a StatefulSet needs a kube-storage machine (engine stage E38)';
  if (resource !== 'Deployment' && resource !== 'ReplicaSet' && resource !== 'StatefulSet') return `a kube-workload check's resource is Deployment${storage ? ', ReplicaSet or StatefulSet' : ' or ReplicaSet'}`;
  if (resource === 'StatefulSet' && (c.revision !== undefined || c.paused !== undefined || c.condition !== undefined)) return 'a StatefulSet has no revision number, paused or condition (use currentRevision, updateRevision, rolledOut)';
  if (resource !== 'StatefulSet' && (c.currentRevision !== undefined || c.updateRevision !== undefined || c.rolledOut !== undefined)) return 'currentRevision, updateRevision and rolledOut are a StatefulSet\'s';
  if ((c.currentRevision !== undefined && !LINE(c.currentRevision)) || (c.updateRevision !== undefined && !LINE(c.updateRevision)) || (c.rolledOut !== undefined && typeof c.rolledOut !== 'boolean')) return 'a kube-workload check\'s revisions are names and rolledOut is true or false';
  if (!COUNTS.every(key => COUNT(c[key]))) return 'a kube-workload check\'s replicas, readyReplicas, updatedReplicas and availableReplicas are whole numbers';
  if (resource === 'ReplicaSet' && (c.updatedReplicas !== undefined || c.paused !== undefined)) return 'a ReplicaSet has no updatedReplicas or paused';
  if ((c.image !== undefined && !LINE(c.image)) || (c.container !== undefined && !LINE(c.container, 63))) return 'a kube-workload check\'s image and container are names';
  if (c.revision !== undefined && !(Number.isInteger(c.revision) && c.revision >= 1)) return 'a kube-workload check\'s revision is 1 or more';
  if (c.paused !== undefined && typeof c.paused !== 'boolean') return 'a kube-workload check\'s paused is true or false';
  if (c.condition !== undefined && (!['Available', 'Progressing', 'ReplicaFailure'].includes(c.condition.type) || !['True', 'False', 'Unknown'].includes(c.condition.status) || (c.condition.reason !== undefined && !LINE(c.condition.reason, 64))))
    return 'a kube-workload check\'s condition is { type: Available|Progressing|ReplicaFailure, status: True|False|Unknown, reason? }';
  return null;
}

export function describeWorkloadCheck(c: WorkloadCheck): string {
  const ns = c.namespace ?? 'default';
  if (c.kind === 'kube-rollout') {
    const more = [c.complete === undefined ? '' : c.complete ? '滾動更新已完成' : '滾動更新還沒完成', c.revision !== undefined ? `目前是 revision ${c.revision}` : '',
      c.changeCause !== undefined ? `CHANGE-CAUSE 是「${c.changeCause}」` : '', c.history !== undefined ? `歷史有 ${c.history} 筆` : ''].filter(Boolean);
    return `${ns} 命名空間的 Deployment ${c.name} 應該${more.join('、')}`;
  }
  const more = [...COUNTS.filter(key => c[key] !== undefined).map(key => `${COUNT_TEXT[key]} ${c[key]}`), c.image ? `${c.container ? `容器 ${c.container} 的 ` : ''}Image ${c.image}` : '',
    c.revision !== undefined ? `revision ${c.revision}` : '', c.paused === undefined ? '' : c.paused ? '已暫停' : '沒有暫停',
    c.condition ? `${c.condition.type} 是 ${c.condition.status}${c.condition.reason ? `（${c.condition.reason}）` : ''}` : '',
    c.currentRevision ? `currentRevision ${c.currentRevision}` : '', c.updateRevision ? `updateRevision ${c.updateRevision}` : '', c.rolledOut === undefined ? '' : c.rolledOut ? '所有 Pod 都是新的 revision' : '還有 Pod 是舊的 revision'].filter(Boolean);
  return `${ns} 命名空間應該有名為 ${c.name} 的 ${c.resource ?? 'Deployment'}${more.length ? `（${more.join('、')}）` : ''}`;
}

export function workloadFailure(c: WorkloadCheck, end0: FsState): string | null {
  const k = settleKube(end0).kube;
  if (!k) return '這台機器沒有 Kubernetes 叢集';
  const kind = c.kind === 'kube-rollout' ? 'Deployment' : c.resource ?? 'Deployment', ns = c.namespace ?? 'default';
  const o = k.objects.find(x => kindOf(x) === kind && nameOf(x) === c.name && nsOf(x) === ns);
  if (!o) return `沒有名為 ${c.name} 的 ${kind}`;
  const status = obj(o.status), n = (key: string) => Number(key === 'replicas' ? obj(o.spec).replicas ?? 1 : status[key] ?? 0);
  if (c.kind === 'kube-rollout') {
    const v = rolloutStatus(o), list = historyOf(k, o), done = !('error' in v) && !!v.done;
    if (c.complete !== undefined && done !== c.complete) return done ? `${c.name} 的滾動更新已經完成` : `${c.name} 的滾動更新還沒完成：${'error' in v ? v.error : v.msg}`;
    if (c.revision !== undefined && revisionOf(o) !== c.revision) return `${c.name} 目前是 revision ${revisionOf(o)}`;
    const cause = list.length ? changeCauseOf(list[list.length - 1]) ?? '<none>' : '<none>';
    if (c.changeCause !== undefined && cause !== c.changeCause) return `${c.name} 目前 revision 的 CHANGE-CAUSE 是 ${cause}`;
    if (c.history !== undefined && list.length !== c.history) return `${c.name} 的歷史有 ${list.length} 筆`;
    return null;
  }
  for (const key of COUNTS) if (c[key] !== undefined && n(key) !== c[key]) return `${c.name} 的 ${COUNT_TEXT[key]} 是 ${n(key)}`;
  if (c.image !== undefined) {
    const cs = arr(obj(obj(obj(o.spec).template).spec).containers).map(obj), one = c.container ? cs.find(x => str(x.name) === c.container) : cs[0];
    if (!one) return `${c.name} 沒有名為 ${c.container} 的容器`;
    if (str(one.image) !== c.image) return `${c.name} 的 Image 是 ${str(one.image)}`;
  }
  if (c.revision !== undefined && revisionOf(o) !== c.revision) return `${c.name} 目前是 revision ${revisionOf(o)}`;
  // E38: a StatefulSet's revisions.
  const cur = str(status.currentRevision), upd = str(status.updateRevision);
  if (c.currentRevision !== undefined && cur !== c.currentRevision) return `${c.name} 的 currentRevision 是 ${cur ?? '（沒有）'}`;
  if (c.updateRevision !== undefined && upd !== c.updateRevision) return `${c.name} 的 updateRevision 是 ${upd ?? '（沒有）'}`;
  if (c.rolledOut !== undefined && (!!upd && cur === upd) !== c.rolledOut) return c.rolledOut ? `${c.name} 還有 Pod 是舊的 revision（currentRevision ${cur}，updateRevision ${upd}）` : `${c.name} 的 Pod 都已經是新的 revision`;
  if (c.paused !== undefined && (obj(o.spec).paused === true) !== c.paused) return c.paused ? `${c.name} 沒有暫停` : `${c.name} 已暫停`;
  if (c.condition) {
    const got = conditionOf(o as JObj, c.condition.type);
    if (!got) return `${c.name} 沒有 ${c.condition.type} 條件`;
    if (str(got.status) !== c.condition.status || (c.condition.reason !== undefined && str(got.reason) !== c.condition.reason)) return `${c.name} 的 ${c.condition.type} 是 ${str(got.status)}（${str(got.reason)}）`;
  }
  return null;
}
