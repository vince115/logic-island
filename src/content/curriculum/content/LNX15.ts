import type { TerminalExercise, TerminalFile, TerminalJournalEntry, TerminalMachine, TerminalPackages, TerminalProcess } from '@/lib/terminal/lesson';
import type { LessonContent } from '../schema';

/*
 * LNX15 Linux Systems Capstone: Maintain a Server (LNX-5). The island's capstone on the scheduling profile (engine stage
 * E9, which includes E1–E8): one small company server, hq-01, taken over from a previous administrator and maintained
 * through six stages, each with a terminal exercise checked on the machine's state: (1) accounts and permissions — an ops
 * group, a second administrator, an intern's sudo taken back with usermod -G, a root:ops 770 shared folder (LNX06–LNX07);
 * (2) SSH — mei's key installed from her laptop after the host fingerprint is checked, then password login turned off in a
 * .d file that sorts before cloud-init's (LNX12); (3) OrderDesk deployed as a systemd service under a dedicated system
 * account with Restart=on-failure (LNX06, LNX07, LNX10); (4) an outage diagnosed from systemctl status, the journal, sudo's
 * records and the application's own log, then fixed (LNX05, LNX10, LNX11); (5) a stuck backup killed and a strict
 * (set -euo pipefail) backup script scheduled in /etc/cron.d with flock -n, tried with the cron-run teaching helper
 * (LNX08, LNX13, LNX14); (6) updates with one vendor package held and a change record appended (LNX05, LNX09). Each stage's
 * machine is hq-01 as that stage begins; the clock is fixed at 2026-11-22 06:00 UTC (14:00 in Asia/Taipei). Host names,
 * users, the OrderDesk program, addresses (RFC 1918) and the vendor repository (.example) are made up. The outage's journal
 * was produced by replaying the restart on the engine; every transcript output was produced by replaying it on the engine.
 */

const dir = (path: string, owner = 'root', mode = 0o755, group?: string): TerminalFile => ({ path, kind: 'dir', mode, owner, ...group ? { group } : {} });
const file = (path: string, content: string, owner = 'root', mode = 0o644, group?: string): TerminalFile => ({ path, kind: 'file', mode, owner, content, ...group ? { group } : {} });
const exe = (path: string): TerminalFile => file(path, '', 'root', 0o755);
const link = (path: string, target: string): TerminalFile => ({ path, kind: 'link', mode: 0o777, owner: 'root', target });
const lines = (...rows: string[]) => rows.map(r => `${r}\n`).join('');
/** Writes a file with printf '%s\n' and sudo tee (the simulated machines have no editor); each line is one single-quoted word. */
const printfTee = (rows: string[], path: string) => `printf '%s\\n' ${rows.map(r => `'${r}'`).join(' ')} | sudo tee ${path} > /dev/null`;

const HOME = '/home/learner';
const NOLOGIN = '/usr/sbin/nologin';
const WANTS = '/etc/systemd/system/multi-user.target.wants';
const NOW = '2026-11-22 06:00:00';
const BOOT = '2026-11-20 22:00:00';
const LOCK = '/var/lock/orderdesk-backup.lock';

const unit = (description: string, service: string[]) =>
  lines('[Unit]', `Description=${description}`, '', '[Service]', ...service, '', '[Install]', 'WantedBy=multi-user.target');
const ORDERDESK_LINES = ['[Unit]', 'Description=OrderDesk order service', 'After=network.target', '', '[Service]',
  'ExecStart=/opt/orderdesk/bin/orderdesk --config /etc/orderdesk/orderdesk.conf', 'User=orderdesk', 'Restart=on-failure', 'RestartSec=1', '',
  '[Install]', 'WantedBy=multi-user.target'];
const ORDERDESK_PATH = '/etc/systemd/system/orderdesk.service';
const ORDERDESK_UNIT = lines(...ORDERDESK_LINES);
const CONF_OLD = lines('listen: 10.20.0.5:8080', 'data_dir: /var/lib/orderdesk', 'log_file: /var/log/orderdesk/orderdesk.log');
const CONF_NEW = lines('listen: 10.20.0.5:8080', 'data_dir: /srv/orderdesk/data', 'log_file: /var/log/orderdesk/orderdesk.log');
const OLD_BACKUP = lines('#!/bin/bash', '# old nightly backup: copy the database to the NAS', 'cd /mnt/nas/orderdesk', 'cp /var/lib/orderdesk/orders.db orders-latest.db', 'echo "backup done"');
const BACKUP_LINES = ['#!/bin/bash', 'set -euo pipefail', 'stamp=$(date +%F)', 'mkdir -p /srv/backup/orderdesk',
  'cp /srv/orderdesk/data/orders.db "/srv/backup/orderdesk/orders-$stamp.db"', 'echo "orderdesk backup $stamp done"'];
const BACKUP_PATH = '/usr/local/bin/orderdesk-backup';
const BACKUP_SCRIPT = lines(...BACKUP_LINES);
const CRON_LINE = `30 2 * * * root flock -n ${LOCK} ${BACKUP_PATH} >> /var/log/orderdesk-backup.log 2>&1`;
const ORDERS = 'orders=1842\n';
/** hq-01's host key fingerprint, as the provider's console shows it (the remote's hostKey seed gives this key). */
const HQ_FINGERPRINT = 'SHA256:Nd5g9CLGZS3xOJFgMdw9hD9cTZ5hAppN/IBNyKN1Odk';

/** The change record in /srv/ops: one line per change, who and what (stage 6 appends to it). */
const CHANGES = [
  '2026-11-22 learner: took over hq-01 from the previous admin',
  '2026-11-22 learner: created mei (sudo, ops), removed kai from sudo, /srv/ops is root:ops 770',
  '2026-11-22 learner: orderdesk.service runs as orderdesk, Restart=on-failure',
  '2026-11-22 mei: orderdesk data_dir moves to /srv/orderdesk/data (more space on /srv)',
  '2026-11-22 learner: created /srv/orderdesk/data, restarted orderdesk',
  '2026-11-22 learner: orderdesk-backup in /etc/cron.d (flock -n, set -euo pipefail)',
];
const CHANGE_NOTE = '2026-11-22 learner: apt upgrade (openssl, sudo); orderdesk held at 1.4.2-1 until the 2.0 migration';
const changelog = (n: number) => file('/srv/ops/CHANGELOG', lines(...CHANGES.slice(0, n)), 'root', 0o664, 'ops');

// ---------------------------------------------------------------------------------------------------- the server
const STUCK: TerminalProcess = { pid: 4410, user: 'root', command: '/bin/bash /usr/local/bin/old-backup.sh', start: '2026-11-21 18:30:00', rss: 3400, vsz: 7400, locks: [LOCK] };
const ORDERDESK_PROC = (pid: number, start: string): TerminalProcess =>
  ({ pid, user: 'orderdesk', command: '/opt/orderdesk/bin/orderdesk --config /etc/orderdesk/orderdesk.conf', stat: 'Ssl', cpu: 1.2, rss: 98304, vsz: 812000, start, unit: 'orderdesk' });
const INIT: TerminalProcess[] = [
  { pid: 1, ppid: 0, user: 'root', command: '/sbin/init', stat: 'Ss', rss: 12800, vsz: 167000 },
  { pid: 702, user: 'root', command: '/usr/sbin/cron -f -P', stat: 'Ss', rss: 2600, vsz: 6800, unit: 'cron' },
  { pid: 715, user: 'root', command: 'sshd: /usr/sbin/sshd -D [listener] 0 of 10-100 startups', stat: 'Ss', rss: 8100, vsz: 15400, unit: 'ssh' },
];
const SHELL: TerminalProcess = { pid: 5120, user: 'learner', command: '-bash', stat: 'Ss', tty: 'pts/0', rss: 5300, start: '2026-11-22 05:55:00' };

/** What hq-01 has from the start: systemd units for cron and ssh, the previous admin's backup job, /srv on its own disk. */
const BASE: TerminalFile[] = [
  dir('/etc'), dir('/etc/cron.d'), file('/etc/cron.d/old-backup', lines('# previous admin', `30 2 * * * root flock -n ${LOCK} /usr/local/bin/old-backup.sh`)),
  dir('/etc/systemd'), dir('/etc/systemd/system'), dir(WANTS),
  link(`${WANTS}/cron.service`, '/usr/lib/systemd/system/cron.service'),
  link(`${WANTS}/ssh.service`, '/usr/lib/systemd/system/ssh.service'),
  dir('/home'), dir(HOME, 'learner', 0o750), dir('/home/kai', 'kai', 0o750),
  dir('/srv'), dir('/srv/backup', 'root', 0o750),
  dir('/usr'), dir('/usr/lib'), dir('/usr/lib/systemd'), dir('/usr/lib/systemd/system'),
  file('/usr/lib/systemd/system/cron.service', unit('Regular background program processing daemon', ['ExecStart=/usr/sbin/cron -f -P', 'Restart=on-failure'])),
  file('/usr/lib/systemd/system/ssh.service', unit('OpenBSD Secure Shell server', ['ExecStart=/usr/sbin/sshd -D', 'Restart=on-failure'])),
  dir('/usr/local'), dir('/usr/local/bin'), file('/usr/local/bin/old-backup.sh', OLD_BACKUP, 'root', 0o755),
  dir('/usr/sbin'), exe('/usr/sbin/cron'), exe('/usr/sbin/sshd'),
  dir('/var'), dir('/var/lib'), dir('/var/lock', 'root', 0o777), dir('/var/log'),
];

/** Stage 1: hq-01 the day it is taken over. kai, an intern, was given sudo by the previous admin. */
const hq: TerminalMachine = {
  id: 'hq', title: '公司伺服器 hq-01（接手當天）', user: 'learner', host: 'hq-01', cwd: HOME, profile: 'scheduling',
  now: NOW, boot: BOOT, timezone: 'Asia/Taipei', address: '10.20.0.5', cpus: 2, memory: { total: 4096 },
  mounts: [
    { path: '/', device: '/dev/vda1', type: 'ext4', size: 41152736, used: 37449990 },
    { path: '/srv', device: '/dev/vdb1', type: 'ext4', size: 205375464, used: 22591300 },
  ],
  accounts: {
    users: [{ name: 'kai', uid: 1002, comment: 'Kai Chen (intern)', shell: '/bin/bash' }],
    groups: [{ name: 'sudo', members: ['learner', 'kai'] }, { name: 'crontab', gid: 107 }],
  },
  files: BASE,
  processes: [...INIT, STUCK, SHELL],
};

/** The accounts after stage 1 (and, from stage 3, OrderDesk's system account). */
const STAGE1_ACCOUNTS = {
  users: [{ name: 'kai', uid: 1002, comment: 'Kai Chen (intern)', shell: '/bin/bash' }, { name: 'mei', uid: 1003, group: 'mei', shell: '/bin/bash' }],
  groups: [{ name: 'ops', gid: 1003, members: ['learner', 'kai', 'mei'] }, { name: 'mei', gid: 1004 }, { name: 'sudo', members: ['learner', 'mei'] }, { name: 'crontab', gid: 107 }],
};
const STAGE3_ACCOUNTS = { users: [...STAGE1_ACCOUNTS.users, { name: 'orderdesk', uid: 999, home: '/var/lib/orderdesk', shell: NOLOGIN }], groups: STAGE1_ACCOUNTS.groups };
/** What the vendor's package installed in /opt, mei's home and the shared folder of stage 1. */
const STAGE1_FILES: TerminalFile[] = [
  ...BASE, dir('/etc/orderdesk'), dir('/home/mei', 'mei', 0o750),
  dir('/opt'), dir('/opt/orderdesk'), dir('/opt/orderdesk/bin'), exe('/opt/orderdesk/bin/orderdesk'),
  file('/opt/orderdesk/README', lines('OrderDesk 1.4.2', 'Run: /opt/orderdesk/bin/orderdesk --config /etc/orderdesk/orderdesk.conf', 'Needs write access to data_dir and to the folder of log_file.', 'Never run it as root.')),
  dir('/srv/ops', 'root', 0o770, 'ops'),
];

/** Stage 3: OrderDesk is installed in /opt with its configuration; there is no account and no unit yet. */
const deploy: TerminalMachine = {
  ...hq, id: 'deploy', title: '公司伺服器 hq-01（部署 OrderDesk）', accounts: STAGE1_ACCOUNTS,
  files: [...STAGE1_FILES, file('/etc/orderdesk/orderdesk.conf', CONF_OLD), changelog(2), dir('/var/lib/orderdesk'), dir('/var/log/orderdesk')],
};

