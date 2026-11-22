import type { NetworkScene, NodeTable, ProtocolHeader } from '@/lib/network/model';
import type { TerminalFile, TerminalMachine, TerminalRemote, TerminalVariant } from '@/lib/terminal/lesson';
import type { LessonContent } from '../schema';

/*
 * SRV08 Load balancing (SRV-3, network-sequence). A terminal lesson on the proxy profile (engine stage E15) beside one
 * network-protocol scene. The terminal part: why scale horizontally and what the application servers must share
 * (sessions, uploaded files, the database, caches, scheduled jobs), nginx upstream blocks in conf.d with proxy_pass to the
 * group, smooth weighted round robin (a worked table of current weights) and its reset on reload, least_conn from the
 * active connections nginx keeps (declared lesson data; ss shows them) divided by the weight, ip_hash for sticky sessions
 * and its costs (NAT, the /24 key, rehashing; down instead of deleting a line; no backup), cookie stickiness in text,
 * passive health checks (max_fails, fail_timeout, proxy_next_upstream, backup, down; active checks of nginx Plus, HAProxy
 * and cloud load balancers in text), L4 against L7, and draining a server with down and a reload. The engine's clock is
 * frozen, so a server that reached max_fails stays unavailable until the next reload. The network part: six requests
 * from a laptop through lb-01 to three application servers, one of them crashed: the retry, the failure counter and the
 * server set aside after max_fails. The ticket site, its host names (.example, RFC 2606) and addresses (RFC 5737 and a
 * private 10.0.0.0/24) are made up. Every transcript output was produced by replaying it on the engine.
 */

