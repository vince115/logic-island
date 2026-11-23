import { LIMITS, parentOf, resolvePath, type FsState } from './fs';
import { DEFAULT_NOW, parseTime } from './clock';
import { commOf, tableOf } from './processes';
import {
  buildFor, byDigest, containerEnv, DEFAULT_OS_RELEASE, digestOf, E22_IMAGE_COMMANDS, effective, findContainer, IMAGE_COMMANDS, imageIdOf, imageNodes, parseRef, programFor, settleDocker, statusText, syncDocker,
  type BuildTool, type DockerContainer, type DockerImage, type DockerProgram, type DockerState, type HistoryRow, type LogSeed, type PortBinding,
} from './docker';
import { dieAttrs, emit, normalizeCap, parseBytes, policyOf, restartProblem, schedule, signalNumber, stateOf, type DockerEvent, type RuntimeSpec } from './runtime';
import { activeTest, parseDuration, startHealth, type HealthConfig } from './health';
import { digestRefOf, hostOf, manifestOf, type DockerRegistry } from './registry';
import { composeContainer } from './compose';
import { rootfsOf, type BuildPackage } from './build';
import {
  assignAddresses, builtinNetworks, ensureVolumeDir, hostsText, imageVolumes, isVolumeName, mountedNodes, NETWORK_NAME, networkView, nextSubnet, overlaps, parseVolumeFlag, prepareMounts,
  resolvText, volumeDir, type DockerNetwork,
} from './storage-net';
import { basicResolver, networkOf, parseCidr, reach } from './sockets';
import type { TerminalFile, TerminalMachine, TerminalProcess, TerminalService } from './lesson';
import type { Program } from './services';
import { sha256 } from './ssh';

/*
 * Engine stage E20 as lesson data (docs/curriculum/DKR0_CONTAINER_CAPABILITY.md §6). A machine of the containers profile
 * with `docker` has Docker CE installed the way the docker-ce packages install it on Ubuntu 24.04 (the docker group, the
 * daemon's socket /run/docker.sock root:docker 0660, docker.service and containerd.service with their processes) unless the
 * lesson lists them. Its images (local ones are `pulled`; the others only on the simulated Docker Hub) and the containers
 * that exist at the start become the daemon's state. The checks container and image read the daemon after the commands.
 */

/** E20: an image of the lesson: on Docker Hub (unless registry: false) and, when pulled, already local. */
export interface TerminalImage extends TerminalRuntime {
  /** REPOSITORY[:TAG] (default tag latest), e.g. nginx:1.27, hello-world, bitnami/redis:7.4. */
  name: string;
  /** Bytes (docker images shows 192MB). */
  size: number;
  /** When it was built (UTC 'YYYY-MM-DD HH:MM:SS'), not after now. */
  created: string;
  /** CMD in exec form; ENTRYPOINT (an official image's docker-entrypoint.sh hands over to the command). */
  cmd: string[];
  entrypoint?: string[];
  env?: string[];
  workdir?: string;
  expose?: number[];
  /** Its service answers HTTP on this container port with this responder of the machine (accessLog: nginx's access lines in docker logs). */
  http?: { port: number; responder: string; accessLog?: 'nginx' };
  /** The main process keeps running (a server); otherwise it prints `output` and exits with `exit` (default 0). */
  service?: boolean;
  /** What the main process prints when it starts (a string is standard output; { text, stream: 2 } standard error). */
  logs?: LogSeed[];
  output?: string;
  exit?: number;
  /** Exit status after docker stop (default 0 for a server, 137 for a command that ignores SIGTERM). */
  stopExit?: number;
  /** Its executables, among the simulation's (default all: ls cat echo env ps sh bash sleep…). */
  commands?: string[];
  files?: { path: string; content: string }[];
  /** /etc/os-release (default Debian 12). */
  osRelease?: string;
  /** How many layers docker pull downloads (default 3). */
  layers?: number;
  /** Already local at the start (default false: only on Docker Hub). */
  pulled?: boolean;
  /** false: a local image Docker Hub does not have (it must be pulled: true). */
  registry?: false;
  /** E21: USER and LABEL of its config. */
  user?: string;
  labels?: Record<string, string>;
  /** E21: what its package managers can install in a RUN step (apt on Debian and Ubuntu; pip and npm when declared) and what apt-get update writes. */
  packages?: { apt?: BuildPackage[]; pip?: BuildPackage[]; npm?: BuildPackage[]; aptLists?: number };
  /** E21: docker history's rows, oldest first (a row with a size, or layer: true, is a layer; the layer sizes add up to size). */
  history?: { createdBy: string; size?: number; layer?: boolean }[];
  /** E22: its VOLUME paths (each container gets an anonymous volume there). */
  volumes?: string[];
  /**
   * E23: its HEALTHCHECK (test: ["CMD", …], ["CMD-SHELL", "line"] or ["NONE"]; durations like 5s, 1m30s), how many seconds
   * its service needs after the start before it accepts connections, and more tags of a private registry's image (the
   * same manifest; the image's name says which registry: registry.example.com:5000/team/api:1.0).
   */
  healthcheck?: TerminalHealthcheck;
  ready?: number;
  tags?: string[];
  /** E24: its STOPSIGNAL (SIGQUIT for nginx), and what its own main process does over time (TerminalRuntime). */
  stopSignal?: string;
}
/**
 * E24: what a main process (a program's, or an image's own) does over time, as lesson data: the environment variables it
 * needs (else it prints missingEnv and exits), its own exit after some seconds, its memory (bytes at the start, growth per
 * second, a ceiling), CPU percent and process count (docker stats), the signals it handles (SIGTERM: { seconds, logs, exit }),
 * the paths it writes at the start (a read-only root file system makes it print readOnlyError and exit) and the
 * capabilities it needs (else capMissing).
 */
export interface TerminalRuntime {
  needsEnv?: string[]; missingEnv?: { output: string; exit?: number };
  exitAfter?: { seconds: number; exit?: number; logs?: LogSeed[] };
  memory?: { start: number; growth?: number; max?: number }; cpu?: number; pids?: number;
  signals?: Record<string, { seconds?: number; logs?: LogSeed[]; exit?: number }>;
  writes?: string[]; readOnlyError?: { output: string; exit?: number };
  caps?: string[]; capMissing?: { output: string; exit?: number };
}
const RUNTIME_KEYS = ['needsEnv', 'missingEnv', 'exitAfter', 'memory', 'cpu', 'pids', 'signals', 'writes', 'readOnlyError', 'caps', 'capMissing'] as const;
/** E23: a health check as lesson data. */
export interface TerminalHealthcheck { test: string[]; interval?: string; timeout?: string; retries?: number; startPeriod?: string; startInterval?: string }
/** E23: a private registry of the lesson (images named with its host are served by it). Tokens must be obviously fake lesson tokens. */
export interface TerminalRegistry { host: string; users?: { name: string; token: string; push?: boolean; repos?: string[] }[]; immutable?: boolean; public?: boolean }
/** E23: a build tool a RUN step may use (its exact words), what it needs and the files it writes (size: what each weighs). */
export interface TerminalBuildTool { command: string[]; needs?: string[]; missing?: { output: string; exit?: number }; writes: { path: string; size: number; mode?: number }[]; output?: string; exit?: number; seconds?: number }
/** E21: what a program does when a container runs it (matched by its exact words, after an entrypoint script hands over). */
export interface TerminalProgram extends TerminalRuntime {
  command: string[];
  /** Files it needs, relative to the working directory or absolute; the first one missing makes it print `missing` (standard error) and exit. */
  needs?: string[];
  missing?: { output: string; exit?: number };
  /** It keeps running (a server) and logs these lines; otherwise it prints `output` and exits with `exit`. */
  service?: boolean;
  logs?: LogSeed[];
  output?: string;
  exit?: number;
  /** Exit status after docker stop (default 137: PID 1 without a SIGTERM handler). */
  stopExit?: number;
  /** It answers HTTP on this container port with this responder of the machine. */
  http?: { port: number; responder: string; accessLog?: 'nginx' };
  /** E23: seconds after the start before its service accepts connections. */
  ready?: number;
}
/** E20: a container that exists at the start. */
export interface TerminalContainer {
  name: string;
  /** The image as named (must be a pulled image). */
  image: string;
  /** A command instead of the image's CMD. */
  command?: string[];
  state: 'created' | 'running' | 'exited';
  created: string;
  started?: string;
  finished?: string;
  exitCode?: number;
  /** -p: HOST:CONTAINER or IP:HOST:CONTAINER (tcp; /udp allowed). */
  ports?: string[];
  env?: string[];
  /** Its log so far (default: what the image prints when it starts, once per start). */
  logs?: LogSeed[];
  /** Files of its writable layer. */
  files?: { path: string; content: string }[];
  rm?: boolean;
  /** E22: -v specs (NAME:/path, /host/path:/path[:ro]), the network (default bridge) with its aliases there, and -u. */
  volumes?: string[];
  network?: string;
  aliases?: string[];
  user?: string;
  /**
   * E24: --restart, -m (256m), --memory-swap, --cpus, --init, --read-only, --tmpfs paths, --cap-add, --cap-drop,
   * --security-opt, --privileged, --stop-signal and --stop-timeout; how many times it was restarted, and whether its last
   * run was OOM-killed (an exited container with exit code 137).
   */
  restart?: string; memory?: string; memorySwap?: string; cpus?: number; init?: boolean; readOnly?: boolean; tmpfs?: string[];
  capAdd?: string[]; capDrop?: string[]; securityOpt?: string[]; privileged?: boolean; stopSignal?: string; stopTimeout?: number;
  restartCount?: number; oomKilled?: boolean;
}
/** E22: a volume that exists at the start, with files (paths from the volume's root; owner: a user of the host, or a number). */
export interface TerminalVolume { name: string; created?: string; files?: { path: string; content: string; owner?: string; mode?: number }[] }
/** E22: a user-defined bridge network (default subnet: the next free 172.18.0.0/16, 172.19.0.0/16…). */
export interface TerminalNetwork { name: string; subnet?: string; created?: string }
export interface TerminalDocker {
  images?: TerminalImage[]; containers?: TerminalContainer[]; /** E21 */ programs?: TerminalProgram[]; /** E22 */ volumes?: TerminalVolume[]; networks?: TerminalNetwork[];
  /** E23 */ registries?: TerminalRegistry[]; tools?: TerminalBuildTool[];
}

export type DockerCheck =
  /**
   * E20: the container exists (absent: it does not) in this state, from this image, with this port published (HOST:CONTAINER),
   * exit code and environment variable (K=V). E23: and this health. E24: restarting as a state; its last run OOM-killed (or
   * not), restarted at least restartCount times, this restart policy (on-failure:3), memory limit (bytes), CPUs, a
   * read-only root file system, this user (Config.User), and these capabilities dropped. DKR-5: privileged or not, and
   * whether the Docker socket (a bind mount whose source ends in docker.sock) is mounted.
   */
  | { kind: 'container'; name: string; absent?: true; state?: 'created' | 'running' | 'exited' | 'restarting'; image?: string; port?: string; exitCode?: number; env?: string; health?: 'starting' | 'healthy' | 'unhealthy';
      oomKilled?: boolean; restartCount?: number; restartPolicy?: string; memory?: number; cpus?: number; readOnly?: boolean; user?: string; capDrop?: string[]; privileged?: boolean; dockerSocket?: boolean }
  /**
   * E20: the image is local (absent: it is not). E21: its config has this label (K=V), environment variable (K=V), CMD,
   * ENTRYPOINT (exec form, exactly), USER, exposed TCP port and working directory, and this many layers (RootFS).
   */
  | { kind: 'image'; name: string; absent?: true; label?: string; env?: string; cmd?: string[]; entrypoint?: string[]; user?: string; port?: number; workdir?: string; layers?: number; /** E23: a repository digest (sha256:…) it has; the name may also be NAME@sha256:… */ digest?: string; /** E23: at most this many bytes */ maxSize?: number }
  /**
   * E21: building the context (with its Dockerfile, or `file`), then again after a change to the file `change` (a path in
   * the context), keeps the steps `cached` CACHED and runs the steps `rebuilt` again (each names a step by its beginning,
   * e.g. 'RUN pip install'). The builds run on a copy of the machine after the commands.
   */
  | { kind: 'build'; context: string; file?: string; change: string; cached?: string[]; rebuilt?: string[] }
  /** E22: the volume exists (absent: it does not), with this file (a path from its root) whose content contains `content`. */
  | { kind: 'volume'; name: string; absent?: true; file?: string; content?: string }
  /** E22: the network exists (absent: it does not), with this container attached, of this driver and subnet. */
  | { kind: 'network'; name: string; absent?: true; container?: string; driver?: 'bridge'; subnet?: string }
  /** E22: from the running container, a connection to `to` (a name its DNS should know, or an address) on port: succeeded, refused, timeout, or the name does not resolve. */
  | { kind: 'reach'; container: string; to: string; port: number; result: 'succeeded' | 'refused' | 'timeout' | 'unresolved' }
  /** E23: the Compose project's service has a container (absent: none) in this state, with this health, from this image. */
  | { kind: 'compose'; project: string; service: string; absent?: true; state?: 'created' | 'running' | 'exited'; health?: 'starting' | 'healthy' | 'unhealthy'; image?: string }
  /** E23: the registry's repository has the tag (absent: it does not), pointing to this digest, or to the content of this local image. */
  | { kind: 'registry'; registry: string; repository: string; tag: string; absent?: true; digest?: string; image?: string };
