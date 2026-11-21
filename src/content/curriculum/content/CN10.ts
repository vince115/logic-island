import type { NetworkScene, NodeTable } from '@/lib/network/model';
import type { LessonContent } from '../schema';

/*
 * CN10 TCP Reliability, Flow Control, and Congestion Control (CN-2, network-sequence). Four fixed scenes on the TCP/IP
 * model: a timeout and retransmission (RTO from SRTT and RTTVAR), a lost segment found by three duplicate ACKs, a
 * receive window that closes to zero and reopens, and the congestion window by RTT round. Sequence numbers are relative
 * (the first data byte is 1, as Wireshark shows them); addresses are RFC 5737 documentation ranges.
 *
 * The congestion-window scene follows one stated Reno model, counted in MSS per RTT round (cwnd and ssthresh are the
 * values at the start of a round):
 *   - no loss, cwnd < ssthresh (slow start): next cwnd = min(2 × cwnd, ssthresh);
 *   - no loss, cwnd ≥ ssthresh (congestion avoidance): next cwnd = cwnd + 1;
 *   - three duplicate ACKs: ssthresh = max(⌊cwnd / 2⌋, 2), next cwnd = ssthresh (fast recovery's temporary inflation is
 *     inside the round and not shown);
 *   - a timeout: ssthresh = max(⌊cwnd / 2⌋, 2), next cwnd = 1.
 * Start: cwnd 1, ssthresh 16; three duplicate ACKs in round 9, a timeout in round 12. A tiny simulator in the lesson's
 * check recomputes every row.
 */

const IP = { sender: '192.0.2.10', receiver: '203.0.113.80' };
const PORT = { sender: '51514', receiver: '443' };

/** A data segment from the sender (relative sequence numbers; the receiver has sent no data, so its Ack is 1). */
const dataSeg = (seq: number, length: number) => ({ layer: 'transport' as const, protocol: 'TCP', fields: [
  { name: '來源埠', value: PORT.sender }, { name: '目的埠', value: PORT.receiver }, { name: '序號', value: String(seq) },
  { name: '確認號', value: '1' }, { name: '旗標', value: 'ACK' }, { name: '資料長度', value: `${length} 位元組` }] });
/** An ACK from the receiver: its acknowledgement number is the next byte it expects, its window the free buffer space. */
const ackSeg = (ack: number, window: number) => ({ layer: 'transport' as const, protocol: 'TCP', fields: [
  { name: '來源埠', value: PORT.receiver }, { name: '目的埠', value: PORT.sender }, { name: '序號', value: '1' },
  { name: '確認號', value: String(ack) }, { name: '旗標', value: 'ACK' }, { name: '視窗', value: String(window) }] });
const ipTo = (toReceiver: boolean) => ({ layer: 'network' as const, protocol: 'IPv4', fields: [
  { name: '來源 IP', value: toReceiver ? IP.sender : IP.receiver }, { name: '目的 IP', value: toReceiver ? IP.receiver : IP.sender }, { name: '協定', value: '6（TCP）' }] });

const SENDER = { id: 'sender', label: '傳送端（上傳中的筆電）', kind: 'host' as const, addresses: [`IP ${IP.sender}`, `埠 ${PORT.sender}`] };
const RECEIVER = { id: 'receiver', label: '接收端（檔案伺服器）', kind: 'server' as const, addresses: [`IP ${IP.receiver}`, `埠 ${PORT.receiver}`] };

// ---- scene 1: the last segment is lost, no duplicate ACK can follow, the RTO fires ---------------------------------
const timer = (rows: string[][], changed: number[]): NodeTable => ({ node: 'sender', name: '重送計時器', head: ['項目', '值'], rows, changed });
const timeout: NetworkScene = {
  id: 'cn10-timeout', title: '最後一個區段遺失：等逾時計時器到期再重送', model: 'tcp-ip',
  description: '傳送端要送出檔案的最後 1500 位元組：一個 1000 位元組的區段與一個 500 位元組的區段。之前量到的平滑 RTT（SRTT）是 80 ms、RTT 變異量（RTTVAR）是 30 ms，所以 RTO = SRTT + 4 × RTTVAR = 200 ms（這裡依 Linux 的做法，下限 200 ms；RFC 6298 建議的下限是 1 秒）。第二個區段在路上遺失，看傳送端怎麼發現、何時重送。時間從送出第一個區段起算。',
  nodes: [SENDER, RECEIVER],
  messages: [
    { id: 't1', from: 'sender', to: 'receiver', label: '第 0 ms：序號 1（1000 位元組）', payload: '檔案的第 1–1000 位元組',
      note: '送出區段時，如果計時器沒有在跑，就為最舊的未確認資料啟動它。計時器保護的是「序號 1 開始的這段資料」：RTO 內沒有收到涵蓋它的確認，就當作遺失。',
      headers: [dataSeg(1, 1000), ipTo(true)],
      tables: [timer([['最舊的未確認位元組', '1'], ['計時器到期時刻', '200 ms'], ['RTO', '200 ms']], [0, 1])] },
    { id: 't2', from: 'sender', to: 'receiver', label: '第 0 ms：序號 1001（500 位元組）', payload: '檔案的第 1001–1500 位元組（最後一段）', lost: true,
      note: '這是檔案的最後一段，它在壅塞的路由器被丟掉了。傳送端不知道：計時器已經在跑，所以不必再啟動一次。',
      headers: [dataSeg(1001, 500), ipTo(true)],
      tables: [timer([['最舊的未確認位元組', '1'], ['計時器到期時刻', '200 ms'], ['RTO', '200 ms']], [])] },
    { id: 't3', from: 'receiver', to: 'sender', label: '第 80 ms：ACK 1001', payload: '（沒有資料）',
      note: '接收端只收到第 1–1000 位元組，所以確認號是 1001：「下一個我要的是 1001」。新的確認讓最舊的未確認位元組前進到 1001，計時器重新從 80 ms 開始算，到期時刻變成 280 ms。後面沒有更多資料，接收端不會再送 ACK，也就不會有重複 ACK。',
      headers: [ackSeg(1001, 64000), ipTo(false)],
      tables: [timer([['最舊的未確認位元組', '1001'], ['計時器到期時刻', '280 ms'], ['RTO', '200 ms']], [0, 1])] },
    { id: 't4', from: 'sender', to: 'receiver', label: '第 280 ms：逾時，重送序號 1001', payload: '檔案的第 1001–1500 位元組（重送）',
      note: '到了 280 ms 還沒有確認，計時器到期：傳送端重送最舊的未確認區段，並把 RTO 加倍為 400 ms（指數退避），免得網路壅塞時一再重送。逾時也是壅塞的強烈訊號：壅塞視窗降回 1 MSS，從慢啟動重新開始（第 5 節）。',
      headers: [dataSeg(1001, 500), ipTo(true)],
      tables: [timer([['最舊的未確認位元組', '1001'], ['計時器到期時刻', '680 ms'], ['RTO', '400 ms（逾時後加倍）']], [1, 2])] },
    { id: 't5', from: 'receiver', to: 'sender', label: '第 360 ms：ACK 1501', payload: '（沒有資料）',
      note: '重送的區段送達，接收端確認到 1501，全部資料都確認了，計時器停止。這次的 RTT 樣本不拿來更新 SRTT：傳送端分不出這個 ACK 是回應原本的區段還是重送的區段（Karn 演算法）。下一個新資料的 RTT 樣本被接受後，RTO 才依 SRTT 與 RTTVAR 重新計算。',
      headers: [ackSeg(1501, 64000), ipTo(false)],
      tables: [timer([['最舊的未確認位元組', '無（全部已確認）'], ['計時器到期時刻', '停止'], ['RTO', '400 ms（等新的 RTT 樣本）']], [0, 1])] },
  ],
};

