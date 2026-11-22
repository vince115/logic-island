# DKR-0：Docker 容器島的課程能力與引擎階段 E20

> 2026-11-23。目標：讓 Docker 容器島（`docker-containers`，前綴 DKR，15 堂）可以撰寫、驗證、發布。本島**不需要新的課程能力或活動**：和網路與伺服器島（[SRV0_SERVER_CAPABILITY](SRV0_SERVER_CAPABILITY.md)）一樣沿用 LNX-0 的 `terminal` 能力（[LNX0_TERMINAL_CAPABILITY](LNX0_TERMINAL_CAPABILITY.md)）與 CN-0 的 `network-protocol` 情境。本文件也是終端機引擎階段 **E20** `containers` 的唯一說明處（E1–E9 在 LNX0，E10–E19 在 SRV0），以及之後 E21–E24 的規劃。之後的進度與下一批由 [AUTONOMOUS_CURRICULUM_PROGRESS](../planning/AUTONOMOUS_CURRICULUM_PROGRESS.md) 計算。

## 1. 範圍

| 部分 | 內容 |
|---|---|
| DKR-0（登錄） | `PREPARED_ISLAND_IDS = ['docker-containers']`、前綴 `DKR`、`UNITS['docker-containers'] = []`、`dockerFromBlueprint`；沒有課程、頁面、旗標、3D、GLB 或 `mapState` 的改動 |
| E20 `containers` | Docker CE 27.5.1 的模擬：daemon 的 Image 與 Container、模擬的 Docker Hub（課程宣告哪些 Image 拉得到）、容器的生命週期與可寫層、日誌、`docker exec`、連接埠對應（主機上的 `docker-proxy`、`curl` 經由它連到容器的服務）、`docker` 群組與 socket 的權限；`docker` 指令（§5） |

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

課程編號即位置，依序連續發布；每一批先完成它需要的引擎階段（各自的 profile 與測試），再寫課。profile 延續**線性鏈**：… < edge < diagnostics < **containers**（E20）< E21 < E22 < E23 < E24。

| 批次 | 課程 | 引擎階段 |
|---|---|---|
| DKR-1 | DKR01–DKR04 | **E20** `containers`（已完成，§5）：DKR01、DKR02 的架構情境旁用 `docker version`、`docker info`、`docker run hello-world` 看 client、daemon 與 Registry 的分工；DKR03 生命週期（created、running、exited、刪除與可寫層）；DKR04 常用指令（run、ps、logs、exec、-p） |
| DKR-2 | DKR05–DKR06 | **E21** Dockerfile 與建置：解析 Dockerfile（FROM、RUN、COPY、WORKDIR、ENV、CMD、ENTRYPOINT、USER、EXPOSE）、`.dockerignore`、`docker build`（BuildKit 的輸出）、每個指令一層、快取命中（`CACHED`）與失效、指令順序、`docker history`、Image 大小；RUN 只執行模擬環境認得的指令（套件安裝依 E5 的套件資料） |
| DKR-3 | DKR07–DKR08 | **E22** Volume 與網路：`docker volume`、`-v`／`--mount`（具名 Volume、bind mount 對應主機的檔案、tmpfs）、UID 不同造成的權限錯誤、重建容器後資料保留；`docker network`（預設 bridge、自訂網路與內建 DNS 127.0.0.11、容器以名稱互連、`--network host`）、哪些埠需要 `-p` |
| DKR-4 | DKR09–DKR11 | **E23** Compose、多階段建置與 Registry：`compose.yaml`（services、ports、environment、volumes、depends_on 與 `condition: service_healthy`）、`docker compose up -d`／`ps`／`logs`／`down`；多階段建置（`COPY --from`、精簡基底、建置參數）；`docker tag`、`push`、以 digest 拉取、私有 Registry 的 `docker login`、不可變標籤與 `latest` 的風險（DKR11 的管線情境） |
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
| 其他 | `docker` 沒有參數印縮短的 Usage 與支援的指令；不存在的指令 `docker: 'x' is not a docker command.`、`See 'docker --help'`；真實存在但屬於之後階段的指令（build、history、volume、network、compose、push、tag、login、stats、top、kill…）說明是哪一個引擎階段（E21–E24） |

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
- **E21–E24 的功能**（§4）：Dockerfile 與 `docker build`、`history`、`commit`；Volume、bind mount、`docker network`、容器之間以名稱連線；Compose、多階段建置、`tag`／`push`／`login`、以 digest 拉取；HEALTHCHECK、資源限制、OOMKilled、重新啟動策略、`stats`／`top`／`kill`／`events`／`pause`。輸入這些指令時說明是哪一個階段。
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
