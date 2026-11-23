import { isoText, type Seconds } from './clock';
import { clockOf } from './processes';
import type { FsState } from './fs';
import { imageById, runIn, type DockerContainer, type DockerState } from './docker';

/*
 * Engine stage E23 (docs/curriculum/DKR0_CONTAINER_CAPABILITY.md §13.4): health checks — a Dockerfile's HEALTHCHECK, a
 * Compose service's healthcheck and docker run's --health-* flags. A running container with a test is probed in the
 * container at fixed times (the first probe one interval after the start, or one start interval when there is a start
 * period), by running the test there the way docker exec does (CMD: the words; CMD-SHELL: /bin/sh -c, so the image needs a
 * shell and every tool the line uses — curl, pg_isready — among its executables). Exit 0 is healthy; a failure adds to the
 * failing streak (not during the start period while it has never been healthy), and `retries` failures in a row make it
 * unhealthy. Time only passes with sleep (and while docker compose up waits for a dependency), so every transition is
 * deterministic: the probes between two docker commands are run when the next one (or a check) looks at the daemon, on
 * the container's files as they are then, each at its own time (a service the lesson says needs `ready` seconds to start
 * refuses connections before that).
 */

/** A health check's configuration (seconds; 0 is "not set": the defaults apply when it runs). */
export interface HealthConfig { test: string[]; interval: number; timeout: number; retries: number; startPeriod: number; startInterval: number }
export interface HealthLog { start: Seconds; end: Seconds; exitCode: number; output: string }
/** A running container's health: its status, the failures in a row, the last five probes and when the next one runs. */
export interface HealthState { status: 'starting' | 'healthy' | 'unhealthy'; streak: number; log: HealthLog[]; next: Seconds }

export const HEALTH_DEFAULTS = { interval: 30, timeout: 30, retries: 3, startPeriod: 0, startInterval: 5 } as const;
const or = (v: number, d: number) => v > 0 ? v : d;

/** Go's time.ParseDuration for what health checks use: 1h2m3s, 90s, 1.5s, 500ms (no sign). Seconds, or null. */
export function parseDuration(text: string): number | null {
  const t = text.trim();
  if (t === '0') return 0;
  if (!/^(?:\d+(?:\.\d+)?(?:h|m|s|ms|us|µs|ns))+$/.test(t)) return null;
  let total = 0;
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)(h|ms|m|s|us|µs|ns)/g)) total += Number(m[1]) * ({ h: 3600, m: 60, s: 1, ms: 0.001, us: 1e-6, 'µs': 1e-6, ns: 1e-9 } as Record<string, number>)[m[2]];
  return Math.round(total * 1000) / 1000;
}
/** Go's time.Duration.String: 0s, 500ms, 5s, 1m30s, 1h0m0s. */
export function durationText(seconds: number): string {
  if (seconds === 0) return '0s';
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = Math.round((seconds % 60) * 1000) / 1000;
  return h ? `${h}h${m}m${s}s` : m ? `${m}m${s}s` : `${s}s`;
}

/** The health of a container that just started: starting, with the first probe one (start) interval later. */
export function startHealth(config: HealthConfig, started: Seconds): HealthState {
  const startPeriod = or(config.startPeriod, HEALTH_DEFAULTS.startPeriod);
  return { status: 'starting', streak: 0, log: [], next: started + (startPeriod > 0 ? or(config.startInterval, HEALTH_DEFAULTS.startInterval) : or(config.interval, HEALTH_DEFAULTS.interval)) };
}
/** Whether a test runs at all (NONE disables a health check an image has). */
export const activeTest = (config: HealthConfig | undefined): config is HealthConfig => !!config && config.test.length > 0 && config.test[0] !== 'NONE';

/** The text docker ps adds to "Up …": (healthy), (unhealthy), (health: starting). */
export const healthSuffix = (c: DockerContainer) => c.status === 'running' && c.health ? ` (${c.health.status === 'starting' ? 'health: starting' : c.health.status})` : '';

