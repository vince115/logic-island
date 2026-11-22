import { describe, expect, it } from 'vitest';
import { type FsState } from '@/lib/terminal/fs';
import { DIAGNOSTICS_PROFILE, E19_COMMANDS, EDGE_PROFILE, run, TUNNELS_PROFILE } from '@/lib/terminal/shell';
import { DIAG_MANUAL } from '@/lib/terminal/manual';
import { captureText, parseCapture } from '@/lib/terminal/diag';
import { checkTerminalExercise, machineProblems, machineState, profileOf, terminalContentProblems, type TerminalExercise, type TerminalMachine } from '@/lib/terminal/lesson';
import { cacheMachine, diagLaptop, WEB_CAPTURE } from './support/cdn-fixture';
import { tunnelLaptop } from './support/edge-fixture';

/*
 * Engine stage E19 (docs/curriculum/SRV0_SERVER_CAPABILITY.md §24): the diagnostics profile — ping (iputils' lines and
 * statistics, round trips from the declared latencies and paths, loss, host unreachable, firewalls), traceroute (hops,
 * silent routers, UDP probes dropped by ufw, -I and -T), mtr's report (Loss% that does or does not persist), tcpdump -r on
 * a declared capture (tcpdump 4.99's lines, relative sequence numbers, DNS and ICMP, the filter language, -A, -c, -w), the
 * sed subset, the lesson data, and the boundary: these commands do not exist below this profile.
 */
function session(from: FsState | TerminalMachine, ...commands: string[]) {
  let state = 'files' in from ? machineState(from) : from;
  const log: { out: string[]; err: string[] }[] = [];
  for (const cmd of commands) {
    const r = run(state, cmd, DIAGNOSTICS_PROFILE);
    state = r.state;
    log.push({ out: r.lines.filter(l => l.kind === 'out').map(l => l.text), err: r.lines.filter(l => l.kind === 'err').map(l => l.text) });
  }
  return { state, log, last: log.at(-1)! };
}
const lap = (...commands: string[]) => session(diagLaptop, ...commands);
const stars = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `${String(from + i).padStart(2)}  * * *`);

describe('the diagnostics profile', () => {
  it('is the edge profile plus ping, traceroute, mtr, tcpdump and sed; below it they are not commands', () => {
    expect([...DIAGNOSTICS_PROFILE.commands].sort()).toEqual([...EDGE_PROFILE.commands, ...E19_COMMANDS].sort());
    expect(DIAGNOSTICS_PROFILE.features).toEqual([...EDGE_PROFILE.features!, 'diagnostics']);
    expect(profileOf(diagLaptop)).toBe(DIAGNOSTICS_PROFILE);
    expect(machineProblems(diagLaptop)).toEqual([]);
    for (const cmd of E19_COMMANDS) {
      expect(lap(`${cmd} --help`).last.out[0], cmd).toBe(`用法：${DIAG_MANUAL[cmd].usage}`);
      const below = run(machineState({ ...cacheMachine }), `${cmd} -c 1 web-01`, EDGE_PROFILE).lines[0].text;
      expect(below, cmd).toMatch(new RegExp(`^bash: ${cmd}: command not found（模擬環境支援：`));
      expect(below.slice(below.indexOf('支援：') + 3).split(/[、）]/)).not.toContain('sed');
    }
    expect(run(machineState(tunnelLaptop), 'ping -c 1 bastion', TUNNELS_PROFILE).lines[0].text).toMatch(/^bash: ping: command not found/);
    expect(machineProblems({ ...diagLaptop, profile: 'edge', paths: undefined }).join('\n')).toContain('paths and captures need the diagnostics profile (engine stage E19)');
    expect(lap('help').last.out).toContain('  tcpdump -r 擷取檔 [-n] [-A] [-c N] [過濾條件]  讀取擷取的封包');
  });
});

