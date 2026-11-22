import type { NetworkScene, NodeTable, ProtocolHeader } from '@/lib/network/model';
import type { TerminalFile, TerminalMachine, TerminalRemote, TerminalVariant } from '@/lib/terminal/lesson';
import type { TerminalCertificate } from '@/lib/terminal/web-lesson';
import type { LessonContent } from '../schema';

/*
 * SRV07 Reverse proxies (SRV-3, network-sequence). A terminal lesson on the proxy profile (engine stage E15) beside one
 * network-protocol scene. The terminal part: what a reverse proxy does (one public entry, TLS termination, routing by
 * path and host, hiding the backends) against a forward proxy; proxy_pass and nginx's URI rules with and without a URI
 * part, worked on a lab server that proxies to an echo service (the trailing-slash pitfalls /v1orders, //orders and
 * /api/api/orders); what the application sees without forwarding headers (127.0.0.1, http, Host 127.0.0.1:3000,
 * HTTP/1.0 and Connection: close) and with Host, X-Real-IP, X-Forwarded-For ($proxy_add_x_forwarded_for) and
 * X-Forwarded-Proto, which X-Forwarded-For entry to trust, and proxy_set_header's inheritance; path routing of one site
 * to a local shop, an orders API on another host, a report service and a WebSocket service; the WebSocket upgrade
 * (proxy_http_version 1.1, Upgrade and Connection; 101 against 426); proxy_connect_timeout and proxy_read_timeout, and
 * 502 against 504 read from nginx's error log. The network part: one HTTPS request from a laptop through nginx (TLS
 * terminated) to the shop on 127.0.0.1:3000, with the headers nginx adds on the second hop. Load balancing (upstream) is
 * SRV08's and is not used. nginx is 1.24.0 as on Ubuntu 24.04. The coffee shop, its host names (.example, RFC 2606) and
 * addresses (RFC 5737, RFC 1918) are made up. Every transcript output was produced by replaying it on the engine.
 */

