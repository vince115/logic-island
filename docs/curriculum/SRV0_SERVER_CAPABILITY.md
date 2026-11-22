# SRV-0：網路與伺服器島的課程能力與引擎階段 E10–E19

> 2026-11-22。目標：讓網路與伺服器島（`network-servers`，前綴 SRV，14 堂）可以撰寫、驗證、發布。本島**不需要新的課程能力或活動**：沿用 LNX-0 的 `terminal` 能力（[LNX0_TERMINAL_CAPABILITY](LNX0_TERMINAL_CAPABILITY.md)）與 CN-0 的 `network-protocol` 情境。本文件也是終端機引擎階段 **E10–E19**（`sockets`、`dns`、`http`、`tls`、`nginx`、`proxy`、`firewall`、`tunnels`、`edge`、`diagnostics`）的唯一說明處；E1–E9 仍在 LNX0 文件（§9–§17），LNX0 的 §18 只指向這裡。之後的進度與下一批由 [AUTONOMOUS_CURRICULUM_PROGRESS](../planning/AUTONOMOUS_CURRICULUM_PROGRESS.md) 計算。

## 1. 範圍

| 部分 | 內容 |
|---|---|
| SRV-0（登錄） | `PREPARED_ISLAND_IDS = ['network-servers']`、前綴 `SRV`、`UNITS['network-servers'] = []`、`serverFromBlueprint`；沒有課程、頁面、旗標、3D 或 `mapState` 的改動 |
| E10 `sockets` | 介面與位址、由行程推導的監聽 socket、連線；`ss`、`lsof -i`、`nc -z`、`ip`、`getent` |
| E11 `dns` | 區域檔、BIND（`named`）、`named-checkzone`、`rndc reload`、有快取的本機解析器；`dig`、`host`、`resolvectl flush-caches`；E10 以上的指令從這一階起經由 `/etc/hosts` 與 DNS 找名稱 |
| E12 `http` | HTTP 回應者（路由、狀態碼、標頭、重新導向、keep-alive）；`curl` |
| E13 `tls` | 憑證（模擬的 PEM 檔，不是 DER）、信任庫、OpenSSL 的憑證鏈驗證；`openssl x509`／`s_client`／`verify`、`curl` 的 HTTPS、`certbot`（ACME HTTP-01、更新、timer）；§11 |
| E14 `nginx` | 真正解析的 nginx 設定（include、server、location）、`nginx -t`／`-T`／`-s`、reload 才套用、依設定服務檔案與寫日誌；§12 |
| E15 `proxy` | nginx 的反向代理：`proxy_pass` 的 URI 規則、轉送標頭、WebSocket 升級、502／504 與 error.log、`upstream`（round robin、least_conn、ip_hash、backup、down、被動健康檢查）、`map`；§16 |
| E16 `firewall` | 主機防火牆：`ufw`、`nft` 子集；別台主機的連線由防火牆決定（丟棄逾時、REJECT 拒絕），狀態追蹤；遠端工作階段看得到課程的網路；§17 |
| E17 `tunnels` | `ssh -L`／`-R`／`-J`、`-f -N`、`~/.ssh/config`（Host 區塊、ProxyJump）、只有跳板機連得到的私有網段、sshd 的 AllowTcpForwarding／GatewayPorts；§18 |
| E18 `edge` | HTTP 快取：`sleep` 讓模擬時鐘前進、nginx 的 `proxy_cache`（`$upstream_cache_status`）、`expires`、靜態檔的 `Last-Modified`／`ETag` 與 304、CDN 邊緣節點（`Age`、`X-Cache`）與虛構的清除 API、`curl -w` 的時間變數；§23 |
| E19 `diagnostics` | `ping`、`traceroute`、`mtr --report`、讀課程擷取檔的 `tcpdump -r`、`sed` 的子集；延遲與路徑由課程宣告；§24 |

不新增任何執行期套件；所有輸出由課程資料與固定時鐘決定（§5）。

## 2. 活動對應（`serverFromBlueprint`，`src/content/curriculum/lessons.ts`）

藍圖的活動對應到既有的課程活動，和 `terminalFromBlueprint` 共用同一張對照表（`TERMINAL_SHAPES`）；每個島只接受自己用到的活動，`terminalFromBlueprint` 的行為與「not a Linux systems lesson」錯誤不變，`serverFromBlueprint` 對其他島的課回報「not a network and servers lesson」。

| 藍圖活動 | 課程 | 課程活動 | 能力 |
|---|---|---|---|
| `terminal-sim` | SRV01、SRV09、SRV12 | `terminal-sim` | `terminal` |
| `request-path` | SRV02–SRV04、SRV06–SRV08、SRV11 | `network-sequence` | `terminal`、`network-protocol`（和 LNX12 相同） |
| `architecture-diagram` | SRV05 | `network-sequence` | `terminal`、`network-protocol` |
| `protocol-sequence` | SRV10 | `network-sequence` | `terminal`、`network-protocol` |
| `case-study-board` | SRV13 | `terminal-sim` | `terminal`（和 LNX01 相同；分析板仍在 INTERACTIVE_LAB_ROADMAP） |
| `challenge-stages` | SRV14 | `challenge-stages` | `terminal`、`visualization` |

- 資料庫島的 `architecture-diagram` 表示 `content.ops`（備份、複寫與容錯移轉的模擬）。SRV05 的「網頁伺服器架構」**不**沿用它：它以網路情境畫出請求經過的元件。SRV 課若帶 `content.ops`，`validateContent` 回報 `has architecture-diagram content without the architecture-diagram capability`。
- `request-path` 仍是規劃中的活動（KUB07 也用它）；登錄它會被當成已實作，所以不登錄。
- 標題、目標、概念、難度、先修取自藍圖，與 LNX 相同。

## 3. 島嶼登錄

- `src/content/curriculum/schema.ts`：`PREPARED_ISLAND_IDS = ['network-servers']`、`LessonPrefixWritten` 加上 `'SRV'`、`ISLAND_PREFIX['network-servers'] = 'SRV'`。
- `src/content/curriculum/units.ts`：`'network-servers': []`。
- 在第一堂課寫好、島嶼移入 `ISLAND_IDS` 之前，`validateCurriculum` 拒絕任何 SRV 課（「`network-servers is prepared for authoring, not a curriculum island yet`」）。14 堂仍是規劃中、沒有頁面；已發布的課與 LNX01–LNX15 不變。

## 4. 批次與引擎階段

課程編號即位置，依序連續發布；每一批先完成它需要的引擎階段（各自的 profile 與測試），再寫課。profile 延續 LNX 的**線性鏈**：lab < files < streams < users < processes < packages < services < remote < scripting < scheduling < **sockets < dns < http < tls < nginx < proxy < firewall < tunnels < edge < diagnostics**。

| 批次 | 課程 | 引擎階段 |
|---|---|---|
| SRV-1 | SRV01–SRV03 | **E10** `sockets`（已完成，§6）、**E11** `dns`（已完成，§7）、**E12** `http`（已完成，§8） |
| SRV-2 | SRV04–SRV06 | **E13** `tls`（已完成，§11）、**E14** `nginx`（已完成，§12）；課程資料與檢查 §13 |
| SRV-3 | SRV07–SRV10 | **E15** `proxy`（已完成，§16）、**E16** `firewall`（已完成，§17）、**E17** `tunnels`（已完成，§18）；課程資料與檢查 §19、同批的修正 §20 |
| SRV-4 | SRV11–SRV13 | **E18** `edge`（已完成，§23）、**E19** `diagnostics`（已完成，§24）；課程資料與檢查 §25、同批的修正 §26 |
| SRV-5 | SRV14 | 綜合專題，單獨一批 |

先修：SRV01 需要 LNX02；SRV 的同島先修都排在前面（`scripts/curriculum-queue.ts` 檢查）。發布 SRV-1 時，`tests/terminal-capability.test.ts` 與 `tests/curriculum.test.ts` 裡「只有 Linux 島用 `terminal`」的斷言要一起更新。

## 5. 決定論的規則

- **固定時鐘**（E4 §12.2）：DNS 快取的剩餘 TTL、HTTP 的 `Date`、`dig` 的 `WHEN` 都由機器的 `now` 算出；時鐘不前進，所以剛快取的記錄剩餘 TTL 就是完整的 TTL。**`edge` 起**只有 `sleep` 讓時鐘前進（課程的每一台機器一起，§23.2），仍然是決定論的。
- **沒有亂數**：DNS 查詢的 id 是「主機、查詢次數、名稱、類型」的 SHA-256；MAC 位址由「主機／介面名稱」算出（`52:54:00:…`）；socket 的 inode（`lsof` 的 DEVICE）由「主機／PID／協定／位址／埠」算出。
- **固定的時間值**：`dig` 的 Query time：從快取或直接問權威伺服器是 0 msec，解析器必須去問時是 24 msec；`curl` 連不到不存在的位址時是 `after 127000 ms`（Linux 預設 6 次 SYN 重送約 127 秒），有 `--connect-timeout N` 時是 `after N000 ms`，被拒絕是 `after 0 ms`。
- **不印尾端空白**：真實的 `ip`、`host`、`curl -v`（`> `、`< `）會在行尾留空白；模擬環境一律去掉（課文的紀錄因此可以直接比對）。
- **沒有進度表**：`curl` 的進度表含真實的速度與時間，模擬環境不印（等於 `--no-progress-meter`）；`-w` 也不提供 `time_*`、`speed_*`（印說明）。**`edge` 起** `-w` 的時間變數由課程宣告的延遲算出（§23.7）。
- 欄寬由內容決定、欄與欄之間一個空白、最後一欄不補空白；但保留真實工具的對齊方式（`ss` 的位址靠右對齊冒號、埠靠左；`lsof` 的 PID、USER、FD、DEVICE、SIZE/OFF、NODE 靠右）。真實的 `ss` 會把剩下的終端機寬度平均分給各欄，這部分不模擬。

## 6. 引擎階段 E10：`sockets` profile（`src/lib/terminal/sockets.ts`）

### 6.1 選用方式與資料模型

| 項目 | 內容 |
|---|---|
| `SOCKETS_PROFILE` | `scheduling` 的一切加上 `ss`、`lsof`、`nc`、`ip`、`getent`（`E10_COMMANDS`）；feature `sockets`。`scheduling` 以下輸入這些指令是 `command not found`，機器也不多任何欄位或檔案 |
| 介面 | `FsState.sockets.interfaces`：`lo`（127.0.0.1/8）一定存在；其他來自課程的 `interfaces`（`{ name, address: 'a.b.c.d/nn', mac? }`），預設 `eth0` = E7 的 `address`（預設 10.0.0.10）/24。預設閘道 `gateway` 預設是 eth0 網段的第一個位址 |
| 監聽 socket | **不另外儲存**：執行中的行程宣告 `listen: [{ port, address?='0.0.0.0', proto?='tcp', fd?=3+序號, backlog?=4096, http? }]`，socket 和行程同生共死（`kill`、`systemctl stop`、程式失敗都讓它消失）。socket 由宣告的行程與它**同名的子行程**共同持有（nginx 的 worker 繼承 master 的 socket），所以 `lsof`、`ss -p` 列出 master 與 worker。簡化：宣告的行程一結束 socket 就關閉，子行程不會延續它（真實的 worker 可能還持有描述子一段時間）。E7 遠端的 sshd 自動監聽 `sshd_config` 已套用的 Port |
| systemd 啟動的程式 | E6 的 `programs` 可宣告 `listen`；啟動時若同一個協定與埠已被其他行程占用（任一方是 0.0.0.0 或位址相同），程式立刻結束，journal 記錄 `bind() to 0.0.0.0:80 failed (98: Address already in use)`（教學重點：先找出占用的程式） |
| 連線 | 課程可宣告 `connections: [{ local: 'a.b.c.d:port', peer, state?='ESTAB', pid?, fd? }]`（`ss -tan`、`lsof -i`）；狀態是 ss 的 `ESTAB`、`TIME-WAIT`、`CLOSE-WAIT`、`SYN-SENT`、`SYN-RECV`、`FIN-WAIT-1`、`FIN-WAIT-2`、`LAST-ACK`、`CLOSING`。指令本身建立的連線（nc、curl、ssh）是瞬間的，不留下來 |

### 6.2 連線的模型（`reach`，沒有防火牆）

連線是課程機器的純函式：

1. 位址屬於自己（127.0.0.0/8 或介面位址）→ 這台機器；屬於 E7 網路中的另一台（它的 `address` 或介面位址）→ 那台；都不是 → **逾時**（沒有機器回應，例如打錯位址或主機已關機）。
2. 找監聽的 socket：協定與埠相同，而且綁定 `0.0.0.0` 或正好是連線的目的位址。所以綁定 `127.0.0.1` 的服務只有同一台機器連 127.0.0.1 才連得到；從另一台機器、甚至本機連自己的 10.0.0.10 都是 **Connection refused**。
3. 找不到 → **Connection refused**（主機在，但那個位址與埠沒有程式）。

防火牆（丟棄封包而逾時、REJECT）是 E16；在那之前「逾時」只代表位址沒有機器。從 ssh 的遠端工作階段中，只連得到那台機器自己（遠端狀態沒有網路清單；跨主機的連線從本機發出）。`sockets` 以上的機器最多 6 台遠端機器（E7 是 4 台）。

### 6.3 指令

| 指令 | 行為與格式 |
|---|---|
| `ss [-t] [-u] [-l] [-a] [-n] [-p] [-4] [-H] [sport = :埠 \| dport = :埠]` | iproute2 的欄位：`[Netid] State Recv-Q Send-Q Local Address:Port Peer Address:Port Process`；同時列 TCP 與 UDP 時才有 Netid，UDP 列在 TCP 前面（ss 的傾印順序），同協定內監聽的在前、再依埠與位址排序。預設只列非監聽的 socket，`-l` 只列監聽中的，`-a` 兩者。LISTEN 的 Send-Q 是 backlog；UDP 監聽是 `UNCONN`。沒有 `-n` 時埠依 `/etc/services` 換成名稱（`0.0.0.0:ssh`）。`-p` 的 `users:(("nginx",pid=814,fd=6),("nginx",pid=813,fd=6),("nginx",pid=812,fd=6))`（PID 由大到小）**只列使用者能查看的行程**：一般使用者只看到自己的，root（`sudo`）看到全部，和 Linux 相同。過濾條件支援 `sport = :80`、`dport = :443`（也可 `==`、`eq`、服務名稱、外加括號）；`-x` 等其他種類說明只模擬 TCP 與 UDP；錯誤 `ss: invalid option -- 'z'`、`ss: unrecognized option '--foo'` 加 Usage 兩行（結束碼 255） |
| `lsof -i [4][tcp\|udp][:埠] [-n] [-P] [-sTCP:LISTEN]` | `COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME`，依 PID 排序；COMMAND 最多 9 個字（`systemd-r`）；FD 是 `6u`、TYPE `IPv4`、SIZE/OFF `0t0`、NODE `TCP`／`UDP`；NAME 是 `*:http (LISTEN)`、`localhost:postgresql (LISTEN)`、`10.0.0.10:ssh->10.0.0.5:51234 (ESTABLISHED)`（`-n` 不把位址換成 `/etc/hosts` 的名稱，`-P` 不把埠換成服務名稱）。一般使用者**只看到自己的行程**（root 看到全部）；沒有符合時不印東西、結束碼 1；沒有 `-i` 時說明模擬環境只列網路 socket |
| `nc -z [-v] [-n] [-w 秒] 主機 埠[-埠]` | netcat-openbsd 的訊息（標準錯誤）：`Connection to db-01 (10.0.0.20) 22 port [tcp/ssh] succeeded!`（沒有服務名稱時 `[tcp/*]`）、`nc: connect to 10.0.0.20 port 5432 (tcp) failed: Connection refused`、`… failed: Connection timed out`（有 `-w` 時 `… timed out: Operation now in progress`）、`nc: getaddrinfo for host "x" port 80: Name or service not known`。範圍最多 64 個埠；有任一個成功時結束碼 0。不加 `-z`（沒有鍵盤）、`-u`（UDP 沒有交握）、`-l` 印說明 |
| `ip [-4] [-br] address\|link\|route [show [dev 介面]]`、`ip route get 位址` | `ip addr`：`1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000`、`link/…`、`inet 10.0.0.10/24 brd 10.0.0.255 scope global eth1`、`valid_lft forever preferred_lft forever`；IPv6 只有核心自己加的 `::1/128` 與由 MAC 推導的 `fe80::…/64`（EUI-64）。同一介面的第二個同網段位址標 `secondary`。`-br`：`名稱（16 欄） 狀態（14 欄） 位址…`。`ip route`：`default via 203.0.113.1 dev eth0 proto static` 與每個網段的 `proto kernel scope link src …`。`ip route get 8.8.8.8`：`8.8.8.8 via 203.0.113.1 dev eth0 src 203.0.113.10 uid 1000` 與 `    cache`（本機位址是 `local … dev lo` 與 `cache <local>`；沒有路由是 `RTNETLINK answers: Network is unreachable`）。只能查看：修改時非 root 是 `RTNETLINK answers: Operation not permitted`，root 印說明 |
| `getent hosts [名稱\|位址…]`、`getent services [名稱\|埠[/協定]…]` | glibc 的格式：`10.0.0.20       db-01`（位址補到 15 欄）、`http                  80/tcp www`（名稱補到 21 欄）。hosts **先找 IPv6 再找 IPv4**（所以 `getent hosts localhost` 是 `::1             localhost ip6-localhost ip6-loopback`），各自依 `/etc/hosts`、再依 DNS（E11 起）或 E7 的機器名稱（E10）；找不到結束碼 2。其他資料庫說明只支援 hosts 與 services |

### 6.4 Ubuntu 預設會有的東西（課程沒有列出時才產生）

| 產生的 | 內容 |
|---|---|
| `/etc/hosts` | `127.0.0.1 localhost`、`127.0.1.1 主機`、**本課其他機器的** `位址 名稱 別名`、IPv6 的 `::1 localhost ip6-localhost ip6-loopback` 等（Ubuntu 雲端映像的版本） |
| `/etc/services` | Debian netbase 的常見服務（ssh、domain、http、https、submission、imaps、mysql、postgresql、redis、http-alt…，縮短版） |
| systemd-resolved | 使用者 `systemd-resolve`（991）、`/usr/lib/systemd/systemd-resolved`、它的 unit 與開機連結、PID 600 的行程，監聽 `127.0.0.53:53` 與 `127.0.0.54:53`（UDP 與 TCP）；`resolved: false` 時沒有。真實的 ss 顯示 `127.0.0.53%lo:53`，模擬環境不加 `%lo` |

## 7. 引擎階段 E11：`dns` profile（`src/lib/terminal/dns.ts`）

### 7.1 選用方式與資料模型

