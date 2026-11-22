import { describe, expect, it } from 'vitest';
import { type FsState } from '@/lib/terminal/fs';
import { parseTime } from '@/lib/terminal/clock';
import { formatDate, fromLocal, nextCalendar, nextCron, normalizeCalendar, offsetAt, parseCalendar, parseCron, sameCron, UTC_ZONE, zoneNamed, zoneStamp, type CronSpec } from '@/lib/terminal/calendar';
import { LATER_MANUAL } from '@/lib/terminal/manual';
import { parseCrontab } from '@/lib/terminal/schedule';
import { E9_COMMANDS, run, SCHEDULING_PROFILE, SCRIPTING_PROFILE } from '@/lib/terminal/shell';
import { checkTerminalExercise, machineProblems, machineState, profileOf, terminalContentProblems, type TerminalLessonContent, type TerminalMachine } from '@/lib/terminal/lesson';
import { cronJobExercise, cronMachine, nextRunsExercise, scheduleContent, timerExercise } from './support/terminal-fixture';

/*
 * Engine stage E9 (docs/curriculum/LNX0_TERMINAL_CAPABILITY.md §17): the scheduling profile — the fixed time zone table
 * with daylight saving, Vixie cron's expressions and crontab, systemd's calendar expressions (systemd-analyze calendar),
 * timers in systemctl, the cron-next and cron-run teaching helpers (the clock never moves), flock, timedatectl and date in
 * a zone, and the lesson data.
 */
const f = (path: string, content: string, mode = 0o644, owner = 'learner') => ({ path, kind: 'file' as const, mode, owner, content });
const machine = (patch: Partial<TerminalMachine> = {}, ...files: ReturnType<typeof f>[]): TerminalMachine => ({ ...cronMachine, ...patch, files: [...cronMachine.files, ...files] });
function session(from: FsState | TerminalMachine, ...commands: string[]) {
  let state = 'files' in from ? machineState(from) : from;
  const log: { out: string[]; err: string[] }[] = [];
  for (const cmd of commands) {
    const r = run(state, cmd, SCHEDULING_PROFILE);
    state = r.state;
    log.push({ out: r.lines.filter(l => l.kind === 'out').map(l => l.text), err: r.lines.filter(l => l.kind === 'err').map(l => l.text) });
  }
  return { state, log, last: log.at(-1)! };
}
const out = (...commands: string[]) => session(cronMachine, ...commands).last.out;
const err = (...commands: string[]) => session(cronMachine, ...commands).last.err;
const T = (text: string) => parseTime(text)!;
const cron = (text: string) => parseCron(text.split(' ')) as CronSpec;
const local = (zone: string, times: number[]) => times.map(t => zoneStamp(zoneNamed(zone)!, t));

describe('the scheduling profile', () => {
  it('is the scripting profile plus crontab, the cron helpers, flock, timedatectl and systemd-analyze', () => {
    expect([...SCHEDULING_PROFILE.commands].sort()).toEqual([...SCRIPTING_PROFILE.commands, ...E9_COMMANDS].sort());
    expect(SCHEDULING_PROFILE.features).toEqual([...SCRIPTING_PROFILE.features!, 'scheduling']);
    expect(profileOf(cronMachine)).toBe(SCHEDULING_PROFILE);
    for (const cmd of E9_COMMANDS) {
      expect(run(machineState({ ...cronMachine, profile: 'scripting', timezone: undefined, processes: undefined }), `${cmd} -l`, SCRIPTING_PROFILE).lines[0].text, cmd).toMatch(new RegExp(`^bash: ${cmd}: command not found`));
      expect(out(`${cmd} --help`)[0], cmd).toBe(`用法：${LATER_MANUAL[cmd].usage}`);
    }
    expect(LATER_MANUAL['cron-next'].summary).toMatch(/教學輔助，不是真實的指令/);
  });
});

