# 網路與伺服器島（Network & Servers Island）

> 2026-11-22 起分批撰寫（自主課程生產，見 [AUTONOMOUS_CURRICULUM_PROGRESS](../planning/AUTONOMOUS_CURRICULUM_PROGRESS.md)）。大綱（標題、目標、概念、先修）取自藍圖，由 `lessons.ts` 的 `serverFromBlueprint` 讀入。

教學方式沿用 Linux 系統島的 `terminal` 能力，並依藍圖活動搭配 `network-protocol` 情境（[SRV0_SERVER_CAPABILITY](SRV0_SERVER_CAPABILITY.md)）：範例是模擬機器上重新執行後輸出完全一致的終端機紀錄；藍圖為 request-path、architecture-diagram 或 protocol-sequence 的課，另有一段把請求路徑一步一步畫出來的網路情境與練習。SRV-1 使用引擎階段 E10–E12 的 `sockets`、`dns` 與 `http`，SRV-2 使用 E13–E14 的 `tls` 與 `nginx`（憑證與 certbot、nginx 設定與套用），SRV-3 使用 E15–E17 的 `proxy`、`firewall` 與 `tunnels`（反向代理與負載平衡、ufw 與 nftables、SSH 通道與跳板機），SRV-4 使用 E18–E19 的 `edge` 與 `diagnostics`（HTTP 快取與 CDN、網路診斷工具與故障排除）。

## 已撰寫的課

