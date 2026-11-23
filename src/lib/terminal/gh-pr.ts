import { mergeBases, stripspace, subjectOf, walk } from './git';
import { plural, type Forge } from './git-core';
import { fileChanges, patchLines, statusOf } from './git-format';
import { checksOf, decisions, reviewsOf, type ForgePull, type ReviewState } from './forge-state';
import { defaultBranch, headOf, pullStats, pullUrl, repoPath } from './forge';
import { baseRepo, flag, fuzzyAgo, on, parseFlags, type Flags, type Gh } from './gh';
import { checkoutPr, checksPr, closePr, reviewPr } from './gh-pr-act';
import { mergePr } from './gh-merge';

/*
 * Engine stage E26 (docs/curriculum/CICD0_E26_FORGE.md): gh pr — finding the pull request an argument or the current
 * branch names, and gh pr create, list, view and diff in gh's terminal format (no colour). checkout, review, checks and
 * close are in gh-pr-act.ts, merge in gh-merge.ts.
 */

export const STATE_WORD = { OPEN: 'Open', CLOSED: 'Closed', MERGED: 'Merged' } as const;
const REVIEW_WORD: Record<ReviewState, string> = { APPROVED: 'Approved', CHANGES_REQUESTED: 'Changes requested', COMMENTED: 'Commented', DISMISSED: 'Commented' };
/** Columns separated by two spaces, every one but the last padded (gh's table printer on a terminal). */
export const table = (rows: readonly string[][]) => {
  const widths = rows[0].map((_, k) => Math.max(...rows.map(r => [...r[k]].length)));
  return rows.map(r => r.map((c, k) => k === r.length - 1 ? c : c.padEnd(widths[k] + c.length - [...c].length)).join('  ').replace(/\s+$/, ''));
};

/** The pull request an argument (number, #number, URL or branch) or the current branch names, with gh's errors. */
export function findPull(h: Gh, f: Flags): { forge: Forge; pr: ForgePull } | undefined {
  const { g } = h, base = baseRepo(g, flag(f, 'repo'));
  if (!base) return undefined;
  const pulls = base.forge.site!.pulls, arg = f.rest[0];
  const n = arg === undefined ? undefined : /^#?(\d+)$/.exec(arg)?.[1] ?? /\/pull\/(\d+)\/?$/.exec(arg)?.[1];
  if (n !== undefined) {
    const pr = pulls.find(p => p.number === Number(n));
    if (!pr) { g.err(`GraphQL: Could not resolve to a PullRequest with the number of ${Number(n)}. (repository.pullRequest)`); return undefined; }
    return { forge: base.forge, pr };
  }
  const branch = arg ?? (base.repo ? g.branch(base.repo) : undefined);
  if (branch === undefined) { g.err('could not determine current branch: failed to run git: not on any branch'); return undefined; }
  const mine = pulls.filter(p => p.head === branch).sort((a, b) => (a.state === 'OPEN' ? 0 : 1) - (b.state === 'OPEN' ? 0 : 1) || b.number - a.number);
  if (!mine.length) { g.err(`no pull requests found for branch "${branch}"`); return undefined; }
  return { forge: base.forge, pr: mine[0] };
}

/** ✓ Checks passing, × 1/2 checks failing, - Checks pending, No checks (gh pr view's summary). */
export function checksSummary(results: readonly { conclusion: string }[]): string {
  const failing = results.filter(c => c.conclusion === 'failure').length, pending = results.filter(c => c.conclusion === 'pending').length;
  if (!results.length) return 'No checks';
  if (failing) return failing === results.length ? '× All checks failing' : `× ${failing}/${results.length} checks failing`;
  return pending ? '- Checks pending' : '✓ Checks passing';
}

