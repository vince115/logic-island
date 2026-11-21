import { execFileSync, spawn } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { MARKER, PREFIX, RunnerError, checkBank, createWorkspace, digestTree, listWorkspaces, missingImports, notOwned, readMarker, reclaim, removeWorkspace, snapshotBank, summarize, testFiles,
  type Probe } from '../scripts/trials/private-workspace';

// The private test runner (docs/exam-system/34 §2), against a made-up repository and a made-up "bank": no private
// question is read here, and nothing here needs the private bank. What the tests prove is the handling around a run —
// the snapshot, the workspace's ownership, the cleanup on failure and on a signal, and that the bank is only read.
const ROOT = path.join(__dirname, '..');
const scratch = realpathSync(mkdtempSync(path.join(tmpdir(), 'trials-private-runner-')));
const strays: number[] = []; // test processes started detached: ended here whatever a failing test left behind
afterAll(() => {
  for (const pid of strays) try { process.kill(-pid, 'SIGKILL'); } catch { /* already gone */ }
  rmSync(scratch, { recursive: true, force: true });
});
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_NAME: 'fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' };
const git = (dir: string, ...a: string[]) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: GIT_ENV, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const write = (file: string, text: string) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, text); };
let n = 0;
const fresh = (name: string) => { const dir = path.join(scratch, `${name}-${n++}`); mkdirSync(dir); return dir; };

