/*
 * P7 Linux Terminal Simulator: a virtual file system held in memory (docs/planning/P7_SYSTEMS_LABS.md). Pure data and
 * pure functions: nothing here touches the host file system, the network or a real shell, and every operation returns
 * a new state instead of changing the old one, so a reset is just the initial state again.
 *
 * Paths are absolute, normalized strings ('/home/learner/notes.txt'). Permissions follow the owner / group / other bits
 * of a Unix mode. LNX-0 (2026-11-22): a node may name its group (default: its owner, like a user private group) and a
 * state may name the user's groups (default: only the user's own); the group bits decide only for a user in the node's
 * group, so with the defaults (the lab: one learner and root) they never decide anything, exactly as before.
 *
 * Engine stage E1 (docs/curriculum/LNX0_TERMINAL_CAPABILITY.md §9): a node may be a symbolic link (kind 'link' with the
 * target text exactly as written), and a state may describe its system (uname) and its mount table (df). The lab never
 * has either: only the E1 profile can create a link, and only a lesson machine on that profile may declare them.
 *
 * Engine stage E3 (§11): a state may carry its user and group database (accounts: /etc/passwd and /etc/group as data)
 * and a umask. `groups` is then the session's groups as they were at login (the kernel's view: joining a group takes
 * effect at the next login or with newgrp, as on Linux). Only the users profile's machines have them.
 *
 * Engine stages E4–E6 (§12–§14): a state may carry the last exit status, a fixed clock, a process table and jobs
 * (processes.ts), a package database (packages.ts), and systemd's loaded units, their run state and the journal
 * (services.ts). Only machines of the processes, packages and services profiles have them.
 *
 * Engine stages E7–E9 (§15–§17): a state may carry the other machines of the lesson (each a whole state of its own,
 * reached with ssh), an ssh session in progress, a remote machine's sshd, the interactive shell's variables and functions
 * (the scripting profile) and a time zone (the scheduling profile).
 *
 * Engine stages E10–E12 (docs/curriculum/SRV0_SERVER_CAPABILITY.md §6–§8): a state may carry its interfaces and
 * connections (sockets), its DNS (resolver cache, named's zones) and its HTTP responders. Only the sockets, dns and http
 * profiles' machines have them.
 */

import type { Clock, Job, Proc } from './processes';
import type { PackageDb } from './packages';
import type { JournalEntry, ServiceDb } from './services';
import type { Network, SshdState } from './ssh';
import type { ShellMemory } from './script';
import type { SocketState } from './sockets';
import type { DnsState } from './dns';
import type { Responder } from './http';
import type { NginxState } from './nginx';
import type { FirewallState } from './firewall';
import type { EdgeState } from './cache';
import type { LinkState } from './diag';
import type { DockerState } from './docker';
import type { GitState } from './git-state';

export interface FsNode {
  /** E1: 'link' is a symbolic link (the lab never has one). */
  kind: 'dir' | 'file' | 'link';
  /** Permission bits, e.g. 0o755. */
  mode: number;
  owner: string;
  /** LNX-0: the node's group; when absent, the owner's name (a user private group). */
  group?: string;
  /** Files only. */
  content?: string;
  /** E1, links only: where the link points, as written (relative targets are relative to the link's folder). */
  target?: string;
  /**
   * E18 (the edge profile and above, files only): when the content last changed (seconds, the machine's clock). Absent:
   * the machine's boot time. nginx's Last-Modified and ETag read it; lower profiles never set it.
   */
  mtime?: number;
}

/** E1: what uname prints; every field has a default (DEFAULT_SYSTEM). No dates: the kernel version is a fixed string. */
export interface SystemInfo {
  /** uname -s, e.g. Linux. */
  kernel: string;
  /** uname -r, e.g. 6.8.0-45-generic. */
  release: string;
  /** uname -v, e.g. #45-Ubuntu SMP PREEMPT_DYNAMIC (fixed text, never a clock). */
  version: string;
  /** uname -m, e.g. x86_64 or aarch64. */
  machine: string;
  /** uname -o, e.g. GNU/Linux. */
  os: string;
}
export const DEFAULT_SYSTEM: SystemInfo = { kernel: 'Linux', release: '6.8.0-sim', version: '#1 SMP PREEMPT_DYNAMIC', machine: 'x86_64', os: 'GNU/Linux' };

