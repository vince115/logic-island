import type { NetworkScene, NodeTable, ProtocolHeader } from '@/lib/network/model';
import type { LessonContent } from '../schema';

/*
 * CN08 Routing Protocols: Distance Vector and Link State (CN-2). A network-protocol lesson on one four-router topology
 * with explicit link costs (R1–R2 1, R2–R3 2, R3–R4 1, and a backup link R2–R4 6), plus a BGP scene between five
 * autonomous systems. Every distance-vector step carries all four routing tables as they are right after that message
 * (the receiver recomputes min over its neighbours' latest vectors, Bellman-Ford style; ties never occur on this
 * topology and schedule); the link-state scene carries the receiver's link-state database and, at R1, the Dijkstra run
 * and the routing table. Interface addresses are RFC 1918 (10.0.xy.0/30 for the link between Rx and Ry), the BGP links
 * use 198.51.100.0/24 and the advertised prefix 203.0.113.0/24 (RFC 5737), and the AS numbers are the documentation
 * range 64496–64511 (RFC 5398). The scratch test re-simulates every table with its own Bellman-Ford and Dijkstra.
 */

const DESTS = ['R1', 'R2', 'R3', 'R4'];
/**
 * A router's routing table in destination order R1–R4, written as "distance/next hop" per destination: '16' is RIP's
 * infinity (unreachable), '—' no next hop, '本機' the router itself.
 */
const routes = (node: string, spec: string, changed?: number[]): NodeTable => ({
  node, name: '路由表', head: ['目的', '距離', '下一站'],
  rows: spec.split(' ').map((cell, i) => { const [distance, next] = cell.split('/'); return [DESTS[i], distance, next]; }),
  ...changed?.length ? { changed } : {},
});
type Tables = Record<'r1' | 'r2' | 'r3' | 'r4', string>;
/** All four routing tables after a step; only the routers named in `changed` changed (with the rows that did). */
const all = (t: Tables, changed: Partial<Record<keyof Tables, number[]>> = {}): NodeTable[] =>
  (Object.keys(t) as (keyof Tables)[]).map(node => routes(node, t[node], changed[node]));

/** The interface address a router sends from toward a neighbour (link xy is 10.0.xy.0/30, the lower router .1). */
const IF: Record<string, string> = {
  'r1>r2': '10.0.12.1', 'r2>r1': '10.0.12.2', 'r2>r3': '10.0.23.1', 'r3>r2': '10.0.23.2',
  'r3>r4': '10.0.34.1', 'r4>r3': '10.0.34.2', 'r2>r4': '10.0.24.1', 'r4>r2': '10.0.24.2',
};
/** A RIPv2 response carrying the sender's distance vector (one entry per destination, in order R1–R4). */
const rip = (from: string, to: string, vector: string[]): ProtocolHeader[] => [
  { layer: 'application', protocol: 'RIPv2', fields: [{ name: '指令', value: '2（Response，回應）' }, { name: '版本', value: '2' },
    ...vector.map((value, i) => ({ name: `到 ${DESTS[i]} 的距離`, value }))] },
  { layer: 'transport', protocol: 'UDP', fields: [{ name: '來源連接埠', value: '520' }, { name: '目的連接埠', value: '520' }] },
  { layer: 'network', protocol: 'IPv4', fields: [{ name: '來源 IP', value: IF[`${from}>${to}`] }, { name: '目的 IP', value: '224.0.0.9（RIPv2 路由器群播）' },
    { name: '協定', value: '17（UDP）' }] },
];
const POISON = '16（毒性逆轉）';

const ROUTERS = [
  { id: 'r1', label: '路由器 R1', kind: 'router' as const, addresses: ['10.0.12.1（往 R2，成本 1）'] },
  { id: 'r2', label: '路由器 R2', kind: 'router' as const, addresses: ['10.0.12.2（往 R1，成本 1）', '10.0.23.1（往 R3，成本 2）', '10.0.24.1（往 R4，成本 6）'] },
  { id: 'r3', label: '路由器 R3', kind: 'router' as const, addresses: ['10.0.23.2（往 R2，成本 2）', '10.0.34.1（往 R4，成本 1）'] },
  { id: 'r4', label: '路由器 R4', kind: 'router' as const, addresses: ['10.0.34.2（往 R3，成本 1）', '10.0.24.2（往 R2，成本 6）'] },
];
/** The converged tables before any failure (the same with or without poisoned reverse). */
const CONVERGED: Tables = { r1: '0/本機 1/R2 3/R2 4/R2', r2: '1/R1 0/本機 2/R3 3/R3', r3: '3/R2 2/R2 0/本機 1/R4', r4: '4/R3 3/R3 1/R3 0/本機' };

// ---- scene 1: distance vectors exchanged until convergence ------------------------------------------------------
const dvConverge: NetworkScene = {
  id: 'cn08-dv-converge', title: '距離向量：四台路由器交換向量直到收斂', model: 'tcp-ip',
  description: '四台路由器剛啟動，每台只知道直接相連的鄰居與鏈路成本：R1 的表是 R2 1，R3、R4 都是 16（RIP 用 16 表示無限大、到不了）；R2 是 R1 1、R3 2、R4 6；R3 是 R2 2、R4 1；R4 是 R2 6、R3 1。每則訊息是一台路由器把自己的距離向量（到每個目的地的距離）送給一個鄰居，收到的一方用「鏈路成本＋鄰居宣告的距離」重新計算。目的地直接寫成路由器名稱，代表接在那台路由器上的網路。每一步都列出四張路由表，標出這一步改變的列。',
  nodes: ROUTERS,
  messages: [
    { id: 'd1', from: 'r3', to: 'r2', label: 'R3 → R2：距離向量', headers: rip('r3', 'r2', ['16', '2', '0', '1']),
      note: 'R3 把自己的距離向量放在 RIPv2 回應裡送給 R2：到 R1 是 16（R3 還沒學到）、到 R2 是 2、到 R3 是 0、到 R4 是 1。R2 對每個目的地算「到 R3 的成本 2 ＋ R3 宣告的距離」：到 R4 是 2 + 1 = 3，比直連 R4 的 6 小，於是改成距離 3、下一站 R3。到 R1 是 2 + 16，仍是無限大，不如直連的 1。這就是 Bellman-Ford 的鬆弛，只是由 R2 自己、用鄰居送來的數字做。',
      tables: all({ r1: '0/本機 1/R2 16/— 16/—', r2: '1/R1 0/本機 2/R3 3/R3', r3: '16/— 2/R2 0/本機 1/R4', r4: '16/— 6/R2 1/R3 0/本機' }, { r2: [3] }) },
    { id: 'd2', from: 'r2', to: 'r1', label: 'R2 → R1：距離向量', headers: rip('r2', 'r1', ['1', '0', '2', '3']),
      note: 'R2 的表剛變過，觸發更新送給 R1：到 R3 是 2、到 R4 是 3。R1 只有一個鄰居 R2（成本 1），所以兩個目的地都是 1 加上宣告值：到 R3 是 3、到 R4 是 4，下一站都是 R2。R1 不知道 R2 之後還要經過 R3，它只知道「交給 R2，總共 4」。',
      tables: all({ r1: '0/本機 1/R2 3/R2 4/R2', r2: '1/R1 0/本機 2/R3 3/R3', r3: '16/— 2/R2 0/本機 1/R4', r4: '16/— 6/R2 1/R3 0/本機' }, { r1: [2, 3] }) },
    { id: 'd3', from: 'r2', to: 'r3', label: 'R2 → R3：距離向量', headers: rip('r2', 'r3', ['1', '0', '2', '3']),
      note: 'R2 把同一份向量也送給 R3。R3 原本不知道 R1，現在算出 2 + 1 = 3，下一站 R2。到 R4 經過 R2 是 2 + 3 = 5，不如直連的 1，維持不變。',
      tables: all({ r1: '0/本機 1/R2 3/R2 4/R2', r2: '1/R1 0/本機 2/R3 3/R3', r3: '3/R2 2/R2 0/本機 1/R4', r4: '16/— 6/R2 1/R3 0/本機' }, { r3: [0] }) },
    { id: 'd4', from: 'r3', to: 'r4', label: 'R3 → R4：距離向量', headers: rip('r3', 'r4', ['3', '2', '0', '1']),
      note: 'R3 學到了 R1，把新的向量送給 R4：到 R1 是 3、到 R2 是 2。R4 算出到 R1 是 1 + 3 = 4、到 R2 是 1 + 2 = 3，都比經過直連 R2（成本 6）的路好，下一站都改成 R3。',
      tables: all(CONVERGED, { r4: [0, 1] }) },
    { id: 'd5', from: 'r4', to: 'r2', label: 'R4 → R2：距離向量（沒有改變）', headers: rip('r4', 'r2', ['4', '3', '1', '0']),
      note: 'R4 把新的向量送給 R2：到 R1 是 4、到 R3 是 1。R2 經過 R4 的成本是 6 + 4 與 6 + 1，都比現有的路長，表完全沒變。此後不管誰再送向量，都不會改變任何一張表：網路收斂了。四張表的距離正好是以每台路由器為起點的最短路徑長度。',
      tables: all(CONVERGED) },
  ],
};

