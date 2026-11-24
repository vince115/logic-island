import { LIMITS, type FsState } from './fs';
import { base64, sha256 } from './ssh';
import { parseTime } from './clock';
import { commOf } from './processes';
import { ETC_SERVICES, inSubnet, isIPv4, isLoopback, listenProblem, macFor, networkOf, parseCidr, ipNumber, ipText, TCP_STATES, type Conn, type Iface, type Listen, type TcpState } from './sockets';
import { absolute, dnsValues, loadNamed, loadZone, RR_TYPES, shownName, type CacheEntry, type RrType, type Zone } from './dns';
import { HTTP_METHODS, probe, responseHeader, type Responder } from './http';
import type { Resolver } from './sockets';
import type { TerminalFile, TerminalMachine, TerminalProcess, TerminalRemote, TerminalService } from './lesson';
import type { Program } from './services';
import { describeWebCheck, expandWeb, webCheckProblems, webFailure, webProblems, webState, type WebCheck } from './web-lesson';
import { describeNetCheck, expandNet, netCheckProblems, netFailure, netProblems, netState, sshConfigFiles, viewOfHost, type NetCheck } from './net-lesson';
import { machineState } from './lesson';
import { describeEdgeCheck, edgeCheckProblems, edgeFailure, edgeProblems, edgeState, expandEdge, type EdgeCheck } from './edge-lesson';
import { describeDockerCheck, dockerCheckProblems, dockerFailure, dockerProblems, dockerState, expandDocker, type DockerCheck } from './docker-lesson';
import { expandGit, gitProblems, gitState } from './git-lesson';
import { describeGitCheck, gitCheckProblems, gitFailure, type GitCheck } from './git-checks';
import { forgeProblems, forgeState } from './forge-lesson';
import { describeForgeCheck, forgeCheckProblems, forgeFailure, type ForgeCheck } from './forge-checks';
import { workflowProblems, workflowState } from './workflow-lesson';
import { describeWorkflowCheck, workflowCheckProblems, workflowFailure, type WorkflowCheck } from './workflow-checks';
import { actionsProblems, actionsState } from './actions-lesson';
import { describeRunCheck, runCheckProblems, runFailure, type RunCheck } from './actions-checks';
import { artifactsProblems, artifactsState } from './artifacts-lesson';
import { artifactsCheckProblems, artifactsFailure, commitProblem, commitTag, describeArtifactsCheck, describeCommit, type ArtifactsCheck } from './artifacts-checks';
import { settleArt } from './artifacts-run';
import { environmentsProblems, environmentsState } from './environments-lesson';
import { describeEnvironmentsCheck, environmentsCheckProblems, environmentsFailure, type EnvironmentsCheck } from './environments-checks';
import { deployProblems, deployState } from './deploy-lesson';
import { deployCheckFailure, deployCheckProblems, describeDeployCheck, isDeployCheck } from './deploy-checks';
import { expandKube, kubeProblems, kubeState } from './kube-lesson';
import { describeKubeCheck, kubeCheckProblems, kubeFailure, type KubeCheck } from './kube-checks';
import { describeWorkloadCheck, workloadCheckProblems, workloadFailure, type WorkloadCheck } from './kube-workload-checks';
import { configCheckFailure, configCheckProblems, describeConfigCheck, type ConfigCheck } from './kube-config-checks';
import { checkPlace, describeServiceCheck, kubeReachFailure, podCheckProblem, serviceCheckFailure, serviceCheckProblems, type ServiceCheck } from './kube-service-checks';
import { kubeResolver } from './kube-dns';

/*
 * Engine stages E10–E12 as lesson data (docs/curriculum/SRV0_SERVER_CAPABILITY.md §9). A machine of the sockets profile is
 * completed with what an Ubuntu 24.04 server has unless the lesson lists it: /etc/hosts (with the lesson's other machines),
 * /etc/services, and systemd-resolved listening on 127.0.0.53 (resolved: false leaves it out); a dns machine also gets
 * /etc/resolv.conf, and with `named` the BIND server (its configuration, unit, the bind user and the named process on port
 * 53). The machine's interfaces, connections, resolver cache, internet zones and HTTP responders become its state. Every
 * field is allowed only from its own profile up, and the checks listen, dns and http read the machine after the commands.
 */

/** E10: an interface address, a.b.c.d/nn (lo is always there). */
export interface TerminalInterface { name: string; address: string; mac?: string }
/** E10: an established or closing TCP connection: local and peer as a.b.c.d:port; pid holds it (not in TIME-WAIT). */
export interface TerminalConnection { local: string; peer: string; state?: TcpState; pid?: number; fd?: number }
/** E11: an entry of the resolver's cache; cachedAt is when it was stored (UTC), so its TTL left is ttl − (now − cachedAt). */
export interface TerminalCacheEntry { name: string; type: RrType; ttl: number; cachedAt: string; data?: string[]; negative?: 'NXDOMAIN' | 'NODATA'; soa?: string }
/** E11: a zone of the rest of the internet (the local machine's resolver can always reach it). */
export interface TerminalZone { zone: string; text: string }
export type TerminalListen = Listen;
export type TerminalResponder = Responder;
/** Which of the stages a machine's profile has. */
export interface ServerLevels { sockets: boolean; dns: boolean; http: boolean; tls: boolean; nginx: boolean; proxy: boolean; firewall: boolean; tunnels: boolean; edge: boolean; diagnostics: boolean; containers: boolean; images: boolean; storageNet: boolean; compose?: boolean; runtime?: boolean; git?: boolean; forge?: boolean; workflows?: boolean; actions?: boolean; artifacts?: boolean; environments?: boolean; deployHosts?: boolean; cluster?: boolean; probes?: boolean; workloads?: boolean; kubeNet?: boolean; kubeConfig?: boolean }

