/*
 * P7 Linux Terminal Simulator: a virtual file system held in memory (docs/planning/P7_SYSTEMS_LABS.md). Pure data and
 * pure functions: nothing here touches the host file system, the network or a real shell, and every operation returns
 * a new state instead of changing the old one, so a reset is just the initial state again.
 *
 * Paths are absolute, normalized strings ('/home/learner/notes.txt'). Permissions follow the owner / group / other bits
 * of a Unix mode. LNX-0 (2026-11-22): a node may name its group (default: its owner, like a user private group) and a
 * state may name the user's groups (default: only the user's own); the group bits decide only for a user in the node's
 * group, so with the defaults (the lab: one learner and root) they never decide anything, exactly as before.
 */

export interface FsNode {
  kind: 'dir' | 'file';
  /** Permission bits, e.g. 0o755. */
  mode: number;
  owner: string;
  /** LNX-0: the node's group; when absent, the owner's name (a user private group). */
  group?: string;
  /** Files only. */
  content?: string;
}

export interface FsState {
  nodes: ReadonlyMap<string, FsNode>;
  cwd: string;
  user: string;
  home: string;
  /** LNX-0: the machine's host name in the prompt; when absent, logic-island. */
  host?: string;
  /** LNX-0: the groups the user belongs to; when absent, only the group named after the user. */
  groups?: readonly string[];
}

export const DEFAULT_HOST = 'logic-island';
/** The node's group: its own, or its owner's name. */
export const groupOf = (node: FsNode) => node.group ?? node.owner;
/** The groups of the state's user: its own list, or the group named after the user. */
export const groupsOf = (state: Pick<FsState, 'user' | 'groups'>): readonly string[] => state.groups ?? [state.user];

/** Hard limits that keep the simulation small whatever the learner types. */
export const LIMITS = { nodes: 400, nameLength: 64, depth: 16, fileLength: 4000, input: 500 } as const;

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

/** rwxr-xr-x for 0o755, with the leading d or -. */
export function modeString(node: FsNode): string {
  const triad = (bits: number) => `${bits & 4 ? 'r' : '-'}${bits & 2 ? 'w' : '-'}${bits & 1 ? 'x' : '-'}`;
  return (node.kind === 'dir' ? 'd' : '-') + triad((node.mode >> 6) & 7) + triad((node.mode >> 3) & 7) + triad(node.mode & 7);
}

/** A valid file or folder name: not empty, no slash, not . or .., at most LIMITS.nameLength characters. */
export const validName = (name: string) => !!name && name !== '.' && name !== '..' && !name.includes('/') && name.length <= LIMITS.nameLength;