// ---- scene 2: link-state flooding, Dijkstra at R1, and re-convergence after R3–R4 fails ----------------------------
const LSDB_HEAD = ['LSA 來源', '序號', '鏈路（鄰居與成本）'];
const LSA = {
  r1: ['R1', '0x80000001', 'R2（1）'], r2: ['R2', '0x80000001', 'R1（1）、R3（2）、R4（6）'], r3: ['R3', '0x80000001', 'R2（2）、R4（1）'],
  r4: ['R4', '0x80000001', 'R3（1）、R2（6）'], r3New: ['R3', '0x80000002', 'R2（2）'],
};
const lsdb = (node: string, rows: string[][], changed?: number[]): NodeTable => ({ node, name: '鏈路狀態資料庫', head: LSDB_HEAD, rows, ...changed ? { changed } : {} });
const FULL_LSDB = [LSA.r1, LSA.r2, LSA.r3, LSA.r4];
const AFTER_FAILURE_LSDB = [LSA.r1, LSA.r2, LSA.r3New, LSA.r4];
const DIJKSTRA_HEAD = ['順序', '確定的路由器', '距離', '前一站', '這一步的鬆弛'];
const ospf = (from: string, to: string): ProtocolHeader[] => [{ layer: 'network', protocol: 'IPv4', fields: [
  { name: '來源 IP', value: IF[`${from}>${to}`] }, { name: '目的 IP', value: '224.0.0.5（所有 OSPF 路由器）' }, { name: '協定', value: '89（OSPF）' }, { name: 'TTL', value: '1' }] }];

const lsFlood: NetworkScene = {
  id: 'cn08-ls-flood', title: '鏈路狀態：LSA 泛洪、R1 執行 Dijkstra，斷線後重新計算', model: 'tcp-ip',
  description: '同一張拓樸改跑 OSPF。鄰居之間已用 Hello 建立鄰接，R1、R2、R3 描述自己鏈路的 LSA 已經傳遍全網（為了簡化，R2、R3 的 LSA 已列出通往 R4 的鏈路），R4 的 LSA 最後送出。看它怎麼泛洪、重複的副本怎麼被擋下，R1 怎麼用完整的資料庫執行 Dijkstra；最後 R3–R4 斷線，看新的 LSA 怎麼讓 R1 重新計算。OSPF 直接放在 IP 裡傳送（協定 89），LSA 的內容寫在資料欄。',
  nodes: ROUTERS,
  messages: [
    { id: 'l1', from: 'r4', to: 'r3', label: 'R4 → R3：LSU（R4 的 LSA）', headers: ospf('r4', 'r3'), payload: 'OSPF 鏈路狀態更新：R4 的 Router-LSA，序號 0x80000001，鏈路 R3（成本 1）、R2（成本 6）',
      note: 'R4 把描述自己鏈路的 Router-LSA 包在鏈路狀態更新（LSU）裡，送給每個鄰居。LSA 寫的不是「我到各地多遠」，而是「我和 R3 相連、成本 1；和 R2 相連、成本 6」。R3 的資料庫裡還沒有 R4 的 LSA，於是存下來並回覆確認。',
      tables: [lsdb('r3', FULL_LSDB, [3])] },
    { id: 'l2', from: 'r4', to: 'r2', label: 'R4 → R2：LSU（R4 的 LSA）', headers: ospf('r4', 'r2'), payload: 'OSPF 鏈路狀態更新：R4 的 Router-LSA，序號 0x80000001，鏈路 R3（成本 1）、R2（成本 6）',
      note: '同一份 LSA 也從另一個介面送到 R2，R2 同樣存進資料庫並回覆確認。',
      tables: [lsdb('r2', FULL_LSDB, [3])] },
    { id: 'l3', from: 'r3', to: 'r2', label: 'R3 → R2：轉送 R4 的 LSA（重複）', headers: ospf('r3', 'r2'), payload: 'OSPF 鏈路狀態更新：R4 的 Router-LSA，序號 0x80000001（重複的副本）',
      note: 'R3 收到新的 LSA 後，要轉送給除了來源 R4 以外的所有鄰居，也就是 R2。但 R2 已經有 R4、序號 0x80000001 的同一份 LSA，這份不比較新，R2 只回確認、不再轉送，資料庫不變。靠著序號，泛洪不會在 R2–R3–R4 這個環上無限繞下去。',
      tables: [lsdb('r2', FULL_LSDB)] },
    { id: 'l4', from: 'r2', to: 'r1', label: 'R2 → R1：轉送 R4 的 LSA', headers: ospf('r2', 'r1'), payload: 'OSPF 鏈路狀態更新：R4 的 Router-LSA，序號 0x80000001，鏈路 R3（成本 1）、R2（成本 6）',
      note: 'R2 在第 2 步收到 R4 的 LSA 時，也轉送給 R1 與 R3（給 R3 的那份同樣是重複的）。現在 R1 的資料庫和其他三台一模一樣，R1 以自己為起點執行 Dijkstra：確定 R2（1）後，R3 得到 3、R4 先得到 1 + 6 = 7；確定 R3（3）後，R4 被鬆弛成 3 + 1 = 4。最短路徑樹是 R1 → R2 → R3 → R4，路由表的下一站取樹上離開 R1 的第一段，所以三個目的地的下一站都是 R2。',
      tables: [
        lsdb('r1', FULL_LSDB, [3]),
        { node: 'r1', name: 'R1 的 Dijkstra', head: DIJKSTRA_HEAD, rows: [
          ['1', 'R1', '0', '—', 'R2 = 0 + 1 = 1'],
          ['2', 'R2', '1', 'R1', 'R3 = 1 + 2 = 3；R4 = 1 + 6 = 7'],
          ['3', 'R3', '3', 'R2', 'R4 = 3 + 1 = 4，比 7 小，更新'],
          ['4', 'R4', '4', 'R3', '鄰居都已確定，沒有可鬆弛的'],
        ], changed: [0, 1, 2, 3] },
        routes('r1', CONVERGED.r1, [0, 1, 2, 3]),
      ] },
    { id: 'l5', from: 'r3', to: 'r2', label: 'R3–R4 斷線：R3 送出新的 LSA', headers: ospf('r3', 'r2'), payload: 'OSPF 鏈路狀態更新：R3 的 Router-LSA，序號 0x80000002，鏈路 R2（成本 2）',
      note: 'R3–R4 的鏈路斷了。R3 立刻產生新的 LSA，序號加一成為 0x80000002，裡面只剩 R2（2）；R4 也會送出只剩 R2（6）的新 LSA（這裡只追 R3 的這一份）。R2 看到序號比資料庫裡的大，用新的取代舊的，再繼續泛洪。',
      tables: [lsdb('r2', AFTER_FAILURE_LSDB, [2])] },
    { id: 'l6', from: 'r2', to: 'r1', label: 'R2 → R1：轉送 R3 的新 LSA', headers: ospf('r2', 'r1'), payload: 'OSPF 鏈路狀態更新：R3 的 Router-LSA，序號 0x80000002，鏈路 R2（成本 2）',
      note: 'R1 收到 R3 的新 LSA，重新執行 Dijkstra。R4 的舊 LSA 雖然還寫著和 R3 相連，但 R3 的新 LSA 沒有回指 R4；OSPF 要求鏈路兩端都宣告才使用，所以 R3–R4 不再算數。R4 只能經過 R2–R4：1 + 6 = 7，下一站仍是 R2，距離從 4 變成 7。從斷線到 R1 算出新路只需要一輪泛洪，沒有計數到無限。',
      tables: [
        lsdb('r1', AFTER_FAILURE_LSDB, [2]),
        { node: 'r1', name: 'R1 的 Dijkstra', head: DIJKSTRA_HEAD, rows: [
          ['1', 'R1', '0', '—', 'R2 = 0 + 1 = 1'],
          ['2', 'R2', '1', 'R1', 'R3 = 1 + 2 = 3；R4 = 1 + 6 = 7'],
          ['3', 'R3', '3', 'R2', 'R3 的新 LSA 只連到 R2，沒有可鬆弛的'],
          ['4', 'R4', '7', 'R2', '鄰居都已確定，沒有可鬆弛的'],
        ], changed: [2, 3] },
        routes('r1', '0/本機 1/R2 3/R2 7/R2', [3]),
      ] },
  ],
};

