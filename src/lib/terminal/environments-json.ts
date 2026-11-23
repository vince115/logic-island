import type { Forge } from './git-core';
import { repoPath, webUrl } from './forge';
import { API_BASE } from './forge-state';
import { apiTime } from './gh-run-view';
import type { JobResult, WorkflowRun } from './actions-model';
import { knownUsers, type EnvRules } from './environments-model';

/*
 * Engine stage E30 (docs/curriculum/CICD0_E30_ENVIRONMENTS.md §6): deployments as the REST API shows them. Every job that
 * passed its environment's branch policy created one (id, environment, the run's commit and branch, created by
 * github-actions[bot]); its statuses follow the job at the clock's time — waiting (protection rules), in_progress,
 * then success, failure (also a rejection) or error (cancelled) — and a successful deployment becomes inactive when a later
 * one to the same environment succeeds. Environments, reviewers and pending deployments have GitHub's JSON shapes.
 */

export type DeployState = 'waiting' | 'in_progress' | 'success' | 'failure' | 'error' | 'inactive';
export const DEPLOY_STATES: readonly DeployState[] = ['waiting', 'in_progress', 'success', 'failure', 'error', 'inactive'];
export interface Deployment { id: number; env: string; sha: string; ref: string; createdAt: number; run: WorkflowRun; job: JobResult }
export interface DeployStatus { id: number; state: DeployState; at: number }
const BOT = { login: 'github-actions[bot]', id: 41898282, type: 'Bot', html_url: 'https://github.example/apps/github-actions' };

/** The repository's deployments created by the time, newest first (a job kept by a rerun is one deployment). */
export function deploymentsOf(forge: Forge, t: number): Deployment[] {
  const out = new Map<number, Deployment>();
  for (const run of forge.site?.runs ?? []) {
    if (run.createdAt > t) continue;
    for (const a of run.attempts) for (const job of a.jobs) {
      const e = job.env;
      // A job cancelled before it reached its environment (a pending run of a concurrency group) made no deployment.
      if (e?.deployment === undefined || e.since > t || (job.completedAt !== undefined && job.completedAt < e.since)) continue;
      out.set(e.deployment, { id: e.deployment, env: e.name, sha: run.sha, ref: run.headBranch, createdAt: e.since, run, job });
    }
  }
  return [...out.values()].sort((a, b) => b.createdAt - a.createdAt || b.id - a.id);
}

const ended = (j: JobResult): DeployState => (j.conclusion === 'success' ? 'success' : j.conclusion === 'cancelled' ? 'error' : 'failure');
/** A deployment's statuses by the time, oldest first. */
export function statusesOf(d: Deployment, all: readonly Deployment[], t: number): DeployStatus[] {
  const j = d.job, list: { state: DeployState; at: number }[] = [];
  if (j.env!.waits) list.push({ state: 'waiting', at: d.createdAt });
  if (j.startedAt !== undefined && j.startedAt <= t) list.push({ state: 'in_progress', at: j.startedAt });
  if (j.completedAt !== undefined && j.completedAt <= t) list.push({ state: ended(j), at: j.completedAt });
  if (list.at(-1)?.state === 'success') {
    const later = all.filter(o => o.env === d.env && o.createdAt > d.createdAt && o.job.conclusion === 'success' && o.job.completedAt !== undefined && o.job.completedAt <= t);
    const first = later.sort((a, b) => a.job.completedAt! - b.job.completedAt!)[0];
    if (first) list.push({ state: 'inactive', at: first.job.completedAt! });
  }
  return list.map((s, i) => ({ id: d.id * 10 + i + 1, ...s }));
}
export const stateOf = (d: Deployment, all: readonly Deployment[], t: number): DeployState | 'queued' => statusesOf(d, all, t).at(-1)?.state ?? 'queued';

/** The users the forge knows on a repository (the learner, personas and approvers). */
export function usersOf(forge: Forge, learner: string) { return knownUsers(learner, forge.site?.personas ?? [], forge.site?.approvers ?? []); }
export const userJson = (u: { login: string; id: number }) => ({ login: u.login, id: u.id, type: 'User', html_url: `https://github.example/${u.login}` });
const reviewersJson = (forge: Forge, learner: string, logins: readonly string[]) =>
  logins.map(l => usersOf(forge, learner).find(u => u.login === l)).filter(u => u !== undefined).map(u => ({ type: 'User', reviewer: userJson(u) }));

