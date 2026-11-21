import type { NetworkScene, NodeTable, ProtocolHeader } from '@/lib/network/model';
import type { LessonContent } from '../schema';

/*
 * CN17 Network troubleshooting tools (CN-4, packet-journey). Five fixed scenes on the TCP/IP model, each seen from the
 * laptop that runs the tool, with the tool's output as a node table:
 *   1. ping: ICMP Echo Request (type 8) and Echo Reply (type 0) with identifier and sequence, ttl=60 on arrival
 *      (64 minus 4 routers), one lost reply (33% loss), then a host whose firewall drops ICMP but answers TCP 443.
 *   2. traceroute (Linux, UDP probes from port 33434, three per TTL; one per TTL drawn): TTL 1..5, ICMP Time Exceeded
 *      (type 11, code 0) from each router, a silent hop 3 (* * *), and Port Unreachable (type 3, code 3) from the
 *      destination that ends the trace.
 *   3. dig: a typo answered NXDOMAIN (RCODE 3) with the zone's SOA, the right name NOERROR (RCODE 0) with one A record,
 *      and the same name asked @ a second resolver that returns SERVFAIL (RCODE 2).
 *   4. curl to a port with nothing listening (SYN, then RST/ACK: connection refused, exit 7) against a port whose SYN a
 *      firewall drops (lost, retransmitted after 1 and 2 more seconds: timeout, exit 28 with --connect-timeout 5), with
 *      the tcpdump -n -S capture as the table.
 *   5. curl -v through an nginx reverse proxy whose upstream (10.0.0.20:8000) refuses: 502 Bad Gateway and the nginx
 *      error log line.
 * ICMP rides inside IPv4 (protocol 1) but belongs to the internet layer, so an ICMP message's IPv4 and ICMP headers are
 * drawn as one internet-layer header ("IPv4 + ICMP"). Public addresses are RFC 5737; the proxy's upstream network is
 * RFC 1918. Headers are the values the laptop sees: what it sends as sent, what it receives as received.
 */

// ---- headers -------------------------------------------------------------------------------------------------------
const PROTO = { icmp: '1（ICMP）', tcp: '6（TCP）', udp: '17（UDP）' } as const;
const ipv4 = (from: string, to: string, protocol: keyof typeof PROTO, ttl?: number): ProtocolHeader => ({ layer: 'network', protocol: 'IPv4', fields: [
  { name: '來源 IP', value: from }, { name: '目的 IP', value: to }, ...ttl === undefined ? [] : [{ name: 'TTL', value: String(ttl) }],
  { name: '協定', value: PROTO[protocol] }] });
/** An ICMP message with its IPv4 header, drawn as one internet-layer header (ICMP belongs to that layer). */
const icmp = (from: string, to: string, type: number, code: number, meaning: string, extra: { name: string; value: string }[], ttl?: number): ProtocolHeader => ({
  layer: 'network', protocol: 'IPv4 + ICMP', fields: [
    { name: '來源 IP', value: from }, { name: '目的 IP', value: to }, ...ttl === undefined ? [] : [{ name: 'TTL', value: String(ttl) }],
    { name: '協定', value: PROTO.icmp }, { name: 'ICMP 類型', value: String(type) }, { name: 'ICMP 代碼', value: String(code) },
    { name: '意思', value: meaning }, ...extra] });
const tcp = (from: string, to: string, flags: string, seq?: number, ack?: number): ProtocolHeader => ({ layer: 'transport', protocol: 'TCP', fields: [
  { name: '來源連接埠', value: from }, { name: '目的連接埠', value: to }, { name: '旗標', value: flags },
  ...seq === undefined ? [] : [{ name: 'Seq', value: String(seq) }], ...ack === undefined ? [] : [{ name: 'Ack', value: String(ack) }]] });
const udp = (from: string, to: string): ProtocolHeader => ({ layer: 'transport', protocol: 'UDP', fields: [
  { name: '來源連接埠', value: from }, { name: '目的連接埠', value: to }] });

const LAPTOP = '192.0.2.10', WEB = '203.0.113.80';

// ---- Scene 1: ping -------------------------------------------------------------------------------------------------
const API = '203.0.113.25', PING_ID = '0x2b1c';
const PING_HEAD = ['icmp_seq', '回覆來源', 'ttl', 'time'];
const pingOut = (rows: string[][], changed?: number): NodeTable[] => [{ node: 'laptop', name: 'ping 輸出', head: PING_HEAD, rows, ...changed === undefined ? {} : { changed: [changed] } }];
const R1 = ['1', WEB, '60', '24.1 ms'], R3 = ['3', WEB, '60', '23.8 ms'];
const echo = (seq: number, to = WEB) => icmp(LAPTOP, to, 8, 0, 'Echo Request（回聲請求）', [{ name: '識別碼', value: PING_ID }, { name: '序號', value: String(seq) }], 64);
const reply = (seq: number) => icmp(WEB, LAPTOP, 0, 0, 'Echo Reply（回聲回覆）', [{ name: '識別碼', value: PING_ID }, { name: '序號', value: String(seq) }], 60);

/** Section 2: ping -c 3 www.example.com, one reply lost; then ping and TCP 443 to a host that drops ICMP. */
const ping: NetworkScene = {
  id: 'cn17-ping', title: 'ping：回聲請求、回覆、遺失，與擋掉 ICMP 的主機', model: 'tcp-ip',
  description: '筆電執行 ping -c 3 www.example.com（203.0.113.80，中間隔 4 台路由器），之後再 ping 另一台 API 伺服器 203.0.113.25，它前面的防火牆丟棄所有 ICMP，但允許 TCP 443。ICMP 訊息裝在 IP 封包裡（協定 1），但它屬於網際網路層，所以這裡把 IPv4 與 ICMP 的標頭畫在同一層。標頭是筆電上看到的值：送出的是送出時的值，收到的是抵達時的值。表格是 ping 印出的每一行。',
  nodes: [
    { id: 'laptop', label: '筆電', kind: 'host', addresses: [`IP ${LAPTOP}`] },
    { id: 'web', label: 'www.example.com', kind: 'server', addresses: [`IP ${WEB}`, '相隔 4 台路由器'] },
    { id: 'firewall', label: '防火牆', kind: 'router', addresses: ['丟棄所有 ICMP（不回應）', '允許 TCP 443'] },
    { id: 'api', label: 'API 伺服器', kind: 'server', addresses: [`IP ${API}`, 'TCP 443 監聽中'] },
  ],
  messages: [
    { id: 'echo-1', from: 'laptop', to: 'web', label: 'Echo Request（序號 1）', headers: [echo(1)], payload: '56 位元組的資料（開頭是送出時間），加上 8 位元組的 ICMP 標頭共 64 位元組',
      note: 'ping 送出 ICMP 類型 8、代碼 0 的 Echo Request。識別碼 0x2b1c 標出是哪一個 ping 程式送的，序號從 1 開始，每送一個加 1。筆電送出時 TTL 是 64（Linux 與 macOS 的常見初始值）。資料裡放了送出時間，回覆會原封不動帶回來，ping 用它算往返時間（RTT）。' },
    { id: 'reply-1', from: 'web', to: 'laptop', label: 'Echo Reply（序號 1）', headers: [reply(1)], payload: '原封不動帶回的 56 位元組資料',
      note: '伺服器回 ICMP 類型 0、代碼 0 的 Echo Reply，識別碼與序號照抄，ping 才知道這是第 1 個請求的回覆。伺服器送出時 TTL 是 64，經過 4 台路由器各減 1，抵達時是 60；ping 印出「64 bytes from 203.0.113.80: icmp_seq=1 ttl=60 time=24.1 ms」。從 ttl=60 可以推測對方大概從 64 開始、距離 4 跳，但回程不一定和去程走同一條路。',
      tables: pingOut([R1], 0) },
    { id: 'echo-2', from: 'laptop', to: 'web', label: 'Echo Request（序號 2）', headers: [echo(2)], payload: '56 位元組的資料',
      note: '一秒後送出第 2 個請求，序號 2，其他欄位相同。' },
    { id: 'reply-2', from: 'web', to: 'laptop', label: 'Echo Reply（序號 2，遺失）', lost: true, headers: [reply(2)], payload: '56 位元組的資料',
      note: '這個回覆在回程的某一段遺失了。Linux 的 ping 預設不印遺失的那一行，所以輸出裡直接從 icmp_seq=1 跳到 3；Windows 的 ping 則會印「Request timed out.」。偶爾掉一個封包很常見，持續的遺失才值得追查。',
      tables: pingOut([R1]) },
    { id: 'echo-3', from: 'laptop', to: 'web', label: 'Echo Request（序號 3）', headers: [echo(3)], payload: '56 位元組的資料',
      note: '再一秒後送出第 3 個請求，序號 3。' },
    { id: 'reply-3', from: 'web', to: 'laptop', label: 'Echo Reply（序號 3）', headers: [reply(3)], payload: '原封不動帶回的 56 位元組資料',
      note: '第 3 個回覆抵達，RTT 23.8 毫秒。ping 結束時印出統計：「3 packets transmitted, 2 received, 33.3333% packet loss」，以及「rtt min/avg/max/mdev = 23.800/23.950/24.100/0.150 ms」。遺失率是 1 ÷ 3；RTT 只用收到的 2 個回覆計算。',
      tables: pingOut([R1, R3], 1) },
    { id: 'echo-api', from: 'laptop', to: 'firewall', label: 'Echo Request → API 伺服器（被丟棄）', lost: true, headers: [echo(1, API)], payload: '56 位元組的資料',
      note: '改 ping API 伺服器 203.0.113.25。防火牆的規則是丟棄所有 ICMP，而且不回任何訊息，請求在這裡消失。ping 一直等不到回覆，最後印出 100% packet loss。只看這一行，很容易以為 API 伺服器關機了。' },
    { id: 'syn-api', from: 'laptop', to: 'api', label: 'SYN → 443', headers: [tcp('52300', '443', 'SYN'), ipv4(LAPTOP, API, 'tcp')], payload: '沒有資料（0 位元組）',
      note: '換一個方法：對同一台主機的 443 連接埠發起 TCP 連線（例如 curl -v https://203.0.113.25/，或 nc -vz 203.0.113.25 443）。防火牆允許 TCP 443，SYN 送到了伺服器。' },
    { id: 'syn-ack-api', from: 'api', to: 'laptop', label: 'SYN, ACK', headers: [tcp('443', '52300', 'SYN, ACK'), ipv4(API, LAPTOP, 'tcp')], payload: '沒有資料（0 位元組）',
      note: '伺服器回 SYN, ACK：主機開著，443 也有程式在監聽。ping 不通只說明 ICMP Echo 沒有得到回覆，原因可能是防火牆擋掉 ICMP，不能推論主機關機。要判斷一個網路服務在不在，直接連它的連接埠。' },
  ],
};

