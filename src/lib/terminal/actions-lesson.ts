import type { FsState } from './fs';
import { parseTime, DEFAULT_NOW } from './clock';
import { machineState, type TerminalFile, type TerminalMachine } from './lesson';
import { PROFILES } from './shell';
import type { CiCondition, CiState, CiTool } from './actions-model';
import { runnerDocker } from './artifacts-lesson';

/*
 * Engine stage E28 as lesson data (docs/curriculum/CICD0_E28_ACTIONS.md §7). A machine of the actions profile runs the
 * workflows of its forge repositories on GitHub-hosted runners. The lesson may declare the runs-on labels that have
 * runners, files added to the runner image, the first run and job IDs, and CI tools — commands whose output, exit status,
 * written files and duration follow conditions on the files (usable on the learner's machine and on runners).
 */

export interface TerminalCiCase {
  /** Every condition must hold (none: always). */
  when?: CiCondition[];
  stdout?: string; stderr?: string; exit?: number; seconds?: number;
  writes?: { path: string; content: string }[];
  /** E29 (artifacts profile): the seconds when the tool's cache folder already exists (a restored cache). */
  cachedSeconds?: number;
}
export interface TerminalCiTool {
  /** The exact words, e.g. 'npm test'. */
  command: string;
  /** Where it exists (default both). */
  where?: 'both' | 'runner' | 'local';
  /** The first case whose conditions hold decides; when none does, the tool prints nothing and succeeds. */
  cases: TerminalCiCase[];
  flaky?: { failOnAttempts: number[]; stdout?: string; stderr?: string; exit?: number; seconds?: number };
  /** E29 (artifacts profile): the folder it fills when it succeeds (~/.npm, node_modules), which actions/cache can keep. */
  cache?: string;
}
export interface TerminalActions {
  /** The runs-on labels that have runners (default ubuntu-latest, ubuntu-24.04, ubuntu-22.04); a job naming another label waits. */
  labels?: string[];
  /** Files added to the runner image (owned by runner unless they say otherwise). */
  runnerFiles?: TerminalFile[];
  tools?: TerminalCiTool[];
  /** The first run and job IDs (defaults 4100000001 and 11300000001). */
  ids?: { run?: number; job?: number };
}

export const ACTIONS_LIMITS = { tools: 12, cases: 8, writes: 4, text: 4000, seconds: 3600, labels: 8, files: 20 } as const;
export const DEFAULT_LABELS = ['ubuntu-latest', 'ubuntu-24.04', 'ubuntu-22.04'];
const WORDS = /^[A-Za-z0-9_.@/+=:-]+(?: [A-Za-z0-9_.@/+=:-]+){0,7}$/;
const REL = (p: unknown) => typeof p === 'string' && /^[^/]/.test(p) && !p.endsWith('/') && p.split('/').every(s => s && s !== '..') && p.length <= 200;
const TEXT = (t: unknown) => t === undefined || (typeof t === 'string' && t.length <= ACTIONS_LIMITS.text);
const whole = (x: unknown, min: number, max: number) => Number.isInteger(x) && (x as number) >= min && (x as number) <= max;

function caseProblem(c: TerminalCiCase): string | null {
  if (!c || typeof c !== 'object') return 'a case must be an object';
  if (c.when !== undefined && (!Array.isArray(c.when) || c.when.some(w => !w || (w.env === undefined) === (w.path === undefined)
    || (w.env !== undefined && (typeof w.env !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(w.env)))
    || (w.path !== undefined && (!REL(w.path) && w.path !== '.' || [w.includes, w.excludes, w.absent].filter(x => x !== undefined).length > 1))
    || !TEXT(w.includes) || !TEXT(w.excludes))))
    return 'a condition is { path (relative), includes | excludes | absent } or { env, set? }';
  if (!TEXT(c.stdout) || !TEXT(c.stderr)) return `output is at most ${ACTIONS_LIMITS.text} characters`;
  if (c.exit !== undefined && !whole(c.exit, 0, 255)) return 'exit is 0..255';
  if (c.seconds !== undefined && !whole(c.seconds, 0, ACTIONS_LIMITS.seconds)) return `seconds are 0..${ACTIONS_LIMITS.seconds}`;
  if (c.writes !== undefined && (!Array.isArray(c.writes) || c.writes.length > ACTIONS_LIMITS.writes || c.writes.some(w => !REL(w?.path) || !TEXT(w.content) || typeof w.content !== 'string')))
    return `writes are at most ${ACTIONS_LIMITS.writes} files { path (relative), content }`;
  return null;
}

