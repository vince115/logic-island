import { physicalPath, type FsState } from './fs';
import { accountsOf, findUser } from './accounts';
import { commOf, tableOf, type Proc } from './processes';
import { sha256, type RemoteHost } from './ssh';
import { decideIn, decideOut, ifaceOf, type Verdict } from './firewall';

/*
 * Engine stage E10 (docs/curriculum/SRV0_SERVER_CAPABILITY.md §6): sockets. A machine of the sockets profile has network
 * interfaces (the loopback lo with 127.0.0.1/8 is always there) and listening sockets, which are never stored on their
 * own: a running process declares what it listens on (`listen`: protocol, address, port), so a socket exists exactly while
 * its process runs — systemctl stop, kill and a crashing program take it away. A listening socket is held by its process
 * and by the children with the same name (nginx's workers inherit it), as on Linux. The lesson may also declare
 * established connections (ss -tan, lsof -i).
 *
 * Connecting is a pure function of the lesson's machines (reach): an address of the machine itself (127.0.0.0/8 or an
 * interface address) or of another machine of the network (E7 remotes). A listener bound to 0.0.0.0 accepts on every
 * address; one bound to an address only on that address, so 127.0.0.1 is unreachable from another host. Nothing listens:
 * "Connection refused". An address no machine has: the connection times out (no firewall is modelled before E16).
 * E16–E17 (only machines of those profiles carry the data): a machine may be reachable only from some hosts (a private
 * network behind a bastion: the others time out), the firewalls of both ends decide (drop: timed out, reject: refused),
 * and a listener of an SSH tunnel forwards the connection from the machine at the other end of the tunnel.
 *
 * The commands follow Ubuntu 24.04: ss (iproute2 6.1), lsof 4.95, nc (netcat-openbsd), ip (iproute2) and getent (glibc).
 * Column spacing is the simulation's own: widths from the content, one space between columns, nothing after the last
 * column, but the alignments of the real tools (ss: the address right-aligned on the colon, the port left-aligned).
 */

export type Proto = 'tcp' | 'udp';
/** E10: a socket a process listens on (lesson data on a process or on a program systemd starts). */
export interface Listen {
  port: number;
  /** IPv4 address it is bound to; default 0.0.0.0 (every address). */
  address?: string;
  /** Default tcp. */
  proto?: Proto;
  /** The file descriptor (ss -p, lsof); default 3 + its position in the list. */
  fd?: number;
  /** TCP: the accept backlog (ss Send-Q); default 4096 (SOMAXCONN). */
  backlog?: number;
  /** E12: the HTTP responder (machine.responders) that answers on it. */
  http?: string;
  /** E13: the responder speaks TLS with this certificate (chain) and key file (read on each connection). */
  tls?: { certificate: string; key: string };
  /** E14 (set by the engine, not by lessons): nginx's master listens here with its applied configuration (ssl: a TLS port). */
  nginx?: true;
  ssl?: true;
  /** E17 (set by ssh, not by lessons): an SSH tunnel's listener; the connection is made from the machine `via`. */
  forward?: Forward;
}
/**
 * E17: where a tunnel's connections go: `via` (a host name of the lesson) opens a connection to host:port, resolving host
 * there. -L: the listener is on the client and via is the SSH server; -R: the listener is on the server (held by sshd) and
 * via is the client (client: its ssh process). prohibited: the server's AllowTcpForwarding refuses the channels.
 */
export interface Forward { via: string; host: string; port: number; client?: number; prohibited?: true }
/** E10: an IPv4 address of an interface (lo is implicit). */
export interface Iface { name: string; address: string; prefix: number; mac: string }
export const TCP_STATES = ['ESTAB', 'TIME-WAIT', 'CLOSE-WAIT', 'SYN-SENT', 'SYN-RECV', 'FIN-WAIT-1', 'FIN-WAIT-2', 'LAST-ACK', 'CLOSING'] as const;
export type TcpState = typeof TCP_STATES[number];
/** E10: an established (or closing) TCP connection of the machine; pid is the process holding it (none in TIME-WAIT). */
export interface Conn { local: Endpoint; peer: Endpoint; state: TcpState; pid?: number; fd?: number }
export interface Endpoint { address: string; port: number }
/** E10: the machine's interfaces, default route and connections. E17: onlyFrom, the hosts that can reach it (a private network). */
export interface SocketState { interfaces: readonly Iface[]; gateway?: string; connections: readonly Conn[]; onlyFrom?: readonly string[] }

/** A socket as ss and lsof show it. */
export interface Socket {
  proto: Proto;
  state: 'LISTEN' | 'UNCONN' | TcpState;
  local: Endpoint;
  /** null: a listener (0.0.0.0:*). */
  peer: Endpoint | null;
  recvQ: number;
  sendQ: number;
  inode: number;
  /** The processes holding it and the descriptor in each. */
  holders: { proc: Proc; fd: number }[];
  http?: string;
  /** E13–E14: what speaks on it (see Listen). */
  tls?: { certificate: string; key: string };
  nginx?: true;
  ssl?: true;
  forward?: Forward;
}

// ----------------------------------------------------------------------------------------------------- addresses

export const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
export const isIPv4 = (text: string) => IPV4.test(text);
export const ipNumber = (ip: string) => ip.split('.').reduce((n, p) => n * 256 + Number(p), 0);
export const ipText = (n: number) => [24, 16, 8, 0].map(s => Math.floor(n / 2 ** s) % 256).join('.');
export const networkOf = (ip: string, prefix: number) => ipText(Math.floor(ipNumber(ip) / 2 ** (32 - prefix)) * 2 ** (32 - prefix));
export const broadcastOf = (ip: string, prefix: number) => ipText(ipNumber(networkOf(ip, prefix)) + 2 ** (32 - prefix) - 1);
export const inSubnet = (ip: string, net: string, prefix: number) => networkOf(ip, prefix) === networkOf(net, prefix);
export const isLoopback = (ip: string) => ip.startsWith('127.');
/** A CIDR a.b.c.d/nn (an interface address). */
export function parseCidr(text: string): { address: string; prefix: number } | undefined {
  const m = /^(\d+\.\d+\.\d+\.\d+)\/(\d{1,2})$/.exec(text);
  if (!m || !isIPv4(m[1]) || Number(m[2]) > 32) return undefined;
  return { address: m[1], prefix: Number(m[2]) };
}
/** A deterministic locally administered MAC for an interface (52:54:00 is QEMU/KVM's prefix, common on cloud servers). */
export function macFor(seed: string): string {
  const d = sha256(new TextEncoder().encode(seed));
  return ['52', '54', '00', ...[0, 1, 2].map(i => d[i].toString(16).padStart(2, '0'))].join(':');
}
/** The IPv6 link-local address the kernel derives from a MAC (EUI-64): fe80::5054:ff:fe12:3456. */
export function linkLocal(mac: string): string {
  const b = mac.split(':').map(h => parseInt(h, 16));
  b[0] ^= 2;
  const words = [(b[0] << 8) | b[1], (b[2] << 8) | 0xff, (0xfe << 8) | b[3], (b[4] << 8) | b[5]];
  return `fe80::${words.map(w => w.toString(16)).join(':')}`;
}

