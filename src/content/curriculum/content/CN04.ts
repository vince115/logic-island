import type { NetworkScene } from '@/lib/network/model';
import type { LessonContent } from '../schema';

/*
 * CN04 Wi-Fi and mobile network basics (network-sequence). Three fixed scenes: a phone joining a WPA2-Personal access
 * point (802.11 management frames, then the EAPOL 4-way handshake), the hidden-terminal problem solved by RTS/CTS and
 * the NAV, and a 5G handover between two gNBs during a download. Addresses are RFC 5737 documentation ranges and locally
 * administered MAC addresses (02:…). Durations in the RTS/CTS scene are an illustrative 5 GHz OFDM example: SIFS 16 µs,
 * CTS and ACK sent at 6 Mbps (44 µs each), a data frame of 300 µs, so RTS 436, CTS 376, data 60, ACK 0.
 */

const MAC = { phone: '02:00:00:00:00:1a', a: '02:00:00:00:00:0a', c: '02:00:00:00:00:0c', ap: '02:00:00:00:00:a1', gateway: '02:00:00:00:00:01' };
const BROADCAST = 'ff:ff:ff:ff:ff:ff';

const management = (subtype: string, to: string, from: string) => ({ layer: 'link' as const, protocol: '802.11', fields: [
  { name: '類型', value: '管理（Management）' }, { name: '子類型', value: subtype },
  { name: '位址 1（接收端）', value: to }, { name: '位址 2（傳送端）', value: from }, { name: '位址 3（BSSID）', value: to === BROADCAST && from !== MAC.ap ? BROADCAST : MAC.ap }] });
/** A data frame between the phone and the AP (To DS from the phone, From DS from the AP). */
const data = (fromPhone: boolean, address3: string, isProtected: boolean) => ({ layer: 'link' as const, protocol: '802.11', fields: [
  { name: '類型', value: '資料（Data）' }, { name: 'To DS／From DS', value: fromPhone ? '1／0' : '0／1' },
  { name: '位址 1（接收端）', value: fromPhone ? MAC.ap : MAC.phone }, { name: '位址 2（傳送端）', value: fromPhone ? MAC.phone : MAC.ap },
  { name: fromPhone ? '位址 3（最終目的）' : '位址 3（原始來源）', value: address3 }, { name: 'Protected Frame', value: isProtected ? '1' : '0' }] });
const stations = (state: string, changed: boolean) => ({ node: 'ap', name: 'AP 的站台表', head: ['MAC 位址', 'AID', '狀態'], rows: [[MAC.phone, '1', state]], ...changed ? { changed: [0] } : {} });

/** Section 1: a phone finds the AP, authenticates, associates and runs the WPA2 4-way handshake. */
const association: NetworkScene = {
  id: 'cn04-association', title: '手機加入 Wi-Fi：掃描、驗證、關聯與四向交握', model: 'osi',
  description: '手機在 5 GHz 通道 36 上找到 SSID「LogicIsland」（WPA2-Personal）。看它從聽到信標到能送出第一個加密資料訊框，中間交換了哪些 802.11 訊框；每一步都只看資料鏈結層的 802.11 標頭，訊框內容寫在資料欄。',
  nodes: [
    { id: 'phone', label: '手機', kind: 'host', addresses: [`MAC ${MAC.phone}`] },
    { id: 'ap', label: 'AP（LogicIsland）', kind: 'access-point', addresses: [`BSSID ${MAC.ap}`, 'SSID LogicIsland', '5 GHz 通道 36'] },
  ],
  messages: [
    { id: 'beacon', from: 'ap', to: 'phone', label: 'Beacon（信標，廣播）', headers: [management('Beacon', BROADCAST, MAC.ap)],
      payload: 'SSID LogicIsland；信標間隔 100 TU（約 102.4 毫秒）；支援的速率；RSN 元素（WPA2-Personal，加密 CCMP）',
      note: 'AP 定期廣播信標，宣告自己的 SSID、速率與安全設定。目的位址是廣播 ff:ff:ff:ff:ff:ff，範圍內每一台裝置都收得到。只靠收聽信標找網路，叫做被動掃描。' },
    { id: 'probe-req', from: 'phone', to: 'ap', label: 'Probe Request', headers: [management('Probe Request', BROADCAST, MAC.phone)],
      payload: '要找的 SSID：LogicIsland；手機支援的速率',
      note: '手機也可以主動掃描：在每個通道送出 Probe Request，問「有沒有 LogicIsland？」。它還不知道 AP 是誰，所以接收端與 BSSID 都填廣播位址。' },
    { id: 'probe-resp', from: 'ap', to: 'phone', label: 'Probe Response', headers: [management('Probe Response', MAC.phone, MAC.ap)],
      payload: 'SSID LogicIsland；支援的速率；RSN 元素（WPA2-Personal，CCMP）',
      note: 'AP 用 Probe Response 單播回答，內容和信標相似。從這一步起，手機知道了 BSSID，之後的訊框都直接送給這台 AP。' },
    { id: 'auth-1', from: 'phone', to: 'ap', label: 'Authentication（1）', headers: [management('Authentication', MAC.ap, MAC.phone)],
      payload: '驗證演算法 0（Open System）；交易序號 1',
      note: 'WPA2-Personal 的 802.11 驗證只是形式上的 Open System，不檢查密碼；真正確認雙方知道同一個密碼的是後面的四向交握。WPA3-Personal 則把這一步換成 SAE 交換：雙方各送出 Commit 與 Confirm 兩個 Authentication 訊框。' },
    { id: 'auth-2', from: 'ap', to: 'phone', label: 'Authentication（2）', headers: [management('Authentication', MAC.phone, MAC.ap)],
      payload: '驗證演算法 0（Open System）；交易序號 2；狀態碼 0（成功）',
      note: 'AP 回覆狀態碼 0，表示驗證步驟通過，手機可以提出關聯。' },
    { id: 'assoc-req', from: 'phone', to: 'ap', label: 'Association Request', headers: [management('Association Request', MAC.ap, MAC.phone)],
      payload: 'SSID LogicIsland；支援的速率；RSN 元素（選用 PSK 金鑰管理與 CCMP 加密）',
      note: '手機請求加入這個 BSS，並說明自己選用的安全設定與能力。' },
    { id: 'assoc-resp', from: 'ap', to: 'phone', label: 'Association Response', headers: [management('Association Response', MAC.phone, MAC.ap)],
      payload: '狀態碼 0（成功）；AID 1',
      note: 'AP 接受關聯，給手機一個關聯識別碼 AID 1，記進站台表。不過金鑰還沒建立，AP 只讓 EAPOL 訊框通過，其他資料一律擋下。',
      tables: [stations('已關聯，等待四向交握', true)] },
    { id: 'eapol-1', from: 'ap', to: 'phone', label: 'EAPOL-Key 1/4', headers: [data(false, MAC.ap, false)],
      payload: 'LLC/SNAP 類型 0x888E（EAPOL）；EAPOL-Key 第 1 則：ANonce（AP 產生的亂數）',
      note: '四向交握用資料訊框攜帶 EAPOL 訊息。WPA2-Personal 的雙方早已從密碼與 SSID 算出同一把 PMK；現在 AP 先送出亂數 ANonce。這時還沒有金鑰，所以 Protected Frame 是 0。' },
    { id: 'eapol-2', from: 'phone', to: 'ap', label: 'EAPOL-Key 2/4', headers: [data(true, MAC.ap, false)],
      payload: 'LLC/SNAP 類型 0x888E（EAPOL）；EAPOL-Key 第 2 則：SNonce（手機產生的亂數）＋ MIC',
      note: '手機有了 PMK、ANonce、自己的 SNonce 與雙方的 MAC 位址，算出這次連線專用的 PTK，再用它計算 MIC。AP 收到 SNonce 後算出同一把 PTK，MIC 對得上就證明手機知道密碼；密碼本身從頭到尾沒有在空中傳送。' },
    { id: 'eapol-3', from: 'ap', to: 'phone', label: 'EAPOL-Key 3/4', headers: [data(false, MAC.ap, false)],
      payload: 'LLC/SNAP 類型 0x888E（EAPOL）；EAPOL-Key 第 3 則：ANonce ＋ MIC ＋ 加密的 GTK（群組金鑰）；要求安裝金鑰',
      note: 'AP 用 MIC 證明自己也有同一把 PTK，並把廣播與群播用的群組金鑰 GTK 加密後交給手機。' },
    { id: 'eapol-4', from: 'phone', to: 'ap', label: 'EAPOL-Key 4/4', headers: [data(true, MAC.ap, false)],
      payload: 'LLC/SNAP 類型 0x888E（EAPOL）；EAPOL-Key 第 4 則：MIC，確認已安裝金鑰',
      note: '手機確認收到，雙方安裝 PTK 與 GTK。AP 從此開放這台手機的一般資料。',
      tables: [stations('金鑰已安裝，可以傳送資料', true)] },
    { id: 'first-data', from: 'phone', to: 'ap', label: '第一個加密資料訊框', headers: [data(true, BROADCAST, true)],
      payload: '以 CCMP 加密的內容（這裡是要取得 IP 位址的 DHCP Discover，之後的課會介紹）',
      note: '第一個一般資料訊框：Protected Frame 變成 1，內容以 PTK 加密，旁人收得到訊框卻讀不到內容。它的最終目的是廣播位址，AP 會再把它轉到有線網路與其他無線裝置。',
      tables: [stations('金鑰已安裝，可以傳送資料', false)] },
  ],
};

