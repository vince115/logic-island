import { baseName, depthOf, groupOf, LIMITS, linkTarget, parentOf, resolvePath, subtreeOf, validName, type Accounts, type FsNode, type FsState, type GroupEntry, type Mount, type SystemInfo } from './fs';
import { ACCOUNT_FILES, ACCOUNT_NAME, defaultAccounts, findGroup, findUser, groupById, loginGroups, nextId, writeAccountFiles } from './accounts';
import { ALL_COMMANDS, commandNames, LAB_PROFILE, PROFILES, prompt, run, type Line, type ProfileId, type ShellProfile } from './shell';
import { DAY, DEFAULT_NOW, parseTime } from './clock';
import { commOf, MAX_PROCESSES, tableOf, type Proc } from './processes';
import { compareVersions, installedOf, PACKAGE_NAME, PACKAGE_VERSION, type PackageDb, type PackageFile } from './packages';
import { enablement, findUnitFile, journalProblems, nextElapse, parseUnit, unitFilesOnDisk, unitName, type JournalEntry, type Program, type UnitRun } from './services';
import { activeState, DEFAULT_SSHD_CONFIG, hostKey, hostState, knownHostProblem, loginProblem, readSshdConfig, SSH_UNIT, type RemoteHost } from './ssh';
import { parseCron, sameCron, toLocal, zoneNamed, zoneOf } from './calendar';
import { isoText } from './clock';
import { allJobs } from './schedule';
import { scriptCommandNames } from './script';
import {
  describeServerCheck, expandServer, interfacesOfMachine, serverCheckProblems, serverFailure, serverProblems, serverState,
  type ServerCheck, type ServerLevels, type TerminalCacheEntry, type TerminalConnection, type TerminalInterface, type TerminalListen, type TerminalResponder, type TerminalZone,
} from './server-lesson';
import { dnsResolver } from './dns';
import { webStateProblems, type TerminalCertbot, type TerminalCertificate } from './web-lesson';
import type { TerminalFirewall, TerminalUpstreamConnections } from './net-lesson';
import type { TerminalCapture, TerminalCdnCache } from './edge-lesson';
import type { PathDecl } from './diag';
import type { TerminalDocker } from './docker-lesson';

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
 *
 * Engine stages E4–E6 (§12–§14): the profiles 'processes', 'packages' and 'services' (each including the ones below).
 * A processes machine declares a fixed clock (now, boot), its load and memory, and a process table; a packages machine
 * repositories, available and installed packages; a services machine the run state of its units (the unit files are
 * files of the machine), the programs its services run and a journal. Exercises may check processes, packages and
 * services; a variant may replace the process table or the journal.
 *
 * Engine stages E7–E9 (§15–§17): the profiles 'remote', 'scripting' and 'scheduling'. A remote machine lists other machines
 * (each a whole machine with its users, files, sshd_config and a host key seed) reachable with ssh; checks may look at a
 * remote's files (host) and ask whether a login method is allowed (ssh) or a host is trusted (known-host). A scripting
 * machine runs scripts (and its prompt is the interpreter). A scheduling machine has a time zone and timers; checks may
 * ask for a cron job or a timer. A variant may replace a remote machine (another host key) or the clock (another now).
 *
 * Engine stages E10–E12 (SRV0_SERVER_CAPABILITY.md §9): the profiles 'sockets', 'dns' and 'http'. A sockets machine has
 * interfaces, processes and programs that listen, connections, and gets Ubuntu's /etc/hosts, /etc/services and
 * systemd-resolved unless listed (server-lesson.ts); a dns machine a resolver cache, the internet's zones and optionally
 * named; an http machine HTTP responders. Checks may ask what listens (listen), what a name resolves to (dns) and what a
 * URL answers (http). A variant may replace the resolver cache.
 *
 * Engine stages E13–E14 (SRV0_SERVER_CAPABILITY.md §13): the profiles 'tls' and 'nginx'. A tls machine has a trust store,
 * the lesson's certificates as PEM files and optionally certbot; an nginx machine optionally runs nginx from its parsed
 * configuration (web-lesson.ts). Checks may read a certificate file (cert) and ask about nginx (nginx); http accepts
 * https:// from the tls profile up.
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
  /** E18 (edge, files only): when its content last changed (UTC 'YYYY-MM-DD HH:MM:SS'; default the boot time): nginx's Last-Modified and ETag. */
  mtime?: string;
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
  /** E4: the machine's fixed clock, 'YYYY-MM-DD HH:MM:SS' (UTC); default 2026-11-22 10:00:00. */
  now?: string;
  /** E4: when it booted (uptime is now − boot); default one day before now. */
  boot?: string;
  /** E4: the 1, 5 and 15 minute load averages; default 0. */
  load?: [number, number, number];
  /** E4: CPUs (top's %Cpu line); default 1. */
  cpus?: number;
  /** E4: memory in MiB (top); defaults: total 2048, cache 512, swap 0. */
  memory?: { total: number; cache?: number; swap?: number };
  /** E4: the process table. */
  processes?: TerminalProcess[];
  /** E5: repositories, available and installed packages. */
  packages?: TerminalPackages;
  /** E6: the run state of units at the start (a process with a unit makes it active; unlisted units are inactive). */
  services?: TerminalService[];
  /** E6: what the programs of ExecStart= do. */
  programs?: Program[];
  /** E6: the journal, oldest first, none after now. */
  journal?: TerminalJournalEntry[];
  /** E7: this machine's IPv4 address (default 10.0.0.10; sshd logs it). */
  address?: string;
  /** E7: the seed of the keys ssh-keygen makes here (default the machine id). */
  keySeed?: string;
  /** E7: the other machines of the network, reachable with ssh. */
  remotes?: TerminalRemote[];
  /** E9: the time zone (a name of calendar.ts's table; default UTC). */
  timezone?: string;
  /** E9: whether the machine can send mail (cron mails a job's output; without one cron discards it). */
  mta?: boolean;
  /** E10: interface addresses (default eth0 with address/24); lo is always there. */
  interfaces?: TerminalInterface[];
  /** E10: the default gateway (default the first address of eth0's network). */
  gateway?: string;
  /** E10: established or closing TCP connections (ss -tan, lsof -i). */
  connections?: TerminalConnection[];
  /** E10: whether systemd-resolved runs on 127.0.0.53 (default true). */
  resolved?: boolean;
  /** E11: a BIND server (zones from /etc/bind/named.conf.local), running or stopped. */
  named?: true | 'stopped';
  /** E11: the resolver's cache. */
  dnsCache?: TerminalCacheEntry[];
  /** E11 (the local machine): zones of the rest of the internet. */
  internet?: TerminalZone[];
  /** E12: the HTTP responders that listening sockets name (listen.http). */
  responders?: TerminalResponder[];
  /** E13: certificates written as PEM files (ids are unique in the lesson; another machine's certificate may be the issuer). */
  certificates?: TerminalCertificate[];
  /** E13: CA certificates of the lesson added to this machine's trust store. */
  trust?: string[];
  /** E13: certbot and the simulated Let's Encrypt. */
  certbot?: TerminalCertbot;
  /** E14: the nginx package, running (its configuration must pass nginx -t) or stopped. */
  nginx?: true | 'stopped';
  /** E13 (set by remoteMachine, not by lessons): the certificates of the lesson's other machines, which may issue this one's. */
  issuers?: TerminalCertificate[];
  /** E15: the active connections nginx keeps to upstream servers (least_conn reads them). */
  upstreamConnections?: TerminalUpstreamConnections[];
  /** E16: ufw and the nftables ruleset at the start. */
  firewall?: TerminalFirewall;
  /** E17: only these machines (host names; the local machine by its host) can open connections to it. */
  reachableFrom?: string[];
  /** E17 (the local machine): the learner's ~/.ssh/config. */
  sshConfig?: string;
  /** E16 (set by remoteMachine, not by lessons): the lesson's other machines, for a remote's /etc/hosts (it sees the network from the firewall profile up). */
  peers?: { host: string; address: string; aliases?: string[] }[];
  /** E18: how far the machine is from the network's core (ms; default 0.25): round trips are the sum of two machines' latencies. */
  latency?: number;
  /** E18: responses already in its CDN responders' caches. */
  cdnCache?: TerminalCdnCache[];
  /** E19 (the local machine): the hops to destinations (the last hop is the destination), for ping, traceroute and mtr. */
  paths?: PathDecl[];
  /** E19: packet captures tcpdump -r reads. */
  captures?: TerminalCapture[];
  /** E20 (the local machine): Docker CE with these images (local or only on the simulated Docker Hub) and containers. */
  docker?: TerminalDocker;
}

/**
 * E7: another machine of the lesson. Its prompt is host; root and its users come from accounts; the simulation adds what
 * an Ubuntu server with OpenSSH has unless listed (/etc/ssh/sshd_config, the ssh.service unit, enabled and running), so a
 * lesson lists only what matters (homes, authorized_keys, a changed sshd_config, an Include file…).
 */
