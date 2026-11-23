import type { Forge } from './git-core';
import type { Annotation, CiState, JobResult, WorkflowRun } from './actions-model';
import { REJECTED_TEXT, refAllowed, refusedText, type EnvRules, type EnvState, type JobEnv } from './environments-model';

/*
 * Engine stage E30 (docs/curriculum/CICD0_E30_ENVIRONMENTS.md §3): a job's environment gate. When a job that names an
 * environment is ready to start, the environment is created if the repository does not have it yet (as GitHub does);
 * a ref the deployment branch policy does not allow fails the job at once; otherwise a deployment is created and the job
 * waits for its protection rules — the wait timer, and with required reviewers the first review: one given through the
 * API (POST …/pending_deployments) or an approver persona's, after its seconds. An approval lets the job start (not
 * before the timer ends); a rejection fails it. Without a review yet the job waits (its start is not known).
 */

/** The counters, and the IDs a recomputed attempt keeps (job:<leg> and dep:<leg>). */
export interface GateCtx { ci: { state: CiState }; ids?: Map<string, number> }
export interface Gate { env: JobEnv; start?: number; end?: number; annotations: Annotation[] }

function counter(x: GateCtx, k: keyof EnvState): number {
  const st = x.ci.state.env!, n = st[k];
  x.ci.state = { ...x.ci.state, env: { ...st, [k]: n + 1 } };
  return n;
}
/** An ID kept from the attempt being recomputed, else a new one. */
export function takeId(x: GateCtx, key: string, fresh: () => number): number {
  const kept = x.ids?.get(key);
  if (kept === undefined) return fresh();
  x.ids!.delete(key);
  return kept;
}

/** The environment of that name (created without rules when the repository does not have it). */
export function ensureEnv(x: GateCtx, forge: Forge, name: string, at: number): EnvRules {
  const site = forge.site!, found = site.envRules?.find(e => e.name === name);
  if (found) return found;
  const rules: EnvRules = { id: counter(x, 'environment'), name, createdAt: at, updatedAt: at, reviewers: [], preventSelfReview: false, waitTimer: 0 };
  forge.site = { ...site, envRules: [...site.envRules ?? [], rules], environments: site.environments?.includes(name) ? site.environments : [...site.environments ?? [], name] };
  return rules;
}

/** The first review of the environment for a job waiting since then: given through the API, or an approver persona's. */
function decide(forge: Forge, run: WorkflowRun, attempt: number, rules: EnvRules, since: number): JobEnv['review'] {
  const given = (run.reviews ?? []).filter(r => r.attempt === attempt && r.envId === rules.id && r.at >= since).map(r => ({ state: r.state, by: r.by, at: r.at, comment: r.comment }));
  const personas = (forge.site!.approvers ?? []).filter(p => rules.reviewers.includes(p.login) && !(rules.preventSelfReview && p.login === run.actor))
    .map(p => ({ state: p.decision, by: p.login, at: since + p.after, comment: p.comment }));
  return [...given, ...personas].sort((a, b) => a.at - b.at)[0];
}

/** The ref a run deploys from (a pull request's head branch). */
export const deployRef = (run: WorkflowRun) => (run.pr ? `refs/heads/${run.pr.head}` : run.ref);

/** A job reaching its environment at a time: when it may start (undefined: it waits), or when it fails (end). */
export function gateJob(x: GateCtx, forge: Forge, run: WorkflowRun, attempt: number, name: string, at: number, leg: string): Gate {
  const rules = ensureEnv(x, forge, name, at), base = { name, id: rules.id, since: at, reviewers: rules.reviewers };
  const ref = deployRef(run);
  if (!refAllowed(rules, ref, new Set(forge.site!.protection.keys())))
    return { env: { ...base, waits: false, refused: true }, end: at, annotations: [{ level: 'failure', message: refusedText(ref, name), step: 0 }] };
  const deployment = takeId(x, `dep:${leg}`, () => counter(x, 'deployment'));
  const timerEnd = rules.waitTimer > 0 ? at + rules.waitTimer * 60 : undefined;
  const env: JobEnv = { ...base, waits: rules.reviewers.length > 0 || timerEnd !== undefined, deployment, ...timerEnd !== undefined ? { timerEnd } : {} };
  if (!rules.reviewers.length) return { env, start: timerEnd ?? at, annotations: [] };
  const review = decide(forge, run, attempt, rules, at);
  if (!review) return { env, annotations: [] };
  if (review.state === 'rejected') return { env: { ...env, review }, end: review.at, annotations: [{ level: 'failure', message: REJECTED_TEXT, step: 0 }] };
  return { env: { ...env, review }, start: Math.max(review.at, timerEnd ?? at), annotations: [] };
}

/** A job of another run that a newer job of the same concurrency group cuts at a time. */
export interface Cut { runId: number; jobId: number; at: number; group: string }
export type HoldCtx = GateCtx & { cuts?: Cut[] };
export type JobHold = NonNullable<JobResult['concurrency']>;

/**
 * Job-level concurrency (§4): the jobs of other runs in the same group that are queued or running when this one is ready.
 * cancel-in-progress cuts them all; otherwise a held (pending) one is cut ("only one pending") and this job waits for the
 * running one to finish (until undefined: its end is not known yet).
 */
export function holdJob(x: HoldCtx, forge: Forge, run: WorkflowRun, group: string, cancel: boolean, at: number): JobHold {
  const active = (forge.site!.runs ?? []).filter(r => r.id !== run.id).flatMap(r => r.attempts[r.attempts.length - 1].jobs
    .filter(j => j.concurrency?.group === group && j.queuedAt <= at && (j.completedAt === undefined || j.completedAt > at)).map(j => ({ r, j })));
  // A job its group still holds at that time (until is its queue time when nothing held it).
  const held = (j: (typeof active)[number]['j']) => j.concurrency!.until === undefined || j.concurrency!.until > at;
  const cut = cancel ? active : active.filter(a => held(a.j));
  for (const a of cut) (x.cuts ??= []).push({ runId: a.r.id, jobId: a.j.id, at, group });
  const running = active.filter(a => !cut.includes(a));
  if (!running.length) return { group, until: at };
  const last = running.sort((a, b) => (a.j.completedAt ?? Infinity) - (b.j.completedAt ?? Infinity)).at(-1)!;
  const after = { run: last.r.id, job: last.j.id };
  return last.j.completedAt === undefined ? { group, after } : { group, until: last.j.completedAt, after };
}
