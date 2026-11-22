import { describe, expect, it } from 'vitest';
import { type FsState } from '@/lib/terminal/fs';
import { DIAGNOSTICS_PROFILE, EDGE_PROFILE, PROXY_PROFILE, run, SCHEDULING_PROFILE, SCRIPTING_PROFILE, SERVICES_PROFILE, STREAMS_PROFILE, TUNNELS_PROFILE, type ShellProfile } from '@/lib/terminal/shell';
import { checkTerminalExercise, machineState, terminalContentProblems, type TerminalExercise, type TerminalFile, type TerminalMachine, type TerminalRemote } from '@/lib/terminal/lesson';
import { cronMachine, scriptMachine, svcMachine } from './support/terminal-fixture';
import { bastion, proxyMachine, tunnelLaptop } from './support/edge-fixture';
import { httpMachine } from './support/server-fixture';
import { diagLaptop } from './support/cdn-fixture';

/*
 * The fixes of the SRV-4 batch that lesson writers asked for (docs/curriculum/SRV0_SERVER_CAPABILITY.md §26), each from the
 * profile where its command exists: journalctl -g's smart case, ps START and STIME in local time on procps' same-day rule
 * and ps -o lstart, systemctl list-units --no-legend, a /etc/cron.d line without a user, set -u in arithmetic, grep -q,
 * upstream-only nginx directives in a location, sshd's PermitOpen, DisableForwarding and Match and ssh's
 * ExitOnForwardFailure, variants with upstream connections, accounts and packages, and output checks with fromCommand.
 */
function session(profile: ShellProfile, from: FsState | TerminalMachine, ...commands: string[]) {
  let state = 'files' in from ? machineState(from) : from;
  const log: { out: string[]; err: string[] }[] = [];
  for (const cmd of commands) {
    const r = run(state, cmd, profile);
    state = r.state;
    log.push({ out: r.lines.filter(l => l.kind === 'out').map(l => l.text), err: r.lines.filter(l => l.kind === 'err').map(l => l.text) });
  }
  return { state, log, last: log.at(-1)! };
}
const dir = (path: string, owner = 'root', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, mode = 0o644, owner = 'root'): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const streams: TerminalMachine = {
  id: 'text', title: 'text', user: 'learner', cwd: '/home/learner', profile: 'streams',
  files: [dir('/home'), dir('/home/learner', 'learner'), file('/home/learner/log.txt', 'GET /a 200\nGET /b 404\n', 0o644, 'learner')],
};

describe('journalctl -g', () => {
  it('is case-insensitive for a lowercase pattern and case-sensitive with an uppercase letter (smart case)', () => {
    const r = session(SERVICES_PROFILE, svcMachine, 'sudo journalctl -g "syn flooding" -o cat', 'sudo journalctl -g "SYN flooding" -o cat', 'sudo journalctl -g "Syn flooding" -o cat').log;
    expect(r[0].out).toEqual(['TCP: request_sock_TCP: Possible SYN flooding on port 80. Sending cookies.']);
    expect(r[1].out).toEqual(r[0].out);
    expect(r[2].out).toEqual(['-- No entries --']);
  });
});

describe('ps', () => {
  it('prints START in the machine\'s time zone (procps uses localtime) and lstart as ctime does', () => {
    const r = session(SCHEDULING_PROFILE, cronMachine, 'ps -o pid,start_time,lstart,stime -p 4321', 'ps aux').log;
    expect(r[0].out).toEqual(['    PID START                  STARTED STIME', '   4321 16:00 Sun Nov 22 16:00:00 2026 16:00']);
    expect(r[1].out[1]).toMatch(/^root {11}1 .* 16:00 /);
  });
});

describe('systemctl list-units --no-legend', () => {
  it('leaves out the header line, the legend and the count', () => {
    const r = session(SERVICES_PROFILE, svcMachine, 'systemctl list-units --type=service --no-legend', 'systemctl list-unit-files --no-legend').log;
    expect(r[0].out).toEqual(['  nginx.service    loaded active running A high performance web server and a reverse proxy server', '● report.service   loaded failed failed  Nightly report',
      '  stubborn.service loaded active running Legacy daemon']);
    expect(r[1].out[0]).toBe('api.service      disabled enabled');
    expect(r[1].out).toHaveLength(6);
  });
});