const dir = (path: string, owner = 'root', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'root', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const link = (path: string, target: string): TerminalFile => ({ path, kind: 'link', mode: 0o777, owner: 'root', target });
/** The command that writes text to a root-owned file: printf's format (newlines as \n, backslashes doubled) piped to sudo tee. */
const tee = (path: string, text: string) => `printf '${text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n')}' | sudo tee ${path}`;

const SITE = 'beanery.example';
const WWW = `www.${SITE}`;
const WEB_IP = '203.0.113.20';
const LAN_IP = '10.0.0.10';
const APP_IP = '10.0.0.21';
const SITE_PATH = '/etc/nginx/sites-available/beanery';
/** Every service's location (and the shared proxy settings) is a file of its own here, included by the 443 server. */
const PARTS = '/etc/nginx/beanery.d';
const SERVER = 'nginx/1.24.0 (Ubuntu)';

/** web-01's /etc/hosts: the shop's names point to `www` (its public address; the forwarding exercise's variants change it). */
const hosts = (www: string) => `127.0.0.1 localhost\n127.0.1.1 web-01\n${www} ${WWW} ${SITE}\n${APP_IP} app-01\n\n::1 localhost ip6-localhost ip6-loopback\nff02::1 ip6-allnodes\nff02::2 ip6-allrouters\n`;

/** The shop's site: 80 redirects to HTTPS; 443 ends TLS, sends / to the shop app and includes the other services' files. */
const SITE_MAIN = `server {
    listen 80;
    server_name ${SITE} ${WWW};
    return 301 https://${WWW}$request_uri;
}

server {
    listen 443 ssl;
    server_name ${WWW};
    ssl_certificate /etc/ssl/beanery/fullchain.pem;
    ssl_certificate_key /etc/ssl/beanery/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
    }

    include ${PARTS}/*.conf;
}
`;
/** A practice server on 127.0.0.1:8080: six ways to write proxy_pass, all to an echo service on 9000. */
const LAB = `server {
    listen 127.0.0.1:8080;
    location /a/ { proxy_pass http://127.0.0.1:9000; }
    location /b/ { proxy_pass http://127.0.0.1:9000/; }
    location /c/ { proxy_pass http://127.0.0.1:9000/v1/; }
    location /d/ { proxy_pass http://127.0.0.1:9000/v1; }
    location /e { proxy_pass http://127.0.0.1:9000/; }
    location / { proxy_pass http://127.0.0.1:9000/api/; }
}
`;
/** A location block with these directives (one per line). */
const block = (location: string, lines: string[]) => `location ${location} {\n${lines.map(l => `    ${l}\n`).join('')}}\n`;
const UPGRADE = ['proxy_http_version 1.1;', 'proxy_set_header Upgrade $http_upgrade;', 'proxy_set_header Connection "upgrade";'];
const ws = (lines: string[]) => block('/ws/', ['proxy_pass http://127.0.0.1:3001;', ...lines]);
const api = (location = '/api/', target = 'http://app-01:8080/') => block(location, [`proxy_pass ${target};`]);
const HEADER_LINES = ['proxy_set_header Host $host;', 'proxy_set_header X-Real-IP $remote_addr;', 'proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;', 'proxy_set_header X-Forwarded-Proto $scheme;'];
const FORWARDED_CONF = `${HEADER_LINES.join('\n')}\n`;
const exportConf = (directive: string) => block('/api/export/', ['proxy_pass http://app-01:8080/export/;', directive]);

const ORDERS = '{"orders":[{"id":1042,"item":"耶加雪菲 250g","status":"paid"},{"id":1043,"item":"曼特寧 500g","status":"shipped"}]}\n';
/** app-01 on the private network: the orders API (gunicorn), with a slow search (a bug) and a slow yearly export (by design). */
const ordersApp = (orders: string): TerminalRemote => ({
  host: 'app-01', address: APP_IP, hostKey: 'srv07-app-01', files: [],
  accounts: { users: [{ name: 'orders', uid: 998, home: '/opt/orders', shell: '/usr/sbin/nologin' }] },
  processes: [{ pid: 910, user: 'orders', command: '/opt/orders/venv/bin/python3 /opt/orders/venv/bin/gunicorn -b 0.0.0.0:8080 orders:app', stat: 'Ss', listen: [{ port: 8080, fd: 5, http: 'orders' }] }],
  responders: [{ id: 'orders', server: 'gunicorn', routes: [
    { path: '/orders', body: orders, type: 'application/json' },
    { path: '/orders/search', delay: 70, body: '{"orders":[]}\n', type: 'application/json' },
    { path: '/export/*', delay: 90, body: 'id,item,status\n1042,耶加雪菲 250g,paid\n1043,曼特寧 500g,shipped\n', type: 'text/csv' },
    { path: '/whoami', echo: true },
    { path: '/*', status: 404, body: '{"error":"not found"}\n', type: 'application/json' },
  ] }],
});

const home = [dir('/home'), dir('/home/learner', 'learner')];
const base = (parts: [string, string][], extra: TerminalFile[] = []): TerminalFile[] => [...home,
  dir('/etc'), file('/etc/hosts', hosts(WEB_IP)),
  dir('/etc/nginx'), dir(PARTS), ...parts.map(([name, text]) => file(`${PARTS}/${name}`, text)),
  dir('/etc/nginx/sites-available'), file(SITE_PATH, SITE_MAIN), file('/etc/nginx/sites-available/proxy-lab', LAB),
  dir('/etc/nginx/sites-enabled'), link('/etc/nginx/sites-enabled/beanery', SITE_PATH), link('/etc/nginx/sites-enabled/proxy-lab', '/etc/nginx/sites-available/proxy-lab'),
  ...extra];
const certificate: TerminalCertificate = {
  id: 'srv07-www', cn: WWW, sans: [WWW, SITE], issuer: 'lets-encrypt-r11', notBefore: '2026-11-01 08:00:00',
  path: '/etc/ssl/beanery/fullchain.pem', chain: ['lets-encrypt-r11'], key: '/etc/ssl/beanery/privkey.pem',
};

/** web-01 the day the shop moved behind nginx: no forwarding headers, no /api/, /ws/ without the upgrade. */
const fresh: TerminalMachine = {
  id: 'srv07-fresh', title: 'web-01（商店剛搬到 nginx 後面）', user: 'learner', cwd: '/home/learner', host: 'web-01', profile: 'proxy', nginx: true, address: WEB_IP,
  interfaces: [{ name: 'eth0', address: `${WEB_IP}/24` }, { name: 'eth1', address: `${LAN_IP}/24` }],
  accounts: { users: [{ name: 'beanery', uid: 997, home: '/srv/beanery', shell: '/usr/sbin/nologin' }], groups: [{ name: 'sudo', members: ['learner'] }] },
  files: base([['ws.conf', ws([])]]),
  certificates: [certificate],
  processes: [
    { pid: 940, user: 'beanery', command: 'node /srv/beanery/shop/server.js', stat: 'Ssl', listen: [{ address: '127.0.0.1', port: 3000, fd: 18, http: 'shop' }] },
    { pid: 941, user: 'beanery', command: 'node /srv/beanery/live/server.js', stat: 'Ssl', listen: [{ address: '127.0.0.1', port: 3001, fd: 18, http: 'live' }] },
    { pid: 960, user: 'learner', command: 'echo-server --listen 127.0.0.1:9000', stat: 'S', listen: [{ address: '127.0.0.1', port: 9000, fd: 3, http: 'echo' }] },
  ],
  responders: [
    { id: 'shop', routes: [{ path: '/whoami', echo: true }, { path: '/', body: '<h1>豆倉咖啡</h1>\n' }, { path: '/*', status: 404, body: 'Not Found\n', type: 'text/plain' }] },
    { id: 'live', routes: [{ path: '/ws/whoami', echo: true }, { path: '/ws/*', websocket: true }] },
    { id: 'echo', routes: [{ path: '/*', echo: true }] },
  ],
  remotes: [ordersApp(ORDERS)],
};

const REPORTS_UNIT = '[Unit]\nDescription=Beanery daily reports\nAfter=network.target\n\n[Service]\nExecStart=/opt/beanery/bin/reports --listen 127.0.0.1:3002\nUser=beanery\n\n[Install]\nWantedBy=multi-user.target\n';
/** web-01 a month later: the full site; the report service died at 03:12 and is not enabled. */
const live: TerminalMachine = {
  ...fresh, id: 'srv07-live', title: 'web-01（上線一個月後）',
  files: base([['api.conf', api()], ['forwarded.conf', FORWARDED_CONF], ['legacy.conf', block('/legacy/', ['proxy_pass http://10.0.0.31:8080/;'])],
    ['reports.conf', block('/reports/', ['proxy_pass http://127.0.0.1:3002/;'])], ['ws.conf', ws(UPGRADE)]], [dir('/etc/systemd'), dir('/etc/systemd/system'), file('/etc/systemd/system/beanery-reports.service', REPORTS_UNIT),
    dir('/opt'), dir('/opt/beanery'), dir('/opt/beanery/bin'), file('/opt/beanery/bin/reports', '#!/usr/bin/env node\n', 'root', 0o755)]),
  services: [{ unit: 'beanery-reports', active: 'failed', since: '2026-11-22 03:12:40', pid: 1210, status: 1 }],
  journal: [
    { time: '2026-11-22 03:12:40', unit: 'beanery-reports', id: 'reports', pid: 1210, priority: 3, message: 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory' },
    { time: '2026-11-22 03:12:40', unit: 'beanery-reports', id: 'systemd', pid: 1, priority: 5, message: 'beanery-reports.service: Main process exited, code=exited, status=1/FAILURE' },
    { time: '2026-11-22 03:12:40', unit: 'beanery-reports', id: 'systemd', pid: 1, priority: 4, message: 'beanery-reports.service: Failed with result \'exit-code\'.' },
  ],
  programs: [{ path: '/opt/beanery/bin/reports', listen: [{ address: '127.0.0.1', port: 3002, fd: 7, http: 'reports' }] }],
  responders: [...fresh.responders!, { id: 'reports', routes: [{ path: '/daily', body: '2026-11-21 訂單 38 筆，營收 NT$21,460\n', type: 'text/plain' }] }],
};

const otherOrders = (orders: string): TerminalVariant => ({ label: '訂單服務裡是另一批訂單', files: [], remotes: [ordersApp(orders)] });
const ORDERS_B = '{"orders":[{"id":2001,"item":"肯亞 AA 250g","status":"paid"}]}\n';
const ORDERS_C = '{"orders":[{"id":3107,"item":"哥倫比亞 1kg","status":"refunded"},{"id":3108,"item":"濾掛 10 入","status":"paid"},{"id":3109,"item":"冷萃包","status":"paid"}]}\n';
const clientAt = (address: string, label: string): TerminalVariant => ({ label, files: [file('/etc/hosts', hosts(address))] });
const OTHER_DAY = (now: string): TerminalVariant => ({ label: `另一個時間（${now}）`, files: [], now });

const API_ORDERS = `curl -s https://${WWW}/api/orders`;
const WHOAMI_CDN = `curl -s -H 'X-Forwarded-For: 192.0.2.44' https://${WWW}/whoami`;
const WS_KEY = 'dGhlIHNhbXBsZSBub25jZQ==';
const UPGRADE_CURL = `curl -si -H 'Upgrade: websocket' -H 'Connection: Upgrade' -H 'Sec-WebSocket-Key: ${WS_KEY}' -H 'Sec-WebSocket-Version: 13' https://${WWW}/ws/orders`;
const reload = ['sudo nginx -t', 'sudo systemctl reload nginx'];
const API_CONF = `${PARTS}/api.conf`, FWD_CONF = `${PARTS}/forwarded.conf`, WS_CONF = `${PARTS}/ws.conf`, EXPORT_CONF = `${PARTS}/export.conf`;

// ---- network scene -----------------------------------------------------------------------------------------------
const CLIENT_IP = '198.51.100.23', PORT = '52210', UP_PORT = '41872';
const ipv4 = (from: string, to: string): ProtocolHeader => ({ layer: 'network', protocol: 'IPv4', fields: [{ name: '來源 IP', value: from }, { name: '目的 IP', value: to }] });
const tcp = (from: string, to: string, flags: string): ProtocolHeader => ({ layer: 'transport', protocol: 'TCP', fields: [
  { name: '來源連接埠', value: from }, { name: '目的連接埠', value: to }, { name: '旗標', value: flags }] });
const sealed = (inside: string): ProtocolHeader => ({ layer: 'application', protocol: 'TLS 1.3', fields: [
  { name: '紀錄類型', value: '23（application_data，加密）' }, { name: '加密的內容', value: inside }] });
const STEPS = 'nginx 的處理過程';
const STEP_HEAD = ['步驟', '依據', '結果'];
const STEP_ROWS = [
  ['TLS 終止', 'ClientHello 的 SNI：www.beanery.example', '用 /etc/ssl/beanery/fullchain.pem 與私鑰完成交握，之後的資料由 nginx 解密'],
  ['server', 'Host: www.beanery.example，連線在 443 埠', 'listen 443 ssl 的 server'],
  ['location', 'URI /whoami', 'location /（唯一相符的前綴）'],
  ['proxy_pass', 'http://127.0.0.1:3000（沒有 URI 部分）', 'URI /whoami 原封不動，以 HTTP/1.0 送到 127.0.0.1:3000'],
];
const steps = (count: number, changed: number[]): NodeTable => ({ node: 'nginx', name: STEPS, head: STEP_HEAD, rows: STEP_ROWS.slice(0, count), changed });
const FORWARDED: [string, string, string][] = [
  ['Host', WWW, '$host：用戶端送來的 Host（不寫時是 $proxy_host，也就是 127.0.0.1:3000）'],
  ['X-Real-IP', CLIENT_IP, '$remote_addr：連到 nginx 的 TCP 連線的來源位址'],
  ['X-Forwarded-For', CLIENT_IP, '$proxy_add_x_forwarded_for：用戶端送來的 X-Forwarded-For 加上 $remote_addr；這次用戶端沒有送，只剩一個位址'],
  ['X-Forwarded-Proto', 'https', '$scheme：用戶端連到 nginx 用的是 https'],
  ['Connection', 'close', 'nginx 的預設：每個請求一條連到後端的新連線'],
];
const ECHO_BODY = ['remote_addr: 127.0.0.1', 'GET /whoami HTTP/1.0', ...FORWARDED.map(([name, value]) => `${name}: ${value}`), 'User-Agent: curl/8.5.0', 'Accept: */*'].join('\n');
const ACCESS = `${CLIENT_IP} - - [22/Nov/2026:10:00:00 +0000] "GET /whoami HTTP/1.1" 200 204 "-" "curl/8.5.0"`;

/** Section 3: one HTTPS request from a laptop through nginx (TLS terminated) to the shop on 127.0.0.1:3000. */
const requestPath: NetworkScene = {
  id: 'srv07-request-path', title: '一個 HTTPS 請求經過反向代理：TLS 在 nginx 結束，標頭在第二段加上', model: 'tcp-ip',
  description: `顧客在自己的筆電（${CLIENT_IP}）執行 \`curl https://${WWW}/whoami\`。名稱指向 web-01 的公開位址 ${WEB_IP}，那裡的 nginx 用上線一個月後的設定：server 層 include 的 forwarded.conf 有四行 proxy_set_header，location / 以 proxy_pass 把請求交給只綁在 127.0.0.1:3000 的商店程式。這個請求走了兩段連線：第一段是筆電到 nginx 的 HTTPS，第二段是 nginx 到應用程式、只在 web-01 裡面的明文 HTTP。表格是 nginx 在 worker 裡面做的判斷與它替第二段加上的標頭。`,
  nodes: [
    { id: 'client', label: '顧客的筆電（curl）', kind: 'host', addresses: [`IP ${CLIENT_IP}`] },
    { id: 'nginx', label: 'web-01 的 nginx（反向代理）', kind: 'server', addresses: [`IP ${WEB_IP}`, 'TCP 80、443'] },
    { id: 'app', label: '商店程式（node）', kind: 'server', addresses: ['IP 127.0.0.1（web-01 的迴路介面）', 'TCP 3000'] },
  ],
  messages: [
    { id: 'tls', from: 'client', to: 'nginx', label: 'TCP 與 TLS 交握（摘要）',
      headers: [{ layer: 'application', protocol: 'TLS 1.3', fields: [{ name: '紀錄類型', value: '22（handshake）' }, { name: '握手訊息', value: 'ClientHello … Finished' }, { name: 'SNI', value: WWW }] },
        tcp(PORT, '443', 'SYN → SYN, ACK → ACK，之後是交握的資料'), ipv4(CLIENT_IP, WEB_IP)],
      payload: 'ClientHello、ServerHello、憑證鏈、Finished（SRV04 的交握，這裡合成一步）',
      note: `筆電連的是 ${WEB_IP}:443，它不知道、也不需要知道後面還有一個應用程式：從外面看，nginx 就是網站。TLS 交握在筆電與 nginx 之間完成，憑證與私鑰只放在 nginx 這台機器上，這就是「TLS 終止」：加密在 nginx 結束，應用程式不必處理憑證、更新與加密的運算。`,
      tables: [steps(1, [0])] },
    { id: 'request', from: 'client', to: 'nginx', label: 'GET /whoami（加密）',
      headers: [sealed('HTTP 請求'), tcp(PORT, '443', 'PSH, ACK'), ipv4(CLIENT_IP, WEB_IP)],
      payload: `（nginx 解密後）\nGET /whoami HTTP/1.1\nHost: ${WWW}\nUser-Agent: curl/8.5.0\nAccept: */*`,
      note: '在網路上只看得到加密的 application_data；nginx 解密之後才看到請求本身，接著做 SRV06 學過的判斷：連線在 443 埠、Host 是 www.beanery.example，選出 listen 443 ssl 的 server；URI /whoami 只符合 location /，那裡寫著 proxy_pass http://127.0.0.1:3000。proxy_pass 在主機與埠後面沒有任何路徑（沒有 URI 部分），所以 URI 原封不動轉出去。',
      tables: [steps(4, [1, 2, 3])] },
    { id: 'upstream', from: 'nginx', to: 'app', label: 'GET /whoami HTTP/1.0（迴路上的明文）',
      headers: [
        { layer: 'application', protocol: 'HTTP/1.0', fields: [{ name: '方法', value: 'GET' }, { name: '路徑', value: '/whoami' }, { name: '版本', value: 'HTTP/1.0' },
          ...FORWARDED.map(([name, value]) => ({ name, value }))] },
        tcp(UP_PORT, '3000', 'SYN → SYN, ACK → ACK，再送出請求'), ipv4('127.0.0.1', '127.0.0.1')],
      payload: `GET /whoami HTTP/1.0\n${FORWARDED.map(([name, value]) => `${name}: ${value}`).join('\n')}\nUser-Agent: curl/8.5.0\nAccept: */*`,
      note: `這是一條全新的 TCP 連線，由 nginx 發起：來源是 127.0.0.1 的一個臨時埠，目的是 127.0.0.1:3000。所以商店程式從 socket 看到的用戶端永遠是 127.0.0.1，從連線本身也看不出顧客用的是 https。顧客的位址、原本的 Host 與 scheme 只能靠 nginx 寫進標頭帶過去，這就是轉送標頭。請求列是 HTTP/1.0、帶著 Connection: close，因為 nginx 預設這樣和後端說話；用戶端的 User-Agent 與 Accept 照樣轉送，接在 proxy_set_header 的標頭後面。`,
      tables: [{ node: 'nginx', name: '轉送標頭', head: ['標頭', '值', '來自哪裡'], rows: FORWARDED.map(r => [...r]), changed: [0, 1, 2, 3, 4] }] },
    { id: 'app-response', from: 'app', to: 'nginx', label: '200 OK（應用程式的回應）',
      headers: [{ layer: 'application', protocol: 'HTTP/1.1', fields: [{ name: '版本', value: 'HTTP/1.1' }, { name: '狀態碼', value: '200' }, { name: '原因片語', value: 'OK' },
        { name: 'Content-Type', value: 'text/plain' }, { name: 'Content-Length', value: '204' }, { name: 'Connection', value: 'close' }] },
        tcp('3000', UP_PORT, 'PSH, ACK，之後 FIN 關閉'), ipv4('127.0.0.1', '127.0.0.1')],
      payload: ECHO_BODY,
      note: '/whoami 是商店程式的除錯頁，把它收到的請求原樣寫回來。remote_addr 是 127.0.0.1，真正的顧客位址只出現在 X-Real-IP 與 X-Forwarded-For 裡。應用程式要用這些標頭，就必須設定成「只相信來自 127.0.0.1 的這些標頭」（例如 Express 的 trust proxy），否則任何人都能自己送一個假的 X-Forwarded-For。回應之後這條連線就關閉了。' },
    { id: 'response', from: 'nginx', to: 'client', label: '200 OK（加密）',
      headers: [sealed('HTTP 回應'), tcp('443', PORT, 'PSH, ACK'), ipv4(WEB_IP, CLIENT_IP)],
      payload: `（加密前）\nHTTP/1.1 200 OK\nServer: ${SERVER}\nDate: Sun, 22 Nov 2026 10:00:00 GMT\nContent-Type: text/plain\nContent-Length: 204\nConnection: keep-alive\n\n（204 位元組的內容）`,
      note: 'nginx 把後端的狀態碼、Content-Type、Content-Length 與內容交給顧客，換上自己的 Server 與 Date，拿掉後端的 Connection，再加密送出；和顧客之間的連線可以繼續用（keep-alive）。存取日誌記下的是 nginx 自己看到的用戶端 198.51.100.23，因為顧客直接連到 nginx。',
      tables: [{ node: 'nginx', name: 'access.log', head: ['行', '紀錄'], rows: [['1', ACCESS]], changed: [0] }] },
  ],
};

export const SRV07: LessonContent = {
  lessonId: 'SRV07',
  motivation: `豆倉咖啡的網路商店原本是一支直接開在 80 埠的 node 程式。生意變好之後，事情多了起來：要上 HTTPS、訂單 API 由另一台主機上的 Python 服務負責、每天的營收報表是第三支程式、即時的訂單看板要用 WebSocket。如果每支程式都自己開一個對外的埠、各自處理憑證，網址會變成一堆埠號，攻擊面也跟著變大。反向代理把這些整合在同一個網域後面：nginx 是唯一對外的入口，在這裡結束 TLS，再依路徑把請求交給 127.0.0.1 或私有網段上的各個服務。代價是應用程式從此看到的用戶端都是 nginx，而一個多餘的斜線就能讓 /api/orders 變成後端的 404。這一課從 proxy_pass 的 URI 規則開始，接著用轉送標頭讓應用拿到顧客真正的 IP 與 https，依路徑把請求分到不同服務，打通 WebSocket，最後從 nginx 的錯誤日誌分辨 502 與 504，並決定該修後端還是該調逾時設定。`,
  sections: [
    {
      id: 'srv07-s-what', title: '反向代理是什麼：和正向代理比一比',
      blocks: [
        { type: 'p', text: '代理（proxy）是站在用戶端與伺服器之間、替其中一方轉送請求的程式。替誰工作，決定了它是正向還是反向：' },
        { type: 'table', head: ['', '正向代理（forward proxy）', '反向代理（reverse proxy）'], rows: [
          ['替誰工作', '用戶端：公司或學校裡上網的人', '伺服器：網站的經營者'],
          ['誰決定要經過它', '用戶端自己設定（瀏覽器的代理設定、`https_proxy` 環境變數）', '網站：DNS 把網站名稱指向它，用戶端通常不知道後面還有誰'],
          ['用戶端連到哪裡', '代理的位址；HTTP 請求寫著完整的目的網址，HTTPS 用 CONNECT 建立通道', '網站的位址；對用戶端來說，它就是網站'],
          ['常見用途', '過濾與稽核上網、快取、讓內網經由一個出口連外', '單一入口、TLS 終止、依路徑或主機分派、藏起後端、快取、負載平衡'],
          ['例子', 'Squid、公司的網頁閘道', 'nginx、HAProxy、雲端的負載平衡器、CDN'],
        ] },
        { type: 'p', text: '反向代理在伺服器這一端做的事，可以整理成四件：' },
        { type: 'list', ordered: true, items: [
          '單一公開入口：只有 nginx 綁在 0.0.0.0:80 與 443，所有服務共用一個網域與一組埠，網址裡不會出現 :3000、:8080。',
          'TLS 終止（TLS termination）：憑證與私鑰只放在 nginx，HTTPS 在這裡解密；後面的程式只說明文的 HTTP，不必各自處理憑證與更新。',
          '依路徑或主機路由：/ 給商店、/api/ 給訂單服務、/ws/ 給即時看板；或依 server_name 把 api.beanery.example 交給另一組後端。',
          '藏起後端：應用程式只綁 127.0.0.1 或私有網段的位址，網際網路連不到它們；nginx 換上自己的 Server 標頭，用戶端看不出後面是 node 還是 gunicorn，也碰不到它們的除錯介面。',
        ] },
        { type: 'p', text: 'web-01 上的商店剛搬到 nginx 後面：80 埠只負責把人導到 https，443 埠的 server 以 `proxy_pass http://127.0.0.1:3000;` 把請求交給商店程式，最後一行 `include /etc/nginx/beanery.d/*.conf;` 載入其他服務的設定：每個服務的 location 一個檔案，加一個服務就是加一個檔案，改一個服務也不必動到整個網站的設定（現在只有即時看板的 ws.conf）。商店程式有一個除錯用的 /whoami，會把它收到的請求原樣寫回來，正好用來看「應用程式眼中的請求」長什麼樣子。下面的紀錄先看誰在監聽哪裡，再從外面與裡面各試一次。' },
        { type: 'example', id: 'srv07-behind' },
        { type: 'p', text: '注意 /whoami 的內容：應用程式看到的 remote_addr 是 127.0.0.1、Host 是 127.0.0.1:3000、請求列是 HTTP/1.0，還多了 Connection: close，沒有任何一行提到 https。這不是錯誤，而是 nginx 的預設：它替這個請求另外開了一條連到後端的連線，Host 預設是 proxy_pass 寫的主機與埠（變數 $proxy_host），通訊協定預設是 HTTP/1.0。後面幾節會一一處理這些差異。直接連 203.0.113.20:3000 則被拒絕：商店程式只綁在 127.0.0.1，外面只能經過 nginx。' },
        { type: 'callout', tone: 'note', title: '模擬環境裡的反向代理', text: '本課的機器、網域與商店都是虛構的（beanery.example），時鐘固定在 2026-11-22 10:00 UTC。nginx 是 Ubuntu 24.04 的 1.24.0，設定由引擎真正解析，proxy_pass 的 URI 規則、送到後端的標頭、WebSocket 的升級、502／504 與錯誤日誌都照 nginx 的行為；後端的程式是模擬的回應者，/whoami 與 echo-server 把收到的請求寫回來，慢的端點以固定的秒數模擬，時鐘不會真的前進。把多台後端組成 upstream 做負載平衡是下一課的主題，本課每個 location 只有一個後端。' },
      ],
    },
    {
      id: 'srv07-s-proxy-pass', title: 'proxy_pass 與 URI 的規則：結尾的斜線很重要',
      blocks: [
        { type: 'p', text: 'proxy_pass 寫在 location 裡，參數是後端的網址：`proxy_pass http://127.0.0.1:3000;`。它最容易出錯的地方是 URI 的處理，而規則只有一條：看主機與埠的後面「有沒有 URI 部分」——連單獨一個 / 也算。' },
        { type: 'table', head: ['proxy_pass 的寫法', '有沒有 URI 部分', '送到後端的 URI'], rows: [
          ['`proxy_pass http://127.0.0.1:9000;`', '沒有', '用戶端送來的 URI 原封不動（含查詢字串與原本的編碼）'],
          ['`proxy_pass http://127.0.0.1:9000/;`', '有（/）', '把符合 location 前綴的那一段換成 /，剩下的接在後面'],
          ['`proxy_pass http://127.0.0.1:9000/v1/;`', '有（/v1/）', '把前綴換成 /v1/'],
        ] },
        { type: 'p', text: '「換掉前綴」是逐字的字串替換：nginx 拿掉 location 比對到的那幾個字元，換成 proxy_pass 的 URI，再接上剩下的部分，中間不會自動補上或刪掉斜線。web-01 上有一個只綁 127.0.0.1:8080 的練習用 server（proxy-lab），六個 location 用六種寫法把請求交給 echo-server，請求都是「前綴加上 orders」。先自己算出後端收到的 URI，再和範例對照：' },
        { type: 'table', head: ['location', 'proxy_pass', '請求', '後端收到', '說明'], rows: [
          ['`/a/`', '`http://127.0.0.1:9000`', '/a/orders', '/a/orders', '沒有 URI 部分，原封不動'],
          ['`/b/`', '`http://127.0.0.1:9000/`', '/b/orders', '/orders', '/b/ 換成 /：最常用的「拿掉前綴」'],
          ['`/c/`', '`http://127.0.0.1:9000/v1/`', '/c/orders', '/v1/orders', '/c/ 換成 /v1/'],
          ['`/d/`', '`http://127.0.0.1:9000/v1`', '/d/orders', '/v1orders', 'proxy_pass 少了結尾的斜線，v1 和 orders 黏在一起'],
          ['`/e`', '`http://127.0.0.1:9000/`', '/e/orders', '//orders', 'location 少了結尾的斜線：/e 換成 /，剩下的 /orders 又帶著一個斜線'],
          ['`/`', '`http://127.0.0.1:9000/api/`', '/api/orders', '/api/api/orders', '前綴 / 換成 /api/，請求裡原本的 api/orders 接在後面，api 重複了'],
        ] },
        { type: 'example', id: 'srv07-uri-rules' },
        { type: 'callout', tone: 'warning', title: '常見誤解：proxy_pass 結尾的斜線只是寫法習慣', text: '`proxy_pass http://app-01:8080;` 和 `proxy_pass http://app-01:8080/;` 只差一個字元，意思卻完全不同：前者把 /api/orders 整個轉給後端，後端多半回 404；後者把 /api/ 換成 /，後端收到 /orders。location 與 proxy_pass 的斜線要成對：location 以 / 結尾，proxy_pass 的 URI 也以 / 結尾。出問題時不要猜，讓後端把收到的請求列印出來（像本課的 echo-server），或看後端自己的存取日誌。' },
        { type: 'p', text: '還有幾條相關的規則。location 是正規表示式（`~`、`~*`）或具名 location（`@app`）時，nginx 無法知道要換掉哪一段，所以 proxy_pass 不能有 URI 部分，`nginx -t` 會說 `"proxy_pass" cannot have URI part in location given by regular expression…`。proxy_pass 寫的主機名稱（例如 app-01）在 nginx 啟動或 reload 時就解析成位址（經由 /etc/hosts 或 DNS），之後 DNS 改了也要 reload 才會換；解析不到時 `nginx -t` 失敗（`host not found in upstream`）。proxy_pass 少了 `http://` 也是錯誤（`invalid URL prefix`）。' },
      ],
    },
    {
      id: 'srv07-s-headers', title: '轉送標頭：讓應用拿到使用者的真實 IP 與 https',
      blocks: [
        { type: 'p', text: '經過反向代理之後，請求其實走了兩段連線：顧客到 nginx，以及 nginx 到應用程式。應用程式只看得到第二段，所以它從 socket 得到的用戶端位址是 nginx（同一台機器時是 127.0.0.1，nginx 在別台時是那台面向後端網段的位址），連線本身也是明文的 http。如果不處理，存取紀錄裡每個人都是 127.0.0.1、依 IP 的限流會把所有顧客當成同一人、應用程式產生的網址與重新導向會變成 http://127.0.0.1:3000/…。解法是讓 nginx 用 proxy_set_header 把第一段的資訊寫進標頭：' },
        { type: 'table', head: ['設定', '後端收到的例子', '意思'], rows: [
          ['`proxy_set_header Host $host;`', 'Host: www.beanery.example', '用戶端要的主機名稱；不寫時是 $proxy_host（127.0.0.1:3000），應用程式依 Host 產生的網址與虛擬主機都會錯'],
          ['`proxy_set_header X-Real-IP $remote_addr;`', 'X-Real-IP: 198.51.100.23', '直接連到 nginx 的那一端的位址，只有一個值'],
          ['`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`', 'X-Forwarded-For: 192.0.2.44, 198.51.100.23', '經過的每一層代理把它看到的用戶端接在後面；$proxy_add_x_forwarded_for 是「用戶端送來的 X-Forwarded-For，加上逗號與 $remote_addr」，用戶端沒送時就是 $remote_addr'],
          ['`proxy_set_header X-Forwarded-Proto $scheme;`', 'X-Forwarded-Proto: https', '用戶端連到 nginx 用的是 http 還是 https，應用程式據此產生 https 的網址、設定 Secure 的 cookie'],
        ] },
        { type: 'p', text: 'X-Forwarded-For 與 X-Forwarded-Proto 是業界慣例，不是正式標準；RFC 7239 定義了把這些資訊放在一起的 Forwarded 標頭（`Forwarded: for=198.51.100.23;proto=https`），但 X-Forwarded-* 仍是最常見的寫法。標頭只是請求的一部分，任何人都能自己送一個 `X-Forwarded-For: 1.2.3.4`，所以應用程式必須分清楚哪些值可信：' },
        { type: 'list', items: [
          'X-Forwarded-For 從右邊讀：最右邊那個是「你信任的最後一個代理」親眼看到的位址，可信；更左邊的值是用戶端或更前面的代理自己寫的，可能是假的。',
          '應用程式只在連線來自自己的代理（這裡是 127.0.0.1）時才採用這些標頭，例如 Express 的 trust proxy 設定；直接連到應用程式的人送來的 X-Forwarded-For 一律忽略。這也是後端要綁 127.0.0.1 的另一個理由。',
          '前面還有 CDN 或負載平衡器時，nginx 自己的 $remote_addr 是它們的位址；nginx 的 realip 模組（`set_real_ip_from` 與 `real_ip_header`）可以在確認來源是可信的代理之後，把 $remote_addr 換成標頭裡的用戶端位址。',
        ] },
        { type: 'p', text: '上線一個月後，這四行放在 /etc/nginx/beanery.d/forwarded.conf，由 443 的 server 以 include 載入，所以它們在 server 層，沒有自己 proxy_set_header 的 location 都會繼承。下面的紀錄比較兩個後端看到的請求：同一台機器上的商店程式，以及私有網段上 app-01 的訂單服務；最後故意送一個 X-Forwarded-For，看它怎麼被接上去。' },
        { type: 'example', id: 'srv07-headers' },
        { type: 'p', text: 'app-01 看到的 remote_addr 是 10.0.0.10：nginx 連到私有網段時，來源是 web-01 在那個網段的位址。nginx 自己的存取日誌記的則是 $remote_addr，因為顧客直接連到 nginx。下面的情境把一個請求走過的兩段連線與每一段的標頭畫出來：' },
        { type: 'example', id: 'srv07-request-path' },
      ],
    },
    {
      id: 'srv07-s-routing', title: '路徑路由：一個網域後面的多個服務',
      blocks: [
        { type: 'p', text: '把多個服務整合在同一個網域，靠的是 SRV06 學過的 location 比對：每個前綴一個 location，各自有自己的 proxy_pass。上線一個月後的 web-01 是這樣分的（括號裡是 /etc/nginx/beanery.d/ 的檔案，另有一個只放轉送標頭的 forwarded.conf）：' },
        { type: 'table', head: ['location', 'proxy_pass', '後端', '/x 這類請求到了後端是'], rows: [
          ['`/`（網站的設定檔）', '`http://127.0.0.1:3000`', '商店程式（node，同一台）', '/x（原封不動）'],
          ['`/api/`（api.conf）', '`http://app-01:8080/`', '訂單服務（gunicorn，私有網段的 app-01）', '/api/orders → /orders'],
          ['`/reports/`（reports.conf）', '`http://127.0.0.1:3002/`', '營收報表（beanery-reports.service）', '/reports/daily → /daily'],
          ['`/ws/`（ws.conf）', '`http://127.0.0.1:3001`', '即時訂單看板（WebSocket）', '/ws/orders（原封不動）'],
          ['`/legacy/`（legacy.conf）', '`http://10.0.0.31:8080/`', '舊的庫存系統（已經關機）', '/legacy/stock → /stock'],
        ] },
        { type: 'p', text: '要不要拿掉前綴，取決於後端怎麼寫路由。訂單服務的路由是 /orders，不知道自己被放在 /api/ 底下，所以用 `/api/` 配 `http://app-01:8080/`；即時看板自己就處理 /ws/ 開頭的路徑，所以 proxy_pass 不寫 URI。拿掉前綴時還要留意後端產生的連結與重新導向：後端回 `Location: http://app-01:8080/orders/7` 時，`proxy_redirect default`（預設就開著）會把它換回 `https://www.beanery.example/api/orders/7`；但寫在 HTML 裡的絕對路徑 /orders/7 nginx 不會改，這種情況要讓後端知道自己的前綴，或乾脆不拿掉前綴。' },
        { type: 'p', text: '除了路徑，也可以依主機名稱路由：另寫一個 `server { listen 443 ssl; server_name api.beanery.example; location / { proxy_pass http://app-01:8080; } }`，讓 api 子網域整個交給訂單服務。依主機分的好處是每個服務有自己的網址根目錄、cookie 的範圍也分開；依路徑分則只需要一張憑證、一個網域，瀏覽器也不會遇到跨來源（CORS）的問題。無論哪一種，後端都只綁 127.0.0.1 或私有網段：web-01 上 3000、3001、3002 都只在迴路介面監聽，app-01 的 8080 雖然綁 0.0.0.0，卻在沒有公開位址的私有網段上，外面只能經過 nginx（再加上 SRV09 的防火牆會更保險）。' },
        { type: 'callout', tone: 'tip', title: '先確認請求進了哪個 location', text: '路徑路由出錯時，先用 `sudo nginx -T` 看實際生效的 location 與 proxy_pass，再看 error.log 或 access.log：nginx 在 error.log 的每一行都寫出它連的 upstream 網址（例如 `upstream: "http://10.0.0.21:8080/orders/search"`），那就是請求最後被送到的地方，一眼就能看出 URI 是不是照你想的被改寫。' },
      ],
    },
    {
      id: 'srv07-s-websocket', title: 'WebSocket 升級：101 與 426',
      blocks: [
        { type: 'p', text: 'WebSocket（RFC 6455）讓瀏覽器與伺服器在一條連線上雙向傳訊息，豆倉的即時訂單看板就靠它。連線一開始是一個普通的 HTTP/1.1 GET，帶著 `Upgrade: websocket`、`Connection: Upgrade` 與 `Sec-WebSocket-Key`；伺服器同意時回 `101 Switching Protocols` 與由 key 算出的 `Sec-WebSocket-Accept`，之後這條 TCP 連線就不再是 HTTP。伺服器只接受 WebSocket 的路徑收到普通請求時，常見的回應是 `426 Upgrade Required`。' },
        { type: 'p', text: '問題在於 Upgrade 與 Connection 是逐跳（hop-by-hop）標頭：它們只描述「這一段連線」，代理本來就不該把它們轉給下一段。nginx 也照這個規則做，而且預設用 HTTP/1.0 連後端，HTTP/1.0 根本沒有升級的機制。所以 /ws/ 的 location 只寫 proxy_pass 時，後端收到的是一個沒有 Upgrade 的 HTTP/1.0 請求，回 426。要讓升級通過，三行缺一不可：' },
        { type: 'table', head: ['設定', '作用', '少了它'], rows: [
          ['`proxy_http_version 1.1;`', '和後端說 HTTP/1.1', '後端收到 HTTP/1.0，不能升級，回 426'],
          ['`proxy_set_header Upgrade $http_upgrade;`', '把用戶端的 Upgrade 標頭（websocket）轉給後端', '後端不知道要升級成什麼，回 426'],
          ['`proxy_set_header Connection "upgrade";`', '告訴後端這一段連線要升級', 'nginx 送的是預設的 Connection: close，回 426'],
        ] },
        { type: 'p', text: 'nginx 的文件另有一種寫法：在 http 層用 `map $http_upgrade $connection_upgrade { default upgrade; \'\' close; }`，再寫 `proxy_set_header Connection $connection_upgrade;`，讓沒有 Upgrade 的普通請求仍然送 close。升級成功之後，nginx 只是在兩條連線之間搬資料；proxy_read_timeout（預設 60 秒）在這裡的意思是「多久沒有收到後端的資料就關閉」，看板如果可能一分鐘都沒有新訂單，就讓後端定期送 ping，或只替 /ws/ 把 proxy_read_timeout 調長。' },
        { type: 'example', id: 'srv07-websocket' },
        { type: 'callout', tone: 'warning', title: '常見誤解：server 層的 proxy_set_header 會加在每個 location 上', text: 'proxy_set_header 和 add_header 一樣：某個 location 只要有一行自己的 proxy_set_header，就完全不繼承上一層的全部 proxy_set_header。上面的 /ws/ 為了升級寫了 Upgrade 與 Connection，於是 server 層的 Host、X-Real-IP、X-Forwarded-For、X-Forwarded-Proto 全都不見了：/ws/whoami 顯示 Host 是 127.0.0.1:3001，也沒有任何轉送標頭。要兩者都有，就在 /ws/ 裡把那四行再寫一次，或把它們放進一個片段（例如 snippets/proxy-headers.conf），在每個 location 都 include。' },
      ],
    },
    {
      id: 'srv07-s-errors', title: '逾時設定與 502、504：從錯誤日誌判斷該修哪裡',
      blocks: [
        { type: 'p', text: 'nginx 連後端時有三個主要的逾時設定，都可以寫在 http、server 或 location 層：' },
        { type: 'table', head: ['設定', '預設', '量的是什麼'], rows: [
          ['`proxy_connect_timeout`', '60s', '和後端建立 TCP 連線最多等多久；nginx 的文件提醒它通常不能超過 75 秒'],
          ['`proxy_read_timeout`', '60s', '兩次從後端讀到資料之間最多等多久（不是整個回應的總時間）；後端在這段時間內一個位元組都沒送，就算逾時'],
          ['`proxy_send_timeout`', '60s', '兩次把請求寫給後端之間最多等多久，上傳大檔案時才會碰到'],
        ] },
        { type: 'p', text: '後端出問題時，nginx 不會把原因告訴用戶端，只回 502 Bad Gateway（後端給了錯誤的回應或根本連不上）或 504 Gateway Time-out（等後端等到逾時），真正的原因寫在 error.log，而且每一行都帶著它連的 upstream 網址：' },
        { type: 'table', head: ['error.log 的訊息', '狀態碼', '意思與下一步'], rows: [
          ['`connect() failed (111: Connection refused) while connecting to upstream`', '502', '那個位址與埠沒有程式在監聽：後端停了、當掉，或 proxy_pass 的埠寫錯。用 `sudo ss -tlnp`、`systemctl status`、`journalctl -u` 找原因，把後端修好'],
          ['`upstream prematurely closed connection while reading response header from upstream`', '502', '連上了，但後端沒回 HTTP 就關閉連線：程式在處理途中當掉，或 proxy_pass 指到不是 HTTP 的服務'],
          ['`upstream timed out (110: Connection timed out) while connecting to upstream`', '504', '連線一直建立不起來：位址沒有機器（關機、位址寫錯）或防火牆把封包丟掉。用 `nc -zv 位址 埠` 確認；調長任何逾時都沒有用'],
          ['`upstream timed out (110: Connection timed out) while reading response header from upstream`', '504', '連上了，請求也送出了，但後端在 proxy_read_timeout 內沒有回應：後端太慢、卡住或在等資料庫'],
        ] },
        { type: 'p', text: '最後一種才和 proxy_read_timeout 有關，而且要分兩種情況。如果這個端點本來就需要很久，例如一年份訂單的 CSV 匯出要跑一分半鐘，就只替那個路徑開一個 location、把 proxy_read_timeout 調到夠用的長度（更好的設計是改成背景工作，完成後再通知或下載）。如果端點本來應該很快、只是變慢了，那是後端的問題，要找出慢的原因（查詢、索引、鎖、外部服務）並修好；在 nginx 加長逾時只會讓每個請求佔著連線更久，顧客等得更久，監控也看不到 504。' },
        { type: 'example', id: 'srv07-errors' },
        { type: 'callout', tone: 'warning', title: '常見誤解：504 就把逾時調大', text: '把整個 server 的 proxy_read_timeout 改成 300s，504 確實會消失，但慢的請求仍然很慢：使用者一樣在等，nginx 與後端的連線被佔住更久，流量一大就把後端的 worker 耗盡，演變成全站變慢。而且「while connecting to upstream」的 504 和 proxy_read_timeout 毫無關係，調了也不會好。先讀 error.log 分清楚是哪一種，再決定修後端、修位址，或只替真的需要長時間的那一個路徑調整逾時。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  network: {
    scenes: [requestPath],
    exercises: [
      { id: 'srv07-net-proto', task: 'field', scene: 'srv07-request-path', message: 'upstream', layer: 'application', field: 'X-Forwarded-Proto', title: '送到應用程式的 X-Forwarded-Proto',
        statement: '在「一個 HTTPS 請求經過反向代理」情境中，nginx 把請求轉給商店程式的那則訊息（GET /whoami HTTP/1.0），HTTP 標頭裡的 X-Forwarded-Proto 是什麼？',
        hints: ['nginx 設定的是 `proxy_set_header X-Forwarded-Proto $scheme;`。', '$scheme 說的是哪一段連線：顧客到 nginx，還是 nginx 到應用程式？'],
        explanation: '$scheme 是用戶端連到 nginx 時用的通訊協定。顧客連的是 https://www.beanery.example/whoami，所以值是 https，即使這一則訊息本身是在迴路上以明文的 HTTP/1.0 傳送。應用程式正是靠這個標頭才知道要產生 https 的網址；沒有它，應用程式只能從自己的連線推斷，得到錯誤的 http。',
        mistakes: [
          { answer: { value: 'http' }, why: 'nginx 到應用程式這一段確實是 http，但 $scheme 記的是顧客到 nginx 那一段，也就是 https；這個標頭存在的目的就是把第一段的資訊帶過來。' },
          { answer: { value: 'HTTP/1.0' }, why: 'HTTP/1.0 是 nginx 和後端說話的版本，寫在請求列；X-Forwarded-Proto 的值是通訊協定的名稱（http 或 https）。' },
        ] },
      { id: 'srv07-net-source', task: 'field', scene: 'srv07-request-path', message: 'upstream', layer: 'network', field: '來源 IP', title: '應用程式從連線看到的來源位址',
        statement: '同一個情境中，nginx 轉給商店程式的那則訊息，IPv4 標頭的「來源 IP」是什麼？（這就是應用程式不看標頭時以為的用戶端）',
        hints: ['這則訊息屬於哪一條 TCP 連線？是誰發起的？', '商店程式只綁在 127.0.0.1:3000，nginx 從哪個位址連過去？'],
        explanation: '這是 nginx 自己發起的新連線，目的是 127.0.0.1:3000，同一台機器上連迴路位址時來源也是 127.0.0.1。顧客的 198.51.100.23 只存在於第一條連線與 nginx 寫的 X-Real-IP、X-Forwarded-For 標頭裡；IP 標頭不會跨過代理，所以應用程式必須讀轉送標頭才知道真正的用戶端。',
        mistakes: [
          { answer: { value: CLIENT_IP }, why: '198.51.100.23 是第一條連線（筆電到 nginx）的來源；反向代理不會轉送 IP 封包，而是自己開一條新的連線，顧客的位址只能放在標頭裡。' },
          { answer: { value: WEB_IP }, why: '203.0.113.20 是 nginx 的公開位址；這條連線的目的是 127.0.0.1，核心會用迴路介面的 127.0.0.1 當來源。' },
        ] },
    ],
  },
  quiz: [
    {
      id: 'srv07-q1', prompt: '下列哪一個描述的是反向代理，而不是正向代理？',
      options: ['公司要求每台電腦的瀏覽器設定代理伺服器，所有上網流量都經過它過濾', '員工在終端機設定 `https_proxy` 環境變數，讓 curl 經由公司的代理連到外面的網站', '網站把網域指向一台 nginx，由它結束 TLS 並把請求交給只綁 127.0.0.1 的應用程式', '學校的代理快取熱門網頁，讓同學重複瀏覽時更快'],
      answer: 2,
      explanation: '反向代理替伺服器工作：網站的 DNS 指向它，用戶端以為它就是網站，它再把請求交給後面的應用程式。另外三個都是正向代理：由用戶端（瀏覽器設定、環境變數）決定要經過它，它替內部的使用者連外、過濾或快取，網站那一端並不知道它的存在。',
    },
    {
      id: 'srv07-q2', prompt: '`location /api/ { proxy_pass http://127.0.0.1:3000/; }`，用戶端請求 `/api/users?id=7`，後端收到的 URI 是什麼？',
      options: ['/users?id=7', '/api/users?id=7', '/api/users', '//users?id=7'],
      answer: 0,
      explanation: 'proxy_pass 有 URI 部分（結尾的 /），nginx 把符合 location 的前綴 /api/ 換成 /，剩下的 users?id=7 接在後面，查詢字串也保留。/api/users?id=7 是沒有 URI 部分時的結果；查詢字串不會被丟掉；//users 是 location 寫成 /api（沒有斜線）時才會出現。',
    },
    {
      id: 'srv07-q3', prompt: '`location /api { proxy_pass http://127.0.0.1:3000/; }`，用戶端請求 `/api/users`，後端收到什麼？',
      options: ['/users', '/api/users', '/apiusers', '//users'],
      answer: 3,
      explanation: 'nginx 逐字替換：location 的前綴是 /api（四個字元），換成 proxy_pass 的 /，剩下的 /users 原樣接上，得到 //users，很多後端會因此回 404。要得到 /users，location 與 proxy_pass 都要以斜線結尾。/api/users 是 proxy_pass 沒有 URI 部分時的結果；/apiusers 這種黏在一起的結果，出現在 proxy_pass 的 URI 少了結尾斜線時（location /api/ 配 proxy_pass http://127.0.0.1:3000/api）。',
    },
    {
      id: 'srv07-q4', prompt: 'nginx 設定了 `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`。一個用戶端從 198.51.100.7 直接連到 nginx，自己在請求裡加了 `X-Forwarded-For: 10.9.8.7`。應用程式收到什麼？哪一個值可以當成用戶端的位址？',
      options: ['只有 198.51.100.7，因為 nginx 會丟掉用戶端送來的 X-Forwarded-For', '「10.9.8.7, 198.51.100.7」，應該相信最右邊的 198.51.100.7', '「10.9.8.7, 198.51.100.7」，應該相信最左邊的 10.9.8.7，因為那是最原始的用戶端', '「198.51.100.7, 10.9.8.7」，應該相信最左邊的值'],
      answer: 1,
      explanation: '$proxy_add_x_forwarded_for 把用戶端送來的值保留，再接上逗號與 $remote_addr，所以是 10.9.8.7, 198.51.100.7。最右邊的值是 nginx（你信任的代理）親眼看到的連線來源；左邊的 10.9.8.7 是用戶端自己寫的，可能是偽造的。nginx 不會丟掉原本的值，新的位址也是接在後面而不是前面。',
    },
    {
      id: 'srv07-q5', prompt: '網站只開放 https，但應用程式登入後總是把使用者重新導向到 `http://www.beanery.example/account`。nginx 最可能少了哪一行？',
      options: ['`proxy_set_header X-Real-IP $remote_addr;`', '`proxy_http_version 1.1;`', '`proxy_set_header X-Forwarded-Proto $scheme;`', '`proxy_read_timeout 120s;`'],
      answer: 2,
      explanation: 'nginx 和應用程式之間是明文的 http，應用程式只能靠 X-Forwarded-Proto 知道顧客用的是 https，少了它就會產生 http 的網址。X-Real-IP 只告訴應用程式用戶端的位址；proxy_http_version 影響和後端說話的 HTTP 版本（WebSocket 需要）；proxy_read_timeout 是等待後端的時間，都和網址的 scheme 無關。',
    },
    {
      id: 'srv07-q6', prompt: '/ws/ 的 location 已經寫了 `proxy_set_header Upgrade $http_upgrade;` 與 `proxy_set_header Connection "upgrade";`，WebSocket 連線仍然得到 426 Upgrade Required。最可能還少了什麼？',
      options: ['`proxy_http_version 1.1;`', '`proxy_set_header Host $host;`', '`proxy_read_timeout 3600s;`', '`listen 443 ssl;` 改成 `listen 443 http2;`'],
      answer: 0,
      explanation: 'nginx 預設用 HTTP/1.0 和後端說話，HTTP/1.0 沒有升級機制，後端因此拒絕並回 426；加上 proxy_http_version 1.1 才完整。Host 影響後端看到的主機名稱，不決定能不能升級；proxy_read_timeout 只影響升級之後閒置多久會被關閉；WebSocket 的升級屬於 HTTP/1.1，和 HTTP/2 無關。',
    },
    {
      id: 'srv07-q7', prompt: '使用者回報 /reports/ 出現 502，error.log 寫著 `connect() failed (111: Connection refused) while connecting to upstream, … upstream: "http://127.0.0.1:3002/daily"`。下一步最該做什麼？',
      options: ['把 proxy_connect_timeout 調到 75s', '執行 `sudo systemctl restart nginx`', '把 proxy_read_timeout 調到 300s', '檢查 127.0.0.1:3002 有沒有程式在監聽（`sudo ss -tlnp`、`systemctl status`），讓後端恢復'],
      answer: 3,
      explanation: 'Connection refused 表示那台機器在，但 3002 埠沒有程式監聽：報表服務停了或當掉，要從後端找原因並讓它恢復。逾時設定與這個錯誤無關，被拒絕是立刻發生的，不是等太久；重新啟動 nginx 不會讓後端的程式出現，還會中斷所有連線。',
    },
    {
      id: 'srv07-q8', prompt: '平常 1 秒內回應的 /api/orders/search 最近開始出現 504，error.log 是 `upstream timed out (110: Connection timed out) while reading response header from upstream`。哪一個做法最恰當？',
      options: ['把整個 server 的 proxy_read_timeout 改成 300s，讓 504 消失', '找出後端變慢的原因（查詢、索引、資料庫）並修好，逾時維持原樣', '把 proxy_connect_timeout 改成 300s', '把 /api/ 的 proxy_pass 改成沒有 URI 部分'],
      answer: 1,
      explanation: '連線建立了，是後端超過 60 秒都沒有回應；本來很快的端點變慢是後端的問題，要找出原因修好。把 proxy_read_timeout 調大只是把慢藏起來，使用者照樣在等，連線還被佔得更久；proxy_connect_timeout 管的是建立連線，這裡早就連上了，而且它通常不能超過 75 秒；改 proxy_pass 的 URI 只會讓路徑錯掉。',
    },
  ],
  terminal: {
    machines: [fresh, live],
    examples: [
      {
        id: 'srv07-behind', title: '商店在 nginx 後面：誰在監聽、應用程式看到什麼', machine: 'srv07-fresh',
        description: 'nginx 是唯一在 0.0.0.0 監聽的程式，商店與即時看板只綁 127.0.0.1；設定裡 80 埠導向 https，443 埠把請求交給 127.0.0.1:3000。從外面看到的是商店的首頁，商店的 /whoami 卻顯示請求來自 127.0.0.1；直接連商店的埠則被拒絕。',
        steps: [
          { command: 'sudo ss -tlnp | grep -e nginx -e node', output: 'LISTEN 0      511          0.0.0.0:80        0.0.0.0:*    users:(("nginx",pid=813,fd=6),("nginx",pid=812,fd=6))\nLISTEN 0      511          0.0.0.0:443       0.0.0.0:*    users:(("nginx",pid=813,fd=7),("nginx",pid=812,fd=7))\nLISTEN 0      4096       127.0.0.1:3000      0.0.0.0:*    users:(("node",pid=940,fd=18))\nLISTEN 0      4096       127.0.0.1:3001      0.0.0.0:*    users:(("node",pid=941,fd=18))\nLISTEN 0      511        127.0.0.1:8080      0.0.0.0:*    users:(("nginx",pid=813,fd=8),("nginx",pid=812,fd=8))' },
          { command: `grep -n -e listen -e location -e proxy_pass -e include ${SITE_PATH}`, output: '2:    listen 80;\n8:    listen 443 ssl;\n13:    location / {\n14:        proxy_pass http://127.0.0.1:3000;\n17:    include /etc/nginx/beanery.d/*.conf;' },
          { command: `cat ${PARTS}/ws.conf`, output: 'location /ws/ {\n    proxy_pass http://127.0.0.1:3001;\n}' },
          { command: `curl -sI http://${SITE}/menu | grep -e HTTP -e Location`, output: 'HTTP/1.1 301 Moved Permanently\nLocation: https://www.beanery.example/menu' },
          { command: `curl -s https://${WWW}/`, output: '<h1>豆倉咖啡</h1>' },
          { command: `curl -s https://${WWW}/whoami`, output: 'remote_addr: 127.0.0.1\nGET /whoami HTTP/1.0\nHost: 127.0.0.1:3000\nConnection: close\nUser-Agent: curl/8.5.0\nAccept: */*' },
          { command: `curl -sS http://${WEB_IP}:3000/`, output: 'curl: (7) Failed to connect to 203.0.113.20 port 3000 after 0 ms: Couldn\'t connect to server' },
        ],
      },
      {
        id: 'srv07-uri-rules', title: '六種 proxy_pass 的寫法，後端各收到什麼', machine: 'srv07-fresh',
        description: '練習用的 proxy-lab 只綁 127.0.0.1:8080，六個 location 把請求交給 echo-server，它把收到的請求列印出來。對每個 location 各送一個請求，只看 echo-server 收到的請求列，結果和課文的表一致。',
        steps: [
          { command: 'cat /etc/nginx/sites-available/proxy-lab', output: 'server {\n    listen 127.0.0.1:8080;\n    location /a/ { proxy_pass http://127.0.0.1:9000; }\n    location /b/ { proxy_pass http://127.0.0.1:9000/; }\n    location /c/ { proxy_pass http://127.0.0.1:9000/v1/; }\n    location /d/ { proxy_pass http://127.0.0.1:9000/v1; }\n    location /e { proxy_pass http://127.0.0.1:9000/; }\n    location / { proxy_pass http://127.0.0.1:9000/api/; }\n}' },
          { command: 'for p in /a/orders /b/orders /c/orders /d/orders /e/orders /api/orders; do printf \'%-12s \' $p; curl -s http://127.0.0.1:8080$p | grep HTTP/; done', output: '/a/orders    GET /a/orders HTTP/1.0\n/b/orders    GET /orders HTTP/1.0\n/c/orders    GET /v1/orders HTTP/1.0\n/d/orders    GET /v1orders HTTP/1.0\n/e/orders    GET //orders HTTP/1.0\n/api/orders  GET /api/api/orders HTTP/1.0' },
        ],
      },
      {
        id: 'srv07-headers', title: '轉送標頭：兩個後端看到的請求', machine: 'srv07-live',
        description: 'server 層的四行 proxy_set_header 讓商店程式與 app-01 的訂單服務都收到原本的 Host、用戶端位址與 https；兩者從連線看到的來源不同（127.0.0.1 與 10.0.0.10）。用戶端自己送的 X-Forwarded-For 被保留，nginx 的位址接在後面；nginx 的存取日誌記的是它自己看到的用戶端。',
        steps: [
          { command: `ls ${PARTS}`, output: 'api.conf  forwarded.conf  legacy.conf  reports.conf  ws.conf' },
          { command: `cat ${PARTS}/forwarded.conf`, output: 'proxy_set_header Host $host;\nproxy_set_header X-Real-IP $remote_addr;\nproxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\nproxy_set_header X-Forwarded-Proto $scheme;' },
          { command: `curl -s https://${WWW}/whoami`, output: 'remote_addr: 127.0.0.1\nGET /whoami HTTP/1.0\nHost: www.beanery.example\nX-Real-IP: 203.0.113.20\nX-Forwarded-For: 203.0.113.20\nX-Forwarded-Proto: https\nConnection: close\nUser-Agent: curl/8.5.0\nAccept: */*' },
          { command: `curl -s https://${WWW}/api/whoami | head -n 2`, output: 'remote_addr: 10.0.0.10\nGET /whoami HTTP/1.0' },
          { command: `curl -s -H 'X-Forwarded-For: 192.0.2.99' https://${WWW}/whoami | grep -e X-Real-IP -e X-Forwarded-For`, output: 'X-Real-IP: 203.0.113.20\nX-Forwarded-For: 192.0.2.99, 203.0.113.20' },
          { command: 'sudo tail -n 1 /var/log/nginx/access.log', output: '203.0.113.20 - - [22/Nov/2026:10:00:00 +0000] "GET /whoami HTTP/1.1" 200 214 "-" "curl/8.5.0"' },
        ],
      },
      {
        id: 'srv07-websocket', title: 'WebSocket 的 101，以及被 /ws/ 蓋掉的轉送標頭', machine: 'srv07-live',
        description: '/ws/ 的 location 有升級需要的三行；帶著 Upgrade 的請求得到 101 Switching Protocols，普通的 GET 由後端回 426。/ws/whoami 顯示這個 location 因為有自己的 proxy_set_header，沒有繼承 server 層的轉送標頭。',
        steps: [
          { command: `cat ${PARTS}/ws.conf`, output: 'location /ws/ {\n    proxy_pass http://127.0.0.1:3001;\n    proxy_http_version 1.1;\n    proxy_set_header Upgrade $http_upgrade;\n    proxy_set_header Connection "upgrade";\n}' },
          { command: UPGRADE_CURL, output: 'HTTP/1.1 101 Switching Protocols\nServer: nginx/1.24.0 (Ubuntu)\nDate: Sun, 22 Nov 2026 10:00:00 GMT\nConnection: upgrade\nUpgrade: websocket\nSec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=\n' },
          { command: `curl -s -o /dev/null -w '%{http_code}\\n' https://${WWW}/ws/orders`, output: '426' },
          { command: `curl -s https://${WWW}/ws/whoami`, output: 'remote_addr: 127.0.0.1\nGET /ws/whoami HTTP/1.1\nConnection: upgrade\nHost: 127.0.0.1:3001\nUser-Agent: curl/8.5.0\nAccept: */*' },
        ],
      },
      {
        id: 'srv07-errors', title: '兩種 504：連不上與等不到', machine: 'srv07-live',
        description: '/legacy/ 指向已經關機的 10.0.0.31，/api/orders/search 是 app-01 上變慢的查詢；兩者都是 504，error.log 卻寫著不同的階段。nc 確認 10.0.0.31 連不上、app-01 的 8080 是好的；curl -m 是用戶端自己的逾時，和 nginx 的 504 不同。',
        steps: [
          { command: `for p in /api/orders /legacy/stock /api/orders/search; do curl -s -o /dev/null -w "%{http_code} $p\\n" https://${WWW}$p; done`, output: '200 /api/orders\n504 /legacy/stock\n504 /api/orders/search' },
          { command: 'sudo tail -n 2 /var/log/nginx/error.log', output: '2026/11/22 10:00:00 [error] 813#813: *2 upstream timed out (110: Connection timed out) while connecting to upstream, client: 203.0.113.20, server: www.beanery.example, request: "GET /legacy/stock HTTP/1.1", upstream: "http://10.0.0.31:8080/stock", host: "www.beanery.example"\n2026/11/22 10:00:00 [error] 813#813: *3 upstream timed out (110: Connection timed out) while reading response header from upstream, client: 203.0.113.20, server: www.beanery.example, request: "GET /api/orders/search HTTP/1.1", upstream: "http://10.0.0.21:8080/orders/search", host: "www.beanery.example"' },
          { command: 'nc -zv 10.0.0.31 8080', output: 'nc: connect to 10.0.0.31 port 8080 (tcp) failed: Connection timed out' },
          { command: 'nc -zv app-01 8080', output: 'Connection to app-01 (10.0.0.21) 8080 port [tcp/http-alt] succeeded!' },
          { command: `curl -sS -m 5 https://${WWW}/api/orders/search`, output: 'curl: (28) Operation timed out after 5000 milliseconds with 0 bytes received' },
        ],
      },
    ],
    exercises: [
      {
        id: 'srv07-api', title: '把訂單 API 放到 /api/ 底下', machine: 'srv07-fresh',
        statement: `訂單服務在私有網段的 app-01（${APP_IP}，/etc/hosts 裡的名稱是 app-01）的 8080 埠，它的路由是 /orders 這類沒有前綴的路徑。443 的 server 會 include ${PARTS}/ 裡所有的 .conf，請在那裡新增 ${PARTS}/api.conf，寫一個 location，讓 https://${WWW}/api/orders 由訂單服務的 /orders 回應（/api/ 底下的其他路徑也一樣拿掉 /api 這段），並在不中斷服務的情況下套用。商店的首頁 / 與 /ws/ 要維持原樣。最後執行 \`${API_ORDERS}\` 印出訂單；檢查時，訂單服務會換成另外兩批資料重新執行你的指令，直接打出答案無法通過。`,
        checks: [
          { kind: 'nginx', test: true },
          { kind: 'http', url: `https://${WWW}/api/orders`, status: 200, body: '"orders"' },
          { kind: 'http', url: `https://${WWW}/api/whoami`, status: 200, body: 'GET /whoami HTTP/1.0' },
          { kind: 'http', url: `https://${WWW}/`, status: 200, body: '豆倉咖啡' },
          { kind: 'output' },
        ],
        solution: [tee(API_CONF, api()), ...reload, API_ORDERS],
        variants: [otherOrders(ORDERS_B), otherOrders(ORDERS_C)],
        mistakes: [
          { commands: [tee(API_CONF, api('/api/', 'http://app-01:8080')), ...reload, API_ORDERS],
            why: 'proxy_pass 沒有 URI 部分，/api/orders 原封不動轉給訂單服務；它只有 /orders 這個路由，回 404 {"error":"not found"}。' },
          { commands: [tee(API_CONF, api('/api', 'http://app-01:8080/')), ...reload, API_ORDERS],
            why: 'location 寫成 /api（少了結尾的斜線）：nginx 把 /api 換成 /，剩下的 /orders 又帶著斜線，後端收到 //orders，一樣是 404。' },
          { commands: [tee(API_CONF, api('/api/', 'http://app-01:8080/orders')), ...reload, API_ORDERS],
            why: '把 /orders 直接寫進 proxy_pass：/api/ 被換成 /orders，請求 /api/orders 變成 /ordersorders，其他路徑也全錯。' },
          { commands: [tee(API_CONF, api()), 'sudo nginx -t', API_ORDERS],
            why: '設定寫對了也測試過，但沒有 reload：執行中的 nginx 沒有 /api/ 的 location，請求落到 location /，由商店程式回 Not Found。' },
        ],
        hints: ['仿照 location / 的寫法，新的 location 前綴是 /api/。', '要把 /api/ 換成 /，proxy_pass 的主機與埠後面要接一個 /。', '先 `sudo nginx -t`，再 `sudo systemctl reload nginx`。'],
        explanation: `正確的寫法是 \`location /api/ { proxy_pass http://app-01:8080/; }\`：proxy_pass 有 URI 部分（/），nginx 把符合 location 的 /api/ 換成 /，/api/orders 變成 /orders，/api/whoami 變成 /whoami（檢查也確認了訂單服務收到的是 GET /whoami）。location 與 proxy_pass 的斜線成對，才不會出現 //orders 或 /ordersorders。app-01 這個名稱在 reload 時由 /etc/hosts 解析成 ${APP_IP}。實際上線時，這個 location 也需要轉送標頭；把它們寫在 server 層，所有沒有自己 proxy_set_header 的 location 都會繼承。`,
      },
      {
        id: 'srv07-forward', title: '讓商店程式看到顧客的位址、主機名稱與 https', machine: 'srv07-fresh',
        statement: `商店程式的 /whoami 顯示它看到的請求：現在 Host 是 127.0.0.1:3000，沒有任何用戶端位址與 https 的資訊。請在 ${PARTS}/ 新增一個設定檔（例如 forwarded.conf，它會被 443 的 server 以 include 載入），讓轉給商店程式的請求帶著原本的 Host、X-Real-IP（直接連到 nginx 的位址）、X-Forwarded-For（保留用戶端送來的值，再接上 nginx 看到的位址）與 X-Forwarded-Proto（用戶端用的通訊協定），並在不中斷服務的情況下套用。商店之後會放在 CDN 後面，CDN 會帶著 X-Forwarded-For，所以最後請執行 \`${WHOAMI_CDN}\`。檢查時，/etc/hosts 會把 ${WWW} 改指向本機的其他位址（像是從不同的地方連進來），直接打出答案無法通過。`,
        checks: [
          { kind: 'nginx', test: true },
          { kind: 'http', url: `https://${WWW}/whoami`, status: 200, body: `Host: ${WWW}` },
          { kind: 'http', url: `https://${WWW}/whoami`, status: 200, body: 'X-Forwarded-Proto: https' },
          { kind: 'output' },
        ],
        solution: [tee(FWD_CONF, FORWARDED_CONF), ...reload, WHOAMI_CDN],
        variants: [clientAt('127.0.0.1', '名稱指向 127.0.0.1（在伺服器上測試）'), clientAt(LAN_IP, `名稱指向私有網段的 ${LAN_IP}`)],
        mistakes: [
          { commands: [tee(FWD_CONF, FORWARDED_CONF.replace('$proxy_add_x_forwarded_for', '$remote_addr')), ...reload, WHOAMI_CDN],
            why: 'X-Forwarded-For 設成 $remote_addr：CDN 送來的 192.0.2.44 被丟掉，只剩 nginx 看到的位址，應用程式不知道請求原本來自哪裡。要用 $proxy_add_x_forwarded_for 把位址接在後面。' },
          { commands: [tee(FWD_CONF, FORWARDED_CONF.replace('proxy_set_header Host $host;\n', '')), ...reload, WHOAMI_CDN],
            why: '少了 Host $host：nginx 送的是預設的 $proxy_host，商店程式看到 Host: 127.0.0.1:3000，依 Host 產生的網址都會指向 127.0.0.1。' },
          { commands: [tee(FWD_CONF, FORWARDED_CONF.replace('$remote_addr', WEB_IP)), ...reload, WHOAMI_CDN],
            why: 'X-Real-IP 寫死成伺服器的公開位址：從公開位址連進來時剛好對，名稱改指向 127.0.0.1 或 10.0.0.10 時就錯了。要用 $remote_addr，讓 nginx 填入每條連線真正的來源。' },
          { commands: [tee(FWD_CONF, FORWARDED_CONF), 'sudo nginx -t', WHOAMI_CDN],
            why: '沒有 reload：執行中的 nginx 仍是舊設定，商店程式看到的 Host 仍是 127.0.0.1:3000，也沒有任何轉送標頭。' },
        ],
        hints: ['四行 `proxy_set_header 名稱 值;`：放在 beanery.d 的新檔案裡就是 server 層（沒有自己 proxy_set_header 的 location 都繼承）。', 'X-Real-IP 用 $remote_addr，X-Forwarded-For 用 $proxy_add_x_forwarded_for，X-Forwarded-Proto 用 $scheme，Host 用 $host。', '改完先 `sudo nginx -t`，再 `sudo systemctl reload nginx`，然後用題目的 curl 確認。'],
        explanation: `四行 proxy_set_header 各補上第一段連線的一項資訊：$host 是用戶端要的主機名稱，$remote_addr 是直接連到 nginx 的位址（隨 /etc/hosts 指向的位址變成 ${WEB_IP}、127.0.0.1 或 ${LAN_IP}），$proxy_add_x_forwarded_for 保留 CDN 送來的 192.0.2.44 再接上 $remote_addr，$scheme 是 https。寫在 server 層時，location / 繼承它們；/ws/ 之後若加上自己的 proxy_set_header（WebSocket 需要），就不再繼承，要在那裡重寫一次。商店程式這一端也要設定成只相信來自 127.0.0.1 的這些標頭，並從 X-Forwarded-For 的右邊開始讀。`,
      },
      {
        id: 'srv07-ws', title: '打通 /ws/ 的 WebSocket', machine: 'srv07-fresh',
        statement: `即時訂單看板在 127.0.0.1:3001，nginx 的 /ws/ 已經把請求轉給它，但瀏覽器的 WebSocket 連線一直失敗。請修改 ${PARTS}/ws.conf 裡的 /ws/ location，讓 WebSocket 的升級可以通過 nginx，並在不中斷服務的情況下套用。完成後執行 \`${UPGRADE_CURL}\`，應該得到 101 Switching Protocols。檢查時會在另外兩個時間重新執行你的指令（回應的 Date 會不同），直接打出答案無法通過。`,
        checks: [
          { kind: 'nginx', test: true },
          { kind: 'http', url: `https://${WWW}/`, status: 200, body: '豆倉咖啡' },
          { kind: 'output' },
        ],
        solution: [tee(WS_CONF, ws(UPGRADE)), ...reload, UPGRADE_CURL],
        variants: [OTHER_DAY('2026-11-23 08:30:00'), OTHER_DAY('2026-12-01 21:15:00')],
        mistakes: [
          { commands: [tee(WS_CONF, ws(UPGRADE.slice(1))), ...reload, UPGRADE_CURL],
            why: '少了 proxy_http_version 1.1：nginx 用預設的 HTTP/1.0 連後端，HTTP/1.0 不能升級，看板回 426 Upgrade Required。' },
          { commands: [tee(WS_CONF, ws(UPGRADE.slice(0, 2))), ...reload, UPGRADE_CURL],
            why: '少了 Connection "upgrade"：Connection 是逐跳標頭，nginx 不轉送用戶端的值，而是送預設的 close，後端看不到升級的要求，回 426。' },
          { commands: [tee(WS_CONF, ws(UPGRADE.slice(0, 1))), ...reload, UPGRADE_CURL],
            why: '只有 proxy_http_version 1.1：Upgrade 與 Connection 都是逐跳標頭，nginx 不會自動轉送，後端收到的是沒有 Upgrade 的普通請求，回 426。' },
          { commands: [tee(WS_CONF, ws(UPGRADE)), 'sudo nginx -t', UPGRADE_CURL],
            why: '設定正確但沒有 reload：執行中的 nginx 仍用舊的 /ws/，結果還是 426。' },
        ],
        hints: ['先用題目的 curl 看看現在的回應：426 是誰回的？', 'Upgrade 與 Connection 是逐跳標頭，nginx 預設不轉送；而且 nginx 預設用 HTTP/1.0 連後端。', '在 /ws/ 裡加上 `proxy_http_version 1.1;`、`proxy_set_header Upgrade $http_upgrade;` 與 `proxy_set_header Connection "upgrade";`。'],
        explanation: 'WebSocket 的升級發生在 HTTP/1.1 上，而 Upgrade 與 Connection 只對一段連線有效。nginx 預設用 HTTP/1.0 連後端、也不轉送這兩個標頭，所以看板收到的是普通請求，回 426。三行設定讓 nginx 用 HTTP/1.1，把用戶端的 Upgrade: websocket 轉過去，並送出 Connection: upgrade；看板同意後回 101 與 Sec-WebSocket-Accept（由 key 加上固定的 GUID 算出），nginx 把它交給用戶端，之後只在兩條連線之間搬資料。若這個 location 也需要轉送標頭，記得它有了自己的 proxy_set_header，就不再繼承 server 層的。',
      },
      {
        id: 'srv07-502-504', title: '一個 502、一個 504：該修後端還是調逾時', machine: 'srv07-live',
        statement: `早上有兩個抱怨：營收報表 https://${WWW}/reports/daily 回 502，會計下載的年度匯出 https://${WWW}/api/export/orders.csv 回 504。請從 nginx 的錯誤日誌判斷原因並修好：502 要讓後端恢復，而且重開機後也要自動啟動；年度匯出在訂單服務上本來就要跑約 90 秒，請只替 /api/export/ 底下的請求把讀取逾時調到 120 秒（轉給 app-01 的 /export/；每個服務的設定都在 ${PARTS}/，443 的 server 會 include 那裡所有的 .conf，其他檔案照舊），並在不中斷服務的情況下套用。另外，/api/orders/search 的變慢是已知的程式問題，已經交給開發團隊；在修好之前它必須維持 60 秒逾時、繼續回 504，讓監控看得到。`,
        checks: [
          { kind: 'nginx', test: true },
          { kind: 'service', unit: 'beanery-reports', active: 'active', enabled: true },
          { kind: 'http', url: `https://${WWW}/reports/daily`, status: 200, body: '訂單 38 筆' },
          { kind: 'http', url: `https://${WWW}/api/export/orders.csv`, status: 200, body: 'id,item,status' },
          { kind: 'http', url: `https://${WWW}/api/orders/search`, status: 504 },
          { kind: 'http', url: `https://${WWW}/api/orders`, status: 200, body: '"orders"' },
        ],
        solution: [
          `curl -s -o /dev/null -w '%{http_code}\\n' https://${WWW}/reports/daily https://${WWW}/api/export/orders.csv`,
          'sudo tail -n 2 /var/log/nginx/error.log',
          'sudo journalctl -u beanery-reports',
          'sudo systemctl enable --now beanery-reports',
          tee(EXPORT_CONF, exportConf('proxy_read_timeout 120s;')),
          ...reload,
          `curl -s https://${WWW}/reports/daily`,
        ],
        mistakes: [
          { commands: ['sudo systemctl restart nginx'],
            why: '重新啟動 nginx 不會讓報表服務出現，也不會讓匯出變快：502 與 504 都還在，還多中斷了一次所有連線。' },
          { commands: ['sudo systemctl start beanery-reports', tee(EXPORT_CONF, exportConf('proxy_read_timeout 120s;')), ...reload],
            why: '報表現在好了，但只用 start 沒有 enable：beanery-reports 不會在開機時啟動，下次重開機 /reports/ 又是 502。' },
          { commands: ['sudo systemctl enable --now beanery-reports', tee(`${PARTS}/timeouts.conf`, 'proxy_read_timeout 120s;\n'), ...reload],
            why: '把 proxy_read_timeout 120s 加在整個 server（beanery.d 裡只有這一行的 timeouts.conf 就在 server 層）：匯出好了，但 /api/orders/search 也不再 504，慢的查詢被藏起來，監控看不到，連線還被佔得更久。只替 /api/export/ 開一個 location 調整。' },
          { commands: ['sudo systemctl enable --now beanery-reports', tee(EXPORT_CONF, exportConf('proxy_connect_timeout 75s;')), ...reload],
            why: '調錯了逾時：error.log 寫的是 while reading response header，連線早就建立了，是等回應等到 proxy_read_timeout 的 60 秒；proxy_connect_timeout 管的是建立連線，匯出仍然 504。' },
        ],
        hints: ['`sudo tail -n 2 /var/log/nginx/error.log`：connect() failed (111) 與 upstream timed out 各代表什麼？', '502 的 upstream 是 127.0.0.1:3002；哪個 systemd 服務應該在那裡？`systemctl status`、`journalctl -u` 看它怎麼了，`enable --now` 同時啟動並設定開機啟動。', '在 beanery.d 新增 export.conf：`location /api/export/ { proxy_pass http://app-01:8080/export/; proxy_read_timeout 120s; }`，比 /api/ 長的前綴會優先，其他路徑不受影響。'],
        explanation: `error.log 的兩行說明了兩種完全不同的問題。/reports/daily 是 connect() failed (111: Connection refused)，upstream 是 127.0.0.1:3002：沒有程式在那裡監聽。journalctl 顯示 beanery-reports 在 03:12 因為記憶體不足結束，而且是 disabled；\`sudo systemctl enable --now beanery-reports\` 讓它現在啟動、開機時也啟動（記憶體不足的原因仍要另外追查，也可以在 unit 加上 Restart=on-failure）。/api/export/orders.csv 是 upstream timed out (110) while reading response header：連上了，但 90 秒的匯出超過預設 60 秒的 proxy_read_timeout。因為這個端點本來就慢，只替它在 beanery.d/export.conf 開一個更長的前綴 location /api/export/，proxy_pass 到 http://app-01:8080/export/ 並把 proxy_read_timeout 設成 120s；server 層的轉送標頭照樣繼承（這個 location 沒有自己的 proxy_set_header）。/api/orders/search 仍走 /api/，60 秒照樣 504，慢的問題留給後端修，而不是用逾時藏起來。`,
      },
    ],
  },
};
