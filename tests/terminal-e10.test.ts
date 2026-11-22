import { describe, expect, it } from 'vitest';
import { type FsState } from '@/lib/terminal/fs';
import { SERVER_MANUAL } from '@/lib/terminal/manual';
import { E10_COMMANDS, run, SCHEDULING_PROFILE, SOCKETS_PROFILE } from '@/lib/terminal/shell';
import { linkLocal, macFor, reach } from '@/lib/terminal/sockets';
import { checkTerminalExercise, machineProblems, machineState, profileOf, terminalContentProblems, type TerminalLessonContent, type TerminalMachine } from '@/lib/terminal/lesson';
import { cronMachine } from './support/terminal-fixture';
import { appRemote, dbRemote, listenExercise, sockMachine } from './support/server-fixture';

/*
 * Engine stage E10 (docs/curriculum/SRV0_SERVER_CAPABILITY.md §6): the sockets profile — interfaces (lo always), listening
 * sockets derived from running processes (held by their children of the same name), ss, lsof, nc -z, ip and getent, the
 * multi-host reach of E7's network (127.0.0.1 is not reachable from another machine), ports in use when systemd starts a
 * program, and the lesson data and the listen check.
 */
function session(from: FsState | TerminalMachine, ...commands: string[]) {
  let state = 'files' in from ? machineState(from) : from;
  const log: { out: string[]; err: string[] }[] = [];
  for (const cmd of commands) {
    const r = run(state, cmd, SOCKETS_PROFILE);
    state = r.state;
    log.push({ out: r.lines.filter(l => l.kind === 'out').map(l => l.text), err: r.lines.filter(l => l.kind === 'err').map(l => l.text) });
  }
  return { state, log, last: log.at(-1)! };
}
const out = (...commands: string[]) => session(sockMachine, ...commands).last.out;
const err = (...commands: string[]) => session(sockMachine, ...commands).last.err;
const status = (command: string) => session(sockMachine, command, 'echo $?').last.out[0];

describe('the sockets profile', () => {
  it('is the scheduling profile plus ss, lsof, nc, ip and getent; the scheduling profile refuses them', () => {
    expect([...SOCKETS_PROFILE.commands].sort()).toEqual([...SCHEDULING_PROFILE.commands, ...E10_COMMANDS].sort());
    expect(SOCKETS_PROFILE.features).toEqual([...SCHEDULING_PROFILE.features!, 'sockets']);
    expect(profileOf(sockMachine)).toBe(SOCKETS_PROFILE);
    for (const cmd of E10_COMMANDS) {
      expect(run(machineState(cronMachine), `${cmd} -h`, SCHEDULING_PROFILE).lines[0].text, cmd).toMatch(new RegExp(`^bash: ${cmd}: command not found`));
      expect(out(`${cmd} --help`)[0], cmd).toBe(`用法：${SERVER_MANUAL[cmd].usage}`);
    }
  });
  it('leaves the machines of lower profiles as they were: no interfaces, no generated files', () => {
    const s = machineState(cronMachine);
    expect(s.sockets).toBeUndefined();
    expect(s.nodes.has('/etc/services')).toBe(false);
    expect(machineProblems({ ...cronMachine, interfaces: [{ name: 'eth0', address: '10.0.0.9/24' }] }).join('\n')).toMatch(/need the sockets profile \(engine stage E10\)/);
    expect(machineProblems({ ...cronMachine, processes: [{ pid: 5, user: 'root', command: 'x', listen: [{ port: 80 }] }] }).join('\n')).toMatch(/listen need the sockets profile/);
  });
  it('completes the machine like Ubuntu: /etc/hosts with the other machines, /etc/services, systemd-resolved on 127.0.0.53', () => {
    const s = machineState(sockMachine);
    expect(s.nodes.get('/etc/hosts')!.content).toBe('127.0.0.1 localhost\n127.0.1.1 web-01\n10.0.0.20 db-01\n10.0.0.30 app-01\n\n# The following lines are desirable for IPv6 capable hosts\n::1 localhost ip6-localhost ip6-loopback\nff02::1 ip6-allnodes\nff02::2 ip6-allrouters\n');
    expect(s.nodes.get('/etc/services')!.content).toContain('http\t\t80/tcp\t\twww\t\t# WorldWideWeb HTTP');
    expect(out('ps -o pid,user,comm -p 600')).toEqual(['    PID USER     COMMAND', '    600 systemd+ systemd-resolve']);
    expect(machineState({ ...sockMachine, resolved: false }).processes!.some(p => p.pid === 600)).toBe(false);
    expect(machineProblems(sockMachine)).toEqual([]);
  });
});