export interface TerminalRemote {
  host: string;
  title?: string;
  /** IPv4 address (ssh by address works too). */
  address: string;
  aliases?: string[];
  /** The seed of its ed25519 host key; a variant with another seed is "the same name, another key". */
  hostKey: string;
  /** The accounts whose password the lesson gives the learner (ssh answers the password prompt with it). */
  passwords?: string[];
  files: TerminalFile[];
  accounts?: { users?: TerminalUser[]; groups?: TerminalGroup[] };
  /** Whether sshd runs (default true). */
  sshd?: boolean;
  journal?: TerminalJournalEntry[];
  /** E10 (sockets and above): its interfaces, more processes, programs and services, connections, systemd-resolved. */
  interfaces?: TerminalInterface[];
  processes?: TerminalProcess[];
  programs?: Program[];
  services?: TerminalService[];
  connections?: TerminalConnection[];
  resolved?: boolean;
  /** E11: a BIND server on it, and its resolver's cache. */
  named?: true | 'stopped';
  dnsCache?: TerminalCacheEntry[];
  /** E12: its HTTP responders. */
  responders?: TerminalResponder[];
  /** E13–E14: its certificates, trusted CAs, certbot and nginx. */
  certificates?: TerminalCertificate[];
  trust?: string[];
  certbot?: TerminalCertbot;
  nginx?: true | 'stopped';
  /** E15–E17: upstream connections, the firewall, who can reach it (a private network behind a bastion). */
  upstreamConnections?: TerminalUpstreamConnections[];
  firewall?: TerminalFirewall;
  reachableFrom?: string[];
  /** E18–E19: its latency, its CDN caches and its captures. */
  latency?: number;
  cdnCache?: TerminalCdnCache[];
  captures?: TerminalCapture[];
}

/** E4: a process. Defaults: ppid 1, stat S, cpu 0, rss 0, vsz the rss, shr 0, tty ?, start the boot time, time 0, nice 0. */
export interface TerminalProcess {
  pid: number; ppid?: number; user: string; command: string; stat?: string; cpu?: number; rss?: number; vsz?: number; shr?: number; tty?: string;
  start?: string; time?: number; nice?: number;
  /** E6 (services machines): the service it belongs to. */
  unit?: string;
  term?: 'exit' | 'ignore'; hup?: 'exit' | 'reload' | 'ignore'; int?: 'exit' | 'ignore';
  /** E9 (scheduling machines): lock files it holds (flock -n on them fails while it runs). */
  locks?: string[];
  /** E10 (sockets machines): the sockets it listens on (its children of the same name hold them too). */
  listen?: TerminalListen[];
}
/** E5: a machine's package data. stale: the lists were never fetched (apt sees nothing until apt update). */
export interface TerminalPackages {
  repositories: { name: string; url: string; suite: string; components: string[]; enabled?: boolean }[];
  available: { name: string; version: string; repo: string; component?: string; arch?: string; section?: string; description: string; depends?: string[]; files?: PackageFile[]; security?: boolean }[];
  installed?: { name: string; version: string; auto?: boolean; held?: boolean; config?: boolean }[];
  stale?: boolean;
}
/** E6: a unit's state at the start. A failed unit names the pid and exit status of its last main process. */
/** systemd results whose main process ended by a signal: status prints `code=killed, signal=…` (an OOM kill is SIGKILL). */
const KILLED_RESULTS: readonly string[] = ['signal', 'core-dump', 'oom-kill'];
export interface TerminalService { unit: string; active: 'active' | 'failed' | 'inactive'; since?: string; result?: string; pid?: number; status?: number; /** E9 (timers): when it last triggered. */ last?: string }
/** E6: a journal entry: id is the program (systemd, sshd, kernel…); priority 0 emerg … 7 debug. */
export interface TerminalJournalEntry { time: string; unit?: string; id: string; pid?: number; priority: number; message: string }

/** One command of a transcript and exactly what the terminal prints for it (lines joined by \n; '' for nothing). */
export interface TerminalStep { command: string; output: string }
export interface TerminalExample { id: string; title: string; description: string; machine: string; steps: TerminalStep[] }

/**
 * What an exercise checks on the machine after the learner's commands. output: one of the learner's commands printed
 * exactly what the reference solution's last command prints on the same machine (with variants, on each of them too, so
 * a typed-in answer does not pass). unchanged: the path and everything under it are as they were at the start.
 */
export type TerminalCheck =
  | { kind: 'exists'; path: string; type?: 'file' | 'dir'; /** E7: on this remote machine */ host?: string }
  | { kind: 'absent'; path: string; host?: string }
  | { kind: 'mode'; path: string; mode: number; host?: string }
  | { kind: 'owner'; path: string; owner: string; group?: string; host?: string }
  | { kind: 'content'; path: string; content: string; host?: string }
  | { kind: 'cwd'; path: string }
  /**
   * Fix (E19 batch): fromCommand (a regular expression's source) — the command that printed it must match, so a guessable
   * answer typed with echo does not pass (e.g. '^(sudo )?(ping|mtr) ').
   */
  | { kind: 'output'; fromCommand?: string }
  | { kind: 'unchanged'; path: string; host?: string }
  /**
   * E1: the path is a symbolic link to the place this target names (relative targets count from the link's folder), so
   * reports/today.txt and /home/learner/reports/today.txt both pass for /home/learner/current.
   */
  | { kind: 'link'; path: string; target: string; host?: string }
  /**
   * E3 (users machines): the account exists (absent: it does not) with these fields; groups are login groups the user
   * must have (the primary one counts), notGroups ones it must not have. Read from the database, so it holds without a
   * new login.
   */
  | { kind: 'user'; name: string; absent?: true; uid?: number; group?: string; groups?: string[]; notGroups?: string[]; shell?: string; home?: string }
  /** E3 (users machines): the group exists (absent: it does not) with this gid; members must be in it (as a login group). */
  | { kind: 'group'; name: string; absent?: true; gid?: number; members?: string[]; notMembers?: string[] }
  /** E3 (users machines): the session's umask at the end. */
  | { kind: 'umask'; umask: number }
  /** E4: a process (by name — ps's comm — and/or pid) exists (with this user, state letter) or is absent. */
  | { kind: 'process'; name?: string; pid?: number; absent?: true; user?: string; state?: string }
  /** E5: the package is installed (with this version, held or not), or absent (not installed; purged: no configuration left either). */
  | { kind: 'package'; name: string; absent?: true; purged?: true; version?: string; held?: boolean }
  /** E6: the service's run state and whether it starts at boot. */
  | { kind: 'service'; unit: string; active?: 'active' | 'inactive' | 'failed'; enabled?: boolean }
  /** E7: whether user could log in to host with this method now (the sshd options applied by the last start or reload). */
  | { kind: 'ssh'; host: string; user: string; method: 'publickey' | 'password'; allowed: boolean }
  /** E7: the local user's known_hosts has the host's current key under this name (absent: it has no entry for it). */
  | { kind: 'known-host'; host: string; absent?: true }
  /** E9: a cron job (of user, in source: a path or "crontab" for users' crontabs) runs at this schedule (same times) with a command containing this text. */
  | { kind: 'cron'; user?: string; source?: string; schedule?: string; command?: string; absent?: true }
  /** E9: a timer is (not) active / enabled, its next elapse is this local time (YYYY-MM-DD HH:MM:SS). */
  | { kind: 'timer'; unit: string; active?: boolean; enabled?: boolean; next?: string }
  /** E10–E12: listen, dns and http (server-lesson.ts); E20: container and image (docker-lesson.ts). */
  | ServerCheck;
export const TERMINAL_CHECK_KINDS = ['exists', 'absent', 'mode', 'owner', 'content', 'cwd', 'output', 'unchanged', 'link', 'user', 'group', 'umask', 'process', 'package', 'service',
  'ssh', 'known-host', 'cron', 'timer', 'listen', 'dns', 'http', 'cert', 'nginx', 'reach', 'firewall', 'tunnel', 'cache', 'container', 'image', 'build', 'volume', 'network'] as const satisfies readonly TerminalCheck['kind'][];
/** E7: the checks of files that may name a remote machine (host). */
const PATH_KINDS = ['exists', 'absent', 'mode', 'owner', 'content', 'unchanged', 'link'];

/**
 * The same machine with some files replaced or added (and, fix 5, another host name or other uname fields); the
 * learner's commands are replayed on it as well.
 */
