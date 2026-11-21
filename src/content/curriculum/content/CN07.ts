import type { NetworkScene, NodeTable } from '@/lib/network/model';
import type { LessonContent } from '../schema';

/*
 * CN07 Routing and Forwarding (CN-2). A network-protocol lesson: four fixed scenes (a packet crossing three routers,
 * longest-prefix match on overlapping routes, a routing loop from a mistyped static route that TTL ends, and the same
 * network after the fix) and exercises read from the routers' tables and the IPv4 headers (src/lib/network/model.ts).
 * Internal networks use RFC 1918 ranges; the outside uses the RFC 5737 documentation ranges; MAC addresses are locally
 * administered (02:…). Every routing table has the columns 目的前綴, 下一跳, 介面, 來源.
 */

const DIRECT = '直接送達', CONNECTED = '直接連接', STATIC = '靜態', DEFAULT = '靜態（預設路由）';
const ROUTE_HEAD = ['目的前綴', '下一跳', '介面', '來源'];
const routes = (node: string, rows: string[][]): NodeTable => ({ node, name: '路由表', head: ROUTE_HEAD, rows });
const ipv4 = (from: string, to: string, ttl: number, protocol: string) => ({ layer: 'network' as const, protocol: 'IPv4', fields: [
  { name: '來源 IP', value: from }, { name: '目的 IP', value: to }, { name: 'TTL', value: String(ttl) }, { name: '協定', value: protocol }] });
const ethernet = (from: string, to: string) => ({ layer: 'link' as const, protocol: 'Ethernet', fields: [
  { name: '來源 MAC', value: from }, { name: '目的 MAC', value: to }, { name: 'EtherType', value: '0x0800（IPv4）' }] });
const TCP = '6（TCP）', ICMP = '1（ICMP）';

// ---- scene 1: PC → R1 → R2 → R3 → server ----------------------------------------------------------------------
const M1 = {
  pc: '02:00:00:00:07:10', r1In: '02:00:00:00:07:11', r1Out: '02:00:00:00:07:12', r2In: '02:00:00:00:07:21', r2Out: '02:00:00:00:07:22',
  r3In: '02:00:00:00:07:31', r3Out: '02:00:00:00:07:32', server: '02:00:00:00:07:50',
};
const tcpSyn = { layer: 'transport' as const, protocol: 'TCP', fields: [{ name: '來源連接埠', value: '50123' }, { name: '目的連接埠', value: '443' }, { name: '旗標', value: 'SYN' }] };
const PC1_ROUTES = routes('pc', [['192.168.1.0/24', DIRECT, 'eth0', CONNECTED], ['0.0.0.0/0', '192.168.1.1', 'eth0', '預設閘道設定']]);
const R1_ROUTES = routes('r1', [['192.168.1.0/24', DIRECT, 'eth0', CONNECTED], ['10.0.12.0/30', DIRECT, 'eth1', CONNECTED], ['0.0.0.0/0', '10.0.12.2', 'eth1', DEFAULT]]);
const R2_ROUTES = routes('r2', [
  ['10.0.12.0/30', DIRECT, 'eth0', CONNECTED], ['10.0.23.0/30', DIRECT, 'eth1', CONNECTED], ['10.0.24.0/30', DIRECT, 'eth2', CONNECTED],
  ['192.168.1.0/24', '10.0.12.1', 'eth0', STATIC], ['172.16.5.0/24', '10.0.23.2', 'eth1', STATIC], ['0.0.0.0/0', '10.0.24.2', 'eth2', DEFAULT]]);
const R3_ROUTES = routes('r3', [['10.0.23.0/30', DIRECT, 'eth0', CONNECTED], ['172.16.5.0/24', DIRECT, 'eth1', CONNECTED], ['0.0.0.0/0', '10.0.23.1', 'eth0', DEFAULT]]);

/** Section 3: each router looks up only its own table and hands the packet to the next hop. */
const threeRouters: NetworkScene = {
  id: 'cn07-three-routers', title: '封包一跳一跳穿過三台路由器', model: 'tcp-ip',
  description: '分公司的電腦 PC（192.168.1.10/24）向總部伺服器 172.16.5.20 發起 HTTPS 連線。封包依序經過 R1、R2、R3，每台路由器只查自己的路由表、只決定下一跳。看每一步的 TTL、訊框的 MAC 位址，以及各路由器選用的那一列。',
  nodes: [
    { id: 'pc', label: '分公司電腦 PC', kind: 'host', addresses: ['IP 192.168.1.10/24', `MAC ${M1.pc}`, '閘道 192.168.1.1'] },
    { id: 'r1', label: '分公司路由器 R1', kind: 'router', addresses: ['eth0 192.168.1.1/24', 'eth1 10.0.12.1/30'] },
    { id: 'r2', label: '骨幹路由器 R2', kind: 'router', addresses: ['eth0 10.0.12.2/30（往 R1）', 'eth1 10.0.23.1/30（往 R3）', 'eth2 10.0.24.1/30（往網際網路，對端 10.0.24.2）'] },
    { id: 'r3', label: '總部路由器 R3', kind: 'router', addresses: ['eth0 10.0.23.2/30', 'eth1 172.16.5.1/24'] },
    { id: 'server', label: '總部伺服器', kind: 'server', addresses: ['IP 172.16.5.20/24', `MAC ${M1.server}`] },
  ],
  messages: [
    { id: 'pc-r1', from: 'pc', to: 'r1', label: 'TCP SYN：PC → R1', payload: 'TCP SYN（開始 HTTPS 連線）',
      note: 'PC 自己也有一張路由表。172.16.5.20 不在 192.168.1.0/24 之內，只有 0.0.0.0/0 這一列符合，所以下一跳是預設閘道 192.168.1.1，從 eth0 送出。PC 用 ARP（CN06）查到閘道的 MAC，訊框的目的 MAC 是 R1 的 eth0；IP 標頭的目的位址從頭到尾都是 172.16.5.20。主機送出時 TTL 是 64。',
      headers: [tcpSyn, ipv4('192.168.1.10', '172.16.5.20', 64, TCP), ethernet(M1.pc, M1.r1In)], tables: [PC1_ROUTES] },
    { id: 'r1-r2', from: 'r1', to: 'r2', label: 'R1 轉送給 R2', payload: 'TCP SYN（開始 HTTPS 連線）',
      note: 'R1 拆掉訊框，看 IP 標頭的目的位址 172.16.5.20。它的路由表只有兩個直接連接的網段和一條預設路由，前兩列都不符合，選用 0.0.0.0/0：下一跳 10.0.12.2，介面 eth1。R1 把 TTL 從 64 減成 63、重算 IP 標頭檢查碼，再包上新的訊框（來源是 R1 eth1，目的是 R2 eth0）。TCP 標頭原封不動，路由器不看它。',
      headers: [tcpSyn, ipv4('192.168.1.10', '172.16.5.20', 63, TCP), ethernet(M1.r1Out, M1.r2In)], tables: [R1_ROUTES] },
    { id: 'r2-r3', from: 'r2', to: 'r3', label: 'R2 轉送給 R3', payload: 'TCP SYN（開始 HTTPS 連線）',
      note: 'R2 的表中有兩列符合 172.16.5.20：靜態路由 172.16.5.0/24 與預設路由 0.0.0.0/0。/24 比 /0 長，選用 172.16.5.0/24：下一跳 10.0.23.2（R3），介面 eth1。TTL 從 63 減成 62。表中的 192.168.1.0/24 是給回程用的：伺服器的回應要回到 PC 時，R2 靠這一列把它交還給 R1。',
      headers: [tcpSyn, ipv4('192.168.1.10', '172.16.5.20', 62, TCP), ethernet(M1.r2Out, M1.r3In)], tables: [R2_ROUTES] },
    { id: 'r3-server', from: 'r3', to: 'server', label: 'R3 直接交給伺服器', payload: 'TCP SYN（開始 HTTPS 連線）',
      note: '172.16.5.20 落在 R3 直接連接的 172.16.5.0/24（eth1），這一列沒有下一跳，R3 直接把封包交給目的主機：訊框的目的 MAC 是伺服器自己的。TTL 從 62 減成 61。伺服器收到的 TTL 是 61，表示經過了 3 台路由器。',
      headers: [tcpSyn, ipv4('192.168.1.10', '172.16.5.20', 61, TCP), ethernet(M1.r3Out, M1.server)], tables: [R3_ROUTES] },
  ],
};

