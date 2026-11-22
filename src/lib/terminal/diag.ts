import { type FsState } from './fs';
import { clockOf } from './processes';
import { fields } from './clock';
import { offsetAt, offsetText, toLocal, zoneOf } from './calendar';
import { decideIn, decideOut, ifaceOf } from './firewall';
import { hostsReverse, inSubnet, interfacesOf, isIPv4, machineAt, nameOf, ownsAddress, serviceName, sourceAddress, type NetIo, type NetResult } from './sockets';
import { sha256 } from './ssh';
import { readAs } from './tls';
import { openWrite, OPEN_TEXT } from './shell';
import { resolvePath } from './fs';

/*
 * Engine stage E19 (docs/curriculum/SRV0_SERVER_CAPABILITY.md §24): network diagnostics. Nothing is measured: every round
 * trip comes from lesson data. A machine's `latency` is how far it is from the rest of the network (a star around the
 * internet's core), so the round trip between two machines is the sum of theirs (default 0.25 ms each, a LAN); the local
 * machine may also declare `paths`, the routers on the way to a destination with their round trip, per-hop loss and
 * routers that never answer. Each probe's time is the hop's round trip with a small deterministic variation (a hash of
 * the hop and the probe), so the same lesson always prints the same numbers. ping, traceroute and mtr follow iputils
 * 20240117, traceroute 2.1.5 and mtr 0.95 as Ubuntu 24.04 ships them; the firewalls of E16 decide what the destination
 * answers (ufw always answers ping, as its before.rules do; nft's policy drop without an icmp rule does not; traceroute's
 * UDP probes are dropped by ufw's default deny, -I and -T get through when allowed). tcpdump reads a capture the lesson
 * declares (a simulated pcap: a text file the engine writes) and prints tcpdump 4.99's line formats with its filter
 * language; live capture is not simulated. E18 uses the same round trips for curl -w's timing variables.
 */

/** E19: a router (or the destination, the last hop) on the way to a destination: its round trip in ms, its loss in percent. */
export interface Hop { address: string; name?: string; rtt: number; loss?: number; silent?: true }
/** E19: the hops to a destination (the last hop's address); declared on the machine that sends. */
export interface PathDecl { hops: Hop[] }
/** E18–E19: a machine's distance to the network's core (ms) and its declared paths. */
export interface LinkState { latency?: number; paths?: readonly PathDecl[] }

/** The default distance of a machine from the core: a LAN (two default machines are 0.5 ms apart). */
export const DEFAULT_LATENCY = 0.25;
/** A machine's own addresses (loopback): about 40 µs. */
export const LOOPBACK_RTT = 0.04;
const GATEWAY_RTT = 0.35;

/** A number in [-1, 1) from a seed (the deterministic variation of one probe). */
export function wobble(seed: string): number {
  const d = sha256(new TextEncoder().encode(seed));
  return ((d[0] << 8 | d[1]) / 65536) * 2 - 1;
}
/** One probe's time: the hop's round trip ± 3 % (at least ± 4 µs), never below 10 µs. */
export const probeTime = (rtt: number, seed: string) => Math.max(0.01, rtt + Math.max(0.004, rtt * 0.03) * wobble(seed));

/** E18–E19: the round trip (ms) from this machine to an address: itself, a declared path, or the two machines' latencies. */
export function rttTo(state: FsState, address: string): number | undefined {
  if (ownsAddress(state, address)) return LOOPBACK_RTT;
  const declared = state.links?.paths?.find(p => p.hops.at(-1)?.address === address);
  if (declared) return declared.hops.at(-1)!.rtt;
  const m = machineAt(state, address);
  if (!m) return undefined;
  return (state.links?.latency ?? DEFAULT_LATENCY) + (m.state.links?.latency ?? DEFAULT_LATENCY);
}

export interface PathHop { address: string; name?: string; rtt: number; loss: number; silent: boolean; dest: boolean }
/** The hops from this machine to an address: a declared path, or the gateway (another network) and the machine; none when no machine has it. */
export function pathTo(state: FsState, address: string): PathHop[] {
  if (ownsAddress(state, address)) return [{ address, rtt: LOOPBACK_RTT, loss: 0, silent: false, dest: true }];
  const declared = state.links?.paths?.find(p => p.hops.at(-1)?.address === address);
  if (declared) return declared.hops.map((h, i, all) => ({ address: h.address, ...h.name ? { name: h.name } : {}, rtt: h.rtt, loss: h.loss ?? 0, silent: !!h.silent, dest: i === all.length - 1 }));
  const local = interfacesOf(state).filter(i => i.name !== 'lo').some(i => inSubnet(address, i.address, i.prefix));
  const gw = state.sockets?.gateway;
  const via: PathHop[] = !local && gw ? [{ address: gw, rtt: GATEWAY_RTT, loss: 0, silent: false, dest: false }] : [];
  const rtt = rttTo(state, address);
  return rtt === undefined ? via : [...via, { address, rtt, loss: 0, silent: false, dest: true }];
}

