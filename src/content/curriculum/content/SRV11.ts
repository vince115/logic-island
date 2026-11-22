import type { NetworkScene, NodeTable, ProtocolHeader } from '@/lib/network/model';
import type { TerminalFile, TerminalMachine, TerminalRemote, TerminalVariant } from '@/lib/terminal/lesson';
import type { LessonContent } from '../schema';

/*
 * SRV11 CDNs and edge caching (SRV-4, network-sequence). A terminal lesson on the edge profile (engine stage E18) beside
 * one network-protocol scene. The terminal part: choosing Cache-Control per resource (hashed assets public, max-age=1 year,
 * immutable; HTML no-cache; personal API responses private, no-store; shared data with s-maxage), validators (ETag,
 * Last-Modified) and 304; setting the headers in nginx with add_header and its inheritance (a location's own add_header
 * drops the server's X-Content-Type-Options); a CDN edge in front of the origin read through X-Cache and Age, the hit ratio
 * and the requests that reach the origin, with sleep moving the clock so entries expire; why an edge keeps missing
 * (Set-Cookie, private, Vary, query strings) and why proxy_ignore_headers Set-Cookie alone is dangerous; nginx's
 * proxy_cache on the origin and X-Cache-Status; cache busting with hashed file names (assets first, HTML last) instead of
 * purging, and when a purge is still needed. The network part: one asset fetched twice through the edge (a MISS that goes
 * to the origin, then a HIT ten minutes later with Age 600). The CDN, its purge API (deliberately generic and fictional),
 * the bookshop, its names (.example, RFC 2606) and addresses (RFC 5737) are made up. nginx is 1.24.0 as on Ubuntu 24.04.
 * Every transcript output was produced by replaying it on the engine.
 */

const dir = (path: string, owner = 'root', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'root', mode = 0o644, mtime?: string): TerminalFile => ({ path, kind: 'file', mode, owner, content, ...mtime ? { mtime } : {} });
const link = (path: string, target: string): TerminalFile => ({ path, kind: 'link', mode: 0o777, owner: 'root', target });
/** The command that writes text to a root-owned file: printf's format (newlines as \n, backslashes doubled) piped to sudo tee. */
const tee = (path: string, text: string) => `printf '${text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n')}' | sudo tee ${path} > /dev/null`;

const SITE = 'pinebooks.example';
const WWW = `www.${SITE}`;
const W = `http://${WWW}`;
const WEB_IP = '203.0.113.30';
const EDGE_IP = '198.51.100.40';
const API_IP = '198.51.100.80';
const SITE_PATH = '/etc/nginx/sites-available/pinebooks';
const PUBLIC = '/srv/pinebooks/public';
const TOKEN = 'pinebooks-demo-7f3k';

const OLD_CSS = 'body{font-family:sans-serif;color:#2b2b2b}\n.price{color:#1d6b3a}\n';
const NEW_CSS = 'body{font-family:sans-serif;color:#2b2b2b}\n.price{color:#c0392b}\n';
const JS = 'document.querySelector(".cart").hidden=false;\n';
/** The first 8 hex digits of each file's SHA-256, as the build names them. */
const OLD_NAME = 'app.20feb1ee.css', NEW_NAME = 'app.6ea0aa8e.css', JS_NAME = 'app.40a1952c.js';
const page = (css: string, title = '松果書店') => `<!doctype html>\n<html lang="zh-Hant">\n<head><meta charset="utf-8"><title>${title}</title>\n<link rel="stylesheet" href="/assets/${css}">\n<script src="/assets/${JS_NAME}" defer></script></head>\n<body><h1>${title}</h1></body>\n</html>\n`;
const STOCK = '{"updated":"2026-11-22T09:59:00Z","in_stock":128}\n';

const NOSNIFF = 'add_header X-Content-Type-Options nosniff;';
/** Every location is a file of its own in PARTS, included by the one server block. */
const PARTS = '/etc/nginx/pinebooks.d';
const SITE_MAIN = (cachePath: boolean) => `${cachePath ? 'proxy_cache_path /var/cache/nginx/api levels=1:2 keys_zone=api:10m max_size=200m inactive=10m use_temp_path=off;\n\n' : ''}server {
    listen 80 default_server;
    server_name ${WWW} ${SITE};
    root ${PUBLIC};
    index index.html;
    ${NOSNIFF}

    include ${PARTS}/*.conf;
}
`;
/** A location block with these directives (one per line). */
const block = (location: string, lines: string[]) => `location ${location} {\n${lines.map(l => `    ${l}\n`).join('')}}\n`;
const PAGES_BEFORE = block('/', ['try_files $uri $uri/ =404;']);
const ASSETS_BEFORE = block('/assets/', ['try_files $uri =404;']);
const API_BEFORE = block('/api/', ['proxy_pass http://127.0.0.1:3000;']);
const IMMUTABLE = 'public, max-age=31536000, immutable';
const pages = (cc = 'no-cache', nosniff = true) => block('/', ['try_files $uri $uri/ =404;', `add_header Cache-Control "${cc}";`, ...nosniff ? [NOSNIFF] : []]);
const assets = (lines = [`add_header Cache-Control "${IMMUTABLE}";`, NOSNIFF]) => block('/assets/', ['try_files $uri =404;', ...lines]);
const data = (sMaxage: number) => block('/data/', [`add_header Cache-Control "public, max-age=0, s-maxage=${sMaxage}";`, NOSNIFF]);
const API_LINES = ['proxy_pass http://127.0.0.1:3000;', 'proxy_cache api;', 'proxy_cache_valid 200 10s;', 'add_header X-Cache-Status $upstream_cache_status always;', NOSNIFF];
const api = (extra: string[] = []) => block('/api/', [...API_LINES.slice(0, 3), ...extra, ...API_LINES.slice(3)]);
const catalog = (lines: string[]) => block('= /api/catalog', ['proxy_pass http://127.0.0.1:3000;', ...lines]);
const conf = (name: string, text: string) => file(`${PARTS}/${name}`, text);

/** web-01's /etc/hosts: the public DNS sends www (a CNAME at the CDN) to the edge, as for every reader. */
const hosts = `127.0.0.1 localhost\n127.0.1.1 web-01\n${EDGE_IP} ${WWW} ${SITE}\n${EDGE_IP} edge-01\n${API_IP} cdn-api\n\n::1 localhost ip6-localhost ip6-loopback\nff02::1 ip6-allnodes\nff02::2 ip6-allrouters\n`;
const home = [dir('/home'), dir('/home/learner', 'learner')];
const ASSET_TIME = '2026-11-15 09:00:00';
const indexFile = (text: string, mtime: string) => file(`${PUBLIC}/index.html`, text, 'root', 0o644, mtime);
const INDEX = indexFile(page(OLD_NAME), '2026-11-20 08:30:00');
const publicFiles = (index: TerminalFile): TerminalFile[] => [dir('/srv'), dir('/srv/pinebooks'), dir(PUBLIC), index, dir(`${PUBLIC}/assets`),
  file(`${PUBLIC}/assets/${OLD_NAME}`, OLD_CSS, 'root', 0o644, ASSET_TIME), file(`${PUBLIC}/assets/${JS_NAME}`, JS, 'root', 0o644, ASSET_TIME)];
const nginxFiles = (cachePath: boolean, parts: TerminalFile[]): TerminalFile[] => [dir('/etc/nginx'), dir(PARTS), ...parts, dir('/etc/nginx/sites-available'), file(SITE_PATH, SITE_MAIN(cachePath)),
  dir('/etc/nginx/sites-enabled'), link('/etc/nginx/sites-enabled/pinebooks', SITE_PATH)];

const BOOKS = '{"books":[{"id":101,"title":"山徑地圖集"},{"id":102,"title":"海邊的書店"}]}\n';
const SID = 'sid=a81f2c; Path=/; HttpOnly';
/** The shop's API (node on 127.0.0.1:3000): the catalog sets a "recently viewed" cookie, the banner varies by language, the cart is personal. */
const app = { id: 'app', server: 'node', routes: [
  { path: '/api/catalog', body: BOOKS, type: 'application/json', headers: [['Cache-Control', 'public, max-age=60'], ['Set-Cookie', 'recent=fiction; Path=/']] as [string, string][] },
  { path: '/api/banner', body: '{"banner":"冬季書展 79 折"}\n', type: 'application/json', headers: [['Cache-Control', 'public, max-age=300'], ['Vary', 'Accept-Language']] as [string, string][] },
  { path: '/api/bestsellers', body: '{"top":[102,101]}\n', type: 'application/json' },
  { path: '/api/cart', body: '{"items":2}\n', type: 'application/json', headers: [['Cache-Control', 'private, no-store'], ['Set-Cookie', SID]] as [string, string][] },
  { path: '/api/*', status: 404, body: '{"error":"not found"}\n', type: 'application/json' },
] };

/** web-01 before the CDN: static files and the API, no caching headers at all (the server-level nosniff is the only add_header). */
const before: TerminalMachine = {
  id: 'srv11-before', title: 'web-01（還沒有快取標頭的來源伺服器）', user: 'learner', cwd: '/home/learner', host: 'web-01', profile: 'edge', nginx: true, address: WEB_IP,
  interfaces: [{ name: 'eth0', address: `${WEB_IP}/24` }],
  accounts: { users: [{ name: 'pinebooks', uid: 997, home: '/srv/pinebooks', shell: '/usr/sbin/nologin' }], groups: [{ name: 'sudo', members: ['learner'] }] },
  files: [...home, dir('/etc'), ...nginxFiles(false, [conf('api.conf', API_BEFORE), conf('assets.conf', ASSETS_BEFORE), conf('pages.conf', PAGES_BEFORE)]), ...publicFiles(INDEX)],
  processes: [{ pid: 940, user: 'pinebooks', command: 'node /srv/pinebooks/api/server.js', stat: 'Ssl', listen: [{ address: '127.0.0.1', port: 3000, fd: 18, http: 'app' }] }],
  responders: [app],
};

/** The headers web-01 sent with an asset when the edge stored it (after Date, Content-Type and Content-Length). */
const stored = (etag: string): [string, string][] => [['Last-Modified', 'Sun, 15 Nov 2026 09:00:00 GMT'], ['ETag', etag], ['Cache-Control', IMMUTABLE],
  ['X-Content-Type-Options', 'nosniff'], ['Accept-Ranges', 'bytes']];
