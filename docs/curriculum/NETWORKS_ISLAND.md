# 計算機網路島（Computer Networks Island）

> 2026-11-22 起分批撰寫（自主課程生產，見 [AUTONOMOUS_CURRICULUM_PROGRESS](../planning/AUTONOMOUS_CURRICULUM_PROGRESS.md)）。大綱（標題、目標、概念、先修）取自藍圖 `docs/planning/data/curriculum-blueprint.json`，由 `lessons.ts` 的 `networkFromBlueprint` 讀入。

教學方式是 `network-protocol` 能力（[CN0_NETWORK_CAPABILITY](CN0_NETWORK_CAPABILITY.md)）：
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

## 單元

| 單元 | 課程 |
|---|---|
| 分層模型與實體層 | CN01–CN02 |
| 區域網路與 IP 定址 | CN03–CN05 |
| 位址轉換與路由 | CN06–CN08 |
| 傳輸層 | CN09–CN10 |

## 後續批次

其餘 10 堂依編號連續發布（CN11–CN15、CN16–CN19、CN20），理由見 [CN0_NETWORK_CAPABILITY](CN0_NETWORK_CAPABILITY.md) §2。

課程狀態與 3D 地景分離：計算機網路島的 `mapState` 仍是 `'planned'`，地景要另行授權的建模階段才會改變。