describe('ss', () => {
  it('lists listening TCP sockets with iproute2\'s columns; users:((…)) only for processes the user may inspect', () => {
    expect(out('sudo ss -tlnp')).toEqual([
      'State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process',
      'LISTEN 0      128          0.0.0.0:22        0.0.0.0:*    users:(("sshd",pid=700,fd=3))',
      'LISTEN 0      4096      127.0.0.53:53        0.0.0.0:*    users:(("systemd-resolve",pid=600,fd=14))',
      'LISTEN 0      4096      127.0.0.54:53        0.0.0.0:*    users:(("systemd-resolve",pid=600,fd=16))',
      'LISTEN 0      511          0.0.0.0:80        0.0.0.0:*    users:(("nginx",pid=814,fd=6),("nginx",pid=813,fd=6),("nginx",pid=812,fd=6))',
      'LISTEN 0      200        127.0.0.1:5432      0.0.0.0:*    users:(("postgres",pid=900,fd=6))',
      'LISTEN 0      5            0.0.0.0:8000      0.0.0.0:*    users:(("python3",pid=1150,fd=3))',
    ]);
    const mine = out('ss -tlnp');
    expect(mine.filter(l => l.includes('users:'))).toEqual(['LISTEN 0      5            0.0.0.0:8000      0.0.0.0:*    users:(("python3",pid=1150,fd=3))']);
    expect(mine[4]).toBe('LISTEN 0      511          0.0.0.0:80        0.0.0.0:*');
  });
  it('-tulnp: Netid, UDP (UNCONN) before TCP; without -n the ports get their /etc/services names; -H drops the header', () => {
    const all = out('ss -tulnp');
    expect(all[0]).toBe('Netid State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process');
    expect(all.slice(1, 3)).toEqual(['udp   UNCONN 0      0         127.0.0.53:53        0.0.0.0:*', 'udp   UNCONN 0      0         127.0.0.54:53        0.0.0.0:*']);
    expect(all[3]).toMatch(/^tcp   LISTEN/);
    const named = out('ss -tl');
    expect(named.some(l => l.includes('0.0.0.0:ssh')) && named.some(l => l.includes('127.0.0.1:postgresql')) && named.some(l => l.includes('0.0.0.0:8000'))).toBe(true);
    expect(out('ss -tlnH')[0]).toMatch(/^LISTEN/);
  });
  it('-tan adds established and closing connections; a filter keeps one port', () => {
    expect(out('sudo ss -tan').slice(-2)).toEqual(['ESTAB     0      0          10.0.0.10:22       10.0.0.5:51234', 'TIME-WAIT 0      0       203.0.113.10:80   198.51.100.7:40112']);
    expect(out('ss -tn')).toEqual(['State     Recv-Q Send-Q Local Address:Port Peer Address:Port  Process', 'ESTAB     0      0          10.0.0.10:22       10.0.0.5:51234', 'TIME-WAIT 0      0       203.0.113.10:80   198.51.100.7:40112']);
    expect(out('ss -tln sport = :80')).toEqual(['State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process', 'LISTEN 0      511          0.0.0.0:80        0.0.0.0:*']);
    expect(out('ss -tln sport = :http')).toHaveLength(2);
  });
  it('reports options it does not know as iproute2 does, and the unsupported families in words', () => {
    expect(err('ss --foo')).toEqual(["ss: unrecognized option '--foo'", 'Usage: ss [ OPTIONS ]', '       ss [ OPTIONS ] [ FILTER ]']);
    expect(err('ss -z')[0]).toBe("ss: invalid option -- 'z'");
    expect(err('ss -x')[0]).toMatch(/只列出 TCP 與 UDP/);
    expect(err('ss -tln src 10.0.0.10')[0]).toMatch(/sport = :埠/);
  });
});

