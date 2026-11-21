import type { NetworkScene, NodeTable } from '@/lib/network/model';
import type { LessonContent } from '../schema';

/*
 * CN03 The Data Link Layer, Ethernet, and Switches. A network-protocol lesson (CN-1): four fixed scenes on the OSI
 * model. Every MAC address is locally administered (02:…) except the broadcast address, IP addresses are the RFC 5737
 * documentation range, and FCS values are illustrative. Each switch step carries its MAC table (and, in the first two
 * scenes, a forwarding record with the ports a frame is sent out of) as it is right after that frame, so the table
 * exercises are read from the same data the learner steps through.
 */

const MAC = { a: '02:00:00:00:00:0a', b: '02:00:00:00:00:0b', c: '02:00:00:00:00:0c', d: '02:00:00:00:00:0d', e: '02:00:00:00:00:0e' };
const BROADCAST = 'ff:ff:ff:ff:ff:ff';

const eth = (dst: string, src: string, type: string) => ({ layer: 'link' as const, protocol: 'Ethernet',
  fields: [{ name: '目的 MAC', value: dst }, { name: '來源 MAC', value: src }, { name: 'EtherType', value: type }] });
const tagged = (dst: string, src: string, vlan: string, type: string) => ({ layer: 'link' as const, protocol: 'Ethernet（802.1Q）',
  fields: [{ name: '目的 MAC', value: dst }, { name: '來源 MAC', value: src }, { name: 'TPID', value: '0x8100' }, { name: 'PCP', value: '0' },
    { name: 'DEI', value: '0' }, { name: 'VLAN ID', value: vlan }, { name: 'EtherType', value: type }] });
const IPV4 = '0x0800（IPv4）', ARP = '0x0806（ARP）';

// ---- scene 1: a 4-port switch learns from six frames ------------------------------------------------------------
const macTable = (rows: string[][], changed?: number[]): NodeTable => ({ node: 'sw', name: 'MAC 位址表', head: ['MAC 位址', '連接埠'], rows, ...changed ? { changed } : {} });
const RECORD_HEAD = ['訊框', '進入埠', '送出的連接埠', '原因'];
const learningRecord: string[][] = [
  ['訊框 1', '1', '2,3,4', '目的 MAC（B）不在表中：泛洪'],
  ['訊框 2', '2', '1', '目的 MAC（A）在 1 號埠：轉送'],
  ['訊框 3', '3', '1,2,4', '廣播位址：泛洪'],
  ['訊框 4', '1', '3', '目的 MAC（C）在 3 號埠：轉送'],
  ['訊框 5', '4', '2', '目的 MAC（B）在 2 號埠：轉送'],
  ['訊框 6', '2', '1,3,4', '目的 MAC（E）不在表中：泛洪'],
];
const record1 = (n: number): NodeTable => ({ node: 'sw', name: '轉送紀錄', head: RECORD_HEAD, rows: learningRecord.slice(0, n), changed: [n - 1] });
const A1 = [MAC.a, '1'], B2 = [MAC.b, '2'], C3 = [MAC.c, '3'], D4 = [MAC.d, '4'];

const switchLearning: NetworkScene = {
  id: 'cn03-switch-learning', title: '四埠交換器從六個訊框學出 MAC 位址表', model: 'osi',
  description: '交換器剛重新開機，MAC 位址表是空的；A、B、C、D 分別接在 1 到 4 號埠，彼此早已知道對方的 MAC 位址。依序送出六個訊框，看交換器每一步學到什麼、把訊框送往哪些連接埠（轉送紀錄的「送出的連接埠」由小到大、以逗號分隔）。',
  nodes: [
    { id: 'a', label: '主機 A', kind: 'host', addresses: ['192.0.2.11', MAC.a] },
    { id: 'b', label: '主機 B', kind: 'host', addresses: ['192.0.2.12', MAC.b] },
    { id: 'sw', label: '交換器', kind: 'switch', addresses: ['1 號埠：A', '2 號埠：B', '3 號埠：C', '4 號埠：D'] },
    { id: 'c', label: '主機 C', kind: 'host', addresses: ['192.0.2.13', MAC.c] },
    { id: 'd', label: '主機 D', kind: 'host', addresses: ['192.0.2.14', MAC.d] },
  ],
  messages: [
    { id: 'f1', from: 'a', to: 'sw', label: '訊框 1：A → B', payload: 'IPv4 封包（192.0.2.11 → 192.0.2.12）',
      note: '交換器從 1 號埠收到訊框，先看來源 MAC，記下「A 在 1 號埠」。再看目的 MAC：B 還不在表中，交換器不知道 B 在哪，只好從進入埠以外的所有埠（2、3、4）送出，這叫泛洪。C 與 D 的網卡看到目的 MAC 不是自己，就把訊框丟掉。',
      headers: [eth(MAC.b, MAC.a, IPV4)], tables: [macTable([A1], [0]), record1(1)] },
    { id: 'f2', from: 'b', to: 'sw', label: '訊框 2：B → A', payload: 'IPv4 封包（192.0.2.12 → 192.0.2.11）',
      note: '從 2 號埠進來，交換器學到「B 在 2 號埠」。目的 MAC 是 A，表中寫著 1 號埠，所以只從 1 號埠送出；C、D 完全看不到這個訊框。',
      headers: [eth(MAC.a, MAC.b, IPV4)], tables: [macTable([A1, B2], [1]), record1(2)] },
    { id: 'f3', from: 'c', to: 'sw', label: '訊框 3：C 廣播', payload: 'ARP 請求：誰是 192.0.2.14？請告訴 192.0.2.13',
      note: 'C 送出目的 MAC 為 ff:ff:ff:ff:ff:ff 的廣播。交換器照樣先學來源：「C 在 3 號埠」。廣播位址本來就是要給同一個網路的所有人，所以不查表，直接從 1、2、4 號埠送出。',
      headers: [eth(BROADCAST, MAC.c, ARP)], tables: [macTable([A1, B2, C3], [2]), record1(3)] },
    { id: 'f4', from: 'a', to: 'sw', label: '訊框 4：A → C', payload: 'IPv4 封包（192.0.2.11 → 192.0.2.13）',
      note: 'A 已經在表中而且還是 1 號埠，交換器只更新它的計時，表的內容不變。C 在 3 號埠（訊框 3 學到的），所以只從 3 號埠送出。',
      headers: [eth(MAC.c, MAC.a, IPV4)], tables: [macTable([A1, B2, C3]), record1(4)] },
    { id: 'f5', from: 'd', to: 'sw', label: '訊框 5：D → B', payload: 'IPv4 封包（192.0.2.14 → 192.0.2.12）',
      note: 'D 第一次說話，交換器學到「D 在 4 號埠」，表裡四台主機都齊了。B 在 2 號埠，只從 2 號埠送出。',
      headers: [eth(MAC.b, MAC.d, IPV4)], tables: [macTable([A1, B2, C3, D4], [3]), record1(5)] },
    { id: 'f6', from: 'b', to: 'sw', label: '訊框 6：B → E（不在表中）', payload: 'IPv4 封包（192.0.2.12 → 192.0.2.15）',
      note: 'B 要送給一台關機中的印表機 E（02:00:00:00:00:0e）。E 從來沒有送過訊框，交換器沒有學過它。不認識的目的 MAC 不會被丟掉，而是和訊框 1 一樣泛洪到 1、3、4 號埠；收到的主機發現不是給自己的，各自丟掉。',
      headers: [eth(MAC.e, MAC.b, IPV4)], tables: [macTable([A1, B2, C3, D4]), record1(6)] },
  ],
};

