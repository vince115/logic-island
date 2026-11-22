import type { NetworkScene } from '@/lib/network/model';
import type { LessonContent } from '../schema';

/*
 * CN06 ARP, DHCP and NAT (CN-2, network-sequence). Three fixed scenes follow one laptop from joining a home network to
 * its first packet on the internet: the DHCP DORA exchange and a renewal at T1, ARP for the default gateway (and for an
 * on-link printer) before the first packet, and NAPT on the edge router for two hosts that use the same source port.
 * Inside addresses are RFC 1918 (192.168.1.0/24); the router's public address, the ISP router, the web server and the
 * outside host are RFC 5737 documentation addresses; MAC addresses are locally administered (02:…). The ARP header is
 * drawn where an IP header would sit (it is carried straight in the Ethernet frame, EtherType 0x0806); no exercise asks
 * for its layer, since textbooks place ARP in the link or the network layer.
 */

const MAC = {
  laptop: '02:00:00:00:06:17', phone: '02:00:00:00:06:2a', printer: '02:00:00:00:06:32',
  gwLan: '02:00:00:00:06:01', gwWan: '02:00:00:00:06:fe', isp: '02:00:00:00:71:01',
};
const BROADCAST = 'ff:ff:ff:ff:ff:ff';
const XID = '0x5e1a7c42';

const ethernet = (from: string, to: string, type = '0x0800（IPv4）') => ({ layer: 'link' as const, protocol: 'Ethernet', fields: [
  { name: '來源 MAC', value: from }, { name: '目的 MAC', value: to }, { name: 'EtherType', value: type }] });
const ipv4 = (from: string, to: string, ttl: number, protocol: string) => ({ layer: 'network' as const, protocol: 'IPv4', fields: [
  { name: '來源 IP', value: from }, { name: '目的 IP', value: to }, { name: 'TTL', value: String(ttl) }, { name: '協定', value: protocol }] });
const udp = (from: number, to: number) => ({ layer: 'transport' as const, protocol: 'UDP', fields: [
  { name: '來源連接埠', value: String(from) }, { name: '目的連接埠', value: String(to) }] });
const tcp = (from: number, to: number, flags: string) => ({ layer: 'transport' as const, protocol: 'TCP', fields: [
  { name: '來源連接埠', value: String(from) }, { name: '目的連接埠', value: String(to) }, { name: '旗標', value: flags }] });
const dhcp = (fields: [string, string][]) => ({ layer: 'application' as const, protocol: 'DHCP', fields: fields.map(([name, value]) => ({ name, value })) });
/** The ARP message sits in the Ethernet frame where an IP packet would (EtherType 0x0806), so the scene draws it there. */
const arp = (opcode: string, senderMac: string, senderIp: string, targetMac: string, targetIp: string) => ({ layer: 'network' as const, protocol: 'ARP', fields: [
  { name: '硬體類型', value: '1（Ethernet）' }, { name: '協定類型', value: '0x0800（IPv4）' }, { name: '操作碼', value: opcode },
  { name: '傳送端 MAC', value: senderMac }, { name: '傳送端 IP', value: senderIp }, { name: '目標 MAC', value: targetMac }, { name: '目標 IP', value: targetIp }] });

// ---- scene 1: DHCP -----------------------------------------------------------------------------------------------
const settings = (rows: string[][], changed?: number[]) => ({ node: 'laptop', name: '網路設定', head: ['項目', '值'], rows, ...changed ? { changed } : {} });
const UNSET = [['IP 位址', '0.0.0.0（尚未取得）'], ['子網路遮罩', '—'], ['預設閘道', '—'], ['DNS 伺服器', '—'], ['租約到期', '—'], ['續約（T1）', '—'], ['重新綁定（T2）', '—']];
const leased = (expires: number) => [['IP 位址', '192.168.1.23'], ['子網路遮罩', '255.255.255.0（/24）'], ['預設閘道', '192.168.1.1'], ['DNS 伺服器', '192.168.1.1'],
  ['租約到期', `第 ${expires} 小時`], ['續約（T1）', `第 ${expires - 12} 小時`], ['重新綁定（T2）', `第 ${expires - 3} 小時`]];
const leases = (laptop: string[] | undefined, changed?: number[]) => ({ node: 'gw', name: 'DHCP 租約表', head: ['IP 位址', 'MAC 位址', '狀態', '租約到期'],
  rows: [['192.168.1.42', MAC.phone, '已租出', '第 20 小時'], ...laptop ? [laptop] : []], ...changed ? { changed } : {} });
const LEASE_OPTIONS: [string, string][] = [['子網路遮罩（選項 1）', '255.255.255.0'], ['路由器（選項 3）', '192.168.1.1'], ['DNS 伺服器（選項 6）', '192.168.1.1'],
  ['租約時間（選項 51）', '86400 秒（24 小時）'], ['伺服器識別碼（選項 54）', '192.168.1.1']];

