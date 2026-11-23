import type { Seconds } from './clock';
import { seedLines, type DockerState } from './docker';
import { about, record } from './kube-api';
import { behaviour, imageIdOf, resolveImage } from './kube-image';
import { arr, containerId, goDuration, KUBE_LIMITS, nameOf, nsOf, obj, str, uidOf, type CSim, type J, type JObj, type KubeState, type PodSim } from './kube-model';

/*
 * Engine stage E32 (docs/curriculum/KUB0_E32_CLUSTER.md §6): the kubelet, one container step at a time. pull: the image is
 * already present (IfNotPresent) or pulled (Pulling, then Pulled after the image's pull seconds), or the pull fails
 * (ErrImagePull, then ImagePullBackOff and another try after 10 s, doubling up to 300 s). start: Created, Started and the
 * main process (kube-image.ts). exit: Completed, Error or OOMKilled, then restartPolicy — the first restart is at once, then
 * CrashLoopBackOff for 10 s doubling to 300 s, back to the start after 10 minutes of running. Init containers run one
 * after another before the others; one that fails with restartPolicy Never fails the pod.
 */

export type Ref = { init: boolean; i: number };
export const cOf = (sim: PodSim, r: Ref) => (r.init ? sim.init : sim.main)[r.i];
const put = (sim: PodSim, r: Ref, c: CSim): PodSim => r.init ? { ...sim, init: sim.init.map((x, i) => i === r.i ? c : x) } : { ...sim, main: sim.main.map((x, i) => i === r.i ? c : x) };
export const specOf = (pod: JObj, r: Ref): J => arr(obj(pod.spec)[r.init ? 'initContainers' : 'containers'])[r.i];
const fresh = (spec: J, init: boolean, t: Seconds, first: boolean): CSim => ({
  name: str(obj(spec).name) ?? '', image: str(obj(spec).image) ?? '', init, state: 'waiting', reason: init ? 'PodInitializing' : first ? 'ContainerCreating' : 'PodInitializing',
  restarts: 0, crashes: 0, pullFails: 0, logs: [], prev: [], ...first ? { next: t, step: 'pull' as const } : {},
});
/** A pod the scheduler bound (or nodeName named): its sandbox is ready, the first init container (or every container) pulls. */
export function bindPod(pod: JObj, node: string, ip: string, t: Seconds): PodSim {
  const spec = obj(pod.spec), inits = arr(spec.initContainers);
  return { node, bound: t, ip, init: inits.map((c, i) => fresh(c, true, t, i === 0)), main: arr(spec.containers).map(c => fresh(c, false, t, !inits.length)) };
}
const podText = (pod: JObj) => `${nameOf(pod)}_${nsOf(pod) ?? 'default'}(${uidOf(pod)})`;
const backoff = (n: number) => Math.min(10 * 2 ** Math.max(0, n - 1), 300);
const cap = <T,>(a: readonly T[]) => a.slice(-KUBE_LIMITS.logs);

