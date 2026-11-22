/*
 * SRV13 Server troubleshooting (SRV-4, terminal-sim; the blueprint's case-study-board activity). A terminal lesson on the
 * diagnostics profile (engine stage E19) that teaches one incident method: describe the symptom (what fails, for whom,
 * since when), form hypotheses and test the cheapest and most likely first, change one thing at a time, verify from the
 * user's side (the public name, https, through nginx), and write a short timeline. 502 against 504 behind nginx: refused
 * (a stopped or crash-looping backend, systemd's start limit), prematurely closed, no live upstreams; read timeouts (a
 * database lock, an exhausted pool, CPU) and connect timeouts (no machine or a firewall drop). Resources: a full /srv
 * (df -h, du, ENOSPC, debug logging left on; a deleted file a process still holds open is text only, since lsof here
 * lists sockets only and df's numbers are declared), memory and the OOM killer (journalctl -k), CPU (top -b -n 1, ps).
 * Log correlation by timestamp across nginx's access.log and error.log, the shop's journal, the whole system journal,
 * PostgreSQL's log and a deploy log (grep, sed -n, journalctl --since/--until). Five starting states of web-01 (nginx in
 * front of a node shop on 127.0.0.1:3000 and an inventory API on inv-01): a VACUUM FULL locking the orders table (504),
 * a full /srv, the shop killed by the OOM killer while a yearly export holds 1.5 GB, a deploy whose release lacks the
 * shared config (a crash loop, 502), and inv-01's new ufw dropping 8080 (504 while connecting). The OOM-killed unit's
 * status says `Result: oom-kill` and the journal carries systemd's and the kernel's lines. The shop, host names (.example, RFC 2606), users and addresses (RFC 5737, RFC 1918)
 * are made up. Every transcript output was produced by replaying it on the engine.
 */

import type { TerminalFile, TerminalJournalEntry, TerminalMachine, TerminalProcess, TerminalRemote, TerminalVariant } from '@/lib/terminal/lesson';
import type { TerminalCertificate } from '@/lib/terminal/web-lesson';
import { hostKey, keyPair } from '@/lib/terminal/ssh';
import type { LessonContent } from '../schema';

