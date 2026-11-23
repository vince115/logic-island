# DKR-0：Docker 容器島的課程能力與引擎階段 E20

> 2026-11-23。目標：讓 Docker 容器島（`docker-containers`，前綴 DKR，15 堂）可以撰寫、驗證、發布。本島**不需要新的課程能力或活動**：和網路與伺服器島（[SRV0_SERVER_CAPABILITY](SRV0_SERVER_CAPABILITY.md)）一樣沿用 LNX-0 的 `terminal` 能力（[LNX0_TERMINAL_CAPABILITY](LNX0_TERMINAL_CAPABILITY.md)）與 CN-0 的 `network-protocol` 情境。本文件也是終端機引擎階段 **E20** `containers`、**E21** `images`（§11）、**E22** `storage-net`（§12）與 **E23** `compose`（§13）的唯一說明處（E1–E9 在 LNX0，E10–E19 在 SRV0），以及之後 E24 的規劃。之後的進度與下一批由 [AUTONOMOUS_CURRICULUM_PROGRESS](../planning/AUTONOMOUS_CURRICULUM_PROGRESS.md) 計算。

## 1. 範圍

| 部分 | 內容 |
|---|---|
| DKR-0（登錄） | `PREPARED_ISLAND_IDS = ['docker-containers']`、前綴 `DKR`、`UNITS['docker-containers'] = []`、`dockerFromBlueprint`；沒有課程、頁面、旗標、3D、GLB 或 `mapState` 的改動 |
| E20 `containers` | Docker CE 27.5.1 的模擬：daemon 的 Image 與 Container、模擬的 Docker Hub（課程宣告哪些 Image 拉得到）、容器的生命週期與可寫層、日誌、`docker exec`、連接埠對應（主機上的 `docker-proxy`、`curl` 經由它連到容器的服務）、`docker` 群組與 socket 的權限；`docker` 指令（§5） |
| E21 `images` | `docker build`（BuildKit，預設的建置器）：Dockerfile 的解析、在建置容器裡執行 RUN、由建置內容 COPY／ADD 與 `.dockerignore`、每一步的層與大小、建置快取（`CACHED` 與失效）、`docker history`、Image 設定在 `docker run` 時生效、標籤與 dangling Image、`docker image prune`、`image`／`build` 檢查（§11） |
| E23 `compose` | Docker Compose v2（`docker compose`：YAML 子集、變數代換、驗證、`config`、`up`／`down`／`ps`／`logs`／`exec`／`build`／`pull`／`start`／`stop`／`restart`／`ls`、depends_on 與健康檢查的等待）、健康檢查（Compose、Dockerfile 的 HEALTHCHECK、`--health-*`；`(healthy)` 與 `.State.Health`）、多階段建置（`COPY --from`、`FROM` 階段、`--target`、scratch、distroless、課程宣告的建置工具）、Registry（`docker tag`、`login`／`logout`、`push`、以 digest 拉取、denied／unauthorized／不可變標籤）、`compose`／`registry` 檢查與 `image` 的 digest（§13） |
| E22 `storage-net` | Volume（具名、匿名、Image 的 VOLUME、copy-up）、bind mount（雙向即時）、tmpfs、唯讀掛載、以數字 UID 決定的擁有者與權限錯誤、備份用的 `tar`；`docker network`（bridge、host、none、自訂網路與內建 DNS、connect／disconnect）、容器之間連得到什麼、`--network host`／`none`、`docker inspect` 的 Mounts 與 Networks、`volume`／`network`／`reach` 檢查（§12） |

不新增任何執行期套件；所有輸出由課程資料與機器的固定時鐘決定（§5.6）。

## 2. 活動對應（`dockerFromBlueprint`，`src/content/curriculum/lessons.ts`）

藍圖的活動對應到既有的課程活動，和 `terminalFromBlueprint`、`serverFromBlueprint` 共用同一張對照表（`TERMINAL_SHAPES`）；每個島只接受自己用到的活動（`TERMINAL_ACTIVITIES`），LNX 與 SRV 的對應與錯誤訊息不變，`dockerFromBlueprint` 對其他島的課回報「not a Docker containers lesson」。

| 藍圖活動 | 課程 | 課程活動 | 能力 |
|---|---|---|---|
| `container-playground` | DKR03–DKR10、DKR13、DKR14 | `terminal-sim` | `terminal`（機器用 `containers` profile） |
| `architecture-diagram` | DKR01、DKR02 | `network-sequence` | `terminal`、`network-protocol`（和 SRV05 相同） |
| `pipeline-diagram` | DKR11 | `network-sequence` | `terminal`、`network-protocol` |
| `case-study-board` | DKR12 | `terminal-sim` | `terminal`（和 LNX01、SRV13 相同；分析板仍在 INTERACTIVE_LAB_ROADMAP） |
| `challenge-stages` | DKR15 | `challenge-stages` | `terminal`、`visualization` |

- **沒有新增活動名稱**：`container-playground` 與 `pipeline-diagram` 只是藍圖的名稱，對應到已實作的 `terminal-sim` 與 `network-sequence`，不加入 `LESSON_ACTIVITIES`（登錄它們會被當成已實作的新活動）。`pipeline-diagram`（Registry 的 build → tag → push → pull）以網路情境畫出 Client、daemon 與 Registry 之間的往返，旁邊是終端機。
- 資料庫島的 `architecture-diagram` 表示 `content.ops`；DKR01、DKR02 和 SRV05 一樣**不**沿用它（帶 `content.ops` 時 `validateContent` 回報缺少 architecture-diagram 能力）。
- 標題、目標、概念、難度、先修取自藍圖，與 LNX、SRV 相同。

## 3. 島嶼登錄

- `src/content/curriculum/schema.ts`：`PREPARED_ISLAND_IDS = ['docker-containers']`、`LessonPrefixWritten` 加上 `'DKR'`、`ISLAND_PREFIX['docker-containers'] = 'DKR'`。**不**移入 `ISLAND_IDS`。
- `src/content/curriculum/units.ts`：`'docker-containers': []`。
- 在第一堂課寫好、島嶼移入 `ISLAND_IDS` 之前，`validateCurriculum` 拒絕任何 DKR 課（「`docker-containers is prepared for authoring, not a curriculum island yet`」）。15 堂仍是規劃中、沒有頁面，島嶼狀態仍是 `planned`；已發布的課不變。
- `tests/llm-capability.test.ts` 原本斷言「沒有預備中的島」（`PREPARED_ISLAND_IDS` 是 `[]`），現在改成恰好是 `['docker-containers']`（同樣嚴格）。

## 4. 批次與引擎階段

課程編號即位置，依序連續發布；每一批先完成它需要的引擎階段（各自的 profile 與測試），再寫課。profile 延續**線性鏈**：… < edge < diagnostics < **containers**（E20）< **images**（E21）< **storage-net**（E22）< **compose**（E23）< E24。

| 批次 | 課程 | 引擎階段 |
|---|---|---|
| DKR-1 | DKR01–DKR04 | **E20** `containers`（已完成，§5）：DKR01、DKR02 的架構情境旁用 `docker version`、`docker info`、`docker run hello-world` 看 client、daemon 與 Registry 的分工；DKR03 生命週期（created、running、exited、刪除與可寫層）；DKR04 常用指令（run、ps、logs、exec、-p） |
| DKR-2 | DKR05–DKR06 | **E21** `images`（已完成，§11）Dockerfile 與建置：解析 Dockerfile（FROM、RUN、COPY、WORKDIR、ENV、CMD、ENTRYPOINT、USER、EXPOSE）、`.dockerignore`、`docker build`（BuildKit 的輸出）、每個指令一層、快取命中（`CACHED`）與失效、指令順序、`docker history`、Image 大小；RUN 只執行模擬環境認得的指令（套件安裝依 E5 的套件資料） |
| DKR-3 | DKR07–DKR08 | **E22** `storage-net`（已完成，§12）Volume 與網路：`docker volume`、`-v`／`--mount`（具名 Volume、bind mount 對應主機的檔案、tmpfs）、UID 不同造成的權限錯誤、重建容器後資料保留；`docker network`（預設 bridge、自訂網路與內建 DNS 127.0.0.11、容器以名稱互連、`--network host`）、哪些埠需要 `-p` |
| DKR-4 | DKR09–DKR11 | **E23** `compose`（已完成，§13）Compose、多階段建置與 Registry：`compose.yaml`（services、ports、environment、volumes、depends_on 與 `condition: service_healthy`）、`docker compose up -d`／`ps`／`logs`／`down`；多階段建置（`COPY --from`、精簡基底、建置參數）；`docker tag`、`push`、以 digest 拉取、私有 Registry 的 `docker login`、不可變標籤與 `latest` 的風險（DKR11 的管線情境） |
| DKR-5 | DKR12–DKR14 | **E24** 檢查與執行期限制：完整的 `docker inspect`、`HEALTHCHECK` 與 `(healthy)`／`(unhealthy)`、`--memory`／`--cpus`、記憶體不足的 `OOMKilled` 與 137、`--restart` 策略與重啟迴圈（`Restarting (1) …`）、SIGTERM 的處理與優雅關閉（`docker stop -t`）、`docker stats`、`top`、`kill`、`events`；DKR12（安全，`case-study-board`）用 E21 的 `USER`、E24 的 `--read-only` 與 `--cap-drop` |
| DKR-6 | DKR15 | 綜合專題，單獨一批（用 E20–E24 已有的一切） |

先修：DKR01 需要 LNX08；DKR 的同島先修都排在前面（`scripts/curriculum-queue.ts` 檢查）。

## 5. 引擎階段 E20：`containers` profile（`src/lib/terminal/docker.ts`、`docker-lesson.ts`）

### 5.1 選用方式

| 項目 | 內容 |
|---|---|
| `CONTAINERS_PROFILE` | `diagnostics` 的一切加上 `docker`（`E20_COMMANDS`）；feature `containers`。`diagnostics` 以下 `docker` 是 `command not found`，而且**各 profile 的 `command not found` 清單不變**（清單是各自 profile 的指令，`docker` 只在 `containers` 的清單裡） |
| 安裝 | 機器資料 `docker: { images?, containers? }`（`containers` 以上，只有課程的本機）：docker-ce 套件裝好的樣子——`docker` 群組（gid 988）、`/run/docker.sock`（root:docker 0660）、`/usr/bin/docker`、`dockerd`、`containerd`、`docker-proxy`、`/var/lib/docker`、`docker.service`（`ExecStart=/usr/bin/dockerd -H fd:// --containerd=/run/containerd/containerd.sock`）與 `containerd.service` 的 unit 與開機連結、PID 850 的 `containerd` 與 PID 900 的 `dockerd`。課程列出的檔案、群組、行程優先。沒有 `docker` 欄位的 `containers` 機器輸入 `docker`：`Command 'docker' not found, but can be installed with:`、空行、`sudo apt install docker.io`（結束碼 127） |
| `help` 與說明頁 | `help` 多一行 `docker run|ps|images|…`；`docker --help`、`man docker` 印 `CONTAINER_MANUAL`（`docker run --help` 等子指令的 `--help` 也印同一頁：shell 的 `--help` 處理在指令之前） |

### 5.2 daemon 的模型（`FsState.docker`）

| 項目 | 內容 |
|---|---|
| Image | 儲存庫、標籤、ID（64 個十六進位字，`docker images` 顯示前 12 個；由「儲存庫:標籤／建立時間」的 SHA-256 算出）、Docker Hub 的 digest、大小（位元組）、建立時間、CMD 與 ENTRYPOINT（exec 形式）、ENV、WORKDIR、EXPOSE、服務（`http: { port, responder, accessLog? }`：容器的這個埠由機器的哪個回應者回答）、是否持續執行（`service`）、啟動時印的日誌（`logs`）、程式型 Image 印的內容與結束碼（`output`、`exit`）、`docker stop` 後的結束碼（`stopExit`）、Image 裡有的執行檔（`commands`）、檔案（`files`）、`/etc/os-release`、拉取的層數；是否已在本機（`local`）、Docker Hub 有沒有（`pullable`） |
| 模擬的 Docker Hub | 課程的每個 Image 預設都拉得到（`registry: false` 是只在本機的 Image）；`pulled: true` 的已在本機。沒有其他 Registry，沒有網路延遲或認證 |
| Container | ID（64 個十六進位字，由「主機／建立序號／名稱／指令」算出，沒有亂數）、名稱（沒有 `--name` 時由 ID 決定的 `形容詞_科學家`，和 moby 的命名方式相同但字表是縮短版）、Image（使用者打的名稱與 ID）、Path 與 Args（ENTRYPOINT 加上指令）、建立／啟動／結束時間、狀態、結束碼、連接埠對應、`-e` 的環境變數、`--rm`、`-t`、`-i`、日誌（每行有時間與 stdout／stderr）、**自己的檔案系統**（Image 的檔案加上可寫層）、執行中時在預設 bridge 的位址（172.17.0.2 起，取最小的空號） |
| 生命週期 | `created`（建立了、還沒啟動，或啟動失敗）→ `running` → `exited`（程式結束、`docker stop`）→ 刪除（`docker rm`：可寫層與日誌一起消失）。`docker stop` 保留日誌與可寫層，`docker start` 再啟動同一個容器（同樣的檔案）；`--rm` 的容器結束就刪除 |
| 容器裡的程式 | **不執行任何真實的程式**。預設的指令：`service` 的 Image 持續執行並把 `logs` 寫進日誌；其他 Image 印出 `output` 並以 `exit` 結束。官方 Image 的 `docker-entrypoint.sh` 視為把控制權交給指令（`exec "$@"`）。`docker run IMAGE 指令…` 與 `docker exec`：`echo`、`cat`、`ls`、`pwd`、`cd`、`mkdir`、`touch`、`rm`、`cp`、`mv`、`head`、`tail`、`grep`、`wc`、`hostname` 用模擬環境自己的 Shell 在**容器的檔案**上執行（所以寫入的東西在可寫層），`env`、`ps`、`sleep`、`true`、`false`、`sh -c`、`bash -c` 由引擎處理；`sleep N` 讓容器執行到時鐘過了 N 秒（`sleep infinity`、`tail -f` 一直執行）；沒有 `-c` 的 `sh`／`bash` 讀標準輸入：沒有 `-i` 立刻結束（0），`-dit` 一直執行。Image 的 `commands` 之外的指令是 OCI 的「executable file not found in $PATH」 |
| 主機那一邊 | 每個執行中容器的每個公開埠是一個 `docker-proxy` 行程（`dockerd` 的子行程，`/usr/bin/docker-proxy -proto tcp -host-ip 0.0.0.0 -host-port 8080 -container-ip 172.17.0.2 -container-port 80`），在主機埠監聽（E10：`ss -tlnp` 是 `users:(("docker-proxy",pid=…,fd=4))`）。容器埠是 Image 的 `http.port` 時，這個 listener 指向為這個容器產生的回應者（機器回應者的副本），所以 `curl localhost:8080` 得到 Image 的服務；請求寫進容器的日誌（`accessLog: 'nginx'`：官方 nginx Image 的格式，來源是 bridge 的閘道 `172.17.0.1`）。容器停止就沒有 proxy：`curl: (7) Failed to connect …`。容器裡的主程式**不**出現在主機的 `ps` |

### 5.3 指令與格式（Docker CE 27.5.1：docker/cli 與 moby 的 v27.5.1）

共同規則：daemon 的錯誤是 `Error response from daemon: …`（結束碼 1）；`docker run` 建立階段的錯誤（找不到 Image、名稱衝突）是 `docker: ….`（補上句點）加 `See 'docker run --help'.`，啟動階段的錯誤（連接埠、找不到執行檔）只有 `docker: ….`，結束碼 125（找不到執行檔 127）——這是 27.5.1 的 `reportError`。表格用 Go 的 tabwriter（最小欄寬 10、間隔 3、最後一欄不補空白）；大小用 Go units（十進位，`docker images` 三位有效數字：192MB、7.83MB、10.1kB）；時間用 `units.HumanDuration`（Less than a second、1 second、N seconds、About a minute、N minutes、About an hour、N hours、N days、N weeks、N months、N years）。

