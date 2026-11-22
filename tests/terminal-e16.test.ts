import { describe, expect, it } from 'vitest';
import { type FsState } from '@/lib/terminal/fs';
import { SERVER_MANUAL } from '@/lib/terminal/manual';
import { E16_COMMANDS, FIREWALL_PROFILE, PROXY_PROFILE, run } from '@/lib/terminal/shell';
import { checkTerminalExercise, machineProblems, machineState, profileOf, terminalContentProblems, type TerminalExercise, type TerminalMachine } from '@/lib/terminal/lesson';
import { decideIn, loadRuleset, nftText } from '@/lib/terminal/firewall';
import { fwLaptop, fwLocal, fwServer } from './support/edge-fixture';

/*
 * Engine stage E16 (docs/curriculum/SRV0_SERVER_CAPABILITY.md §17): the firewall profile — ufw 0.36.2 (its rules, status
 * layouts, application profiles, the prompt in an ssh session, deleting by number), an nftables subset (tables, base
 * chains, ct state, iif, ip saddr, tcp dport, accept/drop/reject, handles, nft -f), the decisions they make for connections
 * from other hosts (drop: timed out, reject: refused, loopback allowed), connection tracking that keeps an open session
 * alive (and nft without it, which freezes the session), the lesson data and the reach and firewall checks.
 */
function session(from: FsState | TerminalMachine, ...commands: string[]) {
  let state = 'files' in from ? machineState(from) : from;
  const log: { out: string[]; err: string[] }[] = [];
  for (const cmd of commands) {
    const r = run(state, cmd, FIREWALL_PROFILE);
    state = r.state;
    log.push({ out: r.lines.filter(l => l.kind === 'out').map(l => l.text), err: r.lines.filter(l => l.kind === 'err').map(l => l.text) });
  }
  return { state, log, last: log.at(-1)! };
}
const srv = (...commands: string[]) => session(fwLocal, ...commands);
const ACCEPT = 'ssh -o StrictHostKeyChecking=accept-new';
/** The laptop logged in to srv-01 (an interactive session as admin). */
const onServer = (...commands: string[]) => session(fwLaptop, `${ACCEPT} admin@srv-01`, ...commands);

describe('the firewall profile', () => {
  it('is the proxy profile plus ufw and nft; below it they are not commands and machines have no firewall', () => {
    expect([...FIREWALL_PROFILE.commands].sort()).toEqual([...PROXY_PROFILE.commands, ...E16_COMMANDS].sort());
    expect(FIREWALL_PROFILE.features).toEqual([...PROXY_PROFILE.features!, 'firewall']);
    expect(profileOf(fwLaptop)).toBe(FIREWALL_PROFILE);
    expect(machineProblems(fwLaptop)).toEqual([]);
    expect(machineProblems(fwLocal)).toEqual([]);
    const below: TerminalMachine = { ...fwLocal, profile: 'proxy' };
    expect(run(machineState(below), 'sudo ufw status', PROXY_PROFILE).lines[0].text).toBe('sudo: ufw: command not found');
    expect(machineState(below).firewall).toBeUndefined();
    expect(machineState(below).nodes.has('/etc/nftables.conf')).toBe(false);
    expect(machineProblems({ ...below, firewall: { enabled: true } })).toEqual(['machine srv-local: firewall needs the firewall profile (engine stage E16)']);
    expect(srv('ufw --help').last.out[0]).toBe(`用法：${SERVER_MANUAL.ufw.usage}`);
    expect(srv('nft --help').last.out[0]).toBe(`用法：${SERVER_MANUAL.nft.usage}`);
  });
  it('installs what Ubuntu has: /etc/nftables.conf and ufw\'s application profiles', () => {
    const r = srv('cat /etc/nftables.conf', 'ls /etc/ufw/applications.d', 'sudo ufw app list', "sudo ufw app info 'Nginx Full'").log;
    expect(r[0].out.slice(0, 3)).toEqual(['#!/usr/sbin/nft -f', '', 'flush ruleset']);
    expect(r[1].out).toEqual(['nginx  openssh-server']);
    expect(r[2].out).toEqual(['Available applications:', '  Nginx Full', '  Nginx HTTP', '  Nginx HTTPS', '  OpenSSH']);
    expect(r[3].out).toEqual(['Profile: Nginx Full', 'Title: Web Server (Nginx, HTTP + HTTPS)', '', 'Description: Small, but very powerful and efficient web server', '', 'Ports:', '  80,443/tcp']);
  });
});

