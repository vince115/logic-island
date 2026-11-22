import { physicalPath, type FsState } from './fs';
import { decidePacket, type FirewallRule, type ParsedRules } from '../network/firewall';
import { isIPv4, parseCidr, servicePort, interfacesOf, type NetIo, type NetResult, type Proto } from './sockets';

/*
 * Engine stage E16 (docs/curriculum/SRV0_SERVER_CAPABILITY.md §17): the host firewall of Ubuntu 24.04 — ufw 0.36.2 and a
 * subset of nftables 1.0.9 — as data on each machine of the firewall profile, deciding the connections that reach it.
 *
 * ufw's rules compile to the CN rule model (src/lib/network/firewall.ts) and are decided with its decidePacket: ufw's own
 * "before" rules come first (loopback and connection tracking: RELATED,ESTABLISHED accept), then the user's rules in order
 * (first match), then the default incoming policy (deny drops, reject refuses). REJECT is carried beside the CN rule, which
 * knows only allow and deny. nft's input chains are evaluated rule by rule (ct state, iif/iifname, ip saddr/daddr, tcp/udp
 * dport, then accept, drop or reject; a base chain's policy when nothing decides). Every base chain of the hook must accept.
 * A packet is a new TCP connection (state new) unless the caller asks about an established one (an open ssh session).
 * Nothing touches a real network; rules live in the machine's state (/etc/ufw/user.rules is not written).
 */

export type Verdict = 'accept' | 'drop' | 'reject';
export type Policy = 'allow' | 'deny' | 'reject';
/** One ufw rule as the user added it (ufw keeps the IPv4 and IPv6 copies apart; v6 marks the copy). */
export interface UfwRule {
  action: 'allow' | 'deny' | 'reject' | 'limit'; direction: 'in' | 'out'; iface?: string;
  proto?: Proto; ports?: string; app?: string; from: string; fromPort?: string; to: string; v6: boolean; comment?: string;
  /** How the rule was written (simple: ufw allow 22/tcp; full: from … to … port). */
  form: 'simple' | 'full';
}
export interface UfwState { enabled: boolean; incoming: Policy; outgoing: Policy; routed: Policy | 'disabled'; logging: string; rules: UfwRule[] }
export interface NftMatch { ct?: string[]; iif?: string; saddr?: string[]; daddr?: string[]; /** E19: icmp too (ping, traceroute -I). */ proto?: Proto | 'icmp'; dport?: string[]; sport?: string[] }
export interface NftRule { handle: number; text: string; match: NftMatch; verdict?: Verdict }
export interface NftChain { name: string; handle: number; base?: { type: string; hook: string; priority: string; policy: 'accept' | 'drop' }; rules: NftRule[] }
export interface NftTable { family: string; name: string; handle: number; chains: NftChain[]; next: number }
/** E16: a machine's firewall: ufw (inactive until enabled) and the nftables ruleset loaded in the kernel. */
export interface FirewallState { ufw: UfwState; nft: NftTable[] }

export const DEFAULT_UFW: UfwState = { enabled: false, incoming: 'deny', outgoing: 'allow', routed: 'disabled', logging: 'low', rules: [] };
export const NFTABLES_CONF = '#!/usr/sbin/nft -f\n\nflush ruleset\n\ntable inet filter {\n\tchain input {\n\t\ttype filter hook input priority filter;\n\t}\n\tchain forward {\n\t\ttype filter hook forward priority filter;\n\t}\n\tchain output {\n\t\ttype filter hook output priority filter;\n\t}\n}\n';
export const UFW_APPS: Readonly<Record<string, string>> = {
  'openssh-server': '[OpenSSH]\ntitle=Secure shell server, an rshd replacement\ndescription=OpenSSH is a free implementation of the Secure Shell protocol.\nports=22/tcp\n',
  nginx: '[Nginx HTTP]\ntitle=Web Server (Nginx, HTTP)\ndescription=Small, but very powerful and efficient web server\nports=80/tcp\n\n[Nginx HTTPS]\ntitle=Web Server (Nginx, HTTPS)\ndescription=Small, but very powerful and efficient web server\nports=443/tcp\n\n[Nginx Full]\ntitle=Web Server (Nginx, HTTP + HTTPS)\ndescription=Small, but very powerful and efficient web server\nports=80,443/tcp\n',
};
const APPS_DIR = '/etc/ufw/applications.d';

// --------------------------------------------------------------------------------------------- application profiles

export interface AppProfile { name: string; title: string; description: string; ports: string[] }
/** ufw's application profiles: the [Name] sections of /etc/ufw/applications.d/* (what the installed packages put there). */
export function appsOf(state: FsState): AppProfile[] {
  const out: AppProfile[] = [];
  const dir = physicalPath(state.nodes, APPS_DIR, true);
  for (const [path, node] of state.nodes) {
    if (node.kind !== 'file' || !path.startsWith(`${dir}/`) || path.slice(dir.length + 1).includes('/')) continue;
    let cur: AppProfile | undefined;
    for (const raw of (node.content ?? '').split('\n')) {
      const line = raw.trim(), head = /^\[(.+)\]$/.exec(line);
      if (head) { cur = { name: head[1], title: '', description: '', ports: [] }; out.push(cur); continue; }
      const kv = /^(\w+)=(.*)$/.exec(line);
      if (!cur || !kv) continue;
      if (kv[1] === 'title') cur.title = kv[2]; else if (kv[1] === 'description') cur.description = kv[2]; else if (kv[1] === 'ports') cur.ports = kv[2].split('|');
    }
  }
  return out.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}
/** The protocols and port ranges of a port spec (22, 22/tcp, 80,443/tcp, 6000:6007/tcp; no protocol is tcp and udp). */
function portSets(spec: string): { proto: Proto; ranges: [number, number][] }[] {
  const [list, proto] = spec.split('/');
  const ranges = list.split(',').map(p => { const [a, b] = p.split(':'); return [Number(a), Number(b ?? a)] as [number, number]; });
  return (proto ? [proto as Proto] : ['tcp', 'udp'] as Proto[]).map(p => ({ proto: p, ranges }));
}

// ------------------------------------------------------------------------------------------------------ deciding

/** A connection as the firewall sees it: protocol, addresses, destination port, the interface it arrives on (lo for the machine itself). */
export interface Packet { /** E19: icmp is an echo request (ping, traceroute -I, mtr); its port is 0. */ proto: Proto | 'icmp'; src: string; dst: string; port: number; iface: string; state: 'new' | 'established' }