| 指令 | 行為與格式 |
|---|---|
| `docker version`、`docker --version` | `Client: Docker Engine - Community` 與 Version 27.5.1、API version 1.47、Go version go1.22.11、OS/Arch、Context；`Server: Docker Engine - Community` 的 Engine（`1.47 (minimum version 1.24)`）、containerd 1.7.25、runc 1.2.4、docker-init 0.19.0。**縮短**：Git commit 與 Built 兩行不印。`Docker version 27.5.1, build 9f9e405`。沒有權限時 Client 照印，再印權限錯誤 |
| `docker info` | Client 三行、`Server:` 的 Containers／Running／Paused／Stopped、Images、Server Version、Storage Driver overlay2、Logging Driver json-file、Cgroup Driver systemd、Cgroup Version 2、Kernel Version（uname 的 release）、Operating System、OSType、Architecture、CPUs、Total Memory（機器的記憶體，Go 的二進位單位：2GiB）、Name、Docker Root Dir。**縮短**：Plugins、Swarm、Runtimes、Security Options、Registry Mirrors 等不印 |
| `docker images`、`docker image ls [儲存庫[:標籤]]` | `REPOSITORY   TAG       IMAGE ID       CREATED       SIZE`，依建立時間由新到舊；`-q` 只印 ID；`--format`（§5.4） |
| `docker pull IMAGE[:TAG]`、`docker image pull` | 沒寫標籤時先印 `Using default tag: latest`；`latest: Pulling from library/nginx`、每一層 `a2318d6c47ec: Pull complete`（終端機最後看到的樣子；進度條不模擬）、`Digest: sha256:…`、`Status: Downloaded newer image for nginx:latest`、`docker.io/library/nginx:latest`。已經有：`Status: Image is up to date for …`。Docker Hub 沒有這個儲存庫：`pull access denied for x, repository does not exist or may require 'docker login': denied: requested access to the resource is denied`；有儲存庫沒有標籤：`manifest for x:9 not found: manifest unknown: manifest unknown`；大寫等：`invalid reference format`；`@sha256:` 說明是 E23 |
| `docker run [-d] [--name N] [-p [IP:]主機:容器[/udp]] [-e K=V] [--rm] [-i] [-t] [-w 目錄] IMAGE [指令…]` | 短選項可合寫（`-dit`、`-p8080:80`），選項只能在 IMAGE 之前。本機沒有 Image：標準錯誤 `Unable to find image 'nginx:latest' locally` 與拉取的過程（標準輸出只留容器 ID）。`-d` 印完整的 ID；不加 `-d` 時印出容器的輸出，程式型容器結束後 `docker run` 的結束碼就是容器的結束碼；伺服器在前景執行時說明模擬環境沒有 Ctrl-C、容器留在背景；`-it` 的互動式 Shell 說明沒有鍵盤、Shell 收到 exit（Exited (0)）。錯誤：名稱衝突 `Conflict. The container name "/web" is already in use by container "<ID>". You have to remove (or rename) that container to be able to reuse that name.`；連接埠被另一個容器占用 `driver failed programming external connectivity on endpoint web2 (<端點 ID>): Bind for 0.0.0.0:8080 failed: port is already allocated`、被主機的程式占用 `… Error starting userland proxy: listen tcp4 0.0.0.0:9090: bind: address already in use`（兩者容器都留在 Created）；找不到執行檔 `failed to create task for container: failed to create shim task: OCI runtime create failed: runc create failed: unable to start container process: error during container init: exec: "x": executable file not found in $PATH: unknown`（127，容器留在 Created）；不認得的選項 `unknown flag: --x`／`unknown shorthand flag: 'x' in -x` 加 See 行（125）；沒有 IMAGE：`"docker run" requires at least 1 argument.`、See 行、Usage、說明；只寫容器埠的 `-p 80` 說明模擬環境不隨機選主機埠 |
| `docker ps [-a] [-q] [--no-trunc] [-f status=…\|name=…] [--format …]`、`docker container ls` | `CONTAINER ID   IMAGE   COMMAND   CREATED   STATUS   PORTS   NAMES`，新的在前。COMMAND 是 Path 加 Args，截成 20 個字（第 20 個是 `…`）再加引號（`"/docker-entrypoint.…"`）。STATUS 照 moby：`Up 3 minutes`、`Exited (0) 2 minutes ago`、`Created`。PORTS 照 `DisplayablePorts`（§5.5）；停止的容器是空的。IMAGE 是使用者打的名稱，標籤被移走之後是 Image ID 的前 12 個字 |
| `docker logs [-f] [-t] [-n\|--tail N] 容器` | 容器的標準輸出印到標準輸出、標準錯誤印到標準錯誤；`-t` 前面加 `2026-11-22T10:00:00.000000000Z`；`-f` 接受，但不會等待新的輸出（執行中的容器另外說明）。停止後仍在，刪除後是 `No such container` |
| `docker exec [-i] [-t] [-e K=V] [-w 目錄] 容器 指令…` | 在**執行中**的容器裡執行（否則 `Error response from daemon: container <ID> is not running`）；`ps` 是 procps 的版面（`    PID TTY          TIME CMD`，PID 1 是主程式、自己是 7 起）；`env` 是 PATH、HOSTNAME、（`-t` 時 TERM）、`-e`、Image 的 ENV、HOME；Image 沒有的執行檔：`OCI runtime exec failed: exec failed: unable to start container process: exec: "ps": executable file not found in $PATH: unknown`（127）；`sh -c` 裡找不到的指令 `sh: 1: x: not found`（127）。沒有指令的 `sh`／`bash` 說明沒有互動式 Shell |
| `docker stop\|start\|restart 容器…` | 每個成功的印出使用者打的名稱。`stop`：伺服器收到 SIGTERM 正常結束（0，或 Image 的 `stopExit`）；`sleep`、`sh` 這類 PID 1 不處理 SIGTERM，10 秒後 SIGKILL：`Exited (137)`（**這 10 秒不讓時鐘前進**）。`start` 重新執行容器的指令（日誌往後加），連接埠被占用時印錯誤與 `Error: failed to start containers: x`；`-a` 印出輸出 |
| `docker rm [-f] 容器…`、`docker container rm` | 執行中：`cannot remove container "/web": container is running: stop the container before removing or force remove`；`-f` 先結束再刪除 |
| `docker rmi [-f] IMAGE…`、`docker image rm` | 有容器（任何狀態）用它：`conflict: unable to remove repository reference "nginx" (must force) - container <ID> is using its referenced image <ID>`；成功：`Untagged: nginx:latest`、`Untagged: nginx@sha256:…`、`Deleted: sha256:<Image ID>` 與每一層的 `Deleted:`；`-f` 而仍有容器使用時：執行中的容器使用就只移除標籤（成為 dangling），只有停止或 created 的容器使用就照樣刪除（§10 第 6 項）。沒有：`No such image: x:latest` |
| `docker container prune [-f]` | `WARNING! This will remove all stopped containers.`、`Are you sure you want to continue? [y/N] `；沒有鍵盤時說明（請加 `-f` 或 `echo y \|`），管線的答案不會顯示，所以下一行接在提示後面；`Deleted Containers:`、每個完整 ID、空行、`Total reclaimed space: 5B` |
| `docker port 容器 [埠[/協定]]` | `80/tcp -> 0.0.0.0:8080` 與 `80/tcp -> [::]:8080`；指定埠時只印位址；沒有：`Error: No public port '81/tcp' published for web` |
| `docker inspect [-f 格式] 名稱…` | 先找容器，再找 Image。`-f` 支援 `{{.欄位.欄位}}`、`{{json .欄位}}` 與字面文字；模擬的欄位：`.Id`、`.Created`（RFC 3339，整秒）、`.Path`、`.Args`、`.State`（Status、Running、Paused、Restarting、OOMKilled、Dead、ExitCode、Error、StartedAt、FinishedAt；沒有過的時間是 `0001-01-01T00:00:00Z`）、`.Image`、`.Name`（`/web`）、`.RestartCount`、`.HostConfig.PortBindings`、`.HostConfig.AutoRemove`、`.Config`（Hostname、Env、Cmd、Image、WorkingDir、Entrypoint、ExposedPorts、Tty、OpenStdin）、`.NetworkSettings`（IPAddress、Gateway、Ports）；Image 是 Id、RepoTags、RepoDigests、Created、Size、Os、Architecture、Config。值照 Go 的 text/template 印（`[nginx -g daemon off;]`、`true`）。沒有 `-f` 時印出模擬的欄位的 JSON 並說明真實的輸出有更多欄位；模擬環境沒有的欄位（例如 `.State.Health`、`.State.Pid`）說明不支援（結束碼 1），不印假的值。找不到：`Error: No such object: x` |
| 其他 | `docker` 沒有參數印縮短的 Usage 與支援的指令；不存在的指令 `docker: 'x' is not a docker command.`、`See 'docker --help'`；真實存在但屬於之後階段的指令（build、history、volume、network、compose、push、tag、login、stats、top、kill…）說明是哪一個引擎階段（E21–E24）。`images` profile 起 build、history、`docker image build|history|prune`、`docker buildx build` 可用（§11）；`containers` profile 仍說明是 E21 |

### 5.4 `--format`

`docker ps` 與 `docker images` 的 `--format` 支援 `{{.欄位}}` 與 `table` 開頭（標題列與 tabwriter 欄位）、`\t`。ps：ID、Image、Command、RunningFor、CreatedAt、Status、Ports、Names、State；images：Repository、Tag、ID、CreatedSince、CreatedAt、Size。其他欄位與函式（`json`、`join`）說明不支援。

### 5.5 連接埠

- `-p 8080:80` 綁定 0.0.0.0 與 `::`（Docker 預設也發布到 IPv6），所以 `docker ps` 是 `0.0.0.0:8080->80/tcp, [::]:8080->80/tcp`、`docker port` 兩行；`-p 127.0.0.1:8080:80` 只有一行，而且只有本機的 127.0.0.1 連得到。
- `DisplayablePorts` 照 docker/cli：依容器埠、位址、主機埠排序；主機埠與容器埠相同的依「位址/協定」分組（連續的埠合成範圍），寫成 `位址:埠->埠/tcp`——IPv6 用字串串接，所以是 `:::443->443/tcp`；不同的寫成 `net.JoinHostPort` 的 `[::]:8080->80/tcp`，排在分組之後；Image EXPOSE 而沒有發布的埠是 `80/tcp`。
- **簡化**：模擬的 socket 只有 IPv4（E10 起的限制），所以 `ss` 只有 `0.0.0.0:8080` 那一個 docker-proxy；真實的 Docker 另有 `[::]:8080` 的 proxy。容器埠不是 Image 的服務埠時 `curl` 得到 `(52) Empty reply from server`（真實的 docker-proxy 也可能是 `(56) Recv failure: Connection reset by peer`）。iptables 的 DNAT、`docker0` 介面（`ip addr` 不顯示）、hairpin NAT 不模擬。

### 5.6 權限與決定論

- **權限**：`docker` 連 `/run/docker.sock`（`/var/run` 在 Ubuntu 是連到 `/run` 的連結，訊息照真實的寫 `unix:///var/run/docker.sock`）；root（`sudo docker …`）或對 socket 有讀寫權限（`docker` 群組，E3 的登入群組：`usermod -aG docker learner` 之後要重新登入或 `newgrp docker`）才可以。否則 `permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock: Get "http://%2Fvar%2Frun%2Fdocker.sock/v1.47/containers/json": dial unix /var/run/docker.sock: connect: permission denied`（結束碼 1；`docker run` 是 `docker: ….` 加 See 行、125）。`sudo chmod 666 /run/docker.sock` 也有效（課文說明為什麼不能這樣做：docker 群組等於 root）。**簡化**：socket 是一般檔案（`ls -l` 顯示 `-rw-rw----` 而不是 `srw-rw----`）。
- **時鐘**：建立、啟動、結束時間都是機器的 `now`；只有 `sleep`（E18 起）讓時鐘前進，所以剛啟動的容器是 `Up Less than a second`，`sleep 180` 之後是 `Up 3 minutes`。`sleep N` 的容器在時鐘過了 N 秒之後，下一個 `docker` 指令（或檢查）看到它已經結束（`Exited (0) 1 second ago`）。
- **沒有亂數**：Image ID、digest、層的 ID、容器 ID、端點 ID、產生的名稱都由資料的 SHA-256 算出。

## 6. 課程資料與檢查（`src/lib/terminal/docker-lesson.ts`）

```ts
machines: [{ ..., profile: 'containers',
  responders: [{ id: 'nginx-site', server: 'nginx/1.27.3', routes: [...] }],      // Image 的服務用哪個回應者（E12）
  docker: {
    images: [{ name: 'nginx:1.27', size, created, cmd, entrypoint?, env?, workdir?, expose?, http?: { port, responder, accessLog?: 'nginx' },
               service?, logs?, output?, exit?, stopExit?, commands?, files?: [{ path, content }], osRelease?, layers?, pulled?, registry?: false }],
    containers: [{ name, image, command?, state: 'created' | 'running' | 'exited', created, started?, finished?, exitCode?, ports?: ['8080:80'],
                   env?, logs?, files?, rm? }] } }]
```

| 規則 | 內容 |
|---|---|
| profile | `docker` 需要 `containers`（「`docker needs the containers profile (engine stage E20)`」）；只在本機（遠端機器沒有這個欄位） |
| Image | 最多 12 個；名稱是合法的參照（小寫）且不重複；大小 0–2^40；建立時間不晚於 now；CMD（加 ENTRYPOINT）1–20 個一行的字；ENV 是 `NAME=value`；WORKDIR 是絕對路徑；埠 1–65535；`http` 的回應者是這台機器的；`service` 與 `output` 二選一；結束碼 0–255；`commands` 在模擬環境認得的執行檔中；最多 40 個檔案；層數 1–20；`registry: false` 的必須 `pulled` |
| Container | 最多 12 個；名稱 `[a-zA-Z0-9][a-zA-Z0-9_.-]` 且不重複；Image 是已拉取的；created ≤ started ≤ finished ≤ now，running 有 started 沒有 finished、exited 兩者都有、created 都沒有；執行中的容器不能發布同一個主機埠（port is already allocated） |
| 產生的東西 | §5.1 的檔案、群組、行程與 unit 只在課程沒有列出時加入；執行中的容器一開始就有 docker-proxy 與回應者 |
| 變體 | `docker`（`containers` 以上）換掉 Image 與容器，讓「讀 `docker ps` 的答案」不能直接打出來 |

| 檢查 | 意義 |
|---|---|
| `{ kind: 'container', name, absent?, state?, image?, port?: '8080:80', exitCode?, env?: 'K=V' }` | 名為 name 的容器存在（`absent`：不存在）、狀態、由哪個 Image 建立（參照正規化後比對）、發布了這個「主機埠:容器埠」（可寫 `127.0.0.1:8080:80`）、結束碼、環境變數；看指令之後的 daemon（`sleep N` 結束的也算） |
| `{ kind: 'image', name, absent? }` | 本機有（沒有）這個 Image |
| `http`（既有，E12） | `http://localhost:8080/` 經由 docker-proxy 到容器的服務；容器停止就不通過 |

## 7. 測試

| 檔案 | 內容 |
|---|---|
| `tests/docker-capability.test.ts` | 五種藍圖活動的對應（15 堂）、LNX 與 SRV 的對應與錯誤不變、各島只接受自己的課、合成的 DKR04（Docker 主機、三段紀錄、兩個練習）通過 `validateContent`、預備島嶼時被 `validateCurriculum` 拒絕、島嶼的登錄與 15 堂規劃中的大綱、`validateCurriculum(curriculum)` 是 `[]`（先呼叫 `validateTerminalLessonsFirst()`） |
| `tests/terminal-e20.test.ts` | profile 的分界（`diagnostics`、`edge`、`scheduling` 是 command not found，清單沒有 docker，較低的機器沒有 daemon、資料欄位要 `containers`）、說明頁與 help、沒有安裝、產生的群組與 socket 與 unit 與行程、權限（docker 群組、sudo、usermod 與 newgrp、chmod 666）、version 與 info、images 的版面與 Go 的單位與時間、pull 的每種輸出與錯誤、ps 與 ps -a、時鐘前進、hello-world、生命週期（可寫層與日誌在 stop／rm 前後）、`--rm`、`-e`、`sleep N` 自己結束、stop 的 0 與 137、互動式 Shell、run 的每種錯誤、之後階段的指令、連接埠（ps、ss 的 docker-proxy、curl、存取日誌、port）、停止後連不到、錯的容器埠、127.0.0.1、`DisplayablePorts`、exec、logs 的 --tail 與 -t、inspect、rmi、prune、資料驗證、課程宣告的執行中容器、`container`／`image`／`http` 檢查、合成課程（含 docker 變體的 output 檢查）、不改動傳入的狀態 |
| `tests/terminal-e20-fixes.test.ts` | §10 的修正，每項一個測試，加上 `docker rmi -f` 的兩種情形（只有停止／created 的容器使用、執行中的容器使用）與 Alpine 的 BusyBox `ls` 錯誤訊息 |
| `tests/support/docker-fixture.ts` | 只供測試：dock-01（learner 在 docker 群組；nginx、alpine、ubuntu 已拉取，hello-world、redis 只在 Docker Hub；停止的 old-web、執行中的 worker）、fresh-01（還不在 docker 群組）、兩個練習 |

`tests/terminal-e1.test.ts` 的 `PROFILES` 期望值加上 `containers`。全部已發布的課（LNX、SRV 等）`terminalContentProblems` 仍是空的，較低的 profile 逐字不變。

## 8. 只在課文說明、或不支援的部分

- **核心機制**：namespace、cgroup、overlay2 的分層、OCI 規格、containerd 與 runc 的分工、Hypervisor 與虛擬機——模擬環境只模擬 CLI 看得到的結果，DKR01、DKR02 以網路情境與課文說明。容器裡的程式不出現在主機的 `ps`（真實的主機看得到它們）。
- **E21–E24 的功能**（§4）：Dockerfile 與 `docker build`、`history`（E21 已完成，§11；`docker commit` 在 `images` profile 說明不支援）；Volume、bind mount、`docker network`、容器之間以名稱連線（E22 已完成，§12）；Compose、多階段建置、`tag`／`push`／`login`、以 digest 拉取、HEALTHCHECK 與健康狀態（E23 已完成，§13）；資源限制、OOMKilled、重新啟動策略、`stats`／`top`／`kill`／`events`／`pause`（E24）。在較低的 profile 輸入這些指令時說明是哪一個階段。
- **其他**：`docker create`、`attach`、`cp`、`rename`、`system prune`、`save`／`load`、`context`、`buildx`；daemon 停止的情形（`systemctl stop docker` 不影響 `docker` 指令：`Cannot connect to the Docker daemon` 留到 E24）；互動式的終端機（`-it` 的 Shell、`docker logs -f` 的等待、前景伺服器的 Ctrl-C）；`docker exec -d`、`-u`；`docker ps -s`、`-n`、`-l` 與其他過濾條件；`--format` 的函式；`ls -l` 在容器裡的欄位依模擬環境的 `ls`；`ps` 只支援不加選項（BusyBox 的 `ps` 版面不同）；`/etc/resolv.conf`、IPv6 的 socket、`docker0`、iptables。
- **日誌**：Image 的 `logs` 是課程寫好的固定文字（例如 nginx 的 `[notice]` 行裡的時間），不會隨啟動時間改變；`-t` 的時間戳記才是啟動的時間。
- **大小**：`docker container prune` 的回收空間只算可寫層裡內容改變的檔案的位元組（真實的值另有 overlay 的中繼資料）。

