import { childrenOf, groupsOf, physicalPath, type FsNode, type FsState } from './fs';
import { accountsOf, findUser } from './accounts';
import { DAY, isoStamp, journalStamp, parseSpan, parseWhen, relativeText, systemdStamp, type Seconds } from './clock';
import { clockOf, commOf, nextPid, SIGNALS, tableOf, type Proc } from './processes';
import { compilePattern, getopt } from './text';

/*
 * Engine stage E6 (docs/curriculum/LNX0_TERMINAL_CAPABILITY.md §14): systemd services and the journal. Units are unit
 * files on the simulated disk (/etc/systemd/system, /usr/lib/systemd/system, /lib/systemd/system) parsed for a documented
 * subset of keys; what systemd has loaded is kept apart from the disk, so an edited unit needs `systemctl daemon-reload`
 * (systemctl warns, and keeps using the loaded text, exactly like systemd). A service's program never runs: the lesson
 * declares programs (by executable path) that start, or fail with a message unless a file exists, and how they react to
 * signals. Starting a service adds its process to the process table (E4); its messages go to the journal with the
 * machine's fixed "now". Restart= is evaluated at once (the clock never moves): see restart() for the exact rule.
 */

/** A unit file as systemd read it. */
export interface UnitFile { name: string; path: string; text: string }
/** A journal entry. priority: 0 emerg … 3 err, 4 warning, 5 notice, 6 info, 7 debug. */
export interface JournalEntry { time: Seconds; unit?: string; id: string; pid?: number; priority: number; message: string }
/** What a service's program does when systemd starts it (by executable path). */
export interface Program {
  path: string;
  /** What ps shows (default: the ExecStart= line). */
  title?: string;
  cpu?: number;
  rss?: number;
  vsz?: number;
  term?: 'exit' | 'ignore';
  hup?: 'exit' | 'reload' | 'ignore';
  /** The program exits at once with this message (journaled at priority err) and status (default 1), unless the file `unless` exists. */
  fail?: { message: string; status?: number; unless?: string };
  /** Messages it journals after a successful start (info). */
  log?: readonly string[];
}
/** The run state of a unit, as systemctl status shows it. */
export interface UnitRun {
  active: 'active' | 'inactive' | 'failed' | 'activating';
  sub: 'running' | 'exited' | 'dead' | 'failed' | 'auto-restart';
  since?: Seconds;
  result?: string;
  main?: number;
  /** How the last main process ended. */
  exit?: { pid: number; code: 'exited' | 'killed'; status: number };
  restarts?: number;
}
export interface ServiceDb { loaded: Readonly<Record<string, UnitFile>>; runtime: Readonly<Record<string, UnitRun>>; programs: readonly Program[] }

export const UNIT_DIRS = ['/etc/systemd/system', '/run/systemd/system', '/usr/lib/systemd/system', '/lib/systemd/system'] as const;
/** At most this many journal entries are kept (the oldest go first, like journald's size limit). */
export const MAX_JOURNAL = 400;
export const PRIORITIES = ['emerg', 'alert', 'crit', 'err', 'warning', 'notice', 'info', 'debug'] as const;
const EXIT_NAMES: Record<number, string> = { 0: 'SUCCESS', 1: 'FAILURE', 2: 'INVALIDARGUMENT', 3: 'NOTIMPLEMENTED', 4: 'NOPERMISSION', 5: 'NOTINSTALLED', 6: 'NOTCONFIGURED', 7: 'NOTRUNNING', 203: 'EXEC', 217: 'USER' };
const PATH_DIRS = ['/usr/local/sbin', '/usr/local/bin', '/usr/sbin', '/usr/bin'];

/** nginx → nginx.service (only services exist in the simulation). */
export const unitName = (name: string) => /\.[a-z]+$/.test(name) ? name : `${name}.service`;

// -------------------------------------------------------------------------------------------------------- unit files

const KNOWN: Record<string, readonly string[]> = {
  Unit: ['Description', 'Documentation', 'After', 'Before', 'Requires', 'Wants', 'BindsTo', 'PartOf', 'Conflicts', 'StartLimitIntervalSec', 'StartLimitBurst', 'ConditionPathExists'],
  Service: ['Type', 'ExecStart', 'ExecStartPre', 'ExecStartPost', 'ExecReload', 'ExecStop', 'User', 'Group', 'Restart', 'RestartSec', 'WorkingDirectory', 'Environment',
    'EnvironmentFile', 'RemainAfterExit', 'TimeoutStartSec', 'TimeoutStopSec', 'KillMode', 'PIDFile', 'StandardOutput', 'StandardError', 'SyslogIdentifier', 'LimitNOFILE',
    'PrivateTmp', 'NoNewPrivileges', 'ProtectSystem', 'ProtectHome'],
  Install: ['WantedBy', 'RequiredBy', 'Alias', 'Also'],
};
const LISTS = ['After', 'Before', 'Requires', 'Wants', 'WantedBy', 'RequiredBy'];
const RESTARTS = ['no', 'always', 'on-success', 'on-failure', 'on-abnormal', 'on-abort', 'on-watchdog'] as const;
const TYPES = ['simple', 'exec', 'forking', 'oneshot', 'notify'] as const;

/** A unit file's settings (the subset the simulation uses) and the warnings systemd logs while loading it. */
export interface UnitConfig {
  description?: string;
  after: string[]; requires: string[]; wants: string[];
  type: typeof TYPES[number];
  execStart?: string; execReload?: string; user?: string;
  restart: typeof RESTARTS[number];
  /** Seconds. */
  restartSec: number; burst: number; interval: number;
  remainAfterExit: boolean;
  wantedBy: string[];
  warnings: string[];
  /** Why systemd refuses the unit (Loaded: bad-setting). */
  bad?: string;
}