describe('ufw', () => {
  it('needs root, and starts inactive with deny incoming / allow outgoing', () => {
    expect(srv('ufw status').last.err).toEqual(['ERROR: You need to be root to run this script']);
    expect(srv('sudo ufw status').last.out).toEqual(['Status: inactive']);
    expect(srv('ufw version').last.out).toEqual(['ufw 0.36.2', 'Copyright 2008-2023 Canonical Ltd.']);
  });
  it('adds rules in its own words and prints status, status verbose and status numbered like ufw', () => {
    const r = srv('sudo ufw allow OpenSSH', "sudo ufw allow 'Nginx Full'", 'sudo ufw allow from 10.0.0.50 to any port 5432 proto tcp', 'sudo ufw limit ssh', 'sudo ufw deny 23', 'sudo ufw allow OpenSSH',
      'sudo ufw enable', 'sudo ufw status', 'sudo ufw status verbose', 'sudo ufw status numbered').log;
    expect(r[0].out).toEqual(['Rules updated', 'Rules updated (v6)']);
    expect(r[2].out).toEqual(['Rules updated']);
    expect(r[5].out).toEqual(['Skipping adding existing rule', 'Skipping adding existing rule (v6)']);
    expect(r[6].out).toEqual(['Firewall is active and enabled on system startup']);
    expect(r[7].out).toEqual(['Status: active', '', 'To                         Action      From', '--                         ------      ----',
      'OpenSSH                    ALLOW       Anywhere', 'Nginx Full                 ALLOW       Anywhere', '5432/tcp                   ALLOW       10.0.0.50', '22/tcp                     LIMIT       Anywhere',
      '23                         DENY        Anywhere', 'OpenSSH (v6)               ALLOW       Anywhere (v6)', 'Nginx Full (v6)            ALLOW       Anywhere (v6)', '22/tcp (v6)                LIMIT       Anywhere (v6)',
      '23 (v6)                    DENY        Anywhere (v6)', '']);
    expect(r[8].out.slice(0, 7)).toEqual(['Status: active', 'Logging: on (low)', 'Default: deny (incoming), allow (outgoing), disabled (routed)', 'New profiles: skip', '',
      'To                         Action      From', '--                         ------      ----']);
    expect(r[8].out[7]).toBe('OpenSSH                    ALLOW IN    Anywhere');
    expect(r[9].out.slice(2, 5)).toEqual(['     To                         Action      From', '     --                         ------      ----', '[ 1] OpenSSH                    ALLOW IN    Anywhere']);
    expect(r[9].out[11]).toBe('[ 8] 22/tcp (v6)                LIMIT IN    Anywhere (v6)');
  });
  it('reports ufw\'s errors', () => {
    const e = (cmd: string) => srv(`sudo ufw ${cmd}`).last.err;
    expect(e('allow 70000')).toEqual(['ERROR: Bad port']);
    expect(e('allow 80,443')).toEqual(["ERROR: Must specify 'tcp' or 'udp' with multiple ports"]);
    expect(e('allow from 10.0.0.999')).toEqual(['ERROR: Bad source address']);
    expect(e('allow Nope')).toEqual(["ERROR: Could not find a profile matching 'Nope'"]);
    expect(e('default maybe incoming')).toEqual(['ERROR: Unsupported policy']);
    expect(e('frobnicate')).toEqual(['ERROR: Invalid syntax']);
    expect(e('delete 9')).toEqual(["ERROR: Could not find rule '9'"]);
  });
  it('deletes by number (asking first, or --force) and by rule; inserts at a position; shows the added rules while inactive', () => {
    const r = srv('sudo ufw allow 80/tcp', 'sudo ufw allow 443/tcp', 'sudo ufw delete 1', 'sudo ufw --force delete 1', 'sudo ufw delete allow 443/tcp', 'sudo ufw insert 1 deny from 10.0.0.77', 'sudo ufw show added', 'sudo ufw delete allow 8080/tcp').log;
    expect(r[2].out).toEqual(['Deleting:', ' allow 80/tcp', 'Proceed with operation (y|n)? ', 'Aborted']);
    expect(r[2].err[0]).toMatch(/^（模擬環境沒有鍵盤輸入/);
    expect(r[3].out).toEqual(['Rule deleted']);
    expect(r[4].out).toEqual(['Rule deleted', 'Rule deleted (v6)']);
    expect(r[5].out).toEqual(['Rule inserted']);
    expect(r[6].out).toEqual(["Added user rules (see 'ufw status' for running firewall):", 'ufw deny from 10.0.0.77 to any', 'ufw allow 80/tcp']);
    expect(r[7].out).toEqual(['Could not delete non-existent rule', 'Could not delete non-existent rule (v6)']);
  });
});

