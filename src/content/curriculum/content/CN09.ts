import type { NetworkScene, NodeTable, ProtocolHeader } from '@/lib/network/model';
import type { LessonContent } from '../schema';

/*
 * CN09 TCP and UDP (CN-2, network-sequence). Four fixed scenes: a whole TCP connection (handshake, two request segments
 * of 200 and 120 bytes, a 500-byte response, the four-way close and TIME_WAIT), one DNS query over UDP set against the
 * same query over TCP, a SYN to a closed port answered with RST/ACK beside a SYN silently dropped by a firewall, and a
 * server's connection table (5-tuples, LISTEN, ESTABLISHED, FIN_WAIT_1, TIME_WAIT). Every Seq/Ack follows from the ISN
 * and the stated data lengths (SYN and FIN take one sequence number each); tests recompute them. Addresses are the RFC
 * 5737 documentation ranges. Windows, retransmission timing and congestion are left to CN10.
 */

/** A TCP header; `ack` is left out for a segment without the ACK flag (its Ack field is not used). */
const tcp = (from: string, to: string, flags: string, seq: number, ack: number | undefined, window: string): ProtocolHeader => ({
  layer: 'transport', protocol: 'TCP', fields: [
    { name: '來源連接埠', value: from }, { name: '目的連接埠', value: to }, { name: 'Seq', value: String(seq) },
    { name: 'Ack', value: ack === undefined ? '0（沒有 ACK 旗標，不使用）' : String(ack) }, { name: '旗標', value: flags }, { name: '視窗', value: window }] });
const udp = (from: string, to: string, length: number): ProtocolHeader => ({
  layer: 'transport', protocol: 'UDP', fields: [
    { name: '來源連接埠', value: from }, { name: '目的連接埠', value: to }, { name: '長度', value: String(length) },
    { name: '檢查碼', value: '由傳送端計算（涵蓋偽標頭、UDP 標頭與資料）' }] });
const ipv4 = (from: string, to: string): ProtocolHeader => ({ layer: 'network', protocol: 'IPv4', fields: [{ name: '來源 IP', value: from }, { name: '目的 IP', value: to }] });

// ---- Scene 1: a whole connection ---------------------------------------------------------------------------------
const C = '192.0.2.10', S = '203.0.113.80';
const states = (client: string, server: string, changed: { client?: boolean; server?: boolean }): NodeTable[] => [
  { node: 'client', name: '用戶端的 TCP 狀態', head: ['連線', '狀態'], rows: [['本機 52344 ↔ 203.0.113.80:80', client]], ...changed.client ? { changed: [0] } : {} },
  { node: 'server', name: '伺服器的 TCP 狀態', head: ['連線', '狀態'], rows: [['本機 80 ↔ 192.0.2.10:52344', server]], ...changed.server ? { changed: [0] } : {} }];
const up = (flags: string, seq: number, ack: number | undefined) => [tcp('52344', '80', flags, seq, ack, '65535'), ipv4(C, S)];
const down = (flags: string, seq: number, ack: number) => [tcp('80', '52344', flags, seq, ack, '64240'), ipv4(S, C)];

/** Section 4 (and the close of section 5): ISN 4000 and 9000; request 200 + 120 bytes, response 500 bytes. */
const connection: NetworkScene = {
  id: 'cn09-tcp-connection', title: '一條 TCP 連線的一生：交握、資料與關閉', model: 'tcp-ip',
  description: '用戶端（192.0.2.10:52344）向網頁伺服器（203.0.113.80:80）要一個網頁。用戶端的起始序號是 4000，伺服器是 9000；請求共 320 位元組，分成 200 與 120 位元組兩個區段，回應 500 位元組，最後由用戶端先關閉。表格是這個區段送到、對方處理完之後兩端的狀態。',
  nodes: [
    { id: 'client', label: '用戶端', kind: 'host', addresses: ['192.0.2.10:52344', 'ISN 4000'] },
    { id: 'server', label: '網頁伺服器', kind: 'server', addresses: ['203.0.113.80:80', 'ISN 9000'] },
  ],
  messages: [
    { id: 'syn', from: 'client', to: 'server', label: 'SYN', headers: up('SYN', 4000, undefined), payload: '沒有資料（0 位元組）',
      note: '用戶端選了起始序號（ISN）4000，送出只設 SYN 旗標的區段，要求連到伺服器的 80 連接埠；來源連接埠 52344 是作業系統臨時挑的。SYN 不帶資料，卻占掉序號 4000。ACK 旗標沒有設，所以 Ack 欄位不使用。伺服器的 80 連接埠有程式在監聽，收到後準備回覆，進入 SYN_RECEIVED。',
      tables: states('SYN_SENT', 'SYN_RECEIVED', { client: true, server: true }) },
    { id: 'syn-ack', from: 'server', to: 'client', label: 'SYN, ACK', headers: down('SYN, ACK', 9000, 4001), payload: '沒有資料（0 位元組）',
      note: '伺服器選了自己的 ISN 9000，同時設 SYN 與 ACK：Ack = 4000 + 1 = 4001，意思是「你的 SYN（序號 4000）收到了，下一個請從 4001 開始」。用戶端收到後進入 ESTABLISHED。',
      tables: states('ESTABLISHED', 'SYN_RECEIVED', { client: true }) },
    { id: 'ack', from: 'client', to: 'server', label: 'ACK（交握完成）', headers: up('ACK', 4001, 9001), payload: '沒有資料（0 位元組）',
      note: '用戶端確認伺服器的 SYN：Ack = 9000 + 1 = 9001。這個區段只有 ACK、不帶資料，不占序號，所以用戶端的下一個序號仍是 4001。伺服器收到後也進入 ESTABLISHED，三向交握完成。',
      tables: states('ESTABLISHED', 'ESTABLISHED', { server: true }) },
    { id: 'data-1', from: 'client', to: 'server', label: '請求第 1 段（200 位元組）', headers: up('ACK', 4001, 9001),
      payload: 'HTTP 請求的前 200 位元組（序號 4001–4200）：GET /scores HTTP/1.1、Host 與其他標頭',
      note: '用戶端送出請求的第一個區段，資料 200 位元組。第一個資料位元組的序號是 4001（4000 被 SYN 用掉了），這個區段涵蓋 4001 到 4200。Ack 仍是 9001，因為伺服器還沒送資料。' },
    { id: 'data-2', from: 'client', to: 'server', label: '請求第 2 段（120 位元組）', headers: up('PSH, ACK', 4201, 9001),
      payload: '請求的後 120 位元組（序號 4201–4320），請求到此結束',
      note: '第二個區段從 4001 + 200 = 4201 開始，資料 120 位元組，涵蓋 4201 到 4320。PSH 旗標請伺服器把收到的資料儘快交給程式。用戶端不必等第一個區段被確認就能送出第二個；一次最多能送多少由視窗決定，那是 CN10 的主題。' },
    { id: 'response', from: 'server', to: 'client', label: '回應（500 位元組）', headers: down('PSH, ACK', 9001, 4321),
      payload: 'HTTP/1.1 200 OK 與網頁內容，共 500 位元組（序號 9001–9500）',
      note: '伺服器收齊 4001–4320 共 320 位元組，下一個期待 4321，所以 Ack = 4321，一次確認了兩個區段。這個確認搭在回應資料上一起送（piggyback）：Seq 9001，資料 500 位元組，涵蓋 9001 到 9500。' },
    { id: 'ack-response', from: 'client', to: 'server', label: 'ACK', headers: up('ACK', 4321, 9501), payload: '沒有資料（0 位元組）',
      note: '用戶端收到 9001–9500，回 Ack = 9500 + 1 = 9501。這是純 ACK，不占序號，用戶端的 Seq 還是 4321。' },
    { id: 'fin-client', from: 'client', to: 'server', label: 'FIN, ACK（用戶端先關）', headers: up('FIN, ACK', 4321, 9501), payload: '沒有資料（0 位元組）',
      note: '用戶端沒有其他請求，先關閉：送出 FIN（附帶 ACK），Seq 4321。FIN 和 SYN 一樣占一個序號，用掉 4321。用戶端進入 FIN_WAIT_1；伺服器收到後進入 CLOSE_WAIT，並通知它的程式「對方不會再送資料了」。',
      tables: states('FIN_WAIT_1', 'CLOSE_WAIT', { client: true, server: true }) },
    { id: 'ack-fin', from: 'server', to: 'client', label: 'ACK', headers: down('ACK', 9501, 4322), payload: '沒有資料（0 位元組）',
      note: '伺服器確認用戶端的 FIN：Ack = 4321 + 1 = 4322。伺服器的 Seq 是 9501（9001–9500 已經送出）。用戶端收到後進入 FIN_WAIT_2，等伺服器關閉它那一個方向；在這段半關閉期間，伺服器仍然可以繼續送資料。',
      tables: states('FIN_WAIT_2', 'CLOSE_WAIT', { client: true }) },
    { id: 'fin-server', from: 'server', to: 'client', label: 'FIN, ACK（伺服器關閉）', headers: down('FIN, ACK', 9501, 4322), payload: '沒有資料（0 位元組）',
      note: '伺服器的程式也關閉了 socket，送出自己的 FIN：Seq 9501，這個 FIN 占掉序號 9501；Ack 仍是 4322。伺服器進入 LAST_ACK；用戶端收到 FIN 後回最後的 ACK，進入 TIME_WAIT。',
      tables: states('TIME_WAIT', 'LAST_ACK', { client: true, server: true }) },
    { id: 'last-ack', from: 'client', to: 'server', label: '最後的 ACK', headers: up('ACK', 4322, 9502), payload: '沒有資料（0 位元組）',
      note: '用戶端確認伺服器的 FIN：Ack = 9501 + 1 = 9502，Seq 是 4322（4321 被自己的 FIN 用掉）。伺服器收到後連線關閉（CLOSED）；先關閉的用戶端還要在 TIME_WAIT 等 2MSL，這組 5-tuple 才會被釋放。',
      tables: states('TIME_WAIT', 'CLOSED', { server: true }) },
  ],
};

