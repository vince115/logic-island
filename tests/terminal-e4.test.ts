import { describe, expect, it } from 'vitest';
import { initialState, type FsState } from '@/lib/terminal/fs';
import { dateText, parseSpan, parseTime, parseWhen, relativeText, startLabel, uptimeText } from '@/lib/terminal/clock';
import { SYSTEM_MANUAL } from '@/lib/terminal/manual';
import { commOf, deliver, parseSignal } from '@/lib/terminal/processes';
import { E4_COMMANDS, E5_COMMANDS, E6_COMMANDS, FILES_PROFILE, PROCESSES_PROFILE, run, STREAMS_PROFILE, USERS_PROFILE } from '@/lib/terminal/shell';
import { checkTerminalExercise, describeCheck, machineProblems, machineState, profileOf, terminalContentProblems, type TerminalLessonContent, type TerminalMachine } from '@/lib/terminal/lesson';
import { hogExercise, procContent, procMachine, usersMachine } from './support/terminal-fixture';

/*
 * Engine stage E4 (docs/curriculum/LNX0_TERMINAL_CAPABILITY.md §12): the processes profile — the fixed clock, ps, top,
 * kill and the signals (with the reactions a process declares), pgrep, pidof, pkill, background jobs, and the exit
 * status ($?). The lower profiles are unchanged.
 */
function session(from: FsState | TerminalMachine, ...commands: string[]) {
  let state = 'files' in from ? machineState(from) : from;
  const log: { out: string[]; err: string[] }[] = [];
  for (const cmd of commands) {
    const r = run(state, cmd, PROCESSES_PROFILE);
    state = r.state;
    log.push({ out: r.lines.filter(l => l.kind === 'out').map(l => l.text), err: r.lines.filter(l => l.kind === 'err').map(l => l.text) });
  }
  return { state, log, last: log.at(-1)! };
}
const app = (...commands: string[]) => session(procMachine, ...commands);
const out = (...commands: string[]) => app(...commands).last.out;
const err = (...commands: string[]) => app(...commands).last.err;
/** The exit status after the commands. */
const status = (...commands: string[]) => app(...commands).state.status;
const pids = (s: FsState) => (s.processes ?? []).map(p => p.pid);
const TRY = (cmd: string) => `Try '${cmd} --help' for more information.`;
const problems = (edit: (c: TerminalLessonContent) => void) => { const c = procContent(); edit(c); return terminalContentProblems(c).join('\n'); };

describe('the processes profile', () => {
  it('is the users profile plus the E4 commands and the processes feature', () => {
    expect([...PROCESSES_PROFILE.commands].sort()).toEqual([...USERS_PROFILE.commands, ...E4_COMMANDS].sort());
    expect(PROCESSES_PROFILE.features).toEqual([...USERS_PROFILE.features!, 'processes']);
    expect(PROCESSES_PROFILE.commands.slice(-3)).toEqual(['man', 'clear', 'help']);
    expect(profileOf(procMachine)).toBe(PROCESSES_PROFILE);
    expect(Object.keys(SYSTEM_MANUAL).sort()).toEqual([...E4_COMMANDS, ...E5_COMMANDS, ...E6_COMMANDS].sort());
  });
  it('keeps every E4 command, $? and & away from the lower profiles', () => {
    for (const cmd of E4_COMMANDS) {
      for (const profile of [undefined, FILES_PROFILE, STREAMS_PROFILE, USERS_PROFILE]) {
        expect(run(initialState(), `${cmd} 1`, profile).lines[0].text, `${cmd} ${profile?.id}`).toMatch(new RegExp(`^bash: ${cmd}: command not found`));
      }
    }
    expect(run(initialState(), 'echo $?', USERS_PROFILE).lines[0].text).toMatch(/^此模擬器不支援指令串接、變數、命令替換與背景執行/);
    expect(run(initialState(), 'ls &', STREAMS_PROFILE).lines[0].text).toMatch(/^此模擬器不支援/);
    expect(run(initialState(), 'echo $?').lines[0].text).toMatch(/^此模擬器不支援管線/);
    // The users profile's states carry no exit status (they are unchanged by E4).
    expect(run(machineState(usersMachine), 'ls nope', USERS_PROFILE).state.status).toBeUndefined();
    expect(run(machineState(usersMachine), 'sudo ps', USERS_PROFILE).lines[0].text).toBe('sudo: ps: command not found');
  });
  it('has a manual page and --help for every E4 command', () => {
    for (const cmd of E4_COMMANDS) {
      expect(out(`man ${cmd}`)[0], cmd).toBe(`${cmd.toUpperCase()}(1)        User Commands        ${cmd.toUpperCase()}(1)`);
      expect(out(`${cmd} --help`)[0], cmd).toBe(`用法：${SYSTEM_MANUAL[cmd].usage}`);
    }
    expect(out('help').join('\n')).toMatch(/kill \[-訊號\] PID\|%工作/);
  });
});

