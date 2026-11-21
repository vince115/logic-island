import type { FirewallPacket, NetworkScene, NodeTable, ProtocolHeader } from '@/lib/network/model';
import type { LessonContent } from '../schema';

/*
 * CN19 Firewalls, VPNs and Zero Trust (CN-4, packet-journey). Four fixed scenes: a stateful firewall whose connection
 * tracking table lets a reply in and drops two unsolicited packets; a DMZ firewall whose first-match rule table decides
 * five packets; a WireGuard site-to-site tunnel; and an identity-aware access proxy that decides by user, device and
 * permission rather than by network. Two firewall exercises run the learner's rules (src/lib/network/firewall.ts) against
 * test packets. The model allows one header per layer, so the tunnel's outer packet shows the WireGuard header in the
 * application slot (it sits above UDP) and the encrypted inner packet's IPv4 and TCP headers as a node table of GW-A
 * ("加密前的內層封包"). Outside addresses are RFC 5737; internal networks are RFC 1918. In scene 1 the office uses the
 * documentation block 192.0.2.0/24 directly, without NAT (CN06), to keep the connection table about state only.
 */

const TCP = '6（TCP）', UDP = '17（UDP）';
const tcp = (from: number, to: number, flags: string): ProtocolHeader => ({ layer: 'transport', protocol: 'TCP', fields: [
  { name: '來源連接埠', value: String(from) }, { name: '目的連接埠', value: String(to) }, { name: '旗標', value: flags }] });
const ipv4 = (from: string, to: string, protocol = TCP): ProtocolHeader => ({ layer: 'network', protocol: 'IPv4', fields: [
  { name: '來源 IP', value: from }, { name: '目的 IP', value: to }, { name: '協定', value: protocol }] });
const http = (fields: [string, string][]): ProtocolHeader => ({ layer: 'application', protocol: 'HTTP', fields: fields.map(([name, value]) => ({ name, value })) });

// ---- scene 1: a stateful firewall and its connection tracking table ------------------------------------------
const FW1_RULES: NodeTable = { node: 'fw', name: '規則表', head: ['順序', '規則'], rows: [
  ['1', 'allow tcp from 192.0.2.0/24 to any port 443'], ['2', 'allow tcp from any to any established'], ['預設', 'deny']] };
const CONN_HEAD = ['編號', '協定', '內部端', '外部端', '狀態'];
const WAITING = '等待回應（只看過去程的 SYN）', ESTABLISHED = '已建立（兩個方向都看過封包）';
const conn = (state: string, changed: boolean): NodeTable => ({ node: 'fw', name: '連線追蹤表', head: CONN_HEAD,
  rows: [['#1', 'TCP', '192.0.2.25:51544', '198.51.100.80:443', state]], ...changed ? { changed: [0] } : {} });

/** Section 1: an outbound request creates an entry, the reply is let in by state, unsolicited packets are dropped. */
const statefulScene: NetworkScene = {
  id: 'cn19-stateful', title: '狀態檢查：回應靠連線追蹤表進來，主動闖入的封包被丟棄', model: 'tcp-ip',
  description: '辦公室的員工電腦 192.0.2.25 連到外部網站 198.51.100.80 的 443 埠。防火牆 FW 只有兩條規則：內部往外的 HTTPS 新連線放行、已建立連線的封包放行，其他一律擋下。為了專心看連線狀態，這個辦公室直接使用公開位址 192.0.2.0/24，省略 NAT（CN06）。逐步看連線追蹤表怎麼新增一列、回應怎麼因此被放行，以及兩個不請自來的封包為什麼進不來。',
  nodes: [
    { id: 'pc', label: '員工電腦', kind: 'host', addresses: ['IP 192.0.2.25/24', '閘道 192.0.2.1'] },
    { id: 'fw', label: '防火牆 FW', kind: 'router', addresses: ['內側 192.0.2.1/24', '外側接網際網路'] },
    { id: 'web', label: '外部網站', kind: 'server', addresses: ['IP 198.51.100.80'] },
    { id: 'stranger', label: '陌生主機', kind: 'host', addresses: ['IP 203.0.113.66'] },
  ],
  messages: [
    { id: 'syn-out', from: 'pc', to: 'fw', label: 'SYN：員工電腦連外部網站 443', payload: 'TCP SYN（開始 HTTPS 連線）',
      note: 'FW 由上往下比對規則。這是新連線，規則 1「allow tcp from 192.0.2.0/24 to any port 443」符合：來源在 192.0.2.0/24、目的埠 443。放行的同時，FW 在連線追蹤表記下這條連線的兩端位址與連接埠，狀態是等待回應。',
      headers: [tcp(51544, 443, 'SYN'), ipv4('192.0.2.25', '198.51.100.80')], tables: [FW1_RULES, conn(WAITING, true)] },
    { id: 'syn-forward', from: 'fw', to: 'web', label: 'FW 把 SYN 轉送出去', payload: 'TCP SYN（開始 HTTPS 連線）',
      note: 'FW 也是一台路由器（CN07），查路由表後把封包從外側介面送出。標頭沒有改變：這個情境沒有 NAT。',
      headers: [tcp(51544, 443, 'SYN'), ipv4('192.0.2.25', '198.51.100.80')], tables: [conn(WAITING, false)] },
    { id: 'reply-in', from: 'web', to: 'fw', label: 'SYN-ACK：網站的回應到達 FW', payload: 'TCP SYN-ACK',
      note: '回應的來源是 198.51.100.80:443、目的是 192.0.2.25:51544。規則 1 不符合（來源不在 192.0.2.0/24），FW 不需要任何「開放入站」的規則：它在連線追蹤表中找到 #1，這是同一條連線反方向的封包，所以把它視為已建立，規則 2「allow tcp from any to any established」放行。#1 的狀態改為已建立。',
      headers: [tcp(443, 51544, 'SYN, ACK'), ipv4('198.51.100.80', '192.0.2.25')], tables: [FW1_RULES, conn(ESTABLISHED, true)] },
    { id: 'reply-forward', from: 'fw', to: 'pc', label: 'FW 把回應交給員工電腦', payload: 'TCP SYN-ACK',
      note: '回應送到員工電腦，三向交握接著完成（CN09）。之後這條連線兩個方向的封包都對得上 #1，都由規則 2 放行；連線結束（FIN 或 RST）或閒置逾時後，FW 刪掉這一列。',
      headers: [tcp(443, 51544, 'SYN, ACK'), ipv4('198.51.100.80', '192.0.2.25')], tables: [conn(ESTABLISHED, false)] },
    { id: 'unsolicited', from: 'stranger', to: 'pc', label: '陌生主機主動連員工電腦的 3389 埠', lost: true, payload: 'TCP SYN（嘗試遠端桌面連線）',
      note: '203.0.113.66 想連員工電腦的遠端桌面（3389）。這是新連線：規則 1 不符合（來源不在 192.0.2.0/24），規則 2 不符合（不是已建立的連線），落到預設的 deny。FW 丟棄它，連線追蹤表沒有新增任何一列，員工電腦根本收不到。',
      headers: [tcp(50999, 3389, 'SYN'), ipv4('203.0.113.66', '192.0.2.25')], tables: [conn(ESTABLISHED, false)] },
    { id: 'fake-ack', from: 'stranger', to: 'pc', label: '陌生主機偽裝成回應（帶 ACK 旗標）', lost: true, payload: 'TCP ACK（假裝是某條連線的後續封包）',
      note: '這次陌生主機送出帶 ACK 旗標、來源埠 443 的封包，看起來像網站的回應。只看單一封包的無狀態過濾器如果用「有 ACK 就是回應」來判斷，會讓它通過；FW 卻去連線追蹤表找 203.0.113.66:443 與 192.0.2.25:51545 的連線，找不到，所以它不是已建立的連線，規則 2 不符合，依預設丟棄。',
      headers: [tcp(443, 51545, 'ACK'), ipv4('203.0.113.66', '192.0.2.25')], tables: [conn(ESTABLISHED, false)] },
  ],
};