// ---- Scene 2: one DNS query over UDP, then over TCP ---------------------------------------------------------------
const R = '198.51.100.53';
const dns = (id: string, answer?: string, prefix?: number): ProtocolHeader => ({ layer: 'application', protocol: 'DNS', fields: [
  ...prefix === undefined ? [] : [{ name: '長度前綴', value: String(prefix) }],
  { name: 'ID', value: id }, { name: 'QR', value: answer ? '1（回應）' : '0（查詢）' }, { name: '問題', value: 'www.example.com A' },
  ...answer ? [{ name: '答案', value: answer }] : []] });
const ANSWER = 'www.example.com A 203.0.113.80（TTL 300）';

/** Section 6: the query is 33 bytes (header 12, question 21), the response 49 (plus a 16-byte answer). */
const dnsUdpVsTcp: NetworkScene = {
  id: 'cn09-dns-udp-vs-tcp', title: '同一個 DNS 查詢：走 UDP 與走 TCP', model: 'tcp-ip',
  description: '筆電向 DNS 伺服器（198.51.100.53:53）查 www.example.com 的 IPv4 位址。DNS 查詢 33 位元組（標頭 12、問題 21），回應 49 位元組（再加 16 位元組的答案）。前兩步走 UDP；後六步是同一個查詢改走 TCP，TCP 那邊筆電的 ISN 是 7000，DNS 伺服器是 3000。數一數兩種方式各要幾個封包、幾個往返才拿到答案。',
  nodes: [
    { id: 'laptop', label: '筆電', kind: 'host', addresses: ['IP 192.0.2.10'] },
    { id: 'resolver', label: 'DNS 伺服器', kind: 'resolver', addresses: ['IP 198.51.100.53', 'UDP 53、TCP 53'] },
  ],
  messages: [
    { id: 'udp-query', from: 'laptop', to: 'resolver', label: 'UDP：DNS 查詢', headers: [dns('0x1a2b'), udp('53001', '53', 41), ipv4(C, R)],
      payload: 'DNS 訊息 33 位元組：標頭 12、問題 21（名稱 17、類型 2、類別 2）',
      note: '筆電把 33 位元組的 DNS 查詢交給 UDP，從臨時連接埠 53001 送到 DNS 伺服器的 53。UDP 長度 = 8 + 33 = 41。沒有交握，第一個封包就帶著查詢。' },
    { id: 'udp-response', from: 'resolver', to: 'laptop', label: 'UDP：DNS 回應', headers: [dns('0x1a2b', ANSWER), udp('53', '53001', 57), ipv4(R, C)],
      payload: 'DNS 訊息 49 位元組：標頭 12、原本的問題 21、答案 16',
      note: 'DNS 伺服器回 49 位元組的回應，UDP 長度 = 8 + 49 = 57。連接埠對調，筆電依 ID 0x1a2b 對上自己的查詢。一來一回，一個 RTT 就拿到答案；若這個回應遺失，UDP 不會重送，是 DNS 用戶端等不到回應時自己重問。' },
    { id: 'tcp-syn', from: 'laptop', to: 'resolver', label: 'TCP：SYN', headers: [tcp('53002', '53', 'SYN', 7000, undefined, '65535'), ipv4(C, R)], payload: '沒有資料（0 位元組）',
      note: '同一個查詢改走 TCP（例如 UDP 回應被截斷時）：要先交握。筆電從連接埠 53002 送 SYN，ISN 7000。' },
    { id: 'tcp-syn-ack', from: 'resolver', to: 'laptop', label: 'TCP：SYN, ACK', headers: [tcp('53', '53002', 'SYN, ACK', 3000, 7001, '64240'), ipv4(R, C)], payload: '沒有資料（0 位元組）',
      note: 'DNS 伺服器回 SYN, ACK：它的 ISN 是 3000，Ack = 7000 + 1 = 7001。' },
    { id: 'tcp-ack', from: 'laptop', to: 'resolver', label: 'TCP：ACK', headers: [tcp('53002', '53', 'ACK', 7001, 3001, '65535'), ipv4(C, R)], payload: '沒有資料（0 位元組）',
      note: '筆電回 ACK：Seq 7001、Ack 3001。到這裡已經花了一個 RTT，查詢還沒送出。' },
    { id: 'tcp-query', from: 'laptop', to: 'resolver', label: 'TCP：DNS 查詢（35 位元組）', headers: [dns('0x5c3d', undefined, 33), tcp('53002', '53', 'PSH, ACK', 7001, 3001, '65535'), ipv4(C, R)],
      payload: '長度前綴 2 位元組（值 33）＋ DNS 查詢 33 位元組，共 35 位元組（序號 7001–7035）',
      note: 'TCP 是位元組串流，不保留訊息邊界，所以 DNS 在每則訊息前加上 2 位元組的長度，讓對方知道一則訊息到哪裡結束。資料共 2 + 33 = 35 位元組，涵蓋 7001 到 7035。' },
    { id: 'tcp-response', from: 'resolver', to: 'laptop', label: 'TCP：DNS 回應（51 位元組）', headers: [dns('0x5c3d', ANSWER, 49), tcp('53', '53002', 'PSH, ACK', 3001, 7036, '64240'), ipv4(R, C)],
      payload: '長度前綴 2 位元組（值 49）＋ DNS 回應 49 位元組，共 51 位元組（序號 3001–3051）',
      note: '回應也加上長度前綴：2 + 49 = 51 位元組，Seq 3001，涵蓋 3001 到 3051；Ack = 7001 + 35 = 7036。答案到第二個 RTT 才到。' },
    { id: 'tcp-ack-2', from: 'laptop', to: 'resolver', label: 'TCP：ACK', headers: [tcp('53002', '53', 'ACK', 7036, 3052, '65535'), ipv4(C, R)], payload: '沒有資料（0 位元組）',
      note: '筆電確認回應：Seq 7036、Ack = 3051 + 1 = 3052。之後還要再交換幾個區段關閉連線（或把連線留給下一次查詢）。同樣的答案，UDP 用了 2 個封包，TCP 到這裡已經 6 個區段。' },
  ],
};

