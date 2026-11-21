# 計算機網路島（Computer Networks Island）

> 2026-11-22 起分批撰寫（自主課程生產，見 [AUTONOMOUS_CURRICULUM_PROGRESS](../planning/AUTONOMOUS_CURRICULUM_PROGRESS.md)）。大綱（標題、目標、概念、先修）取自藍圖 `docs/planning/data/curriculum-blueprint.json`，由 `lessons.ts` 的 `networkFromBlueprint` 讀入。

教學方式是 `network-protocol` 能力（[CN0_NETWORK_CAPABILITY](CN0_NETWORK_CAPABILITY.md)）；結果是一支程式的課（CN11 socket、CN14 REST 客戶端、CN16 WebSocket、CN20 綜合挑戰的 API 服務）則用 `program-code`，C++、Java、Python、JavaScript 四語的範例與練習都由 `tests/curriculum-code.test.ts` 實際執行（socket 範例只用本機迴路，練習讀固定的輸入，不連到外部網路）：
- 固定的網路情境，逐步看訊息的順序、由外到內的各層標頭與節點的表格；
- 練習答案從情境讀出（標頭欄位、協定所在的層、節點表格的一格），或由程式計算（子網路、延遲），再和學習者的答案比對；
- 不連線到任何真實網路，位址都用 RFC 5737 與 RFC 1918 的範例範圍。

## 已撰寫的課

