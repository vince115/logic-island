import type { FsState } from './fs';
import { settleKube } from './kube-settle';
import { find } from './kube-api';
import { HPA, milliOf } from './kube-hpa-spec';
import { arr, obj, quantityText, str, uidOf } from './kube-model';

/*
 * Engine stage E40 (docs/curriculum/KUB0_E40_AUTOSCALING.md §9): the check kube-hpa — a HorizontalPodAutoscaler (in a
 * namespace) exists (or not) with its target (Kind/name), minReplicas, maxReplicas, a Resource metric's target
 * (utilization percent or average value, compared as a quantity), the status' currentReplicas and desiredReplicas, a
 * condition, and over the whole run the extremes the controller scaled the target to (scaledAtLeast: it reached at least
 * N; scaledAtMost: it never went above N; no rescale at all fails both). It reads the cluster settled to the clock.
 */

export type HpaCheck = { kind: 'kube-hpa'; name: string; namespace?: string; absent?: true; target?: string; minReplicas?: number; maxReplicas?: number;
  metric?: { resource: 'cpu' | 'memory'; utilization?: number; averageValue?: string }; currentReplicas?: number; desiredReplicas?: number;
  condition?: { type: string; status: string; reason?: string }; scaledAtLeast?: number; scaledAtMost?: number };
const LINE = (t: unknown, max = 253) => typeof t === 'string' && t.length >= 1 && t.length <= max && !t.includes('\n');
const COUNT = (v: unknown) => v === undefined || (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 1000);
const CONDITIONS = ['AbleToScale', 'ScalingActive', 'ScalingLimited'];