// ---- scene 2: a DMZ firewall, first match wins ---------------------------------------------------------------
const DMZ_RULES = [
  ['1', 'allow tcp from any to any established'],
  ['2', 'allow tcp from any to 203.0.113.10 port 443'],
  ['3', 'allow tcp from 203.0.113.10 to 10.0.20.5 port 5432'],
  ['預設', 'deny'],
];
const NO = '不符合', SKIP = '不再檢查', ALLOW = '符合 → 放行', DENY = '套用 → 擋下';
/** The firewall's evaluation of one packet: one result per rule, in order. */
const decide = (results: string[]): NodeTable => ({ node: 'fw', name: '規則比對', head: ['順序', '規則', '這個封包'],
  rows: DMZ_RULES.map((r, i) => [r[0], r[1], results[i]]) });

/** Section 3: the public web server sits in the DMZ; only it reaches the database, and only on 5432. */
const dmzScene: NetworkScene = {
  id: 'cn19-dmz', title: 'DMZ：網頁伺服器對外，資料庫只讓它連 5432', model: 'tcp-ip',
  description: '防火牆 FW 接了三個網段：網際網路、DMZ（203.0.113.0/28，放對外的網頁伺服器 203.0.113.10），以及內部的伺服器網段 10.0.20.0/24（資料庫 10.0.20.5）與員工網段 10.0.10.0/24。所有跨網段的封包都經過 FW，由上往下比對三條規則，第一條符合的規則決定結果，都不符合就套用預設的 deny。每一步看「規則比對」表：哪一條規則決定了這個封包。',
  nodes: [
    { id: 'client', label: '網際網路上的使用者', kind: 'host', addresses: ['IP 198.51.100.7'] },
    { id: 'fw', label: '防火牆 FW', kind: 'router', addresses: ['外側接網際網路', 'DMZ 203.0.113.1/28', '伺服器網段 10.0.20.1/24', '員工網段 10.0.10.1/24'] },
    { id: 'web', label: 'DMZ 網頁伺服器', kind: 'server', addresses: ['IP 203.0.113.10'] },
    { id: 'db', label: '資料庫', kind: 'server', addresses: ['IP 10.0.20.5', 'PostgreSQL 5432 埠'] },
    { id: 'staff', label: '員工電腦', kind: 'host', addresses: ['IP 10.0.10.25'] },
  ],
  messages: [
    { id: 'internet-web', from: 'client', to: 'web', label: '使用者連網頁伺服器 443：放行', payload: 'TCP SYN（HTTPS）',
      note: '新連線，規則 1 要求已建立，不符合；規則 2 符合（目的 203.0.113.10、埠 443），放行。第一條符合的規則就決定了結果，規則 3 與預設不再檢查。',
      headers: [tcp(50200, 443, 'SYN'), ipv4('198.51.100.7', '203.0.113.10')], tables: [decide([NO, ALLOW, SKIP, SKIP])] },
    { id: 'web-db', from: 'web', to: 'db', label: '網頁伺服器查資料庫 5432：放行', payload: 'TCP SYN（PostgreSQL 連線）',
      note: '網頁伺服器要查商品資料。新連線：規則 1 不符合，規則 2 的目的不是資料庫，不符合；規則 3 符合（來源正是 203.0.113.10、目的 10.0.20.5、埠 5432），放行。',
      headers: [tcp(41000, 5432, 'SYN'), ipv4('203.0.113.10', '10.0.20.5')], tables: [decide([NO, NO, ALLOW, SKIP])] },
    { id: 'db-reply', from: 'db', to: 'web', label: '資料庫的回應：依狀態放行', payload: 'TCP SYN-ACK',
      note: '資料庫的回應屬於剛才放行的連線，FW 在連線追蹤表找得到它，規則 1 符合，放行。沒有任何一條規則允許資料庫主動連 DMZ，回應照樣回得去。',
      headers: [tcp(5432, 41000, 'SYN, ACK'), ipv4('10.0.20.5', '203.0.113.10')], tables: [decide([ALLOW, SKIP, SKIP, SKIP])] },
    { id: 'internet-ssh', from: 'client', to: 'web', label: '使用者連網頁伺服器 22：擋下', lost: true, payload: 'TCP SYN（SSH）',
      note: '同一台伺服器的 22 埠（SSH）。新連線：規則 1 不符合，規則 2 只開 443，不符合，規則 3 的來源不對，不符合，落到預設的 deny。最小權限：對外只開必要的 443，管理用的 SSH 不對網際網路開放。',
      headers: [tcp(50201, 22, 'SYN'), ipv4('198.51.100.7', '203.0.113.10')], tables: [decide([NO, NO, NO, DENY])] },
    { id: 'web-staff', from: 'web', to: 'staff', label: '網頁伺服器連員工電腦 445：擋下', lost: true, payload: 'TCP SYN（檔案分享）',
      note: '假設網頁伺服器已經被入侵，攻擊者想從它連到員工電腦的檔案分享（445）。三條規則都不符合，預設 deny 擋下。這就是 DMZ 的用意：對外的伺服器最容易被攻破，攻破之後也只能走規則 3 這一條窄路，碰不到員工網段。',
      headers: [tcp(41500, 445, 'SYN'), ipv4('203.0.113.10', '10.0.10.25')], tables: [decide([NO, NO, NO, DENY])] },
  ],
};

// ---- scene 3: a WireGuard site-to-site tunnel -----------------------------------------------------------------
const PEER_HEAD = ['對端', '公開端點', '通道內的網段（AllowedIPs）'];
const INNER: NodeTable = { node: 'gwA', name: '加密前的內層封包', head: ['欄位', '值'], rows: [
  ['內層來源 IP', '10.1.0.20'], ['內層目的 IP', '10.2.0.30'], ['內層協定', TCP], ['內層目的連接埠', '445']] };
const innerHeaders = [tcp(50800, 445, 'PSH, ACK'), ipv4('10.1.0.20', '10.2.0.30')];

