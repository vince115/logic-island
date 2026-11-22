import type { NetworkScene, NodeTable, ProtocolHeader } from '@/lib/network/model';
import type { TerminalFile, TerminalMachine, TerminalProcess, TerminalVariant } from '@/lib/terminal/lesson';
import type { LessonContent } from '../schema';

/*
 * SRV05 Web server architecture (SRV-2, network-sequence; the blueprint's architecture-diagram activity drawn as network
 * scenes, not the database island's content.ops). A terminal lesson on the nginx profile (engine stage E14) beside two
 * network-protocol scenes. The terminal part observes one server's tiers before the reverse proxy is connected
 * (proxy_pass is engine stage E15, SRV07): ps shows the nginx master (root) and its workers (www-data), the gunicorn
 * master and its sync workers and PostgreSQL; ss -tlnp (with and without sudo) shows nginx on 0.0.0.0:80/443, gunicorn
 * on 127.0.0.1:8000 and PostgreSQL on 127.0.0.1:5432; curl shows a static file served by nginx from disk (alias),
 * nginx's 404 for /api/ while it is not proxied yet, the application server answering on loopback and refusing the
 * public address; nginx.conf's worker_processes, worker_connections and keepalive_timeout give the connection limit;
 * keep-alive against gunicorn's Connection: close. The network part: one keep-alive connection that carries a static
 * request (answered by nginx alone) and a dynamic one (nginx → upstream → database), and a slow upstream that ends in
 * 504 Gateway Time-out and an idle keep-alive connection that nginx closes. Facts follow the nginx documentation
 * (location matching, worker_connections counting every connection, proxy timeouts and proxy_hide_header defaults),
 * gunicorn's documentation (default bind 127.0.0.1:8000, sync workers, timeout 30) and PostgreSQL's (listen_addresses
 * localhost). Simplifications: gunicorn's process is written as /srv/tidetea/venv/bin/gunicorn (the real command line
 * starts with the venv's python3, while its comm is gunicorn, which ss -p shows); PostgreSQL's background processes are
 * left out (they do not hold the listening socket, which the engine would give them). The tea shop, its host names
 * (.example, RFC 2606) and addresses (RFC 5737) are made up. Every transcript output was produced by replaying it on the
 * engine.
 */