## 9. 沒有把握的地方（依文件的格式寫，並在此註明）

- **版本**：選定 Docker CE 27.5.1（錯誤訊息的格式依 docker/cli 與 moby 的 v27.5.1 原始碼：`reportError` 的句點與 See 行、`DisplayablePorts`、`cannot remove container`；28.x 改成 `Run 'docker run --help' for more information`，所以版本與格式一起固定在 27.5.1）。Client 的 Go 版本 go1.22.11、containerd 1.7.25、runc 1.2.4、`build 9f9e405` 是依當時的發行資料寫的，沒有在真實主機逐字核對。
- **權限錯誤裡的 API 路徑**：真實的訊息在版本協商失敗時可能是 `/v1.24/…` 或 `_ping`；模擬環境一律寫 `/v1.47/<端點>`（`docker run` 寫 `Head "…/_ping"`）。重點的前綴一致。
- **runc 的錯誤**：`error during container init:` 這一段是 runc 1.2 的寫法；舊的 runc 沒有它。`docker exec` 找不到執行檔的結束碼，較新的版本是 127（舊版是 126）。
- **docker-proxy**：Docker 27 的參數（是否有 `-use-listen-fd`）與它持有的 fd 編號（模擬環境寫 4）沒有核對。
- **`docker run` 缺少參數的訊息**：照 docker/cli 的 `RequiresMinArgs` 格式；結束碼模擬為 1。
- **`docker container prune` 回答 N**：模擬環境不印任何東西、結束碼 0。
- **IPv6 的 PORTS**：`[::]:8080->80/tcp` 與 `:::443->443/tcp` 的差異照 27.5.1 的原始碼（`net.JoinHostPort` 與字串串接），主機沒有 IPv6 時真實的 Docker 只顯示 IPv4。

## 10. E20 的修正（2026-11-23，依 Docker CE 27.5.1 的行為）

課程撰寫者回報的差異，修在 `src/lib/terminal/docker.ts`（Image 檢查在 `docker-lesson.ts`）。已發布的 DKR01–DKR04 的 `terminalContentProblems` 仍是 `[]`，所有範例、練習的參考解答與變體的輸出逐字不變（修正前後逐一重播比對）；唯一改變的重播輸出是 DKR03 清理練習的典型錯誤 `docker rmi -f python:3.12-slim`（第 6 項：現在多了 `Deleted:` 各行，它仍然不通過檢查，原因已改寫）。`tests/terminal-e20.test.ts` 的 rmi 測試原本把「`-f` 只移除標籤」當成停止容器的情形，已改成會刪除。

| # | 修正 | 行為 |
|---|---|---|
| 1 | `docker info --format`（`-f`） | 套用 Go template，只印出結果與換行（docker/cli 的 `formatInfo`）。欄位依 API 的 `system.Info`：`KernelVersion`、`OperatingSystem`、`ServerVersion`、`Driver`、`LoggingDriver`、`CgroupDriver`、`CgroupVersion`、`NCPU`、`MemTotal`（位元組）、`Containers`、`ContainersRunning`、`ContainersPaused`、`ContainersStopped`、`Images`、`Name`、`DockerRootDir`、`OSType`、`Architecture`。不存在的欄位是 Go 的錯誤 `template: :1:N: executing "" at <.X>: can't evaluate field X in type system.dockerInfo`（先印出錯誤之前的文字與換行，結束碼 1）；真實存在但沒有模擬的欄位（`.Swarm`、`.Plugins`…）與函式說明不支援。不加 `--format` 的輸出不變 |
| 2 | 容器裡的 `uname` | 容器沒有自己的核心：`-r`、`-v`、`-m` 是主機的值，`-n` 是容器的 hostname（Container ID 前 12 個字）。Image 沒有宣告 `commands` 時預設就有（`IMAGE_COMMANDS` 多了 `uname`）；宣告了而不含 `uname` 的 Image 仍是 OCI 的「executable file not found」。Alpine（`/etc/os-release` 的 `ID=alpine`）是 BusyBox 的 `uname`，`-o` 是 `Linux` 而不是 `GNU/Linux` |
| 3 | 主程式是 `ps` | `docker run IMAGE ps`（或 `sh -c ps`，Shell 直接 exec 單一指令）只列出自己，PID 1。`docker exec` 的 `ps` 不變（PID 1 是主程式、自己從 7 起） |
| 4 | `sh -c` 的 `exit` | `exit` 是 Shell 的內建指令：`exit N` 的結束碼是 N（超過 255 取 N mod 256）、`exit` 是前一個指令的結束碼，也可以寫在最後（`指令; exit N`）。不是數字：`sh: 1: exit: Illegal number: x`、`bash: line 1: exit: x: numeric argument required`（2）。其他位置的 `exit`（例如 `false \|\| exit 3`）說明不支援 |
| 5 | `docker start -a` | 附加時以容器的結束碼結束（和 `docker run` 相同）；`-a` 加上多個容器是 `you cannot start and attach multiple containers at once`（1） |
| 6 | 沒有標籤的 Image | `docker rmi -f 名稱:標籤` 移除最後一個標籤時依 moby 的 `imageDeleteHelper`：`-f` 只忽略停止（含 created）容器的衝突，所以**只有停止的容器使用時照樣刪除** Image 與各層（印出 `Untagged:` 與 `Deleted:`），那些容器留著、指向已不存在的 Image，`docker ps -a` 的 IMAGE 顯示舊的 Image ID；**有執行中的容器使用時只移除標籤**，Image 留在本機成為 dangling：`docker images` 列為 `<none>   <none>`（指定儲存庫時不列）、`docker info` 的 Images 仍算它、只能用 Image ID 指名、`image` 檢查視為沒有這個標籤。`docker rmi <ID>`：執行中的容器使用時 `conflict: unable to delete <ID> (cannot be forced) - image is being used by running container <ID>`，停止的容器使用時不加 `-f` 是 `(must be forced) … stopped container …`，沒有容器使用時印出 `Deleted:`。再 `docker pull` 同一個標籤：各層 `Already exists`，Image 重新有標籤。`docker images --digests` 在 TAG 之後加 DIGEST 欄（`sha256:…`；dangling 與只在本機的 Image 是 `<none>`），`--format` 可用 `{{.Digest}}`；`-f dangling=true\|false`（也接受 1／0，其他值是 `invalid filter 'dangling=x'`） |
| 7 | `docker ps --filter publish=`、`expose=` | 依 moby 的 `portOp`：`埠[/協定]` 或範圍 `起-迄[/協定]`，預設 tcp。`publish` 比對 HostConfig.PortBindings 的主機埠（停止的容器也保有，所以 `-a` 會列出）；`expose` 比對 Config.ExposedPorts（Image 的 EXPOSE 加上 `-p` 的容器埠）。同一個條件的多個值是「或」，不同條件是「且」。含 `:` 是 `filter for 'publish' should not contain ':': 8080:80`；不是數字是 `error while looking up for expose x: strconv.ParseUint: parsing "x": invalid syntax` |
| 8 | `docker inspect` 的 `Config.Env` | 建立容器時的設定：`-e` 的值，接著 Image 的 ENV 中沒有被 `-e` 蓋過的（moby 的 merge），Image 沒有 PATH 時補上預設的 PATH。HOSTNAME、HOME、TERM 是行程啟動時才加的，不在 `Config.Env`；容器裡的 `env` 與 `container` 檢查的 `env` 仍看得到它們 |
| — | Alpine 的 `ls` 錯誤 | BusyBox 的格式：`ls: /nope: No such file or directory`（GNU 是 `ls: cannot access '/nope': …`） |

**沒有修**：Alpine 的 `ps` 仍是 procps 的版面（BusyBox 是 `PID   USER     TIME  COMMAND`；要改既有測試與 `ps` 的模擬，不是小修）；主機的 `ps` 不列出容器的行程；`docker logs -t` 的時間；digest 只由名稱與標籤決定。`docker rmi -f` 遇到只有停止的容器使用時的行為已依真實的 Docker 修正（第 6 項），DKR03 的課文、測驗 q4 的解說與清理練習的典型錯誤一併更正（範例輸出不變）。

## 11. 引擎階段 E21：`images` profile（`src/lib/terminal/build.ts`、`docker.ts`、`docker-lesson.ts`）

> 2026-11-23。給 DKR05（撰寫 Dockerfile）與 DKR06（Image 分層與建置快取）。依 Docker CE 27.5.1 與它預設的建置器 BuildKit（`docker build` 是 `docker buildx build` 的別名，driver 是 `docker`，Image 存在 overlay2 的傳統 Image 儲存區）。E20 的行為與所有已發布的課（DKR01–DKR04 與其他島）逐字不變：新的行為只在 `images` profile 起出現。

### 11.1 選用方式

| 項目 | 內容 |
|---|---|
| `IMAGES_PROFILE` | `containers` 的一切，**沒有新的指令**（`docker` 已在 E20），feature `images`。`docker` 收到 `images: true` 時才有 `docker build`、`docker history`、`docker image build|history|prune`、`docker buildx build`、`docker builder build`；`containers` profile 這些仍是「模擬環境在引擎階段 E21（Dockerfile、建置、分層與快取） 才支援」（`docker image prune` 仍是 `'image prune' is not a docker command.`） |
| 說明頁與 help | `docker --help`、`man docker` 印 `IMAGES_MANUAL`（多了 build、history、image prune）；`help` 的 docker 行多了 `build|history`；沒有參數的 `docker` 多列 build 與 history |
| 課程資料 | `TerminalImage` 的 `user`、`labels`、`packages`、`history` 與機器的 `docker.programs` 需要 `images`（「`… need the images profile (engine stage E21)`」） |
| `docker commit` | `images` profile 說明不支援（請寫成 Dockerfile 再建置），不假裝 |

### 11.2 建置的模型

| 項目 | 內容 |
|---|---|
| 建置內容 | `docker build [選項] 資料夾`：資料夾（相對於目前目錄）裡的每個檔案，扣掉 `.dockerignore` 排除的；Dockerfile 預設是 `資料夾/Dockerfile`，`-f` 相對於目前目錄。不讀標準輸入（`-`）與網址 |
| Dockerfile 的解析 | 開頭的 parser directive（`# syntax=…`、`# escape=…`）忽略；`#` 開頭的行是註解（續行中的註解行也拿掉）；行尾 `\` 續行，**反斜線與換行直接拿掉**（所以 `apt-get update && \`＋下一行縮排變成 `&&     apt-get`，history 也是這樣）。指令不分大小寫；JSON 陣列是 exec 形式，否則是 shell 形式；`FROM`、`RUN`、`COPY`、`ADD` 前面的 `--旗標=值` 另外讀。變數代換（`$X`、`${X}`、`${X:-預設}`、`${X:+值}`、`\$`）用在 FROM（只有第一個 FROM 之前的 ARG）、COPY、ADD、WORKDIR、ENV、LABEL、EXPOSE、USER；RUN 的變數由建置容器的 Shell 展開（ARG 與 ENV 都是它的環境變數） |
| 指令 | FROM（`AS 名稱`）、RUN、COPY（`--chown`、`--chmod`）、ADD（只有本機的一般檔案）、WORKDIR、ENV、ARG、EXPOSE（TCP）、CMD、ENTRYPOINT（exec 與 shell 形式）、USER、LABEL。VOLUME 說明是 E22（`storage-net` profile 起可用，§12.3），HEALTHCHECK、STOPSIGNAL 是 E24，`COPY --from` 是 E23，ONBUILD、SHELL、MAINTAINER、`RUN --mount` 說明不支援，here-document（`RUN <<EOF`）說明不支援 |
| 多階段 | 只建置目標階段（最後一個，或 `--target`）：BuildKit 略過用不到的階段，所以其他階段不出現在輸出；有兩個以上的 FROM 時步驟名稱帶階段名（`[app 2/3]`，沒有名稱時 `[stage-1 2/3]`） |
| 基底 Image | FROM 先找本機的 Image（含建置出來的），再找模擬的 Docker Hub。只在 Docker Hub 的基底下載到**建置快取**，不會成為 `docker images` 裡的 Image（第一次的 FROM 步驟列出各層的下載與解開，之後只有 resolve）。`FROM scratch` 是空的檔案系統 |
| 步驟 | FROM 與每個 RUN、COPY、ADD、WORKDIR 是一步（`[k/N]`）；ENV、ARG、LABEL、EXPOSE、CMD、ENTRYPOINT、USER 只改 Image 的設定，不是步驟，但寫進 history（0B） |
| RUN | 在**建置容器**（基底的檔案系統）裡以 `/bin/sh -c`（shell 形式）或直接（exec 形式）執行，身分是當時的 USER（預設 root）。Image 沒有 `sh` 時 shell 形式失敗（`exec: "/bin/sh": stat /bin/sh: no such file or directory`）；USER 不在 Image 的 `/etc/passwd` 時失敗（`unable to find user X: no matching entries in passwd file`）。可用的指令見 §11.5 |
| 層 | 每一步之後比較檔案系統：有新增、改變或刪除的檔案就是一層（diff ID 由這些變化的內容算出，相同的變化得到相同的 diff ID），沒有變化是空的層（history 的 SIZE 0B，不在 `RootFS.Layers`）。**大小**是新增或改變的檔案的位元組數；套件的檔案以課程宣告的大小計（§11.5），目錄、權限與刪除算 0。層在 daemon 裡以 chain ID 保存（下面的層不同就是不同的層），`docker rmi` 與 `docker image prune` 只刪除沒有其他本機 Image 使用的層 |
| Image | 設定是基底的設定加上 Dockerfile 的變更（ENTRYPOINT 會清掉基底的 CMD，同一個階段先寫的 CMD 保留）；大小是各層大小的和；ID 由設定（含各層 diff ID 與 history）算出，所以只命中快取的重建得到同一個 ID 與 CREATED。沒有 `-t` 的 Image 是 `<none> <none>`；`-t` 可以給好幾個（同一個 ID 的幾列）；標籤移到新 Image 後舊的沒有標籤就成為 dangling。建置出來的 Image 沒有 repository digest（沒有 push 過） |
| 失敗 | 不產生 Image、標籤不動，但已經成功的步驟與下載的基底留在建置快取（再建置時是 `CACHED`） |

### 11.3 輸出的格式（決定：BuildKit 的 plain 格式）

`docker build` 的進度一律是 **plain 格式**（`--progress=plain`，也是標準錯誤不是終端機時 `auto` 的樣子），寫到**標準錯誤**；`-q`（或 `--progress=quiet`）只在標準輸出印 `sha256:<Image ID>`。終端機上真實的 `tty` 格式（`[+] Building 3.2s (9/9) FINISHED` 與會收合的列）不模擬，`--progress=tty|auto` 也印 plain。

```
#0 building with "default" instance using docker driver

#1 [internal] load build definition from Dockerfile
#1 transferring dockerfile: 161B done
#1 DONE 0.0s

#2 [internal] load metadata for docker.io/library/python:3.12-slim
#2 DONE 0.5s

#3 [internal] load .dockerignore
#3 transferring context: 2B done
#3 DONE 0.0s

#4 [1/4] FROM docker.io/library/python:3.12-slim@sha256:<digest>
#4 resolve docker.io/library/python:3.12-slim@sha256:<digest> done
#4 DONE 0.0s

#5 [internal] load build context
#5 transferring context: 1.59kB done
#5 DONE 0.0s

#6 [2/4] WORKDIR /app
#6 CACHED

#7 [3/4] COPY . .
#7 DONE 0.0s

#8 [4/4] RUN pip install --no-cache-dir -r requirements.txt
#8 0.355 Collecting flask==3.0.3 (from -r requirements.txt (line 1))
…
#8 DONE 3.0s

