import { baseName, depthOf, groupOf, LIMITS, linkTarget, parentOf, resolvePath, subtreeOf, validName, type Accounts, type FsNode, type FsState, type GroupEntry, type Mount, type SystemInfo } from './fs';
import { ACCOUNT_FILES, ACCOUNT_NAME, defaultAccounts, findGroup, findUser, groupById, loginGroups, nextId, writeAccountFiles } from './accounts';
import { ALL_COMMANDS, commandNames, LAB_PROFILE, PROFILES, prompt, run, type Line, type ProfileId, type ShellProfile } from './shell';

/*
 * LNX-0 (2026-11-22): the terminal lesson capability (docs/curriculum/LNX0_TERMINAL_CAPABILITY.md). A Linux lesson
 * describes small machines (a user, a working directory, a host name and a list of files) as data; its examples are
 * fixed transcripts replayed on a machine, and its exercises are checked by replaying the learner's commands and testing
 * the resulting machine (files, modes, owners, contents, the working directory, what was printed). Everything is pure:
 * the same engine as the P7 lab (fs.ts, shell.ts), nothing touches the host, and the checks never look at how the
 * commands were written, only at what they did.
 *
 * Engine stage E1: a machine names its profile (default lab; 'files' is FILES_PROFILE), and only a files machine may have
 * symbolic links, system information (uname) and a mount table (df). Examples, exercises and the console use the profile
 * of their machine.
 *
 * Engine stages E2 and E3 (§10, §11): the profiles 'streams' (pipes and redirection) and 'users' (accounts) include
 * everything of the profiles below them. Only a users machine has a user and group database (accounts, laid over a small
 * Ubuntu-like base and written to /etc/passwd, /etc/group and /etc/shadow) and a umask, and only its exercises may check
 * users, groups and the umask. A variant may also change the host name and the uname fields.
 */

/** A file, folder or (from engine stage E1, not before) symbolic link of a machine. Paths are absolute and normalized. */
export interface TerminalFile {
  path: string;
  kind: 'dir' | 'file' | 'link';
  /** Permission bits, e.g. 0o644. */
  mode: number;
  owner: string;
  /** Default: the owner's name (a user private group). */
  group?: string;
  /** Files only; default empty. */
  content?: string;
  /** Links only (engine stage E1): where it points, as written; it may dangle. A link's mode is always 0o777. */
  target?: string;
}

/**
 * E3: a user of a users machine. A name of the base (root, daemon, bin, sys, www-data, nobody) or the machine's user
 * changes that account (unset fields keep its values); any other name is a new account and needs a uid. group is the
 * primary group's name (default: a group named after the user, created with the uid as its gid when it does not exist).
 */
export interface TerminalUser { name: string; uid?: number; group?: string; home?: string; shell?: string; comment?: string }
/** E3: a group of a users machine; a base group (root, adm, sudo, www-data, users…) is changed, any other needs a gid. */
export interface TerminalGroup { name: string; gid?: number; members?: string[] }

export interface TerminalMachine {
  id: string;
  title: string;
  /** Who is logged in; root's prompt ends in #. */
  user: string;
  /** Where the session starts. */
  cwd: string;
  /** Shown in the prompt; default logic-island. */
  host?: string;
  /** Default /home/<user> (/root for root); must be a folder of the machine. */
  home?: string;
  /** The user's groups; default only the group named after the user. */
  groups?: string[];
  /** Every file and folder but / (which is root's, 0755); each parent is listed before it is needed. */
  files: TerminalFile[];
  /** E1: which commands the session has; default lab (LAB_PROFILE). 'files' adds the E1 commands, globs and links. */
  profile?: ProfileId;
  /** E1 (files profile): what uname prints, over DEFAULT_SYSTEM. */
  system?: Partial<SystemInfo>;
  /** E1 (files profile): the mount table df prints; sizes in 1K blocks; must include /. */
  mounts?: Mount[];
  /** E3 (users profile): users and groups over the base database; the session's groups are the user's login groups. */
  accounts?: { users?: TerminalUser[]; groups?: TerminalGroup[] };
  /** E3 (users profile): the session's umask; default 0o022. */
  umask?: number;
}

/** One command of a transcript and exactly what the terminal prints for it (lines joined by \n; '' for nothing). */
export interface TerminalStep { command: string; output: string }
export interface TerminalExample { id: string; title: string; description: string; machine: string; steps: TerminalStep[] }

/**
 * What an exercise checks on the machine after the learner's commands. output: one of the learner's commands printed
 * exactly what the reference solution's last command prints on the same machine (with variants, on each of them too, so
 * a typed-in answer does not pass). unchanged: the path and everything under it are as they were at the start.
 */