export interface DockerLevels { containers: boolean; images?: boolean; storageNet?: boolean; compose?: boolean; runtime?: boolean }

const DOCKER_GID = 988;
const DOCKERD = '/usr/bin/dockerd -H fd:// --containerd=/run/containerd/containerd.sock';
const DOCKER_UNIT = '[Unit]\nDescription=Docker Application Container Engine\nDocumentation=https://docs.docker.com\nAfter=network-online.target containerd.service\nWants=network-online.target containerd.service\n\n[Service]\nType=notify\nExecStart=/usr/bin/dockerd -H fd:// --containerd=/run/containerd/containerd.sock\nExecReload=/bin/kill -s HUP $MAINPID\nRestart=always\nRestartSec=2\n\n[Install]\nWantedBy=multi-user.target\n';
const CONTAINERD_UNIT = '[Unit]\nDescription=containerd container runtime\nDocumentation=https://containerd.io\nAfter=network.target\n\n[Service]\nExecStart=/usr/bin/containerd\nType=notify\nRestart=always\nRestartSec=5\n\n[Install]\nWantedBy=multi-user.target\n';

const whole = (x: unknown, min: number, max: number) => Number.isInteger(x) && (x as number) >= min && (x as number) <= max;
const line = (max: number) => (t: unknown) => typeof t === 'string' && t.length >= 1 && t.length <= max && !t.includes('\n');
const normalized = (path: unknown) => typeof path === 'string' && path.startsWith('/') && resolvePath({ cwd: '/', home: '/' }, path) === path;
const hex = (text: string) => [...sha256(new TextEncoder().encode(text))].map(b => b.toString(16).padStart(2, '0')).join('');
const ENV = /^[A-Za-z_][A-Za-z0-9_]*=[^\n]*$/;
const NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/;
const PORT = /^(?:(\d+\.\d+\.\d+\.\d+):)?(\d+):(\d+)(?:\/(tcp|udp))?$/;
const seedText = (s: LogSeed) => typeof s === 'string' ? s : s?.text;

/** Docker CE as the docker-ce packages install it, unless the lesson lists it. */
export function expandDocker(m: TerminalMachine, lv: DockerLevels, add: { file(f: TerminalFile): void; dir(path: string, mode?: number, group?: string): void },
  procs: TerminalProcess[], programs: Program[], services: TerminalService[], pidFrom: (want: number) => number, groups: { name: string; gid?: number; members?: string[] }[]): void {
  void services;
  if (!lv.containers || m.docker === undefined) return;
  const file = (path: string, content: string, mode = 0o644, group?: string) => add.file({ path, kind: 'file', mode, owner: 'root', ...group ? { group } : {}, content });
  const link = (path: string, target: string) => add.file({ path, kind: 'link', mode: 0o777, owner: 'root', target });
  if (!groups.some(g => g.name === 'docker')) groups.push({ name: 'docker', gid: DOCKER_GID });
  ['/usr', '/usr/bin'].forEach(d => add.dir(d));
  for (const exe of ['docker', 'dockerd', 'containerd', 'docker-proxy']) file(`/usr/bin/${exe}`, '', 0o755);
  add.dir('/run');
  add.dir('/run/containerd', 0o711);
  file('/run/docker.sock', '', 0o660, 'docker');
  ['/var', '/var/lib'].forEach(d => add.dir(d));
  add.dir('/var/lib/docker', 0o710);
  ['/etc', '/etc/systemd', '/etc/systemd/system', '/etc/systemd/system/multi-user.target.wants', '/usr/lib', '/usr/lib/systemd', '/usr/lib/systemd/system'].forEach(d => add.dir(d));
  file('/usr/lib/systemd/system/docker.service', DOCKER_UNIT);
  file('/usr/lib/systemd/system/containerd.service', CONTAINERD_UNIT);
  link('/etc/systemd/system/multi-user.target.wants/docker.service', '/usr/lib/systemd/system/docker.service');
  link('/etc/systemd/system/multi-user.target.wants/containerd.service', '/usr/lib/systemd/system/containerd.service');
  if (!programs.some(p => p.path === '/usr/bin/containerd')) programs.push({ path: '/usr/bin/containerd', rss: 47104, vsz: 1873408 });
  if (!programs.some(p => p.path === '/usr/bin/dockerd')) programs.push({ path: '/usr/bin/dockerd', title: DOCKERD, rss: 81920, vsz: 2412544, hup: 'reload' });
  if (!procs.some(p => commOf(p.command) === 'containerd')) procs.push({ pid: pidFrom(850), user: 'root', command: '/usr/bin/containerd', stat: 'Ssl', rss: 47104, vsz: 1873408, unit: 'containerd.service' });
  if (!procs.some(p => commOf(p.command) === 'dockerd')) procs.push({ pid: pidFrom(900), user: 'root', command: DOCKERD, stat: 'Ssl', rss: 81920, vsz: 2412544, unit: 'docker.service', hup: 'reload' });
}

/** E23: a lesson health check as the daemon's (durations in seconds; 0 is not set). */
export function healthOf(h: TerminalHealthcheck): HealthConfig {
  const d = (x: string | undefined) => x === undefined ? 0 : parseDuration(x) ?? 0;
  return { test: [...h.test], interval: d(h.interval), timeout: d(h.timeout), retries: h.retries ?? 0, startPeriod: d(h.startPeriod), startInterval: d(h.startInterval) };
}
/** E23: the executables an image may list on the compose profile: E22's, pg_isready, and the lesson's build tools. */
const composeCommands = (m: TerminalMachine) => [...E22_IMAGE_COMMANDS, 'pg_isready', ...(m.docker?.tools ?? []).map(t => (t.command?.[0] ?? '').slice((t.command?.[0] ?? '').lastIndexOf('/') + 1)).filter(Boolean)];
/** E24: a lesson's runtime declaration as the daemon's spec (defaults filled in), or undefined when it declares none. */
export function specOf(t: TerminalRuntime): RuntimeSpec | undefined {
  if (!RUNTIME_KEYS.some(k => t[k] !== undefined)) return undefined;
  const lines = (x: { output: string; exit?: number } | undefined) => x ? { output: x.output, exit: x.exit ?? 1 } : undefined;
  const signals = t.signals ? Object.fromEntries(Object.entries(t.signals).map(([k, v]) => [k.toUpperCase().replace(/^SIG/, ''), { seconds: v.seconds ?? 0, logs: [...v.logs ?? []], exit: v.exit ?? 0 }])) : undefined;
  const spec: RuntimeSpec = {
    ...t.needsEnv ? { needsEnv: [...t.needsEnv] } : {}, ...t.missingEnv ? { missingEnv: lines(t.missingEnv)! } : {},
    ...t.exitAfter ? { exitAfter: { seconds: t.exitAfter.seconds, exit: t.exitAfter.exit ?? 1, logs: [...t.exitAfter.logs ?? []] } } : {},
    ...t.memory ? { memory: { start: t.memory.start, growth: t.memory.growth ?? 0, ...t.memory.max !== undefined ? { max: t.memory.max } : {} } } : {},
    ...t.cpu !== undefined ? { cpu: t.cpu } : {}, ...t.pids !== undefined ? { pids: t.pids } : {}, ...signals ? { signals } : {},
    ...t.writes ? { writes: [...t.writes] } : {}, ...t.readOnlyError ? { readOnlyError: lines(t.readOnlyError)! } : {},
    ...t.caps ? { caps: [...t.caps] } : {}, ...t.capMissing ? { capMissing: lines(t.capMissing)! } : {},
  };
  return spec;
}
/** A lesson image as the daemon's image. */
function imageOf(i: TerminalImage, m: TerminalMachine, e22 = false, e23 = false, e24 = false): DockerImage | undefined {
  const ref = parseRef(i.name), created = parseTime(i.created);
  if (!ref || created === undefined) return undefined;
  const responder = i.http ? (m.responders ?? []).find(r => r.id === i.http!.responder) : undefined;
  return {
    repo: ref.repo, tag: ref.tag, id: imageIdOf(ref.repo, ref.tag, created), digest: digestOf(ref.repo, ref.tag), size: i.size, created,
    cmd: [...i.cmd], entrypoint: [...i.entrypoint ?? []], env: [...i.env ?? []], workdir: i.workdir ?? '/', expose: [...i.expose ?? []],
    ...i.http && responder ? { http: { port: i.http.port, responder: { ...responder, routes: responder.routes.map(r => ({ ...r })) }, ...i.http.accessLog ? { accessLog: i.http.accessLog } : {} } } : {},
    service: !!i.service, logs: [...i.logs ?? []], ...i.output !== undefined ? { output: i.output } : {}, exit: i.exit ?? 0, ...i.stopExit !== undefined ? { stopExit: i.stopExit } : {},
    commands: [...i.commands ?? (e22 ? E22_IMAGE_COMMANDS : IMAGE_COMMANDS)], files: (i.files ?? []).map(f => ({ ...f })), osRelease: i.osRelease ?? DEFAULT_OS_RELEASE,
    layers: i.layers ?? (i.history ? i.history.filter(isLayer).length : 3), local: !!i.pulled, pullable: i.registry !== false,
    // E21: the config's USER and labels, the package tables and the declared history.
    ...i.user ? { user: i.user } : {}, ...i.labels ? { labels: { ...i.labels } } : {}, ...i.packages ? { packages: { ...i.packages } } : {},
    ...i.history ? { history: i.history.map((h): HistoryRow => ({ created, createdBy: h.createdBy, size: h.size ?? 0, empty: !isLayer(h), comment: 'buildkit.dockerfile.v0' })) } : {},
    // E22: the image's VOLUME paths.
    ...e22 && i.volumes?.length ? { volumes: [...i.volumes] } : {},
    // E23: HEALTHCHECK and how long its service takes to start.
    ...e23 && i.healthcheck ? { healthcheck: healthOf(i.healthcheck) } : {}, ...e23 && i.ready ? { ready: i.ready } : {},
    // E24: STOPSIGNAL and what its main process does over time.
    ...e24 && i.stopSignal ? { stopSignal: i.stopSignal } : {}, ...e24 && specOf(i) ? { runtime: specOf(i)! } : {},
  };
}
const isLayer = (h: { size?: number; layer?: boolean }) => h.layer ?? (h.size ?? 0) > 0;
/** E21: a lesson program as the daemon's. */
function programOf(p: TerminalProgram, m: TerminalMachine, e24 = false): DockerProgram {
  const responder = p.http ? (m.responders ?? []).find(r => r.id === p.http!.responder) : undefined;
  return {
    command: [...p.command], needs: [...p.needs ?? []], ...p.missing ? { missing: { output: p.missing.output, exit: p.missing.exit ?? 1 } } : {}, service: !!p.service, logs: [...p.logs ?? []],
    ...p.output !== undefined ? { output: p.output } : {}, exit: p.exit ?? 0, ...p.stopExit !== undefined ? { stopExit: p.stopExit } : {},
    ...p.http && responder ? { http: { port: p.http.port, responder: { ...responder, routes: responder.routes.map(r => ({ ...r })) }, ...p.http.accessLog ? { accessLog: p.http.accessLog } : {} } } : {},
    ...p.ready ? { ready: p.ready } : {}, ...e24 && specOf(p) ? { runtime: specOf(p)! } : {},
  };
}
const portOf = (text: string): PortBinding | undefined => {
  const p = PORT.exec(text);
  return p ? { hostIp: p[1] ?? '0.0.0.0', host: Number(p[2]), container: Number(p[3]), proto: (p[4] ?? 'tcp') as 'tcp' | 'udp' } : undefined;
};
const seeds = (list: readonly LogSeed[], t: number) => list.map(s => typeof s === 'string' ? { t, stream: 1 as const, text: s } : { t, stream: s.stream ?? 1, text: s.text });

