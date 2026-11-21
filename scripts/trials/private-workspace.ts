import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/*
 * The private test runner's parts (scripts/trials/test-private.ts, docs/exam-system/34 §2): the temporary workspace
 * it runs in, the snapshot of the private bank it tests, and the check that the bank's tests fit the public commit.
 *
 * The private bank is only ever read. A workspace is a folder this module created: it carries a marker file, and
 * nothing here deletes a folder without one. A run that was killed leaves its folder behind; `list` names it and
 * `reclaim` removes it once neither the runner nor its test process is alive.
 */
export const PREFIX = 'logic-island-private-test-';
export const MARKER = '.logic-island-private-test.json';
export const MARKER_FORMAT = 'logic-island.private-test-workspace/1';

/** Exit codes of the runner: 2 usage, 3 the bank and the public commit do not fit, 4 the run cannot be trusted. */
export class RunnerError extends Error {
  constructor(readonly code: 2 | 3 | 4, message: string) { super(message); }
}

export interface Marker {
  format: typeof MARKER_FORMAT;
  runId: string;
  token: string;
  pid: number;
  childPid: number | null;
  startedAt: string;
  state: 'running' | 'kept';
  publicCommit: string | null;
  bankHead: string | null;
}
export interface Workspace { dir: string; root: string; token: string; runId: string }

/** The private bank's folder: an absolute path to an existing checkout with `generated/` and `tests/`. */
export function checkBank(dir: string | undefined): string {
  if (!dir) throw new RunnerError(2, 'LOGIC_ISLAND_PRIVATE_BANK is not set: pass the private bank on the command, e.g. LOGIC_ISLAND_PRIVATE_BANK=/abs/path pnpm trials:test-private');
  if (!path.isAbsolute(dir)) throw new RunnerError(2, `LOGIC_ISLAND_PRIVATE_BANK must be an absolute path (got ${dir})`);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new RunnerError(2, `no private bank at ${dir}`);
  for (const sub of ['generated', 'tests']) if (!existsSync(path.join(dir, sub)) || !statSync(path.join(dir, sub)).isDirectory())
    throw new RunnerError(2, `${dir} is not a private bank checkout (no ${sub}/)`);
  return realpathSync(dir);
}

/** Every file under `dir` but its top-level `.git`, as sorted relative paths. A symlink is listed, never followed. */
export function listFiles(dir: string): { rel: string; link: boolean }[] {
  const out: { rel: string; link: boolean }[] = [];
  const walk = (rel: string) => {
    for (const name of readdirSync(path.join(dir, rel)).sort()) {
      if (!rel && name === '.git') continue;
      const child = rel ? `${rel}/${name}` : name, st = lstatSync(path.join(dir, child));
      if (st.isDirectory()) walk(child);
      else out.push({ rel: child, link: st.isSymbolicLink() });
    }
  };
  walk('');
  return out;
}

/** One hash over every path and content of the folder (without `.git`): equal before and after means nothing changed. */
export function digestTree(dir: string): { digest: string; files: number } {
  const hash = createHash('sha256'), files = listFiles(dir);
  for (const f of files) {
    const body = f.link ? Buffer.from(`link:${readlinkSync(path.join(dir, f.rel))}`) : readFileSync(path.join(dir, f.rel));
    hash.update(`${f.rel}\0${body.length}\0`).update(createHash('sha256').update(body).digest());
  }
  return { digest: hash.digest('hex'), files: files.length };
}