export type TerminalCheck =
  | { kind: 'exists'; path: string; type?: 'file' | 'dir' }
  | { kind: 'absent'; path: string }
  | { kind: 'mode'; path: string; mode: number }
  | { kind: 'owner'; path: string; owner: string; group?: string }
  | { kind: 'content'; path: string; content: string }
  | { kind: 'cwd'; path: string }
  | { kind: 'output' }
  | { kind: 'unchanged'; path: string }
  /**
   * E1: the path is a symbolic link to the place this target names (relative targets count from the link's folder), so
   * reports/today.txt and /home/learner/reports/today.txt both pass for /home/learner/current.
   */
  | { kind: 'link'; path: string; target: string }
  /**
   * E3 (users machines): the account exists (absent: it does not) with these fields; groups are login groups the user
   * must have (the primary one counts), notGroups ones it must not have. Read from the database, so it holds without a
   * new login.
   */
  | { kind: 'user'; name: string; absent?: true; uid?: number; group?: string; groups?: string[]; notGroups?: string[]; shell?: string; home?: string }
  /** E3 (users machines): the group exists (absent: it does not) with this gid; members must be in it (as a login group). */
  | { kind: 'group'; name: string; absent?: true; gid?: number; members?: string[]; notMembers?: string[] }
  /** E3 (users machines): the session's umask at the end. */
  | { kind: 'umask'; umask: number };
export const TERMINAL_CHECK_KINDS = ['exists', 'absent', 'mode', 'owner', 'content', 'cwd', 'output', 'unchanged', 'link', 'user', 'group', 'umask'] as const satisfies readonly TerminalCheck['kind'][];

/**
 * The same machine with some files replaced or added (and, fix 5, another host name or other uname fields); the
 * learner's commands are replayed on it as well.
 */
export interface TerminalVariant { label: string; files: TerminalFile[]; host?: string; system?: Partial<SystemInfo> }

export interface TerminalExercise {
  id: string;
  title: string;
  machine: string;
  statement: string;
  checks: TerminalCheck[];
  /** A reference solution: commands that pass every check on the machine and on every variant. */
  solution: string[];
  /** Typical wrong attempts; each must fail the checks. */
  mistakes: { commands: string[]; why: string }[];
  variants?: TerminalVariant[];
  hints: string[];
  explanation: string;
}

export interface TerminalLessonContent { machines: TerminalMachine[]; examples: TerminalExample[]; exercises: TerminalExercise[] }

/** How large lesson data may be, on top of the engine's LIMITS. */
export const TERMINAL_LIMITS = { machines: 8, steps: 30, solution: 30, variants: 4, session: 300, mounts: 8, mountSize: 2 ** 36 } as const;

const NAME = /^[a-z_][a-z0-9_-]{0,31}$/;
const HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const normalized = (path: string) => path.startsWith('/') && resolvePath({ cwd: '/', home: '/' }, path) === path;
const homeOf = (machine: Pick<TerminalMachine, 'user' | 'home'>) => machine.home ?? (machine.user === 'root' ? '/root' : `/home/${machine.user}`);
/** E1: printable ASCII without leading or trailing spaces, 1..64 characters (uname fields). */
const SYSTEM_TEXT = /^[\x21-\x7e](?:[\x20-\x7e]{0,62}[\x21-\x7e])?$/;
const SYSTEM_FIELDS = ['kernel', 'release', 'version', 'machine', 'os'] as const satisfies readonly (keyof SystemInfo)[];

/** E1: the shell profile a machine's sessions use (lab unless it says files, streams or users). */
export const profileOf = (machine: Pick<TerminalMachine, 'profile'>): ShellProfile => PROFILES[machine.profile ?? 'lab'] ?? LAB_PROFILE;
/** Each profile includes the ones before it: files (E1) < streams (E2) < users (E3). */
const RANK: Record<ProfileId, number> = { lab: 0, files: 1, streams: 2, users: 3 };
const rankOf = (machine: Pick<TerminalMachine, 'profile'>) => RANK[machine.profile ?? 'lab'] ?? 0;

