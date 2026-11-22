import type { NetworkScene, NodeTable, ProtocolHeader } from '@/lib/network/model';
import type { TerminalFile, TerminalMachine, TerminalVariant } from '@/lib/terminal/lesson';
import type { LessonContent } from '../schema';

/*
 * SRV06 Nginx configuration basics (SRV-2, network-sequence). A terminal lesson on the nginx profile (engine stage E14)
 * beside one network-protocol scene. The terminal part: Ubuntu's layout (nginx.conf, conf.d, sites-available and the
 * symbolic links in sites-enabled, snippets, mime.types, /var/www/html, /var/log/nginx), the contexts main, events, http,
 * server and location, a server block for a static site (listen, server_name, root, index, try_files $uri $uri/ =404),
 * how nginx picks a server (listen address, exact name, leading and trailing wildcards, regular expressions,
 * default_server) and a location (=, the longest prefix, ^~, regular expressions in file order) with a worked table, root
 * against alias, add_header inheritance, nginx -t before systemctl reload (reload keeps serving and keeps the old
 * configuration when the test fails; a failing restart takes the site down), the combined access log and the error log
 * (404 and the two kinds of 403), and the permissions www-data needs. The network part: one curl with two URLs from a
 * laptop to the server, the steps nginx takes inside (listen, server_name, location, the file on disk) and the log lines.
 * proxy_pass is the next lesson's (engine stage E15) and is not used. nginx is 1.24.0 as on Ubuntu 24.04. The tea shop, its
 * host names (.example, RFC 2606) and addresses (RFC 5737) are made up. Every transcript output was produced by replaying
 * it on the engine.
 */

const dir = (path: string, owner = 'root', mode = 0o755, group?: string): TerminalFile => ({ path, kind: 'dir', mode, owner, ...group ? { group } : {} });
const file = (path: string, content: string, owner = 'root', mode = 0o644, group?: string): TerminalFile => ({ path, kind: 'file', mode, owner, content, ...group ? { group } : {} });
const link = (path: string, target: string): TerminalFile => ({ path, kind: 'link', mode: 0o777, owner: 'root', target });
/** The command that writes text to a root-owned file: printf's format (newlines as \n, backslashes doubled) piped to sudo tee. */
const tee = (path: string, text: string) => `printf '${text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n')}' | sudo tee ${path}`;

const SITE = 'lanterntea.example';
const WWW = `www.${SITE}`;
const DOCS = `docs.${SITE}`;
const WEB_IP = '203.0.113.10';
const SERVER = 'nginx/1.24.0 (Ubuntu)';

/** The tea shop's zone as the internet's DNS has it: every name points to web-01. */
const ZONE = `$ORIGIN ${SITE}.
$TTL 300
@        IN  SOA  ns1.${SITE}. hostmaster.${SITE}. ( 2026112201 3600 900 1209600 300 )
@        IN  NS   ns1.${SITE}.
ns1      IN  A    198.51.100.53
@        IN  A    ${WEB_IP}
www      IN  A    ${WEB_IP}
docs     IN  A    ${WEB_IP}
status   IN  A    ${WEB_IP}
shop     IN  A    ${WEB_IP}
`;

const home = [dir('/home'), dir('/home/learner', 'learner')];
const siteTree = [
  dir('/var'), dir('/var/www'), dir('/var/www/lanterntea'),
  file('/var/www/lanterntea/index.html', '<h1>燈籠茶行</h1>\n'),
  dir('/var/www/lanterntea/about'), file('/var/www/lanterntea/about/index.html', '<h1>關於我們</h1>\n'),
  dir('/var/www/lanterntea/css'), file('/var/www/lanterntea/css/site.css', 'body { font-family: serif; }\n'),
];

/** The shop's site three weeks after launch: a static-file regex location and the images in a snippet (the bug of exercise 2). */
const LANTERNTEA_SITE = `server {
    listen 80;
    server_name ${SITE} ${WWW};
    root /var/www/lanterntea;
    index index.html;
    add_header X-Content-Type-Options nosniff;

    access_log /var/log/nginx/lanterntea.access.log;
    error_log /var/log/nginx/lanterntea.error.log;

    location / {
        try_files $uri $uri/ =404;
    }

    location ~* \\.(css|js|png|jpg)$ {
        add_header Cache-Control "max-age=604800";
    }

    include snippets/lanterntea-images.conf;
}
`;
const IMAGES_SNIPPET = `location /images/ {
    alias /srv/media/images/;
}
`;
const IMAGES_FIXED = `location ^~ /images/ {
    alias /srv/media/images/;
}
`;
const DOCS_SITE = `server {
    listen 80;
    server_name ${DOCS};
    root /srv/handbook;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}
`;
const OTHER_NAMES = `server {
    listen 80;
    server_name *.${SITE};
    return 301 http://${WWW}$request_uri;
}
`;
/** A practice server on 8080: every location answers with its own name. */
const ROUTES_LAB = `server {
    listen 8080;
    server_name localhost;

    location = / {
        return 200 "A: location = /\\n";
    }
    location / {
        return 200 "B: location /\\n";
    }
    location /docs/ {
        return 200 "C: location /docs/\\n";
    }
    location ^~ /static/ {
        return 200 "D: location ^~ /static/\\n";
    }
    location ~* \\.(png|jpg)$ {
        return 200 "E: location ~* \\\\.(png|jpg)$\\n";
    }
    location ~ ^/docs/.+\\.(pdf|png)$ {
        return 200 "F: location ~ ^/docs/.+\\\\.(pdf|png)$\\n";
    }
}
`;

const line = (ip: string, time: string, path: string, status: number, bytes: number, referer = '-') => `${ip} - - [${time} +0000] "GET ${path} HTTP/1.1" ${status} ${bytes} "${referer}" "Mozilla/5.0"`;
const HOME_REF = `http://${WWW}/`;
/** The shop's access log before today (the log exercise replaces it in its variants). */
const ACCESS_LOG = [
  line('198.51.100.23', '21/Nov/2026:09:12:04', '/', 200, 22),
  line('198.51.100.23', '21/Nov/2026:09:12:04', '/css/site.css', 200, 29, HOME_REF),
  line('198.51.100.23', '21/Nov/2026:09:12:05', '/images/logo.png', 404, 155, HOME_REF),
  line('192.0.2.77', '21/Nov/2026:11:40:31', '/wp-login.php', 404, 155),
  line('192.0.2.77', '21/Nov/2026:11:40:32', '/.env', 404, 155),
  line('198.51.100.41', '21/Nov/2026:13:02:17', '/teas/', 200, 4040),
  line('198.51.100.41', '21/Nov/2026:13:02:19', '/menu.html', 404, 155, `http://${WWW}/teas/`),
  line('198.51.100.41', '21/Nov/2026:13:02:20', '/images/logo.png', 404, 155, `http://${WWW}/teas/`),
  line('198.51.100.23', '21/Nov/2026:16:45:09', '/reports/q3.html', 403, 155),
].join('\n') + '\n';
const LOG_PATH = '/var/log/nginx/lanterntea.access.log';
const logFile = (content: string) => file(LOG_PATH, content, 'www-data', 0o640, 'adm');

/** web-01 right after apt install nginx: the default site only; the tea shop's files are ready in /var/www/lanterntea. */
const fresh: TerminalMachine = {
  id: 'srv06-fresh', title: 'web-01（剛裝好 nginx）', user: 'learner', cwd: '/home/learner', host: 'web-01', profile: 'nginx', nginx: true, address: WEB_IP,
  accounts: { groups: [{ name: 'sudo', members: ['learner'] }] },
  files: [...home, ...siteTree, dir('/var/www/lanterntea/images'), file('/var/www/lanterntea/images/logo.png', 'PNG lantern logo\n')],
  internet: [{ zone: SITE, text: ZONE }],
};

/** web-01 three weeks later: the shop, the staff handbook, a catch-all for other names and a location lab on 8080. */
const live: TerminalMachine = {
  id: 'srv06-live', title: 'web-01（上線三週後）', user: 'learner', cwd: '/home/learner', host: 'web-01', profile: 'nginx', nginx: true, address: WEB_IP,
  accounts: { users: [{ name: 'mei', uid: 1001 }], groups: [{ name: 'sudo', members: ['learner'] }] },
  files: [...home, dir('/home/mei', 'mei'),
    dir('/etc'), dir('/etc/nginx'), dir('/etc/nginx/sites-available'),
    file('/etc/nginx/sites-available/lanterntea', LANTERNTEA_SITE), file('/etc/nginx/sites-available/docs', DOCS_SITE),
    file('/etc/nginx/sites-available/other-names', OTHER_NAMES), file('/etc/nginx/sites-available/routes-lab', ROUTES_LAB),
    dir('/etc/nginx/sites-enabled'),
    link('/etc/nginx/sites-enabled/default', '/etc/nginx/sites-available/default'),
    link('/etc/nginx/sites-enabled/lanterntea', '/etc/nginx/sites-available/lanterntea'),
    link('/etc/nginx/sites-enabled/docs', '/etc/nginx/sites-available/docs'),
    link('/etc/nginx/sites-enabled/other-names', '/etc/nginx/sites-available/other-names'),
    link('/etc/nginx/sites-enabled/routes-lab', '/etc/nginx/sites-available/routes-lab'),
    dir('/etc/nginx/snippets'), file('/etc/nginx/snippets/lanterntea-images.conf', IMAGES_SNIPPET),
    ...siteTree,
    dir('/var/www/lanterntea/downloads'), file('/var/www/lanterntea/downloads/price-list.pdf', '%PDF price list\n'),
    dir('/var/www/lanterntea/reports'), file('/var/www/lanterntea/reports/q3.html', '<h1>第三季營收</h1>\n', 'root', 0o600),
    dir('/var/log'), dir('/var/log/nginx', 'root', 0o755, 'adm'), logFile(ACCESS_LOG),
    dir('/srv'), dir('/srv/media'), dir('/srv/media/images'),
    file('/srv/media/images/logo.png', 'PNG lantern logo\n'), file('/srv/media/images/banner.jpg', 'JPEG winter banner\n'),
    dir('/srv/handbook', 'mei', 0o750), file('/srv/handbook/index.html', '<h1>員工手冊</h1>\n', 'mei'),
    dir('/srv/handbook/guide', 'mei'), file('/srv/handbook/guide/setup.html', '<h1>收銀機設定</h1>\n', 'mei'),
    dir('/srv/handbook/drafts', 'mei', 0o700), file('/srv/handbook/drafts/index.html', '<h1>年終獎金草案</h1>\n', 'mei', 0o600),
  ],
  internet: [{ zone: SITE, text: ZONE }],
};

