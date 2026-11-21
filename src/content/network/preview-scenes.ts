import type { NetworkExercise } from '@/content/curriculum/schema';
import type { NetworkScene } from '@/lib/network/model';

/*
 * CN-0 (2026-11-21): reference scenes of the network-protocol capability. They are the test data of the capability
 * (tests/network-capability.test.ts, e2e/network-protocol.spec.ts) and the example CN lessons are written after; they
 * are shown only on /preview/network-protocol, which is built only with LOGIC_ISLAND_NETWORK_PREVIEW=1 outside Vercel
 * Production (src/lib/network/preview.ts). Addresses are the documentation ranges of RFC 5737 (192.0.2.0/24 and
 * 203.0.113.0/24) and locally administered MAC addresses (02:…), so nothing names a real host.
 */

const MAC = { laptop: '02:00:00:00:00:0a', r1In: '02:00:00:00:00:01', r1Out: '02:00:00:00:01:01', server: '02:00:00:00:01:50', b: '02:00:00:00:00:0b' };

/** One HTTP request and its response across a router: IP addresses stay, MAC addresses change per link, TTL drops. */
export const httpThroughRouter: NetworkScene = {
  id: 'preview-http-router', title: '一個 HTTP 請求經過路由器', model: 'tcp-ip',
  description: '筆電（192.0.2.10）向另一個網路上的伺服器（203.0.113.80）要一個網頁，中間經過一台路由器。看每一段鏈路上，哪些標頭欄位不變、哪些被路由器改寫。',
  nodes: [
    { id: 'laptop', label: '筆電', kind: 'host', addresses: ['IP 192.0.2.10', `MAC ${MAC.laptop}`] },
    { id: 'r1', label: '路由器 R1', kind: 'router', addresses: ['eth0 192.0.2.1', 'eth1 203.0.113.1'] },
    { id: 'server', label: '網頁伺服器', kind: 'server', addresses: ['IP 203.0.113.80', `MAC ${MAC.server}`] },
  ],
  messages: [
    { id: 'req-1', from: 'laptop', to: 'r1', label: 'HTTP GET（第一段）', payload: 'GET /index.html HTTP/1.1\nHost: example.com',
      note: '筆電把請求一層一層包起來：HTTP 交給 TCP（目的連接埠 80），TCP 區段交給 IP（目的位址是伺服器），IP 封包再包進乙太網路訊框。伺服器不在同一個網路，所以訊框的目的 MAC 是預設閘道 R1，不是伺服器。',
      headers: [
        { layer: 'application', protocol: 'HTTP/1.1', fields: [{ name: '方法', value: 'GET' }, { name: '路徑', value: '/index.html' }, { name: 'Host', value: 'example.com' }] },
        { layer: 'transport', protocol: 'TCP', fields: [{ name: '來源連接埠', value: '51000' }, { name: '目的連接埠', value: '80' }, { name: '旗標', value: 'PSH, ACK' }, { name: 'Seq', value: '1001' }, { name: 'Ack', value: '5001' }] },
        { layer: 'network', protocol: 'IPv4', fields: [{ name: '來源 IP', value: '192.0.2.10' }, { name: '目的 IP', value: '203.0.113.80' }, { name: 'TTL', value: '64' }, { name: '協定', value: '6（TCP）' }] },
        { layer: 'link', protocol: 'Ethernet', fields: [{ name: '來源 MAC', value: MAC.laptop }, { name: '目的 MAC', value: MAC.r1In }, { name: 'EtherType', value: '0x0800（IPv4）' }] },
      ] },
    { id: 'req-2', from: 'r1', to: 'server', label: 'HTTP GET（第二段）', payload: 'GET /index.html HTTP/1.1\nHost: example.com',
      note: 'R1 拆掉舊的乙太網路標頭，依目的 IP 查路由表，從另一個介面送出：來源與目的 IP 不變，TTL 減 1 變成 63，新的訊框換成 R1 出口介面與伺服器的 MAC。TCP 與 HTTP 的內容路由器不需要看，也不會改。',
      headers: [
        { layer: 'application', protocol: 'HTTP/1.1', fields: [{ name: '方法', value: 'GET' }, { name: '路徑', value: '/index.html' }, { name: 'Host', value: 'example.com' }] },
        { layer: 'transport', protocol: 'TCP', fields: [{ name: '來源連接埠', value: '51000' }, { name: '目的連接埠', value: '80' }, { name: '旗標', value: 'PSH, ACK' }, { name: 'Seq', value: '1001' }, { name: 'Ack', value: '5001' }] },
        { layer: 'network', protocol: 'IPv4', fields: [{ name: '來源 IP', value: '192.0.2.10' }, { name: '目的 IP', value: '203.0.113.80' }, { name: 'TTL', value: '63' }, { name: '協定', value: '6（TCP）' }] },
        { layer: 'link', protocol: 'Ethernet', fields: [{ name: '來源 MAC', value: MAC.r1Out }, { name: '目的 MAC', value: MAC.server }, { name: 'EtherType', value: '0x0800（IPv4）' }] },
      ],
      tables: [{ node: 'r1', name: '路由表', head: ['目的網路', '下一站', '介面'], rows: [['192.0.2.0/24', '直接連接', 'eth0'], ['203.0.113.0/24', '直接連接', 'eth1'], ['0.0.0.0/0', '203.0.113.254', 'eth1']] }] },
    { id: 'res-1', from: 'server', to: 'r1', label: 'HTTP 200 OK（第一段）', payload: 'HTTP/1.1 200 OK\nContent-Type: text/html',
      note: '請求帶了 100 位元組的資料（Seq 1001 起），所以伺服器的回應確認到 1101：Ack 是下一個期待收到的位元組編號。來源與目的連接埠、IP 位址都和請求相反。',
      headers: [
        { layer: 'application', protocol: 'HTTP/1.1', fields: [{ name: '狀態碼', value: '200 OK' }, { name: 'Content-Type', value: 'text/html' }] },
        { layer: 'transport', protocol: 'TCP', fields: [{ name: '來源連接埠', value: '80' }, { name: '目的連接埠', value: '51000' }, { name: '旗標', value: 'PSH, ACK' }, { name: 'Seq', value: '5001' }, { name: 'Ack', value: '1101' }] },
        { layer: 'network', protocol: 'IPv4', fields: [{ name: '來源 IP', value: '203.0.113.80' }, { name: '目的 IP', value: '192.0.2.10' }, { name: 'TTL', value: '64' }, { name: '協定', value: '6（TCP）' }] },
        { layer: 'link', protocol: 'Ethernet', fields: [{ name: '來源 MAC', value: MAC.server }, { name: '目的 MAC', value: MAC.r1Out }, { name: 'EtherType', value: '0x0800（IPv4）' }] },
      ] },
    { id: 'res-2', from: 'r1', to: 'laptop', label: 'HTTP 200 OK（第二段）', payload: 'HTTP/1.1 200 OK\nContent-Type: text/html',
      note: '回程同樣在 R1 換上新的乙太網路標頭、TTL 減 1。筆電依目的連接埠 51000 把資料交給發出請求的瀏覽器分頁。',
      headers: [
        { layer: 'application', protocol: 'HTTP/1.1', fields: [{ name: '狀態碼', value: '200 OK' }, { name: 'Content-Type', value: 'text/html' }] },
        { layer: 'transport', protocol: 'TCP', fields: [{ name: '來源連接埠', value: '80' }, { name: '目的連接埠', value: '51000' }, { name: '旗標', value: 'PSH, ACK' }, { name: 'Seq', value: '5001' }, { name: 'Ack', value: '1101' }] },
        { layer: 'network', protocol: 'IPv4', fields: [{ name: '來源 IP', value: '203.0.113.80' }, { name: '目的 IP', value: '192.0.2.10' }, { name: 'TTL', value: '63' }, { name: '協定', value: '6（TCP）' }] },
        { layer: 'link', protocol: 'Ethernet', fields: [{ name: '來源 MAC', value: MAC.r1In }, { name: '目的 MAC', value: MAC.laptop }, { name: 'EtherType', value: '0x0800（IPv4）' }] },
      ] },
  ],
};

