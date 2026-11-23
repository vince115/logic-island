import { isoText, type Seconds } from './clock';
import { resolvePath, type FsState } from './fs';
import { clockOf, longTime, parseSignal, SIGNALS, startText, tableOf, type Proc } from './processes';
import { advanceClock } from './shell';
import {
  containerEnv, dropAnonymous, effective, findContainer, formatted, imageById, seedLines, short, start, stopped, syncDocker, withLogs,
  type DockerContainer, type DockerImage, type DockerState, type LogLine, type LogSeed,
} from './docker';
import { advanceHealth } from './health';
import { STRUCTS } from './storage-net-cli';

/*
 * Engine stage E24 (docs/curriculum/DKR0_CONTAINER_CAPABILITY.md §14): the runtime profile — what a container's main process
 * does over time and what the daemon does about it. Nothing runs: the lesson declares a program's (or an image's) behaviour
 * — the environment variables it needs, when it exits on its own, how much memory it uses over time, its CPU, the signals
 * it handles (how long it takes, what it logs, its exit code), the paths it writes and the capabilities it needs — and the
 * daemon applies the container's limits (an OOM kill at the moment the memory crosses the limit: exit 137, OOMKilled),
 * restart policies (moby's restart manager: 100 ms doubled after each restart up to one minute, reset after ten seconds of
 * running; on-failure:N gives up after N restarts), and docker stop's grace period (the stop signal to PID 1, then SIGKILL
 * after the timeout; the clock moves by the time waited). PID 1 matters: a shell-form CMD makes /bin/sh PID 1, which does
 * not forward SIGTERM, so the program is killed after the timeout; the exec form, `exec` in the shell line, or --init
 * (docker-init forwards signals) let the program handle it. Every transition happens at a computed time, so `sleep` (or a
 * docker stop that waits) is what makes them happen; the next docker command (or a check) sees the daemon as it is then.
 */

/** E24: what a container's main process does over time (a program's or an image's, as the lesson declares it). */
export interface RuntimeSpec {
  /** Environment variables it needs (missing or empty: it prints missingEnv on standard error and exits). */
  needsEnv?: readonly string[];
  missingEnv?: { output: string; exit: number };
  /** It exits on its own this many seconds after the start (a crash or a finished job), printing these lines first. */
  exitAfter?: { seconds: number; exit: number; logs: readonly LogSeed[] };
  /** Memory in bytes: at the start, growth per second, and a ceiling it stays at. */
  memory?: { start: number; growth: number; max?: number };
  /** CPU percent of one CPU (docker stats) and how many processes it has. */
  cpu?: number;
  pids?: number;
  /** The signals it handles (TERM, INT, QUIT…): it logs these lines, then exits with `exit` after `seconds`. */
  signals?: Readonly<Record<string, { seconds: number; logs: readonly LogSeed[]; exit: number }>>;
  /** Paths it writes at the start (relative to the working directory); on a read-only root file system it prints readOnlyError and exits. */
  writes?: readonly string[];
  readOnlyError?: { output: string; exit: number };
  /** Linux capabilities it needs (CHOWN, SETUID, SETGID, NET_BIND_SERVICE…); without one it prints capMissing and exits. */
  caps?: readonly string[];
  capMissing?: { output: string; exit: number };
}
/** E24: a container's resource limits (HostConfig: bytes, CPUs × 10^9, relative shares). */
export interface Limits { memory?: number; memorySwap?: number; nanoCpus?: number; cpuShares?: number }
/** E24: an event of the daemon's (docker events): when, the action, the container and its attributes. */
export interface DockerEvent { t: Seconds; action: string; id: string; attrs: Readonly<Record<string, string>> }

export const RUNTIME_STAGE = 'E24（健康檢查、資源限制與重新啟動）';
/** Docker's default capabilities (moby's oci/caps DefaultCapabilities). */
export const DEFAULT_CAPS = ['CAP_CHOWN', 'CAP_DAC_OVERRIDE', 'CAP_FSETID', 'CAP_FOWNER', 'CAP_MKNOD', 'CAP_NET_RAW', 'CAP_SETGID', 'CAP_SETUID', 'CAP_SETFCAP', 'CAP_SETPCAP', 'CAP_NET_BIND_SERVICE', 'CAP_SYS_CHROOT', 'CAP_KILL', 'CAP_AUDIT_WRITE'];
/** The Linux capabilities moby knows (a name outside them is "unknown capability"). */
export const ALL_CAPS = ['CAP_CHOWN', 'CAP_DAC_OVERRIDE', 'CAP_DAC_READ_SEARCH', 'CAP_FOWNER', 'CAP_FSETID', 'CAP_KILL', 'CAP_SETGID', 'CAP_SETUID', 'CAP_SETPCAP', 'CAP_LINUX_IMMUTABLE', 'CAP_NET_BIND_SERVICE',
  'CAP_NET_BROADCAST', 'CAP_NET_ADMIN', 'CAP_NET_RAW', 'CAP_IPC_LOCK', 'CAP_IPC_OWNER', 'CAP_SYS_MODULE', 'CAP_SYS_RAWIO', 'CAP_SYS_CHROOT', 'CAP_SYS_PTRACE', 'CAP_SYS_PACCT', 'CAP_SYS_ADMIN', 'CAP_SYS_BOOT',
  'CAP_SYS_NICE', 'CAP_SYS_RESOURCE', 'CAP_SYS_TIME', 'CAP_SYS_TTY_CONFIG', 'CAP_MKNOD', 'CAP_LEASE', 'CAP_AUDIT_WRITE', 'CAP_AUDIT_CONTROL', 'CAP_SETFCAP', 'CAP_MAC_OVERRIDE', 'CAP_MAC_ADMIN', 'CAP_SYSLOG',
  'CAP_WAKE_ALARM', 'CAP_BLOCK_SUSPEND', 'CAP_AUDIT_READ', 'CAP_PERFMON', 'CAP_BPF', 'CAP_CHECKPOINT_RESTORE'];
/** docker/cli's NormalizeCapability: upper case with the CAP_ prefix (ALL stays ALL); null when moby does not know it. */
export function normalizeCap(text: string): string | null {
  const t = text.trim().toUpperCase();
  if (t === 'ALL') return 'ALL';
  const name = t.startsWith('CAP_') ? t : `CAP_${t}`;
  return ALL_CAPS.includes(name) ? name : null;
}
/** The capabilities a container's processes have (--privileged: all; else the default set, minus --cap-drop, plus --cap-add). */
export function capsOf(c: Pick<DockerContainer, 'privileged' | 'capAdd' | 'capDrop'>): Set<string> {
  if (c.privileged) return new Set(ALL_CAPS);
  const set = new Set(DEFAULT_CAPS);
  for (const x of c.capDrop ?? []) { if (x === 'ALL') set.clear(); else set.delete(x); }
  for (const x of c.capAdd ?? []) { if (x === 'ALL') ALL_CAPS.forEach(k => set.add(k)); else set.add(x); }
  return set;
}