#9 exporting to image
#9 exporting layers 0.3s done
#9 writing image sha256:<Image ID> done
#9 naming to docker.io/library/app:1.0 done
#9 DONE 0.3s
```

| 項目 | 內容 |
|---|---|
| 編號與空行 | `#0` 一行與空行，之後每個步驟一段（`#N 名稱`、內容、`#N DONE 0.1s` 或 `#N CACHED` 或 `#N ERROR: …`），段與段之間空一行；最後一段（exporting）之後不空行 |
| 大小 | `transferring dockerfile`／`context` 用 Go 的 `HumanSize`（四位有效數字：`161B`、`1.59kB`）。沒有 `.dockerignore` 時是 `2B`；有的時候是它的位元組數。建置內容的大小是 COPY／ADD 用到的檔案（`.dockerignore` 排除之後）的位元組數 |
| 時間 | 決定論：`DONE` 與 RUN 每一行前的秒數（三位小數，遞增）由步驟的種類與輸出的行數算出（每個 apt 套件 0.6 秒、pip 0.4 秒、npm 0.3 秒、apt-get update 1.2 秒），不是真實的耗時；時鐘不前進 |
| 失敗 | 步驟段以 `#N ERROR: <原因>` 結束；接著 `------`、` > [k/N] 指令:`、最後 10 行輸出（帶秒數）、`------`；Dockerfile 的片段（`Dockerfile:行`、`--------------------`、前後各約兩行、`>>>` 標出指令、`--------------------`，依 BuildKit 的 `Source.Print`）；最後 `ERROR: failed to solve: <原因>`，結束碼 1。例：RUN 的 `process "/bin/sh -c …" did not complete successfully: exit code: 100`；COPY 找不到檔案 `failed to compute cache key: failed to calculate checksum of ref <id>::<id>: "/x": not found`；基底不存在 `failed to resolve source metadata for docker.io/library/python:3.13: docker.io/library/python:3.13: not found`；語法 `dockerfile parse error on line 3: unknown instruction: RUNN` |
| 參數錯誤 | 沒有資料夾：`ERROR: "docker buildx build" requires exactly 1 argument.`、`See 'docker buildx build --help'.`、Usage；`-t App`：`ERROR: invalid tag "App": repository name must be lowercase`；資料夾不存在：`ERROR: unable to prepare context: path "x" not found`；沒有 Dockerfile：`ERROR: failed to solve: failed to read dockerfile: open Dockerfile: no such file or directory`；權限：`ERROR: permission denied while trying to connect to the Docker daemon socket …` |
| 建置檢查的警告 | 建置成功後（BuildKit 的 build checks）：` N warning(s) found (use docker --debug to expand):` 與 ` - JSONArgsRecommended: JSON arguments recommended for CMD to prevent unintended behavior related to OS signals (line 7)`（CMD、ENTRYPOINT 的 shell 形式）、` - LegacyKeyValueFormat: "ENV key=value" should be used instead of legacy "ENV key value" format (line 5)`（ENV、LABEL 的舊格式）。其他檢查不模擬 |
| `docker history [--no-trunc] [-q] [-H|--human=false] [--format …] IMAGE` | `IMAGE   CREATED   CREATED BY   SIZE   COMMENT`，由新到舊；**只有最上面一列有 Image ID，其他都是 `<missing>`**（BuildKit 不產生中間 Image）；CREATED BY 截成 45 個字（第 45 個是 `…`），`--no-trunc` 印全部與完整的 `sha256:` ID；SIZE 是 Go 的三位有效數字；COMMENT 是 `buildkit.dockerfile.v0`。CREATED BY 依 BuildKit：`RUN /bin/sh -c <指令> # buildkit`（有 ARG 時 `RUN |1 MODE=prod /bin/sh -c …`）、`COPY . . # buildkit`、`WORKDIR /app`、`ENV A=1`、`ARG MODE=prod`、`EXPOSE map[5000/tcp:{}]`、`CMD ["python" "app.py"]`、`USER app`、`LABEL k=v`。`--human=false` 的 SIZE 是位元組、CREATED 是 RFC 3339；`--format` 的欄位 `.ID .CreatedSince .CreatedAt .CreatedBy .Size .Comment` |
| 課程 Image 的 history | 課程可以宣告 `history`（由舊到新；有大小或 `layer: true` 的列是層，層的大小加起來必須等於 Image 的大小，層數等於 `layers`）；沒有宣告時是每層一列（第一列 `ADD rootfs.tar.xz / # buildkit`，其餘寫明「（模擬：課程沒有宣告第 k 層的指令）」，大小平分）加上設定的列（ENV、WORKDIR、EXPOSE、ENTRYPOINT、CMD） |
| `docker image inspect` | 只找 Image（找不到是 `Error response from daemon: No such image: x:latest`）。`images` profile 起 Image 多了 `RootFS`（`{{.RootFS.Layers}}` 是各層的 `sha256:` diff ID，基底的在前）、`Config.User`、`Config.Labels`（沒有是 null）、所有標籤的 `RepoTags`，建置的 Image 的 `RepoDigests` 是 `[]`；容器的 `Config` 多了 `User` 與 `Labels`。`containers` profile 的 JSON 逐字不變 |
| `docker images`、`docker info` | 建置的 Image 列出它的標籤（同一個 ID 可以有幾列）、大小、CREATED；dangling 是 `<none>   <none>`。`docker info` 的 Images 以 ID 計 |
| `docker rmi`、`docker image prune` | 有好幾個標籤時以名稱刪除只印 `Untagged: app:1.0`；以 ID 刪除不加 `-f` 是 `conflict: unable to delete <ID> (must be forced) - image is referenced in multiple repositories`。最後一個標籤：`Untagged:`（建置的 Image 沒有 digest 那一行）、`Deleted: sha256:<Image ID>` 與沒有其他 Image 使用的層。`docker image prune [-a] [-f]`：`WARNING! This will remove all dangling images.`（`-a`：`… all images without at least one container associated to them.`）與 `[y/N]` 的問題（和 container prune 一樣沒有鍵盤時說明）、`Deleted Images:`、`untagged:`／`deleted: sha256:…` 各行、空行、`Total reclaimed space: 2.612MB`（刪除的層的大小）；有容器（任何狀態）使用的 Image 不刪 |

### 11.4 快取的規則

- 每一步的快取鍵是**前一步的鍵**加上**這一步的定義**；FROM 的鍵是基底 Image 的 ID。鍵在 daemon 的建置快取裡有，就是 `CACHED`（檔案系統與層直接取用，history 保留當時的時間）；沒有就執行，並記下來。一步失效，它的鍵改變，之後每一步的鍵都跟著改變，所以全部重新執行。
- 定義：RUN 是指令（exec 或 shell 形式的原文）、當時的環境變數（ENV 與已宣告的 ARG 的值）、WORKDIR 與 USER；COPY／ADD 是旗標、每個複製的檔案的**內容的 checksum**、權限與目的地（不含修改時間）；WORKDIR 是路徑。
- 所以：改了 `app.py`，`COPY . .` 失效，之後的 `RUN pip install` 重新執行；先 `COPY requirements.txt .` 再 `RUN pip install`、最後 `COPY . .`，改 `app.py` 只讓最後一步重新執行（經典的指令順序）。改了 `--build-arg` 或 ENV 的值，使用它們之後的 RUN 失效；它們之前的 COPY 仍是 CACHED。ENV、LABEL、CMD 等設定只影響 history 與 Image 設定，不影響 COPY 的鍵（BuildKit 的行為；舊的建置器不同，課文可以說明）。
- `--no-cache` 每一步都執行（並更新快取）。建置失敗時，成功的步驟與下載的基底仍留在快取。快取只在 daemon 的狀態裡，沒有 `docker builder prune`。
- `.dockerignore`：每行一個樣式（`#` 註解），相對於建置內容的根（開頭的 `/` 與結尾的 `/` 不影響）；`*`、`?`、`[…]` 不跨過 `/`，`**` 代表任意層的資料夾；樣式符合路徑本身或它上層的任何資料夾就排除，`!` 重新納入，**最後一個符合的樣式決定**（Go 的 `patternmatcher`）。所以 `node_modules` 只排除根的那一個，`**/node_modules` 排除每一層的。排除的檔案不在建置內容（transfer 變小）、COPY 不到（明確指名時是 `not found`），也不會進入 Image。

### 11.5 RUN 能做的事

| 指令 | 內容 |
|---|---|
| Shell | `;`、`&&`、`||` 的串列（`sh` 的優先順序，沒有 `set -e`）、`exit N`、`cd`、`export`、`set`（忽略）、`true`、`false`、`sh -c`／`bash -c`；`$X`、`${X}`、`${X:-預設}` 由 RUN 的環境展開（單引號內不展開）；`$(…)` 與反引號說明不支援。找不到的指令：Debian／Ubuntu 的 dash 是 `/bin/sh: 1: x: not found`，Alpine 的 BusyBox 是 `/bin/sh: x: not found`（127） |
| 檔案指令 | `pwd ls cd mkdir touch cat cp mv rm echo head tail grep wc hostname uname chmod chown chgrp ln id whoami sort cut tr tee uniq`，用模擬環境的 Shell（管線、重新導向、萬用字元）在建置容器的檔案上執行，權限依當時的 USER 與 Image 的 `/etc/passwd`、`/etc/group`（Image 沒有這兩個檔案時是 Debian 的系統帳號：root、daemon、bin、sys、www-data、nobody 65534） |
| `apt-get`、`apt` | Debian 與 Ubuntu 的 Image：E5 的套件引擎在 Image 的套件表（`packages.apt`）上執行，以 root、沒有終端機。套件清單一開始是空的：沒有先 `apt-get update` 就是 `E: Unable to locate package curl`（100）；沒有 `-y` 而要裝額外的相依套件時 `Do you want to continue? [Y/n] Abort.`（1）；非 root 是 lock 的錯誤（100）。`apt-get update` 列出各套件庫的 `Get:N <網址> <suite> InRelease` 與 `Reading package lists...`，並在 `/var/lib/apt/lists/` 寫一個大小為 `packages.aptLists`（預設 18MB）的檔案——所以 `rm -rf /var/lib/apt/lists/*` 寫在**同一個** RUN 才會讓 Image 變小，另寫一個 RUN 只會多一層 0B。安裝的輸出依 E5（`Reading package lists...` 等三行沒有 `Done`、套件區段、`Selecting…`、`Preparing to unpack…`、`Unpacking…`、`Setting up…`），每個套件的第一個檔案（預設 `/usr/bin/<名稱>`）以套件宣告的大小計。**縮短**：`Need to get`、`After this operation`、`Get:`（下載各套件）、`Fetched`、`debconf: …`、`(Reading database …` 不印 |
| `pip`、`pip3`、`python -m pip` | Image 宣告了 `packages.pip` 時才有。`pip install [-r 檔案] [名稱[==版本]…] [--no-cache-dir]`：依表與相依關係（相依在前）：`Collecting flask==3.0.3 (from -r requirements.txt (line 1))`、相依的 `Collecting werkzeug>=3.0.0 (from flask==3.0.3)`、`Installing collected packages: …`、`Successfully installed …`（依名稱排序）；找不到版本：`ERROR: Could not find a version that satisfies the requirement x (from versions: …)`、`ERROR: No matching distribution found for x`（1）。寫進 `/usr/local/lib/python<PYTHON_VERSION 的主次版本>/site-packages/<名稱>/`，以套件大小計；沒有 `--no-cache-dir` 時另在 `~/.cache/pip/` 留下約三分之一大小的快取檔（模型的數字）。**縮短**：`Downloading …`、以 root 執行的 WARNING、新版 pip 的 notice 不印 |
| `npm` | Image 宣告了 `packages.npm` 時才有。`npm install [名稱…] [--omit=dev]`、`npm ci`（沒有 `package-lock.json` 是 `npm error code EUSAGE` 與說明）：讀 `package.json` 的 dependencies（與 devDependencies），依表與相依關係寫進 `<目錄>/node_modules/<名稱>/`，印 `added N packages, and audited N+1 packages in 1s`、空行、`found 0 vulnerabilities`；沒有 package.json 是 `npm error code ENOENT` 等（254）；不在表裡：`npm error code E404`、`npm error 404 Not Found - GET https://registry.npmjs.org/x - Not found`。lock 檔的內容不檢查 |
| 帳號 | Debian／Ubuntu：`useradd [-r] [-m] [-u UID] [-g 群組] [-s Shell] [-d 家目錄] 名稱`、`groupadd [-r] [-g GID] 名稱`；Alpine：`addgroup -S 名稱`、`adduser -S [-G 群組] [-D] [-H] 名稱`；寫 `/etc/passwd` 與 `/etc/group`（沒有時先寫入系統帳號）。已存在：`useradd: user 'app' already exists`（9） |

### 11.6 執行期的 Image 設定與程式

- `docker run` 時 Env、Cmd、Entrypoint、WorkingDir、ExposedPorts（`docker ps` 的 `5000/tcp`、`--filter expose=`）、User、Labels 都來自建置的設定（E20 已有前五項的路徑）；USER 讓容器的程式（含 `docker exec`）以那個使用者執行，HOME 是它在 Image 的 `/etc/passwd` 裡的家目錄（沒有時 `/`）。USER 不在 Image 的 `/etc/passwd`（數字除外）：`docker: Error response from daemon: unable to find user ghost: no matching entries in passwd file.`（125）。沒有 CMD 也沒有 ENTRYPOINT（例如 FROM scratch）：`docker: Error response from daemon: no command specified.` 加 See 行（125）。
- **主程式**：ENTRYPOINT 與 CMD 和基底相同的 Image 行為和基底一樣（例如 `FROM nginx` 只 COPY 網頁，容器照樣是 nginx 的服務）。其他的執行它的指令：先找課程宣告的**程式**（`docker.programs`：`command` 逐字相同，shell 形式的 `/bin/sh -c '…'` 也比對裡面的字），它需要的檔案（`needs`，相對於工作目錄）都在才印 `logs` 並持續執行（`service`，可以有 `http` 回應者，`-p` 連得到）或印 `output` 並以 `exit` 結束；缺檔案時印 `missing.output`（標準錯誤）並以 `missing.exit` 結束（例如沒有安裝 flask 的 `ModuleNotFoundError`）。不是程式的指令照 E20 由模擬環境的 Shell 執行（`echo`、`cat` 等）或是 OCI 的「executable file not found」。`docker stop` 之後的結束碼是程式的 `stopExit`（預設 137：PID 1 沒有處理 SIGTERM，10 秒後被 SIGKILL）。
- **主機的 `ps`**（E20 已知差異的修正，只在 `images` profile 起）：執行中的容器在主機的行程表裡有 `containerd-shim-runc-v2 -namespace moby -id <ID> -address /run/containerd/containerd.sock`（父行程 1）與它的子行程——容器的主程式（`ENTRYPOINT`＋`CMD`，官方 Image 的 entrypoint 指令稿交棒之後的指令），用主機的 PID；使用者是 root 或容器使用者的 UID（主機的 `/etc/passwd` 沒有它）。容器停止就消失。**`containers` profile 不變**：在那裡打開會改變 DKR02（`pgrep -a containerd` 也會列出 shim）與 DKR04（第二個容器的 docker-proxy PID 由 903 變成 907）的範例輸出，所以 DKR01–DKR04 的課文說明（主機的 ps 看不到容器的行程）對它們的 profile 仍然正確。

### 11.7 課程資料與檢查

```ts
docker: {
  images: [{ name: 'python:3.12-slim', …E20 的欄位,
             user?: 'app', labels?: { k: 'v' },
             packages?: { apt?: [{ name, version, size, depends?, files? }], pip?: [...], npm?: [...], aptLists?: 19300000 },
             history?: [{ createdBy: 'ADD rootfs.tar.xz / # buildkit', size: 74800000 }, { createdBy: 'CMD ["python3"]' }] }],
  programs?: [{ command: ['python', 'app.py'], needs?: ['app.py', '/usr/local/lib/python3.12/site-packages/flask/__init__.py'],
                missing?: { output, exit? }, service?, logs?, output?, exit?, stopExit?, http?: { port: 5000, responder: 'flask-app' } }],
}
```

| 規則 | 內容 |
|---|---|
| Image 的 E21 欄位 | 需要 `images`；`user` 是名稱或 UID（可加 `:群組`）；labels 是一行的值；套件有名稱、版本、大小 0–2^32，`depends` 是同一張表的套件（pip 可寫版本條件），檔案是絕對路徑；`history` 1–40 列，層的大小加起來等於 `size`，`layers` 若寫了要等於層的列數 |
| 程式 | 需要 `images`；最多 12 個；`command` 1–20 個一行的字；`service` 與 `output` 二選一；結束碼 0–255；`http` 的回應者是這台機器的 |

| 檢查 | 意義 |
|---|---|
| `{ kind: 'image', name, absent?, label?: 'k=v', env?: 'K=V', cmd?: [...], entrypoint?: [...], user?, port?: 5000, workdir?, layers?: 7 }` | E20 的本機有（沒有）這個 Image；E21 另外比對設定的標籤、環境變數、CMD、ENTRYPOINT（exec 形式逐字）、USER（`''` 是沒有設定）、EXPOSE 的 TCP 埠、WORKDIR 與層數（`RootFS.Layers`）。這些欄位需要 `images`，不能和 `absent` 一起 |
| `{ kind: 'build', context, file?, change, cached?: [...], rebuilt?: [...] }` | 在指令之後的機器的**副本**上建置 `context`（絕對路徑，`file` 是另一個 Dockerfile），再把建置內容裡的 `change` 檔案加一個換行、再建置一次：`cached` 列出的步驟（以開頭比對，例如 `'RUN pip install'`）必須是 `CACHED`，`rebuilt` 列出的必須重新執行。建置失敗、找不到步驟都不通過（訊息寫出原因）。用來檢查「調整指令順序讓快取命中」，學習者不能只靠再建置一次而通過 |

### 11.8 測試