export interface TerminalVariant {
  label: string; files: TerminalFile[]; host?: string; system?: Partial<SystemInfo>; /** E4 */ processes?: TerminalProcess[]; /** E6 */ journal?: TerminalJournalEntry[];
  /** E7: remote machines replaced by host (e.g. another host key). */ remotes?: TerminalRemote[];
  /** E9: another clock (next run times differ). */ now?: string;
  /** E11: another resolver cache (other TTLs left). */ dnsCache?: TerminalCacheEntry[];
  /** E15 (fix, E19 batch): other active connections per upstream server (least_conn chooses differently); weights come with `files` (the site). */
  upstreamConnections?: TerminalUpstreamConnections[];
  /** E3/E5 (fix, E19 batch): other users and groups, other packages (replacing the machine's). */
  accounts?: TerminalMachine['accounts']; packages?: TerminalPackages;
  /** E19: other paths (another hop loses packets), so an answer read from mtr or traceroute cannot be typed in. */
  paths?: PathDecl[];
  /** E20: other images and containers (replacing the machine's), so an answer read from docker ps cannot be typed in. */
  docker?: TerminalDocker;
}

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
/** Each profile includes the ones before it: files (E1) < streams (E2) < users (E3) < processes (E4) < packages (E5) < services (E6). */
const RANK: Record<ProfileId, number> = { lab: 0, files: 1, streams: 2, users: 3, processes: 4, packages: 5, services: 6, remote: 7, scripting: 8, scheduling: 9, sockets: 10, dns: 11, http: 12, tls: 13, nginx: 14, proxy: 15, firewall: 16, tunnels: 17, edge: 18, diagnostics: 19, containers: 20, images: 21, 'storage-net': 22 };
const rankOf = (machine: Pick<TerminalMachine, 'profile'>) => RANK[machine.profile ?? 'lab'] ?? 0;
/** E10–E12: which of the server stages a machine's profile has. */
const levelsOf = (machine: Pick<TerminalMachine, 'profile'>): ServerLevels => ({
  sockets: rankOf(machine) >= RANK.sockets, dns: rankOf(machine) >= RANK.dns, http: rankOf(machine) >= RANK.http, tls: rankOf(machine) >= RANK.tls, nginx: rankOf(machine) >= RANK.nginx,
  proxy: rankOf(machine) >= RANK.proxy, firewall: rankOf(machine) >= RANK.firewall, tunnels: rankOf(machine) >= RANK.tunnels,
  edge: rankOf(machine) >= RANK.edge, diagnostics: rankOf(machine) >= RANK.diagnostics, containers: rankOf(machine) >= RANK.containers, images: rankOf(machine) >= RANK.images, storageNet: rankOf(machine) >= RANK['storage-net'],
});

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
export function machineState(given: TerminalMachine): FsState {
  // E10–E12: what an Ubuntu server has unless the lesson lists it (nothing below the sockets profile).
  const machine = expandServer(given, levelsOf(given));
  const nodes = new Map<string, FsNode>([['/', { kind: 'dir', mode: 0o755, owner: 'root' }]]);
  for (const f of machine.files) {
    nodes.set(f.path, {
      kind: f.kind === 'dir' ? 'dir' : f.kind === 'link' ? 'link' : 'file', mode: f.kind === 'link' ? 0o777 : f.mode, owner: f.owner,
      ...(f.group !== undefined ? { group: f.group } : {}), ...(f.kind === 'file' ? { content: f.content ?? '' } : {}),
      ...(f.kind === 'link' ? { target: f.target ?? '' } : {}),
      // E18: a declared modification time (edge and above).
      ...(f.kind === 'file' && f.mtime !== undefined && rankOf(machine) >= RANK.edge && parseTime(f.mtime) !== undefined ? { mtime: parseTime(f.mtime)! } : {}),
    });
  }
  const state: FsState = {
    nodes, cwd: machine.cwd, user: machine.user, home: homeOf(machine), ...(machine.host ? { host: machine.host } : {}), ...(machine.groups ? { groups: machine.groups } : {}),
    ...(machine.system ? { system: { ...machine.system } } : {}), ...(machine.mounts ? { mounts: machine.mounts.map(m => ({ ...m })) } : {}),
  };
  if (rankOf(machine) < RANK.users) return state;
  // E3: the database, its files, the login groups of the session and the umask.
  const accounts = machineAccounts(machine);
  writeAccountFiles(nodes, accounts);
  const users: FsState = { ...state, accounts, groups: loginGroups(accounts, machine.user), umask: machine.umask ?? 0o022 };
  if (rankOf(machine) < RANK.processes) return users;
  const system = systemState(machine, users);
  if (rankOf(machine) < RANK.remote) return system;
  // E7: the other machines, each a whole state with its sshd; E9: the time zone.
  const scheduled: FsState = rankOf(machine) >= RANK.scheduling ? { ...system, schedule: { timezone: machine.timezone ?? 'UTC', mta: !!machine.mta } } : system;
  const hosts: RemoteHost[] = (machine.remotes ?? []).map(r => ({ host: r.host, address: r.address, aliases: [...r.aliases ?? []], passwords: [...r.passwords ?? []], state: remoteState(machine, r) }));
  const lv = levelsOf(machine), address = machine.address ?? (lv.sockets ? interfacesOfMachine(machine)[0]?.address : undefined) ?? '10.0.0.10';
  return serverState(machine, { ...scheduled, net: { address, seed: machine.keySeed ?? machine.id, hosts, connections: 0 } }, lv);
}

const fileOf = (path: string, content: string, mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner: 'root', content });
const dirOf = (path: string, mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner: 'root' });
/**
 * E7: a remote machine as a lesson machine: root's session, the local machine's profile and clock, and what an Ubuntu
 * server with OpenSSH has unless the lesson lists it (sshd_config, its .d folder, ssh.service enabled and running).
 */
export function remoteMachine(machine: TerminalMachine, r: TerminalRemote): TerminalMachine {
  const generated: TerminalFile[] = [
    dirOf('/etc'), dirOf('/etc/ssh'), dirOf('/etc/ssh/sshd_config.d'), fileOf('/etc/ssh/sshd_config', DEFAULT_SSHD_CONFIG), dirOf('/home'), dirOf('/root', 0o700),
    dirOf('/etc/systemd'), dirOf('/etc/systemd/system'), dirOf('/etc/systemd/system/multi-user.target.wants'),
    { path: '/etc/systemd/system/multi-user.target.wants/ssh.service', kind: 'link', mode: 0o777, owner: 'root', target: '/usr/lib/systemd/system/ssh.service' },
    dirOf('/usr'), dirOf('/usr/lib'), dirOf('/usr/lib/systemd'), dirOf('/usr/lib/systemd/system'), fileOf('/usr/lib/systemd/system/ssh.service', SSH_UNIT),
    dirOf('/usr/sbin'), fileOf('/usr/sbin/sshd', '', 0o755),
  ];
  const listed = new Set(r.files.map(f => f.path));
  const files = [...r.files, ...generated.filter(f => !listed.has(f.path))].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const running = r.sshd !== false;
  // E10–E12: the remote's own interfaces, processes, services, DNS and HTTP data (only machines of those profiles have them).
  const server = {
    ...rankOf(machine) >= RANK.sockets ? { address: r.address } : {}, ...r.interfaces ? { interfaces: r.interfaces } : {}, ...r.programs ? { programs: r.programs } : {},
    ...r.connections ? { connections: r.connections } : {}, ...r.resolved !== undefined ? { resolved: r.resolved } : {}, ...r.named !== undefined ? { named: r.named } : {},
    ...r.dnsCache ? { dnsCache: r.dnsCache } : {}, ...r.responders ? { responders: r.responders } : {},
    // E13–E14: its certificates (the lesson's others may issue them), trust store, certbot and nginx.
    ...r.certificates ? { certificates: r.certificates } : {}, ...r.trust ? { trust: r.trust } : {}, ...r.certbot ? { certbot: r.certbot } : {}, ...r.nginx !== undefined ? { nginx: r.nginx } : {},
    // E15–E17: its upstream connections, firewall and who can reach it.
    ...r.upstreamConnections ? { upstreamConnections: r.upstreamConnections } : {}, ...r.firewall ? { firewall: r.firewall } : {}, ...r.reachableFrom ? { reachableFrom: r.reachableFrom } : {},
    // E18–E19: its latency, CDN caches and captures.
    ...r.latency !== undefined ? { latency: r.latency } : {}, ...r.cdnCache ? { cdnCache: r.cdnCache } : {}, ...r.captures ? { captures: r.captures } : {},
    ...rankOf(machine) >= RANK.firewall ? { peers: [{ host: machine.host ?? 'logic-island', address: machine.address ?? interfacesOfMachine(machine)[0]?.address ?? '10.0.0.10' }, ...(machine.remotes ?? []).filter(o => o !== r).map(o => ({ host: o.host, address: o.address, ...o.aliases ? { aliases: o.aliases } : {} }))] } : {},
    ...rankOf(machine) >= RANK.tls ? { issuers: [...machine.certificates ?? [], ...(machine.remotes ?? []).filter(o => o !== r).flatMap(o => o.certificates ?? [])] } : {},
  };
  return {
    id: `${machine.id}/${r.host}`, title: r.title ?? r.host, user: 'root', cwd: '/root', host: r.host, profile: machine.profile, files,
    ...r.accounts ? { accounts: r.accounts } : {}, ...machine.now ? { now: machine.now } : {}, ...machine.boot ? { boot: machine.boot } : {},
    ...machine.timezone ? { timezone: machine.timezone } : {},
    processes: [{ pid: 1, ppid: 0, user: 'root', command: '/sbin/init', stat: 'Ss' },
      ...running ? [{ pid: 700, user: 'root', command: 'sshd: /usr/sbin/sshd -D [listener] 0 of 10-100 startups', stat: 'Ss', unit: 'ssh.service' }] : [], ...r.processes ?? []],
    services: [{ unit: 'ssh.service', active: running ? 'active' : 'inactive' }, ...r.services ?? []],
    ...r.journal ? { journal: r.journal } : {}, ...server,
  };
}
/** E7: a remote machine's state: its own machine state (no network of its own) with its sshd's key and applied options. */
function remoteState(machine: TerminalMachine, r: TerminalRemote): FsState {
  const { net: _n, ...state } = machineState(remoteMachine(machine, r));
  void _n;
  const tunnels = rankOf(machine) >= RANK.tunnels;
  return { ...state, sshd: { ...hostKey(r.hostKey, r.host), applied: readSshdConfig(state.nodes, tunnels).options, ...tunnels ? { forwarding: true as const } : {} } };
}