/** A bank-shaped folder: a batch, a test that imports the public code the way the real ones do, and a `.git`. */
function bank(testBody = "import { present } from '@/lib/present';\nimport helper from '../../../tests/helpers/h';\nimport { it } from 'vitest';\nit('x', () => [present, helper]);\n") {
  const dir = fresh('bank');
  write(path.join(dir, 'generated/a.json'), '{"questions":[]}');
  write(path.join(dir, 'tests/a.test.ts'), testBody);
  write(path.join(dir, 'tests/fixtures/f.json'), '{}');
  write(path.join(dir, '.git/HEAD'), 'not a real repository');
  return dir;
}
/** A public-repository-shaped git checkout with one commit and an (empty) installed node_modules. */
function repo() {
  const dir = fresh('repo');
  git(dir, 'init', '-q', '-b', 'main');
  write(path.join(dir, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n");
  write(path.join(dir, '.gitignore'), 'node_modules\n/private/\n');
  write(path.join(dir, 'src/lib/present.ts'), 'export const present = 1;\n');
  write(path.join(dir, 'tests/helpers/h.ts'), 'export default 1;\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'public');
  write(path.join(dir, 'node_modules/.keep'), '');
  return dir;
}
const script = (name: string, body: string) => { const file = path.join(scratch, `${name}-${n++}.mjs`); writeFileSync(file, body); return file; };
const errorCode = (fn: () => unknown) => { try { fn(); } catch (e) { return e instanceof RunnerError ? e.code : -1; } return 0; };

describe('private bank: checked, snapshotted, never changed', () => {
  it('accepts only an absolute path to a bank-shaped folder', () => {
    const b = bank();
    expect(checkBank(b)).toBe(b);
    expect(errorCode(() => checkBank(undefined))).toBe(2);
    expect(errorCode(() => checkBank(''))).toBe(2);
    expect(errorCode(() => checkBank('relative/bank'))).toBe(2);
    expect(errorCode(() => checkBank(path.join(scratch, 'nowhere')))).toBe(2);
    const empty = fresh('empty');
    expect(errorCode(() => checkBank(empty))).toBe(2);
  });

  it('copies real files without .git and leaves the source as it was', () => {
    const b = bank(), dest = path.join(fresh('snap'), 'private/question-bank'), before = digestTree(b);
    expect(snapshotBank(b, dest)).toBe(3);
    expect(existsSync(path.join(dest, '.git'))).toBe(false);
    expect(lstatSync(dest).isSymbolicLink()).toBe(false);
    expect(lstatSync(path.join(dest, 'generated/a.json')).isFile()).toBe(true);
    expect(digestTree(dest)).toEqual(before);
    expect(digestTree(b)).toEqual(before);
    expect(readFileSync(path.join(b, '.git/HEAD'), 'utf8')).toBe('not a real repository');
    expect(testFiles(path.join(dest, 'tests'))).toEqual(['a.test.ts']);
  });

  it('refuses a bank that holds a symlink', () => {
    const b = bank();
    symlinkSync(path.join(b, 'generated/a.json'), path.join(b, 'generated/link.json'));
    expect(errorCode(() => snapshotBank(b, path.join(fresh('snap'), 'q')))).toBe(2);
  });

  it('a change of content, a new file and a removed file each change the digest', () => {
    const b = bank(), before = digestTree(b).digest;
    writeFileSync(path.join(b, 'generated/a.json'), '{"questions":[1]}');
    const edited = digestTree(b).digest;
    writeFileSync(path.join(b, 'generated/b.json'), '{}');
    const added = digestTree(b).digest;
    rmSync(path.join(b, 'tests/fixtures/f.json'));
    expect(new Set([before, edited, added, digestTree(b).digest]).size).toBe(4);
  });
});

describe('version fit: the modules the bank tests need from the public commit', () => {
  it('names each public module that is missing, and nothing that is there', () => {
    const checkout = fresh('checkout');
    write(path.join(checkout, 'src/lib/present.ts'), '');
    write(path.join(checkout, 'src/content/index.ts'), '');
    write(path.join(checkout, 'src/data.json'), '{}');
    write(path.join(checkout, 'tests/helpers/h.ts'), '');
    const tests = path.join(checkout, 'private/question-bank/tests');
    write(path.join(tests, 'ok.test.ts'), "import a from '@/lib/present';\nimport b from '@/content';\nimport c from '@/data.json';\nimport d from '../../../tests/helpers/h';\nimport { it } from 'vitest';\nimport fs from 'node:fs';\n");
    write(path.join(tests, 'bad.test.tsx'), "import x from '@/lib/absent';\nimport y from '../../../tests/helpers/none';\nconst z = await import('@/lib/later');\n");
    expect(missingImports(checkout, tests)).toEqual([
      { file: 'bad.test.tsx', specifier: '@/lib/absent' }, { file: 'bad.test.tsx', specifier: '../../../tests/helpers/none' }, { file: 'bad.test.tsx', specifier: '@/lib/later' }]);
  });
});

describe('the run report: bank tests and public tests counted apart', () => {
  it('splits files and tests by where the file sits', () => {
    const t = (...status: string[]) => status.map(s => ({ status: s }));
    expect(summarize({ testResults: [
      { name: '/w/checkout/private/question-bank/tests/a.test.ts', assertionResults: t('passed', 'passed', 'failed') },
      { name: '/w/checkout/private/question-bank/tests/b.test.tsx', assertionResults: t('passed', 'skipped') },
      { name: '/w/checkout/tests/trials-public-bank.test.ts', assertionResults: t('passed', 'pending') }] })).toEqual({
      bank: { files: 2, passed: 3, failed: 1, skipped: 1 }, publicSide: { files: 1, passed: 1, failed: 0, skipped: 1 } });
    expect(summarize({})).toEqual({ bank: { files: 0, passed: 0, failed: 0, skipped: 0 }, publicSide: { files: 0, passed: 0, failed: 0, skipped: 0 } });
  });
});

describe('workspaces: unique, marked, and only a marked one is ever deleted', () => {
  const info = { publicCommit: 'c'.repeat(40), bankHead: null };

  it('creates a private folder with a marker, a different one each time', () => {
    const root = fresh('root'), a = createWorkspace(root, info), b = createWorkspace(root, info);
    expect(a.dir).not.toBe(b.dir);
    expect(path.dirname(a.dir)).toBe(root);
    expect(path.basename(a.dir).startsWith(PREFIX)).toBe(true);
    expect(statSync(a.dir).mode & 0o777).toBe(0o700);
    expect(readMarker(a.dir)).toMatchObject({ runId: a.runId, token: a.token, pid: process.pid, state: 'running', publicCommit: info.publicCommit });
    expect(a.token).not.toBe(b.token);
  });

  it('refuses a taken name and leaves what is there alone', () => {
    const root = fresh('root'), taken = path.join(root, `${PREFIX}mine`);
    write(path.join(taken, 'keep.txt'), 'someone else');
    expect(errorCode(() => createWorkspace(root, info, 'mine'))).toBe(2);
    expect(readFileSync(path.join(taken, 'keep.txt'), 'utf8')).toBe('someone else');
    expect(existsSync(path.join(taken, MARKER))).toBe(false);
    expect(errorCode(() => createWorkspace(root, info, '../escape'))).toBe(2);
    expect(errorCode(() => createWorkspace(path.join(root, 'absent'), info))).toBe(2);
  });

  it('draws another name when a generated one collides', () => {
    const root = fresh('root'), ids = ['same', 'same', 'other'];
    mkdirSync(path.join(root, `${PREFIX}same`));
    const ws = createWorkspace(root, info, undefined, () => ids.shift()!);
    expect(ws.runId).toBe('other');
    expect(readdirSync(path.join(root, `${PREFIX}same`))).toEqual([]);
  });

  it('deletes its own workspace and nothing else', () => {
    const root = fresh('root'), mine = createWorkspace(root, info), other = createWorkspace(root, info);
    const plain = path.join(root, `${PREFIX}plain`), link = path.join(root, `${PREFIX}link`), outside = createWorkspace(fresh('elsewhere'), info);
    write(path.join(plain, 'data.txt'), 'x');
    symlinkSync(other.dir, link);
    const renamed = path.join(root, 'not-a-workspace');
    mkdirSync(renamed);
    writeFileSync(path.join(renamed, MARKER), readFileSync(path.join(mine.dir, MARKER)));

    expect(notOwned(mine.dir, root, mine.token)).toBeUndefined();
    for (const [dir, token] of [[plain, undefined], [link, undefined], [renamed, undefined], [outside.dir, undefined], [other.dir, mine.token], [path.join(root, `${PREFIX}gone`), undefined]] as const) {
      expect(notOwned(dir, root, token), dir).toBeTypeOf('string');
      expect(errorCode(() => removeWorkspace(dir, root, token)), dir).toBe(4);
    }
    expect(existsSync(path.join(plain, 'data.txt'))).toBe(true);
    expect(existsSync(other.dir) && existsSync(outside.dir) && existsSync(renamed)).toBe(true);

    write(path.join(mine.dir, 'checkout/deep/file.txt'), 'x');
    removeWorkspace(mine.dir, root, mine.token);
    expect(existsSync(mine.dir)).toBe(false);
    expect(existsSync(other.dir)).toBe(true);
  });

  it('lists running, stale and unknown folders, and reclaims only the stale ones', () => {
    const root = fresh('root'), live = createWorkspace(root, info, 'live'), dead = createWorkspace(root, info, 'dead'), orphan = createWorkspace(root, info, 'orphan');
    const unknown = path.join(root, `${PREFIX}unknown`);
    write(path.join(unknown, 'data.txt'), 'x');
    const rewrite = (dir: string, patch: object) => writeFileSync(path.join(dir, MARKER), JSON.stringify({ ...readMarker(dir), ...patch }));
    rewrite(live.dir, { pid: 111 });
    rewrite(dead.dir, { pid: 222, childPid: 223 });
    rewrite(orphan.dir, { pid: 333, childPid: 334 }); // the runner is gone, its test process is not
    const probe: Probe = { alive: pid => pid === 111 || pid === 222, isRunner: pid => pid === 111, groupAlive: pid => pid === 334 };
    expect(listWorkspaces(root, probe).map(w => [path.basename(w.dir).slice(PREFIX.length), w.status])).toEqual([['dead', 'stale'], ['live', 'running'], ['orphan', 'running'], ['unknown', 'unknown']]);

    const { removed, kept } = reclaim(root, probe);
    expect(removed).toEqual([dead.dir]);
    expect(kept.map(w => w.status).sort()).toEqual(['running', 'running', 'unknown']);
    expect(existsSync(dead.dir)).toBe(false);
    expect(existsSync(live.dir) && existsSync(orphan.dir) && existsSync(path.join(unknown, 'data.txt'))).toBe(true);
    expect(listWorkspaces(path.join(root, 'absent'), probe)).toEqual([]);
  });
});

// The command itself, in a made-up repository. --exec stands in for Vitest (no dependencies are installed here).
const CLI = ['--experimental-transform-types', '--no-warnings', '--import', path.join(ROOT, 'scripts/trials/register.mjs'), path.join(ROOT, 'scripts/trials/test-private.ts')];
interface Run { code: number | null; out: string; pid: number }
function start(cwd: string, args: string[], env: Record<string, string | undefined>) {
  const child = spawn(process.execPath, [...CLI, ...args], { cwd, env: { ...GIT_ENV, CI: '', GITHUB_ACTIONS: '', LOGIC_ISLAND_PRIVATE_BANK: undefined, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  // 'close' waits for the output pipes; a killed runner's orphaned test process keeps them open, so 'exit' also ends the wait.
  const done = new Promise<Run>(resolve => {
    child.on('close', code => resolve({ code, out, pid: child.pid! }));
    child.on('exit', code => setTimeout(() => resolve({ code, out, pid: child.pid! }), 500));
  });
  return { child, done };
}
const runner = (cwd: string, args: string[], env: Record<string, string | undefined>) => start(cwd, args, env).done;
const until = async (ok: () => boolean, what: string) => { for (let i = 0; i < 400; i++) { if (ok()) return; await new Promise(r => setTimeout(r, 25)); } throw new Error(`timed out waiting for ${what}`); };
const workspaces = (root: string) => readdirSync(root).filter(f => f.startsWith(PREFIX));
const gone = (pid: number) => { try { process.kill(pid, 0); return false; } catch { return true; } };
const WAIT = (ready: string) => script('wait', `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(ready)}, String(process.pid));\nsetInterval(() => {}, 1000);\n`);

describe('trials:test-private (the command)', { timeout: 60_000 }, () => {
  it('refuses to start without a usable bank, and in CI', async () => {
    const r = repo(), root = fresh('root'), b = bank();
    for (const env of [{}, { LOGIC_ISLAND_PRIVATE_BANK: path.join(scratch, 'nowhere') }, { LOGIC_ISLAND_PRIVATE_BANK: 'relative/bank' }, { LOGIC_ISLAND_PRIVATE_BANK: b, CI: 'true' },
      { LOGIC_ISLAND_PRIVATE_BANK: b, GITHUB_ACTIONS: 'true' }]) {
      const run = await runner(r, ['--tmp-root', root, '--exec', 'true'], env);
      expect(run.code, run.out).toBe(2);
    }
    expect((await runner(r, ['--tmp-root', root, '--bogus'], { LOGIC_ISLAND_PRIVATE_BANK: b })).code).toBe(2);
    expect((await runner(r, ['--tmp-root', root, '--ref', 'no-such-ref', '--exec', 'true'], { LOGIC_ISLAND_PRIVATE_BANK: b })).code).toBe(2);
    expect(workspaces(root)).toEqual([]);
  });

  it('runs in a workspace of its own: the commit, a real snapshot without .git, the bank path not passed on', async () => {
    const r = repo(), root = fresh('root'), b = bank(), out = path.join(scratch, `probe-${n++}.json`), before = digestTree(b);
    writeFileSync(path.join(r, 'uncommitted.txt'), 'working tree only');
    const probe = script('probe', `import { existsSync, lstatSync, writeFileSync } from 'node:fs';
writeFileSync(process.env.OUT, JSON.stringify({ cwd: process.cwd(), bankEnv: process.env.LOGIC_ISLAND_PRIVATE_BANK ?? null, required: process.env.LOGIC_ISLAND_REQUIRE_PRIVATE_BANK ?? null,
  snapshot: lstatSync('private/question-bank/generated/a.json').isFile(), link: lstatSync('private/question-bank').isSymbolicLink(), git: existsSync('private/question-bank/.git'),
  modules: existsSync('node_modules/.keep'), tracked: existsSync('src/lib/present.ts'), uncommitted: existsSync('uncommitted.txt') }));\n`);
    const run = await runner(r, ['--tmp-root', root, '--exec', process.execPath, probe], { LOGIC_ISLAND_PRIVATE_BANK: b, OUT: out });
    expect(run.code, run.out).toBe(0);
    const seen = JSON.parse(readFileSync(out, 'utf8'));
    expect(seen).toMatchObject({ bankEnv: null, required: '1', snapshot: true, link: false, git: false, modules: true, tracked: true, uncommitted: false });
    expect(path.dirname(path.dirname(seen.cwd))).toBe(root);
    expect(seen.cwd.startsWith(r)).toBe(false);
    expect(workspaces(root)).toEqual([]);
    expect(digestTree(b)).toEqual(before);
    expect(git(r, 'status', '--porcelain')).toBe('?? uncommitted.txt');
    expect(existsSync(path.join(r, 'private'))).toBe(false);
    expect(run.out).toMatch(/private bank: unchanged by the run/);
  });

  it('stops before any test when the commit lacks a module the bank tests import (exit 3)', async () => {
    const r = repo(), root = fresh('root'), out = path.join(scratch, `ran-${n++}`);
    const b = bank("import { it } from 'vitest';\nimport x from '@/lib/absent';\nit('x', () => x);\n");
    const run = await runner(r, ['--tmp-root', root, '--exec', process.execPath, script('ran', `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(out)}, '');\n`)], { LOGIC_ISLAND_PRIVATE_BANK: b });
    expect(run.code, run.out).toBe(3);
    expect(run.out).toMatch(/tests\/a\.test\.ts imports @\/lib\/absent/);
    expect(run.out).toMatch(/No test was run/);
    expect(existsSync(out)).toBe(false);
    expect(workspaces(root)).toEqual([]);
  });

  it('refuses a node_modules installed for another lockfile (exit 3)', async () => {
    const r = repo(), root = fresh('root');
    writeFileSync(path.join(r, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n# another install\n");
    const run = await runner(r, ['--tmp-root', root, '--exec', 'true'], { LOGIC_ISLAND_PRIVATE_BANK: bank() });
    expect(run.code, run.out).toBe(3);
    expect(run.out).toMatch(/--node-modules/);
    expect(workspaces(root)).toEqual([]);
  });

  it('removes the workspace when the tests fail, and reports the failure', async () => {
    const r = repo(), root = fresh('root');
    const run = await runner(r, ['--tmp-root', root, '--exec', process.execPath, script('fail', 'process.exit(7);\n')], { LOGIC_ISLAND_PRIVATE_BANK: bank() });
    expect(run.code, run.out).toBe(1);
    expect(workspaces(root)).toEqual([]);
  });

  it('keeps the workspace only when asked, and reclaims it afterwards', async () => {
    const r = repo(), root = fresh('root');
    const run = await runner(r, ['--tmp-root', root, '--keep', '--exec', 'true'], { LOGIC_ISLAND_PRIVATE_BANK: bank() });
    expect(run.code, run.out).toBe(0);
    const [kept] = workspaces(root);
    expect(readMarker(path.join(root, kept))?.state).toBe('kept');
    expect(existsSync(path.join(root, kept, 'checkout/private/question-bank/generated/a.json'))).toBe(true);
    expect((await runner(r, ['--tmp-root', root, '--list'], {})).out).toMatch(/^stale .*kept\)$/m);
    expect((await runner(r, ['--tmp-root', root, '--reclaim'], {})).out).toMatch(/^removed /m);
    expect(workspaces(root)).toEqual([]);
  });

  for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143]] as const) it(`cleans up when interrupted by ${sig}`, async () => {
    const r = repo(), root = fresh('root'), ready = path.join(scratch, `ready-${n++}`);
    const { child, done } = start(r, ['--tmp-root', root, '--exec', process.execPath, WAIT(ready)], { LOGIC_ISLAND_PRIVATE_BANK: bank() });
    await until(() => existsSync(ready), 'the test process');
    const testPid = Number(readFileSync(ready, 'utf8'));
    strays.push(testPid);
    expect(workspaces(root)).toHaveLength(1);
    child.kill(sig);
    const run = await done;
    expect(run.code, run.out).toBe(code);
    expect(workspaces(root)).toEqual([]);
    await until(() => gone(testPid), 'the test process to end');
  });

  it('two runs at once do not share or disturb a workspace', async () => {
    const r = repo(), root = fresh('root'), b = bank(), outs = [path.join(scratch, `c-${n++}`), path.join(scratch, `c-${n++}`)];
    const slow = script('slow', "import { writeFileSync } from 'node:fs';\nawait new Promise(r => setTimeout(r, 400));\nwriteFileSync('mine.txt', process.env.OUT);\nwriteFileSync(process.env.OUT, process.cwd());\n");
    const runs = await Promise.all(outs.map(out => runner(r, ['--tmp-root', root, '--exec', process.execPath, slow], { LOGIC_ISLAND_PRIVATE_BANK: b, OUT: out })));
    expect(runs.map(x => x.code), runs.map(x => x.out).join('\n')).toEqual([0, 0]);
    const dirs = outs.map(out => readFileSync(out, 'utf8'));
    expect(dirs[0]).not.toBe(dirs[1]);
    expect(workspaces(root)).toEqual([]);
  });

  it('refuses a workspace name that is taken and leaves that folder alone', async () => {
    const r = repo(), root = fresh('root'), taken = path.join(root, `${PREFIX}fixed`);
    write(path.join(taken, 'keep.txt'), 'someone else');
    const run = await runner(r, ['--tmp-root', root, '--run-id', 'fixed', '--exec', 'true'], { LOGIC_ISLAND_PRIVATE_BANK: bank() });
    expect(run.code, run.out).toBe(2);
    expect(readFileSync(path.join(taken, 'keep.txt'), 'utf8')).toBe('someone else');
    expect(workspaces(root)).toEqual([`${PREFIX}fixed`]);
    expect((await runner(r, ['--tmp-root', root, '--reclaim'], {})).out).toMatch(/^unknown .*not touched\)$/m);
    expect(existsSync(path.join(taken, 'keep.txt'))).toBe(true);
  });

  it('a killed run leaves a workspace that is listed and can be reclaimed once its processes are gone', async () => {
    const r = repo(), root = fresh('root'), ready = path.join(scratch, `ready-${n++}`), stray = path.join(root, `${PREFIX}stray`);
    write(path.join(stray, 'data.txt'), 'not a workspace');
    const { child, done } = start(r, ['--tmp-root', root, '--run-id', 'killed', '--exec', process.execPath, WAIT(ready)], { LOGIC_ISLAND_PRIVATE_BANK: bank() });
    await until(() => existsSync(ready), 'the test process');
    const left = path.join(root, `${PREFIX}killed`);
    await until(() => typeof readMarker(left)?.childPid === 'number', 'the marker to name the test process');
    const testPid = readMarker(left)!.childPid!;
    strays.push(testPid);
    child.kill('SIGKILL');
    await done;
    expect(existsSync(left)).toBe(true);
    // Its test process is still alive: the folder is in use, and reclaim must leave it.
    expect((await runner(r, ['--tmp-root', root, '--reclaim'], {})).out).toMatch(/^running .*killed/m);
    expect(existsSync(left)).toBe(true);
    process.kill(-testPid, 'SIGKILL');
    await until(() => gone(testPid), 'the test process to end');
    expect((await runner(r, ['--tmp-root', root, '--list'], {})).out).toMatch(/^stale .*killed/m);
    const reclaimed = await runner(r, ['--tmp-root', root, '--reclaim'], {});
    expect(reclaimed.out).toMatch(/^removed .*killed$/m);
    expect(reclaimed.out).toMatch(/^unknown .*stray/m);
    expect(workspaces(root)).toEqual([`${PREFIX}stray`]);
    expect(readFileSync(path.join(stray, 'data.txt'), 'utf8')).toBe('not a workspace');
  });

  it('reports a bank that changed during the run (exit 4)', async () => {
    const r = repo(), root = fresh('root'), b = bank();
    const tamper = script('tamper', "import { writeFileSync } from 'node:fs';\nwriteFileSync(process.env.REAL_BANK + '/generated/a.json', 'changed');\n");
    const run = await runner(r, ['--tmp-root', root, '--exec', process.execPath, tamper], { LOGIC_ISLAND_PRIVATE_BANK: b, REAL_BANK: b });
    expect(run.code, run.out).toBe(4);
    expect(run.out).toMatch(/changed during the run/);
    expect(workspaces(root)).toEqual([]);
  });
});

describe('public mode stays public', () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };

  it('only the runner command starts a private run', () => {
    expect(pkg.scripts['trials:test-private']).toMatch(/scripts\/trials\/test-private\.ts$/);
    for (const [name, cmd] of Object.entries(pkg.scripts)) if (name !== 'trials:test-private') expect(cmd, name).not.toMatch(/test-private|LOGIC_ISLAND_(REQUIRE_)?PRIVATE_BANK/);
  });

  it('the workflow, the Vitest config and the ignore rules are as they were', () => {
    const workflow = readFileSync(path.join(ROOT, '.github/workflows/trials-ci.yml'), 'utf8');
    expect(workflow).not.toMatch(/test-private/);
    expect(workflow).toMatch(/test ! -e private && test -z "\$\{LOGIC_ISLAND_PRIVATE_BANK:-\}"/);
    expect(readFileSync(path.join(ROOT, 'vitest.config.mts'), 'utf8')).not.toMatch(/LOGIC_ISLAND_PRIVATE_BANK|test-private/);
    expect(readFileSync(path.join(ROOT, '.gitignore'), 'utf8')).toMatch(/^\/private\/$/m);
  });
});