| 檔案 | 內容 |
|---|---|
| `tests/terminal-e21.test.ts` | profile（指令同 containers、多一個 feature；`containers` 以下 build、history、image build、buildx build 說明 E21，資料欄位要 `images`）、說明頁與 help 與 commit；Dockerfile 的解析、變數代換、`.dockerignore` 的樣式；完整的 plain 輸出、`-q`、全部 CACHED 的重建（同一個 ID 與 CREATED）、兩種指令順序的快取、requirements 改變與 `--no-cache`、build arg、`.dockerignore` 的 transfer 與 Image 內容、COPY 的各種來源與 `--chown`／`--chmod`、ADD；apt-get（沒有 update 的錯誤版面、update 與 install 的輸出、清單在同一層與分開的大小）、pip（快取與找不到版本）、npm（ci 沒有 lock 與 install）、只在 Docker Hub 的基底、USER 與權限、useradd、Alpine 的 adduser、Shell 的串列與 exit；參數、標籤、資料夾、Dockerfile、語法、COPY 找不到、基底不存在、scratch、之後階段的指令、權限、多階段與 `--target`、建置檢查的警告；history 的欄位與截斷與 `--no-trunc`／`-q`／`--human=false`／`--format`、課程宣告與預設的 history、RootFS.Layers、Image 設定；執行建置的 Image（程式經由 `-p`、日誌、環境、工作目錄、EXPOSE、stop 的 137）、缺檔案的程式、沒有指令、不存在的 USER、ENTRYPOINT 與 CMD、FROM nginx；主機的 ps（`images` 有、`containers` 沒有）；標籤移動與 dangling、幾個標籤、rmi、image prune 與回收的大小、`docker info` 的 Images；資料驗證、`image` 與 `build` 檢查、合成課程通過 `terminalContentProblems`、不改動傳入的狀態 |
| `tests/support/build-fixture.ts` | 只供測試：build-01（`images` profile；python:3.12-slim 已拉取、有宣告的 history 與 apt、pip 表，node:20-slim 只在 Docker Hub、有 npm 表與 node 使用者；`~/app` 是 Flask 應用與先 COPY 原始碼的 Dockerfile；`python app.py` 的程式）與快取順序的練習 |

`tests/terminal-e1.test.ts` 的 `PROFILES` 期望值加上 `images`。所有已發布的課的 `terminalContentProblems` 仍是 `[]`（逐一重播比對，E21 前後輸出相同）。

### 11.9 只在課文說明、或不模擬的部分

- **真實的層與儲存**：layer 的 tar 檔、壓縮、overlay2 的 snapshotter、whiteout 檔案、`/var/lib/docker` 的內容、真實的 digest；大小只是內容的位元組數（不含 tar 的標頭與中繼資料），diff ID 與 Image ID 是模型算出的 SHA-256。
- **網路**：RUN 期間沒有網路（apt、pip、npm 都只用課程的套件表，不下載）；`ADD <網址>`、git 的建置內容、壓縮檔的自動解開不模擬；`--pull`、`--platform`、`--secret`、`--ssh`、`--network`、`--output`、`--push`、`--load`、`--cache-from` 說明不支援。
- **輸出**：TTY 的進度畫面；真實的耗時；BuildKit 的增量傳送（真實的第二次建置只傳送改變的檔案，`transferring context` 變小；模擬環境每次報告用到的檔案的總大小）；並行的步驟（真實的步驟可能交錯出現在輸出裡，模擬環境依序）。
- **其他**：`docker builder prune`、`docker buildx` 的其他子指令、`docker commit`、`docker save`／`load`、heredoc、`RUN --mount`、`SHELL`、`ONBUILD`；BuildKit 的其他 build checks；`docker image prune --filter`；nginx 在主機 `ps` 的行程標題（真實是 `nginx: master process …` 與 worker 行程）。

### 11.10 沒有把握的地方（依記得的格式寫，並在此註明）

- **plain 進度的細節**：`#0 building with "default" instance using docker driver`、`transferring context: 2B`（沒有 `.dockerignore`）、FROM 步驟的 `resolve … done` 與第一次下載的 `sha256:… X / X 0.4s done`、`extracting …` 行，以及完全命中快取時 FROM 是 `DONE 0.0s`（真實的也可能顯示 `CACHED`）——依記得的 Docker 24–27 輸出，沒有在 27.5.1 逐字核對。步驟的順序（`load metadata` 在 `.dockerignore` 之前、`load build context` 在 FROM 之後）在真實環境可能因並行而不同。
- **錯誤訊息**：`"docker buildx build" requires exactly 1 argument.`（`docker build` 是別名時的寫法）、旗標錯誤的結束碼（模擬為 1）、`-f` 指到不存在的檔案時的訊息（也可能是 `unable to prepare context: unable to evaluate symlinks in Dockerfile path: …`）、`no build stage in current context`、scratch 沒有 `/bin/sh` 時的訊息、`unable to find user` 在 RUN 與 `docker run` 的寫法、`COPY` 的 checksum 錯誤中 ref 的格式（模擬為 UUID 樣式加 25 個字元，由資料算出）。Dockerfile 片段前後各幾行依記得的 `Source.Print` 演算法。未知指令在較新的 frontend 可能附上 `(did you mean …?)`，模擬環境不印。
- **build checks**：JSONArgsRecommended 與 LegacyKeyValueFormat 的訊息與摘要格式依 Docker 文件與記憶；它們是否也以 `#1 WARN: …` 出現在步驟段裡沒有核對（模擬環境只印最後的摘要）。
- **history**：`docker history` 對建置的 Image 只有最上面一列有 ID（BuildKit 與傳統 Image 儲存區）；CREATED BY 的格式（`# buildkit` 尾巴、`|1 MODE=prod` 前綴、`EXPOSE map[…]`、`CMD ["a" "b"]`）依記憶中官方 Image 的 history。WORKDIR 建立的資料夾在 BuildKit 是否算一層（模擬環境：建立了新的資料夾就是一層，大小 0B），以及 USER 之後 WORKDIR 建立的資料夾的擁有者（模擬為 root）沒有核對。
- **快取**：只命中快取的重建得到同一個 Image ID 與 CREATED（依記得的 BuildKit 行為：Image 的時間取自 history）；ENV、ARG 對 COPY 的鍵沒有影響（BuildKit 的 LLB），舊的建置器（`DOCKER_BUILDKIT=0`）不同。
- **基底**：只在 Docker Hub 的基底建置後不出現在 `docker images`（docker driver 與傳統 Image 儲存區時的行為，依記憶）；`load metadata` 一律 0.5s。
- **套件工具**：apt-get 沒有終端機時三行「Reading …」沒有 `Done`（依 Docker 建置紀錄的記憶）；pip 的 `Successfully installed` 的排序（模擬為依名稱）與相依的 `Collecting` 括號內的寫法（真實是 `(from flask==3.0.3->-r requirements.txt (line 1))` 這類較長的形式）；npm 10 的 `npm error` 前綴（npm 9 以前是 `npm ERR!`）與 `added … audited …` 的秒數。
- **ENTRYPOINT 與 CMD 的 shell 形式**：shell 形式的 CMD 讓 `/bin/sh` 當 PID 1，它是否轉送 SIGTERM（dash 是否以 exec 執行最後一個指令）依版本而定；模擬環境不推論，`docker stop` 的結束碼由課程的程式宣告（預設 137）。

## 12. 引擎階段 E22：`storage-net` profile（`src/lib/terminal/storage-net.ts`、`storage-net-cli.ts`、`tar.ts`、`docker.ts`、`docker-lesson.ts`）

> 2026-11-23。給 DKR07（Volume 與資料保存）與 DKR08（容器網路）。依 Docker CE 27.5.1。E20、E21 的行為與所有已發布的課（DKR01–DKR06 與其他島）逐字不變（全部終端機課的範例、參考解答、典型錯誤與變體在改動前後逐一重播，輸出與檢查結果相同）：新的行為只在 `storage-net` profile 起出現。

### 12.1 選用方式

| 項目 | 內容 |
|---|---|
| `STORAGE_NET_PROFILE` | `images` 的一切加上 `tar`（`E22_COMMANDS`），feature `storage-net`。`images` 以下 `tar` 是 `command not found`（各 profile 的清單不變） |
| profile 以下 | `docker volume …`、`docker network …`、`docker cp` 說明是引擎階段 E22（和 E20 起相同）；`docker run` 的 `-v`、`--volume`、`--mount`、`--tmpfs`、`--network`、`--net`、`--network-alias` 說明 E22（結束碼 125；原本是 `unknown shorthand flag: 'v' in -v` 這類訊息，已發布的課沒有用到，重播確認）；Dockerfile 的 VOLUME 仍是 E22 的建置錯誤 |
| 說明頁與 help | `docker --help`、`man docker` 印 `STORAGE_NET_MANUAL`；`tar --help`、`man tar` 印 `STORAGE_MANUAL.tar`；`help` 的 docker 行加上 volume、network，多一行 tar；沒有參數的 `docker` 多列 `Management Commands:`（network、volume） |
| 課程資料 | `docker.volumes`、`docker.networks`、容器的 `volumes`／`network`／`aliases`／`user`、Image 的 `volumes` 需要 `storage-net`（「`… need the storage-net profile (engine stage E22)`」） |
| `docker cp` | `storage-net` 說明不支援（請用 bind mount、Volume 或 `docker exec 容器 cat`），不假裝 |

### 12.2 模型

| 項目 | 內容 |
|---|---|
| 具名 Volume | daemon 記錄名稱、建立時間、是否匿名；內容就是主機的資料夾 `/var/lib/docker/volumes/名稱/_data`（`/var/lib/docker/volumes` 與 `名稱` 是 root 的 `drwx-----x`，`_data` 預設 root 的 0755），所以 `docker rm` 之後資料還在、`sudo ls`／`sudo cat` 看得到，一般使用者因為 `/var/lib/docker`（0710）看不到。`-v 名稱:/路徑`、`--mount type=volume,source=…` 與 `docker volume create` 建立；多個容器可以掛同一個 Volume |
| 匿名 Volume | `-v /路徑`、沒有 source 的 `--mount type=volume`、Image 的 VOLUME（沒有被其他掛載蓋住的路徑）。名稱是由容器 ID 與路徑算出的 64 個十六進位字。`docker rm` 留下它（dangling），`docker rm -v` 與 `--rm` 的容器結束時一起刪除；`docker volume prune` 預設只刪匿名的（Docker 23 起），`-a` 刪所有沒有容器使用的 |
| copy-up | 掛上**空的** Volume（新建立的或原本就空的）時，先把 Image 在那個路徑的內容（含資料夾本身的擁有者與權限）複製進去，所以 `-v html:/usr/share/nginx/html` 一開始就有 nginx 的 index.html；bind mount 從不複製（掛空資料夾就是空的） |
| bind mount | 主機的資料夾或單一檔案。`-v /絕對路徑:…`、`-v ./相對路徑:…`（Docker 23 起，相對於目前目錄；`$(pwd)` 由 Shell 展開）；沒有 `/` 或 `./` 開頭的是 Volume 名稱（常見錯誤：`-v data:/x` 建立了名為 data 的 Volume）。`-v` 的來源不存在時 Docker 以 root（0755）建立資料夾；`--mount type=bind` 的來源不存在是錯誤。雙方即時看到同一份檔案：主機改了，容器（與它的 nginx）下一個請求就看到；容器寫的，主機立刻看到 |
| tmpfs | `--tmpfs /路徑` 或 `--mount type=tmpfs,target=…`：內容存在容器的紀錄裡（根目錄 1777），容器停止（`docker stop`、程式結束）就清空 |
| 容器看到的檔案 | 每個指令都在「容器自己的檔案＋依深度疊上的各個掛載」上執行，之後把掛載底下改變的部分寫回來源（主機或 tmpfs）；掛載點底下原本 Image 的內容被蓋住、留在容器自己的層 |
| 唯讀 | `:ro`、`--mount …,readonly`：寫入被拒絕，變更不寫回，印出 `touch: cannot touch '…': Read-only file system`、`sh: 1: cannot create …: Read-only file system`、`rm: cannot remove '…': …`、`mkdir: cannot create directory '…': …`、`cp: cannot create regular file '…': …`、`tar: …: Cannot open: …` 等（結束碼 1） |
| 擁有者是數字 | 主機的 `/etc/passwd`（帳號資料）與 Image 的 `/etc/passwd`、`/etc/group` 以 UID／GID 對應：learner（1000）的檔案在 node Image 裡是 node 的，在沒有 1000 的 Image 裡顯示 `1000`；容器的 root 寫的檔案在主機上是 root 的；主機沒有的 UID 在主機上顯示數字（`sudo ls -l` 看到 `999`） |
| 權限錯誤 | 容器的程式以 Image 的 USER（或 `-u`）執行，權限照 E1／E3 的規則以對應後的擁有者判斷：非 root 的 USER 寫不進主機上 root 擁有的 bind mount（`Permission denied`）。修法：主機上 `sudo chown 10001:10001 資料夾`（`storage-net` 起 chown 接受沒有帳號的數字，和 Linux 相同）或 `docker run -u` 合適的 UID。`-u 名稱`、`-u UID`、`-u UID:GID`；只有 UID 而 Image 沒有這個帳號時 GID 是 0（root），`id` 印 `uid=1000 gid=0(root) groups=0(root)` |
| 內建網路 | bridge（172.17.0.0/16，閘道 172.17.0.1）、host、none |
| 自訂網路 | `docker network create`：bridge 驅動程式，子網路依序 172.18.0.0/16、172.19.0.0/16…172.31.0.0/16，之後 192.168.0.0/20 起；閘道是第一個位址；`--subnet`、`--gateway` 可指定 |
| 位址 | 執行中的容器在每個網路上有一個位址（各網路最小的空號，從 .2 起），停止就釋放。預設 bridge 的位址也是 E20 的 `ip`（`docker inspect` 的 `.NetworkSettings.IPAddress` 只有它；只在自訂網路上的容器是空字串）。docker-proxy 轉到容器在第一個網路的位址 |
| `/etc/hosts`、`/etc/resolv.conf` | `/etc/hosts` 每個網路一行「位址 主機名稱」。在自訂網路上 `/etc/resolv.conf` 是 Docker 的內建 DNS（`nameserver 127.0.0.11`、`options ndots:0` 與說明註解）；只在預設 bridge 時是主機的名稱伺服器（主機只有 127.0.0.53 這類本機位址時是 8.8.8.8 與 8.8.4.4） |
| 名稱解析 | 容器裡的 `getent`、`ping`、`curl`、`nc` 看到的網路：自己、以及和它有共同網路的執行中容器。共同網路是自訂網路時，內建 DNS 回答容器名稱、Container ID 前 12 個字、`--network-alias` 與 `名稱.網路`（各是一筆 A 記錄：`getent hosts db` 印 `172.18.0.2      db`）；**預設 bridge 不解析名稱**（`getent` 結束碼 2、`curl` 是 `(6)`），只有位址連得到 |
| 連得到什麼 | 不同網路的容器互相連不到，用位址也一樣（逾時，`curl: (7) … after 127000 ms`）。容器的服務監聽的是**容器埠**（Image 的 HTTP 埠加上 EXPOSE；自訂指令的容器沒有服務），`-p` 是給主機與外界的：另一個容器連 `api:8081`（主機埠）是 `Connection refused`，要連 `api:3000`。`ping` 的反查名稱是 `db.app-net`，來回時間約 0.06 ms |
| `--network host` | 容器使用主機的網路：服務直接是主機的 listener（`sudo ss -tlnp` 看到 `nginx`，不是 docker-proxy），`curl localhost:80` 連得到；`-p` 被忽略並印 `WARNING: Published ports are discarded when using host network mode`；`docker ps` 的 PORTS 是空的；主機名稱與 `/etc/hosts` 是主機的；埠已被占用時主程式結束（結束碼 1，日誌說明原因）；不能 connect 其他網路 |
| `--network none` | 只有 lo：名稱查不到、位址連不到 |
| 服務的檔案 | 回應者的路由有 `root` 時，容器的服務從**容器的檔案**（含掛載）讀取，資料夾回應其中的 index.html（nginx 的預設），所以 bind mount 的網頁改了 `curl` 立刻看到 |
| 存取日誌的來源 | 經由 docker-proxy：預設 bridge 是 172.17.0.1（E20 不變），自訂網路是那個網路的閘道（172.18.0.1）；從另一個容器：那個容器的位址；`--network host`：127.0.0.1 |
| 容器裡的 Shell | `storage-net` 起容器的指令另有 `chmod chown chgrp id whoami tar getent ping curl nc`（Image 沒有宣告 `commands` 時都有；有宣告的要列出來），由直譯器執行（`;`、`&&`、`for`、`$?`、變數），每個指令有自己的結束碼 |

### 12.3 指令與格式（Docker CE 27.5.1）

