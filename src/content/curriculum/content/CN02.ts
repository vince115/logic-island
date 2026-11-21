import type { NetworkScene } from '@/lib/network/model';
import type { LessonContent } from '../schema';

/*
 * CN02 The Physical Layer and Network Performance (CN-1). Every delay written into a scene agrees with delayOf
 * (src/lib/network/model.ts): transmission = bytes × 8 ÷ bandwidth, propagation = distance ÷ 2×10⁸ m/s, in milliseconds.
 * Addresses are RFC 5737 documentation ranges and locally administered MAC addresses (02:…).
 */

const MAC = { a: '02:00:00:00:00:0a', b: '02:00:00:00:00:0b' };

/** Section 3: one link, two frame sizes. delayOf(1500, 1e8, 2000) = 0.12 / 0.01 / 0.13; delayOf(100, 1e8, 2000) = 0.008 / 0.01 / 0.018. */
const frameSizes: NetworkScene = {
  id: 'cn02-frame-sizes', title: '同一條光纖上的大訊框與小訊框', model: 'osi',
  description: '兩棟大樓的交換器之間是一條 2 km 的多模光纖（100BASE-FX，100 Mbit/s）。主機 A 先送一個 1500 位元組的訊框給主機 B，再送一個 100 位元組的小訊框。看傳輸延遲怎麼隨訊框大小改變，傳播延遲卻不變。為了好算，位元組數只算訊框本身，忽略前導碼與訊框間隔。',
  nodes: [
    { id: 'sw-a', label: '大樓 A 交換器', kind: 'switch', addresses: ['主機 A 接在這裡', '光纖埠 100BASE-FX'] },
    { id: 'sw-b', label: '大樓 B 交換器', kind: 'switch', addresses: ['主機 B 接在這裡', '光纖埠 100BASE-FX'] },
  ],
  messages: [
    { id: 'big', from: 'sw-a', to: 'sw-b', label: '1500 位元組的訊框',
      note: '1500 位元組是 12000 位元。以 100 Mbit/s 推上光纖要 12000 ÷ 10⁸ = 0.12 ms；第一個位元走完 2 km 要 2000 ÷ (2×10⁸) = 0.01 ms。最後一個位元在 0.12 + 0.01 = 0.13 ms 到達大樓 B，大部分時間花在把位元推上線路。',
      headers: [
        { layer: 'link', protocol: 'Ethernet', fields: [{ name: '來源 MAC', value: MAC.a }, { name: '目的 MAC', value: MAC.b }, { name: '訊框長度', value: '1500 位元組' }] },
        { layer: 'physical', protocol: '100BASE-FX', fields: [{ name: '媒介', value: '多模光纖' }, { name: '訊號', value: '光脈衝（約 1300 nm）' }, { name: '位元數', value: '12000' },
          { name: '頻寬', value: '100 Mbit/s' }, { name: '距離', value: '2 km' }, { name: '傳輸延遲', value: '0.12 ms' }, { name: '傳播延遲', value: '0.01 ms' }, { name: '總延遲', value: '0.13 ms' }] },
      ] },
    { id: 'small', from: 'sw-a', to: 'sw-b', label: '100 位元組的訊框',
      note: '100 位元組是 800 位元，傳輸延遲只要 800 ÷ 10⁸ = 0.008 ms，是大訊框的十五分之一；傳播延遲還是 0.01 ms，因為訊號走 2 km 的時間和訊框大小無關。這次傳播延遲反而比傳輸延遲長，總延遲 0.018 ms。',
      headers: [
        { layer: 'link', protocol: 'Ethernet', fields: [{ name: '來源 MAC', value: MAC.a }, { name: '目的 MAC', value: MAC.b }, { name: '訊框長度', value: '100 位元組' }] },
        { layer: 'physical', protocol: '100BASE-FX', fields: [{ name: '媒介', value: '多模光纖' }, { name: '訊號', value: '光脈衝（約 1300 nm）' }, { name: '位元數', value: '800' },
          { name: '頻寬', value: '100 Mbit/s' }, { name: '距離', value: '2 km' }, { name: '傳輸延遲', value: '0.008 ms' }, { name: '傳播延遲', value: '0.01 ms' }, { name: '總延遲', value: '0.018 ms' }] },
      ] },
  ],
};

