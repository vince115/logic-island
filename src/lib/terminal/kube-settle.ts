import type { Seconds } from './clock';
import type { FsState } from './fs';
import type { DockerState } from './docker';
import { clockOf } from './processes';
import { about, put, record } from './kube-api';
import { bindPod, stepContainer, type Ref } from './kube-kubelet';
import { freeIp, nodeNamed, podName, schedule } from './kube-sched';
import { podStatus } from './kube-status';
import { createdOf, kindOf, obj, sameJ, str, uidOf, type JObj, type KubeState } from './kube-model';

/*
 * Engine stage E32 (docs/curriculum/KUB0_E32_CLUSTER.md §8): settleKube plays the controllers up to the machine's clock,
 * in time order — the scheduler binds a new pod when it is created (or names why it cannot), tries the unschedulable ones
 * again when something changed, and each kubelet takes its containers' steps when they are due (ties: scheduling first,
 * then pods in creation order, init containers before the others). Then every pod's status is written. It runs before
 * each kubectl command and each check, never moves the clock, and is pure: the same state and clock give the same cluster.
 */

/** At most this many steps per settle (a crash loop is played step by step: about two months of one at the 5-minute back-off). */
export const SETTLE_STEPS = 20000;

export function settleKube(state: FsState): FsState {
  const k0 = state.kube;
  if (!k0) return state;
  const now = clockOf(state).now;
  let k = k0;
  for (let n = 0; n < SETTLE_STEPS; n++) {
    const next = nextStep(k, now, state.docker);
    if (!next) break;
    k = next.run(k);
  }
  return { ...state, kube: writeStatuses({ ...k, settled: now }) };
}

type Step = { t: Seconds; run: (k: KubeState) => KubeState };
function nextStep(k: KubeState, now: Seconds, d: DockerState | undefined): Step | null {
  let best: Step | null = null;
  const consider = (t: Seconds, run: Step['run']) => { if (t <= now && (!best || t < best.t)) best = { t, run }; };
  for (const pod of k.objects) {
    if (kindOf(pod) !== 'Pod') continue;
    const id = uidOf(pod), sim = k.pods[id];
    if (!sim) {
      const tried = k.unscheduled[id], created = createdOf(pod) ?? now;
      const at = !tried ? created : k.retry && k.retry.n > tried.n ? Math.max(tried.t, k.retry.t) : undefined;
      if (at !== undefined) consider(at, kk => bind(kk, id, at));
      continue;
    }
    const refs: Ref[] = [...sim.init.map((_, i) => ({ init: true, i })), ...sim.main.map((_, i) => ({ init: false, i }))];
    for (const r of refs) {
      const c = (r.init ? sim.init : sim.main)[r.i];
      if (c.next !== undefined) { const t = c.next; consider(t, kk => step(kk, id, r, t, d)); }
    }
  }
  return best;
}

/** The scheduler's attempt at time t (a pod with spec.nodeName goes to that node's kubelet without one). */
function bind(k0: KubeState, id: string, t: Seconds): KubeState {
  const pod = k0.objects.find(o => uidOf(o) === id);
  if (!pod) return k0;
  const named = str(obj(pod.spec).nodeName);
  let k = k0;
  const target = named !== undefined ? nodeNamed(k, named) : undefined;
  if (named !== undefined && !target) return { ...k, unscheduled: { ...k.unscheduled, [id]: { t, message: '', n: k.retry?.n ?? 0 } } };
  const r = target ? { node: target } : schedule(k, pod);
  if ('message' in r) {
    k = record(k, t, about(pod), 'Warning', 'FailedScheduling', r.message, 'default-scheduler');
    return { ...k, unscheduled: { ...k.unscheduled, [id]: { t, message: r.message, n: k.retry?.n ?? 0 } } };
  }
  const { [id]: _done, ...unscheduled } = k.unscheduled;
  void _done;
  if (!target) k = record(k, t, about(pod), 'Normal', 'Scheduled', `Successfully assigned ${podName(pod)} to ${r.node.name}`, 'default-scheduler');
  const sim = bindPod(pod, r.node.name, freeIp(k, r.node), t);
  k = { ...k, unscheduled, pods: { ...k.pods, [id]: sim } };
  return put(k, { ...pod, spec: { ...obj(pod.spec), nodeName: r.node.name } });
}

function step(k: KubeState, id: string, r: Ref, t: Seconds, d: DockerState | undefined): KubeState {
  const pod = k.objects.find(o => uidOf(o) === id), sim = k.pods[id];
  if (!pod || !sim) return k;
  const out = stepContainer(d, k, pod, sim, r, t);
  return { ...out.k, pods: { ...out.k.pods, [id]: out.sim } };
}

/** Every pod's status from its kubelet record (a new resourceVersion only when it changed). */
function writeStatuses(k0: KubeState): KubeState {
  let k = k0;
  for (const pod of k0.objects) {
    if (kindOf(pod) !== 'Pod') continue;
    const id = uidOf(pod), tried = k.unscheduled[id];
    const status = podStatus(k, pod, k.pods[id], tried?.message ? tried : undefined);
    if (!sameJ(pod.status, status)) k = put(k, { ...k.objects.find(o => uidOf(o) === id)!, status } as JObj);
  }
  return k;
}