| 指令 | 行為與格式 |
|---|---|
| `docker volume create [名稱]` | 印出名稱；已存在照樣印出（不是錯誤）；沒有名稱時是 64 個十六進位字；`-d` 不是 local：`Error response from daemon: create x: error looking up volume plugin nfs: plugin "nfs" not found`；名稱不合法（至少兩個字，`[a-zA-Z0-9][a-zA-Z0-9_.-]`）：`… includes invalid characters for a local volume name, only "[a-zA-Z0-9][a-zA-Z0-9_.-]" are allowed. If you intended to pass a host directory, use absolute path`；`--label`、`-o` 說明不支援 |
| `docker volume ls [-q] [-f dangling=…\|name=…\|driver=…] [--format …]` | `DRIVER    VOLUME NAME`，依名稱排序；`--format` 的欄位 Name、Driver、Scope、Mountpoint、Labels |
| `docker volume inspect [-f 格式] 名稱…` | `CreatedAt`（`2026-11-22T09:00:00Z`）、`Driver`、`Labels`（具名是 null，匿名是 `{"com.docker.volume.anonymous": ""}`）、`Mountpoint`、`Name`、`Options`（null）、`Scope`；找不到：先印找到的（可能是 `[]`）再 `Error response from daemon: get x: no such volume`（1） |
| `docker volume rm [-f] 名稱…` | 印出名稱；有容器（任何狀態）使用：`Error response from daemon: remove pgdata: volume is in use - [<完整的容器 ID>, …]`；找不到：`… get x: no such volume`（`-f` 不印） |
| `docker volume prune [-a] [-f]` | `WARNING! This will remove anonymous local volumes not used by at least one container.`（`-a`：`… all local volumes …`）與 `[y/N]`（沒有鍵盤時同 container prune 的說明）；`Deleted Volumes:`、名稱、空行、`Total reclaimed space: 3B`（刪除的檔案的位元組數） |
| `docker network ls [-q] [--no-trunc] [-f name=…\|driver=…\|type=custom\|builtin] [--format …]` | `NETWORK ID     NAME      DRIVER    SCOPE`，依名稱排序；`--format` 的欄位 ID、Name、Driver、Scope、IPv6、Internal、CreatedAt |
| `docker network create [-d bridge] [--subnet CIDR] [--gateway IP] 名稱` | 印出完整的 ID。已存在：`Error response from daemon: network with name x already exists`；子網路重疊：`… invalid pool request: Pool overlaps with other one on this address space`；`-d overlay`：`… This node is not a swarm manager. Use "docker swarm init" or "docker swarm join" to connect this node to swarm and try again.`；`-d host`：`… only one instance of "host" network is allowed`；其他驅動程式與 `--internal`、`--ipv6`、`--label` 說明不支援 |
| `docker network inspect [-f 格式] 名稱…` | `Name`、`Id`、`Created`（九位小數的秒）、`Scope`、`Driver`、`EnableIPv6`、`IPAM`（Driver default、Options、Config 的 Subnet 與 Gateway）、`Internal`、`Attachable`、`Ingress`、`ConfigFrom`、`ConfigOnly`、`Containers`（執行中的容器：Name、EndpointID、MacAddress `02:42:` 加位址、IPv4Address `172.18.0.2/16`、IPv6Address）、`Options`（預設 bridge 有 `com.docker.network.bridge.*`）、`Labels`；找不到：`Error response from daemon: network x not found` |
| `docker network connect [--alias A] 網路 容器`、`disconnect 網路 容器` | 沒有輸出；執行中的容器立刻有（或失去）位址，`/etc/hosts`、`/etc/resolv.conf` 跟著更新。已連上：`… endpoint with name web already exists in network app-net`；沒有連：`… container <ID> is not connected to network app-net`；host：`… container cannot be disconnected from host network or connected to host network`；none：`… container cannot be connected to multiple networks with one of the networks in private (none) mode`；預設 bridge 的別名：`… network-scoped alias is supported only for containers in user defined networks`；`--ip` 說明不支援 |
| `docker network rm 名稱…`、`prune [-f]` | rm 印出名稱；內建的：`… bridge is a pre-defined network and cannot be removed`；有執行中的容器：`… error while removing network: network app-net has active endpoints (name:"db" id:"<12 字>")`；停止的容器不擋（之後啟動它是 `network app-net not found`）。prune：`WARNING! This will remove all custom networks not used by at least one container.`、`Deleted Networks:` 與名稱 |
| `docker run` 的新選項 | `-v`／`--volume`、`--mount`、`--tmpfs`、`--network`／`--net`、`--network-alias`／`--net-alias`、`-u`／`--user`。錯誤（`docker: ….` 加 See 行，125）：`invalid volume specification: 'data:app': invalid mount config for type "volume": invalid mount path: 'app' mount path must be absolute`、`invalid mount config for type "bind": bind source path does not exist: /x`、`Duplicate mount point: /x`、`network x not found`；`--mount` 的格式錯誤是 CLI 的 `invalid argument "…" for "--mount" flag: target is required`（沒有 `docker:` 前綴） |
| `docker exec -u 使用者` | 以那個使用者執行（找不到：`unable to find user x: no matching entries in passwd file`，126） |
| `docker rm -v` | 一併刪除匿名 Volume |
| `docker ps` | `--format` 多了 `{{.Mounts}}`（Volume 名稱或 bind mount 的來源，各截成 15 個字，`--no-trunc` 不截）與 `{{.Networks}}`（依名稱、逗號分隔）；`--filter volume=名稱或掛載點`、`network=名稱或 ID` |
| `docker inspect` | 容器多了 `Mounts`（Type、Name、Source、Destination、Driver、Mode：`-v` 的 Volume 是 `z`、`:ro` 是 `ro`，`--mount` 是空的、RW、Propagation：bind 是 `rprivate`）、`HostConfig.Binds`（`-v` 給的具名與 bind 掛載）、`HostConfig.NetworkMode`、`Config.Volumes`、`NetworkSettings.Networks`（IPAMConfig、Links、Aliases、MacAddress、DriverOpts、NetworkID、EndpointID、Gateway、IPAddress、IPPrefixLen、IPv6Gateway、GlobalIPv6Address、GlobalIPv6PrefixLen、DNSNames：自訂網路是 名稱、短 ID、別名，預設 bridge 是 null）；Image 多了 `Config.Volumes`。`docker inspect 名稱` 也找網路與 Volume。`images` profile 以下的 JSON 逐字不變 |
| Dockerfile 的 `VOLUME` | `VOLUME ["/data"]` 或 `VOLUME /data /logs`：只改設定（history 的 `VOLUME [/data]`，0B），每個容器在那裡得到匿名 Volume；不是絕對路徑說明不支援 |
| `tar` | GNU tar 1.35：`c`／`t`／`x`、`z`、`v`、`f`、`-C`，舊式的 `tar czf`、`-czf` 與長選項（`--create`、`--list`、`--extract`、`--gzip`、`--file=`、`--directory=`）；讀取時自動辨認 gzip。`tar tvf` 的版面照 list.c（`drwxr-xr-x root/root         0 2026-11-22 10:00 ./`，擁有者與大小共用 19 字寬）；`x -v` 只印名稱。錯誤：`Cannot stat: No such file or directory`、`Cannot open: Permission denied`、`Removing leading `/' from member names`、`Cowardly refusing to create an empty archive`、`This does not look like a tar archive`、`Refusing to write archive contents to terminal (missing -f option?)`，以及 `Exiting with failure status due to previous errors`／`Error is not recoverable: exiting now`（2）。root 解開時保留封存檔的擁有者（系統沒有那個名稱時用數字），一般使用者解開的屬於自己 |

### 12.4 `docker inspect -f` 的 Go template（`storage-net` 起）

`{{.A.B}}`、`{{json .A}}`、`{{range .A}}…{{end}}`（陣列依序、map 依鍵排序，`.` 是元素）、`{{range $k, $v := .A}}…{{end}}`、`{{index .A "鍵"}}`、`{{(index .A "鍵").B}}`、`$變數`。依 CLI 以型別化的值執行 template 的結果：`{{.NetworkSettings.Networks}}` 印 `map[app-net:0xc0001a2b40 bridge:0xc000…]`（值是指標；模擬環境的位址由資料算出，真實的每次不同）、`{{.Mounts}}` 印 `[{volume pgdata /var/lib/docker/volumes/pgdata/_data /var/lib/postgresql/data local z true }]`；名稱有連字號的欄位（`.NetworkSettings.Networks.app-net`）是 `template parsing error: template: :1: bad character U+002D '-'`，要用 `index`。`images` profile 以下的 template 不變。

### 12.5 課程資料與檢查

```ts
docker: {
  images: [{ …E20／E21 的欄位, volumes?: ['/var/lib/postgresql/data'] }],
  volumes?: [{ name: 'pgdata', created?, files?: [{ path: '/orders.csv', content, owner?: '999', mode? }] }],   // 路徑由 Volume 的根算起
  networks?: [{ name: 'app-net', subnet?: '10.10.0.0/24', created? }],
  containers: [{ …E20 的欄位, volumes?: ['pgdata:/var/lib/postgresql/data', '/home/learner/site:/usr/share/nginx/html:ro'],
                 network?: 'app-net', aliases?: ['database'], user?: '1000:1000' }],
}
```

| 規則 | 內容 |
|---|---|
| Volume | 名稱合法、不重複；最多 40 個檔案，路徑由 Volume 的根算起（`/…`），擁有者是使用者名稱或數字，權限 0–0777 |
| 網路 | 名稱合法、不是 bridge／host／none、不重複；子網路是 /8–/30 的 IPv4 CIDR，不和其他網路重疊（沒寫時依序分配） |
| 容器 | `volumes` 是 `-v` 的寫法；`network` 是內建或課程的網路；`aliases` 需要自訂網路；`user` 是名稱或 UID（可加 `:群組`）；host／none 的容器不能發布連接埠。容器依列出的順序建立：Volume 與 copy-up、在各網路的位址 |
| Image | `volumes` 最多 8 個絕對路徑；`commands` 可以多列 E22 的指令 |

| 檢查 | 意義 |
|---|---|
| `{ kind: 'volume', name, absent?, file?: '/orders.csv', content? }` | Volume 存在（`absent`：不存在）、裡面有這個檔案、內容包含這段文字 |
| `{ kind: 'network', name, absent?, container?, driver?: 'bridge', subnet? }` | 網路存在（不存在）、這個容器連在上面（任何狀態）、驅動程式與子網路 |
| `{ kind: 'reach', container, to, port, result: 'succeeded' \| 'refused' \| 'timeout' \| 'unresolved' }` | 從執行中的容器以名稱或位址連 `to` 的這個埠：成功、被拒絕、逾時（不同的網路）或名稱查不到（預設 bridge、none）。和 E16 的 `reach`（主機之間）同名，以 `container` 欄位區分 |

### 12.6 測試

| 檔案 | 內容 |
|---|---|
| `tests/terminal-e22.test.ts` | profile 與分界（`images` 以下 volume、network、`-v`、`--mount`、`--network` 說明 E22、tar 不是指令、資料欄位要 `storage-net`、VOLUME 仍是 E22）、說明頁與 help；Volume 的 ls／inspect／create／rm／使用中／prune（匿名與 `-a`）、docker rm 之後資料仍在與共用、主機上的路徑與權限、copy-up 與 bind mount 不複製、匿名 Volume 與 `rm -v`／`--rm`、bind mount 雙向即時（nginx 讀到新的網頁）與 `:ro` 的錯誤、`--mount` 的各種寫法與錯誤、`-v` 自動建立來源與名稱的陷阱、tmpfs、擁有者與權限錯誤（USER、chown、`-u`）、tar 的備份與還原與格式與錯誤、Dockerfile 的 VOLUME；網路的 ls／create／inspect／rm／prune 與錯誤、內建 DNS（getent、ping、curl、resolv.conf、存取日誌的來源）、預設 bridge 不解析、不同網路連不到、容器埠與發布埠、connect／disconnect 與 inspect 的 template（指標、range、index、連字號）、`--network host` 與 none、各網路的位址與 docker-proxy；`volume`／`network`／`reach` 檢查、資料驗證、合成課程通過 `terminalContentProblems`、不改動傳入的狀態 |
| `tests/support/storage-net-fixture.ts` | 只供測試：vol-01（`storage-net` profile；nginx 由容器的檔案回應、postgres 有 VOLUME、team/api 在 3000 埠、team/app 以 UID 10001 執行、alpine、debian；`~/site`、root 擁有的 `~/data`、`~/app-data`；pgdata Volume、app-net 與其上執行中的 db）與兩個練習（重建資料庫容器、以名稱互連） |

`tests/terminal-e1.test.ts` 的 `PROFILES` 期望值加上 `storage-net`。

### 12.7 只在課文說明、或不模擬的部分

- **核心與網路的實作**：iptables／nftables 的 NAT 與 DOCKER-ISOLATION 規則、veth pair、`docker0` 等 bridge 介面（`ip addr` 不顯示）、userland proxy 與 hairpin NAT 的細節、內建 DNS 轉送外部名稱（容器裡查外部名稱是找不到）、容器經由閘道連到主機自己的服務（不模擬）、IPv6。
- **其他驅動程式**：overlay（Swarm）、macvlan、ipvlan、`--internal`；local 以外的 Volume 驅動程式（NFS、雲端儲存）與 `-o` 選項、`volume-nocopy`、bind propagation、SELinux 的 `z`／`Z`（接受但不影響行為）、tmpfs 的大小限制。
- **其他**：`docker cp`、`--ip`、`--label`、`docker system df`、`--link`（舊的連結方式）。真實的 tar 與 gzip 位元組（封存檔的大小不是真實的大小）。
- **BusyBox**：Alpine 的 `ping`、`tar`、`nc` 在真實環境是 BusyBox 的版面與訊息（例如 `ping` 的 `seq=0`），模擬環境用 iputils、GNU tar 與 OpenBSD nc 的格式；課程要逐字展示時請用 Debian 系的 Image。Alpine 預設沒有 `curl`（真實要另外安裝，課程可以在 `commands` 裡不列它）。

### 12.8 沒有把握的地方（依記得的格式寫，並在此註明）

- **錯誤訊息**：`volume rm`／`volume inspect` 找不到時的 `get x: no such volume`、`network rm` 有使用中端點時括號內的寫法（27.x 依記憶加上 `name:"…" id:"…"`）、`invalid volume specification` 的完整寫法、none 網路 connect 的訊息、`--mount` 不認得的 type 的文字，依記憶與 moby 原始碼的印象寫，沒有在 27.5.1 逐字核對。
- **inspect 的欄位**：容器 `Mounts` 的 Mode（`-v` 的 Volume 是 `z`）、`HostConfig.Binds` 對匿名 Volume 的寫法、`DNSNames`（25 起，含短 ID）、MacAddress（模擬為 `02:42:` 加位址；較新的 Docker 可能是隨機的）、網路 inspect 的 `IPAM.Options` 與 `Options`、Volume 的 `Labels`（具名的 null 或 `{}`）依記憶。JSON 的欄位順序只是模擬的子集，和真實的完整輸出不同。
- **resolv.conf**：Docker 25 起的註解（`# Based on host file: …`、`# ExtServers: …`、`# Overrides: []`、`# Option ndots from: internal`）依記憶；預設 bridge 時主機用 systemd-resolved 的情形，真實的 Docker 讀 `/run/systemd/resolve/resolv.conf` 的上游伺服器，模擬環境改用 8.8.8.8／8.8.4.4。
- **`getent hosts` 與 `ping`**：內建 DNS 回答名稱時 getent 只印問的名稱、ping 的反查是 `名稱.網路`，依記憶；容器之間的來回時間（0.06 ms）是模型的數字。
- **`-u UID` 沒有群組時 GID 是 0**、`--network host` 的容器主機名稱是主機的、埠被占用時容器結束（真實的 nginx 印 `bind() … failed (98: Address already in use)`；模擬環境的日誌是說明文字）。
- **tar**：`tar tvf` 的寬度規則與 `x -v` 只印名稱依 GNU tar 1.35 的 list.c；GNU tar 的成員順序是讀目錄的順序（模擬環境依名稱排序）；時間用機器時鐘（檔案沒有修改時間時）。

## 13. 引擎階段 E23：`compose` profile（`src/lib/terminal/compose.ts`、`yaml.ts`、`health.ts`、`registry.ts`、`build.ts`、`docker.ts`、`docker-lesson.ts`）

> 2026-11-23。給 DKR09（Docker Compose 多容器應用）、DKR10（多階段建置）與 DKR11（Container Registry 與版本標籤）。依 Docker CE 27.5.1 與它附帶的 Compose v2 外掛（`docker compose`，v2.32.4）。E20–E22 的行為與所有已發布的課（DKR01–DKR08 與其他島）逐字不變：全部終端機課的範例、參考解答、典型錯誤與變體（含檢查的訊息）在改動前後逐一重播，輸出相同；新的行為只在 `compose` profile 起出現。

### 13.1 選用方式

| 項目 | 內容 |
|---|---|
| `COMPOSE_PROFILE` | `storage-net` 的一切，**沒有新的指令**（`docker` 已在 E20），feature `compose`。`docker` 收到 `compose: true` 時才有 `docker compose`、`tag`、`push`、`login`、`logout`、`docker image tag|push`、以 digest 拉取與執行、`docker run --health-*`、Dockerfile 的 HEALTHCHECK 與 `COPY --from`／`FROM 階段` |
| profile 以下 | `docker compose`、`push`、`tag`、`login`、`logout` 仍是「模擬環境在引擎階段 E23（Compose、多階段建置與 Registry） 才支援」；`docker pull x@sha256:…` 仍說明 E23；`COPY --from` 仍是 E23 的建置錯誤，HEALTHCHECK 仍是 E24 的建置錯誤；`docker run --health-cmd` 仍是 `unknown flag`（和改動前相同） |
| 說明頁與 help | `docker --help`、`man docker` 印 `COMPOSE_MANUAL`；`help` 的 docker 行加上 compose、tag、push、login、logout；沒有參數的 `docker` 多列 push、login、logout、tag 與 Management Commands 的 compose |
| 課程資料 | Image 的 `healthcheck`、`ready`、`tags`，程式的 `ready`，`docker.registries` 與 `docker.tools` 需要 `compose`（「`… need the compose profile (engine stage E23)`」） |
| `docker search` | `compose` profile 說明不支援（課程的 Registry 不提供搜尋） |