export function parseUnit(file: UnitFile): UnitConfig {
  const c: UnitConfig = { after: [], requires: [], wants: [], type: 'simple', restart: 'no', restartSec: 0.1, burst: 5, interval: 10, remainAfterExit: false, wantedBy: [], warnings: [] };
  const lists: Record<string, string[]> = { After: c.after, Requires: c.requires, Wants: c.wants, WantedBy: c.wantedBy, Before: [], RequiredBy: [] };
  let section: string | null = null;
  file.text.split('\n').forEach((raw, i) => {
    const line = raw.trim(), at = `${file.path}:${i + 1}`;
    if (!line || line.startsWith('#') || line.startsWith(';')) return;
    const head = /^\[(.+)\]$/.exec(line);
    if (head) { section = head[1]; if (!KNOWN[section]) c.warnings.push(`${at}: Unknown section '${section}'. Ignoring.`); return; }
    const eq = line.indexOf('=');
    if (eq < 0) { c.warnings.push(`${at}: Missing '=', ignoring line.`); return; }
    if (section === null) { c.warnings.push(`${at}: Assignment outside of section. Ignoring.`); return; }
    if (!KNOWN[section]) return;
    const key = line.slice(0, eq).trim(), value = line.slice(eq + 1).trim();
    if (!KNOWN[section].includes(key)) { c.warnings.push(`${at}: Unknown key name '${key}' in section '${section}', ignoring.`); return; }
    const invalid = () => c.warnings.push(`${at}: Failed to parse ${key}= value, ignoring: ${value}`);
    if (LISTS.includes(key)) {
      const list = lists[key];
      if (!value) list.length = 0;
      else for (const v of value.split(/\s+/)) if (!list.includes(unitName(v))) list.push(key === 'WantedBy' || key === 'RequiredBy' ? v : unitName(v));
      return;
    }
    switch (key) {
      case 'Description': c.description = value || undefined; break;
      case 'Type': if ((TYPES as readonly string[]).includes(value)) c.type = value as UnitConfig['type']; else invalid(); break;
      case 'ExecStart': c.execStart = value || undefined; break;
      case 'ExecReload': c.execReload = value || undefined; break;
      case 'User': c.user = value || undefined; break;
      case 'Restart': if ((RESTARTS as readonly string[]).includes(value)) c.restart = value as UnitConfig['restart']; else c.warnings.push(`${at}: Failed to parse service restart specifier, ignoring: ${value}`); break;
      case 'RestartSec': { const s = parseSpan(value); if (s === undefined) invalid(); else c.restartSec = s; break; }
      case 'StartLimitIntervalSec': { const s = parseSpan(value); if (s === undefined) invalid(); else c.interval = s; break; }
      case 'StartLimitBurst': if (/^\d+$/.test(value)) c.burst = Number(value); else invalid(); break;
      case 'RemainAfterExit': c.remainAfterExit = /^(yes|true|on|1)$/.test(value); break;
    }
  });
  if (!c.execStart) c.bad = `${file.name}: Service has no ExecStart=, ExecStop=, or SuccessAction=. Refusing.`;
  return c;
}

/** The unit file on the disk (the first unit folder that has it, links followed). */
export function findUnitFile(nodes: ReadonlyMap<string, FsNode>, name: string): UnitFile | undefined {
  for (const dir of UNIT_DIRS) {
    const path = `${dir}/${name}`, node = nodes.get(physicalPath(nodes, path, true));
    if (node?.kind === 'file') return { name, path, text: node.content ?? '' };
  }
  return undefined;
}

/** Every *.service file in the unit folders (not in the .wants folders). */
export function unitFilesOnDisk(nodes: ReadonlyMap<string, FsNode>): string[] {
  const names = new Set<string>();
  for (const dir of UNIT_DIRS) {
    const real = physicalPath(nodes, dir, true);
    if (nodes.get(real)?.kind !== 'dir') continue;
    for (const child of childrenOf(nodes, real)) {
      const name = child.slice(child.lastIndexOf('/') + 1);
      if (name.endsWith('.service') && findUnitFile(nodes, name)) names.add(name);
    }
  }
  return [...names].sort();
}

/** The enablement links of a unit: /etc/systemd/system/<target>.wants/<unit>. */
function wantsLinks(nodes: ReadonlyMap<string, FsNode>, name: string): string[] {
  const root = '/etc/systemd/system';
  if (nodes.get(root)?.kind !== 'dir') return [];
  return childrenOf(nodes, root).filter(p => /\.(wants|requires)$/.test(p) && nodes.get(p)?.kind === 'dir').map(p => `${p}/${name}`).filter(p => nodes.get(p)?.kind === 'link');
}

/** enabled (a link in a .wants folder), static (no [Install] section) or disabled; undefined without a unit file. */
export function enablement(nodes: ReadonlyMap<string, FsNode>, name: string): 'enabled' | 'disabled' | 'static' | undefined {
  const file = findUnitFile(nodes, name);
  if (!file) return undefined;
  if (wantsLinks(nodes, name).length) return 'enabled';
  return parseUnit(file).wantedBy.length ? 'disabled' : 'static';
}

// ----------------------------------------------------------------------------------------------------- the runtime

/** A state being changed by systemd (one command). */
interface Work {
  state: FsState;
  nodes: Map<string, FsNode>;
  loaded: Record<string, UnitFile>;
  runtime: Record<string, UnitRun>;
  journal: JournalEntry[];
  procs: Proc[];
  lastPid: number;
  now: Seconds;
}