/** E10–E12 (lesson checks). */
export type ServerCheck =
  /** E10: something listens on the port (proto, address and process name — ps's comm — when given), or nothing does (absent). */
  | { kind: 'listen'; port: number; proto?: 'tcp' | 'udp'; address?: string; process?: string; absent?: true; host?: string }
  /** E11: the name has these records (dig +short's text, in any order), or none of the type (absent). server: ask that host's named; else the local resolver. */
  | { kind: 'dns'; name: string; type?: RrType; values?: string[]; absent?: true; server?: string }
  /**
   * E12: a GET of the URL (no redirects followed) answers this status, header (name and value) and a body containing this text.
   * E18 (edge): more headers that must be there, and request headers to send (a conditional request: If-None-Match…).
   */
  | { kind: 'http'; url: string; status?: number; header?: [string, string]; body?: string; host?: string; headers?: [string, string][]; requestHeaders?: [string, string][]; /** E35: the request comes from inside this pod (ns/name or name). */ pod?: string }
  /** E13–E14: cert and nginx (web-lesson.ts). */
  | WebCheck
  /** E15–E17: reach, firewall and tunnel (net-lesson.ts). */
  | NetCheck
  /** E18: cache (edge-lesson.ts). */
  | EdgeCheck
  /** E20: container and image; E21: image's config and layers, build (docker-lesson.ts). */
  | DockerCheck
  /** E25: branch, worktree and tag (git-checks.ts). */
  | GitCheck
  /** E26: pull-request and protection (forge-checks.ts). */
  | ForgeCheck
  /** E27: workflow (workflow-checks.ts). */
  | WorkflowCheck
  /** E28: run (actions-checks.ts). */
  | RunCheck
  /** E29: secret and variable (artifacts-checks.ts). */
  | ArtifactsCheck
  /** E30: environment and deployment (environments-checks.ts). */
  | EnvironmentsCheck
  /** E32: kube-object and kube-pod (kube-checks.ts). E34: kube-workload and kube-rollout (kube-workload-checks.ts). E35: kube-service (kube-service-checks.ts). E36: kube-config (kube-config-checks.ts). */
  | KubeCheck | WorkloadCheck | ServiceCheck | ConfigCheck;

export const RESOLV_CONF = '# This is /run/systemd/resolve/stub-resolv.conf managed by man:systemd-resolved(8).\n# Do not edit.\n\nnameserver 127.0.0.53\noptions edns0 trust-ad\nsearch .\n';
const NAMED_CONF = '// This is the primary configuration file for the BIND DNS server named.\n\ninclude "/etc/bind/named.conf.options";\ninclude "/etc/bind/named.conf.local";\n';
const NAMED_OPTIONS = 'options {\n\tdirectory "/var/cache/bind";\n\trecursion no;\n\tlisten-on { any; };\n};\n';
const NAMED_LOCAL = '//\n// Do any local configuration here\n//\n';
const NAMED_UNIT = '[Unit]\nDescription=BIND Domain Name Server\nDocumentation=man:named(8)\nAfter=network.target\n\n[Service]\nType=forking\nEnvironmentFile=-/etc/default/named\nExecStart=/usr/sbin/named $OPTIONS\nExecReload=/usr/sbin/rndc reload\nExecStop=/usr/sbin/rndc stop\nRestart=on-failure\n\n[Install]\nWantedBy=multi-user.target\nAlias=bind9.service\n';
const RESOLVED_UNIT = '[Unit]\nDescription=Network Name Resolution\nDocumentation=man:systemd-resolved.service(8)\nAfter=systemd-sysusers.service\n\n[Service]\nType=notify\nExecStart=/usr/lib/systemd/systemd-resolved\nUser=systemd-resolve\nRestart=always\n\n[Install]\nWantedBy=multi-user.target\n';
const RESOLVED_LISTEN: Listen[] = [
  { proto: 'udp', address: '127.0.0.53', port: 53, fd: 13 }, { proto: 'tcp', address: '127.0.0.53', port: 53, fd: 14 },
  { proto: 'udp', address: '127.0.0.54', port: 53, fd: 15 }, { proto: 'tcp', address: '127.0.0.54', port: 53, fd: 16 },
];

/** The interfaces of a machine as data: its own, or eth0 with its address (E7's address, default 10.0.0.10) in a /24. */
export function interfacesOfMachine(m: Pick<TerminalMachine, 'interfaces' | 'address' | 'id' | 'host'>): Iface[] {
  const list = m.interfaces ?? [{ name: 'eth0', address: `${m.address ?? '10.0.0.10'}/24` }];
  return list.map(i => {
    const c = parseCidr(i.address) ?? { address: '0.0.0.0', prefix: 32 };
    return { name: i.name, address: c.address, prefix: c.prefix, mac: i.mac ?? macFor(`${m.host ?? m.id}/${i.name}`) };
  });
}

