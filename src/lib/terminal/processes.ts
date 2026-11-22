import type { FsState } from './fs';
import { accountsOf, findUser } from './accounts';
import { clockText, DEFAULT_NOW, parseTime, startLabel, uptimeText, type Seconds } from './clock';
import { compilePattern, getopt } from './text';

/*
 * Engine stage E4 (docs/curriculum/LNX0_TERMINAL_CAPABILITY.md §12): the process table of a simulated machine and the
 * commands that read and signal it — ps, top -b -n 1, kill, pgrep, pidof, pkill, sleep, jobs, fg, bg, date and uptime.
 * Nothing runs: a process is a row of data (declared by the lesson, or started by the engine for `sleep N &` and for
 * systemd services in E6) and a signal changes the table by a fixed rule. Each process may declare how it reacts to
 * SIGTERM, SIGHUP and SIGINT (exit, ignore, reload), which is what lessons need to show why SIGKILL exists. All numbers
 * (%CPU, memory, CPU time, start times, the load average) are fixed data; the clock never moves (clock.ts).
 */

/** One row of the process table. Sizes are KiB; times are seconds (start on the machine's clock, time of CPU). */
export interface Proc {
  pid: number;
  ppid: number;
  user: string;
  /** The command line as ps shows it (args); kernel threads are written in brackets, e.g. [kthreadd]. */
  command: string;
  /** ps STAT: the state letter (R S D T Z I) and its flags, e.g. Ss, R+, Sl, SN. */
  stat: string;
  /** %CPU, fixed. */
  cpu: number;
  rss: number;
  vsz: number;
  /** top's SHR (KiB). */
  shr: number;
  /** ? for none, pts/0 for the learner's session. */
  tty: string;
  start: Seconds;
  /** CPU time used, in seconds. */
  time: number;
  nice: number;
  /** E6: the systemd service the process belongs to. */
  unit?: string;
  /** What the process does on SIGTERM (default exit). */
  term?: 'exit' | 'ignore';
  /** On SIGHUP (default exit; daemons usually reload). */
  hup?: 'exit' | 'reload' | 'ignore';
  /** On SIGINT (default exit). */
  int?: 'exit' | 'ignore';
  /** A terminating signal that arrived while the process was stopped; it acts on SIGCONT. */
  pending?: number;
}

/** A background job of the session (only `sleep N &` makes one). */
export interface Job { id: number; pid: number; command: string }

/** The machine's fixed clock, load and memory (MiB). */
export interface Clock {
  now: Seconds;
  boot: Seconds;
  load: readonly [number, number, number];
  cpus: number;
  memory: { total: number; cache: number; swap: number };
}

/** The clock of a state without one. */
export const DEFAULT_CLOCK: Clock = { now: parseTime(DEFAULT_NOW)!, boot: parseTime(DEFAULT_NOW)! - 86400, load: [0, 0, 0], cpus: 1, memory: { total: 2048, cache: 512, swap: 0 } };
export const clockOf = (state: Pick<FsState, 'clock'>): Clock => state.clock ?? DEFAULT_CLOCK;
export const tableOf = (state: Pick<FsState, 'processes'>): readonly Proc[] => state.processes ?? [];
/** The learner's terminal. */
export const SESSION_TTY = 'pts/0';
/** At most this many processes (the engine starts some: sleep &, services). */
export const MAX_PROCESSES = 200;

/** The standard Linux signals (x86 and arm numbering), as bash's kill -l lists them. */
export const SIGNALS: readonly string[] = ['', 'HUP', 'INT', 'QUIT', 'ILL', 'TRAP', 'ABRT', 'BUS', 'FPE', 'KILL', 'USR1', 'SEGV', 'USR2', 'PIPE', 'ALRM', 'TERM',
  'STKFLT', 'CHLD', 'CONT', 'STOP', 'TSTP', 'TTIN', 'TTOU', 'URG', 'XCPU', 'XFSZ', 'VTALRM', 'PROF', 'WINCH', 'IO', 'PWR', 'SYS'];
