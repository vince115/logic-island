import { describe, expect, it } from 'vitest';
import { initialState, type FsState } from '@/lib/terminal/fs';
import { SYSTEM_MANUAL } from '@/lib/terminal/manual';
import { enablement, parseUnit } from '@/lib/terminal/services';
import { E6_COMMANDS, PACKAGES_PROFILE, run, SERVICES_PROFILE } from '@/lib/terminal/shell';
import { checkTerminalExercise, describeCheck, machineProblems, machineState, profileOf, terminalContentProblems, type TerminalLessonContent, type TerminalMachine } from '@/lib/terminal/lesson';
import { fixReportExercise, helloUnitExercise, procMachine, svcContent, svcMachine, svcPkgMachine } from './support/terminal-fixture';

/*
 * Engine stage E6 (docs/curriculum/LNX0_TERMINAL_CAPABILITY.md §14): the services profile — unit files and what systemd
 * loaded (daemon-reload), systemctl (status, start, stop, restart, reload, enable, disable, is-active, is-enabled,
 * list-units…), Restart= with the start limit, Requires=, a stop that times out, systemd noticing a killed main process,
 * packages that set up their units, the journal and journalctl's filters, and the service check of lessons.
 */
function session(from: FsState | TerminalMachine, ...commands: string[]) {
  let state = 'files' in from ? machineState(from) : from;
  const log: { out: string[]; err: string[] }[] = [];
  for (const cmd of commands) {
    const r = run(state, cmd, SERVICES_PROFILE);
    state = r.state;
    log.push({ out: r.lines.filter(l => l.kind === 'out').map(l => l.text), err: r.lines.filter(l => l.kind === 'err').map(l => l.text) });
  }
  return { state, log, last: log.at(-1)! };
}
const svc = (...commands: string[]) => session(svcMachine, ...commands);
const out = (...commands: string[]) => svc(...commands).last.out;
const err = (...commands: string[]) => svc(...commands).last.err;
const status = (...commands: string[]) => svc(...commands).state.status;
const active = (s: FsState, unit: string) => s.services?.runtime[unit]?.active ?? 'inactive';
/** The service machine with one more unit file (and programs). */
const withUnit = (name: string, text: string, programs: NonNullable<TerminalMachine['programs']> = []): TerminalMachine => ({
  ...svcMachine, files: [...svcMachine.files, { path: `/etc/systemd/system/${name}`, kind: 'file', mode: 0o644, owner: 'root', content: text }], programs: [...svcMachine.programs!, ...programs],
});
const problems = (edit: (c: TerminalLessonContent) => void) => { const c = svcContent(); edit(c); return terminalContentProblems(c).join('\n'); };
const REPORT_FAILS = 'error: cannot open /etc/report.conf: No such file or directory';

describe('the services profile', () => {
  it('is the packages profile plus systemctl and journalctl', () => {
    expect([...SERVICES_PROFILE.commands].sort()).toEqual([...PACKAGES_PROFILE.commands, ...E6_COMMANDS].sort());
    expect(SERVICES_PROFILE.features).toEqual([...PACKAGES_PROFILE.features!, 'services']);
    expect(profileOf(svcMachine)).toBe(SERVICES_PROFILE);
    for (const cmd of E6_COMMANDS) {
      expect(run(initialState(), `${cmd} status`, PACKAGES_PROFILE).lines[0].text, cmd).toMatch(new RegExp(`^bash: ${cmd}: command not found`));
      expect(out(`${cmd} --help`)[0], cmd).toBe(`用法：${SYSTEM_MANUAL[cmd].usage}`);
    }
    // A state without systemd data (not a lesson machine) says so.
    expect(run(initialState(), 'systemctl status x', SERVICES_PROFILE).lines.map(l => l.text)).toEqual(["System has not been booted with systemd as init system (PID 1). Can't operate.", 'Failed to connect to bus: Host is down']);
  });
});