/** Section 5: a long fibre path. delayOf(125, 1e9, 4e6) = 0.001 / 20 / 20.001; delayOf(1500, 1e9, 4e6) = 0.012 / 20 / 20.012. */
const longHaul: NetworkScene = {
  id: 'cn02-long-haul', title: '跨洲光纖上的一次往返', model: 'osi',
  description: '用戶端向 4000 km 外的伺服器送一個小請求，伺服器立刻回應一個 1500 位元組的封包。真實的路徑上有許多路由器與光放大器，這裡把它簡化成一條 1 Gbit/s、4000 km 的光纖，並忽略排隊與處理延遲。看傳播延遲如何占掉幾乎全部的時間。',
  nodes: [
    { id: 'client', label: '用戶端', kind: 'host', addresses: ['IP 192.0.2.10'] },
    { id: 'server', label: '遠端伺服器', kind: 'server', addresses: ['IP 203.0.113.80', '距離 4000 km'] },
  ],
  messages: [
    { id: 'request', from: 'client', to: 'server', label: '請求（125 位元組）',
      note: '125 位元組是 1000 位元，以 1 Gbit/s 推上線路只要 0.001 ms；但光在 4000 km 的光纖裡要走 4×10⁶ ÷ (2×10⁸) = 0.02 s = 20 ms。單程 20.001 ms，幾乎全是傳播延遲。',
      headers: [
        { layer: 'network', protocol: 'IPv4', fields: [{ name: '來源 IP', value: '192.0.2.10' }, { name: '目的 IP', value: '203.0.113.80' }, { name: '總長度', value: '125 位元組' }] },
        { layer: 'physical', protocol: '長途光纖', fields: [{ name: '媒介', value: '單模光纖（簡化成一段）' }, { name: '訊號', value: '光脈衝（約 1550 nm）' }, { name: '位元數', value: '1000' },
          { name: '頻寬', value: '1 Gbit/s' }, { name: '距離', value: '4000 km' }, { name: '傳輸延遲', value: '0.001 ms' }, { name: '傳播延遲', value: '20 ms' }, { name: '單程延遲', value: '20.001 ms' }] },
      ] },
    { id: 'response', from: 'server', to: 'client', label: '回應（1500 位元組）',
      note: '回應有 12000 位元，傳輸延遲 0.012 ms，回程同樣要 20 ms，單程 20.012 ms。從送出請求到收到完整回應，RTT ≈ 20.001 + 20.012 = 40.013 ms，約 40 ms。這 40 ms 裡，1 Gbit/s 的線路可以送出 10⁹ × 0.04 = 4×10⁷ 位元（5×10⁶ 位元組，5 MB），這就是以 RTT 計算的頻寬延遲乘積。',
      headers: [
        { layer: 'network', protocol: 'IPv4', fields: [{ name: '來源 IP', value: '203.0.113.80' }, { name: '目的 IP', value: '192.0.2.10' }, { name: '總長度', value: '1500 位元組' }] },
        { layer: 'physical', protocol: '長途光纖', fields: [{ name: '媒介', value: '單模光纖（簡化成一段）' }, { name: '訊號', value: '光脈衝（約 1550 nm）' }, { name: '位元數', value: '12000' },
          { name: '頻寬', value: '1 Gbit/s' }, { name: '距離', value: '4000 km' }, { name: '傳輸延遲', value: '0.012 ms' }, { name: '傳播延遲', value: '20 ms' }, { name: '單程延遲', value: '20.012 ms' }] },
      ] },
  ],
};

/**
 * Section 6: a fast fibre link, then a slow access link. delayOf(1500, 1e9, 50000) = 0.012 / 0.25 / 0.262;
 * delayOf(1500, 2e7, 2000) = 0.6 / 0.01 / 0.61. Packet 1 reaches the ISP at 0.262 ms and is sent on 0.262–0.862 ms;
 * packet 2 leaves the server at 0.012 ms, arrives at 0.274 ms and waits until 0.862 ms (0.588 ms), sent on 0.862–1.462 ms.
 */
const ACCESS_IP = [{ name: '來源 IP', value: '203.0.113.80' }, { name: '目的 IP', value: '192.0.2.10' }, { name: '總長度', value: '1500 位元組' }];
const fibreHop = { layer: 'physical' as const, protocol: '1000BASE-ZX', fields: [{ name: '媒介', value: '單模光纖' }, { name: '訊號', value: '光脈衝（約 1550 nm）' }, { name: '位元數', value: '12000' },
  { name: '頻寬', value: '1 Gbit/s' }, { name: '距離', value: '50 km' }, { name: '傳輸延遲', value: '0.012 ms' }, { name: '傳播延遲', value: '0.25 ms' }, { name: '總延遲', value: '0.262 ms' }] };
const accessHop = { layer: 'physical' as const, protocol: 'VDSL2', fields: [{ name: '媒介', value: '雙絞線（電話線）' }, { name: '訊號', value: '電訊號（多個頻段的載波）' }, { name: '位元數', value: '12000' },
  { name: '頻寬', value: '20 Mbit/s' }, { name: '距離', value: '2 km' }, { name: '傳輸延遲', value: '0.6 ms' }, { name: '傳播延遲', value: '0.01 ms' }, { name: '總延遲', value: '0.61 ms' }] };