| 項目 | 內容 |
|---|---|
| `DNS_PROFILE` | `sockets` 的一切加上 `dig`、`host`、`named-checkzone`、`rndc`、`resolvectl`（`E11_COMMANDS`）；feature `dns`；另外產生 `/etc/resolv.conf`（`nameserver 127.0.0.53`、`options edns0 trust-ad`、`search .`） |
| 權威伺服器 | 機器（或遠端機器）的 `named: true`（或 `'stopped'`）產生 BIND 9.18：使用者 `bind`、`/etc/bind/named.conf`（include options 與 local）、`named.conf.options`（`recursion no`）、空的 `named.conf.local`（課程通常自己列出）、`rndc.key`（bind:bind 0640）、`/var/cache/bind`、`named.service`（`Alias=bind9.service`）與開機連結、PID 800 的 `/usr/sbin/named -f -u bind`，在 127.0.0.1 與每個介面位址監聽 53（UDP、TCP）、在 127.0.0.1 監聽 953（rndc）。區域由 `/etc/bind/named.conf.local` 的 `zone "名稱" { type master; file "路徑"; };`（`primary` 也可以；相對路徑在 `/var/cache/bind`）宣告 |
| 已載入的區域 | `FsState.dns.named`：named **啟動或 reload 時**以 bind 的身分讀到的內容。改了區域檔不會改變答案，要 `sudo rndc reload [區域]` 或 `sudo systemctl reload named`；`systemctl restart`／`start` 重新載入全部。reload 失敗的區域**保留舊的資料**（BIND 的行為），從沒載入成功的區域回答 SERVFAIL |
| 網際網路的其他區域 | 本機的 `internet: [{ zone, text }]`：課程宣告的其他網域的權威資料（例如 CDN 的網域），一定連得到；必須能載入 |
| 解析器的快取 | `dnsCache: [{ name, type, ttl, cachedAt, data? \| negative: 'NXDOMAIN'\|'NODATA', soa? }]`，`cachedAt` 是 UTC 時間。**剩餘 TTL = ttl − (now − cachedAt)**，不大於 0 的記錄已經過期。變體可以換掉 `dnsCache`（或 `now`），讓 `output` 檢查不能靠打出答案通過 |

### 7.2 區域檔（BIND 主檔格式的子集）

- `$ORIGIN`、`$TTL`（秒或 `1h30m`、`1d`、`1w`）；`@` 是原點；**沒有結尾句點的名稱接上原點**（`www.example.com` 會變成 `www.example.com.example.com.`，`named-checkzone` 不會報錯——這是課程要練習發現的錯誤）；行首空白沿用上一筆的名稱；TTL 與 `IN` 順序不拘；`;` 註解；括號可以跨行（SOA）；TXT 是一或多個加引號的字串（每段最多 255 位元組）。
- 記錄類型：SOA、NS、A、AAAA（存成 RFC 5952 的壓縮寫法）、CNAME、MX、TXT。PTR、SRV、CAA 等說明模擬環境不支援；`$INCLUDE`、`$GENERATE`、萬用字元記錄（`*`）、DNSSEC、區域傳送都不支援。
- 沒有 `$TTL` 也沒有寫 TTL 時：SOA 用它的 minimum（`no TTL specified; using SOA MINTTL instead`），其他記錄沿用上一筆。
- 第一個錯誤就停止：`dns_rdata_fromtext: 檔案:行: near '1.2.3.400': bad dotted quad`（或 `dns_master_load: 檔案:行: …`）、`zone example.com/IN: loading from master file 檔案 failed: bad dotted quad`、`zone example.com/IN: not loaded due to errors.`。區域檢查：`has 0 SOA records`、`has no NS records`、`檔案:行: www.example.com: CNAME and other data`、`multiple RRs of singleton type`、區域內的 NS 目標沒有位址是錯誤（`NS 'ns2.example.com' has no address records (A or AAAA)`），MX 目標沒有位址只是警告，NS／MX 指向 CNAME 是錯誤（`is a CNAME (illegal)`）；區域外的名稱 `ignoring out-of-zone data (…)` 後略過。
- 權威答案：同一區域內的 CNAME 目標一起回答（BIND 的行為）；名稱存在但沒有該類型是 NODATA，名稱不存在是 NXDOMAIN，兩者的 AUTHORITY 都是 SOA，TTL 是 min(SOA 的 TTL, SOA minimum)（否定快取的 TTL）。
- SOA 的 serial 只在載入訊息中出現（`loaded serial 2026112201`）；次要伺服器與 NOTIFY 不模擬，serial 的慣例在課文說明。

### 7.3 解析的路徑

- **本機的解析器**（systemd-resolved，127.0.0.53）：先看 `/etc/hosts`（A／AAAA，TTL 0，和真實的 resolved 一樣），再看快取（剩餘 TTL），都沒有時直接取得權威資料：在本機與網路中**有 named 的機器**已載入的區域、以及 `internet` 的區域裡，找原點最長、包含這個名稱的區域（同名時本課的機器優先）。那台 named 沒有在執行，或區域沒有載入 → SERVFAIL；沒有任何區域包含它 → NXDOMAIN。得到的每組記錄以 `cachedAt = now` 存進快取（取代同名同類型的舊記錄），否定的答案也快取；跨區域的 CNAME 會繼續追。委派（根、TLD、NS 與 glue 的逐步查詢）是 CN12 的主題，不模擬。
- **直接問伺服器**（`dig @ns1`）：連到那個位址的 53（UDP）；是 named → 權威回答它的區域（`aa`），其他名稱 REFUSED（`recursion no`）；沒有程式在 53 → `connection refused`；位址沒有機器 → `timed out`。`dig` 與 `host` **從不讀 `/etc/hosts`**。
- **glibc 的查詢**（E11 起的 `getent hosts`、`nc`、`curl`、`ssh`、`ssh-keyscan`）：先 `/etc/hosts`，再問 `/etc/resolv.conf` 的第一個 nameserver；NXDOMAIN 或沒有記錄是「Name or service not known」，SERVFAIL、REFUSED、連不到是「Temporary failure in name resolution」。找到的位址不是任何機器時，`ssh` 是 `connect to host … port 22: Connection timed out`。**E10 以下不變**：ssh 仍依 E7 的機器名稱找主機，E10 的 `nc`、`getent` 依 `/etc/hosts` 與機器名稱。
- 從 ssh 的遠端工作階段中查詢時，只有那台機器自己的 named 與快取（遠端沒有網路清單）。

### 7.4 指令

| 指令 | 行為與格式 |
|---|---|
| `dig [@伺服器] 名稱 [類型] [+short] [+noall] [+answer] [+[no]段落] [+norecurse] [-t 類型]` | BIND 9.18 的版面：空行、`; <<>> DiG 9.18.30-0ubuntu0.24.04.2-Ubuntu <<>> 參數`、（有 @ 時）`; (1 server found)`、`;; global options: +cmd`、`;; Got answer:`、`;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: N`、`;; flags: qr rd ra; QUERY: 1, ANSWER: 2, AUTHORITY: 0, ADDITIONAL: 1`（權威伺服器是 `qr aa rd` 加 `;; WARNING: recursion requested but not available`）、`;; OPT PSEUDOSECTION:` 與 `; EDNS: version: 0, flags:; udp: 65494`（resolved；named 是 1232，**不印** named 的 COOKIE 行）、QUESTION／ANSWER／AUTHORITY 段落、`;; Query time`、`;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)`、`;; WHEN:`（機器的時區）、`;; MSG SIZE  rcvd: N`（以名稱壓縮算出的真實大小）、空行。記錄以 Tab 對齊到第 24、32、40、48 欄，名稱已經超過時改用一個空格（BIND 的規則）。`+short` 只印資料；`+noall +answer` 只印答案的記錄。`+norecurse` 只改變 `rd` 旗標。連不到：三行 `;; communications error to X#53: timed out`（或 `connection refused`）、`;; no servers could be reached`，結束碼 9；@名稱找不到：`dig: couldn't get address for 'x': not found`（10） |
| `host [-t 類型] 名稱 [伺服器]` | `www.example.com is an alias for example.com.`、`example.com has address …`、`has IPv6 address`、`mail is handled by 10 mail.example.com.`、`descriptive text "…"`、`name server …`、`has SOA record …`；不指定類型時查 A、AAAA、MX；指定類型而沒有記錄：`example.com has no MX record`；NXDOMAIN：`Host x not found: 3(NXDOMAIN)`（SERVFAIL 2、REFUSED 5），結束碼 1；有伺服器時先印 `Using domain server:`、`Name:`、`Address: X#53`、`Aliases:`、空行 |
| `named-checkzone [-q] 區域 檔案` | §7.2 的訊息，通過時 `zone example.com/IN: loaded serial N` 與 `OK`（結束碼 0），否則 1；以執行者的權限讀檔 |
| `rndc reload [區域]` | 只有 root（否則 `rndc: neither /etc/bind/rndc.conf nor /etc/bind/rndc.key was found`）；named 沒有執行：`rndc: connect failed: 127.0.0.1#953: connection refused`。全部：`server reload successful`；單一區域：`zone reload queued`（內容沒變：`zone reload up-to-date`），失敗：`rndc: 'reload' failed: bad dotted quad`（結束碼 1，保留舊的資料）；不存在：`rndc: 'reload' failed: not found` 與 `no matching zone 'x' in any view`。journal（`named.service`）記錄每次載入。其他子指令說明只支援 reload |
| `resolvectl flush-caches` | 清除本機解析器的快取；非 root：`Failed to flush caches: Interactive authentication required.`（沒有 polkit 代理，和 E6 的 systemctl 相同）。其他子指令說明只支援 flush-caches |

## 8. 引擎階段 E12：`http` profile（`src/lib/terminal/http.ts`）

### 8.1 回應者

- 機器（或遠端機器）的 `responders: [{ id, server?, keepAlive?=true, routes }]`；監聽的 socket 以 `listen.http: id` 指定由哪一個回應（只能是 TCP）。
- 路由 `{ path, host?, methods?=['GET'], status?, headers?: [名稱, 值][], body?, redirect?, type?='text/html' }`：依順序找第一個 path（完全相同，或以 `*` 結尾的前綴；查詢字串不算）與 Host 標頭（沒有寫時任何 Host）都符合的路由。允許 GET 時 HEAD 也可以；其他方法 405；沒有符合的路由 404。`redirect` 的狀態預設 301（Location 可以是相對位址）。
- 回應標頭照 nginx 的順序：`Server`（有寫時）、`Date`（固定時鐘的 IMF-fixdate，`Sun, 22 Nov 2026 10:00:00 GMT`）、`Content-Type`、`Content-Length`（UTF-8 位元組數）、`Connection: keep-alive`（`keepAlive: false` 時 `close`）、`Location`、再接路由自己的標頭。3xx–5xx 沒有內容時用 nginx 的錯誤頁（`<html>…<center><h1>404 Not Found</h1></center>…</html>`，有 Server 時加 `<hr><center>nginx/1.24.0 (Ubuntu)</center>`）；Server 以 nginx 開頭時使用 nginx 的原因片語（302 `Moved Temporarily`、405 `Not Allowed`、503 `Service Temporarily Unavailable`、504 `Gateway Time-out`），否則用 RFC 的片語。
- 只有 HTTP/1.1。304、Range、壓縮、chunked、Cookie 的狀態、內容協商不模擬（課程可以把需要的標頭寫在路由上）。

### 8.2 `curl`（curl 8.5.0）

| 項目 | 行為 |
|---|---|
| 選項 | `-v`、`-s`、`-S`、`-I`（HEAD，印回應標頭與結尾的空行）、`-i`（內容前加標頭）、`-L`、`-f`、`-k`（接受、沒有作用）、`-o 檔案`、`-w 格式`、`-H '名稱: 值'`（可重複；`Host:` 取代預設的 Host，用來測試虛擬主機）、`-X 方法`、`-d 資料`（POST、`Content-Type: application/x-www-form-urlencoded`）、`-A`、`--resolve 主機:埠:位址`、`--max-redirs N`（預設 50）、`--connect-timeout 秒`／`-m`；長選項與合寫（`-sSL`、`-sI`）都可以。不認得：`curl: option --x: is unknown` 與 try 行，結束碼 2；沒有網址：`curl: no URL specified!` |
| 步驟與錯誤碼 | 名稱（`--resolve`，否則 glibc 的查詢）→ `curl: (6) Could not resolve host: x`；連線（§6.2）→ 拒絕 `curl: (7) Failed to connect to x port 81 after 0 ms: Couldn't connect to server`、沒有機器 `… after 127000 ms: Couldn't connect to server`、有 `--connect-timeout` 時 `curl: (28) … after 5000 ms: Timeout was reached`；監聽的不是 HTTP：sshd 是 `curl: (1) Received HTTP/0.9 when not allowed`，其他 `curl: (52) Empty reply from server`；`-f` 與 4xx／5xx：`curl: (22) The requested URL returned error: 404`；重新導向太多：`curl: (47) Maximum (N) redirects followed`；`-o` 寫不進去：`Warning: Failed to open the file x: Permission denied` 與 `curl: (23) Failure writing output to destination`。`-s` 隱藏錯誤，`-sS` 仍印 |
| `-v` 的版面 | `*   Trying 10.0.0.12:80...`、`* Connected to www.example.org (10.0.0.12) port 80`、`> GET / HTTP/1.1`、`> Host:`、`> User-Agent: curl/8.5.0`、`> Accept: */*`（自訂標頭、`-d` 的 Content-Length 與 Content-Type 接在後面）、`>`、`< HTTP/1.1 200 OK`、回應標頭、`<`，內容（標準輸出），最後 `* Connection #0 to host www.example.org left intact`（伺服器說 close 時 `* Closing connection`）。`-X POST -d` 先印 `Note: Unnecessary use of -X or --request, POST is already inferred.` |
| 連線重用與 keep-alive | 同一個指令的多個網址（與 `-L` 的下一步）若主機名稱、埠、scheme 相同而連線還開著，`* Re-using existing connection with host …`，不再 Trying；伺服器回 `Connection: close` 之後要重新連線（連線編號遞增）。不同的主機名稱（`example.org` 與 `www.example.org`）即使位址相同也是不同的連線 |
| `-L` | 3xx 有 Location 時 `* Issue another request to this URL: '…'`，**不寫出**被跟隨的回應內容（`-i`／`-I` 仍印它的標頭）；303，以及 301／302 的 POST，改成 GET（`* Switch to GET`）；307／308 保留方法 |
| `-w` | 每個網址傳完後印到**標準輸出**（不進 `-o` 的檔案）：`%{http_code}`（`response_code`）、`%{url_effective}`、`%{redirect_url}`（最後一個回應是沒有跟隨的重新導向時）、`%{num_redirects}`、`%{num_connects}`、`%{content_type}`、`%{size_download}`、`%{size_header}`、`%{size_request}`、`%{remote_ip}`、`%{remote_port}`、`%{method}`、`%{http_version}`、`%{exitcode}`、`%{errormsg}`、`%header{名稱}`、`%%`、`\n \t \r \\`；`time_*`、`speed_*` 印說明；其他 `curl: unknown --write-out variable: 'x'` |
| `-o` | 以執行者的權限開檔（新檔 `666 & ~umask`，`/dev/null` 丟棄），內容是原本會印到標準輸出的資料 |
| HTTPS | **選擇**：`http` profile 的機器上，`https://` 照常解析名稱、連到 443（所以 6、7、28 都是真的），連上之後停在 `curl: (35) 模擬環境：HTTPS 的 TLS 交握在引擎階段 E13 才模擬；請先用 http:// 觀察 HTTP`（`-v` 另有 `* Closing connection`）。不會假裝完成 TLS，也不會偷偷改成明文。`tls` 以上完成交握（§11.5）；SRV03 的機器是 `http`，輸出不變 |
| 不支援 | 進度表（§5）、HTTP/2 與 HTTP/3（`--http2` 印說明）、cookie jar、`-u`、`-F`、`-O`、`-D`、`-x`（代理是 E15）、`--compressed` 的實際解壓（接受、沒有作用）、IPv6 連線、HSTS 的強制（`--hsts` 檔；`Strict-Transport-Security` 只是一個回應標頭） |

### 8.3 擬真度修正（`http` 以上；E13／E14 時加入）

| 修正 | 內容 |
|---|---|
| 取代預設標頭 | `-H 'User-Agent: …'`、`-H 'Accept: …'`（以及 `-d` 時的 `Content-Type`、`Content-Length`）**取代** curl 自己的標頭，不再重複送出兩個；和 curl 相同，自訂的標頭排在 curl 的標頭之後（`Host`、`Accept`、`User-Agent: probe/1`），`-A` 則留在原位。值是空的（`-H 'Accept:'`）表示拿掉那個標頭 |
| `-o` 只對第一個網址 | `curl -o a.html 網址1 網址2`：第一個網址寫入檔案，之後的網址印到標準輸出（curl 的 -o 與網址一一對應） |
| 204 | 204 No Content 沒有本文，也沒有 `Content-Length`（nginx 也不送 `Content-Type`，E14 的 nginx 照做；E12 的回應者保留 `Content-Type`） |
| 以其他請求標頭比對路由 | 選擇性的項目，**沒有做**：路由仍只看 path、Host 與方法 |

已發布的 SRV01–SRV03 沒有用到這三種寫法，範例輸出逐字不變（`terminalContentProblems` 都是空的）。

## 9. 課程資料與檢查（`src/lib/terminal/server-lesson.ts`、`lesson.ts`）

```ts
machines: [{ ..., profile: 'sockets' | 'dns' | 'http',
  interfaces?: [{ name, address: 'a.b.c.d/nn', mac? }], gateway?, resolved?: false,
  connections?: [{ local, peer, state?, pid?, fd? }],
  processes: [{ ..., listen?: [{ port, address?, proto?, fd?, backlog?, http? }] }], programs: [{ ..., listen? }],
  named?: true | 'stopped', dnsCache?: [...], internet?: [{ zone, text }],      // dns 以上
  responders?: [{ id, server?, keepAlive?, routes: [...] }],                  // http 以上
  remotes: [{ ..., interfaces?, processes?, programs?, services?, connections?, resolved?, named?, dnsCache?, responders? }] }]
```