function hostsText(host: string, remotes: readonly Pick<TerminalRemote, 'host' | 'address' | 'aliases'>[]): string {
  return ['127.0.0.1 localhost', `127.0.1.1 ${host}`, ...remotes.map(r => [r.address, r.host, ...r.aliases ?? []].join(' ')), '',
    '# The following lines are desirable for IPv6 capable hosts', '::1 localhost ip6-localhost ip6-loopback', 'ff02::1 ip6-allnodes', 'ff02::2 ip6-allrouters', ''].join('\n');
}
const namedListen = (ifaces: readonly Iface[]): Listen[] => {
  const out: Listen[] = [];
  let fd = 20;
  for (const a of ['127.0.0.1', ...ifaces.map(i => i.address)]) out.push({ proto: 'udp', address: a, port: 53, fd: fd++ }, { proto: 'tcp', address: a, port: 53, fd: fd++, backlog: 10 });
  out.push({ proto: 'tcp', address: '127.0.0.1', port: 953, fd: fd++, backlog: 10 });
  return out;
};

/**
 * A sockets (dns, http) machine with what Ubuntu has unless the lesson lists it. Idempotent: a listed path, process,
 * user or group is never added again. The files are sorted so every folder comes before what it holds.
 */
export function expandServer(m: TerminalMachine, lv: ServerLevels): TerminalMachine {
  if (!lv.sockets) return m;
  const listed = new Set(m.files.map(f => f.path)), files: TerminalFile[] = [...m.files];
  const add = (f: TerminalFile) => { if (!listed.has(f.path)) { listed.add(f.path); files.push(f); } };
  const dir = (path: string, mode = 0o755, group?: string) => add({ path, kind: 'dir', mode, owner: 'root', ...group ? { group } : {} });
  const file = (path: string, content: string, mode = 0o644, owner = 'root', group?: string) => add({ path, kind: 'file', mode, owner, ...group ? { group } : {}, content });
  const link = (path: string, target: string) => add({ path, kind: 'link', mode: 0o777, owner: 'root', target });
  const users = [...m.accounts?.users ?? []], groups = [...m.accounts?.groups ?? []];
  const addUser = (name: string, uid: number, gid: number, home: string, comment: string) => {
    if (users.some(u => u.name === name)) return;
    if (!groups.some(g => g.name === name)) groups.push({ name, gid });
    users.push({ name, uid, group: name, home, shell: '/usr/sbin/nologin', comment });
  };
  const procs: TerminalProcess[] = [...m.processes ?? []], programs: Program[] = [...m.programs ?? []], services: TerminalService[] = [...m.services ?? []];
  const pidFrom = (want: number) => { let p = want; while (procs.some(x => x.pid === p)) p++; return p; };
  const unitDirs = () => ['/etc/systemd', '/etc/systemd/system', '/etc/systemd/system/multi-user.target.wants', '/usr', '/usr/lib', '/usr/lib/systemd', '/usr/lib/systemd/system'].forEach(d => dir(d));
  dir('/etc');
  file('/etc/hosts', hostsText(m.host ?? 'logic-island', m.remotes ?? m.peers ?? []));
  file('/etc/services', ETC_SERVICES);
  if (lv.dns) file('/etc/resolv.conf', RESOLV_CONF);
  if (m.resolved !== false && !procs.some(p => commOf(p.command) === 'systemd-resolve')) {
    addUser('systemd-resolve', 991, 991, '/', 'systemd Resolver');
    unitDirs();
    file('/usr/lib/systemd/systemd-resolved', '', 0o755);
    file('/usr/lib/systemd/system/systemd-resolved.service', RESOLVED_UNIT);
    link('/etc/systemd/system/multi-user.target.wants/systemd-resolved.service', '/usr/lib/systemd/system/systemd-resolved.service');
    if (!programs.some(p => p.path === '/usr/lib/systemd/systemd-resolved')) programs.push({ path: '/usr/lib/systemd/systemd-resolved', rss: 12800, vsz: 21600, listen: RESOLVED_LISTEN });
    procs.push({ pid: pidFrom(600), user: 'systemd-resolve', command: '/usr/lib/systemd/systemd-resolved', stat: 'Ss', rss: 12800, vsz: 21600, unit: 'systemd-resolved.service', listen: RESOLVED_LISTEN });
  }
  if (lv.dns && m.named !== undefined && !procs.some(p => commOf(p.command) === 'named') && !services.some(s => s.unit === 'named.service')) {
    addUser('bind', 111, 113, '/var/cache/bind', '');
    dir('/etc/bind', 0o755, 'bind');
    file('/etc/bind/named.conf', NAMED_CONF, 0o644, 'root', 'bind');
    file('/etc/bind/named.conf.options', NAMED_OPTIONS, 0o644, 'root', 'bind');
    file('/etc/bind/named.conf.local', NAMED_LOCAL, 0o644, 'root', 'bind');
    file('/etc/bind/rndc.key', `key "rndc-key" {\n\talgorithm hmac-sha256;\n\tsecret "${base64(sha256(new TextEncoder().encode(`rndc/${m.host ?? m.id}`)))}";\n};\n`, 0o640, 'bind', 'bind');
    ['/var', '/var/cache'].forEach(d => dir(d));
    dir('/var/cache/bind', 0o775, 'bind');
    ['/usr', '/usr/sbin'].forEach(d => dir(d));
    file('/usr/sbin/named', '', 0o755);
    unitDirs();
    file('/usr/lib/systemd/system/named.service', NAMED_UNIT);
    link('/etc/systemd/system/multi-user.target.wants/named.service', '/usr/lib/systemd/system/named.service');
    const listen = namedListen(interfacesOfMachine(m));
    if (!programs.some(p => p.path === '/usr/sbin/named')) programs.push({ path: '/usr/sbin/named', title: '/usr/sbin/named -f -u bind', rss: 30720, vsz: 249856, listen });
    if (m.named === 'stopped') services.push({ unit: 'named.service', active: 'inactive' });
    else procs.push({ pid: pidFrom(800), user: 'bind', command: '/usr/sbin/named -f -u bind', stat: 'Ssl', rss: 30720, vsz: 249856, unit: 'named.service', listen });
  }
  // E13–E14: the trust store, the lesson's certificates, certbot and nginx.
  expandWeb(m, lv, { file: add, dir, listed: p => listed.has(p) }, procs, programs, services, pidFrom);
  // E16–E17: ufw's application profiles and /etc/nftables.conf; the learner's ~/.ssh/config.
  expandNet(m, lv, { file: add, dir });
  if (lv.tunnels) for (const f of sshConfigFiles(m, m.home ?? (m.user === 'root' ? '/root' : `/home/${m.user}`))) add(f);
  // E19: the lesson's capture files.
  expandEdge(m, lv, { file: add, dir });
  // E20: Docker CE (the docker group, the socket, docker.service and containerd.service).
  expandDocker(m, lv, { file: add, dir }, procs, programs, services, pidFrom, groups);
  // E25: the repositories' worktrees and .git folders, ~/.gitconfig.
  expandGit(m, !!lv.git, { file: add });
  // E32: ~/.kube/config (the cluster's admin kubeconfig).
  expandKube(m, !!lv.cluster, { file: add });
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return { ...m, files, processes: procs, programs, services, ...users.length || groups.length ? { accounts: { ...m.accounts, users, groups } } : {} };
}

