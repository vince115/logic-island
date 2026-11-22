import type { NetworkScene, NodeTable, ProtocolHeader } from '@/lib/network/model';
import type { Route } from '@/lib/terminal/http';
import type { TerminalFile, TerminalMachine, TerminalRemote, TerminalVariant } from '@/lib/terminal/lesson';
import type { LessonContent } from '../schema';

/*
 * SRV03 Observing HTTP with curl (SRV-1, network-sequence). A terminal lesson on the http profile (engine stage E12)
 * beside two network-protocol scenes. The terminal part: curl's output (the body on standard output, -v's * connection,
 * > request and < response lines on standard error), the request line and the Host, User-Agent and Accept headers, the
 * response's status line and Server, Date, Content-Type, Content-Length, Connection, Location and Cache-Control headers,
 * -I (a HEAD request) against -i, -o, -s, -S and -f, curl's own exit codes (6, 7, 28, 22, 47) against HTTP status codes,
 * the classes 2xx–5xx with 200, 201, 204, 301, 302, 304, 400, 401, 403, 404, 405, 500, 502, 503 and 504, -w with
 * %{http_code}, %{url_effective}, %{redirect_url}, %{num_redirects} and %{remote_ip}, redirect chains followed with -L
 * and stopped by --max-redirs, keep-alive and connection reuse (Re-using existing connection, a server that answers
 * Connection: close, two host names on one address), and custom requests: -X, -d, -H, -A, a Host header that picks a
 * virtual host, and --resolve to test a new server before DNS points to it. HTTPS stops at TLS (engine stage E13, the next
 * lessons). The network part: one `curl -L` from the DNS lookup through the TCP handshake, a 302 and a second request on
 * the same connection to the FIN when curl exits, and a 502 from nginx whose upstream refuses the connection. Status codes
 * follow RFC 9110 (nginx's own reason phrases where nginx answers); curl is 8.5.0 as on Ubuntu 24.04. The bookshop, its
 * host names (.example, RFC 2606) and addresses (RFC 5737) are made up. Every transcript output was produced by replaying
 * it on the engine.
 */

