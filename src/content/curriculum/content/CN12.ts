import type { NetworkScene, NodeTable, ProtocolHeader } from '@/lib/network/model';
import type { LessonContent } from '../schema';

/*
 * CN12 DNS and HTTP (CN-3, packet-journey). Three fixed scenes on the TCP/IP model:
 *   1. A full recursive resolution of www.example.com A: stub resolver (RD=1) → recursive resolver → root → .com TLD →
 *      authoritative server with iterative queries (RD=0), referrals carrying NS records in the authority section and
 *      glue in the additional section, AA=1 only from the authoritative server, RA=1 from the recursive resolver. 120
 *      seconds later a second host asks A (a cache hit, TTL counted down to 180) and AAAA (not cached, but the cached
 *      example.com delegation sends the resolver straight to ns1.example.com). The resolver's cache is the node table.
 *   2. One page load: http://www.example.com/ → 301 to https://, then GET / → 200 HTML, GET /style.css → 200 and
 *      GET /logo.png → 404 on the same persistent HTTP/1.1 connection. The browser's connections are the node table.
 *   3. Login: POST /login → 302 with Set-Cookie (host-only, HttpOnly, Secure, SameSite=Lax), GET /account sending the
 *      Cookie header, and an image request to example.net that carries no cookie. The cookie jar is the node table.
 * All DNS traffic is UDP 53. The root and .com server names are the real public names; their addresses, like every
 * other address here, are RFC 5737 (IPv4) and RFC 3849 (IPv6, 2001:db8::/32) documentation addresses. TCP and TLS
 * handshakes are left out (CN09 and a later lesson); HTTP on port 443 is drawn as it is after TLS decryption.
 */

// ---- headers -------------------------------------------------------------------------------------------------------
/** The IPv4 header; DNS here rides on UDP (protocol 17), HTTP on TCP (protocol 6). */
const ipv4 = (from: string, to: string, protocol: 'UDP' | 'TCP'): ProtocolHeader => ({ layer: 'network', protocol: 'IPv4', fields: [
  { name: '來源 IP', value: from }, { name: '目的 IP', value: to }, { name: '協定', value: protocol === 'UDP' ? '17（UDP）' : '6（TCP）' }] });
const udp = (from: string, to: string): ProtocolHeader => ({ layer: 'transport', protocol: 'UDP', fields: [
  { name: '來源連接埠', value: from }, { name: '目的連接埠', value: to }] });
const tcp = (from: string, to: string): ProtocolHeader => ({ layer: 'transport', protocol: 'TCP', fields: [
  { name: '來源連接埠', value: from }, { name: '目的連接埠', value: to }] });

/** A DNS query: the ID pairs it with its response; RD=1 asks for recursion (stub to resolver), RD=0 is iterative. */
const dnsQuery = (id: string, rd: 0 | 1, question: string): ProtocolHeader => ({ layer: 'application', protocol: 'DNS', fields: [
  { name: 'ID', value: id }, { name: 'QR', value: '0（查詢）' }, { name: 'RD', value: String(rd) }, { name: '問題', value: question }] });
/** A DNS response: QR=1, RD copied from the query; a referral has an empty answer and NS records plus glue. */
const dnsResponse = (id: string, flags: { aa: 0 | 1; rd: 0 | 1; ra: 0 | 1 }, question: string, sections: { answer?: string; authority?: string; additional?: string }): ProtocolHeader => ({
  layer: 'application', protocol: 'DNS', fields: [
    { name: 'ID', value: id }, { name: 'QR', value: '1（回應）' }, { name: 'AA', value: String(flags.aa) }, { name: 'RD', value: String(flags.rd) },
    { name: 'RA', value: String(flags.ra) }, { name: '問題', value: question },
    { name: '答案', value: sections.answer ?? '（空：這是轉介，不是答案）' },
    ...sections.authority ? [{ name: '權威區段', value: sections.authority }] : [],
    ...sections.additional ? [{ name: '附加區段', value: sections.additional }] : []] });

// ---- scene 1: a full recursive resolution, then the cache ----------------------------------------------------------
const LAPTOP = '192.0.2.25', PHONE = '192.0.2.31', RESOLVER = '198.51.100.53';
const ROOT = '203.0.113.4', TLD = '203.0.113.30', AUTH = '203.0.113.53';
const QA = 'www.example.com A', QAAAA = 'www.example.com AAAA';

/** The recursive resolver's cache: the record (name and type), its data and the seconds it may still be kept. */
const CACHE_HEAD = ['紀錄', '值', '剩餘 TTL（秒）'];
const cache = (rows: string[][], changed?: number[]): NodeTable[] => [{ node: 'resolver', name: '解析器快取', head: CACHE_HEAD, rows, ...changed ? { changed } : {} }];
const comNs = (ttl: number) => ['com. NS', 'a.gtld-servers.net（共 13 個名稱，只列一個）', String(ttl)];
const comGlue = (ttl: number) => ['a.gtld-servers.net A', TLD, String(ttl)];
const exampleNs = (ttl: number) => ['example.com NS', 'ns1.example.com', String(ttl)];
const exampleGlue = (ttl: number) => ['ns1.example.com A', AUTH, String(ttl)];
const wwwA = (ttl: number) => ['www.example.com A', '203.0.113.80', String(ttl)];
const wwwAAAA = (ttl: number) => ['www.example.com AAAA', '2001:db8::80', String(ttl)];
/** Two minutes later every entry has counted down 120 seconds. */
const LATER = [comNs(172680), comGlue(172680), exampleNs(172680), exampleGlue(172680), wwwA(180)];