describe('cron', () => {
  it('rejects a /etc/cron.d line without a user field: the line is ignored and cron logs the error', () => {
    const m: TerminalMachine = { ...cronMachine, files: [...cronMachine.files, file('/etc/cron.d/report', '*/5 * * * * echo report\n0 4 * * * root /usr/sbin/logrotate /etc/logrotate.conf\n')] };
    const r = session(SCHEDULING_PROFILE, m, 'cron-next -l', 'sudo cron-run', 'sudo journalctl -u cron -o cat').log;
    expect(r[0].out.join('\n')).not.toContain('echo report');
    expect(r[0].out.join('\n')).toContain('/etc/cron.d/report');
    expect(r[2].out).toContain('Error: bad username; while reading /etc/cron.d/report');
    // A line whose first word is a real user is fine (the user field), as before.
    expect(session(SCHEDULING_PROFILE, cronMachine, 'cron-next -l').last.out.join('\n')).toContain('/usr/sbin/logrotate');
  });
});

describe('set -u', () => {
  it('also covers what an arithmetic expression reads, with bash\'s script: line N: message', () => {
    const m: TerminalMachine = { ...scriptMachine, files: [...scriptMachine.files, file('/home/learner/t.sh', '#!/bin/bash\nset -u\ntotal=$((count + 1))\necho "$total"\n', 0o755, 'learner')] };
    expect(session(SCRIPTING_PROFILE, m, './t.sh').last.err).toEqual(['./t.sh: line 3: count: unbound variable']);
    expect(session(SCRIPTING_PROFILE, scriptMachine, 'set -u; (( n++ ))').last.err).toEqual(['bash: n: unbound variable']);
    expect(session(SCRIPTING_PROFILE, scriptMachine, 'n=1; set -u; echo $((n + 1))').last.out).toEqual(['2']);
  });
});

describe('grep -q', () => {
  it('prints nothing and only sets the status (0 on a match, even after an error)', () => {
    expect(session(STREAMS_PROFILE, streams, 'grep -q 404 log.txt').last).toEqual({ out: [], err: [] });
    const r = session(SCRIPTING_PROFILE, scriptMachine, 'echo "GET /b 404" > l.txt', 'grep -q 404 l.txt; echo $?', 'grep -q 500 l.txt; echo $?', 'grep --quiet 404 missing l.txt; echo $?').log;
    expect(r.slice(1).map(x => x.out)).toEqual([['0'], ['1'], ['0']]);
    expect(r[3].err).toEqual(['grep: missing: No such file or directory']);
  });
});

describe('nginx', () => {
  it('refuses an upstream-only directive in a location as nginx does', () => {
    const m: TerminalMachine = { ...proxyMachine, nginx: 'stopped', files: proxyMachine.files.map(f => f.path === '/etc/nginx/sites-available/app' ? file(f.path, 'server {\n    listen 80;\n    location / {\n        least_conn;\n        proxy_pass http://127.0.0.1:3000;\n    }\n}\n') : f) };
    expect(session(PROXY_PROFILE, m, 'sudo nginx -t').last.err[0]).toBe('nginx: [emerg] "least_conn" directive is not allowed here in /etc/nginx/sites-enabled/app:4');
  });
});