describe('the fixed clock', () => {
  it('parses and prints times without the host clock or time zone', () => {
    const now = parseTime('2026-11-22 10:00:00')!;
    expect(parseTime('2026-02-30 10:00:00')).toBeUndefined();
    expect(parseTime('2026-11-22 24:00:00')).toBeUndefined();
    expect(parseTime('2026-11-22')).toBe(now - 36000);
    expect(dateText(now)).toBe('Sun Nov 22 10:00:00 UTC 2026');
    expect(dateText(parseTime('2026-12-02 08:05:09')!)).toBe('Wed Dec  2 08:05:09 UTC 2026');
    expect(uptimeText(2 * 86400 + 5400)).toBe('2 days,  1:30,');
    expect(uptimeText(86400 + 240)).toBe('1 day, 4 min,');
    expect(uptimeText(3 * 3600 + 600)).toBe(' 3:10,');
    expect(startLabel(now - 3600, now)).toBe('09:00');
    expect(startLabel(now - 2 * 86400, now)).toBe('Nov20');
    expect(startLabel(parseTime('2025-12-31 23:00:00')!, now)).toBe('2025');
  });
  it('writes relative times like systemd', () => {
    expect([0, 5, 65, 300, 3600 + 240, 7 * 3600, 26 * 3600, 3 * 86400, 9 * 86400].map(relativeText))
      .toEqual(['now', '5s ago', '1min 5s ago', '5min ago', '1h 4min ago', '7h ago', '1 day 2h ago', '3 days ago', '1 weeks 2 days ago']);
  });
  it('resolves --since words against the machine\'s now', () => {
    const now = parseTime('2026-11-22 10:00:00')!;
    expect(parseWhen('now', now)).toBe(now);
    expect(parseWhen('today', now)).toBe(parseTime('2026-11-22'));
    expect(parseWhen('yesterday', now)).toBe(parseTime('2026-11-21'));
    expect(parseWhen('09:30', now)).toBe(parseTime('2026-11-22 09:30:00'));
    expect(parseWhen('-1h', now)).toBe(now - 3600);
    expect(parseWhen('1 hour ago', now)).toBe(now - 3600);
    expect(parseWhen('1h 30min ago', now)).toBe(now - 5400);
    expect(parseWhen('+5min', now)).toBe(now + 300);
    for (const bad of ['1h', 'soon', '25:00', '-1 parsec', '1h ago ago']) expect(parseWhen(bad, now), bad).toBeUndefined();
    expect([parseSpan('5'), parseSpan('100ms'), parseSpan('1min 30s'), parseSpan('2x')]).toEqual([5, 0.1, 90, undefined]);
  });
  it('prints date and uptime from the machine', () => {
    expect(out('date')).toEqual(['Sun Nov 22 10:00:00 UTC 2026']);
    expect(out('uptime')).toEqual([' 10:00:00 up 2 days,  1:30,  1 user,  load average: 1.12, 0.85, 0.60']);
    expect(err('date +%F')).toEqual(['date: 模擬環境的 date 只顯示機器固定的時間（不接受格式與設定）']);
    expect(err('uptime -p')).toEqual(["uptime: invalid option -- 'p'", TRY('uptime')]);
  });
});