/** go-units' RAMInBytes (binary: 64m is 64 MiB); null when it is not a size. */
export function parseBytes(text: string): number | null {
  const m = /^(\d+(?:\.\d+)?) ?([kKmMgGtTpP])?[iI]?[bB]?$/.exec(text.trim());
  if (!m) return null;
  const unit = { '': 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3, t: 1024 ** 4, p: 1024 ** 5 }[(m[2] ?? '').toLowerCase() as '' | 'k'];
  return Math.floor(Number(m[1]) * unit);
}
/** go-units' BytesSize (binary units, 4 significant digits: 7.598MiB, 2GiB). */
export function bytesText(bytes: number): string {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let size = bytes, i = 0;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  const t = size.toPrecision(4), s = t.includes('e') ? String(Math.round(size)) : t.includes('.') ? t.replace(/0+$/, '').replace(/\.$/, '') : t;
  return `${s}${units[i]}`;
}

/** A restart policy as moby keeps it (Name and MaximumRetryCount). */
export function policyOf(text: string | undefined): { name: string; max: number } {
  if (!text) return { name: 'no', max: 0 };
  const [name, count] = text.split(':');
  return { name: name || 'no', max: count ? Number(count) : 0 };
}
/** --restart: docker/cli's ParseRestartPolicy, then moby's ValidateRestartPolicy (texts of Docker 27). */
export function restartProblem(text: string): { error: string; daemon: boolean } | null {
  const colon = text.indexOf(':'), name = colon < 0 ? text : text.slice(0, colon), count = colon < 0 ? '' : text.slice(colon + 1);
  if (colon === 0) return { error: 'invalid restart policy format: no policy provided before colon', daemon: false };
  if (count !== '' && !/^-?\d+$/.test(count)) return { error: 'invalid restart policy format: maximum retry count must be an integer', daemon: false };
  if (!['no', 'always', 'on-failure', 'unless-stopped'].includes(name)) return { error: `invalid restart policy: unknown policy '${name}'; use one of 'no', 'always', 'on-failure', or 'unless-stopped'`, daemon: true };
  if (count !== '' && Number(count) < 0) return { error: 'invalid restart policy: maximum retry count cannot be negative', daemon: true };
  if (count !== '' && Number(count) !== 0 && name !== 'on-failure') return { error: "invalid restart policy: maximum retry count can only be used with 'on-failure'", daemon: true };
  return null;
}
/** A signal as Docker reads it (SIGTERM, TERM, 15), by number; undefined when it is not one. */
export const signalNumber = (text: string): number | undefined => { const n = parseSignal(text); return n !== undefined && n > 0 ? n : undefined; };
export const signalName = (n: number) => `SIG${SIGNALS[n]}`;

/** E24: a container's external state: a container waiting for its restart is "restarting" (moby's StateString). */
export const stateOf = (c: DockerContainer): string => c.restartAt !== undefined ? 'restarting' : c.status;
/** Whether the main command is /bin/sh -c LINE without exec (a shell-form CMD): the shell stays and runs the program as its child. */
export function shellForm(c: DockerContainer): boolean {
  const argv = effective(c), name = argv[0]?.slice(argv[0].lastIndexOf('/') + 1);
  return (name === 'sh' || name === 'bash') && argv[1] === '-c' && argv.length >= 3 && !/^\s*exec\s/.test(argv[2]);
}
/** What PID 1 is: the program (exec form, `exec` in the shell line), /bin/sh -c (shell form: it does not forward signals) or docker-init (--init). */
export function pid1Of(c: DockerContainer): 'app' | 'shell' | 'init' {
  if (c.init) return 'init';
  return shellForm(c) ? 'shell' : 'app';
}
/** The processes of a running container from PID 1 down (their ps names and command lines): docker-init, then sh, then the program. */
export function processesOf(c: DockerContainer): { comm: string; command: string }[] {
  const argv = effective(c), main = argv.join(' ') || c.path, comm = (w: string) => { const first = w.split(' ')[0] ?? ''; return first.slice(first.lastIndexOf('/') + 1); };
  const chain = shellForm(c) ? (() => { const line = argv[2].replace(/^\s+/, ''); return [{ comm: comm(argv[0]), command: main }, { comm: comm(line), command: line }]; })() : [{ comm: comm(argv[0] ?? c.path), command: main }];
  return c.init ? [{ comm: 'docker-init', command: `/sbin/docker-init -- ${main}` }, ...chain] : chain;
}

// ------------------------------------------------------------------------------------------------- the main process

