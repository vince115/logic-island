import type { NetworkScene, NodeTable } from '@/lib/network/model';
import type { LessonContent } from '../schema';

/*
 * CN15 Caching, CDNs, and HTTP/2 and HTTP/3 (CN-3, packet-journey; the blueprint's architecture-diagram belongs to the
 * database capability, so the lesson shows network scenes). Four fixed scenes on the TCP/IP model: the browser cache
 * (a 200 with an ETag, a 304 revalidation, a fresh hit that sends nothing on the network), a CDN miss and hit, HTTP/2
 * streams stalled by one lost TCP segment, and the same loss on HTTP/3 over QUIC. HTTPS is assumed throughout; the TLS
 * records are left out so the HTTP headers stay readable. Addresses are RFC 5737 documentation ranges.
 *
 * Latency model (one request ≈ one round trip; transmission, processing and connection setup are left out):
 *   expected latency = h × RTT_edge + (1 − h) × (RTT_edge + RTT_origin), with h the hit ratio.
 * With RTT_edge = 20 ms and RTT_origin = 150 ms (edge to origin), and 160 ms from the user straight to the origin. The
 * lesson's check recomputes every latency written in the scenes and the prose.
 */

const IP = { laptop: '192.0.2.10', userB: '192.0.2.11', edge: '198.51.100.20', server: '203.0.113.80' };

const http = (fields: [string, string][], protocol = 'HTTP') => ({ layer: 'application' as const, protocol, fields: fields.map(([name, value]) => ({ name, value })) });
const tcp = (from: string, to: string, extra: [string, string][] = []) => ({ layer: 'transport' as const, protocol: 'TCP', fields: [
  { name: '來源埠', value: from }, { name: '目的埠', value: to }, ...extra.map(([name, value]) => ({ name, value }))] });
const ipv4 = (from: string, to: string, proto = '6（TCP）') => ({ layer: 'network' as const, protocol: 'IPv4', fields: [
  { name: '來源 IP', value: from }, { name: '目的 IP', value: to }, { name: '協定', value: proto }] });

// ---- scene 1: the browser cache -----------------------------------------------------------------------------------
const HTML = '/index.html', JS = '/assets/app.3f9a1c.js';
const IMMUTABLE = 'public, max-age=31536000, immutable';
const CACHE_HEAD = ['網址', 'ETag', 'Cache-Control', '存入或驗證時間', '新鮮期限（秒）', '使用前要驗證'];
const htmlRow = (time: string) => [HTML, '"h-41"', 'no-cache', time, '0', '是（每次都問伺服器）'];
const jsRow = [JS, '"j-3f9a"', IMMUTABLE, '第 1 天 09:00:00', '31536000', '否（新鮮期限內直接用）'];
const stored = (rows: string[][], changed: number[]): NodeTable => ({ node: 'cache', name: '快取內容', head: CACHE_HEAD, rows, changed });
const trips = (n: number, changed: boolean): NodeTable => ({ node: 'cache', name: '網路往返紀錄', head: ['項目', '次數'], rows: [['累計往返次數', String(n)]], changed: changed ? [0] : [] });
const toServer = [tcp('51000', '443'), ipv4(IP.laptop, IP.server)];
const toLaptop = [tcp('443', '51000'), ipv4(IP.server, IP.laptop)];

const browserCache: NetworkScene = {
  id: 'cn15-browser-cache', title: '瀏覽器快取：第一次下載、304 驗證與完全不上網的命中', model: 'tcp-ip',
  description: '同一台筆電兩天造訪 www.example.com。網頁 /index.html 回應 Cache-Control: no-cache 與 ETag；打包工具產生的 /assets/app.3f9a1c.js 檔名帶著內容雜湊，回應 max-age=31536000（一年）與 immutable。為了看清楚快取做了什麼，把瀏覽器拆成兩個節點：分頁中的網頁向「瀏覽器 HTTP 快取」要資源，快取決定直接回答，還是送請求上網路。只有走網路的訊息才有 TCP 與 IPv4 標頭；快取的「網路往返紀錄」表數的是真正送上網路的請求。連線走 HTTPS，這裡省略 TLS，只看 HTTP 標頭。',
  nodes: [
    { id: 'page', label: '分頁中的網頁', kind: 'host', addresses: ['同一台筆電的瀏覽器'] },
    { id: 'cache', label: '瀏覽器 HTTP 快取', kind: 'host', addresses: [`IP ${IP.laptop}`, '對外送請求的也是它'] },
    { id: 'server', label: '網站伺服器 www.example.com', kind: 'server', addresses: [`IP ${IP.server}`, '埠 443'] },
  ],
  messages: [
    { id: 'first-html', from: 'cache', to: 'server', label: '第 1 天 09:00：GET /index.html',
      note: '第一次造訪，快取是空的。分頁要 /index.html，快取裡沒有，只好把請求送上網路。這是第 1 次網路往返。',
      headers: [http([['方法', 'GET'], ['路徑', HTML], ['Host', 'www.example.com']]), ...toServer],
      tables: [trips(1, true)] },
    { id: 'first-html-200', from: 'server', to: 'cache', label: '200 OK（no-cache，ETag "h-41"）', payload: 'index.html 的內容（5120 位元組）',
      note: '伺服器回 200 與完整內容。no-cache 的意思不是「不要存」，而是「可以存，但每次使用前都要先問我」。ETag "h-41" 是這個版本的識別碼，快取把它和內容一起存起來，下次驗證時用。',
      headers: [http([['狀態碼', '200'], ['狀態說明', 'OK'], ['Cache-Control', 'no-cache'], ['ETag', '"h-41"'], ['Content-Length', '5120']]), ...toLaptop],
      tables: [stored([htmlRow('第 1 天 09:00:00')], [0])] },
    { id: 'first-js', from: 'cache', to: 'server', label: '第 1 天 09:00：GET /assets/app.3f9a1c.js',
      note: '網頁的 HTML 引用了 app.3f9a1c.js，快取裡也沒有，第 2 次網路往返。',
      headers: [http([['方法', 'GET'], ['路徑', JS], ['Host', 'www.example.com']]), ...toServer],
      tables: [trips(2, true)] },
    { id: 'first-js-200', from: 'server', to: 'cache', label: '200 OK（max-age=31536000, immutable）', payload: 'app.3f9a1c.js 的內容（180000 位元組）',
      note: '檔名裡的 3f9a1c 是內容的雜湊：只要程式一改，檔名就跟著改，所以這個網址的內容永遠不會變。伺服器因此放心給一年的新鮮期限（31536000 秒），immutable 再告訴瀏覽器：就算使用者按重新整理，也不必驗證。',
      headers: [http([['狀態碼', '200'], ['狀態說明', 'OK'], ['Cache-Control', IMMUTABLE], ['ETag', '"j-3f9a"'], ['Content-Length', '180000']]), ...toLaptop],
      tables: [stored([htmlRow('第 1 天 09:00:00'), jsRow], [1])] },
    { id: 're-html', from: 'cache', to: 'server', label: '第 2 天 09:00：GET /index.html（If-None-Match）',
      note: '隔天再訪。/index.html 是 no-cache，快取雖然有副本，也必須先驗證：送出條件式請求，把存著的 ETag 放進 If-None-Match，意思是「如果目前版本還是 \"h-41\"，就不用傳內容給我」。這是第 3 次網路往返。',
      headers: [http([['方法', 'GET'], ['路徑', HTML], ['Host', 'www.example.com'], ['If-None-Match', '"h-41"']]), ...toServer],
      tables: [trips(3, true)] },
    { id: 're-html-304', from: 'server', to: 'cache', label: '304 Not Modified（沒有內容）',
      note: '伺服器比對 ETag，網頁沒有改過，回 304 Not Modified，不帶內容，只有幾百位元組的標頭。快取更新驗證時間，再把存著的 index.html 交給分頁。驗證省下的是 5120 位元組的傳輸，但仍然花了一個 RTT。',
      headers: [http([['狀態碼', '304'], ['狀態說明', 'Not Modified'], ['Cache-Control', 'no-cache'], ['ETag', '"h-41"'], ['主體', '無（不重送內容）']]), ...toLaptop],
      tables: [stored([htmlRow('第 2 天 09:00:00'), jsRow], [0])] },
    { id: 're-js-hit', from: 'cache', to: 'page', label: '從快取交回 app.3f9a1c.js（沒有網路訊息）', payload: 'app.3f9a1c.js 的內容（取自磁碟快取）',
      note: '分頁要 app.3f9a1c.js。副本才存了 1 天（86400 秒），遠小於 31536000 秒的新鮮期限，快取直接交給分頁：沒有任何封包離開筆電，所以這一步只有 HTTP 標頭，沒有 TCP 與 IPv4；網路往返次數仍是 3。開發者工具的 Network 面板會把它標成「(disk cache)」或「(memory cache)」。',
      headers: [http([['狀態碼', '200'], ['來源', '瀏覽器磁碟快取'], ['Age', '86400'], ['ETag', '"j-3f9a"']], 'HTTP（瀏覽器內部）')],
      tables: [trips(3, false), stored([htmlRow('第 2 天 09:00:00'), jsRow], [])] },
  ],
};