/** The three-way handshake, with the first SYN lost and sent again after a timeout. */
export const tcpHandshake: NetworkScene = {
  id: 'preview-tcp-handshake', title: 'TCP 三向交握（第一個 SYN 遺失）', model: 'tcp-ip',
  description: '用戶端要和伺服器的 443 連接埠建立 TCP 連線。第一個 SYN 在路上遺失，用戶端等到逾時才重送；之後三個區段完成交握，雙方都知道對方的起始序號。',
  nodes: [
    { id: 'client', label: '用戶端', kind: 'host', addresses: ['192.0.2.10:51000'] },
    { id: 'server', label: '伺服器', kind: 'server', addresses: ['203.0.113.80:443'] },
  ],
  messages: [
    { id: 'syn-lost', from: 'client', to: 'server', label: 'SYN', lost: true,
      note: '用戶端選了起始序號 1000，送出只有 SYN 旗標的區段。這個區段遺失了，伺服器什麼都沒收到；用戶端的重送計時器開始計時。',
      headers: [
        { layer: 'transport', protocol: 'TCP', fields: [{ name: '來源連接埠', value: '51000' }, { name: '目的連接埠', value: '443' }, { name: '旗標', value: 'SYN' }, { name: 'Seq', value: '1000' }] },
        { layer: 'network', protocol: 'IPv4', fields: [{ name: '來源 IP', value: '192.0.2.10' }, { name: '目的 IP', value: '203.0.113.80' }] },
      ] },
    { id: 'syn', from: 'client', to: 'server', label: 'SYN（重送）',
      note: '逾時後用戶端重送同一個 SYN：序號還是 1000，因為第一個 SYN 從來沒有被確認。',
      headers: [
        { layer: 'transport', protocol: 'TCP', fields: [{ name: '來源連接埠', value: '51000' }, { name: '目的連接埠', value: '443' }, { name: '旗標', value: 'SYN' }, { name: 'Seq', value: '1000' }] },
        { layer: 'network', protocol: 'IPv4', fields: [{ name: '來源 IP', value: '192.0.2.10' }, { name: '目的 IP', value: '203.0.113.80' }] },
      ] },
    { id: 'syn-ack', from: 'server', to: 'client', label: 'SYN, ACK',
      note: '伺服器選了自己的起始序號 5000，同時確認用戶端的 SYN：SYN 本身占一個序號，所以 Ack 是 1000 + 1 = 1001。',
      headers: [
        { layer: 'transport', protocol: 'TCP', fields: [{ name: '來源連接埠', value: '443' }, { name: '目的連接埠', value: '51000' }, { name: '旗標', value: 'SYN, ACK' }, { name: 'Seq', value: '5000' }, { name: 'Ack', value: '1001' }] },
        { layer: 'network', protocol: 'IPv4', fields: [{ name: '來源 IP', value: '203.0.113.80' }, { name: '目的 IP', value: '192.0.2.10' }] },
      ] },
    { id: 'ack', from: 'client', to: 'server', label: 'ACK',
      note: '用戶端確認伺服器的 SYN（Ack 5001），自己的序號前進到 1001。交握完成，連線進入 ESTABLISHED，之後的資料從序號 1001 開始。',
      headers: [
        { layer: 'transport', protocol: 'TCP', fields: [{ name: '來源連接埠', value: '51000' }, { name: '目的連接埠', value: '443' }, { name: '旗標', value: 'ACK' }, { name: 'Seq', value: '1001' }, { name: 'Ack', value: '5001' }] },
        { layer: 'network', protocol: 'IPv4', fields: [{ name: '來源 IP', value: '192.0.2.10' }, { name: '目的 IP', value: '203.0.113.80' }] },
      ] },
  ],
};

