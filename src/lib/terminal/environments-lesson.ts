import type { FsState } from './fs';
import { DEFAULT_NOW, parseTime } from './clock';
import type { TerminalMachine } from './lesson';
import { MAX_REVIEWERS, MAX_WAIT_TIMER, type Approver, type EnvRules } from './environments-model';

/*
 * Engine stage E30 as lesson data (docs/curriculum/CICD0_E30_ENVIRONMENTS.md §7). Per forge repository a lesson may give
 * the environments it declares (E29's environments) protection rules — required reviewers (the learner, PR personas or
 * approvers), prevent self-review, a wait timer in minutes, and a deployment branch policy (protected branches, or custom
 * branch name patterns) — and declare approver personas, who decide every deployment waiting for an environment they
 * review, a number of seconds after it started waiting (approve, or reject with a comment).
 */

export interface TerminalEnvironment {
  /** One of the repository's environments. */
  name: string;
  /** Required reviewers: the learner's login, personas' or approvers' (at most 6; one approval is enough). */
  reviewers?: string[];
  preventSelfReview?: boolean;
  /** Minutes 0..43200. */
  waitTimer?: number;
  /** 'protected': only protected branches may deploy; patterns: branches matching one (* stops at /, ** does not). */
  branches?: 'protected' | string[];
}
export interface TerminalApprover {
  login: string; name?: string;
  /** Seconds after a deployment starts waiting. */
  after: number;
  /** Default approve. */
  decision?: 'approve' | 'reject';
  comment?: string;
}

export const ENVIRONMENTS_LIMITS = { rules: 6, approvers: 6, patterns: 10, after: 30 * 86400, comment: 2000 } as const;
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
export const PATTERN = /^[A-Za-z0-9_.\-/*?]{1,255}$/;
/** The first IDs: environments, deployments and branch policies. */
export const ENV_IDS = { environment: 161088001, deployment: 1900000001, policy: 3100001 } as const;

/** E30: the problems of a machine's environments data (protection rules and approvers need the profile). */
export function environmentsProblems(m: TerminalMachine, environments: boolean): string[] {
  const out: string[] = [], learner = m.forge?.login ?? m.user;
  for (const r of m.forge?.repos ?? []) {
    const at = `forge repo ${r.url}`;
    if (r.environmentRules === undefined && r.approvers === undefined) continue;
    if (!environments) { out.push(`${at}: environmentRules and approvers need the environments profile (engine stage E30)`); continue; }
    const approvers = r.approvers ?? [], rules = r.environmentRules ?? [];
    if (!Array.isArray(approvers) || approvers.length > ENVIRONMENTS_LIMITS.approvers) out.push(`${at}: at most ${ENVIRONMENTS_LIMITS.approvers} approvers`);
    const logins = new Set<string>();
    for (const a of Array.isArray(approvers) ? approvers : []) {
      const where = `${at}: approver ${a?.login}`;
      if (!LOGIN.test(a?.login ?? '') || logins.has(a.login) || a.login === learner) out.push(`${where}: needs a unique GitHub login other than the learner's`);
      logins.add(a?.login);
      if (!Number.isInteger(a?.after) || a.after < 0 || a.after > ENVIRONMENTS_LIMITS.after) out.push(`${where}: after must be 0..${ENVIRONMENTS_LIMITS.after} seconds`);
      if (a?.decision !== undefined && a.decision !== 'approve' && a.decision !== 'reject') out.push(`${where}: decision must be approve or reject`);
      if (a?.comment !== undefined && (typeof a.comment !== 'string' || a.comment.length > ENVIRONMENTS_LIMITS.comment)) out.push(`${where}: comment of at most ${ENVIRONMENTS_LIMITS.comment} characters`);
      if (a?.name !== undefined && !/^[^<>\n]{1,80}$/.test(a.name)) out.push(`${where}: invalid name`);
    }
    const known = new Set([learner, ...(r.personas ?? []).map(p => p.login), ...logins]);
    if (!Array.isArray(rules) || rules.length > ENVIRONMENTS_LIMITS.rules) { out.push(`${at}: at most ${ENVIRONMENTS_LIMITS.rules} environmentRules`); continue; }
    const named = new Set<string>();
    for (const e of rules) {
      const where = `${at}: environment ${e?.name}`;
      if (!(r.environments ?? []).includes(e?.name) || named.has(e.name)) out.push(`${where}: must be one of environments (once)`);
      named.add(e?.name);
      const reviewers = e?.reviewers ?? [];
      if (!Array.isArray(reviewers) || reviewers.length > MAX_REVIEWERS || new Set(reviewers).size !== reviewers.length || reviewers.some(l => !known.has(l)))
        out.push(`${where}: reviewers are at most ${MAX_REVIEWERS} distinct logins of the learner, personas or approvers`);
      if (e?.preventSelfReview !== undefined && typeof e.preventSelfReview !== 'boolean') out.push(`${where}: preventSelfReview must be true or false`);
      if (e?.waitTimer !== undefined && !(Number.isInteger(e.waitTimer) && e.waitTimer >= 0 && e.waitTimer <= MAX_WAIT_TIMER)) out.push(`${where}: waitTimer is 0..${MAX_WAIT_TIMER} minutes`);
      const b = e?.branches;
      if (b !== undefined && b !== 'protected' && !(Array.isArray(b) && b.length >= 1 && b.length <= ENVIRONMENTS_LIMITS.patterns && b.every(p => typeof p === 'string' && PATTERN.test(p)) && new Set(b).size === b.length))
        out.push(`${where}: branches is 'protected' or 1..${ENVIRONMENTS_LIMITS.patterns} distinct branch name patterns`);
    }
  }
  return out;
}

/** E30: the forge repositories' environments with their rules and approvers, and the CI state's counters (environments profile). */
export function environmentsState(m: TerminalMachine, state: FsState, environments: boolean): FsState {
  if (!environments || !state.ci || environmentsProblems(m, environments).length) return state;
  const now = parseTime(m.now ?? DEFAULT_NOW)!, ids = { ...ENV_IDS } as { environment: number; deployment: number; policy: number };
  const git = state.git && {
    ...state.git,
    forge: state.git.forge.map(f => {
      if (!f.site) return f;
      const d = m.forge?.repos?.find(r => r.url === f.url);
      const envRules: EnvRules[] = (f.site.environments ?? []).map(name => {
        const e = d?.environmentRules?.find(x => x.name === name), b = e?.branches;
        const policy = b === undefined ? undefined : { protectedBranches: b === 'protected', patterns: b === 'protected' ? [] : b.map(p => ({ id: ids.policy++, name: p })) };
        return { id: ids.environment++, name, createdAt: now, updatedAt: now, reviewers: [...e?.reviewers ?? []], preventSelfReview: e?.preventSelfReview ?? false, waitTimer: e?.waitTimer ?? 0, ...policy ? { policy } : {} };
      });
      const approvers: Approver[] = (d?.approvers ?? []).map(a => ({ login: a.login, name: a.name ?? a.login, after: a.after, decision: a.decision === 'reject' ? 'rejected' : 'approved', comment: a.comment ?? '' }));
      return { ...f, site: { ...f.site, envRules, approvers } };
    }),
  };
  return { ...state, ...git ? { git } : {}, ci: { ...state.ci, env: ids } };
}