/** Section 4: the inner packet is encrypted and carried as the payload of an outer UDP packet between the gateways. */
const vpnScene: NetworkScene = {
  id: 'cn19-vpn-tunnel', title: '站對站 VPN：內層封包加密後裝進外層的 UDP 封包', model: 'tcp-ip',
  description: '台北辦公室（10.1.0.0/24）與高雄辦公室（10.2.0.0/24）用 WireGuard 站對站 VPN 相連，兩端的 VPN 閘道各有一個公開位址。台北的電腦向高雄的檔案伺服器送出檔案分享的請求。逐步比較三段路上的標頭：辦公室內是原本的封包，網際網路上只看得到兩台閘道之間的外層封包。本課的模型每一層只畫一個標頭，所以外層封包把 WireGuard 標頭畫在 UDP 之上（應用層的位置），被加密的內層 IPv4 與 TCP 標頭則列在 GW-A 的「加密前的內層封包」表中。',
  nodes: [
    { id: 'pcA', label: '台北辦公室電腦', kind: 'host', addresses: ['IP 10.1.0.20/24', '閘道 10.1.0.1'] },
    { id: 'gwA', label: '台北 VPN 閘道 GW-A', kind: 'router', addresses: ['內側 10.1.0.1/24', '外側 192.0.2.1（公開）'] },
    { id: 'gwB', label: '高雄 VPN 閘道 GW-B', kind: 'router', addresses: ['外側 198.51.100.2（公開）', '內側 10.2.0.1/24'] },
    { id: 'srv', label: '高雄檔案伺服器', kind: 'server', addresses: ['IP 10.2.0.30/24'] },
  ],
  messages: [
    { id: 'inner-out', from: 'pcA', to: 'gwA', label: '原本的封包：10.1.0.20 → 10.2.0.30', payload: '檔案分享（SMB）的請求，在辦公室內網是明文',
      note: '電腦不知道有 VPN，它只把目的 10.2.0.30 不在自己網段的封包交給預設閘道 GW-A。GW-A 的通道設定說 10.2.0.0/24 在 GW-B 後面，所以這個封包要走通道。',
      headers: innerHeaders, tables: [{ node: 'gwA', name: '通道設定', head: PEER_HEAD, rows: [['GW-B', '198.51.100.2:51820', '10.2.0.0/24']] }] },
    { id: 'tunnel', from: 'gwA', to: 'gwB', label: '外層封包：192.0.2.1 → 198.51.100.2，UDP 51820', payload: '加密後的整個內層封包（內層 IPv4 標頭、TCP 標頭與資料），後面附 16 位元組的驗證標籤',
      note: 'GW-A 把整個內層封包用和 GW-B 協商好的金鑰加密，前面加上 WireGuard 標頭，再包進一個新的 UDP 封包（目的埠 51820）與新的 IPv4 標頭：來源是 GW-A 的公開位址，目的是 GW-B 的公開位址。網際網路上的路由器只看外層標頭轉送；側錄的人看得到兩台閘道的位址、UDP 51820、封包大小與時間，看不到內層的 10.1.0.20、10.2.0.30、445 埠與檔案內容。',
      headers: [
        { layer: 'application', protocol: 'WireGuard', fields: [{ name: '訊息類型', value: '4（傳輸資料）' }, { name: '接收端索引', value: '0x6a1c03f2' }, { name: '計數器', value: '1187' }] },
        { layer: 'transport', protocol: 'UDP', fields: [{ name: '來源連接埠', value: '51820' }, { name: '目的連接埠', value: '51820' }] },
        ipv4('192.0.2.1', '198.51.100.2', UDP)],
      tables: [INNER] },
    { id: 'inner-in', from: 'gwB', to: 'srv', label: 'GW-B 解封裝，交出原本的封包', payload: '檔案分享（SMB）的請求，在辦公室內網是明文',
      note: 'GW-B 用接收端索引找到這條通道的金鑰，解密並檢查驗證標籤：被竄改過的封包會被丟棄。計數器用來拒絕重放的舊封包。GW-B 再確認內層來源 10.1.0.20 落在 GW-A 允許的 10.1.0.0/24，然後把原本的封包交給檔案伺服器。伺服器看到的來源是 10.1.0.20，就像兩個辦公室在同一個網路裡。',
      headers: innerHeaders, tables: [{ node: 'gwB', name: '通道設定', head: PEER_HEAD, rows: [['GW-A', '192.0.2.1:51820', '10.1.0.0/24']] }] },
  ],
};

// ---- scene 4: zero trust, an identity-aware access proxy ------------------------------------------------------
const ACCESS_HEAD = ['請求', '使用者', '裝置', '來源網路', '權限', '決定'];
const ACCESS_ROWS = [
  ['#1', 'alice（人資，已通過 MFA）', '公司筆電：受管理、磁碟加密、系統已更新', '咖啡店 Wi-Fi', '人資可讀薪資', '放行'],
  ['#2', 'alice（人資，已通過 MFA）', '私人平板：未受管理、系統過舊', '家用網路', '人資可讀薪資', '拒絕'],
  ['#3', 'bob（業務，已通過 MFA）', '公司桌機：受管理、系統已更新', '公司內網', '業務不可讀薪資', '拒絕'],
];
const access = (n: number): NodeTable => ({ node: 'proxy', name: '存取紀錄', head: ACCESS_HEAD, rows: ACCESS_ROWS.slice(0, n), changed: [n - 1] });
const getPayroll = (token: string) => http([['方法', 'GET'], ['路徑', '/payroll'], ['Host', 'hr.example.com'], ['Authorization', token]]);
const forbidden = (reason: string) => http([['狀態碼', '403 Forbidden'], ['原因', reason]]);

/** Section 5: every request is decided by user, device and permission; being on the internal network grants nothing. */
const zeroTrustScene: NetworkScene = {
  id: 'cn19-zero-trust', title: '零信任：每個請求都檢查身分、裝置與權限，不看你在哪個網路', model: 'tcp-ip',
  description: '公司的人資系統 hr.example.com 不再「內網可連、外網不可連」，而是放在身分感知的存取代理後面：不論從哪裡連，每個請求都要帶短效的存取權杖，代理檢查使用者、裝置狀態與權限後才轉給人資系統。人資系統只接受代理的連線。看三個請求的「存取紀錄」，以及最後一個想繞過代理的封包。',
  nodes: [
    { id: 'laptop', label: 'alice 的公司筆電', kind: 'host', addresses: ['咖啡店 Wi-Fi', 'IP 198.51.100.23'] },
    { id: 'tablet', label: 'alice 的私人平板', kind: 'host', addresses: ['家用網路', 'IP 203.0.113.140'] },
    { id: 'bobpc', label: 'bob 的辦公室桌機', kind: 'host', addresses: ['公司內網', 'IP 10.0.10.40'] },
    { id: 'proxy', label: '存取代理（身分感知）', kind: 'server', addresses: ['公開 203.0.113.20', '內側 10.0.30.2'] },
    { id: 'hr', label: '人資系統', kind: 'server', addresses: ['IP 10.0.30.10', '只接受 10.0.30.2 的連線'] },
  ],
  messages: [
    { id: 'alice-laptop', from: 'laptop', to: 'proxy', label: 'alice 用公司筆電讀薪資頁面', payload: 'HTTPS 請求（TLS 加密，CN13）',
      note: 'alice 在咖啡店，網路完全不可信。代理檢查：權杖證明她是 alice、剛通過多因素驗證（MFA）；裝置憑證與裝置管理系統的回報證明這是受管理、磁碟加密、系統已更新的公司筆電；她屬於人資群組，可讀薪資。全部通過，放行這一個請求。',
      headers: [getPayroll('Bearer 短效存取權杖（10 分鐘）'), tcp(52100, 443, 'PSH, ACK'), ipv4('198.51.100.23', '203.0.113.20')], tables: [access(1)] },
    { id: 'proxy-hr', from: 'proxy', to: 'hr', label: '代理把請求轉給人資系統', payload: 'HTTPS 請求（代理與人資系統之間另一條 TLS 連線）',
      note: '代理以自己的身分連到人資系統，並附上已驗證的使用者。人資系統只接受 10.0.30.2 的連線，所以它的回應一定經過了代理的檢查。',
      headers: [http([['方法', 'GET'], ['路徑', '/payroll'], ['已驗證使用者', 'alice（人資）']]), tcp(40110, 8443, 'PSH, ACK'), ipv4('10.0.30.2', '10.0.30.10')], tables: [access(1)] },
    { id: 'alice-tablet', from: 'tablet', to: 'proxy', label: 'alice 用私人平板讀同一頁', payload: 'HTTPS 請求（TLS 加密，CN13）',
      note: '同一個人、同一個密碼與 MFA，但裝置是未受管理、系統過舊的私人平板。零信任把裝置狀態也當成判斷依據：一台可能有惡意程式的裝置，即使使用者是對的，也不給它薪資資料。',
      headers: [getPayroll('Bearer 短效存取權杖（10 分鐘）'), tcp(61022, 443, 'PSH, ACK'), ipv4('203.0.113.140', '203.0.113.20')], tables: [access(2)] },
    { id: 'deny-tablet', from: 'proxy', to: 'tablet', label: '403：裝置不符合政策', payload: '說明頁：請改用公司管理的裝置',
      note: '代理拒絕，請求根本沒有送到人資系統。',
      headers: [forbidden('裝置不符合政策'), tcp(443, 61022, 'PSH, ACK'), ipv4('203.0.113.20', '203.0.113.140')], tables: [access(2)] },
    { id: 'bob-office', from: 'bobpc', to: 'proxy', label: 'bob 在辦公室讀薪資頁面', payload: 'HTTPS 請求（TLS 加密，CN13）',
      note: 'bob 坐在公司裡，用受管理的公司桌機，也通過了 MFA。在城堡與護城河的模型中，「人在內網」就足以連上人資系統；在這裡，來源網路不代表任何權限。bob 是業務，沒有讀薪資的權限。',
      headers: [getPayroll('Bearer 短效存取權杖（10 分鐘）'), tcp(55310, 443, 'PSH, ACK'), ipv4('10.0.10.40', '10.0.30.2')], tables: [access(3)] },
    { id: 'deny-bob', from: 'proxy', to: 'bobpc', label: '403：沒有這項權限', payload: '說明頁：你的角色不能讀取薪資資料',
      note: '代理依最小權限拒絕。這個決定只針對這一個請求：bob 讀業務報表的請求仍會被放行。',
      headers: [forbidden('沒有讀取薪資的權限'), tcp(443, 55310, 'PSH, ACK'), ipv4('10.0.30.2', '10.0.10.40')], tables: [access(3)] },
    { id: 'bob-direct', from: 'bobpc', to: 'hr', label: 'bob 繞過代理直接連人資系統：被丟棄', lost: true, payload: 'TCP SYN（直接連 8443 埠）',
      note: 'bob 改用人資系統的內部位址 10.0.30.10 直接連線。人資系統前面的規則只允許 10.0.30.2（代理）連進來，這就是微分段：每個系統各自只開給該連它的對象，同在內網也一樣擋下。',
      headers: [tcp(55311, 8443, 'SYN'), ipv4('10.0.10.40', '10.0.30.10')] },
  ],
};

