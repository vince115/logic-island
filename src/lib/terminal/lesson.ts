import { baseName, depthOf, groupOf, LIMITS, parentOf, resolvePath, subtreeOf, validName, type FsNode, type FsState } from './fs';
import { LAB_PROFILE, prompt, run, type Line, type ShellProfile } from './shell';

/*
 * LNX-0 (2026-11-22): the terminal lesson capability (docs/curriculum/LNX0_TERMINAL_CAPABILITY.md). A Linux lesson
 * describes small machines (a user, a working directory, a host name and a list of files) as data; its examples are
 * fixed transcripts replayed on a machine, and its exercises are checked by replaying the learner's commands and testing
 * the resulting machine (files, modes, owners, contents, the working directory, what was printed). Everything is pure:
 * the same engine as the P7 lab (fs.ts, shell.ts), nothing touches the host, and the checks never look at how the
 * commands were written, only at what they did.
 */

/** A file, folder or (from engine stage E1, not before) symbolic link of a machine. Paths are absolute and normalized. */
export interface TerminalFile {
  path: string;
  kind: 'dir' | 'file' | 'link';
  /** Permission bits, e.g. 0o644. */
  mode: number;
  owner: string;
  /** Default: the owner's name (a user private group). */
  group?: string;
  /** Files only; default empty. */
  content?: string;
  /** Links only (engine stage E1). */
  target?: string;
}

export interface TerminalMachine {
  id: string;
  title: string;
  /** Who is logged in; root's prompt ends in #. */
  user: string;
  /** Where the session starts. */
  cwd: string;
  /** Shown in the prompt; default logic-island. */
  host?: string;
  /** Default /home/<user> (/root for root); must be a folder of the machine. */
  home?: string;
  /** The user's groups; default only the group named after the user. */
  groups?: string[];
  /** Every file and folder but / (which is root's, 0755); each parent is listed before it is needed. */
  files: TerminalFile[];
}

/** One command of a transcript and exactly what the terminal prints for it (lines joined by \n; '' for nothing). */
export interface TerminalStep { command: string; output: string }
export interface TerminalExample { id: string; title: string; description: string; machine: string; steps: TerminalStep[] }

/**
 * What an exercise checks on the machine after the learner's commands. output: one of the learner's commands printed
 * exactly what the reference solution's last command prints on the same machine (with variants, on each of them too, so
 * a typed-in answer does not pass). unchanged: the path and everything under it are as they were at the start.
 */
export type TerminalCheck =
  | { kind: 'exists'; path: string; type?: 'file' | 'dir' }
  | { kind: 'absent'; path: string }
  | { kind: 'mode'; path: string; mode: number }
  | { kind: 'owner'; path: string; owner: string; group?: string }
  | { kind: 'content'; path: string; content: string }
  | { kind: 'cwd'; path: string }
  | { kind: 'output' }
  | { kind: 'unchanged'; path: string };
export const TERMINAL_CHECK_KINDS = ['exists', 'absent', 'mode', 'owner', 'content', 'cwd', 'output', 'unchanged'] as const satisfies readonly TerminalCheck['kind'][];

/** The same machine with some files replaced or added; the learner's commands are replayed on it as well. */
export interface TerminalVariant { label: string; files: TerminalFile[] }

export interface TerminalExercise {
  id: string;
  title: string;
  machine: string;
  statement: string;
  checks: TerminalCheck[];
  /** A reference solution: commands that pass every check on the machine and on every variant. */
  solution: string[];
  /** Typical wrong attempts; each must fail the checks. */
  mistakes: { commands: string[]; why: string }[];
  variants?: TerminalVariant[];
  hints: string[];
  explanation: string;
}

export interface TerminalLessonContent { machines: TerminalMachine[]; examples: TerminalExample[]; exercises: TerminalExercise[] }

/** How large lesson data may be, on top of the engine's LIMITS. */
export const TERMINAL_LIMITS = { machines: 8, steps: 30, solution: 30, variants: 4, session: 300 } as const;

const NAME = /^[a-z_][a-z0-9_-]{0,31}$/;
const HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const normalized = (path: string) => path.startsWith('/') && resolvePath({ cwd: '/', home: '/' }, path) === path;
const homeOf = (machine: Pick<TerminalMachine, 'user' | 'home'>) => machine.home ?? (machine.user === 'root' ? '/root' : `/home/${machine.user}`);