/** Why the main process stops right away (an environment variable it needs, a capability, a path it cannot write), or null. */
export function startFailure(host: FsState, d: DockerState, c: DockerContainer, spec: RuntimeSpec | undefined): { lines: { stream: 1 | 2; text: string }[]; exit: number } | null {
  if (!spec) return null;
  const lines = (text: string) => text.replace(/\n$/, '').split('\n').map(t => ({ stream: 2 as const, text: t }));
  const env = containerEnv(c, imageById(d, c.image));
  const missing = (spec.needsEnv ?? []).find(n => { const e = env.find(x => x.startsWith(`${n}=`)); return !e || e === `${n}=`; });
  if (missing !== undefined) return { lines: lines(spec.missingEnv?.output ?? `（模擬環境：程式需要環境變數 ${missing}，但容器沒有設定它）`), exit: spec.missingEnv?.exit ?? 1 };
  const caps = capsOf(c), lacking = (spec.caps ?? []).map(x => normalizeCap(x) ?? x).find(x => !caps.has(x));
  if (lacking !== undefined) return { lines: lines(spec.capMissing?.output ?? `（模擬環境：程式需要 ${lacking}，但容器沒有這個能力）`), exit: spec.capMissing?.exit ?? 1 };
  if (c.readOnly) {
    const writable = (p: string) => (c.mounts ?? []).some(m => !m.readonly && (p === m.target || p.startsWith(`${m.target}/`)));
    const path = (spec.writes ?? []).map(p => resolvePath({ cwd: c.workdir, home: '/' }, p)).find(p => !writable(p));
    if (path !== undefined) return { lines: lines(spec.readOnlyError?.output ?? `（模擬環境：程式要寫入 ${path}，但容器的根檔案系統是唯讀的）`), exit: spec.readOnlyError?.exit ?? 1 };
  }
  void host;
  return null;
}
/** The memory a running container uses at time t (bytes): the spec's start plus its growth, up to its ceiling. */
export function memoryAt(c: DockerContainer, t: Seconds): number {
  const m = c.spec?.memory;
  if (!m) return effective(c)[0]?.endsWith('sleep') || ['sh', 'bash', 'tail'].includes(processesOf(c).at(-1)?.comm ?? '') ? 524_288 : 8_388_608;
  const used = m.start + m.growth * Math.max(0, t - (c.started ?? t));
  return Math.floor(m.max !== undefined ? Math.min(m.max, used) : used);
}
/** The memory at which the kernel kills the container: --memory, plus the swap it may use when the host has swap. */
export function oomLimit(host: FsState, c: DockerContainer): number | undefined {
  const mem = c.limits?.memory;
  if (!mem) return undefined;
  if (clockOf(host).memory.swap <= 0) return mem;
  const swap = c.limits?.memorySwap ?? mem * 2;
  return swap === -1 ? undefined : Math.max(mem, swap);
}
const ms = (t: Seconds, millis: number) => Math.round(t * 1000 + millis) / 1000;
/** When a running container ends (its planned exit or the OOM kill, whichever is first): endsAt with its exit code, OOM and last lines. */
export function schedule(host: FsState, c: DockerContainer, now?: Seconds): DockerContainer {
  const { endsAt: _e, endExit: _x, endOom: _o, endLogs: _l, ...rest } = c;
  void _e; void _x; void _o; void _l;
  if (c.status !== 'running') return rest;
  const limit = oomLimit(host, c), m = c.spec?.memory, started = c.started ?? 0;
  let oomAt: Seconds | undefined;
  if (limit !== undefined && m) {
    if (m.start > limit) oomAt = started;
    else if (m.growth > 0 && (m.max === undefined || m.max > limit)) oomAt = Math.max(started, Math.ceil((started + (limit - m.start) / m.growth) * 1000) / 1000);
  }
  // A limit lowered under what it already uses (docker update) kills it now, not in the past.
  if (oomAt !== undefined && now !== undefined) oomAt = Math.max(oomAt, now);
  if (oomAt !== undefined && (!c.plan || oomAt <= c.plan.t)) return { ...rest, endsAt: oomAt, endExit: 137, endOom: true };
  if (c.plan) return { ...rest, endsAt: c.plan.t, endExit: c.plan.exit, ...c.plan.logs.length ? { endLogs: c.plan.logs } : {} };
  return rest;
}
/**
 * moby's restart manager after the container exited at t: the backoff (100 ms, doubled after each restart up to a minute,
 * back to 100 ms after ten seconds of running), and whether it restarts — always; unless-stopped unless it was stopped by
 * hand (docker kill); on-failure when the exit code is not 0 and fewer than N restarts were made. RestartCount counts them.
 */
export function afterExit(c: DockerContainer, t: Seconds): DockerContainer {
  const p = policyOf(c.restart), ran = t - (c.started ?? t), count = c.restartCount ?? 0;
  const prev = ran >= 10 ? 0 : c.backoff ?? 0, backoff = prev === 0 ? 100 : Math.min(prev * 2, 60_000);
  const restart = p.name === 'always' || (p.name === 'unless-stopped' && !c.manualStop) || (p.name === 'on-failure' && c.exitCode !== 0 && (p.max === 0 || count < p.max));
  if (!restart || c.rm) return { ...c, backoff };
  return { ...c, backoff, restartCount: count + 1, restartAt: ms(t, backoff) };
}
/** A container that exits at t: its last lines, the OOM flag, then the restart policy. */
export function exitAt(c: DockerContainer, t: Seconds, exit: number, o: { oom?: boolean; logs?: readonly LogSeed[] } = {}): DockerContainer {
  const { endsAt: _e, endExit: _x, endOom: _o, endLogs: _l, plan: _p, ...rest } = c;
  void _e; void _x; void _o; void _l; void _p;
  const ended = stopped({ ...rest, status: 'exited', exitCode: exit, finished: t, ip: undefined, logs: [...c.logs, ...seedLines(o.logs ?? [], t)], ...o.oom ? { oomKilled: true } : {} });
  return afterExit(ended, t);
}

// ------------------------------------------------------------------------------------------------- signals

/** What the program does on a signal: its handler, or none (the legacy data of E20–E23: a server handles SIGTERM unless its stopExit is 137). */
function handlerOf(c: DockerContainer, img: DockerImage | undefined, n: number): { seconds: number; logs: readonly LogSeed[]; exit: number } | undefined {
  const name = SIGNALS[n];
  if (c.spec?.signals) return c.spec.signals[name];
  const isServer = !!img?.service && !c.custom && !img.ownMain;
  const code = c.stopExit ?? (isServer ? img?.stopExit ?? 0 : img?.stopExit ?? 137);
  return code !== 137 && ['TERM', 'INT', 'QUIT'].includes(name) ? { seconds: 0, logs: [], exit: code } : undefined;
}
/** Signals whose default action is to ignore them (CHLD, CONT, URG, WINCH) or to stop the process (not modelled). */
const QUIET = new Set([17, 18, 19, 20, 21, 22, 23, 28]);
/**
 * A signal to the container's PID 1: SIGKILL ends it (137). The program as PID 1 handles it or ignores it (the kernel does
 * not apply default actions to PID 1); /bin/sh -c as PID 1 ignores it and does not pass it on; docker-init passes it to its
 * child — the program, which handles it or dies of it (128+n), or the shell of a shell form, which dies of it (128+n).
 */
export function signalOutcome(c: DockerContainer, img: DockerImage | undefined, n: number): { exit: number; after: number; logs: readonly LogSeed[] } | null {
  if (n === 9) return { exit: 137, after: 0, logs: [] };
  const kind = pid1Of(c);
  if (kind === 'shell') return null;
  // docker-init passes it to /bin/sh -c (a shell form), which has no handler and is not PID 1: the default action ends it.
  if (kind === 'init' && shellForm(c)) return QUIET.has(n) ? null : { exit: 128 + n, after: 0, logs: [] };
  const h = handlerOf(c, img, n);
  if (h) return { exit: h.exit, after: h.seconds, logs: h.logs };
  if (kind === 'init' && !QUIET.has(n)) return { exit: 128 + n, after: 0, logs: [] };
  return null;
}

// ------------------------------------------------------------------------------------------------- events