/** Whether the destination answers a probe: the private networks of E17 and the firewalls of both ends (E16). */
function gate(state: FsState, address: string, proto: 'icmp' | 'udp' | 'tcp', port: number): 'accept' | 'drop' | 'reject' {
  const m = machineAt(state, address);
  if (!m) return 'accept';
  if (m.at === 'self') return state.firewall ? decideIn(state, { proto, src: address.startsWith('127.') ? '127.0.0.1' : address, dst: address, port, iface: 'lo', state: 'new' }) : 'accept';
  const only = m.state.sockets?.onlyFrom;
  if (only && !only.includes(nameOf(state))) return 'drop';
  const src = sourceAddress(state, address);
  const out = state.firewall ? decideOut(state, { proto, src, dst: address, port, iface: ifaceOf(state, src), state: 'new' }) : 'accept';
  if (out !== 'accept') return out;
  return m.state.firewall ? decideIn(m.state, { proto, src, dst: address, port, iface: ifaceOf(m.state, address), state: 'new' }) : 'accept';
}

/** Which probes of a hop are lost: round(loss × n / 100) of them, spread deterministically. */
function lostProbes(loss: number, n: number, seed: string): Set<number> {
  const count = Math.round(loss * n / 100), order = Array.from({ length: n }, (_, i) => i).sort((a, b) => wobble(`${seed}/${a}`) - wobble(`${seed}/${b}`) || a - b);
  return new Set(order.slice(0, count));
}
/** The name a diagnostic tool shows for an address: /etc/hosts, the declared hop's name, systemd-resolved's _gateway. */
function reverseName(state: FsState, address: string, hop?: { name?: string }): string | undefined {
  if (address === state.sockets?.gateway) return '_gateway';
  return hostsReverse(state, address) ?? hop?.name;
}
/** %g: up to six significant digits (ping's packet loss). */
const g6 = (x: number) => String(Number(x.toPrecision(6)));
/** iputils' time=: 3 decimals under 1 ms, 2 under 10, 1 under 100, else whole. */
function pingTime(ms: number): string {
  const us = Math.round(ms * 1000);
  if (us >= 100000 - 50) return String(Math.round(us / 1000));
  if (us >= 10000 - 5) return (Math.round(us / 100) / 10).toFixed(1);
  if (us >= 1000) return (Math.round(us / 10) / 100).toFixed(2);
  return (us / 1000).toFixed(3);
}

type Resolved = { state: FsState; address: string } | { state: FsState; error: 'notfound' | 'tryagain' };
function lookup(state: FsState, host: string, io: NetIo): Resolved {
  if (isIPv4(host)) return { state, address: host };
  const r = io.resolve(state, host, 4);
  return 'error' in r ? { state: r.state, error: r.error } : { state: r.state, address: r.found.address };
}

// --------------------------------------------------------------------------------------------------------------- ping