const git = (dir: string, ...args: string[]) => {
  // --no-optional-locks: `git status` must not refresh the index of a checkout this runner only reads.
  const r = spawnSync('git', ['--no-optional-locks', '-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return r.status === 0 ? r.stdout.trim() : undefined;
};

export interface BankState { head: string | null; dirty: number | null; digest: string; files: number }
/** What the bank is right now: its commit and uncommitted paths when it is a git checkout, and its content hash. */
export function bankState(dir: string): BankState {
  const head = existsSync(path.join(dir, '.git')) ? git(dir, 'rev-parse', 'HEAD') ?? null : null;
  const status = head ? git(dir, 'status', '--porcelain') : undefined;
  return { head, dirty: status === undefined ? null : status.split('\n').filter(Boolean).length, ...digestTree(dir) };
}

/** Copies the bank's files (never `.git`) into `dest` as real files, and proves the copy equals the source. */
export function snapshotBank(src: string, dest: string): number {
  const files = listFiles(src), link = files.find(f => f.link);
  if (link) throw new RunnerError(2, `the private bank holds a symlink (${link.rel}): a snapshot is made of real files only`);
  for (const f of files) {
    mkdirSync(path.dirname(path.join(dest, f.rel)), { recursive: true });
    copyFileSync(path.join(src, f.rel), path.join(dest, f.rel));
  }
  if (existsSync(path.join(dest, '.git'))) throw new RunnerError(4, 'the snapshot holds a .git folder');
  if (digestTree(dest).digest !== digestTree(src).digest) throw new RunnerError(4, 'the snapshot differs from the private bank (was the bank edited during the copy?)');
  return files.length;
}

const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(['"])([^'"\n]+)\1/g;
const resolves = (base: string) => [base, `${base}.ts`, `${base}.tsx`, `${base}.mts`, `${base}.js`, `${base}.mjs`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]
  .some(f => existsSync(f) && statSync(f).isFile());

/**
 * The modules the bank's tests import from the public code (`@/…` and relative paths) that the checkout does not
 * have. Empty means the two fit; anything else names what the public commit lacks. Packages are not looked at.
 */
export function missingImports(checkout: string, testsDir: string): { file: string; specifier: string }[] {
  const missing: { file: string; specifier: string }[] = [];
  for (const f of listFiles(testsDir)) {
    if (f.link || !/\.(ts|tsx|mts|js|mjs)$/.test(f.rel)) continue;
    const file = path.join(testsDir, f.rel);
    for (const m of readFileSync(file, 'utf8').matchAll(SPECIFIER)) {
      const spec = m[2];
      const base = spec.startsWith('@/') ? path.join(checkout, 'src', spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(file), spec) : undefined;
      if (base && !resolves(base) && !missing.some(x => x.file === f.rel && x.specifier === spec)) missing.push({ file: f.rel, specifier: spec });
    }
  }
  return missing;
}

/** The bank's own test files in a snapshot: what a private-mode run must have executed. */
export const testFiles = (testsDir: string) => listFiles(testsDir).filter(f => /\.test\.(ts|tsx)$/.test(f.rel)).map(f => f.rel);

export interface Counts { files: number; passed: number; failed: number; skipped: number }
/** A Vitest JSON report counted in two parts: the bank's own test files (under private/question-bank) and the public ones. */
export function summarize(report: { testResults?: { name: string; assertionResults?: { status: string }[] }[] }) {
  const zero = (): Counts => ({ files: 0, passed: 0, failed: 0, skipped: 0 }), out = { bank: zero(), publicSide: zero() };
  for (const file of report.testResults ?? []) {
    const c = file.name.split(path.sep).join('/').includes('/private/question-bank/') ? out.bank : out.publicSide;
    c.files++;
    for (const t of file.assertionResults ?? []) { if (t.status === 'passed') c.passed++; else if (t.status === 'failed') c.failed++; else c.skipped++; }
  }
  return out;
}

const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
const markerOf = (ws: Pick<Workspace, 'dir'>) => path.join(ws.dir, MARKER);

/**
 * A new, empty workspace under `root`, private to this user, with its marker written. The folder is created by one
 * mkdir that fails if the name is taken: a given `runId` that exists is refused (and left alone), a generated one is
 * drawn again.
 */
export function createWorkspace(root: string, info: Pick<Marker, 'publicCommit' | 'bankHead'>, runId?: string, draw = () => `${Date.now().toString(36)}-${randomBytes(6).toString('hex')}`): Workspace {
  if (!path.isAbsolute(root) || !existsSync(root) || !statSync(root).isDirectory()) throw new RunnerError(2, `the temporary root ${root} is not an existing folder`);
  if (runId !== undefined && !RUN_ID.test(runId)) throw new RunnerError(2, `--run-id takes letters, digits, - and _ (at most 40), got ${runId}`);
  const base = realpathSync(root);
  for (let attempt = 0; attempt < 8; attempt++) {
    const id = runId ?? draw(), dir = path.join(base, `${PREFIX}${id}`);
    try { mkdirSync(dir, { mode: 0o700 }); } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      if (runId !== undefined) throw new RunnerError(2, `the workspace ${dir} already exists: it was left as it is (another run, or one to reclaim)`);
      continue;
    }
    const ws: Workspace = { dir, root: base, token: randomBytes(16).toString('hex'), runId: id };
    const marker: Marker = { format: MARKER_FORMAT, runId: id, token: ws.token, pid: process.pid, childPid: null, startedAt: new Date().toISOString(), state: 'running', ...info };
    writeFileSync(markerOf(ws), `${JSON.stringify(marker, null, 1)}\n`, { mode: 0o600, flag: 'wx' });
    return ws;
  }
  throw new RunnerError(4, `could not create a unique workspace under ${base}`);
}

export function readMarker(dir: string): Marker | undefined {
  try {
    const m = JSON.parse(readFileSync(path.join(dir, MARKER), 'utf8')) as Partial<Marker>;
    return m && m.format === MARKER_FORMAT && typeof m.token === 'string' && typeof m.pid === 'number' && typeof m.runId === 'string' ? m as Marker : undefined;
  } catch { return undefined; }
}

export function updateMarker(ws: Workspace, patch: Partial<Pick<Marker, 'childPid' | 'state'>>) {
  const m = readMarker(ws.dir);
  if (m && m.token === ws.token) writeFileSync(markerOf(ws), `${JSON.stringify({ ...m, ...patch }, null, 1)}\n`, { mode: 0o600 });
}

/**
 * Why `dir` is not a workspace this module may delete, or undefined when it is one: a real folder (not a link)
 * directly under `root`, named with the prefix, holding a valid marker — and, when a token is given, that run's own.
 */
export function notOwned(dir: string, root: string, token?: string): string | undefined {
  let st;
  try { st = lstatSync(dir); } catch { return 'it does not exist'; }
  if (st.isSymbolicLink() || !st.isDirectory()) return 'it is not a real folder';
  if (!path.basename(dir).startsWith(PREFIX)) return 'its name is not a workspace name';
  if (!existsSync(root) || realpathSync(path.dirname(dir)) !== realpathSync(root)) return 'it is not directly under the temporary root';
  const marker = readMarker(dir);
  if (!marker) return 'it has no valid marker file';
  if (path.basename(dir) !== `${PREFIX}${marker.runId}`) return 'its marker names another workspace';
  if (token !== undefined && marker.token !== token) return 'its marker belongs to another run';
  return undefined;
}

/** Deletes a workspace, and only a workspace: anything `notOwned` objects to is refused and left as it is. */
export function removeWorkspace(dir: string, root: string, token?: string) {
  const why = notOwned(dir, root, token);
  if (why) throw new RunnerError(4, `refusing to delete ${dir}: ${why}`);
  rmSync(dir, { recursive: true, force: true, maxRetries: 2 });
  if (existsSync(dir)) throw new RunnerError(4, `${dir} could not be removed`);
}

export interface Probe { alive(pid: number): boolean; isRunner(pid: number): boolean; groupAlive(pid: number): boolean }
const signal0 = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; } };
export const systemProbe: Probe = {
  alive: signal0,
  // A pid is reused in time: a live process only counts as the run if it is still this script.
  isRunner: pid => /test-private/.test(spawnSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }).stdout ?? ''),
  groupAlive: pid => signal0(-pid),
};

