import type { Forge, Git } from './git-core';
import type { Gh } from './gh';
import { fail, invalid, type Json, type Reply } from './gh-api';
import { jobStatus, lastAttempt, type JobResult, type WorkflowRun } from './actions-model';
import { reviewRun } from './environments-run';
import { deploymentJson, deploymentsOf, environmentJson, pendingJson, statusesJson, userJson, usersOf } from './environments-json';
import { putEnvironment, policyRoute } from './gh-environments-put';
import type { EnvRules } from './environments-model';
import { deployHostsOf } from './deploy-hosts';

/*
 * Engine stage E30 (docs/curriculum/CICD0_E30_ENVIRONMENTS.md §6): gh api for the environments profile —
 * users/{login}; repos/{owner}/{repo}/environments (GET), environments/{name} (GET, PUT), its deployment-branch-policies
 * (GET, POST, DELETE …/{id}); actions/runs/{id}/pending_deployments (GET, POST with environment_ids, state and comment);
 * deployments (GET, ?environment= &sha= &ref=), deployments/{id} and its statuses (GET). Bodies have GitHub's shapes.
 */

export const ENV_ENDPOINTS = 'users/{login}、…/environments[/{name}[/deployment-branch-policies]]、…/actions/runs/{id}/pending_deployments、…/deployments[/{id}[/statuses]]';
/** The machine's registries for recomputed jobs (a runner's Docker), as withActions passes them. */
/** GitHub's REST docs (not gh-api.ts's constant: the two modules import each other). */
const DOCS = 'https://docs.github.com/rest';
export const envReg = (g: Git) => ({ ...g.state.ci?.art && g.state.docker?.registries ? { reg: g.state.docker.registries } : {}, ...deployHostsOf(g.state) });
const DOC_ENV = `${DOCS}/deployments/environments`, DOC_PENDING = `${DOCS}/actions/workflow-runs#review-pending-deployments-for-a-workflow-run`;

/** Whether the learner may review the environment's deployments of the run (a required reviewer; not the one who triggered it when self-review is prevented). */
export const canApprove = (h: Gh, e: EnvRules, run: WorkflowRun) => e.reviewers.includes(h.account.login) && !(e.preventSelfReview && run.actor === h.account.login);

function pending(h: Gh, f: Forge, run: WorkflowRun, method: string, body: Record<string, Json> | undefined): Reply {
  const { g } = h, now = g.now;
  const waiting = (r: WorkflowRun): JobResult[] => lastAttempt(r).jobs.filter(j => j.env?.waits && jobStatus(j, now) === 'waiting' && !(j.env.review && j.env.review.at <= now));
  const envOf = (j: JobResult) => f.site?.envRules?.find(e => e.id === j.env?.id);
  if (method === 'GET') return { status: 200, body: pendingJson(f, waiting(run), h.account.login, e => canApprove(h, e, run)) };
  if (method !== 'POST') return fail(404, 'Not Found');
  const b = body ?? {};
  for (const k of ['environment_ids', 'state', 'comment']) if (!(k in b)) return invalid(DOC_PENDING, `"${k}" wasn't supplied.`);
  const ids = b.environment_ids;
  if (!Array.isArray(ids) || !ids.length || ids.some(i => typeof i !== 'number' || !Number.isInteger(i))) return invalid(DOC_PENDING, `For 'properties/environment_ids', ${JSON.stringify(ids)} is not an array of integers.`);
  if (b.state !== 'approved' && b.state !== 'rejected') return invalid(DOC_PENDING, `For 'properties/state', ${JSON.stringify(b.state)} is not one of approved, rejected.`);
  if (typeof b.comment !== 'string') return invalid(DOC_PENDING, `For 'properties/comment', ${JSON.stringify(b.comment)} is not a string.`);
  const jobs = waiting(run).filter(j => j.env!.reviewers.length && ids.includes(j.env!.id));
  if (!jobs.length) return fail(422, 'No pending deployment requests to approve or reject', DOC_PENDING);
  if (jobs.some(j => { const e = envOf(j); return !e || !canApprove(h, e, run); })) return fail(422, 'There was a problem approving one of the gates', DOC_PENDING);
  const decided = reviewRun({ g, ci: h.ci!, ...envReg(g) }, f, run, ids as number[], { state: b.state, by: h.account.login, comment: b.comment, at: now });
  const all = deploymentsOf(f, now);
  return { status: 200, body: decided.flatMap(j => all.filter(d => d.id === j.env?.deployment)).map(d => deploymentJson(f, d, all, now)) };
}

function deployments(f: Forge, rest: string, now: number, query: URLSearchParams): Reply | undefined {
  const all = deploymentsOf(f, now);
  if (rest === '') {
    const env = query.get('environment'), sha = query.get('sha'), ref = query.get('ref');
    const list = all.filter(d => (env === null || d.env === env) && (sha === null || d.sha === sha) && (ref === null || d.ref === ref || `refs/heads/${d.ref}` === ref));
    return { status: 200, body: list.slice(0, 30).map(d => deploymentJson(f, d, all, now)) };
  }
  const m = /^\/(\d+)(\/statuses)?$/.exec(rest);
  if (!m) return undefined;
  const d = all.find(x => String(x.id) === m[1]);
  if (!d) return fail(404, 'Not Found', `${DOCS}/deployments/deployments#get-a-deployment`);
  return { status: 200, body: m[2] ? statusesJson(f, d, all, now) : deploymentJson(f, d, all, now) };
}

/** An environments-profile endpoint (undefined: not one of them, E26's routes decide). */
export function envApi(h: Gh, f: Forge | undefined, rest: string, method: string, body: Record<string, Json> | undefined, query: URLSearchParams): Reply | undefined {
  const { g } = h, now = g.now;
  if (!f) {
    const login = rest.slice('users/'.length), u = g.forge.flatMap(x => usersOf(x, h.account.login)).find(x => x.login.toLowerCase() === login.toLowerCase());
    return u ? { status: 200, body: { ...userJson(u), name: u.login === h.account.login ? h.account.name : u.name } } : fail(404, 'Not Found', `${DOCS}/users/users#get-a-user`);
  }
  const site = f.site!;
  if (rest === '/environments' && method === 'GET') {
    const list = site.envRules ?? [];
    return { status: 200, body: { total_count: list.length, environments: list.map(e => environmentJson(f, e, h.account.login)) } };
  }
  const env = /^\/environments\/([^/]+)(\/deployment-branch-policies(?:\/(\d+))?)?$/.exec(rest);
  if (env) {
    const name = decodeURIComponent(env[1]), e = site.envRules?.find(x => x.name.toLowerCase() === name.toLowerCase());
    if (env[2]) return policyRoute(h, f, e, method, body, env[3]);
    if (method === 'GET') return e ? { status: 200, body: environmentJson(f, e, h.account.login) } : fail(404, 'Not Found', `${DOC_ENV}#get-an-environment`);
    if (method === 'PUT') return putEnvironment(h, f, name, e, body ?? {});
    return fail(404, 'Not Found');
  }
  const run = /^\/actions\/runs\/(\d+)\/pending_deployments$/.exec(rest);
  if (run) {
    const r = (site.runs ?? []).find(x => String(x.id) === run[1] && x.createdAt <= now);
    return r ? pending(h, f, r, method, body) : fail(404, 'Not Found', DOC_PENDING);
  }
  const dep = /^\/deployments(\/.*)?$/.exec(rest);
  if (dep && method === 'GET') return deployments(f, dep[1] ?? '', now, query);
  return undefined;
}
