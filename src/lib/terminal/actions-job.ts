import type { FsState } from './fs';
import type { Objects } from './git';
import { clockOf } from './processes';
import { toStr, type Obj, type Val } from './expr-value';
import type { EvalContext } from './expr-fn';
import { evalIf, interpolate, templateValue } from './expr-template';
import type { Workflow } from './workflow';
import type { WorkflowJob, WorkflowStep } from './workflow-job';
import { permissionLines, type TokenPermissions } from './workflow-perms';
import { checkout, fileCommand, prepareRunner, runStepScript, shellOf, workflowCommands } from './runner';
import type { Annotation, CiState, JobResult, LogLine, StepResult } from './actions-model';

/*
 * Engine stage E28 (docs/curriculum/CICD0_E28_ACTIONS.md §4): one job on a fresh runner — Set up job (with the
 * GITHUB_TOKEN Permissions group), each step in turn (if:, continue-on-error, step outputs through GITHUB_OUTPUT, env
 * through GITHUB_ENV), the post steps, Complete job and the job's outputs. Times come from the runner's clock: a CI tool's
 * seconds and sleep move it, so each step lasts what its commands took; timeout-minutes cuts the job at its deadline.
 */

export const PICKUP = 2;
/** The most output lines a step's log keeps. */
export const MAX_LINES = 500;
export interface JobPlan {
  id: number; key: string; name: string; matrix?: Obj; runnerName: string; queuedAt: number; labels: readonly string[];
  wf: Workflow; job: WorkflowJob;
  /** github, inputs, vars, secrets, needs, strategy, matrix. */
  contexts: Readonly<Record<string, Val>>;
  /** The default environment (CI, GITHUB_*, RUNNER_*). */
  defaults: Readonly<Record<string, string>>;
  permissions: TokenPermissions;
  base: FsState; ci: CiState; objects: Objects; repoUrl: string; workspace: string; attempt: number; sha: string; ref: string;
}

const first = (run: string) => run.split('\n').find(l => l.trim())?.trim() ?? '';
const SUPPORTED = /^actions\/(checkout|setup-node|setup-python)@v\d+$/;
/** The name GitHub gives a step. */
function stepName(s: WorkflowStep, ctx: EvalContext): string {
  if (s.name !== undefined) { try { return interpolate(s.name, ctx, STEP); } catch { return s.name; } }
  return s.uses ? `Run ${s.uses}` : `Run ${first(s.run ?? '')}`;
}
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
/** Steps may call hashFiles (E27's context availability was checked when the file was parsed). */
const STEP = { functions: ['hashFiles'] };
const evalText = (text: string, ctx: EvalContext) => interpolate(text, ctx, STEP);
/** A boolean setting (continue-on-error): true, or the text true. */
const evalBool = (text: string, ctx: EvalContext) => { const v = templateValue(text, ctx); return v === true || (typeof v === 'string' && v.trim() === 'true'); };

/** The workspace's files relative to it (for hashFiles). */
function workspaceFiles(state: FsState, workspace: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const [p, n] of state.nodes) if (n.kind === 'file' && p.startsWith(`${workspace}/`) && !p.startsWith(`${workspace}/.git/`)) out.set(p.slice(workspace.length + 1), n.content ?? '');
  return out;
}

