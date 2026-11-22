import { type FsState } from './fs';
import { DEFAULT_UFW, loadRuleset, NFTABLES_CONF, parseUfwRule, UFW_APPS, type NftTable, type Policy, type UfwRule } from './firewall';
import { basicResolver, indexByName, isIPv4, listenersOf, reach, viewFrom, type Proto } from './sockets';
import type { TerminalFile, TerminalMachine } from './lesson';

/*
 * Engine stages E15–E17 as lesson data (docs/curriculum/SRV0_SERVER_CAPABILITY.md §19). proxy: the active connections nginx
 * counts per upstream server (least_conn reads them), and responders that echo the request, accept WebSocket upgrades or
 * answer slowly. firewall: ufw (enabled, default policies, rules written as ufw's own commands) and an nftables ruleset
 * loaded at boot, plus the files ufw and nftables bring (/etc/ufw/applications.d, /etc/nftables.conf). tunnels: machines
 * reachable only from some hosts (a private network behind a bastion) and the learner's ~/.ssh/config. Each field only
 * from its own profile up; the checks reach, firewall and tunnel read the machines after the commands.
 */

/** E16: a machine's firewall at the start: ufw's state and rules (as after `ufw RULE`, e.g. 'allow 22/tcp', "limit OpenSSH") and an nft ruleset. */
export interface TerminalFirewall { enabled?: boolean; incoming?: Policy; outgoing?: Policy; rules?: string[]; nftables?: string }
/** E15: active connections nginx keeps to an upstream server (least_conn compares connections per weight). */
export interface TerminalUpstreamConnections { upstream: string; server: string; connections: number }
export interface NetLevels { proxy: boolean; firewall: boolean; tunnels: boolean }

export type NetCheck =
  /** E16: from a machine (default the exercise's) a TCP connection to host:port succeeds, is refused or times out. */
  | { kind: 'reach'; from?: string; to: string; port: number; proto?: Proto; result: 'succeeded' | 'refused' | 'timeout' }
  /** E16: ufw is (not) enabled, its default policies, a rule (as ufw's command words: 'allow 22/tcp') is there (absent: not); an nft input chain's policy and rule text. */
  | { kind: 'firewall'; host?: string; enabled?: boolean; incoming?: Policy; outgoing?: Policy; rule?: string; absent?: true; nftPolicy?: 'accept' | 'drop'; nftRule?: string }
  /** E17: a tunnel listens on port (on host; default the exercise's machine) and forwards to target host:port (works: a connection gets through). */
  | { kind: 'tunnel'; port: number; host?: string; target: string; address?: string; works?: boolean };

/** Splits a ufw rule written in lesson data into words (single or double quotes group, as the shell would). */
export function ruleWords(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/'([^']*)'|"([^"]*)"|(\S+)/g)) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

/** E16: the files ufw and nftables bring, unless the lesson lists them. */
export function expandNet(m: TerminalMachine, lv: NetLevels, add: { file(f: TerminalFile): void; dir(path: string, mode?: number): void }): void {
  if (!lv.firewall) return;
  add.dir('/etc'); add.dir('/etc/ufw'); add.dir('/etc/ufw/applications.d');
  add.file({ path: '/etc/ufw/applications.d/openssh-server', kind: 'file', mode: 0o644, owner: 'root', content: UFW_APPS['openssh-server'] });
  if (m.nginx !== undefined) add.file({ path: '/etc/ufw/applications.d/nginx', kind: 'file', mode: 0o644, owner: 'root', content: UFW_APPS.nginx });
  add.file({ path: '/etc/nftables.conf', kind: 'file', mode: 0o755, owner: 'root', content: NFTABLES_CONF });
}

/** E15–E17: the machine's firewall, nginx's declared upstream connections and who may reach it. */
export function netState(m: TerminalMachine, state: FsState, lv: NetLevels): FsState {
  let next = state;
  if (lv.proxy && m.upstreamConnections?.length && next.nginx) next = { ...next, nginx: { ...next.nginx, conns: Object.fromEntries(m.upstreamConnections.map(c => [`${c.upstream}/${c.server}`, c.connections])) } };
  if (lv.firewall) {
    const f = m.firewall ?? {};
    const rules: UfwRule[] = [];
    for (const text of f.rules ?? []) {
      const [action, ...words] = ruleWords(text);
      const p = parseUfwRule(next, action as UfwRule['action'], words);
      if ('rules' in p) rules.push(...p.rules);
    }
    const v4 = rules.filter(r => !r.v6), v6 = rules.filter(r => r.v6);
    const nft = f.nftables !== undefined ? loadRuleset(f.nftables) : [];
    next = { ...next, firewall: { ufw: { ...DEFAULT_UFW, enabled: !!f.enabled, incoming: f.incoming ?? 'deny', outgoing: f.outgoing ?? 'allow', rules: [...v4, ...v6] }, nft: Array.isArray(nft) ? nft : [] } };
  }
  if (lv.tunnels && m.reachableFrom && next.sockets) next = { ...next, sockets: { ...next.sockets, onlyFrom: [...m.reachableFrom] } };
  return next;
}