describe('ping', () => {
  it('prints iputils\' lines and statistics with round trips from the latencies (a name shows its address too)', () => {
    expect(lap('ping -c 4 web-01').last.out).toEqual(['PING web-01 (10.0.0.12) 56(84) bytes of data.', '64 bytes from web-01 (10.0.0.12): icmp_seq=1 ttl=64 time=0.489 ms',
      '64 bytes from web-01 (10.0.0.12): icmp_seq=2 ttl=64 time=0.492 ms', '64 bytes from web-01 (10.0.0.12): icmp_seq=3 ttl=64 time=0.499 ms', '64 bytes from web-01 (10.0.0.12): icmp_seq=4 ttl=64 time=0.492 ms', '',
      '--- web-01 ping statistics ---', '4 packets transmitted, 4 received, 0% packet loss, time 3003ms', 'rtt min/avg/max/mdev = 0.489/0.493/0.499/0.004 ms']);
    expect(lap('ping -c 1 10.0.0.12').last.out[1]).toBe('64 bytes from 10.0.0.12: icmp_seq=1 ttl=64 time=0.489 ms');
    expect(lap('ping -c 2 localhost').last.out[1]).toBe('64 bytes from localhost (127.0.0.1): icmp_seq=1 ttl=64 time=0.042 ms');
  });
  it('a declared path gives the TTL and the round trip (1 or 2 decimals as iputils prints them), and its loss', () => {
    const r = lap('ping -c 4 93.184.216.34', 'ping -c 5 -q 192.0.2.80').log;
    expect(r[0].out.slice(1, 3)).toEqual(['64 bytes from 93.184.216.34: icmp_seq=1 ttl=60 time=11.5 ms', '64 bytes from 93.184.216.34: icmp_seq=2 ttl=60 time=11.6 ms']);
    expect(r[1].out).toEqual(['PING 192.0.2.80 (192.0.2.80) 56(84) bytes of data.', '', '--- 192.0.2.80 ping statistics ---', '5 packets transmitted, 4 received, 20% packet loss, time 4004ms',
      'rtt min/avg/max/mdev = 26.694/27.202/27.515/0.324 ms']);
  });
  it('no answer: a firewall that drops ICMP (nft), no machine on the local network (Host Unreachable), elsewhere (silence); ufw answers ping', () => {
    const r = lap('ping -c 2 db-01; echo $?', 'ping -c 3 10.0.0.99', 'ping -c 2 10.0.9.9').log;
    expect(r[0].out).toEqual(['PING db-01 (10.0.1.20) 56(84) bytes of data.', '', '--- db-01 ping statistics ---', '2 packets transmitted, 0 received, 100% packet loss, time 1001ms', '1']);
    expect(r[1].out).toEqual(['PING 10.0.0.99 (10.0.0.99) 56(84) bytes of data.', 'From 10.0.0.10 icmp_seq=1 Destination Host Unreachable', 'From 10.0.0.10 icmp_seq=2 Destination Host Unreachable',
      'From 10.0.0.10 icmp_seq=3 Destination Host Unreachable', '', '--- 10.0.0.99 ping statistics ---', '3 packets transmitted, 0 received, +3 errors, 100% packet loss, time 2002ms', 'pipe 3']);
    expect(r[2].out.slice(-1)).toEqual(['2 packets transmitted, 0 received, 100% packet loss, time 1001ms']);
    // An icmp rule lets the database answer.
    const allowed: TerminalMachine = { ...diagLaptop, remotes: diagLaptop.remotes!.map(x => x.host === 'db-01' ? { ...x, firewall: { nftables: x.firewall!.nftables!.replace('tcp dport 22 accept', 'tcp dport 22 accept\n    icmp type echo-request accept') } } : x) };
    expect(session(allowed, 'ping -c 1 db-01').last.out[1]).toBe('64 bytes from db-01 (10.0.1.20): icmp_seq=1 ttl=63 time=0.566 ms');
  });
  it('needs -c (no Ctrl-C) and a name that resolves', () => {
    expect(lap('ping web-01').last.err).toEqual(['ping：模擬環境沒有 Ctrl-C 可以停止 ping；請加 -c 次數，例如 ping -c 4 主機']);
    expect(lap('ping -c 2 nosuch; echo $?').last).toEqual({ out: ['2'], err: ['ping: nosuch: Name or service not known'] });
  });
});