export interface Listed { dir: string; status: 'running' | 'stale' | 'unknown'; reason?: string; marker?: Marker }
/**
 * Every folder under `root` with the workspace prefix. `running`: its runner or its test process group is alive.
 * `stale`: a valid workspace whose processes are gone (safe to reclaim). `unknown`: not provably a workspace — it is
 * reported and never touched.
 */
export function listWorkspaces(root: string, probe: Probe = systemProbe): Listed[] {
  if (!existsSync(root)) return [];
  return readdirSync(root).filter(n => n.startsWith(PREFIX)).sort().map(name => {
    const dir = path.join(root, name), why = notOwned(dir, root);
    if (why) return { dir, status: 'unknown' as const, reason: why };
    const marker = readMarker(dir)!;
    const running = (probe.alive(marker.pid) && probe.isRunner(marker.pid)) || (marker.childPid !== null && probe.groupAlive(marker.childPid));
    return { dir, status: running ? 'running' as const : 'stale' as const, marker };
  });
}

/** Removes the stale workspaces under `root`. Running and unknown folders are returned untouched. */
export function reclaim(root: string, probe: Probe = systemProbe) {
  const removed: string[] = [], kept: Listed[] = [];
  for (const w of listWorkspaces(root, probe)) {
    if (w.status !== 'stale') { kept.push(w); continue; }
    removeWorkspace(w.dir, root, w.marker!.token);
    removed.push(w.dir);
  }
  return { removed, kept };
}
