import type { Seconds } from './clock';
import type { DockerState } from './docker';
import { about, record } from './kube-api';
import { healthOf, runAction, serviceOf } from './kube-health';
import { putContainer, specOf } from './kube-kubelet';
import { PROBE_NAME, PROBE_TYPES, probeOf, type ProbeType } from './kube-probe-spec';
import { deleting, stopContainer } from './kube-stop';
import { obj, str, type CSim, type JObj, type KubeState, type PodSim, type ProbeRun, type ProbeSim } from './kube-model';

/*
 * Engine stage E33 (docs/curriculum/KUB0_E33_PROBES.md §4): the kubelet's probe workers, one per probe of a running
 * container. A worker probes at start + initialDelaySeconds, then every periodSeconds. A result changes the container's
 * state only after successThreshold successes or failureThreshold failures in a row (prober/worker.go). The startup probe
 * gates the others: until it passes, liveness and readiness do not probe and the container is neither started nor ready.
 * Readiness sets ready; a liveness (or startup) failure at the threshold kills the container (Killing, "will be
 * restarted" unless restartPolicy is Never) and holds the worker until the next run. Every failed probe is an Unhealthy
 * event. Long steady stretches (every worker's result unchanged until the lesson's health changes) are played at once.
 */

/** After a step: a container that started gets its workers (this run), one that stopped loses them. */
export function syncProbes(pod: JObj, sim: PodSim): PodSim {
  let out = sim;
  sim.main.forEach((c, i) => {
    if (c.state !== 'running') { if (c.probe || c.stopping) out = putContainer(out, { init: false, i }, { ...c, probe: undefined, stopping: undefined }); return; }
    if (c.probe?.cid === (c.cid ?? '') || c.stopping) return;
    const spec = specOf(pod, { init: false, i }), start = c.started ?? 0, runs: ProbeSim['runs'] = {};
    for (const t of PROBE_TYPES) { const p = probeOf(spec, t); if (p) runs[t] = { at: start + p.delay, run: 0 }; }
    if (!Object.keys(runs).length) return;
    out = putContainer(out, { init: false, i }, { ...c, probe: { cid: c.cid ?? '', started: !runs.startup, ready: !runs.readiness, changed: start, runs } });
  });
  return out;
}
/** Whether the kubelet reports the container started and ready (no probes: running is both). */
export const startedOf = (c: CSim) => c.state === 'running' && (!c.probe || c.probe.started);
export const readyOf = (c: CSim) => startedOf(c) && (!c.probe || c.probe.ready);
/** The next probe of each worker (for settleKube). */
export const probeTimes = (c: CSim): [ProbeType, Seconds][] => PROBE_TYPES.flatMap(t => { const at = c.probe?.runs[t]?.at; return at === undefined ? [] : [[t, at] as [ProbeType, Seconds]]; });

/** One probe of worker `type` of main container i at t (now: the clock settleKube plays to). */
export function probeStep(d: DockerState | undefined, k0: KubeState, pod: JObj, sim0: PodSim, i: number, type: ProbeType, t: Seconds, now: Seconds): { k: KubeState; sim: PodSim } {
  const c = sim0.main[i], ps = c.probe, w = ps?.runs[type], spec = specOf(pod, { init: false, i }), p = probeOf(spec, type);
  if (!ps || !w || !p) return { k: k0, sim: sim0 };
  const write = (k: KubeState, sim: PodSim, x: CSim, run: ProbeRun, more: Partial<ProbeSim> = {}) => ({ k, sim: putContainer(sim, { init: false, i }, { ...x, probe: { ...x.probe!, ...more, runs: { ...x.probe!.runs, [type]: run } } }) });
  // Stopped workers: a kill under way, a deletion (liveness and startup stop), startup passed, on hold.
  if (c.stopping || w.hold || (deleting(pod) && type !== 'readiness') || (type === 'startup' && ps.started)) return write(k0, sim0, c, { ...w, at: undefined });
  if (type !== 'startup' && !ps.started) return write(k0, sim0, c, { ...w, at: t + p.period });
  const o = runAction({ d, k: k0, pod, spec, c, ip: sim0.ip, t }, p.action, p.timeout);
  let k = k0;
  if ('errored' in o) return write(record(k, t, about(pod), 'Warning', 'Unhealthy', `${PROBE_NAME[type]} probe errored: ${o.errored}`), sim0, c, { ...w, at: t + p.period });
  if (!o.ok) k = record(k, t, about(pod), 'Warning', 'Unhealthy', `${PROBE_NAME[type]} probe failed: ${o.message}`);
  const run = w.last === o.ok ? w.run + 1 : 1, next: ProbeRun = { at: t + p.period, last: o.ok, run, ...o.ok ? {} : { msg: o.message } };
  if ((!o.ok && run < p.failure) || (o.ok && run < p.success)) return fastForward(d, write(k, sim0, c, next), pod, i, now);
  if (type === 'readiness') return fastForward(d, write(k, sim0, c, next, ps.ready === o.ok ? {} : { ready: o.ok, changed: t }), pod, i, now);
  if (o.ok) return type === 'startup' ? write(k, sim0, c, { ...next, at: undefined }, { started: true, changed: t }) : fastForward(d, write(k, sim0, c, next), pod, i, now);
  const held = write(k, sim0, c, { ...next, at: undefined, run: 0, hold: true });
  const policy = str(obj(pod.spec).restartPolicy) ?? 'Always', restart = policy !== 'Never', grace = Number(obj(pod.spec).terminationGracePeriodSeconds ?? 30);
  return stopContainer(d, held.k, pod, held.sim, { init: false, i }, t, { message: `Container ${c.name} failed ${type} probe${restart ? ', will be restarted' : ''}`, restart, grace });
}