/** Sections 2–3. */
const recursive: NetworkScene = {
  id: 'cn12-dns-recursive', title: '一次完整的遞迴解析，與兩分鐘後的快取', model: 'tcp-ip',
  description: '筆電（192.0.2.25）第一次要連 www.example.com，向電信業者的遞迴解析器（198.51.100.53）查 IPv4 位址。解析器剛開機，快取是空的，只有內建的根伺服器位址（根提示），只好從根開始一路問下去。120 秒後，同一個網路的手機（192.0.2.31）也要連這個網站，同時查 A 與 AAAA。所有查詢都走 UDP 53；根與 .com 伺服器的名稱是真實的公開名稱，位址則換成文件專用的範例位址。表格是解析器的快取，從它收到第一個回應開始出現。',
  nodes: [
    { id: 'laptop', label: '筆電', kind: 'host', addresses: [`IP ${LAPTOP}`, 'stub 解析程式'] },
    { id: 'phone', label: '手機', kind: 'host', addresses: [`IP ${PHONE}`] },
    { id: 'resolver', label: '遞迴解析器', kind: 'resolver', addresses: [`IP ${RESOLVER}`, 'UDP 53'] },
    { id: 'root', label: '根伺服器', kind: 'resolver', addresses: ['a.root-servers.net', `IP ${ROOT}（示意）`] },
    { id: 'tld', label: '.com TLD 伺服器', kind: 'resolver', addresses: ['a.gtld-servers.net', `IP ${TLD}（示意）`] },
    { id: 'auth', label: 'example.com 權威伺服器', kind: 'resolver', addresses: ['ns1.example.com', `IP ${AUTH}`] },
  ],
  messages: [
    { id: 'q-laptop', from: 'laptop', to: 'resolver', label: '遞迴查詢：A www.example.com（RD=1）',
      headers: [dnsQuery('0x3f2a', 1, QA), udp('53001', '53'), ipv4(LAPTOP, RESOLVER, 'UDP')],
      note: '瀏覽器與作業系統的快取裡都沒有 www.example.com，作業系統的 stub 解析程式把問題交給 DHCP 設定的遞迴解析器。RD=1（Recursion Desired）表示「請你負責拿到最後的答案」。解析器查自己的快取：沒有 www.example.com，也沒有 example.com 或 com 的委派，只能從根提示裡的根伺服器開始。' },
    { id: 'q-root', from: 'resolver', to: 'root', label: '迭代查詢：問根（RD=0）',
      headers: [dnsQuery('0x91c4', 0, QA), udp('41237', '53'), ipv4(RESOLVER, ROOT, 'UDP')],
      note: '解析器對根伺服器送出迭代查詢，RD=0：只要對方回答它知道的最好資訊。來源連接埠 41237 與 ID 0x91c4 都是隨機挑的，偽造回應的攻擊者必須同時猜中兩者，回應才會被接受。' },
    { id: 'r-root', from: 'root', to: 'resolver', label: '根：去問 .com 的伺服器（轉介）',
      headers: [dnsResponse('0x91c4', { aa: 0, rd: 0, ra: 0 }, QA, {
        authority: 'com. NS a.gtld-servers.net 等 13 筆（TTL 172800）',
        additional: `a.gtld-servers.net A ${TLD} 等（TTL 172800）` }), udp('53', '41237'), ipv4(ROOT, RESOLVER, 'UDP')],
      note: '根伺服器沒有 www.example.com 的紀錄，但知道 com 委派給哪些伺服器：答案區段是空的，權威區段放 com 的 NS 紀錄，附加區段附上這些名稱伺服器的位址（膠合紀錄，glue），解析器不必再另外查 a.gtld-servers.net 的位址。AA=0（根不是 example.com 的權威），RA=0（根伺服器不替人遞迴），RD 照抄查詢的 0。兩筆紀錄都進了快取，TTL 172800 秒是兩天。',
      tables: cache([comNs(172800), comGlue(172800)], [0, 1]) },
    { id: 'q-tld', from: 'resolver', to: 'tld', label: '迭代查詢：問 .com（RD=0）',
      headers: [dnsQuery('0x5e07', 0, QA), udp('50918', '53'), ipv4(RESOLVER, TLD, 'UDP')],
      note: '解析器照著轉介，把同一個問題送到 .com 的 TLD 伺服器 203.0.113.30，換了新的隨機 ID 與來源連接埠。',
      tables: cache([comNs(172800), comGlue(172800)]) },
    { id: 'r-tld', from: 'tld', to: 'resolver', label: '.com：去問 ns1.example.com（轉介）',
      headers: [dnsResponse('0x5e07', { aa: 0, rd: 0, ra: 0 }, QA, {
        authority: 'example.com NS ns1.example.com（TTL 172800）',
        additional: `ns1.example.com A ${AUTH}（TTL 172800）` }), udp('53', '50918'), ipv4(TLD, RESOLVER, 'UDP')],
      note: '.com 伺服器也只知道委派：example.com 由 ns1.example.com 負責（實際的網域通常至少登記兩台，這裡只畫一台），附加區段給出它的位址 203.0.113.53。仍然是 AA=0、答案區段是空的。快取又多了兩筆。',
      tables: cache([comNs(172800), comGlue(172800), exampleNs(172800), exampleGlue(172800)], [2, 3]) },
    { id: 'q-auth', from: 'resolver', to: 'auth', label: '迭代查詢：問權威伺服器（RD=0）',
      headers: [dnsQuery('0xb21d', 0, QA), udp('33461', '53'), ipv4(RESOLVER, AUTH, 'UDP')],
      note: '第三次迭代查詢，送到 example.com 的權威伺服器 ns1.example.com（203.0.113.53）。',
      tables: cache([comNs(172800), comGlue(172800), exampleNs(172800), exampleGlue(172800)]) },
    { id: 'r-auth', from: 'auth', to: 'resolver', label: '權威回答：203.0.113.80（AA=1）',
      headers: [dnsResponse('0xb21d', { aa: 1, rd: 0, ra: 0 }, QA, { answer: 'www.example.com A 203.0.113.80（TTL 300）' }), udp('53', '33461'), ipv4(AUTH, RESOLVER, 'UDP')],
      note: '權威伺服器的區域裡有這筆紀錄，直接回答，並設 AA=1（Authoritative Answer）。TTL 300 是 example.com 的管理者設定的：這筆答案最多可以被快取 5 分鐘。',
      tables: cache([comNs(172800), comGlue(172800), exampleNs(172800), exampleGlue(172800), wwwA(300)], [4]) },
    { id: 'a-laptop', from: 'resolver', to: 'laptop', label: '回答筆電：203.0.113.80（RA=1）',
      headers: [dnsResponse('0x3f2a', { aa: 0, rd: 1, ra: 1 }, QA, { answer: 'www.example.com A 203.0.113.80（TTL 300）' }), udp('53', '53001'), ipv4(RESOLVER, LAPTOP, 'UDP')],
      note: '解析器用筆電原本的 ID 0x3f2a 回答：RD=1 照抄，RA=1 表示它提供遞迴服務，AA=0 因為解析器不是 example.com 的權威伺服器，只是轉述。筆電這邊只花了一個往返，解析器則替它跑了三趟。作業系統也把答案快取 300 秒，接著瀏覽器就能對 203.0.113.80 建立 TCP 連線。',
      tables: cache([comNs(172800), comGlue(172800), exampleNs(172800), exampleGlue(172800), wwwA(300)]) },
    { id: 'q-phone-a', from: 'phone', to: 'resolver', label: '120 秒後，手機：A www.example.com（RD=1）',
      headers: [dnsQuery('0x7a10', 1, QA), udp('60111', '53'), ipv4(PHONE, RESOLVER, 'UDP')],
      note: '120 秒後，手機也要連 www.example.com。這段時間裡快取的每一筆都倒數了 120 秒：www.example.com A 剩 300 − 120 = 180 秒，委派的紀錄剩 172680 秒，都還有效。',
      tables: cache(LATER) },
    { id: 'a-phone-a', from: 'resolver', to: 'phone', label: '快取命中：203.0.113.80（TTL 180）',
      headers: [dnsResponse('0x7a10', { aa: 0, rd: 1, ra: 1 }, QA, { answer: 'www.example.com A 203.0.113.80（TTL 180）' }), udp('53', '60111'), ipv4(RESOLVER, PHONE, 'UDP')],
      note: '快取命中：解析器直接回答，沒有對根、TLD 或權威伺服器送出任何封包。答案的 TTL 是剩下的 180 秒而不是原本的 300，所以手機最多再快取 180 秒，和解析器的這一筆在同一個時間點到期。AA 仍然是 0。',
      tables: cache(LATER) },
    { id: 'q-phone-aaaa', from: 'phone', to: 'resolver', label: '手機：AAAA www.example.com（RD=1）',
      headers: [dnsQuery('0x7a11', 1, QAAAA), udp('60112', '53'), ipv4(PHONE, RESOLVER, 'UDP')],
      note: '手機同時要 IPv6 位址。快取裡有 www.example.com 的 A，卻沒有 AAAA：不同類型是不同的紀錄，要分開查。不過 example.com 的委派（NS 與 ns1.example.com 的位址）還在快取裡。',
      tables: cache(LATER) },
    { id: 'q-auth-aaaa', from: 'resolver', to: 'auth', label: '跳過根與 TLD：直接問 ns1.example.com',
      headers: [dnsQuery('0x0c88', 0, QAAAA), udp('45890', '53'), ipv4(RESOLVER, AUTH, 'UDP')],
      note: '解析器從快取知道 example.com 歸 ns1.example.com（203.0.113.53）管，直接問它，根與 .com 伺服器都不用再問。快取裡最「近」的委派決定從哪裡開始。',
      tables: cache(LATER) },
    { id: 'r-auth-aaaa', from: 'auth', to: 'resolver', label: '權威回答：2001:db8::80（AA=1）',
      headers: [dnsResponse('0x0c88', { aa: 1, rd: 0, ra: 0 }, QAAAA, { answer: 'www.example.com AAAA 2001:db8::80（TTL 300）' }), udp('53', '45890'), ipv4(AUTH, RESOLVER, 'UDP')],
      note: '權威伺服器回答 IPv6 位址 2001:db8::80，AA=1、TTL 300。這筆新紀錄從 300 秒開始倒數，和 A 那一筆的 180 秒互不相干。',
      tables: cache([...LATER, wwwAAAA(300)], [5]) },
    { id: 'a-phone-aaaa', from: 'resolver', to: 'phone', label: '回答手機：2001:db8::80',
      headers: [dnsResponse('0x7a11', { aa: 0, rd: 1, ra: 1 }, QAAAA, { answer: 'www.example.com AAAA 2001:db8::80（TTL 300）' }), udp('53', '60112'), ipv4(RESOLVER, PHONE, 'UDP')],
      note: '手機拿到 A 與 AAAA 兩個位址。同時有 IPv4 與 IPv6 時，瀏覽器通常先試 IPv6，短時間內連不上再改用 IPv4。整個情境裡，根伺服器只被問了一次。',
      tables: cache([...LATER, wwwAAAA(300)]) },
  ],
};