describe('traceroute and mtr', () => {
  it('lists the hops: the gateway as _gateway, names from /etc/hosts or the path, * for routers that do not answer', () => {
    expect(lap('traceroute 93.184.216.34').last.out).toEqual(['traceroute to 93.184.216.34 (93.184.216.34), 30 hops max, 60 byte packets', ' 1  _gateway (10.0.0.1)  0.404 ms  0.409 ms  0.403 ms',
      ' 2  100.64.0.1 (100.64.0.1)  3.184 ms  3.199 ms  3.187 ms', ' 3  * * *', ' 4  core1.transit.example (198.51.100.7)  9.634 ms  10.049 ms *', ' 5  www.example.com (93.184.216.34)  11.664 ms  11.458 ms  11.835 ms']);
  });
  it('UDP probes are dropped by ufw\'s default deny (stars to the end); -I (ICMP) gets through; -T needs root', () => {
    const r = lap('traceroute -n web-01', 'traceroute -I web-01', 'traceroute -T web-01', 'sudo traceroute -T -p 22 db-01', 'traceroute -n -m 4 10.0.9.9').log;
    expect(r[0].out).toEqual(['traceroute to web-01 (10.0.0.12), 30 hops max, 60 byte packets', ...stars(1, 30)]);
    expect(r[1].out).toEqual(['traceroute to web-01 (10.0.0.12), 30 hops max, 60 byte packets', ' 1  web-01 (10.0.0.12)  0.512 ms  0.506 ms  0.494 ms']);
    expect(r[2].err).toEqual(['You do not have enough privileges to use this traceroute method.', 'socket: Operation not permitted']);
    expect(r[3].out).toEqual(['traceroute to db-01 (10.0.1.20), 30 hops max, 60 byte packets', ' 1  _gateway (10.0.0.1)  0.354 ms  0.358 ms  0.353 ms', ' 2  db-01 (10.0.1.20)  0.557 ms  0.541 ms  0.562 ms']);
    expect(r[4].out).toEqual(['traceroute to 10.0.9.9 (10.0.9.9), 4 hops max, 60 byte packets', ' 1  10.0.0.1  0.354 ms  0.358 ms  0.353 ms', ...stars(2, 4)]);
  });
  it('mtr --report: Loss% only at one router is ICMP rate limiting; loss that persists to the end is real', () => {
    expect(lap('mtr --report -c 10 93.184.216.34').last.out).toEqual(['Start: 2026-11-22T10:00:00+0000', 'HOST: laptop                      Loss%   Snt   Last   Avg  Best  Wrst StDev',
      '  1.|-- _gateway                   0.0%    10    0.4   0.4   0.4   0.4   0.0', '  2.|-- 100.64.0.1                 0.0%    10    3.1   3.2   3.1   3.3   0.0',
      '  3.|-- ???                       100.0    10    0.0   0.0   0.0   0.0   0.0', '  4.|-- core1.transit.example     30.0%    10    9.8   9.8   9.6  10.0   0.1',
      '  5.|-- www.example.com            0.0%    10   11.5  11.6  11.3  11.9   0.2']);
    expect(lap('mtr -rwn -c 5 192.0.2.80').last.out.slice(1)).toEqual(['HOST: laptop     Loss%   Snt   Last   Avg  Best  Wrst StDev', '  1.|-- 10.0.0.1    0.0%     5    0.4   0.4   0.4   0.4   0.0',
      '  2.|-- 100.64.0.1  0.0%     5    3.1   3.1   3.0   3.2   0.1', '  3.|-- 192.0.2.50 20.0%     5   25.7  24.9  24.4  25.7   0.6', '  4.|-- 192.0.2.80 20.0%     5   27.1  26.9  26.2  27.2   0.5']);
    expect(lap('mtr -rw db-01').last.out.slice(2)).toEqual(['  1.|-- _gateway  0.0%    10    0.3   0.3   0.3   0.4   0.0', '  2.|-- ???      100.0    10    0.0   0.0   0.0   0.0   0.0']);
    expect(lap('mtr web-01').last.err[0]).toMatch(/^mtr：模擬環境沒有全螢幕的互動介面/);
  });
});