/** One step of a container whose time has come. */
export function stepContainer(d: DockerState | undefined, k0: KubeState, pod: JObj, sim0: PodSim, r: Ref, t: Seconds): { k: KubeState; sim: PodSim } {
  let k = k0, sim = sim0, c = cOf(sim0, r);
  const spec = obj(specOf(pod, r)), who = about(pod), ev = (type: 'Normal' | 'Warning', reason: string, message: string) => { k = record(k, t, who, type, reason, message); };
  const set = (x: CSim) => { c = x; sim = put(sim, r, x); };
  const image = c.image, policy = str(spec.imagePullPolicy) ?? 'IfNotPresent', cache = k.cache[sim.node] ?? [];
  const start = () => {
    const res = resolveImage(d, image);
    if ('error' in res) return;
    const cid = containerId(`${uidOf(pod)}/${c.name}/${c.restarts}`);
    const b = behaviour(d, res.img, spec, nameOf(pod), cid, t);
    if (b.startError) {
      ev('Warning', 'Failed', `Error: ${b.startError}`);
      set({ ...c, state: 'terminated', reason: 'StartError', message: b.startError, exit: 128, started: t, finished: t, cid, imageId: imageIdOf(res), next: t, step: 'exit', plan: { exit: 128, logs: [], reason: 'StartError', message: b.startError } });
      return;
    }
    ev('Normal', 'Created', `Created container: ${c.name}`);
    ev('Normal', 'Started', `Started container ${c.name}`);
    const base = { ...c, state: 'running' as const, reason: undefined, message: undefined, exit: undefined, finished: undefined, started: t, cid, imageId: imageIdOf(res), logs: cap([...c.logs, ...b.lines]), retry: undefined };
    if (b.exit) set({ ...base, next: t, step: 'exit', plan: { exit: b.exit.exit, oom: b.exit.oom, logs: [] } });
    else if (b.later) set({ ...base, next: b.later.at, step: 'exit', plan: { exit: b.later.exit, oom: b.later.oom, logs: b.later.logs } });
    else set({ ...base, next: undefined, step: undefined, plan: undefined });
  };
  switch (c.step) {
    case 'pull': {
      const present = cache.includes(image), res = resolveImage(d, image);
      if (policy !== 'Always' && present) { ev('Normal', 'Pulled', `Container image "${image}" already present on machine`); start(); break; }
      if (policy === 'Never') {
        ev('Warning', 'ErrImageNeverPull', `Container image "${image}" is not present with pull policy of Never`);
        ev('Warning', 'Failed', 'Error: ErrImageNeverPull');
        set({ ...c, state: 'waiting', reason: 'ErrImageNeverPull', message: `Container image "${image}" is not present with pull policy of Never`, next: undefined, step: undefined });
        break;
      }
      if ('error' in res && res.reason === 'InvalidImageName') {
        ev('Warning', 'InspectFailed', res.error);
        ev('Warning', 'Failed', 'Error: InvalidImageName');
        set({ ...c, state: 'waiting', reason: 'InvalidImageName', message: res.error, next: undefined, step: undefined });
        break;
      }
      ev('Normal', 'Pulling', `Pulling image "${image}"`);
      if ('error' in res) {
        ev('Warning', 'Failed', `Failed to pull image "${image}": ${res.error}`);
        ev('Warning', 'Failed', 'Error: ErrImagePull');
        const fails = c.pullFails + 1;
        set({ ...c, state: 'waiting', reason: 'ErrImagePull', message: res.error, pullFails: fails, next: t + 1, step: 'backoff', retry: t + backoff(fails) });
        break;
      }
      const seconds = present ? 1 : k.pull[image] ?? k.pullSeconds;
      set({ ...c, next: t + seconds, step: 'pulled', plan: { exit: seconds, logs: [] } });
      break;
    }
    case 'pulled': {
      const res = resolveImage(d, image), seconds = c.plan?.exit ?? 0, size = 'img' in res ? res.img.size : 0;
      ev('Normal', 'Pulled', `Successfully pulled image "${image}" in ${goDuration(seconds)} (${goDuration(seconds)} including waiting). Image size: ${size} bytes.`);
      if (!cache.includes(image)) k = { ...k, cache: { ...k.cache, [sim.node]: [...cache, image] } };
      set({ ...c, plan: undefined });
      start();
      break;
    }
    case 'backoff': {
      if (c.reason === 'ErrImagePull') {
        ev('Normal', 'BackOff', `Back-off pulling image "${image}"`);
        ev('Warning', 'Failed', 'Error: ImagePullBackOff');
        set({ ...c, reason: 'ImagePullBackOff', message: `Back-off pulling image "${image}"`, next: c.retry, step: 'pull' });
      } else {
        const wait = (c.retry ?? t) - (c.finished ?? t);
        ev('Warning', 'BackOff', `Back-off restarting failed container ${c.name} in pod ${podText(pod)}`);
        set({ ...c, state: 'waiting', reason: 'CrashLoopBackOff', message: `back-off ${goDuration(wait)} restarting failed container=${c.name} pod=${podText(pod)}`, next: c.retry, step: 'restart', last: lastOf(c, t) });
      }
      break;
    }
    case 'exit': {
      const p = c.plan ?? { exit: 0, logs: [] };
      const reason = p.reason ?? (p.oom ? 'OOMKilled' : p.exit === 0 ? 'Completed' : 'Error');
      const ended: CSim = { ...c, state: 'terminated', reason, message: p.message, exit: p.exit, finished: t, logs: cap([...c.logs, ...seedLines(p.logs, t)]), next: undefined, step: undefined, plan: undefined };
      const restartPolicy = str(obj(pod.spec).restartPolicy) ?? 'Always';
      const again = restartPolicy === 'Always' ? !(r.init && p.exit === 0) : restartPolicy === 'OnFailure' && p.exit !== 0;
      set(ended);
      if (r.init && p.exit === 0) { sim = nextAfterInit(pod, sim, r.i, t); break; }
      if (!again) break;
      const crashes = t - (c.started ?? t) >= 600 ? 1 : c.crashes + 1, wait = crashes <= 1 ? 0 : backoff(crashes - 1);
      set(wait === 0 ? { ...ended, crashes, next: t, step: 'restart' } : { ...ended, crashes, next: t + 1, step: 'backoff', retry: t + wait });
      break;
    }
    case 'restart': {
      const last = c.state === 'terminated' ? lastOf(c, t) : c.last;
      set({ ...c, state: 'waiting', reason: c.state === 'terminated' ? 'ContainerCreating' : c.reason, message: undefined, last, restarts: c.restarts + 1, prev: c.logs, logs: [], layer: undefined, next: t, step: 'pull', retry: undefined });
      return stepContainer(d, k, pod, sim, r, t);
    }
  }
  return { k, sim };
}
const lastOf = (c: CSim, t: Seconds) => ({ reason: c.reason ?? 'Error', exit: c.exit ?? 0, started: c.started ?? t, finished: c.finished ?? t });
/** After init container i completed: the next one pulls, or (the last one) every app container. */
function nextAfterInit(pod: JObj, sim: PodSim, i: number, t: Seconds): PodSim {
  if (i + 1 < sim.init.length) return put(sim, { init: true, i: i + 1 }, { ...sim.init[i + 1], next: t, step: 'pull' });
  return { ...sim, main: sim.main.map(c => ({ ...c, reason: 'ContainerCreating', next: t, step: 'pull' as const })) };
}
/**
 * A container whose image an update changed: the kubelet kills it ("definition changed") and starts it again with the new
 * image — Killing, then the pull and the start; the restart counts, and the last state is that run's end.
 */
export function changeImage(k0: KubeState, pod: JObj, sim: PodSim, r: Ref, image: string, t: Seconds): { k: KubeState; sim: PodSim } {
  const c = cOf(sim, r);
  if (c.image === image) return { k: k0, sim };
  if (c.state !== 'running' && c.started === undefined) return { k: k0, sim: put(sim, r, { ...c, image }) };
  const k = record(k0, t, about(pod), 'Normal', 'Killing', `Container ${c.name} definition changed, will be restarted`);
  const last = c.state === 'running' ? { reason: 'Completed', exit: 0, started: c.started ?? t, finished: t } : lastOf(c, t);
  return { k, sim: put(sim, r, { ...c, image, state: 'waiting', reason: 'ContainerCreating', message: undefined, last, restarts: c.restarts + 1, crashes: 0, prev: c.logs, logs: [], layer: undefined, plan: undefined, retry: undefined, next: t, step: 'pull' }) };
}
