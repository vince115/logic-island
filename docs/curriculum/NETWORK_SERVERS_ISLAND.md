# 網路與伺服器島（Network & Servers Island）

> 2026-11-22 起分批撰寫（自主課程生產，見 [AUTONOMOUS_CURRICULUM_PROGRESS](../planning/AUTONOMOUS_CURRICULUM_PROGRESS.md)）。大綱（標題、目標、概念、先修）取自藍圖，由 `lessons.ts` 的 `serverFromBlueprint` 讀入。

教學方式沿用 Linux 系統島的 `terminal` 能力，並依藍圖活動搭配 `network-protocol` 情境（[SRV0_SERVER_CAPABILITY](SRV0_SERVER_CAPABILITY.md)）：範例是模擬機器上重新執行後輸出完全一致的終端機紀錄；藍圖為 request-path、architecture-diagram 或 protocol-sequence 的課，另有一段把請求路徑一步一步畫出來的網路情境與練習。SRV-1 使用引擎階段 E10–E12 的 `sockets`、`dns` 與 `http`，SRV-2 使用 E13–E14 的 `tls` 與 `nginx`（憑證與 certbot、nginx 設定與套用）。

## 已撰寫的課

| ID | 課程 | 難度 | 時間 | 先修 | 機器與情境 | 內容 | 狀態 |
|---|---|---|---|---|---|---|---|
| SRV01 | 伺服器端的網路基礎：IP、Port 與 Socket<br>`server-networking-essentials` | 入門 | 50 分 | LNX02 | 3 台（sockets，含遠端主機） | 6 段、4 段終端機紀錄（位址與路由、服務埠、誰在監聽、可達性）、4 個練習（找出佔用埠的程式、讓服務能從另一台主機連線、私有位址、分辨 refused 與 timed out）、8 題 | **完整 v1.0.0** |
| SRV02 | 網域與 DNS 記錄管理<br>`dns-records-and-domains` | 中級 | 55 分 | SRV01 | 3 台（dns）＋ 1 個網路情境（查詢路徑與快取） | 6 段、5 段終端機紀錄、3 個終端機練習（新增 A 與 CNAME 記錄、修正被拒絕的區域、快取剩下的 TTL）與 2 個網路練習、8 題 | **完整 v1.0.0** |
| SRV03 | 用 curl 觀察 HTTP 請求與回應<br>`observing-http-with-curl` | 中級 | 55 分 | SRV01 | 1 台（http，四台遠端主機）＋ 2 個網路情境（一次 HTTP 往返與重用連線、502） | 6 段、5 段終端機紀錄、4 個終端機練習（狀態碼、重新導向鏈、以 Host 標頭呼叫 API、--resolve 測試新主機）與 3 個網路練習、8 題 | **完整 v1.0.0** |
| SRV04 | TLS 憑證實務：申請、安裝與更新<br>`tls-certificates-in-practice` | 中級 | 60 分 | SRV02、SRV03 | 5 台（nginx）＋ 2 個網路情境（TLS 交握與 SNI、只送葉憑證） | 6 段、5 段終端機紀錄、4 個終端機練習（以 certbot webroot 取得並安裝憑證、改用 fullchain.pem、找出即將到期的憑證、自動更新與 reload）與 2 個網路練習、8 題 | **完整 v1.0.0** |
| SRV05 | 網頁伺服器架構<br>`web-server-architecture` | 中級 | 50 分 | SRV03 | 1 台（nginx＋gunicorn＋PostgreSQL）＋ 2 個網路情境（靜態與動態請求、504） | 5 段、4 段終端機紀錄、3 個終端機練習（只綁迴路位址的服務、連線上限、靜態檔案由誰提供）與 3 個網路練習、8 題 | **完整 v1.0.0** |
| SRV06 | Nginx 設定入門<br>`nginx-basics` | 中級 | 60 分 | SRV05、LNX10 | 2 台（nginx）＋ 1 個網路情境（listen → server → location → 檔案與日誌） | 6 段、5 段終端機紀錄、4 個終端機練習（發布靜態網站、修正 location 順序、從 error log 修好 403、從 access log 列出 404）與 2 個網路練習、8 題 | **完整 v1.0.0** |

## 單元

| 單元 | 課程 |
|---|---|
| 位址、名稱與請求 | SRV01–SRV03 |
| 憑證與網頁伺服器 | SRV04–SRV06 |

## 模擬器的已知差異（課文已說明或避開，列為之後引擎階段的修正）

- 一般程式的監聽位址由執行檔決定，重啟不會重讀設定檔（nginx 從 E14 起改由設定決定）；SRV01 的重新綁定練習因此以設定檔加上啟動服務完成。
- 路由只依路徑與 Host 決定，不看其他標頭；`proxy_pass` 與 `upstream` 要到 E15 才模擬。
- E13 的已知問題（課程都避開，列為之後修正）：`certbot --nginx` 帶兩個網域會重複寫入、由 certbot.timer 續期時 deploy hook 沒有生效、`renew --deploy-hook` 參數沒有被執行或儲存；部分指令選項（grep -o／-A、tr -c、pgrep -c、ps -C）尚未支援。
- 不支援 IPv6 監聽、No route to host、DNS 委派與 PTR；未指定伺服器的 dns 檢查會讀本機解析器的快取，練習題目會提醒先清除快取。
- SRV01 的兩個練習用到 ssh 與 sudo systemctl（LNX10、LNX12 的內容），題目寫出了完整指令。

## 後續批次

SRV-2 發布 SRV04–SRV06（E13、E14，並修正 curl 的 -H、-o 與 204）。其餘 8 堂依編號連續發布：SRV-3（SRV07–10，E15 反向代理與負載平衡、E16 防火牆、E17 SSH 通道）、SRV-4（SRV11–13，E18 CDN、E19 診斷工具）、SRV-5（SRV14 綜合專題）。

課程狀態與 3D 地景分離：網路與伺服器島的 `mapState` 仍是 `'planned'`。