/** Section 2: a laptop gets its address by DORA (the broadcast flag is 0, so Offer and Ack are unicast), then renews at T1. */
const dora: NetworkScene = {
  id: 'cn06-dhcp-dora', title: 'DHCP：Discover、Offer、Request、Ack 與續約', model: 'tcp-ip',
  description: '筆電接上家裡的網路，什麼位址都還沒有。家用路由器內建 DHCP 伺服器，負責 192.168.1.0/24。看筆電怎麼用四則訊息拿到 IP 位址、遮罩、預設閘道、DNS 伺服器與租約，以及 12 小時後怎麼續約；注意每一則的來源與目的 IP、UDP 連接埠，以及筆電的網路設定表怎麼從空白變成完整。',
  nodes: [
    { id: 'laptop', label: '筆電', kind: 'host', addresses: [`MAC ${MAC.laptop}`, 'IP：尚未取得'] },
    { id: 'gw', label: '家用路由器（DHCP 伺服器）', kind: 'router', addresses: [`LAN 192.168.1.1/24，MAC ${MAC.gwLan}`, '位址池 192.168.1.20–192.168.1.199'] },
  ],
  messages: [
    { id: 'discover', from: 'laptop', to: 'gw', label: 'DHCPDISCOVER（廣播）', payload: '「有沒有 DHCP 伺服器？我需要 IP 位址、遮罩、路由器與 DNS 伺服器。」',
      note: '筆電還沒有 IP 位址，來源只能填 0.0.0.0；它也不知道 DHCP 伺服器是誰，目的只能填受限廣播 255.255.255.255，訊框的目的 MAC 是 ff:ff:ff:ff:ff:ff，同一個區域網路的每一台都收得到，只有 DHCP 伺服器會處理。客戶端固定用 UDP 68，伺服器用 UDP 67。交易 ID 是筆電隨機選的，後面三則都帶同一個值，讓筆電認出哪些回應是給這次請求的。',
      headers: [
        dhcp([['訊息類型', 'DHCPDISCOVER（1）'], ['交易 ID', XID], ['ciaddr（客戶端位址）', '0.0.0.0'], ['yiaddr（分配的位址）', '0.0.0.0'], ['chaddr（客戶端 MAC）', MAC.laptop], ['廣播旗標', '0'],
          ['請求的參數（選項 55）', '子網路遮罩、路由器、DNS 伺服器']]),
        udp(68, 67), ipv4('0.0.0.0', '255.255.255.255', 64, '17（UDP）'), ethernet(MAC.laptop, BROADCAST)],
      tables: [settings(UNSET), leases(undefined)] },
    { id: 'offer', from: 'gw', to: 'laptop', label: 'DHCPOFFER（單播）', payload: '「可以給你 192.168.1.23，租 24 小時，遮罩、閘道與 DNS 如下。」',
      note: '伺服器從位址池挑出 192.168.1.23，放進 yiaddr，並附上遮罩、路由器（預設閘道）、DNS 伺服器、租約時間與自己的識別碼。筆電在 Discover 裡把廣播旗標設為 0，表示還沒設定位址也收得到單播，所以伺服器直接送給 chaddr 的 MAC 與 192.168.1.23；如果旗標是 1，Offer 與 Ack 會改送到 255.255.255.255。這時位址只是「提供」，租約表上標成保留中。',
      headers: [dhcp([['訊息類型', 'DHCPOFFER（2）'], ['交易 ID', XID], ['yiaddr（分配的位址）', '192.168.1.23'], ...LEASE_OPTIONS]),
        udp(67, 68), ipv4('192.168.1.1', '192.168.1.23', 64, '17（UDP）'), ethernet(MAC.gwLan, MAC.laptop)],
      tables: [leases(['192.168.1.23', MAC.laptop, '已提供，等待 Request', '—'], [1])] },
    { id: 'request', from: 'laptop', to: 'gw', label: 'DHCPREQUEST（廣播）', payload: '「我要 192.168.1.1 提供的 192.168.1.23。」',
      note: '筆電可能收到好幾台伺服器的 Offer，它選一個，再用廣播送出 Request：選項 50 寫要的位址，選項 54 寫選中的伺服器。用廣播是因為筆電仍未正式擁有位址（來源還是 0.0.0.0），也讓沒被選中的伺服器知道可以收回自己提供的位址。',
      headers: [dhcp([['訊息類型', 'DHCPREQUEST（3）'], ['交易 ID', XID], ['ciaddr（客戶端位址）', '0.0.0.0'], ['請求的位址（選項 50）', '192.168.1.23'], ['伺服器識別碼（選項 54）', '192.168.1.1']]),
        udp(68, 67), ipv4('0.0.0.0', '255.255.255.255', 64, '17（UDP）'), ethernet(MAC.laptop, BROADCAST)] },
    { id: 'ack', from: 'gw', to: 'laptop', label: 'DHCPACK（單播）', payload: '「確認：192.168.1.23 是你的，從現在起租 24 小時。」',
      note: '伺服器確認租約，租約表改成已租出。筆電收到 Ack 才正式設定介面（許多系統會先用 ARP 確認沒有別人在用這個位址）：IP 位址、遮罩、預設閘道與 DNS 伺服器都填好了。以 Ack 的時間為第 0 小時，租約 24 小時：T1 是租期的一半（第 12 小時），T2 是租期的 87.5%（第 21 小時）。',
      headers: [dhcp([['訊息類型', 'DHCPACK（5）'], ['交易 ID', XID], ['yiaddr（分配的位址）', '192.168.1.23'], ...LEASE_OPTIONS]),
        udp(67, 68), ipv4('192.168.1.1', '192.168.1.23', 64, '17（UDP）'), ethernet(MAC.gwLan, MAC.laptop)],
      tables: [settings(leased(24), [0, 1, 2, 3, 4, 5, 6]), leases(['192.168.1.23', MAC.laptop, '已租出', '第 24 小時'], [1])] },
    { id: 'renew', from: 'laptop', to: 'gw', label: '第 12 小時：DHCPREQUEST 續約（單播）', payload: '「192.168.1.23 我還要用，請延長租約。」',
      note: '到了 T1，筆電已經有位址，也知道伺服器是誰，所以直接單播 Request 給 192.168.1.1：ciaddr 填自己的位址，不帶選項 50 與 54。這是新的一次交換，交易 ID 也是新的。如果伺服器一直不回應，到了 T2 筆電改用廣播向任何 DHCP 伺服器延長（重新綁定）；租約到期還沒延長，就必須停用這個位址，從 Discover 重新開始。',
      headers: [dhcp([['訊息類型', 'DHCPREQUEST（3）'], ['交易 ID', '0x7c3b9d10'], ['ciaddr（客戶端位址）', '192.168.1.23']]),
        udp(68, 67), ipv4('192.168.1.23', '192.168.1.1', 64, '17（UDP）'), ethernet(MAC.laptop, MAC.gwLan)] },
    { id: 'renew-ack', from: 'gw', to: 'laptop', label: 'DHCPACK（續約成功）', payload: '「延長 24 小時，到第 36 小時。」',
      note: '伺服器回 Ack，租約從現在（第 12 小時）重新起算 24 小時，到第 36 小時；新的 T1 是第 24 小時，T2 是第 33 小時。位址沒有變，正在進行的連線不受影響。',
      headers: [dhcp([['訊息類型', 'DHCPACK（5）'], ['交易 ID', '0x7c3b9d10'], ['ciaddr（客戶端位址）', '192.168.1.23'], ['yiaddr（分配的位址）', '192.168.1.23'], ['租約時間（選項 51）', '86400 秒（24 小時）']]),
        udp(67, 68), ipv4('192.168.1.1', '192.168.1.23', 64, '17（UDP）'), ethernet(MAC.gwLan, MAC.laptop)],
      tables: [settings(leased(36), [4, 5, 6]), leases(['192.168.1.23', MAC.laptop, '已租出', '第 36 小時'], [1])] },
  ],
};

// ---- scene 2: ARP and the default gateway ------------------------------------------------------------------------
const LAPTOP_ROUTES = { node: 'laptop', name: '路由表', head: ['目的網路', '下一站', '介面'], rows: [['192.168.1.0/24', '直接連接', 'eth0'], ['0.0.0.0/0', '192.168.1.1', 'eth0']] };
const laptopArp = (rows: string[][], changed?: number[]) => ({ node: 'laptop', name: 'ARP 快取', head: ['IP 位址', 'MAC 位址', '類型'], rows, ...changed ? { changed } : {} });
const GW_ENTRY = ['192.168.1.1', MAC.gwLan, '動態'], PRINTER_ENTRY = ['192.168.1.50', MAC.printer, '動態'];