| 規則 | 內容 |
|---|---|
| 各自的 profile | `interfaces`、`gateway`、`connections`、`resolved`、`listen` 需要 `sockets`（「`… need the sockets profile (engine stage E10)`」）；`named`、`dnsCache`、`internet` 需要 `dns`（E11）；`responders`、`listen.http` 需要 `http`（E12）。遠端機器的這些欄位同樣檢查（訊息前綴 `remote 名稱:`） |
| 產生的東西 | §6.4、§7.1 的檔案、使用者、行程、程式與 unit 只在課程沒有列出時加入；驗證器檢查的是加入後的機器（所以列出的 `/etc/hosts` 要自己寫父目錄，產生的則依路徑排序） |
| 介面與連線 | 最多 4 個介面位址；名稱 `[a-z][a-z0-9]{0,14}`（不是 lo）；位址 `a.b.c.d/8..32`、不是迴路、不重複；同時寫 `address` 時它必須是介面位址；閘道必須在某個介面的網段、不是自己；連線的本機位址屬於機器、狀態在表中、`pid` 是表中的行程（TIME-WAIT 沒有），最多 40 個 |
| 監聽 | 埠 1–65535；位址是 0.0.0.0、迴路或機器的位址；協定 tcp／udp；fd 3–1023；backlog 0–65535；`http` 必須是 TCP 而且有那個回應者；執行中的行程不能監聽衝突的位址與埠（Address already in use） |
| DNS | `named` 是 `true` 或 `'stopped'`；快取最多 100 筆，名稱合法、類型在 §7.2 的表中、ttl 0–2^31−1、`cachedAt` 不晚於 now、有 data（或 negative 而沒有 data）、`soa` 只用在 negative；`internet` 最多 8 個區域、每個都要能載入 |
| HTTP | 最多 8 個回應者，id 是 `[a-z0-9][a-z0-9-]{0,31}` 且不重複；每個 1–30 個路由；path 以 `/` 開頭、沒有空白；methods 在 GET HEAD POST PUT DELETE PATCH OPTIONS 中；status 100–599；redirect 一行且狀態是 3xx；標頭名稱是 token、值一行；body 不超過 `LIMITS.fileLength` |
| 指令 | 範例、參考解答與常見錯誤的**每一段管線、`sudo` 後面的指令、指令稿裡的指令**都要在機器的 profile 裡（`scheduling` 機器上的 `sudo ss -tln \| grep 80` 回報「`ss is not in the scheduling profile of machine …`」） |
| 變體 | 可以換掉 `dnsCache`（`dns` 以上）、`now`、遠端機器 |

新的檢查（和其他檢查一樣，在原機器與每個變體上重播學習者的指令後判斷）：

| 檢查 | 意義 |
|---|---|
| `{ kind: 'listen', port, proto?, address?, process?, absent?, host? }` | 有（沒有）程式在這個埠監聽；`address` 是綁定的位址，`process` 是 ps 的 comm（任一個持有者符合即可）；`host` 是遠端機器 |
| `{ kind: 'dns', name, type?='A', values?, absent?, server? }` | `server`（遠端機器）時看它的 named **已載入**的權威資料（改了檔案而沒有 reload 不通過），否則看本機解析器現在會回答什麼（含快取）；`values` 是 `dig +short` 的文字，不分順序與大小寫；`absent` 是沒有這個類型的記錄 |
| `{ kind: 'http', url, status?, header?: [名稱, 值], body?, host? }` | 從本機（或 `host`）以 GET 送出請求、不跟隨重新導向：狀態碼、標頭的值（名稱不分大小寫）、內容包含的文字；只接受 `http://` |

## 10. 測試

| 檔案 | 內容 |
|---|---|
| `tests/server-capability.test.ts` | 六種藍圖活動的對應、LNX 的對應與錯誤不變、合成的 SRV02（機器、網路情境與網路練習）通過 `validateContent`、預備島嶼時被 `validateCurriculum` 拒絕、`content.ops` 被拒絕、14 堂規劃中的大綱、`validateCurriculum(curriculum)` 是 `[]` |
| `tests/terminal-e10.test.ts` | profile 的分界（`scheduling` 拒絕 E10 指令、機器不多任何欄位或檔案）、產生的 `/etc/hosts`／`/etc/services`／systemd-resolved、`ss` 的每種格式與權限、`lsof` 的排序與權限、`nc` 的成功／拒絕／逾時與 127.0.0.1 的可達性、範圍與結束碼、kill 之後 socket 消失、systemd 的埠衝突、`ip` 的位址與路由、EUI-64、`getent`、資料驗證、`listen` 檢查、不改動狀態 |
| `tests/terminal-e11.test.ts` | profile 的分界、區域檔的語法與每種錯誤、少了句點的名稱、IPv6 正規化、權威答案、`named-checkzone`、reload 才套用、reload 失敗保留舊資料、restart 的 SERVFAIL、停止的 named、`dig` 的完整版面與欄位、`+short`／`+noall +answer`、NXDOMAIN、REFUSED、連不到、`host`、快取的剩餘 TTL（含另一個 now）、否定快取、過期後重新取得、flush-caches、`/etc/hosts` 的順序、伺服器停止時的 SERVFAIL 與 glibc 的暫時失敗、ssh 經由 DNS 找主機、資料驗證、`dns` 檢查 |
| `tests/terminal-e12.test.ts` | profile 的分界、路由的比對（前綴、Host、405、404、HEAD）、nginx 的標頭與錯誤頁、`curl` 的輸出、`-v`、`-I`、`-i`、`-L` 與連線重用、`--max-redirs`、keep-alive 與 close、`-w`、`-o`（含權限）、POST、`--resolve` 與 Host 標頭、每一種錯誤碼、HTTPS 停在 E13、資料驗證、`http` 檢查 |
| `tests/support/server-fixture.ts` | 只供測試：web-01（公開與私有介面、sshd、nginx 的 master 與 worker、只綁 127.0.0.1 的 PostgreSQL、learner 的開發伺服器、會撞埠的 web2.service、db-01 與 app-01）、ws-01（解析器的快取、遠端的 ns1、CDN 的網際網路區域）、ns-01（本機的 named）、cli-01（web-02 的回應者與沒有 keep-alive 的舊伺服器） |

`tests/terminal-e1.test.ts` 只把 `PROFILES` 的期望值加上三個新 profile（和之前每個階段相同的更新方式）。LNX01–LNX15 與較低的 profile 逐字不變。E13–E14 的測試見 §14。

## 11. 引擎階段 E13：`tls` profile（`src/lib/terminal/tls.ts`、`openssl.ts`、`certbot.ts`）

### 11.1 選用方式與憑證的模型

| 項目 | 內容 |
|---|---|
| `TLS_PROFILE` | `http` 的一切加上 `openssl`、`certbot`（`E13_COMMANDS`）；feature `tls`。`http` 以下輸入這兩個指令是 `command not found`，機器不多任何欄位或檔案，`curl https://` 仍停在 E12 的錯誤 35 |
| 憑證 | 一筆**紀錄**：subject（`CN`，可加 `O`）、SAN（DNS 名稱，可以是 `*.x`）、issuer、serial、notBefore／notAfter（固定時鐘的 UTC）、金鑰類型（`rsa2048`、`rsa4096`、`ec256`、`ec384`）、subject key identifier（金鑰種子的 SHA-256 前 20 位元組）、authority key identifier（簽發者的 SKI）、是否為 CA |
| PEM 檔 | `-----BEGIN CERTIFICATE-----`、每行 64 字的 base64、`-----END CERTIFICATE-----`；**內容不是 DER**：base64 解開是 `LISIM-X509 ` 加上那筆紀錄的 JSON（和 E7 的金鑰一樣「格式像真的、改了就壞、不能拿去真實系統用」）。私鑰是 `-----BEGIN PRIVATE KEY-----`，內容是金鑰類型與種子；它的 SKI 等於憑證的 SKI 時兩者相配。一個檔案可以有多張憑證（fullchain：葉憑證在前、中繼在後） |
| 內建的 CA | `isrg-root-x1`（ISRG Root X1，2015-06-04 到 2035-06-04，RSA 4096）與 `lets-encrypt-r11`（Let's Encrypt R11，2024-03-13 到 2027-03-12，由 ISRG Root X1 簽發）；日期是真的，金鑰與 serial 是模擬的。模擬環境沒有其他公開的 CA |
| 信任庫 | `/etc/ssl/certs/ca-certificates.crt`：ISRG Root X1 加上課程的 `trust`（同一課的 CA 憑證）。真實的 Ubuntu 約有 140 張根憑證，模擬環境只放需要的。`/etc/ssl/private` 是 0700 |
| 指紋 | `openssl x509 -fingerprint` 對「DER」（就是上面那段 JSON 的位元組）算 SHA-1（純 JS 的 `sha1`）或 SHA-256，輸出格式和 OpenSSL 3 相同 |

### 11.2 憑證鏈的驗證（`verifyChain`，照 OpenSSL 3.0 的 `verify_chain`，沒有簽章運算）

1. **建鏈**：從伺服器送來的第一張（葉）開始，找它的簽發者：subject 等於它的 issuer、SKI 等於它的 AKI；先找信任庫，再找伺服器送來的其他憑證。遇到信任庫裡的自簽憑證就是信任錨。找不到簽發者：鏈頂是自簽的 → **18**（只有一張）或 **19**；否則 **20**（unable to get local issuer certificate）。
2. 要求檢查名稱時（`s_client -verify_hostname`）葉憑證不含那個名稱 → **62**（hostname mismatch）。名稱比對看 SAN（沒有 SAN 才看 CN），`*.x` 只配一層。
3. `internal_verify`：鏈頂不是自簽而且只有葉憑證 → **21**（unable to verify the first certificate）；然後由上而下檢查每張的時間：未生效 **9**、已過期 **10**。
4. 每一次回呼都是一個事件（深度、憑證、錯誤碼）：`s_client` 全部印出（錯誤碼會延續到下一次回呼，所以過期時 `notAfter=` 會出現兩次，和 OpenSSL 的 `s_cb.c` 相同），curl 在**第一個**錯誤中止交握，`s_client` 的 `Verify return code` 是**最後一個**錯誤。

### 11.3 `openssl`（OpenSSL 3.0.13）

| 指令 | 行為與格式 |
|---|---|
| `openssl x509 [-in 檔案] [-noout] [-subject] [-issuer] [-dates] [-startdate] [-enddate] [-serial] [-ext subjectAltName,basicConstraints] [-fingerprint [-sha1\|-sha256]] [-checkend 秒]` | 依選項的順序印：`subject=CN = shop.example.org`、`issuer=C = US, O = Let's Encrypt, CN = R11`、`notBefore=Nov  1 09:00:00 2026 GMT`、`serial=…`（大寫）、`X509v3 Subject Alternative Name:` 與 `    DNS:a, DNS:b`（真實的行尾有一個空白，模擬環境不印，§5）、`SHA1 Fingerprint=AA:…`／`sha256 Fingerprint=…`；`-checkend N`：N 秒內到期印 `Certificate will expire`（結束碼 1），否則 `Certificate will not expire`；沒有 `-noout` 時最後印出 PEM。沒有 `-in` 時讀**標準輸入**（`openssl s_client … \| openssl x509 -noout -dates`），沒有管線時說明沒有鍵盤。讀不到：`Could not open file or uri for loading certificate from x` 與 `Unable to load certificate`；不是憑證：`Could not read certificate from x`（OpenSSL 帶記憶體位址的錯誤堆疊行不印）。`-text` 印說明 |
| `openssl s_client -connect 主機:埠 [-servername 名稱] [-verify_hostname 名稱] [-CAfile 檔案] [-showcerts]` | 標準輸出：`CONNECTED(00000003)`、`---`、`Certificate chain`（每張 ` 0 s:`、`   i:`、`   a:PKEY: id-ecPublicKey, 256 (bit); sigalg: RSA-SHA256`、`   v:NotBefore: …; NotAfter: …`）、`Server certificate` 與 PEM（`-showcerts` 時改在鏈中印出每一張）、`subject=`、`issuer=`、`SSL handshake has read N bytes and written 393 bytes`、`Verification: OK`（或 `Verification error: …`）、`New, TLSv1.3, Cipher is TLS_AES_256_GCM_SHA384`、`Server public key is N bit`、`Verify return code: 0 (ok)`、`---`。標準錯誤：§11.2 的 `depth=…`／`verify error:num=…`／`verify return:1`，最後 `DONE`。**簡化**：真實的輸出更長（`Peer signing digest`、`Post-Handshake New Session Ticket` 等），模擬環境只印上面的摘要，而且就像標準輸入是空的（`echo \| openssl s_client …`）。沒有 `-servername` 時 SNI 是 `-connect` 的主機名稱（OpenSSL 1.1.1 起的行為；位址則不送）。**名稱只有 `-verify_hostname` 時才檢查**（教學重點：`Verification: OK` 不代表名稱對）。連到不是 TLS 的埠：`error:0A00010B:SSL routines::wrong version number` 與 `no peer certificate available`；被拒絕 `connect:errno=111`、逾時 `connect:errno=110`、名稱查不到 `BIO_lookup_ex:system lib:Name or service not known` |
| `openssl verify [-CAfile 檔案] [-untrusted 檔案] 憑證…` | 只驗證檔案中的**第一張**（fullchain 要用 `-untrusted` 提供中繼）；信任庫是 `/etc/ssl/certs/ca-certificates.crt` 加上 `-CAfile`。成功 `x.pem: OK`；失敗依 OpenSSL 的回呼：subject 一行、`error 20 at 0 depth lookup: unable to get local issuer certificate`，過期（10）與自簽（18）會繼續檢查，最後 `error x.pem: verification failed`，結束碼 2 |
| `openssl version` | `OpenSSL 3.0.13 30 Jan 2024 (Library: OpenSSL 3.0.13 30 Jan 2024)`；其他子指令（`req`、`genrsa`…）印 `Invalid command 'x'; type "help" for a list.` 與說明 |

### 11.4 `certbot`（certbot 2.9.0）與模擬的 Let's Encrypt

| 項目 | 內容 |
|---|---|
| 安裝 | 機器資料 `certbot`（`tls` 以上）：`/usr/bin/certbot`、`/etc/letsencrypt`（`live`、`archive` 0700、`renewal`、`renewal-hooks/deploy`）、`/var/log/letsencrypt` 0700、`certbot.service`（`Type=oneshot`、`ExecStart=/usr/bin/certbot -q renew`）與 `certbot.timer`（`OnCalendar=*-*-* 00,12:00:00`、`RandomizedDelaySec=43200`、`Persistent=true`，Debian 套件的內容），timer 預設 enable（`timer: false` 時沒有連結）。沒有 `certbot` 的機器輸入 certbot：Ubuntu 的 `Command 'certbot' not found, but can be installed with:` |
| 權限 | 只有 root：`The following error was encountered:`、`[Errno 13] Permission denied: '/var/log/letsencrypt/.certbot.lock'`、`Either run as root, …` |
| 帳號 | 第一次要 `--agree-tos` 與 `-m 信箱`（或 `--register-unsafely-without-email`），印 `Account registered.`；`certbot.account: true` 的機器已有帳號。模擬環境沒有互動輸入，缺少的選項（`-d`、驗證方式、`-w`）都印說明 |
| HTTP-01 | `certonly --webroot -w 目錄 -d 名稱…`（每個 `-w` 適用於之後的 `-d`）：certbot 以 root 在 `目錄/.well-known/acme-challenge/TOKEN` 寫入 key authorization（資料夾不存在就建立），**CA 從網際網路**取回 `http://名稱/.well-known/acme-challenge/TOKEN`：名稱用權威資料解析（**不看**本機的 `/etc/hosts` 與解析器快取）、連到那個位址的 80 埠（§6.2，沒有防火牆）、跟隨最多 10 次重新導向（也可以到 https，不驗證憑證）、比對內容。之後刪除 token 與它建立的空資料夾。TOKEN 由主機與訂單序號決定，沒有亂數 |
| 錯誤 | Let's Encrypt 的格式：`Certbot failed to authenticate some domains (authenticator: webroot). The Certificate Authority reported these problems:`，每個名稱 `Domain:`、`Type:`（`dns`、`connection`、`unauthorized`）、`Detail:`（`DNS problem: NXDOMAIN looking up A for x - check that a DNS record exists for this domain`、`203.0.113.99: Fetching http://…: Timeout during connect (likely firewall problem)`、`…: Connection refused`、`203.0.113.10: Invalid response from http://…/TOKEN: 404`），然後 Hint、`Some challenges have failed.`、`Ask for help…`，結束碼 1 |
| 簽發 | 葉憑證：`CN` 是第一個名稱、SAN 是全部（排序），ECDSA P-256（`--key-type rsa` 是 RSA 2048），issuer 是 R11；notBefore 往前一小時、notAfter = notBefore + 壽命 − 1 秒，壽命是課程的 `certbot.lifetime`（預設 90 天）。檔案照 certbot：`archive/名稱/cert1.pem`、`chain1.pem`、`fullchain1.pem`、`privkey1.pem`（0600），`live/名稱/*.pem` 是指向 `../../archive/…` 的相對連結，`live/名稱/README`，`renewal/名稱.conf`（`authenticator`、`webroot_path`、`[[webroot_map]]`、`renew_hook`…）。輸出：`Successfully received certificate.`、`Certificate is saved at:`、`This certificate expires on 2027-02-20.`…與捐款的段落 |
| `certificates` | `Found the following certs:`、`Certificate Name`、`Serial Number`（小寫、不補零）、`Key Type: ECDSA`、`Domains`、`Expiry Date: 2027-02-20 08:59:59+00:00 (VALID: 89 days)`（過期是 `INVALID: EXPIRED`）、兩個路徑；沒有時 `No certificates found.` |
| `renew` | 依序處理 `renewal/*.conf`：剩不到 **30 天**才更新（`--force-renewal` 一律更新），否則 `Certificate not yet due for renewal` 與 `(skipped)` 的摘要；更新寫入下一版（`cert2.pem`…）並改連結。`--dry-run` 和真實的 certbot 一樣**模擬每一張**（未到期時印 `Certificate not due for renewal, but simulating renewal for dry run`），會做驗證、不寫入、不執行 deploy hook（`Dry run: skipping deploy hook command: …`）。`certonly` 遇到同名、同網域、未到期的憑證：`Certificate not yet due for renewal; no action taken.` |
| deploy hook | `--deploy-hook '指令'`（存成 `renew_hook`）：取得或更新之後以 root 經由 shell 執行，印 `Running deploy-hook command: …`。**webroot 方式只取得憑證**：網頁伺服器（nginx）要 reload 才會用新的憑證——這是課程要練習發現的事 |
| timer | `certbot.timer` 出現在 `systemctl list-timers`；時鐘不前進（LNX0 §17.5），所以「自動更新」用 `sudo systemctl start certbot.service` 示範：它真的執行模擬的 `certbot -q renew`（輸出進 journal） |
| `--nginx` | E14（§12.6） |
| 不支援 | `--standalone`、`--manual`、DNS-01、`--apache`、`--staging`（請用 `--dry-run`）、`delete`、`revoke`、`--expand` 的互動、OCSP、憑證透明度 |

### 11.5 curl 的 HTTPS（`tls` 以上）