export const SIG = { HUP: 1, INT: 2, QUIT: 3, KILL: 9, TERM: 15, CONT: 18, STOP: 19 } as const;
/** How bash reports a job that a signal ended. */
const JOB_STATUS: Record<number, string> = { 1: 'Hangup', 2: 'Interrupt', 3: 'Quit', 6: 'Aborted', 9: 'Killed', 10: 'User defined signal 1', 11: 'Segmentation fault', 12: 'User defined signal 2', 13: 'Broken pipe', 14: 'Alarm clock', 15: 'Terminated' };
/** Signals whose default action is to ignore them, or to stop the process. */
const IGNORED = new Set([0, 17, 23, 28]);
const STOPPING = new Set([19, 20, 21, 22]);

/** A signal written as 9, KILL, SIGKILL or sigkill; undefined when it is not one. */
export function parseSignal(text: string): number | undefined {
  if (/^\d+$/.test(text)) { const n = Number(text); return n < SIGNALS.length ? n : undefined; }
  const name = text.toUpperCase().replace(/^SIG/, '');
  const at = SIGNALS.indexOf(name);
  return at > 0 ? at : undefined;
}

/** The process name (comm): the last part of the first word, without a login shell's - or a title's :, at most 15 characters. */
export function commOf(command: string): string {
  const kernel = /^\[(.+)\]$/.exec(command);
  if (kernel) return kernel[1];
  const first = command.split(/\s+/)[0] ?? '';
  return first.slice(first.lastIndexOf('/') + 1).replace(/^-/, '').replace(/:$/, '').slice(0, 15);
}
const isKernel = (p: Proc) => /^\[.+\]$/.test(p.command);
/** %MEM: RSS over the machine's memory. */
const memOf = (p: Proc, clock: Clock) => clock.memory.total ? p.rss / (clock.memory.total * 1024) * 100 : 0;
const fixed1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
/** ps TIME in the BSD format: minutes:seconds. */
const shortTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
/** ps TIME in the Unix format: HH:MM:SS. */
const longTime = (s: number) => { const t = Math.floor(s); return [Math.floor(t / 3600), Math.floor((t % 3600) / 60), t % 60].map(n => String(n).padStart(2, '0')).join(':'); };
/** top TIME+: minutes:seconds.hundredths. */
const topTime = (s: number) => { const h = Math.round(s * 100); return `${Math.floor(h / 6000)}:${String(Math.floor((h % 6000) / 100)).padStart(2, '0')}.${String(h % 100).padStart(2, '0')}`; };
/** procps shortens a user name longer than 8 characters to 7 and a +. */
const userCol = (name: string) => name.length > 8 ? `${name.slice(0, 7)}+` : name;

/** What the commands of this module write, and as whom they run. */
export interface ProcIo {
  out(line: string): void;
  err(line: string): void;
  /** The effective user (root under sudo). */
  user: string;
  /** Whether this is /bin/kill run by sudo (procps' messages) rather than bash's builtin. */
  sudo?: boolean;
}

/** The session shell's pid: the learner's bash on the terminal, or 1. */
export function shellPid(state: FsState): number {
  return tableOf(state).find(p => p.tty === SESSION_TTY && p.user === state.user && commOf(p.command) === 'bash')?.pid ?? 1;
}
/** The pid the next new process gets (Linux hands them out in order; the simulation never reuses one). */
export const nextPid = (state: Pick<FsState, 'lastPid' | 'processes'>) => (state.lastPid ?? Math.max(0, ...tableOf(state).map(p => p.pid))) + 1;

// ---------------------------------------------------------------------------------------------------------------- ps

interface Column { header: string; width: number; right: boolean; value: (p: Proc) => string }
const PS_USAGE = ['', 'Usage:', ' ps [options]', '', " Try 'ps --help <simple|list|output|threads|misc|all>'", "  or 'ps --help <s|l|o|t|m|a>'", ' for additional help text.', '', 'For more details see ps(1).'];

function columns(clock: Clock): Record<string, Column> {
  const col = (header: string, width: number, right: boolean, value: (p: Proc) => string): Column => ({ header, width, right, value });
  const args = (p: Proc) => p.command;
  return {
    pid: col('PID', 7, true, p => String(p.pid)), ppid: col('PPID', 7, true, p => String(p.ppid)),
    user: col('USER', 8, false, p => userCol(p.user)), uid: col('UID', 8, false, p => userCol(p.user)),
    '%cpu': col('%CPU', 4, true, p => fixed1(p.cpu)), pcpu: col('%CPU', 4, true, p => fixed1(p.cpu)),
    '%mem': col('%MEM', 4, true, p => fixed1(memOf(p, clock))), pmem: col('%MEM', 4, true, p => fixed1(memOf(p, clock))),
    vsz: col('VSZ', 6, true, p => String(p.vsz)), rss: col('RSS', 5, true, p => String(p.rss)),
    tty: col('TT', 8, false, p => p.tty), stat: col('STAT', 4, false, p => p.stat), ni: col('NI', 3, true, p => String(p.nice)), nice: col('NI', 3, true, p => String(p.nice)),
    time: col('TIME', 8, true, p => longTime(p.time)), comm: col('COMMAND', 15, false, p => commOf(p.command)),
    args: col('COMMAND', 0, false, args), command: col('COMMAND', 0, false, args), cmd: col('CMD', 0, false, args),
    c: col('C', 2, true, p => String(Math.min(99, Math.floor(p.cpu)))),
  };
}

