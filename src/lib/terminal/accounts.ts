import type { Account, Accounts, FsNode, FsState, GroupEntry } from './fs';

/*
 * Engine stage E3 (docs/curriculum/LNX0_TERMINAL_CAPABILITY.md §11): the user and group database of a simulated machine.
 * Accounts are data (FsState.accounts); /etc/passwd, /etc/group and /etc/shadow are generated from it whenever it
 * changes, so cat, grep and cut read real-looking files while the commands (useradd, usermod, groupadd, id, groups,
 * sudo, chown) work on the data. Pure: every function returns new values. No passwords exist: /etc/shadow has `*` for
 * system accounts and `!` (locked) for the others, and a fixed day number instead of a date.
 */

/** A valid user or group name (shadow-utils' default rule, lowercase). */
export const ACCOUNT_NAME = /^[a-z_][a-z0-9_-]{0,31}$/;
/** The last day a password was changed, as days since 1970 (fixed: the simulation has no clock). */
export const SHADOW_DAY = 20000;
/** Ids from here up are ordinary accounts (login.defs UID_MIN / GID_MIN); below are system accounts. */
export const FIRST_ID = 1000;
const LAST_ID = 59999;
const LAST_SYSTEM_ID = 999;
const FIRST_SYSTEM_ID = 100;
export const NOLOGIN = '/usr/sbin/nologin';

/** A small Ubuntu-like base: the system accounts every machine of the users profile starts with. */
export const BASE_USERS: readonly Account[] = [
  { name: 'root', uid: 0, gid: 0, comment: 'root', home: '/root', shell: '/bin/bash' },
  { name: 'daemon', uid: 1, gid: 1, comment: 'daemon', home: '/usr/sbin', shell: NOLOGIN },
  { name: 'bin', uid: 2, gid: 2, comment: 'bin', home: '/bin', shell: NOLOGIN },
  { name: 'sys', uid: 3, gid: 3, comment: 'sys', home: '/dev', shell: NOLOGIN },
  { name: 'www-data', uid: 33, gid: 33, comment: 'www-data', home: '/var/www', shell: NOLOGIN },
  { name: 'nobody', uid: 65534, gid: 65534, comment: 'nobody', home: '/nonexistent', shell: NOLOGIN },
];
export const BASE_GROUPS: readonly GroupEntry[] = [
  { name: 'root', gid: 0, members: [] },
  { name: 'daemon', gid: 1, members: [] },
  { name: 'bin', gid: 2, members: [] },
  { name: 'sys', gid: 3, members: [] },
  { name: 'adm', gid: 4, members: [] },
  { name: 'sudo', gid: 27, members: [] },
  { name: 'www-data', gid: 33, members: [] },
  { name: 'shadow', gid: 42, members: [] },
  { name: 'users', gid: 100, members: [] },
  { name: 'nogroup', gid: 65534, members: [] },
];

/** The base plus the logged-in user (uid and gid 1000, a private group, bash) when it is not one of them. */
export function defaultAccounts(user: string, home: string): Accounts {
  if (user === 'root' || BASE_USERS.some(u => u.name === user)) return { users: [...BASE_USERS], groups: [...BASE_GROUPS] };
  // As on Ubuntu, the first ordinary account comes after the system ones (nobody included).
  return {
    users: [...BASE_USERS, { name: user, uid: FIRST_ID, gid: FIRST_ID, comment: '', home, shell: '/bin/bash' }],
    groups: [...BASE_GROUPS, { name: user, gid: FIRST_ID, members: [] }],
  };
}

/** The state's database, or the default one built from its user. */
export const accountsOf = (state: Pick<FsState, 'accounts' | 'user' | 'home'>): Accounts => state.accounts ?? defaultAccounts(state.user, state.home);
export const findUser = (acc: Accounts, name: string) => acc.users.find(u => u.name === name);
export const findGroup = (acc: Accounts, name: string) => acc.groups.find(g => g.name === name);
export const groupById = (acc: Accounts, gid: number) => acc.groups.find(g => g.gid === gid);

/**
 * The groups a user gets at login (initgroups): the primary group first, then every group that lists the user as a
 * member, in /etc/group order. A primary group without an entry has no name and is left out.
 */
export function loginGroups(acc: Accounts, name: string): string[] {
  const user = findUser(acc, name);
  if (!user) return [name];
  const primary = groupById(acc, user.gid);
  return [...primary ? [primary.name] : [], ...acc.groups.filter(g => g !== primary && g.members.includes(name)).map(g => g.name)];
}

/** The next free id: ordinary ones after the highest in 1000..59999, system ones downwards from 999 (as useradd -r). */
export function nextId(used: readonly number[], system: boolean): number | undefined {
  const taken = new Set(used);
  if (system) {
    for (let id = LAST_SYSTEM_ID; id >= FIRST_SYSTEM_ID; id--) if (!taken.has(id)) return id;
    return undefined;
  }
  const top = Math.max(FIRST_ID - 1, ...used.filter(id => id >= FIRST_ID && id <= LAST_ID));
  return top < LAST_ID ? top + 1 : undefined;
}

export const passwdText = (acc: Accounts) => acc.users.map(u => `${u.name}:x:${u.uid}:${u.gid}:${u.comment}:${u.home}:${u.shell}\n`).join('');
export const groupText = (acc: Accounts) => acc.groups.map(g => `${g.name}:x:${g.gid}:${g.members.join(',')}\n`).join('');
export const shadowText = (acc: Accounts) => acc.users.map(u => `${u.name}:${u.uid < FIRST_ID || u.uid === 65534 ? '*' : '!'}:${SHADOW_DAY}:0:99999:7:::\n`).join('');

/**
 * Writes /etc/passwd (0644), /etc/group (0644) and /etc/shadow (0640 root:shadow, or 0600 without a shadow group) from
 * the database. Existing nodes keep their mode, owner and group; /etc is created (root, 0755) when it is missing.
 */
export function writeAccountFiles(nodes: Map<string, FsNode>, acc: Accounts): void {
  if (!nodes.has('/etc')) nodes.set('/etc', { kind: 'dir', mode: 0o755, owner: 'root' });
  const put = (path: string, content: string, fresh: FsNode) => {
    const old = nodes.get(path);
    nodes.set(path, old?.kind === 'file' ? { ...old, content } : { ...fresh, content });
  };
  put('/etc/passwd', passwdText(acc), { kind: 'file', mode: 0o644, owner: 'root' });
  put('/etc/group', groupText(acc), { kind: 'file', mode: 0o644, owner: 'root' });
  put('/etc/shadow', shadowText(acc), findGroup(acc, 'shadow') ? { kind: 'file', mode: 0o640, owner: 'root', group: 'shadow' } : { kind: 'file', mode: 0o600, owner: 'root' });
}

/** The account files a lesson machine may not list itself (they are generated). */
export const ACCOUNT_FILES = ['/etc/passwd', '/etc/group', '/etc/shadow'] as const;

/** umask's -S form: the permissions it leaves, e.g. u=rwx,g=rx,o=rx for 022. */
export function umaskSymbolic(mask: number): string {
  const keep = ~mask & 0o777;
  const part = (who: string, shift: number) => `${who}=${(keep >> shift) & 4 ? 'r' : ''}${(keep >> shift) & 2 ? 'w' : ''}${(keep >> shift) & 1 ? 'x' : ''}`;
  return [part('u', 6), part('g', 3), part('o', 0)].join(',');
}