describe('what the firewall decides for connections from other hosts', () => {
  it('drops (timed out) by default, refuses with reject, lets allowed ports and sources through, and never blocks loopback', () => {
    const fw = (...rules: string[]): TerminalMachine => ({ ...fwLaptop, remotes: [{ ...fwServer, firewall: { enabled: true, rules } }, fwLaptop.remotes![1]] });
    const m = fw('allow 80/tcp', 'reject 23', 'allow from 10.0.0.50 to any port 5432 proto tcp');
    expect(machineProblems(m)).toEqual([]);
    const r = session(m, 'nc -zv srv-01 80', 'nc -zv srv-01 22', 'nc -zv srv-01 23', 'nc -zv srv-01 5432', `${ACCEPT} office nc -zv srv-01 5432`, 'curl -sS --connect-timeout 5 http://srv-01:5432/').log;
    expect(r[0].err).toEqual(['Connection to srv-01 (10.0.0.30) 80 port [tcp/http] succeeded!']);
    expect(r[1].err).toEqual(['nc: connect to srv-01 (10.0.0.30) port 22 (tcp) failed: Connection timed out']);
    expect(r[2].err).toEqual(['nc: connect to srv-01 (10.0.0.30) port 23 (tcp) failed: Connection refused']);
    expect(r[3].err).toEqual(['nc: connect to srv-01 (10.0.0.30) port 5432 (tcp) failed: Connection timed out']);
    expect(r[4].err.at(-1)).toBe('Connection to srv-01 (10.0.0.30) 5432 port [tcp/postgresql] succeeded!');
    expect(r[5].err).toEqual(['curl: (28) Failed to connect to srv-01 port 5432 after 5000 ms: Timeout was reached']);
    // On the server itself loopback is always allowed (ufw's before rules).
    expect(srv('sudo ufw enable', 'nc -zv 127.0.0.1 5432', 'nc -zv 10.0.0.30 5432').log.slice(1).map(l => l.err[0])).toEqual([
      'Connection to 127.0.0.1 5432 port [tcp/postgresql] succeeded!', 'Connection to 10.0.0.30 5432 port [tcp/postgresql] succeeded!']);
  });
  it('compiles ufw\'s rules to the CN model (first match, then the default) and decides with it', () => {
    const s = srv('sudo ufw allow from 10.0.0.0/24 to any port 22 proto tcp', 'sudo ufw deny from 10.0.0.66', 'sudo ufw default reject incoming', 'sudo ufw enable').state;
    const p = (src: string, port: number) => decideIn(s, { proto: 'tcp', src, dst: '10.0.0.30', port, iface: 'eth0', state: 'new' });
    expect([p('10.0.0.66', 22), p('10.0.0.66', 80), p('203.0.113.9', 22), p('203.0.113.9', 80)]).toEqual(['accept', 'drop', 'reject', 'reject']);
    expect(decideIn(s, { proto: 'tcp', src: '203.0.113.9', dst: '10.0.0.30', port: 80, iface: 'eth0', state: 'established' })).toBe('accept');
  });
  it('outgoing: deny outgoing stops the machine\'s own new connections', () => {
    const r = srv('sudo ufw default deny outgoing', 'sudo ufw enable', 'nc -zv office 22', 'sudo ufw allow out 22/tcp', 'nc -zv office 22').log;
    expect(r[2].err).toEqual(['nc: connect to office (10.0.0.50) port 22 (tcp) failed: Connection timed out']);
    expect(r[4].err).toEqual(['Connection to office (10.0.0.50) 22 port [tcp/ssh] succeeded!']);
  });
  it('remote sessions see the lesson\'s network: a request from office reaches srv-01\'s nginx, which logs office\'s address', () => {
    const r = session(fwLaptop, `${ACCEPT} office`, 'curl -s -o /dev/null -w "%{http_code}\\n" http://srv-01/', 'exit', `${ACCEPT} admin@srv-01 sudo tail -1 /var/log/nginx/access.log`).log;
    expect(r[1].out).toEqual(['200']);
    expect(r[3].out[0]).toMatch(/^10\.0\.0\.50 - - \[22\/Nov\/2026:10:00:00 \+0000\] "GET \/ HTTP\/1\.1" 200 615/);
  });
});