const QUEUE = { node: 'isp', name: '往你家的輸出佇列', head: ['封包', '狀態'] };
const bottleneck: NetworkScene = {
  id: 'cn02-bottleneck', title: '快光纖接慢線路：瓶頸在哪裡', model: 'osi',
  description: '影音伺服器經 50 km、1 Gbit/s 的光纖連到 ISP 路由器，ISP 再經 2 km、20 Mbit/s 的 VDSL2 接取線路連到你家。伺服器連續送出兩個 1500 位元組的封包。看封包在 ISP 的輸出佇列裡排隊，以及為什麼整條路徑的速率由慢的那一段決定。',
  nodes: [
    { id: 'server', label: '影音伺服器', kind: 'server', addresses: ['IP 203.0.113.80'] },
    { id: 'isp', label: 'ISP 路由器', kind: 'router', addresses: ['往伺服器：光纖 1 Gbit/s，50 km', '往你家：VDSL2 20 Mbit/s，2 km'] },
    { id: 'home', label: '你家的路由器', kind: 'router', addresses: ['IP 192.0.2.10'] },
  ],
  messages: [
    { id: 'p1-fibre', from: 'server', to: 'isp', label: '封包 1（光纖段）',
      note: '伺服器以 1 Gbit/s 送出封包 1：0.012 ms 就送完，最後一個位元在 0.262 ms 到達 ISP 路由器。路由器收完整個封包、決定往哪裡送之後，開始把它送上往你家的接取線路。',
      headers: [{ layer: 'network', protocol: 'IPv4', fields: ACCESS_IP }, fibreHop],
      tables: [{ ...QUEUE, rows: [['封包 1', '開始送上接取線路']], changed: [0] }] },
    { id: 'p2-fibre', from: 'server', to: 'isp', label: '封包 2（光纖段）',
      note: '伺服器只隔 0.012 ms 就送出封包 2，它在 0.274 ms 到達 ISP。可是接取線路送一個封包要 0.6 ms，封包 1 還在送，封包 2 只能在輸出佇列裡等。這段等待就是排隊延遲。',
      headers: [{ layer: 'network', protocol: 'IPv4', fields: ACCESS_IP }, fibreHop],
      tables: [{ ...QUEUE, rows: [['封包 1', '送上接取線路中（共需 0.6 ms）'], ['封包 2', '排隊等待']], changed: [1] }] },
    { id: 'p1-access', from: 'isp', to: 'home', label: '封包 1（接取段）',
      note: '同樣 12000 位元，在 20 Mbit/s 的線路上要 0.6 ms 才送完，是光纖段的 50 倍。封包 1 在 0.862 ms 送完，最後一個位元在 0.872 ms 到你家。封包 2 從 0.274 ms 等到 0.862 ms 才輪到，排隊了 0.588 ms。',
      headers: [{ layer: 'network', protocol: 'IPv4', fields: ACCESS_IP }, accessHop],
      tables: [{ ...QUEUE, rows: [['封包 2', '送上接取線路中']], changed: [0] }] },
    { id: 'p2-access', from: 'isp', to: 'home', label: '封包 2（接取段）',
      note: '封包 2 在 1.462 ms 送完，1.472 ms 到你家。之後接取線路每 0.6 ms 才能放行一個封包：不論伺服器送得多快，你收到的速率最多 20 Mbit/s。如果伺服器一直以 1 Gbit/s 送，佇列會越排越長，滿了就開始丟封包。',
      headers: [{ layer: 'network', protocol: 'IPv4', fields: ACCESS_IP }, accessHop] },
  ],
};

