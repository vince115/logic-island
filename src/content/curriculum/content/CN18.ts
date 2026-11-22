import type { NetworkScene, NodeTable, ProtocolHeader } from '@/lib/network/model';
import type { LessonContent } from '../schema';

/*
 * CN18 Network security basics (CN-4, packet-journey). A defensive, conceptual lesson: every attack is shown the way a
 * textbook shows it on the wire, never as operating instructions, and paired with its mitigation. Three fixed scenes:
 * ARP spoofing on a café LAN that turns into a man-in-the-middle, which TLS certificate validation stops (unknown_ca,
 * RFC 8446 §6.2); a SYN flood from spoofed RFC 5737 sources that fills a (teaching-size) SYN queue until a legitimate
 * SYN is dropped, then SYN cookies answering without taking a slot; and a phishing site on a lookalike name with a
 * valid certificate, a real-time relay of the password and one-time code, and a passkey request the browser refuses
 * because the rpId does not match the page's origin (WebAuthn). Addresses are RFC 5737 (internet) and RFC 1918 (café
 * LAN); MAC addresses are locally administered (02:…); names are example.com and the reserved .example / .test TLDs, and
 * every CA is invented, so nothing names a real host, CA or tool. Firewalls are introduced at the packet-filter level;
 * CN19 covers stateful firewalls, VPNs and zero trust.
 */

const MAC = { victim: '02:00:00:00:18:23', attacker: '02:00:00:00:18:66', gw: '02:00:00:00:18:01' };
const V = '192.168.50.23', A = '192.168.50.66', GW = '192.168.50.1', S = '203.0.113.80';

const ethernet = (from: string, to: string, type = '0x0800（IPv4）'): ProtocolHeader => ({ layer: 'link', protocol: 'Ethernet', fields: [
  { name: '來源 MAC', value: from }, { name: '目的 MAC', value: to }, { name: 'EtherType', value: type }] });
const ipv4 = (from: string, to: string, protocol: string): ProtocolHeader => ({ layer: 'network', protocol: 'IPv4', fields: [
  { name: '來源 IP', value: from }, { name: '目的 IP', value: to }, { name: '協定', value: protocol }] });
const tcp = (from: string, to: string, flags: string, extra: { name: string; value: string }[] = []): ProtocolHeader => ({ layer: 'transport', protocol: 'TCP', fields: [
  { name: '來源連接埠', value: from }, { name: '目的連接埠', value: to }, { name: '旗標', value: flags }, ...extra] });
const udp = (from: string, to: string): ProtocolHeader => ({ layer: 'transport', protocol: 'UDP', fields: [{ name: '來源連接埠', value: from }, { name: '目的連接埠', value: to }] });
/** As in CN06, the ARP message sits where an IP packet would (EtherType 0x0806), so the scene draws it at that layer. */
const arp = (opcode: string, senderMac: string, senderIp: string, targetMac: string, targetIp: string): ProtocolHeader => ({ layer: 'network', protocol: 'ARP', fields: [
  { name: '硬體類型', value: '1（Ethernet）' }, { name: '協定類型', value: '0x0800（IPv4）' }, { name: '操作碼', value: opcode },
  { name: '傳送端 MAC', value: senderMac }, { name: '傳送端 IP', value: senderIp }, { name: '目標 MAC', value: targetMac }, { name: '目標 IP', value: targetIp }] });
const app = (protocol: string, fields: [string, string][]): ProtocolHeader => ({ layer: 'application', protocol, fields: fields.map(([name, value]) => ({ name, value })) });

// ---- Scene 1: ARP spoofing on a café LAN, then TLS stops the man in the middle ----------------------------------
const ARP_HEAD = ['IP 位址', 'MAC 位址', '類型'];
const victimArp = (mac: string, changed?: number[]): NodeTable => ({ node: 'victim', name: '受害者的 ARP 快取', head: ARP_HEAD, rows: [[GW, mac, '動態']], ...changed ? { changed } : {} });