function table(rows: readonly Proc[], cols: readonly Column[]): string[] {
  // Right-aligned columns are always padded; the last left-aligned one is not (procps).
  const line = (cells: string[]) => cells.map((cell, i) => cols[i].right ? cell.padStart(cols[i].width) : i === cells.length - 1 ? cell : cell.padEnd(cols[i].width)).join(' ');
  return [line(cols.map(c => c.header)), ...rows.map(p => line(cols.map(c => c.value(p))))];
}

/** ps rows that compare by a --sort key (desc with a leading -). */
function sorter(keys: readonly string[], clock: Clock): ((a: Proc, b: Proc) => number) | string {
  const value: Record<string, (p: Proc) => number | string> = {
    pid: p => p.pid, ppid: p => p.ppid, user: p => p.user, '%cpu': p => p.cpu, pcpu: p => p.cpu, '%mem': p => memOf(p, clock), pmem: p => memOf(p, clock),
    rss: p => p.rss, vsz: p => p.vsz, time: p => p.time, ni: p => p.nice, comm: p => commOf(p.command), start: p => p.start,
  };
  const parts: [(p: Proc) => number | string, number][] = [];
  for (const raw of keys) {
    const desc = raw.startsWith('-'), name = raw.replace(/^[+-]/, '');
    if (!value[name]) return name;
    parts.push([value[name], desc ? -1 : 1]);
  }
  return (a, b) => {
    for (const [f, dir] of parts) { const x = f(a), y = f(b); if (x !== y) return (x < y ? -1 : 1) * dir; }
    return a.pid - b.pid;
  };
}

/**
 * ps: BSD `aux` (or any of a, u, x with u), or the Unix options -e/-A, -f, -u users, -p pids, -o fields and --sort keys.
 * The commands of the current line (ps itself, and the grep of `ps aux | grep x`) are listed too, as on Linux, with the
 * next free pids. Returns the exit status.
 */