/** ping -c N [-i s] [-W s] [-s size] [-n] [-q] [-4] host (iputils 20240117). */
export function ping(state0: FsState, args: readonly string[], io: NetIo): NetResult {
  let count: number | undefined, interval = 1, size = 56, numeric = false, quiet = false;
  const targets: string[] = [];
  const usage = (msg: string): NetResult => { io.err(msg); return { state: state0, status: 2 }; };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const value = (flag: string) => a.length > 2 ? a.slice(2) : args[++i] ?? '';
    if (/^-[nq4]+$/.test(a)) { if (a.includes('n')) numeric = true; if (a.includes('q')) quiet = true; continue; }
    if (a.startsWith('-c')) { const v = value('c'); if (!/^\d+$/.test(v) || Number(v) < 1) return usage(`ping: invalid argument: '${v}': out of range: 1 <= value <= 9223372036854775807`); count = Number(v); continue; }
    if (a.startsWith('-i')) { const v = value('i'); if (!/^\d+(\.\d+)?$/.test(v)) return usage(`ping: bad timing interval: ${v}`); interval = Number(v); continue; }
    if (a.startsWith('-W')) { const v = value('W'); if (!/^\d+(\.\d+)?$/.test(v)) return usage(`ping: bad linger time: ${v}`); continue; }
    if (a.startsWith('-s')) { const v = value('s'); if (!/^\d+$/.test(v) || Number(v) > 65507) return usage(`ping: invalid argument: '${v}': out of range: 0 <= value <= 65507`); size = Number(v); continue; }
    if (a.startsWith('-') && a.length > 1) return usage(`ping: invalid option -- '${a[1]}'`);
    targets.push(a);
  }
  if (!targets.length) return usage('ping: usage error: Destination address required');
  if (count === undefined) { io.err('ping：模擬環境沒有 Ctrl-C 可以停止 ping；請加 -c 次數，例如 ping -c 4 主機'); return { state: state0, status: 2 }; }
  if (count > 100) return usage('ping：模擬環境的 -c 最多 100 次');
  const host = targets.at(-1)!, r = lookup(state0, host, io), state = r.state;
  if ('error' in r) { io.err(`ping: ${host}: ${r.error === 'notfound' ? 'Name or service not known' : 'Temporary failure in name resolution'}`); return { state, status: 2 }; }
  const addr = r.address, hops = pathTo(state, addr), dest = hops.at(-1);
  io.out(`PING ${host} (${addr}) ${size}(${size + 28}) bytes of data.\n`);
  const reached = !!dest?.dest && !dest.silent;
  const verdict = reached ? gate(state, addr, 'icmp', 0) : 'drop';
  const local = interfacesOf(state).filter(i => i.name !== 'lo').some(i => inSubnet(addr, i.address, i.prefix));
  const hostUnreachable = !machineAt(state, addr) && !(dest?.dest) && local;
  const label = isIPv4(host) || numeric ? addr : `${reverseName(state, addr, dest) ?? addr} (${addr})`;
  const lost = reached ? lostProbes(dest!.loss, count, `ping/${addr}`) : new Set<number>();
  const ttl = 64 - (hops.length - 1);
  const times: number[] = [];
  let errors = 0;
  const from = sourceAddress(state, addr);
  for (let seq = 1; seq <= count; seq++) {
    if (hostUnreachable) { errors++; if (!quiet) io.out(`From ${from} icmp_seq=${seq} Destination Host Unreachable\n`); continue; }
    if (verdict === 'reject') { errors++; if (!quiet) io.out(`From ${addr} icmp_seq=${seq} Destination Port Unreachable\n`); continue; }
    if (!reached || verdict === 'drop' || lost.has(seq - 1)) continue;
    const t = probeTime(dest!.rtt, `ping/${addr}/${seq}`);
    times.push(t);
    if (!quiet) io.out(`${size + 8} bytes from ${label}: icmp_seq=${seq} ttl=${ttl} time=${pingTime(t)} ms\n`);
  }
  const received = times.length, loss = (count - received) * 100 / count;
  const elapsed = count > 1 ? Math.round((count - 1) * interval * 1000) + count - 1 : 0;
  io.out(`\n--- ${host} ping statistics ---\n`);
  io.out(`${count} packets transmitted, ${received} received,${errors ? ` +${errors} errors,` : ''} ${g6(loss)}% packet loss, time ${elapsed}ms\n`);
  if (received) {
    const min = Math.min(...times), max = Math.max(...times), avg = times.reduce((a, b) => a + b, 0) / received;
    const mdev = Math.sqrt(Math.max(0, times.reduce((a, b) => a + b * b, 0) / received - avg * avg));
    io.out(`rtt min/avg/max/mdev = ${[min, avg, max, mdev].map(x => x.toFixed(3)).join('/')} ms\n`);
  } else if (errors && count > 1) io.out(`pipe ${Math.min(count, 4)}\n`);
  return { state, status: received ? 0 : 1 };
}

// --------------------------------------------------------------------------------------------------------- traceroute

/** One hop's probes as traceroute 2.1.5 and mtr see them: each probe's time, or null when it got no answer. */
function hopProbes(state: FsState, hop: PathHop | undefined, ttl: number, n: number, method: 'udp' | 'icmp' | 'tcp', port: number, seed: string): (number | null)[] {
  if (!hop || hop.silent) return Array(n).fill(null);
  if (hop.dest && gate(state, hop.address, method, method === 'udp' ? port + ttl - 1 : port) === 'drop') return Array(n).fill(null);
  const lost = lostProbes(hop.loss, n, `${seed}/${hop.address}`);
  return Array.from({ length: n }, (_, i) => lost.has(i) ? null : probeTime(hop.rtt, `${seed}/${hop.address}/${ttl}/${i}`));
}

