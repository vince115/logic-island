import { baseRepo, flag, on, parseFlags, type Flags, type Gh } from './gh';
import { table } from './gh-pr';
import { repoPath, webUrl } from './forge';
import type { Forge } from './git-core';
import { workflowId } from './workflow';
import { cancelRun, rerunRun } from './actions-events';
import { matchesWorkflow } from './actions-checks';
import { completedAt, lastAttempt, runConclusion, runStatus, symbol, type JobResult, type WorkflowRun } from './actions-model';
import { JSON_FIELDS, jsonOf, listRow, logLines, viewLines } from './gh-run-view';
import { downloadCommand } from './gh-artifacts';
import { settleEnv } from './environments-run';
import { envReg } from './gh-environments';

/*
 * Engine stage E28 (docs/curriculum/CICD0_E28_ACTIONS.md §5): gh run list, view, watch, rerun and cancel against the runs
 * of the simulated github.example. What they show follows the machine's clock; gh run watch moves the clock to the end of
 * the run and prints only its final screen (as Compose's plain output does) instead of refreshing it.
 */

const api = (forge: Forge, path: string) => `https://github.example/api/v3/repos/${repoPath(forge)}/${path}`;
const runsOf = (forge: Forge) => [...forge.site?.runs ?? []].sort((a, b) => b.createdAt - a.createdAt || b.id - a.id);

/** The run an argument names (or the run of --job), with gh's errors. */
function findRun(h: Gh, f: Flags, what = 'run or job ID'): { forge: Forge; run: WorkflowRun; job?: JobResult } | undefined {
  const { g } = h, repo = baseRepo(g, flag(f, 'repo'));
  if (!repo) return undefined;
  const runs = runsOf(repo.forge).filter(r => r.createdAt <= g.now), jobId = flag(f, 'job');
  if (jobId !== undefined) {
    for (const r of runs) { const j = lastAttempt(r).jobs.find(x => String(x.id) === jobId); if (j) return { forge: repo.forge, run: r, job: j }; }
    g.err(`failed to get job: HTTP 404: Not Found (${api(repo.forge, `actions/jobs/${jobId}`)})`);
    return undefined;
  }
  const id = f.rest[0];
  if (id === undefined) { g.err(`${what} required when not running interactively`); return undefined; }
  const run = runs.find(r => String(r.id) === id);
  if (!run) { g.err(`failed to get run: HTTP 404: Not Found (${api(repo.forge, `actions/runs/${id}`)})`); return undefined; }
  return { forge: repo.forge, run };
}

function listCommand(h: Gh, args: string[]): number {
  // gh asks for the fields when --json has none.
  args = args.map((a, i) => (a === '--json' && (args[i + 1] === undefined || args[i + 1].startsWith('-')) ? '--json=' : a));
  const { g } = h, f = parseFlags(g, 'run list', args, ['w|workflow=', 'b|branch=', 'e|event=', 'L|limit=', 'u|user=', 's|status=', 'c|commit=', 'json=', 'q|jq=', 't|template=', 'a|all', 'R|repo=']);
  if (!f) return 1;
  if (on(f, 'jq') || on(f, 'template')) { g.err('gh run list --jq／--template：模擬環境不支援，請用 --json 欄位'); return 1; }
  const limit = flag(f, 'limit') === undefined ? 20 : Number(flag(f, 'limit'));
  if (!Number.isInteger(limit) || limit < 1) { g.err(`invalid limit: ${flag(f, 'limit')}`); return 1; }
  const json = flag(f, 'json');
  if (json !== undefined) {
    const bad = json.split(',').filter(x => !JSON_FIELDS.includes(x));
    if (!json || bad.length) { g.err(json ? `Unknown JSON field: "${bad[0]}"` : 'Specify one or more comma-separated fields for `--json`:', ...JSON_FIELDS.map(x => `  ${x}`)); return 1; }
  }
  const repo = baseRepo(g, flag(f, 'repo'));
  if (!repo) return 1;
  const w = flag(f, 'workflow'), all = runsOf(repo.forge).filter(r => r.createdAt <= g.now);
  if (w !== undefined && !all.some(r => matchesWorkflow(r, w) || String(workflowId(repo.forge.url, r.path)) === w)) { g.err(`could not find any workflows named ${w}`); return 1; }
  const s = flag(f, 'status'), b = flag(f, 'branch'), e = flag(f, 'event'), u = flag(f, 'user'), c = flag(f, 'commit');
  const runs = all.filter(r => (w === undefined || matchesWorkflow(r, w) || String(workflowId(repo.forge.url, r.path)) === w) && (b === undefined || r.headBranch === b)
    && (e === undefined || r.event === e) && (u === undefined || r.actor === u) && (c === undefined || r.headSha.startsWith(c))
    && (s === undefined || runStatus(r, g.now) === s || (runStatus(r, g.now) === 'completed' && runConclusion(r) === s))).slice(0, limit);
  if (json !== undefined) {
    const items = runs.map(r => jsonOf(r, g.now, webUrl(repo.forge), workflowId(repo.forge.url, r.path), json.split(',')));
    g.out(...JSON.stringify(items, null, 2).split('\n'));
    return 0;
  }
  if (!runs.length) { g.err('no runs found'); return 0; }
  g.out(...table([['STATUS', 'TITLE', 'WORKFLOW', 'BRANCH', 'EVENT', 'ID', 'ELAPSED', 'AGE'], ...runs.map(r => listRow(r, g.now))]));
  return 0;
}