export function ps(state: FsState, args: readonly string[], io: ProcIo, peers: readonly string[][]): number {
  const clock = clockOf(state), cols = columns(clock);
  const bad = (line: string) => { io.err(line); PS_USAGE.forEach(l => io.err(l)); return 1; };
  let rest = [...args], bsd: string | null = null;
  if (rest[0] && !rest[0].startsWith('-')) {
    bsd = rest.shift()!;
    if (!/^[auxw]+$/.test(bsd)) return bad('error: unsupported option (BSD syntax)');
    if (!bsd.includes('u')) { io.err('ps: 模擬環境的 BSD 格式只支援 u（例如 ps aux）；也可以用 ps -ef'); return 1; }
  }
  rest = rest.map(a => a.startsWith('--sort') ? a.replace(/^--sort/, '--\x01') : a);
  const o = getopt(rest, 'eAfu:p:o:\x01:', { '\x01': '\x01' });
  if ('error' in o) return bad('error: unsupported SysV option');
  if (o.operands.length) return bad('error: garbage option');
  const list = (f: string) => (o.flags.get(f) ?? []).flatMap(v => v.split(/[,\s]+/)).filter(Boolean);
  const acc = accountsOf(state);
  const users: string[] = [];
  for (const u of list('u')) {
    const found = findUser(acc, u) ?? (/^\d+$/.test(u) ? acc.users.find(x => x.uid === Number(u)) : undefined);
    if (!found) return bad('error: user name does not exist');
    users.push(found.name);
  }
  const pids = list('p');
  if (pids.some(p => !/^\d+$/.test(p))) return bad('error: process ID list syntax error');
  const fields = list('o');
  const unknown = fields.find(f => !cols[f]);
  if (unknown) return bad(`error: unknown user-defined format specifier "${unknown}"`);
  const order = sorter(list('\x01'), clock);
  if (typeof order === 'string') { io.err(`error: unknown sort specifier "${order}"`); return 1; }

  // The line's own commands are processes too while ps reads the table.
  const base = nextPid(state), parent = shellPid(state);
  const own: Proc[] = peers.map((argv, i) => ({
    pid: base + i, ppid: parent, user: io.user, command: argv.join(' '), stat: argv[0] === 'ps' ? 'R+' : 'S+', cpu: 0, rss: 3840, vsz: 9120, shr: 3200,
    tty: SESSION_TTY, start: clock.now, time: 0, nice: 0,
  }));
  const all = [...tableOf(state), ...own];
  const a = bsd?.includes('a'), x = bsd?.includes('x');
  const selected = all.filter(p => {
    if (bsd !== null) return (a && x) || (a ? p.tty !== '?' : x ? p.user === io.user : p.user === io.user && p.tty === SESSION_TTY);
    if (o.flags.has('e') || o.flags.has('A')) return true;
    if (users.length || pids.length) return users.includes(p.user) || pids.includes(String(p.pid));
    return p.user === io.user && p.tty === SESSION_TTY;
  }).sort(order);
  const tty = { ...cols.tty, header: 'TTY' };
  const layout = fields.length ? fields.map(f => cols[f])
    : bsd !== null ? [cols.user, cols.pid, cols['%cpu'], cols['%mem'], cols.vsz, cols.rss, tty, cols.stat, { header: 'START', width: 5, right: true, value: (p: Proc) => startLabel(p.start, clock.now) }, { header: 'TIME', width: 6, right: true, value: (p: Proc) => shortTime(p.time) }, cols.command]
      : o.flags.has('f') ? [cols.uid, cols.pid, cols.ppid, cols.c, { header: 'STIME', width: 5, right: false, value: (p: Proc) => startLabel(p.start, clock.now) }, tty, cols.time, cols.cmd]
        : [cols.pid, tty, cols.time, { ...cols.comm, header: 'CMD' }];
  table(selected, layout).forEach(l => io.out(l));
  return pids.length && !selected.length ? 1 : 0;
}

// --------------------------------------------------------------------------------------------------------------- top

/** The first line of top and the whole of uptime: 10:00:00 up 1 day,  1:00,  1 user,  load average: 0.52, 0.48, 0.40 */
export function uptimeLine(state: FsState): string {
  const c = clockOf(state);
  return `${clockText(c.now)} up ${uptimeText(c.now - c.boot)}  1 user,  load average: ${c.load.map(n => n.toFixed(2)).join(', ')}`;
}

