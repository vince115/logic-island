import { isoText } from './clock';
import { fuzzyAgo } from './gh';
import {
  completedAt, elapsedText, jobStatus, lastAttempt, runConclusion, runStatus, stepStatus, symbol, type JobResult, type RunAttempt, type WorkflowRun,
} from './actions-model';

/*
 * Engine stage E28 (docs/curriculum/CICD0_E28_ACTIONS.md §5): what gh prints for runs — the rows of gh run list, the
 * screen of gh run view (header, JOBS with their steps, ANNOTATIONS, the hint lines) and the log lines of --log
 * (job, step and the runner's timestamp before each line), all at the machine's time.
 */

/** The runner's log timestamp: 2026-11-23T02:00:03.0000000Z */
export const logStamp = (t: number) => `${isoText(t).replace(' ', 'T')}.0000000Z`;
/** The API's time: 2026-11-23T02:00:03Z */
export const apiTime = (t: number) => `${isoText(t).replace(' ', 'T')}Z`;
export const runUrl = (web: string, r: WorkflowRun) => `${web}/actions/runs/${r.id}`;

export function jobSymbol(j: JobResult, t: number) { const st = jobStatus(j, t); return symbol(st, st === 'completed' ? j.conclusion : undefined); }
/** How long a run has taken at a time (until it completed). */
export function runElapsed(r: WorkflowRun, t: number, a: RunAttempt = lastAttempt(r)): number {
  const end = completedAt(r, a);
  return (end !== undefined && t >= end ? end : t) - a.startedAt;
}
/** One row of gh run list. */
export function listRow(r: WorkflowRun, t: number): string[] {
  const st = runStatus(r, t);
  return [symbol(st, st === 'completed' ? runConclusion(r) : undefined), r.title, r.workflowName, r.headBranch, r.event, String(r.id), elapsedText(runElapsed(r, t)), fuzzyAgo(t, r.createdAt)];
}

/** The fields of gh run list --json (sorted keys, as gh prints a map). */
export const JSON_FIELDS = ['attempt', 'conclusion', 'createdAt', 'databaseId', 'displayTitle', 'event', 'headBranch', 'headSha', 'name', 'number', 'startedAt', 'status', 'updatedAt', 'url', 'workflowDatabaseId', 'workflowName'];
export function jsonOf(r: WorkflowRun, t: number, web: string, workflowId: number, fields: readonly string[]): Record<string, unknown> {
  const a = lastAttempt(r), st = runStatus(r, t), end = completedAt(r, a);
  const all: Record<string, unknown> = {
    attempt: a.attempt, conclusion: st === 'completed' ? runConclusion(r) : '', createdAt: apiTime(r.createdAt), databaseId: r.id, displayTitle: r.title, event: r.event,
    headBranch: r.headBranch, headSha: r.headSha, name: r.workflowName, number: r.number, startedAt: apiTime(a.startedAt), status: st,
    updatedAt: apiTime(st === 'completed' && end !== undefined ? end : t), url: runUrl(web, r), workflowDatabaseId: workflowId, workflowName: r.workflowName,
  };
  return Object.fromEntries([...fields].sort().map(f => [f, all[f]]));
}