/** traceroute [-n] [-I|-T] [-p port] [-m max] [-q n] [-w s] host (traceroute 2.1.5). */
export function traceroute(state0: FsState, args: readonly string[], io: NetIo): NetResult {
  let numeric = false, method: 'udp' | 'icmp' | 'tcp' = 'udp', port: number | undefined, max = 30, queries = 3;
  const targets: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (/^-[nIT4]+$/.test(a)) { if (a.includes('n')) numeric = true; if (a.includes('I')) method = 'icmp'; if (a.includes('T')) method = 'tcp'; continue; }
    const flag = /^-([pmqwNz])(.*)$/.exec(a);
    if (flag) {
      const v = flag[2] || args[++i] || '';
      if (!/^\d+(\.\d+)?$/.test(v)) { io.err(`Cannot handle \`-${flag[1]}' option with arg \`${v}' (argc ${i})`); return { state: state0, status: 2 }; }
      if (flag[1] === 'p') port = Number(v); else if (flag[1] === 'm') max = Math.min(255, Number(v)); else if (flag[1] === 'q') queries = Math.min(10, Math.max(1, Number(v)));
      continue;
    }
    if (a.startsWith('-') && a.length > 1) { io.err(`Bad option \`${a}' (argc ${i + 1})`); return { state: state0, status: 2 }; }
    targets.push(a);
  }
  if (!targets.length) { io.err('Specify "host" missing argument.'); return { state: state0, status: 2 }; }
  if (method === 'tcp' && io.user !== 'root') { io.err('You do not have enough privileges to use this traceroute method.'); io.err('socket: Operation not permitted'); return { state: state0, status: 1 }; }
  const host = targets[0], r = lookup(state0, host, io), state = r.state;
  if ('error' in r) { io.err(`${host}: ${r.error === 'notfound' ? 'Name or service not known' : 'Temporary failure in name resolution'}`); io.err(`Cannot handle "host" cmdline arg \`${host}' on position 1 (argc ${args.indexOf(host) + 1})`); return { state, status: 2 }; }
  const addr = r.address, hops = pathTo(state, addr), dport = port ?? (method === 'udp' ? 33434 : method === 'tcp' ? 80 : 0);
  io.out(`traceroute to ${host} (${addr}), ${max} hops max, 60 byte packets\n`);
  for (let ttl = 1; ttl <= max; ttl++) {
    const hop = hops[ttl - 1], probes = hopProbes(state, hop, ttl, queries, method, dport, 'trace');
    let line = `${String(ttl).padStart(2)} `, prev: string | undefined;
    for (const t of probes) {
      if (t === null) { line += ' *'; continue; }
      if (hop!.address !== prev) line += numeric ? ` ${hop!.address}` : ` ${reverseName(state, hop!.address, hop) ?? hop!.address} (${hop!.address})`;
      line += `  ${t.toFixed(3)} ms`;
      prev = hop!.address;
    }
    io.out(`${line}\n`);
    if (hop?.dest && probes.some(t => t !== null)) break;
  }
  return { state, status: 0 };
}

// ----------------------------------------------------------------------------------------------------------------- mtr

/** mtr -r|--report [-w] [-c N] [-n] [-b] [-T|-u] [-P port] host (mtr 0.95's report). */
export function mtr(state0: FsState, args: readonly string[], io: NetIo): NetResult {
  let report = false, wide = false, cycles = 10, numeric = false, both = false, method: 'icmp' | 'udp' | 'tcp' = 'icmp', port = 80;
  const targets: string[] = [];
  const bad = (msg: string): NetResult => { io.err(msg); return { state: state0, status: 1 }; };
  const LONG: Readonly<Record<string, string>> = { report: 'r', 'report-wide': 'w', 'report-cycles': 'c', 'no-dns': 'n', 'show-ips': 'b', tcp: 'T', udp: 'u', port: 'P' };
  for (let i = 0; i < args.length; i++) {
    let a = args[i];
    if (a.startsWith('--')) {
      const [name, inline] = a.slice(2).split('=', 2), f = LONG[name];
      if (!f) return bad(`mtr: unrecognized option '${a}'`);
      a = `-${f}${inline ?? ''}`;
      if ((f === 'c' || f === 'P') && inline === undefined) a = `-${f}${args[++i] ?? ''}`;
    }
    if (!a.startsWith('-') || a.length === 1) { targets.push(a); continue; }
    for (let j = 1; j < a.length; j++) {
      const f = a[j];
      if (f === 'c' || f === 'P') {
        const v = a.slice(j + 1) || args[++i] || '';
        if (!/^\d+$/.test(v) || Number(v) < 1) return bad(`mtr: invalid argument: '${v}'`);
        if (f === 'c') cycles = Math.min(100, Number(v)); else port = Number(v);
        break;
      }
      if (f === 'r') report = true; else if (f === 'w') { report = true; wide = true; } else if (f === 'n') numeric = true; else if (f === 'b') both = true;
      else if (f === 'T') method = 'tcp'; else if (f === 'u') method = 'udp'; else if (f === '4' || f === 'z') continue;
      else return bad(`mtr: invalid option -- '${f}'`);
    }
  }
  if (!report) return bad('mtr：模擬環境沒有全螢幕的互動介面；請用報告模式，例如 mtr --report -c 10 主機（或 mtr -rwn 主機）');
  if (!targets.length) return bad('mtr: No destination specified');
  const host = targets[0], r = lookup(state0, host, io), state = r.state;
  if ('error' in r) { io.err(`mtr: Failed to resolve host: ${host}: ${r.error === 'notfound' ? 'Name or service not known' : 'Temporary failure in name resolution'}`); return { state, status: 1 }; }
  const addr = r.address, hops = pathTo(state, addr);
  const rows: { name: string; probes: (number | null)[] }[] = [];
  let lastAnswer = -1, reached = -1;
  for (let ttl = 1; ttl <= 30; ttl++) {
    const hop = hops[ttl - 1], probes = hopProbes(state, hop, ttl, cycles, method, port, 'mtr');
    const answered = probes.some(t => t !== null);
    const shown = !hop || !answered ? '???' : numeric ? hop.address : both ? `${reverseName(state, hop.address, hop) ?? hop.address} (${hop.address})` : reverseName(state, hop.address, hop) ?? hop.address;
    rows.push({ name: shown, probes });
    if (answered) lastAnswer = ttl - 1;
    if (hop?.dest && answered) { reached = ttl - 1; break; }
  }
  // mtr's net_max: up to the destination, else one ??? after the last hop that answered.
  const shownRows = rows.slice(0, reached >= 0 ? reached + 1 : Math.min(30, lastAnswer + 2));
  const z = zoneOf(state), now = clockOf(state).now, f = fields(toLocal(z, now)), two = (n: number) => String(n).padStart(2, '0');
  io.out(`Start: ${f.year}-${two(f.month + 1)}-${two(f.day)}T${two(f.hour)}:${two(f.minute)}:${two(f.second)}${offsetText(offsetAt(z, now).offset)}\n`);
  const local = nameOf(state);
  let width = 33;
  if (wide) width = Math.max(local.length, ...shownRows.map(x => x.name.length));
  // mtr's report_close: each field is printed at a fixed offset (its width), so a wider value (" 100.0%") loses its last
  // character to the next field ("100.0    10"); without -w the host column is cut at 33 characters.
  const place = (lead: string, cells: readonly (readonly [string, number])[]) => {
    let buf = lead, at = lead.length;
    for (const [text, w] of cells) { buf = buf.slice(0, at).padEnd(at) + text; at += w; }
    return buf.replace(/ +$/, '');
  };
  const header = `HOST: ${local.padEnd(width)}`;
  io.out(`${place(wide ? header : header.slice(0, width).padEnd(width), [[' Loss%', 6], ['   Snt', 6], [' ', 1], ['  Last', 6], ['   Avg', 6], ['  Best', 6], ['  Wrst', 6], [' StDev', 6]])}\n`);
  shownRows.forEach((row, i) => {
    const got = row.probes.filter((t): t is number => t !== null), n = got.length;
    const loss = (cycles - n) * 100 / cycles;
    const avg = n ? got.reduce((a, b) => a + b, 0) / n : 0, best = n ? Math.min(...got) : 0, worst = n ? Math.max(...got) : 0;
    const last = [...row.probes].reverse().find((t): t is number => t !== null) ?? 0;
    const sd = n > 1 ? Math.sqrt(got.reduce((a, b) => a + (b - avg) ** 2, 0) / (n - 1)) : 0;
    const start = ` ${String(i + 1).padStart(2)}.|-- ${row.name.padEnd(width)}`;
    const f1 = (x: number) => [` ${x.toFixed(1).padStart(5)}`, 6] as const;
    io.out(`${place(wide ? start : start.slice(0, width).padEnd(width), [[` ${loss.toFixed(1).padStart(4)}%`, 6], [` ${String(cycles).padStart(5)}`, 6], [' ', 1], f1(last), f1(avg), f1(best), f1(worst), f1(sd)])}\n`);
  });
  return { state, status: 0 };
}