/** E1: one mounted file system for df. Sizes are in 1K blocks (KiB) and fixed: they do not follow the simulated files. */
export interface Mount {
  /** The mount point, a folder of the machine. */
  path: string;
  /** The Filesystem column, e.g. /dev/sda1 or tmpfs. */
  device: string;
  /** The file system type (df -T), e.g. ext4. */
  type: string;
  size: number;
  used: number;
}

/** E3: one line of /etc/passwd. */
export interface Account {
  name: string;
  uid: number;
  /** The primary group's id. */
  gid: number;
  /** The GECOS field (a comment such as a full name). */
  comment: string;
  home: string;
  shell: string;
}
/** E3: one line of /etc/group; members are the users who have it as a supplementary group. */
export interface GroupEntry { name: string; gid: number; members: readonly string[] }
/** E3: the user and group database, in file order. */
export interface Accounts { users: readonly Account[]; groups: readonly GroupEntry[] }

export interface FsState {
  nodes: ReadonlyMap<string, FsNode>;
  cwd: string;
  user: string;
  home: string;
  /** LNX-0: the machine's host name in the prompt; when absent, logic-island. */
  host?: string;
  /** LNX-0: the groups the user belongs to; when absent, only the group named after the user. */
  groups?: readonly string[];
  /** E1: uname's fields over DEFAULT_SYSTEM. */
  system?: Partial<SystemInfo>;
  /** E1: the mount table df reads, in the order df lists it. */
  mounts?: readonly Mount[];
  /** E3: the user and group database (the users profile). */
  accounts?: Accounts;
  /** E3: the session's umask (the users profile); new files are 666 & ~umask, new folders 777 & ~umask. Default 022. */
  umask?: number;
  /** E4: the exit status of the last command line ($?), from the processes profile up. */
  status?: number;
  /** E4: the machine's fixed clock, load average and memory. */
  clock?: Clock;
  /** E4: the process table. */
  processes?: readonly Proc[];
  /** E4: the last pid handed out (new processes get the next one; pids are never reused). */
  lastPid?: number;
  /** E4: the session's background jobs (sleep N &). */
  jobs?: readonly Job[];
  /** E5: repositories, available and installed packages, holds. */
  packages?: PackageDb;
  /** E6: what systemd has loaded, each unit's run state, and the programs services run. */
  services?: ServiceDb;
  /** E6: the journal, oldest first. */
  journal?: readonly JournalEntry[];
  /** E7: this machine's address and the lesson's other machines (each a whole state), reachable with ssh. */
  net?: Network;
  /** E7: an interactive ssh session in progress: the commands run on this host (as typed: its name, alias or address). */
  session?: { host: string; name: string };
  /** E7: on a remote machine during an interactive ssh session: the machine the user came from. */
  login?: string;
  /** E7: exit in an ssh session: the status the session ended with (read and cleared at once). */
  logout?: number;
  /** E7: a remote machine's sshd: its host key and the configuration it runs with (applied at start and reload). */
  sshd?: SshdState;
  /** E8: the interactive shell's variables, functions and options (the scripting profile). */
  shell?: ShellMemory;
  /** E9: the machine's time zone and whether it can send mail (an MTA for cron's output). */
  schedule?: { timezone: string; mta: boolean };
  /** E10: the machine's interfaces, default route and declared connections (listening sockets come from its processes). */
  sockets?: SocketState;
  /** E11: the resolver cache, the zones named loaded, the internet's zones (the lesson's local machine). */
  dns?: DnsState;
  /** E12: the HTTP responders its listening sockets name. */
  http?: { responders: readonly Responder[]; /** E18: the machine has the edge profile (validators, conditional requests, CDN responders). */ edge?: true };
  /** E13: certbot's settings (the lifetime Let's Encrypt gives) and how many ACME orders it has made (the challenge tokens). */
  tls?: TlsState;
  /** E14: the configuration the running nginx applied and its connection counter. */
  nginx?: NginxState;
  /** E16: the machine's firewall (ufw and the nftables ruleset); only machines of the firewall profile have one. */
  firewall?: FirewallState;
  /** E18: the CDN edge caches of its responders (responder id → entries). */
  edge?: EdgeState;
  /** E18–E19: how far the machine is from the others (latency, ms) and, E19, the declared paths of hops to destinations. */
  links?: LinkState;
  /** E20: the Docker daemon's images, containers and the simulated Docker Hub (only machines of the containers profile have one). */
  docker?: DockerState;
  /** E25: Git's objects, the machine's repositories (their worktrees are its files) and the simulated forge's bare repositories. */
  git?: GitState;
}
/** E13: what certbot keeps (the simulated CA's certificate lifetime in days, its order counter). */
export interface TlsState { lifetime: number; orders: number }