/** E4–E6: the clock, processes, packages, services and journal of a machine (each only on its profile or above). */
function systemState(machine: TerminalMachine, base: FsState): FsState {
  const now = parseTime(machine.now ?? DEFAULT_NOW)!, boot = machine.boot !== undefined ? parseTime(machine.boot)! : now - DAY;
  const processes: Proc[] = (machine.processes ?? []).map(p => ({
    pid: p.pid, ppid: p.ppid ?? 1, user: p.user, command: p.command, stat: p.stat ?? 'S', cpu: p.cpu ?? 0, rss: p.rss ?? 0, vsz: p.vsz ?? p.rss ?? 0, shr: p.shr ?? 0,
    tty: p.tty ?? '?', start: p.start !== undefined ? parseTime(p.start)! : boot, time: p.time ?? 0, nice: p.nice ?? 0,
    ...p.unit ? { unit: unitName(p.unit) } : {}, ...p.term ? { term: p.term } : {}, ...p.hup ? { hup: p.hup } : {}, ...p.int ? { int: p.int } : {},
    ...p.locks ? { locks: [...p.locks] } : {}, ...p.listen ? { listen: p.listen.map(l => ({ ...l })) } : {},
  }));
  let state: FsState = {
    ...base, status: 0, processes, lastPid: Math.max(0, ...processes.map(p => p.pid)),
    clock: { now, boot, load: machine.load ?? [0, 0, 0], cpus: machine.cpus ?? 1, memory: { total: machine.memory?.total ?? 2048, cache: machine.memory?.cache ?? 512, swap: machine.memory?.swap ?? 0 } },
  };
  if (rankOf(machine) >= RANK.packages && machine.packages) {
    const p = machine.packages;
    const db: PackageDb = {
      repositories: p.repositories.map(r => ({ name: r.name, url: r.url, suite: r.suite, components: [...r.components], enabled: r.enabled ?? true })),
      available: p.available.map(a => ({ ...a, depends: [...a.depends ?? []], files: (a.files ?? []).map(f => ({ ...f })) })),
      installed: (p.installed ?? []).map(i => ({ name: i.name, version: i.version, ...i.auto ? { auto: true } : {}, ...i.config ? { config: true } : {} })),
      holds: (p.installed ?? []).filter(i => i.held).map(i => i.name), current: !p.stale,
    };
    state = { ...state, packages: db };
  }
  if (rankOf(machine) < RANK.services) return state;
  const timers = rankOf(machine) >= RANK.scheduling;
  const loaded = Object.fromEntries(unitFilesOnDisk(state.nodes, timers).map(n => [n, findUnitFile(state.nodes, n)!]));
  const runtime: Record<string, UnitRun> = {};
  const mainOf = (unit: string) => {
    const own = processes.filter(p => p.unit === unit);
    return own.find(p => !own.some(q => q.pid === p.ppid))?.pid;
  };
  for (const s of machine.services ?? []) {
    const unit = unitName(s.unit), since = s.since !== undefined ? parseTime(s.since)! : boot;
    // E9: a timer is active (waiting) or inactive, and remembers when it last triggered.
    if (unit.endsWith('.timer')) {
      const last = s.last !== undefined ? { lastTrigger: parseTime(s.last)! } : {};
      runtime[unit] = s.active === 'active' ? { active: 'active', sub: 'waiting', since, ...last } : { active: s.active, sub: s.active === 'failed' ? 'failed' : 'dead', ...s.since !== undefined ? { since } : {}, ...last };
      continue;
    }
    if (s.active === 'active') { const main = mainOf(unit); runtime[unit] = main !== undefined ? { active: 'active', sub: 'running', since, main } : { active: 'active', sub: 'exited', since }; }
    else if (s.active === 'failed') {
      runtime[unit] = { active: 'failed', sub: 'failed', since, result: s.result ?? 'exit-code', ...s.pid !== undefined ? { exit: { pid: s.pid, code: KILLED_RESULTS.includes(s.result ?? '') ? 'killed' : 'exited', status: s.status ?? (s.result === 'oom-kill' ? 9 : 1) } } : {} };
    } else runtime[unit] = { active: 'inactive', sub: 'dead', ...s.since !== undefined ? { since } : {} };
  }
  for (const p of processes) if (p.unit && !runtime[p.unit]) runtime[p.unit] = { active: 'active', sub: 'running', since: boot, main: mainOf(p.unit) };
  // E9: an enabled timer the lesson does not list has been waiting since boot.
  if (timers) for (const name of Object.keys(loaded)) if (name.endsWith('.timer') && !runtime[name] && enablement(state.nodes, name) === 'enabled') runtime[name] = { active: 'active', sub: 'waiting', since: boot };
  const journal: JournalEntry[] = (machine.journal ?? []).map(e => ({ time: parseTime(e.time)!, ...e.unit ? { unit: unitName(e.unit) } : {}, id: e.id, ...e.pid !== undefined ? { pid: e.pid } : {}, priority: e.priority, message: e.message }));
  return { ...state, services: { loaded, runtime, programs: (machine.programs ?? []).map(p => ({ ...p })) }, journal };
}

/** The machine with a variant's files replacing or adding to its own (fix 5: and its host name and uname fields). */
export function variantMachine(machine: TerminalMachine, variant: TerminalVariant): TerminalMachine {
  const files = variant.files, paths = new Set(files.map(f => f.path));
  return {
    ...machine, files: [...machine.files.filter(f => !paths.has(f.path)), ...files],
    ...variant.host !== undefined ? { host: variant.host } : {}, ...variant.system ? { system: { ...machine.system, ...variant.system } } : {},
    ...variant.processes ? { processes: variant.processes } : {}, ...variant.journal ? { journal: variant.journal } : {},
    ...variant.remotes ? { remotes: (machine.remotes ?? []).map(r => variant.remotes!.find(v => v.host === r.host) ?? r) } : {},
    ...variant.now !== undefined ? { now: variant.now } : {}, ...variant.dnsCache ? { dnsCache: variant.dnsCache } : {},
    ...variant.upstreamConnections ? { upstreamConnections: variant.upstreamConnections } : {}, ...variant.accounts ? { accounts: variant.accounts } : {}, ...variant.packages ? { packages: variant.packages } : {}, ...variant.paths ? { paths: variant.paths } : {},
    ...variant.docker ? { docker: variant.docker } : {},
  };
}

/** status: $? after the command (E4 and above; in an ssh session the remote machine's). */
export interface ReplayedStep { prompt: string; command: string; lines: Line[]; output: string; status?: number }
/**
 * Runs the commands one after another from a machine (or a state) and returns every prompt, command and output. The
 * profile defaults to the machine's (E1), or the lab's for a state.
 */
export function replay(from: TerminalMachine | FsState, commands: readonly string[], profile?: ShellProfile): { state: FsState; steps: ReplayedStep[] } {
  let state = 'files' in from ? machineState(from) : from;
  profile ??= 'files' in from ? profileOf(from) : LAB_PROFILE;
  const steps: ReplayedStep[] = [];
  for (const command of commands) {
    const before = prompt(state), result = run(state, command, profile), status = activeState(result.state).status;
    steps.push({ prompt: before, command, lines: result.lines, output: result.lines.map(l => l.text).join('\n'), ...status !== undefined ? { status } : {} });
    state = result.state;
  }
  return { state, steps };
}

const sameNode = (a: FsNode | undefined, b: FsNode | undefined) =>
  a === b || (!!a && !!b && a.kind === b.kind && a.mode === b.mode && a.owner === b.owner && groupOf(a) === groupOf(b) && (a.content ?? '') === (b.content ?? '') && (a.target ?? '') === (b.target ?? ''));
const octal = (mode: number) => mode.toString(8).padStart(3, '0');