// ---- scene 2: longest-prefix match on overlapping routes -----------------------------------------------------
const M2 = {
  rEth0: '02:00:00:00:07:c0', rEth1: '02:00:00:00:07:c1', rEth2: '02:00:00:00:07:c2', rEth3: '02:00:00:00:07:c3', rEth4: '02:00:00:00:07:c4',
  rb: '02:00:00:00:07:d1', rc: '02:00:00:00:07:d2', isp: '02:00:00:00:07:d3', rd: '02:00:00:00:07:d4', lab: '02:00:00:00:07:b7',
};
const R_ROUTES = routes('r', [
  ['10.0.0.0/8', '10.255.0.6', 'eth2', STATIC], ['10.1.0.0/16', '10.255.0.2', 'eth1', STATIC], ['10.1.16.0/20', '10.255.0.10', 'eth4', STATIC],
  ['10.1.2.0/24', DIRECT, 'eth0', CONNECTED], ['0.0.0.0/0', '198.51.100.1', 'eth3', DEFAULT],
  ['10.255.0.0/30', DIRECT, 'eth1', CONNECTED], ['10.255.0.4/30', DIRECT, 'eth2', CONNECTED], ['10.255.0.8/30', DIRECT, 'eth4', CONNECTED],
  ['198.51.100.0/30', DIRECT, 'eth3', CONNECTED]]);
const YES = '符合', NO = '不符合', BEST = '符合，最長 → 選用';
/** The comparison of one destination with R's routes, in R_ROUTES order (the four /30 link networks never match here). */
const match = (destination: string, results: string[]): NodeTable => ({ node: 'r', name: `比對 ${destination}`, head: ['目的前綴', '前綴長度', '比對結果'], rows: [
  ['10.0.0.0/8', '8', results[0]], ['10.1.0.0/16', '16', results[1]], ['10.1.16.0/20', '20', results[2]], ['10.1.2.0/24', '24', results[3]],
  ['0.0.0.0/0', '0', results[4]], ['四條 /30 鏈路網段', '30', NO]] });

/** Section 4: five packets, five different longest matches out of the same table. */
const longestPrefix: NetworkScene = {
  id: 'cn07-longest-prefix', title: '最長前綴匹配：同一張路由表，五個目的地', model: 'tcp-ip',
  description: '核心路由器 R 的路由表有互相重疊的路由：10.0.0.0/8 交給總部路由器 R-C，其中 10.1.0.0/16 是分校、交給 R-B，分校裡的 10.1.16.0/20 是實驗大樓、交給 R-D，10.1.2.0/24 直接接在 R 的 eth0 上，其他目的地走預設路由到 ISP。五個封包的目的位址各落在不同的「最長」前綴，從五個不同的介面送出。',
  nodes: [
    { id: 'isp', label: 'ISP 路由器', kind: 'router', addresses: ['198.51.100.1/30'] },
    { id: 'r', label: '核心路由器 R', kind: 'router', addresses: ['eth0 10.1.2.1/24', 'eth1 10.255.0.1/30（往 R-B）', 'eth2 10.255.0.5/30（往 R-C）', 'eth3 198.51.100.2/30（往 ISP）', 'eth4 10.255.0.9/30（往 R-D）'] },
    { id: 'lab', label: '網管主機', kind: 'host', addresses: ['IP 10.1.2.77/24', `MAC ${M2.lab}`] },
    { id: 'rb', label: '分校路由器 R-B', kind: 'router', addresses: ['10.255.0.2/30'] },
    { id: 'rd', label: '實驗大樓路由器 R-D', kind: 'router', addresses: ['10.255.0.10/30'] },
    { id: 'rc', label: '總部路由器 R-C', kind: 'router', addresses: ['10.255.0.6/30'] },
  ],
  messages: [
    { id: 'to-lab', from: 'r', to: 'lab', label: '目的 10.1.2.77：從 eth0 直接送達', payload: 'HTTPS 回應的資料',
      note: '外部網站 203.0.113.50 的回應從 ISP 進來，到 R 時 TTL 是 50。10.1.2.77 同時符合 /8、/16、/24 與 /0 四列（/20 不符合：第 3 段 2 不在 16–31），最長的是直接連接的 10.1.2.0/24，所以 R 不交給任何下一跳，從 eth0 直接送給網管主機。TTL 減成 49。',
      headers: [ipv4('203.0.113.50', '10.1.2.77', 49, TCP), ethernet(M2.rEth0, M2.lab)],
      tables: [R_ROUTES, match('10.1.2.77', [YES, YES, NO, BEST, YES])] },
    { id: 'to-rb', from: 'r', to: 'rb', label: '目的 10.1.9.30：從 eth1 交給 R-B', payload: 'ICMP Echo Request（ping）',
      note: '網管主機 10.1.2.77 ping 分校的 10.1.9.30（R 收到時 TTL 64）。符合的有 /8、/16、/0；/24 不符合（第 3 段是 9 不是 2），/20 也不符合（9 不在 16–31）。最長是 10.1.0.0/16，下一跳 10.255.0.2，介面 eth1。TTL 減成 63。',
      headers: [ipv4('10.1.2.77', '10.1.9.30', 63, ICMP), ethernet(M2.rEth1, M2.rb)],
      tables: [R_ROUTES, match('10.1.9.30', [YES, BEST, NO, NO, YES])] },
    { id: 'to-rd', from: 'r', to: 'rd', label: '目的 10.1.20.7：從 eth4 交給 R-D', payload: 'ICMP Echo Request（ping）',
      note: '10.1.20.7 的第 3 段是 20，二進位 00010100，前 4 位 0001 和 10.1.16.0/20 相同，所以 /20 符合；它也符合 /16、/8、/0。最長是 /20，下一跳 10.255.0.10，介面 eth4。雖然 10.1.0.0/16 也符合，而且分校的封包大多走 R-B，這個位址卻交給 R-D。TTL 減成 63。',
      headers: [ipv4('10.1.2.77', '10.1.20.7', 63, ICMP), ethernet(M2.rEth4, M2.rd)],
      tables: [R_ROUTES, match('10.1.20.7', [YES, YES, BEST, NO, YES])] },
    { id: 'to-rc', from: 'r', to: 'rc', label: '目的 10.20.3.4：從 eth2 交給 R-C', payload: 'ICMP Echo Request（ping）',
      note: '10.20.3.4 的第 2 段是 20，不是 1，所以 /16、/20、/24 都不符合；只剩 10.0.0.0/8 和 0.0.0.0/0。/8 比 /0 長，下一跳 10.255.0.6（總部 R-C），介面 eth2。TTL 減成 63。',
      headers: [ipv4('10.1.2.77', '10.20.3.4', 63, ICMP), ethernet(M2.rEth2, M2.rc)],
      tables: [R_ROUTES, match('10.20.3.4', [BEST, NO, NO, NO, YES])] },
    { id: 'to-isp', from: 'r', to: 'isp', label: '目的 203.0.113.50：從 eth3 交給 ISP', payload: 'TCP SYN（開始 HTTPS 連線）',
      note: '203.0.113.50 的第 1 段是 203，表中所有 10 開頭的路由與 198.51.100.0/30 都不符合，只有預設路由 0.0.0.0/0 符合（它不比對任何位元）。下一跳 198.51.100.1，介面 eth3。預設路由是「其他都不符合時」的最後選擇。TTL 減成 63。',
      headers: [ipv4('10.1.2.77', '203.0.113.50', 63, TCP), ethernet(M2.rEth3, M2.isp)],
      tables: [R_ROUTES, match('203.0.113.50', [NO, NO, NO, NO, BEST])] },
  ],
};