// ---- firewall exercises -------------------------------------------------------------------------------------------
const SYNTAX = '規則語法：每行一條，「allow|deny tcp|udp|icmp|any from 來源 to 目的 [port 埠或埠範圍] [established]」，來源與目的寫 any、一個 IPv4 位址或前綴（例如 192.0.2.0/24），port 指目的連接埠，established 只符合已建立連線的封包；「default allow」或「default deny」設定都不符合時的結果，不寫就是 deny。由上往下比對，第一條符合的規則決定結果。';

const webServerPackets: FirewallPacket[] = [
  { label: '外部使用者連 HTTPS（TCP 443）', protocol: 'tcp', src: '198.51.100.7', dst: '203.0.113.10', port: 443, state: 'new' },
  { label: '辦公室的管理員連 SSH（TCP 22）', protocol: 'tcp', src: '192.0.2.30', dst: '203.0.113.10', port: 22, state: 'new' },
  { label: '外部主機連 SSH（TCP 22）', protocol: 'tcp', src: '198.51.100.7', dst: '203.0.113.10', port: 22, state: 'new' },
  { label: '伺服器回應外部使用者（已建立的連線）', protocol: 'tcp', src: '203.0.113.10', dst: '198.51.100.7', port: 50312, state: 'established' },
  { label: '伺服器主動連外部的 25 埠（寄信）', protocol: 'tcp', src: '203.0.113.10', dst: '198.51.100.99', port: 25, state: 'new' },
  { label: '外部使用者送 UDP 443（HTTP/3）', protocol: 'udp', src: '198.51.100.7', dst: '203.0.113.10', port: 443, state: 'new' },
];
const dmzPackets: FirewallPacket[] = [
  { label: '網頁伺服器連資料庫（TCP 5432）', protocol: 'tcp', src: '203.0.113.10', dst: '10.0.20.5', port: 5432, state: 'new' },
  { label: '網頁伺服器連資料庫的 SSH（TCP 22）', protocol: 'tcp', src: '203.0.113.10', dst: '10.0.20.5', port: 22, state: 'new' },
  { label: 'DMZ 的郵件伺服器連資料庫（TCP 5432）', protocol: 'tcp', src: '203.0.113.11', dst: '10.0.20.5', port: 5432, state: 'new' },
  { label: '網頁伺服器連員工電腦的檔案分享（TCP 445）', protocol: 'tcp', src: '203.0.113.10', dst: '10.0.10.25', port: 445, state: 'new' },
  { label: '資料庫回應網頁伺服器（已建立的連線）', protocol: 'tcp', src: '10.0.20.5', dst: '203.0.113.10', port: 41000, state: 'established' },
  { label: '管理員以 SSH 管理資料庫（TCP 22）', protocol: 'tcp', src: '10.0.99.8', dst: '10.0.20.5', port: 22, state: 'new' },
];

