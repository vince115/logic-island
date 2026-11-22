import type { TerminalFile, TerminalJournalEntry, TerminalMachine } from '@/lib/terminal/lesson';
import type { LessonContent } from '../schema';

/*
 * LNX11 Logs and journald (LNX-3). A terminal lesson on the services profile (engine stage E6): the journal and the text
 * files in /var/log (syslog, auth.log, kern.log on Ubuntu, nginx's and an application's own logs), who may read them
 * (root, adm, systemd-journal; a new group needs a new login or newgrp), journalctl -u, priorities 0–7 with -p err and
 * FROM..TO ranges, --since/--until with absolute times, today/yesterday and relative expressions, -n, -r, -k, -g and -o,
 * journalctl combined with grep, wc -l, cut and sort | uniq -c, reading common error lines (permission denied, address
 * already in use, no space left on device, out of memory, failed password) and log rotation (logrotate's directives and
 * file names, journald's size limits; the engine shows rotation only through file names). One shop server whose web
 * application starts failing after a configuration change, with a disk-full warning, an SSH brute-force burst and the
 * kernel's OOM killer; the clock is fixed at 2026-11-22 14:30 UTC. Host names, users, addresses (documentation ranges)
 * and files are made up. Every transcript output was produced by replaying it on the engine.
 */

const dir = (path: string, owner = 'root', mode = 0o755, group?: string): TerminalFile => ({ path, kind: 'dir', mode, owner, ...group ? { group } : {} });
const file = (path: string, content: string, owner = 'root', mode = 0o644, group?: string): TerminalFile => ({ path, kind: 'file', mode, owner, content, ...group ? { group } : {} });
const log = (path: string, content: string, owner = 'syslog') => file(path, content, owner, 0o640, 'adm');
const link = (path: string, target: string): TerminalFile => ({ path, kind: 'link', mode: 0o777, owner: 'root', target });
const exe = (path: string) => file(path, '', 'root', 0o755);
const lines = (...rows: string[]) => rows.map(r => `${r}\n`).join('');
const HOME = '/home/learner';
const HOST = 'shop-01';

/** A journal entry: time, program (id) and its PID, priority (0 emerg … 7 debug), message and the unit it belongs to. */
const j = (time: string, id: string, pid: number | undefined, priority: number, message: string, unit?: string): TerminalJournalEntry =>
  ({ time, id, ...pid !== undefined ? { pid } : {}, priority, message, ...unit ? { unit } : {} });
const systemd = (time: string, unit: string, priority: number, message: string) => j(time, 'systemd', 1, priority, message, unit);
const app = (time: string, pid: number, priority: number, message: string) => j(time, 'shopweb', pid, priority, message, 'shopweb');
const sshd = (time: string, pid: number, message: string) => j(time, 'sshd', pid, 6, message, 'ssh');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** The traditional syslog line rsyslog writes into /var/log: "Nov 22 14:02:13 shop-01 sshd[3502]: message". */
const syslogLine = (e: TerminalJournalEntry) => {
  const [date, clock] = e.time.split(' '), [, month, day] = date.split('-');
  return `${MONTHS[Number(month) - 1]} ${day.replace(/^0/, ' ')} ${clock} ${HOST} ${e.id}${e.pid !== undefined ? `[${e.pid}]` : ''}: ${e.message}`;
};

/** The shop server's journal: a boot two days ago, yesterday's short payment outage, today's failed restart and the afternoon. */
const JOURNAL: TerminalJournalEntry[] = [
  j('2026-11-20 06:00:00', 'kernel', undefined, 5, 'Linux version 6.8.0-45-generic (buildd@lcy02-amd64-075) #45-Ubuntu SMP PREEMPT_DYNAMIC'),
  systemd('2026-11-20 06:00:04', 'ssh', 6, 'Started ssh.service - OpenBSD Secure Shell server.'),
  systemd('2026-11-20 06:00:05', 'nginx', 6, 'Starting nginx.service - A high performance web server and a reverse proxy server...'),
  systemd('2026-11-20 06:00:05', 'nginx', 6, 'Started nginx.service - A high performance web server and a reverse proxy server.'),
  systemd('2026-11-20 06:00:06', 'shopweb', 6, 'Started shopweb.service - Shop web application.'),
  app('2026-11-20 06:00:07', 2210, 6, 'INFO listening on 127.0.0.1:8000'),
  app('2026-11-21 21:05:44', 2210, 3, 'ERROR payment gateway timeout after 30s (order 18842)'),
  app('2026-11-21 21:05:50', 2210, 6, 'INFO payment gateway reachable again'),
  sshd('2026-11-21 23:10:02', 2875, 'Accepted publickey for deploy from 203.0.113.15 port 50114 ssh2'),
  systemd('2026-11-22 00:00:01', 'logrotate', 6, 'Starting logrotate.service - Rotate log files...'),
  systemd('2026-11-22 00:00:02', 'logrotate', 6, 'logrotate.service: Deactivated successfully.'),
  systemd('2026-11-22 00:00:02', 'logrotate', 6, 'Finished logrotate.service - Rotate log files.'),
  sshd('2026-11-22 09:20:15', 3011, 'Invalid user test from 192.0.2.77 port 51102'),
  sshd('2026-11-22 09:20:17', 3011, 'Failed password for invalid user test from 192.0.2.77 port 51102 ssh2'),
  sshd('2026-11-22 09:20:21', 3011, 'Failed password for invalid user test from 192.0.2.77 port 51102 ssh2'),
  sshd('2026-11-22 09:41:30', 3020, 'Accepted publickey for deploy from 203.0.113.15 port 50122 ssh2'),
  j('2026-11-22 11:40:12', 'sudo', 3101, 5, 'deploy : TTY=pts/1 ; PWD=/home/deploy ; USER=root ; COMMAND=/usr/bin/vim /etc/shopweb/config.yaml'),
  j('2026-11-22 11:41:58', 'sudo', 3149, 5, 'deploy : TTY=pts/1 ; PWD=/home/deploy ; USER=root ; COMMAND=/usr/bin/systemctl restart shopweb'),
  systemd('2026-11-22 11:42:00', 'shopweb', 6, 'Stopping shopweb.service - Shop web application...'),
  app('2026-11-22 11:42:00', 2210, 6, 'INFO received SIGTERM, shutting down'),
  systemd('2026-11-22 11:42:01', 'shopweb', 6, 'shopweb.service: Deactivated successfully.'),
  systemd('2026-11-22 11:42:01', 'shopweb', 6, 'Stopped shopweb.service - Shop web application.'),
  systemd('2026-11-22 11:42:01', 'shopweb', 6, 'Started shopweb.service - Shop web application.'),
  app('2026-11-22 11:42:02', 3150, 3, 'ERROR listen tcp 127.0.0.1:8080: bind: address already in use'),
  systemd('2026-11-22 11:42:02', 'shopweb', 5, 'shopweb.service: Main process exited, code=exited, status=1/FAILURE'),
  systemd('2026-11-22 11:42:02', 'shopweb', 4, "shopweb.service: Failed with result 'exit-code'."),
  j('2026-11-22 12:18:40', 'sudo', 3240, 5, 'deploy : TTY=pts/1 ; PWD=/home/deploy ; USER=root ; COMMAND=/usr/bin/vim /etc/shopweb/config.yaml'),
  j('2026-11-22 12:19:05', 'sudo', 3262, 5, 'deploy : TTY=pts/1 ; PWD=/home/deploy ; USER=root ; COMMAND=/usr/bin/systemctl start shopweb'),
  systemd('2026-11-22 12:19:05', 'shopweb', 6, 'Started shopweb.service - Shop web application.'),
  app('2026-11-22 12:19:06', 3388, 6, 'INFO listening on 127.0.0.1:8000'),
  sshd('2026-11-22 13:12:40', 3401, 'Failed password for root from 203.0.113.99 port 40022 ssh2'),
  app('2026-11-22 13:15:40', 3388, 3, 'ERROR open /var/lib/shopweb/sessions/sess-7f3a: permission denied'),
  app('2026-11-22 13:31:07', 3388, 4, 'WARNING slow request: GET /checkout took 4.8s'),
  systemd('2026-11-22 13:48:00', 'diskwatch', 6, 'Starting diskwatch.service - Disk space check...'),
  j('2026-11-22 13:48:00', 'diskwatch', 3466, 4, 'WARNING / is 95% full (1.0G available)', 'diskwatch'),
  systemd('2026-11-22 13:48:00', 'diskwatch', 6, 'diskwatch.service: Deactivated successfully.'),
  systemd('2026-11-22 13:48:00', 'diskwatch', 6, 'Finished diskwatch.service - Disk space check.'),
  sshd('2026-11-22 14:02:11', 3502, 'Invalid user admin from 198.51.100.23 port 40122'),
  sshd('2026-11-22 14:02:13', 3502, 'Failed password for invalid user admin from 198.51.100.23 port 40122 ssh2'),
  sshd('2026-11-22 14:02:20', 3505, 'Failed password for root from 198.51.100.23 port 40188 ssh2'),
  sshd('2026-11-22 14:02:24', 3505, 'Failed password for root from 198.51.100.23 port 40188 ssh2'),
  sshd('2026-11-22 14:02:31', 3509, 'Invalid user oracle from 198.51.100.23 port 40230'),
  sshd('2026-11-22 14:02:33', 3509, 'Failed password for invalid user oracle from 198.51.100.23 port 40230 ssh2'),
  sshd('2026-11-22 14:02:40', 3512, 'Invalid user ubuntu from 198.51.100.23 port 40276'),
  sshd('2026-11-22 14:02:42', 3512, 'Failed password for invalid user ubuntu from 198.51.100.23 port 40276 ssh2'),
  sshd('2026-11-22 14:02:50', 3515, 'Failed password for root from 198.51.100.23 port 40301 ssh2'),
  sshd('2026-11-22 14:03:02', 3518, 'Invalid user admin from 192.0.2.201 port 52844'),
  sshd('2026-11-22 14:03:04', 3518, 'Failed password for invalid user admin from 192.0.2.201 port 52844 ssh2'),
  j('2026-11-22 14:05:12', 'kernel', undefined, 4, 'report-gen invoked oom-killer: gfp_mask=0x140cca(GFP_HIGHUSER_MOVABLE|__GFP_COMP), order=0, oom_score_adj=0'),
  j('2026-11-22 14:05:12', 'kernel', undefined, 3, 'Out of memory: Killed process 3530 (report-gen) total-vm:2621440kB, anon-rss:1843200kB, file-rss:1024kB, shmem-rss:0kB, UID:1001 pgtables:3720kB oom_score_adj:0'),
  j('2026-11-22 14:05:12', 'kernel', undefined, 6, 'oom_reaper: reaped process 3530 (report-gen), now anon-rss:0kB, file-rss:0kB, shmem-rss:0kB'),
  app('2026-11-22 14:10:21', 3388, 3, 'ERROR write /var/log/shopweb/debug.log: no space left on device'),
  app('2026-11-22 14:21:09', 3388, 2, 'CRITICAL session store not writable, refusing new logins'),
];

