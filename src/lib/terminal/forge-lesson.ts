import type { TerminalSecret, TerminalVariable } from './artifacts-lesson';
import type { TerminalApprover, TerminalEnvironment } from './environments-lesson';
import type { FsState } from './fs';
import { parseTime } from './clock';
import { validRefName } from './git-core';
import { emptySite, type CheckRule, type Conclusion, type ForgePull, type Match, type Persona, type Protection, type ReviewState } from './forge-state';
import type { TerminalMachine } from './lesson';

/*
 * Engine stage E26 as lesson data (docs/curriculum/CICD0_E26_FORGE.md §4). A machine of the forge profile is logged in to
 * github.example with gh (login, name, email) and may declare, per forge repository of its git data: the learner's
 * permission, the allowed merge methods, delete-branch-on-merge, branch protection, reviewer personas, status-check results
 * and open or closed pull requests. Commits are named by the git data's labels.
 */

type Review = 'approve' | 'request-changes' | 'comment';
export interface TerminalForgeProtection {
  branch: string;
  /** Pull requests are required, with this many approving reviews (0..6); absent: no review requirement. */
  approvals?: number;
  dismissStale?: boolean;
  /** Required status check contexts; strict: the head must be up to date with the base. */
  checks?: string[]; strict?: boolean;
  linear?: boolean; forcePush?: boolean; deletions?: boolean; enforceAdmins?: boolean;
}
export interface TerminalForgePersona {
  login: string; name?: string;
  /** Seconds after a pull request is opened or its head changes. */
  after: number;
  review: Review; body?: string;
  /** Only when the head's file includes the text; else otherwise (or no review). */
  when?: Match; otherwise?: { review: Review; body: string };
}
export interface TerminalForgeCheck { context: string; conclusion: Conclusion; /** A commit label (default: every commit). */ commit?: string; when?: Match; description?: string; seconds?: number }
export interface TerminalForgePull {
  number?: number; head: string; base?: string; title: string; body?: string;
  /** The learner's login or a persona's. */
  author: string;
  /** UTC 'YYYY-MM-DD HH:MM:SS'. */
  created: string;
  state?: 'open' | 'closed';
  reviews?: { by: string; review: Review; body?: string; time: string }[];
}
export interface TerminalForgeRepo {
  /** One of git.remotes. */
  url: string; description?: string;
  /** The learner's permission (default write: protection applies; admin bypasses it unless enforceAdmins). */
  permission?: 'admin' | 'write' | 'read';
  allowMerge?: boolean; allowSquash?: boolean; allowRebase?: boolean; deleteBranchOnMerge?: boolean;
  protection?: TerminalForgeProtection[];
  personas?: TerminalForgePersona[];
  checks?: TerminalForgeCheck[];
  pulls?: TerminalForgePull[];
  /** The next pull request number (default one more than the highest declared). */
  next?: number;
  /** E27 (workflows profile): the repository's Workflow permissions, the GITHUB_TOKEN's default (read: restricted, the default; write: permissive). */
  workflowPermissions?: 'read' | 'write';
  /** E29 (artifacts profile): Actions secrets (obviously fake values) and variables, at repository level or an environment's, and the environments. */
  secrets?: TerminalSecret[]; variables?: TerminalVariable[]; environments?: string[];
  /** E30 (environments profile): protection rules of the environments, and approver personas for deployments. */
  environmentRules?: TerminalEnvironment[]; approvers?: TerminalApprover[];
}
export interface TerminalForge { login: string; name?: string; email?: string; repos?: TerminalForgeRepo[] }

export const FORGE_LIMITS = { repos: 4, protection: 4, personas: 6, checks: 20, pulls: 10, text: 2000, after: 30 * 86400 } as const;
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const TEXT = (max: number) => (t: unknown) => typeof t === 'string' && t.length <= max;
const REVIEW: Record<Review, Exclude<ReviewState, 'DISMISSED'>> = { approve: 'APPROVED', 'request-changes': 'CHANGES_REQUESTED', comment: 'COMMENTED' };
const accountOf = (m: TerminalMachine) => {
  const login = m.forge?.login ?? m.user;
  return { login, name: m.forge?.name ?? m.git?.user?.name ?? login, email: m.forge?.email ?? m.git?.user?.email ?? `${login}@users.noreply.github.example` };
};

