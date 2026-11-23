import { resolvePath, type FsState } from './fs';
import { readTree } from './git';
import { FORGE_URL } from './git-state';
import { Git, validRefName, type Forge } from './git-core';
import { isWorkflowPath, parseWorkflow, workflowErrorLines, type Workflow } from './workflow';
import { EVENTS } from './workflow-on';
import { triggers } from './workflow-match';
import { effectivePermissions, grantedScopes, SCOPES, type Scope } from './workflow-perms';

/*
 * Engine stage E27 (docs/curriculum/CICD0_E27_WORKFLOWS.md §7): the check workflow, read after the learner's commands.
 * repo is a forge URL (the file on ref, default the default branch) or a local repository (the file in its folder, or on
 * ref when given). It checks validity (or GitHub's message against a regular expression), the declared events or the
 * events a push / pull request to a ref with these changed files would start, and a job's effective token permissions.
 */

export const SCENARIO_EVENTS = ['push', 'pull_request', 'pull_request_target', 'workflow_dispatch', 'schedule'] as const;
export type WorkflowCheck = {
  kind: 'workflow'; repo: string; path: string; ref?: string;
  valid?: boolean;
  /** The declared events (in any order), or the events that start it for a push to / pull request into ref changing paths. */
  on?: string[] | { ref: string; paths?: string[]; events: string[] };
  job?: string;
  /** The job's effective GITHUB_TOKEN permissions: exactly these scopes are not none. */
  permissions?: Partial<Record<Scope, 'read' | 'write'>>;
  /** A regular expression GitHub's message for the invalid file must match. */
  error?: string;
};
export const WORKFLOW_CHECK_KINDS = ['workflow'] as const;

const silent = { out: () => {}, err: () => {}, user: 'root' };
const normalized = (p: string) => p.startsWith('/') && resolvePath({ cwd: '/', home: '/' }, p) === p;
const bare = (u: string) => u.replace(/\/+$/, '').replace(/\.git$/, '');