export const LOOPBACK: Iface = { name: 'lo', address: '127.0.0.1', prefix: 8, mac: '00:00:00:00:00:00' };
/** Every interface address of the machine, lo first. */
export function interfacesOf(state: Pick<FsState, 'sockets'>): Iface[] {
  return [LOOPBACK, ...state.sockets?.interfaces ?? []];
}
/** Whether an address belongs to the machine itself (127.0.0.0/8 or an interface address). */
export const ownsAddress = (state: Pick<FsState, 'sockets'>, ip: string) => isLoopback(ip) || interfacesOf(state).some(i => i.address === ip);

// ----------------------------------------------------------------------------------------------------- sockets

/** The socket inode lsof shows as DEVICE (fixed per machine, process and port). */
const inodeOf = (seed: string) => { const d = sha256(new TextEncoder().encode(seed)); return 10000 + ((d[0] << 16 | d[1] << 8 | d[2]) % 90000); };
const descendants = (procs: readonly Proc[], root: Proc): Proc[] => {
  const out: Proc[] = [], comm = commOf(root.command);
  const walk = (pid: number) => { for (const p of procs) if (p.ppid === pid && p.pid !== pid) { if (commOf(p.command) === comm) { out.push(p); walk(p.pid); } } };
  walk(root.pid);
  return out;
};

/** The sshd of an E7 remote listens on its applied Port on every address (it declares nothing itself). */
function sshdListen(state: FsState, p: Proc): Listen[] | undefined {
  if (!state.sshd || p.listen || p.unit !== 'ssh.service' || commOf(p.command) !== 'sshd' || !p.command.includes('[listener]')) return undefined;
  return [{ port: state.sshd.applied.port, backlog: 128 }];
}

/** Every socket of the machine: the listeners of its running processes and its declared connections. */
export function socketsOf(state: FsState): Socket[] {
  const procs = tableOf(state), host = state.host ?? 'logic-island', out: Socket[] = [];
  for (const p of procs) {
    const listen = p.listen ?? sshdListen(state, p);
    if (!listen || p.stat.startsWith('Z')) continue;
    const kids = descendants(procs, p);
    listen.forEach((l, i) => {
      const proto = l.proto ?? 'tcp', fd = l.fd ?? 3 + i, address = l.address ?? '0.0.0.0';
      out.push({
        proto, state: proto === 'tcp' ? 'LISTEN' : 'UNCONN', local: { address, port: l.port }, peer: null, recvQ: 0, sendQ: proto === 'tcp' ? l.backlog ?? 4096 : 0,
        inode: inodeOf(`${host}/${p.pid}/${proto}/${address}/${l.port}`), holders: [p, ...kids].map(proc => ({ proc, fd })), ...l.http ? { http: l.http } : {},
        ...l.tls ? { tls: l.tls } : {}, ...l.nginx ? { nginx: true } : {}, ...l.ssl ? { ssl: true } : {}, ...l.forward ? { forward: l.forward } : {},
      });
    });
  }
  for (const c of state.sockets?.connections ?? []) {
    const proc = c.pid !== undefined ? procs.find(p => p.pid === c.pid) : undefined;
    out.push({ proto: 'tcp', state: c.state, local: c.local, peer: c.peer, recvQ: 0, sendQ: 0, inode: c.state === 'TIME-WAIT' ? 0 : inodeOf(`${host}/${c.local.port}/${c.peer.address}/${c.peer.port}`),
      holders: proc ? [{ proc, fd: c.fd ?? 4 }] : [] });
  }
  return out;
}
export const listenersOf = (state: FsState) => socketsOf(state).filter(s => s.peer === null);
/** Whether a listener accepts a connection made to this address of its machine. */
const accepts = (s: Socket, address: string) => s.local.address === '0.0.0.0' || s.local.address === address;

/** The machine an address leads to from `state`: the machine itself, or a host of its network (E7), or none. */
export function machineAt(state: FsState, address: string): { at: 'self' | number; state: FsState } | undefined {
  if (ownsAddress(state, address)) return { at: 'self', state };
  const hosts = state.net?.hosts ?? [];
  const i = hosts.findIndex(h => h.address === address || interfacesOf(h.state).some(x => x.address === address));
  return i < 0 ? undefined : { at: i, state: hosts[i].state };
}
/** channel (E17): the tunnel accepted the connection but could not open it at the other end (ssh prints `channel N: open failed: …`). */
export type Reached = { result: 'ok'; at: 'self' | number; host: FsState; socket: Socket; channel?: string } | { result: 'refused'; at: 'self' | number; host: FsState } | { result: 'timeout' };
/**
 * E10: what a connection from this machine to address:port finds. Loopback stays on the machine; another machine sees the
 * connection arrive on its own address, so its 127.0.0.1 listeners never answer it. E16: the firewalls decide first (a
 * drop times out, a reject is refused). E17: a tunnel's listener passes the connection on from the tunnel's other end.
 */
