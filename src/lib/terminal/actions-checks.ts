import { resolvePath, type FsState } from './fs';
import { clockOf } from './processes';
import { FORGE_URL } from './git-state';
import { Git, validRefName, type Forge } from './git-core';
import { actionsTick } from './actions-events';
import { jobStatus, lastAttempt, runConclusion, runStatus, type JobConclusion, type RunStatus, type WorkflowRun } from './actions-model';

/*
 * Engine stage E28 (docs/curriculum/CICD0_E28_ACTIONS.md §7): the check run, read after the learner's commands at the
 * machine's final time. It finds the latest run of a workflow (by file name, path or name) on a forge repository, with an
 * event, a branch, and tip (the run is for the branch's current commit), and checks its status, conclusion and attempt —
 * or a job's or a step's conclusion — and text its log includes or excludes. A run still in progress fails with a hint.
 */

export const RUN_EVENTS = ['push', 'pull_request', 'workflow_dispatch', 'schedule'] as const;
export type RunCheck = {
  kind: 'run'; repo: string; workflow: string; event?: string; ref?: string;
  /** The run is for the branch's (ref, default the default branch) current commit. */
  tip?: boolean;
  status?: RunStatus; conclusion?: JobConclusion;
  /** At least this attempt. */
  attempt?: number;
  job?: string; step?: string;
  logIncludes?: string; logExcludes?: string;
};
const silent = { out: () => {}, err: () => {}, user: 'root' };
const normalized = (p: string) => p.startsWith('/') && resolvePath({ cwd: '/', home: '/' }, p) === p;
const bare = (u: string) => u.replace(/\/+$/, '').replace(/\.git$/, '');
const base = (p: string) => p.slice(p.lastIndexOf('/') + 1);
export const matchesWorkflow = (r: WorkflowRun, w: string) => r.path === w || base(r.path) === w || r.workflowName === w || r.workflowName.toLowerCase() === w.toLowerCase();

function forgeOf(g: Git, repo: string): Forge | string {
  if (FORGE_URL.test(repo)) return g.forge.find(x => x.url === repo) ?? `github.example 上沒有 ${repo}`;
  const r = g.repos.find(x => x.path === repo && g.hasGitDir(x.path));
  if (!r) return `${repo} 不是 Git 儲存庫`;
  const url = r.config.get('remote.origin.url'), f = url ? g.forge.find(x => bare(x.url) === bare(url)) : undefined;
  return f ?? `${repo} 的 origin 不是 github.example 上的儲存庫`;
}

export function describeRunCheck(c: RunCheck): string {
  const which = `${c.repo}${c.ref ? ` 的 ${c.ref}` : ''}${c.tip ? (c.ref ? ' 目前的 commit' : ' 預設分支目前的 commit') : ''} 最新的${c.event ? ` ${c.event}` : ''} ${c.workflow} run`;
  const what = c.step ? `job ${c.job} 的 step「${c.step}」` : c.job ? `job ${c.job}` : '';
  const parts = [c.status ? `狀態是 ${c.status}` : '', c.conclusion ? `${what ? `${what} 的` : ''}結論是 ${c.conclusion}` : what ? `有 ${what}` : '', c.attempt ? `至少執行了 ${c.attempt} 次（attempt）` : '',
    c.logIncludes ? `日誌包含「${c.logIncludes}」` : '', c.logExcludes ? `日誌不包含「${c.logExcludes}」` : ''].filter(Boolean);
  return `${which} 應該${parts.length ? `：${parts.join('、')}` : '存在'}`;
}

