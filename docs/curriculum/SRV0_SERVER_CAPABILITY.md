# SRV-0：網路與伺服器島的課程能力與引擎階段 E10–E12

> 2026-11-22。目標：讓網路與伺服器島（`network-servers`，前綴 SRV，14 堂）可以撰寫、驗證、發布。本島**不需要新的課程能力或活動**：沿用 LNX-0 的 `terminal` 能力（[LNX0_TERMINAL_CAPABILITY](LNX0_TERMINAL_CAPABILITY.md)）與 CN-0 的 `network-protocol` 情境。本文件也是終端機引擎階段 **E10–E12**（`sockets`、`dns`、`http`）的唯一說明處；E1–E9 仍在 LNX0 文件（§9–§17），LNX0 的 §18 只指向這裡。之後的進度與下一批由 [AUTONOMOUS_CURRICULUM_PROGRESS](../planning/AUTONOMOUS_CURRICULUM_PROGRESS.md) 計算。

## 1. 範圍

| 部分 | 內容 |
|---|---|
| SRV-0（登錄） | `PREPARED_ISLAND_IDS = ['network-servers']`、前綴 `SRV`、`UNITS['network-servers'] = []`、`serverFromBlueprint`；沒有課程、頁面、旗標、3D 或 `mapState` 的改動 |
| E10 `sockets` | 介面與位址、由行程推導的監聽 socket、連線；`ss`、`lsof -i`、`nc -z`、`ip`、`getent` |
| E11 `dns` | 區域檔、BIND（`named`）、`named-checkzone`、`rndc reload`、有快取的本機解析器；`dig`、`host`、`resolvectl flush-caches`；E10 以上的指令從這一階起經由 `/etc/hosts` 與 DNS 找名稱 |
| E12 `http` | HTTP 回應者（路由、狀態碼、標頭、重新導向、keep-alive）；`curl` |

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

課程編號即位置，依序連續發布；每一批先完成它需要的引擎階段（各自的 profile 與測試），再寫課。profile 延續 LNX 的**線性鏈**：lab < files < streams < users < processes < packages < services < remote < scripting < scheduling < **sockets < dns < http** < …（E13 起依序接在後面）。

| 批次 | 課程 | 引擎階段 |
|---|---|---|
| SRV-1 | SRV01–SRV03 | **E10** `sockets`（已完成，§6）、**E11** `dns`（已完成，§7）、**E12** `http`（已完成，§8） |
| SRV-2 | SRV04–SRV06 | E13 `tls`（憑證資料、`openssl x509`／`s_client`／`verify`、certbot 的 ACME 模擬與更新的 timer）、E14 `nginx`（設定解析、`nginx -t`／`-T`、server 與 location 的選擇、reload 才套用） |
| SRV-3 | SRV07–SRV10 | E15 `proxy`（`proxy_pass`、轉送標頭、upstream 的 round-robin／least_conn／ip_hash、502／504）、E16 `firewall`（ufw、nftables 子集，接到 CN 的封包判斷）、E17 `tunnels`（`ssh -L`／`-R`／`-J`、`~/.ssh/config`） |
| SRV-4 | SRV11–SRV13 | E18 `edge`（CDN 的 Cache-Control、Age、X-Cache、purge）、E19 `diagnostics`（`ping`、`traceroute`、`mtr --report`、讀擷取資料的 `tcpdump -r`） |
| SRV-5 | SRV14 | 綜合專題，單獨一批 |

先修：SRV01 需要 LNX02；SRV 的同島先修都排在前面（`scripts/curriculum-queue.ts` 檢查）。發布 SRV-1 時，`tests/terminal-capability.test.ts` 與 `tests/curriculum.test.ts` 裡「只有 Linux 島用 `terminal`」的斷言要一起更新。

## 5. 決定論的規則

- **固定時鐘**（E4 §12.2）：DNS 快取的剩餘 TTL、HTTP 的 `Date`、`dig` 的 `WHEN` 都由機器的 `now` 算出；時鐘不前進，所以剛快取的記錄剩餘 TTL 就是完整的 TTL。
- **沒有亂數**：DNS 查詢的 id 是「主機、查詢次數、名稱、類型」的 SHA-256；MAC 位址由「主機／介面名稱」算出（`52:54:00:…`）；socket 的 inode（`lsof` 的 DEVICE）由「主機／PID／協定／位址／埠」算出。
- **固定的時間值**：`dig` 的 Query time：從快取或直接問權威伺服器是 0 msec，解析器必須去問時是 24 msec；`curl` 連不到不存在的位址時是 `after 127000 ms`（Linux 預設 6 次 SYN 重送約 127 秒），有 `--connect-timeout N` 時是 `after N000 ms`，被拒絕是 `after 0 ms`。
- **不印尾端空白**：真實的 `ip`、`host`、`curl -v`（`> `、`< `）會在行尾留空白；模擬環境一律去掉（課文的紀錄因此可以直接比對）。
- **沒有進度表**：`curl` 的進度表含真實的速度與時間，模擬環境不印（等於 `--no-progress-meter`）；`-w` 也不提供 `time_*`、`speed_*`（印說明）。
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
| HTTPS | **選擇**：E13 之前，`https://` 照常解析名稱、連到 443（所以 6、7、28 都是真的），連上之後停在 `curl: (35) 模擬環境：HTTPS 的 TLS 交握在引擎階段 E13 才模擬；請先用 http:// 觀察 HTTP`（`-v` 另有 `* Closing connection`）。不會假裝完成 TLS，也不會偷偷改成明文 |
| 不支援 | 進度表（§5）、HTTP/2 與 HTTP/3（`--http2` 印說明）、cookie jar、`-u`、`-F`、`-O`、`-D`、`-x`（代理是 E15）、`--compressed` 的實際解壓（接受、沒有作用）、IPv6 連線 |

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

`tests/terminal-e1.test.ts` 只把 `PROFILES` 的期望值加上三個新 profile（和之前每個階段相同的更新方式）。LNX01–LNX15 與較低的 profile 逐字不變。

## 11. 仍不支援（之後的階段或文字說明）

IPv6 的連線與監聽（`[::]:80`；`ip` 只顯示核心自動加的 IPv6 位址）、`ss` 的 unix socket、狀態過濾（`state established`）、`-s`、`-e`、`%lo` 的介面標記、`lsof` 的檔案與 `-p`、`nc` 的資料傳送與監聽、UDP 的連線檢查、`ip` 的修改、`netstat`（請用 ss）、防火牆（E16）、反向 DNS（PTR、`dig -x`）、DNSSEC、區域傳送與次要伺服器、委派的逐步查詢（CN12）、`resolvectl` 的其他子指令、`/etc/nsswitch.conf`、從遠端工作階段跨主機的連線與查詢、TLS（E13）、nginx 的設定（E14）、代理（E15）、`curl` 的進度表與時間變數。