/** OrderDesk deployed (stage 3 done): its unit, enabled, its data and its own log file (adm may read it). */
const deployedFiles = (conf: string, log: string, changes: number): TerminalFile[] => [
  ...STAGE1_FILES, file('/etc/orderdesk/orderdesk.conf', conf), file(ORDERDESK_PATH, ORDERDESK_UNIT), link(`${WANTS}/orderdesk.service`, ORDERDESK_PATH),
  changelog(changes),
  dir('/var/lib/orderdesk', 'orderdesk', 0o750), file('/var/lib/orderdesk/orders.db', ORDERS, 'orderdesk', 0o640),
  dir('/var/log/orderdesk', 'orderdesk', 0o750, 'adm'), file('/var/log/orderdesk/orderdesk.log', log, 'orderdesk', 0o640, 'adm'),
];

// ---------------------------------------------------------------------------------------------------- the outage
const J = (time: string, id: string, pid: number, priority: number, message: string, unitName?: string): TerminalJournalEntry =>
  ({ time, id, pid, priority, message, ...unitName ? { unit: unitName } : {} });
const sd = (time: string, message: string, priority = 6) => J(time, 'systemd', 1, priority, message, 'orderdesk');
const od = (time: string, pid: number, priority: number, message: string) => J(time, 'orderdesk', pid, priority, message, 'orderdesk');
const sudoLog = (time: string, pid: number, who: string, command: string) => J(time, 'sudo', pid, 5, `${who} : TTY=pts/1 ; PWD=/home/${who} ; USER=root ; COMMAND=${command}`);
const NAME = 'orderdesk.service - OrderDesk order service';
const FATAL = 'FATAL data_dir /srv/orderdesk/data: no such file or directory';
/** What systemd logs when the program fails at once five times with RestartSec=1 (replayed on the engine, one second apart). */
const crashLoop = (): TerminalJournalEntry[] => [0, 1, 2, 3, 4].flatMap(i => {
  const t = `2026-11-22 05:12:${30 + i}`, next = `2026-11-22 05:12:${31 + i}`;
  return [sd(t, `Started ${NAME}.`), od(t, 3302 + i, 3, FATAL), sd(t, 'orderdesk.service: Main process exited, code=exited, status=1/FAILURE', 5),
    sd(t, "orderdesk.service: Failed with result 'exit-code'.", 4),
    sd(next, `orderdesk.service: Scheduled restart job, restart counter is at ${i + 1}.`), sd(next, `Stopped ${NAME}.`)];
});
const OUTAGE_JOURNAL: TerminalJournalEntry[] = [
  sd('2026-11-22 03:10:00', `Started ${NAME}.`),
  od('2026-11-22 03:10:01', 3301, 6, 'INFO listening on 10.20.0.5:8080'),
  od('2026-11-22 03:40:12', 3301, 4, 'WARNING /var/lib is 91% full'),
  sudoLog('2026-11-22 05:05:41', 3290, 'mei', '/usr/bin/vim /etc/orderdesk/orderdesk.conf'),
  sudoLog('2026-11-22 05:12:29', 3297, 'mei', '/usr/bin/systemctl restart orderdesk'),
  sd('2026-11-22 05:12:29', `Stopping ${NAME}...`),
  od('2026-11-22 05:12:29', 3301, 6, 'INFO received SIGTERM, shutting down'),
  sd('2026-11-22 05:12:30', 'orderdesk.service: Deactivated successfully.'),
  sd('2026-11-22 05:12:30', `Stopped ${NAME}.`),
  ...crashLoop(),
  sd('2026-11-22 05:12:35', 'orderdesk.service: Start request repeated too quickly.', 4),
  sd('2026-11-22 05:12:35', "orderdesk.service: Failed with result 'exit-code'.", 4),
  sd('2026-11-22 05:12:35', `Failed to start ${NAME}.`, 3),
];
/** OrderDesk's own log file (local time, like most applications write it). */
const ORDERDESK_LOG = lines(
  '2026-11-22 11:10:01 INFO listening on 10.20.0.5:8080',
  '2026-11-22 11:40:12 WARNING /var/lib is 91% full',
  '2026-11-22 13:12:29 INFO received SIGTERM, shutting down',
  ...[30, 31, 32, 33, 34].map(s => `2026-11-22 13:12:${s} ${FATAL}`),
);

/** Stage 4: mei pointed data_dir at /srv/orderdesk/data, which nobody created; OrderDesk hit the start limit at 13:12. */
const incident: TerminalMachine = {
  ...hq, id: 'incident', title: '公司伺服器 hq-01（OrderDesk 停擺）', accounts: STAGE3_ACCOUNTS,
  files: deployedFiles(CONF_NEW, ORDERDESK_LOG, 4),
  programs: [{ path: '/opt/orderdesk/bin/orderdesk', fail: { message: FATAL, unless: '/srv/orderdesk/data' } }],
  services: [{ unit: 'orderdesk', active: 'failed', since: '2026-11-22 05:12:35', result: 'exit-code', pid: 3306, status: 1 }],
  journal: OUTAGE_JOURNAL,
};

/** OrderDesk running again on its new data folder (stage 4 done). */
const runningFiles = (changes: number): TerminalFile[] => [
  ...deployedFiles(CONF_NEW, ORDERDESK_LOG, changes),
  dir('/srv/orderdesk'), dir('/srv/orderdesk/data', 'orderdesk', 0o750), file('/srv/orderdesk/data/orders.db', ORDERS, 'orderdesk', 0o640),
];
/** Stage 5: the previous admin's backup has hung since 02:30 holding the lock, and its script has no set -e. */
const backup: TerminalMachine = {
  ...hq, id: 'backup', title: '公司伺服器 hq-01（備份）', accounts: STAGE3_ACCOUNTS,
  files: runningFiles(5),
  processes: [...INIT, STUCK, ORDERDESK_PROC(5003, '2026-11-22 05:40:00'), SHELL],
  services: [{ unit: 'orderdesk', active: 'active', since: '2026-11-22 05:40:00' }],
};

// ---------------------------------------------------------------------------------------------------- updates
const ARCHIVE = 'http://archive.ubuntu.com/ubuntu', SECURITY = 'http://security.ubuntu.com/ubuntu', VENDOR = 'https://apt.orderdesk.example/debian';
const COMPONENTS = ['main', 'restricted', 'universe', 'multiverse'];
type Available = TerminalPackages['available'][number];
/** One version of a package in each of the named repositories (an update from noble-security is a security update). */
const versions = (repos: string[], pkg: Omit<Available, 'repo'>): Available[] => repos.map(repo => ({ ...pkg, repo, ...repo === 'noble-security' ? { security: true } : {} }));
const OPENSSL_OLD = '3.0.13-0ubuntu3.4', OPENSSL_NEW = '3.0.13-0ubuntu3.5';
const SUDO_OLD = '1.9.15p5-3ubuntu5', SUDO_NEW = '1.9.15p5-3ubuntu5.24.04.1';
const PACKAGES: TerminalPackages = {
  repositories: [
    { name: 'noble', url: ARCHIVE, suite: 'noble', components: COMPONENTS },
    { name: 'noble-updates', url: ARCHIVE, suite: 'noble-updates', components: COMPONENTS },
    { name: 'noble-security', url: SECURITY, suite: 'noble-security', components: COMPONENTS },
    { name: 'orderdesk', url: VENDOR, suite: 'stable', components: ['main'] },
  ],
  available: [
    ...versions(['noble-updates'], { name: 'openssl', version: OPENSSL_OLD, section: 'utils', description: 'Secure Sockets Layer toolkit - cryptographic utility', depends: ['libssl3t64'] }),
    ...versions(['noble-updates', 'noble-security'], { name: 'openssl', version: OPENSSL_NEW, section: 'utils', description: 'Secure Sockets Layer toolkit - cryptographic utility', depends: ['libssl3t64'] }),
    ...versions(['noble-updates'], { name: 'libssl3t64', version: OPENSSL_OLD, section: 'libs', description: 'Secure Sockets Layer toolkit - shared libraries' }),
    ...versions(['noble-updates', 'noble-security'], { name: 'libssl3t64', version: OPENSSL_NEW, section: 'libs', description: 'Secure Sockets Layer toolkit - shared libraries' }),
    ...versions(['noble'], { name: 'sudo', version: SUDO_OLD, section: 'admin', description: 'Provide limited super user privileges to specific users' }),
    ...versions(['noble-updates', 'noble-security'], { name: 'sudo', version: SUDO_NEW, section: 'admin', description: 'Provide limited super user privileges to specific users' }),
    ...versions(['orderdesk'], { name: 'orderdesk', version: '1.4.2-1', section: 'web', description: 'OrderDesk order management service' }),
    ...versions(['orderdesk'], { name: 'orderdesk', version: '2.0.0-1', section: 'web', description: 'OrderDesk order management service' }),
  ],
  installed: [
    { name: 'libssl3t64', version: OPENSSL_OLD, auto: true },
    { name: 'openssl', version: OPENSSL_OLD },
    { name: 'orderdesk', version: '1.4.2-1' },
    { name: 'sudo', version: SUDO_OLD },
  ],
};
/** Stage 6: the new backup job is in place; updates wait, and OrderDesk 2.0 needs a data migration its NEWS describes. */
const update: TerminalMachine = {
  ...hq, id: 'update', title: '公司伺服器 hq-01（更新）', accounts: STAGE3_ACCOUNTS,
  files: [
    ...runningFiles(6).filter(f => f.path !== '/etc/cron.d/old-backup' && f.path !== '/usr/local/bin/old-backup.sh'),
    file('/etc/cron.d/orderdesk-backup', lines(CRON_LINE)), file(BACKUP_PATH, BACKUP_SCRIPT, 'root', 0o755),
    file('/opt/orderdesk/NEWS', lines('2.0.0: the data format changes. Stop the service, back up data_dir and run', '  orderdesk migrate --config /etc/orderdesk/orderdesk.conf', 'before starting 2.0. There is no way back to 1.x without that backup.')),
  ],
  processes: [...INIT, ORDERDESK_PROC(5003, '2026-11-22 05:40:00'), SHELL],
  services: [{ unit: 'orderdesk', active: 'active', since: '2026-11-22 05:40:00' }],
  packages: PACKAGES,
};

// ---------------------------------------------------------------------------------------------------- SSH (stage 2)
/** Stage 2: mei's laptop; hq-01 is a remote where mei (sudo, ops) has a password the lesson gives, and cloud-init turned passwords on. */
const laptop: TerminalMachine = {
  id: 'nb', title: 'mei 的筆電 mei-nb（連到 hq-01）', user: 'mei', host: 'mei-nb', cwd: '/home/mei', profile: 'scheduling',
  now: NOW, boot: '2026-11-22 00:30:00', timezone: 'Asia/Taipei', address: '10.20.0.31', keySeed: 'mei-nb',
  files: [dir('/home'), dir('/home/mei', 'mei', 0o750)],
  remotes: [{
    host: 'hq-01', address: '10.20.0.5', aliases: ['hq'], hostKey: 'hq-01-ed25519-2025', passwords: ['mei'],
    accounts: {
      users: [{ name: 'learner', uid: 1000, shell: '/bin/bash' }, { name: 'mei', uid: 1003, group: 'mei', shell: '/bin/bash' }],
      groups: [{ name: 'ops', gid: 1003, members: ['learner', 'mei'] }, { name: 'mei', gid: 1004 }, { name: 'sudo', members: ['learner', 'mei'] }],
    },
    files: [
      dir('/etc'), dir('/etc/ssh'), dir('/etc/ssh/sshd_config.d'), file('/etc/ssh/sshd_config.d/50-cloud-init.conf', 'PasswordAuthentication yes\n'),
      file('/etc/motd', 'hq-01: company server (orders, backups). Record every change in /srv/ops/CHANGELOG.\n'),
      dir('/home'), dir('/home/learner', 'learner', 0o750), dir('/home/mei', 'mei', 0o750),
    ],
  }],
};

// ---------------------------------------------------------------------------------------------------- exercises
const ACCOUNTS_SOLUTION = ['sudo groupadd ops', 'sudo useradd -m -s /bin/bash -G sudo,ops mei', 'sudo usermod -G ops kai', 'sudo usermod -aG ops learner',
  'sudo mkdir /srv/ops', 'sudo chown root:ops /srv/ops', 'sudo chmod 770 /srv/ops', 'ls -ld /srv/ops', 'id mei'];