function begin(state: FsState): Work {
  const db = state.services ?? { loaded: {}, runtime: {}, programs: [] };
  return { state, nodes: new Map(state.nodes), loaded: { ...db.loaded }, runtime: { ...db.runtime }, journal: [...state.journal ?? []], procs: [...tableOf(state)], lastPid: nextPid(state) - 1, now: clockOf(state).now };
}
function finish(w: Work): FsState {
  const db = w.state.services ?? { loaded: {}, runtime: {}, programs: [] };
  return { ...w.state, nodes: w.nodes, services: { ...db, loaded: w.loaded, runtime: w.runtime }, journal: w.journal.slice(-MAX_JOURNAL), processes: w.procs, lastPid: w.lastPid };
}
const programsOf = (w: Work) => w.state.services?.programs ?? [];
function log(w: Work, unit: string | undefined, id: string, priority: number, message: string, pid?: number) {
  w.journal.push({ time: w.now, ...unit ? { unit } : {}, id, ...pid !== undefined ? { pid } : {}, priority, message });
}
const sys = (w: Work, unit: string, priority: number, message: string) => log(w, unit, 'systemd', priority, message, 1);
const titleOf = (name: string, c: UnitConfig) => c.description ? `${name} - ${c.description}` : name;
const exitText = (status: number) => `${status}/${EXIT_NAMES[status] ?? 'n/a'}`;

/** The loaded unit (loading it from the disk on first use, logging its warnings), or undefined when there is none. */
function load(w: Work, name: string): UnitFile | undefined {
  if (w.loaded[name]) return w.loaded[name];
  const file = findUnitFile(w.nodes, name);
  if (!file) return undefined;
  w.loaded[name] = file;
  for (const warning of parseUnit(file).warnings) sys(w, name, 4, warning);
  return file;
}
/** Whether the unit file on the disk differs from what systemd loaded. */
const changedOnDisk = (nodes: ReadonlyMap<string, FsNode>, loaded: UnitFile | undefined) => !!loaded && findUnitFile(nodes, loaded.name)?.text !== loaded.text;
export const changedWarning = (name: string) => `Warning: The unit file, source configuration file or drop-ins of ${name} changed on disk. Run 'systemctl daemon-reload' to reload units.`;

/** The executable of an ExecStart= line: absolute, or looked up in systemd's fixed PATH. */
function executable(w: Work, line: string): { path: string; error?: 'No such file or directory' | 'Permission denied' } {
  const first = line.replace(/^[-@+!:]+/, '').split(/\s+/)[0];
  const candidates = first.startsWith('/') ? [first] : PATH_DIRS.map(d => `${d}/${first}`);
  for (const path of candidates) {
    const node = w.nodes.get(physicalPath(w.nodes, path, true));
    if (node?.kind === 'file') return (node.mode & 0o111) ? { path } : { path, error: 'Permission denied' };
  }
  return { path: candidates[0], error: 'No such file or directory' };
}

type Spawn = { ok: true } | { ok: false; pid: number; status: number };

/** One start of the service's program: logs, adds the process (or records how it failed). */
function spawn(w: Work, name: string, c: UnitConfig): Spawn {
  const title = titleOf(name, c), line = c.execStart ?? '', exe = executable(w, line), pid = ++w.lastPid;
  const startedFirst = c.type === 'simple' || c.type === 'forking' || c.type === 'notify';
  if (c.type === 'oneshot') sys(w, name, 6, `Starting ${title}...`);
  const user = c.user ?? 'root';
  if (!findUser(accountsOf(w.state), user)) {
    if (startedFirst) sys(w, name, 6, `Started ${title}.`);
    sys(w, name, 3, `${name}: Failed to determine user credentials: No such process`);
    sys(w, name, 3, `${name}: Failed at step USER spawning ${exe.path}: No such process`);
    return { ok: false, pid, status: 217 };
  }
  if (exe.error) {
    if (startedFirst) sys(w, name, 6, `Started ${title}.`);
    if (exe.error === 'No such file or directory') sys(w, name, 3, `${name}: Failed to locate executable ${exe.path}: ${exe.error}`);
    sys(w, name, 3, `${name}: Failed at step EXEC spawning ${exe.path}: ${exe.error}`);
    return { ok: false, pid, status: 203 };
  }
  const program = programsOf(w).find(p => p.path === exe.path);
  const fails = program?.fail && !(program.fail.unless && w.nodes.has(physicalPath(w.nodes, program.fail.unless, true)));
  if (fails) {
    if (c.type !== 'oneshot') sys(w, name, 6, `Started ${title}.`);
    log(w, name, commOf(exe.path), 3, program.fail!.message, pid);
    return { ok: false, pid, status: program.fail!.status ?? 1 };
  }
  if (c.type === 'oneshot') {
    sys(w, name, 6, `${name}: Deactivated successfully.`);
    sys(w, name, 6, `Finished ${title}.`);
    w.runtime[name] = c.remainAfterExit ? { active: 'active', sub: 'exited', since: w.now } : { active: 'inactive', sub: 'dead', since: w.now };
    return { ok: true };
  }
  sys(w, name, 6, `Started ${title}.`);
  w.procs.push({
    pid, ppid: 1, user, command: program?.title ?? line.replace(/^[-@+!:]+/, ''), stat: 'Ss', cpu: program?.cpu ?? 0, rss: program?.rss ?? 4096, vsz: program?.vsz ?? 16384, shr: 2048,
    tty: '?', start: w.now, time: 0, nice: 0, unit: name, ...program?.term ? { term: program.term } : {}, ...program?.hup ? { hup: program.hup } : {},
  });
  for (const message of program?.log ?? []) log(w, name, commOf(exe.path), 6, message, pid);
  w.runtime[name] = { active: 'active', sub: 'running', since: w.now, main: pid };
  return { ok: true };
}