// ---- Scene 3: a closed port and a filtered port -------------------------------------------------------------------
/** Section 5: RST/ACK from a host with no listener, then a SYN a firewall drops without a word. */
const refused: NetworkScene = {
  id: 'cn09-refused', title: '連到沒開的連接埠：RST 與沉默', model: 'tcp-ip',
  description: '伺服器 203.0.113.80 只有 443 有程式在監聽。前面的防火牆允許 8080 通過，但默默丟棄送往 9090 的封包。用戶端先連 8080（ISN 12000），再連 9090（ISN 15000），比較兩種失敗看起來有什麼不同。',
  nodes: [
    { id: 'client', label: '用戶端', kind: 'host', addresses: ['IP 192.0.2.10'] },
    { id: 'firewall', label: '防火牆', kind: 'router', addresses: ['允許 TCP 443、8080', '丟棄 TCP 9090（不回應）'] },
    { id: 'server', label: '伺服器', kind: 'server', addresses: ['IP 203.0.113.80', '只在 TCP 443 監聽'] },
  ],
  messages: [
    { id: 'syn-8080', from: 'client', to: 'server', label: 'SYN → 8080', headers: [tcp('52345', '8080', 'SYN', 12000, undefined, '65535'), ipv4(C, S)], payload: '沒有資料（0 位元組）',
      note: '用戶端要連到伺服器的 8080 連接埠，ISN 12000。防火牆允許 8080 通過，所以 SYN 送到了伺服器，但伺服器上沒有任何程式在 8080 監聽。' },
    { id: 'rst', from: 'server', to: 'client', label: 'RST, ACK', headers: [tcp('8080', '52345', 'RST, ACK', 0, 12001, '0'), ipv4(S, C)], payload: '沒有資料（0 位元組）',
      note: '伺服器的作業系統找不到在 8080 監聽的 socket，直接回 RST。收到的 SYN 沒有 ACK 旗標，所以 RST 區段的 Seq 用 0，並設 ACK：Ack = 12000 + 1 = 12001，指明它回應的是哪一個 SYN。用戶端立刻放棄，程式得到「連線被拒絕」（connection refused），整個過程只花一個 RTT。' },
    { id: 'syn-9090', from: 'client', to: 'firewall', label: 'SYN → 9090', lost: true, headers: [tcp('52346', '9090', 'SYN', 15000, undefined, '65535'), ipv4(C, S)], payload: '沒有資料（0 位元組）',
      note: '用戶端改連 9090，這是一條新的連線：來源連接埠 52346、ISN 15000。防火牆的規則是丟棄送往 9090 的封包，而且不回任何訊息；SYN 就此消失，用戶端只知道沒有回應。' },
    { id: 'syn-9090-again', from: 'client', to: 'firewall', label: 'SYN → 9090（重送）', lost: true, headers: [tcp('52346', '9090', 'SYN', 15000, undefined, '65535'), ipv4(C, S)], payload: '沒有資料（0 位元組）',
      note: '等了 1 秒（Linux 的初始逾時）沒有回應，用戶端重送同一個 SYN：Seq 仍是 15000，因為它從未被確認。這次也被丟棄。之後每次等待加倍（2、4、8……秒）；Linux 預設重送 6 次，總共約 127 秒後，程式才得到「連線逾時」（connection timed out）。' },
  ],
};

// ---- Scene 4: a server's connection table -------------------------------------------------------------------------
const LOCAL = '203.0.113.80:443', A1 = '192.0.2.10:51000', A2 = '192.0.2.10:51001', B = '198.51.100.23:51000';
const LISTENING = [['*:*', 'TCP', '0.0.0.0:443', 'LISTEN'], ['*:*', 'UDP', '0.0.0.0:443', '無（UDP 不建立連線）']];
const table = (rows: string[][], changed?: number): NodeTable[] => [{ node: 'server', name: '伺服器的連線表', head: ['對方位址', '協定', '本機位址', '狀態'],
  rows: [...LISTENING, ...rows], ...changed === undefined ? {} : { changed: [changed] } }];
const row = (remote: string, state: string) => [remote, 'TCP', LOCAL, state];
const toServer = (port: string, from: string, flags: string, seq: number, ack: number) => [tcp(port, '443', flags, seq, ack, '65535'), ipv4(from, '203.0.113.80')];