const endpoint = (text: string) => { const m = /^(\d+\.\d+\.\d+\.\d+):(\d+)$/.exec(text); return m && isIPv4(m[1]) && Number(m[2]) >= 1 && Number(m[2]) <= 65535 ? { address: m[1], port: Number(m[2]) } : undefined; };
const cacheOf = (e: TerminalCacheEntry): CacheEntry => {
  const base = { name: absolute(e.name).toLowerCase(), type: e.type, ttl: e.ttl, cachedAt: parseTime(e.cachedAt) ?? 0 };
  return e.negative ? { ...base, negative: e.negative, ...e.soa ? { soa: e.soa } : {} } : { ...base, data: [...e.data ?? []] };
};

/** The E10–E12 parts of a machine's state (on the state machineState built from the expanded machine). */
export function serverState(m: TerminalMachine, state: FsState, lv: ServerLevels): FsState {
  if (!lv.sockets) return state;
  const interfaces = interfacesOfMachine(m), eth = interfaces[0];
  const gateway = m.gateway ?? (eth && eth.prefix < 31 ? ipText(ipNumber(networkOf(eth.address, eth.prefix)) + 1) : undefined);
  const connections: Conn[] = (m.connections ?? []).map(c => ({ local: endpoint(c.local)!, peer: endpoint(c.peer)!, state: c.state ?? 'ESTAB', ...c.pid !== undefined ? { pid: c.pid } : {}, ...c.fd !== undefined ? { fd: c.fd } : {} }));
  let next: FsState = { ...state, sockets: { interfaces, ...gateway ? { gateway } : {}, connections } };
  if (lv.dns) {
    const internet: Zone[] = (m.internet ?? []).map(z => loadZone(z.zone, z.text, z.zone).zone).filter((z): z is Zone => !!z);
    next = { ...next, dns: { cache: (m.dnsCache ?? []).map(cacheOf), ...internet.length ? { internet } : {}, queries: 0 } };
    if (m.named !== undefined) next = { ...next, dns: { ...next.dns!, named: loadNamed(next).zones } };
  }
  if (lv.http) next = { ...next, http: { responders: (m.responders ?? []).map(r => ({ ...r, routes: r.routes.map(x => ({ ...x })) })) } };
  return kubeState(m, deployState(m, environmentsState(m, artifactsState(m, actionsState(m, workflowState(m, forgeState(m, gitState(m, dockerState(m, edgeState(m, netState(m, webState(m, next, lv), lv), lv), lv), !!lv.git), !!lv.forge), !!lv.workflows), !!lv.actions, !!lv.artifacts, !!lv.deployHosts), !!lv.artifacts), !!lv.environments), !!lv.deployHosts), !!lv.cluster, !!lv.probes, !!lv.workloads, !!lv.kubeNet, !!lv.kubeConfig);
}

const LINE = (max: number) => (t: unknown) => typeof t === 'string' && t.length >= 1 && t.length <= max && !t.includes('\n');
const whole = (x: unknown, min: number, max: number) => Number.isInteger(x) && (x as number) >= min && (x as number) <= max;
const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,64}$/;

