import { describe, expect, it } from 'vitest';
import { type FsState } from '@/lib/terminal/fs';
import { FIREWALL_PROFILE, run, TUNNELS_PROFILE } from '@/lib/terminal/shell';
import { checkTerminalExercise, machineProblems, machineState, profileOf, terminalContentProblems, type TerminalExercise, type TerminalMachine, type TerminalRemote } from '@/lib/terminal/lesson';
import { bastion, dbServer, tunnelLaptop } from './support/edge-fixture';

/*
 * Engine stage E17 (docs/curriculum/SRV0_SERVER_CAPABILITY.md §18): the tunnels profile — a database server only the
 * bastion reaches, ssh -J and ProxyJump, ~/.ssh/config Host blocks (lifting E7's limit from this profile up), local (-L) and
 * remote (-R) forwarding with -f -N, listeners held by ssh (and by sshd on the server), sshd's AllowTcpForwarding and
 * GatewayPorts, the channel errors ssh prints, and the tunnel check.
 */
function session(from: FsState | TerminalMachine, ...commands: string[]) {
  let state = 'files' in from ? machineState(from) : from;
  const log: { out: string[]; err: string[] }[] = [];
  for (const cmd of commands) {
    const r = run(state, cmd, TUNNELS_PROFILE);
    state = r.state;
    log.push({ out: r.lines.filter(l => l.kind === 'out').map(l => l.text), err: r.lines.filter(l => l.kind === 'err').map(l => l.text) });
  }
  return { state, log, last: log.at(-1)! };
}
const A = '-o StrictHostKeyChecking=accept-new';
/** The laptop that knows the bastion's host key already (a jump host does not get the command line's -o options, as in OpenSSH). */
const KNOW = `ssh ${A} learner@bastion true`;
const known = (m: TerminalMachine, ...commands: string[]) => { const r = session(m, KNOW, ...commands); return { ...r, log: r.log.slice(1) }; };
const laptop = (...commands: string[]) => known(tunnelLaptop, ...commands);
const PW = (who: string) => `${who}'s password: （模擬環境代為輸入課程提供的密碼）`;
/** The laptop with a changed remote (by host). */
const withRemote = (r: TerminalRemote): TerminalMachine => ({ ...tunnelLaptop, remotes: tunnelLaptop.remotes!.map(x => x.host === r.host ? r : x) });
const sshdConfig = (text: string) => ({ path: '/etc/ssh/sshd_config', kind: 'file' as const, mode: 0o644, owner: 'root', content: `${text}\n` });
const CONFIG = 'Host bastion\n  HostName 10.0.0.40\n  User learner\n\nHost db\n  HostName 10.0.1.20\n  ProxyJump bastion\n\nHost *\n  User nobody\n  StrictHostKeyChecking accept-new\n';
const configured: TerminalMachine = { ...tunnelLaptop, sshConfig: CONFIG };

describe('the tunnels profile', () => {
  it('is the firewall profile plus tunnels (no new commands); below it -L is not an option and ~/.ssh/config is not read', () => {
    expect([...TUNNELS_PROFILE.commands].sort()).toEqual([...FIREWALL_PROFILE.commands].sort());
    expect(TUNNELS_PROFILE.features).toEqual([...FIREWALL_PROFILE.features!, 'tunnels']);
    expect(profileOf(tunnelLaptop)).toBe(TUNNELS_PROFILE);
    expect(machineProblems(tunnelLaptop)).toEqual([]);
    const below: TerminalMachine = { ...tunnelLaptop, profile: 'firewall', remotes: [bastion] };
    expect(machineProblems(below)).toEqual([]);
    const r = run(machineState(below), 'ssh -L 8080:db-01:8080 bastion', FIREWALL_PROFILE).lines.map(l => l.text);
    expect(r).toEqual(['ssh: unknown option -- L', 'usage: ssh [-46AaCfGgKkMNnqsTtVvXxYy] [-i identity_file] [-l login_name] [-o option] [-p port] destination [command [argument ...]]']);
    // E7's limit stays below: a Host alias is just an unknown name there.
    const s = machineState({ ...below, files: [...below.files, { path: '/home/learner/.ssh', kind: 'dir', mode: 0o700, owner: 'learner' }, { path: '/home/learner/.ssh/config', kind: 'file', mode: 0o600, owner: 'learner', content: CONFIG }] });
    expect(run(s, 'ssh db hostname', FIREWALL_PROFILE).lines.map(l => l.text)).toEqual(['ssh: Could not resolve hostname db: Name or service not known']);
    expect(machineProblems({ ...below, sshConfig: CONFIG })).toEqual(['machine laptop-2: reachableFrom and sshConfig need the tunnels profile (engine stage E17)']);
    expect(machineProblems({ ...below, remotes: [bastion, dbServer] })).toEqual(['machine laptop-2: remote db-01: reachableFrom and sshConfig need the tunnels profile (engine stage E17)']);
  });
});