describe('lsof -i', () => {
  it('sorts by PID; an ordinary user sees only their own processes; -n and -P keep numbers', () => {
    expect(out('sudo lsof -i :80')).toEqual([
      'COMMAND PID     USER FD TYPE DEVICE SIZE/OFF NODE NAME',
      'nginx   812     root 6u IPv4  72528      0t0  TCP *:http (LISTEN)',
      'nginx   813 www-data 6u IPv4  72528      0t0  TCP *:http (LISTEN)',
      'nginx   814 www-data 6u IPv4  72528      0t0  TCP *:http (LISTEN)',
    ]);
    expect(out('lsof -i')).toEqual(['COMMAND  PID    USER FD TYPE DEVICE SIZE/OFF NODE NAME', 'python3 1150 learner 3u IPv4  76451      0t0  TCP *:8000 (LISTEN)']);
    const listen = out('sudo lsof -iTCP -sTCP:LISTEN -n -P');
    expect(listen.map(l => l.split(/\s+/)[0])).toEqual(['COMMAND', 'systemd-r', 'systemd-r', 'sshd', 'nginx', 'nginx', 'nginx', 'postgres', 'python3']);
    expect(listen).toContain('postgres   900        postgres  6u IPv4  69505      0t0  TCP 127.0.0.1:5432 (LISTEN)');
    expect(out('sudo lsof -i :5432')[1]).toMatch(/TCP localhost:postgresql \(LISTEN\)$/);
    expect(out('sudo lsof -i :22')[2]).toMatch(/^sshd    700 root 4u IPv4 +\d+      0t0  TCP 10\.0\.0\.10:ssh->10\.0\.0\.5:51234 \(ESTABLISHED\)$/);
  });
  it('prints nothing and exits 1 when nothing matches; asks for -i otherwise', () => {
    expect(out('lsof -i :80')).toEqual([]);
    expect(status('lsof -i :80')).toBe('1');
    expect(status('sudo lsof -i :80')).toBe('0');
    expect(err('lsof /etc/hosts')[0]).toMatch(/請加 -i/);
  });
});

describe('nc -z and reaching other machines', () => {
  it('succeeded, refused, timed out — and 127.0.0.1 is only reachable from the machine itself', () => {
    expect(err('nc -zv 127.0.0.1 5432')).toEqual(['Connection to 127.0.0.1 5432 port [tcp/postgresql] succeeded!']);
    expect(err('nc -zv 10.0.0.10 5432')).toEqual(['nc: connect to 10.0.0.10 port 5432 (tcp) failed: Connection refused']);
    expect(err('nc -zv db-01 5432')).toEqual(['nc: connect to db-01 (10.0.0.20) port 5432 (tcp) failed: Connection refused']);
    expect(err('nc -zv db-01 22')).toEqual(['Connection to db-01 (10.0.0.20) 22 port [tcp/ssh] succeeded!']);
    expect(err('nc -zv app-01 3000')).toEqual(['Connection to app-01 (10.0.0.30) 3000 port [tcp/*] succeeded!']);
    expect(err('nc -zv 10.0.0.99 80')).toEqual(['nc: connect to 10.0.0.99 port 80 (tcp) failed: Connection timed out']);
    expect(err('nc -zv -w 3 10.0.0.99 80')).toEqual(['nc: connect to 10.0.0.99 port 80 (tcp) timed out: Operation now in progress']);
    expect(err('nc -zv nowhere 80')).toEqual(['nc: getaddrinfo for host "nowhere" port 80: Name or service not known']);
    const s = machineState(sockMachine), db = s.net!.hosts[0].state;
    expect(reach(db, '127.0.0.1', 5432).result).toBe('ok');
    expect(reach(s, '10.0.0.20', 5432).result).toBe('refused');
  });
  it('ranges, the silent form and exit codes', () => {
    expect(err('nc -zv 10.0.0.30 2999-3001')).toEqual(['nc: connect to 10.0.0.30 port 2999 (tcp) failed: Connection refused', 'Connection to 10.0.0.30 3000 port [tcp/*] succeeded!',
      'nc: connect to 10.0.0.30 port 3001 (tcp) failed: Connection refused']);
    expect(session(sockMachine, 'nc -z 10.0.0.20 22').last).toEqual({ out: [], err: [] });
    expect(status('nc -z 10.0.0.20 22')).toBe('0');
    expect(status('nc -z 10.0.0.20 5432')).toBe('1');
    expect(err('nc web-01 80')[0]).toMatch(/只能用 -z/);
    expect(err('nc -zu 10.0.0.20 53')[0]).toMatch(/UDP 沒有交握/);
  });
  it('a socket closes with its process; a port in use makes a systemd program fail', () => {
    const killed = session(sockMachine, 'sudo kill 812', 'ss -tln sport = :80');
    expect(killed.last.out).toHaveLength(1);
    expect(session(sockMachine, 'sudo kill 812', 'nc -zv 127.0.0.1 80').last.err).toEqual(['nc: connect to 127.0.0.1 port 80 (tcp) failed: Connection refused']);
    const busy = session(sockMachine, 'sudo systemctl start web2', 'sudo journalctl -u web2 -n 3 -o cat');
    expect(busy.last.out).toEqual(['bind() to 0.0.0.0:80 failed (98: Address already in use)', 'web2.service: Main process exited, code=exited, status=1/FAILURE', "web2.service: Failed with result 'exit-code'."]);
    const freed = session(sockMachine, 'sudo kill 812', 'sudo systemctl start web2', 'sudo ss -tlnp sport = :80');
    expect(freed.last.out[1]).toMatch(/^LISTEN 0      4096         0\.0\.0\.0:80        0\.0\.0\.0:\*    users:\(\("web2",pid=\d+,fd=6\)\)$/);
  });
});