/** Section 2: the attacker poisons both ARP caches, relays a DNS query, then cannot pass the TLS certificate check. */
const arpMitm: NetworkScene = {
  id: 'cn18-arp-mitm', title: '咖啡店的 ARP 偽冒：中間人成形，卻過不了 TLS 的憑證檢查', model: 'tcp-ip',
  description: '咖啡店的 Wi-Fi 是一個 /24 的區域網路，閘道 192.168.50.1 同時是 DNS 伺服器。受害者的筆電（192.168.50.23）早就在 ARP 快取裡記著閘道真正的 MAC；同一個網路上的攻擊者（192.168.50.66）送出偽造的 ARP 回覆，讓受害者與閘道都把對方的 IP 對到攻擊者的 MAC。之後受害者的封包先經過攻擊者再被轉送，看看哪些內容他讀得到，以及他想冒充 www.example.com 時，憑證檢查在哪一列擋下他。這是說明攻擊樣貌的教學情境，不是操作步驟。',
  nodes: [
    { id: 'victim', label: '受害者的筆電', kind: 'host', addresses: [`IP ${V}/24`, `MAC ${MAC.victim}`, `閘道 ${GW}`] },
    { id: 'attacker', label: '攻擊者的筆電', kind: 'host', addresses: [`IP ${A}/24`, `MAC ${MAC.attacker}`] },
    { id: 'gw', label: '咖啡店的路由器（閘道、DNS）', kind: 'router', addresses: [`LAN ${GW}/24`, `MAC ${MAC.gw}`] },
    { id: 'server', label: 'www.example.com', kind: 'server', addresses: [`IP ${S}`, 'TCP 443'] },
  ],
  messages: [
    { id: 'poison-victim', from: 'attacker', to: 'victim', label: '偽造的 ARP 回覆：「192.168.50.1 在我這裡」',
      headers: [arp('2（回覆）', MAC.attacker, GW, MAC.victim, V), ethernet(MAC.attacker, MAC.victim, '0x0806（ARP）')],
      note: '沒有人發問，攻擊者卻主動送出一個 ARP 回覆：傳送端 IP 寫閘道的 192.168.50.1，傳送端 MAC 卻是自己的。CN06 的 ARP 沒有任何驗證，接收者無法確認回覆者真的擁有那個 IP，許多系統收到回覆就更新已有的快取項目。受害者的快取裡，閘道那一列的 MAC 被換成攻擊者的：快取被下毒了。',
      tables: [victimArp(MAC.attacker, [0])] },
    { id: 'poison-gw', from: 'attacker', to: 'gw', label: '偽造的 ARP 回覆：「192.168.50.23 在我這裡」',
      headers: [arp('2（回覆）', MAC.attacker, V, MAC.gw, GW), ethernet(MAC.attacker, MAC.gw, '0x0806（ARP）')],
      note: '攻擊者對閘道做同樣的事，冒充受害者的 IP。現在兩個方向的訊框都會送到攻擊者這裡：受害者要給閘道的、閘道要給受害者的。這就是區域網路上中間人攻擊的位置。',
      tables: [{ node: 'gw', name: '閘道的 ARP 快取', head: ARP_HEAD, rows: [[V, MAC.attacker, '動態']], changed: [0] }, victimArp(MAC.attacker)] },
    { id: 'dns-to-attacker', from: 'victim', to: 'attacker', label: 'DNS 查詢（訊框送到攻擊者）',
      headers: [app('DNS', [['查詢', 'A www.example.com'], ['交易 ID', '0x3c1d']]), udp('53001', '53'), ipv4(V, GW, '17（UDP）'), ethernet(MAC.victim, MAC.attacker)],
      payload: '明文的 DNS 查詢',
      note: '受害者要查 www.example.com 的位址。IP 標頭完全正常：目的 IP 是閘道 192.168.50.1。但它照被下毒的 ARP 快取填訊框，目的 MAC 是攻擊者的，所以交換器（或基地台）把訊框交給攻擊者。受害者完全看不出異狀。DNS 是明文，攻擊者讀得到受害者想去哪裡（破壞機密性），也可以改寫回答（破壞完整性，這就是 DNS 偽冒）。',
      tables: [victimArp(MAC.attacker)] },
    { id: 'dns-relay', from: 'attacker', to: 'gw', label: '攻擊者轉送查詢給真正的閘道',
      headers: [app('DNS', [['查詢', 'A www.example.com'], ['交易 ID', '0x3c1d']]), udp('53001', '53'), ipv4(V, GW, '17（UDP）'), ethernet(MAC.attacker, MAC.gw)],
      payload: '同一個 DNS 查詢，原封不動',
      note: '攻擊者把查詢原封不動轉給閘道，只換掉訊框的 MAC：來源是自己，目的是閘道真正的 MAC。回答也會經過他再轉回去。因為他一直轉送，受害者的網路照常運作，這正是中間人難以察覺的原因：他不阻斷，只是坐在中間看，或偷偷改。' },
    { id: 'client-hello', from: 'victim', to: 'attacker', label: 'ClientHello（往 www.example.com）',
      headers: [app('TLS 1.3', [['內容類型', '22'], ['握手訊息', 'ClientHello'], ['server_name（SNI）', 'www.example.com']]), tcp('51514', '443', 'PSH, ACK'), ipv4(V, S, '6（TCP）'), ethernet(MAC.victim, MAC.attacker)],
      payload: '明文的 ClientHello',
      note: '受害者要開 https://www.example.com/。TCP 交握在這裡省略：攻擊者沒有把連線轉給真正的伺服器，而是以 203.0.113.80 的名義自己接下這條連線，打算一邊和受害者做 TLS、一邊和真正的伺服器做 TLS，在中間解密。受害者送出 ClientHello，目的 IP 是伺服器，目的 MAC 仍是攻擊者。' },
    { id: 'fake-cert', from: 'attacker', to: 'victim', label: 'ServerHello…Certificate（攻擊者自己的憑證）',
      headers: [app('TLS 1.3', [['內容類型', '22 → 23'], ['握手訊息', 'ServerHello、EncryptedExtensions、Certificate、CertificateVerify'], ['憑證主體（解密後）', 'CN=www.example.com'], ['憑證簽發者（解密後）', 'CN=Cafe Proxy Root（攻擊者自己產生）']]),
        tcp('443', '51514', 'PSH, ACK'), ipv4(S, V, '6（TCP）'), ethernet(MAC.attacker, MAC.victim)],
      payload: '攻擊者的臨時公鑰、他自己做的憑證，以及用他自己的私鑰做的簽章',
      note: '來源 IP 寫的是 203.0.113.80，其實是攻擊者送的：IP 位址也被偽冒了。攻擊者沒有 www.example.com 真正的私鑰，所以只能拿自己產生的憑證：名稱想寫什麼都可以，簽章也對得上他自己的金鑰，但簽發者 Cafe Proxy Root 不在受害者的信任儲存區裡，信任鏈接不上任何受信任的根憑證（CN13）。',
      tables: [{ node: 'victim', name: '憑證檢查（www.example.com）', head: ['檢查', '結果'], changed: [0, 1, 2, 3], rows: [
        ['主機名稱比對', '相符（攻擊者可以在自己的憑證寫任何名稱）'], ['有效期間', '有效'],
        ['信任鏈', '失敗：簽發者 Cafe Proxy Root 不在信任儲存區'], ['結論', '中止交握']] }] },
    { id: 'alert', from: 'victim', to: 'attacker', label: 'Alert：unknown_ca',
      headers: [app('TLS 1.3', [['內容類型', '23'], ['內層內容類型（加密）', '21（alert）'], ['警示等級', 'fatal'], ['警示描述', 'unknown_ca'], ['描述代碼', '48']]),
        tcp('51514', '443', 'PSH, ACK'), ipv4(V, S, '6（TCP）'), ethernet(MAC.victim, MAC.attacker)],
      payload: '密文：這時雙方已有握手流量金鑰，警示也加密',
      note: '依 RFC 8446，信任鏈接不到受信任的 CA 時以 unknown_ca（48）中止交握（各家瀏覽器實際送出的警示描述可能不同，但一定中止）。瀏覽器改顯示全頁警告（Chrome 是 NET::ERR_CERT_AUTHORITY_INVALID），沒有送出任何 HTTP 請求，密碼與 Cookie 都沒有離開筆電。攻擊者仍在中間，但能做的只剩看 IP、SNI 與流量大小，或乾脆阻斷連線。',
      tables: [{ node: 'victim', name: '連線結果', head: ['主機', '結果', 'HTTP 請求'], changed: [0], rows: [['www.example.com', '中止交握，顯示憑證警告頁', '沒有送出']] }] },
  ],
};

// ---- Scene 2: a SYN flood from spoofed sources, then SYN cookies -------------------------------------------------
const QUEUE_HEAD = ['對方位址', '狀態', '說明'];
const half = (addr: string) => [addr, 'SYN_RCVD', '已送 SYN, ACK，等待 ACK'];
const BOGUS = ['192.0.2.11:40001', '192.0.2.12:40002', '192.0.2.13:40003', '192.0.2.14:40004'];
const queue = (n: number, changed?: number[]): NodeTable => ({ node: 'server', name: 'SYN 佇列（半開連線）', head: QUEUE_HEAD, rows: BOGUS.slice(0, n).map(half), ...changed ? { changed } : {} });
const usage = (open: number, dropped: number, cookies: number, changed?: number[]): NodeTable => ({ node: 'server', name: '佇列使用量', head: ['項目', '值'],
  rows: [['半開連線數', String(open)], ['佇列上限', '4'], ['被丟棄的 SYN', String(dropped)], ['以 SYN cookie 回覆', String(cookies)]], ...changed ? { changed } : {} });
const C2 = '198.51.100.25';