/** What a check asks for, in words (E7: a remote machine's file is named with its host). */
export function describeCheck(check: TerminalCheck): string {
  const words = describe(check);
  return 'host' in check && check.host && PATH_KINDS.includes(check.kind) ? `${check.host} 上的 ${words}` : words;
}
function describe(check: TerminalCheck): string {
  switch (check.kind) {
    case 'listen': case 'dns': case 'http': case 'cert': case 'nginx': case 'reach': case 'firewall': case 'tunnel': case 'cache': case 'container': case 'image': case 'build': case 'volume': case 'network': return describeServerCheck(check);
    case 'exists': return `${check.path} 應該存在${check.type === 'dir' ? '（目錄）' : check.type === 'file' ? '（檔案）' : ''}`;
    case 'absent': return `${check.path} 應該不存在`;
    case 'mode': return `${check.path} 的權限應該是 ${octal(check.mode)}`;
    case 'owner': return `${check.path} 的擁有者應該是 ${check.owner}${check.group ? `、群組是 ${check.group}` : ''}`;
    case 'content': return `${check.path} 的內容應該符合題目`;
    case 'cwd': return `目前位置應該是 ${check.path}`;
    case 'output': return check.fromCommand !== undefined ? '應該有一個指令（實際檢查的指令）印出題目要的輸出' : '應該有一個指令印出題目要的輸出';
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
    case 'process': {
      const which = [check.name !== undefined ? check.name : '', check.pid !== undefined ? `PID ${check.pid}` : ''].filter(Boolean).join('、');
      if (check.absent) return `行程 ${which} 應該已經結束`;
      const parts = [check.user ? `屬於 ${check.user}` : '', check.state ? `狀態是 ${check.state}` : ''].filter(Boolean);
      return `行程 ${which} 應該在執行${parts.length ? `（${parts.join('，')}）` : ''}`;
    }
    case 'package': {
      if (check.purged) return `套件 ${check.name} 應該完全移除（含設定檔）`;
      if (check.absent) return `套件 ${check.name} 應該沒有安裝`;
      const parts = [check.version ? `版本 ${check.version}` : '', check.held === true ? '被 hold' : check.held === false ? '沒有被 hold' : ''].filter(Boolean);
      return `套件 ${check.name} 應該已安裝${parts.length ? `（${parts.join('，')}）` : ''}`;
    }
    case 'service': {
      const parts = [check.active ? `狀態是 ${check.active}` : '', check.enabled === true ? '開機時啟動' : check.enabled === false ? '開機時不啟動' : ''].filter(Boolean);
      return `服務 ${unitName(check.unit)} 應該${parts.join('，') || '存在'}`;
    }
    case 'ssh': return `${check.user} 應該${check.allowed ? '可以' : '不能'}用${check.method === 'publickey' ? '金鑰' : '密碼'}登入 ${check.host}`;
    case 'known-host': return check.absent ? `known_hosts 應該沒有 ${check.host}` : `known_hosts 應該有 ${check.host} 目前的主機金鑰`;
    case 'cron': {
      const parts = [check.user ? `${check.user} 的` : '', check.schedule ? `時間「${check.schedule}」` : '', check.command ? `指令含有「${check.command}」` : ''].filter(Boolean);
      return check.absent ? `不應該有排程工作${parts.length ? `（${parts.join('，')}）` : ''}` : `應該有排程工作${parts.length ? `（${parts.join('，')}）` : ''}`;
    }
    case 'timer': {
      const parts = [check.active === true ? '在等待觸發' : check.active === false ? '沒有啟動' : '', check.enabled === true ? '開機時啟動' : check.enabled === false ? '開機時不啟動' : '',
        check.next ? `下次觸發是 ${check.next}` : ''].filter(Boolean);
      return `timer ${check.unit} 應該${parts.join('，') || '存在'}`;
    }
  }
}

/** Why a check fails on a state (start: the machine before the commands; reference: the solution's last output), or null when it holds. */
function failure(check: TerminalCheck, start0: FsState, end0: FsState, outputs: string[], reference: string, commands: readonly string[] = []): string | null {
  // E7: a check of files may name a remote machine.
  const host = 'host' in check && PATH_KINDS.includes(check.kind) ? check.host : undefined;
  const end = host ? hostState(end0, host) : end0, start = host ? hostState(start0, host) : start0;
  if (!end || !start) return `沒有 ${host} 這台主機`;
  const node = 'path' in check ? end.nodes.get(check.path) : undefined;
  const kindName = (n: FsNode) => n.kind === 'dir' ? '目錄' : n.kind === 'link' ? '符號連結' : '檔案';
  switch (check.kind) {
    case 'listen': case 'dns': case 'http': case 'cert': case 'nginx': case 'reach': case 'firewall': case 'tunnel': case 'cache': case 'container': case 'image': case 'build': case 'volume': case 'network': return serverFailure(check, end, h => hostState(end, h), dnsResolver);
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
    case 'output': {
      if (check.fromCommand === undefined) return outputs.includes(reference) ? null : '還沒有指令印出這個輸出';
      let re: RegExp;
      try { re = new RegExp(check.fromCommand); } catch { return 'fromCommand 不是正規表示式'; }
      if (outputs.some((o, i) => o === reference && re.test(commands[i] ?? ''))) return null;
      return outputs.includes(reference) ? '印出這個輸出的指令不是實際檢查的指令（請用指令查出答案，不要直接打出來）' : '還沒有指令印出這個輸出';
    }
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
    case 'process': {
      const found = tableOf(end).filter(p => (check.name === undefined || commOf(p.command) === check.name) && (check.pid === undefined || p.pid === check.pid));
      if (check.absent) return found.length ? `它還在（PID ${found.map(p => p.pid).join('、')}）` : null;
      if (!found.length) return '找不到這個行程';
      if (check.user && !found.some(p => p.user === check.user)) return `它屬於 ${found[0].user}`;
      if (check.state && !found.some(p => p.stat.startsWith(check.state!))) return `它的狀態是 ${found[0].stat}`;
      return null;
    }
    case 'package': {
      const db = end.packages, inst = db && installedOf(db, check.name);
      if (check.purged) return inst ? `它還裝著（${inst.version}）` : db?.installed.some(p => p.name === check.name) ? '它的設定檔還在（rc）' : null;
      if (check.absent) return inst ? `它還裝著（${inst.version}）` : null;
      if (!db || !inst) return '它沒有安裝';
      if (check.version && inst.version !== check.version) return `安裝的版本是 ${inst.version}`;
      if (check.held !== undefined && db.holds.includes(check.name) !== check.held) return check.held ? '它沒有被 hold' : '它仍被 hold';
      return null;
    }
    case 'service': {
      const name = unitName(check.unit), active = end.services?.runtime[name]?.active ?? 'inactive';
      if (check.active && active !== check.active) return `它是 ${active}`;
      if (check.enabled !== undefined) {
        const e = enablement(end.nodes, name);
        if ((e === 'enabled') !== check.enabled) return e ? `它是 ${e}` : '沒有這個 unit 檔';
      }
      return null;
    }
    case 'ssh': {
      const why = loginProblem(end, check.host, check.user, check.method);
      return check.allowed ? why : why === null ? '仍然可以這樣登入' : null;
    }
    case 'known-host': {
      const why = knownHostProblem(end, check.host);
      return check.absent ? why === null || why.includes('舊的') ? '它還在 known_hosts 裡' : null : why;
    }
    case 'cron': {
      const wanted = check.schedule ? parseCron(check.schedule.trim().split(/\s+/)) : undefined;
      const jobs = allJobs(end).filter(j => (!check.user || j.user === check.user) && (!check.source || (check.source === 'crontab' ? j.source.startsWith('crontab (') : j.source === check.source)));
      const match = jobs.filter(j => (!wanted || 'error' in wanted || sameCron(j.spec, wanted)) && (!check.command || j.command.includes(check.command)));
      if (check.absent) return match.length ? `它還在（${match[0].source} 第 ${match[0].line} 行）` : null;
      if (match.length) return null;
      return jobs.length ? `找到的工作是「${jobs[0].when} ${jobs[0].command}」` : '找不到排程工作';
    }
    case 'timer': {
      const name = check.unit, loadedFile = end.services?.loaded[name], run = end.services?.runtime[name];
      if (!findUnitFile(end.nodes, name) && !loadedFile) return '沒有這個 timer 的 unit 檔';
      const active = run?.active === 'active';
      if (check.active !== undefined && active !== check.active) return active ? '它在執行' : '它沒有啟動';
      if (check.enabled !== undefined && (enablement(end.nodes, name) === 'enabled') !== check.enabled) return check.enabled ? '它沒有 enable' : '它仍然 enable';
      if (check.next !== undefined) {
        const next = loadedFile && active ? nextElapse(end, parseUnit(loadedFile), run) : undefined;
        const shown = next === undefined ? '沒有下次觸發的時間' : isoText(toLocal(zoneOf(end), next));
        if (shown !== check.next) return next === undefined ? shown : `下次觸發是 ${shown}`;
      }
      return null;
    }
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
      const why = failure(check, r.start, r.end, r.outputs, r.reference, commands);
      if (why) return { check, ok: false, message: `${describeCheck(check)}，但${why}${r.label ? `（換成「${r.label}」的機器重新執行時）` : ''}` };
    }
    return { check, ok: true, message: describeCheck(check) };
  });
  return { ok: results.every(r => r.ok), results };
}