describe('ps', () => {
  it('lists the session\'s processes by default, with ps itself', () => {
    expect(out('ps')).toEqual(['    PID TTY          TIME CMD', '   1001 pts/0    00:00:00 bash', '   1050 pts/0    00:00:00 vim', '   1051 pts/0    00:00:00 ps']);
  });
  it('prints the BSD user format of aux like procps-ng', () => {
    expect(out('ps aux')).toEqual([
      'USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND',
      'root           1  0.0  0.3 167744 11904 ?        Ss   Nov20   0:05 /sbin/init',
      'root           2  0.0  0.0      0     0 ?        S    Nov20   0:00 [kthreadd]',
      'root         512  0.0  0.1   6696  2816 ?        Ss   Nov20   0:00 /usr/sbin/cron -f',
      'alice        701 97.5 12.5 612000 524288 pts/1    R    08:15 102:03 python3 report.py',
      'learner      812  3.2  2.3 1032000 98304 ?        Sl   23:10  12:34 /usr/bin/node server.js',
      'learner      900  0.0  0.5  31000 20480 ?        S    09:40   0:01 python3 stuck.py',
      'learner     1001  0.0  0.1   8960  5120 pts/0    Ss   09:55   0:00 -bash',
      'learner     1050  0.0  0.2  21000  9216 pts/0    S+   09:58   0:00 vim notes.txt',
      'learner     1051  0.0  0.1   9120  3840 pts/0    R+   10:00   0:00 ps aux',
    ]);
    expect(out('ps ux')).toHaveLength(6);
  });
  it('prints the Unix full format, users, pids, chosen fields and sort orders', () => {
    expect(out('ps -ef').slice(0, 2)).toEqual(['UID          PID    PPID  C STIME TTY          TIME CMD', 'root           1       0  0 Nov20 ?        00:00:05 /sbin/init']);
    expect(out('ps -ef')[4]).toBe('alice        701       1 97 08:15 pts/1    01:42:03 python3 report.py');
    expect(out('ps -u alice')).toEqual(['    PID TTY          TIME CMD', '    701 pts/1    01:42:03 python3']);
    expect(out('ps -p 812,900 -o pid,ppid,user,stat,ni,%cpu,%mem,comm')).toEqual(['    PID    PPID USER     STAT  NI %CPU %MEM COMMAND', '    812       1 learner  Sl     0  3.2  2.3 node', '    900       1 learner  S      0  0.0  0.5 python3']);
    expect(out('ps -eo pid,%mem,comm --sort=-%mem | head -n 3')).toEqual(['    PID %MEM COMMAND', '    701 12.5 python3', '    812  2.3 node']);
    expect(out('ps -eo pid --sort -%cpu | head -n 2')).toEqual(['    PID', '    701']);
    expect(out('ps -eo user,pid --sort=user,-pid | head -n 2')).toEqual(['USER         PID', 'alice        701']);
  });
  it('shows the commands of the same line, like the grep of ps aux | grep', () => {
    expect(out('ps aux | grep python')).toEqual([
      'alice        701 97.5 12.5 612000 524288 pts/1    R    08:15 102:03 python3 report.py',
      'learner      900  0.0  0.5  31000 20480 ?        S    09:40   0:01 python3 stuck.py',
      'learner     1052  0.0  0.1   9120  3840 pts/0    S+   10:00   0:00 grep python',
    ]);
    expect(app('ps aux | grep python').state.processes).toHaveLength(8);
  });
  it('prints procps\' errors and exit statuses', () => {
    const usage = ['', 'Usage:', ' ps [options]', '', " Try 'ps --help <simple|list|output|threads|misc|all>'", "  or 'ps --help <s|l|o|t|m|a>'", ' for additional help text.', '', 'For more details see ps(1).'];
    expect(err('ps -o foo')).toEqual(['error: unknown user-defined format specifier "foo"', ...usage]);
    expect(err('ps axz')).toEqual(['error: unsupported option (BSD syntax)', ...usage]);
    expect(err('ps -p abc')).toEqual(['error: process ID list syntax error', ...usage]);
    expect(err('ps -u bob')).toEqual(['error: user name does not exist', ...usage]);
    expect(err('ps -Z')).toEqual(['error: unsupported SysV option', ...usage]);
    expect(err('ps ax')[0]).toMatch(/^ps: 模擬環境的 BSD 格式只支援 u/);
    expect(err('ps --sort=size')).toEqual(['error: unknown sort specifier "size"']);
    expect(out('ps -p 4242')).toEqual(['    PID TTY          TIME CMD']);
    expect(status('ps -p 4242')).toBe(1);
    expect(status('ps -p 812')).toBe(0);
  });
});