// ---- scenes 3 and 4: a routing loop from a mistyped static route, then the fix ------------------------------
const M3 = { pc: '02:00:00:00:07:60', raEth0: '02:00:00:00:07:61', raEth1: '02:00:00:00:07:62', rbEth0: '02:00:00:00:07:71', rbEth1: '02:00:00:00:07:72', isp: '02:00:00:00:07:80' };
const RA_ROUTES = routes('ra', [['192.168.30.0/24', DIRECT, 'eth0', CONNECTED], ['10.0.0.0/30', DIRECT, 'eth1', CONNECTED], ['0.0.0.0/0', '10.0.0.2', 'eth1', DEFAULT]]);
const rbRoutes = (next: string, iface: string) => routes('rb', [
  ['10.0.0.0/30', DIRECT, 'eth0', CONNECTED], ['198.51.100.0/30', DIRECT, 'eth1', CONNECTED], ['192.168.30.0/24', '10.0.0.1', 'eth0', STATIC],
  ['203.0.113.0/24', next, iface, STATIC], ['0.0.0.0/0', '198.51.100.1', 'eth1', DEFAULT]]);
const RB_WRONG = rbRoutes('10.0.0.1', 'eth0'), RB_FIXED = rbRoutes('198.51.100.1', 'eth1');
const LOOP_NODES: NetworkScene['nodes'] = [
  { id: 'pc', label: '電腦 PC', kind: 'host', addresses: ['IP 192.168.30.10/24', `MAC ${M3.pc}`, '閘道 192.168.30.1'] },
  { id: 'ra', label: '路由器 RA', kind: 'router', addresses: ['eth0 192.168.30.1/24', 'eth1 10.0.0.1/30（往 RB）'] },
  { id: 'rb', label: '路由器 RB', kind: 'router', addresses: ['eth0 10.0.0.2/30（往 RA）', 'eth1 198.51.100.2/30（往 ISP）'] },
  { id: 'isp', label: 'ISP 路由器', kind: 'router', addresses: ['198.51.100.1/30'] },
];
const SYN = 'TCP SYN（連到 203.0.113.9 的 443 埠）';
const toServer = (ttl: number) => ipv4('192.168.30.10', '203.0.113.9', ttl, TCP);