/** ufw's rules (one direction) compiled to the CN model: its before rules, the user's rules, the default; reject beside it. */
function compileUfw(state: FsState, ufw: UfwState, direction: 'in' | 'out', iface: string): { parsed: ParsedRules; reject: boolean[] } {
  const rules: FirewallRule[] = [], reject: boolean[] = [];
  const push = (r: FirewallRule, rej = false) => { rules.push(r); reject.push(rej); };
  // ufw-before-input / -output: loopback and connection tracking.
  push({ action: 'allow', protocol: 'any', src: direction === 'in' ? '127.0.0.0/8' : 'any', dst: direction === 'in' ? 'any' : '127.0.0.0/8', established: false });
  push({ action: 'allow', protocol: 'any', src: 'any', dst: 'any', established: true });
  // E19: ufw's before.rules accept ICMP echo requests coming in (ping is answered whatever the user's rules say).
  if (direction === 'in') push({ action: 'allow', protocol: 'icmp', src: 'any', dst: 'any', established: false });
  const apps = appsOf(state);
  for (const r of ufw.rules.filter(x => !x.v6 && x.direction === direction && (!x.iface || x.iface === iface))) {
    const action = r.action === 'deny' || r.action === 'reject' ? 'deny' : 'allow';
    const specs = r.app ? (apps.find(a => a.name === r.app)?.ports ?? []).flatMap(portSets) : r.ports ? portSets(`${r.ports}${r.proto ? `/${r.proto}` : ''}`) : [{ proto: r.proto ?? 'any', ranges: [] as [number, number][] }];
    for (const s of specs) {
      if (!s.ranges.length) { push({ action, protocol: s.proto as FirewallRule['protocol'], src: r.from, dst: r.to, established: false }, r.action === 'reject'); continue; }
      for (const range of s.ranges) push({ action, protocol: s.proto as FirewallRule['protocol'], src: r.from, dst: r.to, ports: range, established: false }, r.action === 'reject');
    }
  }
  const policy = direction === 'in' ? ufw.incoming : ufw.outgoing;
  return { parsed: { rules, defaultAction: policy === 'allow' ? 'allow' : 'deny', errors: [], explicitDefault: true }, reject: [...reject, policy === 'reject'] };
}
function ufwVerdict(state: FsState, ufw: UfwState, direction: 'in' | 'out', p: Packet): Verdict {
  if (!ufw.enabled) return 'accept';
  const { parsed, reject } = compileUfw(state, ufw, direction, p.iface);
  const d = decidePacket(parsed, { label: '', protocol: p.proto, src: p.src, dst: p.dst, ...p.proto === 'icmp' ? {} : { port: p.port }, state: p.state });
  if (d.action === 'allow') return 'accept';
  return reject[d.rule < 0 ? reject.length - 1 : d.rule] ? 'reject' : 'drop';
}

const inCidr = (ip: string, spec: string) => {
  const c = spec.includes('/') ? parseCidr(spec) : { address: spec, prefix: 32 };
  if (!c || !isIPv4(ip)) return false;
  const n = (a: string) => a.split('.').reduce((x, o) => x * 256 + Number(o), 0);
  const size = 2 ** (32 - c.prefix);
  return Math.floor(n(ip) / size) === Math.floor(n(c.address) / size);
};
const inPorts = (port: number, list: readonly string[]) => list.some(p => { const [a, b] = p.split('-').map(Number); return port >= a && port <= (b ?? a); });
function nftMatches(m: NftMatch, p: Packet): boolean {
  if (m.ct && !m.ct.includes(p.state)) return false;
  if (m.iif !== undefined && m.iif !== p.iface) return false;
  if (m.saddr && !m.saddr.some(a => inCidr(p.src, a))) return false;
  if (m.daddr && !m.daddr.some(a => inCidr(p.dst, a))) return false;
  if (m.proto && m.proto !== p.proto) return false;
  if (m.dport && !inPorts(p.port, m.dport)) return false;
  if (m.sport) return false;
  return true;
}
const PRIORITIES: Readonly<Record<string, number>> = { raw: -300, mangle: -150, dstnat: -100, filter: 0, security: 50, srcnat: 100 };
const priorityOf = (text: string) => PRIORITIES[text] ?? (Number(text) || 0);
function nftVerdict(tables: readonly NftTable[], hook: 'input' | 'output', p: Packet): Verdict {
  const chains = tables.filter(t => t.family === 'inet' || t.family === 'ip').flatMap(t => t.chains.filter(c => c.base?.hook === hook))
    .sort((a, b) => priorityOf(a.base!.priority) - priorityOf(b.base!.priority));
  for (const c of chains) {
    const hit = c.rules.find(r => r.verdict && nftMatches(r.match, p));
    const v = hit ? hit.verdict! : c.base!.policy === 'drop' ? 'drop' : 'accept';
    if (v !== 'accept') return v;
  }
  return 'accept';
}
/** E16: what a machine's firewall does with an incoming connection (nft's input chains, then ufw). */
export function decideIn(state: FsState, p: Packet): Verdict {
  const fw = state.firewall;
  if (!fw) return 'accept';
  const n = nftVerdict(fw.nft, 'input', p);
  if (n !== 'accept') return n;
  return p.iface === 'lo' ? 'accept' : ufwVerdict(state, fw.ufw, 'in', p);
}
/** E16: what a machine's firewall does with a connection it opens to another machine (nft's output chains, then ufw's outgoing policy and out rules). */
export function decideOut(state: FsState, p: Packet): Verdict {
  const fw = state.firewall;
  if (!fw) return 'accept';
  const n = nftVerdict(fw.nft, 'output', p);
  if (n !== 'accept') return n;
  return ufwVerdict(state, fw.ufw, 'out', p);
}
/** The interface an address of the machine belongs to (lo for loopback). */
export const ifaceOf = (state: FsState, address: string) => address.startsWith('127.') ? 'lo' : interfacesOf(state).find(i => i.address === address)?.name ?? 'eth0';

// ------------------------------------------------------------------------------------------------------------ ufw