/** The CDN's edge near the readers: it fetches from web-01 by address, keeps the Host, and stores nothing the origin does not allow. */
const edge: TerminalRemote = {
  host: 'edge-01', address: EDGE_IP, hostKey: 'srv11-edge-01', files: [], latency: 3,
  processes: [{ pid: 900, user: 'root', command: '/usr/local/bin/edged', stat: 'Ss', listen: [{ port: 80, fd: 5, http: 'edge' }] }],
  responders: [{ id: 'edge', cdn: { origin: WEB_IP }, routes: [] }],
  cdnCache: [{ responder: 'edge', entries: [
    { url: `${W}/assets/${OLD_NAME}`, body: OLD_CSS, type: 'text/css', headers: stored('"6af97490-41"'), cachedAt: '2026-11-15 09:05:00', ttl: 31536000 },
    { url: `${W}/assets/${JS_NAME}`, body: JS, type: 'application/javascript', headers: stored('"6af97490-2e"'), cachedAt: '2026-11-15 09:05:00', ttl: 31536000 },
  ] }],
};
/** The CDN's purge API: generic and fictional (real CDNs each have their own). */
const purgeApi: TerminalRemote = {
  host: 'cdn-api', address: API_IP, hostKey: 'srv11-cdn-api', files: [],
  processes: [{ pid: 920, user: 'root', command: '/usr/local/bin/cdn-apid', stat: 'Ss', listen: [{ port: 80, fd: 5, http: 'api' }] }],
  responders: [{ id: 'api', server: 'cdn-api', routes: [{ path: '/purge', methods: ['POST'], purge: { edges: ['edge-01'], token: TOKEN } }] }],
};
const RELEASE = '/home/learner/release';
const cdnParts = (sMaxage = 30) => [conf('api.conf', api()), conf('assets.conf', assets()), conf('data.conf', data(sMaxage)), conf('pages.conf', pages())];
/** web-01 a week behind the CDN: the headers set, a micro-cache for the API, the next build waiting in ~/release. */
const cdn: TerminalMachine = {
  ...before, id: 'srv11-cdn', title: 'web-01（放到 CDN 後面一週）',
  files: [...home, file('/home/learner/.cdn-token', `${TOKEN}\n`, 'learner', 0o600), dir(RELEASE, 'learner'), file(`${RELEASE}/index.html`, page(NEW_NAME), 'learner'), dir(`${RELEASE}/assets`, 'learner'),
    file(`${RELEASE}/assets/${NEW_NAME}`, NEW_CSS, 'learner'), file(`${RELEASE}/assets/${JS_NAME}`, JS, 'learner'),
    dir('/etc'), file('/etc/hosts', hosts), ...nginxFiles(true, cdnParts()), dir('/var'), dir('/var/cache'), dir('/var/cache/nginx'),
    ...publicFiles(INDEX), dir(`${PUBLIC}/data`), file(`${PUBLIC}/data/stock.json`, STOCK, 'root', 0o644, '2026-11-22 09:59:00')],
  remotes: [edge, purgeApi],
};

const reload = ['sudo nginx -t', 'sudo systemctl reload nginx'];
const PAGES_CONF = `${PARTS}/pages.conf`, ASSETS_CONF = `${PARTS}/assets.conf`, API_CONF = `${PARTS}/api.conf`, CATALOG_CONF = `${PARTS}/catalog.conf`;
const xcache = (url: string, extra = '') => `curl -s -o /dev/null -w '%header{x-cache}${extra}\\n' ${url}`;
const PURGE = (url: string) => `curl -s -X POST -H "Authorization: Bearer $(cat ~/.cdn-token)" http://cdn-api/purge -d "url=${url}"`;
const VISITS = (sleep: boolean, count = 'MISS') => `for t in 0 10 10 10 10 10; do ${sleep ? 'sleep $t; ' : ''}${xcache(`${W}/data/stock.json`)}; done | grep -c ${count}`;
const otherIndex = (label: string, title: string, mtime: string): TerminalVariant => ({ label, files: [indexFile(page(OLD_NAME, title), mtime)] });
const otherTtl = (sMaxage: number): TerminalVariant => ({ label: `data.conf 的 s-maxage 是 ${sMaxage} 秒`, files: [conf('data.conf', data(sMaxage))] });

// ---- network scene -----------------------------------------------------------------------------------------------
const READER_A = '192.0.2.15', READER_B = '192.0.2.88';
const ASSET = `/assets/${JS_NAME}`;
const KEY = `${WWW}${ASSET}`;
const ipv4 = (from: string, to: string): ProtocolHeader => ({ layer: 'network', protocol: 'IPv4', fields: [{ name: '來源 IP', value: from }, { name: '目的 IP', value: to }] });
const tcp = (from: string, to: string): ProtocolHeader => ({ layer: 'transport', protocol: 'TCP', fields: [{ name: '來源連接埠', value: from }, { name: '目的連接埠', value: to }, { name: '旗標', value: 'PSH, ACK' }] });
const http = (fields: [string, string][]): ProtocolHeader => ({ layer: 'application', protocol: 'HTTP/1.1', fields: fields.map(([name, value]) => ({ name, value })) });
const request = (extra: [string, string][] = []) => http([['方法', 'GET'], ['路徑', ASSET], ['Host', WWW], ...extra]);
const ORIGIN_HEADERS: [string, string][] = [['Date', 'Sun, 22 Nov 2026 10:00:00 GMT'], ['Content-Type', 'application/javascript'], ['Content-Length', '46'], ['Last-Modified', 'Sun, 15 Nov 2026 09:00:00 GMT'],
  ['ETag', '"6af97490-2e"'], ['Cache-Control', IMMUTABLE]];
const response = (extra: [string, string][]) => http([['狀態碼', '200'], ...ORIGIN_HEADERS, ...extra]);
const CACHE_TABLE = '邊緣節點的快取';
const cacheTable = (hits: string, changed: number[]): NodeTable => ({ node: 'edge', name: CACHE_TABLE, head: ['快取鍵', '存入時間', '新鮮期限', '命中次數'],
  rows: [[KEY, '10:00:00', '31536000 秒（一年）', hits]], changed });
const ORIGIN_LOG = '來源收到的請求';
const originLog = (changed: number[]): NodeTable => ({ node: 'origin', name: ORIGIN_LOG, head: ['時間', '來源', '請求'], rows: [['10:00:00', EDGE_IP, `GET ${ASSET}`]], changed });

/** Section 3: the same asset fetched twice through the edge: a MISS that goes to web-01, then a HIT ten minutes later. */
const edgePath: NetworkScene = {
  id: 'srv11-edge-path', title: '同一個檔案經過 CDN 兩次：第一次 MISS 回源，第二次 HIT', model: 'tcp-ip',
  description: `讀者 A（${READER_A}）在 10:00:00 打開松果書店，瀏覽器要下載 ${ASSET}。公開 DNS 把 ${WWW} 指向 CDN 的邊緣節點 edge-01（${EDGE_IP}），所以請求先到邊緣節點；它的快取裡還沒有這個檔案，於是向來源 web-01（${WEB_IP}）要。十分鐘後讀者 B（${READER_B}）要同一個檔案，這次邊緣節點直接回答，web-01 完全不知道。表格是邊緣節點的快取與 web-01 收到的請求。為了專注在快取，TCP 與 HTTP 的連線建立省略不畫，每一則訊息只畫出和快取有關的標頭。`,
  nodes: [
    { id: 'reader-a', label: '讀者 A 的瀏覽器', kind: 'host', addresses: [`IP ${READER_A}`] },
    { id: 'edge', label: 'CDN 邊緣節點 edge-01', kind: 'server', addresses: [`IP ${EDGE_IP}`, 'TCP 80'] },
    { id: 'origin', label: '來源伺服器 web-01（nginx）', kind: 'server', addresses: [`IP ${WEB_IP}`, 'TCP 80'] },
    { id: 'reader-b', label: '讀者 B 的瀏覽器', kind: 'host', addresses: [`IP ${READER_B}`] },
  ],
  messages: [
    { id: 'a-request', from: 'reader-a', to: 'edge', label: `GET ${ASSET}（10:00:00）`,
      headers: [request(), tcp('51022', '80'), ipv4(READER_A, EDGE_IP)],
      payload: `GET ${ASSET} HTTP/1.1\nHost: ${WWW}\nAccept: */*`,
      note: `讀者以為自己連的是書店，實際上連到的是 CDN 的邊緣節點：網站的 DNS 記錄指向 CDN，CDN 再讓讀者連到離他近的節點。邊緣節點用「Host 加路徑（含查詢字串）」當快取鍵，也就是 ${KEY}，在自己的快取裡找不到，這是一次 MISS。` },
    { id: 'edge-fetch', from: 'edge', to: 'origin', label: '回源：向 web-01 要同一個檔案',
      headers: [request([['X-Forwarded-For', READER_A]]), tcp('40112', '80'), ipv4(EDGE_IP, WEB_IP)],
      payload: `GET ${ASSET} HTTP/1.1\nHost: ${WWW}\nX-Forwarded-For: ${READER_A}\nAccept: */*`,
      note: '邊緣節點以自己的位址開一條新的連線到來源（回源），把原本的 Host 帶過去，讓 web-01 的 nginx 選對 server；讀者的位址放在 X-Forwarded-For。從 web-01 的角度，這個請求來自 198.51.100.40，不是讀者。',
      tables: [originLog([0])] },
    { id: 'origin-response', from: 'origin', to: 'edge', label: '200 OK，可以存一年',
      headers: [response([['X-Content-Type-Options', 'nosniff']]), tcp('80', '40112'), ipv4(WEB_IP, EDGE_IP)],
      payload: `HTTP/1.1 200 OK\n${ORIGIN_HEADERS.map(([n, v]) => `${n}: ${v}`).join('\n')}\nX-Content-Type-Options: nosniff\n\n（46 位元組的 JavaScript）`,
      note: '來源的 Cache-Control 決定邊緣節點能不能存、存多久：public 表示共用的快取也可以存，max-age=31536000 是一年，immutable 表示這一年內內容不會變。回應沒有 Set-Cookie、不是 private 或 no-store，所以邊緣節點把它連同標頭一起存進快取，新鮮期限是一年。',
      tables: [cacheTable('0', [0])] },
    { id: 'a-response', from: 'edge', to: 'reader-a', label: '200 OK（X-Cache: MISS）',
      headers: [response([['Age', '0'], ['X-Cache', 'MISS']]), tcp('80', '51022'), ipv4(EDGE_IP, READER_A)],
      payload: `HTTP/1.1 200 OK\n${ORIGIN_HEADERS.map(([n, v]) => `${n}: ${v}`).join('\n')}\nAge: 0\nX-Cache: MISS\n\n（46 位元組的 JavaScript）`,
      note: '邊緣節點把來源的回應交給讀者 A，再加上兩個標頭：Age: 0（這份副本剛從來源拿到）與 X-Cache: MISS（這一次是回源取得的）。X-Cache 不是標準標頭，各家 CDN 的名稱與值不同；Age 是 HTTP 快取規範（RFC 9111）定義的標準標頭。讀者 A 的瀏覽器也依 max-age 把它存一年。' },
    { id: 'b-request', from: 'reader-b', to: 'edge', label: `GET ${ASSET}（10:10:00）`,
      headers: [request(), tcp('60415', '80'), ipv4(READER_B, EDGE_IP)],
      payload: `GET ${ASSET} HTTP/1.1\nHost: ${WWW}\nAccept: */*`,
      note: `十分鐘後，讀者 B 打開同一個頁面。快取鍵同樣是 ${KEY}，邊緣節點找到這份副本：它存了 600 秒，遠小於一年的新鮮期限，所以可以直接使用，不必問來源。` },
    { id: 'b-response', from: 'edge', to: 'reader-b', label: '200 OK（X-Cache: HIT）',
      headers: [response([['Age', '600'], ['X-Cache', 'HIT']]), tcp('80', '60415'), ipv4(EDGE_IP, READER_B)],
      payload: `HTTP/1.1 200 OK\n${ORIGIN_HEADERS.map(([n, v]) => `${n}: ${v}`).join('\n')}\nAge: 600\nX-Cache: HIT\n\n（46 位元組的 JavaScript）`,
      note: '邊緣節點從快取回答：Date 仍是來源在 10:00:00 產生回應的時間，Age 是 600，表示這份副本已經在快取裡待了 600 秒；X-Cache: HIT。web-01 收到的請求仍然只有一個。兩位讀者、兩個請求、一次回源，這個檔案的命中率是 50%；讀者越多，同一份副本被用的次數越多，來源的負擔就越接近零。',
      tables: [cacheTable('1', [0]), originLog([])] },
  ],
};

