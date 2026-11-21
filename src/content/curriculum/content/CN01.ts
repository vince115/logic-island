import type { NetworkScene } from '@/lib/network/model';
import type { LessonContent } from '../schema';

/*
 * The scenes share one small network: a laptop on 192.0.2.0/24 (with a NAS and a DNS server on the same LAN) and a web
 * server on 198.51.100.0/24 behind router R1. Addresses are the RFC 5737 documentation ranges and the MAC addresses are
 * locally administered (02:…), so nothing names a real host. The DNS scene resolves the name the HTTP scene requests.
 */
const MAC = {
  laptop: '02:00:00:00:00:25', r1Eth0: '02:00:00:00:00:01', r1Eth1: '02:00:00:00:64:01',
  server: '02:00:00:00:64:50', nas: '02:00:00:00:00:50', dns: '02:00:00:00:00:53',
};

/** Section 3–4: one HTTP request through a switch and a router (TCP/IP model). */
const httpThroughSwitchAndRouter: NetworkScene = {
  id: 'cn01-http-router', title: 'HTTP 請求經過交換器與路由器', model: 'tcp-ip',
  description: '筆電（192.0.2.25）向另一個網路上的網頁伺服器 www.example.com（198.51.100.80）要 /index.html。訊框先經過同一個區域網路的交換器，再經過路由器 R1。逐步看每一台設備讀了哪一層的標頭、改寫了哪些欄位。',
  nodes: [
    { id: 'laptop', label: '筆電', kind: 'host', addresses: ['IP 192.0.2.25', `MAC ${MAC.laptop}`] },
    { id: 'sw', label: '交換器', kind: 'switch', addresses: ['依 MAC 位址轉送'] },
    { id: 'r1', label: '路由器 R1', kind: 'router', addresses: [`eth0 192.0.2.1／${MAC.r1Eth0}`, `eth1 198.51.100.1／${MAC.r1Eth1}`] },
    { id: 'server', label: '網頁伺服器', kind: 'server', addresses: ['IP 198.51.100.80', `MAC ${MAC.server}`] },
  ],
  messages: [
    { id: 'http-1', from: 'laptop', to: 'sw', label: 'HTTP GET（筆電送出）', payload: 'GET /index.html HTTP/1.1\nHost: www.example.com',
      note: '筆電把請求由上往下封裝：瀏覽器產生 HTTP 請求（應用層的訊息），TCP 加上連接埠成為區段（目的連接埠 80），IPv4 加上兩端的 IP 位址成為封包（目的 IP 是伺服器），Ethernet 再包成訊框。伺服器不在 192.0.2.0/24 裡，筆電要把封包交給預設閘道，所以訊框的目的 MAC 是 R1 eth0 的 MAC，不是伺服器的 MAC。',
      headers: [
        { layer: 'application', protocol: 'HTTP/1.1', fields: [{ name: '方法', value: 'GET' }, { name: '路徑', value: '/index.html' }, { name: 'Host', value: 'www.example.com' }] },
        { layer: 'transport', protocol: 'TCP', fields: [{ name: '來源連接埠', value: '50312' }, { name: '目的連接埠', value: '80' }, { name: 'Seq', value: '1001' }, { name: 'Ack', value: '7001' }, { name: '旗標', value: 'PSH, ACK' }] },
        { layer: 'network', protocol: 'IPv4', fields: [{ name: '來源 IP', value: '192.0.2.25' }, { name: '目的 IP', value: '198.51.100.80' }, { name: 'TTL', value: '64' }, { name: '協定', value: '6（TCP）' }] },
        { layer: 'link', protocol: 'Ethernet', fields: [{ name: '目的 MAC', value: MAC.r1Eth0 }, { name: '來源 MAC', value: MAC.laptop }, { name: 'EtherType', value: '0x0800（IPv4）' }] },
      ] },
    { id: 'http-2', from: 'sw', to: 'r1', label: 'HTTP GET（交換器轉送）', payload: 'GET /index.html HTTP/1.1\nHost: www.example.com',
      note: '交換器只讀 Ethernet 標頭：依目的 MAC（R1 eth0）查自己的 MAC 位址表，從接著 R1 的埠送出，並順便記下來源 MAC 在哪個埠。整個訊框一個位元都沒有改：IP、TCP、HTTP 交換器都不看，所以每一層的值和上一步完全相同。',
      headers: [
        { layer: 'application', protocol: 'HTTP/1.1', fields: [{ name: '方法', value: 'GET' }, { name: '路徑', value: '/index.html' }, { name: 'Host', value: 'www.example.com' }] },
        { layer: 'transport', protocol: 'TCP', fields: [{ name: '來源連接埠', value: '50312' }, { name: '目的連接埠', value: '80' }, { name: 'Seq', value: '1001' }, { name: 'Ack', value: '7001' }, { name: '旗標', value: 'PSH, ACK' }] },
        { layer: 'network', protocol: 'IPv4', fields: [{ name: '來源 IP', value: '192.0.2.25' }, { name: '目的 IP', value: '198.51.100.80' }, { name: 'TTL', value: '64' }, { name: '協定', value: '6（TCP）' }] },
        { layer: 'link', protocol: 'Ethernet', fields: [{ name: '目的 MAC', value: MAC.r1Eth0 }, { name: '來源 MAC', value: MAC.laptop }, { name: 'EtherType', value: '0x0800（IPv4）' }] },
      ] },
    { id: 'http-3', from: 'r1', to: 'server', label: 'HTTP GET（R1 轉送）', payload: 'GET /index.html HTTP/1.1\nHost: www.example.com',
      note: 'R1 收到目的 MAC 是自己的訊框，拆掉 Ethernet 標頭，讀 IPv4 標頭的目的 IP 198.51.100.80，查路由表得知它在 eth1 直接連接的網路。R1 把 TTL 從 64 減為 63（同時重算 IP 標頭檢查碼），再包上新的 Ethernet 標頭：來源是 eth1 的 MAC，目的是伺服器的 MAC（R1 已經從 ARP 得知）。來源與目的 IP 不變，TCP 與 HTTP 路由器不看也不改。',
      headers: [
        { layer: 'application', protocol: 'HTTP/1.1', fields: [{ name: '方法', value: 'GET' }, { name: '路徑', value: '/index.html' }, { name: 'Host', value: 'www.example.com' }] },
        { layer: 'transport', protocol: 'TCP', fields: [{ name: '來源連接埠', value: '50312' }, { name: '目的連接埠', value: '80' }, { name: 'Seq', value: '1001' }, { name: 'Ack', value: '7001' }, { name: '旗標', value: 'PSH, ACK' }] },
        { layer: 'network', protocol: 'IPv4', fields: [{ name: '來源 IP', value: '192.0.2.25' }, { name: '目的 IP', value: '198.51.100.80' }, { name: 'TTL', value: '63' }, { name: '協定', value: '6（TCP）' }] },
        { layer: 'link', protocol: 'Ethernet', fields: [{ name: '目的 MAC', value: MAC.server }, { name: '來源 MAC', value: MAC.r1Eth1 }, { name: 'EtherType', value: '0x0800（IPv4）' }] },
      ],
      tables: [{ node: 'r1', name: '路由表', head: ['目的網路', '下一站', '介面'], rows: [['192.0.2.0/24', '直接連接', 'eth0'], ['198.51.100.0/24', '直接連接', 'eth1']] }] },
  ],
};