describe('top', () => {
  it('prints one batch snapshot with a header computed from the machine', () => {
    expect(out('top -b -n 1')).toEqual([
      'top - 10:00:00 up 2 days,  1:30,  1 user,  load average: 1.12, 0.85, 0.60',
      'Tasks:   8 total,   1 running,   7 sleeping,   0 stopped,   0 zombie',
      '%Cpu(s): 50.4 us,  0.0 sy,  0.0 ni, 49.6 id,  0.0 wa,  0.0 hi,  0.0 si,  0.0 st',
      'MiB Mem :   4096.0 total,   2415.6 free,    656.4 used,   1024.0 buff/cache',
      'MiB Swap:      0.0 total,      0.0 free,      0.0 used.   3439.6 avail Mem',
      '',
      '    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND',
      '    701 alice     20   0  612000 524288      0 R  97.5  12.5 102:03.45 python3',
      '    812 learner   20   0 1032000  98304      0 S   3.2   2.3  12:34.50 node',
      '      1 root      20   0  167744  11904      0 S   0.0   0.3   0:05.00 init',
      '      2 root      20   0       0      0      0 S   0.0   0.0   0:00.00 kthreadd',
      '    512 root      20   0    6696   2816      0 S   0.0   0.1   0:00.00 cron',
      '    900 learner   20   0   31000  20480      0 S   0.0   0.5   0:01.00 python3',
      '   1001 learner   20   0    8960   5120      0 S   0.0   0.1   0:00.00 bash',
      '   1050 learner   20   0   21000   9216      0 S   0.0   0.2   0:00.00 vim',
    ]);
  });
  it('sorts by another field, filters a user and shows full commands', () => {
    expect(out('top -bn1 -o %MEM -u learner -c').slice(7)).toEqual([
      '    812 learner   20   0 1032000  98304      0 S   3.2   2.3  12:34.50 /usr/bin/node server.js',
      '    900 learner   20   0   31000  20480      0 S   0.0   0.5   0:01.00 python3 stuck.py',
      '   1050 learner   20   0   21000   9216      0 S   0.0   0.2   0:00.00 vim notes.txt',
      '   1001 learner   20   0    8960   5120      0 S   0.0   0.1   0:00.00 -bash',
    ]);
  });
  it('refuses the interactive screen and bad fields', () => {
    expect(err('top')).toEqual(['top: 模擬環境沒有會更新的全螢幕畫面：請用 top -b -n 1 取得一次快照']);
    expect(err('top -b -n 3')).toEqual(['top: 模擬環境沒有會更新的全螢幕畫面：請用 top -b -n 1 取得一次快照']);
    expect(err('top -b -n 1 -o SIZE')).toEqual(["top: unrecognized field name 'SIZE'"]);
    expect(err('top -b -n 1 -u bob')).toEqual(['top: Invalid user']);
  });
});