describe('not locking yourself out', () => {
  it('asks in an ssh session; an open session survives (connection tracking), a new one is not let in without an ssh rule', () => {
    const r = onServer('sudo ufw default deny incoming', 'sudo ufw allow 80/tcp', 'sudo ufw enable', 'echo y | sudo ufw enable', 'hostname', 'exit', 'ssh admin@srv-01 hostname', 'nc -zv srv-01 80').log;
    expect(r[3].out).toEqual(['Command may disrupt existing ssh connections. Proceed with operation (y|n)? ', 'Aborted']);
    expect(r[4].out).toEqual(['Command may disrupt existing ssh connections. Proceed with operation (y|n)? Firewall is active and enabled on system startup']);
    expect(r[5].out).toEqual(['srv-01']);
    expect(r[7].err).toEqual(['ssh: connect to host srv-01 port 22: Connection timed out']);
    expect(r[8].err).toEqual(['Connection to srv-01 (10.0.0.30) 80 port [tcp/http] succeeded!']);
  });
  it('allowing OpenSSH first keeps the way in', () => {
    const r = onServer('sudo ufw allow OpenSSH', 'sudo ufw --force enable', 'exit', 'ssh admin@srv-01 hostname').log;
    expect(r[4].out).toEqual(['srv-01']);
  });
});