/** artifacts (E29): the run's artifacts, listed under ARTIFACTS (an expired one marked). */
export interface ViewOptions { verbose: boolean; job?: JobResult; footer: boolean; web: string; artifacts?: readonly { name: string; expiresAt: number }[] }
/** gh run view's screen at a time. */
export function viewLines(r: WorkflowRun, t: number, o: ViewOptions): string[] {
  const a = lastAttempt(r), st = runStatus(r, t), conclusion = st === 'completed' ? runConclusion(r) : undefined;
  const out = [`${symbol(st, conclusion)} ${r.headBranch} ${r.workflowName}${r.pr ? ` #${r.pr.number}` : ''} · ${r.id}${a.attempt > 1 ? ` (Attempt #${a.attempt})` : ''}`, `Triggered via ${r.event} ${fuzzyAgo(t, r.createdAt)}`, ''];
  if (r.errors) return [...out, 'X This run likely failed because of a workflow file issue.', '', ...r.errors.map(l => `  ${l}`), '', `For more information, see: ${runUrl(o.web, r)}`];
  out.push('JOBS');
  for (const j of o.job ? [o.job] : a.jobs) {
    const js = jobStatus(j, t);
    out.push(js === 'completed' && j.startedAt !== undefined ? `${jobSymbol(j, t)} ${j.name} in ${elapsedText(j.completedAt! - j.startedAt)} (ID ${j.id})` : `${jobSymbol(j, t)} ${j.name} (ID ${j.id})`);
    if (!(o.verbose || o.job || (js === 'completed' && j.conclusion === 'failure'))) continue;
    for (const s of j.steps) { if (t < s.startedAt) break; const ss = stepStatus(s, t); out.push(`  ${symbol(ss, ss === 'completed' ? s.conclusion : undefined)} ${s.name}`); }
  }
  // E30: what waiting and pending jobs (or a pending run) wait for.
  const waits = waitLines(r, o.job ? [o.job] : a.jobs, t);
  if (waits.length) out.push('', ...waits);
  const notes = (o.job ? [o.job] : a.jobs).filter(j => jobStatus(j, t) === 'completed').flatMap(j => j.annotations.map(n => ({ j, n })));
  if (a.note && !a.jobs.length && st === 'completed') out.push('', 'ANNOTATIONS', `X ${a.note}`);
  if (notes.length) {
    out.push('', 'ANNOTATIONS');
    for (const { j, n } of notes) out.push(`${n.level === 'failure' ? 'X' : n.level === 'warning' ? '!' : '-'} ${n.message}`, `${j.name}: .github#${n.step}`, '');
    out.pop();
  }
  if (o.artifacts?.length) out.push('', 'ARTIFACTS', ...o.artifacts.map(x => (x.expiresAt <= t ? `${x.name} (expired)` : x.name)));
  if (!o.footer) return out;
  out.push('');
  if (o.job) out.push(`To see the full job log, try: gh run view --log --job=${o.job.id}`);
  else if (conclusion === 'failure') out.push(`To see what failed, try: gh run view ${r.id} --log-failed`);
  else out.push('For more information about a job, try: gh run view --job=<job-id>');
  out.push(`View this run on GitHub: ${runUrl(o.web, r)}`);
  return out;
}

/** E30: the lines under JOBS for jobs waiting at their environment, jobs and runs held by their concurrency group. */
function waitLines(r: WorkflowRun, jobs: readonly JobResult[], t: number): string[] {
  const out: string[] = [];
  if (runStatus(r, t) === 'pending' && r.group) out.push(`Waiting for a run in the concurrency group '${r.group.name}' to complete`);
  for (const j of jobs) {
    const st = jobStatus(j, t);
    if (st === 'pending' && j.concurrency) out.push(`${j.name}: Waiting for a job in the concurrency group '${j.concurrency.group}' to complete`);
    if (st !== 'waiting' || !j.env) continue;
    if (j.env.reviewers.length && !(j.env.review && j.env.review.at <= t)) out.push(`${j.name}: Waiting for review: ${j.env.name} needs approval to start deploying changes.`);
    else if (j.env.timerEnd !== undefined && t < j.env.timerEnd) out.push(`${j.name}: Waiting for the wait timer of ${j.env.name} (${elapsedText(j.env.timerEnd - t)} left)`);
  }
  return out;
}

/** gh run view --log (failed: --log-failed): job, step and the timestamped line, tab separated. */
export function logLines(r: WorkflowRun, jobs: readonly JobResult[], t: number, failed: boolean): string[] {
  const out: string[] = [];
  for (const j of jobs) {
    if (failed && j.conclusion !== 'failure') continue;
    for (const s of j.steps) {
      if (failed && s.conclusion !== 'failure' && s.outcome !== 'failure') continue;
      for (const l of s.lines) if (l.t <= t) out.push(`${j.name}\t${s.name}\t${logStamp(l.t)} ${l.text}`);
    }
  }
  return out;
}