export const SRV11: LessonContent = {
  lessonId: 'SRV11',
  motivation: `松果書店的網站只有一台來源伺服器 web-01：nginx 直接送出首頁、CSS、JavaScript 與庫存快照，/api/ 交給同一台機器上的 node 程式。冬季書展一開跑，同時上線的讀者暴增，其中絕大多數請求要的是一模一樣的檔案，web-01 卻得一個一個重新送出，頻寬與 CPU 很快就滿了，遠方的讀者還得多等好幾個來回。CDN（內容傳遞網路）把網站的副本放在靠近讀者的邊緣節點上，大部分請求在那裡就得到回答，不必回到來源。但 CDN 只會照來源的 HTTP 標頭行事：沒有 Cache-Control 時它只能猜，回應帶著 Set-Cookie 時它不敢存，把一年不變的 CSS 直接覆蓋掉，讀者就會拿著舊樣式整整一年。這一課先替每一種資源選對 Cache-Control 並在 nginx 設好，接著從 X-Cache 與 Age 讀出命中率、算出有多少請求回到來源，找出邊緣節點一直 MISS 的原因，認識來源端 nginx 的 proxy_cache，最後用檔名版本化讓每次部署都安全，只在真正需要時才清除快取。`,
  sections: [
    {
      id: 'srv11-s-policy', title: '為每一種資源選 Cache-Control',
      blocks: [
        { type: 'p', text: 'HTTP 的快取規則寫在 RFC 9111。一份回應可能被兩種快取存下來：私有快取（private cache），也就是讀者自己的瀏覽器，只給一個人用；共用快取（shared cache），例如 CDN 的邊緣節點、公司的代理伺服器或來源前面的 nginx，存下的副本會交給很多人。來源用 Cache-Control 標頭告訴它們能不能存、存多久、過期之後怎麼辦。最常用的指令：' },
        { type: 'table', head: ['指令', '意思'], rows: [
          ['`max-age=N`', '這份回應在產生後 N 秒內是新鮮的（fresh），快取可以直接拿來用；超過就是過期（stale）'],
          ['`s-maxage=N`', '只給共用快取看的 max-age，優先於 max-age；瀏覽器忽略它'],
          ['`public`', '共用快取也可以存（即使請求帶著 Authorization 之類通常不能存的情況）'],
          ['`private`', '只有瀏覽器可以存，CDN 與代理不可以'],
          ['`no-cache`', '可以存，但每次使用前都要先向來源驗證（不是「不要快取」）'],
          ['`no-store`', '任何快取都不准存，每次都完整地向來源要'],
          ['`immutable`', '新鮮期間內內容絕對不會變，瀏覽器在使用者按重新整理時也不必再驗證（RFC 8246）'],
        ] },
        { type: 'p', text: '選哪一種，取決於「這個網址的內容會不會變」與「每個人看到的是不是同一份」。松果書店的資源可以分成五類：' },
        { type: 'table', head: ['資源', '例子', 'Cache-Control', '理由'], rows: [
          ['檔名含內容雜湊的靜態檔', '/assets/app.40a1952c.js、app.20feb1ee.css', '`public, max-age=31536000, immutable`', '內容一改，檔名就跟著改；同一個網址的內容永遠不變，可以放心存一年'],
          ['HTML 頁面', '/、/index.html', '`no-cache`（或很短的 max-age）', 'HTML 是指向各個資源的「目錄」，網址固定、內容隨部署改變；要讓讀者很快看到新版本，又能用 304 省下傳輸'],
          ['大家都一樣、可以晚一點更新的資料', '/data/stock.json（每分鐘產生的庫存快照）', '`public, max-age=0, s-maxage=30`', '瀏覽器每次都問，但 CDN 可以替大家擋 30 秒'],
          ['公開的 API', '/api/catalog（書目）', '`public, max-age=60`', '每個人得到相同的內容，短時間的快取就能吸收大量重複請求'],
          ['個人化的回應', '/api/cart（購物車）、帳號頁', '`private, no-store`（或至少 private）', '內容屬於某一個人，絕不能讓 CDN 把甲的購物車交給乙'],
        ] },
        { type: 'callout', tone: 'warning', title: '常見誤解：no-cache 就是「不要快取」', text: 'no-cache 的意思是「可以存，但用之前一定要先問過來源」：瀏覽器帶著 If-None-Match 或 If-Modified-Since 去問，內容沒變時來源只回一個沒有本文的 304，副本繼續使用。真正「不准存」的是 no-store。把 HTML 設成 no-store，每次瀏覽都要重新下載整份頁面，也失去了 304 的好處；把購物車設成 no-cache，則仍可能被存下來。兩者的用途不同，不要互相替代。' },
        { type: 'p', text: '過期不等於重新下載。來源在回應裡附上驗證器（validator）：Last-Modified 是檔案最後修改的時間，ETag 是代表這個版本的一串標記（nginx 的靜態檔是「修改時間的十六進位－大小的十六進位」，例如 "6af97490-2e"）。快取的副本過期或標示 no-cache 時，用條件式請求問來源：If-None-Match 帶 ETag、If-Modified-Since 帶 Last-Modified；內容沒變就是 304 Not Modified，只有標頭沒有本文。下面的紀錄在還沒放上 CDN 的 web-01 上觀察：' },
        { type: 'example', id: 'srv11-validators' },
        { type: 'p', text: '注意第一筆回應：有 Last-Modified 與 ETag，卻沒有任何 Cache-Control。這時快取可以自己估一個新鮮時間（RFC 9111 稱為 heuristic freshness，常見的做法是「距離 Last-Modified 的時間的 10%」），每個瀏覽器與 CDN 估法不同，結果無法預測。所以每一種資源都應該明確寫出 Cache-Control，不要留給快取猜。購物車的 API 則已經由應用程式送出 `private, no-store`，這類決定通常交給最了解資料的應用程式。' },
      ],
    },
    {
      id: 'srv11-s-nginx', title: '在 nginx 替不同的 location 設定標頭',
      blocks: [
        { type: 'p', text: 'web-01 的網站設定只有一個 server 區塊，每個 location 放在 /etc/nginx/pinebooks.d/ 的一個檔案裡，由 `include /etc/nginx/pinebooks.d/*.conf;` 載入：pages.conf 是 location /（首頁與其他頁面）、assets.conf 是 /assets/、api.conf 把 /api/ 交給 127.0.0.1:3000。server 層有一行 `add_header X-Content-Type-Options nosniff;`，要求瀏覽器不要猜測檔案的類型。替 location 加上 Cache-Control 最直接的寫法是 add_header：' },
        { type: 'table', head: ['檔案', '加上的設定', '結果'], rows: [
          ['assets.conf（location /assets/）', '`add_header Cache-Control "public, max-age=31536000, immutable";`', '每個靜態資源可以存一年'],
          ['pages.conf（location /）', '`add_header Cache-Control "no-cache";`', '首頁每次都要驗證，靠 ETag 得到 304'],
          ['data.conf（location /data/）', '`add_header Cache-Control "public, max-age=0, s-maxage=30";`', '瀏覽器每次都問，CDN 存 30 秒'],
          ['api.conf（location /api/）', '不加，交給應用程式', '應用程式自己送出 public, max-age=60 或 private, no-store'],
        ] },
        { type: 'p', text: '另一個寫法是 expires：`expires 1y;` 會產生 Expires 標頭與 `Cache-Control: max-age=31536000`，`expires max;` 是 max-age=315360000（十年）。它們只能表達時間，加不上 public 或 immutable；再用 add_header 補一行，回應就會有兩個 Cache-Control 標頭。HTTP 允許把多個同名標頭當成以逗號串起的一個清單，但讀起來容易混淆，本課直接用 add_header 寫出完整的值。add_header 預設只加在 200、201、204、206、301、302、303、304、307、308 這些狀態，加上 `always` 才會出現在 404 或 502 上。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：在 location 加一行 add_header，server 層的標頭還在', text: 'add_header 的繼承是「全有或全無」：某一層只要寫了自己的 add_header，就完全不繼承上一層的任何 add_header。在 location /assets/ 加上 Cache-Control 之後，server 層的 X-Content-Type-Options: nosniff 就從所有靜態資源上消失了，而且 nginx -t 不會有任何警告。要兩個都有，就在那個 location 裡把 nosniff 再寫一次（或把共用的標頭放進一個片段，在每個 location include）。改完之後用 curl -sI 實際看一次回應的標頭，比讀設定可靠。' },
        { type: 'p', text: 's-maxage 讓你分開控制瀏覽器與 CDN。例如 HTML 也可以寫成 `public, max-age=0, s-maxage=60`：瀏覽器每次都向 CDN 確認，CDN 則替所有人擋 60 秒，來源每分鐘最多收到一次請求；代價是部署之後，最多要 60 秒讀者才會看到新頁面（或在部署時清除這幾個 HTML 網址）。哪一種比較好，取決於流量與「新版本多快要讓人看到」。' },
      ],
    },
    {
      id: 'srv11-s-cdn', title: 'CDN 如何減輕來源的負擔：命中率、X-Cache 與 Age',
      blocks: [
        { type: 'p', text: '網站放上 CDN 之後，網站名稱在 DNS 裡通常是一筆指向 CDN 的 CNAME，CDN 再讓每位讀者連到離他近的邊緣節點（edge）。邊緣節點用快取鍵（通常是 Host 加上路徑與查詢字串）找副本：找到而且還新鮮，就是命中（HIT），直接回答；找不到或已過期，就是未命中（MISS），由邊緣節點向來源伺服器（origin）要一份，這叫回源。所以來源收到的請求數，就是所有邊緣節點 MISS 的次數。' },
        { type: 'table', head: ['名詞或標頭', '意思'], rows: [
          ['快取命中率（hit ratio）', 'HIT ÷（HIT ＋ MISS）。95% 表示每 20 個請求只有 1 個回到來源，來源的負擔是沒有 CDN 時的二十分之一'],
          ['`X-Cache: HIT` / `MISS`', '這一次是不是從快取回答。不是標準標頭，各家 CDN 的名稱與值不同（本課的模擬 CDN 用 X-Cache）'],
          ['`Age: N`', '標準標頭（RFC 9111）：這份回應從來源產生或驗證之後，已經在快取裡待了幾秒；HIT 時通常大於 0'],
          ['`Date`', '來源產生回應的時間；CDN 保留來源的值，所以 HIT 的 Date 可能是好幾天前'],
        ] },
        { type: 'p', text: '一個新鮮期限是 T 秒的網址，在一個邊緣節點上最多每 T 秒回源一次，不管這段時間有多少讀者。這就是 CDN 減輕來源負擔的方式：讀者越多、T 越長，命中率越高。web-01 放到 CDN 後面一週了，Cache-Control 都已經依上一節設好。下面從 web-01 自己經由 CDN 連到網站（它的 /etc/hosts 和公開 DNS 一樣，把 www.pinebooks.example 指向 edge-01），再用 sleep 讓模擬的時鐘前進，觀察庫存快照的 HIT、MISS 與 Age：' },
        { type: 'example', id: 'srv11-edge' },
        { type: 'p', text: 'JavaScript 檔在一週前就被存進邊緣節點，Age 是 608100 秒（約七天），Date 也是一週前的時間。首頁是 no-cache，本課的邊緣節點不存它，每次都 MISS（有些 CDN 會存 no-cache 的回應、每次以條件式請求向來源驗證）。庫存快照的 s-maxage 是 30：第 0 秒 MISS 並存下來，第 10、20 秒 HIT，Age 一路增加；第 30 秒這份副本已經存了 30 秒、不再新鮮，所以又 MISS 一次。六個請求只有兩個回到 web-01，存取日誌也正好兩行，命中率約 67%。下面的情境把一次 MISS 與一次 HIT 分別走過的路畫出來：' },
        { type: 'example', id: 'srv11-edge-path' },
        { type: 'callout', tone: 'note', title: '模擬環境裡的 CDN', text: '本課的 CDN、邊緣節點 edge-01、清除 API 與書店都是虛構的，只有一個邊緣節點；真實的 CDN 在世界各地有很多節點，每個節點的快取各自從 MISS 開始。時鐘從 2026-11-22 10:00 UTC 開始，只有 sleep 會讓它前進（課程的每一台機器一起）。邊緣節點依來源的 Cache-Control 決定存不存（private、no-store、no-cache 與帶 Set-Cookie 的回應不存，s-maxage 優先），來源沒說時不存；它保留來源的 Date，加上 Age 與 X-Cache。為了專注在快取，全程使用 http；實務上讀者到 CDN、CDN 到來源都應該是 HTTPS。' },
      ],
    },
    {
      id: 'srv11-s-miss', title: '為什麼一直 MISS：Set-Cookie、private、Vary 與查詢字串',
      blocks: [
        { type: 'p', text: '命中率低的時候，先找出哪些網址一直 MISS，再看它們的回應標頭與網址。常見的原因：' },
        { type: 'table', head: ['原因', '在回應或請求上看到的', '怎麼處理'], rows: [
          ['來源不准存', '`Cache-Control: private`、`no-store`，或什麼都沒寫（CDN 的預設是不存）', '公開的內容明確寫出 public 與 max-age／s-maxage；個人化的內容本來就不該存'],
          ['回應帶著 Set-Cookie', '`Set-Cookie: …`', 'nginx 與多數 CDN 預設不存帶 Set-Cookie 的回應（否則會把一個人的 cookie 送給所有人）；讓公開的網址不要設定 cookie'],
          ['Vary 把快取分成很多份', '`Vary: Accept-Language`、`Vary: User-Agent`、`Vary: Cookie`', 'Vary 列出的請求標頭不同，就是不同的副本。依語言分幾份沒問題；依 User-Agent 或 Cookie 幾乎每個人一份，等於沒有快取'],
          ['查詢字串讓快取鍵不同', '`?utm_source=newsletter`、`?t=1732269600`', '快取鍵包含查詢字串，每一種寫法各 MISS 一次；行銷參數可以在 CDN 設定成不放進快取鍵'],
          ['新鮮期限太短', '`max-age=5`、s-maxage 很小', '依「多久之後一定要看到新內容」設定，不必保守到每幾秒就回源'],
        ] },
        { type: 'p', text: '下面的紀錄經由 CDN 檢查幾個 API 與一個帶查詢字串的網址。書目 /api/catalog 明明寫著 public, max-age=60：' },
        { type: 'example', id: 'srv11-miss' },
        { type: 'p', text: '書目的回應帶著 `Set-Cookie: recent=fiction`：開發者讓書目 API 記住讀者最近看的分類，結果這個人人相同的回應再也不能被快取，每個請求都回到 web-01。購物車是 private, no-store，MISS 是正確的。banner 依 Accept-Language 分成中文與英文兩份，各自 MISS 一次之後就會命中。同一支 JavaScript 加上不同的 utm_source，每一種都是新的快取鍵。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：proxy_ignore_headers Set-Cookie 就能讓回應被快取', text: '在 nginx 的 location 加上 `proxy_ignore_headers Set-Cookie;`，nginx 的快取確實會開始存這個回應，但它存下的是包含 Set-Cookie 的整份回應，之後每個讀者都會收到同一個 cookie。如果那是登入用的 session，等於把一個人的登入狀態送給所有人。而且 CDN 仍然看到 Set-Cookie，照樣不存。正確的做法是讓公開的網址不要設定 cookie（例如把「最近看過的分類」改由瀏覽器自己記住），或至少在那個 location 用 `proxy_hide_header Set-Cookie;` 把它拿掉，並確認需要 cookie 的網址（登入、購物車）不受影響。' },
      ],
    },
    {
      id: 'srv11-s-origin', title: '來源端的 nginx proxy_cache 與 X-Cache-Status',
      blocks: [
        { type: 'p', text: 'CDN 擋住大部分的重複請求，但每個邊緣節點、每個過期的時刻仍會回源；API 背後的程式或資料庫如果很慢，來源自己的 nginx 也可以再加一層快取（常稱為 micro-cache）。web-01 的設定在 http 層宣告快取的位置與大小，在 /api/ 開啟它：' },
        { type: 'table', head: ['設定', '意思'], rows: [
          ['`proxy_cache_path /var/cache/nginx/api levels=1:2 keys_zone=api:10m max_size=200m inactive=10m;`', 'http 層：快取檔放在哪裡、分兩層子資料夾、名為 api 的共用記憶體區（10 MB，存放鍵與中繼資料）、快取檔最多 200 MB、10 分鐘沒被用到就刪除'],
          ['`proxy_cache api;`', '這個 location 使用 api 這塊快取'],
          ['`proxy_cache_valid 200 10s;`', '後端沒有寫 Cache-Control 或 Expires 時，200 的回應存 10 秒；後端寫了就照後端的'],
          ['`add_header X-Cache-Status $upstream_cache_status always;`', '把這次的快取狀態放進回應，方便觀察'],
        ] },
        { type: 'p', text: 'nginx 判斷能不能存的順序和 CDN 相同：先看後端的 Cache-Control（private、no-store、no-cache 不存，s-maxage 優先於 max-age），再看 Expires，最後才是 proxy_cache_valid；帶 Set-Cookie 的回應不存。$upstream_cache_status 的值：' },
        { type: 'table', head: ['值', '意思'], rows: [
          ['MISS', '快取裡沒有（或這個回應不能存），向後端要'],
          ['HIT', '從快取回答，沒有連後端'],
          ['EXPIRED', '有副本但過期了，向後端要了一份新的並存下來'],
          ['BYPASS', '`proxy_cache_bypass` 的條件成立，這次直接問後端'],
          ['STALE', '後端失敗或正在更新，依 `proxy_cache_use_stale` 回了過期的副本'],
          ['UPDATING', '背景更新進行中，先用過期的副本回答'],
          ['REVALIDATED', '`proxy_cache_revalidate on` 帶著驗證器問後端，得到 304，副本繼續使用'],
        ] },
        { type: 'example', id: 'srv11-proxy-cache' },
        { type: 'p', text: '/api/bestsellers 沒有 Cache-Control，所以照 proxy_cache_valid 存 10 秒：MISS、HIT，11 秒後 EXPIRED。書目帶著 Set-Cookie、購物車是 private, no-store，兩者都是 MISS，快取資料夾裡也只有暢銷榜一個檔案。開源版的 nginx 沒有清除快取的指令，做法是刪掉快取檔；注意 `sudo rm -rf /var/cache/nginx/api/*` 的星號由你自己的 Shell 展開，而一般使用者讀不到 www-data 的 0700 資料夾，結果什麼都沒刪，要讓 root 的 Shell 來展開：`sudo bash -c \'rm -rf /var/cache/nginx/api/*\'`。' },
        { type: 'p', text: '兩層快取同時存在時，要分清楚是哪一層在回答。經由 CDN 拿到 HIT 的回應，X-Cache-Status 是那份副本當初從來源拿到時的值（例如 MISS），和這一次無關：先看 X-Cache 與 Age，X-Cache 是 MISS 時，X-Cache-Status 才描述這次的回源。上一節的 banner 第二次是 `X-Cache: HIT`，帶著的 X-Cache-Status 卻是 MISS，就是這個原因。' },
      ],
    },
    {
      id: 'srv11-s-versioning', title: '檔名版本化與快取清除',
      blocks: [
        { type: 'p', text: 'immutable 加上一年的 max-age 讓靜態資源幾乎不必再回源，前提是「同一個網址的內容永遠不變」。做法是靜態資源版本化（cache busting）：建置工具把內容的雜湊放進檔名（app.css 變成 app.40a1952c.js 這類名字），內容一改，雜湊與網址就跟著改。新的 HTML 引用新的網址，CDN 與瀏覽器對新網址一定是 MISS，於是立刻拿到新檔；舊的副本留在快取裡也無妨，因為已經沒有新頁面引用它。HTML 本身是 no-cache 或很短的 max-age，只有它需要「很快更新」。' },
        { type: 'list', ordered: true, items: [
          '先上傳新的靜態資源（新檔名，不覆蓋任何舊檔）：此時還沒有頁面引用它們，上傳到一半也不會出錯。',
          '最後才換 HTML：讀者一拿到新的 HTML，它引用的檔案都已經在來源上。順序反過來，HTML 會先指向還不存在的檔案，讀者拿到 404，有些 CDN 還會把這個 404 暫時存起來。',
          '舊的資源保留一段時間：還開著舊頁面的讀者、存在瀏覽器裡的舊 HTML，仍會要舊的檔名。',
        ] },
        { type: 'p', text: '如果不版本化，直接把新內容覆蓋到同一個檔名，會發生什麼事？設計師把價格改成紅色，新的建置在 ~/release/；下面的紀錄故意用錯誤的方式部署，再用 CDN 的清除 API 補救：' },
        { type: 'example', id: 'srv11-purge' },
        { type: 'p', text: '覆蓋之後，來源已經是紅色，邊緣節點卻還是綠色：它手上的副本還有將近一年的新鮮期限，沒有理由回源。清除（purge）讓邊緣節點忘掉這個網址，下一個請求 MISS，拿到紅色。本課的清除 API 是虛構的通用範例：POST 一個網址、用 Bearer 權杖驗證身分（權杖放在 0600 的檔案，用 `$(cat …)` 讀出，不寫在指令裡），回覆清除了幾筆；真實的 CDN 各有自己的 API 與參數，但概念相同。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：清除 CDN 之後，讀者就會看到新檔案', text: '清除只影響 CDN 的邊緣節點。讀者 A 的瀏覽器在上週已經依 `max-age=31536000, immutable` 存下這個 CSS，接下來一年它不會再問任何人，清除 CDN 對它毫無作用；公司的代理伺服器、其他中間的快取也一樣。何況檔名裡的雜湊（20feb1ee）已經和內容對不上。對一年不變的網址，唯一可靠的更新方式是換一個新網址。' },
        { type: 'p', text: '那什麼時候需要清除？當內容已經以「不能換網址」的形式送出，而且錯誤必須馬上消失：例如用 s-maxage 快取的 HTML 或 API 出現錯誤的價格、不小心公開了不該公開的檔案、依法必須下架的內容。這些情況清除是正確的工具，同時要記得它通知所有節點需要時間，也管不到瀏覽器。反過來，如果每次部署都要清除才會正確，就是一個警訊：表示資源沒有版本化，正確性依賴「清除有沒有及時、完整地生效」；清除全部的快取還會讓命中率瞬間掉到零，所有讀者同時回源，來源可能在部署的那一刻被壓垮。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  network: {
    scenes: [edgePath],
    exercises: [
      { id: 'srv11-net-age', task: 'field', scene: 'srv11-edge-path', message: 'b-response', layer: 'application', field: 'Age', title: '第二次回應的 Age',
        statement: '在「同一個檔案經過 CDN 兩次」情境中，邊緣節點回答讀者 B 的那則訊息（200 OK，X-Cache: HIT），HTTP 標頭裡的 Age 是多少？',
        hints: ['Age 量的是什麼：這份副本從來源產生之後，在快取裡待了多久？', '邊緣節點在 10:00:00 從來源拿到副本，讀者 B 在 10:10:00 要求。'],
        explanation: 'Age 是這份回應從來源產生（10:00:00）到現在（10:10:00）在快取裡經過的秒數，也就是 600。Date 仍是來源的 10:00:00，所以 Date 加上 Age 才是現在的時間。新鮮期限是 max-age 的 31536000 秒，Age 還遠小於它，因此可以直接使用。',
        mistakes: [
          { answer: { value: '0' }, why: 'Age: 0 是第一次（MISS）的回應：副本剛從來源拿到。第二次的副本已經存了十分鐘。' },
          { answer: { value: '31536000' }, why: '31536000 是 max-age，也就是副本可以保持新鮮多久；Age 是它已經存了多久。' },
          { answer: { value: '10' }, why: 'Age 的單位是秒，不是分鐘：十分鐘是 600 秒。' },
        ] },
      { id: 'srv11-net-origin', task: 'table', scene: 'srv11-edge-path', message: 'b-response', node: 'edge', table: CACHE_TABLE, row: KEY, column: '命中次數', title: '兩位讀者之後的命中次數',
        statement: `同一個情境的最後一步（邊緣節點回答讀者 B）之後，邊緣節點的快取中 ${KEY} 那一列的「命中次數」是多少？`,
        hints: ['只有從快取直接回答的請求才算命中；回源取得的那一次是 MISS。', '讀者 A 與讀者 B 各送了一個請求，各是 HIT 還是 MISS？'],
        explanation: '讀者 A 的請求是 MISS：邊緣節點回源取得副本並存下來，那一次不算命中。讀者 B 的請求從快取回答，是第一次命中，所以是 1。兩個請求、一次回源，這個網址目前的命中率是 1 ÷ 2 ＝ 50%；之後的讀者每一位都會讓命中次數加一，web-01 收到的請求仍然只有一個。',
        mistakes: [
          { answer: { cell: '2' }, why: '把讀者 A 的請求也算成命中：那一次邊緣節點沒有副本，是回源取得的 MISS。' },
          { answer: { cell: '0' }, why: '讀者 B 的請求沒有回到來源，正是從快取回答的命中（X-Cache: HIT）。' },
        ] },
    ],
  },
  quiz: [
    {
      id: 'srv11-q1', prompt: '`/assets/app.40a1952c.js` 的檔名含有內容的雜湊，內容一改檔名就會改。它最適合哪一個 Cache-Control？',
      options: ['`public, max-age=31536000, immutable`', '`no-cache`', '`private, max-age=31536000`', '`no-store`'],
      answer: 0,
      explanation: '同一個網址的內容永遠不變，所以可以讓所有快取（public）存一年，並以 immutable 告訴瀏覽器重新整理時也不必驗證。no-cache 會讓每次使用前都回來驗證，浪費來回；private 讓 CDN 不能存，失去 CDN 的效果；no-store 完全不存，每次都要重新下載。',
    },
    {
      id: 'srv11-q2', prompt: 'HTML 頁面回應 `Cache-Control: no-cache`，瀏覽器會怎麼做？',
      options: ['完全不存這份回應，每次都重新下載整份頁面', '可以存下來，但每次使用前先帶著 ETag 或 Last-Modified 問來源，沒變就得到 304', '只有 CDN 可以存，瀏覽器不可以', '存下來並在 0 秒後刪除'],
      answer: 1,
      explanation: 'no-cache 表示「使用前一定要驗證」：瀏覽器保留副本，送出條件式請求，內容沒變時來源只回 304，不必重新傳整份頁面。完全不存的是 no-store；no-cache 對瀏覽器與 CDN 同樣適用，並不是只給 CDN（只讓瀏覽器存的是 private）；它也不是存 0 秒後刪除，副本會留著，驗證之後繼續使用。',
    },
    {
      id: 'srv11-q3', prompt: '`/api/cart` 回傳某位讀者購物車裡的商品。哪一個 Cache-Control 最恰當？',
      options: ['`public, max-age=60`', '`public, s-maxage=60`', '`private, no-store`', '`public, max-age=31536000, immutable`'],
      answer: 2,
      explanation: '購物車屬於某一個人，絕不能讓共用快取存下來交給別人，private 禁止 CDN 與代理存，no-store 連瀏覽器也不存。public, max-age=60 與 public, s-maxage=60 都允許 CDN 存 60 秒，可能把甲的購物車送給乙；immutable 一年更是錯誤，購物車隨時在變。',
    },
    {
      id: 'srv11-q4', prompt: '來源回應 `Cache-Control: public, max-age=0, s-maxage=120`。瀏覽器與 CDN 各會怎麼處理？',
      options: ['瀏覽器存 120 秒，CDN 每次都回源', '兩者都存 120 秒', '兩者都不存', '瀏覽器每次都要驗證，CDN 可以存 120 秒'],
      answer: 3,
      explanation: 's-maxage 只給共用快取看，而且優先於 max-age，所以 CDN 存 120 秒；瀏覽器忽略 s-maxage，看到 max-age=0，每次都要向 CDN 確認。方向正好相反的是第一個選項；兩者都存 120 秒忽略了 max-age=0；這個回應也明確允許存（public），不是兩者都不存。',
    },
    {
      id: 'srv11-q5', prompt: '一小時內，邊緣節點收到 1000 個請求，`X-Cache: HIT` 有 950 個。來源大約收到幾個請求？',
      options: ['50 個', '950 個', '1000 個', '0 個'],
      answer: 0,
      explanation: '只有 MISS 才會回源：1000 − 950 ＝ 50，命中率是 95%，來源的負擔是沒有 CDN 時的二十分之一。950 是在邊緣節點就回答的請求數；1000 是沒有 CDN 時的情形；即使命中率很高，每份副本第一次與每次過期仍要回源，不會是 0。',
    },
    {
      id: 'srv11-q6', prompt: '`/api/catalog` 的回應有 `Cache-Control: public, max-age=60`，經過 CDN 卻永遠是 `X-Cache: MISS`，回應裡還有 `Set-Cookie: recent=fiction`。哪一個做法正確？',
      options: ['在 nginx 的 /api/ 加上 `proxy_ignore_headers Set-Cookie;`', '讓書目 API 不再設定 cookie，或只在那個 location 用 `proxy_hide_header Set-Cookie;` 拿掉它', '把 max-age 改成 3600', '每次有人抱怨時清除 CDN 的快取'],
      answer: 1,
      explanation: '這個 CDN（和多數 CDN 的預設）不存帶 Set-Cookie 的回應，原因就在 cookie；公開的網址不應該設定 cookie，或至少在只屬於書目的 location 拿掉它。proxy_ignore_headers 只讓 nginx 自己的快取存下整份回應（連同 cookie 送給所有人），CDN 仍看到 Set-Cookie；max-age 再長也敵不過 Set-Cookie；清除快取與「根本存不進去」無關。',
    },
    {
      id: 'srv11-q7', prompt: '`/assets/` 一律送出 `public, max-age=31536000, immutable`。同事直接把新內容覆蓋到已發布的 `app.20feb1ee.css`，讀者仍看到舊樣式。最可靠的修正是？',
      options: ['用 CDN 的清除 API 清掉 app.20feb1ee.css', '請讀者按 Ctrl+F5 強制重新整理', '把新內容放到新的檔名（例如 app.6ea0aa8e.css），再部署引用它的 HTML', '把 /assets/ 改成 `max-age=0`，等大家都更新後再改回來'],
      answer: 2,
      explanation: '新網址在每一層快取都是 MISS，讀者一拿到新的 HTML 就會下載新檔，舊網址也維持舊內容。清除只影響 CDN，已存一年的瀏覽器不會再問；要求每位讀者強制重新整理不可行；現在改 max-age 管不到已經存下的副本，它們早就記住了一年的期限。',
    },
    {
      id: 'srv11-q8', prompt: 'nginx 的 location 設定了 `proxy_cache_valid 200 10s;`，後端沒有送 Cache-Control。第 0 秒的請求得到 `X-Cache-Status: MISS`，第 5 秒是 HIT，第 12 秒的請求會是？',
      options: ['HIT', 'MISS', 'BYPASS', 'EXPIRED'],
      answer: 3,
      explanation: '副本在第 0 秒存下、新鮮 10 秒，第 12 秒已經過期，nginx 向後端要一份新的並存下來，狀態是 EXPIRED。HIT 只在副本仍新鮮時出現；MISS 表示快取裡根本沒有這份副本，但它還在；BYPASS 要有 proxy_cache_bypass 的條件成立才會出現。',
    },
  ],
  terminal: {
    machines: [before, cdn],
    examples: [
      {
        id: 'srv11-validators', title: '驗證器與 304：還沒有任何 Cache-Control', machine: 'srv11-before',
        description: 'nginx 送出的靜態檔有 Last-Modified 與 ETag，但沒有 Cache-Control。帶著相同的 ETag 或時間問，得到沒有本文的 304；時間比檔案的修改時間早，就是完整的 200。購物車的 API 由應用程式自己送出 private, no-store。',
        steps: [
          { command: `curl -sI http://localhost/assets/${JS_NAME}`, output: 'HTTP/1.1 200 OK\nServer: nginx/1.24.0 (Ubuntu)\nDate: Sun, 22 Nov 2026 10:00:00 GMT\nContent-Type: application/javascript\nContent-Length: 46\nLast-Modified: Sun, 15 Nov 2026 09:00:00 GMT\nConnection: keep-alive\nETag: "6af97490-2e"\nX-Content-Type-Options: nosniff\nAccept-Ranges: bytes\n' },
          { command: `curl -sI -H 'If-None-Match: "6af97490-2e"' http://localhost/assets/${JS_NAME}`, output: 'HTTP/1.1 304 Not Modified\nServer: nginx/1.24.0 (Ubuntu)\nDate: Sun, 22 Nov 2026 10:00:00 GMT\nLast-Modified: Sun, 15 Nov 2026 09:00:00 GMT\nConnection: keep-alive\nETag: "6af97490-2e"\nX-Content-Type-Options: nosniff\n' },
          { command: `curl -s -o /dev/null -w '%{http_code}\\n' -H 'If-Modified-Since: Sun, 15 Nov 2026 09:00:00 GMT' http://localhost/assets/${JS_NAME}`, output: '304' },
          { command: `curl -s -o /dev/null -w '%{http_code}\\n' -H 'If-Modified-Since: Sat, 14 Nov 2026 12:00:00 GMT' http://localhost/assets/${JS_NAME}`, output: '200' },
          { command: 'curl -sI http://localhost/api/cart | grep -i -e cache-control -e set-cookie', output: 'Cache-Control: private, no-store\nSet-Cookie: sid=a81f2c; Path=/; HttpOnly' },
        ],
      },
      {
        id: 'srv11-edge', title: '經由 CDN：X-Cache、Age 與回到來源的請求', machine: 'srv11-cdn',
        description: '每個 location 的 Cache-Control；一週前存進邊緣節點的 JavaScript（HIT，Age 約七天）；no-cache 的首頁每次 MISS；s-maxage=30 的庫存快照在 50 秒內的六個請求，以及 web-01 的存取日誌裡真正收到的請求數。',
        steps: [
          { command: `grep Cache-Control ${PARTS}/*.conf`, output: '/etc/nginx/pinebooks.d/assets.conf:    add_header Cache-Control "public, max-age=31536000, immutable";\n/etc/nginx/pinebooks.d/data.conf:    add_header Cache-Control "public, max-age=0, s-maxage=30";\n/etc/nginx/pinebooks.d/pages.conf:    add_header Cache-Control "no-cache";' },
          { command: `curl -sI ${W}/assets/${JS_NAME}`, output: 'HTTP/1.1 200 OK\nDate: Sun, 15 Nov 2026 09:05:00 GMT\nContent-Type: application/javascript\nContent-Length: 46\nLast-Modified: Sun, 15 Nov 2026 09:00:00 GMT\nETag: "6af97490-2e"\nCache-Control: public, max-age=31536000, immutable\nX-Content-Type-Options: nosniff\nAccept-Ranges: bytes\nConnection: keep-alive\nAge: 608100\nX-Cache: HIT\n' },
          { command: `for i in 1 2; do ${xcache(`${W}/`, ' %header{age}')}; done`, output: 'MISS 0\nMISS 0' },
          { command: `for t in 0 10 10 10 10 10; do sleep $t; ${xcache(`${W}/data/stock.json`, ' %header{age}')}; done`, output: 'MISS 0\nHIT 10\nHIT 20\nMISS 0\nHIT 10\nHIT 20' },
          { command: 'sudo grep -c \'GET /data/stock.json\' /var/log/nginx/access.log', output: '2' },
          { command: 'date', output: 'Sun Nov 22 10:00:50 UTC 2026' },
        ],
      },
      {
        id: 'srv11-miss', title: '一直 MISS 的原因：Set-Cookie、private、Vary 與查詢字串', machine: 'srv11-cdn',
        description: '書目 API 帶著 Set-Cookie，經過 CDN 永遠 MISS；購物車是 private, no-store；banner 依 Accept-Language 分成兩份；同一支 JavaScript 加上不同的查詢字串，各自是新的快取鍵。',
        steps: [
          { command: `curl -sI ${W}/api/catalog`, output: 'HTTP/1.1 200 OK\nServer: nginx/1.24.0 (Ubuntu)\nDate: Sun, 22 Nov 2026 10:00:00 GMT\nContent-Type: application/json\nContent-Length: 86\nCache-Control: public, max-age=60\nSet-Cookie: recent=fiction; Path=/\nX-Cache-Status: MISS\nX-Content-Type-Options: nosniff\nConnection: keep-alive\nAge: 0\nX-Cache: MISS\n' },
          { command: `for i in 1 2 3; do ${xcache(`${W}/api/catalog`)}; done`, output: 'MISS\nMISS\nMISS' },
          { command: `curl -sI ${W}/api/cart | grep -e Cache-Control -e X-Cache:`, output: 'Cache-Control: private, no-store\nX-Cache: MISS' },
          { command: `for l in zh-TW zh-TW en; do curl -s -o /dev/null -w "$l %header{x-cache}\\n" -H "Accept-Language: $l" ${W}/api/banner; done`, output: 'zh-TW MISS\nzh-TW HIT\nen MISS' },
          { command: `for q in '' '?utm_source=newsletter' '?utm_source=line' '?utm_source=line'; do curl -s -o /dev/null -w "%header{x-cache} ${ASSET}$q\\n" "${W}${ASSET}$q"; done`, output: 'HIT /assets/app.40a1952c.js\nMISS /assets/app.40a1952c.js?utm_source=newsletter\nMISS /assets/app.40a1952c.js?utm_source=line\nHIT /assets/app.40a1952c.js?utm_source=line' },
        ],
      },
      {
        id: 'srv11-proxy-cache', title: '來源端的 proxy_cache：MISS、HIT、EXPIRED 與清除', machine: 'srv11-cdn',
        description: '直接連 web-01 的 nginx（localhost，不經過 CDN）。沒有 Cache-Control 的暢銷榜照 proxy_cache_valid 存 10 秒；帶 Set-Cookie 的書目與 private 的購物車不存。快取檔的第一行記著它的鍵；以 root 的 Shell 刪掉快取檔就是清除。',
        steps: [
          { command: `head -n 1 ${SITE_PATH}`, output: 'proxy_cache_path /var/cache/nginx/api levels=1:2 keys_zone=api:10m max_size=200m inactive=10m use_temp_path=off;' },
          { command: `cat ${API_CONF}`, output: 'location /api/ {\n    proxy_pass http://127.0.0.1:3000;\n    proxy_cache api;\n    proxy_cache_valid 200 10s;\n    add_header X-Cache-Status $upstream_cache_status always;\n    add_header X-Content-Type-Options nosniff;\n}' },
          { command: "curl -s -o /dev/null -w '%header{x-cache-status}\\n' http://localhost/api/bestsellers", output: 'MISS' },
          { command: "curl -s -o /dev/null -w '%header{x-cache-status}\\n' http://localhost/api/bestsellers", output: 'HIT' },
          { command: 'sleep 11', output: '' },
          { command: "curl -s -o /dev/null -w '%header{x-cache-status}\\n' http://localhost/api/bestsellers", output: 'EXPIRED' },
          { command: 'for p in catalog cart; do curl -s -o /dev/null -w "$p %header{x-cache-status}\\n" http://localhost/api/$p; done', output: 'catalog MISS\ncart MISS' },
          { command: 'sudo grep -r "KEY:" /var/cache/nginx/api', output: '/var/cache/nginx/api/1/31/fb64792b35a72e3c5eb5b50a312ad311:KEY: http127.0.0.1:3000/api/bestsellers' },
          { command: "sudo bash -c 'rm -rf /var/cache/nginx/api/*'", output: '' },
          { command: "curl -s -o /dev/null -w '%header{x-cache-status}\\n' http://localhost/api/bestsellers", output: 'MISS' },
        ],
      },
      {
        id: 'srv11-purge', title: '覆蓋同一個檔名的部署，以及清除 API', machine: 'srv11-cdn',
        description: '把新的 CSS 直接覆蓋到已發布的 app.20feb1ee.css：來源變了，邊緣節點仍送出舊的。沒有權杖的清除請求被拒絕；帶著權杖清除這個網址之後，邊緣節點下一次 MISS，拿到新的內容。',
        steps: [
          { command: `ls ~/release ~/release/assets`, output: '/home/learner/release:\nassets/  index.html\n\n/home/learner/release/assets:\napp.40a1952c.js  app.6ea0aa8e.css' },
          { command: `sudo cp ~/release/assets/${NEW_NAME} ${PUBLIC}/assets/${OLD_NAME}`, output: '' },
          { command: `curl -s http://localhost/assets/${OLD_NAME} | grep price`, output: '.price{color:#c0392b}' },
          { command: `curl -s ${W}/assets/${OLD_NAME} | grep price`, output: '.price{color:#1d6b3a}' },
          { command: `curl -s -X POST http://cdn-api/purge -d "url=${W}/assets/${OLD_NAME}"`, output: '{"error":"unauthorized"}' },
          { command: PURGE(`${W}/assets/${OLD_NAME}`), output: '{"status":"ok","purged":1}' },
          { command: xcache(`${W}/assets/${OLD_NAME}`, ' %header{age}'), output: 'MISS 0' },
          { command: `curl -s ${W}/assets/${OLD_NAME} | grep price`, output: '.price{color:#c0392b}' },
        ],
      },
    ],
    exercises: [
      {
        id: 'srv11-headers', title: '替靜態資源與 HTML 設定 Cache-Control', machine: 'srv11-before',
        statement: `web-01 還沒有放上 CDN，回應裡沒有任何 Cache-Control。請修改 ${PARTS}/ 裡的設定：/assets/ 底下的檔案（檔名都含內容雜湊）要回應 \`Cache-Control: ${IMMUTABLE}\`，location / 服務的 HTML（/ 與 /index.html）要回應 \`Cache-Control: no-cache\`；兩者都要保留現在每個回應都有的 \`X-Content-Type-Options: nosniff\`，/api/ 的回應由應用程式決定，不要改動。在不中斷服務的情況下套用，最後執行 \`curl -sI http://localhost/\`。檢查時首頁會換成另外兩個版本重新執行你的指令（長度、Last-Modified 與 ETag 都不同），直接打出答案無法通過。`,
        checks: [
          { kind: 'nginx', test: true },
          { kind: 'http', url: `http://localhost/assets/${JS_NAME}`, status: 200, headers: [['Cache-Control', IMMUTABLE], ['X-Content-Type-Options', 'nosniff']] },
          { kind: 'http', url: `http://localhost/assets/${OLD_NAME}`, status: 200, headers: [['Cache-Control', IMMUTABLE]] },
          { kind: 'http', url: 'http://localhost/', status: 200, headers: [['Cache-Control', 'no-cache'], ['X-Content-Type-Options', 'nosniff']] },
          { kind: 'http', url: 'http://localhost/api/cart', status: 200, headers: [['Cache-Control', 'private, no-store']] },
          { kind: 'output' },
        ],
        solution: [tee(ASSETS_CONF, assets()), tee(PAGES_CONF, pages()), ...reload, 'curl -sI http://localhost/'],
        variants: [otherIndex('首頁是冬季書展的版本', '松果書店｜冬季書展', '2026-11-21 18:00:00'), otherIndex('首頁是另一次部署的版本', '松果書店｜新書上架', '2026-11-22 07:45:00')],
        mistakes: [
          { commands: [tee(ASSETS_CONF, assets([`add_header Cache-Control "${IMMUTABLE}";`])), tee(PAGES_CONF, pages('no-cache', false)), ...reload, 'curl -sI http://localhost/'],
            why: '兩個 location 各有自己的 add_header 之後，就不再繼承 server 層的 add_header：X-Content-Type-Options: nosniff 從首頁與所有靜態資源上消失了。要在每個 location 再寫一次 nosniff。' },
          { commands: [tee(ASSETS_CONF, assets(['expires max;', NOSNIFF])), tee(PAGES_CONF, pages()), ...reload, 'curl -sI http://localhost/'],
            why: '`expires max;` 送出的是 Expires 與 `Cache-Control: max-age=315360000`，沒有 public 與 immutable：支援 immutable 的瀏覽器在使用者重新整理時可能仍會帶條件式請求回來驗證。題目要求的值要用 add_header 寫出來。' },
          { commands: [tee(ASSETS_CONF, assets()), tee(PAGES_CONF, pages('no-store')), ...reload, 'curl -sI http://localhost/'],
            why: 'HTML 設成 no-store：任何快取都不准存，每次瀏覽都要重新下載整份頁面，也用不到 ETag 與 304。要「每次都確認、沒變就不重傳」的是 no-cache。' },
          { commands: [tee(ASSETS_CONF, assets()), tee(PAGES_CONF, pages()), 'sudo nginx -t', 'curl -sI http://localhost/'],
            why: '設定寫對了也測試過，但沒有 reload：執行中的 nginx 仍是舊設定，回應裡還是沒有 Cache-Control。' },
        ],
        hints: [`assets.conf 與 pages.conf 各是一個 location；用 \`printf '…' | sudo tee 檔案\` 改寫它們，或先 \`cat\` 看看現在的內容。`, '每個 location 加一行 `add_header Cache-Control "…";`。別忘了 add_header 的繼承：location 有自己的 add_header 之後，server 層的 nosniff 就不見了。', '先 `sudo nginx -t`，再 `sudo systemctl reload nginx`，然後用 `curl -sI` 看標頭。'],
        explanation: `assets.conf 加上 \`add_header Cache-Control "${IMMUTABLE}";\`，pages.conf 加上 \`add_header Cache-Control "no-cache";\`，兩個 location 都再寫一次 \`add_header X-Content-Type-Options nosniff;\`：location 只要有自己的 add_header，就完全不繼承 server 層的。檔名含雜湊的檔案內容永遠不變，所以可以讓 CDN 與瀏覽器存一年；HTML 是指向這些檔案的目錄，no-cache 讓每次使用前都向來源確認，沒變時用 ETag 得到 304。/api/ 沒有動，購物車仍是應用程式送出的 private, no-store。最後的 curl -sI 會看到 Last-Modified、ETag、Cache-Control: no-cache 與 nosniff；換了首頁的版本，長度與驗證器跟著改變。`,
      },
      {
        id: 'srv11-catalog', title: '讓書目 API 在 CDN 上命中', machine: 'srv11-cdn',
        statement: `書目 ${W}/api/catalog 對每位讀者都一樣，應用程式也送出了 \`Cache-Control: public, max-age=60\`，經過 CDN 卻永遠是 X-Cache: MISS，每個請求都回到 web-01。請找出原因，只針對書目修正：新增 ${CATALOG_CONF}，讓邊緣節點可以快取 /api/catalog。限制：/api/cart 的登入 cookie（\`Set-Cookie: ${SID}\`）必須照常送出，也不能讓 web-01 的 nginx 把任何 Set-Cookie 存進它的快取。在不中斷服務的情況下套用，然後經由 CDN 連續請求 ${W}/api/catalog 兩次，第二次應該是 HIT。`,
        checks: [
          { kind: 'nginx', test: true },
          { kind: 'cache', url: `${W}/api/catalog`, status: 'HIT' },
          { kind: 'http', url: `${W}/api/catalog`, status: 200, body: '"books"' },
          { kind: 'http', url: 'http://localhost/api/cart', status: 200, headers: [['Set-Cookie', SID], ['Cache-Control', 'private, no-store']] },
        ],
        solution: [`curl -sI ${W}/api/catalog`, tee(CATALOG_CONF, catalog(['proxy_hide_header Set-Cookie;'])), ...reload, `for i in 1 2; do ${xcache(`${W}/api/catalog`)}; done`],
        mistakes: [
          { commands: [tee(API_CONF, api(['proxy_hide_header Set-Cookie;'])), ...reload, `for i in 1 2; do ${xcache(`${W}/api/catalog`)}; done`],
            why: '在整個 /api/ 拿掉 Set-Cookie：書目確實可以命中了，但購物車的 sid cookie 也一起消失，讀者再也無法維持登入與購物車。只在書目自己的 location 拿掉它。' },
          { commands: [tee(API_CONF, api(['proxy_ignore_headers Set-Cookie;'])), ...reload, `for i in 1 2; do ${xcache(`${W}/api/catalog`)}; done`],
            why: 'proxy_ignore_headers 只讓 web-01 的 nginx 把書目連同 Set-Cookie 一起存進快取，之後每個人都收到同一個 cookie；CDN 仍看到 Set-Cookie，照樣 MISS。' },
          { commands: [tee(CATALOG_CONF, catalog(['add_header Cache-Control "public, max-age=3600";'])), ...reload, `for i in 1 2; do ${xcache(`${W}/api/catalog`)}; done`],
            why: '問題不在新鮮期限：回應仍帶著 Set-Cookie，CDN 不存帶 cookie 的回應，再長的 max-age 也是 MISS（而且現在回應裡有兩個 Cache-Control）。' },
          { commands: [tee(CATALOG_CONF, catalog(['proxy_hide_header Set-Cookie;'])), 'sudo nginx -t', `for i in 1 2; do ${xcache(`${W}/api/catalog`)}; done`],
            why: '設定正確但沒有 reload：執行中的 nginx 沒有 = /api/catalog 這個 location，回應仍帶著 Set-Cookie，兩次都是 MISS。' },
        ],
        hints: [`先經由 CDN 看書目的完整回應標頭：\`curl -sI ${W}/api/catalog\`。哪一個標頭會讓共用快取不敢存？`, '`location = /api/catalog { … }` 只符合這一個網址，比 /api/ 優先；在裡面 proxy_pass 到同一個後端，再用 `proxy_hide_header Set-Cookie;` 拿掉 cookie。', '改完 `sudo nginx -t`、`sudo systemctl reload nginx`，再用 `-w \'%header{x-cache}\\n\'` 連續請求兩次。'],
        explanation: `經由 CDN 的回應帶著 \`Set-Cookie: recent=fiction\`：本課的 CDN 和 nginx（以及多數 CDN 的預設）都不存帶 Set-Cookie 的回應，因為那會把一個人的 cookie 交給所有人。新增的 catalog.conf 寫 \`location = /api/catalog { proxy_pass http://127.0.0.1:3000; proxy_hide_header Set-Cookie; }\`：精確比對的 location 只影響書目，回應裡不再有 cookie，CDN 依 public, max-age=60 存下它，第二個請求就是 HIT。/api/cart 仍走 /api/，sid cookie 與 private, no-store 都不變。這個 location 沒有 proxy_cache，所以 web-01 的 nginx 不存書目；要存的話，同時寫 proxy_cache 與 proxy_ignore_headers Set-Cookie，而且必須和 proxy_hide_header 一起用。長期的修正在應用程式：公開的 API 不應該設定 cookie，「最近看過的分類」可以由瀏覽器自己記住。`,
      },
      {
        id: 'srv11-release', title: '用新的檔名部署新樣式，不清除快取', machine: 'srv11-cdn',
        statement: `設計師把價格改成紅色，新的建置在 ~/release/：index.html 已經改成引用 /assets/${NEW_NAME}（新內容的 SHA-256 前 8 碼），assets/ 裡是新的 CSS 與沒有改變的 JavaScript。請把這個版本部署到 ${PUBLIC}，讓經由 CDN 的讀者馬上拿到新樣式。限制：不要使用清除 API，也不要改寫任何已經發布的檔案——還開著舊頁面的讀者（以及存在瀏覽器裡的舊 HTML）仍然引用 /assets/${OLD_NAME}，經由 CDN 它必須維持原本的綠色。部署之後，經由 CDN 取得首頁，確認它引用的樣式表。`,
        checks: [
          { kind: 'http', url: `${W}/`, status: 200, body: `/assets/${NEW_NAME}` },
          { kind: 'http', url: `${W}/assets/${NEW_NAME}`, status: 200, body: '.price{color:#c0392b}', headers: [['Cache-Control', IMMUTABLE]] },
          { kind: 'http', url: `${W}/assets/${OLD_NAME}`, status: 200, body: '.price{color:#1d6b3a}' },
        ],
        solution: [`ls ~/release/assets ${PUBLIC}/assets`, `sudo cp ~/release/assets/${NEW_NAME} ${PUBLIC}/assets/`, `sudo cp ~/release/index.html ${PUBLIC}/index.html`, `curl -s ${W}/ | grep stylesheet`],
        mistakes: [
          { commands: [`sudo cp ~/release/assets/${NEW_NAME} ${PUBLIC}/assets/${OLD_NAME}`, PURGE(`${W}/assets/${OLD_NAME}`), `curl -s ${W}/assets/${OLD_NAME} | grep price`],
            why: '覆蓋舊檔名再清除 CDN：邊緣節點現在送出紅色，但已經把 app.20feb1ee.css 存了一年的瀏覽器不會再問，清除管不到它們；舊網址的內容也被改掉了，檔名裡的雜湊和內容對不上。' },
          { commands: [`sudo cp ~/release/index.html ${PUBLIC}/index.html`, `curl -s ${W}/ | grep stylesheet`],
            why: '只換了 HTML：首頁引用 /assets/app.6ea0aa8e.css，來源卻沒有這個檔案，讀者拿到 404，整個頁面失去樣式。先上傳新的資源，最後才換 HTML。' },
          { commands: [`sudo cp ~/release/assets/${NEW_NAME} ${PUBLIC}/assets/`, `curl -s ${W}/ | grep stylesheet`],
            why: '新的 CSS 已經在來源上，但首頁仍引用舊的 app.20feb1ee.css，沒有讀者會去下載新檔。版本化的最後一步是部署引用新檔名的 HTML。' },
        ],
        hints: ['`ls ~/release/assets` 與來源的 assets/ 比一比：哪一個檔案是新的？', '新檔名不會覆蓋任何東西，可以先用 `sudo cp` 放到來源的 assets/；HTML 最後才換。', `首頁是 no-cache，CDN 不存它，換掉來源的 index.html 之後，經由 CDN 馬上就看得到：\`curl -s ${W}/ | grep stylesheet\`。`],
        explanation: `先 \`sudo cp ~/release/assets/${NEW_NAME} ${PUBLIC}/assets/\`，再 \`sudo cp ~/release/index.html ${PUBLIC}/index.html\`。新的 CSS 是新的網址，在邊緣節點與每個瀏覽器都是 MISS，第一次就拿到紅色，之後照 /assets/ 的設定存一年也安全，因為這個網址的內容永遠不會變。首頁是 no-cache，換掉之後讀者馬上拿到引用新檔名的 HTML。舊的 app.20feb1ee.css 原封不動，引用它的舊頁面仍然完整。順序也重要：先放資源、最後換 HTML，任何時刻都不會有 HTML 指向不存在的檔案。整個過程不需要清除任何快取。`,
      },
      {
        id: 'srv11-hit-ratio', title: '算出庫存快照有幾個請求回到來源', machine: 'srv11-cdn',
        statement: `營運想知道 /data/stock.json 給來源帶來多少負擔。請模擬 50 秒內每 10 秒一位讀者：從現在起，在第 0、10、20、30、40、50 秒各經由 CDN 請求一次 ${W}/data/stock.json（用 sleep 讓時間前進），然後用一個指令印出這六個請求中有幾個回到了來源伺服器（只印一個數字）。檢查時 data.conf 的 s-maxage 會換成另外兩個值重新執行你的指令，直接打出答案無法通過。`,
        checks: [{ kind: 'output', fromCommand: '\\b(grep|wc)\\b' }],
        solution: [`cat ${PARTS}/data.conf`, VISITS(true)],
        variants: [otherTtl(20), otherTtl(60)],
        mistakes: [
          { commands: [VISITS(false)],
            why: '沒有 sleep：六個請求在同一秒送出，第一個 MISS 之後全都 HIT，只回源一次。模擬的時鐘只有 sleep 會讓它前進，要在請求之間等 10 秒。' },
          { commands: [VISITS(true, 'HIT')],
            why: '數的是 HIT：命中的請求由邊緣節點回答，沒有到來源。回到來源的是 MISS。' },
          { commands: [`for t in 0 10 10 10 10 10; do sleep $t; ${xcache(`${W}/data/stock.json`)}; done`, 'echo 2'],
            why: '用 echo 打出數字：s-maxage 換成 20 或 60 秒時答案不同，而且題目要的數字必須由實際計數的指令印出。' },
        ],
        hints: [`先看 data.conf 的 s-maxage：邊緣節點把這個檔案存多久？`, `\`for t in 0 10 10 10 10 10; do sleep $t; curl -s -o /dev/null -w '%header{x-cache}\\n' ${W}/data/stock.json; done\` 會在第 0、10、…、50 秒各送一個請求。`, '在迴圈後面接 `| grep -c MISS` 數出回源的次數；也可以之後用 `sudo grep -c` 數 web-01 存取日誌裡 /data/stock.json 的請求。'],
        explanation: 's-maxage=30 時，第 0 秒 MISS 並存下來，第 10、20 秒 HIT；第 30 秒副本已經存了 30 秒、不再新鮮，再 MISS 一次，第 40、50 秒 HIT：六個請求只有 2 個回到來源，命中率約 67%。s-maxage 是 20 秒時每 20 秒回源一次（3 個），60 秒時只有第一個（1 個）。新鮮期限越長，來源的負擔越小，但讀者看到的庫存也可能越舊：s-maxage 要依「資料最多可以晚多久」決定。web-01 的存取日誌裡 /data/stock.json 的行數，正好等於 MISS 的次數。',
      },
    ],
  },
};