export function executeJob(p: JobPlan): JobResult {
  const started = p.queuedAt + PICKUP;
  let state = prepareRunner(p.base, { now: started, workspace: p.workspace, ci: p.ci, attempt: p.attempt });
  const at = (t: number) => { if (state.clock) state = { ...state, clock: { ...state.clock, now: t } }; };
  const steps: StepResult[] = [], annotations: Annotation[] = [], masks: string[] = [], stepsCtx: Record<string, Val> = {};
  const extraEnv: Record<string, string> = {}, extraPath: string[] = [];
  const envNow: Record<string, string> = {};
  let failed = false, t = started;
  const ctx = (withFiles = false): EvalContext => ({
    contexts: { ...p.contexts, env: { ...envNow }, steps: stepsCtx, job: { status: failed ? 'failure' : 'success', container: {}, services: {} },
      runner: { name: p.runnerName, os: 'Linux', arch: 'X64', temp: p.defaults.RUNNER_TEMP, tool_cache: '/opt/hostedtoolcache', environment: 'github-hosted' } },
    status: { failure: failed },
    ...withFiles ? { files: workspaceFiles(state, p.workspace) } : {},
  });
  const add = (name: string, start: number, end: number, lines: string[], outcome: StepResult['outcome'], conclusion = outcome, endLines: string[] = []) => {
    const out = endLines.length > MAX_LINES ? [...endLines.slice(0, MAX_LINES), `（模擬環境：這個 step 的記錄超過 ${MAX_LINES} 行，其餘省略）`] : endLines;
    const log: LogLine[] = [...lines.map(text => ({ t: start, text })), ...out.map(text => ({ t: end, text }))];
    steps.push({ number: steps.length + 1, name, startedAt: start, completedAt: end, outcome, conclusion, lines: log });
  };

  // Set up job.
  const setup = [`Current runner version: '2.321.0'`, '##[group]Operating System', 'Ubuntu', '24.04.1', 'LTS', '##[endgroup]', '##[group]Runner Image',
    `Image: ${p.labels[0] === 'ubuntu-22.04' ? 'ubuntu-22.04' : 'ubuntu-24.04'}`, '##[endgroup]', '##[group]GITHUB_TOKEN Permissions', ...permissionLines(p.permissions), '##[endgroup]',
    'Secret source: Actions', 'Prepare workflow directory', 'Prepare all required actions'];
  const actions = [...new Set(p.job.steps.flatMap(s => (s.uses && !s.uses.startsWith('./') && !s.uses.startsWith('docker://') ? [s.uses] : [])))];
  if (actions.length) setup.push('Getting action download info', ...actions.map(a => `Download action repository '${a}'`));
  let setupError: string | undefined;
  try {
    for (const [k, v] of p.wf.env) envNow[k] = evalText(v, ctx());
    for (const [k, v] of p.job.env) envNow[k] = evalText(v, ctx());
  } catch (e) { setupError = message(e); }
  setup.push(`Complete job name: ${p.name}`);
  add('Set up job', t, t + 1, setup, setupError ? 'failure' : 'success', undefined, setupError ? [`##[error]${setupError}`] : []);
  t += 1;
  if (setupError) { failed = true; annotations.push({ level: 'failure', message: setupError, step: 1 }); }
  const timeout = (() => { try { const n = Number(toStr(templateValue(p.job.timeoutMinutes, ctx()))); return n > 0 ? n : 360; } catch { return 360; } })();
  const deadline = started + timeout * 60;
  let timedOut = false;
  const posts: string[] = [];

  for (const s of setupError ? [] : p.job.steps) {
    const n = steps.length + 1, base = ctx(), name = stepName(s, base);
    let run: boolean;
    try { run = s.if === undefined ? !failed : evalIf(s.if, ctx(/hashfiles/i.test(s.if)), STEP); }
    catch (e) { add(name, t, t, [], 'failure', 'failure', [`##[error]${message(e)}`]); failed = true; continue; }
    if (!run) { add(name, t, t, [], 'skipped'); if (s.id) stepsCtx[s.id] = { outputs: {}, outcome: 'skipped', conclusion: 'skipped' }; continue; }
    const start = t, head: string[] = [], tail: string[] = [];
    let ok = true, outputs: Record<string, string> = {};
    try {
      const sctx = ctx(/hashfiles/i.test(`${s.run ?? ''}${s.with.map(w => w[1]).join('')}${s.env.map(w => w[1]).join('')}`));
      const stepEnv = Object.fromEntries(s.env.map(([k, v]) => [k, evalText(v, sctx)]));
      const withs = s.with.map(([k, v]) => [k, evalText(v, sctx)] as const);
      if (s.uses !== undefined) {
        head.push(`##[group]Run ${s.uses}`, ...withs.length || /checkout/.test(s.uses) ? ['with:'] : [], ...withs.map(([k, v]) => `  ${k}: ${v}`));
        if (/^actions\/checkout@/.test(s.uses) && !withs.some(w => w[0] === 'token')) head.push(`  repository: ${p.contexts.github && (p.contexts.github as Obj).repository}`, '  token: ***');
        head.push('##[endgroup]');
        const m = SUPPORTED.exec(s.uses);
        if (!m) { tail.push(`##[error]模擬環境不支援 ${s.uses}（E28 支援 actions/checkout、actions/setup-node、actions/setup-python；cache 與 artifact 在 E29）`); ok = false; }
        else if (m[1] === 'checkout') {
          const r = checkout(state, p.objects, p.sha, { url: p.repoUrl, workspace: p.workspace, ref: p.ref });
          state = r.state; tail.push(...r.lines); t += 1; posts.push(`Post ${name}`);
        } else {
          const lang = m[1] === 'setup-node' ? 'node' : 'Python', version = withs.find(w => /-version$/.test(w[0]))?.[1] ?? (lang === 'node' ? '20' : '3.12');
          tail.push(`Found in cache @ /opt/hostedtoolcache/${lang}/${version}/x64`); t += 1;
        }
      } else {
        const sh = shellOf(s.shell ?? p.job.defaults.shell ?? p.wf.defaults.shell), script = evalText(s.run ?? '', sctx);
        const shown = { ...Object.fromEntries([...p.wf.env.map(([k]) => k), ...p.job.env.map(([k]) => k)].map(k => [k, envNow[k]])), ...extraEnv, ...stepEnv };
        head.push(`##[group]Run ${first(script)}`, ...script.replace(/\n$/, '').split('\n'), ...sh ? [`shell: ${sh.line}`] : [],
          ...Object.keys(shown).length ? ['env:', ...Object.entries(shown).map(([k, v]) => `  ${k}: ${v}`)] : [], '##[endgroup]');
        if (!sh) { tail.push(`##[error]模擬環境的 run 只支援 bash 與 sh（shell: ${s.shell ?? p.job.defaults.shell ?? p.wf.defaults.shell}）`); ok = false; }
        else {
          const dir = evalText(s.workingDirectory ?? p.job.defaults.workingDirectory ?? p.wf.defaults.workingDirectory ?? '.', sctx);
          const env = { ...p.defaults, ...envNow, ...extraEnv, ...stepEnv, PATH: [...extraPath, p.defaults.PATH].join(':') };
          at(t);
          const r = runStepScript(state, { script, shell: s.shell ?? p.job.defaults.shell ?? p.wf.defaults.shell, env, cwd: dir, n });
          state = r.state; t = Math.max(t, clockOf(state).now);
          if (r.missing) { tail.push(`##[error]An error occurred trying to start process '/usr/bin/bash' with working directory '${r.missing}'. No such file or directory`); ok = false; }
          else {
            const w = workflowCommands(r.text, masks, n);
            tail.push(...w.lines); annotations.push(...w.annotations);
            for (const [kind, text] of [['output', r.files.output], ['env', r.files.env], ['path', r.files.path]] as const) {
              if (kind === 'path') { extraPath.unshift(...text.split('\n').filter(Boolean).reverse()); continue; }
              const f = fileCommand(text);
              if ('error' in f) { tail.push(`##[error]Unable to process file command '${kind}' successfully.`, `##[error]${f.error}`); ok = false; continue; }
              for (const [k, v] of f.values) { if (kind === 'output') outputs[k] = v; else extraEnv[k] = v; }
            }
            if (r.status !== 0) { tail.push(`##[error]Process completed with exit code ${r.status}.`); annotations.push({ level: 'failure', message: `Process completed with exit code ${r.status}.`, step: n }); ok = false; }
          }
        }
      }
    } catch (e) { tail.push(`##[error]${message(e)}`); annotations.push({ level: 'failure', message: message(e), step: n }); ok = false; outputs = {}; }
    let coe = false;
    try { coe = evalBool(s.continueOnError, ctx()); } catch { coe = false; }
    const outcome = ok ? 'success' : 'failure', conclusion = !ok && coe ? 'success' : outcome;
    if (t > deadline) {
      timedOut = true;
      add(name, start, deadline, head, 'cancelled', 'cancelled', [...tail, '##[error]The operation was canceled.']);
      t = deadline; failed = true;
      annotations.push({ level: 'failure', message: `The job running on runner ${p.runnerName} has exceeded the maximum execution time of ${timeout} minutes.`, step: n });
      break;
    }
    add(name, start, t, head, outcome, conclusion, tail);
    if (s.id) stepsCtx[s.id] = { outputs, outcome, conclusion };
    if (conclusion === 'failure') failed = true;
  }
  for (const name of posts.reverse()) add(name, t, t, ['Post job cleanup.'], 'success');
  add('Complete job', t, t, ['Cleaning up orphan processes'], 'success');
  const outputs: Record<string, string> = {};
  for (const [k, v] of p.job.outputs) { try { outputs[k] = evalText(v, ctx()); } catch { outputs[k] = ''; } }
  let continueOnError = false;
  try { continueOnError = evalBool(p.job.continueOnError, ctx()); } catch { continueOnError = false; }
  return {
    id: p.id, key: p.key, name: p.name, ...p.matrix ? { matrix: p.matrix } : {}, labels: p.labels, queuedAt: p.queuedAt, startedAt: started, completedAt: t,
    conclusion: failed || timedOut ? 'failure' : 'success', continueOnError, steps, outputs, annotations, runner: p.runnerName,
  };
}