/** The first time after t0 (absolute) at which the lesson's health of this run may answer differently. */
function boundaryAfter(k: KubeState, c: CSim, listen: number, t0: Seconds): Seconds {
  const start = c.started ?? 0, age = t0 - start, h = healthOf(k, c.image);
  const marks = [listen, ...(h?.paths ?? []).flatMap(p => [p.after ?? 0, p.until ?? Infinity]), ...(h?.exec ?? []).flatMap(e => [e.after ?? 0, e.until ?? Infinity])].filter(m => m > age);
  return start + Math.min(Infinity, ...marks);
}
/**
 * When every working probe of the container is steady (liveness passing, readiness agreeing with ready), the probes until
 * the next change of the lesson's health, the container's own next step, or the clock are all the same: they are played
 * at once (an Unhealthy event counts them up), so a pod probed for weeks does not use up settleKube's steps.
 */
function fastForward(d: DockerState | undefined, r: { k: KubeState; sim: PodSim }, pod: JObj, i: number, now: Seconds): { k: KubeState; sim: PodSim } {
  const c = r.sim.main[i], ps = c.probe, spec = specOf(pod, { init: false, i });
  if (!ps || !ps.started || c.stopping || deleting(pod)) return r;
  const live = PROBE_TYPES.filter(t => ps.runs[t]?.at !== undefined);
  if (live.some(t => t === 'startup' || ps.runs[t]!.last === undefined || (t === 'liveness' ? !ps.runs[t]!.last : ps.runs[t]!.last !== ps.ready))) return r;
  const period = (t: ProbeType) => probeOf(spec, t)!.period, from = Math.min(...live.map(t => ps.runs[t]!.at! - period(t)));
  const until = Math.min(c.next ?? Infinity, now + 1, boundaryAfter(r.k, c, serviceOf({ d, k: r.k, pod, spec, c, ip: r.sim.ip, t: from }).listen, from));
  let k = r.k;
  const runs = { ...ps.runs };
  for (const t of live) {
    const w = runs[t]!, n = Math.max(0, Math.ceil((until - w.at!) / period(t)));
    if (!n) continue;
    if (!w.last) k = bump(k, pod, `${PROBE_NAME[t]} probe failed: ${w.msg ?? ''}`, n, w.at! + (n - 1) * period(t));
    runs[t] = { ...w, at: w.at! + n * period(t), run: w.run + n };
  }
  return { k, sim: putContainer(r.sim, { init: false, i }, { ...c, probe: { ...ps, runs } }) };
}
function bump(k: KubeState, pod: JObj, message: string, n: number, last: Seconds): KubeState {
  const who = about(pod), at = k.events.findIndex(e => e.uid === who.uid && e.reason === 'Unhealthy' && e.message === message);
  if (at < 0) return record(k, last, who, 'Warning', 'Unhealthy', message);
  return { ...k, events: k.events.map((e, j) => j === at ? { ...e, count: e.count + n, last } : e) };
}