const whole = (x: unknown, min: number, max: number) => Number.isInteger(x) && (x as number) >= min && (x as number) <= max;
const POLICIES = ['allow', 'deny', 'reject'];

/** E15–E17: the problems of a machine's proxy, firewall and tunnel data (names: the lesson's machine names, for reachableFrom). */
export function netProblems(m: TerminalMachine, lv: NetLevels, built: () => FsState, names?: readonly string[]): string[] {
  const problems: string[] = [], fail = (what: string) => problems.push(what);
  const routes = (m.responders ?? []).flatMap(r => r.routes);
  if (!lv.proxy && (m.upstreamConnections !== undefined || (m.responders ?? []).some(r => r.delay !== undefined) || routes.some(r => r.echo !== undefined || r.websocket !== undefined || r.delay !== undefined)))
    fail('upstreamConnections and a responder\'s echo, websocket and delay need the proxy profile (engine stage E15)');
  if (!lv.firewall && m.firewall !== undefined) fail('firewall needs the firewall profile (engine stage E16)');
  if (!lv.tunnels && (m.reachableFrom !== undefined || m.sshConfig !== undefined)) fail('reachableFrom and sshConfig need the tunnels profile (engine stage E17)');
  if (problems.length) return problems;
  if ((m.upstreamConnections ?? []).length > 24) fail('at most 24 upstream connection counts');
  for (const c of m.upstreamConnections ?? []) {
    if (!/^[A-Za-z0-9_.:-]{1,64}$/.test(c.upstream) || !/^\d+\.\d+\.\d+\.\d+:\d+$/.test(c.server) || !isIPv4(c.server.split(':')[0]) || !whole(c.connections, 0, 100000))
      fail(`upstreamConnections ${c.upstream} ${c.server}: needs an upstream name, a server a.b.c.d:port and 0..100000 connections`);
  }
  for (const r of m.responders ?? []) {
    if (r.delay !== undefined && !(typeof r.delay === 'number' && r.delay >= 0 && r.delay <= 3600)) fail(`responder ${r.id}: delay must be 0..3600 seconds`);
    for (const x of r.routes) {
      if (x.delay !== undefined && !(typeof x.delay === 'number' && x.delay >= 0 && x.delay <= 3600)) fail(`responder ${r.id} route ${x.path}: delay must be 0..3600 seconds`);
      if ((x.echo !== undefined && x.echo !== true) || (x.websocket !== undefined && x.websocket !== true) || (x.echo && x.websocket)) fail(`responder ${r.id} route ${x.path}: echo and websocket are true (one of them)`);
    }
  }
  if (m.firewall) {
    const f = m.firewall;
    if (f.enabled !== undefined && typeof f.enabled !== 'boolean') fail('firewall enabled must be true or false');
    for (const p of [f.incoming, f.outgoing]) if (p !== undefined && !POLICIES.includes(p)) fail('firewall incoming and outgoing must be allow, deny or reject');
    if ((f.rules ?? []).length > 30) fail('at most 30 ufw rules');
    const state = built();
    for (const text of f.rules ?? []) {
      const [action, ...words] = ruleWords(text);
      if (!['allow', 'deny', 'reject', 'limit'].includes(action ?? '')) { fail(`firewall rule "${text}": starts with allow, deny, reject or limit`); continue; }
      const p = parseUfwRule(state, action as UfwRule['action'], words);
      if ('error' in p) fail(`firewall rule "${text}": ${p.error}`);
    }
    if (f.nftables !== undefined) {
      const r = loadRuleset(f.nftables);
      if (!Array.isArray(r)) fail(`firewall nftables: ${r.error}`);
    }
  }
  if (names) for (const n of m.reachableFrom ?? []) if (!names.includes(n)) fail(`reachableFrom ${n}: not a machine of the lesson`);
  if (m.sshConfig !== undefined && (typeof m.sshConfig !== 'string' || m.sshConfig.length > 4000)) fail('sshConfig must be the text of ~/.ssh/config (at most 4000 characters)');
  return problems;
}