// ---- Scene 2: traceroute -------------------------------------------------------------------------------------------
const HOP = { r1: '192.0.2.1', r2: '198.51.100.1', r4: '203.0.113.1' };
const TRACE_HEAD = ['跳', '位址', '三次探測的 RTT'];
const T1 = ['1', HOP.r1, '0.912 ms　0.804 ms　0.781 ms'], T2 = ['2', HOP.r2, '8.214 ms　8.031 ms　8.402 ms'];
const T3 = ['3', '（沒有回覆）', '*　*　*'], T4 = ['4', HOP.r4, '23.514 ms　23.102 ms　23.377 ms'], T5 = ['5', WEB, '24.033 ms　23.901 ms　24.187 ms'];
const traceOut = (rows: string[][], changed?: number): NodeTable[] => [{ node: 'laptop', name: 'traceroute 輸出', head: TRACE_HEAD, rows, ...changed === undefined ? {} : { changed: [changed] } }];
/** The first of the three probes for a TTL: destination ports count up from 33434, one per probe. */
const probePort = (ttl: number) => String(33434 + 3 * (ttl - 1));
const probe = (ttl: number) => [udp('45001', probePort(ttl)), ipv4(LAPTOP, WEB, 'udp', ttl)];
const QUOTED = (ttl: number) => ({ name: '內含', value: `原探測的 IP 標頭與其後至少 8 位元組（UDP 標頭，目的連接埠 ${probePort(ttl)}）` });
const exceeded = (from: string, ttl: number) => [icmp(from, LAPTOP, 11, 0, 'Time Exceeded（傳送途中 TTL 歸零）', [QUOTED(ttl)])];

/** Section 3: traceroute -n www.example.com, one probe per TTL drawn, hop 3 silent. */
const trace: NetworkScene = {
  id: 'cn17-traceroute', title: 'traceroute：TTL 一次加 1，和一個不回話的路由器', model: 'tcp-ip',
  description: '筆電在 Linux 上執行 traceroute -n www.example.com，第一行印出「traceroute to www.example.com (203.0.113.80), 30 hops max, 60 byte packets」。每個 TTL 送 3 個 UDP 探測封包，目的連接埠從 33434 開始、每個探測加 1，這裡只畫每個 TTL 的第一個。探測的目的 IP 一律是終點 203.0.113.80；標頭是筆電送出時的值。第 3 跳的路由器設定成不送 ICMP Time Exceeded。表格是 traceroute 印出的每一行。',
  nodes: [
    { id: 'laptop', label: '筆電', kind: 'host', addresses: [`IP ${LAPTOP}`] },
    { id: 'r1', label: 'R1 家用路由器', kind: 'router', addresses: [`IP ${HOP.r1}`] },
    { id: 'r2', label: 'R2 ISP 路由器', kind: 'router', addresses: [`IP ${HOP.r2}`] },
    { id: 'r3', label: 'R3 骨幹路由器', kind: 'router', addresses: ['照常轉送', '不送 ICMP Time Exceeded'] },
    { id: 'r4', label: 'R4 機房路由器', kind: 'router', addresses: [`IP ${HOP.r4}`] },
    { id: 'web', label: 'www.example.com', kind: 'server', addresses: [`IP ${WEB}`, 'UDP 33434 以上沒有程式監聽'] },
  ],
  messages: [
    { id: 'probe-1', from: 'laptop', to: 'r1', label: '探測 TTL 1（UDP → 33434）', headers: probe(1), payload: '32 位元組的探測資料（IP 20 + UDP 8 + 32 = 60 位元組）',
      note: '第一個探測的 TTL 是 1。R1 收到後把 TTL 減 1 得 0，不能再轉送，於是丟棄它。注意目的 IP 是終點 203.0.113.80，不是 R1：traceroute 不是去「問」每台路由器，而是故意讓封包在第 n 跳過期。' },
    { id: 'exceeded-1', from: 'r1', to: 'laptop', label: 'ICMP Time Exceeded（R1）', headers: exceeded(HOP.r1, 1), payload: '被丟棄的探測封包開頭',
      note: 'R1 回 ICMP 類型 11、代碼 0（Time Exceeded），來源 IP 是 R1 自己的 192.0.2.1。訊息裡附上被丟棄探測的 IP 標頭與 UDP 標頭，traceroute 從目的連接埠 33434 認出這是 TTL 1 的探測，並用送出到收到的時間算出 RTT。同一個 TTL 的另外兩個探測也一樣，所以每一行有三個 RTT。',
      tables: traceOut([T1], 0) },
    { id: 'probe-2', from: 'laptop', to: 'r2', label: '探測 TTL 2（UDP → 33437）', headers: probe(2), payload: '32 位元組的探測資料',
      note: 'TTL 1 的三個探測用了 33434–33436，所以 TTL 2 的第一個探測是 33437。R1 把 TTL 從 2 減成 1 後照常轉送；R2 再減 1 得 0，丟棄它。' },
    { id: 'exceeded-2', from: 'r2', to: 'laptop', label: 'ICMP Time Exceeded（R2）', headers: exceeded(HOP.r2, 2), payload: '被丟棄的探測封包開頭',
      note: 'R2 回 Time Exceeded，來源 IP 198.51.100.1，這就是第 2 跳。RTT 約 8 毫秒，比第 1 跳多出的時間大多花在家裡到 ISP 的那一段。',
      tables: traceOut([T1, T2], 1) },
    { id: 'probe-3', from: 'laptop', to: 'r3', label: '探測 TTL 3（UDP → 33440，沒有回音）', lost: true, headers: probe(3), payload: '32 位元組的探測資料',
      note: '探測其實送到了 R3，R3 也把 TTL 減成 0、丟棄了它，但 R3 被設定成不送 ICMP Time Exceeded（也有路由器是限制產生 ICMP 的速率，或由防火牆濾掉 ICMP）。從筆電看，三個探測都石沉大海；每個等滿 5 秒後，traceroute 印出「3  * * *」。',
      tables: traceOut([T1, T2, T3], 2) },
    { id: 'probe-4', from: 'laptop', to: 'r4', label: '探測 TTL 4（UDP → 33443）', headers: probe(4), payload: '32 位元組的探測資料',
      note: 'TTL 4 的探測經過 R1、R2、R3，到 R4 歸零。這個探測能走到 R4，代表 R3 雖然不回話，轉送卻是正常的。' },
    { id: 'exceeded-4', from: 'r4', to: 'laptop', label: 'ICMP Time Exceeded（R4）', headers: exceeded(HOP.r4, 4), payload: '被丟棄的探測封包開頭',
      note: 'R4 回 Time Exceeded，來源 IP 203.0.113.1。第 3 跳的 * 之後還有正常的第 4 跳，所以 * 不代表那裡斷線。',
      tables: traceOut([T1, T2, T3, T4], 3) },
    { id: 'probe-5', from: 'laptop', to: 'web', label: '探測 TTL 5（UDP → 33446）', headers: probe(5), payload: '32 位元組的探測資料',
      note: 'TTL 5 的探測經過 4 台路由器後還剩 TTL 1，送到了終點本身。主機收到給自己的封包不會因為 TTL 而丟棄，而是交給 UDP；可是 33446 沒有程式在監聽。' },
    { id: 'unreachable', from: 'web', to: 'laptop', label: 'ICMP Port Unreachable（終點）',
      headers: [icmp(WEB, LAPTOP, 3, 3, 'Destination Unreachable：Port Unreachable（連接埠無法到達）', [QUOTED(5)])], payload: '被拒絕的探測封包開頭',
      note: '終點回 ICMP 類型 3、代碼 3（連接埠無法到達），來源 IP 是 203.0.113.80。traceroute 看到這個回應，知道已經抵達終點，於是停止。traceroute 故意挑一般不會有程式監聽的高號連接埠，就是為了在終點換到這個回應。',
      tables: traceOut([T1, T2, T3, T4, T5], 4) },
  ],
};