describe('time zones and date', () => {
  it('fixed offsets, and the EU and US daylight saving rules', () => {
    const at = (zone: string, t: string) => offsetAt(zoneNamed(zone)!, T(t));
    expect(at('Asia/Taipei', '2026-07-01 00:00')).toEqual({ offset: 8 * 3600, abbr: 'CST' });
    expect([at('Europe/London', '2026-03-29 00:59:59'), at('Europe/London', '2026-03-29 01:00:00'), at('Europe/London', '2026-10-25 01:00:00')].map(o => o.abbr)).toEqual(['GMT', 'BST', 'GMT']);
    expect([at('America/New_York', '2026-03-08 06:59:59'), at('America/New_York', '2026-03-08 07:00:00'), at('America/New_York', '2026-11-01 05:59:59'), at('America/New_York', '2026-11-01 06:00:00')].map(o => o.abbr))
      .toEqual(['EST', 'EDT', 'EDT', 'EST']);
    // The skipped hour names no instant; the repeated hour names two.
    const ny = zoneNamed('America/New_York')!;
    expect(fromLocal(ny, T('2026-03-08 02:30'))).toEqual([]);
    expect(fromLocal(ny, T('2026-11-01 01:30'))).toHaveLength(2);
    expect(zoneNamed('Mars/Base')).toBeUndefined();
  });
  it('date and timedatectl show the machine\'s zone; TZ= and -u change it; +FORMAT for scripts', () => {
    expect(out('date')).toEqual(['Sun Nov 22 18:00:00 CST 2026']);
    expect(out('date -u')).toEqual(['Sun Nov 22 10:00:00 UTC 2026']);
    expect(out('TZ=America/New_York date')).toEqual(['Sun Nov 22 05:00:00 EST 2026']);
    expect(out('date "+%F %T %Z %z %a %j %s"')).toEqual(['2026-11-22 18:00:00 CST +0800 Sun 326 1795341600']);
    expect(formatDate('%Y%m%d-%H%M', UTC_ZONE, T('2026-01-02 03:04'))).toBe('20260102-0304');
    expect(err('date -d tomorrow')).toEqual(['date: 模擬環境的 date 只支援 -u 與 +格式（不能用 -d 或設定時間）']);
    expect(out('timedatectl')).toEqual(['               Local time: Sun 2026-11-22 18:00:00 CST', '           Universal time: Sun 2026-11-22 10:00:00 UTC', '                 RTC time: Sun 2026-11-22 10:00:00',
      '                Time zone: Asia/Taipei (CST, +0800)', 'System clock synchronized: yes', '              NTP service: active', '          RTC in local TZ: no']);
    expect(err('sudo timedatectl set-timezone UTC')[0]).toMatch(/只能查看/);
    expect(out('timedatectl list-timezones')).toContain('Europe/Berlin');
  });
});