describe('ip and getent', () => {
  it('ip addr: lo first, the interfaces with broadcast and the kernel\'s IPv6 link-local addresses', () => {
    expect(linkLocal('52:54:00:12:34:56')).toBe('fe80::5054:ff:fe12:3456');
    expect(macFor('web-01/eth0')).toMatch(/^52:54:00(:[0-9a-f]{2}){3}$/);
    const a = out('ip addr');
    expect(a.slice(0, 6)).toEqual(['1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000', '    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00',
      '    inet 127.0.0.1/8 scope host lo', '       valid_lft forever preferred_lft forever', '    inet6 ::1/128 scope host noprefixroute', '       valid_lft forever preferred_lft forever']);
    expect(a).toContain('    inet 203.0.113.10/24 brd 203.0.113.255 scope global eth0');
    expect(a).toContain('3: eth1: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000');
    const mac = machineState(sockMachine).sockets!.interfaces[0].mac;
    expect(out('ip -br addr')).toEqual(['lo               UNKNOWN        127.0.0.1/8 ::1/128', `eth0             UP             203.0.113.10/24 ${linkLocal(mac)}/64`, `eth1             UP             10.0.0.10/24 ${linkLocal(machineState(sockMachine).sockets!.interfaces[1].mac)}/64`]);
    expect(out('ip -4 a s eth1')).toEqual(['3: eth1: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000', '    inet 10.0.0.10/24 brd 10.0.0.255 scope global eth1', '       valid_lft forever preferred_lft forever']);
    expect(err('ip a s eth9')).toEqual(['Device "eth9" does not exist.']);
  });
  it('ip route and ip route get: the default gateway and which interface a packet leaves by', () => {
    expect(out('ip route')).toEqual(['default via 203.0.113.1 dev eth0 proto static', '203.0.113.0/24 dev eth0 proto kernel scope link src 203.0.113.10', '10.0.0.0/24 dev eth1 proto kernel scope link src 10.0.0.10']);
    expect(out('ip route get 8.8.8.8')).toEqual(['8.8.8.8 via 203.0.113.1 dev eth0 src 203.0.113.10 uid 1000', '    cache']);
    expect(out('ip route get 10.0.0.20')).toEqual(['10.0.0.20 dev eth1 src 10.0.0.10 uid 1000', '    cache']);
    expect(out('ip r get 127.0.0.1')).toEqual(['local 127.0.0.1 dev lo src 127.0.0.1 uid 1000', '    cache <local>']);
    expect(err('ip addr add 1.2.3.4/24 dev eth0')).toEqual(['RTNETLINK answers: Operation not permitted']);
    expect(err('ip foo')).toEqual(['Object "foo" is unknown, try "ip help".']);
  });
  it('getent: /etc/hosts (IPv6 first, as for localhost), the lesson\'s names, /etc/services; exit 2 when not found', () => {
    expect(out('getent hosts localhost')).toEqual(['::1             localhost ip6-localhost ip6-loopback']);
    expect(out('getent hosts db-01 10.0.0.30')).toEqual(['10.0.0.20       db-01', '10.0.0.30       app-01']);
    expect(out('getent services http 5432 domain/udp')).toEqual(['http                  80/tcp www', 'postgresql            5432/tcp postgres', 'domain                53/udp']);
    expect(status('getent hosts nowhere')).toBe('2');
    expect(err('getent passwd')[0]).toMatch(/只支援 hosts 與 services/);
    expect(err('getent nosuch')).toEqual(['Unknown database: nosuch', "Try `getent --help' or `getent --usage' for more information."]);
  });
});

