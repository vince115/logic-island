import type { TerminalFile, TerminalJournalEntry, TerminalMachine } from '@/lib/terminal/lesson';
import type { LessonContent } from '../schema';

/*
 * LNX10 systemd and Service Management (LNX-3). A terminal lesson on the services profile (engine stage E6): what an
 * init system does and systemd as PID 1, unit files and where they live (/usr/lib/systemd/system from packages,
 * /etc/systemd/system from the administrator, /etc taking precedence over /run and /usr/lib for the whole file),
 * systemctl start/stop/restart/reload/status and reading the status output, enable/disable (a link in the .wants folder
 * of the WantedBy= target) versus start, writing a service unit for a small application with daemon-reload after every
 * edit, Restart= policies and the start limit, and After= versus Requires= versus Wants=. Drop-ins (systemctl edit),
 * other unit types and Type=exec are in the text only. One application server for the transcripts and one small machine
 * per exercise; host names, users, programs and files are made up. Every transcript output was produced by replaying it
 * on the engine.
 */

const dir = (path: string, owner = 'root', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'root', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const exe = (path: string): TerminalFile => file(path, '', 'root', 0o755);
const link = (path: string, target: string): TerminalFile => ({ path, kind: 'link', mode: 0o777, owner: 'root', target });
const HOME = '/home/learner';
const NOLOGIN = '/usr/sbin/nologin';
const WANTS = '/etc/systemd/system/multi-user.target.wants';
/** The folders every machine has: /etc/systemd/system, the learner's home and /usr/lib/systemd/system. */
const BASE = [
  dir('/etc'), dir('/etc/systemd'), dir('/etc/systemd/system'), dir('/home'), dir(HOME, 'learner'),
  dir('/usr'), dir('/usr/bin'), dir('/usr/lib'), dir('/usr/lib/systemd'), dir('/usr/lib/systemd/system'),
];
/** A journal entry of systemd itself (systemd[1]) about a unit. */
const systemd = (time: string, unit: string, priority: number, message: string): TerminalJournalEntry => ({ time, unit, id: 'systemd', pid: 1, priority, message });
/** A unit file written with echo -e and sudo tee (the simulated machines have no editor). */
const teeUnit = (path: string, lines: string[]) => `echo -e "${lines.join('\\n')}" | sudo tee ${path}`;

const NGINX_UNIT = '[Unit]\nDescription=A high performance web server and a reverse proxy server\nDocumentation=man:nginx(8)\nAfter=network.target\n\n[Service]\nType=forking\nPIDFile=/run/nginx.pid\nExecStart=/usr/sbin/nginx -g \'daemon on; master_process on;\'\nExecReload=/usr/sbin/nginx -g \'daemon on; master_process on;\' -s reload\nTimeoutStopSec=5\nKillMode=mixed\n\n[Install]\nWantedBy=multi-user.target\n';
const CRON_UNIT = '[Unit]\nDescription=Regular background program processing daemon\nDocumentation=man:cron(8)\nAfter=remote-fs.target nss-user-lookup.target\n\n[Service]\nEnvironmentFile=-/etc/default/cron\nExecStart=/usr/sbin/cron -f -P $EXTRA_OPTS\nKillMode=process\nRestart=on-failure\nSyslogIdentifier=cron\n\n[Install]\nWantedBy=multi-user.target\n';
const BACKUP_VENDOR = '[Unit]\nDescription=Backup agent\nWants=network-online.target\nAfter=network-online.target\n\n[Service]\nExecStart=/usr/bin/backup-agent --target s3://backup-bucket --schedule 03:00\nRestart=on-failure\n\n[Install]\nWantedBy=multi-user.target\n';
const BACKUP_LOCAL = '# Local copy: back up to /srv/backup at 02:00 instead of S3.\n[Unit]\nDescription=Backup agent\nWants=network-online.target\nAfter=network-online.target\n\n[Service]\nExecStart=/usr/bin/backup-agent --target /srv/backup --schedule 02:00\nRestart=on-failure\n\n[Install]\nWantedBy=multi-user.target\n';
const ORDERS_DB_UNIT = '[Unit]\nDescription=Orders database\n\n[Service]\nExecStart=/opt/orders/bin/orders-db --data /var/lib/orders\nUser=orders\n';
const ORDERS_API_UNIT = '[Unit]\nDescription=Orders API\nRequires=orders-db.service\nAfter=network.target orders-db.service\n\n[Service]\nExecStart=/opt/orders/bin/orders-api --port 8081\nUser=orders\nRestart=on-failure\nRestartSec=2\n\n[Install]\nWantedBy=multi-user.target\n';
const MAILER_UNIT = '[Unit]\nDescription=Daily report mailer\nAfter=network.target\n\n[Service]\nExecStart=/usr/bin/report-mailer --spool /var/spool/report-mailer\nUser=mailer\n\n[Install]\nWantedBy=multi-user.target\n';
const METRICS_UNIT = '[Unit]\nDescription=Metrics push agent\nAfter=network.target\n\n[Service]\nExecStart=/usr/local/bin/metrics-push --config /etc/metrics-push.conf\nRestart=on-failure\n\n[Install]\nWantedBy=multi-user.target\n';

/** The pdf-render unit of the transcript: first with the wrong path and no restart policy, then fixed. */
const PDF_DRAFT = ['[Unit]', 'Description=PDF render service', 'After=network.target', '', '[Service]', 'ExecStart=/opt/pdf-render/pdf-render', 'User=pdf', '', '[Install]', 'WantedBy=multi-user.target'];
const PDF_FIXED = ['[Unit]', 'Description=PDF render service', 'After=network.target', '', '[Service]', 'ExecStart=/opt/pdf-render/bin/pdf-render', 'User=pdf', 'Restart=on-failure', 'RestartSec=5', '', '[Install]', 'WantedBy=multi-user.target'];

/**
 * The transcripts' machine: an application server. nginx and cron come from packages (/usr/lib), backup-agent has a local
 * copy in /etc that replaces the package's, orders-api Requires= orders-db (a static unit), report-mailer is installed but
 * disabled, metrics-push fails at once because its configuration file is missing, and pdf-render has no unit yet.
 */
const appHost: TerminalMachine = {
  id: 'app', title: '應用伺服器 app-02', user: 'learner', host: 'app-02', cwd: HOME, profile: 'services',
  now: '2026-11-22 10:00:00', boot: '2026-11-22 08:00:00',
  accounts: {
    users: [
      { name: 'orders', uid: 995, home: '/var/lib/orders', shell: NOLOGIN },
      { name: 'mailer', uid: 994, home: '/var/spool/report-mailer', shell: NOLOGIN },
      { name: 'pdf', uid: 993, home: '/opt/pdf-render', shell: NOLOGIN },
    ],
    groups: [{ name: 'adm', members: ['learner'] }, { name: 'sudo', members: ['learner'] }],
  },
  files: [
    ...BASE,
    file('/etc/systemd/system/backup-agent.service', BACKUP_LOCAL),
    file('/etc/systemd/system/metrics-push.service', METRICS_UNIT),
    file('/etc/systemd/system/orders-api.service', ORDERS_API_UNIT),
    file('/etc/systemd/system/orders-db.service', ORDERS_DB_UNIT),
    dir(WANTS),
    link(`${WANTS}/backup-agent.service`, '/etc/systemd/system/backup-agent.service'),
    link(`${WANTS}/cron.service`, '/usr/lib/systemd/system/cron.service'),
    link(`${WANTS}/nginx.service`, '/usr/lib/systemd/system/nginx.service'),
    link(`${WANTS}/orders-api.service`, '/etc/systemd/system/orders-api.service'),
    dir('/opt'), dir('/opt/orders'), dir('/opt/orders/bin'), exe('/opt/orders/bin/orders-api'), exe('/opt/orders/bin/orders-db'),
    dir('/opt/pdf-render'), dir('/opt/pdf-render/bin'), exe('/opt/pdf-render/bin/pdf-render'),
    dir('/srv'), dir('/srv/backup', 'root', 0o750),
    exe('/usr/bin/backup-agent'), exe('/usr/bin/report-mailer'),
    exe('/usr/lib/systemd/systemd'),
    file('/usr/lib/systemd/system/backup-agent.service', BACKUP_VENDOR),
    file('/usr/lib/systemd/system/cron.service', CRON_UNIT),
    file('/usr/lib/systemd/system/nginx.service', NGINX_UNIT),
    file('/usr/lib/systemd/system/report-mailer.service', MAILER_UNIT),
    dir('/usr/local'), dir('/usr/local/bin'), exe('/usr/local/bin/metrics-push'),
    dir('/usr/sbin'), exe('/usr/sbin/cron'), exe('/usr/sbin/nginx'), link('/usr/sbin/init', '/lib/systemd/systemd'),
    link('/lib', 'usr/lib'), link('/sbin', 'usr/sbin'),
    dir('/var'), dir('/var/lib'), dir('/var/lib/orders', 'orders', 0o750), dir('/var/spool'), dir('/var/spool/report-mailer', 'mailer', 0o750),
  ],
  processes: [
    { pid: 1, ppid: 0, user: 'root', command: '/usr/lib/systemd/systemd --switched-root --system --deserialize=31', stat: 'Ss', rss: 13100, vsz: 168500 },
    { pid: 640, user: 'root', command: '/usr/sbin/cron -f -P', stat: 'Ss', rss: 2700, vsz: 6900, start: '2026-11-22 08:00:03', unit: 'cron' },
    { pid: 812, user: 'root', command: 'nginx: master process /usr/sbin/nginx -g daemon on; master_process on;', stat: 'Ss', rss: 2400, vsz: 55200, start: '2026-11-22 08:00:04', unit: 'nginx', hup: 'reload' },
    { pid: 813, ppid: 812, user: 'www-data', command: 'nginx: worker process', rss: 5600, vsz: 55900, start: '2026-11-22 08:00:04', unit: 'nginx' },
    { pid: 814, ppid: 812, user: 'www-data', command: 'nginx: worker process', rss: 5500, vsz: 55900, start: '2026-11-22 08:00:04', unit: 'nginx' },
    { pid: 845, user: 'root', command: '/usr/bin/backup-agent --target /srv/backup --schedule 02:00', stat: 'Ss', rss: 18400, vsz: 240000, start: '2026-11-22 08:00:05', unit: 'backup-agent' },
    { pid: 870, user: 'orders', command: '/opt/orders/bin/orders-db --data /var/lib/orders', stat: 'Ss', cpu: 0.4, rss: 61200, vsz: 410000, start: '2026-11-22 08:00:05', unit: 'orders-db' },
    { pid: 902, user: 'orders', command: '/opt/orders/bin/orders-api --port 8081', stat: 'Ss', cpu: 1.2, rss: 48300, vsz: 720000, start: '2026-11-22 08:00:06', unit: 'orders-api' },
    { pid: 1301, user: 'learner', command: '-bash', stat: 'Ss', tty: 'pts/0', rss: 5200, vsz: 8900, start: '2026-11-22 09:50:00' },
  ],
  services: [
    { unit: 'cron', active: 'active', since: '2026-11-22 08:00:03' },
    { unit: 'nginx', active: 'active', since: '2026-11-22 08:00:04' },
    { unit: 'backup-agent', active: 'active', since: '2026-11-22 08:00:05' },
    { unit: 'orders-db', active: 'active', since: '2026-11-22 08:00:05' },
    { unit: 'orders-api', active: 'active', since: '2026-11-22 08:00:06' },
  ],
  programs: [
    { path: '/opt/orders/bin/orders-db', cpu: 0.4, rss: 61200, vsz: 410000, log: ['listening on 127.0.0.1:5433'] },
    { path: '/opt/orders/bin/orders-api', cpu: 1.2, rss: 48300, vsz: 720000, log: ['listening on :8081'] },
    { path: '/usr/bin/report-mailer', rss: 9800, log: ['watching /var/spool/report-mailer'] },
    { path: '/usr/local/bin/metrics-push', fail: { message: 'cannot read /etc/metrics-push.conf: No such file or directory', unless: '/etc/metrics-push.conf' } },
    { path: '/opt/pdf-render/bin/pdf-render', rss: 35600, log: ['listening on 127.0.0.1:9090'] },
  ],
  journal: [
    { time: '2026-11-22 08:00:00', id: 'kernel', priority: 6, message: 'Linux version 6.8.0-49-generic (buildd@lcy02-amd64-103) #49-Ubuntu SMP PREEMPT_DYNAMIC' },
    { time: '2026-11-22 08:00:03', unit: 'cron', id: 'systemd', pid: 1, priority: 6, message: 'Started cron.service - Regular background program processing daemon.' },
    { time: '2026-11-22 08:00:03', unit: 'cron', id: 'cron', pid: 640, priority: 6, message: '(CRON) INFO (pidfile fd = 3)' },
    { time: '2026-11-22 08:00:04', unit: 'nginx', id: 'systemd', pid: 1, priority: 6, message: 'Starting nginx.service - A high performance web server and a reverse proxy server...' },
    { time: '2026-11-22 08:00:04', unit: 'nginx', id: 'systemd', pid: 1, priority: 6, message: 'Started nginx.service - A high performance web server and a reverse proxy server.' },
    { time: '2026-11-22 08:00:05', unit: 'backup-agent', id: 'systemd', pid: 1, priority: 6, message: 'Started backup-agent.service - Backup agent.' },
    { time: '2026-11-22 08:00:05', unit: 'orders-db', id: 'systemd', pid: 1, priority: 6, message: 'Started orders-db.service - Orders database.' },
    { time: '2026-11-22 08:00:05', unit: 'orders-db', id: 'orders-db', pid: 870, priority: 6, message: 'listening on 127.0.0.1:5433' },
    { time: '2026-11-22 08:00:06', unit: 'orders-api', id: 'systemd', pid: 1, priority: 6, message: 'Started orders-api.service - Orders API.' },
    { time: '2026-11-22 08:00:06', unit: 'orders-api', id: 'orders-api', pid: 902, priority: 6, message: 'listening on :8081' },
  ],
};

const STATUS_PAGE_UNIT = '[Unit]\nDescription=Public status page\nAfter=network.target\n\n[Service]\nExecStart=/usr/bin/status-page --listen 0.0.0.0:8080\nUser=www-data\nRestart=on-failure\n\n[Install]\nWantedBy=multi-user.target\n';
/** Exercise 1: a web host where the status-page package installed its unit, but nobody started or enabled it. */
const webHost: TerminalMachine = {
  id: 'web', title: '網站主機 web-05', user: 'learner', host: 'web-05', cwd: HOME, profile: 'services',
  now: '2026-11-22 10:00:00', boot: '2026-11-22 07:30:00',
  accounts: { groups: [{ name: 'adm', members: ['learner'] }, { name: 'sudo', members: ['learner'] }] },
  files: [...BASE, exe('/usr/bin/status-page'), file('/usr/lib/systemd/system/status-page.service', STATUS_PAGE_UNIT)],
  processes: [
    { pid: 1, ppid: 0, user: 'root', command: '/usr/lib/systemd/systemd --switched-root --system --deserialize=31', stat: 'Ss', rss: 12900, vsz: 168200 },
    { pid: 1188, user: 'learner', command: '-bash', stat: 'Ss', tty: 'pts/0', rss: 5100, vsz: 8900, start: '2026-11-22 09:52:00' },
  ],
  programs: [{ path: '/usr/bin/status-page', rss: 22400, log: ['serving the status page on 0.0.0.0:8080'] }],
  journal: [{ time: '2026-11-22 07:30:00', id: 'kernel', priority: 6, message: 'Linux version 6.8.0-49-generic (buildd@lcy02-amd64-103) #49-Ubuntu SMP PREEMPT_DYNAMIC' }],
};

const SHORTLINK_DRAFT = '[Unit]\nDescription=Shortlink URL service\n\n[Service]\nExecStart=/opt/shortlink/shortlink --port 8080\n';
const SHORTLINK_LINES = ['[Unit]', 'Description=Shortlink URL service', 'After=network.target', '', '[Service]', 'ExecStart=/opt/shortlink/bin/shortlink --port 8080', 'User=shortlink', 'Restart=on-failure', 'RestartSec=5', '', '[Install]', 'WantedBy=multi-user.target'];
const SHORTLINK_UNIT = `${SHORTLINK_LINES.join('\n')}\n`;
const SHORTLINK_PATH = '/etc/systemd/system/shortlink.service';
/** Exercise 2: a colleague's draft unit for shortlink, already loaded by systemd; its one start failed with 203/EXEC. */
const linkHost: TerminalMachine = {
  id: 'link', title: '短網址主機 link-01', user: 'learner', host: 'link-01', cwd: HOME, profile: 'services',
  now: '2026-11-22 10:00:00', boot: '2026-11-22 08:00:00',
  accounts: { users: [{ name: 'shortlink', uid: 996, home: '/opt/shortlink', shell: NOLOGIN }], groups: [{ name: 'adm', members: ['learner'] }, { name: 'sudo', members: ['learner'] }] },
  files: [
    ...BASE, file(SHORTLINK_PATH, SHORTLINK_DRAFT),
    dir('/opt'), dir('/opt/shortlink'), dir('/opt/shortlink/bin'), exe('/opt/shortlink/bin/shortlink'),
    file('/opt/shortlink/README.txt', 'shortlink 1.4\nRun bin/shortlink --port 8080 as the shortlink user.\n'),
  ],
  processes: [
    { pid: 1, ppid: 0, user: 'root', command: '/usr/lib/systemd/systemd --switched-root --system --deserialize=31', stat: 'Ss', rss: 13000, vsz: 168300 },
    { pid: 1502, user: 'learner', command: '-bash', stat: 'Ss', tty: 'pts/0', rss: 5200, vsz: 8900, start: '2026-11-22 09:55:00' },
  ],
  services: [{ unit: 'shortlink', active: 'failed', since: '2026-11-22 09:40:12', pid: 1410, status: 203 }],
  programs: [{ path: '/opt/shortlink/bin/shortlink', rss: 18800, log: ['listening on :8080'] }],
  journal: [
    { time: '2026-11-22 08:00:00', id: 'kernel', priority: 6, message: 'Linux version 6.8.0-49-generic (buildd@lcy02-amd64-103) #49-Ubuntu SMP PREEMPT_DYNAMIC' },
    systemd('2026-11-22 09:40:12', 'shortlink', 6, 'Started shortlink.service - Shortlink URL service.'),
    systemd('2026-11-22 09:40:12', 'shortlink', 3, 'shortlink.service: Failed to locate executable /opt/shortlink/shortlink: No such file or directory'),
    systemd('2026-11-22 09:40:12', 'shortlink', 3, 'shortlink.service: Failed at step EXEC spawning /opt/shortlink/shortlink: No such file or directory'),
    systemd('2026-11-22 09:40:12', 'shortlink', 5, 'shortlink.service: Main process exited, code=exited, status=203/EXEC'),
    systemd('2026-11-22 09:40:12', 'shortlink', 4, "shortlink.service: Failed with result 'exit-code'."),
  ],
};

const THUMB_UNIT = '[Unit]\nDescription=Thumbnail generator\nAfter=network.target\n\n[Service]\nExecStart=/usr/local/bin/thumbnailer --config /etc/thumbnailer/config.ini\nUser=thumbs\nRestart=on-failure\n\n[Install]\nWantedBy=multi-user.target\n';
const THUMB_EXAMPLE = '[thumbnailer]\ninput = /srv/media/uploads\noutput = /srv/media/thumbs\nsize = 320x240\n';
/** Exercise 3: thumbnailer is enabled but failed this morning: its configuration file was never put in place. */
const mediaHost: TerminalMachine = {
  id: 'media', title: '媒體主機 media-01', user: 'learner', host: 'media-01', cwd: HOME, profile: 'services',
  now: '2026-11-22 10:00:00', boot: '2026-11-22 09:12:00',
  accounts: { users: [{ name: 'thumbs', uid: 997, home: '/srv/media', shell: NOLOGIN }], groups: [{ name: 'adm', members: ['learner'] }, { name: 'sudo', members: ['learner'] }] },
  files: [
    ...BASE, file('/etc/systemd/system/thumbnailer.service', THUMB_UNIT), dir(WANTS),
    link(`${WANTS}/thumbnailer.service`, '/etc/systemd/system/thumbnailer.service'),
    dir('/etc/thumbnailer'),
    dir('/srv'), dir('/srv/media', 'thumbs'), dir('/srv/media/thumbs', 'thumbs'), dir('/srv/media/uploads', 'thumbs'),
    dir('/usr/local'), dir('/usr/local/bin'), exe('/usr/local/bin/thumbnailer'),
    dir('/usr/share'), dir('/usr/share/doc'), dir('/usr/share/doc/thumbnailer'),
    file('/usr/share/doc/thumbnailer/config.ini.example', THUMB_EXAMPLE),
  ],
  processes: [
    { pid: 1, ppid: 0, user: 'root', command: '/usr/lib/systemd/systemd --switched-root --system --deserialize=31', stat: 'Ss', rss: 12800, vsz: 168100 },
    { pid: 1630, user: 'learner', command: '-bash', stat: 'Ss', tty: 'pts/0', rss: 5300, vsz: 8900, start: '2026-11-22 09:57:00' },
  ],
  services: [{ unit: 'thumbnailer', active: 'failed', since: '2026-11-22 09:12:04', pid: 905, status: 1 }],
  programs: [{ path: '/usr/local/bin/thumbnailer', rss: 27100, fail: { message: 'cannot read /etc/thumbnailer/config.ini: No such file or directory', unless: '/etc/thumbnailer/config.ini' }, log: ['watching /srv/media/uploads'] }],
  journal: [
    { time: '2026-11-22 09:12:00', id: 'kernel', priority: 6, message: 'Linux version 6.8.0-49-generic (buildd@lcy02-amd64-103) #49-Ubuntu SMP PREEMPT_DYNAMIC' },
    // At boot: five quick starts, each failing at once (Restart=on-failure, default RestartSec=100ms), then the start limit.
    ...[901, 902, 903, 904, 905].flatMap((pid, i) => {
      const at = '2026-11-22 09:12:04', title = 'thumbnailer.service - Thumbnail generator';
      return [
        systemd(at, 'thumbnailer', 6, `Started ${title}.`),
        { time: at, unit: 'thumbnailer', id: 'thumbnailer', pid, priority: 3, message: 'cannot read /etc/thumbnailer/config.ini: No such file or directory' },
        systemd(at, 'thumbnailer', 5, 'thumbnailer.service: Main process exited, code=exited, status=1/FAILURE'),
        systemd(at, 'thumbnailer', 4, "thumbnailer.service: Failed with result 'exit-code'."),
        systemd(at, 'thumbnailer', 6, `thumbnailer.service: Scheduled restart job, restart counter is at ${i + 1}.`),
        systemd(at, 'thumbnailer', 6, `Stopped ${title}.`),
      ];
    }),
    systemd('2026-11-22 09:12:04', 'thumbnailer', 4, 'thumbnailer.service: Start request repeated too quickly.'),
    systemd('2026-11-22 09:12:04', 'thumbnailer', 4, "thumbnailer.service: Failed with result 'exit-code'."),
    systemd('2026-11-22 09:12:04', 'thumbnailer', 3, 'Failed to start thumbnailer.service - Thumbnail generator.'),
  ],
};

const LEDGER_UNIT = '[Unit]\nDescription=Ledger service\nAfter=network.target\n\n[Service]\nExecStart=/opt/ledger/bin/ledger --workers 2\nUser=ledger\nRestart=on-failure\n\n[Install]\nWantedBy=multi-user.target\n';
const ledgerProcesses = (master: number, export_: number) => [
  { pid: 1, ppid: 0, user: 'root', command: '/usr/lib/systemd/systemd --switched-root --system --deserialize=31', stat: 'Ss', rss: 13200, vsz: 168400 },
  { pid: export_, user: 'ledger', command: '/opt/ledger/bin/ledger --export nightly', stat: 'S', rss: 20100, vsz: 300000, start: '2026-11-22 02:00:00' },
  { pid: master, user: 'ledger', command: '/opt/ledger/bin/ledger --workers 2', stat: 'Ss', cpu: 0.8, rss: 40200, vsz: 520000, start: '2026-11-22 06:00:04', unit: 'ledger' },
  { pid: master + 4, ppid: master, user: 'ledger', command: 'ledger: worker 1', cpu: 3.1, rss: 88100, vsz: 610000, start: '2026-11-22 06:00:04', unit: 'ledger' },
  { pid: master + 5, ppid: master, user: 'ledger', command: 'ledger: worker 2', cpu: 2.7, rss: 87400, vsz: 610000, start: '2026-11-22 06:00:04', unit: 'ledger' },
  { pid: master + 900, user: 'learner', command: '-bash', stat: 'Ss', tty: 'pts/0', rss: 5200, vsz: 8900, start: '2026-11-22 09:58:00' },
];
const ledgerJournal = (master: number): TerminalJournalEntry[] => [
  { time: '2026-11-22 01:00:00', id: 'kernel', priority: 6, message: 'Linux version 6.8.0-49-generic (buildd@lcy02-amd64-103) #49-Ubuntu SMP PREEMPT_DYNAMIC' },
  systemd('2026-11-22 06:00:04', 'ledger', 6, 'Started ledger.service - Ledger service.'),
  { time: '2026-11-22 06:00:04', unit: 'ledger', id: 'ledger', pid: master, priority: 6, message: 'started 2 workers' },
];
/** Exercise 4: a payments host whose ledger service has a master process and two workers; another ledger process is not the service's. */
const payHost: TerminalMachine = {
  id: 'pay', title: '帳務主機 pay-03', user: 'learner', host: 'pay-03', cwd: HOME, profile: 'services',
  now: '2026-11-22 10:00:00', boot: '2026-11-22 01:00:00',
  accounts: { users: [{ name: 'ledger', uid: 992, home: '/opt/ledger', shell: NOLOGIN }], groups: [{ name: 'adm', members: ['learner'] }, { name: 'sudo', members: ['learner'] }] },
  files: [
    ...BASE, file('/etc/systemd/system/ledger.service', LEDGER_UNIT), dir(WANTS),
    link(`${WANTS}/ledger.service`, '/etc/systemd/system/ledger.service'),
    dir('/opt'), dir('/opt/ledger'), dir('/opt/ledger/bin'), exe('/opt/ledger/bin/ledger'),
  ],
  processes: ledgerProcesses(2210, 2105),
  services: [{ unit: 'ledger', active: 'active', since: '2026-11-22 06:00:04' }],
  journal: ledgerJournal(2210),
};

export const LNX10: LessonContent = {
  lessonId: 'LNX10',
  motivation: '在終端機裡執行 `./app` 很簡單，難的是之後的事：你一登出，程式就跟著結束；機房半夜重新開機，網站沒有自己回來；程式凌晨當掉，直到客戶來電才有人發現；而它一直以 root 的身分在跑。把程式交給 init 系統管理成「服務」，就是這些問題的標準答案。今天主流的 Linux 發行版都以 systemd 作為 PID 1：它在開機時依相依關係啟動服務、以指定的帳號執行、程式失敗時自動重新啟動，並把輸出收進日誌。本課在一台應用伺服器上，先認識 init 與 unit 檔放在哪裡，再用 systemctl 啟動、停止、重新載入並讀懂 status 的每一列，分清楚「現在執行」與「開機時啟動」兩個開關，最後替一支小程式寫出自己的 service unit，設定失敗時重新啟動與服務之間的相依。',
  sections: [
    {
      id: 'lnx10-s-init', title: 'init 系統與 PID 1',
      blocks: [
        { type: 'p', text: '核心完成硬體與記憶體的初始化之後，會啟動第一個使用者空間的程式，它的 PID 是 1，傳統上稱為 init。之後使用者空間的每一個行程都是它的子孫。init 的工作有四件：依設定把系統需要的服務（網路、SSH、排程、資料庫、網站）依正確的順序啟動起來；監看這些服務，在它們結束或當掉時依設定處理（例如重新啟動）；收養父行程已經結束的孤兒行程，並回收它們的結束狀態，避免殭屍行程堆積；關機時依相反的順序停止服務。PID 1 不能結束，它一結束，核心就會 panic，整台機器隨之停擺。' },
        { type: 'p', text: '早期的 SysV init 用 `/etc/init.d/` 裡的 Shell 腳本啟動服務，依腳本的編號一個接一個執行。Debian、Ubuntu 與 RHEL 系的發行版多年前都已改用 systemd，它把每一個要管理的對象寫成宣告式的 unit 檔，由 systemd 自己計算相依與順序。兩者的差異如下：' },
        { type: 'table', head: ['項目', 'SysV init', 'systemd'], rows: [
          ['設定', '`/etc/init.d/` 的 Shell 腳本，各自實作 start、stop', 'unit 檔：`鍵=值` 的宣告式設定，例如 `ExecStart=`、`User=`'],
          ['啟動順序', '依腳本的編號依序執行', '依 unit 之間的相依與順序關係，沒有關係的可以同時啟動'],
          ['追蹤行程', 'PID 檔，程式自己 fork 出的子行程容易漏掉', '每個服務一個 cgroup，服務產生的每個行程都在裡面'],
          ['失敗時', '沒有內建的重新啟動', '`Restart=` 設定自動重新啟動'],
          ['日誌', '各程式自己寫檔', 'journald 收集服務的標準輸出與錯誤（LNX11）'],
          ['操作指令', '`service nginx start`、`update-rc.d`', '`systemctl start nginx`、`systemctl enable nginx`'],
        ] },
        { type: 'p', text: 'systemd 管理的對象統稱 unit，副檔名代表類型：`.service` 是服務（本課的主角）、`.socket` 是 systemd 先替服務開好的 socket（例如網路連接埠），有連線進來時才啟動服務、`.timer` 是排程（LNX14）、`.mount` 是掛載點，`.target` 則是一組 unit 的集合，作為開機的目標與同步點。伺服器正常開機會到達 `multi-user.target`（相當於傳統的 runlevel 3），有桌面的系統是 `graphical.target`（runlevel 5）。模擬環境只模擬 `.service`，target 只出現在設定與連結的名稱裡。' },
        { type: 'callout', tone: 'tip', title: 'ps 看到的 PID 1', text: '用 `ps -p 1 -o pid,comm,args` 可以確認 PID 1 是誰：程式名稱（comm）是 `systemd`。args 欄依發行版與開機方式不同，可能是 systemd 的完整路徑（例如下一節紀錄中的機器），也可能是 `/sbin/init`，那只是指向 systemd 的符號連結。' },
      ],
    },
    {
      id: 'lnx10-s-units', title: 'unit 檔放在哪裡：/usr/lib 與 /etc',
      blocks: [
        { type: 'p', text: '一個 service unit 檔是純文字，由三個段落組成：`[Unit]` 描述這個 unit 與它和其他 unit 的關係（說明、相依、順序），`[Service]` 描述怎麼執行程式（指令、帳號、重新啟動策略），`[Install]` 描述 `systemctl enable` 時要把它掛到哪個 target 底下。每一行是 `鍵=值`，`#` 開頭的是註解。同一個 unit 檔可能出現在三個目錄：' },
        { type: 'table', head: ['目錄', '放的是什麼', '注意'], rows: [
          ['`/usr/lib/systemd/system`', '套件安裝的 unit 檔（較舊的 Debian 套件放在 `/lib/systemd/system`；在 /usr 合併的系統上兩者是同一個目錄）', '屬於套件，升級時會被覆寫，不要直接修改'],
          ['`/run/systemd/system`', '執行期間產生的 unit 檔', '放在記憶體裡，重新開機就消失'],
          ['`/etc/systemd/system`', '管理員自己寫的 unit 檔、要取代套件版本的 unit 檔，以及 enable 建立的連結', '優先權最高；套件升級不會覆寫你放在這裡的 unit 檔'],
        ] },
        { type: 'p', text: '同名的 unit 檔出現在多個目錄時，systemd 只採用優先權最高的那一份：`/etc/systemd/system` 高於 `/run/systemd/system`，再高於 `/usr/lib/systemd/system`。這是整份取代，不是合併：`/etc` 裡一旦有 `backup-agent.service`，套件版本的每一行都不再被讀取。如果只想改一兩個設定，真實系統的作法是 `sudo systemctl edit 服務`，它會在 `/etc/systemd/system/服務.service.d/override.conf` 建立 drop-in 檔，裡面只寫要改的鍵，疊加在原本的 unit 檔上，套件升級後原檔的其他改進仍然有效；`systemctl edit --full` 則把整份複製到 `/etc` 再編輯。模擬環境沒有編輯器，也不支援 drop-in，本課以整份的 unit 檔示範。' },
        { type: 'p', text: '要知道 systemd 實際用的是哪一份，用 `systemctl cat 服務`：它印出檔案的路徑與內容（有 drop-in 時也一併印出）；`systemctl status` 的 Loaded 列同樣寫著路徑。下面的紀錄先確認 PID 1 是 systemd，再看這台機器有哪些服務在執行、兩個目錄裡各有哪些 unit 檔，最後發現 backup-agent 用的是 `/etc` 裡的本機版本。' },
        { type: 'example', id: 'lnx10-tour' },
        { type: 'callout', tone: 'warning', title: '不要直接改 /usr/lib 裡的 unit 檔', text: '直接編輯 `/usr/lib/systemd/system/nginx.service` 當下看起來有效，但那個檔案屬於套件：下一次 `apt upgrade` 更新 nginx 時，它會被新版本整份覆寫，你的修改無聲無息地消失，問題往往在幾個月後的某次更新才出現。要改套件的服務，用 `systemctl edit` 建立 drop-in，或把整份複製到 `/etc/systemd/system` 再修改；自己寫的服務則一開始就放在 `/etc/systemd/system`。' },
      ],
    },
    {
      id: 'lnx10-s-systemctl', title: 'systemctl：啟動、停止與讀懂 status',
      blocks: [
        { type: 'p', text: '`systemctl` 是操作 systemd 的指令。服務名稱可以省略 `.service`（`nginx` 等於 `nginx.service`）。查詢狀態任何人都可以；改變狀態需要 root，一般使用者執行時，真實系統可能會透過 polkit 詢問密碼，沒有詢問的管道時就印出 `Interactive authentication required.`，所以習慣上加 `sudo`。' },
        { type: 'table', head: ['指令', '作用', '主行程的 PID'], rows: [
          ['`systemctl status 服務`', '顯示狀態、行程與最近的日誌（不需要 root）', '不變'],
          ['`sudo systemctl start 服務`', '現在啟動（已在執行就什麼都不做）', '新的'],
          ['`sudo systemctl stop 服務`', '現在停止：先送 SIGTERM，逾時仍未結束才送 SIGKILL', '行程結束'],
          ['`sudo systemctl restart 服務`', '先停止再啟動，連線會中斷', '新的'],
          ['`sudo systemctl reload 服務`', '執行 `ExecReload=`，請程式重新讀取自己的設定檔，不停止服務；沒有 ExecReload= 的服務不支援', '不變'],
          ['`systemctl is-active 服務`', '只印出狀態（active、inactive、failed），結束碼 0 表示 active，適合寫在腳本裡', '—'],
        ] },
        { type: 'p', text: '`systemctl status` 是排查服務問題的第一個指令，每一列都有意義：' },
        { type: 'table', head: ['列', '例子', '意義'], rows: [
          ['第一列', '`● nginx.service - A high performance web server…`', '圓點表示狀態：`●` 執行中、`×` 失敗、`○` 沒有執行；後面是 unit 名稱與 `Description=`'],
          ['Loaded', '`loaded (/usr/lib/systemd/system/nginx.service; enabled; preset: enabled)`', 'systemd 讀的是哪一份 unit 檔；`enabled`／`disabled`／`static` 表示開機時是否啟動（下一節）；preset 是發行版建議的預設值'],
          ['Active', '`active (running) since Sun 2026-11-22 08:00:04 UTC; 1h 59min ago`', '目前的狀態與從什麼時候開始；失敗時是 `failed (Result: exit-code)`'],
          ['Process', '`1302 ExecStart=/opt/… (code=exited, status=203/EXEC)`', '已經結束的程式與它的結束狀態，例如失敗的 ExecStart，或 ExecStartPre、ExecReload 這類執行完就結束的指令'],
          ['Main PID', '`812 (nginx)`', 'systemd 認定的主行程：它結束，服務就算結束，Restart= 依它怎麼結束來判斷；常見的 `ExecReload=/bin/kill -HUP $MAINPID` 也是送訊號給它'],
          ['CGroup', '`├─812 nginx: master process …`', '服務的每一個行程，包括主行程產生的 worker'],
          ['日誌', '`Nov 22 08:00:04 app-02 systemd[1]: Started nginx.service …`', '這個服務最近 10 筆日誌：systemd 的訊息與程式自己的輸出'],
        ] },
        { type: 'p', text: '紀錄中的 learner 在 adm 群組裡（Ubuntu 安裝時建立的第一個帳號預設就在 adm 與 sudo），所以不加 sudo 也看得到 status 最下面的日誌；不在這些群組的帳號要用 `sudo systemctl status` 才看得到（LNX11 詳談日誌的權限）。紀錄先讀兩個服務的狀態，再試著不用 sudo 停止 nginx；接著重新載入 nginx、重新啟動 orders-api，比較兩者的差別：reload 之後主行程的 PID 不變，restart 之後 orders-api 換了一個新的 PID，日誌裡多了停止（Stopping、Stopped）與再次啟動（Started）的紀錄。' },
        { type: 'example', id: 'lnx10-status' },
      ],
    },
    {
      id: 'lnx10-s-enable', title: '開機自動啟動：enable 不等於 start',
      blocks: [
        { type: 'p', text: '每個服務有兩個彼此獨立的開關。第一個是「現在是否在執行」，由 `start`、`stop` 切換，記錄在 systemd 的記憶體裡，重新開機後就不算數。第二個是「開機時是否啟動」，由 `enable`、`disable` 切換，記錄在磁碟上：`enable` 讀取 unit 檔 `[Install]` 段的 `WantedBy=multi-user.target`，在 `/etc/systemd/system/multi-user.target.wants/` 建立一個指向 unit 檔的符號連結。開機時 systemd 要到達 multi-user.target，就會連同它 `.wants` 目錄裡的每一個服務一起啟動。' },
        { type: 'table', head: ['指令', '現在', '下次開機'], rows: [
          ['`sudo systemctl start 服務`', '啟動', '不影響（沒有 enable 就不會啟動）'],
          ['`sudo systemctl enable 服務`', '不影響（沒有執行的仍然沒有執行）', '啟動：建立 `.wants` 裡的連結'],
          ['`sudo systemctl enable --now 服務`', '啟動', '啟動'],
          ['`sudo systemctl stop 服務`', '停止', '不影響'],
          ['`sudo systemctl disable 服務`', '不影響', '不啟動：移除連結'],
          ['`sudo systemctl disable --now 服務`', '停止', '不啟動'],
        ] },
        { type: 'p', text: '`systemctl is-enabled` 印出開機時的設定：`enabled`、`disabled`，或 `static`。static 表示 unit 檔沒有 `[Install]` 段，不能被 enable：它可以手動 start，也會被別的 unit 的相依關係帶起來，但不能自己設定成開機啟動，例如這台機器的 orders-db 由 orders-api 的 `Requires=` 啟動。另外，`enable` 與 `disable` 完成後會順便讓 systemd 重新載入設定（等同 daemon-reload）。想讓一個服務無論如何都不能被啟動（連手動 start 與相依都不行）時，真實系統用 `systemctl mask`，它把 unit 連結到 `/dev/null`。' },
        { type: 'p', text: '下面的紀錄用 report-mailer 把兩個開關分開操作：start 之後它在執行，is-enabled 仍是 disabled；enable 之後 `.wants` 目錄多了一個連結；最後用 `disable --now` 一次關掉兩個開關。' },
        { type: 'example', id: 'lnx10-enable' },
        { type: 'callout', tone: 'warning', title: '「我明明啟動了，重開機後就不見了」', text: '最常見的服務事故之一：管理員用 `systemctl start` 把服務跑起來，測試也正常，幾週後機器因為核心更新重新開機，服務沒有回來，因為它從來沒有被 enable。反過來也常見：`systemctl enable` 之後以為服務已經在跑，其實要等到下次開機。新服務上線時用 `sudo systemctl enable --now`，再用 `systemctl is-enabled` 與 `systemctl is-active` 各確認一次。' },
      ],
    },
    {
      id: 'lnx10-s-write', title: '為自己的程式寫一個 service unit',
      blocks: [
        { type: 'p', text: 'app-02 上的團隊新寫了一支 PDF 轉檔程式，放在 `/opt/pdf-render/bin/pdf-render`，要以專用的帳號 pdf 執行。一個最小但完整的 service unit 需要的鍵如下：' },
        { type: 'table', head: ['段落', '鍵', '意義'], rows: [
          ['[Unit]', '`Description=PDF render service`', 'status 第一列與日誌中的說明文字'],
          ['[Unit]', '`After=network.target`', '順序：開機時排在網路管理堆疊啟動之後。它不保證網路已經連通，需要等網路就緒的服務要加 `Wants=network-online.target` 與 `After=network-online.target`'],
          ['[Service]', '`ExecStart=/opt/pdf-render/bin/pdf-render`', '要執行的程式與參數。寫絕對路徑，systemd 不使用你的 Shell 的 PATH；程式應該留在前景執行，自己轉到背景的傳統 daemon（例如 nginx）要另外寫 `Type=forking`'],
          ['[Service]', '`User=pdf`', '以哪個帳號執行；不寫就是 root'],
          ['[Service]', '`Restart=on-failure`', '程式失敗時重新啟動（下一節）'],
          ['[Service]', '`RestartSec=5`', '重新啟動前等待的時間，預設 100ms'],
          ['[Install]', '`WantedBy=multi-user.target`', '`enable` 時把連結放在 multi-user.target 的 `.wants` 目錄'],
        ] },
        { type: 'p', text: '兩個細節決定了寫完之後的步驟。第一，`Type=` 的預設值是 simple：systemd 一建立行程就算啟動成功，所以 `systemctl start` 不印任何東西、結束碼是 0，即使程式下一刻就失敗了；啟動之後一定要用 `systemctl status` 確認（`Type=exec` 會等程式真的執行起來，執行不了時 start 就會回報失敗）。第二，systemd 把 unit 檔讀進記憶體後就使用那一份；修改了已經載入的 unit 檔，必須執行 `sudo systemctl daemon-reload` 讓它重新讀取所有的 unit 檔，否則 systemctl 會警告 `changed on disk`，並且繼續用舊的設定。daemon-reload 只重新讀取設定，不會重新啟動任何服務，所以之後還要 restart。全新的 unit 檔通常第一次使用時就會被讀入，但「寫完、改完都 daemon-reload」是最不會出錯的習慣。' },
        { type: 'p', text: 'systemd 執行不了程式時，status 的結束狀態會寫出是哪一步失敗：`203/EXEC` 是 ExecStart 的程式不存在或沒有執行權限，`217/USER` 是 `User=` 指定的帳號不存在。紀錄中第一版的 ExecStart 少了 `bin/`：start 安靜地成功，status 卻是 203/EXEC；修正檔案後直接 restart，systemd 警告檔案已改變並用舊設定再失敗一次；daemon-reload 之後才真正執行起來，最後用 `ps -u pdf` 確認它以 pdf 帳號執行。' },
        { type: 'example', id: 'lnx10-write' },
        { type: 'callout', tone: 'tip', title: '服務用專用帳號，不用 root', text: '沒有寫 `User=` 的服務以 root 執行，程式的任何一個漏洞都等於整台機器的 root 權限。替每個服務建立專用的系統帳號（例如 `sudo useradd -r -s /usr/sbin/nologin pdf`，LNX06），只給它需要的目錄權限，再在 unit 檔寫上 `User=`。需要綁定 1024 以下的連接埠時，也是只給那一項能力（`AmbientCapabilities=CAP_NET_BIND_SERVICE`），而不是整個以 root 執行。' },
      ],
    },
    {
      id: 'lnx10-s-restart', title: '重新啟動策略、啟動上限與服務相依',
      blocks: [
        { type: 'p', text: '`Restart=` 決定主行程結束後 systemd 要不要重新啟動它，預設是 `no`。判斷依據是結束得「乾淨」與否：結束碼 0，或被 SIGHUP、SIGINT、SIGTERM、SIGPIPE 結束，算乾淨；非零的結束碼、被其他訊號（例如 SIGKILL、SIGSEGV）結束、逾時，都算失敗。不論哪一種設定，`systemctl stop` 都不會觸發重新啟動。' },
        { type: 'table', head: ['Restart=', '乾淨結束', '非零結束碼', '被其他訊號結束', '常見用途'], rows: [
          ['`no`（預設）', '不重啟', '不重啟', '不重啟', '一次性的工作'],
          ['`on-failure`', '不重啟', '重啟', '重啟', '大多數長駐服務的建議值'],
          ['`on-abnormal`', '不重啟', '不重啟', '重啟', '結束碼有特別意義、只在當掉時重啟的程式'],
          ['`always`', '重啟', '重啟', '重啟', '無論如何都要一直執行的程式'],
        ] },
        { type: 'p', text: '重新啟動有上限，避免壞掉的程式無止境地重啟：預設在 10 秒內（`StartLimitIntervalSec=10s`）啟動超過 5 次（`StartLimitBurst=5`），systemd 就記錄 `Start request repeated too quickly.` 並放棄，服務成為 failed。這兩個鍵寫在 `[Unit]` 段。預設的 `RestartSec=100ms` 讓一支一啟動就失敗的程式在一秒內就撞到上限；`RestartSec=5` 則讓每次重試間隔 5 秒，10 秒內不會超過 5 次，服務會一直重試下去。撞到上限之後，真實系統若還在那 10 秒的區間內，手動 start 也會被拒絕，可以等一下或先執行 `sudo systemctl reset-failed 服務`；模擬環境把每一次手動 start 都當成區間已經過去。' },
        { type: 'p', text: '服務之間的關係寫在 `[Unit]` 段，最容易混淆的是「順序」與「相依」是兩回事：' },
        { type: 'table', head: ['設定', '會不會一起啟動對方', '對方失敗或停止時', '說明'], rows: [
          ['`After=b.service`', '不會', '不影響', '只管順序：兩者都要啟動時，先等 b 啟動完成；`Before=` 相反'],
          ['`Wants=b.service`', '會', '不影響', '弱相依：b 啟動失敗或不存在，這個服務照樣啟動'],
          ['`Requires=b.service`', '會', 'b 被明確停止或重新啟動時，這個服務跟著停止或重新啟動；b 啟動失敗而且也寫了 `After=b.service` 時，這個服務不啟動', '強相依'],
          ['`WantedBy=x.target`（[Install]）', '—', '—', '反方向的 Wants：enable 時讓 x.target 想要這個服務'],
        ] },
        { type: 'p', text: '沒有 `After=` 的 Requires 或 Wants 會讓兩個服務同時啟動，所以實務上總是成對使用：orders-api 寫的是 `Requires=orders-db.service` 加 `After=orders-db.service`。紀錄中先用 `kill -9` 模擬 orders-api 當掉，`Restart=on-failure` 讓它以新的 PID 回來；改送 SIGTERM 是乾淨的結束，它就不再重啟。接著啟動缺少設定檔的 metrics-push：start 一樣安靜地成功，status 卻顯示 systemd 重試五次後放棄。最後停止 orders-db，Requires 它的 orders-api 跟著停止；再啟動 orders-api，orders-db 也被一起帶起來。' },
        { type: 'example', id: 'lnx10-restart' },
        { type: 'callout', tone: 'warning', title: 'Restart=always 不是修好', text: '把 `Restart=` 設成 always，再把 `StartLimitBurst=` 調大，確實能讓服務「看起來」一直在執行，但程式其實每隔幾秒就當掉一次：請求失敗、資料寫到一半、日誌被重複的錯誤淹沒。自動重新啟動是為了撐過偶發的當機，不是用來掩蓋每次都會發生的錯誤。看到重啟計數一直增加或 `Start request repeated too quickly`，要往前找程式自己印出的錯誤訊息，修好原因（缺少的設定檔、錯誤的路徑、不存在的帳號），再 restart。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'lnx10-q1', prompt: '下列哪一項不是 init（PID 1）的工作？',
      options: ['開機時依相依與順序啟動系統的服務', '收養父行程已經結束的孤兒行程，並回收它們的結束狀態', '替登入的使用者解讀輸入的每一行指令', '關機時依相反的順序停止服務'],
      answer: 2,
      explanation: '解讀使用者輸入的指令是 Shell（例如 bash）的工作，每個登入的工作階段各有一個 Shell，它只是 PID 1 的子孫之一。依相依與順序啟動服務、收養並回收孤兒行程、關機時依序停止服務，都是 init 的職責；在 systemd 系統上，PID 1 就是 systemd。',
    },
    {
      id: 'lnx10-q2', prompt: '`/usr/lib/systemd/system/backup-agent.service` 與 `/etc/systemd/system/backup-agent.service` 同時存在，內容不同。systemd 會怎麼做？',
      options: ['只使用 `/etc` 那一份，套件的版本整份不被讀取', '把兩份合併，同一個鍵以 `/etc` 的為準', '只使用 `/usr/lib` 那一份，因為它是套件安裝的', '使用修改時間比較新的那一份'],
      answer: 0,
      explanation: '同名的 unit 檔只採用優先權最高的目錄：/etc/systemd/system 高於 /run/systemd/system，再高於 /usr/lib/systemd/system，而且是整份取代。會「合併、同鍵以新的為準」的是 drop-in（服務.service.d/*.conf，由 `systemctl edit` 建立）；套件的版本優先權最低，正是為了讓管理員能覆寫它；systemd 不看檔案的修改時間。',
    },
    {
      id: 'lnx10-q3', prompt: '管理員執行 `sudo systemctl start report-mailer`，`systemctl status` 也顯示 active (running)。隔天機器重新開機後，report-mailer 會怎樣？',
      options: ['自動啟動，因為 systemd 會記住重開機前在執行的服務', '自動啟動，但以 root 的身分執行', '開機時啟動失敗，狀態變成 failed', '不會啟動，因為它沒有被 enable，`multi-user.target.wants` 裡沒有它的連結'],
      answer: 3,
      explanation: 'start 只改變「現在」的狀態，記錄在 systemd 的記憶體裡，重開機後就不算數；開機時要不要啟動由 enable 建立的連結決定，report-mailer 沒有被 enable，所以不會啟動（它不會失敗，只是根本沒被啟動）。systemd 不會記住重開機前的執行狀態，而服務以哪個帳號執行由 `User=` 決定，和開機無關。',
    },
    {
      id: 'lnx10-q4', prompt: '你修改了已經在執行的 `/etc/systemd/system/api.service`（改了 ExecStart 的參數），接著直接執行 `sudo systemctl restart api`。結果是？',
      options: ['服務以新的參數重新啟動，restart 會自動讀取新的 unit 檔', 'systemctl 警告 unit 檔在磁碟上已改變、要執行 daemon-reload，服務仍以舊的設定重新啟動', 'restart 被拒絕，服務維持原狀，直到 daemon-reload 為止', '服務停止後不再啟動，因為設定不一致'],
      answer: 1,
      explanation: 'systemd 使用讀進記憶體的那一份設定；檔案改了而沒有 `sudo systemctl daemon-reload`，systemctl 印出 changed on disk 的警告，restart 照樣執行，但用的是舊的 ExecStart。restart 不會自動重新讀取 unit 檔，也不會因此被拒絕或讓服務停下來；正確的順序是先 daemon-reload，再 restart。',
    },
    {
      id: 'lnx10-q5', prompt: '`systemctl status` 顯示 `Main PID: 1410 (code=exited, status=203/EXEC)`。最可能的原因是？',
      options: ['程式執行到一半當掉，結束碼是 203', '`User=` 指定的帳號不存在', 'ExecStart 指定的程式不存在或沒有執行權限，systemd 根本執行不了它', '服務被 `systemctl stop` 停止了'],
      answer: 2,
      explanation: '203/EXEC 是 systemd 自己的結束狀態，表示在執行 ExecStart 的那一步就失敗了：路徑錯誤、檔案不存在或沒有 x 權限，程式一行都沒有執行。帳號不存在是 217/USER；程式自己結束時的結束碼由程式決定，通常是 1 這類數字；被 stop 的服務是 inactive，不會顯示失敗的結束狀態。',
    },
    {
      id: 'lnx10-q6', prompt: '服務設定了 `Restart=on-failure`。下列哪一種情況，systemd 會重新啟動它？',
      options: ['程式完成工作，以結束碼 0 結束', '主行程被 `kill -9`（SIGKILL）結束', '管理員執行了 `sudo systemctl stop`', '主行程收到 SIGTERM 後正常結束'],
      answer: 1,
      explanation: 'on-failure 只在「不乾淨」的結束時重新啟動：非零的結束碼、被 SIGKILL 這類訊號結束、逾時。結束碼 0 與被 SIGHUP、SIGINT、SIGTERM、SIGPIPE 結束都算乾淨的結束，不重啟；`systemctl stop` 是明確的停止，任何 Restart= 設定都不會因此重新啟動。',
    },
    {
      id: 'lnx10-q7', prompt: 'orders-api 需要資料庫 orders-db：啟動 API 時要把資料庫一起帶起來並等它先啟動完成，資料庫被停止時 API 也該跟著停止。orders-api 的 `[Unit]` 應該寫？',
      options: ['只寫 `After=orders-db.service`', '只寫 `Wants=orders-db.service`', '在 `[Install]` 寫 `WantedBy=orders-db.service`', '`Requires=orders-db.service` 加上 `After=orders-db.service`'],
      answer: 3,
      explanation: 'Requires 讓 orders-db 跟著被啟動，而且 orders-db 被明確停止時 orders-api 也會停止；After 才保證先等 orders-db 啟動完成，兩者成對使用。只寫 After 只管順序，不會把資料庫帶起來；Wants 是弱相依，資料庫停止或失敗都不影響 API；WantedBy 寫在 [Install]，是 enable 時讓對方「想要」這個服務，方向和意義都不對。',
    },
    {
      id: 'lnx10-q8', prompt: '你修改了 nginx 自己的設定檔 `/etc/nginx/nginx.conf`，想讓它讀入新設定，又不中斷正在進行的連線。應該執行？',
      options: ['`sudo systemctl reload nginx`', '`sudo systemctl daemon-reload`', '`sudo systemctl restart nginx`', '`sudo systemctl enable --now nginx`'],
      answer: 0,
      explanation: 'reload 執行 unit 檔的 ExecReload=（nginx 是 `nginx -s reload`），請程式重新讀取自己的設定檔，主行程不變、連線不中斷。daemon-reload 只讓 systemd 重新讀取 unit 檔，不會通知 nginx；restart 會先停止再啟動，連線因此中斷；enable --now 只處理開機設定與「還沒執行就啟動」，對已在執行的 nginx 沒有作用。',
    },
  ],
  terminal: {
    machines: [appHost, webHost, linkHost, mediaHost, payHost],
    examples: [
      {
        id: 'lnx10-tour', title: 'PID 1 與 unit 檔的位置', machine: 'app',
        description: '`ps -p 1` 確認 PID 1 是 systemd，`/sbin/init` 只是指向它的連結；`list-units` 列出執行中的服務；套件的 unit 檔在 /usr/lib，管理員的在 /etc；backup-agent 兩邊都有，systemd 用的是 /etc 那一份。',
        steps: [
          { command: 'ps -p 1 -o pid,user,comm,args', output: '    PID USER     COMMAND         COMMAND\n      1 root     systemd         /usr/lib/systemd/systemd --switched-root --system --deserialize=31' },
          { command: 'ls -l /sbin/init', output: 'lrwxrwxrwx root    root       20 /sbin/init -> /lib/systemd/systemd' },
          { command: 'systemctl list-units --type=service', output: '  UNIT                 LOAD   ACTIVE SUB     DESCRIPTION\n  backup-agent.service loaded active running Backup agent\n  cron.service         loaded active running Regular background program processing daemon\n  nginx.service        loaded active running A high performance web server and a reverse proxy server\n  orders-api.service   loaded active running Orders API\n  orders-db.service    loaded active running Orders database\n\nLegend: LOAD   → Reflects whether the unit definition was properly loaded.\n        ACTIVE → The high-level unit activation state, i.e. generalization of SUB.\n        SUB    → The low-level unit activation state, values depend on unit type.\n\n5 loaded units listed. Pass --all to see loaded but inactive units, too.\nTo show all installed unit files use \'systemctl list-unit-files\'.' },
          { command: 'ls /usr/lib/systemd/system', output: 'backup-agent.service  cron.service  nginx.service  report-mailer.service' },
          { command: 'ls /etc/systemd/system', output: 'backup-agent.service  metrics-push.service  multi-user.target.wants/  orders-api.service  orders-db.service' },
          { command: 'systemctl cat backup-agent', output: '# /etc/systemd/system/backup-agent.service\n# Local copy: back up to /srv/backup at 02:00 instead of S3.\n[Unit]\nDescription=Backup agent\nWants=network-online.target\nAfter=network-online.target\n\n[Service]\nExecStart=/usr/bin/backup-agent --target /srv/backup --schedule 02:00\nRestart=on-failure\n\n[Install]\nWantedBy=multi-user.target' },
          { command: 'systemctl status backup-agent | head -n 3', output: '● backup-agent.service - Backup agent\n     Loaded: loaded (/etc/systemd/system/backup-agent.service; enabled; preset: enabled)\n     Active: active (running) since Sun 2026-11-22 08:00:05 UTC; 1h 59min ago' },
        ],
      },
      {
        id: 'lnx10-status', title: '讀懂 status，啟動、重新啟動與重新載入', machine: 'app',
        description: '讀 nginx 與 orders-api 的 status；沒有 sudo 不能停止服務；reload 不換主行程，restart 換了新的 PID；`is-active` 的結束碼 3 表示沒有執行。',
        steps: [
          { command: 'systemctl status nginx', output: '● nginx.service - A high performance web server and a reverse proxy server\n     Loaded: loaded (/usr/lib/systemd/system/nginx.service; enabled; preset: enabled)\n     Active: active (running) since Sun 2026-11-22 08:00:04 UTC; 1h 59min ago\n   Main PID: 812 (nginx)\n     CGroup: /system.slice/nginx.service\n             ├─812 nginx: master process /usr/sbin/nginx -g daemon on; master_process on;\n             ├─813 nginx: worker process\n             └─814 nginx: worker process\n\nNov 22 08:00:04 app-02 systemd[1]: Starting nginx.service - A high performance web server and a reverse proxy server...\nNov 22 08:00:04 app-02 systemd[1]: Started nginx.service - A high performance web server and a reverse proxy server.' },
          { command: 'systemctl status orders-api', output: '● orders-api.service - Orders API\n     Loaded: loaded (/etc/systemd/system/orders-api.service; enabled; preset: enabled)\n     Active: active (running) since Sun 2026-11-22 08:00:06 UTC; 1h 59min ago\n   Main PID: 902 (orders-api)\n     CGroup: /system.slice/orders-api.service\n             └─902 /opt/orders/bin/orders-api --port 8081\n\nNov 22 08:00:06 app-02 systemd[1]: Started orders-api.service - Orders API.\nNov 22 08:00:06 app-02 orders-api[902]: listening on :8081' },
          { command: 'systemctl stop nginx', output: 'Failed to stop nginx.service: Interactive authentication required.\nSee system logs and \'systemctl status nginx.service\' for details.' },
          { command: 'sudo systemctl reload nginx', output: '' },
          { command: 'sudo systemctl restart orders-api', output: '' },
          { command: 'systemctl status orders-api', output: '● orders-api.service - Orders API\n     Loaded: loaded (/etc/systemd/system/orders-api.service; enabled; preset: enabled)\n     Active: active (running) since Sun 2026-11-22 10:00:00 UTC; now\n   Main PID: 1302 (orders-api)\n     CGroup: /system.slice/orders-api.service\n             └─1302 /opt/orders/bin/orders-api --port 8081\n\nNov 22 08:00:06 app-02 systemd[1]: Started orders-api.service - Orders API.\nNov 22 08:00:06 app-02 orders-api[902]: listening on :8081\nNov 22 10:00:00 app-02 systemd[1]: Stopping orders-api.service - Orders API...\nNov 22 10:00:00 app-02 systemd[1]: orders-api.service: Deactivated successfully.\nNov 22 10:00:00 app-02 systemd[1]: Stopped orders-api.service - Orders API.\nNov 22 10:00:00 app-02 systemd[1]: Started orders-api.service - Orders API.\nNov 22 10:00:00 app-02 orders-api[1302]: listening on :8081' },
          { command: 'systemctl is-active report-mailer', output: 'inactive' },
          { command: 'echo $?', output: '3' },
        ],
      },
      {
        id: 'lnx10-enable', title: 'start 與 enable 是兩個開關', machine: 'app',
        description: 'start 讓服務現在執行，但 is-enabled 仍是 disabled；enable 在 multi-user.target.wants 建立連結；`disable --now` 同時移除連結並停止服務；沒有 [Install] 的 orders-db 是 static。',
        steps: [
          { command: 'systemctl is-enabled report-mailer', output: 'disabled' },
          { command: 'sudo systemctl start report-mailer', output: '' },
          { command: 'systemctl is-active report-mailer', output: 'active' },
          { command: 'systemctl is-enabled report-mailer', output: 'disabled' },
          { command: 'systemctl enable report-mailer', output: 'Failed to enable unit: Interactive authentication required.' },
          { command: 'sudo systemctl enable report-mailer', output: 'Created symlink /etc/systemd/system/multi-user.target.wants/report-mailer.service → /usr/lib/systemd/system/report-mailer.service.' },
          { command: `ls -l ${WANTS}`, output: 'lrwxrwxrwx root    root       40 backup-agent.service -> /etc/systemd/system/backup-agent.service\nlrwxrwxrwx root    root       36 cron.service -> /usr/lib/systemd/system/cron.service\nlrwxrwxrwx root    root       37 nginx.service -> /usr/lib/systemd/system/nginx.service\nlrwxrwxrwx root    root       38 orders-api.service -> /etc/systemd/system/orders-api.service\nlrwxrwxrwx root    root       45 report-mailer.service -> /usr/lib/systemd/system/report-mailer.service' },
          { command: 'sudo systemctl disable --now report-mailer', output: 'Removed "/etc/systemd/system/multi-user.target.wants/report-mailer.service".' },
          { command: 'systemctl is-active report-mailer', output: 'inactive' },
          { command: 'systemctl is-enabled orders-db', output: 'static' },
        ],
      },
      {
        id: 'lnx10-write', title: '寫 unit 檔、203/EXEC 與 daemon-reload', machine: 'app',
        description: '第一版的 ExecStart 路徑錯了：start 沒有印出任何錯誤，status 是 203/EXEC；修正後忘了 daemon-reload，systemd 警告並沿用舊設定；重新載入、重新啟動、enable 之後，服務以 pdf 帳號執行。',
        steps: [
          { command: 'ls /opt/pdf-render/bin', output: 'pdf-render' },
          { command: teeUnit('/etc/systemd/system/pdf-render.service', PDF_DRAFT), output: '[Unit]\nDescription=PDF render service\nAfter=network.target\n\n[Service]\nExecStart=/opt/pdf-render/pdf-render\nUser=pdf\n\n[Install]\nWantedBy=multi-user.target' },
          { command: 'sudo systemctl start pdf-render', output: '' },
          { command: 'systemctl status pdf-render', output: '× pdf-render.service - PDF render service\n     Loaded: loaded (/etc/systemd/system/pdf-render.service; disabled; preset: enabled)\n     Active: failed (Result: exit-code) since Sun 2026-11-22 10:00:00 UTC; now\n    Process: 1302 ExecStart=/opt/pdf-render/pdf-render (code=exited, status=203/EXEC)\n   Main PID: 1302 (code=exited, status=203/EXEC)\n\nNov 22 10:00:00 app-02 systemd[1]: Started pdf-render.service - PDF render service.\nNov 22 10:00:00 app-02 systemd[1]: pdf-render.service: Failed to locate executable /opt/pdf-render/pdf-render: No such file or directory\nNov 22 10:00:00 app-02 systemd[1]: pdf-render.service: Failed at step EXEC spawning /opt/pdf-render/pdf-render: No such file or directory\nNov 22 10:00:00 app-02 systemd[1]: pdf-render.service: Main process exited, code=exited, status=203/EXEC\nNov 22 10:00:00 app-02 systemd[1]: pdf-render.service: Failed with result \'exit-code\'.' },
          { command: teeUnit('/etc/systemd/system/pdf-render.service', PDF_FIXED), output: '[Unit]\nDescription=PDF render service\nAfter=network.target\n\n[Service]\nExecStart=/opt/pdf-render/bin/pdf-render\nUser=pdf\nRestart=on-failure\nRestartSec=5\n\n[Install]\nWantedBy=multi-user.target' },
          { command: 'sudo systemctl restart pdf-render', output: 'Warning: The unit file, source configuration file or drop-ins of pdf-render.service changed on disk. Run \'systemctl daemon-reload\' to reload units.' },
          { command: 'systemctl is-active pdf-render', output: 'failed' },
          { command: 'sudo systemctl daemon-reload', output: '' },
          { command: 'sudo systemctl restart pdf-render', output: '' },
          { command: 'sudo systemctl enable pdf-render', output: 'Created symlink /etc/systemd/system/multi-user.target.wants/pdf-render.service → /etc/systemd/system/pdf-render.service.' },
          { command: 'systemctl status pdf-render | head -n 6', output: '● pdf-render.service - PDF render service\n     Loaded: loaded (/etc/systemd/system/pdf-render.service; enabled; preset: enabled)\n     Active: active (running) since Sun 2026-11-22 10:00:00 UTC; now\n   Main PID: 1304 (pdf-render)\n     CGroup: /system.slice/pdf-render.service\n             └─1304 /opt/pdf-render/bin/pdf-render' },
          { command: 'ps -o user,pid,args -u pdf', output: 'USER         PID COMMAND\npdf         1304 /opt/pdf-render/bin/pdf-render' },
        ],
      },
      {
        id: 'lnx10-restart', title: 'Restart=、啟動上限與 Requires=', machine: 'app',
        description: '`kill -9` 之後 Restart=on-failure 以新的 PID 重新啟動；SIGTERM 是乾淨的結束，不重啟；缺少設定檔的 metrics-push 重試五次後撞到啟動上限；停止 orders-db 會連帶停止 Requires 它的 orders-api，啟動 orders-api 會把 orders-db 一起帶起來。',
        steps: [
          { command: 'pgrep -a orders', output: '870 /opt/orders/bin/orders-db --data /var/lib/orders\n902 /opt/orders/bin/orders-api --port 8081' },
          { command: 'sudo kill -9 902', output: '' },
          { command: 'systemctl status orders-api', output: '● orders-api.service - Orders API\n     Loaded: loaded (/etc/systemd/system/orders-api.service; enabled; preset: enabled)\n     Active: active (running) since Sun 2026-11-22 10:00:00 UTC; now\n   Main PID: 1302 (orders-api)\n     CGroup: /system.slice/orders-api.service\n             └─1302 /opt/orders/bin/orders-api --port 8081\n\nNov 22 08:00:06 app-02 systemd[1]: Started orders-api.service - Orders API.\nNov 22 08:00:06 app-02 orders-api[902]: listening on :8081\nNov 22 10:00:00 app-02 systemd[1]: orders-api.service: Main process exited, code=killed, status=9/KILL\nNov 22 10:00:00 app-02 systemd[1]: orders-api.service: Failed with result \'signal\'.\nNov 22 10:00:00 app-02 systemd[1]: orders-api.service: Scheduled restart job, restart counter is at 1.\nNov 22 10:00:00 app-02 systemd[1]: Stopped orders-api.service - Orders API.\nNov 22 10:00:00 app-02 systemd[1]: Started orders-api.service - Orders API.\nNov 22 10:00:00 app-02 orders-api[1302]: listening on :8081' },
          { command: 'sudo kill 1302', output: '' },
          { command: 'systemctl is-active orders-api', output: 'inactive' },
          { command: 'sudo systemctl start metrics-push', output: '' },
          { command: 'echo $?', output: '0' },
          { command: 'systemctl status metrics-push', output: '× metrics-push.service - Metrics push agent\n     Loaded: loaded (/etc/systemd/system/metrics-push.service; disabled; preset: enabled)\n     Active: failed (Result: exit-code) since Sun 2026-11-22 10:00:00 UTC; now\n    Process: 1307 ExecStart=/usr/local/bin/metrics-push --config /etc/metrics-push.conf (code=exited, status=1/FAILURE)\n   Main PID: 1307 (code=exited, status=1/FAILURE)\n\nNov 22 10:00:00 app-02 systemd[1]: Stopped metrics-push.service - Metrics push agent.\nNov 22 10:00:00 app-02 systemd[1]: Started metrics-push.service - Metrics push agent.\nNov 22 10:00:00 app-02 metrics-push[1307]: cannot read /etc/metrics-push.conf: No such file or directory\nNov 22 10:00:00 app-02 systemd[1]: metrics-push.service: Main process exited, code=exited, status=1/FAILURE\nNov 22 10:00:00 app-02 systemd[1]: metrics-push.service: Failed with result \'exit-code\'.\nNov 22 10:00:00 app-02 systemd[1]: metrics-push.service: Scheduled restart job, restart counter is at 5.\nNov 22 10:00:00 app-02 systemd[1]: Stopped metrics-push.service - Metrics push agent.\nNov 22 10:00:00 app-02 systemd[1]: metrics-push.service: Start request repeated too quickly.\nNov 22 10:00:00 app-02 systemd[1]: metrics-push.service: Failed with result \'exit-code\'.\nNov 22 10:00:00 app-02 systemd[1]: Failed to start metrics-push.service - Metrics push agent.' },
          { command: 'sudo systemctl start orders-api', output: '' },
          { command: 'sudo systemctl stop orders-db', output: '' },
          { command: 'systemctl is-active orders-db orders-api', output: 'inactive\ninactive' },
          { command: 'sudo systemctl start orders-api', output: '' },
          { command: 'pgrep -a orders', output: '1309 /opt/orders/bin/orders-db --data /var/lib/orders\n1310 /opt/orders/bin/orders-api --port 8081' },
        ],
      },
    ],
    exercises: [
      {
        id: 'lnx10-enable-now', title: '啟動服務，並讓它開機時自動啟動', machine: 'web',
        statement: 'web-05 剛裝好 status-page 套件（對外的服務狀態頁），它的 unit 檔在 `/usr/lib/systemd/system/status-page.service`。目前這個服務沒有執行，下次開機也不會啟動。請讓 `status-page` 現在就執行，並且以後每次開機都自動啟動。不要修改 unit 檔。',
        checks: [
          { kind: 'service', unit: 'status-page', active: 'active', enabled: true },
          { kind: 'unchanged', path: '/usr/lib/systemd/system/status-page.service' },
        ],
        solution: ['systemctl status status-page', 'sudo systemctl enable --now status-page', 'systemctl is-enabled status-page', 'systemctl is-active status-page'],
        mistakes: [
          { commands: ['sudo systemctl start status-page'], why: '服務現在執行了，但沒有 enable：`multi-user.target.wants` 裡沒有它的連結，下次開機 systemd 不會啟動它。' },
          { commands: ['sudo systemctl enable status-page'], why: 'enable 只建立開機時用的連結，不會現在就啟動服務；要再 start，或一開始就用 `enable --now`。' },
          { commands: ['systemctl enable --now status-page'], why: '沒有 sudo：一般使用者不能改變服務，systemctl 回報 Interactive authentication required，什麼都沒有改變。' },
        ],
        hints: [
          '先 `systemctl status status-page`：Loaded 列的 disabled 與 Active 列的 inactive，表示兩個開關都還關著。',
          '`start` 管現在，`enable` 管開機；`enable --now` 一次做兩件事。',
          '改變服務需要 root，記得加 sudo。',
        ],
        explanation: '`sudo systemctl enable --now status-page` 依 `[Install]` 的 `WantedBy=multi-user.target` 在 `/etc/systemd/system/multi-user.target.wants/` 建立連結（開機時啟動），並且現在就啟動服務；之後 is-enabled 是 enabled、is-active 是 active。分開執行 `sudo systemctl start status-page` 與 `sudo systemctl enable status-page` 結果相同。只做其中一個，就只打開了一個開關。',
      },
      {
        id: 'lnx10-unit', title: '把 shortlink 寫成正式的服務', machine: 'link',
        statement: 'link-01 上，同事寫了 `/etc/systemd/system/shortlink.service` 的草稿，systemd 已經讀入它，但啟動失敗了；程式的說明在 `/opt/shortlink/README.txt`。請把 unit 檔改寫成正式的版本，內容依序是這 12 行：`[Unit]`、`Description=Shortlink URL service`、`After=network.target`、空行、`[Service]`、`ExecStart=` 加上程式正確的絕對路徑與參數 `--port 8080`、`User=shortlink`、`Restart=on-failure`、`RestartSec=5`、空行、`[Install]`、`WantedBy=multi-user.target`。然後讓 systemd 讀入新的設定，現在就啟動 shortlink，並讓它開機時自動啟動。模擬環境沒有文字編輯器，可以用 `echo -e "第一行\\n第二行…" | sudo tee 檔案` 整份重寫（`\\n` 是換行）。',
        checks: [
          { kind: 'content', path: SHORTLINK_PATH, content: SHORTLINK_UNIT },
          { kind: 'service', unit: 'shortlink', active: 'active', enabled: true },
          { kind: 'process', name: 'shortlink', user: 'shortlink' },
        ],
        solution: ['systemctl status shortlink', 'ls /opt/shortlink/bin', teeUnit(SHORTLINK_PATH, SHORTLINK_LINES), 'sudo systemctl daemon-reload', 'sudo systemctl start shortlink', 'sudo systemctl enable shortlink', 'systemctl status shortlink'],
        mistakes: [
          { commands: [teeUnit(SHORTLINK_PATH, SHORTLINK_LINES), 'sudo systemctl start shortlink', 'sudo systemctl enable shortlink'], why: '檔案改對了，但沒有 daemon-reload：start 印出 changed on disk 的警告，systemd 仍用記憶體裡的舊草稿，以錯誤的路徑啟動又得到 203/EXEC。之後的 enable 雖然會順便重新載入設定，但服務已經失敗了。' },
          { commands: [teeUnit(SHORTLINK_PATH, SHORTLINK_LINES.map(l => l.replace('/bin/shortlink', '/shortlink'))), 'sudo systemctl daemon-reload', 'sudo systemctl enable --now shortlink'], why: 'ExecStart 仍是草稿裡的 /opt/shortlink/shortlink，那個檔案不存在，程式執行不了（203/EXEC）；Restart=on-failure 只會每 5 秒重試同樣的失敗，服務停在 activating (auto-restart)。' },
          { commands: [teeUnit(SHORTLINK_PATH, SHORTLINK_LINES.filter(l => !l.startsWith('User='))), 'sudo systemctl daemon-reload', 'sudo systemctl enable --now shortlink'], why: '少了 `User=shortlink`，服務以 root 執行：程式一旦有漏洞，攻擊者拿到的就是整台機器的 root 權限。' },
          { commands: [teeUnit(SHORTLINK_PATH, SHORTLINK_LINES), 'sudo systemctl daemon-reload', 'sudo systemctl start shortlink'], why: '服務現在執行了，但沒有 enable，重新開機後不會自己回來。' },
        ],
        hints: [
          '先 `systemctl status shortlink`：status=203/EXEC 表示 systemd 執行不了 ExecStart 指定的程式。',
          '用 `ls /opt/shortlink/bin` 或讀 README.txt 找到程式真正的路徑。',
          '改過已載入的 unit 檔，要先 `sudo systemctl daemon-reload`，再 start 與 enable（或 `enable --now`）。',
        ],
        explanation: '草稿有三個問題：ExecStart 指向不存在的 /opt/shortlink/shortlink（203/EXEC）、沒有 `User=` 所以會以 root 執行、沒有 `[Install]` 所以是 static，不能 enable。用 `echo -e … | sudo tee` 寫入正式的版本後，`sudo systemctl daemon-reload` 讓 systemd 讀入新內容，`start` 讓它現在執行，`enable` 依 `WantedBy=multi-user.target` 建立開機時啟動的連結；status 顯示 active (running)，主行程屬於 shortlink 帳號。',
      },
      {
        id: 'lnx10-diagnose', title: '從 status 找出服務失敗的原因', machine: 'media',
        statement: 'media-01 開機後，縮圖服務 `thumbnailer` 一直沒有運作。請用 `systemctl status` 找出它失敗的原因並修好，讓服務執行起來。套件在 `/usr/share/doc/thumbnailer/` 附了一份範例設定，內容正是這台機器要用的設定，可以直接使用。不要修改 unit 檔。',
        checks: [
          { kind: 'service', unit: 'thumbnailer', active: 'active', enabled: true },
          { kind: 'content', path: '/etc/thumbnailer/config.ini', content: THUMB_EXAMPLE },
          { kind: 'unchanged', path: '/etc/systemd/system/thumbnailer.service' },
        ],
        solution: ['systemctl status thumbnailer', 'ls /usr/share/doc/thumbnailer', 'sudo cp /usr/share/doc/thumbnailer/config.ini.example /etc/thumbnailer/config.ini', 'sudo systemctl restart thumbnailer', 'systemctl status thumbnailer'],
        mistakes: [
          { commands: ['sudo systemctl restart thumbnailer'], why: '原因沒有處理：設定檔仍然不存在，程式一啟動就結束，Restart=on-failure 連續重試到啟動上限後又是 failed。' },
          { commands: ['sudo cp /usr/share/doc/thumbnailer/config.ini.example /etc/thumbnailer/config.ini'], why: '設定檔放好了，但服務仍停在 failed：它早已撞到啟動上限，systemd 不會自己再試，要手動 restart。' },
          { commands: ['cp /usr/share/doc/thumbnailer/config.ini.example /etc/thumbnailer/config.ini', 'sudo systemctl restart thumbnailer'], why: '`/etc/thumbnailer` 屬於 root，沒有 sudo 的 cp 被拒絕（Permission denied），設定檔沒有建立，重新啟動一樣失敗。' },
          { commands: ['sudo touch /etc/thumbnailer/config.ini', 'sudo systemctl restart thumbnailer'], why: '空的設定檔讓錯誤訊息消失，服務看起來啟動了，但裡面沒有 input、output 與 size，程式不知道要處理哪個目錄；題目要使用範例的設定。' },
        ],
        hints: [
          '`systemctl status thumbnailer` 最下面的日誌裡，有一行不是 systemd[1] 印的，而是程式自己的錯誤訊息。',
          '`Start request repeated too quickly` 只是結果，真正的原因在它前面。',
          '`/etc/thumbnailer` 屬於 root，複製要 sudo；放好之後還要重新啟動服務。',
        ],
        explanation: 'status 的 Active 列是 `failed (Result: exit-code)`，日誌中 systemd 重試了五次後放棄（Start request repeated too quickly）；往前看，程式自己的訊息 `thumbnailer[905]: cannot read /etc/thumbnailer/config.ini: No such file or directory` 才是原因。`sudo cp` 把範例設定放到 `/etc/thumbnailer/config.ini`，再 `sudo systemctl restart thumbnailer`，服務就是 active (running)。只重新啟動不處理原因、只修原因不重新啟動，都不會讓服務恢復。',
      },
      {
        id: 'lnx10-main-pid', title: '找出服務的 Main PID', machine: 'pay',
        statement: 'pay-03 的 `ledger` 服務有一個主行程與兩個 worker，機器上還有一個不屬於服務的 ledger 匯出程式。值班紀錄要寫下服務的主行程：請印出 `systemctl status ledger` 輸出中以 `Main PID:` 開頭的那一行（整行原樣，包含前面的空白），只印這一行。',
        checks: [{ kind: 'output' }],
        solution: ['systemctl status ledger', 'systemctl status ledger | grep "Main PID"'],
        mistakes: [
          { commands: ['pgrep ledger'], why: 'pgrep 依名稱比對，列出四個 PID：主行程、兩個 worker，還有不屬於服務的匯出程式，看不出哪一個是 Main PID。' },
          { commands: ['pidof ledger'], why: 'pidof 一樣列出所有叫 ledger 的行程（由新到舊），包含 worker 與匯出程式。' },
          { commands: ['echo "   Main PID: 2210 (ledger)"'], why: '直接打出看到的答案：服務重新啟動過之後，Main PID 就不同了。' },
          { commands: ['systemctl status ledger'], why: '整份狀態裡雖然有答案，但題目只要 Main PID 那一行；用管線交給 grep 挑出來。' },
        ],
        variants: [{ label: '服務重新啟動過的另一天', files: [], processes: ledgerProcesses(3307, 3190), journal: ledgerJournal(3307) }],
        hints: [
          '`systemctl status ledger` 的 Main PID 列是 systemd 記錄的主行程，CGroup 列出的是服務所有的行程。',
          '把 status 的輸出用 `|` 交給 `grep "Main PID"`，只留下那一行；樣式裡有空白，要加引號。',
        ],
        explanation: '`systemctl status ledger | grep "Main PID"` 印出 `   Main PID: 2210 (ledger)`；服務重新啟動過的另一天，同一行指令印出的是新的 PID。依名稱找行程的 pgrep 與 pidof 會連 worker 與不屬於服務的同名程式一起列出，只有 systemd 知道哪一個是這個服務的主行程。真實系統還可以用 `systemctl show -p MainPID --value ledger` 只印出數字，模擬環境沒有 `show`。',
      },
    ],
  },
};