describe('cron expressions', () => {
  it('parse fields, ranges, steps, lists and names; report Debian cron\'s errors', () => {
    expect(cron('*/15 9-17 * jan,jul mon-fri')).toMatchObject({ minutes: [0, 15, 30, 45], hours: [9, 10, 11, 12, 13, 14, 15, 16, 17], months: [1, 7], weekdays: [1, 2, 3, 4, 5], dayStar: true, weekdayStar: false });
    expect(cron('0 0 * * 7').weekdays).toEqual([0]);
    expect(cron('5/20 * * * *').minutes).toEqual([5, 25, 45]);
    expect([['60 * * * *'], ['* 24 * * *'], ['* * 0 * *'], ['* * * 13 *'], ['* * * * 8'], ['* *'], ['5-1 * * * *'], ['*/0 * * * *']].map(([t]) => parseCron(t.split(' '))))
      .toEqual([{ error: 'bad minute' }, { error: 'bad hour' }, { error: 'bad day-of-month' }, { error: 'bad month' }, { error: 'bad day-of-week' }, { error: 'bad day-of-month' }, { error: 'bad minute' }, { error: 'bad minute' }]);
    expect(parseCron(['@hourly'])).toEqual(cron('0 * * * *'));
    expect(parseCron(['@often'])).toEqual({ error: 'bad time specifier' });
    expect(sameCron(cron('00 02 * * *'), cron('0 2 * * *'))).toBe(true);
    expect(sameCron(parseCron(['@daily']) as CronSpec, cron('0 0 * * *'))).toBe(true);
    expect(sameCron(cron('0 2 * * 1'), cron('0 2 * * 2'))).toBe(false);
  });
  it('next runs: either restricted day field matches; a field starting with * does not count as restricted', () => {
    const taipei = zoneNamed('Asia/Taipei')!, now = T('2026-11-22 10:00:00');
    expect(local('Asia/Taipei', nextCron(cron('0 9 1 * 1'), taipei, now, 3))).toEqual(['Mon 2026-11-23 09:00:00 CST', 'Mon 2026-11-30 09:00:00 CST', 'Tue 2026-12-01 09:00:00 CST']);
    // */2 starts with *, so both must match: odd days that are Mondays (not Monday the 30th).
    expect(local('Asia/Taipei', nextCron(cron('0 9 */2 * 1'), taipei, now, 2))).toEqual(['Mon 2026-11-23 09:00:00 CST', 'Mon 2026-12-07 09:00:00 CST']);
    expect(nextCron(cron('0 0 30 2 *'), taipei, now, 1)).toEqual([]);
    // A job in the hour daylight saving skips does not run that day.
    expect(local('America/New_York', nextCron(cron('30 2 * * *'), zoneNamed('America/New_York')!, T('2026-03-07 12:00'), 2))).toEqual(['Mon 2026-03-09 02:30:00 EDT', 'Tue 2026-03-10 02:30:00 EDT']);
  });
  it('crontab lines: environment, a user field in system files, bad commands and a missing final newline', () => {
    expect(parseCrontab('MAILTO=""\n# c\n@daily /bin/x\n', 'f', 'learner')).toMatchObject({ jobs: [{ user: 'learner', when: '@daily', command: '/bin/x', env: { MAILTO: '' } }], errors: [] });
    expect(parseCrontab('0 1 * * * root echo hi\n0 1 * * *\n', '/etc/crontab', null)).toMatchObject({ jobs: [{ user: 'root', command: 'echo hi' }], errors: [{ line: 2, message: 'bad username' }] });
    expect(parseCrontab('0 1 * * *\n0 1 * * * x', 'f', 'u').errors).toEqual([{ line: 2, message: 'premature EOF' }, { line: 1, message: 'bad command' }]);
  });
});

describe('systemd calendar expressions', () => {
  it('normalize like systemd.time(7)\'s table', () => {
    const table: [string, string][] = [
      ['minutely', '*-*-* *:*:00'], ['hourly', '*-*-* *:00:00'], ['daily', '*-*-* 00:00:00'], ['monthly', '*-*-01 00:00:00'], ['weekly', 'Mon *-*-* 00:00:00'], ['yearly', '*-01-01 00:00:00'],
      ['quarterly', '*-01,04,07,10-01 00:00:00'], ['semiannually', '*-01,07-01 00:00:00'], ['Sat,Thu,Mon..Wed,Sat..Sun', 'Mon..Thu,Sat,Sun *-*-* 00:00:00'], ['Wed *-1', 'Wed *-*-01 00:00:00'],
      ['Wed, 17:48', 'Wed *-*-* 17:48:00'], ['*-*-7 0:0:0', '*-*-07 00:00:00'], ['10-15', '*-10-15 00:00:00'], ['monday *-12-* 17:00', 'Mon *-12-* 17:00:00'],
      ['Mon,Fri *-*-3,1,2 *:30:45', 'Mon,Fri *-*-01,02,03 *:30:45'], ['12,14,13,12:20,10,30', '*-*-* 12,13,14:10,20,30:00'], ['12..14:10,20,30', '*-*-* 12..14:10,20,30:00'],
      ['03-05 08:05:40', '*-03-05 08:05:40'], ['05:40', '*-*-* 05:40:00'], ['2003-03-05 05:40', '2003-03-05 05:40:00'], ['daily UTC', '*-*-* 00:00:00 UTC'], ['*:2/3', '*-*-* *:02/3:00'],
      ['Mon,Sun 12-*-* 2,1:23', 'Mon,Sun 2012-*-* 01,02:23:00'],
    ];
    for (const [given, normalized] of table) expect(normalizeCalendar(parseCalendar(given)!), given).toBe(normalized);
    for (const bad of ['nonsense', '25:00', '*-13-01', 'Mon..Funday', '1 2 3', '']) expect(parseCalendar(bad), bad).toBeUndefined();
  });
  it('next elapses in the machine\'s zone, or the expression\'s own', () => {
    const taipei = zoneNamed('Asia/Taipei')!, now = T('2026-11-22 10:00:00');
    expect(local('Asia/Taipei', nextCalendar(parseCalendar('Mon..Fri *-*-* 09:00')!, taipei, now, 2))).toEqual(['Mon 2026-11-23 09:00:00 CST', 'Tue 2026-11-24 09:00:00 CST']);
    expect(local('Asia/Taipei', nextCalendar(parseCalendar('daily UTC')!, taipei, now, 1))).toEqual(['Mon 2026-11-23 08:00:00 CST']);
    expect(nextCalendar(parseCalendar('2003-03-05')!, taipei, now, 1)).toEqual([]);
  });
  it('systemd-analyze calendar prints the forms and the next elapses', () => {
    expect(out('systemd-analyze calendar --iterations=2 "*:0/15"')).toEqual(['  Original form: *:0/15', 'Normalized form: *-*-* *:00/15:00', '    Next elapse: Sun 2026-11-22 18:15:00 CST',
      '       (in UTC): Sun 2026-11-22 10:15:00 UTC', '       From now: 15min left', '   Iteration #2: Sun 2026-11-22 18:30:00 CST', '       (in UTC): Sun 2026-11-22 10:30:00 UTC', '       From now: 30min left']);
    expect(session(machine({ timezone: 'UTC' }), 'systemd-analyze calendar weekly').last.out).toEqual(['  Original form: weekly', 'Normalized form: Mon *-*-* 00:00:00', '    Next elapse: Mon 2026-11-23 00:00:00 UTC', '       From now: 14h left']);
    expect(out('systemd-analyze calendar 2003-03-05')).toContain('    Next elapse: never');
    expect(err('systemd-analyze calendar "every day"')).toEqual(["Failed to parse calendar specification 'every day': Invalid argument"]);
    expect(err('systemd-analyze blame')[0]).toMatch(/只支援 systemd-analyze calendar/);
  });
});

