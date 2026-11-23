import type { FsState } from './fs';
import type { RemoteHost } from './ssh';
import type { DockerRegistry } from './registry';
import type { ActionsEffect } from './artifacts-model';

/*
 * Engine stage E31 (docs/curriculum/CICD0_E31_DEPLOY_HOSTS.md §3–§5): the deploy hosts at run time.
 * - Registries are the lesson's: a host's daemon sees the current content of the machine it was reached from (the
 *   learner's machine, or a runner's copy) and what it pushes goes back there (shareRegistries, collectRegistries).
 * - A runner reaches the hosts the lesson lets it reach, as they are when the job starts: the learner's hosts now, then
 *   the effects of runs not yet due and of earlier jobs of the same attempt up to that time (hostsAt, registriesAt).
 * - What a run: step changed on a host is an effect at the step's end (hostChanges); settleArt puts the host's state in
 *   place when the clock reaches it (applyHosts), keeping the learner's clock.
 */

export interface HostEffect { host: string; state: FsState }

/** The registries of `state` given to host `at` (before a command runs there). */
export function shareRegistries(state: FsState, at: number): FsState {
  const h = state.net?.hosts[at], reg = state.docker?.registries;
  if (!h?.state.docker || !reg || h.state.docker.registries === reg) return state;
  return withHostState(state, at, { ...h.state, docker: { ...h.state.docker, registries: reg } });
}
/** What host `at` pushed, merged back into the registries of `state` (after a command ran there). */
export function collectRegistries(state: FsState, at: number, merge: (a: readonly DockerRegistry[], b: readonly DockerRegistry[]) => DockerRegistry[]): FsState {
  const reg = state.net?.hosts[at]?.state.docker?.registries, own = state.docker?.registries;
  if (!reg || !own || reg === own || !state.docker) return state;
  return { ...state, docker: { ...state.docker, registries: merge(own, reg) } };
}
function withHostState(state: FsState, at: number, host: FsState): FsState {
  return { ...state, net: { ...state.net!, hosts: state.net!.hosts.map((h, i) => (i === at ? { ...h, state: host } : h)) } };
}

/** The hosts runners reach on a deploy-hosts machine (an Actx field), as they are in `state`. */
export function deployHostsOf(state: FsState): { hosts?: readonly RemoteHost[] } {
  const names = state.ci?.deploy?.hosts;
  return names && state.net ? { hosts: state.net.hosts.filter(h => names.includes(h.host)) } : {};
}

const due = (effects: readonly ActionsEffect[], t: number) => effects.filter(e => e.at <= t).sort((a, b) => a.at - b.at);
/** The hosts a job starting at t sees: these, then the hosts of effects due by then (pending ones, then this attempt's). */
export function hostsAt(hosts: readonly RemoteHost[], pending: readonly ActionsEffect[], made: readonly ActionsEffect[], t: number): RemoteHost[] {
  let out = [...hosts];
  for (const e of [...due(pending, t), ...due(made, t)]) for (const x of e.hosts ?? []) out = out.map(h => (h.host === x.host ? { ...h, state: x.state } : h));
  return out;
}
/** The registries a job starting at t sees (the pushes of effects due by then). */
export function registriesAt(base: readonly DockerRegistry[] | undefined, pending: readonly ActionsEffect[], made: readonly ActionsEffect[], t: number,
  merge: (a: readonly DockerRegistry[], b: readonly DockerRegistry[]) => DockerRegistry[]): readonly DockerRegistry[] | undefined {
  let out = base;
  for (const e of [...due(pending, t), ...due(made, t)]) if (e.registries) out = merge(out ?? [], e.registries);
  return out;
}

/** Every host's clock at t (the runner's steps run then). */
export function hostsClock(state: FsState, t: number): FsState {
  if (!state.net?.hosts.length) return state;
  return { ...state, net: { ...state.net, hosts: state.net.hosts.map(h => (h.state.clock ? { ...h, state: { ...h.state, clock: { ...h.state.clock, now: t } } } : h)) } };
}
/** The hosts a step changed (anything but their clocks). */
export function hostChanges(before: FsState, after: FsState): HostEffect[] {
  const out: HostEffect[] = [];
  for (const h of after.net?.hosts ?? []) {
    const was = before.net?.hosts.find(x => x.host === h.host)?.state;
    if (!was || was === h.state) continue;
    const keys = new Set([...Object.keys(was), ...Object.keys(h.state)].filter(k => k !== 'clock'));
    if ([...keys].some(k => (was as unknown as Record<string, unknown>)[k] !== (h.state as unknown as Record<string, unknown>)[k])) out.push({ host: h.host, state: h.state });
  }
  return out;
}
/** Hosts' states from effects put in place (the learner's clock stays). */
export function applyHosts(state: FsState, hosts: readonly HostEffect[]): FsState {
  if (!state.net) return state;
  return { ...state, net: { ...state.net, hosts: state.net.hosts.map(h => { const x = hosts.find(y => y.host === h.host); return x ? { ...h, state: { ...x.state, ...h.state.clock ? { clock: h.state.clock } : {} } } : h; }) } };
}