function viewCommand(h: Gh, args: string[]): number {
  const { g } = h, f = parseFlags(g, 'run view [<run-id>]', args, ['j|job=', 'v|verbose', 'log', 'log-failed', 'exit-status', 'a|attempt=', 'json=', 'w|web', 'R|repo=']);
  if (!f) return 1;
  if (on(f, 'web') || on(f, 'json') || on(f, 'attempt')) { g.err('gh run view --web／--json／--attempt：模擬環境不支援'); return 1; }
  const found = findRun(h, f);
  if (!found) return 1;
  const { forge, run, job } = found, web = webUrl(forge), st = runStatus(run, g.now);
  if (on(f, 'log') || on(f, 'log-failed')) {
    if (st !== 'completed') { g.err(`run ${run.id} is still in progress; logs will be available when it is complete`); return 1; }
    g.out(...logLines(run, job ? [job] : lastAttempt(run).jobs, g.now, on(f, 'log-failed')));
    return 0;
  }
  const artifacts = h.artifacts ? (forge.site?.artifacts ?? []).filter(x => x.runId === run.id && x.at <= g.now) : [];
  g.out(...viewLines(run, g.now, { verbose: on(f, 'verbose'), ...job ? { job } : {}, footer: true, web, ...artifacts.length ? { artifacts } : {} }));
  return on(f, 'exit-status') && st === 'completed' && runConclusion(run) !== 'success' ? 1 : 0;
}

function watchCommand(h: Gh, args: string[]): number {
  const { g } = h, f = parseFlags(g, 'run watch <run-id>', args, ['exit-status', 'i|interval=', 'compact', 'R|repo=']);
  if (!f) return 1;
  const found = findRun(h, f, 'run ID');
  if (!found) return 1;
  const { forge, run } = found, end = completedAt(run), failed = () => on(f, 'exit-status') && runConclusion(run) !== 'success' ? 1 : 0;
  if (runStatus(run, g.now) === 'completed') { g.out(`Run ${run.workflowName} (${run.id}) has already completed with '${runConclusion(run)}'`); return failed(); }
  // E30: a deployment waiting for a review (or a run held by its concurrency group) has no end yet.
  const review = lastAttempt(run).jobs.find(j => j.env?.reviewers.length && j.completedAt === undefined && j.startedAt === undefined && j.env.review === undefined);
  if (end === undefined && review) { g.err(`gh run watch：run ${run.id} 的 ${review.name} 在等待 environment ${review.env!.name} 的審核，真實的 gh 會一直等下去；用 gh api repos/{owner}/{repo}/actions/runs/${run.id}/pending_deployments 查看，再以 -X POST 核准或拒絕`); return 1; }
  if (end === undefined && (lastAttempt(run).pending || lastAttempt(run).jobs.some(j => j.concurrency && j.concurrency.until === undefined)))
    { g.err(`gh run watch：run ${run.id} 在等待 concurrency group 裡的另一個 run（或 job）結束，真實的 gh 會一直等下去`); return 1; }
  if (end === undefined) { g.err(`gh run watch：run ${run.id} 有 job 一直在等 runner（沒有符合 runs-on 的 runner），真實的 gh 會一直等下去；用 gh run cancel ${run.id} 取消`); return 1; }
  g.out(`Refreshing run status every 3 seconds. Press Ctrl+C to quit.`, '', ...viewLines(run, end, { verbose: true, footer: false, web: webUrl(forge) }), '',
    `${symbol('completed', runConclusion(run))} Run ${run.workflowName} (${run.id}) completed with '${runConclusion(run)}'`);
  h.advance = end - g.now;
  return failed();
}