/** Restart=: whether systemd restarts after this end (clean: exit 0 or SIGHUP/INT/TERM/PIPE). */
function restarts(policy: UnitConfig['restart'], clean: boolean, how: 'exit' | 'signal' | 'timeout'): boolean {
  switch (policy) {
    case 'always': return true;
    case 'on-success': return clean;
    case 'on-failure': return !clean;
    case 'on-abnormal': return !clean && how !== 'exit';
    case 'on-abort': return !clean && how === 'signal';
    default: return false;
  }
}

/**
 * Starts the program and applies Restart= at once (the simulated clock never moves). A program that starts is running;
 * one that fails is restarted while Restart= says so: when RestartSec × StartLimitBurst < StartLimitIntervalSec (the
 * default 100ms, 5 and 10s) systemd gives up after StartLimitBurst starts ("Start request repeated too quickly"), else
 * the unit stays in activating (auto-restart), waiting for a RestartSec that never passes. `counter` is the restart
 * counter so far. Returns whether the start job itself failed (oneshot and exec report a failing program).
 */
function run(w: Work, name: string, c: UnitConfig, counter: number): boolean {
  const title = titleOf(name, c), fast = c.restartSec * c.burst < c.interval;
  for (let starts = 1; ; starts++) {
    const r = spawn(w, name, c);
    if (r.ok) { if (w.runtime[name]) w.runtime[name] = { ...w.runtime[name], restarts: counter }; return true; }
    sys(w, name, 5, `${name}: Main process exited, code=exited, status=${exitText(r.status)}`);
    sys(w, name, 4, `${name}: Failed with result 'exit-code'.`);
    const exit = { pid: r.pid, code: 'exited' as const, status: r.status };
    const reportsFailure = c.type === 'oneshot' || (c.type === 'exec' && r.status >= 200);
    if (!restarts(c.restart, false, 'exit')) {
      if (reportsFailure) sys(w, name, 3, `Failed to start ${title}.`);
      w.runtime[name] = { active: 'failed', sub: 'failed', since: w.now, result: 'exit-code', exit, restarts: counter };
      return !reportsFailure;
    }
    if (!fast) { w.runtime[name] = { active: 'activating', sub: 'auto-restart', since: w.now, result: 'exit-code', exit, restarts: counter }; return true; }
    counter++;
    sys(w, name, 6, `${name}: Scheduled restart job, restart counter is at ${counter}.`);
    sys(w, name, 6, `Stopped ${title}.`);
    if (starts >= c.burst) {
      sys(w, name, 4, `${name}: Start request repeated too quickly.`);
      sys(w, name, 4, `${name}: Failed with result 'exit-code'.`);
      sys(w, name, 3, `Failed to start ${title}.`);
      w.runtime[name] = { active: 'failed', sub: 'failed', since: w.now, result: 'exit-code', exit, restarts: counter };
      return !reportsFailure;
    }
  }
}

type StartResult = { ok: true } | { ok: false; why: 'not-found' | 'bad' | 'dependency' | 'failed'; unit: string };

/** Starts a unit and (first) what it Requires= and Wants=; a manual start resets the start limit (see §14). */
function start(w: Work, name: string, chain: readonly string[] = []): StartResult {
  const file = load(w, name);
  if (!file) return { ok: false, why: 'not-found', unit: name };
  const c = parseUnit(file);
  if (c.bad) { if (!chain.length) sys(w, name, 3, c.bad); return { ok: false, why: 'bad', unit: name }; }
  const now = w.runtime[name];
  if (now?.active === 'active' || chain.includes(name) || chain.length > 8) return { ok: true };
  for (const dep of [...c.requires, ...c.wants.filter(d => !c.requires.includes(d))]) {
    const r = start(w, dep, [...chain, name]);
    if (r.ok || !c.requires.includes(dep)) continue;
    if (r.why === 'not-found') return r;
    sys(w, name, 3, `Dependency failed for ${titleOf(name, c)}.`);
    sys(w, name, 4, `${name}: Job ${name}/start failed with result 'dependency'.`);
    return { ok: false, why: 'dependency', unit: name };
  }
  return run(w, name, c, 0) ? { ok: true } : { ok: false, why: 'failed', unit: name };
}

/** Stops a unit (first the active units that Require= it). A program that ignores SIGTERM is killed after the stop timeout. */
function stop(w: Work, name: string, chain: readonly string[] = []): void {
  const now = w.runtime[name];
  if (!now || (now.active !== 'active' && now.active !== 'activating') || chain.includes(name)) return;
  for (const [other, file] of Object.entries(w.loaded)) {
    if (w.runtime[other]?.active === 'active' && parseUnit(file).requires.includes(name)) stop(w, other, [...chain, name]);
  }
  const file = w.loaded[name], c = file ? parseUnit(file) : undefined, title = c ? titleOf(name, c) : name;
  if (now.active === 'activating') { w.runtime[name] = { active: 'inactive', sub: 'dead', since: w.now, restarts: now.restarts }; return; }
  const main = w.procs.find(p => p.pid === now.main);
  sys(w, name, 6, `Stopping ${title}...`);
  w.procs = w.procs.filter(p => p.unit !== name);
  if (main?.term === 'ignore') {
    sys(w, name, 4, `${name}: State 'stop-sigterm' timed out. Killing.`);
    sys(w, name, 4, `${name}: Killing process ${main.pid} (${commOf(main.command)}) with signal SIGKILL.`);
    sys(w, name, 5, `${name}: Main process exited, code=killed, status=9/KILL`);
    sys(w, name, 4, `${name}: Failed with result 'timeout'.`);
    sys(w, name, 6, `Stopped ${title}.`);
    w.runtime[name] = { active: 'failed', sub: 'failed', since: w.now, result: 'timeout', exit: { pid: main.pid, code: 'killed', status: 9 }, restarts: now.restarts };
    return;
  }
  sys(w, name, 6, `${name}: Deactivated successfully.`);
  sys(w, name, 6, `Stopped ${title}.`);
  w.runtime[name] = { active: 'inactive', sub: 'dead', since: w.now, restarts: now.restarts };
}

