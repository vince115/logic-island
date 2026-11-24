import type { Seconds } from './clock';
import { qosOf } from './kube-api';
import { readyOf, startedOf } from './kube-probes';
import { qualified, parseRef } from './docker';
import { arr, humanDuration, obj, parseStamp, stamp, str, type CSim, type J, type JObj, type KubeState, type PodSim } from './kube-model';

/*
 * Engine stage E32 (docs/curriculum/KUB0_E32_CLUSTER.md §7): a pod's status as the kubelet reports it (phase, conditions,
 * container statuses with state and lastState, IPs, QoS class) from its PodSim, and kubectl's printer of the STATUS,
 * READY and RESTARTS columns from that status (printPod: Init:N/M, Init:Error, CrashLoopBackOff, Completed, NotReady…).
 */

const cstate = (c: CSim): JObj => c.state === 'running' ? { running: { startedAt: stamp(c.started ?? 0) } }
  : c.state === 'terminated' ? { terminated: { containerID: `containerd://${c.cid ?? ''}`, exitCode: c.exit ?? 0, finishedAt: stamp(c.finished ?? 0), ...c.message ? { message: c.message } : {}, reason: c.reason ?? 'Error', startedAt: stamp(c.started ?? 0) } }
  : { waiting: { ...c.message ? { message: c.message } : {}, reason: c.reason ?? 'ContainerCreating' } };
const imageName = (image: string) => { const r = parseRef(image.split('@')[0]); return r && !image.includes('@') ? qualified(r) : image; };
function cstatus(c: CSim): JObj {
  const last: JObj = c.last ? { terminated: { containerID: `containerd://${c.cid ?? ''}`, exitCode: c.last.exit, finishedAt: stamp(c.last.finished), reason: c.last.reason, startedAt: stamp(c.last.started) } } : {};
  // E33: a main container's probes decide started (startup) and ready (readiness); without probes, running is both.
  const ready = c.init ? c.state === 'terminated' && c.exit === 0 : readyOf(c);
  return { ...c.cid ? { containerID: `containerd://${c.cid}` } : {}, image: imageName(c.image), imageID: c.imageId ?? '', lastState: last, name: c.name, ready, restartCount: c.restarts,
    started: c.init ? c.state === 'running' : startedOf(c), state: cstate(c) };
}
/** The kubelet's phase (getPhase): init containers first, then running, stopped and waiting containers and the restart policy. */
export function phaseOf(sim: PodSim, policy: string): string {
  if (sim.init.some(c => c.state === 'terminated' && c.exit !== 0 && c.next === undefined && policy === 'Never')) return 'Failed';
  if (!sim.init.every(c => c.state === 'terminated' && c.exit === 0)) return 'Pending';
  const running = sim.main.filter(c => c.state === 'running').length, stopped = sim.main.filter(c => c.state === 'terminated' || (c.state === 'waiting' && c.last)), waiting = sim.main.length - running - stopped.length;
  if (running > 0) return 'Running';
  if (stopped.length > 0 && waiting === 0) {
    const done = stopped.every(c => c.state === 'terminated' && c.exit === 0);
    if (policy === 'Always') return 'Running';
    if (policy === 'OnFailure') return done ? 'Succeeded' : 'Running';
    return done ? 'Succeeded' : stopped.some(c => c.state === 'waiting') ? 'Running' : 'Failed';
  }
  return 'Pending';
}
const cond = (type: string, ok: boolean, t: Seconds, reason?: string, message?: string): J => ({ lastProbeTime: null, lastTransitionTime: stamp(t), ...message ? { message } : {}, ...reason ? { reason } : {}, status: ok ? 'True' : 'False', type });

