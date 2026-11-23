import type { FsState } from './fs';
import { clockOf } from './processes';
import { mergeBases, subjectOf, writeTree, ZERO, type Sha } from './git';
import { Git, type Forge } from './git-core';
import type { ForgePull } from './forge-state';
import { repoPath, testMerge } from './forge';
import type { Obj, Val } from './expr-value';
import { parseWorkflow, workflowFiles, workflowName } from './workflow';
import { changedPaths, nextScheduled, pullChangedPaths, triggers, type WorkflowEvent } from './workflow-match';
import { cancelJobAt, createRun, executeAttempt, saveRun, workflowAt, type Actx, type NewRun } from './actions';
import { lastAttempt, type WorkflowRun } from './actions-model';
import { commitArt, retractArt, settleArt } from './artifacts-run';
import { deployHostsOf } from './deploy-hosts';

/*
 * Engine stage E28 (docs/curriculum/CICD0_E28_ACTIONS.md §2): the events that start runs. After a git or gh command the
 * forge is compared with before: every branch or tag that moved is a push (git push, and gh pr merge moving the base), a
 * new open pull request is opened and a new head of an open one is synchronize (on its test merge commit; none while it
 * conflicts). schedule events are created when the clock has passed their cron times (before the next git or gh command,
 * or a check). gh workflow run dispatches; gh run rerun and cancel change a run.
 */