/** E3: a users machine's database: the base and its user (defaultAccounts) with the machine's groups and users laid over it. */
export function machineAccounts(machine: TerminalMachine): Accounts {
  const base = defaultAccounts(machine.user, homeOf(machine));
  const groups: GroupEntry[] = [...base.groups], users = [...base.users];
  for (const g of machine.accounts?.groups ?? []) {
    const at = groups.findIndex(x => x.name === g.name), old = groups[at];
    const entry = { name: g.name, gid: g.gid ?? old?.gid ?? 0, members: [...g.members ?? old?.members ?? []] };
    if (at >= 0) groups[at] = entry; else groups.push(entry);
  }
  for (const u of machine.accounts?.users ?? []) {
    const at = users.findIndex(x => x.name === u.name), old = users[at];
    const uid = u.uid ?? old?.uid ?? 0;
    const groupName = u.group ?? (old ? groupById({ users, groups }, old.gid)?.name : undefined) ?? u.name;
    // A user private group, with the uid as its gid when that is free (as useradd makes it).
    if (!groups.some(g => g.name === groupName)) groups.push({ name: groupName, gid: groups.some(g => g.gid === uid) ? nextId(groups.map(g => g.gid), uid < 1000) ?? uid : uid, members: [] });
    const entry = {
      name: u.name, uid, gid: groups.find(g => g.name === groupName)!.gid, comment: u.comment ?? old?.comment ?? '',
      home: u.home ?? old?.home ?? `/home/${u.name}`, shell: u.shell ?? old?.shell ?? '/bin/bash',
    };
    if (at >= 0) users[at] = entry; else users.push(entry);
  }
  return { users, groups };
}

/** The machine as an engine state: / plus its files, its user, groups, host, home and working directory. */
export function machineState(machine: TerminalMachine): FsState {
  const nodes = new Map<string, FsNode>([['/', { kind: 'dir', mode: 0o755, owner: 'root' }]]);
  for (const f of machine.files) {
    nodes.set(f.path, {
      kind: f.kind === 'dir' ? 'dir' : f.kind === 'link' ? 'link' : 'file', mode: f.kind === 'link' ? 0o777 : f.mode, owner: f.owner,
      ...(f.group !== undefined ? { group: f.group } : {}), ...(f.kind === 'file' ? { content: f.content ?? '' } : {}),
      ...(f.kind === 'link' ? { target: f.target ?? '' } : {}),
    });
  }
  const state: FsState = {
    nodes, cwd: machine.cwd, user: machine.user, home: homeOf(machine), ...(machine.host ? { host: machine.host } : {}), ...(machine.groups ? { groups: machine.groups } : {}),
    ...(machine.system ? { system: { ...machine.system } } : {}), ...(machine.mounts ? { mounts: machine.mounts.map(m => ({ ...m })) } : {}),
  };
  if (machine.profile !== 'users') return state;
  // E3: the database, its files, the login groups of the session and the umask.
  const accounts = machineAccounts(machine);
  writeAccountFiles(nodes, accounts);
  return { ...state, accounts, groups: loginGroups(accounts, machine.user), umask: machine.umask ?? 0o022 };
}

/** The machine with a variant's files replacing or adding to its own (fix 5: and its host name and uname fields). */
export function variantMachine(machine: TerminalMachine, variant: TerminalVariant): TerminalMachine {
  const files = variant.files, paths = new Set(files.map(f => f.path));
  return {
    ...machine, files: [...machine.files.filter(f => !paths.has(f.path)), ...files],
    ...variant.host !== undefined ? { host: variant.host } : {}, ...variant.system ? { system: { ...machine.system, ...variant.system } } : {},
  };
}

export interface ReplayedStep { prompt: string; command: string; lines: Line[]; output: string }
/**
 * Runs the commands one after another from a machine (or a state) and returns every prompt, command and output. The
 * profile defaults to the machine's (E1), or the lab's for a state.
 */
export function replay(from: TerminalMachine | FsState, commands: readonly string[], profile?: ShellProfile): { state: FsState; steps: ReplayedStep[] } {
  let state = 'files' in from ? machineState(from) : from;
  profile ??= 'files' in from ? profileOf(from) : LAB_PROFILE;
  const steps: ReplayedStep[] = [];
  for (const command of commands) {
    const before = prompt(state), result = run(state, command, profile);
    steps.push({ prompt: before, command, lines: result.lines, output: result.lines.map(l => l.text).join('\n') });
    state = result.state;
  }
  return { state, steps };
}

const sameNode = (a: FsNode | undefined, b: FsNode | undefined) =>
  a === b || (!!a && !!b && a.kind === b.kind && a.mode === b.mode && a.owner === b.owner && groupOf(a) === groupOf(b) && (a.content ?? '') === (b.content ?? '') && (a.target ?? '') === (b.target ?? ''));
const octal = (mode: number) => mode.toString(8).padStart(3, '0');