/** The status of a pod: unscheduled (why) or what its kubelet reports. */
export function podStatus(k: KubeState, pod: JObj, sim: PodSim | undefined, unschedulable?: { message: string; t: Seconds }): JObj {
  const qosClass = qosOf(pod);
  if (!sim) return { ...unschedulable ? { conditions: [cond('PodScheduled', false, unschedulable.t, 'Unschedulable', unschedulable.message)] } : {}, phase: 'Pending', qosClass };
  const node = k.nodes.find(n => n.name === sim.node), policy = str(obj(pod.spec).restartPolicy) ?? 'Always', phase = phaseOf(sim, policy);
  const initDone = sim.init.every(c => c.state === 'terminated' && c.exit === 0), ready = phase === 'Running' && sim.main.every(readyOf);
  const changed = Math.max(sim.bound, ...[...sim.init, ...sim.main].flatMap(c => [c.started ?? 0, c.finished ?? 0, c.probe?.changed ?? 0]));
  const notReady = sim.main.filter(c => !readyOf(c)).map(c => c.name), pending = sim.init.filter(c => !(c.state === 'terminated' && c.exit === 0)).map(c => c.name);
  const completed = phase === 'Succeeded' || phase === 'Failed';
  const conditions = [
    cond('PodReadyToStartContainers', !completed, completed ? changed : sim.bound),
    cond('Initialized', initDone, initDone ? Math.max(sim.bound, ...sim.init.map(c => c.finished ?? 0)) : sim.bound, initDone ? undefined : 'ContainersNotInitialized', initDone ? undefined : `containers with incomplete status: [${pending.join(' ')}]`),
    cond('Ready', ready, changed, ready ? undefined : completed ? 'PodCompleted' : 'ContainersNotReady', ready || completed ? undefined : `containers with unready status: [${notReady.join(' ')}]`),
    cond('ContainersReady', ready, changed, ready ? undefined : completed ? 'PodCompleted' : 'ContainersNotReady', ready || completed ? undefined : `containers with unready status: [${notReady.join(' ')}]`),
    cond('PodScheduled', true, sim.bound),
  ];
  return { conditions, containerStatuses: sim.main.map(cstatus), hostIP: node?.address ?? '', hostIPs: [{ ip: node?.address ?? '' }], ...sim.init.length ? { initContainerStatuses: sim.init.map(cstatus) } : {},
    phase, podIP: sim.ip, podIPs: [{ ip: sim.ip }], qosClass, startTime: stamp(sim.bound) };
}

/** kubectl's printPod: READY, STATUS and RESTARTS of a pod (from its status, as kubectl reads it from the API). */
export function printPod(pod: JObj, now: Seconds): { ready: string; status: string; restarts: string } {
  const status = obj(pod.status), spec = obj(pod.spec), total = arr(spec.containers).length;
  let reason = str(status.reason) ?? str(status.phase) ?? 'Pending', restarts = 0, readyCount = 0, last = 0, initializing = false;
  const lastOf = (cs: JObj) => { const f = parseStamp(str(obj(obj(cs.lastState).terminated).finishedAt)); if (f !== undefined && f > last) last = f; };
  const inits = arr(status.initContainerStatuses).map(obj);
  for (const [i, ic] of inits.entries()) {
    restarts += Number(ic.restartCount ?? 0); lastOf(ic);
    const st = obj(ic.state), term = st.terminated ? obj(st.terminated) : undefined, wait = st.waiting ? obj(st.waiting) : undefined;
    if (term && term.exitCode === 0) continue;
    if (term) reason = str(term.reason) ? `Init:${str(term.reason)}` : `Init:ExitCode:${String(term.exitCode)}`;
    else if (wait && str(wait.reason) && str(wait.reason) !== 'PodInitializing') reason = `Init:${str(wait.reason)}`;
    else reason = `Init:${i}/${arr(spec.initContainers).length}`;
    initializing = true;
    break;
  }
  const initialized = arr(status.conditions).some(c => str(obj(c).type) === 'Initialized' && str(obj(c).status) === 'True');
  if (!initializing || initialized) {
    restarts = 0; last = 0;
    let running = false;
    for (const cs of arr(status.containerStatuses).map(obj).reverse()) {
      restarts += Number(cs.restartCount ?? 0); lastOf(cs);
      const st = obj(cs.state), wait = st.waiting ? obj(st.waiting) : undefined, term = st.terminated ? obj(st.terminated) : undefined;
      if (wait && str(wait.reason)) reason = str(wait.reason)!;
      else if (term && str(term.reason)) reason = str(term.reason)!;
      else if (term) reason = `ExitCode:${String(term.exitCode)}`;
      else if (cs.ready === true && st.running) { running = true; readyCount++; }
    }
    if (reason === 'Completed' && running) reason = arr(status.conditions).some(c => str(obj(c).type) === 'Ready' && str(obj(c).status) === 'True') ? 'Running' : 'NotReady';
  }
  if (obj(pod.metadata).deletionTimestamp) reason = 'Terminating';
  return { ready: `${readyCount}/${total}`, status: reason, restarts: restarts && last ? `${restarts} (${humanDuration(now - last)} ago)` : String(restarts) };
}