describe('nft', () => {
  it('builds a ruleset and lists it as nft does (priority names, handles)', () => {
    const r = srv('sudo nft list ruleset', 'sudo nft add table inet filter', "sudo nft add chain inet filter input '{ type filter hook input priority 0; policy drop; }'",
      'sudo nft add rule inet filter input ct state established,related accept', 'sudo nft add rule inet filter input iif lo accept', 'sudo nft add rule inet filter input ip saddr 10.0.0.0/24 tcp dport { 22, 80 } accept',
      'sudo nft add rule inet filter input tcp dport 5432 reject', 'sudo nft -a list ruleset', 'sudo nft delete rule inet filter input handle 5', 'sudo nft list ruleset').log;
    expect(r[0].out).toEqual([]);
    expect(r[7].out).toEqual(['table inet filter { # handle 1', '\tchain input { # handle 1', '\t\ttype filter hook input priority filter; policy drop;', '\t\tct state established,related accept # handle 2',
      '\t\tiif "lo" accept # handle 3', '\t\tip saddr 10.0.0.0/24 tcp dport { 22, 80 } accept # handle 4', '\t\ttcp dport 5432 reject # handle 5', '\t}', '}']);
    expect(r[9].out).not.toContain('\t\ttcp dport 5432 reject');
  });
  it('decides with its input chain: policy drop times out, reject refuses, loopback needs iif lo', () => {
    const base = ['sudo nft add table inet filter', "sudo nft add chain inet filter input '{ type filter hook input priority 0; policy drop; }'", 'sudo nft add rule inet filter input tcp dport 23 reject'];
    const r = srv(...base, 'nc -zv 127.0.0.1 5432', 'sudo nft add rule inet filter input iif lo accept', 'nc -zv 127.0.0.1 5432').log;
    expect(r[3].err).toEqual(['nc: connect to 127.0.0.1 port 5432 (tcp) failed: Connection timed out']);
    expect(r[5].err).toEqual(['Connection to 127.0.0.1 5432 port [tcp/postgresql] succeeded!']);
    // From another host (a firewall-profile machine sees the network from its sessions): reject refuses, the policy drops.
    const fw: TerminalMachine = { ...fwLaptop, remotes: [{ ...fwServer, firewall: { nftables: 'table inet filter {\n chain input {\n  type filter hook input priority 0; policy drop;\n  tcp dport 23 reject\n  tcp dport 80 accept\n }\n}\n' } }, fwLaptop.remotes![1]] };
    expect(session(fw, 'nc -zv srv-01 23', 'nc -zv srv-01 22', 'nc -zv srv-01 80').log.map(l => l.err[0])).toEqual(['nc: connect to srv-01 (10.0.0.30) port 23 (tcp) failed: Connection refused',
      'nc: connect to srv-01 (10.0.0.30) port 22 (tcp) failed: Connection timed out', 'Connection to srv-01 (10.0.0.30) 80 port [tcp/http] succeeded!']);
  });
  it('without ct state established a policy drop freezes the open session; with it the session lives', () => {
    const chain = "sudo nft add chain inet filter input '{ type filter hook input priority 0; policy drop; }'";
    const cut = onServer('sudo nft add table inet filter', chain, 'hostname', 'hostname', 'ssh admin@srv-01 hostname').log;
    expect(cut[3].err).toEqual(['（模擬環境：這個工作階段的封包被防火牆丟棄，終端機沒有回應；等 TCP 重送逾時之後）', 'client_loop: send disconnect: Broken pipe']);
    expect(cut[4].out).toEqual(['laptop']);
    expect(cut[5].err).toEqual(['ssh: connect to host srv-01 port 22: Connection timed out']);
    const kept = onServer('sudo nft add table inet filter', "sudo nft add chain inet filter input '{ type filter hook input priority 0; policy accept; }'", 'sudo nft add rule inet filter input ct state established,related accept',
      'sudo nft add rule inet filter input tcp dport 22 accept', chain, 'hostname', 'exit', 'ssh admin@srv-01 hostname').log;
    expect(kept[6].out).toEqual(['srv-01']);
    expect(kept[8].out).toEqual(['srv-01']);
  });
  it('loads a file with nft -f (and /etc/nftables.conf), checks it with -c, and reports errors', () => {
    const conf = 'flush ruleset\ntable inet filter {\n  chain input {\n    type filter hook input priority filter; policy drop;\n    ct state established,related accept\n    iif lo accept\n    tcp dport { 22, 443 } accept\n  }\n}\n';
    const r = srv(`printf '${conf.replace(/\n/g, '\\n')}' > rules.nft`, 'sudo nft -c -f rules.nft', 'sudo nft list ruleset', 'sudo nft -f rules.nft', 'sudo nft list ruleset', 'sudo nft -f /etc/nftables.conf', 'sudo nft list ruleset',
      'sudo nft add rule inet filter input tcp dport 22 jump x', 'sudo nft add rule inet nope input accept', 'nft list ruleset').log;
    expect(r[2].out).toEqual([]);
    expect(r[4].out).toEqual(['table inet filter {', '\tchain input {', '\t\ttype filter hook input priority filter; policy drop;', '\t\tct state established,related accept', '\t\tiif "lo" accept', '\t\ttcp dport { 22, 443 } accept', '\t}', '}']);
    expect(r[6].out).toEqual(['table inet filter {', '\tchain input {', '\t\ttype filter hook input priority filter; policy accept;', '\t}', '\tchain forward {', '\t\ttype filter hook forward priority filter; policy accept;', '\t}',
      '\tchain output {', '\t\ttype filter hook output priority filter; policy accept;', '\t}', '}']);
    expect(r[7].err).toEqual(['Error: 模擬環境的 nft 不支援 jump／goto（請把規則寫在 input 鏈裡）']);
    expect(r[8].err).toEqual(['Error: Could not process rule: No such file or directory']);
    expect(r[9].err).toEqual(['Error: Could not process rule: Operation not permitted']);
  });
  it('the ruleset of lesson data round-trips through the listing', () => {
    const t = loadRuleset('table ip filter {\n chain input {\n  type filter hook input priority 0; policy accept;\n  ip saddr { 10.0.0.5, 10.0.0.6 } tcp dport 22 counter accept\n }\n}\n');
    expect(Array.isArray(t) && nftText(t)).toBe('table ip filter {\n\tchain input {\n\t\ttype filter hook input priority filter; policy accept;\n\t\tip saddr { 10.0.0.5, 10.0.0.6 } tcp dport 22 counter packets 0 bytes 0 accept\n\t}\n}\n');
  });
});