- 連上之後做 TLS 1.3 交握（curl 8.5 搭配 OpenSSL 3 的 `-v`）：`* ALPN: curl offers h2,http/1.1`、`* TLSv1.3 (OUT), TLS handshake, Client hello (1):`、`*  CAfile: /etc/ssl/certs/ca-certificates.crt`、`*  CApath: /etc/ssl/certs`、Server hello、Encrypted Extensions、Certificate、CERT verify、Finished、Change cipher spec、Finished、`* SSL connection using TLSv1.3 / TLS_AES_256_GCM_SHA384 / X25519 / id-ecPublicKey`（RSA 是 `RSASSA-PSS`）、`* ALPN: server accepted http/1.1`、`* Server certificate:`、`*  subject:`、`*  start date:`、`*  expire date:`、`*  subjectAltName: host "x" matched cert's "x"`、`*  issuer: C=US; O=Let's Encrypt; CN=R11`、`*  SSL certificate verify ok.`、每一張的 `*   Certificate level N: Public key type …, signed using …`；請求送出後兩行 `Newsession Ticket (4)`（每條連線一次）。只說 HTTP/1.1（伺服器的 ALPN 一律回 http/1.1）。
- 驗證失敗（§11.2 的第一個錯誤）：`* TLSv1.3 (OUT), TLS alert, unknown CA (560)`（過期是 `certificate expired (557)`）、`* SSL certificate problem: …`、`curl: (60) SSL certificate problem: certificate has expired` 加上 curl 的四行說明（`More details here: https://curl.se/docs/sslcerts.html`…）。名稱不符在交握之後：`*  subjectAltName does not match x`、`curl: (60) SSL: no alternative certificate subject name matches target host name 'x'`（沒有 SAN 時是 CN 的訊息）。
- `-k`：不中止，`*  SSL certificate verify result: certificate has expired (10), continuing anyway.`，也不檢查名稱。`--cacert 檔案`：加入那個檔案的 CA（`CAfile:` 一行改成它；讀不到是錯誤 77）。
- 伺服器那邊：回應者的 `listen.tls: { certificate, key }`（每次連線以 root 讀檔），或 nginx 依 SNI 選的 server（§12）。連到不是 TLS 的埠：`curl: (35) OpenSSL/3.0.13: error:0A00010B:SSL routines::wrong version number`；用 `http://` 連到 TLS 的回應者：`curl: (52) Empty reply from server`（nginx 則回 400 `The plain HTTP request was sent to HTTPS port`）。
- HSTS 只是回應標頭（回應者的 `headers` 或 nginx 的 `add_header Strict-Transport-Security …`）；curl 沒有 `--hsts` 檔時不會因此改用 https，和真實的 curl 相同。

## 12. 引擎階段 E14：`nginx` profile（`src/lib/terminal/nginx.ts`）

### 12.1 選用方式、套件與執行中的設定

| 項目 | 內容 |
|---|---|
| `NGINX_PROFILE` | `tls` 的一切加上 `nginx`（`E14_COMMANDS`）；feature `nginx`。`tls` 以下 `nginx` 是 `command not found` |
| 套件 | 機器資料 `nginx: true \| 'stopped'`：Ubuntu 24.04 的 nginx 1.24.0——`/etc/nginx/nginx.conf`（Ubuntu 的內容，略去註解掉的區段）、`mime.types`（常用的類型）、`conf.d`、`modules-enabled`、`snippets`、`sites-available/default`（`listen 80 default_server`、`root /var/www/html`、`try_files $uri $uri/ =404`），課程沒有列出任何 `sites-enabled/` 的項目時加上 `sites-enabled/default` 連結；`/var/www/html/index.nginx-debian.html`（Welcome to nginx!，615 位元組）、`/var/log/nginx`（root:adm）與 `access.log`、`error.log`（www-data:adm 0640）、`/usr/sbin/nginx`、`nginx.service`（Ubuntu 的 unit：`ExecStartPre=… -t -q`、`ExecReload=… -s reload`）與開機連結 |
| 行程 | 執行中時 master（root，`nginx: master process /usr/sbin/nginx -g daemon on; master_process on;`，PID 812 起第一個空的）與 worker（`user` 指令的使用者，數量是 `worker_processes`，`auto` = 機器的 CPU 數）；worker 繼承 master 的 socket（E10） |
| 已套用的設定 | `FsState.nginx.applied`：master **啟動或 reload 時**解析的結果（以 root 讀檔）。改了設定檔不會改變行為，要 `nginx -s reload`、`systemctl reload nginx` 或 `kill -HUP` master（worker 會換新的 PID）。監聽的 socket 來自已套用的 `listen`——從 `nginx` 這一階起取代「由程式宣告的固定 listen」；**`nginx` 以下（LNX10、LNX11、LNX15、SRV01–SRV03）的 nginx 仍是宣告 `listen` 的行程，行為不變** |
| 課程不能自己寫 | `listen.nginx`、`listen.ssl` 由引擎依設定產生；`nginx: true` 的機器開始時的設定必須通過 `nginx -t` |

### 12.2 設定的子集（照 nginx 的語法與訊息）

- **語法**：字詞以空白分隔、`;` 結束、`{ }` 是區塊、`#` 註解、單雙引號（`\"`、`\\`、`\n`、`\t` 照 nginx 的 tokenizer 處理）、`${var}`。`include`：相對路徑在 `/etc/nginx`，可以用 glob（依名稱排序，不含隱藏檔與資料夾）；`sites-enabled/*` 的連結指向已刪除的檔案時是 `open() … failed (2: No such file or directory) in /etc/nginx/nginx.conf:50`。
- **指令**（其他是 `unknown directive "x"`）：main：`user`、`worker_processes`、`pid`、`error_log`、`include`、`worker_rlimit_nofile`、`events`（必須有）、`http`；events：`worker_connections`、`multi_accept`、`use`；http／server／location：`root`、`alias`（location）、`index`、`try_files`、`return`、`rewrite`、`if`（只支援 `($var)`、`=`、`!=`、`~`、`~*`、`!~` 的條件，裡面只能有 `return`、`rewrite`）、`add_header`、`error_page`、`access_log`（`off` 或 `combined`）、`error_log`、`allow`／`deny`（`all` 或位址／CIDR）、`autoindex`、`default_type`、`types`、`keepalive_timeout`、`server_tokens`、`log_not_found`、`listen`（`位址:埠`、`default_server`、`ssl`；`[::]` 的 IPv6 接受但不建立 socket）、`server_name`（精確、`*.x`、`.x`、`x.*`、`~正規表示式`，具名擷取可當變數）、`location`（`=`、`^~`、`~`、`~*`、前綴、`@名稱`，可以巢狀）、`ssl_certificate`、`ssl_certificate_key`、`ssl_protocols` 等（接受）、`sendfile`、`gzip` 等效能指令（接受、沒有作用）。
- **訊息**（`nginx: [emerg] … in 檔案:行`）：`unknown directive`、`"x" directive is not allowed here`、`invalid number of arguments in "x" directive`、`unexpected "}"`、`unexpected end of file, expecting ";" or "}"`／`expecting "}"`、`directive "x" has no opening "{"`、`directive "x" is not terminated by ";"`、`"root" directive is duplicate`、`"alias" directive is duplicate, "root" directive was specified earlier`、`invalid port in "70000" of the "listen" directive`、`host not found in "x" of the "listen" directive`、`invalid parameter "x"`、`invalid value "x" in "sendfile" directive, it must be "on" or "off"`、`a duplicate default server for 0.0.0.0:80`、`duplicate location "/x"`、`unknown "x" variable`、`no "events" section in configuration`、`getpwnam("x") failed`、`open() "/var/log/x/a.log" failed (2: No such file or directory)`、`no "ssl_certificate" is defined for the "listen ... ssl" directive`、`cannot load certificate "x": BIO_new_file() failed (…)`、`SSL_CTX_use_PrivateKey("x") failed (… key values mismatch)`；警告 `nginx: [warn] conflicting server name "x" on 0.0.0.0:80, ignored`（測試仍成功）。
- **E15 的指令**：`proxy_pass`、`proxy_set_header`、`upstream`、`fastcgi_pass` 等。**選擇**：`nginx` profile 解析到時**測試失敗**，訊息 `nginx: [emerg] 模擬環境："proxy_pass" 是反向代理的設定，在引擎階段 E15 才模擬 in 檔案:行`——不假裝代理成功，也不默默忽略。`log_format`、`map`、`set` 同樣以 emerg 說明不支援。`proxy` profile 起照 §16 處理（這個拒絕只留在 `nginx` profile）。

### 12.3 `nginx` 指令

| 指令 | 行為 |
|---|---|
| `sudo nginx -t [-q]` | 標準錯誤：`nginx: the configuration file /etc/nginx/nginx.conf syntax is ok`、`nginx: configuration file /etc/nginx/nginx.conf test is successful`；失敗是 `nginx: [emerg] …` 與 `… test failed`（結束碼 1）。一般使用者（Ubuntu 的實際情形）：`nginx: [alert] could not open error log file: open() "/var/log/nginx/error.log" failed (13: Permission denied)`、`[warn] … the "user" directive makes sense only if the master process runs with super-user privileges`、syntax is ok、`[emerg] … open() "/run/nginx.pid" failed (13: Permission denied)`、test failed |
| `sudo nginx -T` | 測試之後把讀到的每個檔案依讀取順序印到標準輸出：`# configuration file 路徑:`、內容、空行 |
| `sudo nginx -s reload\|stop\|quit\|reopen` | reload 先解析設定，失敗時印 emerg、結束碼 1、**不送訊號**（舊設定繼續服務）；沒有 master：`nginx: [error] open() "/run/nginx.pid" failed (2: No such file or directory)`。stop／quit 讓 master 結束（systemd 看到服務停止） |
| `nginx -v`／`-V` | `nginx version: nginx/1.24.0 (Ubuntu)`（`-V` 另有 OpenSSL 與縮短的 configure 參數） |
| `sudo nginx` | 已在執行時是五輪 `bind() to 0.0.0.0:80 failed (98: Address already in use)` 與 `still could not bind()`；沒有執行時說明請用 systemctl 啟動 |

### 12.4 systemd 與 reload 的模型（和 E7 的 sshd、E11 的 named 相同的精神）

- `systemctl start nginx`：先做設定測試（`ExecStartPre=`）；失敗 → unit `failed`，journal 有 `nginx[PID]: nginx: [emerg] …`、`test failed`、`Control process exited, code=exited, status=1/FAILURE`、`Failed to start …`，指令印 `Job for nginx.service failed because the control process exited with error code.`。埠被別的程式占用或位址不是機器的：`bind() to 0.0.0.0:80 failed (98: Address already in use)`（五次）與 `still could not bind()`、或 `(99: Cannot assign requested address)`。
- `systemctl reload nginx`：設定測試失敗 → `Reload failed for …`、指令失敗，但**服務仍是 active、舊設定繼續服務**；成功 → 套用新設定、換新的 worker。master 收到 HUP 而新的 socket 綁不上時，在 error.log 記 emerg 並保留舊設定。
- `systemctl restart nginx`：先停止再啟動；新設定測試失敗時**網站中斷**（unit failed、80 埠沒有程式）——課程對照 reload 與 restart 的重點。

### 12.5 處理請求

- **選 server**：連線的位址與埠先找 `listen` 位址完全相同的 server，沒有才用 `0.0.0.0` 的；再依 Host（TLS 交握時依 SNI 選憑證）：精確名稱 → 最長的前置萬用字元（`*.example.com`）→ 最長的後置萬用字元（`mail.*`）→ 第一個符合的正規表示式 → 該位址與埠的 `default_server`（沒有時是第一個）。
- **選 location**（nginx 文件的順序）：`=` 完全相同就結束；記住最長的前綴，若它是 `^~` 就結束；否則依設定檔順序找第一個符合的正規表示式（`~` 分大小寫、`~*` 不分）；都沒有就用記住的前綴。巢狀 location 先在找到的前綴裡面找。URI 先解碼、合併 `//`、處理 `.` 與 `..`。
- **內容**：server 層的 `rewrite`／`return`／`if` 先執行，再到 location；`return 301 /x`（相對的 Location 依 Host 與埠補成絕對網址，排在 `Connection` 前面；絕對網址排在後面，和 nginx 相同）、`return 200 "文字"`（Content-Type 是 `default_type`，Ubuntu 是 `application/octet-stream`）；`try_files`（**不繼承**：location 自己的，或沒有 location 時 server 的；以 `/` 結尾的參數檢查目錄，所以 `/about` 是目錄時得到 301；最後一個參數是 `=404`、URI 或 `@名稱`）；`alias`（前綴換成 alias 的路徑）；`index`（找到檔案就內部轉向，可能換到另一個 location）；`error_page`（內部轉向一次）；`deny`。
- **檔案**：以 worker 的使用者（`user`，Ubuntu 是 www-data）的權限走訪與讀取：200（Content-Type 依 `mime.types`，否則 `default_type`）、資料夾沒有斜線 **301**（`Location: http://主機/路徑/`）、資料夾沒有 index 而 `autoindex off` **403**、讀不到或資料夾不能進入 **403**、不存在 **404**、GET／HEAD 以外的方法 405。`autoindex on` 列出名稱（沒有日期與大小：模擬的檔案系統沒有修改時間）。不送 `Last-Modified`、`ETag`、`Accept-Ranges`（同一個理由）。
- **標頭**：`Server: nginx/1.24.0 (Ubuntu)`（`server_tokens off` 時 `nginx`）、`Date`、`Content-Type`、`Content-Length`、`Location`、`Connection`（`keepalive_timeout 0` 時 close）、再接 `add_header`：**某一層只要有自己的 `add_header`，就完全取代上一層的**（nginx 的繼承規則）；只加在 200、201、204、206、301、302、303、304、307、308，`always` 才加在其他狀態。錯誤頁和 E12 相同（以 LF 換行；真實的 nginx 用 CRLF，所以真實的 Content-Length 多 7 位元組，例如 301 是 178 而模擬是 171——為了和已發布的 SRV03 一致而保留的已知差異）。
- **日誌**：每個請求在最後的 location 有效的 `access_log`（沒有時是 `/var/log/nginx/access.log`）寫一行 combined 格式：`10.0.0.10 - - [22/Nov/2026:10:00:00 +0000] "GET / HTTP/1.1" 200 14 "-" "curl/8.5.0"`（時間是機器的時區、位元組是本文）；錯誤寫到有效的 `error_log`：`2026/11/22 10:00:00 [error] 813#813: *3 open() "/srv/files/none.txt" failed (2: No such file or directory), client: 10.0.0.10, server: shop.example.com, request: "GET /files/none.txt HTTP/1.1", host: "shop.example.com"`，以及 `directory index of "…" is forbidden`、`(13: Permission denied)`、`access forbidden by rule`。**`try_files` 找不到檔案不寫錯誤日誌**（nginx 的行為），沒有 try_files 時寫 open() 失敗。`*N` 是 nginx 的連線序號（每個請求加一：模擬環境的每個 curl 指令都是新的連線）。用戶端位址：本機是目的位址（127.0.0.1 或自己的介面位址），從別台機器是它面向那個網段的介面位址。
- **TLS**：`listen 443 ssl` 的 server 需要 `ssl_certificate` 與相配的 `ssl_certificate_key`（啟動或 reload 時讀取，所以**更新了憑證檔要 reload 才會送出新的憑證**）；以 SNI 選 server 的憑證；`http://` 連到 TLS 埠是 400 `The plain HTTP request was sent to HTTPS port`。

### 12.6 `certbot --nginx`

nginx 必須在執行。驗證：名稱經權威 DNS 指向這台機器、80 埠是這個 nginx（nginx 外掛會暫時加上回應 token 的設定，所以不需要 webroot）。安裝：在 `server_name` 含這個名稱的 server 區塊（設定檔中的、經由 `sites-enabled` 的路徑）加上 `listen 443 ssl; # managed by Certbot`、`ssl_certificate`、`ssl_certificate_key`、`include /etc/letsencrypt/options-ssl-nginx.conf;`、`ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;`（兩個檔案第一次時建立），原本的 `listen 80` 移到新加的 redirect 區塊（`if ($host = 名稱) { return 301 https://$host$request_uri; }`、`return 404;`），然後 reload nginx。輸出 `Deploying certificate`、`Successfully deployed certificate for x to /etc/nginx/sites-enabled/x`、`Congratulations! You have successfully enabled HTTPS on https://x`。找不到 server 區塊：`Could not automatically find a matching server block for x. Set the \`server_name\` directive to use the Nginx installer.`。以 nginx 方式取得的憑證在 `renew` 之後自動 reload nginx。

## 13. E13–E14 的課程資料與檢查（`src/lib/terminal/web-lesson.ts`）

```ts
machines: [{ ..., profile: 'tls' | 'nginx',
  certificates?: [{ id, cn, sans?, org?, issuer?, notBefore?, notAfter?, days?, keyType?, ca?, serial?, path?, chain?: [id], key? }],   // tls 以上
  trust?: [id],                                                                                                             // tls 以上
  certbot?: { lifetime?: 90, timer?: true, account?: false, certificates?: [{ domains, webroot?, nginx?, issued, hook? }] },  // tls 以上
  processes: [{ ..., listen: [{ port, http, tls?: { certificate, key } }] }],                                               // tls 以上
  responders: [{ ..., routes: [{ path, root?: '/var/www/x' }] }],                                                         // tls 以上：由檔案回應（ACME 的 webroot）
  nginx?: true | 'stopped',                                                                                                // nginx 以上
  remotes: [{ ..., certificates?, trust?, certbot?, nginx? }] }]
```

| 規則 | 內容 |
|---|---|
| 憑證 | `id` 在整課（本機與所有遠端機器）唯一，不能是內建 CA 的 id；`issuer` 是同課的 CA（`ca: true`）或 `lets-encrypt-r11`／`isrg-root-x1`，不寫是自簽；不能成環。`notBefore` 預設 now 前 30 天，`notAfter` 預設 notBefore + `days`（預設 90 天，CA 3650 天）− 1 秒；`sans` 預設 `[cn]`（CA 沒有）；`keyType` 預設 `rsa2048`；`path` 寫入 PEM（後面接 `chain` 的憑證），`key` 寫入私鑰（root 0600），缺少的父資料夾自動建立；最多 12 張 |
| 信任與 certbot | `trust` 只能是同課的 CA；`certbot.lifetime` 1–3650 天；`certbot.certificates` 最多 4 個，`issued` 不晚於 now（產生 certbot 會留下的 archive／live／renewal 檔案，例如「快到期的憑證」） |
| 監聽與路由 | `listen.tls` 要有絕對路徑與 `http` 回應者，機器上要有那兩個檔案；`route.root` 是絕對路徑 |
| 產生的東西 | 信任庫、憑證檔、certbot 與 nginx 的檔案只在課程沒有列出時加入（和 §9 相同），驗證器檢查加入後的機器；`nginx: true` 的設定必須通過 `nginx -t`（`machine x: nginx: true needs a configuration that passes nginx -t: …`） |
| 遠端機器 | 同樣的欄位；其他機器的憑證可以當它的簽發者（引擎經由內部欄位 `issuers` 傳遞，課程不要寫） |