/** Section 5: an HTTPS request and its response on the same LAN, described with the OSI model. */
const httpsInOsi: NetworkScene = {
  id: 'cn01-osi-https', title: '用 OSI 七層看一個 HTTPS 請求', model: 'osi',
  description: '筆電用 HTTPS 開啟同一個區域網路裡 NAS（網路儲存裝置，192.0.2.50）的管理頁面 nas.home.arpa。同樣的請求改用 OSI 七層描述：看表現層與會議層在哪裡、哪些層有自己的標頭，以及 NAS 收到後如何由下往上拆開。',
  nodes: [
    { id: 'laptop', label: '筆電', kind: 'host', addresses: ['IP 192.0.2.25', `MAC ${MAC.laptop}`] },
    { id: 'nas', label: 'NAS', kind: 'server', addresses: ['IP 192.0.2.50', `MAC ${MAC.nas}`] },
  ],
  messages: [
    { id: 'https-req', from: 'laptop', to: 'nas', label: 'HTTPS GET', payload: 'GET / HTTP/1.1\nHost: nas.home.arpa',
      note: '應用層是 HTTP 請求。表現層放 TLS：它把 HTTP 請求加密後裝進 TLS 紀錄（內容類型 23 表示應用資料），常見的教材把加密歸在表現層，也有教材放在會議層；在 TCP/IP 模型裡，TLS 是應用程式使用的函式庫，算在應用層。會議層在這個請求裡沒有獨立的標頭。往下是 TCP（目的連接埠 443）、IPv4、Ethernet。NAS 在同一個網路，所以目的 MAC 直接是 NAS。實體層在訊框前送出前導碼與 SFD 讓接收端對準時脈，再把每個位元變成線路上的訊號。',
      headers: [
        { layer: 'application', protocol: 'HTTP/1.1', fields: [{ name: '方法', value: 'GET' }, { name: '路徑', value: '/' }, { name: 'Host', value: 'nas.home.arpa' }] },
        { layer: 'presentation', protocol: 'TLS 1.3', fields: [{ name: '內容類型', value: '23（application_data）' }, { name: '版本欄位', value: '0x0303' }] },
        { layer: 'transport', protocol: 'TCP', fields: [{ name: '來源連接埠', value: '50320' }, { name: '目的連接埠', value: '443' }, { name: '旗標', value: 'PSH, ACK' }] },
        { layer: 'network', protocol: 'IPv4', fields: [{ name: '來源 IP', value: '192.0.2.25' }, { name: '目的 IP', value: '192.0.2.50' }, { name: 'TTL', value: '64' }, { name: '協定', value: '6（TCP）' }] },
        { layer: 'link', protocol: 'Ethernet', fields: [{ name: '目的 MAC', value: MAC.nas }, { name: '來源 MAC', value: MAC.laptop }, { name: 'EtherType', value: '0x0800（IPv4）' }] },
        { layer: 'physical', protocol: 'Ethernet PHY', fields: [{ name: '前導碼', value: '7 位元組，位元依序為 10101010' }, { name: 'SFD', value: '10101011' }] },
      ] },
    { id: 'https-res', from: 'nas', to: 'laptop', label: 'HTTPS 200 OK', payload: 'HTTP/1.1 200 OK\nContent-Type: text/html',
      note: 'NAS 先由下往上拆開請求：實體層把訊號還原成位元；資料鏈結層確認目的 MAC 是自己、檢查 FCS，依 EtherType 0x0800 交給 IPv4；IPv4 確認目的 IP 是自己，依協定欄位 6 交給 TCP；TCP 依目的連接埠 443 交給網頁伺服器程式，TLS 解密後得到 HTTP 請求。回應再由上往下封裝：連接埠、IP 與 MAC 都和請求相反，筆電收到後一樣由下往上拆。',
      headers: [
        { layer: 'application', protocol: 'HTTP/1.1', fields: [{ name: '狀態碼', value: '200 OK' }, { name: 'Content-Type', value: 'text/html' }] },
        { layer: 'presentation', protocol: 'TLS 1.3', fields: [{ name: '內容類型', value: '23（application_data）' }, { name: '版本欄位', value: '0x0303' }] },
        { layer: 'transport', protocol: 'TCP', fields: [{ name: '來源連接埠', value: '443' }, { name: '目的連接埠', value: '50320' }, { name: '旗標', value: 'PSH, ACK' }] },
        { layer: 'network', protocol: 'IPv4', fields: [{ name: '來源 IP', value: '192.0.2.50' }, { name: '目的 IP', value: '192.0.2.25' }, { name: 'TTL', value: '64' }, { name: '協定', value: '6（TCP）' }] },
        { layer: 'link', protocol: 'Ethernet', fields: [{ name: '目的 MAC', value: MAC.laptop }, { name: '來源 MAC', value: MAC.nas }, { name: 'EtherType', value: '0x0800（IPv4）' }] },
        { layer: 'physical', protocol: 'Ethernet PHY', fields: [{ name: '前導碼', value: '7 位元組，位元依序為 10101010' }, { name: 'SFD', value: '10101011' }] },
      ] },
  ],
};