### 13.2 compose.yaml 的 YAML 子集（`yaml.ts`）

不新增套件，自己寫的最小解析器。支援：以縮排（只能是空白）表示的區塊 mapping 與序列（序列可以和它的鍵同一層縮排）、`- 鍵: 值` 開始的 mapping 項目、純量（plain、`'單引號'`（`''` 跳脫）、`"雙引號"`（`\n \t \" \\ \uXXXX` 等跳脫））、一行之內的 flow 集合（`[a, "b"]`、`{k: v}`，可以巢狀）、註解（行首或空白之後的 `#`，引號內不算）、`|`／`|-`／`|+`／`>`／`>-`／`>+` 區塊純量、開頭的 `---`、null（空值、`~`、`null`）。純量一律以文字保存，由 Compose 的欄位決定型別（數字、布林）。

不支援而明確說明（`yaml: line N: 模擬環境的 YAML 子集不支援…`）：錨點與別名（`&`、`*`）、合併鍵（`<<`）、標記（`!!str`）、跨行的純量、複雜的鍵（`?`）、多個文件、同一行的巢狀序列（`- - x`）。

錯誤用 yaml.v3 的格式：縮排不對 `yaml: line 4: did not find expected key`、少了冒號 `yaml: line 1: could not find expected ':'`、重複的鍵 `yaml: line 2: mapping key "a" already defined at line 1`、Tab 縮排 `yaml: line 2: found character that cannot start any token`、`key: 值` 之後更深的 `k: v` 是 `mapping values are not allowed in this context`。

輸出（`docker compose config`）由 `emitYaml` 寫：兩格縮排，序列縮在鍵的下面（`      - mode: ingress`），字串在讀回來會變成別的型別（`"8080"`、`"true"`）或含特殊字元時加雙引號（yaml.v3 的做法），空 mapping 是 `{}`。

### 13.3 Compose 的模型與指令（`compose.ts`）

| 項目 | 內容 |
|---|---|
| 檔案 | 目前資料夾往上找 `compose.yaml`、`compose.yml`、`docker-compose.yaml`、`docker-compose.yml`，或 `-f 檔案`（`--project-directory`、`--env-file`）。找不到：`no configuration file provided: not found`；`-f` 不存在：`open /…: no such file or directory` |
| 變數代換 | 所有的值（不含鍵）：`${VAR}`、`$VAR`、`${VAR:-預設}`、`${VAR-預設}`、`${VAR:+值}`、`${VAR+值}`、`${VAR:?訊息}`、`${VAR?訊息}`、`$$` 是 `$`。變數取自 Shell **匯出**的變數（`export`，優先）與專案資料夾的 `.env`（或 `--env-file`）。沒有設定：`WARN[0000] The "TAG" variable is not set. Defaulting to a blank string.`（每個變數一次）；`:?`：`error while interpolating services.web.image: required variable TAG is missing a value: 訊息` |
| 驗證 | 頂層只能是 version、name、services、networks、volumes、`x-*`（configs、secrets、include 說明不支援）；打錯的鍵是 `validating /…/compose.yaml: services.web additional properties 'imgae' not allowed`；Compose 規格裡有、模擬環境沒有模擬的服務鍵（deploy、logging、profiles、tmpfs、expose…）說明不支援，不假裝；型別錯誤 `… services.web.ports must be a list`。`version` 印 `WARN[0000] …: the attribute \`version\` is obsolete, it will be ignored, please remove it to avoid potential confusion` |
| 服務 | `image`、`build`（字串或 context、dockerfile、args（mapping 或清單）、target）、`ports`（`"8080:80"`、`"127.0.0.1:8080:80"`、`/udp`、長格式 target／published／host_ip／protocol；只寫容器埠或範圍說明不支援）、`environment`（mapping 或 `K=V` 清單；只有 `K` 時取 Shell 的值）、`env_file`（字串、清單或 `{path, required}`；`environment` 優先）、`volumes`（`名稱:/路徑[:ro]`、`./相對`／`/絕對`／`~/` 的 bind、`/路徑` 的匿名 Volume、長格式 type／source／target／read_only）、`networks`（清單或 mapping 加 `aliases`）、`depends_on`（清單，或 mapping 加 `condition`：service_started、service_healthy、service_completed_successfully，`required`、`restart`）、`healthcheck`（test 字串或清單、interval、timeout、retries、start_period、start_interval、`disable: true`）、`restart`（no、always、unless-stopped、on-failure[:N]；只記錄，重新啟動的行為是 E24）、`command`、`entrypoint`（字串依 sh 的規則切成字）、`user`、`working_dir`、`container_name`、`labels`。頂層 `volumes`、`networks`（name、external、driver: local／bridge） |
| 專案錯誤 | `service "web" depends on undefined service "dbb": invalid compose project`、`service "web" refers to undefined volume data: invalid compose project`、`service "web" refers to undefined network back: invalid compose project`、`service "web" has neither an image nor a build context specified: invalid compose project`、`dependency cycle detected: a -> b -> a`、condition 錯誤 `… must be one of the following: "service_started", "service_healthy", "service_completed_successfully"` |
| 專案名稱 | `-p` ＞ `COMPOSE_PROJECT_NAME`（匯出的變數）＞ 頂層 `name` ＞ 資料夾名稱（轉小寫、只留 `[a-z0-9_-]`、開頭必須是字母或數字：`My.App` → `myapp`）。`-p`／`name` 不合法：`invalid project name "Demo": must consist only of lowercase alphanumeric characters, hyphens, and underscores as well as start with a letter or number` |
| 命名 | 容器 `專案-服務-1`（`container_name` 優先），預設網路 `專案_default`、自訂網路 `專案_鍵`，Volume `專案_鍵`（`name` 或 `external` 時是那個名稱）；建置的 Image 是 `專案-服務:latest`（有 `image` 時用它） |
| 容器 | 和 `docker create` 一樣：環境變數、連接埠、掛載（Compose 用 API 的 mount，所以 inspect 的 Mode 是空的）、使用者、工作目錄；在每個網路上的別名是容器名稱與服務名稱（同一網路的其他容器以服務名稱連到它，E22 的內建 DNS）；標籤 `com.docker.compose.project`、`.service`、`.container-number`、`.config-hash`、`.depends_on`、`.image`、`.oneoff`、`.project.config_files`、`.project.working_dir`、`.version`（2.32.4）；健康檢查是服務的（沒寫的欄位用 Image 的 HEALTHCHECK），沒有時用 Image 的 |
| 時間 | `up` 等相依服務健康（或結束）時，**機器的時鐘前進**到每一次健康檢查的時間（和真實的 `docker compose up` 一樣會停在那裡等）；其他指令不讓時間前進 |

#### 進度的格式（決定：Compose 的 plain 輸出）

Compose v2 的進度寫到**標準錯誤**；模擬環境一律印 **plain 格式**（標準輸出不是終端機時 Compose 的樣子）：每個事件一行，開頭一個空白、識別與狀態之間兩個空白（`fmt.Fprintln` 加上空的 Text 欄位）：

```
 Network shop_default  Creating
 Network shop_default  Created
 Volume "shop_pgdata"  Creating
 Volume "shop_pgdata"  Created
 Container shop-db-1  Creating
 Container shop-db-1  Created
 Container shop-db-1  Starting
 Container shop-db-1  Started
 Container shop-db-1  Waiting
 Container shop-db-1  Healthy
```

終端機上真實的 TTY 畫面（`[+] Running 4/4` 與 ` ✔ Container shop-db-1  Healthy   5.6s` 這種會重畫的列）不模擬；課文可以說明 TTY 上看到的是同樣的事件，最後停在 ✔ 的那一列。`--progress quiet` 不印事件。

| 指令 | 行為與格式 |
|---|---|
| `docker compose up [-d] [--build] [--no-build] [--no-deps] [--force-recreate] [--no-recreate] [--no-start] [--wait] [--remove-orphans] [服務…]` | 依序：Image（沒有 Image 或 `--build` 的 build 服務先建置：BuildKit 的 plain 進度與 ` Service app  Built`；只有 image 的服務沒有就拉取：` cache  Pulling`、` cache  Pulled`，失敗是 ` cache  Error` 與 daemon 的錯誤）、網路與 Volume（Creating／Created；external 不存在：`network x declared as external, but could not be found`、`external volume "x" not found`）、容器（依 depends_on 的順序，相同時依名稱：沒有的 Creating／Created；設定或 Image 改了 Recreate／Recreated；沒變而執行中 Running）、啟動（每個服務先等它的相依條件：service_healthy 印 ` Container x  Waiting` 再 `Healthy`，service_completed_successfully 是 `Waiting` 再 `Exited`；然後 Starting／Started）。失敗：` Container x  Error` 與 `dependency failed to start: container x is unhealthy`、`… has no healthcheck configured`、`… exited (1)`、`service "migrate" didn't complete successfully: exit 3`（結束碼 1）；容器名稱被別人占用是 daemon 的 Conflict 錯誤；連接埠被占用是 E20 的錯誤。孤兒容器：`WARN[0000] Found orphan containers ([…]) for this project. If you removed or renamed this service in your compose file, you can run this command with the --remove-orphans flag to clean it up.`。不加 `-d`：之後印 `Attaching to app-1, cache-1, db-1`、各容器的日誌（`db-1     | …`，名稱補到一樣寬再加 ` | `）、結束的容器 `x exited with code N`，還在執行時說明模擬環境沒有 Ctrl-C、服務留在背景 |
| `docker compose down [-v] [--remove-orphans]` | 容器依相依的相反順序 Stopping／Stopped，再 Removing／Removed；`-v` 刪除宣告的 Volume（` Volume shop_pgdata  Removing`、`Removed`）與容器的匿名 Volume；最後網路 Removing／Removed。什麼都沒有：`WARN[0000] Warning: No resource found to remove for project "shop".`。`--rmi` 說明不支援 |
| `docker compose ps [-a] [-q] [--services] [--status 狀態] [--format …] [服務…]` | `NAME   IMAGE   COMMAND   SERVICE   CREATED   STATUS   PORTS`，依名稱排序；COMMAND、STATUS（含健康狀態）、PORTS 和 `docker ps` 相同；`--format` 的欄位 Name、Image、Command、Service、RunningFor、CreatedAt、Status、Ports、State、Health、ExitCode、ID、Project |
| `docker compose logs [-t] [--tail N] [--no-log-prefix] [-f] [服務…]` | 依時間排序（同時的依容器名稱），`db-1  | ` 前綴；`-t` 是 `2026-11-22T10:00:00.000000000Z`；`-f` 不等待（說明） |
| `docker compose exec [-T] [-u 使用者] [-w 目錄] [-e K=V] 服務 指令…` | 在 `專案-服務-1` 裡執行（就是 `docker exec`，預設配置 TTY：`TERM=xterm`），結束碼是指令的；沒有在執行或沒有這個服務：`service "db" is not running` |
| `docker compose build [服務…]`、`pull [服務…]` | build：每個有 build 的服務建置並 ` Service app  Built`；pull：依檔案的順序 ` db  Pulling`／` db  Pulled`，只有 build 的服務 ` app  Skipped - No image to be pulled` |
| `docker compose start|stop|restart [服務…]` | stop 依相反順序 Stopping／Stopped；start 依相依順序（等待條件）Starting／Started；restart 是 ` Container x  Restarting`、` Container x  Started`。沒有容器：`no containers to start` |
| `docker compose config [--services] [--volumes] [--images] [-q]` | 正規化的 YAML（§13.2）：`name`、services（依名稱）、networks、volumes。build 的 context 是絕對路徑；depends_on 寫出 condition 與 `required: true`；environment 合併 env_file 並依鍵排序（`env_file` 本身不印）；ports 與 volumes 是長格式（`published` 是字串、bind 有 `create_host_path: true`、volume 有 `volume: {}`）；networks 是 `default: null`；時間是 Go 的寫法（`5s`、`1m30s`）。`--services` 依名稱排序。**不需要** daemon 的權限 |
| `docker compose ls [-a]`、`version`、沒有子指令 | ls：`NAME   STATUS   CONFIG FILES`（`running(2)`）；`Docker Compose version v2.32.4`；縮短的 Usage。其他子指令（run、rm、create、kill、port…）說明不支援，不存在的是 `unknown docker command: "compose x"` |
| 權限 | config 以外的子指令和 `docker ps` 一樣需要 docker 群組或 sudo |

### 13.4 健康檢查（`health.ts`）

| 項目 | 內容 |
|---|---|
| 來源 | Compose 的 `healthcheck`、Dockerfile 的 `HEALTHCHECK [--interval=…] [--timeout=…] [--start-period=…] [--start-interval=…] [--retries=N] CMD …`（或 `NONE`）、`docker run --health-cmd …`（`--health-interval`、`--health-timeout`、`--health-retries`、`--health-start-period`、`--health-start-interval`、`--no-healthcheck`；沒寫的欄位沿用 Image 的）、課程宣告的 Image `healthcheck` |
| 執行 | 執行中的容器在固定的時間點探測：第一次在啟動後一個 interval（有 start_period 時是一個 start_interval），之後每個 interval（start_period 內、還沒健康過時是 start_interval）。預設 interval 30s、timeout 30s、retries 3、start_period 0、start_interval 5s。`CMD` 直接執行那些字，`CMD-SHELL` 是 `/bin/sh -c`（Image 要有 sh）；**探測的執行檔必須是 Image 宣告的 `commands`**（`curl`、`pg_isready`），沒有時是 OCI 的「executable file not found」（ExitCode -1）或 `sh: 1: curl: not found`（127）。結尾的 `|| exit 1` 由模擬環境處理（失敗時的結束碼）。探測連到其他網路而逾時的，是 `Health check exceeded timeout (30s)`（ExitCode -1） |
| 狀態 | 一開始 `starting`；結束碼 0 是 `healthy`（連續失敗歸零）；失敗加一（start_period 內、還沒健康過時不算），連續 `retries` 次是 `unhealthy`；保留最後 5 次（Start、End、ExitCode、Output）。容器停止就不再探測，再啟動時重新 starting |
| 決定論 | 時間只隨 `sleep`（edge 起）與 `docker compose up` 的等待前進；兩個 docker 指令之間到期的探測，在下一個 docker 指令（或檢查）時依各自的時間補做，用當時容器的檔案。服務的 `ready`（課程宣告的 Image 或程式：啟動後幾秒才接受連線）讓在那之前的探測失敗（從容器裡看：自己與其他容器的服務在 ready 之前拒絕連線） |
| 輸出 | `docker ps`、`docker compose ps` 的 STATUS：`Up 5 seconds (healthy)`、`Up 1 second (unhealthy)`、`Up Less than a second (health: starting)`（moby 的 State.String）；`docker inspect` 的 `State.Health`（Status、FailingStreak、Log）與 `Config.Healthcheck`（Test 與以奈秒表示的時間，沒設定的不列）；沒有健康檢查的容器沒有 `State.Health`：`{{.State.Health.Status}}` 是 Go 的 `template: :1:2: executing "" at <.State.Health.Status>: nil pointer evaluating interface {}.Status` |
| history | `HEALTHCHECK &{["CMD-SHELL" "curl -f http://localhost/ || exit 1"] "5s" "3s" "0s" "0s" '\x03'}`（BuildKit 以 `%q` 印出設定：沒寫的時間是 `"0s"`，retries 是 rune） |
| `pg_isready` | Image 列出它才有（`compose` profile 的 `commands` 可以列 `pg_isready`）。`pg_isready [-h 主機] [-p 埠] [-U 使用者] [-d 資料庫] [-q]`：本機（socket）看容器自己的服務是否在那個埠接受連線，`-h` 經由容器的網路連過去；`/var/run/postgresql:5432 - accepting connections`（0）或 `… - no response`（2），`-h db` 是 `db:5432 - …` |

### 13.5 多階段建置（`build.ts`）

| 項目 | 內容 |
|---|---|
| 要建置的階段 | 目標（最後一個，或 `--target`）與它需要的階段：`FROM 先前的階段`、`COPY --from=階段名稱或編號`（只能是前面的階段）；其他階段 BuildKit 略過，不出現在輸出。`ARG` 寫在第一個 FROM 之前，用在 FROM 與 `--from` 的名稱（`--build-arg` 可以改它） |
| 輸出的順序 | 依序（真實的 BuildKit 並行，輸出可能交錯）：需要的基底各一次 `load metadata`、`load .dockerignore`、各階段的 `[名稱 1/N] FROM …`（以階段為基底的不另外列；`COPY --from=Image` 的 Image 是沒有編號的 `FROM docker.io/…@sha256:…`，和某個階段的基底相同時不重複）、`load build context`、依 Dockerfile 的順序各階段的步驟（`[build 5/5] RUN …`、`[stage-1 2/2] COPY --from=build /out/api /api`）、`exporting to image`（只有最後一個階段） |
| COPY --from | 來源是那個階段（或 Image）的**絕對路徑**（相對路徑從 `/` 算），可以用萬用字元與資料夾；檔案保留內容、權限與「重量」（套件與建置工具寫的檔案的宣告大小），擁有者是 root（或 `--chown`）。快取鍵是來源階段的最後一個鍵加上複製的檔案的 checksum。找不到：和建置內容相同的 `failed to compute cache key: failed to calculate checksum of ref …: "/missing": not found`；`ADD --from` 說明請用 COPY |
| 最後的 Image | 只有最後一個階段的層（基底的層加上它自己的步驟）：`golang:1.23`（823MB）的建置階段加 8.4MB 的執行檔是 831MB，`distroless`（2MB）的最後階段只有 10.4MB；`docker history` 只列最後階段的列 |
| `FROM scratch` 與 distroless | scratch 是空的檔案系統（§11）；沒有 CMD 與 ENTRYPOINT 時 `docker run` 是 `no command specified`。distroless 是課程宣告的 Image（`commands: []`、可以沒有 cmd）：沒有 Shell，`docker exec 容器 sh` 是 `OCI runtime exec failed: exec failed: unable to start container process: exec: "sh": executable file not found in $PATH: unknown`（127），shell 形式的 RUN 與 CMD-SHELL 健康檢查失敗 |
| 建置工具 | `docker.tools`：RUN 的某個指令（`go build -o /out/api ./cmd/api`，逐字比對）需要的檔案（相對於 WORKDIR）、印出的文字、寫出的檔案與它們的大小、秒數。執行檔要是基底 Image 的 `commands`（`golang` 列出 `go`）。寫出的檔案內容由工作資料夾下的原始碼算出，所以改了原始碼就是新的檔案、新的層、新的 Image 與 digest；缺檔案時印說明（或課程的 `missing`）並以結束碼 1 失敗 |
| HEALTHCHECK | §13.4；設定只改 Image（history 一列 0B） |