// ---- scene 2: a CDN miss and a hit --------------------------------------------------------------------------------
const HERO = '/assets/hero.8c2e.jpg';
const stats = (requests: number, hits: number, changed: number[]): NodeTable => ({ node: 'edge', name: '快取統計', head: ['項目', '值'], changed,
  rows: [['請求數', String(requests)], ['命中', String(hits)], ['未命中', String(requests - hits)], ['命中率', String(hits / requests)]] });
const edgeCache = (time: string, hits: number, changed: number[]): NodeTable => ({ node: 'edge', name: '邊緣快取', head: ['網址', '存入時間', '新鮮期限（秒）', '命中次數'],
  rows: [[HERO, time, '31536000', String(hits)]], changed });
const cdn: NetworkScene = {
  id: 'cn15-cdn', title: 'CDN 邊緣節點：第一次未命中回源，第二次命中', model: 'tcp-ip',
  description: '網站的圖片放在 static.example.com，DNS 把台北的使用者導到台北的 CDN 邊緣節點。使用者到邊緣的 RTT 是 20 ms，邊緣到美國西岸來源伺服器的 RTT 是 150 ms，使用者直接連來源則是 160 ms。10:00:00 使用者 A 第一次要 hero.8c2e.jpg，10:05:00 使用者 B 要同一張圖。估算時一個請求算一個 RTT，忽略傳輸、處理時間與連線建立。',
  nodes: [
    { id: 'user-a', label: '使用者 A（台北）', kind: 'host', addresses: [`IP ${IP.laptop}`] },
    { id: 'user-b', label: '使用者 B（台北）', kind: 'host', addresses: [`IP ${IP.userB}`] },
    { id: 'edge', label: 'CDN 邊緣節點（台北）', kind: 'server', addresses: [`IP ${IP.edge}`, 'static.example.com'] },
    { id: 'origin', label: '來源伺服器（美國西岸）', kind: 'server', addresses: [`IP ${IP.server}`] },
  ],
  messages: [
    { id: 'a-req', from: 'user-a', to: 'edge', label: '10:00:00 使用者 A：GET /assets/hero.8c2e.jpg',
      note: '使用者 A 的請求只走到附近的邊緣節點，不必跨太平洋。邊緣節點先查自己的快取。',
      headers: [http([['方法', 'GET'], ['路徑', HERO], ['Host', 'static.example.com']]), tcp('52000', '443'), ipv4(IP.laptop, IP.edge)] },
    { id: 'pull', from: 'edge', to: 'origin', label: '未命中：邊緣回源 GET /assets/hero.8c2e.jpg',
      note: '邊緣快取裡沒有這張圖，這是一次未命中（miss）。邊緣節點代替使用者向來源伺服器要，這叫回源（origin pull）。這一趟要多花 150 ms。',
      headers: [http([['方法', 'GET'], ['路徑', HERO], ['Host', 'static.example.com']]), tcp('40000', '443'), ipv4(IP.edge, IP.server)],
      tables: [stats(1, 0, [0, 2, 3])] },
    { id: 'pull-200', from: 'origin', to: 'edge', label: '200 OK（public, max-age=31536000, immutable）', payload: 'hero.8c2e.jpg（240000 位元組）',
      note: '來源回 200，public 允許 CDN 這種共用快取存放，max-age 讓邊緣節點一年內都能直接用。邊緣存下副本。',
      headers: [http([['狀態碼', '200'], ['Cache-Control', IMMUTABLE], ['ETag', '"p-8c2e"'], ['Content-Length', '240000']]), tcp('443', '40000'), ipv4(IP.server, IP.edge)],
      tables: [edgeCache('10:00:00', 0, [0])] },
    { id: 'a-resp', from: 'edge', to: 'user-a', label: '200 OK（X-Cache: MISS）', payload: 'hero.8c2e.jpg（240000 位元組）',
      note: '邊緣把圖交給使用者 A。許多 CDN 會加上 X-Cache 之類的自訂標頭標出命中與否；Age: 0 表示剛從來源拿到。使用者 A 等了約 20 + 150 = 170 ms，比直接連來源的 160 ms 還多一點：未命中時，CDN 只是多繞了一站。',
      headers: [http([['狀態碼', '200'], ['Cache-Control', IMMUTABLE], ['X-Cache', 'MISS'], ['Age', '0']]), tcp('443', '52000'), ipv4(IP.edge, IP.laptop)] },
    { id: 'b-req', from: 'user-b', to: 'edge', label: '10:05:00 使用者 B：GET /assets/hero.8c2e.jpg',
      note: '五分鐘後，另一位台北的使用者要同一張圖。他的瀏覽器裡沒有這張圖，但邊緣節點有。',
      headers: [http([['方法', 'GET'], ['路徑', HERO], ['Host', 'static.example.com']]), tcp('53000', '443'), ipv4(IP.userB, IP.edge)] },
    { id: 'b-resp', from: 'edge', to: 'user-b', label: '200 OK（X-Cache: HIT，Age: 300）', payload: 'hero.8c2e.jpg（240000 位元組）',
      note: '命中（hit）：邊緣直接回應，來源伺服器完全不知道這次請求。Age 是副本在快取裡待了幾秒：10:00:00 存入，10:05:00 取用，所以是 300。使用者 B 只等了約 20 ms。兩個請求一中一不中，命中率 0.5；使用者 B 的表依公式「命中率 × 20 +（1 − 命中率）×（20 + 150）」估算不同命中率的期望延遲。',
      headers: [http([['狀態碼', '200'], ['Cache-Control', IMMUTABLE], ['X-Cache', 'HIT'], ['Age', '300']]), tcp('443', '53000'), ipv4(IP.edge, IP.userB)],
      tables: [stats(2, 1, [0, 1, 3]), edgeCache('10:00:00', 1, [0]),
        { node: 'user-b', name: '路段 RTT', head: ['路段', 'RTT（毫秒）'], rows: [
          ['使用者 ↔ 邊緣', '20'], ['邊緣 ↔ 來源', '150'], ['使用者 ↔ 來源（不經 CDN）', '160']] },
        { node: 'user-b', name: '期望延遲', head: ['命中率', '期望延遲（毫秒）'], rows: [
          ['0', '170'], ['0.5', '95'], ['0.8', '50'], ['0.9', '35'], ['0.95', '27.5'], ['1', '20']] }] },
  ],
};