const control = (subtype: string, duration: string, to: string, from?: string) => ({ layer: 'link' as const, protocol: '802.11', fields: [
  { name: '類型', value: '控制（Control）' }, { name: '子類型', value: subtype }, { name: 'Duration（微秒）', value: duration },
  { name: '位址 1（接收端）', value: to }, ...from ? [{ name: '位址 2（傳送端）', value: from }] : []] });
const dataFrom = (station: string) => ({ layer: 'link' as const, protocol: '802.11', fields: [
  { name: '類型', value: '資料（Data）' }, { name: 'To DS／From DS', value: '1／0' }, { name: 'Duration（微秒）', value: '60' },
  { name: '位址 1（接收端）', value: MAC.ap }, { name: '位址 2（傳送端）', value: station }, { name: '位址 3（最終目的）', value: MAC.gateway }, { name: 'Protected Frame', value: '1' }] });
const nav = (value: string, state: string) => ({ node: 'c', name: 'C 的 NAV', head: ['站台', 'NAV（微秒）', '狀態'], rows: [['C', value, state]], changed: [0] });

/** Section 4: A and C cannot hear each other; their frames collide at the AP; RTS/CTS and the NAV keep C quiet. */
const hiddenTerminal: NetworkScene = {
  id: 'cn04-hidden-terminal', title: '隱藏終端：碰撞，然後用 RTS/CTS 預約', model: 'osi',
  description: '筆電 A 和筆電 C 分別在 AP 的兩側，都聽得到 AP，卻聽不到彼此。先看兩個資料訊框在 AP 撞在一起，再看 A 改用 RTS/CTS 預約通道。以 5 GHz 為例：SIFS 16 微秒，CTS 與 ACK 以 6 Mbps 送出各 44 微秒，資料訊框假設 300 微秒；數字只用來示範 Duration 怎麼算。',
  nodes: [
    { id: 'a', label: '筆電 A', kind: 'host', addresses: [`MAC ${MAC.a}`, '聽不到 C'] },
    { id: 'ap', label: 'AP', kind: 'access-point', addresses: [`BSSID ${MAC.ap}`] },
    { id: 'c', label: '筆電 C', kind: 'host', addresses: [`MAC ${MAC.c}`, '聽不到 A'] },
  ],
  messages: [
    { id: 'a-data-lost', from: 'a', to: 'ap', label: 'A 的資料訊框', lost: true, headers: [dataFrom(MAC.a)], payload: 'A 要上傳的資料（已加密）',
      note: 'A 聽通道是閒置的，退避倒數到 0 就開始送。它沒有辦法一邊送一邊聽，所以完全不知道接下來發生的事。' },
    { id: 'c-data-lost', from: 'c', to: 'ap', label: 'C 的資料訊框', lost: true, headers: [dataFrom(MAC.c)], payload: 'C 要上傳的資料（已加密）',
      note: 'C 聽不到 A，對它來說通道也是閒置的，於是同時開始送。兩個訊號在 AP 重疊，AP 一個也解不出來，兩個訊框都遺失，AP 不會回 ACK。A 和 C 要等到 ACK 逾時，才知道失敗。' },
    { id: 'rts', from: 'a', to: 'ap', label: 'RTS', headers: [control('RTS', '436', MAC.ap, MAC.a)],
      note: '等不到 ACK，A 把競爭視窗從 15 加倍成 31，重新退避；這次先送一個很短的 RTS，Duration 預約接下來整段交換的時間：SIFS ＋ CTS ＋ SIFS ＋ 資料 ＋ SIFS ＋ ACK = 16 + 44 + 16 + 300 + 16 + 44 = 436 微秒。C 聽不到這個 RTS。',
      tables: [{ node: 'a', name: 'A 的競爭視窗', head: ['站台', 'CW（時槽）'], rows: [['A', '31']], changed: [0] }] },
    { id: 'cts', from: 'ap', to: 'a', label: 'CTS', headers: [control('CTS', '376', MAC.a)],
      note: 'AP 等 SIFS 後回覆 CTS，Duration 是 RTS 的值扣掉已經過去的 SIFS 與 CTS 本身：436 − 16 − 44 = 376 微秒。CTS 的接收端是 A，但 AP 範圍內的每一台裝置都聽得到，包括 C：C 把 NAV 設成 376，在這段時間內把通道當成忙碌，不會開始傳送。',
      tables: [nav('376', '當作忙碌，不傳送')] },
    { id: 'a-data', from: 'a', to: 'ap', label: 'A 的資料訊框（重送）', headers: [dataFrom(MAC.a)], payload: 'A 要上傳的資料（已加密）',
      note: 'A 收到 CTS，等 SIFS 後送出資料。資料訊框的 Duration 只剩後面的 SIFS ＋ ACK = 16 + 44 = 60 微秒。C 聽不到這個資料訊框，它的 NAV 是從 376 一路倒數，資料結束時剛好也剩 60。這次 C 保持安靜，沒有碰撞。',
      tables: [nav('60', '當作忙碌，不傳送')] },
    { id: 'ack', from: 'ap', to: 'a', label: 'ACK', headers: [control('ACK', '0', MAC.a)],
      note: 'AP 收到正確的訊框，等 SIFS 後回 ACK，Duration 為 0：這次交換結束。C 的 NAV 歸零，重新等待通道閒置並繼續自己的退避倒數。',
      tables: [nav('0', '重新競爭通道')] },
  ],
};