// ---- scene 2: one page load -----------------------------------------------------------------------------------------
const WEB = '203.0.113.80';
const UA = 'Mozilla/5.0（瀏覽器的名稱與版本）';
const CONN_HEAD = ['連線', '目的', '已送請求'];
const CONN_A = (n: number) => ['A（本機 52001）', `${WEB}:80`, String(n)];
const CONN_B = (n: number) => ['B（本機 52002）', `${WEB}:443`, String(n)];
const conns = (rows: string[][], changed?: number[]): NodeTable[] => [{ node: 'browser', name: '瀏覽器的連線', head: CONN_HEAD, rows, ...changed ? { changed } : {} }];
const get = (path: string, accept: string): ProtocolHeader => ({ layer: 'application', protocol: 'HTTP/1.1', fields: [
  { name: '方法', value: 'GET' }, { name: '路徑', value: path }, { name: '版本', value: 'HTTP/1.1' },
  { name: 'Host', value: 'www.example.com' }, { name: 'User-Agent', value: UA }, { name: 'Accept', value: accept }] });
const response = (code: string, reason: string, headers: [string, string][]): ProtocolHeader => ({ layer: 'application', protocol: 'HTTP/1.1', fields: [
  { name: '版本', value: 'HTTP/1.1' }, { name: '狀態碼', value: code }, { name: '原因片語', value: reason },
  ...headers.map(([name, value]) => ({ name, value }))] });
const ACCEPT_HTML = 'text/html,application/xhtml+xml,*/*;q=0.8';

/** Section 5. */
const pageLoad: NetworkScene = {
  id: 'cn12-page-load', title: '一次網頁載入：301 重新導向與持久連線', model: 'tcp-ip',
  description: '筆電已經從 DNS 拿到 www.example.com 的位址 203.0.113.80。使用者在網址列只打了 www.example.com，瀏覽器先用 http:// 連 80 連接埠，而網站規定一律使用 HTTPS。TCP 三向交握（CN09）與 TLS 交握（之後的課）都省略，只畫 HTTP 訊息；443 上的 HTTP 訊息實際上由 TLS 加密，這裡畫的是解密後的內容。表格是瀏覽器開著的 TCP 連線，以及每條連線已經送出的請求數。',
  nodes: [
    { id: 'browser', label: '瀏覽器', kind: 'host', addresses: [`IP ${LAPTOP}`] },
    { id: 'server', label: '網頁伺服器 www.example.com', kind: 'server', addresses: [`IP ${WEB}`, 'TCP 80、443'] },
  ],
  messages: [
    { id: 'get-http', from: 'browser', to: 'server', label: 'GET /（http，連接埠 80）',
      headers: [get('/', ACCEPT_HTML), tcp('52001', '80'), ipv4(LAPTOP, WEB, 'TCP')],
      payload: `GET / HTTP/1.1\nHost: www.example.com\nUser-Agent: ${UA}\nAccept: ${ACCEPT_HTML}\n（空列，GET 沒有本文）`,
      note: '使用者沒有打 https://，瀏覽器就用 http://，在連線 A（本機連接埠 52001 → 80）送出第一個請求。起始列是「方法 路徑 版本」；Host 是 HTTP/1.1 規定必須有的標頭，同一個 IP 可能架了很多網站，伺服器靠它知道要哪一個。標頭之後是一個空列，GET 沒有本文。',
      tables: conns([CONN_A(1)], [0]) },
    { id: 'moved', from: 'server', to: 'browser', label: '301 Moved Permanently',
      headers: [response('301', 'Moved Permanently', [['Location', 'https://www.example.com/'], ['Content-Length', '0']]), tcp('80', '52001'), ipv4(WEB, LAPTOP, 'TCP')],
      payload: 'HTTP/1.1 301 Moved Permanently\nLocation: https://www.example.com/\nContent-Length: 0\n（空列，沒有本文）',
      note: '伺服器不給網頁，而是回 301：這個網址已經永久搬到 Location 標頭寫的 https://www.example.com/。3xx 是重新導向類別；301 表示永久，瀏覽器與搜尋引擎會記住新網址。Content-Length: 0 表示沒有本文，瀏覽器知道這則回應到此結束，連線 A 還開著、閒置。',
      tables: conns([CONN_A(1)]) },
    { id: 'get-https', from: 'browser', to: 'server', label: 'GET /（https，連接埠 443）',
      headers: [get('/', ACCEPT_HTML), tcp('52002', '443'), ipv4(LAPTOP, WEB, 'TCP')],
      payload: `GET / HTTP/1.1\nHost: www.example.com\nUser-Agent: ${UA}\nAccept: ${ACCEPT_HTML}`,
      note: '新網址的協定是 https、連接埠是 443，和連線 A 不同，瀏覽器要另外開連線 B（本機 52002 → 443）：先做 TCP 三向交握與 TLS 交握，再送出同樣的 GET /。主機名稱沒變，所以不必重新查 DNS。',
      tables: conns([CONN_A(1), CONN_B(1)], [1]) },
    { id: 'html', from: 'server', to: 'browser', label: '200 OK（HTML 1256 位元組）',
      headers: [response('200', 'OK', [['Content-Type', 'text/html; charset=utf-8'], ['Content-Length', '1256']]), tcp('443', '52002'), ipv4(WEB, LAPTOP, 'TCP')],
      payload: 'HTTP/1.1 200 OK\nContent-Type: text/html; charset=utf-8\nContent-Length: 1256\n\n<!doctype html> … <link rel="stylesheet" href="/style.css"> … <img src="/logo.png" alt="標誌"> …（本文共 1256 位元組）',
      note: '200 表示成功，本文就是 HTML。Content-Type 告訴瀏覽器本文是 UTF-8 編碼的 HTML，Content-Length 說本文有 1256 位元組：瀏覽器讀滿 1256 位元組就知道回應結束，這條連線可以接著送下一個請求。瀏覽器解析 HTML，發現還需要 /style.css 與 /logo.png。',
      tables: conns([CONN_A(1), CONN_B(1)]) },
    { id: 'get-css', from: 'browser', to: 'server', label: 'GET /style.css（同一條連線）',
      headers: [get('/style.css', 'text/css,*/*;q=0.1'), tcp('52002', '443'), ipv4(LAPTOP, WEB, 'TCP')],
      payload: `GET /style.css HTTP/1.1\nHost: www.example.com\nUser-Agent: ${UA}\nAccept: text/css,*/*;q=0.1`,
      note: '來源連接埠仍是 52002：HTTP/1.1 預設是持久連線（keep-alive），回應送完連線不關，下一個請求直接沿用，省掉再一次 TCP 與 TLS 交握的往返。Accept 改成 text/css，表示這次要的是樣式表。',
      tables: conns([CONN_A(1), CONN_B(2)], [1]) },
    { id: 'css', from: 'server', to: 'browser', label: '200 OK（CSS 842 位元組）',
      headers: [response('200', 'OK', [['Content-Type', 'text/css'], ['Content-Length', '842']]), tcp('443', '52002'), ipv4(WEB, LAPTOP, 'TCP')],
      payload: 'HTTP/1.1 200 OK\nContent-Type: text/css\nContent-Length: 842\n\nbody { … }（本文共 842 位元組）',
      note: '樣式表送回來了，Content-Type 是 text/css。瀏覽器在一條 HTTP/1.1 連線上一次只讓一個請求等回應（規格允許的管線化幾乎沒有瀏覽器使用），所以等這則回應讀完，才在同一條連線送下一個。',
      tables: conns([CONN_A(1), CONN_B(2)]) },
    { id: 'get-logo', from: 'browser', to: 'server', label: 'GET /logo.png（同一條連線）',
      headers: [get('/logo.png', 'image/avif,image/webp,*/*;q=0.8'), tcp('52002', '443'), ipv4(LAPTOP, WEB, 'TCP')],
      payload: `GET /logo.png HTTP/1.1\nHost: www.example.com\nUser-Agent: ${UA}\nAccept: image/avif,image/webp,*/*;q=0.8`,
      note: '第三個請求仍走連線 B。到這裡，使用者輸入一個網址，瀏覽器已經送出 4 個 HTTP 請求、開了 2 條 TCP 連線。',
      tables: conns([CONN_A(1), CONN_B(3)], [1]) },
    { id: 'not-found', from: 'server', to: 'browser', label: '404 Not Found',
      headers: [response('404', 'Not Found', [['Content-Type', 'text/html; charset=utf-8'], ['Content-Length', '153']]), tcp('443', '52002'), ipv4(WEB, LAPTOP, 'TCP')],
      payload: 'HTTP/1.1 404 Not Found\nContent-Type: text/html; charset=utf-8\nContent-Length: 153\n\n<!doctype html> … 找不到這個頁面 …（本文共 153 位元組）',
      note: '網頁作者把檔名寫錯了，伺服器上沒有 /logo.png：4xx 是用戶端這邊的錯（要了不存在的東西），伺服器本身運作正常。404 也是一則完整的回應，有自己的本文（說明頁面），連線 B 照樣保持開著。畫面上圖片的位置顯示成破圖。',
      tables: conns([CONN_A(1), CONN_B(3)]) },
  ],
};