/** Section 5: three connections to one listening port, then the server closes one first and keeps its TIME_WAIT. */
const connectionTable: NetworkScene = {
  id: 'cn09-connection-table', title: '伺服器的連線表：5-tuple 與狀態', model: 'tcp-ip',
  description: 'HTTPS 伺服器 203.0.113.80 在 TCP 443 監聽，也在 UDP 443 提供 HTTP/3。筆電 A 開了兩條連線，手機 B 開了一條；之後伺服器先關閉 A 的第一條連線。每一步看伺服器的連線表（就像在伺服器上執行 ss -tan）：哪一列新增、哪一列的狀態改變。各連線交握的前兩個區段省略，ISN 寫在說明裡。',
  nodes: [
    { id: 'a', label: '筆電 A', kind: 'host', addresses: ['IP 192.0.2.10'] },
    { id: 'b', label: '手機 B', kind: 'host', addresses: ['IP 198.51.100.23'] },
    { id: 'server', label: 'HTTPS 伺服器', kind: 'server', addresses: ['IP 203.0.113.80', 'TCP 443（監聽）', 'UDP 443（HTTP/3）'] },
  ],
  messages: [
    { id: 'a1-ack', from: 'a', to: 'server', label: 'A 第 1 條連線：ACK', headers: toServer('51000', '192.0.2.10', 'ACK', 30001, 80001), payload: '沒有資料（0 位元組）',
      note: '筆電 A 的瀏覽器從臨時連接埠 51000 連到 443（A 的 ISN 30000、伺服器的 ISN 80000），這是交握的第三個區段。伺服器收到後，連線表多一列 ESTABLISHED。最上面兩列是監聽中的 socket：TCP 443 在 LISTEN；UDP 443 沒有連線，所以沒有狀態。',
      tables: table([row(A1, 'ESTABLISHED')], 2) },
    { id: 'a2-ack', from: 'a', to: 'server', label: 'A 第 2 條連線：ACK', headers: toServer('51001', '192.0.2.10', 'ACK', 41001, 90001), payload: '沒有資料（0 位元組）',
      note: 'A 的瀏覽器同時開了第二條連線，作業系統挑了另一個臨時連接埠 51001（A 的 ISN 41000、伺服器的 ISN 90000）。兩列只差在對方的連接埠，5-tuple 就不同，伺服器依此把區段交給不同的 socket。',
      tables: table([row(A1, 'ESTABLISHED'), row(A2, 'ESTABLISHED')], 3) },
    { id: 'b-ack', from: 'b', to: 'server', label: 'B 的連線：ACK', headers: toServer('51000', '198.51.100.23', 'ACK', 52001, 70001), payload: '沒有資料（0 位元組）',
      note: '手機 B 也連進來，碰巧也用了來源連接埠 51000（B 的 ISN 52000、伺服器的 ISN 70000）。和 A 的第一條連線相比，來源 IP 不同，5-tuple 依然不同，不會混在一起。',
      tables: table([row(A1, 'ESTABLISHED'), row(A2, 'ESTABLISHED'), row(B, 'ESTABLISHED')], 4) },
    { id: 's-fin', from: 'server', to: 'a', label: '伺服器關閉 A 的第 1 條連線：FIN, ACK', headers: [tcp('443', '51000', 'FIN, ACK', 82001, 30401, '64240'), ipv4('203.0.113.80', '192.0.2.10')], payload: '沒有資料（0 位元組）',
      note: '這條連線已經傳過資料：A 送了 400 位元組（序號 30001–30400），伺服器送了 2000 位元組（80001–82000）。之後連線閒置太久，伺服器先關閉：送出 FIN，Seq 82001、Ack 30401，這一列變成 FIN_WAIT_1。',
      tables: table([row(A1, 'FIN_WAIT_1'), row(A2, 'ESTABLISHED'), row(B, 'ESTABLISHED')], 2) },
    { id: 'a1-fin', from: 'a', to: 'server', label: 'A 確認並關閉：FIN, ACK', headers: toServer('51000', '192.0.2.10', 'FIN, ACK', 30401, 82002), payload: '沒有資料（0 位元組）',
      note: 'A 收到 FIN，瀏覽器也沒有要再送的資料，於是把確認和自己的 FIN 放在同一個區段：Ack = 82001 + 1 = 82002，Seq 30401。伺服器的 FIN 被確認、又收到對方的 FIN，直接從 FIN_WAIT_1 進入 TIME_WAIT，並回最後一個 ACK。這是三個區段的關閉。',
      tables: table([row(A1, 'TIME_WAIT'), row(A2, 'ESTABLISHED'), row(B, 'ESTABLISHED')], 2) },
    { id: 's-last-ack', from: 'server', to: 'a', label: '最後的 ACK', headers: [tcp('443', '51000', 'ACK', 82002, 30402, '64240'), ipv4('203.0.113.80', '192.0.2.10')], payload: '沒有資料（0 位元組）',
      note: '伺服器確認 A 的 FIN：Ack = 30401 + 1 = 30402，Seq 82002。A 收到後關閉連線；伺服器因為先關，要在 TIME_WAIT 等 2MSL（Linux 為 60 秒），這一列才會從表中消失。另外兩條連線不受影響。',
      tables: table([row(A1, 'TIME_WAIT'), row(A2, 'ESTABLISHED'), row(B, 'ESTABLISHED')]) },
  ],
};