/** Section 6: RB's mistyped /24 beats its correct default route, so the packet bounces until TTL 0. */
const routingLoop: NetworkScene = {
  id: 'cn07-routing-loop', title: '靜態路由打錯：封包在兩台路由器之間來回，直到 TTL 歸零', model: 'tcp-ip',
  description: 'RB 的管理員想把 203.0.113.0/24 交給 ISP（198.51.100.1），卻把下一跳打成 RA 的位址 10.0.0.1。PC 連往 203.0.113.9 的封包被 RA 送給 RB、又被 RB 送回 RA。中間省略 58 次轉送；看 TTL 怎麼一路減到 0，以及 RB 回給 PC 的 ICMP Time Exceeded。',
  nodes: LOOP_NODES,
  messages: [
    { id: 'send', from: 'pc', to: 'ra', label: 'PC 送出：TTL 64', payload: SYN,
      note: 'PC 送出時 TTL 是 64。目的地 203.0.113.9 不在 192.168.30.0/24，交給預設閘道 RA。',
      headers: [toServer(64), ethernet(M3.pc, M3.raEth0)], tables: [RA_ROUTES] },
    { id: 'loop-1', from: 'ra', to: 'rb', label: '第 1 次轉送：RA → RB，TTL 63', payload: SYN,
      note: 'RA 的表中只有預設路由 0.0.0.0/0 符合 203.0.113.9：下一跳 10.0.0.2（RB），介面 eth1。TTL 64 減成 63。到這裡都是正常的。',
      headers: [toServer(63), ethernet(M3.raEth1, M3.rbEth0)], tables: [RA_ROUTES] },
    { id: 'loop-2', from: 'rb', to: 'ra', label: '第 2 次轉送：RB → RA，TTL 62', payload: SYN,
      note: 'RB 的表中有兩列符合 203.0.113.9：正確的預設路由 0.0.0.0/0（往 ISP），和打錯的 203.0.113.0/24（下一跳 10.0.0.1）。最長前綴匹配選 /24，於是 RB 從 eth0 把封包送回 RA。TTL 63 減成 62。正確的預設路由完全沒有機會被用到。',
      headers: [toServer(62), ethernet(M3.rbEth0, M3.raEth1)], tables: [RB_WRONG] },
    { id: 'loop-3', from: 'ra', to: 'rb', label: '第 3 次轉送：RA → RB，TTL 61', payload: SYN,
      note: 'RA 不知道這個封包剛從 RB 回來，路由器不記得自己轉送過什麼，只照表查：仍是預設路由，又送給 RB。TTL 62 減成 61。接下來每轉送一次 TTL 少 1，RA 與 RB 輪流轉送。',
      headers: [toServer(61), ethernet(M3.raEth1, M3.rbEth0)], tables: [RA_ROUTES] },
    { id: 'loop-62', from: 'rb', to: 'ra', label: '第 62 次轉送：RB → RA，TTL 2', payload: SYN,
      note: '省略第 4 到第 61 次轉送（共 58 次）。第 k 次轉送後 TTL 是 64 − k：偶數次由 RB 轉送，第 62 次後 TTL 是 2。',
      headers: [toServer(2), ethernet(M3.rbEth0, M3.raEth1)], tables: [RB_WRONG] },
    { id: 'loop-63', from: 'ra', to: 'rb', label: '第 63 次轉送：RA → RB，TTL 1', payload: SYN,
      note: 'RA 收到 TTL 2 的封包，減 1 後是 1，還大於 0，所以照常轉送給 RB。這是這個封包最後一次在鏈路上傳送。',
      headers: [toServer(1), ethernet(M3.raEth1, M3.rbEth0)], tables: [RA_ROUTES] },
    { id: 'time-exceeded', from: 'rb', to: 'ra', label: 'RB 丟棄封包，回傳 ICMP Time Exceeded', payload: 'ICMP 類型 11（Time Exceeded）、代碼 0（傳送途中 TTL 歸零），內含被丟棄封包的 IP 標頭與其後 8 個位元組',
      note: 'RB 收到 TTL 1 的封包，減 1 變成 0：不能再轉送，RB 丟棄它，並產生一個新的 ICMP 封包告訴來源。這個 ICMP 封包的來源 IP 是 RB 自己的 10.0.0.2，目的 IP 是原封包的來源 192.168.30.10；RB 查表時 192.168.30.0/24 這一列符合，下一跳 10.0.0.1，從 eth0 送出。這是新的封包，TTL 重新從 64 開始。',
      headers: [ipv4('10.0.0.2', '192.168.30.10', 64, ICMP), ethernet(M3.rbEth0, M3.raEth1)], tables: [RB_WRONG] },
    { id: 'icmp-to-pc', from: 'ra', to: 'pc', label: 'RA 把 ICMP 轉送給 PC', payload: 'ICMP 類型 11（Time Exceeded）、代碼 0（傳送途中 TTL 歸零），內含被丟棄封包的 IP 標頭與其後 8 個位元組',
      note: 'RA 查表：192.168.30.10 落在直接連接的 192.168.30.0/24，從 eth0 直接送給 PC。TTL 64 減成 63，來源 IP 仍是 10.0.0.2。PC 從 ICMP 內附的原標頭認出是哪個封包，知道它在 10.0.0.2 這台路由器 TTL 歸零。迴圈本身還在：PC 重送的每個封包都會再繞 63 次。',
      headers: [ipv4('10.0.0.2', '192.168.30.10', 63, ICMP), ethernet(M3.raEth0, M3.pc)], tables: [RA_ROUTES] },
  ],
};

const fixedRoute: NetworkScene = {
  id: 'cn07-fixed-route', title: '修正靜態路由之後：封包從 RB 的 eth1 交給 ISP', model: 'tcp-ip',
  description: '管理員把 RB 的 203.0.113.0/24 改成下一跳 198.51.100.1、介面 eth1。同一個封包只經過 RA、RB 兩次轉送就離開了公司網路。',
  nodes: LOOP_NODES,
  messages: [
    { id: 'fixed-send', from: 'pc', to: 'ra', label: 'PC 送出：TTL 64', payload: SYN,
      note: 'PC 一樣把封包交給預設閘道 RA，TTL 64。',
      headers: [toServer(64), ethernet(M3.pc, M3.raEth0)], tables: [RA_ROUTES] },
    { id: 'fixed-ra', from: 'ra', to: 'rb', label: 'RA → RB，TTL 63', payload: SYN,
      note: 'RA 的表沒有改，預設路由把封包交給 RB，TTL 63。',
      headers: [toServer(63), ethernet(M3.raEth1, M3.rbEth0)], tables: [RA_ROUTES] },
    { id: 'fixed-rb', from: 'rb', to: 'isp', label: 'RB → ISP，TTL 62', payload: SYN,
      note: '最長前綴匹配仍然選 203.0.113.0/24，但這一列現在的下一跳是 198.51.100.1、介面 eth1，封包交給 ISP，TTL 62。把這一列刪掉也能解決：剩下的預設路由同樣指向 198.51.100.1。',
      headers: [toServer(62), ethernet(M3.rbEth1, M3.isp)], tables: [RB_FIXED] },
  ],
};