export function reach(state: FsState, address: string, port: number, proto: Proto = 'tcp', depth = 0): Reached {
  const m = machineAt(state, address);
  if (!m) return { result: 'timeout' };
  const gate = gateOf(state, m, address, port, proto);
  if (gate === 'drop') return { result: 'timeout' };
  if (gate === 'reject') return { result: 'refused', at: m.at, host: m.state };
  const s = listenersOf(m.state).find(x => x.proto === proto && x.local.port === port && accepts(x, address));
  if (!s) return { result: 'refused', at: m.at, host: m.state };
  if (s.forward && depth < 4) return forwarded(state, m, s, depth);
  return { result: 'ok', at: m.at, host: m.state, socket: s };
}

/** E16–E17: the lesson's name of a machine (its host name; logic-island by default). */
export const nameOf = (state: Pick<FsState, 'host'>) => state.host ?? 'logic-island';
/** The address a machine connects from toward dest: loopback stays loopback, else its interface on dest's network, else its address. */
export function sourceAddress(state: FsState, dest: string): string {
  if (ownsAddress(state, dest)) return dest.startsWith('127.') ? '127.0.0.1' : dest;
  const own = interfacesOf(state).filter(i => i.name !== 'lo');
  return own.find(i => inSubnet(dest, i.address, i.prefix))?.address ?? state.net?.address ?? own[0]?.address ?? '127.0.0.1';
}
/** E16–E17: whether the network lets the connection through: the reachable-from list, the source's output, the destination's input. */
function gateOf(state: FsState, m: { at: 'self' | number; state: FsState }, address: string, port: number, proto: Proto): Verdict {
  if (m.at === 'self') return state.firewall ? decideIn(state, { proto, src: address.startsWith('127.') ? '127.0.0.1' : address, dst: address, port, iface: 'lo', state: 'new' }) : 'accept';
  const only = m.state.sockets?.onlyFrom;
  if (only && !only.includes(nameOf(state))) return 'drop';
  const src = sourceAddress(state, address);
  const out = state.firewall ? decideOut(state, { proto, src, dst: address, port, iface: ifaceOf(state, src), state: 'new' }) : 'accept';
  if (out !== 'accept') return out;
  return m.state.firewall ? decideIn(m.state, { proto, src, dst: address, port, iface: ifaceOf(m.state, address), state: 'new' }) : 'accept';
}
/** E16–E17: a machine of the lesson by its name, as seen from `state` (itself, or a host of its network). */
export function indexByName(state: FsState, name: string): 'self' | number | undefined {
  if (name === nameOf(state)) return 'self';
  const i = state.net?.hosts.findIndex(h => h.host === name) ?? -1;
  return i < 0 ? undefined : i;
}
/**
 * E16–E17: the lesson's network as seen from host i — its own state with a network of the others (the machine that was the
 * root becomes one of them). The same machines with the same states, so whatever happens in the view can be written back.
 */
export function viewFrom(state: FsState, i: number): FsState {
  const net = state.net!, h = net.hosts[i];
  const { net: _n, session: _s, ...root } = state;
  void _n; void _s;
  const rootHost: RemoteHost = { host: nameOf(state), address: net.address, aliases: [], passwords: [], state: root };
  return { ...h.state, net: { address: h.address, seed: net.seed, hosts: [rootHost, ...net.hosts.filter((_, k) => k !== i)], connections: net.connections } };
}
/** E16–E17: the states of a view (viewFrom(state, i)) written back into the network rooted at `state`. */
export function fromView(state: FsState, i: number, view: FsState): FsState {
  const { net: vnet, ...remote } = view, hosts = vnet!.hosts;
  const others = hosts.slice(1);
  const root = hosts[0].state;
  return {
    ...root, ...state.session ? { session: state.session } : {},
    net: { ...state.net!, connections: vnet!.connections, hosts: state.net!.hosts.map((h, k) => k === i ? { ...h, state: remote } : { ...h, state: others[k < i ? k : k - 1].state }) },
  };
}
/** E17: a tunnel's connection: from the machine at the tunnel's other end to host:port (resolved there), through its firewalls. */
function forwarded(state: FsState, m: { at: 'self' | number; state: FsState }, s: Socket, depth: number): Reached {
  const f = s.forward!, fail = (why: string): Reached => ({ result: 'ok', at: m.at, host: m.state, socket: s, channel: why });
  if (f.prohibited) return fail('administratively prohibited: open failed');
  // The machine that opens the connection, seen from the listener's machine.
  const base = m.at === 'self' ? state : viewFrom(state, m.at);
  const vi = indexByName(base, f.via);
  if (vi === undefined) return fail('connect failed: Connection refused');
  const from = vi === 'self' ? base : viewFrom(base, vi);
  const r0 = basicResolver(from, f.host, 4);
  if ('error' in r0) return fail('connect failed: Name or service not known');
  const r = reach(from, r0.found.address, f.port, 'tcp', depth + 1);
  if (r.result === 'timeout') return fail('connect failed: Connection timed out');
  if (r.result === 'refused') return fail('connect failed: Connection refused');
  // The end machine, named from the original state.
  const endName = nameOf(r.host), at = indexByName(state, endName);
  return { ...r, at: at ?? 'self' };
}

// ------------------------------------------------------------------------------------------- /etc/services, /etc/hosts

/** The part of Debian's netbase /etc/services a sockets machine has unless the lesson lists its own. */
export const ETC_SERVICES = [
  '# Network services, Internet style (shortened by the simulation)', '',
  'ftp-data\t20/tcp', 'ftp\t\t21/tcp', 'ssh\t\t22/tcp\t\t\t\t# SSH Remote Login Protocol', 'telnet\t\t23/tcp', 'smtp\t\t25/tcp\t\tmail',
  'domain\t\t53/tcp\t\t\t\t# Domain Name Server', 'domain\t\t53/udp', 'http\t\t80/tcp\t\twww\t\t# WorldWideWeb HTTP', 'pop3\t\t110/tcp\t\tpop-3',
  'ntp\t\t123/udp\t\t\t\t# Network Time Protocol', 'imap2\t\t143/tcp\t\timap\t\t# Interim Mail Access P 2 and 4', 'snmp\t\t161/udp',
  'ldap\t\t389/tcp\t\t\t# Lightweight Directory Access Protocol', 'https\t\t443/tcp\t\t\t\t# http protocol over TLS/SSL', 'https\t\t443/udp\t\t\t\t# HTTP/3',
  'submissions\t465/tcp\t\tssmtp smtps urd\t# Submission over TLS [RFC8314]', 'submission\t587/tcp\t\t\t\t# Submission [RFC4409]', 'rndc\t\t953/tcp\t\t\t\t# rndc control sockets (BIND 9)',
  'imaps\t\t993/tcp\t\t\t\t# IMAP over SSL', 'pop3s\t\t995/tcp\t\t\t\t# POP-3 over SSL', 'mysql\t\t3306/tcp', 'postgresql\t5432/tcp\t\tpostgres\t# PostgreSQL Database',
  'redis\t\t6379/tcp', 'http-alt\t8080/tcp\t\twebcache\t# WWW caching service', '',
].join('\n');