// ---- scene 2: three duplicate ACKs and a fast retransmit ------------------------------------------------------------
const UNACKED_HEAD = ['序號', '位元組範圍', '狀態'];
const WAIT = '已送出，等待確認';
const unacked = (rows: string[][], changed: number[]): NodeTable => ({ node: 'sender', name: '已送出、未確認的區段', head: UNACKED_HEAD, rows, changed });
const seg = (seq: number, status = WAIT) => [String(seq), `${seq}–${seq + 999}`, status];
const dupCount = (last: string, count: string): NodeTable => ({ node: 'sender', name: 'ACK 計數', head: ['項目', '值'], rows: [['最後收到的確認號', last], ['重複 ACK 次數', count]], changed: [1] });
const buffer = (rows: string[][], changed: number[]): NodeTable => ({ node: 'receiver', name: '接收緩衝區', head: ['位元組範圍', '狀態'], rows, changed });
const DELIVERED = '按順序收到，已交給應用程式';
const HELD = '順序不對，暫存（缺 1001–2000）';
const fastRetransmit: NetworkScene = {
  id: 'cn10-fast-retransmit', title: '三個重複 ACK：不等逾時就快速重傳', model: 'tcp-ip',
  description: '傳送端的視窗是 5 MSS（每個區段 1000 位元組），在收到第一個 ACK 之前就連續送出 5 個區段。第 2 個區段（序號 1001）在路上遺失。接收端的緩衝區是 64000 位元組，應用程式會立刻讀走按順序到達的資料；順序不對的資料先暫存，也占用緩衝區，所以通告的視窗會變小。看傳送端的未確認表與接收端的緩衝區一步一步怎麼變。',
  nodes: [SENDER, RECEIVER],
  messages: [
    { id: 'seg1', from: 'sender', to: 'receiver', label: '序號 1', payload: '第 1–1000 位元組',
      note: '送出第 1 個區段，記進「已送出、未確認」的表：在收到涵蓋它的確認之前，這份資料不能從傳送端的緩衝區刪掉，因為可能要重送。',
      headers: [dataSeg(1, 1000), ipTo(true)], tables: [unacked([seg(1)], [0])] },
    { id: 'seg2', from: 'sender', to: 'receiver', label: '序號 1001', payload: '第 1001–2000 位元組', lost: true,
      note: '第 2 個區段在路上遺失。傳送端並不知道，照樣記成「等待確認」。',
      headers: [dataSeg(1001, 1000), ipTo(true)], tables: [unacked([seg(1), seg(1001)], [1])] },
    { id: 'seg3', from: 'sender', to: 'receiver', label: '序號 2001', payload: '第 2001–3000 位元組',
      note: '視窗還沒用完（5 MSS），傳送端不必等確認，繼續送出第 3 個區段。這就是滑動視窗：在途的資料可以同時有好幾個區段。',
      headers: [dataSeg(2001, 1000), ipTo(true)], tables: [unacked([seg(1), seg(1001), seg(2001)], [2])] },
    { id: 'seg4', from: 'sender', to: 'receiver', label: '序號 3001', payload: '第 3001–4000 位元組',
      note: '第 4 個區段。',
      headers: [dataSeg(3001, 1000), ipTo(true)], tables: [unacked([seg(1), seg(1001), seg(2001), seg(3001)], [3])] },
    { id: 'seg5', from: 'sender', to: 'receiver', label: '序號 4001', payload: '第 4001–5000 位元組',
      note: '第 5 個區段，視窗用完了：在途資料已經是 5000 位元組，要等確認回來、視窗往右滑，才能送新的資料。',
      headers: [dataSeg(4001, 1000), ipTo(true)], tables: [unacked([seg(1), seg(1001), seg(2001), seg(3001), seg(4001)], [4])] },
    { id: 'ack1', from: 'receiver', to: 'sender', label: 'ACK 1001', payload: '（沒有資料）',
      note: '接收端收到第 1–1000 位元組，交給應用程式，回覆確認號 1001。傳送端把序號 1 的區段從表中移除，視窗的左緣往右滑了 1000 位元組，可以再送一個新區段（這裡省略）。',
      headers: [ackSeg(1001, 64000), ipTo(false)],
      tables: [unacked([seg(1001), seg(2001), seg(3001), seg(4001)], []), dupCount('1001', '0'), buffer([['1–1000', DELIVERED]], [0])] },
    { id: 'dup1', from: 'receiver', to: 'sender', label: 'ACK 1001（重複 1）', payload: '（沒有資料）',
      note: '序號 2001 的區段到了，但 1001–2000 還沒到。TCP 的確認是累積確認：確認號只能說「到哪個位元組為止都收齊了」，所以接收端先把 2001–3000 暫存，再送一次 ACK 1001。對傳送端來說，這是第 1 個重複 ACK。暫存的 1000 位元組占用緩衝區，視窗變成 63000。',
      headers: [ackSeg(1001, 63000), ipTo(false)],
      tables: [unacked([seg(1001), seg(2001), seg(3001), seg(4001)], []), dupCount('1001', '1'), buffer([['1–1000', DELIVERED], ['2001–3000', HELD]], [1])] },
    { id: 'dup2', from: 'receiver', to: 'sender', label: 'ACK 1001（重複 2）', payload: '（沒有資料）',
      note: '序號 3001 的區段到了，還是缺 1001–2000，確認號仍是 1001：第 2 個重複 ACK。一兩個重複 ACK 也可能只是封包在路上換了順序，傳送端先不動作。',
      headers: [ackSeg(1001, 62000), ipTo(false)],
      tables: [unacked([seg(1001), seg(2001), seg(3001), seg(4001)], []), dupCount('1001', '2'), buffer([['1–1000', DELIVERED], ['2001–3000', HELD], ['3001–4000', HELD]], [2])] },
    { id: 'dup3', from: 'receiver', to: 'sender', label: 'ACK 1001（重複 3）', payload: '（沒有資料）',
      note: '第 3 個重複 ACK：後面三個區段都到了，唯獨 1001–2000 沒到，幾乎可以確定它遺失了。傳送端不等 RTO 到期，馬上重送它，這叫快速重傳。同時把 ssthresh 設為壅塞視窗的一半，進入快速復原（第 5 節）。',
      headers: [ackSeg(1001, 61000), ipTo(false)],
      tables: [unacked([seg(1001, '3 個重複 ACK：快速重傳'), seg(2001), seg(3001), seg(4001)], [0]), dupCount('1001', '3'),
        buffer([['1–1000', DELIVERED], ['2001–3000', HELD], ['3001–4000', HELD], ['4001–5000', HELD]], [3])] },
    { id: 'retx', from: 'sender', to: 'receiver', label: '重送序號 1001', payload: '第 1001–2000 位元組（重送）',
      note: '只重送遺失的那一個區段，不是從頭重送，也不重送後面已經到達的三個區段。',
      headers: [dataSeg(1001, 1000), ipTo(true)],
      tables: [unacked([seg(1001, '已重送，等待確認'), seg(2001), seg(3001), seg(4001)], [0])] },
    { id: 'ack5001', from: 'receiver', to: 'sender', label: 'ACK 5001', payload: '（沒有資料）',
      note: '缺口補上了，接收端把 1–5000 全部按順序交給應用程式，緩衝區清空，視窗回到 64000。確認號一口氣跳到 5001：一個累積確認就涵蓋了四個區段，傳送端的未確認表清空。',
      headers: [ackSeg(5001, 64000), ipTo(false)],
      tables: [unacked([['無', '—', '全部已確認']], [0]), dupCount('5001', '0'), buffer([['1–5000', DELIVERED]], [0])] },
  ],
};