/** top -b -n 1 [-o field] [-u user] [-c]: one snapshot in batch mode. */
export function top(state: FsState, args: readonly string[], io: ProcIo): number {
  const o = getopt(args, 'bn:o:u:cE:', {});
  if ('error' in o) { io.err(`top: ${o.error}`); io.err('Usage:'); io.err('  top -hv | -bcEeHiOSs1 -d secs -n max -u|U user -p pid(s) -o field -w [cols]'); return 1; }
  const iterations = o.flags.get('n')?.at(-1);
  if (!o.flags.has('b') || iterations !== '1') { io.err('top: 模擬環境沒有會更新的全螢幕畫面：請用 top -b -n 1 取得一次快照'); return 1; }
  const clock = clockOf(state), all = [...tableOf(state)];
  const field = o.flags.get('o')?.at(-1) ?? '%CPU';
  const keys: Record<string, (p: Proc) => number | string> = { '%CPU': p => p.cpu, '%MEM': p => p.rss, PID: p => p.pid, RES: p => p.rss, 'TIME+': p => p.time, USER: p => p.user, VIRT: p => p.vsz };
  const key = keys[field.replace(/^[+-]/, '')];
  if (!key) { io.err(`top: unrecognized field name '${field}'`); return 1; }
  const who = o.flags.get('u')?.at(-1);
  if (who !== undefined && !findUser(accountsOf(state), who)) { io.err('top: Invalid user'); return 1; }
  const asc = field.startsWith('+') || field === 'USER';
  const rows = all.filter(p => who === undefined || p.user === who)
    .sort((a, b) => { const x = key(a), y = key(b); return x === y ? a.pid - b.pid : (x < y ? -1 : 1) * (asc ? 1 : -1); });
  const count = (letters: string) => all.filter(p => letters.includes(p.stat[0])).length;
  const n3 = (n: number) => String(n).padStart(3);
  const used = all.reduce((s, p) => s + p.rss, 0) / 1024, mem = clock.memory;
  const free = Math.max(0, mem.total - used - mem.cache);
  const us = Math.round(Math.min(100, all.reduce((s, p) => s + p.cpu, 0) / Math.max(1, clock.cpus)) * 10) / 10;
  const f81 = (n: number) => (Math.round(n * 10) / 10).toFixed(1).padStart(8), f41 = (n: number) => (Math.round(n * 10) / 10).toFixed(1).padStart(4);
  io.out(`top - ${uptimeLine(state)}`);
  io.out(`Tasks: ${n3(all.length)} total, ${n3(count('R'))} running, ${n3(count('SDI'))} sleeping, ${n3(count('T'))} stopped, ${n3(count('Z'))} zombie`);
  io.out(`%Cpu(s): ${f41(us)} us, ${f41(0)} sy, ${f41(0)} ni, ${f41(100 - us)} id, ${f41(0)} wa, ${f41(0)} hi, ${f41(0)} si, ${f41(0)} st`);
  io.out(`MiB Mem : ${f81(mem.total)} total, ${f81(free)} free, ${f81(used)} used, ${f81(mem.cache)} buff/cache`);
  io.out(`MiB Swap: ${f81(mem.swap)} total, ${f81(mem.swap)} free, ${f81(0)} used. ${f81(free + mem.cache)} avail Mem`);
  io.out('');
  const full = o.flags.has('c');
  io.out('    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND');
  for (const p of rows) {
    io.out([String(p.pid).padStart(7), userCol(p.user).padEnd(8), String(20 + p.nice).padStart(3), String(p.nice).padStart(3), String(p.vsz).padStart(7), String(p.rss).padStart(6),
      String(p.shr).padStart(6), p.stat[0], fixed1(p.cpu).padStart(5), fixed1(memOf(p, clock)).padStart(5), topTime(p.time).padStart(9), full ? p.command : commOf(p.command)].join(' '));
  }
  return 0;
}

// ------------------------------------------------------------------------------------------------------------ signals

/** What a signal did: the new table (and jobs), the processes that ended (with the signal), and bash's job notices. */
export interface Delivery { state: FsState; ended: { proc: Proc; signal: number }[]; notices: string[] }

const jobMark = (jobs: readonly Job[], job: Job) => job === jobs.at(-1) ? '+' : job === jobs.at(-2) ? '-' : ' ';
const jobLine = (jobs: readonly Job[], job: Job, status: string, command: string) => `[${job.id}]${jobMark(jobs, job)}  ${status.padEnd(24)}${command}`;

/** Removes a process (and its service's other processes; other children go to pid 1, zombies are reaped). */
function remove(table: Proc[], pid: number): Proc[] {
  const gone = table.find(p => p.pid === pid);
  if (!gone) return table;
  const dying = new Set([pid, ...gone.unit ? table.filter(p => p.unit === gone.unit && p.ppid === pid).map(p => p.pid) : []]);
  return table.filter(p => !dying.has(p.pid) && !(p.stat.startsWith('Z') && dying.has(p.ppid))).map(p => dying.has(p.ppid) ? { ...p, ppid: 1 } : p);
}

/**
 * Sends a signal to processes the caller may signal (the owner or root; the caller checks that). Pid 1, kernel threads
 * and zombies are not affected. KILL always ends a process; STOP stops and CONT continues it; TERM, HUP and INT follow the
 * process's declared reaction (a stopped process keeps a terminating signal until it is continued); other signals end it
 * unless their default is to ignore them.
 */