const RRC = (message: string, fields: { name: string; value: string }[]) => ({ layer: 'network' as const, protocol: 'RRC（NR）', fields: [{ name: '訊息', value: message }, ...fields] });
const XNAP = (procedure: string, from: string, to: string) => [
  { layer: 'application' as const, protocol: 'XnAP', fields: [{ name: '程序', value: procedure }, { name: '手機', value: '下載中的這支手機' }] },
  { layer: 'network' as const, protocol: 'IPv4', fields: [{ name: '來源 IP', value: from }, { name: '目的 IP', value: to }] }];
const NGAP = (procedure: string, from: string, to: string) => [
  { layer: 'application' as const, protocol: 'NGAP', fields: [{ name: '程序', value: procedure }, { name: '手機', value: '下載中的這支手機' }] },
  { layer: 'network' as const, protocol: 'IPv4', fields: [{ name: '來源 IP', value: from }, { name: '目的 IP', value: to }] }];
const segment = (seq: string) => [
  { layer: 'transport' as const, protocol: 'TCP', fields: [{ name: '來源連接埠', value: '443' }, { name: '目的連接埠', value: '51000' }, { name: '旗標', value: 'ACK' }, { name: 'Seq', value: seq }] },
  { layer: 'network' as const, protocol: 'IPv4', fields: [{ name: '來源 IP', value: '203.0.113.80' }, { name: '目的 IP', value: '192.0.2.50' }] }];
const IP = { gnb1: '198.51.100.11', gnb2: '198.51.100.12', core: '198.51.100.1' };
const downlink = (gnb: string, changed: boolean) => ({ node: 'core', name: '下行路徑', head: ['手機 IP', '送往的基地台'], rows: [['192.0.2.50', gnb]], ...changed ? { changed: [0] } : {} });

/** Section 6: an Xn handover from gNB 1 to gNB 2 while a download continues (conceptual 5G standalone). */
const handover: NetworkScene = {
  id: 'cn04-handover', title: '邊下載邊換手：從 gNB 1 換到 gNB 2', model: 'osi',
  description: '手機（IP 192.0.2.50）正在從伺服器 203.0.113.80 下載檔案，一邊往 gNB 2 的方向移動。以 5G 獨立組網、兩座基地台之間有 Xn 介面的換手為例，看量測報告、換手準備、換手命令、資料轉送與核心網路的路徑切換。只畫出觀念上的主要訊息，細節省略。',
  nodes: [
    { id: 'phone', label: '手機', kind: 'host', addresses: ['IP 192.0.2.50'] },
    { id: 'gnb1', label: '基地台 gNB 1（來源）', kind: 'access-point', addresses: [IP.gnb1] },
    { id: 'gnb2', label: '基地台 gNB 2（目標）', kind: 'access-point', addresses: [IP.gnb2] },
    { id: 'core', label: '核心網路（AMF／UPF）', kind: 'router', addresses: [IP.core] },
  ],
  messages: [
    { id: 'download-1', from: 'gnb1', to: 'phone', label: '下載資料（經 gNB 1）', headers: segment('200001'), payload: '檔案的一段（1400 位元組）',
      note: '伺服器的封包先到核心網路的 UPF，UPF 把它包進 GTP-U 隧道送到目前服務手機的 gNB 1，gNB 1 再用無線電送給手機。UPF 是這支手機 IP 位址的錨點，記著下行資料該送到哪座基地台。',
      tables: [downlink('gNB 1', false)] },
    { id: 'measurement', from: 'phone', to: 'gnb1', label: '量測報告', headers: [RRC('MeasurementReport', [{ name: '觸發事件', value: 'A3（鄰區比服務小區好超過一個偏移量）' }, { name: '服務小區 RSRP', value: '−112 dBm' }, { name: '鄰區（gNB 2）RSRP', value: '−95 dBm' }])],
      note: '手機持續量測鄰近基地台的訊號。gNB 2 的訊號已經比 gNB 1 好超過設定的偏移量，手機依設定回報。RRC 是手機與基地台之間的控制協定，3GPP 把它列為無線介面的第 3 層；它管的是無線連線，不是 IP 路由。換不換手由基地台決定，不是手機。' },
    { id: 'ho-request', from: 'gnb1', to: 'gnb2', label: '換手請求', headers: XNAP('Handover Request', IP.gnb1, IP.gnb2),
      note: 'gNB 1 決定換手，透過基地台之間的 Xn 介面詢問 gNB 2 能不能接手，並交給它這支手機的連線狀態。XnAP 跑在 SCTP 之上，這裡只畫出 XnAP 與 IP。' },
    { id: 'ho-ack', from: 'gnb2', to: 'gnb1', label: '換手請求確認', headers: XNAP('Handover Request Acknowledge', IP.gnb2, IP.gnb1),
      note: 'gNB 2 預留資源，回覆確認，並附上手機接入 gNB 2 需要的設定，由 gNB 1 轉交給手機。' },
    { id: 'ho-command', from: 'gnb1', to: 'phone', label: '換手命令', headers: [RRC('RRCReconfiguration', [{ name: '內容', value: '改由 gNB 2 的小區服務；在新小區用的識別碼 C-RNTI' }])],
      note: 'gNB 1 送出換手命令。手機離開 gNB 1，改和 gNB 2 同步；從這一刻起到接上 gNB 2 之前，無線連線會短暫中斷。' },
    { id: 'forward', from: 'gnb1', to: 'gnb2', label: '轉送還沒送出的下載資料', headers: segment('201401'), payload: '檔案的下一段（1400 位元組）',
      note: 'UPF 還在把下行資料送到 gNB 1。gNB 1 先告訴 gNB 2 目前的封包序號狀態（SN Status Transfer），再把手機還沒收到的資料透過 Xn 轉給 gNB 2 暫存，避免它們在換手時遺失。' },
    { id: 'reconfig-complete', from: 'phone', to: 'gnb2', label: '換手完成', headers: [RRC('RRCReconfigurationComplete', [{ name: '內容', value: '已接入 gNB 2 的小區' }])],
      note: '手機在 gNB 2 的小區做隨機接取，再回報換手完成。無線這一段已經換到 gNB 2，但核心網路還不知道：UPF 的下行路徑仍然指向 gNB 1，資料繞經 gNB 1 再轉給 gNB 2。',
      tables: [downlink('gNB 1', false)] },
    { id: 'path-switch', from: 'gnb2', to: 'core', label: '路徑切換請求', headers: NGAP('Path Switch Request', IP.gnb2, IP.core),
      note: 'gNB 2 透過 NG 介面請 AMF 切換路徑。AMF 通知 SMF，SMF 再要求 UPF 把這支手機的下行隧道改送到 gNB 2；UPF 在舊路徑送出最後一個「結束標記」，讓 gNB 2 知道 gNB 1 轉來的資料已經送完。' },
    { id: 'path-switch-ack', from: 'core', to: 'gnb2', label: '路徑切換確認', headers: NGAP('Path Switch Request Acknowledge', IP.core, IP.gnb2),
      note: '核心網路確認，下行路徑已經改送 gNB 2。之後 gNB 2 會通知 gNB 1 釋放這支手機的資源。',
      tables: [downlink('gNB 2', true)] },
    { id: 'download-2', from: 'gnb2', to: 'phone', label: '下載資料（經 gNB 2）', headers: segment('202801'), payload: '檔案的再下一段（1400 位元組）',
      note: '下載繼續：IP 位址、連接埠與 TCP 序號都接續原本的連線，伺服器完全不知道手機換了基地台。IP 位址由核心網路的錨點維持，所以 TCP 連線不必重建。' },
  ],
};