/** CN09 TCP and UDP (network-sequence): scenes and exercises checked by the network capability. */
export const CN09: LessonContent = {
  lessonId: 'CN09',
  motivation: '打開一個網頁時，瀏覽器、音樂串流、通訊軟體和系統更新可能同時在用網路。封包到了你的電腦，作業系統怎麼知道該交給哪一個程式？資料在路上可能遺失、重複或亂序，網頁一個位元組都不能少，視訊通話卻寧可掉幾格也不要卡住。傳輸層的 TCP 與 UDP 正是對這兩種需求的不同回答。這一課逐步看 TCP 區段的序號與 ACK 怎麼變化，學會從封包讀出一條連線從建立到關閉的過程，也能說清楚一個應用為什麼選 TCP 或 UDP。',
  sections: [
    {
      id: 'ports-and-sockets', title: '連接埠與 socket：五個值決定一條連線',
      blocks: [
        { type: 'p', text: 'IP 位址（CN05）把封包送到一台主機，但一台主機上同時跑著很多程式。傳輸層用 16 位元的連接埠號碼（0–65535）再往下區分：伺服器程式在固定的連接埠等待，例如網頁伺服器的 443；用戶端程式發起連線時，作業系統臨時挑一個沒在用的連接埠當來源。IP 位址加上連接埠叫做 socket 位址，寫成 203.0.113.80:443。' },
        { type: 'p', text: '一條 TCP 連線由五個值決定，稱為 5-tuple：協定、來源 IP、來源連接埠、目的 IP、目的連接埠。作業系統收到區段時，就用這五個值找出它屬於哪一條連線、該交給哪一個 socket。所以同一台伺服器的 443 連接埠可以同時服務上萬條連線：五個值只要有一個不同，就是不同的連線。同一個瀏覽器開兩個分頁連到同一個網站，兩條連線的差別只在來源連接埠。' },
        { type: 'table', head: ['範圍', '名稱', '用途', '例子'], rows: [
          ['0–1023', '知名連接埠（well-known）', '標準服務；在 Linux 等系統上，程式通常要有特權才能在這些連接埠監聽', '22 SSH、53 DNS、80 HTTP、443 HTTPS'],
          ['1024–49151', '註冊連接埠（registered）', '向 IANA 登記的應用服務', '3306 MySQL、5432 PostgreSQL、8080 常見的替代 HTTP'],
          ['49152–65535', '動態或臨時連接埠（ephemeral）', '用戶端連線時由作業系統臨時挑選，連線結束後釋放', 'IANA 建議這個範圍；Linux 預設用 32768–60999'],
        ] },
        { type: 'p', text: '同一個號碼在 TCP 與 UDP 是兩個獨立的連接埠：DNS 伺服器同時在 UDP 53 與 TCP 53 等待，網頁伺服器可以在 TCP 443 提供 HTTPS，也在 UDP 443 提供 HTTP/3。程式透過作業系統的 socket 介面使用它們（CN11 會實際寫 socket 程式）；家用路由器的 NAT 改寫的也正是來源 IP 與來源連接埠（CN06）。' },
        { type: 'callout', tone: 'tip', title: '看看自己電腦上的連線', text: '在 Linux 執行 ss -tan，在 Windows 或 macOS 執行 netstat -an，可以列出本機每一條 TCP 連線的本機位址、對方位址與狀態。第 5 節的連線表情境，就是伺服器上這張表隨區段變化的樣子。' },
      ],
    },
    {
      id: 'udp', title: 'UDP：只多 8 位元組的標頭',
      blocks: [
        { type: 'p', text: 'UDP（User Datagram Protocol）幾乎只做一件事：在 IP 之上加上連接埠，讓資料能交給正確的程式。它不建立連線、不編號、不確認、不重送，也不管順序。應用程式交給它一則訊息，它就加上 8 位元組的標頭，包成一個資料包（datagram）交給 IP 送出；送到了沒有，UDP 自己並不知道。' },
        { type: 'table', head: ['欄位', '長度', '內容'], rows: [
          ['來源連接埠', '16 位元', '傳送端程式的連接埠；不需要回覆時可以填 0'],
          ['目的連接埠', '16 位元', '接收端程式的連接埠，例如 DNS 的 53'],
          ['長度', '16 位元', 'UDP 標頭加資料的位元組數，最小是 8（只有標頭）'],
          ['檢查碼', '16 位元', '涵蓋偽標頭（來源與目的 IP 等）、UDP 標頭與資料，用來發現傳輸錯誤；IPv4 上可以不使用（填 0），IPv6 上必須使用'],
        ] },
        { type: 'p', text: 'UDP 保留訊息邊界：傳送端送出一個 33 位元組的資料包，接收端讀到的就是完整的那 33 位元組，不會和下一個黏在一起，也不會被切成兩半。資料包可能遺失、重複或亂序抵達；檢查碼不對的，接收端直接丟掉。需要可靠的應用要在自己這一層處理，例如 DNS 用戶端等不到回應就重問一次。' },
        { type: 'callout', tone: 'note', title: 'UDP 送到沒開的連接埠', text: 'UDP 沒有連線，也就沒有 RST。資料包送到一個沒有程式在等的 UDP 連接埠時，接收端通常回一個 ICMP「目的地無法到達：連接埠無法到達」（類型 3、代碼 3）；若被防火牆擋下，則什麼都不會回。' },
      ],
    },
    {
      id: 'tcp-header', title: 'TCP 標頭：序號、確認號與旗標',
      blocks: [
        { type: 'p', text: 'TCP（Transmission Control Protocol）提供可靠、依序的位元組串流：兩端先建立連線，傳送端把資料當成一串連續的位元組，每個位元組都有序號；接收端用 ACK 回報收到哪裡，沒收到的會重送，亂序到達的會排回原來的順序再交給程式。代價是比 UDP 多了交握、確認與 20 到 60 位元組的標頭。' },
        { type: 'table', head: ['欄位', '長度', '用途'], rows: [
          ['來源連接埠、目的連接埠', '各 16 位元', '和 UDP 一樣，指出兩端的程式'],
          ['序號（Seq）', '32 位元', '這個區段第一個資料位元組的序號；在 SYN 區段裡則是起始序號 ISN'],
          ['確認號（Ack）', '32 位元', 'ACK 旗標設定時才有效：期待從對方收到的下一個位元組序號，表示在它之前的都收到了'],
          ['標頭長度', '4 位元', '以 4 位元組為單位；沒有選項時是 5（20 位元組），最大 15（60 位元組）'],
          ['旗標', '每個 1 位元', 'SYN 建立連線、ACK 表示確認號有效、FIN 表示這一方的資料送完了、RST 立即中止連線、PSH 請接收端儘快交給程式'],
          ['視窗', '16 位元', '接收端還能收多少位元組，用於流量控制（CN10）'],
          ['檢查碼', '16 位元', '和 UDP 一樣涵蓋偽標頭、標頭與資料，但 TCP 一定要使用'],
          ['緊急指標、選項', '16 位元、0–40 位元組', '選項例如 MSS（最大區段大小）、視窗縮放、時間戳記與 SACK，多半在 SYN 裡協商'],
        ] },
        { type: 'p', text: '讀序號要記住兩條規則。第一，序號數的是位元組，不是區段：Seq 1001、帶 200 位元組資料的區段涵蓋 1001 到 1200，下一個區段從 1201 開始。第二，SYN 與 FIN 雖然不帶資料，各自也占一個序號，這樣它們才能被確認、遺失時才能重送；只設 ACK、不帶資料的區段不占序號。' },
        { type: 'p', text: '序號不從 0 開始。每條連線的起始序號（ISN）由兩端各自選擇，現代作業系統依時間與連線的位址算出難以猜測的值：一方面避免舊連線遺留在網路上的區段被誤認成新連線的資料，一方面讓攻擊者難以猜中序號、偽造區段插入別人的連線。' },
        { type: 'callout', tone: 'tip', title: 'Wireshark 的相對序號', text: 'Wireshark 預設把序號換算成相對值，讓每條連線的 SYN 從 0 開始，第一個資料位元組就是 1，比較好讀；封包裡的實際值是 ISN 加上相對序號。本課情境寫的都是實際值。' },
      ],
    },
    {
      id: 'handshake-and-data', title: '三向交握與資料傳輸：序號與 ACK',
      blocks: [
        { type: 'p', text: '建立連線要三個區段，所以叫三向交握：用戶端送 SYN，附上自己的 ISN；伺服器回 SYN, ACK，附上自己的 ISN，並以 Ack = 用戶端 ISN + 1 確認對方的 SYN；用戶端回 ACK，Ack = 伺服器 ISN + 1。為什麼要三個？兩個方向的資料流各有自己的起始序號，雙方都要告訴對方自己的 ISN，也都要看到自己的 SYN 被確認；第三個區段也讓伺服器能分辨，收到的 SYN 是現在的連線請求，還是網路上延遲很久的舊 SYN。' },
        { type: 'list', ordered: true, items: [
          '這個方向下一個區段的 Seq = 上一個區段的 Seq + 它的資料長度；SYN、FIN 各再加 1。',
          'Ack = 對方下一個應該送來的序號 = 已經連續收到的最後一個位元組 + 1。',
          '純 ACK（不帶資料、沒有 SYN 或 FIN）不占序號，下一個區段的 Seq 不變。',
          'ACK 可以搭在反方向的資料區段上一起送（piggyback），不必另外送一個。',
        ] },
        { type: 'p', text: '下面的情境把一條連線從頭走到尾：用戶端 ISN 4000、伺服器 ISN 9000；用戶端把 320 位元組的 HTTP 請求分成 200 與 120 位元組兩個區段，伺服器回 500 位元組，最後由用戶端先關閉。每一步先用上面四條規則自己算出 Seq 與 Ack，再看標頭裡的值；連線關閉的部分，下一節會再詳細說明。' },
        { type: 'example', id: 'cn09-tcp-connection' },
        { type: 'callout', tone: 'warning', title: '常見誤解：Ack 等於收到的最後一個序號', text: 'Ack 不是「我收到了第幾號」，而是「我下一個要第幾號」。用戶端送出 Seq 4201、120 位元組的區段，涵蓋 4201 到 4320，伺服器回的 Ack 是 4321，不是 4320，也不是 4201。同樣地，SYN 占一個序號，所以第一個資料位元組是 ISN + 1；忘了這一點，之後每一個 Seq 和 Ack 都會差 1。' },
        { type: 'p', text: 'TCP 的 ACK 是累積的：Ack 4321 一次確認了 4321 之前的所有位元組，就算前一個區段的 ACK 遺失也沒有關係。中間有區段遺失時，接收端只能一再回報同一個 Ack。傳送端怎麼發現遺失、多久重送、一次可以送多少而不必等確認，是下一課 CN10 的可靠傳輸、流量控制與壅塞控制。' },
      ],
    },
    {
      id: 'closing', title: '連線關閉：四次揮手、TIME_WAIT 與 RST',
      blocks: [
        { type: 'p', text: 'TCP 連線是兩個方向的位元組串流，連線關閉也是一個方向一個方向地關。先關的一方送 FIN，表示「我的資料送完了」，對方回 ACK；對方可能還有資料要送，送完再送自己的 FIN，由先關的一方回 ACK。一共四個區段，所以叫四次揮手。如果對方收到 FIN 時也剛好要關，可以把 ACK 和自己的 FIN 合在同一個區段，只要三個區段。只關了一個方向、另一個方向還在傳的狀態叫半關閉。' },
        { type: 'table', head: ['狀態', '誰會進入', '意思'], rows: [
          ['LISTEN', '伺服器', '在連接埠上等待連線請求'],
          ['SYN_SENT、SYN_RECEIVED', '用戶端、伺服器', '三向交握進行中'],
          ['ESTABLISHED', '雙方', '連線已建立，可以雙向傳資料'],
          ['FIN_WAIT_1、FIN_WAIT_2', '先關的一方', '送出 FIN 後等對方確認；確認後再等對方的 FIN'],
          ['CLOSE_WAIT、LAST_ACK', '後關的一方', '收到 FIN 後等自己的程式關閉；送出自己的 FIN 後等最後的 ACK'],
          ['TIME_WAIT', '先關的一方', '送出最後的 ACK 後再等 2MSL，才真正釋放這組 5-tuple'],
        ] },
        { type: 'p', text: 'TIME_WAIT 讓先關的一方多等兩倍的最大區段壽命（2MSL；Linux 固定為 60 秒）。理由有兩個：最後的 ACK 若遺失，對方會重送 FIN，自己還在就能再回一次 ACK；另外，等舊連線還在網路上漂流的區段都消失，同一組 5-tuple 的新連線才不會誤收它們。所以誰先關，TIME_WAIT 就留在誰那裡：伺服器主動關閉大量短連線時，連線表裡會累積許多 TIME_WAIT。' },
        { type: 'example', id: 'cn09-connection-table' },
        { type: 'p', text: '還有一種結束方式是 RST：立即中止，不等資料送完，也不需要對方確認。程式異常結束、或收到不屬於任何連線的區段時，作業系統會送 RST。最常見的是連到一個沒有程式在監聽的 TCP 連接埠：對方回 RST, ACK，程式立刻得到「連線被拒絕」。若封包被防火牆默默丟掉，則什麼都收不到，只能等 SYN 一再逾時。這兩種結果的差別，正是除錯時判斷「服務沒開」還是「被擋住了」的線索。' },
        { type: 'example', id: 'cn09-refused' },
      ],
    },
    {
      id: 'tcp-or-udp', title: '該選 TCP 還是 UDP',
      blocks: [
        { type: 'table', head: ['比較項目', 'TCP', 'UDP'], rows: [
          ['連線', '先三向交握建立連線，用完要關閉', '不建立連線，第一個資料包就帶著資料'],
          ['可靠性', '確認與重送，資料送到或回報錯誤', '不確認、不重送，遺失了由應用自己處理'],
          ['順序', '依序號排好再交給程式', '依抵達順序交給程式，可能亂序'],
          ['資料界線', '位元組串流，不保留訊息邊界', '保留每個資料包的邊界'],
          ['標頭', '20–60 位元組', '固定 8 位元組'],
          ['流量與壅塞控制', '有（CN10）', '沒有，送多快由應用決定'],
          ['廣播與群播', '不支援，只能一對一', '可以'],
          ['常見應用', '網頁（HTTP/1.1、HTTP/2）、檔案下載、電子郵件、SSH、資料庫連線', 'DNS 查詢、視訊與語音通話、線上遊戲、NTP 對時、DHCP、HTTP/3（QUIC）'],
        ] },
        { type: 'p', text: '下面的情境用同一個 DNS 查詢比較兩者：UDP 一來一回兩個資料包，第一個 RTT 就拿到答案；同一個查詢改走 TCP，要先交握，還要在訊息前加上 2 位元組的長度（因為 TCP 不保留訊息邊界），答案最早在第二個 RTT 才到，而且還沒算關閉連線的區段。所以 DNS 平常用 UDP，只有回應太大被截斷（TC 旗標）或做區域傳送時才改走 TCP。' },
        { type: 'example', id: 'cn09-dns-udp-vs-tcp' },
        { type: 'p', text: '選擇的關鍵是：遺失的資料晚一點到，還有沒有用？檔案、網頁、程式碼少一個位元組就壞掉，晚一點到也要，所以用 TCP。視訊通話與線上遊戲的每個封包都很快過時：100 毫秒前的語音或角色位置，等重送回來已經沒用，TCP 卻會讓後面的新資料排隊等它（隊頭阻塞），所以這類應用用 UDP，自己決定怎麼補救，例如前向錯誤更正、用前後的位置內插。隨選影片有幾秒的緩衝，大多仍以 HTTP 走 TCP（或 QUIC）；直播與通話才更在乎延遲。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：UDP 不可靠，所以傳得比較慢', text: 'UDP 的「不可靠」指的是不保證送達與順序，不是傳得比較慢：UDP 與 TCP 的封包走同樣的路由器與線路。UDP 省下的是交握的往返、等待重送與排隊的時間，所以延遲通常比較低。反過來，以為 UDP 一定比較快也不對：大量資料要可靠送達時，在 UDP 上自己做確認與重送，往往不會比 TCP 好，還可能因為沒有壅塞控制而塞爆網路。' },
        { type: 'callout', tone: 'note', title: 'QUIC：在 UDP 上重做可靠傳輸', text: 'HTTP/3 使用的 QUIC 跑在 UDP 上，卻自己提供連線、加密、確認、重送與壅塞控制，還能在一條連線裡跑多個互不阻塞的串流。它選 UDP 不是因為不需要可靠，而是因為作業系統核心裡的 TCP 很難修改，網路中間的設備也大多只認得 TCP 與 UDP。CN15 會再介紹。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  network: {
    scenes: [connection, dnsUdpVsTcp, refused, connectionTable],
    exercises: [
      { id: 'cn09-response-ack', task: 'field', scene: 'cn09-tcp-connection', message: 'response', layer: 'transport', field: 'Ack', title: '回應裡的確認號',
        statement: '在「一條 TCP 連線的一生」情境裡，用戶端的 ISN 是 4000，交握後送出 200 與 120 位元組兩個請求區段。伺服器送出回應時，TCP 標頭的 Ack 是多少？（只填數字）',
        hints: ['SYN 用掉了序號 4000，第一個資料位元組是 4001。', '兩個區段一共涵蓋哪些序號？Ack 是下一個期待的位元組。'],
        explanation: '第一個資料位元組是 4001（SYN 占掉 4000），兩個區段涵蓋 4001–4200 與 4201–4320，伺服器下一個期待 4321，所以 Ack = 4001 + 200 + 120 = 4321。這個 Ack 一次確認了兩個區段，並且搭在回應資料上一起送出。',
        mistakes: [
          { answer: { value: '4320' }, why: '把 Ack 當成「收到的最後一個位元組」，或忘了 SYN 占一個序號（4000 + 320）：Ack 是下一個期待的序號，4320 已經收到，要的是 4321。' },
          { answer: { value: '4201' }, why: '把第二個區段的 Seq 當成確認號：4201 只是那個區段的起點，它的 120 位元組也收到了，要再往後算到 4321。' },
        ] },
      { id: 'cn09-last-ack', task: 'field', scene: 'cn09-tcp-connection', message: 'last-ack', layer: 'transport', field: 'Ack', title: '最後一個 ACK',
        statement: '同一個情境裡，伺服器從 9001 開始送了 500 位元組的回應，之後送出 FIN。用戶端回覆的最後一個 ACK，Ack 欄位是多少？（只填數字）',
        hints: ['回應涵蓋 9001 到 9500，伺服器的 FIN 用的是哪一個序號？', 'FIN 和 SYN 一樣占一個序號。'],
        explanation: '伺服器的回應涵蓋 9001–9500，接著 FIN 的 Seq 是 9501，FIN 占掉這個序號，所以用戶端期待的下一個是 9502，Ack = 9501 + 1 = 9502。用戶端自己這個區段的 Seq 是 4322，因為它的 FIN 已經用掉了 4321。',
        mistakes: [
          { answer: { value: '9501' }, why: '忘了 FIN 占一個序號：9501 是伺服器 FIN 本身的序號，確認它要回 9502。' },
          { answer: { value: '9500' }, why: '把 Ack 當成收到的最後一個資料位元組，又忘了 FIN：回應的最後一個位元組是 9500，再加上 FIN，下一個期待的是 9502。' },
        ] },
      { id: 'cn09-rst-flags', task: 'field', scene: 'cn09-refused', message: 'rst', layer: 'transport', field: '旗標', title: '連到沒開的連接埠',
        statement: '在「連到沒開的連接埠」情境裡，用戶端對 8080 送出 SYN，伺服器上沒有程式在 8080 監聽。伺服器回覆的 TCP 區段設了哪些旗標？（例如寫成「SYN, ACK」）',
        hints: ['沒有程式在監聽，伺服器會接受連線嗎？', '收到的 SYN 沒有 ACK 旗標時，回覆的區段要用 Ack 指出它回應的是哪一個 SYN。'],
        explanation: '沒有 socket 在監聽，作業系統以 RST 拒絕連線。因為收到的 SYN 沒有設 ACK，RST 區段的 Seq 用 0，並設 ACK、以 Ack = 12000 + 1 = 12001 指明回應的是哪一個 SYN，所以旗標是 RST, ACK。用戶端程式立刻得到「連線被拒絕」。',
        mistakes: [
          { answer: { value: 'SYN, ACK' }, why: '以為主機開著就會完成交握：SYN, ACK 只在有程式監聽時才會回；沒有監聽就回 RST。' },
          { answer: { value: 'FIN, ACK' }, why: '把拒絕連線當成關閉連線：FIN 用在已經建立的連線上，這條連線從來沒有建立，用的是 RST。' },
          { answer: { value: 'RST' }, why: '只寫了 RST：回應一個沒有 ACK 的 SYN 時，RST 區段也設 ACK，用確認號指出它拒絕的是哪一個 SYN。' },
        ] },
      { id: 'cn09-udp-length', task: 'field', scene: 'cn09-dns-udp-vs-tcp', message: 'udp-response', layer: 'transport', field: '長度', title: 'UDP 長度欄位',
        statement: '在「同一個 DNS 查詢」情境裡，DNS 回應有 49 位元組。裝著它的 UDP 資料包，標頭的長度欄位是多少？（只填數字）',
        hints: ['UDP 的長度欄位算的是標頭加資料。', 'UDP 標頭固定幾個位元組？'],
        explanation: 'UDP 的長度欄位包含 8 位元組的標頭與資料：8 + 49 = 57。它不含 IP 標頭；UDP 標頭只有來源連接埠、目的連接埠、長度與檢查碼四個 16 位元欄位，所以固定 8 位元組。',
        mistakes: [
          { answer: { value: '49' }, why: '只算了 DNS 資料：UDP 的長度欄位把 8 位元組的 UDP 標頭也算進去。' },
          { answer: { value: '69' }, why: '用了 TCP 的 20 位元組標頭：UDP 標頭固定只有 8 位元組。' },
        ] },
      { id: 'cn09-time-wait', task: 'table', scene: 'cn09-connection-table', message: 'a1-fin', node: 'server', table: '伺服器的連線表', row: '192.0.2.10:51000', column: '狀態', title: '誰留在 TIME_WAIT',
        statement: '在「伺服器的連線表」情境裡，伺服器先對 A 的第一條連線（192.0.2.10:51000）送出 FIN；A 用一個同時設 FIN 與 ACK 的區段回覆。伺服器處理完這個區段後，連線表裡這一列的狀態是什麼？（填狀態名稱，例如 ESTABLISHED）',
        hints: ['伺服器是先送 FIN 的一方。', 'A 的區段同時確認了伺服器的 FIN，又帶著 A 自己的 FIN。'],
        explanation: '伺服器先關，在 FIN_WAIT_1 等待；A 的區段同時確認了伺服器的 FIN（Ack 82002）又帶著 A 的 FIN，伺服器回最後的 ACK 後直接進入 TIME_WAIT，等 2MSL 才釋放這組 5-tuple。先關的一方才有 TIME_WAIT，所以這一列留在伺服器上。',
        mistakes: [
          { answer: { cell: 'CLOSED' }, why: '以為雙方都送過 FIN 就立刻關閉：先關的一方送出最後的 ACK 後還要在 TIME_WAIT 等 2MSL。' },
          { answer: { cell: 'FIN_WAIT_2' }, why: '沒注意到 A 的區段也帶著 FIN：FIN_WAIT_2 是只收到確認、還在等對方 FIN 的狀態；這裡兩件事一起到，直接進入 TIME_WAIT。' },
          { answer: { cell: 'LAST_ACK' }, why: '把兩邊的角色對調：LAST_ACK 是後關的一方（這裡是 A）送出 FIN 後的狀態，先關的伺服器進入的是 TIME_WAIT。' },
        ] },
    ],
  },
  quiz: [
    {
      id: 'q-five-tuple', prompt: '你在同一台筆電上開了兩個瀏覽器分頁，都連到 203.0.113.80 的 443 連接埠。伺服器怎麼分辨這兩條 TCP 連線？',
      options: ['看 IP 標頭的 TTL，兩個分頁送出的值不同', '兩條連線的來源連接埠不同，所以 5-tuple 不同', '伺服器替每個分頁開一個不同的監聽連接埠', '看 MAC 位址，每個分頁有自己的 MAC 位址'],
      answer: 1, explanation: '一條 TCP 連線由協定、來源 IP、來源連接埠、目的 IP、目的連接埠五個值決定。兩個分頁的協定、兩端 IP 與目的連接埠 443 都一樣，作業系統替每條連線挑了不同的臨時來源連接埠，5-tuple 因此不同。TTL 每經過一個路由器就減 1，不用來分辨連線；伺服器只在 443 監聽，所有連線都連到同一個連接埠；MAC 位址屬於網路介面而不是分頁，經過路由器就被改寫，伺服器通常看不到筆電的 MAC。',
    },
    {
      id: 'q-udp-header', prompt: '關於 UDP 標頭，下列敘述何者正確？',
      options: ['有 20 位元組，包含序號與確認號', '只有來源 IP 與目的 IP 兩個欄位', '有序號但沒有確認號，接收端靠序號排序', '固定 8 位元組：來源連接埠、目的連接埠、長度與檢查碼'],
      answer: 3, explanation: 'UDP 標頭固定 8 位元組，四個欄位各 16 位元：來源連接埠、目的連接埠、長度（標頭加資料）與檢查碼。20 位元組、有序號與確認號的是 TCP 標頭（不含選項）；IP 位址在 IP 標頭裡，UDP 標頭不再記錄；UDP 完全沒有序號，不負責排序，需要時由應用自己編號。',
    },
    {
      id: 'q-handshake', prompt: '用戶端的 ISN 是 2000，伺服器的 ISN 是 6000。三向交握的第三個區段（用戶端送出的 ACK）的 Seq 與 Ack 各是多少？',
      options: ['Seq 2001、Ack 6001', 'Seq 2000、Ack 6000', 'Seq 2001、Ack 6000', 'Seq 6001、Ack 2001'],
      answer: 0, explanation: 'SYN 占一個序號：用戶端的 SYN 用掉 2000，它的下一個序號是 2001；伺服器的 SYN 用掉 6000，用戶端期待的下一個是 6001，所以 Ack 是 6001。Seq 2000、Ack 6000 忘了兩個 SYN 都占一個序號；Seq 2001、Ack 6000 把 Ack 當成「收到的最後一個序號」；Seq 6001、Ack 2001 把兩個方向對調了，那是伺服器下一個區段的值。',
    },
    {
      id: 'q-data-ack', prompt: '連線建立後，用戶端從 Seq 2001 開始連續送出 100 位元組與 50 位元組兩個區段，伺服器都收到了。伺服器回覆的 Ack 應該是多少？',
      options: ['2150', '2101', '2151', '2003'],
      answer: 2, explanation: '兩個區段涵蓋 2001–2100 與 2101–2150，伺服器下一個期待 2151，所以 Ack 是 2151，一次確認兩個區段（ACK 是累積的）。2150 是收到的最後一個位元組，少了 1；2101 是第二個區段的 Seq，只代表收到了第一個區段；2003 把序號當成區段的編號，但 TCP 數的是位元組。',
    },
    {
      id: 'q-udp-speed', prompt: '同學說：「UDP 不可靠，所以傳得比 TCP 慢。」下列哪一個說法最正確？',
      options: [
        '對，路由器會把 UDP 封包排在 TCP 後面處理',
        '不對，兩者走同樣的網路；UDP 省下交握與等待重送的時間，延遲通常更低，代價是遺失的資料不會自動補回',
        '不對，UDP 的頻寬固定是 TCP 的兩倍',
        '對，UDP 每送一個資料包都要等接收端確認',
      ],
      answer: 1, explanation: '「不可靠」是指 UDP 不保證送達與順序，與速度無關：兩者的封包經過同樣的路由器與線路。UDP 不交握、不等確認、不讓新資料排在遺失的資料後面，所以延遲通常較低，遺失則由應用處理。路由器一般不會因為是 UDP 就延後處理；頻寬是線路的性質，不會因協定加倍；確認與重送是 TCP 的機制，UDP 根本沒有確認。',
    },
    {
      id: 'q-time-wait', prompt: '一台網頁伺服器在連線閒置一段時間後主動關閉連線。在伺服器上執行 ss -tan，看到很多 TIME_WAIT。下列解釋何者正確？',
      options: [
        '先送 FIN 的一方送出最後的 ACK 後要再等 2MSL；伺服器主動關閉，TIME_WAIT 就留在伺服器',
        'TIME_WAIT 表示用戶端還有資料沒送完，伺服器在等',
        'TIME_WAIT 是 UDP 資料包送完之後的狀態',
        'TIME_WAIT 表示連線被 RST 中止，要重新開機才會清除',
      ],
      answer: 0, explanation: '主動關閉（先送 FIN）的一方在送出最後的 ACK 後進入 TIME_WAIT 並等 2MSL：最後的 ACK 若遺失，還能回應對方重送的 FIN，舊連線的區段也有時間從網路上消失。伺服器主動關閉，TIME_WAIT 就在伺服器上。對方還有資料要送時，先關的一方是在 FIN_WAIT_2 等待；UDP 沒有連線，也就沒有任何連線狀態；RST 讓連線立即消失、不進入 TIME_WAIT，而 TIME_WAIT 時間一到就自動釋放。',
    },
    {
      id: 'q-refused', prompt: '用戶端對 203.0.113.80 的 8080 連接埠送出 SYN。那台主機開著，但沒有程式在 8080 監聽，中間也沒有防火牆。接下來最可能發生什麼事？',
      options: [
        '伺服器回 SYN, ACK，等程式之後再啟動',
        '什麼都不回，用戶端一再重送 SYN 直到逾時',
        '伺服器回 FIN，雙方進行四次揮手',
        '伺服器的作業系統回 RST, ACK，用戶端程式立刻得到「連線被拒絕」',
      ],
      answer: 3, explanation: '沒有 socket 在該連接埠監聽時，作業系統以 RST 回應 SYN；因為 SYN 沒有 ACK 旗標，RST 區段帶 ACK，Ack = 對方的 Seq + 1，用戶端程式立刻得到 connection refused。沒有監聽就不會完成交握，所以不會回 SYN, ACK；完全沒有回應、一再重送直到逾時，是封包被防火牆默默丟棄的情形；FIN 只用在已經建立的連線，這條連線從來沒有建立。',
    },
    {
      id: 'q-choose', prompt: '下列哪一組「應用與傳輸協定」的搭配最合理？',
      options: [
        '線上遊戲每秒 20 次的角色位置更新用 TCP，因為每一筆都必須依序送到',
        '大型檔案下載用 UDP，因為沒有交握，檔案一定比較快完整下載',
        '視訊通話的語音用 UDP，因為晚到的語音已經沒用，寧可跳過也不要等重送',
        '一般的 DNS 查詢用 TCP，因為查詢必須先建立連線才能送出',
      ],
      answer: 2, explanation: '即時語音的每個封包只在很短的時間內有用，等 TCP 重送回來已經過時，還會讓後面的新語音排隊等待，所以用 UDP，由應用自己掩蓋偶爾的遺失。角色位置很快就被下一筆取代，遊戲通常用 UDP、只採用最新的一筆；檔案少一個位元組就壞掉，需要 TCP 的確認與重送，UDP 本身也不會讓檔案更快完整送達；一般的 DNS 查詢用 UDP，一來一回就有答案，只有回應被截斷或區域傳送時才改走 TCP。',
    },
  ],
};