describe('sshd and ssh forwarding', () => {
  const A = '-o StrictHostKeyChecking=accept-new';
  const sshdConfig = (text: string): TerminalFile => file('/etc/ssh/sshd_config', `${text}\n`);
  const withBastion = (text: string): TerminalMachine => ({ ...tunnelLaptop, remotes: tunnelLaptop.remotes!.map(x => x.host === 'bastion' ? { ...bastion, files: [...bastion.files, sshdConfig(text)] } as TerminalRemote : x) });
  const known = (m: TerminalMachine, ...commands: string[]) => {
    const r = session(TUNNELS_PROFILE, m, `ssh ${A} learner@bastion true`, ...commands);
    const log = r.log.map(x => ({ ...x, err: x.err.filter(l => !l.includes('password: （模擬環境')) }));
    return { ...r, log, last: log.at(-1)! };
  };
  it('PermitOpen allows only the listed targets for -L and -J', () => {
    const m = withBastion('PermitOpen db-01:22 db-01:8080');
    const r = known(m, `ssh -f -N ${A} -L 5433:db-01:5432 learner@bastion`, 'curl -sS http://127.0.0.1:5433/', `ssh -f -N ${A} -L 9090:db-01:8080 learner@bastion`, `ssh ${A} -J learner@bastion learner@db-01 hostname`).log;
    expect(r[2].err).toEqual(['channel 2: open failed: administratively prohibited: open failed', 'curl: (52) Empty reply from server']);
    expect(r[4].out).toEqual(['db-01']);
    expect(known(withBastion('PermitOpen none'), `ssh ${A} -J learner@bastion learner@db-01 hostname`).last.err).toEqual(['channel 0: open failed: administratively prohibited: open failed', 'stdio forwarding failed', 'Connection closed by UNKNOWN port 65535']);
  });
  it('DisableForwarding wins over AllowTcpForwarding, and Match User / Match Address override for the connections they match', () => {
    expect(known(withBastion('AllowTcpForwarding yes\nDisableForwarding yes'), `ssh ${A} -J learner@bastion learner@db-01 hostname`).last.err[0]).toBe('channel 0: open failed: administratively prohibited: open failed');
    expect(known(withBastion('AllowTcpForwarding no\nMatch User learner\n  AllowTcpForwarding yes'), `ssh ${A} -J learner@bastion learner@db-01 hostname`).last.out).toEqual(['db-01']);
    expect(known(withBastion('AllowTcpForwarding no\nMatch User admin\n  AllowTcpForwarding yes'), `ssh ${A} -J learner@bastion learner@db-01 hostname`).last.err[0]).toBe('channel 0: open failed: administratively prohibited: open failed');
    expect(known(withBastion('Match Address 10.0.0.0/24\n  AllowTcpForwarding no'), `ssh ${A} -J learner@bastion learner@db-01 hostname`).last.err[0]).toBe('channel 0: open failed: administratively prohibited: open failed');
    expect(terminalContentProblems({ machines: [withBastion('Match User learner\n  Port 2222')], examples: [], exercises: [] }).join('\n')).toContain('/etc/ssh/sshd_config line 2: Directive \'Port\' is not allowed within a Match block');
  });
  it('ExitOnForwardFailure turns a forward that cannot be set up into an error (status 255)', () => {
    const r = known(withBastion('AllowTcpForwarding local'), `ssh ${A} -R 9000:localhost:8000 learner@bastion true`, `ssh ${A} -o ExitOnForwardFailure=yes -R 9000:localhost:8000 learner@bastion true; echo $?`).log;
    expect(r[1].err).toEqual(['Warning: remote port forwarding failed for listen port 9000']);
    expect(r[2]).toEqual({ out: ['255'], err: ['Error: remote port forwarding failed for listen port 9000'] });
    const busy = known(tunnelLaptop, `ssh -f -N ${A} -o ExitOnForwardFailure=yes -L 8000:db-01:5432 learner@bastion; echo $?`).last;
    expect(busy).toEqual({ out: ['255'], err: ['bind [127.0.0.1]:8000: Address already in use', 'channel_setup_fwd_listener_tcpip: cannot listen to port: 8000', 'Could not request local forwarding.'] });
  });
  it('the tunnels profile only: below it PermitOpen is still a bad option', () => {
    const below: TerminalMachine = { ...withBastion('PermitOpen db-01:22'), profile: 'firewall', remotes: [{ ...bastion, files: [...bastion.files, sshdConfig('PermitOpen db-01:22')] }] };
    expect(terminalContentProblems({ machines: [below], examples: [], exercises: [] }).join('\n')).toContain('Bad configuration option: PermitOpen');
  });
});

