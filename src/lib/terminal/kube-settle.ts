import type { Seconds } from './clock';
import type { FsState } from './fs';
import type { DockerState } from './docker';
import { clockOf } from './processes';
import { about, put, record } from './kube-api';
import { bindPod, stepContainer, type Ref } from './kube-kubelet';
import { freeIp, nodeNamed, podName, schedule } from './kube-sched';
import { podStatus } from './kube-status';
import { probeStep, probeTimes, syncProbes } from './kube-probes';
import { finishDelete } from './kube-stop';
import type { ProbeType } from './kube-probe-spec';
import { controllerTimes, deadAt, lostStatus, runControllers, watched } from './kube-controllers';
import { netSig, netTimes, syncNet } from './kube-endpoints';
import { mountPod, syncVolume, volumeTimes } from './kube-volumes';
import { claimNode, volumeNeeds } from './kube-storage-sched';
import { WAIT } from './kube-storage-model';
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

/**
 * KUB-4: the settled cluster depends only on the cluster, the machine's Docker state and the clock, and a lesson's
 * validation replays the same machine from the same start many times (every exercise's solution, mistakes and variants);
 * so the result is kept per cluster object, Docker object and time.
 */
const settledKube = new WeakMap<KubeState, { docker: string; now: Seconds; k: KubeState }[]>();
// The Docker state is rebuilt for every replay, so it is compared by content (its text, made once per object).
const dockerTexts = new WeakMap<object, string>();
const dockerText = (d: FsState['docker']): string => {
  if (!d) return '';
  let t = dockerTexts.get(d);
  if (t === undefined) { t = JSON.stringify(d); dockerTexts.set(d, t); }
  return t;
};
export function settleKube(state: FsState): FsState {
  const k0 = state.kube;
  if (!k0) return state;
  const now = clockOf(state).now, seen = settledKube.get(k0) ?? [], docker = dockerText(state.docker);
  const hit = seen.find(e => e.docker === docker && e.now === now);
  if (hit) return { ...state, kube: hit.k };
  const out = settleOnce(state, k0, now);
  if (seen.length >= 8) seen.shift();
  seen.push({ docker, now, k: out.kube! });
  settledKube.set(k0, seen);
  return out;
}
function settleOnce(state: FsState, k0: KubeState, now: Seconds): FsState {
  let k = k0;
  for (let n = 0; n < SETTLE_STEPS; n++) {
    const next = nextStep(k, now, state.docker);
    if (!next) break;
    // E34: a step that changes what the controllers watch makes them run at its time.
    // E35: one that changes a pod's address, readiness, deletion or phase makes the endpoints controllers run.
    const seen = k.workloads && !next.ctl ? watched(k) : '', sig = k.net && !next.net ? netSig(k) : '';
    k = next.run(k);
    if (k.workloads && !next.ctl && watched(k) !== seen) k = runControllers(state.docker, k, next.t);
    if (k.net && !next.net && netSig(k) !== sig) k = syncNet(k, next.t);
  }
  // E35: and once more now (what commands changed: Services, labels, selectors).
  if (k.net) k = syncNet(k, now);
  return { ...state, kube: writeStatuses({ ...k, settled: now }) };
}

/**
 * KUB-1: the time of the cluster's next step after a settle (undefined: nothing is pending). Nothing in the cluster
 * changes between two steps, so a command that waits for a state (rollout status, wait) moves the clock straight to it
 * instead of one second at a time.
 */
export function nextKubeTime(state: FsState): Seconds | undefined {
  return state.kube ? nextStep(state.kube, Infinity, state.docker)?.t : undefined;
}
/** How far a waiting command moves the clock from its state: to the next step, at least 1 s, at most what is left. */
export function waitStep(state: FsState, left: Seconds): Seconds {
  const next = nextKubeTime(state);
  return next === undefined ? left : Math.max(1, Math.min(next - clockOf(state).now, left));
}