| 檢查 | 意義 |
|---|---|
| `{ kind: 'cert', path, host?, name?, issuer?, expiresAfter?, expiresBefore?, valid? }`（`tls` 以上） | 以 root 讀那個檔案的第一張憑證：涵蓋 `name`（SAN／萬用字元的規則）、簽發者的 CN、notAfter 晚於／早於某個 UTC 時間、`valid`：檔案中的鏈以那台機器的信任庫在 now 對這個名稱驗證成功（§11.2） |
| `{ kind: 'nginx', host?, test?, server?, root?, port?, ssl? }`（`nginx` 以上） | `test: true`／`false`：現在的設定檔（root）通過／無法通過 `nginx -t`；`server`：**執行中**（已套用）的設定有這個 `server_name` 的 server（`port` 時要有那個埠的 listen），`root` 是它服務 `/` 的根目錄，`ssl` 是否有 TLS。改了檔案而沒有 reload 不通過 |
| `http`（`tls` 以上接受 `https://`） | 和 curl 相同地驗證憑證鏈與名稱（失敗：`憑證驗證失敗：certificate has expired`）；nginx 由已套用的設定回答（檢查不寫日誌） |

## 14. E13–E14 的測試

| 檔案 | 內容 |
|---|---|
| `tests/terminal-e13.test.ts` | profile 的分界（`http` 拒絕 openssl／certbot、機器不多檔案、`curl https://` 仍是錯誤 35、資料欄位要 `tls`）、PEM 往返、金鑰相配、SHA-1 的測試向量、名稱比對、OpenSSL 的建鏈與錯誤碼（0、20+21、10 與兩次 notAfter、18、62）、`openssl x509` 的欄位順序與 `-checkend`、管線、錯誤訊息、`s_client` 的鏈與判定、`verify` 與 `-untrusted`／`-CAfile`、curl 的完整 `-v`、連線重用、錯誤 60（鏈不完整、過期、名稱）、`-k`、`--cacert` 與 `trust`、錯誤 35／52／77、certbot 的簽發與檔案、Let's Encrypt 的錯誤（NXDOMAIN、逾時、404）、權限與沒有安裝、更新的期間、`--dry-run`、`--force-renewal`、70 天後由 `certbot.service` 更新、timer、deploy hook、資料驗證、`cert` 與 https 的 `http` 檢查 |
| `tests/terminal-e14.test.ts` | profile 的分界與較低 profile 的 nginx 行程不變、Ubuntu 套件（預設網站、Welcome 頁、日誌、master 與 worker）、每一種解析錯誤與 file:line、斷掉的 sites-enabled 連結、日誌資料夾、使用者、events、一般使用者的 `nginx -t`、`-T`、nginx 文件的 location 例子（A–E）、正規表示式的順序、巢狀、執行中的伺服器、200／301／403／404／405、alias、deny、add_header 的繼承與 always、access／error log 的格式與時區、try_files 不寫錯誤日誌、server_name 的選擇、reload 才套用與新的 worker、reload 失敗保留舊設定、restart 失敗中斷、埠被占用、TLS 的設定錯誤、certbot --nginx、webroot 更新後要 reload 才送出新憑證、`kill -HUP`／`pkill -HUP`、資料驗證與 `nginx` 檢查 |
| `tests/terminal-e12.test.ts` | §8.3 的修正（取代預設標頭、`-o` 只對第一個網址、204） |
| `tests/support/web-fixture.ts` | 只供測試：cli-02 與 web-03（良好的鏈、缺中繼、過期、內部 CA 的回應者）、web-04（webroot 回應者與 certbot）、web-05（nginx、商店網站、權限、alias、certbot 帳號） |

`tests/terminal-e1.test.ts` 的 `PROFILES` 期望值加上 `tls`、`nginx`。LNX01–LNX15、SRV01–SRV03 與較低的 profile 逐字不變（全部的 `terminalContentProblems` 是空的）。

## 15. 仍不支援（之後的階段或文字說明）

IPv6 的連線與監聽（`[::]:80`；`ip` 只顯示核心自動加的 IPv6 位址；nginx 的 `listen [::]:80` 接受但不建立 socket）、`ss` 的 unix socket、狀態過濾（`state established`）、`-s`、`-e`、`%lo` 的介面標記、`lsof` 的檔案與 `-p`、`nc` 的資料傳送與監聽、UDP 的連線檢查、`ip` 的修改、`netstat`（請用 ss）、防火牆（E16 起，§17）、反向 DNS（PTR、`dig -x`）、DNSSEC、區域傳送與次要伺服器、委派的逐步查詢（CN12）、`resolvectl` 的其他子指令、`/etc/nsswitch.conf`、從遠端工作階段跨主機的連線與查詢、代理（E15 起，§16）、`curl` 的進度表與時間變數。E13–E14：真正的密碼學（簽章、金鑰交換）、DER、`openssl req`／`genrsa`／`s_server`、TLS 1.2 與 cipher 的協商、OCSP、CRL、憑證透明度、`update-ca-certificates`（課程以 `trust` 宣告信任）、DNS-01 與其他 certbot 外掛、HTTP/2（nginx 1.24 的 `listen … http2` 接受、仍說 HTTP/1.1）、`log_format`、`map`、`set`、完整的 `if`、`limit_req`、`gzip` 的實際壓縮、`Last-Modified`／`ETag`、Range、nginx 的 `stub_status`。

## 16. 引擎階段 E15：`proxy` profile（`src/lib/terminal/nginx.ts`、`proxy.ts`）

### 16.1 選用方式

| 項目 | 內容 |
|---|---|
| `PROXY_PROFILE` | `nginx` 的一切，**沒有新指令**；feature `proxy`。機器狀態的 `nginx.proxy` 讓設定解析器接受反向代理的指令；`nginx` profile 仍是 §12.2 的 E15 拒絕訊息（已發布的 SRV04–SRV06 不變） |
| 新的指令 | `proxy_pass`（location）、`proxy_set_header`、`proxy_http_version`（`1.0`／`1.1`，其他是 `invalid value "2.0" in "proxy_http_version" directive, it must be "1.0" or "1.1"`）、`proxy_connect_timeout`（最多 75 秒）、`proxy_read_timeout`、`proxy_send_timeout`（接受）、`proxy_redirect`（`default`、`off` 或兩個參數）、`proxy_next_upstream`（預設 `error timeout`）、`proxy_next_upstream_tries`、`proxy_intercept_errors`、`proxy_hide_header`、`proxy_pass_header`、`proxy_buffering` 等（接受）；`upstream` 區塊的 `server`（`weight=`、`max_fails=`、`fail_timeout=`、`backup`、`down`、`max_conns=` 接受）、`least_conn`、`ip_hash`、`keepalive`、`zone`；`map`（精確值、`~`／`~*` 正規表示式、`default`）。`fastcgi_pass` 等其他後端、upstream 的 `hash`／`random` 以 emerg 說明不支援；`log_format`、`set` 仍不支援 |
| 變數 | `$proxy_add_x_forwarded_for`、`$proxy_host`、`$proxy_port`、`$upstream_addr`（嘗試過的伺服器，以 `, ` 分隔）、`$upstream_status`、`$http_*`（例如 `$http_upgrade`）、map 定義的變數 |
| 設定錯誤 | `invalid URL prefix in "127.0.0.1:3000"`、`host not found in upstream "app.internal:3000"`（名稱在**載入設定時**以 IPv4、localhost、`/etc/hosts` 解析：課程的其他機器都在產生的 `/etc/hosts` 裡）、`"proxy_pass" cannot have URI part in location given by regular expression, or inside named location, …`、`upstream "backend" may not have port 8080`、`no servers are inside upstream`、`duplicate upstream "b"`、`invalid parameter "backup"`（ip_hash）、`invalid parameter "weight=0"`、`"proxy_read_timeout" directive invalid value`、`load balancing method redefined`（警告） |

### 16.2 送到後端的請求

- **URI**（nginx 文件的規則）：`proxy_pass` 沒有 URI 部分時原封不動傳出用戶端送來的 URI（含查詢字串、編碼）；有 URI 部分時把符合 location 前綴的部分換成它——`location /api/ { proxy_pass http://b/; }` 的 `/api/users` 變成 `/users`，`proxy_pass http://b/v1;` 則是 `/v1users`（少了斜線的常見錯誤）；`=` location 整個換掉。URI 被 `rewrite` 改過時傳改過的 URI。
- **標頭**（`ngx_http_proxy_init_headers` 的順序）：先 `proxy_set_header`（只繼承上一層沒有自己的時候，和 `add_header` 相同），再補預設的 `Host: $proxy_host`、`Connection: close`、POST 的 `Content-Length`，`Transfer-Encoding`、`TE`、`Keep-Alive`、`Expect`、`Upgrade` 預設是空的（不送）；值是空字串的標頭不送；最後是用戶端的其他標頭。請求行預設 `HTTP/1.0`。
- **後端看到的用戶端**：後端的 `$remote_addr` 是 nginx 的位址（同一台是 127.0.0.1），真正的用戶端只在 `X-Real-IP`／`X-Forwarded-For` 裡（`$proxy_add_x_forwarded_for` 把 `$remote_addr` 接在用戶端送來的 X-Forwarded-For 後面）。
- **回應**：狀態與本文照後端；nginx 換上自己的 `Server`、`Date`，丟掉 `Connection`、`Keep-Alive`、`Transfer-Encoding`、`X-Accel-*`（與 `proxy_hide_header`），保留 `Content-Type`、`Content-Length`（HEAD 也照後端的值）與其他標頭（`add_header` 接在後面）。`proxy_redirect default` 把 `Location` 的 `http://127.0.0.1:3000/` 換成 location 的前綴，相對位址再依 Host 補成絕對網址。後端自己的錯誤直接傳回（`proxy_intercept_errors on` 時才用 `error_page`）。
- **WebSocket**：`proxy_http_version 1.1` 加上 `proxy_set_header Upgrade $http_upgrade` 與 `Connection "upgrade"`（或文件的 `map $http_upgrade $connection_upgrade`）時，後端的 101 傳回用戶端：`HTTP/1.1 101 Switching Protocols`、`Server`、`Date`、`Connection: upgrade`、`Upgrade: websocket`、`Sec-WebSocket-Accept`（RFC 6455：key 加上 GUID 的 SHA-1 的 base64）。少了它們，後端收到 HTTP/1.0 而沒有 Upgrade，回 `426 Upgrade Required`。curl 印出 101 的標頭後結束（沒有鍵盤，不模擬之後的資料框）；`-N` 接受。

### 16.3 失敗與日誌

| 情況 | 狀態 | error.log（`*N … , client: …, server: …, request: "…", upstream: "http://位址:埠/URI", host: "…"`） |
|---|---|---|
| 後端拒絕連線 | 502 | `connect() failed (111: Connection refused) while connecting to upstream` |
| 位址沒有機器（或防火牆丟棄） | 504（等 `proxy_connect_timeout`） | `upstream timed out (110: Connection timed out) while connecting to upstream` |
| 後端比 `proxy_read_timeout` 慢 | 504 | `upstream timed out (110: Connection timed out) while reading response header from upstream` |
| 監聽的不是 HTTP（sshd、沒有回應者） | 502 | `upstream prematurely closed connection while reading response header from upstream` |
| `https://` 後端不是 TLS | 502 | `SSL_do_handshake() failed (SSL: error:0A00010B:SSL routines::wrong version number) while SSL handshaking to upstream` |
| 沒有可用的伺服器 | 502 | `no live upstreams while connecting to upstream`（upstream 是區塊的名稱） |

- 每次失敗的嘗試各寫一行；達到 `max_fails` 時的 `upstream server temporarily disabled …` 是 warn，Ubuntu 的 `error_log` 等級是 error，所以不寫（等級設成 warn 才看得到）。
- 回應者的 `delay`（秒）模擬慢的後端；回應的等待時間累計在 `Response.wait`，`curl -m N` 等不到時是 `curl: (28) Operation timed out after N000 milliseconds with 0 bytes received`（真實的毫秒數會多幾毫秒，模擬環境固定）。

### 16.4 upstream 的選擇（`proxy.ts`，nginx 1.24 的演算法）

- **round robin**：平滑加權輪詢（`current_weight += effective_weight`，選最大，它減去總和）；`weight=3` 與 1 的順序是 a a b a，5／1／1 是 a a b a c a a。狀態存在 `nginx.peers`（每個 upstream 一張表，**啟動與每次 reload 重設**，和 nginx 的新 worker 一樣）。模擬環境只有一份表（真實的 nginx 沒有 `zone` 時每個 worker 各有一份）。
- **least_conn**：比較「連線數 × 對方權重」，最少的；相同時在它們之間平滑輪詢。連線數來自課程資料 `upstreamConnections`（模擬環境的請求是瞬間的，不會增加連線數）。
- **ip_hash**：nginx 的公式：從 89 開始，對用戶端 IPv4 的前三個位元組 `hash = (hash × 113 + 位元組) mod 6271`，`hash mod 總權重` 依權重選；那台不能用（down、已失敗、這次試過）就繼續雜湊，最多 20 次後改用輪詢；不能有 `backup`。
- **被動健康檢查**：一次失敗 `fails + 1`、`effective_weight` 減 `weight / max_fails`；`fails` 達到 `max_fails`（預設 1，0 表示不判斷）就不再選它——真實的 nginx 在 `fail_timeout`（預設 10 秒）後再試，**模擬環境的時鐘不前進，所以到下次 reload 為止**。成功時歸零。只有一台伺服器時永遠不判斷為故障（nginx 的規則）。
- **重試與 backup**：`proxy_next_upstream`（預設 `error timeout`）的失敗換下一台（已送出請求的非冪等方法不重試，除非 `non_idempotent`）；主要的伺服器都不能用時才用 `backup`；`down` 永遠不用。`proxy_pass http://主機:埠` 是只有一台的隱含 upstream。
- **主動健康檢查**（nginx Plus 的 `health_check`）、HAProxy、L4（`stream` 模組）的負載平衡只在課文說明。

### 16.5 後端怎麼找到

nginx 所在的機器（本機或遠端）依 §17 的網路模型連到後端位址（防火牆、私有網段、通道都算）；後端是回應者或另一個 nginx（它的日誌也寫回那台機器，代理可以串接，最多 3 層）。回應者的路由新增 `echo: true`（本文是後端收到的請求：`remote_addr: 位址`、請求行、每個標頭，有內容時接在空行後）、`websocket: true`（§16.2）、`delay`（秒）；回應者本身也可以有 `delay`。

## 17. 引擎階段 E16：`firewall` profile（`src/lib/terminal/firewall.ts`）

### 17.1 選用方式與模型

| 項目 | 內容 |
|---|---|
| `FIREWALL_PROFILE` | `proxy` 的一切加上 `ufw`、`nft`（`E16_COMMANDS`）；feature `firewall`。`proxy` 以下是 `command not found`，機器沒有 `firewall` 狀態、也不多任何檔案 |
| 產生的檔案 | `/etc/ufw/applications.d/openssh-server`（`[OpenSSH]`）、有 nginx 的機器加 `/etc/ufw/applications.d/nginx`（`Nginx HTTP`、`Nginx HTTPS`、`Nginx Full`）、`/etc/nftables.conf`（Ubuntu 的預設：flush ruleset 與空的 inet filter 表） |
| 狀態 | `FsState.firewall`：ufw（是否啟用、預設的連入／連出原則、logging、規則；IPv4 與 IPv6 的規則分開存，和 ufw 的 user.rules／user6.rules 相同）與核心裡的 nftables 規則集。**簡化**：不寫 `/etc/ufw/user.rules`；`ufw.service`、`nftables.service` 不模擬（請用 `sudo nft -f /etc/nftables.conf`） |
| 判斷 | ufw 的規則**編譯成 CN 的規則模型**（`src/lib/network/firewall.ts`）並用 `decidePacket` 判斷：先是 ufw 的 before 規則（lo、`established` 一律放行），再依序是使用者的規則（第一條符合的決定），最後是預設原則；REJECT 記在 CN 規則旁邊（CN 只有 allow／deny）。nft 的 input 鏈（inet 與 ip 表、依 priority）逐條比對：`ct state`、`iif`／`iifname`、`ip saddr`／`daddr`（位址、CIDR、`{ }` 集合）、`tcp`／`udp dport`（埠、範圍、集合）、`meta l4proto`、`counter`、`log`，判決 `accept`、`drop`、`reject`；沒有判決時用鏈的 policy。每一條 input 基礎鏈都要放行；output 鏈與 ufw 的連出原則用在這台機器自己發出的新連線 |
| 連線的結果 | §6.2 的連線模型加上兩道關卡：來源的 output、目的的 input。**丟棄 → 逾時**（`nc` 的 `Connection timed out`、`curl` 的 7／28、`ssh: connect to host … port 22: Connection timed out`）、**REJECT → 拒絕**（`Connection refused`）。連到自己（含自己的介面位址）走 lo：ufw 一律放行，nft 的 `policy drop` 沒有 `iif lo accept` 時連 127.0.0.1 也會逾時（真實的行為） |
| 遠端工作階段 | 從 `firewall` 起，ssh 的工作階段與遠端指令在「從那台機器看出去的網路」裡執行（`viewFrom`：同一組機器，原本的本機變成其中一台），所以可以在 office 上 `nc -zv srv-01 22`、`curl http://srv-01/` 測試防火牆；遠端機器的 `/etc/hosts` 也列出課程的其他機器。`firewall` 以下不變（遠端只連得到自己）。在遠端仍不能再 ssh 到別台（E17 用 `-J`） |
| 雲端的安全群組 | 只在課文說明 |

### 17.2 `ufw`（ufw 0.36.2）

