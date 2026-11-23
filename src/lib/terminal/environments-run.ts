import type { Forge } from './git-core';
import { toStr } from './expr-value';
import { interpolate, templateValue } from './expr-template';
import type { Workflow } from './workflow';
import { cancelJobAt, executeAttempt, githubContext, legOf, saveRun, workflowAt, type Actx } from './actions';
import { completedAt, jobStatus, lastAttempt, runStatus, type JobResult, type RunAttempt, type WorkflowRun } from './actions-model';
import { commitArt, retractArt } from './artifacts-run';
import { scoped } from './artifacts-model';
import { concurrencyText, type EnvReview } from './environments-model';

/*
 * Engine stage E30 (docs/curriculum/CICD0_E30_ENVIRONMENTS.md §4–5): what changes runs after they were computed.
 * - A new run of a concurrency group: with cancel-in-progress the group's unfinished runs are cancelled; otherwise a pending
 *   one is cancelled (only one may wait) and the new run waits for the running one (pending), starting when it ends.
 * - A review (POST …/pending_deployments) lets the waiting jobs of an environment go (or fails them): the attempt is
 *   recomputed from those jobs on, keeping the other jobs, IDs, caches and artifacts.
 * - settleEnv: after any change, pending runs and held jobs whose predecessor's end changed are recomputed, and the jobs
 *   newer jobs of their group cut are cancelled (their dependents recomputed), until nothing changes.
 */

/** The IDs of an attempt's jobs and deployments by leg (a recomputed attempt keeps them). */
function idsOf(jobs: readonly JobResult[]): Map<string, number> {
  const ids = new Map<string, number>();
  for (const j of jobs) { ids.set(`job:${legOf(j)}`, j.id); if (j.env?.deployment !== undefined) ids.set(`dep:${legOf(j)}`, j.env.deployment); }
  return ids;
}
/** Drops the caches, artifacts and pending effects of jobs that are recomputed (after: only what they made after then). */
function retractJobs(x: Actx, forge: Forge, removed: readonly JobResult[], after = -1) {
  const art = x.ci.state.art, site = forge.site;
  if (!art || !site) return;
  const late = <T extends { at: number }>(list: readonly T[] | undefined) => (list ?? []).filter(e => e.at > after);
  const caches = new Set(removed.flatMap(j => late(j.art?.caches).map(c => c.id))), artifacts = new Set(removed.flatMap(j => late(j.art?.artifacts).map(a => a.id)));
  const effects = new Set(removed.flatMap(j => late(j.art?.effects)));
  forge.site = { ...site, caches: (site.caches ?? []).filter(c => !caches.has(c.id)), artifacts: (site.artifacts ?? []).filter(a => !artifacts.has(a.id)) };
  x.ci.state = { ...x.ci.state, art: { ...art, pending: art.pending.filter(e => !effects.has(e)) } };
}
function replaceAttempt(x: Actx, forge: Forge, run: WorkflowRun, attempt: RunAttempt, fresh: ReadonlySet<number>): WorkflowRun {
  const next = { ...run, attempts: [...run.attempts.slice(0, -1), attempt] };
  saveRun(forge, next);
  commitArt(x.ci, forge, next, { ...attempt, jobs: attempt.jobs.map(j => (fresh.has(j.id) ? j : { ...j, reused: true })) });
  return next;
}

/** Recomputes these jobs of the run's last attempt (and their dependents); the rest is kept as it is. */
export function resumeAttempt(x: Actx, forge: Forge, run: WorkflowRun, redo: ReadonlySet<string>, replaced?: RunAttempt): WorkflowRun {
  const wf = workflowAt(x, run), prev = replaced ?? lastAttempt(run);
  if (!wf) return run;
  x.ids = idsOf(prev.jobs);
  const next = executeAttempt(x, forge, run, wf, prev.attempt, prev.startedAt, prev.actor, prev, redo);
  x.ids = undefined;
  retractJobs(x, forge, prev.jobs.filter(j => !next.jobs.includes(j)));
  return replaceAttempt(x, forge, run, { ...prev, jobs: next.jobs }, new Set(next.jobs.filter(j => !prev.jobs.includes(j)).map(j => j.id)));
}

/** A run cancelled by a newer run of its group at a time (a pending one never starts). */
function cancelForGroup(x: Actx, forge: Forge, run: WorkflowRun, at: number, note: string) {
  const a = lastAttempt(run), waited = a.pending || (a.after !== undefined && at < a.startedAt);
  const { pending: _p, ...rest } = a;
  void _p;
  const jobs = a.jobs.map(j => { const c = cancelJobAt(waited ? { ...j, queuedAt: Math.min(j.queuedAt, at) } : j, at); return c.completedAt === j.completedAt && c.conclusion === j.conclusion ? j : { ...c, annotations: [...c.annotations, { level: 'failure' as const, message: note, step: 0 }] }; });
  saveRun(forge, { ...run, attempts: [...run.attempts.slice(0, -1), { ...rest, jobs, cancelledAt: at, note, ...waited ? { startedAt: at } : {} }] });
  retractArt(x.ci, forge, run.id, at);
}