/** Records an event of the container (its labels, the image as named and its name are the attributes, as moby's are). */
export function emit(d: DockerState, t: Seconds, action: string, c: DockerContainer, extra: Record<string, string> = {}): DockerState {
  if (!d.runtime) return d;
  const img = imageById(d, c.image);
  const attrs = { ...img?.labels ?? {}, ...c.labels ?? {}, image: c.ref, name: c.name, ...extra };
  return { ...d, events: [...d.events ?? [], { t, action, id: c.id, attrs }].slice(-2000) };
}
/** The die event's attributes: the exit code and how long it ran (whole seconds). */
export const dieAttrs = (c: DockerContainer) => ({ exitCode: String(c.exitCode), execDuration: String(Math.max(0, Math.floor((c.finished ?? 0) - (c.started ?? 0)))) });
/** The events of a container that just started: start, and when it ended at once, oom and die. */
export function startEvents(d0: DockerState, c: DockerContainer, t: Seconds): DockerState {
  let d = emit(d0, t, 'start', c);
  if (c.status === 'exited') { if (c.oomKilled) d = emit(d, t, 'oom', c); d = emit(d, t, 'die', c, dieAttrs(c)); }
  return d;
}
/**
 * E24: what docker compose did, as events (it creates, starts, stops and removes containers through the same API): each at
 * its own time (created, started, finished; a stop or removal when the command ended), without the ones the daemon recorded
 * already (restarts while Compose waited), in time order.
 */
export function composeEvents(before: DockerState, after: DockerState, t: Seconds): DockerState {
  if (!after.runtime) return after;
  const known = new Set((after.events ?? []).map(e => `${e.action}/${e.id}/${e.t}`));
  let d = after;
  const add = (at: Seconds, action: string, c: DockerContainer, extra: Record<string, string> = {}) => { if (!known.has(`${action}/${c.id}/${at}`)) d = emit(d, at, action, c, extra); };
  for (const c of after.containers) {
    const old = before.containers.find(x => x.id === c.id);
    if (!old) add(c.created, 'create', c);
    if (c.started !== undefined && (!old || old.started !== c.started)) {
      if (old?.status === 'running') { add(c.started, 'die', old, dieAttrs({ ...old, finished: c.started })); add(c.started, 'stop', old); }
      add(c.started, 'start', c);
      if (c.status === 'exited') { if (c.oomKilled) add(c.finished ?? t, 'oom', c); add(c.finished ?? t, 'die', c, dieAttrs(c)); }
    } else if (c.status === 'exited' && old?.status === 'running') { add(c.finished ?? t, 'die', c, dieAttrs(c)); add(t, 'stop', c); }
  }
  for (const old of before.containers) if (!after.containers.some(x => x.id === old.id)) {
    if (old.status === 'running') { add(t, 'die', old, dieAttrs({ ...old, exitCode: 0, finished: t })); add(t, 'stop', old); }
    add(t, 'destroy', old);
  }
  return { ...d, events: (d.events ?? []).map((e, k) => ({ e, k })).sort((a, b) => a.e.t - b.e.t || a.k - b.k).map(x => x.e) };
}

// ------------------------------------------------------------------------------------------------- time

/** The health probes due by t (the clock at t), with health_status events. */
function healthAt(state: FsState, t: Seconds): FsState {
  const clock = clockOf(state), before = state.docker!;
  const changes: { c: DockerContainer; status: string; t: Seconds }[] = [];
  const next = advanceHealth({ ...state, clock: { ...clock, now: t } }, (c, status, at) => changes.push({ c, status, t: at }));
  let d = next.docker!;
  for (const x of changes.sort((a, b) => a.t - b.t)) d = emit(d, x.t, `health_status: ${x.status}`, x.c);
  return d === before && next === state ? state : { ...next, clock, docker: d };
}
/**
 * The runtime's settle: every container that was due to exit (its planned end, an OOM kill) by now exits at its time, and
 * every container waiting for its restart starts again at its time, in time order; health probes run in between.
 */
export function settleRuntime(state0: FsState): FsState {
  const now = clockOf(state0).now;
  let state = state0;
  for (let guard = 0; guard < 20_000; guard++) {
    const d = state.docker!;
    let next: { t: Seconds; c: DockerContainer; kind: 'end' | 'restart' } | undefined;
    for (const c of d.containers) {
      if (c.status === 'running' && c.endsAt !== undefined && c.endsAt <= now && (!next || c.endsAt < next.t)) next = { t: c.endsAt, c, kind: 'end' };
      if (c.restartAt !== undefined && c.restartAt <= now && (!next || c.restartAt < next.t)) next = { t: c.restartAt, c, kind: 'restart' };
    }
    if (!next) break;
    state = healthAt(state, next.t);
    const dd = state.docker!, x = dd.containers.find(y => y.id === next!.c.id)!;
    const put = (d1: DockerState, y: DockerContainer | null) => ({ ...d1, containers: y ? d1.containers.map(z => z.id === x.id ? y : z) : d1.containers.filter(z => z.id !== x.id) });
    if (next.kind === 'end') {
      const ended = exitAt(x, next.t, x.endExit ?? 0, { oom: !!x.endOom, logs: x.endLogs });
      let d1 = x.endOom ? emit(dd, next.t, 'oom', ended) : dd;
      d1 = emit(d1, next.t, 'die', ended, dieAttrs(ended));
      if (x.rm) {
        d1 = emit(put(d1, null), next.t, 'destroy', ended);
        const r = dropAnonymous(state, d1, x);
        state = { ...r.state, docker: r.d };
      } else state = { ...state, docker: put(d1, ended) };
      continue;
    }
    // A restart: the main process runs again (its start-up lines go on in the same log); it may end again at once.
    const { restartAt: _r, ...waiting } = x;
    void _r;
    const s = start(syncDocker({ ...state, docker: put(dd, waiting) }), put(dd, waiting), waiting, next.t);
    if ('error' in s) { state = { ...state, docker: put(dd, { ...s.c, restartAt: undefined, error: s.error.replace(/^Error response from daemon: /, '') }) }; continue; }
    let d1 = startEvents(put(dd, s.c), s.c, next.t);
    if (s.logs) d1 = withLogs(d1, s.logs);
    state = { ...state, ...s.hostNodes ? { nodes: s.hostNodes } : {}, docker: d1 };
  }
  state = healthAt(state, now);
  return syncDocker(state);
}

// ------------------------------------------------------------------------------------------------- the commands

