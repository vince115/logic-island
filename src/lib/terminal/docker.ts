import { can, DEFAULT_SYSTEM, groupsOf, parentOf, type FsNode, type FsState, type SystemInfo } from './fs';
import { fields, isoText, MONTHS, type Seconds } from './clock';
import { clockOf, nextPid, tableOf, type Proc } from './processes';
import { sha256 } from './ssh';
import { listenersOf } from './sockets';
import type { Request, Responder, Response } from './http';
import { commandNames, runInput, tokenize, type CommandName, type ShellProfile } from './shell';
import { scriptCommandNames } from './script';
import { accountsOf as imageAccounts, build, chainOf, historyOf, imageFs, layerSizesOf, rootfsOf, userOf, type BuildHooks, type BuildResult, type CacheEntry, type ImagePackages, type Weight } from './build';
import type { PackageDb } from './packages';
import {
  assignAddresses, attachments, findNetwork, hostServed, hostsText, imageVolumes, modeOf, mountedNodes, mountsJson, networkJson, networksJson, networkView, parseMountFlag, parseVolumeFlag, peerLogs,
  prepareMounts, primaryIp, readOnlyError, releaseAddresses, removeVolumeDir, resolvText, serviceListeners, unmount, volumeJson, type DockerMount, type DockerNetwork, type DockerVolume, type NetAttach,
} from './storage-net';
import { goTemplate, networkCli, POINTERS, STRUCTS, volumeCli, type E22Cli } from './storage-net-cli';

/*
 * Engine stage E20 (docs/curriculum/DKR0_CONTAINER_CAPABILITY.md §5): containers. A machine of the containers profile may
 * have a Docker Engine (Docker CE 27.5.1 on Ubuntu 24.04): a daemon state with local images, containers and a simulated
 * Docker Hub — the images the lesson makes pullable. Nothing runs: an image is a row of data (repository, tag, ID, size,
 * created, its default command, what its main process prints, whether it keeps running, the HTTP responder its service
 * answers with), and a container is the state machine created → running → exited → removed with its own small file
 * system (the image's files plus its writable layer, lost on docker rm), its logs (kept by docker stop, lost by rm) and
 * its port bindings. A running container's published port is a docker-proxy process of the host listening on the host
 * port (ss -tlnp shows it); its listener names a responder made for that container, so curl localhost:8080 reaches the
 * image's service, the request is written to the container's log (nginx's access log format), and a stopped container
 * stops answering. Times come from the machine's clock: "Up 3 minutes" after sleep 180 (the edge profile moves it).
 *
 * Docker's own texts follow the 27.5.1 CLI and daemon (docker/cli and moby at v27.5.1): the "docker: …." prefix and
 * "See 'docker run --help'." of docker run's create errors, tabwriter columns (min width 10, padding 3), Go's units for
 * sizes and durations, the Ellipsis and quoting of COMMAND, DisplayablePorts. What is not modelled is said, never faked.
 */

export const DOCKER_VERSION = '27.5.1';
export const DOCKER_API = '1.47';
const DOCKER_BUILD = '9f9e405';
const GO_VERSION = 'go1.22.11';
const SOCKET = '/run/docker.sock';
const BRIDGE_GATEWAY = '172.17.0.1';

/** A line a container's processes printed (1 standard output, 2 standard error) and when. */
export interface LogLine { t: Seconds; stream: 1 | 2; text: string }
/** What an image's main process prints when it starts: a line (standard output) or { text, stream: 2 }. */
export type LogSeed = string | { text: string; stream?: 1 | 2 };

/** An image the daemon has (local) or Docker Hub serves (pullable). */
export interface DockerImage {
  repo: string;
  tag: string;
  /** 64 hex digits (the image ID); docker images shows the first 12. */
  id: string;
  /** The manifest digest Docker Hub reports (64 hex digits). */
  digest: string;
  /** Bytes (docker images prints them as Go's units with 3 significant digits: 192MB). */
  size: number;
  created: Seconds;
  /** The image's CMD and ENTRYPOINT (exec form) and its environment, working directory and exposed TCP ports. */
  cmd: string[];
  entrypoint: string[];
  env: string[];
  workdir: string;
  expose: number[];
  /** The service in the image answers HTTP on this container port with this responder (accessLog: nginx's combined format). */
  http?: { port: number; responder: Responder; accessLog?: 'nginx' };
  /** The main process keeps running (a server); otherwise it prints `output` and exits with `exit`. */
  service: boolean;
  logs: LogSeed[];
  output?: string;
  exit: number;
  /** The exit status after docker stop (default: 0 for a server that handles SIGTERM, 137 otherwise). */
  stopExit?: number;
  /** The executables of the image (docker exec and a command after the image must be one of them). */
  commands: string[];
  /** Its files (on top of a small Linux base): path and content. */
  files: { path: string; content: string }[];
  osRelease: string;
  /** How many layers docker pull downloads. */
  layers: number;
  local: boolean;
  pullable: boolean;
  /** Fix (E20): a local image whose tag was removed (docker rmi -f while a container uses it): <none>:<none>, found only by its ID. */
  dangling?: boolean;
  /** E21: docker history's rows, oldest first (default: one per layer and the config, historyOf). */
  history?: HistoryRow[];
  /** E21: the layers' diff IDs (default: one per pulled layer, rootfsOf) and, for a built image, their chain IDs (chainOf). */
  rootfs?: string[];
  chain?: string[];
  /** E21: USER and LABEL of the image's config. */
  user?: string;
  labels?: Record<string, string>;
  /** E21: a built image: its whole file system (with what a package weighs), its package tables and apt database. */
  built?: true;
  nodes?: ReadonlyMap<string, FsNode>;
  weights?: ReadonlyMap<string, Weight>;
  packages?: ImagePackages;
  apt?: PackageDb;
  /** E21: the main process is the image's command (run by the simulation or a program the lesson declares), not the base image's behaviour. */
  ownMain?: true;
  /** E21: FROM scratch (an empty file system). */
  scratch?: true;
  /** E22: the image's VOLUME paths (each container gets an anonymous volume there unless something else is mounted). */
  volumes?: string[];
}
/** E21: a row of docker history (CREATED BY as BuildKit records it; empty: a config change, no layer). */
export interface HistoryRow { created: Seconds; createdBy: string; size: number; empty: boolean; comment: string }
/** E21: what a program does when a container runs it (the lesson declares it: the simulation runs no real program). */
export interface DockerProgram {
  command: string[];
  /** Files it needs (relative to the working directory); the first missing one makes it print `missing` and exit. */
  needs: string[];
  missing?: { output: string; exit: number };
  service: boolean;
  logs: LogSeed[];
  output?: string;
  exit: number;
  /** Its exit status after docker stop (default 137: as PID 1 it has no SIGTERM handler, so it is killed after 10 s). */
  stopExit?: number;
  http?: { port: number; responder: Responder; accessLog?: 'nginx' };
}
export interface PortBinding { hostIp: string; host: number; container: number; proto: 'tcp' | 'udp' }
export type ContainerStatus = 'created' | 'running' | 'exited';
export interface DockerContainer {
  id: string;
  name: string;
  /** The image as it was named (docker ps shows it) and its ID. */
  ref: string;
  image: string;
  /** What the container runs: the image's entrypoint and the command (Path and Args of docker inspect). */
  path: string;
  args: string[];
  /** The command (CMD, or what followed the image in docker run) and whether it was given instead of the image's. */
  cmd: string[];
  custom: boolean;
  created: Seconds;
  started?: Seconds;
  finished?: Seconds;
  status: ContainerStatus;
  exitCode: number;
  ports: PortBinding[];
  env: string[];
  workdir: string;
  rm: boolean;
  tty: boolean;
  interactive: boolean;
  logs: LogLine[];
  /** The container's file system: the image's files and its writable layer. */
  nodes: ReadonlyMap<string, FsNode>;
  /** Its address on the default bridge while it runs. */
  ip?: string;
  /** A container running sleep N exits (0) at this time. */
  endsAt?: Seconds;
  /** How many commands docker exec ran in it (the pids it shows). */
  execs: number;
  /** E21: the image's USER (the container's processes run as this user). */
  user?: string;
  /** E21: the HTTP service of a declared program it runs (its published port reaches it), and its exit status after docker stop. */
  http?: { port: number; responder: Responder; accessLog?: 'nginx' };
  stopExit?: number;
  /** E22: its volumes, bind mounts and tmpfs mounts, what its tmpfs mounts hold (emptied when it stops), its networks (name → aliases and address), its host name (--network host: the host's). */
  mounts?: readonly DockerMount[];
  tmpfs?: Readonly<Record<string, ReadonlyMap<string, FsNode>>>;
  networks?: Readonly<Record<string, NetAttach>>;
  hostname?: string;
}
export interface DockerState {
  images: readonly DockerImage[];
  containers: readonly DockerContainer[];
  /** How many containers were created (seeds the IDs of new ones). */
  seq: number;
  /** The daemon's process (docker-proxy's parent). */
  daemonPid?: number;
  /** E21: the build cache (a step's cache key → the file system after it and its layer). */
  buildCache?: Readonly<Record<string, CacheEntry>>;
  /** E21: the programs the lesson declares (what node server.js does in a container). */
  programs?: readonly DockerProgram[];
  /** E21 (the images profile): a running container's shim and main process are in the host's process table (host PIDs). */
  hostProcesses?: true;
  /** E22 (the storage-net profile): volumes and networks (bridge, host and none, and the user-defined ones). */
  storageNet?: true;
  volumes?: readonly DockerVolume[];
  networks?: readonly DockerNetwork[];
}

/**
 * The commands a container's shell can run (the simulation's file commands; env, ps, sleep, sh and bash are handled here).
 * Fix (E20): uname too — it reports the host's kernel (a container has no kernel of its own) and the container's hostname.
 */
export const CONTAINER_COMMANDS = ['pwd', 'ls', 'cd', 'mkdir', 'touch', 'cat', 'cp', 'mv', 'rm', 'echo', 'head', 'tail', 'grep', 'wc', 'hostname', 'uname'] as const satisfies readonly CommandName[];
export const SPECIAL_COMMANDS = ['env', 'ps', 'sleep', 'sh', 'bash', 'true', 'false'] as const;
/** Every executable an image may list. */
export const IMAGE_COMMANDS: readonly string[] = [...CONTAINER_COMMANDS, ...SPECIAL_COMMANDS];
const CONTAINER_PROFILE: ShellProfile = { id: 'container', commands: CONTAINER_COMMANDS, features: ['glob', 'multi-source', 'ls-extra', 'pipes'] };
/** E22: what a container's shell can also run on the storage-net profile: ownership and permissions, tar, and the network commands. */
export const E22_CONTAINER_COMMANDS = ['chmod', 'chown', 'chgrp', 'id', 'whoami', 'tar', 'getent', 'ping', 'curl', 'nc'] as const satisfies readonly CommandName[];
/** E22: every executable an image may list on the storage-net profile (an image that lists none has them all). */
export const E22_IMAGE_COMMANDS: readonly string[] = [...IMAGE_COMMANDS, ...E22_CONTAINER_COMMANDS];
const CONTAINER_E22_PROFILE: ShellProfile = { id: 'container', commands: [...CONTAINER_COMMANDS, ...E22_CONTAINER_COMMANDS], features: ['glob', 'multi-source', 'ls-extra', 'pipes', 'accounts', 'processes', 'scripting'] };
/** Whether the image is Alpine (BusyBox's uname -o prints Linux, not GNU/Linux). */
const isAlpine = (img: DockerImage | undefined) => !!img && /^ID="?alpine"?$/m.test(img.osRelease);

const hex = (text: string) => [...sha256(new TextEncoder().encode(text))].map(b => b.toString(16).padStart(2, '0')).join('');
export const imageIdOf = (repo: string, tag: string, created: Seconds) => hex(`image/${repo}:${tag}/${created}`);
export const digestOf = (repo: string, tag: string) => hex(`digest/${repo}:${tag}`);
const short = (id: string) => id.slice(0, 12);

// ----------------------------------------------------------------------------------------------------- formatting