// ------------------------------------------------------------------------------------------------------------ tcpdump

/** E19: a packet of a capture the lesson declares (t: seconds after the capture's start). */
export interface CapPacket {
  t: number;
  proto: 'tcp' | 'udp' | 'icmp';
  /** a.b.c.d:port for tcp and udp, a.b.c.d for icmp. */
  src: string;
  dst: string;
  /** tcp: S, S., ., P., F., FP., R, R. (FIN, SYN, RST, PSH and ACK; the engine prints them in tcpdump's order). */
  flags?: string;
  /** tcp: absolute sequence and acknowledgment numbers (default: what the connection so far gives). */
  seq?: number;
  ack?: number;
  win?: number;
  /** tcp and udp: the data (HTTP text); its length is the packet's length. */
  payload?: string;
  /** tcp and udp without a payload text: the data's length. */
  length?: number;
  /** icmp: what it is (with id and seq for echo). */
  icmp?: 'echo-request' | 'echo-reply' | 'port-unreachable' | 'host-unreachable' | 'time-exceeded';
  id?: number;
  icmpSeq?: number;
  /** udp port 53: a query (no answers) or a response. */
  dns?: { id: number; name: string; type?: string; answers?: string[]; rcode?: 'NXDOMAIN' | 'SERVFAIL' | 'REFUSED'; response?: boolean };
}
/** E19: a capture file (start: UTC 'YYYY-MM-DD HH:MM:SS[.ffffff]' as seconds). */
export interface Capture { start: number; packets: CapPacket[] }
const PCAP_MAGIC = 'LISIM-PCAP 1';
/** The simulated pcap file: a marker line and the capture as JSON (not libpcap's binary format). */
export const captureText = (c: Capture) => `${PCAP_MAGIC}\n${JSON.stringify(c)}\n`;
export function parseCapture(text: string): Capture | undefined {
  if (!text.startsWith(`${PCAP_MAGIC}\n`)) return undefined;
  try {
    const c = JSON.parse(text.slice(PCAP_MAGIC.length + 1)) as Capture;
    return typeof c.start === 'number' && Array.isArray(c.packets) ? c : undefined;
  } catch { return undefined; }
}