export interface RuntimeCli {
  state: FsState; args: readonly string[]; now: Seconds; path: string;
  out(line: string): void; err(line: string): void;
  flagError(flag: string): { state: FsState; status: number };
  needArgs(min: number, exact?: boolean): { state: FsState; status: number };
}
type Result = { state: FsState; status: number };
const noSuch = (n: string) => `Error response from daemon: No such container: ${n}`;
const putC = (d: DockerState, c: DockerContainer | null, id: string): DockerState => ({ ...d, containers: c ? d.containers.map(y => y.id === id ? c : y) : d.containers.filter(y => y.id !== id) });

/** Stops one running container (docker stop's work): the signal, the wait, SIGKILL after the timeout. The seconds waited. */
export function stopOne(state: FsState, d0: DockerState, c: DockerContainer, now: Seconds, o: { signal?: number; timeout?: number }): { d: DockerState; state: FsState; waited: number } {
  let d = d0, st = state;
  if (c.restartAt !== undefined) {
    // Waiting for a restart: the restart is cancelled; it stays exited.
    const { restartAt: _r, ...rest } = c;
    void _r;
    const x = { ...rest, manualStop: true as const };
    return { d: emit(putC(d, x, c.id), now, 'stop', x), state: st, waited: 0 };
  }
  if (c.status !== 'running') return { d, state: st, waited: 0 };
  const img = imageById(d, c.image), sig = o.signal ?? signalNumber(c.stopSignal ?? 'SIGTERM') ?? 15;
  const timeout = o.timeout ?? c.stopTimeout ?? 10;
  const r = signalOutcome(c, img, sig);
  d = emit(d, now, 'kill', c, { signal: String(sig) });
  let end: Seconds, exit: number, logs: readonly LogSeed[] = [];
  if (r && (r.after <= timeout || timeout < 0)) { end = ms(now, r.after * 1000); exit = r.exit; logs = r.logs; }
  else {
    // Not handled in time: SIGKILL after the timeout (the handler's lines, if any, were logged when the signal came).
    end = ms(now, Math.max(0, timeout) * 1000); exit = 137; logs = r?.logs ?? [];
    if (sig !== 9) d = emit(d, end, 'kill', c, { signal: '9' });
  }
  const withLog = { ...c, logs: [...c.logs, ...seedLines(logs, now)] };
  const { restartAt: _r, ...base } = withLog;
  void _r;
  // docker stop cancels the restart policy for this exit.
  const ended = { ...exitAt({ ...base, restart: undefined }, end, exit), restart: c.restart, manualStop: true as const };
  const { restartAt: _x, ...done } = ended;
  void _x;
  d = emit(d, end, 'die', done, dieAttrs(done));
  d = emit(d, end, 'stop', done);
  if (c.rm) { d = emit(putC(d, null, c.id), end, 'destroy', done); const x = dropAnonymous(st, d, c); st = x.state; d = x.d; }
  else d = putC(d, done, c.id);
  return { d, state: st, waited: end - now };
}
/** docker stop|restart [-t N] [-s SIGNAL] CONTAINER…: the signal, the grace period (the clock moves by it), SIGKILL. */
export function stopCommand(x: RuntimeCli, restart: boolean): Result {
  let timeout: number | undefined, signal: number | undefined;
  const names: string[] = [];
  for (let i = 0; i < x.args.length; i++) {
    const a = x.args[i], long = /^(--(?:time|timeout|signal))=(.*)$/.exec(a), flag = long ? long[1] : /^-[ts].+/.test(a) ? a.slice(0, 2) : a;
    const value = () => long ? long[2] : /^-[ts].+/.test(a) ? a.slice(2) : x.args[++i];
    if (flag === '-t' || flag === '--time' || flag === '--timeout') {
      const v = value() ?? '';
      if (!/^-?\d+$/.test(v)) { x.err(`invalid argument "${v}" for "${flag === '-t' ? '-t, --timeout' : flag}" flag: strconv.ParseInt: parsing "${v}": invalid syntax`); x.err(`See '${x.path} --help'.`); return { state: x.state, status: 125 }; }
      timeout = Number(v);
    } else if (flag === '-s' || flag === '--signal') {
      const v = value() ?? '', n = signalNumber(v);
      if (n === undefined) { x.err(`Error response from daemon: Invalid signal: ${v}`); return { state: x.state, status: 1 }; }
      signal = n;
    } else if (a.startsWith('-')) return x.flagError(a);
    else names.push(a);
  }
  if (!names.length) return x.needArgs(1);
  let state = x.state, d = state.docker!, waited = 0, status = 0;
  const failed: string[] = [];
  for (const n of names) {
    const c = findContainer(d, n);
    if (!c) { x.err(noSuch(n)); failed.push(n); status = 1; continue; }
    const r = stopOne(state, d, c, x.now, { ...timeout !== undefined ? { timeout } : {}, ...signal !== undefined ? { signal } : {} });
    d = r.d; state = r.state; waited = Math.max(waited, r.waited);
    if (!restart) { x.out(n); continue; }
    // docker restart: then a fresh start (the restart policy's count and backoff reset), and the restart event.
    const cur = d.containers.find(y => y.id === c.id);
    if (!cur) { x.out(n); continue; }
    const t = ms(x.now, r.waited * 1000);
    const fresh: DockerContainer = { ...cur, restartCount: 0, backoff: undefined, manualStop: undefined };
    state = syncDocker({ ...state, docker: putC(d, fresh, c.id) });
    const s = start(state, state.docker!, fresh, t);
    if ('error' in s) { x.err(s.error); failed.push(n); status = 1; d = putC(state.docker!, s.c, c.id); continue; }
    if (s.hostNodes) state = { ...state, nodes: s.hostNodes };
    d = startEvents(putC(state.docker!, s.c, c.id), s.c, t);
    d = emit(d, t, 'restart', s.c);
    if (s.logs) d = withLogs(d, s.logs);
    x.out(n);
  }
  if (failed.length) x.err(`Error: failed to ${restart ? 'restart' : 'stop'} containers: ${failed.join(', ')}`);
  state = syncDocker({ ...state, docker: d });
  // docker stop blocks until the containers exited (or were killed): that time passes.
  if (waited > 0) state = advanceClock(state, waited);
  return { state, status };
}
/** docker kill [-s SIGNAL] CONTAINER…: the signal now (SIGKILL by default); a handler may end the program a little later. */
export function killCommand(x: RuntimeCli): Result {
  let signal = 9;
  const names: string[] = [];
  for (let i = 0; i < x.args.length; i++) {
    const a = x.args[i], long = /^--signal=(.*)$/.exec(a);
    if (a === '-s' || a === '--signal' || long || /^-s.+/.test(a)) {
      const v = long ? long[1] : a.length > 2 && a.startsWith('-s') ? a.slice(2) : x.args[++i] ?? '', n = signalNumber(v);
      if (n === undefined) { x.err(`Error response from daemon: Invalid signal: ${v}`); return { state: x.state, status: 1 }; }
      signal = n;
    } else if (a.startsWith('-')) return x.flagError(a);
    else names.push(a);
  }
  if (!names.length) return x.needArgs(1);
  let state = x.state, d = state.docker!, status = 0;
  for (const n of names) {
    const c = findContainer(d, n);
    if (!c) { x.err(noSuch(n)); status = 1; continue; }
    if (c.status !== 'running') { x.err(`Error response from daemon: cannot kill container: ${n}: container ${c.id} is not running`); status = 1; continue; }
    const r = signalOutcome(c, imageById(d, c.image), signal);
    d = emit(d, x.now, 'kill', c, { signal: String(signal) });
    // docker kill counts as stopping it by hand (unless-stopped does not restart it; always and on-failure do).
    const marked = { ...c, manualStop: true as const };
    if (!r) d = putC(d, marked, c.id);
    else if (r.after > 0) d = putC(d, schedule(state, { ...marked, logs: [...c.logs, ...seedLines(r.logs, x.now)], plan: { t: ms(x.now, r.after * 1000), exit: r.exit, logs: [] } }), c.id);
    else {
      const ended = exitAt(marked, x.now, r.exit, { logs: r.logs });
      d = emit(d, x.now, 'die', ended, dieAttrs(ended));
      if (c.rm) { d = emit(putC(d, null, c.id), x.now, 'destroy', ended); const y = dropAnonymous(state, d, c); state = y.state; d = y.d; }
      else d = putC(d, ended, c.id);
    }
    x.out(n);
  }
  return { state: syncDocker({ ...state, docker: d }), status };
}