describe('tcpdump -r', () => {
  it('prints tcpdump\'s lines: DNS, the handshake (absolute until the first ACK), relative sequence numbers, HTTP, ICMP, names from /etc/hosts and /etc/services', () => {
    const r = lap('tcpdump -r /var/tmp/web.pcap').last;
    expect(r.err).toEqual(['reading from file /var/tmp/web.pcap, link-type EN10MB (Ethernet), snapshot length 262144']);
    expect(r.out).toEqual([
      '09:59:00.000000 IP 10.0.0.10.41234 > 10.0.0.53.domain: 4660+ A? web-01.example.com. (36)',
      '09:59:00.000812 IP 10.0.0.53.domain > 10.0.0.10.41234: 4660 1/0/0 A 10.0.0.12 (52)',
      '09:59:00.001000 IP 10.0.0.10.51234 > web-01.http: Flags [S], seq 1000, win 64240, length 0',
      '09:59:00.001400 IP web-01.http > 10.0.0.10.51234: Flags [S.], seq 5000, ack 1001, win 65160, length 0',
      '09:59:00.001500 IP 10.0.0.10.51234 > web-01.http: Flags [.], ack 1, win 502, length 0',
      '09:59:00.001600 IP 10.0.0.10.51234 > web-01.http: Flags [P.], seq 1:70, ack 1, win 502, length 69: HTTP: GET / HTTP/1.1',
      '09:59:00.002100 IP web-01.http > 10.0.0.10.51234: Flags [.], ack 70, win 502, length 0',
      '09:59:00.002500 IP web-01.http > 10.0.0.10.51234: Flags [P.], seq 1:43, ack 70, win 502, length 42: HTTP: HTTP/1.1 200 OK',
      '09:59:00.002600 IP 10.0.0.10.51234 > web-01.http: Flags [F.], seq 70, ack 43, win 502, length 0',
      '09:59:00.002900 IP web-01.http > 10.0.0.10.51234: Flags [F.], seq 43, ack 71, win 502, length 0',
      '09:59:00.003000 IP 10.0.0.10.51234 > web-01.http: Flags [.], ack 44, win 502, length 0',
      '09:59:01.500000 IP 10.0.0.10 > web-01: ICMP echo request, id 7, seq 1, length 64',
      '09:59:01.500400 IP web-01 > 10.0.0.10: ICMP echo reply, id 7, seq 1, length 64',
      '09:59:02.000000 IP 10.0.0.10.51240 > db-01.postgresql: Flags [S], seq 777, win 64240, length 0',
      '09:59:02.000300 IP db-01.postgresql > 10.0.0.10.51240: Flags [R.], seq 0, ack 778, win 0, length 0',
    ]);
  });
  it('filters (host, port, tcp, udp, icmp, src, dst, and, or, not, parentheses), -n, -A, -c, -t and -w', () => {
    const r = lap('tcpdump -nn -r /var/tmp/web.pcap port 80 and src host 10.0.0.12', "tcpdump -nn -r /var/tmp/web.pcap 'icmp or (udp and dst port 53)'", 'tcpdump -nn -t -c 1 -r /var/tmp/web.pcap host db-01 and not port 80',
      'tcpdump -n -A -c 4 -r /var/tmp/web.pcap tcp', 'tcpdump -r /var/tmp/web.pcap -w http.pcap tcp port 80', 'tcpdump -nn -tttt -r http.pcap -c 1', 'tcpdump -r /var/tmp/web.pcap port').log;
    expect(r[0].out.map(l => l.slice(16))).toEqual(['IP 10.0.0.12.80 > 10.0.0.10.51234: Flags [S.], seq 5000, ack 1001, win 65160, length 0', 'IP 10.0.0.12.80 > 10.0.0.10.51234: Flags [.], ack 70, win 502, length 0',
      'IP 10.0.0.12.80 > 10.0.0.10.51234: Flags [P.], seq 1:43, ack 70, win 502, length 42: HTTP: HTTP/1.1 200 OK', 'IP 10.0.0.12.80 > 10.0.0.10.51234: Flags [F.], seq 43, ack 71, win 502, length 0']);
    expect(r[1].out.map(l => l.slice(16))).toEqual(['IP 10.0.0.10.41234 > 10.0.0.53.53: 4660+ A? web-01.example.com. (36)', 'IP 10.0.0.10 > 10.0.0.12: ICMP echo request, id 7, seq 1, length 64',
      'IP 10.0.0.12 > 10.0.0.10: ICMP echo reply, id 7, seq 1, length 64']);
    expect(r[2].out).toEqual(['IP 10.0.0.10.51240 > 10.0.1.20.5432: Flags [S], seq 777, win 64240, length 0']);
    expect(r[3].out.slice(-5)).toEqual(['GET / HTTP/1.1', 'Host: web-01', 'User-Agent: curl/8.5.0', 'Accept: */*', '']);
    expect(r[4]).toEqual({ out: [], err: ['reading from file /var/tmp/web.pcap, link-type EN10MB (Ethernet), snapshot length 262144'] });
    expect(r[5].out).toEqual(['2026-11-22 09:59:00.001000 IP 10.0.0.10.51234 > 10.0.0.12.80: Flags [S], seq 1000, win 64240, length 0']);
    expect(r[6].err).toEqual(["tcpdump: can't parse filter expression: syntax error"]);
  });
  it('reads only a capture file it may read; live capture is not simulated', () => {
    const r = lap('tcpdump -r /etc/passwd', 'tcpdump -r none.pcap', 'tcpdump -i eth0', 'sudo tcpdump -i eth0', 'tcpdump -nn -r /var/tmp/web.pcap host nosuch').log;
    expect(r[0].err).toEqual(['tcpdump: unknown file format']);
    expect(r[1].err).toEqual(['tcpdump: none.pcap: No such file or directory']);
    expect(r[2].err).toEqual(["tcpdump: eth0: You don't have permission to perform this capture on that device", '(socket: Operation not permitted)']);
    expect(r[3].err[0]).toMatch(/^tcpdump：模擬環境不能即時擷取封包/);
    expect(r[4].err).toEqual(["tcpdump: can't parse filter expression: unknown host 'nosuch'"]);
    expect(parseCapture(captureText({ start: 0, packets: WEB_CAPTURE }))?.packets).toHaveLength(WEB_CAPTURE.length);
  });
});