/** Section 4: four spoofed SYNs fill the queue, a real user's SYN is lost, SYN cookies let the retry through. */
const synFlood: NetworkScene = {
  id: 'cn18-syn-flood', title: 'SYN flood：偽冒的來源塞滿半開佇列，SYN cookies 讓正常使用者進來', model: 'tcp-ip',
  description: 'www.example.com（203.0.113.80）在 TCP 443 監聽。為了看得清楚，它的 SYN 佇列只能放 4 條半開連線（真實系統的上限是數百到數千，原理相同）。殭屍網路送出來源位址偽冒成 192.0.2.11 到 192.0.2.14 的 SYN，這些位址的主人不存在或不回應。看伺服器的佇列怎麼被塞滿、一般使用者（198.51.100.25）的 SYN 為什麼被丟棄，以及管理者啟用 SYN cookies 之後，使用者重送的 SYN 怎麼不占佇列就完成交握。',
  nodes: [
    { id: 'bots', label: '殭屍網路（許多被入侵的裝置）', kind: 'host', addresses: ['真實位址不會出現在封包裡'] },
    { id: 'spoofed', label: '被冒用的位址', kind: 'host', addresses: ['192.0.2.11 到 192.0.2.14', '不存在或不回應'] },
    { id: 'server', label: 'www.example.com', kind: 'server', addresses: [`IP ${S}`, 'TCP 443', 'SYN 佇列上限 4（教學用）'] },
    { id: 'client', label: '一般使用者', kind: 'host', addresses: [`IP ${C2}`] },
  ],
  messages: [
    { id: 'syn-1', from: 'bots', to: 'server', label: 'SYN（來源偽冒成 192.0.2.11）',
      headers: [tcp('40001', '443', 'SYN'), ipv4('192.0.2.11', S, '6（TCP）')],
      note: '路由器轉送封包只看目的位址，不檢查來源位址，所以殭屍網路可以在 IP 標頭隨便填一個來源。伺服器照 CN09 的三向交握處理：為這條連線在 SYN 佇列裡留一個半開的項目（SYN_RCVD），記下對方的位址與序號，等待第三個區段。',
      tables: [queue(1, [0]), usage(1, 0, 0, [0])] },
    { id: 'synack-1', from: 'server', to: 'spoofed', label: 'SYN, ACK 送到被冒用的位址',
      headers: [tcp('443', '40001', 'SYN, ACK'), ipv4(S, '192.0.2.11', '6（TCP）')],
      note: '伺服器把 SYN, ACK 送給 IP 標頭上寫的來源 192.0.2.11，而不是真正送出 SYN 的殭屍網路。那個位址沒有主機回應，所以 ACK 永遠不會來；伺服器還會重送 SYN, ACK 好幾次，半開的項目要等數十秒到一分鐘左右才放棄。若那個位址真的有主機，它會回 RST，項目反而立刻被清掉。偽冒者自己也收不到這個回覆，所以光靠偽冒來源完成不了交握。',
      tables: [queue(1), usage(1, 0, 0)] },
    { id: 'syn-burst', from: 'bots', to: 'server', label: '再 3 個 SYN（來源都是偽冒的）',
      headers: [tcp('40002、40003、40004', '443', 'SYN'), ipv4('192.0.2.12、192.0.2.13、192.0.2.14（偽冒）', S, '6（TCP）')],
      note: '殭屍網路接著送出更多 SYN，每個都換一個偽冒的來源，伺服器分不出它們和正常的連線請求。每個 SYN 都占一個半開的項目，佇列很快就滿了。真實的攻擊每秒送出數十萬個以上的 SYN，佇列的上限再大也一樣會被填滿。',
      tables: [queue(4, [1, 2, 3]), usage(4, 0, 0, [0])] },
    { id: 'legit-syn', from: 'client', to: 'server', label: '一般使用者的 SYN（被丟棄）', lost: true,
      headers: [tcp('51000', '443', 'SYN'), ipv4(C2, S, '6（TCP）')],
      note: '真正的使用者想開網頁，送出 SYN。佇列已滿，在沒有 SYN cookies 的情況下，伺服器只能把它丟掉，不回任何東西。使用者這邊只看到等待，TCP 約 1 秒後重送 SYN。伺服器沒有當機、頻寬也沒滿，只是一張小表被佔滿，服務就對正常使用者失效了：可用性被破壞。',
      tables: [queue(4), usage(4, 1, 0, [2])] },
    { id: 'legit-retry', from: 'client', to: 'server', label: '重送的 SYN（伺服器已啟用 SYN cookies）',
      headers: [tcp('51000', '443', 'SYN'), ipv4(C2, S, '6（TCP）')],
      note: '這時管理者啟用了 SYN cookies（Linux 的預設其實就是在佇列滿時自動改用它，這個情境為了對照先把它關閉）。使用者重送的 SYN 抵達，佇列仍是滿的，但伺服器不再丟棄它。' },
    { id: 'cookie-synack', from: 'server', to: 'client', label: 'SYN, ACK（序號就是 SYN cookie）',
      headers: [tcp('443', '51000', 'SYN, ACK', [{ name: 'Seq（伺服器的 ISN）', value: 'SYN cookie：由雙方位址與連接埠、時間與伺服器的秘密值算出' }]), ipv4(S, C2, '6（TCP）')],
      note: 'SYN cookie 的想法是：既然佇列放不下，就不要記。伺服器把「之後要驗證這條連線所需的資訊」算進自己的初始序號（ISN）裡送出去，佇列一個項目都不新增。只有伺服器知道秘密值，外人算不出有效的 cookie；而送出偽冒 SYN 的一方收不到這個 SYN, ACK，也就拿不到 cookie。',
      tables: [queue(4), usage(4, 1, 1, [3])] },
    { id: 'cookie-ack', from: 'client', to: 'server', label: 'ACK（帶回 cookie＋1）',
      headers: [tcp('51000', '443', 'ACK', [{ name: 'Ack', value: 'SYN cookie＋1' }]), ipv4(C2, S, '6（TCP）')],
      note: '真正的使用者收到了 SYN, ACK，照常回 ACK，確認號是 cookie＋1。伺服器用同一個秘密值重算並驗證，通過才建立連線，直接進入 ESTABLISHED。代價是 cookie 只放得下少量資訊，部分 TCP 選項可能受限，所以系統通常只在佇列滿時才使用它。偽冒的半開項目仍要等逾時才會消失。',
      tables: [{ node: 'server', name: '已建立的連線', head: ['對方位址', '狀態'], rows: [[`${C2}:51000`, 'ESTABLISHED']], changed: [0] }, usage(4, 1, 1)] },
  ],
};

// ---- Scene 3: phishing on a lookalike name with a valid certificate ---------------------------------------------
const PHISH = 'www.example.com.secure-login.example', PHISH_IP = '198.51.100.200', B = '192.0.2.10';
const https = (fields: [string, string][]) => app('HTTP/1.1（在 TLS 紀錄裡）', fields);