// ---- scene 3: login and cookies -------------------------------------------------------------------------------------
const CDN = '198.51.100.20';
const BODY = 'user=mei&password=k7Qp2x';
const JAR_HEAD = ['名稱', '值', '網域', '含子網域', '其他屬性', '到期'];
const LANG = ['lang', 'zh-TW', 'example.com', '是', 'Path=/', '一年後（Max-Age=31536000）'];
const SID = ['sid', '7f3a9c2e', 'www.example.com', '否', 'Path=/、HttpOnly、Secure、SameSite=Lax', '關閉瀏覽器時（沒有 Max-Age／Expires）'];
const jar = (rows: string[][], changed?: number[]): NodeTable[] => [{ node: 'browser', name: '瀏覽器的 Cookie 儲存區', head: JAR_HEAD, rows, ...changed ? { changed } : {} }];
const SET_COOKIE = 'sid=7f3a9c2e; Path=/; HttpOnly; Secure; SameSite=Lax';

/** Section 6. */
const login: NetworkScene = {
  id: 'cn12-login-cookie', title: '登入與 Cookie：Set-Cookie、Cookie 標頭與不會送出的時候', model: 'tcp-ip',
  description: '使用者在 https://www.example.com 的登入頁送出帳號密碼。瀏覽器的 Cookie 儲存區裡原本已有上次造訪留下的 lang=zh-TW（當時以 Domain=example.com 設定）。看伺服器怎麼用 Set-Cookie 發出工作階段 Cookie、瀏覽器之後在哪些請求帶上 Cookie 標頭，又在哪個請求不帶。連線都是 HTTPS（TCP 與 TLS 交握省略，畫的是解密後的 HTTP 內容）；工作階段 ID 為了好讀寫得很短，實際上是很長的隨機值。表格是瀏覽器的 Cookie 儲存區。',
  nodes: [
    { id: 'browser', label: '瀏覽器', kind: 'host', addresses: [`IP ${LAPTOP}`] },
    { id: 'server', label: '網頁伺服器 www.example.com', kind: 'server', addresses: [`IP ${WEB}`, 'TCP 443'] },
    { id: 'cdn', label: '圖片伺服器 img.example.net', kind: 'server', addresses: [`IP ${CDN}`, 'TCP 443'] },
  ],
  messages: [
    { id: 'login', from: 'browser', to: 'server', label: 'POST /login（帳號密碼在本文）',
      headers: [{ layer: 'application', protocol: 'HTTP/1.1', fields: [
        { name: '方法', value: 'POST' }, { name: '路徑', value: '/login' }, { name: '版本', value: 'HTTP/1.1' }, { name: 'Host', value: 'www.example.com' },
        { name: 'Content-Type', value: 'application/x-www-form-urlencoded' }, { name: 'Content-Length', value: String(BODY.length) }, { name: 'Cookie', value: 'lang=zh-TW' }] },
        tcp('52010', '443'), ipv4(LAPTOP, WEB, 'TCP')],
      payload: `POST /login HTTP/1.1\nHost: www.example.com\nContent-Type: application/x-www-form-urlencoded\nContent-Length: ${BODY.length}\nCookie: lang=zh-TW\n\n${BODY}`,
      note: `表單用 POST 送出：資料放在本文，不在網址裡。Content-Type 說明本文是表單編碼（名稱=值，以 & 連接），Content-Length 是本文的位元組數 ${BODY.length}。密碼在 HTTPS 裡加密傳送。lang 的網域是 example.com 而且含子網域，所以送往 www.example.com 的請求會帶上 Cookie: lang=zh-TW。`,
      tables: jar([LANG]) },
    { id: 'login-ok', from: 'server', to: 'browser', label: '302 Found ＋ Set-Cookie',
      headers: [response('302', 'Found', [['Location', '/account'], ['Set-Cookie', SET_COOKIE], ['Content-Length', '0']]), tcp('443', '52010'), ipv4(WEB, LAPTOP, 'TCP')],
      payload: `HTTP/1.1 302 Found\nLocation: /account\nSet-Cookie: ${SET_COOKIE}\nContent-Length: 0`,
      note: '帳號密碼正確。伺服器產生一個隨機的工作階段 ID，在自己的工作階段資料裡記下「7f3a9c2e → 使用者 mei」，用 Set-Cookie 交給瀏覽器。Set-Cookie 沒有 Domain 屬性，所以這是只屬於 www.example.com 的 host-only Cookie，不含子網域。302 把瀏覽器導向 /account，瀏覽器改用 GET 去拿（先 POST、再導向、再 GET：重新整理頁面時不會再送一次表單；303 See Other 是專門表達「改用 GET 去看」的狀態碼）。',
      tables: jar([LANG, SID], [1]) },
    { id: 'account', from: 'browser', to: 'server', label: 'GET /account（帶 Cookie）',
      headers: [{ layer: 'application', protocol: 'HTTP/1.1', fields: [
        { name: '方法', value: 'GET' }, { name: '路徑', value: '/account' }, { name: '版本', value: 'HTTP/1.1' }, { name: 'Host', value: 'www.example.com' },
        { name: 'Cookie', value: 'lang=zh-TW; sid=7f3a9c2e' }] }, tcp('52010', '443'), ipv4(LAPTOP, WEB, 'TCP')],
      payload: 'GET /account HTTP/1.1\nHost: www.example.com\nCookie: lang=zh-TW; sid=7f3a9c2e',
      note: '兩個 Cookie 的網域、路徑都符合 www.example.com/account，而且是 HTTPS 連線（sid 有 Secure），瀏覽器把它們放進同一個 Cookie 標頭，以「; 」分隔；路徑一樣長時先建立的排在前面，所以 lang 在前。Cookie 標頭只有「名稱=值」，HttpOnly、Secure、SameSite 這些屬性是瀏覽器自己判斷用的，不會送回伺服器。',
      tables: jar([LANG, SID]) },
    { id: 'account-ok', from: 'server', to: 'browser', label: '200 OK（帳戶頁）',
      headers: [response('200', 'OK', [['Content-Type', 'text/html; charset=utf-8'], ['Content-Length', '2048']]), tcp('443', '52010'), ipv4(WEB, LAPTOP, 'TCP')],
      payload: 'HTTP/1.1 200 OK\nContent-Type: text/html; charset=utf-8\nContent-Length: 2048\n\n<!doctype html> … 歡迎，mei … <img src="https://img.example.net/banner.png" alt="橫幅"> …（本文共 2048 位元組）',
      note: 'HTTP 本身不記得剛才誰登入過；伺服器是拿 Cookie 裡的 sid=7f3a9c2e 去工作階段資料查，才知道這是 mei，回傳她的帳戶頁。頁面裡嵌了一張放在 img.example.net 的圖片。',
      tables: jar([LANG, SID]) },
    { id: 'banner', from: 'browser', to: 'cdn', label: 'GET /banner.png（沒有 Cookie）',
      headers: [{ layer: 'application', protocol: 'HTTP/1.1', fields: [
        { name: '方法', value: 'GET' }, { name: '路徑', value: '/banner.png' }, { name: '版本', value: 'HTTP/1.1' }, { name: 'Host', value: 'img.example.net' },
        { name: 'Accept', value: 'image/avif,image/webp,*/*;q=0.8' }] }, tcp('52011', '443'), ipv4(LAPTOP, CDN, 'TCP')],
      payload: 'GET /banner.png HTTP/1.1\nHost: img.example.net\nAccept: image/avif,image/webp,*/*;q=0.8',
      note: '這是另一個主機、另一個網域，要先另外查 DNS、另開連線。請求裡沒有 Cookie 標頭：lang 只送往 example.com 與它的子網域，sid 只送往 www.example.com，img.example.net 兩個都不符合。瀏覽器不會把一個網站的 Cookie 送給別的網站。',
      tables: jar([LANG, SID]) },
    { id: 'banner-ok', from: 'cdn', to: 'browser', label: '200 OK（PNG 5120 位元組）',
      headers: [response('200', 'OK', [['Content-Type', 'image/png'], ['Content-Length', '5120']]), tcp('443', '52011'), ipv4(CDN, LAPTOP, 'TCP')],
      payload: 'HTTP/1.1 200 OK\nContent-Type: image/png\nContent-Length: 5120\n\n（PNG 圖片的位元組，共 5120 位元組）',
      note: '圖片伺服器照常回傳圖片。它完全看不到 www.example.com 的工作階段 ID。',
      tables: jar([LANG, SID]) },
  ],
};