/** CN07 Routing and Forwarding. Network-protocol lesson (CN-2): scenes and exercises in src/lib/network/model.ts. */
export const CN07: LessonContent = {
  lessonId: 'CN07',
  motivation: 'CN05 的主機只要判斷「同一子網路就直接送，否則交給閘道」。可是閘道收到封包之後呢？一個從台北連到國外網站的封包，可能要經過十幾台路由器，而沒有任何一台知道完整的路徑：每台只查自己的路由表，決定「下一跳交給誰、從哪個介面送出」。當表裡的路由互相重疊，路由器要靠最長前綴匹配選出最具體的那一條；當管理員把一條靜態路由打錯，封包可能在兩台路由器之間來回打轉，直到 TTL 減到 0 被丟棄。本課先分清楚轉送與路由，讀懂路由表的每個欄位，用二進位一步一步做最長前綴匹配，學會設定靜態路由與預設路由，最後看 TTL 怎麼讓迴圈裡的封包不會永遠轉下去。學完後，給你一張路由表和任一個目的位址，你能說出封包會從哪個介面送出。',
  sections: [
    {
      id: 'forwarding-vs-routing', title: '轉送與路由：資料平面與控制平面',
      blocks: [
        { type: 'p', text: '路由器做兩件不同的事。轉送（forwarding）是對每一個收到的封包：讀出目的 IP、查路由表、把 TTL 減 1、從選定的介面送出。這件事每秒要做數百萬次，必須很快，通常由專用硬體完成，稱為資料平面（data plane）。路由（routing）是決定路由表裡該有哪些路由：管理員手動設定、或路由器之間用路由協定交換資訊、計算出到各網路的最佳路徑。這件事只在網路變動時才需要做，稱為控制平面（control plane）。' },
        { type: 'table', head: ['', '轉送（資料平面）', '路由（控制平面）'], rows: [
          ['回答的問題', '這個封包從哪個介面送出、交給誰？', '路由表裡應該有哪些路由？'],
          ['輸入', '一個封包的目的 IP 與路由表', '介面設定、管理員的設定、鄰居路由器送來的路由資訊'],
          ['輸出', '一個介面與下一跳', '一張路由表'],
          ['多常發生', '每個封包一次', '開機、設定改變、鏈路斷線或恢復時'],
          ['本課的例子', '查表、最長前綴匹配、TTL 減 1', '直接連接、靜態路由、預設路由'],
        ] },
        { type: 'p', text: '打個比方：路由是畫地圖、立路標，轉送是每輛車到了路口看路標轉彎。路口的人不必知道整張地圖，只要路標正確。CN08 介紹的路由協定（距離向量、鏈路狀態）是自動畫地圖的方法；本課的路由表都由介面設定與管理員手動設定產生，專心看轉送如何使用這張表。' },
      ],
    },
    {
      id: 'routing-table', title: '路由表的欄位與路由的來源',
      blocks: [
        { type: 'p', text: '路由表的每一列是一條路由，意思是「目的位址落在這個前綴裡的封包，從這個介面送出、交給這個下一跳」。本課情境中的路由表有四個欄位；真實的路由器還會多顯示度量與管理距離。' },
        { type: 'table', head: ['欄位', '意思', '例子'], rows: [
          ['目的前綴', '一段位址範圍，寫成網路位址加前綴長度（CN05 的 CIDR）', '172.16.5.0/24'],
          ['下一跳（next hop）', '同一條鏈路上、下一台路由器的 IP 位址；直接連接的網段沒有下一跳，封包直接送給目的主機（本課寫成「直接送達」）', '10.0.23.2'],
          ['介面', '封包從哪一個介面送出，下一跳必須在這個介面連接的網段上', 'eth1'],
          ['來源', '這條路由從哪裡來：直接連接、靜態（管理員設定）、或路由協定學來的', '靜態'],
          ['度量（metric）', '同一個前綴有好幾條路由時比較成本，愈小愈優先；情境中每個前綴只有一條路由，所以省略', '0、100'],
        ] },
        { type: 'p', text: '路由表裡的路由有三種常見來源。直接連接路由：介面設定了 IP 位址與遮罩，路由器就自動知道那個網段在這個介面上，例如 R3 的 eth1 是 172.16.5.1/24，表中就出現「172.16.5.0/24，直接送達，eth1」。靜態路由：管理員手動寫下「某個前綴交給某個下一跳」，例如 R2 的「172.16.5.0/24 交給 10.0.23.2」，它不會自己改變，網路變了也要靠人改。預設路由：前綴是 0.0.0.0/0，長度 0，不比對任何位元，所以每個目的位址都符合，代表「其他都不知道的，交給這裡」，通常指向往網際網路的路由器。' },
        { type: 'callout', tone: 'note', title: '下一跳不會寫進 IP 標頭', text: '封包的目的 IP 從頭到尾都是最終目的地。下一跳只用來找出下一台路由器的 MAC 位址（用 ARP，見 CN06），然後把封包包進目的 MAC 是那台路由器的訊框。所以每經過一台路由器，訊框的 MAC 位址會換掉，IP 位址不變。' },
      ],
    },
    {
      id: 'hop-by-hop', title: '一跳一跳：每台路由器只決定下一跳',
      blocks: [
        { type: 'p', text: '路由器收到封包後做的事，依序是：拆掉訊框、檢查 IP 標頭、把 TTL 減 1（如果變成 0 就丟棄，見第 6 節）、用目的 IP 查路由表選出一列、重算 IP 標頭檢查碼、用 ARP 找到下一跳的 MAC、包上新的訊框從該介面送出。沒有一台路由器知道完整的路徑，路徑是每台路由器各自的選擇串起來的結果：只要每一跳都選得對，封包就會到達。' },
        { type: 'p', text: '下面的情境中，分公司的 PC 連到總部伺服器 172.16.5.20。逐步看每台路由器的路由表與它選用的那一列，注意 TTL 與訊框 MAC 位址的變化：' },
        { type: 'example', id: 'cn07-three-routers' },
        { type: 'table', head: ['路由器', '收到時 TTL', '選用的路由（最長的符合）', '下一跳', '送出介面', '送出時 TTL'], rows: [
          ['R1', '64', '0.0.0.0/0', '10.0.12.2', 'eth1', '63'],
          ['R2', '63', '172.16.5.0/24', '10.0.23.2', 'eth1', '62'],
          ['R3', '62', '172.16.5.0/24（直接連接）', '直接送達', 'eth1', '61'],
        ] },
        { type: 'p', text: '三台路由器各自查表：R1 只知道「不是本地的都往 R2 送」，R2 知道 172.16.5.0/24 在 R3 後面，R3 知道 172.16.5.0/24 就接在自己的 eth1 上。回程是另一個方向的查表：伺服器的回應要送到 192.168.1.10，R3 用預設路由交給 R2，R2 用靜態路由 192.168.1.0/24 交給 R1。去程通了，回程不一定通，兩個方向的路由都要設定。' },
      ],
    },
    {
      id: 'longest-prefix-match', title: '最長前綴匹配：用二進位比出最具體的路由',
      blocks: [
        { type: 'p', text: '路由表裡的前綴常常互相重疊：10.0.0.0/8 包含 10.1.0.0/16，10.1.0.0/16 又包含 10.1.16.0/20 與 10.1.2.0/24，而 0.0.0.0/0 包含一切。同一個目的位址可能符合好幾列，路由器的規則是最長前綴匹配（longest prefix match）：在所有符合的路由中，選前綴長度最長的那一條，因為它描述的範圍最小、最具體。' },
        { type: 'p', text: '「符合」的意思是：目的位址的前 n 個位元和路由的前 n 個位元完全相同（n 是前綴長度），等同於 CN05 的「目的位址 AND 遮罩 = 路由的網路位址」。以核心路由器 R 的路由表與目的位址 10.1.20.7（00001010.00000001.00010100.00000111）為例，逐列比對：' },
        { type: 'table', head: ['路由', '路由的前 n 位', '10.1.20.7 的前 n 位', '結果'], rows: [
          ['10.0.0.0/8', '00001010', '00001010', '符合（8 位）'],
          ['10.1.0.0/16', '00001010.00000001', '00001010.00000001', '符合（16 位）'],
          ['10.1.16.0/20', '00001010.00000001.0001', '00001010.00000001.0001', '符合（20 位，最長）'],
          ['10.1.2.0/24', '00001010.00000001.00000010', '00001010.00000001.00010100', '不符合（第 20 位不同）'],
          ['0.0.0.0/0', '（沒有要比的位元）', '（沒有要比的位元）', '符合（0 位）'],
          ['10.255.0.0/30 等三條鏈路網段', '00001010.11111111.…', '00001010.00000001.…', '不符合（第 9 位不同）'],
        ] },
        { type: 'p', text: '198.51.100.0/30 在第 1 段就不同，也不符合。四列符合，最長的是 /20，所以 10.1.20.7 交給 10.255.0.10（R-D），從 eth4 送出。換成 10.1.33.7：第 3 段 33 是 00100001，前 4 位 0010 不是 0001，/20 不符合，最長的變成 /16，改從 eth1 交給 R-B。/20 的第 3 段只看前 4 位，區塊大小是 16，10.1.16.0/20 涵蓋 10.1.16.0 到 10.1.31.255：第 3 段 16 到 31 都符合，32 就不符合了。前綴長度剛好在段的邊界（/8、/16、/24）時，看整段數字就好；不在邊界時，一定要換成二進位。' },
        { type: 'example', id: 'cn07-longest-prefix' },
        { type: 'callout', tone: 'warning', title: '路由器不是選第一條符合的路由', text: 'R 的路由表第一列是 10.0.0.0/8，10 開頭的位址全都符合它。如果照順序找、找到第一條就停，10.1.2.77、10.1.9.30、10.1.20.7 都會被送去總部的 R-C，分校與實驗大樓就收不到封包。最長前綴匹配看的是所有符合的路由，和它們在表中的順序無關；路由器顯示路由表的順序也只是方便閱讀。' },
        { type: 'callout', tone: 'warning', title: '預設路由的優先權不是最高，而是最低', text: '0.0.0.0/0 的前綴長度是 0，所有位址都符合它，但它也是最短的前綴：只要有任何其他路由符合，就輪不到它。它是「其他都不符合時」的最後選擇，不是「優先走這裡」。所以 R 的預設路由雖然指向 ISP，10 開頭的位址仍然不會被送到 ISP。' },
      ],
    },
    {
      id: 'static-default', title: '設定靜態路由與預設路由',
      blocks: [
        { type: 'p', text: '一條靜態路由只需要三樣資訊：目的前綴、下一跳、（通常可省略的）介面。下一跳必須在某個直接連接的網段上，路由器才知道從哪個介面把封包交給它。下表是核心路由器 R 的幾條路由，分別用 Linux 的 iproute2 與 Cisco IOS 的寫法設定：' },
        { type: 'table', head: ['路由', 'Linux（iproute2）', 'Cisco IOS'], rows: [
          ['10.1.0.0/16 交給 R-B', 'ip route add 10.1.0.0/16 via 10.255.0.2 dev eth1', 'ip route 10.1.0.0 255.255.0.0 10.255.0.2'],
          ['10.1.16.0/20 交給 R-D', 'ip route add 10.1.16.0/20 via 10.255.0.10 dev eth4', 'ip route 10.1.16.0 255.255.240.0 10.255.0.10'],
          ['預設路由交給 ISP', 'ip route add default via 198.51.100.1 dev eth3', 'ip route 0.0.0.0 0.0.0.0 198.51.100.1'],
          ['查看路由表', 'ip route', 'show ip route'],
        ] },
        { type: 'p', text: 'Linux 的 default 就是 0.0.0.0/0。主機也有路由表：一般電腦只有一條直接連接的路由和一條指向預設閘道的預設路由，這條預設路由通常由 DHCP 自動設定（CN06）。直接連接路由不必設定，介面一有位址就會出現。' },
        { type: 'p', text: '靜態路由簡單、可預測，不需要路由器之間交換任何資訊，適合小網路、只有一個出口的分支機構（只要一條預設路由），以及指定某個網段一定要走某條路。缺點是網路變動時不會自己調整：鏈路斷了，靜態路由仍然把封包往斷掉的方向送；網路一大，手動維護每台路由器的每一條路由也容易出錯。這時就交給 CN08 的路由協定。' },
        { type: 'callout', tone: 'tip', title: '先比前綴長度，再比度量', text: '度量只在前綴完全相同的路由之間比較。可以設定兩條預設路由，一條度量 0 走主要線路，一條度量 100 走備援線路（Linux 在 ip route add 指令後面加上 metric 100）；主要線路的路由消失時，備援的那條才會被用到。但一條度量很大的 /24 仍然勝過度量 0 的 /16，因為最長前綴匹配先做。' },
      ],
    },
    {
      id: 'ttl-and-loops', title: 'TTL、ICMP Time Exceeded 與路由迴圈',
      blocks: [
        { type: 'p', text: 'IPv4 標頭的 TTL（Time To Live）是 8 個位元的計數器，最大 255。主機送出封包時設定初始值（Linux 與 macOS 常用 64，Windows 常用 128），每經過一台路由器轉送就減 1。路由器收到要轉送的封包時，如果 TTL 減 1 後變成 0，就丟棄它，並回傳一個 ICMP Time Exceeded 訊息給封包的來源：ICMP 類型 11、代碼 0（傳送途中 TTL 歸零），內含被丟棄封包的 IP 標頭與其後 8 個位元組，讓來源認得是哪一個封包。IPv6 的同一個欄位叫躍點限制（Hop Limit），作用相同。traceroute 就是利用這個訊息找出沿途的路由器（CN17）。' },
        { type: 'p', text: 'TTL 存在的理由是路由迴圈。路由表設定錯誤時，兩台以上的路由器可能互相把封包交給對方。路由器不記得自己轉送過哪些封包，每次都只照表查，如果沒有 TTL，迴圈裡的封包會永遠轉下去，越積越多，把鏈路塞滿。下面的情境中，RB 的管理員把 203.0.113.0/24 的下一跳打成 RA 的位址：' },
        { type: 'example', id: 'cn07-routing-loop' },
        { type: 'table', head: ['轉送次數 k', '由誰轉送', '方向', '轉送後的 TTL'], rows: [
          ['1', 'RA', 'RA → RB', '63'],
          ['2', 'RB', 'RB → RA', '62'],
          ['3', 'RA', 'RA → RB', '61'],
          ['k（奇數 RA、偶數 RB）', '輪流', '來回', '64 − k'],
          ['62', 'RB', 'RB → RA', '2'],
          ['63', 'RA', 'RA → RB', '1'],
          ['RB 收到第 63 次轉送', 'RB', '不再轉送', '減 1 得 0：丟棄，回傳 ICMP 類型 11'],
        ] },
        { type: 'p', text: '封包在 RA 與 RB 之間的鏈路上走了 63 次，最後由 RB 丟棄。ICMP Time Exceeded 是 RB 新產生的封包：來源 IP 是 RB 的 10.0.0.2，目的 IP 是原封包的來源 192.168.30.10，TTL 重新從 64 開始。修正的方法是把 RB 那一列的下一跳改成 198.51.100.1、介面改成 eth1，或乾脆刪掉它，讓預設路由處理：' },
        { type: 'example', id: 'cn07-fixed-route' },
        { type: 'callout', tone: 'warning', title: 'TTL 不會修好迴圈，正確的預設路由也救不了它', text: 'TTL 只保證每一個封包最後會被丟棄，迴圈本身還在：PC 重送的每一個封包都會再繞 63 次才消失，連線永遠建立不起來，鏈路上還多了大量無用的流量。另外，RB 明明有一條正確的預設路由，卻因為打錯的 203.0.113.0/24 比較長而從來沒有被用到；檢查靜態路由時，要確認每一條比預設路由更具體的路由，下一跳都指向正確的方向。' },
      ],
    },
  ],
  examples: [],
  quiz: [
    {
      id: 'cn07-q1', prompt: '下列哪一件事屬於轉送（資料平面），而不是路由（控制平面）？',
      options: ['管理員在路由器上新增一條靜態路由', '路由器之間交換路由資訊，計算到各網路的最佳路徑', '收到封包後查路由表、把 TTL 減 1、從選定的介面送出', '鏈路斷線後，路由協定重新計算出一張新的路由表'],
      answer: 2,
      explanation: '轉送是對每一個封包做的事：讀目的 IP、查表、TTL 減 1、送出，屬於資料平面。新增靜態路由、交換路由資訊計算最佳路徑、斷線後重算路由表，都是在決定路由表的內容，屬於控制平面，只在設定或網路變動時發生，不是每個封包都做。',
    },
    {
      id: 'cn07-q2', prompt: '路由器的路由表有 10.0.0.0/8（eth2）、10.1.0.0/16（eth1）、10.1.2.0/24（eth0）、0.0.0.0/0（eth3）四列。目的位址 10.1.2.200 的封包從哪個介面送出？',
      options: ['eth0', 'eth1', 'eth2', 'eth3'],
      answer: 0,
      explanation: '10.1.2.200 的前三段是 10.1.2，同時符合 /8、/16、/24 與 /0 四列，最長的是 10.1.2.0/24，所以從 eth0 送出；/24 只比對前 24 位，第 4 段的 200 不影響。eth1 與 eth2 對應的 /16、/8 雖然也符合但比較短；eth3 的預設路由最短，只有其他都不符合時才用。',
    },
    {
      id: 'cn07-q3', prompt: '下列哪一個位址落在 10.1.16.0/20 之內？',
      options: ['10.1.15.255', '10.1.32.0', '10.1.2.20', '10.1.31.7'],
      answer: 3,
      explanation: '/20 比對第 3 段的前 4 位，遮罩第 3 段是 240：31 AND 240 = 16，和 10.1.16.0 相同，所以 10.1.31.7 在範圍內（範圍是 10.1.16.0 到 10.1.31.255）。15 AND 240 = 0、2 AND 240 = 0、32 AND 240 = 32，都不是 16；10.1.32.0 只比 10.1.31.255 多 1，卻已經是下一個 /20 區塊的開頭。',
    },
    {
      id: 'cn07-q4', prompt: '路由表中的預設路由 0.0.0.0/0 什麼時候會被選用？',
      options: ['永遠優先，因為它涵蓋所有目的地', '只有沒有任何其他路由符合目的位址時', '只有路由表中沒有其他路由時', '只有封包的 TTL 剩下 1 時'],
      answer: 1,
      explanation: '預設路由的前綴長度是 0，每個位址都符合，但它是最短的前綴；最長前綴匹配只有在其他路由都不符合時才會選它。涵蓋所有目的地正是它優先權最低的原因，不是最高；路由表裡有其他路由也照樣會用到它，只要那些路由都不符合；TTL 只決定封包會不會被丟棄，和選哪一條路由無關。',
    },
    {
      id: 'cn07-q5', prompt: '主機送出封包時 TTL 是 64，封包經過 3 台路由器轉送後到達目的主機。目的主機收到的 TTL 是多少？',
      options: ['64', '60', '67', '61'],
      answer: 3,
      explanation: '每台路由器轉送時把 TTL 減 1，3 台路由器共減 3：64 − 3 = 61。送出的主機與接收的主機都不減，所以不是 60（多算了一次）；路由器不會不改 TTL，所以不是 64；TTL 只會減少，不會增加，所以不是 67。',
    },
    {
      id: 'cn07-q6', prompt: '路由器收到一個要轉送到別的網路的封包，它的 TTL 是 1。路由器會怎麼做？',
      options: ['把 TTL 減成 0，丟棄封包，並回傳 ICMP Time Exceeded（類型 11）給封包的來源', '把 TTL 重設為 64 再轉送，讓封包能繼續前進', '把 TTL 減成 0 後照常轉送，由下一台路由器丟棄', '把封包送回給上一台路由器，請它改走別條路'],
      answer: 0,
      explanation: 'TTL 減 1 後是 0，路由器不能再轉送，所以丟棄封包，並用 ICMP 類型 11、代碼 0 通知來源。路由器不會重設 TTL，否則迴圈中的封包永遠不會消失；不會送出 TTL 為 0 的封包；也不會把封包退回上一台路由器，路由器只照路由表轉送，不記得封包從哪裡來。',
    },
    {
      id: 'cn07-q7', prompt: 'RB 有一條正確的預設路由指向 ISP，又有一條打錯的靜態路由「203.0.113.0/24，下一跳 RA」，而 RA 的預設路由指向 RB。PC 送往 203.0.113.9 的封包會怎樣？',
      options: ['走 RB 的預設路由到 ISP，因為預設路由是給外部網路用的', 'RB 發現迴圈後自動改走預設路由', '在 RA 與 RB 之間來回轉送，直到 TTL 減到 0 被丟棄', 'RB 在兩條符合的路由之間輪流選擇，一半的封包會到達'],
      answer: 2,
      explanation: '203.0.113.9 同時符合 RB 的 /24 與 /0，最長前綴匹配一定選 /24，把封包送回 RA；RA 用預設路由又送給 RB，形成迴圈，直到 TTL 歸零被丟棄。預設路由比較短，不會被選用；路由器只照表轉送，不會偵測迴圈；最長前綴匹配的結果是確定的，不會輪流選擇。',
    },
    {
      id: 'cn07-q8', prompt: '路由表中有一列「172.16.5.0/24，下一跳 10.0.23.2，介面 eth1」。符合這一列的封包會被怎麼處理？',
      options: ['路由器把封包的目的 IP 改成 10.0.23.2 再送出', '封包從 eth1 送出，訊框的目的 MAC 是 10.0.23.2 那台路由器的 MAC，目的 IP 不變', '10.0.23.2 是 172.16.5.0/24 裡的主機，封包直接送給它就算到達', '封包先交給 172.16.5.1，再由它轉給 10.0.23.2'],
      answer: 1,
      explanation: '下一跳是同一條鏈路上下一台路由器的 IP，路由器用它找出那台路由器的 MAC，把封包包進目的 MAC 是它的訊框，從 eth1 送出；IP 標頭的目的位址仍是最終目的地。路由器不會把目的 IP 改成下一跳；10.0.23.2 在 10.0.23.0/30 鏈路上，不在 172.16.5.0/24 裡，它只是中途的路由器；順序也不是先到 172.16.5.1，而是先交給下一跳 10.0.23.2。',
    },
  ],
  exercises: [],
  network: {
    scenes: [threeRouters, longestPrefix, routingLoop, fixedRoute],
    exercises: [
      { id: 'cn07-ex-slash20-next-hop', task: 'table', scene: 'cn07-longest-prefix', message: 'to-rd', node: 'r', table: '路由表', row: '10.1.16.0/20', column: '下一跳', title: '/20 的下一跳',
        statement: '在「最長前綴匹配：同一張路由表，五個目的地」情境中，核心路由器 R 又收到一個目的位址 10.1.31.200 的封包。依 R 的路由表做最長前綴匹配，這個封包會交給哪一個下一跳？請填選用的那一列的「下一跳」。',
        hints: ['先列出所有符合的路由，再挑前綴最長的；表中的順序不重要。', '31 的二進位是 00011111。10.1.16.0/20 比對第 3 段的前 4 位，16 是 00010000，前 4 位是 0001。'],
        explanation: '10.1.31.200 符合 10.0.0.0/8、10.1.0.0/16 與 0.0.0.0/0；第 3 段 31 = 00011111，前 4 位 0001 與 10.1.16.0/20 相同（31 AND 240 = 16），所以 /20 也符合；10.1.2.0/24 不符合（31 不是 2）。最長的是 /20，下一跳 10.255.0.10（R-D），從 eth4 送出。',
        mistakes: [
          { answer: { cell: '10.255.0.2' }, why: '看到 10.1 開頭就選 10.1.0.0/16：10.1.16.0/20 也符合，而且更長。' },
          { answer: { cell: '10.255.0.6' }, why: '照表的順序選了第一條符合的 10.0.0.0/8：路由器比較的是前綴長度，不是順序。' },
          { answer: { cell: '198.51.100.1' }, why: '以為預設路由優先：0.0.0.0/0 最短，只有其他都不符合時才用。' },
        ] },
      { id: 'cn07-ex-slash20-boundary', task: 'table', scene: 'cn07-longest-prefix', message: 'to-rb', node: 'r', table: '路由表', row: '10.1.0.0/16', column: '介面', title: '剛好跨出 /20 的位址',
        statement: '同一張 R 的路由表，目的位址 10.1.32.1 的封包會從哪一個介面送出？請填選用的那一列的「介面」。',
        hints: ['/20 的區塊大小是 256 − 240 = 16，10.1.16.0/20 的第 3 段從 16 到幾？', '32 的二進位是 00100000，前 4 位是 0010。'],
        explanation: '32 AND 240 = 32，不是 16，所以 10.1.32.1 不在 10.1.16.0/20（範圍只到 10.1.31.255）；它也不在 10.1.2.0/24。符合的是 /8、/16 與 /0，最長的是 10.1.0.0/16，下一跳 10.255.0.2（R-B），從 eth1 送出。',
        mistakes: [
          { answer: { cell: 'eth4' }, why: '以為 10.1.16.0/20 涵蓋到第 3 段 32：/20 的區塊是 16 個，從 16 到 31，32 已經是下一個區塊。' },
          { answer: { cell: 'eth2' }, why: '照表的順序選了第一條符合的 10.0.0.0/8：還有更長的 /16 符合。' },
          { answer: { cell: 'eth3' }, why: '以為不在 /20 就只能走預設路由：10.1.0.0/16 仍然符合，比 /0 長。' },
        ] },
      { id: 'cn07-ex-loop-next-hop', task: 'table', scene: 'cn07-routing-loop', message: 'loop-2', node: 'rb', table: '路由表', row: '203.0.113.0/24', column: '下一跳', title: '造成迴圈的那一列',
        statement: '在「靜態路由打錯」情境的第 3 步，RB 收到目的 203.0.113.9 的封包。RB 的路由表同時有一條正確的預設路由與一條打錯的靜態路由。RB 實際選用的那一列，下一跳是什麼？',
        hints: ['203.0.113.9 符合 RB 表中的哪幾列？', '/24 與 /0 都符合時，選前綴長的那一條，不管它是不是設定錯誤。'],
        explanation: '203.0.113.9 符合 203.0.113.0/24 與 0.0.0.0/0。最長前綴匹配選 /24，而這一列的下一跳被打成 RA 的 10.0.0.1，所以 RB 從 eth0 把封包送回 RA，形成迴圈。正確的預設路由（198.51.100.1）比較短，沒有機會被用到。',
        mistakes: [
          { answer: { cell: '198.51.100.1' }, why: '以為正確的預設路由會被選用：/24 比 /0 長，路由器不會判斷哪一列設定得對。' },
          { answer: { cell: '203.0.113.9' }, why: '把下一跳當成最終目的地：下一跳是同一條鏈路上下一台路由器的位址。' },
        ] },
      { id: 'cn07-ex-last-ttl', task: 'field', scene: 'cn07-routing-loop', message: 'loop-63', layer: 'network', field: 'TTL', title: '最後一次送出時的 TTL',
        statement: '同一個情境中，PC 送出封包時 TTL 是 64，之後 RA 與 RB 輪流轉送。RA 最後一次把這個封包送給 RB 時（第 63 次轉送），IP 標頭的 TTL 是多少？',
        hints: ['每轉送一次 TTL 減 1：第 k 次轉送後的 TTL 是 64 − k。', '路由器送出的封包 TTL 一定大於 0；減成 0 的封包會被丟棄，不會送出。'],
        explanation: '第 63 次轉送後 TTL 是 64 − 63 = 1。RA 收到 TTL 2 的封包，減 1 得 1，仍大於 0，所以照常送給 RB；RB 收到後減 1 得 0，丟棄並回傳 ICMP Time Exceeded。',
        mistakes: [
          { answer: { value: '0' }, why: '以為送出時已經是 0：TTL 減成 0 的路由器會丟棄封包，不會再送出。' },
          { answer: { value: '2' }, why: '少減了 RA 這一次：2 是 RA 收到時的值，轉送前還要減 1。' },
        ] },
      { id: 'cn07-ex-icmp-source', task: 'field', scene: 'cn07-routing-loop', message: 'time-exceeded', layer: 'network', field: '來源 IP', title: 'ICMP Time Exceeded 從哪裡來',
        statement: '同一個情境中，RB 丟棄 TTL 歸零的封包後，送出一個 ICMP Time Exceeded（類型 11）。這個 ICMP 封包的來源 IP 是什麼？',
        hints: ['ICMP Time Exceeded 是誰產生的新封包？', '它要送回原封包的來源 192.168.30.10，RB 從哪個介面送出？那個介面的位址是什麼？'],
        explanation: 'ICMP Time Exceeded 是 RB 產生的新封包，來源 IP 是 RB 送出它的介面 eth0 的位址 10.0.0.2，目的 IP 是原封包的來源 192.168.30.10。RA 轉送時不改來源 IP，所以 PC 收到時看到的也是 10.0.0.2，知道封包在這台路由器 TTL 歸零。traceroute 就是靠這個來源位址認出沿途的路由器。',
        mistakes: [
          { answer: { value: '203.0.113.9' }, why: '以為是目的主機回覆：封包從來沒有到達 203.0.113.9，是中途的路由器回覆。' },
          { answer: { value: '10.0.0.1' }, why: '以為 RA 轉送時把來源換成自己的位址：路由器轉送時不改來源 IP。' },
          { answer: { value: '192.168.30.10' }, why: '把來源與目的對調：192.168.30.10 是 ICMP 封包要送回的目的地。' },
        ] },
    ],
  },
};