// ---- scene 3: HTTP/2 streams on one TCP connection, one lost segment --------------------------------------------
const H2_HEAD = ['串流', '資源', '已交給瀏覽器（位元組）', '狀態'];
const h2Streams = (rows: string[][], changed: number[]): NodeTable => ({ node: 'browser', name: '串流狀態', head: H2_HEAD, rows, changed });
const tcpBuffer = (rows: string[][], changed: number[]): NodeTable => ({ node: 'browser', name: 'TCP 接收緩衝區', head: ['位元組範圍', '狀態'], rows, changed });
const h2Data = (stream: string, flags: string) => http([['類型', 'DATA'], ['串流 ID', stream], ['旗標', flags], ['長度', '1191 位元組']], 'HTTP/2');
const h2Down = (seq: number) => [tcp('443', '51000', [['序號', String(seq)], ['確認號', '181'], ['資料長度', '1200 位元組']]), ipv4(IP.server, IP.laptop)];
const BROWSER = { id: 'browser', label: '瀏覽器', kind: 'host' as const, addresses: [`IP ${IP.laptop}`] };
const SERVER = { id: 'server', label: '網站伺服器 www.example.com', kind: 'server' as const, addresses: [`IP ${IP.server}`, '埠 443'] };
const DELIVERED = '按順序，已交給 HTTP/2';
const http2: NetworkScene = {
  id: 'cn15-http2-hol', title: 'HTTP/2 多工：三個串流共用一條 TCP 連線，一個區段遺失全部卡住', model: 'tcp-ip',
  description: '瀏覽器和伺服器之間已經有一條 HTTP/2 連線（TCP 與 TLS 交握都做完了，TLS 省略不畫）。瀏覽器同時要三個資源：style.css、app.js、logo.png，各開一個串流。用戶端開的串流 ID 是奇數，依序是 1、3、5。伺服器把三個回應切成 DATA 訊框交錯送回，每個訊框是 9 位元組的訊框標頭加 1191 位元組資料，剛好裝進一個 1200 位元組的 TCP 區段。序號是相對序號，伺服器的第一個資料位元組是 1。',
  nodes: [BROWSER, SERVER],
  messages: [
    { id: 'h2-req', from: 'browser', to: 'server', label: 'HEADERS：串流 1、3、5',
      note: '三個請求不必排隊：每個請求是一個 HEADERS 訊框，標上自己的串流 ID，可以一起送出（這裡畫成一個區段）。標頭用 HPACK 壓縮：Host、User-Agent、Cookie 這些每次都一樣的標頭，第二次起只送表格索引。',
      headers: [http([['類型', 'HEADERS'], ['串流 ID', '1、3、5'], ['請求', 'GET /style.css、/app.js、/logo.png'], ['標頭壓縮', 'HPACK']], 'HTTP/2'),
        tcp('51000', '443', [['序號', '1'], ['確認號', '1'], ['資料長度', '180 位元組']]), ipv4(IP.laptop, IP.server)],
      tables: [h2Streams([['1', '/style.css', '0', '等待回應'], ['3', '/app.js', '0', '等待回應'], ['5', '/logo.png', '0', '等待回應']], [0, 1, 2])] },
    { id: 'd1', from: 'server', to: 'browser', label: 'DATA 串流 1（TCP 序號 1）', payload: 'style.css 的前 1191 位元組',
      note: '第一個區段按順序到達，TCP 交給 HTTP/2，HTTP/2 依訊框標頭的串流 ID 把資料分給 style.css。',
      headers: [h2Data('1', '無'), ...h2Down(1)],
      tables: [tcpBuffer([['1–1200', DELIVERED]], [0]),
        h2Streams([['1', '/style.css', '1191', '接收中'], ['3', '/app.js', '0', '等待回應'], ['5', '/logo.png', '0', '等待回應']], [0])] },
    { id: 'd2', from: 'server', to: 'browser', label: 'DATA 串流 3（TCP 序號 1201）', payload: 'app.js 的前 1191 位元組', lost: true,
      note: '載著 app.js 資料的區段在路上遺失了。',
      headers: [h2Data('3', '無'), ...h2Down(1201)] },
    { id: 'd3', from: 'server', to: 'browser', label: 'DATA 串流 5（TCP 序號 2401，END_STREAM）', payload: 'logo.png 的全部 1191 位元組',
      note: 'logo.png 很小，這一個訊框就是全部（END_STREAM）。資料已經到了瀏覽器的 TCP 緩衝區，卻不能交給 HTTP/2：TCP 只保證一條按順序的位元組串流，1201–2400 還沒到，後面的位元組就得等。TCP 不知道遺失的那段屬於串流 3、和串流 5 無關，這就是 TCP 層的隊頭阻塞。',
      headers: [h2Data('5', 'END_STREAM'), ...h2Down(2401)],
      tables: [tcpBuffer([['1–1200', DELIVERED], ['1201–2400', '缺（遺失）'], ['2401–3600', '順序不對，暫存']], [1, 2]),
        h2Streams([['1', '/style.css', '1191', '接收中'], ['3', '/app.js', '0', '等待回應'], ['5', '/logo.png', '0', '資料已在緩衝區，被擋住']], [2])] },
    { id: 'dup', from: 'browser', to: 'server', label: 'ACK 1201（重複）',
      note: '瀏覽器的 TCP 只能說「下一個我要 1201」，這是重複 ACK（CN10）。這個區段沒有任何 HTTP/2 訊框，只有 TCP 與 IP 標頭。重複 ACK 累積夠了（或逾時）伺服器才會重送，三個串流至少多等一個 RTT。',
      headers: [tcp('51000', '443', [['序號', '181'], ['確認號', '1201'], ['旗標', 'ACK']]), ipv4(IP.laptop, IP.server)] },
    { id: 'retx', from: 'server', to: 'browser', label: 'DATA 串流 3（重送 TCP 序號 1201）', payload: 'app.js 的前 1191 位元組（重送）',
      note: '缺口補上，TCP 一次把 1201–3600 交給 HTTP/2：app.js 拿到第一段，logo.png 這才完成。logo.png 自己的資料早就到了，卻陪著 app.js 一起等。',
      headers: [h2Data('3', '無'), ...h2Down(1201)],
      tables: [tcpBuffer([['1–1200', DELIVERED], ['1201–2400', DELIVERED], ['2401–3600', DELIVERED]], [1, 2]),
        h2Streams([['1', '/style.css', '1191', '接收中'], ['3', '/app.js', '1191', '接收中'], ['5', '/logo.png', '1191', '完成']], [1, 2])] },
  ],
};