const UFW_VERSION = 'ufw 0.36.2';
const PROMPT_SSH = 'Command may disrupt existing ssh connections. Proceed with operation (y|n)? ';
const NO_KEYBOARD = '（模擬環境沒有鍵盤輸入：確認不會把自己鎖在外面之後，用 sudo ufw --force … 或 echo y | sudo ufw … 回答 y）';
/** Text of a rule for ufw status's To and From columns. */
function locations(r: UfwRule): { to: string; from: string } {
  const portText = r.app ?? (r.ports ? `${r.ports}${r.proto ? `/${r.proto}` : ''}` : undefined);
  const v6 = r.v6 ? ' (v6)' : '';
  const to = `${r.to === 'any' ? portText ?? 'Anywhere' : portText ? `${r.to} ${portText}` : r.to}${v6}${r.iface ? ` on ${r.iface}` : ''}`;
  const fromPort = r.fromPort ? ` ${r.fromPort}${r.proto ? `/${r.proto}` : ''}` : '';
  return { to, from: `${r.from === 'any' ? 'Anywhere' : r.from}${fromPort}${v6}` };
}
/** A rule as a ufw command (show added, Deleting:). */
function ruleCommand(r: UfwRule): string {
  const dir = r.direction === 'out' ? ' out' : '', on = r.iface ? ` on ${r.iface}` : '';
  if (r.form === 'simple') return `${r.action}${dir}${on} ${r.app ? (r.app.includes(' ') ? `'${r.app}'` : r.app) : `${r.ports}${r.proto ? `/${r.proto}` : ''}`}`;
  const parts = [`${r.action}${dir}${on}`, ...r.proto && !r.app ? [`proto ${r.proto}`] : [], `from ${r.from}`, ...r.fromPort ? [`port ${r.fromPort}`] : [], `to ${r.to}`,
    ...r.app ? [`app ${r.app.includes(' ') ? `'${r.app}'` : r.app}`] : r.ports ? [`port ${r.ports}`] : []];
  return parts.join(' ');
}
const sameMatch = (a: UfwRule, b: UfwRule) => a.direction === b.direction && (a.iface ?? '') === (b.iface ?? '') && (a.proto ?? '') === (b.proto ?? '') && (a.ports ?? '') === (b.ports ?? '')
  && (a.app ?? '') === (b.app ?? '') && a.from === b.from && (a.fromPort ?? '') === (b.fromPort ?? '') && a.to === b.to && a.v6 === b.v6;

/** Parses a ufw rule (after allow|deny|reject|limit); errors are ufw's. */
export function parseUfwRule(state: FsState, action: UfwRule['action'], words: readonly string[]): { rules: UfwRule[] } | { error: string } {
  let i = 0, direction: 'in' | 'out' = 'in', iface: string | undefined, comment: string | undefined;
  const w = [...words];
  const ci = w.indexOf('comment');
  if (ci >= 0) { comment = w[ci + 1]; w.splice(ci, 2); }
  if (w[i] === 'in' || w[i] === 'out') direction = w[i++] as 'in' | 'out';
  if (w[i] === 'on') { iface = w[i + 1]; i += 2; if (!iface || !/^[a-z][a-z0-9]{0,14}$/.test(iface)) return { error: 'ERROR: Bad interface name' }; }
  if (w[i] === 'log' || w[i] === 'log-all') i++;
  const rest = w.slice(i);
  if (!rest.length) return { error: 'ERROR: Invalid syntax' };
  const apps = appsOf(state);
  const checkPorts = (spec: string, proto?: string): string | null => {
    if (!/^\d+(:\d+)?(,\d+(:\d+)?)*$/.test(spec)) return 'ERROR: Bad port';
    const nums = spec.split(/[,:]/).map(Number);
    if (nums.some(n => n < 1 || n > 65535)) return 'ERROR: Bad port';
    if ((spec.includes(',') || spec.includes(':')) && !proto) return "ERROR: Must specify 'tcp' or 'udp' with multiple ports";
    return null;
  };
  const both = (base: Omit<UfwRule, 'v6'>, v4only: boolean): UfwRule[] => [{ ...base, v6: false }, ...v4only ? [] : [{ ...base, v6: true }]];
  // Simple syntax: one word that is a port spec, a service name or an application profile.
  if (rest.length === 1 && !['from', 'to', 'proto'].includes(rest[0])) {
    const spec = rest[0], app = apps.find(a => a.name.toLowerCase() === spec.toLowerCase());
    const base = { action, direction, ...iface ? { iface } : {}, from: 'any', to: 'any', form: 'simple' as const, ...comment !== undefined ? { comment } : {} };
    if (app) return { rules: both({ ...base, app: app.name }, false) };
    const [p, proto] = spec.split('/');
    if (proto !== undefined && proto !== 'tcp' && proto !== 'udp') return { error: 'ERROR: Unsupported protocol' };
    if (/^\d/.test(p)) {
      const e = checkPorts(p, proto);
      if (e) return { error: e };
      return { rules: both({ ...base, ports: p, ...proto ? { proto: proto as Proto } : {} }, false) };
    }
    const port = servicePort(state, p, (proto as Proto) ?? 'tcp');
    if (port === undefined) return { error: /^[A-Za-z]/.test(spec) && /\s/.test(spec) ? `ERROR: Could not find a profile matching '${spec}'` : `ERROR: Could not find a profile matching '${spec}'` };
    const tcpOnly = !proto && servicePort(state, p, 'udp') === undefined;
    return { rules: both({ ...base, ports: String(port), ...proto ? { proto: proto as Proto } : tcpOnly ? { proto: 'tcp' as Proto } : {} }, false) };
  }
  // Full syntax: [proto P] [from ADDR [port N]] [to ADDR [port N | app NAME]] [proto P].
  let proto: Proto | undefined, from = 'any', to = 'any', port: string | undefined, fromPort: string | undefined, app: string | undefined, side: 'from' | 'to' | undefined;
  for (let k = 0; k < rest.length; k++) {
    const word = rest[k], value = rest[k + 1];
    if (word === 'proto') { if (value !== 'tcp' && value !== 'udp') return { error: 'ERROR: Unsupported protocol' }; proto = value; k++; continue; }
    if (word === 'from' || word === 'to') {
      if (value === undefined) return { error: 'ERROR: Invalid syntax' };
      const ok = value === 'any' || (value.includes('/') ? !!parseCidr(value) : isIPv4(value));
      if (!ok) return { error: word === 'from' ? 'ERROR: Bad source address' : 'ERROR: Bad destination address' };
      if (word === 'from') from = value; else to = value;
      side = word; k++; continue;
    }
    if (word === 'port') {
      if (value === undefined || !side) return { error: 'ERROR: Invalid syntax' };
      if (side === 'to') port = value; else fromPort = value;
      k++; continue;
    }
    if (word === 'app') {
      const found = apps.find(a => a.name.toLowerCase() === (value ?? '').toLowerCase());
      if (!found) return { error: `ERROR: Could not find a profile matching '${value ?? ''}'` };
      app = found.name; k++; continue;
    }
    return { error: 'ERROR: Invalid syntax' };
  }
  for (const spec of [port, fromPort]) if (spec !== undefined) { const e = /^\d/.test(spec) ? checkPorts(spec, proto) : null; if (e) return { error: e }; }
  if (port !== undefined && !/^\d/.test(port)) { const n = servicePort(state, port, proto ?? 'tcp'); if (n === undefined) return { error: 'ERROR: Bad port' }; port = String(n); }
  const base = { action, direction, ...iface ? { iface } : {}, from, to, form: 'full' as const, ...proto ? { proto } : {}, ...port ? { ports: port } : {}, ...fromPort ? { fromPort } : {}, ...app ? { app } : {}, ...comment !== undefined ? { comment } : {} };
  return { rules: both(base, from !== 'any' || to !== 'any') };
}