export function deliver(state: FsState, pids: readonly number[], signal: number): Delivery {
  let table = [...tableOf(state)], jobs = [...state.jobs ?? []];
  const ended: Delivery['ended'] = [], notices: string[] = [];
  const end = (p: Proc, sig: number) => {
    ended.push({ proc: p, signal: sig });
    table = remove(table, p.pid);
    const job = jobs.find(j => j.pid === p.pid);
    if (job) { notices.push(jobLine(jobs, job, JOB_STATUS[sig] ?? 'Terminated', job.command)); jobs = jobs.filter(j => j !== job); }
  };
  const react = (p: Proc, sig: number): void => {
    const stopped = p.stat.startsWith('T');
    if (sig === SIG.KILL) return end(p, sig);
    if (STOPPING.has(sig)) {
      if (!stopped) {
        table = table.map(q => q.pid === p.pid ? { ...q, stat: `T${q.stat.slice(1).replace('+', '')}` } : q);
        const job = jobs.find(j => j.pid === p.pid);
        if (job) notices.push(jobLine(jobs, job, 'Stopped', job.command));
      }
      return;
    }
    if (sig === SIG.CONT) {
      if (!stopped) return;
      const resumed = { ...p, stat: `S${p.stat.slice(1)}` };
      delete resumed.pending;
      table = table.map(q => q.pid === p.pid ? resumed : q);
      if (p.pending) react(resumed, p.pending);
      return;
    }
    if (IGNORED.has(sig)) return;
    const reaction = sig === SIG.TERM ? p.term : sig === SIG.HUP ? p.hup : sig === SIG.INT ? p.int : undefined;
    if (reaction === 'ignore' || reaction === 'reload') return;
    if (stopped) { table = table.map(q => q.pid === p.pid ? { ...q, pending: sig } : q); return; }
    end(p, sig);
  };
  for (const pid of pids) {
    const p = table.find(q => q.pid === pid);
    if (!p || p.pid === 1 || isKernel(p) || p.stat.startsWith('Z')) continue;
    react(p, signal);
  }
  return { state: { ...state, processes: table, jobs }, ended, notices };
}

/** A job spec (%1, %%, %+, %-) of the session, or undefined. */
function findJob(jobs: readonly Job[], spec: string): Job | undefined {
  if (spec === '%%' || spec === '%+' || spec === '%') return jobs.at(-1);
  if (spec === '%-') return jobs.at(-2);
  const m = /^%(\d+)$/.exec(spec);
  return m ? jobs.find(j => j.id === Number(m[1])) : undefined;
}

export interface KillResult { state: FsState; status: number; ended: Delivery['ended']; notices: string[] }

/** bash's kill builtin (and /bin/kill under sudo): kill [-s SIG | -n N | -SIG | -N] pid|%job…, kill -l [SIG]. */
export function kill(state: FsState, args: readonly string[], io: ProcIo): KillResult {
  const fail = (line: string) => io.err(io.sudo ? line.replace(/^bash: /, '') : line);
  const done = (status: number, next = state, ended: Delivery['ended'] = [], notices: string[] = []): KillResult => ({ state: next, status, ended, notices });
  const usage = () => { io.err('kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]'); return done(2); };
  if (!args.length) return usage();
  if (args[0] === '-l' || args[0] === '-L') {
    if (args.length === 1) {
      const rows: string[] = [];
      for (let i = 1; i < SIGNALS.length; i += 5) rows.push(SIGNALS.slice(i, i + 5).map((n, j) => `${String(i + j).padStart(2)}) SIG${n}`).join('\t'));
      rows.forEach(r => io.out(r));
      return done(0);
    }
    let status = 0;
    for (const a of args.slice(1)) {
      const n = parseSignal(/^\d+$/.test(a) && Number(a) > 128 ? String(Number(a) - 128) : a);
      if (n === undefined || n === 0) { fail(`bash: kill: ${a}: invalid signal specification`); status = 1; continue; }
      io.out(/^\d+$/.test(a) ? SIGNALS[n] : String(n));
    }
    return done(status);
  }
  let signal: number = SIG.TERM, i = 0;
  if (args[0] === '-s' || args[0] === '-n') {
    if (args.length < 2) { fail(`bash: kill: ${args[0]}: option requires an argument`); return usage(); }
    const n = parseSignal(args[1]);
    if (n === undefined) { fail(`bash: kill: ${args[1]}: invalid signal specification`); return done(1); }
    signal = n; i = 2;
  } else if (args[0] === '--') i = 1;
  else if (/^-./.test(args[0])) {
    const n = parseSignal(args[0].slice(1));
    if (n === undefined) { fail(`bash: kill: ${args[0].slice(1)}: invalid signal specification`); return done(1); }
    signal = n; i = 1;
    if (args[1] === '--') i = 2;
  }
  const targets = args.slice(i);
  if (!targets.length) return usage();
  let next = state, status = 0;
  const ended: Delivery['ended'] = [], notices: string[] = [];
  for (const t of targets) {
    let pid: number;
    if (t.startsWith('%')) {
      const job = findJob(next.jobs ?? [], t);
      if (!job) { fail(`bash: kill: ${t}: no such job`); status = 1; continue; }
      pid = job.pid;
    } else if (/^\d+$/.test(t)) pid = Number(t);
    else { fail(`bash: kill: ${t}: arguments must be process or job IDs`); status = 1; continue; }
    const p = tableOf(next).find(q => q.pid === pid);
    if (!p) { fail(io.sudo ? `kill: (${pid}): No such process` : `bash: kill: (${pid}) - No such process`); status = 1; continue; }
    if (io.user !== 'root' && p.user !== io.user) { fail(io.sudo ? `kill: (${pid}): Operation not permitted` : `bash: kill: (${pid}) - Operation not permitted`); status = 1; continue; }
    // bash continues a stopped job it signals, so that the signal can act (kill %1 ends a stopped job).
    const isJob = t.startsWith('%') && p.stat.startsWith('T') && signal !== SIG.KILL && signal !== SIG.CONT && !STOPPING.has(signal);
    const d = deliver(next, [pid], signal);
    next = d.state; ended.push(...d.ended); notices.push(...d.notices);
    if (isJob) { const c = deliver(next, [pid], SIG.CONT); next = c.state; ended.push(...c.ended); notices.push(...c.notices); }
  }
  return done(status, next, ended, notices);
}

