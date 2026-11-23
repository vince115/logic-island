import { resolvePath, type FsState } from './fs';
import { clockOf } from './processes';
import { FORGE_URL } from './git-state';
import { Git, validRefName } from './git-core';
import { forgeOf } from './actions-checks';
import { actionsTick } from './actions-events';
import { MAX_REVIEWERS, MAX_WAIT_TIMER } from './environments-model';
import { DEPLOY_STATES, deploymentsOf, stateOf, type DeployState, type Deployment } from './environments-json';
import { PATTERN } from './environments-lesson';
import { ENV_NAME } from './gh-environments-put';

/*
 * Engine stage E30 (docs/curriculum/CICD0_E30_ENVIRONMENTS.md §7): the checks environment — a forge repository has the
 * environment with these protection rules (reviewers as a set, the wait timer, the branch policy) — and deployment — the
 * latest (or some) deployment to an environment is of a branch, of the branch's current commit or of a labelled commit,
 * with a state at the machine's final time ("the latest deployment to production is main's tip, and it succeeded").
 */

export type EnvironmentsCheck =
  | { kind: 'environment'; repo: string; name: string; reviewers?: string[]; waitTimer?: number; branches?: 'all' | 'protected' | string[] }
  | { kind: 'deployment'; repo: string; environment: string; ref?: string; tip?: boolean; commit?: string; status?: DeployState; latest?: boolean };

const silent = { out: () => {}, err: () => {}, user: 'root' };
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const normalized = (p: string) => p.startsWith('/') && resolvePath({ cwd: '/', home: '/' }, p) === p;
const branchesText = (b: 'all' | 'protected' | readonly string[]) => (b === 'all' ? '任何分支都可以部署' : b === 'protected' ? '只有受保護的分支可以部署' : `只有符合 ${b.join('、')} 的分支可以部署`);
const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every(x => b.includes(x));

export function describeEnvironmentsCheck(c: EnvironmentsCheck): string {
  if (c.kind === 'environment') {
    const parts = [c.reviewers ? (c.reviewers.length ? `必要的審核者是 ${c.reviewers.join('、')}` : '沒有必要的審核者') : '', c.waitTimer !== undefined ? `等待 ${c.waitTimer} 分鐘` : '',
      c.branches ? branchesText(c.branches) : ''].filter(Boolean);
    return `${c.repo} 應該有 environment ${c.name}${parts.length ? `（${parts.join('；')}）` : ''}`;
  }
  const what = [c.tip ? `是 ${c.ref ?? '預設分支'} 目前的 commit` : c.ref ? `來自 ${c.ref}` : '', c.commit ? `是 commit ${c.commit}` : '', c.status ? `狀態是 ${c.status}` : ''].filter(Boolean);
  return `${c.repo} ${c.latest ? '最新的' : '有一個'} ${c.environment} 部署${what.length ? `應該${what.join('、')}` : '應該存在'}`;
}