/**
 * E4 → E6: processes a signal ended. When one was a service's main process, systemd notices: a clean signal (HUP, INT,
 * TERM, PIPE) deactivates the service, any other fails it with result 'signal'; Restart= then decides (always restarts
 * both; on-failure only the unclean one), and the restart happens at once.
 */
export function afterSignal(state: FsState, ended: readonly { proc: Proc; signal: number }[]): FsState {
  if (!state.services || !ended.length) return state;
  const w = begin(state);
  for (const { proc, signal } of ended) {
    const name = proc.unit, now = name ? w.runtime[name] : undefined;
    if (!name || now?.active !== 'active' || now.main !== proc.pid) continue;
    const file = w.loaded[name], c = file ? parseUnit(file) : undefined;
    w.procs = w.procs.filter(p => p.unit !== name);
    const clean = [1, 2, 13, 15].includes(signal);
    if (clean) sys(w, name, 6, `${name}: Deactivated successfully.`);
    else {
      sys(w, name, 5, `${name}: Main process exited, code=killed, status=${signal}/${SIGNALS[signal] ?? signal}`);
      sys(w, name, 4, `${name}: Failed with result 'signal'.`);
    }
    const exit = { pid: proc.pid, code: 'killed' as const, status: signal };
    w.runtime[name] = clean ? { active: 'inactive', sub: 'dead', since: w.now, restarts: now.restarts } : { active: 'failed', sub: 'failed', since: w.now, result: 'signal', exit, restarts: now.restarts };
    if (!c || !restarts(c.restart, clean, 'signal')) continue;
    const counter = (now.restarts ?? 0) + 1;
    sys(w, name, 6, `${name}: Scheduled restart job, restart counter is at ${counter}.`);
    sys(w, name, 6, `Stopped ${titleOf(name, c)}.`);
    run(w, name, c, counter);
  }
  return finish(w);
}

/** E5 → E6: a package installed these unit files; Debian's postinst enables (when they have [Install]) and starts them. */
export function setUpUnits(state: FsState, names: readonly string[], out: (line: string) => void): FsState {
  if (!state.services) return state;
  const w = begin(state);
  for (const name of names) {
    const file = findUnitFile(w.nodes, name);
    if (!file) continue;
    w.loaded[name] = file;
    enable(w, name, out);
    start(w, name);
  }
  return finish(w);
}
/** E5 → E6: the units a package removes are stopped first (Debian's prerm). */
export function stopUnits(state: FsState, names: readonly string[]): FsState {
  if (!state.services) return state;
  const w = begin(state);
  for (const name of names) stop(w, name);
  return finish(w);
}

function ensureDir(w: Work, path: string) {
  const parts = path.split('/').filter(Boolean);
  for (let i = 1; i <= parts.length; i++) {
    const p = `/${parts.slice(0, i).join('/')}`;
    if (!w.nodes.has(p)) w.nodes.set(p, { kind: 'dir', mode: 0o755, owner: 'root' });
  }
}
function enable(w: Work, name: string, out: (line: string) => void): 'done' | 'missing' | 'static' {
  const file = findUnitFile(w.nodes, name);
  if (!file) return 'missing';
  const c = parseUnit(file);
  if (!c.wantedBy.length) return 'static';
  for (const target of c.wantedBy) {
    const folder = `/etc/systemd/system/${target}.wants`, link = `${folder}/${name}`;
    if (w.nodes.get(link)?.kind === 'link') continue;
    ensureDir(w, folder);
    w.nodes.set(link, { kind: 'link', mode: 0o777, owner: 'root', target: file.path });
    out(`Created symlink ${link} → ${file.path}.`);
  }
  return 'done';
}
/** daemon-reload: systemd reads every unit file again (and logs the warnings of the ones that changed). */
function reload(w: Work) {
  for (const name of new Set([...Object.keys(w.loaded), ...unitFilesOnDisk(w.nodes)])) {
    const file = findUnitFile(w.nodes, name), old = w.loaded[name];
    if (!file) { delete w.loaded[name]; continue; }
    if (old && old.text === file.text && old.path === file.path) continue;
    w.loaded[name] = file;
    for (const warning of parseUnit(file).warnings) sys(w, name, 4, warning);
  }
}

// ------------------------------------------------------------------------------------------------------- systemctl

export interface SysIo { out(line: string): void; err(line: string): void; user: string; tty: boolean }

function journalLine(state: FsState, e: JournalEntry, format = 'short'): string {
  if (format === 'cat') return e.message;
  const stamp = format === 'short-iso' ? isoStamp(e.time) : journalStamp(e.time);
  return `${stamp} ${state.host ?? 'logic-island'} ${e.id}${e.pid !== undefined ? `[${e.pid}]` : ''}: ${e.message}`;
}