/** What a check asks for, in words. */
export function describeCheck(check: TerminalCheck): string {
  switch (check.kind) {
    case 'exists': return `${check.path} 應該存在${check.type === 'dir' ? '（目錄）' : check.type === 'file' ? '（檔案）' : ''}`;
    case 'absent': return `${check.path} 應該不存在`;
    case 'mode': return `${check.path} 的權限應該是 ${octal(check.mode)}`;
    case 'owner': return `${check.path} 的擁有者應該是 ${check.owner}${check.group ? `、群組是 ${check.group}` : ''}`;
    case 'content': return `${check.path} 的內容應該符合題目`;
    case 'cwd': return `目前位置應該是 ${check.path}`;
    case 'output': return '應該有一個指令印出題目要的輸出';
    case 'unchanged': return `${check.path} 應該維持原樣`;
    case 'link': return `${check.path} 應該是指向 ${check.target} 的符號連結`;
    case 'user': {
      if (check.absent) return `使用者 ${check.name} 應該不存在`;
      const parts = [check.uid !== undefined ? `UID 是 ${check.uid}` : '', check.group ? `主要群組是 ${check.group}` : '', check.groups?.length ? `屬於 ${check.groups.join('、')}` : '',
        check.notGroups?.length ? `不屬於 ${check.notGroups.join('、')}` : '', check.shell ? `shell 是 ${check.shell}` : '', check.home ? `家目錄是 ${check.home}` : ''].filter(Boolean);
      return `使用者 ${check.name} 應該存在${parts.length ? `（${parts.join('，')}）` : ''}`;
    }
    case 'group': {
      if (check.absent) return `群組 ${check.name} 應該不存在`;
      const parts = [check.gid !== undefined ? `GID 是 ${check.gid}` : '', check.members?.length ? `成員有 ${check.members.join('、')}` : '', check.notMembers?.length ? `成員沒有 ${check.notMembers.join('、')}` : ''].filter(Boolean);
      return `群組 ${check.name} 應該存在${parts.length ? `（${parts.join('，')}）` : ''}`;
    }
    case 'umask': return `umask 應該是 ${octal(check.umask).padStart(4, '0')}`;
  }
}

/** Why a check fails on a state (start: the machine before the commands; reference: the solution's last output), or null when it holds. */
function failure(check: TerminalCheck, start: FsState, end: FsState, outputs: string[], reference: string): string | null {
  const node = 'path' in check ? end.nodes.get(check.path) : undefined;
  const kindName = (n: FsNode) => n.kind === 'dir' ? '目錄' : n.kind === 'link' ? '符號連結' : '檔案';
  switch (check.kind) {
    case 'exists':
      if (!node) return '它還不存在';
      return check.type && node.kind !== check.type ? `它是${kindName(node)}` : null;
    case 'absent': return node ? '它還在' : null;
    case 'mode':
      if (!node) return '它不存在';
      return (node.mode & 0o777) === check.mode ? null : `目前是 ${octal(node.mode & 0o777)}`;
    case 'owner':
      if (!node) return '它不存在';
      return node.owner === check.owner && (!check.group || groupOf(node) === check.group) ? null : `目前是 ${node.owner}:${groupOf(node)}`;
    case 'content':
      if (!node) return '它不存在';
      if (node.kind !== 'file') return '它不是檔案';
      return node.content === check.content ? null : '內容不同';
    case 'cwd': return end.cwd === check.path ? null : `目前在 ${end.cwd}`;
    case 'output': return outputs.includes(reference) ? null : '還沒有指令印出這個輸出';
    case 'unchanged': {
      const paths = new Set([...subtreeOf(start.nodes, check.path), ...subtreeOf(end.nodes, check.path)]);
      return [...paths].every(p => sameNode(start.nodes.get(p), end.nodes.get(p))) ? null : '它被改動了';
    }
    case 'link':
      if (!node) return '它不存在';
      if (node.kind !== 'link') return `它是${kindName(node)}`;
      return linkTarget(parentOf(check.path), node.target ?? '') === linkTarget(parentOf(check.path), check.target) ? null : `它指向 ${node.target}`;
    case 'user': {
      const acc = end.accounts, user = acc && findUser(acc, check.name);
      if (check.absent) return user ? '它還在' : null;
      if (!acc || !user) return '這個使用者不存在';
      const groups = loginGroups(acc, check.name), primary = groupById(acc, user.gid)?.name ?? String(user.gid);
      if (check.uid !== undefined && user.uid !== check.uid) return `UID 是 ${user.uid}`;
      if (check.group && primary !== check.group) return `主要群組是 ${primary}`;
      const missing = check.groups?.find(g => !groups.includes(g)), extra = check.notGroups?.find(g => groups.includes(g));
      if (missing) return `不在 ${missing} 群組裡`;
      if (extra) return `仍在 ${extra} 群組裡`;
      if (check.shell && user.shell !== check.shell) return `shell 是 ${user.shell}`;
      if (check.home && user.home !== check.home) return `家目錄是 ${user.home}`;
      return null;
    }
    case 'group': {
      const acc = end.accounts, group = acc && findGroup(acc, check.name);
      if (check.absent) return group ? '它還在' : null;
      if (!acc || !group) return '這個群組不存在';
      if (check.gid !== undefined && group.gid !== check.gid) return `GID 是 ${group.gid}`;
      const missing = check.members?.find(m => !loginGroups(acc, m).includes(check.name) || !findUser(acc, m));
      const extra = check.notMembers?.find(m => findUser(acc, m) && loginGroups(acc, m).includes(check.name));
      if (missing) return `${missing} 不在這個群組裡`;
      if (extra) return `${extra} 仍在這個群組裡`;
      return null;
    }
    case 'umask': return (end.umask ?? 0o022) === check.umask ? null : `目前是 ${octal(end.umask ?? 0o022).padStart(4, '0')}`;
  }
}