export interface ServiceEntry { name: string; port: number; proto: string; aliases: string[] }
const fileText = (state: FsState, path: string) => { const n = state.nodes.get(physicalPath(state.nodes, path, true)); return n?.kind === 'file' ? n.content ?? '' : ''; };
export function servicesOf(state: FsState): ServiceEntry[] {
  const out: ServiceEntry[] = [];
  for (const raw of fileText(state, '/etc/services').split('\n')) {
    const [name, pp, ...aliases] = raw.replace(/#.*/, '').trim().split(/\s+/);
    const m = /^(\d+)\/(tcp|udp)$/.exec(pp ?? '');
    if (name && m) out.push({ name, port: Number(m[1]), proto: m[2], aliases });
  }
  return out;
}
/** ss, lsof and nc show a port by its /etc/services name unless asked for numbers. */
export const serviceName = (state: FsState, port: number, proto: Proto) => servicesOf(state).find(s => s.port === port && s.proto === proto)?.name;
export function servicePort(state: FsState, text: string, proto: Proto): number | undefined {
  if (/^\d+$/.test(text)) return Number(text);
  return servicesOf(state).find(s => s.proto === proto && (s.name === text || s.aliases.includes(text)))?.port;
}

export interface HostsEntry { address: string; names: string[] }
export function hostsOf(state: FsState): HostsEntry[] {
  const out: HostsEntry[] = [];
  for (const raw of fileText(state, '/etc/hosts').split('\n')) {
    const [address, ...names] = raw.replace(/#.*/, '').trim().split(/\s+/);
    if (address && names.length) out.push({ address, names });
  }
  return out;
}
/** The first /etc/hosts line naming the host, of the family (IPv4 or IPv6), as glibc's files source finds it. */
export function hostsLookup(state: FsState, name: string, family: 4 | 6): HostsEntry | undefined {
  const lower = name.toLowerCase().replace(/\.$/, '');
  return hostsOf(state).find(e => (family === 4 ? isIPv4(e.address) : e.address.includes(':')) && e.names.some(n => n.toLowerCase() === lower));
}
export const hostsReverse = (state: FsState, address: string) => hostsOf(state).find(e => e.address === address)?.names[0];

/** A name looked up: the address, the canonical name and the other names (getent hosts prints them in this order). */
export interface Lookup { address: string; name: string; aliases: string[]; /** E35: every address of the name (a headless Service), when more than one. */ addresses?: string[] }
/** `cached`: the local resolver answered from its cache without sending a query (dig's 0 msec). */
export type Resolved = { state: FsState; found: Lookup; cached?: boolean } | { state: FsState; error: 'notfound' | 'tryagain' };
/** How a command looks up a host name (files, then DNS from the dns profile up, or E7's names below it). */
export type Resolver = (state: FsState, name: string, family: 4 | 6) => Resolved;

/** E10 (no DNS yet): /etc/hosts, then the names and aliases of the lesson's machines (as E7's ssh finds them). */
export const basicResolver: Resolver = (state, name, family) => {
  if (family === 4 && isIPv4(name)) return { state, found: { address: name, name, aliases: [] } };
  const e = hostsLookup(state, name, family);
  if (e) return { state, found: { address: e.address, name: e.names[0], aliases: e.names.slice(1) } };
  if (family === 4) {
    const h = state.net?.hosts.find(x => x.host === name || x.aliases.includes(name));
    if (h) return { state, found: { address: h.address, name: h.host, aliases: h.aliases.filter(a => a !== name) } };
    if (name === (state.host ?? 'logic-island')) return { state, found: { address: interfacesOf(state)[1]?.address ?? '127.0.1.1', name, aliases: [] } };
  }
  return { state, error: 'notfound' };
};

// ------------------------------------------------------------------------------------------------------ commands

/** What the E10–E12 commands write, as whom they run, and how they look up names. */
export interface NetIo {
  out(data: string): void; err(line: string): void; user: string; tty: boolean; resolve: Resolver;
  /** E13: standard input (openssl x509 reads a certificate from a pipe); null is the keyboard. */
  stdin?: string | null;
  /** E13: the machine's profile has TLS (curl completes HTTPS; below it stops with E12's error 35). */
  tls?: boolean;
  /** E18: the edge profile (curl -w's timing variables, from the lesson's latencies). */
  edge?: boolean;
  /** E35: a new TCP connection to address:port is about to be made (kube-proxy picks a Service's endpoint; kube-net.ts). */
  connect?: (state: FsState, address: string, port: number) => FsState;
}
export type NetResult = { state: FsState; status: number };
const lines = (io: NetIo, rows: readonly string[]) => rows.forEach(r => io.out(`${r.replace(/\s+$/, '')}\n`));

/** Columns with widths from their content; `right` columns are right-aligned; the last column is never padded. */
function table(rows: readonly (readonly string[])[], right: readonly boolean[]): string[] {
  const widths = right.map((_, i) => Math.max(...rows.map(r => (r[i] ?? '').length)));
  return rows.map(r => r.map((c, i) => i === r.length - 1 ? (right[i] ? c.padStart(widths[i]) : c) : right[i] ? c.padStart(widths[i]) : c.padEnd(widths[i])).join(' ').replace(/\s+$/, ''));
}

const SS_USAGE = ['Usage: ss [ OPTIONS ]', '       ss [ OPTIONS ] [ FILTER ]'];
const SS_LONG: Readonly<Record<string, string>> = { tcp: 't', udp: 'u', listening: 'l', all: 'a', numeric: 'n', processes: 'p', 'no-header': 'H', ipv4: '4', ipv6: '6' };
/**
 * ss [-t] [-u] [-l] [-a] [-n] [-p] [-4] [-H] [sport = :N | dport = :N]. Like iproute2: TCP and UDP (no unix sockets in the
 * simulation), listening sockets only with -l, all with -a; UDP before TCP (ss dumps them in that order); the users:((…))
 * of -p only for processes the user may inspect (all of them as root).
 */
export function ss(state: FsState, args: readonly string[], io: NetIo): NetResult {
  const flags = new Set<string>();
  let i = 0;
  for (; i < args.length; i++) {
    const a = args[i];
    if (a === '--') { i++; break; }
    if (a.startsWith('--')) {
      const f = SS_LONG[a.slice(2)];
      if (!f) { io.err(`ss: unrecognized option '${a}'`); SS_USAGE.forEach(io.err); return { state, status: 255 }; }
      flags.add(f); continue;
    }
    if (!a.startsWith('-') || a === '-') break;
    for (const f of a.slice(1)) {
      if ('xwSmeoiKs0'.includes(f)) { io.err(`ss: 模擬環境的 ss 只列出 TCP 與 UDP 的 socket（-t、-u、-l、-a、-n、-p、-4、-H），不支援 -${f}`); return { state, status: 1 }; }
      if (!'tulanp46Hr'.includes(f)) { io.err(`ss: invalid option -- '${f}'`); SS_USAGE.forEach(io.err); return { state, status: 255 }; }
      flags.add(f);
    }
  }
  // A filter: [(] sport|dport = :PORT [)] (also == and eq, and a service name).
  const filter = args.slice(i).filter(w => w !== '(' && w !== ')');
  let portFilter: { side: 'sport' | 'dport'; port: string } | undefined;
  if (filter.length) {
    const m = filter.length === 3 && /^(sport|dport)$/.test(filter[0]) && ['=', '==', 'eq'].includes(filter[1]) ? /^:(\w[\w-]*)$/.exec(filter[2]) : filter.length === 2 && /^(sport|dport)$/.test(filter[0]) ? /^:(\w[\w-]*)$/.exec(filter[1]) : null;
    if (!m) { io.err(`ss: 模擬環境的 ss 只支援「sport = :埠」與「dport = :埠」這種過濾條件（${filter.join(' ')}）`); return { state, status: 1 }; }
    portFilter = { side: filter[0] as 'sport' | 'dport', port: m[1] };
  }
  if (flags.has('6') && !flags.has('4')) { if (!flags.has('H')) lines(io, ['State Recv-Q Send-Q Local Address:Port Peer Address:Port Process']); return { state, status: 0 }; }
  const tcp = flags.has('t') || !flags.has('u'), udp = flags.has('u') || !flags.has('t');
  const numeric = flags.has('n'), root = io.user === 'root';
  const portText = (s: Socket, port: number) => numeric ? String(port) : serviceName(state, port, s.proto) ?? String(port);
  const wanted = socketsOf(state).filter(s => (s.proto === 'tcp' ? tcp : udp) && (flags.has('a') || (flags.has('l') ? s.peer === null : s.peer !== null)))
    .filter(s => {
      if (!portFilter) return true;
      const port = servicePort(state, portFilter.port, s.proto);
      return portFilter.side === 'sport' ? s.local.port === port : s.peer?.port === port;
    })
    .sort((a, b) => (a.proto === b.proto ? 0 : a.proto === 'udp' ? -1 : 1) || (a.peer === null ? 0 : 1) - (b.peer === null ? 0 : 1) || a.local.port - b.local.port
      || ipNumber(a.local.address) - ipNumber(b.local.address) || (a.peer ? ipNumber(a.peer.address) * 65536 + a.peer.port : 0) - (b.peer ? ipNumber(b.peer.address) * 65536 + b.peer.port : 0));
  const netid = tcp && udp;
  const users = (s: Socket) => {
    if (!flags.has('p')) return '';
    const shown = s.holders.filter(h => root || h.proc.user === io.user).sort((a, b) => b.proc.pid - a.proc.pid);
    return shown.length ? `users:(${shown.map(h => `("${commOf(h.proc.command)}",pid=${h.proc.pid},fd=${h.fd})`).join(',')})` : '';
  };
  const rows = wanted.map(s => ({
    netid: s.proto, state: s.state, recv: String(s.recvQ), send: String(s.sendQ),
    la: s.local.address, lp: portText(s, s.local.port), pa: s.peer ? s.peer.address : '0.0.0.0', pp: s.peer ? portText(s, s.peer.port) : '*', proc: users(s),
  }));
  const head = { netid: 'Netid', state: 'State', recv: 'Recv-Q', send: 'Send-Q', la: 'Local Address', lp: 'Port', pa: 'Peer Address', pp: 'Port', proc: 'Process' };
  const all = flags.has('H') ? rows : [head, ...rows];
  const w = (k: keyof typeof head) => Math.max(0, ...all.map(r => r[k].length));
  const out = all.map(r => [
    ...netid ? [r.netid.padEnd(w('netid'))] : [], r.state.padEnd(w('state')), r.recv.padEnd(w('recv')), r.send.padEnd(w('send')),
    `${r.la.padStart(w('la'))}:${r.lp.padEnd(w('lp'))}`, `${r.pa.padStart(w('pa'))}:${r.pp.padEnd(w('pp'))}`, r.proc,
  ].join(' '));
  lines(io, out);
  return { state, status: 0 };
}

/**
 * lsof -i [46][tcp|udp][:port] [-n] [-P] [-sTCP:LISTEN]: the internet sockets of processes, sorted by PID. Like lsof run
 * by an ordinary user on Linux, only the user's own processes are listed (root sees them all). Nothing found: exit 1.
 */
export function lsof(state: FsState, args: readonly string[], io: NetIo): NetResult {
  let spec: string | undefined, inet = false, numericHost = false, numericPort = false, stateFilter: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-i' || a.startsWith('-i')) {
      inet = true;
      const rest = a.slice(2);
      if (rest) spec = rest;
      else if (args[i + 1] !== undefined && !args[i + 1].startsWith('-')) spec = args[++i];
      continue;
    }
    if (a.startsWith('-s')) {
      const v = a.length > 2 ? a.slice(2) : args[++i];
      const m = /^(TCP|UDP):\^?([A-Z_]+)$/i.exec(v ?? '');
      if (!m) { io.err(`lsof: unknown protocol state name: ${v ?? ''}`); return { state, status: 1 }; }
      stateFilter = m[2].toUpperCase();
      continue;
    }
    if (/^-[nP]+$/.test(a)) { if (a.includes('n')) numericHost = true; if (a.includes('P')) numericPort = true; continue; }
    if (a.startsWith('-')) { io.err(`lsof: illegal option character: ${a[1] ?? '-'}`); io.err('lsof 4.95.0'); io.err(' usage: [-?abhKlnNoOPRtUvVX] [+|-c c] [+|-d s] [+D D] [+|-E] [+|-e s] [+|-f[gG]] [-F [f]] [-g [s]] [-i [i]]'); return { state, status: 1 }; }
    io.err('lsof: 模擬環境的 lsof 只列出網路 socket：請加 -i（例如 sudo lsof -i :80）');
    return { state, status: 1 };
  }
  if (!inet) { io.err('lsof: 模擬環境的 lsof 只列出網路 socket：請加 -i（例如 sudo lsof -i :80、lsof -iTCP -sTCP:LISTEN -n -P）'); return { state, status: 1 }; }
  // [46][protocol][@host][:service]
  const m = /^(4|6)?(tcp|udp|TCP|UDP)?(?::(\S+))?$/.exec(spec ?? '');
  if (!m) { io.err(`lsof: unacceptable Internet address: ${spec}`); return { state, status: 1 }; }
  const family = m[1], proto = m[2]?.toLowerCase() as Proto | undefined, portSpec = m[3];
  if (family === '6') return { state, status: 1 };
  const root = io.user === 'root';
  const name = (s: Socket) => {
    const host = (address: string) => address === '0.0.0.0' ? '*' : numericHost ? address : hostsReverse(state, address) ?? address;
    const port = (p: number) => numericPort ? String(p) : serviceName(state, p, s.proto) ?? String(p);
    const local = `${host(s.local.address)}:${port(s.local.port)}`;
    if (s.proto === 'udp') return local;
    if (!s.peer) return `${local} (LISTEN)`;
    const word = s.state === 'ESTAB' ? 'ESTABLISHED' : s.state.replace('-', '_');
    return `${local}->${host(s.peer.address)}:${port(s.peer.port)} (${word})`;
  };
  const rows: { proc: Proc; fd: number; s: Socket }[] = [];
  for (const s of socketsOf(state)) {
    if (proto && s.proto !== proto) continue;
    if (portSpec !== undefined) { const p = servicePort(state, portSpec, s.proto); if (p === undefined || (s.local.port !== p && s.peer?.port !== p)) continue; }
    if (stateFilter && (s.proto !== 'tcp' || (s.peer === null ? 'LISTEN' : s.state === 'ESTAB' ? 'ESTABLISHED' : s.state.replace('-', '_')) !== stateFilter)) continue;
    for (const h of s.holders) if (root || h.proc.user === io.user) rows.push({ proc: h.proc, fd: h.fd, s });
  }
  if (!rows.length) return { state, status: 1 };
  rows.sort((a, b) => a.proc.pid - b.proc.pid || a.fd - b.fd);
  const out = table([['COMMAND', 'PID', 'USER', 'FD', 'TYPE', 'DEVICE', 'SIZE/OFF', 'NODE', 'NAME'],
    ...rows.map(r => [commOf(r.proc.command).slice(0, 9), String(r.proc.pid), r.proc.user, `${r.fd}u`, 'IPv4', String(r.s.inode), '0t0', r.s.proto.toUpperCase(), name(r.s)])],
  [false, true, true, true, false, true, true, true, false]);
  lines(io, out);
  return { state, status: 0 };
}