/** E26: the forge's settings, protection, personas, checks and pull requests on the machine's git state (and gh's account). */
export function forgeState(m: TerminalMachine, state: FsState, forge: boolean): FsState {
  if (!forge || forgeProblems(m, forge).length) return state;
  const git: NonNullable<FsState['git']> = state.git ?? { objects: new Map(), repos: [], forge: [] }, labels = git.labels ?? new Map<string, string>();
  const repos = git.forge.map((f, i) => {
    const d = m.forge?.repos?.find(x => x.url === f.url), site = emptySite(101 + i);
    if (!d) return { ...f, site };
    const protection = new Map<string, Protection>((d.protection ?? []).map(p => [p.branch, {
      ...p.approvals !== undefined ? { reviews: { approvals: p.approvals, dismissStale: p.dismissStale ?? false } } : {},
      ...p.checks ? { checks: { strict: p.strict ?? false, contexts: [...p.checks] } } : {},
      linear: p.linear ?? false, forcePush: p.forcePush ?? false, deletions: p.deletions ?? false, enforceAdmins: p.enforceAdmins ?? false,
    }]));
    const personas: Persona[] = (d.personas ?? []).map(p => ({ login: p.login, name: p.name ?? p.login, after: p.after, review: REVIEW[p.review], body: p.body ?? '',
      ...p.when ? { when: p.when } : {}, ...p.otherwise ? { otherwise: { review: REVIEW[p.otherwise.review], body: p.otherwise.body } } : {} }));
    const checks: CheckRule[] = (d.checks ?? []).map(c => ({ context: c.context, conclusion: c.conclusion, ...c.commit ? { commit: labels.get(c.commit) } : {}, ...c.when ? { when: c.when } : {}, description: c.description ?? '', seconds: c.seconds ?? 0 }));
    let next = 1;
    const pulls: ForgePull[] = (d.pulls ?? []).map(p => {
      const number = p.number ?? next, created = parseTime(p.created)!, sha = f.refs.get(`refs/heads/${p.head}`)!;
      next = Math.max(next, number + 1);
      return { number, title: p.title, body: p.body ?? '', author: p.author, head: p.head, base: p.base ?? f.head.slice('refs/heads/'.length), state: p.state === 'closed' ? 'CLOSED' as const : 'OPEN' as const,
        created, heads: [{ sha, at: created }], reviews: (p.reviews ?? []).map(r => ({ by: r.by, state: REVIEW[r.review], body: r.body ?? '', commit: sha, at: parseTime(r.time)! })),
        ...p.state === 'closed' ? { closedAt: created } : {} };
    });
    return { ...f, site: { ...site, description: d.description ?? '', permission: d.permission ?? 'write', deleteBranchOnMerge: d.deleteBranchOnMerge ?? false,
      methods: { merge: d.allowMerge ?? true, squash: d.allowSquash ?? true, rebase: d.allowRebase ?? true }, protection, personas, checks, pulls, next: Math.max(d.next ?? 1, next) } };
  });
  return { ...state, git: { ...git, forge: repos, account: accountOf(m) } };
}