/** docker stats [--no-stream] [-a] [--no-trunc] [--format …] [CONTAINER…]: one snapshot (the simulation does not stream). */
export function statsCommand(x: RuntimeCli): Result {
  let all = false, stream = true, noTrunc = false, format: string | undefined;
  const names: string[] = [];
  for (let i = 0; i < x.args.length; i++) {
    const a = x.args[i];
    if (a === '-a' || a === '--all') all = true;
    else if (a === '--no-stream') stream = false;
    else if (a === '--no-trunc') noTrunc = true;
    else if (a === '--format') format = x.args[++i] ?? '';
    else if (a.startsWith('--format=')) format = a.slice(9);
    else if (a.startsWith('-')) return x.flagError(a);
    else names.push(a);
  }
  const state = x.state, d = state.docker!, clock = clockOf(state);
  const list: DockerContainer[] = [];
  for (const n of names) { const c = findContainer(d, n); if (!c) { x.err(noSuch(n)); return { state, status: 1 }; } list.push(c); }
  if (!names.length) list.push(...d.containers.filter(c => all || c.status === 'running' || c.restartAt !== undefined).map((c, i) => ({ c, i })).sort((a, b) => b.c.created - a.c.created || b.i - a.i).map(v => v.c));
  const host = clock.memory.total * 1024 * 1024;
  const pct = (v: number) => `${(Math.round(v * 100) / 100).toFixed(2)}%`;
  const rows = list.map(c => {
    const on = c.status === 'running', used = on ? memoryAt(c, x.now) : 0, limit = on ? c.limits?.memory ?? host : 0;
    const cpus = c.limits?.nanoCpus ? c.limits.nanoCpus / 1e9 : clock.cpus, cpu = on ? Math.min(c.spec?.cpu ?? 0, cpus * 100) : 0;
    return {
      ID: noTrunc ? c.id : short(c.id), Container: names.length ? names[list.indexOf(c)] : short(c.id), Name: c.name, CPUPerc: pct(cpu),
      MemUsage: `${bytesText(used)} / ${bytesText(limit)}`, MemPerc: pct(limit ? used / limit * 100 : 0), NetIO: '0B / 0B', BlockIO: '0B / 0B',
      PIDs: String(on ? Math.max(c.spec?.pids ?? 1, processesOf(c).length) : 0),
    };
  });
  const headers = { ID: 'CONTAINER ID', Container: 'CONTAINER', Name: 'NAME', CPUPerc: 'CPU %', MemUsage: 'MEM USAGE / LIMIT', MemPerc: 'MEM %', NetIO: 'NET I/O', BlockIO: 'BLOCK I/O', PIDs: 'PIDS' };
  const r = formatted(format ?? 'table {{.ID}}\t{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}\t{{.PIDs}}', rows, headers);
  if ('error' in r) { x.err(r.error); return { state, status: 1 }; }
  r.lines.forEach(x.out);
  if (stream) x.err('（模擬環境：docker stats 不會持續更新畫面，只印出一次；要讀一次的數字請加 --no-stream）');
  return { state, status: 0 };
}

/** docker/cli's tabwriter for docker top (min width 20, padding 3); the last column is not padded. */
function topWrite(rows: readonly (readonly string[])[]): string[] {
  const cols = Math.max(0, ...rows.map(r => r.length));
  const widths = Array.from({ length: cols - 1 }, (_, i) => Math.max(20, ...rows.map(r => [...r[i] ?? ''].length + 3)));
  return rows.map(r => r.map((cell, i) => i < r.length - 1 ? cell + ' '.repeat(widths[i] - [...cell].length) : cell).join(''));
}
/** docker top CONTAINER: ps -ef of the container's processes on the host (host PIDs, the shim as their parent). */
export function topCommand(x: RuntimeCli): Result {
  const words = x.args.filter(a => !a.startsWith('-')), bad = x.args.find(a => a.startsWith('-'));
  if (bad && !words.length) return x.flagError(bad);
  if (!words.length) return x.needArgs(1);
  const state = x.state, d = state.docker!, c = findContainer(d, words[0]);
  if (!c) { x.err(noSuch(words[0])); return { state, status: 1 }; }
  if (words.length > 1 || bad) { x.err('docker top：模擬環境只支援不加 ps 選項的 docker top 容器（ps -ef 的欄位）'); return { state, status: 1 }; }
  if (c.status !== 'running') { x.err(`Error response from daemon: container ${c.id} is not running`); return { state, status: 1 }; }
  const procs = tableOf(state), shim = procs.find(p => p.command.includes(`-id ${c.id} `));
  const mine: Proc[] = [];
  const walk = (pid: number) => { for (const p of procs.filter(q => q.ppid === pid)) { mine.push(p); walk(p.pid); } };
  if (shim) walk(shim.pid);
  const rows = [['UID', 'PID', 'PPID', 'C', 'STIME', 'TTY', 'TIME', 'CMD'], ...mine.map(p => [p.user, String(p.pid), String(p.ppid), String(Math.min(99, Math.floor(p.cpu))), startText(state, p.start, x.now), p.tty, longTime(p.time), p.command])];
  topWrite(rows).forEach(x.out);
  return { state, status: 0 };
}