describe('crontab, cron-next and cron-run', () => {
  it('installs a checked crontab into the spool as the user\'s 600 file, lists it without its header, removes it', () => {
    const s = session(cronMachine, 'echo "0 3 * * * /usr/local/bin/backup.sh" > mine', 'crontab mine', 'crontab -l', 'sudo ls -l /var/spool/cron/crontabs', 'crontab -u root -l', 'crontab -e', 'crontab -r', 'crontab -r');
    expect(s.log[2].out).toEqual(['0 3 * * * /usr/local/bin/backup.sh']);
    expect(s.log[3].out).toEqual([expect.stringMatching(/^-rw------- learner crontab +\d+ learner$/)]);
    expect(s.log[4].err).toEqual(['must be privileged to use -u']);
    expect(s.log[5].err[0]).toMatch(/沒有文字編輯器/);
    expect(s.log[7].err).toEqual(['no crontab for learner']);
    const installed = session(cronMachine, 'echo "0 3 * * * x" > mine', 'crontab mine').state.nodes.get('/var/spool/cron/crontabs/learner')!.content!;
    expect(installed.split('\n').slice(0, 3)).toEqual(['# DO NOT EDIT THIS FILE - edit the master and reinstall.', '# (mine installed on Sun Nov 22 18:00:00 2026)', '# (Cron version -- $Id: crontab.c,v 2.13 1994/01/17 03:20:37 vixie Exp $)']);
    expect(session(cronMachine, 'printf "0 3 * * * x" > noeol', 'crontab noeol').last.err).toEqual(['"noeol":1: premature EOF', "errors in crontab file, can't install."]);
  });
  it('cron-next computes next runs (a teaching helper) and lists every job, noting that Debian ignores CRON_TZ', () => {
    expect(out('cron-next "*/20 9 * * 1-5"')).toEqual(['Mon 2026-11-23 09:00:00 CST', 'Mon 2026-11-23 09:20:00 CST', 'Mon 2026-11-23 09:40:00 CST', 'Tue 2026-11-24 09:00:00 CST', 'Tue 2026-11-24 09:20:00 CST']);
    expect(out('cron-next @reboot')).toEqual(['（@reboot：只在開機時執行；模擬環境不重新開機）']);
    expect(err('cron-next "61 * * * *"')).toEqual(['cron-next: bad minute']);
    const listed = session(cronMachine, 'printf "CRON_TZ=Asia/Tokyo\\n30 2 * * * /usr/local/bin/backup.sh\\n" > c', 'crontab c', 'cron-next -l').last.out;
    expect(listed[0]).toMatch(/^NEXT +USER +SOURCE +SCHEDULE +COMMAND$/);
    expect(listed[1]).toMatch(/^Mon 2026-11-23 02:30:00 CST  learner  crontab \(learner\) +30 2 \* \* \* +\/usr\/local\/bin\/backup\.sh$/);
    expect(listed[2]).toMatch(/^Mon 2026-11-23 03:15:00 CST  root +\/etc\/cron\.d\/logrotate/);
    expect(listed.at(-1)).toMatch(/不支援 CRON_TZ/);
  });
  it('cron-run runs the next due jobs as cron would: the user, the home folder, PATH=/usr/bin:/bin, % as input, output discarded or mailed', () => {
    const tab = 'MAILTO=learner\n30 2 * * * backup.sh\n30 2 * * * /usr/local/bin/backup.sh\n30 2 * * * cat > fromcron.txt % first%second\n0 4 * * * echo later\n';
    const s = session(machine({}, f('/home/learner/tab', tab)), 'crontab tab', 'cron-run', 'ls backups', 'cat fromcron.txt', 'sudo journalctl -u cron -o cat');
    expect(s.log[1].out).toEqual(['cron-run（教學輔助）：模擬 Mon 2026-11-23 02:30:00 CST 到期的 3 個工作；機器的時鐘不前進',
      '[learner] backup.sh', '  結束碼 127；輸出 1 行：沒有安裝郵件伺服器（MTA），cron 捨棄了輸出',
      '[learner] /usr/local/bin/backup.sh', '  結束碼 0；輸出 1 行：沒有安裝郵件伺服器（MTA），cron 捨棄了輸出',
      '[learner] cat > fromcron.txt % first%second', '  結束碼 0；沒有輸出']);
    expect(s.log[2].out).toEqual(['app-2026-11-22.db']);
    expect(s.log[3].out).toEqual([' first', 'second']);
    expect(s.log[4].out).toEqual(['(learner) CMD (backup.sh)', '(CRON) info (No MTA installed, discarding output)', '(learner) CMD (/usr/local/bin/backup.sh)', '(CRON) info (No MTA installed, discarding output)', '(learner) CMD (cat > fromcron.txt )']);
    const mailed = session(machine({ mta: true }, f('/home/learner/tab', '30 2 * * * /usr/local/bin/backup.sh\n')), 'crontab tab', 'cron-run', 'cat /var/mail/learner');
    expect(mailed.log[2].out).toEqual(['From: root (Cron Daemon)', 'To: learner', 'Subject: Cron <learner@job-01> /usr/local/bin/backup.sh', '', 'backup 2026-11-22 done', '']);
    expect(session(machine({}, f('/home/learner/tab', 'MAILTO=""\n30 2 * * * echo quiet\n')), 'crontab tab', 'cron-run').last.out[2]).toBe('  結束碼 0；輸出 1 行：MAILTO="" 不寄送，輸出被捨棄');
    expect(session(machine({ processes: undefined }), 'cron-run').last.out).toEqual(['cron-run（教學輔助）：模擬 Mon 2026-11-23 03:15:00 CST 到期的 1 個工作；機器的時鐘不前進',
      '[root] /usr/sbin/logrotate /etc/logrotate.conf', expect.stringMatching(/^ {2}結束碼 127；/)]);
  });
});