/** E20: the daemon's state of a machine (on the state machineState built), with docker-proxy for the running containers' ports. */
export function dockerState(m: TerminalMachine, state: FsState, lv: DockerLevels): FsState {
  if (!lv.containers || m.docker === undefined) return state;
  // E23: an image named with a private registry's host is that registry's (local only when pulled).
  const hosts = new Set(lv.compose ? (m.docker.registries ?? []).map(r => r.host) : []);
  const inRegistry = (i: TerminalImage) => { const r = parseRef(i.name); const h = r ? hostOf(r.repo) : undefined; return !!h && hosts.has(h); };
  const all = (m.docker.images ?? []).map(i => ({ t: i, img: imageOf(i, m, !!lv.storageNet, !!lv.compose, !!lv.runtime) })).filter((x): x is { t: TerminalImage; img: DockerImage } => !!x.img);
  const images = all.map(x => inRegistry(x.t) ? { ...x.img, pullable: false } : x.img).filter(i => i.pullable || i.local);
  const host = m.host ?? 'logic-island';
  const containers: DockerContainer[] = [];
  let ip = 2;
  for (const t of m.docker.containers ?? []) {
    const ref = parseRef(t.image), img = ref ? images.find(i => i.local && i.repo === ref.repo && i.tag === ref.tag) : undefined;
    if (!img) continue;
    const id = hex(`container/${host}/${t.name}`), created = parseTime(t.created) ?? 0, started = t.started !== undefined ? parseTime(t.started) : undefined;
    const finished = t.finished !== undefined ? parseTime(t.finished) : undefined;
    const cmd = t.command ?? img.cmd, [path, ...args] = img.entrypoint.length ? [...img.entrypoint, ...cmd] : cmd;
    // The writable layer: the image's files, Docker's /etc/hostname and /etc/hosts, then the lesson's files.
    const running = t.state === 'running', addr = running ? `172.17.0.${ip++}` : undefined;
    const nodes = imageNodes(img, id, addr);
    const file = (p: string, content: string) => {
      for (let at = parentOf(p), missing: string[] = []; ; at = parentOf(at)) {
        if (nodes.has(at)) { missing.reverse().forEach(x => nodes.set(x, { kind: 'dir', mode: 0o755, owner: 'root' })); break; }
        missing.push(at);
      }
      nodes.set(p, { kind: 'file', mode: 0o644, owner: 'root', content });
    };
    for (const f of t.files ?? []) file(f.path, f.content);
    const defaultLogs = started === undefined || t.command ? [] : [...seeds(img.logs, started), ...img.service || img.output === undefined || img.output === '' ? [] : img.output.replace(/\n$/, '').split('\n').map(text => ({ t: started, stream: 1 as const, text }))];
    containers.push({
      id, name: t.name, ref: t.image, image: img.id, path: path ?? '', args, cmd: [...cmd], custom: !!t.command, created, ...started !== undefined ? { started } : {}, ...finished !== undefined ? { finished } : {},
      status: t.state, exitCode: t.exitCode ?? 0, ports: (t.ports ?? []).map(portOf).filter((p): p is PortBinding => !!p), env: [...t.env ?? []], workdir: img.workdir, rm: !!t.rm, tty: false, interactive: false,
      logs: t.logs ? seeds(t.logs, started ?? created) : defaultLogs, nodes, ...addr ? { ip: addr } : {}, execs: 0, ...img.user ? { user: img.user } : {},
    });
  }
  const daemonPid = tableOf(state).find(p => p.command === DOCKERD)?.pid;
  const programs = lv.images ? (m.docker.programs ?? []).map(p => programOf(p, m, !!lv.runtime)) : [];
  let docker: DockerState = { images, containers, seq: containers.length, ...daemonPid !== undefined ? { daemonPid } : {}, ...programs.length ? { programs } : {}, ...lv.images ? { hostProcesses: true as const } : {} };
  if (lv.compose) docker = composeState(m, docker, all.filter(x => inRegistry(x.t)));
  if (lv.runtime) docker = runtimeState(m, docker);
  if (lv.storageNet) return syncDocker(lv.runtime ? scheduled(storageNetState(m, state, docker)) : storageNetState(m, state, docker));
  return syncDocker({ ...state, docker });
}

/**
 * E24: the runtime profile's daemon: each container's runtime fields (limits, restart policy, signals, security options,
 * restart count, OOM kill), what its main process does (the program's or the image's spec), and the events of its life so
 * far (create, start, die). A running container's planned exit and OOM kill are scheduled from its start (scheduled).
 */
function runtimeState(m: TerminalMachine, d0: DockerState): DockerState {
  const given = m.docker!.containers ?? [], events: DockerEvent[] = [];
  let d: DockerState = { ...d0, runtime: true };
  const containers = d0.containers.map(c0 => {
    const t = given.find(x => x.name === c0.name)!, img = d0.images.find(i => i.id === c0.image);
    const caps = (list: string[] | undefined) => (list ?? []).map(x => normalizeCap(x)).filter((x): x is string => !!x);
    const memory = t.memory !== undefined ? parseBytes(t.memory) ?? undefined : undefined, memorySwap = t.memorySwap !== undefined ? (t.memorySwap === '-1' ? -1 : parseBytes(t.memorySwap) ?? undefined) : undefined;
    const limits = { ...memory !== undefined ? { memory } : {}, ...memorySwap !== undefined ? { memorySwap } : {}, ...t.cpus !== undefined ? { nanoCpus: Math.round(t.cpus * 1e9) } : {} };
    const stopSignal = t.stopSignal ?? img?.stopSignal;
    let c: DockerContainer = {
      ...c0, ...Object.keys(limits).length ? { limits } : {}, ...t.restart !== undefined ? { restart: t.restart } : {}, ...t.init ? { init: true as const } : {}, ...t.readOnly ? { readOnly: true as const } : {},
      ...caps(t.capAdd).length ? { capAdd: caps(t.capAdd) } : {}, ...caps(t.capDrop).length ? { capDrop: caps(t.capDrop) } : {}, ...t.securityOpt?.length ? { securityOpt: [...t.securityOpt] } : {},
      ...t.privileged ? { privileged: true as const } : {}, ...stopSignal ? { stopSignal } : {}, ...t.stopTimeout !== undefined ? { stopTimeout: t.stopTimeout } : {},
      ...t.restartCount ? { restartCount: t.restartCount } : {}, ...t.oomKilled ? { oomKilled: true as const } : {},
    };
    const imageMain = !!img && !c.custom && !img.ownMain, spec = imageMain ? img!.runtime : programFor(d0, effective(c))?.runtime;
    if (spec && c.status !== 'created') c = { ...c, spec };
    // A running container's own exit (exitAfter) counts from its start.
    if (c.status === 'running' && spec?.exitAfter) c = { ...c, plan: { t: (c.started ?? 0) + spec.exitAfter.seconds, exit: spec.exitAfter.exit, logs: spec.exitAfter.logs } };
    return c;
  });
  d = { ...d, containers };
  for (const c of containers) {
    const at = (t: number, action: string, extra: Record<string, string> = {}) => { const one = emit({ ...d, events: [] }, t, action, c, extra).events![0]; events.push(one); };
    at(c.created, 'create');
    if (c.started !== undefined) at(c.started, 'start');
    if (c.finished !== undefined) { if (c.oomKilled) at(c.finished, 'oom'); at(c.finished, 'die', dieAttrs(c)); }
  }
  return { ...d, events: events.map((e, k) => ({ e, k })).sort((a, b) => a.e.t - b.e.t || a.k - b.k).map(x => x.e) };
}
/** E24: the running containers' planned exits and OOM kills, from their starts (the host's swap decides the OOM limit). */
function scheduled(state: FsState): FsState {
  const d = state.docker!;
  return { ...state, docker: { ...d, containers: d.containers.map(c => c.status === 'running' ? schedule(state, c) : c) } };
}

/**
 * E23: the compose profile's daemon: health checks on, the lesson's registries (each image named with a registry's host is
 * a manifest there under its tag and its other tags; a pulled one is also local, with that repository digest) and build tools.
 */
function composeState(m: TerminalMachine, d0: DockerState, held: { t: TerminalImage; img: DockerImage }[]): DockerState {
  const repoDigests: Record<string, string[]> = {};
  const registries: DockerRegistry[] = (m.docker!.registries ?? []).map(r => {
    const reg: { tags: Record<string, Record<string, string>>; digests: Record<string, string[]>; manifests: DockerRegistry['manifests']; blobs: Record<string, string[]> } = { tags: {}, digests: {}, manifests: {}, blobs: {} };
    const manifests: Record<string, DockerRegistry['manifests'][string]> = {};
    for (const { t, img } of held) {
      if (hostOf(img.repo) !== r.host) continue;
      const path = img.repo.slice(r.host.length + 1), mf = manifestOf(img);
      for (const tag of [img.tag, ...t.tags ?? []]) (reg.tags[path] ??= {})[tag] = mf.digest;
      reg.digests[path] = [...new Set([...reg.digests[path] ?? [], mf.digest])];
      reg.blobs[path] = [...new Set([...reg.blobs[path] ?? [], ...mf.layers.map(l => l.diffId)])];
      manifests[mf.digest] = { digest: mf.digest, size: mf.size, image: { ...img, repo: '', tag: '', local: false, pullable: false }, layers: mf.layers };
      if (img.local) repoDigests[img.id] = [...new Set([...repoDigests[img.id] ?? [], `${img.repo}@sha256:${mf.digest}`])];
    }
    return { host: r.host, users: (r.users ?? []).map(u => ({ name: u.name, token: u.token, push: u.push ?? true, ...u.repos ? { repos: [...u.repos] } : {} })), immutable: !!r.immutable, public: !!r.public, ...reg, manifests };
  });
  const tools: BuildTool[] = (m.docker!.tools ?? []).map(t => ({ command: [...t.command], needs: [...t.needs ?? []], ...t.missing ? { missing: { output: t.missing.output, exit: t.missing.exit ?? 1 } } : {}, writes: t.writes.map(w => ({ ...w })),
    ...t.output !== undefined ? { output: t.output } : {}, exit: t.exit ?? 0, ...t.seconds !== undefined ? { seconds: t.seconds } : {} }));
  // A container running at the start has its image's health check, started then (its probes run from that time).
  const containers = d0.containers.map(c => {
    const img = d0.images.find(i => i.id === c.image), hc = img?.healthcheck;
    if (!img || c.custom) return c;
    return { ...c, ...hc && activeTest(hc) ? { healthcheck: hc, ...c.status === 'running' ? { health: startHealth(hc, c.started ?? 0) } : {} } : {}, ...c.status === 'running' && img.ready ? { readyAt: (c.started ?? 0) + img.ready } : {} };
  });
  return { ...d0, containers, compose: true, ...registries.length ? { registries } : {}, ...Object.keys(repoDigests).length ? { repoDigests } : {}, ...tools.length ? { tools } : {} };
}

/**
 * E22: the daemon's volumes and networks at the start: bridge, host and none, the lesson's networks (with the next free
 * subnets), its volumes (folders of /var/lib/docker/volumes with their files), and each container's mounts (created and
 * filled from the image as docker run does), networks and addresses (in the order the containers are listed).
 */
