import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { RunnerError, bankState, checkBank, createWorkspace, listWorkspaces, missingImports, reclaim, removeWorkspace, snapshotBank, summarize, testFiles, updateMarker, type Counts, type Workspace } from './private-workspace';

/*
 * The private test runner (docs/exam-system/34 §2): runs the private bank's own tests against a public commit, in a
 * workspace of its own, and throws the workspace away.
 *
 *   LOGIC_ISLAND_PRIVATE_BANK=/abs/path pnpm trials:test-private [options] [-- <vitest arguments>]
 *     -- <file filter>…       run only the matching test files; -- --testTimeout=60000 and the like pass through
 *     --ref <commit>          the public commit to test with (default HEAD; committed files only, not the working tree)
 *     --node-modules <dir>    an installed node_modules for that commit (default: this checkout's)
 *     --tmp-root <dir>        where workspaces are made (default: the system temporary folder)
 *     --run-id <id>           name the workspace; refused if a workspace of that name exists
 *     --keep                  leave the workspace in place (its path is printed), for looking into a failure
 *     --exec <cmd> [args…]    run this command in the workspace instead of Vitest (read-only checks; anything it
 *                             writes to the bank is thrown away with the snapshot)
 *   pnpm trials:test-private --list | --reclaim [--tmp-root <dir>]
 *
 * What a run does: `git archive` of the commit into the workspace, a copy-on-write copy of node_modules, a snapshot
 * of the bank's files (no `.git`, real files) at private/question-bank — where the bank's tests expect to sit —
 * then Vitest there with the bank required. The private bank itself is only read, and is hashed before and after.
 * Nothing touches this checkout or any other worktree, and the environment variable is never needed outside the
 * command it is given on.
 *
 * The bank's tests import public modules. If the commit lacks one, the run stops before any test and names it
 * (exit 3): choose a commit that has it with --ref; the tests are never edited or skipped to fit.
 *
 * Exit codes: 0 passed, 1 tests failed, 2 usage, 3 the bank and the commit (or node_modules) do not fit,
 * 4 the run cannot be trusted (bank changed, not every bank test ran, cleanup refused), 129/130/143 interrupted.
 */
const argv = process.argv.slice(2);
const FLAGS = ['--keep', '--list', '--reclaim'], VALUES = ['--ref', '--node-modules', '--tmp-root', '--run-id'];
const opts: Record<string, string | true> = {};
let exec: string[] | undefined, vitestArgs: string[] = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--') { vitestArgs = argv.slice(i + 1); break; }
  if (a === '--exec') { exec = argv.slice(i + 1); break; }
  if (FLAGS.includes(a)) opts[a] = true;
  else if (VALUES.includes(a) && argv[i + 1] !== undefined) opts[a] = argv[++i];
  else { console.error(`unknown or incomplete argument ${a}`); process.exit(2); }
}
if (exec && !exec.length) { console.error('--exec needs a command'); process.exit(2); }
const str = (name: string) => typeof opts[name] === 'string' ? opts[name] as string : undefined;
const root = path.resolve(str('--tmp-root') ?? tmpdir());
const SIGNAL_EXIT: Record<string, number> = { SIGHUP: 129, SIGINT: 130, SIGTERM: 143 };

function housekeeping() {
  const found = opts['--reclaim'] ? reclaim(root) : { removed: [] as string[], kept: listWorkspaces(root) };
  for (const dir of found.removed) console.log(`removed  ${dir}`);
  for (const w of found.kept) console.log(`${w.status.padEnd(8)} ${w.dir}${w.marker ? ` (pid ${w.marker.pid}, started ${w.marker.startedAt}${w.marker.state === 'kept' ? ', kept' : ''})` : ` (${w.reason}; not touched)`}`);
  if (!found.removed.length && !found.kept.length) console.log(`no workspaces under ${root}`);
}