describe('kill and signals', () => {
  it('sends SIGTERM by default: a process that exits is gone, one that ignores it stays until SIGKILL', () => {
    const r = app('kill 812', 'kill 900', 'echo $?');
    expect(r.log.map(l => l.err)).toEqual([[], [], []]);
    expect(pids(r.state)).not.toContain(812);
    expect(pids(r.state)).toContain(900);
    expect(r.last.out).toEqual(['0']);
    expect(pids(app('kill -9 900').state)).not.toContain(900);
    for (const form of ['kill -KILL 900', 'kill -SIGKILL 900', 'kill -s KILL 900', 'kill -n 9 900', 'kill -s sigkill 900']) expect(pids(app(form).state), form).not.toContain(900);
  });
  it('lets only the owner or root signal a process', () => {
    expect(err('kill 701')).toEqual(['bash: kill: (701) - Operation not permitted']);
    expect(status('kill 701')).toBe(1);
    expect(pids(app('kill 701').state)).toContain(701);
    expect(app('sudo kill 701').last.err).toEqual([]);
    expect(pids(app('sudo kill 701').state)).not.toContain(701);
    expect(err('sudo kill 4242')).toEqual(['kill: (4242): No such process']);
    expect(err('kill 4242')).toEqual(['bash: kill: (4242) - No such process']);
    // Each operand on its own: the failure does not stop the others.
    const both = app('kill 701 812');
    expect(both.last.err).toEqual(['bash: kill: (701) - Operation not permitted']);
    expect(pids(both.state)).not.toContain(812);
  });
  it('does not affect pid 1, kernel threads or zombies', () => {
    const r = app('sudo kill -9 1 2');
    expect(r.last.err).toEqual([]);
    expect(pids(r.state)).toEqual(expect.arrayContaining([1, 2]));
    const zombie: TerminalMachine = { ...procMachine, processes: [...procMachine.processes!, { pid: 1060, ppid: 812, user: 'learner', command: '[node] <defunct>', stat: 'Z' }] };
    const z = session(zombie, 'kill -9 1060');
    expect(pids(z.state)).toContain(1060);
    // Its parent ending reaps it.
    expect(pids(session(zombie, 'kill 812').state)).not.toContain(1060);
  });
  it('stops and continues; a terminating signal waits until the process continues', () => {
    expect(out('kill -STOP 812', 'ps -p 812 -o stat')).toEqual(['STAT', 'Tl']);
    expect(out('kill -STOP 812', 'kill -CONT 812', 'ps -p 812 -o stat')).toEqual(['STAT', 'Sl']);
    const pending = app('kill -STOP 812', 'kill 812');
    expect(pids(pending.state)).toContain(812);
    expect(pids(session(pending.state, 'kill -CONT 812').state)).not.toContain(812);
    // SIGKILL ends even a stopped process.
    expect(pids(app('kill -STOP 812', 'kill -9 812').state)).not.toContain(812);
  });
  it('follows the declared reactions to SIGHUP and SIGINT', () => {
    const hup: TerminalMachine = { ...procMachine, processes: procMachine.processes!.map(p => p.pid === 812 ? { ...p, hup: 'reload' as const, int: 'ignore' as const } : p) };
    expect(pids(session(hup, 'kill -HUP 812', 'kill -INT 812').state)).toContain(812);
    expect(pids(app('kill -1 812').state)).not.toContain(812);
    expect(pids(app('kill -USR1 812').state)).not.toContain(812);
    expect(pids(app('kill -WINCH 812').state)).toContain(812);
    expect(pids(app('kill -0 812').state)).toContain(812);
  });
  it('gives orphans to pid 1', () => {
    const shell: TerminalMachine = { ...procMachine, processes: procMachine.processes!.map(p => p.pid === 1001 ? { ...p, command: 'bash' } : p) };
    const r = session(shell, 'kill -9 1001');
    expect(r.state.processes!.find(p => p.pid === 1050)?.ppid).toBe(1);
  });
  it('lists and translates signals, and prints bash\'s errors', () => {
    expect(out('kill -l')).toEqual([
      ' 1) SIGHUP\t 2) SIGINT\t 3) SIGQUIT\t 4) SIGILL\t 5) SIGTRAP', ' 6) SIGABRT\t 7) SIGBUS\t 8) SIGFPE\t 9) SIGKILL\t10) SIGUSR1',
      '11) SIGSEGV\t12) SIGUSR2\t13) SIGPIPE\t14) SIGALRM\t15) SIGTERM', '16) SIGSTKFLT\t17) SIGCHLD\t18) SIGCONT\t19) SIGSTOP\t20) SIGTSTP',
      '21) SIGTTIN\t22) SIGTTOU\t23) SIGURG\t24) SIGXCPU\t25) SIGXFSZ', '26) SIGVTALRM\t27) SIGPROF\t28) SIGWINCH\t29) SIGIO\t30) SIGPWR', '31) SIGSYS',
    ]);
    expect(out('kill -l 9 TERM 137')).toEqual(['KILL', '15', 'KILL']);
    expect(err('kill -FOO 812')).toEqual(['bash: kill: FOO: invalid signal specification']);
    expect(err('kill abc')).toEqual(['bash: kill: abc: arguments must be process or job IDs']);
    expect(err('kill')).toEqual(['kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]']);
    expect(status('kill')).toBe(2);
    expect(err('kill -9')).toEqual(['kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]']);
    expect([parseSignal('9'), parseSignal('sigterm'), parseSignal('HUP'), parseSignal('99'), parseSignal('NOPE')]).toEqual([9, 15, 1, undefined, undefined]);
    expect([commOf('-bash'), commOf('[kworker/0:1]'), commOf('nginx: worker process'), commOf('/usr/lib/systemd/systemd-journald')]).toEqual(['bash', 'kworker/0:1', 'nginx', 'systemd-journal']);
  });
  it('never changes the state it is given', () => {
    const start = machineState(procMachine), copy = structuredClone(start);
    deliver(start, [812, 900], 9);
    run(start, 'kill -9 812', PROCESSES_PROFILE);
    run(start, 'sleep 30 &', PROCESSES_PROFILE);
    expect(start).toEqual(copy);
  });
});