describe('a private network behind a bastion', () => {
  it('times out from the laptop and answers from the bastion', () => {
    const r = laptop('nc -zv 10.0.1.20 22', 'ssh learner@db-01', `ssh ${A} learner@bastion nc -zv db-01 22`).log;
    expect(r[0].err).toEqual(['nc: connect to 10.0.1.20 port 22 (tcp) failed: Connection timed out']);
    expect(r[1].err).toEqual(['ssh: connect to host db-01 port 22: Connection timed out']);
    expect(r[2].err.at(-1)).toBe('Connection to db-01 (10.0.1.20) 22 port [tcp/ssh] succeeded!');
  });
  it('ssh -J reaches it through the bastion (the bastion looks the name up; keys and known_hosts are the laptop\'s)', () => {
    expect(session(tunnelLaptop, `ssh ${A} -J learner@bastion learner@db-01 hostname`).last.err.at(-1)).toBe('Host key verification failed.');
    const r = laptop(`ssh ${A} -J learner@bastion learner@db-01 hostname`, 'cat ~/.ssh/known_hosts', `ssh ${A} -J learner@bastion learner@db-01`, 'hostname', 'exit').log;
    expect(r[0].err).toEqual([PW('learner@bastion'), "Warning: Permanently added 'db-01' (ED25519) to the list of known hosts.", PW('learner@db-01')]);
    expect(r[0].out).toEqual(['db-01']);
    expect(r[1].out.map(l => l.split(' ')[0])).toEqual(['bastion', 'db-01']);
    expect(r[3].out).toEqual(['db-01']);
    expect(r[4].err).toEqual(['Connection to db-01 closed.']);
  });
  it('reports the jump\'s failures as ssh does', () => {
    const r = laptop(`ssh ${A} -J learner@bastion learner@nowhere hostname`, `ssh ${A} -J learner@bastion learner@10.0.1.99 hostname`).log;
    expect(r[0].err.slice(1)).toEqual(['channel 0: open failed: connect failed: Name or service not known', 'stdio forwarding failed', 'Connection closed by UNKNOWN port 65535']);
    expect(r[1].err.slice(1)).toEqual(['channel 0: open failed: connect failed: Connection timed out', 'stdio forwarding failed', 'Connection closed by UNKNOWN port 65535']);
    const closed = withRemote({ ...bastion, files: [...bastion.files, sshdConfig('AllowTcpForwarding no')] });
    expect(known(closed, `ssh ${A} -J learner@bastion learner@db-01 hostname`).last.err.slice(1)).toEqual(['channel 0: open failed: administratively prohibited: open failed', 'stdio forwarding failed', 'Connection closed by UNKNOWN port 65535']);
  });
});

describe('~/.ssh/config', () => {
  it('Host blocks give HostName, User and ProxyJump (the first value wins; Host * comes last)', () => {
    expect(machineProblems(configured)).toEqual([]);
    const r = session(configured, 'ls -l ~/.ssh', 'ssh db hostname', 'ssh bastion whoami', 'ssh -l learner db whoami').log;
    expect(r[0].out.at(-1)).toMatch(/^-rw------- learner learner +\d+ config$/);
    // db: User from Host * (nobody), who is not on db-01; the known_hosts name is the HostName.
    expect(r[1].err).toEqual(["Warning: Permanently added '10.0.0.40' (ED25519) to the list of known hosts.", PW('learner@10.0.0.40'), "Warning: Permanently added '10.0.1.20' (ED25519) to the list of known hosts.",
      "nobody@10.0.1.20's password: （模擬環境：課程沒有提供這個帳號的密碼）", 'nobody@10.0.1.20: Permission denied (publickey,password).']);
    expect(r[2].out).toEqual(['learner']);
    expect(r[3].out).toEqual(['learner']);
  });
  it('refuses a config others can write, and stops at an unknown keyword', () => {
    const r = session(configured, 'chmod 666 ~/.ssh/config', 'ssh db hostname', 'chmod 600 ~/.ssh/config', 'echo "Frobnicate yes" >> ~/.ssh/config', 'ssh db hostname', 'ssh -F /nope db hostname').log;
    expect(r[1].err).toEqual(['Bad owner or permissions on /home/learner/.ssh/config']);
    expect(r[4].err).toEqual(['/home/learner/.ssh/config: line 12: Bad configuration option: frobnicate', '/home/learner/.ssh/config: terminating, 1 bad configuration options']);
    expect(r[5].err).toEqual(["Can't open user config file /nope: No such file or directory"]);
  });
});