| 指令 | 行為與格式 |
|---|---|
| 權限 | 非 root：`ERROR: You need to be root to run this script`（`ufw version`、`--help` 除外） |
| `status [verbose\|numbered]` | 停用時 `Status: inactive`。啟用時 `Status: active`、空行、`To`（26 欄）`Action`（12 欄）`From` 的標題與 `--` 行、每條規則、空行；IPv4 的規則在前、`(v6)` 的在後。`verbose` 多 `Logging: on (low)`、`Default: deny (incoming), allow (outgoing), disabled (routed)`、`New profiles: skip`，動作寫成 `ALLOW IN`；`numbered` 每行前面 `[ 1] `、標題縮排 5 格。位置的寫法：`22/tcp`、`80,443/tcp`、`OpenSSH`、`Nginx Full`、`Anywhere`、`10.0.0.10 22/tcp`、`22/tcp on eth1`，來源 `Anywhere`、`10.0.0.0/24`；有 comment 時 `# 註解` |
| `allow\|deny\|reject\|limit [in\|out] [on 介面] 規則 [comment '…']` | 簡單寫法：`22`（tcp 與 udp）、`22/tcp`、`6000:6007/tcp`、`80,443/tcp`、服務名稱（`ssh` 依 `/etc/services`）、應用程式（`OpenSSH`、`'Nginx Full'`）；完整寫法：`[proto tcp\|udp] [from 位址 [port N]] [to 位址 [port N\|app 名稱]]`。輸出 `Rules updated` 與 `Rules updated (v6)`（指定了 IPv4 位址的規則沒有 v6）、已存在 `Skipping adding existing rule`、只改動作 `Rule updated`。錯誤：`ERROR: Bad port`、`ERROR: Must specify 'tcp' or 'udp' with multiple ports`、`ERROR: Bad source address`、`ERROR: Bad destination address`、`ERROR: Could not find a profile matching 'x'`、`ERROR: Unsupported protocol`、`ERROR: Invalid syntax`。`limit` 是放行（30 秒 6 次的頻率限制只在課文說明：模擬環境的連線是瞬間的） |
| `insert N 規則`、`prepend 規則` | `Rule inserted`；N 超過規則數 `ERROR: Invalid position 'N'` |
| `delete N`、`delete 規則` | 依編號刪除要先確認：`Deleting:`、` allow 80/tcp`、`Proceed with operation (y|n)? `；沒有鍵盤時說明並 `Aborted`，`--force` 或 `echo y \|` 回答。依規則刪除不必確認（IPv4 與 v6 各一行 `Rule deleted`）；不存在 `Could not delete non-existent rule` |
| `default allow\|deny\|reject [incoming\|outgoing\|routed]` | `Default incoming policy changed to 'deny'` 與 `(be sure to update your rules accordingly)` |
| `enable`、`disable`、`reload`、`reset` | `Firewall is active and enabled on system startup`、`Firewall stopped and disabled on system startup`、`Firewall reloaded`（停用時 `Firewall not enabled (skipping reload)`）。**在 SSH 工作階段（或 ssh 的遠端指令）中** enable 會先問 `Command may disrupt existing ssh connections. Proceed with operation (y|n)? `（ufw 檢查父行程有沒有 sshd）：沒有鍵盤時說明並 `Aborted`；`--force` 或 `echo y \| sudo ufw enable` 繼續 |
| `logging on\|off\|low\|…`、`show added`、`app list`、`app info 名稱`、`version` | `Logging enabled`；`Added user rules (see 'ufw status' for running firewall):` 與每條 `ufw allow 22/tcp`（停用時也看得到）；`Available applications:` 與兩格縮排的名稱；`Profile:`、`Title:`、`Description:`、`Port:`／`Ports:` |

### 17.3 `nft`（nftables 1.0.9 的子集）

| 指令 | 行為與格式 |
|---|---|
| `nft [-a] list ruleset`、`list tables`、`list table F T`、`list chain F T C` | nft 的版面（Tab 縮排）：`table inet filter {`、`\tchain input {`、`\t\ttype filter hook input priority filter; policy drop;`（priority 0 印成 `filter`）、每條規則（`ct state established,related accept`、`iif "lo" accept`、`ip saddr 10.0.0.0/24 tcp dport { 22, 80 } accept`、`counter packets 0 bytes 0`）、`\t}`、`}`；`-a` 在表、鏈、規則後加 `# handle N`（每個表自己編號）。ufw 啟用時另在標準錯誤說明 ufw 的規則（iptables-nft 產生）不列出 |
| `add\|create table [F] T`、`delete table`、`add chain [F] T C '{ type filter hook input priority 0; policy drop; }'`、`add rule [F] T C 敘述`、`insert rule …`（`position N`）、`delete rule F T C handle N`、`flush chain`、`flush ruleset` | 家族預設 ip；錯誤是 `Error: …`（`Error: Could not process rule: No such file or directory`、`Error: syntax error, unexpected x`；nft 畫在指令下方的 `^^^` 不印） |
| `nft -f 檔案`、`-c -f`（只檢查） | 讀 nft 的檔案語法（`flush ruleset`、`table … { chain … { type …; policy …; 規則 } }`，換行結束一個敘述），一次套用 |
| 權限 | 非 root：`Error: Could not process rule: Operation not permitted` |
| 不支援 | `jump`／`goto`（說明）、具名 set／map、`ip6` 的判斷、prerouting／forward 的判斷（接受、列出，不影響連線） |

### 17.4 狀態追蹤與「不要把自己鎖在外面」

- 開著的 SSH 工作階段是已建立的連線：ufw 的 before 規則一律放行 `established`，所以 `ufw enable` 之後工作階段繼續，但**新的** ssh 在沒有允許 22（或 OpenSSH）時逾時——典型的鎖在外面。
- nft 沒有 `ct state established,related accept` 而 input 的 policy 是 drop（或有規則丟棄這個工作階段的封包）時，下一行輸入送不到：模擬環境結束工作階段，印說明與 `client_loop: send disconnect: Broken pipe`（真實的終端機會停住到 TCP 重送逾時），本機的 `$?` 是 255。

## 18. 引擎階段 E17：`tunnels` profile（`src/lib/terminal/ssh.ts`）

### 18.1 選用方式與網路

| 項目 | 內容 |
|---|---|
| `TUNNELS_PROFILE` | `firewall` 的一切，**沒有新指令**；feature `tunnels`：ssh 的 `-L`、`-R`、`-J`、`-F`、`-f`、`-N`、`-g` 與 `-o ProxyJump=…`／`LocalForward`／`RemoteForward`，以及 `~/.ssh/config`。以下的 profile 不變：`-L` 是 `ssh: unknown option -- L`，`~/.ssh/config` 不讀（E7 的限制，LNX0 §15） |
| 私有網段 | 遠端機器的 `reachableFrom: ['bastion']`：只有這些機器（主機名稱；本機用它的 host）能連到它，其他的逾時（沒有路由；不靠防火牆）。跳板機通常有兩個介面（公開與私有） |
| sshd 的設定 | `AllowTcpForwarding`（yes、all、local、remote、no）與 `GatewayPorts`（no、yes、clientspecified）從 E7 的「接受但不模擬」改成真的讀取（值不對是 `unsupported option`）；`sshd -T` 的輸出不變 |

### 18.2 `-J` 與 ProxyJump

- `ssh -J [使用者@]跳板機[:埠][,下一個] [使用者@]目的主機 [指令]`：先登入跳板機（它自己的 `~/.ssh/config` 設定、它自己的 ProxyJump，最多 4 層），跳板機的 sshd 要允許 TCP 轉送，再由跳板機**解析名稱並連線**到目的主機的 22 埠（跳板機的防火牆、私有網段都算），最後以**本機的金鑰與 known_hosts** 登入目的主機（known_hosts 記的是目的主機的名稱）。和 OpenSSH 相同，**跳板機不沿用命令列的 `-o`**（例如 StrictHostKeyChecking）：先把跳板機加進 known_hosts，或在 `~/.ssh/config` 設定。
- 失敗（OpenSSH 的訊息）：`channel 0: open failed: connect failed: Name or service not known`（或 `Connection timed out`、`Connection refused`）、`stdio forwarding failed`、`Connection closed by UNKNOWN port 65535`；跳板機不允許轉送：`channel 0: open failed: administratively prohibited: open failed` 與後兩行。結束碼 255。
- 互動式工作階段的提示字元是目的主機，`exit` 印 `Connection to db-01 closed.`；sshd 的 journal 記錄的來源是跳板機的位址。

### 18.3 `~/.ssh/config`

- 讀 `~/.ssh/config`（或 `-F 檔案`，讀不到是 `Can't open user config file x: No such file or directory`）；檔案不是自己（或 root）的、或群組／其他人可寫：`Bad owner or permissions on /home/learner/.ssh/config`（結束碼 255）。
- `Host 樣式…`（`*`、`?`、`!否定`）區塊依序比對，**同一個設定第一個出現的值生效**（所以 `Host *` 放最後），命令列的選項優先；`IdentityFile`、`LocalForward`、`RemoteForward` 累加。支援 `HostName`（`%h`）、`User`、`Port`、`IdentityFile`（`~`）、`ProxyJump`（`none` 取消）、`LocalForward`、`RemoteForward`、`StrictHostKeyChecking`、`PasswordAuthentication`、`PubkeyAuthentication`、`BatchMode`、`LogLevel`、`GatewayPorts`，以及接受而沒有作用的 `ServerAliveInterval`、`ForwardAgent` 等；`Match`、`Include` 略過。其他關鍵字：`… line N: Bad configuration option: x` 與 `… terminating, N bad configuration options`。
- `HostName` 換掉名稱之後，known_hosts、密碼提示與 `Connection to … closed.` 用的都是 HostName（OpenSSH 的行為）。
- 課程資料 `sshConfig`（本機）產生 `~/.ssh/config`（0600，`~/.ssh` 0700）。

### 18.4 `-L`、`-R`、`-f`、`-N`

| 項目 | 行為 |
|---|---|
| `-L [位址:]本機埠:主機:埠` | 在本機監聽 127.0.0.1（`-g` 或位址 `*`／`0.0.0.0` 時所有位址）；連線由 **SSH 伺服器那一端**解析主機並連過去（`-L 9090:127.0.0.1:8080 db-01` 是 db-01 自己的 127.0.0.1）。埠被占用：`bind [127.0.0.1]:8080: Address already in use`、`channel_setup_fwd_listener_tcpip: cannot listen to port: 8080`、`Could not request local forwarding.`（ssh 繼續）；1024 以下而不是 root：同樣三行，原因 `Permission denied` |
| `-R [位址:]遠端埠:主機:埠` | 在伺服器監聽（`GatewayPorts no` 時一律 127.0.0.1，`yes` 時所有位址，`clientspecified` 時依指定的位址），由 sshd（`sshd: 使用者` 行程）持有；連線回到用戶端這一端解析主機。不允許（`AllowTcpForwarding no`／`local`）、埠被占用或 1024 以下而不是 root：`Warning: remote port forwarding failed for listen port 9000` |
| `-f -N` | 登入之後在背景執行（本機的 `ssh -f -N …` 行程，持有 `-L` 的監聽 socket：`ss -tlnp` 是 `users:(("ssh",pid=…,fd=4))`）；`kill`／`pkill` 結束它，監聽就關閉，它在伺服器上的 `-R` 監聽也一起關閉。**`-N` 沒有 `-f`**：說明它會佔住終端機（模擬環境沒有 Ctrl-C），請加 `-f`；`-f` 沒有 `-N` 也沒有指令：`Cannot fork into background without a command to execute.`。互動式工作階段的 `-R` 在 `exit` 時關閉；遠端指令的 `-R` 在指令結束時關閉；互動式工作階段的 `-L` 不建立（工作階段在遠端，本機無法同時使用它） |
| 通道的連線 | `curl`、`nc` 連到通道的埠時，對方那一端依 §17 的網路連線：成功就是目的地的服務；失敗時 ssh（在背景）印 `channel 2: open failed: connect failed: Connection refused`（`Connection timed out`、`Name or service not known`；不允許轉送是 `administratively prohibited: open failed`），而 `curl` 得到 `(52) Empty reply from server`——`nc -z` 仍是成功（本機的 ssh 接受了連線，和真實的情形相同） |
| 不模擬 | ssh 連線本身在 `ss -tan` 的 ESTAB 列、IPv6 的 `[::1]` 監聽、動態轉送（`-D`、SOCKS）、`-W`、agent 轉送、`ExitOnForwardFailure` 的效果、`&` 把 ssh 放到背景（請用 `-f`） |

## 19. E15–E17 的課程資料與檢查（`src/lib/terminal/net-lesson.ts`）

```ts
machines: [{ ..., profile: 'proxy' | 'firewall' | 'tunnels',
  upstreamConnections?: [{ upstream: 'backend', server: '10.0.0.21:8080', connections: 12 }],   // proxy 以上
  responders: [{ ..., delay?: 秒, routes: [{ ..., echo?: true, websocket?: true, delay?: 秒 }] }],  // proxy 以上
  firewall?: { enabled?: true, incoming?: 'deny', outgoing?: 'allow', rules?: ['allow OpenSSH', "allow 'Nginx Full'"], nftables?: 'table inet filter { … }' },  // firewall 以上
  sshConfig?: 'Host bastion\n  HostName …',                                                     // tunnels 以上（本機）
  remotes: [{ ..., upstreamConnections?, firewall?, reachableFrom?: ['bastion'] }] }]            // reachableFrom：tunnels 以上
```

| 規則 | 內容 |
|---|---|
| 各自的 profile | `upstreamConnections` 與回應者的 `echo`、`websocket`、`delay` 需要 `proxy`；`firewall` 需要 `firewall`；`reachableFrom`、`sshConfig` 需要 `tunnels`（遠端機器同樣檢查，訊息前綴 `remote 名稱:`） |
| 內容 | 最多 24 筆連線數（伺服器 `a.b.c.d:埠`、0–100000）；delay 0–3600 秒；echo 與 websocket 是 true 且二選一；ufw 規則最多 30 條、每條以 allow／deny／reject／limit 開頭並能被 ufw 解析（錯誤照 ufw 的訊息）；`nftables` 要能載入；原則是 allow、deny、reject；`reachableFrom` 是課程的其他機器；`sshConfig` 最多 4000 字 |
| 產生的東西 | §17.1 的檔案、`~/.ssh/config`（課程沒有列出時）；遠端機器從 `firewall` 起的 `/etc/hosts` 列出課程的其他機器（引擎經由內部欄位 `peers` 傳遞，課程不要寫） |

| 檢查 | 意義 |
|---|---|
| `{ kind: 'reach', from?, to, port, proto?: 'tcp', result: 'succeeded' \| 'refused' \| 'timeout' }`（`firewall` 以上） | 從 `from`（預設練習的機器；也可以是遠端機器）連到 `to`（機器名稱或 IPv4，在 from 上以 `/etc/hosts` 與課程的名稱解析）的埠：防火牆、私有網段、通道都算 |
| `{ kind: 'firewall', host?, enabled?, incoming?, outgoing?, rule?, absent?, nftPolicy?, nftRule? }`（`firewall` 以上） | ufw 是否啟用、預設原則、`rule`（ufw 的寫法，例如 `allow from 10.0.0.0/24 to any port 22 proto tcp`，比對解析後的 IPv4 規則）存在（`absent`：不存在）；nft 的 input 鏈原則與規則文字（`nft list ruleset` 的寫法） |
| `{ kind: 'tunnel', port, host?, target: '主機:埠', address?, works? }`（`tunnels` 以上） | 那個埠是 SSH 通道的監聽，轉送到 target（target 從通道的另一端解析，和 ssh 相同）；`works`：連得過去（沒有 channel 錯誤） |
| `http` 的 `host`（`firewall` 以上） | 從那台機器經由網路送出（防火牆、私有網段、通道都算）；以下不變 |

## 20. 同批的修正（SRV-3；從指令所在的 profile 起）

| 修正 | 內容 |
|---|---|
| `certbot --nginx` 多個 `-d` | 同一個 server 區塊的名稱只加一次 TLS 的設定、共用一個 redirect 區塊：每個名稱一段 `if ($host = …)`（certbot 每次加在最上面，所以最後一個名稱在前），`server_name` 是全部的名稱。之前第二個名稱會再插入一次（`listen 443 ssl` 重複）並多一個 redirect 區塊 |
| `certbot.service`／timer 觸發的更新 | deploy hook 做的事保留下來（服務的腳本結果整個採用：`systemctl reload nginx` 的 journal、nginx 套用的設定）；之前只保留了檔案，nginx 繼續送舊的憑證 |
| `certbot renew --deploy-hook X` | 執行 X 並存成 renewal 設定的 `renew_hook`（只有真正更新時；`--dry-run` 印 `Dry run: skipping deploy hook command: X`）；之前被忽略 |
| `/etc/letsencrypt/renewal-hooks/deploy/*` | `renew` 更新之後依名稱執行可執行的檔案（`~` 結尾的略過），在 `renew_hook` 之前；同一個指令不重複執行 |
| `certonly` 遇到到期的同名憑證 | 印 `Renewing an existing certificate for x`（`--dry-run`：`Simulating renewal of an existing certificate for x`）；之前印 Requesting |
| 簽章演算法 | 伺服器只送葉憑證、簽發者也不在信任庫時，由內建 CA 的名稱找簽發者的金鑰（R11 是 RSA：`sigalg: RSA-SHA256`、curl 的 `signed using sha256WithRSAEncryption`）；之前誤用葉憑證自己的金鑰 |
| `dig a b` | 每個名稱都查（名稱後面的類型只用在它），`+short` 依序印出；完整版面時 `; <<>> DiG` 標頭只印一次 |
| `grep -o`、`-A`／`-B`／`-C N` | 每個符合的部分一行（可配合 `-n`、`-i`、`-w`、`-E`；`-v` 不印）；上下文行用 `-` 分隔行號與檔名、不相連的群組之間 `--`；`invalid context length argument` |
| `tr -c`／`-C`、`-cd` | 集合 1 的補集：刪除，或轉換成集合 2 的最後一個字元（GNU 依補集排序對應集合 2，集合 2 較短時以最後一個字元補齊；模擬環境一律用最後一個字元） |
| `pgrep -c`、`ps -C 名稱` | 符合的數目（沒有時印 0、結束碼 1）；依行程名稱（comm）選擇 |
| `sed` | **沒有做**：加入新的指令會改變已發布課程 `command not found` 訊息裡的指令清單 |

已發布的課程（LNX01–LNX15、SRV01–SRV06）沒有用到上述寫法，**沒有任何已發布的輸出改變**（全部的 `terminalContentProblems` 仍是空的）；`grep`、`tr`、`ps`、`pgrep` 的說明頁與 `help` 也不變。

## 21. E15–E17 的測試

| 檔案 | 內容 |
|---|---|
| `tests/terminal-e15.test.ts` | profile 的分界（`nginx` 仍拒絕、資料欄位要 `proxy`）、URI 規則（沒有 URI、`/`、少了斜線、`=`）、送到後端的標頭與順序、X-Forwarded-For 的累加、proxy_redirect 與 HEAD 的 Content-Length、WebSocket（RFC 6455 的範例值、101、426、map）、502／504 與 error.log／access.log、連線逾時、不是 HTTP、curl -m、round robin 的加權順序、least_conn、ip_hash 的公式與 down 時的重新雜湊、重試、max_fails、backup、reload 重設、no live upstreams、設定錯誤、載入時解析名稱、資料驗證與經由代理的 `http` 檢查 |
| `tests/terminal-e16.test.ts` | profile 的分界、產生的檔案、ufw 的每種輸出與錯誤、依編號刪除的確認、insert、show added、丟棄／拒絕／來源限制／lo、CN 模型的判斷、連出原則、遠端工作階段的網路、ssh 工作階段中 enable 的確認與鎖在外面、先允許 OpenSSH、nft 的列表與 handle、input 鏈的判斷、沒有 ct state 時工作階段中斷、nft -f／-c、資料驗證與 `reach`、`firewall`、經由防火牆的 `http` 檢查 |
| `tests/terminal-e17.test.ts` | profile 的分界（`-L` 不是選項、config 不讀）、私有網段、`-J` 與它的錯誤、跳板機的 AllowTcpForwarding、`~/.ssh/config`（Host 區塊、第一個值、權限、未知的設定、`-F`）、`-L`（監聽的持有者、對方那一端解析、channel 錯誤、kill、埠被占用、特權埠、`-N`／`-f`、`-g`、LocalForward）、`-R`（sshd 持有、回到本機、GatewayPorts、AllowTcpForwarding）、資料驗證與 `tunnel` 檢查 |
| `tests/terminal-srv3-fixes.test.ts` | §20 的每個修正 |
| `tests/support/edge-fixture.ts` | 只供測試：web-06（反向代理、本機的應用程式與三台後端）、laptop／srv-01／office（防火牆）、laptop／bastion／db-01（通道） |