function storageNetState(m: TerminalMachine, state: FsState, d0: DockerState): FsState {
  const now = parseTime(m.now ?? DEFAULT_NOW) ?? 0, list = m.docker!;
  let d: DockerState = { ...d0, storageNet: true, networks: builtinNetworks(now), volumes: [], containers: [] };
  for (const n of list.networks ?? []) {
    const c = n.subnet ? parseCidr(n.subnet) : undefined, auto = nextSubnet(d);
    const subnet = c ? `${networkOf(c.address, c.prefix)}/${c.prefix}` : auto?.subnet, gateway = c ? networkOf(c.address, c.prefix).replace(/\d+$/, x => String(Number(x) + 1)) : auto?.gateway;
    const created = n.created !== undefined ? parseTime(n.created) ?? now : now;
    const net: DockerNetwork = { name: n.name, id: hex(`network/${n.name}/${created}/${d.networks!.length}`), driver: 'bridge', ...subnet ? { subnet } : {}, ...gateway ? { gateway } : {}, created };
    d = { ...d, networks: [...d.networks!, net] };
  }
  const nodes = new Map(state.nodes);
  for (const v of list.volumes ?? []) {
    ensureVolumeDir(nodes, v.name);
    for (const f of v.files ?? []) {
      const path = `${volumeDir(v.name)}${f.path}`;
      for (let at = parentOf(path); !nodes.has(at); at = parentOf(at)) nodes.set(at, { kind: 'dir', mode: 0o755, owner: 'root' });
      nodes.set(path, { kind: 'file', mode: f.mode ?? 0o644, owner: f.owner ?? 'root', content: f.content });
    }
    d = { ...d, volumes: [...d.volumes!, { name: v.name, created: v.created !== undefined ? parseTime(v.created) ?? now : now }] };
  }
  let host: FsState = { ...state, nodes, docker: d };
  const given = list.containers ?? [];
  for (const c0 of d0.containers) {
    const t = given.find(x => x.name === c0.name)!, img = d.images.find(i => i.id === c0.image);
    const mounts = (t.volumes ?? []).map(v => parseVolumeFlag(v, m.cwd ?? state.cwd, c0.id)).filter((x): x is Exclude<typeof x, { error: string }> => !('error' in x));
    // E24: --tmpfs paths (the runtime profile's containers).
    if (d0.runtime) for (const target of t.tmpfs ?? []) mounts.push({ type: 'tmpfs', source: '', target, readonly: false, via: 'mount' });
    if (img) mounts.push(...imageVolumes(img, mounts, c0.id));
    let c: DockerContainer = { ...c0, ip: undefined, networks: { [t.network ?? 'bridge']: { aliases: [...t.aliases ?? []] } }, ...mounts.length ? { mounts } : {}, ...t.user ? { user: t.user } : {} };
    const p = prepareMounts(host, d, c, c0.created);
    host = p.host; d = p.d; c = p.c;
    if (c.status === 'running') { const a = assignAddresses(d, c); if (!('missing' in a)) c = a; }
    const files = new Map(c.nodes);
    files.set('/etc/hosts', { kind: 'file', mode: 0o644, owner: 'root', content: hostsText(d, c) });
    files.set('/etc/resolv.conf', { kind: 'file', mode: 0o644, owner: 'root', content: resolvText(host, d, c) });
    c = { ...c, nodes: files };
    d = { ...d, containers: [...d.containers, c] };
  }
  return { ...host, docker: d };
}

/** E23: a lesson token: obviously fake (it says lesson, fake, example or demo) and not shaped like a real provider's token. */
const FAKE_TOKEN = (t: unknown) => typeof t === 'string' && /^[A-Za-z0-9._-]{8,80}$/.test(t) && /lesson|fake|example|demo/i.test(t)
  && !/^(ghp_|gho_|ghu_|ghs_|ghr_|github_pat_|glpat-|dckr_pat_|xox[abprs]-|AKIA|ASIA|sk-|AIza|ya29\.)/.test(t);