const endpointOf = (text: string) => { const m = /^(\d+\.\d+\.\d+\.\d+)(?::(\d+))?$/.exec(text); return { address: m?.[1] ?? text, port: m?.[2] !== undefined ? Number(m[2]) : undefined }; };
const FLAG_ORDER = ['F', 'S', 'R', 'P', '.', 'U', 'E', 'W'];
const flagSet = (text = '') => new Set(Array.from(text));
const dataLength = (p: CapPacket) => p.payload !== undefined ? new TextEncoder().encode(p.payload.replace(/\r?\n/g, '\r\n')).length : p.length ?? 0;

type Prim = { kind: 'host' | 'net' | 'port'; dir?: 'src' | 'dst'; value: string; proto?: 'tcp' | 'udp' } | { kind: 'proto'; proto: 'tcp' | 'udp' | 'icmp' | 'ip' };
type Filter = { op: 'and' | 'or'; a: Filter; b: Filter } | { op: 'not'; a: Filter } | { op: 'prim'; p: Prim };
class FilterError extends Error {}

/** tcpdump's filter language (pcap-filter): host, net, port with src/dst and tcp/udp, the protocols, and/or/not, parentheses. */
function parseFilter(words: readonly string[], resolve: (name: string) => string | undefined): Filter | undefined {
  const t = words.flatMap(w => w.replace(/([()!])/g, ' $1 ').replace(/&&/g, ' and ').replace(/\|\|/g, ' or ').split(/\s+/)).filter(Boolean);
  if (!t.length) return undefined;
  let i = 0;
  const syntax = () => new FilterError('syntax error');
  const value = (kind: 'host' | 'net' | 'port'): string => {
    const v = t[i++];
    if (v === undefined || ['and', 'or', 'not', '(', ')', '!'].includes(v)) throw syntax();
    if (kind === 'port') { if (!/^\d+$/.test(v) || Number(v) > 65535) { const named = { http: '80', https: '443', ssh: '22', domain: '53' }[v]; if (!named) throw new FilterError(`unknown port '${v}'`); return named; } return v; }
    if (kind === 'net') { if (!/^\d+\.\d+\.\d+\.\d+(\/\d{1,2})?$/.test(v)) throw new FilterError(`invalid net address '${v}'`); return v; }
    if (isIPv4(v)) return v;
    const found = resolve(v);
    if (!found) throw new FilterError(`unknown host '${v}'`);
    return found;
  };
  const primitive = (): Filter => {
    let proto: 'tcp' | 'udp' | undefined, dir: 'src' | 'dst' | undefined;
    const w = t[i];
    if (w === 'tcp' || w === 'udp' || w === 'icmp' || w === 'ip') {
      i++;
      if (w !== 'icmp' && w !== 'ip' && ['src', 'dst', 'port'].includes(t[i] ?? '')) proto = w;
      else return { op: 'prim', p: { kind: 'proto', proto: w } };
    }
    if (t[i] === 'src' || t[i] === 'dst') { dir = t[i++] as 'src' | 'dst'; }
    const k = t[i];
    if (k === 'host' || k === 'net' || k === 'port') { i++; return { op: 'prim', p: { kind: k, ...dir ? { dir } : {}, value: value(k), ...proto ? { proto } : {} } }; }
    if (dir) return { op: 'prim', p: { kind: 'host', dir, value: value('host') } };
    if (k === undefined || ['and', 'or', ')'].includes(k)) throw syntax();
    // A bare name or address is a host.
    return { op: 'prim', p: { kind: 'host', value: value('host') } };
  };
  const factor = (): Filter => {
    if (t[i] === 'not' || t[i] === '!') { i++; return { op: 'not', a: factor() }; }
    if (t[i] === '(') { i++; const e = expr(); if (t[i++] !== ')') throw syntax(); return e; }
    return primitive();
  };
  // pcap-filter: `and` and `or` have the same precedence and group from the left (`a or b and c` is `(a or b) and c`).
  const expr = (): Filter => { let a = factor(); while (t[i] === 'and' || t[i] === 'or') { const op = t[i++] as 'and' | 'or'; a = { op, a, b: factor() }; } return a; };
  const e = expr();
  if (i < t.length) throw syntax();
  return e;
}
const inNet = (ip: string, spec: string) => { const [net, bits = '32'] = spec.split('/'); return inSubnet(ip, net, Number(bits)); };
function matches(f: Filter, p: CapPacket): boolean {
  if (f.op === 'not') return !matches(f.a, p);
  if (f.op !== 'prim') return f.op === 'and' ? matches(f.a, p) && matches(f.b, p) : matches(f.a, p) || matches(f.b, p);
  const x = f.p, s = endpointOf(p.src), d = endpointOf(p.dst);
  if (x.kind === 'proto') return x.proto === 'ip' || x.proto === p.proto;
  const sides = x.dir === 'src' ? [s] : x.dir === 'dst' ? [d] : [s, d];
  if (x.kind === 'host') return sides.some(e => e.address === x.value);
  if (x.kind === 'net') return sides.some(e => inNet(e.address, x.value));
  if (p.proto === 'icmp' || (x.proto && x.proto !== p.proto)) return false;
  return sides.some(e => e.port === Number(x.value));
}