describe('unit files', () => {
  it('are parsed for the documented keys, with systemd\'s warnings', () => {
    const c = parseUnit({ name: 'x.service', path: '/etc/systemd/system/x.service', text: '# c\n[Unit]\nDescription=X\nAfter=db net.target\nRequires=db\nWants=cache.service\nStartLimitBurst=3\n\n[Service]\nType=oneshot\nExecStart=/bin/x\nUser=app\nRestart=on-failure\nRestartSec=2s\nRestat=always\nRestart=sometimes\nRemainAfterExit=yes\nbroken line\n[Install]\nWantedBy=multi-user.target\n[X-Custom]\nA=b\n' });
    expect(c).toMatchObject({ description: 'X', after: ['db.service', 'net.target'], requires: ['db.service'], wants: ['cache.service'], type: 'oneshot', execStart: '/bin/x', user: 'app',
      restart: 'on-failure', restartSec: 2, burst: 3, interval: 10, remainAfterExit: true, wantedBy: ['multi-user.target'] });
    expect(c.bad).toBeUndefined();
    expect(c.warnings).toEqual([
      "/etc/systemd/system/x.service:15: Unknown key name 'Restat' in section 'Service', ignoring.", '/etc/systemd/system/x.service:16: Failed to parse service restart specifier, ignoring: sometimes',
      "/etc/systemd/system/x.service:18: Missing '=', ignoring line.", "/etc/systemd/system/x.service:21: Unknown section 'X-Custom'. Ignoring.",
    ]);
    expect(parseUnit({ name: 'y.service', path: '/y', text: '[Service]\nUser=x\n' }).bad).toBe('y.service: Service has no ExecStart=, ExecStop=, or SuccessAction=. Refusing.');
    expect(parseUnit({ name: 'z.service', path: '/z', text: 'ExecStart=/x\n' }).warnings).toEqual(['/z:1: Assignment outside of section. Ignoring.']);
  });
  it('are enabled by a link in a .wants folder; without [Install] they are static', () => {
    const s = machineState(svcMachine);
    expect(['nginx.service', 'report.service', 'worker.service', 'stubborn.service', 'nope.service'].map(n => enablement(s.nodes, n))).toEqual(['enabled', 'enabled', 'disabled', 'static', undefined]);
    expect(Object.keys(s.services!.loaded).sort()).toEqual(['api.service', 'db.service', 'nginx.service', 'report.service', 'stubborn.service', 'worker.service']);
  });
});

describe('systemctl status', () => {
  it('shows a running service like systemd 255', () => {
    expect(out('systemctl status nginx')).toEqual([
      '● nginx.service - A high performance web server and a reverse proxy server',
      '     Loaded: loaded (/usr/lib/systemd/system/nginx.service; enabled; preset: enabled)',
      '     Active: active (running) since Sun 2026-11-22 08:00:05 UTC; 1h 59min ago',
      '   Main PID: 812 (nginx)',
      '     CGroup: /system.slice/nginx.service',
      '             ├─812 nginx: master process /usr/sbin/nginx -g daemon on; master_process on;',
      '             └─813 nginx: worker process',
      '',
      'Nov 22 08:00:05 svc-01 systemd[1]: Starting nginx.service - A high performance web server and a reverse proxy server...',
      'Nov 22 08:00:05 svc-01 systemd[1]: Started nginx.service - A high performance web server and a reverse proxy server.',
    ]);
    expect(status('systemctl status nginx')).toBe(0);
  });
  it('shows a failed, an inactive and an unknown service with systemd\'s exit statuses', () => {
    expect(out('systemctl status report').slice(0, 5)).toEqual([
      '× report.service - Nightly report', '     Loaded: loaded (/etc/systemd/system/report.service; enabled; preset: enabled)',
      '     Active: failed (Result: exit-code) since Sun 2026-11-22 09:00:00 UTC; 1h 0min ago',
      '    Process: 950 ExecStart=/usr/local/bin/report (code=exited, status=1/FAILURE)', '   Main PID: 950 (code=exited, status=1/FAILURE)',
    ]);
    expect(status('systemctl status report')).toBe(3);
    expect(out('systemctl status db')).toEqual(['○ db.service - Database', '     Loaded: loaded (/etc/systemd/system/db.service; static)', '     Active: inactive (dead)']);
    expect(err('systemctl status nope')).toEqual(['Unit nope.service could not be found.']);
    expect(status('systemctl status nope')).toBe(4);
    expect(out('systemctl status db worker.service')[3]).toBe('');
    expect(out('systemctl is-active nginx report db')).toEqual(['active', 'failed', 'inactive']);
    expect(status('systemctl is-active nginx')).toBe(0);
    expect(status('systemctl is-active report')).toBe(3);
    expect(status('systemctl is-active --quiet db')).toBe(3);
    expect(out('systemctl is-enabled nginx worker stubborn')).toEqual(['enabled', 'disabled', 'static']);
    expect(status('systemctl is-enabled worker')).toBe(1);
    expect(err('systemctl is-enabled nope')).toEqual(['Failed to get unit file state for nope.service: No such file or directory']);
  });
});