export const DEFAULT_HOST = 'logic-island';
/** The node's group: its own, or its owner's name. */
export const groupOf = (node: FsNode) => node.group ?? node.owner;
/** The groups of the state's user: its own list, or the group named after the user. */
export const groupsOf = (state: Pick<FsState, 'user' | 'groups'>): readonly string[] => state.groups ?? [state.user];

/** Hard limits that keep the simulation small whatever the learner types. */
export const LIMITS = { nodes: 400, nameLength: 64, depth: 16, fileLength: 4000, input: 500, output: 20000, stages: 8, users: 64, groups: 64 } as const;

export const USER = 'learner';
export const HOME = `/home/${USER}`;

const dir = (owner: string, mode = 0o755): FsNode => ({ kind: 'dir', mode, owner });
const file = (owner: string, content: string, mode = 0o644): FsNode => ({ kind: 'file', mode, owner, content });

/** The starting machine: a few system folders owned by root and the learner's home. */
export function initialState(): FsState {
  const nodes = new Map<string, FsNode>([
    ['/', dir('root')],
    ['/bin', dir('root')],
    ['/etc', dir('root')],
    ['/etc/hostname', file('root', 'logic-island\n')],
    ['/etc/os-release', file('root', 'NAME="Logic Island Linux"\nVERSION="1.0 (Simulator)"\nID=logic-island\n')],
    ['/etc/shadow', file('root', 'root:*:20000:0:99999:7:::\n', 0o600)],
    ['/home', dir('root')],
    [HOME, dir(USER)],
    [`${HOME}/README.txt`, file(USER, '歡迎來到 Logic Island 的模擬終端機。\n這裡的檔案都只存在瀏覽器的記憶體中，按「重設環境」就會回到最初的樣子。\n輸入 help 查看可用的指令。\n')],
    [`${HOME}/secret.txt`, file(USER, '這是一份只應該讓自己讀寫的筆記。\n')],
    [`${HOME}/scripts`, dir(USER)],
    [`${HOME}/scripts/deploy.sh`, file(USER, '#!/bin/bash\necho "deploying..."\n')],
    [`${HOME}/tmp`, dir(USER)],
    [`${HOME}/tmp/cache-1.log`, file(USER, 'cache entry 1\n')],
    [`${HOME}/tmp/cache-2.log`, file(USER, 'cache entry 2\n')],
    ['/tmp', dir('root', 0o777)],
    ['/var', dir('root')],
    ['/var/log', dir('root')],
    ['/var/log/syslog', file('root', 'Nov 12 09:00:01 logic-island systemd[1]: Started Daily cleanup.\n', 0o640)],
  ]);
  return { nodes, cwd: HOME, user: USER, home: HOME };
}

/** Resolves a path against the working directory: ~, ., .. and repeated slashes; never above /. */
export function resolvePath(state: Pick<FsState, 'cwd' | 'home'>, input: string): string {
  const raw = input === '~' ? state.home : input.startsWith('~/') ? state.home + input.slice(1) : input;
  const parts = (raw.startsWith('/') ? raw : `${state.cwd}/${raw}`).split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return '/' + out.join('/');
}

export const parentOf = (path: string) => path === '/' ? '/' : path.slice(0, path.lastIndexOf('/')) || '/';
export const baseName = (path: string) => path === '/' ? '/' : path.slice(path.lastIndexOf('/') + 1);
export const joinPath = (dirPath: string, name: string) => dirPath === '/' ? `/${name}` : `${dirPath}/${name}`;
export const depthOf = (path: string) => path === '/' ? 0 : path.split('/').length - 1;
export const isInside = (path: string, ancestor: string) => ancestor === '/' ? true : path === ancestor || path.startsWith(`${ancestor}/`);