/** E10–E12: the problems of a machine's (expanded) server data; `own` is whether listen addresses are checked against it. */
export function serverProblems(m: TerminalMachine, lv: ServerLevels, names?: readonly string[]): string[] {
  const problems: string[] = [...webProblems(m, lv), ...netProblems(m, lv, () => machineState(m)), ...edgeProblems(m, lv, names), ...dockerProblems(m, lv), ...gitProblems(m, !!lv.git), ...forgeProblems(m, !!lv.forge), ...workflowProblems(m, !!lv.workflows), ...actionsProblems(m, !!lv.actions), ...artifactsProblems(m, !!lv.artifacts), ...environmentsProblems(m, !!lv.environments), ...deployProblems(m, !!lv.deployHosts), ...kubeProblems(m, !!lv.cluster, !!lv.probes, !!lv.workloads, !!lv.kubeNet, !!lv.kubeConfig)], fail = (what: string) => problems.push(what);
  const listens = [...(m.processes ?? []).flatMap(p => p.listen ?? []), ...(m.programs ?? []).flatMap(p => p.listen ?? [])];
  if (!lv.sockets && (m.interfaces !== undefined || m.gateway !== undefined || m.connections !== undefined || m.resolved !== undefined || listens.length))
    fail('interfaces, gateway, connections, resolved and listen need the sockets profile (engine stage E10)');
  if (!lv.dns && (m.named !== undefined || m.dnsCache !== undefined || m.internet !== undefined)) fail('named, dnsCache and internet need the dns profile (engine stage E11)');
  if (!lv.http && (m.responders !== undefined || listens.some(l => l.http !== undefined))) fail('responders and listen.http need the http profile (engine stage E12)');
  if (problems.length || !lv.sockets) return problems;
  const ifaces = m.interfaces ?? [];
  if (ifaces.length > 4) fail('at most 4 interface addresses');
  const seen = new Set<string>();
  for (const i of ifaces) {
    const at = `interface ${i.name} ${i.address}`, c = parseCidr(i.address);
    if (!/^[a-z][a-z0-9]{0,14}$/.test(i.name) || i.name === 'lo') fail(`${at}: invalid name (lo is always there)`);
    if (!c || c.prefix < 8 || isLoopback(c.address) || c.address === '0.0.0.0') fail(`${at}: needs an address a.b.c.d/8..32 that is not loopback`);
    else if (seen.has(c.address)) fail(`${at}: the address is listed twice`);
    if (c) seen.add(c.address);
    if (i.mac !== undefined && !/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(i.mac)) fail(`${at}: mac must look like 52:54:00:12:34:56`);
  }
  if (m.interfaces !== undefined && m.address !== undefined && !ifaces.some(i => parseCidr(i.address)?.address === m.address)) fail(`address ${m.address} is not an interface address`);
  const own = interfacesOfMachine(m);
  if (m.gateway !== undefined && (!isIPv4(m.gateway) || !own.some(i => inSubnet(m.gateway!, i.address, i.prefix)) || own.some(i => i.address === m.gateway))) fail(`gateway ${m.gateway} must be another address in an interface's network`);
  const mine = (a: string) => a === '0.0.0.0' || isLoopback(a) || own.some(i => i.address === a);
  const responders = new Set((m.responders ?? []).map(r => r.id));
  const check = (l: Listen, at: string) => {
    if (!whole(l.port, 1, 65535)) fail(`${at}: port must be 1..65535`);
    if (l.address !== undefined && (!isIPv4(l.address) || !mine(l.address))) fail(`${at}: address ${l.address} is not 0.0.0.0, loopback or an address of the machine`);
    if (l.proto !== undefined && l.proto !== 'tcp' && l.proto !== 'udp') fail(`${at}: proto must be tcp or udp`);
    if (l.fd !== undefined && !whole(l.fd, 3, 1023)) fail(`${at}: fd must be 3..1023`);
    if (l.backlog !== undefined && !whole(l.backlog, 0, 65535)) fail(`${at}: backlog must be 0..65535`);
    if (l.http !== undefined && ((l.proto ?? 'tcp') !== 'tcp' || !responders.has(l.http))) fail(`${at}: http needs a TCP listener and a responder with the id ${l.http}`);
  };
  const running: { l: Listen; pid: number }[] = [];
  for (const p of m.processes ?? []) for (const l of p.listen ?? []) { check(l, `process ${p.pid} listen ${l.port}`); running.push({ l, pid: p.pid }); }
  for (const p of m.programs ?? []) for (const l of p.listen ?? []) check(l, `program ${p.path} listen ${l.port}`);
  running.forEach((a, i) => running.slice(i + 1).forEach(b => {
    const pa = a.l.proto ?? 'tcp', pb = b.l.proto ?? 'tcp', aa = a.l.address ?? '0.0.0.0', ab = b.l.address ?? '0.0.0.0';
    if (pa === pb && a.l.port === b.l.port && (aa === '0.0.0.0' || ab === '0.0.0.0' || aa === ab)) fail(`processes ${a.pid} and ${b.pid} both listen on ${pa} port ${a.l.port} (Address already in use)`);
  }));
  const pids = new Set((m.processes ?? []).map(p => p.pid));
  for (const [k, c] of (m.connections ?? []).entries()) {
    const at = `connection ${k + 1}`, l = endpoint(c.local), p = endpoint(c.peer);
    if (!l || !p) { fail(`${at}: local and peer must be a.b.c.d:port`); continue; }
    if (!own.some(i => i.address === l.address) && !isLoopback(l.address)) fail(`${at}: ${l.address} is not an address of the machine`);
    if (c.state !== undefined && !(TCP_STATES as readonly string[]).includes(c.state)) fail(`${at}: state must be one of ${TCP_STATES.join(', ')}`);
    if (c.pid !== undefined && (!pids.has(c.pid) || c.state === 'TIME-WAIT')) fail(`${at}: pid must be a process of the machine (none in TIME-WAIT)`);
  }
  if ((m.connections ?? []).length > 40) fail('at most 40 connections');
  if (m.resolved !== undefined && typeof m.resolved !== 'boolean') fail('resolved must be true or false');
  if (!lv.dns) return problems;
  if (m.named !== undefined && m.named !== true && m.named !== 'stopped') fail('named must be true or stopped');
  const now = parseTime(m.now ?? '2026-11-22 10:00:00') ?? 0;
  if ((m.dnsCache ?? []).length > 100) fail('at most 100 cache entries');
  for (const [k, e] of (m.dnsCache ?? []).entries()) {
    const at = `dnsCache entry ${k + 1} (${e.name})`, t = parseTime(e.cachedAt);
    if (!LINE(253)(e.name) || !/^[A-Za-z0-9_.*-]+$/.test(e.name)) fail(`${at}: invalid name`);
    if (!(RR_TYPES as readonly string[]).includes(e.type)) fail(`${at}: type must be one of ${RR_TYPES.join(', ')}`);
    if (!whole(e.ttl, 0, 2147483647)) fail(`${at}: ttl must be 0..2147483647 seconds`);
    if (t === undefined || t > now) fail(`${at}: cachedAt must be a time YYYY-MM-DD HH:MM:SS not after now`);
    if (e.negative !== undefined ? !['NXDOMAIN', 'NODATA'].includes(e.negative) || e.data !== undefined : !e.data?.length || e.data.some(d => !LINE(255)(d))) fail(`${at}: needs data (one line each), or negative NXDOMAIN or NODATA without data`);
    if (e.soa !== undefined && (!e.negative || !LINE(300)(e.soa))) fail(`${at}: soa is only for a negative entry`);
  }
  if ((m.internet ?? []).length > 8) fail('at most 8 internet zones');
  for (const z of m.internet ?? []) {
    if ((z.text ?? '').length > LIMITS.fileLength) { fail(`internet zone ${z.zone}: longer than ${LIMITS.fileLength}`); continue; }
    const r = loadZone(z.zone, z.text ?? '', z.zone);
    if (!r.zone) fail(`internet zone ${z.zone}: ${r.messages.join(' / ')}`);
  }
  if (!lv.http) return problems;
  const ids = new Set<string>();
  if ((m.responders ?? []).length > 8) fail('at most 8 responders');
  for (const r of m.responders ?? []) {
    const at = `responder ${r.id}`;
    if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(r.id) || ids.has(r.id)) fail(`${at}: needs a unique id of a-z, 0-9 and -`);
    ids.add(r.id);
    if (r.server !== undefined && !LINE(64)(r.server)) fail(`${at}: server needs 1..64 characters on one line`);
    if (!Array.isArray(r.routes) || (!r.routes.length && !(lv.edge && r.cdn)) || r.routes.length > 30) { fail(`${at}: needs 1..30 routes`); continue; }
    for (const x of r.routes) {
      const rt = `${at} route ${x.path}`;
      if (!LINE(200)(x.path) || !x.path.startsWith('/') || /\s/.test(x.path)) fail(`${rt}: the path must start with / and have no spaces`);
      if (x.host !== undefined && !/^[a-z0-9.-]{1,253}$/.test(x.host)) fail(`${rt}: invalid host`);
      if (x.methods !== undefined && (!x.methods.length || x.methods.some(v => !(HTTP_METHODS as readonly string[]).includes(v)))) fail(`${rt}: methods must be among ${HTTP_METHODS.join(', ')}`);
      if (x.status !== undefined && !whole(x.status, 100, 599)) fail(`${rt}: status must be 100..599`);
      if (x.redirect !== undefined && (!LINE(500)(x.redirect) || (x.status !== undefined && (x.status < 300 || x.status > 399)))) fail(`${rt}: a redirect needs a one-line location and a 3xx status`);
      if ((x.headers ?? []).some(([k, v]) => !HEADER_NAME.test(k) || !LINE(500)(v))) fail(`${rt}: each header needs a name and a one-line value`);
      if (x.body !== undefined && x.body.length > LIMITS.fileLength) fail(`${rt}: the body is longer than ${LIMITS.fileLength}`);
      if (x.type !== undefined && !LINE(100)(x.type)) fail(`${rt}: type needs one line`);
    }
  }
  return problems;
}

