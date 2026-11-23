import type { Forge, Git } from './git-core';
import { repoPath, webUrl } from './forge';
import { DEFAULT_PATH } from './script';
import { toStr, type Obj, type Val } from './expr-value';
import { evalIf, interpolate, templateValue } from './expr-template';
import { parseWorkflow, workflowErrorLines, workflowName, type Workflow } from './workflow';
import { expandMatrix, type MatrixSpec, type WorkflowJob } from './workflow-job';
import { effectivePermissions } from './workflow-perms';
import { executeJob } from './actions-job';
import { TEMP } from './runner';
import type { CiState, JobResult, RunAttempt, WorkflowRun } from './actions-model';
import type { DockerRegistry } from './registry';
import { masksOf, scoped } from './artifacts-model';
import { commitArt } from './artifacts-run';
import type { ArtPlan } from './artifacts-job';

/*
 * Engine stage E28 (docs/curriculum/CICD0_E28_ACTIONS.md §3): a workflow run's attempt, computed in full when it starts.
 * Jobs run in needs order with if:; a job starts when its needs finish (timestamps as if every job ran in parallel, plus a
 * runner's fixed pickup delay); a matrix expands into jobs (max-parallel shares the slots, fail-fast cancels the unfinished
 * siblings at the moment one fails); a job whose runs-on no runner has waits forever. Reruns make a new attempt (with
 * --failed only the failed jobs and their dependents run again); a cancel cuts the jobs at that moment.
 */

/** reg (E29): the machine's registries as they are now (a runner's Docker sees them). */
export interface Actx { g: Git; ci: { state: CiState }; reg?: readonly DockerRegistry[] }
export const MAX_JOBS = 12;
export const MAX_STEPS = 30;
export const MAX_RUNS = 200;

const nextJobId = (x: Actx) => { const id = x.ci.state.next.job; x.ci.state = { ...x.ci.state, next: { ...x.ci.state.next, job: id + 1 } }; return id; };
export const workspaceOf = (url: string) => { const name = repoPath({ url }).split('/')[1]; return `/home/runner/work/${name}/${name}`; };

