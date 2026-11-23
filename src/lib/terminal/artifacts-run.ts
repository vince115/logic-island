import type { FsState } from './fs';
import { clockOf } from './processes';
import { Git, type Forge } from './git-core';
import { pushed } from './forge-state';
import type { DockerRegistry } from './registry';
import type { CiState, RunAttempt, WorkflowRun } from './actions-model';
import type { ActionsEffect } from './artifacts-model';

/*
 * Engine stage E29 (docs/curriculum/CICD0_E29_ARTIFACTS.md §5): what an attempt leaves on the site once it is computed —
 * the caches its jobs saved (a key already saved for a ref is never replaced), the artifacts they uploaded (a new attempt
 * replaces the artifacts of the jobs it runs again) and their effects, which wait until the clock reaches them: refs the
 * job pushed with the GITHUB_TOKEN (they start no runs, as on GitHub) and images it pushed to a registry. A cancel drops
 * what had not happened yet.
 */

const silent = { out: () => {}, err: () => {}, user: 'root' };
const sameCache = (a: { key: string; ref: string; version: string }, b: typeof a) => a.key === b.key && a.ref === b.ref && a.version === b.version;

/** Records an attempt's caches, artifacts and effects (the jobs it computed, not the ones it kept). */
export function commitArt(ci: { state: CiState }, forge: Forge, run: WorkflowRun, attempt: RunAttempt): void {
  const art = ci.state.art, site = forge.site;
  if (!art || !site) return;
  const fresh = attempt.jobs.filter(j => !j.reused && j.art), kept = new Set(attempt.jobs.filter(j => j.reused).map(j => j.id));
  const caches = [...site.caches ?? []];
  for (const c of fresh.flatMap(j => j.art!.caches)) if (!caches.some(x => sameCache(x, c))) caches.push(c);
  const added = fresh.flatMap(j => j.art!.artifacts), latest = (a: { name: string; id: number }) => !added.some(b => b.name === a.name && b.id > a.id);
  // A name uploaded again with overwrite: true replaces the earlier artifact of the run.
  const artifacts = [...(site.artifacts ?? []).filter(a => a.runId !== run.id || (kept.has(a.jobId) && latest(a))), ...added.filter(latest)];
  const effects = fresh.flatMap(j => j.art!.effects);
  forge.site = { ...site, caches, artifacts };
  if (effects.length) ci.state = { ...ci.state, art: { ...art, pending: [...art.pending, ...effects].sort((a, b) => a.at - b.at) } };
}

/** gh run cancel at t: the run's caches, artifacts and effects after t never happen. */
export function retractArt(ci: { state: CiState } | undefined, forge: Forge, runId: number, t: number): void {
  const art = ci?.state.art, site = forge.site;
  if (!art || !site || !ci) return;
  const later = (x: { runId: number; at: number }) => x.runId === runId && x.at > t;
  forge.site = { ...site, caches: (site.caches ?? []).filter(c => !later(c)), artifacts: (site.artifacts ?? []).filter(a => !later(a)) };
  ci.state = { ...ci.state, art: { ...art, pending: art.pending.filter(e => !(e.url === forge.url && later(e))) } };
}

/** A registry after a runner's push: its tags, digests, manifests and layers added to what the machine knows. */
export function mergeRegistries(base: readonly DockerRegistry[], delta: readonly DockerRegistry[]): DockerRegistry[] {
  const out = [...base];
  for (const d of delta) {
    const i = out.findIndex(r => r.host === d.host);
    if (i < 0) { out.push(d); continue; }
    const b = out[i], union = (x: Readonly<Record<string, readonly string[]>>, y: Readonly<Record<string, readonly string[]>>) =>
      Object.fromEntries([...new Set([...Object.keys(x), ...Object.keys(y)])].map(k => [k, [...new Set([...x[k] ?? [], ...y[k] ?? []])]]));
    const tags = Object.fromEntries([...new Set([...Object.keys(b.tags), ...Object.keys(d.tags)])].map(k => [k, { ...b.tags[k], ...d.tags[k] }]));
    out[i] = { ...b, tags, digests: union(b.digests, d.digests), blobs: union(b.blobs, d.blobs), manifests: { ...b.manifests, ...d.manifests } };
  }
  return out;
}

/** Applies the effects whose time has come (before a git, gh or docker command, and before a check). */
export function settleArt(state: FsState): FsState {
  const art = state.ci?.art, now = clockOf(state).now;
  if (!art?.pending.length || !art.pending.some(e => e.at <= now)) return state;
  const due: ActionsEffect[] = art.pending.filter(e => e.at <= now);
  let next: FsState = { ...state, ci: { ...state.ci!, art: { ...art, pending: art.pending.filter(e => e.at > now) } } };
  if (next.git && due.some(e => e.refs?.length)) {
    const g = new Git(next, silent);
    for (const e of due) {
      const f = g.forge.find(x => x.url === e.url);
      if (!f || !e.refs) continue;
      for (const o of e.objects ?? []) g.store.put(o);
      for (const [ref, sha] of e.refs) {
        f.refs.set(ref, sha); g.learn(f.known, [sha]);
        if (f.site && ref.startsWith('refs/heads/')) f.site = pushed(f.site, ref.slice('refs/heads/'.length), sha, e.at);
      }
    }
    next = { ...g.result(), ci: next.ci };
  }
  for (const e of due) if (e.registries && next.docker) next = { ...next, docker: { ...next.docker, registries: mergeRegistries(next.docker.registries ?? [], e.registries) } };
  return next;
}