/** CN12 DNS and HTTP (packet-journey): scenes and exercises checked by the network capability. */
export const CN12: LessonContent = {
  lessonId: 'CN12',
  motivation: '在網址列打上 www.example.com 按下 Enter，不到一秒網頁就出現了。這不到一秒裡，電腦先要問好幾台 DNS 伺服器「這個名稱在哪裡」，再和網頁伺服器來回好幾趟 HTTP 訊息；登入之後，伺服器又怎麼記得你是誰？網站打不開時，問題可能出在名稱解析、重新導向、狀態碼或 Cookie 的任何一步。看懂這些往返，才能從瀏覽器的開發者工具裡讀出原因，也才能寫出正確回應狀態碼、安全設定 Cookie 的網站。',
  sections: [
    {
      id: 'url-to-html', title: '從網址到 HTML：先查名稱，再要網頁',
      blocks: [
        { type: 'p', text: '從輸入 www.example.com 到畫面出現網頁，瀏覽器至少要做兩件事：先把名稱 www.example.com 換成 IP 位址，這是 DNS；再向那個位址要網頁，這是 HTTP。兩者都是應用層協定（CN01）：DNS 平常走 UDP 53，HTTP/1.1 走 TCP 80，HTTPS 則是在 TCP 443 上先建立 TLS 加密、再跑 HTTP（傳輸層的差別在 CN09 比較過）。' },
        { type: 'list', ordered: true, items: [
          '解析網址：協定 https、主機 www.example.com、連接埠（https 預設 443）、路徑 /。只打 www.example.com 時，瀏覽器可能先用 http。',
          'DNS 解析：先看瀏覽器與作業系統的快取，沒有就問遞迴解析器，拿到 A（IPv4）或 AAAA（IPv6）紀錄。',
          '建立連線：對這個位址做 TCP 三向交握；https 還要再做 TLS 交握（之後的課介紹）。',
          '送出 HTTP 請求：例如 GET /，加上 Host、User-Agent、Accept 等標頭。',
          '讀取回應：200 就是網頁；301 或 302 是重新導向，依 Location 標頭再發一次請求。',
          '載入子資源：解析 HTML，對 CSS、JavaScript、圖片再發請求，盡量重用同一條持久連線。',
        ] },
        { type: 'p', text: '每一步都至少要一個往返時間（RTT）。這堂課把其中 DNS 與 HTTP 兩段拆開來看：DNS 怎麼一層一層找到答案並快取起來，HTTP 的請求與回應由哪些部分組成，以及沒有記憶的 HTTP 怎麼靠 Cookie 認得登入過的使用者。程式怎麼透過 socket 送出這些訊息，留給 socket 的課。' },
      ],
    },
    {
      id: 'dns-resolution', title: 'DNS 解析：從根、TLD 到權威伺服器',
      blocks: [
        { type: 'p', text: 'DNS 是分散在全世界的階層式資料庫。名稱從右往左讀：www.example.com. 最右邊隱含的點代表根，往左依序是頂層網域（TLD）com、網域 example、主機 www。每一層只負責把下一層「委派」出去：根區只知道 com 歸哪些伺服器管，com 區只知道 example.com 歸哪些伺服器管，只有 example.com 的權威伺服器真的保存 www 的紀錄。' },
        { type: 'table', head: ['角色', '是誰', '做什麼'], rows: [
          ['stub 解析程式', '作業系統內建的解析函式庫', '把問題交給設定好的遞迴解析器（通常由 DHCP 告知），送出 RD=1 的遞迴查詢，只等最後的答案'],
          ['遞迴解析器', '電信業者、公司或公共 DNS 服務', '先查快取；沒有就依序向根、TLD、權威伺服器送出 RD=0 的迭代查詢，把收到的紀錄快取起來再回答（RA=1）'],
          ['根伺服器', 'a 到 m.root-servers.net 共 13 個名稱，以任播分布在全球上千個站點', '回答「com 這類 TLD 歸誰管」的轉介'],
          ['TLD 伺服器', '例如 .com 的 a.gtld-servers.net', '回答「example.com 歸誰管」的轉介'],
          ['權威伺服器', '網域擁有者指定，例如 ns1.example.com', '保存區域裡的紀錄，回答時設 AA=1'],
        ] },
        { type: 'p', text: '遞迴與迭代是兩種問法。筆電對解析器是遞迴查詢（RD=1，「請你負責拿到答案」）；解析器對根、TLD 與權威伺服器是迭代查詢（RD=0），對方只回它知道的最好資訊：答案，或是「去問誰」的轉介。轉介的答案區段是空的，權威區段放下一層的 NS 紀錄，附加區段附上那些名稱伺服器的位址（膠合紀錄，glue），解析器才不必為了找名稱伺服器的位址再繞一圈。' },
        { type: 'p', text: 'DNS 標頭裡有幾個旗標要會讀：QR 區分查詢（0）與回應（1）；RD（Recursion Desired）由查詢方設定，回應照抄；RA（Recursion Available）表示這台伺服器願意替人遞迴；AA（Authoritative Answer）只有權威伺服器回答自己區域的資料時才是 1。查詢與回應用同一個 16 位元的 ID 配對，平常都走 UDP 53，回應太大被截斷時才改走 TCP 53（CN09）。下面的情境從空的快取開始，完整跑一次，再看兩分鐘後的查詢少了哪些步驟。' },
        { type: 'example', id: 'cn12-dns-recursive' },
        { type: 'callout', tone: 'warning', title: '「DNS 每次都從根伺服器查起」', text: '遞迴解析器會依 TTL 快取收到的每一筆紀錄，包括 com 與 example.com 的 NS 紀錄。情境裡 120 秒後手機查 A，解析器直接從快取回答，一個封包都沒有往外送；查 AAAA 時快取裡沒有這筆，但 example.com 的委派還在，解析器直接問 ns1.example.com，跳過根與 TLD。com 的委派 TTL 是兩天，一台忙碌的解析器幾乎不必為了 .com 的名稱去問根伺服器。' },
        { type: 'callout', tone: 'note', title: 'QNAME 最小化', text: '情境照傳統做法，對根與 TLD 也送出完整名稱 www.example.com。新的解析器常用 QNAME 最小化（RFC 9156）：問根時只問 com 的 NS，問 TLD 時只問 example.com 的 NS，上層伺服器看不到你要連哪一台主機。轉介的內容與最後的答案都一樣，只是洩漏的資訊比較少。' },
      ],
    },
    {
      id: 'dns-records', title: 'DNS 紀錄與 TTL 快取',
      blocks: [
        { type: 'p', text: '區域裡的每一筆資源紀錄都有名稱、TTL、類別（幾乎都是 IN，網際網路）、類型與資料。同名同類型的紀錄合成一組一起回答，所以 A 與 AAAA 要分開查、分開快取，情境裡手機的 AAAA 查詢沒有因為快取裡已經有 A 就命中。常見的類型：' },
        { type: 'table', head: ['類型', '內容', '範例（名稱 TTL 類別 類型 資料）'], rows: [
          ['A', 'IPv4 位址', 'www.example.com. 300 IN A 203.0.113.80'],
          ['AAAA', 'IPv6 位址（128 位元，是 A 的四倍長）', 'www.example.com. 300 IN AAAA 2001:db8::80'],
          ['CNAME', '別名：這個名稱其實是另一個名稱', 'shop.example.com. 3600 IN CNAME www.example.com.'],
          ['MX', '收這個網域郵件的主機與優先序（數字小的先試）', 'example.com. 3600 IN MX 10 mail.example.com.'],
          ['NS', '負責這個區域的權威伺服器', 'example.com. 172800 IN NS ns1.example.com.'],
          ['TXT', '任意文字，常用於寄件政策（SPF）與網域所有權驗證', 'example.com. 3600 IN TXT "v=spf1 mx -all"'],
        ] },
        { type: 'p', text: '查 shop.example.com 的 A 時，會先得到 CNAME 指向 www.example.com，再接著得到 www.example.com 的 A（兩者在同一個區域時，權威伺服器會一起附上）。一個名稱有了 CNAME 就不能再有其他紀錄，所以區域頂端的 example.com 不能設 CNAME，它一定有 NS 與 SOA 紀錄。MX、NS、CNAME 的資料都是名稱而不是位址，拿到之後還要再查那個名稱的 A 或 AAAA。' },
        { type: 'p', text: 'TTL（存活時間）是這筆紀錄可以被快取的秒數，由區域的管理者設定。快取有好幾層：瀏覽器、作業系統、遞迴解析器。每一層都把 TTL 往下倒數，轉給別人時給的是剩下的秒數，所以情境裡 120 秒後手機看到的 TTL 是 180 而不是 300；倒數到 0 就丟掉，下次再問。查不到的名稱（NXDOMAIN）也會被快取一段時間，長度由區域的 SOA 紀錄決定，稱為負面快取。' },
        { type: 'callout', tone: 'tip', title: '要換 IP，先調低 TTL', text: '網站要搬到新的位址時，先把 TTL 從 3600 之類的值調到 300，等舊的長 TTL 全部過期（至少一個舊 TTL 的時間）再改位址，各地快取最多只會再用 5 分鐘的舊位址。TTL 長，查詢少、解析快；TTL 短，變更生效快，是取捨。DNS 紀錄的 TTL 以秒計時，和 IP 標頭的 TTL（還能經過幾個路由器）只是同名，意思完全不同。' },
      ],
    },
    {
      id: 'http-messages', title: 'HTTP 請求與回應：方法、狀態碼、標頭與本文',
      blocks: [
        { type: 'p', text: 'HTTP/1.1 的訊息是純文字：第一列是起始列，接著每列一個「名稱: 值」的標頭，然後一個空列，最後是可有可無的本文。請求的起始列是「方法 路徑 版本」，例如 GET /style.css HTTP/1.1；回應的起始列是「版本 狀態碼 原因片語」，例如 HTTP/1.1 404 Not Found。HTTP 是無狀態的：每個請求各自獨立，伺服器不會自動記得上一個請求是誰送的。' },
        { type: 'table', head: ['標頭', '出現在', '用途'], rows: [
          ['Host', '請求（HTTP/1.1 必須有）', '要哪一個網站；同一個 IP 上可以架很多網站，伺服器靠它分辨'],
          ['User-Agent', '請求', '用戶端程式的名稱與版本'],
          ['Accept', '請求', '用戶端能接受的媒體類型與偏好（q 值越大越想要），例如 text/html'],
          ['Content-Type', '有本文的請求與回應', '本文的媒體類型與編碼，例如 application/x-www-form-urlencoded、text/html; charset=utf-8'],
          ['Content-Length', '有本文的請求與回應', '本文的位元組數；接收端靠它知道本文在哪裡結束、下一則訊息從哪裡開始'],
          ['Location', '3xx 回應', '重新導向的目標網址'],
          ['Set-Cookie／Cookie', '回應／請求', '伺服器發出 Cookie；瀏覽器之後在請求中帶回'],
        ] },
        { type: 'p', text: '方法說明請求的意圖。安全（safe）的方法不應改變伺服器上的資料，瀏覽器與爬蟲可以放心地預先抓取；冪等（idempotent）的方法送一次和送很多次，伺服器最後的狀態相同，所以網路出錯、不確定對方有沒有收到時可以放心重送。' },
        { type: 'table', head: ['方法', '用途', '安全', '冪等'], rows: [
          ['GET', '取得資源', '是', '是'],
          ['HEAD', '和 GET 一樣，但回應只有標頭、沒有本文（例如先看檔案多大）', '是', '是'],
          ['POST', '送出資料讓伺服器處理：登入、下單、新增留言', '否', '否'],
          ['PUT', '用請求的本文整個取代指定的資源', '否', '是'],
          ['DELETE', '刪除指定的資源', '否', '是'],
        ] },
        { type: 'p', text: '狀態碼的第一位數字是類別：1xx 資訊、2xx 成功、3xx 重新導向、4xx 用戶端的錯、5xx 伺服器的錯。用戶端不認得某個狀態碼時，就照它所屬的類別處理。' },
        { type: 'table', head: ['狀態碼', '意思', '典型情況'], rows: [
          ['200 OK', '成功，本文就是要的資源', '正常打開網頁、下載檔案'],
          ['301 Moved Permanently', '永久搬家，新網址在 Location；瀏覽器與搜尋引擎會記住', 'http:// 一律改成 https://、網站改版換網址'],
          ['302 Found', '暫時在別處，下次仍用原網址', '登入成功後導向帳戶頁'],
          ['304 Not Modified', '用戶端快取的版本仍是最新的，回應沒有本文', '帶 If-None-Match 或 If-Modified-Since 的條件式 GET'],
          ['404 Not Found', '伺服器上沒有這個路徑', '網址打錯、檔案被刪除'],
          ['500 Internal Server Error', '伺服器處理請求時出錯', '程式拋出沒有處理的例外'],
        ] },
        { type: 'p', text: '怎麼依資源設計網址、用這些方法與狀態碼組成一套 API，留給之後介紹 REST 的課；這裡先學會讀懂每一則請求與回應。' },
      ],
    },
    {
      id: 'page-load', title: '一次網頁載入：重新導向與持久連線',
      blocks: [
        { type: 'p', text: 'HTTP/1.0 預設每個請求開一條 TCP 連線，回應完就關，每個檔案都要多付一次交握的往返。HTTP/1.1 預設是持久連線（keep-alive）：回應送完連線不關，下一個請求直接沿用，直到一方送出 Connection: close，或閒置太久被關閉。因為連線不再以「關閉」標示回應的結尾，回應必須用 Content-Length（或分塊傳輸）說清楚本文有多長。下面的情境接在 DNS 之後：使用者只打了 www.example.com。' },
        { type: 'example', id: 'cn12-page-load' },
        { type: 'p', text: '數一數：從輸入網址到畫面完整，瀏覽器送了 4 個 HTTP 請求（http 的 /、https 的 /、/style.css、/logo.png），開了 2 條 TCP 連線。80 那條只換來一個 301；443 那條連續送了 3 個請求，後兩個沒有再交握。真實的網頁常有上百個請求（HTML、CSS、JavaScript、圖片、字型、API 資料），而且分散在好幾個主機名稱，每個新名稱都要先做 DNS 解析、再建立自己的連線。' },
        { type: 'p', text: '實務上 HTTP/1.1 的一條連線一次只有一個請求在等回應（管線化幾乎沒有瀏覽器使用），前面的回應很大或很慢，後面的就要排隊。所以瀏覽器對同一個主機通常最多同時開 6 條連線並行下載。之後的課會介紹 HTTP/2 怎麼在一條連線上交錯傳送多個請求。' },
        { type: 'callout', tone: 'note', title: 'HSTS：連第一個 301 也省掉', text: '網站可以在 HTTPS 回應加上 Strict-Transport-Security 標頭。瀏覽器記住之後，下次使用者再輸入 www.example.com，會直接連 443，不再先送一次未加密的 http 請求等 301；這也避免了第一個明文請求被竄改的風險。' },
      ],
    },
    {
      id: 'cookies', title: 'Cookie：在無狀態的 HTTP 上維持登入',
      blocks: [
        { type: 'p', text: '伺服器怎麼知道 GET /account 來自剛登入的使用者？登入成功時，伺服器產生一個猜不到的隨機工作階段 ID，在自己的工作階段資料裡記下「ID → 使用者」，再用 Set-Cookie 標頭交給瀏覽器。瀏覽器把它存進 Cookie 儲存區，之後對符合條件的網址發請求時，自動在 Cookie 標頭帶回「名稱=值」。伺服器拿這個 ID 查出使用者，工作階段就建立在本來無狀態的 HTTP 上。' },
        { type: 'example', id: 'cn12-login-cookie' },
        { type: 'table', head: ['Set-Cookie 屬性', '作用'], rows: [
          ['Domain', '設了才會送往子網域（Domain=example.com 也送給 www、img 等子網域）；沒設就是 host-only，只送回設定它的主機'],
          ['Path', '請求的路徑以它開頭才送'],
          ['Max-Age／Expires', '保存期限；兩者都沒有就是工作階段 Cookie，關閉瀏覽器時刪除'],
          ['HttpOnly', '頁面上的 JavaScript（document.cookie）讀不到，被注入的惡意腳本（XSS）也就偷不走'],
          ['Secure', '只在 HTTPS 連線上送出，避免在未加密的連線上被看到'],
          ['SameSite', '從別的網站發起的請求要不要帶：Strict 都不帶；Lax 只在使用者點連結這類頂層 GET 導覽時帶；None 都帶（必須同時設 Secure）'],
        ] },
        { type: 'p', text: '屬性是瀏覽器自己判斷「這個請求要不要帶這個 Cookie」用的，只出現在 Set-Cookie 裡；Cookie 標頭只有「名稱=值」，多個之間以分號分隔。工作階段 ID 等於登入憑證，所以要夠長、夠隨機，設 HttpOnly 與 Secure，登出時伺服器要把它作廢。' },
        { type: 'callout', tone: 'warning', title: '「Cookie 會送給所有網站」', text: '瀏覽器只把 Cookie 送給網域與路徑都符合的請求：www.example.com 設的 host-only Cookie 連 img.example.com 都不送，更不會送到 img.example.net。情境最後，www.example.com 的頁面嵌了 img.example.net 的圖片，那個請求裡沒有任何 Cookie。真正要提防的是反方向：別的網站引誘你的瀏覽器對 www.example.com 發出請求時，瀏覽器會帶上 www.example.com 自己的 Cookie，這就是跨站請求偽造（CSRF）。SameSite=Lax 讓跨站的 POST 與嵌入的請求不帶 Cookie，擋下大多數這類攻擊。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  network: {
    scenes: [recursive, pageLoad, login],
    exercises: [
      { id: 'cn12-cache-ttl', task: 'table', scene: 'cn12-dns-recursive', message: 'a-phone-a', node: 'resolver', table: '解析器快取', row: 'www.example.com A', column: '剩餘 TTL（秒）', title: '快取裡剩下的 TTL',
        statement: '在「一次完整的遞迴解析」情境裡，權威伺服器回答 www.example.com A 時給的 TTL 是 300 秒。120 秒後手機查同一個名稱，解析器從快取回答。這時解析器快取裡 www.example.com A 這一筆的剩餘 TTL 是多少秒？（只填數字）',
        hints: ['快取裡的 TTL 會隨時間倒數。', '從收到答案到手機查詢，過了多少秒？'],
        explanation: '解析器收到權威伺服器的答案時從 300 秒開始倒數，120 秒後剩 300 − 120 = 180 秒；它回給手機的答案也寫 TTL 180，所以手機的快取和解析器的快取在同一個時間點到期。倒數到 0 這筆紀錄就被丟掉，下一個查詢才會再去問權威伺服器。',
        mistakes: [
          { answer: { cell: '300' }, why: '以為 TTL 是固定的設定值：快取裡的 TTL 會倒數，過了 120 秒只剩 180 秒。' },
          { answer: { cell: '120' }, why: '填的是已經過去的時間：TTL 是還能保存多久，要用 300 減去 120。' },
        ] },
      { id: 'cn12-skip-root', task: 'field', scene: 'cn12-dns-recursive', message: 'q-auth-aaaa', layer: 'network', field: '目的 IP', title: 'AAAA 查詢先問誰',
        statement: '同一個情境裡，手機接著查 www.example.com 的 AAAA，解析器快取裡沒有這一筆，必須往外查。解析器為了這個查詢送出的第一個封包，IPv4 標頭的目的 IP 是什麼？',
        hints: ['快取裡沒有 AAAA，但還有哪些和 example.com 有關的紀錄？', '解析器會從快取裡離答案最近的委派開始問。'],
        explanation: '快取裡還有 example.com NS ns1.example.com 與 ns1.example.com A 203.0.113.53（剩 172680 秒），解析器知道 example.com 歸誰管，就直接問權威伺服器 203.0.113.53，不必再從根與 .com 一路問下來。只有快取裡連 com 的委派都過期時，才會回到根伺服器。',
        mistakes: [
          { answer: { value: '203.0.113.4' }, why: '以為 DNS 每次都從根伺服器查起：快取裡的 example.com 委派還有效，根伺服器不必再問。' },
          { answer: { value: '203.0.113.30' }, why: '以為每次都要先問 TLD：.com 的轉介已經快取了，它給的 ns1.example.com 位址也還有效。' },
          { answer: { value: '203.0.113.80' }, why: '把網頁伺服器當成 DNS 伺服器：203.0.113.80 是 www.example.com 的 IPv4 位址，它不回答 DNS 查詢。' },
        ] },
      { id: 'cn12-redirect-code', task: 'field', scene: 'cn12-page-load', message: 'moved', layer: 'application', field: '狀態碼', title: '把 http 永久導向 https',
        statement: '在「一次網頁載入」情境裡，網站規定一律使用 HTTPS，並希望瀏覽器與搜尋引擎都記住新網址。伺服器回應 http://www.example.com/ 的請求時，用的狀態碼是多少？（只填三位數字）',
        hints: ['重新導向是哪一個類別的狀態碼？', '這次搬家是暫時的還是永久的？'],
        explanation: '3xx 是重新導向，新網址放在 Location 標頭。網站永遠改用 HTTPS，是永久搬家，用 301 Moved Permanently：瀏覽器可以快取這個導向，搜尋引擎也會把排名轉到新網址。302 表示暫時在別處，下次仍該用原網址；200 會直接給內容，不會把使用者帶到 https。',
        mistakes: [
          { answer: { value: '302' }, why: '302 是暫時的導向，搜尋引擎會繼續把舊網址當成正式網址；永久改用 HTTPS 應該用 301。' },
          { answer: { value: '200' }, why: '200 是直接給內容：瀏覽器會留在 http，不會依 Location 改連 https。' },
          { answer: { value: '404' }, why: '這個網址不是不存在，而是搬家了：404 不會告訴瀏覽器新網址在哪裡。' },
        ] },
      { id: 'cn12-cookie-header', task: 'field', scene: 'cn12-login-cookie', message: 'account', layer: 'application', field: 'Cookie', title: '登入後的 Cookie 標頭',
        statement: '在「登入與 Cookie」情境裡，儲存區原本有 lang=zh-TW（Domain=example.com），登入時伺服器又送來 Set-Cookie: sid=7f3a9c2e; Path=/; HttpOnly; Secure; SameSite=Lax。瀏覽器接著送出 GET /account，Cookie 標頭的值是什麼？（依瀏覽器送出的順序：路徑一樣長時，先建立的排前面）',
        hints: ['兩個 Cookie 的網域都和 www.example.com 符合嗎？', 'Cookie 標頭裡會出現 HttpOnly、Secure 這些屬性嗎？'],
        explanation: 'lang 的網域是 example.com（含子網域），sid 是 www.example.com 的 host-only Cookie，兩者都符合 www.example.com/account；連線是 HTTPS，Secure 的 sid 也可以送。路徑都是 /，先建立的 lang 排前面，以「; 」分隔：lang=zh-TW; sid=7f3a9c2e。屬性只給瀏覽器判斷用，不會送回伺服器。',
        mistakes: [
          { answer: { value: 'sid=7f3a9c2e' }, why: '忘了原本的 lang：它以 Domain=example.com 設定，也會送往 www.example.com。' },
          { answer: { value: 'lang=zh-TW; sid=7f3a9c2e; Path=/; HttpOnly; Secure; SameSite=Lax' }, why: '把屬性也送回去了：Cookie 標頭只有「名稱=值」，屬性只出現在 Set-Cookie。' },
          { answer: { value: 'lang=zh-TW' }, why: '以為設了 HttpOnly 就不會送出：HttpOnly 只是讓 JavaScript 讀不到，請求照樣會帶上 sid。' },
        ] },
      { id: 'cn12-host-only', task: 'table', scene: 'cn12-login-cookie', message: 'login-ok', node: 'browser', table: '瀏覽器的 Cookie 儲存區', row: 'sid', column: '網域', title: '沒有 Domain 屬性的 Cookie',
        statement: '同一個情境裡，www.example.com 回應 Set-Cookie: sid=7f3a9c2e; Path=/; HttpOnly; Secure; SameSite=Lax，沒有 Domain 屬性。瀏覽器存下這個 Cookie 後，儲存區裡 sid 的「網域」欄是什麼？',
        hints: ['Set-Cookie 沒有寫 Domain 時，Cookie 屬於誰？', '它會不會送往 img.example.com 這類其他子網域？'],
        explanation: '沒有 Domain 屬性的 Cookie 是 host-only：只屬於設定它的主機 www.example.com，只送回 www.example.com，不送往 example.com 的其他子網域。要讓子網域共用，必須明確寫 Domain=example.com，就像 lang 那樣。',
        mistakes: [
          { answer: { cell: 'example.com' }, why: '以為 Cookie 自動屬於整個網域：沒有 Domain 屬性時只屬於設定它的主機 www.example.com。' },
          { answer: { cell: '.example.com' }, why: '這是舊寫法裡「含子網域」的意思，但 Set-Cookie 沒有 Domain 屬性，Cookie 只屬於 www.example.com。' },
          { answer: { cell: 'img.example.net' }, why: 'Cookie 屬於設定它的網站，不會因為頁面嵌了別的網站的圖片就屬於那個網站。' },
        ] },
    ],
  },
  quiz: [
    {
      id: 'q-referral', prompt: '遞迴解析器第一次向根伺服器查 www.example.com 的 A 紀錄（RD=0）。根伺服器通常怎麼回應？',
      options: [
        '直接回答 www.example.com 的 IPv4 位址，並把 AA 設為 1',
        '回一個轉介：答案區段是空的，權威區段列出 com 的 NS 紀錄，附加區段附上它們的位址',
        '自己再去問 .com 與 example.com 的伺服器，拿到答案後回傳，並設 RA=1',
        '回應名稱不存在（NXDOMAIN），因為根伺服器只認得頂層網域',
      ],
      answer: 1, explanation: '根區只保存 TLD 的委派，所以根伺服器回的是轉介：沒有答案，只告訴解析器 com 歸哪些伺服器管（NS 紀錄），並附上它們的位址（glue）。它沒有 www.example.com 的紀錄，不可能權威地回答（AA=1 只屬於 example.com 的權威伺服器）；根伺服器不提供遞迴（RA=0），而且查詢的 RD=0 本來就沒要求遞迴；名稱存在，只是不歸根區直接管，所以不是 NXDOMAIN。',
    },
    {
      id: 'q-ttl', prompt: '管理者把 www.example.com 的 A 紀錄從 203.0.113.80 改成 203.0.113.81，原本的 TTL 是 3600 秒。改完 10 分鐘後，仍有部分使用者連到舊位址，最可能的原因是什麼？',
      options: [
        '權威伺服器要等一小時後才會開始回答新的位址',
        'DNS 走 UDP，回應遺失時用戶端會收到舊的封包',
        '根伺服器還保存著舊的 A 紀錄，要等它同步',
        '遞迴解析器（以及作業系統、瀏覽器）快取了舊紀錄，TTL 倒數完之前不會再去問權威伺服器',
      ],
      answer: 3, explanation: '修改之後權威伺服器立刻回答新位址，但之前查過的遞迴解析器與用戶端各自快取了舊答案，最長可以用滿 3600 秒才過期，所以先把 TTL 調低再改位址。權威伺服器不會延後生效；UDP 遺失的回應就是沒收到，用戶端會重問而不是拿到舊封包；根伺服器只保存 TLD 的委派，根本沒有 www.example.com 的 A 紀錄。',
    },
    {
      id: 'q-mx', prompt: '別人寄信到 mei@example.com 時，寄件端的郵件伺服器要查 example.com 的哪一種紀錄，才知道該把信交給哪一台主機？',
      options: ['MX', 'CNAME', 'TXT', 'NS'],
      answer: 0, explanation: 'MX 紀錄列出收這個網域郵件的主機與優先序（數字小的先試），寄件端再查那台主機的 A 或 AAAA。CNAME 是別名，不表示收信主機；TXT 是任意文字，SPF 雖然放在 TXT 裡，說的是誰可以替這個網域寄信，不是信要送到哪裡；NS 是負責 example.com 區域的權威 DNS 伺服器，和收信無關。',
    },
    {
      id: 'q-aa', prompt: '筆電向遞迴解析器查 www.example.com，收到的回應旗標是 QR=1、AA=0、RD=1、RA=1。這代表什麼？',
      options: [
        '答案不可信，用戶端應該丟掉回應再問一次',
        '解析器拒絕替筆電做遞迴查詢，筆電要自己去問根伺服器',
        '這是解析器（從快取或代為查詢）轉述的答案，不是 example.com 的權威伺服器直接回答；解析器提供遞迴服務',
        '這是一個查詢，還不是回應',
      ],
      answer: 2, explanation: 'AA=0 只表示回答的這台不是該區域的權威伺服器；遞迴解析器轉述快取或代查來的答案時一定是 AA=0，這是正常的回應，不需要丟掉。RA=1 表示解析器支援遞迴，RD=1 是照抄筆電的要求，所以它並沒有拒絕遞迴；QR=1 表示這是回應，查詢的 QR 才是 0。',
    },
    {
      id: 'q-methods', prompt: '下列哪一個 HTTP 方法「不安全，但冪等」？',
      options: ['GET', 'POST', 'PUT', 'HEAD'],
      answer: 2, explanation: 'PUT 用本文整個取代指定的資源，會改變伺服器上的資料（不安全），但送一次和送十次結果相同（冪等），所以逾時後可以放心重送。GET 與 HEAD 只讀取資料，既安全也冪等；POST 每送一次都可能再新增一筆，例如重複下單，既不安全也不冪等。',
    },
    {
      id: 'q-status', prompt: '使用者打開 /orders，伺服器程式查詢資料庫時拋出沒有處理的例外。最適合回應的狀態碼是哪一個？',
      options: ['404 Not Found', '301 Moved Permanently', '304 Not Modified', '500 Internal Server Error'],
      answer: 3, explanation: '請求本身沒有錯，是伺服器處理時出了問題，屬於 5xx 伺服器錯誤，500 Internal Server Error 最貼切。404 表示路徑不存在，而 /orders 存在；301 是永久搬家，會把使用者導向別的網址；304 是告訴用戶端「你快取的版本仍是最新的」，只用在條件式請求。',
    },
    {
      id: 'q-httponly', prompt: '伺服器回應 Set-Cookie: sid=7f3a9c2e; Path=/; HttpOnly; Secure; SameSite=Lax。其中 HttpOnly 的作用是什麼？',
      options: [
        '頁面上的 JavaScript（document.cookie）讀不到這個 Cookie，被注入的惡意腳本也偷不走工作階段 ID',
        '這個 Cookie 只會在未加密的 HTTP 連線上送出',
        '伺服器之後不必再檢查請求裡的工作階段 ID',
        '別的網站對 www.example.com 發出的跨站請求一律不帶這個 Cookie',
      ],
      answer: 0, explanation: 'HttpOnly 讓 Cookie 只出現在 HTTP 請求裡，腳本讀不到，降低跨站腳本（XSS）偷走工作階段的風險；請求照樣會帶上它。只在 HTTPS 送出的是 Secure，HttpOnly 並不限制成未加密連線；伺服器每次都要用 ID 查工作階段，屬性不會讓它省掉檢查；控制跨站請求帶不帶 Cookie 的是 SameSite。',
    },
    {
      id: 'q-keepalive', prompt: '一個頁面的 HTML 引用了 1 個 CSS 與 2 張圖片，全都在 www.example.com。DNS 已經快取，瀏覽器用一條 HTTP/1.1 持久連線依序載入。從要 HTML 到全部載完，共需要幾個 HTTP 請求、幾次 TCP 三向交握？',
      options: [
        '4 個請求、4 次交握',
        '4 個請求、1 次交握',
        '1 個請求、1 次交握，CSS 與圖片會跟著 HTML 一起送來',
        '3 個請求、1 次交握，HTML 本身不算請求',
      ],
      answer: 1, explanation: 'HTML、CSS 與兩張圖片各是一個資源，每個都要一個請求，共 4 個；持久連線讓後面 3 個請求沿用第一條連線，只需要 1 次交握。每個請求各開一條連線（4 次交握）是 HTTP/1.0 預設的做法；伺服器不會主動把子資源跟著 HTML 送來，瀏覽器要解析 HTML 才知道還缺什麼；HTML 本身也是一個 GET 請求。',
    },
  ],
};
