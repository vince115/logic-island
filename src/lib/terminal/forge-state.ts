import { readTree, walk, type Objects, type Sha } from './git';

/*
 * Engine stage E26 (docs/curriculum/CICD0_E26_FORGE.md): what the simulated forge github.example keeps for a repository
 * besides its refs (git-state.ts ForgeRepo.site): settings, branch protection, pull requests with their head history and
 * reviews, the lesson's reviewer personas and declared status-check results. Everything here is immutable data; the
 * functions are pure (persona reviews and check results are derived from the clock and the commits, never stored).
 */

export type MergeMethod = 'merge' | 'squash' | 'rebase';
export type ReviewState = 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED';
export type Conclusion = 'success' | 'failure' | 'pending';
export interface Match { path: string; includes: string }

export interface Protection {
  /** required_pull_request_reviews (undefined: pull requests not required). */
  reviews?: { approvals: number; dismissStale: boolean };
  /** required_status_checks. */
  checks?: { strict: boolean; contexts: readonly string[] };
  linear: boolean; forcePush: boolean; deletions: boolean; enforceAdmins: boolean;
}
export interface ForgeReview { by: string; state: Exclude<ReviewState, 'DISMISSED'>; body: string; commit: Sha; at: number }
export interface ForgePull {
  number: number; title: string; body: string; author: string; head: string; base: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED'; created: number;
  /** The head branch's commits over time (the first is the head when the pull request was opened). */
  heads: readonly { sha: Sha; at: number }[];
  /** Reviews submitted with gh or declared by the lesson (persona reviews are derived, see reviewsOf). */
  reviews: readonly ForgeReview[];
  closedAt?: number;
  merged?: { method: MergeMethod; sha: Sha; by: string; at: number; commits: number; additions: number; deletions: number; /** The merge base when it was merged (gh pr diff). */ from?: Sha };
}
/** A reviewer the lesson declares: reviews each head of every open pull request by someone else, after seconds. */
export interface Persona {
  login: string; name: string; after: number;
  review: Exclude<ReviewState, 'DISMISSED'>; body: string;
  /** Only when the head's file includes the text; otherwise this review instead (none: no review). */
  when?: Match; otherwise?: { review: Exclude<ReviewState, 'DISMISSED'>; body: string };
}
/** A status-check result rule: the first rule of a context that matches a commit gives its result. */
export interface CheckRule { context: string; conclusion: Conclusion; commit?: Sha; when?: Match; description: string; seconds: number }
export interface ForgeSite {
  id: number; description: string;
  /** The learner's permission on the repository. */
  permission: 'admin' | 'write' | 'read';
  methods: { merge: boolean; squash: boolean; rebase: boolean };
  deleteBranchOnMerge: boolean;
  protection: ReadonlyMap<string, Protection>;
  pulls: readonly ForgePull[];
  /** The next pull request number. */
  next: number;
  personas: readonly Persona[];
  checks: readonly CheckRule[];
  /** E27 (workflows profile): the default GITHUB_TOKEN permissions when declared (read: restricted, the default; write: permissive). */
  workflowPermissions?: 'read' | 'write';
}
/** The gh account logged in to github.example. */
export interface ForgeAccount { login: string; name: string; email: string }

export const API_BASE = 'https://github.example/api/v3';
export const emptySite = (id: number): ForgeSite => ({
  id, description: '', permission: 'write', methods: { merge: true, squash: true, rebase: true }, deleteBranchOnMerge: false,
  protection: new Map(), pulls: [], next: 1, personas: [], checks: [],
});

/** A file's text in a commit (undefined when it has no such file). */
export function fileAt(objects: Pick<Objects, 'get'>, sha: Sha, path: string): string | undefined {
  const c = objects.get(sha);
  if (c?.type !== 'commit') return undefined;
  const e = readTree(objects, c.tree).get(path), b = e ? objects.get(e.id) : undefined;
  return b?.type === 'blob' ? b.data : undefined;
}
const matches = (objects: Pick<Objects, 'get'>, sha: Sha, m: Match | undefined) => !m || (fileAt(objects, sha, m.path)?.includes(m.includes) ?? false);

/** The check results of a commit, one per context in rule order. */
export function checksOf(site: ForgeSite, objects: Pick<Objects, 'get'>, sha: Sha): { context: string; conclusion: Conclusion; description: string; seconds: number }[] {
  const out = new Map<string, { context: string; conclusion: Conclusion; description: string; seconds: number }>();
  for (const r of site.checks) {
    if (out.has(r.context) || (r.commit !== undefined && r.commit !== sha) || !matches(objects, sha, r.when)) continue;
    out.set(r.context, { context: r.context, conclusion: r.conclusion, description: r.description, seconds: r.seconds });
  }
  return [...out.values()];
}