/** DNS's message size for tcpdump's (N): the header, the question and each answer (names without compression). */
const nameBytes = (n: string) => n.replace(/\.$/, '').split('.').reduce((a, l) => a + l.length + 1, 1);
function dnsText(d: NonNullable<CapPacket['dns']>, response: boolean): string {
  const type = d.type ?? 'A', q = 12 + nameBytes(d.name) + 4;
  if (!response) return `${d.id}+ ${type}? ${d.name.replace(/\.?$/, '.')} (${q})`;
  if (d.rcode) return `${d.id} ${d.rcode === 'NXDOMAIN' ? 'NXDomain' : d.rcode === 'SERVFAIL' ? 'ServFail' : 'Refused'} 0/${d.rcode === 'NXDOMAIN' ? 1 : 0}/0 (${q + (d.rcode === 'NXDOMAIN' ? 50 : 0)})`;
  const answers = d.answers ?? [], size = answers.reduce((n, a) => { const [t, v = ''] = a.split(/\s+/, 2); return n + 2 + 10 + (t === 'A' ? 4 : t === 'AAAA' ? 16 : nameBytes(v)); }, q);
  return `${d.id} ${answers.length}/0/0${answers.length ? ` ${answers.map(a => { const [t, v = ''] = a.split(/\s+/, 2); return `${t} ${t === 'CNAME' || t === 'NS' || t === 'MX' ? v.replace(/\.?$/, '.') : v}`; }).join(', ')}` : ''} (${size})`;
}