/** A switch learns where each MAC address is from the frames it sees (OSI model; the ARP message is the frame's data). */
export const switchLearning: NetworkScene = {
  id: 'preview-switch-learning', title: '交換器學習 MAC 位址', model: 'osi',
  description: '主機 A 要和同一個區域網路的主機 B 通訊，只知道 B 的 IP。看 ARP 請求與回覆經過交換器時，交換器的 MAC 位址表怎麼長出來。',
  nodes: [
    { id: 'a', label: '主機 A', kind: 'host', addresses: ['192.0.2.10', MAC.laptop] },
    { id: 'sw', label: '交換器', kind: 'switch', addresses: ['A 接 1 號埠，B 接 2 號埠'] },
    { id: 'b', label: '主機 B', kind: 'host', addresses: ['192.0.2.20', MAC.b] },
  ],
  messages: [
    { id: 'arp-req', from: 'a', to: 'sw', label: 'ARP 請求（廣播）', payload: 'ARP 請求：誰是 192.0.2.20？請告訴 192.0.2.10',
      note: 'A 不知道 B 的 MAC，用廣播位址 ff:ff:ff:ff:ff:ff 送出 ARP 請求。交換器從 1 號埠收到這個訊框，記下「來源 MAC 在 1 號埠」。',
      headers: [{ layer: 'link', protocol: 'Ethernet', fields: [{ name: '來源 MAC', value: MAC.laptop }, { name: '目的 MAC', value: 'ff:ff:ff:ff:ff:ff' }, { name: 'EtherType', value: '0x0806（ARP）' }] }],
      tables: [{ node: 'sw', name: 'MAC 位址表', head: ['MAC 位址', '連接埠'], rows: [[MAC.laptop, '1']], changed: [0] }] },
    { id: 'arp-flood', from: 'sw', to: 'b', label: 'ARP 請求（轉送）', payload: 'ARP 請求：誰是 192.0.2.20？請告訴 192.0.2.10',
      note: '廣播訊框要送到所有埠（來源埠除外），所以 B 收到了。交換器只轉送，不改訊框內容。',
      headers: [{ layer: 'link', protocol: 'Ethernet', fields: [{ name: '來源 MAC', value: MAC.laptop }, { name: '目的 MAC', value: 'ff:ff:ff:ff:ff:ff' }, { name: 'EtherType', value: '0x0806（ARP）' }] }],
      tables: [{ node: 'sw', name: 'MAC 位址表', head: ['MAC 位址', '連接埠'], rows: [[MAC.laptop, '1']] }] },
    { id: 'arp-reply', from: 'b', to: 'sw', label: 'ARP 回覆（單播）', payload: `ARP 回覆：192.0.2.20 的 MAC 是 ${MAC.b}`,
      note: 'B 直接回覆給 A 的 MAC。交換器從 2 號埠收到，記下 B 的 MAC 在 2 號埠；目的 MAC 已經在表裡（1 號埠），所以只送往 1 號埠，不再廣播。',
      headers: [{ layer: 'link', protocol: 'Ethernet', fields: [{ name: '來源 MAC', value: MAC.b }, { name: '目的 MAC', value: MAC.laptop }, { name: 'EtherType', value: '0x0806（ARP）' }] }],
      tables: [{ node: 'sw', name: 'MAC 位址表', head: ['MAC 位址', '連接埠'], rows: [[MAC.laptop, '1'], [MAC.b, '2']], changed: [1] }] },
    { id: 'arp-deliver', from: 'sw', to: 'a', label: 'ARP 回覆（轉送）', payload: `ARP 回覆：192.0.2.20 的 MAC 是 ${MAC.b}`,
      note: 'A 收到回覆，把「192.0.2.20 → B 的 MAC」放進自己的 ARP 快取；之後送給 B 的 IP 封包就用這個 MAC 當目的位址。',
      headers: [{ layer: 'link', protocol: 'Ethernet', fields: [{ name: '來源 MAC', value: MAC.b }, { name: '目的 MAC', value: MAC.laptop }, { name: 'EtherType', value: '0x0806（ARP）' }] }],
      tables: [{ node: 'a', name: 'ARP 快取', head: ['IP 位址', 'MAC 位址'], rows: [['192.0.2.20', MAC.b]], changed: [0] }] },
  ],
};