describe('sed (a documented subset)', () => {
  it('prints lines by number or pattern, substitutes, deletes, and edits in place', () => {
    const r = lap("sed -n '2p' access.log", "sed -n '/ 200$/p' access.log", "sed 's/GET/HEAD/' access.log", "sed -E 's/([A-Z]+) (\\/[a-z])/\\2 \\1/g' access.log", "sed '/404/d' access.log",
      "sed -n '2,3p;$=' access.log", "sed -i.bak 's/500/503/' access.log", 'cat access.log access.log.bak', 'grep 503 access.log | sed "s/ 503/ (error)/"').log;
    expect(r[0].out).toEqual(['GET /b 404']);
    expect(r[1].out).toEqual(['GET /a 200', 'GET /d 200']);
    expect(r[2].out).toEqual(['HEAD /a 200', 'HEAD /b 404', 'POST /c 500', 'HEAD /d 200']);
    expect(r[3].out[0]).toBe('/a GET 200');
    expect(r[4].out).toEqual(['GET /a 200', 'POST /c 500', 'GET /d 200']);
    expect(r[5].out).toEqual(['GET /b 404', 'POST /c 500', '4']);
    expect(r[7].out).toEqual(['GET /a 200', 'GET /b 404', 'POST /c 503', 'GET /d 200', 'GET /a 200', 'GET /b 404', 'POST /c 500', 'GET /d 200']);
    expect(r[8].out).toEqual(['POST /c (error)']);
  });
  it('prints GNU sed\'s errors and says what the subset leaves out', () => {
    const r = lap("sed 'k' access.log", "sed 's/a/b' access.log", "sed 's/a/b/z' access.log", "sed -n '/x' access.log", "sed 'x' access.log", "sed p none", "sed -i 's/a/b/'", 'sed -i "s/a/b/" /etc/hostname').log;
    expect(r.map(l => l.err[0])).toEqual(["sed: -e expression #1, char 1: unknown command: `k'", "sed: -e expression #1, char 5: unterminated `s' command", "sed: -e expression #1, char 7: unknown option to `s'",
      'sed: -e expression #1, char 2: unterminated address regex', 'sed：模擬環境的 sed 只支援 p、d、s、q 與 = 指令（x 不支援）', "sed: can't read none: No such file or directory", 'sed: no input files',
      "sed: can't read /etc/hostname: No such file or directory"]);
  });
});