/** Go's units.HumanDuration (go-units 0.5), which docker ps and docker images use. */
export function humanDuration(seconds: number): string {
  const s = Math.floor(seconds);
  if (s < 1) return 'Less than a second';
  if (s === 1) return '1 second';
  if (s < 60) return `${s} seconds`;
  const minutes = Math.floor(seconds / 60);
  if (minutes === 1) return 'About a minute';
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(seconds / 3600 + 0.5);
  if (hours === 1) return 'About an hour';
  if (hours < 48) return `${hours} hours`;
  if (hours < 24 * 7 * 2) return `${Math.floor(hours / 24)} days`;
  if (hours < 24 * 30 * 2) return `${Math.floor(hours / 24 / 7)} weeks`;
  if (hours < 24 * 365 * 2) return `${Math.floor(hours / 24 / 30)} months`;
  return `${Math.floor(seconds / 3600 / 24 / 365)} years`;
}
/** Go's %.Ng: N significant digits, trailing zeros removed. */
function goG(x: number, precision: number): string {
  if (x === 0) return '0';
  const t = x.toPrecision(precision);
  if (!t.includes('e')) return t.includes('.') ? t.replace(/0+$/, '').replace(/\.$/, '') : t;
  const [m, e] = t.split('e'), mant = m.includes('.') ? m.replace(/0+$/, '').replace(/\.$/, '') : m, exp = Number(e);
  return `${mant}e${exp < 0 ? '-' : '+'}${String(Math.abs(exp)).padStart(2, '0')}`;
}
/** Go's units.HumanSizeWithPrecision (decimal units: 192MB, 13.3kB, 0B). */
export function humanSize(bytes: number, precision = 4): string {
  const units = ['B', 'kB', 'MB', 'GB', 'TB', 'PB'];
  let size = bytes, i = 0;
  while (size >= 1000 && i < units.length - 1) { size /= 1000; i++; }
  return `${goG(size, precision)}${units[i]}`;
}
/** Go's units.BytesSize (binary units: 1.9GiB). */
function bytesSize(bytes: number): string {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let size = bytes, i = 0;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${goG(size, 4)}${units[i]}`;
}
/** text/tabwriter with docker's settings (min width 10, padding 3); the last column is not padded. */
function tabwrite(rows: readonly (readonly string[])[]): string[] {
  const width = (s: string) => [...s].length;
  const cols = Math.max(0, ...rows.map(r => r.length));
  const widths = Array.from({ length: cols - 1 }, (_, i) => Math.max(10, ...rows.map(r => width(r[i] ?? '') + 3)));
  return rows.map(r => r.map((cell, i) => i < r.length - 1 ? cell + ' '.repeat(widths[i] - width(cell)) : cell).join(''));
}
/** docker/cli's Ellipsis: at most `max` characters, the last one … when cut. */
const ellipsis = (s: string, max: number) => [...s].length <= max ? s : `${[...s].slice(0, max - 1).join('')}…`;
/** Go's strconv.Quote for the commands docker ps shows. */
const goQuote = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t')}"`;
/** RFC 3339 with Go's trimmed nanoseconds (whole seconds: 2026-11-22T10:00:00Z). */
const rfc3339 = (t: Seconds | undefined) => t === undefined ? '0001-01-01T00:00:00Z' : `${isoText(t).replace(' ', 'T')}Z`;

/** docker/cli's DisplayablePorts: published ports grouped by address (ranges merged), mappings to another port after them. */
export function displayPorts(c: DockerContainer, img: DockerImage | undefined): string {
  // E22: a container on the host's network (or none) has no ports of its own.
  if (c.status !== 'running' || (c.networks && modeOf(c) !== 'bridge')) return '';
  type P = { ip: string; pub: number; priv: number; type: string };
  const list: P[] = [];
  for (const b of c.ports) {
    list.push({ ip: b.hostIp, pub: b.host, priv: b.container, type: b.proto });
    if (b.hostIp === '0.0.0.0') list.push({ ip: '::', pub: b.host, priv: b.container, type: b.proto });
  }
  for (const p of img?.expose ?? []) if (!c.ports.some(b => b.container === p && b.proto === 'tcp')) list.push({ ip: '', pub: 0, priv: p, type: 'tcp' });
  list.sort((a, b) => a.priv - b.priv || (a.ip < b.ip ? -1 : a.ip > b.ip ? 1 : 0) || a.pub - b.pub || (a.type < b.type ? -1 : a.type > b.type ? 1 : 0));
  const groups = new Map<string, number[]>(), mappings: string[] = [];
  for (const p of list) {
    if (p.ip && p.pub !== p.priv) { mappings.push(`${p.ip.includes(':') ? `[${p.ip}]` : p.ip}:${p.pub}->${p.priv}/${p.type}`); continue; }
    const key = `${p.ip}/${p.type}`;
    groups.set(key, [...groups.get(key) ?? [], p.priv]);
  }
  const out: string[] = [];
  for (const [key, ports] of groups) {
    const [ip, type] = [key.slice(0, key.lastIndexOf('/')), key.slice(key.lastIndexOf('/') + 1)];
    const ranges: string[] = [];
    let start = ports[0], last = ports[0];
    const flush = () => ranges.push(start === last ? String(start) : `${start}-${last}`);
    for (const p of ports.slice(1)) { if (p === last + 1) last = p; else { flush(); start = last = p; } }
    flush();
    for (const g of ranges) out.push(ip ? `${ip}:${g}->${g}/${type}` : `${g}/${type}`);
  }
  return [...out, ...mappings].join(', ');
}

// ----------------------------------------------------------------------------------------------------- references

export interface ImageRef { repo: string; tag: string }
const COMPONENT = /^[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*$/;
const TAG = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;
/** IMAGE[:TAG] as Docker normalizes it (docker.io/ and library/ dropped, latest by default), or null when it is not a reference. */
export function parseRef(text: string): ImageRef | null {
  let t = text;
  if (t.startsWith('docker.io/')) t = t.slice('docker.io/'.length);
  if (t.startsWith('library/')) t = t.slice('library/'.length);
  const slash = t.lastIndexOf('/'), colon = t.lastIndexOf(':');
  const [repo, tag] = colon > slash ? [t.slice(0, colon), t.slice(colon + 1)] : [t, 'latest'];
  const parts = repo.split('/');
  if (!repo || parts.some((p, i) => !(COMPONENT.test(p) || (i === 0 && parts.length > 1 && /^[a-z0-9.-]+(:\d+)?$/.test(p))))) return null;
  return TAG.test(tag) ? { repo, tag } : null;
}
const refText = (r: ImageRef) => `${r.repo}:${r.tag}`;
/** Where docker pull says it pulls from (library/nginx) and the fully qualified name it prints last (docker.io/library/nginx:latest). */
const remoteName = (repo: string) => repo.includes('/') ? repo : `library/${repo}`;
const qualified = (r: ImageRef) => /^[^/]*[.:]/.test(r.repo) && r.repo.includes('/') ? refText(r) : `docker.io/${remoteName(r.repo)}:${r.tag}`;

export const dockerOf = (state: FsState): DockerState | undefined => state.docker;
const localImage = (d: DockerState, r: ImageRef) => d.images.find(i => i.local && !i.dangling && i.repo === r.repo && i.tag === r.tag);
/** An image named by reference or by (a prefix of at least 4 hex digits of) its ID. */
function findLocal(d: DockerState, text: string): DockerImage | undefined {
  const r = parseRef(text);
  const byRef = r ? localImage(d, r) : undefined;
  if (byRef) return byRef;
  const id = text.replace(/^sha256:/, '');
  return /^[0-9a-f]{4,64}$/.test(id) ? d.images.find(i => i.local && i.id.startsWith(id)) : undefined;
}
export const imageById = (d: DockerState, id: string) => d.images.find(i => i.id === id);
/** A container by its name (a leading / allowed) or a unique prefix of its ID. */
export function findContainer(d: DockerState, text: string): DockerContainer | undefined {
  const name = text.replace(/^\//, '');
  const byName = d.containers.find(c => c.name === name);
  if (byName) return byName;
  if (!/^[0-9a-f]+$/.test(text)) return undefined;
  const hits = d.containers.filter(c => c.id.startsWith(text));
  return hits.length === 1 ? hits[0] : undefined;
}

// ----------------------------------------------------------------------------------------------------- the container's file system

export const DEFAULT_OS_RELEASE = 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nVERSION="12 (bookworm)"\nID=debian\n';
const hostsOf = (c: Pick<DockerContainer, 'id' | 'ip'>) =>
  `127.0.0.1\tlocalhost\n::1\tlocalhost ip6-localhost ip6-loopback\nfe00::\tip6-localnet\nff00::\tip6-mcastprefix\nff02::1\tip6-allnodes\nff02::2\tip6-allrouters\n${c.ip ? `${c.ip}\t${short(c.id)}\n` : ''}`;
/** A new container's file system: a small Linux base, the image's files, and what Docker writes (/etc/hostname, /etc/hosts). */
export function imageNodes(img: DockerImage, id: string, ip?: string): Map<string, FsNode> {
  // E21: a built image brings its whole file system (imageFs).
  const nodes = imageFs(img);
  const dir = (path: string) => { if (!nodes.has(path)) { if (path !== '/') dir(parentOf(path)); nodes.set(path, { kind: 'dir', mode: 0o755, owner: 'root' }); } };
  const file = (path: string, content: string) => { dir(parentOf(path)); nodes.set(path, { kind: 'file', mode: 0o644, owner: 'root', content }); };
  file('/etc/hostname', `${short(id)}\n`);
  file('/etc/hosts', hostsOf({ id, ip }));
  return nodes;
}
const withHosts = (c: DockerContainer): DockerContainer => {
  const nodes = new Map(c.nodes), old = nodes.get('/etc/hosts');
  nodes.set('/etc/hosts', { kind: 'file', mode: old?.mode ?? 0o644, owner: 'root', content: hostsOf(c) });
  return { ...c, nodes };
};
/** E22: /etc/hosts with the container's address on each network, and /etc/resolv.conf (Docker's DNS on a user-defined network); --network host keeps the host's. */
const withNetFiles = (host: FsState, d: DockerState, c: DockerContainer): DockerContainer => {
  if (modeOf(c) === 'host') return c;
  const nodes = new Map(c.nodes), file = (path: string, content: string) => nodes.set(path, { kind: 'file', mode: nodes.get(path)?.mode ?? 0o644, owner: 'root', content });
  file('/etc/hosts', hostsText(d, c));
  file('/etc/resolv.conf', resolvText(host, d, c));
  return { ...c, nodes };
};
/** E22: a container that stops loses its addresses and what its tmpfs mounts held (E20's containers are unchanged). */
const stopped = (c: DockerContainer): DockerContainer => { if (!c.networks && !c.tmpfs) return c; const { tmpfs: _t, ...rest } = releaseAddresses(c); void _t; return rest; };
/** E22: a removed container's anonymous volumes go with it (docker rm -v, and --rm). */
function dropAnonymous(state: FsState, d: DockerState, c: DockerContainer): { state: FsState; d: DockerState } {
  const gone = (c.mounts ?? []).filter(m => m.anonymous && m.type === 'volume' && !d.containers.some(o => o.id !== c.id && (o.mounts ?? []).some(x => x.source === m.source))).map(m => m.source);
  if (!gone.length) return { state, d };
  const nodes = new Map(state.nodes);
  gone.forEach(v => removeVolumeDir(nodes, v));
  return { state: { ...state, nodes }, d: { ...d, volumes: (d.volumes ?? []).filter(v => !gone.includes(v.name)) } };
}
/** Bytes of the writable layer: the files that differ from the image's (docker container prune adds them up). */
function layerSize(c: DockerContainer, img: DockerImage | undefined): number {
  const base = img ? imageNodes(img, c.id) : new Map<string, FsNode>();
  let n = 0;
  for (const [path, node] of c.nodes) {
    if (path === '/etc/hosts' || node.kind !== 'file') continue;
    const b = base.get(path);
    if (!b || b.content !== node.content) n += new TextEncoder().encode(node.content ?? '').length;
  }
  return n;
}

// ----------------------------------------------------------------------------------------------------- running a command in a container

/** What a command in the container does: prints, exits with a status, or keeps running (until a time, or for ever). */
type Outcome = {
  lines: { stream: 1 | 2; text: string }[]; status: number; nodes: ReadonlyMap<string, FsNode>; running?: true; until?: Seconds;
  /** E22: the host's files after the command (what it wrote through its volumes and bind mounts), its tmpfs, and other containers' new access lines. */
  hostNodes?: ReadonlyMap<string, FsNode>; tmpfs?: Record<string, ReadonlyMap<string, FsNode>>; logs?: Record<string, LogLine[]>;
};
const quoteArg = (a: string) => /^[A-Za-z0-9_./=:,@%+-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`;
const OCI_NOT_FOUND = (cmd: string) => `exec: "${cmd}": executable file not found in $PATH`;
const SLEEP = /^(\d+(?:\.\d+)?)([smhd]?)$/;

/** The environment a container's processes have: PATH, HOSTNAME, TERM (with -t), -e, the image's ENV, HOME. */
export function containerEnv(c: Pick<DockerContainer, 'id' | 'env' | 'tty'> & Partial<Pick<DockerContainer, 'user' | 'nodes'>>, img: DockerImage | undefined): string[] {
  const imageEnv = img?.env ?? [], path = imageEnv.find(e => e.startsWith('PATH=')) ?? 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
  const set = new Set(c.env.map(e => e.split('=')[0]));
  // E21: HOME is the USER's home in the image's /etc/passwd (/ when it has none).
  const home = c.user && c.nodes ? userOf(c.nodes, c.user)?.home ?? '/' : '/root';
  return [set.has('PATH') ? undefined : path, `HOSTNAME=${short(c.id)}`, c.tty ? 'TERM=xterm' : undefined, ...c.env,
    ...imageEnv.filter(e => !e.startsWith('PATH=') && !set.has(e.split('=')[0])), `HOME=${home}`].filter((e): e is string => e !== undefined);
}

/**
 * Fix (E20): docker inspect's Config.Env — what the container was created with: the -e values, then the image's ENV that
 * they do not override (moby's merge), the image's PATH included. HOSTNAME, HOME and TERM are added when a process starts.
 */
export function configEnv(c: Pick<DockerContainer, 'env'>, img: DockerImage | undefined): string[] {
  const imageEnv = img?.env ?? [], withPath = imageEnv.some(e => e.startsWith('PATH=')) ? imageEnv : ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', ...imageEnv];
  const set = new Set(c.env.map(e => e.split('=')[0]));
  return [...c.env, ...withPath.filter(e => !set.has(e.split('=')[0]))];
}

/**
 * Runs argv in the container (as root, in its working directory). The file commands run in the simulation's own shell on
 * the container's files (so a write is in the writable layer); env, ps, sleep, true, false and sh -c are handled here.
 * notFound: what a missing executable is reported as by the caller (OCI's error). main: argv is the container's main
 * process (docker run IMAGE ps shows ps as PID 1 and nothing else); system: the host's uname fields (the kernel is shared).
 */
type RunOptions = { tty: boolean; env: string[]; now: Seconds; workdir?: string; system?: Partial<SystemInfo>; main?: boolean; /** E22: the host (its files and daemon): mounts and networks. */ host?: FsState };
function runIn(c: DockerContainer, img: DockerImage | undefined, argv: readonly string[], o: RunOptions): Outcome | { notFound: string } {
  const has = (cmd: string) => (img?.commands ?? IMAGE_COMMANDS).includes(cmd);
  const [cmd, ...rest] = argv;
  const name = cmd.includes('/') ? cmd.slice(cmd.lastIndexOf('/') + 1) : cmd;
  if (!has(name)) return { notFound: cmd };
  const done = (lines: Outcome['lines'], status = 0): Outcome => ({ lines, status, nodes: c.nodes });
  switch (name) {
    case 'true': return done([]);
    case 'false': return done([], 1);
    case 'env': return done(containerEnv({ ...c, env: [...c.env, ...o.env], tty: o.tty }, img).map(text => ({ stream: 1 as const, text })));
    case 'ps': {
      if (rest.length) return done([{ stream: 2, text: 'ps：模擬環境的容器裡只支援不加選項的 ps' }], 1);
      const row = (pid: number, comm: string) => `${String(pid).padStart(7)} ?        00:00:00 ${comm.slice(0, 15)}`;
      // Fix (E20): ps as the container's main process is PID 1 and the only process.
      if (o.main) return done([{ stream: 1, text: '    PID TTY          TIME CMD' }, { stream: 1, text: row(1, 'ps') }]);
      const main = mainCommand(c), self = 7 + c.execs;
      return done([{ stream: 1, text: '    PID TTY          TIME CMD' }, { stream: 1, text: row(1, main) }, { stream: 1, text: row(self, 'ps') }]);
    }
    case 'sleep': {
      if (rest.length === 1 && rest[0] === 'infinity') return { ...done([]), running: true };
      const m = rest.length === 1 ? SLEEP.exec(rest[0]) : null;
      if (!m) return done([{ stream: 2, text: rest.length ? `sleep: invalid time interval '${rest[0]}'` : 'sleep: missing operand' }], 1);
      const seconds = Number(m[1]) * ({ '': 1, s: 1, m: 60, h: 3600, d: 86400 } as Record<string, number>)[m[2]];
      return { ...done([]), running: true, until: o.now + seconds };
    }
    case 'sh': case 'bash': {
      if (rest[0] !== '-c' || rest.length < 2) return done([]);
      const line = rest[1];
      // Fix (E20): exit is a shell builtin (exit, exit N, or a last "; exit N" after other commands).
      const ex = /^(?:(.*?)\s*;\s*)?exit(?:\s+(\S+))?\s*;?\s*$/s.exec(line);
      if (ex && !/[|&<>`$'"]/.test(ex[2] ?? '')) {
        const before: Outcome = ex[1] ? (() => { const r = runIn(c, img, [cmd, '-c', ex[1]], { ...o, main: false }); return 'notFound' in r ? done([{ stream: 2, text: `${name}: 1: ${r.notFound}: not found` }], 127) : r; })() : done([]);
        if (ex[2] === undefined) return { ...before, running: undefined, until: undefined };
        if (!/^\d+$/.test(ex[2])) return { ...before, lines: [...before.lines, { stream: 2, text: name === 'bash' ? `bash: line 1: exit: ${ex[2]}: numeric argument required` : `sh: 1: exit: Illegal number: ${ex[2]}` }], status: 2, running: undefined, until: undefined };
        return { ...before, status: Number(BigInt(ex[2]) % BigInt(256)), running: undefined, until: undefined };
      }
      const t = tokenize(line);
      // A simple command (no operators) runs as argv, so sh -c 'env' and sh -c 'sleep 5' work too.
      if ('words' in t && t.words.length && !/[|<>;&`$]/.test(line)) {
        const r = runIn(c, img, t.words, o);
        return 'notFound' in r ? done([{ stream: 2, text: `${name}: 1: ${r.notFound}: not found` }], 127) : r;
      }
      // E22: the container's shell is the interpreter (for, if, ; && ||), so its keywords are not commands.
      const names = o.host?.docker?.storageNet ? scriptCommandNames(line) : commandNames(line);
      if (names.includes('exit')) return done([{ stream: 2, text: `${name} -c：模擬環境的 exit 只支援單獨的 exit N，或寫在最後（指令; exit N）` }], 2);
      const missing = names.find(n => !has(n));
      if (missing) return done([{ stream: 2, text: `${name}: 1: ${missing}: not found` }], 127);
      return shellLine(c, line, { ...o, system: systemOf(img, o.system), busybox: isAlpine(img) });
    }
  }
  return shellLine(c, [name, ...rest].map(quoteArg).join(' '), { ...o, system: systemOf(img, o.system), busybox: isAlpine(img) });
}
/** The uname fields in the container: the host's kernel (BusyBox's uname -o on Alpine prints Linux). */
const systemOf = (img: DockerImage | undefined, host: Partial<SystemInfo> | undefined): Partial<SystemInfo> => ({ ...host, ...isAlpine(img) ? { os: 'Linux' } : {} });
/** A line of the simulation's shell on the container's files (no tty: ls prints one name per line, as in docker exec without -t). */
function shellLine(c: DockerContainer, line: string, o: { tty: boolean; workdir?: string; system?: Partial<SystemInfo>; busybox?: boolean; host?: FsState }): Outcome {
  // E22: the container's files with its mounts laid over them, and its network.
  const e22 = o.host?.docker?.storageNet ? o.host : undefined;
  const nodes = e22 ? mountedNodes(e22, c) : c.nodes;
  // E21: as the image's USER (root by default), with its home and groups from the image's /etc/passwd and /etc/group.
  const who = c.user ? userOf(c.nodes, c.user) ?? { name: c.user.split(':')[0], home: '/' } : { name: 'root', home: '/root' };
  const groups = e22 ? groupsE22(c) : who.name === 'root' ? undefined : groupsIn(c.nodes, who.name);
  const cwd = nodes.get(o.workdir ?? c.workdir)?.kind === 'dir' ? o.workdir ?? c.workdir : '/';
  const state: FsState = { nodes, cwd, user: who.name, home: who.home, host: c.hostname ?? short(c.id),
    system: { ...DEFAULT_SYSTEM, ...o.system }, ...groups ? { groups } : {},
    ...e22 ? { accounts: imageAccounts(c.nodes), ...e22.clock ? { clock: e22.clock } : {}, ...networkView(e22, e22.docker!, c) } : {} };
  const r = runInput(state, line, e22 ? CONTAINER_E22_PROFILE : CONTAINER_PROFILE, null, o.tty);
  // Fix (E20): BusyBox's ls (Alpine) names a missing path without GNU's "cannot access" and quotes.
  const busy = (text: string) => o.busybox ? text.replace(/^ls: cannot access '(.*)': /, 'ls: $1: ') : text;
  const lines = r.lines.map(l => ({ stream: (l.kind === 'out' ? 1 : 2) as 1 | 2, text: l.kind === 'out' ? l.text : busy(l.text) }));
  if (!e22) return { lines, status: lines.some(l => l.stream === 2) ? 1 : 0, nodes: r.state.nodes };
  // E22: what changed under a mount goes back to the host (never through a read-only mount); the services' access lines too.
  const u = unmount(e22, c, r.state.nodes), logs = peerLogs(r.state, e22.docker!);
  if (u.refused) lines.push({ stream: 2, text: readOnlyError(line, u.refused, cwd) });
  // Each command's own exit status (curl 7, ping 1, getent 2, ls 2…), as the shell's $? has it.
  const status = u.refused ? 1 : r.state.status ?? (lines.some(l => l.stream === 2) ? 1 : 0);
  return { lines, status, nodes: u.nodes, hostNodes: u.hostNodes, ...u.tmpfs ? { tmpfs: u.tmpfs } : {}, ...Object.keys(logs).length ? { logs } : {} };
}
/**
 * E22: the groups of a container's process: -u USER:GROUP names the group (a name of the image's /etc/group or a number);
 * a user of the image's /etc/passwd has its groups; a bare number no account has runs with group 0 (root), as Docker does.
 */
function groupsE22(c: DockerContainer): string[] | undefined {
  const [u, g] = (c.user ?? 'root').split(':'), acc = imageAccounts(c.nodes);
  if (g !== undefined) return [acc.groups.find(x => x.name === g)?.name ?? (/^\d+$/.test(g) ? acc.groups.find(x => x.gid === Number(g))?.name ?? g : g)];
  const user = acc.users.find(x => x.name === u) ?? (/^\d+$/.test(u) ? acc.users.find(x => x.uid === Number(u)) : undefined);
  if (!user) return ['root'];
  return user.name === 'root' ? undefined : groupsIn(c.nodes, user.name);
}
/** E21: a user's groups in an image's /etc/group (its primary group and the groups that list it). */
function groupsIn(nodes: ReadonlyMap<string, FsNode>, user: string): string[] {
  const gid = (nodes.get('/etc/passwd')?.content ?? '').split('\n').map(l => l.split(':')).find(f => f[0] === user)?.[3];
  const out = (nodes.get('/etc/group')?.content ?? '').split('\n').map(l => l.split(':')).filter(f => f.length >= 4 && (f[2] === gid || f[3].split(',').includes(user))).map(f => f[0]);
  return out.length ? out : [user];
}
/** The name ps shows for the container's main process (an entrypoint script hands over to the command, as official images do). */
function mainCommand(c: DockerContainer): string {
  const argv = c.path.endsWith('.sh') && c.args.length ? c.args : [c.path, ...c.args];
  const first = argv[0] ?? 'sh';
  return first.slice(first.lastIndexOf('/') + 1);
}
/** The command after an entrypoint script (official images' entrypoints exec "$@"). */
const effective = (c: DockerContainer) => c.path.endsWith('.sh') ? c.args : [c.path, ...c.args];

// ----------------------------------------------------------------------------------------------------- lifecycle

const RANDOM_LEFT = ['admiring', 'brave', 'clever', 'eager', 'focused', 'gifted', 'happy', 'jolly', 'keen', 'nifty', 'quirky', 'sharp', 'vibrant', 'zealous', 'serene', 'upbeat'];
const RANDOM_RIGHT = ['turing', 'hopper', 'lovelace', 'knuth', 'ritchie', 'thompson', 'torvalds', 'wozniak', 'curie', 'noether', 'hamilton', 'babbage', 'shannon', 'dijkstra', 'liskov', 'mccarthy'];
/** A generated name (adjective_scientist, as moby's namesgenerator), fixed by the container's ID. */
function generatedName(d: DockerState, id: string): string {
  const b = sha256(new TextEncoder().encode(`name/${id}`));
  for (let i = 0; i < 256; i++) {
    const name = `${RANDOM_LEFT[(b[0] + i) % RANDOM_LEFT.length]}_${RANDOM_RIGHT[(b[1] + i * 7) % RANDOM_RIGHT.length]}`;
    if (!d.containers.some(c => c.name === name)) return name;
  }
  return `container_${short(id)}`;
}
const freeIp = (d: DockerState) => { for (let n = 2; n < 255; n++) { const ip = `172.17.0.${n}`; if (!d.containers.some(c => c.status === 'running' && c.ip === ip)) return ip; } return '172.17.0.254'; };
const seedLines = (seeds: readonly LogSeed[], t: Seconds): LogLine[] => seeds.map(s => typeof s === 'string' ? { t, stream: 1 as const, text: s } : { t, stream: s.stream ?? 1, text: s.text });
const outputLines = (text: string | undefined, t: Seconds): LogLine[] => text === undefined || text === '' ? [] : text.replace(/\n$/, '').split('\n').map(line => ({ t, stream: 1 as const, text: line }));
const proxyName = 'docker-proxy';
const isProxy = (p: Proc) => p.command.startsWith('/usr/bin/docker-proxy ');
const responderId = (c: DockerContainer, port: number) => `docker-${short(c.id)}-${port}`;

/** Why a running container's bindings cannot be made now (moby's texts), or null. */
function bindProblem(state: FsState, d: DockerState, c: DockerContainer): string | null {
  for (const b of c.ports) {
    const clash = d.containers.find(o => o.id !== c.id && o.status === 'running' && o.ports.some(p => p.host === b.host && p.proto === b.proto && (p.hostIp === b.hostIp || p.hostIp === '0.0.0.0' || b.hostIp === '0.0.0.0')));
    const endpoint = `driver failed programming external connectivity on endpoint ${c.name} (${hex(`endpoint/${c.id}/${c.started ?? 0}`)})`;
    if (clash) return `${endpoint}: Bind for ${b.hostIp}:${b.host} failed: port is already allocated`;
    const host = listenersOf(state).some(s => s.proto === b.proto && s.local.port === b.host && !s.holders.some(h => isProxy(h.proc)) && (s.local.address === '0.0.0.0' || b.hostIp === '0.0.0.0' || s.local.address === b.hostIp));
    if (host) return `${endpoint}: Error starting userland proxy: listen ${b.proto}4 ${b.hostIp}:${b.host}: bind: address already in use`;
  }
  return null;
}

/**
 * The host's side of the running containers: one docker-proxy per published port (child of dockerd, listening on the host
 * port; its listener names a responder made for that container when the image's service answers HTTP on the container
 * port), and nothing for the others. Existing proxies of still-published ports keep their pids.
 */
export function syncDocker(state: FsState): FsState {
  const d = state.docker;
  if (!d) return state;
  const procs = tableOf(state), want: { c: DockerContainer; b: PortBinding }[] = [];
  for (const c of d.containers) if (c.status === 'running') for (const b of c.ports) want.push({ c, b });
  const commandOf = (c: DockerContainer, b: PortBinding) => `/usr/bin/docker-proxy -proto ${b.proto} -host-ip ${b.hostIp} -host-port ${b.host} -container-ip ${primaryIp(d, c) ?? '172.17.0.2'} -container-port ${b.container}`;
  const running = d.containers.filter(c => c.status === 'running');
  const shimOf = (c: DockerContainer) => `/usr/bin/containerd-shim-runc-v2 -namespace moby -id ${c.id} -address /run/containerd/containerd.sock`;
  const shims = new Set(d.hostProcesses ? running.map(shimOf) : []);
  const oldShims = new Set(procs.filter(p => p.command.startsWith('/usr/bin/containerd-shim-runc-v2 ') && !shims.has(p.command)).map(p => p.pid));
  const kept = procs.filter(p => (!isProxy(p) || want.some(w => commandOf(w.c, w.b) === p.command)) && !oldShims.has(p.pid) && !oldShims.has(p.ppid));
  let last = state.lastPid ?? nextPid(state) - 1;
  const responders: Responder[] = [];
  const table: Proc[] = [...kept];
  for (const c of running) {
  for (const { b } of want.filter(w => w.c === c)) {
    const img = imageById(d, c.image), own = c.http ?? (img?.ownMain ? undefined : img?.http), http = own && own.port === b.container && b.proto === 'tcp' ? own : undefined;
    const rid = http ? responderId(c, b.host) : undefined;
    // E22: docker-proxy reaches a container of a user-defined network from that network's gateway.
    const via = c.networks && !c.ip ? attachments(d, c).find(x => x.a.ip)?.net.gateway : undefined;
    if (http && rid) responders.push({ ...http.responder, id: rid, container: c.id, ...via ? { via } : {} });
    const command = commandOf(c, b), listen = [{ port: b.host, address: b.hostIp, proto: b.proto, fd: 4, ...rid ? { http: rid } : {} }];
    const at = table.findIndex(p => p.command === command);
    if (at >= 0) { table[at] = { ...table[at], listen }; continue; }
    table.push({ pid: ++last, ppid: d.daemonPid ?? 1, user: 'root', command, stat: 'Sl', cpu: 0, rss: 3840, vsz: 1745920, shr: 3328, tty: '?', start: clockOf(state).now, time: 0, nice: 0, listen });
  }
  // E21: a running container's processes are the host's too: containerd's shim and the main process, with host PIDs.
  if (d.hostProcesses && !table.some(p => p.command === shimOf(c))) {
    const shim = ++last, now = clockOf(state).now;
    table.push({ pid: shim, ppid: 1, user: 'root', command: shimOf(c), stat: 'Sl', cpu: 0, rss: 13312, vsz: 1238016, shr: 9216, tty: '?', start: c.started ?? now, time: 0, nice: 0 });
    const name = (c.user ?? 'root').split(':')[0];
    // ps names the host's user of that uid; the container's users are not in the host's /etc/passwd, so their uid shows.
    const uid = name === 'root' || name === '0' ? 'root' : /^\d+$/.test(name) ? name : (c.nodes.get('/etc/passwd')?.content ?? '').split('\n').map(l => l.split(':')).find(f => f[0] === name)?.[2] ?? name;
    // E22: with --network host the main process listens on the host's ports itself (ss -tlnp shows it).
    const own = modeOf(c) === 'host' ? hostServed(d, c) : undefined;
    table.push({ pid: ++last, ppid: shim, user: uid, command: effective(c).join(' ') || c.path, stat: 'Ss', cpu: 0, rss: 4096, vsz: 8192, shr: 2048, tty: '?', start: c.started ?? now, time: 0, nice: 0, ...own?.listen.length ? { listen: own.listen } : {} });
  }
  if (modeOf(c) === 'host') responders.push(...hostServed(d, c).responders);
  }
  const http = state.http ? { ...state.http, responders: [...state.http.responders.filter(r => !r.container), ...responders] } : undefined;
  return { ...state, processes: table, lastPid: last, ...http ? { http } : {} };
}

/** Containers whose sleep has ended by now exit (0); --rm ones are removed. Then the host's proxies follow. */
export function settleDocker(state: FsState): FsState {
  const d = state.docker;
  if (!d) return state;
  const now = clockOf(state).now;
  if (!d.containers.some(c => c.status === 'running' && c.endsAt !== undefined && c.endsAt <= now)) return state;
  const containers = d.containers.flatMap(c => {
    if (c.status !== 'running' || c.endsAt === undefined || c.endsAt > now) return [c];
    return c.rm ? [] : [stopped({ ...c, status: 'exited' as const, exitCode: 0, finished: c.endsAt, ip: undefined, endsAt: undefined })];
  });
  let next: FsState = { ...state, docker: { ...d, containers } };
  // E22: a --rm container that ended takes its anonymous volumes with it.
  for (const c of d.containers) if (c.rm && c.status === 'running' && c.endsAt !== undefined && c.endsAt <= now) { const r = dropAnonymous(next, next.docker!, c); next = { ...r.state, docker: r.d }; }
  return syncDocker(next);
}

type Started = { c: DockerContainer; lines: Outcome['lines']; hostNodes?: ReadonlyMap<string, FsNode>; logs?: Record<string, LogLine[]> } | { error: string; status: number; c: DockerContainer };
/** Starts a created or exited container: its bindings, its address, then its command (a server keeps running). */
function start(state: FsState, d: DockerState, c0: DockerContainer, now: Seconds): Started {
  const img = imageById(d, c0.image);
  const { http: _old, stopExit: _stop, ...rest0 } = c0;
  void _old; void _stop;
  let c: DockerContainer = { ...rest0, started: now };
  const why = bindProblem(state, d, c);
  if (why) return { error: `Error response from daemon: ${why}`, status: 125, c: c0 };
  // E21: the image's USER must be in its /etc/passwd (a number need not be).
  if (c.user && !userOf(c.nodes, c.user)) return { error: `Error response from daemon: unable to find user ${c.user.split(':')[0]}: no matching entries in passwd file`, status: 125, c: c0 };
  // E22: an address on each of its networks (a network removed since is an error), /etc/hosts and /etc/resolv.conf.
  if (c.networks) {
    const a = assignAddresses(d, c);
    if ('missing' in a) return { error: `Error response from daemon: network ${a.missing} not found`, status: 125, c: c0 };
    c = withNetFiles(state, d, a);
  } else c = withHosts({ ...c, ip: freeIp(d) });
  const e22 = d.storageNet ? { ...state, docker: d } : undefined;
  const argv = effective(c);
  const running = (lines: Outcome['lines'], extra: Partial<DockerContainer> = {}): Started => ({ c: { ...c, status: 'running', exitCode: 0, finished: undefined, endsAt: undefined, ...extra, logs: [...c.logs, ...lines.map(l => ({ ...l, t: now }))] }, lines });
  const exited = (lines: Outcome['lines'], status: number, nodes = c.nodes): Started => ({ c: stopped({ ...c, nodes, status: 'exited', exitCode: status, finished: now, ip: undefined, endsAt: undefined, logs: [...c.logs, ...lines.map(l => ({ ...l, t: now }))] }), lines });
  const name = argv[0]?.slice(argv[0].lastIndexOf('/') + 1);
  // A shell without -c (ubuntu's and alpine's CMD too): it reads its standard input; without -i that is empty and it exits at once.
  if ((name === 'sh' || name === 'bash') && argv.length === 1 && (img?.commands ?? IMAGE_COMMANDS).includes(name)) return c.interactive ? running([]) : exited([], 0, c.nodes);
  // E22: with --network host the service listens on the host's ports; one already taken there stops it.
  const taken = (ports: number[]) => e22 && modeOf(c) === 'host' ? ports.find(p => listenersOf(state).some(s => s.proto === 'tcp' && s.local.port === p)) : undefined;
  const busy = (port: number) => exited([{ stream: 2, text: `（模擬環境：主機的 ${port} 埠已經有程式在監聽，容器的主程式無法監聽而結束）` }], 1);
  if (img && !c.custom && !img.ownMain) {
    if (img.service) { const t = taken(serviceListeners(d, { ...c, status: 'running' }).map(l => l.port)); return t !== undefined ? busy(t) : running(seedLines(img.logs, now)); }
    return exited([...seedLines(img.logs, now), ...outputLines(img.output, now)], img.exit);
  }
  // E21: a program the lesson declares (node server.js): what it needs, then what it prints and whether it keeps running.
  const prog = programFor(d, argv);
  if (prog) {
    // E22: what it needs may be on a volume or a bind mount.
    const seen = e22 ? mountedNodes(e22, c) : c.nodes;
    const missing = prog.needs.find(p => !seen.has(p.startsWith('/') ? p : `${c.workdir === '/' ? '' : c.workdir}/${p}`));
    if (missing !== undefined) return exited(prog.missing ? outputLines(prog.missing.output, now).map(l => ({ ...l, stream: 2 as const })) : [{ stream: 2, text: `（模擬環境：程式需要的 ${missing} 不在容器裡）` }], prog.missing?.exit ?? 1);
    if (prog.service) {
      const t = taken([...prog.http ? [prog.http.port] : [], ...img?.expose ?? []]);
      if (t !== undefined) return busy(t);
      return running(seedLines(prog.logs, now), { ...prog.http ? { http: prog.http } : {}, ...prog.stopExit !== undefined ? { stopExit: prog.stopExit } : {} });
    }
    return exited([...seedLines(prog.logs, now), ...outputLines(prog.output, now)], prog.exit);
  }
  if (name === 'tail' && argv.includes('-f')) return running([]);
  const r = runIn(c, img, argv, { tty: c.tty, env: [], now, system: state.system, main: true, ...e22 ? { host: e22 } : {} });
  if ('notFound' in r) {
    const msg = `Error response from daemon: failed to create task for container: failed to create shim task: OCI runtime create failed: runc create failed: unable to start container process: error during container init: ${OCI_NOT_FOUND(r.notFound)}: unknown`;
    return { error: msg, status: 127, c: { ...c0, exitCode: 127 } };
  }
  const more = { ...r.hostNodes ? { hostNodes: r.hostNodes } : {}, ...r.logs ? { logs: r.logs } : {} };
  if (r.running) return { ...running(r.lines, { ...r.until !== undefined ? { endsAt: r.until } : {}, ...e22 ? { nodes: r.nodes, ...r.tmpfs ? { tmpfs: r.tmpfs } : {} } : {} }), ...more };
  return { ...exited(r.lines, r.status, r.nodes), ...more };
}
/** E21: the declared program a command line is (exactly its words; a shell form's /bin/sh -c line too). */
function programFor(d: DockerState, argv: readonly string[]): DockerProgram | undefined {
  const same = (a: readonly string[]) => (d.programs ?? []).find(p => p.command.length === a.length && p.command.every((w, i) => w === a[i]));
  const name = argv[0]?.slice(argv[0].lastIndexOf('/') + 1);
  if ((name === 'sh' || name === 'bash') && argv[1] === '-c' && argv.length === 3) {
    const t = tokenize(argv[2].replace(/^exec\s+/, ''));
    if ('words' in t && !/[|<>;&`$]/.test(argv[2])) return same(t.words);
  }
  return same(argv);
}
/** docker stop: SIGTERM; a server exits 0 (or its stopExit), a process that ignores SIGTERM as PID 1 is killed after 10 s (137). */
function stop(c: DockerContainer, img: DockerImage | undefined, now: Seconds): DockerContainer {
  const isServer = !!img?.service && !c.custom && !img.ownMain;
  // E21: a declared program's exit status after docker stop is the lesson's (default 137: PID 1 without a SIGTERM handler).
  return stopped({ ...c, status: 'exited', exitCode: c.stopExit ?? (isServer ? img?.stopExit ?? 0 : img?.stopExit ?? 137), finished: now, ip: undefined, endsAt: undefined });
}

// ----------------------------------------------------------------------------------------------------- the docker command

export interface DockerIo {
  out(data: string): void; err(line: string): void; user: string; tty: boolean; stdin?: string | null;
  /** E21 (the images profile): docker build, docker history, docker image prune and the image config's fields. */
  images?: boolean;
  /** E22 (the storage-net profile): docker volume, docker network, -v, --mount, --tmpfs, --network and -u. */
  storageNet?: boolean;
}
export type DockerResult = { state: FsState; status: number };

const USAGE: Record<string, [string, string]> = {
  run: ['[OPTIONS] IMAGE [COMMAND] [ARG...]', 'Create and run a new container from an image'], exec: ['[OPTIONS] CONTAINER COMMAND [ARG...]', 'Execute a command in a running container'],
  ps: ['[OPTIONS]', 'List containers'], logs: ['[OPTIONS] CONTAINER', 'Fetch the logs of a container'], start: ['[OPTIONS] CONTAINER [CONTAINER...]', 'Start one or more stopped containers'],
  stop: ['[OPTIONS] CONTAINER [CONTAINER...]', 'Stop one or more running containers'], restart: ['[OPTIONS] CONTAINER [CONTAINER...]', 'Restart one or more containers'],
  rm: ['[OPTIONS] CONTAINER [CONTAINER...]', 'Remove one or more containers'], rmi: ['[OPTIONS] IMAGE [IMAGE...]', 'Remove one or more images'],
  pull: ['[OPTIONS] NAME[:TAG|@DIGEST]', 'Download an image from a registry'], images: ['[OPTIONS] [REPOSITORY[:TAG]]', 'List images'],
  port: ['CONTAINER [PRIVATE_PORT[/PROTO]]', 'List port mappings or a specific mapping for the container'], inspect: ['[OPTIONS] NAME|ID [NAME|ID...]', 'Return low-level information on Docker objects'],
  prune: ['[OPTIONS]', 'Remove all stopped containers'], version: ['[OPTIONS]', 'Show the Docker version information'], info: ['[OPTIONS]', 'Display system-wide information'],
  build: ['[OPTIONS] PATH | URL | -', 'Start a build'], history: ['[OPTIONS] IMAGE', 'Show the history of an image'], iprune: ['[OPTIONS]', 'Remove unused images'],
  volume: ['COMMAND', 'Manage volumes'], network: ['COMMAND', 'Manage networks'],
};
/** E21: what the images profile adds (below it these say engine stage E21). */
const E21_MANAGED: Record<string, Record<string, string>> = { image: { build: 'build', history: 'history', prune: 'iprune' }, buildx: { build: 'build' }, builder: { build: 'build' } };
/** Real docker commands the simulation leaves to a later engine stage. */
const LATER: Record<string, string> = {
  build: 'E21（Dockerfile、建置、分層與快取）', history: 'E21（Dockerfile、建置、分層與快取）', commit: 'E21（Dockerfile、建置、分層與快取）',
  volume: 'E22（Volume 與網路）', network: 'E22（Volume 與網路）', cp: 'E22（Volume 與網路）',
  compose: 'E23（Compose、多階段建置與 Registry）', push: 'E23（Compose、多階段建置與 Registry）', tag: 'E23（Compose、多階段建置與 Registry）', login: 'E23（Compose、多階段建置與 Registry）', logout: 'E23（Compose、多階段建置與 Registry）', search: 'E23（Compose、多階段建置與 Registry）',
  stats: 'E24（健康檢查、資源限制與重新啟動）', update: 'E24（健康檢查、資源限制與重新啟動）', top: 'E24（健康檢查、資源限制與重新啟動）', events: 'E24（健康檢查、資源限制與重新啟動）', wait: 'E24（健康檢查、資源限制與重新啟動）',
  kill: 'E24（健康檢查、資源限制與重新啟動）', pause: 'E24（健康檢查、資源限制與重新啟動）', unpause: 'E24（健康檢查、資源限制與重新啟動）',
  create: '之後的階段（請用 docker run）', rename: '之後的階段', attach: '之後的階段（模擬環境沒有鍵盤）', system: '之後的階段', save: '之後的階段', load: '之後的階段', context: '之後的階段', buildx: 'E21（Dockerfile、建置、分層與快取）',
};
const ENDPOINT: Record<string, string> = {
  ps: 'Get "http://%2Fvar%2Frun%2Fdocker.sock/v1.47/containers/json"', images: 'Get "http://%2Fvar%2Frun%2Fdocker.sock/v1.47/images/json"',
  info: 'Get "http://%2Fvar%2Frun%2Fdocker.sock/v1.47/info"', version: 'Get "http://%2Fvar%2Frun%2Fdocker.sock/v1.47/version"',
  run: 'Head "http://%2Fvar%2Frun%2Fdocker.sock/_ping"', pull: 'Post "http://%2Fvar%2Frun%2Fdocker.sock/v1.47/images/create"',
};
const denied = (what: string) => `permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock: ${ENDPOINT[what] ?? 'Head "http://%2Fvar%2Frun%2Fdocker.sock/_ping"'}: dial unix /var/run/docker.sock: connect: permission denied`;
/** Whether the user may use the daemon's socket (root, or read and write on /run/docker.sock: the docker group). */
export function socketAllowed(state: FsState, user: string): boolean {
  if (user === 'root') return true;
  const node = state.nodes.get(SOCKET);
  return !!node && can(node, user, 'r', groupsOf(state)) && can(node, user, 'w', groupsOf(state));
}

/**
 * docker version | info | images | image ls | pull | run | ps | container ls | logs | exec | stop | start | restart | rm |
 * rmi | container prune | port | inspect, with Docker 27.5.1's texts. Everything else says which engine stage brings it.
 */
export function docker(state0: FsState, args: readonly string[], io: DockerIo): DockerResult {
  if (!state0.docker) { io.err("Command 'docker' not found, but can be installed with:"); io.err(''); io.err('sudo apt install docker.io'); return { state: state0, status: 127 }; }
  let state = settleDocker(state0);
  const out = (line: string) => io.out(`${line}\n`), err = io.err;
  const result = (status: number) => ({ state, status });
  if (!args.length) {
    ['', 'Usage:  docker [OPTIONS] COMMAND', '', 'A self-sufficient runtime for containers', '', 'Common Commands:'].forEach(out);
    for (const c of ['run', 'exec', 'ps', 'images', 'pull', ...io.images ? ['build'] : [], 'version', 'info']) out(`  ${c.padEnd(12)}${c === 'build' ? 'Build an image from a Dockerfile' : USAGE[c][1]}`);
    out(''); out('Commands:');
    for (const c of ['history', 'inspect', 'logs', 'port', 'restart', 'rm', 'rmi', 'start', 'stop'].filter(c => c !== 'history' || io.images)) out(`  ${c.padEnd(12)}${USAGE[c][1]}`);
    // E22: the management commands volume and network.
    if (io.storageNet) { out(''); out('Management Commands:'); for (const c of ['network', 'volume']) out(`  ${c.padEnd(12)}${USAGE[c][1]}`); }
    out(''); out(io.storageNet ? '（模擬環境只支援上面這些指令，以及 docker container ls|prune、docker image ls|pull|rm|build|history|prune、docker volume create|ls|inspect|rm|prune 與 docker network create|ls|inspect|connect|disconnect|rm|prune）' : io.images ? '（模擬環境只支援上面這些指令，以及 docker container ls|prune 與 docker image ls|pull|rm|build|history|prune）' : '（模擬環境只支援上面這些指令，以及 docker container ls|prune 與 docker image ls|pull|rm）');
    return result(0);
  }
  if (args[0] === '--version' || args[0] === '-v') { out(`Docker version ${DOCKER_VERSION}, build ${DOCKER_BUILD}`); return result(0); }
  // Management commands (docker container rm, docker image ls) are the same commands.
  let path = 'docker', sub = args[0], rest = args.slice(1);
  const MANAGED: Record<string, Record<string, string>> = {
    container: { ls: 'ps', list: 'ps', ps: 'ps', run: 'run', exec: 'exec', logs: 'logs', start: 'start', stop: 'stop', restart: 'restart', rm: 'rm', remove: 'rm', prune: 'prune', port: 'port', inspect: 'inspect' },
    image: { ls: 'images', list: 'images', pull: 'pull', rm: 'rmi', remove: 'rmi', inspect: 'inspect', ...io.images ? E21_MANAGED.image : {} },
    ...io.images ? { buildx: E21_MANAGED.buildx, builder: E21_MANAGED.builder } : {},
  };
  if (MANAGED[sub]) {
    const group = sub, name = rest[0];
    if (!name || !MANAGED[group][name]) {
      if (name && LATER[name]) { err(`docker ${group} ${name}：模擬環境在引擎階段 ${LATER[name]} 才支援`); return result(1); }
      err(name ? `docker: '${group} ${name}' is not a docker command.` : `docker ${group}：請加上子指令，例如 docker ${group} ls`);
      if (name) err("See 'docker --help'");
      return result(1);
    }
    path = `docker ${group} ${name}`; sub = MANAGED[group][name]; rest = rest.slice(1);
  } else if (sub === 'prune') { err("docker: 'prune' is not a docker command."); err("See 'docker --help'"); return result(1); }
  else path = `docker ${sub}`;
  if (io.images && sub === 'commit') { err('docker commit：模擬環境不支援（請寫成 Dockerfile，用 docker build 建置）'); return result(1); }
  if (io.storageNet && sub === 'cp') { err('docker cp：模擬環境不支援（請用 bind mount 或 Volume 在主機與容器之間交換檔案，或用 docker exec 容器 cat 檔案）'); return result(1); }
  const e22Command = io.storageNet && (sub === 'volume' || sub === 'network');
  if (LATER[sub] && !(io.images && (sub === 'build' || sub === 'history')) && !e22Command) { err(`docker ${sub}：模擬環境在引擎階段 ${LATER[sub]} 才支援`); return result(1); }
  if (!USAGE[sub]) { err(`docker: '${sub}' is not a docker command.`); err("See 'docker --help'"); return result(1); }
  const usageError = (line: string) => { err(line); err(`See '${path} --help'.`); err(''); err(`Usage:  ${path} ${USAGE[sub][0]}`); err(''); err(USAGE[sub][1]); return result(1); };
  const needArgs = (min: number, exact = false) => usageError(`"${path}" requires ${exact ? 'exactly' : 'at least'} ${min} argument${min === 1 ? '' : 's'}.`);
  const flagError = (flag: string) => { err(flag.startsWith('--') ? `unknown flag: ${flag}` : `unknown shorthand flag: '${flag[1]}' in ${flag}`); err(`See '${path} --help'.`); return result(125); };

  // The client half of version prints before the daemon is asked.
  if (sub === 'version') {
    ['Client: Docker Engine - Community', ` Version:           ${DOCKER_VERSION}`, ` API version:       ${DOCKER_API}`, ` Go version:        ${GO_VERSION}`, ' OS/Arch:           linux/amd64', ' Context:           default'].forEach(out);
    if (!socketAllowed(state, io.user)) { err(denied('version')); return result(1); }
    ['', 'Server: Docker Engine - Community', ' Engine:', `  Version:          ${DOCKER_VERSION}`, `  API version:      ${DOCKER_API} (minimum version 1.24)`, `  Go version:       ${GO_VERSION}`, '  OS/Arch:          linux/amd64',
      '  Experimental:     false', ' containerd:', '  Version:          1.7.25', ' runc:', '  Version:          1.2.4', ' docker-init:', '  Version:          0.19.0'].forEach(out);
    return result(0);
  }
  if (sub === 'info') {
    let format: string | undefined;
    for (let i = 0; i < rest.length; i++) {
      const a = rest[i];
      if (a === '-f' || a === '--format') { format = rest[++i]; if (format === undefined) { err(`flag needs an argument: ${a === '-f' ? "'f' in -f" : '--format'}`); err(`See '${path} --help'.`); return result(125); } }
      else if (a.startsWith('--format=')) format = a.slice(9);
      else if (a.startsWith('-')) return flagError(a);
      else { err(`"${path}" accepts no arguments.`); err(`See '${path} --help'.`); err(''); err(`Usage:  ${path} ${USAGE.info[0]}`); err(''); err(USAGE.info[1]); return result(1); }
    }
    if (format) {
      // Fix (E20): --format applies a Go template to the info (only the template's text is printed, then a new line).
      if (!socketAllowed(state, io.user)) { err(denied('info')); return result(1); }
      const r = infoTemplate(format, infoFields(state));
      if (r.text !== undefined) out(r.text);
      if (r.error) { err(r.error); return result(1); }
      return result(0);
    }
    ['Client: Docker Engine - Community', ` Version:    ${DOCKER_VERSION}`, ' Context:    default', ' Debug Mode: false', '', 'Server:'].forEach(out);
    if (!socketAllowed(state, io.user)) { err(`ERROR: ${denied('info')}`); err('errors pretty printing info'); return result(1); }
    const f = infoFields(state);
    [` Containers: ${f.Containers}`, `  Running: ${f.ContainersRunning}`, `  Paused: ${f.ContainersPaused}`, `  Stopped: ${f.ContainersStopped}`,
      ` Images: ${f.Images}`, ` Server Version: ${f.ServerVersion}`, ` Storage Driver: ${f.Driver}`, ` Logging Driver: ${f.LoggingDriver}`, ` Cgroup Driver: ${f.CgroupDriver}`, ` Cgroup Version: ${f.CgroupVersion}`,
      ` Kernel Version: ${f.KernelVersion}`, ` Operating System: ${f.OperatingSystem}`, ` OSType: ${f.OSType}`, ` Architecture: ${f.Architecture}`, ` CPUs: ${f.NCPU}`,
      ` Total Memory: ${bytesSize(Number(f.MemTotal))}`, ` Name: ${f.Name}`, ` Docker Root Dir: ${f.DockerRootDir}`].forEach(out);
    return result(0);
  }
  if (!socketAllowed(state, io.user)) {
    if (sub === 'build') { err(`ERROR: ${denied('build')}`); return result(1); }
    err(sub === 'run' ? `docker: ${denied('run')}.` : denied(sub)); if (sub === 'run') err("See 'docker run --help'."); return result(sub === 'run' ? 125 : 1);
  }
  const d0 = state.docker!;
  const now = clockOf(state).now;
  const save = (d: DockerState) => { state = syncDocker({ ...state, docker: d }); };
  const noSuch = (name: string) => `Error response from daemon: No such container: ${name}`;

  switch (sub) {
    case 'images': {
      let all = false, quiet = false, digests = false, format: string | undefined;
      const names: string[] = [], dangling: string[] = [];
      for (let i = 0; i < rest.length; i++) {
        const a = rest[i];
        if (a === '-a' || a === '--all') all = true;
        else if (a === '-q' || a === '--quiet') quiet = true;
        else if (a === '-aq' || a === '-qa') { all = quiet = true; }
        else if (a === '--digests') digests = true;
        else if (a === '--format') format = rest[++i] ?? '';
        else if (a.startsWith('--format=')) format = a.slice(9);
        else if (a === '-f' || a === '--filter' || a.startsWith('--filter=')) {
          // Fix (E20): -f dangling=true|false (moby's GetBoolOrDefault: 1, true, 0, false).
          const f = a.startsWith('--filter=') ? a.slice(9) : rest[++i] ?? '', eq = f.indexOf('=');
          if (eq < 0) { err(`invalid argument "${f}" for "${a.split('=')[0]}" flag: bad format of filter (expected name=value)`); err(`See '${path} --help'.`); return result(125); }
          if (f.slice(0, eq) !== 'dangling') { err('docker images：模擬環境的 --filter 只支援 dangling=true 與 dangling=false'); return result(1); }
          dangling.push(f.slice(eq + 1));
        }
        else if (a.startsWith('-')) return flagError(a);
        else names.push(a);
      }
      void all;
      let onlyDangling: boolean | undefined;
      if (dangling.length) {
        const no = dangling.some(v => v === '0' || v === 'false'), yes = dangling.some(v => v === '1' || v === 'true');
        if (no === yes) { err(`Error response from daemon: invalid filter 'dangling=${dangling.join(',')}'`); return result(1); }
        onlyDangling = yes;
      }
      if (names.length > 1) { err(`"${path}" requires at most 1 argument.`); err(`See '${path} --help'.`); return result(1); }
      const want = names[0];
      const wanted = want === undefined ? undefined : parseRef(want), tagged = !!want && want.lastIndexOf(':') > want.lastIndexOf('/');
      if (want !== undefined && !wanted) { err('invalid reference format'); return result(1); }
      // Untagged (dangling) images are listed too, as <none> <none>, unless a repository is named.
      const list = d0.images.filter(i => i.local && (!wanted || (!i.dangling && i.repo === wanted.repo && (!tagged || i.tag === wanted.tag))) && (onlyDangling === undefined || !!i.dangling === onlyDangling))
        .sort((a, b) => b.created - a.created || (a.repo < b.repo ? -1 : a.repo > b.repo ? 1 : 0) || (a.tag < b.tag ? -1 : 1));
      if (quiet) { list.forEach(i => out(short(i.id))); return result(0); }
      const fieldsOf = (i: DockerImage): Record<string, string> => ({
        Repository: i.dangling ? '<none>' : i.repo, Tag: i.dangling ? '<none>' : i.tag, Digest: i.dangling || !i.pullable ? '<none>' : `sha256:${i.digest}`, ID: short(i.id),
        CreatedSince: `${humanDuration(now - i.created)} ago`, CreatedAt: `${isoText(i.created)} +0000 UTC`, Size: humanSize(i.size, 3),
      });
      const headers = { Repository: 'REPOSITORY', Tag: 'TAG', Digest: 'DIGEST', ID: 'IMAGE ID', CreatedSince: 'CREATED', CreatedAt: 'CREATED AT', Size: 'SIZE' };
      const r = formatted(format ?? `table {{.Repository}}\t{{.Tag}}${digests ? '\t{{.Digest}}' : ''}\t{{.ID}}\t{{.CreatedSince}}\t{{.Size}}`, list.map(fieldsOf), headers);
      if ('error' in r) { err(r.error); return result(1); }
      r.lines.forEach(out);
      return result(0);
    }
    case 'ps': {
      let all = false, quiet = false, noTrunc = false, format: string | undefined;
      const filters: [string, string][] = [];
      for (let i = 0; i < rest.length; i++) {
        const a = rest[i];
        if (a === '--all') all = true;
        else if (a === '--quiet') quiet = true;
        else if (a === '--no-trunc') noTrunc = true;
        else if (a === '--format') format = rest[++i] ?? '';
        else if (a.startsWith('--format=')) format = a.slice(9);
        else if (a === '-f' || a === '--filter') { const f = rest[++i] ?? ''; const eq = f.indexOf('='); if (eq < 0) { err(`invalid argument "${f}" for "${a}" flag: bad format of filter (expected name=value)`); err(`See '${path} --help'.`); return result(125); } filters.push([f.slice(0, eq), f.slice(eq + 1)]); }
        else if (/^-[aq]+$/.test(a)) { if (a.includes('a')) all = true; if (a.includes('q')) quiet = true; }
        else return flagError(a);
      }
      // Fix (E20): publish= and expose= (PORT[/PROTO] or a range START-END[/PROTO], tcp by default), as moby's portOp parses them.
      const ports: Record<'publish' | 'expose', Set<string>> = { publish: new Set(), expose: new Set() };
      for (const [k, v] of filters) {
        if (k === 'status' && !['created', 'restarting', 'running', 'removing', 'paused', 'exited', 'dead'].includes(v)) { err(`Error response from daemon: invalid filter 'status=${v}'`); return result(1); }
        if (k === 'publish' || k === 'expose') {
          if (v.includes(':')) { err(`Error response from daemon: filter for '${k}' should not contain ':': ${v}`); return result(1); }
          const r = portRange(v);
          if ('error' in r) { err(`Error response from daemon: error while looking up for ${k} ${v}: ${r.error}`); return result(1); }
          for (let p = r.start; p <= r.end; p++) ports[k].add(`${p}/${r.proto}`);
          continue;
        }
        if (io.storageNet && (k === 'volume' || k === 'network')) continue;
        if (!['status', 'name'].includes(k)) { err(io.storageNet ? 'docker ps：模擬環境的 --filter 只支援 status=、name=、publish=、expose=、volume= 與 network=' : `docker ps：模擬環境的 --filter 只支援 status=、name=、publish= 與 expose=`); return result(1); }
      }
      // Values of one filter are alternatives; different filters must all match (moby's filters.Args).
      const match = (c: DockerContainer, k: string, v: string) => {
        if (k === 'status') return c.status === v;
        if (k === 'name') return c.name.includes(v);
        // publish: the host ports of HostConfig.PortBindings; expose: Config.ExposedPorts (the image's EXPOSE and the -p container ports).
        if (k === 'publish') return c.ports.some(b => ports.publish.has(`${b.host}/${b.proto}`));
        // E22: volume= is a volume's name or a mount point; network= a network's name or ID.
        if (k === 'volume') return (c.mounts ?? []).some(m => (m.type === 'volume' && m.source === v) || m.target === v || (m.type === 'bind' && m.source === v));
        if (k === 'network') { const net = findNetwork(d0, v); return !!net && c.networks?.[net.name] !== undefined; }
        return [...imageById(d0, c.image)?.expose.map(p => `${p}/tcp`) ?? [], ...c.ports.map(b => `${b.container}/${b.proto}`)].some(p => ports.expose.has(p));
      };
      const keys = [...new Set(filters.map(([k]) => k))];
      const list = d0.containers.filter(c => (all || filters.some(([k]) => k === 'status') || c.status === 'running')
        && keys.every(k => filters.some(([fk, v]) => fk === k && match(c, k, v))))
        .map((c, i) => ({ c, i })).sort((a, b) => b.c.created - a.c.created || b.i - a.i).map(x => x.c);
      if (quiet) { list.forEach(c => out(noTrunc ? c.id : short(c.id))); return result(0); }
      const fieldsOf = (c: DockerContainer): Record<string, string> => {
        const img = imageById(d0, c.image), cmd = [c.path, ...c.args].join(' ');
        return {
          ID: noTrunc ? c.id : short(c.id), Image: img?.local && (parseRef(c.ref) ? localImage(d0, parseRef(c.ref)!)?.id === c.image : false) ? c.ref : short(c.image),
          Command: goQuote(noTrunc ? cmd : ellipsis(cmd, 20)), RunningFor: `${humanDuration(now - c.created)} ago`, CreatedAt: `${isoText(c.created)} +0000 UTC`,
          Status: statusText(c, now), Ports: displayPorts(c, img), Names: c.name, State: c.status,
          // E22: the volumes' names (a bind mount's source), at most 15 characters each unless --no-trunc, and the networks.
          ...io.storageNet ? { Mounts: (c.mounts ?? []).filter(m => m.type !== 'tmpfs').map(m => noTrunc ? m.source : ellipsis(m.source, 15)).join(','), Networks: Object.keys(c.networks ?? {}).sort().join(',') } : {},
        };
      };
      const headers = { ID: 'CONTAINER ID', Image: 'IMAGE', Command: 'COMMAND', RunningFor: 'CREATED', CreatedAt: 'CREATED AT', Status: 'STATUS', Ports: 'PORTS', Names: 'NAMES', State: 'STATE', ...io.storageNet ? { Mounts: 'MOUNTS', Networks: 'NETWORKS' } : {} };
      const r = formatted(format ?? 'table {{.ID}}\t{{.Image}}\t{{.Command}}\t{{.RunningFor}}\t{{.Status}}\t{{.Ports}}\t{{.Names}}', list.map(fieldsOf), headers);
      if ('error' in r) { err(r.error); return result(1); }
      r.lines.forEach(out);
      return result(0);
    }
    case 'pull': {
      const words = rest.filter(a => a !== '-q' && a !== '--quiet'), quiet = words.length !== rest.length;
      const bad = words.find(a => a.startsWith('-'));
      if (bad) return flagError(bad);
      if (words.length !== 1) return needArgs(1, true);
      if (words[0].includes('@')) { err('docker pull：模擬環境以標籤拉取 Image；以 digest 鎖定版本在引擎階段 E23（Registry）才支援'); return result(1); }
      const ref = parseRef(words[0]);
      if (!ref) { err('invalid reference format'); return result(1); }
      const p = pull(d0, ref, words[0], now);
      if ('error' in p) { err(p.error); return result(1); }
      if (!quiet) p.lines.forEach(out);
      out(qualified(ref));
      save(p.d);
      return result(0);
    }
    case 'run': return runCommand();
    case 'build': return buildCommand();
    case 'volume': return volumeCommand();
    case 'network': return networkCommand();
    case 'history': {
      // E21: the image's history, newest first; only the image itself has an ID (BuildKit makes no intermediate images).
      let human = true, noTrunc = false, quiet = false, format: string | undefined;
      const names: string[] = [];
      for (let i = 0; i < rest.length; i++) {
        const a = rest[i];
        if (a === '-H' || a === '--human' || a === '--human=true') human = true;
        else if (a === '--human=false' || a === '-H=false') human = false;
        else if (a === '--no-trunc') noTrunc = true;
        else if (a === '-q' || a === '--quiet') quiet = true;
        else if (a === '--format') format = rest[++i] ?? '';
        else if (a.startsWith('--format=')) format = a.slice(9);
        else if (a.startsWith('-')) return flagError(a);
        else names.push(a);
      }
      if (names.length !== 1) return needArgs(1, true);
      const img = findLocal(d0, names[0]);
      if (!img) { const r = parseRef(names[0]); err(`Error response from daemon: No such image: ${r ? refText(r) : names[0]}`); return result(1); }
      const rows = [...historyOf(img)].reverse();
      const id = (i: number) => i ? '<missing>' : noTrunc ? `sha256:${img.id}` : short(img.id);
      if (quiet) { rows.forEach((_, i) => out(id(i))); return result(0); }
      const fieldsOf = (r: HistoryRow, i: number): Record<string, string> => ({
        ID: id(i), CreatedSince: human ? `${humanDuration(now - r.created)} ago` : rfc3339(r.created), CreatedAt: rfc3339(r.created),
        CreatedBy: noTrunc ? r.createdBy : ellipsis(r.createdBy.replace(/\t/g, ' '), 45), Size: human ? humanSize(r.size, 3) : String(r.size), Comment: r.comment,
      });
      const headers = { ID: 'IMAGE', CreatedSince: 'CREATED', CreatedAt: 'CREATED AT', CreatedBy: 'CREATED BY', Size: 'SIZE', Comment: 'COMMENT' };
      const r = formatted(format ?? 'table {{.ID}}\t{{.CreatedSince}}\t{{.CreatedBy}}\t{{.Size}}\t{{.Comment}}', rows.map(fieldsOf), headers);
      if ('error' in r) { err(r.error); return result(1); }
      r.lines.forEach(out);
      return result(0);
    }
    case 'iprune': {
      // E21: docker image prune removes dangling images (-a: every image no container uses).
      let force = false, every = false;
      for (const a of rest) { if (a === '-f' || a === '--force') force = true; else if (a === '-a' || a === '--all') every = true; else if (a === '-af' || a === '-fa') force = every = true; else if (a.startsWith('--filter')) { err('docker image prune：模擬環境不支援 --filter'); return result(1); } else return flagError(a); }
      if (!force) {
        out(every ? 'WARNING! This will remove all images without at least one container associated to them.' : 'WARNING! This will remove all dangling images.');
        const answer = io.stdin === null || io.stdin === undefined ? undefined : io.stdin.split('\n')[0].trim().toLowerCase();
        if (answer === undefined) { out('Are you sure you want to continue? [y/N] '); err('（模擬環境沒有鍵盤可以回答；請加 -f，或寫成 echo y | docker image prune）'); return result(1); }
        io.out('Are you sure you want to continue? [y/N] ');
        if (answer !== 'y' && answer !== 'yes') { out(''); return result(0); }
      }
      const used = new Set(d0.containers.map(c => c.image));
      const gone = d0.images.filter(i => i.local && !used.has(i.id) && (i.dangling || every));
      const lines: string[] = [];
      let d = d0, freed = 0;
      for (const img of gone) {
        if (!img.dangling) lines.push(`untagged: ${refText(img)}`, ...img.pullable ? [`untagged: ${img.repo}@sha256:${img.digest}`] : []);
        if (d.images.some(i => i !== img && i.local && i.id === img.id && gone.indexOf(i) > gone.indexOf(img))) { d = { ...d, images: d.images.filter(i => i !== img) }; continue; }
        const r = deleteImage(d, img);
        d = r.d; freed += r.freed;
        lines.push(...r.deleted.map(x => `deleted: sha256:${x}`));
      }
      if (lines.length) { out('Deleted Images:'); lines.forEach(out); out(''); }
      out(`Total reclaimed space: ${humanSize(freed)}`);
      save(d);
      return result(0);
    }
    case 'logs': {
      let tail: number | undefined, stamps = false, follow = false;
      const names: string[] = [];
      for (let i = 0; i < rest.length; i++) {
        const a = rest[i];
        if (a === '-f' || a === '--follow') follow = true;
        else if (a === '-t' || a === '--timestamps') stamps = true;
        else if (a === '-ft' || a === '-tf') { follow = true; stamps = true; }
        else if (a === '-n' || a === '--tail') { const v = rest[++i] ?? ''; if (v === 'all') tail = undefined; else if (/^\d+$/.test(v)) tail = Number(v); else { err(`invalid argument "${v}" for "${a}" flag: strconv.ParseInt: parsing "${v}": invalid syntax`); return result(125); } }
        else if (a.startsWith('--tail=')) { const v = a.slice(7); tail = v === 'all' ? undefined : Number(v); }
        else if (a.startsWith('-')) return flagError(a);
        else names.push(a);
      }
      if (names.length !== 1) return needArgs(1, true);
      const c = findContainer(d0, names[0]);
      if (!c) { err(noSuch(names[0])); return result(1); }
      const lines = tail === undefined ? c.logs : tail === 0 ? [] : c.logs.slice(-tail);
      for (const l of lines) { const text = stamps ? `${rfc3339(l.t).replace('Z', '.000000000Z')} ${l.text}` : l.text; if (l.stream === 1) out(text); else err(text); }
      if (follow && c.status === 'running') err('（模擬環境：-f 不會持續等待新的輸出；容器繼續執行，需要時再執行一次 docker logs）');
      return result(0);
    }
    case 'exec': {
      let tty = false, interactive = false, workdir: string | undefined, user: string | undefined;
      const env: string[] = [];
      let i = 0;
      for (; i < rest.length && rest[i].startsWith('-'); i++) {
        const a = rest[i];
        if (/^-[it]+$/.test(a)) { if (a.includes('i')) interactive = true; if (a.includes('t')) tty = true; }
        else if (a === '--interactive') interactive = true;
        else if (a === '--tty') tty = true;
        else if (a === '-e' || a === '--env') env.push(rest[++i] ?? '');
        else if (a.startsWith('--env=')) env.push(a.slice(6));
        else if (a === '-w' || a === '--workdir') workdir = rest[++i];
        else if (io.storageNet && (a === '-u' || a === '--user')) user = rest[++i];
        else if (io.storageNet && a.startsWith('--user=')) user = a.slice(7);
        else if (a === '-d' || a === '--detach') { err('docker exec：模擬環境的 docker exec 一律在前景執行（不支援 -d）'); return result(1); }
        else return flagError(a);
      }
      const words = rest.slice(i);
      if (words.length < 2) return needArgs(2);
      const c = findContainer(d0, words[0]);
      if (!c) { err(noSuch(words[0])); return result(1); }
      if (c.status !== 'running') { err(`Error response from daemon: container ${c.id} is not running`); return result(1); }
      const img = imageById(d0, c.image), argv = words.slice(1), name = argv[0].slice(argv[0].lastIndexOf('/') + 1);
      if ((name === 'sh' || name === 'bash') && argv.length === 1 && (img?.commands ?? IMAGE_COMMANDS).includes(name)) {
        err(`docker exec：模擬環境沒有容器裡的互動式 Shell；請直接加上要執行的指令，例如 docker exec ${c.name} ls /，或 docker exec ${c.name} ${name} -c '指令'`);
        void interactive;
        return result(0);
      }
      // E22: -u runs the command as another user (a name of the image's /etc/passwd, or a number).
      if (user !== undefined && !userOf(c.nodes, user)) { err(`unable to find user ${user.split(':')[0]}: no matching entries in passwd file`); return result(126); }
      const as = user !== undefined ? { ...c, user } : c;
      const r = runIn(as, img, argv, { tty, env: env.map(e => e.includes('=') ? e : `${e}=`), now, system: state.system, ...workdir ? { workdir } : {}, ...d0.storageNet ? { host: { ...state, docker: d0 } } : {} });
      if ('notFound' in r) { out(`OCI runtime exec failed: exec failed: unable to start container process: ${OCI_NOT_FOUND(r.notFound)}: unknown`); return result(127); }
      for (const l of r.lines) if (l.stream === 1) out(l.text); else err(l.text);
      // E22: what it wrote through the mounts, its tmpfs, and the access lines of the services it called.
      if (r.hostNodes) state = { ...state, nodes: r.hostNodes };
      const d1 = r.logs ? withLogs(d0, r.logs) : d0;
      save({ ...d1, containers: d1.containers.map(x => x.id === c.id ? { ...x, nodes: r.nodes, execs: x.execs + 1, ...r.tmpfs ? { tmpfs: r.tmpfs } : {} } : x) });
      return result(r.status);
    }
    case 'stop': case 'start': case 'restart': case 'rm': {
      let force = false, attach = false, volumes = false;
      const names: string[] = [];
      for (let i = 0; i < rest.length; i++) {
        const a = rest[i];
        if (sub === 'rm' && (a === '-f' || a === '--force')) force = true;
        else if (sub === 'rm' && (a === '-v' || a === '--volumes' || a === '-fv' || a === '-vf')) { volumes = true; if (a.includes('f')) force = true; }
        else if (sub === 'start' && (a === '-a' || a === '--attach')) attach = true;
        else if ((sub === 'stop' || sub === 'restart') && (a === '-t' || a === '--time' || a === '-s' || a === '--signal')) i++;
        else if (a.startsWith('-')) return flagError(a);
        else names.push(a);
      }
      if (!names.length) return needArgs(1);
      if (attach && names.length > 1) { err('you cannot start and attach multiple containers at once'); return result(1); }
      let d = d0, status = 0;
      const failed: string[] = [];
      for (const n of names) {
        const c = findContainer(d, n);
        if (!c) { err(noSuch(n)); failed.push(n); status = 1; continue; }
        const img = imageById(d, c.image);
        const put = (x: DockerContainer | null) => { d = { ...d, containers: x ? d.containers.map(y => y.id === c.id ? x : y) : d.containers.filter(y => y.id !== c.id) }; };
        if (sub === 'rm') {
          if (c.status === 'running' && !force) { err(`Error response from daemon: cannot remove container "/${c.name}": container is running: stop the container before removing or force remove`); status = 1; continue; }
          put(null); out(n);
          // E22: -v removes its anonymous volumes too.
          if (volumes && io.storageNet) { const r = dropAnonymous(state, d, c); state = r.state; d = r.d; }
          continue;
        }
        if (sub === 'stop') {
          if (c.status === 'running') { const s = stop(c, img, now); put(c.rm ? null : s); if (c.rm && io.storageNet) { const r = dropAnonymous(state, d, c); state = r.state; d = r.d; } }
          out(n); continue;
        }
        // start, restart: stop first (restart), then start.
        const before = sub === 'restart' && c.status === 'running' ? stop(c, img, now) : c;
        if (sub === 'start' && c.status === 'running') { out(n); continue; }
        state = syncDocker({ ...state, docker: { ...d, containers: d.containers.map(y => y.id === c.id ? before : y) } });
        d = state.docker!;
        const s = start(state, d, before, now);
        if ('error' in s) { err(s.error); failed.push(n); status = 1; put(s.c); continue; }
        // E22: what the main process wrote through its mounts, and the access lines of the services it called.
        if (s.hostNodes) state = { ...state, nodes: s.hostNodes };
        if (s.logs) d = withLogs(d, s.logs);
        put(s.c.rm && s.c.status === 'exited' ? null : s.c);
        if (attach) {
          for (const l of s.lines) if (l.stream === 1) out(l.text); else err(l.text);
          // Fix (E20): attached, docker start exits with the container's exit code (as docker run does).
          if (s.c.status === 'exited') status = s.c.exitCode;
        } else out(n);
        state = syncDocker({ ...state, docker: d });
      }
      if (failed.length && (sub === 'start' || sub === 'restart')) err(`Error: failed to ${sub} containers: ${failed.join(', ')}`);
      save(d);
      return result(status);
    }
    case 'rmi': {
      let force = false;
      const names: string[] = [];
      for (const a of rest) { if (a === '-f' || a === '--force') force = true; else if (a.startsWith('-')) return flagError(a); else names.push(a); }
      if (!names.length) return needArgs(1);
      let d = d0, status = 0;
      for (const n of names) {
        const img = findLocal(d, n);
        if (!img) { const r = parseRef(n); err(`Error response from daemon: No such image: ${r ? refText(r) : n}`); status = 1; continue; }
        const user = d.containers.find(c => c.image === img.id);
        if (img.dangling) {
          // An untagged image (named by its ID): a running container's is never removed, a stopped one's only with -f (moby's conflicts).
          const running = d.containers.find(c => c.image === img.id && c.status === 'running');
          if (running || (user && !force)) {
            const by = running ?? user!;
            err(`Error response from daemon: conflict: unable to delete ${short(img.id)} (${running ? 'cannot' : 'must'} be forced) - image is being used by ${running ? 'running' : 'stopped'} container ${short(by.id)}`);
            status = 1; continue;
          }
          const del = deleteImage(d, img);
          del.deleted.forEach(x => out(`Deleted: sha256:${x}`));
          d = del.d;
          continue;
        }
        // E21: an image with several tags (a build's -t twice, or a tag moved): by name only that tag goes; by ID, -f is needed.
        const tags = d.images.filter(i => i.local && !i.dangling && i.id === img.id);
        if (tags.length > 1) {
          const byId = !parseRef(n) || !localImage(d, parseRef(n)!);
          if (byId && !force) { err(`Error response from daemon: conflict: unable to delete ${short(img.id)} (must be forced) - image is referenced in multiple repositories`); status = 1; continue; }
          if (!byId) { out(`Untagged: ${refText(img)}`); d = { ...d, images: d.images.filter(i => i !== img) }; continue; }
          for (const x of tags.slice(1)) { out(`Untagged: ${refText(x)}`); d = { ...d, images: d.images.filter(i => i !== x) }; }
        }
        if (user && !force) {
          err(`Error response from daemon: conflict: unable to remove repository reference "${n}" (must force) - container ${short(user.id)} is using its referenced image ${short(img.id)}`);
          status = 1; continue;
        }
        out(`Untagged: ${refText(img)}`);
        // A built image was never pushed: it has no repository digest.
        if (!img.built) out(`Untagged: ${img.repo}@sha256:${img.digest}`);
        // Fix (E20): with the last tag removed, moby's imageDeleteHelper runs quietly with -f's mask: only a running container
        // (a hard conflict) keeps the image, untagged (dangling: <none> <none>); stopped or created containers (a soft conflict,
        // ignored by -f) do not, so the image is deleted and those containers are left pointing at a missing image.
        const running = d.containers.some(c => c.image === img.id && c.status === 'running');
        if (running) { d = { ...d, images: d.images.map(i => i === img ? { ...i, dangling: true } : i) }; continue; }
        const del = deleteImage(d, d.images.find(i => i.id === img.id && i.local && i.repo === img.repo && i.tag === img.tag) ?? img);
        del.deleted.forEach(x => out(`Deleted: sha256:${x}`));
        d = del.d;
      }
      save(d);
      return result(status);
    }
    case 'prune': {
      let force = false;
      for (const a of rest) { if (a === '-f' || a === '--force') force = true; else if (a.startsWith('--filter')) { err('docker container prune：模擬環境不支援 --filter'); return result(1); } else return flagError(a); }
      if (!force) {
        out('WARNING! This will remove all stopped containers.');
        const answer = io.stdin === null || io.stdin === undefined ? undefined : io.stdin.split('\n')[0].trim().toLowerCase();
        // The answer read from a pipe is not echoed, so what follows continues the prompt's line (as on a real terminal).
        if (answer === undefined) { out('Are you sure you want to continue? [y/N] '); err('（模擬環境沒有鍵盤可以回答；請加 -f，或寫成 echo y | docker container prune）'); return result(1); }
        io.out('Are you sure you want to continue? [y/N] ');
        if (answer !== 'y' && answer !== 'yes') { out(''); return result(0); }
      }
      const gone = d0.containers.filter(c => c.status !== 'running');
      if (gone.length) { out('Deleted Containers:'); gone.forEach(c => out(c.id)); out(''); }
      out(`Total reclaimed space: ${humanSize(gone.reduce((n, c) => n + layerSize(c, imageById(d0, c.image)), 0))}`);
      save({ ...d0, containers: d0.containers.filter(c => c.status === 'running') });
      return result(0);
    }
    case 'port': {
      const words = rest.filter(a => !a.startsWith('-')), bad = rest.find(a => a.startsWith('-'));
      if (bad) return flagError(bad);
      if (!words.length || words.length > 2) { err(`"${path}" requires at least 1 and at most 2 arguments.`); err(`See '${path} --help'.`); err(''); err(`Usage:  ${path} ${USAGE.port[0]}`); err(''); err(USAGE.port[1]); return result(1); }
      const c = findContainer(d0, words[0]);
      if (!c) { err(noSuch(words[0])); return result(1); }
      const bound = c.status === 'running' ? c.ports : [];
      const fam = (b: PortBinding) => b.hostIp === '0.0.0.0' ? [`0.0.0.0:${b.host}`, `[::]:${b.host}`] : [`${b.hostIp}:${b.host}`];
      if (words[1] !== undefined) {
        const m = /^(\d+)(?:\/(tcp|udp))?$/.exec(words[1]);
        if (!m) { err(`Error: invalid port (${words[1]})`); return result(1); }
        const hits = bound.filter(b => b.container === Number(m[1]) && b.proto === (m[2] ?? 'tcp'));
        if (!hits.length) { err(`Error: No public port '${m[1]}/${m[2] ?? 'tcp'}' published for ${words[0]}`); return result(1); }
        hits.flatMap(fam).forEach(out);
        return result(0);
      }
      [...bound].sort((a, b) => a.container - b.container).forEach(b => fam(b).forEach(h => out(`${b.container}/${b.proto} -> ${h}`)));
      return result(0);
    }
    case 'inspect': {
      let format: string | undefined;
      const names: string[] = [];
      for (let i = 0; i < rest.length; i++) {
        const a = rest[i];
        if (a === '-f' || a === '--format') format = rest[++i] ?? '';
        else if (a.startsWith('--format=')) format = a.slice(9);
        else if (a === '--type') i++;
        else if (a.startsWith('-')) return flagError(a);
        else names.push(a);
      }
      if (!names.length) return needArgs(1);
      const objects: Record<string, unknown>[] = [];
      let status = 0;
      for (const n of names) {
        // E21: docker image inspect looks only at images.
        const c = io.images && path === 'docker image inspect' ? undefined : findContainer(d0, n), img = c ? undefined : findLocal(d0, n);
        // E22: docker inspect also finds networks and volumes.
        const generic = io.storageNet && path === 'docker inspect' && !c && !img;
        const net = generic ? findNetwork(d0, n) : undefined, vol = generic && !net ? (d0.volumes ?? []).find(v => v.name === n) : undefined;
        if (net || vol) { objects.push(net ? networkJson(d0, net) : volumeJson(vol!)); continue; }
        if (!c && !img) { err(io.images && path === 'docker image inspect' ? `Error response from daemon: No such image: ${parseRef(n) ? refText(parseRef(n)!) : n}` : `Error: No such object: ${n}`); status = 1; continue; }
        objects.push(c ? (io.storageNet ? inspectContainer22(d0, c) : inspectContainer(c, imageById(d0, c.image), !!io.images))
          : io.storageNet ? inspectImage22(img!, d0.images.filter(i => i.local && !i.dangling && i.id === img!.id).map(refText)) : inspectImage(img!, !!io.images, d0.images.filter(i => i.local && !i.dangling && i.id === img!.id).map(refText)));
      }
      // E22: Go's templates with range and index, and the typed values' printing (pointers, structs).
      if (io.storageNet && format !== undefined) {
        for (const o of objects) { const r = goTemplate(format, o); if ('error' in r) { err(r.error); return result(1); } out(r.text); }
        return result(status);
      }
      if (format === undefined) {
        if (objects.length) { out(JSON.stringify(objects, null, 4)); err('（模擬環境：只列出模擬的欄位；真實的 docker inspect 還有更多欄位）'); }
        return result(status);
      }
      for (const o of objects) {
        const r = template(format, o);
        if ('error' in r) { err(r.error); return result(1); }
        out(r.text);
      }
      return result(status);
    }
  }
  return result(1);

  /** E22: docker volume … and docker network … (storage-net-cli.ts). */
  function volumeCommand(): DockerResult { const r = volumeCli(cli()); state = r.state; return result(r.status); }
  function networkCommand(): DockerResult { const r = networkCli(cli()); state = r.state; return result(r.status); }
  function cli(): E22Cli { return { state, d: d0, args: rest, now, stdin: io.stdin, out, raw: io.out, err }; }

  /** E21: docker build [-t NAME[:TAG]]… [-f FILE] [--build-arg K=V]… [--no-cache] [--target STAGE] [--progress plain|auto|tty] [-q] PATH. */
  function buildCommand(): DockerResult {
    const tags: ImageRef[] = [], buildArgs: Record<string, string> = {}, operands: string[] = [];
    let file: string | undefined, noCache = false, target: string | undefined, quiet = false;
    const usage = (line: string) => { err(`ERROR: ${line}`); err("See 'docker buildx build --help'."); err(''); err('Usage:  docker buildx build [OPTIONS] PATH | URL | -'); err(''); err('Start a build'); return result(1); };
    for (let i = 0; i < rest.length; i++) {
      const a = rest[i];
      const long = /^(--[a-z-]+)=(.*)$/s.exec(a);
      const flag = long ? long[1] : /^-[tf].+/.test(a) ? a.slice(0, 2) : a;
      const value = () => long ? long[2] : /^-[tf].+/.test(a) ? a.slice(2) : rest[++i];
      if (flag === '-t' || flag === '--tag') {
        const v = value();
        if (v === undefined) return usage(`flag needs an argument: ${flag === '-t' ? "'t' in -t" : '--tag'}`);
        const r = parseRef(v);
        if (!r) { err(`ERROR: invalid tag "${v}": ${/[A-Z]/.test(v.split(':')[0]) ? 'repository name must be lowercase' : 'invalid reference format'}`); return result(1); }
        tags.push(r);
      } else if (flag === '-f' || flag === '--file') { file = value(); if (file === undefined) return usage(`flag needs an argument: ${flag === '-f' ? "'f' in -f" : '--file'}`); }
      else if (flag === '--build-arg') { const v = value() ?? '', eq = v.indexOf('='); if (eq > 0) buildArgs[v.slice(0, eq)] = v.slice(eq + 1); }
      else if (flag === '--no-cache') noCache = true;
      else if (flag === '--target') target = value();
      else if (flag === '--progress') { const v = value(); if (v === 'quiet') quiet = true; else if (!['plain', 'auto', 'tty'].includes(v ?? '')) { err(`docker build：模擬環境的 --progress 只支援 plain、auto、tty 與 quiet（輸出一律是 plain 的格式）`); return result(1); } }
      else if (flag === '-q' || flag === '--quiet') quiet = true;
      else if (flag === '--pull' || flag === '--platform' || flag === '--network' || flag === '--secret' || flag === '--ssh' || flag === '--push' || flag === '--load' || flag === '-o' || flag === '--output' || flag === '--cache-from') {
        err(`docker build：模擬環境不支援 ${flag}`); return result(1);
      } else if (a.startsWith('-') && a !== '-') { err(`unknown flag: ${a.split('=')[0]}`); err("See 'docker buildx build --help'."); return result(1); }
      else operands.push(a);
    }
    if (operands.length !== 1) return usage(`"docker buildx build" requires exactly 1 argument.`);
    if (operands[0] === '-' || /^(https?|git):\/\//.test(operands[0]) || operands[0].startsWith('git@')) { err('docker build：模擬環境只支援本機資料夾的建置內容（例如 docker build -t app .）'); return result(1); }
    const r = build(state, d0, { tags, ...file !== undefined ? { file } : {}, context: operands[0], args: buildArgs, noCache, ...target !== undefined ? { target } : {}, quiet, ...io.storageNet ? { storageNet: true } : {} }, { out, err }, hooksOf(d0));
    // The build cache stays after a failed build too (what was downloaded and the steps that succeeded).
    save(r.state.docker!);
    return result(r.status);
  }

  /** docker run (create, then start; attached unless -d). */
  function runCommand(): DockerResult {
    let detach = false, rm = false, tty = false, interactive = false, name: string | undefined, workdir: string | undefined;
    const env: string[] = [], ports: PortBinding[] = [];
    // E22: -v, --mount, --tmpfs, --network (and its aliases) and -u.
    const vols: string[] = [], mountSpecs: string[] = [], tmpfsList: string[] = [], aliases: string[] = [];
    let network: string | undefined, user: string | undefined;
    let i = 0;
    const value = (a: string, flag: string): string | undefined => a.length > flag.length ? a.slice(flag.length).replace(/^=/, '') : rest[++i];
    for (; i < rest.length && rest[i].startsWith('-') && rest[i] !== '-'; i++) {
      const a = rest[i];
      if (a === '--') { i++; break; }
      if (a === '--rm') rm = true;
      else if (a === '--detach') detach = true;
      else if (a === '--interactive') interactive = true;
      else if (a === '--tty') tty = true;
      else if (a === '--name' || a.startsWith('--name=')) name = value(a, '--name');
      else if (a === '--env' || a.startsWith('--env=')) env.push(value(a, '--env') ?? '');
      else if (a === '--publish' || a.startsWith('--publish=')) { const p = parsePublish(value(a, '--publish') ?? ''); if ('error' in p) { err(`docker: ${p.error}.`); err("See 'docker run --help'."); return result(125); } ports.push(p); }
      else if (a === '--workdir' || a.startsWith('--workdir=')) workdir = value(a, '--workdir');
      // Below the storage-net profile the E22 flags say which engine stage brings them.
      else if (!io.storageNet && /^--(volume|mount|tmpfs|network|net|network-alias)(=|$)/.test(a)) { err(`docker run ${a.split('=')[0]}：模擬環境在引擎階段 ${LATER.volume} 才支援`); return result(125); }
      else if (io.storageNet && (a === '--volume' || a.startsWith('--volume='))) vols.push(value(a, '--volume') ?? '');
      else if (io.storageNet && (a === '--mount' || a.startsWith('--mount='))) mountSpecs.push(value(a, '--mount') ?? '');
      else if (io.storageNet && (a === '--tmpfs' || a.startsWith('--tmpfs='))) tmpfsList.push(value(a, '--tmpfs') ?? '');
      else if (io.storageNet && (a === '--network' || a.startsWith('--network='))) network = value(a, '--network');
      else if (io.storageNet && (a === '--net' || a.startsWith('--net='))) network = value(a, '--net');
      else if (io.storageNet && (a === '--network-alias' || a.startsWith('--network-alias='))) aliases.push(value(a, '--network-alias') ?? '');
      else if (io.storageNet && (a === '--net-alias' || a.startsWith('--net-alias='))) aliases.push(value(a, '--net-alias') ?? '');
      else if (io.storageNet && (a === '--user' || a.startsWith('--user='))) user = value(a, '--user');
      else if (/^-[a-zA-Z]/.test(a) && !a.startsWith('--')) {
        // Short flags may be combined (-dit) and a value may follow its letter (-p8080:80) or come next (-p 8080:80).
        for (let k = 1; k < a.length; k++) {
          const ch = a[k];
          if (ch === 'd') detach = true;
          else if (ch === 'i') interactive = true;
          else if (ch === 't') tty = true;
          else if (ch === 'v' && !io.storageNet) { err(`docker run -v：模擬環境在引擎階段 ${LATER.volume} 才支援`); return result(125); }
          else if (ch === 'p' || ch === 'e' || ch === 'w' || (io.storageNet && (ch === 'v' || ch === 'u'))) {
            const v = k + 1 < a.length ? a.slice(k + 1) : rest[++i];
            if (v === undefined) { err(`flag needs an argument: '${ch}' in -${ch}`); err("See 'docker run --help'."); return result(125); }
            if (ch === 'e') env.push(v);
            else if (ch === 'w') workdir = v;
            else if (ch === 'v') vols.push(v);
            else if (ch === 'u') user = v;
            else { const p = parsePublish(v); if ('error' in p) { err(`docker: ${p.error}.`); err("See 'docker run --help'."); return result(125); } ports.push(p); }
            break;
          } else return flagError(`-${ch}`);
        }
      } else return flagError(a.split('=')[0]);
    }
    const words = rest.slice(i);
    if (!words.length) return needArgs(1);
    if (name !== undefined && !/^\/?[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name)) { err(`docker: Error response from daemon: Invalid container name (${name}), only [a-zA-Z0-9][a-zA-Z0-9_.-] are allowed.`); err("See 'docker run --help'."); return result(125); }
    const ref = parseRef(words[0]);
    if (!ref) { err('docker: invalid reference format.'); err("See 'docker run --help'."); return result(125); }
    let d = d0;
    let img = localImage(d, ref);
    if (!img) {
      // The image is pulled first (its progress goes to standard error, so standard output keeps only the container ID).
      err(`Unable to find image '${refText(ref)}' locally`);
      const p = pull(d, ref, refText(ref), now);
      if ('error' in p) { err(`docker: ${p.error.replace(/\.$/, '')}.`); err("See 'docker run --help'."); return result(125); }
      p.lines.forEach(l => err(l));
      d = p.d;
      img = localImage(d, ref)!;
    }
    const given = name?.replace(/^\//, '');
    const other = given !== undefined ? d.containers.find(c => c.name === given) : undefined;
    if (other) {
      err(`docker: Error response from daemon: Conflict. The container name "/${given}" is already in use by container "${other.id}". You have to remove (or rename) that container to be able to reuse that name.`);
      err("See 'docker run --help'.");
      save(d);
      return result(125);
    }
    const id = hex(`container/${state.host ?? 'logic-island'}/${d.seq + 1}/${given ?? ''}/${words.join(' ')}`);
    const cmd = words.length > 1 ? words.slice(1) : img.cmd;
    // E21: an image without CMD or ENTRYPOINT (FROM scratch, say) needs a command.
    if (!cmd.length && !img.entrypoint.length) { err('docker: Error response from daemon: no command specified.'); err("See 'docker run --help'."); save(d); return result(125); }
    // E22: the mounts (with the image's VOLUME paths as anonymous volumes) and the network.
    const createError = (text: string) => { err(`docker: ${text.replace(/\.$/, '')}.`); err("See 'docker run --help'."); save(d); return result(125); };
    let e22: Partial<DockerContainer> = {};
    if (io.storageNet) {
      const mounts: DockerMount[] = [];
      for (const v of vols) { const m = parseVolumeFlag(v, state.cwd, id); if ('error' in m) return createError(m.error); mounts.push(m); }
      for (const v of mountSpecs) {
        const m = parseMountFlag(v, state.cwd, id);
        if ('error' in m) { if (m.error.startsWith('invalid argument')) { err(m.error); err("See 'docker run --help'."); save(d); return result(125); } return createError(m.error); }
        if (m.type === 'bind' && !state.nodes.has(m.source)) return createError(`Error response from daemon: invalid mount config for type "bind": bind source path does not exist: ${m.source}`);
        mounts.push(m);
      }
      for (const t of tmpfsList) { const target = t.split(':')[0]; if (!target.startsWith('/')) return createError(`Error response from daemon: invalid mount config for type "tmpfs": invalid mount path: '${target}' mount path must be absolute`); mounts.push({ type: 'tmpfs', source: '', target, readonly: false, via: 'mount' }); }
      const dup = mounts.find((m, k) => mounts.findIndex(o => o.target === m.target) !== k);
      if (dup) return createError(`Error response from daemon: Duplicate mount point: ${dup.target}`);
      mounts.push(...imageVolumes(img, mounts, id));
      const netName = network ?? 'bridge', net = findNetwork(d, netName);
      if (!net) return createError(`Error response from daemon: network ${netName} not found`);
      if (aliases.length && net.builtin) return createError('Error response from daemon: network-scoped alias is supported only for containers in user defined networks');
      if (net.driver !== 'bridge' && ports.length) { if (net.driver === 'host') err('WARNING: Published ports are discarded when using host network mode'); ports.length = 0; }
      e22 = { ...mounts.length ? { mounts } : {}, networks: { [net.name]: { aliases } }, ...user !== undefined ? { user } : {}, ...net.driver === 'host' ? { hostname: state.host ?? 'logic-island' } : {} };
    }
    const [path0, ...args0] = img.entrypoint.length ? [...img.entrypoint, ...cmd] : cmd;
    let c: DockerContainer = {
      id, name: given ?? generatedName(d, id), ref: words[0], image: img.id, path: path0 ?? '', args: args0, cmd, custom: words.length > 1, created: now, status: 'created', exitCode: 0, ports,
      env: env.map(e => e.includes('=') ? e : `${e}=`), workdir: workdir ?? img.workdir, rm, tty, interactive, logs: [], nodes: imageNodes(img, id), execs: 0, ...img.user ? { user: img.user } : {}, ...e22,
    };
    if (io.storageNet) {
      // E22: --network host keeps the host's /etc/hosts and name; volumes are created (and filled from the image) and mount points made.
      if (c.hostname) { const nodes = new Map(c.nodes); nodes.set('/etc/hostname', { kind: 'file', mode: 0o644, owner: 'root', content: `${c.hostname}\n` }); nodes.set('/etc/hosts', { kind: 'file', mode: 0o644, owner: 'root', content: state.nodes.get('/etc/hosts')?.content ?? '' }); c = { ...c, nodes }; }
      const p = prepareMounts(state, d, c, now);
      state = p.host; d = p.d; c = p.c;
    }
    d = { ...d, seq: d.seq + 1, containers: [...d.containers, c] };
    state = syncDocker({ ...state, docker: d });
    const s = start(state, d, c, now);
    if ('error' in s) {
      err(`docker: ${s.error}.`);
      d = { ...d, containers: rm ? d.containers.filter(x => x.id !== id) : d.containers.map(x => x.id === id ? s.c : x) };
      save(d);
      return result(s.status);
    }
    c = s.c;
    // E22: what the main process wrote through its mounts, and the access lines of the services it called.
    if (s.hostNodes) state = { ...state, nodes: s.hostNodes };
    if (s.logs) d = withLogs(d, s.logs);
    const removed = c.rm && c.status === 'exited';
    d = { ...d, containers: removed ? d.containers.filter(x => x.id !== id) : d.containers.map(x => x.id === id ? c : x) };
    if (removed) { const r = dropAnonymous(state, d, c); state = r.state; d = r.d; }
    save(d);
    if (detach) { out(id); return result(0); }
    // Attached: what the container prints, as it prints it.
    for (const l of s.lines) if (l.stream === 1) out(l.text); else err(l.text);
    if (c.status === 'running') {
      const shell = ['sh', 'bash'].includes(mainCommand(c));
      if (shell && interactive) {
        // An interactive shell would take over the terminal; the simulation has no keyboard, so the shell gets exit.
        const ended = stop(c, img, now);
        state = syncDocker({ ...state, docker: { ...state.docker!, containers: c.rm ? state.docker!.containers.filter(x => x.id !== id) : state.docker!.containers.map(x => x.id === id ? { ...ended, exitCode: 0 } : x) } });
        // E22: --rm takes its anonymous volumes with it.
        if (c.rm && io.storageNet) { const r = dropAnonymous(state, state.docker!, c); state = syncDocker({ ...r.state, docker: r.d }); }
        err(`（模擬環境沒有鍵盤：容器裡的互動式 Shell 立刻收到 exit 而結束（Exited (0)）；要讓它留著，請用 docker run -dit，再用 docker exec ${c.name} 指令）`);
        return result(0);
      }
      err(`（模擬環境沒有 Ctrl-C：容器 ${c.name} 留在背景繼續執行；伺服器通常用 docker run -d 在背景啟動）`);
      return result(0);
    }
    return result(c.exitCode);
  }
}

/** E22: other containers' logs after a command reached their services. */
const withLogs = (d: DockerState, logs: Record<string, LogLine[]>): DockerState => ({ ...d, containers: d.containers.map(c => logs[c.id] ? { ...c, logs: logs[c.id] } : c) });

/** E21: what the build engine asks the daemon: local images, what Docker Hub serves, references and Go's sizes. */
function hooksOf(d: DockerState): BuildHooks {
  const remote = (r: ImageRef) => d.images.find(i => i.pullable && i.repo === r.repo && i.tag === r.tag) ?? (d.images.some(i => i.pullable && i.repo === r.repo) ? 'unknown-tag' as const : undefined);
  return { local: x => localImage(d, x), remote, parseRef, qualified, humanSize };
}
/** E21: a build for a check (no progress; the error's text), on a copy of the machine. */
export function buildFor(state0: FsState, o: { context: string; file?: string }): BuildResult & { error?: string } {
  const state = settleDocker(state0);
  let error: string | undefined;
  const r = build(state, state.docker!, { tags: [], ...o.file ? { file: o.file } : {}, context: o.context, args: {}, noCache: false, quiet: true, ...state.docker?.storageNet ? { storageNet: true } : {} },
    { out: () => undefined, err: l => { if (l.startsWith('ERROR: ')) error = l.slice(7).replace(/^failed to solve: /, ''); } }, hooksOf(state.docker!));
  return { ...r, ...error ? { error } : {} };
}

/** A port filter's value as go-connections' nat.SplitProtoPort and ParsePortRange read it (errors are strconv's). */
function portRange(value: string): { start: number; end: number; proto: string } | { error: string } {
  const slash = value.indexOf('/'), [port, proto] = slash < 0 ? [value, 'tcp'] : [value.slice(0, slash), value.slice(slash + 1) || 'tcp'];
  if (!port) return { error: 'empty string specified for ports' };
  const parse = (t: string): number | { error: string } => /^\d+$/.test(t) && Number(t) <= 65535 ? Number(t) : { error: /^\d+$/.test(t) ? `strconv.ParseUint: parsing "${t}": value out of range` : `strconv.ParseUint: parsing "${t}": invalid syntax` };
  const dash = port.indexOf('-');
  if (dash < 0) { const p = parse(port); return typeof p === 'number' ? { start: p, end: p, proto } : p; }
  const a = parse(port.slice(0, dash)), b = parse(port.slice(dash + 1));
  if (typeof a !== 'number') return a;
  if (typeof b !== 'number') return b;
  if (b < a) return { error: `invalid range specified for port: ${port}` };
  return { start: a, end: b, proto };
}

/** -p [IP:]HOST:CONTAINER[/PROTO] (a single container port publishes to a host port the simulation does not choose: refused). */
function parsePublish(text: string): PortBinding | { error: string } {
  const m = /^(?:(\d+\.\d+\.\d+\.\d+):)?(\d+):(\d+)(?:\/(tcp|udp))?$/.exec(text);
  if (!m) {
    if (/^\d+(\/(tcp|udp))?$/.test(text)) return { error: 'docker run -p：模擬環境需要指定主機的連接埠（例如 -p 8080:80），不會隨機選一個' };
    return { error: `invalid hostPort: ${text}` };
  }
  const host = Number(m[2]), container = Number(m[3]);
  if (host < 1 || host > 65535) return { error: `invalid hostPort: ${m[2]}` };
  if (container < 1 || container > 65535) return { error: `invalid containerPort: ${m[3]}` };
  return { hostIp: m[1] ?? '0.0.0.0', host, container, proto: (m[4] ?? 'tcp') as 'tcp' | 'udp' };
}

/** The fields of docker info the simulation models, named as in the API's system.Info (what --format's template reads). */
function infoFields(state: FsState): Record<string, string> {
  const d = state.docker!, cs = d.containers, sys = state.system, clock = clockOf(state);
  return {
    Containers: String(cs.length), ContainersRunning: String(cs.filter(c => c.status === 'running').length), ContainersPaused: '0', ContainersStopped: String(cs.filter(c => c.status !== 'running').length),
    Images: String(new Set(d.images.filter(i => i.local).map(i => i.id)).size), ServerVersion: DOCKER_VERSION, Driver: 'overlay2', LoggingDriver: 'json-file', CgroupDriver: 'systemd', CgroupVersion: '2',
    KernelVersion: sys?.release ?? DEFAULT_SYSTEM.release, OperatingSystem: 'Ubuntu 24.04.1 LTS', OSType: 'linux', Architecture: sys?.machine ?? DEFAULT_SYSTEM.machine, NCPU: String(clock.cpus),
    MemTotal: String(clock.memory.total * 1024 * 1024), Name: state.host ?? 'logic-island', DockerRootDir: '/var/lib/docker',
  };
}
/** Real fields of docker info the simulation does not model (said, not faked). */
const INFO_UNMODELLED = ['ID', 'Plugins', 'Swarm', 'Runtimes', 'DefaultRuntime', 'SecurityOptions', 'RegistryConfig', 'Labels', 'Debug', 'DriverStatus', 'SystemStatus', 'MemoryLimit', 'SwapLimit',
  'KernelMemoryTCP', 'CpuCfsPeriod', 'CpuCfsQuota', 'CPUShares', 'CPUSet', 'PidsLimit', 'IPv4Forwarding', 'BridgeNfIptables', 'BridgeNfIp6tables', 'NFd', 'OomKillDisable', 'NGoroutines',
  'SystemTime', 'NEventsListener', 'IndexServerAddress', 'HTTPProxy', 'HTTPSProxy', 'NoProxy', 'ExperimentalBuild', 'LiveRestoreEnabled', 'Isolation', 'InitBinary', 'ContainerdCommit',
  'RuncCommit', 'InitCommit', 'Warnings', 'ClientInfo', 'ServerErrors', 'ClientErrors', 'UserName', 'GenericResources', 'CDISpecDirs', 'Containerd', 'DefaultAddressPools', 'ProductLicense'];
/** docker info --format: {{.Field}} and literal text (docker/cli's formatInfo: the template's output, then a new line). */
function infoTemplate(format: string, f: Record<string, string>): { text?: string; error?: string } {
  const body = format;
  let text = '', at = 0;
  for (const m of body.matchAll(/\{\{(\s*)(.*?)\s*\}\}/gs)) {
    text += body.slice(at, m.index);
    at = m.index + m[0].length;
    const expr = m[2], field = /^\.([A-Za-z_]\w*)$/.exec(expr);
    if (!field) return { error: `docker info：模擬環境的 --format 只支援 {{.欄位}}（例如 {{.KernelVersion}}），不支援 ${m[0]}` };
    const name = field[1];
    if (name in f) { text += f[name]; continue; }
    if (INFO_UNMODELLED.includes(name)) return { error: `docker info：模擬環境沒有模擬 .${name}（模擬的欄位：${Object.keys(f).map(k => `.${k}`).join(' ')}）` };
    // Go's text/template (ErrorContext): the field's byte offset in its line (on the first line, in the template).
    const pos = m.index + 2 + m[1].length, lineStart = body.lastIndexOf('\n', pos - 1) + 1, line = 1 + (body.slice(0, pos).match(/\n/g)?.length ?? 0);
    return { text, error: `template: :${line}:${line === 1 ? pos : pos - lineStart}: executing "" at <.${name}>: can't evaluate field ${name} in type system.dockerInfo` };
  }
  return { text: text + body.slice(at) };
}

/**
 * Deletes a local image: its ID and the layers no other local image has (E20's images: one per pulled layer; a built image
 * shares its base's and its cached steps' layers). Docker Hub's images stay pullable; a built image is gone.
 */
function deleteImage(d: DockerState, img: DockerImage): { d: DockerState; deleted: string[]; freed: number } {
  const others = d.images.filter(i => i !== img && i.local && i.id !== img.id);
  const kept = new Set(others.flatMap(chainOf)), sizes = layerSizesOf(img);
  const layers = chainOf(img).map((id, k) => ({ id, size: sizes[k] ?? 0 })).filter(l => !kept.has(l.id));
  const images = d.images.flatMap(i => i !== img ? [i] : i.pullable ? [{ ...i, local: false, dangling: undefined }] : []);
  return { d: { ...d, images }, deleted: [img.id, ...layers.map(l => l.id)], freed: layers.reduce((n, l) => n + l.size, 0) };
}

/** docker ps's STATUS: Created, Up …, Exited (N) … ago (moby's State.String). */
export function statusText(c: DockerContainer, now: Seconds): string {
  if (c.status === 'running') return `Up ${humanDuration(now - (c.started ?? c.created))}`;
  if (c.status === 'created' || c.started === undefined) return 'Created';
  return `Exited (${c.exitCode}) ${humanDuration(now - (c.finished ?? now))} ago`;
}

/** docker pull: the layers as a terminal shows them when they are done, the digest and the status. */
function pull(d: DockerState, ref: ImageRef, typed: string, now: Seconds): { d: DockerState; lines: string[] } | { error: string } {
  void now;
  const remote = d.images.find(i => i.pullable && i.repo === ref.repo && i.tag === ref.tag);
  if (!remote) {
    const known = d.images.some(i => i.pullable && i.repo === ref.repo);
    return { error: known ? `Error response from daemon: manifest for ${refText(ref)} not found: manifest unknown: manifest unknown`
      : `Error response from daemon: pull access denied for ${ref.repo}, repository does not exist or may require 'docker login': denied: requested access to the resource is denied` };
  }
  const lines = [...!typed.includes(':') || typed.lastIndexOf(':') < typed.lastIndexOf('/') ? ['Using default tag: latest'] : [], `${ref.tag}: Pulling from ${remoteName(ref.repo)}`];
  // Fix (E20): an untagged (dangling) copy is tagged again; its layers are already there.
  if (remote.local && remote.dangling) {
    for (let k = 0; k < remote.layers; k++) lines.push(`${hex(`layer/${remote.repo}:${remote.tag}/${k}`).slice(0, 12)}: Already exists`);
    lines.push(`Digest: sha256:${remote.digest}`, `Status: Downloaded newer image for ${refText(ref)}`);
    return { d: { ...d, images: d.images.map(i => i === remote ? { ...i, dangling: undefined } : i) }, lines };
  }
  if (remote.local) return { d, lines: [...lines, `Digest: sha256:${remote.digest}`, `Status: Image is up to date for ${refText(ref)}`] };
  for (let k = 0; k < remote.layers; k++) lines.push(`${hex(`layer/${remote.repo}:${remote.tag}/${k}`).slice(0, 12)}: Pull complete`);
  lines.push(`Digest: sha256:${remote.digest}`, `Status: Downloaded newer image for ${refText(ref)}`);
  return { d: { ...d, images: d.images.map(i => i === remote ? { ...i, local: true } : i) }, lines };
}

// ----------------------------------------------------------------------------------------------------- formats and templates

type Fields = Record<string, string>;
/** --format: "table …" prints a header and tabwriter columns; otherwise each row is the template's text. */
export function formatted(format: string, rows: readonly Fields[], headers: Fields): { lines: string[] } | { error: string } {
  const table = format.startsWith('table');
  const body = (table ? format.slice(5).replace(/^\s/, '') : format).replace(/\\t/g, '\t').replace(/\\n/g, '\n');
  const fill = (f: Fields): string | { error: string } => {
    let bad: string | undefined;
    const text = body.replace(/\{\{\s*\.(\w+)\s*\}\}/g, (_, k: string) => { if (!(k in f)) bad ??= k; return f[k] ?? ''; });
    if (bad) return { error: `template: :1: executing "" at <.${bad}>: can't evaluate field ${bad}（模擬環境支援的欄位：${Object.keys(f).join('、')}）` };
    if (/\{\{/.test(text)) return { error: '模擬環境的 --format 只支援 {{.欄位}}（不支援函式與 json）' };
    return text;
  };
  if (!table) {
    const lines: string[] = [];
    for (const r of rows) { const t = fill(r); if (typeof t !== 'string') return t; lines.push(...t.split('\n')); }
    return { lines };
  }
  const head = fill(headers);
  if (typeof head !== 'string') return head;
  const cells: string[][] = [head.split('\t')];
  for (const r of rows) { const t = fill(r); if (typeof t !== 'string') return t; cells.push(t.split('\t')); }
  return { lines: tabwrite(cells).map(l => l.replace(/\s+$/, '')) };
}

/** The fields of docker inspect the simulation models (real ones have the same names). */
function inspectContainer(c: DockerContainer, img: DockerImage | undefined, e21 = false): Record<string, unknown> {
  const exposed = Object.fromEntries([...new Set([...img?.expose ?? []].map(p => `${p}/tcp`))].map(k => [k, {}]));
  const bindings: Record<string, { HostIp: string; HostPort: string }[]> = {};
  for (const b of c.ports) (bindings[`${b.container}/${b.proto}`] ??= []).push({ HostIp: b.hostIp === '0.0.0.0' ? '' : b.hostIp, HostPort: String(b.host) });
  const ports: Record<string, { HostIp: string; HostPort: string }[] | null> = {};
  if (c.status === 'running') {
    for (const k of Object.keys(exposed)) ports[k] = null;
    for (const b of c.ports) (ports[`${b.container}/${b.proto}`] ??= [])!.push(...(b.hostIp === '0.0.0.0' ? [{ HostIp: '0.0.0.0', HostPort: String(b.host) }, { HostIp: '::', HostPort: String(b.host) }] : [{ HostIp: b.hostIp, HostPort: String(b.host) }]));
  }
  return {
    Id: c.id, Created: rfc3339(c.created), Path: c.path, Args: c.args,
    State: { Status: c.status, Running: c.status === 'running', Paused: false, Restarting: false, OOMKilled: false, Dead: false, ExitCode: c.exitCode, Error: '', StartedAt: rfc3339(c.started), FinishedAt: rfc3339(c.finished) },
    Image: `sha256:${c.image}`, Name: `/${c.name}`, RestartCount: 0,
    HostConfig: { PortBindings: bindings, AutoRemove: c.rm },
    Config: { Hostname: short(c.id), Env: configEnv(c, img), Cmd: c.cmd, Image: c.ref, WorkingDir: c.workdir, Entrypoint: img?.entrypoint.length ? img.entrypoint : null, ExposedPorts: exposed, Tty: c.tty, OpenStdin: c.interactive,
      ...e21 ? { User: c.user ?? '', Labels: img?.labels && Object.keys(img.labels).length ? img.labels : null } : {} },
    NetworkSettings: { IPAddress: c.ip ?? '', Gateway: c.ip ? BRIDGE_GATEWAY : '', Ports: ports },
  };
}
/** E22: docker inspect of a container on the storage-net profile: E21's fields with Mounts, the network mode and each network's endpoint. */
function inspectContainer22(d: DockerState, c: DockerContainer): Record<string, unknown> {
  const img = imageById(d, c.image), base = inspectContainer(c, img, true) as { HostConfig: Record<string, unknown>; Config: Record<string, unknown>; NetworkSettings: Record<string, unknown> };
  const mounts = mountsJson(c).map(m => { STRUCTS.add(m); return m; }), networks = networksJson(d, c);
  POINTERS.add(networks);
  const binds = (c.mounts ?? []).filter(m => m.via === 'v' && !m.anonymous).map(m => `${m.source}:${m.target}${m.readonly ? ':ro' : ''}`);
  return {
    ...base, Mounts: mounts,
    HostConfig: { ...base.HostConfig, Binds: binds.length ? binds : null, NetworkMode: Object.keys(c.networks ?? { bridge: {} })[0] === 'bridge' ? 'bridge' : Object.keys(c.networks ?? {})[0] ?? 'bridge' },
    Config: { ...base.Config, Hostname: c.hostname ?? short(c.id), Volumes: img?.volumes?.length ? Object.fromEntries(img.volumes.map(v => [v, {}])) : null },
    NetworkSettings: { ...base.NetworkSettings, Networks: networks },
  };
}
function inspectImage22(i: DockerImage, tags: string[]): Record<string, unknown> {
  const base = inspectImage(i, true, tags) as { Config: Record<string, unknown> };
  return { ...base, Config: { ...base.Config, Volumes: i.volumes?.length ? Object.fromEntries(i.volumes.map(v => [v, {}])) : null } };
}
function inspectImage(i: DockerImage, e21 = false, tags: string[] = []): Record<string, unknown> {
  const exposed = Object.fromEntries(i.expose.map(p => [`${p}/tcp`, {}]));
  if (!e21) return {
    Id: `sha256:${i.id}`, RepoTags: i.dangling ? [] : [refText(i)], RepoDigests: i.dangling ? [] : [`${i.repo}@sha256:${i.digest}`], Created: rfc3339(i.created), Size: i.size, Os: 'linux', Architecture: 'amd64',
    Config: { Env: i.env, Cmd: i.cmd, Entrypoint: i.entrypoint.length ? i.entrypoint : null, WorkingDir: i.workdir, ExposedPorts: exposed },
  };
  // E21: every tag of the image, no digest for a built image (never pushed), USER, labels and the layers' diff IDs.
  return {
    Id: `sha256:${i.id}`, RepoTags: tags, RepoDigests: i.dangling || i.built ? [] : [`${i.repo}@sha256:${i.digest}`], Created: rfc3339(i.created), Size: i.size, Os: 'linux', Architecture: 'amd64',
    Config: { User: i.user ?? '', ExposedPorts: Object.keys(exposed).length ? exposed : null, Env: i.env, Cmd: i.cmd.length ? i.cmd : null, Entrypoint: i.entrypoint.length ? i.entrypoint : null, WorkingDir: i.workdir === '/' ? '' : i.workdir, Labels: i.labels && Object.keys(i.labels).length ? i.labels : null },
    RootFS: { Type: 'layers', Layers: rootfsOf(i).map(x => `sha256:${x}`) },
  };
}
/** How Go's text/template prints a value decoded from JSON (docker inspect decodes into maps). */
export function goText(v: unknown): string {
  if (v === null || v === undefined) return '<no value>';
  if (Array.isArray(v)) return `[${v.map(goText).join(' ')}]`;
  if (typeof v === 'object') return `map[${Object.keys(v as object).sort().map(k => `${k}:${goText((v as Record<string, unknown>)[k])}`).join(' ')}]`;
  return String(v);
}
/** docker inspect -f: {{.A.B}}, {{json .A}} and literal text; anything else is explained. */
function template(format: string, o: Record<string, unknown>): { text: string } | { error: string } {
  let bad: string | undefined;
  const text = format.replace(/\\n/g, '\n').replace(/\{\{\s*(json\s+)?((?:\.[A-Za-z]\w*)+|\.)\s*\}\}/g, (_, json: string | undefined, path: string) => {
    let v: unknown = o;
    for (const key of path.split('.').filter(Boolean)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && key in (v as object)) v = (v as Record<string, unknown>)[key];
      else { bad ??= path; return ''; }
    }
    return json ? JSON.stringify(v) : goText(v);
  });
  if (bad) return { error: `docker inspect：模擬環境沒有 ${bad} 這個欄位（模擬的欄位：.Id .Name .Created .Image .Path .Args .State.Status .State.Running .State.ExitCode .State.StartedAt .State.FinishedAt .Config.Image .Config.Cmd .Config.Env .NetworkSettings.IPAddress .HostConfig.PortBindings…）` };
  if (/\{\{/.test(text)) return { error: 'docker inspect：模擬環境的 --format 只支援 {{.欄位}} 與 {{json .欄位}}' };
  return { text };
}

// ----------------------------------------------------------------------------------------------------- HTTP through a published port

const nginxTime = (t: Seconds) => { const f = fields(t); const two = (n: number) => String(n).padStart(2, '0'); return `${two(f.day)}/${MONTHS[f.month]}/${f.year}:${two(f.hour)}:${two(f.minute)}:${two(f.second)} +0000`; };
/**
 * A request a container's service answered (through docker-proxy, so it comes from the bridge's gateway, 172.17.0.1): with
 * accessLog 'nginx' the official nginx image's access line goes to the container's standard output (docker logs).
 */
export function containerAccess(host: FsState, r: Responder, req: Request, res: Response, now: Seconds, client?: string): FsState {
  const d = host.docker;
  if (!d || !r.container) return host;
  const c = d.containers.find(x => x.id === r.container);
  const img = c ? imageById(d, c.image) : undefined;
  if (!c || (c.http ?? img?.http)?.accessLog !== 'nginx') return host;
  const h = (name: string) => req.headers.find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1];
  const size = req.method === 'HEAD' ? 0 : new TextEncoder().encode(res.body).length;
  // E22: a request from another container (or with --network host) shows its client; docker-proxy's comes from the network's gateway.
  const from = r.direct && client ? client : r.via ?? BRIDGE_GATEWAY;
  const line = `${from} - - [${nginxTime(now)}] "${req.method} ${req.path} HTTP/${req.version ?? '1.1'}" ${res.status} ${size} "${h('Referer') ?? '-'}" "${h('User-Agent') ?? '-'}" "${h('X-Forwarded-For') ?? '-'}"`;
  return { ...host, docker: { ...d, containers: d.containers.map(x => x.id === c.id ? { ...x, logs: [...x.logs, { t: now, stream: 1 as const, text: line }].slice(-500) } : x) } };
}

export { proxyName as DOCKER_PROXY };
