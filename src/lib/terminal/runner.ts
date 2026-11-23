import { physicalPath, resolvePath, type FsNode, type FsState } from './fs';
import { readTree, reachable, type Objects, type Sha } from './git';
import type { GitRepo } from './git-state';
import { RUNNER_PROFILE, type ShellProfile } from './shell';
import { runScript } from './script';
import type { Annotation, CiState } from './actions-model';

/*
 * Engine stage E28 (docs/curriculum/CICD0_E28_ACTIONS.md §4): a GitHub-hosted runner for one job — a fresh copy of the
 * lesson's runner image (user runner, the workspace /home/runner/work/<repo>/<repo>), actions/checkout filling the
 * workspace from the run's commit (a repository whose objects are the forge's), run: steps through the Bash interpreter
 * as bash -e {0} (shell: bash adds --noprofile --norc -o pipefail), the file commands GITHUB_OUTPUT, GITHUB_ENV,
 * GITHUB_PATH and GITHUB_STEP_SUMMARY, and the workflow commands (::error::, ::group::, ::add-mask:: …) in the output.
 */

export const RUNNER_HOME = '/home/runner';
export const TEMP = '/home/runner/work/_temp';
const FILES = `${TEMP}/_runner_file_commands`;
const dirNode = (owner: string): FsNode => ({ kind: 'dir', mode: 0o755, owner });
const fileNode = (owner: string, content: string): FsNode => ({ kind: 'file', mode: 0o644, owner, content });

function mkdirs(nodes: Map<string, FsNode>, path: string, owner: string) {
  const parts = path.split('/').filter(Boolean);
  for (let k = 1; k <= parts.length; k++) { const d = `/${parts.slice(0, k).join('/')}`; if (!nodes.has(d)) nodes.set(d, dirNode(owner)); }
}

/** A fresh runner for a job: the image at the job's start time, in the workspace, with the CI tools and the run attempt. */
export function prepareRunner(base: FsState, o: { now: number; workspace: string; ci: CiState; attempt: number }): FsState {
  const nodes = new Map(base.nodes);
  for (const d of [o.workspace, FILES]) mkdirs(nodes, d, 'runner');
  const clock = base.clock ? { ...base.clock, now: o.now } : undefined;
  return {
    ...base, nodes, cwd: o.workspace, ...clock ? { clock } : {}, status: 0,
    ci: { tools: o.ci.tools.filter(t => t.where !== 'local'), labels: [], next: { run: 0, job: 0 }, scheduled: 0, calls: {}, attempt: o.attempt },
  };
}

/** actions/checkout: the commit's files in the workspace and a repository there (on the branch for a branch push, else detached). */
export function checkout(state: FsState, objects: Objects, sha: Sha, o: { url: string; workspace: string; ref: string }): { state: FsState; lines: string[] } {
  const commit = objects.get(sha);
  if (commit?.type !== 'commit') return { state, lines: [`##[error]模擬環境找不到 ${sha}`] };
  const nodes = new Map(state.nodes), files = readTree(objects, commit.tree);
  mkdirs(nodes, `${o.workspace}/.git`, 'runner');
  for (const [p, e] of files) {
    const path = `${o.workspace}/${p}`, blob = objects.get(e.id);
    mkdirs(nodes, path.slice(0, path.lastIndexOf('/')), 'runner');
    if (e.mode === '120000') nodes.set(path, { kind: 'link', mode: 0o777, owner: 'runner', target: blob?.type === 'blob' ? blob.data : '' });
    else nodes.set(path, { kind: 'file', mode: e.mode === '100755' ? 0o755 : 0o644, owner: 'runner', content: blob?.type === 'blob' ? blob.data : '' });
  }
  const branch = /^refs\/heads\//.test(o.ref) ? o.ref.slice(11) : undefined;
  const refs = new Map<string, Sha>(branch ? [[o.ref, sha], [`refs/remotes/origin/${branch}`, sha]] : o.ref.startsWith('refs/pull/') ? [[`refs/remotes/pull/${o.ref.slice(10)}`, sha]] : [[o.ref, sha]]);
  const repo: GitRepo = {
    path: o.workspace, head: branch ? o.ref : sha, refs, symrefs: new Map(), index: files, unmerged: new Map(), stash: [],
    // E29: checkout -B from origin's branch sets its upstream (git's autoSetupMerge), so a step's plain git push works.
    config: new Map([['remote.origin.url', o.url.replace(/\.git$/, '')], ['remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*'],
      ...branch ? [[`branch.${branch}.remote`, 'origin'], [`branch.${branch}.merge`, o.ref]] as [string, string][] : []]),
    known: reachable(objects, [sha]),
  };
  const target = branch ? `-B ${branch} refs/remotes/origin/${branch}` : o.ref.startsWith('refs/pull/') ? `refs/remotes/pull/${o.ref.slice(10)}` : o.ref;
  return {
    // E29: an artifacts runner keeps its forge copy, account and GITHUB_TOKEN.
    state: { ...state, nodes, git: { ...state.git, objects, repos: [repo], forge: state.git?.forge ?? [] } },
    lines: [`Syncing repository: ${o.url.replace(/^https:\/\/github\.example\//, '').replace(/\.git$/, '')}`, '##[group]Checking out the ref', `/usr/bin/git checkout --progress --force ${target}`, '##[endgroup]', '/usr/bin/git log -1 --format=%H', sha],
  };
}