// ---- Scene 3: dig ---------------------------------------------------------------------------------------------------
const RES_A = '198.51.100.53', RES_B = '198.51.100.54';
const DIG_HEAD = ['查詢', '伺服器', 'status', 'ANSWER', '答案'];
const D1 = ['wwww.example.com A', RES_A, 'NXDOMAIN', '0', '（沒有答案；AUTHORITY 區段是 example.com 的 SOA）'];
const D2 = ['www.example.com A', RES_A, 'NOERROR', '1', 'www.example.com.　300　IN　A　203.0.113.80'];
const D3 = ['www.example.com A（@198.51.100.54）', RES_B, 'SERVFAIL', '0', '（沒有答案）'];
const digOut = (rows: string[][], changed?: number): NodeTable[] => [{ node: 'laptop', name: 'dig 輸出', head: DIG_HEAD, rows, ...changed === undefined ? {} : { changed: [changed] } }];
const dnsQ = (id: string, question: string): ProtocolHeader => ({ layer: 'application', protocol: 'DNS', fields: [
  { name: 'ID', value: id }, { name: 'QR', value: '0（查詢）' }, { name: 'RD', value: '1' }, { name: '問題', value: question }] });
const dnsR = (id: string, question: string, rcode: string, answers: string, more: { name: string; value: string }[]): ProtocolHeader => ({ layer: 'application', protocol: 'DNS', fields: [
  { name: 'ID', value: id }, { name: 'QR', value: '1（回應）' }, { name: 'RD', value: '1' }, { name: 'RA', value: '1' }, { name: '問題', value: question },
  { name: 'RCODE', value: rcode }, { name: 'ANSWER 數', value: answers }, ...more] });
const toResolver = (resolver: string, port: string) => [udp(port, '53'), ipv4(LAPTOP, resolver, 'udp')];
const fromResolver = (resolver: string, port: string) => [udp('53', port), ipv4(resolver, LAPTOP, 'udp')];

/** Section 4: a typo (NXDOMAIN), the right name (NOERROR), and the same name at a second resolver (SERVFAIL). */
const dig: NetworkScene = {
  id: 'cn17-dig', title: 'dig：打錯字的 NXDOMAIN、正確的答案，與出問題的解析器', model: 'tcp-ip',
  description: '筆電的預設 DNS 解析器是 198.51.100.53。先執行 dig wwww.example.com（多打了一個 w），再執行 dig www.example.com；最後用 dig @198.51.100.54 www.example.com 指定另一台解析器問同一個名稱，那是同事的筆電在用的解析器。表格是三次 dig 輸出的重點：HEADER 那一行的 status、ANSWER 的筆數與 ANSWER SECTION。',
  nodes: [
    { id: 'laptop', label: '筆電', kind: 'host', addresses: [`IP ${LAPTOP}`, `預設解析器 ${RES_A}`] },
    { id: 'res-a', label: '解析器 A', kind: 'resolver', addresses: [`IP ${RES_A}`, '遞迴解析器（運作正常）'] },
    { id: 'res-b', label: '解析器 B', kind: 'resolver', addresses: [`IP ${RES_B}`, '遞迴解析器（連不到 example.com 的權威伺服器）'] },
  ],
  messages: [
    { id: 'typo-query', from: 'laptop', to: 'res-a', label: 'DNS 查詢 wwww.example.com A', headers: [dnsQ('0x7e21', 'wwww.example.com A'), ...toResolver(RES_A, '40211')], payload: 'DNS 查詢',
      note: 'dig 沒有指定伺服器，就用系統設定的解析器 198.51.100.53，從臨時連接埠送到 UDP 53。RD=1 請解析器替我們遞迴查詢。' },
    { id: 'typo-response', from: 'res-a', to: 'laptop', label: 'NXDOMAIN', payload: 'DNS 回應',
      headers: [dnsR('0x7e21', 'wwww.example.com A', '3（NXDOMAIN）', '0', [{ name: 'AUTHORITY 區段', value: 'example.com 的 SOA 紀錄（否定答案可以快取多久由它決定）' }]), ...fromResolver(RES_A, '40211')],
      note: '解析器問到 example.com 的權威伺服器，得到「這個名稱不存在」：RCODE 3，dig 印出 status: NXDOMAIN，ANSWER: 0。AUTHORITY 區段附上 example.com 的 SOA，證明答案來自這個區域的權威資料。nslookup 對同一件事印的是「server can\'t find wwww.example.com: NXDOMAIN」。網址打錯、紀錄還沒建立或已經刪除，看到的都是它。',
      tables: digOut([D1], 0) },
    { id: 'good-query', from: 'laptop', to: 'res-a', label: 'DNS 查詢 www.example.com A', headers: [dnsQ('0x3c90', 'www.example.com A'), ...toResolver(RES_A, '40212')], payload: 'DNS 查詢',
      note: '把名稱改對，再問同一台解析器。' },
    { id: 'good-response', from: 'res-a', to: 'laptop', label: 'NOERROR，1 筆答案', payload: 'DNS 回應',
      headers: [dnsR('0x3c90', 'www.example.com A', '0（NOERROR）', '1', [{ name: '答案', value: 'www.example.com A 203.0.113.80（TTL 300）' }]), ...fromResolver(RES_A, '40212')],
      note: 'status: NOERROR，ANSWER: 1。ANSWER SECTION 的一行依序是名稱、TTL（秒）、類別 IN、類型 A 與位址 203.0.113.80。TTL 300 表示解析器與筆電可以把這個答案用 5 分鐘；剛改過 DNS 紀錄時，還在快取裡的舊答案要等 TTL 倒數完才會消失。',
      tables: digOut([D1, D2], 1) },
    { id: 'b-query', from: 'laptop', to: 'res-b', label: 'dig @198.51.100.54 www.example.com', headers: [dnsQ('0x51d4', 'www.example.com A'), ...toResolver(RES_B, '40213')], payload: 'DNS 查詢',
      note: '同事說網站打不開。他的筆電用的是解析器 B，所以用 @198.51.100.54 指定伺服器，問完全相同的名稱。@ 只改變問哪一台，問題本身不變，兩個答案才能直接比較。' },
    { id: 'b-response', from: 'res-b', to: 'laptop', label: 'SERVFAIL', payload: 'DNS 回應',
      headers: [dnsR('0x51d4', 'www.example.com A', '2（SERVFAIL）', '0', []), ...fromResolver(RES_B, '40213')],
      note: '解析器 B 回 RCODE 2，status: SERVFAIL：它沒辦法完成這次解析（這裡是它連不到 example.com 的權威伺服器）。同一個名稱，解析器 A 給出正確答案，解析器 B 失敗，所以名稱本身沒問題，問題在解析器 B 或它往外的路。NXDOMAIN 是「確定不存在」，SERVFAIL 是「我查不出來」，兩者意思完全不同。',
      tables: digOut([D1, D2, D3], 2) },
  ],
};

// ---- Scene 4: connection refused vs timed out ----------------------------------------------------------------------
const CAP_HEAD = ['#', '時間（秒）', '封包（tcpdump -n -S）'];
const C1 = ['1', '0.000000', 'IP 192.0.2.10.52345 > 203.0.113.80.8080: Flags [S], seq 12000'];
const C2 = ['2', '0.025104', 'IP 203.0.113.80.8080 > 192.0.2.10.52345: Flags [R.], seq 0, ack 12001'];
const C3 = ['3', '1.000000', 'IP 192.0.2.10.52346 > 203.0.113.80.9090: Flags [S], seq 15000'];
const C4 = ['4', '2.001233', 'IP 192.0.2.10.52346 > 203.0.113.80.9090: Flags [S], seq 15000'];
const C5 = ['5', '4.005871', 'IP 192.0.2.10.52346 > 203.0.113.80.9090: Flags [S], seq 15000'];
const capture = (rows: string[][], changed?: number): NodeTable[] => [{ node: 'laptop', name: '封包擷取', head: CAP_HEAD, rows, ...changed === undefined ? {} : { changed: [changed] } }];