describe('lesson data', () => {
  const content = (): TerminalLessonContent => ({
    machines: [sockMachine],
    examples: [{ id: 'local-only', title: '只在本機', description: 'PostgreSQL 綁定 127.0.0.1。', machine: 'web-01', steps: [
      { command: 'nc -zv 127.0.0.1 5432', output: 'Connection to 127.0.0.1 5432 port [tcp/postgresql] succeeded!' },
      { command: 'nc -zv 10.0.0.10 5432', output: 'nc: connect to 10.0.0.10 port 5432 (tcp) failed: Connection refused' }] }],
    exercises: [listenExercise],
  });
  it('validates the E10 content; the listen check reads the machine after the commands', () => {
    expect(terminalContentProblems(content())).toEqual([]);
    expect(checkTerminalExercise(listenExercise, [sockMachine], ['sudo systemctl start web2']).results.map(r => r.message)).toEqual([
      '應該有 web2 在 80（tcp）監聽，但監聽的是 0.0.0.0:80（nginx）', '服務 web2.service 應該狀態是 active，但它是 failed']);
    expect(checkTerminalExercise({ ...listenExercise, checks: [{ kind: 'listen', port: 5432, address: '127.0.0.1', host: 'db-01' }] }, [sockMachine], []).ok).toBe(true);
    expect(checkTerminalExercise({ ...listenExercise, checks: [{ kind: 'listen', port: 80, absent: true }] }, [sockMachine], ['sudo kill 812']).ok).toBe(true);
  });
  it('reports bad interfaces, listeners, connections and checks', () => {
    const p = (patch: Partial<TerminalMachine>) => machineProblems({ ...sockMachine, ...patch }).join('\n');
    expect(p({ interfaces: [{ name: 'eth0', address: '10.0.0.10' }] })).toMatch(/interface eth0 10\.0\.0\.10: needs an address a\.b\.c\.d\/8\.\.32/);
    expect(p({ gateway: '192.0.2.1' })).toMatch(/gateway 192\.0\.2\.1 must be another address in an interface's network/);
    expect(p({ processes: [...sockMachine.processes!, { pid: 2000, user: 'root', command: 'apache2', listen: [{ port: 80 }] }] })).toMatch(/processes 812 and 2000 both listen on tcp port 80 \(Address already in use\)/);
    expect(p({ processes: [...sockMachine.processes!, { pid: 2000, user: 'root', command: 'x', listen: [{ port: 81, address: '192.0.2.5' }] }] })).toMatch(/process 2000 listen 81: address 192\.0\.2\.5 is not 0\.0\.0\.0, loopback or an address of the machine/);
    expect(p({ connections: [{ local: '10.0.0.10:22', peer: '10.0.0.5:1', pid: 4242 }] })).toMatch(/connection 1: pid must be a process of the machine/);
    expect(p({ remotes: [dbRemote, appRemote, ...['a', 'b', 'c', 'd', 'e'].map((h, i) => ({ host: `h-${h}`, address: `10.0.1.${i + 1}`, hostKey: h, files: [] }))] })).toMatch(/at most 6 remote machines/);
    expect(p({ processes: [...sockMachine.processes!, { pid: 2000, user: 'root', command: 'x', listen: [{ port: 81, http: 'site' }] }] })).toMatch(/responders and listen\.http need the http profile/);
    const c = content();
    c.exercises[0] = { ...listenExercise, checks: [{ kind: 'listen', port: 70000 }] };
    expect(terminalContentProblems(c).join('\n')).toMatch(/a listen check needs a sockets machine/);
    // Every command of a transcript is checked against the machine's profile.
    expect(terminalContentProblems({ machines: [cronMachine], examples: [{ id: 'x', title: 'x', description: 'x', machine: cronMachine.id, steps: [{ command: 'sudo ss -tln | grep 80', output: '' }] }], exercises: [] }).join('\n'))
      .toMatch(/ss is not in the scheduling profile of machine/);
  });
  it('commands do not change the machine they read', () => {
    const s = machineState(sockMachine);
    for (const c of ['sudo ss -tulnp', 'sudo lsof -i', 'nc -zv db-01 22', 'ip a', 'getent hosts db-01']) expect(run(s, c, SOCKETS_PROFILE).state.nodes, c).toEqual(s.nodes);
  });
});