// ---- scene 3: R3–R4 fails, plain distance vector: bad news travels slowly ----------------------------------------
const dvCount: NetworkScene = {
  id: 'cn08-dv-count', title: '鏈路斷線：沒有毒性逆轉，距離一點一點往上爬', model: 'tcp-ip',
  description: '從第一個情境收斂後的表開始（R1 到 R4 是 4，下一站 R2），而且每台路由器都已收過所有鄰居的最新向量。這一版的 RIP 沒有水平分割，也沒有毒性逆轉：每台路由器把完整的表告訴每個鄰居。R3–R4 的鏈路突然斷線，跟著向量看 R1、R2、R3 怎麼被彼此的舊消息誤導。',
  nodes: ROUTERS,
  messages: [
    { id: 'c0', from: 'r4', to: 'r3', label: 'R3–R4 斷線（R4 的更新送不到）', lost: true, headers: rip('r4', 'r3', ['4', '3', '1', '0']),
      note: 'R3 與 R4 之間的鏈路斷了，R4 的這次更新沒有送到（R3 偵測到介面中斷；若偵測不到，180 秒沒收到更新也會判定逾時）。R3 刪掉經過 R4 的路，改用手上其他鄰居的向量重算：R2 先前說過「到 R4 是 3」，所以 R3 算出 2 + 3 = 5，下一站 R2。問題是 R2 的那條路本來就經過 R3 和剛斷掉的鏈路，R3 從一個數字看不出來。另一端的 R4 只剩鄰居 R2，用 R2 的向量算出到 R1 是 7、到 R2 是 6、到 R3 是 8，這一側一次就算對了。',
      tables: all({ r1: CONVERGED.r1, r2: CONVERGED.r2, r3: '3/R2 2/R2 0/本機 5/R2', r4: '7/R2 6/R2 8/R2 0/本機' }, { r3: [3], r4: [0, 1, 2] }) },
    { id: 'c1', from: 'r3', to: 'r2', label: 'R3 → R2：到 R4 是 5', headers: rip('r3', 'r2', ['3', '2', '0', '5']),
      note: 'R3 告訴 R2「到 R4 是 5」。R2 原本經過 R3 去 R4，用新的數字重新比較三個鄰居：經過 R3 是 2 + 5 = 7、直連 R4 是 6、經過 R1 是 1 + 4 = 5。R1 的「4」也是舊消息（它的路經過 R2 自己），R2 卻選了它：距離 5、下一站 R1。現在 R1 與 R2 互相把往 R4 的封包丟給對方，形成路由迴圈。',
      tables: all({ r1: CONVERGED.r1, r2: '1/R1 0/本機 2/R3 5/R1', r3: '3/R2 2/R2 0/本機 5/R2', r4: '7/R2 6/R2 8/R2 0/本機' }, { r2: [3] }) },
    { id: 'c2', from: 'r2', to: 'r1', label: 'R2 → R1：到 R4 是 5', headers: rip('r2', 'r1', ['1', '0', '2', '5']),
      note: 'R2 的表變了，觸發更新告訴 R1「到 R4 是 5」。R1 的唯一鄰居是 R2，到 R4 變成 1 + 5 = 6。距離開始一小步一小步往上爬：每台路由器都只是把別人的舊數字加上自己的鏈路成本。',
      tables: all({ r1: '0/本機 1/R2 3/R2 6/R2', r2: '1/R1 0/本機 2/R3 5/R1', r3: '3/R2 2/R2 0/本機 5/R2', r4: '7/R2 6/R2 8/R2 0/本機' }, { r1: [3] }) },
    { id: 'c3', from: 'r2', to: 'r3', label: 'R2 → R3：到 R4 是 5', headers: rip('r2', 'r3', ['1', '0', '2', '5']),
      note: 'R3 的下一站是 R2，收到「到 R4 是 5」後變成 2 + 5 = 7。這時 R1、R2、R3 往 R4 的路都指向彼此，往 R4 的封包會在它們之間繞，直到 IP 標頭的 TTL 減到 0 被丟掉。',
      tables: all({ r1: '0/本機 1/R2 3/R2 6/R2', r2: '1/R1 0/本機 2/R3 5/R1', r3: '3/R2 2/R2 0/本機 7/R2', r4: '7/R2 6/R2 8/R2 0/本機' }, { r3: [3] }) },
    { id: 'c4', from: 'r1', to: 'r2', label: 'R1 → R2：到 R4 是 6', headers: rip('r1', 'r2', ['0', '1', '3', '6']),
      note: 'R1 告訴 R2「到 R4 是 6」。R2 再比較一次：經過 R1 是 1 + 6 = 7、經過 R3 是 2 + 7 = 9、直連 R4 是 6。直連的備援鏈路終於最小，R2 改成距離 6、下一站 R4，迴圈解開。',
      tables: all({ r1: '0/本機 1/R2 3/R2 6/R2', r2: '1/R1 0/本機 2/R3 6/R4', r3: '3/R2 2/R2 0/本機 7/R2', r4: '7/R2 6/R2 8/R2 0/本機' }, { r2: [3] }) },
    { id: 'c5', from: 'r2', to: 'r1', label: 'R2 → R1：到 R4 是 6', headers: rip('r2', 'r1', ['1', '0', '2', '6']),
      note: 'R2 把新的距離告訴 R1，R1 更新為 1 + 6 = 7，下一站仍是 R2。',
      tables: all({ r1: '0/本機 1/R2 3/R2 7/R2', r2: '1/R1 0/本機 2/R3 6/R4', r3: '3/R2 2/R2 0/本機 7/R2', r4: '7/R2 6/R2 8/R2 0/本機' }, { r1: [3] }) },
    { id: 'c6', from: 'r2', to: 'r3', label: 'R2 → R3：到 R4 是 6', headers: rip('r2', 'r3', ['1', '0', '2', '6']),
      note: 'R3 更新為 2 + 6 = 8。此後再交換也不會改變任何表，網路重新收斂：每個距離都等於拿掉 R3–R4 後的最短路徑。從斷線到收斂交換了 6 次向量，R2 的距離繞了 3 → 5 → 6 的遠路，中間還有一段時間出現迴圈：這就是「壞消息傳得慢」。如果沒有 R2–R4 這條備援鏈路，數字會一直加下去，直到 16 才停。',
      tables: all({ r1: '0/本機 1/R2 3/R2 7/R2', r2: '1/R1 0/本機 2/R3 6/R4', r3: '3/R2 2/R2 0/本機 8/R2', r4: '7/R2 6/R2 8/R2 0/本機' }, { r3: [3] }) },
  ],
};