describe('starting and stopping', () => {
  it('needs root for every change', () => {
    expect(err('systemctl start worker')).toEqual(['Failed to start worker.service: Interactive authentication required.', "See system logs and 'systemctl status worker.service' for details."]);
    expect(err('systemctl enable worker')).toEqual(['Failed to enable unit: Interactive authentication required.']);
    expect(err('systemctl daemon-reload')).toEqual(['Failed to reload daemon: Interactive authentication required.']);
    expect(status('systemctl stop nginx')).toBe(1);
    expect(active(svc('systemctl stop nginx').state, 'nginx.service')).toBe('active');
  });
  it('starts a service: its process, Main PID and journal lines', () => {
    const r = svc('sudo systemctl start worker', 'systemctl status worker', 'ps -o pid,user,comm -p 1002');
    expect(r.log[0]).toEqual({ out: [], err: [] });
    expect(r.log[1].out).toEqual([
      '● worker.service - Queue worker', '     Loaded: loaded (/etc/systemd/system/worker.service; disabled; preset: enabled)',
      '     Active: active (running) since Sun 2026-11-22 10:00:00 UTC; now', '   Main PID: 1002 (worker)', '     CGroup: /system.slice/worker.service',
      '             └─1002 /usr/local/bin/worker --queue jobs', '', 'Nov 22 10:00:00 svc-01 systemd[1]: Started worker.service - Queue worker.',
      'Nov 22 10:00:00 svc-01 worker[1002]: worker: waiting for jobs',
    ]);
    expect(r.last.out).toEqual(['    PID USER     COMMAND', '   1002 root     worker']);
    expect(err('sudo systemctl start nope')).toEqual(['Failed to start nope.service: Unit nope.service not found.']);
    expect(status('sudo systemctl start nope')).toBe(5);
    expect(err('sudo systemctl stop nope')).toEqual(['Failed to stop nope.service: Unit nope.service not loaded.']);
  });
  it('restarts a failing program at once and gives up after StartLimitBurst starts', () => {
    const r = svc('sudo systemctl start report', 'sudo journalctl -u report -o cat -n 9');
    expect(r.log[0]).toEqual({ out: [], err: [] });
    expect(r.last.out).toEqual([
      'Started report.service - Nightly report.', REPORT_FAILS, 'report.service: Main process exited, code=exited, status=1/FAILURE', "report.service: Failed with result 'exit-code'.",
      'report.service: Scheduled restart job, restart counter is at 5.', 'Stopped report.service - Nightly report.', 'report.service: Start request repeated too quickly.',
      "report.service: Failed with result 'exit-code'.", 'Failed to start report.service - Nightly report.',
    ]);
    expect(r.state.journal!.filter(e => e.unit === 'report.service' && e.message.startsWith('Started')).length).toBe(1 + 5);
    expect(r.state.services!.runtime['report.service']).toMatchObject({ active: 'failed', result: 'exit-code', exit: { pid: 1006, code: 'exited', status: 1 }, restarts: 5 });
    expect(r.state.processes!.some(p => p.unit === 'report.service')).toBe(false);
    // With the file it needs, the next manual start works (a manual start resets the start limit).
    const fixed = svc('sudo systemctl start report', 'echo interval=60 | sudo tee /etc/report.conf', 'sudo systemctl restart report', 'systemctl is-active report');
    expect(fixed.last.out).toEqual(['active']);
    expect(fixed.state.journal!.at(-1)).toMatchObject({ id: 'report', priority: 6, message: 'report: config loaded, next run at 02:00' });
  });
  it('waits for a slow RestartSec in activating (auto-restart), and reports other failures by type', () => {
    const slow = withUnit('slow.service', '[Service]\nExecStart=/usr/local/bin/report\nRestart=always\nRestartSec=5\n');
    expect(session(slow, 'sudo systemctl start slow', 'systemctl status slow').last.out.slice(0, 3)).toEqual([
      '● slow.service', '     Loaded: loaded (/etc/systemd/system/slow.service; static)', '     Active: activating (auto-restart) (Result: exit-code) since Sun 2026-11-22 10:00:00 UTC; now',
    ]);
    const missing = withUnit('typo.service', '[Unit]\nDescription=Typo\n[Service]\nType=exec\nExecStart=/usr/local/bin/reprot\n');
    const t = session(missing, 'sudo systemctl start typo', 'sudo journalctl -u typo -o cat');
    expect(t.log[0].err).toEqual(['Job for typo.service failed because the control process exited with error code.', 'See "systemctl status typo.service" and "journalctl -xeu typo.service" for details.']);
    expect(t.state.status).toBe(0);
    expect(t.last.out).toEqual(['typo.service: Failed to locate executable /usr/local/bin/reprot: No such file or directory', 'typo.service: Failed at step EXEC spawning /usr/local/bin/reprot: No such file or directory',
      'typo.service: Main process exited, code=exited, status=203/EXEC', "typo.service: Failed with result 'exit-code'.", 'Failed to start typo.service - Typo.']);
    const user = withUnit('who.service', '[Service]\nExecStart=/usr/local/bin/db\nUser=nobody2\n');
    expect(session(user, 'sudo systemctl start who', 'sudo journalctl -u who -o cat -p err').last.out).toEqual(['who.service: Failed to determine user credentials: No such process', 'who.service: Failed at step USER spawning /usr/local/bin/db: No such process']);
    const path = withUnit('path.service', '[Service]\nExecStart=db --port 1\n');
    expect(session(path, 'sudo systemctl start path', 'systemctl is-active path').last.out).toEqual(['active']);
    const once = withUnit('once.service', '[Unit]\nDescription=Once\n[Service]\nType=oneshot\nExecStart=/usr/local/bin/db\n');
    expect(session(once, 'sudo systemctl start once', 'sudo journalctl -u once -o cat', 'systemctl is-active once').log.slice(1).map(l => l.out)).toEqual([['Starting once.service - Once...', 'once.service: Deactivated successfully.', 'Finished once.service - Once.'], ['inactive']]);
    const bad = withUnit('bad.service', '[Service]\nUser=root\n');
    expect(session(bad, 'sudo systemctl start bad').last.err).toEqual(['Failed to start bad.service: Unit bad.service has a bad unit file setting.', "See system logs and 'systemctl status bad.service' for details."]);
    expect(session(bad, 'systemctl status bad').last.out[1]).toBe('     Loaded: bad-setting (Reason: Unit bad.service has a bad unit file setting.)');
  });
  it('starts what a unit Requires= first, and stops what Requires= a unit first', () => {
    const r = svc('sudo systemctl start api', 'systemctl is-active db api', 'sudo journalctl -n 4 -o cat');
    expect(r.log[1].out).toEqual(['active', 'active']);
    expect(r.last.out).toEqual(['Started db.service - Database.', 'db: listening on port 5432', 'Started api.service - API server.', 'api: connected to the database']);
    expect(out('sudo systemctl start api', 'sudo systemctl stop db', 'systemctl is-active api db')).toEqual(['inactive', 'inactive']);
    // A required unit whose start job fails (Type=exec and a missing program) keeps the unit from starting.
    const typo = withUnit('typo.service', '[Service]\nType=exec\nExecStart=/usr/local/bin/reprot\n');
    const broken: TerminalMachine = { ...typo, files: [...typo.files, { path: '/etc/systemd/system/web.service', kind: 'file', mode: 0o644, owner: 'root', content: '[Service]\nExecStart=/usr/local/bin/api\n[Unit]\nRequires=typo.service\nAfter=typo.service\n' }] };
    const w = session(broken, 'sudo systemctl start web');
    expect(w.last.err).toEqual(["A dependency job for web.service failed. See 'journalctl -xe' for details."]);
    expect(active(w.state, 'web.service')).toBe('inactive');
    expect(session(withUnit('lost.service', '[Unit]\nRequires=ghost.service\n[Service]\nExecStart=/usr/local/bin/api\n'), 'sudo systemctl start lost').last.err).toEqual(['Failed to start lost.service: Unit ghost.service not found.']);
  });
  it('stops a service, killing a program that ignores SIGTERM after the stop timeout', () => {
    const r = svc('sudo systemctl stop nginx', 'systemctl status nginx');
    expect(r.last.out.slice(2)).toEqual(['     Active: inactive (dead) since Sun 2026-11-22 10:00:00 UTC; now', '', 'Nov 22 08:00:05 svc-01 systemd[1]: Starting nginx.service - A high performance web server and a reverse proxy server...',
      'Nov 22 08:00:05 svc-01 systemd[1]: Started nginx.service - A high performance web server and a reverse proxy server.', 'Nov 22 10:00:00 svc-01 systemd[1]: Stopping nginx.service - A high performance web server and a reverse proxy server...',
      'Nov 22 10:00:00 svc-01 systemd[1]: nginx.service: Deactivated successfully.', 'Nov 22 10:00:00 svc-01 systemd[1]: Stopped nginx.service - A high performance web server and a reverse proxy server.']);
    expect(r.state.processes!.map(p => p.pid)).toEqual([1, 901, 1001]);
    const s = svc('sudo systemctl stop stubborn', 'sudo journalctl -u stubborn -o cat', 'systemctl is-active stubborn');
    expect(s.log[1].out).toEqual(['Stopping stubborn.service - Legacy daemon...', "stubborn.service: State 'stop-sigterm' timed out. Killing.", 'stubborn.service: Killing process 901 (stubborn) with signal SIGKILL.',
      'stubborn.service: Main process exited, code=killed, status=9/KILL', "stubborn.service: Failed with result 'timeout'.", 'Stopped stubborn.service - Legacy daemon.']);
    expect(s.last.out).toEqual(['failed']);
    expect(out('sudo systemctl stop stubborn', 'sudo systemctl reset-failed stubborn', 'systemctl is-active stubborn')).toEqual(['inactive']);
  });
  it('reloads a service that has ExecReload=', () => {
    expect(svc('sudo systemctl reload nginx', 'sudo journalctl -n 2 -o cat').last.out).toEqual(['Reloading nginx.service - A high performance web server and a reverse proxy server...', 'Reloaded nginx.service - A high performance web server and a reverse proxy server.']);
    expect(err('sudo systemctl start db', 'sudo systemctl reload db')).toEqual(['Failed to reload db.service: Job type reload is not applicable for unit db.service.']);
    expect(err('sudo systemctl reload worker')).toEqual(['worker.service is not active, cannot reload.']);
  });
});