/** Section 6: the DNS lookup before the HTTP request, over UDP (TCP/IP model). */
const dnsOverUdp: NetworkScene = {
  id: 'cn01-dns-udp', title: 'DNS 查詢走 UDP', model: 'tcp-ip',
  description: '瀏覽器要連 www.example.com 之前，先向區域網路裡的 DNS 伺服器（192.0.2.53）查它的 IPv4 位址。比較這次的傳輸層標頭和 HTTP 請求的 TCP 標頭有什麼不同。',
  nodes: [
    { id: 'laptop', label: '筆電', kind: 'host', addresses: ['IP 192.0.2.25', `MAC ${MAC.laptop}`] },
    { id: 'dns', label: 'DNS 伺服器', kind: 'resolver', addresses: ['IP 192.0.2.53', `MAC ${MAC.dns}`] },
  ],
  messages: [
    { id: 'dns-query', from: 'laptop', to: 'dns', label: 'DNS 查詢 A www.example.com',
      note: 'DNS 查詢本身是應用層的訊息：12 位元組的 DNS 標頭加上 21 位元組的問題，共 33 位元組。UDP 只在前面加 8 位元組的標頭（來源連接埠、目的連接埠 53、長度、檢查碼），長度 8 + 33 = 41。沒有序號、確認號，也不先建立連線：送出就是送出，等不到回應時由查詢的一方（系統的解析程式）自己重送。IPv4 的協定欄位是 17，表示裡面是 UDP。',
      headers: [
        { layer: 'application', protocol: 'DNS', fields: [{ name: 'ID', value: '0x3f2a' }, { name: '旗標', value: 'QR=0（查詢）、RD=1' }, { name: '問題', value: 'www.example.com A' }] },
        { layer: 'transport', protocol: 'UDP', fields: [{ name: '來源連接埠', value: '53001' }, { name: '目的連接埠', value: '53' }, { name: '長度', value: '41' }] },
        { layer: 'network', protocol: 'IPv4', fields: [{ name: '來源 IP', value: '192.0.2.25' }, { name: '目的 IP', value: '192.0.2.53' }, { name: 'TTL', value: '64' }, { name: '協定', value: '17（UDP）' }] },
        { layer: 'link', protocol: 'Ethernet', fields: [{ name: '目的 MAC', value: MAC.dns }, { name: '來源 MAC', value: MAC.laptop }, { name: 'EtherType', value: '0x0800（IPv4）' }] },
      ] },
    { id: 'dns-response', from: 'dns', to: 'laptop', label: 'DNS 回應 198.51.100.80',
      note: 'DNS 伺服器用同一個 ID 0x3f2a 回答，筆電靠它對上自己的查詢。回應保留原來的問題，再加上一筆 16 位元組的答案（名稱用 2 位元組指回問題），DNS 訊息 49 位元組，UDP 長度 57。答案裡的 TTL 300 是這筆記錄可以快取的秒數，和 IPv4 標頭的 TTL（剩下幾站）是不同的東西。連接埠與位址都和查詢相反。',
      headers: [
        { layer: 'application', protocol: 'DNS', fields: [{ name: 'ID', value: '0x3f2a' }, { name: '旗標', value: 'QR=1（回應）、RD=1、RA=1' }, { name: '答案', value: 'www.example.com A 198.51.100.80（TTL 300）' }] },
        { layer: 'transport', protocol: 'UDP', fields: [{ name: '來源連接埠', value: '53' }, { name: '目的連接埠', value: '53001' }, { name: '長度', value: '57' }] },
        { layer: 'network', protocol: 'IPv4', fields: [{ name: '來源 IP', value: '192.0.2.53' }, { name: '目的 IP', value: '192.0.2.25' }, { name: 'TTL', value: '64' }, { name: '協定', value: '17（UDP）' }] },
        { layer: 'link', protocol: 'Ethernet', fields: [{ name: '目的 MAC', value: MAC.laptop }, { name: '來源 MAC', value: MAC.dns }, { name: 'EtherType', value: '0x0800（IPv4）' }] },
      ] },
  ],
};