// ---- scene 4: the same failure with poisoned reverse ----------------------------------------------------------------
const dvPoison: NetworkScene = {
  id: 'cn08-dv-poison', title: '同一次斷線，改用毒性逆轉', model: 'tcp-ip',
  description: '同樣從收斂後的表開始，R3–R4 同樣斷線，但每台路由器都啟用毒性逆轉：如果某個目的地的下一站就是這個鄰居，送給它的向量裡那個目的地寫 16，等於告訴它「別經過我回去」。標頭中標示「毒性逆轉」的 16 就是這樣來的。',
  nodes: ROUTERS,
  messages: [
    { id: 'p0', from: 'r4', to: 'r3', label: 'R3–R4 斷線（R4 的更新送不到）', lost: true, headers: rip('r4', 'r3', [POISON, POISON, POISON, '0']),
      note: 'R3–R4 斷線。先前 R2 到 R4 的路經過 R3，所以 R2 送給 R3 的向量裡「到 R4」一直寫 16。R3 刪掉經過 R4 的路後，沒有任何鄰居說得出到 R4 的有限距離，只好標成 16（到不了），而不是掉進經過 R2 的迴圈。R4 這一側和前一個情境相同。',
      tables: all({ r1: CONVERGED.r1, r2: CONVERGED.r2, r3: '3/R2 2/R2 0/本機 16/—', r4: '7/R2 6/R2 8/R2 0/本機' }, { r3: [3], r4: [0, 1, 2] }) },
    { id: 'p1', from: 'r3', to: 'r2', label: 'R3 → R2：到 R4 是 16', headers: rip('r3', 'r2', [POISON, POISON, '0', '16']),
      note: 'R3 觸發更新：到 R4 是 16。到 R1、R2 的下一站都是 R2，所以送給 R2 時也寫 16（毒性逆轉），這不影響 R2。R2 重新比較往 R4 的路：經過 R3 是 16、經過 R1 也是 16（R1 的下一站是 R2，同樣毒性逆轉過），只剩直連 R4 的 6。R2 一步就改用備援鏈路。',
      tables: all({ r1: CONVERGED.r1, r2: '1/R1 0/本機 2/R3 6/R4', r3: '3/R2 2/R2 0/本機 16/—', r4: '7/R2 6/R2 8/R2 0/本機' }, { r2: [3] }) },
    { id: 'p2', from: 'r2', to: 'r1', label: 'R2 → R1：到 R4 是 6', headers: rip('r2', 'r1', [POISON, '0', '2', '6']),
      note: 'R2 告訴 R1「到 R4 是 6」，R1 更新為 1 + 6 = 7。送給 R1 的向量中「到 R1」寫成 16，因為那條路的下一站就是 R1。',
      tables: all({ r1: '0/本機 1/R2 3/R2 7/R2', r2: '1/R1 0/本機 2/R3 6/R4', r3: '3/R2 2/R2 0/本機 16/—', r4: '7/R2 6/R2 8/R2 0/本機' }, { r1: [3] }) },
    { id: 'p3', from: 'r2', to: 'r3', label: 'R2 → R3：到 R4 是 6', headers: rip('r2', 'r3', ['1', '0', POISON, '6']),
      note: 'R3 收到「到 R4 是 6」，更新為 2 + 6 = 8、下一站 R2。只交換 3 次向量就重新收斂，中間沒有出現迴圈，結果和前一個情境相同。',
      tables: all({ r1: '0/本機 1/R2 3/R2 7/R2', r2: '1/R1 0/本機 2/R3 6/R4', r3: '3/R2 2/R2 0/本機 8/R2', r4: '7/R2 6/R2 8/R2 0/本機' }, { r3: [3] }) },
  ],
};

// ---- scene 5: BGP between autonomous systems -------------------------------------------------------------------------
const PREFIX = '203.0.113.0/24';
/** A BGP UPDATE over the eBGP session (TCP; each session was opened by the receiving side, so the sender uses port 179). */
const bgp = (from: string, to: string, asPath: string, port: string): ProtocolHeader[] => [
  { layer: 'application', protocol: 'BGP-4', fields: [{ name: '訊息類型', value: 'UPDATE' }, { name: 'NLRI（宣告的網路）', value: PREFIX },
    { name: 'AS_PATH', value: asPath }, { name: 'NEXT_HOP', value: from }, { name: 'ORIGIN', value: 'IGP' }] },
  { layer: 'transport', protocol: 'TCP', fields: [{ name: '來源連接埠', value: '179' }, { name: '目的連接埠', value: port }] },
  { layer: 'network', protocol: 'IPv4', fields: [{ name: '來源 IP', value: from }, { name: '目的 IP', value: to }, { name: '協定', value: '6（TCP）' }, { name: 'TTL', value: '1' }] },
];
const bgpRoutes = (node: string, nextAs: string, asPath: string, changed: boolean): NodeTable =>
  ({ node, name: '路由表', head: ['目的網路', '下一站 AS', 'AS_PATH'], rows: [[PREFIX, nextAs, asPath]], ...changed ? { changed: [0] } : {} });
const CANDIDATES_HEAD = ['鄰居 AS', 'AS_PATH', 'AS_PATH 長度', 'LOCAL_PREF', '最佳'];

const bgpPolicy: NetworkScene = {
  id: 'cn08-bgp-policy', title: 'BGP：兩條路到同一個網路，依政策而不是長度選擇', model: 'tcp-ip',
  description: '內容業者 AS64499 擁有 203.0.113.0/24。學校網路 AS64496 向兩家 ISP 買上網服務：AS64497（ISP 甲，按流量計費）與 AS64498（ISP 乙，固定月費）。管理者的匯入政策是「從 AS64498 學到的路由 LOCAL_PREF 設 200，其他維持預設 100」。看 UPDATE 一路傳來時 AS_PATH 怎麼變長，以及 AS64496 最後選哪一條。',
  nodes: [
    { id: 'as64499', label: 'AS64499（內容業者）', kind: 'router', addresses: ['擁有 203.0.113.0/24', '198.51.100.1（往 AS64497）', '198.51.100.9（往 AS64500）'] },
    { id: 'as64497', label: 'AS64497（ISP 甲）', kind: 'router', addresses: ['198.51.100.2（往 AS64499）', '198.51.100.5（往 AS64496）'] },
    { id: 'as64500', label: 'AS64500（中轉網路）', kind: 'router', addresses: ['198.51.100.10（往 AS64499）', '198.51.100.13（往 AS64498）'] },
    { id: 'as64498', label: 'AS64498（ISP 乙）', kind: 'router', addresses: ['198.51.100.14（往 AS64500）', '198.51.100.17（往 AS64496）'] },
    { id: 'as64496', label: 'AS64496（學校網路）', kind: 'router', addresses: ['198.51.100.6（往 AS64497）', '198.51.100.18（往 AS64498）', '匯入政策：來自 AS64498 的路由 LOCAL_PREF 200'] },
  ],
  messages: [
    { id: 'b1', from: 'as64499', to: 'as64497', label: 'UPDATE：203.0.113.0/24，AS_PATH 64499', headers: bgp('198.51.100.1', '198.51.100.2', '64499', '50110'),
      note: 'AS64499 的邊界路由器宣告自己的網路：AS_PATH 只有自己的 AS 號碼 64499，NEXT_HOP 是自己在這條鏈路上的位址。BGP 跑在 TCP 179 上，可靠傳送由 TCP 負責。',
      tables: [bgpRoutes('as64497', '64499', '64499', true)] },
    { id: 'b2', from: 'as64497', to: 'as64496', label: 'UPDATE：AS_PATH 64497 64499', headers: bgp('198.51.100.5', '198.51.100.6', '64497 64499', '50120'),
      note: 'AS64497 把路由轉告客戶 AS64496，在 AS_PATH 最前面加上自己的 64497，NEXT_HOP 換成自己的位址。AS64496 目前只有這一條候選，它就是最佳路徑。',
      tables: [
        { node: 'as64496', name: 'BGP 候選路徑', head: CANDIDATES_HEAD, rows: [['64497', '64497 64499', '2', '100', '是']], changed: [0] },
        bgpRoutes('as64496', '64497', '64497 64499', true),
      ] },
    { id: 'b3', from: 'as64499', to: 'as64500', label: 'UPDATE：AS_PATH 64499（另一個鄰居）', headers: bgp('198.51.100.9', '198.51.100.10', '64499', '50130'),
      note: 'AS64499 也把同一個網路宣告給另一個鄰居 AS64500。',
      tables: [bgpRoutes('as64500', '64499', '64499', true)] },
    { id: 'b4', from: 'as64500', to: 'as64498', label: 'UPDATE：AS_PATH 64500 64499', headers: bgp('198.51.100.13', '198.51.100.14', '64500 64499', '50140'),
      note: 'AS64500 加上 64500 後轉給 AS64498。每個 AS 收到 UPDATE 時都會檢查 AS_PATH：如果裡面已經有自己的號碼，表示這條路繞回來了，直接丟掉，這是 BGP 防止迴圈的方法。',
      tables: [bgpRoutes('as64498', '64500', '64500 64499', true)] },
    { id: 'b5', from: 'as64498', to: 'as64496', label: 'UPDATE：AS_PATH 64498 64500 64499', headers: bgp('198.51.100.17', '198.51.100.18', '64498 64500 64499', '50150'),
      note: 'AS64496 收到第二條候選：AS_PATH 有 3 個 AS，比經過 AS64497 的 2 個長。但匯入政策把它的 LOCAL_PREF 設成 200，而 BGP 先比 LOCAL_PREF（越大越好），只有平手時才比 AS_PATH 長度。所以最佳路徑改成經過 AS64498，往 203.0.113.0/24 的流量從此走固定月費的 ISP 乙。LOCAL_PREF 只在 AS 內部使用，不會出現在送給別的 AS 的 UPDATE 裡。',
      tables: [
        { node: 'as64496', name: 'BGP 候選路徑', head: CANDIDATES_HEAD, rows: [['64497', '64497 64499', '2', '100', '否'], ['64498', '64498 64500 64499', '3', '200', '是']], changed: [0, 1] },
        bgpRoutes('as64496', '64498', '64498 64500 64499', true),
      ] },
  ],
};