const dir = (path: string, owner = 'root', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'root', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const link = (path: string, target: string, owner = 'root'): TerminalFile => ({ path, kind: 'link', mode: 0o777, owner, target });
const logFile = (path: string, content: string, owner = 'www-data'): TerminalFile => ({ path, kind: 'file', mode: 0o640, owner, group: 'adm', content });
const HOME = '/home/learner';
const NOLOGIN = '/usr/sbin/nologin';
const CLOCK = { now: '2026-11-22 10:00:00', boot: '2026-11-20 06:12:00' };
const WANTS = '/etc/systemd/system/multi-user.target.wants';

const SITE = 'mistytea.example';
const WWW = `www.${SITE}`;
const WEB_IP = '203.0.113.30';
const LAN_IP = '10.0.0.10';
const INV_IP = '10.0.0.31';
const SHOP = '/srv/tea-shop';
const SITE_PATH = '/etc/nginx/sites-available/mistytea';

const systemd = (time: string, unit: string, priority: number, message: string): TerminalJournalEntry => ({ time, unit, id: 'systemd', pid: 1, priority, message });
const kernel = (time: string, message: string, priority = 6): TerminalJournalEntry => ({ time, id: 'kernel', priority, message });

// ---- ssh: learner on web-01 logs in to inv-01 with a key; inv-01's host key is already known ---------------------------
const WEB_KEY = keyPair(`srv13-web:learner:${HOME}/.ssh/id_ed25519`, 'learner@web-01');
const INV_SEED = 'srv13-inv-01';
const KNOWN = `inv-01 ${hostKey(INV_SEED, 'inv-01').publicLine.split(' ').slice(0, 2).join(' ')}\n`;

// ---- web-01: nginx ends TLS for www.mistytea.example, / goes to the shop (node on 127.0.0.1:3000), /api/stock/ to inv-01 ---
const SITE_CONF = `server {
    listen 80;
    server_name ${SITE} ${WWW};
    return 301 https://${WWW}$request_uri;
}

server {
    listen 443 ssl;
    server_name ${WWW};
    ssl_certificate /etc/ssl/mistytea/fullchain.pem;
    ssl_certificate_key /etc/ssl/mistytea/privkey.pem;

    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    location / {
        proxy_pass http://127.0.0.1:3000;
    }
    location /api/stock/ {
        proxy_pass http://inv-01:8080/stock/;
    }
}
`;
const HOSTS = `127.0.0.1 localhost\n127.0.1.1 web-01\n${WEB_IP} ${WWW} ${SITE}\n${INV_IP} inv-01\n\n::1 localhost ip6-localhost ip6-loopback\nff02::1 ip6-allnodes\nff02::2 ip6-allrouters\n`;
/** The shop's unit: Restart=on-failure with a start limit of 3, except on the web-01 of the OOM story (no Restart= there). */
const shopUnit = (restart: boolean) => `[Unit]
Description=Misty Peak tea shop
After=network.target postgresql.service
${restart ? 'StartLimitBurst=3\n' : ''}
[Service]
ExecStart=/usr/bin/node ${SHOP}/current/server.js
User=teashop
${restart ? 'Restart=on-failure\n' : ''}
[Install]
WantedBy=multi-user.target
`;
const certificate = (id: string): TerminalCertificate => ({
  id, cn: WWW, sans: [WWW, SITE], issuer: 'lets-encrypt-r11', notBefore: '2026-11-01 08:00:00',
  path: '/etc/ssl/mistytea/fullchain.pem', chain: ['lets-encrypt-r11'], key: '/etc/ssl/mistytea/privkey.pem',
});
const SHOP_CMD = `/usr/bin/node ${SHOP}/current/server.js`;
const shopProcess = (pid: number, start: string, rss = 182000, cpu = 3): TerminalProcess => ({
  pid, user: 'teashop', command: SHOP_CMD, stat: 'Ssl', unit: 'tea-shop', start, cpu, rss, vsz: 1104000,
  listen: [{ address: '127.0.0.1', port: 3000, fd: 21, http: 'shop' }],
});
const shopRoutes = (orders: { delay?: number } = {}) => [
  { path: '/', body: '<h1>山嵐茶行</h1>\n' },
  { path: '/products/*', body: '<h1>山嵐茶行｜商品</h1>\n' },
  { path: '/account/orders', body: '{"orders":[{"id":5102,"item":"凍頂烏龍 150g","status":"shipped"}]}\n', type: 'application/json', ...orders },
  { path: '/*', status: 404, body: 'Not Found\n', type: 'text/plain' },
];

/** Every web-01: learner (sudo) with a key for inv-01, the site, the shop's unit and releases. */
const webFiles = (releases: TerminalFile[], extra: TerminalFile[] = [], restart = true): TerminalFile[] => [
  dir('/etc'), file('/etc/hosts', HOSTS),
  dir('/etc/nginx'), dir('/etc/nginx/sites-available'), file(SITE_PATH, SITE_CONF), dir('/etc/nginx/sites-enabled'), link('/etc/nginx/sites-enabled/mistytea', SITE_PATH),
  dir('/etc/systemd'), dir('/etc/systemd/system'), file('/etc/systemd/system/tea-shop.service', shopUnit(restart)), dir(WANTS), link(`${WANTS}/tea-shop.service`, '/etc/systemd/system/tea-shop.service'),
  dir('/home'), dir(HOME, 'learner', 0o750), dir(`${HOME}/.ssh`, 'learner', 0o700),
  file(`${HOME}/.ssh/id_ed25519`, WEB_KEY.privateText, 'learner', 0o600), file(`${HOME}/.ssh/id_ed25519.pub`, `${WEB_KEY.publicLine}\n`, 'learner'),
  file(`${HOME}/.ssh/known_hosts`, KNOWN, 'learner'),
  dir('/srv'), dir(SHOP, 'teashop'), dir(`${SHOP}/releases`, 'teashop'), dir(`${SHOP}/shared`, 'teashop'), dir(`${SHOP}/shared/config`, 'teashop'),
  file(`${SHOP}/shared/config/production.json`, '{\n  "port": 3000,\n  "database": "postgres://teashop@127.0.0.1/teashop",\n  "pool": 10\n}\n', 'teashop', 0o640),
  ...releases,
  dir('/usr'), dir('/usr/bin'), file('/usr/bin/node', '', 'root', 0o755),
  ...extra,
];
/** A release folder with its server.js and (when linked) the shared config. */
const release = (name: string, linked: boolean): TerminalFile[] => [
  dir(`${SHOP}/releases/${name}`, 'teashop'), file(`${SHOP}/releases/${name}/server.js`, `// tea-shop ${name}\n`, 'teashop'), dir(`${SHOP}/releases/${name}/config`, 'teashop'),
  ...linked ? [link(`${SHOP}/releases/${name}/config/production.json`, `${SHOP}/shared/config/production.json`, 'teashop')] : [],
];
const OLD = '20261118-1520', NEW = '20261122-0940';

/** inv-01: the inventory API on 8080 (its own ufw); learner logs in with web-01's key. */
const INV_UNIT = '[Unit]\nDescription=Misty Peak inventory API\nAfter=network.target\n\n[Service]\nExecStart=/opt/inventory/bin/inventory --listen 0.0.0.0:8080\nUser=stock\nRestart=on-failure\n\n[Install]\nWantedBy=multi-user.target\n';
const inventory = (rules: string[], journal: TerminalJournalEntry[] = []): TerminalRemote => ({
  host: 'inv-01', title: '庫存服務 inv-01', address: INV_IP, hostKey: INV_SEED,
  interfaces: [{ name: 'eth0', address: `${INV_IP}/24` }],
  accounts: { users: [{ name: 'learner', uid: 1000 }, { name: 'stock', uid: 997, home: '/opt/inventory', shell: NOLOGIN }], groups: [{ name: 'sudo', members: ['learner'] }] },
  files: [dir('/home'), dir(HOME, 'learner', 0o750), dir(`${HOME}/.ssh`, 'learner', 0o700), file(`${HOME}/.ssh/authorized_keys`, `${WEB_KEY.publicLine}\n`, 'learner', 0o600),
    dir('/etc'), dir('/etc/systemd'), dir('/etc/systemd/system'), file('/etc/systemd/system/inventory.service', INV_UNIT), dir(WANTS), link(`${WANTS}/inventory.service`, '/etc/systemd/system/inventory.service'),
    dir('/opt'), dir('/opt/inventory'), dir('/opt/inventory/bin'), file('/opt/inventory/bin/inventory', '', 'root', 0o755)],
  processes: [{ pid: 880, user: 'stock', command: '/opt/inventory/bin/inventory --listen 0.0.0.0:8080', stat: 'Ssl', unit: 'inventory', start: CLOCK.boot, listen: [{ port: 8080, fd: 7, http: 'stock' }] }],
  programs: [{ path: '/opt/inventory/bin/inventory', listen: [{ port: 8080, fd: 7, http: 'stock' }] }],
  responders: [{ id: 'stock', server: 'inventory/1.6', routes: [{ path: '/stock/*', body: '{"sku":"oolong-150","on_hand":42}\n', type: 'application/json' }] }],
  firewall: { enabled: true, rules },
  journal,
});
const INV_OPEN = ['allow OpenSSH', `allow from ${LAN_IP} to any port 8080 proto tcp`];

type WebParts = Pick<TerminalMachine, 'accounts' | 'processes' | 'services' | 'programs' | 'journal' | 'responders' | 'load' | 'cpus' | 'memory' | 'mounts' | 'remotes'>;
const web = (id: string, title: string, releases: TerminalFile[], extra: TerminalFile[], parts: WebParts, restart = true): TerminalMachine => ({
  id, title, user: 'learner', cwd: HOME, host: 'web-01', profile: 'diagnostics', ...CLOCK, nginx: true, address: WEB_IP, keySeed: 'srv13-web', cpus: 2,
  interfaces: [{ name: 'eth0', address: `${WEB_IP}/24` }, { name: 'eth1', address: `${LAN_IP}/24` }],
  accounts: { users: [{ name: 'teashop', uid: 998, home: SHOP, shell: NOLOGIN }], groups: [{ name: 'sudo', members: ['learner'] }] },
  certificates: [certificate(`${id}-www`)],
  files: webFiles(releases, extra, restart),
  remotes: [inventory(INV_OPEN)],
  ...parts,
});

// ---- the logs every web-01 starts with --------------------------------------------------------------------------------
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const PROBE = 'Uptime-Probe/2.4 (+https://status.mistytea.example)';
/** One combined-format line of nginx's access.log (time HH:MM:SS on 22 Nov). */
const hit = (time: string, ip: string, path: string, status: number, bytes: number, ua: string, method = 'GET') =>
  `${ip} - - [22/Nov/2026:${time} +0000] "${method} ${path} HTTP/1.1" ${status} ${bytes} "-" "${ua}"\n`;
/** One line of nginx's error.log for a request to the site. */
const failed = (time: string, n: number, message: string, ip: string, path: string, upstream: string) =>
  `2026/11/22 ${time} [error] 813#813: *${n} ${message}, client: ${ip}, server: ${WWW}, request: "GET ${path} HTTP/1.1", upstream: "${upstream}${path}", host: "${WWW}"\n`;
const REFUSED = 'connect() failed (111: Connection refused) while connecting to upstream';
const READ_TIMEOUT = 'upstream timed out (110: Connection timed out) while reading response header from upstream';
const CONNECT_TIMEOUT = 'upstream timed out (110: Connection timed out) while connecting to upstream';
const APP = 'http://127.0.0.1:3000', STOCK = `http://${INV_IP}:8080`;
const nginxLogs = (access: string, error: string): TerminalFile[] => [
  dir('/var'), dir('/var/log'), { ...dir('/var/log/nginx'), group: 'adm' }, logFile('/var/log/nginx/access.log', access), logFile('/var/log/nginx/error.log', error),
];
/** The bytes nginx logs for its own 502 and 504 pages, and for the shop's answers. */
const B502 = 159, B504 = 169, HOMEPAGE = 22, PRODUCT = 31, ORDERS = 74, STOCKJSON = 34;

// ---- 1. web-01 slows down: a VACUUM FULL in office hours locks the orders table (examples 1–3) -------------------------
const PG_MAIN: TerminalProcess = { pid: 960, user: 'postgres', command: '/usr/lib/postgresql/16/bin/postgres -D /var/lib/postgresql/16/main -c config_file=/etc/postgresql/16/main/postgresql.conf', stat: 'Ss', rss: 31000, vsz: 222000, start: '2026-11-20 06:12:31' };
const pgBackend = (pid: number, command: string, start: string, extra: Partial<TerminalProcess> = {}): TerminalProcess => ({ pid, ppid: 960, user: 'postgres', command, stat: 'Ss', rss: 16000, vsz: 224000, start, ...extra });
const SLOW_ACCESS = [
  hit('09:28:14', '198.51.100.23', '/', 200, HOMEPAGE, CHROME), hit('09:29:02', '198.51.100.23', '/account/orders', 200, ORDERS, CHROME),
  hit('09:30:00', '203.0.113.77', '/', 200, HOMEPAGE, PROBE), hit('09:30:41', '192.0.2.140', '/products/dongding-oolong', 200, PRODUCT, IPHONE),
  hit('09:32:43', '192.0.2.140', '/account/orders', 504, B504, IPHONE), hit('09:35:00', '203.0.113.77', '/', 200, HOMEPAGE, PROBE),
  hit('09:35:10', '198.51.100.61', '/account/orders', 504, B504, CHROME), hit('09:38:26', '198.51.100.61', '/api/stock/dongding-150', 200, STOCKJSON, CHROME),
  hit('09:40:00', '203.0.113.77', '/', 200, HOMEPAGE, PROBE), hit('09:41:57', '192.0.2.140', '/account/orders', 504, B504, IPHONE),
  hit('09:45:00', '203.0.113.77', '/', 200, HOMEPAGE, PROBE), hit('09:52:20', '198.51.100.23', '/account/orders', 504, B504, CHROME),
  hit('09:55:00', '203.0.113.77', '/', 200, HOMEPAGE, PROBE),
].join('');
const SLOW_ERROR = [
  failed('09:32:43', 2311, READ_TIMEOUT, '192.0.2.140', '/account/orders', APP), failed('09:35:10', 2342, READ_TIMEOUT, '198.51.100.61', '/account/orders', APP),
  failed('09:41:57', 2398, READ_TIMEOUT, '192.0.2.140', '/account/orders', APP), failed('09:52:20', 2467, READ_TIMEOUT, '198.51.100.23', '/account/orders', APP),
].join('');
const PG_LOG = `2026-11-20 06:12:31.006 UTC [960] LOG:  database system is ready to accept connections
2026-11-22 09:31:43.552 UTC [3188] teashop@teashop LOG:  process 3188 still waiting for AccessShareLock on relation 16412 of database 16384 after 1000.081 ms
2026-11-22 09:31:43.552 UTC [3188] teashop@teashop DETAIL:  Process holding the lock: 3104. Wait queue: 3188.
2026-11-22 09:31:43.552 UTC [3188] teashop@teashop STATEMENT:  SELECT id, item, status FROM orders WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 20
2026-11-22 09:32:06.310 UTC [3190] teashop@teashop LOG:  process 3190 still waiting for AccessShareLock on relation 16412 of database 16384 after 1000.094 ms
2026-11-22 09:32:06.310 UTC [3190] teashop@teashop DETAIL:  Process holding the lock: 3104. Wait queue: 3188, 3190.
2026-11-22 09:32:06.310 UTC [3190] teashop@teashop STATEMENT:  SELECT id, item, status FROM orders WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 20
`;
const node = (time: string, pid: number, priority: number, message: string, unit = 'tea-shop'): TerminalJournalEntry => ({ time, unit, id: 'node', pid, priority, message });
const slow = web('srv13-slow', 'web-01（帳戶頁的訂單變慢）', [...release(OLD, true), link(`${SHOP}/current`, `${SHOP}/releases/${OLD}`, 'teashop')], [
  ...nginxLogs(SLOW_ACCESS, SLOW_ERROR),
  { ...dir('/var/log/postgresql', 'root', 0o775), group: 'postgres' }, { ...logFile('/var/log/postgresql/postgresql-16-main.log', PG_LOG, 'postgres') },
], {
  load: [3.92, 3.41, 1.88], memory: { total: 2048, cache: 640 },
  accounts: { users: [{ name: 'teashop', uid: 998, home: SHOP, shell: NOLOGIN }, { name: 'postgres', uid: 113, home: '/var/lib/postgresql', shell: '/bin/bash' }, { name: 'dba', uid: 1001 }],
    groups: [{ name: 'sudo', members: ['learner'] }] },
  processes: [
    shopProcess(1180, '2026-11-20 06:12:40'), PG_MAIN,
    { pid: 3101, user: 'dba', command: 'psql -d teashop', stat: 'S+', tty: 'pts/1', rss: 9800, vsz: 25000, start: '2026-11-22 09:30:44' },
    pgBackend(3104, 'postgres: 16/main: dba teashop [local] VACUUM', '2026-11-22 09:30:44', { stat: 'Rs', cpu: 94, rss: 412000, time: 1745 }),
    pgBackend(3188, 'postgres: 16/main: teashop teashop 127.0.0.1(41822) SELECT', '2026-11-22 09:31:42'),
    pgBackend(3190, 'postgres: 16/main: teashop teashop 127.0.0.1(41836) SELECT', '2026-11-22 09:32:05'),
  ],
  responders: [{ id: 'shop', routes: shopRoutes({ delay: 75 }) }],
  journal: [
    systemd('2026-11-22 09:30:00', 'sysstat-collect.service', 6, 'Starting sysstat-collect.service - system activity accounting tool...'),
    node('2026-11-22 09:31:52', 1180, 4, 'db: query on "orders" still running after 10000 ms (GET /account/orders)'),
    node('2026-11-22 09:32:31', 1180, 4, 'db: pool exhausted: 10 of 10 connections busy, 7 requests queued'),
    node('2026-11-22 09:32:43', 1180, 4, 'http: GET /account/orders aborted by the client after 60001 ms'),
    node('2026-11-22 09:35:10', 1180, 4, 'http: GET /account/orders aborted by the client after 60000 ms'),
    node('2026-11-22 09:41:57', 1180, 4, 'http: GET /account/orders aborted by the client after 60002 ms'),
    node('2026-11-22 09:52:20', 1180, 4, 'http: GET /account/orders aborted by the client after 60001 ms'),
  ],
});

// ---- 2. web-01 with a full /srv: debug logging was left on (example 4) --------------------------------------------------
const DEBUG_LINE = (n: number) => `2026-11-22T09:${String(10 + (n % 40)).padStart(2, '0')}:0${n % 10}.512Z debug session ${4000 + n} loaded cart, 3 items, user agent and headers dumped\n`;
const debugLog = (from: number) => Array.from({ length: 34 }, (_, i) => DEBUG_LINE(from + i)).join('');
const disk = web('srv13-disk', 'web-01（/srv 滿了）', [...release(OLD, true), link(`${SHOP}/current`, `${SHOP}/releases/${OLD}`, 'teashop')], [
  file(`${SHOP}/shared/.env`, 'NODE_ENV=production\nLOG_LEVEL=debug\n', 'teashop', 0o640),
  dir(`${SHOP}/logs`, 'teashop'), file(`${SHOP}/logs/app.log`, '2026-11-22T09:47:12.204Z error POST /checkout 500 ENOSPC: no space left on device, write\n', 'teashop'),
  file(`${SHOP}/logs/debug.log`, debugLog(0), 'teashop'), file(`${SHOP}/logs/debug.log.1`, debugLog(34), 'teashop'), file(`${SHOP}/logs/debug.log.2`, debugLog(68), 'teashop'),
  dir(`${SHOP}/sessions`, 'teashop', 0o700), dir(`${SHOP}/uploads`, 'teashop'), file(`${SHOP}/uploads/banner-winter.jpg`, 'JPEG (simulated)\n', 'teashop'),
  ...nginxLogs(hit('09:47:12', '198.51.100.23', '/checkout', 500, 21, CHROME, 'POST') + hit('09:50:00', '203.0.113.77', '/', 200, HOMEPAGE, PROBE), ''),
], {
  mounts: [
    { path: '/', device: '/dev/vda1', type: 'ext4', size: 30832548, used: 9876512 },
    { path: '/srv', device: '/dev/vdb1', type: 'ext4', size: 20466256, used: 20466256 },
  ],
  processes: [shopProcess(1250, '2026-11-21 23:06:02')],
  responders: [{ id: 'shop', routes: shopRoutes() }],
  journal: [
    { time: '2026-11-21 23:05:48', id: 'sudo', pid: 1231, priority: 5, message: `alice : TTY=pts/0 ; PWD=/home/alice ; USER=root ; COMMAND=/usr/bin/vim ${SHOP}/shared/.env` },
    { time: '2026-11-21 23:06:01', id: 'sudo', pid: 1247, priority: 5, message: 'alice : TTY=pts/0 ; PWD=/home/alice ; USER=root ; COMMAND=/usr/bin/systemctl restart tea-shop' },
    systemd('2026-11-21 23:06:02', 'tea-shop', 6, 'Started tea-shop.service - Misty Peak tea shop.'),
    node('2026-11-21 23:06:02', 1250, 6, 'tea-shop listening on 127.0.0.1:3000 (log level: debug)'),
    node('2026-11-22 09:46:58', 1250, 3, `Error: ENOSPC: no space left on device, write (${SHOP}/logs/debug.log)`),
    node('2026-11-22 09:47:12', 1250, 3, `POST /checkout 500: ENOSPC: no space left on device, open '${SHOP}/sessions/sess-8f2c41.json'`),
  ],
});

// ---- 3. web-01 after the OOM killer: a yearly export grew to 1.5 GB and the shop was killed (example 5, exercise 4) ----
const EXPORT_UNIT = '[Unit]\nDescription=Misty Peak yearly sales export\nAfter=postgresql.service\n\n[Service]\nType=simple\nExecStart=/usr/bin/python3 /opt/tea-reports/export.py --year 2026\nUser=report\n';
const EXPORT_CMD = '/usr/bin/python3 /opt/tea-reports/export.py --year 2026';
const OOM_JOURNAL: TerminalJournalEntry[] = [
  { time: '2026-11-22 09:05:14', id: 'sudo', pid: 2185, priority: 5, message: 'alice : TTY=pts/0 ; PWD=/home/alice ; USER=root ; COMMAND=/usr/bin/systemctl start tea-export' },
  systemd('2026-11-22 09:05:14', 'tea-export', 6, 'Started tea-export.service - Misty Peak yearly sales export.'),
  { time: '2026-11-22 09:05:15', unit: 'tea-export', id: 'python3', pid: 2190, priority: 6, message: 'export: loading orders 2026-01-01..2026-11-21 into memory' },
  kernel('2026-11-22 09:12:07', 'node invoked oom-killer: gfp_mask=0x140cca(GFP_HIGHUSER_MOVABLE|__GFP_COMP), order=0, oom_score_adj=0', 4),
  kernel('2026-11-22 09:12:07', 'oom-kill:constraint=CONSTRAINT_NONE,nodemask=(null),cpuset=/,mems_allowed=0,global_oom,task_memcg=/system.slice/tea-shop.service,task=node,pid=2210,uid=998'),
  kernel('2026-11-22 09:12:07', 'Out of memory: Killed process 2210 (node) total-vm:1631208kB, anon-rss:742312kB, file-rss:0kB, shmem-rss:0kB, UID:998 pgtables:1856kB oom_score_adj:0', 3),
  systemd('2026-11-22 09:12:07', 'tea-shop', 5, 'tea-shop.service: A process of this unit has been killed by the OOM killer.'),
  systemd('2026-11-22 09:12:07', 'tea-shop', 5, 'tea-shop.service: Main process exited, code=killed, status=9/KILL'),
  systemd('2026-11-22 09:12:07', 'tea-shop', 4, 'tea-shop.service: Failed with result \'oom-kill\'.'),
];
const OOM_ACCESS = [
  hit('09:10:00', '203.0.113.77', '/', 200, HOMEPAGE, PROBE), hit('09:11:48', '198.51.100.23', '/products/dongding-oolong', 200, PRODUCT, CHROME),
  hit('09:12:15', '192.0.2.140', '/', 502, B502, IPHONE), hit('09:15:00', '203.0.113.77', '/', 502, B502, PROBE), hit('09:20:00', '203.0.113.77', '/', 502, B502, PROBE),
].join('');
const oom = web('srv13-oom', 'web-01（商店被 OOM killer 結束）', [...release(OLD, true), link(`${SHOP}/current`, `${SHOP}/releases/${OLD}`, 'teashop')], [
  ...nginxLogs(OOM_ACCESS, failed('09:12:15', 3120, REFUSED, '192.0.2.140', '/', APP) + failed('09:15:00', 3133, REFUSED, '203.0.113.77', '/', APP) + failed('09:20:00', 3151, REFUSED, '203.0.113.77', '/', APP)),
  file('/etc/systemd/system/tea-export.service', EXPORT_UNIT),
  dir('/opt'), dir('/opt/tea-reports'), file('/opt/tea-reports/export.py', '# yearly sales export\n', 'root'), file('/usr/bin/python3', '', 'root', 0o755),
], {
  memory: { total: 1967, cache: 92 }, load: [2.31, 2.08, 1.40],
  accounts: { users: [{ name: 'teashop', uid: 998, home: SHOP, shell: NOLOGIN }, { name: 'report', uid: 996, home: '/opt/tea-reports', shell: NOLOGIN }, { name: 'postgres', uid: 113, home: '/var/lib/postgresql', shell: '/bin/bash' }],
    groups: [{ name: 'sudo', members: ['learner'] }] },
  services: [{ unit: 'tea-shop', active: 'failed', since: '2026-11-22 09:12:07', result: 'oom-kill', pid: 2210 }],
  processes: [
    PG_MAIN, pgBackend(2192, 'postgres: 16/main: report teashop 127.0.0.1(50312) idle', '2026-11-22 09:05:15'),
    { pid: 2190, user: 'report', command: EXPORT_CMD, stat: 'Rs', unit: 'tea-export', cpu: 97, rss: 1561340, vsz: 1702000, start: '2026-11-22 09:05:14', time: 3301 },
  ],
  programs: [{ path: '/usr/bin/node', title: SHOP_CMD, rss: 182000, vsz: 1104000, listen: [{ address: '127.0.0.1', port: 3000, fd: 21, http: 'shop' }] }],
  responders: [{ id: 'shop', routes: shopRoutes() }],
  journal: OOM_JOURNAL,
}, false);

// ---- 4. web-01 after a deploy: the new release lacks the shared config, the shop crash-loops (exercises 1 and 2) --------
const DEPLOY_LOG = `2026-11-18 15:20:11 deploy ${OLD} (commit 8d1e07a) by ci
2026-11-18 15:20:19 unpacked ${SHOP}/releases/${OLD}
2026-11-18 15:20:19 linked shared files: config/production.json
2026-11-18 15:20:20 current -> ${SHOP}/releases/${OLD}
2026-11-18 15:20:20 restarted tea-shop.service
2026-11-22 09:40:41 deploy ${NEW} (commit 4f9c2ab) by ci
2026-11-22 09:40:52 unpacked ${SHOP}/releases/${NEW}
2026-11-22 09:40:52 linked shared files: (none)
2026-11-22 09:40:58 current -> ${SHOP}/releases/${NEW}
2026-11-22 09:40:58 restarted tea-shop.service
2026-11-22 09:40:59 deploy finished
`;
const ENOENT = `Error: ENOENT: no such file or directory, open '${SHOP}/current/config/production.json'`;
/** The crash loop as systemd 255 logs it (StartLimitBurst=3), the first failed start at `time`. */
const crashLoop = (time: string, pid: number, message: string, id = 'node'): TerminalJournalEntry[] => [
  ...[0, 1, 2].flatMap(i => [
    systemd(time, 'tea-shop', 6, 'Started tea-shop.service - Misty Peak tea shop.'),
    { time, unit: 'tea-shop', id, pid: pid + i, priority: 3, message },
    systemd(time, 'tea-shop', 5, 'tea-shop.service: Main process exited, code=exited, status=1/FAILURE'),
    systemd(time, 'tea-shop', 4, 'tea-shop.service: Failed with result \'exit-code\'.'),
    systemd(time, 'tea-shop', 6, `tea-shop.service: Scheduled restart job, restart counter is at ${i + 1}.`),
    systemd(time, 'tea-shop', 6, 'Stopped tea-shop.service - Misty Peak tea shop.'),
  ]),
  systemd(time, 'tea-shop', 4, 'tea-shop.service: Start request repeated too quickly.'),
  systemd(time, 'tea-shop', 4, 'tea-shop.service: Failed with result \'exit-code\'.'),
  systemd(time, 'tea-shop', 3, 'Failed to start tea-shop.service - Misty Peak tea shop.'),
];
const stopShop = (time: string): TerminalJournalEntry[] => [
  systemd(time, 'tea-shop', 6, 'Stopping tea-shop.service - Misty Peak tea shop...'),
  systemd(time, 'tea-shop', 6, 'tea-shop.service: Deactivated successfully.'),
  systemd(time, 'tea-shop', 6, 'Stopped tea-shop.service - Misty Peak tea shop.'),
];
const CRON = (time: string, pid: number): TerminalJournalEntry => ({ time, unit: 'cron', id: 'CRON', pid, priority: 6, message: '(root) CMD (command -v debian-sa1 > /dev/null && debian-sa1 1 1)' });
const ciLogin = (time: string, pid: number): TerminalJournalEntry => ({ time, unit: 'ssh', id: 'sshd', pid, priority: 6, message: 'Accepted publickey for ci from 10.0.0.5 port 50412 ssh2: ED25519 SHA256:q3v8XGmT1bWJc2pS0yFh4nLr7dKoE5aZu9iYtVwB6sM' });
const PG_UNIT = 'postgresql@16-main';
/**
 * The journal around the deploy: the same CI login and restart, but three different failures (exercise 1 replays the
 * learner's journalctl on each): the shared config was not linked, the release lacks a module, or PostgreSQL was being
 * restarted by a package upgrade when the shop started.
 */
const deployJournal = (cause: 'config' | 'module' | 'database'): TerminalJournalEntry[] => [
  CRON('2026-11-22 09:30:01', 2270),
  ...cause === 'database' ? [
    systemd('2026-11-22 09:40:21', 'apt-daily-upgrade.service', 6, 'Starting apt-daily-upgrade.service - Daily apt upgrade and clean activities...'),
    systemd('2026-11-22 09:40:49', PG_UNIT, 6, 'Stopping postgresql@16-main.service - PostgreSQL Cluster 16-main...'),
  ] : [],
  ciLogin('2026-11-22 09:40:40', 2281),
  ...cause === 'database' ? [systemd('2026-11-22 09:40:51', PG_UNIT, 6, 'postgresql@16-main.service: Deactivated successfully.'), systemd('2026-11-22 09:40:51', PG_UNIT, 6, 'Stopped postgresql@16-main.service - PostgreSQL Cluster 16-main.')] : [],
  { time: '2026-11-22 09:40:58', id: 'sudo', pid: 2299, priority: 5, message: 'ci : PWD=/home/ci ; USER=root ; COMMAND=/usr/bin/systemctl restart tea-shop' },
  ...stopShop('2026-11-22 09:40:58'),
  ...crashLoop('2026-11-22 09:40:58', 2302, cause === 'config' ? ENOENT : cause === 'module' ? 'Error: Cannot find module \'fastify\'' : 'Error: connect ECONNREFUSED 127.0.0.1:5432'),
  ...cause === 'database' ? [systemd('2026-11-22 09:41:12', PG_UNIT, 6, 'Starting postgresql@16-main.service - PostgreSQL Cluster 16-main...'), systemd('2026-11-22 09:41:15', PG_UNIT, 6, 'Started postgresql@16-main.service - PostgreSQL Cluster 16-main.')] : [],
  CRON('2026-11-22 09:50:01', 2340),
].sort((a, b) => a.time.localeCompare(b.time));
const DEPLOY_ACCESS = [
  hit('09:38:51', '198.51.100.23', '/products/dongding-oolong', 200, PRODUCT, CHROME), hit('09:40:00', '203.0.113.77', '/', 200, HOMEPAGE, PROBE),
  hit('09:40:31', '192.0.2.140', '/account/orders', 200, ORDERS, IPHONE), hit('09:41:07', '198.51.100.61', '/', 502, B502, CHROME),
  hit('09:41:09', '198.51.100.61', '/', 502, B502, CHROME), hit('09:42:30', '192.0.2.140', '/account/orders', 502, B502, IPHONE),
  hit('09:45:00', '203.0.113.77', '/', 502, B502, PROBE), hit('09:46:12', '198.51.100.61', '/api/stock/dongding-150', 200, STOCKJSON, CHROME),
  hit('09:50:00', '203.0.113.77', '/', 502, B502, PROBE),
].join('');
const DEPLOY_ERROR = [
  failed('09:41:07', 2602, REFUSED, '198.51.100.61', '/', APP), failed('09:41:09', 2603, REFUSED, '198.51.100.61', '/', APP),
  failed('09:42:30', 2611, REFUSED, '192.0.2.140', '/account/orders', APP), failed('09:45:00', 2630, REFUSED, '203.0.113.77', '/', APP),
  failed('09:50:00', 2655, REFUSED, '203.0.113.77', '/', APP),
].join('');
const deploy = web('srv13-deploy', 'web-01（部署之後首頁 502）', [...release(OLD, true), ...release(NEW, false), link(`${SHOP}/current`, `${SHOP}/releases/${NEW}`, 'teashop')], [
  ...nginxLogs(DEPLOY_ACCESS, DEPLOY_ERROR), file('/var/log/tea-deploy.log', DEPLOY_LOG, 'root', 0o644),
], {
  services: [{ unit: 'tea-shop', active: 'failed', since: '2026-11-22 09:40:58', pid: 2304, status: 1 }],
  programs: [{ path: '/usr/bin/node', title: SHOP_CMD, rss: 182000, vsz: 1104000, fail: { message: ENOENT, unless: `${SHOP}/current/config/production.json` }, listen: [{ address: '127.0.0.1', port: 3000, fd: 21, http: 'shop' }] }],
  responders: [{ id: 'shop', routes: shopRoutes() }],
  journal: deployJournal('config'),
});

// ---- 5. web-01 while /api/stock/ times out: inv-01's new ufw lets in OpenSSH only (exercise 3) --------------------------
const STOCK_ACCESS = [
  hit('09:18:40', '198.51.100.23', '/api/stock/dongding-150', 200, STOCKJSON, CHROME), hit('09:20:00', '203.0.113.77', '/', 200, HOMEPAGE, PROBE),
  hit('09:22:14', '192.0.2.140', '/api/stock/alishan-75', 504, B504, IPHONE), hit('09:25:00', '203.0.113.77', '/', 200, HOMEPAGE, PROBE),
  hit('09:26:03', '198.51.100.61', '/products/alishan', 200, PRODUCT, CHROME), hit('09:27:04', '198.51.100.61', '/api/stock/alishan-75', 504, B504, CHROME),
].join('');
const STOCK_ERROR = failed('09:22:14', 1904, CONNECT_TIMEOUT, '192.0.2.140', '/api/stock/alishan-75', STOCK).replace(`${STOCK}/api/stock/alishan-75`, `${STOCK}/stock/alishan-75`)
  + failed('09:27:04', 1931, CONNECT_TIMEOUT, '198.51.100.61', '/api/stock/alishan-75', STOCK).replace(`${STOCK}/api/stock/alishan-75`, `${STOCK}/stock/alishan-75`);
const INV_JOURNAL: TerminalJournalEntry[] = [
  { time: '2026-11-22 09:19:52', unit: 'ssh', id: 'sshd', pid: 1388, priority: 6, message: 'Accepted publickey for ops from 10.0.0.5 port 49822 ssh2: ED25519 SHA256:Hk2dP0sWq7LmZ4yVf8cRt1uXbN6eJa3iGo9KlDqYw5E' },
  { time: '2026-11-22 09:20:31', id: 'sudo', pid: 1402, priority: 5, message: 'ops : TTY=pts/0 ; PWD=/home/ops ; USER=root ; COMMAND=/usr/sbin/ufw allow OpenSSH' },
  { time: '2026-11-22 09:20:37', id: 'sudo', pid: 1405, priority: 5, message: 'ops : TTY=pts/0 ; PWD=/home/ops ; USER=root ; COMMAND=/usr/sbin/ufw enable' },
];
const office: TerminalRemote = { host: 'office-01', title: '辦公室的電腦 office-01', address: '10.0.0.60', hostKey: 'srv13-office-01', files: [] };
const stock = web('srv13-stock', 'web-01（庫存 API 逾時）', [...release(OLD, true), link(`${SHOP}/current`, `${SHOP}/releases/${OLD}`, 'teashop')], [
  ...nginxLogs(STOCK_ACCESS, STOCK_ERROR),
], {
  processes: [shopProcess(1180, '2026-11-20 06:12:40')],
  responders: [{ id: 'shop', routes: shopRoutes() }],
  remotes: [{ ...inventory(['allow OpenSSH'], INV_JOURNAL), accounts: { users: [{ name: 'learner', uid: 1000 }, { name: 'ops', uid: 1001 }, { name: 'stock', uid: 997, home: '/opt/inventory', shell: NOLOGIN }], groups: [{ name: 'sudo', members: ['learner', 'ops'] }] } }, office],
});

// ---- exercises ----------------------------------------------------------------------------------------------------
const W = `https://${WWW}`;
const otherIncident = (label: string, cause: 'module' | 'database'): TerminalVariant => ({ label, files: [], journal: deployJournal(cause) });
const WINDOW = "sudo journalctl --since '2026-11-22 09:40:37' --until '2026-11-22 09:41:07'";
const CHECK_HOME = `curl -s -o /dev/null -w '%{http_code}\\n' ${W}/`;
const CHECK_PAGES = `for p in / /account/orders; do curl -s -o /dev/null -w "%{http_code} $p\\n" ${W}$p; done`;
const CHECK_STOCK = `curl -s -o /dev/null -w '%{http_code} %{time_total}s\\n' ${W}/api/stock/alishan-75`;
/** A mistake: longer proxy timeouts in a location of the site (sed -i on the file), tested and reloaded. */
const longerTimeouts = (proxyPass: string) => [
  `sudo sed -i 's|${proxyPass}|${proxyPass} proxy_connect_timeout 75s; proxy_read_timeout 300s;|' ${SITE_PATH}`, 'sudo nginx -t', 'sudo systemctl reload nginx'];
const ROLLBACK = [`sudo rm ${SHOP}/current`, `sudo ln -s ${SHOP}/releases/${OLD} ${SHOP}/current`];

export const SRV13: LessonContent = {
  lessonId: 'SRV13',
  motivation: '早上九點多，山嵐茶行的客服接連轉來訊息：「網站好慢」「結帳出現 502」「庫存一直轉圈圈」。值班的人最常見的反應是什麼都先重新啟動一次，或把 nginx 的逾時調大，網站也許暫時好了，卻沒人知道原因，下週同樣的事故又發生，而且重新啟動時把最關鍵的證據（哪個行程卡住、當下的錯誤訊息）一起清掉了。這一課練習一套每次都能照著走的事故處理方法：先把症狀描述清楚（什麼壞了、影響誰、從什麼時候開始），再依「便宜又可能」的順序提出並驗證假設，一次只改一件事，修好後從使用者那一端確認，最後留下一段時間線。過程中會用到前面學過的工具：從 nginx 的錯誤日誌分辨 502 與 504 各自代表的常見原因，用 df、du、journalctl -k、top 與 ps 看出磁碟、記憶體與 CPU 的耗盡，再以時間為主軸，把 access.log、error.log、應用程式與整台系統的 journal、資料庫與部署的紀錄串成一條因果鏈。',
  sections: [
    {
      id: 'srv13-s-method', title: '一致的方法：症狀、假設、一次一個改變',
      blocks: [
        { type: 'p', text: '事故發生時壓力很大，最容易出錯的是「憑直覺亂試」：同時重新啟動三個服務、改兩個設定，網站好了也說不出是哪一個動作有效。一致的方法讓每一步都有理由，也讓事後可以檢討。這一課用的五個步驟如下：' },
        { type: 'table', head: ['步驟', '要回答的問題', '常用的做法'], rows: [
          ['1. 描述症狀', '什麼壞了？影響誰？從什麼時候開始？一直壞還是偶爾壞？', '用 `curl -w` 看狀態碼與時間；用 `grep`、`cut`、`sort | uniq -c` 從 access.log 算出哪些網址、哪些用戶端、哪個時間點'],
          ['2. 提出假設並驗證', '哪些元件可能造成這個症狀？哪一個最便宜、最可能，先驗證它？', 'error.log 的一行、`systemctl status`、`journalctl -u`、`top -b -n 1`，每個假設都要能被一個指令推翻'],
          ['3. 一次只改一件事', '這個改變預期會讓什麼不同？沒有效果時要不要還原？', '改之前記下時間與內容；沒有效果就還原，再試下一個假設'],
          ['4. 從使用者那一端驗證', '使用者現在看到的是什麼？原本回報的那個操作好了嗎？', '經由公開網址（同一個名稱、https、經過 nginx）的 curl，access.log 的新紀錄是 200'],
          ['5. 寫時間線', '什麼時候開始、什麼時候發現、做了什麼、什麼時候恢復？', '依時間排列的幾行事實，加上之後要改進的事'],
        ] },
        { type: 'p', text: '症狀與假設是方法的前兩步。「網站壞了」不是症狀描述；「從 09:32 起，/account/orders 對每一位使用者都在 60 秒後回 504，首頁與庫存 API 正常」才是。這句話的每一個部分都在縮小範圍：只有一個網址壞，代表 nginx 與網路大致正常，問題在處理這個網址的後端；所有用戶端都受影響，代表不是某個瀏覽器或某個地區；60 秒後才回 504，代表 nginx 連上了後端、在等它的回應；09:32 這個時間點，則是之後在各個日誌裡往前找原因的錨點。範例先從使用者那一端量症狀，再用 access.log 回答「哪些網址、哪些人、從什麼時候」：' },
        { type: 'example', id: 'srv13-symptom' },
        { type: 'p', text: '有了症狀，就可以列出假設並排順序。這個例子裡，「nginx 壞了」幾乎可以排除（首頁和庫存 API 都正常），「商店程式停了」也不像（停了會是立刻的 502，不是 60 秒後的 504）；剩下的是「商店處理 /account/orders 時在等某個東西」：資料庫慢、資料庫的連線池滿了、CPU 不夠，或它呼叫的外部服務慢。先驗證最便宜的：看商店自己的日誌（一個指令）、看 CPU 與負載（一個指令），再去看資料庫的日誌。每一個假設都要寫成可以被推翻的形式，例如「如果是 CPU 不夠，top 會看到 %Cpu 接近 100、load average 長期高於 CPU 數」。' },
        { type: 'callout', tone: 'tip', title: '一次只改一件事', text: '找到可能的原因之後，一次只做一個改變，改完就從使用者那一端驗證。同時做三件事，網站恢復了也不知道哪一件有效、哪一件其實是多餘的，甚至有一件讓情況變糟卻被其他改變蓋住。每個改變都記下時間：這些就是之後時間線的內容，也讓你在改變沒有效果時可以準確地還原。' },
      ],
    },
    {
      id: 'srv13-s-502-504', title: '502 與 504：從 error.log 分出兩類原因',
      blocks: [
        { type: 'p', text: '502 Bad Gateway 與 504 Gateway Time-out 都是 nginx 這個「閘道」說的話：用戶端連到 nginx 沒有問題，是 nginx 從後端（upstream）拿不到正常的回應。差別在於拿不到的方式，而 nginx 一定會把它寫進 error.log，每一行都帶著它連的 upstream 位址：' },
        { type: 'table', head: ['狀態', 'error.log 的關鍵字', '常見原因', '先驗證什麼'], rows: [
          ['502', '`connect() failed (111: Connection refused) while connecting to upstream`', '後端沒有在執行：停了、當掉、在 crash loop 裡被 systemd 放棄；或 proxy_pass 的埠寫錯（主機在，但那個埠沒有程式）', '`systemctl status`、`journalctl -u` 找第一個錯誤，`sudo ss -tlnp` 看誰在監聽'],
          ['502', '`upstream prematurely closed connection while reading response header from upstream`', '連上了，但後端在回應之前就關閉連線：處理途中當掉，或 proxy_pass 指到不是 HTTP 的服務', '後端的日誌裡同一秒的錯誤'],
          ['502', '`no live upstreams while connecting to upstream`', 'upstream 裡每一台伺服器都被判定失敗', '逐台找出各自的錯誤'],
          ['504', '`upstream timed out (110: Connection timed out) while reading response header from upstream`', '後端變慢：資料庫的鎖、連線池耗盡、CPU 滿載、它呼叫的相依服務太慢', '應用程式與資料庫的日誌、`top -b -n 1`、`ps`'],
          ['504', '`upstream timed out (110: Connection timed out) while connecting to upstream`', '連線一直建立不起來：位址沒有機器（寫錯、已關機），或防火牆把封包丟掉', '`ping`、`nc -zv -w 3 主機 埠`、對方的防火牆'],
        ] },
        { type: 'p', text: '「upstream 位址寫錯」可能出現在兩邊：主機存在但埠錯，對方立刻回 RST，是 502 的 Connection refused；位址根本沒有機器，或被防火牆默默丟掉，nginx 要等到 proxy_connect_timeout（預設 60 秒）才放棄，是 504 的 while connecting。所以看到 504 先看是哪一個階段：connecting 是網路與防火牆的問題，reading response header 才是後端慢。' },
        { type: 'p', text: 'crash loop 是 502 最常見的樣子之一。unit 有 `Restart=on-failure` 時，程式一啟動就失敗，systemd 會立刻重新啟動它，journal 裡反覆出現 `Main process exited, code=exited, status=1/FAILURE` 與 `Scheduled restart job, restart counter is at N.`；在 StartLimitIntervalSec（預設 10 秒）內啟動超過 StartLimitBurst 次（預設 5，本課的 unit 設成 3），systemd 印出 `Start request repeated too quickly.` 並放棄，服務停在 failed。這時真正的原因是迴圈裡第一個程式自己的錯誤訊息，而且修好原因之後 systemd 不會自己再試，要手動 `systemctl restart`。' },
        { type: 'p', text: '回到上一節的 504：error.log 說是 reading response header，所以是後端慢。下面依序驗證「商店的日誌」「CPU」「資料庫」三個假設，最後用 ps 找出卡住大家的那個行程：' },
        { type: 'example', id: 'srv13-lock' },
        { type: 'p', text: '把線索接起來：09:30 有人以 dba 的身分開了 psql，在 orders 表上執行 `VACUUM FULL`。VACUUM FULL 會重寫整張表，執行期間持有 ACCESS EXCLUSIVE 鎖，連最普通的 SELECT 需要的 AccessShareLock 都拿不到。所以每一個查詢 orders 的請求都在等（PostgreSQL 的日誌寫著 `Process holding the lock: 3104`），商店的 10 條資料庫連線很快全部卡住（`pool exhausted`），nginx 等滿 60 秒回 504。同一個行程用掉 94% 的一顆 CPU，load average 也跟著升高，但 CPU 不是原因，只是同一件事的另一個症狀。修正的方向是處理那個鎖：請執行的人中止它（在 psql 按 Ctrl-C，或由資料庫管理員以 `SELECT pg_cancel_backend(3104);` 取消），改到離峰時間再做；平常的維護用不會擋住讀取的一般 VACUUM（模擬環境不執行 SQL，這一步只在課文說明）。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：504 就把逾時調大、先重新啟動再說', text: '把 proxy_read_timeout 調成 300 秒，504 也許會變成「等一兩分鐘之後才成功」，使用者照樣在等，nginx 與商店的連線被佔得更久，流量一大就全站變慢；而 while connecting 的 504 和 proxy_read_timeout 毫無關係。沒讀日誌就重新啟動商店也一樣危險：鎖是另一個行程持有的，重新啟動商店不會釋放它，卻會中斷所有進行中的請求，也把當下的錯誤狀態清掉。先讀 error.log 分清楚是哪一種，找出原因並保留證據，重新啟動只在確定它能解決問題時才做。' },
      ],
    },
    {
      id: 'srv13-s-resources', title: '磁碟、記憶體與 CPU：資源耗盡的樣子',
      blocks: [
        { type: 'p', text: '很多「網站壞了」的根本原因不在程式碼，而是某種資源用完了。三種資源各有典型的症狀與證據：' },
        { type: 'table', head: ['資源', '使用者看到的症狀', '證據在哪裡', '指令'], rows: [
          ['磁碟', '上傳、結帳、登入（寫 session）失敗回 500；日誌突然中斷', '應用程式的 `ENOSPC: no space left on device`、nginx 的 `(28: No space left on device)`', '`df -h`、`du -sh 路徑/*`、`ls -l`'],
          ['記憶體', '程式突然消失，502；程式越跑越大之後被殺掉', '核心的 `Out of memory: Killed process`、systemd 的 `killed by the OOM killer`', '`journalctl -k`、`top -b -n 1 -o %MEM`、`ps --sort=-rss`'],
          ['CPU', '每個請求都變慢，負載高', 'top 的 %CPU 與 load average 長期高於 CPU 數', '`uptime`、`top -b -n 1`、`ps -o pid,lstart,time,args`'],
        ] },
        { type: 'p', text: '磁碟滿的時候，先用 `df -h` 找出是哪一個檔案系統（Use% 100%），再用 `du -sh` 一層一層往下找是誰占用，最後用時間線找出它為什麼突然變大。下面的 web-01 從 09:46 起結帳回 500：' },
        { type: 'example', id: 'srv13-disk' },
        { type: 'p', text: '/srv 是獨立的檔案系統，已經 100%；商店的錯誤是 ENOSPC，而 du 顯示 /srv/tea-shop 底下最大的是 logs。往回看 journal，前一天 23:05 alice 用 sudo 編輯了 .env 並重新啟動商店，商店啟動時寫著 `log level: debug`：除錯日誌一夜之間寫滿了磁碟。注意模擬環境的檔案很小，du 的數字只有幾 KB，df 的數字則是課程宣告的固定值，所以這裡只能比較「誰最大」；真實的機器上 logs 會是十幾 GB。修復的順序是先停止成長的原因（把 LOG_LEVEL 改回 info 並重新啟動商店），再釋放空間（刪掉已經輪替、沒有程式開著的 debug.log.1、debug.log.2，目前的檔案用 `sudo truncate -s 0` 清空），最後從使用者那一端驗證結帳，之後再用 logrotate 設定大小上限。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：把大日誌檔 rm 掉，空間就回來了', text: '`rm` 只刪掉檔名。如果還有程式開著這個檔案（商店仍在寫 debug.log），它的 inode 與資料區塊要等程式關閉檔案才會釋放，`df` 仍然是 100%，而且你再也看不到那個檔案。真實系統上可以用 `sudo lsof +L1` 列出「已刪除但仍開著」的檔案，讓那個程式重新開啟日誌（重新啟動或送出它支援的訊號）；更好的做法是一開始就用 `truncate -s 0` 清空內容而不刪檔名。模擬環境的 lsof 只列網路 socket，刪除檔案也不會改變 df 的數字，所以這個現象只在課文說明。' },
        { type: 'p', text: '記憶體用完時，Linux 的 OOM killer 會挑一個行程殺掉（依 oom_score，主要看它用了多少記憶體），被殺的不一定是造成問題的那一個：它只是當下最大的。證據在核心的日誌裡，要用 `journalctl -k`（或不加 -k 而用 `-p err`）看：`invoked oom-killer` 是誰在要記憶體時觸發、`oom-kill:` 行寫著被殺的行程屬於哪個 cgroup（task_memcg），`Out of memory: Killed process` 寫著 PID、名稱與 anon-rss（它當時實際占用的記憶體）。真實的核心在這幾行之前還會印出一大段記憶體報告與行程表，模擬環境只留下關鍵的幾行。' },
        { type: 'example', id: 'srv13-oom-log' },
        { type: 'p', text: '商店在 09:12:07 被殺掉時用了約 725 MB。它為什麼會「當下最大」、記憶體又被誰吃掉，要用 `top -b -n 1 -o %MEM` 或 `ps -o pid,user,rss,args --sort=-rss` 看現在的情況，再對照 journal 裡同一段時間開始的工作（練習 4）。`systemctl status` 也會寫出 `Result: oom-kill` 與 `code=killed, signal=KILL`，但它只說明服務是被 OOM killer 結束的；誰占用了記憶體、當時用了多少，仍要看核心日誌與 journal。' },
        { type: 'p', text: 'CPU 的判斷要和 CPU 數一起看：load average 是等著執行（以及在 Linux 上等著磁碟 I/O）的行程數平均，兩顆 CPU 的機器長期在 3.9，表示一直有工作在排隊。`top -b -n 1` 依 %CPU 排序，找出最忙的行程；`ps -o pid,user,lstart,time,args -p PID` 的 STARTED 告訴你它從什麼時候開始，TIME 是它累計用掉的 CPU 時間（29 分鐘的 TIME 配上 29 分鐘前的開始時間，就是一直滿載）。前一節的 VACUUM 就是這樣被找到的。' },
      ],
    },
    {
      id: 'srv13-s-correlate', title: '日誌關聯：用時間把線索串起來',
      blocks: [
        { type: 'p', text: '每一份日誌只回答一部分的問題，要靠時間把它們接起來，這就是日誌關聯。先從使用者那一端找一個錨點（例如 access.log 裡第一個 502 或 504 的時間），再到其他日誌裡看「在那之前發生了什麼」：通常最早出現的異常是原因，之後的都是結果。' },
        { type: 'table', head: ['日誌', '位置與讀法', '時間的寫法', '回答的問題'], rows: [
          ['nginx 的 access.log', '`/var/log/nginx/access.log`（www-data:adm 0640，用 sudo 讀）', '`[22/Nov/2026:09:41:07 +0000]`', '使用者拿到了什麼：哪個網址、狀態碼、哪個用戶端'],
          ['nginx 的 error.log', '`/var/log/nginx/error.log`', '`2026/11/22 09:41:07`', 'nginx 為什麼拿不到回應：refused、timed out、哪個 upstream'],
          ['應用程式的 journal', '`sudo journalctl -u tea-shop`', '`Nov 22 09:40:58`（加 `-o short-iso` 是 ISO 8601）', '程式自己怎麼說：錯誤、慢查詢、連線池'],
          ['整台機器的 journal', '`sudo journalctl`（不加 -u）、`-p warning`、`-k`', '同上', '同一時間還發生了什麼：重新啟動、套件升級、登入、sudo、OOM'],
          ['其他服務的檔案', 'PostgreSQL 的 `/var/log/postgresql/*.log`、部署紀錄', '各自的格式，例如 `2026-11-22 09:31:43.552 UTC`', '資料庫的鎖與錯誤、部署的每一個步驟'],
        ] },
        { type: 'p', text: 'journalctl 的 `--since` 與 `--until` 選出一段時間，可以寫完整的 `2026-11-22 09:40:37`、只寫 `09:30`（今天），或相對的 `-1h`、`today`；檔案則用 `grep` 找出特定時間的行，或用 `sed -n` 印出一段範圍。範例把 09:30 到 09:33 的三種日誌放在一起看：' },
        { type: 'example', id: 'srv13-window' },
        { type: 'p', text: '`sed -n \'/09:3[0-3]:/p\'` 印出時間是 09:30 到 09:33 的每一行；`sed -n \'/09:31:/,/09:33:/p\'` 則是「範圍」：從第一個符合 09:31: 的行開始，到下一個符合 09:33: 的行為止。範圍的結尾如果一直沒出現，sed 會一路印到檔案結束（範例裡 PostgreSQL 的日誌剛好在 09:32 之後就沒有內容），所以時間窗口用字元類別寫，比用範圍可靠。加上 `-p warning` 的 journalctl 只留下 warning 以上的訊息，雜訊少很多；但要找原因時，先看不加篩選的完整日誌，因為一個 info 等級的「Started」或 sudo 紀錄，常常就是答案。' },
        { type: 'p', text: '比對時間之前，先確定大家用的是同一個時鐘與時區。本課的機器都是 UTC；如果 nginx 的時間寫著 `+0800`，而資料庫伺服器用 UTC，就要先換算再比對（17:41:07 +0800 是 09:41:07 UTC）。各台機器的時鐘也要由 NTP 同步（`timedatectl` 的 System clock synchronized 是 yes），否則差了幾十秒的時鐘會讓因果看起來顛倒。' },
      ],
    },
    {
      id: 'srv13-s-verify', title: '修復後驗證與時間線',
      blocks: [
        { type: 'p', text: '修復後驗證的重點是「從使用者那一端」：使用者用的是公開的名稱、https、經過 nginx 的那條路，所以驗證也要走同一條路。`systemctl status` 顯示 active 只代表程式在執行，它可能聽錯了埠、nginx 可能還指著舊的位址；直接 `curl http://127.0.0.1:3000/` 也跳過了 nginx、TLS 與防火牆。可靠的驗證清單：' },
        { type: 'list', ordered: true, items: [
          '用使用者回報的那個操作驗證：`curl -s -o /dev/null -w \'%{http_code} %{time_total}s\\n\' https://www.mistytea.example/account/orders`，狀態碼與時間都要正常（不是「沒有 504」而已，而是一樣快）。',
          '看 access.log 最新的幾行：其他使用者的請求也回到 200，而不只是你自己的那一個。',
          '看 error.log 不再增加新的錯誤，journal 裡沒有新的重新啟動。',
          '確認修正會在重新開機或下一次部署後仍然成立（服務是 enabled、設定寫進了檔案而不是只在記憶體裡）。',
        ] },
        { type: 'p', text: '如果事故是由一個「改變」引起的（部署、設定、套件升級），最快、風險最低的修正通常是回到上一個正常的狀態（rollback），先讓網站恢復，再慢慢修新版本（fix forward）。這次部署的工具把每個版本放在 releases 底下、用 current 這個符號連結指向正在用的版本，回滾就是把 current 指回上一版再重新啟動。' },
        { type: 'p', text: '最後是時間線：依時間排列的幾行事實，記下開始、發現、每一個動作與恢復的時間，加上之後要改進的事。它不是追究責任的報告（blameless），而是讓團隊看到「系統在哪裡沒有保護好人」。以練習 1 與 2 的部署事故為例：' },
        { type: 'table', head: ['時間（UTC）', '事件'], rows: [
          ['09:40:41', 'CI 開始部署 20261122-0940（commit 4f9c2ab）'],
          ['09:40:52', '部署腳本沒有連結共用的設定檔（linked shared files: (none)）'],
          ['09:40:58', 'current 指向新版本並重新啟動 tea-shop；商店找不到 config/production.json，啟動即失敗，systemd 重試 3 次後放棄'],
          ['09:40:59', '部署腳本回報 deploy finished，沒有檢查網站'],
          ['09:41:07', '第一個使用者拿到 502'],
          ['09:45', '客服回報'],
          ['（處理時）', '讀 error.log、journal 與部署紀錄，回滾到 20261118-1520，重新啟動，從公開網址驗證首頁與訂單頁回 200'],
          ['改進', '部署後由腳本檢查 https://www.mistytea.example/ 的狀態，失敗就自動回滾；部署腳本在缺少共用檔案時中止；監控在出現 502 的第一分鐘就通知'],
        ] },
        { type: 'callout', tone: 'note', title: '時間線為什麼要在事故中就開始寫', text: '事後回想時，每個人記得的順序都不一樣，而日誌會被輪替、被覆蓋。處理事故時順手記下「幾點幾分做了什麼、看到什麼」，最後只要整理成表格；那張表同時也是下一次事故的檢查清單。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'srv13-q1', prompt: '下列哪一個症狀描述最能幫助你縮小範圍？',
      options: ['「網站壞了，大家都打不開」', '「從 09:32 起，/account/orders 對所有使用者都在 60 秒後回 504，首頁與庫存 API 正常」', '「伺服器的 CPU 好像很高，可能被攻擊了」', '「nginx 有錯誤，應該要重新啟動」'],
      answer: 1,
      explanation: '好的症狀描述說清楚什麼壞了（一個網址）、影響誰（所有使用者）、從什麼時候（09:32）、怎麼壞（60 秒後 504），每一項都能排除一些可能。「網站壞了」沒有任何範圍；「CPU 好像很高」是一個未驗證的猜測，不是使用者看到的症狀；「nginx 有錯誤、要重新啟動」直接跳到處置，連症狀都沒有描述。',
    },
    {
      id: 'srv13-q2', prompt: 'error.log 是 `connect() failed (111: Connection refused) while connecting to upstream, … upstream: "http://127.0.0.1:3000/"`，`journalctl -u tea-shop` 的最後是 `Start request repeated too quickly.`。最恰當的下一步是什麼？',
      options: ['把 proxy_connect_timeout 調成 75s', '立刻 `sudo systemctl restart tea-shop`，失敗就再試一次', '重新啟動 nginx，讓它重新連線到後端', '往上找迴圈裡程式自己的第一個錯誤訊息，修好原因後再手動啟動服務'],
      answer: 3,
      explanation: 'Connection refused 表示 3000 埠沒有程式；Start request repeated too quickly 表示程式一啟動就失敗，systemd 重試到上限後放棄了。原因寫在迴圈裡程式自己的錯誤（例如找不到設定檔），修好之後 systemd 不會自己再試，要手動啟動。不讀日誌就重新啟動只會再跑一次同樣的迴圈；被拒絕是立刻發生的，和逾時設定無關；nginx 本身沒有問題，重新啟動它只會中斷其他連線。',
    },
    {
      id: 'srv13-q3', prompt: '/api/stock/ 回 504，error.log 是 `upstream timed out (110: Connection timed out) while connecting to upstream`，upstream 是 inv-01:8080。`ping -c 2 inv-01` 正常回應，`nc -zv -w 3 inv-01 8080` 卻逾時。最可能的原因是什麼？',
      options: ['庫存服務當掉了，8080 沒有程式在監聽', 'inv-01 的名稱解析錯了', 'inv-01 的防火牆把連到 8080 的封包丟掉了', 'proxy_read_timeout 太短'],
      answer: 2,
      explanation: 'ping 有回應，表示名稱解析正確、主機在線上（ufw 預設放行 ICMP echo）；連 8080 卻是逾時而不是 Connection refused，表示封包被默默丟掉，最典型的就是防火牆的 deny。服務當掉時對方會立刻回 RST，是 refused；error.log 寫的是 while connecting，連線根本沒建立，和讀取回應的 proxy_read_timeout 無關。',
    },
    {
      id: 'srv13-q4', prompt: '/srv 已經 100%，你發現商店的 debug.log 有 18 GB，於是 `sudo rm /srv/tea-shop/logs/debug.log`，但 `df -h` 仍然是 100%。為什麼？',
      options: ['商店仍開著那個檔案，資料區塊要等它關閉檔案才會釋放；應該先停止寫入的原因，再讓它重新開啟日誌，或一開始就用 truncate 清空', 'df 有快取，等幾分鐘就會更新', 'rm 只能刪除 4 GB 以下的檔案', '/srv 的空間要重新開機才會回收'],
      answer: 0,
      explanation: 'rm 只是刪掉目錄裡的名稱，仍被行程開著的檔案，inode 與資料要等最後一個描述子關閉才釋放，所以 df 不變，而且檔名不見了更難找（真實系統可用 `sudo lsof +L1`）。df 沒有這種延遲快取；rm 沒有檔案大小的限制；也不需要重新開機，讓那個程式關閉檔案（重新啟動或重新開啟日誌）就會釋放。',
    },
    {
      id: 'srv13-q5', prompt: '`journalctl -k` 顯示 09:12 OOM killer 殺掉了商店的 node（anon-rss 約 725 MB）；現在 `top -o %MEM` 最上面是 report 使用者的 python3 匯出程式，RES 約 1.5 GB，商店一直停著。哪一個處理最恰當？',
      options: ['直接 `sudo systemctl start tea-shop`，網站恢復就好', '先以 `sudo systemctl stop` 停下匯出（之後改到離峰或其他機器執行），再啟動商店並從公開網址驗證', '把 nginx 的 proxy_read_timeout 調長，等記憶體自己釋放', '`sudo kill -9` 匯出程式之後重新開機'],
      answer: 1,
      explanation: '被殺的商店只是當時最大的行程，壓力來自還在成長的匯出；不處理它，商店啟動後很快又會被殺。用 systemctl stop 讓匯出以 SIGTERM 正常結束，再啟動商店、從使用者那一端驗證，之後再安排匯出的時間或限制它的記憶體。只啟動商店沒有處理原因；502 是後端不在，和逾時無關；kill -9 不給程式清理的機會，重新開機則中斷所有服務又清掉證據。',
    },
    {
      id: 'srv13-q6', prompt: 'web-01 的 access.log 寫著 `[22/Nov/2026:17:41:07 +0800]` 出現第一個 502，資料庫伺服器的日誌用 UTC。要在資料庫的日誌裡找同一時刻的事件，應該找哪個時間？',
      options: ['17:41:07 UTC', '01:41:07 UTC（隔天）', '09:41:07 UTC（前一天）', '09:41:07 UTC（同一天）'],
      answer: 3,
      explanation: '+0800 表示比 UTC 快 8 小時，所以 17:41:07 +0800 是同一天的 09:41:07 UTC。直接用 17:41:07 會差 8 小時；01:41 是把方向算反（加了 8 小時）；日期也沒有變，因為 17 減 8 仍在同一天。比對不同機器的日誌之前，先統一時區，並確認時鐘有 NTP 同步。',
    },
    {
      id: 'srv13-q7', prompt: '修好商店之後，哪一個最能證明「使用者那一端」已經恢復？',
      options: ['`curl -s -o /dev/null -w \'%{http_code} %{time_total}s\\n\' https://www.mistytea.example/account/orders`', '`systemctl is-active tea-shop` 印出 active', '`curl http://127.0.0.1:3000/account/orders` 回 200', '`sudo nginx -t` 顯示 test is successful'],
      answer: 0,
      explanation: '經由公開的名稱與 https 請求使用者回報的那個網址，走的是和使用者相同的路（DNS、TLS、nginx、後端），同時看到狀態碼與花費的時間。active 只代表程式在執行；直接連 127.0.0.1:3000 跳過了 nginx、TLS 與代理設定；nginx -t 只檢查設定檔的語法，不代表後端會回應。',
    },
    {
      id: 'srv13-q8', prompt: '事故中，你同時把 proxy_read_timeout 調成 300s、重新啟動了商店，也清掉了 nginx 的快取，接著網站恢復了。這樣做最大的問題是什麼？',
      options: ['nginx 不允許同時改多個設定', '重新啟動商店一定會讓問題更嚴重', '不知道是哪一個改變有效，無法確認根本原因，也不知道哪些改變該還原', '清掉快取會讓 access.log 遺失'],
      answer: 2,
      explanation: '一次改三件事，恢復了也說不出是哪一件的功勞：根本原因仍不清楚，下次會再發生；多餘的改變（例如 300 秒的逾時）留在系統裡，悄悄藏起之後的慢請求。nginx 當然可以一次改多個設定；重新啟動不一定讓事情變糟，只是要有理由；清快取也不會影響 access.log。',
    },
  ],
  terminal: {
    machines: [slow, disk, oom, deploy, stock],
    examples: [
      {
        id: 'srv13-symptom', title: '描述症狀：哪個網址、哪些人、從什麼時候', machine: 'srv13-slow',
        description: '先從使用者那一端量三個網址的狀態碼與時間，再用 access.log 算出 504 落在哪些網址、哪些用戶端，以及第一次出現的時間；最後一行 error.log 說明 nginx 是在哪個階段放棄的。',
        steps: [
          { command: 'for p in / /account/orders /api/stock/dongding-150; do curl -s -o /dev/null -w "%{http_code} %{time_total}s $p\\n" https://www.mistytea.example$p; done', output: '200 0.002570s /\n504 60.002571s /account/orders\n200 0.003030s /api/stock/dongding-150' },
          { command: 'sudo grep \'" 504 \' /var/log/nginx/access.log | cut -d\'"\' -f2 | sort | uniq -c', output: '      5 GET /account/orders HTTP/1.1' },
          { command: 'sudo grep \'" 504 \' /var/log/nginx/access.log | cut -d\' \' -f1 | sort | uniq -c', output: '      2 192.0.2.140\n      1 198.51.100.23\n      1 198.51.100.61\n      1 203.0.113.30' },
          { command: 'sudo grep \'" 504 \' /var/log/nginx/access.log | head -n 1', output: '192.0.2.140 - - [22/Nov/2026:09:32:43 +0000] "GET /account/orders HTTP/1.1" 504 169 "-" "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1"' },
          { command: 'sudo tail -n 1 /var/log/nginx/error.log', output: '2026/11/22 10:00:00 [error] 813#813: *2 upstream timed out (110: Connection timed out) while reading response header from upstream, client: 203.0.113.30, server: www.mistytea.example, request: "GET /account/orders HTTP/1.1", upstream: "http://127.0.0.1:3000/account/orders", host: "www.mistytea.example"' },
        ],
      },
      {
        id: 'srv13-lock', title: '驗證假設：商店的日誌、CPU、資料庫的鎖', machine: 'srv13-slow',
        description: '商店說查詢 orders 很慢、連線池滿了；top 顯示一個 postgres 行程用掉 94% 的 CPU；PostgreSQL 的日誌說每個查詢都在等 3104 持有的鎖；ps 告訴我們 3104 是誰、何時開始。',
        steps: [
          { command: 'sudo journalctl -u tea-shop --since 09:30', output: 'Nov 22 09:31:52 web-01 node[1180]: db: query on "orders" still running after 10000 ms (GET /account/orders)\nNov 22 09:32:31 web-01 node[1180]: db: pool exhausted: 10 of 10 connections busy, 7 requests queued\nNov 22 09:32:43 web-01 node[1180]: http: GET /account/orders aborted by the client after 60001 ms\nNov 22 09:35:10 web-01 node[1180]: http: GET /account/orders aborted by the client after 60000 ms\nNov 22 09:41:57 web-01 node[1180]: http: GET /account/orders aborted by the client after 60002 ms\nNov 22 09:52:20 web-01 node[1180]: http: GET /account/orders aborted by the client after 60001 ms' },
          { command: 'uptime', output: ' 10:00:00 up 2 days,  3:48,  1 user,  load average: 3.92, 3.41, 1.88' },
          { command: 'top -b -n 1', output: 'top - 10:00:00 up 2 days,  3:48,  1 user,  load average: 3.92, 3.41, 1.88\nTasks:  10 total,   1 running,   9 sleeping,   0 stopped,   0 zombie\n%Cpu(s): 48.5 us,  0.0 sy,  0.0 ni, 51.5 id,  0.0 wa,  0.0 hi,  0.0 si,  0.0 st\nMiB Mem :   2048.0 total,    723.7 free,    684.3 used,    640.0 buff/cache\nMiB Swap:      0.0 total,      0.0 free,      0.0 used.   1363.7 avail Mem\n\n    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND\n   3104 postgres  20   0  224000 412000      0 R  94.0  19.6  29:05.00 postgres\n   1180 teashop   20   0 1104000 182000      0 S   3.0   8.7   0:00.00 node\n    600 systemd+  20   0   21600  12800      0 S   0.0   0.6   0:00.00 systemd-resolve\n    812 root      20   0   55316   9856      0 S   0.0   0.5   0:00.00 nginx\n    813 www-data  20   0   55804   5632   3712 S   0.0   0.3   0:00.00 nginx\n    814 www-data  20   0   55804   5632   3712 S   0.0   0.3   0:00.00 nginx\n    960 postgres  20   0  222000  31000      0 S   0.0   1.5   0:00.00 postgres\n   3101 dba       20   0   25000   9800      0 S   0.0   0.5   0:00.00 psql\n   3188 postgres  20   0  224000  16000      0 S   0.0   0.8   0:00.00 postgres\n   3190 postgres  20   0  224000  16000      0 S   0.0   0.8   0:00.00 postgres' },
          { command: 'sudo grep -A1 \'still waiting\' /var/log/postgresql/postgresql-16-main.log', output: '2026-11-22 09:31:43.552 UTC [3188] teashop@teashop LOG:  process 3188 still waiting for AccessShareLock on relation 16412 of database 16384 after 1000.081 ms\n2026-11-22 09:31:43.552 UTC [3188] teashop@teashop DETAIL:  Process holding the lock: 3104. Wait queue: 3188.\n--\n2026-11-22 09:32:06.310 UTC [3190] teashop@teashop LOG:  process 3190 still waiting for AccessShareLock on relation 16412 of database 16384 after 1000.094 ms\n2026-11-22 09:32:06.310 UTC [3190] teashop@teashop DETAIL:  Process holding the lock: 3104. Wait queue: 3188, 3190.' },
          { command: 'ps -o pid,user,lstart,time,args -p 3101,3104', output: '    PID USER                      STARTED     TIME COMMAND\n   3101 dba      Sun Nov 22 09:30:44 2026 00:00:00 psql -d teashop\n   3104 postgres Sun Nov 22 09:30:44 2026 00:29:05 postgres: 16/main: dba teashop [local] VACUUM' },
        ],
      },
      {
        id: 'srv13-window', title: '同一段時間的三種日誌：sed -n 與 journalctl --since／--until', machine: 'srv13-slow',
        description: '以 09:30 到 09:33 為窗口，依序看 access.log、PostgreSQL 的日誌與整台機器的 journal，最後只留下 warning 以上、ISO 8601 時間格式的訊息。',
        steps: [
          { command: 'sudo sed -n \'/09:3[0-3]:/p\' /var/log/nginx/access.log', output: '203.0.113.77 - - [22/Nov/2026:09:30:00 +0000] "GET / HTTP/1.1" 200 22 "-" "Uptime-Probe/2.4 (+https://status.mistytea.example)"\n192.0.2.140 - - [22/Nov/2026:09:30:41 +0000] "GET /products/dongding-oolong HTTP/1.1" 200 31 "-" "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1"\n192.0.2.140 - - [22/Nov/2026:09:32:43 +0000] "GET /account/orders HTTP/1.1" 504 169 "-" "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1"' },
          { command: 'sudo sed -n \'/09:31:/,/09:33:/p\' /var/log/postgresql/postgresql-16-main.log', output: '2026-11-22 09:31:43.552 UTC [3188] teashop@teashop LOG:  process 3188 still waiting for AccessShareLock on relation 16412 of database 16384 after 1000.081 ms\n2026-11-22 09:31:43.552 UTC [3188] teashop@teashop DETAIL:  Process holding the lock: 3104. Wait queue: 3188.\n2026-11-22 09:31:43.552 UTC [3188] teashop@teashop STATEMENT:  SELECT id, item, status FROM orders WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 20\n2026-11-22 09:32:06.310 UTC [3190] teashop@teashop LOG:  process 3190 still waiting for AccessShareLock on relation 16412 of database 16384 after 1000.094 ms\n2026-11-22 09:32:06.310 UTC [3190] teashop@teashop DETAIL:  Process holding the lock: 3104. Wait queue: 3188, 3190.\n2026-11-22 09:32:06.310 UTC [3190] teashop@teashop STATEMENT:  SELECT id, item, status FROM orders WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 20' },
          { command: 'sudo journalctl --since \'2026-11-22 09:30\' --until \'2026-11-22 09:33\'', output: 'Nov 22 09:30:00 web-01 systemd[1]: Starting sysstat-collect.service - system activity accounting tool...\nNov 22 09:31:52 web-01 node[1180]: db: query on "orders" still running after 10000 ms (GET /account/orders)\nNov 22 09:32:31 web-01 node[1180]: db: pool exhausted: 10 of 10 connections busy, 7 requests queued\nNov 22 09:32:43 web-01 node[1180]: http: GET /account/orders aborted by the client after 60001 ms' },
          { command: 'sudo journalctl -p warning --since 09:30 --until 09:33 -o short-iso', output: '2026-11-22T09:31:52+0000 web-01 node[1180]: db: query on "orders" still running after 10000 ms (GET /account/orders)\n2026-11-22T09:32:31+0000 web-01 node[1180]: db: pool exhausted: 10 of 10 connections busy, 7 requests queued\n2026-11-22T09:32:43+0000 web-01 node[1180]: http: GET /account/orders aborted by the client after 60001 ms' },
        ],
      },
      {
        id: 'srv13-disk', title: '磁碟滿了：df、journal、du 與前一晚的改變', machine: 'srv13-disk',
        description: '結帳從 09:46 起回 500。df 找出滿的檔案系統，journal 看到 ENOSPC，du 找到占用最多的資料夾，再往回看到前一晚把日誌等級改成 debug 的那次重新啟動。',
        steps: [
          { command: 'df -h', output: 'Filesystem      Size  Used Avail Use% Mounted on\n/dev/vda1        30G  9.5G   20G  33% /\n/dev/vdb1        20G   20G     0 100% /srv' },
          { command: 'sudo journalctl -u tea-shop -p err', output: 'Nov 22 09:46:58 web-01 node[1250]: Error: ENOSPC: no space left on device, write (/srv/tea-shop/logs/debug.log)\nNov 22 09:47:12 web-01 node[1250]: POST /checkout 500: ENOSPC: no space left on device, open \'/srv/tea-shop/sessions/sess-8f2c41.json\'' },
          { command: 'sudo du -sh /srv/tea-shop/*', output: '0	/srv/tea-shop/current\n20K	/srv/tea-shop/logs\n16K	/srv/tea-shop/releases\n4.0K	/srv/tea-shop/sessions\n16K	/srv/tea-shop/shared\n8.0K	/srv/tea-shop/uploads' },
          { command: 'ls -l /srv/tea-shop/logs', output: '-rw-r--r-- teashop teashop    89 app.log\n-rw-r--r-- teashop teashop  3264 debug.log\n-rw-r--r-- teashop teashop  3264 debug.log.1\n-rw-r--r-- teashop teashop  3264 debug.log.2' },
          { command: 'sudo journalctl --since \'2026-11-21 23:00\' --until \'2026-11-21 23:10\'', output: 'Nov 21 23:05:48 web-01 sudo[1231]: alice : TTY=pts/0 ; PWD=/home/alice ; USER=root ; COMMAND=/usr/bin/vim /srv/tea-shop/shared/.env\nNov 21 23:06:01 web-01 sudo[1247]: alice : TTY=pts/0 ; PWD=/home/alice ; USER=root ; COMMAND=/usr/bin/systemctl restart tea-shop\nNov 21 23:06:02 web-01 systemd[1]: Started tea-shop.service - Misty Peak tea shop.\nNov 21 23:06:02 web-01 node[1250]: tea-shop listening on 127.0.0.1:3000 (log level: debug)' },
          { command: 'sudo cat /srv/tea-shop/shared/.env', output: 'NODE_ENV=production\nLOG_LEVEL=debug' },
        ],
      },
      {
        id: 'srv13-oom-log', title: '商店被 OOM killer 結束：journal 與核心日誌', machine: 'srv13-oom',
        description: '首頁回 502；商店的 journal 說它被 OOM killer 殺掉，核心日誌寫著被殺的 PID、cgroup 與它當時占用的記憶體。',
        steps: [
          { command: 'curl -s -o /dev/null -w \'%{http_code}\\n\' https://www.mistytea.example/', output: '502' },
          { command: 'sudo journalctl -u tea-shop --since today', output: 'Nov 22 09:12:07 web-01 systemd[1]: tea-shop.service: A process of this unit has been killed by the OOM killer.\nNov 22 09:12:07 web-01 systemd[1]: tea-shop.service: Main process exited, code=killed, status=9/KILL\nNov 22 09:12:07 web-01 systemd[1]: tea-shop.service: Failed with result \'oom-kill\'.' },
          { command: 'sudo journalctl -k', output: 'Nov 22 09:12:07 web-01 kernel: node invoked oom-killer: gfp_mask=0x140cca(GFP_HIGHUSER_MOVABLE|__GFP_COMP), order=0, oom_score_adj=0\nNov 22 09:12:07 web-01 kernel: oom-kill:constraint=CONSTRAINT_NONE,nodemask=(null),cpuset=/,mems_allowed=0,global_oom,task_memcg=/system.slice/tea-shop.service,task=node,pid=2210,uid=998\nNov 22 09:12:07 web-01 kernel: Out of memory: Killed process 2210 (node) total-vm:1631208kB, anon-rss:742312kB, file-rss:0kB, shmem-rss:0kB, UID:998 pgtables:1856kB oom_score_adj:0' },
        ],
      },
    ],
    exercises: [
      {
        id: 'srv13-timeline', title: '先找時間線：第一個 502 之前的 30 秒', machine: 'srv13-deploy',
        statement: `09:45 客服轉來訊息：「首頁打不開，顯示 502 Bad Gateway」。先不要修改任何東西：從 nginx 的 access.log 找出今天第一個 502 的時間 T，再用 journalctl 列出整台機器（所有服務，不只商店）從 T 之前 30 秒到 T 為止的日誌，\`--since\` 與 \`--until\` 都寫到秒（例如 T 是 14:20:15，就寫 14:19:45 到 14:20:15）。最後執行的 journalctl 要印出這段日誌。檢查時，journal 會換成另外兩種事故重新執行你的指令，所以必須真的用 journalctl 查詢才能通過。`,
        checks: [{ kind: 'output', fromCommand: '^(sudo )?journalctl ' }, { kind: 'service', unit: 'tea-shop', active: 'failed' }, { kind: 'unchanged', path: SHOP }],
        solution: [`sudo grep '" 502 ' /var/log/nginx/access.log | head -n 1`, WINDOW],
        variants: [otherIncident('另一種事故：新版本少了一個 node 模組', 'module'), otherIncident('另一種事故：部署時 PostgreSQL 正被套件升級重新啟動', 'database')],
        mistakes: [
          { commands: ["sudo journalctl -u tea-shop --since '2026-11-22 09:40:37' --until '2026-11-22 09:41:07'"],
            why: '只看了商店這個服務：CI 在 09:40:40 登入、09:40:58 以 sudo 重新啟動商店這兩件事都不在 tea-shop 的日誌裡（另一種事故裡，資料庫被重新啟動也不在），而它們正是原因的一部分。' },
          { commands: ["journalctl --since '2026-11-22 09:40:37' --until '2026-11-22 09:41:07'"],
            why: '沒有 sudo：learner 不在 adm 或 systemd-journal 群組，journalctl 只印出提示與 `-- No entries --`，看不到系統的日誌。' },
          { commands: ["sudo journalctl --since '2026-11-22 09:41:07' --until '2026-11-22 09:41:37'"],
            why: '窗口放在第一個 502 之後：要找的是「之前」發生了什麼，之後的日誌只會是結果（這段時間甚至沒有任何紀錄）。' },
        ],
        hints: ['`sudo grep \'" 502 \' /var/log/nginx/access.log | head -n 1`：時間在方括號裡，+0000 表示 UTC。', 'journalctl 也用這台機器的時區（UTC）；不加 `-u` 就是整台機器的日誌，讀系統日誌要 sudo。', '`sudo journalctl --since \'2026-11-22 HH:MM:SS\' --until \'2026-11-22 HH:MM:SS\'`，前一個時間是 T 減 30 秒。'],
        explanation: `access.log 的第一個 502 在 09:41:07，所以窗口是 09:40:37 到 09:41:07。這 30 秒的日誌依序是：09:40:40 CI 以公鑰登入、09:40:58 CI 以 sudo 重新啟動 tea-shop、systemd 停止舊的商店、新的商店啟動後立刻印出錯誤（找不到 ${SHOP}/current/config/production.json）、重試 3 次後 \`Start request repeated too quickly\`。最早的異常就是那行錯誤，而在它之前的「改變」是部署：這就是下一個練習要修的。另外兩種事故的窗口一樣，內容不同（少了 fastify 模組、PostgreSQL 被升級重新啟動而 ECONNREFUSED 5432），所以要先看整台機器的日誌，而不是先假設是哪個服務。`,
      },
      {
        id: 'srv13-rollback', title: '部署之後的 502：讀日誌、回滾、驗證', machine: 'srv13-deploy',
        statement: `同一台 web-01：09:40 的部署之後，首頁一直是 502。請找出原因，用最小的改變讓網站恢復：這次先回到上一個正常的版本 ${OLD}（讓 ${SHOP}/current 指向 ${SHOP}/releases/${OLD}），修部署腳本是之後的事；不要修改 nginx 的設定。修好之後，從使用者那一端確認 ${W}/ 與 ${W}/account/orders 都回 200。`,
        checks: [
          { kind: 'service', unit: 'tea-shop', active: 'active' },
          { kind: 'link', path: `${SHOP}/current`, target: `${SHOP}/releases/${OLD}` },
          { kind: 'http', url: `${W}/`, status: 200, body: '山嵐茶行' },
          { kind: 'http', url: `${W}/account/orders`, status: 200, body: '"orders"' },
          { kind: 'unchanged', path: SITE_PATH },
        ],
        solution: [
          CHECK_HOME, 'sudo tail -n 1 /var/log/nginx/error.log', 'sudo journalctl -u tea-shop -p err', 'cat /var/log/tea-deploy.log',
          `ls -l ${SHOP} ${SHOP}/releases/${NEW}/config ${SHOP}/releases/${OLD}/config`,
          ...ROLLBACK, 'sudo systemctl restart tea-shop', CHECK_PAGES,
        ],
        mistakes: [
          { commands: ['sudo systemctl restart tea-shop'],
            why: '沒讀日誌就重新啟動：current 仍指向缺少設定檔的新版本，商店一啟動就同樣 ENOENT，systemd 再重試 3 次後放棄，首頁仍是 502。' },
          { commands: ['sudo systemctl restart nginx'],
            why: 'nginx 沒有問題，127.0.0.1:3000 根本沒有程式在監聽，重新啟動 nginx 之後仍是 Connection refused 的 502，還中斷了所有連線。' },
          { commands: ROLLBACK,
            why: 'current 已經指回上一版，但 systemd 在 09:40:58 重試到上限（Start request repeated too quickly）後就不再嘗試，不會因為檔案修好而自己啟動；商店仍是 failed，要手動 restart。' },
          { commands: longerTimeouts(`proxy_pass ${APP};`),
            why: '502 的 Connection refused 是立刻發生的，和逾時毫無關係：把逾時調長之後仍是 502，還改動了不該動的 nginx 設定。' },
        ],
        hints: ['error.log 的 Connection refused 表示 3000 埠沒有程式；`sudo journalctl -u tea-shop -p err` 看商店自己說了什麼。', '`cat /var/log/tea-deploy.log`，比較兩次部署的 linked shared files；`ls -l` 看兩個版本的 config 資料夾。', '`sudo rm ' + SHOP + '/current` 再 `sudo ln -s ' + SHOP + '/releases/' + OLD + ' ' + SHOP + '/current`，之後別忘了 systemd 已經放棄重試。'],
        explanation: `error.log 的 \`connect() failed (111: Connection refused)\` 說 127.0.0.1:3000 沒有程式；商店的 journal 說它找不到 ${SHOP}/current/config/production.json，systemd 重試 3 次後放棄。部署紀錄顯示這次的 linked shared files 是 (none)，而上一次有 config/production.json；ls 也證實新版本的 config 資料夾是空的，上一版則有一個指向 shared 的連結。回滾就是把 current 指回 ${OLD}（GNU 的 \`ln -sfn\` 可以一步完成；少了 -n 的 \`ln -sf 目標 current\` 會跟著 current 進到它指向的資料夾、在裡面多建一個連結，模擬環境的 ln 沒有 -n，所以先 rm 連結再建立），然後手動 \`systemctl restart\`：修好原因之後 systemd 不會自己再試。最後經由公開網址驗證首頁與訂單頁都是 200。之後要修的是部署腳本：補上共用檔案的連結，並在切換後檢查網站、失敗就自動回滾。`,
      },
      {
        id: 'srv13-stock-504', title: '只有庫存 API 504：是慢，還是連不上？', machine: 'srv13-stock',
        statement: `從 09:22 起，商品頁的庫存一直讀取失敗：${W}/api/stock/ 底下的請求要等一分鐘才得到 504，網站的其他頁面正常。庫存 API 在 inv-01（${INV_IP}）的 8080 埠，你可以用 \`ssh inv-01\`（金鑰已經設定好）登入或直接 \`ssh inv-01 指令\`，learner 在那裡可以使用 sudo。請找出根本原因並修好，讓 ${W}/api/stock/alishan-75 回 200。限制：inv-01 的防火牆要保持啟用；8080 只開放給 web-01 的私有位址 ${LAN_IP}，辦公室的 office-01（10.0.0.60）不能直接連到庫存 API；不要用調長逾時的方式處理。`,
        checks: [
          { kind: 'http', url: `${W}/api/stock/alishan-75`, status: 200, body: 'on_hand' },
          { kind: 'firewall', host: 'inv-01', enabled: true, incoming: 'deny' },
          { kind: 'reach', from: 'office-01', to: 'inv-01', port: 8080, result: 'timeout' },
          { kind: 'unchanged', path: SITE_PATH },
        ],
        solution: [
          CHECK_STOCK, 'sudo tail -n 1 /var/log/nginx/error.log', 'ping -c 2 inv-01', 'ssh inv-01 sudo ufw status',
          'ssh inv-01 sudo journalctl --since 09:15 --until 09:25', `ssh inv-01 sudo ufw allow from ${LAN_IP} to any port 8080 proto tcp`, CHECK_STOCK,
        ],
        mistakes: [
          { commands: longerTimeouts('proxy_pass http://inv-01:8080/stock/;'),
            why: 'error.log 寫的是 while connecting to upstream：連線根本沒有建立。逾時調長只是讓使用者等 75 秒才看到 504，問題完全沒解決。' },
          { commands: ['ssh inv-01 sudo systemctl restart inventory'],
            why: '庫存服務本身沒有問題（在 inv-01 上連 8080 是好的），封包在到達它之前就被 ufw 丟掉了；重新啟動服務之後仍是 504。' },
          { commands: ['ssh inv-01 sudo ufw disable'],
            why: '關掉防火牆確實讓 504 消失，但 inv-01 的每一個埠也同時對整個網路開放，違反了題目的限制。' },
          { commands: ['ssh inv-01 sudo ufw allow 8080/tcp'],
            why: '`allow 8080/tcp` 沒有限制來源：web-01 連得上了，但 office-01 也可以直接連到庫存 API。' },
          { commands: [`ssh inv-01 sudo ufw allow from ${WEB_IP} to any port 8080 proto tcp`],
            why: '允許的是 web-01 的公開位址：nginx 連 10.0.0.31 時走的是私有網段的 eth1，來源是 10.0.0.10，所以仍被丟棄，仍是 504。' },
        ],
        hints: ['error.log 最後一行寫的是哪一個階段？while connecting 與 while reading response header 代表完全不同的問題。', '`ping -c 2 inv-01` 有回應，`nc -zv -w 3 inv-01 8080` 卻逾時：主機在線上，但那個埠的封包被丟掉了。用 `ssh inv-01 sudo ufw status` 看規則，`ssh inv-01 sudo journalctl --since 09:15 --until 09:25` 看那段時間誰做了什麼。', '`ssh inv-01 sudo ufw allow from 10.0.0.10 to any port 8080 proto tcp`，再用同一個 curl 驗證。'],
        explanation: `curl 花了 60 秒才拿到 504，error.log 寫著 \`upstream timed out (110: Connection timed out) while connecting to upstream\`，upstream 是 ${INV_IP}:8080：連線一直沒有建立，不是庫存服務慢。ping 有回應，表示 inv-01 在線上（ufw 預設放行 ICMP echo），問題縮小到 8080 的封包；\`ufw status\` 只有 OpenSSH，而 inv-01 的 journal 顯示 ops 在 09:20:31 允許 OpenSSH、09:20:37 啟用了 ufw，第一個 504 就在之後的 09:22:14。根本原因是導入防火牆時漏了 web-01 到 8080 這條規則，所以修法是補上只允許 ${LAN_IP} 的規則（nginx 從私有網段的 eth1 連過去），防火牆保持啟用、office-01 仍然連不到。修好之後同一個 curl 回 200，時間回到毫秒等級。之後導入防火牆前，應該先用 \`ss -tn\` 與 nginx 的 upstream 列出誰會連進來。`,
      },
      {
        id: 'srv13-oom-fix', title: '被 OOM killer 結束的商店：找出記憶體的去向', machine: 'srv13-oom',
        statement: `從 09:12 起首頁回 502。這台 web-01 的 tea-shop.service 還沒有設定 Restart=。請找出商店為什麼停止、記憶體被誰占用，讓網站恢復而且不會馬上再發生同樣的事：今天的年度匯出可以先停下來（之後改到離峰時間或另一台機器執行），但要讓它正常結束，不要直接強制殺掉。最後從使用者那一端確認 ${W}/ 回 200。`,
        checks: [
          { kind: 'service', unit: 'tea-shop', active: 'active' },
          { kind: 'service', unit: 'tea-export', active: 'inactive' },
          { kind: 'process', name: 'python3', absent: true },
          { kind: 'http', url: `${W}/`, status: 200, body: '山嵐茶行' },
        ],
        solution: [CHECK_HOME, 'sudo journalctl -k', 'top -b -n 1 -o %MEM', "sudo journalctl --since '2026-11-22 09:00' --until '2026-11-22 09:13'", 'sudo systemctl stop tea-export', 'sudo systemctl start tea-shop', CHECK_HOME],
        mistakes: [
          { commands: ['sudo systemctl start tea-shop'],
            why: '商店暫時回來了，但吃掉 1.5 GB 的匯出還在執行而且仍在成長：記憶體只剩不到 300 MB，商店很快會再被 OOM killer 殺掉（模擬環境沒有記憶體的模型，這一步只能靠你自己判斷）。' },
          { commands: ['sudo systemctl restart nginx'],
            why: 'nginx 沒有問題，3000 埠沒有程式，重新啟動 nginx 之後仍是 502。' },
          { commands: ['sudo kill -9 2190', 'sudo systemctl start tea-shop'],
            why: 'SIGKILL 不給匯出任何清理的機會（暫存檔、寫到一半的輸出、資料庫交易），systemd 也把 tea-export 記成 failed。用 `systemctl stop` 先送 SIGTERM 讓它正常結束。' },
          { commands: ['sudo systemctl stop tea-export'],
            why: '記憶體騰出來了，但商店沒有 Restart=，被殺掉之後不會自己回來，首頁仍是 502。' },
        ],
        hints: ['`sudo journalctl -k` 看核心殺了誰、當時用了多少記憶體。', '`top -b -n 1 -o %MEM` 看現在誰最大；它屬於哪個服務？journal 裡 09:00 到 09:13 之間啟動了什麼？', '`sudo systemctl stop tea-export`，再 `sudo systemctl start tea-shop`，最後用 curl 從公開網址驗證。'],
        explanation: `核心的日誌說 09:12:07 記憶體用完，OOM killer 殺掉了 tea-shop 的 node（PID 2210，anon-rss 約 725 MB）；因為 unit 沒有 Restart=，商店就一直停著，nginx 連 127.0.0.1:3000 被拒絕而回 502。被殺的只是「當下最大」的行程：top 依記憶體排序，最上面是 report 使用者的 python3，RES 約 1.5 GB、%MEM 77.5，而 journal 顯示 alice 在 09:05:14 以 sudo 啟動了 tea-export，它開始把整年的訂單載入記憶體。所以先用 \`systemctl stop tea-export\` 讓匯出正常結束（SIGTERM），再啟動商店，最後從公開網址驗證 200。後續的改進寫進時間線：匯出改到離峰時間或另一台機器，或用 systemd 的 MemoryMax= 限制它的記憶體；商店加上 Restart=on-failure；監控記憶體用量（MemoryMax 與記憶體的上限在模擬環境中不模擬）。`,
      },
    ],
  },
};