describe('local forwarding (-L)', () => {
  it('listens on 127.0.0.1 in a background ssh; connections are opened from the server\'s side', () => {
    const r = laptop(`ssh -f -N ${A} -L 9090:127.0.0.1:8080 -J learner@bastion learner@db-01`, 'ss -tlnp sport = :9090', 'curl -s http://127.0.0.1:9090/', 'lsof -i :9090 -n -P').log;
    expect(r[0].out).toEqual([]);
    expect(r[1].out).toEqual(['State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process', 'LISTEN 0      128        127.0.0.1:9090      0.0.0.0:*    users:(("ssh",pid=981,fd=4))']);
    expect(r[2].out).toEqual(['db-01 admin']);
    expect(r[3].out[1]).toMatch(/^ssh\s+981 learner\s+4u\s+IPv4 .* TCP 127\.0\.0\.1:9090 \(LISTEN\)$/);
  });
  it('resolves the target on the server: db-01\'s 127.0.0.1 is not the bastion\'s; a refused target closes the connection', () => {
    const r = laptop(`ssh -f -N ${A} -L 8080:db-01:8080 learner@bastion`, 'curl -sS http://127.0.0.1:8080/', 'nc -zv 127.0.0.1 8080', `ssh -f -N ${A} -L 5433:db-01:5432 learner@bastion`, 'nc -zv 127.0.0.1 5433').log;
    expect(r[1].err).toEqual(['channel 2: open failed: connect failed: Connection refused', 'curl: (52) Empty reply from server']);
    expect(r[2].err).toEqual(['Connection to 127.0.0.1 8080 port [tcp/http-alt] succeeded!']);
  });
  it('closes when its ssh is killed; reports a taken or privileged port; -N needs -f here', () => {
    const r = laptop(`ssh -f -N ${A} -L 9090:127.0.0.1:8080 -J learner@bastion learner@db-01`, 'pkill -f "L 9090"', 'curl -sS http://127.0.0.1:9090/',
      `ssh -f -N ${A} -L 8000:db-01:5432 learner@bastion`, `ssh -f -N ${A} -L 80:db-01:5432 learner@bastion`, `ssh -N ${A} -L 9091:db-01:5432 learner@bastion`, `ssh -f ${A} learner@bastion`).log;
    expect(r[2].err).toEqual(['curl: (7) Failed to connect to 127.0.0.1 port 9090 after 0 ms: Couldn\'t connect to server']);
    expect(r[3].err.slice(-3)).toEqual(['bind [127.0.0.1]:8000: Address already in use', 'channel_setup_fwd_listener_tcpip: cannot listen to port: 8000', 'Could not request local forwarding.']);
    expect(r[4].err.slice(-3)).toEqual(['bind [127.0.0.1]:80: Permission denied', 'channel_setup_fwd_listener_tcpip: cannot listen to port: 80', 'Could not request local forwarding.']);
    expect(r[5].err).toEqual(['ssh：模擬環境的 ssh -N 會一直佔住這個終端機（要按 Ctrl-C 才結束）；請加 -f 讓它在背景執行：ssh -f -N …']);
    expect(r[6].err).toEqual(['Cannot fork into background without a command to execute.']);
  });
  it('-g (or a bind address) listens on every address; AllowTcpForwarding no refuses the channels', () => {
    const r = laptop(`ssh -f -N -g ${A} -L 9090:127.0.0.1:8080 -J learner@bastion learner@db-01`, 'ss -tln sport = :9090').log;
    expect(r[1].out[1]).toMatch(/^LISTEN 0\s+128\s+0\.0\.0\.0:9090/);
    const closed = withRemote({ ...bastion, files: [...bastion.files, sshdConfig('AllowTcpForwarding no')] });
    expect(known(closed, `ssh -f -N ${A} -L 5433:db-01:5432 learner@bastion`, 'curl -sS http://127.0.0.1:5433/').last.err).toEqual(['channel 2: open failed: administratively prohibited: open failed', 'curl: (52) Empty reply from server']);
  });
  it('LocalForward in ~/.ssh/config works the same', () => {
    const m: TerminalMachine = { ...tunnelLaptop, sshConfig: `${CONFIG.replace('Host *\n  User nobody\n', 'Host *\n  User learner\n')}\nHost db-admin\n  HostName 10.0.1.20\n  ProxyJump bastion\n  LocalForward 9090 127.0.0.1:8080\n` };
    expect(machineProblems(m)).toEqual([]);
    expect(session(m, 'ssh -f -N db-admin', 'curl -s http://127.0.0.1:9090/').last.out).toEqual(['db-01 admin']);
  });
});