/** The firewall of a machine (the defaults when it has none yet). */
const fwOf = (state: FsState): FirewallState => state.firewall ?? { ufw: DEFAULT_UFW, nft: [] };

/**
 * ufw [--force] enable|disable|reload|reset | default allow|deny|reject [incoming|outgoing|routed] | logging on|off|LEVEL |
 * status [verbose|numbered] | show added | app list|info NAME | [insert N] allow|deny|reject|limit RULE | delete N|RULE.
 * Messages of ufw 0.36.2; enable (and delete by number) asks first when it runs in an ssh session, as ufw does.
 */
export function ufw(state: FsState, args: readonly string[], io: NetIo): NetResult {
  const words = [...args];
  let force = false, dry = false;
  while (words[0]?.startsWith('--')) {
    const a = words.shift()!;
    if (a === '--force') force = true;
    else if (a === '--dry-run') dry = true;
    else if (a === '--version') { io.out(`${UFW_VERSION}\nCopyright 2008-2023 Canonical Ltd.\n`); return { state, status: 0 }; }
    else if (a === '--help') { io.out('\nUsage: ufw COMMAND\n\nCommands:\n enable                          enables the firewall\n disable                         disables the firewall\n default ARG                     set default policy\n logging LEVEL                   set logging to LEVEL\n allow ARGS                      add allow rule\n deny ARGS                       add deny rule\n reject ARGS                     add reject rule\n limit ARGS                      add limit rule\n delete RULE|NUM                 delete RULE\n insert NUM RULE                 insert RULE at NUM\n reload                          reload firewall\n reset                           reset firewall\n status                          show firewall status\n status numbered                 show firewall status as numbered list of RULES\n status verbose                  show verbose firewall status\n show ARG                        show firewall report\n version                         display version information\n\nApplication profile commands:\n app list                        list application profiles\n app info PROFILE                show information on PROFILE\n'); return { state, status: 0 }; }
    else { io.err(`ERROR: Invalid syntax`); return { state, status: 1 }; }
  }
  const cmd = words.shift();
  if (cmd === 'version') { io.out(`${UFW_VERSION}\nCopyright 2008-2023 Canonical Ltd.\n`); return { state, status: 0 }; }
  if (io.user !== 'root') { io.err('ERROR: You need to be root to run this script'); return { state, status: 1 }; }
  const fw = fwOf(state), u = fw.ufw;
  const save = (next: UfwState, nft = fw.nft): FsState => dry ? state : { ...state, firewall: { ufw: next, nft } };
  const say = (l: string) => io.out(`${l}\n`);
  // ufw asks before enabling (or deleting by number) inside an ssh session (it looks for sshd among its parents).
  const ask = (): boolean => {
    if (force) return true;
    const answer = (io.stdin ?? '').split('\n')[0].trim().toLowerCase();
    io.out(PROMPT_SSH);
    if (answer === 'y' || answer === 'yes') return true;
    io.out('\n');
    if (io.stdin == null) io.err(NO_KEYBOARD);
    say('Aborted');
    return false;
  };
  const underSsh = !!state.sshd;
  switch (cmd) {
    case 'enable': {
      if (underSsh && !u.enabled && !ask()) return { state, status: 1 };
      say('Firewall is active and enabled on system startup');
      return { state: save({ ...u, enabled: true }), status: 0 };
    }
    case 'disable': say('Firewall stopped and disabled on system startup'); return { state: save({ ...u, enabled: false }), status: 0 };
    case 'reload': say(u.enabled ? 'Firewall reloaded' : 'Firewall not enabled (skipping reload)'); return { state, status: 0 };
    case 'reset': {
      if (!force) { say('Resetting all rules to installed defaults. This may disrupt existing ssh'); say('connections. Proceed with operation (y|n)? '); if (!/^y/i.test((io.stdin ?? '').trim())) { if (io.stdin == null) io.err(NO_KEYBOARD); say('Aborted'); return { state, status: 1 }; } }
      if (u.enabled) say('Firewall stopped and disabled on system startup');
      return { state: save({ ...DEFAULT_UFW }), status: 0 };
    }
    case 'default': {
      const [policy, dirWord = 'incoming'] = words;
      const dir = dirWord === 'incoming' || dirWord === 'in' ? 'incoming' : dirWord === 'outgoing' || dirWord === 'out' ? 'outgoing' : dirWord === 'routed' ? 'routed' : undefined;
      if (!['allow', 'deny', 'reject'].includes(policy ?? '') || !dir) { io.err('ERROR: Unsupported policy'); return { state, status: 1 }; }
      say(`Default ${dir} policy changed to '${policy}'`);
      say('(be sure to update your rules accordingly)');
      return { state: save({ ...u, [dir]: policy as Policy }), status: 0 };
    }
    case 'logging': {
      const level = words[0];
      if (!['on', 'off', 'low', 'medium', 'high', 'full'].includes(level ?? '')) { io.err('ERROR: Invalid log level'); return { state, status: 1 }; }
      say(level === 'off' ? 'Logging disabled' : 'Logging enabled');
      return { state: save({ ...u, logging: level === 'on' ? 'low' : level }), status: 0 };
    }
    case 'status': {
      const mode = words[0];
      if (mode !== undefined && mode !== 'verbose' && mode !== 'numbered') { io.err('ERROR: Invalid syntax'); return { state, status: 1 }; }
      if (!u.enabled) { say('Status: inactive'); return { state, status: 0 }; }
      say('Status: active');
      if (mode === 'verbose') {
        say(`Logging: ${u.logging === 'off' ? 'off' : `on (${u.logging})`}`);
        say(`Default: ${u.incoming} (incoming), ${u.outgoing} (outgoing), ${u.routed === 'disabled' ? 'disabled' : u.routed} (routed)`);
        say('New profiles: skip');
      }
      const rows = [...u.rules.filter(r => !r.v6), ...u.rules.filter(r => r.v6)];
      if (!rows.length) return { state, status: 0 };
      say('');
      const pre = mode === 'numbered' ? '     ' : '';
      say(`${pre}${'To'.padEnd(26)} ${'Action'.padEnd(12)}From`);
      say(`${pre}${'--'.padEnd(26)} ${'------'.padEnd(12)}----`);
      rows.forEach((r, k) => {
        const l = locations(r), action = `${r.action.toUpperCase()}${mode || r.direction === 'out' ? ` ${r.direction.toUpperCase()}` : ''}`;
        const line = `${mode === 'numbered' ? `[${String(k + 1).padStart(2)}] ` : ''}${l.to.padEnd(26)} ${action.padEnd(12)}${r.comment !== undefined ? `${l.from.padEnd(27)}# ${r.comment}` : l.from}`;
        say(line);
      });
      say('');
      return { state, status: 0 };
    }
    case 'show': {
      if (words[0] !== 'added') { io.err('ERROR: 模擬環境的 ufw show 只支援 added'); return { state, status: 1 }; }
      say("Added user rules (see 'ufw status' for running firewall):");
      const seen = new Set<string>();
      for (const r of [...u.rules.filter(x => !x.v6), ...u.rules.filter(x => x.v6)]) { const t = `ufw ${ruleCommand(r)}${r.comment !== undefined ? ` comment '${r.comment}'` : ''}`; if (!seen.has(t)) { seen.add(t); say(t); } }
      if (!u.rules.length) say('(None)');
      return { state, status: 0 };
    }
    case 'app': {
      const apps = appsOf(state);
      if (words[0] === 'list') { say('Available applications:'); apps.forEach(a => say(`  ${a.name}`)); return { state, status: 0 }; }
      if (words[0] === 'info') {
        const a = apps.find(x => x.name.toLowerCase() === words.slice(1).join(' ').toLowerCase());
        if (!a) { io.err(`ERROR: Could not find profile '${words.slice(1).join(' ')}'`); return { state, status: 1 }; }
        say(`Profile: ${a.name}`); say(`Title: ${a.title}`); say(''); say(`Description: ${a.description}`); say('');
        say(a.ports.length > 1 || /[,:]/.test(a.ports[0] ?? '') ? 'Ports:' : 'Port:');
        a.ports.forEach(p => say(`  ${p}`));
        return { state, status: 0 };
      }
      io.err('ERROR: Invalid syntax');
      return { state, status: 1 };
    }
    case 'delete': {
      if (words.length === 1 && /^\d+$/.test(words[0])) {
        const rows = [...u.rules.filter(r => !r.v6), ...u.rules.filter(r => r.v6)], n = Number(words[0]), target = rows[n - 1];
        if (!target) { io.err(`ERROR: Could not find rule '${n}'`); return { state, status: 1 }; }
        if (!force) {
          say('Deleting:');
          say(` ${ruleCommand(target)}${target.v6 ? ' (v6)' : ''}`);
          const answer = (io.stdin ?? '').split('\n')[0].trim().toLowerCase();
          io.out('Proceed with operation (y|n)? ');
          if (answer !== 'y' && answer !== 'yes') { io.out('\n'); if (io.stdin == null) io.err(NO_KEYBOARD); say('Aborted'); return { state, status: 1 }; }
        }
        say(target.v6 ? 'Rule deleted (v6)' : 'Rule deleted');
        return { state: save({ ...u, rules: u.rules.filter(r => r !== target) }), status: 0 };
      }
      const [action, ...rest] = words;
      if (!['allow', 'deny', 'reject', 'limit'].includes(action ?? '')) { io.err('ERROR: Invalid syntax'); return { state, status: 1 }; }
      const p = parseUfwRule(state, action as UfwRule['action'], rest);
      if ('error' in p) { io.err(p.error); return { state, status: 1 }; }
      let rules = u.rules;
      for (const r of p.rules) {
        const hit = rules.find(x => sameMatch(x, r) && x.action === r.action);
        if (hit) { rules = rules.filter(x => x !== hit); say(r.v6 ? 'Rule deleted (v6)' : 'Rule deleted'); }
        else say(r.v6 ? 'Could not delete non-existent rule (v6)' : 'Could not delete non-existent rule');
      }
      return { state: save({ ...u, rules }), status: 0 };
    }
    case 'insert': case 'prepend': case 'allow': case 'deny': case 'reject': case 'limit': {
      let position: number | undefined, action: string = cmd;
      if (cmd === 'insert' || cmd === 'prepend') {
        if (cmd === 'insert') { const n = words.shift(); if (!/^\d+$/.test(n ?? '') || Number(n) < 1) { io.err(`ERROR: Invalid position '${n ?? ''}'`); return { state, status: 1 }; } position = Number(n); }
        else position = 1;
        action = words.shift() ?? '';
        if (!['allow', 'deny', 'reject', 'limit'].includes(action)) { io.err('ERROR: Invalid syntax'); return { state, status: 1 }; }
      }
      const p = parseUfwRule(state, action as UfwRule['action'], words);
      if ('error' in p) { io.err(p.error); return { state, status: 1 }; }
      let rules = [...u.rules];
      const v4count = rules.filter(r => !r.v6).length;
      if (position !== undefined && position > v4count && v4count > 0) { io.err(`ERROR: Invalid position '${position}'`); return { state, status: 1 }; }
      for (const r of p.rules) {
        const same = rules.find(x => sameMatch(x, r));
        if (same && same.action === r.action && same.comment === r.comment) { say(r.v6 ? 'Skipping adding existing rule (v6)' : 'Skipping adding existing rule'); continue; }
        if (same) { rules = rules.map(x => x === same ? r : x); say(r.v6 ? 'Rule updated (v6)' : 'Rule updated'); continue; }
        if (position !== undefined) {
          const group = rules.filter(x => x.v6 === r.v6), at = r.v6 ? 0 : position - 1, before = group[at];
          rules = before ? rules.flatMap(x => x === before ? [r, x] : [x]) : [...rules, r];
          say(r.v6 ? 'Rule inserted (v6)' : 'Rule inserted');
        } else { rules.push(r); say(r.v6 ? 'Rules updated (v6)' : 'Rules updated'); }
      }
      return { state: save({ ...u, rules }), status: 0 };
    }
    case undefined: io.err('ERROR: not enough args'); return { state, status: 1 };
    default: io.err('ERROR: Invalid syntax'); return { state, status: 1 };
  }
}