export function hpaCheckProblems(c: HpaCheck, autoscaling: boolean): string | null {
  if (!autoscaling) return 'a kube-hpa check needs an autoscaling machine (engine stage E40)';
  if (!LINE(c.name) || (c.namespace !== undefined && !LINE(c.namespace, 63))) return 'a kube-hpa check needs a name (and a namespace name)';
  const more = [c.target, c.minReplicas, c.maxReplicas, c.metric, c.currentReplicas, c.desiredReplicas, c.condition, c.scaledAtLeast, c.scaledAtMost].some(v => v !== undefined);
  if (c.absent && more) return 'a kube-hpa check with absent checks nothing else';
  if (c.target !== undefined && !/^(Deployment|ReplicaSet|StatefulSet)\/[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/.test(c.target)) return 'a kube-hpa check\'s target is Kind/name (Deployment, ReplicaSet or StatefulSet)';
  if (![c.minReplicas, c.maxReplicas, c.currentReplicas, c.desiredReplicas, c.scaledAtLeast, c.scaledAtMost].every(COUNT)) return 'a kube-hpa check\'s replica counts are whole numbers 0..1000';
  if (c.metric !== undefined) {
    const m = c.metric;
    if (typeof m !== 'object' || m === null || (m.resource !== 'cpu' && m.resource !== 'memory') || (m.utilization === undefined) === (m.averageValue === undefined)) return 'a kube-hpa check\'s metric is { resource: cpu | memory, utilization | averageValue }';
    if (m.utilization !== undefined && !(Number.isInteger(m.utilization) && m.utilization > 0)) return 'a kube-hpa check\'s metric utilization is a whole percent above 0';
    if (m.averageValue !== undefined && (typeof m.averageValue !== 'string' || milliOf(m.resource, m.averageValue) === null)) return 'a kube-hpa check\'s metric averageValue is a quantity such as 200m or 256Mi';
  }
  if (c.condition !== undefined && (!CONDITIONS.includes(c.condition.type) || !['True', 'False', 'Unknown'].includes(c.condition.status) || (c.condition.reason !== undefined && !LINE(c.condition.reason, 63)))) return `a kube-hpa check's condition is { type: ${CONDITIONS.join(' | ')}, status: True | False | Unknown, reason? }`;
  return null;
}

export function describeHpaCheck(c: HpaCheck): string {
  const where = `${c.namespace ?? 'default'} 命名空間`;
  if (c.absent) return `${where}應該沒有名為 ${c.name} 的 HorizontalPodAutoscaler`;
  const m = c.metric, more = [c.target ? `目標 ${c.target}` : '', c.minReplicas !== undefined ? `minReplicas ${c.minReplicas}` : '', c.maxReplicas !== undefined ? `maxReplicas ${c.maxReplicas}` : '',
    m ? `${m.resource} 的目標${m.utilization !== undefined ? `使用率 ${m.utilization}%` : `平均值 ${m.averageValue}`}` : '', c.currentReplicas !== undefined ? `目前 ${c.currentReplicas} 個副本` : '',
    c.desiredReplicas !== undefined ? `期望 ${c.desiredReplicas} 個副本` : '', c.condition ? `條件 ${c.condition.type}=${c.condition.status}${c.condition.reason ? `（${c.condition.reason}）` : ''}` : '',
    c.scaledAtLeast !== undefined ? `曾經擴展到至少 ${c.scaledAtLeast} 個副本` : '', c.scaledAtMost !== undefined ? `擴展時不曾超過 ${c.scaledAtMost} 個副本` : ''].filter(Boolean);
  return `${where}應該有名為 ${c.name} 的 HorizontalPodAutoscaler${more.length ? `（${more.join('、')}）` : ''}`;
}

export function hpaCheckFailure(c: HpaCheck, end: FsState): string | null {
  const k = settleKube(end).kube;
  if (!k) return '這台機器沒有 Kubernetes 叢集';
  const h = find(k, HPA, c.namespace ?? 'default', c.name);
  if (c.absent) return h ? `仍然有名為 ${c.name} 的 HorizontalPodAutoscaler` : null;
  if (!h) return `沒有名為 ${c.name} 的 HorizontalPodAutoscaler`;
  const spec = obj(h.spec), status = obj(h.status), ref = obj(spec.scaleTargetRef), target = `${str(ref.kind)}/${str(ref.name)}`;
  if (c.target !== undefined && target !== c.target) return `它的目標是 ${target}`;
  if (c.minReplicas !== undefined && Number(spec.minReplicas ?? 1) !== c.minReplicas) return `它的 minReplicas 是 ${Number(spec.minReplicas ?? 1)}`;
  if (c.maxReplicas !== undefined && Number(spec.maxReplicas) !== c.maxReplicas) return `它的 maxReplicas 是 ${Number(spec.maxReplicas)}`;
  if (c.metric) {
    const want = c.metric, m = arr(spec.metrics).map(x => obj(obj(x).resource)).find(r => str(r.name) === want.resource), t = obj(m?.target);
    if (!m) return `它沒有 ${want.resource} 的指標`;
    if (want.utilization !== undefined && (str(t.type) !== 'Utilization' || t.averageUtilization !== want.utilization)) return str(t.type) === 'Utilization' ? `它的 ${want.resource} 目標使用率是 ${String(t.averageUtilization)}%` : `它的 ${want.resource} 目標是平均值 ${quantityText(t.averageValue) ?? ''}`;
    if (want.averageValue !== undefined && (str(t.type) !== 'AverageValue' || milliOf(want.resource, t.averageValue) !== milliOf(want.resource, want.averageValue))) return str(t.type) === 'AverageValue' ? `它的 ${want.resource} 目標平均值是 ${quantityText(t.averageValue) ?? ''}` : `它的 ${want.resource} 目標是使用率 ${String(t.averageUtilization)}%`;
  }
  if (c.currentReplicas !== undefined && Number(status.currentReplicas ?? 0) !== c.currentReplicas) return `它目前有 ${Number(status.currentReplicas ?? 0)} 個副本`;
  if (c.desiredReplicas !== undefined && Number(status.desiredReplicas ?? 0) !== c.desiredReplicas) return `它期望 ${Number(status.desiredReplicas ?? 0)} 個副本`;
  if (c.condition) {
    const want = c.condition, got = arr(status.conditions).map(obj).find(x => x.type === want.type);
    if (!got) return `它還沒有 ${want.type} 條件`;
    if (got.status !== want.status || (want.reason !== undefined && got.reason !== want.reason)) return `它的 ${want.type} 是 ${String(got.status)}（${String(got.reason)}）`;
  }
  const mem = k.autoscale?.hpa[uidOf(h)];
  if (c.scaledAtLeast !== undefined && (mem?.hi ?? -1) < c.scaledAtLeast) return mem?.hi === undefined ? '它沒有改變過副本數' : `它最多只擴展到 ${mem.hi} 個副本`;
  if (c.scaledAtMost !== undefined && (mem?.hi === undefined || mem.hi > c.scaledAtMost)) return mem?.hi === undefined ? '它沒有改變過副本數' : `它曾經擴展到 ${mem.hi} 個副本`;
  return null;
}
