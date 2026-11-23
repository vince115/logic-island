import { resolvePath, type FsState } from './fs';
import { FORGE_URL } from './git-state';
import { Git, validRefName, type Forge } from './git-core';
import { approvalsOf, checksOf, decisions, type Conclusion, type MergeMethod } from './forge-state';
import { headOf } from './forge';

/*
 * Engine stage E26 (docs/curriculum/CICD0_E26_FORGE.md §4): the checks pull-request and protection, read from the forge
 * after the learner's commands. repo is a forge URL or a local repository whose origin is on github.example. Approvals are
 * counted at the machine's time (persona reviews come with the clock), stale approvals dismissed as GitHub does.
 */

export type ForgeCheck =
  | {
    kind: 'pull-request'; repo: string; head?: string; base?: string; number?: number;
    state?: 'open' | 'closed' | 'merged'; method?: MergeMethod;
    /** At least this many approvals (the latest review of each reviewer). */
    approvals?: number;
    /** The combined result of the head's checks. */
    checks?: Conclusion;
  }
  | { kind: 'protection'; repo: string; branch: string; approvals?: number; checks?: string[]; linear?: boolean; forcePush?: boolean; absent?: true };
export const FORGE_CHECK_KINDS = ['pull-request', 'protection'] as const;

const silent = { out: () => {}, err: () => {}, user: 'root' };
const normalized = (p: string) => p.startsWith('/') && resolvePath({ cwd: '/', home: '/' }, p) === p;
const STATE_TEXT = { OPEN: '開著的（open）', CLOSED: '已關閉（closed）', MERGED: '已合併（merged）' } as const;

function locate(g: Git, repo: string): Forge | string {
  const bare = (u: string) => u.replace(/\/+$/, '').replace(/\.git$/, '');
  if (FORGE_URL.test(repo)) return g.forge.find(x => x.url === repo) ?? `github.example 上沒有 ${repo}`;
  const r = g.repos.find(x => x.path === repo && g.hasGitDir(x.path));
  if (!r) return `${repo} 不是 Git 儲存庫`;
  const url = r.config.get('remote.origin.url');
  return (url && g.forge.find(x => bare(x.url) === bare(url))) || `${repo} 沒有指向 github.example 的 origin`;
}

export function describeForgeCheck(c: ForgeCheck): string {
  const where = FORGE_URL.test(c.repo) ? c.repo : `${c.repo} 的 origin（github.example）`;
  if (c.kind === 'protection') {
    if (c.absent) return `${where} 的 ${c.branch} 應該沒有分支保護`;
    const parts = [c.approvals !== undefined ? `要求 ${c.approvals} 個核准` : '', c.checks?.length ? `要求檢查 ${c.checks.join('、')}` : '',
      c.linear === true ? '要求線性歷史' : c.linear === false ? '不要求線性歷史' : '', c.forcePush === true ? '允許強制推送' : c.forcePush === false ? '不允許強制推送' : ''].filter(Boolean);
    return `${where} 的 ${c.branch} 應該有分支保護${parts.length ? `（${parts.join('，')}）` : ''}`;
  }
  const which = c.number !== undefined ? `Pull Request #${c.number}` : `從 ${c.head} 到 ${c.base ?? '預設分支'} 的 Pull Request`;
  const parts = [c.state ? `狀態是 ${c.state}` : '', c.method ? `以 ${c.method} 合併` : '', c.approvals !== undefined ? `至少 ${c.approvals} 個核准` : '', c.checks ? `檢查結果是 ${c.checks}` : ''].filter(Boolean);
  return `${where} 應該有${which}${parts.length ? `（${parts.join('，')}）` : ''}`;
}