/**
 * nc -z [-v] [-n] [-w s] host port[-port] (netcat-openbsd): only the port check. Succeeded, refused (nothing listens, or
 * it listens on another address such as 127.0.0.1) or timed out (no machine has the address). Exit 0 when one succeeded.
 */
export function nc(state: FsState, args: readonly string[], io: NetIo): NetResult {
  let zero = false, verbose = false, numeric = false, wait: number | undefined;
  const operands: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('-') || a === '-') { operands.push(a); continue; }
    for (let j = 1; j < a.length; j++) {
      const f = a[j];
      if (f === 'z') zero = true;
      else if (f === 'v') verbose = true;
      else if (f === 'n') numeric = true;
      else if (f === 'w') { const v = a.slice(j + 1) || args[++i]; if (!/^\d+$/.test(v ?? '')) { io.err(`nc: timeout invalid: ${v ?? ''}`); return { state, status: 1 }; } wait = Number(v); break; }
      else if (f === 'u' || f === 'l' || f === 'k') { io.err(`nc: 模擬環境的 nc 只做 TCP 的連接埠檢查（nc -zv 主機 埠）；${f === 'u' ? 'UDP 沒有交握，請在伺服器上用 ss -ulnp 確認' : '不能開啟監聽的 socket'}`); return { state, status: 1 }; }
      else { io.err(`nc: invalid option -- '${f}'`); io.err('usage: nc [-46CDdFhklNnrStUuvZz] [-I length] [-i interval] [-M ttl]'); io.err('\t  [-m minttl] [-O length] [-P proxy_username] [-p source_port]'); return { state, status: 1 }; }
    }
  }
  if (!zero) { io.err('nc: 模擬環境沒有鍵盤輸入，nc 只能用 -z 檢查連接埠（例如 nc -zv web-02 80）'); return { state, status: 1 }; }
  if (operands.length !== 2) { io.err('usage: nc [-46CDdFhklNnrStUuvZz] [-I length] [-i interval] [-M ttl]'); io.err('\t  [-m minttl] [-O length] [-P proxy_username] [-p source_port]'); return { state, status: 1 }; }
  const [host, ports] = operands;
  const range = /^(\w[\w-]*?)(?:-(\d+))?$/.exec(ports);
  const first = range ? servicePort(state, range[1], 'tcp') : undefined, last = range?.[2] !== undefined ? Number(range[2]) : first;
  if (first === undefined || last === undefined || first < 1 || last > 65535 || last < first) { io.err(`nc: port number invalid: ${ports}`); return { state, status: 1 }; }
  if (last - first >= 64) { io.err('nc: 模擬環境一次最多檢查 64 個連接埠'); return { state, status: 1 }; }
  let next = state;
  let address = host;
  if (!isIPv4(host)) {
    if (numeric) { io.err(`nc: getaddrinfo for host "${host}" port ${first}: Name or service not known`); return { state, status: 1 }; }
    const r = io.resolve(next, host, 4);
    next = r.state;
    if ('error' in r) { io.err(`nc: getaddrinfo for host "${host}" port ${first}: ${r.error === 'notfound' ? 'Name or service not known' : 'Temporary failure in name resolution'}`); return { state: next, status: 1 }; }
    address = r.found.address;
  }
  const shown = host === address ? address : `${host} (${address})`;
  let ok = false;
  for (let port = first; port <= last; port++) {
    // E35: a new connection (kube-proxy picks a Service's endpoint).
    if (io.connect) next = io.connect(next, address, port);
    const r = reach(next, address, port);
    if (r.result === 'ok') { ok = true; if (verbose) io.err(`Connection to ${shown} ${port} port [tcp/${serviceName(next, port, 'tcp') ?? '*'}] succeeded!`); }
    else if (r.result === 'refused') { if (verbose) io.err(`nc: connect to ${shown} port ${port} (tcp) failed: Connection refused`); }
    else if (verbose) io.err(wait !== undefined ? `nc: connect to ${shown} port ${port} (tcp) timed out: Operation now in progress` : `nc: connect to ${shown} port ${port} (tcp) failed: Connection timed out`);
  }
  return { state: next, status: ok ? 0 : 1 };
}