// ---- scene 2: a hub on port 3, filtering and aging ----------------------------------------------------------------
const AGING_HEAD = ['MAC 位址', '連接埠', '最後看到（秒）'];
const agingTable = (rows: string[][], changed: number[]): NodeTable => ({ node: 'sw', name: 'MAC 位址表', head: AGING_HEAD, rows, changed });
const hubRecord: string[][] = [
  ['訊框 1', '3', '1,2', '目的 MAC（D）不在表中：泛洪'],
  ['訊框 2', '3', '無', '目的 MAC（C）也在 3 號埠：過濾'],
  ['訊框 3', '1', '3', '目的 MAC（D）在 3 號埠：轉送'],
  ['訊框 4', '2', '1,3', '目的 MAC（C）已老化移除：泛洪'],
];
const record2 = (n: number): NodeTable => ({ node: 'sw', name: '轉送紀錄', head: RECORD_HEAD, rows: hubRecord.slice(0, n), changed: [n - 1] });

const hubAndFilter: NetworkScene = {
  id: 'cn03-hub-and-filter', title: '集線器後面的兩台主機：過濾與老化', model: 'osi',
  description: '交換器的 3 號埠接了一台舊的集線器，C 與 D 都接在集線器上；A、B 直接接在 1、2 號埠。MAC 位址表多一欄「最後看到」，老化時間是 300 秒。四個訊框分別在第 0、1、200、310 秒送出。',
  nodes: [
    { id: 'a', label: '主機 A', kind: 'host', addresses: ['1 號埠', MAC.a] },
    { id: 'b', label: '主機 B', kind: 'host', addresses: ['2 號埠', MAC.b] },
    { id: 'sw', label: '交換器', kind: 'switch', addresses: ['1 號埠：A', '2 號埠：B', '3 號埠：集線器（C、D 共用）', '老化時間 300 秒'] },
    { id: 'c', label: '主機 C', kind: 'host', addresses: ['經集線器接 3 號埠', MAC.c] },
    { id: 'd', label: '主機 D', kind: 'host', addresses: ['經集線器接 3 號埠', MAC.d] },
  ],
  messages: [
    { id: 'h1', from: 'c', to: 'sw', label: '訊框 1（第 0 秒）：C → D，經集線器', payload: 'IPv4 封包（C → D）',
      note: '集線器是第 1 層設備，沒有表也不看位址：它把 C 的電訊號原樣複製到其他每個埠，所以 D 直接收到了，交換器的 3 號埠也收到一份。交換器學到「C 在 3 號埠」；D 還不在表中，於是泛洪到 1、2 號埠。',
      headers: [eth(MAC.d, MAC.c, IPV4)], tables: [agingTable([[MAC.c, '3', '0']], [0]), record2(1)] },
    { id: 'h2', from: 'd', to: 'sw', label: '訊框 2（第 1 秒）：D → C，經集線器', payload: 'IPv4 封包（D → C）',
      note: '集線器同樣把訊號複製給 C 與交換器，C 已經收到了。交換器學到「D 在 3 號埠」，再查目的 C：也在 3 號埠，正是訊框進來的那一埠。送回去沒有意義（那一側早就收到），所以交換器過濾掉這個訊框，不從任何埠送出。',
      headers: [eth(MAC.c, MAC.d, IPV4)], tables: [agingTable([[MAC.c, '3', '0'], [MAC.d, '3', '1']], [1]), record2(2)] },
    { id: 'h3', from: 'a', to: 'sw', label: '訊框 3（第 200 秒）：A → D', payload: 'IPv4 封包（A → D）',
      note: '交換器學到「A 在 1 號埠」，D 在 3 號埠，只從 3 號埠送出。但 3 號埠後面是集線器，它把訊框複製給 C 與 D：C 的網卡看到目的 MAC 不是自己才丟掉。集線器那一段的頻寬與隱私是所有主機共用的。',
      headers: [eth(MAC.d, MAC.a, IPV4)], tables: [agingTable([[MAC.c, '3', '0'], [MAC.d, '3', '1'], [MAC.a, '1', '200']], [2]), record2(3)] },
    { id: 'h4', from: 'b', to: 'sw', label: '訊框 4（第 310 秒）：B → C', payload: 'IPv4 封包（B → C）',
      note: '交換器學到「B 在 2 號埠」。C 最後一次出現在第 0 秒、D 在第 1 秒，到第 310 秒都超過 300 秒沒有再當過來源，兩筆都已經老化移除。所以 C 對交換器來說又是未知的目的 MAC，訊框泛洪到 1、3 號埠；等 C 回覆時，交換器會再學一次。',
      headers: [eth(MAC.c, MAC.b, IPV4)], tables: [agingTable([[MAC.a, '1', '200'], [MAC.b, '2', '310']], [1]), record2(4)] },
  ],
};