/** E17: the learner's ~/.ssh/config from sshConfig (0600 in a 0700 ~/.ssh), unless the lesson lists the file. */
export function sshConfigFiles(m: TerminalMachine, home: string): TerminalFile[] {
  if (m.sshConfig === undefined || m.files.some(f => f.path === `${home}/.ssh/config`)) return [];
  return [...m.files.some(f => f.path === `${home}/.ssh`) ? [] : [{ path: `${home}/.ssh`, kind: 'dir' as const, mode: 0o700, owner: m.user }],
    { path: `${home}/.ssh/config`, kind: 'file' as const, mode: 0o600, owner: m.user, content: m.sshConfig }];
}

export function netCheckProblems(c: NetCheck, lv: NetLevels, known: (host: string) => boolean): string | null {
  switch (c.kind) {
    case 'reach':
      if (!lv.firewall || !whole(c.port, 1, 65535) || (c.proto !== undefined && c.proto !== 'tcp') || !['succeeded', 'refused', 'timeout'].includes(c.result) || (c.from !== undefined && !known(c.from)) || !(isIPv4(c.to) || known(c.to)))
        return 'a reach check needs a firewall machine (engine stage E16), a known from and to (or an IPv4 address), a port 1..65535 and a result succeeded, refused or timeout';
      return null;
    case 'firewall':
      if (!lv.firewall || (c.host !== undefined && !known(c.host)) || (c.incoming !== undefined && !POLICIES.includes(c.incoming)) || (c.outgoing !== undefined && !POLICIES.includes(c.outgoing))
        || (c.nftPolicy !== undefined && !['accept', 'drop'].includes(c.nftPolicy)) || (c.absent && c.rule === undefined && c.nftRule === undefined)
        || [c.enabled, c.incoming, c.outgoing, c.rule, c.nftPolicy, c.nftRule].every(v => v === undefined))
        return 'a firewall check needs a firewall machine (engine stage E16), a known host and something to check (enabled, incoming, outgoing, rule, nftPolicy, nftRule)';
      return null;
    case 'tunnel':
      if (!lv.tunnels || !whole(c.port, 1, 65535) || (c.host !== undefined && !known(c.host)) || !/^[A-Za-z0-9.-]+:\d+$/.test(c.target) || (c.address !== undefined && !isIPv4(c.address)))
        return 'a tunnel check needs a tunnels machine (engine stage E17), a port, a target host:port and a known host';
      return null;
  }
}

export function describeNetCheck(c: NetCheck): string {
  switch (c.kind) {
    case 'reach': return `從 ${c.from ?? '這台機器'} 連到 ${c.to} 的 ${c.port} 埠應該${c.result === 'succeeded' ? '成功' : c.result === 'refused' ? '被拒絕（Connection refused）' : '逾時（封包被丟棄）'}`;
    case 'firewall': {
      const parts = [c.enabled === true ? 'ufw 應該啟用' : c.enabled === false ? 'ufw 應該停用' : '', c.incoming ? `預設的連入原則應該是 ${c.incoming}` : '', c.outgoing ? `預設的連出原則應該是 ${c.outgoing}` : '',
        c.rule ? `${c.absent ? '不應該' : '應該'}有規則 ufw ${c.rule}` : '', c.nftPolicy ? `nft 的 input 鏈原則應該是 ${c.nftPolicy}` : '', c.nftRule ? `nft 的 input 鏈${c.absent ? '不應該' : '應該'}有「${c.nftRule}」` : ''].filter(Boolean);
      return `${c.host ? `${c.host} 上` : ''}${parts.join('，')}`;
    }
    case 'tunnel': return `${c.host ? `${c.host} 上` : ''}${c.address ?? ''}${c.address ? ':' : ''}${c.port} 埠應該是轉送到 ${c.target} 的 SSH 通道${c.works ? '，而且連得過去' : ''}`;
  }
}

/** The state from which a machine of the lesson acts (the exercise's machine itself, or a view of the network from a remote). */
export function viewOfHost(end: FsState, host?: string): FsState | undefined {
  if (host === undefined) return end;
  const at = indexByName(end, host) ?? (end.net ? (() => { const i = end.net!.hosts.findIndex(h => h.address === host || h.aliases.includes(host)); return i < 0 ? undefined : i; })() : undefined);
  if (at === undefined) return undefined;
  return at === 'self' ? end : viewFrom(end, at);
}
const sameUfw = (a: UfwRule, b: UfwRule) => a.action === b.action && a.direction === b.direction && (a.iface ?? '') === (b.iface ?? '') && (a.proto ?? '') === (b.proto ?? '') && (a.ports ?? '') === (b.ports ?? '')
  && (a.app ?? '') === (b.app ?? '') && a.from === b.from && a.to === b.to && a.v6 === b.v6;