// ---- scene 3: the receive window closes to zero and reopens ---------------------------------------------------------
const rcvBuffer = (got: string, read: string, used: string, rwnd: string, changed: number[]): NodeTable => ({ node: 'receiver', name: '接收緩衝區（4000 位元組）', head: ['項目', '位元組'],
  rows: [['已按順序收到', got], ['應用程式已讀取', read], ['緩衝區已用', used], ['rwnd（剩餘空間）', rwnd]], changed });
const sndWindow = (acked: string, rwnd: string, canSend: string, changed: number[]): NodeTable => ({ node: 'sender', name: '傳送端看到的視窗', head: ['項目', '值'],
  rows: [['已確認到（確認號）', acked], ['對方通告的 rwnd', rwnd], ['還能送出的位元組', canSend]], changed });
const flowControl: NetworkScene = {
  id: 'cn10-flow-control', title: '接收端忙不過來：視窗縮到 0 再打開', model: 'tcp-ip',
  description: '接收端的緩衝區只有 4000 位元組，它的應用程式正忙著處理別的事，暫時沒有讀取資料。傳送端每個區段送 2000 位元組，網路本身沒有壅塞。看接收端如何用每個 ACK 的「視窗」欄位告訴傳送端還剩多少空間（rwnd），視窗為 0 時傳送端怎麼辦。',
  nodes: [SENDER, RECEIVER],
  messages: [
    { id: 'd1', from: 'sender', to: 'receiver', label: '序號 1（2000 位元組）', payload: '第 1–2000 位元組',
      note: '資料進了接收緩衝區，可是應用程式還沒讀，所以這 2000 位元組仍占著空間：rwnd = 4000 − 2000 = 2000。',
      headers: [dataSeg(1, 2000), ipTo(true)], tables: [rcvBuffer('2000', '0', '2000', '2000', [0, 2, 3])] },
    { id: 'a1', from: 'receiver', to: 'sender', label: 'ACK 2001，視窗 2000', payload: '（沒有資料）',
      note: '確認號 2001 表示資料收到了；視窗 2000 表示「從 2001 起，我最多還能收 2000 位元組」。確認收到與還能收多少是兩件事：收到了，不代表應用程式讀走了。',
      headers: [ackSeg(2001, 2000), ipTo(false)], tables: [sndWindow('2001', '2000', '2000', [0, 1, 2])] },
    { id: 'd2', from: 'sender', to: 'receiver', label: '序號 2001（2000 位元組）', payload: '第 2001–4000 位元組',
      note: '傳送端剛好用完對方給的 2000 位元組。緩衝區滿了：已用 4000，rwnd = 0。',
      headers: [dataSeg(2001, 2000), ipTo(true)], tables: [rcvBuffer('4000', '0', '4000', '0', [0, 2, 3])] },
    { id: 'a2', from: 'receiver', to: 'sender', label: 'ACK 4001，視窗 0', payload: '（沒有資料）',
      note: '零視窗：傳送端必須停止送新資料，即使網路很空、壅塞視窗很大也一樣。它啟動持續計時器（persist timer），準備定期探測視窗是否重新打開。注意這不是遺失，資料都已確認，不需要重送，壅塞視窗也不變。',
      headers: [ackSeg(4001, 0), ipTo(false)], tables: [sndWindow('4001', '0', '0', [0, 1, 2])] },
    { id: 'probe', from: 'sender', to: 'receiver', label: '視窗探測（1 位元組）', payload: '第 4001 位元組',
      note: '持續計時器到期，傳送端送出只有 1 位元組的視窗探測，目的是逼對方回一個帶著最新視窗的 ACK。為什麼不乾脆一直等？因為「視窗打開了」的通知只是一個沒有資料的 ACK，它若遺失，不會被重送，雙方就會永遠互等。',
      headers: [dataSeg(4001, 1), ipTo(true)], tables: [rcvBuffer('4000', '0', '4000', '0', [])] },
    { id: 'a3', from: 'receiver', to: 'sender', label: 'ACK 4001，視窗 0（仍滿）', payload: '（沒有資料）',
      note: '緩衝區還是滿的，接收端不能收下這 1 位元組，回覆的確認號仍是 4001、視窗仍是 0。傳送端繼續等，下一次探測的間隔會加長。',
      headers: [ackSeg(4001, 0), ipTo(false)], tables: [sndWindow('4001', '0', '0', [])] },
    { id: 'update', from: 'receiver', to: 'sender', label: 'ACK 4001，視窗 3000（視窗更新）', payload: '（沒有資料）',
      note: '應用程式終於讀走 3000 位元組，緩衝區只剩 1000 位元組未讀，空出 3000。接收端主動送出視窗更新：確認號不變，視窗變成 3000。',
      headers: [ackSeg(4001, 3000), ipTo(false)],
      tables: [rcvBuffer('4000', '3000', '1000', '3000', [1, 2, 3]), sndWindow('4001', '3000', '3000', [1, 2])] },
    { id: 'd3', from: 'sender', to: 'receiver', label: '序號 4001（2000 位元組）', payload: '第 4001–6000 位元組',
      note: '傳送端恢復傳送。2000 位元組進入緩衝區，加上還沒讀的 1000，已用 3000，rwnd = 4000 − 3000 = 1000。只要應用程式讀得比網路送得慢，rwnd 就會一直把傳送速度壓在應用程式的速度。',
      headers: [dataSeg(4001, 2000), ipTo(true)], tables: [rcvBuffer('6000', '3000', '3000', '1000', [0, 2, 3])] },
  ],
};