/** E28: the problems of a machine's actions data (it needs the actions profile). */
export function actionsProblems(m: TerminalMachine, actions: boolean): string[] {
  const a = m.actions;
  if (a === undefined) return [];
  if (!actions) return ['actions needs the actions profile (engine stage E28)'];
  const out: string[] = [], fail = (s: string) => out.push(`actions: ${s}`);
  if (a.labels !== undefined && (!Array.isArray(a.labels) || !a.labels.length || a.labels.length > ACTIONS_LIMITS.labels || a.labels.some(l => typeof l !== 'string' || !/^[A-Za-z0-9_.-]{1,64}$/.test(l))))
    fail(`labels are 1..${ACTIONS_LIMITS.labels} runner labels`);
  if (a.ids !== undefined && ((a.ids.run !== undefined && !whole(a.ids.run, 1, 9e12)) || (a.ids.job !== undefined && !whole(a.ids.job, 1, 9e12)))) fail('ids are positive integers');
  if (a.runnerFiles !== undefined && (!Array.isArray(a.runnerFiles) || a.runnerFiles.length > ACTIONS_LIMITS.files || a.runnerFiles.some(f => typeof f?.path !== 'string' || !f.path.startsWith('/'))))
    fail(`runnerFiles are at most ${ACTIONS_LIMITS.files} files with absolute paths`);
  const tools = a.tools ?? [];
  if (!Array.isArray(tools) || tools.length > ACTIONS_LIMITS.tools) { fail(`at most ${ACTIONS_LIMITS.tools} tools`); return out; }
  const seen = new Set<string>();
  for (const t of tools) {
    const at = `tool ${t?.command}`;
    if (typeof t?.command !== 'string' || !WORDS.test(t.command)) { fail(`${at}: command is 1..8 words`); continue; }
    if ((PROFILES.actions.commands as readonly string[]).includes(t.command.split(' ')[0])) fail(`${at}: ${t.command.split(' ')[0]} is a command of the simulation`);
    if (seen.has(`${t.command}\n${t.where ?? 'both'}`)) fail(`${at}: declared twice`);
    seen.add(`${t.command}\n${t.where ?? 'both'}`);
    if (t.where !== undefined && !['both', 'runner', 'local'].includes(t.where)) fail(`${at}: where is both, runner or local`);
    if (!Array.isArray(t.cases) || !t.cases.length || t.cases.length > ACTIONS_LIMITS.cases) { fail(`${at}: 1..${ACTIONS_LIMITS.cases} cases`); continue; }
    t.cases.forEach((c, i) => { const p = caseProblem(c); if (p) fail(`${at} case ${i + 1}: ${p}`); });
    const f = t.flaky;
    if (f !== undefined && (!Array.isArray(f.failOnAttempts) || !f.failOnAttempts.length || f.failOnAttempts.some(n => !whole(n, 1, 10)) || caseProblem(f)))
      fail(`${at}: flaky needs failOnAttempts (attempts 1..10) and a case's output, exit and seconds`);
  }
  return out;
}

const tool = (t: TerminalCiTool): CiTool => ({
  command: t.command.split(' '), where: t.where ?? 'both',
  cases: t.cases.map(c => ({ when: c.when ?? [], stdout: c.stdout ?? '', stderr: c.stderr ?? '', exit: c.exit ?? 0, seconds: c.seconds ?? 1, writes: c.writes ?? [], ...c.cachedSeconds !== undefined ? { cachedSeconds: c.cachedSeconds } : {} })),
  ...t.cache !== undefined ? { cache: t.cache } : {},
  ...t.flaky ? { flaky: { failOnAttempts: t.flaky.failOnAttempts, stdout: t.flaky.stdout ?? '', stderr: t.flaky.stderr ?? '', exit: t.flaky.exit ?? 1, seconds: t.flaky.seconds ?? 1 } } : {},
});
const dir = (path: string, owner = 'root', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const OS_RELEASE = 'PRETTY_NAME="Ubuntu 24.04.1 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nVERSION="24.04.1 LTS (Noble Numbat)"\nID=ubuntu\n';

/** The runner image: Ubuntu with the user runner (sudo without a password, docker group), the lesson's files, the machine's clock. */
export function runnerMachine(m: TerminalMachine, artifacts = false): TerminalMachine {
  // E29: the artifacts profile's runners have Docker (the machine's Docker Hub images and registries, nothing local).
  const docker = artifacts ? runnerDocker(m) : undefined;
  const base: TerminalFile[] = [dir('/etc'), { path: '/etc/os-release', kind: 'file', mode: 0o644, owner: 'root', content: OS_RELEASE }, dir('/home'), dir('/home/runner', 'runner', 0o750),
    dir('/home/runner/work', 'runner'), dir('/opt'), dir('/opt/hostedtoolcache', 'runner'), dir('/tmp', 'root', 0o1777)];
  const listed = new Set((m.actions?.runnerFiles ?? []).map(f => f.path));
  const files = [...base.filter(f => !listed.has(f.path)), ...m.actions?.runnerFiles ?? []].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return {
    id: `${m.id}/runner`, title: 'GitHub-hosted runner', user: 'runner', cwd: '/home/runner', host: 'fv-az101-1', profile: 'git', files, now: m.now ?? DEFAULT_NOW,
    accounts: { users: [{ name: 'runner', uid: 1001 }], groups: [{ name: 'sudo', members: ['runner'] }, { name: 'adm', members: ['runner'] }, { name: 'docker', gid: 118, members: ['runner'] }] },
    ...docker ? { docker } : {},
  };
}

/** E28: the machine's CI state — its tools, the runner image, the labels and the ID counters. */
export function actionsState(m: TerminalMachine, state: FsState, actions: boolean, artifacts = false): FsState {
  if (!actions || actionsProblems(m, actions).length) return state;
  const a = m.actions ?? {};
  const ci: CiState = {
    tools: (a.tools ?? []).map(tool), runner: machineState(runnerMachine(m, artifacts)), labels: a.labels ?? DEFAULT_LABELS,
    next: { run: a.ids?.run ?? 4100000001, job: a.ids?.job ?? 11300000001 }, scheduled: parseTime(m.now ?? DEFAULT_NOW)!, calls: {},
  };
  return { ...state, ci };
}