// ---- scene 4: the same loss on HTTP/3 over QUIC -----------------------------------------------------------------
const quicStreams = (rows: string[][], changed: number[]): NodeTable => ({ node: 'browser', name: '串流狀態', head: H2_HEAD, rows, changed });
const quicPackets = (rows: string[][], changed: number[]): NodeTable => ({ node: 'browser', name: '收到的 QUIC 封包', head: ['封包號碼', '內容', '狀態'], rows, changed });
const quic = (cid: string, packet: string, extra: [string, string][]) => ({ layer: 'transport' as const, protocol: 'QUIC（UDP 埠 443）', fields: [
  { name: '目的連線 ID', value: cid }, { name: '封包號碼', value: packet }, ...extra.map(([name, value]) => ({ name, value }))] });
const h3Data = (what: string) => http([['類型', 'DATA'], ['內容', what]], 'HTTP/3');
const UDP = '17（UDP）';
const http3: NetworkScene = {
  id: 'cn15-quic', title: 'HTTP/3 與 QUIC：同樣的遺失只卡住一個串流', model: 'tcp-ip',
  description: '同樣三個資源，改用 HTTP/3。QUIC 跑在 UDP 上，自己負責可靠傳輸、順序與加密（TLS 1.3 內建在 QUIC 裡）。這裡把 QUIC 畫在傳輸層：一個 QUIC 封包有連線 ID 與封包號碼，裡面的 STREAM 訊框帶著串流 ID 與位移（offset）。QUIC 用戶端開的雙向串流 ID 是 0、4、8。每個回應封包和 HTTP/2 的情境一樣帶 1191 位元組的資料，同樣是第二個封包遺失。',
  nodes: [BROWSER, SERVER],
  messages: [
    { id: 'q-req', from: 'browser', to: 'server', label: 'HEADERS：串流 0、4、8',
      note: '三個請求各開一個 QUIC 串流。HTTP/3 的標頭壓縮改用 QPACK，因為串流之間不再保證順序，HPACK 依賴順序的動態表要改寫。',
      headers: [http([['類型', 'HEADERS'], ['請求', 'GET /style.css、/app.js、/logo.png'], ['標頭壓縮', 'QPACK']], 'HTTP/3'),
        quic('c7a2', '1', [['串流 ID', '0、4、8']]), ipv4(IP.laptop, IP.server, UDP)],
      tables: [quicStreams([['0', '/style.css', '0', '等待回應'], ['4', '/app.js', '0', '等待回應'], ['8', '/logo.png', '0', '等待回應']], [0, 1, 2])] },
    { id: 'q1', from: 'server', to: 'browser', label: 'QUIC 封包 1：串流 0', payload: 'style.css 的前段',
      note: '封包 1 到達，串流 0 的資料交給 HTTP/3。',
      headers: [h3Data('style.css 的前段'), quic('9e41', '1', [['串流 ID', '0'], ['位移', '0']]), ipv4(IP.server, IP.laptop, UDP)],
      tables: [quicPackets([['1', '串流 0', '已收到']], [0]),
        quicStreams([['0', '/style.css', '1191', '接收中'], ['4', '/app.js', '0', '等待回應'], ['8', '/logo.png', '0', '等待回應']], [0])] },
    { id: 'q2', from: 'server', to: 'browser', label: 'QUIC 封包 2：串流 4', payload: 'app.js 的前段', lost: true,
      note: '載著 app.js 資料的封包遺失。',
      headers: [h3Data('app.js 的前段'), quic('9e41', '2', [['串流 ID', '4'], ['位移', '0']]), ipv4(IP.server, IP.laptop, UDP)] },
    { id: 'q3', from: 'server', to: 'browser', label: 'QUIC 封包 3：串流 8（FIN）', payload: 'logo.png 的全部',
      note: 'QUIC 只在同一個串流裡保證順序。串流 8 自己的資料從位移 0 開始全部到齊，立刻交給 HTTP/3，logo.png 完成；只有串流 4 在等遺失的資料。對照 HTTP/2 的情境，這一步的 logo.png 是被擋住的。',
      headers: [h3Data('logo.png 的全部'), quic('9e41', '3', [['串流 ID', '8'], ['位移', '0'], ['旗標', 'FIN']]), ipv4(IP.server, IP.laptop, UDP)],
      tables: [quicPackets([['1', '串流 0', '已收到'], ['3', '串流 8', '已收到']], [1]),
        quicStreams([['0', '/style.css', '1191', '接收中'], ['4', '/app.js', '0', '等待（缺位移 0 起的資料）'], ['8', '/logo.png', '1191', '完成']], [2])] },
    { id: 'q-ack', from: 'browser', to: 'server', label: 'ACK：收到封包 1、3',
      note: 'QUIC 的 ACK 訊框直接列出收到的封包號碼範圍。伺服器看到 1 與 3 都到了、2 沒到，經過時間門檻就判定封包 2 遺失。',
      headers: [quic('c7a2', '2', [['ACK 範圍', '1、3']]), ipv4(IP.laptop, IP.server, UDP)] },
    { id: 'q-retx', from: 'server', to: 'browser', label: 'QUIC 封包 4：串流 4（重送的資料）', payload: 'app.js 的前段（重送）',
      note: '重送的是資料，不是封包：同樣的 STREAM 訊框放進新的封包 4。QUIC 的封包號碼永不重複使用，所以 ACK 不會分不清是回應原本的還是重送的封包（TCP 要靠 Karn 演算法避開這個問題）。串流 4 補齊，其他串流從頭到尾沒有等。',
      headers: [h3Data('app.js 的前段'), quic('9e41', '4', [['串流 ID', '4'], ['位移', '0']]), ipv4(IP.server, IP.laptop, UDP)],
      tables: [quicPackets([['1', '串流 0', '已收到'], ['3', '串流 8', '已收到'], ['4', '串流 4（重送）', '已收到']], [2]),
        quicStreams([['0', '/style.css', '1191', '接收中'], ['4', '/app.js', '1191', '接收中'], ['8', '/logo.png', '1191', '完成']], [1])] },
  ],
};