// ---- scene 4: the congestion window by RTT round (Reno, in MSS) -----------------------------------------------------
const CWND_HEAD = ['輪次', 'cwnd（MSS）', 'ssthresh（MSS）', '事件'];
const ROUNDS: string[][] = [
  ['1', '1', '16', '慢啟動：送出 1 個區段'],
  ['2', '2', '16', '慢啟動：每個 ACK 加 1，一輪加倍'],
  ['3', '4', '16', '慢啟動：加倍'],
  ['4', '8', '16', '慢啟動：加倍'],
  ['5', '16', '16', '到達 ssthresh，改為壅塞避免'],
  ['6', '17', '16', '壅塞避免：每輪加 1'],
  ['7', '18', '16', '壅塞避免：每輪加 1'],
  ['8', '19', '16', '壅塞避免：每輪加 1'],
  ['9', '20', '16', '3 個重複 ACK：快速重傳，ssthresh 改為 10'],
  ['10', '10', '10', '快速復原結束，cwnd = ssthresh，壅塞避免'],
  ['11', '11', '10', '壅塞避免：每輪加 1'],
  ['12', '12', '10', '逾時：ssthresh 改為 6，cwnd 重設為 1'],
  ['13', '1', '6', '慢啟動：從 1 重新開始'],
  ['14', '2', '6', '慢啟動：加倍'],
  ['15', '4', '6', '慢啟動：加倍會超過 ssthresh'],
  ['16', '6', '6', '只長到 ssthresh，改為壅塞避免'],
  ['17', '7', '6', '壅塞避免：每輪加 1'],
];
/** The sender's cwnd table after rounds 1..n, marking the rounds from..n as new. */
const cwndTable = (from: number, n: number): NodeTable => ({ node: 'sender', name: '壅塞視窗紀錄', head: CWND_HEAD, rows: ROUNDS.slice(0, n),
  changed: Array.from({ length: n - from + 1 }, (_, i) => from - 1 + i) });
const roundSeg = (fields: [string, string][]) => ({ layer: 'transport' as const, protocol: 'TCP', fields: fields.map(([name, value]) => ({ name, value })) });
const cwndRounds: NetworkScene = {
  id: 'cn10-cwnd-rounds', title: '壅塞視窗一輪一輪的變化（Reno）', model: 'tcp-ip',
  description: '一條長時間傳送大檔案的 TCP 連線，路徑上有一台會壅塞的路由器。以 RTT 為一輪、以 MSS 為單位記錄每一輪開始時的 cwnd 與 ssthresh。規則（Reno）：沒有遺失時，cwnd < ssthresh 為慢啟動，下一輪 cwnd = min(2 × cwnd, ssthresh)；cwnd ≥ ssthresh 為壅塞避免，下一輪加 1。3 個重複 ACK：ssthresh = cwnd ÷ 2，下一輪 cwnd = ssthresh。逾時：ssthresh = cwnd ÷ 2，下一輪 cwnd = 1。一開始 cwnd = 1、ssthresh = 16；接收端的 rwnd 一直很大，不構成限制。',
  nodes: [SENDER, RECEIVER],
  messages: [
    { id: 'r1-4', from: 'sender', to: 'receiver', label: '第 1–4 輪：慢啟動', payload: '每輪送出 cwnd 個區段：1、2、4、8',
      note: '慢啟動其實一點也不慢：每收到一個新的 ACK，cwnd 就加 1 MSS。一輪送出 cwnd 個區段、收回 cwnd 個 ACK，所以每一輪加倍：1、2、4、8，呈指數成長。',
      headers: [roundSeg([['階段', '慢啟動'], ['本輪送出的區段', '1、2、4、8'], ['cwnd 成長', '每個 ACK 加 1 MSS']])], tables: [cwndTable(1, 4)] },
    { id: 'r5', from: 'sender', to: 'receiver', label: '第 5 輪：到達 ssthresh', payload: '本輪送出 16 個區段',
      note: '8 加倍成 16，剛好等於 ssthresh。ssthresh（慢啟動門檻）是傳送端對「網路大概能承受多少」的估計：到了門檻就不再加倍，改用謹慎的壅塞避免。',
      headers: [roundSeg([['階段', '慢啟動 → 壅塞避免'], ['本輪送出的區段', '16'], ['cwnd 與 ssthresh', '16 = 16']])], tables: [cwndTable(5, 5)] },
    { id: 'r6-8', from: 'sender', to: 'receiver', label: '第 6–8 輪：壅塞避免', payload: '每輪送出 17、18、19 個區段',
      note: '壅塞避免時，每個 ACK 只讓 cwnd 增加 1/cwnd 個 MSS，一整輪合起來加 1 MSS：16、17、18、19，線性成長。這是 AIMD 的「加法增加」：慢慢試探還有沒有多的頻寬。',
      headers: [roundSeg([['階段', '壅塞避免'], ['本輪送出的區段', '17、18、19'], ['cwnd 成長', '每輪加 1 MSS']])], tables: [cwndTable(6, 8)] },
    { id: 'r9-dup', from: 'receiver', to: 'sender', label: '第 9 輪：3 個重複 ACK', payload: '同一個確認號連續重複 3 次',
      note: 'cwnd 長到 20，路由器的佇列滿了，丟掉一個區段；後面的區段照常到達，換回 3 個重複 ACK。傳送端快速重傳，並把 ssthresh 設為 20 ÷ 2 = 10。快速復原結束後 cwnd = ssthresh = 10：這是 AIMD 的「乘法減少」。重複 ACK 還在回來，表示網路仍在傳送資料，只是有一點擁擠，所以減半就好，不必從 1 開始。',
      headers: [roundSeg([['旗標', 'ACK'], ['重複 ACK 數', '3'], ['反應', '快速重傳，ssthresh = 20 ÷ 2 = 10']])], tables: [cwndTable(9, 9)] },
    { id: 'r10-11', from: 'sender', to: 'receiver', label: '第 10–11 輪：從 10 線性成長', payload: '每輪送出 10、11 個區段',
      note: '從 10 開始，因為 cwnd ≥ ssthresh，直接用壅塞避免每輪加 1，不再經過慢啟動。',
      headers: [roundSeg([['階段', '壅塞避免（快速復原之後）'], ['本輪送出的區段', '10、11'], ['cwnd 成長', '每輪加 1 MSS']])], tables: [cwndTable(10, 11)] },
    { id: 'r12-loss', from: 'sender', to: 'receiver', label: '第 12 輪：一整批區段遺失', payload: '12 個區段，大多在壅塞的路由器被丟掉', lost: true,
      note: '這次路由器嚴重壅塞，這一輪的區段幾乎都被丟掉，接收端收不到後續的區段，也就送不出 3 個重複 ACK。傳送端只能等 RTO 到期：逾時代表網路可能連資料都送不過去，是比重複 ACK 嚴重的訊號。ssthresh = 12 ÷ 2 = 6，cwnd 重設為 1。',
      headers: [roundSeg([['階段', '壅塞避免'], ['本輪送出的區段', '12'], ['結果', '收不到確認，RTO 到期']])], tables: [cwndTable(12, 12)] },
    { id: 'r13-15', from: 'sender', to: 'receiver', label: '第 13–15 輪：逾時後重新慢啟動', payload: '先重送遺失的資料，每輪送出 1、2、4 個區段',
      note: '逾時之後回到慢啟動：1、2、4。到了第 15 輪，4 加倍成 8 會超過新的 ssthresh 6，所以下一輪只長到 6。',
      headers: [roundSeg([['階段', '慢啟動'], ['本輪送出的區段', '1、2、4'], ['ssthresh', '6']])], tables: [cwndTable(13, 15)] },
    { id: 'r16-17', from: 'sender', to: 'receiver', label: '第 16–17 輪：回到壅塞避免', payload: '每輪送出 6、7 個區段',
      note: 'cwnd = 6 到達 ssthresh，改為每輪加 1：6、7。把整張表畫成折線圖，就是 Reno 有名的鋸齒：指數爬升、線性上升、遇到重複 ACK 腰斬、遇到逾時掉到底。',
      headers: [roundSeg([['階段', '壅塞避免'], ['本輪送出的區段', '6、7'], ['cwnd 成長', '每輪加 1 MSS']])], tables: [cwndTable(16, 17)] },
  ],
};