/** CN19 Firewalls, VPNs and Zero Trust. Network-protocol lesson (CN-4): scenes, a table, a field and two firewall exercises. */
export const CN19: LessonContent = {
  lessonId: 'CN19',
  motivation: '一家小公司把網站架在自己的伺服器上，第二天記錄檔裡就有上千次來自世界各地的 SSH 登入嘗試。CN18 談過網路上的威脅，這一課回答「那要怎麼擋」：防火牆依位址、連接埠與連線狀態決定每個封包放行或擋下，而且規則的順序寫錯一行，整道防線就形同虛設；對外的伺服器要放進 DMZ，內部再切成彼此隔離的網段，被攻破一台也不會一路通到員工電腦；分處兩地的辦公室或在家工作的員工，用 VPN 通道把封包加密後穿過網際網路；最後，零信任不再相信「在內網就是自己人」，而是每個請求都檢查身分、裝置與權限。學完後，你能為一個小型公司網路寫出只開放必要服務的防火牆規則，並說明每一條的用意。',
  sections: [
    {
      id: 'packet-filtering', title: '封包過濾與狀態檢查',
      blocks: [
        { type: 'p', text: '防火牆站在網段之間，對每個經過的封包做一個決定：放行或擋下。最基本的做法是無狀態的封包過濾（stateless packet filtering）：只看這一個封包的標頭，也就是協定、來源與目的位址、連接埠，和一條條規則比對。它簡單又快，但有一個難題：員工連外部網站時，網站的回應是從外面進來的封包，目的埠是員工電腦臨時選的一個高埠（例如 51544）。無狀態的過濾器要讓回應進來，只能開放「外部到內部的所有高埠」，或是「有 ACK 旗標的就放行」，兩者都等於在牆上開了大洞：攻擊者自己也能送出帶 ACK 的封包。' },
        { type: 'p', text: '狀態檢查（stateful inspection）的防火牆多記一張連線追蹤表（connection tracking table）。內部主機發起的連線被規則放行時，防火牆記下這條連線的協定、兩端位址與連接埠；之後反方向的封包如果對得上表中的某一列，就屬於已建立的連線，可以用一條「已建立的連線放行」規則讓它通過，完全不需要開放任何入站的連接埠。UDP 沒有連線，防火牆就以同一組位址與連接埠在短時間內的往返當作一條連線來追蹤，閒置一段時間後刪除。下面的情境逐步顯示 FW 的規則表與連線追蹤表：' },
        { type: 'example', id: 'cn19-stateful' },
        { type: 'table', head: ['', '無狀態的封包過濾', '狀態檢查'], rows: [
          ['判斷依據', '只看這一個封包的標頭', '標頭，加上這個封包屬不屬於連線追蹤表中的連線'],
          ['讓回應進來的方法', '開放入站的高埠，或憑 ACK 旗標放行', '對得上連線追蹤表就放行，不開放任何入站埠'],
          ['偽裝成回應的封包', '帶 ACK 就可能通過', '表中沒有這條連線，擋下'],
          ['代價', '不必記憶，速度快', '要為每條連線保存一列，連線太多時表可能被塞滿'],
        ] },
        { type: 'callout', tone: 'note', title: '兩種 established', text: '有些舊式路由器存取控制清單（ACL）的 established 關鍵字，只檢查 TCP 的 ACK 或 RST 旗標，是無狀態的判斷，偽造的 ACK 封包可以通過。本課規則語言的 established 是狀態檢查的意思：封包屬於連線追蹤表中一條已建立的連線。' },
      ],
    },
    {
      id: 'rules-and-order', title: '預設拒絕、最小權限與規則的順序',
      blocks: [
        { type: 'p', text: '本課用一個小小的規則語言寫防火牆規則，每行一條。「allow|deny 協定 from 來源 to 目的 [port 埠] [established]」：協定是 tcp、udp、icmp 或 any；來源與目的寫 any、一個 IPv4 位址或一個前綴（例如 10.0.20.0/24，比對方式和 CN05 的子網路相同）；port 是目的連接埠，可以寫一個數字或「1024-65535」這樣的範圍；加上 established 的規則只符合已建立連線的封包。另外用「default allow」或「default deny」設定所有規則都不符合時的結果，不寫就是 deny。真實的防火牆還能比對進出的介面、來源埠與方向，原理相同。' },
        { type: 'p', text: '比對方式是由上往下，第一條符合的規則決定結果，後面的規則不再檢查。這和 CN07 路由表的最長前綴匹配不同：路由器在所有符合的路由中挑最具體的，防火牆卻只看順序。所以具體的規則要放在寬鬆的規則前面。以規則「1. allow tcp from any to 203.0.113.10」「2. deny tcp from any to 203.0.113.10 port 22」為例：' },
        { type: 'table', head: ['封包', '規則 1', '規則 2', '結果'], rows: [
          ['198.51.100.7 → 203.0.113.10:443（新連線）', '符合', '不再檢查', '放行'],
          ['198.51.100.7 → 203.0.113.10:22（新連線）', '符合', '不再檢查', '放行：規則 2 永遠輪不到'],
          ['198.51.100.7 → 192.0.2.30:22（新連線）', '不符合', '不符合', '依預設 deny 擋下'],
        ] },
        { type: 'p', text: '安全的寫法從預設拒絕（default deny）開始：先假設什麼都不放行，再一條一條加上真正需要的服務，每一條都盡量窄，只開給需要的來源、需要的目的與需要的連接埠，這就是最小權限（least privilege）。忘了寫的服務會被擋下，使用者會來抱怨，管理員就知道要補；反過來用預設放行、再列出要擋的東西，忘了寫的服務就默默開著，沒有人會發現。' },
        { type: 'callout', tone: 'warning', title: '常見錯誤：寬鬆的 allow 放在前面', text: '「allow tcp from any to 203.0.113.10」看起來只是放行網站，其實開放了這台伺服器的每一個 TCP 連接埠。把它放在第一行，後面再精心寫的 deny 規則全部失效，因為第一條符合就決定了結果。檢查規則時，對每一條 allow 問兩個問題：它比需要的寬嗎？它前面有沒有會先吃掉封包的規則，它後面的規則又會不會被它吃掉？' },
      ],
    },
    {
      id: 'dmz-and-segmentation', title: 'DMZ 與網段隔離',
      blocks: [
        { type: 'p', text: '對外提供服務的伺服器（網站、郵件、DNS）必須讓網際網路連進來，也因此最容易被攻破。DMZ（demilitarized zone，非軍事區）是把這些伺服器放進一個自己的網段，夾在網際網路與內部網路之間：網際網路只能連到 DMZ 裡指定的服務，DMZ 只能連到內部少數必要的目的地，內部則可以管理 DMZ。這樣即使網頁伺服器被入侵，攻擊者手上也只有一台在 DMZ 裡的機器，要再往內走，只剩防火牆特地開的那幾條窄路。' },
        { type: 'p', text: '同樣的想法用在內部，就是網段隔離（network segmentation）：把員工電腦、伺服器、印表機、訪客 Wi-Fi、監視器分到不同的子網路（CN05）或 VLAN（CN03），網段之間的流量都要經過防火牆或路由器上的規則。一台員工電腦中了勒索軟體，它能掃描、感染的範圍就只到自己的網段。下面的情境中，FW 用三條規則管住網際網路、DMZ 與內部之間的流量：' },
        { type: 'example', id: 'cn19-dmz' },
        { type: 'table', head: ['從 \\ 到', 'DMZ 網頁伺服器', '伺服器網段（資料庫）', '員工網段'], rows: [
          ['網際網路', '只有 TCP 443', '不可以', '不可以'],
          ['DMZ 網頁伺服器', '（同一網段）', '只有連資料庫 10.0.20.5 的 TCP 5432', '不可以'],
          ['回應封包', '依狀態放行', '依狀態放行', '依狀態放行'],
        ] },
        { type: 'p', text: 'DMZ 的伺服器常用公開位址（如本情境的 203.0.113.0/28）；也有公司讓 DMZ 用私有位址，再在防火牆上做連接埠轉送（CN06），這時規則要寫轉譯後的私有位址。不論哪一種，規則都只描述「哪個網段的誰，可以連哪個網段的哪一個服務」。' },
      ],
    },
    {
      id: 'vpn-tunnels', title: 'VPN 通道：封裝、加密，以及它保護不到的地方',
      blocks: [
        { type: 'p', text: 'VPN（virtual private network，虛擬私人網路）在不可信的網際網路上建立一條加密的通道，讓兩邊像是接在同一個私有網路上。常見兩種用法：站對站（site-to-site）VPN 由兩地辦公室的 VPN 閘道彼此建立通道，辦公室裡的電腦完全不用設定；遠端存取（remote access）VPN 則由員工筆電上的 VPN 用戶端連到公司的 VPN 閘道，筆電得到一個公司內部的位址，連回公司的流量都走通道。' },
        { type: 'p', text: 'VPN 通道的核心是封裝（encapsulation）：把整個原本的 IP 封包（內層封包，位址是兩邊的私有位址）加密，當成資料裝進一個新的外層封包；外層封包的來源與目的是兩台閘道的公開位址，網際網路的路由器只看外層標頭轉送。常見的協定有 IPsec ESP（直接放在外層 IP 標頭之後，協定號碼 50；需要穿過 NAT 時改裝進 UDP 4500）與 WireGuard（裝進 UDP，常用 51820 埠）。兩者的金鑰交換方式不同，本課不細談，重點是外層、內層兩組位址的分工：' },
        { type: 'example', id: 'cn19-vpn-tunnel' },
        { type: 'table', head: ['', '內層封包', '外層封包'], rows: [
          ['來源 IP', '10.1.0.20（台北的電腦）', '192.0.2.1（GW-A 的公開位址）'],
          ['目的 IP', '10.2.0.30（高雄的伺服器）', '198.51.100.2（GW-B 的公開位址）'],
          ['傳輸層', 'TCP，目的埠 445', 'UDP，目的埠 51820'],
          ['網際網路上看得到嗎', '看不到：被加密', '看得到：路由器靠它轉送'],
        ] },
        { type: 'p', text: 'VPN 保護的是通道兩端之間的那一段：路上的人看不到內層位址與內容，竄改會被驗證標籤發現，重放的舊封包會被拒絕。它不保護通道之外的事：封包出了 GW-B 之後在高雄辦公室內網是明文；外層位址、封包大小與時間仍然看得到；裝置本身中了惡意程式，惡意流量也會被好好地加密送進公司；使用商用 VPN 服務上網時，VPN 業者看得到你所有出了通道的流量。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：有 VPN 就安全', text: 'VPN 只解決「路上被偷看、被竄改」這一個問題。它不檢查連進來的裝置乾不乾淨，不阻止釣魚網站，也不限制使用者連上之後能做什麼：傳統的遠端存取 VPN 一連上，筆電就等於坐進公司內網，可以掃描、連線到任何內部系統。一組被盜的 VPN 帳號密碼，就是攻擊者進入內網的大門。所以 VPN 之後仍需要網段隔離與最小權限，這正是零信任要補的地方。' },
      ],
    },
    {
      id: 'zero-trust', title: '零信任：不因為在內網就信任',
      blocks: [
        { type: 'p', text: '傳統的網路安全像城堡與護城河（castle-and-moat）：邊界防火牆是城牆，牆外不可信，牆內都是自己人。問題是牆內並不安全：員工會點到釣魚郵件、筆電會帶出去又帶回來、VPN 帳號會被盜，攻擊者一旦進到牆內，就能在一片信任的內網裡橫向移動。雲端服務與在家工作又讓「牆內」的邊界越來越模糊。' },
        { type: 'p', text: '零信任（zero trust）的原則是「永不信任，一律驗證」（never trust, always verify）：不因為請求來自內網或 VPN 就信任它；每一個請求都要檢查使用者的身分（通常加上多因素驗證）、裝置的狀態（是否受管理、系統是否更新、磁碟是否加密），以及情境（時間、地點、行為是否異常），再依最小權限只允許這次需要的那一項資源。實作上常見身分感知的存取代理：應用程式不直接對網路開放，所有請求先經過代理的檢查。' },
        { type: 'example', id: 'cn19-zero-trust' },
        { type: 'p', text: '在網路這一層，零信任靠微分段（micro-segmentation）：把網段隔離做到每一個系統、甚至每一個工作負載，各自只開給真正該連它的對象。情境中人資系統只接受代理的連線，bob 就算在內網、知道它的位址，也連不上。下表比較兩種模型：' },
        { type: 'table', head: ['', '城堡與護城河', '零信任'], rows: [
          ['信任的依據', '在哪個網路：內網就是自己人', '每個請求的身分、裝置與情境'],
          ['驗證的時機', '進入內網（或連上 VPN）時一次', '每一個請求'],
          ['內部的流量', '大多不檢查', '一樣要檢查，用微分段限制'],
          ['帳號或裝置被攻破時', '攻擊者可以在內網橫向移動', '只拿得到那個身分在那台裝置上被允許的資源'],
        ] },
        { type: 'callout', tone: 'warning', title: '常見誤解：內網的流量都可以信任', text: '很多入侵都是從內部開始擴大的：一台中了惡意程式的員工電腦、一組被盜的 VPN 帳號、一台被攻破的 DMZ 伺服器。如果內網之間沒有任何規則，攻擊者進來一次就能連到每一台伺服器。零信任不是買一台產品就完成，而是逐步把「因為在內網所以放行」的地方，換成依身分、裝置與權限的檢查。防火牆、DMZ 與 VPN 仍然有用，只是不再是唯一的防線。' },
      ],
    },
    {
      id: 'company-rules', title: '為小公司寫規則：每一條都說得出用意',
      blocks: [
        { type: 'p', text: '寫防火牆規則可以照四個步驟：一，列出真正需要的流量，每一項都寫成「誰、到哪裡、什麼協定、哪個埠」；二，以 default deny 開頭；三，每一項需要的流量寫成一條盡量窄的 allow，具體的放前面；四，加上讓回應回來的 established 規則，然後拿幾個該放行與該擋下的封包逐一比對驗證。下面是一間辦公室（192.0.2.0/24）出口防火牆的例子：員工可以上網（HTTP 與 HTTPS），只能用公司指定的 DNS 伺服器 198.51.100.53，其他一律不行。' },
        { type: 'table', head: ['順序', '規則', '用意'], rows: [
          ['預設', 'default deny', '沒寫到的都擋下：錯誤偏向安全的一邊'],
          ['1', 'allow tcp from any to 192.0.2.0/24 established', '員工自己發起的 TCP 連線，回應可以進來；外部主動連進來的新連線不符合'],
          ['2', 'allow udp from 198.51.100.53 to 192.0.2.0/24 established', 'DNS 回應可以進來；UDP 也靠連線追蹤表判斷，而且只接受指定 DNS 伺服器的回應'],
          ['3', 'allow tcp from 192.0.2.0/24 to any port 443', '員工可以連 HTTPS 網站'],
          ['4', 'allow tcp from 192.0.2.0/24 to any port 80', '員工可以連 HTTP 網站（通常會被轉址到 HTTPS）'],
          ['5', 'allow udp from 192.0.2.0/24 to 198.51.100.53 port 53', '員工只能向公司指定的 DNS 伺服器查詢，惡意程式想用別的 DNS 伺服器偷傳資料會被擋下'],
        ] },
        { type: 'p', text: '把規則 3 與 4 合成「port 80-443」看似省事，其實多開了 81 到 442 之間的 362 個連接埠；把規則 5 的目的寫成 any，員工的電腦就能向任何 DNS 伺服器查詢。每一條規則都要說得出「它放行了哪一種需要的流量」，說不出用意的規則就是多開的門。下面的練習請你自己為一台網頁伺服器與一個 DMZ 寫規則，系統會拿幾個封包逐一比對你的規則與參考答案的結果；順序或寫法不同沒有關係，只要每個封包的結果相同就算對。' },
        { type: 'callout', tone: 'tip', title: '用測試封包檢查自己的規則', text: '寫完規則後，至少拿四種封包逐條走一遍：一個該放行的新連線、一個同一台主機但不該開放的連接埠、一個不該被允許的來源，以及一個已建立連線的回應。寬鬆的 allow 會讓第二、三種被放行；忘了 established，第四種會被擋下。' },
      ],
    },
  ],
  examples: [],
  quiz: [
    {
      id: 'cn19-q1', prompt: '員工電腦（192.0.2.25）連到外部網站 198.51.100.80 的 443 埠。防火牆只有「allow tcp from 192.0.2.0/24 to any port 443」與「allow tcp from any to any established」兩條規則，預設 deny。網站的回應封包為什麼進得來？',
      options: ['防火牆對所有來源埠是 443 的封包一律放行', '回應屬於連線追蹤表中已有的連線，established 那條規則放行它', '回應的目的位址在 192.0.2.0/24 之內，所以第一條規則符合', '預設 deny 只擋新連線，不擋任何回應'],
      answer: 1,
      explanation: '員工送出 SYN 時，防火牆在連線追蹤表記下這條連線；回應對得上表中的那一列，屬於已建立的連線，由第二條規則放行，不必開放任何入站埠。規則語言只比對目的埠，沒有「來源埠 443 就放行」這種判斷，那也會讓偽造的封包進來；第一條規則比的是來源在 192.0.2.0/24，回應的來源是網站，不符合；預設 deny 不分新舊，沒有被任何規則放行的回應一樣擋下。',
    },
    {
      id: 'cn19-q2', prompt: '防火牆的規則依序是「allow tcp from any to 203.0.113.10」與「deny tcp from any to 203.0.113.10 port 22」，預設 deny。198.51.100.7 對 203.0.113.10 的 22 埠發起新的 TCP 連線，結果是什麼？',
      options: ['被第二條擋下，因為它比第一條具體', '兩條都不符合，依預設 deny 擋下', '先被第一條放行，連線建立後再被第二條中斷', '被第一條放行，第二條永遠輪不到'],
      answer: 3,
      explanation: '防火牆由上往下比對，第一條符合的規則決定結果：第一條沒有限制連接埠，22 埠也符合，所以直接放行，後面的規則不再檢查。挑最具體的是 CN07 路由表最長前綴匹配的做法，不是防火牆的；第一條明明符合，不會落到預設；一個封包只會被決定一次，不會先放行再中斷。要擋住 SSH，deny 必須放在寬鬆的 allow 前面，或者把 allow 改成只開 443。',
    },
    {
      id: 'cn19-q3', prompt: '為什麼建議防火牆以 default deny 開頭，再逐條放行需要的服務？',
      options: ['忘了寫的服務會被擋下而不是被開放，錯誤偏向安全的一邊', '預設拒絕的防火牆不需要連線追蹤表，速度比較快', '預設拒絕會自動放行 80 與 443 這些常用的連接埠', '預設拒絕可以取代伺服器的系統更新'],
      answer: 0,
      explanation: '預設拒絕配合逐條放行就是最小權限：只開需要的，漏寫的會被擋下，使用者回報後再補上；預設放行則讓漏寫的服務默默開著。它和是否需要連線追蹤表無關，狀態檢查一樣要記錄連線；它不會自動放行任何連接埠，80 與 443 都要自己寫；被放行的服務仍可能有漏洞，系統更新不能省。',
    },
    {
      id: 'cn19-q4', prompt: '公司把對外的網頁伺服器放進 DMZ，而不是和員工電腦放在同一個內網，主要是為了什麼？',
      options: ['讓網頁伺服器不需要 TLS 憑證', 'DMZ 裡的伺服器不會被攻擊', '即使網頁伺服器被入侵，攻擊者也只能走防火牆為 DMZ 開的少數幾條路，碰不到員工電腦', '讓網際網路上的使用者可以直接連內部的資料庫'],
      answer: 2,
      explanation: 'DMZ 假設對外的伺服器最可能被攻破，所以把它和內部隔開：從 DMZ 往內只開必要的連線（例如只到資料庫的 5432），員工網段完全不開。DMZ 的伺服器照樣需要 TLS 憑證；它對網際網路開放，正是最常被攻擊的地方；網際網路連內部資料庫正是 DMZ 要阻止的事，只有 DMZ 的網頁伺服器能連資料庫。',
    },
    {
      id: 'cn19-q5', prompt: '台北 GW-A（192.0.2.1）與高雄 GW-B（198.51.100.2）之間有 WireGuard 站對站 VPN。有人在兩地之間的網際網路上側錄封包，他看得到什麼？',
      options: ['內層的 10.1.0.20、10.2.0.30 與檔案分享的內容', '外層的 192.0.2.1、198.51.100.2 與 UDP 51820，以及封包的大小與時間', '什麼都看不到，連外層標頭也被加密', '只看得到內層的 445 埠，其他都被加密'],
      answer: 1,
      explanation: '封裝後，整個內層封包被加密成外層封包的資料，網際網路上只剩外層標頭是明文：兩台閘道的公開位址與 UDP 51820，再加上大小與時間這些無法隱藏的特徵。內層位址、連接埠與內容都在加密的部分裡，所以第一個與第四個選項不對；外層標頭若也加密，路由器就無法轉送封包，所以不可能什麼都看不到。',
    },
    {
      id: 'cn19-q6', prompt: '員工在家用遠端存取 VPN 連回公司。下列哪一種情況是 VPN 本身擋不住的？',
      options: ['員工的筆電已經中了惡意程式，惡意流量透過 VPN 通道送到公司伺服器', '同一個 Wi-Fi 上的人側錄員工與公司之間的流量內容', '路上的人竄改通道中的封包而不被發現', '路上的人從封包看出員工連的是公司哪一台內部伺服器'],
      answer: 0,
      explanation: 'VPN 只保護通道兩端之間的傳輸，不檢查端點本身：中毒筆電的流量一樣被加密、完整送進公司，需要裝置檢查、網段隔離與最小權限來處理。側錄看不到內容，因為內層封包被加密；竄改會讓驗證標籤對不上而被丟棄；內部伺服器的位址在內層標頭裡，也被加密了，所以其他三項 VPN 都擋得住。',
    },
    {
      id: 'cn19-q7', prompt: '下列哪一項最符合零信任的做法？',
      options: ['只要連上公司內網或 VPN，就可以存取所有內部系統', '在網路邊界放一台很強的防火牆，內網之間不必設任何規則', '使用者每天第一次登入時驗證一次，之後所有請求都直接放行', '每一個請求都檢查使用者身分、裝置狀態與情境，只允許這次需要的資源'],
      answer: 3,
      explanation: '零信任不因來源網路而信任，每個請求都依身分、裝置與情境判斷，並採最小權限。「連上內網或 VPN 就能存取全部」與「只靠邊界防火牆、內網不設規則」正是它要取代的城堡與護城河模型；一天只驗證一次、之後全部放行，等於把信任交給一次登入，裝置中毒或權杖被盜時無法發現。',
    },
    {
      id: 'cn19-q8', prompt: '在零信任情境中，bob 的辦公室桌機繞過存取代理，直接連人資系統 10.0.30.10 的 8443 埠，封包被丟棄。這是哪一種做法的效果？',
      options: ['NAT 把人資系統的位址藏了起來', 'VPN 把人資系統的流量加密了', '微分段：人資系統只接受存取代理的連線，其他來源即使在內網也擋下', 'TTL 歸零，封包在內網中繞圈後被丟棄'],
      answer: 2,
      explanation: '人資系統前面的規則只允許代理 10.0.30.2 連入，這是把網段隔離做到單一系統的微分段，所以 bob 從內網直接連也被擋下。bob 知道內部位址，而且兩者都在內網，和 NAT 無關（CN06 也提過 NAT 不等於防火牆）；VPN 加密的是傳輸，不決定誰能連；這裡沒有路由迴圈，封包是被規則擋下，不是 TTL 歸零。',
    },
  ],
  exercises: [],
  network: {
    scenes: [statefulScene, dmzScene, vpnScene, zeroTrustScene],
    exercises: [
      { id: 'cn19-ex-web-server-rules', task: 'firewall', title: '只開必要服務的網頁伺服器',
        reference: 'default deny\nallow tcp from any to 203.0.113.10 port 443\nallow tcp from 192.0.2.0/24 to 203.0.113.10 port 22\nallow tcp from any to any established',
        packets: webServerPackets,
        statement: `一間小公司的網頁伺服器 203.0.113.10 放在防火牆後面，所有進出它的封包都經過這道防火牆。政策：任何人都可以連它的 HTTPS（TCP 443；這台伺服器沒有提供 UDP 的 HTTP/3）；只有辦公室網段 192.0.2.0/24 可以用 SSH（TCP 22）管理它；已建立連線的回應封包要能通過；其他一律擋下，伺服器也不能自己主動連到外面。寫出這道防火牆的規則。${SYNTAX}`,
        hints: ['先寫 default deny，再為每一項需要的流量寫一條盡量窄的 allow：誰、到哪裡、哪個埠。', 'SSH 只開給 192.0.2.0/24；伺服器送出的回應屬於已建立的連線，用 established 放行，不要寫成「伺服器可以連任何地方」。'],
        explanation: 'default deny 讓沒寫到的都擋下；allow tcp from any to 203.0.113.10 port 443 只開 TCP 的 HTTPS，UDP 443 不符合；allow tcp from 192.0.2.0/24 to 203.0.113.10 port 22 只讓辦公室連 SSH，外部的 SSH 落到預設被擋；allow tcp from any to any established 讓回應通過，伺服器主動連外的新連線不符合，被擋下。established 那條放在第一行也可以，因為新連線不會符合它。',
        mistakes: [
          { answer: { rules: 'default deny\nallow tcp from any to 203.0.113.10\ndeny tcp from any to 203.0.113.10 port 22\nallow tcp from 192.0.2.0/24 to 203.0.113.10 port 22\nallow tcp from any to any established' }, why: '寬鬆的 allow 放在最前面：它開放了伺服器的所有 TCP 連接埠，外部的 SSH 先被它放行，後面的 deny 輪不到。' },
          { answer: { rules: 'default deny\ndeny tcp from any to 203.0.113.10 port 22\nallow tcp from 192.0.2.0/24 to 203.0.113.10 port 22\nallow tcp from any to 203.0.113.10 port 443\nallow tcp from any to any established' }, why: '順序反了：擋 SSH 的 deny 放在辦公室的 allow 前面，辦公室的 SSH 也先被擋下。' },
          { answer: { rules: 'default deny\nallow tcp from any to 203.0.113.10 port 443\nallow tcp from 192.0.2.0/24 to 203.0.113.10 port 22' }, why: '忘了 established：伺服器的回應封包沒有規則放行，被預設擋下，連線建立不起來。' },
          { answer: { rules: 'default deny\nallow tcp from any to 203.0.113.10 port 443\nallow tcp from 192.0.2.0/24 to 203.0.113.10 port 22\nallow tcp from 203.0.113.10 to any' }, why: '用「伺服器可以連任何地方」代替 established：回應過得去，但被入侵的伺服器也能主動連外。' },
          { answer: { rules: 'default deny\nallow any from any to 203.0.113.10 port 443\nallow tcp from 192.0.2.0/24 to 203.0.113.10 port 22\nallow tcp from any to any established' }, why: '協定寫成 any：連 UDP 443 也一起開放了，比政策寬。' },
        ] },
      { id: 'cn19-ex-dmz-rules', task: 'firewall', title: 'DMZ 到內部的規則',
        reference: 'default deny\nallow tcp from 203.0.113.10 to 10.0.20.5 port 5432\nallow tcp from 10.0.99.0/24 to 10.0.20.0/24 port 22\nallow tcp from any to any established',
        packets: dmzPackets,
        statement: `公司的內部防火牆管住 DMZ（203.0.113.0/28，網頁伺服器 203.0.113.10、郵件伺服器 203.0.113.11）、伺服器網段（10.0.20.0/24，資料庫 10.0.20.5）、員工網段（10.0.10.0/24）與管理員網段（10.0.99.0/24）之間的流量。政策：只有網頁伺服器可以連資料庫，而且只能連 PostgreSQL 的 TCP 5432；管理員網段可以用 SSH（TCP 22）管理伺服器網段的任何主機；已建立連線的回應要能通過；其他一律擋下，包括 DMZ 的任何主機連員工網段。寫出這道防火牆的規則。${SYNTAX}`,
        hints: ['資料庫的規則要同時限制來源（只有 203.0.113.10）、目的（10.0.20.5）與連接埠（5432）。', '資料庫回應網頁伺服器的封包屬於已建立的連線；不要為它另開「資料庫可以連 DMZ」的規則。'],
        explanation: 'allow tcp from 203.0.113.10 to 10.0.20.5 port 5432 只開網頁伺服器到資料庫的一個服務：郵件伺服器、其他連接埠都不符合；allow tcp from 10.0.99.0/24 to 10.0.20.0/24 port 22 讓管理員以 SSH 管理伺服器網段；allow tcp from any to any established 放行回應；DMZ 連員工網段沒有任何規則符合，依 default deny 擋下。也可以把 established 寫成只放行 10.0.20.5 回到 203.0.113.10，或在最前面多加一條 deny tcp from 203.0.113.0/28 to 10.0.10.0/24，結果相同。',
        mistakes: [
          { answer: { rules: 'default deny\nallow tcp from 203.0.113.0/28 to 10.0.20.5 port 5432\nallow tcp from 10.0.99.0/24 to 10.0.20.0/24 port 22\nallow tcp from any to any established' }, why: '來源寫成整個 DMZ：郵件伺服器也能連資料庫，一台被攻破就能碰到資料。' },
          { answer: { rules: 'default deny\nallow tcp from 203.0.113.10 to 10.0.20.5\nallow tcp from 10.0.99.0/24 to 10.0.20.0/24 port 22\nallow tcp from any to any established' }, why: '沒有限制連接埠：網頁伺服器連資料庫的 SSH 也被放行。' },
          { answer: { rules: 'default deny\ndeny tcp from 203.0.113.0/28 to any\nallow tcp from 203.0.113.10 to 10.0.20.5 port 5432\nallow tcp from 10.0.99.0/24 to 10.0.20.0/24 port 22\nallow tcp from any to any established' }, why: '寬鬆的 deny 放在最前面：網頁伺服器連資料庫 5432 的封包先被它擋下，後面的 allow 輪不到。' },
          { answer: { rules: 'default deny\nallow tcp from 203.0.113.10 to 10.0.20.5 port 5432\nallow tcp from 10.0.99.0/24 to 10.0.20.0/24 port 22' }, why: '忘了 established：資料庫的回應被預設擋下，網頁伺服器永遠等不到查詢結果。' },
          { answer: { rules: 'default deny\nallow tcp from 203.0.113.10 to 10.0.0.0/8\nallow tcp from 10.0.99.0/24 to 10.0.20.0/24 port 22\nallow tcp from any to any established' }, why: '把網頁伺服器開放到整個 10.0.0.0/8：它能連員工電腦的檔案分享，DMZ 的隔離就沒了。' },
        ] },
      { id: 'cn19-ex-vpn-outer-destination', task: 'field', scene: 'cn19-vpn-tunnel', message: 'tunnel', layer: 'network', field: '目的 IP', title: '通道中外層封包的目的地',
        statement: '在「站對站 VPN」情境中，台北的電腦 10.1.0.20 送封包給高雄的檔案伺服器 10.2.0.30。這個封包在網際網路上傳送時（GW-A 到 GW-B 這一步），外層 IPv4 標頭的目的 IP 是什麼？',
        hints: ['網際網路上的路由器只看外層標頭轉送，它們知道怎麼送到私有位址 10.2.0.30 嗎？', '外層封包是兩台 VPN 閘道之間的封包，目的是誰的公開位址？'],
        explanation: '外層封包由 GW-A 送給 GW-B，目的 IP 是 GW-B 的公開位址 198.51.100.2；10.2.0.30 是私有位址，網際網路上無法路由，它和內層的其他標頭一起被加密，裝在外層封包的資料裡。GW-B 解密後才把內層封包交給 10.2.0.30。',
        mistakes: [
          { answer: { value: '10.2.0.30' }, why: '填了內層的目的位址：它被加密在外層封包裡，網際網路上的路由器看不到，也無法路由私有位址。' },
          { answer: { value: '192.0.2.1' }, why: '填了外層的來源：192.0.2.1 是送出外層封包的 GW-A。' },
          { answer: { value: '10.2.0.1' }, why: '填了 GW-B 的內側位址：通道的端點是 GW-B 在網際網路上的公開位址。' },
        ] },
      { id: 'cn19-ex-zero-trust-decision', task: 'table', scene: 'cn19-zero-trust', message: 'bob-office', node: 'proxy', table: '存取紀錄', row: '#3', column: '決定', title: '從內網來的請求',
        statement: '在「零信任」情境中，bob 坐在公司裡，用受管理的公司桌機（10.0.10.40）、通過了多因素驗證，請求人資系統的薪資頁面 /payroll。bob 是業務部門的員工。存取代理對這個請求（存取紀錄 #3）的決定是什麼？請填「放行」或「拒絕」。',
        hints: ['零信任的判斷依據有哪幾項？「來源網路是公司內網」是其中一項權限嗎？', '看 bob 的角色：業務部門可以讀薪資嗎？'],
        explanation: '拒絕。bob 的身分（已通過 MFA）與裝置（受管理、已更新）都通過，但他的角色沒有讀薪資的權限；零信任依最小權限，只允許這個身分需要的資源。他人在公司內網，在零信任中不代表任何權限。',
        mistakes: [
          { answer: { cell: '放行' }, why: '以為在公司內網、用公司電腦就可以信任：零信任不看來源網路，bob 沒有讀薪資的權限。' },
        ] },
    ],
  },
};