describe('systemd and signals', () => {
  it('restarts a killed main process under Restart=always, with a new pid', () => {
    const r = svc('sudo systemctl start worker', 'sudo kill -9 1002', 'pgrep -a worker', 'sudo journalctl -u worker -o cat');
    expect(r.log[2].out).toEqual(['1003 /usr/local/bin/worker --queue jobs']);
    expect(r.last.out.slice(2)).toEqual(['worker.service: Main process exited, code=killed, status=9/KILL', "worker.service: Failed with result 'signal'.", 'worker.service: Scheduled restart job, restart counter is at 1.',
      'Stopped worker.service - Queue worker.', 'Started worker.service - Queue worker.', 'worker: waiting for jobs']);
    expect(svc('sudo systemctl start worker', 'sudo kill 1002').state.services!.runtime['worker.service']).toMatchObject({ active: 'active', main: 1003, restarts: 1 });
  });
  it('deactivates a service whose main process ended cleanly, and fails it after an unclean signal (no Restart=)', () => {
    const clean = svc('sudo kill 812');
    expect(active(clean.state, 'nginx.service')).toBe('inactive');
    expect(clean.state.processes!.some(p => p.unit === 'nginx.service')).toBe(false);
    const killed = svc('sudo kill -9 812', 'systemctl status nginx');
    expect(killed.last.out.slice(2, 5)).toEqual(['     Active: failed (Result: signal) since Sun 2026-11-22 10:00:00 UTC; now', '    Process: 812 ExecStart=/usr/sbin/nginx -g \'daemon on; master_process on;\' (code=killed, signal=KILL)', '   Main PID: 812 (code=killed, signal=KILL)']);
    // SIGHUP reloads nginx (declared), so the service stays.
    expect(active(svc('sudo kill -HUP 812').state, 'nginx.service')).toBe('active');
    // A worker process is not the main process: systemd does not react.
    expect(active(svc('sudo kill 813').state, 'nginx.service')).toBe('active');
  });
});

