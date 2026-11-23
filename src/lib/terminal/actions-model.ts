import type { FsState } from './fs';
import type { Obj, Val } from './expr-value';

/*
 * Engine stage E28 (docs/curriculum/CICD0_E28_ACTIONS.md): what GitHub Actions keeps. A run is computed in full when it
 * is created (every job, step, log line and time), so what gh shows is a pure function of the run and the clock: a job is
 * queued until its start, in progress until its end, then completed. A cancel or a fail-fast rewrites the jobs at that
 * moment. The runs of a repository live on its forge site (ForgeSite.runs); the machine keeps the CI tools, the runner
 * image and the ID counters (FsState.ci).
 */

export type JobConclusion = 'success' | 'failure' | 'cancelled' | 'skipped';
export type RunStatus = 'queued' | 'in_progress' | 'completed';

/** One condition of a CI tool case: a workspace file (relative to the working folder) or an environment variable. */
export interface CiCondition { path?: string; includes?: string; excludes?: string; absent?: boolean; env?: string; set?: boolean }
export interface CiCase {
  when: readonly CiCondition[]; stdout: string; stderr: string; exit: number; seconds: number;
  writes: readonly { path: string; content: string }[];
}
/** A CI tool the lesson declares (npm test, pytest): its result follows the files, so fixing the source fixes the test. */
export interface CiTool {
  command: readonly string[];
  where: 'both' | 'runner' | 'local';
  cases: readonly CiCase[];
  /** Fails on these attempts (a runner's run attempt; on the learner's machine, the how-many-th call). */
  flaky?: { failOnAttempts: readonly number[]; stdout: string; stderr: string; exit: number; seconds: number };
}
export interface CiState {
  tools: readonly CiTool[];
  /** The runner image every job starts from (the learner's machine only). */
  runner?: FsState;
  /** The runs-on labels that have runners. */
  labels: readonly string[];
  next: { run: number; job: number };
  /** Schedule events up to this time have been created. */
  scheduled: number;
  /** How many times each tool ran here (by its words). */
  calls: Readonly<Record<string, number>>;
  /** On a runner: the run attempt. */
  attempt?: number;
}

export interface LogLine { t: number; text: string }
export interface StepResult {
  number: number; name: string; startedAt: number; completedAt: number;
  /** After continue-on-error. */
  conclusion: JobConclusion;
  outcome: JobConclusion;
  lines: readonly LogLine[];
}
export interface Annotation { level: 'failure' | 'warning' | 'notice'; message: string; step: number }
export interface JobResult {
  id: number;
  /** The job's key in the workflow. */
  key: string;
  /** Its name (a matrix job: test (20)). */
  name: string;
  matrix?: Obj;
  labels: readonly string[];
  queuedAt: number;
  /** undefined: never picked up (no runner has the labels, or cancelled first). */
  startedAt?: number;
  /** undefined: it never ends (it waits for a runner). */
  completedAt?: number;
  conclusion?: JobConclusion;
  continueOnError: boolean;
  steps: readonly StepResult[];
  outputs: Readonly<Record<string, string>>;
  annotations: readonly Annotation[];
  runner?: string;
  /** Rerun of failed jobs: this result was kept from an earlier attempt. */
  reused?: boolean;
}
export interface RunAttempt { attempt: number; startedAt: number; actor: string; jobs: readonly JobResult[]; cancelledAt?: number }
export interface WorkflowRun {
  id: number; number: number; path: string; workflowName: string;
  event: string;
  /** The branch (a pull request's head branch) or tag the run is for, and the commit its checks attach to. */
  headBranch: string; headSha: string;
  /** GITHUB_SHA and GITHUB_REF (a pull request: its test merge commit and refs/pull/N/merge). */
  sha: string; ref: string;
  title: string; createdAt: number; actor: string;
  pr?: { number: number; head: string; base: string; baseSha: string };
  inputs?: Readonly<Record<string, Val>>;
  /** github.event. */
  payload: Readonly<Obj>;
  /** schedule: the cron line. */
  cron?: string;
  attempts: readonly RunAttempt[];
  /** An invalid workflow file: GitHub's error lines (the run has no jobs). */
  errors?: readonly string[];
}