`tests/terminal-e1.test.ts` 的 `PROFILES` 期望值加上 `proxy`、`firewall`、`tunnels`。

## 22. E15–E17 仍不支援

（`edge` 起，`proxy_cache` 與 fail_timeout 經過後的再試已經支援，見 §23；以下是 `tunnels` 以下的情形。）

nginx：`log_format`、`set`、`if` 裡的 `proxy_pass`、同一個 location 的 `try_files` 與 `proxy_pass`（請用 `try_files $uri @app` 與具名 location）、`proxy_pass` 的變數與 unix socket、`proxy_cache`、`stream`（L4）、upstream 的 `hash`、`random`、`sticky`、`slow_start`、主動健康檢查（nginx Plus）、fail_timeout 經過後的再試（時鐘不前進）、keepalive 連線的重用細節、真實的 WebSocket 資料框。防火牆：`ufw route`、limit 的頻率、`/etc/ufw/*.rules` 檔案、`ufw.service`／`nftables.service`、IPv6 的判斷、UDP 的連線檢查、nft 的 jump、set、map、NAT、prerouting／forward 的判斷、`iptables` 指令（請用 ufw 或 nft）、雲端的安全群組。通道：`-D`（SOCKS）、`-W`、agent 轉送、在遠端工作階段中再 ssh（請用 `-J`）、`&` 背景執行 ssh、ssh 連線本身的 socket 列、互動式工作階段的 `-L`、HAProxy。

## 23. 引擎階段 E18：`edge` profile（`src/lib/terminal/cache.ts`、`nginx.ts`、`http.ts`）

### 23.1 選用方式

| 項目 | 內容 |
|---|---|
| `EDGE_PROFILE` | `tunnels` 的一切，**沒有新指令**；feature `edge`。機器狀態的 `nginx.edge` 讓設定解析器接受快取的指令，`http.edge` 讓回應者有驗證器、條件式請求、CDN 與清除 API。`tunnels` 以下全部不變：`proxy_cache_path` 仍是 E15 的 `unknown directive`、`expires`／`etag` 仍然接受而沒有作用、`sleep` 立即結束、`curl -w '%{time_total}'` 仍印說明 |

### 23.2 時間：`sleep`

- **選擇**：從 `edge` 起，`sleep N`（GNU 的寫法：多個運算元相加，`s`／`m`／`h`／`d` 後綴、小數）讓**課程的每一台機器**的模擬時鐘一起前進 N 秒；一次最多 366 天（`sleep：模擬環境一次最多前進 366 天`）。在 ssh 的工作階段裡也一樣（遠端看到的網路是同一組機器）。這是唯一讓時間前進的方式：快取過期、`Age` 增加、`date`、日誌與 `Date` 標頭跟著改變。
- `sleep 300 &` 仍然只是背景工作，不會讓時間前進，背景的 sleep 也不會因為時間前進而結束；cron 與 systemd timer 不會因為時間前進而自動執行（仍用 `cron-run`）。
- **檔案的修改時間**：`FsNode.mtime`（只有 `edge` 起才設定）。課程可以宣告 `files[].mtime`，沒有寫時是開機時間；指令改變了檔案內容時，那一行執行完時的時間就是它的 mtime；`touch` 一個已存在的檔案也設成現在。nginx 的 `Last-Modified` 與 `ETag` 由它算出。
- **`fail_timeout`**：時鐘會前進之後，nginx 的被動健康檢查照 nginx 的規則運作——`max_fails` 次失敗的伺服器在 `fail_timeout` 之後重新可以選擇（它的 effective_weight 從失敗時降低的值慢慢回升，所以平滑輪詢不一定立刻選它）。`proxy` profile 的 E15 行為不變（到下次 reload 為止）。

### 23.3 nginx 的 `proxy_cache`

| 指令 | 內容 |
|---|---|
| `proxy_cache_path 路徑 [levels=1:2] keys_zone=名稱:大小 [inactive=10m] [max_size=…] [use_temp_path=off]…` | http 層。路徑的上一層必須存在（否則 `mkdir() "…" failed (2: No such file or directory)`），nginx 啟動或 reload 時建立資料夾（worker 的使用者，0700）。錯誤：`invalid "levels" "1:3"`、`"proxy_cache_path" must have "keys_zone" parameter`、`invalid parameter "x"`、`duplicate zone "x"`。`max_size` 接受、只受模擬環境的節點數限制 |
| `proxy_cache 名稱\|off`、`proxy_cache_key`（預設 `$scheme$proxy_host$request_uri`）、`proxy_cache_valid [代碼…\|any] 時間`（只寫時間是 200 301 302）、`proxy_cache_methods`、`proxy_cache_min_uses`、`proxy_cache_bypass`、`proxy_no_cache`、`proxy_cache_use_stale`（error timeout updating http_5xx…）、`proxy_cache_background_update`、`proxy_cache_revalidate`、`proxy_cache_lock`（接受，見下）、`proxy_ignore_headers`、`if_modified_since` | `"proxy_cache" zone "x" is unknown`（行號是 proxy_cache 那一行）、`invalid time value "ten" in "proxy_cache_valid" directive` |
| `$upstream_cache_status` | MISS、HIT、EXPIRED、BYPASS、STALE、UPDATING、REVALIDATED；沒有經過快取時是空字串。通常用 `add_header X-Cache-Status $upstream_cache_status always;` 看 |

- **能不能存**（nginx 的順序）：`X-Accel-Expires` → `Cache-Control` 的 `no-store`／`no-cache`／`private`（不存）、`s-maxage` 優先於 `max-age`（0 不存）→ `Expires − Date` → `proxy_cache_valid`；`Set-Cookie` 與 `Vary: *` 不存；`proxy_ignore_headers` 可以忽略其中幾個。`Vary` 依請求標頭分成不同的變體。
- **查詢**：新鮮 → HIT（不連上游，`$upstream_addr` 是空的）；過期 → EXPIRED（連上游、存新的）；`proxy_cache_bypass` 的值非空且不是 0 → BYPASS（仍可能存下）；上游失敗而 `proxy_cache_use_stale` 有那一種失敗、又有過期的副本 → STALE；`proxy_cache_background_update on` 加 `use_stale updating` → 立刻回過期的副本（STALE），背景的請求在「上游花的時間」之後才完成，這段期間的請求是 UPDATING；`proxy_cache_revalidate on` 帶 `If-None-Match`／`If-Modified-Since` 問上游，304 → REVALIDATED。有快取時 nginx 不把用戶端的條件式與 Range 標頭送給上游，HEAD 以 GET 取得。
- **`proxy_cache_lock`**：接受，但沒有可見的效果——模擬環境的請求一個接一個完成，唯一「同時」的請求是背景更新。
- **快取檔**：`路徑/c/29/<key 的 MD5>`（levels=1:2 取 MD5 的最後 1 字與再前 2 字；純 JS 的 MD5），worker 的使用者，0600，資料夾 0700。**內容是文字**：`KEY: 鍵`、上游的狀態行、標頭、空行、本文（真實的檔案有二進位的檔頭），所以 `sudo grep -r "KEY:" /var/cache/nginx` 可以找到網址對應的檔案。
- **清除**（purge）：開源版的 nginx 沒有清除指令，做法是刪掉快取檔——檔案不見的項目下次是 MISS。**注意**：`sudo rm -rf /var/cache/nginx/app/*` 的 `*` 由學習者自己的 Shell 展開，而一般使用者讀不到 0700 的資料夾，所以什麼都沒刪（真實的伺服器也一樣）；要寫成 `sudo bash -c 'rm -rf /var/cache/nginx/app/*'`。`inactive` 時間內沒有被用到的項目由 cache manager 刪除（模擬環境在下一個請求時檢查）。

### 23.4 `expires` 與靜態檔的驗證器

- `expires 時間|-1|0|epoch|max|off|modified 時間`（`edge` 起才有作用；`nginx`／`proxy` profile 仍然接受而不檢查）：`Expires` 與 `Cache-Control: max-age=N`（負數或過去的時間是 `no-cache`、`epoch` 是 1970 年與 `no-cache`、`max` 是 2037 年與 `max-age=315360000`）；只加在 200、201、204、206、301、302、303、304、307、308（和沒有 `always` 的 `add_header` 相同），並取代上游的 `Expires`、`Cache-Control`。`add_header Cache-Control "…" always` 照 E14 的規則。錯誤：`invalid value "soon"`。
- 靜態檔的 200 從 `edge` 起有 `Last-Modified`（Content-Length 之後）、`ETag: "mtime 的十六進位-大小的十六進位"`（Connection 之後；`etag off` 不送）與最後的 `Accept-Ranges: bytes`。nginx 的標頭順序：Server、Date、Content-Type、Content-Length、Last-Modified、Location、Connection、ETag、Expires、Cache-Control、add_header、Accept-Ranges。
- **條件式請求**（nginx 的 not_modified filter）：`If-None-Match`（弱比較，`*` 也算）與 `If-Modified-Since` 每一個都要成立才是 304；`if_modified_since exact`（預設）要時間完全相同，`before` 是不晚於，`off` 不看。304 沒有 Content-Type、Content-Length、Accept-Ranges，仍有 Last-Modified、ETag、Expires、Cache-Control 與 add_header。從快取回答的上游回應也一樣（nginx 對可快取的回應才做，沒有快取時條件式標頭照常送給上游）。

### 23.5 回應者的驗證器與 CDN 邊緣節點

- 路由的 `etag: true`（本文 SHA-256 的前 16 個十六進位字）或 `'"v1"'`、`lastModified: 'YYYY-MM-DD HH:MM:SS'`；GET／HEAD 的 200 依 RFC 9110 回 304（`If-None-Match` 優先，否則 `If-Modified-Since` 不早於 Last-Modified）。
- **CDN 邊緣節點**（通用、沒有任何服務商的品牌）：回應者的 `cdn: { origin, port?, scheme?, originHost?, defaultTtl? }`（沒有路由）。它從**自己在網路中的位置**連到來源（防火牆、私有網段都算），把 `Host`（或 `originHost`）與 `X-Forwarded-For` 送過去；快取的鍵是 Host 加路徑（含查詢字串），Vary 分變體。能不能存和 §23.3 相同（`private`、`no-store`、`no-cache`、`Set-Cookie` 不存；`s-maxage` 優先），來源沒說時用 `defaultTtl`（預設 0：不存）；只存 200、203、204、300、301、404、410。回應保留來源的標頭（**包括來源的 `Date`**），換上 `Connection: keep-alive`，最後加 `Age`（存了多久加上來源給的 Age）與 `X-Cache: HIT`／`MISS`。來源連不到：`502`／`504` 與一個說明的頁面（`X-Cache: MISS`），不回過期的副本。課程可以用 `cdnCache` 放入開始時已經在快取裡的回應（例如還沒更新的舊 CSS）。
- **清除（purge）的選擇**：一個**明白是虛構的通用 API**——課程在一台機器（例如 `cdn-api`）放一個路由 `{ path: '/purge', methods: ['POST'], purge: { edges: ['edge-01'], token: 'demo-token' } }`，`curl -X POST -H 'Authorization: Bearer demo-token' http://cdn-api/purge -d 'url=http://www.example.com/app.css'`（或 JSON `{"url": …}`、`all=1`、結尾 `*` 的前綴）讓列出的邊緣節點忘掉那些網址，回 `{"status":"ok","purged":N}`；權杖不對 `401 {"error":"unauthorized"}`、少了網址 `400 {"error":"missing url"}`。它不模仿任何真實服務的網址或欄位；真實的 CDN 各有自己的 API，課文說明概念。nginx 自己的快取則用刪除檔案清除（§23.3）。

### 23.6 檢查需要的回應資訊

`Response.cache`（nginx 的 `$upstream_cache_status` 或邊緣節點的 X-Cache）與 `Response.upstreamMs`（伺服器到上游的網路時間）是引擎內部的欄位，不是標頭。

### 23.7 `curl -w` 的時間變數

`%{time_namelookup}`、`%{time_connect}`、`%{time_appconnect}`、`%{time_pretransfer}`、`%{time_starttransfer}`、`%{time_total}`、`%{time_redirect}`（秒，六位小數）與 `%{speed_download}`（位元組／秒，整數）、`%{speed_upload}`（0），由 §24.1 的來回時間算出，每次都一樣：

| 變數 | 算法 |
|---|---|
| namelookup | 位址或 `--resolve` 0.000012；`/etc/hosts` 0.000180；解析器的快取 0.000450；解析器必須送出查詢 0.024300（和 dig 的 24 msec 一致）；重用連線 0.000010 |
| connect | namelookup + 一個來回（TCP 交握）；重用連線不再加 |
| appconnect | HTTPS 的新連線：connect + 一個來回（TLS 1.3）+ 0.0021；其他 0 |
| pretransfer | appconnect（或 connect）+ 0.00005 |
| starttransfer | pretransfer + 一個來回 + 伺服器的時間（回應者的 `delay`、nginx 到上游的來回與上游的時間、邊緣節點到來源的時間；從快取回答時是 0） |
| total | starttransfer + 0.00008 + 本文 ÷ 125 MB/s |

`-L` 時各值從整個傳輸開始算（加上前面的重新導向，`time_redirect` 是它們的總和）。這是**模擬的模型**，用來比較「DNS、連線、TLS、伺服器」各花多少時間，不是真實網路的量測。

## 24. 引擎階段 E19：`diagnostics` profile（`src/lib/terminal/diag.ts`、`sed.ts`）

### 24.1 選用方式與延遲的模型

| 項目 | 內容 |
|---|---|
| `DIAGNOSTICS_PROFILE` | `edge` 的一切加上 `ping`、`traceroute`、`mtr`、`tcpdump`、`sed`（`E19_COMMANDS`）；feature `diagnostics`。`edge` 以下這五個是 `command not found`，而且**各 profile 的 `command not found` 清單不變**（清單是各自 profile 的指令） |
| 來回時間 | 每台機器的 `latency`（ms，預設 0.25）是它離網路核心多遠（星狀的模型）：兩台機器的來回時間是兩者的和（同一個區網預設 0.5 ms）；自己的位址 0.04 ms。`edge` 起就有（curl -w 用它） |
| 路徑 | 本機的 `paths: [{ hops: [{ address, name?, rtt, loss?, silent? }] }]`，最後一跳是目的地（可以是課程沒有的網際網路位址）。沒有宣告時：目的地不在本機的網段就先經過閘道（`_gateway`，0.35 ms），再到那台機器；沒有機器有這個位址時只有閘道 |
| 每一次探測 | 那一跳的來回時間 ±3%（至少 ±4 µs），由「主機、跳、序號」的 SHA-256 決定；遺失率 L% 的一跳，N 次探測中固定有 round(L×N/100) 次遺失。**每一跳的遺失只屬於那一跳**：課程要表達一路持續的遺失，就在之後的每一跳都寫上 |
| 名稱 | `/etc/hosts`、路徑宣告的 `name`，以及預設閘道的 `_gateway`（Ubuntu 的 systemd-resolved）；沒有 PTR 的模型 |
| 防火牆 | 目的地的 E16 防火牆決定它回不回應：**ufw 一律回應 ping**（before.rules 放行 ICMP echo-request）；nft 的 `policy drop` 沒有 `icmp type echo-request accept`（或 `meta l4proto icmp`）時丟棄；私有網段（E17）之外的機器沒有回應 |

### 24.2 `ping`（iputils 20240117）

`ping -c N [-i 秒] [-W 秒] [-s 大小] [-n] [-q] [-4] 主機`：`PING 主機 (位址) 56(84) bytes of data.`、每個回應 `64 bytes from 名稱 (位址): icmp_seq=1 ttl=64 time=0.489 ms`（以位址 ping 時只印位址；TTL 是 64 減去中間的跳數；time 在 1 ms 以下三位小數、10 ms 以下兩位、100 ms 以下一位）、空行、`--- 主機 ping statistics ---`、`4 packets transmitted, 4 received, 0% packet loss, time 3003ms`（遺失率用 %g）、`rtt min/avg/max/mdev = …`。沒有回應：只有統計，結束碼 1；本機網段沒有那台機器：`From 本機位址 icmp_seq=N Destination Host Unreachable`、`+N errors` 與 `pipe N`；nft 的 reject：`Destination Port Unreachable`。名稱找不到：`ping: x: Name or service not known`（結束碼 2）。**沒有 `-c` 時**說明模擬環境沒有 Ctrl-C，請加 `-c`。ping 不讓時鐘前進。

### 24.3 `traceroute`（traceroute 2.1.5）與 `mtr`（mtr 0.95）

- `traceroute [-n] [-I|-T] [-p 埠] [-m 跳數] [-q 次數] 主機`：`traceroute to 主機 (位址), 30 hops max, 60 byte packets`，每一跳 `%2d ` 加上每個探測（位址改變時 ` 名稱 (位址)`，然後 `  0.404 ms`；沒有回應 ` *`）。預設送 UDP 33434 起：**目的地的 ufw 預設拒絕時最後一跳一直是 `* * *`，印到 30 跳**（真實的情形）；`-I` 用 ICMP echo（ufw 放行）、`-T` 用 TCP SYN（預設 80，**需要 root**：`You do not have enough privileges to use this traceroute method.`、`socket: Operation not permitted`）。
- `mtr -r|--report [-w] [-c N] [-n] [-b] [-T|-u] 主機`（`-rwn`、`-rwc 5` 合寫也可以）：`Start: 2026-11-22T10:00:00+0000`、`HOST: 主機名稱 … Loss%   Snt   Last   Avg  Best  Wrst StDev`、每一跳 `  1.|-- _gateway   0.0%    10    0.4 …`；欄位照 mtr 的 `report_close` 印在固定的位置，所以 100% 遺失的 `100.0%` 被下一欄蓋掉 `%`、印成 `100.0`；沒有 `-w` 時主機欄 33 字（長名稱被截斷），`-w` 時依最長的名稱。只顯示到目的地，或最後一個有回應的跳之後再一個 `???`。StDev 是樣本標準差。沒有 `-r` 時說明模擬環境沒有全螢幕介面。

### 24.4 `tcpdump -r`（tcpdump 4.99）

