import { LIMITS, parentOf, resolvePath, type FsState } from './fs';
import { DEFAULT_NOW, parseTime } from './clock';
import { commOf, tableOf } from './processes';
import {
  buildFor, containerEnv, DEFAULT_OS_RELEASE, digestOf, findContainer, IMAGE_COMMANDS, imageIdOf, imageNodes, parseRef, settleDocker, statusText, syncDocker,
  type DockerContainer, type DockerImage, type DockerProgram, type DockerState, type HistoryRow, type LogSeed, type PortBinding,
} from './docker';
import { rootfsOf, type BuildPackage } from './build';
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
export interface TerminalImage {
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
}
/** E21: what a program does when a container runs it (matched by its exact words, after an entrypoint script hands over). */
export interface TerminalProgram {
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
}
export interface TerminalDocker { images?: TerminalImage[]; containers?: TerminalContainer[]; /** E21 */ programs?: TerminalProgram[] }

export type DockerCheck =
  /** E20: the container exists (absent: it does not) in this state, from this image, with this port published (HOST:CONTAINER), exit code and environment variable (K=V). */
  | { kind: 'container'; name: string; absent?: true; state?: 'created' | 'running' | 'exited'; image?: string; port?: string; exitCode?: number; env?: string }
  /**
   * E20: the image is local (absent: it is not). E21: its config has this label (K=V), environment variable (K=V), CMD,
   * ENTRYPOINT (exec form, exactly), USER, exposed TCP port and working directory, and this many layers (RootFS).
   */
  | { kind: 'image'; name: string; absent?: true; label?: string; env?: string; cmd?: string[]; entrypoint?: string[]; user?: string; port?: number; workdir?: string; layers?: number }
  /**
   * E21: building the context (with its Dockerfile, or `file`), then again after a change to the file `change` (a path in
   * the context), keeps the steps `cached` CACHED and runs the steps `rebuilt` again (each names a step by its beginning,
   * e.g. 'RUN pip install'). The builds run on a copy of the machine after the commands.
   */
  | { kind: 'build'; context: string; file?: string; change: string; cached?: string[]; rebuilt?: string[] };
export interface DockerLevels { containers: boolean; images?: boolean }

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