| ID | 課程 | 難度 | 時間 | 先修 | 活動 | 內容 | 狀態 |
|---|---|---|---|---|---|---|---|
| CN01 | 網路分層模型<br>`network-layer-models` | 入門 | 45 分 | F01 | packet-journey | 6 段、3 個情境（HTTP 經過交換器與路由器、OSI 七層的 HTTPS、DNS 走 UDP）、4 個練習、8 題 | **完整 v1.0.0** |
| CN02 | 實體層與網路效能：頻寬、延遲與吞吐量<br>`physical-layer-and-network-performance` | 入門 | 50 分 | CN01 | packet-journey | 6 段、3 個情境（訊框大小、長途光纖、瓶頸鏈路）、4 個練習（3 個延遲計算）、8 題 | **完整 v1.0.0** |
| CN03 | 資料鏈結層、Ethernet 與交換器<br>`data-link-layer-and-ethernet` | 入門 | 50 分 | CN01 | packet-journey（藍圖 routing-table 未建置，以節點表格呈現） | 6 段、4 個情境（交換器學習、過濾與老化、VLAN trunk、FCS 檢查）、4 個練習、8 題 | **完整 v1.0.0** |
| CN04 | Wi-Fi 與行動網路基礎<br>`wireless-and-mobile-networks` | 入門 | 50 分 | CN03 | network-sequence | 6 段、3 個情境（關聯與 WPA2 四向交握、隱藏終端與 RTS/CTS、5G 換手）、4 個練習、8 題 | **完整 v1.0.0** |
| CN05 | IP 位址與子網路<br>`ip-addressing-and-subnets` | 中級 | 55 分 | CN01 | packet-journey（藍圖 subnet-calculator 未建置，以子網路練習呈現） | 6 段、3 個情境（同網段與預設閘道、子網路切割、IPv6 封包）、5 個練習（3 個子網路計算）、8 題 | **完整 v1.0.0** |
| CN06 | ARP、DHCP 與 NAT<br>`arp-dhcp-and-nat` | 中級 | 55 分 | CN05、CN03 | network-sequence | 6 段、3 個情境（DHCP DORA 與續約、ARP 問閘道、NAT 連接埠轉譯）、5 個練習、8 題 | **完整 v1.0.0** |
| CN07 | 路由與轉送<br>`routing-and-forwarding` | 中級 | 55 分 | CN05 | packet-journey（藍圖 routing-table 未建置，以節點路由表呈現） | 6 段、4 個情境（三台路由器、最長前綴匹配、靜態路由迴圈與 ICMP Time Exceeded、修正後）、5 個練習、8 題 | **完整 v1.0.0** |
| CN08 | 路由協定：距離向量與鏈路狀態<br>`routing-protocols` | 進階 | 60 分 | CN07、A16 | packet-journey（藍圖 graph-traversal 是程式視覺化，以各路由器的路由表呈現） | 6 段、5 個情境（距離向量收斂、LSA 泛洪與 Dijkstra、計數到無限、毒性逆轉、BGP 政策選路）、5 個練習、8 題 | **完整 v1.0.0** |
| CN09 | TCP 與 UDP<br>`tcp-and-udp` | 中級 | 55 分 | CN05 | network-sequence | 6 段、4 個情境（完整 TCP 連線、DNS 走 UDP 與 TCP、RST 與被丟棄的 SYN、伺服器連線表）、5 個練習、8 題 | **完整 v1.0.0** |
| CN10 | TCP 可靠傳輸、流量控制與壅塞控制<br>`tcp-flow-and-congestion-control` | 進階 | 60 分 | CN09 | network-sequence | 6 段、4 個情境（逾時重送、三個重複 ACK、零視窗、Reno 壅塞視窗逐輪）、5 個練習、8 題 | **完整 v1.0.0** |
| CN11 | Socket 網路程式設計<br>`socket-programming` | 中級 | 60 分 | CN09 | 堆疊與佇列（接收緩衝區切訊息）；`program-code` 四語 | 6 段、5 個四語範例（本機迴路 TCP 回聲、訊息框架、UTF-8 位元組、並行回聲伺服器、UDP 序號）、練習「長度前綴訊息解碼」（21 組測資）、8 題 | **完整 v1.0.0** |
| CN12 | DNS 與 HTTP<br>`dns-and-http` | 中級 | 55 分 | CN09 | packet-journey | 6 段、3 個情境（遞迴解析與快取、頁面載入與重新導向、登入與 Cookie）、5 個練習、8 題 | **完整 v1.0.0** |
| CN13 | HTTPS 與 TLS<br>`https-and-tls` | 進階 | 60 分 | CN12 | network-sequence | 6 段、3 個情境（TLS 1.3 交握與金鑰、憑證信任鏈與過期、HSTS）、5 個練習、8 題 | **完整 v1.0.0** |
| CN14 | REST API 與 JSON<br>`rest-apis-and-json` | 中級 | 60 分 | CN12 | 變數狀態追蹤；`program-code` 四語 | 6 段、5 個四語範例（組出請求、解析 JSON、大整數 id、解析回應、冪等重送）、練習「解析待辦事項 API 的回應」（22 組測資）、8 題 | **完整 v1.0.0** |
| CN15 | 快取、CDN 與 HTTP/2、HTTP/3<br>`web-caching-cdn-and-modern-http` | 中級 | 55 分 | CN12 | packet-journey（藍圖 architecture-diagram 屬資料庫能力，以網路情境呈現） | 6 段、4 個情境（瀏覽器快取與 304、CDN 命中與回源、HTTP/2 隊頭阻塞、QUIC 逐串流復原）、5 個練習、8 題 | **完整 v1.0.0** |
| CN16 | WebSocket 與即時通訊<br>`websockets-and-real-time-communication` | 中級 | 60 分 | CN11、CN12 | 變數狀態追蹤；`program-code` 四語 | 6 段、5 個四語範例（輪詢成本、Sec-WebSocket-Accept、訊框編解碼、聊天室廣播、心跳與退避重連）、練習「解碼客戶端送來的 WebSocket 訊框」（26 組測資）、8 題 | **完整 v1.0.0** |
| CN17 | 網路除錯工具<br>`network-troubleshooting-tools` | 中級 | 55 分 | CN07、CN12 | packet-journey | 6 段、5 個情境（ping、traceroute、dig、連線被拒與逾時、502）、5 個練習、8 題 | **完整 v1.0.0** |
| CN18 | 網路安全基礎<br>`network-security-basics` | 中級 | 55 分 | CN13 | packet-journey | 6 段、3 個情境（ARP 偽冒與 TLS 擋下偽造憑證、SYN flood 與 SYN cookies、仿冒網域釣魚與通行金鑰）、5 個練習、8 題 | **完整 v1.0.0** |
| CN19 | 防火牆、VPN 與零信任<br>`firewalls-vpns-and-zero-trust` | 進階 | 60 分 | CN18、CN07 | packet-journey（藍圖 routing-table 未建置；防火牆練習由學習者寫規則，以封包逐一判斷） | 6 段、4 個情境（狀態檢查、DMZ、站對站 VPN、零信任存取代理）、4 個練習（2 個寫防火牆規則）、8 題 | **完整 v1.0.0** |
| CN20 | 計算機網路島綜合挑戰：追蹤並打造一個網路服務<br>`networks-capstone` | 進階 | 120 分 | CN14、CN17、CN18 | 綜合挑戰分段；`program-code` 四語 | 8 段、6 個關卡、5 個四語範例（解析請求、路由與 JSON、ETag 與 304、Bearer 驗證、防火牆規則）、練習「待辦事項 API 服務」（23 組測資）、8 題 | **完整 v1.0.0** |

## 單元

| 單元 | 課程 |
|---|---|
| 分層模型與實體層 | CN01–CN02 |
| 區域網路與 IP 定址 | CN03–CN05 |
| 位址轉換與路由 | CN06–CN08 |
| 傳輸層 | CN09–CN10 |
| 網路程式與應用層 | CN11–CN12 |
| Web 安全、API 與效能 | CN13–CN15 |
| 即時通訊與除錯 | CN16–CN17 |
| 網路安全與防護 | CN18–CN19 |
| 綜合挑戰 | CN20 |

## 後續批次

全島 20 堂在 CN-5（CN20 綜合挑戰）後都已發布，理由見 [CN0_NETWORK_CAPABILITY](CN0_NETWORK_CAPABILITY.md) §2。

課程狀態與 3D 地景分離：計算機網路島的 `mapState` 仍是 `'planned'`，地景要另行授權的建模階段才會改變。