/** The machine as an engine state: / plus its files, its user, groups, host, home and working directory. */
export function machineState(machine: TerminalMachine): FsState {
  const nodes = new Map<string, FsNode>([['/', { kind: 'dir', mode: 0o755, owner: 'root' }]]);
  for (const f of machine.files) {
    nodes.set(f.path, {
      kind: f.kind === 'dir' ? 'dir' : 'file', mode: f.mode, owner: f.owner,
      ...(f.group !== undefined ? { group: f.group } : {}), ...(f.kind === 'file' ? { content: f.content ?? '' } : {}),
    });
  }
  return { nodes, cwd: machine.cwd, user: machine.user, home: homeOf(machine), ...(machine.host ? { host: machine.host } : {}), ...(machine.groups ? { groups: machine.groups } : {}) };
}

/** The machine with a variant's files replacing or adding to its own. */
export function variantMachine(machine: TerminalMachine, variant: TerminalVariant): TerminalMachine {
  const paths = new Set(variant.files.map(f => f.path));
  return { ...machine, files: [...machine.files.filter(f => !paths.has(f.path)), ...variant.files] };
}

export interface ReplayedStep { prompt: string; command: string; lines: Line[]; output: string }
/** Runs the commands one after another from a machine (or a state) and returns every prompt, command and output. */
export function replay(from: TerminalMachine | FsState, commands: readonly string[], profile: ShellProfile = LAB_PROFILE): { state: FsState; steps: ReplayedStep[] } {
  let state = 'files' in from ? machineState(from) : from;
  const steps: ReplayedStep[] = [];
  for (const command of commands) {
    const before = prompt(state), result = run(state, command, profile);
    steps.push({ prompt: before, command, lines: result.lines, output: result.lines.map(l => l.text).join('\n') });
    state = result.state;
  }
  return { state, steps };
}

const sameNode = (a: FsNode | undefined, b: FsNode | undefined) =>
  a === b || (!!a && !!b && a.kind === b.kind && a.mode === b.mode && a.owner === b.owner && groupOf(a) === groupOf(b) && (a.content ?? '') === (b.content ?? ''));
const octal = (mode: number) => mode.toString(8).padStart(3, '0');

/** What a check asks for, in words. */
export function describeCheck(check: TerminalCheck): string {
  switch (check.kind) {
    case 'exists': return `${check.path} 應該存在${check.type === 'dir' ? '（目錄）' : check.type === 'file' ? '（檔案）' : ''}`;
    case 'absent': return `${check.path} 應該不存在`;
    case 'mode': return `${check.path} 的權限應該是 ${octal(check.mode)}`;
    case 'owner': return `${check.path} 的擁有者應該是 ${check.owner}${check.group ? `、群組是 ${check.group}` : ''}`;
    case 'content': return `${check.path} 的內容應該符合題目`;
    case 'cwd': return `目前位置應該是 ${check.path}`;
    case 'output': return '應該有一個指令印出題目要的輸出';
    case 'unchanged': return `${check.path} 應該維持原樣`;
  }
}

/** Why a check fails on a state (start: the machine before the commands; reference: the solution's last output), or null when it holds. */
function failure(check: TerminalCheck, start: FsState, end: FsState, outputs: string[], reference: string): string | null {
  const node = 'path' in check ? end.nodes.get(check.path) : undefined;
  const kindName = (n: FsNode) => n.kind === 'dir' ? '目錄' : '檔案';
  switch (check.kind) {
    case 'exists':
      if (!node) return '它還不存在';
      return check.type && node.kind !== check.type ? `它是${kindName(node)}` : null;
    case 'absent': return node ? '它還在' : null;
    case 'mode':
      if (!node) return '它不存在';
      return (node.mode & 0o777) === check.mode ? null : `目前是 ${octal(node.mode & 0o777)}`;
    case 'owner':
      if (!node) return '它不存在';
      return node.owner === check.owner && (!check.group || groupOf(node) === check.group) ? null : `目前是 ${node.owner}:${groupOf(node)}`;
    case 'content':
      if (!node) return '它不存在';
      if (node.kind !== 'file') return '它不是檔案';
      return node.content === check.content ? null : '內容不同';
    case 'cwd': return end.cwd === check.path ? null : `目前在 ${end.cwd}`;
    case 'output': return outputs.includes(reference) ? null : '還沒有指令印出這個輸出';
    case 'unchanged': {
      const paths = new Set([...subtreeOf(start.nodes, check.path), ...subtreeOf(end.nodes, check.path)]);
      return [...paths].every(p => sameNode(start.nodes.get(p), end.nodes.get(p))) ? null : '它被改動了';
    }
  }
}

export interface TerminalCheckResult { check: TerminalCheck; ok: boolean; message: string }
export interface TerminalVerdict { ok: boolean; results: TerminalCheckResult[] }

/**
 * Replays the commands on the exercise's machine and on each variant and tests every check there. A check passes only
 * when it holds on all of them; the message names the first machine where it does not.
 */
