import { parseIpv4 } from './ipv4';

/*
 * CN-4 (2026-11-22): the network-protocol capability's firewall exercises. The learner writes rules in a small, stated
 * language; they are checked by running them, first match wins, against the exercise's test packets and comparing each
 * decision with the reference rules' decision. Any rule set that decides every packet the same way passes, so different
 * correct answers (another order, a wider rule where it changes nothing) are accepted. Nothing touches a real network.
 *
 * One rule per line; blank lines and lines starting with # are ignored:
 *   default allow | default deny                      (the decision when no rule matches; deny when omitted)
 *   allow|deny <tcp|udp|icmp|any> from <addr> to <addr> [port <n>|<n>-<m>] [established]
 * <addr> is any, an IPv4 address or an IPv4 prefix (198.51.100.0/24). port applies to tcp and udp (the destination
 * port). established matches only packets of a connection already set up (stateful inspection).
 */
export const FIREWALL_PROTOCOLS = ['tcp', 'udp', 'icmp'] as const;
export type FirewallProtocol = typeof FIREWALL_PROTOCOLS[number];
export type FirewallAction = 'allow' | 'deny';
export interface FirewallRule { action: FirewallAction; protocol: FirewallProtocol | 'any'; src: string; dst: string; ports?: [number, number]; established: boolean }
export interface FirewallPacket { label: string; protocol: FirewallProtocol; src: string; dst: string; port?: number; state: 'new' | 'established' }
export interface ParsedRules { rules: FirewallRule[]; defaultAction: FirewallAction; errors: string[]; /** A `default` line was written. */ explicitDefault: boolean }

function inPrefix(address: string, spec: string): boolean {
  if (spec === 'any') return true;
  const [base, bits = '32'] = spec.split('/');
  const ip = parseIpv4(address), net = parseIpv4(base), prefix = Number(bits);
  if (ip === undefined || net === undefined) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return ((ip & mask) >>> 0) === ((net & mask) >>> 0);
}
const validAddress = (spec: string) => {
  if (spec === 'any') return true;
  const [base, bits, extra] = spec.split('/');
  if (extra !== undefined || parseIpv4(base) === undefined) return false;
  return bits === undefined || (/^\d{1,2}$/.test(bits) && Number(bits) <= 32);
};

export function parseFirewallRules(text: string): ParsedRules {
  const rules: FirewallRule[] = [], errors: string[] = [];
  let defaultAction: FirewallAction = 'deny', explicitDefault = false;
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!line || line.startsWith('#')) return;
    const at = `第 ${i + 1} 行`;
    const def = /^default (allow|deny)$/.exec(line);
    if (def) { defaultAction = def[1] as FirewallAction; explicitDefault = true; return; }
    const m = /^(allow|deny) (tcp|udp|icmp|any) from (\S+) to (\S+)(?: port (\d{1,5})(?:-(\d{1,5}))?)?( established)?$/.exec(line);
    if (!m) { errors.push(`${at}：看不懂這條規則，格式是「allow|deny 協定 from 來源 to 目的 [port 埠] [established]」。`); return; }
    const [, action, protocol, src, dst, p1, p2, established] = m;
    if (!validAddress(src) || !validAddress(dst)) { errors.push(`${at}：位址要寫 any、IPv4 位址或 IPv4 前綴（例如 198.51.100.0/24）。`); return; }
    let ports: [number, number] | undefined;
    if (p1) {
      ports = [Number(p1), Number(p2 ?? p1)];
      if (ports[0] < 1 || ports[1] > 65535 || ports[0] > ports[1]) { errors.push(`${at}：連接埠要在 1–65535 之間，範圍由小到大。`); return; }
      if (protocol === 'icmp') { errors.push(`${at}：ICMP 沒有連接埠。`); return; }
    }
    rules.push({ action: action as FirewallAction, protocol: protocol as FirewallRule['protocol'], src, dst, ...(ports ? { ports } : {}), established: !!established });
  });
  return { rules, defaultAction, errors, explicitDefault };
}

const matches = (r: FirewallRule, p: FirewallPacket) =>
  (r.protocol === 'any' || r.protocol === p.protocol) && inPrefix(p.src, r.src) && inPrefix(p.dst, r.dst)
  && (!r.ports || (p.port !== undefined && p.port >= r.ports[0] && p.port <= r.ports[1]))
  && (!r.established || p.state === 'established');

/** The decision for a packet: the first matching rule's action, otherwise the default (rule -1). */
export function decidePacket(parsed: ParsedRules, packet: FirewallPacket): { action: FirewallAction; rule: number } {
  const rule = parsed.rules.findIndex(r => matches(r, packet));
  return { action: rule < 0 ? parsed.defaultAction : parsed.rules[rule].action, rule };
}

/** Problems of an exercise's own data: packets well formed, the reference rules parse. */
export function firewallTaskProblems(reference: string, packets: readonly FirewallPacket[]): string[] {
  const problems = parseFirewallRules(reference).errors.map(e => `reference rules: ${e}`);
  if (packets.length < 2) problems.push('needs at least two test packets');
  for (const p of packets) {
    if (parseIpv4(p.src) === undefined || parseIpv4(p.dst) === undefined) problems.push(`packet ${p.label}: addresses must be IPv4`);
    if ((p.protocol === 'icmp') !== (p.port === undefined)) problems.push(`packet ${p.label}: tcp and udp packets have a port, icmp packets do not`);
  }
  const decided = new Set(packets.map(p => decidePacket(parseFirewallRules(reference), p).action));
  if (decided.size < 2) problems.push('the test packets must include both allowed and denied ones');
  return problems;
}

/** Compare the learner's rules with the reference, packet by packet. */
export function checkFirewallRules(answer: string, reference: string, packets: readonly FirewallPacket[]): { ok: boolean; messages: string[] } {
  const mine = parseFirewallRules(answer ?? '');
  if (mine.errors.length) return { ok: false, messages: mine.errors };
  if (!mine.rules.length && !mine.explicitDefault) return { ok: false, messages: ['還沒有寫任何規則。'] };
  const ref = parseFirewallRules(reference), messages: string[] = [];
  const word = { allow: '放行', deny: '擋下' } as const;
  for (const p of packets) {
    const want = decidePacket(ref, p).action, got = decidePacket(mine, p);
    if (want !== got.action) messages.push(`封包「${p.label}」應該${word[want]}，你的規則${got.rule < 0 ? '沒有一條符合，依預設' : `由第 ${got.rule + 1} 條決定`}${word[got.action]}。`);
  }
  return { ok: !messages.length, messages };
}
