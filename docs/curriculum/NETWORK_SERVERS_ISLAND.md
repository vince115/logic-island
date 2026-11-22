# 網路與伺服器島（Network & Servers Island）

> 2026-11-22 起分批撰寫（自主課程生產，見 [AUTONOMOUS_CURRICULUM_PROGRESS](../planning/AUTONOMOUS_CURRICULUM_PROGRESS.md)）。大綱（標題、目標、概念、先修）取自藍圖，由 `lessons.ts` 的 `serverFromBlueprint` 讀入。

教學方式沿用 Linux 系統島的 `terminal` 能力，並依藍圖活動搭配 `network-protocol` 情境（[SRV0_SERVER_CAPABILITY](SRV0_SERVER_CAPABILITY.md)）：範例是模擬機器上重新執行後輸出完全一致的終端機紀錄；藍圖為 request-path、architecture-diagram 或 protocol-sequence 的課，另有一段把請求路徑一步一步畫出來的網路情境與練習。SRV-1 使用引擎階段 E10–E12 的 `sockets`、`dns` 與 `http`。

## 已撰寫的課

| ID | 課程 | 難度 | 時間 | 先修 | 機器與情境 | 內容 | 狀態 |
|---|---|---|---|---|---|---|---|
| SRV01 | 伺服器端的網路基礎：IP、Port 與 Socket<br>`server-networking-essentials` | 入門 | 50 分 | LNX02 | 3 台（sockets，含遠端主機） | 6 段、4 段終端機紀錄（位址與路由、服務埠、誰在監聽、可達性）、4 個練習（找出佔用埠的程式、讓服務能從另一台主機連線、私有位址、分辨 refused 與 timed out）、8 題 | **完整 v1.0.0** |
| SRV02 | 網域與 DNS 記錄管理<br>`dns-records-and-domains` | 中級 | 55 分 | SRV01 | 3 台（dns）＋ 1 個網路情境（查詢路徑與快取） | 6 段、5 段終端機紀錄、3 個終端機練習（新增 A 與 CNAME 記錄、修正被拒絕的區域、快取剩下的 TTL）與 2 個網路練習、8 題 | **完整 v1.0.0** |
| SRV03 | 用 curl 觀察 HTTP 請求與回應<br>`observing-http-with-curl` | 中級 | 55 分 | SRV01 | 1 台（http，四台遠端主機）＋ 2 個網路情境（一次 HTTP 往返與重用連線、502） | 6 段、5 段終端機紀錄、4 個終端機練習（狀態碼、重新導向鏈、以 Host 標頭呼叫 API、--resolve 測試新主機）與 3 個網路練習、8 題 | **完整 v1.0.0** |

## 單元

| 單元 | 課程 |
|---|---|
| 位址、名稱與請求 | SRV01–SRV03 |

## 模擬器的已知差異（課文已說明或避開，列為之後引擎階段的修正）

- 程式的監聽位址由執行檔決定，重啟不會重讀設定檔（E14 nginx 會改由設定決定）；SRV01 的重新綁定練習因此以設定檔加上啟動服務完成。
- `curl -H` 指定 Accept 或 User-Agent 時會重複送出、多個網址共用一個 `-o`、204 回應帶有 `Content-Length: 0`；路由只依路徑與 Host 決定，不看其他標頭。
- 不支援 IPv6 監聽、No route to host、DNS 委派與 PTR；未指定伺服器的 dns 檢查會讀本機解析器的快取，練習題目會提醒先清除快取。
- SRV01 的兩個練習用到 ssh 與 sudo systemctl（LNX10、LNX12 的內容），題目寫出了完整指令。

## 後續批次

其餘 11 堂依編號連續發布：SRV-2（SRV04–06，E13 TLS、E14 nginx）、SRV-3（SRV07–10，E15 反向代理與負載平衡、E16 防火牆、E17 SSH 通道）、SRV-4（SRV11–13，E18 CDN、E19 診斷工具）、SRV-5（SRV14 綜合專題）。

課程狀態與 3D 地景分離：網路與伺服器島的 `mapState` 仍是 `'planned'`。