const silent = { out: () => {}, err: () => {}, user: 'root' };
export const MAX_SCHEDULED = 10;
const repoObj = (f: Forge) => ({ full_name: repoPath(f), name: repoPath(f).split('/')[1], default_branch: f.head.replace(/^refs\/heads\//, '') });

/** Runs a change of the forge with Actions' context; the state with the new runs, objects and counters. */
export function withActions(state: FsState, fn: (x: Actx) => void): FsState {
  const g = new Git(state, silent), x: Actx = { g, ci: { state: state.ci! }, ...state.ci?.art && state.docker?.registries ? { reg: state.docker.registries } : {}, ...deployHostsOf(state) };
  fn(x);
  return { ...g.result(), ci: x.ci.state };
}

function start(x: Actx, forge: Forge, ev: WorkflowEvent, n: Omit<NewRun, 'path'>, files: { path: string; text: string }[]) {
  for (const f of files) {
    if (forge.site!.disabled?.includes(f.path)) continue;
    const p = parseWorkflow(f.path, f.text);
    if (!p.ok || triggers(p.workflow.on, ev)) createRun(x, forge, { ...n, path: f.path }, f.text);
  }
}

function pushEvent(x: Actx, forge: Forge, ref: string, old: Sha | undefined, to: Sha, at: number, actor: string) {
  const g = x.g, peel = (id: Sha | undefined) => { const o = id ? g.store.get(id) : undefined; return o?.type === 'tag' ? o.object : id; };
  const commit = peel(to)!, tag = ref.startsWith('refs/tags/');
  if (g.store.get(commit)?.type !== 'commit') return;
  let from = peel(old);
  if (!from && !tag) { const def = forge.refs.get(forge.head); if (def && def !== commit) from = mergeBases(g.store, def, commit)[0]; }
  const c = g.commit(commit);
  const payload: Obj = { ref, before: old ?? ZERO, after: to, created: !old, head_commit: { id: commit, message: c.message, author: { name: c.author.name, email: c.author.email } }, pusher: { name: actor }, repository: repoObj(forge) };
  start(x, forge, { name: 'push', ref, ...tag ? {} : { changed: changedPaths(g.store, from, commit) } },
    { event: 'push', headBranch: ref.replace(/^refs\/(heads|tags)\//, ''), headSha: commit, sha: commit, ref, title: subjectOf(c.message), createdAt: at, actor, payload }, workflowFiles(g.store, commit));
}

function pullEvent(x: Actx, forge: Forge, pr: ForgePull, action: string, at: number) {
  const g = x.g, t = testMerge(g, forge, pr);
  if (!t || t.merge.unmerged.size) return;
  const ident = { name: 'GitHub', email: 'noreply@github.example', time: at, tz: '+0000' };
  const sha = g.store.put({ type: 'commit', tree: writeTree(g.store, t.merge.clean), parents: [t.base, t.head], author: ident, committer: ident, message: `Merge ${t.head} into ${t.base}\n` });
  const payload: Obj = { action, number: pr.number, pull_request: { number: pr.number, title: pr.title, body: pr.body, user: { login: pr.author }, head: { ref: pr.head, sha: t.head }, base: { ref: pr.base, sha: t.base } }, repository: repoObj(forge) };
  start(x, forge, { name: 'pull_request', base: pr.base, action, changed: pullChangedPaths(g.store, t.base, t.head) },
    { event: 'pull_request', headBranch: pr.head, headSha: t.head, sha, ref: `refs/pull/${pr.number}/merge`, title: pr.title, createdAt: at, actor: pr.author,
      pr: { number: pr.number, head: pr.head, base: pr.base, baseSha: t.base }, payload }, workflowFiles(g.store, sha));
}

/** After a git or gh command: the runs its pushes and pull requests start. */
export function actionsAfter(before: FsState, after: FsState): FsState {
  if (!after.ci || !after.git) return after;
  const old = new Map((before.git?.forge ?? []).map(f => [f.url, f]));
  type Ev = { url: string; ref: string; from?: Sha; to: Sha } | { url: string; number: number; action: string };
  const events: Ev[] = [];
  for (const f of after.git.forge) {
    if (!f.site) continue;
    const o = old.get(f.url);
    for (const [ref, sha] of [...f.refs].filter(([r]) => /^refs\/(heads|tags)\//.test(r)).sort(([a], [b]) => (a < b ? -1 : 1))) {
      const prev = o?.refs.get(ref);
      if (prev !== sha) events.push({ url: f.url, ref, ...prev ? { from: prev } : {}, to: sha });
    }
    if (o?.site?.pulls === f.site.pulls) continue;
    for (const pr of f.site.pulls) {
      const prev = o?.site?.pulls.find(p => p.number === pr.number);
      if (pr.state !== 'OPEN') continue;
      if (!prev) events.push({ url: f.url, number: pr.number, action: 'opened' });
      else if (prev.heads.length < pr.heads.length) events.push({ url: f.url, number: pr.number, action: 'synchronize' });
    }
  }
  if (!events.length) return after;
  const at = clockOf(after).now, actor = after.git.account?.login ?? after.user;
  return withActions(after, x => {
    for (const ev of events) {
      const forge = x.g.forge.find(f => f.url === ev.url)!;
      if ('ref' in ev) pushEvent(x, forge, ev.ref, ev.from, ev.to, at, actor);
      else pullEvent(x, forge, forge.site!.pulls.find(p => p.number === ev.number)!, ev.action, at);
    }
  });
}

/** Before a git or gh command (and a check): the schedule events whose times the clock has passed (at most MAX_SCHEDULED). */
export function actionsTick(state0: FsState): FsState {
  // E29: first the effects of runs whose time has come (refs the GITHUB_TOKEN pushed, images pushed to registries).
  const state = settleArt(state0);
  const ci = state.ci, now = clockOf(state).now;
  if (!ci || !state.git || ci.scheduled >= now) return state;
  const due: { at: number; url: string; path: string; text: string; cron: string; name: string }[] = [];
  for (const f of state.git.forge) {
    const tip = f.refs.get(f.head);
    if (!f.site || !tip) continue;
    for (const file of workflowFiles(state.git.objects, tip)) {
      const p = parseWorkflow(file.path, file.text);
      if (!p.ok || !p.workflow.on.schedule.length || f.site.disabled?.includes(file.path)) continue;
      for (const s of nextScheduled(p.workflow.on, ci.scheduled, MAX_SCHEDULED)) if (s.at <= now) due.push({ at: s.at, url: f.url, path: file.path, text: file.text, cron: s.cron, name: workflowName(file.path, p) });
    }
  }
  const next = { ...state, ci: { ...ci, scheduled: now } };
  if (!due.length) return next;
  due.sort((a, b) => a.at - b.at || (a.url < b.url ? -1 : a.url > b.url ? 1 : a.path < b.path ? -1 : 1));
  const actor = state.git.account?.login ?? state.user;
  return withActions(next, x => {
    for (const d of due.slice(0, MAX_SCHEDULED)) {
      const forge = x.g.forge.find(f => f.url === d.url)!, tip = forge.refs.get(forge.head)!;
      createRun(x, forge, { path: d.path, event: 'schedule', headBranch: forge.head.replace(/^refs\/heads\//, ''), headSha: tip, sha: tip, ref: forge.head, title: d.name, createdAt: d.at, actor, cron: d.cron,
        payload: { schedule: d.cron, repository: repoObj(forge) } }, d.text);
    }
  });
}

/** gh workflow run: a workflow_dispatch run on a ref (a branch or tag name) with typed inputs. */
export function dispatchRun(x: Actx, forge: Forge, path: string, text: string, ref: string, sha: Sha, inputs: Record<string, Val>, at: number, actor: string): WorkflowRun {
  const name = workflowName(path, parseWorkflow(path, text));
  return createRun(x, forge, { path, event: 'workflow_dispatch', headBranch: ref.replace(/^refs\/(heads|tags)\//, ''), headSha: sha, sha, ref, title: name, createdAt: at, actor, inputs,
    payload: { inputs, ref, workflow: path, repository: repoObj(forge) } }, text);
}

/** gh run rerun: a new attempt now (failedOnly: the failed and cancelled jobs and their dependents; the rest is kept). */
export function rerunRun(x: Actx, forge: Forge, run: WorkflowRun, failedOnly: boolean, at: number, actor: string): WorkflowRun | undefined {
  const wf = workflowAt(x, run);
  if (!wf) return undefined;
  const prev = lastAttempt(run), attempt = executeAttempt(x, forge, run, wf, prev.attempt + 1, at, actor, failedOnly ? prev : undefined);
  const next = { ...run, attempts: [...run.attempts, attempt] };
  saveRun(forge, next);
  commitArt(x.ci, forge, next, attempt);
  return next;
}

/** gh run cancel: every unfinished job is cut now. */
export function cancelRun(forge: Forge, run: WorkflowRun, at: number, ci?: Actx['ci']): WorkflowRun {
  const a0 = lastAttempt(run);
  // E30: a run its concurrency group holds (pending) is cancelled before it starts.
  const a = a0.pending || (a0.after !== undefined && at < a0.startedAt) ? (({ pending: _p, ...rest }) => { void _p; return { ...rest, startedAt: at }; })(a0) : a0;
  const next = { ...run, attempts: [...run.attempts.slice(0, -1), { ...a, jobs: a.jobs.map(j => cancelJobAt(a === a0 ? j : { ...j, queuedAt: Math.min(j.queuedAt, at) }, at)), cancelledAt: at }] };
  saveRun(forge, next);
  retractArt(ci, forge, run.id, at);
  return next;
}