describe('lesson data', () => {
  it('validates paths and captures', () => {
    const bad = (m: Partial<TerminalMachine>) => machineProblems({ ...diagLaptop, ...m }).join('\n');
    expect(bad({ paths: [{ hops: [{ address: '10.0.0.1', rtt: -1 }] }] })).toContain('hop 10.0.0.1 needs a round trip of 0..10000 ms');
    expect(bad({ paths: [{ hops: [] }] })).toContain('needs 1..30 hops');
    expect(bad({ captures: [{ path: '/var/tmp/x.pcap', packets: [{ t: 0, proto: 'tcp', src: '10.0.0.1', dst: '10.0.0.2:80' }] }] })).toContain('src and dst are a.b.c.d:port');
    expect(bad({ captures: [{ path: '/var/tmp/x.pcap', packets: [{ t: 1, proto: 'udp', src: '10.0.0.1:1', dst: '10.0.0.2:2' }, { t: 0, proto: 'udp', src: '10.0.0.1:1', dst: '10.0.0.2:2' }] }] })).toContain('t must be 0..86400 seconds, in order');
  });
  it('an output check with fromCommand: the hop that loses packets, found with mtr (not typed)', () => {
    const x: TerminalExercise = {
      id: 'hop', title: '哪一跳在掉封包', machine: 'diag-laptop', statement: '用 mtr 找出 api.example.net 的路徑上第一個持續遺失的那一跳。', checks: [{ kind: 'output', fromCommand: '^(sudo )?mtr ' }],
      solution: ['mtr -rwn -c 10 192.0.2.80'], mistakes: [{ commands: ['ping -c 4 192.0.2.80'], why: 'ping 只看得到目的地' }],
      variants: [{ label: '別的路徑', files: [] }], hints: ['mtr --report'], explanation: '192.0.2.50 起每一跳都遺失 20%。',
    };
    const paths = [diagLaptop.paths![0], { hops: [{ address: '10.0.0.1', rtt: 0.4 }, { address: '192.0.2.50', rtt: 22 }, { address: '192.0.2.80', rtt: 24, loss: 40 }] }];
    const ok: TerminalExercise = { ...x, variants: [{ label: '別的路徑', files: [], paths }] };
    expect(terminalContentProblems({ machines: [diagLaptop], examples: [], exercises: [ok] })).toEqual([]);
    expect(checkTerminalExercise(ok, [diagLaptop], ['mtr -rwn -c 10 192.0.2.80']).ok).toBe(true);
    // The answer copied from the first machine is not what the variant prints, and typing it does not count either.
    expect(checkTerminalExercise(ok, [diagLaptop], ['echo hi']).ok).toBe(false);
    expect(terminalContentProblems({ machines: [diagLaptop], examples: [], exercises: [x] }).join('\n')).toContain('an output check needs a variant');
  });
});