const inputChains = (tables: readonly NftTable[]) => tables.filter(t => t.family === 'inet' || t.family === 'ip').flatMap(t => t.chains.filter(c => c.base?.hook === 'input'));

/** E15–E17 (lesson checks): why the check fails on the state after the commands (null: it holds). */
export function netFailure(c: NetCheck, end: FsState): string | null {
  switch (c.kind) {
    case 'reach': {
      const from = viewOfHost(end, c.from);
      if (!from) return `沒有 ${c.from} 這台主機`;
      const r0 = basicResolver(from, c.to, 4);
      if ('error' in r0) return `${c.from ?? '這台機器'} 查不到 ${c.to}`;
      const r = reach(from, r0.found.address, c.port);
      const got = r.result === 'ok' ? 'succeeded' : r.result === 'refused' ? 'refused' : 'timeout';
      const word = { succeeded: '成功', refused: '被拒絕', timeout: '逾時' } as const;
      return got === c.result ? null : `結果是${word[got]}`;
    }
    case 'firewall': {
      const s = viewOfHost(end, c.host);
      if (!s) return `沒有 ${c.host} 這台主機`;
      const fw = s.firewall;
      if (!fw) return '這台機器沒有防火牆的資料';
      const u = fw.ufw;
      if (c.enabled !== undefined && u.enabled !== c.enabled) return u.enabled ? 'ufw 是啟用的' : 'ufw 沒有啟用（sudo ufw enable）';
      if (c.incoming && u.incoming !== c.incoming) return `預設的連入原則是 ${u.incoming}`;
      if (c.outgoing && u.outgoing !== c.outgoing) return `預設的連出原則是 ${u.outgoing}`;
      if (c.rule !== undefined) {
        const [action, ...words] = ruleWords(c.rule), p = parseUfwRule(s, action as UfwRule['action'], words);
        const want = 'rules' in p ? p.rules.filter(r => !r.v6)[0] : undefined;
        const has = !!want && u.rules.some(r => sameUfw(r, want));
        if (c.absent && has) return '這條規則還在';
        if (!c.absent && !has) return '找不到這條規則（sudo ufw status numbered）';
      }
      if (c.nftPolicy !== undefined) {
        const chains = inputChains(fw.nft);
        if (!chains.length) return 'nft 沒有 input 鏈';
        if (!chains.some(ch => ch.base!.policy === c.nftPolicy)) return `input 鏈的原則是 ${chains[0].base!.policy}`;
      }
      if (c.nftRule !== undefined) {
        const has = inputChains(fw.nft).some(ch => ch.rules.some(r => r.text === c.nftRule));
        if (c.absent && has) return '這條 nft 規則還在';
        if (!c.absent && !has) return 'input 鏈沒有這條規則（sudo nft list ruleset）';
      }
      return null;
    }
    case 'tunnel': {
      const s = viewOfHost(end, c.host);
      if (!s) return `沒有 ${c.host} 這台主機`;
      const l = listenersOf(s).find(x => x.local.port === c.port && x.proto === 'tcp');
      if (!l) return `${c.port} 埠沒有程式在監聽`;
      if (!l.forward) return `${c.port} 埠不是 SSH 通道`;
      if (c.address && l.local.address !== c.address) return `通道綁定的是 ${l.local.address}`;
      const [th, tp] = [c.target.slice(0, c.target.lastIndexOf(':')), Number(c.target.slice(c.target.lastIndexOf(':') + 1))];
      const vi = indexByName(s, l.forward.via);
      const from = vi === undefined ? undefined : vi === 'self' ? s : viewFrom(s, vi);
      const a = from ? basicResolver(from, l.forward.host, 4) : undefined, b = from ? basicResolver(from, th, 4) : undefined;
      const sameEnd = !!a && !!b && 'found' in a && 'found' in b && (a.found.address === b.found.address || (a.found.address.startsWith('127.') && b.found.address.startsWith('127.')));
      if (!sameEnd || l.forward.port !== tp) return `通道轉送到 ${l.forward.host}:${l.forward.port}`;
      if (c.works) {
        const r = reach(s, l.local.address === '0.0.0.0' ? '127.0.0.1' : l.local.address, c.port);
        if (r.result !== 'ok' || r.channel) return `連不過去（${r.result === 'ok' ? r.channel : r.result}）`;
      }
      return null;
    }
  }
}