/** E10–E12: the problems of a check (machine: the exercise's machine; rank: what its profile has; known: whether a host is a remote). */
export function serverCheckProblems(c: ServerCheck, lv: ServerLevels, known: (host: string) => boolean): string | null {
  switch (c.kind) {
    case 'listen':
      if (!lv.sockets || !whole(c.port, 1, 65535) || (c.proto !== undefined && c.proto !== 'tcp' && c.proto !== 'udp') || (c.address !== undefined && !isIPv4(c.address)) || (c.host !== undefined && !known(c.host)))
        return 'a listen check needs a sockets machine (engine stage E10), a port 1..65535, tcp or udp, an IPv4 address and a known host';
      return null;
    case 'dns':
      if (!lv.dns || !/^[A-Za-z0-9_.*-]{1,253}$/.test(c.name) || (c.type !== undefined && !(RR_TYPES as readonly string[]).includes(c.type)) || (c.server !== undefined && !known(c.server)) || (c.absent && c.values !== undefined))
        return 'a dns check needs a dns machine (engine stage E11), a name, a type among A AAAA CNAME MX TXT NS SOA, a known server and not both absent and values';
      return null;
    case 'http':
      if (c.pod !== undefined && (c.host !== undefined || podCheckProblem(c.pod, !!lv.kubeNet))) return c.host !== undefined ? 'an http check has a host or a pod, not both' : podCheckProblem(c.pod, !!lv.kubeNet);
      if (!lv.http || !(lv.tls ? /^https?:\/\/[^\s/]+/ : /^http:\/\/[^\s/]+/).test(c.url) || (c.status !== undefined && !whole(c.status, 100, 599)) || (c.host !== undefined && !known(c.host)))
        return 'an http check needs an http machine (engine stage E12), an http:// URL (https:// from the tls profile, E13), a status 100..599 and a known host';
      if ((c.headers !== undefined || c.requestHeaders !== undefined) && (!lv.edge || [...c.headers ?? [], ...c.requestHeaders ?? []].some(h => !Array.isArray(h) || h.length !== 2 || !HEADER_NAME.test(h[0]) || !LINE(500)(h[1]))))
        return 'headers and requestHeaders of an http check need an edge machine (engine stage E18) and [name, value] pairs';
      return null;
    case 'cache': return edgeCheckProblems(c, lv, known);
    case 'container': case 'image': case 'build': case 'volume': case 'network': case 'compose': case 'registry':
      // E31: a container or image check on a host (or a container's image by digest).
      if (isDeployCheck(c)) return deployCheckProblems(c, lv, known);
      // E29: a registry check's tag may end with a branch's current commit.
      if (c.kind === 'registry' && c.commit !== undefined) { const p = commitProblem(c.commit, !!lv.artifacts); if (p) return p; }
      return dockerCheckProblems(c, lv);
    case 'cert': case 'nginx': return webCheckProblems(c, lv, known);
    case 'branch': case 'worktree': case 'tag': return gitCheckProblems(c, !!lv.git);
    case 'pull-request': case 'protection': return forgeCheckProblems(c, !!lv.forge);
    case 'workflow': return workflowCheckProblems(c, !!lv.workflows);
    case 'run': return runCheckProblems(c, !!lv.actions, !!lv.artifacts, !!lv.environments);
    case 'environment': case 'deployment': return environmentsCheckProblems(c, !!lv.environments);
    case 'kube-object': case 'kube-pod': return kubeCheckProblems(c, !!lv.cluster, !!lv.kubeConfig);
    case 'kube-workload': case 'kube-rollout': return workloadCheckProblems(c, !!lv.workloads);
    case 'kube-service': return serviceCheckProblems(c, !!lv.kubeNet);
    case 'kube-config': return configCheckProblems(c, !!lv.kubeConfig);
    case 'secret': case 'variable': return artifactsCheckProblems(c, !!lv.artifacts);
    // E22: a reach check from a container is the daemon's (docker-lesson.ts).
    // E35: a reach check from a pod names its target as the pod would (cluster DNS).
    case 'reach': return 'container' in c ? dockerCheckProblems(c, lv) : c.pod !== undefined ? podCheckProblem(c.pod, !!lv.kubeNet) ?? (c.from !== undefined ? 'a reach check has a from or a pod, not both' : netCheckProblems({ ...c, to: '127.0.0.1' }, lv, known)) : netCheckProblems(c, lv, known);
    case 'firewall': case 'tunnel': return netCheckProblems(c, lv, known);
  }
}