describe('pgrep, pidof and pkill', () => {
  it('find processes by name or command line', () => {
    expect(out('pgrep python')).toEqual(['701', '900']);
    expect(out('pgrep -l python')).toEqual(['701 python3', '900 python3']);
    expect(out('pgrep -a -u learner python')).toEqual(['900 python3 stuck.py']);
    expect(out('pgrep -f stuck')).toEqual(['900']);
    expect(out('pgrep stuck')).toEqual([]);
    expect(status('pgrep stuck')).toBe(1);
    expect(out('pgrep -x pyth')).toEqual([]);
    expect(out('pgrep -n python')).toEqual(['900']);
    expect(out('pidof python3 node')).toEqual(['900 812 701']);
    expect(status('pidof nope')).toBe(1);
    expect(err('pgrep')).toEqual(['pgrep: no matching criteria specified', "Try `pgrep --help' for more information."]);
    expect(status('pgrep')).toBe(2);
  });
  it('pkill signals what matches, with the same permission rule', () => {
    const r = app('pkill python3');
    expect(r.last.err).toEqual(['pkill: killing pid 701 failed: Operation not permitted']);
    expect(pids(r.state)).toContain(900);
    expect(pids(app('pkill -9 -f stuck').state)).not.toContain(900);
    expect(pids(app('pkill -KILL -u learner python3').state)).toEqual(expect.not.arrayContaining([900]));
    expect(status('pkill nothing-like-this')).toBe(1);
  });
});

describe('background jobs', () => {
  it('runs sleep in the background as a job with the next pid', () => {
    const r = app('sleep 300 &', 'jobs', 'jobs -l', 'ps');
    expect(r.log[0].out).toEqual(['[1] 1051']);
    expect(r.log[1].out).toEqual(['[1]+  Running                 sleep 300 &']);
    expect(r.log[2].out).toEqual(['[1]+  1051 Running                 sleep 300 &']);
    expect(r.last.out).toContain('   1051 pts/0    00:00:00 sleep');
    expect(r.state.processes!.find(p => p.pid === 1051)).toMatchObject({ ppid: 1001, user: 'learner', tty: 'pts/0', command: 'sleep 300' });
  });
  it('reports the end of a job killed by a signal, and marks the current and previous job', () => {
    expect(out('sleep 300 &', 'sleep 600 &', 'jobs')).toEqual(['[1]-  Running                 sleep 300 &', '[2]+  Running                 sleep 600 &']);
    expect(out('sleep 300 &', 'kill %1')).toEqual(['[1]+  Terminated              sleep 300']);
    expect(out('sleep 300 &', 'kill -9 1051')).toEqual(['[1]+  Killed                  sleep 300']);
    expect(out('sleep 300 &', 'kill -STOP %1', 'jobs')).toEqual(['[1]+  Stopped                 sleep 300']);
    // kill %1 continues a stopped job so that SIGTERM can end it.
    expect(app('sleep 300 &', 'kill -STOP %1', 'kill %1').state.jobs).toEqual([]);
    expect(err('kill %2')).toEqual(['bash: kill: %2: no such job']);
  });
  it('fg brings a job to the foreground, where sleep returns at once; bg continues a stopped job', () => {
    const r = app('sleep 300 &', 'fg', 'echo $?', 'jobs');
    expect(r.log[1].out).toEqual(['sleep 300']);
    expect(r.log[2].out).toEqual(['0']);
    expect(r.last.out).toEqual([]);
    expect(out('sleep 300 &', 'kill -STOP %1', 'bg %1')).toEqual(['[1]+ sleep 300 &']);
    expect(err('sleep 300 &', 'bg')).toEqual(['bash: bg: job 1 already in background']);
    expect(err('fg')).toEqual(['bash: fg: current: no such job']);
    expect(err('fg %3')).toEqual(['bash: fg: %3: no such job']);
    expect(err('sudo fg')).toEqual(['sudo: fg: command not found']);
  });
  it('only backgrounds sleep, and sleep checks its operand', () => {
    expect(err('ls &')).toEqual(['bash: 模擬環境的背景執行（&）只支援 sleep，例如 sleep 300 &']);
    expect(err('sleep 1 && ls')[0]).toMatch(/^此模擬器不支援指令串接/);
    expect(err('&')).toEqual(['bash: syntax error near unexpected token `&\'']);
    expect(err('sleep x &')).toEqual(["sleep: invalid time interval 'x'", TRY('sleep')]);
    expect(err('sleep')).toEqual(['sleep: missing operand', TRY('sleep')]);
    expect(app('sleep 5').last).toEqual({ out: [], err: [] });
    expect(app('sleep 5').state.processes).toHaveLength(8);
  });
});