/** docker update [-m …] [--memory-swap …] [--cpus …] [--cpu-shares …] [--restart …] CONTAINER…: new limits apply at once. */
export function updateCommand(x: RuntimeCli, cpusOnHost: number): Result {
  const set: Limits = {};
  let restart: string | undefined;
  const names: string[] = [];
  const bad = (flag: string, v: string, why: string) => { x.err(`invalid argument "${v}" for "${flag}" flag: ${why}`); x.err(`See '${x.path} --help'.`); return { state: x.state, status: 125 }; };
  for (let i = 0; i < x.args.length; i++) {
    const a = x.args[i], long = /^(--[a-z-]+)=(.*)$/.exec(a), flag = long ? long[1] : /^-m.+/.test(a) ? '-m' : a;
    const value = () => long ? long[2] : /^-m.+/.test(a) ? a.slice(2) : x.args[++i] ?? '';
    if (flag === '-m' || flag === '--memory' || flag === '--memory-swap') {
      const v = value(), n = v === '-1' && flag === '--memory-swap' ? -1 : parseBytes(v);
      if (n === null) return bad(flag === '-m' ? '-m, --memory' : flag, v, `invalid size: '${v}'`);
      if (flag === '--memory-swap') set.memorySwap = n; else set.memory = n;
    } else if (flag === '--cpus') { const v = value(); if (!/^\d+(\.\d+)?$/.test(v)) return bad('--cpus', v, `failed to parse ${v} as a rational number`); set.nanoCpus = Math.round(Number(v) * 1e9); }
    else if (flag === '--cpu-shares' || flag === '-c') { const v = value(); if (!/^\d+$/.test(v)) return bad('-c, --cpu-shares', v, `strconv.ParseInt: parsing "${v}": invalid syntax`); set.cpuShares = Number(v); }
    else if (flag === '--restart') restart = value();
    else if (a.startsWith('-')) return x.flagError(a);
    else names.push(a);
  }
  if (!names.length) return x.needArgs(1);
  if (!Object.keys(set).length && restart === undefined) { x.err('You must provide one or more flags when using this command.'); return { state: x.state, status: 1 }; }
  if (restart !== undefined) { const p = restartProblem(restart); if (p) { x.err(p.daemon ? `Error response from daemon: ${p.error}` : p.error); return { state: x.state, status: 1 }; } }
  if (set.memory !== undefined && set.memory < 6 * 1024 * 1024) { x.err('Error response from daemon: Minimum memory limit allowed is 6MB'); return { state: x.state, status: 1 }; }
  if (set.nanoCpus !== undefined && (set.nanoCpus < 1e7 || set.nanoCpus > cpusOnHost * 1e9)) { x.err(`Error response from daemon: Range of CPUs is from 0.01 to ${cpusOnHost.toFixed(2)}, as there are only ${cpusOnHost} CPUs available`); return { state: x.state, status: 1 }; }
  let state = x.state, d = state.docker!, status = 0;
  for (const n of names) {
    const c = findContainer(d, n);
    if (!c) { x.err(noSuch(n)); status = 1; continue; }
    const limits = { ...c.limits, ...set };
    if (limits.memory !== undefined && limits.memorySwap !== undefined && limits.memorySwap !== -1 && limits.memorySwap < limits.memory) {
      x.err(`Error response from daemon: Cannot update container ${c.id}: Memory limit should be smaller than already set memoryswap limit, update the memoryswap at the same time`); status = 1; continue;
    }
    if (restart !== undefined && c.rm && restart !== 'no') { x.err(`Error response from daemon: Cannot update container ${c.id}: Restart policy cannot be updated because AutoRemove is enabled for the container`); status = 1; continue; }
    // The new limit applies to the running process at once (an OOM kill may come sooner, or later).
    const next = schedule(state, { ...c, limits, ...restart !== undefined ? { restart } : {} }, x.now);
    d = putC(d, next, c.id);
    x.out(n);
  }
  state = { ...state, docker: d };
  return { state: settleRuntime(state), status };
}

/** docker wait CONTAINER…: blocks until each exits (the clock moves to that time) and prints its exit code. */
export function waitCommand(x: RuntimeCli): Result {
  const names = x.args.filter(a => !a.startsWith('-')), bad = x.args.find(a => a.startsWith('-'));
  if (bad) return x.flagError(bad);
  if (!names.length) return x.needArgs(1);
  let state = x.state, status = 0;
  for (const n of names) {
    const c = findContainer(state.docker!, n);
    if (!c) { x.err(noSuch(n)); status = 1; continue; }
    if (c.status === 'running' && c.endsAt === undefined) { x.err(`（模擬環境：${n} 一直在執行，不會自己結束；真實的 docker wait 會一直等下去。請先 docker stop ${n}）`); status = 1; continue; }
    if (c.status === 'running' && c.endsAt !== undefined) { state = settleRuntime(advanceClock(state, Math.max(0, c.endsAt - clockOf(state).now))); }
    const after = state.docker!.containers.find(y => y.id === c.id);
    x.out(String(after ? after.exitCode : c.endExit ?? 0));
  }
  return { state, status };
}