/** Section 4: the first packet to the internet goes to the gateway (ARP for 192.168.1.1), a print job goes on-link. */
const arpGateway: NetworkScene = {
  id: 'cn06-arp-gateway', title: '第一個封包：先用 ARP 問閘道的 MAC', model: 'tcp-ip',
  description: '筆電剛用 DHCP 拿到 192.168.1.23/24、預設閘道 192.168.1.1，ARP 快取還是空的。它要連到網路上的網站 198.51.100.80（HTTPS，TCP 443），之後再把文件送到同一個網段的印表機 192.168.1.50（IPP，TCP 631）。看兩次 ARP 各問的是誰，以及兩個 TCP SYN 的目的 MAC 與目的 IP。',
  nodes: [
    { id: 'laptop', label: '筆電', kind: 'host', addresses: ['IP 192.168.1.23/24', `MAC ${MAC.laptop}`, '閘道 192.168.1.1'] },
    { id: 'gw', label: '家用路由器（預設閘道）', kind: 'router', addresses: [`LAN 192.168.1.1/24，MAC ${MAC.gwLan}`, `WAN 203.0.113.5/24，MAC ${MAC.gwWan}`] },
    { id: 'printer', label: '印表機', kind: 'host', addresses: ['IP 192.168.1.50/24', `MAC ${MAC.printer}`] },
  ],
  messages: [
    { id: 'arp-gw-request', from: 'laptop', to: 'gw', label: 'ARP 請求：誰是 192.168.1.1？（廣播）',
      note: '目的地 198.51.100.80 AND 255.255.255.0 = 198.51.100.0，不等於自己的 192.168.1.0，是別的網路，路由表只有 0.0.0.0/0 符合，下一站是預設閘道 192.168.1.1。所以筆電問的是閘道的 MAC，不是網站的。ARP 快取裡沒有 192.168.1.1，於是廣播 ARP 請求：操作碼 1，目標 MAC 先填 0，因為這正是要問的。',
      headers: [arp('1（請求）', MAC.laptop, '192.168.1.23', '00:00:00:00:00:00', '192.168.1.1'), ethernet(MAC.laptop, BROADCAST, '0x0806（ARP）')],
      tables: [LAPTOP_ROUTES, laptopArp([]), { node: 'gw', name: 'ARP 快取（LAN 側）', head: ['IP 位址', 'MAC 位址', '類型'], rows: [['192.168.1.23', MAC.laptop, '動態']], changed: [0] }] },
    { id: 'arp-gw-reply', from: 'gw', to: 'laptop', label: 'ARP 回覆：192.168.1.1 在這裡（單播）',
      note: '同一個網段的每一台都收到廣播，但只有目標 IP 是自己的路由器回答。路由器早在收到請求時，就把請求裡的「192.168.1.23 → 筆電的 MAC」記進自己的快取，所以回覆直接單播給筆電：操作碼 2，傳送端填自己 LAN 介面的 MAC。筆電把閘道加進 ARP 快取。',
      headers: [arp('2（回覆）', MAC.gwLan, '192.168.1.1', MAC.laptop, '192.168.1.23'), ethernet(MAC.gwLan, MAC.laptop, '0x0806（ARP）')],
      tables: [laptopArp([GW_ENTRY], [0])] },
    { id: 'first-syn', from: 'laptop', to: 'gw', label: '第一個封包：TCP SYN 往 198.51.100.80（交給閘道）', payload: 'TCP 連線的第一段（還沒有資料）',
      note: '現在可以送出第一個封包了：IP 標頭的目的位址是網站 198.51.100.80，訊框的目的 MAC 卻是閘道 LAN 介面的 MAC。來源連接埠 50000 是筆電作業系統選的暫時連接埠。路由器收下訊框後會轉送並做 NAT（下一個情境）。',
      headers: [tcp(50000, 443, 'SYN'), ipv4('192.168.1.23', '198.51.100.80', 64, '6（TCP）'), ethernet(MAC.laptop, MAC.gwLan)],
      tables: [laptopArp([GW_ENTRY])] },
    { id: 'arp-printer-request', from: 'laptop', to: 'printer', label: 'ARP 請求：誰是 192.168.1.50？（廣播）',
      note: '接著要列印：192.168.1.50 AND 255.255.255.0 = 192.168.1.0，和自己相同，印表機在同一網段（on-link），直接送，不經過路由器。快取裡只有閘道，沒有 .50，所以這次 ARP 問的是印表機本身。',
      headers: [arp('1（請求）', MAC.laptop, '192.168.1.23', '00:00:00:00:00:00', '192.168.1.50'), ethernet(MAC.laptop, BROADCAST, '0x0806（ARP）')],
      tables: [laptopArp([GW_ENTRY])] },
    { id: 'arp-printer-reply', from: 'printer', to: 'laptop', label: 'ARP 回覆：192.168.1.50 在這裡（單播）',
      note: '印表機單播回覆自己的 MAC，筆電把它加進快取。快取裡的動態項目一段時間沒有使用就會老化、被刪除或重新確認，下次要用時再問一次。',
      headers: [arp('2（回覆）', MAC.printer, '192.168.1.50', MAC.laptop, '192.168.1.23'), ethernet(MAC.printer, MAC.laptop, '0x0806（ARP）')],
      tables: [laptopArp([GW_ENTRY, PRINTER_ENTRY], [1])] },
    { id: 'print-syn', from: 'laptop', to: 'printer', label: 'TCP SYN 往印表機（直接送）', payload: 'TCP 連線的第一段（IPP 列印）',
      note: '同一網段的封包，目的 IP 與目的 MAC 都是印表機自己的，路由器完全沒有參與，TTL 也不會被減。對照第 3 步：跨網段時目的 MAC 是閘道，目的 IP 才是遠端主機。',
      headers: [tcp(50002, 631, 'SYN'), ipv4('192.168.1.23', '192.168.1.50', 64, '6（TCP）'), ethernet(MAC.laptop, MAC.printer)],
      tables: [laptopArp([GW_ENTRY, PRINTER_ENTRY])] },
  ],
};

// ---- scene 3: NAT with port translation --------------------------------------------------------------------------
const NAT_LAPTOP = ['192.168.1.23:50000', '203.0.113.5:40001', '198.51.100.80:443', 'TCP'];
const NAT_PHONE = ['192.168.1.42:50000', '203.0.113.5:40002', '198.51.100.80:443', 'TCP'];
const natTable = (rows: string[][], changed?: number[]) => ({ node: 'nat', name: 'NAT 轉譯表', head: ['內部位址:連接埠', '外部位址:連接埠', '遠端位址:連接埠', '協定'], rows, ...changed ? { changed } : {} });