describe('flock', () => {
  it('gives up at once with -n while a running process holds the lock, says that it would wait without, and runs once it is free', () => {
    const s = session(cronMachine, 'flock -n /var/lock/backup.lock echo ran', 'echo $?', 'flock -n -E 75 /var/lock/backup.lock echo ran', 'echo $?', 'flock /var/lock/backup.lock echo ran', 'kill 4321',
      'flock -n /var/lock/backup.lock echo ran', 'flock -n /var/lock/backup.lock -c "echo $((1 + 1)); exit 3"', 'echo $?', 'ls -l /var/lock');
    expect(s.log.map(l => l.out)).toEqual([[], ['1'], [], ['75'], [], [], ['ran'], ['2'], ['3'], ['-rw-r--r-- learner learner     0 backup.lock']]);
    expect(s.log[4].err[0]).toBe('flock: 模擬環境：/var/lock/backup.lock 的鎖被 PID 4321（bash）持有，flock 會一直等下去；請用 -n（拿不到鎖就放棄）或 -w 秒數');
    expect(err('flock -n 9')).toEqual(['flock: 模擬環境不支援以檔案描述子加鎖（flock -n 9）；請寫成 flock -n 鎖檔 指令']);
    expect(err('flock -n /root/x.lock echo')).toEqual(['flock: cannot open lock file /root/x.lock: No such file or directory']);
  });
});