/** pgrep, pidof and pkill: the processes whose name (or with -f, command line) matches. */
function matching(state: FsState, pattern: string, o: { full: boolean; exact: boolean; users: readonly string[] }): Proc[] | string {
  const c = compilePattern(pattern, true);
  if ('error' in c) return c.error;
  const re = new RegExp(o.exact ? `^(?:${c.source})$` : c.source, 'u');
  return tableOf(state).filter(p => (!o.users.length || o.users.includes(p.user)) && re.test(o.full ? p.command : commOf(p.command)));
}

/** pgrep [-l] [-a] [-f] [-x] [-n] [-o] [-u users] pattern; pkill [-SIG] [-f] [-x] [-u users] pattern. */
export function pgrep(state: FsState, cmd: 'pgrep' | 'pkill', args: readonly string[], io: ProcIo): KillResult {
  const done = (status: number, next = state, ended: Delivery['ended'] = [], notices: string[] = []): KillResult => ({ state: next, status, ended, notices });
  let rest = [...args], signal: number = SIG.TERM;
  if (cmd === 'pkill' && rest[0] && /^-[A-Za-z0-9]+$/.test(rest[0]) && !/^-[fxu]+$/.test(rest[0])) {
    const n = parseSignal(rest[0].slice(1));
    if (n !== undefined) { signal = n; rest = rest.slice(1); }
  }
  const o = getopt(rest, cmd === 'pgrep' ? 'lafxnou:' : 'fxu:', {});
  if ('error' in o) { io.err(`${cmd}: ${o.error}`); io.err(`Try \`${cmd} --help' for more information.`); return done(2); }
  if (o.operands.length !== 1) {
    io.err(o.operands.length ? `${cmd}: only one pattern can be provided` : `${cmd}: no matching criteria specified`);
    io.err(`Try \`${cmd} --help' for more information.`);
    return done(2);
  }
  const users = (o.flags.get('u') ?? []).flatMap(v => v.split(','));
  const found = matching(state, o.operands[0], { full: o.flags.has('f'), exact: o.flags.has('x'), users });
  if (typeof found === 'string') { io.err(`${cmd}: ${found}`); return done(2); }
  let procs = found.sort((a, b) => a.pid - b.pid);
  if (o.flags.has('n')) procs = procs.slice(-1);
  if (o.flags.has('o')) procs = procs.slice(0, 1);
  if (cmd === 'pgrep') {
    for (const p of procs) io.out(o.flags.has('a') ? `${p.pid} ${p.command}` : o.flags.has('l') ? `${p.pid} ${commOf(p.command)}` : String(p.pid));
    return done(procs.length ? 0 : 1);
  }
  let next = state;
  const ended: Delivery['ended'] = [], notices: string[] = [];
  for (const p of procs) {
    if (io.user !== 'root' && p.user !== io.user) { io.err(`pkill: killing pid ${p.pid} failed: Operation not permitted`); continue; }
    const d = deliver(next, [p.pid], signal);
    next = d.state; ended.push(...d.ended); notices.push(...d.notices);
  }
  return done(procs.length ? 0 : 1, next, ended, notices);
}