describe('enable, disable and daemon-reload', () => {
  it('creates and removes the .wants links, and --now also starts or stops', () => {
    const r = svc('sudo systemctl enable worker', 'systemctl is-enabled worker', 'systemctl is-active worker');
    expect(r.log[0].out).toEqual(['Created symlink /etc/systemd/system/multi-user.target.wants/worker.service → /etc/systemd/system/worker.service.']);
    expect(r.log.slice(1).map(l => l.out)).toEqual([['enabled'], ['inactive']]);
    expect(r.state.nodes.get('/etc/systemd/system/multi-user.target.wants/worker.service')).toEqual({ kind: 'link', mode: 0o777, owner: 'root', target: '/etc/systemd/system/worker.service' });
    expect(out('sudo systemctl enable worker', 'sudo systemctl enable worker')).toEqual([]);
    expect(out('sudo systemctl enable --now worker', 'systemctl is-active worker')).toEqual(['active']);
    expect(out('sudo systemctl disable nginx')).toEqual(['Removed "/etc/systemd/system/multi-user.target.wants/nginx.service".']);
    expect(out('sudo systemctl disable --now nginx', 'systemctl is-active nginx')).toEqual(['inactive']);
    expect(err('sudo systemctl enable stubborn')).toEqual(['The unit files have no installation config (WantedBy=, RequiredBy=, UpheldBy=,', 'Also=, or Alias= settings in the [Install] section, and DefaultInstance= for',
      'template units). This means they are not meant to be enabled or disabled using systemctl.']);
    expect(err('sudo systemctl enable nope')).toEqual(['Failed to enable unit: Unit file nope.service does not exist.']);
    // A new folder for another target is created.
    const graphical = withUnit('kiosk.service', '[Service]\nExecStart=/usr/local/bin/db\n[Install]\nWantedBy=graphical.target\n');
    expect(session(graphical, 'sudo systemctl enable kiosk').state.nodes.get('/etc/systemd/system/graphical.target.wants')).toEqual({ kind: 'dir', mode: 0o755, owner: 'root' });
  });
  it('keeps using the loaded unit until daemon-reload, and warns', () => {
    const edit = 'echo -e "[Unit]\\nDescription=Queue worker v2\\n[Service]\\nExecStart=/usr/local/bin/worker --queue fast\\nRestat=always" | sudo tee /etc/systemd/system/worker.service';
    const WARN = "Warning: The unit file, source configuration file or drop-ins of worker.service changed on disk. Run 'systemctl daemon-reload' to reload units.";
    const r = svc(edit, 'sudo systemctl start worker', 'systemctl status worker');
    expect(r.log[1].err).toEqual([WARN]);
    expect(r.last.out[0]).toBe('● worker.service - Queue worker');
    expect(r.last.err).toEqual([WARN]);
    expect(r.state.processes!.find(p => p.unit === 'worker.service')?.command).toBe('/usr/local/bin/worker --queue jobs');
    const reloaded = session(r.state, 'sudo systemctl daemon-reload', 'sudo systemctl restart worker', 'systemctl status worker', 'sudo journalctl -u worker -p warning -o cat');
    expect(reloaded.log[1].err).toEqual([]);
    expect(reloaded.log[2].out[0]).toBe('● worker.service - Queue worker v2');
    expect(reloaded.state.processes!.find(p => p.unit === 'worker.service')?.command).toBe('/usr/local/bin/worker --queue jobs');
    expect(reloaded.last.out).toEqual(["/etc/systemd/system/worker.service:5: Unknown key name 'Restat' in section 'Service', ignoring."]);
    // A unit file written after boot is loaded when it is first used (no daemon-reload needed).
    expect(out('echo -e "[Service]\\nExecStart=/usr/local/bin/hello" | sudo tee /etc/systemd/system/hello.service', 'sudo systemctl start hello', 'systemctl is-active hello').at(-1)).toBe('active');
  });
});