/** Problems with one machine's data (empty when it can be built). */
export function machineProblems(given: TerminalMachine): string[] {
  // E10–E12: the machine as it runs, with what Ubuntu adds (the lesson's own data is validated with it).
  const machine = expandServer(given, levelsOf(given));
  const problems: string[] = [];
  const fail = (what: string) => problems.push(`machine ${machine.id}: ${what}`);
  if (!machine.id.trim() || !machine.title.trim()) fail('needs an id and a title');
  if (!NAME.test(machine.user)) fail(`invalid user ${machine.user}`);
  if (machine.host !== undefined && !HOST.test(machine.host)) fail(`invalid host ${machine.host}`);
  for (const g of machine.groups ?? []) if (!NAME.test(g)) fail(`invalid group ${g}`);
  const files = rankOf(machine) >= RANK.files;
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
  if (!problems.length) problems.push(...systemProblems(machine).map(p => `machine ${machine.id}: ${p}`));
  if (!problems.length) problems.push(...laterProblems(machine).map(p => `machine ${machine.id}: ${p}`));
  const names = [machine.host ?? 'logic-island', ...(machine.remotes ?? []).map(r => r.host), ...(machine.peers ?? []).map(p => p.host)];
  if (!problems.length) problems.push(...serverProblems(machine, levelsOf(machine), names).map(p => `machine ${machine.id}: ${p}`));
  // E13–E14: what the built machine serves (the responders' certificate files, nginx's configuration test).
  if (!problems.length && rankOf(machine) >= RANK.tls) problems.push(...webStateProblems(machine, machineState(given), levelsOf(machine)).map(p => `machine ${machine.id}: ${p}`));
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

const LINE = (max: number) => (t: unknown) => typeof t === 'string' && t.length >= 1 && t.length <= max && !t.includes('\n');
const UNIT = /^[A-Za-z0-9@._-]{1,64}\.service$/;
const TIMER = /^[A-Za-z0-9@._-]{1,64}\.timer$/;
const whole = (x: unknown, min: number, max: number) => Number.isInteger(x) && (x as number) >= min && (x as number) <= max;

/** E4–E6: the problems of a machine's clock, processes, packages, services, programs and journal. */
function systemProblems(machine: TerminalMachine): string[] {
  const problems: string[] = [], fail = (what: string) => problems.push(what), rank = rankOf(machine);
  const need = (field: string, at: number, stage: string) => { if (rank < at) fail(`${field} need${field.endsWith('s') ? '' : 's'} the ${Object.keys(RANK).find(k => RANK[k as ProfileId] === at)} profile (engine stage ${stage})`); };
  const e4 = { now: machine.now, boot: machine.boot, load: machine.load, cpus: machine.cpus, memory: machine.memory, processes: machine.processes };
  for (const [field, value] of Object.entries(e4)) if (value !== undefined) need(field, RANK.processes, 'E4');
  if (machine.packages !== undefined) need('packages', RANK.packages, 'E5');
  for (const [field, value] of Object.entries({ services: machine.services, programs: machine.programs, journal: machine.journal })) if (value !== undefined) need(field, RANK.services, 'E6');
  if (problems.length || rank < RANK.processes) return problems;
  const now = parseTime(machine.now ?? DEFAULT_NOW), boot = machine.boot !== undefined ? parseTime(machine.boot) : (now ?? 0) - DAY;
  if (now === undefined) fail(`now must be a date and time YYYY-MM-DD HH:MM:SS, not ${machine.now}`);
  if (boot === undefined) fail(`boot must be a date and time YYYY-MM-DD HH:MM:SS, not ${machine.boot}`);
  if (now === undefined || boot === undefined) return problems;
  if (boot > now) fail('boot must not be after now');
  if (machine.load !== undefined && (!Array.isArray(machine.load) || machine.load.length !== 3 || machine.load.some(n => typeof n !== 'number' || n < 0 || n > 1000))) fail('load must be three numbers 0..1000');
  if (machine.cpus !== undefined && !whole(machine.cpus, 1, 256)) fail('cpus must be 1..256');
  const m = machine.memory;
  if (m !== undefined && (!whole(m.total, 1, 1048576) || (m.cache !== undefined && !whole(m.cache, 0, m.total)) || (m.swap !== undefined && !whole(m.swap, 0, 1048576)))) fail('memory must be whole MiB: 1 ≤ total ≤ 1048576, 0 ≤ cache ≤ total, 0 ≤ swap');
  const acc = machineAccounts(machine), procs = machine.processes ?? [], pids = new Set<number>();
  if (procs.length > MAX_PROCESSES) fail(`at most ${MAX_PROCESSES} processes`);
  for (const p of procs) {
    const at = `process ${p.pid}`;
    if (!whole(p.pid, 1, 4194304) || pids.has(p.pid)) fail(`${at}: the pid must be 1..4194304 and unique`);
    pids.add(p.pid);
    if (!findUser(acc, p.user)) fail(`${at}: user ${p.user} is not a user of the machine`);
    if (!LINE(200)(p.command)) fail(`${at}: the command needs 1..200 characters on one line`);
    if (p.stat !== undefined && !/^[RSDTZI][<NsLl+]*$/.test(p.stat)) fail(`${at}: invalid stat ${p.stat}`);
    if (p.cpu !== undefined && (typeof p.cpu !== 'number' || p.cpu < 0 || p.cpu > 100 * (machine.cpus ?? 1))) fail(`${at}: cpu must be 0..100 per CPU`);
    for (const [k, v] of [['rss', p.rss], ['vsz', p.vsz], ['shr', p.shr]] as const) if (v !== undefined && !whole(v, 0, 2 ** 31)) fail(`${at}: ${k} must be whole KiB`);
    if (p.tty !== undefined && !/^(\?|pts\/\d{1,3}|tty\d{1,2})$/.test(p.tty)) fail(`${at}: tty must be ?, pts/N or ttyN`);
    if (p.start !== undefined) { const t = parseTime(p.start); if (t === undefined || t > now || t < boot) fail(`${at}: start must be a time between boot and now`); }
    if (p.time !== undefined && (typeof p.time !== 'number' || p.time < 0)) fail(`${at}: time must be seconds ≥ 0`);
    if (p.nice !== undefined && !whole(p.nice, -20, 19)) fail(`${at}: nice must be -20..19`);
    if (p.unit !== undefined && (rank < RANK.services || !UNIT.test(unitName(p.unit)))) fail(`${at}: a unit needs the services profile and a name like nginx.service`);
    if (p.term !== undefined && !['exit', 'ignore'].includes(p.term)) fail(`${at}: term must be exit or ignore`);
    if (p.hup !== undefined && !['exit', 'reload', 'ignore'].includes(p.hup)) fail(`${at}: hup must be exit, reload or ignore`);
    if (p.int !== undefined && !['exit', 'ignore'].includes(p.int)) fail(`${at}: int must be exit or ignore`);
  }
  for (const p of procs) if (p.ppid !== undefined && p.ppid !== 0 && !pids.has(p.ppid)) fail(`process ${p.pid}: its parent ${p.ppid} is not in the table`);
  if (machine.packages) problems.push(...packageProblems(machine.packages));
  if (rank < RANK.services || problems.length) return problems;
  const state = machineState(machine);
  for (const s of machine.services ?? []) {
    const unit = unitName(s.unit), at = `service ${s.unit}`, own = procs.filter(p => p.unit && unitName(p.unit) === unit);
    if (!UNIT.test(unit) && !(rank >= RANK.scheduling && TIMER.test(unit))) { fail(`${at}: invalid unit name`); continue; }
    if (!findUnitFile(state.nodes, unit)) fail(`${at}: no unit file /etc/systemd/system/${unit} or /usr/lib/systemd/system/${unit} on the machine`);
    if (!['active', 'failed', 'inactive'].includes(s.active)) fail(`${at}: active must be active, failed or inactive`);
    if (s.active !== 'active' && own.length) fail(`${at}: a ${s.active} service has no processes`);
    if (s.since !== undefined) { const t = parseTime(s.since); if (t === undefined || t > now) fail(`${at}: since must be a time not after now`); }
    if (s.pid !== undefined && (!whole(s.pid, 1, 4194304) || s.active !== 'failed')) fail(`${at}: pid is the last main process of a failed service`);
    if (s.status !== undefined && !whole(s.status, 0, 255)) fail(`${at}: status must be 0..255`);
  }
  const listed = new Set((machine.services ?? []).map(s => unitName(s.unit)));
  for (const p of procs) if (p.unit && !listed.has(unitName(p.unit)) && !findUnitFile(state.nodes, unitName(p.unit))) fail(`process ${p.pid}: no unit file for ${p.unit}`);
  const paths = new Set<string>();
  for (const p of machine.programs ?? []) {
    const at = `program ${p.path}`;
    if (!normalized(p.path) || paths.has(p.path)) fail(`${at}: needs a unique absolute, normalized path`);
    paths.add(p.path);
    if (p.title !== undefined && !LINE(200)(p.title)) fail(`${at}: the title needs 1..200 characters on one line`);
    if (p.fail && (!LINE(300)(p.fail.message) || (p.fail.status !== undefined && !whole(p.fail.status, 1, 255)) || (p.fail.unless !== undefined && !normalized(p.fail.unless)))) fail(`${at}: fail needs a one-line message, a status 1..255 and an absolute unless path`);
    if ((p.log ?? []).some(l => !LINE(300)(l))) fail(`${at}: each log line needs 1..300 characters`);
    if (p.cpu !== undefined && (typeof p.cpu !== 'number' || p.cpu < 0 || p.cpu > 100)) fail(`${at}: cpu must be 0..100`);
  }
  const journal = machine.journal ?? [];
  if (journal.length > 300) fail('at most 300 journal entries');
  const times: number[] = [];
  journal.forEach((e, i) => {
    const at = `journal entry ${i + 1}`, t = parseTime(e.time);
    if (t === undefined) { fail(`${at}: time must be YYYY-MM-DD HH:MM:SS`); return; }
    times.push(t);
    if (!whole(e.priority, 0, 7)) fail(`${at}: priority must be 0..7`);
    if (!/^[A-Za-z0-9_.@-]{1,32}$/.test(e.id)) fail(`${at}: invalid id ${e.id}`);
    if (!LINE(500)(e.message)) fail(`${at}: the message needs 1..500 characters on one line`);
    if (e.unit !== undefined && !UNIT.test(unitName(e.unit))) fail(`${at}: invalid unit ${e.unit}`);
    if (e.pid !== undefined && !whole(e.pid, 1, 4194304)) fail(`${at}: invalid pid`);
  });
  if (times.length === journal.length) problems.push(...journalProblems(times.map(time => ({ time, id: '', priority: 6, message: '' })), now));
  return problems;
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const SHEBANG = /^#!\s*(\/usr\/bin\/env\s+(bash|sh)|\/(usr\/)?bin\/(bash|sh|dash))(\s|$)/;
/** E8: a script file's commands that its machine's profile does not have (written literally; a typo may still show its error). */
function scriptProblems(files: readonly TerminalFile[], profile: ShellProfile, where: string): string[] {
  const out: string[] = [];
  for (const f of files) {
    if (f.kind !== 'file' || !SHEBANG.test(f.content ?? '')) continue;
    for (const name of new Set(scriptCommandNames(f.content ?? ''))) {
      if ((ALL_COMMANDS as readonly string[]).includes(name) && !(profile.commands as readonly string[]).includes(name)) out.push(`${where}file ${f.path}: the script runs ${name}, which is not in the ${profile.id} profile`);
    }
  }
  return out;
}
/** E7–E9: remote machines, the key seed and address, the time zone, mail, lock files and timers' last runs. */
function laterProblems(machine: TerminalMachine): string[] {
  const problems: string[] = [], fail = (what: string) => problems.push(what), rank = rankOf(machine);
  if ((machine.remotes !== undefined || machine.address !== undefined || machine.keySeed !== undefined) && rank < RANK.remote) fail('remotes, address and keySeed need the remote profile (engine stage E7)');
  if ((machine.timezone !== undefined || machine.mta !== undefined) && rank < RANK.scheduling) fail('timezone and mta need the scheduling profile (engine stage E9)');
  if ((machine.processes ?? []).some(p => p.locks !== undefined) && rank < RANK.scheduling) fail('process locks need the scheduling profile (engine stage E9)');
  if ((machine.services ?? []).some(s => s.last !== undefined || unitName(s.unit).endsWith('.timer')) && rank < RANK.scheduling) fail('timers need the scheduling profile (engine stage E9)');
  if (problems.length) return problems;
  if (machine.address !== undefined && !IPV4.test(machine.address)) fail(`address ${machine.address} is not an IPv4 address`);
  if (machine.keySeed !== undefined && !LINE(64)(machine.keySeed)) fail('keySeed needs 1..64 characters on one line');
  if (machine.timezone !== undefined && !zoneNamed(machine.timezone)) fail(`unknown time zone ${machine.timezone} (the simulation knows UTC, Asia/Taipei, Asia/Tokyo, Europe/London, America/New_York…)`);
  for (const p of machine.processes ?? []) for (const l of p.locks ?? []) if (!normalized(l)) fail(`process ${p.pid}: lock ${l} is not an absolute, normalized path`);
  const now = parseTime(machine.now ?? DEFAULT_NOW)!;
  for (const s of machine.services ?? []) if (s.last !== undefined) { const t = parseTime(s.last); if (!unitName(s.unit).endsWith('.timer') || t === undefined || t > now) fail(`service ${s.unit}: last is a time not after now, for a timer`); }
  if (rank >= RANK.scripting) problems.push(...scriptProblems(machine.files, profileOf(machine), ''));
  const remotes = machine.remotes ?? [];
  // E10: a server lesson may need a few more machines (client, web, database, DNS…).
  const most = rank >= RANK.sockets ? 6 : 4;
  if (remotes.length > most) fail(`at most ${most} remote machines`);
  const own = rank >= RANK.sockets ? interfacesOfMachine(machine).map(i => i.address) : [];
  const names = new Set<string>([machine.host ?? 'logic-island', machine.address ?? '10.0.0.10', ...own]);
  for (const r of remotes) {
    const at = `remote ${r.host}`;
    const extra = rank >= RANK.sockets && r.interfaces ? interfacesOfMachine({ ...r, id: r.host }).map(i => i.address).filter(a => a !== r.address) : [];
    for (const n of [r.host, r.address, ...r.aliases ?? [], ...extra]) { if (names.has(n)) fail(`${at}: the name or address ${n} is used twice`); names.add(n); }
    if (!HOST.test(r.host)) fail(`${at}: invalid host name`);
    if (!IPV4.test(r.address)) fail(`${at}: address ${r.address} is not an IPv4 address`);
    for (const a of r.aliases ?? []) if (!HOST.test(a) && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(a)) fail(`${at}: invalid alias ${a}`);
    if (!LINE(64)(r.hostKey)) fail(`${at}: hostKey needs a seed of 1..64 characters on one line`);
    const m = remoteMachine(machine, r), inner = machineProblems(m).map(p => `${at}: ${p.replace(/^machine \S+: /, '')}`);
    problems.push(...inner);
    if (inner.length) continue;
    const acc = machineAccounts(m);
    for (const u of r.passwords ?? []) if (!findUser(acc, u)) fail(`${at}: password for ${u}, who is not a user of the machine`);
    const conf = readSshdConfig(machineState(m).nodes, rank >= RANK.tunnels);
    for (const e of conf.errors) fail(`${at}: sshd_config: ${e}`);
    // E17: a private machine names the machines that can reach it.
    const lessonNames = [machine.host ?? 'logic-island', ...remotes.map(o => o.host)];
    for (const n of r.reachableFrom ?? []) if (!lessonNames.includes(n) || n === r.host) fail(`${at}: reachableFrom ${n} is not another machine of the lesson`);
    if (rank >= RANK.scripting) problems.push(...scriptProblems(r.files, profileOf(machine), `${at}: `));
  }
  return problems;
}

/** E5: the problems of a machine's package data. */
function packageProblems(p: TerminalPackages): string[] {
  const problems: string[] = [], fail = (what: string) => problems.push(what);
  if (!Array.isArray(p.repositories) || !Array.isArray(p.available)) return ['packages need repositories and available lists'];
  if (p.repositories.length > 8 || p.available.length > 120) fail('at most 8 repositories and 120 available package versions');
  const repos = new Set<string>();
  for (const r of p.repositories) {
    const at = `repository ${r.name}`;
    if (!/^[a-z0-9][a-z0-9.-]{0,31}$/.test(r.name) || repos.has(r.name)) fail(`${at}: needs a unique name`);
    repos.add(r.name);
    if (!/^https?:\/\/\S{1,200}$/.test(r.url)) fail(`${at}: invalid url`);
    if (!/^[a-z0-9][a-z0-9.-]{0,31}$/.test(r.suite)) fail(`${at}: invalid suite`);
    if (!r.components.length || r.components.some(c => !/^[a-z][a-z-]{0,31}$/.test(c))) fail(`${at}: needs components like main universe`);
  }
  const names = new Set([...p.available.map(a => a.name), ...(p.installed ?? []).map(i => i.name)]), seen = new Set<string>();
  for (const a of p.available) {
    const at = `package ${a.name} ${a.version}`;
    if (!PACKAGE_NAME.test(a.name) || !PACKAGE_VERSION.test(a.version)) fail(`${at}: invalid name or version`);
    if (seen.has(`${a.name} ${a.version} ${a.repo}`)) fail(`${at}: listed twice in ${a.repo}`);
    seen.add(`${a.name} ${a.version} ${a.repo}`);
    if (!repos.has(a.repo)) fail(`${at}: unknown repository ${a.repo}`);
    if (!LINE(200)(a.description)) fail(`${at}: the description needs 1..200 characters on one line`);
    for (const d of a.depends ?? []) if (!names.has(d) || d === a.name) fail(`${at}: depends on unknown package ${d}`);
    for (const f of a.files ?? []) {
      if (!normalized(f.path) || f.path === '/' || depthOf(f.path) > LIMITS.depth || !validName(baseName(f.path))) fail(`${at}: file ${f.path} is not an absolute, normalized path`);
      if (!['dir', 'file', 'link'].includes(f.kind) || !Number.isInteger(f.mode) || f.mode < 0 || f.mode > 0o777) fail(`${at}: file ${f.path} needs a kind and a mode 0..0777`);
      if ((f.content ?? '').length > LIMITS.fileLength || (f.kind !== 'file' && f.content !== undefined)) fail(`${at}: file ${f.path}: only a file has content (at most ${LIMITS.fileLength})`);
      if ((f.kind === 'link') !== (typeof f.target === 'string' && f.target.length > 0)) fail(`${at}: file ${f.path}: a link (and only a link) needs a target`);
    }
  }
  const installed = new Set<string>();
  for (const i of p.installed ?? []) {
    const at = `installed ${i.name}`;
    if (!PACKAGE_NAME.test(i.name) || !PACKAGE_VERSION.test(i.version) || installed.has(i.name)) fail(`${at}: needs a unique name and a valid version`);
    installed.add(i.name);
    if (i.held && i.config) fail(`${at}: a removed package (config) cannot be held`);
  }
  if (p.available.some(a => p.available.some(b => b !== a && b.name === a.name && b.repo === a.repo && compareVersions(a.version, b.version) === 0 && a.version !== b.version))) fail('two versions of a package in one repository compare equal');
  return problems;
}

/** E3: the problems of a machine's accounts and umask (only a users machine may have them; its files' owners must exist). */
function accountProblems(machine: TerminalMachine, kinds: ReadonlyMap<string, TerminalFile['kind']>): string[] {
  const problems: string[] = [], fail = (what: string) => problems.push(what);
  const users = rankOf(machine) >= RANK.users;
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
    // E8: on a scripting machine a line is parsed by the interpreter (every command of ; && || $( ) and loops counts).
    [...new Set(rankOf(machine) >= RANK.scripting ? scriptCommandNames(c) : commandNames(c))].filter(name => (ALL_COMMANDS as readonly string[]).includes(name) && !(profile.commands as readonly string[]).includes(name))
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
      if ((c.kind === 'user' || c.kind === 'group' || c.kind === 'umask') && rankOf(valid.get(x.machine) ?? {}) < RANK.users) fail(`${at}: a ${c.kind} check needs a users machine (engine stage E3)`);
      if (c.kind === 'user' && (!ACCOUNT_NAME.test(c.name) || [c.group, ...c.groups ?? [], ...c.notGroups ?? []].some(g => g !== undefined && !ACCOUNT_NAME.test(g)))) fail(`${at}: invalid user or group name in a user check`);
      if (c.kind === 'group' && (!ACCOUNT_NAME.test(c.name) || [...c.members ?? [], ...c.notMembers ?? []].some(m => !ACCOUNT_NAME.test(m)))) fail(`${at}: invalid group or user name in a group check`);
      if (c.kind === 'umask' && (!Number.isInteger(c.umask) || c.umask < 0 || c.umask > 0o777)) fail(`${at}: check umask must be 0..0777`);
      const machineRank = rankOf(valid.get(x.machine) ?? {});
      if (c.kind === 'process' && (machineRank < RANK.processes || (c.name === undefined && c.pid === undefined))) fail(`${at}: a process check needs a processes machine (engine stage E4) and a name or a pid`);
      if (c.kind === 'package' && (machineRank < RANK.packages || !PACKAGE_NAME.test(c.name) || (c.version !== undefined && !PACKAGE_VERSION.test(c.version)))) fail(`${at}: a package check needs a packages machine (engine stage E5) and a valid name and version`);
      if (c.kind === 'service' && (machineRank < RANK.services || !UNIT.test(unitName(c.unit)) || (c.active !== undefined && !['active', 'inactive', 'failed'].includes(c.active)))) fail(`${at}: a service check needs a services machine (engine stage E6) and a unit name`);
      const remotes = valid.get(x.machine)?.remotes ?? [], known = (h: string) => remotes.some(r => r.host === h || r.address === h || (r.aliases ?? []).includes(h));
      if ('host' in c && c.host !== undefined && PATH_KINDS.includes(c.kind) && (machineRank < RANK.remote || !known(c.host))) fail(`${at}: a check on host ${c.host} needs a remote machine of that name (engine stage E7)`);
      if ((c.kind === 'ssh' || c.kind === 'known-host') && (machineRank < RANK.remote || !known(c.host))) fail(`${at}: ${c.kind === 'ssh' ? 'an' : 'a'} ${c.kind} check needs a remote machine named ${c.host} (engine stage E7)`);
      if (c.kind === 'ssh' && (!ACCOUNT_NAME.test(c.user) || !['publickey', 'password'].includes(c.method) || typeof c.allowed !== 'boolean')) fail(`${at}: an ssh check needs a user, a method (publickey or password) and allowed`);
      if (c.kind === 'cron' && (machineRank < RANK.scheduling || (c.schedule !== undefined && 'error' in parseCron(c.schedule.trim().split(/\s+/))) || (c.user !== undefined && !ACCOUNT_NAME.test(c.user)))) fail(`${at}: a cron check needs a scheduling machine (engine stage E9) and a valid schedule`);
      if (c.kind === 'timer' && (machineRank < RANK.scheduling || !TIMER.test(c.unit) || (c.next !== undefined && parseTime(c.next) === undefined))) fail(`${at}: a timer check needs a scheduling machine (engine stage E9), a unit like backup.timer and a next time YYYY-MM-DD HH:MM:SS`);
      if (c.kind === 'listen' || c.kind === 'dns' || c.kind === 'http' || c.kind === 'cert' || c.kind === 'nginx' || c.kind === 'cache' || c.kind === 'container' || c.kind === 'image' || c.kind === 'build' || c.kind === 'volume' || c.kind === 'network') { const p = serverCheckProblems(c, levelsOf(valid.get(x.machine) ?? {}), known); if (p) fail(`${at}: ${p}`); }
      // Fix (E19 batch): an output check may require that the answer came from a command matching fromCommand (a regular expression).
      if (c.kind === 'output' && c.fromCommand !== undefined) { try { new RegExp(c.fromCommand); } catch { fail(`${at}: fromCommand is not a regular expression`); } }
      // E16–E17: reach, firewall and tunnel may also name the exercise's machine itself.
      if (c.kind === 'reach' || c.kind === 'firewall' || c.kind === 'tunnel') {
        const self = valid.get(x.machine)?.host ?? 'logic-island';
        const p = serverCheckProblems(c, levelsOf(valid.get(x.machine) ?? {}), h => h === self || known(h));
        if (p) fail(`${at}: ${p}`);
      }
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
      if (v.now !== undefined && rankOf(machine) < RANK.processes) fail(`${at}: variant ${v.label}: now needs the processes profile (engine stage E4)`);
      if (v.dnsCache !== undefined && rankOf(machine) < RANK.dns) fail(`${at}: variant ${v.label}: dnsCache needs the dns profile (engine stage E11)`);
      if (v.upstreamConnections !== undefined && rankOf(machine) < RANK.proxy) fail(`${at}: variant ${v.label}: upstreamConnections needs the proxy profile (engine stage E15)`);
      if (v.accounts !== undefined && rankOf(machine) < RANK.users) fail(`${at}: variant ${v.label}: accounts needs the users profile (engine stage E3)`);
      if (v.packages !== undefined && rankOf(machine) < RANK.packages) fail(`${at}: variant ${v.label}: packages needs the packages profile (engine stage E5)`);
      if (v.paths !== undefined && rankOf(machine) < RANK.diagnostics) fail(`${at}: variant ${v.label}: paths needs the diagnostics profile (engine stage E19)`);
      if (v.docker !== undefined && rankOf(machine) < RANK.containers) fail(`${at}: variant ${v.label}: docker needs the containers profile (engine stage E20)`);
      for (const r of v.remotes ?? []) if (!(machine.remotes ?? []).some(m => m.host === r.host)) fail(`${at}: variant ${v.label}: remote ${r.host} is not a remote of the machine`);
      const p = machineProblems(variantMachine(machine, v));
      if (p.length) { variantsOk = false; for (const q of p) fail(`${at}: variant ${v.label}: ${q}`); }
    }
    if (!variantsOk) continue;
    // E7–E9: standard error also carries information there (ssh's warnings, ssh-copy-id's INFO lines, set -x), so a
    // reference solution's commands must succeed (exit status 0); below, as before, they must print nothing on it.
    const steps = replay(machine, x.solution, profile).steps;
    if (rankOf(machine) >= RANK.remote) for (const s of steps.filter(s => s.status !== undefined && s.status !== 0)) fail(`${at}: the solution's command ${s.command} fails with status ${s.status}: ${s.output}`);
    else for (const s of steps.filter(s => s.lines.some(l => l.kind === 'err'))) fail(`${at}: the solution's command ${s.command} prints an error: ${s.output}`);
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