describe('the exit status', () => {
  it('replaces exactly $? (not inside single quotes) and refuses any other $', () => {
    expect(out('ls nope', 'echo $? "$?" \'$?\'')).toEqual(['2 2 $?']);
    expect(err('echo $HOME')[0]).toMatch(/^此模擬器不支援指令串接、變數（\$\? 以外）/);
    expect(out('echo $?')).toEqual(['0']);
  });
  it('follows bash and the commands: 0, 1, 2, 126, 127', () => {
    const cases: [string[], number][] = [
      [['echo ok'], 0], [['cat nope'], 1], [['ls nope'], 2], [['grep todo notes.txt'], 0], [['grep zzz notes.txt'], 1], [['grep x nope'], 2], [['grep'], 2],
      [['sort nope'], 2], [['nosuch'], 127], [['./run.sh'], 126], [['./nope.sh'], 127], [['/home'], 126], [['man nope'], 16], [['echo "x'], 2], [['ls |'], 2],
      [['ls > /nope/x'], 1], [['cat nope | wc -l'], 0], [['cd /root'], 1], [['sudo cat nope'], 1], [['id bob'], 1],
    ];
    for (const [commands, want] of cases) expect(status(...commands), commands.join('; ')).toBe(want);
    expect(err('./run.sh')).toEqual(['bash: ./run.sh: Permission denied']);
    expect(err('/home')).toEqual(['bash: /home: Is a directory']);
    expect(err('chmod +x run.sh', './run.sh')).toEqual(['bash: ./run.sh: 模擬環境不執行程式檔（指令稿的直譯在之後的引擎階段）']);
    // An empty line keeps the status.
    const kept = app('ls nope', '');
    expect(kept.state.status).toBe(2);
  });
});