const LOG_MONDAY: TerminalVariant = { label: '另一天的存取日誌', files: [logFile([
  line('198.51.100.88', '23/Nov/2026:08:01:44', '/favicon.ico', 404, 155),
  line('198.51.100.88', '23/Nov/2026:08:01:44', '/', 200, 22),
  line('203.0.113.200', '23/Nov/2026:09:30:10', '/admin/', 404, 155),
  line('203.0.113.200', '23/Nov/2026:09:30:11', '/favicon.ico', 404, 155),
  line('198.51.100.88', '23/Nov/2026:10:15:51', '/about/', 200, 22, HOME_REF),
  line('198.51.100.90', '23/Nov/2026:12:04:00', '/downloads/', 403, 155),
].join('\n') + '\n')] };
const LOG_SALE: TerminalVariant = { label: '冬季特賣當天的存取日誌', files: [logFile([
  line('198.51.100.7', '24/Nov/2026:19:00:02', '/winter-sale.html', 404, 155, HOME_REF),
  line('198.51.100.7', '24/Nov/2026:19:00:03', '/', 200, 22),
  line('198.51.100.9', '24/Nov/2026:19:00:05', '/winter-sale.html', 404, 155, HOME_REF),
  line('198.51.100.9', '24/Nov/2026:19:01:40', '/css/site.css', 200, 29, HOME_REF),
  line('198.51.100.12', '24/Nov/2026:19:02:13', '/images/sale.jpg', 404, 155, `http://${WWW}/winter-sale.html`),
].join('\n') + '\n')] };

// ---- network scene -----------------------------------------------------------------------------------------------
const LAPTOP_IP = '198.51.100.23', PORT = '52144';
const ipv4 = (from: string, to: string): ProtocolHeader => ({ layer: 'network', protocol: 'IPv4', fields: [{ name: '來源 IP', value: from }, { name: '目的 IP', value: to }] });
const tcp = (from: string, to: string, flags: string): ProtocolHeader => ({ layer: 'transport', protocol: 'TCP', fields: [
  { name: '來源連接埠', value: from }, { name: '目的連接埠', value: to }, { name: '旗標', value: flags }] });
const get = (path: string): ProtocolHeader => ({ layer: 'application', protocol: 'HTTP/1.1', fields: [
  { name: '方法', value: 'GET' }, { name: '路徑', value: path }, { name: '版本', value: 'HTTP/1.1' },
  { name: 'Host', value: WWW }, { name: 'User-Agent', value: 'curl/8.5.0' }, { name: 'Accept', value: '*/*' }] });
const response = (code: string, reason: string, headers: [string, string][]): ProtocolHeader => ({ layer: 'application', protocol: 'HTTP/1.1', fields: [
  { name: '版本', value: 'HTTP/1.1' }, { name: '狀態碼', value: code }, { name: '原因片語', value: reason }, ...headers.map(([name, value]) => ({ name, value }))] });
const head = (type: string, length: number): [string, string][] => [['Server', SERVER], ['Date', 'Sun, 22 Nov 2026 10:00:00 GMT'], ['Content-Type', type], ['Content-Length', String(length)], ['Connection', 'keep-alive']];

const STEPS = 'nginx 的處理過程';
const STEP_HEAD = ['步驟', '依據', '結果'];
const LISTEN_ROW = ['listen', `目的 ${WEB_IP}:80`, '0.0.0.0:80 的 socket；在這個位址與埠上的 server：default、docs、lanterntea、other-names'];
const SERVER_ROW = ['server', `Host: ${WWW}`, 'lanterntea（server_name 的精確名稱）'];
const LOCATION_ROW = ['location', 'URI 的前綴是 /images/', '^~ /images/'];
const steps = (file: string, changed?: number[]): NodeTable => ({ node: 'nginx', name: STEPS, head: STEP_HEAD, rows: [LISTEN_ROW, SERVER_ROW, LOCATION_ROW, ['檔案', 'alias /srv/media/images/', file]], ...changed ? { changed } : {} });
const ACCESS_1 = `${LAPTOP_IP} - - [22/Nov/2026:10:00:00 +0000] "GET /images/logo.png HTTP/1.1" 200 17 "-" "curl/8.5.0"`;
const ACCESS_2 = `${LAPTOP_IP} - - [22/Nov/2026:10:00:00 +0000] "GET /images/old-logo.png HTTP/1.1" 404 155 "-" "curl/8.5.0"`;
const ERROR_1 = `2026/11/22 10:00:00 [error] 813#813: *1 open() "/srv/media/images/old-logo.png" failed (2: No such file or directory), client: ${LAPTOP_IP}, server: ${SITE}, request: "GET /images/old-logo.png HTTP/1.1", host: "${WWW}"`;
const accessLog = (rows: string[], changed?: number[]): NodeTable => ({ node: 'nginx', name: 'lanterntea.access.log', head: ['行', '紀錄'], rows: rows.map((r, i) => [String(i + 1), r]), ...changed ? { changed } : {} });

/** Section 5: one curl with two URLs (one connection), followed inside nginx from the socket to the file and the logs. */
const requestPath: NetworkScene = {
  id: 'srv06-request-path', title: '一個請求在 nginx 裡走過的路：listen、server_name、location、檔案、日誌', model: 'tcp-ip',
  description: `learner 在自己的筆電（${LAPTOP_IP}）執行 \`curl http://${WWW}/images/logo.png http://${WWW}/images/old-logo.png\`，對象是 web-01（${WEB_IP}）上修好 location 之後的 nginx。網路上看得到的只有 TCP 區段與 HTTP 訊息；表格是 nginx 在 worker 裡面做的判斷與寫下的日誌。兩個網址的主機與埠相同，curl 在同一條連線上送出第二個請求。`,
  nodes: [
    { id: 'client', label: '筆電（curl）', kind: 'host', addresses: [`IP ${LAPTOP_IP}`] },
    { id: 'nginx', label: 'web-01（nginx 1.24，worker 813）', kind: 'server', addresses: [`IP ${WEB_IP}`, 'TCP 80、8080'] },
  ],
  messages: [
    { id: 'tcp', from: 'client', to: 'nginx', label: 'TCP 三向交握（摘要）',
      headers: [tcp(PORT, '80', 'SYN → SYN, ACK → ACK（三個區段）'), ipv4(LAPTOP_IP, WEB_IP)],
      payload: '三個區段都沒有資料',
      note: `第一個決定在還沒有任何 HTTP 之前就做完了：連線的目的位址與埠是 ${WEB_IP}:80，只有 listen 80 的 server 區塊可能回應這條連線，8080 上的 routes-lab 從此不在考慮之內。nginx 的 master 依設定開好 0.0.0.0:80 的 socket，worker 繼承它並接受連線。如果某個 server 寫的是 \`listen ${WEB_IP}:80\`，位址完全相同的 server 會比 0.0.0.0 的優先。`,
      tables: [{ node: 'nginx', name: STEPS, head: STEP_HEAD, rows: [LISTEN_ROW], changed: [0] }] },
    { id: 'get-logo', from: 'client', to: 'nginx', label: 'GET /images/logo.png',
      headers: [get('/images/logo.png'), tcp(PORT, '80', 'PSH, ACK'), ipv4(LAPTOP_IP, WEB_IP)],
      payload: `GET /images/logo.png HTTP/1.1\nHost: ${WWW}\nUser-Agent: curl/8.5.0\nAccept: */*`,
      note: `請求到了，nginx 依序做三個決定。server：Host 是 ${WWW}，正好是 lanterntea 區塊 server_name 的精確名稱（精確名稱比 *.${SITE} 優先）。location：/images/logo.png 符合的前綴有 / 與 ^~ /images/，最長的是 ^~ /images/，有 ^~ 所以不再檢查正規表示式，雖然 ~* \\.(css|js|png|jpg)$ 也符合。檔案：alias 把 location 的前綴 /images/ 換成 /srv/media/images/，得到磁碟上的路徑；如果寫的是 root，nginx 會把整個 URI 接在後面。`,
      tables: [steps('/srv/media/images/logo.png', [1, 2, 3])] },
    { id: 'ok-logo', from: 'nginx', to: 'client', label: '200 OK（17 位元組的 PNG）',
      headers: [response('200', 'OK', [...head('image/png', 17), ['X-Content-Type-Options', 'nosniff']]), tcp('80', PORT, 'PSH, ACK'), ipv4(WEB_IP, LAPTOP_IP)],
      payload: 'HTTP/1.1 200 OK\n…\nX-Content-Type-Options: nosniff\n\n（17 位元組的檔案內容）',
      note: 'worker 以 www-data 的身分走過 /srv、/srv/media、/srv/media/images（每一層都要有 x）並讀到檔案（要有 r），Content-Type 依 mime.types 由副檔名 png 決定。回應帶著 server 層的 X-Content-Type-Options，因為 /images/ 的 location 沒有自己的 add_header，所以沿用上一層的；也沒有 Cache-Control，因為加上它的是沒有被選中的正規表示式 location。送出回應之後，nginx 在這個 location 有效的 access_log 寫下一行 combined 格式的紀錄。',
      tables: [steps('/srv/media/images/logo.png'), accessLog([ACCESS_1], [0])] },
    { id: 'get-old', from: 'client', to: 'nginx', label: 'GET /images/old-logo.png（同一條連線）',
      headers: [get('/images/old-logo.png'), tcp(PORT, '80', 'PSH, ACK'), ipv4(LAPTOP_IP, WEB_IP)],
      payload: `GET /images/old-logo.png HTTP/1.1\nHost: ${WWW}\nUser-Agent: curl/8.5.0\nAccept: */*`,
      note: '第二個網址的主機與埠和第一個相同，curl 沿用同一條連線（來源連接埠仍是 52144），nginx 不必重新選 listen。server 與 location 的判斷和剛才一樣，alias 換出的路徑是 /srv/media/images/old-logo.png，但這個檔案不存在。',
      tables: [steps('/srv/media/images/old-logo.png（不存在）', [3])] },
    { id: 'not-found', from: 'nginx', to: 'client', label: '404 Not Found',
      headers: [response('404', 'Not Found', head('text/html', 155)), tcp('80', PORT, 'PSH, ACK'), ipv4(WEB_IP, LAPTOP_IP)],
      payload: 'HTTP/1.1 404 Not Found\n…\n\n<html>…<h1>404 Not Found</h1>…</html>',
      note: '/images/ 的 location 沒有 try_files，由靜態檔案模組直接開檔，開不到就回 404，並在 error_log 記下它試著開的完整路徑：這一行正好說明 nginx 把網址對應到了磁碟上的哪裡。若是 location / 那種 try_files $uri $uri/ =404 找不到檔案，nginx 一樣回 404，卻不寫 error log。*1 是連線的序號：兩個請求走同一條連線，所以都是 1。access log 照樣記下這次 404。',
      tables: [{ node: 'nginx', name: 'lanterntea.error.log', head: ['行', '紀錄'], rows: [['1', ERROR_1]], changed: [0] }, accessLog([ACCESS_1, ACCESS_2], [1])] },
  ],
};