describe('timers', () => {
  it('list-timers, status, enable --now with the next elapse in the machine\'s zone', () => {
    const s = session(cronMachine, 'systemctl list-timers --all', 'sudo systemctl enable --now backup.timer', 'systemctl list-timers', 'systemctl status backup.timer', 'systemctl is-active backup.timer');
    expect(s.log[0].out).toEqual(['NEXT LEFT LAST PASSED UNIT         ACTIVATES', '-    -    -    -      backup.timer backup.service', '', '1 timers listed.']);
    expect(s.log[1].out).toEqual(['Created symlink /etc/systemd/system/timers.target.wants/backup.timer → /etc/systemd/system/backup.timer.']);
    expect(s.log[2].out).toEqual(['NEXT                        LEFT LAST PASSED UNIT         ACTIVATES', 'Mon 2026-11-23 02:30:00 CST 8h   -    -      backup.timer backup.service', '',
      '1 timers listed.', 'Pass --all to see loaded but inactive timers, too.']);
    expect(s.log[3].out).toEqual(['● backup.timer - Run the nightly backup', '     Loaded: loaded (/etc/systemd/system/backup.timer; enabled; preset: enabled)',
      '     Active: active (waiting) since Sun 2026-11-22 18:00:00 CST; now', '    Trigger: Mon 2026-11-23 02:30:00 CST; 8h left', '   Triggers: ● backup.service', '',
      'Nov 22 18:00:00 job-01 systemd[1]: Started backup.timer - Run the nightly backup.']);
    expect(s.log[4].out).toEqual(['active']);
  });
  it('Persistent=true catches up a missed run when the timer starts; the service\'s script runs and logs', () => {
    const m = machine({ services: [{ unit: 'backup.timer', active: 'inactive', last: '2026-11-20 18:30:00' }] });
    const s = session(m, 'sudo systemctl start backup.timer', 'ls backups', 'sudo journalctl -u backup.service -o cat', 'systemctl list-timers');
    expect(s.log[1].out).toEqual(['app-2026-11-22.db']);
    expect(s.log[2].out).toEqual(['Starting backup.service - Nightly backup...', 'backup 2026-11-22 done', 'backup.service: Deactivated successfully.', 'Finished backup.service - Nightly backup.']);
    expect(s.log[3].out[1]).toMatch(/^Mon 2026-11-23 02:30:00 CST 8h   Sun 2026-11-22 18:00:00 CST now    backup\.timer backup\.service$/);
    // Without Persistent=, or with a recent last run, nothing runs at start.
    expect(session(machine({ services: [{ unit: 'backup.timer', active: 'inactive', last: '2026-11-21 18:30:00' }] }), 'sudo systemctl start backup.timer', 'ls backups').last.out).toEqual([]);
  });
  it('refuses a timer without its service, warns about a bad OnCalendar=, and stops', () => {
    const lonely = machine({}, f('/etc/systemd/system/lonely.timer', '[Timer]\nOnCalendar=daily\n', 0o644, 'root'));
    // A unit file written after boot is loaded (and its warnings journaled) by daemon-reload.
    const s = session(lonely, 'sudo systemctl start lonely.timer', 'echo $?', 'sudo journalctl -u lonely.timer -o cat',
      'printf "[Timer]\\nOnCalendar=sometimes\\nOnCalendar=hourly\\nUnit=backup.service\\n" | sudo tee /etc/systemd/system/odd.timer > /dev/null; sudo systemctl daemon-reload; sudo systemctl start odd.timer', 'sudo journalctl -u odd.timer -o cat', 'sudo systemctl stop odd.timer', 'systemctl is-active odd.timer');
    expect(s.log[0].err).toEqual(['Job for lonely.timer failed because of unavailable resources or another system error.', 'See "systemctl status lonely.timer" and "journalctl -xeu lonely.timer" for details.']);
    expect(s.log[2].out).toEqual(['lonely.timer: Refusing to start, unit lonely.service to trigger not loaded.', "lonely.timer: Failed with result 'resources'."]);
    expect(s.log[4].out[0]).toBe('/etc/systemd/system/odd.timer:2: Failed to parse calendar specification, ignoring: sometimes');
    expect(s.log[6].out).toEqual(['inactive']);
  });
  it('journal times are in the machine\'s zone and --since reads local times', () => {
    expect(out('sudo systemctl start backup.service', 'sudo journalctl -u backup.service -n 1 -o short-iso')).toEqual(['2026-11-22T18:00:00+0800 job-01 systemd[1]: Finished backup.service - Nightly backup.']);
    expect(out('sudo systemctl start backup.service', 'sudo journalctl -u backup.service --since "2026-11-22 18:00" -o cat | wc -l')).toEqual(['4']);
    expect(out('sudo systemctl start backup.service', 'sudo journalctl -u backup.service --since "2026-11-22 18:01" -o cat')).toEqual(['-- No entries --']);
  });
});