/** Section 5: curl to 8080 (no listener: RST/ACK) and to 9090 (dropped by a firewall: SYN retransmissions, timeout). */
const refused: NetworkScene = {
  id: 'cn17-refused-vs-timeout', title: 'curl 連不上：被拒絕與逾時', model: 'tcp-ip',
  description: '同時開著 tcpdump -n -S -i eth0 "host 203.0.113.80 and tcp" 擷取封包（-S 印出實際序號）。先執行 curl -v http://www.example.com:8080/：伺服器上沒有程式在 8080 監聽。再執行 curl -v --connect-timeout 5 http://www.example.com:9090/：前面的防火牆默默丟棄送往 9090 的封包。兩次 DNS 都已解析成 203.0.113.80。表格是擷取到的封包，時間從第一個封包起算。',
  nodes: [
    { id: 'laptop', label: '筆電', kind: 'host', addresses: [`IP ${LAPTOP}`, '執行 curl 與 tcpdump'] },
    { id: 'firewall', label: '防火牆', kind: 'router', addresses: ['允許 TCP 80、443、8080', '丟棄 TCP 9090（不回應）'] },
    { id: 'server', label: 'www.example.com', kind: 'server', addresses: [`IP ${WEB}`, '只在 TCP 80、443 監聽'] },
  ],
  messages: [
    { id: 'syn-8080', from: 'laptop', to: 'server', label: 'SYN → 8080', headers: [tcp('52345', '8080', 'SYN', 12000), ipv4(LAPTOP, WEB, 'tcp')], payload: '沒有資料（0 位元組）',
      note: 'curl -v 先印「Trying 203.0.113.80:8080...」，作業系統送出 SYN，起始序號 12000。防火牆允許 8080，SYN 送到了伺服器。tcpdump 把 SYN 印成 Flags [S]。',
      tables: capture([C1], 0) },
    { id: 'rst', from: 'server', to: 'laptop', label: 'RST, ACK', headers: [tcp('8080', '52345', 'RST, ACK', 0, 12001), ipv4(WEB, LAPTOP, 'tcp')], payload: '沒有資料（0 位元組）',
      note: '伺服器的作業系統找不到在 8080 監聽的 socket，立刻回 RST。收到的 SYN 沒有 ACK 旗標，所以 RST 區段的 Seq 是 0，並設 ACK、Ack = 12000 + 1 = 12001；tcpdump 印成 Flags [R.]（點代表 ACK）。25 毫秒後 curl 就失敗了：訊息裡有 Connection refused，結束代碼 7（無法連線）。這證明 DNS 與路由都通，主機也開著，問題在傳輸層：這個連接埠沒有服務。',
      tables: capture([C1, C2], 1) },
    { id: 'syn-9090', from: 'laptop', to: 'firewall', label: 'SYN → 9090（被丟棄）', lost: true, headers: [tcp('52346', '9090', 'SYN', 15000), ipv4(LAPTOP, WEB, 'tcp')], payload: '沒有資料（0 位元組）',
      note: '改連 9090，新的連線：來源連接埠 52346、起始序號 15000。防火牆丟棄 SYN，也不回任何訊息。擷取只看得到自己送出的 SYN，沒有任何回應。',
      tables: capture([C1, C2, C3], 2) },
    { id: 'syn-9090-r1', from: 'laptop', to: 'firewall', label: 'SYN 重送（1 秒後，被丟棄）', lost: true, headers: [tcp('52346', '9090', 'SYN', 15000), ipv4(LAPTOP, WEB, 'tcp')], payload: '沒有資料（0 位元組）',
      note: 'Linux 等了 1 秒沒有回應，重送同一個 SYN：Seq 仍是 15000，因為它從沒被確認。又被丟棄。',
      tables: capture([C1, C2, C3, C4], 3) },
    { id: 'syn-9090-r2', from: 'laptop', to: 'firewall', label: 'SYN 重送（再 2 秒後，被丟棄）', lost: true, headers: [tcp('52346', '9090', 'SYN', 15000), ipv4(LAPTOP, WEB, 'tcp')], payload: '沒有資料（0 位元組）',
      note: '等待時間加倍為 2 秒，再重送一次，仍然沒有回應。從第一個 SYN 算起滿 5 秒時，--connect-timeout 5 到期，curl 放棄並回報逾時，結束代碼 28。沒有加 --connect-timeout 時，要等作業系統重送完 SYN（Linux 預設約 2 分鐘）才會失敗。「一直轉圈然後逾時」加上「擷取只看到重送的 SYN」，是封包被丟棄的特徵：防火牆、或路由沒有通到那裡。',
      tables: capture([C1, C2, C3, C4, C5], 4) },
  ],
};

// ---- Scene 5: 502 from a reverse proxy -----------------------------------------------------------------------------
const PROXY_IN = '10.0.0.1', UPSTREAM = '10.0.0.20';
const CURL_HEAD = ['行', '前綴', '內容'];
const CURL_LINES = [
  ['1', '*', 'Trying 203.0.113.80:443...'],
  ['2', '*', 'Connected to www.example.com (203.0.113.80) port 443'],
  ['3', '*', 'SSL connection using TLSv1.3 / TLS_AES_128_GCM_SHA256'],
  ['4', '>', 'GET / HTTP/1.1'],
  ['5', '>', 'Host: www.example.com'],
  ['6', '<', 'HTTP/1.1 502 Bad Gateway'],
  ['7', '<', 'Server: nginx'],
];
const http = (fields: [string, string][]): ProtocolHeader => ({ layer: 'application', protocol: 'HTTP/1.1', fields: fields.map(([name, value]) => ({ name, value })) });

/** Section 6: every layer below HTTP works; the proxy's upstream refuses and the proxy answers 502. */
const badGateway: NetworkScene = {
  id: 'cn17-bad-gateway', title: '反向代理回 502：上游程式停了', model: 'tcp-ip',
  description: '筆電執行 curl -v https://www.example.com/。www.example.com 是一台 nginx 反向代理（對外 203.0.113.80:443，對內 10.0.0.1），它把請求轉給內部的應用程式伺服器 10.0.0.20:8000；那個程式剛剛當掉了。HTTP 在 443 上是 TLS 解密後的內容（curl -v 印出的也是加密前與解密後的標頭）。表格是 curl -v 的輸出與 nginx 的錯誤日誌。',
  nodes: [
    { id: 'laptop', label: '筆電', kind: 'host', addresses: [`IP ${LAPTOP}`, '執行 curl -v'] },
    { id: 'proxy', label: 'nginx 反向代理', kind: 'server', addresses: [`IP ${WEB}（對外，TCP 443）`, `IP ${PROXY_IN}（對內）`] },
    { id: 'app', label: '應用程式伺服器', kind: 'server', addresses: [`IP ${UPSTREAM}`, 'TCP 8000（程式已停止）'] },
  ],
  messages: [
    { id: 'request', from: 'laptop', to: 'proxy', label: 'GET /（TLS 內）',
      headers: [http([['起始列', 'GET / HTTP/1.1'], ['Host', 'www.example.com'], ['Accept', '*/*']]), tcp('52400', '443', 'PSH, ACK'), ipv4(LAPTOP, WEB, 'tcp')],
      payload: '沒有本文',
      note: '在這之前，curl -v 已經印出「Connected to www.example.com (203.0.113.80) port 443」與「SSL connection using TLSv1.3」：DNS 解析、路由、TCP 443 的交握與 TLS 交握都成功了。以 > 開頭的行是 curl 送出的請求標頭。',
      tables: [{ node: 'laptop', name: 'curl -v 輸出', head: CURL_HEAD, rows: CURL_LINES.slice(0, 5), changed: [3, 4] }] },
    { id: 'upstream-syn', from: 'proxy', to: 'app', label: 'SYN → 10.0.0.20:8000', headers: [tcp('41000', '8000', 'SYN', 70000), ipv4(PROXY_IN, UPSTREAM, 'tcp')], payload: '沒有資料（0 位元組）',
      note: 'nginx 依設定（proxy_pass http://10.0.0.20:8000）要把請求轉給上游，先對 10.0.0.20 的 8000 連接埠發起新的 TCP 連線。這是代理與上游之間的另一條連線，筆電完全看不到。' },
    { id: 'upstream-rst', from: 'app', to: 'proxy', label: 'RST, ACK', headers: [tcp('8000', '41000', 'RST, ACK', 0, 70001), ipv4(UPSTREAM, PROXY_IN, 'tcp')], payload: '沒有資料（0 位元組）',
      note: '應用程式已經停止，8000 沒有程式在監聽，上游主機回 RST, ACK。nginx 在錯誤日誌寫下一行：connect() failed (111: Connection refused) while connecting to upstream。111 是 Linux 的 ECONNREFUSED，和第 5 節 curl 遇到的是同一件事，只是這次發生在代理與上游之間。',
      tables: [{ node: 'proxy', name: 'nginx 錯誤日誌', head: ['時間', '等級', '訊息'], changed: [0], rows: [
        ['2026/11/22 10:15:02', 'error', 'connect() failed (111: Connection refused) while connecting to upstream, client: 192.0.2.10, server: www.example.com, request: "GET / HTTP/1.1", upstream: "http://10.0.0.20:8000/", host: "www.example.com"']] }] },
    { id: 'bad-gateway', from: 'proxy', to: 'laptop', label: 'HTTP/1.1 502 Bad Gateway',
      headers: [http([['起始列', 'HTTP/1.1 502 Bad Gateway'], ['狀態碼', '502'], ['Server', 'nginx'], ['Content-Type', 'text/html']]), tcp('443', '52400', 'PSH, ACK'), ipv4(WEB, LAPTOP, 'tcp')],
      payload: 'nginx 預設的「502 Bad Gateway」錯誤頁',
      note: 'nginx 拿不到上游的回應，只好自己回 502 Bad Gateway：「我是閘道，我後面的伺服器給了無效的回應或連不上」。Server: nginx 說明這個回應是代理產生的，不是應用程式。以 < 開頭的行是收到的回應標頭。網站「打不開」，但 DNS、路由、連接埠與 TLS 都正常；問題在應用層，要查的是上游程式與代理的日誌。如果上游是太慢而不是拒絕，nginx 等到逾時後回的會是 504 Gateway Timeout。',
      tables: [{ node: 'laptop', name: 'curl -v 輸出', head: CURL_HEAD, rows: CURL_LINES, changed: [5, 6] }] },
  ],
};