const swap = (list: string[], from: string, to: string) => list.map(c => c === from ? to : c);
const KEY_ONLY = "ssh mei@hq-01 'echo PasswordAuthentication no | sudo tee /etc/ssh/sshd_config.d/10-key-only.conf'";
const SSH_SOLUTION = ["ssh-keygen -t ed25519 -N '' -f ~/.ssh/id_ed25519", 'ssh-keyscan hq-01 > hq.keys', 'ssh-keygen -l -f hq.keys', 'cat hq.keys >> ~/.ssh/known_hosts',
  'ssh-copy-id mei@hq-01', 'ssh -o BatchMode=yes mei@hq-01 hostname', KEY_ONLY, 'ssh mei@hq-01 sudo sshd -t', 'ssh mei@hq-01 sudo systemctl reload ssh',
  'ssh -o BatchMode=yes mei@hq-01 sudo sshd -T | grep passwordauthentication'];
const SERVICE_SOLUTION = ['cat /opt/orderdesk/README', 'sudo useradd -r -s /usr/sbin/nologin -d /var/lib/orderdesk orderdesk', 'sudo chown orderdesk:orderdesk /var/lib/orderdesk /var/log/orderdesk',
  'sudo chmod 750 /var/lib/orderdesk', printfTee(ORDERDESK_LINES, ORDERDESK_PATH), 'sudo systemctl daemon-reload', 'sudo systemctl enable --now orderdesk',
  'systemctl status orderdesk', 'pgrep -u orderdesk -a orderdesk'];
const FIX_SOLUTION = ['sudo journalctl -u orderdesk -p err --since today', 'grep data_dir /etc/orderdesk/orderdesk.conf', 'sudo mkdir -p /srv/orderdesk/data',
  'sudo cp /var/lib/orderdesk/orders.db /srv/orderdesk/data/', 'sudo chown -R orderdesk:orderdesk /srv/orderdesk/data', 'sudo chmod 750 /srv/orderdesk/data',
  'sudo systemctl restart orderdesk', 'systemctl is-active orderdesk'];
const WRITE_BACKUP = printfTee(BACKUP_LINES, BACKUP_PATH);
const INSTALL_CRON = `echo '${CRON_LINE}' | sudo tee /etc/cron.d/orderdesk-backup`;
const BACKUP_SOLUTION = ['sudo kill 4410', 'sudo rm /etc/cron.d/old-backup', WRITE_BACKUP, `sudo chmod 755 ${BACKUP_PATH}`, INSTALL_CRON, 'sudo cron-run',
  'sudo cat /var/log/orderdesk-backup.log'];
const UPDATE_SOLUTION = ['sudo apt update', 'apt list --upgradable', 'cat /opt/orderdesk/NEWS', 'sudo apt-mark hold orderdesk', 'sudo apt upgrade -y',
  `echo '${CHANGE_NOTE}' >> /srv/ops/CHANGELOG`, 'apt-mark showhold'];