// ---- scene 3: two VLANs over a trunk ------------------------------------------------------------------------------
const vlanTable = (node: string, rows: string[][], changed?: number[]): NodeTable => ({ node, name: 'MAC 位址表', head: ['MAC 位址', 'VLAN', '連接埠'], rows, ...changed ? { changed } : {} });
const vlanTrunk: NetworkScene = {
  id: 'cn03-vlan-trunk', title: '兩台交換器、兩個 VLAN 與一條 trunk', model: 'osi',
  description: '業務部（VLAN 10）的 A、C 與工程部（VLAN 20）的 B、D 分散在兩台交換器上，兩台交換器的 8 號埠以 trunk 相連。看 802.1Q 標籤什麼時候加上、什麼時候拿掉，以及廣播只在自己的 VLAN 裡流動。',
  nodes: [
    { id: 'a', label: '業務 A', kind: 'host', addresses: ['SW1 1 號埠（VLAN 10）', MAC.a] },
    { id: 'b', label: '工程 B', kind: 'host', addresses: ['SW1 2 號埠（VLAN 20）', MAC.b] },
    { id: 'sw1', label: '交換器 SW1', kind: 'switch', addresses: ['1 號埠：VLAN 10', '2 號埠：VLAN 20', '8 號埠：trunk（VLAN 10、20）'] },
    { id: 'sw2', label: '交換器 SW2', kind: 'switch', addresses: ['1 號埠：VLAN 10', '2 號埠：VLAN 20', '8 號埠：trunk（VLAN 10、20）'] },
    { id: 'c', label: '業務 C', kind: 'host', addresses: ['SW2 1 號埠（VLAN 10）', MAC.c] },
    { id: 'd', label: '工程 D', kind: 'host', addresses: ['SW2 2 號埠（VLAN 20）', MAC.d] },
  ],
  messages: [
    { id: 'v1', from: 'a', to: 'sw1', label: 'A 廣播（VLAN 10，無標籤）', payload: 'ARP 請求：誰是 C？',
      note: 'A 送出的是普通的 Ethernet 訊框，沒有標籤，A 也不知道自己在哪個 VLAN。SW1 依 1 號埠的設定把它歸入 VLAN 10，學到「A 在 VLAN 10 的 1 號埠」。廣播只在 VLAN 10 裡泛洪：SW1 上 VLAN 10 沒有別的存取埠，只剩 trunk 8 號埠；2 號埠的 B 屬於 VLAN 20，收不到。',
      headers: [eth(BROADCAST, MAC.a, ARP)], tables: [vlanTable('sw1', [[MAC.a, '10', '1']], [0])] },
    { id: 'v2', from: 'sw1', to: 'sw2', label: 'A 廣播（trunk，VLAN 10 標籤）', payload: 'ARP 請求：誰是 C？',
      note: 'trunk 上同時跑兩個 VLAN，所以 SW1 在來源 MAC 後面插入 4 位元組的 802.1Q 標籤（TPID 0x8100、VLAN ID 10），並重新計算 FCS。SW2 從 8 號埠收到，讀出 VLAN 10，學到「A 在 VLAN 10 的 8 號埠」：交換器記的是訊框從哪一埠進來，不是 A 實際插在哪裡。',
      headers: [tagged(BROADCAST, MAC.a, '10', ARP)], tables: [vlanTable('sw2', [[MAC.a, '10', '8']], [0])] },
    { id: 'v3', from: 'sw2', to: 'c', label: 'A 廣播（送到 C，拿掉標籤）', payload: 'ARP 請求：誰是 C？',
      note: 'SW2 在 VLAN 10 裡泛洪：除了進入的 8 號埠，VLAN 10 只有 1 號埠。1 號埠是存取埠，送出前拿掉標籤，C 收到的是普通訊框。2 號埠的 D 屬於 VLAN 20，收不到這個廣播。',
      headers: [eth(BROADCAST, MAC.a, ARP)], tables: [vlanTable('sw2', [[MAC.a, '10', '8']])] },
    { id: 'v4', from: 'c', to: 'sw2', label: 'C → A 單播（ARP 回覆）', payload: 'ARP 回覆：C 的 MAC 是 02:00:00:00:00:0c',
      note: 'SW2 學到「C 在 VLAN 10 的 1 號埠」。目的 A 在 VLAN 10 的表中，是 8 號埠，所以只送往 trunk，送出時加上 VLAN 10 標籤。',
      headers: [eth(MAC.a, MAC.c, ARP)], tables: [vlanTable('sw2', [[MAC.a, '10', '8'], [MAC.c, '10', '1']], [1])] },
    { id: 'v5', from: 'sw2', to: 'sw1', label: 'C → A（trunk，VLAN 10 標籤）', payload: 'ARP 回覆：C 的 MAC 是 02:00:00:00:00:0c',
      note: 'SW1 從 trunk 收到 VLAN 10 的訊框，學到「C 在 VLAN 10 的 8 號埠」。A 在 VLAN 10 的 1 號埠，拿掉標籤後只從 1 號埠送給 A。',
      headers: [tagged(MAC.a, MAC.c, '10', ARP)], tables: [vlanTable('sw1', [[MAC.a, '10', '1'], [MAC.c, '10', '8']], [1])] },
    { id: 'v6', from: 'b', to: 'sw1', label: 'B 廣播（VLAN 20，無標籤）', payload: 'ARP 請求：誰是 D？',
      note: 'B 接在 VLAN 20 的 2 號埠，SW1 學到「B 在 VLAN 20 的 2 號埠」。廣播只在 VLAN 20 裡泛洪：1 號埠的 A 在 VLAN 10，收不到；只剩 trunk 8 號埠。兩個部門共用同一台交換器，卻是兩個分開的廣播網域。',
      headers: [eth(BROADCAST, MAC.b, ARP)], tables: [vlanTable('sw1', [[MAC.a, '10', '1'], [MAC.c, '10', '8'], [MAC.b, '20', '2']], [2])] },
    { id: 'v7', from: 'sw1', to: 'sw2', label: 'B 廣播（trunk，VLAN 20 標籤）', payload: 'ARP 請求：誰是 D？',
      note: '同一條 trunk，這次標籤是 VLAN 20。SW2 學到「B 在 VLAN 20 的 8 號埠」，只在 VLAN 20 裡泛洪：拿掉標籤從 2 號埠送給 D，1 號埠的 C 收不到。',
      headers: [tagged(BROADCAST, MAC.b, '20', ARP)], tables: [vlanTable('sw2', [[MAC.a, '10', '8'], [MAC.c, '10', '1'], [MAC.b, '20', '8']], [2])] },
  ],
};