describe('listing units', () => {
  it('lists loaded units, all of them, failed ones and the unit files', () => {
    expect(out('systemctl list-units --type=service')).toEqual([
      '  UNIT             LOAD   ACTIVE SUB     DESCRIPTION', '  nginx.service    loaded active running A high performance web server and a reverse proxy server',
      '● report.service   loaded failed failed  Nightly report', '  stubborn.service loaded active running Legacy daemon', '',
      'Legend: LOAD   → Reflects whether the unit definition was properly loaded.', '        ACTIVE → The high-level unit activation state, i.e. generalization of SUB.',
      '        SUB    → The low-level unit activation state, values depend on unit type.', '', '3 loaded units listed. Pass --all to see loaded but inactive units, too.',
      "To show all installed unit files use 'systemctl list-unit-files'.",
    ]);
    expect(out('systemctl list-units --all --no-legend')).toHaveLength(7);
    expect(out('systemctl --failed --no-legend')).toEqual(['  UNIT           LOAD   ACTIVE SUB    DESCRIPTION', '● report.service loaded failed failed Nightly report']);
    expect(out('systemctl list-units --state=failed --no-legend')).toEqual(out('systemctl list-units --failed --no-legend'));
    expect(out('systemctl list-unit-files')).toEqual(['UNIT FILE        STATE    PRESET', 'api.service      disabled enabled', 'db.service       static   -', 'nginx.service    enabled  enabled',
      'report.service   enabled  enabled', 'stubborn.service static   -', 'worker.service   disabled enabled', '', '6 unit files listed.']);
    expect(out('systemctl cat report')).toEqual(['# /etc/systemd/system/report.service', '[Unit]', 'Description=Nightly report', '', '[Service]', 'ExecStart=/usr/local/bin/report', 'User=report', 'Restart=on-failure', '', '[Install]', 'WantedBy=multi-user.target']);
    expect(err('systemctl cat nope')).toEqual(['No files found for nope.service.']);
    expect(err('systemctl list-units --type=timer')).toEqual(['模擬環境只有 service 類型的 unit（--type=timer 不支援）']);
    expect(err('systemctl frobnicate')).toEqual(["Unknown command verb 'frobnicate'."]);
  });
});

describe('packages and units', () => {
  it('enables and starts the unit a package installs, and stops it when the package goes', () => {
    const r = session(svcPkgMachine, 'sudo apt install -y nginx', 'systemctl is-enabled nginx', 'systemctl is-active nginx');
    expect(r.log[0].out).toContain('Created symlink /etc/systemd/system/multi-user.target.wants/nginx.service → /usr/lib/systemd/system/nginx.service.');
    expect(r.log.slice(1).map(l => l.out)).toEqual([['enabled'], ['active']]);
    const gone = session(r.state, 'sudo apt remove -y nginx-common', 'systemctl is-active nginx');
    expect(gone.last.out).toEqual(['inactive']);
    expect(gone.state.processes!.some(p => p.unit === 'nginx.service')).toBe(false);
  });
});