describe('lesson data', () => {
  it('variants may change upstream connections (least_conn), accounts and packages; an output check may require a real command', () => {
    const site = 'upstream backend {\n    least_conn;\n    server 10.0.0.21:8080;\n    server 10.0.0.22:8080;\n}\nserver {\n    listen 80 default_server;\n    location / { proxy_pass http://backend; }\n}\n';
    const m: TerminalMachine = { ...proxyMachine, files: proxyMachine.files.map(f => f.path === '/etc/nginx/sites-available/app' ? file(f.path, site) : f), upstreamConnections: [{ upstream: 'backend', server: '10.0.0.21:8080', connections: 9 }] };
    const exercise: TerminalExercise = {
      id: 'least', title: '哪一台接到請求', machine: 'web-06', statement: '找出下一個請求由哪一台後端回答。', checks: [{ kind: 'output', fromCommand: '^curl ' }],
      solution: ['curl -s http://localhost/'], mistakes: [{ commands: ['echo app-02'], why: '猜的答案' }],
      variants: [{ label: '另一台比較忙', files: [], upstreamConnections: [{ upstream: 'backend', server: '10.0.0.22:8080', connections: 9 }] }],
      hints: ['least_conn'], explanation: 'least_conn 選連線數少的那台。',
    };
    expect(terminalContentProblems({ machines: [m], examples: [], exercises: [exercise] })).toEqual([]);
    expect(checkTerminalExercise(exercise, [m], ['curl -s http://localhost/']).ok).toBe(true);
    // The right answer typed with echo does not pass (on the machine it prints what curl would).
    const typed = checkTerminalExercise({ ...exercise, variants: [] }, [m], ['echo app-02']);
    expect(typed.results[0]).toMatchObject({ ok: false, message: '應該有一個指令（實際檢查的指令）印出題目要的輸出，但印出這個輸出的指令不是實際檢查的指令（請用指令查出答案，不要直接打出來）' });
    expect(terminalContentProblems({ machines: [m], examples: [], exercises: [{ ...exercise, checks: [{ kind: 'output', fromCommand: '(' }] }] }).join('\n')).toContain('fromCommand is not a regular expression');
    const low = { ...exercise, variants: [{ label: 'x', files: [], upstreamConnections: [] }] };
    expect(terminalContentProblems({ machines: [{ ...streams, id: 'web-06' }], examples: [], exercises: [{ ...low, checks: [{ kind: 'output' }] }] }).join('\n')).toContain('upstreamConnections needs the proxy profile');
  });
});

// Found by the SRV12 writer (SRV-4 integration).
describe('curl -w time_namelookup', () => {
  it('is a query the first time and the resolver cache after that, as dig shows 24 msec then 0 msec', () => {
    const m: TerminalMachine = { ...httpMachine, profile: 'edge' };
    const w = 'curl -s -o /dev/null -w "%{time_namelookup}" http://legacy.example.org/';
    const r = session(EDGE_PROFILE, m, w, w, 'dig legacy.example.org').log;
    expect([r[0].out, r[1].out]).toEqual([['0.024300'], ['0.000450']]);
    expect(r[2].out).toContain(';; Query time: 0 msec');
  });
});

describe('tcpdump filter precedence', () => {
  it('gives and and or the same precedence and groups from the left, as pcap-filter does', () => {
    const f = (e: string) => `tcpdump -nn -t -r /var/tmp/web.pcap '${e}'`;
    const r = session(DIAGNOSTICS_PROFILE, diagLaptop, f('port 53 or port 80 and src host 10.0.0.12'), f('(port 53 or port 80) and src host 10.0.0.12'), f('port 53 or (port 80 and src host 10.0.0.12)')).log;
    expect(r[0].out).toEqual(r[1].out);
    expect(r[0].out.some(l => l.includes('.53:') || l.includes('.53 >'))).toBe(false);
    expect(r[2].out.filter(l => l.includes('A?')).length).toBe(1);
  });
});