/** What one probe of the test does at time t: its exit status and its output (standard output and error together). */
function probe(host: FsState, d: DockerState, c: DockerContainer, config: HealthConfig, t: Seconds): { exitCode: number; output: string } {
  const img = imageById(d, c.image);
  const at: FsState = { ...host, clock: { ...clockOf(host), now: t }, docker: d };
  let argv: string[], orExit: number | undefined;
  if (config.test[0] === 'CMD-SHELL') {
    // The common "… || exit 1" ends the line: the probe is what comes before it, and a failure exits with that status.
    let line = config.test.slice(1).join(' ');
    const m = /^(.*?)\s*\|\|\s*exit(?:\s+(\d+))?\s*$/s.exec(line);
    if (m) { line = m[1]; orExit = Number(m[2] ?? 1); }
    argv = ['/bin/sh', '-c', line];
  } else argv = config.test.slice(1);
  if (!argv.length) return { exitCode: 1, output: '' };
  const r = runIn(c, img, argv, { tty: false, env: [], now: t, system: host.system, host: at });
  if ('notFound' in r) {
    const exe = argv[0];
    return { exitCode: -1, output: exe === '/bin/sh' ? 'OCI runtime exec failed: exec failed: unable to start container process: exec: "/bin/sh": stat /bin/sh: no such file or directory: unknown'
      : `OCI runtime exec failed: exec failed: unable to start container process: exec: "${exe}": executable file not found in $PATH: unknown` };
  }
  const output = r.lines.map(l => `${l.text}\n`).join('');
  // A probe that would wait longer than its timeout (an address another network cannot reach) is killed.
  if (/Timeout was reached|timed out/.test(output)) return { exitCode: -1, output: `Health check exceeded timeout (${durationText(or(config.timeout, HEALTH_DEFAULTS.timeout))})` };
  return { exitCode: r.status !== 0 && orExit !== undefined ? orExit : r.status, output: output.slice(0, 4096) };
}

/**
 * Runs the probes that were due by now for every running container with a health check (moby's handleProbeResult): a
 * success is healthy and clears the streak; a failure counts unless the container is still in its start period and was
 * never healthy; `retries` in a row is unhealthy. Probes at the same readiness give the same result, so they are run once.
 */
export function advanceHealth(host: FsState, changed?: (c: DockerContainer, status: HealthState['status'], t: Seconds) => void): FsState {
  const d0 = host.docker;
  if (!d0) return host;
  const now = clockOf(host).now;
  let d = d0;
  for (const c0 of d0.containers) {
    if (c0.status !== 'running' || !c0.health || !activeTest(c0.healthcheck) || c0.health.next > now) continue;
    const config = c0.healthcheck, started = c0.started ?? now;
    const interval = or(config.interval, HEALTH_DEFAULTS.interval), startInterval = or(config.startInterval, HEALTH_DEFAULTS.startInterval), startPeriod = or(config.startPeriod, HEALTH_DEFAULTS.startPeriod);
    const retries = or(config.retries, HEALTH_DEFAULTS.retries);
    const memo = new Map<string, { exitCode: number; output: string }>();
    let h = { ...c0.health, log: [...c0.health.log] };
    for (let n = 0; h.next <= now && n < 200000; n++) {
      const t = h.next;
      // What answers at time t: which services (this one and the others) have finished starting.
      const key = d.containers.filter(x => x.status === 'running' && (x.readyAt === undefined || x.readyAt <= t)).map(x => x.id).join(',');
      let r = memo.get(key);
      if (!r) { r = probe(host, d, c0, config, t); memo.set(key, r); }
      h.log = [...h.log, { start: t, end: t, exitCode: r.exitCode, output: r.output }].slice(-5);
      const was = h.status;
      if (r.exitCode === 0) h = { ...h, status: 'healthy', streak: 0 };
      else if (!(h.status === 'starting' && t - started < startPeriod)) { const streak = h.streak + 1; h = { ...h, streak, ...streak >= retries ? { status: 'unhealthy' as const } : {} }; }
      // E24: a change of status is an event (health_status: healthy).
      if (changed && h.status !== was) changed(c0, h.status, t);
      h.next = t + (h.status === 'starting' && t - started < startPeriod ? startInterval : interval);
    }
    d = { ...d, containers: d.containers.map(x => x.id === c0.id ? { ...x, health: h } : x) };
  }
  return d === d0 ? host : { ...host, docker: d };
}