/** Section 5: the padlock appears on the lookalike site; the password and code are relayed; a passkey is refused. */
const phishing: NetworkScene = {
  id: 'cn18-phishing', title: '釣魚網站：有效的憑證、鎖頭照樣出現，通行金鑰卻用不出去', model: 'tcp-ip',
  description: '使用者收到一封自稱來自銀行的信，點了裡面的連結 https://www.example.com.secure-login.example/login。這個名稱由攻擊者合法註冊（.example 是保留給文件用的頂級網域，代表任何真的買得到的網域），並替它申請了有效的憑證。看 DNS、憑證檢查與鎖頭都一切正常，密碼與簡訊驗證碼卻被即時轉送到真正的銀行；最後對照：如果銀行用的是通行金鑰，瀏覽器在哪裡擋下它。',
  nodes: [
    { id: 'browser', label: '使用者的瀏覽器', kind: 'host', addresses: [`IP ${B}`] },
    { id: 'resolver', label: 'DNS 解析器', kind: 'resolver', addresses: ['IP 192.0.2.53'] },
    { id: 'phish', label: '釣魚網站', kind: 'server', addresses: [`IP ${PHISH_IP}`, PHISH] },
    { id: 'bank', label: '真正的銀行 www.example.com', kind: 'server', addresses: [`IP ${S}`] },
  ],
  messages: [
    { id: 'dns-query', from: 'browser', to: 'resolver', label: `DNS 查詢 A ${PHISH}`,
      headers: [app('DNS', [['查詢', `A ${PHISH}`]]), udp('53530', '53'), ipv4(B, '192.0.2.53', '17（UDP）')],
      note: '瀏覽器先解析網址的主機名稱。這個名稱開頭是 www.example.com，看起來像銀行，但網域名稱要由右往左讀：頂級網域 .example，往左一段是 secure-login，所以真正擁有它的是 secure-login.example，www.example.com 只是攻擊者自己取的子網域標籤。',
      tables: [{ node: 'browser', name: '網址檢查', head: ['項目', '值'], changed: [0, 1, 2], rows: [
        ['完整主機名稱', PHISH], ['可註冊網域（真正的擁有者）', 'secure-login.example'], ['開頭看起來像', 'www.example.com']] }] },
    { id: 'dns-answer', from: 'resolver', to: 'browser', label: `DNS 回答 A ${PHISH_IP}`,
      headers: [app('DNS', [['回答', `A ${PHISH_IP}`], ['TTL', '300']]), udp('53', '53530'), ipv4('192.0.2.53', B, '17（UDP）')],
      note: '解析器回答 198.51.100.200。這個回答是真的：沒有 DNS 偽冒、沒有快取下毒，這個網域本來就指向攻擊者的伺服器。釣魚不需要攻破任何協定，它騙的是人。' },
    { id: 'client-hello', from: 'browser', to: 'phish', label: 'ClientHello',
      headers: [app('TLS 1.3', [['內容類型', '22'], ['握手訊息', 'ClientHello'], ['server_name（SNI）', PHISH]]), tcp('51800', '443', 'PSH, ACK'), ipv4(B, PHISH_IP, '6（TCP）')],
      note: '瀏覽器照常和 198.51.100.200 建立 TCP 連線並開始 TLS 交握，SNI 是使用者點的那個完整名稱。到目前為止，每一步都和連到真正的網站一模一樣。' },
    { id: 'certificate', from: 'phish', to: 'browser', label: 'Certificate（有效的憑證）',
      headers: [app('TLS 1.3', [['內容類型', '23'], ['握手訊息（解密後）', 'Certificate'], ['主體別名（SAN）', `DNS:${PHISH}`], ['簽發者', 'CN=Example DV CA']]), tcp('443', '51800', 'PSH, ACK'), ipv4(PHISH_IP, B, '6（TCP）')],
      payload: '密文：網域驗證（DV）憑證與 CertificateVerify',
      note: '攻擊者擁有這個網域，所以 CA 用自動化的網域驗證就簽發了憑證：CA 只確認申請人控制這個網域，不審查網站是誰、做什麼。名稱相符、信任鏈接到信任儲存區、在有效期間內，CertificateVerify 也正確，因為攻擊者真的握有這張憑證的私鑰。瀏覽器顯示安全連線的標示（鎖頭），這完全正確：連線是加密的，而且對方確實是 secure-login.example。',
      tables: [{ node: 'browser', name: '憑證檢查', head: ['檢查', '結果'], changed: [0, 1, 2, 3, 4], rows: [
        ['主機名稱比對', '相符'], ['信任鏈', '通過（Example DV CA 在信任儲存區）'], ['有效期間', '有效'],
        ['網址列', '顯示加密連線的標示（鎖頭）'], ['這是不是銀行', '憑證不回答這個問題']] }] },
    { id: 'post-password', from: 'browser', to: 'phish', label: 'POST /login（密碼與簡訊驗證碼）',
      headers: [https([['方法', 'POST'], ['路徑', '/login'], ['Host', PHISH]]), tcp('51800', '443', 'PSH, ACK'), ipv4(B, PHISH_IP, '6（TCP）')],
      payload: '加密前：帳號、密碼，以及使用者剛收到的 6 位數簡訊驗證碼',
      note: '頁面和銀行的登入頁長得一樣，還照樣要求簡訊驗證碼。使用者全部填好送出。TLS 把它們加密得很好，路上沒有人讀得到，然後安全地交給了攻擊者。加密保護的是傳輸過程，不判斷收件者是不是你以為的那個人。' },
    { id: 'relay-login', from: 'phish', to: 'bank', label: '攻擊者立刻用偷到的資料登入銀行',
      headers: [https([['方法', 'POST'], ['路徑', '/login'], ['Host', 'www.example.com']]), tcp('47210', '443', 'PSH, ACK'), ipv4(PHISH_IP, S, '6（TCP）')],
      payload: '加密前：剛偷到的帳號、密碼與驗證碼',
      note: '釣魚伺服器在驗證碼失效之前，把帳號、密碼與驗證碼即時轉送到真正的銀行。銀行看到的一切都正確，於是登入成功，只是坐在電腦前的是攻擊者。這種即時轉送的釣魚說明了：簡訊碼與驗證器 App 的一次性密碼（OTP）比只有密碼好，但擋不住會即時轉送的釣魚。',
      tables: [{ node: 'bank', name: '登入紀錄', head: ['來源 IP', '檢查', '結果'], changed: [0], rows: [[PHISH_IP, '密碼正確、簡訊驗證碼正確', '登入成功（其實是攻擊者）']] }] },
    { id: 'webauthn', from: 'phish', to: 'browser', label: '對照：要求通行金鑰（rpId example.com）',
      headers: [https([['回應', '200 OK'], ['頁面要求', 'WebAuthn 登入（通行金鑰）'], ['rpId（頁面要求的網域）', 'example.com']]), tcp('443', '51800', 'PSH, ACK'), ipv4(PHISH_IP, B, '6（TCP）')],
      payload: '釣魚頁面呼叫瀏覽器的 WebAuthn API，要求 example.com 的通行金鑰簽章',
      note: '對照：假設這位使用者在銀行改用通行金鑰（FIDO2／WebAuthn）。通行金鑰是一對金鑰，私鑰留在使用者的裝置裡，而且綁定銀行的網域。釣魚頁面要求 example.com 的通行金鑰，但瀏覽器會檢查：rpId 必須是目前頁面網域本身或它的上層網域，而這個頁面的網域屬於 secure-login.example。檢查不通過，瀏覽器直接拒絕，根本不會讓使用者選擇金鑰，沒有任何可以轉送的東西。判斷由瀏覽器做，不靠使用者看得出網址的差別。',
      tables: [{ node: 'browser', name: '通行金鑰檢查', head: ['項目', '值'], changed: [0, 1, 2, 3], rows: [
        ['目前頁面的來源', `https://${PHISH}`], ['頁面要求的 rpId', 'example.com'], ['rpId 是頁面網域本身或上層網域嗎', '否'],
        ['結果', '拒絕：example.com 的通行金鑰不會被使用']] }] },
  ],
};