/** pidof name…: the pids of programs with that name, newest first, on one line. */
export function pidof(state: FsState, args: readonly string[], io: ProcIo): number {
  const names = args.filter(a => !a.startsWith('-'));
  const pids = tableOf(state).filter(p => !isKernel(p) && names.some(n => commOf(p.command) === n || p.command.split(/\s+/)[0] === n)).map(p => p.pid).sort((a, b) => b - a);
  if (pids.length) io.out(pids.join(' '));
  return pids.length ? 0 : 1;
}

// --------------------------------------------------------------------------------------------------------------- jobs

const SLEEP = /^(\d+(?:\.\d+)?)([smhd]?)$/;
/** sleep's operand check (no clock: the time never passes, so sleep returns at once). */
export function sleepProblem(args: readonly string[]): string | null {
  if (!args.length) return 'sleep: missing operand';
  const bad = args.find(a => !SLEEP.test(a));
  return bad === undefined ? null : `sleep: invalid time interval '${bad}'`;
}

/** `sleep N &`: a background job and its process; returns bash's "[1] 2041". */
export function startJob(state: FsState, argv: readonly string[]): { state: FsState; notice: string } {
  const jobs = state.jobs ?? [], pid = nextPid(state), id = Math.max(0, ...jobs.map(j => j.id)) + 1, command = argv.join(' ');
  const proc: Proc = { pid, ppid: shellPid(state), user: state.user, command, stat: 'S', cpu: 0, rss: 1792, vsz: 8288, shr: 1664, tty: SESSION_TTY, start: clockOf(state).now, time: 0, nice: 0 };
  return { state: { ...state, processes: [...tableOf(state), proc], lastPid: pid, jobs: [...jobs, { id, pid, command }] }, notice: `[${id}] ${pid}` };
}

/** jobs [-l]: the session's background jobs. */
export function jobsCommand(state: FsState, args: readonly string[], io: ProcIo): number {
  const bad = args.find(a => a !== '-l');
  if (bad !== undefined) { io.err(bad.startsWith('-') ? `bash: jobs: ${bad}: invalid option` : `bash: jobs: ${bad}: no such job`); if (bad.startsWith('-')) io.err('jobs: usage: jobs [-lnprs] [jobspec ...] or jobs -x command [args]'); return bad.startsWith('-') ? 2 : 1; }
  const jobs = state.jobs ?? [], long = args.includes('-l');
  for (const job of jobs) {
    const p = tableOf(state).find(q => q.pid === job.pid), stopped = p?.stat.startsWith('T');
    const status = stopped ? 'Stopped' : 'Running', command = stopped ? job.command : `${job.command} &`;
    io.out(long ? `[${job.id}]${jobMark(jobs, job)}  ${job.pid} ${status.padEnd(24)}${command}` : jobLine(jobs, job, status, command));
  }
  return 0;
}

/**
 * fg [%N]: the job comes to the foreground and, because the simulated clock never moves, its sleep returns at once (the
 * job ends with status 0). bg [%N]: a stopped job continues in the background.
 */
export function fgBg(state: FsState, cmd: 'fg' | 'bg', args: readonly string[], io: ProcIo): { state: FsState; status: number } {
  const jobs = state.jobs ?? [], spec = args[0] ?? '%+';
  const job = findJob(jobs, spec.startsWith('%') ? spec : `%${spec}`);
  if (!job) { io.err(`bash: ${cmd}: ${args[0] ?? 'current'}: no such job`); return { state, status: 1 }; }
  const p = tableOf(state).find(q => q.pid === job.pid);
  if (cmd === 'bg') {
    if (!p?.stat.startsWith('T')) { io.err(`bash: bg: job ${job.id} already in background`); return { state, status: 0 }; }
    io.out(`[${job.id}]${jobMark(jobs, job)} ${job.command} &`);
    return { state: { ...state, processes: tableOf(state).map(q => q.pid === p.pid ? { ...q, stat: `S${q.stat.slice(1)}` } : q) }, status: 0 };
  }
  io.out(job.command);
  return { state: { ...state, processes: tableOf(state).filter(q => q.pid !== job.pid), jobs: jobs.filter(j => j !== job) }, status: 0 };
}