/** CN17 Network troubleshooting tools (packet-journey): scenes and exercises checked by the network capability. */
export const CN17: LessonContent = {
  lessonId: 'CN17',
  motivation: '「網站打不開」可能是十幾種不同的問題：網址打錯、DNS 解析器故障、某段路由斷了、防火牆擋住連接埠、服務沒啟動、憑證過期，或後端程式當掉。每一種的修法都不一樣，找錯地方只會白忙。網路工程師不靠猜，而是用 ping、traceroute、dig、curl 與封包擷取，一層一層取得證據。這一課逐步看每個工具實際送出什麼封包、收到什麼回應，學會讀它們的輸出，最後能從幾行輸出判斷問題出在 DNS、路由、連接埠，還是應用層。',
  sections: [
    {
      id: 'layered', title: '分層除錯：先決定從哪一層看起',
      blocks: [
        { type: 'p', text: '網路是一層疊一層的（CN01）：上層要能運作，下面每一層都要先正常。分層除錯就是利用這個關係縮小範圍：每做一個檢查，就確定某一層以下是好的，或某一層出了問題。常見的做法有三種。由下往上（bottom-up）從網路線、Wi-Fi 與 IP 位址開始，一層一層往上確認，最穩當但最慢。由上往下（top-down）從使用者看到的錯誤開始，適合應用層錯誤訊息很明確的時候。從中間切一刀（divide and conquer）則挑一個能一次檢查好幾層的工具先做：例如 curl 能連上 TCP 連接埠，就代表 DNS、路由與連接埠都通，問題只可能在上面；連不上，就往下查。' },
        { type: 'table', head: ['工具', '主要看哪一層', '一次成功能證明什麼'], rows: [
          ['ping', '網際網路層（ICMP）', '到對方的 IP 路徑雙向都通，而且對方願意回 ICMP Echo'],
          ['traceroute', '網際網路層（TTL 與 ICMP Time Exceeded）', '封包一跳一跳經過了哪些路由器、在哪一跳之後就沒有回應'],
          ['dig、nslookup', '應用層（DNS）', '名稱解析得到什麼答案、由哪一台解析器回答'],
          ['curl -v、瀏覽器開發者工具', '傳輸層到應用層（TCP、TLS、HTTP）', '連接埠接受連線、TLS 交握成功、伺服器回了哪個狀態碼與標頭'],
          ['tcpdump、Wireshark（封包擷取）', '所有層', '線路上實際有哪些封包：送出了沒有、有沒有回應、回應是什麼'],
        ] },
        { type: 'p', text: '面對「網站打不開」，實務上常用從中間切入、再往兩邊收斂的順序：先用 dig 確認名稱解析得到正確的位址；再用 curl -v 連那個位址，看卡在 TCP 連線、TLS，還是 HTTP 回應；連線失敗才用 ping、traceroute 與封包擷取往下查路由與防火牆。每一步都要記下證據（指令與輸出），不要靠「應該是」來跳過某一層。' },
        { type: 'callout', tone: 'tip', title: '先問「別人也打不開嗎」', text: '換一台電腦、換一個網路（例如手機改用行動網路）、換一台 DNS 解析器各試一次，能很快把問題切成「我這邊」還是「伺服器那邊」。這也是從中間切一刀：一次比較就排除了一半的可能。' },
      ],
    },
    {
      id: 'ping', title: 'ping：ICMP Echo、RTT 與封包遺失',
      blocks: [
        { type: 'p', text: 'ping 送出 ICMP Echo Request（類型 8、代碼 0），對方的作業系統收到後回 Echo Reply（類型 0、代碼 0），識別碼與序號照抄、資料原封不動帶回。ping 依序號配對請求與回覆，印出每個回覆的往返時間（RTT）與抵達時的 TTL；結束時再印出送出幾個、收到幾個、遺失率，以及 RTT 的最小、平均與最大值。RTT 忽高忽低代表路上有排隊或壅塞；持續的遺失才值得追查，偶爾掉一個很常見。' },
        { type: 'example', id: 'cn17-ping' },
        { type: 'table', head: ['ICMP 類型', '代碼', '名稱', '除錯時在哪裡看到'], rows: [
          ['8', '0', 'Echo Request', 'ping 送出的請求；Windows 的 tracert 也用它當探測'],
          ['0', '0', 'Echo Reply', 'ping 收到的回覆'],
          ['11', '0', 'Time Exceeded（傳送途中 TTL 歸零）', 'traceroute 用它找出沿途每一跳；路由迴圈時也會出現（CN07）'],
          ['3', '3', 'Destination Unreachable：Port Unreachable', 'UDP 送到沒人監聽的連接埠；Unix traceroute 抵達終點的訊號'],
          ['3', '1、13', 'Host Unreachable、Communication Administratively Prohibited', '路由器找不到主機，或防火牆明確拒絕（有些防火牆選擇回這個，而不是默默丟棄）'],
        ] },
        { type: 'p', text: '回覆的 TTL 可以粗估距離：作業系統常見的初始值是 64（Linux、macOS）、128（Windows）與 255（許多網路設備），抵達時的 TTL 往上找最接近的初始值，相減就是大約經過幾台路由器。情境裡的 ttl=60，可以推測對方從 64 出發、經過 4 跳。這只是估計：回程可能和去程走不同的路，初始值也可以被改掉。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：ping 不通就代表主機關機', text: 'ping 不通只表示 ICMP Echo 沒有得到回覆。很多伺服器、雲端主機與公司防火牆會丟棄 ICMP，主機與服務卻完全正常；情境裡的 API 伺服器 ping 100% 遺失，TCP 443 卻立刻回了 SYN, ACK。反過來，ping 得通也不代表網站正常：它沒有檢查任何連接埠或應用程式。要判斷服務在不在，直接連它的連接埠（curl、nc）。' },
      ],
    },
    {
      id: 'traceroute', title: 'traceroute：讓封包在第 n 跳過期',
      blocks: [
        { type: 'p', text: 'traceroute 利用 TTL（CN07）找出沿途的路由器：先送 TTL 1 的探測，第一台路由器把 TTL 減成 0、丟棄封包，並回 ICMP Time Exceeded（類型 11、代碼 0），回應的來源 IP 就是第 1 跳的位址；再送 TTL 2、TTL 3……，直到抵達終點。每個 TTL 預設送 3 個探測，所以每一行有三個 RTT；如果路由器之間做了負載平衡，同一行的三個探測甚至可能來自不同的位址。' },
        { type: 'example', id: 'cn17-traceroute' },
        { type: 'table', head: ['實作', '探測封包', '怎麼知道到終點了'], rows: [
          ['Linux、macOS 的 traceroute（預設）', 'UDP，目的連接埠從 33434 起每個探測加 1', '終點回 ICMP Port Unreachable（類型 3、代碼 3）'],
          ['Windows 的 tracert', 'ICMP Echo Request（類型 8）', '終點回 Echo Reply（類型 0）'],
          ['traceroute -I', 'ICMP Echo Request', '終點回 Echo Reply'],
          ['traceroute -T -p 443（Linux）', 'TCP SYN 到指定連接埠', '終點回 SYN, ACK 或 RST'],
        ] },
        { type: 'p', text: '探測方式不同，防火牆的待遇也不同：擋 UDP 高號連接埠的網路裡，Unix 的 traceroute 最後幾跳會全是 *，Windows 的 tracert 卻可能走得到；只允許 HTTPS 的網路裡，用 TCP 443 探測最容易走到終點。讀輸出時看兩件事：RTT 在哪一跳突然大幅增加（那一段的鏈路遠或擁擠，但若之後每一跳都跟著增加才算數），以及從哪一跳開始一路都是 * 再也沒有回應。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：traceroute 某一跳顯示 * 就代表那裡斷線', text: '* 只表示那一跳的路由器沒有回 Time Exceeded：它可能被設定成不回、限制了產生 ICMP 的速率，或回應被防火牆濾掉。只要後面的跳數還有回應（情境的第 4、5 跳），封包就正常經過了那台路由器。真正值得懷疑的是從某一跳起之後全部都是 *，而且 curl 也連不到終點；即使如此，也要記得終點本身可能只是擋掉了探測用的協定。' },
      ],
    },
    {
      id: 'dig', title: 'dig 與 nslookup：讀 DNS 的回答',
      blocks: [
        { type: 'p', text: 'dig 送出一個 DNS 查詢，把回應完整印出來。先看 HEADER 那一行的 status（也就是 RCODE），再看 flags 與各區段的筆數，最後看 ANSWER SECTION：每一筆依序是名稱、TTL（秒）、類別（IN）、類型與值。沒有指定伺服器時，dig 問系統設定的解析器；在名稱前加上 @位址，例如 `dig @198.51.100.54 www.example.com`，就改問那一台。`dig +short` 只印答案；nslookup 是 Windows 也內建的類似工具，輸出比較簡短。' },
        { type: 'example', id: 'cn17-dig' },
        { type: 'table', head: ['status', 'RCODE', '意思', '下一步'], rows: [
          ['NOERROR，ANSWER 有資料', '0', '名稱存在，答案就在 ANSWER SECTION', '確認位址是不是預期的那一個（舊紀錄、快取未過期）'],
          ['NOERROR，ANSWER: 0', '0', '名稱存在，但沒有這個類型的紀錄（例如只有 AAAA 沒有 A）', '換類型查，或檢查 CNAME 指向'],
          ['NXDOMAIN', '3', '權威資料說這個名稱不存在', '檢查拼字；確認紀錄有建立在正確的區域'],
          ['SERVFAIL', '2', '解析器沒辦法完成解析：連不到權威伺服器、DNSSEC 驗證失敗等', '用 @ 換另一台解析器比較；用 dig +cd 關閉 DNSSEC 檢查再試'],
          ['REFUSED', '5', '這台伺服器拒絕為你服務（例如不對外提供遞迴查詢）', '確認問的是不是你該用的解析器'],
        ] },
        { type: 'p', text: '比較解析器是 DNS 除錯最有力的方法：同一個名稱，在不同解析器得到不同結果，問題就在解析器那一端；每一台都得到同樣的錯誤，問題才在網域本身的設定。剛改過紀錄時，舊答案會在各解析器的快取裡留到 TTL 倒數完（CN12），所以「我這邊是新位址、同事那邊還是舊位址」通常是快取，不是設定錯誤。如果 A 解析器不做 DNSSEC 驗證、B 有做，B 的 SERVFAIL 也可能表示網域的簽章真的壞了，用 dig +cd 可以分辨。' },
        { type: 'callout', tone: 'note', title: '瀏覽器顯示的 DNS 錯誤', text: 'Chrome 的 ERR_NAME_NOT_RESOLVED 與 curl 的「Could not resolve host」（結束代碼 6）都只說明名稱沒有解析成功，不分 NXDOMAIN 或 SERVFAIL。要知道是哪一種，用 dig 問一次，看 status。' },
      ],
    },
    {
      id: 'curl-and-capture', title: 'curl -v、開發者工具與封包擷取',
      blocks: [
        { type: 'p', text: 'curl -v 把一次 HTTP 請求的每個階段都印出來：以 * 開頭的是 curl 自己的進度（Trying 位址:連接埠、Connected to、TLS 交握結果如 SSL connection using TLSv1.3、憑證的主體與到期日），以 > 開頭的是送出的請求標頭，以 < 開頭的是收到的回應標頭。看它停在哪一行，就知道卡在哪一層。`curl -v --resolve www.example.com:443:203.0.113.81 https://www.example.com/` 讓 curl 跳過 DNS、直接連指定的位址，同時保留正確的主機名稱（TLS 的 SNI 與 Host 標頭），適合測試新伺服器或繞過有問題的 DNS。' },
        { type: 'table', head: ['curl 的結果', '結束代碼', '代表什麼'], rows: [
          ['Could not resolve host', '6', 'DNS 失敗，還沒送出任何 TCP 封包'],
          ['Connection refused（連線被拒絕）', '7', '對方回 RST：主機到得了，但那個連接埠沒有程式在監聽'],
          ['Timeout（連線逾時）', '28', 'SYN 沒有任何回應：被防火牆丟棄，或路由不通'],
          ['SSL certificate problem（例如 certificate has expired）', '60', 'TCP 已連上，TLS 驗證憑證失敗：過期、名稱不符或缺中繼憑證（CN13）'],
          ['收到 HTTP 狀態碼（例如 404、502）', '0', '下面每一層都正常，這是應用層的回答'],
        ] },
        { type: 'p', text: '瀏覽器的開發者工具（F12 的 Network 面板）提供同樣的資訊：每個請求的狀態碼、請求與回應標頭，以及 Timing 分頁裡 DNS Lookup、Initial connection、SSL 與 Waiting（等第一個位元組）各花了多久。失敗的請求會標出錯誤，例如 ERR_NAME_NOT_RESOLVED、ERR_CONNECTION_REFUSED、ERR_CONNECTION_TIMED_OUT 與 ERR_CERT_DATE_INVALID，分別對應上表的 DNS、RST、逾時與憑證。' },
        { type: 'p', text: '工具的訊息是轉述，封包擷取則是第一手證據。tcpdump 在命令列擷取，用擷取過濾器（BPF）限定範圍，例如 "host 203.0.113.80 and tcp port 8080"；Wireshark 有圖形介面，另外有顯示過濾器，例如 tcp.flags.syn == 1 && tcp.flags.ack == 0 只看連線請求、tcp.flags.reset == 1 只看 RST、dns.flags.rcode == 3 只看 NXDOMAIN、icmp 只看 ICMP。下面的情境同時開著 tcpdump：SYN 之後立刻收到 RST 是「連接埠沒開」，只看到同一個 SYN 一再重送是「被丟棄」。' },
        { type: 'example', id: 'cn17-refused-vs-timeout' },
        { type: 'callout', tone: 'tip', title: '在哪一端擷取', text: '在用戶端擷取到 SYN 卻沒有 SYN, ACK 時，再到伺服器上擷取一次：伺服器收到 SYN 卻沒回，是伺服器端的問題（例如本機防火牆）；伺服器根本沒收到，封包就是在路上被丟的。兩端各擷取一次，就把整條路徑切成了兩半。' },
      ],
    },
    {
      id: 'diagnosis', title: '「網站打不開」：從工具輸出判斷問題',
      blocks: [
        { type: 'p', text: '把前面的工具串起來，一個「網站打不開」的回報可以依證據歸到四類：DNS（名稱沒解析或解析錯）、路由（封包到不了那個網路）、連接埠（到得了主機，但服務沒開或被防火牆擋）、應用層（連線與 TLS 都成功，伺服器卻回了錯誤）。最後一類最容易被忽略：下面每一層都正常，使用者看到的仍然是「打不開」。下面的情境就是這樣：連線一路成功，卻收到反向代理產生的 502。' },
        { type: 'example', id: 'cn17-bad-gateway' },
        { type: 'table', head: ['症狀（工具輸出）', '用的工具', '問題在哪一層', '可能的原因'], rows: [
          ['dig 回 NXDOMAIN；瀏覽器 ERR_NAME_NOT_RESOLVED', 'dig、nslookup', '應用層（DNS）', '網址打錯；紀錄沒建立或已刪除'],
          ['預設解析器回 SERVFAIL，dig @另一台解析器正常', 'dig @伺服器', '應用層（DNS）', '那台解析器故障或連不到權威伺服器；DNSSEC 驗證失敗'],
          ['dig 正常，但答案是舊位址', 'dig、比較 TTL', '應用層（DNS）', '快取還沒過期；改紀錄前沒有先調低 TTL'],
          ['traceroute 從某一跳起全是 * * *，curl 也逾時', 'traceroute、curl', '網際網路層（路由）', '那一跳之後的路由錯誤或鏈路中斷'],
          ['curl：Connection refused；擷取看到 SYN 後回 RST', 'curl -v、tcpdump', '傳輸層（連接埠）', '服務沒啟動、監聽在別的連接埠，或只監聽 127.0.0.1'],
          ['curl：逾時；擷取只看到重送的 SYN', 'curl -v、tcpdump', '傳輸層或網際網路層', '防火牆默默丟棄、安全群組沒開、路由不通'],
          ['curl：SSL certificate problem', 'curl -v', '應用層（TLS）', '憑證過期、名稱不符、缺中繼憑證'],
          ['curl 收到 502 Bad Gateway 或 504 Gateway Timeout', 'curl -v、代理與程式的日誌', '應用層', '反向代理後面的程式停了（502）或太慢（504）'],
          ['ping 100% 遺失，但 curl 正常', 'ping、curl', '不是故障', 'ICMP 被擋，主機與服務都正常'],
        ] },
        { type: 'list', ordered: true, items: [
          'dig 名稱：status 是不是 NOERROR、位址是不是預期的；有疑問就用 @ 換一台解析器比較。',
          'curl -v 那個位址：卡在 Trying（逾時或被拒絕）、卡在 TLS，還是收到了 HTTP 狀態碼。',
          '連線失敗時往下查：被拒絕看服務與監聽位址；逾時用 traceroute 與兩端的封包擷取找出封包在哪裡消失。',
          '收到錯誤狀態碼時往上查：Server 標頭說明是誰回的，再看那一台的日誌（例如 nginx 的 error.log）。',
        ] },
        { type: 'callout', tone: 'warning', title: '常見誤解：收到 502 就是我的網路有問題', text: '502 是一個完整的 HTTP 回應：能收到它，代表 DNS、路由、TCP 連接埠與 TLS 全都正常，是伺服器那一端的代理連不上它後面的程式。重新開機路由器、清 DNS 快取都不會有幫助；要處理的是上游程式與代理的設定。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  network: {
    scenes: [ping, trace, dig, refused, badGateway],
    exercises: [
      { id: 'cn17-trace-hop4', task: 'table', scene: 'cn17-traceroute', message: 'unreachable', node: 'laptop', table: 'traceroute 輸出', row: '4', column: '位址', title: 'traceroute 的第 4 跳',
        statement: '在「traceroute：TTL 一次加 1」情境的最後，traceroute 輸出的第 4 跳，位址欄是什麼？（填 IP 位址）',
        hints: ['第 4 跳的位址來自 TTL 4 的探測引發的那個 ICMP 回應。', 'ICMP Time Exceeded 的來源 IP 是哪一台路由器？'],
        explanation: 'TTL 4 的探測經過 R1、R2、R3，在 R4 歸零；R4 回 ICMP Time Exceeded，來源 IP 是 203.0.113.1，所以第 4 跳是 203.0.113.1。前一跳 R3 沒有回應，印成 * * *，但第 4 跳有回應，證明 R3 轉送正常。',
        mistakes: [
          { answer: { cell: '（沒有回覆）' }, why: '看成第 3 跳：不回話的是 R3，第 4 跳的 R4 有回 Time Exceeded。' },
          { answer: { cell: '203.0.113.80' }, why: '把終點當成第 4 跳：終點是第 5 跳，它回的是 Port Unreachable，不是 Time Exceeded。' },
          { answer: { cell: '198.51.100.1' }, why: '少算了不回話的那一跳：198.51.100.1 是第 2 跳，第 3 跳雖然顯示 * 也要算一跳。' },
        ] },
      { id: 'cn17-dig-status', task: 'table', scene: 'cn17-dig', message: 'b-response', node: 'laptop', table: 'dig 輸出', row: 'wwww.example.com A', column: 'status', title: '打錯字的查詢',
        statement: '在「dig」情境裡，dig wwww.example.com（多打了一個 w）得到的 status 是什麼？（填 dig 印出的狀態名稱，例如 NOERROR）',
        hints: ['權威伺服器對這個名稱怎麼說？', '「確定不存在」和「查不出來」是兩種不同的狀態。'],
        explanation: 'example.com 的權威資料裡沒有 wwww.example.com，解析器把權威伺服器的回答轉回來：RCODE 3，status: NXDOMAIN，ANSWER: 0，AUTHORITY 區段附上 example.com 的 SOA。這是一個確定的「不存在」，修正方式是檢查拼字，不是換解析器。',
        mistakes: [
          { answer: { cell: 'SERVFAIL' }, why: '把「不存在」和「查不出來」混在一起：SERVFAIL 是解析器 B 對正確名稱的失敗，打錯字得到的是權威的 NXDOMAIN。' },
          { answer: { cell: 'NOERROR' }, why: '以為有回應就是 NOERROR：NOERROR 表示名稱存在，這個名稱不存在。' },
        ] },
      { id: 'cn17-icmp-type', task: 'field', scene: 'cn17-traceroute', message: 'exceeded-2', layer: 'network', field: 'ICMP 類型', title: 'traceroute 收到的 ICMP 類型',
        statement: '在「traceroute」情境裡，R2 丟棄 TTL 歸零的探測後，回給筆電的 ICMP 訊息類型是幾號？（只填數字）',
        hints: ['路由器因為 TTL 歸零而丟棄封包時，送的是哪一種 ICMP 訊息？', '它和 ping 的 Echo、終點的 Unreachable 都不同。'],
        explanation: '路由器在轉送前把 TTL 減成 0，就丟棄封包並回 ICMP Time Exceeded，類型 11、代碼 0（傳送途中 TTL 歸零）。traceroute 從這個訊息的來源 IP 得知第 2 跳是 198.51.100.1。',
        mistakes: [
          { answer: { value: '3' }, why: '和終點的回應搞混：類型 3（Destination Unreachable，代碼 3 Port Unreachable）是終點 203.0.113.80 回的，表示探測已經抵達。' },
          { answer: { value: '0' }, why: '當成 ping 的 Echo Reply：類型 0 是回聲回覆，路由器回報 TTL 歸零用的是類型 11。' },
          { answer: { value: '8' }, why: '當成 Echo Request：類型 8 是 ping 與 Windows tracert 送出的請求，不是路由器的回應。' },
        ] },
      { id: 'cn17-rst-flags', task: 'field', scene: 'cn17-refused-vs-timeout', message: 'rst', layer: 'transport', field: '旗標', title: 'Connection refused 的封包',
        statement: '在「curl 連不上」情境裡，curl 連 8080 時，伺服器回給筆電的 TCP 區段設了哪些旗標？（例如寫成「SYN, ACK」）',
        hints: ['8080 沒有程式在監聽，伺服器會完成交握嗎？', 'tcpdump 把它印成 Flags [R.]：R 是哪個旗標，點又代表什麼？'],
        explanation: '沒有 socket 在 8080 監聽，伺服器的作業系統以 RST 拒絕。收到的 SYN 沒有 ACK 旗標，所以 RST 區段同時設 ACK，用 Ack = 12001 指出拒絕的是哪一個 SYN；旗標是 RST, ACK，tcpdump 印成 [R.]。curl 因此立刻得到 Connection refused。',
        mistakes: [
          { answer: { value: 'SYN, ACK' }, why: '以為主機開著就會完成交握：SYN, ACK 只在有程式監聽時才會回。' },
          { answer: { value: 'RST' }, why: '只寫了 RST：回應沒有 ACK 的 SYN 時，RST 區段也設 ACK（tcpdump 的 [R.] 裡那個點）。' },
          { answer: { value: 'FIN, ACK' }, why: '把拒絕連線當成關閉連線：這條連線從來沒有建立，用的是 RST，不是 FIN。' },
        ] },
      { id: 'cn17-proxy-status', task: 'field', scene: 'cn17-bad-gateway', message: 'bad-gateway', layer: 'application', field: '狀態碼', title: '代理連不上上游',
        statement: '在「反向代理回 502」情境裡，nginx 連上游 10.0.0.20:8000 時被 RST 拒絕。它回給 curl 的 HTTP 狀態碼是多少？（只填數字）',
        hints: ['上游是「拒絕」，不是「太慢」。', '閘道拿不到上游有效回應時，用哪個 5xx 狀態碼？'],
        explanation: 'nginx 是閘道，它連不上後面的上游（connect() failed，Connection refused），就自己產生 502 Bad Gateway。回應的 Server: nginx 說明是代理產生的。這時 DNS、路由、TCP 443 與 TLS 都正常，問題在應用層的上游程式。',
        mistakes: [
          { answer: { value: '504' }, why: '和逾時搞混：504 Gateway Timeout 是上游一直沒有回應、代理等到逾時；這裡上游立刻回 RST，代理回 502。' },
          { answer: { value: '503' }, why: '503 Service Unavailable 通常是伺服器自己表示暫時無法服務（例如維護或過載）；代理連不上上游用的是 502。' },
          { answer: { value: '500' }, why: '500 是伺服器內部錯誤，由應用程式自己產生；這裡應用程式根本沒收到請求。' },
        ] },
    ],
  },
  quiz: [
    {
      id: 'q-ping-blocked', prompt: '你 ping 203.0.113.25 得到 100% packet loss，但瀏覽器打開 https://203.0.113.25/ 完全正常。最合理的解釋是什麼？',
      options: [
        '主機已經關機，瀏覽器顯示的是快取的頁面',
        '路徑上或主機本身的防火牆丟棄了 ICMP Echo，主機與 HTTPS 服務都正常',
        'ping 用的是 UDP，被防火牆擋掉了',
        '主機的 TTL 太小，ping 的封包都在路上過期',
      ],
      answer: 1, explanation: 'ping 只檢查 ICMP Echo 有沒有得到回覆。HTTPS 能連上，代表主機開著、路由與 443 連接埠都通，所以 ping 不通是 ICMP 被丟棄。關機的主機無法完成 TLS 與 HTTP，快取不能解釋一次新的連線；ping 用的是 ICMP（Echo Request 類型 8），不是 UDP；TTL 是送出端設定的，對 HTTPS 封包與 ping 封包一樣，若會在路上過期，HTTPS 也連不上。',
    },
    {
      id: 'q-trace-star', prompt: 'traceroute 的輸出中，第 3 跳是「* * *」，第 4 跳到第 7 跳（終點）都有正常的位址與 RTT。下列判斷何者正確？',
      options: [
        '第 3 跳的路由器故障，封包在那裡全部遺失',
        '第 3 跳之後的 RTT 一定不準，需要重測',
        '終點擋掉了探測封包，所以第 3 跳才沒有回應',
        '第 3 跳的路由器沒有回 ICMP Time Exceeded，但它照常轉送，路徑沒有中斷',
      ],
      answer: 3, explanation: '第 4 跳以後都有回應，表示探測封包經過了第 3 跳的路由器，所以它轉送正常，只是不回 Time Exceeded（設定成不回、限速，或回應被濾掉）。若封包在第 3 跳遺失，後面的跳數不會有任何回應；後面的 RTT 是各自的探測量到的，不受第 3 跳沒回應影響；終點有沒有擋探測，只會影響最後一跳，與第 3 跳無關。',
    },
    {
      id: 'q-nxdomain', prompt: '使用者回報 https://shop.exmaple.com 打不開。dig shop.exmaple.com 得到 status: NXDOMAIN、ANSWER: 0。最可能的原因與下一步是什麼？',
      options: [
        '名稱不存在：網址把 example 拼成了 exmaple，檢查並改正拼字',
        '解析器故障，換一台解析器就能解決',
        '網站的 443 連接埠沒開，要啟動網頁伺服器',
        '路由中斷，要用 traceroute 找出斷在哪一跳',
      ],
      answer: 0, explanation: 'NXDOMAIN 是權威資料給的確定答案：這個名稱不存在，而網址裡的 exmaple 正是拼錯的 example。解析器故障會回 SERVFAIL，不是 NXDOMAIN，換解析器只會得到同樣的答案；連接埠與路由都是解析出位址之後才會碰到的問題，現在連位址都還沒有，還輪不到它們。',
    },
    {
      id: 'q-refused', prompt: 'curl -v http://203.0.113.80:8080/ 在 25 毫秒內失敗，訊息含 Connection refused。這說明了什麼？',
      options: [
        'DNS 解析失敗，curl 找不到主機',
        '防火牆默默丟棄了 SYN，curl 等到逾時',
        '主機到得了，但 8080 沒有程式在監聽，對方回了 RST',
        '伺服器回了 HTTP 404，表示路徑不存在',
      ],
      answer: 2, explanation: 'Connection refused 代表 curl 收到 RST：封包到了主機，作業系統找不到監聽 8080 的程式，所以立刻拒絕；25 毫秒就是一個往返。這裡直接用 IP 位址，沒有 DNS 查詢，DNS 失敗的訊息會是 Could not resolve host；被丟棄的 SYN 收不到任何回應，要等到逾時才失敗，不會這麼快；404 是 HTTP 回應，要先建立連線才拿得到。',
    },
    {
      id: 'q-timeout', prompt: 'curl --connect-timeout 5 連 203.0.113.80:9090 逾時。同時在筆電上的 tcpdump 只看到同一個 SYN（相同 Seq）在 0、1、3 秒各送出一次，沒有任何回應封包。最可能的原因是什麼？',
      options: [
        '伺服器的 9090 沒有程式在監聽',
        'TLS 憑證已經過期',
        'SYN 在路上被丟棄，例如防火牆默默丟掉，或路由沒有通到那裡',
        'DNS 回了錯誤的位址',
      ],
      answer: 2, explanation: '同一個 SYN 一再重送、完全沒有回應，是封包被丟棄的特徵：防火牆默默丟棄或路由不通。沒有程式監聽時，主機會回 RST，curl 會立刻得到 Connection refused；TLS 要在 TCP 連上之後才開始，這裡連交握都沒完成；題目直接連 IP 位址，與 DNS 無關。',
    },
    {
      id: 'q-502', prompt: 'curl -v https://www.example.com/ 印出 Connected to www.example.com、SSL connection using TLSv1.3，最後收到「HTTP/1.1 502 Bad Gateway」與「Server: nginx」。問題最可能在哪裡？',
      options: [
        '應用層：nginx 反向代理連不上它後面的上游程式，要查上游程式與 nginx 的錯誤日誌',
        'DNS：解析到了錯誤的位址',
        '路由：封包在某一跳遺失',
        '使用者的瀏覽器快取壞了',
      ],
      answer: 0, explanation: '能完成 TCP 連線、TLS 交握並收到完整的 HTTP 回應，代表 DNS、路由、連接埠與 TLS 都正常。502 由 nginx 產生（Server: nginx），意思是它拿不到上游的有效回應，所以要查上游程式是否在執行，以及 nginx 的 error.log。路由遺失會讓連線失敗，不會收到 502；這裡用的是 curl，與瀏覽器快取無關。若 DNS 指向錯誤的伺服器，通常會看到憑證名稱不符或完全不同的回應，而不是這台 nginx 的 502。',
    },
    {
      id: 'q-servfail', prompt: '你的筆電用解析器 A 查 www.example.com 得到 NOERROR 與正確位址；同事的筆電用解析器 B，dig @解析器B www.example.com 得到 SERVFAIL。最合理的判斷是什麼？',
      options: [
        'www.example.com 的紀錄已經被刪除',
        '同事的網址打錯了',
        '網站的伺服器當機了',
        '名稱本身沒有問題，問題在解析器 B 或它往外的路徑（例如連不到權威伺服器、DNSSEC 驗證失敗）',
      ],
      answer: 3, explanation: '同一個名稱在解析器 A 得到正確答案，代表紀錄存在、權威伺服器能回答；只有解析器 B 失敗，問題就在 B 那一端。紀錄被刪除或網址打錯，兩台解析器都會回 NXDOMAIN；題目是用 dig 問完全相同的名稱，也不是拼字問題；網頁伺服器當機不影響 DNS 解析，SERVFAIL 是解析器回報的錯誤。',
    },
    {
      id: 'q-trace-mechanism', prompt: 'Linux 的 traceroute 怎麼得知第 2 跳路由器的位址？',
      options: [
        '它直接送封包到第 2 跳路由器的 IP，請它回報自己的位址',
        '它送出 TTL 2 的探測，第 2 跳路由器把 TTL 減成 0、丟棄封包，回 ICMP Time Exceeded（類型 11），回應的來源 IP 就是第 2 跳',
        '它向 DNS 查詢沿途路由器的名稱與位址',
        '終點伺服器把沿途經過的路由器清單放在 Port Unreachable 裡回傳',
      ],
      answer: 1, explanation: 'traceroute 一開始並不知道沿途有哪些路由器，所以探測的目的 IP 一律是終點，用 TTL 控制封包在第幾跳過期；第 2 跳把 TTL 從 1 減成 0 時丟棄封包，回 ICMP 類型 11、代碼 0，來源 IP 就是它的位址。DNS 只用在把位址反查成名稱（加上 -n 就不查），不能找出路徑；終點的 Port Unreachable 只附上被拒絕探測的開頭，沒有路徑清單。',
    },
  ],
};