// ------------------------------------------------------------------------------------------------------------ nft

class NftError extends Error {}
const FAMILIES = ['inet', 'ip', 'ip6', 'arp', 'bridge', 'netdev'];
/** The tokens of nft's language: words, quoted strings, { } ; and , as their own tokens (newlines end statements). */
function nftTokens(text: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '#') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (ch === '\n') { out.push(';'); i++; continue; }
    if (/\s/.test(ch)) { i++; continue; }
    if ('{};,'.includes(ch)) { out.push(ch); i++; continue; }
    if (ch === '"') { const end = text.indexOf('"', i + 1); if (end < 0) throw new NftError('syntax error, unexpected end of file'); out.push(`"${text.slice(i + 1, end)}"`); i = end + 1; continue; }
    let w = '';
    while (i < text.length && !/[\s{};,#"]/.test(text[i])) w += text[i++];
    out.push(w);
  }
  return out;
}
const unquote = (w: string) => w.replace(/^"(.*)"$/, '$1');
/** A list after a match keyword: one value, a,b,c (ct state), or { a, b }. */
function takeList(t: string[], i: { at: number }): string[] {
  if (t[i.at] === '{') {
    const out: string[] = [];
    i.at++;
    while (i.at < t.length && t[i.at] !== '}') { if (t[i.at] !== ',' && t[i.at] !== ';') out.push(unquote(t[i.at])); i.at++; }
    if (t[i.at] !== '}') throw new NftError("syntax error, unexpected end of file, expecting '}'");
    i.at++;
    return out;
  }
  const out = [unquote(t[i.at++] ?? '')];
  while (t[i.at] === ',') { out.push(unquote(t[i.at + 1] ?? '')); i.at += 2; }
  return out;
}
const portOk = (p: string) => /^\d+(-\d+)?$/.test(p) && p.split('-').every(n => Number(n) >= 0 && Number(n) <= 65535);
/** One rule's statements: matches, then counter/log, then a verdict; returns the rule and nft's canonical text for it. */
function parseRule(t: string[]): { match: NftMatch; verdict?: Verdict; text: string } {
  const m: NftMatch = {}, shown: string[] = [];
  let verdict: Verdict | undefined, counter = false;
  const i = { at: 0 };
  const list = (vals: string[]) => vals.length > 1 ? `{ ${vals.join(', ')} }` : vals[0];
  while (i.at < t.length) {
    const w = t[i.at++];
    if (verdict) throw new NftError(`syntax error, unexpected ${w}`);
    if (w === 'ct' && t[i.at] === 'state') {
      i.at++;
      const vals = takeList(t, i);
      if (vals.some(v => !['new', 'established', 'related', 'invalid', 'untracked'].includes(v))) throw new NftError(`syntax error, unexpected string`);
      m.ct = vals.map(v => v === 'related' ? 'established' : v);
      shown.push(`ct state ${vals.join(',')}`);
    } else if (w === 'iif' || w === 'iifname') {
      const v = unquote(t[i.at++] ?? '');
      if (!v) throw new NftError('syntax error, unexpected end of file');
      m.iif = v; shown.push(`${w} "${v}"`);
    } else if (w === 'ip' && (t[i.at] === 'saddr' || t[i.at] === 'daddr')) {
      const which = t[i.at++] as 'saddr' | 'daddr', vals = takeList(t, i);
      if (vals.some(v => !(isIPv4(v) || parseCidr(v)))) throw new NftError(`Could not resolve hostname: ${vals.find(v => !(isIPv4(v) || parseCidr(v)))}`);
      m[which] = vals; shown.push(`ip ${which} ${list(vals)}`);
    } else if ((w === 'tcp' || w === 'udp') && (t[i.at] === 'dport' || t[i.at] === 'sport')) {
      const which = t[i.at++] as 'dport' | 'sport', vals = takeList(t, i);
      if (vals.some(v => !portOk(v))) throw new NftError(`Could not resolve service: Servname not supported for ai_socktype`);
      m.proto = w; m[which] = vals; shown.push(`${w} ${which} ${list(vals)}`);
    } else if (w === 'meta' && t[i.at] === 'l4proto') {
      i.at++;
      const v = t[i.at++];
      // Fix (E19): icmp is a protocol of its own (before, such a rule matched every packet).
      if (v === 'tcp' || v === 'udp' || v === 'icmp') m.proto = v;
      shown.push(`meta l4proto ${v}`);
    } else if (w === 'ip' && t[i.at] === 'protocol') {
      i.at++;
      const v = t[i.at++];
      if (v === 'tcp' || v === 'udp' || v === 'icmp') m.proto = v;
      shown.push(`ip protocol ${v}`);
    } else if (w === 'icmp' && t[i.at] === 'type') {
      // E19: icmp type echo-request (the ping a server answers).
      i.at++;
      const vals = takeList(t, i);
      if (vals.some(v => !['echo-request', 'echo-reply', 'destination-unreachable', 'time-exceeded'].includes(v))) throw new NftError(`syntax error, unexpected string`);
      m.proto = 'icmp'; shown.push(`icmp type ${list(vals)}`);
    } else if (w === 'counter') { counter = true; while (t[i.at] === 'packets' || t[i.at] === 'bytes') i.at += 2; }
    else if (w === 'log') { const parts = ['log']; if (t[i.at] === 'prefix') { parts.push('prefix', `"${unquote(t[i.at + 1] ?? '')}"`); i.at += 2; } shown.push(parts.join(' ')); }
    else if (w === 'accept' || w === 'drop') verdict = w;
    else if (w === 'reject') { verdict = 'reject'; let extra = ''; if (t[i.at] === 'with') { extra = ` with ${t.slice(i.at + 1, i.at + 3).join(' ')}`; i.at += 3; } shown.push(`reject${extra}`); }
    else if (w === 'jump' || w === 'goto') throw new NftError('模擬環境的 nft 不支援 jump／goto（請把規則寫在 input 鏈裡）');
    else throw new NftError(`syntax error, unexpected ${w}`);
  }
  if (counter) shown.push('counter packets 0 bytes 0');
  if (verdict === 'accept' || verdict === 'drop') shown.push(verdict);
  return { match: m, ...verdict ? { verdict } : {}, text: shown.join(' ') };
}
function chainSpec(t: string[]): NftChain['base'] {
  // type filter hook input priority 0; policy drop;
  const s = t.filter(x => x !== ';');
  const at = (k: string) => { const i = s.indexOf(k); return i >= 0 ? s[i + 1] : undefined; };
  const type = at('type'), hook = at('hook'), priority = at('priority'), policy = at('policy');
  if (!type || !hook || priority === undefined) throw new NftError('syntax error, unexpected end of file');
  if (!['input', 'output', 'forward', 'prerouting', 'postrouting'].includes(hook)) throw new NftError(`unknown chain hook ${hook}`);
  if (policy !== undefined && policy !== 'accept' && policy !== 'drop') throw new NftError(`syntax error, unexpected ${policy}`);
  return { type, hook, priority, policy: policy === 'drop' ? 'drop' : 'accept' };
}