describe('processes machines in lessons', () => {
  it('builds the clock and the table with defaults', () => {
    const s = machineState(procMachine);
    expect(s.clock).toEqual({ now: parseTime('2026-11-22 10:00:00'), boot: parseTime('2026-11-20 08:30:00'), load: [1.12, 0.85, 0.6], cpus: 2, memory: { total: 4096, cache: 1024, swap: 0 } });
    expect(s.status).toBe(0);
    expect(s.lastPid).toBe(1050);
    expect(s.processes!.find(p => p.pid === 512)).toEqual({ pid: 512, ppid: 1, user: 'root', command: '/usr/sbin/cron -f', stat: 'Ss', cpu: 0, rss: 2816, vsz: 6696, shr: 0, tty: '?', start: parseTime('2026-11-20 08:30:00'), time: 0, nice: 0 });
    const bare = machineState({ ...procMachine, now: undefined, boot: undefined, load: undefined, cpus: undefined, memory: undefined });
    expect(bare.clock).toMatchObject({ now: parseTime('2026-11-22 10:00:00'), boot: parseTime('2026-11-21 10:00:00'), cpus: 1, memory: { total: 2048, cache: 512, swap: 0 } });
  });
  it('validates every new field and keeps it to the processes profile', () => {
    const p = (m: Partial<TerminalMachine>) => machineProblems({ ...procMachine, ...m }).join('\n');
    expect(machineProblems(procMachine)).toEqual([]);
    expect(p({ profile: 'users' })).toMatch(/now needs the processes profile \(engine stage E4\)[\s\S]*processes need the processes profile/);
    expect(p({ now: '2026-13-01 00:00:00' })).toMatch(/now must be a date and time/);
    expect(p({ boot: '2026-11-23 00:00:00' })).toMatch(/boot must not be after now/);
    expect(p({ load: [1, 2] as never })).toMatch(/load must be three numbers/);
    expect(p({ cpus: 0 })).toMatch(/cpus must be 1\.\.256/);
    expect(p({ memory: { total: 100, cache: 200 } })).toMatch(/memory must be whole MiB/);
    const withProc = (extra: object) => p({ processes: [...procMachine.processes!, { pid: 2000, user: 'learner', command: 'x', ...extra }] });
    expect(withProc({ pid: 1 })).toMatch(/the pid must be 1\.\.4194304 and unique/);
    expect(withProc({ user: 'bob' })).toMatch(/user bob is not a user of the machine/);
    expect(withProc({ command: 'a\nb' })).toMatch(/the command needs 1\.\.200 characters/);
    expect(withProc({ stat: 'Q' })).toMatch(/invalid stat Q/);
    expect(withProc({ cpu: 300 })).toMatch(/cpu must be 0\.\.100 per CPU/);
    expect(withProc({ rss: -1 })).toMatch(/rss must be whole KiB/);
    expect(withProc({ tty: 'console' })).toMatch(/tty must be/);
    expect(withProc({ start: '2026-11-23 00:00:00' })).toMatch(/start must be a time between boot and now/);
    expect(withProc({ nice: 40 })).toMatch(/nice must be -20\.\.19/);
    expect(withProc({ ppid: 77 })).toMatch(/its parent 77 is not in the table/);
    expect(withProc({ unit: 'x.service' })).toMatch(/a unit needs the services profile/);
    expect(withProc({ term: 'explode' })).toMatch(/term must be exit or ignore/);
  });
  it('checks processes: present (by name, user, state) or absent', () => {
    expect(checkTerminalExercise(hogExercise, [procMachine], ['kill -9 900']).ok).toBe(true);
    const failed = checkTerminalExercise(hogExercise, [procMachine], ['kill 900']);
    expect(failed.results[0]).toMatchObject({ ok: false, message: '行程 PID 900 應該已經結束，但它還在（PID 900）' });
    expect(describeCheck({ kind: 'process', name: 'node', user: 'learner', state: 'S' })).toBe('行程 node 應該在執行（屬於 learner，狀態是 S）');
    const x = { ...hogExercise, checks: [{ kind: 'process' as const, name: 'vim', user: 'root' }] };
    expect(checkTerminalExercise(x, [procMachine], []).results[0].message).toBe('行程 vim 應該在執行（屬於 root），但它屬於 learner');
  });
  it('validates the fixture lesson and rejects process checks elsewhere', () => {
    expect(terminalContentProblems(procContent())).toEqual([]);
    expect(problems(c => { c.machines[0].profile = 'users'; })).toMatch(/processes need the processes profile/);
    expect(problems(c => { c.exercises[0].checks = [{ kind: 'process' }]; })).toMatch(/a process check needs a processes machine \(engine stage E4\) and a name or a pid/);
    expect(problems(c => { c.examples[0].steps[0].command = 'apt list'; })).toMatch(/example ps: apt is not in the processes profile of machine app/);
    expect(problems(c => { c.exercises[0].solution = ['sudo systemctl stop x']; })).toMatch(/systemctl is not in the processes profile of machine app/);
    expect(problems(c => { c.exercises[1].variants![0].processes![0].user = 'bob'; })).toMatch(/variant 另一個時刻: machine app: process 1: user bob is not a user/);
  });
});