/** The direct children of a folder, sorted by name. */
export function childrenOf(nodes: ReadonlyMap<string, FsNode>, dirPath: string): string[] {
  const prefix = dirPath === '/' ? '/' : `${dirPath}/`;
  return [...nodes.keys()].filter(p => p !== '/' && p.startsWith(prefix) && !p.slice(prefix.length).includes('/')).sort();
}

/** Every path at or under a folder (the folder first). */
export const subtreeOf = (nodes: ReadonlyMap<string, FsNode>, path: string) => [...nodes.keys()].filter(p => isInside(p, path)).sort();

export type Access = 'r' | 'w' | 'x';
const BIT: Record<Access, number> = { r: 4, w: 2, x: 1 };

/**
 * Whether the user may read, write or execute a node: root may do anything, the owner uses the owner bits, a member of
 * the node's group the group bits, others the other bits. `groups` defaults to the group named after the user, so with a
 * node's default group (its owner) the group bits decide nothing (LNX-0 keeps the lab's behaviour).
 */
export function can(node: FsNode, user: string, access: Access, groups: readonly string[] = [user]): boolean {
  if (user === 'root') return true;
  const bits = node.owner === user ? (node.mode >> 6) & 7 : groups.includes(groupOf(node)) ? (node.mode >> 3) & 7 : node.mode & 7;
  return (bits & BIT[access]) !== 0;
}

/** rwxr-xr-x for 0o755, with the leading d, l (E1: a symbolic link) or -. */
export function modeString(node: FsNode): string {
  const triad = (bits: number) => `${bits & 4 ? 'r' : '-'}${bits & 2 ? 'w' : '-'}${bits & 1 ? 'x' : '-'}`;
  return (node.kind === 'dir' ? 'd' : node.kind === 'link' ? 'l' : '-') + triad((node.mode >> 6) & 7) + triad((node.mode >> 3) & 7) + triad(node.mode & 7);
}

/** A valid file or folder name: not empty, no slash, not . or .., at most LIMITS.nameLength characters. */
export const validName = (name: string) => !!name && name !== '.' && name !== '..' && !name.includes('/') && name.length <= LIMITS.nameLength;

/** E1: Linux follows at most 40 symbolic links while resolving one path (MAXSYMLINKS); more is ELOOP. */
export const MAX_LINK_HOPS = 40;

/** E1: the absolute, normalized path a link's target names (relative to the folder that holds the link; ~ is not special). */
export const linkTarget = (folder: string, target: string) => resolvePath({ cwd: '/', home: '/' }, target.startsWith('/') ? target : `${folder}/${target}`);

/**
 * E1: the path with each symbolic link on the way replaced by where it points (the last part too when `follow`). Parts
 * that do not exist are kept as written, and nothing checks permissions: this only names the real node a command works
 * on. Without links (the lab) it returns the path unchanged.
 */
export function physicalPath(nodes: ReadonlyMap<string, FsNode>, path: string, follow = false): string {
  const rest = path.split('/').filter(Boolean);
  let at = '/', hops = 0;
  while (rest.length) {
    const next = joinPath(at, rest.shift()!), node = nodes.get(next);
    if (node?.kind === 'link' && (rest.length || follow) && hops < MAX_LINK_HOPS) {
      hops++;
      rest.unshift(...linkTarget(at, node.target ?? '').split('/').filter(Boolean));
      at = '/';
      continue;
    }
    at = next;
  }
  return at;
}

/**
 * E1: a size the way GNU ls -h, df -h and du -h print it: powers of 1024, rounded up, one decimal below 10
 * (4096 → 4.0K, 1536 → 1.5K, 12288 → 12K, 1000 → 1000).
 */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return String(bytes);
  const units = ['K', 'M', 'G', 'T', 'P'];
  let e = 0, unit = 1024;
  while (bytes >= unit * 1024 && e < units.length - 1) { unit *= 1024; e++; }
  const tenths = Math.ceil(bytes * 10 / unit);
  if (tenths < 100) return `${Math.floor(tenths / 10)}.${tenths % 10}${units[e]}`;
  const whole = Math.ceil(bytes / unit);
  return whole < 1024 || e === units.length - 1 ? `${whole}${units[e]}` : `1.0${units[e + 1]}`;
}