export interface TerminalCheckResult { check: TerminalCheck; ok: boolean; message: string }
export interface TerminalVerdict { ok: boolean; results: TerminalCheckResult[] }

/**
 * Replays the commands on the exercise's machine and on each variant and tests every check there. A check passes only
 * when it holds on all of them; the message names the first machine where it does not. The profile defaults to the
 * machine's (E1).
 */
export function checkTerminalExercise(exercise: TerminalExercise, machines: readonly TerminalMachine[], commands: readonly string[], given?: ShellProfile): TerminalVerdict {
  const base = machines.find(m => m.id === exercise.machine);
  if (!base) throw new Error(`unknown machine ${exercise.machine}`);
  const profile = given ?? profileOf(base);
  const runs = [{ label: '', machine: base }, ...(exercise.variants ?? []).map(v => ({ label: v.label, machine: variantMachine(base, v) }))].map(({ label, machine }) => {
    const start = machineState(machine), learner = replay(start, commands, profile);
    const reference = replay(start, exercise.solution, profile).steps.at(-1)?.output ?? '';
    return { label, start, end: learner.state, outputs: learner.steps.map(s => s.output), reference };
  });
  const results = exercise.checks.map(check => {
    for (const r of runs) {
      const why = failure(check, r.start, r.end, r.outputs, r.reference);
      if (why) return { check, ok: false, message: `${describeCheck(check)}，但${why}${r.label ? `（換成「${r.label}」的機器重新執行時）` : ''}` };
    }
    return { check, ok: true, message: describeCheck(check) };
  });
  return { ok: results.every(r => r.ok), results };
}

/** Problems with one machine's data (empty when it can be built). */
export function machineProblems(machine: TerminalMachine): string[] {
  const problems: string[] = [];
  const fail = (what: string) => problems.push(`machine ${machine.id}: ${what}`);
  if (!machine.id.trim() || !machine.title.trim()) fail('needs an id and a title');
  if (!NAME.test(machine.user)) fail(`invalid user ${machine.user}`);
  if (machine.host !== undefined && !HOST.test(machine.host)) fail(`invalid host ${machine.host}`);
  for (const g of machine.groups ?? []) if (!NAME.test(g)) fail(`invalid group ${g}`);
  const files = rankOf(machine) >= RANK.files, users = machine.profile === 'users';
  if (machine.profile !== undefined && !Object.hasOwn(PROFILES, machine.profile)) fail(`unknown profile ${machine.profile}`);
  if (machine.system !== undefined) {
    if (!files) fail('system information needs the files profile (engine stage E1)');
    for (const [key, value] of Object.entries(machine.system)) {
      if (!(SYSTEM_FIELDS as readonly string[]).includes(key)) fail(`unknown system field ${key}`);
      else if (typeof value !== 'string' || !SYSTEM_TEXT.test(value)) fail(`system ${key} must be 1..64 printable ASCII characters`);
    }
  }
  if (machine.files.length + 1 > LIMITS.nodes) fail(`more than ${LIMITS.nodes} nodes`);
  const kinds = new Map<string, TerminalFile['kind']>([['/', 'dir']]);
  for (const f of machine.files) {
    const at = `file ${f.path}`;
    if (!normalized(f.path) || f.path === '/') { fail(`${at}: not an absolute, normalized path other than /`); continue; }
    if (kinds.has(f.path)) { fail(`${at}: listed twice`); continue; }
    if (!validName(baseName(f.path)) || depthOf(f.path) > LIMITS.depth) fail(`${at}: name too long or too deep`);
    if (kinds.get(parentOf(f.path)) !== 'dir') fail(`${at}: its parent folder is not listed before it`);
    if (!['dir', 'file', 'link'].includes(f.kind)) fail(`${at}: unknown kind ${f.kind}`);
    if (f.kind === 'link' && !files) fail(`${at}: symbolic links need engine stage E1 (ln -s): give the machine profile 'files'`);
    if (f.kind === 'link' && (typeof f.target !== 'string' || !f.target || f.target.length > LIMITS.input || f.target.includes('\n'))) fail(`${at}: a link needs a target of 1..${LIMITS.input} characters on one line`);
    if (f.kind === 'link' && f.mode !== 0o777) fail(`${at}: a link's mode is always 0777`);
    if (!Number.isInteger(f.mode) || f.mode < 0 || f.mode > 0o777) fail(`${at}: mode must be 0..0777`);
    if (!NAME.test(f.owner) || (f.group !== undefined && !NAME.test(f.group))) fail(`${at}: invalid owner or group`);
    if (f.kind !== 'file' && f.content !== undefined) fail(`${at}: only a file has content`);
    if (f.kind !== 'link' && f.target !== undefined) fail(`${at}: only a link has a target`);
    if ((f.content ?? '').length > LIMITS.fileLength) fail(`${at}: content longer than ${LIMITS.fileLength}`);
    kinds.set(f.path, f.kind);
  }
  if (!normalized(machine.cwd) || kinds.get(machine.cwd) !== 'dir') fail(`the working directory ${machine.cwd} is not a folder of the machine`);
  problems.push(...accountProblems(machine, kinds).map(p => `machine ${machine.id}: ${p}`));
  if (!normalized(homeOf(machine)) || kinds.get(homeOf(machine)) !== 'dir') fail(`the home ${homeOf(machine)} is not a folder of the machine`);
  if (machine.mounts !== undefined) {
    if (!files) fail('mounts need the files profile (engine stage E1)');
    if (machine.mounts.length > TERMINAL_LIMITS.mounts) fail(`at most ${TERMINAL_LIMITS.mounts} mounts`);
    if (!machine.mounts.some(m => m.path === '/')) fail('the mounts need one on /');
    const points = new Set<string>();
    for (const m of machine.mounts) {
      const at = `mount ${m.path}`;
      if (!normalized(m.path) || kinds.get(m.path) !== 'dir') fail(`${at}: not a folder of the machine`);
      if (points.has(m.path)) fail(`${at}: listed twice`);
      points.add(m.path);
      if (!/^\S{1,64}$/.test(m.device)) fail(`${at}: the device needs 1..64 characters without spaces`);
      if (!/^[a-z0-9._-]{1,16}$/.test(m.type)) fail(`${at}: invalid type ${m.type}`);
      const whole = (x: number) => Number.isInteger(x) && x >= 0 && x <= TERMINAL_LIMITS.mountSize;
      if (!whole(m.size) || !whole(m.used) || m.used > m.size) fail(`${at}: size and used must be whole 1K blocks, 0 ≤ used ≤ size ≤ 2^36`);
    }
  }
  return problems;
}