function createPr(h: Gh, args: string[]): number {
  const { g, account } = h;
  const f = parseFlags(g, 'pr create', args, ['B|base=', 'H|head=', 't|title=', 'b|body=', 'f|fill', 'd|draft', 'R|repo=', 'w|web', 'r|reviewer=', 'a|assignee=', 'l|label=']);
  if (!f) return 1;
  if (on(f, 'web')) { g.err('gh pr create --web：模擬環境沒有瀏覽器'); return 1; }
  if (on(f, 'draft') || on(f, 'reviewer') || on(f, 'assignee') || on(f, 'label')) { g.err('gh pr create：模擬環境不支援 --draft、--reviewer、--assignee、--label（審查者由課程設定）'); return 1; }
  if (!on(f, 'fill') && (!on(f, 'title') || !on(f, 'body'))) { g.err('must provide `--title` and `--body` (or `--fill` or `fill-first` or `--fillverbose`) when not running interactively'); return 1; }
  const base = baseRepo(g, flag(f, 'repo'));
  if (!base) return 1;
  const forge = base.forge, site = forge.site!, local = base.repo;
  const head = flag(f, 'head')?.replace(/^[^:]+:/, '') ?? (local ? g.branch(local) : undefined), into = flag(f, 'base') ?? defaultBranch(forge);
  if (head === undefined) { g.err('could not determine the current branch: failed to run git: not on any branch'); return 1; }
  const headTip = forge.refs.get(`refs/heads/${head}`), baseTip = forge.refs.get(`refs/heads/${into}`);
  if (!headTip) { g.err('aborted: you must first push the current branch to a remote, or use the --head flag'); return 1; }
  const open = site.pulls.find(p => p.state === 'OPEN' && p.head === head && p.base === into);
  if (open) { g.err(`a pull request for branch "${head}" into branch "${into}" already exists:`, pullUrl(forge, open.number)); return 1; }
  if (!baseTip) { g.err(`pull request create failed: GraphQL: Base ref must be a branch (createPullRequest)`); return 1; }
  const commits = walk(g.store, [headTip], [baseTip]);
  if (!commits.length) { g.err(`pull request create failed: GraphQL: No commits between ${into} and ${head} (createPullRequest)`); return 1; }
  let title = '', body = '';
  if (on(f, 'fill')) {
    if (commits.length === 1) { const m = g.commit(commits[0]).message, k = m.indexOf('\n\n'); title = subjectOf(m); body = k < 0 ? '' : stripspace(m.slice(k + 2)).replace(/\n$/, ''); }
    else { title = head.replace(/[-_]/g, ' '); body = [...commits].reverse().map(c => `- ${subjectOf(g.commit(c).message)}`).join('\n'); }
  }
  title = flag(f, 'title') ?? title; body = flag(f, 'body') ?? body;
  if (!title.trim()) { g.err('pull request create failed: GraphQL: Title can\'t be blank (createPullRequest)'); return 1; }
  if (local) {
    const s = statusOf(g, local), n = new Set([...s.staged, ...s.unstaged, ...s.unmerged].map(x => x.path).concat(s.untracked)).size;
    if (n) g.err(`Warning: ${plural(n, 'uncommitted change')}`);
  }
  g.err('', `Creating pull request for ${head} into ${into} in ${repoPath(forge)}`, '');
  const pr: ForgePull = { number: site.next, title, body, author: account.login, head, base: into, state: 'OPEN', created: g.now, heads: [{ sha: headTip, at: g.now }], reviews: [] };
  forge.site = { ...site, pulls: [...site.pulls, pr], next: site.next + 1 };
  g.out(pullUrl(forge, pr.number));
  return 0;
}

function listPr(h: Gh, args: string[]): number {
  const { g } = h;
  const f = parseFlags(g, 'pr list', args, ['s|state=', 'L|limit=', 'B|base=', 'H|head=', 'A|author=', 'R|repo=', 'w|web']);
  if (!f) return 1;
  const state = flag(f, 'state') ?? 'open', limit = Number(flag(f, 'limit') ?? 30);
  if (!['open', 'closed', 'merged', 'all'].includes(state)) { g.err(`invalid argument "${state}" for "-s, --state" flag: valid values are {open|closed|merged|all}`, '', 'Usage:  gh pr list [flags]'); return 1; }
  if (!Number.isInteger(limit) || limit < 1) { g.err(`invalid value for --limit: ${flag(f, 'limit')}`); return 1; }
  const base = baseRepo(g, flag(f, 'repo'));
  if (!base) return 1;
  const all = base.forge.site!.pulls.filter(p => (state === 'all' || p.state === state.toUpperCase()) && (flag(f, 'base') === undefined || p.base === flag(f, 'base'))
    && (flag(f, 'head') === undefined || p.head === flag(f, 'head')) && (flag(f, 'author') === undefined || p.author === flag(f, 'author'))).sort((a, b) => b.number - a.number);
  const name = repoPath(base.forge), filtered = state !== 'open' || ['base', 'head', 'author'].some(k => on(f, k));
  if (!all.length) { g.err(filtered ? `no pull requests match your search in ${name}` : `no open pull requests in ${name}`); return 0; }
  const shown = all.slice(0, limit);
  g.out('', filtered ? `Showing ${shown.length} of ${plural(all.length, 'pull request')} in ${name} that match your search` : `Showing ${shown.length} of ${plural(all.length, 'open pull request')} in ${name}`, '');
  g.out(...table([['ID', 'TITLE', 'BRANCH', 'CREATED AT'], ...shown.map(p => [`#${p.number}`, p.title, p.head, fuzzyAgo(g.now, p.created)])]));
  return 0;
}