/** Why the check fails on the machine after the commands (null: it holds). */
export function runFailure(c: RunCheck, end0: FsState): string | null {
  const end = actionsTick(end0), now = clockOf(end).now, g = new Git(end, silent), f = forgeOf(g, c.repo);
  if (typeof f === 'string') return f;
  const branch = c.ref ?? f.head.replace(/^refs\/heads\//, ''), tip = f.refs.get(`refs/heads/${branch}`) ?? f.refs.get(`refs/tags/${branch}`);
  const runs = (f.site?.runs ?? []).filter(r => matchesWorkflow(r, c.workflow) && (!c.event || r.event === c.event) && (!c.ref || r.headBranch === c.ref) && (!c.tip || r.headSha === tip) && r.createdAt <= now);
  const run = runs.sort((a, b) => b.createdAt - a.createdAt || b.id - a.id)[0];
  if (!run) return `沒有${c.event ? ` ${c.event} 觸發的` : ''} ${c.workflow} run${c.ref ? `（${c.ref}${c.tip ? ' 目前的 commit' : ''}）` : c.tip ? `（${branch} 目前的 commit）` : ''}`;
  const name = `最新的 run #${run.number}（${run.id}）`, a = lastAttempt(run), st = runStatus(run, now);
  if (c.status !== undefined && st !== c.status) return `${name}的狀態是 ${st}`;
  if (c.attempt !== undefined && a.attempt < c.attempt) return `${name}只執行了 ${a.attempt} 次（attempt ${a.attempt}）`;
  const job = c.job === undefined ? undefined : a.jobs.find(j => j.name === c.job) ?? a.jobs.find(j => j.key === c.job);
  if (c.job !== undefined && !job) return `${name}沒有 job ${c.job}`;
  const step = c.step === undefined || !job ? undefined : job.steps.find(s => s.name === c.step);
  if (c.step !== undefined && !step) return `${name}的 job ${c.job} 沒有 step「${c.step}」`;
  if (c.conclusion !== undefined) {
    const done = job ? jobStatus(job, now) === 'completed' : st === 'completed';
    if (!done) return `${name}${job ? `的 job ${c.job} ` : ''}還在執行（${job ? jobStatus(job, now) : st}），先用 gh run watch ${run.id} 等它完成`;
    const got = step ? step.conclusion : job ? job.conclusion : runConclusion(run);
    if (got !== c.conclusion) return `${name}${step ? `的 step「${c.step}」` : job ? `的 job ${c.job} ` : ''}的結論是 ${got}`;
  }
  if (c.logIncludes !== undefined || c.logExcludes !== undefined) {
    const text = (job ? [job] : a.jobs).flatMap(j => j.steps.filter(s => !step || s === step).flatMap(s => s.lines.filter(l => l.t <= now).map(l => l.text))).join('\n');
    if (c.logIncludes !== undefined && !text.includes(c.logIncludes)) return `${name}的日誌沒有「${c.logIncludes}」`;
    if (c.logExcludes !== undefined && text.includes(c.logExcludes)) return `${name}的日誌有「${c.logExcludes}」`;
  }
  return null;
}

/** The problems of a check's data (it needs an actions machine). */
export function runCheckProblems(c: RunCheck, actions: boolean): string | null {
  if (!actions || typeof c.repo !== 'string' || !(normalized(c.repo) || FORGE_URL.test(c.repo))) return 'a run check needs an actions machine (engine stage E28) and a repo (an absolute path or https://github.example/<owner>/<repo>.git)';
  if (typeof c.workflow !== 'string' || !c.workflow.trim()) return 'a run check needs a workflow (a file name like ci.yml, its path or its name)';
  if (c.event !== undefined && !(RUN_EVENTS as readonly string[]).includes(c.event)) return `a run check's event is one of ${RUN_EVENTS.join(', ')}`;
  if (c.ref !== undefined && (typeof c.ref !== 'string' || !validRefName(c.ref))) return 'a run check\'s ref is a branch or tag name';
  if (c.tip !== undefined && typeof c.tip !== 'boolean') return 'a run check\'s tip must be true or false';
  if (c.status !== undefined && !['queued', 'in_progress', 'completed'].includes(c.status)) return 'a run check\'s status is queued, in_progress or completed';
  if (c.conclusion !== undefined && !['success', 'failure', 'cancelled', 'skipped'].includes(c.conclusion)) return 'a run check\'s conclusion is success, failure, cancelled or skipped';
  if (c.conclusion !== undefined && c.status !== undefined && c.status !== 'completed') return 'a run check with a conclusion expects status completed';
  if (c.attempt !== undefined && !(Number.isInteger(c.attempt) && c.attempt >= 1 && c.attempt <= 10)) return 'a run check\'s attempt is 1..10';
  if (c.job !== undefined && (typeof c.job !== 'string' || !c.job)) return 'a run check\'s job is a job name or id';
  if (c.step !== undefined && (c.job === undefined || typeof c.step !== 'string' || !c.step)) return 'a run check\'s step needs a job and is a step name';
  for (const t of [c.logIncludes, c.logExcludes]) if (t !== undefined && (typeof t !== 'string' || !t || t.length > 500)) return 'a run check\'s logIncludes and logExcludes are texts of 1..500 characters';
  return null;
}