export const previewScenes: NetworkScene[] = [httpThroughRouter, tcpHandshake, switchLearning];

export const previewExercises: NetworkExercise[] = [
  { id: 'preview-ttl', task: 'field', scene: 'preview-http-router', message: 'req-2', layer: 'network', field: 'TTL', title: '經過路由器後的 TTL',
    statement: '在「一個 HTTP 請求經過路由器」的第二段，伺服器收到的 IP 封包的 TTL 是多少？',
    hints: ['筆電送出時 TTL 是 64。', '每經過一台路由器，TTL 減 1。'],
    explanation: '筆電送出時 TTL 是 64，R1 轉送時減 1，所以伺服器收到 63。IP 位址不變，乙太網路標頭換新。',
    mistakes: [{ answer: { value: '64' }, why: '以為路由器只轉送、不改任何 IP 欄位：TTL 每經過一台路由器就減 1，避免封包在迴圈裡永遠繞下去。' }] },
  { id: 'preview-layer', task: 'layer', scene: 'preview-tcp-handshake', protocol: 'TCP', title: 'TCP 在哪一層',
    statement: '在 TCP/IP 四層模型裡，交握用的 TCP 標頭屬於哪一層？',
    hints: ['TCP 的連接埠指出資料要交給哪一個行程。'],
    explanation: 'TCP 在傳輸層：它負責兩端行程之間的可靠傳輸（序號、確認、重送），連接埠區分同一台主機上的不同程式。',
    mistakes: [{ answer: { layer: 'network' }, why: '把「連線到另一台主機」當成網路層的工作：找路與定址是 IP（網路層）負責，TCP 在它之上。' }] },
  { id: 'preview-subnet', task: 'subnet', address: '192.0.2.130', prefix: 26, title: '一個 /26 子網路',
    statement: '主機位址 192.0.2.130/26 所在子網路的網路位址、廣播位址與可用主機數各是多少？',
    hints: ['/26 的遮罩是 255.255.255.192，最後一個位元組的區塊大小是 64。', '130 落在 128–191 這一塊。'],
    explanation: '區塊大小 64：130 落在 128–191，所以網路位址 192.0.2.128、廣播位址 192.0.2.191，主機位元 6 個，可用主機 2⁶ − 2 = 62。',
    mistakes: [{ answer: { network: '192.0.2.0', broadcast: '192.0.2.255', hosts: '254' }, why: '把 /26 當成 /24：前綴長度決定主機位元有幾個，/26 只剩 6 個。' }] },
  { id: 'preview-firewall', task: 'firewall', title: '只開放網站的防火牆',
    reference: 'default deny\nallow tcp from any to 203.0.113.80 port 443\nallow tcp from any to any established',
    packets: [
      { label: '外部連 HTTPS', protocol: 'tcp', src: '198.51.100.7', dst: '203.0.113.80', port: 443, state: 'new' },
      { label: '外部連 SSH', protocol: 'tcp', src: '198.51.100.7', dst: '203.0.113.80', port: 22, state: 'new' },
      { label: '回應封包', protocol: 'tcp', src: '198.51.100.7', dst: '203.0.113.80', port: 51000, state: 'established' },
    ],
    statement: '網頁伺服器 203.0.113.80 只對外提供 HTTPS。寫出防火牆規則：預設擋下，只放行連到它 443 埠的新連線，以及已建立連線的回應封包。',
    hints: ['先寫 default deny，再一條一條放行需要的服務。', '回應封包屬於已建立的連線，可以用 established 放行。'],
    explanation: 'default deny 讓沒寫到的都被擋下；allow tcp from any to 203.0.113.80 port 443 放行 HTTPS；allow tcp from any to any established 放行已建立連線的封包。規則的順序或寫法不同也可以，只要每個封包的結果相同。',
    mistakes: [{ answer: { rules: 'default allow' }, why: '預設放行：SSH 這類沒打算開放的服務也會被放行。' }] },
];
