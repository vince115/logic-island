import { parentOf, physicalPath, resolvePath, type FsNode, type FsState } from './fs';
import { advanceClock, type Ev } from './shell';
import type { CiCondition, CiTool } from './actions-model';

/*
 * Engine stage E28 (docs/curriculum/CICD0_E28_ACTIONS.md §6): CI tools, E23's BuildTool generalised. A lesson declares a
 * command (its exact words, e.g. npm test) and cases: the first case whose conditions hold on the files of the working
 * folder (and the environment) decides the output, the exit status, the files written (a JUnit report) and how many
 * seconds pass. So fixing the bug in the source makes the test pass, on the learner's machine and on a runner alike. A
 * flaky tool fails on given attempts: on a runner the run attempt, on the learner's machine the how-many-th call.
 */

const key = (t: CiTool) => t.command.join(' ');
/** The tool these words run on this machine (a runner has an attempt; the learner's machine does not). */
export function findTool(state: FsState, words: readonly string[]): CiTool | undefined {
  const ci = state.ci;
  if (!ci?.tools.length) return undefined;
  const onRunner = ci.attempt !== undefined;
  return ci.tools.find(t => t.command.length === words.length && t.command.every((w, i) => w === words[i]) && t.where !== (onRunner ? 'local' : 'runner'));
}

function holds(state: FsState, cwd: string, c: CiCondition, env: Readonly<Record<string, string>>): boolean {
  if (c.env !== undefined) return !!env[c.env] === (c.set ?? true);
  const node = state.nodes.get(physicalPath(state.nodes, resolvePath({ cwd, home: state.home }, c.path ?? '.'), true));
  if (c.absent) return !node;
  if (c.includes !== undefined) return node?.kind === 'file' && (node.content ?? '').includes(c.includes);
  if (c.excludes !== undefined) return node?.kind !== 'file' || !(node.content ?? '').includes(c.excludes);
  return !!node;
}

/** Runs a tool: its output, exit status, written files and time (the machine's clock moves on). */
export function runTool(state: FsState, tool: CiTool, env: Readonly<Record<string, string>>): { state: FsState; events: Ev[]; status: number } {
  const ci = state.ci!, name = key(tool), onRunner = ci.attempt !== undefined;
  const attempt = onRunner ? ci.attempt! : (ci.calls[name] ?? 0) + 1;
  let next: FsState = onRunner ? state : { ...state, ci: { ...ci, calls: { ...ci.calls, [name]: attempt } } };
  const cwd = physicalPath(state.nodes, state.cwd, true);
  const flaky = tool.flaky && tool.flaky.failOnAttempts.includes(attempt) ? tool.flaky : undefined;
  const c = flaky ? { ...flaky, writes: [] } : tool.cases.find(x => x.when.every(w => holds(state, cwd, w, env)));
  if (!c) return { state: next, events: [], status: 0 };
  const events: Ev[] = [];
  const text = (s: string) => (s.endsWith('\n') ? s : `${s}\n`);
  if (c.stdout) events.push({ fd: 1, data: text(c.stdout) });
  if (c.stderr) events.push({ fd: 2, data: text(c.stderr) });
  if (c.writes.length) {
    const nodes = new Map(next.nodes);
    const owner: Pick<FsNode, 'owner'> = { owner: next.user };
    for (const w of c.writes) {
      const path = resolvePath({ cwd, home: next.home }, w.path);
      const parts = parentOf(path).split('/').filter(Boolean);
      for (let k = 1; k <= parts.length; k++) {
        const d = `/${parts.slice(0, k).join('/')}`;
        if (!nodes.has(d)) nodes.set(d, { kind: 'dir', mode: 0o755, ...owner });
      }
      nodes.set(path, { kind: 'file', mode: 0o644, ...owner, content: w.content });
    }
    next = { ...next, nodes };
  }
  if (c.seconds > 0 && next.clock) next = advanceClock(next, c.seconds);
  return { state: next, events, status: c.exit };
}