/** The shells a run: step may name; the log's shell line and the interpreter's options. */
export function shellOf(shell: string | undefined): { line: string; options: { errexit: boolean; pipefail: boolean }; sh: boolean } | undefined {
  if (shell === undefined) return { line: '/usr/bin/bash -e {0}', options: { errexit: true, pipefail: false }, sh: false };
  if (shell === 'bash') return { line: '/usr/bin/bash --noprofile --norc -e -o pipefail {0}', options: { errexit: true, pipefail: true }, sh: false };
  if (shell === 'sh') return { line: '/usr/bin/sh -e {0}', options: { errexit: true, pipefail: false }, sh: true };
  return undefined;
}

/** The workflow commands in a step's output: the log's lines, annotations, and new masks (::add-mask:: lines are not shown). */
export function workflowCommands(text: string, masks: string[], step: number): { lines: string[]; annotations: Annotation[] } {
  const lines: string[] = [], annotations: Annotation[] = [];
  const masked = (s: string) => masks.reduce((t, m) => (m ? t.split(m).join('***') : t), s);
  for (const raw of text.replace(/\n$/, '').split('\n')) {
    if (!text) break;
    const m = /^::([a-z-]+)(?: [^:]*)?::(.*)$/.exec(raw);
    if (!m) { lines.push(masked(raw)); continue; }
    const [, cmd, value] = m;
    if (cmd === 'add-mask') { if (value) masks.push(value); continue; }
    if (cmd === 'debug') continue;
    if (cmd === 'group') { lines.push(`##[group]${masked(value)}`); continue; }
    if (cmd === 'endgroup') { lines.push('##[endgroup]'); continue; }
    if (cmd === 'error' || cmd === 'warning' || cmd === 'notice') {
      lines.push(`##[${cmd}]${masked(value)}`);
      annotations.push({ level: cmd === 'error' ? 'failure' : cmd, message: masked(value), step });
      continue;
    }
    lines.push(masked(raw));
  }
  return { lines, annotations };
}

/** Parses a file command's file (name=value and name<<DELIMITER … DELIMITER); an invalid line is GitHub's error. */
export function fileCommand(text: string): { values: [string, string][] } | { error: string } {
  const values: [string, string][] = [], lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    const heredoc = /^([^=<]+)<<(.+)$/.exec(l), eq = l.indexOf('=');
    if (heredoc) {
      const end = lines.indexOf(heredoc[2], i + 1);
      if (end < 0) return { error: `Matching delimiter not found '${heredoc[2]}'` };
      values.push([heredoc[1], lines.slice(i + 1, end).join('\n')]);
      i = end;
    } else if (eq > 0) values.push([l.slice(0, eq), l.slice(eq + 1)]);
    else return { error: `Invalid format '${l}'` };
  }
  return { values };
}

export interface ScriptStep { script: string; shell: string | undefined; env: Readonly<Record<string, string>>; cwd: string; n: number; /** E29: the artifacts profile's runner shell (docker and gh). */ profile?: ShellProfile }
export interface ScriptResult { state: FsState; text: string; status: number; files: Record<'output' | 'env' | 'path' | 'summary', string>; missing?: string }
/** Runs a run: step's script on the runner with fresh file-command files; what it printed and what it wrote to them. */
export function runStepScript(state: FsState, s: ScriptStep): ScriptResult {
  const sh = shellOf(s.shell)!, names = { output: 'set_output', env: 'set_env', path: 'add_path', summary: 'step_summary' } as const;
  const paths = Object.fromEntries(Object.entries(names).map(([k, v]) => [k, `${FILES}/${v}_${String(s.n).padStart(4, '0')}`])) as Record<keyof typeof names, string>;
  const nodes = new Map(state.nodes);
  for (const p of Object.values(paths)) nodes.set(p, fileNode('runner', ''));
  const cwd = resolvePath({ cwd: state.cwd, home: RUNNER_HOME }, s.cwd);
  if (nodes.get(physicalPath(nodes, cwd, true))?.kind !== 'dir') {
    return { state: { ...state, nodes }, text: '', status: 1, files: { output: '', env: '', path: '', summary: '' }, missing: cwd };
  }
  const env = { ...s.env, GITHUB_OUTPUT: paths.output, GITHUB_ENV: paths.env, GITHUB_PATH: paths.path, GITHUB_STEP_SUMMARY: paths.summary };
  const r = runScript({ ...state, nodes, cwd }, s.script, s.profile ?? RUNNER_PROFILE, { name: `${TEMP}/${String(s.n).padStart(4, '0')}.sh`, args: [], tty: false, stdin: null, env, options: sh.options });
  const read = (p: string) => { const n = r.state.nodes.get(p); return n?.kind === 'file' ? n.content ?? '' : ''; };
  return { state: { ...r.state, cwd: state.cwd }, text: r.events.map(e => e.data).join(''), status: r.status, files: { output: read(paths.output), env: read(paths.env), path: read(paths.path), summary: read(paths.summary) } };
}