describe('remote forwarding (-R)', () => {
  it('listens on the server\'s 127.0.0.1 (held by sshd) and brings connections back to the laptop', () => {
    const r = laptop(`ssh -f -N ${A} -R 9000:localhost:8000 learner@bastion`, 'ssh learner@bastion ss -tlnp sport = :9000', 'ssh learner@bastion curl -s http://127.0.0.1:9000/', 'ssh learner@bastion nc -zv 10.0.0.40 9000',
      'pkill -f "R 9000"', 'ssh learner@bastion ss -tln sport = :9000').log;
    expect(r[1].out[1]).toMatch(/^LISTEN 0\s+128\s+127\.0\.0\.1:9000\s+0\.0\.0\.0:\*\s+users:\(\("sshd",pid=\d+,fd=9\)\)$/);
    expect(r[2].out).toEqual(['laptop dev server']);
    expect(r[3].err.at(-1)).toBe('nc: connect to 10.0.0.40 port 9000 (tcp) failed: Connection refused');
    expect(r[5].out).toEqual(['State Recv-Q Send-Q Local Address:Port Peer Address:Port Process']);
  });
  it('honours GatewayPorts and AllowTcpForwarding on the server', () => {
    const open = withRemote({ ...bastion, files: [...bastion.files, sshdConfig('GatewayPorts yes')] });
    expect(known(open, `ssh -f -N ${A} -R 9000:localhost:8000 learner@bastion`, 'ssh learner@bastion ss -tln sport = :9000').last.out[1]).toMatch(/0\.0\.0\.0:9000/);
    const local = withRemote({ ...bastion, files: [...bastion.files, sshdConfig('AllowTcpForwarding local')] });
    expect(known(local, `ssh -f -N ${A} -R 9000:localhost:8000 learner@bastion`).last.err.at(-1)).toBe('Warning: remote port forwarding failed for listen port 9000');
    expect(machineProblems(withRemote({ ...bastion, files: [...bastion.files, sshdConfig('GatewayPorts maybe')] }))).toEqual(['machine laptop-2: remote bastion: sshd_config: /etc/ssh/sshd_config line 1: unsupported option "maybe".']);
  });
});

describe('lesson data and the tunnel check', () => {
  it('validates reachableFrom names', () => {
    expect(machineProblems(withRemote({ ...dbServer, reachableFrom: ['jumpbox'] }))).toEqual(['machine laptop-2: remote db-01: reachableFrom jumpbox is not another machine of the lesson']);
  });
  it('checks a tunnel: listening port, target and whether it works', () => {
    const x: TerminalExercise = {
      id: 't', title: 't', machine: tunnelLaptop.id, statement: '', explanation: 'x', hints: [],
      mistakes: [{ commands: [`ssh -f -N ${A} -L 9090:db-01:8080 learner@bastion`], why: 'db-01 only listens on its own loopback' }],
      checks: [{ kind: 'tunnel', port: 9090, target: '127.0.0.1:8080', works: true }, { kind: 'reach', from: 'laptop', to: 'db-01', port: 22, result: 'timeout' }],
      solution: [KNOW, `ssh -f -N ${A} -L 9090:127.0.0.1:8080 -J learner@bastion learner@db-01`],
    };
    expect(terminalContentProblems({ machines: [tunnelLaptop], examples: [], exercises: [x] })).toEqual([]);
    expect(checkTerminalExercise(x, [tunnelLaptop], x.mistakes[0].commands).results[0].message).toBe('9090 埠應該是轉送到 127.0.0.1:8080 的 SSH 通道，而且連得過去，但通道轉送到 db-01:8080');
  });
});