/** Sections 5 and 6: NAPT gives two hosts that both use source port 50000 different public ports; an unsolicited packet is dropped. */
const natPat: NetworkScene = {
  id: 'cn06-nat-pat', title: 'NAT 與連接埠轉譯：兩台裝置共用一個公開位址', model: 'tcp-ip',
  description: '家裡的筆電（192.168.1.23）與手機（192.168.1.42）都用私有位址，碰巧都用來源連接埠 50000 連到網站 198.51.100.80:443。家用路由器只有一個公開位址 203.0.113.5，往網際網路的下一站是 ISP 路由器 203.0.113.1（網站還在更遠的地方）。看路由器改寫了哪些欄位、轉譯表怎麼長出來、回應怎麼找回原來的主機，以及一個沒有對應項目的入站封包會怎樣。',
  nodes: [
    { id: 'laptop', label: '筆電', kind: 'host', addresses: ['IP 192.168.1.23/24', `MAC ${MAC.laptop}`] },
    { id: 'phone', label: '手機', kind: 'host', addresses: ['IP 192.168.1.42/24', `MAC ${MAC.phone}`] },
    { id: 'nat', label: '家用路由器（NAT）', kind: 'router', addresses: [`LAN 192.168.1.1/24，MAC ${MAC.gwLan}`, `WAN 203.0.113.5/24，MAC ${MAC.gwWan}`] },
    { id: 'isp', label: 'ISP 路由器（往網際網路）', kind: 'router', addresses: ['203.0.113.1/24', `MAC ${MAC.isp}`] },
  ],
  messages: [
    { id: 'laptop-out', from: 'laptop', to: 'nat', label: '筆電 → 路由器：SYN（私有位址）', payload: 'TCP 連線的第一段',
      note: '這是上一個情境的第一個封包：來源 192.168.1.23:50000，目的 198.51.100.80:443，TTL 64，訊框送給路由器 LAN 介面的 MAC。轉譯表還是空的。',
      headers: [tcp(50000, 443, 'SYN'), ipv4('192.168.1.23', '198.51.100.80', 64, '6（TCP）'), ethernet(MAC.laptop, MAC.gwLan)],
      tables: [natTable([])] },
    { id: 'laptop-wan', from: 'nat', to: 'isp', label: '路由器 → ISP：SYN（來源改寫成 203.0.113.5:40001）', payload: 'TCP 連線的第一段',
      note: '192.168.1.23 是 RFC 1918 私有位址，網際網路上的路由器不會轉送以它為目的的回應，所以路由器把來源改寫成自己的公開位址 203.0.113.5，來源連接埠改成它分配的 40001，並在轉譯表記下這組對應。目的位址與連接埠不變。路由器轉送時 TTL 減 1 變成 63，IP 與 TCP 的檢查碼都要重算；訊框換成 WAN 介面的 MAC 送往 ISP 路由器的 MAC。',
      headers: [tcp(40001, 443, 'SYN'), ipv4('203.0.113.5', '198.51.100.80', 63, '6（TCP）'), ethernet(MAC.gwWan, MAC.isp)],
      tables: [natTable([NAT_LAPTOP], [0])] },
    { id: 'phone-out', from: 'phone', to: 'nat', label: '手機 → 路由器：SYN（也用連接埠 50000）', payload: 'TCP 連線的第一段',
      note: '手機也連到同一個網站，作業系統碰巧也選了來源連接埠 50000。只看外部位址的話，兩條連線就分不出來了。',
      headers: [tcp(50000, 443, 'SYN'), ipv4('192.168.1.42', '198.51.100.80', 64, '6（TCP）'), ethernet(MAC.phone, MAC.gwLan)],
      tables: [natTable([NAT_LAPTOP])] },
    { id: 'phone-wan', from: 'nat', to: 'isp', label: '路由器 → ISP：SYN（來源改寫成 203.0.113.5:40002）', payload: 'TCP 連線的第一段',
      note: '外部位址只有一個，所以路由器靠連接埠區分：手機的連線分到 40002。這就是連接埠轉譯（NAPT，也叫 PAT）：轉譯表的每一列是一條連線，外部位址:連接埠在同一個協定裡不會重複，一個公開位址理論上可以同時撐起數萬條連線。',
      headers: [tcp(40002, 443, 'SYN'), ipv4('203.0.113.5', '198.51.100.80', 63, '6（TCP）'), ethernet(MAC.gwWan, MAC.isp)],
      tables: [natTable([NAT_LAPTOP, NAT_PHONE], [1])] },
    { id: 'reply-wan', from: 'isp', to: 'nat', label: 'ISP → 路由器：SYN-ACK 回到 203.0.113.5:40001', payload: 'TCP 連線的第二段',
      note: '網站回應筆電的連線。它只看過 203.0.113.5:40001，不知道筆電的私有位址，所以回應的目的就是 203.0.113.5:40001。封包經過多台路由器，到達時 TTL 剩 55。',
      headers: [tcp(443, 40001, 'SYN, ACK'), ipv4('198.51.100.80', '203.0.113.5', 55, '6（TCP）'), ethernet(MAC.isp, MAC.gwWan)],
      tables: [natTable([NAT_LAPTOP, NAT_PHONE])] },
    { id: 'reply-lan', from: 'nat', to: 'laptop', label: '路由器 → 筆電：SYN-ACK（目的換回 192.168.1.23:50000）', payload: 'TCP 連線的第二段',
      note: '路由器用目的連接埠 40001（與來源 198.51.100.80:443）查轉譯表，找到第一列，把目的改回 192.168.1.23:50000，TTL 減 1 變成 54，訊框換成 LAN 介面的 MAC 送給筆電。手機那一列沒有被用到；手機的回應會回到 40002，轉回 192.168.1.42:50000。',
      headers: [tcp(443, 50000, 'SYN, ACK'), ipv4('198.51.100.80', '192.168.1.23', 54, '6（TCP）'), ethernet(MAC.gwLan, MAC.laptop)],
      tables: [natTable([NAT_LAPTOP, NAT_PHONE])] },
    { id: 'unsolicited', from: 'isp', to: 'nat', label: '外部主機 → 203.0.113.5:22：沒有對應，丟棄', payload: '外部主機 192.0.2.66 主動要建立的連線',
      note: '外部主機 192.0.2.66 想主動連到 203.0.113.5 的 22 埠。轉譯表裡沒有任何一列的外部位址:連接埠是 203.0.113.5:22，路由器不知道要轉給哪一台內部主機，只能丟棄（或回應拒絕）。內部的伺服器要讓外面連進來，必須在路由器上設定連接埠轉送。',
      headers: [tcp(51515, 22, 'SYN'), ipv4('192.0.2.66', '203.0.113.5', 50, '6（TCP）'), ethernet(MAC.isp, MAC.gwWan)],
      tables: [natTable([NAT_LAPTOP, NAT_PHONE])] },
  ],
};

