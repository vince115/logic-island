import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { ProgramError, runProcess } from './support/run-program';

// Phase F.1c: the program runner of the code tests (tests/support/run-program.ts).
const node = (code: string, stdin?: string, timeoutMs?: number) => runProcess(process.execPath, ['-e', code], stdin, timeoutMs);
const READ_ALL = 'const d = require("fs").readFileSync(0, "utf8"); console.log(JSON.stringify(d));';
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

describe('program runner (F.1c)', () => {
  it('gives a program that reads stdin end of input at once when there is no test input', () => {
    const start = Date.now();
    expect(node(READ_ALL).stdout.trim()).toBe('""');
    expect(node(READ_ALL, '').stdout.trim()).toBe('""');
    expect(Date.now() - start).toBeLessThan(5_000);
  });

  it('gives the input as a file (never a pipe), so a large input always ends — the F.1c stall', () => {
    const kind = 'const fs = require("fs"); const s = fs.fstatSync(0); const d = fs.readFileSync(0, "utf8"); console.log(s.isFile() ? "file" : s.isFIFO() ? "pipe" : "other", d.length);';
    const big = '1 '.repeat(200_004);
    expect(node(kind, big).stdout.trim()).toBe(`file ${big.length}`);
    expect(node('console.log(require("fs").fstatSync(0).isCharacterDevice())').stdout.trim()).toBe('true');
  });

  it('passes the test input exactly, line by line', () => {
    expect(node(READ_ALL, '3\n1 2 3\n').stdout.trim()).toBe(JSON.stringify('3\n1 2 3\n'));
    expect(node('const [n, ...a] = require("fs").readFileSync(0, "utf8").trim().split(/\\s+/).map(Number); console.log(a.slice(0, n).reduce((s, x) => s + x, 0));', '3\n4 5 6\n').stdout.trim()).toBe('15');
  });

  it('never hands the runner\'s own stdin to the program, even when that stdin stays open', async () => {
    // A child Node process with a stdin pipe that is never closed runs the runner, like Vitest started without < /dev/null.
    const runner = join(process.cwd(), 'tests/support/run-program.ts');
    const script = `import('${runner}').then(m => { const r = m.runProcess(process.execPath, ['-e', ${JSON.stringify(READ_ALL)}], undefined, 5000); console.log(r.stdout.trim()); });`;
    const child = spawn(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', script], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', chunk => { out += chunk; });
    const code = await new Promise<number | null>(resolve => child.on('exit', resolve));
    child.stdin.destroy();
    expect([code, out.trim()]).toEqual([0, '""']);
  }, 15_000);

  it('stops a program that runs too long, kills it and says so; nothing is left running', () => {
    const start = Date.now();
    let error: unknown;
    try { node('setInterval(() => {}, 1000); while (true) {}', '', 500); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(ProgramError);
    expect((error as ProgramError).timedOut).toBe(true);
    expect((error as ProgramError).message).toMatch(/no result within 500 ms \(killed\)/);
    expect(Date.now() - start).toBeLessThan(5_000);
    expect(alive((error as ProgramError).pid!)).toBe(false);
    // A program that ends normally is gone too, and a failing one reports its exit and stderr.
    const done = node('console.log(1)');
    expect(alive(done.pid)).toBe(false);
    expect(() => node('console.error("bad input"); process.exit(3)')).toThrow(/exit 3\nbad input/);
  });
});