/** The file's text (or why there is none) and the forge repository behind it. */
function source(g: Git, c: WorkflowCheck): { text?: string; why?: string; forge?: Forge } {
  const fromCommit = (sha: string | undefined) => {
    if (!sha || g.store.get(sha)?.type !== 'commit') return undefined;
    const e = readTree(g.store, g.commit(sha).tree).get(c.path), b = e ? g.store.get(e.id) : undefined;
    return b?.type === 'blob' ? b.data : undefined;
  };
  if (FORGE_URL.test(c.repo)) {
    const forge = g.forge.find(x => x.url === c.repo);
    if (!forge) return { why: `github.example 上沒有 ${c.repo}` };
    const ref = c.ref ?? forge.head.replace(/^refs\/heads\//, ''), sha = forge.refs.get(ref.startsWith('refs/') ? ref : `refs/heads/${ref}`) ?? forge.refs.get(`refs/tags/${ref}`);
    if (!sha) return { why: `${c.repo} 沒有 ${ref}`, forge };
    const text = fromCommit(sha);
    return text === undefined ? { why: `${c.repo} 的 ${ref} 沒有 ${c.path}`, forge } : { text, forge };
  }
  const r = g.repos.find(x => x.path === c.repo && g.hasGitDir(x.path));
  if (!r) return { why: `${c.repo} 不是 Git 儲存庫` };
  const url = r.config.get('remote.origin.url'), forge = url ? g.forge.find(x => bare(x.url) === bare(url)) : undefined;
  if (c.ref === undefined) {
    const n = g.nodes.get(`${c.repo === '/' ? '' : c.repo}/${c.path}`);
    return n?.kind === 'file' ? { text: n.content ?? '', forge } : { why: `${c.repo} 沒有 ${c.path}`, forge };
  }
  const text = fromCommit(g.commitOf(r, c.ref));
  return text === undefined ? { why: `${c.repo} 的 ${c.ref} 沒有 ${c.path}`, forge } : { text, forge };
}

/** The events (of SCENARIO_EVENTS) that start the workflow for a push to / pull request into ref changing these files. */
export function scenarioEvents(w: Workflow, ref: string, paths: readonly string[] | undefined, defaultBranch: string): string[] {
  const full = ref.startsWith('refs/') ? ref : `refs/heads/${ref}`, branch = full.startsWith('refs/heads/') ? full.slice(11) : undefined;
  return SCENARIO_EVENTS.filter(name => {
    if (name === 'push') return triggers(w.on, { name, ref: full, ...paths ? { changed: paths } : {} });
    if (name === 'pull_request' || name === 'pull_request_target') return branch !== undefined && triggers(w.on, { name, base: branch, ...paths ? { changed: paths } : {} });
    if (name === 'workflow_dispatch') return triggers(w.on, { name, ref: full });
    return triggers(w.on, { name, ref: full, defaultBranch });
  });
}

export function describeWorkflowCheck(c: WorkflowCheck): string {
  const where = `${c.repo} 的 ${c.path}${c.ref ? `（${c.ref}）` : ' '}`;
  if (c.valid === false || c.error !== undefined) return `${where}應該是無效的 workflow${c.error ? `（GitHub 的訊息符合 /${c.error}/）` : ''}`;
  const on = c.on === undefined ? '' : Array.isArray(c.on) ? `觸發事件是 ${c.on.join('、')}` : `推送或開 Pull Request 到 ${c.on.ref}${c.on.paths ? `（改了 ${c.on.paths.join('、')}）` : ''}時觸發 ${c.on.events.join('、') || '（沒有事件）'}`;
  const perms = c.permissions ? Object.entries(c.permissions).map(([k, v]) => `${k}: ${v}`) : [];
  const job = c.job === undefined ? '' : c.permissions ? `job ${c.job} 的 GITHUB_TOKEN 權限只有 ${perms.join('、') || '（全部 none）'}` : `有 job ${c.job}`;
  const parts = [on, job].filter(Boolean);
  return `${where}應該是有效的 workflow${parts.length ? `（${parts.join('，')}）` : ''}`;
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');
/** Why a check fails on the machine after the commands (null: it holds). */
export function workflowFailure(c: WorkflowCheck, end: FsState): string | null {
  const g = new Git(end, silent), s = source(g, c);
  if (s.text === undefined) return s.why!;
  const p = parseWorkflow(c.path, s.text);
  if (!p.ok) {
    const lines = workflowErrorLines(c.path, p.errors, p.yaml);
    if (c.error !== undefined) return new RegExp(c.error).test(lines.join('\n')) ? null : `GitHub 的訊息是「${lines.slice(1).join(' ')}」`;
    return c.valid === false ? null : `${c.path} 不是有效的 workflow：${lines[1]}`;
  }
  if (c.valid === false || c.error !== undefined) return `${c.path} 是有效的 workflow`;
  const w = p.workflow;
  if (Array.isArray(c.on) && !sameSet(c.on, w.on.events)) return `${c.path} 的觸發事件是 ${w.on.events.join('、')}`;
  if (c.on !== undefined && !Array.isArray(c.on)) {
    const got = scenarioEvents(w, c.on.ref, c.on.paths, s.forge ? s.forge.head.replace(/^refs\/heads\//, '') : 'main');
    if (!sameSet(c.on.events, got)) return `推送或開 Pull Request 到 ${c.on.ref}${c.on.paths ? `（改了 ${c.on.paths.join('、')}）` : ''}時觸發的是 ${got.join('、') || '（沒有事件）'}`;
  }
  if (c.job !== undefined) {
    const job = w.jobs.find(j => j.id === c.job);
    if (!job) return `${c.path} 沒有 job ${c.job}`;
    if (c.permissions) {
      const got = grantedScopes(effectivePermissions(w.permissions, job.permissions, s.forge?.site?.workflowPermissions ?? 'read'));
      const want = SCOPES.filter(k => c.permissions![k] !== undefined).map(k => `${k}: ${c.permissions![k]}`);
      if (!sameSet(got, want)) return `job ${c.job} 的 GITHUB_TOKEN 權限是 ${got.join('、') || '（全部 none）'}`;
    }
  }
  return null;
}

/** The problems of a check's data (it needs a workflows machine). */
export function workflowCheckProblems(c: WorkflowCheck, workflows: boolean): string | null {
  if (!workflows || typeof c.repo !== 'string' || !(normalized(c.repo) || FORGE_URL.test(c.repo))) return 'a workflow check needs a workflows machine (engine stage E27) and a repo (an absolute path or https://github.example/<owner>/<repo>.git)';
  if (typeof c.path !== 'string' || !isWorkflowPath(c.path)) return 'a workflow check needs a path like .github/workflows/ci.yml';
  if (c.ref !== undefined && (typeof c.ref !== 'string' || !validRefName(c.ref.replace(/^refs\/(heads|tags)\//, '')))) return 'a workflow check needs a valid ref';
  if (c.valid !== undefined && typeof c.valid !== 'boolean') return 'a workflow check\'s valid must be true or false';
  if (c.error !== undefined) { try { new RegExp(c.error); } catch { return 'a workflow check\'s error must be a regular expression'; } }
  const invalid = c.valid === false || c.error !== undefined;
  if (c.error !== undefined && c.valid === true) return 'a workflow check with error expects an invalid workflow (not valid: true)';
  if (invalid && (c.on !== undefined || c.job !== undefined || c.permissions !== undefined)) return 'a workflow check\'s on, job and permissions need a valid workflow';
  if (Array.isArray(c.on) && c.on.some(e => !(EVENTS as readonly string[]).includes(e))) return 'a workflow check\'s on lists GitHub event names';
  if (c.on !== undefined && !Array.isArray(c.on)) {
    const o = c.on;
    if (typeof o.ref !== 'string' || !validRefName(o.ref.replace(/^refs\/(heads|tags)\//, '')) || (o.paths !== undefined && (!Array.isArray(o.paths) || o.paths.some(x => typeof x !== 'string' || !x || x.startsWith('/'))))
      || !Array.isArray(o.events) || o.events.some(e => !(SCENARIO_EVENTS as readonly string[]).includes(e)))
      return `a workflow check's on scenario needs a ref, relative paths and events among ${SCENARIO_EVENTS.join(', ')}`;
  }
  if (c.job !== undefined && (typeof c.job !== 'string' || !c.job)) return 'a workflow check\'s job must be a job id';
  if (c.permissions !== undefined && (c.job === undefined || typeof c.permissions !== 'object' || Object.entries(c.permissions).some(([k, v]) => !(SCOPES as readonly string[]).includes(k) || (v !== 'read' && v !== 'write'))))
    return 'a workflow check\'s permissions need a job and map scopes to read or write';
  return null;
}