/** Every review of a pull request at a time: submitted ones and the personas' (derived), oldest first. */
export function reviewsOf(site: ForgeSite, objects: Pick<Objects, 'get'>, pr: ForgePull, now: number): ForgeReview[] {
  const out = pr.reviews.filter(r => r.at <= now);
  const end = Math.min(pr.closedAt ?? Infinity, pr.merged?.at ?? Infinity);
  for (const p of site.personas) {
    if (p.login === pr.author) continue;
    pr.heads.forEach((h, i) => {
      const at = h.at + p.after, superseded = pr.heads[i + 1]?.at ?? Infinity;
      if (at > now || at > superseded || at > end) return;
      const ok = matches(objects, h.sha, p.when);
      const r = ok ? { review: p.review, body: p.body } : p.otherwise;
      if (r) out.push({ by: p.login, state: r.review, body: r.body, commit: h.sha, at });
    });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** The latest deciding review of each reviewer (stale approvals dismissed when the base branch's protection says so). */
export function decisions(site: ForgeSite, objects: Pick<Objects, 'get'>, pr: ForgePull, now: number): { by: string; state: ReviewState }[] {
  const head = pr.heads.at(-1)!.sha, stale = site.protection.get(pr.base)?.reviews?.dismissStale ?? false;
  const latest = new Map<string, ReviewState>();
  for (const r of reviewsOf(site, objects, pr, now)) {
    const state: ReviewState = r.state === 'APPROVED' && stale && r.commit !== head ? 'DISMISSED' : r.state;
    if (state === 'COMMENTED' && latest.has(r.by)) continue;
    latest.set(r.by, state);
  }
  return [...latest].map(([by, state]) => ({ by, state }));
}
export const approvalsOf = (d: readonly { state: ReviewState }[]) => d.filter(x => x.state === 'APPROVED').length;

/** Why GitHub refuses an update of a protected branch (the remote: error lines), or undefined when it may proceed. */
export function refusal(site: ForgeSite, objects: Pick<Objects, 'get'>, branch: string, old: Sha | undefined, to: Sha | undefined, forced: boolean): string[] | undefined {
  const p = site.protection.get(branch);
  if (!p || (site.permission === 'admin' && !p.enforceAdmins)) return undefined;
  const head = [`GH006: Protected branch update failed for refs/heads/${branch}.`];
  if (!to) return p.deletions ? undefined : [...head, 'Cannot delete this protected branch'];
  if (forced && !p.forcePush) return [...head, 'Cannot force-push to this branch'];
  if (p.reviews) return [...head, p.reviews.approvals ? `At least ${p.reviews.approvals} approving review${p.reviews.approvals === 1 ? ' is' : 's are'} required by reviewers with write access.` : 'Changes must be made through a pull request.'];
  if (p.checks?.contexts.length) {
    const ok = new Set(checksOf(site, objects, to).filter(c => c.conclusion === 'success').map(c => c.context)), missing = p.checks.contexts.filter(c => !ok.has(c));
    if (missing.length === 1) return [...head, `Required status check "${missing[0]}" is expected.`];
    if (missing.length) return [...head, `${missing.length} of ${p.checks.contexts.length} required status checks are expected.`];
  }
  if (p.linear && walk(objects, [to], old ? [old] : []).some(id => { const c = objects.get(id); return c?.type === 'commit' && c.parents.length > 1; }))
    return [...head, 'This branch must not contain merge commits.'];
  return undefined;
}

/** After a push moved a branch, the open pull requests from it record their new head; deleting a branch closes the open pull requests from or into it. */
export function pushed(site: ForgeSite, branch: string, to: Sha | undefined, at: number): ForgeSite {
  const touched = (p: ForgePull) => p.state === 'OPEN' && (p.head === branch || (!to && p.base === branch));
  if (!site.pulls.some(touched)) return site;
  return { ...site, pulls: site.pulls.map(p => !touched(p) ? p : !to ? { ...p, state: 'CLOSED' as const, closedAt: at } : p.head === branch && p.heads.at(-1)!.sha !== to ? { ...p, heads: [...p.heads, { sha: to, at }] } : p) };
}

/** The REST API's branch protection object (the fields the simulation supports, in GitHub's order). */
export function protectionJson(repoPath: string, branch: string, p: Protection): Record<string, unknown> {
  const url = `${API_BASE}/repos/${repoPath}/branches/${branch}/protection`;
  return {
    url,
    ...p.checks ? { required_status_checks: { url: `${url}/required_status_checks`, strict: p.checks.strict, contexts: [...p.checks.contexts], contexts_url: `${url}/required_status_checks/contexts`, checks: p.checks.contexts.map(context => ({ context, app_id: null })) } } : {},
    ...p.reviews ? { required_pull_request_reviews: { url: `${url}/required_pull_request_reviews`, dismiss_stale_reviews: p.reviews.dismissStale, require_code_owner_reviews: false, require_last_push_approval: false, required_approving_review_count: p.reviews.approvals } } : {},
    required_signatures: { url: `${url}/required_signatures`, enabled: false },
    enforce_admins: { url: `${url}/enforce_admins`, enabled: p.enforceAdmins },
    required_linear_history: { enabled: p.linear },
    allow_force_pushes: { enabled: p.forcePush },
    allow_deletions: { enabled: p.deletions },
    block_creations: { enabled: false },
    required_conversation_resolution: { enabled: false },
    lock_branch: { enabled: false },
    allow_fork_syncing: { enabled: false },
  };
}