### 13.6 Registry（`registry.ts`）

| 項目 | 內容 |
|---|---|
| 模型 | E20 的模擬 Docker Hub 不變；課程另外宣告私有 Registry（`docker.registries`）：位址（`registry.example.com:5000`、`ghcr.example`：有點或埠，不能是 Docker Hub）、使用者與 **明顯是假的課程 Token**（8–80 個 `[A-Za-z0-9._-]`、含 lesson／fake／example／demo，不能像 ghp_、glpat-、dckr_pat_、AKIA、sk- 這類真實的格式）、能不能推送（`push`，預設可以）與可以用的儲存庫（`repos`：`team/api` 或 `team/*`）、`immutable`（不可變標籤）、`public`（不登入也能拉）。名稱以這個位址開頭的課程 Image 是那個 Registry 的（`tags` 是同一個 manifest 的其他標籤；`pulled` 的也在本機）。課程沒有宣告的位址是 DNS 查不到的主機（課程宣告的 Registry 在課程的網路上連得到） |
| digest | 推送的是 Docker image manifest（schema 2）：config（digest 就是 Image ID）與各層（大小、`sha256(blob/diff ID)`），以三格縮排寫成 JSON；它的 SHA-256 是 digest、位元組數是 `size`。相同的內容在任何名稱下都是同一個 digest；重新建置（內容或建置時間不同）是新的 digest。Docker Hub 的 Image 仍用 E20 的 digest |
| `docker tag 來源 目標` | 沒有輸出；目標原本指向別的 Image 時標籤移走（那個 Image 沒有其他標籤就成為 dangling）。錯誤：`Error response from daemon: No such image: x:1`、`Error parsing reference: "App" is not a valid repository/tag: invalid reference format: repository name (library/App) must be lowercase`、`refusing to create a tag with a digest reference`、`"docker tag" requires exactly 2 arguments.` |
| `docker login [-u 使用者] [-p 密碼 \| --password-stdin] 位址` | 成功：標準錯誤 `WARNING! Your password will be stored unencrypted in /home/learner/.docker/config.json.`、`Configure a credential helper to remove this warning. See`、`https://docs.docker.com/go/credential-store/`、空行；標準輸出 `Login Succeeded`；寫入 `~/.docker/config.json`（目錄 0700、檔案 0600，Tab 縮排的 JSON，`auths.位址.auth` 是 `使用者:Token` 的 base64，保留檔案裡的其他鍵）。`-p` 先印 `WARNING! Using --password via the CLI is insecure. Use --password-stdin.`。錯誤：`Error response from daemon: Get "https://位址/v2/": unauthorized: incorrect username or password`、沒有密碼 `Error: Cannot perform an interactive login from a non TTY device`（模擬環境沒有鍵盤）、`Error: Must provide --username with --password-stdin`、`Error: --password and --password-stdin are mutually exclusive`、位址查不到 `Error response from daemon: Get "https://x:5000/v2/": dial tcp: lookup x on 127.0.0.53:53: no such host`；不寫位址（Docker Hub）說明模擬環境的 Docker Hub 不需要登入 |
| `docker logout [位址]` | `Removing login credentials for 位址`；沒有登入：`Not logged in to 位址`（都是結束碼 0） |
| `docker push 名稱[:標籤]` | 沒寫標籤：`Using default tag: latest`。`The push refers to repository [registry.example.com:5000/team/api]`、每一層（最上面的先）`354d479d92a0: Pushed`／`Layer already exists`（這個儲存庫已有）／`Mounted from team/api`（同一個 Registry 的其他儲存庫有）、`1.0: digest: sha256:… size: 949`。錯誤：本機沒有 `An image does not exist locally with the tag: 名稱`；Docker Hub（名稱沒有 Registry 位址）各層 `Preparing` 後 `denied: requested access to the resource is denied`；沒有登入（或 Token 不對）`unauthorized: authentication required`；使用者不能推送或不能用這個儲存庫 `denied: requested access to the resource is denied`；不可變標籤已指向別的 digest：各層照樣上傳，最後 `tag invalid: The image tag '1.0' already exists in the 'team/api' repository and cannot be overwritten because the repository is immutable.`（相同的 digest 可以再推）；位址查不到；`cannot push a digest reference`。成功後本機的 Image 多了這個 RepoDigest；可變的 Registry 上標籤移到新的 digest，舊的 digest 仍可以用 digest 拉取 |
| `docker pull`（私有 Registry） | `1.0: Pulling from team/api`（路徑不含位址）、各層 `Pull complete`／`Already exists`（本機已有那一層）、`Digest: sha256:…`、`Status: Downloaded newer image for …`／`Status: Image is up to date for …`、最後一行完整的名稱。標籤移到拉下來的 Image（舊的 Image 沒有其他標籤就成為 dangling：`latest` 的風險）。沒有登入且不是 public：`Error response from daemon: Head "https://位址/v2/team/api/manifests/1.0": unauthorized: authentication required`；不能用的儲存庫：`pull access denied for …`；沒有這個標籤或 digest：`manifest for …:9 not found: manifest unknown: manifest unknown` |
| 以 digest | `docker pull 名稱@sha256:…`（Docker Hub 與私有 Registry）：第一行是 `sha256:…: Pulling from team/api`；本機已有同一個 Image 時 `Image is up to date`；拉下來的是沒有標籤的 Image：`docker images` 的 TAG 是 `<none>`（不是 dangling），`docker images --digests` 有 DIGEST。`docker run 名稱@sha256:…`、`docker inspect`、`docker rmi`、`docker tag` 與 Compose 的 `image:` 都可以用 digest 指名；`docker ps` 的 IMAGE 照打的名稱 |
| 其他輸出 | `docker images --digests` 的 DIGEST：Docker Hub 的，或推送／拉取過的那個儲存庫的 digest，否則 `<none>`；`docker image inspect` 的 RepoDigests 列出全部；`docker rmi` 移除最後一個標籤時每個 RepoDigest 印一行 `Untagged: 名稱@sha256:…` |

### 13.7 課程資料與檢查

```ts
docker: {
  images: [{ …E20–E22 的欄位, healthcheck?: { test: ['CMD-SHELL', 'pg_isready -U postgres'], interval?: '5s', timeout?, retries?, startPeriod?, startInterval? },
             ready?: 4, commands?: [...E22, 'pg_isready', '建置工具的執行檔'], cmd: []（distroless 可以沒有指令）,
             name: 'registry.example.com:5000/team/web:1.0', tags?: ['latest'] }],
  programs?: [{ …E21 的欄位, ready?: 2 }],
  registries?: [{ host: 'registry.example.com:5000', users?: [{ name: 'ci', token: 'lesson-token-ci-0001', push?: true, repos?: ['team/*'] }], immutable?: false, public?: false }],
  tools?: [{ command: ['go', 'build', '-o', '/out/api', './cmd/api'], needs?: ['go.mod'], writes: [{ path: '/out/api', size: 8_400_000, mode? }], output?, exit?, seconds?, missing? }],
}
```

Compose 的檔案、Dockerfile、Token 檔（例如 `~/ci-token.txt`，模式 0600）都是機器的一般檔案。課程宣告的執行中容器有 Image 的 HEALTHCHECK 時，從它的 `started` 起探測。

| 規則 | 內容 |
|---|---|
| Image | `healthcheck.test` 是 `["CMD", 執行檔, …]`、`["CMD-SHELL", "一行"]` 或 `["NONE"]`，時間是 Go 的寫法，retries 0–100；`ready` 0–3600 秒；`tags` 只給宣告的 Registry 的 Image；`commands` 可以列 `pg_isready` 與建置工具的執行檔；`compose` 起 cmd 與 entrypoint 可以都沒有 |
| Registry | 最多 4 個，位址合法且不重複；每個最多 8 個使用者，名稱 `[a-z0-9._-]`，Token 必須是明顯是假的課程 Token（§13.6）；`repos` 是儲存庫路徑或 `命名空間/*` |
| 建置工具 | `command` 1–20 個一行的字；`writes` 最多 8 個檔案（路徑不含 `..`、大小 0–2^40）；結束碼 0–255、秒數 0–600 |

| 檢查 | 意義 |
|---|---|
| `{ kind: 'compose', project, service, absent?, state?, health?: 'starting' \| 'healthy' \| 'unhealthy', image? }` | 專案的這個服務有容器（`absent`：沒有）、狀態、健康狀態、由哪個 Image 建立（依 Compose 的標籤找容器） |
| `{ kind: 'registry', registry, repository, tag, absent?, digest?, image? }` | Registry 的儲存庫有這個標籤（沒有）、指向這個 digest，或指向本機 `image` 的內容（manifest 的 digest 相同：學習者推送了自己建置的 Image） |
| `image` 的 `digest`、`maxSize` | 本機的 Image 有這個 RepoDigest（Docker Hub 的或 Registry 的）、大小不超過這麼多位元組（多階段建置變小了）；`name` 也可以寫 `名稱@sha256:…`（以 digest 拉取的 Image） |
| `container` 的 `health` | 容器的健康狀態（需要 `compose`） |

### 13.8 測試

| 檔案 | 內容 |
|---|---|
| `tests/terminal-e23.test.ts` | profile（指令同 storage-net、多一個 feature）與分界（`storage-net` 以下 compose、push、login、tag、logout、以 digest 拉取、COPY --from、HEALTHCHECK、`--health-cmd` 的訊息不變，資料欄位要 `compose`）、說明頁與 help；YAML 子集（各種寫法、錯誤、不支援的寫法）、Go 的時間；config（正規化、`.env` 與 Shell 的變數、警告、`:?`、各種驗證錯誤、專案名稱）；up（完整的事件順序、等待健康時鐘前進、ps、curl、logs、再一次 up 的 Running、Recreate、`--build`）、服務名稱的 DNS、Volume 與網路的名稱、別名與標籤、不加 -d 的 attach、logs、ps、stop／start／restart、exec 的錯誤與結束碼、ls、down 與 `-v`、pull、build、權限；不健康的相依、沒有健康檢查、service_completed_successfully（成功與失敗）、docker ps 與 inspect 的健康狀態、pg_isready（本機與 `-h`、沒有這個執行檔）、`--health-*`、HEALTHCHECK（history、inspect、`--no-healthcheck`）；多階段建置（需要的階段、輸出、快取、大小、history、distroless、`--target`、ARG、FROM 階段、COPY --from Image、scratch、錯誤、建置工具缺檔案）；login／logout 與 config.json、login 的錯誤、push（unauthorized、Pushed、Layer already exists、Mounted from、denied、Docker Hub、沒有這個 Image、digest 參照）、重建後的新 digest 與不可變標籤、拉取（標籤、預設 latest、digest、unauthorized、manifest unknown、`--digests`、rmi 的 Untagged、以 digest 執行）、Docker Hub 的 digest、tag 的錯誤；`compose`／`registry`／`image` digest／`container` health 檢查、兩個練習的參考解答與典型錯誤、資料驗證（Token、工具、健康檢查）、合成課程通過 `terminalContentProblems`、不改動傳入的狀態 |
| `tests/support/compose-fixture.ts` | 只供測試：cmp-01（`compose` profile；`~/shop` 的 Compose 專案：postgres（pg_isready、ready 4 秒）、Docker Hub 上的 redis、以 Dockerfile 建置的 app；`~/api` 的 Go 多階段 Dockerfile 與單一階段的 Dockerfile.single；golang、distroless、python、alpine；`registry.example.com:5000`（ci 只能推 team/*、reader 只能拉；team/web:1.0 與 latest）與不可變的 `ghcr.example`；Token 檔）與兩個練習（一個指令啟動整個應用、推送到私有 Registry） |

`tests/terminal-e1.test.ts` 的 `PROFILES` 期望值加上 `compose`。所有已發布的課的 `terminalContentProblems` 仍是 `[]`（逐一重播比對，E23 前後輸出相同）。

### 13.9 只在課文說明、或不模擬的部分

- **Compose**：TTY 的進度畫面（`[+] Running`、✔ 與秒數）、`--scale` 與一個服務多個容器、profiles、`extends`、`include`、configs、secrets、deploy、`docker compose run`／`rm`／`create`／`kill`／`port`／`cp`／`watch`、`restart` 策略的實際重新啟動（E24）、`--abort-on-container-exit`、日誌的顏色、`logs -f` 的等待、Compose 檔案的合併（多個 `-f`）。
- **健康檢查**：探測的實際耗時與 timeout（只有連不到的情形視為逾時）、`docker events` 的 health_status 事件、不健康時的自動重新啟動（E24）、從主機經 docker-proxy 的連線不受 `ready` 影響（服務在 ready 之前從主機連得到）。
- **建置**：真實的編譯器（課程宣告建置工具的結果）、BuildKit 的並行與 `--platform`、`RUN --mount=type=cache`、`COPY --link`、bake。
- **Registry**：manifest list（多平台的 index）、真實的 Docker Hub 帳號與推送、Token 的有效期與 scope、憑證輔助程式（credential helper）、HTTPS 與 `insecure-registries`、`docker search`、`docker manifest`、cosign 等簽章、Registry 的垃圾回收。課程的 Token 只是課程資料，不是秘密，也不能像真實的 Token。

### 13.10 沒有把握的地方（依記得的格式寫，並在此註明）

- **Compose 的 plain 輸出**：一行 ` 識別  狀態`（開頭一個空白、中間兩個空白）依 compose 的 `plainWriter`（`fmt.Fprintln(prefix, ID, Text, StatusText)`，Text 是空的）推得；Volume 建立時名稱加引號（`Volume "shop_pgdata"`）、移除時不加，build 的 ` Service app  Built`、pull 的 ` db  Pulling`／`Pulled` 與 `Skipped - No image to be pulled`、拉取時不列各層、事件的先後（先全部建立、再依序啟動）都依記憶與 v2.2x 的原始碼印象，沒有在 2.32.4 逐字核對。任務說明舉的例子是 TTY 的 ✔ 列；模擬環境依「非 TTY 的 plain 形式」只印事件本身，不加 ✔。
- **Compose 的錯誤與警告**：`validating …: services.web additional properties 'imgae' not allowed`（compose-go v2 的 jsonschema 訊息；舊版是 `Additional property imgae is not allowed`）、型別錯誤的 `must be a list` 寫法、`WARN[0000]` 前綴（logrus 在非終端機時可能是 `time="…" level=warning msg="…"`）、`dependency failed to start: …`、`service "x" didn't complete successfully: exit 3`、`no containers to start`、`Attaching to app-1, …` 與日誌前綴的寬度、`docker compose ls` 的狀態寫法、`config` 的欄位順序與 env_file 不列出、`--services` 依名稱排序。
- **健康檢查**：第一次探測的時間（interval 或 start_interval）、start_interval 的預設 5s 只在 start_period 內使用、探測執行檔找不到時 ExitCode 是 -1、`Health check exceeded timeout` 的寫法、HEALTHCHECK 的 history 寫法（BuildKit 的 `%q`）、沒有健康檢查時 template 錯誤的欄位位置（`:1:2:`，沿用 §10 `docker info --format` 的算法）。
- **pg_isready**：主機無法解析時真實的 pg_isready 也是 `no response`（2）；啟動中的 `rejecting connections`（1）不模擬（ready 之前一律是 no response）。
- **Registry**：`docker login` 警告裡的網址（Docker 24 起的 `https://docs.docker.com/go/credential-store/`）、錯誤的帳號密碼與私有 Registry 未登入時的 `unauthorized: authentication required`（registry:2 是 `no basic auth credentials`，各家 Registry 不同）、不可變標籤的訊息（依 Amazon ECR）、`Mounted from`、`An image does not exist locally with the tag:`（較新的 daemon 可能寫 `tag does not exist: …`）、`docker push -q` 只印名稱、manifest 的 `size`（模擬的 JSON 的位元組數，真實的層大小是壓縮後的）、拉取時的層 ID（模擬環境顯示 diff ID 的前 12 個字，真實的是壓縮後 blob 的 digest）、從 Docker Hub 拉下的 Image 推到私有 Registry 時 digest 改變（模擬環境依 Image ID 算，真實的多平台 index 與單一平台 manifest 不同）。