const LANTERNTEA_FRESH = `server {
    listen 80;
    server_name ${SITE} ${WWW};
    root /var/www/lanterntea;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}
`;
const STATUS_BROKEN = `server {
    listen 80;
    server_name status.${SITE};
    return 200 "up\\n"
}
`;
const STATUS_FIXED = STATUS_BROKEN.replace('"up\\n"', '"up\\n";');
/** The shop's site written compactly with the images location as a plain prefix placed before the regex (a mistake). */
const ORDER_MISTAKE = `server {
listen 80;
server_name ${SITE} ${WWW};
root /var/www/lanterntea;
add_header X-Content-Type-Options nosniff;
location / { try_files $uri $uri/ =404; }
location /images/ { alias /srv/media/images/; }
location ~* \\.(css|js|png|jpg)$ { add_header Cache-Control "max-age=604800"; }
}
`;

export const SRV06: LessonContent = {
  lessonId: 'SRV06',
  motivation: `燈籠茶行的網站要搬上自己的伺服器 web-01：首頁、關於我們、樣式表與圖片都是做好的靜態檔案，只差一個網頁伺服器把它們交給瀏覽器。nginx 一裝好就會回應「Welcome to nginx!」，但要讓 ${WWW} 顯示茶行的首頁、讓 /images/ 從另一個資料夾取圖、讓員工手冊只給該看的人看，全靠設定檔裡的 server 與 location 區塊。設定寫錯的代價很直接：圖片變成 404、整個資料夾變成 403，或是一次 restart 讓網站整個停掉。這一課從 Ubuntu 的檔案配置開始，寫出一個靜態網站的 server 區塊，弄清楚 nginx 怎麼選 server、怎麼選 location，學會先 nginx -t 再 reload 的安全流程，最後從存取日誌與錯誤日誌找出 404 與 403 的原因。`,
  sections: [
    {
      id: 'srv06-s-layout', title: 'nginx 在 Ubuntu 上的檔案與設定的結構',
      blocks: [
        { type: 'p', text: '`apt install nginx` 之後，nginx 已經在執行：systemd 的 nginx.service 啟動一個以 root 執行的 master 行程，它讀設定、開好監聽的 socket，再產生幾個以 www-data 執行的 worker 行程，真正處理請求的是 worker。設定全部在 /etc/nginx 底下，Ubuntu（沿用 Debian 的慣例）把它拆成幾個部分：' },
        { type: 'table', head: ['路徑', '用途'], rows: [
          ['`/etc/nginx/nginx.conf`', '主設定檔：user、worker_processes、events、http 區塊與全域的日誌；最後以 include 載入 conf.d 與 sites-enabled'],
          ['`/etc/nginx/sites-available/`', '每個網站一個檔案（server 區塊），寫在這裡還不會生效；預設有一個 default'],
          ['`/etc/nginx/sites-enabled/`', '指向 sites-available 的符號連結；nginx.conf 的 `include /etc/nginx/sites-enabled/*;` 只載入這裡的東西，所以「啟用」就是建立連結、「停用」就是刪掉連結'],
          ['`/etc/nginx/conf.d/*.conf`', '另一種放設定的地方，同樣在 http 區塊裡載入；只認 .conf 結尾。nginx.org 官方套件只用這個資料夾'],
          ['`/etc/nginx/snippets/`', '可以被多個網站 include 的片段，例如 TLS 參數'],
          ['`/etc/nginx/mime.types`', '副檔名對應 Content-Type 的表（png → image/png）'],
          ['`/var/www/html/`', '預設網站的根目錄，裡面是「Welcome to nginx!」的頁面'],
          ['`/var/log/nginx/`', 'access.log 與 error.log；網站也可以有自己的日誌檔'],
        ] },
        { type: 'p', text: '設定檔由指令（directive）組成：名稱、參數、分號，例如 `root /var/www/lanterntea;`；有些指令後面接一對大括號，形成一個區塊（context），裡面再放其他指令。每個指令只能出現在特定的區塊中，放錯位置時 nginx -t 會說 `"listen" directive is not allowed here`。五種區塊由外而內是：' },
        { type: 'table', head: ['區塊', '位置', '常見的指令'], rows: [
          ['main', '檔案的最外層，不在任何大括號裡', '`user www-data;`、`worker_processes auto;`、`pid`、`error_log`'],
          ['events', 'main 裡面，必須有一個', '`worker_connections 768;`：每個 worker 最多同時處理的連線數'],
          ['http', 'main 裡面', '`include mime.types`、`default_type`、`access_log`、`sendfile`，以及所有網站'],
          ['server', 'http 裡面，一個虛擬主機一個', '`listen`、`server_name`、`root`、`index`、`add_header`'],
          ['location', 'server 裡面（也可以巢狀），一種網址路徑一個', '`try_files`、`root`／`alias`、`return`、`deny`'],
        ] },
        { type: 'p', text: '外層的設定會被內層繼承：http 裡的 access_log、server 裡的 root 與 index，location 沒有另外寫時都沿用。sites-available 的檔案沒有寫 http，因為它是在 nginx.conf 的 http 區塊裡被 include 進來的，裡面直接從 server 開始。`sudo nginx -T` 會先測試設定，再把實際讀到的每個檔案依序印出來，是確認「nginx 到底看到了什麼」最直接的方法。' },
        { type: 'example', id: 'srv06-layout' },
        { type: 'callout', tone: 'note', title: '模擬環境裡的 nginx', text: '本課的機器、網站與網域都是虛構的（lanterntea.example），時鐘固定在 2026-11-22 10:00 UTC。nginx 是 Ubuntu 24.04 的 1.24.0：設定由引擎真正解析，訊息與日誌依照 nginx 的格式；為了簡潔，nginx.conf 省略了 Ubuntu 註解掉的段落。反向代理（proxy_pass）是下一課的主題，這一課只服務靜態檔案。' },
      ],
    },
    {
      id: 'srv06-s-server', title: '為靜態網站寫一個 server 區塊',
      blocks: [
        { type: 'p', text: '一個提供靜態檔案的網站，最少只需要幾行。燈籠茶行的設定存成 /etc/nginx/sites-available/lanterntea，由下表這五個指令組成（完整的寫法見本課第一個練習）：' },
        { type: 'table', head: ['指令', '意思'], rows: [
          ['`listen 80;`', '這個 server 接受哪個位址與埠的連線；只寫埠時是所有位址（0.0.0.0）。`listen 80 default_server;` 讓它成為這個位址與埠的預設網站'],
          [`\`server_name ${SITE} ${WWW};\``, '這個 server 負責的主機名稱（比對請求的 Host 標頭），可以寫好幾個，空格分隔'],
          ['`root /var/www/lanterntea;`', '網站的根目錄：請求 /about/index.html 對應到 /var/www/lanterntea/about/index.html（root 加上完整的 URI）'],
          ['`index index.html;`', '請求的是資料夾（以 / 結尾）時，要找的預設檔名'],
          ['`location / { try_files $uri $uri/ =404; }`', '依序試：$uri 是不是檔案、$uri/ 是不是資料夾（再交給 index），都不是就回 404'],
        ] },
        { type: 'p', text: '有了這個區塊，nginx 對靜態檔案的回應就很好預測：檔案存在而且 www-data 讀得到是 200，Content-Type 依 mime.types；請求的是資料夾卻少了結尾的斜線（/about），nginx 回 301 把瀏覽器導到 /about/；資料夾裡沒有 index 檔、又沒有開 autoindex 是 403；檔案存在但 www-data 讀不到（或路徑上某一層資料夾進不去）也是 403；不存在是 404。' },
        { type: 'p', text: '寫好之後要做四件事，順序不能錯：(1) 在 sites-available 寫好檔案；(2) 在 sites-enabled 建立指向它的符號連結 `sudo ln -s /etc/nginx/sites-available/lanterntea /etc/nginx/sites-enabled/`；(3) `sudo nginx -t` 測試全部的設定；(4) 通過了才 `sudo systemctl reload nginx` 套用。模擬環境沒有文字編輯器，本課用 `printf \'…\' | sudo tee 檔案` 寫入設定：printf 把 \\n 換成換行，tee 以 root 寫入檔案（同時把內容印在畫面上）。真實的伺服器上通常用 `sudo nano` 或 `sudo vim` 編輯。' },
        { type: 'p', text: '網站的檔案要讓 worker 的使用者讀得到。worker 以 www-data 執行，它要開 /var/www/lanterntea/about/index.html，從 / 到 about 的每一層資料夾都要有它能用的 x（進入）權限，檔案本身要有 r。最常見的安排是資料夾 755、檔案 644，擁有者是負責部署的使用者；不需要、也不應該把網站檔案交給 www-data 擁有，否則 nginx 一旦有漏洞就能改寫網站。懷疑權限時，可以用 `sudo -u www-data cat 檔案` 以 www-data 的身分試著讀讀看。' },
      ],
    },
    {
      id: 'srv06-s-reload', title: 'nginx -t 與 reload：不中斷地套用新設定',
      blocks: [
        { type: 'p', text: '改了設定檔，正在執行的 nginx 不會自己發現：它用的是啟動或上一次 reload 時讀進記憶體的設定。要讓新設定生效有兩種方法，差別很大：' },
        { type: 'table', head: ['做法', '發生什麼事', '設定有錯時'], rows: [
          ['`sudo systemctl reload nginx`（或 `sudo nginx -s reload`）', 'master 收到 HUP 訊號，重新讀設定；成功就開新的 worker，舊的 worker 把手上的請求處理完再結束。監聽的 socket 一直開著，沒有連線被拒絕', '新設定不採用，master 在 error log 留下原因，舊設定繼續服務；systemctl 回報 reload 失敗'],
          ['`sudo systemctl restart nginx`', '先停止整個 nginx（所有連線中斷），再重新啟動；啟動前 systemd 會先跑一次 `nginx -t`', '停止已經做完、啟動失敗：服務變成 failed，80 埠沒有任何程式，網站整個停擺'],
        ] },
        { type: 'p', text: '所以日常改設定一律 reload，restart 留給真的需要重新啟動整個程式的情況（例如升級 nginx 本身後，或改了某些只在啟動時讀的設定）。更好的習慣是 reload 之前先自己跑 `sudo nginx -t`：它解析全部的設定、檢查 include 的檔案、日誌的資料夾、憑證能不能讀，成功時印出 `syntax is ok` 與 `test is successful`，失敗時印出 `nginx: [emerg]` 開頭的訊息與出錯的檔案和行號。注意 nginx -t 要用 sudo：一般使用者打不開 error log 與 /run/nginx.pid，測試一定失敗，那不是設定的問題。' },
        { type: 'p', text: 'reload 成功的跡象是 worker 換了新的 PID（`ps -ef | grep \'nginx: worker\'`），master 的 PID 不變。LNX10 學過 systemd 的 reload 與 restart；nginx 的 unit 把 `ExecReload=` 設成 `nginx -s reload`，所以 systemctl reload 就是送 HUP 給 master。' },
        { type: 'example', id: 'srv06-reload' },
        { type: 'callout', tone: 'warning', title: '常見誤解：restart 比 reload 更徹底、更保險', text: 'restart 的確會重新讀設定，但它先把網站停掉才檢查新設定：設定有一個少掉的分號，restart 之後網站就不見了，直到有人修好再 start。reload 則是先檢查、通過才換，失敗時舊設定照常服務。而且即使設定正確，restart 也會切斷進行中的下載與 keep-alive 連線。順序永遠是：改檔、`sudo nginx -t`、`sudo systemctl reload nginx`、用 curl 確認。' },
      ],
    },
    {
      id: 'srv06-s-server-name', title: '一個位址上的多個網站：nginx 怎麼選 server',
      blocks: [
        { type: 'p', text: 'web-01 只有一個 IP，卻同時服務茶行的網站、員工手冊與 Ubuntu 的預設網站，靠的是虛擬主機：每個 server 區塊各自宣告 server_name，nginx 用請求的 Host 標頭挑出負責的那一個。挑選分兩步。第一步看連線：連線的目的位址與埠決定哪些 server 是候選（listen 位址完全相同的優先，否則是 0.0.0.0 的）。第二步在候選中比對 Host：' },
        { type: 'table', head: ['順序', 'server_name 的寫法', '例子與說明'], rows: [
          ['1', '精確名稱', `\`${WWW}\`：完全相同才符合（不分大小寫）`],
          ['2', '開頭的萬用字元', `\`*.${SITE}\`：符合 shop.${SITE}、a.b.${SITE}，但不符合 ${SITE} 本身；有好幾個時取最長的`],
          ['3', '結尾的萬用字元', '`mail.*`：符合 mail.example.net；有好幾個時取最長的'],
          ['4', '正規表示式', '`~^(?<sub>\\w+)\\.example\\.org$`：依設定檔的順序，第一個符合的'],
          ['5', '預設 server', '都不符合（或根本沒有 Host，例如直接用 IP 連線的掃描程式）時，交給這個位址與埠標了 default_server 的 server；沒有標的話是設定中第一個'],
        ] },
        { type: 'p', text: `\`.${SITE}\` 是一種簡寫，同時代表 ${SITE} 與 *.${SITE}。茶行的設定裡，other-names 用 *.${SITE} 接住所有沒有自己 server 的子網域（例如打錯的 shop.${SITE}），以 301 導到 www；${DOCS} 有精確名稱的 server，不會被萬用字元搶走。直接以 IP 連線時，Host 是 ${WEB_IP}，沒有任何 server_name 符合，於是由預設網站回應「Welcome to nginx!」。` },
        { type: 'example', id: 'srv06-server-select' },
        { type: 'callout', tone: 'note', title: 'server_name _ 不是萬用字元', text: 'Ubuntu 的 default 網站寫著 `server_name _;`，常被誤會成「符合所有名稱」。底線只是一個不可能出現的名稱，讓這個 server 不會因為名稱被選中；它之所以接住其他請求，是因為 `listen 80 default_server`。兩個 server 在同一個位址與埠都標 default_server 時，nginx -t 會失敗（a duplicate default server）。兩個 server 寫了同一個 server_name 時，nginx -t 只發出 conflicting server name 的警告並忽略後面那個，測試仍然成功，這種錯誤要從警告裡找出來。' },
      ],
    },
    {
      id: 'srv06-s-location', title: 'location 的比對順序、root 與 alias、add_header 的繼承',
      blocks: [
        { type: 'p', text: '選好 server 之後，nginx 用請求的 URI（不含查詢字串，已經解碼並合併多餘的斜線）在它的 location 之中挑一個。location 有五種寫法：' },
        { type: 'table', head: ['寫法', '種類', '符合的條件'], rows: [
          ['`location = /`', '完全相同', 'URI 正好是 /'],
          ['`location /docs/`', '前綴', 'URI 以 /docs/ 開頭（分大小寫）'],
          ['`location ^~ /static/`', '前綴，且不再檢查正規表示式', 'URI 以 /static/ 開頭，而且它是最長的前綴時，直接選它'],
          ['`location ~ \\.pdf$`', '正規表示式，分大小寫', 'URI 符合這個正規表示式'],
          ['`location ~* \\.(png|jpg)$`', '正規表示式，不分大小寫', '同上，但 .PNG 也算'],
        ] },
        { type: 'list', ordered: true, items: [
          '先看所有的前綴（含 =）。有 = 而且完全相同，立刻選它，結束。',
          '記住符合的前綴中最長的那一個（和它在檔案中的位置無關）。如果它是 ^~，選它，結束。',
          '依設定檔中的順序逐一檢查正規表示式，第一個符合的就是答案，結束。',
          '沒有任何正規表示式符合，才使用第 2 步記住的最長前綴。',
        ] },
        { type: 'p', text: '下表是 web-01 上 routes-lab（8080 埠）的六個 location，A 到 F 依序是 `= /`、`/`、`/docs/`、`^~ /static/`、`~* \\.(png|jpg)$`、`~ ^/docs/.+\\.(pdf|png)$`，每個都回應自己的代號。用這個方法一步一步算出答案，再和範例裡 curl 的結果對照：' },
        { type: 'table', head: ['URI', '最長的前綴', '正規表示式', '結果'], rows: [
          ['`/`', '`= /` 完全相同', '不檢查（= 已經結束）', 'A'],
          ['`/index.html`', '`/`', 'E、F 都不符合', 'B（記住的前綴）'],
          ['`/docs/intro.html`', '`/docs/`（比 / 長）', 'E、F 都不符合', 'C'],
          ['`/static/logo.png`', '`^~ /static/`', '不檢查（^~）；否則 E 會符合', 'D'],
          ['`/docs/map.png`', '`/docs/`', 'E 符合、F 也符合，E 寫在前面', 'E'],
          ['`/docs/guide.pdf`', '`/docs/`', 'E 不符合、F 符合', 'F'],
          ['`/DOCS/Intro.HTML`', '`/`（前綴分大小寫，/docs/ 不符合）', 'E、F 都不符合', 'B'],
        ] },
        { type: 'callout', tone: 'warning', title: '常見誤解：location 依寫在檔案裡的順序比對', text: '只有正規表示式依檔案順序；前綴之間比的是長度，與先後無關。所以把 `location /images/` 搬到 `location ~* \\.(png|jpg)$` 前面完全沒有用：/images/logo.png 的最長前綴是 /images/，接著仍然要檢查正規表示式，而 .png 符合，請求被正規表示式的 location 搶走。要讓 /images/ 底下不再檢查正規表示式，就把它寫成 `location ^~ /images/`。' },
        { type: 'p', text: '找到 location 之後，nginx 決定磁碟上的路徑。root 把完整的 URI 接在後面；alias 只能用在 location 裡，它把 location 比對到的前綴換掉。兩者最容易混淆的地方如下（請求都是 /images/logo.png）：' },
        { type: 'table', head: ['設定', '磁碟上的路徑', '說明'], rows: [
          ['`location /images/ { alias /srv/media/images/; }`', '/srv/media/images/logo.png', '/images/ 換成 /srv/media/images/'],
          ['`location /images/ { root /srv/media; }`', '/srv/media/images/logo.png', 'root 加上完整的 URI：寫 root 時不要把 /images 也寫進去'],
          ['`location /images/ { root /srv/media/images/; }`', '/srv/media/images/images/logo.png', '常見錯誤：images 重複了一次，結果 404'],
          ['server 層 `root /var/www/lanterntea;`，被別的 location 選中', '/var/www/lanterntea/images/logo.png', '請求沒有進到 /images/ 的 location 時，用的是 server 的 root'],
        ] },
        { type: 'p', text: 'alias 的結尾斜線要和 location 一致（location 有斜線、alias 也有）。add_header 的繼承規則也常讓人意外：某一層只要有自己的 add_header，就完全取代上一層的全部 add_header，而不是加在後面。茶行的 server 層加了 `X-Content-Type-Options nosniff`，負責 css 與圖片的正規表示式 location 加了 `Cache-Control`，於是樣式表的回應只有 Cache-Control，nosniff 不見了；要兩者都有，就得在那個 location 裡把 nosniff 再寫一次。另外，add_header 只加在 200、201、204、206、301、302、303、304、307、308 的回應，其他狀態碼要加上 `always` 參數。' },
        { type: 'example', id: 'srv06-locations' },
        { type: 'p', text: '把整條路連起來看：連線的位址與埠先決定 listen，Host 決定 server，URI 決定 location，location 的 root 或 alias 決定檔案，最後回應並寫日誌。下面的情境是 location 修好之後，一個請求在 nginx 裡面走過的每一步。' },
        { type: 'example', id: 'srv06-request-path' },
      ],
    },
    {
      id: 'srv06-s-logs', title: '存取日誌與錯誤日誌：從 404 與 403 找原因',
      blocks: [
        { type: 'p', text: 'nginx 有兩種日誌。存取日誌（access_log）每個請求一行，記錄誰在什麼時候要了什麼、得到什麼；錯誤日誌（error_log）只在出問題時寫，說明 nginx 遇到了什麼。Ubuntu 預設寫到 /var/log/nginx/access.log 與 error.log，server 或 location 可以用自己的 access_log、error_log 改到別的檔案（茶行的網站就是 lanterntea.access.log）。Ubuntu 套件建立的 access.log、error.log（以及 logrotate 輪替後新建的檔案）屬於 www-data:adm、模式 0640，一般使用者要 sudo 或屬於 adm 群組才讀得到；nginx 自己第一次建立的日誌檔則屬於 root。存取日誌預設的 combined 格式：' },
        { type: 'table', head: ['欄位', '例子', '意思'], rows: [
          ['$remote_addr', '198.51.100.23', '用戶端的 IP（經過代理時是代理的 IP，下一課處理）'],
          ['- $remote_user', '- -', '第一個 - 是固定的；第二個是 HTTP 驗證的使用者，沒有時是 -'],
          ['[$time_local]', '[22/Nov/2026:10:00:00 +0000]', '伺服器的當地時間與時區'],
          ['"$request"', '"GET /images/logo.png HTTP/1.1"', '請求列：方法、URI、版本'],
          ['$status', '200', '回應的狀態碼'],
          ['$body_bytes_sent', '17', '本文的位元組數，不含標頭（HEAD 是 0）'],
          ['"$http_referer"', '"http://www.lanterntea.example/"', '從哪個頁面連過來，沒有時是 "-"'],
          ['"$http_user_agent"', '"curl/8.5.0"', '用戶端程式'],
        ] },
        { type: 'p', text: '錯誤日誌的一行是：時間、[等級]（debug、info、notice、warn、error、crit、alert、emerg）、worker 的 PID#執行緒、*連線序號、訊息，再接上 client、server、request、host。404 與 403 各有幾種典型的訊息：' },
        { type: 'table', head: ['訊息', '狀態碼', '原因與處理'], rows: [
          ['（沒有錯誤日誌）', '404', 'try_files 找不到檔案時只回 404、不寫 error log；看 access log 的狀態碼與路徑'],
          ['`open() "…" failed (2: No such file or directory)`', '404', '沒有 try_files 的 location 開不到檔案；引號裡是 nginx 試著開的完整路徑，常常一眼就看出 root／alias 或 location 選錯了'],
          ['`directory index of "…/" is forbidden`', '403', '請求的是資料夾，裡面沒有 index 指定的檔案，而 autoindex 是 off；放上 index.html，或確認 index 寫的檔名'],
          ['`open() "…" failed (13: Permission denied)`', '403', 'www-data 讀不到檔案，或路徑上某一層資料夾沒有 x；檢查每一層的權限'],
          ['`access forbidden by rule`', '403', '被 deny 規則擋下，是刻意的設定'],
        ] },
        { type: 'p', text: '日誌是事後追查的依據，也是巡檢的資料：用 grep、cut、sort、uniq 就能從 access log 算出哪些網址最常 404（壞掉的連結或掃描程式在找 /wp-login.php、/.env）、哪個 IP 送了最多請求。請求本身也會寫進日誌：你用 curl 測試的每一次，都會在檔案的最後多一行。' },
        { type: 'example', id: 'srv06-logs' },
        { type: 'callout', tone: 'tip', title: '403 時不要先 chmod -R 777', text: '看到 Permission denied，最快「修好」的方法是 `chmod -R 777`，代價是任何使用者都能改寫網站，連原本刻意不公開的資料夾也一起公開了。先讀 error log 找出是哪個路徑，再只補上缺少的那一個權限：資料夾缺 x 就 `chmod o+x`（或改用群組），檔案缺 r 就 `chmod o+r`。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  network: {
    scenes: [requestPath],
    exercises: [
      { id: 'srv06-net-location', task: 'table', scene: 'srv06-request-path', message: 'get-logo', node: 'nginx', table: STEPS, row: 'location', column: '結果', title: '哪一個 location 處理 /images/logo.png',
        statement: '在「一個請求在 nginx 裡走過的路」情境中，lanterntea 的 server 有 `location /`、`location ~* \\.(css|js|png|jpg)$` 與 `location ^~ /images/`。收到 GET /images/logo.png 之後，「nginx 的處理過程」表中 location 這一列的「結果」是什麼？（照設定的寫法填，例如 = /about）',
        hints: ['先找出符合的前綴之中最長的一個，再看它有沒有 ^~。', '只有在最長的前綴沒有 ^~ 時，nginx 才會依序檢查正規表示式。'],
        explanation: '符合 /images/logo.png 的前綴有 / 與 /images/，最長的是 ^~ /images/；^~ 讓 nginx 不再檢查正規表示式，所以即使 ~* \\.(css|js|png|jpg)$ 也符合，答案仍是 ^~ /images/。如果把 ^~ 拿掉，正規表示式就會搶走這個請求，nginx 用 server 的 root 找 /var/www/lanterntea/images/logo.png，結果是 404。',
        mistakes: [
          { answer: { cell: '~* \\.(css|js|png|jpg)$' }, why: '正規表示式確實符合，但最長的前綴是 ^~ /images/，^~ 讓 nginx 在檢查正規表示式之前就結束了。' },
          { answer: { cell: '/' }, why: '/ 符合所有 URI，但它是最短的前綴；nginx 記住的是最長的那一個。' },
        ] },
      { id: 'srv06-net-file', task: 'table', scene: 'srv06-request-path', message: 'get-logo', node: 'nginx', table: STEPS, row: '檔案', column: '結果', title: 'alias 換出的檔案路徑',
        statement: '同一個情境中，location ^~ /images/ 裡寫的是 `alias /srv/media/images/;`。處理 GET /images/logo.png 時，「nginx 的處理過程」表中「檔案」這一列的「結果」是哪一個路徑？',
        hints: ['alias 會把 location 比對到的那一段前綴換掉。', 'location 的前綴是 /images/，URI 剩下的部分是 logo.png。'],
        explanation: 'alias 把 URI 開頭的 /images/ 換成 /srv/media/images/，剩下的 logo.png 接在後面，得到 /srv/media/images/logo.png。若寫成 root /srv/media/images/，nginx 會把完整的 URI 接上去，變成 /srv/media/images/images/logo.png；若請求被正規表示式的 location 搶走，用的是 server 的 root，變成 /var/www/lanterntea/images/logo.png。',
        mistakes: [
          { answer: { cell: '/srv/media/images/images/logo.png' }, why: '這是 root 的算法（root 加上完整的 URI）；alias 會把前綴 /images/ 換掉，不會重複。' },
          { answer: { cell: '/var/www/lanterntea/images/logo.png' }, why: '這是 server 層 root 的路徑：只有請求沒進到 /images/ 的 location 時才會用它，修好之後 ^~ 讓它進來了。' },
        ] },
    ],
  },
  quiz: [
    {
      id: 'srv06-q1', prompt: '在 Ubuntu 上，`/etc/nginx/sites-available/shop` 已經寫好而且語法正確，但 `sudo systemctl reload nginx` 之後網站完全沒有出現。最可能漏了哪一步？',
      options: ['把檔名改成 shop.conf', '執行 `sudo nginx -T`', '在 /etc/nginx/sites-enabled/ 建立指向它的符號連結', '把檔案的擁有者改成 www-data'],
      answer: 2,
      explanation: 'nginx.conf 只 include /etc/nginx/sites-enabled/*，sites-available 裡的檔案不會被讀到，要用 ln -s 建立連結才算啟用。.conf 結尾是 conf.d 的規則，sites-enabled 不看副檔名；nginx -T 只是測試並印出設定，不會啟用任何東西；設定檔由 root 的 master 讀取，擁有者不必是 www-data。',
    },
    {
      id: 'srv06-q2', prompt: '你改了網站的設定，`sudo nginx -t` 印出 `nginx: [emerg] unexpected "}" in /etc/nginx/sites-enabled/shop:7`。這時如果仍然執行 `sudo systemctl reload nginx`，會發生什麼事？',
      options: ['reload 失敗，nginx 繼續用舊的設定服務，網站不受影響', 'nginx 停止，網站中斷到修好為止', 'nginx 套用第 7 行之前的設定，略過錯誤的部分', 'nginx 自動回復成 Ubuntu 的預設網站'],
      answer: 0,
      explanation: 'reload 時 nginx 先解析新設定，失敗就不採用：舊的 worker 繼續以舊設定服務，systemctl 回報 reload 失敗。會讓網站中斷的是 restart（先停再啟動，啟動時測試失敗）；nginx 不會只套用一部分設定，也不會自己換回預設網站。',
    },
    {
      id: 'srv06-q3', prompt: '同一個 server 裡有 `location /assets/ { … }`、`location ~* \\.(png|jpg)$ { … }`、`location ^~ /assets/img/ { … }`。請求 `/assets/img/logo.png` 由哪一個處理？',
      options: ['`location /assets/`，因為它寫在最前面', '`location ~* \\.(png|jpg)$`，因為正規表示式優先於前綴', 'nginx -t 會失敗，因為兩個前綴互相重疊', '`location ^~ /assets/img/`'],
      answer: 3,
      explanation: '前綴比的是長度：/assets/img/ 比 /assets/ 長，所以它是記住的最長前綴；它帶著 ^~，nginx 不再檢查正規表示式，直接選它。寫在前面不影響前綴的選擇；正規表示式只有在最長前綴沒有 ^~ 時才會檢查；重疊的前綴是正常的寫法，不會讓測試失敗。',
    },
    {
      id: 'srv06-q4', prompt: '`location /files/ { alias /data/shared/; }`，請求 `/files/report.pdf` 會讀磁碟上的哪個檔案？',
      options: ['/data/shared/files/report.pdf', '/data/shared/report.pdf', '/files/report.pdf', '/data/shared/files/files/report.pdf'],
      answer: 1,
      explanation: 'alias 把 location 比對到的前綴 /files/ 換成 /data/shared/，剩下的 report.pdf 接在後面。/data/shared/files/report.pdf 是寫成 root /data/shared 時的結果（root 加上完整的 URI）；nginx 不會直接讀 URI 本身的路徑；也不會把前綴重複兩次。',
    },
    {
      id: 'srv06-q5', prompt: `80 埠上有三個 server：\`listen 80 default_server; server_name _;\`、\`server_name ${WWW};\`、\`server_name *.${SITE};\`。請求的 Host 是 \`shop.${SITE}\`，哪一個回應？`,
      options: ['`server_name _` 的預設 server，因為 _ 符合所有名稱', `\`server_name *.${SITE}\``, `\`server_name ${WWW}\`，因為它是同一個網域的精確名稱`, '沒有 server 回應，nginx 直接關閉連線'],
      answer: 1,
      explanation: `沒有精確名稱是 shop.${SITE}，接著看開頭的萬用字元，*.${SITE} 符合。_ 不是萬用字元，預設 server 只在所有名稱都不符合時才輪到；${WWW} 是另一個名稱，精確比對要完全相同；這個位址與埠一定有預設 server，不會沒有人回應。`,
    },
    {
      id: 'srv06-q6', prompt: '網站的 /downloads/ 回應 403，error log 寫著 `directory index of "/var/www/shop/downloads/" is forbidden`。最可能的原因是什麼？',
      options: ['www-data 沒有讀取 /var/www/shop 的權限', 'nginx 的設定檔有語法錯誤', '/downloads/ 裡面沒有 index 指令指定的檔案，而 autoindex 是 off', '請求被 deny 規則擋下'],
      answer: 2,
      explanation: '這則訊息表示 nginx 走到了這個資料夾，卻找不到 index 檔，又不允許列出目錄，所以回 403。權限不足的訊息是 (13: Permission denied)；語法錯誤時 nginx -t 失敗、reload 不會套用，不會出現在單一請求的錯誤裡；deny 擋下的訊息是 access forbidden by rule。',
    },
    {
      id: 'srv06-q7', prompt: 'server 層有 `add_header X-Frame-Options DENY;`，其中一個 location 有 `add_header Cache-Control "max-age=3600";`。這個 location 的 200 回應帶著哪些標頭？',
      options: ['兩個都有', '只有 Cache-Control', '只有 X-Frame-Options', '兩個都沒有，因為 add_header 不能出現在兩層'],
      answer: 1,
      explanation: 'add_header 的繼承規則是「這一層有自己的 add_header，就完全不繼承上一層的」，所以這個 location 只送出 Cache-Control。要兩個都有，必須在 location 裡把 X-Frame-Options 也寫一次；只有 X-Frame-Options 是 location 沒有任何 add_header 時的情況；add_header 可以同時寫在 server 與 location，不會出錯。',
    },
    {
      id: 'srv06-q8', prompt: '請求 `/blog/missing.html` 得到 404，access log 有這一行，error log 卻什麼都沒有。設定最可能是哪一種？',
      options: ['這個 location 用了 `try_files $uri $uri/ =404;`', '這個 location 沒有 try_files，由靜態檔案模組直接開檔', 'error log 的資料夾不存在', 'www-data 沒有寫入 error log 的權限'],
      answer: 0,
      explanation: 'try_files 找不到檔案時只回 404、不寫 error log，這是 nginx 的行為。沒有 try_files 時，靜態檔案模組開不到檔案會寫 open() failed (2: No such file or directory)；日誌資料夾不存在時 nginx -t 就會失敗；日誌由 master 以 root 開啟，worker 的權限不影響寫入。',
    },
  ],
  terminal: {
    machines: [fresh, live],
    examples: [
      {
        id: 'srv06-layout', title: '剛裝好的 nginx：檔案、行程與預設網站', machine: 'srv06-fresh',
        description: '看 /etc/nginx 的內容與 sites-enabled 的連結、nginx.conf 的 include、master 與 worker 行程與它們共用的 80 埠，再用 curl 看到預設網站，最後以 `nginx -T` 列出 nginx 實際讀到的檔案。',
        steps: [
          { command: 'ls /etc/nginx', output: 'conf.d/  mime.types  modules-enabled/  nginx.conf  sites-available/  sites-enabled/  snippets/' },
          { command: 'ls -l /etc/nginx/sites-available /etc/nginx/sites-enabled', output: '/etc/nginx/sites-available:\n-rw-r--r-- root    root      607 default\n\n/etc/nginx/sites-enabled:\nlrwxrwxrwx root    root       34 default -> /etc/nginx/sites-available/default' },
          { command: 'grep -n include /etc/nginx/nginx.conf', output: '5:include /etc/nginx/modules-enabled/*.conf;\n23:\tinclude /etc/nginx/mime.types;\n49:\tinclude /etc/nginx/conf.d/*.conf;\n50:\tinclude /etc/nginx/sites-enabled/*;' },
          { command: 'ps -eo user,pid,ppid,cmd | grep nginx', output: 'root         812       1 nginx: master process /usr/sbin/nginx -g daemon on; master_process on;\nwww-data     813     812 nginx: worker process\nlearner      815       1 grep nginx' },
          { command: 'sudo ss -tlnp sport = :80', output: 'State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process\nLISTEN 0      511          0.0.0.0:80        0.0.0.0:*    users:(("nginx",pid=813,fd=6),("nginx",pid=812,fd=6))' },
          { command: 'curl -s http://localhost/ | grep \'<h1>\'', output: '<h1>Welcome to nginx!</h1>' },
          { command: 'sudo nginx -T | grep \'^# configuration file\'', output: 'nginx: the configuration file /etc/nginx/nginx.conf syntax is ok\nnginx: configuration file /etc/nginx/nginx.conf test is successful\n# configuration file /etc/nginx/nginx.conf:\n# configuration file /etc/nginx/mime.types:\n# configuration file /etc/nginx/sites-enabled/default:' },
          { command: 'grep -v \'#\' /etc/nginx/sites-available/default | grep -v \'^$\'', output: 'server {\n\tlisten 80 default_server;\n\tlisten [::]:80 default_server;\n\troot /var/www/html;\n\tindex index.html index.htm index.nginx-debian.html;\n\tserver_name _;\n\tlocation / {\n\t\ttry_files $uri $uri/ =404;\n\t}\n}' },
        ],
      },
      {
        id: 'srv06-reload', title: '先 nginx -t 再 reload；restart 失敗會讓網站停擺', machine: 'srv06-fresh',
        description: '寫一個少了分號的狀態頁網站並啟用：nginx -t 指出檔案與行號；硬是 reload 會失敗，但 nginx 仍是 active，status 的名稱由預設網站接住；改用 restart 則整個 nginx 停掉，curl 連不上。修好之後測試、start，再 reload 一次，worker 換了新的 PID。',
        steps: [
          { command: tee('/etc/nginx/sites-available/status', STATUS_BROKEN), output: 'server {\n    listen 80;\n    server_name status.lanterntea.example;\n    return 200 "up\\n"\n}' },
          { command: 'sudo ln -s /etc/nginx/sites-available/status /etc/nginx/sites-enabled/', output: '' },
          { command: 'sudo nginx -t', output: 'nginx: [emerg] unexpected "}" in /etc/nginx/sites-enabled/status:5\nnginx: configuration file /etc/nginx/nginx.conf test failed' },
          { command: 'sudo systemctl reload nginx', output: 'Job for nginx.service failed because the control process exited with error code.\nSee "systemctl status nginx.service" and "journalctl -xeu nginx.service" for details.' },
          { command: 'systemctl is-active nginx', output: 'active' },
          { command: `curl -s http://status.${SITE}/ | grep title`, output: '<title>Welcome to nginx!</title>' },
          { command: 'sudo systemctl restart nginx', output: 'Job for nginx.service failed because the control process exited with error code.\nSee "systemctl status nginx.service" and "journalctl -xeu nginx.service" for details.' },
          { command: 'systemctl is-active nginx', output: 'failed' },
          { command: `curl -sS http://status.${SITE}/`, output: 'curl: (7) Failed to connect to status.lanterntea.example port 80 after 0 ms: Couldn\'t connect to server' },
          { command: `${tee('/etc/nginx/sites-available/status', STATUS_FIXED)} > /dev/null`, output: '' },
          { command: 'sudo nginx -t', output: 'nginx: the configuration file /etc/nginx/nginx.conf syntax is ok\nnginx: configuration file /etc/nginx/nginx.conf test is successful' },
          { command: 'sudo systemctl start nginx', output: '' },
          { command: `curl -s http://status.${SITE}/`, output: 'up' },
          { command: 'ps -ef | grep \'nginx: worker\'', output: 'www-data     817     816  0 10:00 ?        00:00:00 nginx: worker process\nlearner      819       1  0 10:00 pts/0    00:00:00 grep nginx: worker' },
          { command: 'sudo systemctl reload nginx', output: '' },
          { command: 'ps -ef | grep \'nginx: worker\'', output: 'www-data     818     816  0 10:00 ?        00:00:00 nginx: worker process\nlearner      820       1  0 10:00 pts/0    00:00:00 grep nginx: worker' },
        ],
      },
      {
        id: 'srv06-server-select', title: '同一個 IP 上的四個 server', machine: 'srv06-live',
        description: '`nginx -T` 列出 80 埠上每個 server 的 listen 與 server_name；精確名稱、開頭萬用字元的 301 與預設網站各自回應；直接用 IP 或不認得的 Host 都落到 default_server。',
        steps: [
          { command: 'sudo nginx -T 2>/dev/null | grep -e \'listen \' -e server_name', output: '\tlisten 80 default_server;\n\tlisten [::]:80 default_server;\n\tserver_name _;\n    listen 80;\n    server_name docs.lanterntea.example;\n    listen 80;\n    server_name lanterntea.example www.lanterntea.example;\n    listen 80;\n    server_name *.lanterntea.example;\n    listen 8080;\n    server_name localhost;' },
          { command: `curl -s http://${WWW}/`, output: '<h1>燈籠茶行</h1>' },
          { command: `curl -sI http://shop.${SITE}/tea?id=7 | grep -e HTTP -e Location`, output: 'HTTP/1.1 301 Moved Permanently\nLocation: http://www.lanterntea.example/tea?id=7' },
          { command: `curl -s http://${WEB_IP}/ | grep title`, output: '<title>Welcome to nginx!</title>' },
          { command: `curl -s -H 'Host: unknown.example' http://${WEB_IP}/ | grep title`, output: '<title>Welcome to nginx!</title>' },
        ],
      },
      {
        id: 'srv06-locations', title: 'location 的比對、add_header 的繼承，以及一張壞掉的圖片', machine: 'srv06-live',
        description: '在 8080 的 routes-lab 對七個 URI 各送一次請求，結果和課文的表一致；茶行首頁有 nosniff，樣式表被正規表示式 location 的 add_header 取代，只剩 Cache-Control；最後 /images/logo.png 是 404，error log 寫出 nginx 試著開的路徑，說明請求被哪個 location 搶走了。',
        steps: [
          { command: 'for p in / /index.html /docs/intro.html /static/logo.png /docs/map.png /docs/guide.pdf /DOCS/Intro.HTML; do printf \'%-18s \' $p; curl -s http://localhost:8080$p; done', output: '/                  A: location = /\n/index.html        B: location /\n/docs/intro.html   C: location /docs/\n/static/logo.png   D: location ^~ /static/\n/docs/map.png      E: location ~* \\.(png|jpg)$\n/docs/guide.pdf    F: location ~ ^/docs/.+\\.(pdf|png)$\n/DOCS/Intro.HTML   B: location /' },
          { command: `curl -sI http://${WWW}/ | grep -e X-Content -e Cache-Control`, output: 'X-Content-Type-Options: nosniff' },
          { command: `curl -sI http://${WWW}/css/site.css | grep -e X-Content -e Cache-Control`, output: 'Cache-Control: max-age=604800' },
          { command: 'cat /etc/nginx/snippets/lanterntea-images.conf', output: 'location /images/ {\n    alias /srv/media/images/;\n}' },
          { command: `curl -s -o /dev/null -w '%{http_code}\\n' http://${WWW}/images/logo.png`, output: '404' },
          { command: 'sudo tail -n 1 /var/log/nginx/lanterntea.error.log', output: '2026/11/22 10:00:00 [error] 813#813: *10 open() "/var/www/lanterntea/images/logo.png" failed (2: No such file or directory), client: 203.0.113.10, server: lanterntea.example, request: "GET /images/logo.png HTTP/1.1", host: "www.lanterntea.example"' },
          { command: 'ls /srv/media/images', output: 'banner.jpg  logo.png' },
        ],
      },
      {
        id: 'srv06-logs', title: '存取日誌與錯誤日誌：404 與兩種 403', machine: 'srv06-live',
        description: '一般使用者讀不到日誌；四個請求分別得到 200、404、403、403，access log 各有一行。error log 只有兩行：try_files 的 404 沒有紀錄，沒有 index 的資料夾與 www-data 讀不到的檔案各是一種 403。',
        steps: [
          { command: 'ls -l /var/log/nginx', output: '-rw-r----- www-data adm         0 access.log\n-rw-r----- www-data adm         0 error.log\n-rw-r----- www-data adm      1016 lanterntea.access.log\n-rw-r--r-- root    root        0 lanterntea.error.log' },
          { command: 'tail -n 1 /var/log/nginx/lanterntea.access.log', output: 'tail: cannot open \'/var/log/nginx/lanterntea.access.log\' for reading: Permission denied' },
          { command: `for p in / /nothing.html /downloads/ /reports/q3.html; do curl -s -o /dev/null -w "%{http_code} $p\\n" http://${WWW}$p; done`, output: '200 /\n404 /nothing.html\n403 /downloads/\n403 /reports/q3.html' },
          { command: 'sudo tail -n 4 /var/log/nginx/lanterntea.access.log', output: '203.0.113.10 - - [22/Nov/2026:10:00:00 +0000] "GET / HTTP/1.1" 200 22 "-" "curl/8.5.0"\n203.0.113.10 - - [22/Nov/2026:10:00:00 +0000] "GET /nothing.html HTTP/1.1" 404 155 "-" "curl/8.5.0"\n203.0.113.10 - - [22/Nov/2026:10:00:00 +0000] "GET /downloads/ HTTP/1.1" 403 155 "-" "curl/8.5.0"\n203.0.113.10 - - [22/Nov/2026:10:00:00 +0000] "GET /reports/q3.html HTTP/1.1" 403 155 "-" "curl/8.5.0"' },
          { command: 'sudo cat /var/log/nginx/lanterntea.error.log', output: '2026/11/22 10:00:00 [error] 813#813: *3 directory index of "/var/www/lanterntea/downloads/" is forbidden, client: 203.0.113.10, server: lanterntea.example, request: "GET /downloads/ HTTP/1.1", host: "www.lanterntea.example"\n2026/11/22 10:00:00 [error] 813#813: *4 open() "/var/www/lanterntea/reports/q3.html" failed (13: Permission denied), client: 203.0.113.10, server: lanterntea.example, request: "GET /reports/q3.html HTTP/1.1", host: "www.lanterntea.example"' },
          { command: 'ls -l /var/www/lanterntea/reports /var/www/lanterntea/downloads', output: '/var/www/lanterntea/downloads:\n-rw-r--r-- root    root       16 price-list.pdf\n\n/var/www/lanterntea/reports:\n-rw------- root    root       25 q3.html' },
        ],
      },
    ],
    exercises: [
      {
        id: 'srv06-publish', title: '上線一個靜態網站', machine: 'srv06-fresh',
        statement: `茶行的網站檔案已經放在 /var/www/lanterntea。請在 /etc/nginx/sites-available/lanterntea 寫一個 server 區塊：listen 80、server_name 是 ${SITE} 與 ${WWW}、根目錄 /var/www/lanterntea、index 是 index.html，並以 \`location / { try_files $uri $uri/ =404; }\` 服務檔案。接著用 sites-enabled 的符號連結啟用它，在不中斷服務的情況下套用。完成後 http://${WWW}/ 應該顯示「燈籠茶行」，http://${SITE}/about/ 顯示「關於我們」。`,
        checks: [
          { kind: 'link', path: '/etc/nginx/sites-enabled/lanterntea', target: '/etc/nginx/sites-available/lanterntea' },
          { kind: 'nginx', test: true, server: WWW, root: '/var/www/lanterntea', port: 80 },
          { kind: 'http', url: `http://${WWW}/`, status: 200, body: '燈籠茶行' },
          { kind: 'http', url: `http://${SITE}/about/`, status: 200, body: '關於我們' },
        ],
        solution: [
          tee('/etc/nginx/sites-available/lanterntea', LANTERNTEA_FRESH),
          'sudo ln -s /etc/nginx/sites-available/lanterntea /etc/nginx/sites-enabled/',
          'sudo nginx -t',
          'sudo systemctl reload nginx',
        ],
        mistakes: [
          { commands: [tee('/etc/nginx/sites-available/lanterntea', LANTERNTEA_FRESH.replace('root /var/www/lanterntea;', 'root /var/www/lanterntea')), 'sudo ln -s /etc/nginx/sites-available/lanterntea /etc/nginx/sites-enabled/', 'sudo systemctl reload nginx'],
            why: 'root 那行少了分號，又沒有先 `sudo nginx -t`：reload 失敗，nginx 繼續用舊設定（只有預設網站），茶行的網站沒有上線，而且要去 journal 才看得到原因。' },
          { commands: [tee('/etc/nginx/sites-available/lanterntea', LANTERNTEA_FRESH), 'sudo nginx -t', 'sudo systemctl reload nginx'],
            why: '忘了建立 sites-enabled 的連結：nginx.conf 只 include sites-enabled，sites-available 裡的檔案不會被讀到，nginx -t 通過只代表「目前啟用的」設定沒問題。' },
          { commands: [tee('/etc/nginx/sites-available/lanterntea', LANTERNTEA_FRESH), 'sudo ln -s /etc/nginx/sites-available/lanterntea /etc/nginx/sites-enabled/', 'sudo nginx -t'],
            why: '測試通過卻沒有 reload：執行中的 nginx 仍是啟動時的設定，請求還是由預設網站回應。' },
          { commands: [tee('/etc/nginx/sites-available/lanterntea', LANTERNTEA_FRESH.replace('root /var/www/lanterntea;', 'root /var/www/html;')), 'sudo ln -s /etc/nginx/sites-available/lanterntea /etc/nginx/sites-enabled/', 'sudo nginx -t', 'sudo systemctl reload nginx'],
            why: 'root 寫成預設網站的 /var/www/html：設定完全合法，nginx -t 也通過，但那個資料夾裡沒有 index.html（只有 index.nginx-debian.html），首頁變成 403，/about/ 是 404。' },
          { commands: [tee('/etc/nginx/sites-enabled/lanterntea', LANTERNTEA_FRESH), 'sudo nginx -t', 'sudo systemctl reload nginx'],
            why: '直接把檔案寫進 sites-enabled：網站雖然會動，但它不是連結，之後無法用刪除連結的方式停用，也違反 sites-available 保存設定、sites-enabled 只放連結的慣例。' },
        ],
        hints: ['printf 的 \\n 是換行；`printf \'…\' | sudo tee 檔案` 以 root 寫入。', '`sudo ln -s /etc/nginx/sites-available/lanterntea /etc/nginx/sites-enabled/` 建立連結。', '先 `sudo nginx -t`，通過了再 `sudo systemctl reload nginx`。'],
        explanation: `四個步驟各有作用：sites-available 保存設定；sites-enabled 的連結讓 nginx.conf 的 include 讀到它；nginx -t 在套用前抓出錯誤；reload 讓 master 換上新設定與新的 worker，舊的 worker 處理完手上的請求才結束，網站不中斷。用 sudo systemctl restart nginx 也會通過檢查，因為這次設定是對的；但 restart 會切斷所有連線，設定有錯時網站還會停擺，所以套用設定用 reload。檢查也確認 ${SITE}/about/ 有效：try_files 的 $uri/ 找到資料夾，再由 index 找到 about/index.html。`,
      },
      {
        id: 'srv06-images', title: '讓 /images/ 交給正確的 location', machine: 'srv06-live',
        statement: `茶行的圖片放在 /srv/media/images，由 /etc/nginx/snippets/lanterntea-images.conf 裡的 \`location /images/ { alias /srv/media/images/; }\` 負責（lanterntea 網站以 include 載入這個片段）。可是 http://${WWW}/images/logo.png 一直是 404。請修改這個片段，讓 /images/ 底下的請求一定由它處理，並在不中斷服務的情況下套用。樣式表 /css/site.css 仍要帶著 Cache-Control: max-age=604800，不能把那個正規表示式的 location 拿掉。`,
        checks: [
          { kind: 'nginx', test: true },
          { kind: 'http', url: `http://${WWW}/images/logo.png`, status: 200, body: 'PNG lantern logo' },
          { kind: 'http', url: `http://${WWW}/images/banner.jpg`, status: 200, body: 'JPEG winter banner' },
          { kind: 'http', url: `http://${WWW}/css/site.css`, status: 200, header: ['Cache-Control', 'max-age=604800'] },
        ],
        solution: [
          tee('/etc/nginx/snippets/lanterntea-images.conf', IMAGES_FIXED),
          'sudo nginx -t',
          'sudo systemctl reload nginx',
        ],
        mistakes: [
          { commands: [tee('/etc/nginx/snippets/lanterntea-images.conf', IMAGES_FIXED), 'sudo nginx -t'],
            why: '片段改對了，但沒有 reload：執行中的 nginx 仍用舊設定，/images/logo.png 還是被正規表示式搶走。' },
          { commands: [tee('/etc/nginx/sites-available/lanterntea', ORDER_MISTAKE), 'sudo nginx -t', 'sudo systemctl reload nginx'],
            why: '把 /images/ 搬到正規表示式前面沒有用：前綴之間只比長度，選出最長的前綴之後，nginx 仍會依序檢查正規表示式，而 logo.png 符合 \\.(css|js|png|jpg)$。' },
          { commands: [tee('/etc/nginx/snippets/lanterntea-images.conf', IMAGES_FIXED.replace('^~', '=')), 'sudo nginx -t', 'sudo systemctl reload nginx'],
            why: '`location = /images/` 只符合 URI 正好是 /images/ 的請求，/images/logo.png 不符合它，仍由正規表示式處理。' },
          { commands: [tee('/etc/nginx/snippets/lanterntea-images.conf', IMAGES_FIXED.replace('alias', 'root')), 'sudo nginx -t', 'sudo systemctl reload nginx'],
            why: 'location 選對了，但 alias 改成 root：root 會接上完整的 URI，nginx 去找 /srv/media/images/images/logo.png，結果還是 404。' },
        ],
        hints: ['先看 lanterntea.error.log：404 的那一行寫著 nginx 試著開的路徑，那是哪個 location 的 root？', '前綴的位置先後不影響結果；要讓 nginx 選了這個前綴之後不再檢查正規表示式，用 `^~`。'],
        explanation: '原本的 /images/ 是普通的前綴：它雖然是最長的前綴，nginx 仍會接著檢查正規表示式，~* \\.(css|js|png|jpg)$ 符合 logo.png，於是請求用 server 的 root 去找 /var/www/lanterntea/images/logo.png（error log 寫的就是這個路徑），得到 404。改成 location ^~ /images/ 之後，最長的前綴帶著 ^~，nginx 不再檢查正規表示式，alias 換出 /srv/media/images/logo.png。樣式表不在 /images/ 底下，照舊由正規表示式處理，Cache-Control 還在。改完先 nginx -t、再 reload。',
      },
      {
        id: 'srv06-handbook-403', title: '員工手冊的 403', machine: 'srv06-live',
        statement: `員工手冊 http://${DOCS}/ 回應 403。手冊的檔案在 /srv/handbook，屬於撰寫者 mei。請從 nginx 的錯誤日誌（/var/log/nginx/error.log）找出原因並修好，讓首頁與 /guide/setup.html 都能看到。/srv/handbook/drafts 是 mei 還沒公開的草稿，修好之後 /drafts/ 必須仍然是 403，也不要改動 drafts 底下的任何東西或手冊的擁有者。`,
        checks: [
          { kind: 'http', url: `http://${DOCS}/`, status: 200, body: '員工手冊' },
          { kind: 'http', url: `http://${DOCS}/guide/setup.html`, status: 200, body: '收銀機設定' },
          { kind: 'http', url: `http://${DOCS}/drafts/`, status: 403 },
          { kind: 'unchanged', path: '/srv/handbook/drafts' },
          { kind: 'owner', path: '/srv/handbook', owner: 'mei', group: 'mei' },
        ],
        solution: [
          `curl -s -o /dev/null -w '%{http_code}\\n' http://${DOCS}/`,
          'sudo tail -n 1 /var/log/nginx/error.log',
          'ls -ld /srv/handbook',
          'sudo chmod o+x /srv/handbook',
          `curl -s http://${DOCS}/`,
        ],
        mistakes: [
          { commands: ['sudo chmod -R 777 /srv/handbook'], why: '權限全開：首頁能看了，但草稿資料夾與檔案也變成任何人都能讀寫，/drafts/ 直接公開了年終獎金草案。' },
          { commands: ['sudo chown -R www-data:www-data /srv/handbook'], why: '把整個手冊交給 www-data：drafts 也屬於 www-data，nginx 讀得到草稿；mei 也失去了自己檔案的擁有權。' },
          { commands: ['sudo chmod 644 /srv/handbook/index.html'], why: 'index.html 本來就是 644，問題不在檔案，而在它所在的資料夾：/srv/handbook 是 750，其他人（www-data）沒有 x，進不去。' },
          { commands: ['sudo systemctl restart nginx'], why: '這不是設定的問題，重新啟動 nginx 不會改變檔案權限，403 依舊（還多中斷了一次服務）。' },
        ],
        hints: ['error log 裡的 (13: Permission denied) 是 www-data 讀不到；看看路徑上每一層的權限（`ls -ld`）。', '`sudo -u www-data cat /srv/handbook/index.html` 可以用 www-data 的身分試讀。', '要進入資料夾需要 x；只補上缺的那一個權限。'],
        explanation: `error log 寫著 open() "/srv/handbook/index.html" failed (13: Permission denied)。檔案本身是 644，但 /srv/handbook 是 750、屬於 mei:mei，www-data 既不是擁有者也不在 mei 群組，沒有 x 就進不了這個資料夾。sudo chmod o+x /srv/handbook 補上「其他人可以進入」（不給 r，所以 www-data 也不能列出目錄內容，對 nginx 已經足夠；chmod 751 或 755 也可以）。drafts 是 700，www-data 仍然進不去，所以 /drafts/ 保持 403。另一種做法是把 www-data 加進 mei 群組（sudo usermod -aG mei www-data），再 reload 讓新的 worker 取得新的群組。`,
      },
      {
        id: 'srv06-log-404', title: '從存取日誌找出 404 的網址', machine: 'srv06-live',
        statement: `店長想知道網站上有哪些壞掉的連結。請從 ${LOG_PATH} 印出所有回應 404 的請求路徑：每行一個路徑、同一個路徑只列一次、依 sort 的預設順序排列，不要印其他東西。檢查時，你的指令也會在另外兩天的日誌上重新執行，直接打出答案無法通過；先用 curl 測試網站的話，那些請求也會寫進日誌。`,
        checks: [{ kind: 'output' }],
        solution: [`sudo grep '" 404 ' ${LOG_PATH} | cut -d ' ' -f 7 | sort -u`],
        variants: [LOG_MONDAY, LOG_SALE],
        mistakes: [
          { commands: [`grep '" 404 ' ${LOG_PATH} | cut -d ' ' -f 7 | sort -u`], why: '日誌是 www-data:adm 0640，learner 讀不到，grep 只印出 Permission denied；要加 sudo。' },
          { commands: [`sudo grep 404 ${LOG_PATH} | cut -d ' ' -f 7 | sort -u`], why: '只找 404 這三個字元，也會符合位元組數 4040 這類欄位，/teas/ 明明是 200 卻被列進來；要比對狀態碼那一欄，例如 \'" 404 \'。' },
          { commands: [`sudo grep '" 404 ' ${LOG_PATH} | cut -d ' ' -f 7`], why: '沒有排序去重，/images/logo.png 這種被要了好幾次的路徑會重複出現。' },
          { commands: ['sudo cat /var/log/nginx/lanterntea.error.log'], why: 'try_files 找不到檔案時不寫錯誤日誌，404 的完整紀錄只在存取日誌裡。' },
        ],
        hints: ['combined 格式中，狀態碼前面是請求列結尾的引號：`" 404 `。', '以空格切欄時，路徑是第 7 欄（`cut -d \' \' -f 7`）。', '`sort -u` 排序並去掉重複的行。'],
        explanation: `grep '" 404 ' 只挑出狀態碼是 404 的行（引號是請求列的結尾，後面接狀態碼），cut 以空格切出第 7 欄的路徑，sort -u 排序並去重。原本的日誌得到 /.env、/images/logo.png、/menu.html、/wp-login.php：/images/logo.png 是 location 的問題（上一個練習），其他兩個是掃描程式在試探常見的漏洞，/menu.html 才是網站上真正壞掉的連結。另外兩天的日誌得到不同的清單，同一個指令都正確。`,
      },
    ],
  },
};