/** systemctl status of one unit; returns its exit status (0 running, 3 not running, 4 no such unit). */
function statusOf(w: Work, name: string, io: SysIo, first: boolean): number {
  const file = load(w, name);
  if (!file) { io.err(`Unit ${name} could not be found.`); return 4; }
  if (!first) io.out('');
  const c = parseUnit(file), now = w.runtime[name] ?? { active: 'inactive', sub: 'dead' };
  const dot = now.active === 'active' || now.active === 'activating' ? '●' : now.active === 'failed' ? '×' : '○';
  const label = (l: string) => `${l}:`.padStart(12);
  const enabled = enablement(w.nodes, name);
  io.out(`${dot} ${name}${c.description ? ` - ${c.description}` : ''}`);
  io.out(c.bad ? `${label('Loaded')} bad-setting (Reason: Unit ${name} has a bad unit file setting.)`
    : `${label('Loaded')} loaded (${file.path}; ${enabled === 'static' ? 'static' : `${enabled ?? 'disabled'}; preset: enabled`})`);
  const since = now.since !== undefined ? ` since ${systemdStamp(now.since)}; ${relativeText(w.now - now.since)}` : '';
  const state = now.active === 'failed' ? `failed (Result: ${now.result})` : now.active === 'activating' ? `activating (auto-restart) (Result: ${now.result})` : `${now.active} (${now.sub})`;
  io.out(`${label('Active')} ${state}${since}`);
  if (now.exit && now.active !== 'active') {
    const how = now.exit.code === 'killed' ? `code=killed, signal=${SIGNALS[now.exit.status] ?? now.exit.status}` : `code=exited, status=${exitText(now.exit.status)}`;
    io.out(`${label('Process')} ${now.exit.pid} ExecStart=${c.execStart ?? ''} (${how})`);
    io.out(`${label('Main PID')} ${now.exit.pid} (${how})`);
  }
  const procs = w.procs.filter(p => p.unit === name).sort((a, b) => a.pid - b.pid);
  if (now.active === 'active' && now.main !== undefined) {
    const main = procs.find(p => p.pid === now.main);
    if (main) io.out(`${label('Main PID')} ${main.pid} (${commOf(main.command)})`);
  }
  if (procs.length) {
    io.out(`${label('CGroup')} /system.slice/${name}`);
    procs.forEach((p, i) => io.out(`${' '.repeat(13)}${i === procs.length - 1 ? '└─' : '├─'}${p.pid} ${p.command}`));
  }
  const lines = w.journal.filter(e => e.unit === name).slice(-10);
  if (lines.length) { io.out(''); lines.forEach(e => io.out(journalLine(w.state, e))); }
  if (changedOnDisk(w.nodes, file)) io.err(changedWarning(name));
  return now.active === 'active' ? 0 : 3;
}

const notRoot = (io: SysIo, verb: string, unit?: string) => {
  io.err(`Failed to ${verb}${unit ? ` ${unit}` : ''}: Interactive authentication required.`);
  if (unit) io.err(`See system logs and 'systemctl status ${unit}' for details.`);
};

/** One table of list-units / list-unit-files: columns as wide as their widest cell, one space apart. */
function grid(rows: string[][], prefix: (i: number) => string = () => ''): string[] {
  const widths = rows[0].map((_, i) => Math.max(...rows.map(r => r[i].length)));
  return rows.map((r, i) => prefix(i) + r.map((cell, j) => j === r.length - 1 ? cell : cell.padEnd(widths[j])).join(' '));
}

/**
 * systemctl start|stop|restart|reload|status|enable [--now]|disable [--now]|is-active|is-enabled|daemon-reload|cat|
 * reset-failed|list-units [--type=service] [--all] [--state=…|--failed]|list-unit-files. Changes need root.
 */
