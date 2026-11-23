/*
 * Engine stage E30 (docs/curriculum/CICD0_E30_ENVIRONMENTS.md): what the environments profile keeps on top of E29. A forge
 * repository's site holds its deployment environments with their protection rules (required reviewers, a wait timer, a
 * deployment branch policy) and the lesson's approver personas. A job that names an environment carries what happened at
 * its gate (JobEnv): when it started waiting, the deployment it created, the review that let it go (or stopped it). A run
 * keeps the reviews given through the API, and its concurrency group. Deployments and their statuses are derived from the
 * jobs at the clock's time, never stored.
 */

export interface BranchPattern { id: number; name: string }
/** A deployment environment and its protection rules (an environment without rules lets every job go at once). */
export interface EnvRules {
  id: number; name: string; createdAt: number; updatedAt: number;
  /** Required reviewers (logins); one approval is enough. */
  reviewers: readonly string[];
  preventSelfReview: boolean;
  /** Minutes (0..43200) a job waits once it reaches the environment. */
  waitTimer: number;
  /** undefined: every branch and tag may deploy. */
  policy?: { protectedBranches: boolean; patterns: readonly BranchPattern[] };
}
/** A reviewer the lesson declares: decides every deployment waiting for an environment it reviews, after seconds. */
export interface Approver { login: string; name: string; after: number; decision: 'approved' | 'rejected'; comment: string }
/** A review given through POST …/pending_deployments (or by an approver persona). */
export interface EnvReview { attempt: number; envId: number; env: string; state: 'approved' | 'rejected'; by: string; comment: string; at: number }

/** What happened at a job's environment gate. */
export interface JobEnv {
  name: string; id: number;
  /** When the job reached the environment (its deployment was created then). */
  since: number;
  /** The job had to wait (required reviewers or a wait timer). */
  waits: boolean;
  reviewers: readonly string[];
  /** The end of the wait timer (when there is one). */
  timerEnd?: number;
  deployment?: number;
  review?: { state: 'approved' | 'rejected'; by: string; at: number; comment: string };
  /** The branch policy did not allow the ref. */
  refused?: true;
  /** environment.url as evaluated at the end of the job. */
  url?: string;
}

/** E30's part of the machine's CI state: the deployment, environment and branch-policy ID counters. */
export interface EnvState { deployment: number; environment: number; policy: number }

/** The site's E30 data (on ForgeSite). */
export interface SiteEnv { envRules?: readonly EnvRules[]; approvers?: readonly Approver[] }

export const LEARNER_ID = 1001;
export const MAX_WAIT_TIMER = 43200;
export const MAX_REVIEWERS = 6;

/** A branch policy pattern as GitHub matches it (File.fnmatch with FNM_PATHNAME): * stops at /, ** does not, ? is one character. */
export function patternMatches(pattern: string, name: string): boolean {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*' && pattern[i + 1] === '*') { re += '.*'; i++; }
    else if (ch === '*') re += '[^/]*';
    else if (ch === '?') re += '[^/]';
    else re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`).test(name);
}

/** Whether a run's ref may deploy to the environment (protected: a protected branch; patterns: a branch matching one). */
export function refAllowed(rules: EnvRules | undefined, ref: string, protectedBranches: ReadonlySet<string>): boolean {
  const p = rules?.policy;
  if (!p) return true;
  const branch = /^refs\/heads\//.test(ref) ? ref.slice(11) : undefined;
  if (branch === undefined) return false;
  if (p.protectedBranches) return protectedBranches.has(branch);
  return p.patterns.some(x => patternMatches(x.name, branch));
}
/** GitHub's message when the branch policy refuses a ref. */
export function refusedText(ref: string, env: string): string {
  const tag = ref.startsWith('refs/tags/'), name = ref.replace(/^refs\/(heads|tags)\//, '');
  return `${tag ? 'Tag' : 'Branch'} "${name}" is not allowed to deploy to ${env} due to environment protection rules.`;
}
export const REJECTED_TEXT = "The deployment was rejected or didn't satisfy other protection rules.";
export const concurrencyText = (group: string) => `Canceling since a higher priority waiting request for '${group}' exists`;

/** The users the forge knows (gh api users/{login}, reviewer IDs): the learner (1001), then the personas and approvers (2001…). */
export function knownUsers(learner: string, personas: readonly { login: string; name: string }[], approvers: readonly { login: string; name: string }[]): { login: string; name: string; id: number }[] {
  const out = [{ login: learner, name: learner, id: LEARNER_ID }];
  for (const p of [...personas, ...approvers]) if (!out.some(u => u.login === p.login)) out.push({ login: p.login, name: p.name, id: 2001 + out.length - 1 });
  return out;
}