/** The github context of a run's attempt (strings as GitHub gives them). */
export function githubContext(forge: Forge, run: WorkflowRun, attempt: number, payload: Obj, actor: string): Obj {
  const repo = repoPath(forge), refName = run.ref.replace(/^refs\/(heads|tags)\//, '').replace(/^refs\/pull\//, '');
  return {
    action: '', actor: run.actor, triggering_actor: actor, api_url: 'https://github.example/api/v3', server_url: 'https://github.example', graphql_url: 'https://github.example/api/graphql',
    base_ref: run.pr?.base ?? '', head_ref: run.pr?.head ?? '', event: payload, event_name: run.event, job: '', ref: run.ref, ref_name: refName,
    ref_type: run.ref.startsWith('refs/tags/') ? 'tag' : 'branch', repository: repo, repository_owner: repo.split('/')[0], run_id: String(run.id),
    run_number: String(run.number), run_attempt: String(attempt), sha: run.sha, workflow: run.workflowName, workflow_ref: `${repo}/${run.path}@${run.ref}`,
    workspace: workspaceOf(forge.url), token: '***', retention_days: '90',
  };
}
function defaultEnv(github: Obj, key: string, runner: string): Record<string, string> {
  const s = (k: string) => toStr(github[k] ?? '');
  return {
    CI: 'true', GITHUB_ACTIONS: 'true', GITHUB_ACTOR: s('actor'), GITHUB_TRIGGERING_ACTOR: s('triggering_actor'), GITHUB_API_URL: s('api_url'), GITHUB_SERVER_URL: s('server_url'),
    GITHUB_BASE_REF: s('base_ref'), GITHUB_HEAD_REF: s('head_ref'), GITHUB_EVENT_NAME: s('event_name'), GITHUB_JOB: key, GITHUB_REF: s('ref'), GITHUB_REF_NAME: s('ref_name'),
    GITHUB_REF_TYPE: s('ref_type'), GITHUB_REPOSITORY: s('repository'), GITHUB_REPOSITORY_OWNER: s('repository_owner'), GITHUB_RUN_ID: s('run_id'),
    GITHUB_RUN_NUMBER: s('run_number'), GITHUB_RUN_ATTEMPT: s('run_attempt'), GITHUB_SHA: s('sha'), GITHUB_WORKFLOW: s('workflow'), GITHUB_WORKSPACE: s('workspace'),
    RUNNER_ARCH: 'X64', RUNNER_NAME: runner, RUNNER_OS: 'Linux', RUNNER_TEMP: TEMP, RUNNER_TOOL_CACHE: '/opt/hostedtoolcache', HOME: '/home/runner', PATH: DEFAULT_PATH,
  };
}

/** The jobs in needs order (the workflow's order where it does not matter). */
function ordered(jobs: readonly WorkflowJob[]): WorkflowJob[] {
  const out: WorkflowJob[] = [], done = new Set<string>();
  while (out.length < jobs.length) {
    const next = jobs.find(j => !done.has(j.id) && j.needs.every(n => done.has(n)));
    if (!next) break;
    out.push(next); done.add(next.id);
  }
  return out;
}
/** What a job's dependents see: its result (failure, cancelled, skipped or success), its outputs and when it ended. */
function aggregate(list: readonly JobResult[]): { result: string; outputs: Obj; end?: number } {
  const result = list.some(j => j.conclusion === 'failure' && !j.continueOnError) ? 'failure' : list.some(j => j.conclusion === 'cancelled') ? 'cancelled'
    : list.length && list.every(j => j.conclusion === 'skipped') ? 'skipped' : 'success';
  const ends = list.map(j => j.completedAt);
  return { result, outputs: Object.assign({}, ...list.map(j => j.outputs)), ...ends.every(e => e !== undefined) ? { end: Math.max(0, ...ends as number[]) } : {} };
}
/** A job cut at a moment (a cancel or a fail-fast): the step running then is cancelled and Complete job follows. */
export function cancelJobAt(j: JobResult, t: number): JobResult {
  if (j.completedAt !== undefined && j.completedAt <= t) return j;
  if (j.startedAt === undefined || j.startedAt >= t) { const { startedAt: _s, ...rest } = j; void _s; return { ...rest, completedAt: t, conclusion: 'cancelled', steps: [] }; }
  const steps = j.steps.filter(s => s.completedAt <= t && s.name !== 'Complete job' && !s.name.startsWith('Post ')).map(s => ({ ...s }));
  const cur = j.steps.find(s => s.startedAt <= t && s.completedAt > t);
  if (cur) steps.push({ ...cur, completedAt: t, outcome: 'cancelled', conclusion: 'cancelled', lines: [...cur.lines.filter(l => l.t <= t), { t, text: '##[error]The operation was canceled.' }] });
  steps.push({ number: 0, name: 'Complete job', startedAt: t, completedAt: t, outcome: 'success', conclusion: 'success', lines: [{ t, text: 'Cleaning up orphan processes' }] });
  // E29: what the job would have saved, uploaded or pushed after t never happens.
  const art = j.art && { caches: j.art.caches.filter(c => c.at <= t), artifacts: j.art.artifacts.filter(a => a.at <= t), effects: j.art.effects.filter(e => e.at <= t) };
  return { ...j, completedAt: t, conclusion: 'cancelled', steps: steps.map((s, i) => ({ ...s, number: i + 1 })), ...art ? { art } : {} };
}

function matrixOf(job: WorkflowJob, ctx: Record<string, Val>): Obj[] | undefined {
  const m = job.strategy?.matrix;
  if (!m) return undefined;
  if (m.expression === undefined) return expandMatrix(m);
  const v = templateValue(m.expression, { contexts: ctx });
  if (!v || typeof v !== 'object' || Array.isArray(v)) return [];
  const spec: MatrixSpec = { vectors: [], include: [], exclude: [] };
  for (const [k, x] of Object.entries(v)) {
    if (k === 'include' || k === 'exclude') { if (Array.isArray(x)) spec[k] = x.filter((o): o is Obj => !!o && typeof o === 'object' && !Array.isArray(o)); }
    else if (Array.isArray(x)) spec.vectors.push([k, x]);
  }
  return expandMatrix(spec);
}

const memo = new WeakMap<object, Map<string, { jobs: readonly JobResult[]; next: number; art?: { artifact: number; cache: number } }>>();

/** Computes an attempt of a run (previous and failedOnly: rerun only the failed jobs of the previous attempt and their dependents). */
export function executeAttempt(x: Actx, forge: Forge, run: WorkflowRun, wf: Workflow, attempt: number, start: number, actor: string, previous?: RunAttempt): RunAttempt {
  const payload = run.payload as Obj;
  const ci = x.ci.state, site = forge.site!, cacheOf = ci.runner ? memo.get(ci.runner) ?? new Map() : undefined;
  const key = JSON.stringify([forge.url, run.id, run.number, run.path, run.sha, run.ref, run.event, run.title, run.actor, run.pr, run.inputs, attempt, start, actor, payload, ci.next.job, site.workflowPermissions,
    previous?.jobs.map(j => [j.id, j.key, j.conclusion]), ...ci.art ? [artKey(x, forge, run)] : []]);
  const hit = cacheOf?.get(key);
  if (hit) { x.ci.state = { ...ci, next: { ...ci.next, job: hit.next }, ...ci.art && hit.art ? { art: { ...ci.art, ...hit.art } } : {} }; return { attempt, startedAt: start, actor, jobs: hit.jobs }; }
  const objects = x.g.store.added.size ? x.g.store.all() : x.g.store.base;
  const github = githubContext(forge, run, attempt, payload, actor), results = new Map<string, JobResult[]>(), jobs: JobResult[] = [];
  const failedKeys = new Set(previous ? previous.jobs.filter(j => j.conclusion === 'failure' || j.conclusion === 'cancelled').map(j => j.key) : []);
  // Fix (E29 batch): a rerun of failed jobs reruns only the failed and cancelled legs of a matrix job (its successful legs are
  // kept) — every leg only when the job runs again because a job it needs does.
  const failedLegs = new Set(previous ? previous.jobs.filter(j => j.conclusion === 'failure' || j.conclusion === 'cancelled').map(legOf) : []), dependents = new Set<string>();
  if (previous) for (const job of ordered(wf.jobs)) if (job.needs.some(n => failedKeys.has(n))) { failedKeys.add(job.id); dependents.add(job.id); }
  // E29: the attempt's caches and artifacts so far (kept jobs' artifacts stay), and the artifact and cache counters.
  const work = ci.art ? {
    caches: [...site.caches ?? []], ids: { artifact: ci.art.artifact, cache: ci.art.cache },
    artifacts: (site.artifacts ?? []).filter(a => a.runId === run.id && !!previous?.jobs.some(j => j.id === a.jobId && !failedLegs.has(legOf(j)) && !dependents.has(j.key))),
  } : undefined;
  for (const job of ordered(wf.jobs)) {
    if (previous && job.needs.some(n => failedKeys.has(n))) failedKeys.add(job.id);
    if (previous && !failedKeys.has(job.id)) { const kept = previous.jobs.filter(j => j.key === job.id).map(j => ({ ...j, reused: true })); results.set(job.id, kept); jobs.push(...kept); continue; }
    const needs = job.needs.map(n => [n, aggregate(results.get(n) ?? [])] as const);
    const ctx: Record<string, Val> = { github: { ...github, job: job.id }, inputs: run.inputs ?? {}, vars: work ? scoped(site.variables, undefined) : {}, secrets: { GITHUB_TOKEN: '***' }, needs: Object.fromEntries(needs.map(([n, a]) => [n, { result: a.result, outputs: a.outputs }])) };
    const queuedAt = Math.max(start, ...needs.map(([, a]) => a.end ?? start));
    const shell = (over: Partial<JobResult>): JobResult => ({ id: nextJobId(x), key: job.id, name: job.name ?? job.id, labels: job.runsOn, queuedAt, continueOnError: false, steps: [], outputs: {}, annotations: [], ...over });
    if (needs.some(([, a]) => a.end === undefined)) { const r = shell({}); results.set(job.id, [r]); jobs.push(r); continue; }
    let runIt: boolean;
    try {
      const all = needs.every(([, a]) => a.result === 'success');
      runIt = job.if === undefined ? all : evalIf(job.if, { contexts: ctx, status: { failure: needs.some(([, a]) => a.result === 'failure') } }) && (all || /\b(always|failure|cancelled|success)\s*\(/i.test(job.if));
    } catch (e) {
      const r = shell({ startedAt: queuedAt, completedAt: queuedAt, conclusion: 'failure', annotations: [{ level: 'failure', message: e instanceof Error ? e.message : String(e), step: 0 }] });
      results.set(job.id, [r]); jobs.push(r); continue;
    }
    if (!runIt || jobs.length >= MAX_JOBS) { const r = shell({ startedAt: queuedAt, completedAt: queuedAt, conclusion: 'skipped' }); results.set(job.id, [r]); jobs.push(r); continue; }
    let combos: (Obj | undefined)[];
    try { combos = matrixOf(job, ctx) ?? [undefined]; } catch { combos = []; }
    combos = combos.slice(0, MAX_JOBS - jobs.length);
    const st = job.strategy, failFast = st ? toStr(templateValue(st.failFast, { contexts: ctx })) !== 'false' : true;
    const maxParallel = Math.max(1, Number(st?.maxParallel ? toStr(templateValue(st.maxParallel, { contexts: ctx })) : combos.length) || combos.length);
    const slots: number[] = Array(Math.min(maxParallel, Math.max(1, combos.length))).fill(queuedAt), list: JobResult[] = [];
    const partial = previous && !dependents.has(job.id) ? previous.jobs.filter(j => j.key === job.id) : undefined;
    combos.forEach((matrix, i) => {
      const before = partial?.find(j => legOf(j) === legOf({ key: job.id, matrix }));
      if (before && !failedLegs.has(legOf(before))) { list.push({ ...before, reused: true }); return; }
      const mctx: Record<string, Val> = { ...ctx, matrix: matrix ?? {}, strategy: { 'fail-fast': failFast, 'job-index': i, 'job-total': combos.length, 'max-parallel': maxParallel } };
      const name = job.name !== undefined ? interpolate(job.name, { contexts: mctx }) : matrix && Object.keys(matrix).length ? `${job.id} (${Object.values(matrix).map(v => (typeof v === 'object' && v ? JSON.stringify(v) : toStr(v))).join(', ')})` : job.id;
      const labels = job.runsOn.map(l => interpolate(l, { contexts: mctx }));
      const slot = slots.indexOf(Math.min(...slots)), at = slots[slot], id = nextJobId(x), runnerName = `GitHub Actions ${jobs.length + list.length + 1}`;
      if (!labels.length || !labels.every(l => ci.labels.includes(l)) || !ci.runner) {
        list.push({ id, key: job.id, name, ...matrix ? { matrix } : {}, labels, queuedAt: at, continueOnError: false, steps: [], outputs: {}, annotations: [] });
        slots[slot] = Infinity;
        return;
      }
      const capped = { ...job, steps: job.steps.slice(0, MAX_STEPS - 2) };
      const plan = work && artPlan(x, forge, run, job, mctx, work);
      const r = executeJob({ ...plan ? { art: plan } : {}, id, key: job.id, name, ...matrix ? { matrix } : {}, runnerName, queuedAt: at, labels, wf, job: capped, contexts: mctx, defaults: defaultEnv(mctx.github as Obj, job.id, runnerName),
        permissions: effectivePermissions(wf.permissions, job.permissions, site.workflowPermissions ?? 'read'), base: ci.runner, ci, objects, repoUrl: forge.url,
        workspace: workspaceOf(forge.url), attempt, sha: run.sha, ref: run.ref });
      list.push(r);
      if (work && plan) { work.caches = plan.caches; work.artifacts = plan.artifacts; }
      slots[slot] = r.completedAt ?? Infinity;
    });
    const failedAt = Math.min(...list.filter(j => j.conclusion === 'failure' && !j.continueOnError).map(j => j.completedAt!));
    const final = failFast && Number.isFinite(failedAt) ? list.map(j => cancelJobAt(j, failedAt)) : list;
    results.set(job.id, final); jobs.push(...final);
  }
  if (work && x.ci.state.art) x.ci.state = { ...x.ci.state, art: { ...x.ci.state.art, ...work.ids } };
  if (cacheOf && ci.runner) { if (cacheOf.size > 200) cacheOf.clear(); cacheOf.set(key, { jobs, next: x.ci.state.next.job, ...work ? { art: { ...work.ids } } : {} }); memo.set(ci.runner, cacheOf); }
  return { attempt, startedAt: start, actor, jobs };
}

/** The workflow at the run's commit (its file may be gone or invalid). */
export function workflowAt(x: Actx, run: Pick<WorkflowRun, 'sha' | 'path'>): Workflow | undefined {
  const c = x.g.store.get(run.sha);
  if (c?.type !== 'commit') return undefined;
  const text = x.g.files(run.sha).get(run.path), blob = text ? x.g.store.get(text.id) : undefined;
  const p = blob?.type === 'blob' ? parseWorkflow(run.path, blob.data) : undefined;
  return p?.ok ? p.workflow : undefined;
}

export interface NewRun extends Omit<WorkflowRun, 'id' | 'number' | 'attempts' | 'workflowName' | 'errors'> { payload: Obj }
/** Creates a run of a workflow file (an invalid file: a failed run with GitHub's errors and no jobs) and records it on the site. */
export function createRun(x: Actx, forge: Forge, n: NewRun, text: string): WorkflowRun {
  const p = parseWorkflow(n.path, text), id = x.ci.state.next.run;
  x.ci.state = { ...x.ci.state, next: { ...x.ci.state.next, run: id + 1 } };
  const runs = forge.site!.runs ?? [], number = runs.filter(r => r.path === n.path).length + 1, name = workflowName(n.path, p);
  const payload = n.payload;
  let title = n.title;
  if (p.ok && p.workflow.runName !== undefined) { try { title = interpolate(p.workflow.runName, { contexts: { github: { event_name: n.event, ref: n.ref, sha: n.sha, actor: n.actor, event: payload }, inputs: n.inputs ?? {}, vars: {} } }); } catch { /* GitHub falls back to the default title */ } }
  const run: WorkflowRun = { ...n, id, number, workflowName: name, title, attempts: [], ...p.ok ? {} : { errors: workflowErrorLines(n.path, p.errors, p.yaml) } };
  const attempt = p.ok ? executeAttempt(x, forge, run, p.workflow, 1, n.createdAt, n.actor) : { attempt: 1, startedAt: n.createdAt, actor: n.actor, jobs: [] };
  const done = { ...run, attempts: [attempt] };
  forge.site = { ...forge.site!, runs: [...runs, done].slice(-MAX_RUNS) };
  commitArt(x.ci, forge, done, attempt);
  return done;
}

/** Replaces a run on the site. */
export function saveRun(forge: Forge, run: WorkflowRun) { forge.site = { ...forge.site!, runs: (forge.site!.runs ?? []).map(r => (r.id === run.id ? run : r)) }; }

/** E29: what decides a remembered attempt on an artifacts machine (counters, secrets, variables, caches, the run's artifacts, refs, registries). */
function artKey(x: Actx, forge: Forge, run: WorkflowRun): unknown {
  const site = forge.site!, art = x.ci.state.art!;
  return [art.artifact, art.cache, site.secrets, site.variables, (site.caches ?? []).map(c => [c.id, c.key, c.ref, c.version, c.at]),
    (site.artifacts ?? []).filter(a => a.runId === run.id).map(a => [a.id, a.name, a.at, a.jobId]), [...forge.refs], [...site.protection],
    (x.reg ?? []).map(r => [r.host, r.tags, r.blobs])];
}
/** E29: a job's plan — its environment's secrets and variables (into the contexts), the caches and artifacts it sees, the forge copy. */
function artPlan(x: Actx, forge: Forge, run: WorkflowRun, job: WorkflowJob, mctx: Record<string, Val>, work: { caches: ArtPlan['caches']; artifacts: ArtPlan['artifacts']; ids: ArtPlan['ids'] }): ArtPlan {
  const site = forge.site!;
  let env: string | undefined;
  try { env = job.environment ? interpolate(job.environment.name, { contexts: mctx }) : undefined; } catch { env = undefined; }
  const secrets = scoped(site.secrets, env), vars = scoped(site.variables, env);
  mctx.secrets = { ...secrets, GITHUB_TOKEN: '***' };
  mctx.vars = vars;
  const scopes = [...new Set([run.ref, ...run.pr ? [`refs/heads/${run.pr.base}`] : [], forge.head])];
  return {
    runId: run.id, url: forge.url, web: webUrl(forge), secrets, vars, masks: masksOf(Object.values(secrets)), caches: work.caches, scopes, artifacts: work.artifacts, ids: work.ids,
    ...x.reg ? { registries: x.reg } : {}, forge: { url: forge.url, head: forge.head, refs: new Map(forge.refs), known: new Set(forge.known), ...forge.site ? { site: forge.site } : {} }, retention: 90,
  };
}

/** A job's leg: its key and matrix values (the job itself when it has no matrix). */
function legOf(j: { key: string; matrix?: Obj }): string { return `${j.key}\n${JSON.stringify(j.matrix ?? null)}`; }
