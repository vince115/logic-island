import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/*
 * Phase F.1c: how the curriculum code tests run a program (the lesson's C++, Java, Python and JavaScript examples and
 * solutions).
 *
 * stdin is a file holding exactly the test input (no input: /dev/null), never a pipe and never the runner's own stdin.
 * Root cause (F.1c, reproduced): with the input written into a pipe by spawnSync, a program reading all of stdin
 * (`readFileSync(0)`) occasionally never saw end of input when many ran in parallel — A08's 400 KB test stalled 6 times
 * in 4,000 runs — and the synchronous call then blocked the whole test run (F.1b's 16-minute hang). A file always ends.
 *
 * The call is synchronous, so Vitest's own test timeout cannot stop it; every run has its own timeout, after which the
 * child is killed (SIGKILL) and the run fails with a clear error. stdout and stderr are captured, never written to the
 * runner's streams.
 */

/** Long enough for the slowest generated tests on a loaded machine; a program running longer is a failure. */
export const PROGRAM_TIMEOUT_MS = 20_000;
/** Compiling (g++, javac) takes longer than running. */
export const COMPILE_TIMEOUT_MS = 90_000;

/** No parameter properties: the file also runs under Node's type stripping (tests/run-program.test.ts). */
export class ProgramError extends Error {
  readonly pid: number | undefined;
  readonly timedOut: boolean;
  constructor(message: string, pid: number | undefined, timedOut: boolean) { super(message); this.pid = pid; this.timedOut = timedOut; }
}

export interface ProgramRun { stdout: string; pid: number }

export function runProcess(command: string, args: readonly string[], stdin = '', timeoutMs = PROGRAM_TIMEOUT_MS): ProgramRun {
  const dir = stdin ? mkdtempSync(join(tmpdir(), 'logic-island-stdin-')) : undefined;
  let fd: number | undefined;
  try {
    if (dir) { writeFileSync(join(dir, 'input.txt'), stdin); fd = openSync(join(dir, 'input.txt'), 'r'); }
    return finish(command, args, timeoutMs, spawnSync(command, args, {
      encoding: 'utf8', stdio: [fd ?? 'ignore', 'pipe', 'pipe'],
      timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 64 * 1024 * 1024,
    }));
  } finally {
    if (fd !== undefined) closeSync(fd);
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
}

function finish(command: string, args: readonly string[], timeoutMs: number, result: SpawnSyncReturns<string>): ProgramRun {
  const name = [command, ...args.slice(0, 1)].join(' ').slice(0, 80);
  const code = (result.error as NodeJS.ErrnoException | undefined)?.code;
  if (code === 'ETIMEDOUT') throw new ProgramError(`${name}: no result within ${timeoutMs} ms (killed)`, result.pid, true);
  if (result.error) throw new ProgramError(`${name}: ${result.error.message}`, result.pid, false);
  if (result.status !== 0) throw new ProgramError(`${name}: exit ${result.status ?? result.signal}\n${result.stderr}`, result.pid, false);
  return { stdout: result.stdout, pid: result.pid };
}