const IP_USAGE = ['Usage: ip [ OPTIONS ] OBJECT { COMMAND | help }', 'where  OBJECT := { address | link | route }', '       OPTIONS := { -4 | -br[ief] }'];
const objectOf = (word: string) => ['address', 'link', 'route'].find(o => word.length > 0 && o.startsWith(word) && (word.length > 1 || o !== 'link' || word === 'l'));
/**
 * ip [-4] [-br] address|link|route [show [dev X]] and ip route get ADDRESS (iproute2): read only. The loopback lo always
 * comes first; IPv6 is only the addresses the kernel adds by itself (::1 and each interface's fe80:: link-local).
 */
export function ip(state: FsState, args: readonly string[], io: NetIo): NetResult {
  let i = 0, brief = false, only4 = false;
  for (; i < args.length && args[i].startsWith('-'); i++) {
    const a = args[i];
    if (a === '-4') only4 = true;
    else if (a === '-br' || a === '-brief' || a === '--brief') brief = true;
    else { io.err(`Option "${a}" is unknown, try "ip -help".`); return { state, status: 255 }; }
  }
  const objWord = args[i];
  if (objWord === undefined) { IP_USAGE.forEach(io.err); return { state, status: 255 }; }
  const object = objectOf(objWord);
  if (!object) { io.err(`Object "${objWord}" is unknown, try "ip help".`); return { state, status: 255 }; }
  const rest = args.slice(i + 1);
  const verb = rest[0] ?? 'show';
  const ifaces = interfacesOf(state), names = [...new Set(ifaces.map(x => x.name))];
  if (['add', 'del', 'delete', 'change', 'replace', 'set', 'flush'].includes(verb)) {
    io.err(io.user === 'root' ? `ip: 模擬環境不能修改網路設定（ip ${object} ${verb}）；介面與路由由課程設定` : 'RTNETLINK answers: Operation not permitted');
    return { state, status: 2 };
  }
  if (object === 'route') {
    const eths = ifaces.filter(x => x.name !== 'lo'), gw = state.sockets?.gateway;
    if (verb === 'get') {
      const to = rest[1];
      if (!to || !isIPv4(to)) { io.err(`Error: inet prefix is expected rather than "${to ?? ''}".`); return { state, status: 1 }; }
      const uid = findUser(accountsOf(state), io.user)?.uid ?? 0;
      if (ownsAddress(state, to)) { lines(io, [`local ${to} dev lo src ${to} uid ${uid}`, '    cache <local>']); return { state, status: 0 }; }
      const direct = eths.find(x => inSubnet(to, x.address, x.prefix));
      if (direct) { lines(io, [`${to} dev ${direct.name} src ${direct.address} uid ${uid}`, '    cache']); return { state, status: 0 }; }
      const via = gw ? eths.find(x => inSubnet(gw, x.address, x.prefix)) : undefined;
      if (!gw || !via) { io.err('RTNETLINK answers: Network is unreachable'); return { state, status: 2 }; }
      lines(io, [`${to} via ${gw} dev ${via.name} src ${via.address} uid ${uid}`, '    cache']);
      return { state, status: 0 };
    }
    if (!['show', 'list', 'ls'].includes(verb)) { io.err(`Command "${verb}" is unknown, try "ip route help".`); return { state, status: 255 }; }
    const out: string[] = [];
    const via = gw ? eths.find(x => inSubnet(gw, x.address, x.prefix)) : undefined;
    if (gw && via) out.push(`default via ${gw} dev ${via.name} proto static`);
    const seen = new Set<string>();
    for (const x of eths) {
      const net = `${networkOf(x.address, x.prefix)}/${x.prefix}`;
      if (seen.has(net) || x.prefix === 32) continue;
      seen.add(net);
      out.push(`${net} dev ${x.name} proto kernel scope link src ${x.address}`);
    }
    lines(io, out);
    return { state, status: 0 };
  }
  if (!['show', 'list', 'ls', 's', 'sh'].includes(verb)) { io.err(`Command "${verb}" is unknown, try "ip ${object === 'address' ? 'addr' : object} help".`); return { state, status: 255 }; }
  let dev: string | undefined;
  const dargs = rest.slice(1);
  if (dargs[0] === 'dev') dev = dargs[1]; else if (dargs[0] !== undefined) dev = dargs[0];
  if (dev !== undefined && !names.includes(dev)) { io.err(`Device "${dev}" does not exist.`); return { state, status: 1 }; }
  const out: string[] = [];
  names.forEach((name, n) => {
    if (dev !== undefined && dev !== name) return;
    const mine = ifaces.filter(x => x.name === name), lo = name === 'lo', mac = mine[0].mac;
    const v6 = lo ? '::1/128' : `${linkLocal(mac)}/64`;
    if (brief) {
      const addrs = object === 'link' ? [mac] : [...mine.map(x => `${x.address}/${x.prefix}`), ...only4 ? [] : [v6]];
      out.push(object === 'link' ? `${name.padEnd(16)} ${(lo ? 'UNKNOWN' : 'UP').padEnd(14)} ${mac} <${lo ? 'LOOPBACK,UP,LOWER_UP' : 'BROADCAST,MULTICAST,UP,LOWER_UP'}>` : `${name.padEnd(16)} ${(lo ? 'UNKNOWN' : 'UP').padEnd(14)} ${addrs.join(' ')}`);
      return;
    }
    out.push(`${n + 1}: ${name}: <${lo ? 'LOOPBACK,UP,LOWER_UP' : 'BROADCAST,MULTICAST,UP,LOWER_UP'}> mtu ${lo ? 65536 : 1500} qdisc ${lo ? 'noqueue' : 'fq_codel'} state ${lo ? 'UNKNOWN' : 'UP'} ${object === 'link' ? 'mode DEFAULT ' : ''}group default qlen 1000`);
    if (!only4 || object === 'link') out.push(`    link/${lo ? 'loopback' : 'ether'} ${mac} brd ${lo ? '00:00:00:00:00:00' : 'ff:ff:ff:ff:ff:ff'}`);
    if (object === 'link') return;
    mine.forEach((x, k) => {
      const secondary = k > 0 && inSubnet(x.address, mine[0].address, mine[0].prefix);
      out.push(`    inet ${x.address}/${x.prefix}${!lo && x.prefix < 31 ? ` brd ${broadcastOf(x.address, x.prefix)}` : ''} scope ${lo ? 'host' : 'global'}${secondary ? ' secondary' : ''} ${name}`);
      out.push('       valid_lft forever preferred_lft forever');
    });
    if (!only4) { out.push(`    inet6 ${v6} scope ${lo ? 'host noprefixroute' : 'link'}`); out.push('       valid_lft forever preferred_lft forever'); }
  });
  lines(io, out);
  return { state, status: 0 };
}