/** CN18 Network security basics (packet-journey): scenes and exercises checked by the network capability. */
export const CN18: LessonContent = {
  lessonId: 'CN18',
  motivation: '你在咖啡店連上 Wi-Fi，打開銀行網站登入。這短短幾秒，攻擊者有好幾個可以插手的位置：同一個網路上的人可以讓你的封包先經過他、DNS 的回答可能被換掉、銀行的伺服器可能正被大量假連線癱瘓，而你點開的那個連結也可能根本不是銀行。這一課用機密性、完整性與可用性三個問題分析每一種威脅，逐步看中間人、偽冒、DoS／DDoS 與釣魚在封包上長什麼樣子，再把每個風險對到加密、驗證、防火牆等防護。重點不是學會攻擊，而是看到一個網路情境時，能指出攻擊者可能站在哪裡、他能做什麼，以及該用什麼擋住他。',
  sections: [
    {
      id: 'cia', title: 'CIA 三要素：用三個問題分析每一種威脅',
      blocks: [
        { type: 'p', text: '網路安全要保護的東西，可以用三個性質描述，合稱 CIA 三要素（CIA triad）：機密性（Confidentiality），只有該看的人看得到；完整性（Integrity），資料在路上沒有被偷改，或者改了一定會被發現；可用性（Availability），需要的時候服務真的能用。分析一個威脅時，先問它破壞了哪一個性質，防護的方向就跟著出來了：怕被看就加密，怕被改就驗證，怕被癱瘓就分散與限制。' },
        { type: 'table', head: ['性質', '要問的問題', '被破壞的例子', '典型防護'], rows: [
          ['機密性', '誰讀得到這些資料？', '竊聽（eavesdropping）：在開放的 Wi-Fi 收下別人的明文 HTTP 與 DNS', '加密：TLS（CN13）、VPN、WPA3'],
          ['完整性', '資料有沒有被改過？', '中間人把下載連結換成惡意檔案、偽冒的 DNS 回答把你送到假網站', '訊息驗證碼、數位簽章、AEAD 加密、DNSSEC'],
          ['可用性', '服務還能不能用？', 'DoS／DDoS 塞滿伺服器的連線表或整條鏈路', '備援、速率限制、SYN cookies、CDN 與清洗中心'],
        ] },
        { type: 'p', text: '三個性質背後還有一個前提：身分驗證（authentication），也就是確定對方是誰。把資料加密送給錯的人，機密性等於沒有；收到一則「來自閘道」的訊息卻無法確認真的是閘道送的，完整性也無從談起。這一課的偽冒、中間人與釣魚，攻擊的其實都是身分：假冒成別的位址、別的主機或別的網站。很多攻擊也同時破壞好幾個性質，例如中間人既能偷看（機密性）也能竄改（完整性），還能選擇不轉送（可用性）。' },
        { type: 'callout', tone: 'note', title: '被動攻擊與主動攻擊', text: '竊聽與流量分析是被動攻擊：攻擊者只是收下經過的封包，不改任何東西，因此幾乎無法察覺，只能事先用加密預防。竄改、偽冒、阻斷服務是主動攻擊：攻擊者送出自己的封包，會留下痕跡，可以偵測與阻擋。所以防禦的原則是「被動的靠加密預防，主動的靠驗證與監控發現」。' },
      ],
    },
    {
      id: 'mitm', title: '中間人攻擊：公共 Wi-Fi 上的 ARP 偽冒與 TLS 的防線',
      blocks: [
        { type: 'p', text: '中間人攻擊（man-in-the-middle，MITM）是攻擊者把自己插進通訊雙方之間，兩邊都以為自己在直接對話。在區域網路上最經典的做法是 ARP 偽冒（ARP spoofing，也叫 ARP 快取下毒）。CN06 學過，主機靠 ARP 快取把閘道的 IP 對到 MAC；ARP 沒有任何驗證，收到回覆的主機無法確認回覆者真的擁有那個 IP。同一個網路上的攻擊者只要送出偽造的回覆，就能讓別人把要給閘道的訊框送給他。' },
        { type: 'p', text: '下面的情境中，注意三件事：受害者 ARP 快取裡閘道那一列的 MAC 怎麼被換掉；之後每個訊框的 IP 標頭都正常，只有目的 MAC 指向攻擊者；以及攻擊者想冒充 www.example.com 時，TLS 的憑證檢查在哪一列擋下他。' },
        { type: 'example', id: 'cn18-arp-mitm' },
        { type: 'p', text: '為什麼 TLS 能擋住已經坐在中間的人？攻擊者只有兩條路，兩條都走不通。第一，原封不動轉送真正伺服器的憑證：可是他沒有對應的私鑰，簽不出 CertificateVerify；要是他偷換了雙方的臨時公鑰，簽章與 Finished 都會對不上（CN13）。他只能轉送自己解不開的密文。第二，換成自己的憑證：受信任的 CA 不會替他簽 www.example.com，自己簽的接不上信任鏈；拿他自己網域的有效憑證，又會名稱不符。兩種情況瀏覽器都會中止交握並顯示警告。於是中間人被降級成只能看到 IP、SNI 與流量大小，或者乾脆阻斷連線。' },
        { type: 'p', text: '公共 Wi-Fi 的風險不只 ARP 偽冒。下表整理常見的情形與防護：' },
        { type: 'table', head: ['公共 Wi-Fi 的風險', '攻擊者做什麼', '防護'], rows: [
          ['開放網路（沒有密碼）的竊聽', '收下空中所有沒加密的封包', '只用 HTTPS；支援時選用 WPA3 的 Enhanced Open（OWE），每個用戶端各自加密'],
          ['大家共用密碼的 WPA2-Personal', '知道密碼又錄下別人的四向交握（CN04），就能解開那個人的 Wi-Fi 流量', 'WPA3-SAE；內容仍要靠 TLS 保護'],
          ['ARP 偽冒', '讓別人把訊框送給他，再轉送出去', '基地台的用戶端隔離（client isolation）、交換器的動態 ARP 檢查（DAI）；TLS 或 VPN'],
          ['邪惡雙胞胎（evil twin）', '架一個和咖啡店同名 SSID 的假基地台，讓你連上他的網路', '不讓裝置自動連線公共 SSID；靠 TLS 憑證檢查與 VPN'],
          ['假的登入入口頁', '要你輸入重要帳密，或要求安裝一個「憑證」', '不在入口頁輸入重要密碼；絕不安裝來路不明的根憑證，裝了就等於讓中間人通過 TLS 檢查'],
        ] },
        { type: 'callout', tone: 'warning', title: '常見誤解：Wi-Fi 有密碼，同一個網路的人就看不到我的資料', text: '咖啡店貼在牆上的 Wi-Fi 密碼，只把網路外面的人擋在外面。同一個網路裡的每個人都知道這組密碼，ARP 偽冒也根本不需要破解 Wi-Fi 加密：攻擊者本來就是網路的一員，Wi-Fi 加密在基地台就解開了。真正保護你內容的是端對端的 TLS，所以在公共網路上看到憑證警告，要停下來關掉頁面，而不是按「繼續前往」。' },
      ],
    },
    {
      id: 'spoofing', title: '偽冒：IP、MAC、DNS 與電子郵件寄件者',
      blocks: [
        { type: 'p', text: '偽冒（spoofing）是假冒別人的身分或位址。網路協定的許多欄位是由傳送者自己填寫的，接收者沒有辦法驗證：IP 標頭的來源位址、訊框的來源 MAC、ARP 回覆的傳送端、電子郵件的寄件者都是如此。協定設計時假設大家誠實，安全機制必須另外加上去。下表整理常見的偽冒與對應的防護：' },
        { type: 'table', head: ['偽冒什麼', '為什麼做得到', '常見用途', '防護'], rows: [
          ['IP 來源位址', '路由器只依目的位址轉送，不檢查來源', '隱藏 DoS 的來源、反射放大攻擊', '網路業者在入口丟掉不屬於自己客戶的來源位址（BCP 38，RFC 2827）'],
          ['MAC 位址', '網卡的 MAC 可以用軟體更改', '繞過以 MAC 過濾的 Wi-Fi、冒充別的裝置', '不把 MAC 過濾當成驗證；以 802.1X 用帳號或憑證認證，交換器的連接埠安全'],
          ['ARP 回覆', 'ARP 沒有任何驗證', '區域網路上的中間人', '動態 ARP 檢查、用戶端隔離、TLS'],
          ['DNS 回答', '傳統 DNS 走 UDP、沒有簽章', '快取下毒：讓解析器記住假的位址', '隨機的交易 ID 與來源連接埠、DNSSEC 簽章；DoT／DoH 保護使用者到解析器那一段'],
          ['電子郵件寄件者', 'SMTP 的寄件者欄位由寄信端自己寫', '冒充主管或銀行寄出釣魚信', 'SPF、DKIM、DMARC'],
        ] },
        { type: 'p', text: '偽冒 IP 來源有一個天生的限制：回覆會送到被冒用的位址，偽冒者自己收不到。所以他完成不了 TCP 三向交握，因為猜不到伺服器隨機選的初始序號，也就無法用假位址登入或下載資料。偽冒 IP 主要用在只需要單向送出的攻擊：送一大堆 SYN（下一節的 SYN flood），或讓別人的回覆湧向受害者（反射放大）。' },
        { type: 'p', text: 'DNS 快取下毒（cache poisoning）在概念上是這樣的：CN12 的遞迴解析器會把回答依 TTL 快取起來。如果攻擊者能在真正的權威伺服器回答之前，送給解析器一個看起來像回答的假封包，而且交易 ID 與連接埠都剛好對得上，假的 A 紀錄就會被快取，在 TTL 內所有問同一個名稱的使用者都被送到錯的位址。2008 年公開的 Kaminsky 攻擊讓這件事變得實際可行，之後解析器普遍把來源連接埠也隨機化，攻擊者要猜的範圍從 16 位元的交易 ID 再乘上數萬個可能的連接埠。根本的解法是 DNSSEC：權威伺服器替紀錄簽章，會驗證簽章的解析器能拒絕假答案。即使 DNS 真的被下毒，HTTPS 仍是最後一道防線：假位址上的伺服器拿不出 www.example.com 的有效憑證。' },
        { type: 'p', text: '電子郵件只簡單提一下：SPF 在 DNS 公布哪些伺服器可以替這個網域寄信，DKIM 讓寄件網域替信件簽章，DMARC 告訴收件端兩者都不通過、或寄件者欄位對不上時該怎麼處理（隔離或拒收）。它們能擋下直接冒用銀行網域的信，但擋不住從一個長得很像的網域合法寄出的信，這就是下一個主題：釣魚。' },
      ],
    },
    {
      id: 'dos', title: 'DoS 與 DDoS：讓服務無法使用',
      blocks: [
        { type: 'p', text: '阻斷服務（Denial of Service，DoS）攻擊的目標是可用性：不偷也不改資料，只讓正常的使用者用不了服務。做法是耗盡某種有限的資源，例如伺服器的連線表、CPU、記憶體，或整條網路鏈路的頻寬。分散式阻斷服務（DDoS）從大量被入侵的裝置（殭屍網路，常見的是安全性不佳的路由器與攝影機）同時發動，來源成千上萬，很難靠封鎖某個 IP 擋下。' },
        { type: 'p', text: 'SYN flood 是協定狀態耗盡的經典例子。CN09 的三向交握中，伺服器收到 SYN 後，要在 SYN 佇列裡留一個半開連線（SYN_RCVD）的項目，等對方的 ACK；等不到還會重送 SYN, ACK，數十秒後才放棄。攻擊者送出大量來源偽冒的 SYN，又永遠不回 ACK，佇列很快就被填滿，正常使用者的 SYN 只能被丟棄。' },
        { type: 'example', id: 'cn18-syn-flood' },
        { type: 'p', text: 'SYN cookies 的關鍵是「收到 SYN 時先不記任何東西」。伺服器把驗證這條連線需要的資訊，用只有自己知道的秘密值算進 SYN, ACK 的初始序號；對方回來的 ACK 若帶著正確的 cookie＋1，才真正建立連線。偽冒來源的一方收不到 SYN, ACK，自然回不了正確的 ACK，所以攻擊再多也不會占用任何記憶體。這裡只講概念，各系統實際怎麼編碼 cookie 不在本課範圍。' },
        { type: 'table', head: ['攻擊類型', '耗盡什麼', '例子', '主要防護'], rows: [
          ['協定狀態耗盡', '連線表、半開佇列', 'SYN flood', 'SYN cookies、縮短逾時、由負載平衡器或代理先完成交握'],
          ['流量型（volumetric）', '整條鏈路的頻寬', '大量的 UDP 封包塞滿網站的對外線路', '上游的清洗中心（scrubbing）、CDN、anycast 分散流量'],
          ['反射放大（reflection／amplification）', '受害者的頻寬', '把來源偽冒成受害者，向開放的 DNS、NTP 等 UDP 服務送出小請求，大得多的回覆全湧向受害者', 'BCP 38 讓偽冒的封包出不了門；關閉開放解析器與不必要的 UDP 服務；清洗'],
          ['應用層', '伺服器的 CPU、資料庫', '大量看似正常的 HTTP 請求打在最貴的頁面', '速率限制、快取、驗證挑戰'],
        ] },
        { type: 'p', text: '反射放大結合了偽冒與 UDP：UDP 沒有交握，伺服器收到請求就直接回覆給 IP 標頭上的來源。攻擊者把來源寫成受害者的位址，回覆就送到受害者那裡；挑選回覆比請求大很多的服務，送出 1 份流量就能讓受害者收到數十倍，少數設定不當的服務曾被量到上萬倍。真實攻擊的流量可達每秒數 Tbps，遠超過一般網站的對外頻寬。' },
        { type: 'p', text: '這也說明了防護要放在哪裡。速率限制（rate limiting）限制每個來源或每個帳號在一段時間內的請求數，對應用層攻擊有效。但流量型攻擊在封包到達你的伺服器之前，就已經塞滿你和網路業者之間的線路，自己機房裡的設備再強也來不及；必須在上游處理：CDN 與清洗中心擁有比攻擊更大的頻寬，先收下所有流量，濾掉攻擊再把乾淨的部分轉給你；anycast 讓許多地點宣告同一個 IP 位址，BGP（CN08）把攻擊流量分散到各地最近的節點，沒有一個地點獨自承受全部。' },
        { type: 'callout', tone: 'tip', title: '速率限制也會誤傷', text: '只依來源 IP 限制請求數時要小心：學校、公司或行動網路的大量使用者常透過 NAT（CN06）共用同一個公開位址，看起來就像一個「請求很多」的來源。實務上會結合帳號、Cookie 與行為特徵，並對超過門檻的請求先回 429 Too Many Requests 或要求驗證，而不是直接封鎖。' },
      ],
    },
    {
      id: 'phishing', title: '釣魚：鎖頭證明不了網站是誰',
      blocks: [
        { type: 'p', text: '釣魚（phishing）不攻破任何協定，而是騙使用者自己把密碼、驗證碼或付款資料交出去。常見的入口是一封假冒銀行、主管或快遞的信或簡訊，裡面的連結指向一個長得很像的網域（lookalike domain）。下表列出常見的仿冒手法，例子都是虛構的保留網域：' },
        { type: 'table', head: ['手法', '例子', '怎麼看穿'], rows: [
          ['打錯字（typosquatting）', 'www.exmaple.test', '一個字母一個字母核對網域'],
          ['形狀相近的字元', 'www.examp1e.test（數字 1 取代字母 l）', '放大看，或用書籤與密碼管理器而不是手打'],
          ['國際化網域的同形字', '用西里爾字母 а 取代拉丁字母 a，外觀幾乎相同', '瀏覽器懷疑時會改顯示成 xn-- 開頭的 punycode'],
          ['子網域把戲', 'www.example.com.secure-login.example', '網域由右往左讀：真正的擁有者是最後的 secure-login.example'],
        ] },
        { type: 'p', text: '下面的情境中，攻擊者合法擁有這個仿冒網域，DNS 回答是真的，憑證也是有效的。注意瀏覽器的憑證檢查每一列都通過，鎖頭照樣出現；最後再對照通行金鑰的情形：' },
        { type: 'example', id: 'cn18-phishing' },
        { type: 'p', text: '鎖頭的意思只是：你和「持有這個網域憑證的人」之間的連線是加密的。網域驗證（DV）憑證只確認申請人控制這個網域，可以免費、自動地在幾分鐘內取得，所以釣魚網站幾乎都有 HTTPS。防守方也有工具：憑證透明度（Certificate Transparency）把每一張公開簽發的憑證記在公開的紀錄裡，銀行可以監控有沒有人替長得像自己的名稱申請憑證，及早發現並檢舉。' },
        { type: 'p', text: '多因素驗證（MFA）要求密碼之外再提供一個因素，大幅提高門檻，但不同的形式抵抗釣魚的能力不同。簡訊驗證碼與驗證器 App 的一次性密碼都是使用者看得到、能自己輸入的字串，會即時轉送的釣魚網站可以在幾十秒內拿去用，就像情境裡那樣；推播通知則可能被攻擊者連續發送，直到使用者不耐煩按下同意。能抵抗釣魚的是 FIDO2／WebAuthn 的實體安全金鑰與通行金鑰（passkey）：私鑰從不離開裝置，簽章綁定網站的網域，而且由瀏覽器檢查網域，在錯的網域上根本用不出來。密碼管理器也有類似的效果：它依網域自動填入，在仿冒網域上不填，就是一個值得停下來的警訊。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：有 HTTPS 鎖頭就不會被釣魚', text: '鎖頭只證明連線加密、對方握有這個網域的憑證，不證明這個網域屬於你以為的那家銀行。情境裡的釣魚網站每一項憑證檢查都通過，你的密碼被完整加密，然後安全地送給了騙子。要看的是網址列的網域，由右往左讀到真正的擁有者；更可靠的做法是從書籤或 App 進入，不點信裡的連結，並盡量改用通行金鑰。' },
      ],
    },
    {
      id: 'defense', title: '防火牆與縱深防禦：替每個風險找到防護',
      blocks: [
        { type: 'p', text: '防火牆（firewall）放在網路的邊界，依照規則檢查經過的封包，決定放行或丟棄。最基本的是封包過濾：只看標頭裡的來源與目的 IP、協定與連接埠，規則由上往下比對，第一條符合的規則決定結果，最後一條通常是「其他一律拒絕」。例如一台只提供 HTTPS 的伺服器：' },
        { type: 'table', head: ['順序', '來源', '目的', '協定與連接埠', '動作'], rows: [
          ['1', '任何位址', '203.0.113.80', 'TCP 443', '允許'],
          ['2', '192.0.2.0/24（管理網段）', '203.0.113.80', 'TCP 22', '允許'],
          ['3', '任何位址', '任何位址', '任何', '拒絕'],
        ] },
        { type: 'p', text: '這樣的規則讓伺服器上其他不小心開著的服務（例如資料庫的連接埠）從外面連不到，也讓 SSH 只對管理網段開放，縮小了攻擊面。防火牆怎麼記住連線的狀態、VPN 怎麼安全地連回內部網路，以及為什麼現代的做法改成「不因為在內網就信任」的零信任，是 CN19 的主題。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：有防火牆就能擋下所有攻擊', text: '防火牆依位址與連接埠做決定，規則 1 一定得放行 TCP 443，否則沒有人能用網站；走在 443 裡的 SQL 注入（DB17）、帶著惡意內容的請求，它都看不出來，加密的內容更看不到。使用者自己點連結連出去的釣魚網站，對防火牆來說是一條正常的出站 HTTPS 連線。ARP 偽冒發生在同一個區域網路裡，封包根本不經過邊界的防火牆。流量型 DDoS 在抵達防火牆之前就已經塞滿線路。防火牆是必要的一層，但只是其中一層。' },
        { type: 'p', text: '所以安全靠的是縱深防禦（defense in depth）：每一層各擋一部分，任何一層失守還有下一層，搭配 DB17 的最小權限，就算有人進來，能造成的損害也有限。分析一個網路情境時，沿著封包的路徑走一遍：使用者、Wi-Fi、區域網路、DNS、網際網路、伺服器的邊界與伺服器本身，在每個位置問「攻擊者站在這裡能看、能改、能擋，還是能冒充」，再對到 CIA 與防護。以本課的咖啡店登入為例：' },
        { type: 'table', head: ['攻擊者介入的位置', '風險', '破壞的性質', '防護'], rows: [
          ['空中的 Wi-Fi 訊號', '竊聽明文流量', '機密性', 'TLS；WPA3 或 Enhanced Open'],
          ['同一個區域網路', 'ARP 偽冒形成中間人', '機密性、完整性', 'TLS 憑證檢查、用戶端隔離、動態 ARP 檢查、VPN'],
          ['假的同名基地台', '邪惡雙胞胎', '機密性、完整性', '不自動連線公共 SSID、TLS 憑證檢查、VPN'],
          ['DNS 解析', '快取下毒、偽冒的回答', '完整性', 'DNSSEC、DoT／DoH、HTTPS 的憑證檢查'],
          ['網際網路上的來源位址', 'IP 偽冒', '完整性（假冒來源）', '網路業者的入口過濾（BCP 38）'],
          ['伺服器與它的上游線路', 'SYN flood、反射放大、應用層 DoS', '可用性', 'SYN cookies、速率限制、CDN 與清洗中心、anycast'],
          ['伺服器的網路邊界', '連到不該對外的服務', '機密性、完整性', '防火牆只開放需要的連接埠（CN19）'],
          ['使用者與信箱', '釣魚、仿冒網域、寄件者偽冒', '機密性（帳密外洩）', '核對網域、密碼管理器、通行金鑰；SPF、DKIM、DMARC'],
        ] },
      ],
    },
  ],
  examples: [],
  exercises: [],
  network: {
    scenes: [arpMitm, synFlood, phishing],
    exercises: [
      { id: 'cn18-poisoned-arp', task: 'table', scene: 'cn18-arp-mitm', message: 'poison-victim', node: 'victim', table: '受害者的 ARP 快取', row: '192.168.50.1', column: 'MAC 位址',
        title: '被下毒的 ARP 項目',
        statement: '在「咖啡店的 ARP 偽冒」情境裡，攻擊者送出第一個偽造的 ARP 回覆之後，受害者 ARP 快取中 192.168.50.1 那一列的 MAC 位址是什麼？（照情境中的格式寫）',
        hints: ['看偽造回覆的「傳送端 IP」與「傳送端 MAC」：它聲稱誰的 IP 對到誰的 MAC？', '受害者沒有辦法驗證回覆，它照單全收。'],
        explanation: '偽造的回覆寫著「傳送端 IP 192.168.50.1，傳送端 MAC 02:00:00:00:18:66」。ARP 沒有驗證，受害者用它更新快取，所以閘道那一列的 MAC 變成攻擊者的 02:00:00:00:18:66。之後受害者要送給閘道的每個訊框，目的 MAC 都是攻擊者，IP 標頭卻完全正常。',
        mistakes: [
          { answer: { cell: '02:00:00:00:18:01' }, why: '那是閘道真正的 MAC，下毒之前的值；偽造的回覆已經把它換掉了。' },
          { answer: { cell: '02:00:00:00:18:23' }, why: '那是受害者自己的 MAC（偽造回覆的目標 MAC），不是快取中閘道那一列的值。' },
        ] },
      { id: 'cn18-unknown-ca', task: 'field', scene: 'cn18-arp-mitm', message: 'alert', layer: 'application', field: '警示描述',
        title: '中間人的憑證被拒絕',
        statement: '同一個情境裡，攻擊者拿自己產生的憑證冒充 www.example.com。受害者的瀏覽器以 TLS 警示中止交握，依 RFC 8446 的警示描述是哪一個？（填英文名稱）',
        hints: ['看受害者的憑證檢查表：哪一列失敗？', '名稱相符、也在有效期間內，問題在簽發者。'],
        explanation: '攻擊者的憑證名稱寫得對，也在有效期間內，但簽發者 Cafe Proxy Root 不在信任儲存區，信任鏈接不到任何受信任的根憑證。RFC 8446 為這種情形定義的是 unknown_ca（代碼 48）。瀏覽器中止交握，沒有送出任何 HTTP 請求。',
        mistakes: [
          { answer: { value: 'certificate_expired' }, why: '憑證檢查表的有效期間是「有效」；certificate_expired 用在憑證過期或還沒生效（CN13 的 old.example.com）。' },
          { answer: { value: 'bad_certificate' }, why: '這張憑證本身沒有損壞，簽章也對得上攻擊者自己的金鑰；問題是簽發者不受信任，有更精確的 unknown_ca。' },
        ] },
      { id: 'cn18-synack-target', task: 'field', scene: 'cn18-syn-flood', message: 'synack-1', layer: 'network', field: '目的 IP',
        title: 'SYN, ACK 送給誰',
        statement: '在「SYN flood」情境裡，殭屍網路送出來源偽冒成 192.0.2.11 的 SYN。伺服器回覆的 SYN, ACK，IP 標頭的目的位址是什麼？',
        hints: ['伺服器只知道 IP 標頭上寫的來源，不知道封包真正是誰送的。', '想一想：偽冒者為什麼完成不了交握？'],
        explanation: '伺服器把回覆送到 SYN 的來源欄位寫的 192.0.2.11。那個位址的主人不存在或不回應，所以 ACK 永遠不會來，半開的項目一直占著佇列；真正的攻擊者也收不到這個回覆，所以偽冒來源只能用在單向的攻擊，無法完成交握。',
        mistakes: [
          { answer: { value: '203.0.113.80' }, why: '那是伺服器自己的位址，是 SYN, ACK 的來源 IP，不是目的 IP。' },
          { answer: { value: '198.51.100.25' }, why: '那是一般使用者的位址，他還沒送出任何 SYN；伺服器回覆的是偽冒的來源 192.0.2.11。' },
        ] },
      { id: 'cn18-half-open', task: 'table', scene: 'cn18-syn-flood', message: 'cookie-synack', node: 'server', table: '佇列使用量', row: '半開連線數', column: '值',
        title: 'SYN cookie 之後的半開連線數',
        statement: '同一個情境裡，佇列被 4 個偽冒的 SYN 塞滿後，管理者啟用了 SYN cookies。伺服器以 SYN cookie 回覆使用者重送的 SYN 之後，佇列使用量表中的「半開連線數」是多少？（只填數字）',
        hints: ['SYN cookie 的重點是收到 SYN 時要不要在佇列裡記一筆。', '啟用 SYN cookies 不會清掉已經在佇列裡的偽冒項目，它們要等逾時。'],
        explanation: '以 SYN cookie 回覆時，伺服器把驗證所需的資訊算進 SYN, ACK 的初始序號，佇列不新增任何項目，所以半開連線數仍是原本被偽冒 SYN 占住的 4。那 4 個項目要等逾時才會消失；使用者的連線則在帶回 cookie＋1 的 ACK 抵達時直接建立。',
        mistakes: [
          { answer: { cell: '5' }, why: '以為使用者的 SYN 也占了一個項目；SYN cookie 正是為了不記任何東西，佇列早就滿了也放不下第 5 個。' },
          { answer: { cell: '0' }, why: '以為啟用 SYN cookies 會清空佇列；它只改變之後收到 SYN 的處理方式，偽冒的項目仍在，要等逾時。' },
        ] },
      { id: 'cn18-registrable-domain', task: 'table', scene: 'cn18-phishing', message: 'dns-query', node: 'browser', table: '網址檢查', row: '可註冊網域（真正的擁有者）', column: '值',
        title: '這個網址真正屬於誰',
        statement: '在「釣魚網站」情境裡，使用者點的網址主機名稱是 www.example.com.secure-login.example。瀏覽器的網址檢查表中，「可註冊網域（真正的擁有者）」是什麼？',
        hints: ['網域名稱由右往左讀：最右邊是頂級網域。', '頂級網域往左一段，就是向註冊商買下來的名稱；它左邊的部分都是擁有者自己取的子網域標籤。'],
        explanation: '由右往左：頂級網域是 .example，往左一段是 secure-login，所以真正的擁有者是 secure-login.example。開頭的 www.example.com 只是攻擊者自己在自己的網域底下取的標籤，和 example.com 沒有任何關係。憑證、DNS 與鎖頭都只證明你連到了 secure-login.example。',
        mistakes: [
          { answer: { cell: 'example.com' }, why: '被開頭的 www.example.com 騙了：網域要由右往左讀，example.com 在這裡只是子網域標籤的一部分。' },
          { answer: { cell: 'www.example.com.secure-login.example' }, why: '這是完整的主機名稱，不是可註冊網域；題目問的是真正向註冊商買下這個名稱的那一段。' },
        ] },
    ],
  },
  quiz: [
    {
      id: 'q-cia', prompt: '一場 DDoS 攻擊讓購物網站連續兩小時無法回應，但沒有任何資料被偷走或修改。它主要破壞的是 CIA 三要素中的哪一個？',
      options: ['機密性', '可用性', '完整性', '三個都沒有，因為資料沒有受損'],
      answer: 1, explanation: '可用性問的是「需要的時候服務能不能用」，DDoS 讓正常使用者用不了網站，正是破壞可用性。沒有資料被讀走，所以不是機密性；沒有資料被修改，所以不是完整性。資料沒受損不代表沒有損害，服務中斷本身就是安全事件。',
    },
    {
      id: 'q-arp', prompt: '咖啡店網路上的攻擊者成功對受害者做了 ARP 偽冒。之後受害者送往網際網路的封包，哪一個欄位和平常不一樣？',
      options: ['IP 標頭的目的位址變成攻擊者的 IP', 'IP 標頭的來源位址變成攻擊者的 IP', 'TCP 的目的連接埠被改成攻擊者指定的連接埠', '訊框的目的 MAC 變成攻擊者的 MAC，IP 標頭維持不變'],
      answer: 3, explanation: 'ARP 偽冒改的是受害者 ARP 快取裡閘道 IP 對應的 MAC，所以受害者自己填訊框時，目的 MAC 就成了攻擊者的；IP 標頭的目的位址仍是真正的目的地，來源仍是自己，TCP 連接埠也不受影響。正因為 IP 層看起來一切正常，受害者很難察覺。',
    },
    {
      id: 'q-mitm-tls', prompt: '在公共 Wi-Fi 上打開 https://www.example.com/ 時，瀏覽器顯示 NET::ERR_CERT_AUTHORITY_INVALID（憑證的簽發者不受信任）。最合理的判斷與做法是什麼？',
      options: ['可能有人在中間冒充這個網站，TLS 的憑證檢查擋下了他；應該關掉頁面，不要按「繼續前往」', '只是網站的憑證過期了，按「繼續前往」就好', '連線一樣有加密，所以輸入密碼沒有風險', '應該照頁面的指示安裝它提供的根憑證，警告就會消失'],
      answer: 0, explanation: '簽發者不受信任表示對方拿出的憑證接不到信任儲存區的根憑證，在公共 Wi-Fi 上這正是中間人的典型樣子，憑證檢查剛好擋下了他，按繼續就等於放他進來。過期是另一種警告（日期無效）；加密給錯的人沒有意義；安裝來路不明的根憑證，會讓攻擊者以後的假憑證都通過檢查，是最危險的做法。',
    },
    {
      id: 'q-firewall', prompt: '公司的防火牆規則只允許內部電腦連出到外部的 TCP 443，其他全部拒絕。下列哪一個攻擊，這條規則最擋不住？',
      options: ['外部主機主動連進公司內部的資料庫連接埠', '外部主機掃描公司對外的各個連接埠', '員工點了釣魚信裡的連結，登入一個用 HTTPS 的仿冒網站', '內部電腦用不常見的連接埠連到外部的伺服器'],
      answer: 2, explanation: '連到釣魚網站是一條從內部發起、目的連接埠 443 的正常出站 HTTPS 連線，完全符合允許的規則，封包過濾看不出網站是真是假。外部主動連進來與掃描連接埠會被「其他全部拒絕」擋下；用不常見連接埠的出站連線也不符合只放行 443 的規則。防火牆是必要的一層，但釣魚要靠核對網域、密碼管理器與通行金鑰。',
    },
    {
      id: 'q-syn-cookies', prompt: 'SYN cookies 為什麼能讓伺服器在 SYN flood 中繼續接受正常的連線？',
      options: ['它會找出偽冒的來源位址並自動封鎖', '它讓 SYN 佇列的容量變成無限大', '收到 SYN 時不在佇列記錄任何東西，而是把驗證所需的資訊算進 SYN, ACK 的初始序號，等帶回正確 cookie 的 ACK 才建立連線', '它要求每個用戶端先完成 TLS 交握，才能送出 SYN'],
      answer: 2, explanation: 'SYN cookies 的重點是在交握完成前不保存狀態：伺服器用秘密值把資訊算進初始序號，只有真的收到 SYN, ACK 的一方才能帶回正確的 cookie＋1。偽冒來源收不到回覆，所以無法占用任何資源。它不辨識或封鎖來源位址；佇列容量並沒有變大，而是不再需要它；TLS 交握發生在 TCP 交握之後，不可能先於 SYN。',
    },
    {
      id: 'q-amplification', prompt: '在反射放大攻擊中，攻擊者向網路上開放的 DNS 解析器送出很小的查詢，卻讓受害者被大量回覆淹沒。這個攻擊依賴哪兩個條件？',
      options: ['查詢的來源 IP 被偽冒成受害者的位址，而且服務的回覆比請求大很多', '受害者的 DNS 快取被下毒，而且受害者沒有啟用 HTTPS', '解析器的 TCP 半開佇列被塞滿，而且受害者沒有防火牆', '攻擊者和受害者在同一個區域網路，而且 ARP 沒有驗證'],
      answer: 0, explanation: 'UDP 沒有交握，解析器直接把回覆送到 IP 標頭上的來源，所以把來源偽冒成受害者，回覆就湧向受害者；挑選回覆遠大於請求的服務，就能把流量放大數十倍以上。快取下毒與 HTTPS 是別的主題；這個攻擊走 UDP，和 TCP 半開佇列無關；它跨越網際網路進行，不需要和受害者在同一個區域網路。防護是 BCP 38 入口過濾與關閉開放的解析器。',
    },
    {
      id: 'q-padlock', prompt: '使用者點了信中的連結，網址列顯示 https://www.example.com.secure-login.example/login，旁邊有加密連線的標示（鎖頭）。下列哪一個說法正確？',
      options: ['有鎖頭代表 CA 審查過這是 example.com 的官方網站', '網址開頭是 www.example.com，所以這是 example.com 的子網域', 'HTTPS 會阻止密碼被送到釣魚網站', '連線確實加密，對方也確實握有這個網域的憑證，但這個網域屬於 secure-login.example，可能是釣魚網站'],
      answer: 3, explanation: '網域由右往左讀，這個網址的可註冊網域是 secure-login.example，www.example.com 只是它底下的標籤。網域驗證憑證只確認申請人控制這個網域，不審查網站是誰，所以鎖頭只代表連線加密、對方握有這個網域的憑證。HTTPS 會把密碼完整加密，然後送給這個網域的擁有者，它不會阻止你把密碼交給錯的網站。',
    },
    {
      id: 'q-passkey', prompt: '下列哪一種登入方式，在使用者誤入一個會即時轉送資料的釣魚網站時，最能避免帳號被盜？',
      options: ['密碼加上簡訊驗證碼', '通行金鑰（FIDO2／WebAuthn）', '密碼加上驗證器 App 的 6 位數一次性密碼', '更長、更複雜的密碼'],
      answer: 1, explanation: '通行金鑰的簽章綁定網站的網域，而且由瀏覽器檢查網域，釣魚網站要不到真網站的簽章，使用者也沒有可以輸入或轉送的字串。簡訊驗證碼與驗證器 App 的一次性密碼都是使用者看得到、能輸入的字串，即時轉送的釣魚網站可以在失效前拿去登入；再長的密碼一旦被使用者親手輸入釣魚網站，也同樣被偷走。',
    },
  ],
};