// ---- scene 4: an FCS error is detected and dropped; TCP sends again -------------------------------------------------
const portStats = (rows: string[][], changed: number[]): NodeTable => ({ node: 'sw', name: '連接埠統計', head: ['連接埠', '進入的訊框', '送出的訊框', 'FCS 錯誤'], rows, changed });
const fcsHeaders = [
  { layer: 'transport' as const, protocol: 'TCP', fields: [{ name: '來源連接埠', value: '51000' }, { name: '目的連接埠', value: '80' }, { name: 'Seq', value: '1001' }] },
  { layer: 'network' as const, protocol: 'IPv4', fields: [{ name: '來源 IP', value: '192.0.2.11' }, { name: '目的 IP', value: '192.0.2.12' }] },
  { layer: 'link' as const, protocol: 'Ethernet', fields: [{ name: '目的 MAC', value: MAC.b }, { name: '來源 MAC', value: MAC.a }, { name: 'EtherType', value: IPV4 }, { name: 'FCS（CRC-32）', value: '0x5D3A91C4' }] },
  { layer: 'physical' as const, protocol: 'Ethernet 實體層', fields: [{ name: '前導碼', value: '7 個位元組的 10101010' }, { name: 'SFD', value: '10101011' }] },
];
const fcsCheck: NetworkScene = {
  id: 'cn03-fcs-check', title: 'FCS 不符的訊框被丟掉，由 TCP 重送', model: 'osi',
  description: 'A 透過交換器把一段資料送給內部網頁伺服器 B（交換器已知 A 在 1 號埠、B 在 2 號埠）。第一次送出時線路受到干擾。FCS 的數值是示意值；看是誰發現錯誤、誰負責補救。',
  nodes: [
    { id: 'a', label: '主機 A', kind: 'host', addresses: ['192.0.2.11', MAC.a] },
    { id: 'sw', label: '交換器（存放轉送）', kind: 'switch', addresses: ['1 號埠：A', '2 號埠：B'] },
    { id: 'b', label: '網頁伺服器 B', kind: 'server', addresses: ['192.0.2.12', MAC.b] },
  ],
  messages: [
    { id: 'x1', from: 'a', to: 'sw', label: 'A → B（途中受干擾）', lost: true, payload: 'TCP 區段：Seq 1001 起的 100 位元組',
      note: 'A 的網卡對目的 MAC 到酬載算出 CRC-32，放在訊框尾端的 FCS。線路雜訊翻轉了酬載中的幾個位元。存放轉送的交換器收完整個訊框後用同樣的方法重算，結果和 FCS 不同，於是丟掉訊框、把 1 號埠的 FCS 錯誤加 1。它只知道「有錯」，不知道錯在哪一位，也不會通知 A。',
      headers: fcsHeaders, tables: [portStats([['1', '1', '0', '1'], ['2', '0', '0', '0']], [0])] },
    { id: 'x2', from: 'a', to: 'sw', label: 'A → B（TCP 逾時後重送）', payload: 'TCP 區段：Seq 1001 起的 100 位元組',
      note: 'Ethernet 沒有確認與重送。是 A 的 TCP 遲遲等不到 B 的確認，逾時後重送同一段資料（Seq 還是 1001）。內容相同，算出的 FCS 也相同；這次一路沒有干擾，交換器重算相符，查表後從 2 號埠送出。',
      headers: fcsHeaders, tables: [portStats([['1', '2', '0', '1'], ['2', '0', '0', '0']], [0])] },
    { id: 'x3', from: 'sw', to: 'b', label: 'A → B（從 2 號埠送出）', payload: 'TCP 區段：Seq 1001 起的 100 位元組',
      note: '交換器不改目的與來源 MAC，訊框原樣送出，FCS 不變。B 的網卡再檢查一次 FCS，相符才把 IP 封包交給上層；B 的 TCP 收到資料後回覆確認。',
      headers: fcsHeaders, tables: [portStats([['1', '2', '0', '1'], ['2', '0', '1', '0']], [1])] },
  ],
};