describe('lesson data and checks', () => {
  it('validates the firewall data', () => {
    const bad: TerminalMachine = { ...fwLocal, firewall: { enabled: true, incoming: 'maybe' as 'deny', rules: ['allow 70000', 'open 22'], nftables: 'table inet filter { chain input { frob } }' } };
    expect(machineProblems(bad)).toEqual(['machine srv-local: firewall incoming and outgoing must be allow, deny or reject', 'machine srv-local: firewall rule "allow 70000": ERROR: Bad port',
      'machine srv-local: firewall rule "open 22": starts with allow, deny, reject or limit', 'machine srv-local: firewall nftables: syntax error, unexpected frob']);
    const ok: TerminalMachine = { ...fwLocal, firewall: { enabled: true, rules: ['allow OpenSSH', "allow 'Nginx Full'"] } };
    expect(machineProblems(ok)).toEqual([]);
    expect(session(ok, 'sudo ufw status').last.out.slice(4, 6)).toEqual(['OpenSSH                    ALLOW       Anywhere', 'Nginx Full                 ALLOW       Anywhere']);
  });
  it('reach and firewall checks read the machines after the commands', () => {
    const x: TerminalExercise = {
      id: 'fw', title: 'fw', machine: fwLocal.id, statement: '', explanation: 'x', hints: [], mistakes: [{ commands: ['sudo ufw --force enable'], why: 'locked out' }],
      checks: [{ kind: 'firewall', enabled: true, incoming: 'deny', rule: 'allow OpenSSH' }, { kind: 'reach', from: 'office', to: 'srv-01', port: 22, result: 'succeeded' },
        { kind: 'reach', from: 'cafe', to: 'srv-01', port: 5432, result: 'timeout' }],
      solution: ['sudo ufw allow OpenSSH', 'sudo ufw --force enable'],
    };
    const content = { machines: [fwLocal], examples: [], exercises: [x] };
    expect(terminalContentProblems(content)).toEqual([]);
    expect(checkTerminalExercise(x, [fwLocal], ['sudo ufw --force enable']).results.map(r => r.ok)).toEqual([false, false, true]);
    expect(checkTerminalExercise(x, [fwLocal], ['sudo ufw --force enable']).results[1].message).toBe('從 office 連到 srv-01 的 22 埠應該成功，但結果是逾時');
    const low = { machines: [{ ...fwLocal, profile: 'proxy' as const }], examples: [], exercises: [{ ...x, solution: ['true'], mistakes: [{ commands: ['false'], why: 'x' }] }] };
    expect(terminalContentProblems(low)).toEqual(expect.arrayContaining([expect.stringContaining('a reach check needs a firewall machine (engine stage E16)'), expect.stringContaining('a firewall check needs a firewall machine (engine stage E16)')]));
  });
  it('an http check from another host goes through the firewall', () => {
    const x: TerminalExercise = {
      id: 'web', title: 'web', machine: fwLocal.id, statement: '', explanation: 'x', hints: [], mistakes: [{ commands: ['sudo ufw --force enable'], why: 'no rule for http' }],
      checks: [{ kind: 'http', url: 'http://srv-01/', host: 'office', status: 200 }, { kind: 'firewall', enabled: true }],
      solution: ["sudo ufw allow 'Nginx HTTP'", 'sudo ufw --force enable'],
    };
    expect(terminalContentProblems({ machines: [fwLocal], examples: [], exercises: [x] })).toEqual([]);
  });
});