/** docker inspect's State.Health. */
export function healthJson(h: HealthState): Record<string, unknown> {
  const stamp = (t: Seconds) => `${isoText(t).replace(' ', 'T')}.000000000Z`;
  return { Status: h.status, FailingStreak: h.streak, Log: h.log.map(l => ({ Start: stamp(l.start), End: stamp(l.end), ExitCode: l.exitCode, Output: l.output })) };
}
/** docker inspect's Config.Healthcheck (durations in nanoseconds; unset ones left out, as the API omits zero values). */
export function healthConfigJson(h: HealthConfig): Record<string, unknown> {
  const ns = (s: number) => Math.round(s * 1e9);
  return { Test: h.test, ...h.interval ? { Interval: ns(h.interval) } : {}, ...h.timeout ? { Timeout: ns(h.timeout) } : {}, ...h.startPeriod ? { StartPeriod: ns(h.startPeriod) } : {},
    ...h.startInterval ? { StartInterval: ns(h.startInterval) } : {}, ...h.retries ? { Retries: h.retries } : {} };
}
/** BuildKit's history line of HEALTHCHECK: Go's %q of the config (strings and durations quoted, the retries as a rune). */
export function healthHistory(h: HealthConfig): string {
  const q = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  const rune = (n: number) => n >= 32 && n < 127 && n !== 39 && n !== 92 ? `'${String.fromCharCode(n)}'` : `'\\x${n.toString(16).padStart(2, '0')}'`;
  return `HEALTHCHECK &{[${h.test.map(q).join(' ')}] ${q(durationText(h.interval))} ${q(durationText(h.timeout))} ${q(durationText(h.startPeriod))} ${q(durationText(h.startInterval))} ${rune(h.retries)}}`;
}

/** HEALTHCHECK's options and its CMD (exec or shell form) or NONE, as a Dockerfile writes it; an error's text otherwise. */
export function parseHealthcheckInstruction(args: string, json?: string[]): HealthConfig | { error: string } {
  let rest = args.trim();
  const h: HealthConfig = { test: [], interval: 0, timeout: 0, retries: 0, startPeriod: 0, startInterval: 0 };
  for (let m = /^--([a-z-]+)=(\S+)\s*/.exec(rest); m; m = /^--([a-z-]+)=(\S+)\s*/.exec(rest)) {
    rest = rest.slice(m[0].length);
    if (m[1] === 'retries') { if (!/^\d+$/.test(m[2])) return { error: `HEALTHCHECK --retries: invalid value ${m[2]}` }; h.retries = Number(m[2]); continue; }
    const key = ({ interval: 'interval', timeout: 'timeout', 'start-period': 'startPeriod', 'start-interval': 'startInterval' } as Record<string, keyof HealthConfig>)[m[1]];
    if (!key) return { error: `Unknown flag: ${m[1]}` };
    const v = parseDuration(m[2]);
    if (v === null) return { error: `time: invalid duration "${m[2]}"` };
    (h[key] as number) = v;
  }
  if (/^NONE\s*$/i.test(rest)) return { ...h, test: ['NONE'] };
  const cmd = /^CMD\s+(.*)$/is.exec(rest);
  if (!cmd) return { error: 'Unknown type "' + (rest.split(/\s+/)[0] ?? '') + '" in HEALTHCHECK (try CMD)' };
  const list = json ?? (() => { try { const v = JSON.parse(cmd[1]) as unknown; return Array.isArray(v) && v.every(x => typeof x === 'string') ? v as string[] : undefined; } catch { return undefined; } })();
  return { ...h, test: list ? ['CMD', ...list] : ['CMD-SHELL', cmd[1].trim()] };
}