/** E3: the problems of a machine's accounts and umask (only a users machine may have them; its files' owners must exist). */
function accountProblems(machine: TerminalMachine, kinds: ReadonlyMap<string, TerminalFile['kind']>): string[] {
  const problems: string[] = [], fail = (what: string) => problems.push(what);
  const users = machine.profile === 'users';
  if (machine.accounts !== undefined && !users) fail('accounts need the users profile (engine stage E3)');
  if (machine.umask !== undefined && !users) fail('a umask needs the users profile (engine stage E3)');
  if (!users) return problems;
  if (machine.groups !== undefined) fail('on a users machine the session\'s groups come from accounts: remove groups and list the memberships in accounts.groups');
  if (machine.umask !== undefined && (!Number.isInteger(machine.umask) || machine.umask < 0 || machine.umask > 0o777)) fail('umask must be 0..0777');
  for (const path of ACCOUNT_FILES) if (kinds.has(path)) fail(`file ${path}: generated from accounts on a users machine (do not list it)`);
  if (kinds.has('/etc') && kinds.get('/etc') !== 'dir') fail('/etc must be a folder (the account files are written there)');
  const base = defaultAccounts(machine.user, homeOf(machine));
  const extraUsers = machine.accounts?.users ?? [], extraGroups = machine.accounts?.groups ?? [];
  const seen = new Set<string>();
  for (const g of extraGroups) {
    const at = `group ${g.name}`;
    if (!ACCOUNT_NAME.test(g.name)) fail(`${at}: invalid name`);
    if (seen.has(`g:${g.name}`)) fail(`${at}: listed twice`);
    seen.add(`g:${g.name}`);
    if (g.gid === undefined ? !findGroup(base, g.name) : !Number.isInteger(g.gid) || g.gid < 0 || g.gid > 65534) fail(`${at}: needs a gid of 0..65534 (only a base group may leave it out)`);
  }
  for (const u of extraUsers) {
    const at = `user ${u.name}`;
    if (!ACCOUNT_NAME.test(u.name)) fail(`${at}: invalid name`);
    if (seen.has(`u:${u.name}`)) fail(`${at}: listed twice`);
    seen.add(`u:${u.name}`);
    if (u.uid === undefined ? !findUser(base, u.name) : !Number.isInteger(u.uid) || u.uid < 0 || u.uid > 65534) fail(`${at}: needs a uid of 0..65534 (only a base user or the machine's user may leave it out)`);
    if (u.name === 'root' && u.uid !== undefined && u.uid !== 0) fail('user root: its uid is 0');
    if (u.home !== undefined && !normalized(u.home)) fail(`${at}: the home must be an absolute, normalized path`);
    if (u.shell !== undefined && (!normalized(u.shell) || u.shell.includes(':'))) fail(`${at}: the shell must be an absolute path`);
    if (u.comment !== undefined && (/[:\n]/.test(u.comment) || u.comment.length > 64)) fail(`${at}: the comment must be at most 64 characters without : or a new line`);
  }
  const named = new Set([...base.groups, ...extraGroups].map(g => g.name));
  for (const u of extraUsers) if (u.group !== undefined && !named.has(u.group)) fail(`user ${u.name}: group ${u.group} is not a group of the machine`);
  if (problems.length) return problems;
  const acc = machineAccounts(machine);
  if (acc.users.length > LIMITS.users || acc.groups.length > LIMITS.groups) fail(`at most ${LIMITS.users} users and ${LIMITS.groups} groups`);
  for (const [list, what] of [[acc.users.map(u => u.uid), 'uid'], [acc.groups.map(g => g.gid), 'gid']] as const) {
    const dup = list.find((id, i) => list.indexOf(id) !== i);
    if (dup !== undefined) fail(`two accounts share the ${what} ${dup}`);
  }
  for (const g of acc.groups) for (const m of g.members) if (!findUser(acc, m)) fail(`group ${g.name}: member ${m} is not a user of the machine`);
  for (const f of machine.files) {
    if (!findUser(acc, f.owner)) fail(`file ${f.path}: owner ${f.owner} is not a user of the machine`);
    if (!findGroup(acc, f.group ?? f.owner)) fail(`file ${f.path}: group ${f.group ?? f.owner} is not a group of the machine`);
  }
  return problems;
}