/** Another day on the same server (the exercises' variant): other failures at other times, a shorter SSH burst. */
const OTHER_DAY: TerminalJournalEntry[] = [
  systemd('2026-11-20 06:00:06', 'shopweb', 6, 'Started shopweb.service - Shop web application.'),
  app('2026-11-21 18:30:00', 1980, 3, 'ERROR redis: connection reset by peer'),
  sshd('2026-11-22 08:12:09', 2950, 'Failed password for root from 192.0.2.50 port 33410 ssh2'),
  app('2026-11-22 10:05:31', 1980, 4, 'WARNING config reloaded with 2 deprecated keys'),
  app('2026-11-22 10:05:33', 1980, 3, 'ERROR open /etc/shopweb/tls/shop.key: permission denied'),
  systemd('2026-11-22 10:05:33', 'shopweb', 5, 'shopweb.service: Main process exited, code=exited, status=1/FAILURE'),
  systemd('2026-11-22 10:05:33', 'shopweb', 4, "shopweb.service: Failed with result 'exit-code'."),
  systemd('2026-11-22 10:20:00', 'shopweb', 6, 'Started shopweb.service - Shop web application.'),
  app('2026-11-22 10:20:01', 3002, 6, 'INFO listening on 127.0.0.1:8000'),
  app('2026-11-22 13:05:10', 3002, 3, 'ERROR dial tcp 10.0.0.12:5432: connect: connection refused'),
  app('2026-11-22 13:40:00', 3002, 6, 'INFO database connection restored'),
  sshd('2026-11-22 13:58:44', 3611, 'Failed password for root from 203.0.113.200 port 41800 ssh2'),
  sshd('2026-11-22 13:58:49', 3611, 'Failed password for root from 203.0.113.200 port 41800 ssh2'),
  sshd('2026-11-22 14:11:02', 3640, 'Invalid user git from 203.0.113.200 port 41870'),
  sshd('2026-11-22 14:11:04', 3640, 'Failed password for invalid user git from 203.0.113.200 port 41870 ssh2'),
  sshd('2026-11-22 14:20:30', 3655, 'Failed password for root from 192.0.2.50 port 33502 ssh2'),
  app('2026-11-22 14:15:02', 3002, 2, 'CRITICAL database unreachable for 60s, entering read-only mode'),
].sort((a, b) => a.time.localeCompare(b.time));

const today = (e: TerminalJournalEntry) => e.time.startsWith('2026-11-22');
const before = (e: TerminalJournalEntry) => !today(e);
const isAuth = (e: TerminalJournalEntry) => e.id === 'sshd' || e.id === 'sudo';
const text = (entries: TerminalJournalEntry[]) => lines(...entries.map(syslogLine));

const ROTATE_RSYSLOG = `/var/log/syslog
/var/log/kern.log
/var/log/auth.log
{
\trotate 4
\tweekly
\tmissingok
\tnotifempty
\tcompress
\tdelaycompress
\tsharedscripts
\tpostrotate
\t\t/usr/lib/rsyslog/rsyslog-rotate
\tendscript
}
`;
const JOURNALD_CONF = lines(
  '#  See journald.conf(5) for details.',
  '[Journal]',
  '#Storage=auto',
  '#Compress=yes',
  '#SystemMaxUse=',
  '#SystemKeepFree=',
  '#SystemMaxFileSize=',
);
const NGINX_ERRORS = lines(
  '2026/11/22 11:42:15 [error] 813#813: *50211 connect() failed (111: Connection refused) while connecting to upstream, client: 203.0.113.50, server: shop.example.com, request: "GET / HTTP/1.1", upstream: "http://127.0.0.1:8000/", host: "shop.example.com"',
  '2026/11/22 12:01:40 [error] 813#813: *50877 connect() failed (111: Connection refused) while connecting to upstream, client: 192.0.2.140, server: shop.example.com, request: "POST /cart HTTP/1.1", upstream: "http://127.0.0.1:8000/cart", host: "shop.example.com"',
);
const unit = (path: string, description: string, service: string, install = true) =>
  file(path, `[Unit]\nDescription=${description}\n\n[Service]\n${service}\n${install ? '\n[Install]\nWantedBy=multi-user.target\n' : ''}`);