function rerunCommand(h: Gh, args: string[]): number {
  const { g, account } = h, f = parseFlags(g, 'run rerun [<run-id>]', args, ['failed', 'j|job=', 'd|debug', 'R|repo=']);
  if (!f) return 1;
  if (on(f, 'job') || on(f, 'debug')) { g.err('gh run rerun --job／--debug：模擬環境只支援 gh run rerun <run-id> [--failed]'); return 1; }
  const found = findRun(h, f);
  if (!found) return 1;
  const { forge, run } = found, url = api(forge, `actions/runs/${run.id}/${on(f, 'failed') ? 'rerun-failed-jobs' : 'rerun'}`);
  if (runStatus(run, g.now) !== 'completed') { g.err(`failed to rerun: HTTP 403: This workflow is already running (${url})`); return 1; }
  if (on(f, 'failed') && !lastAttempt(run).jobs.some(j => j.conclusion === 'failure' || j.conclusion === 'cancelled')) { g.err(`failed to rerun: HTTP 403: This workflow run cannot be retried (${url})`); return 1; }
  // E31: on a deploy-hosts machine the runners see the registries and the hosts as they are now.
  const next = rerunRun({ g, ci: h.ci!, ...g.state.ci?.deploy ? envReg(g) : {} }, forge, run, on(f, 'failed'), g.now, account.login);
  if (!next) { g.err(`failed to rerun: HTTP 422: Unable to retry this workflow run because its workflow file is invalid (${url})`); return 1; }
  g.out(`✓ Requested rerun${on(f, 'failed') ? ' (failed jobs)' : ''} of run ${run.id}`);
  return 0;
}

function cancelCommand(h: Gh, args: string[]): number {
  const { g } = h, f = parseFlags(g, 'run cancel [<run-id>]', args, ['R|repo=']);
  if (!f) return 1;
  const found = findRun(h, f, 'run ID');
  if (!found) return 1;
  if (runStatus(found.run, g.now) === 'completed') { g.err('Cannot cancel a workflow run that is completed'); return 1; }
  cancelRun(found.forge, found.run, g.now, h.ci);
  // E30: a pending run of its concurrency group or a held job may start earlier now.
  if (h.ci?.state.env) settleEnv({ g, ci: h.ci, ...envReg(g) }, found.forge, g.now);
  g.out(`✓ Request to cancel workflow ${found.run.id} submitted.`);
  return 0;
}

/** gh run list | view | watch | rerun | cancel (the actions profile). */
export function runCommand(h: Gh, args: string[]): number {
  const { g } = h, sub = args[0], rest = args.slice(1);
  if (sub === 'list' || sub === 'ls') return listCommand(h, rest);
  if (sub === 'view') return viewCommand(h, rest);
  if (sub === 'watch') return watchCommand(h, rest);
  if (sub === 'rerun') return rerunCommand(h, rest);
  if (sub === 'cancel') return cancelCommand(h, rest);
  if (sub === 'download' && h.artifacts) return downloadCommand(h, rest);
  if (sub === 'download' || sub === 'delete') { g.err(`gh run ${sub}：模擬環境不支援（artifact 在引擎階段 E29）`); return 1; }
  g.err(sub === undefined ? 'gh run：要加子指令，例如 gh run list' : `unknown command "${sub}" for "gh run"`);
  return 1;
}