const dir = (path: string, owner = 'root', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'root', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const link = (path: string, target: string): TerminalFile => ({ path, kind: 'link', mode: 0o777, owner: 'root', target });
/** The command that writes text to a root-owned file: printf's format (newlines as \n) piped to sudo tee, its echo discarded. */
const tee = (path: string, text: string) => `printf '${text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n')}' | sudo tee ${path} > /dev/null`;

const SITE = 'pierticket.example';
const WWW = `www.${SITE}`;
const LB_IP = '10.0.0.10';
const UP_PATH = '/etc/nginx/conf.d/pierticket-upstream.conf';
const SITE_PATH = '/etc/nginx/sites-available/pierticket';
const LOOP6 = 'for i in 1 2 3 4 5 6; do curl -s http://localhost/whoami; done';
const LOOP5 = 'for i in 1 2 3 4 5; do curl -s http://localhost/whoami; done';

/** An application server: node on 8080 answering /whoami with its own name, /healthz and the site; crashed: no process. */
const appServer = (host: string, address: string, running = true): TerminalRemote => ({
  host, address, hostKey: `${host}-key`, files: [],
  accounts: { users: [{ name: 'pier', uid: 1001 }] },
  processes: running ? [{ pid: 900, user: 'pier', command: 'node /srv/pierticket/server.js', stat: 'Ssl', listen: [{ port: 8080, fd: 18, http: 'pierticket' }] }] : [],
  responders: [{ id: 'pierticket', routes: [
    { path: '/whoami', body: `${host}\n`, type: 'text/plain' },
    { path: '/healthz', body: 'ok\n', type: 'text/plain' },
    { path: '/*', body: '<h1>碼頭售票網</h1>\n' },
  ] }],
});
const APP1 = appServer('app-01', '10.0.0.21'), APP2 = appServer('app-02', '10.0.0.22'), APP3 = appServer('app-03', '10.0.0.23');
const down = (host: string, address: string): TerminalRemote => appServer(host, address, false);

/** The site before load balancing: every request goes to app-01. */
const SITE_SINGLE = `server {
    listen 80 default_server;
    server_name ${SITE} ${WWW};

    location / {
        proxy_pass http://10.0.0.21:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
`;
/** The site in front of the group; X-Upstream shows which server answered (for this lesson's tests, not for production). */
const SITE_POOL = `server {
    listen 80 default_server;
    server_name ${SITE} ${WWW};

    location / {
        proxy_pass http://pierticket_app;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        add_header X-Upstream $upstream_addr always;
    }
}
`;
const upstream = (lines: string[]) => `upstream pierticket_app {\n${lines.map(l => `    ${l}\n`).join('')}}\n`;
const UP_EQUAL = upstream(['server 10.0.0.21:8080;', 'server 10.0.0.22:8080;', 'server 10.0.0.23:8080;']);
const UP_EX1 = upstream(['server 10.0.0.21:8080;', 'server 10.0.0.22:8080;', 'server 10.0.0.23:8080 weight=2;']);
const UP_WEIGHTED = upstream(['server 10.0.0.21:8080 weight=3;', 'server 10.0.0.22:8080 weight=2;', 'server 10.0.0.23:8080;']);
const UP_LEAST_PLAIN = upstream(['least_conn;', 'server 10.0.0.21:8080;', 'server 10.0.0.22:8080;', 'server 10.0.0.23:8080;']);
const UP_LEAST = upstream(['least_conn;', 'server 10.0.0.21:8080 weight=3;', 'server 10.0.0.22:8080 weight=2;', 'server 10.0.0.23:8080;']);
const UP_BACKUP = upstream(['server 10.0.0.21:8080 weight=3;', 'server 10.0.0.22:8080 weight=2;', 'server 10.0.0.23:8080 backup;']);
const UP_STICKY = upstream(['ip_hash;', 'server 10.0.0.21:8080;', 'server 10.0.0.22:8080;', 'server 10.0.0.23:8080;']);
const UP_STICKY_DRAIN = upstream(['ip_hash;', 'server 10.0.0.21:8080;', 'server 10.0.0.22:8080;', 'server 10.0.0.23:8080 down;']);
const UP_FAILOVER = upstream(['server 10.0.0.21:8080 max_fails=2 fail_timeout=30s;', 'server 10.0.0.22:8080 max_fails=2 fail_timeout=30s;', 'server 10.0.0.23:8080 max_fails=2 fail_timeout=30s;']);
const UP_FAILOVER_DOWN = upstream(['server 10.0.0.21:8080 max_fails=2 fail_timeout=30s;', 'server 10.0.0.22:8080 max_fails=2 fail_timeout=30s down;', 'server 10.0.0.23:8080 max_fails=2 fail_timeout=30s;']);

const home = [dir('/home'), dir('/home/learner', 'learner')];
const sudo = { groups: [{ name: 'sudo', members: ['learner'] }] };
/** lb-01's files: the site (linked in sites-enabled) and, when given, the upstream group in conf.d. */
const lbFiles = (site: string, up?: string): TerminalFile[] => [...home,
  dir('/etc'), dir('/etc/nginx'), dir('/etc/nginx/conf.d'), ...up ? [file(UP_PATH, up)] : [],
  dir('/etc/nginx/sites-available'), file(SITE_PATH, site),
  dir('/etc/nginx/sites-enabled'), link('/etc/nginx/sites-enabled/pierticket', SITE_PATH)];
const lb = (id: string, title: string, site: string, up: string | undefined, remotes: TerminalRemote[], extra: Partial<TerminalMachine> = {}): TerminalMachine => ({
  id, title, user: 'learner', cwd: '/home/learner', host: 'lb-01', address: LB_IP, profile: 'proxy', nginx: true, accounts: sudo,
  files: lbFiles(site, up), remotes, ...extra,
});

/** The requests nginx has in progress to each server right now: the ESTAB sockets (ss) and nginx's own counts (least_conn). */
const ACTIVE: [string, number][] = [['10.0.0.21', 12], ['10.0.0.22', 5], ['10.0.0.23', 3]];

const single = lb('srv08-single', 'lb-01（只有一台後端）', SITE_SINGLE, undefined, [APP1, APP2, APP3]);
const pool = lb('srv08-pool', 'lb-01（加權輪詢的三台後端）', SITE_POOL, UP_WEIGHTED, [APP1, APP2, APP3], {
  upstreamConnections: ACTIVE.map(([a, n]) => ({ upstream: 'pierticket_app', server: `${a}:8080`, connections: n })),
  connections: ACTIVE.flatMap(([a, n], k) => Array.from({ length: n }, (_, j) => ({ local: `${LB_IP}:${41000 + k * 100 + j}`, peer: `${a}:8080` }))),
});
const sticky = lb('srv08-sticky', 'lb-01（ip_hash 黏著連線）', SITE_POOL, UP_STICKY, [APP1, APP2, APP3]);
const failover = lb('srv08-failover', 'lb-01（app-02 的程式當掉了）', SITE_POOL, UP_FAILOVER, [APP1, down('app-02', '10.0.0.22'), APP3]);

const APP3_DOWN: TerminalVariant = { label: 'app-03 剛好停機的另一天', files: [], remotes: [down('app-03', '10.0.0.23')] };
const APP1_DOWN: TerminalVariant = { label: 'app-01 剛好停機的另一天', files: [], remotes: [down('app-01', '10.0.0.21')] };
const APP2_DOWN: TerminalVariant = { label: 'app-02 正在重新開機', files: [], remotes: [down('app-02', '10.0.0.22')] };
const APP23_DOWN: TerminalVariant = { label: 'app-02 與 app-03 都在更新', files: [], remotes: [down('app-02', '10.0.0.22'), down('app-03', '10.0.0.23')] };
const APP12_DOWN: TerminalVariant = { label: 'app-01 與 app-02 同時當掉', files: [], remotes: [down('app-01', '10.0.0.21'), down('app-02', '10.0.0.22')] };

// ---- network scene -----------------------------------------------------------------------------------------------
const LAPTOP = '198.51.100.23', LB_PUBLIC = '203.0.113.10';
const ipv4 = (from: string, to: string): ProtocolHeader => ({ layer: 'network', protocol: 'IPv4', fields: [{ name: '來源 IP', value: from }, { name: '目的 IP', value: to }] });
const tcp = (from: string, to: string, flags: string): ProtocolHeader => ({ layer: 'transport', protocol: 'TCP', fields: [
  { name: '來源連接埠', value: from }, { name: '目的連接埠', value: to }, { name: '旗標', value: flags }] });
const clientGet: ProtocolHeader = { layer: 'application', protocol: 'HTTP/1.1', fields: [
  { name: '方法', value: 'GET' }, { name: '路徑', value: '/whoami' }, { name: '版本', value: 'HTTP/1.1' },
  { name: 'Host', value: WWW }, { name: 'User-Agent', value: 'curl/8.5.0' }, { name: 'Accept', value: '*/*' }] };
const proxiedGet: ProtocolHeader = { layer: 'application', protocol: 'HTTP/1.0', fields: [
  { name: '方法', value: 'GET' }, { name: '路徑', value: '/whoami' }, { name: '版本', value: 'HTTP/1.0' },
  { name: 'Host', value: WWW }, { name: 'X-Forwarded-For', value: LAPTOP }, { name: 'Connection', value: 'close' },
  { name: 'User-Agent', value: 'curl/8.5.0' }, { name: 'Accept', value: '*/*' }] };
const appOk: ProtocolHeader = { layer: 'application', protocol: 'HTTP/1.1', fields: [
  { name: '版本', value: 'HTTP/1.1' }, { name: '狀態碼', value: '200' }, { name: '原因片語', value: 'OK' },
  { name: 'Content-Type', value: 'text/plain' }, { name: 'Content-Length', value: '7' }] };
const lbOk = (upstreamAddr: string): ProtocolHeader => ({ layer: 'application', protocol: 'HTTP/1.1', fields: [
  { name: '版本', value: 'HTTP/1.1' }, { name: '狀態碼', value: '200' }, { name: '原因片語', value: 'OK' },
  { name: 'Server', value: 'nginx/1.24.0 (Ubuntu)' }, { name: 'Content-Type', value: 'text/plain' }, { name: 'Content-Length', value: '7' },
  { name: 'Connection', value: 'keep-alive' }, { name: 'X-Upstream', value: upstreamAddr }] });

const POOL_TABLE = 'upstream pierticket_app';
const POOL_HEAD = ['server', 'fails', '狀態'];
const pool3 = (fails2: string, state2: string, changed?: number[]): NodeTable => ({ node: 'lb', name: POOL_TABLE, head: POOL_HEAD, rows: [
  ['10.0.0.21:8080', '0', '可用'], ['10.0.0.22:8080', fails2, state2], ['10.0.0.23:8080', '0', '可用']], ...changed ? { changed } : {} });
const ERR = (n: number) => `2026/11/22 10:00:00 [error] 813#813: *${n} connect() failed (111: Connection refused) while connecting to upstream, client: ${LAPTOP}, server: ${SITE}, request: "GET /whoami HTTP/1.1", upstream: "http://10.0.0.22:8080/whoami", host: "${WWW}"`;
const errorLog = (rows: string[], changed: number[]): NodeTable => ({ node: 'lb', name: 'error.log', head: ['行', '紀錄'], rows: rows.map((r, i) => [String(i + 1), r]), changed });
const ONE_FAIL = '可用（30 秒內再失敗 1 次就暫停）';
const SET_ASIDE = '暫停使用 30 秒（fail_timeout）';

/** Section 5: requests 1, 2, 5 and 6 of a loop of six, from a laptop through lb-01 to three servers, app-02 crashed. */
const requestPath: NetworkScene = {
  id: 'srv08-request-path', title: '輪詢遇上一台當掉的後端：重試、失敗計數與暫停使用', model: 'tcp-ip',
  description: `筆電（${LAPTOP}）連續送出 6 個 \`curl http://${WWW}/whoami\`。lb-01 對外是 ${LB_PUBLIC}，在內部網段 10.0.0.0/24 上是 ${LB_IP}，它的 upstream pierticket_app 有三台權重相同的後端，每台都設了 max_fails=2 fail_timeout=30s。app-02 的程式剛剛當掉：主機還在，8080 埠卻沒有程式。圖中畫出第 1、2、5、6 個請求；第 3、4 個請求分別由 app-03 與 app-01 正常回應，略去不畫。每個請求都是一條新的 TCP 連線，nginx 到後端也是（預設送出 Connection: close）。`,
  nodes: [
    { id: 'client', label: '筆電（curl）', kind: 'host', addresses: [`IP ${LAPTOP}`] },
    { id: 'lb', label: 'lb-01（nginx 1.24）', kind: 'server', addresses: [`IP ${LB_PUBLIC}（對外）`, `IP ${LB_IP}（內部）`] },
    { id: 'app1', label: 'app-01', kind: 'server', addresses: ['IP 10.0.0.21', 'TCP 8080'] },
    { id: 'app2', label: 'app-02（程式當掉）', kind: 'server', addresses: ['IP 10.0.0.22', 'TCP 8080 沒有程式'] },
    { id: 'app3', label: 'app-03', kind: 'server', addresses: ['IP 10.0.0.23', 'TCP 8080'] },
  ],
  messages: [
    { id: 'req1', from: 'client', to: 'lb', label: 'GET /whoami（第 1 個請求）',
      headers: [clientGet, tcp('52301', '80', 'PSH, ACK'), ipv4(LAPTOP, LB_PUBLIC)],
      payload: `GET /whoami HTTP/1.1\nHost: ${WWW}\nUser-Agent: curl/8.5.0\nAccept: */*`,
      note: '三向交握之後，請求到了 lb-01。location / 的 proxy_pass 指向 upstream pierticket_app，nginx 依輪詢選一台：三台的權重都是 1、都沒有失敗過，第一個請求輪到排在最前面的 app-01。表格是 nginx 替這個 upstream 記下的狀態，fails 是在 fail_timeout 的時間內失敗了幾次。',
      tables: [pool3('0', '可用')] },
    { id: 'fwd1', from: 'lb', to: 'app1', label: 'GET /whoami（轉送給 app-01）',
      headers: [proxiedGet, tcp('41870', '8080', 'PSH, ACK'), ipv4(LB_IP, '10.0.0.21')],
      payload: `GET /whoami HTTP/1.0\nHost: ${WWW}\nX-Forwarded-For: ${LAPTOP}\nConnection: close\nUser-Agent: curl/8.5.0\nAccept: */*`,
      note: `nginx 以自己的內部位址 ${LB_IP} 另外開一條 TCP 連線到 app-01 的 8080 埠，送出一個新的請求：請求列預設是 HTTP/1.0 並加上 Connection: close，Host 與 X-Forwarded-For 來自設定的 proxy_set_header。對 app-01 來說，連線的對方是 lb-01，真正的用戶端只記在 X-Forwarded-For 裡。` },
    { id: 'ok1', from: 'app1', to: 'lb', label: '200 OK（app-01）',
      headers: [appOk, tcp('8080', '41870', 'PSH, ACK'), ipv4('10.0.0.21', LB_IP)],
      payload: 'HTTP/1.1 200 OK\n…\n\napp-01',
      note: 'app-01 回應自己的名字。這次嘗試成功，app-01 的 fails 維持 0。' },
    { id: 'resp1', from: 'lb', to: 'client', label: '200 OK（X-Upstream: 10.0.0.21:8080）',
      headers: [lbOk('10.0.0.21:8080'), tcp('80', '52301', 'PSH, ACK'), ipv4(LB_PUBLIC, LAPTOP)],
      payload: 'HTTP/1.1 200 OK\nServer: nginx/1.24.0 (Ubuntu)\n…\nX-Upstream: 10.0.0.21:8080\n\napp-01',
      note: 'nginx 把 app-01 的回應換上自己的 Server、Date 標頭交給筆電，再依 add_header 加上 X-Upstream：$upstream_addr 是這個請求試過的後端位址。用戶端從頭到尾只和 lb-01 說話，不知道後面有幾台伺服器。' },
    { id: 'req2', from: 'client', to: 'lb', label: 'GET /whoami（第 2 個請求）',
      headers: [clientGet, tcp('52302', '80', 'PSH, ACK'), ipv4(LAPTOP, LB_PUBLIC)],
      payload: `GET /whoami HTTP/1.1\nHost: ${WWW}\nUser-Agent: curl/8.5.0\nAccept: */*`,
      note: '第二個請求是新的連線（來源連接埠 52302）。輪詢輪到 app-02：nginx 還不知道它當掉了，被動的健康檢查只能從真實的請求得知後端的狀況。',
      tables: [pool3('0', '可用')] },
    { id: 'syn2', from: 'lb', to: 'app2', label: 'SYN（連線到 app-02:8080）',
      headers: [tcp('41871', '8080', 'SYN'), ipv4(LB_IP, '10.0.0.22')],
      payload: '沒有資料',
      note: 'nginx 先建立 TCP 連線。app-02 這台主機還開著，它的核心會回應這個 SYN。' },
    { id: 'rst2', from: 'app2', to: 'lb', label: 'RST, ACK（Connection refused）',
      headers: [tcp('8080', '41871', 'RST, ACK'), ipv4('10.0.0.22', LB_IP)],
      payload: '沒有資料',
      note: '8080 埠上沒有程式在監聽，app-02 的核心回 RST：connect() 失敗（111: Connection refused）。這是一次失敗的嘗試，nginx 在 error.log 寫下一行，app-02 的 fails 變成 1；max_fails 是 2，還沒達到，所以 app-02 仍算可用。如果整台主機關機，SYN 不會有任何回應，nginx 要等到 proxy_connect_timeout（預設 60 秒）才算失敗，使用者也跟著等。',
      tables: [pool3('1', ONE_FAIL, [1]), errorLog([ERR(2)], [0])] },
    { id: 'retry2', from: 'lb', to: 'app3', label: 'GET /whoami（重試，轉送給 app-03）',
      headers: [proxiedGet, tcp('41872', '8080', 'PSH, ACK'), ipv4(LB_IP, '10.0.0.23')],
      payload: `GET /whoami HTTP/1.0\nHost: ${WWW}\nX-Forwarded-For: ${LAPTOP}\nConnection: close\nUser-Agent: curl/8.5.0\nAccept: */*`,
      note: 'proxy_next_upstream 的預設是 error timeout：連線錯誤或逾時就把同一個請求交給下一台。GET 是冪等的方法，重送沒有副作用（POST 這類非冪等的請求一旦已經送到後端，nginx 1.9.13 起預設不再重試）。這次在 app-02 以外的後端中選，選中 app-03。' },
    { id: 'ok2', from: 'app3', to: 'lb', label: '200 OK（app-03）',
      headers: [appOk, tcp('8080', '41872', 'PSH, ACK'), ipv4('10.0.0.23', LB_IP)],
      payload: 'HTTP/1.1 200 OK\n…\n\napp-03',
      note: 'app-03 正常回應，它的 fails 維持 0。' },
    { id: 'resp2', from: 'lb', to: 'client', label: '200 OK（X-Upstream 有兩個位址）',
      headers: [lbOk('10.0.0.22:8080, 10.0.0.23:8080'), tcp('80', '52302', 'PSH, ACK'), ipv4(LB_PUBLIC, LAPTOP)],
      payload: 'HTTP/1.1 200 OK\nServer: nginx/1.24.0 (Ubuntu)\n…\nX-Upstream: 10.0.0.22:8080, 10.0.0.23:8080\n\napp-03',
      note: '使用者拿到 200，看不出有一台後端當掉；只有 $upstream_addr 依序列出這個請求試過的每一台（以逗號分隔），error.log 也留下了紀錄。這就是被動健康檢查加上重試的效果：錯誤被 nginx 吸收，代價是多一次連線的時間。' },
    { id: 'req5', from: 'client', to: 'lb', label: 'GET /whoami（第 5 個請求）',
      headers: [clientGet, tcp('52305', '80', 'PSH, ACK'), ipv4(LAPTOP, LB_PUBLIC)],
      payload: `GET /whoami HTTP/1.1\nHost: ${WWW}\nUser-Agent: curl/8.5.0\nAccept: */*`,
      note: '第 3、4 個請求由 app-03 與 app-01 回應（圖略）。app-02 失敗一次之後仍是「可用、失敗 1 次」，平滑加權輪詢照樣會輪到它：第 5 個請求又選中 app-02。',
      tables: [pool3('1', ONE_FAIL)] },
    { id: 'syn5', from: 'lb', to: 'app2', label: 'SYN（再一次連線到 app-02:8080）',
      headers: [tcp('41875', '8080', 'SYN'), ipv4(LB_IP, '10.0.0.22')],
      payload: '沒有資料',
      note: '和第 2 個請求一樣，nginx 先送 SYN。' },
    { id: 'rst5', from: 'app2', to: 'lb', label: 'RST, ACK（第二次失敗）',
      headers: [tcp('8080', '41875', 'RST, ACK'), ipv4('10.0.0.22', LB_IP)],
      payload: '沒有資料',
      note: '第二次被拒絕。30 秒（fail_timeout）內的失敗次數達到 max_fails=2，nginx 把 app-02 暫停使用：接下來的 30 秒不再選它，時間到了才用一個真實的請求再試，成功就把 fails 歸零。nginx 這時另外記一則 warn 等級的 upstream server temporarily disabled，Ubuntu 的 error_log 只記 error 以上，所以 error.log 看得到的是第二行 connect() failed。',
      tables: [pool3('2', SET_ASIDE, [1]), errorLog([ERR(2), ERR(5)], [1])] },
    { id: 'retry5', from: 'lb', to: 'app3', label: 'GET /whoami（重試，轉送給 app-03）',
      headers: [proxiedGet, tcp('41876', '8080', 'PSH, ACK'), ipv4(LB_IP, '10.0.0.23')],
      payload: `GET /whoami HTTP/1.0\nHost: ${WWW}\nX-Forwarded-For: ${LAPTOP}\nConnection: close\nUser-Agent: curl/8.5.0\nAccept: */*`,
      note: '請求再一次交給 app-03，使用者仍然得到 200（回應的箭頭略去不畫），X-Upstream 同樣是 10.0.0.22:8080, 10.0.0.23:8080。' },
    { id: 'req6', from: 'client', to: 'lb', label: 'GET /whoami（第 6 個請求）',
      headers: [clientGet, tcp('52306', '80', 'PSH, ACK'), ipv4(LAPTOP, LB_PUBLIC)],
      payload: `GET /whoami HTTP/1.1\nHost: ${WWW}\nUser-Agent: curl/8.5.0\nAccept: */*`,
      note: '這一次 nginx 選擇時直接跳過暫停中的 app-02，只在 app-01 與 app-03 之間輪詢，選中 app-01：沒有被拒絕的連線，也沒有新的錯誤日誌。30 秒後 app-02 會被再試一次，若仍然當掉就再暫停 30 秒。本課的模擬環境時鐘不前進，所以在終端機裡，暫停會一直持續到下一次 reload。',
      tables: [pool3('2', SET_ASIDE)] },
  ],
};

/** Exercise 1's site: the single-backend site with proxy_pass pointed at the group (nothing else changes). */
const SITE_EX1 = SITE_SINGLE.replace('http://10.0.0.21:8080', 'http://pierticket_app');
const indent = (text: string) => text.trimEnd().split('\n').map(l => `    ${l}`).join('\n');

export const SRV08: LessonContent = {
  lessonId: 'SRV08',
  motivation: `碼頭售票網（${WWW}）賣往返離島的船票，平常一台後端 app-01 就夠用；每到連假開賣，CPU 滿載、請求排隊，前面的 nginx 開始回 504。換一台更大的機器只能撐一陣子，而且它一壞整個網站就停了。這一課把流量分給三台後端：在 lb-01 的 nginx 用 upstream 區塊列出它們，看懂輪詢與權重決定的分配順序、least_conn 什麼時候比輪詢好、ip_hash 黏著連線要付出的代價，設定被動的健康檢查讓當掉的後端自動被避開、讓備援的機器在其他台都倒下時接手，分清 L4 與 L7 的負載平衡，最後學會用 down 與 reload 把一台後端排空、安心維護。`,
  sections: [
    {
      id: 'srv08-s-scale', title: '水平擴展：多台後端，共用的狀態',
      blocks: [
        { type: 'p', text: '碼頭售票網的程式跑在 app-01 上，前面由 lb-01 的 nginx 反向代理。流量變大時有兩條路。垂直擴展（scale up）是換一台更大的機器：程式不用改，但規格有上限、升級要停機，而且它壞了網站就停了。水平擴展（scale out）是多開幾台一樣的後端，由負載平衡器（load balancer）把請求分給它們：容量可以一台一台加，一台壞了其他台還在，但程式必須讓任何一台都能處理任何一個請求。' },
        { type: 'table', head: ['', '垂直擴展（scale up）', '水平擴展（scale out）'], rows: [
          ['做法', '換 CPU 與記憶體更多的機器', '增加相同的後端，前面放負載平衡器'],
          ['上限', '買得到的最大機器', '大致是共用的部分（資料庫、session 儲存）撐得住多少'],
          ['故障', '那一台就是單點故障', '一台壞了，其他台繼續服務'],
          ['對程式的要求', '幾乎沒有', '後端不能把狀態只留在自己身上'],
        ] },
        { type: 'p', text: '最後一列是水平擴展真正的門檻。同一位使用者連續的幾個請求，可能分別落在 app-01、app-02、app-03，凡是只存在某一台的東西，到了下一個請求就「消失」了：' },
        { type: 'table', head: ['狀態', '只放在一台會怎樣', '共用的做法'], rows: [
          ['登入的 session、購物車（存在程式的記憶體）', '下一個請求到了別台，使用者被登出、購物車變空', '放到共用的 session 儲存（例如 Redis 或資料庫），或只把少量資料放進有簽章的 cookie；不得已才用黏著連線（第 4 節）'],
          ['使用者上傳的檔案（寫在本機磁碟）', '只有處理上傳的那一台有，其他台回 404', '共用的檔案系統（例如 NFS）或物件儲存'],
          ['資料庫', '每台各有一份資料，彼此不一致', '所有後端連到同一個資料庫；資料庫自己的擴展要靠複寫與分片'],
          ['本機的快取', '各台的快取內容不同，資料更新後有些頁面還是舊的', '共用的快取（Redis、Memcached），或接受短暫的不一致並設短的 TTL'],
          ['排程工作（cron）', '三台裝了同一個 crontab，每天的對帳執行三次', '只在一台排程，或用鎖確保同一時間只有一台執行'],
        ] },
        { type: 'p', text: 'nginx 當負載平衡器時，用 `upstream` 區塊替一組後端取一個名字，再讓 `proxy_pass http://名字` 指向它。upstream 屬於 http 區塊，Ubuntu 上常放在 /etc/nginx/conf.d/ 的一個 .conf 檔：nginx.conf 在 http 區塊裡 include conf.d/*.conf，排在 sites-enabled 之前。proxy_pass 的名字後面不能再寫埠號（`upstream "pierticket_app" may not have port 8080`），埠寫在每一行 server 上。下面先看只轉給 app-01 的 lb-01，再把三台放進同一個 upstream。' },
        { type: 'example', id: 'srv08-scale-out' },
        { type: 'callout', tone: 'warning', title: '常見誤解：多開幾台後端，網站就會等比例變快', text: '負載平衡只分散後端程式的工作。session 還存在記憶體裡，使用者會不斷被登出；瓶頸其實是資料庫的話，三台後端只是讓更多查詢同時擠向它；負載平衡器自己也成了新的單點故障，正式環境通常再用兩台負載平衡器加上浮動 IP（例如 keepalived 的 VRRP），或直接使用雲端的負載平衡服務。擴展之前先找出瓶頸，並確認後端是無狀態的。' },
      ],
    },
    {
      id: 'srv08-s-rr', title: 'upstream 區塊：輪詢與權重',
      blocks: [
        { type: 'p', text: 'upstream 區塊裡每一行 `server` 是一台後端：位址:埠（也可以寫主機名稱，nginx 在載入設定時解析一次），後面可以接參數：' },
        { type: 'table', head: ['參數', '預設', '作用'], rows: [
          ['`weight=N`', '1', '權重：輪詢依比例分配，weight=3 的後端拿到的請求約是 weight=1 的三倍'],
          ['`max_fails=N`', '1', '在 fail_timeout 的時間內失敗幾次就暫停使用；0 表示不判斷（第 5 節）'],
          ['`fail_timeout=時間`', '10s', '同時是「計算失敗次數的時間窗」與「暫停使用多久」'],
          ['`backup`', '無', '備援：只有所有主要的後端都不能用時才收到請求'],
          ['`down`', '無', '停用，永遠不送請求過去（維護用）'],
          ['`max_conns=N`', '0（不限）', '同時連到這台的連線上限'],
        ] },
        { type: 'p', text: '沒有指定方法時，nginx 用加權輪詢（weighted round robin）。它不是「先給 app-01 三個、再給 app-02 兩個」，而是平滑加權輪詢：每次選擇時，每台的「目前值」加上自己的權重，選目前值最大的一台（相同時選排在前面的），被選中的再減去全部權重的總和。權重大的後端拿到較多請求，卻不會連續拿到一大串。以權重 3、2、1 的 app-01、app-02、app-03 為例（總和 6）：' },
        { type: 'table', head: ['第幾個請求', '加上權重後的目前值（01、02、03）', '選中', '選中者減去 6 之後'], rows: [
          ['1', '3、2、1', 'app-01', '−3、2、1'],
          ['2', '0、4、2', 'app-02', '0、−2、2'],
          ['3', '3、0、3', 'app-01（和 app-03 一樣大，選前面的）', '−3、0、3'],
          ['4', '0、2、4', 'app-03', '0、2、−2'],
          ['5', '3、4、−1', 'app-02', '3、−2、−1'],
          ['6', '6、0、0', 'app-01', '0、0、0'],
        ] },
        { type: 'p', text: '六個請求依序是 app-01、app-02、app-01、app-03、app-02、app-01：比例正好 3：2：1，目前值全部歸零，下一輪從頭開始。同樣的算法讓權重 5、1、1 得到 a a b a c a a，而不是 a a a a a b c。幾個實務上的細節：這些目前值存在 worker 的記憶體裡，reload 換上新的 worker，順序就從頭開始；真實的 nginx 有好幾個 worker 時，每個 worker 各自輪詢（除非 upstream 加上 `zone` 共用狀態），所以從外面看順序會交錯，長時間的比例仍然正確，模擬環境則只有一份狀態。為了觀察，本課的網站加上 `add_header X-Upstream $upstream_addr always;`，把處理請求的後端位址放進回應標頭；正式環境不該把內部位址送給用戶端，除錯完就拿掉。' },
        { type: 'example', id: 'srv08-weighted' },
      ],
    },
    {
      id: 'srv08-s-least-conn', title: '最少連線：依進行中的連線數選擇',
      blocks: [
        { type: 'p', text: '輪詢假設每個請求的工作量差不多。售票網的「匯出訂單報表」一次要跑十幾秒，即時座位圖用的 WebSocket 一連就是好幾分鐘；輪詢照樣按順序把新請求送給已經塞滿長請求的那一台。`least_conn` 改成選「進行中的連線最少」的後端，並且把權重算進去：nginx 比較每台的「連線數 ÷ 權重」，最小的勝出；一樣小時，在它們之間照加權輪詢。' },
        { type: 'table', head: ['後端', 'weight', '進行中的連線', '連線數 ÷ 權重'], rows: [
          ['app-01', '3', '12', '4'],
          ['app-02', '2', '5', '2.5'],
          ['app-03', '1', '3', '3'],
        ] },
        { type: 'p', text: '只看連線數，最少的是 app-03（3 條）；把權重算進去，最小的是 app-02（2.5）。所以保留權重時 least_conn 選 app-02，拿掉權重才是 app-03。連線數是 nginx 自己記的：開始轉送一個請求就加一、結束就減一；在負載平衡器上，`ss -tn dport = :8080` 列出它連往各後端的連線。模擬環境的請求是瞬間完成的，連線數不會因為 curl 而改變，它來自課程設定好的資料，所以連續幾個請求都選同一台；真實的 nginx 每多轉送一個請求，那台就多一條連線，下一個請求可能就換人了。' },
        { type: 'table', head: ['方法', '怎麼選', '適合', '要注意'], rows: [
          ['輪詢（預設）', '依序輪流，可以加權重', '請求短、工作量相近', '不看後端現在忙不忙'],
          ['`least_conn`', '進行中的連線數 ÷ 權重最小', '處理時間差異大、長連線（WebSocket）', '只算這台負載平衡器自己的連線；有多台負載平衡器時各算各的'],
          ['`ip_hash`', '用戶端 IPv4 位址的前三個位元組做雜湊', '需要同一位使用者回到同一台（第 4 節）', '分配可能很不平均；不能用 backup'],
          ['`hash 鍵 [consistent]`', '依自訂的鍵（例如 $request_uri）做雜湊', '快取伺服器：同一個網址固定到同一台', '本課的模擬環境不支援'],
        ] },
        { type: 'example', id: 'srv08-least-conn' },
      ],
    },
    {
      id: 'srv08-s-sticky', title: '黏著連線：ip_hash 與它的代價',
      blocks: [
        { type: 'p', text: '程式把 session 放在記憶體、一時又改不了時，可以讓同一位使用者的請求一直回到同一台，這叫黏著連線（sticky session，也叫 session affinity）。開源版 nginx 內建的做法是 `ip_hash`：以用戶端的位址做雜湊，同一個位址永遠得到同一台。它用的是 IPv4 位址的前三個位元組，也就是整個 /24 網段算同一個鍵（IPv6 用整個位址）；只要後端的數量不變、也沒有後端故障，結果就不會變。代價有好幾個：' },
        { type: 'list', items: [
          '分配不平均：公司、學校與行動網路常用 NAT 讓成千上萬人共用一個公開位址，nginx 眼中他們是同一個用戶端，全部落在同一台；同一個 /24 的用戶端也一樣。',
          '前面還有代理或 CDN 時，nginx 看到的 $remote_addr 全是代理的位址，所有人都黏在同一台（要先用 realip 模組依 X-Forwarded-For 換回真正的用戶端位址）。',
          '黏著不是備援：那台當掉，黏在上面的使用者照樣失去 session，只是被重新雜湊到別台。',
          '後端的數量一變，雜湊的結果就跟著變。所以暫時拿掉一台要標 `down`，不要刪掉那一行：標 down 時，原本分到其他台的使用者維持不動，只有原本在那台的人換位置（nginx 文件的建議）；刪掉一行則會讓許多其他使用者也換到別台。',
          'ip_hash 不能和 `backup` 一起用，`nginx -t` 會回報 `invalid parameter "backup"`。',
        ] },
        { type: 'p', text: '另一種黏著以 cookie 為準：負載平衡器在第一次回應時設一個記錄後端的 cookie，之後依 cookie 送回同一台，例如 nginx Plus 的 `sticky cookie`、HAProxy 的 `cookie` 設定與雲端負載平衡器的 session affinity；開源的 nginx 也能用 `hash $cookie_名稱 consistent` 依應用程式自己的 session cookie 做雜湊（本課的模擬環境不支援 hash）。cookie 以瀏覽器為單位，不受 NAT 影響，分配比 ip_hash 平均；但後端當掉時一樣會失去 session。根本的解法仍是把 session 搬到共用的儲存，讓任何一台都能處理任何請求，就不需要黏著連線了。' },
        { type: 'example', id: 'srv08-ip-hash' },
        { type: 'callout', tone: 'warning', title: '常見誤解：有了黏著連線，後端就能放心把狀態存在自己身上', text: '黏著只是「盡量」把使用者送回同一台：那台當機、被標成 down 維護，或 upstream 的成員一改變，使用者就會被送到沒有他 session 的伺服器。黏著也讓負載平衡失去彈性，最忙的那台無法把使用者分出去。把它當成過渡的手段，最後仍要讓 session 共用。' },
      ],
    },
    {
      id: 'srv08-s-health', title: '健康檢查：自動避開故障的後端',
      blocks: [
        { type: 'p', text: '開源版 nginx 的健康檢查是被動的：它不另外探測後端，而是觀察真實請求的結果。一次嘗試算不算失敗由 `proxy_next_upstream` 決定：連線錯誤（error）、逾時（timeout）與無效的回應標頭一定算；http_500、http_502、http_503、http_504、http_429 只有寫在 proxy_next_upstream 裡才算；403 與 404 永遠不算。在 fail_timeout 的時間內失敗次數達到 max_fails，這台就暫停使用 fail_timeout 那麼久；時間到了，nginx 再用一個真實的請求試它，成功就把失敗次數歸零。' },
        { type: 'p', text: '失敗的請求本身會交給下一台重試（proxy_next_upstream 預設是 `error timeout`），所以使用者通常只覺得慢了一點。慢多少要看失敗的方式：程式當掉而主機還在，核心立刻回 RST，幾乎不花時間；整台主機關機或網路斷了，nginx 要等 `proxy_connect_timeout`（預設 60 秒）才放棄，最好依內部網路的狀況調短。POST 這類非冪等的請求一旦已經送到後端，nginx 不會自動重送（1.9.13 起），以免重複下單。' },
        { type: 'table', head: ['設定或狀況', '這台後端的狀態', '什麼時候收到請求'], rows: [
          ['一般', '可用', '分配方法輪到它時'],
          ['失敗達到 `max_fails` 次', '暫停 fail_timeout', '暫停期間不會；時間到了再試一次'],
          ['`backup`', '備援', '所有主要的後端都不能用（暫停或 down）時才會'],
          ['`down`', '停用', '永遠不會，直到拿掉 down 並 reload'],
        ] },
        { type: 'p', text: '主動的健康檢查則由負載平衡器定期送請求到每台後端的健康檢查網址（例如 /healthz），在任何使用者碰到之前就發現它壞了，也能等它恢復之後才放回去。這是 nginx Plus 的 `health_check` 指令、HAProxy 的 `option httpchk` 與雲端負載平衡器的健康檢查設定提供的功能，開源版的 nginx 沒有。需要手動確認時，可以在負載平衡器上直接 `curl -sS http://10.0.0.22:8080/healthz`。' },
        { type: 'callout', tone: 'note', title: '模擬環境的時鐘不前進', text: 'fail_timeout 是一段時間，而本課機器的時鐘固定在 2026-11-22 10:00:00 UTC，不會前進。所以在終端機裡，達到 max_fails 的後端會一直暫停，直到下一次 reload：reload 換上新的 worker，失敗次數與輪詢的狀態都重新開始。真實的 nginx 會在 fail_timeout 之後自己再試。' },
        { type: 'example', id: 'srv08-passive' },
        { type: 'p', text: '下面的情境把同樣的事放到網路上看：筆電的請求經過 lb-01，第一次碰到當掉的 app-02 時被重試到 app-03，第二次失敗之後 app-02 被暫停使用。' },
        { type: 'example', id: 'srv08-request-path' },
      ],
    },
    {
      id: 'srv08-s-l4l7', title: 'L4 與 L7，以及把一台後端排空維護',
      blocks: [
        { type: 'p', text: '負載平衡器依它看得到的層次分成兩類。L4（傳輸層）只看 IP 位址、埠與 TCP 或 UDP，以「連線」為單位把位元組原封不動轉給後端；L7（應用層）把 HTTP 請求整個讀進來，以「請求」為單位決定送去哪裡。本課在 nginx 的 http 區塊裡用的 upstream 是 L7；nginx 的 `stream` 模組則做 L4。' },
        { type: 'table', head: ['', 'L4（傳輸層）', 'L7（應用層）'], rows: [
          ['看得到什麼', '來源與目的 IP、埠、TCP 或 UDP', '方法、路徑、Host、標頭、cookie'],
          ['分配的單位', '一條連線：keep-alive 連線上的所有請求都到同一台', '每一個請求，可以依路徑或主機名稱送到不同的 upstream'],
          ['TLS', '可以原封不動轉送加密的資料，由後端解密', '要在負載平衡器解密，才讀得到 HTTP'],
          ['黏著的依據', '來源 IP', '來源 IP 或 cookie'],
          ['額外的工作', '幾乎沒有，不改內容', '加上 X-Forwarded-For、改寫路徑、回應錯誤頁、快取、壓縮'],
          ['協定與負擔', '任何 TCP 或 UDP 協定（資料庫、SMTP、DNS），負擔輕', '只處理 HTTP（含 WebSocket、gRPC），解析 HTTP 與 TLS 的負擔較重'],
          ['例子', 'nginx 的 stream 模組、HAProxy 的 mode tcp、Linux 的 IPVS、雲端的網路負載平衡器', 'nginx 的 http upstream、HAProxy 的 mode http、雲端的應用程式負載平衡器'],
        ] },
        { type: 'p', text: '後端要升級或重新開機時，正確的順序是先排空、再停機：' },
        { type: 'list', ordered: true, items: [
          '在 upstream 把那台標成 `down`（保留那一行，維護完拿掉 down 就能放回去）。',
          '`sudo nginx -t` 確認設定正確。',
          '`sudo systemctl reload nginx`：新的 worker 不再把請求送給它，舊的 worker 把手上進行中的請求處理完才結束，沒有連線被切斷。',
          '確認沒有新的請求到那台：看回應的 X-Upstream、那台後端的存取日誌，或在那台後端上用 `ss -tn` 看還有沒有來自負載平衡器的連線。',
          '停止那台的程式並維護；完成後拿掉 down，再一次 nginx -t 與 reload。',
        ] },
        { type: 'p', text: '常見的捷徑都有代價。直接停掉程式、讓被動健康檢查「自動移除」：在它被判定失敗之前，輪到它的請求都要先失敗一次再重試，已經送出的 POST 直接得到 502，error.log 也多了一堆紀錄。用 restart 代替 reload：整個 nginx 先停下來，進行中的下載與連線全部中斷。把那一行刪掉：在輪詢下也能用，但用 ip_hash 時會讓其他使用者重新分配，而且維護完容易忘了加回來。nginx Plus 與 HAProxy 另有「排空」（drain）狀態：已經黏在那台的使用者繼續送過去、新的使用者不再分給它，等 session 自然結束再停機。' },
        { type: 'callout', tone: 'tip', title: '維護前後各測一次', text: '用 ip_hash 時，先從幾個用戶端位址測一下 X-Upstream 或 /whoami，記下維護前誰在哪一台；標成 down 並 reload 之後再測一次。原本在其他台的使用者應該完全不動，只有原本在維護那台的人換了位置。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  network: {
    scenes: [requestPath],
    exercises: [
      { id: 'srv08-net-upstream-addr', task: 'field', scene: 'srv08-request-path', message: 'resp2', layer: 'application', field: 'X-Upstream', title: '第 2 個請求的 X-Upstream',
        statement: '在「輪詢遇上一台當掉的後端」情境中，lb-01 的網站設定了 `add_header X-Upstream $upstream_addr always;`。第 2 個請求先被分到 app-02（10.0.0.22:8080），連線被拒絕後交給 app-03（10.0.0.23:8080）。lb-01 回給筆電的回應（resp2）裡，X-Upstream 標頭的值是什麼？',
        hints: ['$upstream_addr 不只記最後成功的那一台。', '多個位址之間以逗號加空格分隔，依嘗試的順序排列。'],
        explanation: '$upstream_addr 依序列出這個請求嘗試過的每一台後端，以「, 」分隔，所以是 10.0.0.22:8080, 10.0.0.23:8080：先試 app-02 被拒絕，再由 app-03 回應。只寫 10.0.0.23:8080 漏了失敗的那一次，而這正是從回應看出「有一台後端出問題」的線索；只寫 10.0.0.22:8080 則忽略了重試。',
        mistakes: [
          { answer: { value: '10.0.0.23:8080' }, why: '這是最後回應的後端，但 $upstream_addr 也列出先前失敗的嘗試。' },
          { answer: { value: '10.0.0.22:8080' }, why: 'app-02 拒絕了連線，請求被 proxy_next_upstream 交給 app-03，兩次嘗試都會列出。' },
        ] },
      { id: 'srv08-net-fails', task: 'table', scene: 'srv08-request-path', message: 'rst5', node: 'lb', table: POOL_TABLE, row: '10.0.0.22:8080', column: 'fails', title: 'app-02 的失敗次數',
        statement: '同一個情境中，每台後端都設了 `max_fails=2 fail_timeout=30s`。第 5 個請求再一次被 app-02 拒絕之後（rst5），「upstream pierticket_app」表中 10.0.0.22:8080 這一列的 fails 是多少？',
        hints: ['第 2 個請求已經失敗過一次，那次之後 app-02 沒有成功過。', 'fails 只在成功時歸零，或在 fail_timeout 過去之後重新計算。'],
        explanation: '第 2 個請求時 app-02 失敗一次，fails 是 1，未達 max_fails=2，app-02 仍會被輪到；第 5 個請求再失敗一次，兩次都在 30 秒內，fails 是 2，達到 max_fails，nginx 暫停使用它 30 秒。之後的第 6 個請求就直接跳過 app-02。',
        mistakes: [
          { answer: { cell: '1' }, why: '只算了這一次；第 2 個請求的失敗也在 30 秒的時間窗內，會累加。' },
          { answer: { cell: '0' }, why: '重試到 app-03 成功只會把 app-03 的失敗次數歸零，不會影響 app-02。' },
        ] },
    ],
  },
  quiz: [
    {
      id: 'srv08-q1', prompt: '`upstream b { server a weight=5; server b; server c; }` 使用預設的方法。reload 之後的前 7 個請求依序由誰處理？',
      options: ['a a a a a b c', 'a b c a a a a', 'a a b a c a a', 'a b a c a a a'],
      answer: 2,
      explanation: 'nginx 用平滑加權輪詢：每次每台加上自己的權重，選最大的，再讓它減去總和 7，結果是 a a b a c a a，a 拿到 5 個卻不連續太多次。a a a a a b c 是「先用完權重再換下一台」的天真做法；a b c a a a a 與 a b a c a a a 雖然也是 5：1：1，但不是這個算法算出的順序。',
    },
    {
      id: 'srv08-q2', prompt: '`least_conn` 的 upstream 中，app-01（weight=4）有 20 條進行中的連線、app-02（weight=1）有 6 條、app-03（weight=2）有 8 條。下一個請求給誰？',
      options: ['app-03', 'app-01', 'app-02', '三台輪流，因為 least_conn 只在連線數相同時才有作用'],
      answer: 0,
      explanation: 'least_conn 比較「連線數 ÷ 權重」：app-01 是 20 ÷ 4 = 5、app-02 是 6 ÷ 1 = 6、app-03 是 8 ÷ 2 = 4，最小的是 app-03。app-02 的連線數最少，但權重也最小，算進權重後反而最高；app-01 的連線最多，比值 5 也比 app-03 大；連線數相同時才在它們之間輪詢，這裡並不相同。',
    },
    {
      id: 'srv08-q3', prompt: 'upstream 使用 `ip_hash`。一家公司的 800 位員工經由同一個 NAT 公開位址連到網站，會發生什麼事？',
      options: ['nginx 依每位員工的瀏覽器分配，負載仍然平均', 'nginx 拒絕同一個 IP 的大量連線', 'ip_hash 只看位址的最後一個位元組，所以他們會平均分散', '他們全部落在同一台後端，那台的負載特別重'],
      answer: 3,
      explanation: 'ip_hash 以用戶端位址的前三個位元組做雜湊，800 人共用一個位址，在 nginx 眼中就是同一個用戶端，全部黏在同一台。依瀏覽器區分要靠 cookie 黏著；ip_hash 不會拒絕連線；它用的是前三個位元組而不是最後一個，同一個 /24 都算同一個鍵。',
    },
    {
      id: 'srv08-q4', prompt: '`server 10.0.0.22:8080 max_fails=3 fail_timeout=30s;` 的意思是什麼？',
      options: ['nginx 每 30 秒主動送 3 個健康檢查請求給它', '30 秒內失敗 3 次，接下來的 30 秒就不把請求送給它', '請求失敗時最多重試 3 次，每次等 30 秒', '連續 3 個請求花超過 30 秒，就把它移除直到 reload'],
      answer: 1,
      explanation: 'fail_timeout 同時是計算失敗的時間窗與暫停的長度：30 秒內失敗達到 max_fails=3 次，就暫停 30 秒，之後再用真實的請求試。開源版 nginx 不主動送健康檢查（那是 nginx Plus 的 health_check）；重試的次數由 proxy_next_upstream_tries 決定，與 max_fails 無關；慢的回應由 proxy_read_timeout 判斷逾時，也不是這個意思。',
    },
    {
      id: 'srv08-q5', prompt: '`server 10.0.0.23:8080 backup;` 的 app-03 什麼時候會收到請求？',
      options: ['和其他後端一起輪流，只是比例比較低', '只有在所有非 backup 的後端都不能用時', '只要任何一台主要的後端失敗一次', '永遠不會，backup 和 down 的意思相同'],
      answer: 1,
      explanation: 'backup 是備援：主要的後端都暫停或標成 down 時，nginx 才把請求交給它。比例低的是權重小的一般後端，backup 平常完全不收；只有一台主要後端失敗時，其他主要後端還能接手，輪不到 backup；down 是永遠不用，backup 在需要時會接手，兩者不同。',
    },
    {
      id: 'srv08-q6', prompt: '想把 `/api/` 開頭的請求送到一組後端、其他請求送到另一組，需要哪一種負載平衡？',
      options: ['L4，因為它只看 IP 與埠，比較快', 'DNS 輪詢，讓不同的位址對應不同的後端', 'L4 加上 ip_hash', 'L7，因為要讀到 HTTP 請求的路徑才能決定'],
      answer: 3,
      explanation: '路徑在 HTTP 請求裡，只有讀取並解析 HTTP 的 L7 負載平衡器看得到，例如 nginx 的 location 加上不同的 upstream。L4 只看 IP、埠與協定，不知道路徑；DNS 只把名稱換成位址，同一個網站的不同路徑用同一個名稱；ip_hash 依用戶端位址分配，與路徑無關。',
    },
    {
      id: 'srv08-q7', prompt: 'app-02 要停機升級。下列哪個做法最不會讓使用者遇到錯誤或中斷？',
      options: ['在 upstream 把它標成 `down`，`nginx -t` 之後 `reload`，確認沒有新請求再停掉它的程式', '直接停掉 app-02 的程式，被動健康檢查會自動把它移除', '在 upstream 把它標成 `down` 之後 `systemctl restart nginx`', '在 upstream 把它改成 `backup` 再 reload'],
      answer: 0,
      explanation: '先標 down 並 reload：新的 worker 不再送請求給它，舊的 worker 處理完手上的請求才結束，之後停機沒有人受影響。直接停程式時，輪到它的請求要先失敗再重試，已送出的 POST 會得到 502；restart 會切斷所有進行中的連線；backup 仍可能收到請求（其他台都不能用時），不是停用。',
    },
    {
      id: 'srv08-q8', prompt: '網站從一台後端擴展成三台之後，使用者上傳的頭像有時看得到、有時是 404。最可能的原因是什麼？',
      options: ['nginx 的輪詢把同一個網址交給不同的 location', '沒有改用 least_conn', '頭像寫在處理上傳那台後端的本機磁碟，其他兩台沒有那個檔案', '瀏覽器快取了 404 的回應'],
      answer: 2,
      explanation: '上傳的檔案只存在處理那次上傳的後端上，請求輪到另外兩台時找不到檔案，所以時好時壞；要放到共用的檔案系統或物件儲存。選 location 和選後端無關，location 由 URI 決定；換成 least_conn 只是換一種分配方法，檔案仍然只在一台；瀏覽器快取的 404 不會時有時無地輪流出現。',
    },
  ],
  terminal: {
    machines: [single, pool, sticky, failover],
    examples: [
      {
        id: 'srv08-scale-out', title: '從一台後端到三台的 upstream', machine: 'srv08-single',
        description: '目前 lb-01 把所有請求轉給 app-01，三台後端都從 lb-01 連得到。把三台放進 conf.d 的 upstream、網站的 proxy_pass 改指向它，測試並 reload 之後，請求依序輪流送到三台。',
        steps: [
          { command: `grep proxy_pass ${SITE_PATH}`, output: '        proxy_pass http://10.0.0.21:8080;' },
          { command: 'for i in 1 2 3; do curl -s http://localhost/whoami; done', output: 'app-01\napp-01\napp-01' },
          { command: 'for h in 10.0.0.21 10.0.0.22 10.0.0.23; do curl -s http://$h:8080/whoami; done', output: 'app-01\napp-02\napp-03' },
          { command: tee(UP_PATH, UP_EQUAL), output: '' },
          { command: `cat ${UP_PATH}`, output: 'upstream pierticket_app {\n    server 10.0.0.21:8080;\n    server 10.0.0.22:8080;\n    server 10.0.0.23:8080;\n}' },
          { command: tee(SITE_PATH, SITE_POOL), output: '' },
          { command: 'sudo nginx -t', output: 'nginx: the configuration file /etc/nginx/nginx.conf syntax is ok\nnginx: configuration file /etc/nginx/nginx.conf test is successful' },
          { command: 'sudo systemctl reload nginx', output: '' },
          { command: LOOP6, output: 'app-01\napp-02\napp-03\napp-01\napp-02\napp-03' },
          { command: 'curl -sI http://localhost/ | grep X-Upstream', output: 'X-Upstream: 10.0.0.21:8080' },
        ],
      },
      {
        id: 'srv08-weighted', title: '加權輪詢的順序與 reload 的重設', machine: 'srv08-pool',
        description: '權重 3、2、1 的六個請求正好是課文表格算出的順序。再送兩個請求之後 reload：新的 worker 從頭輪詢，接下來是 app-01、app-02、app-01，而不是沒有 reload 時的 app-01、app-03、app-02。',
        steps: [
          { command: `cat ${UP_PATH}`, output: 'upstream pierticket_app {\n    server 10.0.0.21:8080 weight=3;\n    server 10.0.0.22:8080 weight=2;\n    server 10.0.0.23:8080;\n}' },
          { command: LOOP6, output: 'app-01\napp-02\napp-01\napp-03\napp-02\napp-01' },
          { command: 'for i in 1 2; do curl -s -o /dev/null -w "%{http_code} %header{x-upstream}\\n" http://localhost/; done', output: '200 10.0.0.21:8080\n200 10.0.0.22:8080' },
          { command: 'sudo systemctl reload nginx', output: '' },
          { command: 'for i in 1 2 3; do curl -s http://localhost/whoami; done', output: 'app-01\napp-02\napp-01' },
        ],
      },
      {
        id: 'srv08-least-conn', title: 'least_conn：看連線數，再看權重', machine: 'srv08-pool',
        description: '用 ss 數出 lb-01 連往各後端的連線（nginx 也記著同樣的數目）。改成不加權重的 least_conn 之後，每個請求都給連線最少的 app-03；模擬環境的連線數不會因為 curl 而改變，所以連續三次都一樣。',
        steps: [
          { command: 'ss -tn dport = :8080 | head -n 3', output: 'State Recv-Q Send-Q Local Address:Port  Peer Address:Port Process\nESTAB 0      0          10.0.0.10:41000    10.0.0.21:8080\nESTAB 0      0          10.0.0.10:41001    10.0.0.21:8080' },
          { command: 'ss -Htn dport = :8080 | tr -s " " | cut -d " " -f 5 | sort | uniq -c', output: '     12 10.0.0.21:8080\n      5 10.0.0.22:8080\n      3 10.0.0.23:8080' },
          { command: tee(UP_PATH, UP_LEAST_PLAIN), output: '' },
          { command: 'sudo nginx -t', output: 'nginx: the configuration file /etc/nginx/nginx.conf syntax is ok\nnginx: configuration file /etc/nginx/nginx.conf test is successful' },
          { command: 'sudo systemctl reload nginx', output: '' },
          { command: 'for i in 1 2 3; do curl -s http://localhost/whoami; done', output: 'app-03\napp-03\napp-03' },
        ],
      },
      {
        id: 'srv08-ip-hash', title: 'ip_hash：同一個用戶端位址，永遠同一台', machine: 'srv08-sticky',
        description: '在 lb-01 上從 127.0.0.1 與 10.0.0.10 兩個位址各送三個請求：前者一直到 app-03，後者一直到 app-01，存取日誌的第一欄就是 ip_hash 用來雜湊的位址。最後試著把 app-03 改成 backup，nginx -t 拒絕這種組合。',
        steps: [
          { command: `cat ${UP_PATH}`, output: 'upstream pierticket_app {\n    ip_hash;\n    server 10.0.0.21:8080;\n    server 10.0.0.22:8080;\n    server 10.0.0.23:8080;\n}' },
          { command: 'for i in 1 2 3; do curl -s http://localhost/whoami; done', output: 'app-03\napp-03\napp-03' },
          { command: `for i in 1 2 3; do curl -s http://${LB_IP}/whoami; done`, output: 'app-01\napp-01\napp-01' },
          { command: 'sudo cut -d " " -f 1 /var/log/nginx/access.log | uniq -c', output: '      3 127.0.0.1\n      3 10.0.0.10' },
          { command: tee(UP_PATH, UP_STICKY.replace('10.0.0.23:8080;', '10.0.0.23:8080 backup;')), output: '' },
          { command: 'sudo nginx -t', output: 'nginx: [emerg] invalid parameter "backup" in /etc/nginx/conf.d/pierticket-upstream.conf:5\nnginx: configuration file /etc/nginx/nginx.conf test failed' },
        ],
      },
      {
        id: 'srv08-passive', title: '被動健康檢查：重試、暫停，以及用 down 排除', machine: 'srv08-failover',
        description: 'app-02 的程式當掉了。六個請求全部是 200，但有兩個先試了 app-02；error.log 各記一行，第二次之後 app-02 被暫停。直接 curl 它的 /healthz 證實連不上。reload 讓失敗次數歸零，app-02 又被試了一次；標成 down 並 reload 之後，請求只在 app-01 與 app-03 之間輪流，錯誤日誌不再增加。',
        steps: [
          { command: 'for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w "%{http_code} %header{x-upstream}\\n" http://localhost/whoami; done', output: '200 10.0.0.21:8080\n200 10.0.0.22:8080, 10.0.0.23:8080\n200 10.0.0.23:8080\n200 10.0.0.21:8080\n200 10.0.0.22:8080, 10.0.0.23:8080\n200 10.0.0.21:8080' },
          { command: 'sudo cat /var/log/nginx/error.log', output: '2026/11/22 10:00:00 [error] 813#813: *2 connect() failed (111: Connection refused) while connecting to upstream, client: 127.0.0.1, server: pierticket.example, request: "GET /whoami HTTP/1.1", upstream: "http://10.0.0.22:8080/whoami", host: "localhost"\n2026/11/22 10:00:00 [error] 813#813: *5 connect() failed (111: Connection refused) while connecting to upstream, client: 127.0.0.1, server: pierticket.example, request: "GET /whoami HTTP/1.1", upstream: "http://10.0.0.22:8080/whoami", host: "localhost"' },
          { command: 'curl -sS http://10.0.0.22:8080/healthz', output: 'curl: (7) Failed to connect to 10.0.0.22 port 8080 after 0 ms: Couldn\'t connect to server' },
          { command: 'sudo systemctl reload nginx', output: '' },
          { command: 'for i in 1 2; do curl -s -o /dev/null -w "%{http_code} %header{x-upstream}\\n" http://localhost/whoami; done', output: '200 10.0.0.21:8080\n200 10.0.0.22:8080, 10.0.0.23:8080' },
          { command: 'sudo wc -l /var/log/nginx/error.log', output: '3 /var/log/nginx/error.log' },
          { command: tee(UP_PATH, UP_FAILOVER_DOWN), output: '' },
          { command: 'sudo nginx -t', output: 'nginx: the configuration file /etc/nginx/nginx.conf syntax is ok\nnginx: configuration file /etc/nginx/nginx.conf test is successful' },
          { command: 'sudo systemctl reload nginx', output: '' },
          { command: 'for i in 1 2 3 4; do curl -s -o /dev/null -w "%{http_code} %header{x-upstream}\\n" http://localhost/whoami; done', output: '200 10.0.0.21:8080\n200 10.0.0.23:8080\n200 10.0.0.21:8080\n200 10.0.0.23:8080' },
          { command: 'sudo wc -l /var/log/nginx/error.log', output: '3 /var/log/nginx/error.log' },
        ],
      },
    ],
    exercises: [
      {
        id: 'srv08-upstream-weights', title: '把網站分散到三台後端並驗證順序', machine: 'srv08-single',
        statement: `lb-01 目前把所有請求轉給 app-01。三台後端都準備好了：app-01（10.0.0.21）、app-02（10.0.0.22）、app-03（10.0.0.23），都在 8080 埠。app-03 是新買的機器，CPU 是另外兩台的兩倍。請在 ${UP_PATH} 定義 upstream pierticket_app，把三台都放進去，app-03 的權重是 2、另外兩台用預設的權重；把 ${SITE_PATH} 的 proxy_pass 改成 http://pierticket_app（其他設定照舊），在不中斷服務的情況下套用。最後在 reload 之後，用一個迴圈對 http://localhost/whoami 送出 6 個請求，每個回應一行。reload 之後、迴圈之前不要另外送請求，那會改變輪詢的位置。檢查時你的指令也會在某一台後端剛好停機的日子重新執行，直接打出答案無法通過。`,
        checks: [
          { kind: 'nginx', test: true },
          { kind: 'http', url: 'http://localhost/', status: 200, body: '碼頭售票網' },
          { kind: 'output' },
        ],
        solution: [tee(UP_PATH, UP_EX1), tee(SITE_PATH, SITE_EX1), 'sudo nginx -t', 'sudo systemctl reload nginx', LOOP6],
        variants: [APP3_DOWN, APP1_DOWN],
        mistakes: [
          { commands: [tee(UP_PATH, UP_EQUAL), tee(SITE_PATH, SITE_EX1), 'sudo nginx -t', 'sudo systemctl reload nginx', LOOP6],
            why: '三台都用預設的權重 1：順序變成 app-01、app-02、app-03 輪流，app-03 沒有拿到兩倍的請求。' },
          { commands: [tee(UP_PATH, UP_EX1), tee(SITE_PATH, SITE_EX1), 'sudo nginx -t', LOOP6],
            why: '設定檔改好、測試也通過，但沒有 reload：執行中的 nginx 仍把請求全部轉給 app-01。' },
          { commands: [tee(SITE_PATH, SITE_EX1.replace('    location / {', `${indent(UP_EX1)}\n\n    location / {`)), 'sudo nginx -t', 'sudo systemctl reload nginx', LOOP6],
            why: 'upstream 只能寫在 http 區塊（conf.d 的檔案就是在 http 裡被 include），寫進 server 區塊時 nginx -t 回報 "upstream" directive is not allowed here，reload 也失敗，網站仍用舊設定。' },
          { commands: ['printf \'app-03\\napp-01\\napp-02\\napp-03\\napp-03\\napp-01\\n\''],
            why: '把算好的順序直接印出來：今天也許是對的，但檢查會在 app-03 停機的日子重新執行，那天 nginx 試 app-03 失敗後改送別台，順序不一樣。要讓 nginx 真的分配，再印出它的結果。' },
        ],
        hints: [
          'upstream 區塊寫在 conf.d 的 .conf 檔裡，每一行是 `server 位址:埠 [weight=N];`。',
          'proxy_pass 寫 `http://pierticket_app`，名字後面不加埠。',
          '先 `sudo nginx -t`，通過了再 `sudo systemctl reload nginx`，然後 `for i in 1 2 3 4 5 6; do curl -s http://localhost/whoami; done`。',
        ],
        explanation: 'conf.d 的檔案在 http 區塊中被 include，upstream 寫在那裡，網站的 proxy_pass 以名字指向它；改完先 nginx -t 再 reload。權重 1、1、2（總和 4）的平滑加權輪詢從 app-03 開始：第一次三台加上權重後是 1、1、2，app-03 最大。每四個請求一輪是 app-03、app-01、app-02、app-03，所以六個請求是 app-03、app-01、app-02、app-03、app-03、app-01：app-03 拿到一半，而且寫在最後的 server 不一定最後才輪到。app-03 停機的那天，第一個請求先試 app-03 被拒絕（預設 max_fails=1，立刻暫停使用），重試給別台，之後只在 app-01 與 app-02 之間輪流；app-01 停機的那天則是 app-02 與 app-03 依 1：2 分配。所以要讓 nginx 真的處理請求，再印出它的結果。',
      },
      {
        id: 'srv08-least-conn-weights', title: '改用 least_conn，回報下一個請求的去處', machine: 'srv08-pool',
        statement: `lb-01 的 upstream pierticket_app（${UP_PATH}）目前是加權輪詢，權重是 3、2、1。售票網加上報表匯出與即時座位圖（長連線）之後，各台進行中的連線數差很多。請把這個 upstream 改成 least_conn，三台的權重保持不變，在不中斷服務的情況下套用；然後送一個請求到 http://localhost/whoami，印出回應（處理它的後端名稱）。可以先用 ss 看 lb-01 目前連往各後端的連線。檢查時你的指令也會在某些後端正在重新開機的日子重新執行，直接打出答案無法通過。`,
        checks: [
          { kind: 'nginx', test: true },
          { kind: 'output' },
        ],
        solution: [tee(UP_PATH, UP_LEAST), 'sudo nginx -t', 'sudo systemctl reload nginx', 'curl -s http://localhost/whoami'],
        variants: [APP2_DOWN, APP23_DOWN],
        mistakes: [
          { commands: [tee(UP_PATH, UP_LEAST_PLAIN), 'sudo nginx -t', 'sudo systemctl reload nginx', 'curl -s http://localhost/whoami'],
            why: '拿掉了權重：least_conn 只比連線數，選中連線最少的 app-03。題目要保留權重，nginx 比的是「連線數 ÷ 權重」，app-02 的 5 ÷ 2 = 2.5 最小。' },
          { commands: [tee(UP_PATH, UP_LEAST), 'sudo nginx -t', 'curl -s http://localhost/whoami'],
            why: '沒有 reload：執行中的 nginx 仍是加權輪詢，第一個請求給權重最大的 app-01。' },
          { commands: [tee(SITE_PATH, SITE_POOL.replace('        proxy_pass', '        least_conn;\n        proxy_pass')), 'sudo nginx -t', 'sudo systemctl reload nginx', 'curl -s http://localhost/whoami'],
            why: 'least_conn 是 upstream 區塊的指令，寫在 location 裡時 nginx -t 失敗，reload 也跟著失敗，執行中的 nginx 仍是加權輪詢。' },
          { commands: ['echo app-02'],
            why: '直接印出算好的名字：今天是對的，但在 app-02 重新開機的那天，nginx 試 app-02 失敗後會改送「連線數 ÷ 權重」次小的 app-03，答案就不同了。' },
        ],
        hints: [
          '`least_conn;` 寫在 upstream 區塊裡、各行 server 的前面，server 的權重照舊。',
          '`ss -Htn dport = :8080 | tr -s " " | cut -d " " -f 5 | sort | uniq -c` 數出 lb-01 連往每台後端的連線。',
          '算算每台的「連線數 ÷ 權重」，再用 `curl -s http://localhost/whoami` 確認。',
        ],
        explanation: 'lb-01 連往三台的連線是 12、5、3，權重是 3、2、1，「連線數 ÷ 權重」是 4、2.5、3，least_conn 選最小的 app-02。拿掉權重會變成只比連線數，選到 app-03，所以權重要保留。模擬環境的連線數來自課程的資料、不會因為 curl 增加，所以再送幾次都是 app-02；真實的 nginx 轉送一個請求就多一條連線，數字會一直變。在 app-02 重新開機的那天，nginx 先試 app-02 被拒絕，再從其他兩台挑比值最小的 app-03；app-02 與 app-03 都在更新時只剩 app-01。改設定之後同樣是 nginx -t 再 reload。',
      },
      {
        id: 'srv08-drain', title: '用 down 把 app-03 排空維護', machine: 'srv08-sticky',
        statement: `售票網的購物車還存在後端的記憶體裡，所以 upstream pierticket_app（${UP_PATH}）用 ip_hash 讓使用者黏在同一台。app-03 今晚要更新核心。請讓 nginx 不再把任何請求送給 app-03，但原本分到 app-01、app-02 的使用者不能被換到別台（否則他們的購物車會不見），也不能中斷 nginx 正在處理的連線。在 lb-01 上，從 127.0.0.1 連線的用戶端目前在 app-03，從 ${LB_IP} 連線的在 app-01，可以用 \`curl -s http://localhost/whoami\` 與 \`curl -s http://${LB_IP}/whoami\` 確認。`,
        checks: [
          { kind: 'nginx', test: true },
          { kind: 'http', url: `http://${LB_IP}/whoami`, status: 200, body: 'app-01' },
          { kind: 'http', url: 'http://localhost/whoami', status: 200, body: 'app-02' },
          { kind: 'process', pid: 812, name: 'nginx' },
        ],
        solution: ['curl -s http://localhost/whoami', `curl -s http://${LB_IP}/whoami`, tee(UP_PATH, UP_STICKY_DRAIN), 'sudo nginx -t', 'sudo systemctl reload nginx', 'curl -s http://localhost/whoami', `curl -s http://${LB_IP}/whoami`],
        mistakes: [
          { commands: [tee(UP_PATH, upstream(['ip_hash;', 'server 10.0.0.21:8080;', 'server 10.0.0.22:8080;'])), 'sudo nginx -t', 'sudo systemctl reload nginx'],
            why: `刪掉 app-03 那一行：後端從三台變成兩台，雜湊要重新對應，原本在 app-01 的 ${LB_IP} 被換到 app-02，購物車不見了。ip_hash 暫時拿掉一台要標 down。` },
          { commands: [tee(UP_PATH, UP_STICKY_DRAIN), 'sudo nginx -t', 'sudo systemctl restart nginx'],
            why: 'down 寫對了，但 restart 先停掉整個 nginx（master 換了新的 PID），所有進行中的連線一起中斷；reload 才會讓舊的 worker 把請求處理完。' },
          { commands: [tee(UP_PATH, UP_STICKY.replace('10.0.0.23:8080;', '10.0.0.23:8080 backup;')), 'sudo nginx -t', 'sudo systemctl reload nginx'],
            why: 'ip_hash 不能搭配 backup：nginx -t 回報 invalid parameter "backup"，reload 失敗，app-03 照樣收到請求。backup 的意思也是「備援」，不是「停用」。' },
          { commands: [tee(UP_PATH, UP_STICKY_DRAIN), 'sudo nginx -t'],
            why: '設定寫對、測試也通過，但沒有 reload：執行中的 nginx 仍把 127.0.0.1 的請求送到 app-03。' },
        ],
        hints: [
          '先用 curl 記下兩個位址現在各在哪一台。',
          '`server 位址:埠 down;` 讓 nginx 不再使用它，卻保留它在雜湊中的位置。',
          '改完先 `sudo nginx -t`，再 `sudo systemctl reload nginx`，然後用同樣的 curl 再確認一次。',
        ],
        explanation: `把 app-03 那一行改成 \`server 10.0.0.23:8080 down;\`，nginx -t 之後 reload。標成 down 的後端仍然留在 ip_hash 的計算裡：${LB_IP} 的雜湊照舊落在 app-01，購物車還在；127.0.0.1 原本落在 app-03，現在那台不能用，nginx 繼續雜湊，換到 app-02（這些使用者本來就在維護的機器上，換位置無法避免）。如果刪掉那一行，後端的數目從 3 變成 2，所有人的對應都重新計算，${LB_IP} 也被換到 app-02。reload 讓舊的 worker 處理完進行中的請求才結束，所以 master 的 PID 不變；restart 會中斷所有連線。維護完把 down 拿掉、再 reload，127.0.0.1 就回到 app-03。`,
      },
      {
        id: 'srv08-backup', title: '讓 app-03 只在其他兩台都不能用時接手', machine: 'srv08-pool',
        statement: `app-03 是比較舊的機器，平常不想讓它分擔流量，只在 app-01 與 app-02 都不能用時接手。請修改 ${UP_PATH}：app-01 與 app-02 保持權重 3 與 2，app-03 改成備援，在不中斷服務的情況下套用；然後在 reload 之後用一個迴圈對 http://localhost/whoami 送 5 個請求，每個回應一行，證明 app-03 沒有收到請求。檢查時你的指令也會在一台、甚至兩台主要後端當掉的日子重新執行，那時 app-03 必須接手。`,
        checks: [
          { kind: 'nginx', test: true },
          { kind: 'output' },
        ],
        solution: [tee(UP_PATH, UP_BACKUP), 'sudo nginx -t', 'sudo systemctl reload nginx', LOOP5],
        variants: [APP1_DOWN, APP12_DOWN],
        mistakes: [
          { commands: [tee(UP_PATH, UP_BACKUP.replace('backup', 'down')), 'sudo nginx -t', 'sudo systemctl reload nginx', LOOP5],
            why: 'down 是停用：平常的結果一樣，但 app-01 與 app-02 同時當掉的那天，nginx 沒有任何後端可用，使用者得到 502，app-03 卻閒著。' },
          { commands: ['sudo nginx -t', 'sudo systemctl reload nginx', LOOP5],
            why: '權重小不等於備援：原本 weight=1 的 app-03 仍在輪詢裡，每 6 個請求就分到 1 個，5 個請求裡就有它。' },
          { commands: [tee(UP_PATH, UP_BACKUP), 'sudo nginx -t', LOOP5],
            why: '設定寫對了但沒有 reload：執行中的 nginx 仍是原本的加權輪詢，app-03 照樣分到請求。' },
          { commands: ['printf \'app-01\\napp-02\\napp-01\\napp-02\\napp-01\\n\''],
            why: '把預期的結果直接印出來：平常的日子也許對，但在 app-01 當掉的那天應該全部由 app-02 回應、兩台都當掉時全部由 app-03 回應，打出來的答案無法跟著變。' },
        ],
        hints: [
          '在 app-03 那一行加上 `backup`，取代原本的權重。',
          'app-01、app-02 的 `weight=3`、`weight=2` 要留著。',
          'nginx -t、reload，再 `for i in 1 2 3 4 5; do curl -s http://localhost/whoami; done`。',
        ],
        explanation: '在 app-03 那一行用 backup 取代權重，寫成 `server 10.0.0.23:8080 backup;`，nginx -t 之後 reload。主要的 app-01 與 app-02 依 3：2 輪詢，五個請求是 app-01、app-02、app-01、app-02、app-01，app-03 一個也沒有。app-01 當掉的那天，第一個請求先試 app-01 被拒絕、改送 app-02，之後 app-01 暫停使用，全部由 app-02 回應：只要還有一台主要後端可用，backup 就不會被用到。app-01 與 app-02 都當掉時，nginx 才把請求交給 app-03，使用者仍然拿到 200。標成 down 則永遠不用，那天只會得到 502。',
      },
    ],
  },
};