/**
 * Every problem with a lesson's terminal content: machines that cannot be built, unknown machines, examples whose stated
 * output is not exactly what the engine prints, and exercises whose reference solution fails (on the machine or a
 * variant), whose initial machine already passes, whose typical mistakes pass, or whose output check could be passed by
 * typing the answer (no variant prints something else).
 */
export function terminalContentProblems(content: TerminalLessonContent, given?: ShellProfile): string[] {
  const problems: string[] = [];
  const fail = (what: string) => problems.push(what);
  const { machines, examples, exercises } = content;
  if (!machines.length || machines.length > TERMINAL_LIMITS.machines) fail(`terminal content needs 1..${TERMINAL_LIMITS.machines} machines`);
  const ids = new Set<string>();
  for (const m of machines) {
    if (ids.has(m.id)) fail(`machine ${m.id}: duplicate id`);
    ids.add(m.id);
    problems.push(...machineProblems(m));
  }
  const valid = new Map(machines.filter(m => !machineProblems(m).length).map(m => [m.id, m]));
  const commandProblem = (c: string) => !c.trim() ? 'an empty command' : c.length > LIMITS.input ? `a command longer than ${LIMITS.input}` : null;
  /**
   * E1: a command of another stage used on a machine whose profile does not have it (a typo may still show its error).
   * E2: every stage of a pipeline counts, and the command sudo runs.
   */
  const outsideProfile = (commands: readonly string[], machine: TerminalMachine, profile: ShellProfile) => commands.flatMap(c =>
    commandNames(c).filter(name => (ALL_COMMANDS as readonly string[]).includes(name) && !(profile.commands as readonly string[]).includes(name))
      .map(name => `${name} is not in the ${profile.id} profile of machine ${machine.id}`));
  for (const e of examples) {
    const at = `example ${e.id}`;
    if (!ids.has(e.machine)) { fail(`${at}: unknown machine ${e.machine}`); continue; }
    if (!e.steps.length || e.steps.length > TERMINAL_LIMITS.steps) fail(`${at}: needs 1..${TERMINAL_LIMITS.steps} steps`);
    const bad = e.steps.map(s => commandProblem(s.command)).find(Boolean);
    if (bad) { fail(`${at}: ${bad}`); continue; }
    const machine = valid.get(e.machine);
    if (!machine) continue;
    const profile = given ?? profileOf(machine);
    for (const p of outsideProfile(e.steps.map(s => s.command), machine, profile)) fail(`${at}: ${p}`);
    replay(machine, e.steps.map(s => s.command), profile).steps.forEach((s, i) => {
      if (s.output !== e.steps[i].output) fail(`${at}: step ${i + 1} (${e.steps[i].command}) prints ${JSON.stringify(s.output)}, not ${JSON.stringify(e.steps[i].output)}`);
    });
  }
  for (const x of exercises) {
    const at = `exercise ${x.id}`;
    if (!ids.has(x.machine)) { fail(`${at}: unknown machine ${x.machine}`); continue; }
    if (!x.title.trim() || !x.explanation.trim()) fail(`${at}: needs a title and an explanation`);
    if (!x.checks.length) fail(`${at}: needs at least one check`);
    for (const c of x.checks) {
      if (!(TERMINAL_CHECK_KINDS as readonly string[]).includes(c.kind)) fail(`${at}: unknown check ${c.kind}`);
      if ('path' in c && !normalized(c.path)) fail(`${at}: check path ${c.path} is not absolute and normalized`);
      if (c.kind === 'mode' && (!Number.isInteger(c.mode) || c.mode < 0 || c.mode > 0o777)) fail(`${at}: check mode must be 0..0777`);
      if (c.kind === 'owner' && (!NAME.test(c.owner) || (c.group !== undefined && !NAME.test(c.group)))) fail(`${at}: invalid owner or group in a check`);
      if (c.kind === 'link' && (typeof c.target !== 'string' || !c.target)) fail(`${at}: a link check needs a target`);
      if ((c.kind === 'user' || c.kind === 'group' || c.kind === 'umask') && valid.get(x.machine)?.profile !== 'users') fail(`${at}: a ${c.kind} check needs a users machine (engine stage E3)`);
      if (c.kind === 'user' && (!ACCOUNT_NAME.test(c.name) || [c.group, ...c.groups ?? [], ...c.notGroups ?? []].some(g => g !== undefined && !ACCOUNT_NAME.test(g)))) fail(`${at}: invalid user or group name in a user check`);
      if (c.kind === 'group' && (!ACCOUNT_NAME.test(c.name) || [...c.members ?? [], ...c.notMembers ?? []].some(m => !ACCOUNT_NAME.test(m)))) fail(`${at}: invalid group or user name in a group check`);
      if (c.kind === 'umask' && (!Number.isInteger(c.umask) || c.umask < 0 || c.umask > 0o777)) fail(`${at}: check umask must be 0..0777`);
    }
    if (!x.solution.length || x.solution.length > TERMINAL_LIMITS.solution) fail(`${at}: the solution needs 1..${TERMINAL_LIMITS.solution} commands`);
    if (!x.mistakes.length) fail(`${at}: needs at least one typical mistake`);
    if ((x.variants?.length ?? 0) > TERMINAL_LIMITS.variants) fail(`${at}: at most ${TERMINAL_LIMITS.variants} variants`);
    const bad = [...x.solution, ...x.mistakes.flatMap(m => m.commands)].map(commandProblem).find(Boolean);
    if (bad) { fail(`${at}: ${bad}`); continue; }
    const machine = valid.get(x.machine);
    if (!machine) continue;
    const profile = given ?? profileOf(machine);
    for (const p of outsideProfile([...x.solution, ...x.mistakes.flatMap(m => m.commands)], machine, profile)) fail(`${at}: ${p}`);
    let variantsOk = true;
    for (const v of x.variants ?? []) {
      if (!v.label.trim()) fail(`${at}: a variant needs a label`);
      const p = machineProblems(variantMachine(machine, v));
      if (p.length) { variantsOk = false; for (const q of p) fail(`${at}: variant ${v.label}: ${q}`); }
    }
    if (!variantsOk) continue;
    const errors = replay(machine, x.solution, profile).steps.filter(s => s.lines.some(l => l.kind === 'err'));
    for (const s of errors) fail(`${at}: the solution's command ${s.command} prints an error: ${s.output}`);
    const verdict = checkTerminalExercise(x, machines, x.solution, profile);
    for (const r of verdict.results) if (!r.ok) fail(`${at}: the solution fails: ${r.message}`);
    if (checkTerminalExercise(x, machines, [], profile).ok) fail(`${at}: the machine passes before any command`);
    for (const m of x.mistakes) if (checkTerminalExercise(x, machines, m.commands, profile).ok) fail(`${at}: the typical mistake "${m.why}" passes the check`);
    if (x.checks.some(c => c.kind === 'output')) {
      const outputOf = (m: TerminalMachine) => replay(m, x.solution, profile).steps.at(-1)?.output ?? '';
      const reference = outputOf(machine);
      if (!reference) fail(`${at}: an output check needs a solution whose last command prints something`);
      if (!(x.variants ?? []).some(v => outputOf(variantMachine(machine, v)) !== reference)) fail(`${at}: an output check needs a variant whose reference output differs (or typing the answer would pass)`);
    }
  }
  return problems;
}