export const CN15: LessonContent = {
  lessonId: 'CN15',
  motivation: '打開一個網頁常常要幾十個檔案，如果每個都從遠方的伺服器重新下載，再快的頻寬也會被一次又一次的往返拖慢。CN12 看過一個 HTTP 請求與回應的樣子；本課看怎麼讓請求變少、變近、變得不互相等待：用 Cache-Control 與 ETag 讓瀏覽器重用已經下載的檔案，用 CDN 把內容放到離使用者幾十毫秒的邊緣節點，再用 HTTP/2 與 HTTP/3 讓許多請求共用一條連線而不互相卡住。學完後，你能為靜態與動態資源寫出合理的快取標頭，並算出加上 CDN 後的延遲改善，例如命中率 0.9 時把 160 ms 降到約 35 ms。',
  sections: [
    {
      id: 'http-cache', title: 'HTTP 快取與 Cache-Control',
      blocks: [
        { type: 'p', text: 'HTTP 快取把回應存起來，下次同一個網址的請求直接用存著的副本。瀏覽器自己有一份私人快取；CDN 與公司的代理伺服器則是很多人共用的共用快取。伺服器在回應裡用 `Cache-Control` 標頭說明這份回應能不能存、能存多久、用之前要不要先問。' },
        { type: 'list', items: [
          '`max-age=N`：從產生回應起 N 秒內，副本是新鮮的（fresh），可以直接用，不必連到伺服器。超過了就變成過期（stale），要先驗證。',
          '`no-cache`：可以存，但每次使用前都要先向伺服器驗證（第 2 節）。適合要立刻看到新版本、但內容不常變的網頁。',
          '`no-store`：任何快取都不得存放，每次都完整下載。用在銀行對帳單這類敏感資料。',
          '`private`：只有使用者自己的瀏覽器可以存，CDN 等共用快取不行，適合個人化的內容；`public`：共用快取也可以存。',
          '`immutable`：新鮮期限內內容絕不會變，連使用者按重新整理都不必驗證。',
        ] },
        { type: 'example', id: 'cn15-browser-cache' },
        { type: 'p', text: '情境的最後一步最重要：新鮮期限內的命中完全沒有網路訊息，不需要 DNS、不需要 TCP 交握、也不必等任何 RTT。這是最快的請求：根本沒有送出去。' },
        { type: 'callout', tone: 'warning', title: '「no-cache 代表不快取」', text: '名字很容易誤會。no-cache 的回應會被存起來，只是每次使用前都要驗證：情境中的 index.html 第 2 天沒有重新下載 5120 位元組，只換回一個沒有內容的 304。真正「不要存」的是 no-store。把敏感資料標成 no-cache，副本其實還留在使用者的磁碟上。' },
      ],
    },
    {
      id: 'revalidation', title: '驗證：ETag、If-None-Match 與 304 Not Modified',
      blocks: [
        { type: 'p', text: '副本過期或標著 no-cache 時，快取不必馬上丟掉它，而是發一個條件式請求問伺服器「我這份還能用嗎」。驗證要有驗證器（validator）：伺服器在回應裡附上 `ETag`（這個版本的識別碼，通常是內容的雜湊或版本號），快取下次把它放進 `If-None-Match`。內容沒變，伺服器回 `304 Not Modified`，沒有內容；變了就回 200 與新內容和新的 ETag。' },
        { type: 'p', text: '另一種較舊的驗證器是 `Last-Modified`（最後修改時間），快取用 `If-Modified-Since` 問。它只精確到秒，一秒內改兩次就分不出來，而且檔案被重新部署但內容沒變時也會讓快取誤以為改了。兩者都有時，伺服器以 If-None-Match 為準。' },
        { type: 'table', head: ['情況', '有沒有網路往返', '傳回的內容'], rows: [
          ['新鮮期限內的命中', '沒有', '快取直接交出副本'],
          ['驗證後沒有改變', '一個 RTT', '304，只有標頭'],
          ['驗證後已經改變', '一個 RTT', '200，完整的新內容'],
          ['沒有副本，或 no-store', '一個 RTT', '200，完整內容'],
        ] },
        { type: 'p', text: '304 省下的是傳輸量，省不掉往返；只有新鮮的命中連往返都省掉。所以要讓檔案「長期新鮮」又能隨時更新，常見做法是雜湊檔名（cache busting）：建置工具把內容雜湊放進檔名，例如 app.3f9a1c.js。內容一改，檔名就變成新的網址，HTML 引用新網址，舊網址的內容永遠不變，因此可以放心給 `max-age=31536000, immutable`。HTML 本身不能改名，所以它用 no-cache 加 ETag，每次花一個 304 確認自己引用的是最新的檔名。' },
      ],
    },
    {
      id: 'header-recipes', title: '為靜態與動態資源設定快取標頭',
      blocks: [
        { type: 'p', text: '設定快取標頭要回答三個問題：內容多久會變、使用者看到舊版本要緊嗎、內容是不是每個人都一樣。下表是常見的配方：' },
        { type: 'table', head: ['資源', '例子', 'Cache-Control', '驗證器', '理由'], rows: [
          ['帶雜湊檔名的靜態檔', 'app.3f9a1c.js、hero.8c2e.jpg、字型', 'public, max-age=31536000, immutable', '可有可無', '內容一改檔名就變，舊網址的內容永遠不變'],
          ['HTML 入口頁', '/index.html', 'no-cache', 'ETag', '要立刻看到新版本；沒變時只花一個 304'],
          ['人人相同、可稍舊的 API', '/api/products（商品列表）', 'public, max-age=60', 'ETag', '最多舊 60 秒，換來瀏覽器與 CDN 都能重用'],
          ['個人化的 API', '/api/profile（我的資料）', 'private, no-cache', 'ETag', '只存在本人瀏覽器，用前驗證；CDN 不可存'],
          ['敏感資料', '銀行對帳單、一次性驗證碼頁', 'no-store', '無', '任何快取都不得存放'],
        ] },
        { type: 'callout', tone: 'tip', title: '沒有雜湊的檔名不要給長 max-age', text: '如果 /app.js 沒有雜湊卻給了一年的 max-age，改版後已經存了舊檔的使用者在一年內都看不到新程式，伺服器也沒有辦法收回已經發出去的副本。只有網址會隨內容改變時，才給長的新鮮期限。' },
        { type: 'p', text: '沒有寫 Cache-Control 時，瀏覽器可能自己猜一個新鮮期限（啟發式新鮮度，例如距離 Last-Modified 時間的十分之一），行為難以預測。所以每種回應都應該明確寫出快取政策，動態內容也一樣。' },
      ],
    },
    {
      id: 'cdn', title: 'CDN：邊緣節點、回源與快取命中率',
      blocks: [
        { type: 'p', text: 'CDN（內容傳遞網路）在世界各地放了許多邊緣節點（edge server），用 DNS 或 anycast 把使用者導到最近的一個。邊緣節點是共用快取：命中（hit）時直接回應，未命中（miss）時代替使用者向來源伺服器要，這叫回源（origin pull），拿到後依 Cache-Control 存起來，下一位使用者就能命中。' },
        { type: 'example', id: 'cn15-cdn' },
        { type: 'p', text: '快取命中率 h 是命中的請求占全部請求的比例。一個請求算一個 RTT 時，命中只要邊緣 RTT，未命中要邊緣 RTT 再加回源的 RTT，所以：期望延遲 = h × 邊緣 RTT +（1 − h）×（邊緣 RTT + 來源 RTT）。以情境的數字，邊緣 RTT 20 ms、邊緣到來源 150 ms，h = 0.9 時期望延遲 = 0.9 × 20 + 0.1 × 170 = 18 + 17 = 35 ms。' },
        { type: 'table', head: ['命中率', '期望延遲', '和不經 CDN（160 ms）相比'], rows: [
          ['0', '170 ms', '慢 10 ms'], ['0.5', '95 ms', '快 65 ms'], ['0.9', '35 ms', '快 125 ms'], ['0.95', '27.5 ms', '快 132.5 ms']] },
        { type: 'p', text: '公式可以整理成 邊緣 RTT +（1 − h）× 來源 RTT：每一次未命中都要多付一趟回源。命中率 0 時 CDN 反而比直接連來源慢（170 對 160 ms），因為多繞了一站；命中率從 0.9 提高到 0.95，期望延遲從 35 ms 降到 27.5 ms。CDN 也減輕來源伺服器的負載：每天 1000000 個請求、命中率 0.9，只有 100000 個要回源。' },
        { type: 'list', items: [
          '提高命中率的做法：靜態檔用雜湊檔名與長 max-age；不要讓每個請求都帶不同的查詢字串；共用快取不可存的 private 回應，只用在真正個人化的內容。',
          '內容要提早更新時，可以請 CDN 清除（purge）特定網址；但更穩當的做法仍是換新的雜湊檔名。',
          '動態、個人化的回應通常不經 CDN 快取，但 CDN 仍能幫忙：使用者在附近的邊緣完成 TCP 與 TLS 交握，邊緣再用早就建好的連線回源。',
        ] },
      ],
    },
    {
      id: 'http2', title: 'HTTP/1.1 的隊頭阻塞與 HTTP/2 多工',
      blocks: [
        { type: 'p', text: 'HTTP/1.1 的一條連線上，回應必須依請求的順序一個一個回來：前一個回應很大或很慢，後面的就得排隊，這是 HTTP 層的隊頭阻塞（head-of-line blocking）。管線化（pipelining）允許先送多個請求，但回應仍要照順序，實務上幾乎沒有瀏覽器啟用。瀏覽器只好對每個來源開約 6 條平行連線，網站則把小圖拼成一張、把檔案分散到多個網域，來繞過這個限制。' },
        { type: 'p', text: 'HTTP/2 改用二進位訊框（binary framing）：每個請求與回應是一個串流（stream），切成 HEADERS 與 DATA 等訊框，每個訊框標頭都寫著它屬於哪個串流 ID。許多串流的訊框可以在同一條 TCP 連線上交錯傳送，接收端依串流 ID 重新組回來，這就是 HTTP/2 多工（multiplexing）。標頭用 HPACK 壓縮：雙方各維護一張表，重複的標頭只送索引。一條連線就夠了，也只要做一次 TCP 與 TLS 交握。' },
        { type: 'example', id: 'cn15-http2-hol' },
        { type: 'callout', tone: 'warning', title: '「HTTP/2 解決了所有的隊頭阻塞」', text: 'HTTP/2 只解決了 HTTP 層的隊頭阻塞：回應不必照請求順序回來。但所有串流仍擠在一條 TCP 連線裡，而 TCP 只提供一條按順序的位元組串流。情境中遺失的區段屬於串流 3，logo.png 的資料早就到了，仍要等重送。遺失率高的行動網路上，HTTP/2 的一條連線甚至可能比 HTTP/1.1 的六條連線更慢：六條連線時，一個遺失只卡住一條。' },
      ],
    },
    {
      id: 'http3', title: 'HTTP/3 與 QUIC：逐串流復原、1-RTT 交握與連線遷移',
      blocks: [
        { type: 'p', text: 'HTTP/3 不再用 TCP，而是跑在 QUIC 上，QUIC 再跑在 UDP 上。UDP 只提供連接埠與檢查碼，可靠傳輸、壅塞控制、串流與加密都由 QUIC 自己做。關鍵在於 QUIC 認得串流：它只在同一個串流裡保證順序，所以一個封包遺失只卡住它所屬的串流。' },
        { type: 'example', id: 'cn15-quic' },
        { type: 'p', text: 'QUIC 還把傳輸交握與 TLS 1.3 交握合在一起。TCP 加 TLS 1.3 要先花 1 RTT 做 TCP 三向交握、再花 1 RTT 做 TLS，才能送出第一個請求；QUIC 只要 1 RTT。直接連到 RTT 160 ms 的來源，TCP 加 TLS 1.3 要 320 ms 後才能送請求，回應最早在 480 ms 到；QUIC 是 160 ms 與 320 ms。連過的伺服器還能用 0-RTT 在第一個封包就帶請求，但 0-RTT 的資料可能被重放，只適合 GET 這類重複執行也無害的請求。' },
        { type: 'p', text: 'TCP 連線由來源 IP、來源埠、目的 IP、目的埠認定，手機從 Wi-Fi 換到行動網路、IP 一變，連線就斷了。QUIC 連線由連線 ID 認定，換了網路仍帶著同一個連線 ID，伺服器驗證新路徑後繼續傳，這叫連線遷移（connection migration）。另外，有些網路會擋 UDP 443，瀏覽器發現 HTTP/3 連不上時會改用 HTTP/2；伺服器則用 `Alt-Svc` 標頭或 DNS 的 HTTPS 紀錄告訴瀏覽器自己支援 HTTP/3。' },
        { type: 'table', head: ['比較項目', 'HTTP/1.1', 'HTTP/2', 'HTTP/3'], rows: [
          ['傳輸層', 'TCP（加 TLS）', 'TCP（加 TLS）', 'QUIC（內建 TLS 1.3），跑在 UDP 上'],
          ['一條連線上的請求', '一次一個回應，依序；瀏覽器每個來源約開 6 條連線', '許多串流交錯在同一條連線', '許多串流，彼此獨立'],
          ['訊息格式', '文字', '二進位訊框', '二進位訊框'],
          ['標頭壓縮', '無', 'HPACK', 'QPACK'],
          ['隊頭阻塞', 'HTTP 層與 TCP 層都有', 'HTTP 層解決，TCP 層仍在', '只影響遺失資料所屬的串流'],
          ['新連線到能送請求', 'TCP 1 RTT + TLS 1.3 1 RTT = 2 RTT', '2 RTT', '1 RTT（連過的伺服器可 0-RTT）'],
          ['換網路（IP 改變）', '連線中斷，重新交握', '連線中斷，重新交握', '連線 ID 不變，連線遷移'],
        ] },
        { type: 'callout', tone: 'warning', title: '「HTTP/3 走 UDP，所以不可靠」', text: 'UDP 本身不重送，但 QUIC 在 UDP 之上自己做了確認、重送與壅塞控制：情境中遺失的資料一樣被補回來，只是放進新的封包號碼。選 UDP 是因為作業系統與網路設備都已支援它，QUIC 可以在應用程式裡實作與更新，不必等每台電腦的核心換掉 TCP。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    { id: 'q-no-cache', prompt: '回應標頭是 `Cache-Control: no-cache` 與一個 ETag。瀏覽器下次要用這個網址時會怎麼做？',
      options: ['完全不存，每次都下載完整內容', '用存著的副本，但先帶 If-None-Match 向伺服器驗證', '在預設的新鮮期限內直接使用副本，不連網路', '只有使用者按重新整理時才重新下載'], answer: 1,
      explanation: 'no-cache 表示可以存，但每次使用前都要驗證：帶 If-None-Match 問伺服器，沒變就回 304，沿用副本。「完全不存」是 no-store 的意思；直接使用副本要有新鮮期限（max-age），no-cache 等於沒有新鮮期；驗證和使用者按不按重新整理無關，每次使用都要做。' },
    { id: 'q-no-store', prompt: '網路銀行的「本月對帳單」頁面，最合適的快取標頭是哪一個？',
      options: ['`Cache-Control: public, max-age=3600`', '`Cache-Control: private, max-age=86400`', '`Cache-Control: no-cache`', '`Cache-Control: no-store`'], answer: 3,
      explanation: '敏感資料不應該留在任何快取裡，no-store 禁止瀏覽器與共用快取存放。public 讓 CDN 也能存，別人可能拿到；private 雖然只存在本人瀏覽器，但一天內都會直接用，而且副本留在磁碟上；no-cache 仍會存下副本，只是用前驗證，敏感內容還是留在磁碟上。' },
    { id: 'q-hash', prompt: '為什麼 app.3f9a1c.js 這種帶雜湊的檔名可以放心設 `max-age=31536000, immutable`？',
      options: ['內容一改檔名就變，所以同一個網址的內容永遠不會變', '瀏覽器看到檔名裡的雜湊，會自動檢查內容有沒有改', 'immutable 讓伺服器在檔案改變時主動通知瀏覽器', 'CDN 會在一年內自動清除舊的副本'], answer: 0,
      explanation: '雜湊來自檔案內容，程式一改就產生新檔名，HTML 改引用新網址，舊網址的內容從此不會再變，存一年也不會拿到錯的版本。瀏覽器不會解讀檔名裡的雜湊；HTTP 沒有伺服器主動通知快取失效的機制，immutable 只是說「期限內不必驗證」；CDN 不會因為檔名自動清除副本，也不需要。' },
    { id: 'q-cdn-latency', prompt: '使用者到 CDN 邊緣的 RTT 是 10 ms，邊緣到來源的 RTT 是 100 ms，命中率 0.8。依「期望延遲 = h × 邊緣 RTT +（1 − h）×（邊緣 RTT + 來源 RTT）」，每個請求的期望延遲是多少？',
      options: ['28 ms', '20 ms', '30 ms', '8 ms'], answer: 2,
      explanation: '0.8 × 10 + 0.2 × (10 + 100) = 8 + 22 = 30 ms，也就是 10 + 0.2 × 100。28 ms 是未命中時只算了 100 ms、忘了先到邊緣的 10 ms；20 ms 只算了未命中的回源部分；8 ms 只算了命中的部分。' },
    { id: 'q-h2-loss', prompt: 'HTTP/2 連線上同時有三個串流在下載，其中一個 TCP 區段（屬於串流 3）遺失。在重送到達之前會怎樣？',
      options: ['只有串流 3 停住，其他串流照常交給瀏覽器', '三個串流都停住，因為 TCP 要等缺口補上才能交出後面的位元組', 'HTTP/2 會自動把串流 3 改用另一條連線重送', '不受影響，HTTP/2 的訊框有自己的重送機制'], answer: 1,
      explanation: '所有串流共用一條 TCP 連線，TCP 只交出按順序的位元組，缺口之後的資料不管屬於哪個串流都要等，這是 TCP 層的隊頭阻塞。只卡住一個串流是 HTTP/3（QUIC）的行為；HTTP/2 不會換連線重送；HTTP/2 本身沒有重送，可靠傳輸完全交給 TCP。' },
    { id: 'q-quic-handshake', prompt: '和 TCP 加 TLS 1.3 相比，HTTP/3 的新連線為什麼能早一個 RTT 送出請求？',
      options: ['QUIC 把傳輸交握與 TLS 1.3 交握合併，1 RTT 就完成', 'UDP 比 TCP 的封包小，所以傳得比較快', 'HTTP/3 不加密，省掉了 TLS 交握', 'QUIC 用 HPACK 壓縮標頭，交握訊息變少'], answer: 0,
      explanation: 'TCP 要先三向交握（1 RTT），TLS 1.3 再交握（1 RTT）；QUIC 把兩者合在同一組封包裡，1 RTT 後就能送請求。封包大小影響的是傳輸延遲，不會少一個往返；QUIC 一定加密，TLS 1.3 就內建在裡面；HTTP/3 用的是 QPACK，而且標頭壓縮與交握次數無關。' },
    { id: 'q-private', prompt: '`/api/profile` 回傳使用者自己的資料，標頭是 `Cache-Control: private, no-cache`。這對 CDN 的意思是什麼？',
      options: ['CDN 可以存，但每次用前要回源驗證', 'CDN 可以存 60 秒', 'CDN 不可以存，只有使用者的瀏覽器可以存', 'CDN 必須存，瀏覽器不可以存'], answer: 2,
      explanation: 'private 表示回應屬於單一使用者，只有私人快取（瀏覽器）能存，CDN 這種共用快取不能存，否則可能把 A 的資料給 B。「可以存但要驗證」只描述了 no-cache 對瀏覽器的效果；標頭裡沒有 60 秒的新鮮期限；private 的規定正好相反，是瀏覽器可以存、共用快取不可以。' },
    { id: 'q-migration', prompt: '手機用 HTTP/3 看影片，從 Wi-Fi 走到戶外改用行動網路，IP 位址改變了。連線會怎樣？',
      options: ['一定中斷，要重新做 TCP 三向交握', '一定中斷，因為 UDP 沒有連線的概念', 'QUIC 改用 TCP 重新連線', 'QUIC 以連線 ID 認定連線，換了 IP 仍可延續（連線遷移）'], answer: 3,
      explanation: 'QUIC 連線用連線 ID 認定，不像 TCP 綁在來源與目的的 IP 和連接埠上，換網路後帶著同一個連線 ID 繼續傳。HTTP/3 不使用 TCP，也就沒有三向交握；UDP 本身沒有連線，但 QUIC 在它之上建立了自己的連線；QUIC 不會改用 TCP，只有完全連不上時瀏覽器才改用 HTTP/2。' },
  ],
  network: {
    scenes: [browserCache, cdn, http2, http3],
    exercises: [
      { id: 'cn15-ex-304', task: 'field', scene: 'cn15-browser-cache', message: 're-html-304', layer: 'application', field: '狀態碼',
        title: '驗證成功的狀態碼',
        statement: '在「瀏覽器快取」情境中，第 2 天瀏覽器帶著 If-None-Match: "h-41" 驗證 /index.html，伺服器的網頁沒有改過。伺服器回應的 HTTP 狀態碼是多少（只填數字）？',
        hints: ['條件式請求問的是「我這份還能用嗎」。', '內容沒變時，伺服器不必再傳一次內容。'],
        explanation: 'ETag 相符，表示快取的副本就是目前的版本，伺服器回 304 Not Modified，不帶內容，快取沿用副本並更新驗證時間。',
        mistakes: [
          { answer: { value: '200' }, why: '以為驗證後會重新下載：只有內容改變時才回 200 與新內容。' },
          { answer: { value: '204' }, why: '把 304 當成 204 No Content：204 是「成功但沒有內容」，不表示可以沿用快取的副本。' },
        ] },
      { id: 'cn15-ex-age', task: 'field', scene: 'cn15-cdn', message: 'b-resp', layer: 'application', field: 'Age',
        title: 'CDN 命中時的 Age',
        statement: '在「CDN 邊緣節點」情境中，邊緣在 10:00:00 回源存下 hero.8c2e.jpg，使用者 B 在 10:05:00 命中。邊緣給使用者 B 的回應裡，Age 標頭的值是多少（秒）？',
        hints: ['Age 是副本在快取裡已經待了多久。', '從存入到取用經過了幾秒？'],
        explanation: '從 10:00:00 存入到 10:05:00 取用是 5 分鐘，也就是 300 秒，所以 Age: 300。瀏覽器會把 Age 算進新鮮度：max-age 減掉 Age，才是副本在瀏覽器裡還能新鮮多久。',
        mistakes: [
          { answer: { value: '0' }, why: '以為命中時也是剛拿到的：Age 0 是未命中、剛回源時的值。' },
          { answer: { value: '31536000' }, why: '填了 max-age：那是新鮮期限的上限，不是已經存了多久。' },
          { answer: { value: '5' }, why: '單位錯了：Age 以秒計，5 分鐘是 300 秒。' },
        ] },
      { id: 'cn15-ex-expected', task: 'table', scene: 'cn15-cdn', message: 'b-resp', node: 'user-b', table: '期望延遲', row: '0.9', column: '期望延遲（毫秒）',
        title: '命中率 0.9 的期望延遲',
        statement: '同一個情境中，使用者到邊緣的 RTT 是 20 ms，邊緣到來源的 RTT 是 150 ms。依「期望延遲 = h × 邊緣 RTT +（1 − h）×（邊緣 RTT + 來源 RTT）」，命中率 h = 0.9 時，每個請求的期望延遲是多少毫秒（只填數字）？',
        hints: ['命中只要邊緣 RTT；未命中要先到邊緣，再回源。', '也可以寫成 邊緣 RTT +（1 − h）× 來源 RTT。'],
        explanation: '0.9 × 20 + 0.1 × (20 + 150) = 18 + 17 = 35 ms。不經 CDN 是 160 ms，所以每個請求平均快了 125 ms。',
        mistakes: [
          { answer: { cell: '33' }, why: '未命中時只算了回源的 150 ms，忘了請求要先到邊緣：未命中的延遲是 20 + 150。' },
          { answer: { cell: '34' }, why: '未命中時用了使用者直接連來源的 160 ms：經過 CDN 時，未命中走的是 使用者 → 邊緣 → 來源。' },
          { answer: { cell: '20' }, why: '只算了命中的情況：命中率 0.9 表示還有 10% 的請求要回源。' },
        ] },
      { id: 'cn15-ex-trips', task: 'table', scene: 'cn15-browser-cache', message: 're-js-hit', node: 'cache', table: '網路往返紀錄', row: '累計往返次數', column: '次數',
        title: '兩天一共上了幾次網路',
        statement: '在「瀏覽器快取」情境中，第 1 天下載了 /index.html 與 /assets/app.3f9a1c.js，第 2 天再用同樣兩個檔案。到最後一步（快取交回 app.3f9a1c.js）為止，瀏覽器一共送了幾次請求到網路上？',
        hints: ['第 1 天快取是空的，兩個檔案都要下載。', 'no-cache 的檔案每次使用前都要驗證；驗證也是一次網路往返。', '新鮮期限內的 immutable 檔案呢？'],
        explanation: '第 1 天兩次（index.html 與 app.3f9a1c.js）；第 2 天 index.html 是 no-cache，要驗證一次換回 304；app.3f9a1c.js 還在一年的新鮮期限內，直接從快取交出，沒有網路訊息。所以一共 3 次。',
        mistakes: [
          { answer: { cell: '4' }, why: '以為 app.3f9a1c.js 第 2 天也要問伺服器：新鮮期限內的命中不送任何請求。' },
          { answer: { cell: '2' }, why: '以為 no-cache 的 index.html 第 2 天也直接用副本：no-cache 每次使用前都要驗證，那是一次往返，只是回應是 304。' },
        ] },
      { id: 'cn15-ex-stream', task: 'field', scene: 'cn15-http2-hol', message: 'd3', layer: 'application', field: '串流 ID',
        title: 'HTTP/2 訊框的串流 ID',
        statement: '在「HTTP/2 多工」情境中，logo.png 是瀏覽器在這條連線上開的第三個串流，前兩個是 style.css 與 app.js。伺服器送回 logo.png 資料的 DATA 訊框，訊框標頭裡的串流 ID 是多少？',
        hints: ['HTTP/2 用戶端開的串流 ID 是奇數，由小到大。', '偶數的串流 ID 保留給伺服器開的串流。'],
        explanation: '用戶端開的串流依序是 1、3、5，所以第三個是 5。回應和請求用同一個串流 ID，接收端就是靠這個欄位把交錯的訊框分回各自的資源。',
        mistakes: [
          { answer: { value: '3' }, why: '把串流 ID 當成 1、2、3 的流水號：用戶端的串流只用奇數，3 是第二個（app.js）。' },
          { answer: { value: '6' }, why: '偶數 ID 是伺服器開的串流，用戶端的請求不會用到。' },
          { answer: { value: '1' }, why: '以為一條連線只有一個串流：HTTP/2 的重點就是許多串流共用一條連線。' },
        ] },
    ],
  },
};