describe('journalctl', () => {
  it('shows the system journal to root and the adm group only', () => {
    expect(svc('journalctl').last).toEqual({ out: ['-- No entries --'], err: ['Hint: You are currently not seeing messages from other users and the system.', "      Users in groups 'adm', 'systemd-journal' can see all messages.", '      Pass -q to turn off this notice.'] });
    expect(svc('journalctl -q').last).toEqual({ out: ['-- No entries --'], err: [] });
    expect(status('journalctl')).toBe(0);
    const adm: TerminalMachine = { ...svcMachine, accounts: { ...svcMachine.accounts, groups: [...svcMachine.accounts!.groups!, { name: 'adm', members: ['learner'] }] } };
    expect(session(adm, 'journalctl -n 1').last.out).toEqual(['Nov 22 09:45:00 svc-01 kernel: TCP: request_sock_TCP: Possible SYN flooding on port 80. Sending cookies.']);
  });
  it('filters by unit, priority, time and pattern, and orders and limits the lines', () => {
    expect(out('sudo journalctl -u report -p err')).toEqual([`Nov 22 09:00:00 svc-01 report[950]: ${REPORT_FAILS}`]);
    expect(out('sudo journalctl -p warning -o cat')).toEqual([REPORT_FAILS, "report.service: Failed with result 'exit-code'.", 'TCP: request_sock_TCP: Possible SYN flooding on port 80. Sending cookies.']);
    expect(out('sudo journalctl -p 4..3 -o cat')).toEqual(out('sudo journalctl -p err..warning -o cat'));
    expect(out('sudo journalctl --since 09:30 -o cat')).toEqual(['Accepted publickey for learner from 203.0.113.7 port 52110 ssh2', 'TCP: request_sock_TCP: Possible SYN flooding on port 80. Sending cookies.']);
    expect(out('sudo journalctl --since "1 hour ago" --until "-20min" -o cat')).toEqual(out('sudo journalctl -S "2026-11-22 09:00" -U 09:40 -o cat'));
    expect(out('sudo journalctl --since "1 hour ago" --until "-20min" -o cat')).toHaveLength(5);
    expect(out('sudo journalctl --since today -n 2 -r -o short-iso')).toEqual(['2026-11-22T09:45:00+0000 svc-01 kernel: TCP: request_sock_TCP: Possible SYN flooding on port 80. Sending cookies.',
      '2026-11-22T09:30:12+0000 svc-01 sshd[1200]: Accepted publickey for learner from 203.0.113.7 port 52110 ssh2']);
    expect(out('sudo journalctl -k -o cat')).toHaveLength(2);
    expect(out('sudo journalctl -g "publickey|SYN" -o cat')).toHaveLength(2);
    expect(out('sudo journalctl -u nope')).toEqual(['-- No entries --']);
    expect(out('sudo journalctl --since tomorrow')).toEqual(['-- No entries --']);
    expect(out('sudo journalctl -b --no-pager -x -n 1 -o cat')).toEqual(['TCP: request_sock_TCP: Possible SYN flooding on port 80. Sending cookies.']);
    expect(out('sudo journalctl -n 0')).toEqual(['-- No entries --']);
  });
  it('prints systemd\'s errors and refuses -f', () => {
    expect(err('sudo journalctl --since soon')).toEqual(['Failed to parse timestamp: soon']);
    expect(err('sudo journalctl --since now --until yesterday')).toEqual(['--since= must be before --until=.']);
    expect(err('sudo journalctl -p loud')).toEqual(['Failed to parse priority value: loud']);
    expect(err('sudo journalctl -o json')).toEqual(["Unknown output format 'json'."]);
    expect(err('sudo journalctl -n x')).toEqual(["Failed to parse lines 'x'"]);
    expect(err('sudo journalctl -f')).toEqual(['journalctl: 模擬環境的日誌不會再增加，不支援 -f（持續追蹤）；請用 -n 或 --since 查詢']);
    expect(status('sudo journalctl -f')).toBe(1);
    expect(err('sudo journalctl _PID=1')).toEqual(['模擬環境的 journalctl 不接受比對條件（例如 _PID=1）；請用 -u、-p、--since']);
  });
  it('keeps /var/log files as plain files', () => {
    expect(out('ls /var/log')).toEqual(['syslog  syslog.1  syslog.2.gz']);
    expect(err('cat /var/log/syslog')).toEqual(['cat: /var/log/syslog: Permission denied']);
    expect(out('sudo tail -n 1 /var/log/syslog.1')).toEqual(['Nov 21 23:59:59 svc-01 CRON[4410]: (root) CMD (logrotate /etc/logrotate.conf)']);
  });
});