export const CN03: LessonContent = {
  lessonId: 'CN03',
  motivation: '上一課把網路分成幾層，這一課停在最貼近線路的那一段：同一個區域網路裡，一台電腦的資料怎麼只送到隔壁那台，而不是吵到整棟樓？你插上網路線時用的就是 Ethernet，資料被裝進訊框，用 MAC 位址指明收件人，用尾端的 FCS 檢查有沒有在路上損壞；中間的交換器沒有人設定，卻能自己學會每台電腦接在哪一埠。看懂這些，你就能解釋為什麼網路剛開機時第一個封包會送到每台電腦、為什麼舊的集線器讓別人看得到你的流量、為什麼業務部與工程部接在同一台交換器上卻彼此收不到廣播。學完後，給你一串訊框，你能逐步填出交換器的 MAC 位址表，並預測每個訊框會從哪些連接埠送出。',
  sections: [
    {
      id: 'frame', title: '訊框：資料鏈結層送出的單位',
      blocks: [
        { type: 'p', text: '在分層模型裡，資料鏈結層負責「同一段鏈路上的下一站」。網路層交下來一個 IP 封包，鏈結層在前面加上標頭、後面加上檢查碼，包成一個訊框（frame），再交給實體層變成線路上的電或光訊號。今天有線區域網路幾乎都用 Ethernet（IEEE 802.3），它的訊框依序是：' },
        { type: 'table', head: ['欄位', '長度', '用途'], rows: [
          ['前導碼（preamble）', '7 位元組', '重複的 10101010，讓接收端對準時脈；屬於實體層，不算在訊框長度內'],
          ['訊框起始定界符（SFD）', '1 位元組', '10101011，告訴接收端下一個位元就是目的 MAC 的開頭'],
          ['目的 MAC 位址', '6 位元組', '放在最前面，網卡與交換器一讀到就能決定要不要收、往哪裡送'],
          ['來源 MAC 位址', '6 位元組', '送出這個訊框的介面；交換器靠它學習'],
          ['EtherType', '2 位元組', '酬載是哪一種協定：0x0800 是 IPv4、0x0806 是 ARP、0x86DD 是 IPv6'],
          ['酬載（payload）', '46–1500 位元組', '上層交下來的資料，例如一個 IP 封包；不足 46 位元組時補齊'],
          ['訊框檢查序列（FCS）', '4 位元組', '對目的 MAC 到酬載算出的 CRC-32，接收端用來偵測傳輸錯誤'],
        ] },
        { type: 'p', text: '從目的 MAC 算到 FCS，一個 Ethernet 訊框最短 64 位元組、最長 1518 位元組（加上 VLAN 標籤是 1522）。酬載上限 1500 位元組就是常聽到的 MTU：比它大的 IP 封包放不進一個訊框。EtherType 的值都不小於 0x0600；舊式的 802.3 格式在同一個位置放的是長度（不超過 1500），接收端靠數值大小分辨兩種寫法。' },
        { type: 'callout', tone: 'note', title: '目的位址為什麼放在來源前面', text: '交換器與網卡最急著知道的是「這是給誰的」。目的 MAC 排在第一個，硬體收到前 6 個位元組就能開始判斷，不必等整個訊框收完；有些交換器（cut-through）甚至讀完目的 MAC 就開始轉送。' },
      ],
    },
    {
      id: 'mac', title: 'MAC 位址：網卡在區域網路上的名字',
      blocks: [
        { type: 'p', text: 'MAC 位址有 48 個位元，通常寫成 6 個以冒號分隔的十六進位位元組，例如 02:00:00:00:00:0a。出廠時燒在網卡上的位址，前 3 個位元組是 IEEE 分配給製造商的 OUI（組織唯一識別碼），後 3 個位元組由製造商自己編號，所以全世界的網卡位址原則上不重複。' },
        { type: 'p', text: '第一個位元組的最低兩個位元有特別意義：最低位元是 1 表示群組位址（一次送給一群介面），是 0 表示單播；次低位元是 1 表示本地管理位址，由管理者或軟體自己指定，不屬於任何製造商。02 寫成二進位是 0000 0010，正好是「本地管理的單播位址」，所以本課的例子都用 02 開頭，不會和真實的網卡相撞。手機連 Wi-Fi 時使用的隨機（私人）MAC 位址也是本地管理位址。' },
        { type: 'table', head: ['位址', '寫法', '誰會收下'], rows: [
          ['單播', '第一個位元組最低位元為 0，例如 02:00:00:00:00:0b', '只有位址相同的那張網卡'],
          ['廣播', 'ff:ff:ff:ff:ff:ff（48 個位元全是 1）', '同一個廣播網域裡的每一張網卡'],
          ['群播', '第一個位元組最低位元為 1（廣播之外）', '加入該群組的網卡'],
        ] },
        { type: 'p', text: 'MAC 位址和 IP 位址分工不同：MAC 位址只在同一段鏈路上有意義，訊框每經過一台路由器，來源與目的 MAC 就換成那一段的兩端；IP 位址則一路不變，負責跨網路找路。MAC 位址是扁平的，看不出主機在哪個網路，所以只適合在區域網路裡用。' },
      ],
    },
    {
      id: 'error-detection', title: '錯誤偵測：同位元、檢查碼與 CRC',
      blocks: [
        { type: 'p', text: '線路上的雜訊會讓 0 變成 1、1 變成 0。錯誤偵測的共同想法是：送出端依資料算出幾個多餘的位元一起送出，接收端用同樣的方法再算一次，兩邊不一樣就知道資料壞了。多出來的位元越多、算法越好，漏掉的錯誤就越少。' },
        { type: 'list', items: [
          '同位元（parity）：在資料後面加 1 個位元，讓 1 的個數變成偶數（偶同位）。資料 1011001 有四個 1，同位元是 0，送出 10110010。任何一個位元翻轉，1 的個數變成奇數，接收端就發現了；但兩個位元同時翻轉，個數仍是偶數，錯誤溜過去。',
          '檢查碼（checksum）：把資料切成一段一段的數字相加，送出總和；接收端重加一次比較。IPv4 標頭、TCP、UDP 用的是 16 位元的網際網路檢查碼。它算得快，但看不出兩段資料互換位置（加法順序不影響總和）。',
          'CRC（循環冗餘檢查）：把整串位元當成一個多項式，除以約定好的生成多項式（模 2 運算），餘數就是檢查碼。Ethernet 的 FCS 用 CRC-32：所有單一位元錯誤、所有長度不超過 32 位元的連續錯誤都一定抓得到，隨機的損壞只有約 2³² 分之一的機會漏掉。',
        ] },
        { type: 'table', head: ['方法', '多出的位元', '一定偵測得到', '會漏掉的例子', '用在哪裡'], rows: [
          ['偶同位', '1', '奇數個位元錯誤', '兩個位元同時翻轉', '早期的序列傳輸、部分記憶體'],
          ['網際網路檢查碼', '16', '單一位元錯誤', '兩段 16 位元資料互換位置', 'IPv4 標頭、TCP、UDP'],
          ['CRC-32', '32', '單一位元錯誤、32 位元以內的連續錯誤', '極少數剛好被整除的損壞', 'Ethernet 與 Wi-Fi 的 FCS、ZIP 與 PNG 檔'],
        ] },
        { type: 'callout', tone: 'warning', title: '常見誤解：CRC 會把錯誤修正回來', text: 'FCS 只回答「有沒有壞」，不回答「哪一位壞了」。網卡或交換器發現 FCS 不符，就把整個訊框丟掉，Ethernet 本身也沒有確認與重送；補救的是上層，例如 TCP 等不到確認就重送。能修正錯誤的是另一類技術（前向錯誤更正，例如漢明碼），需要多出許多冗餘位元；部分高速 Ethernet 的實體層另外加了這種更正，但那不是 FCS 的工作。' },
        { type: 'example', id: 'cn03-fcs-check' },
      ],
    },
    {
      id: 'switch-learning', title: '交換器學習：轉送、泛洪與過濾',
      blocks: [
        { type: 'p', text: '交換器不需要任何人告訴它誰接在哪裡。它維護一張 MAC 位址表（也叫 CAM 表），記錄「這個 MAC 位址在哪一個連接埠」。每收到一個訊框，交換器依序做下面的事：' },
        { type: 'list', ordered: true, items: [
          '學習：看來源 MAC，記下（或更新）「來源 MAC 在進入埠」，並重設這一筆的計時。',
          '目的 MAC 是廣播位址：從進入埠以外的所有埠送出（泛洪）。',
          '目的 MAC 不在表中（未知單播）：同樣泛洪，因為不知道對方在哪。',
          '目的 MAC 在表中、連接埠不是進入埠：只從那一埠送出（轉送）。',
          '目的 MAC 在表中、連接埠就是進入埠：不送出（過濾），因為那一側已經收到了。',
        ] },
        { type: 'p', text: '只有來源 MAC 會讓交換器學到東西，目的 MAC 只是用來查表。MAC 位址表就是一張以 MAC 位址為鍵的查找表，和雜湊表的想法相同：不論表裡有多少筆，查一次都很快，硬體上用專門的記憶體在每個訊框到達時完成。下面的情境從空表開始，跟著六個訊框一步一步看表與轉送紀錄怎麼變。' },
        { type: 'example', id: 'cn03-switch-learning' },
        { type: 'callout', tone: 'warning', title: '常見誤解：交換器不認識目的 MAC 就把訊框丟掉', text: '交換器收到不在表中的目的 MAC 時不會丟掉，而是泛洪到所有其他埠，讓對方一定收得到；等對方回覆，交換器從回覆的來源 MAC 學到它的位置，之後就只轉送到那一埠。會被丟掉的是 FCS 不符的訊框，以及目的地就在進入埠那一側的訊框（過濾）。' },
      ],
    },
    {
      id: 'hub-switch-router', title: '集線器、交換器與路由器，以及表的老化',
      blocks: [
        { type: 'p', text: '三種設備都能把電腦接在一起，但它們看的東西、工作的層級完全不同。集線器只懂電訊號；交換器看 MAC 位址，只在同一個區域網路裡轉送；路由器看 IP 位址，把封包送到另一個網路，而且每一段都換上新的訊框。' },
        { type: 'table', head: ['設備', '工作層級', '看什麼', '怎麼送', '碰撞網域', '廣播網域'], rows: [
          ['集線器（hub）', '第 1 層（實體層）', '只看訊號，不懂位址', '把訊號複製到其他所有埠', '所有埠共用一個', '一個'],
          ['交換器（switch）', '第 2 層（資料鏈結層）', '來源與目的 MAC', '查 MAC 位址表：轉送、泛洪或過濾', '每個埠各自一個（全雙工時不會碰撞）', '一個（劃分 VLAN 時每個 VLAN 一個）'],
          ['路由器（router）', '第 3 層（網路層）', '目的 IP', '查路由表，換上新的訊框送往下一站', '每個介面各自一個', '每個介面各自一個，不轉送廣播'],
        ] },
        { type: 'p', text: 'MAC 位址表的每一筆都有壽命。一個 MAC 位址在老化時間內（常見預設是 300 秒）都沒有再當過來源，那一筆就被移除。這樣筆電換了座位、主機拔線或關機之後，錯的紀錄不會一直留著，表的空間也留給還在說話的主機。被移除的位址再出現在目的欄時，交換器就回到泛洪，直到重新學到為止。' },
        { type: 'example', id: 'cn03-hub-and-filter' },
        { type: 'callout', tone: 'note', title: '集線器上沒有祕密', text: '接在同一台集線器上的主機，會收到彼此所有的單播訊框，只是網卡看到目的 MAC 不是自己才丟掉；一張設成混雜模式的網卡就能全部收下。這也是集線器被交換器取代的原因之一。' },
      ],
    },
    {
      id: 'vlan', title: 'VLAN：在同一台交換器上切出幾個網路',
      blocks: [
        { type: 'p', text: '一個廣播網域裡的每台主機都會收到每個廣播。公司把所有部門接在同一組交換器上時，可以用 VLAN（虛擬區域網路）把連接埠分組：同一個 VLAN 的埠像接在同一台交換器上，不同 VLAN 之間的訊框完全不互通，每個 VLAN 是一個獨立的廣播網域，MAC 位址表也依 VLAN 分開查。' },
        { type: 'p', text: '只屬於一個 VLAN、接主機的埠叫存取埠（access port），進出的訊框沒有標籤，主機也不知道自己在哪個 VLAN。交換器之間要同時承載多個 VLAN 的鏈路叫 trunk，訊框在上面帶著 IEEE 802.1Q 標籤：在來源 MAC 之後插入 4 個位元組，所以訊框最長變成 1522 位元組，FCS 也要重新計算。' },
        { type: 'table', head: ['802.1Q 標籤欄位', '位元', '內容'], rows: [
          ['TPID', '16', '固定是 0x8100，放在原本 EtherType 的位置，表示後面跟著 VLAN 標籤'],
          ['PCP', '3', '優先等級 0–7，給需要服務品質的流量（例如語音）使用'],
          ['DEI', '1', '壅塞時這個訊框可以優先被丟掉'],
          ['VLAN ID（VID）', '12', '0–4095，其中 0 與 4095 保留，可用的是 1–4094'],
        ] },
        { type: 'p', text: '多數交換器的 trunk 還有一個原生 VLAN（native VLAN），屬於它的訊框在 trunk 上不加標籤。不同 VLAN 的主機要互相通訊，必須經過路由器（或有路由功能的第三層交換器），就像兩個不同的網路一樣。' },
        { type: 'example', id: 'cn03-vlan-trunk' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  network: {
    scenes: [switchLearning, hubAndFilter, vlanTrunk, fcsCheck],
    exercises: [
      { id: 'cn03-ex-unknown-flood', task: 'table', scene: 'cn03-switch-learning', message: 'f6', node: 'sw', table: '轉送紀錄', row: '訊框 6', column: '送出的連接埠',
        title: '送給不在表中的 E',
        statement: '在「四埠交換器從六個訊框學出 MAC 位址表」中，B 送出訊框 6，目的 MAC 是從來沒說過話的 E（02:00:00:00:00:0e）。交換器會從哪些連接埠送出這個訊框？請由小到大、以半形逗號分隔作答（例如 1,2）；如果不從任何埠送出，填「無」。',
        hints: ['先看 E 有沒有出現在訊框 5 之後的 MAC 位址表裡。', '目的 MAC 不在表中時，交換器要確保對方一定收得到。', '泛洪不會送回訊框進來的那一埠；B 接在 2 號埠。'],
        explanation: 'E 從來沒有當過來源，表中沒有它，屬於未知單播，交換器從進入埠（2 號）以外的所有埠泛洪：1、3、4 號埠。收到的 A、C、D 各自發現目的 MAC 不是自己而丟掉。',
        mistakes: [
          { answer: { cell: '無' }, why: '以為交換器不認識目的 MAC 就把訊框丟掉：未知單播會泛洪，丟掉的話新主機永遠收不到第一個訊框。' },
          { answer: { cell: '1,2,3,4' }, why: '把進入埠也算進去：泛洪不會從訊框進來的那一埠送回去。' },
        ] },
      { id: 'cn03-ex-filter', task: 'table', scene: 'cn03-hub-and-filter', message: 'h2', node: 'sw', table: '轉送紀錄', row: '訊框 2', column: '送出的連接埠',
        title: '同一埠上的回覆',
        statement: '在「集線器後面的兩台主機：過濾與老化」中，D 在第 1 秒回覆 C（訊框 2），經過集線器從 3 號埠進入交換器。交換器會從哪些連接埠送出它？請由小到大、以半形逗號分隔作答；如果不從任何埠送出，填「無」。',
        hints: ['訊框 1 之後，交換器已經知道 C 在哪一埠。', '比較目的 MAC 所在的埠與訊框進來的埠。'],
        explanation: '訊框 1 讓交換器學到 C 在 3 號埠；訊框 2 也從 3 號埠進來。目的地就在進入埠那一側，集線器早已把訊號送到 C，交換器過濾掉這個訊框，不從任何埠送出，答案是「無」。',
        mistakes: [
          { answer: { cell: '1,2' }, why: '以為目的 MAC 不在表中而泛洪：C 在訊框 1 就被學到了（交換器從來源 MAC 學習）。' },
          { answer: { cell: '3' }, why: '照表轉送到 3 號埠：3 號埠正是進入埠，送回去只會讓集線器那一段再多一份重複的訊框。' },
        ] },
      { id: 'cn03-ex-trunk-port', task: 'table', scene: 'cn03-vlan-trunk', message: 'v2', node: 'sw2', table: 'MAC 位址表', row: MAC.a, column: '連接埠',
        title: 'SW2 記下 A 在哪一埠',
        statement: '在「兩台交換器、兩個 VLAN 與一條 trunk」中，A 的廣播經 trunk 到達 SW2 之後，SW2 的 MAC 位址表裡，A（02:00:00:00:00:0a）那一筆的連接埠是幾號？',
        hints: ['A 實際接在 SW1 的 1 號埠，但 SW2 看不到 SW1 的內部。', '交換器學到的是「這個來源 MAC 的訊框從我的哪一埠進來」。'],
        explanation: 'SW2 是從自己的 8 號埠（trunk）收到 A 的訊框，所以記下 A 在 VLAN 10 的 8 號埠。以後 SW2 要送給 A 的訊框都往 8 號埠送，由 SW1 再轉給 A。',
        mistakes: [
          { answer: { cell: '1' }, why: '填了 A 在 SW1 上的埠號：每台交換器只記錄訊框從自己的哪一埠進來。' },
          { answer: { cell: '10' }, why: '把 VLAN ID 當成連接埠：A 屬於 VLAN 10，但 SW2 是從 8 號埠收到它。' },
        ] },
      { id: 'cn03-ex-vlan-id', task: 'field', scene: 'cn03-vlan-trunk', message: 'v7', layer: 'link', field: 'VLAN ID',
        title: 'trunk 上的 VLAN 標籤',
        statement: '在「兩台交換器、兩個 VLAN 與一條 trunk」的最後一步，B 的廣播從 SW1 經 trunk 送到 SW2。這個訊框 802.1Q 標籤裡的 VLAN ID 是多少？',
        hints: ['B 接在 SW1 的哪一個埠？那一埠屬於哪個 VLAN？', '同一條 trunk 會承載不同 VLAN 的訊框，每個訊框各自標上自己的 VLAN。'],
        explanation: 'B 接在 SW1 屬於 VLAN 20 的 2 號埠，SW1 把它的訊框歸入 VLAN 20，送上 trunk 時標籤寫 VLAN ID 20；SW2 依這個標籤只在 VLAN 20 裡泛洪，所以 D 收到、C 收不到。',
        mistakes: [
          { answer: { value: '10' }, why: '以為一條 trunk 只走一個 VLAN（前幾步都是 VLAN 10）：trunk 上每個訊框各自標記自己的 VLAN。' },
          { answer: { value: '8' }, why: '把 trunk 的連接埠號當成 VLAN ID：埠號是交換器本地的編號，不會寫進訊框。' },
        ] },
    ],
  },
  quiz: [
    {
      id: 'q-unknown-unicast', prompt: '交換器收到一個單播訊框，目的 MAC 不在 MAC 位址表裡。它會怎麼做？',
      options: ['丟掉訊框，等目的主機先說話再說', '從進入埠以外的所有埠送出（泛洪）', '從進入的那一埠送回去，讓來源重送', '交給預設閘道，由路由器去找'],
      answer: 1,
      explanation: '未知單播會泛洪到進入埠以外的所有埠，確保對方收得到；對方回覆時交換器再從來源 MAC 學到它的位置。丟掉會讓新主機永遠收不到第一個訊框；送回進入埠沒有意義；交換器在第 2 層工作，不會把訊框交給路由器處理。',
    },
    {
      id: 'q-mac-bits', prompt: '關於 MAC 位址的長度與結構，哪一個敘述正確？',
      options: ['32 位元；前 24 位元是網路編號', '48 位元；前 24 位元是主機在區域網路裡的流水號', '64 位元；前 24 位元是交換器的連接埠號', '48 位元；前 24 位元是 OUI，代表分配這組位址的組織（通常是網卡製造商）'],
      answer: 3,
      explanation: 'MAC 位址是 48 位元（6 個位元組），前 3 個位元組是 IEEE 分配的 OUI，後 3 個位元組由製造商編號。32 位元與「網路編號」是 IPv4 的概念；流水號在後 24 位元而不是前 24 位元；MAC 位址和交換器的埠號無關，埠號只記在交換器的表裡。',
    },
    {
      id: 'q-fcs-drop', prompt: '一台存放轉送（store-and-forward）交換器收到一個 FCS 不符的訊框，它會怎麼做？',
      options: ['丟掉這個訊框；Ethernet 不會通知來源，也不會自己重送', '用 FCS 算出錯的位元，改正後照常轉送', '回送一個錯誤訊框，要求來源重送', '照常轉送，讓目的端的應用程式決定要不要用'],
      answer: 0,
      explanation: 'FCS 的 CRC-32 只能偵測錯誤，交換器發現不符就丟掉訊框並計數。CRC 不能指出哪一位錯，所以無法更正；Ethernet 沒有確認與重送機制，也沒有「錯誤訊框」可以回送，重送是 TCP 等上層的事；存放轉送交換器正是為了不把壞訊框轉出去才先收完再檢查。',
    },
    {
      id: 'q-devices', prompt: '下面哪一組「設備：工作層級與依據」是正確的？',
      options: ['集線器：第 2 層，依目的 MAC 決定送往哪個埠', '交換器：第 3 層，依目的 IP 查路由表', '路由器：第 3 層，依目的 IP 在不同網路之間轉送，並為下一段換上新的訊框', '交換器：第 1 層，把電訊號重複到所有埠'],
      answer: 2,
      explanation: '路由器在網路層依目的 IP 查路由表，送往下一站時換上新的來源與目的 MAC。集線器是第 1 層，不懂 MAC 位址，只把訊號複製到所有埠；交換器是第 2 層，依 MAC 位址表轉送，不查路由表，也不是盲目重複訊號。',
    },
    {
      id: 'q-vlan-broadcast', prompt: '一台交換器的 1 號埠與 3 號埠屬於 VLAN 10，2 號埠屬於 VLAN 20。1 號埠的主機送出廣播（ff:ff:ff:ff:ff:ff），哪些埠會送出這個廣播？',
      options: ['2 號埠與 3 號埠：廣播要送給所有人', '只有 3 號埠：廣播只在同一個 VLAN 裡泛洪', '都不會：交換器不轉送廣播', '只有 2 號埠：不同 VLAN 才需要收到廣播'],
      answer: 1,
      explanation: '每個 VLAN 是一個獨立的廣播網域，廣播只在 VLAN 10 的其他埠（3 號埠）泛洪。2 號埠在 VLAN 20，收不到；交換器會在 VLAN 內轉送廣播，不轉送廣播的是路由器；說「不同 VLAN 才需要收到」正好把 VLAN 的作用說反了。',
    },
    {
      id: 'q-parity', prompt: '用偶同位保護 7 個資料位元 1011001（同位元是 0）。如果傳輸中恰好有兩個位元翻轉，接收端會怎樣？',
      options: ['偵測不到：兩個位元翻轉後，1 的個數仍是偶數', '偵測得到：同位元一定會跟著改變', '偵測得到，而且能指出是哪兩個位元錯了', '偵測不到，因為同位元只檢查第一個位元'],
      answer: 0,
      explanation: '兩個位元翻轉會讓 1 的個數增加 2、減少 2 或不變，奇偶不變，所以偶同位看不出來。同位元是送出端算好的，不會跟著線路上的錯誤改變；單一同位元即使偵測到錯誤也無法定位；它檢查的是全部位元中 1 的個數，不是第一個位元。',
    },
    {
      id: 'q-dot1q', prompt: 'SW1 與 SW2 之間的 trunk 同時承載 VLAN 10 與 VLAN 20。收到訊框的交換器怎麼知道它屬於哪個 VLAN？',
      options: ['看 IP 標頭裡的 VLAN 欄位', '看目的 MAC 位址的前 3 個位元組', '每個 VLAN 各用一條實體線，看是從哪條線進來', '看插在來源 MAC 之後的 802.1Q 標籤：TPID 0x8100 加上 12 位元的 VLAN ID'],
      answer: 3,
      explanation: 'trunk 上的訊框在來源 MAC 之後帶著 4 位元組的 802.1Q 標籤，交換器讀 VLAN ID 決定它屬於哪個 VLAN。IP 標頭沒有 VLAN 欄位，交換器也不看 IP；MAC 位址的前 3 個位元組是 OUI，和 VLAN 無關；每個 VLAN 各拉一條線就不是 trunk 了，trunk 的用意正是在一條鏈路上承載多個 VLAN。',
    },
    {
      id: 'q-trace', prompt: '一台交換器的 MAC 位址表一開始是空的。A（1 號埠）送給 B，B（2 號埠）回給 A，接著 C（3 號埠）送給 A。處理完這三個訊框後，表裡有幾筆？C 的訊框從哪些埠送出？',
      options: ['2 筆；從 1、2、4 號埠送出', '3 筆；只從 1 號埠送出', '3 筆；從 1、2、4 號埠送出', '1 筆；只從 1 號埠送出'],
      answer: 1,
      explanation: '交換器從每個訊框的來源 MAC 學習，三個訊框的來源 A、B、C 都各記一筆，共 3 筆。C 的訊框要給 A，A 在第一個訊框就被學到在 1 號埠，所以只從 1 號埠送出。說 2 筆是漏了 C 自己的來源；泛洪只在目的不在表中時才發生；1 筆是以為交換器只從目的 MAC 學習。',
    },
  ],
};
