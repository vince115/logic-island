import type { Seconds } from './clock';
import type { HpaMemory, Sample } from './kube-metrics';
import { DOWNSCALE_WINDOW } from './kube-hpa-spec';
import { arr, obj, str, type JObj } from './kube-model';

/*
 * Engine stage E40 (docs/curriculum/KUB0_E40_AUTOSCALING.md §5): how the HPA controller turns a metric proposal into the
 * new replica count (horizontal.go). Without spec.behavior: the highest recommendation of the last 300 s (the
 * downscale stabilization window) wins, then at most max(2 × current, 4) and min..max. With spec.behavior (its defaults
 * filled in by the API server): the count is held between the lowest recommendation of the scale-up window and the
 * highest of the scale-down window (300 s when not given), then limited by the policies — over each policy's period, the
 * replicas at its start plus Pods n or × (1 + n%) (scale-down: minus n or × (1 − n%)), the Max or Min of them, Disabled
 * none — and by min..max. Recommendations and scale events are the controller's memory (HpaMemory).
 */

export interface Normalized { replicas: number; mem: HpaMemory; able: [string, string]; limit: [string, string]; limited: boolean }
const READY: [string, string] = ['ReadyForNewScale', 'recommended size matches current size'];
const DOWN_STABLE: [string, string] = ['ScaleDownStabilized', 'recent recommendations were higher than current one, applying the highest recent recommendation'];
const UP_STABLE: [string, string] = ['ScaleUpStabilized', 'recent recommendations were lower than current one, applying the lowest recent recommendation'];
const WITHIN: [string, string] = ['DesiredWithinRange', 'the desired count is within the acceptable range'];
const TOO_FEW: [string, string] = ['TooFewReplicas', 'the desired replica count is less than the minimum replica count'];
const TOO_MANY: [string, string] = ['TooManyReplicas', 'the desired replica count is more than the maximum replica count'];
const UP_LIMIT: [string, string] = ['ScaleUpLimit', 'the desired replica count is increasing faster than the maximum scale rate'];
const DOWN_LIMIT: [string, string] = ['ScaleDownLimit', 'the desired replica count is decreasing faster than the maximum scale rate'];
/** Scale events older than the longest period a policy may have are forgotten. */
const keep = (list: readonly Sample[], t: Seconds) => list.filter(e => e.t > t - 1800);

export function normalize(behavior: JObj | undefined, mem0: HpaMemory, t: Seconds, current: number, pre: number, min: number, max: number): Normalized {
  return behavior ? withBehavior(behavior, mem0, t, current, pre, min, max) : plain(mem0, t, current, pre, min, max);
}

function plain(mem0: HpaMemory, t: Seconds, current: number, pre: number, min: number, max: number): Normalized {
  let stable = pre;
  for (const r of mem0.recs) if (r.t >= t - DOWNSCALE_WINDOW && r.n > stable) stable = r.n;
  const mem = { ...mem0, recs: [...mem0.recs.filter(r => r.t >= t - DOWNSCALE_WINDOW), { t, n: pre }] };
  const up = Math.max(2 * current, 4), [cap, capWhy] = max > up ? [up, UP_LIMIT] : [max, TOO_MANY];
  const [replicas, limit] = stable < min ? [min, TOO_FEW] : stable > cap ? [cap, capWhy] : [stable, WITHIN];
  return { replicas, mem, able: stable !== pre ? DOWN_STABLE : READY, limit, limited: replicas !== stable };
}

const windowOf = (r: JObj, fallback: number) => typeof r.stabilizationWindowSeconds === 'number' ? r.stabilizationWindowSeconds : fallback;
/** The replicas added (or removed) over the last period seconds. */
const changeIn = (events: readonly Sample[], t: Seconds, period: number) => events.filter(e => e.t > t - period).reduce((s, e) => s + e.n, 0);

function withBehavior(b: JObj, mem0: HpaMemory, t: Seconds, current: number, pre: number, min: number, max: number): Normalized {
  const up = obj(b.scaleUp), down = obj(b.scaleDown), upWin = windowOf(up, 0), downWin = windowOf(down, DOWNSCALE_WINDOW);
  let upRec = pre, downRec = pre;
  for (const r of mem0.recs) {
    if (r.t > t - upWin) upRec = Math.min(upRec, r.n);
    if (r.t > t - downWin) downRec = Math.max(downRec, r.n);
  }
  let stable = current;
  if (stable < upRec) stable = upRec;
  if (stable > downRec) stable = downRec;
  const oldest = t - Math.max(upWin, downWin);
  const mem: HpaMemory = { ...mem0, recs: [...mem0.recs.filter(r => r.t >= oldest), { t, n: pre }], ups: keep(mem0.ups, t), downs: keep(mem0.downs, t) };
  const able = stable !== pre ? (pre >= current ? UP_STABLE : DOWN_STABLE) : READY;
  const done = (replicas: number, limit: [string, string]): Normalized => ({ replicas, mem, able, limit, limited: replicas !== stable });
  const policies = (r: JObj) => arr(r.policies).map(obj).map(p => ({ type: str(p.type), value: Number(p.value ?? 0), period: Number(p.periodSeconds ?? 15) }));
  if (stable > current) {
    const pick = str(up.selectPolicy) ?? 'Max';
    let limitUp = pick === 'Disabled' ? current : pick === 'Min' ? Infinity : -Infinity;
    if (pick !== 'Disabled') for (const p of policies(up)) {
      const start = current - changeIn(mem.ups, t, p.period) + changeIn(mem.downs, t, p.period);
      const proposed = p.type === 'Pods' ? start + p.value : Math.ceil(start * (1 + p.value / 100));
      limitUp = pick === 'Min' ? Math.min(limitUp, proposed) : Math.max(limitUp, proposed);
    }
    limitUp = Math.max(limitUp, current);
    const [cap, why] = max > limitUp ? [limitUp, UP_LIMIT] : [max, TOO_MANY];
    if (stable > cap) return done(cap, why);
  } else if (stable < current) {
    const pick = str(down.selectPolicy) ?? 'Max';
    let limitDown = pick === 'Disabled' ? current : pick === 'Min' ? -Infinity : Infinity;
    if (pick !== 'Disabled') for (const p of policies(down)) {
      const start = current - changeIn(mem.ups, t, p.period) + changeIn(mem.downs, t, p.period);
      const proposed = p.type === 'Pods' ? start - p.value : Math.trunc(start * (1 - p.value / 100));
      limitDown = pick === 'Min' ? Math.max(limitDown, proposed) : Math.min(limitDown, proposed);
    }
    limitDown = Math.min(limitDown, current);
    const [floor, why] = min < limitDown ? [limitDown, DOWN_LIMIT] : [min, TOO_FEW];
    if (stable < floor) return done(floor, why);
  }
  return done(stable, WITHIN);
}