/** CN06 ARP, DHCP and NAT. Network-protocol lesson (CN-2): scenes and exercises in src/lib/network/model.ts. */
export const CN06: LessonContent = {
  lessonId: 'CN06',
  motivation: '把筆電帶到朋友家，連上 Wi-Fi，幾秒後就能開網頁，你什麼位址都沒有設定。這幾秒裡至少發生了三件事：筆電用 DHCP 向網路要到 IP 位址、遮罩、預設閘道與 DNS 伺服器；要送出第一個封包時，用 ARP 問出閘道的 MAC 位址；封包離開家用路由器時，NAT 把私有位址換成路由器唯一的公開位址，回應再換回來。這三個協定平常看不見，一出問題就是「連上 Wi-Fi 卻不能上網」、「拿到 169.254 開頭的位址」、「家裡架的伺服器外面連不進來」。本課依序追蹤 DHCP 的四則訊息與續約、ARP 的廣播請求與單播回覆、主機什麼時候把封包交給預設閘道，以及連接埠轉譯怎麼讓好幾台裝置共用一個公開位址，最後說明 NAT 為什麼擋得住主動連進來的封包，卻不等於防火牆。',
  sections: [
    {
      id: 'join-network', title: '從接上網路到第一個封包：三個要解決的問題',
      blocks: [
        { type: 'p', text: 'CN05 說一台主機要送封包，需要 IP 位址、子網路遮罩與預設閘道；CN03 說同一條鏈路上的訊框靠 MAC 位址送達。剛接上網路的筆電這些都沒有，也不認識網路上的任何一台機器。從接上網路到第一個封包抵達網際網路，要依序解決三個問題，各由一個協定負責：' },
        { type: 'table', head: ['順序', '問題', '協定', '請求怎麼送', '回應怎麼送'], rows: [
          ['1', '我的 IP 位址、遮罩、預設閘道、DNS 伺服器是什麼？', 'DHCP', '廣播（還沒有位址，也不知道伺服器是誰）', '單播或廣播，看客戶端的廣播旗標'],
          ['2', '下一站的 IP 位址對應哪一個 MAC 位址？', 'ARP', '廣播（不知道對方的 MAC）', '單播（對方已經從請求學到我的 MAC）'],
          ['3', '私有位址怎麼在網際網路上收發？', 'NAT（連接埠轉譯）', '由路由器改寫來源位址與連接埠', '由路由器依轉譯表把目的改回來'],
        ] },
        { type: 'p', text: '前兩個問題都要用到廣播：不知道對方是誰的時候，只能喊給同一個區域網路的每一台聽。廣播只在一個廣播網域裡傳，路由器不會把它轉送到別的網路，所以 DHCP 與 ARP 都是「同一條鏈路上」的協定；第三個問題則發生在路由器把封包從家裡送往網際網路的那一刻。' },
      ],
    },
    {
      id: 'dhcp', title: 'DHCP：用 DORA 四則訊息租一個位址',
      blocks: [
        { type: 'p', text: 'DHCP（Dynamic Host Configuration Protocol，動態主機設定協定）讓主機開機或接上網路時自動取得設定。它跑在 UDP 上：客戶端用 68 埠，伺服器用 67 埠。家用網路的 DHCP 伺服器通常就內建在路由器裡；公司網路則常有專門的伺服器。取得位址的四則訊息依字首合稱 DORA：' },
        { type: 'table', head: ['訊息', '方向', '來源 IP → 目的 IP', 'UDP 連接埠', '重點內容'], rows: [
          ['Discover', '客戶端 → 所有人', '0.0.0.0 → 255.255.255.255（廣播）', '68 → 67', '交易 ID、客戶端 MAC、想要哪些參數'],
          ['Offer', '伺服器 → 客戶端', '192.168.1.1 → 192.168.1.23（廣播旗標為 1 時送 255.255.255.255）', '67 → 68', '提供的位址（yiaddr）、遮罩、路由器、DNS、租約時間、伺服器識別碼'],
          ['Request', '客戶端 → 所有人', '0.0.0.0 → 255.255.255.255（廣播）', '68 → 67', '要哪個位址（選項 50）、選中哪台伺服器（選項 54）'],
          ['Ack', '伺服器 → 客戶端', '192.168.1.1 → 192.168.1.23（同 Offer）', '67 → 68', '確認位址與全部參數，租約從此起算'],
        ] },
        { type: 'p', text: 'Discover 的來源是 0.0.0.0，因為筆電還沒有位址；目的是受限廣播 255.255.255.255，訊框的目的 MAC 是 ff:ff:ff:ff:ff:ff，因為它不知道伺服器在哪裡。四則訊息帶同一個交易 ID，筆電靠它把回應配對到自己的請求。Request 仍用廣播，一來筆電還沒正式擁有位址，二來讓其他提供了 Offer 的伺服器知道自己沒被選中。看筆電的網路設定表在 Ack 之後一次填滿，以及 12 小時後的續約：' },
        { type: 'example', id: 'cn06-dhcp-dora' },
        { type: 'p', text: '位址是「租」來的，租約有期限，伺服器才能把不再使用的位址收回給別人。客戶端不等到期才處理，而是依兩個時間點主動延長：' },
        { type: 'table', head: ['時間點（預設）', '24 小時租約', '客戶端做什麼'], rows: [
          ['T1：租期的 50%', '第 12 小時', '單播 DHCPREQUEST 給原來的伺服器續約（renewing），ciaddr 填自己的位址'],
          ['T2：租期的 87.5%', '第 21 小時', '原伺服器一直沒回應，改用廣播向任何 DHCP 伺服器延長（rebinding）'],
          ['租約到期', '第 24 小時', '仍未延長就停用位址，從 Discover 重新開始'],
        ] },
        { type: 'callout', tone: 'note', title: '廣播過不了路由器，那別的網段怎麼用 DHCP？', text: '公司裡的 DHCP 伺服器常在另一個網段。Discover 是廣播，路由器不會轉送，所以路由器上要設定 DHCP 中繼（relay agent）：它收下廣播，改成單播轉給伺服器，並在 giaddr 欄位填上收到請求的介面位址，讓伺服器知道要從哪一個位址池分配。如果完全要不到位址，許多系統會自己選一個 169.254.0.0/16 的鏈路本地位址（CN05），只能和同一條鏈路上的主機通訊，這通常就是「連上了卻不能上網」的原因。' },
        { type: 'callout', tone: 'warning', title: 'Discover 不是送給閘道的 IP', text: '常有人以為筆電把 Discover 送到 192.168.1.1。可是這時筆電還沒拿到任何設定，根本不知道閘道是誰，預設閘道正是 DHCP 要告訴它的東西之一。Discover 的目的是 255.255.255.255、來源是 0.0.0.0，路由器收到它，是因為它剛好也在同一個廣播網域裡，而且內建了 DHCP 伺服器。' },
      ],
    },
    {
      id: 'arp', title: 'ARP：廣播問 MAC，單播回答，結果記在快取',
      blocks: [
        { type: 'p', text: 'IP 位址決定封包最終送到哪裡，但在一條 Ethernet 鏈路上，訊框只能靠 MAC 位址送達。ARP（Address Resolution Protocol，位址解析協定）負責把同一個網段裡的 IPv4 位址解析成 MAC 位址。ARP 訊息直接裝在 Ethernet 訊框裡（EtherType 0x0806），不經過 IP，所以沒有 IP 標頭，也沒有 TTL；情境把 ARP 標頭畫在 IP 封包原本的位置。有些教科書把 ARP 歸在鏈結層，因為它只在一條鏈路上運作，這只是分類的差別。' },
        { type: 'table', head: ['欄位', '請求（操作碼 1）', '回覆（操作碼 2）'], rows: [
          ['訊框的目的 MAC', 'ff:ff:ff:ff:ff:ff（廣播）', '提出請求的主機的 MAC（單播）'],
          ['硬體類型／協定類型', '1（Ethernet）／0x0800（IPv4）', '同左'],
          ['傳送端 MAC、IP', '提出請求的主機自己的', '回答者自己的（就是被問的那一組）'],
          ['目標 MAC', '00:00:00:00:00:00（未知，正是要問的）', '提出請求的主機的 MAC'],
          ['目標 IP', '要解析的位址', '提出請求的主機的 IP'],
        ] },
        { type: 'p', text: '請求必須廣播，因為還不知道對方的 MAC；回覆可以單播，因為請求的傳送端欄位已經寫了發問者的 IP 與 MAC，被問的主機在回答前就先把這一組記進自己的快取。每次送封包都廣播一次太浪費，所以主機把學到的對應放在 ARP 快取裡。快取的動態項目會老化：一段時間沒有使用就被刪除或標成需要重新確認，避免對方換了網卡或換了位址之後還送錯地方。老化時間依系統而定，Linux 與 Windows 主機大約幾十秒沒用到就要重新確認，Cisco 路由器預設保留 4 小時。' },
        { type: 'callout', tone: 'tip', title: '看看自己電腦的 ARP 快取', text: '在 Windows 或 macOS 輸入 arp -a，Linux 輸入 ip neigh，可以看到目前的 IP 與 MAC 對應。剛開機時通常只有預設閘道一列，因為幾乎每一個往網際網路的封包都要先送給它。' },
        { type: 'p', text: '主機剛取得或變更位址時，常會送出免費 ARP（gratuitous ARP）：傳送端與目標 IP 都填自己的位址，向整個網段宣告「這個 IP 現在對應這個 MAC」，讓其他主機更新快取，也順便發現有沒有別人在用同一個位址。' },
      ],
    },
    {
      id: 'gateway', title: '預設閘道：第一個封包先送到哪裡',
      blocks: [
        { type: 'p', text: '主機每送一個封包，都先用 CN05 的方法判斷：目的位址和自己的遮罩做 AND，結果等於自己的網路位址，就是同網段（on-link），用 ARP 問目的主機本身的 MAC；不相等就是跨網段（off-link），封包交給預設閘道，ARP 問的是閘道的 MAC。不論哪一種，IP 標頭的目的位址都是最終目的地，改變的只有訊框的目的 MAC：' },
        { type: 'table', head: ['筆電 192.168.1.23/24 要送給', '同網段？', 'ARP 問誰', '訊框的目的 MAC', 'IP 標頭的目的位址'], rows: [
          ['網站 198.51.100.80', '否（198.51.100.0 ≠ 192.168.1.0）', '192.168.1.1（預設閘道）', '路由器 LAN 介面的 MAC', '198.51.100.80'],
          ['印表機 192.168.1.50', '是（192.168.1.0）', '192.168.1.50', '印表機的 MAC', '192.168.1.50'],
        ] },
        { type: 'p', text: '下面的情境中，筆電剛拿到位址，ARP 快取是空的。它先連到網站：因為跨網段，第一個 ARP 請求問的是閘道 192.168.1.1；接著列印，印表機在同一個網段，第二個 ARP 請求問的是印表機本身。注意第 3 步與第 6 步兩個 TCP SYN 的目的 MAC：' },
        { type: 'example', id: 'cn06-arp-gateway' },
        { type: 'callout', tone: 'warning', title: '「ARP 會跨過路由器」是錯的', text: '筆電不會對網站 198.51.100.80 發 ARP 請求。ARP 請求是送到 ff:ff:ff:ff:ff:ff 的廣播，只在自己的廣播網域裡傳，路由器不會轉送，遠在別的網路的網站根本收不到。跨網段時筆電只需要閘道的 MAC；路由器轉送到下一段時，再在那一段鏈路上用自己的 ARP 快取找下一站。所以每經過一台路由器，訊框的來源與目的 MAC 都會換掉，IP 位址才是一路帶到底的（做了 NAT 的路由器例外，見下一節）。' },
      ],
    },
    {
      id: 'nat', title: 'NAT 與連接埠轉譯：好幾台裝置共用一個公開位址',
      blocks: [
        { type: 'p', text: 'CN05 提到 RFC 1918 的三段私有位址：10.0.0.0/8、172.16.0.0/12、192.168.0.0/16。任何組織都能在內部使用，所以網際網路上的路由器不會轉送以它們為目的地的封包，回應根本回不來。家裡通常只有 ISP 給的一個公開位址，NAT（Network Address Translation，網路位址轉換）讓整個家用網路共用它：封包從內部送出時，路由器把來源改寫成公開位址；回應回來時，再依記下的對應把目的改回內部位址。' },
        { type: 'p', text: '只換位址還不夠：好幾台裝置同時連到同一個網站時，回應的目的都是同一個公開位址，路由器分不出是誰的。連接埠轉譯（NAPT，Network Address and Port Translation，也稱 PAT）同時改寫來源連接埠，用「公開位址:連接埠」區分每一條連線，並把對應記在轉譯表裡。家用路由器說的 NAT，幾乎都是這一種。下面的情境中，筆電與手機碰巧都用來源連接埠 50000：' },
        { type: 'example', id: 'cn06-nat-pat' },
        { type: 'table', head: ['欄位', '筆電送出（LAN 側）', '路由器轉送後（WAN 側）', '誰改的'], rows: [
          ['來源 IP:連接埠', '192.168.1.23:50000', '203.0.113.5:40001', 'NAT 改寫，記進轉譯表'],
          ['目的 IP:連接埠', '198.51.100.80:443', '198.51.100.80:443', '不變'],
          ['TTL', '64', '63', '每台路由器轉送都減 1'],
          ['來源 MAC → 目的 MAC', '筆電 → 路由器 LAN 介面', '路由器 WAN 介面 → ISP 路由器', '每段鏈路都換新訊框'],
          ['IP 與 TCP 檢查碼', '依原內容計算', '重新計算', 'NAT 改了位址與連接埠，檢查碼也要跟著改'],
        ] },
        { type: 'p', text: '回應回來時，路由器用目的連接埠（以及遠端的位址與連接埠）查轉譯表，把目的換回內部的位址與連接埠。轉譯表的項目不會永遠留著：UDP 的對應通常閒置幾分鐘就刪除（RFC 4787 要求不得少於 2 分鐘），已建立的 TCP 連線閒置時至少保留 2 小時 4 分鐘（RFC 5382），連線正常關閉後就可以清掉。有些路由器在連接埠沒被占用時會保留原本的來源連接埠，但兩台主機用了同一個連接埠時，至少要改掉其中一個。' },
      ],
    },
    {
      id: 'nat-limits', title: 'NAT 的限制：入站連線、連接埠轉送與安全',
      blocks: [
        { type: 'p', text: 'NAT 的轉譯表只在內部主機先送出封包時才建立項目。外部主機主動連進來時，表裡沒有對應，路由器不知道要交給哪一台內部主機，只能丟棄，就像情境的最後一步。家裡架設網站、NAS 或遊戲伺服器，要讓外面連得進來，就必須在路由器上設定連接埠轉送（port forwarding），也就是預先寫好一列固定的對應：' },
        { type: 'table', head: ['外部位址:連接埠', '轉送到內部', '協定', '用途'], rows: [
          ['203.0.113.5:8443', '192.168.1.50:443', 'TCP', '從外面連家裡 NAS 的管理網頁'],
          ['203.0.113.5:25565', '192.168.1.60:25565', 'TCP', '朋友連進家裡的遊戲伺服器'],
        ] },
        { type: 'p', text: '要做連接埠轉送，內部伺服器的位址就不能隨便變，所以通常會在 DHCP 伺服器上為它的 MAC 保留固定位址。NAT 讓 IPv4 位址撐到今天，但也打破了「每台主機都能被直接連到」的端對端原則：視訊通話與連線遊戲要靠 STUN、TURN 等方法穿過 NAT。許多電信業者還在用戶前面再做一層 NAT（電信業者級 NAT，CGNAT，用 100.64.0.0/10，RFC 6598），這時用戶連自己的路由器都沒有公開位址，連接埠轉送也做不了。IPv6 位址夠多，原則上每台裝置都能有全球位址，不需要 NAT。' },
        { type: 'callout', tone: 'warning', title: '「NAT 就是防火牆」是誤解', text: 'NAT 擋下沒有對應的入站封包，是因為它不知道要轉給誰，而不是依照安全政策做判斷。它不檢查內容，不擋內部主機主動連出去的惡意連線；一旦設定了連接埠轉送，那個連接埠就完全暴露；同一個網段裡的其他裝置也不受它保護；轉譯表的項目在逾時之前，遠端主機也能透過它送封包回來。要控制哪些流量可以通過，靠的是防火牆規則（CN19），IPv6 沒有 NAT 時更是如此。' },
      ],
    },
  ],
  examples: [],
  quiz: [
    {
      id: 'cn06-q1', prompt: '剛接上網路的筆電送出 DHCPDISCOVER，IP 標頭的來源與目的位址是什麼？',
      options: ['來源 192.168.1.23，目的 192.168.1.1', '來源 0.0.0.0，目的 255.255.255.255', '來源 0.0.0.0，目的 192.168.1.1', '來源 192.168.1.255，目的 255.255.255.255'],
      answer: 1,
      explanation: '筆電還沒有位址，來源只能填 0.0.0.0；它也不知道 DHCP 伺服器在哪裡，只能送到受限廣播 255.255.255.255。192.168.1.23 是之後才分配到的位址；192.168.1.1 是閘道，但閘道正是 DHCP 要告訴它的設定，送 Discover 時還不知道；192.168.1.255 是網段的廣播位址，不能當來源。',
    },
    {
      id: 'cn06-q2', prompt: 'DHCP 取得位址的四則訊息，正確的順序是哪一個？',
      options: ['Discover → Request → Offer → Ack', 'Request → Offer → Discover → Ack', 'Offer → Discover → Ack → Request', 'Discover → Offer → Request → Ack'],
      answer: 3,
      explanation: '客戶端先廣播 Discover 找伺服器，伺服器回 Offer 提供位址，客戶端再用 Request 表明要哪一個 Offer，最後伺服器以 Ack 確認，合稱 DORA。Request 一定在 Offer 之後，因為它要指名選中的位址與伺服器；Offer 也不可能在 Discover 之前，伺服器要先知道有客戶端在找它。其他順序都把這個因果關係顛倒了。',
    },
    {
      id: 'cn06-q3', prompt: '同一個網段裡，ARP 請求與 ARP 回覆分別怎麼送？',
      options: ['請求廣播，回覆單播給發問的主機', '請求與回覆都是廣播', '請求單播給閘道，回覆廣播', '請求與回覆都由路由器轉送到別的網路'],
      answer: 0,
      explanation: '發問時還不知道對方的 MAC，請求只能送到 ff:ff:ff:ff:ff:ff；請求裡已經寫了發問者的 IP 與 MAC，所以回覆可以單播給它。回覆用廣播是浪費，大家都要處理一次；請求不可能單播，因為正是不知道 MAC 才要問；ARP 只在一條鏈路上運作，路由器不會轉送 ARP 廣播。',
    },
    {
      id: 'cn06-q4', prompt: '筆電 192.168.1.23/24 的預設閘道是 192.168.1.1，ARP 快取是空的。它要送第一個封包給 198.51.100.80，ARP 請求的目標 IP 是哪一個？',
      options: ['198.51.100.80', '255.255.255.255', '192.168.1.1', '203.0.113.5'],
      answer: 2,
      explanation: '198.51.100.80 AND 255.255.255.0 = 198.51.100.0，不是自己的 192.168.1.0，屬於別的網路，所以封包交給預設閘道，ARP 問的是閘道 192.168.1.1 的 MAC。對 198.51.100.80 發 ARP 沒有用，廣播傳不出自己的網段；255.255.255.255 是廣播位址，不是要解析的對象；203.0.113.5 是路由器 WAN 側的公開位址，不在筆電的網段裡。',
    },
    {
      id: 'cn06-q5', prompt: '家裡的筆電與手機都用來源連接埠 50000 連到同一個網站，家用路由器只有一個公開位址。回應回來時，路由器怎麼知道要交給誰？',
      options: ['看回應封包的 TTL 剩多少', '看回應訊框的目的 MAC 位址', '只讓先連線的那一台通過，另一台的封包丟掉', '送出時替兩條連線分配不同的外部連接埠，回應依目的連接埠查轉譯表'],
      answer: 3,
      explanation: '連接埠轉譯在送出時就把兩條連線改成不同的外部連接埠（例如 40001 與 40002），並記在轉譯表；回應的目的連接埠指出是哪一列，再換回內部的位址與連接埠。TTL 只表示還能經過幾台路由器，和主機無關；WAN 側訊框的目的 MAC 都是路由器自己的；NAPT 的目的就是讓多台裝置同時上網，不會丟掉其中一台。',
    },
    {
      id: 'cn06-q6', prompt: '你在家裡的 192.168.1.50 架了網站，朋友從外面連 203.0.113.5:443 卻連不上。最可能的原因是什麼？',
      options: ['NAT 會把所有入站封包加密，朋友無法解開', '轉譯表裡沒有對應的項目，路由器不知道要交給哪台內部主機，需要設定連接埠轉送', '朋友的封包 TTL 不夠，到不了 192.168.1.50', '朋友的電腦沒有先用 ARP 問 192.168.1.50 的 MAC'],
      answer: 1,
      explanation: 'NAT 的對應只在內部主機先連出去時才建立，外部主動連進來時表裡沒有項目，路由器只能丟棄；要預先設定連接埠轉送，把 203.0.113.5:443 對應到 192.168.1.50:443。NAT 不做加密；TTL 與這個問題無關，封包已經到了路由器；朋友的電腦不在你的網段，本來就不能也不需要對 192.168.1.50 發 ARP。',
    },
    {
      id: 'cn06-q7', prompt: '筆電取得 86400 秒（24 小時）的 DHCP 租約。依預設的 T1，它什麼時候、用什麼方式第一次嘗試續約？',
      options: ['43200 秒後，單播 DHCPREQUEST 給原來的伺服器', '86400 秒後租約到期，再重新廣播 Discover', '75600 秒後，單播 DHCPREQUEST 給原來的伺服器', '43200 秒後，廣播 Discover 重新尋找伺服器'],
      answer: 0,
      explanation: 'T1 預設是租期的 50%，86400 × 0.5 = 43200 秒；這時客戶端已經有位址也知道伺服器是誰，所以單播 Request 續約。75600 秒是 T2（87.5%），那時才改用廣播找任何伺服器延長；等到期才處理會讓連線中斷；續約不是從 Discover 重來，而是用 Request 延長同一個位址。',
    },
    {
      id: 'cn06-q8', prompt: '做 NAT 的家用路由器把筆電送往網站的封包從 LAN 轉送到 WAN，下列哪一個描述正確？',
      options: ['只有來源 IP 改變，其他欄位原封不動', '目的 IP 換成路由器的公開位址，回應才能回來', '來源 IP 與來源連接埠換成公開的位址與連接埠，TTL 減 1，訊框換上 WAN 介面與下一站的 MAC；目的 IP 與連接埠不變', '什麼都不變，NAT 只在轉譯表做紀錄'],
      answer: 2,
      explanation: 'NAPT 改寫來源位址與來源連接埠，路由器轉送時 TTL 減 1，訊框是每段鏈路重新產生的，所以 MAC 換成 WAN 介面與 ISP 路由器的，檢查碼也重算。只改來源 IP 會漏掉連接埠、TTL 與 MAC；目的 IP 若被改掉，封包就到不了網站；什麼都不改的話，網站會把回應送到私有位址，回應回不來。',
    },
  ],
  exercises: [],
  network: {
    scenes: [dora, arpGateway, natPat],
    exercises: [
      { id: 'cn06-ex-discover', task: 'field', scene: 'cn06-dhcp-dora', message: 'discover', layer: 'network', field: '目的 IP', title: 'Discover 送到哪裡',
        statement: '在「DHCP：Discover、Offer、Request、Ack 與續約」情境的第 1 步，筆電送出 DHCPDISCOVER。它的 IPv4 標頭的目的 IP 是什麼？',
        hints: ['這時筆電還沒有任何設定，不知道 DHCP 伺服器、也不知道閘道是誰。', '要送給同一個網段的每一台，用的是受限廣播位址。'],
        explanation: '筆電不知道伺服器在哪，只能送到受限廣播 255.255.255.255（來源 0.0.0.0），訊框的目的 MAC 也是 ff:ff:ff:ff:ff:ff。路由器能收到，是因為它在同一個廣播網域裡、又內建 DHCP 伺服器，而不是因為筆電知道它的位址。',
        mistakes: [
          { answer: { value: '192.168.1.1' }, why: '以為 Discover 送給閘道：閘道是 DHCP 要告訴筆電的設定之一，送 Discover 時還不知道。' },
          { answer: { value: '0.0.0.0' }, why: '把來源位址當成目的位址：0.0.0.0 是「我還沒有位址」，填在來源。' },
          { answer: { value: '192.168.1.255' }, why: '用了網段的廣播位址：筆電還不知道自己在哪個網段，只能用受限廣播 255.255.255.255。' },
        ] },
      { id: 'cn06-ex-arp-broadcast', task: 'field', scene: 'cn06-arp-gateway', message: 'arp-gw-request', layer: 'link', field: '目的 MAC', title: 'ARP 請求的訊框',
        statement: '在「第一個封包：先用 ARP 問閘道的 MAC」情境的第 1 步，筆電送出 ARP 請求。承載它的 Ethernet 訊框，目的 MAC 是什麼？',
        hints: ['筆電還不知道閘道的 MAC，訊框要讓網段裡的每一台都收到。', 'ARP 標頭裡的「目標 MAC」與 Ethernet 標頭的「目的 MAC」是兩個不同的欄位。'],
        explanation: 'ARP 請求用廣播送出，Ethernet 標頭的目的 MAC 是 ff:ff:ff:ff:ff:ff。ARP 標頭裡的目標 MAC 填 00:00:00:00:00:00，表示「還不知道」，那是要問的答案，不是訊框要送去的地方。',
        mistakes: [
          { answer: { value: '00:00:00:00:00:00' }, why: '把 ARP 標頭的目標 MAC 當成訊框的目的 MAC：全 0 表示未知，訊框不能送到「未知」，要用廣播。' },
          { answer: { value: '02:00:00:00:06:01' }, why: '填了閘道的 MAC：如果筆電已經知道它，就不必發 ARP 請求了。' },
        ] },
      { id: 'cn06-ex-arp-cache', task: 'table', scene: 'cn06-arp-gateway', message: 'arp-gw-reply', node: 'laptop', table: 'ARP 快取', row: '192.168.1.1', column: 'MAC 位址', title: '筆電學到的閘道 MAC',
        statement: '同一個情境的第 2 步（ARP 回覆）之後，筆電的 ARP 快取中 192.168.1.1 那一列的 MAC 位址是什麼？',
        hints: ['ARP 回覆的傳送端欄位就是答案。', '路由器有兩個介面、兩個 MAC；筆電只能看到和它在同一個網段的那一個。'],
        explanation: '回答的是路由器 LAN 介面（192.168.1.1），所以快取記下 02:00:00:00:06:01。路由器 WAN 介面的 02:00:00:00:06:fe 在另一個網段，筆電永遠不會直接把訊框送到那裡；網站的 MAC 筆電也不會知道，因為 ARP 不跨過路由器。',
        mistakes: [
          { answer: { cell: '02:00:00:00:06:fe' }, why: '填了路由器 WAN 介面的 MAC：路由器每個介面有自己的 MAC，筆電只和 LAN 介面在同一條鏈路上。' },
          { answer: { cell: 'ff:ff:ff:ff:ff:ff' }, why: '填了請求的廣播位址：快取記的是回覆告訴筆電的真正 MAC。' },
          { answer: { cell: '02:00:00:00:06:17' }, why: '填了筆電自己的 MAC：那是路由器的快取記下的，不是筆電學到的。' },
        ] },
      { id: 'cn06-ex-nat-port', task: 'table', scene: 'cn06-nat-pat', message: 'phone-wan', node: 'nat', table: 'NAT 轉譯表', row: '192.168.1.42:50000', column: '外部位址:連接埠', title: '手機分到的外部連接埠',
        statement: '在「NAT 與連接埠轉譯：兩台裝置共用一個公開位址」情境的第 4 步之後，路由器的 NAT 轉譯表中，手機 192.168.1.42:50000 那一列的「外部位址:連接埠」是什麼？請寫成「位址:連接埠」。',
        hints: ['兩台裝置共用同一個公開位址 203.0.113.5。', '筆電的連線已經用了 203.0.113.5:40001，手機的連接埠如果也是 50000 或 40001，回應就分不出來。'],
        explanation: '手機的連線改寫成 203.0.113.5:40002。外部位址只有一個，NAPT 靠外部連接埠區分連線；筆電已占用 40001，所以手機分到 40002，回應的目的連接埠是 40002 時，就換回 192.168.1.42:50000。',
        mistakes: [
          { answer: { cell: '203.0.113.5:50000' }, why: '以為連接埠一定原封不動：筆電與手機都用 50000，如果都對應到 203.0.113.5:50000，回應就分不出是誰的。' },
          { answer: { cell: '203.0.113.5:40001' }, why: '用了筆電那一列的外部連接埠：同一個外部位址:連接埠只能對應一條連線。' },
          { answer: { cell: '192.168.1.42:50000' }, why: '填了內部位址：私有位址不能出現在網際網路上，外部欄位一定是公開位址。' },
        ] },
      { id: 'cn06-ex-reply-port', task: 'field', scene: 'cn06-nat-pat', message: 'reply-lan', layer: 'transport', field: '目的連接埠', title: '換回內部的連接埠',
        statement: '同一個情境的第 6 步，路由器把網站的 SYN-ACK 轉送給筆電。這個封包 TCP 標頭的目的連接埠是什麼？',
        hints: ['在 WAN 側，回應的目的是 203.0.113.5:40001。', '路由器查轉譯表後，把目的換回筆電原本用的位址與連接埠。'],
        explanation: '轉譯表第一列是 192.168.1.23:50000 ↔ 203.0.113.5:40001。路由器收到目的為 40001 的回應，把目的位址與連接埠換回 192.168.1.23:50000，所以 LAN 側的目的連接埠是 50000，筆電的作業系統才認得這是自己那條連線。',
        mistakes: [
          { answer: { value: '40001' }, why: '停在 WAN 側的值：40001 只存在於路由器與網站之間，轉送給筆電前要換回 50000。' },
          { answer: { value: '443' }, why: '填了來源連接埠：SYN-ACK 是網站送出的，443 在來源，目的才是筆電的連接埠。' },
        ] },
    ],
  },
};