/** E23: why a lesson health check is not one, or null. */
function healthProblem(h: TerminalHealthcheck): string | null {
  if (!h || !Array.isArray(h.test) || !h.test.length || h.test.length > 20 || h.test.some(w => typeof w !== 'string' || w.includes('\n')) || !['CMD', 'CMD-SHELL', 'NONE'].includes(h.test[0]) || (h.test[0] === 'CMD-SHELL' && h.test.length !== 2) || (h.test[0] === 'CMD' && h.test.length < 2))
    return 'healthcheck.test is ["CMD", executable, …], ["CMD-SHELL", "line"] or ["NONE"]';
  for (const k of ['interval', 'timeout', 'startPeriod', 'startInterval'] as const) if (h[k] !== undefined && (typeof h[k] !== 'string' || parseDuration(h[k]!) === null)) return `healthcheck.${k} is a duration such as 5s or 1m30s`;
  if (h.retries !== undefined && !whole(h.retries, 0, 100)) return 'healthcheck.retries is 0..100';
  return null;
}
/** E24: why a runtime declaration is not one, or null. */
function runtimeProblem(t: TerminalRuntime): string | null {
  const out = (x: { output: string; exit?: number } | undefined) => x === undefined || (typeof x.output === 'string' && x.output.length <= LIMITS.fileLength && (x.exit === undefined || whole(x.exit, 0, 255)));
  if (t.needsEnv !== undefined && (!Array.isArray(t.needsEnv) || t.needsEnv.some(n => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(n)))) return 'needsEnv lists environment variable names';
  if (![t.missingEnv, t.readOnlyError, t.capMissing].every(out)) return 'missingEnv, readOnlyError and capMissing are { output, exit 0..255 }';
  if (t.exitAfter !== undefined && (!(typeof t.exitAfter.seconds === 'number' && t.exitAfter.seconds >= 0 && t.exitAfter.seconds <= 86400) || (t.exitAfter.exit !== undefined && !whole(t.exitAfter.exit, 0, 255)) || (t.exitAfter.logs ?? []).some(s => !line(500)(seedText(s)))))
    return 'exitAfter is { seconds 0..86400, exit 0..255, one-line logs }';
  if (t.memory !== undefined && (!whole(t.memory.start, 0, 2 ** 40) || (t.memory.growth !== undefined && !(typeof t.memory.growth === 'number' && t.memory.growth >= 0 && t.memory.growth <= 2 ** 36)) || (t.memory.max !== undefined && !whole(t.memory.max, t.memory.start, 2 ** 40))))
    return 'memory is { start bytes, growth bytes per second, max ≥ start }';
  if ((t.cpu !== undefined && !(typeof t.cpu === 'number' && t.cpu >= 0 && t.cpu <= 6400)) || (t.pids !== undefined && !whole(t.pids, 1, 1000))) return 'cpu is 0..6400 (percent of one CPU) and pids 1..1000';
  if (t.signals !== undefined && (typeof t.signals !== 'object' || Object.entries(t.signals).some(([k, v]) => signalNumber(k) === undefined || signalNumber(k) === 9 || (v.seconds !== undefined && !(typeof v.seconds === 'number' && v.seconds >= 0 && v.seconds <= 3600)) || (v.exit !== undefined && !whole(v.exit, 0, 255)) || (v.logs ?? []).some(s => !line(500)(seedText(s))))))
    return 'signals maps a signal (not SIGKILL) to { seconds 0..3600, one-line logs, exit 0..255 }';
  if (t.writes !== undefined && (!Array.isArray(t.writes) || t.writes.length > 20 || t.writes.some(w => typeof w !== 'string' || !w || w.includes('..')))) return 'writes lists at most 20 paths';
  if (t.caps !== undefined && (!Array.isArray(t.caps) || t.caps.some(x => typeof x !== 'string' || !normalizeCap(x) || normalizeCap(x) === 'ALL'))) return 'caps lists capabilities (CHOWN, SETUID, NET_BIND_SERVICE…)';
  return null;
}
/** E20: the problems of a machine's Docker data. */
export function dockerProblems(m: TerminalMachine, lv: DockerLevels): string[] {
  const problems: string[] = [], fail = (what: string) => problems.push(what);
  if (m.docker === undefined) return problems;
  if (!lv.containers) return ['docker needs the containers profile (engine stage E20)'];
  const d = m.docker, now = parseTime(m.now ?? DEFAULT_NOW) ?? 0;
  if (typeof d !== 'object' || d === null) return ['docker must be { images?, containers? }'];
  const images = d.images ?? [], containers = d.containers ?? [];
  if (images.length > 12 || containers.length > 12) fail('at most 12 images and 12 containers');
  const refs = new Set<string>(), responders = new Set((m.responders ?? []).map(r => r.id));
  for (const i of images) {
    const ref = parseRef(i.name), at = `image ${i.name}`;
    if (!ref) { fail(`${at}: not an image reference (REPOSITORY[:TAG], lowercase)`); continue; }
    const key = `${ref.repo}:${ref.tag}`;
    if (refs.has(key)) fail(`${at}: listed twice`);
    refs.add(key);
    if (!whole(i.size, 0, 2 ** 40)) fail(`${at}: size must be 0..2^40 bytes`);
    const t = parseTime(i.created);
    if (t === undefined || t > now) fail(`${at}: created must be a time YYYY-MM-DD HH:MM:SS not after now`);
    const argv = [...i.entrypoint ?? [], ...i.cmd ?? []];
    // E23: an image without CMD and ENTRYPOINT (FROM scratch, distroless) is allowed on the compose profile.
    if (!Array.isArray(i.cmd) || (!argv.length && !lv.compose) || argv.length > 20 || argv.some(a => !line(200)(a))) fail(`${at}: cmd (with entrypoint) needs 1..20 one-line words`);
    if ((i.env ?? []).some(e => !ENV.test(e) || e.length > 300)) fail(`${at}: each env entry is NAME=value`);
    if (i.workdir !== undefined && !normalized(i.workdir)) fail(`${at}: workdir must be an absolute, normalized path`);
    if ((i.expose ?? []).some(p => !whole(p, 1, 65535))) fail(`${at}: exposed ports are 1..65535`);
    if (i.http !== undefined && (!whole(i.http.port, 1, 65535) || !responders.has(i.http.responder) || (i.http.accessLog !== undefined && i.http.accessLog !== 'nginx'))) fail(`${at}: http needs a port 1..65535, a responder of the machine and accessLog nginx or nothing`);
    if (i.service !== undefined && typeof i.service !== 'boolean') fail(`${at}: service is true or false`);
    if ((i.logs ?? []).length > 50 || (i.logs ?? []).some(s => !line(500)(seedText(s)))) fail(`${at}: at most 50 log lines of one line each`);
    if (i.output !== undefined && (typeof i.output !== 'string' || i.output.length > LIMITS.fileLength)) fail(`${at}: output at most ${LIMITS.fileLength} characters`);
    if (i.service && i.output !== undefined) fail(`${at}: a service keeps running; output is for an image that prints and exits`);
    if ((i.exit !== undefined && !whole(i.exit, 0, 255)) || (i.stopExit !== undefined && !whole(i.stopExit, 0, 255))) fail(`${at}: exit and stopExit are 0..255`);
    // E24: and the executables of the lesson's programs (node, python…), which run as PID 1.
    const allowed = lv.runtime ? [...composeCommands(m), ...(m.docker?.programs ?? []).map(p => (p.command?.[0] ?? '').slice((p.command?.[0] ?? '').lastIndexOf('/') + 1)).filter(Boolean)]
      : lv.compose ? composeCommands(m) : lv.storageNet ? E22_IMAGE_COMMANDS : IMAGE_COMMANDS;
    if (i.commands !== undefined && (!Array.isArray(i.commands) || i.commands.some(c => !allowed.includes(c)))) fail(`${at}: commands are among ${allowed.join(' ')}`);
    // E22: VOLUME paths.
    if (i.volumes !== undefined) {
      if (!lv.storageNet) fail(`${at}: volumes need the storage-net profile (engine stage E22)`);
      else if (!Array.isArray(i.volumes) || i.volumes.length > 8 || i.volumes.some(v => !normalized(v) || v === '/')) fail(`${at}: volumes are at most 8 absolute paths`);
    }
    if ((i.files ?? []).length > 40 || (i.files ?? []).some(f => !normalized(f.path) || f.path === '/' || typeof f.content !== 'string' || f.content.length > LIMITS.fileLength)) fail(`${at}: at most 40 files with absolute paths and contents of at most ${LIMITS.fileLength} characters`);
    if (i.osRelease !== undefined && (typeof i.osRelease !== 'string' || i.osRelease.length > 1000)) fail(`${at}: osRelease at most 1000 characters`);
    if (i.layers !== undefined && !whole(i.layers, 1, 20)) fail(`${at}: layers are 1..20`);
    if (i.registry === false && !i.pulled) fail(`${at}: an image Docker Hub does not have must be pulled (local)`);
    // E23: HEALTHCHECK, ready, and the other tags of a private registry's image.
    if (i.healthcheck !== undefined || i.ready !== undefined || i.tags !== undefined) {
      if (!lv.compose) fail(`${at}: healthcheck, ready and tags need the compose profile (engine stage E23)`);
      else {
        if (i.healthcheck !== undefined) { const p = healthProblem(i.healthcheck); if (p) fail(`${at}: ${p}`); }
        if (i.ready !== undefined && !whole(i.ready, 0, 3600)) fail(`${at}: ready is 0..3600 seconds`);
        const host = ref ? hostOf(ref.repo) : undefined;
        if (i.tags !== undefined && (!host || !(d.registries ?? []).some(r => r.host === host) || !Array.isArray(i.tags) || i.tags.some(t => !/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(t) || t === ref!.tag))) fail(`${at}: tags are other tags of an image of a registry the lesson declares`);
      }
    }
    // E24: STOPSIGNAL and the runtime declaration.
    if (i.stopSignal !== undefined || RUNTIME_KEYS.some(k => i[k] !== undefined)) {
      if (!lv.runtime) fail(`${at}: stopSignal and the runtime fields (${RUNTIME_KEYS.join(', ')}) need the runtime profile (engine stage E24)`);
      else {
        if (i.stopSignal !== undefined && (typeof i.stopSignal !== 'string' || signalNumber(i.stopSignal) === undefined)) fail(`${at}: stopSignal is a signal (SIGTERM, SIGQUIT…)`);
        const p = runtimeProblem(i);
        if (p) fail(`${at}: ${p}`);
      }
    }
    // E21: the config's USER and labels, package tables and history.
    if (i.user !== undefined || i.labels !== undefined || i.packages !== undefined || i.history !== undefined) {
      if (!lv.images) { fail(`${at}: user, labels, packages and history need the images profile (engine stage E21)`); continue; }
      if (i.user !== undefined && !/^[a-z_][a-z0-9_-]{0,31}(?::[a-z_][a-z0-9_-]{0,31})?$|^\d+(?::\d+)?$/.test(i.user)) fail(`${at}: user is a user name or uid (optionally :group)`);
      if (i.labels !== undefined && (typeof i.labels !== 'object' || Object.entries(i.labels).some(([k, v]) => !/^[A-Za-z0-9._/-]{1,100}$/.test(k) || typeof v !== 'string' || v.length > 300 || v.includes('\n')))) fail(`${at}: labels are { key: one-line value }`);
      for (const [kind, list] of Object.entries(i.packages ?? {})) {
        if (kind === 'aptLists') { if (!whole(list, 0, 2 ** 32)) fail(`${at}: packages.aptLists is 0..2^32 bytes`); continue; }
        if (!['apt', 'pip', 'npm'].includes(kind) || !Array.isArray(list)) { fail(`${at}: packages has apt, pip, npm and aptLists`); continue; }
        const names = new Set((list as BuildPackage[]).map(p => p.name));
        for (const p of list as BuildPackage[]) {
          if (!/^[A-Za-z0-9@][A-Za-z0-9._/+-]{0,100}$/.test(p.name ?? '') || !/^[A-Za-z0-9][A-Za-z0-9.+~:-]{0,60}$/.test(p.version ?? '') || !whole(p.size, 0, 2 ** 32)) fail(`${at}: ${kind} package ${p.name}: a name, a version and a size 0..2^32`);
          if ((p.depends ?? []).some(dep => !names.has(dep.split(/[<>=~ ]/)[0]) && !(list as BuildPackage[]).some(q => q.name.toLowerCase() === dep.split(/[<>=~ ]/)[0].toLowerCase()))) fail(`${at}: ${kind} package ${p.name}: depends on a package of the same table`);
          if ((p.files ?? []).some(f => !normalized(f.path) || f.path === '/' || typeof f.content !== 'string' || f.content.length > LIMITS.fileLength)) fail(`${at}: ${kind} package ${p.name}: files have absolute paths`);
        }
      }
      if (i.history !== undefined) {
        if (!Array.isArray(i.history) || !i.history.length || i.history.length > 40 || i.history.some(h => !line(300)(h.createdBy) || (h.size !== undefined && !whole(h.size, 0, 2 ** 40)))) fail(`${at}: history has 1..40 rows with a one-line createdBy and a size 0..2^40`);
        else {
          const layers = i.history.filter(isLayer);
          if (i.layers !== undefined && i.layers !== layers.length) fail(`${at}: layers (${i.layers}) must be the number of layer rows of history (${layers.length})`);
          if (layers.reduce((n, h) => n + (h.size ?? 0), 0) !== i.size) fail(`${at}: the sizes of history's layer rows must add up to size`);
        }
      }
    }
  }
  if (d.programs !== undefined) {
    if (!lv.images) fail('docker.programs needs the images profile (engine stage E21)');
    else if (!Array.isArray(d.programs) || d.programs.length > 12) fail('at most 12 programs');
    else for (const p of d.programs) {
      const at = `program ${Array.isArray(p.command) ? p.command.join(' ') : '?'}`;
      if (!Array.isArray(p.command) || !p.command.length || p.command.length > 20 || p.command.some(a => !line(200)(a))) fail(`${at}: command needs 1..20 one-line words`);
      if ((p.needs ?? []).some(n => typeof n !== 'string' || !n || n.includes('..'))) fail(`${at}: needs are paths`);
      if (p.service && p.output !== undefined) fail(`${at}: a service keeps running; output is for a program that prints and exits`);
      if ((p.exit !== undefined && !whole(p.exit, 0, 255)) || (p.stopExit !== undefined && !whole(p.stopExit, 0, 255)) || (p.missing?.exit !== undefined && !whole(p.missing.exit, 0, 255))) fail(`${at}: exit codes are 0..255`);
      if ((p.logs ?? []).length > 50 || (p.logs ?? []).some(s => !line(500)(seedText(s)))) fail(`${at}: at most 50 log lines of one line each`);
      if (p.http !== undefined && (!whole(p.http.port, 1, 65535) || !responders.has(p.http.responder) || (p.http.accessLog !== undefined && p.http.accessLog !== 'nginx'))) fail(`${at}: http needs a port 1..65535, a responder of the machine and accessLog nginx or nothing`);
      // E24: the runtime declaration.
      if (RUNTIME_KEYS.some(k => p[k] !== undefined)) {
        if (!lv.runtime) fail(`${at}: the runtime fields (${RUNTIME_KEYS.join(', ')}) need the runtime profile (engine stage E24)`);
        else { const q = runtimeProblem(p); if (q) fail(`${at}: ${q}`); }
      }
    }
  }
  // E23: the private registries (fake lesson tokens only) and the build tools.
  if (d.registries !== undefined || d.tools !== undefined) {
    if (!lv.compose) fail('registries and tools need the compose profile (engine stage E23)');
    else {
      const hosts = new Set<string>();
      if (!Array.isArray(d.registries ?? []) || (d.registries ?? []).length > 4) fail('at most 4 registries');
      for (const r of d.registries ?? []) {
        const at = `registry ${r.host}`;
        if (typeof r.host !== 'string' || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*(?::\d{1,5})?$/.test(r.host) || !(r.host.includes('.') || r.host.includes(':') || r.host.startsWith('localhost')) || /^(docker\.io|index\.docker\.io|registry-1\.docker\.io)$/.test(r.host) || hosts.has(r.host)) fail(`${at}: a host name with a dot or a port (not Docker Hub), listed once`);
        hosts.add(r.host);
        const users = r.users ?? [];
        if (!Array.isArray(users) || users.length > 8) fail(`${at}: at most 8 users`);
        for (const u of users) {
          if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(u.name ?? '')) fail(`${at}: user ${u.name}: a name of [a-z0-9._-]`);
          if (!FAKE_TOKEN(u.token)) fail(`${at}: user ${u.name}: the token must be an obviously fake lesson token (8..80 of [A-Za-z0-9._-], containing lesson, fake, example or demo, and not shaped like a real provider's token)`);
          if ((u.repos ?? []).some(x => !/^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*(?:\/\*)?$/.test(x))) fail(`${at}: user ${u.name}: repos are repository paths (team/api) or namespaces (team/*)`);
        }
      }
      for (const t of d.tools ?? []) {
        const at = `tool ${(Array.isArray(t.command) && t.command.join(' ')) || '?'}`;
        if (!Array.isArray(t.command) || !t.command.length || t.command.length > 20 || t.command.some(a => !line(200)(a))) fail(`${at}: command needs 1..20 one-line words`);
        if (!Array.isArray(t.writes) || t.writes.length > 8 || t.writes.some(w => typeof w.path !== 'string' || !w.path || w.path.includes('..') || !whole(w.size, 0, 2 ** 40) || (w.mode !== undefined && !whole(w.mode, 0, 0o777)))) fail(`${at}: writes are at most 8 files (a path, a size 0..2^40, a mode)`);
        if ((t.needs ?? []).some(n => typeof n !== 'string' || !n || n.includes('..'))) fail(`${at}: needs are paths`);
        if ((t.exit !== undefined && !whole(t.exit, 0, 255)) || (t.missing?.exit !== undefined && !whole(t.missing.exit, 0, 255)) || (t.seconds !== undefined && !(typeof t.seconds === 'number' && t.seconds >= 0 && t.seconds <= 600))) fail(`${at}: exit codes are 0..255 and seconds 0..600`);
        if ((t.output !== undefined && typeof t.output !== 'string') || (t.output ?? '').length > LIMITS.fileLength) fail(`${at}: output at most ${LIMITS.fileLength} characters`);
      }
    }
  }
  if ((d.programs ?? []).some(p => p.ready !== undefined) && !lv.compose) fail('a program\'s ready needs the compose profile (engine stage E23)');
  else if ((d.programs ?? []).some(p => p.ready !== undefined && !whole(p.ready, 0, 3600))) fail('a program\'s ready is 0..3600 seconds');
  // E22: volumes and networks of the daemon, and each container's mounts, network and user.
  const e22 = [d.volumes, d.networks, ...containers.flatMap(c => [c.volumes, c.network, c.aliases, c.user])].some(x => x !== undefined);
  if (e22 && !lv.storageNet) fail('volumes, networks and the containers\' volumes, network, aliases and user need the storage-net profile (engine stage E22)');
  const networks = new Map<string, string | undefined>([['bridge', '172.17.0.0/16'], ['host', undefined], ['none', undefined]]);
  if (lv.storageNet) {
    const vols = new Set<string>();
    for (const v of d.volumes ?? []) {
      if (!isVolumeName(v.name ?? '') || vols.has(v.name)) fail(`volume ${v.name}: a name of [a-zA-Z0-9][a-zA-Z0-9_.-]+, listed once`);
      vols.add(v.name);
      if (v.created !== undefined && (parseTime(v.created) === undefined || parseTime(v.created)! > now)) fail(`volume ${v.name}: created must be a time YYYY-MM-DD HH:MM:SS not after now`);
      if ((v.files ?? []).length > 40 || (v.files ?? []).some(f => !normalized(f.path) || f.path === '/' || typeof f.content !== 'string' || f.content.length > LIMITS.fileLength || (f.owner !== undefined && !/^(?:[a-z_][a-z0-9_-]{0,31}|\d+)$/.test(f.owner)) || (f.mode !== undefined && !whole(f.mode, 0, 0o777))))
        fail(`volume ${v.name}: at most 40 files with paths from the volume's root (/…), an owner (a user or a number) and a mode 0..0777`);
    }
    for (const n of d.networks ?? []) {
      const c = n.subnet === undefined ? undefined : parseCidr(n.subnet);
      if (!NETWORK_NAME.test(n.name ?? '') || networks.has(n.name)) { fail(`network ${n.name}: a name of [a-zA-Z0-9][a-zA-Z0-9_.-], not bridge, host or none, listed once`); continue; }
      if (n.subnet !== undefined && (!c || c.prefix < 8 || c.prefix > 30)) fail(`network ${n.name}: subnet is an IPv4 CIDR (/8../30)`);
      if (c && [...networks.values()].some(x => { const t = x ? parseCidr(x) : undefined; return t && overlaps(c.address, c.prefix, t.address, t.prefix); })) fail(`network ${n.name}: its subnet overlaps another network's`);
      networks.set(n.name, c ? `${c.address}/${c.prefix}` : `172.${18 + networks.size - 3}.0.0/16`);
    }
  }
  const names = new Set<string>(), bound: { b: PortBinding; name: string }[] = [];
  for (const c of containers) {
    const at = `container ${c.name}`;
    // E24: the container's runtime fields.
    const e24 = [c.restart, c.memory, c.memorySwap, c.cpus, c.init, c.readOnly, c.tmpfs, c.capAdd, c.capDrop, c.securityOpt, c.privileged, c.stopSignal, c.stopTimeout, c.restartCount, c.oomKilled];
    if (e24.some(x => x !== undefined)) {
      if (!lv.runtime) fail(`${at}: restart, memory, memorySwap, cpus, init, readOnly, tmpfs, capAdd, capDrop, securityOpt, privileged, stopSignal, stopTimeout, restartCount and oomKilled need the runtime profile (engine stage E24)`);
      else {
        if (c.restart !== undefined && (typeof c.restart !== 'string' || restartProblem(c.restart))) fail(`${at}: restart is no, always, unless-stopped or on-failure[:N]`);
        const mem = c.memory === undefined ? undefined : parseBytes(String(c.memory));
        if (c.memory !== undefined && (mem === null || mem! < 6 * 1024 * 1024)) fail(`${at}: memory is a size of at least 6MB (256m, 1g)`);
        if (c.memorySwap !== undefined && (c.memory === undefined || (c.memorySwap !== '-1' && (parseBytes(String(c.memorySwap)) ?? 0) < (mem ?? 0)))) fail(`${at}: memorySwap needs memory and is at least as large (or -1)`);
        if (c.cpus !== undefined && !(typeof c.cpus === 'number' && c.cpus >= 0.01 && c.cpus <= 64)) fail(`${at}: cpus is 0.01..64`);
        if ([c.capAdd, c.capDrop].some(l => l !== undefined && (!Array.isArray(l) || l.some(x => typeof x !== 'string' || !normalizeCap(x))))) fail(`${at}: capAdd and capDrop are capabilities (NET_ADMIN, CHOWN, ALL…)`);
        if (c.securityOpt !== undefined && (!Array.isArray(c.securityOpt) || c.securityOpt.some(o => !/^(no-new-privileges(:(true|false))?|(seccomp|apparmor|label)[=:].+)$/.test(o)))) fail(`${at}: securityOpt is no-new-privileges[:true] or seccomp=, apparmor=, label=`);
        if (c.tmpfs !== undefined && (!Array.isArray(c.tmpfs) || c.tmpfs.some(x => !normalized(x)))) fail(`${at}: tmpfs paths are absolute`);
        if (c.stopSignal !== undefined && signalNumber(c.stopSignal) === undefined) fail(`${at}: stopSignal is a signal (SIGTERM, SIGQUIT…)`);
        if (c.stopTimeout !== undefined && !whole(c.stopTimeout, -1, 3600)) fail(`${at}: stopTimeout is -1..3600 seconds`);
        if (c.restartCount !== undefined && !whole(c.restartCount, 0, 10000)) fail(`${at}: restartCount is 0..10000`);
        if (c.oomKilled && (c.state !== 'exited' || c.exitCode !== 137)) fail(`${at}: an OOM-killed container is exited with exit code 137`);
        if (c.init !== undefined && typeof c.init !== 'boolean') fail(`${at}: init is true or false`);
      }
    }
    if (lv.storageNet) {
      for (const v of c.volumes ?? []) { const p = parseVolumeFlag(v, '/', 'x'); if ('error' in p) fail(`${at}: volume ${v}: ${p.error}`); }
      if (c.network !== undefined && !networks.has(c.network)) fail(`${at}: network ${c.network} is not bridge, host, none or a network of the lesson`);
      if (c.aliases !== undefined && (!c.aliases.length || c.aliases.some(a => !NETWORK_NAME.test(a)) || !c.network || ['bridge', 'host', 'none'].includes(c.network))) fail(`${at}: aliases need a user-defined network`);
      if (c.user !== undefined && !/^[a-z_][a-z0-9_-]{0,31}(?::[a-z_][a-z0-9_-]{0,31})?$|^\d+(?::\d+)?$/.test(c.user)) fail(`${at}: user is a user name or uid (optionally :group)`);
      if ((c.network === 'host' || c.network === 'none') && (c.ports ?? []).length) fail(`${at}: a container on the ${c.network} network publishes no ports`);
    }
    if (typeof c.name !== 'string' || !NAME.test(c.name)) fail(`${at}: a name of [a-zA-Z0-9][a-zA-Z0-9_.-]`);
    if (names.has(c.name)) fail(`${at}: listed twice`);
    names.add(c.name);
    const ref = parseRef(c.image ?? ''), img = ref ? images.find(i => { const r = parseRef(i.name); return r && r.repo === ref.repo && r.tag === ref.tag; }) : undefined;
    if (!img || !img.pulled) fail(`${at}: image ${c.image} is not a pulled image of the lesson`);
    if (!['created', 'running', 'exited'].includes(c.state)) { fail(`${at}: state is created, running or exited`); continue; }
    const created = parseTime(c.created), started = c.started === undefined ? undefined : parseTime(c.started), finished = c.finished === undefined ? undefined : parseTime(c.finished);
    if (created === undefined || created > now || (c.started !== undefined && (started === undefined || started < created || started > now)) || (c.finished !== undefined && (finished === undefined || started === undefined || finished < started || finished > now)))
      fail(`${at}: created ≤ started ≤ finished ≤ now (times YYYY-MM-DD HH:MM:SS)`);
    if (c.state === 'running' && (c.started === undefined || c.finished !== undefined)) fail(`${at}: a running container has started and no finished`);
    if (c.state === 'exited' && (c.started === undefined || c.finished === undefined)) fail(`${at}: an exited container has started and finished`);
    if (c.state === 'created' && (c.started !== undefined || c.finished !== undefined)) fail(`${at}: a created container has neither started nor finished`);
    if (c.exitCode !== undefined && !whole(c.exitCode, 0, 255)) fail(`${at}: exitCode is 0..255`);
    if (c.command !== undefined && (!Array.isArray(c.command) || !c.command.length || c.command.length > 20 || c.command.some(a => !line(200)(a)))) fail(`${at}: command needs 1..20 one-line words`);
    if ((c.env ?? []).some(e => !ENV.test(e))) fail(`${at}: each env entry is NAME=value`);
    if ((c.logs ?? []).length > 100 || (c.logs ?? []).some(s => !line(500)(seedText(s)))) fail(`${at}: at most 100 log lines of one line each`);
    if ((c.files ?? []).length > 20 || (c.files ?? []).some(f => !normalized(f.path) || f.path === '/' || typeof f.content !== 'string' || f.content.length > LIMITS.fileLength)) fail(`${at}: at most 20 files with absolute paths`);
    for (const p of c.ports ?? []) {
      const b = portOf(p);
      if (!b || !whole(b.host, 1, 65535) || !whole(b.container, 1, 65535)) { fail(`${at}: port ${p} is HOST:CONTAINER or IP:HOST:CONTAINER`); continue; }
      if (c.state !== 'running' || c.network === 'host' || c.network === 'none') continue;
      const clash = bound.find(x => x.b.host === b.host && x.b.proto === b.proto && (x.b.hostIp === b.hostIp || x.b.hostIp === '0.0.0.0' || b.hostIp === '0.0.0.0'));
      if (clash) fail(`${at}: port ${b.host} is already published by ${clash.name} (port is already allocated)`);
      bound.push({ b, name: c.name });
    }
  }
  return problems;
}