export function systemctl(state: FsState, args: readonly string[], io: SysIo): { state: FsState; status: number } {
  if (!state.services) { io.err('System has not been booted with systemd as init system (PID 1). Can\'t operate.'); io.err('Failed to connect to bus: Host is down'); return { state, status: 1 }; }
  const o = getopt(args, 'at:qln:\x02:', { all: 'a', type: 't', now: '\x01', state: '\x02', failed: '\x03', 'no-pager': '\x04', quiet: 'q', full: 'l', lines: 'n', 'no-legend': '\x05' });
  if ('error' in o) { io.err(`systemctl: ${o.error}`); return { state, status: 1 }; }
  const type = o.flags.get('t')?.at(-1);
  if (type !== undefined && type !== 'service') { io.err(`模擬環境只有 service 類型的 unit（--type=${type} 不支援）`); return { state, status: 1 }; }
  const [verb = 'list-units', ...rawUnits] = o.operands, units = rawUnits.map(unitName);
  const w = begin(state), root = io.user === 'root';
  const result = (status: number) => ({ state: finish(w), status });
  const needUnits = () => { if (units.length) return false; io.err(`Too few arguments.`); return true; };
  switch (verb) {
    case 'start': case 'stop': case 'restart': case 'reload': {
      if (needUnits()) return { state, status: 1 };
      if (!root) { notRoot(io, verb, units.join(' ')); return { state, status: 1 }; }
      let status = 0;
      for (const name of units) {
        const file = load(w, name);
        if (!file) { io.err(verb === 'stop' ? `Failed to stop ${name}: Unit ${name} not loaded.` : `Failed to ${verb} ${name}: Unit ${name} not found.`); status = 5; continue; }
        if (changedOnDisk(w.nodes, file)) io.err(changedWarning(name));
        const c = parseUnit(file);
        if (verb === 'stop') { stop(w, name); continue; }
        if (verb === 'reload') {
          if (w.runtime[name]?.active !== 'active') { io.err(`${name} is not active, cannot reload.`); status = 1; continue; }
          if (!c.execReload) { io.err(`Failed to reload ${name}: Job type reload is not applicable for unit ${name}.`); status = 1; continue; }
          sys(w, name, 6, `Reloading ${titleOf(name, c)}...`);
          sys(w, name, 6, `Reloaded ${titleOf(name, c)}.`);
          continue;
        }
        if (verb === 'restart') stop(w, name);
        else if (w.runtime[name]?.active === 'activating') w.runtime[name] = { ...w.runtime[name], active: 'inactive', sub: 'dead' };
        const r = start(w, name);
        if (r.ok) continue;
        status = r.why === 'not-found' ? 5 : 1;
        if (r.why === 'not-found') io.err(`Failed to ${verb} ${name}: Unit ${r.unit} not found.`);
        else if (r.why === 'bad') { io.err(`Failed to ${verb} ${name}: Unit ${name} has a bad unit file setting.`); io.err(`See system logs and 'systemctl status ${name}' for details.`); }
        else if (r.why === 'dependency') io.err(`A dependency job for ${name} failed. See 'journalctl -xe' for details.`);
        else { io.err(`Job for ${name} failed because the control process exited with error code.`); io.err(`See "systemctl status ${name}" and "journalctl -xeu ${name}" for details.`); }
      }
      return result(status);
    }
    case 'status': {
      if (!units.length) { io.err('模擬環境：請指定服務，例如 systemctl status nginx'); return { state, status: 1 }; }
      let status = 0, first = true;
      for (const name of units) { const s = statusOf(w, name, io, first); if (s !== 4) first = false; status = Math.max(status, s); }
      return result(status);
    }
    case 'is-active': {
      if (needUnits()) return { state, status: 1 };
      let any = false;
      for (const name of units) { const a = w.runtime[name]?.active ?? 'inactive'; any ||= a === 'active'; if (!o.flags.has('q')) io.out(a); }
      return { state, status: any ? 0 : 3 };
    }
    case 'is-enabled': {
      if (needUnits()) return { state, status: 1 };
      let status = 1;
      for (const name of units) {
        const e = enablement(w.nodes, name);
        if (!e) { io.err(`Failed to get unit file state for ${name}: No such file or directory`); continue; }
        if (!o.flags.has('q')) io.out(e);
        if (e !== 'disabled') status = 0;
      }
      return { state, status };
    }
    case 'enable': case 'disable': {
      if (needUnits()) return { state, status: 1 };
      if (!root) { notRoot(io, `${verb} unit`); return { state, status: 1 }; }
      for (const name of units) {
        if (!findUnitFile(w.nodes, name)) { io.err(`Failed to ${verb} unit: Unit file ${name} does not exist.`); return { state, status: 1 }; }
      }
      for (const name of units) {
        if (verb === 'enable') {
          if (enable(w, name, io.out) === 'static') {
            io.err('The unit files have no installation config (WantedBy=, RequiredBy=, UpheldBy=,');
            io.err('Also=, or Alias= settings in the [Install] section, and DefaultInstance= for');
            io.err('template units). This means they are not meant to be enabled or disabled using systemctl.');
          }
        } else {
          for (const link of wantsLinks(w.nodes, name)) { w.nodes.delete(link); io.out(`Removed "${link}".`); }
        }
      }
      // enable and disable reload the manager, as systemctl does.
      reload(w);
      if (o.flags.has('\x01')) for (const name of units) { if (verb === 'enable') start(w, name); else stop(w, name); }
      return result(0);
    }
    case 'daemon-reload': {
      if (!root) { notRoot(io, 'reload daemon'); return { state, status: 1 }; }
      reload(w);
      return result(0);
    }
    case 'reset-failed': {
      if (!root) { notRoot(io, 'reset failed state of unit', units[0]); return { state, status: 1 }; }
      for (const [name, r] of Object.entries(w.runtime)) if ((!units.length || units.includes(name)) && r.active === 'failed') w.runtime[name] = { active: 'inactive', sub: 'dead' };
      return result(0);
    }
    case 'cat': {
      if (needUnits()) return { state, status: 1 };
      let status = 0;
      units.forEach((name, i) => {
        const file = findUnitFile(w.nodes, name);
        if (!file) { io.err(`No files found for ${name}.`); status = 1; return; }
        if (i) io.out('');
        io.out(`# ${file.path}`);
        file.text.replace(/\n$/, '').split('\n').forEach(l => io.out(l));
      });
      return { state, status };
    }
    case 'list-units': {
      const filter = o.flags.has('\x03') ? 'failed' : o.flags.get('\x02')?.at(-1);
      const names = [...new Set([...Object.keys(w.loaded), ...unitFilesOnDisk(w.nodes)])].sort();
      const rows = names.map(name => {
        const file = load(w, name)!, c = parseUnit(file), r = w.runtime[name] ?? { active: 'inactive', sub: 'dead' };
        return { name, cells: [name, c.bad ? 'bad-setting' : 'loaded', r.active, r.sub, c.description ?? name], failed: r.active === 'failed' };
      }).filter(r => filter ? r.cells[2] === filter || r.cells[3] === filter : o.flags.has('a') || r.cells[2] !== 'inactive');
      grid([['UNIT', 'LOAD', 'ACTIVE', 'SUB', 'DESCRIPTION'], ...rows.map(r => r.cells)], i => i && rows[i - 1].failed ? '● ' : '  ').forEach(l => io.out(l));
      if (!o.flags.has('\x05')) {
        io.out('');
        io.out('Legend: LOAD   → Reflects whether the unit definition was properly loaded.');
        io.out('        ACTIVE → The high-level unit activation state, i.e. generalization of SUB.');
        io.out('        SUB    → The low-level unit activation state, values depend on unit type.');
        io.out('');
        io.out(`${rows.length} loaded units listed.${o.flags.has('a') ? '' : ' Pass --all to see loaded but inactive units, too.'}`);
        io.out("To show all installed unit files use 'systemctl list-unit-files'.");
      }
      return result(0);
    }
    case 'list-unit-files': {
      const names = unitFilesOnDisk(w.nodes);
      const rows = names.map(name => { const e = enablement(w.nodes, name)!; return [name, e, e === 'static' ? '-' : 'enabled']; });
      grid([['UNIT FILE', 'STATE', 'PRESET'], ...rows]).forEach(l => io.out(l));
      io.out('');
      io.out(`${rows.length} unit files listed.`);
      return { state, status: 0 };
    }
    default:
      io.err(`Unknown command verb '${verb}'.`);
      return { state, status: 1 };
  }
}