export function checkTerminalExercise(exercise: TerminalExercise, machines: readonly TerminalMachine[], commands: readonly string[], profile: ShellProfile = LAB_PROFILE): TerminalVerdict {
  const base = machines.find(m => m.id === exercise.machine);
  if (!base) throw new Error(`unknown machine ${exercise.machine}`);
  const runs = [{ label: '', machine: base }, ...(exercise.variants ?? []).map(v => ({ label: v.label, machine: variantMachine(base, v) }))].map(({ label, machine }) => {
    const start = machineState(machine), learner = replay(start, commands, profile);
    const reference = replay(start, exercise.solution, profile).steps.at(-1)?.output ?? '';
    return { label, start, end: learner.state, outputs: learner.steps.map(s => s.output), reference };
  });
  const results = exercise.checks.map(check => {
    for (const r of runs) {
      const why = failure(check, r.start, r.end, r.outputs, r.reference);
      if (why) return { check, ok: false, message: `${describeCheck(check)}，但${why}${r.label ? `（換成「${r.label}」的機器重新執行時）` : ''}` };
    }
    return { check, ok: true, message: describeCheck(check) };
  });
  return { ok: results.every(r => r.ok), results };
}

/** Problems with one machine's data (empty when it can be built). */
export function machineProblems(machine: TerminalMachine): string[] {
  const problems: string[] = [];
  const fail = (what: string) => problems.push(`machine ${machine.id}: ${what}`);
  if (!machine.id.trim() || !machine.title.trim()) fail('needs an id and a title');
  if (!NAME.test(machine.user)) fail(`invalid user ${machine.user}`);
  if (machine.host !== undefined && !HOST.test(machine.host)) fail(`invalid host ${machine.host}`);
  for (const g of machine.groups ?? []) if (!NAME.test(g)) fail(`invalid group ${g}`);
  if (machine.files.length + 1 > LIMITS.nodes) fail(`more than ${LIMITS.nodes} nodes`);
  const kinds = new Map<string, TerminalFile['kind']>([['/', 'dir']]);
  for (const f of machine.files) {
    const at = `file ${f.path}`;
    if (!normalized(f.path) || f.path === '/') { fail(`${at}: not an absolute, normalized path other than /`); continue; }
    if (kinds.has(f.path)) { fail(`${at}: listed twice`); continue; }
    if (!validName(baseName(f.path)) || depthOf(f.path) > LIMITS.depth) fail(`${at}: name too long or too deep`);
    if (kinds.get(parentOf(f.path)) !== 'dir') fail(`${at}: its parent folder is not listed before it`);
    if (!['dir', 'file', 'link'].includes(f.kind)) fail(`${at}: unknown kind ${f.kind}`);
    if (f.kind === 'link') fail(`${at}: symbolic links need engine stage E1 (ln -s)`);
    if (!Number.isInteger(f.mode) || f.mode < 0 || f.mode > 0o777) fail(`${at}: mode must be 0..0777`);
    if (!NAME.test(f.owner) || (f.group !== undefined && !NAME.test(f.group))) fail(`${at}: invalid owner or group`);
    if (f.kind !== 'file' && f.content !== undefined) fail(`${at}: only a file has content`);
    if (f.kind !== 'link' && f.target !== undefined) fail(`${at}: only a link has a target`);
    if ((f.content ?? '').length > LIMITS.fileLength) fail(`${at}: content longer than ${LIMITS.fileLength}`);
    kinds.set(f.path, f.kind);
  }
  if (!normalized(machine.cwd) || kinds.get(machine.cwd) !== 'dir') fail(`the working directory ${machine.cwd} is not a folder of the machine`);
  if (!normalized(homeOf(machine)) || kinds.get(homeOf(machine)) !== 'dir') fail(`the home ${homeOf(machine)} is not a folder of the machine`);
  return problems;
}

/**
 * Every problem with a lesson's terminal content: machines that cannot be built, unknown machines, examples whose stated
 * output is not exactly what the engine prints, and exercises whose reference solution fails (on the machine or a
 * variant), whose initial machine already passes, whose typical mistakes pass, or whose output check could be passed by
 * typing the answer (no variant prints something else).
 */