/** The shop server: nginx in front of the shopweb application, SSH open to the internet, rsyslog's files next to the journal. */
const shopServer: TerminalMachine = {
  id: 'shop', title: '商店主機 shop-01', user: 'learner', host: HOST, cwd: HOME, profile: 'services',
  now: '2026-11-22 14:30:00', boot: '2026-11-20 06:00:00', cpus: 2, memory: { total: 4096 },
  accounts: {
    users: [
      { name: 'syslog', uid: 102, home: '/nonexistent', shell: '/usr/sbin/nologin' },
      { name: 'shopweb', uid: 997, home: '/var/lib/shopweb', shell: '/usr/sbin/nologin' },
      { name: 'deploy', uid: 1001, comment: 'Deploy Account' },
    ],
    groups: [
      { name: 'adm', members: ['syslog'] },
      { name: 'sudo', members: ['learner', 'deploy'] },
      { name: 'systemd-journal', gid: 999 },
    ],
  },
  mounts: [{ path: '/', device: '/dev/sda1', type: 'ext4', size: 20466256, used: 19417680 }],
  files: [
    dir('/etc'),
    dir('/etc/logrotate.d'),
    file('/etc/logrotate.d/rsyslog', ROTATE_RSYSLOG),
    dir('/etc/shopweb'),
    file('/etc/shopweb/config.yaml', lines('listen: 127.0.0.1:8000', 'sessions: /var/lib/shopweb/sessions', 'log_file: /var/log/shopweb/debug.log', 'log_level: debug')),
    dir('/etc/systemd'),
    file('/etc/systemd/journald.conf', JOURNALD_CONF),
    dir('/etc/systemd/system'),
    unit('/etc/systemd/system/shopweb.service', 'Shop web application', 'ExecStart=/usr/local/bin/shopweb --config /etc/shopweb/config.yaml\nUser=shopweb'),
    unit('/etc/systemd/system/diskwatch.service', 'Disk space check', 'Type=oneshot\nExecStart=/usr/local/bin/diskwatch /', false),
    dir('/etc/systemd/system/multi-user.target.wants'),
    link('/etc/systemd/system/multi-user.target.wants/nginx.service', '/usr/lib/systemd/system/nginx.service'),
    link('/etc/systemd/system/multi-user.target.wants/shopweb.service', '/etc/systemd/system/shopweb.service'),
    link('/etc/systemd/system/multi-user.target.wants/ssh.service', '/usr/lib/systemd/system/ssh.service'),
    dir('/home'),
    dir(HOME, 'learner'),
    dir('/home/deploy', 'deploy', 0o750),
    dir('/usr'),
    dir('/usr/lib'),
    dir('/usr/lib/systemd'),
    dir('/usr/lib/systemd/system'),
    unit('/usr/lib/systemd/system/logrotate.service', 'Rotate log files', 'Type=oneshot\nExecStart=/usr/sbin/logrotate /etc/logrotate.conf', false),
    unit('/usr/lib/systemd/system/nginx.service', 'A high performance web server and a reverse proxy server', "Type=forking\nExecStart=/usr/sbin/nginx -g 'daemon on; master_process on;'\nExecReload=/usr/sbin/nginx -s reload"),
    unit('/usr/lib/systemd/system/ssh.service', 'OpenBSD Secure Shell server', 'ExecStart=/usr/sbin/sshd -D\nRestart=on-failure'),
    dir('/usr/local'),
    dir('/usr/local/bin'),
    exe('/usr/local/bin/diskwatch'),
    exe('/usr/local/bin/shopweb'),
    dir('/usr/sbin'),
    exe('/usr/sbin/logrotate'),
    exe('/usr/sbin/nginx'),
    exe('/usr/sbin/sshd'),
    dir('/var'),
    dir('/var/lib'),
    dir('/var/lib/shopweb', 'shopweb', 0o750),
    dir('/var/log', 'root', 0o775, 'syslog'),
    log('/var/log/auth.log', text(JOURNAL.filter(e => today(e) && isAuth(e)))),
    log('/var/log/auth.log.1', text(JOURNAL.filter(e => before(e) && isAuth(e)))),
    log('/var/log/auth.log.2.gz', ''),
    dir('/var/log/journal', 'root', 0o755, 'systemd-journal'),
    log('/var/log/kern.log', text(JOURNAL.filter(e => today(e) && e.id === 'kernel'))),
    log('/var/log/kern.log.1', text(JOURNAL.filter(e => before(e) && e.id === 'kernel'))),
    log('/var/log/kern.log.2.gz', ''),
    dir('/var/log/nginx', 'root', 0o755, 'adm'),
    log('/var/log/nginx/error.log', NGINX_ERRORS, 'www-data'),
    log('/var/log/nginx/error.log.1', '', 'www-data'),
    log('/var/log/nginx/error.log.2.gz', '', 'www-data'),
    dir('/var/log/shopweb', 'shopweb', 0o750, 'adm'),
    log('/var/log/shopweb/debug.log', lines(
      '2026-11-22 14:09:58 DEBUG GET /static/app.css 200 1.2ms',
      '2026-11-22 14:09:59 DEBUG cache miss product:8812',
      '2026-11-22 14:10:00 DEBUG GET /product/8812 200 31.0ms',
    ), 'shopweb'),
    log('/var/log/syslog', text(JOURNAL.filter(e => today(e) && !isAuth(e)))),
    log('/var/log/syslog.1', text(JOURNAL.filter(e => before(e) && !isAuth(e)))),
    log('/var/log/syslog.2.gz', ''),
    log('/var/log/syslog.3.gz', ''),
    log('/var/log/syslog.4.gz', ''),
  ],
  processes: [
    { pid: 1, ppid: 0, user: 'root', command: '/sbin/init', stat: 'Ss', rss: 13100, vsz: 168000 },
    { pid: 640, user: 'root', command: 'sshd: /usr/sbin/sshd -D [listener] 0 of 10-100 startups', stat: 'Ss', rss: 8200, vsz: 15400, start: '2026-11-20 06:00:04', unit: 'ssh' },
    { pid: 812, user: 'root', command: 'nginx: master process /usr/sbin/nginx -g daemon on; master_process on;', stat: 'Ss', rss: 2400, vsz: 55000, start: '2026-11-20 06:00:05', unit: 'nginx', hup: 'reload' },
    { pid: 813, ppid: 812, user: 'www-data', command: 'nginx: worker process', stat: 'S', rss: 5600, vsz: 55800, start: '2026-11-20 06:00:05', unit: 'nginx' },
    { pid: 3388, user: 'shopweb', command: '/usr/local/bin/shopweb --config /etc/shopweb/config.yaml', stat: 'Ssl', cpu: 3.1, rss: 184320, vsz: 1250000, start: '2026-11-22 12:19:05', unit: 'shopweb' },
    { pid: 4120, user: 'learner', command: '-bash', stat: 'Ss', tty: 'pts/0', rss: 5200, start: '2026-11-22 14:25:00' },
  ],
  services: [
    { unit: 'ssh', active: 'active', since: '2026-11-20 06:00:04' },
    { unit: 'nginx', active: 'active', since: '2026-11-20 06:00:05' },
    { unit: 'shopweb', active: 'active', since: '2026-11-22 12:19:05' },
  ],
  journal: JOURNAL,
};

const VARIANT = { label: '另一天的日誌', files: [], journal: OTHER_DAY };