describe('lesson data', () => {
  it('validates the E9 content and checks cron jobs, timers and next runs', () => {
    expect(terminalContentProblems(scheduleContent())).toEqual([]);
    expect(checkTerminalExercise(cronJobExercise, [cronMachine], ['echo "0 2 * * * /usr/local/bin/backup.sh" > m', 'crontab m']).results[0].message)
      .toBe('應該有排程工作（learner 的，時間「30 2 * * *」，指令含有「/usr/local/bin/backup.sh」），但找到的工作是「0 2 * * * /usr/local/bin/backup.sh」');
    expect(checkTerminalExercise(timerExercise, [cronMachine], ['sudo systemctl start backup.timer']).results[0].message).toBe('timer backup.timer 應該在等待觸發，開機時啟動，下次觸發是 2026-11-23 02:30:00，但它沒有 enable');
    expect(checkTerminalExercise(nextRunsExercise, [cronMachine], ['echo "Sun 2026-11-22 18:00:00 CST"']).ok).toBe(false);
  });
  it('reports bad scheduling data', () => {
    const problems = (m: TerminalMachine) => machineProblems(m).join('\n');
    expect(problems(machine({ profile: 'scripting' }))).toMatch(/timezone and mta need the scheduling profile \(engine stage E9\)/);
    expect(problems(machine({ timezone: 'Mars/Base' }))).toMatch(/unknown time zone Mars\/Base/);
    expect(problems(machine({ processes: [{ pid: 9, user: 'learner', command: 'x', locks: ['tmp/x'] }] }))).toMatch(/lock tmp\/x is not an absolute, normalized path/);
    expect(problems(machine({ services: [{ unit: 'backup.timer', active: 'active', last: '2027-01-01 00:00:00' }] }))).toMatch(/last is a time not after now, for a timer/);
    const content = (edit: (c: TerminalLessonContent) => void) => { const c = scheduleContent(); edit(c); return terminalContentProblems(c).join('\n'); };
    expect(content(c => { c.exercises[0].checks = [{ kind: 'cron', schedule: '61 * * * *' }]; })).toMatch(/a cron check needs a scheduling machine \(engine stage E9\) and a valid schedule/);
    expect(content(c => { c.exercises[1].checks = [{ kind: 'timer', unit: 'backup.service' }]; })).toMatch(/a timer check needs a scheduling machine/);
    expect(content(c => { c.exercises[2].variants = []; })).toMatch(/an output check needs a variant whose reference output differs/);
  });
});