/** E10–E12 (lesson checks): what the check asks for, in words. */
export function describeServerCheck(c: ServerCheck): string {
  const on = (h?: string) => h ? `${h} 上` : '';
  switch (c.kind) {
    case 'listen': return c.absent ? `${on(c.host)}應該沒有程式監聽 ${c.proto ?? 'tcp'} ${c.port} 埠` : `${on(c.host)}應該有${c.process ? ` ${c.process} ` : '程式'}在 ${c.address ?? ''}${c.address ? ':' : ''}${c.port}（${c.proto ?? 'tcp'}）監聽`;
    case 'dns': {
      const where = c.server ? `${c.server} 的權威資料中` : '本機解析器查到的';
      return c.absent ? `${where} ${c.name} 應該沒有 ${c.type ?? 'A'} 記錄` : `${where} ${c.name} 的 ${c.type ?? 'A'} 記錄應該是${c.values ? ` ${c.values.join('、')}` : '存在的'}`;
    }
    case 'http': {
      const parts = [c.status !== undefined ? `狀態碼 ${c.status}` : '', c.header ? `標頭 ${c.header[0]}: ${c.header[1]}` : '', c.body !== undefined ? `內容包含「${c.body}」` : ''].filter(Boolean);
      const more = (c.headers ?? []).map(([k, v]) => `標頭 ${k}: ${v}`), sent = (c.requestHeaders ?? []).map(([k, v]) => `${k}: ${v}`);
      return `${c.pod !== undefined ? `從 Pod ${c.pod} ` : on(c.host)}GET ${c.url}${sent.length ? `（帶著 ${sent.join('、')}）` : ''} 應該回應${[...parts, ...more].join('、') || '成功'}`;
    }
    case 'cache': return describeEdgeCheck(c);
    case 'container': case 'image': case 'build': case 'volume': case 'network': case 'compose': case 'registry':
      if (isDeployCheck(c)) return describeDeployCheck(c);
      return describeDockerCheck(c.kind === 'registry' && c.commit ? { ...c, tag: `${c.tag}<${describeCommit(c.commit)}>` } : c);
    case 'cert': case 'nginx': return describeWebCheck(c);
    case 'branch': case 'worktree': case 'tag': return describeGitCheck(c);
    case 'pull-request': case 'protection': return describeForgeCheck(c);
    case 'workflow': return describeWorkflowCheck(c);
    case 'run': return describeRunCheck(c);
    case 'secret': case 'variable': return describeArtifactsCheck(c);
    case 'environment': case 'deployment': return describeEnvironmentsCheck(c);
    case 'kube-object': case 'kube-pod': return describeKubeCheck(c);
    case 'kube-workload': case 'kube-rollout': return describeWorkloadCheck(c);
    case 'kube-service': return describeServiceCheck(c);
    case 'kube-config': return describeConfigCheck(c);
    case 'reach': return 'container' in c ? describeDockerCheck(c) : c.pod !== undefined ? describeNetCheck({ ...c, from: `Pod ${c.pod}` }) : describeNetCheck(c);
    case 'firewall': case 'tunnel': return describeNetCheck(c);
  }
}