/** The ruleset as nft list ruleset prints it (tabs; -a adds the handles). */
export function nftText(tables: readonly NftTable[], handles = false): string {
  const h = (n: number) => handles ? ` # handle ${n}` : '';
  const priority = (p: string) => { const n = Number(p); const name = Object.entries(PRIORITIES).find(([, v]) => v === n)?.[0]; return Number.isNaN(n) ? p : name ?? p; };
  return tables.map(t => [`table ${t.family} ${t.name} {${h(t.handle)}`, ...t.chains.flatMap((c, k) => [
    ...k ? [] : [], `\tchain ${c.name} {${h(c.handle)}`,
    ...c.base ? [`\t\ttype ${c.base.type} hook ${c.base.hook} priority ${priority(c.base.priority)}; policy ${c.base.policy};`] : [],
    ...c.rules.map(r => `\t\t${r.text}${h(r.handle)}`), '\t}']), '}'].join('\n')).join('\n') + (tables.length ? '\n' : '');
}

/** nft -f: flush ruleset, table FAMILY NAME { chain NAME { type …; policy …; RULES } } (and add/flush lines), applied at once. */
function loadFile(tables0: readonly NftTable[], text: string): NftTable[] {
  let tables = tables0.map(t => ({ ...t, chains: t.chains.map(c => ({ ...c, rules: [...c.rules] })) }));
  const t = nftTokens(text.replace(/^#!.*\n/, ''));
  let i = 0;
  const skip = () => { while (t[i] === ';') i++; };
  while (i < t.length) {
    skip();
    if (i >= t.length) break;
    const w = t[i++];
    if (w === 'flush' && t[i] === 'ruleset') { tables = []; i++; continue; }
    if (w === 'table' || (w === 'add' && t[i] === 'table')) {
      if (w === 'add') i++;
      let family = 'ip';
      if (FAMILIES.includes(t[i])) family = t[i++];
      const name = t[i++];
      if (!name || name === '{') throw new NftError('syntax error, unexpected {');
      let table = tables.find(x => x.family === family && x.name === name);
      if (!table) { table = { family, name, handle: tables.length + 1, chains: [], next: 1 }; tables.push(table); }
      if (t[i] !== '{') continue;
      i++;
      for (;;) {
        skip();
        if (t[i] === '}') { i++; break; }
        if (t[i] !== 'chain') throw new NftError(`syntax error, unexpected ${t[i] ?? 'end of file'}`);
        i++;
        const cname = t[i++];
        if (t[i++] !== '{') throw new NftError('syntax error, unexpected newline, expecting {');
        let chain = table.chains.find(c => c.name === cname);
        if (!chain) { chain = { name: cname, handle: table.next++, rules: [] }; table.chains.push(chain); }
        for (;;) {
          skip();
          if (t[i] === '}') { i++; break; }
          if (i >= t.length) throw new NftError("syntax error, unexpected end of file, expecting '}'");
          const stmt: string[] = [];
          while (i < t.length && t[i] !== ';' && t[i] !== '}') {
            if (t[i] === '{') { while (i < t.length && t[i] !== '}') stmt.push(t[i++]); stmt.push(t[i++]); continue; }
            stmt.push(t[i++]);
          }
          if (stmt[0] === 'type') {
            const spec = [...stmt];
            // type … priority …; policy …; come as two statements.
            while (t[i] === ';' && t[i + 1] === 'policy') { i++; while (i < t.length && t[i] !== ';' && t[i] !== '}') spec.push(t[i++]); }
            chain.base = chainSpec(spec);
            continue;
          }
          if (stmt[0] === 'policy') { if (chain.base) chain.base = { ...chain.base, policy: stmt[1] === 'drop' ? 'drop' : 'accept' }; continue; }
          const r = parseRule(stmt);
          chain.rules.push({ handle: table.next++, ...r });
        }
      }
      continue;
    }
    throw new NftError(`syntax error, unexpected ${w}`);
  }
  return tables;
}
/** E16 (lesson data): a ruleset text loaded at boot (nft -f syntax), or the problem with it. */
export function loadRuleset(text: string): NftTable[] | { error: string } {
  try { return loadFile([], text); } catch (e) { if (e instanceof NftError) return { error: e.message }; throw e; }
}

/**
 * nft [-a] list ruleset | list tables | list table F T | list chain F T C | flush ruleset | add|create table [F] T |
 * delete table [F] T | add chain [F] T C [{ type … hook … priority …; policy …; }] | add|insert rule [F] T C STATEMENTS |
 * delete rule [F] T C handle N | flush chain [F] T C | -f FILE [-c]. Errors are nft's "Error: …" lines (the caret lines
 * under the command are not drawn).
 */
export function nft(state: FsState, args: readonly string[], io: NetIo): NetResult {
  const words = [...args];
  let handles = false, file: string | undefined, check = false;
  while (words[0]?.startsWith('-')) {
    const a = words.shift()!;
    if (a === '-a' || a === '--handle') handles = true;
    else if (a === '-c' || a === '--check') check = true;
    else if (a === '-f' || a === '--file') file = words.shift();
    else if (a === '-v' || a === '--version') { io.out('nftables v1.0.9 (Old Doc Yak #3)\n'); return { state, status: 0 }; }
    else if (a === '-n' || a === '-s' || a === '-nn') continue;
    else { io.err(`nft: invalid option -- '${a.replace(/^-+/, '')}'`); return { state, status: 1 }; }
  }
  if (io.user !== 'root') { io.err('Error: Could not process rule: Operation not permitted'); return { state, status: 1 }; }
  const fw = fwOf(state);
  const done = (tables: NftTable[]): NetResult => ({ state: check ? state : { ...state, firewall: { ...fw, nft: tables } }, status: 0 });
  const fail = (msg: string) => { io.err(`Error: ${msg}`); return { state, status: 1 }; };
  try {
    if (file !== undefined) {
      const path = file.startsWith('/') ? file : `${state.cwd.replace(/\/$/, '')}/${file}`;
      const node = state.nodes.get(physicalPath(state.nodes, path, true));
      if (node?.kind !== 'file') return fail(`Could not open file "${file}": No such file or directory`);
      return done(loadFile(fw.nft, node.content ?? ''));
    }
    const tables = fw.nft.map(t => ({ ...t, chains: t.chains.map(c => ({ ...c, rules: [...c.rules] })) }));
    const [verb, what, ...rest] = words;
    const target = (): { family: string; name: string; rest: string[] } => {
      let i = 0, family = 'ip';
      if (FAMILIES.includes(rest[0])) { family = rest[0]; i = 1; }
      return { family, name: rest[i], rest: rest.slice(i + 1) };
    };
    const tableOf = (family: string, name: string) => {
      const t = tables.find(x => x.family === family && x.name === name);
      if (!t) throw new NftError('Could not process rule: No such file or directory');
      return t;
    };
    if (verb === 'list') {
      if (what === 'ruleset') {
        if (fw.ufw.enabled) io.err('（模擬環境：ufw 的規則由 iptables-nft 產生，這裡不列出；請用 sudo ufw status verbose）');
        io.out(nftText(tables, handles));
        return { state, status: 0 };
      }
      if (what === 'tables') { tables.forEach(t => io.out(`table ${t.family} ${t.name}\n`)); return { state, status: 0 }; }
      if (what === 'table') { const x = target(); io.out(nftText([tableOf(x.family, x.name)], handles)); return { state, status: 0 }; }
      if (what === 'chain') {
        const x = target(), table = tableOf(x.family, x.name), chain = table.chains.find(c => c.name === x.rest[0]);
        if (!chain) throw new NftError('No such file or directory');
        io.out(nftText([{ ...table, chains: [chain] }], handles));
        return { state, status: 0 };
      }
      return fail('syntax error, unexpected newline');
    }
    if (verb === 'flush' && what === 'ruleset') return done([]);
    if ((verb === 'add' || verb === 'create') && what === 'table') {
      const x = target();
      if (!x.name) return fail('syntax error, unexpected newline');
      if (tables.some(t => t.family === x.family && t.name === x.name)) { if (verb === 'create') return fail('Could not process rule: File exists'); return done(tables); }
      return done([...tables, { family: x.family, name: x.name, handle: tables.length + 1, chains: [], next: 1 }]);
    }
    if (verb === 'delete' && what === 'table') { const x = target(); tableOf(x.family, x.name); return done(tables.filter(t => !(t.family === x.family && t.name === x.name))); }
    if ((verb === 'add' || verb === 'create') && what === 'chain') {
      const x = target(), table = tableOf(x.family, x.name), cname = x.rest[0];
      if (!cname) return fail('syntax error, unexpected newline');
      const body = nftTokens(x.rest.slice(1).join(' ')).filter(w => w !== '{' && w !== '}');
      const existing = table.chains.find(c => c.name === cname);
      if (existing) { if (verb === 'create') return fail('Could not process rule: File exists'); if (body.length) existing.base = chainSpec(body); return done(tables); }
      table.chains.push({ name: cname, handle: table.next++, rules: [], ...body.length ? { base: chainSpec(body) } : {} });
      return done(tables);
    }
    if (verb === 'flush' && what === 'chain') { const x = target(), table = tableOf(x.family, x.name), chain = table.chains.find(c => c.name === x.rest[0]); if (!chain) throw new NftError('No such file or directory'); chain.rules = []; return done(tables); }
    if ((verb === 'add' || verb === 'insert') && what === 'rule') {
      const x = target(), table = tableOf(x.family, x.name), chain = table.chains.find(c => c.name === x.rest[0]);
      if (!chain) throw new NftError('No such file or directory');
      let stmt = nftTokens(x.rest.slice(1).join(' ')).filter(w => w !== ';'), at: number | undefined;
      if (stmt[0] === 'position' || stmt[0] === 'handle' || stmt[0] === 'index') { at = Number(stmt[1]); stmt = stmt.slice(2); }
      if (!stmt.length) return fail('syntax error, unexpected newline');
      const r = { handle: table.next++, ...parseRule(stmt) };
      const ref = at !== undefined ? chain.rules.findIndex(z => z.handle === at) : -1;
      if (at !== undefined && ref < 0) throw new NftError('Could not process rule: No such file or directory');
      if (verb === 'insert') chain.rules.splice(ref >= 0 ? ref : 0, 0, r); else chain.rules.splice(ref >= 0 ? ref + 1 : chain.rules.length, 0, r);
      return done(tables);
    }
    if (verb === 'delete' && what === 'rule') {
      const x = target(), table = tableOf(x.family, x.name), chain = table.chains.find(c => c.name === x.rest[0]);
      if (!chain) throw new NftError('No such file or directory');
      if (x.rest[1] !== 'handle' || !/^\d+$/.test(x.rest[2] ?? '')) return fail('syntax error, unexpected newline, expecting handle');
      const before = chain.rules.length;
      chain.rules = chain.rules.filter(z => z.handle !== Number(x.rest[2]));
      if (chain.rules.length === before) throw new NftError('Could not process rule: No such file or directory');
      return done(tables);
    }
    return fail(`syntax error, unexpected ${verb ?? 'end of file'}`);
  } catch (e) {
    if (e instanceof NftError) return fail(e.message);
    throw e;
  }
}