- 擷取檔由課程的 `captures` 寫入（§25），**是模擬的檔案**：一行 `LISIM-PCAP 1` 加上 JSON（不是 libpcap 的格式；`cat` 看得到內容）。不是這種檔案：`tcpdump: unknown file format`；讀不到：`tcpdump: x: No such file or directory`／`Permission denied`。標準錯誤先印 `reading from file x, link-type EN10MB (Ethernet), snapshot length 262144`。
- 每個封包一行，時間是機器時區的 `HH:MM:SS.ffffff`（`-t` 不印、`-tttt` 加日期）：TCP `IP 來源.埠 > 目的.埠: Flags [S.], seq 5000, ack 1001, win 65160, length 0`——旗標依 tcpdump 的順序（F S R P . U E W），**SYN 與對話中第一個帶 ACK 的封包印絕對序號，之後相對**（tcpdump 的 tcp_seq_hash），有資料時 `seq 1:70`，HTTP（80、8080 埠）加 `: HTTP: 第一行`；DNS（53 埠）`4660+ A? web-01.example.com. (36)`、`4660 1/0/0 A 10.0.0.12 (52)`、`NXDomain`；ICMP `ICMP echo request, id 7, seq 1, length 64`、`udp port 33434 unreachable`、`host … unreachable`。序號與 ACK 沒有寫時由對話推算。**簡化**：不印 TCP options（`[mss 1460,sackOK,TS val …]`）；`-A` 只印資料本身，不含 IP／TCP 標頭的位元組。
- 名稱：沒有 `-n` 時位址依 `/etc/hosts` 換成名稱、埠依 `/etc/services`（`http`、`domain`、`postgresql`）；`-n` 與 `-nn` 都是數字（tcpdump 4.99 的 `-n` 已經不換埠的名稱）。
- 過濾條件（pcap-filter 的子集）：`host`、`net`、`port`（可加 `src`／`dst` 與 `tcp`／`udp`），`tcp`、`udp`、`icmp`、`ip`，`and`／`&&`、`or`／`||`、`not`／`!`、括號，單獨的位址或名稱是 host。錯誤：`tcpdump: can't parse filter expression: syntax error`、`unknown host 'x'`。`-c N`、`-w 檔案`（把符合的封包寫成另一個擷取檔）。`-v`、`-X`、`-x`、`-e` 說明不支援。
- **即時擷取不模擬**：一般使用者 `tcpdump: eth0: You don't have permission to perform this capture on that device` 與 `(socket: Operation not permitted)`；root 說明模擬環境沒有網路卡，請用 `-r`。

### 24.5 `sed` 的子集（GNU sed 4.9）

- **只在 `diagnostics` 以上**：各 profile 的 `command not found` 會列出那個 profile 的指令，加在更低的 profile 會改變已發布課程印出的清單；從 `diagnostics` 起加入則不影響任何已發布的輸出。
- 指令稿：一個或多個指令（`;`、換行或多個 `-e`），位址 `N`、`$`、`/樣式/`（可加 `I`）、`a,b` 範圍、`!` 反向；指令 `p`、`d`、`s/樣式/取代/[g][p][N][I]`（`&`、`\1`–`\9`、`\n`）、`q`、`=`。選項 `-n`、`-i[後綴]`（在同一個資料夾寫暫存檔再換掉：資料夾要可寫，否則 `sed: couldn't open temporary file /etc/sedXXXXXX: Permission denied`；一般使用者改過的檔案變成自己的，權限不變；`-i.bak` 留備份）、`-E`／`-r`、`-e`。樣式是 grep 的子集（`compilePattern`，群組可以擷取）。錯誤照 GNU：`unknown command: \`k'`、`unterminated \`s' command`、`unknown option to \`s'`、`unterminated address regex`、`can't read x: No such file or directory`、`no input files`。分支、hold space、`y`、`a`、`i`、`c`、`w` 等說明不支援。

## 25. E18–E19 的課程資料與檢查（`src/lib/terminal/edge-lesson.ts`）

```ts
machines: [{ ..., profile: 'edge' | 'diagnostics',
  latency?: 0.25,                                                                         // edge 以上（遠端機器也可以）
  files: [{ ..., mtime?: 'YYYY-MM-DD HH:MM:SS' }],                                        // edge 以上
  responders: [{ id, cdn?: { origin, port?, scheme?, originHost?, defaultTtl? }, routes: [{ ..., etag?, lastModified?, purge?: { edges, token? } }] }],  // edge 以上
  cdnCache?: [{ responder, entries: [{ url, status?, headers?, body?, type?, cachedAt, ttl }] }],                                                    // edge 以上
  paths?: [{ hops: [{ address, name?, rtt, loss?, silent? }] }],                         // diagnostics 以上（本機）
  captures?: [{ path, owner?, group?, mode?, start?, packets: [{ t, proto, src, dst, flags?, seq?, ack?, win?, payload?, length?, icmp?, id?, icmpSeq?, dns? }] }],  // diagnostics 以上
  remotes: [{ ..., latency?, cdnCache?, captures? }] }]
```

| 規則 | 內容 |
|---|---|
| 各自的 profile | `latency`、`cdnCache`、回應者的 `cdn`、路由的 `etag`／`lastModified`／`purge`、檔案的 `mtime` 需要 `edge`；`paths`、`captures` 需要 `diagnostics`（遠端機器同樣檢查） |
| 內容 | latency 0–1000 ms；mtime 不晚於 now；cdn 的 origin 是主機名稱或 IPv4、port 1–65535、defaultTtl 0–31536000，cdn 回應者沒有路由；etag 是 `true` 或加引號的 entity tag；purge 的 edges 是課程的 1–8 台機器、token 是 1–64 個 URL 安全字元；cdnCache 最多 4 組、每組 20 筆，屬於這台機器的 cdn 回應者；paths 最多 8 條、每條 1–30 跳、rtt 0–10000、loss 0–100、目的地不重複；captures 最多 4 個、每個 1–200 個封包、時間不倒退、位址與埠的格式、TCP 的旗標 |
| 產生的東西 | 擷取檔與缺少的上層資料夾（root 0755），只在課程沒有列出時加入 |
| 變體 | 從這一批起可以換掉 `upstreamConnections`（`proxy` 以上）、`accounts`（`users` 以上）、`packages`（`packages` 以上）與 `paths`（`diagnostics` 以上）；upstream 的權重在設定檔裡，用 `files` 換掉網站的設定即可 |

| 檢查 | 意義 |
|---|---|
| `{ kind: 'cache', url, status?, headers?, host? }`（`edge` 以上） | 從本機（或 `host`）再 GET 一次這個網址時的快取狀態（nginx 的 `$upstream_cache_status` 或邊緣節點的 X-Cache）與標頭；檢查本身不改變任何狀態 |
| `http` 的 `headers`、`requestHeaders`（`edge` 以上） | 多個必須有的標頭；送出的請求標頭（例如 `If-Modified-Since`，檢查 304） |
| `output` 的 `fromCommand`（所有 profile，選用） | 正規表示式：印出這個輸出的指令必須符合它（例如 `'^(sudo )?mtr '`），所以「答案只有兩種、用 echo 猜」不會通過；沒有寫時和以前相同 |

## 26. 同批的修正（SRV-4；從指令所在的 profile 起）

| 修正 | 內容 |
|---|---|
| `journalctl -g` | systemd 的 smart case：樣式全是小寫時不分大小寫，有大寫字母時分大小寫 |
| `ps` 的 START／STIME | 照 procps-ng 的 `pr_stime`：以機器的時區（`localtime`；沒有時區是 UTC）顯示，**和現在同一天**是 `HH:MM`，同一年是 `MonDD`，否則年份。之前是 UTC 與「24 小時內」的規則（例如昨天 23:10 開始的行程印成 `23:10`，現在是 `Nov21`） |
| `ps -o lstart`、`start_time`、`stime` | lstart 是 ctime 的格式（`Sun Nov 22 16:00:00 2026`，靠右 24 欄，標題 STARTED），時區同上 |
| `systemctl list-units --no-legend` | 不印標題行、圖例與數量（之前仍印標題）；欄寬只看印出的列。`list-unit-files --no-legend` 也一樣 |
| `/etc/cron.d` 沒有使用者欄位的行 | 第一個字被當成使用者，getpwnam() 失敗：這一行是錯誤、不執行；`cron-run` 讀檔時在 journal（cron.service、優先順序 err）記錄 `Error: bad username; while reading /etc/cron.d/x`。其他行照常（見 §28 的說明） |
| `set -u` | 算術運算式讀到未設定的變數也是錯誤（`$((n + 1))`、`(( count++ ))`），訊息照 bash：指令稿 `./t.sh: line 3: count: unbound variable`、提示字元 `bash: n: unbound variable`。原本的參數展開已經是 bash 的格式 |
| `grep -q`（`--quiet`、`--silent`） | 不印東西，只有結束碼；有符合時即使有錯誤也是 0 |
| nginx 的 upstream 專用指令 | `least_conn`、`ip_hash`、`keepalive`、`zone`、`hash`、`random` 等出現在 upstream 之外：`"least_conn" directive is not allowed here`（之前是 unknown directive）；`proxy` 起 |
| sshd（`tunnels` 起） | `PermitOpen`（`any`、`none`、`host:port`、`host:*`；限制 `-L` 與 `-J` 的目的地，不允許時是 `administratively prohibited`）、`DisableForwarding yes`（優先於 AllowTcpForwarding）、最小的 `Match User 名單`／`Match Address 位址或 CIDR`／`Match All` 區塊（AllowTcpForwarding、GatewayPorts、PermitOpen、DisableForwarding、PasswordAuthentication、PubkeyAuthentication、PermitRootLogin 依連線的使用者與來源覆寫全域的值，第一個符合的值生效；`Port` 在 Match 裡是 `Directive 'Port' is not allowed within a Match block`）；`tunnels` 以下這些關鍵字仍是 `Bad configuration option`，`sshd -T` 的輸出不變 |
| ssh 的 `ExitOnForwardFailure`（`-o` 或 `~/.ssh/config`） | `-R` 失敗是 `Error: remote port forwarding failed for listen port N`、`-L` 綁不上是原本三行之後結束，結束碼都是 255 |
| `nft` 的 ICMP | `meta l4proto icmp`、`ip protocol icmp`、新的 `icmp type echo-request` 只符合 ICMP（之前 `meta l4proto icmp` 的規則符合所有封包） |
| 變體與 `output` 檢查 | §25 |

**已發布的課程（LNX01–LNX15、SRV01–SRV06）沒有任何輸出改變**（全部的 `terminalContentProblems` 仍是空的）。改變的是測試資料裡記錄舊行為的地方：`tests/terminal-e4.test.ts` 與 `tests/support/terminal-fixture.ts` 的 `ps aux`（昨天 23:10 開始的行程：`23:10` → `Nov21`）、`tests/terminal-e6.test.ts` 的 `--no-legend`（不再有標題行）。LNX08 的課文表格寫「24 小時內顯示時:分，更早顯示日期」，和 procps 的規則（同一天）略有不同，留給課程作者決定是否修改。

## 27. E18–E19 的測試

| 檔案 | 內容 |
|---|---|
| `tests/terminal-e18.test.ts` | profile 的分界（`tunnels` 以下時鐘不動、`-w` 的時間變數仍印說明、`proxy_cache_path` 是 unknown directive、資料欄位要 `edge`）、`sleep` 的加總與上限、背景的 sleep、MISS／HIT／EXPIRED／BYPASS、HIT 的標頭、Set-Cookie／private／Vary、Cache-Control 的優先順序、MD5 的測試向量與快取檔的路徑、清除（`sudo rm` 的 glob 陷阱與 `sudo bash -c`）、上游停掉時的 STALE、背景更新的 STALE／UPDATING／HIT、REVALIDATED、min_uses、`expires` 取代上游的 Cache-Control、inactive、設定錯誤、靜態檔的 Last-Modified／ETag／Accept-Ranges 與 304、改檔與 touch 之後的新驗證器、CDN 的 HIT（Age、來源的 Date）、MISS→HIT、no-store、s-maxage、defaultTtl、邊緣的 304、清除 API（401、400、成功、all）、`curl -w` 的時間、fail_timeout 經過後重試（以及 `tunnels` 仍到 reload 為止）、資料驗證、`cache` 檢查與帶標頭的 `http` 檢查 |
| `tests/terminal-e19.test.ts` | profile 的分界（五個指令在 `edge` 以下是 command not found，`edge` 的清單沒有 sed）、說明頁、ping 的版面、時間的位數、TTL、遺失、nft 丟棄、Host Unreachable、沒有 `-c`、找不到名稱；traceroute 的跳、`_gateway`、沉默的路由器、ufw 丟棄 UDP、`-I`、`-T` 的權限、`-m`；mtr 的報告（固定欄位、`100.0`、寬版、`???`）；tcpdump 的完整輸出、相對序號、DNS、ICMP、RST、過濾條件、`-A`、`-c`、`-t`、`-tttt`、`-w`、錯誤與即時擷取；sed 的每個指令與錯誤；資料驗證與 `fromCommand` 的 output 檢查 |
| `tests/terminal-srv4-fixes.test.ts` | §26 的每個修正 |
| `tests/support/cdn-fixture.ts` | 只供測試：web-08（快取的反向代理、本機的應用程式、靜態檔）、laptop／edge-01／origin-01／cdn-api（CDN 與清除 API）、laptop／web-01（ufw）／db-01（nft）與宣告的路徑、擷取檔 |

`tests/terminal-e1.test.ts` 的 `PROFILES` 期望值加上 `edge`、`diagnostics`。

## 28. E18–E19 仍不支援

- **時間**：時鐘只由 `sleep` 前進；背景的 sleep 不會結束、cron 與 timer 不會自動執行、ping／traceroute 不花時間、curl 的 `-m` 與 `--connect-timeout` 不讓時鐘前進。
- **nginx**：`proxy_cache_lock` 沒有可見的效果、`max_size` 的淘汰、`proxy_cache_purge`（nginx Plus）、`proxy_cache_convert_head off`、`stale-while-revalidate`／`stale-if-error`（Cache-Control 的延伸）、`expires @時間`、`fastcgi_cache` 等其他模組的快取、`Range`／206、快取檔的二進位檔頭。
- **CDN**：真實服務商的 API 與標頭、過期副本的回應（stale-if-error）、`no-cache` 的再驗證（模擬環境不存）、多個 POP 與地理位置、TLS 在邊緣終止的細節（課程可以給邊緣節點憑證，由 E13 處理）。
- **診斷**：IPv6（`ping6`、`traceroute6`）、反向 DNS（PTR）、`ping -f`、`traceroute` 的 `-U`／`--mtu`、mtr 的互動介面與 `--json`、即時擷取（`tcpdump -i`）、真正的 pcap 格式、TCP options、`-A` 的標頭位元組、`-v`／`-X`、`ss -s`、`dig +trace`（委派的逐步查詢，CN12）；`ip route get` 在 E10 已有。
- **sed**：分支、hold space、`y`、`a`／`i`／`c`、`w`、`-z`、`-s`，以及沒有結尾換行的最後一行（模擬環境一律加換行）。
- **cron.d 沒有使用者欄位**：模擬環境只忽略那一行並記錄 `Error: bad username`；Debian 的 cron 實際上可能另外記錄 `(*system*x) ERROR (Syntax error, this crontab file will be ignored)` 並忽略整個檔案，這部分沒有模擬（為了不改變其他 E9 錯誤的既有行為）。
- **sshd 的 Match**：只有 User、Address、All；Group、Host、LocalAddress、LocalPort、RDomain 不支援（`Unsupported Match attribute`）；`PermitListen` 不模擬。

## 29. SRV-5 的修正（引擎；`tls`／`edge` 起）

| 修正 | 內容 |
|---|---|
| certbot 的 HTTP-01 只看公開 DNS（`dns.ts` 的 `publicDnsValues`、`certbot.ts`） | 之前模擬的 CA 經由 `dnsValues()` → `recursive()` 解析名稱，而 `recursive()` 先查**本機**的 `/etc/hosts`：在伺服器上加一行 hosts 就能讓 certbot 通過（反過來，hosts 把公開的名稱指到別處也會讓驗證失敗）。現在 CA 用 `recursive(…, files = false)` 加上空的快取，只看權威資料（課程的 named 與 `internet` 區域），和 §11.4 的說法、真實的 Let's Encrypt 一致；webroot、重新導向與 `--nginx` 三處都一樣。只在 hosts 裡的名稱照 certbot 的格式失敗：`Type: dns`、`Detail: DNS problem: NXDOMAIN looking up A for 名稱 - check that a DNS record exists for this domain`。`dig`、`curl` 等本機的查詢不變 |
| 從外面到達本機（root）的 nginx 也能連到它的 upstream（`http.ts` 的 `upstreamOf`、`serveResponder`） | CDN 邊緣節點（或任何遠端機器、另一層代理）連到課程本機上的 nginx 時，拿到的是**去掉 `net`** 的本機狀態；`indexByName` 對本機回 `'self'`，`upstreamOf` 便以這個沒有網路的狀態去連 upstream，所有後端都逾時（504）。現在由 `placed()` 決定機器所在的位置：遠端機器照舊用 `viewFrom`，本機在缺少網路時接回課程的網路，所以經由邊緣節點的請求和本機直接送出的請求走同樣的 upstream（平滑輪詢的順序、`$upstream_addr`、日誌寫回各自的機器）；寫回時再去掉網路。邊緣節點在本機時找來源也用同一個規則 |
| 經過邊緣節點時上游的等待只算一次（`cache.ts` 的 `cdnServe`、`http.ts`） | 邊緣節點把來源的回應（含引擎內部的 `wait`）原封不動傳回，又把來源的 `wait + upstreamMs` 算進自己的 `upstreamMs`：來源的 `proxy_connect_timeout 5s` 在本機量是 5.0 秒、經過邊緣節點卻是 10.0 秒。現在來源回應的 `wait`／`upstreamMs` 留在來源（不傳出、不存進快取），邊緣節點的回應以 `wait` 記來源花的時間（來源自己的等待與它的上游）、`upstreamMs` 只記邊緣到來源的網路來回：經過邊緣節點的時間 = 來源的時間 + 用戶端⇄邊緣與邊緣⇄來源的來回（§23.7）。快取命中（HIT）不再帶著當初來源的延遲；`curl -m` 比較的是邊緣節點的 `wait`。來源連不到時（502／504）的計算不變 |

**已發布的課程沒有任何輸出改變**（全部的 `terminalContentProblems` 仍是空的；較低的 profile 不受影響）。測試在 `tests/terminal-srv5-fixes.test.ts`：只在 hosts 的名稱是 NXDOMAIN、公開的名稱通過（hosts 指到別處也不影響）、`certbot --nginx` 相同；laptop 為本機、經由邊緣節點到本機的 nginx 再到兩台應用伺服器，nginx 所在的機器是本機時經由邊緣節點，以及 nginx 在遠端機器；`proxy_connect_timeout 5s` 對丟棄封包的 upstream 在本機與經過邊緣節點的 `time_starttransfer`／`time_total`，慢的應用程式經過邊緣節點的 MISS 與沒有延遲的 HIT。