const envUrl = (forge: Forge, name: string) => `${API_BASE}/repos/${repoPath(forge)}/environments/${encodeURIComponent(name)}`;
const envHtml = (forge: Forge, name: string) => `${webUrl(forge)}/deployments/activity_log?environments_filter=${encodeURIComponent(name)}`;
export const envRef = (forge: Forge, e: EnvRules) => ({ id: e.id, name: e.name, url: envUrl(forge, e.name), html_url: envHtml(forge, e.name) });

/** GET …/environments/{name}. */
export function environmentJson(forge: Forge, e: EnvRules, learner: string): Record<string, unknown> {
  const rules: Record<string, unknown>[] = [];
  if (e.waitTimer > 0) rules.push({ id: e.id * 10 + 1, type: 'wait_timer', wait_timer: e.waitTimer });
  if (e.reviewers.length) rules.push({ id: e.id * 10 + 2, prevent_self_review: e.preventSelfReview, type: 'required_reviewers', reviewers: reviewersJson(forge, learner, e.reviewers) });
  if (e.policy) rules.push({ id: e.id * 10 + 3, type: 'branch_policy' });
  return {
    id: e.id, name: e.name, url: envUrl(forge, e.name), html_url: envHtml(forge, e.name), created_at: apiTime(e.createdAt), updated_at: apiTime(e.updatedAt), can_admins_bypass: true,
    protection_rules: rules, deployment_branch_policy: e.policy ? { protected_branches: e.policy.protectedBranches, custom_branch_policies: !e.policy.protectedBranches } : null,
  };
}

/** GET …/actions/runs/{id}/pending_deployments: one item per environment the run's jobs wait for. */
export function pendingJson(forge: Forge, jobs: readonly JobResult[], learner: string, canApprove: (e: EnvRules) => boolean): Record<string, unknown>[] {
  const seen = new Set<number>(), out: Record<string, unknown>[] = [];
  for (const j of jobs) {
    const e = forge.site?.envRules?.find(x => x.id === j.env?.id);
    if (!e || seen.has(e.id)) continue;
    seen.add(e.id);
    out.push({ environment: envRef(forge, e), wait_timer: e.waitTimer, wait_timer_started_at: apiTime(j.env!.since), current_user_can_approve: canApprove(e), reviewers: reviewersJson(forge, learner, e.reviewers) });
  }
  return out;
}

/** GET …/deployments/{id}. */
export function deploymentJson(forge: Forge, d: Deployment, all: readonly Deployment[], t: number): Record<string, unknown> {
  const base = `${API_BASE}/repos/${repoPath(forge)}`, last = statusesOf(d, all, t).at(-1);
  return {
    url: `${base}/deployments/${d.id}`, id: d.id, sha: d.sha, ref: d.ref, task: 'deploy', payload: {}, original_environment: d.env, environment: d.env, description: null, creator: BOT,
    created_at: apiTime(d.createdAt), updated_at: apiTime(last?.at ?? d.createdAt), statuses_url: `${base}/deployments/${d.id}/statuses`, repository_url: base,
    transient_environment: false, production_environment: /^prod(uction)?$/i.test(d.env),
  };
}
/** GET …/deployments/{id}/statuses (newest first). */
export function statusesJson(forge: Forge, d: Deployment, all: readonly Deployment[], t: number): Record<string, unknown>[] {
  const base = `${API_BASE}/repos/${repoPath(forge)}`, log = `${webUrl(forge)}/actions/runs/${d.run.id}/job/${d.job.id}`;
  return statusesOf(d, all, t).reverse().map(s => ({
    url: `${base}/deployments/${d.id}/statuses/${s.id}`, id: s.id, state: s.state, creator: BOT, description: '', environment: d.env, target_url: log,
    created_at: apiTime(s.at), updated_at: apiTime(s.at), deployment_url: `${base}/deployments/${d.id}`, repository_url: base, environment_url: s.state === 'success' ? d.job.env?.url ?? '' : '', log_url: log,
  }));
}