const exercises: TerminalExercise[] = [
  {
    id: 'lnx15-accounts', title: '第一關：帳號、群組與共用目錄', machine: 'hq',
    statement: '你剛接手 hq-01。請依帳號規劃完成五件事：(1) 建立群組 `ops`；(2) 建立第二位管理員 `mei`：要有家目錄、登入 shell 是 `/bin/bash`、附加群組是 `sudo` 與 `ops`；(3) 實習生 `kai` 只需要使用共用目錄，讓他的附加群組只剩 `ops`（離開 `sudo`）；(4) 你自己（learner）也加入 `ops`，而且必須保留 `sudo`；(5) 建立共用目錄 `/srv/ops`，擁有者 root、群組 ops，擁有者與群組可以讀、寫、進入，其他人沒有任何權限。',
    checks: [
      { kind: 'group', name: 'ops', members: ['learner', 'kai', 'mei'] },
      { kind: 'user', name: 'mei', groups: ['sudo', 'ops'], shell: '/bin/bash', home: '/home/mei' },
      { kind: 'exists', path: '/home/mei', type: 'dir' },
      { kind: 'user', name: 'kai', groups: ['ops'], notGroups: ['sudo'] },
      { kind: 'user', name: 'learner', groups: ['sudo', 'ops'] },
      { kind: 'owner', path: '/srv/ops', owner: 'root', group: 'ops' },
      { kind: 'mode', path: '/srv/ops', mode: 0o770 },
    ],
    solution: ACCOUNTS_SOLUTION,
    mistakes: [
      { commands: swap(ACCOUNTS_SOLUTION, 'sudo usermod -aG ops learner', 'sudo usermod -G ops learner'), why: '少了 `-a`：`-G` 把 learner 的附加群組整個換成 ops，你把自己移出了 sudo。目前的工作階段還留著舊的群組，所以一時看不出來，下次登入就沒有管理權限了。' },
      { commands: swap(ACCOUNTS_SOLUTION, 'sudo usermod -G ops kai', 'sudo usermod -aG ops kai'), why: '`-aG` 是附加：kai 多了 ops，卻仍然在 sudo 裡，實習生還是能以 root 做任何事。這裡正好要用沒有 `-a` 的 `-G` 把清單換掉。' },
      { commands: swap(ACCOUNTS_SOLUTION, 'sudo useradd -m -s /bin/bash -G sudo,ops mei', 'sudo useradd -s /bin/bash -G sudo,ops mei'), why: '少了 `-m`：Ubuntu 的 useradd 預設不建立家目錄，mei 登入後沒有自己的家，之後也放不了 `~/.ssh/authorized_keys`。' },
      { commands: swap(ACCOUNTS_SOLUTION, 'sudo chmod 770 /srv/ops', 'sudo chmod 775 /srv/ops'), why: '775 讓其他人也能列出與進入目錄，看到裡面的維運文件；共用目錄只給 ops 群組，其他人應該是 0。' },
      { commands: ACCOUNTS_SOLUTION.filter(c => c !== 'sudo chown root:ops /srv/ops'), why: '沒有把群組改成 ops：目錄是 root:root 770，除了 root 誰都進不去，群組權限給錯了對象。' },
    ],
    hints: [
      '先 `sudo groupadd ops`，useradd 的 `-G` 才找得到這個群組。',
      'useradd：`-m` 建立家目錄、`-s` 指定 shell、`-G` 列出附加群組（以逗號分隔、沒有空白）。',
      'usermod 的 `-G` 會取代整份清單，`-aG` 才是附加：一個用在 kai，另一個用在你自己。',
      '目錄的群組用 `chown root:ops`，權限用 `chmod 770`。',
    ],
    explanation: '`groupadd` 先建立 ops；`useradd -m -s /bin/bash -G sudo,ops mei` 一次建立家目錄、shell 與附加群組。kai 要離開 sudo，正好用會取代清單的 `usermod -G ops kai`；你自己要保留 sudo，必須用 `usermod -aG ops learner`。`/srv/ops` 是 root:ops 770：擁有者與群組可以讀寫進入，其他人什麼都看不到。最後用 `ls -ld` 與 `id mei` 驗證，並把這些變更寫進變更紀錄。',
  },
  {
    id: 'lnx15-keys', title: '第二關：金鑰登入，然後關掉密碼', machine: 'nb',
    statement: `你在 mei 的筆電上（提示字元是 mei@mei-nb）。請讓 mei 以 ed25519 金鑰（沒有密語，放在預設的 \`~/.ssh/id_ed25519\`）登入 hq-01，然後讓 hq-01 不再接受密碼登入，金鑰登入要繼續可用。hq-01 的主機金鑰指紋（從雲端主控台抄下）是 \`${HQ_FINGERPRINT}\`，加入 known_hosts 之前請先核對。mei 在 hq-01 的密碼由模擬環境代為輸入，她在 hq-01 可以用 sudo。注意 Ubuntu 雲端映像的 \`/etc/ssh/sshd_config.d/50-cloud-init.conf\`。`,
    checks: [
      { kind: 'known-host', host: 'hq-01' },
      { kind: 'ssh', host: 'hq-01', user: 'mei', method: 'publickey', allowed: true },
      { kind: 'ssh', host: 'hq-01', user: 'mei', method: 'password', allowed: false },
      { kind: 'mode', host: 'hq-01', path: '/home/mei/.ssh/authorized_keys', mode: 0o600 },
    ],
    solution: SSH_SOLUTION,
    mistakes: [
      { commands: ["ssh-keygen -t ed25519 -N '' -f ~/.ssh/id_ed25519", 'ssh-keyscan hq-01 >> ~/.ssh/known_hosts', KEY_ONLY, 'ssh mei@hq-01 sudo systemctl reload ssh', 'ssh-copy-id mei@hq-01'],
        why: '順序反了：先關掉密碼，ssh-copy-id 就無法用密碼登入去安裝公鑰，mei 從此兩種方式都進不去（真實世界要到主控台救援）。一定要先確認金鑰能登入，再關密碼。' },
      { commands: [...SSH_SOLUTION.slice(0, 6), "ssh mei@hq-01 'echo PasswordAuthentication no | sudo tee -a /etc/ssh/sshd_config'", 'ssh mei@hq-01 sudo systemctl reload ssh'],
        why: '寫在 sshd_config 的最後沒有效果：Ubuntu 在檔案開頭就 Include 了 `sshd_config.d/*.conf`，50-cloud-init.conf 的 `PasswordAuthentication yes` 先出現，sshd 採用第一個值。' },
      { commands: [...SSH_SOLUTION.slice(0, 7)], why: '設定檔寫好了，但沒有 `systemctl reload ssh`：sshd 仍使用啟動時讀到的設定，密碼登入還開著。' },
      { commands: ["ssh-keygen -t ed25519 -N '' -f ~/.ssh/id_ed25519", 'ssh-copy-id mei@hq-01'], why: 'known_hosts 裡還沒有 hq-01，模擬環境沒有鍵盤回答「Are you sure you want to continue connecting」，主機驗證失敗，公鑰沒有裝上去。' },
    ],
    hints: [
      '`ssh-keyscan hq-01 > hq.keys` 取得主機金鑰，`ssh-keygen -l -f hq.keys` 算出指紋，和題目給的比對後再附加到 `~/.ssh/known_hosts`。',
      '`ssh-copy-id mei@hq-01` 用密碼登入一次，把公鑰附加到 authorized_keys；之後用 `ssh -o BatchMode=yes` 確認不需要密碼。',
      'sshd 的同一個設定以第一次出現的為準：新增一個檔名排在 50 之前的 `.d` 檔案，例如 `10-key-only.conf`。',
      '改完先 `sudo sshd -t` 檢查語法，再 `sudo systemctl reload ssh`。',
    ],
    explanation: '先在筆電產生金鑰，用 ssh-keyscan 取得主機金鑰並核對指紋，確認是 hq-01 本人才加入 known_hosts（這一步擋下的是中間人攻擊）。ssh-copy-id 以密碼登入一次，把公鑰放進 700 的 `~/.ssh` 與 600 的 authorized_keys；`BatchMode=yes` 的登入成功，證明金鑰可用。接著才寫 `/etc/ssh/sshd_config.d/10-key-only.conf`：10 排在 50-cloud-init.conf 之前，所以 `PasswordAuthentication no` 是第一個值。`sshd -t` 沒有錯誤後 reload，`sshd -T` 顯示 passwordauthentication no，而已經連著的工作階段不受影響。',
  },
  {
    id: 'lnx15-service', title: '第三關：以專用帳號部署 OrderDesk', machine: 'deploy',
    statement: 'OrderDesk 已經由廠商的套件裝在 `/opt/orderdesk`，說明在 `/opt/orderdesk/README`。請：(1) 建立系統帳號 `orderdesk`（`useradd -r`），家目錄設為 `/var/lib/orderdesk`、登入 shell 是 `/usr/sbin/nologin`；(2) 讓 `/var/lib/orderdesk` 與 `/var/log/orderdesk` 都屬於 orderdesk:orderdesk，資料目錄的權限是 750；(3) 寫 `/etc/systemd/system/orderdesk.service`，內容依序是這 12 行：`[Unit]`、`Description=OrderDesk order service`、`After=network.target`、空行、`[Service]`、`ExecStart=/opt/orderdesk/bin/orderdesk --config /etc/orderdesk/orderdesk.conf`、`User=orderdesk`、`Restart=on-failure`、`RestartSec=1`、空行、`[Install]`、`WantedBy=multi-user.target`；(4) 讓服務現在就執行，而且開機時自動啟動。模擬環境沒有文字編輯器，可以用 `printf \'%s\\n\' \'第一行\' \'第二行\' … | sudo tee 檔案` 寫入（每個單引號括起來的字是一行，`\'\'` 是空行）。',
    checks: [
      { kind: 'user', name: 'orderdesk', uid: 999, shell: NOLOGIN, home: '/var/lib/orderdesk' },
      { kind: 'owner', path: '/var/lib/orderdesk', owner: 'orderdesk', group: 'orderdesk' },
      { kind: 'mode', path: '/var/lib/orderdesk', mode: 0o750 },
      { kind: 'owner', path: '/var/log/orderdesk', owner: 'orderdesk', group: 'orderdesk' },
      { kind: 'content', path: ORDERDESK_PATH, content: ORDERDESK_UNIT },
      { kind: 'service', unit: 'orderdesk', active: 'active', enabled: true },
      { kind: 'process', name: 'orderdesk', user: 'orderdesk' },
    ],
    solution: SERVICE_SOLUTION,
    mistakes: [
      { commands: swap(SERVICE_SOLUTION, printfTee(ORDERDESK_LINES, ORDERDESK_PATH), printfTee(ORDERDESK_LINES.filter(l => l !== 'User=orderdesk'), ORDERDESK_PATH)),
        why: '少了 `User=orderdesk`：服務以 root 執行，README 明說不可以；程式一旦有漏洞，攻擊者拿到的就是整台機器。' },
      { commands: swap(SERVICE_SOLUTION, 'sudo useradd -r -s /usr/sbin/nologin -d /var/lib/orderdesk orderdesk', 'sudo useradd orderdesk'),
        why: '少了 `-r`、`-s` 與 `-d`：帳號拿到一般使用者的 UID（1000 以上）、可以登入的 `/bin/sh` 與不存在的 `/home/orderdesk`。服務帳號應該是不能登入的系統帳號。' },
      { commands: swap(SERVICE_SOLUTION, 'sudo systemctl enable --now orderdesk', 'sudo systemctl start orderdesk'), why: '只有 start：服務現在執行了，但沒有 enable，下次重新開機後 OrderDesk 不會自己回來。' },
      { commands: SERVICE_SOLUTION.filter(c => !c.startsWith('sudo chown')), why: '資料與日誌目錄仍屬於 root，orderdesk 帳號寫不進去：真實的程式會在第一次寫入時失敗。' },
    ],
    hints: [
      '`useradd -r` 建立系統帳號（UID 小於 1000、預設不建立家目錄），`-s /usr/sbin/nologin` 讓它不能登入，`-d` 指定家目錄。',
      '`chown orderdesk:orderdesk` 可以一次給兩個目錄；`chmod 750` 只給資料目錄。',
      '寫好 unit 檔後 `sudo systemctl daemon-reload`，再 `sudo systemctl enable --now orderdesk`。',
      '`systemctl status orderdesk` 與 `pgrep -u orderdesk -a orderdesk` 確認服務在跑、而且不是 root。',
    ],
    explanation: '服務帳號是最小權限的第一步：orderdesk 只擁有自己的資料與日誌目錄，不能登入、不在 sudo。unit 檔的 `User=orderdesk` 讓 systemd 以這個帳號啟動程式，`Restart=on-failure` 與 `RestartSec=1` 讓程式異常結束時一秒後重新啟動（連續失敗太快會撞到啟動上限，第四關會看到），`WantedBy=multi-user.target` 讓 `enable` 建立開機啟動的連結。status 顯示 active (running)，pgrep 只在 orderdesk 帳號下找到主行程。',
  },
  {
    id: 'lnx15-fix', title: '第四關：依日誌修好 OrderDesk', machine: 'incident',
    statement: '下午一點多，業務回報訂單系統打不開。依 `/srv/ops/CHANGELOG`，mei 今天把 OrderDesk 的資料搬到 `/srv/orderdesk/data` 的計畫是正確的，設定檔已經改好，不要再改它。請從 `systemctl status` 與 journal 找出 OrderDesk 失敗的原因並修好：新的資料目錄要屬於 orderdesk:orderdesk、權限 750，把舊資料 `/var/lib/orderdesk/orders.db` 複製過去（新檔案也屬於 orderdesk），舊的資料先原樣留著當作回復的退路，最後讓服務恢復執行。',
    checks: [
      { kind: 'service', unit: 'orderdesk', active: 'active' },
      { kind: 'owner', path: '/srv/orderdesk/data', owner: 'orderdesk', group: 'orderdesk' },
      { kind: 'mode', path: '/srv/orderdesk/data', mode: 0o750 },
      { kind: 'content', path: '/srv/orderdesk/data/orders.db', content: ORDERS },
      { kind: 'owner', path: '/srv/orderdesk/data/orders.db', owner: 'orderdesk', group: 'orderdesk' },
      { kind: 'unchanged', path: '/etc/orderdesk/orderdesk.conf' },
      { kind: 'unchanged', path: '/var/lib/orderdesk' },
    ],
    solution: FIX_SOLUTION,
    mistakes: [
      { commands: ['sudo systemctl restart orderdesk'], why: '原因沒有處理：資料目錄仍然不存在，程式一啟動就印出 FATAL 結束，Restart=on-failure 連續重試五次後又撞到啟動上限，服務還是 failed。' },
      { commands: FIX_SOLUTION.filter(c => c !== 'sudo systemctl restart orderdesk'), why: '目錄與資料都準備好了，但服務在 13:12 就撞到啟動上限停在 failed，systemd 不會自己再試，要手動 restart。' },
      { commands: FIX_SOLUTION.filter(c => !c.startsWith('sudo chown')), why: '目錄與複製的檔案都屬於 root（`sudo cp` 建立的新檔案屬於執行它的 root），orderdesk 帳號寫不進自己的資料；真實的程式會在第一次寫入時失敗。' },
      { commands: swap(FIX_SOLUTION, 'sudo cp /var/lib/orderdesk/orders.db /srv/orderdesk/data/', 'sudo mv /var/lib/orderdesk/orders.db /srv/orderdesk/data/'), why: '用 mv 搬走了唯一的一份舊資料：萬一新位置有問題，就沒有可以回復的退路。變更期間先複製，確認沒問題再清理。' },
      { commands: [`echo -e "${CONF_OLD.trimEnd().split('\n').join('\\n')}" | sudo tee /etc/orderdesk/orderdesk.conf`, 'sudo systemctl restart orderdesk'], why: '題目要求不要修改設定檔：把 data_dir 改回 `/var/lib/orderdesk` 等於推翻了已經決定的搬遷（根目錄已經超過 90%），也沒有和 mei 溝通。要完成的是搬遷，不是回復它。' },
    ],
    hints: [
      '`systemctl status orderdesk` 的最後幾行有程式自己印的 FATAL 訊息；`Start request repeated too quickly` 只是結果。',
      '`sudo journalctl -u orderdesk -p err --since today` 列出今天的錯誤；再看設定檔的 `data_dir`。',
      '`sudo mkdir -p` 建立目錄，`sudo cp` 複製資料，`sudo chown -R orderdesk:orderdesk` 改擁有者，`sudo chmod 750` 改權限。',
      '服務已經撞到啟動上限，修好原因後要 `sudo systemctl restart orderdesk`。',
    ],
    explanation: 'status 是 `failed (Result: exit-code)`，journal 在 13:12:30 到 13:12:34 連續五次記錄 `FATAL data_dir /srv/orderdesk/data: no such file or directory`，之前兩筆 sudo 紀錄顯示 mei 在 13:05 編輯了設定、13:12 重新啟動：原因是設定指向一個沒有人建立的目錄。建立 `/srv/orderdesk/data`、複製資料、把擁有者改成 orderdesk 並設 750 之後重新啟動，服務回到 active。舊資料留在 `/var/lib/orderdesk`，等確認新位置運作正常再清理；最後在 CHANGELOG 記下原因與處理。',
  },
  {
    id: 'lnx15-backup-job', title: '第五關：可靠的備份與排程', machine: 'backup',
    statement: `上一任管理員的備份從今天 02:30 卡到現在（PID 4410），而且它的指令稿沒有任何錯誤檢查。請：(1) 結束這個卡住的行程；(2) 刪除舊的排程 \`/etc/cron.d/old-backup\`；(3) 寫新的備份指令稿 \`${BACKUP_PATH}\`，內容依序是這 6 行：${BACKUP_LINES.map(l => `\`${l}\``).join('、')}，並讓所有人可以執行、只有 root 可以修改（755）；(4) 新增 \`/etc/cron.d/orderdesk-backup\`，內容是一行：\`${CRON_LINE}\`；(5) 用教學輔助指令 \`sudo cron-run\` 以 cron 的方式執行一次，確認備份檔 \`/srv/backup/orderdesk/orders-2026-11-22.db\` 真的出現了。`,
    checks: [
      { kind: 'process', pid: 4410, absent: true },
      { kind: 'cron', command: 'old-backup.sh', absent: true },
      { kind: 'cron', user: 'root', source: '/etc/cron.d/orderdesk-backup', schedule: '30 2 * * *', command: `flock -n ${LOCK} ${BACKUP_PATH}` },
      { kind: 'content', path: BACKUP_PATH, content: BACKUP_SCRIPT },
      { kind: 'mode', path: BACKUP_PATH, mode: 0o755 },
      { kind: 'content', path: '/srv/backup/orderdesk/orders-2026-11-22.db', content: ORDERS },
    ],
    solution: BACKUP_SOLUTION,
    mistakes: [
      { commands: BACKUP_SOLUTION.filter(c => c !== 'sudo kill 4410'), why: '卡住的舊備份還持有鎖：cron-run 執行新工作時 `flock -n` 拿不到鎖，立刻放棄而且不印任何東西，備份檔沒有出現。' },
      { commands: swap(BACKUP_SOLUTION, WRITE_BACKUP, printfTee(BACKUP_LINES.filter(l => l !== 'set -euo pipefail'), BACKUP_PATH)), why: '少了 `set -euo pipefail`：今天看起來能用，但任何一步失敗（例如備份目錄的磁碟滿了）指令稿仍會繼續，最後照樣印出 done、以 0 結束，就像舊的指令稿一樣。' },
      { commands: BACKUP_SOLUTION.filter(c => !c.startsWith('sudo chmod')), why: '指令稿沒有執行權限：cron 執行它時得到 Permission denied（結束碼 126），沒有產生備份。' },
      { commands: swap(BACKUP_SOLUTION, INSTALL_CRON, `echo '30 2 * * * root ${BACKUP_PATH} >> /var/log/orderdesk-backup.log 2>&1' | sudo tee /etc/cron.d/orderdesk-backup`), why: '少了 `flock -n`：上一次還沒跑完時，下一次會同時再跑一份，兩份同時寫同一個備份檔，結果可能是一個壞掉的備份。' },
      { commands: BACKUP_SOLUTION.filter(c => c !== 'sudo rm /etc/cron.d/old-backup'), why: '舊的排程還在：每天 02:30 仍會執行那支會把資料複製到錯誤位置、失敗也回報成功的舊指令稿。' },
    ],
    hints: [
      '`ps -o pid,user,args -p 4410` 看看它是誰；root 的行程要 `sudo kill 4410`。',
      '`printf \'%s\\n\' \'第一行\' \'第二行\' … | sudo tee 檔案 > /dev/null` 可以寫多行；`$(date +%F)` 放在單引號裡，留給指令稿執行時才展開。',
      '`/etc/cron.d` 的每一行在時間之後多一個使用者欄位（這裡是 root）；用 `echo \'…\' | sudo tee 檔案` 寫入。',
      '`sudo cron-next -l` 看排程，`sudo cron-run` 執行下一批到期的工作，之後 `sudo cat /var/log/orderdesk-backup.log`。',
    ],
    explanation: '舊備份持有 `/var/lock/orderdesk-backup.lock`，所以先結束它，新工作的 `flock -n` 才拿得到鎖。新指令稿以 `set -euo pipefail` 開頭：任何一步失敗、用到沒有設定的變數、管線中任何一段失敗都會立刻停止並傳回非零的結束碼，不會像舊指令稿那樣在 `cd` 失敗後還把資料複製到錯的地方、照樣印出 backup done。cron.d 的那一行以 root 每天 02:30 執行，用 flock 避免重疊，輸出附加到日誌檔（伺服器沒有郵件系統，cron 會丟掉沒有導向的輸出）。cron-run 之後備份檔與日誌都出現了：排程不只要設定，還要真的跑過一次。',
  },
  {
    id: 'lnx15-updates', title: '第六關：更新與變更紀錄', machine: 'update',
    statement: `hq-01 有更新在等待。請先更新套件清單並看看有哪些可以升級。OrderDesk 2.0 需要先停機、備份並遷移資料（見 \`/opt/orderdesk/NEWS\`），今天不做，所以請把 \`orderdesk\` 鎖定在目前的版本，其他套件（包含安全更新）全部升級。最後把這一行附加到變更紀錄 \`/srv/ops/CHANGELOG\` 的最後面（原有的內容要保留）：\`${CHANGE_NOTE}\`。`,
    checks: [
      { kind: 'package', name: 'orderdesk', version: '1.4.2-1', held: true },
      { kind: 'package', name: 'openssl', version: OPENSSL_NEW },
      { kind: 'package', name: 'sudo', version: SUDO_NEW },
      { kind: 'content', path: '/srv/ops/CHANGELOG', content: lines(...CHANGES, CHANGE_NOTE) },
    ],
    solution: UPDATE_SOLUTION,
    mistakes: [
      { commands: UPDATE_SOLUTION.filter(c => c !== 'sudo apt-mark hold orderdesk'), why: '沒有鎖定：apt upgrade 把 OrderDesk 一起升到 2.0.0-1，跳過了 NEWS 要求的停機、備份與資料遷移。' },
      { commands: ['sudo apt update', 'sudo apt upgrade -y', 'sudo apt-mark hold orderdesk', `echo '${CHANGE_NOTE}' >> /srv/ops/CHANGELOG`], why: '順序錯了：先升級才鎖定，OrderDesk 已經是 2.0.0-1，hold 只是把錯誤的版本鎖住。' },
      { commands: swap(UPDATE_SOLUTION, `echo '${CHANGE_NOTE}' >> /srv/ops/CHANGELOG`, `echo '${CHANGE_NOTE}' > /srv/ops/CHANGELOG`), why: '`>` 會先清空檔案：今天所有的變更紀錄都被這一行蓋掉了。附加要用 `>>`。' },
      { commands: swap(UPDATE_SOLUTION, 'sudo apt-mark hold orderdesk', 'apt-mark hold orderdesk'), why: '沒有 sudo：apt-mark 回報需要 superuser，hold 沒有生效，接著的 apt upgrade 就把 OrderDesk 升級了。' },
    ],
    hints: [
      '`sudo apt update` 之後用 `apt list --upgradable` 看有哪些可以升級。',
      '`sudo apt-mark hold orderdesk` 要在 `sudo apt upgrade -y` 之前；升級時它會出現在 kept back。',
      '你在 ops 群組，`/srv/ops/CHANGELOG` 是 root:ops 664，可以直接用 `echo \'…\' >> 檔案` 附加。',
    ],
    explanation: '`apt list --upgradable` 列出四個套件：openssl 與 libssl3t64、sudo 的安全更新，以及 OrderDesk 2.0.0-1。先 `apt-mark hold orderdesk`，`apt upgrade -y` 就把它列在 kept back，只升級其他三個。hold 是暫時的決定，要寫下原因與解除的條件，所以最後用 `>>` 把一行附加到 CHANGELOG（`>` 會清空整份紀錄）。真實的伺服器在函式庫更新後，還要重新啟動仍在使用舊版函式庫的服務。',
  },
];