/** CN04 Wi-Fi and mobile network basics (network-sequence): scenes and exercises checked in the network capability tests. */
export const CN04: LessonContent = {
  lessonId: 'CN04',
  motivation: '前面的課看過網路線上的乙太網路與交換器：每台電腦一條線，交換器替它們分開轉送。換成 Wi-Fi，線不見了，同一個頻道上的所有裝置共用同一片空氣，誰說話大家都聽得到，也可能同時開口撞在一起；手機出門之後，又要在一座座行動基地台之間交接，下載卻不能中斷。本課先認識 Wi-Fi 的基地台、SSID 與 2.4／5／6 GHz 頻段和通道，逐步看手機怎麼加入一個 WPA2 網路；接著比較有線的 CSMA/CD 與無線的 CSMA/CA，用 RTS/CTS 解決隱藏終端；再看訊號強度、干擾、距離和速率調整怎麼決定實際速度；最後認識 4G／5G 的基地台、核心網路與換手。學完之後，你能解釋為什麼離基地台遠或人多時 Wi-Fi 會變慢，並提出具體的改善做法。',
  sections: [
    {
      id: 'access-point-and-association', title: '基地台、SSID 與加入網路',
      blocks: [
        { type: 'p', text: 'Wi-Fi 是使用 IEEE 802.11 標準的無線區域網路。無線基地台（AP，Access Point）一邊用無線電和手機、筆電通訊，一邊接上有線網路，在 802.11 訊框與乙太網路訊框之間轉換，所以它很像一台「其中一邊是空氣」的交換器。一台 AP 和連上它的裝置組成一個基本服務集（BSS）。' },
        { type: 'table', head: ['名詞', '是什麼', '例子'], rows: [
          ['SSID', '網路的名稱，最長 32 位元組，是給人看、給人選的', 'LogicIsland'],
          ['BSSID', '一個 BSS 的識別碼；有 AP 的網路裡，就是 AP 這個無線介面的 MAC 位址。一台 AP 同時提供好幾個 SSID 時，通常每個 SSID 各有一個 BSSID', '02:00:00:00:00:a1'],
          ['ESS（延伸服務集）', '多台 AP 用同一個 SSID 接在同一個有線網路上，裝置可以在它們之間漫遊', '一棟樓的三台 AP 都叫 LogicIsland，BSSID 各不相同'],
          ['信標（Beacon）', 'AP 定期廣播的管理訊框，宣告 SSID、支援的速率與安全設定', '常見的間隔是 100 TU，約 102.4 毫秒'],
        ] },
        { type: 'p', text: '802.11 訊框的標頭開頭是訊框控制欄位，其中的「類型」分成三種：管理訊框（信標、探測、驗證、關聯）、控制訊框（RTS、CTS、ACK）與資料訊框；「子類型」再指出是哪一種。標頭最多可以有四個位址欄位，一般有 AP 的網路用到三個：位址 1 是這一跳的接收端，位址 2 是這一跳的傳送端，位址 3 依方向是 BSSID、最終目的或原始來源。' },
        { type: 'p', text: '加入網路分成三段：先掃描（被動收聽信標，或主動送出 Probe Request），再做 802.11 的驗證與關聯，最後用 EAPOL 訊息完成四向交握，建立這次連線專用的加密金鑰。逐步看下面的情境，注意 Protected Frame 什麼時候從 0 變成 1。' },
        { type: 'example', id: 'cn04-association' },
        { type: 'callout', tone: 'note', title: 'WPA2 與 WPA3 的差別', text: 'WPA2-Personal 的雙方從密碼與 SSID 算出同一把 PMK，四向交握只交換亂數與 MIC，密碼不會在空中傳送；但有人錄下交握過程後，可以離線一個一個猜密碼來比對 MIC。WPA3-Personal 改在驗證階段做 SAE 交換，每次連線都產生新的 PMK，錄下交握也無法離線猜密碼；之後同樣用四向交握建立 PTK 與 GTK。' },
      ],
    },
    {
      id: 'bands-and-channels', title: '頻段與通道：2.4、5、6 GHz',
      blocks: [
        { type: 'p', text: '頻段是一大段頻率範圍，通道是頻段裡切出來、實際用來傳送的一小段。2.4 GHz 的通道中心頻率只相隔 5 MHz，但一個通道寬約 20 MHz（802.11b 是 22 MHz），所以相鄰的通道大幅重疊，編號大約要差 5 才不會互相重疊；最常用的互不重疊組合是 1、6、11 三個（通道 1–11 在各地都開放）。5 GHz 與 6 GHz 的通道一開始就以 20 MHz 為單位排開，還能把相鄰的通道合併成 40、80、160 MHz（Wi-Fi 7 在 6 GHz 可到 320 MHz）的寬通道。' },
        { type: 'table', head: ['頻段', '通道寬度', '優點', '缺點'], rows: [
          ['2.4 GHz', '以 20 MHz 為主（可用 40 MHz，但在 2.4 GHz 很少建議）', '傳得遠、穿牆較好，幾乎所有裝置都支援', '只有 1、6、11 三個互不重疊通道，還和藍牙、微波爐共用頻段，最擁擠'],
          ['5 GHz', '20／40／80／160 MHz', '通道多，可以合併成寬通道，速度快', '距離與穿牆比 2.4 GHz 差；部分通道要做雷達偵測（DFS），偵測到雷達就必須換通道'],
          ['6 GHz', '20／40／80／160 MHz，Wi-Fi 7 可到 320 MHz', '頻寬最多，沒有舊裝置佔用；Wi-Fi 聯盟要求這個頻段使用 WPA3', '只有 Wi-Fi 6E 以後的裝置能用，距離最短；各國開放的頻率範圍不同'],
        ] },
        { type: 'p', text: '通道越寬，一次能傳的資料越多，但同一個頻段能切出的互不重疊通道就越少，附近的 AP 越容易擠在同一個通道上；寬通道的雜訊也比較多，訊號弱的時候反而不一定比較快。所以公寓、教室這類 AP 密集的地方，常用較窄的通道換取較少的互相干擾。' },
        { type: 'callout', tone: 'tip', title: '2.4 GHz 只選 1、6、11', text: '兩台鄰近的 AP 如果在同一個通道，彼此聽得懂對方的訊框，會依 CSMA/CA 輪流使用通道，只是要分享空中時間。如果一台在通道 1、另一台在通道 3，頻率部分重疊卻解不出對方的訊框，只會把對方當成雜訊，碰撞和重送反而更多。所以 2.4 GHz 寧可和鄰居同在 1、6、11 之一，也不要選中間的通道。' },
      ],
    },
    {
      id: 'csma-cd-and-csma-ca', title: '共用空氣：CSMA/CD 與 CSMA/CA',
      blocks: [
        { type: 'p', text: '早期的乙太網路用同軸電纜或集線器，所有電腦共用一條線，規則是 CSMA/CD：傳送前先聽線路（載波偵測），閒置才傳；傳送時一邊比對線上的訊號，一旦發現和自己送的不同，就知道撞了，立刻停止、送出 jam 訊號，再隨機退避後重送。今天的乙太網路用交換器與全雙工連線，每條線只有兩端，已經不需要 CSMA/CD。' },
        { type: 'p', text: '無線網路沒辦法這樣做，有兩個原因。第一，自己天線送出的訊號，比遠處裝置傳來的訊號強上好幾個數量級，一般的 Wi-Fi 無線電又是半雙工，送的時候聽不出別人。第二，碰撞是發生在接收端：就算傳送端聽得出來，它那裡也可能根本聽不到另一個傳送者（下一節的隱藏終端）。所以 Wi-Fi 用的是 CSMA/CA，重點放在事前避免碰撞，並用確認回覆判斷有沒有成功：' },
        { type: 'list', ordered: true, items: [
          '載波偵測：聽通道有沒有人在傳（實體偵測），也看自己的 NAV 計時器有沒有歸零（虛擬偵測，下一節會用到）。',
          '通道閒置一段固定間隔（DIFS；支援 QoS 的網路依資料類別用 AIFS）後，從 0 到競爭視窗 CW 之間隨機選一個退避時槽數；通道閒置時才倒數，有人傳就暫停，閒置後接著數。',
          '數到 0 才把整個訊框送出，傳送途中不偵測碰撞。',
          '接收端收到 FCS 檢查正確的單播訊框，等一段更短的 SIFS 後回 ACK；SIFS 比 DIFS 短，所以 ACK 不會被別人搶走。',
          '等不到 ACK 就當作失敗：競爭視窗加倍（例如 15、31、63，到上限 1023 為止），重新退避再送；重試超過次數上限就丟棄，交給上層（例如 TCP）處理。',
        ] },
        { type: 'table', head: ['比較項目', 'CSMA/CD（傳統共用乙太網路）', 'CSMA/CA（Wi-Fi）'], rows: [
          ['傳送前', '聽線路，閒置就傳', '聽通道並看 NAV，閒置後還要隨機退避才傳'],
          ['傳送中', '邊傳邊比對，偵測到碰撞立刻停止並送出 jam 訊號', '不偵測碰撞，把整個訊框送完'],
          ['怎麼知道成功', '傳送期間沒偵測到碰撞，就視為送出', '收到接收端的 ACK 才算成功'],
          ['失敗之後', '二元指數退避後重送', '競爭視窗加倍、重新退避後重送'],
          ['今天的狀況', '交換器與全雙工普及後已經不需要', '每一個 Wi-Fi 網路都在用'],
        ] },
        { type: 'callout', tone: 'warning', title: '常見誤解：Wi-Fi 也能邊傳邊偵測碰撞', text: '很多人以為 CSMA/CA 只是 CSMA/CD 換個名字。其實 Wi-Fi 的傳送端在傳送途中聽不到碰撞，撞了也會把整個訊框送完，直到等不到 ACK 才知道失敗；這正是它要事先隨機退避、要用 ACK 確認的原因。另外，廣播與群播訊框沒有 ACK，失敗了也不會重送，所以它們比單播訊框更不可靠。' },
      ],
    },
    {
      id: 'hidden-terminal', title: '隱藏終端與 RTS/CTS',
      blocks: [
        { type: 'p', text: '想像 A 和 C 站在 AP 的兩側，兩人都在 AP 的範圍內，彼此卻離得太遠或隔著牆，聽不到對方。A 傳送時，C 聽通道是安靜的，也開始傳，兩個訊號在 AP 重疊，AP 一個都收不到。A 和 C 對彼此來說是「隱藏」的終端，載波偵測對這種碰撞完全無效，而且兩邊都要等 ACK 逾時才知道。' },
        { type: 'p', text: 'RTS/CTS 是預約的辦法。A 先送一個很短的 RTS（Request to Send），Duration 欄位寫上整段交換要佔用的微秒數；AP 回覆 CTS（Clear to Send），Duration 扣掉已經過去的時間。關鍵在 CTS 是 AP 送的，AP 範圍內所有裝置都聽得到，包括聽不到 A 的 C。聽到的裝置把 NAV（Network Allocation Vector）設成 Duration 的值，在 NAV 歸零前都把通道當成忙碌。即使 RTS 本身撞了，損失也只是一個很短的訊框。' },
        { type: 'example', id: 'cn04-hidden-terminal' },
        { type: 'p', text: 'RTS/CTS 多花了兩個訊框與兩段 SIFS，訊框很小時得不償失，所以裝置通常只對超過門檻長度（RTS 門檻）的訊框使用；有些實作也會在重送時改用，細節依廠商而定。同樣的 Duration 與 NAV 也用在新舊裝置混用的網路：新裝置先送一個給自己的 CTS（CTS-to-self），讓聽不懂新式訊框的舊裝置也知道要安靜多久。' },
      ],
    },
    {
      id: 'signal-and-rate', title: '訊號強度、干擾、距離與速率調整',
      blocks: [
        { type: 'p', text: '接收到的訊號強度常用 dBm 表示，數字越接近 0 越強，例如 −50 dBm 很好、−80 dBm 已經很弱。距離越遠，訊號衰減越多：在沒有遮擋的空間裡，距離加倍大約少 6 dB；牆壁、樓板、金屬和人體都會再吃掉一些，頻率越高衰減越明顯，所以 5 GHz、6 GHz 的範圍比 2.4 GHz 小。真正決定能不能正確收到的是訊號比雜訊與干擾高出多少（SNR），不只是訊號本身。' },
        { type: 'p', text: '速率調整（rate adaptation）讓裝置依連線品質選擇調變與編碼方式（MCS）。SNR 高時，每個符號可以帶更多位元（例如 1024-QAM）；SNR 低時改用較穩健、每個符號位元較少的方式（例如 BPSK、QPSK），速率可能從數百 Mbps 掉到個位數。降速換來的是較少錯誤與重送，代價是同樣大小的訊框要在空中佔用更久。' },
        { type: 'p', text: '這就是「一台慢裝置拖累大家」的原因：CSMA/CA 讓每台裝置有大致相同的機會送出訊框，而不是相同的時間。離得很遠、用最低速率的裝置，每個訊框可能佔掉幾十倍的空中時間，同一個 AP 上的其他裝置能用的時間也跟著變少。人多時則是競爭、退避與碰撞都變多，加上附近同通道 AP 一起分享空中時間，每個人分到的就更少。' },
        { type: 'table', head: ['現象', '主要原因', '改善做法'], rows: [
          ['離 AP 遠就變慢', '訊號衰減、SNR 下降，速率調整改用較低的 MCS，重送也變多', '靠近 AP；在死角加一台 AP 或使用有線回程的 Mesh；避開厚牆與金屬遮擋'],
          ['人多就變慢', '大家共用同一個通道的空中時間，競爭、退避與碰撞都增加', '把裝置分散到 5／6 GHz；增加 AP 並降低發射功率、縮小每台的涵蓋範圍；使用支援 OFDMA 的 Wi-Fi 6 以後設備'],
          ['附近 AP 很多就變慢', '鄰居 AP 在同一或重疊的通道，彼此分享空中時間或互相干擾', '2.4 GHz 只用 1、6、11；密集環境改用較窄的通道'],
          ['一台慢裝置拖累大家', '低速率的訊框佔用更久的空中時間', '讓它靠近 AP 或改用 5 GHz；關閉最低的舊式速率'],
          ['訊號很好卻還是慢', '瓶頸不在無線這一段：對外的網際網路線路、AP 的有線上行或遠端伺服器', '用有線連接的電腦對照測速，一段一段找出瓶頸'],
        ] },
        { type: 'callout', tone: 'warning', title: '常見誤解：訊號滿格就代表網路很快', text: '訊號格數只反映手機收到 AP 訊號的強度，看不到通道上有多少裝置在搶空中時間、有多少雜訊與鄰近 AP 的干擾，也看不到 AP 後面的網際網路線路有多快；手機收得到 AP，也不代表 AP 收得清楚手機較弱的上傳訊號。演講廳裡人人滿格卻打不開網頁，通常就是幾百台裝置擠在少數幾個通道上的結果。' },
      ],
    },
    {
      id: 'cellular-and-handover', title: '行動網路：基地台、核心網路與換手',
      blocks: [
        { type: 'p', text: '行動網路把服務範圍切成許多小區（cell），每個小區由基地台的天線服務：4G LTE 的基地台叫 eNB，5G NR 的叫 gNB。和 Wi-Fi 最大的不同是，行動網路使用業者取得執照的頻譜，而且由基地台的排程器決定每個時槽哪支手機用哪些頻率資源上傳或下載，手機不必像 Wi-Fi 那樣自己搶通道；只有一開始要求連線時，才用隨機接取。' },
        { type: 'p', text: '基地台後面是業者的核心網路：它用 SIM 卡裡的身分驗證使用者、記錄手機目前在哪裡、建立資料連線，並且當手機 IP 位址的錨點，把網際網路來的封包送到手機目前所在的基地台。' },
        { type: 'table', head: ['角色', '4G（LTE）', '5G（NR，獨立組網）'], rows: [
          ['基地台', 'eNB', 'gNB'],
          ['核心網路', 'EPC', '5GC'],
          ['控制面：註冊、驗證協調、行動管理', 'MME', 'AMF'],
          ['使用者面：轉送資料、維持 IP 位址的錨點', 'S-GW 與 P-GW', 'UPF（由 SMF 管理工作階段）'],
          ['基地台之間的介面', 'X2', 'Xn'],
          ['基地台到核心網路的介面', 'S1', 'NG'],
        ] },
        { type: 'p', text: '換手（handover）是手機移動時，把連線從一座基地台交給另一座。行動網路的換手由網路控制、手機協助：手機量測附近基地台的訊號並回報，來源基地台決定換手、先問目標基地台能否接手，再命令手機切換；切換期間來源基地台把還沒送出的資料轉給目標，最後核心網路把下行路徑改到新的基地台。因為 IP 位址由核心網路的錨點維持，伺服器那一端的 TCP 連線不受影響。' },
        { type: 'example', id: 'cn04-handover' },
        { type: 'callout', tone: 'note', title: 'Wi-Fi 的漫遊和行動網路的換手不一樣', text: 'Wi-Fi 在同一個 ESS 的 AP 之間漫遊，通常由裝置自己決定何時換：它發現目前的訊號太弱，就向新的 AP 送出 Reassociation Request，並可能要重新做金鑰交握（802.11r 可以縮短這一步）。行動網路則由基地台依手機的量測報告決定換手。另外，許多業者最早推出的 5G 是非獨立組網（NSA）：手機同時連著 4G 與 5G 基地台，控制由 4G 負責，核心網路仍是 4G 的 EPC。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  network: {
    scenes: [association, hiddenTerminal, handover],
    exercises: [
      { id: 'cn04-probe-response', task: 'field', scene: 'cn04-association', message: 'probe-resp', layer: 'link', field: '子類型', title: '誰回答 Probe Request',
        statement: '在「手機加入 Wi-Fi」情境裡，AP 回答手機的 Probe Request 時，送出的 802.11 管理訊框子類型是什麼？（填英文名稱）',
        hints: ['它是單播訊框，位址 1 是手機的 MAC。', '名稱和 Probe Request 成對。'],
        explanation: 'AP 用 Probe Response 單播回答主動掃描的手機，內容和信標相似（SSID、速率、安全設定）。Beacon 是 AP 不管有沒有人問都定期廣播的訊框，Probe Request 則是手機自己送出的詢問。',
        mistakes: [
          { answer: { value: 'Beacon' }, why: '把定期廣播的信標當成回答：信標不是回應任何請求，目的位址是廣播；回答 Probe Request 的是單播的 Probe Response。' },
          { answer: { value: 'Probe Request' }, why: '把請求和回應搞反：Probe Request 是手機送出的詢問，AP 的回答是 Probe Response。' },
        ] },
      { id: 'cn04-cts-duration', task: 'field', scene: 'cn04-hidden-terminal', message: 'cts', layer: 'link', field: 'Duration（微秒）', title: 'CTS 預約多久',
        statement: '在「隱藏終端」情境裡，AP 回覆的 CTS 的 Duration 欄位是多少微秒？C 聽到後會把 NAV 設成這個值。（只填數字）',
        hints: ['RTS 的 Duration 是 436，預約的是 RTS 之後的整段交換。', 'CTS 送出時，RTS 之後的一段 SIFS（16）和 CTS 本身（44）已經用掉了。'],
        explanation: 'CTS 的 Duration = RTS 的 Duration − SIFS − CTS 的時間 = 436 − 16 − 44 = 376 微秒，也就是剩下的 SIFS ＋ 資料 ＋ SIFS ＋ ACK = 16 + 300 + 16 + 44。C 依這個值設定 NAV，在 A 的資料與 AP 的 ACK 結束前保持安靜。',
        mistakes: [
          { answer: { value: '436' }, why: '直接照抄 RTS 的值：CTS 送出時已經過了一段 SIFS 和 CTS 本身，Duration 只計算之後還要佔用的時間。' },
          { answer: { value: '0' }, why: '以為 CTS 只是回覆、不預約時間：CTS 的 Duration 正是讓聽不到 A 的 C 設定 NAV 的依據；只有交換結束時的 ACK 才是 0。' },
        ] },
      { id: 'cn04-downlink-path', task: 'table', scene: 'cn04-handover', message: 'reconfig-complete', node: 'core', table: '下行路徑', row: '192.0.2.50', column: '送往的基地台', title: '換手完成時，核心網路送往哪裡',
        statement: '在「邊下載邊換手」情境裡，手機剛向 gNB 2 回報換手完成（RRCReconfigurationComplete）時，核心網路的下行路徑把這支手機（192.0.2.50）的資料送往哪一座基地台？（填 gNB 1 或 gNB 2）',
        hints: ['手機的無線連線換了，但核心網路要等誰通知它？', '看下一步的「路徑切換請求」是誰送給誰。'],
        explanation: '這時仍是 gNB 1。換手完成只是手機與 gNB 2 之間的無線連線建立好了；核心網路要等 gNB 2 送出路徑切換請求、確認之後，才把下行路徑改到 gNB 2。在這之前，送到 gNB 1 的資料由 gNB 1 經 Xn 轉給 gNB 2，所以不會遺失。',
        mistakes: [
          { answer: { cell: 'gNB 2' }, why: '以為手機一接上新基地台，核心網路就自動知道：路徑要等 gNB 2 的路徑切換請求被確認後才改，這段時間靠 gNB 1 轉送資料。' },
        ] },
      { id: 'cn04-80211-layer', task: 'layer', scene: 'cn04-association', protocol: '802.11', title: '802.11 標頭在哪一層',
        statement: '在 OSI 七層模型裡，「手機加入 Wi-Fi」情境中 802.11 標頭（類型、子類型、位址欄位）屬於哪一層？',
        hints: ['標頭裡是 MAC 位址，負責同一段無線鏈路上的下一站。'],
        explanation: '802.11 標頭屬於資料鏈結層：它和乙太網路標頭一樣，用 MAC 位址指出這一跳的傳送端與接收端，並負責同一段鏈路上的存取規則（CSMA/CA、ACK）。802.11 標準也定義了實體層（無線電的調變與編碼），但這些標頭欄位是 MAC 子層的內容。',
        mistakes: [
          { answer: { layer: 'physical' }, why: '以為「無線」就等於實體層：無線電訊號本身屬於實體層，但類型、子類型與 MAC 位址欄位是資料鏈結層的標頭。' },
          { answer: { layer: 'network' }, why: '把 BSSID 或位址欄位當成跨網路的位址：那些是 MAC 位址，只在同一段鏈路有效；跨網路找路的 IP 位址才屬於網路層。' },
        ] },
    ],
  },
  quiz: [
    {
      id: 'q-channels', prompt: '在 2.4 GHz 頻段架設三台相鄰的 AP，要讓它們的通道互不重疊，多數地區最常用的組合是哪一個？',
      options: ['1、2、3', '1、3、5', '36、40、44', '1、6、11'],
      answer: 3, explanation: '2.4 GHz 的通道中心只相隔 5 MHz，一個通道卻寬約 20 MHz（802.11b 為 22 MHz），通道編號大約要差 5 才不重疊，在通道 1–11 裡能排出的就是 1、6、11。1、2、3 與 1、3、5 的中心只差 5 或 10 MHz，彼此大幅重疊；36、40、44 是 5 GHz 頻段的通道編號，不在 2.4 GHz。',
    },
    {
      id: 'q-ssid-bssid', prompt: '一棟樓有三台 AP，都廣播 SSID「LogicIsland」並接在同一個有線網路上。下列敘述何者正確？',
      options: [
        '三台 AP 的 SSID 相同、BSSID 不同，手機從一台移到另一台是在同一個 ESS 裡漫遊',
        'SSID 是 AP 無線介面的 MAC 位址，BSSID 才是網路名稱',
        '同一個 SSID 只能由一台 AP 廣播，否則手機無法連線',
        '三台 AP 的 BSSID 必須相同，手機才能在它們之間漫遊',
      ],
      answer: 0, explanation: '多台 AP 用同一個 SSID 組成延伸服務集（ESS），每台 AP 的 BSS 各有自己的 BSSID（通常是該無線介面的 MAC 位址），手機依 BSSID 分辨要連哪一台，移動時重新關聯到另一台就是漫遊。第二個選項把 SSID 與 BSSID 的定義對調了；同一個 SSID 由多台 AP 廣播正是 ESS 的常態，不會讓手機無法連線；BSSID 相同反而無法分辨不同的 AP，漫遊也不需要它們相同。',
    },
    {
      id: 'q-why-ca', prompt: 'Wi-Fi 為什麼使用 CSMA/CA，而不像傳統共用乙太網路那樣使用 CSMA/CD？',
      options: [
        'Wi-Fi 的速率太快，傳送時間太短來不及偵測碰撞',
        '傳送端自己的訊號遠強於別人的訊號，聽不出碰撞，而且碰撞發生在接收端，傳送端可能根本聽不到另一個傳送者',
        '無線電波不會互相碰撞，所以只需要避免、不需要偵測',
        'CSMA/CD 需要交換器才能運作，無線網路沒有交換器',
      ],
      answer: 1, explanation: '無線傳送時，自己天線的訊號比遠處傳來的強上好幾個數量級，一般的 Wi-Fi 無線電又是半雙工，無法邊傳邊聽；碰撞發生在接收端，傳送端甚至可能聽不到另一個傳送者（隱藏終端），所以改成事先退避並用 ACK 確認。速率快慢不是原因；無線電波重疊時確實會讓接收端解不出訊框，碰撞是真的；CSMA/CD 是為共用線路設計的，交換器加全雙工反而讓它不再需要。',
    },
    {
      id: 'q-rts-cts', prompt: '筆電 A 和 C 都聽得到 AP，卻聽不到彼此，它們送給 AP 的訊框常常撞在一起。下列哪一種做法能減少這種碰撞？',
      options: [
        '讓 A 一邊傳送一邊偵測碰撞，發現碰撞就送出 jam 訊號',
        '把 A 和 C 連上的網路改成不同的 SSID 名稱',
        '先用 RTS/CTS：AP 回覆的 CTS 讓 C 也聽到，C 依 Duration 設定 NAV，在這段時間內不傳送',
        '縮短 A 的退避時間，讓 A 永遠比 C 先搶到通道',
      ],
      answer: 2, explanation: '這是隱藏終端問題。CTS 由 AP 送出，AP 範圍內的 C 也聽得到，C 依 Duration 設定 NAV（虛擬載波偵測），在 A 的交換結束前保持安靜。Wi-Fi 傳送時無法偵測碰撞，jam 訊號是 CSMA/CD 的做法；改 SSID 名稱不會改變兩台筆電仍共用同一台 AP 與同一個通道；A 和 C 根本聽不到彼此，縮短退避也無法讓 C 知道 A 正在傳，碰撞照樣發生。',
    },
    {
      id: 'q-ack', prompt: '在 Wi-Fi 上，筆電送出一個單播資料訊框給 AP，它怎麼知道這個訊框成功送達？',
      options: [
        'AP 在 SIFS 之後回覆 ACK；等不到 ACK 就當作失敗，加倍競爭視窗後重送',
        '傳送期間沒有偵測到碰撞，就代表成功',
        '要等伺服器的 TCP 確認回來，鏈結層本身不做確認',
        'AP 每收到一個訊框都會廣播一個 ACK，連廣播訊框也一樣',
      ],
      answer: 0, explanation: 'Wi-Fi 在鏈結層就有確認：接收端收到 FCS 正確的單播訊框，等 SIFS 後回 ACK；SIFS 比 DIFS 短，ACK 不會被搶走。等不到 ACK，傳送端加倍競爭視窗並重送。Wi-Fi 傳送中無法偵測碰撞，「沒偵測到」不能代表成功；TCP 的確認是兩端主機之間的，無線這一段若只靠它，每次遺失都要等端到端逾時，所以 802.11 另有自己的 ACK；ACK 是單播回給傳送端的，廣播與群播訊框則沒有 ACK。',
    },
    {
      id: 'q-crowd', prompt: '一場 300 人的演講，每個人的手機都顯示 Wi-Fi 訊號滿格，網頁卻幾乎打不開。下列哪一個解釋最合理？',
      options: [
        '訊號滿格代表頻寬一定足夠，問題一定出在網頁伺服器',
        '人體會擋住訊號，讓 Wi-Fi 改用 CSMA/CD 運作',
        '人一多，AP 會自動隱藏 SSID，讓手機斷線',
        '幾百台裝置擠在少數通道上輪流搶空中時間，競爭、退避與碰撞都增加，每台分到的時間很少',
      ],
      answer: 3, explanation: '訊號格數只反映收到的訊號強度，看不到通道上有多少裝置在搶空中時間。CSMA/CA 下所有裝置共用同一個通道，人越多，競爭、退避與碰撞越多，每台分到的時間越少；改善方法是增加 AP、分散到 5／6 GHz 與不同通道。第一個選項把訊號強度當成頻寬；人體確實會衰減訊號，但 Wi-Fi 不會因此改用 CSMA/CD；隱藏 SSID 是管理者的設定，不會因為人多而自動發生，也不會讓已連線的手機斷線。',
    },
    {
      id: 'q-slow-client', prompt: '辦公室裡有一台筆電離 AP 很遠，連線速率掉到很低。這對同一台 AP 上的其他裝置有什麼影響？',
      options: [
        '只有那台筆電自己變慢，其他裝置完全不受影響',
        '它的每個訊框要佔用更久的空中時間，其他裝置能用的時間跟著變少，整體都會變慢',
        'AP 會自動把那台筆電的訊框改到 6 GHz 傳送，所以不會影響別人',
        '距離遠讓傳播延遲變成主要瓶頸，其他裝置要等它的訊號傳到',
      ],
      answer: 1, explanation: '速率調整讓訊號差的裝置改用較低的 MCS，同樣大小的訊框要在空中佔用更久；CSMA/CA 給每台裝置大致相同的傳送機會而不是相同的時間，所以慢裝置會吃掉大量空中時間，拖慢所有人。共用通道下不可能只有它自己受影響；6 GHz 要裝置本身支援，而且距離比 2.4、5 GHz 更短，訊號更弱，不會因此解決；幾十公尺的傳播延遲只有大約 0.1 微秒，遠小於訊框的傳輸時間，不是瓶頸。',
    },
    {
      id: 'q-handover', prompt: '你一邊坐車一邊用 5G 下載大檔案，手機從一座基地台換手到另一座。下列敘述何者正確？',
      options: [
        '換手時手機一定會拿到新的 IP 位址，所以下載必須重新開始',
        '換手完全由手機自己決定，基地台與核心網路都不參與',
        'IP 位址由核心網路的錨點（5G 的 UPF）維持不變，來源基地台把還沒送出的資料轉給目標基地台，TCP 連線可以繼續',
        '換手時還在路上的下行資料都會被丟棄，只能靠 TCP 逾時重送補回',
      ],
      answer: 2, explanation: '手機的 IP 位址錨定在核心網路（5G 的 UPF、4G 的 P-GW），換手只改變基地台，伺服器看到的 IP 與連接埠不變，TCP 連線繼續；換手期間來源基地台透過 Xn（4G 是 X2）把尚未送出的資料轉給目標基地台。所以 IP 不會因換手而改變，下載也不必重來；行動網路的換手由網路控制，手機只負責量測與回報，決定的是來源基地台；資料轉送正是為了避免換手時丟棄下行資料，而不是放著讓 TCP 重送。',
    },
  ],
};