const dir = (path: string, owner = 'root', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const SERVER = 'nginx/1.24.0 (Ubuntu)';
const SITE = 'harborbooks.example';
const WWW = `www.${SITE}`;
const STAGING_API = `staging-api.${SITE}`;
const OPS_IP = '198.51.100.10', RESOLVER_IP = '198.51.100.2', WEB01_IP = '203.0.113.20', WEB02_IP = '203.0.113.30', API_IP = '203.0.113.40';

/** The bookshop's zone as the internet's DNS has it: everything still points to web-01; web-02 is not in it yet. */
const ZONE = `$ORIGIN ${SITE}.
$TTL 300
@        IN  SOA  ns1.${SITE}. hostmaster.${SITE}. ( 2026112201 3600 900 1209600 300 )
@        IN  NS   ns1.${SITE}.
ns1      IN  A    198.51.100.53
@        IN  A    ${WEB01_IP}
www      IN  A    ${WEB01_IP}
api      IN  A    ${API_IP}
archive  IN  A    203.0.113.25
staging  IN  A    203.0.113.99
`;

/** nginx (master and one worker) listening on 80 and 443; both sockets answer with the responder `http`. */
const nginx = (pid: number, http: string): TerminalRemote['processes'] => [
  { pid, user: 'root', command: 'nginx: master process /usr/sbin/nginx -g daemon on; master_process on;', stat: 'Ss',
    listen: [{ port: 80, fd: 6, backlog: 511, http }, { port: 443, fd: 7, backlog: 511, http }] },
  { pid: pid + 1, ppid: pid, user: 'www-data', command: 'nginx: worker process', stat: 'S' },
];

/** web-01's routes: the bare domain redirects to www, a redirect chain behind /catalog, and one route per status code. */
const SITE_ROUTES: Route[] = [
  { path: '/', host: SITE, redirect: `http://${WWW}/` },
  { path: '/catalog', host: SITE, redirect: `http://${WWW}/catalog` },
  { path: '/', body: '<h1>港灣書店</h1>\n' },
  { path: '/catalog', redirect: `http://${WWW}/books/` },
  { path: '/books/', status: 302, redirect: `http://${WWW}/books/winter-sale` },
  { path: '/books/winter-sale', body: '<h1>冬季書展：全館 79 折</h1>\n' },
  { path: '/books/42', body: '<h1>《網路的形狀》</h1>\n<p>書號 42，NT$ 420</p>\n', headers: [['Cache-Control', 'max-age=300']] },
  { path: '/healthz', type: 'text/plain', body: 'ok web-01 release 2026.10.7\n' },
  { path: '/admin', status: 401, headers: [['WWW-Authenticate', 'Basic realm="admin"']] },
  { path: '/private/*', status: 403 },
  { path: '/report', status: 500 },
  { path: '/api/stock', status: 502 },
  { path: '/checkout', status: 503, headers: [['Retry-After', '120']] },
  { path: '/search', status: 504 },
  { path: '/feedback', methods: ['POST'], status: 201, type: 'text/plain', body: 'thanks\n', headers: [['Location', `http://${WWW}/feedback/731`]] },
];
/** The same routes with some replaced (by path and host) or added at the end, for the exercises' variants. */
const withRoutes = (changes: Route[]): Route[] => [
  ...SITE_ROUTES.map(r => changes.find(c => c.path === r.path && c.host === r.host) ?? r),
  ...changes.filter(c => !SITE_ROUTES.some(r => r.path === c.path && r.host === c.host)),
];
const web01 = (routes = SITE_ROUTES): TerminalRemote => ({
  host: 'web-01', title: '正式網站 web-01', address: WEB01_IP, hostKey: 'srv03-web-01', files: [], processes: nginx(812, 'site'),
  responders: [{ id: 'site', server: SERVER, routes }],
});
/** web-02, the new server: only the www virtual host is configured; DNS does not point to it yet. */
const web02 = (health: Route = { path: '/healthz', host: WWW, type: 'text/plain', body: 'ok web-02 release 2026.11.3\n' }): TerminalRemote => ({
  host: 'web-02', title: '新主機 web-02（還沒切換 DNS）', address: WEB02_IP, hostKey: 'srv03-web-02', files: [], processes: nginx(912, 'site'),
  responders: [{ id: 'site', server: SERVER, routes: [health, { path: '/', host: WWW, body: '<h1>港灣書店</h1>\n' }] }],
});
const CANCELLED_STAGING: Route = { path: '/v1/orders/1042/cancel', host: STAGING_API, methods: ['POST'], type: 'application/json', body: '{"order":1042,"status":"cancelled","env":"staging"}\n' };
/** api-01: the production API and the staging API as two virtual hosts of one nginx; only api. is in DNS. */
const api01 = (cancel = CANCELLED_STAGING): TerminalRemote => ({
  host: 'api-01', title: '訂單 API api-01', address: API_IP, hostKey: 'srv03-api-01', files: [], processes: nginx(712, 'api'),
  responders: [{ id: 'api', server: SERVER, routes: [
    cancel,
    { path: '/v1/orders/1042', host: STAGING_API, type: 'application/json', body: '{"order":1042,"status":"paid","env":"staging"}\n' },
    { path: '/v1/orders/1042/cancel', host: `api.${SITE}`, methods: ['POST'], type: 'application/json', body: '{"order":1042,"status":"cancelled","env":"production"}\n' },
    { path: '/v1/orders/1042', host: `api.${SITE}`, type: 'application/json', body: '{"order":1042,"status":"paid","env":"production"}\n' },
  ] }],
});
/** old-01: an old article archive whose server closes every connection after one response. */
const old01: TerminalRemote = {
  host: 'old-01', title: '舊文章站 old-01', address: '203.0.113.25', hostKey: 'srv03-old-01', files: [],
  processes: [{ pid: 640, user: 'www-data', command: '/usr/local/bin/archive-httpd', stat: 'S', listen: [{ port: 80, fd: 4, http: 'archive' }] }],
  responders: [{ id: 'archive', server: 'archive-httpd/2.1', keepAlive: false, routes: [{ path: '/*', body: '<h1>港灣書店舊文章</h1>\n' }] }],
};

/** The learner's workstation: curl, and sudo (so that editing /etc/hosts is possible, and a mistake). */
const ops: TerminalMachine = {
  id: 'srv03-ops', title: '維運工作站 ops-pc', user: 'learner', cwd: '/home/learner', host: 'ops-pc', profile: 'http', address: OPS_IP,
  files: [dir('/home'), dir('/home/learner', 'learner')], accounts: { groups: [{ name: 'sudo', members: ['learner'] }] },
  remotes: [web01(), web02(), api01(), old01], internet: [{ zone: SITE, text: ZONE }],
};

const REPORT_503: TerminalVariant = { label: '/report 改成維護中（503）', files: [], remotes: [web01(withRoutes([{ path: '/report', status: 503, headers: [['Retry-After', '300']] }]))] };
const REPORT_200: TerminalVariant = { label: '/report 已經修好（200）', files: [], remotes: [web01(withRoutes([{ path: '/report', type: 'text/plain', body: 'orders today: 128\n' }]))] };
const SALE_OVER: TerminalVariant = { label: '書展結束，/books/ 直接列出書目', files: [], remotes: [web01(withRoutes([{ path: '/books/', body: '<h1>全部書目</h1>\n' }]))] };
const SHOP_MOVE: TerminalVariant = { label: '分類頁搬到 /shop/catalog', files: [], remotes: [web01(withRoutes([
  { path: '/catalog', redirect: `http://${WWW}/shop/catalog` }, { path: '/shop/catalog', body: '<h1>線上書店分類</h1>\n' }]))] };
const SHIPPED: TerminalVariant = { label: '測試環境的訂單 1042 已經出貨（409）', files: [], remotes: [api01({ ...CANCELLED_STAGING, status: 409, body: '{"error":"order 1042 has shipped","env":"staging"}\n' })] };
const NEW_RELEASE: TerminalVariant = { label: 'web-02 部署了另一個版本', files: [], remotes: [web02({ path: '/healthz', host: WWW, type: 'text/plain', body: 'ok web-02 release 2026.11.4\n' })] };
const NEW_BROKEN: TerminalVariant = { label: 'web-02 的健康檢查失敗（503）', files: [], remotes: [web02({ path: '/healthz', host: WWW, status: 503, type: 'text/plain', body: 'fail: cannot reach database\n' })] };

// ---- network scenes ----------------------------------------------------------------------------------------------
const ipv4 = (from: string, to: string): ProtocolHeader => ({ layer: 'network', protocol: 'IPv4', fields: [{ name: '來源 IP', value: from }, { name: '目的 IP', value: to }] });
const tcp = (from: string, to: string, flags: string): ProtocolHeader => ({ layer: 'transport', protocol: 'TCP', fields: [
  { name: '來源連接埠', value: from }, { name: '目的連接埠', value: to }, { name: '旗標', value: flags }] });
const udp = (from: string, to: string): ProtocolHeader => ({ layer: 'transport', protocol: 'UDP', fields: [{ name: '來源連接埠', value: from }, { name: '目的連接埠', value: to }] });
const get = (path: string, host: string, agent = 'curl/8.5.0'): ProtocolHeader => ({ layer: 'application', protocol: 'HTTP/1.1', fields: [
  { name: '方法', value: 'GET' }, { name: '路徑', value: path }, { name: '版本', value: 'HTTP/1.1' },
  { name: 'Host', value: host }, { name: 'User-Agent', value: agent }, { name: 'Accept', value: '*/*' }] });
const response = (code: string, reason: string, headers: [string, string][]): ProtocolHeader => ({ layer: 'application', protocol: 'HTTP/1.1', fields: [
  { name: '版本', value: 'HTTP/1.1' }, { name: '狀態碼', value: code }, { name: '原因片語', value: reason }, ...headers.map(([name, value]) => ({ name, value }))] });
const NGINX_HEAD = (type: string, length: number): [string, string][] => [['Server', SERVER], ['Date', 'Sun, 22 Nov 2026 10:00:00 GMT'], ['Content-Type', type], ['Content-Length', String(length)], ['Connection', 'keep-alive']];

const PORT = '51724';
const CONN_HEAD = ['連線', '本機埠 → 目的', '狀態', '已送請求'];
/** curl's connection pool on ops-pc: connection #0 and how many requests it has carried. */
const pool = (state: string, sent: number, changed?: number[]): NodeTable[] => [
  { node: 'client', name: 'curl 的連線', head: CONN_HEAD, rows: [['#0', `${PORT} → ${WEB01_IP}:80`, state, String(sent)]], ...changed ? { changed } : {} }];

/** Section 1: `curl -L http://www.harborbooks.example/books/` from ops-pc, every step. */
const trace: NetworkScene = {
  id: 'srv03-curl-trace', title: '一次 curl -L：DNS、TCP、302 與同一條連線上的第二個請求', model: 'tcp-ip',
  description: `learner 在 ops-pc（${OPS_IP}）執行 \`curl -L http://${WWW}/books/\`。網址沒有寫連接埠，http 的預設是 80。看 curl 依序做了哪些事：先把名稱換成位址，再和 web-01 的 80 埠建立 TCP 連線，送出請求、收到 302 重新導向，跟著 Location 在同一條連線上送出第二個請求，最後在程式結束時關閉連線。表格是 curl 自己的連線清單。`,
  nodes: [
    { id: 'client', label: 'ops-pc（curl）', kind: 'host', addresses: [`IP ${OPS_IP}`] },
    { id: 'resolver', label: 'DNS 解析器', kind: 'resolver', addresses: [`IP ${RESOLVER_IP}`, 'UDP 53'] },
    { id: 'server', label: `web-01（nginx，${WWW}）`, kind: 'server', addresses: [`IP ${WEB01_IP}`, 'TCP 80'] },
  ],
  messages: [
    { id: 'dns-query', from: 'client', to: 'resolver', label: `DNS 查詢：${WWW} 的 A 記錄`,
      headers: [{ layer: 'application', protocol: 'DNS', fields: [{ name: '種類', value: '查詢' }, { name: '問題', value: `${WWW} A` }] }, udp('40213', '53'), ipv4(OPS_IP, RESOLVER_IP)],
      payload: `${WWW} 的 IPv4 位址是什麼？`,
      note: `curl 透過 glibc 的 getaddrinfo 查詢名稱：先看 /etc/hosts，沒有才問 DNS。Ubuntu 上這個問題先交給本機的 systemd-resolved（127.0.0.53），它的快取沒有答案時，才把查詢送到網路上的解析器；這裡畫的是送上網路的那一則。名稱解析失敗時，curl 印出 \`curl: (6) Could not resolve host\`，後面的步驟都不會發生。`,
      tables: pool('尚未建立', 0) },
    { id: 'dns-answer', from: 'resolver', to: 'client', label: `DNS 回答：${WEB01_IP}`,
      headers: [{ layer: 'application', protocol: 'DNS', fields: [{ name: '種類', value: '回答' }, { name: '答案', value: `${WWW} A ${WEB01_IP}（TTL 300）` }] }, udp('53', '40213'), ipv4(RESOLVER_IP, OPS_IP)],
      payload: `${WEB01_IP}，可以快取 300 秒`,
      note: '解析器回答 A 記錄。TTL 300 表示這個答案可以快取 300 秒，之後再查時，本機的 systemd-resolved 直接回答，不必再送出這兩則訊息。curl -v 的第一行 `*   Trying 203.0.113.20:80...` 印出的就是查到的位址。',
      tables: pool('尚未建立', 0) },
    { id: 'tcp', from: 'client', to: 'server', label: 'TCP 三向交握（摘要）',
      headers: [tcp(PORT, '80', 'SYN → SYN, ACK → ACK（三個區段）'), ipv4(OPS_IP, WEB01_IP)],
      payload: '三個區段都沒有資料',
      note: `作業系統替 curl 挑了一個暫時的本機連接埠 ${PORT}，和 web-01 的 80 埠完成三向交握（CN09）。完成後 curl 印出 \`* Connected to ${WWW} (${WEB01_IP}) port 80\`。如果 80 埠沒有程式在監聽，web-01 會回 RST，curl 印出 \`curl: (7) … Couldn't connect to server\`；如果那個位址根本沒有機器回應，就一直等到逾時。`,
      tables: pool('ESTABLISHED', 0, [0]) },
    { id: 'get-1', from: 'client', to: 'server', label: 'GET /books/',
      headers: [get('/books/', WWW), tcp(PORT, '80', 'PSH, ACK'), ipv4(OPS_IP, WEB01_IP)],
      payload: `GET /books/ HTTP/1.1\nHost: ${WWW}\nUser-Agent: curl/8.5.0\nAccept: */*\n（空列，GET 沒有本文）`,
      note: 'HTTP/1.1 的請求是純文字：第一行是請求列（方法、路徑、版本），接著每行一個標頭，最後一個空列。路徑只有 /books/，主機名稱放在 Host 標頭裡：同一個 IP 上可能有很多網站，nginx 靠 Host 決定由哪一個虛擬主機回應。User-Agent 說明是誰送的，Accept 說明可以接受哪些內容類型（*/* 是都可以）。這些就是 `curl -v` 以 `>` 開頭的那幾行。',
      tables: pool('ESTABLISHED', 1, [0]) },
    { id: 'found', from: 'server', to: 'client', label: '302 Moved Temporarily',
      headers: [response('302', 'Moved Temporarily', [...NGINX_HEAD('text/html', 171), ['Location', `http://${WWW}/books/winter-sale`]]), tcp('80', PORT, 'PSH, ACK'), ipv4(WEB01_IP, OPS_IP)],
      payload: `HTTP/1.1 302 Moved Temporarily\nLocation: http://${WWW}/books/winter-sale\n…（其他標頭與 171 位元組的說明頁）`,
      note: '回應的第一行是狀態列：版本、狀態碼與原因片語（RFC 寫作 Found，nginx 寫成 Moved Temporarily）。3xx 表示「要的東西在別處」，Location 標頭寫著該去哪裡。Content-Length 告訴 curl 本文有 171 位元組，讀滿就知道這則回應結束了；Connection: keep-alive 表示伺服器不會關閉連線。因為有 -L，curl 不寫出這段說明頁，而是準備送出下一個請求。',
      tables: pool('ESTABLISHED（閒置）', 1) },
    { id: 'get-2', from: 'client', to: 'server', label: 'GET /books/winter-sale（同一條連線）',
      headers: [get('/books/winter-sale', WWW), tcp(PORT, '80', 'PSH, ACK'), ipv4(OPS_IP, WEB01_IP)],
      payload: `GET /books/winter-sale HTTP/1.1\nHost: ${WWW}\nUser-Agent: curl/8.5.0\nAccept: */*`,
      note: `新網址的協定、主機名稱與連接埠都和剛才相同，連線還開著，所以 curl 印出 \`* Re-using existing connection with host ${WWW}\`，直接在連線 #0 上送出第二個請求：不必重新查 DNS，也省掉一次三向交握的往返。來源連接埠仍是 ${PORT}，這就是 keep-alive（持久連線）。`,
      tables: pool('ESTABLISHED', 2, [0]) },
    { id: 'ok', from: 'server', to: 'client', label: '200 OK（38 位元組的 HTML）',
      headers: [response('200', 'OK', NGINX_HEAD('text/html', 38)), tcp('80', PORT, 'PSH, ACK'), ipv4(WEB01_IP, OPS_IP)],
      payload: 'HTTP/1.1 200 OK\n…\n\n<h1>冬季書展：全館 79 折</h1>（UTF-8 共 38 位元組）',
      note: '200 表示成功，本文就是網頁。Content-Length 算的是位元組，不是字數：UTF-8 的中文字一個 3 位元組，所以這行 HTML 是 38 位元組。curl 把本文寫到標準輸出，並印出 `* Connection #0 to host … left intact`：連線留在 curl 的連線清單裡，如果同一個指令還有下一個網址就能再用。',
      tables: pool('ESTABLISHED（閒置）', 2) },
    { id: 'fin', from: 'client', to: 'server', label: 'curl 結束：FIN',
      headers: [tcp(PORT, '80', 'FIN, ACK'), ipv4(OPS_IP, WEB01_IP)],
      payload: '沒有資料',
      note: 'left intact 不代表連線永遠留著：curl 這個程式結束時就關閉它的連線（伺服器也會在閒置一段時間後關閉，nginx 的 keepalive_timeout 預設 75 秒）。所以連線重用只發生在同一個 curl 指令裡；下一次在提示字元執行 curl，又是新的 DNS 查詢（可能命中快取）與新的三向交握。瀏覽器不同，它會在多個頁面之間保留連線。',
      tables: pool('關閉', 2, [0]) },
  ],
};

const WEB01_PRIVATE = '10.20.0.20', APP_IP = '10.20.0.31';
const NGINX_ERROR = `[error] 813#813: *1 connect() failed (111: Connection refused) while connecting to upstream, client: ${OPS_IP}, server: ${WWW}, request: "GET /api/stock HTTP/1.1", upstream: "http://${APP_IP}:8000/api/stock", host: "${WWW}"`;

/** Section 3: nginx forwards /api/stock to an application server that is not running; the learner gets a 502. */
const badGateway: NetworkScene = {
  id: 'srv03-bad-gateway', title: '502 Bad Gateway：nginx 連不到後面的應用程式', model: 'tcp-ip',
  description: `web-01 的 nginx 是反向代理：/api/ 開頭的請求轉給內部網路上的庫存服務（app-01，${APP_IP} 的 8000 埠）。今天庫存服務沒有在執行。看 learner 的請求怎麼走、每一段連線是誰對誰，以及 502 是誰產生的。`,
  nodes: [
    { id: 'client', label: 'ops-pc（curl）', kind: 'host', addresses: [`IP ${OPS_IP}`] },
    { id: 'web', label: 'web-01（nginx，反向代理）', kind: 'server', addresses: [`IP ${WEB01_IP}（對外）`, `IP ${WEB01_PRIVATE}（內部）`] },
    { id: 'app', label: 'app-01（庫存服務，已停止）', kind: 'server', addresses: [`IP ${APP_IP}`, 'TCP 8000：沒有程式監聽'] },
  ],
  messages: [
    { id: 'request', from: 'client', to: 'web', label: 'GET /api/stock',
      headers: [get('/api/stock', WWW), tcp('51730', '80', 'PSH, ACK'), ipv4(OPS_IP, WEB01_IP)],
      payload: `GET /api/stock HTTP/1.1\nHost: ${WWW}\nUser-Agent: curl/8.5.0\nAccept: */*`,
      note: 'learner 的連線只到 nginx 為止（TCP 交握已省略）。nginx 收到完整、正確的請求，依設定這個路徑要交給後端（upstream）處理，所以它自己要再開一條連線到 app-01。用戶端看不到這一段。' },
    { id: 'upstream-syn', from: 'web', to: 'app', label: 'nginx 連線到 upstream：SYN',
      headers: [tcp('41566', '8000', 'SYN'), ipv4(WEB01_PRIVATE, APP_IP)],
      payload: '沒有資料',
      note: '現在 nginx 是用戶端：從自己的內部位址連到 app-01 的 8000 埠。這是第二條、獨立的 TCP 連線；反向代理的設定與轉送的標頭是 SRV07 的主題。' },
    { id: 'refused', from: 'app', to: 'web', label: 'RST：8000 埠沒有程式',
      headers: [tcp('8000', '41566', 'RST, ACK'), ipv4(APP_IP, WEB01_PRIVATE)],
      payload: '沒有資料',
      note: 'app-01 這台機器開著，但 8000 埠沒有程式在監聽，核心直接回 RST 拒絕連線（和 curl 的錯誤 7 是同一件事，只是這次被拒絕的是 nginx）。nginx 在自己的 error.log 記下原因：111 是 Linux 的 ECONNREFUSED。',
      tables: [{ node: 'web', name: 'nginx 的 error.log', head: ['時間', '紀錄'], changed: [0], rows: [['2026/11/22 10:00:00', NGINX_ERROR]] }] },
    { id: 'bad-gateway', from: 'web', to: 'client', label: '502 Bad Gateway',
      headers: [response('502', 'Bad Gateway', NGINX_HEAD('text/html', 159)), tcp('80', '51730', 'PSH, ACK'), ipv4(WEB01_IP, OPS_IP)],
      payload: 'HTTP/1.1 502 Bad Gateway\n…\n\n<html>…<h1>502 Bad Gateway</h1>…</html>',
      note: '這個 502 是 nginx 自己產生的：身為閘道，它沒能從後端拿到有效的回應。5xx 表示問題在伺服器端，learner 的請求沒有錯，重送一次也不會變好；要看的是 nginx 的 error.log 與後端服務的狀態（systemctl status、ss -tlnp）。如果後端接受了連線卻遲遲不回應，nginx 等到 proxy_read_timeout（預設 60 秒）後回 504 Gateway Time-out，error.log 記的是 upstream timed out (110: Connection timed out)。',
      tables: [{ node: 'web', name: 'nginx 的 error.log', head: ['時間', '紀錄'], rows: [['2026/11/22 10:00:00', NGINX_ERROR]] }] },
  ],
};

export const SRV03: LessonContent = {
  lessonId: 'SRV03',
  motivation: '客服轉來一則訊息：「書店網站的冬季書展頁打不開，結帳也怪怪的。」瀏覽器只會顯示一個錯誤頁，或者默默地跳到別的網址，看不出問題出在哪一步。這一課用 curl 把一次 HTTP 往返完整攤開：名稱解析到哪個位址、TCP 有沒有連上、送出了哪些請求標頭、伺服器回了什麼狀態碼與回應標頭、被重新導向了幾次、連線有沒有重用。學會之後，你能在任何一台伺服器上，不靠瀏覽器就判斷問題是在用戶端、網路還是伺服器，並且在切換 DNS 之前先驗證新主機。',
  sections: [
    {
      id: 'srv03-s-roundtrip', title: '一次 HTTP 往返：從網址到回應',
      blocks: [
        { type: 'p', text: 'HTTP 是用戶端問、伺服器答的協定：用戶端送出一個請求（request），伺服器回一個回應（response）。curl 是在命令列上當用戶端的工具，它送出請求，把回應的內容（本文，body）印到標準輸出。網址 `http://www.harborbooks.example/books/42` 告訴 curl 三件事：' },
        { type: 'table', head: ['網址的部分', '例子', '用來做什麼'], rows: [
          ['scheme（協定）', '`http`', '用哪個協定；沒有寫連接埠時 http 用 80、https 用 443'],
          ['主機名稱', '`www.harborbooks.example`', '先經由 DNS（或 /etc/hosts）換成 IP 位址，再放進請求的 Host 標頭'],
          ['連接埠', '沒寫（80）；`:8080` 時是 8080', 'TCP 連線的目的連接埠'],
          ['路徑與查詢字串', '`/books/42`、`/search?q=dns`', '放在請求列裡，伺服器依它決定回應什麼'],
        ] },
        { type: 'p', text: '一次往返依序經過四步：名稱解析（DNS）、TCP 連線（三向交握）、送出請求、收到回應。每一步都可能失敗，而且失敗的樣子不同：名稱查不到時根本沒有連線，連不上時沒有任何 HTTP 訊息，只有走到第四步才會有狀態碼。下面的情境是一次 `curl -L`，伺服器先回 302 重新導向，curl 在同一條連線上送出第二個請求。' },
        { type: 'example', id: 'srv03-curl-trace' },
        { type: 'callout', tone: 'note', title: '模擬環境裡的網路', text: '本課的機器與網站都是虛構的：harborbooks.example 的 DNS 記錄、web-01 等伺服器的回應都是課程資料，時鐘固定在 2026-11-22 10:00 UTC（所以 Date 標頭永遠相同）。curl 的行為與訊息依照 Ubuntu 24.04 的 curl 8.5.0；模擬環境不印進度表，也只說 HTTP/1.1。' },
      ],
    },
    {
      id: 'srv03-s-verbose', title: '讀懂 curl -v：*、> 與 <',
      blocks: [
        { type: 'p', text: '`curl -v`（verbose）把整個往返印出來。這些行寫在標準錯誤，本文仍寫在標準輸出，所以 `curl -v 網址 2>/dev/null` 只剩本文，`2>&1 | grep` 則可以把兩者合在一起過濾。每一行的開頭符號說明它是什麼：' },
        { type: 'table', head: ['開頭', '意思', '例子'], rows: [
          ['`*`', 'curl 自己的訊息：解析、連線、重用、關閉、重新導向', '`*   Trying 203.0.113.20:80...`、`* Connected to … port 80`'],
          ['`>`', 'curl 送出的請求：請求列與請求標頭，以 `>` 單獨一行（空列）結束', '`> GET /books/42 HTTP/1.1`、`> Host: www.harborbooks.example`'],
          ['`<`', '伺服器的回應：狀態列與回應標頭，以 `<` 單獨一行（空列）結束', '`< HTTP/1.1 200 OK`、`< Content-Type: text/html`'],
          ['沒有符號', '回應的本文（標準輸出）', '`<h1>《網路的形狀》</h1>`'],
        ] },
        { type: 'p', text: 'curl 預設送出三個請求標頭。`Host` 是 HTTP/1.1 規定一定要有的：一台伺服器常常同時服務好幾個網站（虛擬主機），靠它分辨你要哪一個。`User-Agent: curl/8.5.0` 說明用戶端是什麼程式，有些網站依它回應不同內容或擋下自動化程式。`Accept: */*` 說明可以接受任何內容類型；瀏覽器送的是 `text/html,…` 這樣有偏好順序的清單。' },
        { type: 'table', head: ['回應標頭', '意思'], rows: [
          ['`Server`', '伺服器軟體與版本，例如 `nginx/1.24.0 (Ubuntu)`；很多網站會隱藏版本'],
          ['`Date`', '產生回應的時間，一律用 GMT'],
          ['`Content-Type`', '本文的類型：`text/html`、`application/json`、`text/plain`…，可以帶 `; charset=utf-8`'],
          ['`Content-Length`', '本文的位元組數（不是字數）；用戶端讀滿就知道回應結束'],
          ['`Connection`', '`keep-alive`：回應後連線不關；`close`：這則回應之後就關閉（第五節）'],
          ['`Location`', '3xx 重新導向要去的網址；201 Created 時指向剛建立的資源'],
          ['`Cache-Control`', '快取規則，例如 `max-age=300` 表示 300 秒內可以直接用快取的副本；CDN 與快取在 SRV11 詳談'],
        ] },
        { type: 'p', text: '只想看標頭時有兩種寫法，差別在送出的方法。`curl -I`（`--head`）送出 HEAD 請求：伺服器回應和 GET 相同的標頭，但不送本文，curl 印出標頭與結尾的空列。`curl -i`（`--include`）照常送出 GET，把回應標頭印在本文前面。HEAD 比較省流量，但少數應用程式對 HEAD 的處理和 GET 不同；懷疑時用 `-i`，看到的就是 GET 真正得到的回應。' },
        { type: 'example', id: 'srv03-verbose' },
        { type: 'callout', tone: 'tip', title: '真實的 curl -v 會多幾行', text: '真實的 curl 依版本會多印幾行名稱解析的資訊；把本文導向檔案或管線而沒有加 `-s` 時，還會在標準錯誤畫出進度表（下載量、速度與時間）；`>`、`<` 的行尾也常有空白。模擬環境去掉這些變動的部分，方便和課文逐字比對；判讀的方法完全相同。' },
      ],
    },
    {
      id: 'srv03-s-status', title: '狀態碼：問題在用戶端、網路還是伺服器',
      blocks: [
        { type: 'p', text: '只要收到 HTTP 回應，狀態列就有一個三位數的狀態碼。第一位數字是類別，先看它就能判斷方向：2xx 成功；3xx 要去別的地方（重新導向）或可以用快取；4xx 是用戶端的請求有問題，同樣的請求重送幾次都一樣，要改的是請求（網址、方法、身分）；5xx 是伺服器端的問題，請求本身沒錯，要找的是伺服器或它後面的服務。1xx 是過渡性的訊息（例如 100 Continue），很少直接看到。' },
        { type: 'table', head: ['狀態碼', '名稱', '意思'], rows: [
          ['200', 'OK', '成功，本文就是要的資料'],
          ['201', 'Created', '成功建立了新資源（常見於 POST），Location 指向它'],
          ['204', 'No Content', '成功，但沒有本文（例如刪除、儲存設定）'],
          ['301', 'Moved Permanently', '永久搬到 Location；瀏覽器與搜尋引擎會記住新網址'],
          ['302', 'Found', '暫時在 Location，之後仍應使用原網址（nginx 的原因片語寫成 Moved Temporarily）'],
          ['304', 'Not Modified', '條件式請求（If-None-Match、If-Modified-Since）的答案：快取的副本仍有效，沒有本文'],
          ['400', 'Bad Request', '請求本身格式錯誤，伺服器無法理解（語法錯誤、參數不合法）'],
          ['401', 'Unauthorized', '需要驗證身分而沒有提供或無效；回應帶 WWW-Authenticate 說明怎麼驗證'],
          ['403', 'Forbidden', '伺服器理解請求但拒絕存取；用同樣的身分重送也不會成功'],
          ['404', 'Not Found', '伺服器上沒有這個資源（也有網站用它隱藏資源的存在）'],
          ['405', 'Method Not Allowed', '資源存在，但不接受這個方法（例如對只收 POST 的網址送 GET）'],
          ['500', 'Internal Server Error', '伺服器（通常是應用程式）處理時發生未預期的錯誤'],
          ['502', 'Bad Gateway', '閘道或反向代理沒能從後端拿到有效的回應（例如後端拒絕連線）'],
          ['503', 'Service Unavailable', '暫時無法服務（過載、維護），可能帶 Retry-After 說明多久後再試'],
          ['504', 'Gateway Timeout', '閘道或反向代理等後端回應逾時'],
        ] },
        { type: 'p', text: '巡檢時通常只要狀態碼。`-w`（`--write-out`）在傳輸完成後印出指定的資訊，`%{http_code}` 是狀態碼；搭配 `-s`（不印進度與錯誤）與 `-o /dev/null`（把本文丟掉），就只剩一行。其他常用的變數有 `%{url_effective}`（最後的網址）、`%{redirect_url}`（沒有跟隨時的下一站）、`%{num_redirects}`、`%{content_type}`、`%{remote_ip}`、`%header{名稱}`；格式裡的 `\\n` 是換行。真實的 curl 還有 `%{time_total}` 等量測時間的變數，模擬環境的時鐘固定，所以不提供。' },
        { type: 'p', text: '還沒走到 HTTP 就失敗時沒有狀態碼，只有 curl 自己的錯誤碼（也就是 curl 的結束碼）：6 是名稱查不到（DNS 或 /etc/hosts 的問題），7 是連不上（那個埠沒有程式而被拒絕，或位址沒有機器而等到逾時），28 是超過 `--connect-timeout` 或 `-m` 的時限。這三種都和伺服器的程式無關，先檢查名稱、位址、連接埠與網路。' },
        { type: 'example', id: 'srv03-codes' },
        { type: 'callout', tone: 'warning', title: '常見誤解：curl 的結束碼 0 代表網站正常', text: '404、500、503 都是「成功收到的回應」，curl 預設照樣以 0 結束，所以 `curl 網址 && echo 正常` 這種檢查在網站出錯時也會印出正常。指令稿裡要嘛用 `-f`（`--fail`）讓 4xx、5xx 變成結束碼 22，要嘛用 `-w \'%{http_code}\'` 取出狀態碼自己判斷。`-f` 會把錯誤頁的本文吞掉，`-sS` 則是安靜但仍印出錯誤。' },
        { type: 'p', text: '502、503、504 的「伺服器端」常常不是你連到的那台：現代網站前面通常有 nginx 這類反向代理，再轉給後面的應用程式。下面的情境中，nginx 本身運作正常，是它後面的服務沒有在執行。' },
        { type: 'example', id: 'srv03-bad-gateway' },
      ],
    },
    {
      id: 'srv03-s-redirect', title: '重新導向：Location 與 -L',
      blocks: [
        { type: 'p', text: '3xx 回應不給資料，而是用 Location 標頭說「去這裡拿」。網站搬家、把 harborbooks.example 統一導到 www、把 http 導到 https、舊網址改版，都靠它。Location 可以是完整網址，也可以是相對路徑（以目前的網址為基準）；nginx 預設會把它寫成完整網址。五種重新導向的差別在「永久或暫時」與「方法會不會變」：' },
        { type: 'table', head: ['狀態碼', '永久／暫時', '跟隨時的方法'], rows: [
          ['301 Moved Permanently', '永久', 'GET 照舊；POST 在瀏覽器與 curl 都會改成 GET（歷史行為）'],
          ['302 Found', '暫時', '同 301：POST 會改成 GET'],
          ['303 See Other', '暫時', '一律改用 GET 去看結果（例如送出表單後的結果頁）'],
          ['307 Temporary Redirect', '暫時', '保留原本的方法與本文'],
          ['308 Permanent Redirect', '永久', '保留原本的方法與本文'],
        ] },
        { type: 'p', text: 'curl 預設不跟隨重新導向：它把 3xx 回應的本文（nginx 的一小段 301 說明頁）照樣印出來，結束碼是 0。加上 `-L`（`--location`），curl 讀出 Location，再送出下一個請求，直到拿到不是重新導向的回應；被跟隨的那些 3xx 的本文不會寫出（`-i`、`-I` 仍印它們的標頭）。`-v` 會在每一站印出 `* Issue another request to this URL: …`。`--max-redirs N` 限制最多跟隨幾次（curl 8 的預設是 50），超過時以錯誤 47 結束，用來抓出 A 導到 B、B 又導回 A 的迴圈。' },
        { type: 'p', text: '追一條重新導向鏈有三種看法：`curl -sIL 網址` 列出每一站的狀態列與標頭（接上 `grep -i -e \'^HTTP\' -e \'^location\'` 只看重點）；`-w \'%{num_redirects} %{http_code} %{url_effective}\\n\'` 一行說出轉了幾次、最後的狀態與網址；不加 `-L` 的 `%{redirect_url}` 只看下一站。' },
        { type: 'example', id: 'srv03-redirects' },
        { type: 'callout', tone: 'warning', title: '常見錯誤：忘了 -L，把 301 當成結果', text: '巡檢指令 `curl -s -o /dev/null -w \'%{http_code}\' http://harborbooks.example/catalog` 印出 301，有人就判斷「網站正常」，也有人以為「網站壞了」。兩者都沒看到真正的頁面：301 只說明要去別處。要知道使用者最後看到什麼，加上 `-L` 並印出 `%{url_effective}`。反過來，`-X POST` 搭配 `-L` 時，curl 會在每一站都硬送 POST（不再依狀態碼改成 GET），通常不是你要的；送表單時用 `-d` 讓 curl 自己決定方法。' },
      ],
    },
    {
      id: 'srv03-s-keepalive', title: 'Keep-Alive：連線重用與 Connection: close',
      blocks: [
        { type: 'p', text: '每開一條新的 TCP 連線，都要先花一個往返做三向交握（HTTPS 還要再加上 TLS 交握）。早期的 HTTP/1.0 每個請求用完就關連線，要保留得明確送出 `Connection: keep-alive`，這個標頭的名字就是這樣來的。HTTP/1.1 改成預設就是持久連線（persistent connection）：回應送完後連線保持開著，同一個用戶端的下一個請求直接沿用，除非任一方送出 `Connection: close`。' },
        { type: 'table', head: ['curl -v 的訊息', '意思'], rows: [
          ['`* Connection #0 to host … left intact`', '回應讀完了，連線 #0 留在 curl 的連線清單裡，等著被重用'],
          ['`* Re-using existing connection with host …`', '這個請求沿用已經開著的連線：沒有 Trying、沒有新的交握'],
          ['`* Closing connection`', '伺服器說了 `Connection: close`（或連線出錯），curl 關閉它；下一個請求要重新連線'],
        ] },
        { type: 'p', text: 'curl 只在同一個指令裡重用連線：一個指令有好幾個網址，或是 `-L` 跟隨重新導向時。能不能重用看的是「scheme、主機名稱、連接埠」都相同而且連線還開著；harborbooks.example 與 www.harborbooks.example 即使是同一個 IP，curl 也當成不同的主機，各開一條連線。伺服器那邊也會關閉閒置太久的連線（nginx 的 `keepalive_timeout` 預設 75 秒），所以 keep-alive 省下的是短時間內連續請求的交握。' },
        { type: 'example', id: 'srv03-keepalive' },
        { type: 'p', text: '連線數會直接影響伺服器：每條開著的連線都占用一個 socket 與一點記憶體，大量閒置的 keep-alive 連線、或是每個請求都重新連線造成的大量 TIME-WAIT（`ss -tan` 看得到），都是調整逾時與連線數時要觀察的現象（SRV05）。' },
      ],
    },
    {
      id: 'srv03-s-requests', title: '自訂請求：方法、標頭與 --resolve',
      blocks: [
        { type: 'p', text: '除了 GET，常見的方法還有：HEAD（只要標頭）、POST（送出資料，例如表單或新增一筆資源）、PUT（以本文整筆取代資源）、PATCH（修改部分欄位）、DELETE（刪除）、OPTIONS（詢問支援哪些方法，CORS 預檢也用它）。GET 與 HEAD 只讀不改；伺服器只接受某些方法時，用錯的方法會得到 405。curl 的相關選項：' },
        { type: 'table', head: ['選項', '做什麼', '例子'], rows: [
          ['`-X 方法`', '指定請求的方法（只改請求列，不會自己附上本文）', '`-X DELETE`、`-X POST`'],
          ['`-d 資料`', '附上本文並改用 POST，`Content-Type: application/x-www-form-urlencoded`', '`-d \'rating=5\'`'],
          ['`-H \'名稱: 值\'`', '加上或取代一個請求標頭，可以重複', '`-H \'X-Request-Id: srv03-7f2a\'`'],
          ['`-A 字串`', '改變 User-Agent', '`-A \'stock-check/1.0\'`'],
          ['`-H \'Host: 名稱\'`', '取代 Host 標頭，指定要哪一個虛擬主機', '`curl -H \'Host: staging-api.harborbooks.example\' http://203.0.113.40/`'],
          ['`--resolve 名稱:埠:位址`', '這個指令裡把「名稱＋埠」直接對應到位址，不查 DNS；網址與 Host 標頭仍是原本的名稱', '`--resolve www.harborbooks.example:80:203.0.113.30`'],
        ] },
        { type: 'p', text: '虛擬主機（nginx 的 server_name）讓一個 IP 服務好幾個網站，所以直接用 IP 連線時，Host 標頭變成 IP，伺服器多半回應預設網站或 404。測試尚未設定 DNS 的網站時有兩個做法：`-H \'Host: 名稱\'` 加上以 IP 寫的網址，或是 `--resolve`。兩者在 http 都有效，但 `--resolve` 更接近真實的請求：網址、Host 標頭、日誌裡的主機名稱都和切換後一樣，而且 HTTPS 的 TLS 交握（伺服器名稱指示 SNI 與憑證的名稱檢查）也用網址裡的名稱，只改 Host 標頭在 HTTPS 會失敗。注意 `--resolve` 的埠必須和網址的埠相同，http 是 80、https 是 443，寫錯就照常查 DNS。' },
        { type: 'p', text: 'API 的請求常常還需要其他標頭，例如 `Authorization: Bearer …`（CN14）與 `Content-Type: application/json`，都用 `-H` 加上；模擬環境的回應者只依路徑、Host 與方法決定回應，其他標頭會照實送出、但不影響結果。HTTPS 網址在模擬環境裡會連上 443 埠，然後停在 TLS 交握並印出錯誤 35，TLS 與憑證是下一課（SRV04）的主題；這一課一律用 http:// 觀察。' },
        { type: 'example', id: 'srv03-custom' },
        { type: 'callout', tone: 'warning', title: '為了測新主機去改 /etc/hosts', text: '在 /etc/hosts 加一行 `203.0.113.30 www.harborbooks.example` 也能讓 curl 連到新主機，但它影響這台機器上的每一個程式（瀏覽器、監控、排程工作），而且很容易忘記拿掉：幾週後 DNS 早已改了，這台機器仍連到你當時寫的位址，造成難以追查的「只有我這邊不一樣」。只想測一個請求時用 `--resolve`，它只對那一個 curl 指令有效。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  network: {
    scenes: [trace, badGateway],
    exercises: [
      { id: 'srv03-net-requests', task: 'table', scene: 'srv03-curl-trace', message: 'get-2', node: 'client', table: 'curl 的連線', row: '#0', column: '已送請求', title: '一條連線送了幾個請求',
        statement: '在「一次 curl -L」情境中，curl 送出第二個請求（GET /books/winter-sale）之後，它的「curl 的連線」表裡，連線 #0 的「已送請求」是多少？（只填數字）',
        hints: ['先看 302 回應的 Connection 標頭：伺服器有沒有要關閉連線？', '新網址和舊網址的 scheme、主機名稱、連接埠是否都相同？'],
        explanation: '302 的回應帶著 Connection: keep-alive，新網址的 scheme、主機名稱與連接埠都和第一個請求相同，所以 curl 重用連線 #0（Re-using existing connection），這條連線已經送了 2 個請求。如果伺服器回 Connection: close，或新網址換了主機名稱，curl 才會開一條新連線，那時每條連線各只有 1 個請求。',
        mistakes: [
          { answer: { cell: '1' }, why: '以為每個請求都開一條新連線：HTTP/1.1 預設 keep-alive，同一個主機與連接埠的下一個請求沿用連線 #0。' },
          { answer: { cell: '3' }, why: '把 DNS 查詢也算成這條連線上的請求：DNS 走的是另一個協定（UDP 53），不經過這條 TCP 連線。' },
        ] },
      { id: 'srv03-net-port', task: 'field', scene: 'srv03-curl-trace', message: 'get-2', layer: 'transport', field: '來源連接埠', title: '第二個請求從哪個連接埠送出',
        statement: '同一個情境中，第二個請求（GET /books/winter-sale）的 TCP 標頭裡，「來源連接埠」是多少？',
        hints: ['來源連接埠是 ops-pc 這一端的連接埠，由作業系統在建立連線時挑選。', '第二個請求有沒有建立新的 TCP 連線？'],
        explanation: '第二個請求沿用第一個請求的 TCP 連線，所以來源連接埠仍是三向交握時挑選的 51724，目的連接埠仍是 80。四元組（來源 IP、來源埠、目的 IP、目的埠）沒變，就是同一條連線；如果 curl 重新連線，作業系統會挑另一個暫時的連接埠。',
        mistakes: [
          { answer: { value: '80' }, why: '把目的連接埠當成來源：80 是 web-01 上 nginx 監聽的埠，請求從 ops-pc 的暫時連接埠送出。' },
          { answer: { value: '51725' }, why: '以為第二個請求開了新連線、換了新的連接埠：keep-alive 讓它沿用同一條連線。' },
        ] },
      { id: 'srv03-net-rst', task: 'field', scene: 'srv03-bad-gateway', message: 'refused', layer: 'transport', field: '旗標', title: 'app-01 怎麼拒絕連線',
        statement: '在「502 Bad Gateway」情境中，app-01 回覆 nginx 的那個 TCP 區段，「旗標」欄是什麼？（例如 SYN, ACK）',
        hints: ['8000 埠沒有程式在監聽時，核心不會完成三向交握。', '拒絕連線用的是哪一個 TCP 旗標？'],
        explanation: '沒有程式監聽的埠收到 SYN 時，核心以 RST, ACK 回覆，表示拒絕連線；nginx 因此記下 connect() failed (111: Connection refused)，並回給用戶端 502。若是 SYN, ACK，代表有程式在監聽、交握會繼續；FIN 是正常結束一條已經建立的連線。',
        mistakes: [
          { answer: { value: 'SYN, ACK' }, why: 'SYN, ACK 是接受連線的回覆：那代表 8000 埠有程式在監聽，就不會有 502。' },
          { answer: { value: 'FIN, ACK' }, why: 'FIN 用來結束已經建立的連線；這條連線從來沒有建立，拒絕用的是 RST。' },
          { answer: { value: 'RST' }, why: '方向對了，但回覆 SYN 的 RST 區段同時帶著 ACK（確認收到那個 SYN），欄位是 RST, ACK。' },
        ] },
    ],
  },
  quiz: [
    {
      id: 'srv03-q1', prompt: '`curl -v` 的輸出中，以 `>` 開頭的行是什麼？',
      options: ['伺服器送回的狀態列與回應標頭', 'curl 自己的訊息，例如連線與重用', 'curl 送出的請求列與請求標頭', '回應的本文'],
      answer: 2,
      explanation: '`>` 表示從 curl 送出去的方向：請求列（GET /books/42 HTTP/1.1）與 Host、User-Agent、Accept 等請求標頭。回應的狀態列與標頭以 `<` 開頭；curl 自己的訊息（Trying、Connected、Re-using）以 `*` 開頭；本文沒有任何符號，而且寫在標準輸出而不是標準錯誤。',
    },
    {
      id: 'srv03-q2', prompt: '`curl -s -o /dev/null -w \'%{http_code}\\n\' http://www.harborbooks.example/books/43` 印出 `404`。接著執行 `echo $?` 會印出什麼？',
      options: ['0', '22', '404', '6'],
      answer: 0,
      explanation: 'curl 的結束碼說的是傳輸本身：它成功連上伺服器並收到一則完整的回應，所以是 0，即使那則回應是 404。要讓 4xx、5xx 變成結束碼 22 必須加 `-f`；結束碼只有 0–255，HTTP 狀態碼不會直接變成結束碼；6 是名稱查不到，這裡顯然已經查到並收到回應。',
    },
    {
      id: 'srv03-q3', prompt: '使用者回報 `/api/stock` 出錯。哪一個狀態碼表示「請求本身沒問題，是前面的反向代理沒能從後端服務拿到有效的回應」？',
      options: ['404', '401', '500', '502'],
      answer: 3,
      explanation: '502 Bad Gateway 是閘道或反向代理產生的：它連不上後端，或後端回了無效的回應。404 表示伺服器上沒有這個資源，是請求的網址有問題；401 表示缺少有效的身分驗證；500 是處理請求的伺服器（通常是應用程式本身）發生錯誤，並不特指代理與後端之間的問題。',
    },
    {
      id: 'srv03-q4', prompt: '`curl -I` 和 `curl -i` 的差別是什麼？',
      options: ['兩者完全相同，只是大小寫不同', '`-I` 送出 HEAD、只印回應標頭；`-i` 照常送出 GET，在本文前面加印回應標頭', '`-I` 印出請求標頭，`-i` 印出回應標頭', '`-i` 會跟隨重新導向，`-I` 不會'],
      answer: 1,
      explanation: '`-I`（--head）改用 HEAD 方法，伺服器只回標頭；`-i`（--include）仍是 GET，只是把回應標頭也印出來，所以看到的就是 GET 實際得到的回應。兩者不同，送出的方法就不一樣；請求標頭要用 `-v` 才看得到；跟隨重新導向是 `-L`，和這兩個選項無關。',
    },
    {
      id: 'srv03-q5', prompt: '`curl http://www.harborbooks.example/catalog` 只印出一段寫著 `301 Moved Permanently` 的 HTML。要拿到搬家之後的頁面，應該怎麼做？',
      options: ['改用 `curl -I`', '加上 `-f`', '加上 `-L`，讓 curl 依 Location 標頭送出下一個請求', '加上 `-H \'Location: /books/\'`'],
      answer: 2,
      explanation: 'curl 預設不跟隨重新導向，`-L` 才會讀出 Location 再送出請求，直到拿到最後的頁面。`-I` 只是改成看標頭，仍停在 301；`-f` 只影響 4xx、5xx 的處理，301 不受影響；Location 是伺服器的回應標頭，從請求送出去沒有任何意義。',
    },
    {
      id: 'srv03-q6', prompt: '`curl -v http://www.harborbooks.example/ http://www.harborbooks.example/books/42` 在第二個網址前印出 `* Re-using existing connection with host www.harborbooks.example`。這代表什麼？',
      options: ['第二個請求沿用第一個請求的 TCP 連線，不必再做三向交握', 'curl 從快取拿出上一次的回應，沒有送出請求', '伺服器回了 `Connection: close`', 'DNS 查詢失敗，curl 改用上一次的位址'],
      answer: 0,
      explanation: 'HTTP/1.1 預設 keep-alive，第一個回應之後連線 #0 仍開著，同一個主機與連接埠的第二個請求直接在上面送出。請求仍然送出了，curl 不會快取回應；伺服器若回 Connection: close，curl 會印 Closing connection 並重新連線；這和 DNS 失敗無關，查不到名稱時是錯誤 6。',
    },
    {
      id: 'srv03-q7', prompt: '新主機 web-02（203.0.113.30）已經架好，DNS 仍指向舊的 web-01。要在不改 DNS、不動 /etc/hosts 的情況下，用正確的名稱測試 web-02 的 http 網站，哪一個指令正確？',
      options: ['`curl http://www.harborbooks.example/`', '`curl http://203.0.113.30/`', '`curl --resolve www.harborbooks.example:443:203.0.113.30 http://www.harborbooks.example/`', '`curl --resolve www.harborbooks.example:80:203.0.113.30 http://www.harborbooks.example/`'],
      answer: 3,
      explanation: '`--resolve` 讓這個指令把 www.harborbooks.example 的 80 埠直接對應到 203.0.113.30，網址與 Host 標頭仍是原本的名稱。不加任何選項會照 DNS 連到 web-01；直接用 IP 時 Host 標頭變成 203.0.113.30，對不上虛擬主機；`--resolve` 寫 443 只對 https 網址有效，這個 http 網址用的是 80，所以照常查 DNS 而連到舊主機。',
    },
    {
      id: 'srv03-q8', prompt: '`/admin` 回應 401，`/private/ledger.csv` 回應 403。哪一個說法正確？',
      options: ['兩者都是伺服器故障，要看伺服器的 error.log', '401 表示還沒有提供有效的身分驗證（回應帶 WWW-Authenticate）；403 表示伺服器理解請求但拒絕存取，用同樣的身分重送也不會成功', '401 表示網址不存在，403 表示用錯了方法', '403 會自動把瀏覽器導向登入頁'],
      answer: 1,
      explanation: '兩者都是 4xx，問題在請求這一端：401 要求先驗證身分，403 則是身分已知（或不需要）仍被拒絕。伺服器故障是 5xx；網址不存在是 404、方法不對是 405；導向登入頁要靠 3xx 與 Location，403 本身不會重新導向。',
    },
  ],
  terminal: {
    machines: [ops],
    examples: [
      {
        id: 'srv03-verbose', title: '本文、-v、-I 與 -i', machine: 'srv03-ops',
        description: '同一個網址看四次：預設只印本文；`-v` 加上 `*` 的連線訊息、`>` 的請求與 `<` 的回應（都在標準錯誤，`2>/dev/null` 就只剩本文）；`-I` 送出 HEAD，只有標頭與空列；`-i` 送出 GET，標頭在本文前面。',
        steps: [
          { command: `curl http://${WWW}/books/42`, output: '<h1>《網路的形狀》</h1>\n<p>書號 42，NT$ 420</p>' },
          { command: `curl -v http://${WWW}/books/42`, output: '*   Trying 203.0.113.20:80...\n* Connected to www.harborbooks.example (203.0.113.20) port 80\n> GET /books/42 HTTP/1.1\n> Host: www.harborbooks.example\n> User-Agent: curl/8.5.0\n> Accept: */*\n>\n< HTTP/1.1 200 OK\n< Server: nginx/1.24.0 (Ubuntu)\n< Date: Sun, 22 Nov 2026 10:00:00 GMT\n< Content-Type: text/html\n< Content-Length: 58\n< Connection: keep-alive\n< Cache-Control: max-age=300\n<\n<h1>《網路的形狀》</h1>\n<p>書號 42，NT$ 420</p>\n* Connection #0 to host www.harborbooks.example left intact' },
          { command: `curl -v http://${WWW}/books/42 2>/dev/null`, output: '<h1>《網路的形狀》</h1>\n<p>書號 42，NT$ 420</p>' },
          { command: `curl -I http://${WWW}/books/42`, output: 'HTTP/1.1 200 OK\nServer: nginx/1.24.0 (Ubuntu)\nDate: Sun, 22 Nov 2026 10:00:00 GMT\nContent-Type: text/html\nContent-Length: 58\nConnection: keep-alive\nCache-Control: max-age=300\n' },
          { command: `curl -i http://${WWW}/books/42`, output: 'HTTP/1.1 200 OK\nServer: nginx/1.24.0 (Ubuntu)\nDate: Sun, 22 Nov 2026 10:00:00 GMT\nContent-Type: text/html\nContent-Length: 58\nConnection: keep-alive\nCache-Control: max-age=300\n\n<h1>《網路的形狀》</h1>\n<p>書號 42，NT$ 420</p>' },
        ],
      },
      {
        id: 'srv03-codes', title: '狀態碼與 curl 的錯誤碼', machine: 'srv03-ops',
        description: '用 for 迴圈與 `-w` 巡檢八個網址的狀態碼；`-I` 看 401 的 WWW-Authenticate；404 時 curl 的結束碼仍是 0，加上 `-f` 才是 22；最後是還沒走到 HTTP 的三種失敗：名稱查不到（6）、連線被拒絕（7）、連線逾時（28）。',
        steps: [
          { command: `for p in / /books/43 /admin /private/ledger.csv /report /api/stock /checkout /search; do curl -s -o /dev/null -w "%{http_code} $p\\n" "http://${WWW}$p"; done`, output: '200 /\n404 /books/43\n401 /admin\n403 /private/ledger.csv\n500 /report\n502 /api/stock\n503 /checkout\n504 /search' },
          { command: `curl -I http://${WWW}/admin`, output: 'HTTP/1.1 401 Unauthorized\nServer: nginx/1.24.0 (Ubuntu)\nDate: Sun, 22 Nov 2026 10:00:00 GMT\nContent-Type: text/html\nContent-Length: 161\nConnection: keep-alive\nWWW-Authenticate: Basic realm="admin"\n' },
          { command: `curl -s -o /dev/null http://${WWW}/books/43`, output: '' },
          { command: 'echo $?', output: '0' },
          { command: `curl -sSf -o /dev/null http://${WWW}/books/43`, output: 'curl: (22) The requested URL returned error: 404' },
          { command: 'echo $?', output: '22' },
          { command: `curl http://shop.${SITE}/`, output: 'curl: (6) Could not resolve host: shop.harborbooks.example' },
          { command: `curl http://${WWW}:8080/`, output: 'curl: (7) Failed to connect to www.harborbooks.example port 8080 after 0 ms: Couldn\'t connect to server' },
          { command: `curl --connect-timeout 5 http://staging.${SITE}/`, output: 'curl: (28) Failed to connect to staging.harborbooks.example port 80 after 5000 ms: Timeout was reached' },
          { command: 'echo $?', output: '28' },
        ],
      },
      {
        id: 'srv03-redirects', title: '追蹤一條重新導向鏈', machine: 'srv03-ops',
        description: '沒有 `-L` 時 curl 印出 301 的說明頁；`-I` 看到 Location；`-L` 拿到最後的頁面。`-sIL` 接上 grep 列出每一站，`-w` 一行說出轉了幾次、最後的狀態與網址，不加 `-L` 的 `%{redirect_url}` 只看下一站；`--max-redirs 2` 在第三次重新導向前停下（錯誤 47）。',
        steps: [
          { command: `curl http://${WWW}/catalog`, output: '<html>\n<head><title>301 Moved Permanently</title></head>\n<body>\n<center><h1>301 Moved Permanently</h1></center>\n<hr><center>nginx/1.24.0 (Ubuntu)</center>\n</body>\n</html>' },
          { command: `curl -I http://${WWW}/catalog`, output: 'HTTP/1.1 301 Moved Permanently\nServer: nginx/1.24.0 (Ubuntu)\nDate: Sun, 22 Nov 2026 10:00:00 GMT\nContent-Type: text/html\nContent-Length: 171\nConnection: keep-alive\nLocation: http://www.harborbooks.example/books/\n' },
          { command: `curl -L http://${WWW}/catalog`, output: '<h1>冬季書展：全館 79 折</h1>' },
          { command: `curl -sIL http://${SITE}/catalog | grep -i -e '^HTTP' -e '^location'`, output: 'HTTP/1.1 301 Moved Permanently\nLocation: http://www.harborbooks.example/catalog\nHTTP/1.1 301 Moved Permanently\nLocation: http://www.harborbooks.example/books/\nHTTP/1.1 302 Moved Temporarily\nLocation: http://www.harborbooks.example/books/winter-sale\nHTTP/1.1 200 OK' },
          { command: `curl -sL -o /dev/null -w '%{num_redirects} %{http_code} %{url_effective}\\n' http://${SITE}/catalog`, output: '3 200 http://www.harborbooks.example/books/winter-sale' },
          { command: `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\\n' http://${SITE}/catalog`, output: '301 http://www.harborbooks.example/catalog' },
          { command: `curl -sSL --max-redirs 2 -o /dev/null http://${SITE}/catalog`, output: 'curl: (47) Maximum (2) redirects followed' },
          { command: 'echo $?', output: '47' },
        ],
      },
      {
        id: 'srv03-keepalive', title: '連線重用與 Connection: close', machine: 'srv03-ops',
        description: '只看 `*` 開頭的行：同一個主機的兩個網址共用連線 #0；跟隨重新導向時，harborbooks.example 與 www.harborbooks.example 雖然是同一個 IP，仍各開一條連線，之後在 www 的連線上重用；舊文章站每次都回 `Connection: close`，所以兩個請求各自連線。',
        steps: [
          { command: `curl -sv http://${WWW}/ http://${WWW}/books/42 2>&1 | grep '^\\*'`, output: '*   Trying 203.0.113.20:80...\n* Connected to www.harborbooks.example (203.0.113.20) port 80\n* Connection #0 to host www.harborbooks.example left intact\n* Re-using existing connection with host www.harborbooks.example\n* Connection #0 to host www.harborbooks.example left intact' },
          { command: `curl -svL -o /dev/null http://${SITE}/catalog 2>&1 | grep '^\\*'`, output: '*   Trying 203.0.113.20:80...\n* Connected to harborbooks.example (203.0.113.20) port 80\n* Connection #0 to host harborbooks.example left intact\n* Issue another request to this URL: \'http://www.harborbooks.example/catalog\'\n*   Trying 203.0.113.20:80...\n* Connected to www.harborbooks.example (203.0.113.20) port 80\n* Connection #1 to host www.harborbooks.example left intact\n* Issue another request to this URL: \'http://www.harborbooks.example/books/\'\n* Re-using existing connection with host www.harborbooks.example\n* Connection #1 to host www.harborbooks.example left intact\n* Issue another request to this URL: \'http://www.harborbooks.example/books/winter-sale\'\n* Re-using existing connection with host www.harborbooks.example\n* Connection #1 to host www.harborbooks.example left intact' },
          { command: `curl -sv http://archive.${SITE}/ http://archive.${SITE}/ 2>&1 | grep -e '^\\*' -e '^< Connection'`, output: '*   Trying 203.0.113.25:80...\n* Connected to archive.harborbooks.example (203.0.113.25) port 80\n< Connection: close\n* Closing connection\n*   Trying 203.0.113.25:80...\n* Connected to archive.harborbooks.example (203.0.113.25) port 80\n< Connection: close\n* Closing connection' },
        ],
      },
      {
        id: 'srv03-custom', title: '方法、標頭、虛擬主機與 --resolve', machine: 'srv03-ops',
        description: '對只收 POST 的 /feedback 送 GET 得到 405；`-d` 送出 POST，回應 201 與 Location；`-A` 與 `-H` 加上的標頭出現在 `>` 的行裡；用 IP 連 api-01 時對不上虛擬主機（404），加上 Host 標頭才拿到測試環境的資料；`--resolve` 讓同一個網址連到尚未切換 DNS 的 web-02；https 網址連上 443 後停在 TLS（下一課）。',
        steps: [
          { command: `curl -s -o /dev/null -w '%{http_code}\\n' http://${WWW}/feedback`, output: '405' },
          { command: `curl -v -d 'rating=5' http://${WWW}/feedback`, output: '*   Trying 203.0.113.20:80...\n* Connected to www.harborbooks.example (203.0.113.20) port 80\n> POST /feedback HTTP/1.1\n> Host: www.harborbooks.example\n> User-Agent: curl/8.5.0\n> Accept: */*\n> Content-Length: 8\n> Content-Type: application/x-www-form-urlencoded\n>\n< HTTP/1.1 201 Created\n< Server: nginx/1.24.0 (Ubuntu)\n< Date: Sun, 22 Nov 2026 10:00:00 GMT\n< Content-Type: text/plain\n< Content-Length: 7\n< Connection: keep-alive\n< Location: http://www.harborbooks.example/feedback/731\n<\nthanks\n* Connection #0 to host www.harborbooks.example left intact' },
          { command: `curl -sv -A 'stock-check/1.0' -H 'X-Request-Id: srv03-7f2a' http://api.${SITE}/v1/orders/1042 2>&1 | grep -e '^>' -e '^{'`, output: '> GET /v1/orders/1042 HTTP/1.1\n> Host: api.harborbooks.example\n> User-Agent: stock-check/1.0\n> Accept: */*\n> X-Request-Id: srv03-7f2a\n>\n{"order":1042,"status":"paid","env":"production"}' },
          { command: `curl -s http://${API_IP}/v1/orders/1042`, output: '<html>\n<head><title>404 Not Found</title></head>\n<body>\n<center><h1>404 Not Found</h1></center>\n<hr><center>nginx/1.24.0 (Ubuntu)</center>\n</body>\n</html>' },
          { command: `curl -s -H 'Host: ${STAGING_API}' http://${API_IP}/v1/orders/1042`, output: '{"order":1042,"status":"paid","env":"staging"}' },
          { command: `curl -s -o /dev/null -w '%{remote_ip} %{http_code}\\n' http://${WWW}/`, output: '203.0.113.20 200' },
          { command: `curl -sv --resolve ${WWW}:80:${WEB02_IP} -o /dev/null http://${WWW}/ 2>&1 | grep '^\\*'`, output: '* Added www.harborbooks.example:80:203.0.113.30 to DNS cache\n* Hostname www.harborbooks.example was found in DNS cache\n*   Trying 203.0.113.30:80...\n* Connected to www.harborbooks.example (203.0.113.30) port 80\n* Connection #0 to host www.harborbooks.example left intact' },
          { command: `curl -v https://${WWW}/`, output: '*   Trying 203.0.113.20:443...\n* Connected to www.harborbooks.example (203.0.113.20) port 443\ncurl: (35) 模擬環境：HTTPS 的 TLS 交握在引擎階段 E13 才模擬；請先用 http:// 觀察 HTTP\n* Closing connection' },
        ],
      },
    ],
    exercises: [
      {
        id: 'srv03-report-code', title: '只印出狀態碼', machine: 'srv03-ops',
        statement: `監控系統說 http://${WWW}/report 有問題。用一個 curl 指令只印出它的狀態碼：輸出只有三位數字與換行（例如 418），不要印出網頁內容或任何標頭。檢查時，你的指令也會在 /report 回應其他狀態碼的情況下重新執行，直接打出數字無法通過。`,
        checks: [{ kind: 'output' }],
        solution: [`curl -s -o /dev/null -w '%{http_code}\\n' http://${WWW}/report`],
        variants: [REPORT_503, REPORT_200],
        mistakes: [
          { commands: [`curl -s -w '%{http_code}\\n' http://${WWW}/report`], why: '少了 `-o /dev/null`：錯誤頁的 HTML 照樣印到標準輸出，狀態碼接在最後一行，輸出不只三位數字。' },
          { commands: [`curl -sI http://${WWW}/report`], why: '`-I` 印出整段回應標頭（而且送的是 HEAD 不是 GET）；題目只要狀態碼這一行。' },
          { commands: [`curl -s -o /dev/null http://${WWW}/report`], why: '把本文丟掉了，卻沒有用 `-w \'%{http_code}\\n\'` 印出狀態碼，結果什麼都沒印。' },
          { commands: [`curl -s http://${WWW}/report`], why: '只印出 nginx 的錯誤頁 HTML；狀態碼要從頁面裡自己找，而且 200 時根本沒有錯誤頁。' },
        ],
        hints: ['`-w \'%{http_code}\\n\'` 在傳輸完成後印出狀態碼與換行。', '`-o /dev/null` 把本文丟掉，`-s` 不印進度與錯誤訊息。'],
        explanation: '`curl -s -o /dev/null -w \'%{http_code}\\n\' 網址` 送出 GET，把本文寫進 /dev/null，傳輸完成後只把 -w 的格式印到標準輸出。原本的情況印出 500（應用程式出錯），維護中的情況是 503，修好之後是 200；同一個指令在三種情況都正確。注意 curl 在這三種情況的結束碼都是 0：狀態碼要從 -w 的輸出判斷，或另外加上 -f。',
      },
      {
        id: 'srv03-follow-catalog', title: '追到重新導向的終點', machine: 'srv03-ops',
        statement: `舊的分類頁網址 http://${SITE}/catalog 會被重新導向好幾次。用一個 curl 指令跟著重新導向走到底，只印出一行：最後的狀態碼、一個空格、最後的網址，再換行（例如 200 http://${WWW}/x）。檢查時，你的指令也會在網站改了重新導向的情況下重新執行。`,
        checks: [{ kind: 'output' }, { kind: 'http', url: `http://${SITE}/catalog`, status: 301, header: ['Location', `http://${WWW}/catalog`] }],
        solution: [`curl -sL -o /dev/null -w '%{http_code} %{url_effective}\\n' http://${SITE}/catalog`],
        variants: [SALE_OVER, SHOP_MOVE],
        mistakes: [
          { commands: [`curl -s -o /dev/null -w '%{http_code} %{url_effective}\\n' http://${SITE}/catalog`], why: '忘了 `-L`：curl 停在第一個 301，印出的是 301 與原本的網址，不是使用者最後看到的頁面。' },
          { commands: [`curl -s -o /dev/null -w '%{http_code} %{redirect_url}\\n' http://${SITE}/catalog`], why: '`%{redirect_url}` 只是第一站的 Location；沒有 `-L` 時鏈上後面的重新導向都沒有被追蹤。' },
          { commands: [`curl -sL http://${SITE}/catalog`], why: '有跟隨重新導向，但印出的是最後一頁的 HTML，不是狀態碼與網址。' },
          { commands: [`curl -sIL http://${SITE}/catalog`], why: '列出了每一站的標頭，答案要自己從中找；題目要的是一行「狀態碼 網址」。' },
        ],
        hints: ['`-L` 讓 curl 依 Location 一直送出下一個請求。', '`%{url_effective}` 是最後請求的網址，`%{http_code}` 是最後一個回應的狀態碼；`-o /dev/null` 丟掉本文。'],
        explanation: '`-L` 跟著每個 3xx 的 Location 前進，`-w` 在整個傳輸結束後才印出，所以 %{http_code} 與 %{url_effective} 都是終點的值。原本的鏈是 harborbooks.example/catalog →（301）www 的 /catalog →（301）/books/ →（302）/books/winter-sale，最後 200；書展結束後少了 302 這一站，分類頁搬家後則終點變成 /shop/catalog。第一站一直是 301 到 www（http 檢查確認這件事），只看第一站永遠看不出這些差別。',
      },
      {
        id: 'srv03-cancel-staging', title: '對測試環境的 API 送出 POST', machine: 'srv03-ops',
        statement: `正式環境與測試環境的訂單 API 都在 api-01（${API_IP}）的同一個 nginx 上，以虛擬主機區分：正式環境是 api.${SITE}，測試環境是 ${STAGING_API}，後者沒有 DNS 記錄。請對「測試環境」取消訂單 1042：送出 POST /v1/orders/1042/cancel，並只印出 API 回應的內容（一行 JSON）。千萬不要碰到正式環境。檢查時，你的指令也會在測試訂單已經出貨的情況下重新執行。`,
        checks: [{ kind: 'output' }],
        solution: [`curl -s -X POST -H 'Host: ${STAGING_API}' http://${API_IP}/v1/orders/1042/cancel`],
        variants: [SHIPPED],
        mistakes: [
          { commands: [`curl -s -H 'Host: ${STAGING_API}' http://${API_IP}/v1/orders/1042/cancel`], why: '沒有指定方法，curl 送出 GET：這個端點只接受 POST，nginx 回 405 Not Allowed 的錯誤頁。' },
          { commands: [`curl -s -X POST http://api.${SITE}/v1/orders/1042/cancel`], why: '送錯了虛擬主機：api.harborbooks.example 是正式環境，回應裡的 env 是 production，你剛剛取消了一位真實顧客的訂單。' },
          { commands: [`curl -s -X POST http://${API_IP}/v1/orders/1042/cancel`], why: '用 IP 連線卻沒有 Host 標頭：Host 變成 203.0.113.40，對不上任何虛擬主機，nginx 回 404。' },
          { commands: [`curl -s -X POST http://${STAGING_API}/v1/orders/1042/cancel`], why: '測試環境的名稱沒有 DNS 記錄，curl 查不到名稱（錯誤 6，被 -s 隱藏），什麼都沒送出。' },
        ],
        hints: ['`-X POST` 指定方法；這個端點不需要本文。', '名稱沒有 DNS 時，網址寫 IP，再用 `-H \'Host: 名稱\'` 告訴 nginx 要哪一個虛擬主機（`--resolve` 也可以）。'],
        explanation: `網址寫 api-01 的 IP，-H 把 Host 換成 ${STAGING_API}，nginx 就交給測試環境的虛擬主機；-X POST 讓請求列變成 POST /v1/orders/1042/cancel。原本的情況回 {"order":1042,"status":"cancelled","env":"staging"}；訂單已出貨時，同一個請求得到 409 Conflict 與錯誤訊息的 JSON，你的指令照樣原封不動地印出它。用 --resolve ${STAGING_API}:80:${API_IP} 加上以名稱寫的網址也正確。送出會改變資料的請求前，先用 GET 看一次回應裡的 env，確認連到的是哪個環境。`,
      },
      {
        id: 'srv03-test-new-host', title: '在切換 DNS 之前測試新主機', machine: 'srv03-ops',
        statement: `網站要從 web-01 搬到新主機 web-02（${WEB02_IP}），DNS 還指向 web-01。請在不修改 DNS 與 /etc/hosts 的情況下，以網址 http://${WWW}/healthz 向「web-02」取得健康檢查，只印出回應的內容。檢查時，你的指令也會在 web-02 部署了另一個版本、以及健康檢查失敗的情況下重新執行。`,
        checks: [{ kind: 'output' }, { kind: 'http', url: `http://${WWW}/healthz`, body: 'web-01' }],
        solution: [`curl -s --resolve ${WWW}:80:${WEB02_IP} http://${WWW}/healthz`],
        variants: [NEW_RELEASE, NEW_BROKEN],
        mistakes: [
          { commands: [`curl -s http://${WWW}/healthz`], why: 'DNS 還指向 web-01，這樣問到的是舊主機（ok web-01 …），完全沒有測到 web-02。' },
          { commands: [`curl -s http://${WEB02_IP}/healthz`], why: '直接用 IP 時 Host 標頭是 203.0.113.30，web-02 只設定了 www 的虛擬主機，回的是 404 錯誤頁。' },
          { commands: [`curl -s --resolve ${WWW}:443:${WEB02_IP} http://${WWW}/healthz`], why: '`--resolve` 寫了 443，但 http 網址用的是 80 埠，對應不上，curl 照常查 DNS 而連到 web-01。' },
          { commands: [`echo '${WEB02_IP} ${WWW}' | sudo tee -a /etc/hosts`, `curl -s http://${WWW}/healthz`], why: '改了 /etc/hosts：這台機器上所有程式從此都連到 web-02，而且很容易忘記改回來；題目要求不動 /etc/hosts，用只影響一個指令的 --resolve。' },
        ],
        hints: ['`--resolve 名稱:埠:位址` 只在這個 curl 指令裡把名稱對應到指定的位址。', 'http 網址沒有寫埠時是 80，`--resolve` 的埠要和它一樣。'],
        explanation: `--resolve ${WWW}:80:${WEB02_IP} 讓 curl 不查 DNS，直接連到 web-02，而網址與 Host 標頭仍是 ${WWW}，所以 web-02 的虛擬主機照常回應。原本的情況印出 ok web-02 release 2026.11.3，另一個版本是 2026.11.4，健康檢查失敗時是 web-02 回應 503 的內容（加上 -w '%{http_code}' 就能一起看到狀態碼）。http 檢查確認你沒有改到這台機器的名稱解析：不帶選項的請求仍到 web-01。在 http 網址上，-H 'Host: ${WWW}' 加上以 IP 寫的網址也能得到同樣的內容；但到了 HTTPS，只有 --resolve 能讓 TLS 也用正確的名稱。`,
      },
    ],
  },
};