export const CN08: LessonContent = {
  lessonId: 'CN08',
  motivation: '打開一個網頁，封包可能要穿過十幾台路由器；每台路由器的路由表裡那些「往哪個網路、交給哪個下一站」的紀錄，是誰寫的？CN07 看過路由器怎麼查表轉送，這一課看表從哪裡來：路由器彼此交換訊息，自己算出到每個目的地的最短路徑，鏈路斷了還要自己找替代路線。你會看到兩種截然不同的做法：只和鄰居交換「我到各地多遠」的距離向量（RIP），以及把整張地圖傳給每個人、各自用 Dijkstra 計算的鏈路狀態（OSPF）；也會看到網路業者之間為什麼改用依商業政策選路的 BGP。學完後，給你一張標好成本的拓樸，你能一步一步算出每台路由器的路由表，並說明某條鏈路斷掉後，網路怎麼重新收斂、要多久、中間會出什麼問題。',
  sections: [
    {
      id: 'routing-problem', title: '路由協定要解決的問題：把網路看成加權圖',
      blocks: [
        { type: 'p', text: 'CN07 的路由器依路由表轉送封包，表裡的路由可以由管理者手動寫成靜態路由。但一個機構有幾十台路由器、鏈路隨時可能斷線時，手動維護既慢又容易出錯。路由協定讓路由器彼此交換資訊，自動算出路由表，並在拓樸改變時自己更新。表填好、而且所有路由器的看法一致、不再變動的狀態，叫做收斂（convergence）。' },
        { type: 'p', text: '路由協定把網路看成一張加權圖：路由器是點、鏈路是邊、鏈路成本是權重。成本可以代表延遲、頻寬的倒數，或管理者想讓流量少走某條線而設的數字。要找的就是 A16（圖的最短路徑）的單一起點最短路徑：每台路由器以自己為起點，求到每個目的地成本最小的路。本課所有路由情境都用下面這張四台路由器的拓樸。' },
        { type: 'table', head: ['鏈路', '成本', '兩端介面位址'], rows: [
          ['R1–R2', '1', '10.0.12.1 ↔ 10.0.12.2'],
          ['R2–R3', '2', '10.0.23.1 ↔ 10.0.23.2'],
          ['R3–R4', '1', '10.0.34.1 ↔ 10.0.34.2'],
          ['R2–R4', '6', '10.0.24.1 ↔ 10.0.24.2（備援鏈路）'],
        ] },
        { type: 'p', text: '同一個最短路徑問題有兩種分散的算法。距離向量（distance vector）：每台路由器只告訴鄰居「我到每個目的地有多遠」，大家反覆用鄰居的數字更新自己，是分散執行的 Bellman-Ford。鏈路狀態（link state）：每台路由器把「我和誰相連、成本多少」告訴全網，每台都拿到同一張完整地圖，再各自執行 Dijkstra。兩者在穩定時算出相同的路由表，差別在交換什麼、每台知道多少，以及鏈路斷掉之後的行為。' },
        { type: 'callout', tone: 'note', title: '本課把目的地寫成路由器名稱', text: '實際的路由表以網路前綴為目的地（例如 10.0.4.0/24），一台路由器後面可能有好幾個網路。為了專心看演算法，本課的「目的 R4」代表接在 R4 上的網路；把前綴代回去，每一列的距離與下一站算法完全相同。' },
      ],
    },
    {
      id: 'distance-vector', title: '距離向量：只和鄰居交換「我到各地多遠」',
      blocks: [
        { type: 'p', text: '距離向量的核心是 Bellman-Ford 方程式：路由器 x 到目的地 y 的距離 Dx(y) = min { c(x, v) + Dv(y) }，v 取遍 x 的每個鄰居。c(x, v) 是 x 到鄰居 v 的鏈路成本，Dv(y) 是 v 最近一次宣告的距離。A16 的 Bellman-Ford 在一台電腦上把所有邊鬆弛 V − 1 輪；距離向量把同樣的鬆弛拆給每台路由器，每台只鬆弛自己的鏈路，用的是鄰居送來的數字，不需要任何人知道整張圖。' },
        { type: 'list', ordered: true, items: [
          '開始時，自己的距離是 0，直接相連的鄰居是鏈路成本，其他目的地是無限大。',
          '把自己的距離向量（每個目的地一個數字）送給每個鄰居。',
          '收到鄰居的向量時存下來，對每個目的地重新算「鏈路成本＋鄰居宣告的距離」的最小值，最小值所在的鄰居就是下一站。',
          '表有改變就再送給鄰居（觸發更新）；沒有改變就等下一次定期更新。所有表都不再改變時，網路收斂。',
        ] },
        { type: 'p', text: 'RIP（Routing Information Protocol）是最典型的距離向量協定。RIPv2 的訊息放在 UDP 520 號埠，以群播位址 224.0.0.9 送給鄰居，每 30 秒送出整張表，180 秒沒聽到某條路的更新就判定逾時。RIP 的度量預設是跳數（每條鏈路算 1），管理者也可以替介面設定較大的成本，本課情境就用了 1、2、6 這些成本。度量 16 代表無限大，所以 RIP 的一條路最多 15 跳。' },
        { type: 'example', id: 'cn08-dv-converge' },
        { type: 'table', head: ['收斂後', '到 R1', '到 R2', '到 R3', '到 R4'], rows: [
          ['R1', '0', '1（經 R2）', '3（經 R2）', '4（經 R2）'],
          ['R2', '1（經 R1）', '0', '2（經 R3）', '3（經 R3）'],
          ['R3', '3（經 R2）', '2（經 R2）', '0', '1（經 R4）'],
          ['R4', '4（經 R3）', '3（經 R3）', '1（經 R3）', '0'],
        ] },
        { type: 'p', text: '注意 R2 與 R4 之間雖然有直接的鏈路，收斂後兩邊都不走它：經過 R3 的成本 2 + 1 = 3 比 6 小。好消息（出現更短的路）傳得很快，每交換一次就往外擴散一跳，第一個情境只要四次交換就收斂了。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：距離向量路由器知道整張拓樸', text: '收斂後的 R1 知道「到 R4 是 4、交給 R2」，但完全不知道這條路後面經過 R3、也不知道 R2–R4 之間有一條成本 6 的備援鏈路。距離向量路由器只看得到鄰居宣告的數字，看不到路是怎麼組成的；正因為看不到，鏈路斷掉時它分辨不出某個鄰居的數字是不是「經過自己」的舊路，這就是下一段計數到無限的根源。知道整張拓樸的是鏈路狀態協定。' },
      ],
    },
    {
      id: 'count-to-infinity', title: '壞消息傳得慢：計數到無限與毒性逆轉',
      blocks: [
        { type: 'p', text: '鏈路斷線時，失去路的路由器會去用其他鄰居的舊數字。這些數字可能正是經過自己、經過那條斷掉鏈路的路，但距離向量裡只有一個數字，看不出來。結果路由器互相引用對方的舊消息，每交換一次就把距離加上一段鏈路成本，慢慢往上爬，直到碰上真正的替代路線；如果根本沒有替代路線，就一路數到無限大。這叫計數到無限（count-to-infinity）。爬升的過程中，路由器之間的下一站互相指向對方，封包在迴圈裡繞到 TTL 用完。' },
        { type: 'example', id: 'cn08-dv-count' },
        { type: 'p', text: '這個情境有 R2–R4 的備援鏈路，數字爬到 6 就停了。如果拿掉 R2–R4，R4 完全到不了，R1、R2、R3 的數字會一直加下去；RIP 規定 16 是無限大，數到 16 時大家才承認「到不了」。這也是 RIP 把上限定得這麼小的原因：上限越小，計數到無限越快結束，代價是網路直徑不能超過 15 跳。' },
        { type: 'list', items: [
          '水平分割（split horizon）：從某個鄰居學來的路，不再告訴那個鄰居。R2 經過 R3 去 R4，就不在給 R3 的向量裡提到 R4。',
          '毒性逆轉（poisoned reverse）：更積極的做法，不是不提，而是明白告訴那個鄰居「經過我到不了」（距離 16），讓對方立刻刪掉經過自己的路。',
          '觸發更新（triggered update）：表一改變就立刻送出，不等 30 秒的定期更新，縮短壞消息的傳播時間。',
          '抑制計時（hold-down）：一條路剛變成到不了時，一段時間內不接受其他鄰居宣告的較差替代路，避免被舊消息騙回去。',
          '上限 16：最後一道保險，保證計數到無限一定會停。',
        ] },
        { type: 'example', id: 'cn08-dv-poison' },
        { type: 'callout', tone: 'warning', title: '常見誤解：開了毒性逆轉就不會再有計數到無限', text: '毒性逆轉只擋得住兩台路由器之間的來回：A 經過 B，B 就不會再經過 A。三台以上路由器組成的環（A 經過 B、B 經過 C、C 又經過 A）時，C 給 A 的向量不是毒性的，舊消息仍可能繞一圈回來，計數到無限照樣發生。所以 RIP 同時保留 16 的上限與逾時、抑制計時，而規模較大的網路改用鏈路狀態協定。' },
      ],
    },
    {
      id: 'link-state', title: '鏈路狀態與 OSPF：人人有同一張地圖，各自跑 Dijkstra',
      blocks: [
        { type: 'p', text: '鏈路狀態協定換一個方向：每台路由器不宣告「到各地多遠」，只宣告自己的鏈路，寫成一份鏈路狀態通告（LSA）：我是誰、和哪些鄰居相連、每條鏈路的成本、這份通告的序號。LSA 以泛洪（flooding）傳遍整個區域：收到比資料庫裡更新的 LSA，就存下來、回覆確認，再轉送給其他鄰居；收到相同或較舊的就只確認、不轉送。泛洪結束後，每台路由器的鏈路狀態資料庫（LSDB）完全相同，等於人人手上有同一張地圖。' },
        { type: 'p', text: '接著每台路由器以自己為起點，在這張圖上執行 A16 的 Dijkstra，得到一棵最短路徑樹。路由表的下一站是樹上從自己出發的第一段：R1 到 R4 的路是 R1 → R2 → R3 → R4，下一站是 R2，而不是 R4 在樹上的前一站 R3。資料庫相同，但起點不同，所以每台的最短路徑樹與路由表都不一樣。' },
        { type: 'list', items: [
          'OSPF（Open Shortest Path First）是最常見的鏈路狀態協定，直接放在 IP 裡傳送（協定號碼 89），不經過 TCP 或 UDP，可靠性由自己的確認與重送負責。',
          'Hello 訊息預設每 10 秒送一次（224.0.0.5），用來發現鄰居、確認鄰居還活著；40 秒沒聽到就判定鄰居失效。',
          '每份 LSA 有序號與存活時間：序號大的取代序號小的，舊的 LSA 也會定期重新產生，過期的會被清掉。',
          '介面成本預設是參考頻寬除以介面頻寬，頻寬越大成本越小；管理者也可以直接指定。',
          '計算路徑時，一條鏈路必須兩端的 LSA 都列出對方才會使用，單方面的宣告不算數。',
        ] },
        { type: 'example', id: 'cn08-ls-flood' },
        { type: 'p', text: '鏈路斷線後，兩端的路由器產生序號更大的新 LSA 並泛洪，其他路由器收到後重新執行 Dijkstra。沒有人需要相信別人算好的距離，每台都用最新的地圖自己算，所以不會出現距離向量那種一點一點往上爬的計數到無限。泛洪尚未傳遍的短暫時間裡，各台的資料庫可能不一致，仍可能有短暫的迴圈，但通常在一秒以內就結束。' },
        { type: 'p', text: '規模大時，每台路由器保存整個網路的 LSDB、每次變動都重跑 Dijkstra，成本會變高。OSPF 因此把一個自治系統切成多個區域（area）：區域 0 是骨幹，其他區域都接到骨幹上。LSA 的詳細內容只在區域內泛洪，跨區域時由區域邊界路由器（ABR）彙整成摘要，每台路由器的資料庫與計算量都變小，一個區域內的變動也不會讓整個自治系統重算。' },
      ],
    },
    {
      id: 'autonomous-systems', title: '自治系統與 BGP：網路之間依政策選路',
      blocks: [
        { type: 'p', text: '網際網路由數萬個自治系統（AS）組成：一個 AS 是由同一個組織管理、對外採用一致路由政策的一群網路，例如一家 ISP、一所大學或一家雲端業者，各有一個 AS 號碼（ASN）。AS 內部用內部閘道協定（IGP）選路，例如 RIP、OSPF 或 IS-IS，目標是成本最小；AS 之間則統一使用外部閘道協定 BGP-4（Border Gateway Protocol）。本課用 RFC 5398 保留給文件範例的 AS 號碼 64496–64511。' },
        { type: 'p', text: '為什麼 AS 之間不用 OSPF？第一是規模：全球路由表有上百萬個前綴，不可能讓每台路由器保存整個網際網路的拓樸並跑 Dijkstra。第二是隱私：業者不願公開內部拓樸與鏈路成本。第三是政策：選哪一條路取決於合約與費用（誰是付費的客戶、誰是對等互連的夥伴、誰是要付錢給它的上游），不是哪條路成本最小。' },
        { type: 'p', text: 'BGP 是路徑向量（path vector）協定：宣告的不是一個距離，而是「這個前綴，以及到它要經過的 AS 清單」，也就是 AS_PATH。每個 AS 把路由轉告鄰居前，在 AS_PATH 最前面加上自己的號碼；收到的 AS_PATH 裡如果已經有自己的號碼，就丟掉那條路，迴圈因此不會形成。BGP 路由器之間以 TCP 179 號埠建立連線，跨 AS 的稱為 eBGP，同一個 AS 內部傳遞外部路由的稱為 iBGP。同一個前綴有多條候選時，BGP 依序比較（簡化版）：' },
        { type: 'list', ordered: true, items: [
          'LOCAL_PREF 最大者優先：由本 AS 的匯入政策設定，只在 AS 內部傳遞，表達「我們比較想走哪個鄰居」。',
          'AS_PATH 最短者優先：經過的 AS 越少越好，但它只數 AS 個數，不管每個 AS 內部有多少跳、多慢。',
          'ORIGIN、MED 等其他屬性。',
          'eBGP 學來的優先於 iBGP 學來的。',
          '到 NEXT_HOP 的 IGP 成本最小者優先（盡快把流量送出自己的網路）。',
          '最後以路由器 ID 等規則打破平手。',
        ] },
        { type: 'example', id: 'cn08-bgp-policy' },
        { type: 'callout', tone: 'warning', title: '常見誤解：BGP 一定選最短路徑', text: 'BGP 沒有鏈路成本的概念，AS_PATH 長度也只排在 LOCAL_PREF 之後。情境中經過 AS64498 的路要經過 3 個 AS，比經過 AS64497 的 2 個長，卻因為 LOCAL_PREF 200 勝出。實務上業者常依「客戶的路優先於對等夥伴，對等夥伴優先於上游」設定 LOCAL_PREF，也會用重複加入自己號碼的 AS_PATH prepending 讓別人覺得某條路比較長。BGP 選的是政策上最好的路，不保證延遲最小、跳數最少。' },
      ],
    },
    {
      id: 'comparison', title: '收斂與三種協定的比較',
      blocks: [
        { type: 'p', text: '比較路由協定時，最重要的是兩件事：穩定時算出什麼樣的路，以及拓樸改變後要多久、經過什麼過程才重新收斂。收斂之前，不同路由器的表互相矛盾，可能形成迴圈（封包繞到 TTL 用完被丟掉），也可能形成黑洞（封包被送往已經不存在的路）。本課的同一次 R3–R4 斷線，三種做法的差異很明顯：沒有毒性逆轉的距離向量交換 6 次才收斂，中間有迴圈；毒性逆轉只要 3 次；鏈路狀態一輪泛洪後各自重算即可。' },
        { type: 'table', head: ['比較項目', '距離向量（RIP）', '鏈路狀態（OSPF）', '路徑向量（BGP）'], rows: [
          ['使用範圍', '自治系統內部（IGP），小型網路', '自治系統內部（IGP），中大型網路，可分區域', '自治系統之間（EGP），整個網際網路'],
          ['和誰交換', '只和鄰居', 'LSA 泛洪到區域內所有路由器', '只和建立連線的 BGP 鄰居'],
          ['交換的內容', '到每個目的地的距離', '自己的鏈路與成本（LSA）', '每個前綴的 AS_PATH 與屬性'],
          ['每台路由器知道', '鄰居宣告的距離，不知道拓樸', '整個區域的完整拓樸', '每條候選路徑經過哪些 AS，不知道 AS 內部'],
          ['計算方式', '分散的 Bellman-Ford', '各自執行 Dijkstra', '依政策與決策流程挑選'],
          ['選路依據', '成本最小', '成本最小', '政策（LOCAL_PREF）優先，其次 AS_PATH 長度'],
          ['斷線後', '可能慢慢收斂、計數到無限（16 為上限）', '泛洪新 LSA 後各自重算，通常很快', '撤回路由、逐條嘗試替代路，可能要數十秒到數分鐘'],
          ['傳送方式', 'UDP 520，每 30 秒送整張表', '直接放在 IP（協定 89），有變化才泛洪', 'TCP 179，有變化才送 UPDATE'],
        ] },
        { type: 'p', text: '選擇的原則：很小、很少變動的網路，RIP 設定簡單就夠用；企業或校園內部規模較大、需要快速收斂時用 OSPF（或 IS-IS），並用區域控制規模；只要網路要和其他業者交換路由，對外一定是 BGP，內部仍搭配一種 IGP。所以一個典型的 AS 同時跑兩種協定：OSPF 負責「AS 內部怎麼走最便宜」，BGP 負責「要從哪個出口離開、交給哪個鄰居 AS」。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  network: {
    scenes: [dvConverge, lsFlood, dvCount, dvPoison, bgpPolicy],
    exercises: [
      { id: 'cn08-ex-dv-step', task: 'table', scene: 'cn08-dv-converge', message: 'd2', node: 'r1', table: '路由表', row: 'R4', column: '距離',
        title: 'R1 第一次學到 R4',
        statement: '在「距離向量：四台路由器交換向量直到收斂」中，R2 把向量送給 R1（第 2 步）之後，R1 的路由表裡到 R4 的距離是多少？請填數字（到不了填 16）。',
        hints: ['先看第 1 步之後，R2 自己到 R4 的距離是多少：R2 剛從 R3 學到更短的路。', 'R1 唯一的鄰居是 R2，鏈路成本 1。', 'Bellman-Ford：鏈路成本＋鄰居宣告的距離。'],
        explanation: '第 1 步 R2 從 R3 學到「到 R4 是 2 + 1 = 3」，取代了直連的 6。第 2 步 R2 宣告的向量裡「到 R4」是 3，R1 算出 1 + 3 = 4，下一站 R2。這也正是 R1 到 R4 的最短路徑長度（R1 → R2 → R3 → R4）。',
        mistakes: [
          { answer: { cell: '7' }, why: '以為 R2 到 R4 還是直連的 6：第 1 步之後 R2 已經改走 R3，宣告的是 3。' },
          { answer: { cell: '3' }, why: '直接抄 R2 宣告的距離，忘了加上 R1–R2 的鏈路成本 1。' },
          { answer: { cell: '16' }, why: '以為 R1 只知道直接相連的鄰居：距離向量正是讓 R1 透過 R2 學到遠方的目的地。' },
        ] },
      { id: 'cn08-ex-ls-next-hop', task: 'table', scene: 'cn08-ls-flood', message: 'l4', node: 'r1', table: '路由表', row: 'R4', column: '下一站',
        title: 'Dijkstra 之後的下一站',
        statement: '在「鏈路狀態：LSA 泛洪、R1 執行 Dijkstra，斷線後重新計算」中，R1 收到 R4 的 LSA 並執行 Dijkstra 之後（第 4 步），R1 路由表中到 R4 的下一站是哪一台路由器？',
        hints: ['先畫出 R1 的最短路徑樹：R4 是在確定哪一台之後被鬆弛成 4 的？', '路由表要的是封包離開 R1 時交給誰，不是 R4 在樹上的前一站。'],
        explanation: 'R1 的最短路徑樹中，R4 的路是 R1 → R2 → R3 → R4（成本 1 + 2 + 1 = 4）。R1 只能把封包交給直接相連的鄰居，下一站是路徑上的第一段 R2；R3 是 R4 在樹上的前一站，由 R2、R3 自己再往下轉送。',
        mistakes: [
          { answer: { cell: 'R3' }, why: '把 Dijkstra 的「前一站」當成下一站：前一站是最後一段的起點，下一站是第一段的終點。' },
          { answer: { cell: 'R4' }, why: '以為 R1 直接送到目的地：R1 只和 R2 相連，到不了 R4 的介面。' },
        ] },
      { id: 'cn08-ex-count-loop', task: 'table', scene: 'cn08-dv-count', message: 'c1', node: 'r2', table: '路由表', row: 'R4', column: '下一站',
        title: '斷線後 R2 被舊消息誤導',
        statement: '在「鏈路斷線：沒有毒性逆轉，距離一點一點往上爬」中，R3 把「到 R4 是 5」告訴 R2（第 1 步，id c1）之後，R2 路由表中到 R4 的下一站是哪一台路由器？',
        hints: ['R2 存著每個鄰居最近一次宣告的向量：R1 還沒聽說斷線。', '分別算經過 R3、經過 R1、直連 R4 三條路的成本，取最小的。'],
        explanation: '經過 R3 是 2 + 5 = 7、直連 R4 是 6、經過 R1 是 1 + 4 = 5。R1 宣告的 4 是斷線前的舊數字，而且那條路本來就經過 R2 自己，但 R2 從一個距離看不出來，選了最小的 5、下一站 R1。R1 的下一站又是 R2，兩台互丟封包，形成迴圈。',
        mistakes: [
          { answer: { cell: 'R4' }, why: '以為 R2 會立刻改走直連的備援鏈路：成本 6 比經過 R1 的 5（舊消息）大，要等數字爬上去才輪到它。' },
          { answer: { cell: 'R3' }, why: '以為 R2 會繼續相信原本的下一站：R3 已經說到 R4 要 5，經過 R3 變成 7，不再是最小。' },
        ] },
      { id: 'cn08-ex-poison-converged', task: 'table', scene: 'cn08-dv-poison', message: 'p3', node: 'r3', table: '路由表', row: 'R4', column: '距離',
        title: '毒性逆轉後 R3 到 R4 的距離',
        statement: '在「同一次斷線，改用毒性逆轉」中，最後一步之後（id p3），R3 路由表中到 R4 的距離是多少？請填數字（到不了填 16）。',
        hints: ['斷線後 R4 只剩 R2–R4 這條成本 6 的鏈路可以到達。', 'R3 到 R2 的成本是 2，R2 到 R4 現在是多少？'],
        explanation: '第 1 步之後 R2 改走直連 R4（6），第 3 步 R2 把「到 R4 是 6」告訴 R3，R3 算出 2 + 6 = 8、下一站 R2。這等於拿掉 R3–R4 後的最短路徑 R3 → R2 → R4。毒性逆轉讓 R3 在斷線當下先標成 16，不是永遠到不了。',
        mistakes: [
          { answer: { cell: '16' }, why: '停在斷線當下的狀態：16 只是 R3 一時沒有替代路，R2 宣告備援路線後就恢復了。' },
          { answer: { cell: '5' }, why: '用了 R2 斷線前的「到 R4 是 3」：在毒性逆轉下 R2 一直告訴 R3 這條路是 16，R3 不會用它。' },
          { answer: { cell: '6' }, why: '只算 R2–R4 的成本，忘了加上 R3–R2 的 2。' },
        ] },
      { id: 'cn08-ex-bgp-choice', task: 'table', scene: 'cn08-bgp-policy', message: 'b5', node: 'as64496', table: '路由表', row: '203.0.113.0/24', column: '下一站 AS',
        title: 'AS64496 選哪個鄰居',
        statement: '在「BGP：兩條路到同一個網路，依政策而不是長度選擇」中，AS64496 收到第二條 UPDATE 之後（id b5），它的路由表中往 203.0.113.0/24 的下一站 AS 是哪一個？請填 AS 號碼（例如 64499）。',
        hints: ['比較兩條候選的 LOCAL_PREF 與 AS_PATH 長度。', 'BGP 決策流程中，LOCAL_PREF 排在 AS_PATH 長度前面。'],
        explanation: '兩條候選：經 64497 的 AS_PATH 長度 2、LOCAL_PREF 100；經 64498 的長度 3、LOCAL_PREF 200。BGP 先比 LOCAL_PREF，200 勝出，不必再比長度，所以下一站 AS 是 64498。',
        mistakes: [
          { answer: { cell: '64497' }, why: '以為 BGP 選 AS_PATH 最短的路：LOCAL_PREF 先比，而且這裡分出了勝負。' },
          { answer: { cell: '64499' }, why: '填了宣告這個網路的 AS：下一站 AS 是直接相連、把路由告訴我們的鄰居。' },
        ] },
    ],
  },
  quiz: [
    {
      id: 'q-dv-knowledge', prompt: '一台執行距離向量協定（例如 RIP）的路由器收斂之後，它知道什麼？',
      options: ['整個網路的拓樸與每條鏈路的成本', '自己到每個目的地的距離與下一站，以及每個鄰居最近宣告的距離', '只知道直接相連的鄰居，其他目的地一律交給預設路由', '到每個目的地要依序經過的每一台路由器'],
      answer: 1,
      explanation: '距離向量路由器只保存鄰居宣告的距離，並由此算出自己的距離與下一站。知道完整拓樸的是鏈路狀態協定；距離向量正是讓路由器學到遠方的目的地，不只認得鄰居；記錄經過哪些節點的是路徑向量（BGP 記錄的是 AS，而不是每台路由器）。',
    },
    {
      id: 'q-ls-database', prompt: 'OSPF 在同一個區域收斂後，下列哪一個敘述正確？',
      options: ['區域內每台路由器的路由表都相同', '只由一台指定的路由器執行 Dijkstra，再把結果發給其他路由器', '每台路由器只保存和自己鄰居之間的鏈路', '每台路由器的鏈路狀態資料庫相同，但各自以自己為起點執行 Dijkstra，得到不同的路由表'],
      answer: 3,
      explanation: 'LSA 泛洪讓區域內每台路由器有同一份資料庫，再各自以自己為起點計算最短路徑樹，所以路由表因起點不同而不同。路由表不會相同（R1 與 R4 的下一站顯然不同）；OSPF 沒有替別人計算路徑的路由器；只保存鄰居鏈路的是距離向量的想法，鏈路狀態要的是整張圖。',
    },
    {
      id: 'q-count-cause', prompt: '本課情境中，R3–R4 斷線（沒有毒性逆轉）後，R3 為什麼把到 R4 的路改成距離 5、下一站 R2？',
      options: ['R2 先前宣告「到 R4 是 3」，那條路其實經過 R3 自己和斷掉的鏈路，但 R3 從一個距離看不出來', 'R3 立刻得知 R2–R4 的備援鏈路，改走 R3 → R2 → R4', 'RIP 規定鏈路斷線時把距離加 4', 'R3 收到全網的 LSA，重新執行 Dijkstra 後算出新路'],
      answer: 0,
      explanation: 'R3 用 R2 的舊向量算出 2 + 3 = 5，但 R2 的 3 正是經過 R3–R4 的路，這就是計數到無限的起點。如果真的走備援鏈路，距離應該是 2 + 6 = 8，不是 5；RIP 沒有「加 4」的規則，數字是鏈路成本加鄰居宣告值算出來的；LSA 與 Dijkstra 是鏈路狀態協定的做法，RIP 不會收到全網拓樸。',
    },
    {
      id: 'q-poison', prompt: '啟用毒性逆轉的 RIP 中，R2 到 R4 的路由是距離 3、下一站 R3。R2 送給 R3 與送給 R1 的向量裡，「到 R4」分別寫多少？',
      options: ['兩邊都寫 3', '給 R3 寫 3，給 R1 寫 16', '給 R3 寫 16，給 R1 寫 3', '兩邊都寫 16'],
      answer: 2,
      explanation: '毒性逆轉只對「下一站就是這個鄰居」的目的地寫 16：R2 經過 R3 去 R4，所以告訴 R3「經過我到不了 R4」，免得 R3 在斷線時繞回 R2；R1 不是這條路的下一站，照常收到 3。兩邊都寫 3 是沒有毒性逆轉；給 R1 寫 16 把對象弄反了；兩邊都寫 16 會讓 R1 以為到不了 R4。',
    },
    {
      id: 'q-rip-16', prompt: 'RIP 把度量 16 當成無限大，一條路最多 15 跳。這個設計的主要作用是什麼？',
      options: ['讓封包 IP 標頭的 TTL 不必大於 16', '讓計數到無限在有限次交換內結束，代價是 RIP 只適合直徑不超過 15 跳的網路', '保證任何拓樸都不會出現路由迴圈', '讓 RIP 可以改用 Dijkstra 計算路徑'],
      answer: 1,
      explanation: '沒有替代路線時，距離會一直往上爬，16 讓它爬到一個不大的數字就停下來並判定到不了。TTL 是 IP 標頭的欄位，和 RIP 的度量上限無關；16 只是讓迴圈結束，計數期間仍會有暫時的迴圈；RIP 一直是距離向量協定，上限和 Dijkstra 無關。',
    },
    {
      id: 'q-bgp-policy', prompt: 'AS64496 從 AS64497 收到 AS_PATH「64497 64499」，從 AS64498 收到「64498 64500 64499」，匯入政策把來自 AS64498 的路由 LOCAL_PREF 設成 200（其他 100）。BGP 會選哪一條？',
      options: ['經 AS64498：LOCAL_PREF 在 AS_PATH 長度之前比較，200 大於 100', '經 AS64497：AS_PATH 比較短，BGP 一律選最短路徑', '兩條同時使用，流量平均分配', '經 AS64497：先收到的路由一律優先'],
      answer: 0,
      explanation: 'BGP 的決策流程先比 LOCAL_PREF，200 已經勝出，不會再比 AS_PATH 長度。說 BGP 一律選最短路徑是常見誤解；預設只選一條最佳路徑，不會平均分配；收到的先後最多只是很後面的平手規則，這裡在第一步就分出勝負了。',
    },
    {
      id: 'q-igp-egp', prompt: '一所大學的網路是一個自治系統，內部有數十台路由器，並同時連接兩家 ISP。下列分工哪一個最合理？',
      options: ['內部和對外都用 RIP，因為設定最簡單', '內部用 BGP 找成本最小的路，對 ISP 用 OSPF 交換政策', '內部不需要路由協定，全部靠從 ISP 學來的 BGP 路由', '內部用 OSPF 這類內部閘道協定找成本最小的路，對兩家 ISP 用 BGP 交換可達的網路並套用政策'],
      answer: 3,
      explanation: 'AS 內部用 IGP（OSPF）依成本選路並快速收斂，AS 之間用 BGP 依政策選擇出口。RIP 最多 15 跳、無法表達政策，也承受不了網際網路上百萬條路由，不適合和 ISP 交換路由；BGP 沒有鏈路成本，OSPF 也不是跨 AS 的協定，兩者用途弄反了；BGP 路由只告訴我們從哪個出口離開，校內數十台路由器之間仍需要 IGP 才知道彼此的網路。',
    },
    {
      id: 'q-dv-update', prompt: '路由器 X 到鄰居 Y 的成本是 3，到鄰居 Z 的成本是 2。X 目前到網路 N 的路是距離 9、下一站 Z（Z 宣告的距離是 7）。現在 Y 送來的向量中「到 N」是 4。X 更新後到 N 的路是什麼？',
      options: ['距離 4，下一站 Y', '距離 9，下一站 Z：已經有路由就不換', '距離 7，下一站 Y', '距離 13，下一站 Y'],
      answer: 2,
      explanation: '經過 Y 是 3 + 4 = 7，經過 Z 是 2 + 7 = 9，取最小值：距離 7、下一站 Y。距離 4 忘了加上 X–Y 的鏈路成本；距離向量只要找到更小的值就會更換，不會因為已有路由而保留；13 是把現有距離 9 和 Y 的宣告值相加，算法錯誤。',
    },
  ],
};