/** A lesson image as the daemon's image. */
function imageOf(i: TerminalImage, m: TerminalMachine): DockerImage | undefined {
  const ref = parseRef(i.name), created = parseTime(i.created);
  if (!ref || created === undefined) return undefined;
  const responder = i.http ? (m.responders ?? []).find(r => r.id === i.http!.responder) : undefined;
  return {
    repo: ref.repo, tag: ref.tag, id: imageIdOf(ref.repo, ref.tag, created), digest: digestOf(ref.repo, ref.tag), size: i.size, created,
    cmd: [...i.cmd], entrypoint: [...i.entrypoint ?? []], env: [...i.env ?? []], workdir: i.workdir ?? '/', expose: [...i.expose ?? []],
    ...i.http && responder ? { http: { port: i.http.port, responder: { ...responder, routes: responder.routes.map(r => ({ ...r })) }, ...i.http.accessLog ? { accessLog: i.http.accessLog } : {} } } : {},
    service: !!i.service, logs: [...i.logs ?? []], ...i.output !== undefined ? { output: i.output } : {}, exit: i.exit ?? 0, ...i.stopExit !== undefined ? { stopExit: i.stopExit } : {},
    commands: [...i.commands ?? IMAGE_COMMANDS], files: (i.files ?? []).map(f => ({ ...f })), osRelease: i.osRelease ?? DEFAULT_OS_RELEASE,
    layers: i.layers ?? (i.history ? i.history.filter(isLayer).length : 3), local: !!i.pulled, pullable: i.registry !== false,
    // E21: the config's USER and labels, the package tables and the declared history.
    ...i.user ? { user: i.user } : {}, ...i.labels ? { labels: { ...i.labels } } : {}, ...i.packages ? { packages: { ...i.packages } } : {},
    ...i.history ? { history: i.history.map((h): HistoryRow => ({ created, createdBy: h.createdBy, size: h.size ?? 0, empty: !isLayer(h), comment: 'buildkit.dockerfile.v0' })) } : {},
  };
}
const isLayer = (h: { size?: number; layer?: boolean }) => h.layer ?? (h.size ?? 0) > 0;
/** E21: a lesson program as the daemon's. */
function programOf(p: TerminalProgram, m: TerminalMachine): DockerProgram {
  const responder = p.http ? (m.responders ?? []).find(r => r.id === p.http!.responder) : undefined;
  return {
    command: [...p.command], needs: [...p.needs ?? []], ...p.missing ? { missing: { output: p.missing.output, exit: p.missing.exit ?? 1 } } : {}, service: !!p.service, logs: [...p.logs ?? []],
    ...p.output !== undefined ? { output: p.output } : {}, exit: p.exit ?? 0, ...p.stopExit !== undefined ? { stopExit: p.stopExit } : {},
    ...p.http && responder ? { http: { port: p.http.port, responder: { ...responder, routes: responder.routes.map(r => ({ ...r })) }, ...p.http.accessLog ? { accessLog: p.http.accessLog } : {} } } : {},
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
  const images = (m.docker.images ?? []).map(i => imageOf(i, m)).filter((i): i is DockerImage => !!i);
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
  const programs = lv.images ? (m.docker.programs ?? []).map(p => programOf(p, m)) : [];
  const docker: DockerState = { images, containers, seq: containers.length, ...daemonPid !== undefined ? { daemonPid } : {}, ...programs.length ? { programs } : {}, ...lv.images ? { hostProcesses: true as const } : {} };
  return syncDocker({ ...state, docker });
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
    if (!Array.isArray(i.cmd) || !argv.length || argv.length > 20 || argv.some(a => !line(200)(a))) fail(`${at}: cmd (with entrypoint) needs 1..20 one-line words`);
    if ((i.env ?? []).some(e => !ENV.test(e) || e.length > 300)) fail(`${at}: each env entry is NAME=value`);
    if (i.workdir !== undefined && !normalized(i.workdir)) fail(`${at}: workdir must be an absolute, normalized path`);
    if ((i.expose ?? []).some(p => !whole(p, 1, 65535))) fail(`${at}: exposed ports are 1..65535`);
    if (i.http !== undefined && (!whole(i.http.port, 1, 65535) || !responders.has(i.http.responder) || (i.http.accessLog !== undefined && i.http.accessLog !== 'nginx'))) fail(`${at}: http needs a port 1..65535, a responder of the machine and accessLog nginx or nothing`);
    if (i.service !== undefined && typeof i.service !== 'boolean') fail(`${at}: service is true or false`);
    if ((i.logs ?? []).length > 50 || (i.logs ?? []).some(s => !line(500)(seedText(s)))) fail(`${at}: at most 50 log lines of one line each`);
    if (i.output !== undefined && (typeof i.output !== 'string' || i.output.length > LIMITS.fileLength)) fail(`${at}: output at most ${LIMITS.fileLength} characters`);
    if (i.service && i.output !== undefined) fail(`${at}: a service keeps running; output is for an image that prints and exits`);
    if ((i.exit !== undefined && !whole(i.exit, 0, 255)) || (i.stopExit !== undefined && !whole(i.stopExit, 0, 255))) fail(`${at}: exit and stopExit are 0..255`);
    if (i.commands !== undefined && (!Array.isArray(i.commands) || i.commands.some(c => !IMAGE_COMMANDS.includes(c)))) fail(`${at}: commands are among ${IMAGE_COMMANDS.join(' ')}`);
    if ((i.files ?? []).length > 40 || (i.files ?? []).some(f => !normalized(f.path) || f.path === '/' || typeof f.content !== 'string' || f.content.length > LIMITS.fileLength)) fail(`${at}: at most 40 files with absolute paths and contents of at most ${LIMITS.fileLength} characters`);
    if (i.osRelease !== undefined && (typeof i.osRelease !== 'string' || i.osRelease.length > 1000)) fail(`${at}: osRelease at most 1000 characters`);
    if (i.layers !== undefined && !whole(i.layers, 1, 20)) fail(`${at}: layers are 1..20`);
    if (i.registry === false && !i.pulled) fail(`${at}: an image Docker Hub does not have must be pulled (local)`);
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
    }
  }
  const names = new Set<string>(), bound: { b: PortBinding; name: string }[] = [];
  for (const c of containers) {
    const at = `container ${c.name}`;
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
      if (c.state !== 'running') continue;
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
  if (c.kind === 'build') {
    if (!lv.images) return 'a build check needs an images machine (engine stage E21)';
    if (!normalized(c.context) || (c.file !== undefined && !normalized(c.file)) || typeof c.change !== 'string' || !c.change || c.change.startsWith('/') || c.change.includes('..')
      || ![...c.cached ?? [], ...c.rebuilt ?? []].length || [...c.cached ?? [], ...c.rebuilt ?? []].some(s => !line(200)(s)))
      return 'a build check needs an absolute context folder (and file), a file to change relative to it, and steps that stay cached or run again';
    return null;
  }
  if (c.kind === 'image') {
    if (!parseRef(c.name ?? '')) return 'an image check needs an image reference (REPOSITORY[:TAG])';
    const more = [c.label, c.env, c.cmd, c.entrypoint, c.user, c.port, c.workdir, c.layers].some(x => x !== undefined);
    if (more && !lv.images) return 'label, env, cmd, entrypoint, user, port, workdir and layers of an image check need an images machine (engine stage E21)';
    if (more && (c.absent || (c.label !== undefined && !/^[^=\s]+=[^\n]*$/.test(c.label)) || (c.env !== undefined && !ENV.test(c.env)) || (c.cmd !== undefined && (!Array.isArray(c.cmd) || c.cmd.some(w => typeof w !== 'string')))
      || (c.entrypoint !== undefined && (!Array.isArray(c.entrypoint) || c.entrypoint.some(w => typeof w !== 'string'))) || (c.port !== undefined && !whole(c.port, 1, 65535))
      || (c.workdir !== undefined && !normalized(c.workdir)) || (c.layers !== undefined && !whole(c.layers, 0, 127))))
      return 'an image check needs a label K=V, an env NAME=value, cmd and entrypoint as lists of words, a port 1..65535, an absolute workdir, a layer count, and nothing else with absent';
    return null;
  }
  if (!NAME.test(c.name ?? '') || (c.state !== undefined && !['created', 'running', 'exited'].includes(c.state)) || (c.image !== undefined && !parseRef(c.image))
    || (c.port !== undefined && !PORT.test(c.port)) || (c.exitCode !== undefined && !whole(c.exitCode, 0, 255)) || (c.env !== undefined && !ENV.test(c.env))
    || (c.absent && (c.state ?? c.image ?? c.port ?? c.exitCode ?? c.env) !== undefined))
    return 'a container check needs a container name, a state among created running exited, an image reference, a port HOST:CONTAINER, an exit code 0..255, an env NAME=value, and nothing else with absent';
  return null;
}
export function describeDockerCheck(c: DockerCheck): string {
  if (c.kind === 'build') {
    const parts = [c.cached?.length ? `「${c.cached.join('」「')}」命中快取（CACHED）` : '', c.rebuilt?.length ? `「${c.rebuilt.join('」「')}」重新執行` : ''].filter(Boolean);
    return `建置 ${c.context}${c.file ? `（${c.file}）` : ''}，改了 ${c.change} 之後再建置一次時，${parts.join('，')}`;
  }
  if (c.kind === 'image') {
    if (c.absent) return `本機應該沒有 Image ${c.name}`;
    const parts = [c.label ? `標籤 ${c.label}` : '', c.env ? `環境變數 ${c.env}` : '', c.cmd ? `CMD ${JSON.stringify(c.cmd)}` : '', c.entrypoint ? `ENTRYPOINT ${JSON.stringify(c.entrypoint)}` : '',
      c.user ? `USER ${c.user}` : '', c.port !== undefined ? `EXPOSE ${c.port}` : '', c.workdir ? `WORKDIR ${c.workdir}` : '', c.layers !== undefined ? `${c.layers} 層` : ''].filter(Boolean);
    return `本機應該有 Image ${c.name}${parts.length ? `（${parts.join('，')}）` : ''}`;
  }
  if (c.absent) return `應該沒有名為 ${c.name} 的容器`;
  const parts = [c.state ? `狀態是 ${c.state}` : '', c.image ? `由 ${c.image} 建立` : '', c.port ? `公開連接埠 ${c.port}` : '', c.exitCode !== undefined ? `結束碼是 ${c.exitCode}` : '', c.env ? `環境變數有 ${c.env}` : ''].filter(Boolean);
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
/** E20: the check on the state after the commands (the daemon as it is now: containers whose sleep ended have exited). */
export function dockerFailure(c: DockerCheck, end0: FsState): string | null {
  const end = settleDocker(end0), d = end.docker;
  if (!d) return '這台機器沒有安裝 Docker';
  const problem = dockerCheckProblems(c, { containers: true, images: true });
  if (problem) return problem;
  if (c.kind === 'build') return buildFailure(c, end);
  if (c.kind === 'image') {
    const ref = parseRef(c.name)!, img = d.images.find(i => i.local && !i.dangling && i.repo === ref.repo && i.tag === ref.tag);
    if (c.absent) return img ? `仍有 Image ${c.name}` : null;
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
    return null;
  }
  const x = d.containers.find(k => k.name === c.name) ?? findContainer(d, c.name);
  if (c.absent) return x ? `仍有容器 ${c.name}（${statusText(x, end.clock?.now ?? 0)}）` : null;
  if (!x) return `沒有名為 ${c.name} 的容器`;
  if (c.state && x.status !== c.state) return `它的狀態是 ${x.status}`;
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
  return null;
}