/** CN02 The Physical Layer and Network Performance: Bandwidth, Latency, and Throughput. Network lesson (CN-1). */
export const CN02: LessonContent = {
  lessonId: 'CN02',
  motivation: '影片卡頓、視訊會議有回音般的延遲、大檔案下載很久，原因可能完全不同：可能是頻寬不夠，可能是距離太遠，也可能是路徑上某一段特別慢。本課從位元如何變成電、光與無線電訊號開始，比較雙絞線、光纖與無線三種媒介，分清頻寬、吞吐量與延遲，把傳輸延遲與傳播延遲算出來，再用 RTT 與頻寬延遲乘積理解「管線容量」。學完後，你能算出一個檔案在指定頻寬與距離下要多久才送完，並指出瓶頸在哪一段。',
  sections: [
    {
      id: 'signals', title: '位元如何變成訊號：電、光與無線電',
      blocks: [
        { type: 'p', text: 'CN01 說過，資料由上往下一層一層封裝，最後交給實體層。實體層不看標頭，也不管封包的意義，它只做一件事：把 0 與 1 變成能在媒介上傳送的訊號，到了另一端再還原成位元。同一個訊框，在雙絞線上是電壓的變化，在光纖裡是雷射的明暗，在空氣中是無線電波的振幅與相位變化。不同的訊號與媒介，決定了一條鏈路能多快、能多遠、有多容易受干擾。' },
        { type: 'table', head: ['媒介', '訊號', '常見頻寬', '單段距離', '干擾', '常見用途'], rows: [
          ['雙絞線（Cat 5e／Cat 6A）', '電壓變化（電訊號）', 'Cat 5e 1 Gbit/s；Cat 6A 可到 10 Gbit/s', '乙太網路一段最長 100 m', '容易受電磁干擾；兩條線絞在一起可抵消一部分', '辦公室與家中的有線網路'],
          ['光纖（多模／單模）', '光脈衝（雷射或 LED 的明暗）', '每條 10–100 Gbit/s 以上，還能多個波長並行', '多模數百公尺到約 2 km；單模數十公里，加上光放大器可跨洋', '不受電磁干擾', '骨幹網路、海底電纜、光纖到府'],
          ['無線電（Wi-Fi、行動網路）', '無線電波', '實際數十到數百 Mbit/s，隨距離與干擾變動', 'Wi-Fi 室內約數十公尺；行動基地台數百公尺到數公里', '牆壁、距離、其他裝置都會影響；同一頻道由附近的裝置共用', '手機、筆電、物聯網裝置'],
        ] },
        { type: 'p', text: '訊號的速度不是無限大。光在真空中約 3×10⁸ m/s；在光纖的玻璃裡慢了約三分之一，大約 2×10⁸ m/s；電訊號在銅線中約為光速的六到七成，也是 2×10⁸ m/s 的數量級；無線電在空氣中接近 3×10⁸ m/s。本課計算有線媒介時，一律用 2×10⁸ m/s，也就是每公里約 5 微秒。' },
      ],
    },
    {
      id: 'three-numbers', title: '頻寬、吞吐量與延遲：三個不同的數字',
      blocks: [
        { type: 'p', text: '頻寬（bandwidth）是鏈路每秒最多能送出的位元數，單位是 bit/s，是規格或合約上的上限，例如 100 Mbit/s 的乙太網路。吞吐量（throughput）是實際每秒成功送達的資料量，會被協定標頭、重送、和別人共用線路以及路徑上最慢的一段拉低，所以不會超過頻寬。延遲（latency）則是時間：一個位元或封包從一端到另一端要多久，單位是秒或毫秒。' },
        { type: 'table', head: ['數字', '問的問題', '單位', '比喻（高速公路）'], rows: [
          ['頻寬', '每秒最多能送出多少位元？', 'bit/s（Mbit/s、Gbit/s）', '車道數決定的每秒最大車流'],
          ['吞吐量', '實際每秒送到多少資料？', 'bit/s 或 byte/s', '實際每秒通過收費站的車輛數'],
          ['延遲', '一個封包要多久才到？', 's、ms', '一台車從入口開到出口要多久'],
        ] },
        { type: 'p', text: '單位要特別小心。網路速率用十進位前綴：1 kbit/s = 10³ bit/s，1 Mbit/s = 10⁶ bit/s，1 Gbit/s = 10⁹ bit/s；常見的 Mbps 就是 Mbit/s。檔案大小用位元組（byte，1 byte = 8 bit）：本課的 1 MB = 10⁶ 位元組；作業系統常顯示的 MiB 是 2²⁰ = 1,048,576 位元組，比 MB 大約 4.9%。換算時先把位元組乘以 8 變成位元，再除以頻寬。' },
        { type: 'callout', tone: 'warning', title: '「100 Mbps 就是每秒 100 MB」', text: '小寫 b 是位元，大寫 B 是位元組。100 Mbit/s 每秒最多送 10⁸ 位元，也就是 1.25×10⁷ 位元組 = 12.5 MB。所以在 100 Mbps 的網路上下載 100 MB 的檔案，最快也要 8 秒，不是 1 秒；再加上標頭與其他開銷，實際的吞吐量還會更低。' },
      ],
    },
    {
      id: 'four-delays', title: '四種延遲：傳輸、傳播、排隊與處理',
      blocks: [
        { type: 'p', text: '一個封包從一個節點送到下一個節點，所花的時間可以拆成四部分。前兩種可以用公式算出來，後兩種隨當下的狀況變動，本課只描述它們，不計算。' },
        { type: 'list', items: [
          '傳輸延遲（transmission delay）＝ 位元數 ÷ 頻寬：把封包的每一個位元推上線路所需的時間。封包越大越久，頻寬越大越快，和距離無關。',
          '傳播延遲（propagation delay）＝ 距離 ÷ 訊號速度：一個位元從線路這頭走到那頭的時間。距離越遠越久，和封包大小、頻寬都無關。',
          '排隊延遲（queuing delay）：封包到達路由器時，輸出線路正在送別的封包，只好在佇列裡等。網路越忙等越久，壅塞時可能從幾乎 0 變成數十毫秒；佇列滿了，新來的封包就會被丟棄。',
          '處理延遲（processing delay）：路由器或交換器檢查標頭、查表決定往哪裡送的時間，現代設備通常在微秒等級。',
        ] },
        { type: 'p', text: '在一條鏈路上，封包的最後一個位元到達對方的時間是傳輸延遲加傳播延遲（再加上排隊與處理）。下面的情境在同一條 100 Mbit/s、2 km 的多模光纖上送兩個大小不同的訊框：傳播延遲都是 0.01 ms，傳輸延遲卻差了 15 倍。' },
        { type: 'example', id: 'cn02-frame-sizes' },
        { type: 'p', text: '如果把 1500 位元組的資料拆成 15 個 100 位元組的訊框，純資料的傳輸時間加起來仍是 0.12 ms；但每個訊框都要有自己的標頭、前導碼與訊框間隔，總共要送的位元變多，整體反而更慢。小訊框的好處是每一個都很快送完，急著送的小訊框不必在一個大訊框後面等太久。' },
        { type: 'callout', tone: 'warning', title: '「頻寬越大，第一個位元就越早到」', text: '頻寬只決定每秒能推出多少位元，不會讓訊號跑得更快。在 2000 km 的光纖上，不管頻寬是 100 Mbit/s 還是 100 Gbit/s，第一個位元都要 2×10⁶ m ÷ 2×10⁸ m/s = 10 ms 才到。提高頻寬能縮短的是傳輸延遲（大檔案送完的時間），縮短不了傳播延遲；要降低傳播延遲，只能縮短距離，例如把伺服器放到離使用者近的地方。' },
      ],
    },
    {
      id: 'worked-example', title: '逐步計算：一個檔案要多久才送完',
      blocks: [
        { type: 'p', text: '題目：一個 10 MB（10×10⁶ 位元組）的檔案，經過一條 100 Mbit/s、3000 km 的光纖送到對方，不計排隊與處理延遲，最後一個位元何時到？把檔案看成連續送出的位元流：拆成許多封包時，後面的封包在前面的封包還在路上時就已經開始送，所以傳播延遲只算一次。' },
        { type: 'list', ordered: true, items: [
          '換成位元：10×10⁶ 位元組 × 8 = 8×10⁷ 位元。',
          '傳輸延遲：8×10⁷ 位元 ÷ 10⁸ bit/s = 0.8 s = 800 ms。',
          '傳播延遲：3×10⁶ m ÷ 2×10⁸ m/s = 0.015 s = 15 ms。',
          '總時間：800 ms + 15 ms = 815 ms，主要是傳輸延遲。',
          '如果換成 1 Gbit/s：傳輸延遲變成 80 ms，總時間 95 ms；傳播延遲仍是 15 ms，已經占了將近六分之一。頻寬越大，距離帶來的延遲就越顯眼。',
        ] },
        { type: 'table', head: ['情況', '傳輸延遲', '傳播延遲', '總時間', '主要是'], rows: [
          ['10 MB，100 Mbit/s，3000 km', '800 ms', '15 ms', '815 ms', '傳輸延遲'],
          ['10 MB，1 Gbit/s，3000 km', '80 ms', '15 ms', '95 ms', '傳輸延遲（傳播已不可忽略）'],
          ['1500 位元組，1 Gbit/s，4000 km', '0.012 ms', '20 ms', '20.012 ms', '傳播延遲'],
        ] },
        { type: 'p', text: '最後一列就是下一節的跨洲情境：小封包走長距離，幾乎所有時間都花在路上。這時不論把頻寬加大多少，一次往返都不會少於 40 ms。算題時先統一單位：位元組乘以 8、公里換成公尺、秒乘以 1000 換成毫秒，最後再相加。' },
      ],
    },
    {
      id: 'rtt-bdp', title: 'RTT 與頻寬延遲乘積：管線裡裝得下多少位元',
      blocks: [
        { type: 'p', text: 'RTT（round-trip time，往返時間）是從送出一個封包到收到對方回應所經過的時間：去程延遲、對方的處理時間與回程延遲的和。很多動作都至少要等一個 RTT：建立連線、請求一個網頁、確認對方收到資料。`ping` 指令量到的就是 RTT。下面的情境把用戶端到 4000 km 外伺服器的路徑簡化成一條 1 Gbit/s 的光纖。' },
        { type: 'example', id: 'cn02-long-haul' },
        { type: 'p', text: '把鏈路想成一條水管：頻寬是管子的粗細，延遲是管子的長度。頻寬延遲乘積（bandwidth-delay product）＝ 頻寬 × 延遲，就是管子的容量。用單程傳播延遲算，是同一時刻正在線路上的位元數；用 RTT 算，是傳送端在收到第一個回應之前必須送出的資料量。以這個情境來說，1 Gbit/s × 20 ms = 2×10⁷ 位元正在單程的光纖裡；1 Gbit/s × 40 ms = 4×10⁷ 位元 = 5×10⁶ 位元組（5 MB）。' },
        { type: 'callout', tone: 'tip', title: '為什麼要在意管線容量', text: '如果傳送端每送出 64 KiB（65,536 位元組）就停下來等確認，在 RTT 40 ms 的路徑上，每 40 ms 最多只送 64 KiB，吞吐量約 65,536 × 8 ÷ 0.04 s ≈ 13 Mbit/s，遠低於 1 Gbit/s。要填滿管線，路上未確認的資料至少要有頻寬延遲乘積那麼多；之後談 TCP 時會再遇到這個問題。' },
      ],
    },
    {
      id: 'bottleneck', title: '瓶頸鏈路：最慢的一段決定吞吐量',
      blocks: [
        { type: 'p', text: '真實的路徑由好幾段鏈路串起來。把一個大檔案拆成許多封包連續送出時，每一段都要把每個封包送一次；速率最慢的那一段每秒只能放行那麼多位元，前面的鏈路再快，也只會讓封包在它前面排隊。所以端到端吞吐量的上限是路徑上最小的頻寬，這一段叫瓶頸鏈路（bottleneck link）。' },
        { type: 'example', id: 'cn02-bottleneck' },
        { type: 'p', text: '判斷瓶頸時，先列出每一段的頻寬（線路和別人共用時，要用分給你的那一份），再取最小值。在這個情境裡，伺服器到 ISP 是 1 Gbit/s，ISP 到你家是 20 Mbit/s，瓶頸在接取線路，吞吐量最多 20 Mbit/s。這時升級伺服器那一端的光纖完全沒有幫助，升級家裡的線路才有用。反過來，如果你家是 1 Gbit/s，而伺服器對外只有 1 Gbit/s、同時服務一千個人，平均分到的 1 Mbit/s 才是瓶頸。' },
        { type: 'table', head: ['鏈路', '頻寬', '10 MB 需要的傳輸時間'], rows: [
          ['伺服器 → ISP（光纖，50 km）', '1 Gbit/s', '80 ms'],
          ['ISP → 你家（VDSL2，2 km）', '20 Mbit/s', '4000 ms'],
          ['整條路徑', '取最小值：20 Mbit/s', '約 4000 ms，再加上約 0.26 ms 的傳播延遲'],
        ] },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    { id: 'q-mbps', prompt: '網路標示的下載速度是 100 Mbps。理想情況下（不計標頭與延遲），下載一個 100 MB（10⁸ 位元組）的檔案最少要多久？',
      options: ['1 秒', '8 秒', '0.125 秒', '100 秒'], answer: 1,
      explanation: '10⁸ 位元組 × 8 = 8×10⁸ 位元，除以 10⁸ bit/s 得 8 秒。1 秒是把 Mbps 當成每秒 MB，忘了乘以 8；0.125 秒是把乘以 8 錯當成除以 8；100 秒則是把頻寬當成 1 MB/s 來算，單位也弄錯了。' },
    { id: 'q-first-bit', prompt: '一條 2000 km 的光纖從 100 Mbit/s 升級到 1 Gbit/s。對方收到第一個位元所需的時間會怎樣？',
      options: ['縮短為原來的十分之一', '縮短一半', '變得更長', '幾乎不變，仍約 10 ms'], answer: 3,
      explanation: '第一個位元到達的時間是傳播延遲：2×10⁶ m ÷ 2×10⁸ m/s = 10 ms，只和距離與訊號速度有關。頻寬變成十倍，只會讓整個封包推上線路的傳輸延遲變成十分之一，不會讓訊號跑得更快，也不會變長。' },
    { id: 'q-bdp', prompt: '一條路徑的頻寬是 1 Gbit/s、RTT 是 40 ms。以 RTT 計算的頻寬延遲乘積是多少？',
      options: ['4×10⁷ 位元，約 5 MB', '4×10⁴ 位元，約 5 KB', '25 Mbit', '40 Gbit'], answer: 0,
      explanation: '10⁹ bit/s × 0.04 s = 4×10⁷ 位元，除以 8 是 5×10⁶ 位元組，也就是 5 MB。4×10⁴ 位元是把 40 ms 當成 0.04 ms；40 Gbit 是把 40 ms 當成 40 秒；25 Mbit 是用頻寬除以 RTT，乘積不是商。' },
    { id: 'q-bottleneck', prompt: '伺服器經 1 Gbit/s 的光纖連到 ISP，ISP 再經 20 Mbit/s 的接取線路連到你家，沒有其他人共用。你下載的吞吐量上限最接近多少？',
      options: ['1 Gbit/s', '510 Mbit/s（兩段的平均）', '20 Mbit/s', '1.02 Gbit/s（兩段相加）'], answer: 2,
      explanation: '每個封包都要經過兩段，最慢的 20 Mbit/s 接取線路每秒只能放行 2×10⁷ 位元，前面的光纖再快，封包也只會在 ISP 的佇列裡等。吞吐量取路徑上的最小頻寬，不是平均或相加，更不是最快那一段。' },
    { id: 'q-media', prompt: '哪一種媒介不受電磁干擾，而且最適合跨海、數千公里的長距離骨幹傳輸？',
      options: ['雙絞線', '光纖', 'Wi-Fi 無線電', '家用電話線'], answer: 1,
      explanation: '光纖用光脈衝傳送，不受電磁干擾，單模光纖加上光放大器可以跨洋。雙絞線與電話線都是銅線上的電訊號，會受干擾，乙太網路一段只有 100 m；Wi-Fi 只有數十公尺，而且頻道是共用的。' },
    { id: 'q-two-delays', prompt: '關於傳輸延遲與傳播延遲，哪一句正確？',
      options: ['傳輸延遲取決於封包大小與頻寬，傳播延遲取決於距離與訊號速度', '兩者都取決於封包大小', '傳播延遲取決於頻寬，頻寬越大越短', '傳輸延遲取決於距離，距離越遠越長'], answer: 0,
      explanation: '傳輸延遲 = 位元數 ÷ 頻寬，是把位元推上線路的時間；傳播延遲 = 距離 ÷ 訊號速度，是位元在線路上走的時間。傳播延遲和封包大小、頻寬都無關，傳輸延遲則和距離無關，所以其他三句都把兩者弄混了。' },
    { id: 'q-rtt', prompt: '用戶端與伺服器之間是 3000 km 的光纖。用戶端送出一個很小的請求，伺服器立刻回應一個很小的封包，不計排隊與處理延遲。RTT 最接近多少？',
      options: ['15 ms', '7.5 ms', '45 ms', '30 ms'], answer: 3,
      explanation: '單程傳播延遲 = 3×10⁶ m ÷ 2×10⁸ m/s = 15 ms；小封包的傳輸延遲可以忽略。RTT 是去程加回程，約 30 ms。15 ms 只算了單程，7.5 ms 把單程又除以 2，45 ms 則多算了一趟。' },
    { id: 'q-queue', prompt: '平常 RTT 穩定在 20 ms，晚上網路很多人使用時，同一條路徑的 RTT 跳到 80 ms。最主要是哪一種延遲增加了？',
      options: ['傳播延遲', '傳輸延遲', '排隊延遲', '處理延遲'], answer: 2,
      explanation: '路徑長度沒變，傳播延遲不會變；頻寬與封包大小沒變，傳輸延遲也不變；處理延遲通常是微秒等級。多出來的 60 ms 是封包在壅塞的路由器佇列裡等待的排隊延遲，它隨網路忙碌程度變動。' },
  ],
  network: {
    scenes: [frameSizes, longHaul, bottleneck],
    exercises: [
      { id: 'cn02-ex-campus', task: 'delay', bytes: 1500, bandwidth: 100e6, distance: 5000, title: '園區光纖上的一個訊框',
        statement: '一個 1500 位元組的訊框，在 100 Mbit/s、5 km 的光纖上傳送（訊號速度 2×10⁸ m/s）。傳輸延遲、傳播延遲與總延遲各是多少毫秒？不計排隊與處理延遲。',
        hints: ['先把 1500 位元組乘以 8 換成位元。', '1 Mbit/s = 10⁶ bit/s；算出秒數之後乘以 1000 換成毫秒。', '5 km = 5000 m。'],
        explanation: '傳輸延遲 = 1500 × 8 ÷ 10⁸ = 1.2×10⁻⁴ s = 0.12 ms；傳播延遲 = 5000 ÷ (2×10⁸) = 2.5×10⁻⁵ s = 0.025 ms；總延遲 = 0.12 + 0.025 = 0.145 ms。距離只有 5 km 時，傳輸延遲是主要部分。',
        mistakes: [
          { answer: { transmission: '0.015', propagation: '0.025', total: '0.04' }, why: '忘了把位元組乘以 8：頻寬的單位是位元每秒，1500 位元組是 12000 位元。' },
          { answer: { transmission: '0.00012', propagation: '0.000025', total: '0.000145' }, why: '算出來的是秒，沒有乘以 1000 換成題目要的毫秒。' },
        ] },
      { id: 'cn02-ex-long-haul', task: 'delay', bytes: 1500, bandwidth: 1e9, distance: 2_500_000, title: '長途光纖上的一個封包',
        statement: '一個 1500 位元組的封包，經過一條 1 Gbit/s、2500 km 的長途光纖（訊號速度 2×10⁸ m/s）。傳輸延遲、傳播延遲與總延遲各是多少毫秒？不計排隊與處理延遲。',
        hints: ['傳輸延遲只看封包大小與頻寬：12000 位元 ÷ 10⁹ bit/s。', '2500 km = 2.5×10⁶ m。', '兩個延遲都換成毫秒後再相加，並比較哪一個占了大部分。'],
        explanation: '傳輸延遲 = 12000 ÷ 10⁹ = 1.2×10⁻⁵ s = 0.012 ms；傳播延遲 = 2.5×10⁶ ÷ (2×10⁸) = 0.0125 s = 12.5 ms；總延遲 = 12.512 ms。傳播延遲是傳輸延遲的一千多倍，頻寬再加大也只能省下那 0.012 ms。',
        mistakes: [
          { answer: { transmission: '0.012', propagation: '8.333', total: '8.345' }, why: '用了真空中的光速 3×10⁸ m/s：光在光纖的玻璃裡只有約 2×10⁸ m/s。' },
          { answer: { transmission: '0.012', propagation: '0.0125', total: '0.0245' }, why: '傳播延遲算出 0.0125 秒後忘了換成毫秒，就和以毫秒計的傳輸延遲相加，混用了 s 與 ms。' },
        ] },
      { id: 'cn02-ex-bottleneck', task: 'delay', bytes: 10_000_000, bandwidth: 20e6, distance: 52_000, title: '經過瓶頸下載 10 MB',
        statement: '伺服器經 50 km、1 Gbit/s 的光纖連到 ISP，ISP 再經 2 km、20 Mbit/s 的接取線路連到你家。你下載一個 10 MB（10×10⁶ 位元組）的檔案。把檔案看成以瓶頸鏈路的速率連續送出，傳播距離是整條路徑的 52 km（訊號速度 2×10⁸ m/s），不計標頭、排隊與處理延遲，也忽略最後一個封包在光纖段的傳輸時間。傳輸延遲、傳播延遲與總延遲各是多少毫秒？',
        hints: ['先找瓶頸：兩段之中頻寬較小的是哪一段？', '傳輸延遲用瓶頸的頻寬算：8×10⁷ 位元 ÷ 頻寬。', '傳播延遲用兩段距離的和：52 km = 52000 m。'],
        explanation: '瓶頸是 20 Mbit/s 的接取線路，快的光纖段只會讓封包在 ISP 的佇列裡等。傳輸延遲 = 10⁷ × 8 ÷ (2×10⁷) = 4 s = 4000 ms；傳播延遲 = 52000 ÷ (2×10⁸) = 2.6×10⁻⁴ s = 0.26 ms；總延遲 = 4000.26 ms，約 4 秒。',
        mistakes: [
          { answer: { transmission: '80', propagation: '0.26', total: '80.26' }, why: '用了光纖段的 1 Gbit/s：整條路徑的吞吐量由最慢的一段決定，不是最快的一段。' },
          { answer: { transmission: '4194.304', propagation: '0.26', total: '4194.564' }, why: '把 10 MB 當成 10 MiB（10×2²⁰ = 10,485,760 位元組）：題目的 MB 是 10⁶ 位元組。' },
        ] },
      { id: 'cn02-ex-phy-layer', task: 'layer', scene: 'cn02-frame-sizes', protocol: '100BASE-FX', title: '100BASE-FX 在哪一層',
        statement: '在「同一條光纖上的大訊框與小訊框」情境中，標頭名稱為 100BASE-FX 的那一部分，在 OSI 七層模型裡屬於哪一層？',
        hints: ['看它的欄位：媒介、訊號、位元數、傳播延遲，都和位址或訊框格式無關。', '乙太網路標準同時規定了訊框格式與線路上的訊號，這兩部分分屬不同的層。'],
        explanation: '100BASE-FX 是乙太網路標準中「用多模光纖、以光脈衝送 100 Mbit/s」的部分，只負責把位元變成訊號、再還原成位元，所以在實體層。訊框的 MAC 位址與格式由資料鏈結層的 Ethernet 標頭負責。',
        mistakes: [{ answer: { layer: 'link' }, why: '看到「乙太網路」就認定是資料鏈結層：MAC 位址與訊框格式屬於資料鏈結層，媒介與訊號的規格屬於實體層。' }] },
    ],
  },
};