export function terminalContentProblems(content: TerminalLessonContent, profile: ShellProfile = LAB_PROFILE): string[] {
  const problems: string[] = [];
  const fail = (what: string) => problems.push(what);
  const { machines, examples, exercises } = content;
  if (!machines.length || machines.length > TERMINAL_LIMITS.machines) fail(`terminal content needs 1..${TERMINAL_LIMITS.machines} machines`);
  const ids = new Set<string>();
  for (const m of machines) {
    if (ids.has(m.id)) fail(`machine ${m.id}: duplicate id`);
    ids.add(m.id);
    problems.push(...machineProblems(m));
  }
  const valid = new Map(machines.filter(m => !machineProblems(m).length).map(m => [m.id, m]));
  const commandProblem = (c: string) => !c.trim() ? 'an empty command' : c.length > LIMITS.input ? `a command longer than ${LIMITS.input}` : null;
  for (const e of examples) {
    const at = `example ${e.id}`;
    if (!ids.has(e.machine)) { fail(`${at}: unknown machine ${e.machine}`); continue; }
    if (!e.steps.length || e.steps.length > TERMINAL_LIMITS.steps) fail(`${at}: needs 1..${TERMINAL_LIMITS.steps} steps`);
    const bad = e.steps.map(s => commandProblem(s.command)).find(Boolean);
    if (bad) { fail(`${at}: ${bad}`); continue; }
    const machine = valid.get(e.machine);
    if (!machine) continue;
    replay(machine, e.steps.map(s => s.command), profile).steps.forEach((s, i) => {
      if (s.output !== e.steps[i].output) fail(`${at}: step ${i + 1} (${e.steps[i].command}) prints ${JSON.stringify(s.output)}, not ${JSON.stringify(e.steps[i].output)}`);
    });
  }
  for (const x of exercises) {
    const at = `exercise ${x.id}`;
    if (!ids.has(x.machine)) { fail(`${at}: unknown machine ${x.machine}`); continue; }
    if (!x.title.trim() || !x.explanation.trim()) fail(`${at}: needs a title and an explanation`);
    if (!x.checks.length) fail(`${at}: needs at least one check`);
    for (const c of x.checks) {
      if (!(TERMINAL_CHECK_KINDS as readonly string[]).includes(c.kind)) fail(`${at}: unknown check ${c.kind}`);
      if ('path' in c && !normalized(c.path)) fail(`${at}: check path ${c.path} is not absolute and normalized`);
      if (c.kind === 'mode' && (!Number.isInteger(c.mode) || c.mode < 0 || c.mode > 0o777)) fail(`${at}: check mode must be 0..0777`);
      if (c.kind === 'owner' && (!NAME.test(c.owner) || (c.group !== undefined && !NAME.test(c.group)))) fail(`${at}: invalid owner or group in a check`);
    }
    if (!x.solution.length || x.solution.length > TERMINAL_LIMITS.solution) fail(`${at}: the solution needs 1..${TERMINAL_LIMITS.solution} commands`);
    if (!x.mistakes.length) fail(`${at}: needs at least one typical mistake`);
    if ((x.variants?.length ?? 0) > TERMINAL_LIMITS.variants) fail(`${at}: at most ${TERMINAL_LIMITS.variants} variants`);
    const bad = [...x.solution, ...x.mistakes.flatMap(m => m.commands)].map(commandProblem).find(Boolean);
    if (bad) { fail(`${at}: ${bad}`); continue; }
    const machine = valid.get(x.machine);
    if (!machine) continue;
    let variantsOk = true;
    for (const v of x.variants ?? []) {
      if (!v.label.trim()) fail(`${at}: a variant needs a label`);
      const p = machineProblems(variantMachine(machine, v));
      if (p.length) { variantsOk = false; for (const q of p) fail(`${at}: variant ${v.label}: ${q}`); }
    }
    if (!variantsOk) continue;
    const errors = replay(machine, x.solution, profile).steps.filter(s => s.lines.some(l => l.kind === 'err'));
    for (const s of errors) fail(`${at}: the solution's command ${s.command} prints an error: ${s.output}`);
    const verdict = checkTerminalExercise(x, machines, x.solution, profile);
    for (const r of verdict.results) if (!r.ok) fail(`${at}: the solution fails: ${r.message}`);
    if (checkTerminalExercise(x, machines, [], profile).ok) fail(`${at}: the machine passes before any command`);
    for (const m of x.mistakes) if (checkTerminalExercise(x, machines, m.commands, profile).ok) fail(`${at}: the typical mistake "${m.why}" passes the check`);
    if (x.checks.some(c => c.kind === 'output')) {
      const outputOf = (m: TerminalMachine) => replay(m, x.solution, profile).steps.at(-1)?.output ?? '';
      const reference = outputOf(machine);
      if (!reference) fail(`${at}: an output check needs a solution whose last command prints something`);
      if (!(x.variants ?? []).some(v => outputOf(variantMachine(machine, v)) !== reference)) fail(`${at}: an output check needs a variant whose reference output differs (or typing the answer would pass)`);
    }
  }
  return problems;
}