/** E20: the problems of a check. */
export function dockerCheckProblems(c: DockerCheck, lv: DockerLevels): string | null {
  if (!lv.containers) return `a ${c.kind} check needs a containers machine (engine stage E20)`;
  // E22: volume, network and reach from a container.
  if (c.kind === 'volume' || c.kind === 'network' || c.kind === 'reach') {
    if (!lv.storageNet) return `a ${c.kind === 'reach' ? 'reach check from a container' : `${c.kind} check`} needs a storage-net machine (engine stage E22)`;
    if (c.kind === 'volume') {
      if (!isVolumeName(c.name ?? '') || (c.file !== undefined && !normalized(c.file)) || (c.content !== undefined && (c.file === undefined || typeof c.content !== 'string')) || (c.absent && (c.file ?? c.content) !== undefined))
        return 'a volume check needs a volume name, a file path from the volume\'s root (/…), content only with a file, and nothing else with absent';
      return null;
    }
    if (c.kind === 'network') {
      if (!NETWORK_NAME.test(c.name ?? '') || (c.container !== undefined && !NAME.test(c.container)) || (c.driver !== undefined && c.driver !== 'bridge') || (c.subnet !== undefined && !parseCidr(c.subnet)) || (c.absent && (c.container ?? c.driver ?? c.subnet) !== undefined))
        return 'a network check needs a network name, a container name, the driver bridge, a subnet CIDR, and nothing else with absent';
      return null;
    }
    if (!NAME.test(c.container ?? '') || typeof c.to !== 'string' || !/^[A-Za-z0-9._-]{1,253}$/.test(c.to) || !whole(c.port, 1, 65535) || !['succeeded', 'refused', 'timeout', 'unresolved'].includes(c.result))
      return 'a reach check from a container needs a container name, a name or address, a port 1..65535 and a result succeeded, refused, timeout or unresolved';
    return null;
  }
  // E23: compose (a project's service) and registry (a tag of a registry's repository).
  if (c.kind === 'compose' || c.kind === 'registry') {
    if (!lv.compose) return `a ${c.kind} check needs a compose machine (engine stage E23)`;
    if (c.kind === 'compose') {
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(c.project ?? '') || !/^[a-zA-Z0-9._-]+$/.test(c.service ?? '') || (c.state !== undefined && !['created', 'running', 'exited'].includes(c.state))
        || (c.health !== undefined && !['starting', 'healthy', 'unhealthy'].includes(c.health)) || (c.image !== undefined && !parseRef(c.image)) || (c.absent && (c.state ?? c.health ?? c.image) !== undefined))
        return 'a compose check needs a project name, a service, a state among created running exited, a health among starting healthy unhealthy, an image reference, and nothing else with absent';
      return null;
    }
    if (typeof c.registry !== 'string' || !hostOf(`${c.registry}/x`) || !/^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*$/.test(c.repository ?? '') || !/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(c.tag ?? '')
      || (c.digest !== undefined && !/^sha256:[0-9a-f]{64}$/.test(c.digest)) || (c.image !== undefined && !parseRef(c.image)) || (c.absent && (c.digest ?? c.image) !== undefined))
      return 'a registry check needs a registry host, a repository path, a tag, a digest sha256:…, a local image reference, and nothing else with absent';
    return null;
  }
  if (c.kind === 'build') {
    if (!lv.images) return 'a build check needs an images machine (engine stage E21)';
    if (!normalized(c.context) || (c.file !== undefined && !normalized(c.file)) || typeof c.change !== 'string' || !c.change || c.change.startsWith('/') || c.change.includes('..')
      || ![...c.cached ?? [], ...c.rebuilt ?? []].length || [...c.cached ?? [], ...c.rebuilt ?? []].some(s => !line(200)(s)))
      return 'a build check needs an absolute context folder (and file), a file to change relative to it, and steps that stay cached or run again';
    return null;
  }
  if (c.kind === 'image') {
    if (!parseRef(c.name ?? '') && !(lv.compose && digestRefOf(c.name ?? ''))) return 'an image check needs an image reference (REPOSITORY[:TAG])';
    // DKR-6: a full image ID names the image tagged or not; only as absent, on a runtime machine.
    if (/^sha256:[0-9a-f]{64}$/.test(c.name ?? '') && (!c.absent || !lv.runtime)) return 'an image ID (sha256: and 64 hex digits) in an image check needs absent and a runtime machine';
    // E23: a repository digest and a size limit.
    if ((c.digest !== undefined || c.maxSize !== undefined || (c.name ?? '').includes('@')) && !lv.compose) return 'digest, maxSize and NAME@sha256:… of an image check need a compose machine (engine stage E23)';
    if ((c.digest !== undefined && !/^sha256:[0-9a-f]{64}$/.test(c.digest)) || (c.maxSize !== undefined && !whole(c.maxSize, 0, 2 ** 40)) || (c.absent && (c.digest ?? c.maxSize) !== undefined)) return 'an image check needs a digest sha256:…, a maxSize in bytes, and nothing else with absent';
    const more = [c.label, c.env, c.cmd, c.entrypoint, c.user, c.port, c.workdir, c.layers].some(x => x !== undefined);
    if (more && !lv.images) return 'label, env, cmd, entrypoint, user, port, workdir and layers of an image check need an images machine (engine stage E21)';
    if (more && (c.absent || (c.label !== undefined && !/^[^=\s]+=[^\n]*$/.test(c.label)) || (c.env !== undefined && !ENV.test(c.env)) || (c.cmd !== undefined && (!Array.isArray(c.cmd) || c.cmd.some(w => typeof w !== 'string')))
      || (c.entrypoint !== undefined && (!Array.isArray(c.entrypoint) || c.entrypoint.some(w => typeof w !== 'string'))) || (c.port !== undefined && !whole(c.port, 1, 65535))
      || (c.workdir !== undefined && !normalized(c.workdir)) || (c.layers !== undefined && !whole(c.layers, 0, 127))))
      return 'an image check needs a label K=V, an env NAME=value, cmd and entrypoint as lists of words, a port 1..65535, an absolute workdir, a layer count, and nothing else with absent';
    return null;
  }
  if (c.health !== undefined && !lv.compose) return 'health of a container check needs a compose machine (engine stage E23)';
  // E24: the runtime's fields of a container check.
  const e24 = [c.oomKilled, c.restartCount, c.restartPolicy, c.memory, c.cpus, c.readOnly, c.user, c.capDrop, c.privileged, c.dockerSocket].some(x => x !== undefined) || c.state === 'restarting';
  if (e24) {
    if (!lv.runtime) return 'state restarting, oomKilled, restartCount, restartPolicy, memory, cpus, readOnly, user, capDrop, privileged and dockerSocket of a container check need a runtime machine (engine stage E24)';
    if (c.absent || (c.oomKilled !== undefined && typeof c.oomKilled !== 'boolean') || (c.restartCount !== undefined && !whole(c.restartCount, 0, 10000)) || (c.restartPolicy !== undefined && (typeof c.restartPolicy !== 'string' || restartProblem(c.restartPolicy) !== null))
      || (c.memory !== undefined && !whole(c.memory, 0, 2 ** 40)) || (c.cpus !== undefined && !(typeof c.cpus === 'number' && c.cpus >= 0 && c.cpus <= 64)) || (c.readOnly !== undefined && typeof c.readOnly !== 'boolean')
      || (c.user !== undefined && typeof c.user !== 'string') || (c.capDrop !== undefined && (!Array.isArray(c.capDrop) || c.capDrop.some(x => typeof x !== 'string' || !normalizeCap(x))))
      || (c.privileged !== undefined && typeof c.privileged !== 'boolean') || (c.dockerSocket !== undefined && typeof c.dockerSocket !== 'boolean'))
      return 'a container check needs oomKilled true or false, a restartCount 0..10000, a restart policy (on-failure:3), a memory limit in bytes, cpus 0..64, readOnly true or false, a user, capabilities to drop, privileged and dockerSocket true or false, and nothing else with absent';
  }
  if (!NAME.test(c.name ?? '') || (c.state !== undefined && !['created', 'running', 'exited', 'restarting'].includes(c.state)) || (c.image !== undefined && !parseRef(c.image)) || (c.health !== undefined && !['starting', 'healthy', 'unhealthy'].includes(c.health))
    || (c.port !== undefined && !PORT.test(c.port)) || (c.exitCode !== undefined && !whole(c.exitCode, 0, 255)) || (c.env !== undefined && !ENV.test(c.env))
    || (c.absent && (c.state ?? c.image ?? c.port ?? c.exitCode ?? c.env ?? c.health) !== undefined))
    return 'a container check needs a container name, a state among created running exited, an image reference, a port HOST:CONTAINER, an exit code 0..255, an env NAME=value, and nothing else with absent';
  return null;
}
const HEALTH_WORDS = { starting: 'health: starting', healthy: 'healthy', unhealthy: 'unhealthy' } as const;
export function describeDockerCheck(c: DockerCheck): string {
  if (c.kind === 'compose') {
    if (c.absent) return `Compose 專案 ${c.project} 的服務 ${c.service} 應該沒有容器`;
    const parts = [c.state ? `狀態是 ${c.state}` : '', c.health ? `健康狀態是 ${HEALTH_WORDS[c.health]}` : '', c.image ? `由 ${c.image} 建立` : ''].filter(Boolean);
    return `Compose 專案 ${c.project} 的服務 ${c.service} 應該有容器${parts.length ? `（${parts.join('，')}）` : ''}`;
  }
  if (c.kind === 'registry') {
    const at = `${c.registry}/${c.repository}:${c.tag}`;
    if (c.absent) return `Registry 上應該沒有 ${at}`;
    const parts = [c.digest ? `digest 是 ${c.digest}` : '', c.image ? `內容和本機的 ${c.image} 相同` : ''].filter(Boolean);
    return `Registry 上應該有 ${at}${parts.length ? `（${parts.join('，')}）` : ''}`;
  }
  if (c.kind === 'volume') return c.absent ? `應該沒有名為 ${c.name} 的 Volume` : `應該有名為 ${c.name} 的 Volume${c.file ? `，裡面有 ${c.file}${c.content !== undefined ? `（內容包含「${c.content}」）` : ''}` : ''}`;
  if (c.kind === 'network') {
    if (c.absent) return `應該沒有名為 ${c.name} 的網路`;
    const parts = [c.container ? `容器 ${c.container} 連在上面` : '', c.driver ? `驅動程式是 ${c.driver}` : '', c.subnet ? `子網路是 ${c.subnet}` : ''].filter(Boolean);
    return `應該有名為 ${c.name} 的網路${parts.length ? `（${parts.join('，')}）` : ''}`;
  }
  if (c.kind === 'reach') return `從容器 ${c.container} 連到 ${c.to} 的 ${c.port} 埠應該${{ succeeded: '成功', refused: '被拒絕（Connection refused）', timeout: '逾時（不同的網路連不到）', unresolved: '查不到這個名稱' }[c.result]}`;
  if (c.kind === 'build') {
    const parts = [c.cached?.length ? `「${c.cached.join('」「')}」命中快取（CACHED）` : '', c.rebuilt?.length ? `「${c.rebuilt.join('」「')}」重新執行` : ''].filter(Boolean);
    return `建置 ${c.context}${c.file ? `（${c.file}）` : ''}，改了 ${c.change} 之後再建置一次時，${parts.join('，')}`;
  }
  if (c.kind === 'image') {
    if (c.absent) return /^sha256:[0-9a-f]{64}$/.test(c.name) ? `本機應該沒有 ID 為 ${c.name.slice(7, 19)} 的 Image（包括已經沒有標籤的）` : `本機應該沒有 Image ${c.name}`;
    const parts = [c.label ? `標籤 ${c.label}` : '', c.env ? `環境變數 ${c.env}` : '', c.cmd ? `CMD ${JSON.stringify(c.cmd)}` : '', c.entrypoint ? `ENTRYPOINT ${JSON.stringify(c.entrypoint)}` : '',
      c.user ? `USER ${c.user}` : '', c.port !== undefined ? `EXPOSE ${c.port}` : '', c.workdir ? `WORKDIR ${c.workdir}` : '', c.layers !== undefined ? `${c.layers} 層` : '',
      c.digest ? `repository digest 是 ${c.digest}` : '', c.maxSize !== undefined ? `不超過 ${c.maxSize} 位元組` : ''].filter(Boolean);
    return `本機應該有 Image ${c.name}${parts.length ? `（${parts.join('，')}）` : ''}`;
  }
  if (c.absent) return `應該沒有名為 ${c.name} 的容器`;
  const parts = [c.state ? `狀態是 ${c.state}` : '', c.image ? `由 ${c.image} 建立` : '', c.port ? `公開連接埠 ${c.port}` : '', c.exitCode !== undefined ? `結束碼是 ${c.exitCode}` : '', c.env ? `環境變數有 ${c.env}` : '', c.health ? `健康狀態是 ${HEALTH_WORDS[c.health]}` : '',
    // E24
    c.oomKilled !== undefined ? `OOMKilled 是 ${c.oomKilled}` : '', c.restartCount !== undefined ? `至少重新啟動了 ${c.restartCount} 次` : '', c.restartPolicy ? `重新啟動策略是 ${c.restartPolicy}` : '',
    c.memory !== undefined ? `記憶體上限是 ${c.memory} 位元組` : '', c.cpus !== undefined ? `CPU 上限是 ${c.cpus}` : '', c.readOnly !== undefined ? (c.readOnly ? '根檔案系統是唯讀的' : '根檔案系統可以寫入') : '',
    c.user !== undefined ? (c.user ? `以 ${c.user} 執行` : '沒有指定使用者（以 Image 的 USER 或 root 執行）') : '', c.capDrop?.length ? `拿掉了 ${c.capDrop.map(x => normalizeCap(x) ?? x).join('、')} 能力` : '',
    c.privileged !== undefined ? (c.privileged ? '以 --privileged 執行' : '沒有 --privileged') : '', c.dockerSocket !== undefined ? (c.dockerSocket ? '掛載了 Docker 的 socket' : '沒有掛載 Docker 的 socket') : ''].filter(Boolean);
  return `應該有名為 ${c.name} 的容器${parts.length ? `（${parts.join('，')}）` : ''}`;
}
/** E21: the build check: build the context, change the file, build again, and read which steps were CACHED. */
function buildFailure(c: Extract<DockerCheck, { kind: 'build' }>, end: FsState): string | null {
  const first = buildFor(end, { context: c.context, ...c.file ? { file: c.file } : {} });
  if (first.status !== 0) return `建置失敗：${first.error}`;
  const path = `${c.context === '/' ? '' : c.context}/${c.change}`, node = first.state.nodes.get(path);
  if (node?.kind !== 'file') return `建置內容裡沒有 ${c.change}`;
  const nodes = new Map(first.state.nodes);
  nodes.set(path, { ...node, content: `${node.content ?? ''}\n` });
  const second = buildFor({ ...first.state, nodes }, { context: c.context, ...c.file ? { file: c.file } : {} });
  if (second.status !== 0) return `改了 ${c.change} 之後建置失敗：${second.error}`;
  const find = (want: string) => second.steps.find(s => s.label.replace(/\s+/g, ' ').startsWith(want.replace(/\s+/g, ' ').trim()));
  for (const want of c.cached ?? []) {
    const s = find(want);
    if (!s) return `Dockerfile 沒有「${want}」這個步驟`;
    if (!s.cached) return `改了 ${c.change} 之後，「${s.label}」沒有命中快取，又執行了一次`;
  }
  for (const want of c.rebuilt ?? []) {
    const s = find(want);
    if (!s) return `Dockerfile 沒有「${want}」這個步驟`;
    if (s.cached) return `改了 ${c.change} 之後，「${s.label}」仍是 CACHED（它應該要重新執行）`;
  }
  return null;
}
/** E22: volume, network and reach from a container, on the daemon (and the host's files) after the commands. */
function storageNetFailure(c: Extract<DockerCheck, { kind: 'volume' | 'network' | 'reach' }>, end: FsState): string | null {
  const d = end.docker!;
  if (!d.storageNet) return '這台機器的 profile 沒有 Volume 與網路（引擎階段 E22）';
  if (c.kind === 'volume') {
    const v = (d.volumes ?? []).find(x => x.name === c.name);
    if (c.absent) return v ? `仍有 Volume ${c.name}` : null;
    if (!v) return `沒有名為 ${c.name} 的 Volume`;
    if (c.file === undefined) return null;
    const node = end.nodes.get(`${volumeDir(c.name)}${c.file}`);
    if (node?.kind !== 'file') return `Volume ${c.name} 裡沒有 ${c.file}`;
    if (c.content !== undefined && !(node.content ?? '').includes(c.content)) return `Volume ${c.name} 的 ${c.file} 不包含題目要的內容`;
    return null;
  }
  if (c.kind === 'network') {
    const n = (d.networks ?? []).find(x => x.name === c.name);
    if (c.absent) return n ? `仍有網路 ${c.name}` : null;
    if (!n) return `沒有名為 ${c.name} 的網路`;
    if (c.driver && n.driver !== c.driver) return `它的驅動程式是 ${n.driver}`;
    if (c.subnet) { const want = parseCidr(c.subnet)!; if (n.subnet !== `${networkOf(want.address, want.prefix)}/${want.prefix}`) return `它的子網路是 ${n.subnet ?? '（沒有）'}`; }
    if (c.container) {
      const x = d.containers.find(k => k.name === c.container);
      if (!x) return `沒有名為 ${c.container} 的容器`;
      if (x.networks?.[n.name] === undefined) return `容器 ${c.container} 連在 ${Object.keys(x.networks ?? {}).join('、') || '（沒有網路）'}`;
    }
    return null;
  }
  const x = d.containers.find(k => k.name === c.container);
  if (!x) return `沒有名為 ${c.container} 的容器`;
  if (x.status !== 'running') return `容器 ${c.container} 沒有在執行`;
  const view: FsState = { ...end, nodes: mountedNodes(end, x), host: x.hostname ?? x.id.slice(0, 12), ...networkView(end, d, x) };
  const r0 = basicResolver(view, c.to, 4);
  const got = 'error' in r0 ? 'unresolved' : (() => { const r = reach(view, r0.found.address, c.port); return r.result === 'ok' ? 'succeeded' : r.result; })();
  const word = { succeeded: '成功', refused: '被拒絕', timeout: '逾時', unresolved: `查不到 ${c.to}` } as const;
  return got === c.result ? null : `結果是${word[got]}`;
}