export const LNX15: LessonContent = {
  lessonId: 'LNX15',
  motivation: '公司唯一的那台伺服器 hq-01 要交給你了：上一任管理員已經離職，留下一個仍有 sudo 的實習生帳號、一份從沒檢查過的備份、還開著密碼登入的 SSH，以及一個今天要上線的訂單系統 OrderDesk。前面十四堂課分別學了帳號、權限、服務、日誌、套件、SSH、指令稿與排程，但真實的維運不會一次只考一個主題：一個服務停擺，可能同時牽涉設定檔、目錄權限、服務帳號與啟動上限。這堂綜合專題把整座島接成一天的工作，六個關卡依序完成帳號與權限規劃、SSH 存取、服務部署、日誌追查、排程備份，以及更新與檢查清單，每一關都要在模擬的伺服器上動手，而且要留下讓下一個人接得起來的紀錄。',
  sections: [
    {
      id: 'lnx15-s-overview', title: '接手 hq-01：先盤點，再動手',
      blocks: [
        { type: 'p', text: '情境：一家小公司的伺服器 hq-01（Ubuntu 24.04，位址 10.20.0.5，時區 Asia/Taipei）。你以 learner 登入，有 sudo；mei 是新加入的第二位管理員；kai 是實習生；OrderDesk 是廠商提供的訂單系統，套件已經裝在 `/opt/orderdesk`。根目錄所在的磁碟比較小，另一顆較大的磁碟掛在 `/srv`。模擬的時鐘固定在 2026-11-22 14:00（台北時間 CST），每一關的機器是 hq-01 在那一關開始時的樣子，所以前一關做錯了也不影響下一關。' },
        { type: 'table', head: ['關卡', '要做的事', '交出的成果', '用到的課'], rows: [
          ['1. 帳號與權限規劃', '建立 ops 群組與第二位管理員 mei、收回實習生的 sudo、建立共用目錄', '帳號表、root:ops 770 的 `/srv/ops`', 'LNX06、LNX07'],
          ['2. SSH 存取', '核對主機指紋、安裝 mei 的公鑰、關閉密碼登入', '只接受金鑰的 sshd', 'LNX12、LNX07'],
          ['3. 服務部署', '以專用的系統帳號執行 OrderDesk，失敗時自動重新啟動、開機時啟動', '`orderdesk.service`', 'LNX06、LNX07、LNX10'],
          ['4. 日誌追查', '從 status、journal、sudo 紀錄與應用程式日誌找出停擺原因並修復', '恢復的服務與事件紀錄', 'LNX05、LNX10、LNX11'],
          ['5. 排程備份', '結束卡住的舊備份、寫會在錯誤時停止的指令稿、以 cron 與 flock 排程並實際跑一次', '`/etc/cron.d/orderdesk-backup` 與第一份備份', 'LNX08、LNX13、LNX14'],
          ['6. 更新與檢查清單', '套用安全更新、鎖定需要遷移的套件、寫下變更紀錄與檢查清單', '更新後的系統、CHANGELOG', 'LNX09、LNX05'],
        ] },
        { type: 'p', text: '接手一台不熟悉的伺服器，第一件事不是修改，而是盤點：有哪些帳號、誰有 sudo、跑著哪些服務、排了哪些工作、磁碟還剩多少。盤點的結果就是後面每一關的依據。下面的紀錄是接手當天的盤點：kai 仍在 sudo 群組、根目錄已經用了 92%、`/etc/cron.d` 裡有上一任管理員的備份工作，而那支備份從今天 02:30 到現在還沒結束。這三件事分別在第一、三、五關處理。' },
        { type: 'example', id: 'lnx15-survey' },
        { type: 'callout', tone: 'tip', title: '一次改一件事，每一步都驗證', text: '每一關都照同樣的節奏：先看現況，只改一件事，立刻用指令驗證（`id`、`ls -ld`、`systemctl status`、`ssh -o BatchMode=yes`），最後把變更寫進 `/srv/ops/CHANGELOG`。一次改很多地方，出問題時就分不清是哪一個改動造成的；沒有驗證的修改，只是「應該好了」。' },
      ],
    },
    {
      id: 'lnx15-s-accounts', title: '第一關：帳號與權限規劃',
      blocks: [
        { type: 'p', text: '帳號與權限規劃的原則是最小權限：每個人、每個服務只拿到完成工作需要的權限，不多也不少。先把規劃寫成一張表，再照表執行，之後的人也能從表上看出「為什麼 kai 不在 sudo」。' },
        { type: 'table', head: ['帳號', '用途', '群組', '登入'], rows: [
          ['learner（你）', '主要管理員', 'sudo、ops', '`/bin/bash`、SSH 金鑰'],
          ['mei', '第二位管理員（休假與緊急時的備援）', 'sudo、ops', '`/bin/bash`、SSH 金鑰（第二關）'],
          ['kai', '實習生，只上傳出貨單到共用目錄', 'ops', '`/bin/bash`，不需要 sudo'],
          ['orderdesk', 'OrderDesk 服務自己（第三關）', 'orderdesk', '`/usr/sbin/nologin`，不能登入'],
        ] },
        { type: 'p', text: '`useradd -m -s /bin/bash -G sudo,ops mei` 一次建立家目錄（`-m`，Ubuntu 的 useradd 預設不建立）、登入 shell 與附加群組。修改既有帳號時要分清楚兩種寫法：`usermod -aG ops learner` 是附加，`usermod -G ops kai` 是把附加群組整份換成 ops。後者正好用來收回 kai 的 sudo，但用在自己身上就會把自己移出 sudo。群組的變更寫在帳號資料裡，已經登入的工作階段要重新登入（或 `newgrp`）才會帶著新群組。' },
        { type: 'p', text: '共用目錄 `/srv/ops` 屬於 root、群組 ops、權限 770：擁有者與群組可以讀、寫、進入，其他人連列出內容都不行。真實系統上通常再加上 setgid 位元（`chmod 2770`），讓目錄裡新建的檔案自動屬於 ops 群組，大家才能互相修改；模擬環境的權限只到 0777，不模擬特殊位元，這一點只在課文說明。變更紀錄 `/srv/ops/CHANGELOG` 也放在這裡，權限是 root:ops 664，ops 的成員都能附加。' },
        { type: 'callout', tone: 'warning', title: '`usermod -G` 不是「加入群組」', text: '很多人以為 `sudo usermod -G ops learner` 只是把 learner 加進 ops，實際上它把附加群組整份換成 ops，learner 就離開了 sudo。更危險的是目前的工作階段還保有舊的群組，sudo 暫時照樣能用，要到下次登入才發現自己失去了管理權限，而如果你是唯一的管理員，就只能從主控台救援。加入群組一律寫 `-aG`；確實要取代清單時，先 `id 使用者` 看清楚現在有哪些群組。' },
      ],
    },
    {
      id: 'lnx15-s-ssh', title: '第二關：SSH 只接受金鑰',
      blocks: [
        { type: 'p', text: '雲端主機開好時，Ubuntu 的映像常帶著 `/etc/ssh/sshd_config.d/50-cloud-init.conf`，裡面是 `PasswordAuthentication yes`。只要密碼登入開著，網路上的掃描程式就會不停猜密碼。目標是：每位管理員用自己的金鑰登入，伺服器不再接受密碼。順序非常重要，因為關掉密碼之後，還沒有裝好金鑰的人就再也進不來了：' },
        { type: 'list', ordered: true, items: [
          '在自己的電腦產生金鑰：`ssh-keygen -t ed25519`，私鑰留在自己的電腦，永遠不複製到伺服器。',
          '第一次連線前核對主機指紋：`ssh-keyscan hq-01 > hq.keys` 取得主機金鑰，`ssh-keygen -l -f hq.keys` 算出指紋，和雲端主控台顯示的比對，一致才加入 `~/.ssh/known_hosts`。這一步防的是有人冒充 hq-01（中間人攻擊）。',
          '`ssh-copy-id mei@hq-01` 用密碼登入最後一次，把公鑰附加到 hq-01 的 `~/.ssh/authorized_keys`（700 的 `.ssh`、600 的檔案）。',
          '確認金鑰登入：`ssh -o BatchMode=yes mei@hq-01 hostname`，BatchMode 不會退回去問密碼。',
          '寫 `/etc/ssh/sshd_config.d/10-key-only.conf`（`PasswordAuthentication no`），`sudo sshd -t` 檢查語法，再 `sudo systemctl reload ssh`。',
          '另開一個連線確認仍然進得去，再關掉原本的工作階段。reload 不會中斷已經連著的連線，這個保留著的連線就是你的退路。',
        ] },
        { type: 'p', text: '為什麼是 `10-`？sshd 的同一個設定以第一次出現的值為準，而 Ubuntu 的 `sshd_config` 在檔案開頭（任何設定之前）就 `Include /etc/ssh/sshd_config.d/*.conf`，檔案依名稱排序展開。10-key-only.conf 排在 50-cloud-init.conf 前面，所以 `no` 先出現；寫在 `sshd_config` 的最後面，則永遠輪不到它。`sudo sshd -T` 印出 sshd 實際採用的值，是最可靠的驗證。' },
        { type: 'example', id: 'lnx15-ssh' },
        { type: 'p', text: '接手時還有一件容易忘的事：檢查每個帳號的 `~/.ssh/authorized_keys`，移除上一任管理員與已經離開的人的公鑰。關掉密碼只擋住猜密碼的人，擋不住手上仍有私鑰的人。' },
      ],
    },
    {
      id: 'lnx15-s-service', title: '第三關：服務部署',
      blocks: [
        { type: 'p', text: '服務部署要回答三個問題：程式以誰的身分執行、可以寫哪些地方、出問題時誰把它拉起來。OrderDesk 的 README 寫著「不要以 root 執行」，所以先建立專用的系統帳號：`sudo useradd -r -s /usr/sbin/nologin -d /var/lib/orderdesk orderdesk`。`-r` 讓 UID 落在系統帳號的範圍（小於 1000）、預設不建立家目錄，`nologin` 讓它不能登入。再把資料目錄與日誌目錄交給它（`chown orderdesk:orderdesk`），資料目錄設成 750。這樣即使 OrderDesk 有漏洞，攻擊者也只拿到一個不能登入、只能寫自己目錄的帳號。' },
        { type: 'table', head: ['unit 檔的行', '作用', '對應的課'], rows: [
          ['`Description=OrderDesk order service`', 'status 與日誌裡顯示的名字', 'LNX10'],
          ['`After=network.target`', '開機時排在網路設定之後啟動', 'LNX10'],
          ['`ExecStart=/opt/orderdesk/bin/orderdesk --config …`', '程式的絕對路徑與參數；路徑錯了是 203/EXEC', 'LNX10'],
          ['`User=orderdesk`', '以專用帳號執行，不是 root；帳號不存在是 217/USER', 'LNX06、LNX10'],
          ['`Restart=on-failure`、`RestartSec=1`', '異常結束時一秒後重新啟動；預設 10 秒內連續啟動 5 次就停止（啟動上限）', 'LNX10'],
          ['`WantedBy=multi-user.target`', '`enable` 在 `multi-user.target.wants` 建立連結，開機時啟動', 'LNX10'],
        ] },
        { type: 'p', text: '寫好 `/etc/systemd/system/orderdesk.service` 之後，`sudo systemctl daemon-reload` 讓 systemd 讀入，`sudo systemctl enable --now orderdesk` 同時打開「開機啟動」與「現在執行」兩個開關。最後驗證：`systemctl status orderdesk` 是 active (running)，`pgrep -u orderdesk -a orderdesk` 證明主行程屬於 orderdesk 帳號。' },
        { type: 'callout', tone: 'note', title: '`systemctl start` 沒有錯誤，不代表服務在跑', text: '預設的 `Type=simple` 在程式啟動的那一刻就回報成功，就算程式下一秒就因為設定錯誤結束，`start` 也不印任何東西、結束碼是 0。部署後一定要看 `systemctl status`，第四關的停擺就是這樣開始的：重新啟動的指令成功了，服務卻沒有起來。' },
      ],
    },
    {
      id: 'lnx15-s-incident', title: '第四關：日誌追查',
      blocks: [
        { type: 'p', text: '下午一點多，業務說訂單系統打不開。日誌追查不是從猜測開始，而是依固定的順序把證據一層一層找出來：' },
        { type: 'table', head: ['步驟', '指令', '要回答的問題'], rows: [
          ['1. 現況', '`systemctl status orderdesk`', '服務的狀態、什麼時候開始、最後幾行日誌'],
          ['2. 錯誤', '`sudo journalctl -u orderdesk -p err --since today`', '今天第一個錯誤是什麼、在幾點'],
          ['3. 前後經過', '`sudo journalctl --since 13:00 --until 13:12:31`', '出錯之前發生了什麼：誰用 sudo 改了什麼、誰重新啟動'],
          ['4. 對照設定與紀錄', '`grep data_dir /etc/orderdesk/orderdesk.conf`、`cat /srv/ops/CHANGELOG`', '變更的內容與原本的計畫'],
          ['5. 驗證假設', '`ls -ld /srv/orderdesk/data`、`sudo grep -c FATAL /var/log/orderdesk/orderdesk.log`', '錯誤訊息說的事情是不是真的'],
        ] },
        { type: 'p', text: '在模擬的 hq-01 上，status 顯示 `failed (Result: exit-code)`，而且 systemd 印了 `Start request repeated too quickly`：程式在一秒內就結束，Restart=on-failure 連續重試五次後撞到啟動上限，systemd 放棄了。真正的原因要往前找，是程式自己印的 `FATAL data_dir /srv/orderdesk/data: no such file or directory`。sudo 會把每一次以 root 執行的指令記進 journal（誰、在哪個目錄、執行了什麼），所以看得出 mei 在 13:05 編輯了設定、13:12 重新啟動；CHANGELOG 說明了搬遷的理由，而 `ls -ld` 證實新目錄從來沒有建立。' },
        { type: 'example', id: 'lnx15-incident' },
        { type: 'p', text: '找到原因後做最小的修正：建立目錄、複製資料、交給 orderdesk 帳號、設成 750，再 `sudo systemctl restart orderdesk`（撞到啟動上限的服務不會自己再試；在上限的時間窗內要立刻重試，真實系統還需要先 `systemctl reset-failed`）。修正後同樣要驗證 status，並在 CHANGELOG 記下原因、處理方式與時間。注意 OrderDesk 自己的日誌 `/var/log/orderdesk/orderdesk.log` 屬於 adm 群組，learner 不在 adm，要用 sudo 才讀得到。' },
        { type: 'callout', tone: 'warning', title: '最快讓服務起來的方法，不一定是對的修正', text: '把設定改回 `/var/lib/orderdesk` 也能讓 OrderDesk 立刻恢復，但那等於推翻了一個有理由的決定（`/var/lib` 所在的根目錄已經超過 90%），而且沒有和做決定的人溝通，下一次磁碟滿時會再出事。緊急時可以先回復，但要明確記錄、通知相關的人，事後把原本的計畫完成；而用 `mv` 搬走唯一的一份資料，則是讓自己沒有退路。' },
      ],
    },
    {
      id: 'lnx15-s-backup', title: '第五關：排程備份',
      blocks: [
        { type: 'p', text: '上一任管理員的備份有三個問題，正好是排程備份最常見的三種失敗。第一，指令稿沒有任何錯誤檢查：`cd /mnt/nas/orderdesk` 失敗之後，下一行的 `cp` 照樣在「目前的目錄」執行，把資料複製到錯誤的地方，最後還印出 backup done、以 0 結束，cron 與看日誌的人都以為成功了。第二，它備份的是搬遷前的舊路徑。第三，昨晚的那一次卡住了，到現在還持有鎖。' },
        { type: 'p', text: '新的指令稿以 `set -euo pipefail` 開頭：`-e` 讓沒有被檢查的失敗立刻結束指令稿，`-u` 讓沒有設定的變數變成錯誤，`pipefail` 讓管線中任何一段失敗都算失敗。它只用絕對路徑、`mkdir -p` 確保目的地存在、以 `$(date +%F)` 為每天的備份命名，成功時才印出 done。' },
        { type: 'example', id: 'lnx15-backup' },
        { type: 'p', text: '排程用 `/etc/cron.d/orderdesk-backup`，格式比使用者的 crontab 多一個使用者欄位：`30 2 * * * root flock -n /var/lock/orderdesk-backup.lock /usr/local/bin/orderdesk-backup >> /var/log/orderdesk-backup.log 2>&1`。`flock -n` 拿不到鎖時立刻放棄，所以上一次還沒跑完時不會疊上第二份；`>>` 與 `2>&1` 把輸出與錯誤都留在日誌檔，因為伺服器沒有郵件系統，cron 會丟掉沒有導向的輸出。cron 的環境只有很短的 PATH（`/usr/bin:/bin`），所以指令與檔案都寫絕對路徑。' },
        { type: 'table', head: ['', 'cron（`/etc/cron.d`）', 'systemd timer'], rows: [
          ['時間的寫法', '`30 2 * * *`', '`OnCalendar=*-*-* 02:30:00`'],
          ['避免重疊', '自己加 `flock -n`', '同一個服務還在執行時，timer 不會再啟動它'],
          ['輸出與日誌', '要自己導向到檔案（或寄信）', '自動進 journal，`journalctl -u` 查詢'],
          ['關機時錯過的那一次', '不補執行', '`Persistent=true` 在開機後補一次'],
          ['檢查下一次', '`cron-next`（模擬環境的教學輔助）', '`systemctl list-timers`'],
        ] },
        { type: 'p', text: '模擬環境的時鐘不會前進，所以用教學輔助指令 `sudo cron-run` 以 cron 的環境執行下一批到期的工作，確認備份檔真的出現；真實系統可以直接以 root 執行一次指令稿。和 hq-01 放在同一台機器、同一棟大樓的備份，擋不住磁碟損壞以外的災難，正式的做法還要把備份複製到另一個地點（3-2-1 原則：三份資料、兩種媒體、一份在異地）。' },
        { type: 'callout', tone: 'warning', title: '沒有還原過的備份，不算備份', text: 'cron 記錄了 CMD、指令稿以 0 結束，都只代表「有東西跑過」，不代表備份可以用。舊的指令稿每天都回報 backup done，實際上什麼都沒備份到。定期挑一份備份還原到測試環境，確認資料完整、服務能用它啟動，才知道備份真的有效；也要監控備份檔是否每天出現、大小是否合理。' },
      ],
    },
    {
      id: 'lnx15-s-updates', title: '第六關：更新、檢查清單與負責任的維運',
      blocks: [
        { type: 'p', text: '更新與檢查清單是維運的日常。`sudo apt update` 取得最新的套件清單，`apt list --upgradable` 列出可以升級的套件；安全更新（來自 noble-security）應該盡快套用，Ubuntu 伺服器預設以 unattended-upgrades 自動安裝安全更新。會改變資料格式的大版本則要排定時間：OrderDesk 2.0 需要停機、備份與資料遷移，所以先 `sudo apt-mark hold orderdesk`，再 `sudo apt upgrade -y` 升級其他套件，被鎖定的套件會列在 kept back。hold 是暫時的決定，要寫下原因與解除的條件，不然半年後就沒有人記得為什麼它停在舊版。' },
        { type: 'p', text: '升級函式庫（例如 libssl3t64）之後，已經在執行的程式仍然使用記憶體裡的舊版本，要重新啟動那些服務才會用到修補後的版本；很多發行版有 needrestart 這類工具，列出（或依設定自動重新啟動）仍在使用舊版本的服務；有些套件的維護腳本也會重新啟動自己的服務，但不能假設每個服務都被處理了。核心更新則要重新開機才生效。這些都要排在大家知道的維護時段，並寫進變更紀錄。' },
        { type: 'example', id: 'lnx15-apt' },
        { type: 'table', head: ['時機', '檢查項目', '指令'], rows: [
          ['每天', '服務在跑嗎？有沒有新的錯誤？', '`systemctl --failed`、`sudo journalctl -p err --since yesterday`'],
          ['每天', '備份有沒有產生？', '`sudo ls -l /srv/backup/orderdesk`、`sudo tail /var/log/orderdesk-backup.log`'],
          ['每週', '磁碟空間', '`df -h`'],
          ['每週', '可以升級的套件與被鎖定的套件', '`apt list --upgradable`、`apt-mark showhold`'],
          ['每月', '帳號與金鑰：誰有 sudo、誰的公鑰還在', '`grep sudo /etc/group`、各帳號的 `~/.ssh/authorized_keys`'],
          ['每季', '還原一份備份到測試環境', '依還原步驟實際操作'],
          ['每次變更後', '驗證並記錄', '`systemctl status`、附加一行到 `/srv/ops/CHANGELOG`'],
        ] },
        { type: 'p', text: '負責任的維運有三個習慣，貫穿了六個關卡。最小權限：只有管理員在 sudo，服務以不能登入的專用帳號執行，共用目錄只開給需要的群組；有人離開或換工作時，當天就收回帳號、群組與公鑰。保留日誌：journal 與應用程式日誌是事後唯一的證據，不刪除、不修改，用 logrotate 與 journald 的上限控制大小，讀日誌的權限只給 adm。變更紀錄：sudo 的紀錄只告訴你誰在什麼時候執行了什麼，不會告訴你為什麼；每一次變更都在 CHANGELOG 附加一行「時間、誰、做了什麼、為什麼」（用 `>>`，不是 `>`），共用的帳號與共用的私鑰則讓所有紀錄都失去意義，一律不要使用。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  visualization: {
    kind: 'challenge-stages', title: '維護一台伺服器：六個關卡',
    stages: [
      { title: '帳號與權限規劃', concepts: ['LNX06', 'LNX07'], goal: '建立 ops 群組與第二位管理員 mei，收回實習生 kai 的 sudo，建立 root:ops 770 的共用目錄。', detail: 'useradd -m -s /bin/bash -G sudo,ops mei；kai 用會取代清單的 usermod -G ops，自己用 usermod -aG ops 才不會離開 sudo。群組變更要重新登入才生效；真實系統的共用目錄再加 setgid（2770）。' },
      { title: 'SSH 只接受金鑰', concepts: ['LNX12', 'LNX07'], goal: '核對主機指紋、安裝 mei 的公鑰並確認能登入，最後關閉密碼登入。', detail: '先 ssh-keyscan 與 ssh-keygen -l 比對指紋，再 ssh-copy-id，以 BatchMode=yes 驗證；PasswordAuthentication no 寫在排在 50-cloud-init.conf 之前的 10-key-only.conf，sshd -t 之後 reload，並保留一個連線當退路。' },
      { title: '服務部署', concepts: ['LNX06', 'LNX07', 'LNX10'], goal: '以 nologin 的系統帳號執行 OrderDesk，寫 unit 檔，讓它失敗時重新啟動、開機時啟動。', detail: 'useradd -r -s /usr/sbin/nologin；資料與日誌目錄交給 orderdesk；unit 檔的 User=、Restart=on-failure、RestartSec=1、WantedBy=multi-user.target；daemon-reload 後 enable --now，再用 status 與 pgrep -u 驗證。' },
      { title: '日誌追查', concepts: ['LNX05', 'LNX10', 'LNX11'], goal: '從 status、journal、sudo 紀錄與應用程式日誌找出停擺的原因，做最小的修正並驗證。', detail: 'Start request repeated too quickly 只是結果，FATAL data_dir 才是原因；--since/--until 圍出 13:05 的設定變更；建立 /srv/orderdesk/data、複製資料、chown、750，再 restart。舊資料留著當退路。' },
      { title: '排程備份', concepts: ['LNX08', 'LNX13', 'LNX14'], goal: '結束卡住的舊備份，寫 set -euo pipefail 的指令稿，用 /etc/cron.d 與 flock -n 排程並實際跑一次。', detail: '舊指令稿的 cd 失敗後仍印出 backup done；kill 持有鎖的行程；cron.d 有使用者欄位、輸出導向日誌檔、指令用絕對路徑；cron-run 之後確認備份檔出現。沒有還原過的備份不算備份。' },
      { title: '更新與檢查清單', concepts: ['LNX09', 'LNX05'], goal: '套用安全更新、鎖定需要資料遷移的 OrderDesk，附加變更紀錄，整理日常的檢查清單。', detail: 'apt update、list --upgradable；先 apt-mark hold 再 apt upgrade -y；函式庫更新後重新啟動使用它的服務；CHANGELOG 用 >> 附加；最小權限、保留日誌與變更紀錄是負責任維運的三個習慣。' },
    ],
  },
  quiz: [
    {
      id: 'lnx15-q1', prompt: 'mei 已經用 ssh 登入 hq-01。管理員接著執行 `sudo usermod -aG ops mei`，mei 在原本的連線裡 `touch /srv/ops/notes.txt` 卻得到 Permission denied（`/srv/ops` 是 root:ops 770）。最可能的原因是什麼？',
      options: ['`-aG` 會取代群組清單，mei 被移出了 ops', '`/srv/ops` 的權限應該是 777 才能讓群組寫入', 'mei 的工作階段在登入時就決定了群組，要重新連線（或 `newgrp ops`）才帶著 ops', 'SSH 登入的使用者不能使用附加群組'],
      answer: 2,
      explanation: '`usermod` 只修改帳號資料，已經登入的工作階段沿用登入時的群組，所以重新以 ssh 登入或 `newgrp ops` 之後才能寫入。`-aG` 是附加，會取代清單的是沒有 `-a` 的 `-G`；770 已經給了群組讀寫與進入的權限，777 只會多開放給其他人；SSH 登入的工作階段和本機登入一樣使用附加群組。',
    },
    {
      id: 'lnx15-q2', prompt: 'orderdesk.service 有 `User=orderdesk`，但資料目錄 `/var/lib/orderdesk` 仍是 root:root 755。服務啟動後會怎樣，正確的修正是什麼？',
      options: ['程式能讀但不能在資料目錄寫入，應該 `chown orderdesk:orderdesk` 這個目錄', '程式以 root 執行，所以一切正常，不需要修改', '應該把 `User=orderdesk` 拿掉，讓服務以 root 執行', '應該 `chmod 777 /var/lib/orderdesk`，讓所有人都能寫入'],
      answer: 0,
      explanation: 'systemd 依 `User=` 以 orderdesk 的身分執行程式，755 對它來說只有「其他人」的讀取與進入，寫不進去；把目錄交給 orderdesk 才符合最小權限。服務並不是以 root 執行；拿掉 `User=` 雖然寫得進去，卻讓程式擁有整台機器的權限；777 讓任何帳號都能竄改訂單資料。',
    },
    {
      id: 'lnx15-q3', prompt: '在 Ubuntu 雲端主機的 `/etc/ssh/sshd_config` 最後加上 `PasswordAuthentication no`，`sshd -t` 沒有錯誤，也 reload 了，密碼登入卻仍然有效。原因是什麼？',
      options: ['reload 不會重新讀取設定，必須重新開機', '`PasswordAuthentication` 只能寫在 `sshd_config.d` 裡', '要先刪除所有使用者的密碼，設定才會生效', '開頭 Include 的 `50-cloud-init.conf` 先寫了 `yes`，sshd 採用第一次出現的值'],
      answer: 3,
      explanation: 'sshd 的同一個設定以第一次出現的為準，Ubuntu 的 `sshd_config` 在開頭 Include `sshd_config.d/*.conf`，所以 50-cloud-init.conf 的 yes 先生效；要寫在檔名排在前面的 .d 檔案（例如 10-key-only.conf）。reload 會讓 sshd 重新讀取設定，不需要重新開機；寫在 `sshd_config` 本身也是合法的，只是輪不到；刪除密碼與這個設定無關。',
    },
    {
      id: 'lnx15-q4', prompt: '`sudo systemctl restart orderdesk` 沒有印出任何東西、結束碼是 0，業務卻說系統仍然打不開。下一步最應該做什麼？',
      options: ['再執行一次 restart，直到它成功', '看 `systemctl status orderdesk` 與 `sudo journalctl -u orderdesk -p err`，找程式自己的錯誤訊息', '重新開機，讓所有服務重新啟動', '執行 `sudo apt upgrade -y`，可能是套件太舊'],
      answer: 1,
      explanation: '`Type=simple` 的服務在程式啟動的那一刻就回報成功，程式之後馬上失敗也不會讓 restart 印出錯誤，所以要看 status 與 journal 找出原因（例如 FATAL data_dir）。原因沒處理時重複 restart 只會再撞到啟動上限；重新開機會遇到同樣的錯誤，還中斷其他服務；沒有證據就升級套件，只會多一個變數。',
    },
    {
      id: 'lnx15-q5', prompt: '舊的備份指令稿沒有 `set -e`，第一行 `cd /mnt/nas/orderdesk` 失敗後仍印出 backup done，cron 也記錄了執行。下面哪個說法正確？',
      options: ['cron 看到 cd 的錯誤，會自動停止整個工作', '指令稿會繼續在 cron 的起始目錄（root 的家目錄）執行 cp，最後以 0 結束，看起來像成功', '`cd` 失敗時 bash 一律結束指令稿，所以 cp 不會執行', 'flock 會發現錯誤並回報結束碼 1'],
      answer: 1,
      explanation: '沒有 `set -e` 時 bash 只印出錯誤並繼續，後面的 cp 在 cron 的起始目錄（使用者的家目錄）執行，最後一個指令 echo 成功，整個指令稿以 0 結束。cron 不檢查指令稿裡的錯誤，只負責執行；只有 `set -e`（或 `cd … || exit 1`）才會讓指令稿停下；flock 傳回的是它執行的指令的結束碼，也就是這個假的 0。',
    },
    {
      id: 'lnx15-q6', prompt: '新的 cron 工作是 `flock -n /var/lock/orderdesk-backup.lock /usr/local/bin/orderdesk-backup`，但備份一直沒有產生，日誌也是空的。`ps -o pid,user,args -p 4410` 顯示昨晚的舊備份仍在執行。該怎麼處理？',
      options: ['把 `-n` 改成 `-w 0`，讓 flock 等待鎖', '刪除 `/var/lock/orderdesk-backup.lock`，鎖就消失了', '把排程改成每分鐘執行一次，總有一次拿得到鎖', '確認舊行程確實卡住後結束它（`sudo kill 4410`），鎖才會釋放，再執行一次新的工作'],
      answer: 3,
      explanation: '鎖由仍在執行的舊行程持有，`flock -n` 拿不到鎖就不印任何東西直接放棄；先確認它真的卡住，再結束它，鎖才會釋放。`-w 0` 等於不等待，和 `-n` 一樣放棄；刪除鎖檔不會讓持有者放開它，反而讓之後的程式在不同的檔案上加鎖，失去互斥的作用；更頻繁地排程只會累積更多失敗的嘗試。',
    },
    {
      id: 'lnx15-q7', prompt: '`sudo apt upgrade -y` 把 libssl3t64 升級到修補了安全漏洞的版本。已經在執行的 OrderDesk 會怎樣？',
      options: ['仍然使用記憶體裡的舊版函式庫，要重新啟動服務才會載入修補後的版本', '立刻改用新的函式庫，不需要任何動作', '要等下次執行 `sudo apt update`，新的函式庫才會生效', '服務會因為函式庫被替換而立刻當機'],
      answer: 0,
      explanation: '程式啟動時把函式庫載入記憶體，套件只替換了磁碟上的檔案，所以要重新啟動使用它的服務（needrestart 這類工具會列出來），核心更新則要重新開機。執行中的程式不會自己換成新版本；`apt update` 只更新套件清單，和已經安裝的檔案無關；dpkg 以新檔案取代舊檔案，已經載入的舊版本仍然有效，程式不會因此當機，這也是它能繼續用舊版本的原因。',
    },
    {
      id: 'lnx15-q8', prompt: '13:12 之後 OrderDesk 停擺。要知道是誰、在幾點改了 `/etc/orderdesk/orderdesk.conf`，最直接的證據在哪裡？',
      options: ['`ls -l /etc/orderdesk/orderdesk.conf` 的擁有者欄位', '`systemctl status orderdesk` 的 Loaded 那一行', 'journal 裡 sudo 的紀錄，例如 `sudo journalctl --since 13:00 --until 13:12:31` 看到的 `mei : … COMMAND=/usr/bin/vim /etc/orderdesk/orderdesk.conf`', '`/etc/passwd` 裡最後一個帳號'],
      answer: 2,
      explanation: 'sudo 把每一次以 root 執行的指令記進 journal，包含使用者、目錄與完整的指令，用時間範圍就能找到 13:05 的編輯與 13:12 的重新啟動。檔案的擁有者是 root，因為修改是透過 sudo 做的，看不出是誰；status 的 Loaded 只顯示 unit 檔的路徑與是否 enable；`/etc/passwd` 只列出帳號，和誰修改了檔案無關。',
    },
  ],
  terminal: {
    machines: [hq, laptop, deploy, incident, backup, update],
    examples: [
      {
        id: 'lnx15-survey', title: '接手當天的盤點', machine: 'hq',
        description: '帳號與 sudo 群組、磁碟空間、執行中的服務、上一任管理員留下的排程，以及從 02:30 卡到現在的備份行程。',
        steps: [
          { command: 'id', output: 'uid=1000(learner) gid=1000(learner) groups=1000(learner),27(sudo)' },
          { command: 'cut -d : -f 1,3,7 /etc/passwd | tail -n 3', output: 'nobody:65534:/usr/sbin/nologin\nlearner:1000:/bin/bash\nkai:1002:/bin/bash' },
          { command: 'grep -E \'^(sudo|adm):\' /etc/group', output: 'adm:x:4:\nsudo:x:27:learner,kai' },
          { command: 'df -h', output: 'Filesystem      Size  Used Avail Use% Mounted on\n/dev/vda1        40G   36G  3.6G  92% /\n/dev/vdb1       196G   22G  175G  11% /srv' },
          { command: 'systemctl list-units --type=service', output: '  UNIT         LOAD   ACTIVE SUB     DESCRIPTION\n  cron.service loaded active running Regular background program processing daemon\n  ssh.service  loaded active running OpenBSD Secure Shell server\n\nLegend: LOAD   → Reflects whether the unit definition was properly loaded.\n        ACTIVE → The high-level unit activation state, i.e. generalization of SUB.\n        SUB    → The low-level unit activation state, values depend on unit type.\n\n2 loaded units listed. Pass --all to see loaded but inactive units, too.\nTo show all installed unit files use \'systemctl list-unit-files\'.' },
          { command: 'cat /etc/cron.d/old-backup', output: '# previous admin\n30 2 * * * root flock -n /var/lock/orderdesk-backup.lock /usr/local/bin/old-backup.sh' },
          { command: 'ps -o pid,user,args -p 4410', output: '    PID USER     COMMAND\n   4410 root     /bin/bash /usr/local/bin/old-backup.sh' },
          { command: 'ls -l /srv', output: 'drwxr-x--- root    root     4096 backup/' },
        ],
      },
      {
        id: 'lnx15-ssh', title: '第一次連線：核對指紋，看看密碼為什麼開著', machine: 'nb',
        description: '還不認識 hq-01 時 ssh 拒絕連線；ssh-keyscan 與 ssh-keygen -l 算出指紋，和主控台的一致後才接受；50-cloud-init.conf 打開了密碼登入，sshd -T 顯示實際採用的值。',
        steps: [
          { command: 'ssh mei@hq-01 hostname', output: 'The authenticity of host \'hq-01 (10.20.0.5)\' can\'t be established.\nED25519 key fingerprint is SHA256:Nd5g9CLGZS3xOJFgMdw9hD9cTZ5hAppN/IBNyKN1Odk.\nThis key is not known by any other names.\nAre you sure you want to continue connecting (yes/no/[fingerprint])? （模擬環境沒有鍵盤輸入：先確認指紋，再用 ssh -o StrictHostKeyChecking=accept-new 或 ssh-keyscan 加入 known_hosts）\nHost key verification failed.' },
          { command: 'ssh-keyscan hq-01 > hq.keys', output: '# hq-01:22 SSH-2.0-OpenSSH_9.6p1 Ubuntu-3ubuntu13.5' },
          { command: 'ssh-keygen -l -f hq.keys', output: '256 SHA256:Nd5g9CLGZS3xOJFgMdw9hD9cTZ5hAppN/IBNyKN1Odk hq-01 (ED25519)' },
          { command: 'ssh -o StrictHostKeyChecking=accept-new mei@hq-01 hostname', output: 'Warning: Permanently added \'hq-01\' (ED25519) to the list of known hosts.\nmei@hq-01\'s password: （模擬環境代為輸入課程提供的密碼）\nhq-01' },
          { command: 'ssh mei@hq-01 cat /etc/ssh/sshd_config.d/50-cloud-init.conf', output: 'mei@hq-01\'s password: （模擬環境代為輸入課程提供的密碼）\nPasswordAuthentication yes' },
          { command: 'ssh mei@hq-01 sudo sshd -T | grep authentication', output: 'mei@hq-01\'s password: （模擬環境代為輸入課程提供的密碼）\npubkeyauthentication yes\npasswordauthentication yes\nkbdinteractiveauthentication no' },
        ],
      },
      {
        id: 'lnx15-incident', title: '追查 OrderDesk 的停擺', machine: 'incident',
        description: 'status 顯示撞到啟動上限；journal 的錯誤指出不存在的資料目錄；時間範圍找到 mei 的 sudo 紀錄；設定、CHANGELOG 與 ls 證實原因；應用程式日誌要 sudo 才讀得到；df 說明了搬遷的理由。',
        steps: [
          { command: 'systemctl status orderdesk', output: '× orderdesk.service - OrderDesk order service\n     Loaded: loaded (/etc/systemd/system/orderdesk.service; enabled; preset: enabled)\n     Active: failed (Result: exit-code) since Sun 2026-11-22 13:12:35 CST; 47min ago\n    Process: 3306 ExecStart=/opt/orderdesk/bin/orderdesk --config /etc/orderdesk/orderdesk.conf (code=exited, status=1/FAILURE)\n   Main PID: 3306 (code=exited, status=1/FAILURE)\n\nNov 22 13:12:34 hq-01 systemd[1]: Stopped orderdesk.service - OrderDesk order service.\nNov 22 13:12:34 hq-01 systemd[1]: Started orderdesk.service - OrderDesk order service.\nNov 22 13:12:34 hq-01 orderdesk[3306]: FATAL data_dir /srv/orderdesk/data: no such file or directory\nNov 22 13:12:34 hq-01 systemd[1]: orderdesk.service: Main process exited, code=exited, status=1/FAILURE\nNov 22 13:12:34 hq-01 systemd[1]: orderdesk.service: Failed with result \'exit-code\'.\nNov 22 13:12:35 hq-01 systemd[1]: orderdesk.service: Scheduled restart job, restart counter is at 5.\nNov 22 13:12:35 hq-01 systemd[1]: Stopped orderdesk.service - OrderDesk order service.\nNov 22 13:12:35 hq-01 systemd[1]: orderdesk.service: Start request repeated too quickly.\nNov 22 13:12:35 hq-01 systemd[1]: orderdesk.service: Failed with result \'exit-code\'.\nNov 22 13:12:35 hq-01 systemd[1]: Failed to start orderdesk.service - OrderDesk order service.' },
          { command: 'sudo journalctl -u orderdesk -p err --since today', output: 'Nov 22 13:12:30 hq-01 orderdesk[3302]: FATAL data_dir /srv/orderdesk/data: no such file or directory\nNov 22 13:12:31 hq-01 orderdesk[3303]: FATAL data_dir /srv/orderdesk/data: no such file or directory\nNov 22 13:12:32 hq-01 orderdesk[3304]: FATAL data_dir /srv/orderdesk/data: no such file or directory\nNov 22 13:12:33 hq-01 orderdesk[3305]: FATAL data_dir /srv/orderdesk/data: no such file or directory\nNov 22 13:12:34 hq-01 orderdesk[3306]: FATAL data_dir /srv/orderdesk/data: no such file or directory\nNov 22 13:12:35 hq-01 systemd[1]: Failed to start orderdesk.service - OrderDesk order service.' },
          { command: 'sudo journalctl --since 13:00 --until 13:12:31', output: 'Nov 22 13:05:41 hq-01 sudo[3290]: mei : TTY=pts/1 ; PWD=/home/mei ; USER=root ; COMMAND=/usr/bin/vim /etc/orderdesk/orderdesk.conf\nNov 22 13:12:29 hq-01 sudo[3297]: mei : TTY=pts/1 ; PWD=/home/mei ; USER=root ; COMMAND=/usr/bin/systemctl restart orderdesk\nNov 22 13:12:29 hq-01 systemd[1]: Stopping orderdesk.service - OrderDesk order service...\nNov 22 13:12:29 hq-01 orderdesk[3301]: INFO received SIGTERM, shutting down\nNov 22 13:12:30 hq-01 systemd[1]: orderdesk.service: Deactivated successfully.\nNov 22 13:12:30 hq-01 systemd[1]: Stopped orderdesk.service - OrderDesk order service.\nNov 22 13:12:30 hq-01 systemd[1]: Started orderdesk.service - OrderDesk order service.\nNov 22 13:12:30 hq-01 orderdesk[3302]: FATAL data_dir /srv/orderdesk/data: no such file or directory\nNov 22 13:12:30 hq-01 systemd[1]: orderdesk.service: Main process exited, code=exited, status=1/FAILURE\nNov 22 13:12:30 hq-01 systemd[1]: orderdesk.service: Failed with result \'exit-code\'.\nNov 22 13:12:31 hq-01 systemd[1]: orderdesk.service: Scheduled restart job, restart counter is at 1.\nNov 22 13:12:31 hq-01 systemd[1]: Stopped orderdesk.service - OrderDesk order service.\nNov 22 13:12:31 hq-01 systemd[1]: Started orderdesk.service - OrderDesk order service.\nNov 22 13:12:31 hq-01 orderdesk[3303]: FATAL data_dir /srv/orderdesk/data: no such file or directory\nNov 22 13:12:31 hq-01 systemd[1]: orderdesk.service: Main process exited, code=exited, status=1/FAILURE\nNov 22 13:12:31 hq-01 systemd[1]: orderdesk.service: Failed with result \'exit-code\'.' },
          { command: 'grep data_dir /etc/orderdesk/orderdesk.conf', output: 'data_dir: /srv/orderdesk/data' },
          { command: 'tail -n 1 /srv/ops/CHANGELOG', output: '2026-11-22 mei: orderdesk data_dir moves to /srv/orderdesk/data (more space on /srv)' },
          { command: 'ls -ld /srv/orderdesk/data', output: 'ls: cannot access \'/srv/orderdesk/data\': No such file or directory' },
          { command: 'grep -c FATAL /var/log/orderdesk/orderdesk.log', output: 'grep: /var/log/orderdesk/orderdesk.log: Permission denied' },
          { command: 'sudo grep -c FATAL /var/log/orderdesk/orderdesk.log', output: '5' },
          { command: 'df -h /var/lib /srv', output: 'Filesystem      Size  Used Avail Use% Mounted on\n/dev/vda1        40G   36G  3.6G  92% /\n/dev/vdb1       196G   22G  175G  11% /srv' },
        ],
      },
      {
        id: 'lnx15-backup', title: '沒有 set -e 的備份，與拿不到的鎖', machine: 'backup',
        description: '舊指令稿的 cd 失敗後，cp 把資料複製到目前的目錄，最後印出 backup done、結束碼 0；`bash -e` 在第一個錯誤就停止；卡住的舊行程持有鎖，flock -n 立刻放棄；cron-next 列出下一次的時間。',
        steps: [
          { command: 'cat /usr/local/bin/old-backup.sh', output: '#!/bin/bash\n# old nightly backup: copy the database to the NAS\ncd /mnt/nas/orderdesk\ncp /var/lib/orderdesk/orders.db orders-latest.db\necho "backup done"' },
          { command: 'sudo /usr/local/bin/old-backup.sh', output: '/usr/local/bin/old-backup.sh: line 3: cd: /mnt/nas/orderdesk: No such file or directory\nbackup done' },
          { command: 'echo $?', output: '0' },
          { command: 'ls -l', output: '-rw-r----- root    root       12 orders-latest.db' },
          { command: 'sudo bash -e /usr/local/bin/old-backup.sh; echo "exit $?"', output: '/usr/local/bin/old-backup.sh: line 3: cd: /mnt/nas/orderdesk: No such file or directory\nexit 1' },
          { command: 'ps -o pid,user,args -p 4410', output: '    PID USER     COMMAND\n   4410 root     /bin/bash /usr/local/bin/old-backup.sh' },
          { command: 'sudo flock -n /var/lock/orderdesk-backup.lock echo got the lock; echo "exit $?"', output: 'exit 1' },
          { command: 'cron-next -n 2 \'30 2 * * *\'', output: 'Mon 2026-11-23 02:30:00 CST\nTue 2026-11-24 02:30:00 CST' },
        ],
      },
      {
        id: 'lnx15-apt', title: '更新前先看清楚', machine: 'update',
        description: 'apt update 之後有四個套件可以升級；OrderDesk 的 NEWS 說明 2.0 需要遷移資料；apt policy 顯示已安裝與候選的版本。',
        steps: [
          { command: 'sudo apt update', output: 'Hit:1 http://archive.ubuntu.com/ubuntu noble InRelease\nHit:2 http://archive.ubuntu.com/ubuntu noble-updates InRelease\nHit:3 http://security.ubuntu.com/ubuntu noble-security InRelease\nHit:4 https://apt.orderdesk.example/debian stable InRelease\nReading package lists... Done\nBuilding dependency tree... Done\nReading state information... Done\n4 packages can be upgraded. Run \'apt list --upgradable\' to see them.' },
          { command: 'apt list --upgradable', output: 'Listing... Done\nlibssl3t64/noble-updates,noble-security 3.0.13-0ubuntu3.5 amd64 [upgradable from: 3.0.13-0ubuntu3.4]\nopenssl/noble-updates,noble-security 3.0.13-0ubuntu3.5 amd64 [upgradable from: 3.0.13-0ubuntu3.4]\norderdesk/stable 2.0.0-1 amd64 [upgradable from: 1.4.2-1]\nsudo/noble-updates,noble-security 1.9.15p5-3ubuntu5.24.04.1 amd64 [upgradable from: 1.9.15p5-3ubuntu5]' },
          { command: 'cat /opt/orderdesk/NEWS', output: '2.0.0: the data format changes. Stop the service, back up data_dir and run\n  orderdesk migrate --config /etc/orderdesk/orderdesk.conf\nbefore starting 2.0. There is no way back to 1.x without that backup.' },
          { command: 'apt policy orderdesk', output: 'orderdesk:\n  Installed: 1.4.2-1\n  Candidate: 2.0.0-1\n  Version table:\n     2.0.0-1 500\n        500 https://apt.orderdesk.example/debian stable/main amd64 Packages\n *** 1.4.2-1 500\n        500 https://apt.orderdesk.example/debian stable/main amd64 Packages\n        100 /var/lib/dpkg/status' },
        ],
      },
    ],
    exercises,
  },
};
