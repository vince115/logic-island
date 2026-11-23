import type { Seconds } from './clock';
import { programFor, type DockerState, type LogSeed } from './docker';
import { SIGNALS, parseSignal } from './processes';
import { about, put, record, remove } from './kube-api';
import { runAction } from './kube-health';
import { argvOf, resolveImage } from './kube-image';
import { cOf, putContainer, specOf, type Ref } from './kube-kubelet';
import { preStopOf } from './kube-probe-spec';
import { changed, meta, obj, stamp, str, uidOf, type JObj, type KubeState, type PodSim } from './kube-model';

/*
 * Engine stage E33 (docs/curriculum/KUB0_E33_PROBES.md §5): the kubelet's killContainer and a pod's graceful deletion.
 * Killing is recorded first; the preStop hook (exec, httpGet or sleep) runs inside the grace period and uses up its
 * time; the stop signal (the image's STOPSIGNAL, else SIGTERM) goes to PID 1 with what is left, at least 2 s; the program
 * handles it as its E24 `signals` say (its exit after its seconds), or ignores it — then SIGKILL at the end of the grace
 * period (137). A pod being deleted shows Terminating until its last container has stopped, then it is gone.
 */

/** What PID 1 does on the container's stop signal: the program's handler, or none (a shell-form sh -c ignores it). */
export function stopHandler(d: DockerState | undefined, spec: unknown, image: string): { seconds: number; logs: readonly LogSeed[]; exit: number } | undefined {
  const res = resolveImage(d, image);
  if ('error' in res) return undefined;
  const img = res.img, s = obj(spec as JObj), argv = argvOf(img, spec as JObj), base = (argv[0] ?? '').slice((argv[0] ?? '').lastIndexOf('/') + 1);
  if ((base === 'sh' || base === 'bash') && argv[1] === '-c' && argv.length >= 3 && !/^\s*exec\s/.test(argv[2])) return undefined;
  const own = !s.command && !s.args && !img.ownMain, prog = own || !d ? undefined : programFor(d, argv);
  const n = parseSignal(img.stopSignal ?? 'SIGTERM') ?? 15, name = SIGNALS[n];
  const rt = own ? img.runtime : prog?.runtime;
  if (rt?.signals) return rt.signals[name];
  const code = own ? img.stopExit ?? (img.service ? 0 : 137) : prog?.stopExit ?? 137;
  return code !== 137 && ['TERM', 'INT', 'QUIT'].includes(name) ? { seconds: 0, logs: [], exit: code } : undefined;
}

/** The minimum stop window the kubelet always gives a container (minimumGracePeriodInSeconds). */
export const MIN_GRACE = 2;
/**
 * killContainer: Killing (message), the preStop hook, the signal, SIGKILL when the grace period ends. The container keeps
 * running until then (step exit at that time); an exit it had planned earlier still comes first. restart: whether it
 * starts again after this stop. A container that is not running only stops waiting (a pull, a back-off).
 */
export function stopContainer(d: DockerState | undefined, k0: KubeState, pod: JObj, sim0: PodSim, r: Ref, t: Seconds, why: { message?: string; restart: boolean; grace: number }): { k: KubeState; sim: PodSim } {
  const c = cOf(sim0, r);
  if (c.state !== 'running') return { k: k0, sim: c.state === 'waiting' ? putContainer(sim0, r, { ...c, next: undefined, step: undefined, retry: undefined }) : sim0 };
  if (c.stopping) return { k: k0, sim: c.plan ? putContainer(sim0, r, { ...c, plan: { ...c.plan, restart: why.restart && c.plan.restart !== false } }) : sim0 };
  const spec = specOf(pod, r);
  let k = record(k0, t, about(pod), 'Normal', 'Killing', why.message ?? `Stopping container ${c.name}`), used = 0;
  const hook = preStopOf(spec);
  if (hook && why.grace > 0) {
    const o = runAction({ d, k, pod, spec, c, ip: sim0.ip, t }, hook, Infinity);
    used = Math.min(o.seconds, why.grace);
    if ('errored' in o || !o.ok) k = record(k, t, about(pod), 'Warning', 'FailedPreStopHook', 'PreStopHook failed');
  }
  const left = Math.max(why.grace - used, MIN_GRACE), at = t + used, h = stopHandler(d, spec, c.image);
  const handled = !!h && h.seconds <= left, end = handled ? at + h.seconds : at + left;
  const plan = { exit: handled ? h.exit : 137, logs: h?.logs ?? [], restart: why.restart };
  const keep = c.step === 'exit' && c.next !== undefined && c.next <= end && c.plan;
  return { k, sim: putContainer(sim0, r, { ...c, stopping: true, ...keep ? { plan: { ...c.plan!, restart: why.restart } } : { next: end, step: 'exit' as const, plan } }) };
}

const running = (sim: PodSim) => [...sim.init, ...sim.main].some(c => c.state === 'running');
/**
 * kubectl delete of a pod on the probes profile: the API server sets deletionTimestamp (now + grace) and the kubelet stops
 * every container; a pod that is not bound or has nothing running is gone at once. The time it will be gone.
 */
export function beginDelete(d: DockerState | undefined, k0: KubeState, pod: JObj, grace: number, t: Seconds): { k: KubeState; until: Seconds } {
  const id = uidOf(pod), sim0 = k0.pods[id];
  if (!sim0 || !running(sim0)) return { k: changed(remove(k0, pod), t), until: t };
  const m = meta(pod), already = str(m.deletionTimestamp);
  let k = already ? k0 : put(k0, { ...pod, metadata: { ...m, deletionGracePeriodSeconds: grace, deletionTimestamp: stamp(t + grace) } }), sim = sim0;
  for (const init of [true, false]) (init ? sim0.init : sim0.main).forEach((_, i) => {
    const r = stopContainer(d, k, pod, sim, { init, i }, t, { restart: false, grace: already ? Number(m.deletionGracePeriodSeconds ?? grace) : grace });
    k = r.k; sim = r.sim;
  });
  k = { ...k, pods: { ...k.pods, [id]: sim } };
  return { k, until: Math.max(t, ...[...sim.init, ...sim.main].map(c => c.state === 'running' && c.next !== undefined ? c.next : t)) };
}
/** After a step: a pod being deleted whose containers have all stopped is removed (the scheduler may place others now). */
export function finishDelete(k: KubeState, id: string, t: Seconds): KubeState {
  const pod = k.objects.find(o => uidOf(o) === id), sim = k.pods[id];
  if (!pod || !sim || !obj(pod.metadata).deletionTimestamp || running(sim)) return k;
  return changed(remove(k, pod), t);
}
export const deleting = (pod: JObj) => !!obj(pod.metadata).deletionTimestamp;