/** RFC 3339 with nanoseconds as docker events and logs -t print it (2026-11-22T10:00:00.100000000Z). */
export function nanoText(t: Seconds): string {
  // Times are kept to the millisecond (the restart manager's delays are milliseconds).
  const millis = Math.round(t * 1000), whole = Math.floor(millis / 1000), frac = (millis - whole * 1000) * 1_000_000;
  return `${isoText(whole).replace(' ', 'T')}.${String(frac).padStart(9, '0')}Z`;
}
/** Go's RFC3339Nano (trailing zeros of the fraction dropped): StartedAt and FinishedAt of a container on the runtime profile. */
export function rfcNano(t: Seconds | undefined): string {
  if (t === undefined) return '0001-01-01T00:00:00Z';
  const millis = Math.round(t * 1000), whole = Math.floor(millis / 1000), frac = (millis - whole * 1000) * 1_000_000;
  return `${isoText(whole).replace(' ', 'T')}${frac ? `.${String(frac).padStart(9, '0').replace(/0+$/, '')}` : ''}Z`;
}
/** --since and --until: a Go duration before now (10m, 1h30m), an RFC 3339 time, a date, or Unix seconds. */
export function timeArg(text: string, now: Seconds): Seconds | null {
  const t = text.trim();
  if (/^(?:\d+(?:\.\d+)?(?:h|m|s|ms))+$/.test(t)) { let n = 0; for (const m of t.matchAll(/(\d+(?:\.\d+)?)(h|ms|m|s)/g)) n += Number(m[1]) * ({ h: 3600, m: 60, s: 1, ms: 0.001 } as Record<string, number>)[m[2]]; return now - n; }
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?)?(Z|[+-]\d{2}:\d{2})?$/.exec(t);
  if (!m) return null;
  const base = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0)) / 1000;
  const off = m[8] && m[8] !== 'Z' ? (m[8][0] === '-' ? -1 : 1) * (Number(m[8].slice(1, 3)) * 3600 + Number(m[8].slice(4)) * 60) : 0;
  return base + Number(m[7] ?? 0) - off;
}
/** docker events --since … [--until …] [--filter container=…|event=…|type=container]: the daemon's container events (non-blocking). */
export function eventsCommand(x: RuntimeCli): Result {
  let since: Seconds | undefined, until: Seconds | undefined;
  const filters: [string, string][] = [];
  for (let i = 0; i < x.args.length; i++) {
    const a = x.args[i], long = /^(--(?:since|until|filter|format))=(.*)$/.exec(a), flag = long ? long[1] : a;
    const value = () => long ? long[2] : x.args[++i] ?? '';
    if (flag === '--since' || flag === '--until') {
      const v = value(), t = timeArg(v, x.now);
      if (t === null) { x.err(`Error response from daemon: invalid value for "${flag.slice(2)}": failed to parse value as time or duration: "${v}"`); return { state: x.state, status: 1 }; }
      if (flag === '--since') since = t; else until = t;
    } else if (flag === '-f' || flag === '--filter') {
      const v = value(), eq = v.indexOf('=');
      if (eq < 0) { x.err(`invalid argument "${v}" for "-f, --filter" flag: bad format of filter (expected name=value)`); x.err(`See '${x.path} --help'.`); return { state: x.state, status: 125 }; }
      const k = v.slice(0, eq);
      if (!['container', 'event', 'type'].includes(k)) { x.err('docker events：模擬環境的 --filter 只支援 container=、event= 與 type=container'); return { state: x.state, status: 1 }; }
      filters.push([k, v.slice(eq + 1)]);
    } else if (flag === '--format') { value(); x.err('docker events：模擬環境不支援 --format（只印出預設的格式）'); return { state: x.state, status: 1 }; }
    else return x.flagError(a);
  }
  if (since === undefined) {
    x.err('（模擬環境：沒有 --since 的 docker events 只會等待之後的事件，模擬環境不會等待；請用 --since 與 --until 讀出一段時間內的事件，例如 docker events --since 10m --until 0s）');
    return { state: x.state, status: 0 };
  }
  const d = x.state.docker!, end = until ?? x.now;
  const ok = (e: DockerEvent) => {
    const keys = [...new Set(filters.map(([k]) => k))];
    return keys.every(k => filters.some(([fk, v]) => fk === k && (k === 'type' ? v === 'container'
      : k === 'event' ? (['health_status', 'exec_create', 'exec_start'].includes(v) ? e.action.startsWith(v) : e.action === v)
        : e.attrs.name === v || (/^[0-9a-f]+$/.test(v) && e.id.startsWith(v)))));
  };
  for (const e of d.events ?? []) {
    if (e.t < since || e.t > end || !ok(e)) continue;
    const attrs = Object.keys(e.attrs).sort().map(k => `${k}=${e.attrs[k]}`).join(', ');
    x.out(`${nanoText(e.t)} container ${e.action} ${e.id} (${attrs})`);
  }
  if (until === undefined) x.err('（模擬環境：沒有 --until 時真實的 docker events 會繼續等待新的事件；模擬環境印出到現在為止的事件就結束）');
  return { state: x.state, status: 0 };
}

// ------------------------------------------------------------------------------------------------- inspect

/** docker inspect of a container on the runtime profile: the State, RestartCount, HostConfig and Config fields of E24. */
export function inspectRuntime(host: FsState, d: DockerState, c: DockerContainer, base: Record<string, unknown>): Record<string, unknown> {
  const b = base as { State: Record<string, unknown>; HostConfig: Record<string, unknown>; Config: Record<string, unknown> };
  const running = c.status === 'running', procs = tableOf(host), shim = running ? procs.find(p => p.command.includes(`-id ${c.id} `)) : undefined;
  const pid = shim ? procs.find(p => p.ppid === shim.pid)?.pid ?? 0 : 0;
  const state = {
    Status: stateOf(c), Running: running || c.restartAt !== undefined, Paused: false, Restarting: c.restartAt !== undefined, OOMKilled: !!c.oomKilled, Dead: false, Pid: pid,
    ExitCode: c.exitCode, Error: c.error ?? '', StartedAt: rfcNano(c.started), FinishedAt: rfcNano(c.finished), Health: b.State.Health,
  };
  STRUCTS.add(state);
  const p = policyOf(c.restart), policy = { Name: p.name, MaximumRetryCount: p.max };
  STRUCTS.add(policy);
  const mem = c.limits?.memory ?? 0;
  const hostConfig = {
    ...b.HostConfig, RestartPolicy: policy, CapAdd: c.capAdd?.length ? c.capAdd : null, CapDrop: c.capDrop?.length ? c.capDrop : null, Privileged: !!c.privileged, ReadonlyRootfs: !!c.readOnly,
    SecurityOpt: c.securityOpt?.length ? c.securityOpt : null, CpuShares: c.limits?.cpuShares ?? 0, Memory: mem, NanoCpus: c.limits?.nanoCpus ?? 0,
    MemorySwap: c.limits?.memorySwap ?? (mem ? mem * 2 : 0), ...c.init ? { Init: true } : {},
  };
  const config = { ...b.Config, ...c.stopSignal ? { StopSignal: c.stopSignal } : {}, ...c.stopTimeout !== undefined ? { StopTimeout: c.stopTimeout } : {} };
  return { ...base, State: state, RestartCount: c.restartCount ?? 0, HostConfig: hostConfig, Config: config };
}

/** E24: the lines of docker logs between --since and --until. */
export const logsBetween = (logs: readonly LogLine[], since: Seconds | undefined, until: Seconds | undefined) => logs.filter(l => (since === undefined || l.t >= since) && (until === undefined || l.t < until));
/** E24: what a container's main process is, for docker exec's ps (PID 1, the program under sh or docker-init at 7). */
export const psRowsOf = (c: DockerContainer) => processesOf(c).map(p => p.comm);