export const LNX11: LessonContent = {
  lessonId: 'LNX11',
  motivation: '下午兩點半，客服說商店網站上午有一段時間打不開，現在結帳也偶爾失敗。伺服器不會主動告訴你發生了什麼，但每個服務、核心與登入程式都把經過寫進了日誌：誰改了設定、服務什麼時候第一次失敗、失敗的原因是哪一行、磁碟是不是快滿了、有沒有人在暴力嘗試 SSH 密碼。本課學會在 journald 的 journal 與 `/var/log` 的文字檔裡找到這些線索：用 `journalctl` 依服務、日誌等級與時間範圍過濾，用管線計數與排行，讀懂常見的錯誤訊息，最後弄清楚日誌為什麼要輪替，避免日誌自己把磁碟寫滿。',
  sections: [
    {
      id: 'lnx11-s-where', title: '日誌在哪裡：journal 與 /var/log',
      blocks: [
        { type: 'p', text: '在使用 systemd 的發行版上，收集日誌的是 `systemd-journald`。它接收核心的訊息、每個服務寫到標準輸出與標準錯誤的內容、程式透過 syslog 介面送出的訊息，替每一筆加上時間、主機、程式名稱、PID、所屬的 unit 與等級，存成有索引的二進位檔：持久保存時在 `/var/log/journal/`，只放在記憶體時在 `/run/log/journal/`（重新開機就消失）。二進位檔不能用 `cat` 或 `grep` 直接讀，要用 `journalctl` 查詢；好處是可以依欄位快速過濾，不必在文字裡猜哪一段是服務名稱。' },
        { type: 'p', text: 'Ubuntu 另外安裝了 rsyslog：它從 journald 收到同樣的訊息，依類別寫成傳統的文字檔放在 `/var/log`。所以同一筆 SSH 登入失敗，既在 journal 裡，也在 `/var/log/auth.log` 裡。RHEL 系的對應檔案是 `/var/log/messages` 與 `/var/log/secure`；Debian 12 起預設不再安裝 rsyslog，只有 journal。還有一些程式完全不經過 journald，自己開檔案寫，例如 nginx 的 `/var/log/nginx/access.log` 與 `error.log`，以及很多應用程式自己的除錯日誌，這些只能直接讀檔案。' },
        { type: 'table', head: ['位置', '內容', '怎麼讀'], rows: [
          ['journal（`/var/log/journal/`）', '幾乎所有訊息：核心、systemd 與每個服務、sudo、sshd', '`journalctl`（可依 unit、等級、時間過濾）'],
          ['`/var/log/syslog`', 'rsyslog 寫的一般訊息（Ubuntu／Debian），不含登入與認證', '`sudo tail`、`sudo grep`、`less`'],
          ['`/var/log/auth.log`', '登入與權限：sshd、sudo、PAM（RHEL 是 `/var/log/secure`）', '同上'],
          ['`/var/log/kern.log`', '核心訊息（等於 `journalctl -k` 的文字版）', '同上'],
          ['`/var/log/nginx/`、`/var/log/<程式>/`', '程式自己寫的檔案，不會出現在 journal', '只能讀檔案'],
        ] },
        { type: 'p', text: '這些檔案的權限通常是 `-rw-r----- syslog adm`：擁有者是寫入它的 syslog 帳號，`adm` 群組可以讀，其他人什麼都看不到。旁邊的 `syslog.1`、`syslog.2.gz` 是輪替留下的舊檔，最後一節會說明。下面的紀錄先看看模擬主機的 `/var/log`，也用 `df -h` 看到根目錄已經用了 95%，這是今天故事的伏筆。' },
        { type: 'example', id: 'lnx11-files' },
      ],
    },
    {
      id: 'lnx11-s-access', title: '誰能讀日誌：root、adm 與 systemd-journal',
      blocks: [
        { type: 'p', text: '系統日誌裡有登入來源、指令與錯誤細節，所以不是每個人都能讀。journal 的規則是：root、`adm` 群組與 `systemd-journal` 群組的成員看得到全部；其他使用者只看得到自己的使用者日誌。一般使用者執行 `journalctl` 時，標準錯誤會先出現三行 `Hint:`，說明自己看不到其他使用者與系統的訊息；模擬環境沒有使用者日誌，所以接著印出 `-- No entries --`。' },
        { type: 'list', items: [
          '臨時查一次：`sudo journalctl …`（需要在 sudo 群組，LNX06）。',
          '常常要查：把帳號加進 `adm` 或 `systemd-journal`：`sudo usermod -aG adm learner`。Ubuntu 安裝時建立的第一個帳號通常已經在 adm 裡。',
          '加入群組只改了帳號資料，目前的登入工作階段仍是舊的群組清單：要重新登入，或用 `newgrp adm` 開一個帶新群組的 Shell，`journalctl` 才看得到。',
          '`sudo journalctl … > 報告.txt` 的重新導向由你自己的 Shell 處理，所以報告檔屬於你，寫進家目錄不需要 root。',
        ] },
        { type: 'callout', tone: 'warning', title: '「-- No entries --」不代表沒有問題', text: '最危險的誤會是：用一般帳號執行 `journalctl -u shopweb -p err`，看到 `-- No entries --` 就回報「沒有錯誤」。那一行只表示「在你看得到的範圍裡沒有符合的紀錄」，你其實什麼都看不到。接上管線時更隱密：`Hint` 走標準錯誤，捲過去就忘了，而 `journalctl … | wc -l` 會把 `-- No entries --` 這一行算成 1，`| grep -c` 則印出 0，數字看起來都很正常。看到「沒有紀錄」時，先確認自己是 root 或在 adm／systemd-journal 群組，再相信結果。' },
        { type: 'example', id: 'lnx11-access' },
      ],
    },
    {
      id: 'lnx11-s-filter', title: '依服務與日誌等級過濾：-u、-p、-n、-r',
      blocks: [
        { type: 'p', text: '`journalctl` 不加條件時，從最舊的紀錄一路印到最新，在終端機上會交給 `less` 分頁。實際查問題時一定會加條件，最常用的是 `-u 服務`：只看某個 systemd unit 的紀錄，包括程式自己寫的訊息，以及 systemd 關於它的訊息（Started、Main process exited、Failed with result）。`systemctl status` 底下附的只是最後 10 行，要看完整的經過就用 `journalctl -u`。選錯 unit 是常見的錯：網站打不開時，前面的 nginx 只是反向代理，它的 journal 裡只有啟動訊息，自己的錯誤寫在 `/var/log/nginx/error.log`；真正失敗的是後面的 shopweb。' },
        { type: 'p', text: '每一筆紀錄都有日誌等級（priority），沿用 syslog 的 0 到 7，數字越小越嚴重。`-p err` 的意思是「err 以及更嚴重的」，也就是 0 到 3；只想看某一段時寫成範圍 `-p warning..notice`（4 到 5）。等級可以寫名稱或數字，`-p 3` 與 `-p err` 相同。程式寫到標準輸出的每一行預設是 info，程式要透過 syslog 或 journald 的介面送出（或在每一行前面加上 `<3>` 這類等級前綴），才會帶有自己的等級。' },
        { type: 'table', head: ['數字', '名稱', '意思與例子'], rows: [
          ['0', 'emerg', '系統無法使用'],
          ['1', 'alert', '必須立刻處理'],
          ['2', 'crit', '嚴重狀況：本課的 `CRITICAL session store not writable`'],
          ['3', 'err', '錯誤：程式的 ERROR、核心的 `Out of memory: Killed process`'],
          ['4', 'warning', '警告：磁碟 95%、systemd 的 `Failed with result`'],
          ['5', 'notice', '正常但值得注意：sudo 執行的指令、`Main process exited`'],
          ['6', 'info', '一般訊息：Started、SSH 的登入成功與失敗'],
          ['7', 'debug', '除錯細節，平常不會記錄'],
        ] },
        { type: 'table', head: ['選項', '作用', '例子'], rows: [
          ['`-u 服務`', '只看這個 unit（可重複寫多個）', '`journalctl -u shopweb`'],
          ['`-p 等級`、`-p 起..迄`', '這個等級以上，或一個範圍', '`-p err`、`-p warning..notice`'],
          ['`-n N`', '只看最後 N 筆（不寫 N 是 10）', '`-n 20`'],
          ['`-r`', '新的在前（先取最後 N 筆，再反過來）', '`-r -n 3`'],
          ['`-k`', '只看核心訊息（真實系統另外限定這次開機）', '`journalctl -k`'],
          ['`-g 樣式`', '訊息符合正規表示式的紀錄', '`-g "Failed password"`'],
          ['`-o cat`、`-o short-iso`', '只印訊息；或用 ISO 8601 的時間', '`-o cat` 適合接 `cut`'],
          ['`-b`、`-x`、`-e`、`-f`', '這次開機以來；加上說明文字；跳到結尾；持續追蹤新紀錄', '`journalctl -xe`、`journalctl -fu shopweb`'],
        ] },
        { type: 'p', text: '模擬環境的日誌不會再增加，所以 `-f` 印出說明而不是持續等待；真實系統上 `journalctl -fu shopweb` 很適合一邊重新啟動服務、一邊看它印出什麼。下面的紀錄依序示範 `-u`、`-p`、範圍、`-k`、`-r -n` 與選錯服務的結果。' },
        { type: 'example', id: 'lnx11-filter' },
      ],
    },
    {
      id: 'lnx11-s-time', title: '時間範圍過濾：--since 與 --until',
      blocks: [
        { type: 'p', text: '`--since`（`-S`）與 `--until`（`-U`）把查詢限制在一段時間裡，是找「什麼時候開始壞掉」最重要的工具。時間有三種寫法：絕對時間 `"2026-11-22 11:40:00"`（秒可以省略，只寫 `2026-11-22` 是當天 0 點，只寫 `11:40` 是今天的 11:40）；關鍵字 `today`、`yesterday`、`now`（today 與 yesterday 都是當天的 0 點）；相對時間 `-1h`、`-30min`、`"1 hour ago"`。含有空白的時間要加引號，否則 Shell 會把它拆成兩個參數。' },
        { type: 'table', head: ['寫法', '現在是 14:30 時代表', '用途'], rows: [
          ['`--since today`', '今天 00:00 起', '今天第一次出錯是什麼時候'],
          ['`--since yesterday --until today`', '昨天一整天', '和昨天比較'],
          ['`--since "1 hour ago"`、`--since -1h`', '13:30 起', '最近一小時有多少次'],
          ['`--since 11:40 --until 11:43`', '今天 11:40 到 11:43', '放大事件前後幾分鐘'],
          ['`--since 15:00`', '還沒到的時間', '印出 `-- No entries --`'],
        ] },
        { type: 'p', text: '`journalctl` 用主機的時區顯示時間，這台主機是 UTC；比對使用者回報的時間（例如「台灣時間晚上十點」）時要先換算。模擬環境的時鐘固定在 2026-11-22 14:30:00，所以相對時間每次算出來都一樣。錯誤的寫法會直接被拒絕：看不懂的時間是 `Failed to parse timestamp`，開始比結束晚是 `--since= must be before --until=.`。' },
        { type: 'callout', tone: 'warning', title: '時間範圍太窄，會把起點藏起來', text: '查「網站什麼時候開始失敗」時，如果順手寫了 `--since "1 hour ago"`，看到的第一筆錯誤是 14:10 的 no space left on device，很容易就下結論「兩點多開始壞的，是磁碟滿了」。其實 11:42 的設定變更才是第一次失敗，原因是連接埠被占用，和磁碟無關。找起點時先用寬的範圍（`--since today`，甚至 `yesterday`）配合 `-p err` 看全貌，確認第一次出錯的時刻後，再用 `--since`／`--until` 放大那幾分鐘的前後經過。' },
        { type: 'example', id: 'lnx11-time' },
      ],
    },
    {
      id: 'lnx11-s-read', title: '讀懂常見的錯誤，並用管線計數',
      blocks: [
        { type: 'p', text: '找到錯誤行之後，要讀懂它在說什麼。systemd 的 `Main process exited, code=exited, status=1/FAILURE` 與 `Failed with result \'exit-code\'` 只是結果，原因通常在它前面一兩行、程式自己寫的那一行。下表是伺服器上最常見的幾種錯誤：' },
        { type: 'table', head: ['訊息裡的關鍵字', '意思', '接下來查什麼'], rows: [
          ['`permission denied`', '執行程式的帳號（例如 unit 的 `User=shopweb`）對路徑上的某個檔案或目錄沒有權限', '`ls -l` 看路徑上每一層的擁有者與模式（LNX07）'],
          ['`bind: address already in use`', '另一個程式已經在聽同一個連接埠，這個程式無法再開', '`sudo ss -ltnp` 看是誰占用，再改設定或停掉舊的行程'],
          ['`no space left on device`', '檔案系統滿了（也可能是 inode 用完）', '`df -h`、`df -i`，用 `du -sh` 找出大目錄'],
          ['`Out of memory: Killed process 3530 (report-gen)`', '記憶體不夠，核心的 OOM killer 挑了一個行程結束它', '那個行程為什麼用了這麼多記憶體；是不是要限制它或加記憶體'],
          ['`Failed password for …`、`Invalid user …`', '有人用錯的密碼或不存在的帳號嘗試 SSH 登入；短時間內大量出現就是暴力破解', '數來源 IP；改用金鑰並關閉密碼登入（LNX12）、用 fail2ban 封鎖'],
          ['`connect() failed (111: Connection refused) while connecting to upstream`', 'nginx 連不上後端（後端沒有在聽）', '去看後端服務（這裡是 shopweb）的 journal'],
        ] },
        { type: 'p', text: '`journalctl` 的輸出就是文字，可以接上 LNX05 的工具：`| grep -c` 或 `-g` 加 `| wc -l` 計數，`-o cat` 去掉時間與主機後用 `cut` 取出欄位，再以 `sort | uniq -c | sort -rn` 排行。例如 `Invalid user admin from 198.51.100.23 port 40122` 以空白分隔，第 5 欄就是來源位址，數一數哪個位址最常嘗試。`-g` 是在 journalctl 裡過濾，`| grep` 是在之後過濾，結果相同；把條件留在 journalctl 裡（`-u`、`-p`、`--since`）讓要處理的行少很多。' },
        { type: 'callout', tone: 'tip', title: 'wc -l 會把「-- No entries --」算成一行', text: '`journalctl -g "Failed password" | wc -l` 在沒有任何符合時印出 1，因為 `-- No entries --` 也是一行文字；沒有權限時同樣是 1。要計數時，寧可用 `journalctl … | grep -c "Failed password"`：沒有符合時是 0，不會多算。' },
        { type: 'example', id: 'lnx11-pipes' },
      ],
    },
    {
      id: 'lnx11-s-rotate', title: '日誌輪替：為什麼磁碟不會被日誌寫滿',
      blocks: [
        { type: 'p', text: '日誌只會越寫越多。一個忙碌的網站一天可能寫出幾 GB，沒有人整理的話，總有一天會把磁碟寫滿，到時候不只日誌，連資料庫與上傳都會失敗，本課的 `no space left on device` 就是這樣來的：shopweb 的設定是 `log_level: debug`，又沒有替 `/var/log/shopweb/debug.log` 設定輪替。日誌輪替（log rotation）的做法是定期把目前的檔案改名封存、開一個新的空檔案，舊的壓縮起來，超過保留數量的刪掉，讓日誌占用的空間有上限。' },
        { type: 'p', text: '文字檔由 `logrotate` 輪替：設定在 `/etc/logrotate.conf` 與 `/etc/logrotate.d/` 下每個套件自己的檔案，Ubuntu 由 `logrotate.timer` 每天執行一次（沒有 systemd 的系統用 cron.daily）。以本機 `/etc/logrotate.d/rsyslog` 的 `weekly`、`rotate 4`、`compress`、`delaycompress` 為例，每次輪替時：' },
        { type: 'list', ordered: true, items: [
          '最舊的 `syslog.4.gz` 被刪除，`syslog.3.gz` 改名為 `syslog.4.gz`，`syslog.2.gz` 改名為 `syslog.3.gz`。',
          '`syslog.1` 壓縮成 `syslog.2.gz`（`delaycompress` 讓最近一份舊檔晚一輪才壓縮，方便直接用 grep 讀，也避免程式還在寫它時就被壓縮）。',
          '目前的 `syslog` 改名為 `syslog.1`，再建立新的空 `syslog`。',
          '`postrotate` 的指令通知 rsyslog 重新開檔，之後的訊息才會寫進新的檔案。',
        ] },
        { type: 'table', head: ['指令', '意思'], rows: [
          ['`daily`、`weekly`、`monthly`', '多久輪替一次'],
          ['`rotate 4`', '保留 4 份舊檔，更舊的刪除'],
          ['`compress`、`delaycompress`', '用 gzip 壓縮舊檔；最近一份晚一輪再壓縮'],
          ['`size 100M`', '只看大小：超過 100M 才輪替，不管經過多久'],
          ['`maxsize 100M`', '時間到了會輪替，還沒到但超過 100M 也輪替（大小在 logrotate 執行時才檢查，一天一次）'],
          ['`missingok`、`notifempty`', '檔案不存在不算錯誤；空檔案不輪替'],
          ['`create 0640 syslog adm`', '輪替後以這個模式與擁有者建立新檔案'],
          ['`copytruncate`', '複製一份後把原檔清空，給無法重新開檔的程式用（複製與清空之間寫入的幾行可能遺失）'],
          ['`dateext`', '舊檔以日期命名（例如 `syslog-20261122`），RHEL 預設使用'],
        ] },
        { type: 'p', text: 'journal 不用 logrotate，由 journald 自己管理：寫滿一個檔案就封存成 `system@….journal`，總用量超過上限時刪掉最舊的封存檔。上限在 `/etc/systemd/journald.conf`：`SystemMaxUse=` 預設是檔案系統大小的 10%、最多 4G，`SystemKeepFree=` 預設保留 15% 的空間、最多 4G。真實系統可以用 `journalctl --disk-usage` 查看占用，用 `sudo journalctl --vacuum-size=500M` 或 `--vacuum-time=2weeks` 立刻清理；模擬環境不支援這些選項，也不會真的執行輪替，只能從檔名看出輪替的結果。' },
        { type: 'callout', tone: 'warning', title: '刪掉正在寫的日誌，空間不會回來', text: '磁碟滿了，直接 `rm /var/log/shopweb/debug.log` 看起來最快，但 shopweb 仍然開著那個檔案：名稱不見了，資料區塊要等程式關閉檔案（例如重新啟動）才釋放，`df` 的數字一點都不會變，程式還繼續寫進那個看不見的檔案。緊急時應該清空而不是刪除（`sudo truncate -s 0 檔案`），再補上輪替設定、把 `log_level` 調回 info，才是根本的處理。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'lnx11-q1', prompt: '`journalctl -p err` 會顯示哪些等級的紀錄？',
      options: ['只有等級剛好是 err（3）的紀錄', '所有等級，只是把 err 標上顏色', 'err 以及更嚴重的，也就是 0 到 3', 'err 以及比較不嚴重的，也就是 3 到 7'],
      answer: 2,
      explanation: '`-p` 只給一個等級時表示「這個等級以及更嚴重的」，數字越小越嚴重，所以是 emerg、alert、crit、err（0–3）。只要剛好 err 要寫成範圍 `-p err..err`；`-p` 是過濾條件，不是上色；3 到 7 方向相反，會把 info、debug 這些大量的一般訊息都放進來。',
    },
    {
      id: 'lnx11-q2', prompt: 'learner 不在 adm、systemd-journal 群組，也沒有用 sudo。執行 `journalctl -u shopweb -p err` 印出 `-- No entries --`，可以得到什麼結論？',
      options: ['不能下結論：一般使用者看不到系統日誌，要用 sudo 或加入群組再查', 'shopweb 從來沒有發生錯誤', 'shopweb 這個 unit 不存在', 'journal 被 logrotate 清掉了'],
      answer: 0,
      explanation: '一般使用者只看得到自己的使用者日誌，標準錯誤上的 Hint 也說明了這一點，所以「沒有紀錄」只是「你看不到」。不能據此說沒有錯誤；unit 不存在時 journalctl 也只會印同樣的一行，無法分辨；journal 由 journald 自己管理大小，不是 logrotate 處理的對象。',
    },
    {
      id: 'lnx11-q3', prompt: '執行 `sudo usermod -aG adm learner` 之後，在同一個終端機直接執行 `journalctl`，仍然看到 Hint 與 `-- No entries --`。原因是什麼？',
      options: ['adm 群組沒有讀 journal 的權限，要改用 systemd-journal', '少了 `-a`，learner 被移出了其他群組', 'journal 只能由 root 讀取，群組沒有用', '目前的登入工作階段還是舊的群組清單，要重新登入或執行 `newgrp adm`'],
      answer: 3,
      explanation: '`usermod` 只修改帳號資料，已經登入的 Shell 在登入時就決定了群組，所以要重新登入或用 `newgrp adm` 才會帶著 adm。adm 與 systemd-journal 的成員都能讀完整的 journal，不必換群組；指令有 `-a`，是附加不是取代；群組成員可以讀，不一定要 root。',
    },
    {
      id: 'lnx11-q4', prompt: '現在是 14:30。shopweb 從 11:42 開始出錯，14:10 又出現另一種錯誤。執行 `sudo journalctl -u shopweb -p err --since "1 hour ago"` 會看到什麼？',
      options: ['從 11:42 開始的所有錯誤', '只有 13:30 之後的錯誤，看不到 11:42 那一筆', '只有最近一筆錯誤', '錯誤：`--since` 不能寫相對時間'],
      answer: 1,
      explanation: '`"1 hour ago"` 從 14:30 往回算一小時，也就是 13:30，所以只會看到 13:30 以後的錯誤，11:42 的第一次失敗被時間範圍擋在外面。它不會從更早開始；`--since` 不限制筆數，最近一小時的錯誤全部都會列出；相對時間 `-1h`、`"1 hour ago"` 都是合法的寫法。',
    },
    {
      id: 'lnx11-q5', prompt: '`/var/log` 裡有 `syslog`、`syslog.1`、`syslog.2.gz`、`syslog.3.gz`，logrotate 的設定有 `compress` 與 `delaycompress`。下面哪一個說法正確？',
      options: ['`syslog.3.gz` 是最新的一份舊檔', '`syslog.1` 沒有壓縮代表那次輪替失敗了', '`syslog.1` 是最近一份舊檔，`delaycompress` 讓它晚一輪才壓縮', '`.gz` 的檔案可以直接用 `cat` 讀出文字'],
      answer: 2,
      explanation: '輪替時目前的檔案改名為 `.1`，舊的編號依序加一，所以數字越大越舊，`.1` 最新；`delaycompress` 讓 `.1` 保持純文字，下一輪才壓縮成 `.2.gz`，這是正常的設計，不是失敗。`.gz` 是 gzip 壓縮的二進位資料，要用 `zcat`、`zgrep` 或 `zless` 讀，`cat` 只會印出亂碼。',
    },
    {
      id: 'lnx11-q6', prompt: 'shopweb 改了設定後重新啟動，journal 出現 `ERROR listen tcp 127.0.0.1:8080: bind: address already in use`。最可能的原因是什麼？',
      options: ['shopweb 帳號沒有讀取設定檔的權限', '磁碟已經滿了，無法建立連線', '記憶體不足，核心結束了 shopweb', '另一個程式已經在聽 8080 埠，shopweb 無法再開同一個埠'],
      answer: 3,
      explanation: '`address already in use` 是 EADDRINUSE：同一個位址與連接埠已經有程式在聽，新的程式無法 bind，可以用 `sudo ss -ltnp` 找出是誰。權限問題會是 `permission denied`；磁碟滿是 `no space left on device`；記憶體不足時核心記錄的是 `Out of memory: Killed process`，而且不是程式自己的 bind 錯誤。',
    },
    {
      id: 'lnx11-q7', prompt: '要數出最近一小時 SSH 密碼錯誤的次數，下面哪一個指令最可靠？',
      options: ['`sudo journalctl -u ssh --since -1h | grep -c "Failed password"`', '`journalctl -u ssh --since -1h | grep -c "Failed password"`', '`sudo journalctl -u ssh --since today | grep -c "Failed password"`', '`sudo journalctl -u ssh --since -1h -n 10 | grep -c "Failed password"`'],
      answer: 0,
      explanation: '有 sudo 才讀得到系統日誌，`-u ssh` 與 `--since -1h` 限定服務與時間，`grep -c` 計算符合的行數，沒有符合時是 0。少了 sudo 一定得到 0；`--since today` 把今天稍早的失敗也算進去；`-n 10` 只留最後 10 筆紀錄，其他的失敗就被截掉了。',
    },
    {
      id: 'lnx11-q8', prompt: '磁碟滿了，管理員刪掉了 shopweb 正在寫入的 9 GB `debug.log`，但 `df -h` 的使用量完全沒有下降。為什麼？',
      options: ['刪除的檔案會先移到垃圾桶，要清空垃圾桶', 'shopweb 仍開著那個檔案，資料要等它關閉檔案才釋放', 'df 每天只更新一次', 'journald 立刻把同樣的內容寫回了 journal'],
      answer: 1,
      explanation: '`rm` 只刪除名稱，行程還開著檔案時，資料區塊要等最後一個開啟者關閉才釋放，所以要重新啟動服務，或一開始就用 `truncate -s 0` 清空而不是刪除。命令列的 `rm` 沒有垃圾桶；`df` 讀的是檔案系統即時的數字；journald 不會把程式自己寫的檔案複製進 journal。',
    },
  ],
  terminal: {
    machines: [shopServer],
    examples: [
      {
        id: 'lnx11-files', title: '/var/log 裡的文字檔與輪替的檔名', machine: 'shop',
        description: '`/var/log` 的檔案屬於 syslog:adm、一般使用者讀不到；`.1` 是上一輪、`.gz` 是更舊的壓縮檔；`sudo` 之後可以用 `tail` 與 `grep` 讀；logrotate 的設定說明了這些檔名；`df -h` 顯示根目錄快滿了。',
        steps: [
          { command: 'ls /var/log', output: 'auth.log  auth.log.1  auth.log.2.gz  journal/  kern.log  kern.log.1  kern.log.2.gz  nginx/  shopweb/  syslog  syslog.1  syslog.2.gz  syslog.3.gz  syslog.4.gz' },
          { command: 'ls -l /var/log', output: '-rw-r----- syslog  adm      2084 auth.log\n-rw-r----- syslog  adm       100 auth.log.1\n-rw-r----- syslog  adm         0 auth.log.2.gz\ndrwxr-xr-x root    systemd-journal  4096 journal/\n-rw-r----- syslog  adm       457 kern.log\n-rw-r----- syslog  adm       119 kern.log.1\n-rw-r----- syslog  adm         0 kern.log.2.gz\ndrwxr-xr-x root    adm      4096 nginx/\ndrwxr-x--- shopweb adm      4096 shopweb/\n-rw-r----- syslog  adm      2280 syslog\n-rw-r----- syslog  adm       770 syslog.1\n-rw-r----- syslog  adm         0 syslog.2.gz\n-rw-r----- syslog  adm         0 syslog.3.gz\n-rw-r----- syslog  adm         0 syslog.4.gz' },
          { command: 'tail -n 2 /var/log/auth.log', output: 'tail: cannot open \'/var/log/auth.log\' for reading: Permission denied' },
          { command: 'sudo tail -n 2 /var/log/auth.log', output: 'Nov 22 14:03:02 shop-01 sshd[3518]: Invalid user admin from 192.0.2.201 port 52844\nNov 22 14:03:04 shop-01 sshd[3518]: Failed password for invalid user admin from 192.0.2.201 port 52844 ssh2' },
          { command: 'sudo grep -c "Failed password" /var/log/auth.log', output: '10' },
          { command: 'sudo tail -n 1 /var/log/kern.log', output: 'Nov 22 14:05:12 shop-01 kernel: oom_reaper: reaped process 3530 (report-gen), now anon-rss:0kB, file-rss:0kB, shmem-rss:0kB' },
          { command: 'cat /etc/logrotate.d/rsyslog', output: '/var/log/syslog\n/var/log/kern.log\n/var/log/auth.log\n{\n\trotate 4\n\tweekly\n\tmissingok\n\tnotifempty\n\tcompress\n\tdelaycompress\n\tsharedscripts\n\tpostrotate\n\t\t/usr/lib/rsyslog/rsyslog-rotate\n\tendscript\n}' },
          { command: 'df -h /', output: 'Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda1        20G   19G  1.0G  95% /' },
        ],
      },
      {
        id: 'lnx11-access', title: '沒有權限時看到什麼', machine: 'shop',
        description: '一般使用者只看到 Hint 與 `-- No entries --`；`sudo` 看得到；加入 adm 後，目前的工作階段仍是舊的群組，`newgrp adm` 之後才不用 sudo。',
        steps: [
          { command: 'journalctl -n 2', output: 'Hint: You are currently not seeing messages from other users and the system.\n      Users in groups \'adm\', \'systemd-journal\' can see all messages.\n      Pass -q to turn off this notice.\n-- No entries --' },
          { command: 'id', output: 'uid=1000(learner) gid=1000(learner) groups=1000(learner),27(sudo)' },
          { command: 'sudo journalctl -n 2', output: 'Nov 22 14:10:21 shop-01 shopweb[3388]: ERROR write /var/log/shopweb/debug.log: no space left on device\nNov 22 14:21:09 shop-01 shopweb[3388]: CRITICAL session store not writable, refusing new logins' },
          { command: 'sudo usermod -aG adm learner', output: '' },
          { command: 'journalctl -n 2', output: 'Hint: You are currently not seeing messages from other users and the system.\n      Users in groups \'adm\', \'systemd-journal\' can see all messages.\n      Pass -q to turn off this notice.\n-- No entries --' },
          { command: 'id learner', output: 'uid=1000(learner) gid=1000(learner) groups=1000(learner),4(adm),27(sudo)' },
          { command: 'newgrp adm', output: '' },
          { command: 'journalctl -n 2', output: 'Nov 22 14:10:21 shop-01 shopweb[3388]: ERROR write /var/log/shopweb/debug.log: no space left on device\nNov 22 14:21:09 shop-01 shopweb[3388]: CRITICAL session store not writable, refusing new logins' },
        ],
      },
      {
        id: 'lnx11-filter', title: '依服務、等級與筆數過濾', machine: 'shop',
        description: '`-u` 只看一個服務（含 systemd 關於它的訊息），`-n` 取最後幾筆，`-p err` 是 err 以上，`-p warning..notice` 是一個範圍，`-k` 只看核心，`-r -n 3` 是最新的三筆、新的在前；nginx 的錯誤不在 journal 裡；模擬環境不支援 `-f`。',
        steps: [
          { command: 'sudo journalctl -u shopweb -n 4', output: 'Nov 22 13:15:40 shop-01 shopweb[3388]: ERROR open /var/lib/shopweb/sessions/sess-7f3a: permission denied\nNov 22 13:31:07 shop-01 shopweb[3388]: WARNING slow request: GET /checkout took 4.8s\nNov 22 14:10:21 shop-01 shopweb[3388]: ERROR write /var/log/shopweb/debug.log: no space left on device\nNov 22 14:21:09 shop-01 shopweb[3388]: CRITICAL session store not writable, refusing new logins' },
          { command: 'sudo journalctl -u shopweb -p err', output: 'Nov 21 21:05:44 shop-01 shopweb[2210]: ERROR payment gateway timeout after 30s (order 18842)\nNov 22 11:42:02 shop-01 shopweb[3150]: ERROR listen tcp 127.0.0.1:8080: bind: address already in use\nNov 22 13:15:40 shop-01 shopweb[3388]: ERROR open /var/lib/shopweb/sessions/sess-7f3a: permission denied\nNov 22 14:10:21 shop-01 shopweb[3388]: ERROR write /var/log/shopweb/debug.log: no space left on device\nNov 22 14:21:09 shop-01 shopweb[3388]: CRITICAL session store not writable, refusing new logins' },
          { command: 'sudo journalctl -u shopweb -p warning..notice', output: 'Nov 22 11:42:02 shop-01 systemd[1]: shopweb.service: Main process exited, code=exited, status=1/FAILURE\nNov 22 11:42:02 shop-01 systemd[1]: shopweb.service: Failed with result \'exit-code\'.\nNov 22 13:31:07 shop-01 shopweb[3388]: WARNING slow request: GET /checkout took 4.8s' },
          { command: 'sudo journalctl -k --since today', output: 'Nov 22 14:05:12 shop-01 kernel: report-gen invoked oom-killer: gfp_mask=0x140cca(GFP_HIGHUSER_MOVABLE|__GFP_COMP), order=0, oom_score_adj=0\nNov 22 14:05:12 shop-01 kernel: Out of memory: Killed process 3530 (report-gen) total-vm:2621440kB, anon-rss:1843200kB, file-rss:1024kB, shmem-rss:0kB, UID:1001 pgtables:3720kB oom_score_adj:0\nNov 22 14:05:12 shop-01 kernel: oom_reaper: reaped process 3530 (report-gen), now anon-rss:0kB, file-rss:0kB, shmem-rss:0kB' },
          { command: 'sudo journalctl -p err -r -n 3', output: 'Nov 22 14:21:09 shop-01 shopweb[3388]: CRITICAL session store not writable, refusing new logins\nNov 22 14:10:21 shop-01 shopweb[3388]: ERROR write /var/log/shopweb/debug.log: no space left on device\nNov 22 14:05:12 shop-01 kernel: Out of memory: Killed process 3530 (report-gen) total-vm:2621440kB, anon-rss:1843200kB, file-rss:1024kB, shmem-rss:0kB, UID:1001 pgtables:3720kB oom_score_adj:0' },
          { command: 'sudo journalctl -u nginx -p err', output: '-- No entries --' },
          { command: 'sudo journalctl -u shopweb -f', output: 'journalctl: 模擬環境的日誌不會再增加，不支援 -f（持續追蹤）；請用 -n 或 --since 查詢' },
        ],
      },
      {
        id: 'lnx11-time', title: '用時間範圍找出事件的起點', machine: 'shop',
        description: '`--since`／`--until` 可以寫絕對時間、`today`／`yesterday` 與相對時間；放大 11:40 到 11:43 看到設定變更後的重新啟動與第一次失敗；未來的時間沒有紀錄，看不懂的時間與顛倒的範圍會被拒絕。',
        steps: [
          { command: 'sudo journalctl -u shopweb -p err --since today', output: 'Nov 22 11:42:02 shop-01 shopweb[3150]: ERROR listen tcp 127.0.0.1:8080: bind: address already in use\nNov 22 13:15:40 shop-01 shopweb[3388]: ERROR open /var/lib/shopweb/sessions/sess-7f3a: permission denied\nNov 22 14:10:21 shop-01 shopweb[3388]: ERROR write /var/log/shopweb/debug.log: no space left on device\nNov 22 14:21:09 shop-01 shopweb[3388]: CRITICAL session store not writable, refusing new logins' },
          { command: 'sudo journalctl --since "2026-11-22 11:40" --until "2026-11-22 11:43"', output: 'Nov 22 11:40:12 shop-01 sudo[3101]: deploy : TTY=pts/1 ; PWD=/home/deploy ; USER=root ; COMMAND=/usr/bin/vim /etc/shopweb/config.yaml\nNov 22 11:41:58 shop-01 sudo[3149]: deploy : TTY=pts/1 ; PWD=/home/deploy ; USER=root ; COMMAND=/usr/bin/systemctl restart shopweb\nNov 22 11:42:00 shop-01 systemd[1]: Stopping shopweb.service - Shop web application...\nNov 22 11:42:00 shop-01 shopweb[2210]: INFO received SIGTERM, shutting down\nNov 22 11:42:01 shop-01 systemd[1]: shopweb.service: Deactivated successfully.\nNov 22 11:42:01 shop-01 systemd[1]: Stopped shopweb.service - Shop web application.\nNov 22 11:42:01 shop-01 systemd[1]: Started shopweb.service - Shop web application.\nNov 22 11:42:02 shop-01 shopweb[3150]: ERROR listen tcp 127.0.0.1:8080: bind: address already in use\nNov 22 11:42:02 shop-01 systemd[1]: shopweb.service: Main process exited, code=exited, status=1/FAILURE\nNov 22 11:42:02 shop-01 systemd[1]: shopweb.service: Failed with result \'exit-code\'.' },
          { command: 'sudo journalctl -u shopweb -p err --since yesterday --until today', output: 'Nov 21 21:05:44 shop-01 shopweb[2210]: ERROR payment gateway timeout after 30s (order 18842)' },
          { command: 'sudo journalctl -u shopweb -p err --since "1 hour ago"', output: 'Nov 22 14:10:21 shop-01 shopweb[3388]: ERROR write /var/log/shopweb/debug.log: no space left on device\nNov 22 14:21:09 shop-01 shopweb[3388]: CRITICAL session store not writable, refusing new logins' },
          { command: 'sudo journalctl -u shopweb --since -15min', output: 'Nov 22 14:21:09 shop-01 shopweb[3388]: CRITICAL session store not writable, refusing new logins' },
          { command: 'sudo journalctl --since 15:00', output: '-- No entries --' },
          { command: 'sudo journalctl --since 2pm', output: 'Failed to parse timestamp: 2pm' },
          { command: 'sudo journalctl --since 14:00 --until 13:00', output: '--since= must be before --until=.' },
        ],
      },
      {
        id: 'lnx11-pipes', title: '把 journalctl 接上管線', machine: 'shop',
        description: '`grep -c` 與 `-g` 加 `wc -l` 計數，`-o cat` 加 `cut`、`sort | uniq -c | sort -rn` 排行來源位址；沒有 sudo 時 `wc -l` 仍印出 1；最後讀今天所有的錯誤與 nginx 的錯誤檔。',
        steps: [
          { command: 'sudo journalctl -u ssh --since today | grep -c "Failed password"', output: '10' },
          { command: 'sudo journalctl -u ssh --since "1 hour ago" -g "Failed password" | wc -l', output: '7' },
          { command: 'journalctl -u ssh --since "1 hour ago" -g "Failed password" | wc -l', output: 'Hint: You are currently not seeing messages from other users and the system.\n      Users in groups \'adm\', \'systemd-journal\' can see all messages.\n      Pass -q to turn off this notice.\n1' },
          { command: 'sudo journalctl -u ssh -o cat -g "^Invalid user" | cut -d " " -f 5 | sort | uniq -c | sort -rn', output: '      3 198.51.100.23\n      1 192.0.2.77\n      1 192.0.2.201' },
          { command: 'sudo journalctl -p err --since today -o cat', output: 'ERROR listen tcp 127.0.0.1:8080: bind: address already in use\nERROR open /var/lib/shopweb/sessions/sess-7f3a: permission denied\nOut of memory: Killed process 3530 (report-gen) total-vm:2621440kB, anon-rss:1843200kB, file-rss:1024kB, shmem-rss:0kB, UID:1001 pgtables:3720kB oom_score_adj:0\nERROR write /var/log/shopweb/debug.log: no space left on device\nCRITICAL session store not writable, refusing new logins' },
          { command: 'sudo grep -c "connect() failed" /var/log/nginx/error.log', output: '2' },
        ],
      },
    ],
    exercises: [
      {
        id: 'lnx11-first-failure', title: '今天第一次失敗是什麼時候', machine: 'shop',
        statement: '客服說網站今天某個時候開始出問題。請用一行指令，只印出 `shopweb` 服務今天（從今天 0 點起）第一筆等級 err 以上的日誌，保留 journalctl 預設的格式（時間、主機、程式與訊息），只要那一行。檢查時，你的指令也會在另一天的日誌上重新執行一次。',
        checks: [{ kind: 'output' }],
        solution: ['sudo journalctl -u shopweb -p err --since today | head -n 1'],
        variants: [VARIANT],
        mistakes: [
          { commands: ['journalctl -u shopweb -p err --since today | head -n 1'], why: '沒有 sudo：learner 不在 adm 或 systemd-journal 群組，只看得到 `-- No entries --`。' },
          { commands: ['sudo journalctl -u shopweb -p err | head -n 1'], why: '少了 `--since today`：第一行是昨天晚上的付款閘道逾時，不是今天的失敗。' },
          { commands: ['sudo journalctl -u shopweb -p err --since today -r | head -n 1'], why: '`-r` 讓新的在前，拿到的是最近一筆錯誤，不是第一筆。' },
          { commands: ['sudo journalctl -u nginx -p err --since today | head -n 1'], why: '選錯服務：nginx 只是前面的反向代理，它的 journal 沒有錯誤（它的錯誤寫在 /var/log/nginx/error.log），失敗的是 shopweb。' },
          { commands: ['sudo journalctl -u shopweb -p err --since "1 hour ago" | head -n 1'], why: '時間範圍太窄：一小時前之後的第一筆錯誤是 14:10 的磁碟已滿，真正的起點 11:42 被排除了。' },
        ],
        hints: [
          '`-u shopweb` 只看這個服務，`-p err` 是 err 以上。',
          '`--since today` 從今天 0 點開始；journal 預設由舊到新排列。',
          '最舊的一筆就是第一行，用 `| head -n 1` 留下它；別忘了 sudo。',
        ],
        explanation: '`sudo journalctl -u shopweb -p err --since today` 由舊到新列出今天 shopweb 的錯誤，`head -n 1` 留下最早的一筆：11:42:02 的 `bind: address already in use`，正好在 deploy 用 sudo 編輯 config.yaml 並重新啟動之後。另一天的日誌第一筆是 10:05:33 的 permission denied，所以直接打出答案無法通過。找到時刻後，可以再用 `--since 11:40 --until 11:43` 看前後經過。',
      },
      {
        id: 'lnx11-ssh-count', title: '最近一小時的 SSH 密碼錯誤', machine: 'shop',
        statement: 'SSH 似乎正被暴力破解。請用一行指令，印出 `ssh` 服務最近一小時（從現在往回一小時）裡含有 `Failed password` 的紀錄筆數，只要一個數字。檢查時，你的指令也會在另一天的日誌上重新執行一次。',
        checks: [{ kind: 'output' }],
        solution: ['sudo journalctl -u ssh --since "1 hour ago" | grep -c "Failed password"'],
        variants: [VARIANT],
        mistakes: [
          { commands: ['journalctl -u ssh --since "1 hour ago" | grep -c "Failed password"'], why: '沒有 sudo：看不到系統日誌，grep 數到 0。' },
          { commands: ['sudo usermod -aG adm learner', 'journalctl -u ssh --since "1 hour ago" | grep -c "Failed password"'], why: '加入了 adm，但目前的工作階段還沒有這個群組（要重新登入或 `newgrp adm`），所以仍然看不到，數到 0。' },
          { commands: ['sudo journalctl -u ssh --since today | grep -c "Failed password"'], why: '時間範圍錯了：`today` 從 0 點開始，把早上與 13:12 的失敗也算了進去。' },
          { commands: ['sudo journalctl -u ssh --since "1 hour ago" | grep -c "Invalid user"'], why: '`Invalid user` 只出現在不存在的帳號，嘗試 root 的密碼錯誤沒有被算到；要數的是 `Failed password`。' },
        ],
        hints: [
          '`--since "1 hour ago"`（或 `-1h`）從現在往回一小時；有空白的時間要加引號。',
          '`grep -c` 只印出符合的行數。',
          '沒有 sudo 時，數字會是 0，看起來卻很正常。',
        ],
        explanation: '`sudo journalctl -u ssh --since "1 hour ago"` 列出 13:30 以後 ssh 服務的紀錄，`grep -c "Failed password"` 數出 7 筆，大部分來自 198.51.100.23；另一天的日誌是 4 筆。`-g "Failed password"` 接 `| wc -l` 也能得到同樣的數字，但沒有符合時會把 `-- No entries --` 算成 1，所以計數時 `grep -c` 比較可靠。',
      },
      {
        id: 'lnx11-errors-since', title: '下午一點以來的錯誤', machine: 'shop',
        statement: '請印出 `shopweb` 服務從今天 13:00 起、等級 err 以上的所有日誌，使用 journalctl 預設的格式。檢查時，你的指令也會在另一天的日誌上重新執行一次。',
        checks: [{ kind: 'output' }],
        solution: ['sudo journalctl -u shopweb -p err --since 13:00'],
        variants: [VARIANT],
        mistakes: [
          { commands: ['sudo journalctl -u shopweb --since 13:00'], why: '少了 `-p err`：INFO 與 WARNING 的行也印了出來。' },
          { commands: ['sudo journalctl -u shopweb -p warning --since 13:00'], why: '`-p warning` 包含 warning（4），13:31 的慢請求警告也混了進來；err 以上是 `-p err`。' },
          { commands: ['sudo journalctl -u shopweb -p err --until 13:00'], why: '方向相反：`--until` 是「到 13:00 為止」，印出的是 13:00 以前的錯誤。' },
          { commands: ['sudo journalctl -p err --since 13:00'], why: '少了 `-u shopweb`：核心的 Out of memory 也被列了出來。' },
        ],
        hints: [
          '只寫時間 `13:00` 表示今天的 13:00。',
          '`-p err` 會包含 crit、alert、emerg。',
          '服務用 `-u`，起點用 `--since`。',
        ],
        explanation: '`sudo journalctl -u shopweb -p err --since 13:00` 印出 13:15 的 permission denied、14:10 的 no space left on device 與 14:21 的 CRITICAL（crit 比 err 更嚴重，所以也在範圍內）。三種不同的錯誤在一個多小時內接連出現，下一步就是依序讀懂它們：工作目錄的權限、磁碟空間，以及因此無法寫入的工作階段。',
      },
      {
        id: 'lnx11-incident-report', title: '把事件的經過存成報告', machine: 'shop',
        statement: '請把今天 13:45 到 14:15 之間、整台主機所有等級 warning 以上的日誌（不限服務，保留預設格式的時間與來源），存進家目錄的 `incident-1345.txt`，交給同事當事件報告。',
        checks: [{ kind: 'content', path: `${HOME}/incident-1345.txt`, content: lines(
          'Nov 22 13:48:00 shop-01 diskwatch[3466]: WARNING / is 95% full (1.0G available)',
          'Nov 22 14:05:12 shop-01 kernel: report-gen invoked oom-killer: gfp_mask=0x140cca(GFP_HIGHUSER_MOVABLE|__GFP_COMP), order=0, oom_score_adj=0',
          'Nov 22 14:05:12 shop-01 kernel: Out of memory: Killed process 3530 (report-gen) total-vm:2621440kB, anon-rss:1843200kB, file-rss:1024kB, shmem-rss:0kB, UID:1001 pgtables:3720kB oom_score_adj:0',
          'Nov 22 14:10:21 shop-01 shopweb[3388]: ERROR write /var/log/shopweb/debug.log: no space left on device',
        ) }],
        solution: ['sudo journalctl -p warning --since 13:45 --until 14:15 > incident-1345.txt', 'cat incident-1345.txt'],
        mistakes: [
          { commands: ['journalctl -p warning --since 13:45 --until 14:15 > incident-1345.txt'], why: '沒有 sudo：Hint 印在螢幕上，檔案裡只有一行 `-- No entries --`。' },
          { commands: ['sudo journalctl -p err --since 13:45 --until 14:15 > incident-1345.txt'], why: '`-p err` 漏掉了 warning：磁碟 95% 的警告與 oom-killer 的那一行都不見了。' },
          { commands: ['sudo journalctl -p warning --since 13:45 > incident-1345.txt'], why: '少了 `--until 14:15`：14:21 的 CRITICAL 也被寫進報告，超出了題目的範圍。' },
          { commands: ['sudo journalctl -p warning --since 13:45 --until 14:15 -o cat > incident-1345.txt'], why: '`-o cat` 去掉了時間與來源，報告看不出每件事發生在什麼時候、由誰記錄。' },
          { commands: ['sudo journalctl -p warning --since 13:45 --until 14:15'], why: '只印在螢幕上，沒有用 `>` 存進檔案。' },
        ],
        hints: [
          '不限服務就不要加 `-u`；warning 以上是 `-p warning`。',
          '同時用 `--since 13:45` 與 `--until 14:15` 圍出時間範圍。',
          '`sudo journalctl … > 檔案` 的重新導向由你的 Shell 處理，檔案寫在你的家目錄裡。',
        ],
        explanation: '`sudo journalctl -p warning --since 13:45 --until 14:15 > incident-1345.txt` 把這半小時的四筆紀錄存成報告：13:48 磁碟 95% 的警告、14:05 核心的 oom-killer 與 Out of memory、14:10 shopweb 寫不進 debug.log。把時間、來源與訊息放在一起，同事一眼就看得出順序：磁碟先快滿、接著記憶體不足、最後應用程式寫入失敗。',
      },
    ],
  },
};