describe('services machines in lessons', () => {
  it('validates units, programs and the journal, and keeps them to the services profile', () => {
    const p = (m: Partial<TerminalMachine>) => machineProblems({ ...svcMachine, ...m }).join('\n');
    expect(machineProblems(svcMachine)).toEqual([]);
    expect(machineProblems(svcPkgMachine)).toEqual([]);
    expect(machineProblems({ ...procMachine, journal: [] }).join('\n')).toMatch(/journal needs the services profile \(engine stage E6\)/);
    expect(machineProblems({ ...procMachine, programs: [] }).join('\n')).toMatch(/programs need the services profile/);
    expect(p({ services: [{ unit: 'ghost', active: 'active' }] })).toMatch(/service ghost: no unit file/);
    expect(p({ services: [{ unit: 'nginx', active: 'failed' }] })).toMatch(/service nginx: a failed service has no processes/);
    expect(p({ services: [{ unit: 'report', active: 'active', pid: 3 }] })).toMatch(/pid is the last main process of a failed service/);
    expect(p({ services: [{ unit: 'report', active: 'failed', since: '2026-11-23 00:00:00' }] })).toMatch(/since must be a time not after now/);
    expect(p({ processes: [...svcMachine.processes!, { pid: 3000, user: 'root', command: 'x', unit: 'ghost' }] })).toMatch(/process 3000: no unit file for ghost/);
    expect(p({ programs: [{ path: 'bin/x' }] })).toMatch(/program bin\/x: needs a unique absolute, normalized path/);
    expect(p({ programs: [{ path: '/x', fail: { message: '' } }] })).toMatch(/fail needs a one-line message/);
    expect(p({ journal: [{ time: '2026-11-22 11:00:00', id: 'x', priority: 6, message: 'later' }] })).toMatch(/journal entry 1 is after the machine's now/);
    expect(p({ journal: [{ time: '2026-11-22 09:00:00', id: 'x', priority: 6, message: 'b' }, { time: '2026-11-22 08:00:00', id: 'x', priority: 6, message: 'a' }] })).toMatch(/journal entry 2 is earlier than the one before it/);
    expect(p({ journal: [{ time: 'noon', id: 'x', priority: 6, message: 'a' }] })).toMatch(/journal entry 1: time must be/);
    expect(p({ journal: [{ time: '2026-11-22 08:00:00', id: 'x y', priority: 9, message: '' }] })).toMatch(/priority must be 0\.\.7[\s\S]*invalid id x y[\s\S]*the message needs/);
  });
  it('builds the run state: active from the process table, failed from the data, the rest inactive', () => {
    const s = machineState(svcMachine);
    expect(s.services!.runtime).toEqual({
      'nginx.service': { active: 'active', sub: 'running', since: s.clock!.boot + 5, main: 812 },
      'report.service': { active: 'failed', sub: 'failed', since: s.clock!.now - 3600, result: 'exit-code', exit: { pid: 950, code: 'exited', status: 1 } },
      'stubborn.service': { active: 'active', sub: 'running', since: s.clock!.boot, main: 901 },
    });
    expect(s.journal).toHaveLength(9);
  });
  it('checks services: run state and enablement', () => {
    expect(checkTerminalExercise(fixReportExercise, [svcMachine], fixReportExercise.solution).ok).toBe(true);
    expect(checkTerminalExercise(fixReportExercise, [svcMachine], ['sudo systemctl restart report']).results[0].message).toBe('服務 report.service 應該狀態是 active，但它是 failed');
    expect(checkTerminalExercise(helloUnitExercise, [svcMachine], helloUnitExercise.mistakes[0].commands).results[0].message).toBe('服務 hello.service 應該狀態是 active，開機時啟動，但它是 disabled');
    expect(describeCheck({ kind: 'service', unit: 'nginx', enabled: false })).toBe('服務 nginx.service 應該開機時不啟動');
  });
  it('validates the fixture lesson and rejects service checks elsewhere', () => {
    expect(terminalContentProblems(svcContent())).toEqual([]);
    expect(problems(c => { c.exercises[0].checks = [{ kind: 'service', unit: 'bad name' }]; })).toMatch(/a service check needs a services machine \(engine stage E6\) and a unit name/);
    expect(problems(c => { c.exercises[2].variants![0].journal![0].priority = 12; })).toMatch(/variant 另一天的日誌: machine svc: journal entry 1: priority must be 0\.\.7/);
    const lower = svcContent();
    lower.machines = [{ ...procMachine, id: 'svc' }];
    expect(terminalContentProblems(lower).join('\n')).toMatch(/systemctl is not in the processes profile of machine svc[\s\S]*a service check needs a services machine/);
  });
});