/** tcpdump -r file [-n|-nn] [-A] [-c N] [-t|-tttt] [-w file] [expression]; live capture prints why it is not simulated. */
export function tcpdump(state: FsState, args: readonly string[], io: NetIo): NetResult {
  let file: string | undefined, write: string | undefined, numeric = false, ascii = false, limit: number | undefined, stamp: 'time' | 'none' | 'date' = 'time', device: string | undefined;
  const expr: string[] = [];
  const fail = (msg: string, status = 1): NetResult => { io.err(msg); return { state, status }; };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('-') || a === '-') { expr.push(...args.slice(i)); break; }
    if (a === '--') { expr.push(...args.slice(i + 1)); break; }
    for (let j = 1; j < a.length; j++) {
      const f = a[j];
      if ('rwci'.includes(f)) {
        const v = a.slice(j + 1) || args[++i];
        if (v === undefined) return fail(`tcpdump: option requires an argument -- '${f}'`);
        if (f === 'r') file = v; else if (f === 'w') write = v; else if (f === 'i') device = v;
        else { if (!/^\d+$/.test(v) || Number(v) < 1) return fail(`tcpdump: invalid packet count ${v}`); limit = Number(v); }
        break;
      }
      if (f === 'n') numeric = true;
      else if (f === 'A') ascii = true;
      else if (f === 't') { const ts = (a.match(/t/g) ?? []).length; stamp = ts >= 4 ? 'date' : ts === 1 ? 'none' : 'time'; }
      else if (f === 'l') continue;
      else if ('vXxe'.includes(f)) return fail(`tcpdump：模擬環境的 tcpdump 不支援 -${f}（請用 -A 看封包的內容）`);
      else return fail(`tcpdump: invalid option -- '${f}'`);
    }
  }
  if (file === undefined) {
    const dev = device ?? interfacesOf(state).find(i => i.name !== 'lo')?.name ?? 'eth0';
    if (io.user !== 'root') { io.err(`tcpdump: ${dev}: You don't have permission to perform this capture on that device`); return fail('(socket: Operation not permitted)'); }
    return fail(`tcpdump：模擬環境不能即時擷取封包（沒有真的網路卡）；請用 tcpdump -r 讀取課程提供的擷取檔，例如 sudo tcpdump -nn -r /var/tmp/web.pcap port 80`);
  }
  const read = readAs(state, io.user, resolvePath(state, file));
  if ('error' in read) return fail(`tcpdump: ${file}: ${read.error === 'EACCES' ? 'Permission denied' : read.error === 'EISDIR' ? 'Is a directory' : 'No such file or directory'}`);
  const cap = parseCapture(read.text);
  if (!cap) return fail('tcpdump: unknown file format');
  let filter: Filter | undefined;
  try {
    filter = parseFilter(expr, name => { const r = io.resolve(state, name, 4); return 'found' in r ? r.found.address : undefined; });
  } catch (e) { if (e instanceof FilterError) return fail(`tcpdump: can't parse filter expression: ${e.message}`); throw e; }
  io.err(`reading from file ${file}, link-type EN10MB (Ethernet), snapshot length 262144`);
  // Sequence numbers: each direction continues from its last packet (a SYN's seq, else a hashed one). tcpdump prints them
  // relative to the first packet with ACK of the conversation (which it prints absolute, as it does every SYN).
  const next = new Map<string, number>(), bases = new Map<string, Record<string, number>>();
  const startSeq = (key: string) => next.get(key) ?? sha256(new TextEncoder().encode(key))[0] * 16777216 + 12345;
  const z = zoneOf(state), two = (n: number) => String(n).padStart(2, '0');
  const shownAddr = (text: string, proto: 'tcp' | 'udp' | 'icmp') => {
    const e = endpointOf(text);
    const host = numeric ? e.address : hostsReverse(state, e.address) ?? e.address;
    return e.port === undefined ? host : `${host}.${numeric || proto === 'icmp' ? e.port : serviceName(state, e.port, proto) ?? e.port}`;
  };
  const kept: CapPacket[] = [];
  for (const p of cap.packets) {
    const s = endpointOf(p.src), d = endpointOf(p.dst);
    let line = '';
    if (p.proto === 'tcp') {
      const fl = flagSet(p.flags), from = `${s.address}:${s.port}`, to = `${d.address}:${d.port}`, conv = [from, to].sort().join(' ');
      const len = dataLength(p), seq = p.seq ?? startSeq(from), ack = p.ack ?? startSeq(to);
      const shownFlags = FLAG_ORDER.filter(x => fl.has(x)).join('') || 'none';
      const parts = [`Flags [${shownFlags}]`];
      let base = bases.get(conv), absolute = !fl.has('.') || fl.has('S');
      if (fl.has('.') && !base) { base = { [from]: seq, [to]: (ack - 1 + 4294967296) % 4294967296 }; bases.set(conv, base); absolute = true; }
      const rel = (n: number, key: string) => absolute || !base ? n : (n - base[key] + 4294967296) % 4294967296;
      if (len || fl.has('S') || fl.has('F') || fl.has('R')) parts.push(len ? `seq ${rel(seq, from)}:${rel(seq, from) + len}` : `seq ${rel(seq, from)}`);
      if (fl.has('.')) parts.push(`ack ${rel(ack, to)}`);
      parts.push(`win ${p.win ?? (fl.has('S') ? (fl.has('.') ? 65160 : 64240) : fl.has('R') ? 0 : 502)}`);
      parts.push(`length ${len}`);
      next.set(from, (seq + len + (fl.has('S') ? 1 : 0) + (fl.has('F') ? 1 : 0)) % 4294967296);
      const http = p.payload !== undefined && [80, 8080].some(x => x === s.port || x === d.port) ? `: HTTP: ${p.payload.split(/\r?\n/)[0]}` : '';
      line = `IP ${shownAddr(p.src, p.proto)} > ${shownAddr(p.dst, p.proto)}: ${parts.join(', ')}${http}`;
    } else if (p.proto === 'udp') {
      const dns = p.dns && (s.port === 53 || d.port === 53) ? dnsText(p.dns, p.dns.response ?? s.port === 53) : `UDP, length ${dataLength(p)}`;
      line = `IP ${shownAddr(p.src, p.proto)} > ${shownAddr(p.dst, p.proto)}: ${dns}`;
    } else {
      const kind = p.icmp ?? 'echo-request';
      const what = kind === 'echo-request' || kind === 'echo-reply' ? `ICMP echo ${kind === 'echo-request' ? 'request' : 'reply'}, id ${p.id ?? 1}, seq ${p.icmpSeq ?? 1}, length 64`
        : kind === 'port-unreachable' ? `ICMP ${p.payload ?? d.address} udp port ${p.length ?? 33434} unreachable, length 68`
          : kind === 'host-unreachable' ? `ICMP host ${p.payload ?? d.address} unreachable, length 92` : 'ICMP time exceeded in-transit, length 68';
      line = `IP ${shownAddr(p.src, p.proto)} > ${shownAddr(p.dst, p.proto)}: ${what}`;
    }
    if (filter && !matches(filter, p)) continue;
    if (limit !== undefined && kept.length >= limit) break;
    kept.push(p);
    if (write !== undefined) continue;
    const t = cap.start + p.t, local = toLocal(z, Math.floor(t)), f = fields(local), micro = String(Math.round((t - Math.floor(t)) * 1e6)).padStart(6, '0');
    const time = `${two(f.hour)}:${two(f.minute)}:${two(f.second)}.${micro}`;
    const prefix = stamp === 'none' ? '' : stamp === 'date' ? `${f.year}-${two(f.month + 1)}-${two(f.day)} ${time} ` : `${time} `;
    io.out(`${prefix}${line}\n`);
    if (ascii && p.payload) io.out(`${p.payload.replace(/\r?\n$/, '')}\n`);
  }
  if (write !== undefined) {
    const nodes = new Map(state.nodes), opened = openWrite(nodes, state, write, false);
    if ('error' in opened) return fail(`tcpdump: ${write}: ${OPEN_TEXT[opened.error]}`);
    if (opened.path) nodes.set(opened.path, { ...nodes.get(opened.path)!, content: captureText({ start: cap.start, packets: kept }) });
    return { state: { ...state, nodes }, status: 0 };
  }
  return { state, status: 0 };
}