export const lastAttempt = (r: WorkflowRun) => r.attempts[r.attempts.length - 1];
export const attemptOf = (r: WorkflowRun, n?: number) => (n === undefined ? lastAttempt(r) : r.attempts.find(a => a.attempt === n));

export function jobStatus(j: JobResult, t: number): RunStatus {
  if (j.completedAt !== undefined && t >= j.completedAt) return 'completed';
  if (j.startedAt !== undefined && t >= j.startedAt) return 'in_progress';
  return 'queued';
}
export function stepStatus(s: StepResult, t: number): RunStatus {
  return t >= s.completedAt ? 'completed' : t >= s.startedAt ? 'in_progress' : 'queued';
}
/** When the attempt ends (undefined: a job waits for a runner forever). */
export function completedAt(r: WorkflowRun, a = lastAttempt(r)): number | undefined {
  if (r.errors || !a.jobs.length) return a.startedAt;
  let end = a.startedAt;
  for (const j of a.jobs) { if (j.completedAt === undefined) return undefined; end = Math.max(end, j.completedAt); }
  return end;
}
export function runStatus(r: WorkflowRun, t: number, a = lastAttempt(r)): RunStatus {
  const end = completedAt(r, a);
  if (end !== undefined && t >= end) return 'completed';
  return a.jobs.some(j => jobStatus(j, t) !== 'queued') ? 'in_progress' : 'queued';
}
/** The attempt's conclusion once it completes. */
export function runConclusion(r: WorkflowRun, a = lastAttempt(r)): JobConclusion {
  if (r.errors) return 'failure';
  if (a.cancelledAt !== undefined) return 'cancelled';
  if (a.jobs.some(j => j.conclusion === 'failure' && !j.continueOnError)) return 'failure';
  if (a.jobs.some(j => j.conclusion === 'cancelled')) return 'cancelled';
  if (a.jobs.length && a.jobs.every(j => j.conclusion === 'skipped')) return 'skipped';
  return 'success';
}
/** gh's symbol for a status and conclusion. */
export function symbol(status: RunStatus, conclusion?: JobConclusion): string {
  if (status !== 'completed') return '*';
  return conclusion === 'success' ? '✓' : conclusion === 'failure' ? 'X' : '-';
}
/** gh's durations: 25s, 1m2s, 1h0m3s. */
export function elapsedText(s: number): string {
  const n = Math.max(0, Math.round(s));
  return n < 60 ? `${n}s` : n < 3600 ? `${Math.floor(n / 60)}m${n % 60}s` : `${Math.floor(n / 3600)}h${Math.floor(n / 60) % 60}m${n % 60}s`;
}

/** A status check of a commit from Actions: one per workflow, job and event (the latest run and attempt). */
export interface ActionsCheck {
  context: string; name: string; conclusion: 'success' | 'failure' | 'pending' | 'cancelled' | 'skipped'; description: string; seconds: number; url: string;
}
/** The check runs Actions reported for a commit at a time. */
export function actionsChecks(runs: readonly WorkflowRun[], sha: string, t: number, webUrl: string): ActionsCheck[] {
  const out = new Map<string, ActionsCheck>();
  for (const r of [...runs].filter(x => x.headSha === sha && x.createdAt <= t).sort((a, b) => b.createdAt - a.createdAt || b.id - a.id)) {
    for (const j of lastAttempt(r).jobs) {
      const key = `${r.workflowName}\n${j.name}\n${r.event}`;
      if (out.has(key)) continue;
      const st = jobStatus(j, t), conclusion = st === 'completed' ? j.conclusion ?? 'failure' : 'pending';
      const seconds = j.startedAt !== undefined && st === 'completed' ? j.completedAt! - j.startedAt : 0;
      out.set(key, { context: j.name, name: `${r.workflowName}/${j.name} (${r.event})`, conclusion, description: '', seconds, url: `${webUrl}/actions/runs/${r.id}/job/${j.id}` });
    }
  }
  return [...out.values()];
}