/** CN10 TCP Reliability, Flow Control, and Congestion Control. Network lesson (CN-2). */
export const CN10: LessonContent = {
  lessonId: 'CN10',
  motivation: 'IP 只盡力把封包送出去：封包可能遺失、重複、亂序，接收端可能忙不過來，路上的路由器也可能塞滿。TCP 卻讓應用程式看到一條可靠、按順序的位元組串流，還能自己調整速度，不把網路塞爆。本課接在 CN09 的序號與確認號之後，逐步看 TCP 如何用確認、逾時重送與快速重傳補回遺失的資料，用滑動視窗同時送出多個區段，用接收視窗配合接收端的速度，再用壅塞視窗的慢啟動與 AIMD 試探網路的容量。學完後，你能依一連串遺失事件畫出壅塞視窗隨時間的變化，並說明下載為什麼突然變慢。',
  sections: [
    {
      id: 'ack-and-timeout', title: '累積確認與逾時重送',
      blocks: [
        { type: 'p', text: 'CN09 說過，TCP 為每個位元組編序號，確認號是「下一個我期待收到的位元組」。這種確認是累積確認（cumulative ACK）：ACK 5001 的意思是第 1 到 5000 位元組全部收齊了，不必為每個區段個別確認；前面的 ACK 遺失了，後面的 ACK 也能一併補上。反過來，只要中間缺了一段，確認號就停在缺口的開頭，後面到得再多也不會前進。' },
        { type: 'p', text: '傳送端怎麼知道資料遺失？最基本的方法是逾時重送：為最舊的未確認資料啟動一個計時器，時間到還沒有確認，就重送它。計時器的長度 RTO（retransmission timeout）不能寫死，因為 RTT 隨路徑與壅塞程度變動：太短會把只是比較慢的資料重送，浪費頻寬；太長則真的遺失時要乾等。TCP 持續量測 RTT，算出平滑 RTT（SRTT）與 RTT 的變異量（RTTVAR），再取 RTO = SRTT + 4 × RTTVAR：網路越不穩定，留的餘裕越大。' },
        { type: 'example', id: 'cn10-timeout' },
        { type: 'list', items: [
          '逾時後 RTO 加倍（指數退避），連續逾時就一直加倍，避免在網路已經壅塞時越送越多。',
          '重送的區段不拿來量 RTT（Karn 演算法）：收到確認時分不出是回應哪一次傳送。',
          '逾時的代價很高：在 RTO 這段時間裡，傳送端什麼新資料都不能送；而且逾時後壅塞視窗會降到 1 MSS（第 5 節）。',
        ] },
      ],
    },
    {
      id: 'fast-retransmit', title: '重複 ACK 與快速重傳',
      blocks: [
        { type: 'p', text: '大部分的遺失不必等到逾時。如果一個區段遺失、後面的區段照常到達，接收端每收到一個順序不對的區段，就會立刻再送一次同樣確認號的 ACK，叫做重複 ACK（duplicate ACK）。接收端會先把順序不對的資料暫存起來，等缺口補上再一起交給應用程式。' },
        { type: 'example', id: 'cn10-fast-retransmit' },
        { type: 'p', text: '為什麼要等 3 個重複 ACK？封包在網路上偶爾會換順序，晚到一點的區段也會造成一兩個重複 ACK；連續 3 個重複 ACK 表示後面至少三個區段都超車了，遺失的可能性就很高。這時傳送端立刻重送缺的那一段，叫做快速重傳（fast retransmit），通常比等 RTO 快上許多。' },
        { type: 'callout', tone: 'warning', title: '「掉一個封包，TCP 就從頭重傳整個檔案」', text: 'TCP 只重送遺失的那一段。在上面的情境中，5 個區段只遺失了序號 1001，傳送端也只重送它；後面三個區段早已在接收端暫存，缺口補上後，確認號直接從 1001 跳到 5001。逾時也一樣，只從最舊的未確認資料開始重送。真正受影響的是速度：遺失會讓壅塞視窗變小（第 5 節），所以吞吐量下降，但已經確認的資料不會再送一次。' },
        { type: 'callout', tone: 'note', title: 'SACK：告訴傳送端到底收到了哪些', text: '累積確認只能說出缺口的開頭。現代 TCP 幾乎都會在交握時協商 SACK（選擇性確認）選項，接收端可以在 ACK 裡附上「我另外收到了 2001–5000」，一個視窗裡掉了好幾段時，傳送端就知道要補哪些，不必一段一段試。' },
      ],
    },
    {
      id: 'sliding-window', title: '滑動視窗：在途資料最多 min(rwnd, cwnd)',
      blocks: [
        { type: 'p', text: '如果每送一個區段就停下來等確認（停止並等待），每個 RTT 只能送一個區段。CN02 算過，RTT 40 ms、1 Gbit/s 的路徑，管線裡要有 5 MB 的資料才能填滿。滑動視窗讓傳送端在收到確認之前連續送出多個區段：已送出、未確認的資料（在途資料）只要不超過視窗大小就能繼續送。每當確認回來，視窗的左緣往右滑，右緣也跟著往右，又空出可以送的位置。' },
        { type: 'p', text: '視窗大小由兩個數字決定，取比較小的那個：接收端在每個 ACK 裡通告的接收視窗 rwnd（保護接收端），與傳送端自己估計的壅塞視窗 cwnd（保護網路）。也就是說，在途資料 = 最後送出的位元組 − 最後確認的位元組 ≤ min(rwnd, cwnd)。每個 RTT 最多送出一個視窗的資料，所以吞吐量大約是視窗 ÷ RTT。' },
        { type: 'table', head: ['cwnd', 'rwnd', '在途資料上限', '已在途', '還能送出', '誰在限制'], rows: [
          ['8000 位元組', '5000 位元組', '5000 位元組', '3000 位元組', '2000 位元組', '接收端（流量控制）'],
          ['4000 位元組', '64000 位元組', '4000 位元組', '4000 位元組', '0（等確認回來）', '網路（壅塞控制）'],
          ['20000 位元組', '0', '0', '0', '0（只送視窗探測）', '接收端緩衝區已滿'],
        ] },
        { type: 'p', text: '視窗欄位在 TCP 標頭裡只有 16 位元，最多 65535 位元組。以 RTT 40 ms 計算，65535 × 8 ÷ 0.04 s 約 13 Mbit/s，填不滿快速的長途路徑。所以 TCP 在交握時協商視窗縮放（window scale）選項，把通告的值乘以 2 的次方，視窗最大可到約 1 GiB。' },
      ],
    },
    {
      id: 'flow-control', title: '流量控制：接收視窗、零視窗與視窗探測',
      blocks: [
        { type: 'p', text: '流量控制（flow control）要解決的問題是：不要送得比接收端的應用程式讀得快。接收端的 TCP 有一塊固定大小的接收緩衝區，資料進來後要等應用程式呼叫讀取才會離開。剩下的空間就是 rwnd，接收端在每個 ACK 的「視窗」欄位裡告訴傳送端：「從確認號開始，我最多還能收這麼多位元組。」' },
        { type: 'example', id: 'cn10-flow-control' },
        { type: 'list', items: [
          'rwnd = 緩衝區大小 −（已收到但應用程式還沒讀走的資料）。資料被確認，不代表已被應用程式讀走。',
          'rwnd = 0 時，傳送端必須停止送新資料，但連線不會中斷，也不算遺失，不重送、不降低 cwnd。',
          '傳送端啟動持續計時器，定期送出很小的視窗探測，逼接收端回覆最新的視窗；這樣即使「視窗打開了」的通知遺失，雙方也不會永遠互等。',
          '應用程式讀走資料後，接收端主動送出視窗更新（確認號不變、視窗變大），傳送端恢復傳送。',
        ] },
      ],
    },
    {
      id: 'congestion-control', title: '壅塞控制：慢啟動、壅塞避免與 AIMD',
      blocks: [
        { type: 'p', text: '就算接收端很快，路徑上的路由器也可能塞滿：大家都送得太快，佇列滿了就丟封包，丟了又重送，網路越來越塞。壅塞控制（congestion control）讓傳送端自己維護一個壅塞視窗 cwnd，估計「網路現在能承受多少在途資料」。路由器不會直接告訴傳送端，TCP 只能從遺失（重複 ACK、逾時）推測壅塞。下面用經典的 Reno 規則，以 MSS（最大區段大小）為單位、以 RTT 為一輪來計算：' },
        { type: 'list', ordered: true, items: [
          '慢啟動（slow start）：cwnd < ssthresh 時，每個 ACK 讓 cwnd 加 1 MSS，所以每輪加倍；下一輪 cwnd = min(2 × cwnd, ssthresh)。',
          '壅塞避免（congestion avoidance）：cwnd ≥ ssthresh 時，每輪只加 1 MSS。',
          '3 個重複 ACK：快速重傳，ssthresh = cwnd ÷ 2，經過快速復原後 cwnd = ssthresh，繼續壅塞避免。',
          '逾時：ssthresh = cwnd ÷ 2，cwnd = 1 MSS，重新慢啟動。',
        ] },
        { type: 'p', text: '壅塞避免的「每輪加 1」與遺失時的「減半」合稱 AIMD（additive increase, multiplicative decrease，加法增加、乘法減少）。增加要慢，是因為多送一點只是試探；減少要快，是因為壅塞時再多送只會讓更多封包被丟掉。多條連線共用同一個瓶頸時，AIMD 也會讓它們的視窗逐漸趨於相等，比較公平。以下情境從 cwnd = 1、ssthresh = 16 開始，第 9 輪遇到 3 個重複 ACK，第 12 輪遇到逾時。' },
        { type: 'example', id: 'cn10-cwnd-rounds' },
        { type: 'table', head: ['輪次', 'cwnd（MSS）', 'ssthresh（MSS）', '事件'], rows: ROUNDS },
        { type: 'p', text: '要畫出 cwnd 隨時間的變化：橫軸是輪次，縱軸是 cwnd。第 1 到 5 輪是向上彎的指數曲線，碰到 ssthresh 16 後變成斜率 1 的直線；第 9 輪的重複 ACK 讓下一輪掉到一半（20 → 10），接著又是直線；第 12 輪逾時，下一輪直接掉到 1，再以指數曲線爬到新的 ssthresh 6，然後回到直線。長時間來看，就是一連串的鋸齒。' },
        { type: 'callout', tone: 'note', title: '真實的 TCP 不只 Reno', text: '本課的數字都依 Reno 的規則計算，方便一輪一輪追蹤。現代作業系統的初始 cwnd 通常是 10 MSS，而不是 1。Linux 與 Windows 預設用 CUBIC：遺失後一樣乘法減少，但 cwnd 依「距離上次遺失的時間」的三次函數成長，在頻寬延遲乘積很大的路徑上比每輪加 1 快得多。Google 提出的 BBR 則不把遺失當成主要訊號，而是持續估計瓶頸頻寬與最小 RTT，讓在途資料接近兩者的乘積。' },
      ],
    },
    {
      id: 'throughput', title: '吞吐量為什麼下降：比較流量控制與壅塞控制',
      blocks: [
        { type: 'p', text: '每個 RTT 最多送出一個視窗，所以吞吐量約為 min(rwnd, cwnd) ÷ RTT。假設 MSS = 1000 位元組、RTT = 100 ms：第 9 輪 cwnd = 20，約 20 × 1000 × 8 ÷ 0.1 s = 1.6 Mbit/s；重複 ACK 後 cwnd = 10，吞吐量立刻減半成 0.8 Mbit/s；逾時後 cwnd = 1，只剩 0.08 Mbit/s，而且在逾時之前還白白等了一個 RTO，什麼新資料都沒送。從第 9 到第 17 輪，cwnd 的加總是 73 個區段；如果都沒有遺失、從 20 一路每輪加 1，會是 216 個，差了將近三倍。' },
        { type: 'p', text: '所以下載變慢的原因常常不是頻寬變小，而是遺失讓 cwnd 縮小：重複 ACK 讓速度減半，逾時讓速度掉到最低再慢慢爬回來。Reno 在穩定的鋸齒裡，cwnd 在最大值 W 與 W ÷ 2 之間來回，平均吞吐量約為 0.75 × W ÷ RTT。另一個常見原因是接收端：應用程式讀得慢，rwnd 變小甚至變成 0，這時網路再空也快不起來。' },
        { type: 'table', head: ['比較項目', '流量控制', '壅塞控制'], rows: [
          ['保護誰', '接收端（它的緩衝區與應用程式）', '網路（路徑上的路由器與其他連線）'],
          ['用哪個視窗', '接收視窗 rwnd', '壅塞視窗 cwnd'],
          ['誰決定大小', '接收端算出，在每個 ACK 的視窗欄位通告', '傳送端自己估計，不寫在標頭裡'],
          ['資訊來源', '接收緩衝區還剩多少空間', '重複 ACK、逾時等遺失訊號（BBR 另看頻寬與 RTT）'],
          ['什麼時候變小', '應用程式讀得比資料到得慢', '偵測到遺失：重複 ACK 減半，逾時降到 1'],
          ['變成最小時', 'rwnd = 0：停止送新資料，定期送視窗探測', 'cwnd = 1 MSS：每輪只送一個區段，重新慢啟動'],
        ] },
        { type: 'callout', tone: 'warning', title: '「流量控制和壅塞控制是同一件事」', text: '兩者都會讓傳送端慢下來，但原因與資訊來源完全不同。流量控制看的是接收端的緩衝區，接收端用 rwnd 明確告訴傳送端；壅塞控制看的是整條路徑，傳送端只能從遺失自己推測，用 cwnd 限制。一台很快的伺服器傳給很慢的手機，受限的是 rwnd；兩台很快的電腦經過一條擁擠的國際線路，受限的是 cwnd。rwnd = 0 不是壅塞，不會讓 cwnd 減半；遺失也不會改變接收端通告的 rwnd。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    { id: 'q-cumulative', prompt: '接收端已經收到第 1–1000 位元組與第 2001–4000 位元組，第 1001–2000 位元組還沒到。它送出的 ACK 確認號是多少？',
      options: ['4001', '1001', '2001', '1000'], answer: 1,
      explanation: 'TCP 的確認是累積確認，確認號是下一個期待收到的位元組，而且只能說「到哪裡為止都收齊了」。第 1001 位元組還沒到，所以確認號停在 1001。4001 忽略了中間的缺口；2001 是把暫存的區段開頭當成確認號；1000 是最後收到的位元組，不是下一個要的位元組。' },
    { id: 'q-three-dups', prompt: '為什麼 TCP 要等到 3 個重複 ACK 才快速重傳，而不是收到第 1 個重複 ACK 就重傳？',
      options: ['因為 RTO 一定等於 3 個 RTT', '因為接收端每 3 個區段才回一次 ACK', '因為重複 ACK 要累積 3 個才能算出新的 RTT', '因為封包偶爾會亂序，一兩個重複 ACK 不一定代表遺失'], answer: 3,
      explanation: '晚到一點的區段也會造成一兩個重複 ACK，馬上重傳會白白浪費頻寬；連續 3 個重複 ACK 表示後面至少三個區段都先到了，遺失的可能性很高。RTO 是由 SRTT 與 RTTVAR 算出來的，和 3 個 RTT 無關；接收端收到順序不對的區段會立刻送重複 ACK，不是每 3 個才回；重複 ACK 也不用來量 RTT。' },
    { id: 'q-in-flight', prompt: '傳送端的 cwnd 是 12000 位元組，接收端通告的 rwnd 是 8000 位元組，目前已送出、未確認的資料有 5000 位元組。傳送端現在最多還能送出多少位元組？',
      options: ['3000 位元組', '7000 位元組', '8000 位元組', '12000 位元組'], answer: 0,
      explanation: '在途資料上限是 min(rwnd, cwnd) = min(8000, 12000) = 8000 位元組，已經有 5000 在途，還能送 8000 − 5000 = 3000。7000 是只看 cwnd（12000 − 5000），忘了 rwnd 更小；8000 與 12000 都忘了扣掉已經在途的 5000 位元組。' },
    { id: 'q-slow-start', prompt: '依本課的 Reno 規則，cwnd 從 1 MSS 開始、ssthresh 是 32 MSS，而且沒有任何遺失。cwnd 在第幾輪開始時第一次到達 32？（第 1 輪的 cwnd 是 1）',
      options: ['第 5 輪', '第 32 輪', '第 6 輪', '第 7 輪'], answer: 2,
      explanation: '慢啟動每輪加倍：第 1 到第 6 輪分別是 1、2、4、8、16、32，所以第 6 輪到達 32。第 5 輪只有 16；第 32 輪是把慢啟動當成每輪加 1；第 7 輪多算了一輪，那時已經進入壅塞避免，cwnd 是 33。' },
    { id: 'q-dup-ack', prompt: 'Reno 的 cwnd 是 24 MSS、ssthresh 是 16 MSS 時，收到 3 個重複 ACK。快速復原結束後，cwnd 與 ssthresh 各是多少？',
      options: ['cwnd 1、ssthresh 12', 'cwnd 24、ssthresh 24', 'cwnd 12、ssthresh 12', 'cwnd 12、ssthresh 16'], answer: 2,
      explanation: '3 個重複 ACK 時，ssthresh = cwnd ÷ 2 = 12，快速復原結束後 cwnd = ssthresh = 12，之後每輪加 1。cwnd 1 是逾時的反應，不是重複 ACK 的；cwnd 24、ssthresh 24 是把門檻改成目前的 cwnd，完全沒有減少；ssthresh 留在 16 是忘了更新門檻，下一次慢啟動的終點就會錯。' },
    { id: 'q-timeout', prompt: 'Reno 的 cwnd 是 24 MSS 時發生逾時。接下來的 cwnd 與 ssthresh 各是多少？',
      options: ['cwnd 1、ssthresh 12', 'cwnd 12、ssthresh 12', 'cwnd 1、ssthresh 24', 'cwnd 0、ssthresh 12'], answer: 0,
      explanation: '逾時是比重複 ACK 嚴重的壅塞訊號：ssthresh = 24 ÷ 2 = 12，cwnd 重設為 1 MSS，重新慢啟動。cwnd 12 是重複 ACK 的反應；ssthresh 24 是忘了把門檻減半；cwnd 不會是 0，傳送端至少還要能送 1 個區段來重送遺失的資料。' },
    { id: 'q-zero-window', prompt: '傳送端收到 ACK，其中的視窗欄位是 0。傳送端接下來會怎麼做？',
      options: ['立刻關閉連線', '把 cwnd 降為 1 MSS 並進入慢啟動', '把所有未確認的資料當作遺失而重送', '停止送新資料，並以持續計時器定期送出視窗探測'], answer: 3,
      explanation: '視窗 0 是流量控制：接收端的緩衝區滿了，傳送端暫停送新資料，並定期送小小的視窗探測，等視窗重新打開。它不是錯誤，連線不會關閉；它也不是壅塞，cwnd 不變；資料都已確認或還在計時，沒有理由當作遺失重送。' },
    { id: 'q-throughput', prompt: 'MSS 是 1000 位元組、RTT 是 100 ms，rwnd 很大。cwnd 為 20 MSS 時吞吐量約 1.6 Mbit/s。收到 3 個重複 ACK、快速復原結束後，下一輪的吞吐量上限約為多少？',
      options: ['仍是 1.6 Mbit/s，因為頻寬沒變', '約 0.8 Mbit/s', '約 0.08 Mbit/s', '約 3.2 Mbit/s'], answer: 1,
      explanation: '吞吐量約為 cwnd ÷ RTT。重複 ACK 讓 cwnd 從 20 減半為 10，10 × 1000 × 8 ÷ 0.1 s = 0.8 Mbit/s。頻寬沒變，但傳送端自己縮小了視窗，所以不會維持 1.6；0.08 Mbit/s 是逾時後 cwnd = 1 的情況；3.2 Mbit/s 則是把減半當成加倍。' },
  ],
  network: {
    scenes: [timeout, fastRetransmit, flowControl, cwndRounds],
    exercises: [
      { id: 'cn10-ex-dup-ack', task: 'field', scene: 'cn10-fast-retransmit', message: 'dup2', layer: 'transport', field: '確認號',
        title: '第 2 個重複 ACK 的確認號',
        statement: '在「三個重複 ACK：不等逾時就快速重傳」情境中，接收端收到序號 3001 的區段（第 3001–4000 位元組）後送出第 2 個重複 ACK（步驟 dup2）。這個 ACK 的 TCP 確認號是多少？',
        hints: ['確認號是「下一個期待收到的位元組」，不是剛收到的區段的序號。', 'TCP 是累積確認：中間缺了一段，確認號就停在缺口的開頭。', '看接收緩衝區：哪一段還沒到？'],
        explanation: '接收端收到了 1–1000、2001–3000 與 3001–4000，唯獨缺 1001–2000。累積確認只能說「到 1000 為止都收齊了，下一個要 1001」，所以確認號是 1001，和前一個 ACK 一樣，因此叫重複 ACK。',
        mistakes: [
          { answer: { value: '4001' }, why: '用剛收到的區段算出「序號 + 長度」：那是按順序收到時的確認號，但 1001–2000 還沒到，確認號不能跳過缺口。' },
          { answer: { value: '3001' }, why: '填了剛收到的區段的序號：確認號說的是下一個要的位元組，不是收到了哪一段。' },
        ] },
      { id: 'cn10-ex-cwnd-after-dup', task: 'table', scene: 'cn10-cwnd-rounds', message: 'r16-17', node: 'sender', table: '壅塞視窗紀錄', row: '10', column: 'cwnd（MSS）',
        title: '重複 ACK 之後的 cwnd',
        statement: '在「壅塞視窗一輪一輪的變化（Reno）」情境中，第 9 輪 cwnd = 20、ssthresh = 16，這一輪收到 3 個重複 ACK。依情境的 Reno 規則，第 10 輪開始時的 cwnd 是多少 MSS？',
        hints: ['3 個重複 ACK 先更新 ssthresh：ssthresh = cwnd ÷ 2。', '快速復原結束後，cwnd 設成新的 ssthresh。', '只有逾時才會讓 cwnd 回到 1。'],
        explanation: '3 個重複 ACK 時 ssthresh = 20 ÷ 2 = 10，快速復原結束後 cwnd = ssthresh = 10，第 10 輪從 10 開始壅塞避免。這是 AIMD 的乘法減少：重複 ACK 還在回來，表示網路仍能送資料，所以減半而不是歸零。',
        mistakes: [
          { answer: { cell: '1' }, why: '把重複 ACK 當成逾時：只有逾時才讓 cwnd 回到 1 MSS，重複 ACK 是減半。' },
          { answer: { cell: '21' }, why: '忽略了遺失，照壅塞避免繼續加 1：3 個重複 ACK 代表有區段被丟了，cwnd 要乘法減少。' },
          { answer: { cell: '8' }, why: '把舊的 ssthresh 16 減半：新的 ssthresh 是目前 cwnd 20 的一半。' },
        ] },
      { id: 'cn10-ex-ssthresh-after-timeout', task: 'table', scene: 'cn10-cwnd-rounds', message: 'r16-17', node: 'sender', table: '壅塞視窗紀錄', row: '13', column: 'ssthresh（MSS）',
        title: '逾時之後的 ssthresh',
        statement: '同一個情境中，第 12 輪 cwnd = 12、ssthresh = 10，這一輪發生逾時。第 13 輪開始時的 ssthresh 是多少 MSS？',
        hints: ['逾時一樣要把 ssthresh 設為目前 cwnd 的一半。', '減半的是 cwnd，不是舊的 ssthresh。'],
        explanation: '逾時時 ssthresh = 12 ÷ 2 = 6，cwnd 重設為 1。之後的慢啟動只加倍到 6 就改為壅塞避免，所以 ssthresh 決定了下一段指數成長的終點。',
        mistakes: [
          { answer: { cell: '10' }, why: '逾時時沒有更新 ssthresh：任何遺失都要把門檻設成目前 cwnd 的一半。' },
          { answer: { cell: '5' }, why: '把舊的 ssthresh 10 減半：要減半的是發生逾時時的 cwnd 12。' },
          { answer: { cell: '1' }, why: '把 cwnd 的新值當成 ssthresh：逾時讓 cwnd 變成 1，ssthresh 則是 cwnd 的一半。' },
        ] },
      { id: 'cn10-ex-cwnd-cap', task: 'table', scene: 'cn10-cwnd-rounds', message: 'r16-17', node: 'sender', table: '壅塞視窗紀錄', row: '16', column: 'cwnd（MSS）',
        title: '慢啟動碰到 ssthresh',
        statement: '同一個情境中，第 15 輪 cwnd = 4、ssthresh = 6，沒有遺失。依情境的規則，第 16 輪開始時的 cwnd 是多少 MSS？',
        hints: ['cwnd < ssthresh，還在慢啟動。', '慢啟動的下一輪是 min(2 × cwnd, ssthresh)。'],
        explanation: '4 加倍是 8，但慢啟動只長到 ssthresh：min(8, 6) = 6。從第 16 輪起 cwnd ≥ ssthresh，改為壅塞避免，第 17 輪是 7。',
        mistakes: [
          { answer: { cell: '8' }, why: '照樣加倍，越過了 ssthresh：慢啟動到門檻就停，之後改為每輪加 1。' },
          { answer: { cell: '5' }, why: '提早改用壅塞避免加 1：cwnd 4 還小於 ssthresh 6，仍在慢啟動。' },
        ] },
      { id: 'cn10-ex-rwnd', task: 'table', scene: 'cn10-flow-control', message: 'd3', node: 'receiver', table: '接收緩衝區（4000 位元組）', row: 'rwnd（剩餘空間）', column: '位元組',
        title: '視窗重新打開之後的 rwnd',
        statement: '在「接收端忙不過來：視窗縮到 0 再打開」情境中，接收緩衝區是 4000 位元組。應用程式讀走 3000 位元組、接收端通告視窗 3000 之後，傳送端又送來 2000 位元組（步驟 d3）。這時接收端的 rwnd 是多少位元組？',
        hints: ['rwnd = 緩衝區大小 − 還沒被應用程式讀走的資料。', '視窗更新之前，緩衝區裡還有 1000 位元組沒讀。'],
        explanation: '視窗更新時緩衝區還有 4000 − 3000 = 1000 位元組沒讀；再進來 2000，未讀的資料變成 3000，rwnd = 4000 − 3000 = 1000。只要應用程式不再讀，下一個區段送完 rwnd 就又會變成 0。',
        mistakes: [
          { answer: { cell: '2000' }, why: '以為視窗更新時緩衝區已經全空：應用程式只讀走 3000，還有 1000 位元組占著空間。' },
          { answer: { cell: '3000' }, why: '沿用上一個通告的視窗：新的 2000 位元組進來後，剩餘空間會變小。' },
        ] },
    ],
  },
};