/** E26: the problems of a machine's forge data (it needs the forge profile; repositories, logins, branches and labels must exist). */
export function forgeProblems(m: TerminalMachine, forge: boolean): string[] {
  const d = m.forge;
  if (d === undefined) return [];
  if (!forge) return ['forge needs the forge profile (engine stage E26)'];
  const problems: string[] = [], fail = (what: string) => problems.push(what);
  const me = accountOf(m), remotes = m.git?.remotes ?? [], labels = new Set((m.git?.commits ?? []).map(c => c.id));
  if (!LOGIN.test(d.login ?? '')) fail('forge: login must be a GitHub login (letters, digits, single hyphens, at most 39)');
  if (!/^[^<>\n]{1,80}$/.test(me.name) || !/^[^<>\s@]{1,64}@[^<>\s@]{1,128}$/.test(me.email)) fail('forge: needs a name and an email like mei@example.com');
  if ((d.repos ?? []).length > FORGE_LIMITS.repos) fail(`forge: at most ${FORGE_LIMITS.repos} repos`);
  const match = (w: Match | undefined, at: string) => { if (w !== undefined && (typeof w.path !== 'string' || !/^[^/]/.test(w.path) || !TEXT(200)(w.includes) || !w.includes)) fail(`${at}: when needs a relative path and the text it includes`); };
  const seen = new Set<string>();
  for (const r of d.repos ?? []) {
    const at = `forge repo ${r.url}`, remote = remotes.find(x => x.url === r.url), branches = remote?.branches ?? {};
    if (!remote || seen.has(r.url)) fail(`${at}: must be one of git.remotes (once)`);
    seen.add(r.url);
    if (r.permission !== undefined && !['admin', 'write', 'read'].includes(r.permission)) fail(`${at}: permission must be admin, write or read`);
    if (r.description !== undefined && !TEXT(200)(r.description)) fail(`${at}: description of at most 200 characters`);
    for (const k of ['allowMerge', 'allowSquash', 'allowRebase', 'deleteBranchOnMerge'] as const) if (r[k] !== undefined && typeof r[k] !== 'boolean') fail(`${at}: ${k} must be true or false`);
    if ((r.protection ?? []).length > FORGE_LIMITS.protection || (r.personas ?? []).length > FORGE_LIMITS.personas || (r.checks ?? []).length > FORGE_LIMITS.checks || (r.pulls ?? []).length > FORGE_LIMITS.pulls)
      fail(`${at}: at most ${FORGE_LIMITS.protection} protection rules, ${FORGE_LIMITS.personas} personas, ${FORGE_LIMITS.checks} checks and ${FORGE_LIMITS.pulls} pulls`);
    const protectedBranches = new Set<string>();
    for (const p of r.protection ?? []) {
      if (!validRefName(p.branch ?? '') || protectedBranches.has(p.branch)) fail(`${at}: protection needs a unique valid branch name`);
      protectedBranches.add(p.branch);
      if (p.approvals !== undefined && (!Number.isInteger(p.approvals) || p.approvals < 0 || p.approvals > 6)) fail(`${at}: protection ${p.branch}: approvals must be 0..6`);
      if (p.checks !== undefined && (!Array.isArray(p.checks) || p.checks.some(c => !TEXT(100)(c) || !c))) fail(`${at}: protection ${p.branch}: checks must be context names`);
      for (const k of ['dismissStale', 'strict', 'linear', 'forcePush', 'deletions', 'enforceAdmins'] as const) if (p[k] !== undefined && typeof p[k] !== 'boolean') fail(`${at}: protection ${p.branch}: ${k} must be true or false`);
      if ((p.dismissStale !== undefined && p.approvals === undefined) || (p.strict !== undefined && p.checks === undefined)) fail(`${at}: protection ${p.branch}: dismissStale needs approvals and strict needs checks`);
    }
    const logins = new Set<string>();
    for (const p of r.personas ?? []) {
      const pat = `${at} persona ${p.login}`;
      if (!LOGIN.test(p.login ?? '') || logins.has(p.login) || p.login === me.login) fail(`${pat}: needs a unique GitHub login other than the learner's`);
      logins.add(p.login);
      if (!Number.isInteger(p.after) || p.after < 0 || p.after > FORGE_LIMITS.after) fail(`${pat}: after must be 0..${FORGE_LIMITS.after} seconds`);
      if (!(p.review in REVIEW) || (p.otherwise !== undefined && (!(p.otherwise.review in REVIEW) || !TEXT(FORGE_LIMITS.text)(p.otherwise.body)))) fail(`${pat}: review must be approve, request-changes or comment`);
      if (p.body !== undefined && !TEXT(FORGE_LIMITS.text)(p.body)) fail(`${pat}: body of at most ${FORGE_LIMITS.text} characters`);
      if ((p.review !== 'approve' && !p.body) || (p.otherwise && p.otherwise.review !== 'approve' && !p.otherwise.body)) fail(`${pat}: request-changes and comment need a body`);
      if (p.otherwise !== undefined && p.when === undefined) fail(`${pat}: otherwise needs when`);
      match(p.when, pat);
      if (p.name !== undefined && !/^[^<>\n]{1,80}$/.test(p.name)) fail(`${pat}: invalid name`);
    }
    for (const c of r.checks ?? []) {
      const cat = `${at} check ${c.context}`;
      if (!TEXT(100)(c.context) || !c.context || !['success', 'failure', 'pending'].includes(c.conclusion)) fail(`${cat}: needs a context and a conclusion success, failure or pending`);
      if (c.commit !== undefined && !labels.has(c.commit)) fail(`${cat}: ${c.commit} is not a commit label`);
      if ((c.description !== undefined && !TEXT(100)(c.description)) || (c.seconds !== undefined && (!Number.isInteger(c.seconds) || c.seconds < 0 || c.seconds > 86400))) fail(`${cat}: description of at most 100 characters and seconds 0..86400`);
      match(c.when, cat);
    }
    const numbers = new Set<number>();
    let next = 1;
    for (const p of r.pulls ?? []) {
      const n = p.number ?? next, pat = `${at} pull #${n}`;
      next = Math.max(next, n + 1);
      if (!Number.isInteger(n) || n < 1 || numbers.has(n)) fail(`${pat}: needs a unique number of at least 1`);
      numbers.add(n);
      const base = p.base ?? remote?.head ?? ('main' in branches ? 'main' : Object.keys(branches)[0]);
      if (!(p.head in branches) || !base || !(base in branches) || p.head === base) fail(`${pat}: head and base must be two branches of the remote`);
      if (!TEXT(256)(p.title) || !p.title.trim() || (p.body !== undefined && !TEXT(FORGE_LIMITS.text)(p.body))) fail(`${pat}: needs a title (at most 256 characters) and a body of at most ${FORGE_LIMITS.text}`);
      if (p.author !== me.login && !logins.has(p.author)) fail(`${pat}: author must be the learner's login or a persona`);
      if (parseTime(p.created ?? '') === undefined) fail(`${pat}: created must be YYYY-MM-DD HH:MM:SS (UTC)`);
      if (p.state !== undefined && !['open', 'closed'].includes(p.state)) fail(`${pat}: state must be open or closed`);
      for (const v of p.reviews ?? []) if (!LOGIN.test(v.by ?? '') || v.by === p.author || !(v.review in REVIEW) || parseTime(v.time ?? '') === undefined || (v.body !== undefined && !TEXT(FORGE_LIMITS.text)(v.body)))
        fail(`${pat}: a review needs a login other than the author, a review and a time`);
    }
    if (r.next !== undefined && (!Number.isInteger(r.next) || r.next < 1 || r.next > 99999)) fail(`${at}: next must be 1..99999`);
  }
  return problems;
}