// ------------------------------------------------------------------------------------------------------ journalctl

/** A priority: a number 0–7 or a name (err, warning…); a range is FROM..TO. */
function priorityRange(text: string): [number, number] | undefined {
  const one = (t: string) => /^[0-7]$/.test(t) ? Number(t) : (PRIORITIES as readonly string[]).indexOf(t) >= 0 ? (PRIORITIES as readonly string[]).indexOf(t) : t === 'error' ? 3 : t === 'warn' ? 4 : undefined;
  const [a, b] = text.split('..');
  const x = one(a);
  if (x === undefined) return undefined;
  if (b === undefined) return [0, x];
  const y = one(b);
  return y === undefined ? undefined : [Math.min(x, y), Math.max(x, y)];
}

/**
 * journalctl [-u unit]… [-p prio] [-S|--since T] [-U|--until T] [-n N] [-r] [-k] [-g pattern] [-o short|short-iso|cat]
 * [-b] [-x] [-e] [-q] [--no-pager]. Only root and the adm and systemd-journal groups see the system's journal.
 */
export function journalctl(state: FsState, args: readonly string[], io: SysIo): number {
  const o = getopt(args, 'u:p:n:rfS:U:o:kbxeqg:', {
    unit: 'u', priority: 'p', lines: 'n', reverse: 'r', follow: 'f', since: 'S', until: 'U', output: 'o', dmesg: 'k', boot: 'b', catalog: 'x', 'pager-end': 'e', quiet: 'q', grep: 'g', 'no-pager': '\x01',
  });
  if ('error' in o) { io.err(`journalctl: ${o.error}`); return 1; }
  if (o.operands.length) { io.err('模擬環境的 journalctl 不接受比對條件（例如 _PID=1）；請用 -u、-p、--since'); return 1; }
  if (o.flags.has('f')) { io.err('journalctl: 模擬環境的日誌不會再增加，不支援 -f（持續追蹤）；請用 -n 或 --since 查詢'); return 1; }
  const now = clockOf(state).now, one = (f: string) => o.flags.get(f)?.at(-1);
  const format = one('o') ?? 'short';
  if (!['short', 'short-iso', 'cat'].includes(format)) { io.err(`Unknown output format '${format}'.`); return 1; }
  let range: [number, number] = [0, 7];
  if (one('p') !== undefined) {
    const r = priorityRange(one('p')!);
    if (!r) { io.err(`Failed to parse priority value: ${one('p')}`); return 1; }
    range = r;
  }
  const when = (f: string) => {
    const text = one(f);
    if (text === undefined) return { t: undefined as Seconds | undefined };
    const t = parseWhen(text, now);
    return t === undefined ? { error: `Failed to parse timestamp: ${text}` } : { t };
  };
  const since = when('S'), until = when('U');
  if ('error' in since) { io.err(since.error!); return 1; }
  if ('error' in until) { io.err(until.error!); return 1; }
  if (since.t !== undefined && until.t !== undefined && since.t > until.t) { io.err('--since= must be before --until=.'); return 1; }
  const lines = one('n') ?? (o.flags.has('e') ? '1000' : undefined);
  if (lines !== undefined && !/^\d+$/.test(lines)) { io.err(`Failed to parse lines '${lines}'`); return 1; }
  let grep: RegExp | undefined;
  if (one('g') !== undefined) { const c = compilePattern(one('g')!, true); if ('error' in c) { io.err(`journalctl: ${c.error}`); return 1; } grep = new RegExp(c.source, 'u'); }
  const allowed = io.user === 'root' || groupsOf(state).some(g => g === 'adm' || g === 'systemd-journal');
  if (!allowed && !o.flags.has('q')) {
    io.err('Hint: You are currently not seeing messages from other users and the system.');
    io.err("      Users in groups 'adm', 'systemd-journal' can see all messages.");
    io.err('      Pass -q to turn off this notice.');
  }
  const units = (o.flags.get('u') ?? []).map(unitName), boot = clockOf(state).boot;
  let entries = allowed ? (state.journal ?? []).filter(e =>
    (!units.length || (e.unit !== undefined && units.includes(e.unit))) && (!o.flags.has('k') || e.id === 'kernel') && (!o.flags.has('b') || e.time >= boot)
    && e.priority >= range[0] && e.priority <= range[1] && (since.t === undefined || e.time >= since.t) && (until.t === undefined || e.time <= until.t) && (!grep || grep.test(e.message))) : [];
  if (lines !== undefined) entries = Number(lines) ? entries.slice(-Number(lines)) : [];
  if (o.flags.has('r')) entries = [...entries].reverse();
  if (!entries.length) { io.out('-- No entries --'); return 0; }
  entries.forEach(e => io.out(journalLine(state, e, format)));
  return 0;
}

/** The days a journal covers, for lesson validation (entries must be in time order and not after now). */
export const journalProblems = (entries: readonly JournalEntry[], now: Seconds): string[] => {
  const problems: string[] = [];
  entries.forEach((e, i) => {
    if (e.time > now) problems.push(`journal entry ${i + 1} is after the machine's now`);
    if (i && e.time < entries[i - 1].time) problems.push(`journal entry ${i + 1} is earlier than the one before it`);
    if (e.time < now - 3650 * DAY) problems.push(`journal entry ${i + 1} is more than ten years before now`);
  });
  return problems;
};