| ID | 課程 | 難度 | 時間 | 先修 | 機器與情境 | 內容 | 狀態 |
|---|---|---|---|---|---|---|---|
| SRV01 | 伺服器端的網路基礎：IP、Port 與 Socket<br>`server-networking-essentials` | 入門 | 50 分 | LNX02 | 3 台（sockets，含遠端主機） | 6 段、4 段終端機紀錄（位址與路由、服務埠、誰在監聽、可達性）、4 個練習（找出佔用埠的程式、讓服務能從另一台主機連線、私有位址、分辨 refused 與 timed out）、8 題 | **完整 v1.0.0** |
| SRV02 | 網域與 DNS 記錄管理<br>`dns-records-and-domains` | 中級 | 55 分 | SRV01 | 3 台（dns）＋ 1 個網路情境（查詢路徑與快取） | 6 段、5 段終端機紀錄、3 個終端機練習（新增 A 與 CNAME 記錄、修正被拒絕的區域、快取剩下的 TTL）與 2 個網路練習、8 題 | **完整 v1.0.0** |
| SRV03 | 用 curl 觀察 HTTP 請求與回應<br>`observing-http-with-curl` | 中級 | 55 分 | SRV01 | 1 台（http，四台遠端主機）＋ 2 個網路情境（一次 HTTP 往返與重用連線、502） | 6 段、5 段終端機紀錄、4 個終端機練習（狀態碼、重新導向鏈、以 Host 標頭呼叫 API、--resolve 測試新主機）與 3 個網路練習、8 題 | **完整 v1.0.0** |
| SRV04 | TLS 憑證實務：申請、安裝與更新<br>`tls-certificates-in-practice` | 中級 | 60 分 | SRV02、SRV03 | 5 台（nginx）＋ 2 個網路情境（TLS 交握與 SNI、只送葉憑證） | 6 段、5 段終端機紀錄、4 個終端機練習（以 certbot webroot 取得並安裝憑證、改用 fullchain.pem、找出即將到期的憑證、自動更新與 reload）與 2 個網路練習、8 題 | **完整 v1.0.0** |
| SRV05 | 網頁伺服器架構<br>`web-server-architecture` | 中級 | 50 分 | SRV03 | 1 台（nginx＋gunicorn＋PostgreSQL）＋ 2 個網路情境（靜態與動態請求、504） | 5 段、4 段終端機紀錄、3 個終端機練習（只綁迴路位址的服務、連線上限、靜態檔案由誰提供）與 3 個網路練習、8 題 | **完整 v1.0.0** |
| SRV06 | Nginx 設定入門<br>`nginx-basics` | 中級 | 60 分 | SRV05、LNX10 | 2 台（nginx）＋ 1 個網路情境（listen → server → location → 檔案與日誌） | 6 段、5 段終端機紀錄、4 個終端機練習（發布靜態網站、修正 location 順序、從 error log 修好 403、從 access log 列出 404）與 2 個網路練習、8 題 | **完整 v1.0.0** |
| SRV07 | 反向代理<br>`reverse-proxy` | 中級 | 60 分 | SRV06 | 2 台（proxy：nginx 後面的商店、WebSocket 與報表服務）＋ 1 個網路情境（TLS 在 nginx 結束、第二段加上轉送標頭） | 6 段、5 段終端機紀錄、4 個終端機練習（把 API 放到 /api/、轉送標頭、WebSocket 升級、分辨 502 與 504）與 2 個網路練習、8 題 | **完整 v1.0.0** |
| SRV08 | 負載平衡<br>`load-balancing` | 中級 | 55 分 | SRV07 | 4 台（proxy：nginx 與三台後端）＋ 1 個網路情境（輪詢、連線被拒後改送下一台、max_fails 後暫停使用） | 6 段、5 段終端機紀錄、4 個終端機練習（加權輪詢的順序、least_conn、以 down 與 reload 排空後端、backup）與 2 個網路練習、8 題 | **完整 v1.0.0** |
| SRV09 | 伺服器防火牆：ufw 與 nftables<br>`linux-firewalls` | 中級 | 55 分 | SRV01、LNX07 | 4 台（firewall：管理工作站、網站伺服器與外部測試機） | 6 段、5 段終端機紀錄、4 個終端機練習（只開放必要服務、從逾時與拒絕找出原因、依編號刪除規則、修正手寫的 nftables 規則集）、8 題 | **完整 v1.0.0** |
| SRV10 | SSH 通道與跳板機<br>`ssh-tunnels-and-bastions` | 進階 | 55 分 | LNX12、SRV09 | 3 台（tunnels：筆電、跳板機與兩台內網主機）＋ 2 個網路情境 | 6 段、5 段終端機紀錄、3 個終端機練習（經由跳板機登入並寫進 ~/.ssh/config、把內網管理頁面轉到筆電、找出並關掉背景通道）與 3 個網路練習、8 題 | **完整 v1.0.0** |
| SRV11 | CDN 與快取設定<br>`cdn-and-edge-caching` | 中級 | 55 分 | SRV07 | 2 台（edge：來源伺服器、CDN 邊緣節點與清除 API）＋ 1 個網路情境（MISS 回源、HIT 帶 Age） | 6 段、5 段終端機紀錄、4 個終端機練習（依資源設定 Cache-Control、找出 Set-Cookie 造成的 MISS、以版本化檔名發布而不清除、用 sleep 算出命中率）與 2 個網路練習、8 題 | **完整 v1.0.0** |
| SRV12 | 網路診斷工具<br>`network-diagnostics` | 中級 | 55 分 | SRV02、SRV03 | 5 台（diagnostics：工作站與 DNS、應用、資料庫等主機，含有中途不回應與一路遺失的網路路徑） | 6 段、5 段終端機紀錄、4 個終端機練習（/etc/hosts 的舊記錄、只綁 127.0.0.1 的 nginx、讀擷取檔分辨丟棄與拒絕、用 curl -w 找出慢在哪裡）、8 題 | **完整 v1.0.0** |
| SRV13 | 伺服器故障排除方法<br>`server-troubleshooting` | 進階 | 60 分 | SRV07、SRV12、LNX11 | 5 台（diagnostics：同一台網站伺服器的五種事故，含庫存 API 與辦公室主機） | 5 段、5 段終端機紀錄、4 個終端機練習（從 journal 寫出事故時間線、部署後的 502 回滾、防火牆造成的 504、OOM 之後停下吃記憶體的工作）、8 題 | **完整 v1.0.0** |
| SRV14 | 網路與伺服器島綜合專題：架設 HTTPS 網站並追蹤請求<br>`network-servers-capstone` | 進階 | 90 分 | SRV04、SRV08、SRV10、SRV11、SRV13 | 6 台（diagnostics；同一個網站在六個時刻的快照，含 DNS、跳板機、兩台應用伺服器與 CDN） | 7 段（以請求路徑表串起各課）、5 個範例、六個關卡（challenge-stages）各一個練習：修好網域並以 certbot --nginx 取得憑證、反向代理與負載平衡、防火牆與 ssh -J、Cache-Control 與 CDN 的 HIT、追蹤一個請求、找出只壞了一台後端的防火牆規則；8 題 | **完整 v1.0.0** |