/** Why a check fails on the machine after the commands (null: it holds). */
export function forgeFailure(c: ForgeCheck, end: FsState): string | null {
  const g = new Git(end, silent), f = locate(g, c.repo);
  if (typeof f === 'string') return f;
  const site = f.site;
  if (!site) return 'github.example 沒有這個儲存庫的設定（需要 forge profile）';
  if (c.kind === 'protection') {
    const p = site.protection.get(c.branch);
    if (c.absent) return p ? `${c.branch} 還有分支保護` : null;
    if (!p) return `${c.branch} 沒有分支保護`;
    if (c.approvals !== undefined && p.reviews?.approvals !== c.approvals) return p.reviews ? `${c.branch} 的保護要求 ${p.reviews.approvals} 個核准` : `${c.branch} 的保護不要求 Pull Request 審查`;
    const missing = (c.checks ?? []).filter(x => !p.checks?.contexts.includes(x));
    if (missing.length) return `${c.branch} 的保護沒有要求檢查 ${missing.join('、')}`;
    if (c.linear !== undefined && p.linear !== c.linear) return `${c.branch} 的保護${p.linear ? '要求' : '沒有要求'}線性歷史`;
    if (c.forcePush !== undefined && p.forcePush !== c.forcePush) return `${c.branch} ${p.forcePush ? '允許' : '不允許'}強制推送`;
    return null;
  }
  const base = c.base ?? f.head.replace(/^refs\/heads\//, '');
  const pr = site.pulls.filter(p => c.number !== undefined ? p.number === c.number : p.head === c.head && p.base === base).sort((a, b) => b.number - a.number)[0];
  if (!pr) return c.number !== undefined ? `沒有 Pull Request #${c.number}` : `沒有從 ${c.head} 到 ${base} 的 Pull Request`;
  const name = `PR #${pr.number}`;
  if (c.number !== undefined && ((c.head !== undefined && pr.head !== c.head) || (c.base !== undefined && pr.base !== c.base))) return `${name} 是從 ${pr.head} 到 ${pr.base}`;
  if (c.state !== undefined && pr.state !== c.state.toUpperCase()) return `${name} 是${STATE_TEXT[pr.state]}`;
  if (c.method !== undefined && pr.merged?.method !== c.method) return pr.merged ? `${name} 是以 ${pr.merged.method} 合併的` : `${name} 還沒有合併`;
  if (c.approvals !== undefined) { const n = approvalsOf(decisions(site, g.store, pr, g.now)); if (n < c.approvals) return `${name} 只有 ${n} 個核准`; }
  if (c.checks !== undefined) {
    const results = checksOf(site, g.store, headOf(pr)), got = !results.length ? undefined : results.some(x => x.conclusion === 'failure') ? 'failure' : results.some(x => x.conclusion === 'pending') ? 'pending' : 'success';
    if (got !== c.checks) return got ? `${name} 的檢查結果是 ${got}` : `${name} 沒有檢查結果`;
  }
  return null;
}

/** The problems of a check's data (it needs a forge machine). */
export function forgeCheckProblems(c: ForgeCheck, forge: boolean): string | null {
  if (!forge || typeof c.repo !== 'string' || !(normalized(c.repo) || FORGE_URL.test(c.repo))) return `a ${c.kind} check needs a forge machine (engine stage E26) and a repo (an absolute path or https://github.example/<owner>/<repo>.git)`;
  const count = (n: unknown) => n === undefined || (Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 6);
  if (c.kind === 'protection') {
    if (!validRefName(c.branch ?? '')) return 'a protection check needs a valid branch';
    if (c.absent && Object.keys(c).some(k => !['kind', 'repo', 'branch', 'absent'].includes(k))) return 'an absent protection check takes only repo and branch';
    if (!count(c.approvals) || (c.checks !== undefined && (!Array.isArray(c.checks) || c.checks.some(x => typeof x !== 'string' || !x)))) return 'a protection check\'s approvals must be 0..6 and checks context names';
    if ((c.linear !== undefined && typeof c.linear !== 'boolean') || (c.forcePush !== undefined && typeof c.forcePush !== 'boolean')) return 'a protection check\'s linear and forcePush must be true or false';
    return null;
  }
  if (c.number === undefined && c.head === undefined) return 'a pull-request check needs a head branch or a number';
  if (c.number !== undefined && (!Number.isInteger(c.number) || c.number < 1)) return 'a pull-request check\'s number must be at least 1';
  if ((c.head !== undefined && !validRefName(c.head)) || (c.base !== undefined && !validRefName(c.base))) return 'a pull-request check needs valid branch names';
  if ((c.state !== undefined && !['open', 'closed', 'merged'].includes(c.state)) || (c.method !== undefined && !['merge', 'squash', 'rebase'].includes(c.method))) return 'a pull-request check\'s state is open, closed or merged and its method merge, squash or rebase';
  if (!count(c.approvals) || (c.checks !== undefined && !['success', 'failure', 'pending'].includes(c.checks))) return 'a pull-request check\'s approvals must be 0..6 and checks success, failure or pending';
  return null;
}