/** getent hosts|services [key…] (glibc): hosts tries IPv6 then IPv4, each through files then DNS; exit 2 when a key is not found. */
export function getent(state: FsState, args: readonly string[], io: NetIo): NetResult {
  const [db, ...keys] = args;
  if (db === undefined) { io.err('Usage: getent [OPTION...] database [key ...]'); io.err("Try `getent --help' or `getent --usage' for more information."); return { state, status: 1 }; }
  if (db !== 'hosts' && db !== 'services') {
    io.err(['passwd', 'group', 'shadow', 'ahosts', 'networks', 'protocols'].includes(db) ? `getent: 模擬環境的 getent 只支援 hosts 與 services（${db}）` : `Unknown database: ${db}`);
    if (!['passwd', 'group', 'shadow', 'ahosts', 'networks', 'protocols'].includes(db)) io.err("Try `getent --help' or `getent --usage' for more information.");
    return { state, status: 1 };
  }
  let next = state, status = 0;
  const hostLine = (address: string, names: string[]) => `${address.padEnd(15)} ${names.join(' ')}`;
  if (db === 'services') {
    const all = servicesOf(state), show = (s: ServiceEntry) => `${s.name.padEnd(21)} ${s.port}/${s.proto}${s.aliases.length ? ` ${s.aliases.join(' ')}` : ''}`;
    if (!keys.length) { lines(io, all.map(show)); return { state, status: 0 }; }
    for (const k of keys) {
      const [key, proto] = k.split('/');
      const s = all.find(x => (!proto || x.proto === proto) && (/^\d+$/.test(key) ? x.port === Number(key) : x.name === key || x.aliases.includes(key)));
      if (s) lines(io, [show(s)]); else status = 2;
    }
    return { state, status };
  }
  if (!keys.length) { lines(io, hostsOf(state).map(e => hostLine(e.address, e.names))); return { state, status: 0 }; }
  for (const key of keys) {
    if (isIPv4(key) || key.includes(':')) {
      const e = hostsOf(next).find(x => x.address === key);
      if (e) lines(io, [hostLine(e.address, e.names)]); else status = 2;
      continue;
    }
    const v6 = io.resolve(next, key, 6);
    next = v6.state;
    if ('found' in v6) { lines(io, [hostLine(v6.found.address, [v6.found.name, ...v6.found.aliases])]); continue; }
    const v4 = io.resolve(next, key, 4);
    next = v4.state;
    // E35: a name with several addresses (a headless Service) is a line per address, as glibc's getent prints them.
    if ('found' in v4) lines(io, (v4.found.addresses ?? [v4.found.address]).map(a => hostLine(a, [v4.found.name, ...v4.found.aliases]))); else status = 2;
  }
  return { state: next, status };
}

/** E10: whether a listener holds this port (lesson checks: listen). */
export function listenProblem(state: FsState, c: { port: number; proto?: Proto; address?: string; process?: string; absent?: true }): string | null {
  const found = listenersOf(state).filter(s => s.local.port === c.port && s.proto === (c.proto ?? 'tcp'));
  const match = found.filter(s => (c.address === undefined || s.local.address === c.address) && (c.process === undefined || s.holders.some(h => commOf(h.proc.command) === c.process)));
  if (c.absent) return match.length ? `${match[0].local.address}:${c.port} 仍在監聽（${commOf(match[0].holders[0]?.proc.command ?? '?')}）` : null;
  if (match.length) return null;
  if (!found.length) return '沒有程式在監聽這個連接埠';
  return `監聽的是 ${found.map(s => `${s.local.address}:${c.port}（${commOf(s.holders[0]?.proc.command ?? '?')}）`).join('、')}`;
}