/** E20: the check on the state after the commands (the daemon as it is now: containers whose sleep ended have exited). */
const IMAGE_ID = /^sha256:[0-9a-f]{64}$/;
export function dockerFailure(c: DockerCheck, end0: FsState): string | null {
  const end = settleDocker(end0), d = end.docker;
  if (!d) return '這台機器沒有安裝 Docker';
  const problem = dockerCheckProblems(c, { containers: true, images: true, storageNet: true, compose: true, runtime: true });
  if (problem) return problem;
  if (c.kind === 'build') return buildFailure(c, end);
  if (c.kind === 'volume' || c.kind === 'network' || c.kind === 'reach') return storageNetFailure(c, end);
  if (c.kind === 'compose' || c.kind === 'registry') return composeFailure(c, d);
  if (c.kind === 'image') {
    // DKR-6: a full image ID (sha256: and 64 hex digits) names the image itself, tagged or not (dangling), as docker image
    // inspect resolves it: absent then means its layers are really gone, not only its tag.
    const byId = IMAGE_ID.test(c.name) ? d.images.find(i => i.local && `sha256:${i.id}` === c.name) : undefined;
    const ref = byId ? undefined : parseRef(c.name), dr = byId || ref ? undefined : digestRefOf(c.name);
    const img = byId ?? (dr ? byDigest(d, dr) : d.images.find(i => i.local && !i.dangling && i.repo === ref!.repo && i.tag === ref!.tag));
    if (c.absent) return img ? (byId ? `仍有這個 Image（${byId.dangling ? '已經沒有標籤，但它的層還在' : `${byId.repo}:${byId.tag}`}）` : `仍有 Image ${c.name}`) : null;
    if (!img) return `本機沒有 ${c.name}（先 docker pull 或 docker build -t ${c.name}）`;
    // E21: the config and the layers.
    if (c.label) {
      const [k, ...v] = c.label.split('='), got = img.labels?.[k];
      if (got !== v.join('=')) return got === undefined ? `它沒有標籤 ${k}` : `它的標籤 ${k} 是 ${got}`;
    }
    if (c.env && !img.env.includes(c.env)) { const k = c.env.split('=')[0], got = img.env.find(e => e.startsWith(`${k}=`)); return got ? `它的環境變數是 ${got}` : `它沒有環境變數 ${k}`; }
    if (c.cmd && JSON.stringify(img.cmd) !== JSON.stringify(c.cmd)) return `它的 CMD 是 ${JSON.stringify(img.cmd)}`;
    if (c.entrypoint && JSON.stringify(img.entrypoint) !== JSON.stringify(c.entrypoint)) return img.entrypoint.length ? `它的 ENTRYPOINT 是 ${JSON.stringify(img.entrypoint)}` : '它沒有 ENTRYPOINT';
    if (c.user !== undefined && (img.user ?? '') !== c.user) return img.user ? `它的 USER 是 ${img.user}` : '它沒有設定 USER（以 root 執行）';
    if (c.port !== undefined && !img.expose.includes(c.port)) return img.expose.length ? `它 EXPOSE 的連接埠是 ${img.expose.join('、')}` : '它沒有 EXPOSE 任何連接埠';
    if (c.workdir && img.workdir !== c.workdir) return `它的 WORKDIR 是 ${img.workdir}`;
    if (c.layers !== undefined && rootfsOf(img).length !== c.layers) return `它有 ${rootfsOf(img).length} 層`;
    // E23: its repository digests (Docker Hub's and the registries') and its size.
    if (c.digest) {
      const all = [...img.pullable && !img.built ? [`${img.repo}@sha256:${img.digest}`] : [], ...d.repoDigests?.[img.id] ?? []];
      if (!all.some(x => x.endsWith(`@${c.digest}`))) return all.length ? `它的 repository digest 是 ${all.map(x => x.slice(x.indexOf('@') + 1)).join('、')}` : '它沒有 repository digest（沒有從 Registry 拉取或推送過）';
    }
    if (c.maxSize !== undefined && img.size > c.maxSize) return `它有 ${img.size} 位元組`;
    return null;
  }
  const x = d.containers.find(k => k.name === c.name) ?? findContainer(d, c.name);
  if (c.absent) return x ? `仍有容器 ${c.name}（${statusText(x, end.clock?.now ?? 0)}）` : null;
  if (!x) return `沒有名為 ${c.name} 的容器`;
  if (c.state && (d.runtime ? stateOf(x) : x.status) !== c.state) return `它的狀態是 ${d.runtime ? stateOf(x) : x.status}`;
  if (c.image) {
    const want = parseRef(c.image)!, img = d.images.find(i => i.id === x.image);
    if (!img || img.repo !== want.repo || img.tag !== want.tag) return `它是由 ${x.ref} 建立的`;
  }
  if (c.port) {
    const want = portOf(c.port)!, anyIp = !PORT.exec(c.port)?.[1];
    if (!x.ports.some(b => b.host === want.host && b.container === want.container && b.proto === want.proto && (anyIp || b.hostIp === want.hostIp))) return x.ports.length ? `它公開的連接埠是 ${x.ports.map(b => `${b.hostIp === '0.0.0.0' ? '' : `${b.hostIp}:`}${b.host}:${b.container}`).join('、')}` : '它沒有公開任何連接埠';
  }
  if (c.exitCode !== undefined && (x.status !== 'exited' || x.exitCode !== c.exitCode)) return x.status === 'exited' ? `它的結束碼是 ${x.exitCode}` : '它還沒有結束';
  if (c.env && !containerEnv(x, d.images.find(i => i.id === x.image)).includes(c.env)) return `它沒有環境變數 ${c.env}`;
  if (c.health) {
    if (!x.healthcheck) return '它沒有健康檢查';
    if (x.status !== 'running') return '它沒有在執行';
    if (x.health?.status !== c.health) return `它的健康狀態是 ${HEALTH_WORDS[x.health?.status ?? 'starting']}`;
  }
  // E24: the runtime's fields.
  if (c.oomKilled !== undefined && !!x.oomKilled !== c.oomKilled) return x.oomKilled ? '它是被 OOM killer 結束的（OOMKilled 是 true）' : '它不是被 OOM killer 結束的（OOMKilled 是 false）';
  if (c.restartCount !== undefined && (x.restartCount ?? 0) < c.restartCount) return `它只重新啟動了 ${x.restartCount ?? 0} 次`;
  if (c.restartPolicy !== undefined) {
    const want = policyOf(c.restartPolicy), got = policyOf(x.restart);
    if (want.name !== got.name || want.max !== got.max) return `它的重新啟動策略是 ${got.name}${got.max ? `:${got.max}` : ''}`;
  }
  if (c.memory !== undefined && (x.limits?.memory ?? 0) !== c.memory) return x.limits?.memory ? `它的記憶體上限是 ${x.limits.memory} 位元組` : '它沒有記憶體上限';
  if (c.cpus !== undefined && (x.limits?.nanoCpus ?? 0) !== Math.round(c.cpus * 1e9)) return x.limits?.nanoCpus ? `它的 CPU 上限是 ${x.limits.nanoCpus / 1e9}` : '它沒有 CPU 上限';
  if (c.readOnly !== undefined && !!x.readOnly !== c.readOnly) return x.readOnly ? '它的根檔案系統是唯讀的' : '它的根檔案系統可以寫入（沒有 --read-only）';
  if (c.user !== undefined && (x.user ?? '') !== c.user) return x.user ? `它以 ${x.user} 執行` : '它沒有指定使用者（以 root 執行）';
  for (const cap of c.capDrop ?? []) { const n = normalizeCap(cap)!; if (!(x.capDrop ?? []).includes(n) && !(x.capDrop ?? []).includes('ALL')) return x.capDrop?.length ? `它拿掉的能力是 ${x.capDrop.join('、')}` : '它沒有拿掉任何能力（沒有 --cap-drop）'; }
  // DKR-5: privileged mode and the Docker socket (whoever reaches the socket controls the daemon, so the host).
  if (c.privileged !== undefined && !!x.privileged !== c.privileged) return x.privileged ? '它以 --privileged 執行（擁有所有能力與主機的裝置）' : '它沒有以 --privileged 執行';
  if (c.dockerSocket !== undefined) {
    const sock = (x.mounts ?? []).some(m => m.type === 'bind' && /(^|\/)docker\.sock$/.test(m.source));
    if (sock !== c.dockerSocket) return sock ? '它掛載了 Docker 的 socket（可以控制 daemon，等於主機的 root）' : '它沒有掛載 Docker 的 socket';
  }
  return null;
}
/** E23: compose and registry, on the daemon after the commands. */
function composeFailure(c: Extract<DockerCheck, { kind: 'compose' | 'registry' }>, d: DockerState): string | null {
  if (!d.compose) return '這台機器的 profile 沒有 Compose 與 Registry（引擎階段 E23）';
  if (c.kind === 'compose') {
    const x = composeContainer(d, c.project, c.service);
    if (c.absent) return x ? `仍有容器 ${x.name}` : null;
    if (!x) return `專案 ${c.project} 沒有服務 ${c.service} 的容器`;
    if (c.state && x.status !== c.state) return `${x.name} 的狀態是 ${x.status}`;
    if (c.health) {
      if (!x.healthcheck) return `${x.name} 沒有健康檢查`;
      if (x.status !== 'running') return `${x.name} 沒有在執行`;
      if (x.health?.status !== c.health) return `${x.name} 的健康狀態是 ${HEALTH_WORDS[x.health?.status ?? 'starting']}`;
    }
    if (c.image) { const want = parseRef(c.image)!, img = d.images.find(i => i.local && !i.dangling && i.repo === want.repo && i.tag === want.tag); if (!img || img.id !== x.image) return `${x.name} 是由 ${x.ref} 建立的`; }
    return null;
  }
  const reg = (d.registries ?? []).find(r => r.host === c.registry);
  if (!reg) return `課程沒有 ${c.registry} 這個 Registry`;
  const digest = reg.tags[c.repository]?.[c.tag];
  if (c.absent) return digest ? `${c.registry}/${c.repository}:${c.tag} 仍在` : null;
  if (!digest) return `${c.registry}/${c.repository} 沒有標籤 ${c.tag}`;
  if (c.digest && `sha256:${digest}` !== c.digest) return `它指向 sha256:${digest}`;
  if (c.image) {
    const want = parseRef(c.image)!, img = d.images.find(i => i.local && !i.dangling && i.repo === want.repo && i.tag === want.tag);
    if (!img) return `本機沒有 ${c.image}`;
    if (manifestOf(img).digest !== digest) return `它指向 sha256:${digest}，不是本機 ${c.image} 的內容（sha256:${manifestOf(img).digest}）`;
  }
  return null;
}