/** A new run's concurrency group: cancels what it replaces; the run it waits for, and when it starts (undefined: not known yet). */
export function admitRun(x: Actx, forge: Forge, run: WorkflowRun, wf: Workflow): { group?: { name: string; cancel: boolean }; after?: number; start?: number } {
  const c = wf.concurrency, site = forge.site!, at = run.createdAt;
  if (!c) return {};
  let name = '', cancel = false;
  try {
    const contexts = { github: githubContext(forge, run, 1, run.payload, run.actor), inputs: run.inputs ?? {}, vars: scoped(site.variables, undefined) };
    name = interpolate(c.group, { contexts });
    cancel = toStr(templateValue(c.cancelInProgress, { contexts })) === 'true';
  } catch { return {}; }
  if (!name) return {};
  let after: WorkflowRun | undefined;
  for (const r of (site.runs ?? []).filter(o => o.group?.name === name && runStatus(o, at) !== 'completed')) {
    if (cancel || runStatus(r, at) === 'pending') cancelForGroup(x, forge, r, at, concurrencyText(name));
    else after = r;
  }
  const group = { name, cancel };
  if (!after) return { group };
  const end = completedAt(after);
  return { group, after: after.id, ...end !== undefined ? { start: Math.max(end, at) } : {} };
}

/** A pending run whose predecessor's end changed: computed again from that end (it has not started, so nothing of it happened). */
function startPending(x: Actx, forge: Forge, run: WorkflowRun, start: number) {
  const a = lastAttempt(run), wf = workflowAt(x, run);
  if (!wf) return;
  retractArt(x.ci, forge, run.id, -1);
  x.ids = idsOf(a.jobs);
  const next = executeAttempt(x, forge, run, wf, a.attempt, start, a.actor);
  x.ids = undefined;
  replaceAttempt(x, forge, run, { ...next, after: a.after! }, new Set(next.jobs.map(j => j.id)));
}

/** A job a newer job of its group cut: cancelled then, with its dependents recomputed. */
function applyCut(x: Actx, forge: Forge, cut: NonNullable<Actx['cuts']>[number]) {
  const run = (forge.site!.runs ?? []).find(r => r.id === cut.runId), a = run && lastAttempt(run), j = a?.jobs.find(y => y.id === cut.jobId);
  if (!run || !a || !j || (j.completedAt !== undefined && j.completedAt <= cut.at)) return;
  const done = cancelJobAt(j, cut.at), note = { level: 'failure' as const, message: concurrencyText(cut.group), step: 0 };
  retractJobs(x, forge, [j], cut.at);
  const replaced = { ...a, jobs: a.jobs.map(y => (y.id === j.id ? { ...done, annotations: [...done.annotations, note] } : y)) };
  const wf = workflowAt(x, run), dependents = new Set(wf?.jobs.filter(w => w.needs.includes(j.key)).map(w => w.id) ?? []);
  if (dependents.size) resumeAttempt(x, forge, { ...run, attempts: [...run.attempts.slice(0, -1), replaced] }, dependents, replaced);
  else saveRun(forge, { ...run, attempts: [...run.attempts.slice(0, -1), replaced] });
}

/** After a change: cuts, pending runs and held jobs, until nothing changes (bounded). */
export function settleEnv(x: Actx, forge: Forge, now: number) {
  for (let round = 0; round < 40; round++) {
    const cut = x.cuts?.shift();
    if (cut) { applyCut(x, forge, cut); continue; }
    const runs = forge.site!.runs ?? [], byId = new Map(runs.map(r => [r.id, r]));
    const pending = runs.find(r => {
      const a = lastAttempt(r), pred = a.after !== undefined ? byId.get(a.after) : undefined;
      if (!pred || a.cancelledAt !== undefined || !(a.pending || a.startedAt > now)) return false;
      const end = completedAt(pred);
      return end !== undefined && (a.pending || a.startedAt !== Math.max(end, r.createdAt));
    });
    if (pending) { startPending(x, forge, pending, Math.max(completedAt(byId.get(lastAttempt(pending).after!)!)!, pending.createdAt)); continue; }
    const held = runs.flatMap(r => lastAttempt(r).jobs.filter(j => {
      const after = j.concurrency?.after;
      if (!after || (j.startedAt !== undefined && j.startedAt <= now) || (j.completedAt !== undefined && j.completedAt <= now)) return false;
      const b = byId.get(after.run), blocker = b && lastAttempt(b).jobs.find(y => y.id === after.job);
      return blocker?.completedAt !== j.concurrency!.until;
    }).map(j => ({ r, j })))[0];
    if (held) { resumeAttempt(x, forge, held.r, new Set([held.j.key])); continue; }
    return;
  }
}

/** POST …/pending_deployments: the review of these environments' waiting deployments of the run (the jobs it decided). */
export function reviewRun(x: Actx, forge: Forge, run: WorkflowRun, envIds: readonly number[], review: Omit<EnvReview, 'attempt' | 'envId' | 'env'>): JobResult[] {
  const a = lastAttempt(run), at = review.at;
  const waiting = a.jobs.filter(j => j.env && j.env.reviewers.length && envIds.includes(j.env.id) && jobStatus(j, at) === 'waiting' && !(j.env.review && j.env.review.at <= at));
  if (!waiting.length) return [];
  const envs = [...new Map(waiting.map(j => [j.env!.id, j.env!.name])).entries()];
  const next = { ...run, reviews: [...run.reviews ?? [], ...envs.map(([envId, env]) => ({ ...review, attempt: a.attempt, envId, env }))] };
  saveRun(forge, next);
  resumeAttempt(x, forge, next, new Set(waiting.map(j => j.key)));
  settleEnv(x, forge, at);
  const after = (forge.site!.runs ?? []).find(r => r.id === run.id)!;
  return lastAttempt(after).jobs.filter(j => waiting.some(w => legOf(w) === legOf(j)));
}