## 單元

| 單元 | 課程 |
|---|---|
| 位址、名稱與請求 | SRV01–SRV03 |
| 憑證與網頁伺服器 | SRV04–SRV06 |
| 代理、防火牆與通道 | SRV07–SRV10 |
| 快取、診斷與故障排除 | SRV11–SRV13 |
| 綜合專題 | SRV14 |

## 模擬器的已知差異（課文已說明或避開，列為之後引擎階段的修正）

- 一般程式的監聽位址由執行檔決定，重啟不會重讀設定檔（nginx 從 E14 起改由設定決定）；SRV01 的重新綁定練習因此以設定檔加上啟動服務完成。
- 路由只依路徑與 Host 決定，不看其他標頭；`proxy_pass` 與 `upstream` 從 E15 起模擬。
- E15–E17 的已知差異（課程都避開或在題目中說明）：一行指令上限 500 字元，所以 SRV07 的站台設定以 `include` 拆成每個服務一個檔案；變體無法改變學員機器的位址，SRV07 的轉送標頭練習改以 `/etc/hosts` 讓 nginx 看到不同的來源；沒有路由模型，外部主機技術上連得到私有位址，SRV09 的指令與檢查一律寫公開位址；SRV09 的 nftables 練習只檢查載入中的規則集，不檢查 `/etc/nftables.conf`；sshd 的 `PermitOpen`、`DisableForwarding`、`ExitOnForwardFailure` 與 `Match` 到 SRV-4 的 E19 才模擬，SRV10 只以文字說明。
- E18–E19 的已知差異（課程都避開或在課文中說明）：CDN 邊緣節點不儲存 `no-cache` 的回應，SRV11 的 HTML 在邊緣一律是 MISS；解析器的查詢時間固定，無法模擬變慢的 DNS 伺服器，SRV12 只以文字說明 glibc 的 5 秒逾時；擷取檔是文字模型，不印 TCP 選項；延遲是由宣告的數字算出的模型。
- E13 的已知問題（`certbot --nginx` 帶多個網域、certbot.timer 觸發的 deploy hook、`renew --deploy-hook`）與 grep -o／-A、tr -c、pgrep -c、ps -C 已在 SRV-3 修正（SRV0 §20）。
- 不支援 IPv6 監聽、No route to host、DNS 委派與 PTR；未指定伺服器的 dns 檢查會讀本機解析器的快取，練習題目會提醒先清除快取。
- SRV01 的兩個練習用到 ssh 與 sudo systemctl（LNX10、LNX12 的內容），題目寫出了完整指令。

## 後續批次

SRV-2 發布 SRV04–SRV06（E13、E14，並修正 curl 的 -H、-o 與 204）。SRV-3 發布 SRV07–SRV10（E15 反向代理與負載平衡、E16 防火牆、E17 SSH 通道）。SRV-4 發布 SRV11–SRV13（E18 HTTP 快取與 CDN、E19 診斷工具，並修正 tcpdump 篩選條件的優先順序與 curl 在解析器快取命中時的查詢時間）。SRV-5 發布 SRV14 綜合專題：網路與伺服器島 14/14 完成，同批修正 certbot 的 HTTP-01 驗證不再讀本機的 /etc/hosts、經由 CDN 連到課程本機的 nginx 時能代理到後端，以及經由邊緣節點時後端等待時間不再重複計算。

課程狀態與 3D 地景分離：網路與伺服器島的 `mapState` 仍是 `'planned'`。