/** Why the check fails after the commands (null: it holds). */
export function environmentsFailure(c: EnvironmentsCheck, end0: FsState): string | null {
  const end = actionsTick(end0), now = clockOf(end).now, g = new Git(end, silent), f = forgeOf(g, c.repo);
  if (typeof f === 'string') return f;
  if (c.kind === 'environment') {
    const e = f.site?.envRules?.find(x => x.name.toLowerCase() === c.name.toLowerCase());
    if (!e) return '沒有這個 environment';
    if (c.reviewers && !sameSet(c.reviewers, e.reviewers)) return e.reviewers.length ? `必要的審核者是 ${e.reviewers.join('、')}` : '沒有必要的審核者';
    if (c.waitTimer !== undefined && c.waitTimer !== e.waitTimer) return `等待時間是 ${e.waitTimer} 分鐘`;
    const now2 = !e.policy ? 'all' : e.policy.protectedBranches ? 'protected' : e.policy.patterns.map(p => p.name);
    if (c.branches && !(typeof c.branches === 'string' ? c.branches === now2 : Array.isArray(now2) && sameSet(c.branches, now2))) return `部署分支的規則是：${branchesText(now2)}`;
    return null;
  }
  const all = deploymentsOf(f, now), list = all.filter(d => d.env.toLowerCase() === c.environment.toLowerCase());
  if (!list.length) return `沒有部署到 ${c.environment} 的紀錄`;
  const tipRef = c.ref ?? f.head.replace(/^refs\/heads\//, ''), tip = f.refs.get(`refs/heads/${tipRef}`), label = c.commit ? end.git?.labels?.get(c.commit) : undefined;
  const why = (d: Deployment): string | null => {
    const name = `部署 ${d.id}（${d.ref} 的 ${d.sha.slice(0, 7)}）`, st = stateOf(d, all, now);
    if (c.tip && d.sha !== tip) return `${name}不是 ${tipRef} 目前的 commit`;
    if (!c.tip && c.ref && d.ref !== c.ref) return `${name}不是來自 ${c.ref}`;
    if (c.commit && d.sha !== label) return `${name}不是 commit ${c.commit}`;
    if (c.status && st !== c.status) return ['waiting', 'queued', 'in_progress'].includes(st) && !['waiting', 'in_progress'].includes(c.status)
      ? `${name}還沒有結束（${st}），先用 gh run watch ${d.run.id} 等它完成` : `${name}的狀態是 ${st}`;
    return null;
  };
  if (c.latest) { const w = why(list[0]); return w ? `最新的${w}` : null; }
  return list.some(d => why(d) === null) ? null : `沒有符合的部署（最新的${why(list[0]) ?? `部署 ${list[0].id}`}）`;
}

/** The problems of the check's data (it needs an environments machine). */
export function environmentsCheckProblems(c: EnvironmentsCheck, environments: boolean): string | null {
  if (!environments || typeof c.repo !== 'string' || !(normalized(c.repo) || FORGE_URL.test(c.repo)))
    return `${c.kind === 'environment' ? 'an' : 'a'} ${c.kind} check needs an environments machine (engine stage E30) and a repo (an absolute path or https://github.example/<owner>/<repo>.git)`;
  if (c.kind === 'environment') {
    if (typeof c.name !== 'string' || !ENV_NAME.test(c.name)) return 'an environment check needs a name ([A-Za-z0-9_.-], at most 64)';
    if (c.reviewers !== undefined && !(Array.isArray(c.reviewers) && c.reviewers.length <= MAX_REVIEWERS && c.reviewers.every(l => typeof l === 'string' && LOGIN.test(l))))
      return `an environment check's reviewers are at most ${MAX_REVIEWERS} logins`;
    if (c.waitTimer !== undefined && !(Number.isInteger(c.waitTimer) && c.waitTimer >= 0 && c.waitTimer <= MAX_WAIT_TIMER)) return `an environment check's waitTimer is 0..${MAX_WAIT_TIMER} minutes`;
    const b = c.branches;
    if (b !== undefined && b !== 'all' && b !== 'protected' && !(Array.isArray(b) && b.length >= 1 && b.every(p => typeof p === 'string' && PATTERN.test(p))))
      return "an environment check's branches is 'all', 'protected' or branch name patterns";
    return null;
  }
  if (typeof c.environment !== 'string' || !ENV_NAME.test(c.environment)) return 'a deployment check needs an environment name';
  if (c.ref !== undefined && (typeof c.ref !== 'string' || !validRefName(c.ref))) return 'a deployment check\'s ref is a branch name';
  for (const k of ['tip', 'latest'] as const) if (c[k] !== undefined && typeof c[k] !== 'boolean') return `a deployment check's ${k} must be true or false`;
  if (c.commit !== undefined && (typeof c.commit !== 'string' || !c.commit || c.tip)) return 'a deployment check\'s commit is a commit label of the git data (not with tip)';
  if (c.status !== undefined && !DEPLOY_STATES.includes(c.status)) return `a deployment check's status is one of ${DEPLOY_STATES.join(', ')}`;
  return null;
}