const norm = (v: string) => v.trim().toLowerCase();
/** E10–E12 (lesson checks): why the check fails on the state after the commands (null: it holds). */
export function serverFailure(c: ServerCheck, end: FsState, hostState: (host: string) => FsState | undefined, resolve: Resolver): string | null {
  switch (c.kind) {
    case 'listen': {
      const s = c.host ? hostState(c.host) : end;
      return s ? listenProblem(s, c) : `沒有 ${c.host} 這台主機`;
    }
    case 'dns': {
      const server = c.server ? hostState(c.server) : undefined;
      if (c.server && !server) return `沒有 ${c.server} 這台主機`;
      const type = c.type ?? 'A', r = dnsValues(end, c.name, type, server);
      if (c.absent) return r.values.length ? `仍有記錄 ${r.values.join('、')}` : null;
      if (r.rcode !== 'NOERROR') return `查詢的結果是 ${r.rcode}`;
      if (!r.values.length) return `${shownName(absolute(c.name))} 沒有 ${type} 記錄`;
      if (c.values && (c.values.length !== r.values.length || c.values.map(norm).sort().join('\n') !== r.values.map(norm).sort().join('\n'))) return `目前是 ${r.values.join('、')}`;
      return null;
    }
    case 'http': {
      // E16: from the firewall profile up, a request from another host goes through the network (firewalls, tunnels) as from there.
      // E35: on a kube-net machine, from a pod (cluster DNS) or from the learner's machine with the cluster's outside.
      const place = end.kube?.net && !c.host ? checkPlace(end, c.pod) : undefined;
      if (place && 'error' in place) return place.error;
      const s = place ?? (c.host ? (end.firewall ? viewOfHost(end, c.host) : hostState(c.host)) : end);
      if (!s) return `沒有 ${c.host} 這台主機`;
      const r = probe(s, c.url, c.pod !== undefined ? kubeResolver : resolve, true, c.requestHeaders ?? []);
      if ('error' in r) return r.error;
      if (c.status !== undefined && r.status !== c.status) return `狀態碼是 ${r.status}`;
      for (const h of [...c.header ? [c.header] : [], ...c.headers ?? []]) { const v = responseHeader(r.headers, h[0]); if (v !== h[1]) return v === undefined ? `沒有 ${h[0]} 標頭` : `${h[0]} 是 ${v}`; }
      if (c.body !== undefined && !r.body.includes(c.body)) return '內容不包含題目要的文字';
      return null;
    }
    case 'cert': case 'nginx': return webFailure(c, end, hostState);
    // E29: effects of runs whose time has come (pushes with the GITHUB_TOKEN, images pushed to registries) first.
    case 'branch': case 'worktree': case 'tag': return gitFailure(c, settleArt(end));
    case 'pull-request': case 'protection': return forgeFailure(c, settleArt(end));
    case 'workflow': return workflowFailure(c, end);
    case 'run': return runFailure(c, end);
    case 'secret': case 'variable': return artifactsFailure(c, end);
    case 'environment': case 'deployment': return environmentsFailure(c, end);
    case 'kube-object': case 'kube-pod': return kubeFailure(c, end);
    case 'kube-workload': case 'kube-rollout': return workloadFailure(c, end);
    case 'kube-service': return serviceCheckFailure(c, end);
    case 'kube-config': return configCheckFailure(c, end);
    case 'reach': return 'container' in c ? dockerFailure(c, end) : end.kube?.net ? kubeReachFailure(c, end) : netFailure(c, end);
    case 'firewall': case 'tunnel': return netFailure(c, end);
    case 'cache': return edgeFailure(c, end, resolve, h => h === undefined ? end : end.firewall ? viewOfHost(end, h) : hostState(h));
    case 'container': case 'image': case 'build': case 'volume': case 'network': case 'compose': return isDeployCheck(c) ? deployCheckFailure(c, end, hostState) : dockerFailure(c, end);
    case 'registry': {
      if (!c.commit) return dockerFailure(c, settleArt(end));
      const tag = commitTag(c.tag, c.commit, end);
      return tag === undefined ? `${c.commit.repo} 沒有 ${c.commit.ref ?? '預設分支'}` : dockerFailure({ ...c, tag }, settleArt(end));
    }
  }
}