type Step = { t: Seconds; run: (k: KubeState) => KubeState; ctl?: true; net?: true };
function nextStep(k: KubeState, now: Seconds, d: DockerState | undefined): Step | null {
  let best: Step | null = null;
  const consider = (t: Seconds, run: Step['run'], ctl?: true, net?: true) => { if (t <= now && (!best || t < best.t)) best = { t, run, ...ctl ? { ctl } : {}, ...net ? { net } : {} }; };
  // E35: a Service appearing (a boot manifest's) makes the endpoints controllers run at its time.
  if (k.net) for (const t of netTimes(k)) consider(t, kk => syncNet(kk, t), undefined, true);
  // E34: the controllers' own times (before the pods' steps at the same time); a failed node's kubelet takes no more steps.
  if (k.workloads) for (const t of controllerTimes(k)) consider(t, kk => runControllers(d, kk, t), true);
  for (const pod of k.objects) {
    if (kindOf(pod) !== 'Pod') continue;
    const id = uidOf(pod), sim = k.pods[id];
    if (!sim) {
      const tried = k.unscheduled[id], created = createdOf(pod) ?? now;
      const at = !tried ? created : k.retry && k.retry.n > tried.n ? Math.max(tried.t, k.retry.t) : undefined;
      if (at !== undefined) consider(at, kk => bind(kk, id, at));
      continue;
    }
    const dead = k.workloads ? deadAt(k, sim.node) : undefined, alive = (t: Seconds) => dead === undefined || t < dead;
    // E36: a mount that waits for its ConfigMap or Secret is tried again (no container starts before it); mounted volumes sync.
    // E38: a mount waiting for an attach (WAIT) has no time of its own: the storage controller tries it again.
    if (sim.mount) { const t = sim.mount.next; if (t !== WAIT && alive(t)) consider(t, kk => mount(kk, id, t)); continue; }
    if (k.config) for (const v of volumeTimes(k, pod, sim)) if (alive(v.t)) consider(v.t, kk => resync(kk, id, v.vol, v.t));
    const refs: Ref[] = [...sim.init.map((_, i) => ({ init: true, i })), ...sim.main.map((_, i) => ({ init: false, i }))];
    for (const r of refs) {
      const c = (r.init ? sim.init : sim.main)[r.i];
      if (c.next !== undefined && alive(c.next)) { const t = c.next; consider(t, kk => step(kk, id, r, t, d)); }
    }
    // E33: the probe workers of the running containers (after the containers' own steps at the same time).
    sim.main.forEach((c, i) => { for (const [type, t] of probeTimes(c)) if (alive(t)) consider(t, kk => probe(kk, id, i, type, t, d, now)); });
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
  // E38: a claim that is missing, being deleted or unbound fails before any node; the volumes filter the nodes.
  const vol = k.storage && !target ? volumeNeeds(k, pod, t) : null, all = k.nodes.length;
  const r = vol && 'message' in vol ? { message: `0/${all} nodes are available: ${vol.message}. preemption: 0/${all} nodes are available: ${all} Preemption is not helpful for scheduling.` }
    : target ? { node: target } : schedule(k, pod, vol?.fits);
  if ('message' in r) {
    k = record(k, t, about(pod), 'Warning', 'FailedScheduling', r.message, 'default-scheduler');
    return { ...k, unscheduled: { ...k.unscheduled, [id]: { t, message: r.message, n: k.retry?.n ?? 0 } } };
  }
  // E38: the pod's delayed claims are bound or provisioned for the node (the pod waits while one is not).
  if (vol) { const c = claimNode(k, pod, r.node, t); k = c.k; if (c.wait) return { ...k, unscheduled: { ...k.unscheduled, [id]: { t, message: '', n: k.retry?.n ?? 0 } } }; }
  const { [id]: _done, ...unscheduled } = k.unscheduled;
  void _done;
  if (!target) k = record(k, t, about(pod), 'Normal', 'Scheduled', `Successfully assigned ${podName(pod)} to ${r.node.name}`, 'default-scheduler');
  let sim = bindPod(pod, r.node.name, freeIp(k, r.node), t);
  // E36: the kubelet mounts the pod's configMap and secret volumes first.
  if (k.config) { const m = mountPod(k, pod, sim, t); k = m.k; sim = m.sim; }
  k = { ...k, unscheduled, pods: { ...k.pods, [id]: sim } };
  return put(k, { ...pod, spec: { ...obj(pod.spec), nodeName: r.node.name } });
}

function step(k: KubeState, id: string, r: Ref, t: Seconds, d: DockerState | undefined): KubeState {
  const pod = k.objects.find(o => uidOf(o) === id), sim = k.pods[id];
  if (!pod || !sim) return k;
  const out = stepContainer(d, k, pod, sim, r, t);
  // E33: a container that started gets its probe workers; a pod being deleted is gone once nothing runs in it.
  return finishDelete({ ...out.k, pods: { ...out.k.pods, [id]: syncProbes(pod, out.sim) } }, id, t);
}
function mount(k: KubeState, id: string, t: Seconds): KubeState {
  const pod = k.objects.find(o => uidOf(o) === id), sim = k.pods[id];
  if (!pod || !sim) return k;
  const m = mountPod(k, pod, sim, t);
  return { ...m.k, pods: { ...m.k.pods, [id]: m.sim } };
}
function resync(k: KubeState, id: string, vol: string, t: Seconds): KubeState {
  const pod = k.objects.find(o => uidOf(o) === id), sim = k.pods[id];
  return pod && sim ? { ...k, pods: { ...k.pods, [id]: syncVolume(k, pod, sim, vol, t) } } : k;
}
function probe(k: KubeState, id: string, i: number, type: ProbeType, t: Seconds, d: DockerState | undefined, now: Seconds): KubeState {
  const pod = k.objects.find(o => uidOf(o) === id), sim = k.pods[id];
  if (!pod || !sim) return k;
  const out = probeStep(d, k, pod, sim, i, type, t, now);
  return { ...out.k, pods: { ...out.k.pods, [id]: out.sim } };
}

/** Every pod's status from its kubelet record (a new resourceVersion only when it changed). */
function writeStatuses(k0: KubeState): KubeState {
  let k = k0;
  for (const pod of k0.objects) {
    if (kindOf(pod) !== 'Pod') continue;
    const id = uidOf(pod), tried = k.unscheduled[id];
    const base = podStatus(k, pod, k.pods[id], tried?.message ? tried : undefined), status = k.workloads ? lostStatus(k, pod, base) : base;
    if (!sameJ(pod.status, status)) k = put(k, { ...k.objects.find(o => uidOf(o) === id)!, status } as JObj);
  }
  return k;
}