const run = (cmd: string, args: string[], cwd?: string, input?: Buffer) => {
  const r = spawnSync(cmd, args, { cwd, input, maxBuffer: 1 << 30, stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
  if (r.status !== 0) throw new RunnerError(4, `${cmd} ${args.slice(0, 3).join(' ')} failed: ${(r.stderr?.toString() || r.error?.message || `signal ${r.signal}`).trim().split('\n')[0]}`);
  return r.stdout;
};

let ws: Workspace | undefined, child: ChildProcess | undefined, interrupted: NodeJS.Signals | undefined;
const stopChild = (sig: NodeJS.Signals) => { if (child?.pid) try { process.kill(-child.pid, sig); } catch { /* already gone */ } };
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(sig, () => {
  if (interrupted) return;
  interrupted = sig;
  stopChild(sig);
  setTimeout(() => stopChild('SIGKILL'), 5000).unref();
});
/** Between the steps: an interrupt that arrived while one was running ends the run here. */
const checkpoint = () => { if (interrupted) throw new RunnerError(4, `interrupted (${interrupted})`); };

const line = (label: string, c: Counts) => `${label} ${c.files} file(s), ${c.passed + c.failed + c.skipped} tests: ${c.passed} passed, ${c.failed} failed, ${c.skipped} skipped`;

async function main(): Promise<number> {
  // Public CI never has the private bank (docs/exam-system/34 §4), and this runner's output is not for its logs.
  if (process.env.CI || process.env.GITHUB_ACTIONS) throw new RunnerError(2, 'the private test runner does not run in CI');
  const bank = checkBank(process.env.LOGIC_ISLAND_PRIVATE_BANK);
  const repo = run('git', ['rev-parse', '--show-toplevel'], process.cwd()).toString().trim();
  const ref = str('--ref') ?? 'HEAD';
  const resolved = spawnSync('git', ['-C', repo, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { encoding: 'utf8' });
  if (resolved.status !== 0) throw new RunnerError(2, `${ref} is not a commit in ${repo}`);
  const commit = resolved.stdout.trim();

  const modules = path.resolve(str('--node-modules') ?? path.join(repo, 'node_modules'));
  if (!existsSync(modules) || !statSync(modules).isDirectory()) throw new RunnerError(2, `no node_modules at ${modules}: install the dependencies, or name an installed folder with --node-modules`);
  const wanted = spawnSync('git', ['-C', repo, 'show', `${commit}:pnpm-lock.yaml`], { maxBuffer: 1 << 28 });
  const lock = path.join(path.dirname(modules), 'pnpm-lock.yaml');
  if (wanted.status === 0 && (!existsSync(lock) || !readFileSync(lock).equals(wanted.stdout)))
    throw new RunnerError(3, `${modules} was not installed for ${commit.slice(0, 7)} (its pnpm-lock.yaml differs from ${lock}): name a matching folder with --node-modules`);

  const stale = listWorkspaces(root).filter(w => w.status === 'stale').length;
  if (stale) console.log(`note: ${stale} stale workspace(s) under ${root}; pnpm trials:test-private --reclaim removes them`);
  const before = bankState(bank);
  ws = createWorkspace(root, { publicCommit: commit, bankHead: before.head }, str('--run-id'));
  const checkout = path.join(ws.dir, 'checkout'), snapshot = path.join(checkout, 'private', 'question-bank');
  console.log(`workspace:    ${ws.dir}`);
  console.log(`public code:  ${commit.slice(0, 7)} (${ref})`);
  console.log(`private bank: ${bank} @ ${before.head?.slice(0, 7) ?? 'not a git checkout'}${before.dirty ? ` + ${before.dirty} uncommitted path(s)` : ''}, ${before.files} files`);

  mkdirSync(checkout);
  run('tar', ['-xf', '-', '-C', checkout], undefined, run('git', ['-C', repo, 'archive', '--format=tar', commit]));
  if (existsSync(path.join(checkout, 'private'))) throw new RunnerError(4, `${commit.slice(0, 7)} tracks a private/ folder: this is not the public repository`);
  checkpoint();
  snapshotBank(bank, snapshot);
  checkpoint();

  const missing = missingImports(checkout, path.join(snapshot, 'tests'));
  if (missing.length) {
    console.error(`the private bank's tests need public modules that ${commit.slice(0, 7)} does not have:`);
    for (const m of missing) console.error(`  tests/${m.file} imports ${m.specifier}`);
    throw new RunnerError(3, 'the bank and this commit do not fit: run with --ref <a commit that has them>. No test was run.');
  }
  // Copy-on-write where the file system has it (APFS, Btrfs, XFS): an isolated node_modules without the disk cost.
  run('cp', process.platform === 'darwin' ? ['-cR', modules, path.join(checkout, 'node_modules')] : ['-R', '--reflink=auto', modules, path.join(checkout, 'node_modules')]);
  checkpoint();

  const reportAt = path.join(ws.dir, 'vitest-report.json');
  // The whole bank suite and the public check of the bank, unless file filters were given after -- (options there take the --name=value form).
  const narrowed = vitestArgs.some(a => !a.startsWith('-'));
  const own = existsSync(path.join(checkout, 'tests/trials-public-bank.test.ts')) ? ['tests/trials-public-bank.test.ts'] : [];
  const command = exec ?? [process.execPath, 'node_modules/vitest/vitest.mjs', 'run', ...(narrowed ? [] : ['private/question-bank/tests', ...own]),
    '--reporter=default', '--reporter=json', `--outputFile.json=${reportAt}`, ...vitestArgs];
  // The child reads the snapshot at its default place; the real bank's path is not passed on.
  const env: NodeJS.ProcessEnv = { ...process.env, LOGIC_ISLAND_REQUIRE_PRIVATE_BANK: '1' };
  delete env.LOGIC_ISLAND_PRIVATE_BANK;
  const running = spawn(command[0], command.slice(1), { cwd: checkout, env, stdio: 'inherit', detached: true });
  child = running;
  updateMarker(ws, { childPid: running.pid ?? null });
  if (interrupted) stopChild(interrupted);
  const status = await new Promise<number>(resolve => running.on('error', e => { console.error(String(e)); resolve(127); }).on('exit', (code, sig) => resolve(code ?? (sig ? 128 : 1))));
  child = undefined;
  checkpoint();

  let code = status ? 1 : 0;
  console.log('');
  if (!exec) {
    if (!existsSync(reportAt)) throw new RunnerError(4, 'Vitest wrote no report: the run did not finish');
    const c = summarize(JSON.parse(readFileSync(reportAt, 'utf8'))), expected = testFiles(path.join(snapshot, 'tests')).length;
    console.log(line('bank tests:  ', c.bank));
    console.log(line('public tests:', c.publicSide));
    console.log(`total:        ${c.bank.files + c.publicSide.files} file(s), ${[c.bank, c.publicSide].reduce((n, x) => n + x.passed + x.failed + x.skipped, 0)} tests`);
    // Every bank test file must have run. A run narrowed by file filters is the developer's call: it is said, not failed.
    if (c.bank.files !== expected) {
      console.error(`${narrowed ? 'note: ' : ''}only ${c.bank.files} of the bank's ${expected} test files ran`);
      if (!narrowed) code = 4;
    }
    if (c.bank.failed + c.publicSide.failed) code = code || 1;
  }
  const after = bankState(bank);
  if (after.digest !== before.digest || after.head !== before.head) { console.error(`the private bank at ${bank} changed during the run (by the run or by someone else): do not trust this result`); code = 4; }
  else console.log(`private bank: unchanged by the run (${after.files} files, same content hash)`);
  return code;
}

if (opts['--list'] || opts['--reclaim']) housekeeping();
else {
  let code: number;
  try { code = await main(); } catch (e) {
    if (!(e instanceof RunnerError)) throw e;
    if (!interrupted) console.error(e.message);
    code = e.code;
  } finally {
    if (ws && opts['--keep']) { updateMarker(ws, { state: 'kept' }); console.log(`kept:         ${ws.dir} (remove it with pnpm trials:test-private --reclaim)`); }
    else if (ws) try { removeWorkspace(ws.dir, ws.root, ws.token); console.log(`workspace:    removed`); } catch (e) { console.error(String(e instanceof Error ? e.message : e)); process.exitCode = 4; }
  }
  if (interrupted) { console.error(`interrupted by ${interrupted}`); code = SIGNAL_EXIT[interrupted]; }
  process.exitCode = process.exitCode || code;
}