function viewPr(h: Gh, args: string[]): number {
  const { g } = h;
  const f = parseFlags(g, 'pr view [<number> | <url> | <branch>]', args, ['c|comments', 'R|repo=', 'w|web']);
  if (!f) return 1;
  if (on(f, 'web')) { g.err('gh pr view --web：模擬環境沒有瀏覽器'); return 1; }
  const found = findPull(h, f);
  if (!found) return 1;
  const { forge, pr } = found, site = forge.site!, stats = pullStats(g, forge, pr);
  g.out(`${pr.title} ${repoPath(forge)}#${pr.number}`, `${STATE_WORD[pr.state]} • ${pr.author} wants to merge ${plural(stats.commits, 'commit')} into ${pr.base} from ${pr.head} • ${fuzzyAgo(g.now, pr.created)}`,
    `+${stats.additions} -${stats.deletions} • ${checksSummary(checksOf(site, g.store, headOf(pr)))}`);
  const reviewers = decisions(site, g.store, pr, g.now);
  if (reviewers.length) g.out(`Reviewers: ${reviewers.map(r => `${r.by} (${REVIEW_WORD[r.state]})`).join(', ')}`);
  g.out('', ...pr.body.trim() ? pr.body.replace(/\n$/, '').split('\n').map(l => l ? `  ${l}` : '') : ['  No description provided'], '');
  if (on(f, 'comments')) {
    const verb = { APPROVED: 'approved', CHANGES_REQUESTED: 'requested changes', COMMENTED: 'commented' } as const;
    for (const r of reviewsOf(site, g.store, pr, g.now)) g.out(`${r.by} ${verb[r.state]} • ${fuzzyAgo(g.now, r.at)}`, ...r.body ? r.body.split('\n').map(l => l ? `  ${l}` : '') : [], '');
  }
  g.out(`View this pull request on GitHub: ${pullUrl(forge, pr.number)}`);
  return 0;
}

function diffPr(h: Gh, args: string[]): number {
  const { g } = h;
  const f = parseFlags(g, 'pr diff [<number> | <url> | <branch>]', args, ['R|repo=', 'color=', 'name-only', 'patch', 'w|web']);
  if (!f) return 1;
  const found = findPull(h, f);
  if (!found) return 1;
  const { forge, pr } = found, head = headOf(pr), baseTip = forge.refs.get(`refs/heads/${pr.base}`);
  // The three-dot diff: from the merge base (the one recorded when it was merged) to the head.
  const from = pr.merged ? pr.merged.from : baseTip ? mergeBases(g.store, baseTip, head)[0] : undefined;
  const changes = fileChanges(g.files(from), g.files(head));
  g.out(...on(f, 'name-only') ? changes.map(c => c.path) : patchLines(g, changes));
  return 0;
}

/** gh pr 子指令 … */
export function prCommand(h: Gh, args: string[]): number {
  const [sub, ...rest] = args, { g } = h;
  switch (sub) {
    case 'create': return createPr(h, rest);
    case 'list': case 'ls': return listPr(h, rest);
    case 'view': return viewPr(h, rest);
    case 'diff': return diffPr(h, rest);
    case 'checkout': case 'co': return checkoutPr(h, rest);
    case 'review': return reviewPr(h, rest);
    case 'merge': return mergePr(h, rest);
    case 'checks': return checksPr(h, rest);
    case 'close': return closePr(h, rest);
    case undefined: g.err('gh pr：要加子指令（create、list、view、diff、checkout、review、merge、checks、close）'); return 1;
    case 'status': case 'edit': case 'comment': case 'ready': case 'reopen': case 'lock': case 'unlock': case 'update-branch':
      g.err(`gh pr ${sub}：模擬環境不支援這個指令（支援 create、list、view、diff、checkout、review、merge、checks、close）`); return 1;
    default: g.err(`unknown command "${sub}" for "gh pr"`, '', 'Usage:  gh pr <command> [flags]'); return 1;
  }
}