const dir = (path: string, owner = 'root', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'root', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const link = (path: string, target: string): TerminalFile => ({ path, kind: 'link', mode: 0o777, owner: 'root', target });

const SITE = 'tidetea.example';
const WEB_IP = '203.0.113.20', CLIENT_IP = '198.51.100.23';

/** nginx.conf as the team tuned it: Ubuntu's layout with explicit worker_connections and keepalive_timeout. */
const nginxConf = (workers: string, connections: number) => `user www-data;
worker_processes ${workers};
pid /run/nginx.pid;
error_log /var/log/nginx/error.log;
include /etc/nginx/modules-enabled/*.conf;

events {
\tworker_connections ${connections};
}

http {
\tsendfile on;
\ttcp_nopush on;
\ttypes_hash_max_size 2048;
\tkeepalive_timeout 65;

\tinclude /etc/nginx/mime.types;
\tdefault_type application/octet-stream;

\tssl_protocols TLSv1.2 TLSv1.3;
\tssl_prefer_server_ciphers on;

\taccess_log /var/log/nginx/access.log;
\tgzip on;

\tinclude /etc/nginx/conf.d/*.conf;
\tinclude /etc/nginx/sites-enabled/*;
}
`;
/** The site: static files from disk; the /api/ location for the application server is still commented out. */
const SITE_CONF = `server {
    listen 80 default_server;
    listen 443 ssl default_server;
    server_name ${SITE} www.${SITE};
    ssl_certificate /etc/ssl/tidetea/fullchain.pem;
    ssl_certificate_key /etc/ssl/tidetea/privkey.pem;

    root /srv/tidetea/public;
    index index.html;

    # 靜態檔案：nginx 直接從磁碟讀取，不經過應用程式
    location /static/ {
        alias /srv/tidetea/static/;
        add_header Cache-Control "max-age=86400";
    }

    # 動態請求要交給 127.0.0.1:8000 的 gunicorn（反向代理在 SRV07 才接上）：
    # location /api/ {
    #     proxy_pass http://127.0.0.1:8000;
    # }

    location / {
        try_files $uri $uri/ =404;
    }
}
`;

const GUNICORN = (bind: string) => `/srv/tidetea/venv/bin/gunicorn --workers 3 --timeout 120 --bind ${bind}:8000 tidetea.wsgi:application`;
/** gunicorn: a master and three sync workers; the workers inherit the listening socket and accept on it. */
const gunicorn = (bind = '127.0.0.1'): TerminalProcess[] => [
  { pid: 900, user: 'tidetea', command: GUNICORN(bind), stat: 'Ss', rss: 38400, listen: [{ port: 8000, address: bind, fd: 5, backlog: 2048, http: 'app' }] },
  ...[901, 902, 903].map(pid => ({ pid, ppid: 900, user: 'tidetea', command: GUNICORN(bind), stat: 'S', rss: 61200 })),
];
const BASE: TerminalProcess[] = [
  { pid: 1, ppid: 0, user: 'root', command: '/sbin/init', stat: 'Ss', rss: 12800 },
  { pid: 640, user: 'root', command: 'sshd: /usr/sbin/sshd -D [listener] 0 of 10-100 startups', stat: 'Ss', rss: 9100, listen: [{ port: 22, fd: 3, backlog: 128 }] },
  { pid: 700, user: 'postgres', command: '/usr/lib/postgresql/16/bin/postgres -D /var/lib/postgresql/16/main -c config_file=/etc/postgresql/16/main/postgresql.conf', stat: 'Ss', rss: 30200,
    listen: [{ port: 5432, address: '127.0.0.1', fd: 6, backlog: 244 }] },
];
const REDIS: TerminalProcess = { pid: 760, user: 'redis', command: '/usr/bin/redis-server 127.0.0.1:6379', stat: 'Ssl', rss: 11800, listen: [{ port: 6379, address: '127.0.0.1', fd: 6, backlog: 511 }] };

const web: TerminalMachine = {
  id: 'srv05-web', title: '茶行網站 web-01', user: 'learner', cwd: '/home/learner', host: 'web-01', profile: 'nginx', nginx: true, cpus: 2,
  interfaces: [{ name: 'eth0', address: `${WEB_IP}/24` }], address: WEB_IP,
  accounts: {
    users: [{ name: 'tidetea', uid: 1001, home: '/srv/tidetea', shell: '/usr/sbin/nologin' }, { name: 'postgres', uid: 114, home: '/var/lib/postgresql', shell: '/bin/bash' },
      { name: 'redis', uid: 115, home: '/var/lib/redis', shell: '/usr/sbin/nologin' }],
    groups: [{ name: 'sudo', members: ['learner'] }],
  },
  certificates: [{ id: 'srv05-tidetea', cn: SITE, sans: [SITE, `www.${SITE}`], issuer: 'lets-encrypt-r11', notBefore: '2026-11-01 09:00:00', keyType: 'ec256',
    path: '/etc/ssl/tidetea/fullchain.pem', chain: ['lets-encrypt-r11'], key: '/etc/ssl/tidetea/privkey.pem' }],
  files: [
    dir('/home'), dir('/home/learner', 'learner'),
    dir('/etc'), dir('/etc/nginx'), file('/etc/nginx/nginx.conf', nginxConf('auto', 1024)),
    dir('/etc/nginx/sites-available'), file('/etc/nginx/sites-available/tidetea', SITE_CONF), dir('/etc/nginx/sites-enabled'), link('/etc/nginx/sites-enabled/tidetea', '/etc/nginx/sites-available/tidetea'),
    dir('/srv'), dir('/srv/tidetea', 'tidetea'),
    dir('/srv/tidetea/public', 'tidetea'), file('/srv/tidetea/public/index.html', '<h1>潮汐茶行</h1>\n', 'tidetea'), file('/srv/tidetea/public/robots.txt', 'User-agent: *\nDisallow: /api/\n', 'tidetea'),
    dir('/srv/tidetea/static', 'tidetea'), dir('/srv/tidetea/static/css', 'tidetea'), file('/srv/tidetea/static/css/site.css', 'body { font-family: serif; }\n', 'tidetea'),
    dir('/srv/tidetea/app', 'tidetea'), file('/srv/tidetea/app/settings.py', 'DATABASE_HOST = "127.0.0.1"\nDATABASE_PORT = 5432\n', 'tidetea', 0o640),
    dir('/srv/tidetea/app/static', 'tidetea'), dir('/srv/tidetea/app/static/css', 'tidetea'), file('/srv/tidetea/app/static/css/print.css', '@media print { nav { display: none; } }\n', 'tidetea'),
  ],
  processes: [...BASE, ...gunicorn()],
  responders: [{ id: 'app', server: 'gunicorn', keepAlive: false, routes: [
    { path: '/api/teas/12', type: 'application/json', body: '{"id":12,"name":"凍頂烏龍","price":480,"stock":7}\n' },
    { path: '/healthz', type: 'text/plain', body: 'ok\n' },
  ] }],
};

const EXPOSED: TerminalVariant = { label: 'gunicorn 被改成綁定 0.0.0.0:8000', files: [], processes: [...BASE, ...gunicorn('0.0.0.0')] };
const WITH_REDIS: TerminalVariant = { label: '另一台同樣架構的主機，多了只給本機用的 Redis', files: [], processes: [...BASE, REDIS, ...gunicorn()] };
const conf = (workers: string, connections: number) => file('/etc/nginx/nginx.conf', nginxConf(workers, connections));
const FOUR_WORKERS: TerminalVariant = { label: 'worker_processes 4、worker_connections 2048', files: [conf('4', 2048)] };
const ONE_WORKER: TerminalVariant = { label: 'worker_processes 1、worker_connections 512', files: [conf('1', 512)] };

// ---- network scenes ----------------------------------------------------------------------------------------------
const ipv4 = (from: string, to: string): ProtocolHeader => ({ layer: 'network', protocol: 'IPv4', fields: [{ name: '來源 IP', value: from }, { name: '目的 IP', value: to }] });
const tcp = (from: string, to: string, flags: string): ProtocolHeader => ({ layer: 'transport', protocol: 'TCP', fields: [
  { name: '來源連接埠', value: from }, { name: '目的連接埠', value: to }, { name: '旗標', value: flags }] });
const request = (path: string, host: string, version = 'HTTP/1.1', extra: [string, string][] = []): ProtocolHeader => ({ layer: 'application', protocol: version, fields: [
  { name: '方法', value: 'GET' }, { name: '路徑', value: path }, { name: '版本', value: version }, { name: 'Host', value: host }, ...extra.map(([name, value]) => ({ name, value }))] });
const response = (version: string, code: string, reason: string, headers: [string, string][]): ProtocolHeader => ({ layer: 'application', protocol: version, fields: [
  { name: '版本', value: version }, { name: '狀態碼', value: code }, { name: '原因片語', value: reason }, ...headers.map(([name, value]) => ({ name, value }))] });
const pg = (type: string, detail: string): ProtocolHeader => ({ layer: 'application', protocol: 'PostgreSQL', fields: [{ name: '訊息類型', value: type }, { name: '內容', value: detail }] });
const NGINX = 'nginx/1.24.0 (Ubuntu)';
const PORT = '51514', UPSTREAM_PORT = '41870', DB_PORT = '41532';

const LOC_HEAD = ['請求路徑', '符合的 location', '處理方式'];
const STATIC_ROW = ['/static/css/site.css', '/static/', 'nginx 讀取 /srv/tidetea/static/css/site.css'];
const API_ROW = ['/api/teas/12', '/api/', '交給 upstream 127.0.0.1:8000'];
const locations = (rows: string[][], changed?: number[]): NodeTable => ({ node: 'nginx', name: 'location 比對', head: LOC_HEAD, rows, ...changed ? { changed } : {} });
const CONN_HEAD = ['連線', '兩端', '用途'];
const DOWN = ['#1', `${CLIENT_IP}:${PORT} → ${WEB_IP}:443`, '下游：瀏覽器的 keep-alive 連線'];
const UP = ['#2', `127.0.0.1:${UPSTREAM_PORT} → 127.0.0.1:8000`, '上游：nginx 連到 gunicorn'];
const conns = (rows: string[][], changed?: number[]): NodeTable => ({ node: 'nginx', name: 'nginx 的連線', head: CONN_HEAD, rows, ...changed ? { changed } : {} });

/** Section 2: one keep-alive connection carries a static request (nginx alone) and a dynamic one (nginx → gunicorn → PostgreSQL). */
const tiers: NetworkScene = {
  id: 'srv05-tiers', title: '靜態與動態請求：nginx、gunicorn 與 PostgreSQL', model: 'tcp-ip',
  description: `web-01 上線之後的樣子：nginx 在 ${WEB_IP} 的 443 埠接受瀏覽器的連線；location /static/ 以 alias 從 /srv/tidetea/static/ 讀檔，location /api/ 以 proxy_pass 交給同一台機器 127.0.0.1:8000 的 gunicorn，其他請求由 location / 在 /srv/tidetea/public 找檔案。gunicorn 執行茶行的 Python 程式，資料在 127.0.0.1:5432 的 PostgreSQL。顧客的瀏覽器在同一條連線上先要一個 CSS 檔，再要一筆商品資料。瀏覽器與 nginx 之間是 HTTPS，這裡畫的是 TLS 解密之後 nginx 看到的 HTTP。`,
  nodes: [
    { id: 'client', label: '顧客的瀏覽器', kind: 'host', addresses: [`IP ${CLIENT_IP}`] },
    { id: 'nginx', label: 'web-01：nginx（網頁伺服器）', kind: 'server', addresses: [`IP ${WEB_IP}`, 'TCP 80、443（0.0.0.0）'] },
    { id: 'app', label: 'web-01：gunicorn（應用伺服器）', kind: 'server', addresses: ['IP 127.0.0.1', 'TCP 8000'] },
    { id: 'db', label: 'web-01：PostgreSQL（資料庫）', kind: 'server', addresses: ['IP 127.0.0.1', 'TCP 5432'] },
  ],
  messages: [
    { id: 'static-req', from: 'client', to: 'nginx', label: 'GET /static/css/site.css',
      headers: [request('/static/css/site.css', SITE, 'HTTP/1.1', [['User-Agent', 'Mozilla/5.0'], ['Accept', 'text/css,*/*;q=0.1']]), tcp(PORT, '443', 'PSH, ACK'), ipv4(CLIENT_IP, WEB_IP)],
      payload: `GET /static/css/site.css HTTP/1.1\nHost: ${SITE}\n…`,
      note: '瀏覽器已經和 nginx 建立了連線（TCP 與 TLS 交握省略）。nginx 的 worker 讀進請求列與標頭後，先依 Host 選出 server 區塊，再依路徑選 location：/static/ 與 / 兩個前綴都符合，nginx 選最長的那個，所以是 location /static/。',
      tables: [locations([STATIC_ROW], [0]), conns([DOWN])] },
    { id: 'static-resp', from: 'nginx', to: 'client', label: '200 OK（nginx 直接讀檔）',
      headers: [response('HTTP/1.1', '200', 'OK', [['Server', NGINX], ['Content-Type', 'text/css'], ['Content-Length', '29'], ['Connection', 'keep-alive'], ['Cache-Control', 'max-age=86400']]),
        tcp('443', PORT, 'PSH, ACK'), ipv4(WEB_IP, CLIENT_IP)],
      payload: 'HTTP/1.1 200 OK\nContent-Type: text/css\n…\n\nbody { font-family: serif; }',
      note: 'alias 把 /static/ 換成 /srv/tidetea/static/，worker 以 www-data 的身分讀出檔案就回應了：沒有任何程式碼執行，也沒有連到 gunicorn 或資料庫。這就是靜態內容：每個人拿到的位元組都一樣，Content-Type 依副檔名從 mime.types 查出，Cache-Control 是 add_header 加的，讓瀏覽器一天內不必再要一次。',
      tables: [locations([STATIC_ROW]), conns([DOWN])] },
    { id: 'api-req', from: 'client', to: 'nginx', label: 'GET /api/teas/12（同一條連線）',
      headers: [request('/api/teas/12', SITE, 'HTTP/1.1', [['User-Agent', 'Mozilla/5.0'], ['Accept', 'application/json']]), tcp(PORT, '443', 'PSH, ACK'), ipv4(CLIENT_IP, WEB_IP)],
      payload: `GET /api/teas/12 HTTP/1.1\nHost: ${SITE}\n…`,
      note: '第二個請求沿用同一條 keep-alive 連線（來源連接埠仍是 51514）。這次 /static/ 不符合，符合的前綴是 /api/ 與 /，最長的是 /api/。那個 location 只有 proxy_pass：nginx 自己不知道這筆商品的價格與庫存，它要把請求交給上游（upstream）。',
      tables: [locations([STATIC_ROW, API_ROW], [1]), conns([DOWN])] },
    { id: 'upstream-req', from: 'nginx', to: 'app', label: 'nginx 轉給 upstream：GET /api/teas/12',
      headers: [request('/api/teas/12', '127.0.0.1:8000', 'HTTP/1.0', [['Connection', 'close']]), tcp(UPSTREAM_PORT, '8000', 'PSH, ACK'), ipv4('127.0.0.1', '127.0.0.1')],
      payload: 'GET /api/teas/12 HTTP/1.0\nHost: 127.0.0.1:8000\nConnection: close\n…（瀏覽器的 User-Agent、Accept 等標頭照樣轉送）',
      note: '現在 nginx 是用戶端：它從 127.0.0.1 的暫時連接埠開一條新的 TCP 連線到 127.0.0.1:8000（交握省略），這是和瀏覽器那條完全獨立的第二條連線，瀏覽器看不到它。只寫 proxy_pass 時，nginx 預設以 HTTP/1.0 轉送、Host 改成 proxy_pass 裡的 127.0.0.1:8000、加上 Connection: close；要保留原本的 Host、加上用戶端位址的設定是 SRV07 的主題。',
      tables: [locations([STATIC_ROW, API_ROW]), conns([DOWN, UP], [1])] },
    { id: 'db-query', from: 'app', to: 'db', label: 'gunicorn 的 worker 查詢資料庫',
      headers: [pg('Query', 'SELECT id, name, price, stock FROM teas WHERE id = 12'), tcp(DB_PORT, '5432', 'PSH, ACK'), ipv4('127.0.0.1', '127.0.0.1')],
      payload: 'SELECT id, name, price, stock FROM teas WHERE id = 12',
      note: 'gunicorn 的一個 sync worker 接下這個請求，執行茶行的 Python 程式（經由 WSGI 介面呼叫）。程式需要資料，就透過另一條連線向 PostgreSQL 查詢。PostgreSQL 說的是自己的協定，不是 HTTP；它也只綁在 127.0.0.1，外面的機器連不到。這段期間這個 worker 一直等著查詢結果，不能處理別的請求。' },
    { id: 'db-rows', from: 'db', to: 'app', label: '資料庫回傳一列資料',
      headers: [pg('RowDescription、DataRow、CommandComplete、ReadyForQuery', '1 列：12、凍頂烏龍、480、7'), tcp('5432', DB_PORT, 'PSH, ACK'), ipv4('127.0.0.1', '127.0.0.1')],
      payload: 'id=12, name=凍頂烏龍, price=480, stock=7',
      note: 'PostgreSQL 依序送回欄位說明、一列資料、命令完成與「可以接受下一個查詢」。程式把這一列組成 JSON。這就是動態內容：回應是在這個請求發生時，依資料庫當下的庫存算出來的。' },
    { id: 'upstream-resp', from: 'app', to: 'nginx', label: 'gunicorn 回應 200（JSON）',
      headers: [response('HTTP/1.0', '200', 'OK', [['Server', 'gunicorn'], ['Content-Type', 'application/json'], ['Content-Length', '54'], ['Connection', 'close']]),
        tcp('8000', UPSTREAM_PORT, 'PSH, ACK'), ipv4('127.0.0.1', '127.0.0.1')],
      payload: 'HTTP/1.0 200 OK\nServer: gunicorn\nContent-Type: application/json\n…\n\n{"id":12,"name":"凍頂烏龍","price":480,"stock":7}',
      note: 'gunicorn 以請求的版本（HTTP/1.0）回應，送完就關閉這條上游連線。nginx 讀到完整的回應標頭，上游的工作就結束了；如果 gunicorn 拒絕連線或在回應前斷線，nginx 會改回 502，如果遲遲沒有回應標頭則是 504（下一個情境）。',
      tables: [locations([STATIC_ROW, API_ROW]), conns([DOWN, ['#2', `127.0.0.1:${UPSTREAM_PORT} → 127.0.0.1:8000`, '已關閉']], [1])] },
    { id: 'api-resp', from: 'nginx', to: 'client', label: '200 OK（JSON）',
      headers: [response('HTTP/1.1', '200', 'OK', [['Server', NGINX], ['Content-Type', 'application/json'], ['Content-Length', '54'], ['Connection', 'keep-alive']]),
        tcp('443', PORT, 'PSH, ACK'), ipv4(WEB_IP, CLIENT_IP)],
      payload: 'HTTP/1.1 200 OK\n…\n\n{"id":12,"name":"凍頂烏龍","price":480,"stock":7}',
      note: 'nginx 把回應交回瀏覽器那條連線，改用 HTTP/1.1 與 keep-alive。上游的 Server 與 Date 標頭預設不轉給用戶端（proxy_hide_header 的預設），所以瀏覽器看到的 Server 是 nginx，完全不知道後面有 gunicorn 與 PostgreSQL。對外只有 nginx 一個入口：TLS、日誌、逾時與連線數都在這裡管理。',
      tables: [locations([STATIC_ROW, API_ROW]), conns([DOWN])] },
  ],
};

const TIMEOUT_LOG = `2026/11/22 10:01:00 [error] 813#813: *57 upstream timed out (110: Connection timed out) while reading response header from upstream, client: ${CLIENT_IP}, server: ${SITE}, request: "GET /api/reports/yearly HTTP/1.1", upstream: "http://127.0.0.1:8000/api/reports/yearly", host: "${SITE}"`;
const TIMER_HEAD = ['計時器', '設定', '狀態'];
const timers = (rows: string[][], changed?: number[]): NodeTable => ({ node: 'nginx', name: 'nginx 的計時器', head: TIMER_HEAD, rows, ...changed ? { changed } : {} });
const READ_WAIT = ['proxy_read_timeout', '60s', '等 upstream 的回應標頭'];
const READ_FIRED = ['proxy_read_timeout', '60s', '已逾時（10:01:00）'];

/** Section 5: a slow upstream; nginx gives up after proxy_read_timeout (504), then closes the idle keep-alive connection. */
const slow: NetworkScene = {
  id: 'srv05-timeout', title: '上游太慢：504 Gateway Time-out 與閒置連線的關閉', model: 'tcp-ip',
  description: `同一個網站，10:00:00 有人要年度報表 /api/reports/yearly。這個查詢要掃過整年的訂單，資料庫要 95 秒才算得完。nginx 的 proxy_read_timeout 是預設的 60 秒，gunicorn 的 --timeout 是 120 秒，keepalive_timeout 是 65 秒。看哪個逾時先發生、使用者看到什麼，以及之後那條閒置的連線怎麼結束。`,
  nodes: [
    { id: 'client', label: '顧客的瀏覽器', kind: 'host', addresses: [`IP ${CLIENT_IP}`] },
    { id: 'nginx', label: 'web-01：nginx', kind: 'server', addresses: [`IP ${WEB_IP}`, 'TCP 443'] },
    { id: 'app', label: 'web-01：gunicorn', kind: 'server', addresses: ['IP 127.0.0.1', 'TCP 8000'] },
    { id: 'db', label: 'web-01：PostgreSQL', kind: 'server', addresses: ['IP 127.0.0.1', 'TCP 5432'] },
  ],
  messages: [
    { id: 'report-req', from: 'client', to: 'nginx', label: 'GET /api/reports/yearly（10:00:00）',
      headers: [request('/api/reports/yearly', SITE, 'HTTP/1.1', [['User-Agent', 'Mozilla/5.0']]), tcp('51530', '443', 'PSH, ACK'), ipv4(CLIENT_IP, WEB_IP)],
      payload: `GET /api/reports/yearly HTTP/1.1\nHost: ${SITE}\n…`,
      note: '請求符合 location /api/，nginx 要把它交給 upstream。用戶端這一側也有計時器：nginx 讀請求標頭與本文時各有 60 秒的 client_header_timeout、client_body_timeout（太慢就回 408），回應送不出去時有 send_timeout。',
      tables: [timers([['client_header_timeout', '60s', '已收到完整的標頭']])] },
    { id: 'report-fwd', from: 'nginx', to: 'app', label: '轉給 upstream（10:00:00）',
      headers: [request('/api/reports/yearly', '127.0.0.1:8000', 'HTTP/1.0', [['Connection', 'close']]), tcp('41902', '8000', 'PSH, ACK'), ipv4('127.0.0.1', '127.0.0.1')],
      payload: 'GET /api/reports/yearly HTTP/1.0\nHost: 127.0.0.1:8000\nConnection: close',
      note: '連上 127.0.0.1:8000 很快（proxy_connect_timeout 預設 60 秒，這裡只花了不到 1 毫秒）。請求送出後，proxy_read_timeout 開始計時：它是兩次讀取之間最多等多久，不是整個請求的總時間，在這裡就是「等回應標頭」等 60 秒。',
      tables: [timers([['client_header_timeout', '60s', '已收到完整的標頭'], ['proxy_connect_timeout', '60s', '已連上'], READ_WAIT], [1, 2])] },
    { id: 'slow-query', from: 'app', to: 'db', label: '年度報表的查詢（要 95 秒）',
      headers: [pg('Query', 'SELECT … FROM orders WHERE created_at >= \'2026-01-01\' GROUP BY …'), tcp('41532', '5432', 'PSH, ACK'), ipv4('127.0.0.1', '127.0.0.1')],
      payload: 'SELECT … FROM orders WHERE created_at >= \'2026-01-01\' GROUP BY …',
      note: 'gunicorn 的 sync worker 送出查詢後就停在那裡等結果，95 秒內這個 worker 不能處理任何其他請求。web-01 只有 3 個 worker，同時有 3 個人要報表時，連最簡單的商品頁也只能在 8000 埠的佇列（backlog）裡排隊。',
      tables: [timers([['proxy_connect_timeout', '60s', '已連上'], READ_WAIT])] },
    { id: 'upstream-close', from: 'nginx', to: 'app', label: 'nginx 放棄等待：FIN（10:01:00）',
      headers: [tcp('41902', '8000', 'FIN, ACK'), ipv4('127.0.0.1', '127.0.0.1')],
      payload: '沒有資料',
      note: '60 秒過去，gunicorn 還沒有送出任何回應標頭，nginx 關閉這條上游連線，並在 error.log 記下 upstream timed out（110 是 Linux 的 ETIMEDOUT）。注意：關閉連線不會取消資料庫裡的查詢，gunicorn 的 worker 仍會等到結果出來、要寫回應時才發現連線已經關了，這 95 秒的工作白做了。',
      tables: [timers([['proxy_connect_timeout', '60s', '已連上'], READ_FIRED], [1]), { node: 'nginx', name: 'nginx 的 error.log', head: ['時間', '紀錄'], rows: [['2026/11/22 10:01:00', TIMEOUT_LOG]], changed: [0] }] },
    { id: 'gateway-timeout', from: 'nginx', to: 'client', label: '504 Gateway Time-out',
      headers: [response('HTTP/1.1', '504', 'Gateway Time-out', [['Server', NGINX], ['Content-Type', 'text/html'], ['Connection', 'keep-alive']]),
        tcp('443', '51530', 'PSH, ACK'), ipv4(WEB_IP, CLIENT_IP)],
      payload: 'HTTP/1.1 504 Gateway Time-out\n…\n\n<html>…<h1>504 Gateway Time-out</h1>…</html>',
      note: '504 是 nginx 自己產生的：身為閘道，它在時限內沒有等到上游的回應。對照 502 Bad Gateway：上游拒絕連線、在回應前斷線或回了無效的回應。如果 gunicorn 的 --timeout 是預設的 30 秒，它會先把沉默的 worker 結束並重啟，nginx 看到連線在回應前被關閉，使用者看到的就是 502，error.log 記的是 upstream prematurely closed connection。哪個逾時先到，決定使用者看到哪個狀態碼。',
      tables: [timers([READ_FIRED, ['keepalive_timeout', '65s', '回應送出，連線開始閒置']], [1])] },
    { id: 'idle-close', from: 'nginx', to: 'client', label: '閒置 65 秒：nginx 關閉連線（10:02:05）',
      headers: [tcp('443', '51530', 'FIN, ACK'), ipv4(WEB_IP, CLIENT_IP)],
      payload: '沒有資料',
      note: '504 之後瀏覽器沒有再送請求。keep-alive 連線閒置超過 keepalive_timeout（這裡設 65 秒，nginx 的預設是 75 秒），nginx 就關閉它，把這個連線名額還給 worker_connections。逾時太長，閒置連線占住名額；太短，使用者每點一頁都要重新做 TCP 與 TLS 交握。',
      tables: [timers([['keepalive_timeout', '65s', '已逾時，連線關閉']], [0])] },
  ],
};

export const SRV05: LessonContent = {
  lessonId: 'SRV05',
  motivation: '潮汐茶行要把網站搬到新主機 web-01。開發時，工程師在筆電上執行一個指令就能看到網站；上線的伺服器卻有好幾個程式各自監聽不同的位址與埠：nginx、gunicorn、PostgreSQL，有的以 root 執行，有的以 www-data 或專屬的帳號執行。同事問：「8000 埠要不要在防火牆打開？」「worker_connections 1024 夠不夠？」「為什麼報表頁有時是 502、有時是 504？」這一課把一個網站的請求在伺服器內部怎麼流動攤開來看：哪些請求網頁伺服器自己處理、哪些交給應用伺服器，誰在哪裡監聽、為什麼，同時能處理多少連線，以及每一段的逾時發生時使用者會看到什麼。',
  sections: [
    {
      id: 'srv05-s-tiers', title: '一個網站的三層：網頁伺服器、應用伺服器與資料庫',
      blocks: [
        { type: 'p', text: '小網站常常只有一台機器，但機器裡通常不只一個伺服器程式。最常見的分工是三層：最前面的網頁伺服器（web server，例如 nginx）面對網際網路；中間的應用伺服器（application server，例如執行 Python 程式的 gunicorn、執行 Node.js 的 node）跑網站的程式碼；最後面是資料庫（例如 PostgreSQL）。三者都是「伺服器」，但職責完全不同：' },
        { type: 'table', head: ['元件', 'web-01 上的程式', '負責', '不負責'], rows: [
          ['網頁伺服器', 'nginx（master 以 root、worker 以 www-data 執行）', '接受大量連線、TLS、解析與檢查 HTTP、直接回應靜態檔案、依路徑把請求交給後端、日誌、連線數與逾時', '商品價格、登入狀態、訂單邏輯：它不知道網站的業務'],
          ['應用伺服器', 'gunicorn 與它的 worker（以 tidetea 執行）', '把 HTTP 請求交給網站的程式（Python 經由 WSGI 介面）、執行業務邏輯、查詢資料庫、產生 HTML 或 JSON', '面對網際網路的大量慢速連線、TLS 憑證、靜態檔案的效率'],
          ['資料庫', 'PostgreSQL（以 postgres 執行）', '保存與查詢資料、交易、權限', '說 HTTP：它用自己的協定，只回答應用程式的查詢'],
        ] },
        { type: 'p', text: '在 ps 裡，三層各自是一組行程。nginx 有一個 master 行程：以 root 執行，負責讀設定、綁定 80 與 443 埠（1024 以下的埠需要特權）、啟動與管理 worker；真正處理連線的是 worker，以設定裡 `user` 指定的 www-data 執行，所以讀檔的權限是 www-data 的。gunicorn 也是 master 加上多個 worker：master 綁定 8000 埠、監督 worker，worker 執行應用程式的程式碼。每一層使用不同的帳號，一層被攻破時，攻擊者拿到的只是那個帳號的權限。' },
        { type: 'example', id: 'srv05-processes' },
        { type: 'callout', tone: 'warning', title: '常見誤解：應用伺服器會說 HTTP，就是網頁伺服器', text: 'gunicorn、Node.js 的 http 模組、Python 的開發伺服器都能直接回應 HTTP，所以常有人把它們直接放在 80 埠對外。它們的設計重點是執行程式碼，不是面對網際網路：gunicorn 的文件明確建議放在代理伺服器後面，因為它的 sync worker 一次只服務一個連線，一個慢速的用戶端就能占住一個 worker。nginx 會先把慢速用戶端的請求完整收下、把回應緩衝起來再慢慢送出，應用伺服器只需要處理已經完整的請求。兩者是分工，不是二選一。' },
      ],
    },
    {
      id: 'srv05-s-static', title: '靜態與動態內容：哪些請求交給 upstream',
      blocks: [
        { type: 'p', text: '靜態與動態內容的分界在「回應是不是事先就存在」。靜態內容是磁碟上的檔案，每個人拿到的位元組都一樣：CSS、JavaScript、圖片、字型、robots.txt。動態內容是每次請求時由程式算出來的：商品的即時庫存、會員的訂單列表、搜尋結果，它需要執行程式碼、通常還要查資料庫。' },
        { type: 'table', head: ['', '靜態內容', '動態內容'], rows: [
          ['例子', '`/static/css/site.css`、`/robots.txt`、商品照片', '`/api/teas/12`、`/account/orders`、`/search?q=烏龍`'],
          ['誰回應', '網頁伺服器直接讀檔（nginx 用 sendfile 讓核心直接把檔案送進 socket）', '網頁伺服器交給應用伺服器，應用伺服器執行程式'],
          ['代價', '幾乎只有磁碟與網路 I/O', '程式碼、資料庫查詢、樣板，每個請求都要算一次'],
          ['快取', '可以放心快取很久（`Cache-Control: max-age=86400`、CDN）', '要看內容：個人資料不能被共用的快取保存'],
        ] },
        { type: 'p', text: 'nginx 用 location 決定每個請求怎麼處理。web-01 上線後的設定有三個 location：`location /static/ { alias /srv/tidetea/static/; }` 從磁碟讀檔；`location /api/ { proxy_pass http://127.0.0.1:8000; }` 把請求交給 gunicorn；`location / { try_files $uri $uri/ =404; }` 在 root（/srv/tidetea/public）找其他檔案。一個路徑同時符合好幾個前綴時，nginx 選最長的那個：`/static/css/site.css` 符合 `/` 與 `/static/`，結果是 `/static/`；`/api/teas/12` 是 `/api/`。' },
        { type: 'p', text: 'nginx 把它轉送請求的對象叫做 upstream（上游）：請求從用戶端往後端「逆流而上」，回應再順流而下回到用戶端，用戶端那一側因此稱為 downstream（下游）。日常說的後端（backend）、上游伺服器、被代理的伺服器（proxied server）指的都是同一件事；nginx 還有一個 `upstream` 區塊，可以把好幾台後端組成一組、輪流分配請求（SRV08）。在下面的情境中，同一條連線上的兩個請求，一個由 nginx 自己回應，一個經過 upstream 與資料庫：' },
        { type: 'example', id: 'srv05-tiers' },
        { type: 'p', text: 'web-01 現在還在建置：nginx 與 gunicorn 都在執行，但 `location /api/` 還是註解，反向代理要到 SRV07 才接上（模擬環境的 proxy_pass 也在那一階才支援）。所以現在對 nginx 要 /api/teas/12 會得到 nginx 自己的 404：它不知道這個路徑，只會在 /srv/tidetea/public 找檔案；同一個路徑直接問 127.0.0.1:8000 的 gunicorn，才拿得到 JSON。這正好讓我們分別觀察兩層。' },
        { type: 'example', id: 'srv05-static' },
        { type: 'callout', tone: 'tip', title: '用回應標頭分辨是哪一層回答的', text: '直接問 nginx 的回應帶著 `Server: nginx/1.24.0 (Ubuntu)` 與 `Connection: keep-alive`；直接問 gunicorn 的是 `Server: gunicorn` 與 `Connection: close`（sync worker 不保留連線）。接上反向代理之後，nginx 預設會把上游的 Server 標頭換成自己的，所以從外面看永遠是 nginx；要知道後端發生什麼，看 nginx 的 access.log 與 error.log，或在伺服器上直接問 127.0.0.1:8000。' },
      ],
    },
    {
      id: 'srv05-s-bind', title: '誰在哪裡監聽：0.0.0.0 與 127.0.0.1',
      blocks: [
        { type: 'p', text: '`sudo ss -tlnp` 一次列出這台機器的分層：每一列是一個監聽中的 TCP socket，Local Address 說明綁在哪個位址與埠，Process 說明是哪個程式。web-01 的結果可以這樣讀：' },
        { type: 'table', head: ['Local Address:Port', '程式', '角色', '誰連得到'], rows: [
          ['`0.0.0.0:80`、`0.0.0.0:443`', 'nginx（master 與兩個 worker 都持有）', '網頁伺服器，唯一的對外入口', '任何能連到這台機器的主機'],
          ['`0.0.0.0:22`', 'sshd', '管理用的 SSH', '任何主機（通常再用防火牆限制來源，SRV09）'],
          ['`127.0.0.1:8000`', 'gunicorn（master 與三個 worker）', '應用伺服器，nginx 的 upstream', '只有這台機器上的程式'],
          ['`127.0.0.1:5432`', 'postgres', '資料庫', '只有這台機器上的程式'],
          ['`127.0.0.53:53`、`127.0.0.54:53`', 'systemd-resolve', '本機的 DNS 解析器（Ubuntu 預設）', '只有這台機器上的程式'],
        ] },
        { type: 'p', text: '綁定 127.0.0.1（迴路位址）表示只接受來自同一台機器的連線：從別台機器、甚至從本機連自己的 203.0.113.20:8000，都會被拒絕（Connection refused）。應用伺服器綁在 127.0.0.1 是刻意的設計：所有外部流量都必須經過 nginx，才會套用 TLS、連線數與逾時的限制、留下日誌，也不會有人繞過 nginx 直接打到應用程式。gunicorn 不指定 `--bind` 時預設就是 127.0.0.1:8000，PostgreSQL 的 `listen_addresses` 預設是 localhost，都是同樣的道理。應用伺服器在另一台機器時，則綁在私有網段的位址，再用防火牆只允許網頁伺服器連入（SRV09）。' },
        { type: 'example', id: 'srv05-listen' },
        { type: 'callout', tone: 'warning', title: '常見錯誤：把應用伺服器的埠開給全世界', text: '測試時連不上，就把 gunicorn 改成 `--bind 0.0.0.0:8000`，或在雲端的安全群組打開 8000 埠。網站看起來「更好連了」，但從此任何人都能繞過 nginx：沒有 TLS、沒有 nginx 的逾時與連線數保護、不會出現在 access.log，應用程式的除錯頁面與管理路徑也直接暴露。連不上時先問「誰應該連它」：答案是 nginx，而 nginx 在同一台機器上，127.0.0.1 就夠了。' },
        { type: 'callout', tone: 'warning', title: '常見誤讀：沒有 sudo 的 ss 看不到 Process', text: '一般使用者執行 `ss -tlnp`，列表照樣出現，但 Process 欄是空的：Linux 只讓你查看自己的行程持有哪些 socket，nginx、gunicorn、postgres 都不是 learner 的。這不代表「沒有程式在監聽」，也不代表程式壞了，加上 sudo 才看得到全部。反過來，`ss -tln` 本來就不印 Process，有沒有 sudo 都一樣。' },
      ],
    },
    {
      id: 'srv05-s-concurrency', title: '並行模型：行程、執行緒與事件迴圈',
      blocks: [
        { type: 'p', text: '伺服器同時有很多連線時，要決定「誰在處理哪一個連線」。常見的行程、執行緒與事件迴圈模型如下（真實的伺服器常常混用，例如多個行程、每個行程裡一個事件迴圈）：' },
        { type: 'table', head: ['模型', '做法', '例子', '優點', '代價'], rows: [
          ['每個請求一個行程', '每個請求（或連線）由一個獨立的行程處理；可以事先準備一池行程（pre-fork）', '早期的 CGI（每個請求啟動一個新程式）、Apache 的 prefork、gunicorn 的 sync worker', '行程互相隔離，一個當掉不影響其他', '每個行程都要記憶體；同時處理的請求數等於行程數'],
          ['執行緒池', '一個行程裡有一池執行緒，每個連線或請求交給一條執行緒', 'Apache 的 worker／event MPM、Java 的 Tomcat、gunicorn 的 gthread worker', '比行程省記憶體，切換較便宜', '執行緒共用記憶體，程式要處理同步問題；同時處理數受池的大小限制'],
          ['事件迴圈', '少數執行緒用非阻塞 I/O 與 epoll 之類的通知機制，一個迴圈輪流推進成千上萬個連線', 'nginx 的 worker、Node.js、Python 的 asyncio（uvicorn）', '閒置與等待中的連線幾乎不花成本，適合大量的 keep-alive 與慢速連線', '任何一段阻塞或耗 CPU 的程式碼，會卡住同一個迴圈上的所有連線'],
        ] },
        { type: 'p', text: 'nginx 是事件驅動的：每個 worker 是單一執行緒的事件迴圈，連線上有資料可讀或可寫時才處理它，等待中的連線只占一點記憶體。所以 nginx 只需要和 CPU 核心數差不多的 worker（`worker_processes auto`），每個 worker 就能同時照顧上千個連線。master 不處理請求，它讀設定、綁定埠，並在 reload 時用新設定啟動新的 worker、讓舊的 worker 處理完手上的連線再結束。' },
        { type: 'p', text: 'gunicorn 預設的 sync worker 是另一種模型：一個 worker 一次只處理一個請求，web-01 的三個 worker 就是最多同時三個請求，第四個要在 8000 埠的佇列（listen backlog）裡等。這對執行 Python 程式碼很合理（程式碼可以照一般的寫法阻塞地查資料庫），但不能讓它直接面對網際網路：一個網路很慢的用戶端就能占住一個 worker 好幾秒。nginx 放在前面，替它收完整個請求、緩衝整個回應，sync worker 的時間就只花在執行程式上。gunicorn 文件建議的 worker 數是（2 × CPU 核心數）＋ 1，web-01 有兩個核心，所以設了 3 以上都合理，數字還要依記憶體與程式的特性調整。' },
        { type: 'callout', tone: 'note', title: '事件迴圈不是比較快，而是比較省', text: '事件迴圈讓「同時開著很多連線」變便宜，但不會讓一個請求算得更快。耗 CPU 的工作（壓縮大檔、產生報表）放在事件迴圈裡反而會拖慢所有人；這類工作適合交給多個行程或背景工作佇列。選並行模型時要問：大部分時間花在等待（網路、磁碟、資料庫）還是計算？' },
      ],
    },
    {
      id: 'srv05-s-limits', title: '連線數與逾時',
      blocks: [
        { type: 'p', text: 'nginx 能同時開著多少連線由兩個設定決定：`worker_processes` 是 worker 的數量（`auto` 等於 CPU 核心數），events 區塊的 `worker_connections` 是每個 worker 最多同時開著的連線數。粗略的上限是兩者相乘：web-01 有 2 個 worker、每個 1024，約 2048 個連線。這是估計值：worker_connections 算的是 worker 開著的「所有」連線，包含 nginx 連到 upstream 的那一條，所以反向代理時每個進行中的動態請求用掉兩個名額；每個連線也是一個檔案描述子，還受到開檔數上限（`worker_rlimit_nofile`、systemd 的 LimitNOFILE）的限制。名額用完時，error.log 出現 `worker_connections are not enough`，新的連線要等或失敗。Ubuntu 套件預設的 worker_connections 是 768。' },
        { type: 'example', id: 'srv05-capacity' },
        { type: 'p', text: '每一段等待都有自己的逾時。逾時太長，壞掉或惡意的連線會一直占著名額；太短，正常但較慢的請求會被中斷。分成三類：' },
        { type: 'table', head: ['哪一段', 'nginx 的設定（預設）', '逾時之後'], rows: [
          ['用戶端送請求', '`client_header_timeout`、`client_body_timeout`（60 秒）', '回 408 Request Time-out 並關閉連線'],
          ['送回應給用戶端', '`send_timeout`（60 秒，兩次寫入之間）', '關閉連線'],
          ['keep-alive 閒置', '`keepalive_timeout`（75 秒；web-01 設 65 秒）', '關閉閒置的連線，名額歸還'],
          ['連上 upstream', '`proxy_connect_timeout`（60 秒）', '504 Gateway Time-out'],
          ['等 upstream 回應', '`proxy_read_timeout`（60 秒，兩次讀取之間）', '504 Gateway Time-out，error.log 記 upstream timed out'],
          ['應用伺服器自己', 'gunicorn 的 `--timeout`（30 秒；web-01 設 120 秒）', 'gunicorn 結束並重啟沉默的 worker；nginx 看到連線中斷，回 502'],
        ] },
        { type: 'p', text: '在這個架構裡，502 與 504 都是 nginx 產生的，意思是「我（閘道）沒能從 upstream 拿到有效的回應」，差別在原因：502 Bad Gateway 是連線被拒絕（gunicorn 沒有執行，`connect() failed (111: Connection refused)`）、上游在回應前關閉連線或回了無效的回應；504 Gateway Time-out 是在時限內等不到（連不上或回應太慢）。兩者都表示請求本身沒有錯，要看的是 nginx 的 error.log 與 upstream 的狀態。下面的情境中，查詢比 nginx 願意等的時間還久：' },
        { type: 'example', id: 'srv05-timeout' },
        { type: 'callout', tone: 'warning', title: '常見錯誤：把逾時一路調大來消除 504', text: '報表頁出現 504，就把 proxy_read_timeout 改成 600 秒。錯誤頁不見了，但每個慢請求現在占住一個 gunicorn worker 十分鐘、nginx 的兩個連線名額十分鐘，三個人同時要報表，整個網站就停了。逾時的設定要一路對齊（nginx 等 upstream 的時間、gunicorn 的 --timeout、資料庫的查詢時限），真正的修法是讓慢工作變快，或改成背景工作，請求只負責送出與查詢進度。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  network: {
    scenes: [tiers, slow],
    exercises: [
      { id: 'srv05-net-location', task: 'table', scene: 'srv05-tiers', message: 'api-req', node: 'nginx', table: 'location 比對', row: '/api/teas/12', column: '符合的 location', title: '動態請求符合哪一個 location',
        statement: '在「靜態與動態請求」情境中，瀏覽器送出 GET /api/teas/12 之後，nginx 的「location 比對」表裡，這個路徑的「符合的 location」是什麼？（只填前綴，例如 /x/）',
        hints: ['設定裡有三個前綴：/static/、/api/、/。哪幾個是 /api/teas/12 的開頭？', '好幾個前綴都符合時，nginx 選最長的那個。'],
        explanation: '/api/teas/12 的開頭同時符合 / 與 /api/，nginx 記住最長的相符前綴 /api/，那個 location 以 proxy_pass 把請求交給 upstream 127.0.0.1:8000。/static/ 不是它的開頭；/ 雖然也符合，但比較短，只有在沒有更長的前綴時才會用到（例如 /robots.txt）。',
        mistakes: [
          { answer: { cell: '/' }, why: '/ 確實是 /api/teas/12 的開頭，但 nginx 在所有相符的前綴中選最長的，/api/ 比 / 長。' },
          { answer: { cell: '/static/' }, why: '/static/ 是 CSS 那個請求的 location；/api/teas/12 的開頭不是 /static/。' },
        ] },
      { id: 'srv05-net-upstream-ip', task: 'field', scene: 'srv05-tiers', message: 'upstream-req', layer: 'network', field: '目的 IP', title: 'nginx 把請求送到哪個位址',
        statement: '同一個情境裡，nginx 把 /api/teas/12 轉給 gunicorn 的那則訊息，IPv4 標頭的「目的 IP」是什麼？',
        hints: ['這則訊息是哪一條連線送的：瀏覽器的那條，還是 nginx 新開的那條？', 'gunicorn 綁定在哪個位址？proxy_pass 寫的是哪裡？'],
        explanation: 'nginx 以用戶端的身分另開一條連線到 proxy_pass 指定的 127.0.0.1:8000，所以目的 IP 是 127.0.0.1，來源也是 127.0.0.1（同一台機器）。203.0.113.20 是 nginx 對外的位址，只出現在瀏覽器那條連線；198.51.100.23 是瀏覽器，upstream 那一段完全不經過它。gunicorn 只綁在 127.0.0.1，就算 nginx 想連 203.0.113.20:8000 也會被拒絕。',
        mistakes: [
          { answer: { value: '203.0.113.20' }, why: '這是 web-01 對外的位址，屬於瀏覽器到 nginx 那條連線；gunicorn 綁在 127.0.0.1，連 203.0.113.20:8000 會被拒絕。' },
          { answer: { value: CLIENT_IP }, why: '這是瀏覽器的位址；nginx 轉送時自己當用戶端，請求的目的地是 upstream，不是送回瀏覽器。' },
        ] },
      { id: 'srv05-net-504', task: 'field', scene: 'srv05-timeout', message: 'gateway-timeout', layer: 'application', field: '狀態碼', title: '上游太慢時使用者看到什麼',
        statement: '在「上游太慢」情境中，nginx 等了 proxy_read_timeout 之後回給瀏覽器的 HTTP 回應，「狀態碼」是多少？',
        hints: ['gunicorn 有沒有拒絕連線或提早斷線？還是只是一直沒有回應？', '這裡哪個逾時最先到：nginx 的 60 秒、gunicorn 的 120 秒，還是查詢的 95 秒？'],
        explanation: 'nginx 連上了 gunicorn，但 60 秒內沒有收到回應標頭，proxy_read_timeout 先到，所以 nginx 回 504 Gateway Time-out，error.log 記 upstream timed out (110: Connection timed out)。502 是上游拒絕連線或在回應前斷線（例如 gunicorn 用預設的 30 秒 --timeout 先把 worker 重啟）；503 通常是服務主動表示暫時無法服務；408 是用戶端送請求太慢。',
        mistakes: [
          { answer: { value: '502' }, why: '502 是連線被拒絕或上游提早關閉；這裡 gunicorn 的 --timeout 是 120 秒，連線一直開著，是 nginx 等到逾時。' },
          { answer: { value: '408' }, why: '408 是 nginx 等「用戶端」送請求逾時；這裡請求早就完整收到，等的是 upstream。' },
          { answer: { value: '500' }, why: '500 是處理請求的程式自己出錯；這個回應是 nginx 身為閘道產生的，原因是上游太慢。' },
        ] },
    ],
  },
  quiz: [
    {
      id: 'srv05-q1', prompt: '在 nginx＋gunicorn＋PostgreSQL 的架構中，哪一件工作最適合由網頁伺服器（nginx）負責？',
      options: ['依會員等級計算商品折扣', '直接從磁碟回應 `/static/css/site.css`，並處理 TLS 與用戶端的逾時', '查詢資料庫裡的庫存', '產生會員的訂單列表 HTML'],
      answer: 1,
      explanation: '靜態檔案、TLS、連線與逾時的管理是網頁伺服器的強項，它不需要知道網站的業務就能做好。計算折扣與產生訂單列表是業務邏輯，屬於應用伺服器執行的程式；查詢庫存也是應用程式透過資料庫連線做的事，nginx 不會說 PostgreSQL 的協定。',
    },
    {
      id: 'srv05-q2', prompt: '`sudo ss -tlnp` 顯示 `127.0.0.1:8000` 由 gunicorn 監聽。從另一台機器執行 `curl http://203.0.113.20:8000/healthz` 會怎樣？',
      options: ['得到 gunicorn 的 `ok`', '得到 nginx 的 404', '得到 502 Bad Gateway', '`curl: (7)`，連線被拒絕'],
      answer: 3,
      explanation: '綁定 127.0.0.1 的 socket 只接受連到 127.0.0.1 的連線，203.0.113.20 的 8000 埠沒有程式，核心回 RST，curl 以錯誤 7 結束。gunicorn 根本收不到這個請求，所以不會回 ok；nginx 只監聽 80 與 443，不會回應 8000 埠；502 是 nginx 當閘道時的回應，這裡沒有經過 nginx。',
    },
    {
      id: 'srv05-q3', prompt: '某台主機的 nginx.conf 有 `worker_processes 4;` 與 `worker_connections 1024;`。nginx 大約能同時開著多少個連線？',
      options: ['約 4096 個', '1024 個', '1028 個', '768 個'],
      answer: 0,
      explanation: '每個 worker 最多 1024 個連線，4 個 worker 約 4 × 1024 = 4096（反向代理時每個動態請求還要用掉一個上游連線，而且受開檔數上限限制，所以是估計值）。1024 只是一個 worker 的上限；把兩個數字相加沒有意義；768 是 Ubuntu 套件預設的 worker_connections，不是這台的設定。',
    },
    {
      id: 'srv05-q4', prompt: '哪一個說法最能描述 nginx 的 worker 處理大量連線的方式？',
      options: ['每個連線啟動一個新的 worker 行程', '每個 worker 裡每個連線一條執行緒', '每個 worker 是單一執行緒的事件迴圈，以非阻塞 I/O 輪流處理許多連線', '所有連線都由 master 行程處理，worker 只負責寫日誌'],
      answer: 2,
      explanation: 'nginx 是事件驅動的：worker 數量通常等於 CPU 核心數，每個 worker 用 epoll 之類的機制只處理有事件的連線，所以一個 worker 就能照顧上千個連線。為每個連線開行程是 prefork 或 CGI 的模型；每個連線一條執行緒是執行緒模型；master 只負責讀設定、綁定埠與管理 worker，不處理請求。',
    },
    {
      id: 'srv05-q5', prompt: 'learner 執行 `ss -tlnp`（沒有 sudo），`0.0.0.0:80` 那一列的 Process 欄是空的。正確的解讀是什麼？',
      options: ['80 埠其實沒有程式在監聽', '持有 socket 的行程不是 learner 的，一般使用者看不到；加上 sudo 才會列出 nginx', 'nginx 當掉了，只剩 socket', '80 埠是 UDP，ss 不顯示程式'],
      answer: 1,
      explanation: '只要這一列出現在 -l 的列表中，就有程式在監聽；Process 欄只列出執行者能查看的行程，nginx 的行程屬於 root 與 www-data，所以 learner 看不到，`sudo ss -tlnp` 才列出 master 與 worker。socket 隨行程存在，行程結束 socket 就消失；-t 只列 TCP，這一列不是 UDP。',
    },
    {
      id: 'srv05-q6', prompt: 'nginx 已經連上 upstream，但等了 `proxy_read_timeout`（60 秒）仍沒有收到回應標頭。使用者會收到哪個狀態碼？',
      options: ['502 Bad Gateway', '503 Service Unavailable', '500 Internal Server Error', '504 Gateway Time-out'],
      answer: 3,
      explanation: '閘道在時限內等不到上游的回應是 504，nginx 的 error.log 記 upstream timed out (110: Connection timed out)。502 是上游拒絕連線、提早斷線或回應無效；503 是暫時無法服務（例如過載或維護）；500 是處理請求的程式本身出錯，不是閘道與上游之間的問題。',
    },
    {
      id: 'srv05-q7', prompt: 'server 區塊裡有 `location / { try_files $uri $uri/ =404; }` 與 `location /static/ { alias /srv/tidetea/static/; }`。請求 `/static/img/logo.png` 由誰處理？',
      options: ['`location /static/`：兩個前綴都符合時 nginx 選最長的，從 /srv/tidetea/static/img/logo.png 讀檔', '`location /`：它寫在後面，後寫的優先', '交給 upstream 的應用伺服器', '兩個 location 都會執行，先 alias 再 try_files'],
      answer: 0,
      explanation: 'nginx 在前綴 location 中選最長的相符者，/static/ 比 / 長，所以由 alias 把 /static/ 換成 /srv/tidetea/static/ 讀檔。前綴的比對和寫的順序無關；這兩個 location 都沒有 proxy_pass，不會交給 upstream；一個請求最後只由一個 location 處理。',
    },
    {
      id: 'srv05-q8', prompt: 'gunicorn 以 `--workers 3` 的 sync worker 執行，三個 worker 都在等一個很慢的資料庫查詢。第四個請求送到 127.0.0.1:8000 時會怎樣？',
      options: ['gunicorn 自動多開一個 worker 處理它', '立刻被拒絕（Connection refused）', '連線在 8000 埠的佇列（listen backlog）裡等，直到有 worker 空出來', 'nginx 改由自己產生回應'],
      answer: 2,
      explanation: 'sync worker 一次只處理一個請求，worker 數量是固定的，所以第四個連線由核心先放在監聽 socket 的佇列裡，等某個 worker 回來 accept。只有沒有程式監聽時才會被拒絕；gunicorn 不會因為忙碌而自動增加 worker；nginx 不知道業務邏輯，只能等 upstream，等太久就回 504。',
    },
  ],
  terminal: {
    machines: [web],
    examples: [
      {
        id: 'srv05-processes', title: '三層各是哪些行程', machine: 'srv05-web',
        description: '用 `ps -o user,pid,ppid,args` 依使用者列出三層：nginx 的 master（root）與兩個 worker（www-data，PPID 是 master）、gunicorn 的 master 與三個 sync worker（tidetea），以及 PostgreSQL（postgres）。gunicorn 的參數裡就寫著它綁定的位址。',
        steps: [
          { command: 'ps -o user,pid,ppid,args -u root,www-data | grep nginx', output: 'root         812       1 nginx: master process /usr/sbin/nginx -g daemon on; master_process on;\nwww-data     813     812 nginx: worker process\nwww-data     814     812 nginx: worker process' },
          { command: 'ps -o user,pid,ppid,args -u tidetea', output: 'USER         PID    PPID COMMAND\ntidetea      900       1 /srv/tidetea/venv/bin/gunicorn --workers 3 --timeout 120 --bind 127.0.0.1:8000 tidetea.wsgi:application\ntidetea      901     900 /srv/tidetea/venv/bin/gunicorn --workers 3 --timeout 120 --bind 127.0.0.1:8000 tidetea.wsgi:application\ntidetea      902     900 /srv/tidetea/venv/bin/gunicorn --workers 3 --timeout 120 --bind 127.0.0.1:8000 tidetea.wsgi:application\ntidetea      903     900 /srv/tidetea/venv/bin/gunicorn --workers 3 --timeout 120 --bind 127.0.0.1:8000 tidetea.wsgi:application' },
          { command: 'ps -o user,pid,args -u postgres', output: 'USER         PID COMMAND\npostgres     700 /usr/lib/postgresql/16/bin/postgres -D /var/lib/postgresql/16/main -c config_file=/etc/postgresql/16/main/postgresql.conf' },
        ],
      },
      {
        id: 'srv05-listen', title: '誰在哪個位址與埠監聽', machine: 'srv05-web',
        description: '沒有 sudo 時 Process 欄是空的；`sudo ss -tlnp` 列出每個 socket 的持有者：nginx 在 0.0.0.0 的 80 與 443，gunicorn 與 PostgreSQL 只在 127.0.0.1。從 127.0.0.1 連 8000 與 5432 都成功，連自己的對外位址 203.0.113.20 則被拒絕。',
        steps: [
          { command: 'ss -tlnp', output: 'State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process\nLISTEN 0      128          0.0.0.0:22        0.0.0.0:*\nLISTEN 0      4096      127.0.0.53:53        0.0.0.0:*\nLISTEN 0      4096      127.0.0.54:53        0.0.0.0:*\nLISTEN 0      511          0.0.0.0:80        0.0.0.0:*\nLISTEN 0      511          0.0.0.0:443       0.0.0.0:*\nLISTEN 0      244        127.0.0.1:5432      0.0.0.0:*\nLISTEN 0      2048       127.0.0.1:8000      0.0.0.0:*' },
          { command: 'sudo ss -tlnp', output: 'State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process\nLISTEN 0      128          0.0.0.0:22        0.0.0.0:*    users:(("sshd",pid=640,fd=3))\nLISTEN 0      4096      127.0.0.53:53        0.0.0.0:*    users:(("systemd-resolve",pid=600,fd=14))\nLISTEN 0      4096      127.0.0.54:53        0.0.0.0:*    users:(("systemd-resolve",pid=600,fd=16))\nLISTEN 0      511          0.0.0.0:80        0.0.0.0:*    users:(("nginx",pid=814,fd=6),("nginx",pid=813,fd=6),("nginx",pid=812,fd=6))\nLISTEN 0      511          0.0.0.0:443       0.0.0.0:*    users:(("nginx",pid=814,fd=7),("nginx",pid=813,fd=7),("nginx",pid=812,fd=7))\nLISTEN 0      244        127.0.0.1:5432      0.0.0.0:*    users:(("postgres",pid=700,fd=6))\nLISTEN 0      2048       127.0.0.1:8000      0.0.0.0:*    users:(("gunicorn",pid=903,fd=5),("gunicorn",pid=902,fd=5),("gunicorn",pid=901,fd=5),("gunicorn",pid=900,fd=5))' },
          { command: 'curl -s http://127.0.0.1:8000/healthz', output: 'ok' },
          { command: `curl http://${WEB_IP}:8000/healthz`, output: 'curl: (7) Failed to connect to 203.0.113.20 port 8000 after 0 ms: Couldn\'t connect to server' },
          { command: 'nc -zv 127.0.0.1 5432', output: 'Connection to 127.0.0.1 5432 port [tcp/postgresql] succeeded!' },
          { command: `nc -zv ${WEB_IP} 5432`, output: 'nc: connect to 203.0.113.20 port 5432 (tcp) failed: Connection refused' },
        ],
      },
      {
        id: 'srv05-static', title: '靜態檔案由 nginx 回應，動態請求要找應用伺服器', machine: 'srv05-web',
        description: '`/static/css/site.css` 由 nginx 從磁碟回應（text/css 與 add_header 加的 Cache-Control）；反向代理還沒接上，nginx 對 /api/teas/12 只能回 404；同一個路徑直接問 gunicorn 才拿到 JSON，回應標頭是 `Server: gunicorn` 與 `Connection: close`。nginx 的 access.log 只記錄經過 nginx 的兩個請求。',
        steps: [
          { command: 'curl -I http://localhost/static/css/site.css', output: 'HTTP/1.1 200 OK\nServer: nginx/1.24.0 (Ubuntu)\nDate: Sun, 22 Nov 2026 10:00:00 GMT\nContent-Type: text/css\nContent-Length: 29\nConnection: keep-alive\nCache-Control: max-age=86400\n' },
          { command: 'curl -I http://localhost/api/teas/12', output: 'HTTP/1.1 404 Not Found\nServer: nginx/1.24.0 (Ubuntu)\nDate: Sun, 22 Nov 2026 10:00:00 GMT\nContent-Type: text/html\nContent-Length: 155\nConnection: keep-alive\n' },
          { command: 'curl -i http://127.0.0.1:8000/api/teas/12', output: 'HTTP/1.1 200 OK\nServer: gunicorn\nDate: Sun, 22 Nov 2026 10:00:00 GMT\nContent-Type: application/json\nContent-Length: 54\nConnection: close\n\n{"id":12,"name":"凍頂烏龍","price":480,"stock":7}' },
          { command: 'sudo tail -n 2 /var/log/nginx/access.log', output: '127.0.0.1 - - [22/Nov/2026:10:00:00 +0000] "HEAD /static/css/site.css HTTP/1.1" 200 0 "-" "curl/8.5.0"\n127.0.0.1 - - [22/Nov/2026:10:00:00 +0000] "HEAD /api/teas/12 HTTP/1.1" 404 0 "-" "curl/8.5.0"' },
        ],
      },
      {
        id: 'srv05-capacity', title: 'worker、連線上限與 keep-alive', machine: 'srv05-web',
        description: '`sudo nginx -T` 印出 nginx 實際讀到的整份設定（含 include 的檔案），從中找出 worker_processes、worker_connections 與 keepalive_timeout；`auto` 時 worker 數等於 CPU 核心數，所以實際數一次執行中的 worker；兩者相乘是粗略的連線上限。最後比較兩層的 keep-alive：nginx 讓兩個請求共用一條連線，gunicorn 的 sync worker 每個回應後都關閉連線。',
        steps: [
          { command: "sudo nginx -T 2>/dev/null | grep -E 'worker_|keepalive'", output: 'worker_processes auto;\n\tworker_connections 1024;\n\tkeepalive_timeout 65;' },
          { command: "pgrep -a -f 'nginx: worker'", output: '813 nginx: worker process\n814 nginx: worker process' },
          { command: 'echo $(( 2 * 1024 ))', output: '2048' },
          { command: "curl -sv http://localhost/ http://localhost/robots.txt 2>&1 | grep -e '^\\*' -e '^< Connection'", output: '*   Trying 127.0.0.1:80...\n* Connected to localhost (127.0.0.1) port 80\n< Connection: keep-alive\n* Connection #0 to host localhost left intact\n* Re-using existing connection with host localhost\n< Connection: keep-alive\n* Connection #0 to host localhost left intact' },
          { command: "curl -sv http://127.0.0.1:8000/healthz http://127.0.0.1:8000/healthz 2>&1 | grep -e '^\\*' -e '^< Connection'", output: '*   Trying 127.0.0.1:8000...\n* Connected to 127.0.0.1 (127.0.0.1) port 8000\n< Connection: close\n* Closing connection\n*   Trying 127.0.0.1:8000...\n* Connected to 127.0.0.1 (127.0.0.1) port 8000\n< Connection: close\n* Closing connection' },
        ],
      },
    ],
    exercises: [
      {
        id: 'srv05-loopback', title: '哪些服務只給本機用', machine: 'srv05-web',
        statement: '資安同事要一份清單：web-01 上哪些 TCP 服務只綁在 127.0.0.1、外面連不到，各是哪個程式。請用 `ss` 列出監聽中的 TCP socket（埠以數字顯示，附上持有它的行程，包含其他使用者的行程），再接上 `grep` 只留下本機位址是 127.0.0.1 的列（不要包含 systemd-resolved 的 127.0.0.53 與 127.0.0.54）。檢查時，你的指令也會在 gunicorn 被改成綁定 0.0.0.0 的 web-01，以及另一台多了 Redis 的主機上重新執行。',
        checks: [{ kind: 'output' }],
        solution: ["sudo ss -tlnp | grep '127.0.0.1:'"],
        variants: [EXPOSED, WITH_REDIS],
        mistakes: [
          { commands: ["ss -tlnp | grep '127.0.0.1:'"], why: '沒有 sudo：postgres 與 gunicorn 都不是 learner 的行程，Process 欄是空的，清單上看不出是哪個程式。' },
          { commands: ["sudo ss -tlnp | grep '127.0.0'"], why: '比對得太寬：127.0.0.53 與 127.0.0.54 的 systemd-resolved 也被選進來了，題目只要綁在 127.0.0.1 的服務。' },
          { commands: ["sudo ss -tlp | grep '127.0.0.1:'"], why: '少了 `-n`：埠被換成 /etc/services 的名稱（127.0.0.1:postgresql），不是題目要的數字格式。' },
          { commands: ["sudo ss -tlnp sport = :8000"], why: '只查了 8000 埠：資料庫的 5432、另一台主機上的 Redis 都漏掉了，而且 gunicorn 改綁 0.0.0.0 時它已經不是只給本機用的服務。' },
        ],
        hints: ['`-t` TCP、`-l` 監聽中、`-n` 數字、`-p` 行程；要看到別人的行程得加 sudo。', '`grep \'127.0.0.1:\'` 連冒號一起比對，就不會選到 127.0.0.53。'],
        explanation: '`sudo ss -tlnp` 列出所有監聽中的 TCP socket 與持有者，grep 留下本機位址是 127.0.0.1 的列：原本是 PostgreSQL 的 5432 與 gunicorn 的 8000（master 與三個 worker 都持有那個 socket）。gunicorn 被改成 0.0.0.0 時，清單只剩 PostgreSQL：8000 埠變成任何主機都連得到，這正是應該在檢查中被抓出來的設定錯誤。另一台主機上多了 Redis 的 6379，它也只給本機的應用程式使用。',
      },
      {
        id: 'srv05-max-connections', title: '估計 nginx 的連線上限', machine: 'srv05-web',
        statement: '請用一行指令印出 web-01 上 nginx 粗略的同時連線上限：執行中的 worker 行程數 × nginx.conf 裡的 worker_connections，只印出那個數字。注意 worker_processes 可能寫成 `auto`，所以 worker 數請數執行中的 `nginx: worker process`，不要數 master。檢查時，你的指令也會在 nginx.conf 設定不同（worker 數與 worker_connections 都不同）的主機上重新執行，直接打出數字無法通過。',
        checks: [{ kind: 'output' }],
        solution: ["echo $(( $(pgrep -f 'nginx: worker' | wc -l) * $(grep worker_connections /etc/nginx/nginx.conf | cut -d' ' -f2 | tr -d ';') ))"],
        variants: [FOUR_WORKERS, ONE_WORKER],
        mistakes: [
          { commands: ["echo $(( $(pgrep nginx | wc -l) * $(grep worker_connections /etc/nginx/nginx.conf | cut -d' ' -f2 | tr -d ';') ))"], why: '`pgrep nginx` 連 master 也算進去了（3 個而不是 2 個）；master 不處理連線，上限只看 worker。' },
          { commands: ["w=$(grep worker_processes /etc/nginx/nginx.conf | cut -d' ' -f2 | tr -d ';'); c=$(grep worker_connections /etc/nginx/nginx.conf | cut -d' ' -f2 | tr -d ';'); echo $((w * c))"], why: '直接拿設定裡的 worker_processes：web-01 寫的是 auto，不是數字，算術把它當成沒有設定的變數（0），結果印出 0。auto 的實際數量要看 CPU 核心數，數執行中的 worker 最可靠。' },
          { commands: ["grep worker_connections /etc/nginx/nginx.conf | cut -d' ' -f2 | tr -d ';'"], why: '只印出每個 worker 的上限 1024；整台 nginx 的上限還要乘上 worker 的數量。' },
          { commands: ['echo 2048'], why: '直接打出這台的答案：另一台的 nginx.conf 是 4 個 worker、每個 2048，答案是 8192。' },
        ],
        hints: ["`pgrep -f 'nginx: worker'` 列出每個 worker 的 PID，接上 `wc -l` 就是數量。", "`grep worker_connections /etc/nginx/nginx.conf | cut -d' ' -f2 | tr -d ';'` 取出數字；`$(( a * b ))` 做乘法，`$( … )` 把指令的輸出放進算式。"],
        explanation: 'web-01 的 worker_processes 是 auto，兩個 CPU 核心所以有兩個 worker，worker_connections 1024，上限約 2048；設定成 4 個 worker、每個 2048 的主機約 8192，1 個 worker、512 的主機就是 512。數執行中的 worker 而不是讀設定，是因為 auto 要看 CPU 數，而且改了設定沒有 reload 時，執行中的才是真的。記得這只是粗略的上限：反向代理時每個動態請求還占一個上游連線，開檔數上限也可能先到。',
      },
      {
        id: 'srv05-static-file', title: '讓 nginx 回應新的靜態檔案', machine: 'srv05-web',
        statement: `前端同事說列印用的樣式表已經部署了，但 http://localhost/static/css/print.css 回 404。他把檔案放在應用程式的資料夾 /srv/tidetea/app/static/css/print.css。請依 nginx 的設定（/etc/nginx/sites-available/tidetea）判斷 /static/ 開頭的請求由誰、從哪裡回應，把檔案複製到 nginx 會讀取的位置，讓 print.css 回應 200 與檔案內容，site.css 也照常回應。不要修改 nginx 的設定。`,
        checks: [
          { kind: 'http', url: 'http://localhost/static/css/print.css', status: 200, body: '@media print' },
          { kind: 'http', url: 'http://localhost/static/css/site.css', status: 200, body: 'font-family' },
          { kind: 'unchanged', path: '/etc/nginx' },
        ],
        solution: ['grep -E "location|alias|root" /etc/nginx/sites-available/tidetea', 'sudo cp /srv/tidetea/app/static/css/print.css /srv/tidetea/static/css/'],
        mistakes: [
          { commands: ['sudo mkdir -p /srv/tidetea/public/static/css', 'sudo cp /srv/tidetea/app/static/css/print.css /srv/tidetea/public/static/css/'], why: '照 root（/srv/tidetea/public）推算路徑：但 /static/ 的請求符合 location /static/，那裡的 alias 把路徑換成 /srv/tidetea/static/，root 不會被用到，所以仍是 404。' },
          { commands: ['sudo cp /srv/tidetea/app/static/css/print.css /srv/tidetea/static/'], why: '少了一層 css/：/static/css/print.css 經過 alias 對應到 /srv/tidetea/static/css/print.css，放在 /srv/tidetea/static/print.css 的網址是 /static/print.css。' },
          { commands: ['cp /srv/tidetea/app/static/css/print.css /srv/tidetea/static/css/'], why: '沒有 sudo：/srv/tidetea/static/css 屬於 tidetea，learner 不能寫入，cp 回報 Permission denied，檔案沒有複製過去。' },
          { commands: ['curl -s http://127.0.0.1:8000/static/css/print.css'], why: '以為靜態檔案也是應用伺服器回應的：/static/ 由 nginx 直接讀磁碟，不會交給 gunicorn；問 gunicorn 也不會讓 nginx 找到檔案。' },
        ],
        hints: ['在設定裡找出符合 /static/css/print.css 的 location：/static/ 與 / 都符合時，nginx 用哪一個？', 'alias 把 location 的前綴 /static/ 換成 /srv/tidetea/static/，剩下的 css/print.css 照接在後面。'],
        explanation: '/static/css/print.css 符合 location /static/（比 / 長），那裡的 `alias /srv/tidetea/static/;` 把前綴換掉，所以 nginx 以 www-data 讀取 /srv/tidetea/static/css/print.css。應用程式資料夾裡的檔案 nginx 完全不會去找，/static/ 的請求也從來不會交給 gunicorn：這就是「靜態檔案由網頁伺服器直接回應」。用 sudo 複製後檔案屬於 root、權限 644，www-data 可以讀，於是回 200。nginx 回 404 時，error.log 會寫出它試著打開的完整路徑（open() "/srv/tidetea/static/css/print.css" failed），是最快的判斷方法。',
      },
    ],
  },
};