/** CN01 Network Layer Models. Network-protocol lesson (CN-1): scenes and exercises checked by validateContent. */
export const CN01: LessonContent = {
  lessonId: 'CN01',
  motivation: '打開一個網頁，背後是好幾個協定各做一件事：HTTP 說要哪一份資料、TCP 把資料交給對的程式、IP 找到另一個網路上的主機、Ethernet 把資料送到下一站。把它們分成層來看，才能說出一個請求在路上被加了哪些標頭、交換器與路由器各會讀或改哪個欄位；網路出問題時，也才知道該從哪一層查起。學完本課，你能畫出一個 HTTP 請求從應用層一路封裝成訊框的樣子，並標出每一層加上的標頭。',
  sections: [
    {
      id: 'why-layers', title: '為什麼要分層',
      blocks: [
        { type: 'p', text: '把一份資料從一台電腦送到另一台，要解決很多不同的問題：資料要用什麼格式、要交給對方的哪一個程式、要經過哪些網路才到得了、在一條線路上怎麼表示 0 和 1。如果寫成一個大程式，換一種線路（從網路線改成 Wi-Fi）就得改掉整個程式。分層（layering）的做法是把這些問題分給不同的層，每一層只做一件事。' },
        { type: 'list', items: [
          '每一層只使用下一層提供的服務（service），並向上一層提供服務。例如 TCP 只要求 IP「把這個封包送到那個位址」，不管封包走哪條路、經過網路線還是 Wi-Fi。',
          '兩台電腦的同一層之間依照協定（protocol）溝通：協定規定這一層的訊息格式（標頭有哪些欄位、各代表什麼）與收送規則。HTTP、TCP、IP、Ethernet 都是協定。',
          '層與層之間只透過介面往來，所以可以單獨替換一層：筆電從網路線改用 Wi-Fi，只有最下面的鏈結層換成 IEEE 802.11，瀏覽器、TCP、IP 都不必改。',
          '除錯時可以一層一層排除：線路有沒有訊號、能不能到預設閘道、IP 到不到得了、連接埠有沒有程式在聽，最後才是應用程式本身。',
        ] },
        { type: 'p', text: '這和寫程式時把工作拆成函式很像：呼叫者只依賴函式的參數與回傳值，不依賴它的內部寫法；只要介面不變，內部可以整個重寫。網路的每一層就是下一層的使用者。' },
      ],
    },
    {
      id: 'two-models', title: 'OSI 七層與 TCP/IP 四層',
      blocks: [
        { type: 'p', text: '描述網路分層最常用兩種模型。OSI 模型（Open Systems Interconnection）由 ISO 制定，分成七層，是討論與教學用的參考模型。TCP/IP 模型是網際網路實際採用的協定組合，分成四層。兩者的對應大致如下：' },
        { type: 'table', head: ['OSI 七層', '這一層負責', 'TCP/IP 四層', '代表協定或技術'], rows: [
          ['7 應用層', '提供給應用程式的網路服務', '應用層', 'HTTP、DNS、SMTP'],
          ['6 表現層', '資料的表示方式：編碼、壓縮、加密', '應用層', 'TLS 的加密常被歸在這裡；字元編碼如 UTF-8'],
          ['5 會議層', '建立、維持與結束雙方的對話', '應用層', '網際網路上沒有通用的獨立協定，常舉 RPC 為例'],
          ['4 傳輸層', '兩端程式之間的傳送，以連接埠區分程式', '傳輸層', 'TCP、UDP'],
          ['3 網路層', '跨越多個網路的定址與選路', '網際網路層', 'IPv4、IPv6、ICMP'],
          ['2 資料鏈結層', '同一段鏈路上送到下一站，以 MAC 位址定址', '網路存取層', 'Ethernet、Wi-Fi（IEEE 802.11）'],
          ['1 實體層', '把位元變成電、光或無線電訊號', '網路存取層', '雙絞線、光纖、無線電；如 1000BASE-T'],
        ] },
        { type: 'p', text: 'TCP/IP 的應用層涵蓋了 OSI 的應用、表現、會議三層：編碼、加密、維持對話這些工作，由應用程式本身或它使用的函式庫（例如 TLS 函式庫）完成。TCP/IP 的網路存取層則涵蓋 OSI 的資料鏈結層與實體層。有些教科書把兩者合併成五層（應用、傳輸、網路、鏈結、實體），想法相同，只是把最下層拆成兩層。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：OSI 七層在網際網路上各有一個獨立的協定', text: '網際網路實際使用的是 TCP/IP 協定組合，OSI 模型主要用來討論「某件工作屬於哪一層」。表現層與會議層在一般的網頁請求裡沒有各自的標頭；反過來，一個協定也可能橫跨兩層，例如 Ethernet 標準同時規定了訊框格式（資料鏈結層）與線路上的訊號（實體層）。所以說「TLS 屬於第幾層」時，不同教材的答案可能不同，重點是它做什麼工作。' },
      ],
    },
    {
      id: 'encapsulation', title: '封裝：一個 HTTP 請求如何變成訊框',
      blocks: [
        { type: 'p', text: '傳送端由上往下，每一層把上一層交下來的整份資料當成自己的資料（payload），在前面加上自己的標頭（header），這就是封裝（encapsulation）。下一層不解讀上一層的內容，只負責把它完整送到。以筆電向 www.example.com 要 /index.html 為例：' },
        { type: 'list', ordered: true, items: [
          '應用層：瀏覽器產生 HTTP 請求，第一行是 `GET /index.html HTTP/1.1`，接著是 `Host: www.example.com` 等標頭行。這段文字就是應用層的訊息。',
          '傳輸層：作業系統的 TCP 在前面加上 TCP 標頭：來源連接埠 50312（作業系統挑的臨時連接埠）、目的連接埠 80、序號、確認號與旗標，成為 TCP 區段。',
          '網際網路層：IP 加上 IPv4 標頭：來源 192.0.2.25、目的 198.51.100.80、TTL 64，協定欄位 6 表示裡面裝的是 TCP，成為 IP 封包。',
          '網路存取層：網路卡加上 Ethernet 標頭與尾端的 FCS 檢查碼：目的 MAC 是下一站（預設閘道 R1），EtherType 0x0800 表示裡面是 IPv4，成為訊框，最後以位元的形式送上線路。',
        ] },
        { type: 'p', text: '把這個訊框由外往內畫出來，就是下面這張表。標頭的長度是沒有選項時的最小值，實際的 TCP 標頭常帶有選項而更長：' },
        { type: 'table', head: ['由外往內', '部分', '由哪一層加上', '長度', '重要欄位'], rows: [
          ['1', 'Ethernet 標頭', '網路存取層', '14 位元組', '目的 MAC、來源 MAC、EtherType'],
          ['2', 'IPv4 標頭', '網際網路層', '20 位元組起', '來源與目的 IP、TTL、協定'],
          ['3', 'TCP 標頭', '傳輸層', '20 位元組起', '來源與目的連接埠、序號、確認號、旗標'],
          ['4', 'HTTP 請求', '應用層', '依內容而定', '方法、路徑、Host 等標頭行'],
          ['5', 'FCS（訊框的尾端）', '網路存取層', '4 位元組', 'CRC-32 檢查碼，接收端用來發現傳輸錯誤'],
        ] },
        { type: 'p', text: '下面的情境就是這個請求。第一步看筆電送出的訊框，從最外層的 Ethernet 一層一層往內看到 HTTP 請求；後兩步看它經過交換器與路由器時，哪些欄位不變、哪些被改寫。' },
        { type: 'example', id: 'cn01-http-router' },
      ],
    },
    {
      id: 'along-the-path', title: '路上的設備各看哪一層',
      blocks: [
        { type: 'p', text: '中間的設備不必拆開所有的層，只拆到自己工作需要的那一層。上面情境的第二步，交換器只讀 Ethernet 標頭的目的 MAC 決定從哪個埠送出，訊框原封不動；第三步，路由器拆掉 Ethernet 標頭，讀 IP 標頭的目的位址查路由表，把 TTL 減 1，再為下一段鏈路包上新的 Ethernet 標頭。' },
        { type: 'table', head: ['設備', '讀到哪一層', '會改什麼'], rows: [
          ['交換器', '資料鏈結層：目的 MAC（並從來源 MAC 學習主機接在哪個埠）', '不改訊框'],
          ['路由器', '網路層：目的 IP，查路由表決定介面與下一站', '換上新的 Ethernet 標頭（來源與目的 MAC）；TTL 減 1 並重算 IP 標頭檢查碼'],
          ['目的伺服器', '每一層都拆開', '由下往上解封裝，把 HTTP 請求交給在連接埠 80 等待的網頁伺服器程式'],
        ] },
        { type: 'p', text: '所以在沒有位址轉換的情況下，IP 位址是端到端的：從筆電到伺服器，來源與目的 IP 都不變。MAC 位址是逐段的：每經過一台路由器就換一次，只描述「這一段鏈路上從誰到誰」。家用路由器常做的 NAT 會改寫 IP 位址與連接埠，那是之後的課程主題。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：交換器會看 IP 位址', text: '一般的交換器工作在資料鏈結層，只依目的 MAC 位址轉送訊框，不讀 IP 標頭，也不會減 TTL；它甚至不需要有 IP 位址就能運作（可管理的交換器有 IP，是給管理介面用的）。依 IP 位址選路的是路由器。市面上的「三層交換器」能依 IP 轉送，那時它做的正是路由器的工作。' },
      ],
    },
    {
      id: 'decapsulation', title: '解封裝：接收端由下往上拆',
      blocks: [
        { type: 'p', text: '接收端的順序和傳送端相反，由下往上一層一層拆開，這就是解封裝（decapsulation）。每一層讀完自己的標頭後，要知道把剩下的資料交給上面的哪一個協定，靠的是標頭裡的欄位：' },
        { type: 'list', ordered: true, items: [
          '實體層把線路上的訊號還原成位元，組回訊框。',
          '資料鏈結層確認目的 MAC 是自己（或是廣播、群播位址），用 FCS 檢查有沒有錯誤；EtherType 0x0800 表示交給 IPv4。',
          '網路層確認目的 IP 是自己；協定欄位 6 表示交給 TCP，17 表示交給 UDP。',
          '傳輸層依目的連接埠交給對應的程式，例如 443 是 HTTPS 的網頁伺服器，53 是 DNS 伺服器。',
          '應用層的程式讀到完整的訊息（必要時由 TLS 函式庫先解密），開始處理請求。',
        ] },
        { type: 'p', text: '下面的情境改用 OSI 七層描述同一類請求：筆電用 HTTPS 開啟同一個區域網路裡 NAS 的管理頁面。注意表現層的 TLS 標頭、會議層沒有標頭，以及最下面的實體層。第二步的說明就是 NAS 解封裝請求、再封裝回應的過程。' },
        { type: 'example', id: 'cn01-osi-https' },
        { type: 'callout', tone: 'note', title: '這裡的標頭是加密前的樣子', text: '使用 HTTPS 時，線路上看得到的是 TLS 紀錄的標頭，HTTP 請求本身已經被加密；情境裡列出 HTTP 的欄位，是為了顯示 TLS 裡面裝的是什麼。TCP、IP、Ethernet 的標頭沒有加密，交換器與路由器照樣讀得到。' },
      ],
    },
    {
      id: 'pdu-names', title: '各層的資料單位（PDU）與 UDP',
      blocks: [
        { type: 'p', text: '每一層的「標頭加上資料」稱為這一層的協定資料單位（PDU，Protocol Data Unit）。因為各層加的東西不同，習慣上每一層的 PDU 有自己的名字，說「封包」或「訊框」時，就已經表明是在講哪一層：' },
        { type: 'table', head: ['OSI 層', 'TCP/IP 層', 'PDU 名稱', '英文', '例子'], rows: [
          ['應用、表現、會議層', '應用層', '訊息', 'message', 'HTTP 請求、DNS 查詢'],
          ['傳輸層', '傳輸層', '區段（TCP）／資料包（UDP）', 'segment／datagram', 'TCP 區段、UDP 資料包'],
          ['網路層', '網際網路層', '封包', 'packet', 'IPv4 封包'],
          ['資料鏈結層', '網路存取層', '訊框', 'frame', 'Ethernet 訊框'],
          ['實體層', '網路存取層', '位元', 'bits', '線路上的訊號'],
        ] },
        { type: 'callout', tone: 'note', title: '名稱是慣例，不同文件用法不完全相同', text: 'IPv4 的規格（RFC 791）把網路層的單位稱為 datagram，有些教科書也把 UDP 的單位叫作 segment；日常口語的「封包」更常泛指任何一層的資料。判斷時看它有哪些標頭：最外層是 Ethernet 標頭就是訊框，最外層是 IP 標頭就是封包。' },
        { type: 'p', text: '不是每個應用都用 TCP。瀏覽器在送出 HTTP 請求之前，要先用 DNS 查出 www.example.com 的 IP 位址，DNS 查詢通常走 UDP。UDP 標頭只有 8 位元組、四個欄位：來源連接埠、目的連接埠、長度、檢查碼。它沒有序號與確認號，也不建立連線，所以又快又簡單，遺失時由使用它的程式自己決定要不要重送。下面的情境比較它和 HTTP 請求的 TCP 標頭。' },
        { type: 'example', id: 'cn01-dns-udp' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'q-layer-swap', prompt: '一台筆電原本用網路線上網，改用 Wi-Fi 之後，依照分層的設計，哪些部分需要換掉？',
      options: [
        '瀏覽器要改用另一個版本的 HTTP，因為傳送媒介不同',
        '只有網路存取層換成 Wi-Fi 的協定，HTTP、TCP、IP 都不必改',
        'TCP 要改成 UDP，因為無線網路比較不可靠',
        '每一層都要重新設計，因為訊號從電變成無線電',
      ],
      answer: 1,
      explanation: '每一層只使用下一層的服務：IP 只要求網路存取層把封包送到下一站，不管下面是 Ethernet 還是 IEEE 802.11，所以只有最下層換掉。HTTP 與 TCP 不知道下面用什麼線路，不必改版或換成 UDP；「每一層都重新設計」正是分層要避免的情況。',
    },
    {
      id: 'q-tcp-pdu', prompt: '傳輸層使用 TCP 時，這一層的 PDU（標頭加上資料）通常叫作什麼？',
      options: ['訊框', '封包', '位元', '區段'],
      answer: 3,
      explanation: 'TCP 的 PDU 叫區段（segment）。訊框（frame）是資料鏈結層（Ethernet）的單位，封包（packet）是網路層（IP）的單位，位元（bits）是實體層在線路上傳送的形式；這三個都不是傳輸層的名字。',
    },
    {
      id: 'q-router-reads', prompt: '在「HTTP 請求經過交換器與路由器」情境中，R1 決定把封包從哪個介面送出時，依據的是哪一個欄位？',
      options: ['IPv4 標頭的目的 IP 位址', 'Ethernet 標頭的目的 MAC 位址', 'TCP 標頭的目的連接埠', 'HTTP 請求的 Host 標頭'],
      answer: 0,
      explanation: '路由器工作在網路層，用目的 IP 198.51.100.80 查路由表，找到 eth1。訊框的目的 MAC 是 R1 自己的 eth0，只代表「這一段送給 R1」，不能用來選下一站；TCP 的連接埠與 HTTP 的 Host 屬於更上層，路由器轉送時不看。',
    },
    {
      id: 'q-app-mapping', prompt: 'TCP/IP 模型的應用層，大致涵蓋了 OSI 模型的哪幾層？',
      options: ['只有應用層', '應用層與傳輸層', '應用層、表現層與會議層', '表現層與會議層'],
      answer: 2,
      explanation: 'TCP/IP 沒有獨立的表現層與會議層，編碼、加密、維持對話都由應用程式或它的函式庫完成，所以 TCP/IP 的應用層對應 OSI 的第 5～7 層。說「只有應用層」漏掉了這兩層的工作；傳輸層在兩個模型裡都是獨立的一層；只說表現層與會議層則漏掉了應用層本身。',
    },
    {
      id: 'q-encap-order', prompt: '筆電送出一個 HTTP 請求時，各層的內容依封裝的先後順序是哪一個？',
      options: [
        'Ethernet → IP → TCP → HTTP',
        'HTTP → TCP → IP → Ethernet',
        'IP → TCP → Ethernet → HTTP',
        'TCP → HTTP → IP → Ethernet',
      ],
      answer: 1,
      explanation: '封裝由上往下：先有應用層的 HTTP 請求，TCP 在它前面加標頭，IP 再把整個 TCP 區段包起來，最後 Ethernet 包成訊框。「Ethernet → IP → TCP → HTTP」是接收端解封裝時讀到的順序，不是傳送端加上的順序；另外兩個選項打亂了層的上下關係。',
    },
    {
      id: 'q-switch-changes', prompt: '筆電送往 R1 的訊框經過交換器時，交換器對訊框做了什麼？',
      options: [
        '把目的 MAC 改成 R1 的 MAC',
        '把 IPv4 標頭的 TTL 減 1',
        '把來源 MAC 改成交換器自己的 MAC',
        '什麼都不改，只依目的 MAC 選擇送出的埠',
      ],
      answer: 3,
      explanation: '交換器在資料鏈結層依目的 MAC 轉送，訊框原封不動。目的 MAC 本來就是筆電寫好的 R1 eth0，不需要交換器改；TTL 減 1 是路由器的工作，交換器不讀 IP 標頭；換來源 MAC 也是路由器為新的一段鏈路重新封裝時才做的事。',
    },
    {
      id: 'q-demux', prompt: '伺服器收到訊框後，依靠什麼決定把內容交給 IPv4，接著又依靠什麼決定交給 TCP？',
      options: [
        'Ethernet 的 EtherType 0x0800，接著是 IPv4 的協定欄位 6',
        '目的 MAC 位址，接著是目的 IP 位址',
        'IPv4 的 TTL，接著是 TCP 的目的連接埠',
        '依序把資料交給每一種協定試試看，能解讀的就是',
      ],
      answer: 0,
      explanation: '每一層的標頭都記錄了上一層是誰：EtherType 0x0800 表示裡面是 IPv4，IPv4 的協定欄位 6 表示裡面是 TCP（17 則是 UDP）。目的 MAC 與目的 IP 只判斷「是不是給我的」，不說明裡面是什麼協定；TTL 是剩下幾站；網路堆疊不會用逐一嘗試的方式猜協定。',
    },
    {
      id: 'q-udp-vs-tcp', prompt: '比較「DNS 查詢走 UDP」的 UDP 標頭與 HTTP 請求的 TCP 標頭，UDP 標頭沒有哪些欄位？',
      options: ['來源連接埠與目的連接埠', '長度與檢查碼', '序號、確認號與 SYN、ACK 等旗標', '來源 IP 與目的 IP'],
      answer: 2,
      explanation: 'UDP 不建立連線、不保證送達，所以沒有序號、確認號與連線旗標，標頭只有來源連接埠、目的連接埠、長度、檢查碼四個欄位。連接埠兩者都有；長度與檢查碼 UDP 本來就有；IP 位址在 IPv4 標頭裡，TCP 標頭也沒有，談不上 UDP 少了它。',
    },
  ],
  network: {
    scenes: [httpThroughSwitchAndRouter, httpsInOsi, dnsOverUdp],
    exercises: [
      { id: 'cn01-gateway-mac', task: 'field', scene: 'cn01-http-router', message: 'http-1', layer: 'link', field: '目的 MAC', title: '筆電送出的訊框寫給誰',
        statement: '在「HTTP 請求經過交換器與路由器」的第一步，筆電送出的 Ethernet 訊框，目的 MAC 位址是什麼？',
        hints: ['伺服器 198.51.100.80 和筆電 192.0.2.25 在同一個網路嗎？', 'MAC 位址只在同一段鏈路上有意義：訊框要先送到這段鏈路上的下一站。'],
        explanation: '伺服器在另一個網路，筆電要把封包交給預設閘道 R1，所以訊框的目的 MAC 是 R1 eth0 的 02:00:00:00:00:01。目的 IP 仍然是伺服器 198.51.100.80：IP 說最終要到哪裡，MAC 說這一段先送給誰。',
        mistakes: [
          { answer: { value: MAC.server }, why: '以為訊框直接寫上最終目的地的 MAC：伺服器不在同一段鏈路上，筆電的訊框到不了它，只能先送給路由器。' },
          { answer: { value: '198.51.100.80' }, why: '把 IP 位址當成 MAC 位址：目的 IP 在網際網路層的 IPv4 標頭裡，Ethernet 標頭只放 MAC 位址。' },
        ] },
      { id: 'cn01-router-source-mac', task: 'field', scene: 'cn01-http-router', message: 'http-3', layer: 'link', field: '來源 MAC', title: '路由器轉送後的來源 MAC',
        statement: '在同一個情境的第三步，R1 送往伺服器的訊框，來源 MAC 位址是什麼？',
        hints: ['R1 收到訊框後拆掉了舊的 Ethernet 標頭，為下一段鏈路重新封裝。', 'R1 是從哪一個介面把封包送出去的？'],
        explanation: 'R1 依目的 IP 查路由表，從 eth1 送出，並包上新的 Ethernet 標頭：來源是 eth1 的 MAC 02:00:00:00:64:01，目的是伺服器的 MAC。來源 IP 仍是筆電的 192.0.2.25，但來源 MAC 每一段都會換。',
        mistakes: [
          { answer: { value: MAC.laptop }, why: '以為來源 MAC 和來源 IP 一樣端到端不變：MAC 只描述這一段鏈路，筆電的 MAC 在 R1 拆掉舊訊框時就不見了。' },
          { answer: { value: MAC.r1Eth0 }, why: '用了 R1 收到訊框的介面：新訊框從 eth1 送出，來源是 eth1 的 MAC。' },
        ] },
      { id: 'cn01-udp-layer', task: 'layer', scene: 'cn01-dns-udp', protocol: 'UDP', title: 'UDP 在哪一層',
        statement: '在「DNS 查詢走 UDP」情境的 TCP/IP 四層模型裡，UDP 標頭屬於哪一層？',
        hints: ['UDP 標頭的連接埠 53 指出要交給哪一個程式。', 'DNS 是應用層的協定，UDP 是 DNS 用來送訊息的那一層。'],
        explanation: 'UDP 在傳輸層：它和 TCP 一樣用連接埠把資料交給兩端正確的程式，只是不建立連線、不保證送達。DNS 是使用 UDP 的應用層協定；找路與定址則是下面的 IP 負責。',
        mistakes: [
          { answer: { layer: 'application' }, why: '因為 DNS 是應用層協定，就以為它用的 UDP 也是：DNS 的訊息由 UDP 承載，兩者是上下兩層。' },
          { answer: { layer: 'network' }, why: '把「送到另一台主機」當成 UDP 的工作：主機之間的定址是 IP（網際網路層），UDP 在它之上區分程式。' },
        ] },
      { id: 'cn01-ethernet-layer', task: 'layer', scene: 'cn01-osi-https', protocol: 'Ethernet', title: 'Ethernet 標頭在 OSI 的哪一層',
        statement: '在「用 OSI 七層看一個 HTTPS 請求」情境中，放著目的 MAC、來源 MAC 與 EtherType 的 Ethernet 標頭屬於 OSI 的哪一層？',
        hints: ['MAC 位址用來把訊框送到同一段鏈路上的下一站。', '前導碼與 SFD 列在另一層，它們只用來讓接收端對準位元。'],
        explanation: 'Ethernet 標頭在資料鏈結層（第 2 層）：它用 MAC 位址在同一段鏈路上定址，並以 EtherType 指出上一層的協定。Ethernet 標準也規定了實體層的訊號，但前導碼、SFD 與位元編碼屬於實體層，不在這個標頭裡。',
        mistakes: [
          { answer: { layer: 'physical' }, why: '因為 Ethernet 也規定了網路線上的訊號，就把整個 Ethernet 放在實體層：帶有 MAC 位址的訊框標頭屬於資料鏈結層。' },
          { answer: { layer: 'network' }, why: '把 MAC 位址和 IP 位址混為一談：跨網路定址的 IP 在網路層，MAC 只在一段鏈路上有效。' },
        ] },
    ],
  },
};
