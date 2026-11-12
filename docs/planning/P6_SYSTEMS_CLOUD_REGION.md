# P6：系統與雲端工程群島（Systems & Cloud Engineering Archipelago）

> 2026-11-12，Five-Region Architecture Expansion。分支 `archipelago/p6-sys`（worktree `../logic-island-p6`），從 `archipelago/v2` @ `ea2e28f` 分出。**沒有**混入 PR #1（`archipelago/v2` → `trials/mvp`），也沒有合併 `main` 或部署。
> 編號說明：本文件的 P6／P7 是 Five-Region Architecture Expansion 的階段，與 [IA v2 §7](MULTI_ARCHIPELAGO_IA_V2.md#7-p2p6-摘要) 舊表中的「P6（design／web 區域佈局）」不同；後者仍未批准、未實作。
> 相關文件：[ISLAND_TAXONOMY](ISLAND_TAXONOMY.md)、[MULTI_ARCHIPELAGO_IA_V2](MULTI_ARCHIPELAGO_IA_V2.md)、[P3_FOUR_REGION_WORLD_FEASIBILITY](P3_FOUR_REGION_WORLD_FEASIBILITY.md)、[P7_SYSTEMS_LABS](P7_SYSTEMS_LABS.md)、[R5_RELEASE_GATE](R5_RELEASE_GATE.md)。

## 0. 結果摘要

| 項目 | P6 之前 | P6 之後 |
|---|---:|---:|
| 區域 | 4 | **5**（新增 `sys`，`order: 5`） |
| 主題島 | 23 | **29**（新增 6） |
| 規劃總課數 | 431 | **520**（新增 89） |
| 已開放（published） | 80 | **80**（不變） |
| 規劃中（outline only） | 351 | **440** |
| 學習路線 | 7（A–F、J） | **10**（新增 K、L、M） |
| 共用實驗島／考試引擎 | 1／1 | 1／1（不變；P7 只新增 registry 的領域與規劃中實驗） |

既有 431 堂的 Lesson ID、slug、路由與進度 key 全部不變；`git diff` 中既有課程資料只有新增，沒有修改或刪除（`curriculum-blueprint.json` 只在陣列與物件尾端追加）。

## 1. 命名與識別碼

| 種類 | 決定 | 檢查 |
|---|---|---|
| Region ID | `sys` | 與 `cs`、`ai`、`design`、`web` 不衝突；`REGION_IDS` 與 `Region.order`（5）分開，顯示順序不靠 ID |
| 英文名 | Systems & Cloud Engineering Archipelago | 依需求原文；藍圖 `regions.sys` |
| 島嶼 ID | `linux-systems`、`docker-containers`、`network-servers`、`cloud-infrastructure`、`devops-cicd`、`kubernetes-reliability` | kebab-case（`validateWorld`）；刻意不用 `networks`（CS 的計算機網路島）或 `devops` 等易混名稱 |
| 顯示代碼／Lesson 前綴 | `LNX`、`DKR`、`SRV`、`CLD`、`CICD`、`KUB` | 全大寫字母，不含數字（不用 `K8S`，避免與兩位數課號混淆）；需求中的 SYS01–SYS06 是區內島號（`order` 1–6），不當作前綴；`CICD` 是第一個四字母前綴，`parseLessonId` 以完整前綴錨定比對，測試涵蓋 `CICD15`、`CIC01`、`SYS01` |
| Accent | 島：`#2e7d32`、`#1565c0`、`#00838f`、`#5e35b1`、`#ef6c00`、`#283593`；區域：`#0097a7` | 島 accent 由 `validateWorld` 檢查唯一；區域色在深色模式狀態標籤上對比 4.61（見 §6.3） |

## 2. P6a — 課綱規劃與重疊檢查

### 2.1 與既有課程的分界（避免重複）

| 主題 | 既有課程 | SYS 的處理 |
|---|---|---|
| TCP/IP、子網路、TCP／UDP、Socket | CN05、CN09、CN11 | SRV01 從伺服器端操作（監聽埠、綁定位址、`ss`），協定列為建議先修 |
| DNS、HTTP、REST | CN12、CN14、WEB11 | SRV02 管 DNS 記錄與 TTL、SRV03 用 curl 觀察；不重教協定 |
| HTTPS／TLS 原理 | CN13 | SRV04 只做憑證申請、安裝、自動更新與到期監控 |
| CDN、HTTP 快取 | CN15 | SRV11 只做 Cache-Control 設定與版本化 |
| 網路除錯、防火牆概念 | CN17、CN19 | SRV12 依層級選工具；SRV09 在 Linux 上設定 ufw／nftables |
| 雲端服務模型（管理視角） | MIS05 | CLD01 從工程視角（共同責任、按用量計費），MIS05 為建議先修 |
| AI 服務容器化、部署模式、AI 的 CI/CD、可觀測性、事故、SLO | OPS04、OPS06、OPS11、OPS13、OPS18、OPS19 | SYS 教通用版本；OPS 課只出現在 SYS 的「建議」，AI 特有內容（模型產出物、評估門檻、漂移）留在 OPS |
| 版本管理、測試策略 | SA16、SA18 | CICD02、CICD05、CLD09 以建議先修引用 |
| Bash 語法基礎 | F05、F07、F13 | LNX13 只教 Shell 特有的部分 |
| 作業系統原理 | **沒有任何島** | LNX08 標 `gaps`：「作業系統原理（行程、排程、記憶體管理）」；路線 M 因此顯示此缺口 |
| 後端框架（伺服器端應用開發） | **沒有任何島** | 路線 K 以 DB16（程式串接資料庫）代替並在說明寫明 |

跨島引用沿用 IA v2 §9 的單向規則：只指向更前面的區域或島（`cs` → `ai` → `design` → `web` → `sys`，區內依島號）。SYS 是第五區，所以只有 SYS 指向既有課程，**沒有任何既有課程新增指向 SYS 的連結**。

### 2.2 課數與取捨

每島目標 15 堂，是上限不是要求。實際 89 堂：LNX 15、DKR 15、SRV 14、CLD 15、CICD 15、KUB 15。

- **SRV 為 14 堂**：TCP/IP、Port／Socket 與 HTTP／HTTPS 在 CN 島已有完整課程，合併成 SRV01、SRV03 兩堂操作課；Web Server Architecture 與 Nginx 分開，因為一堂講並行模型、一堂講設定。
- **LNX 新增「文字處理、管線與重新導向」（LNX05）**：需求清單沒有列，但日誌查詢、Bash Script 與故障排除都依賴它，是必要的教學單元。
- **DKR 把「Container 基本概念」與「VM vs Container」合為 DKR01**；「Production Container Practices」拆為 DKR14（健康檢查、資源限制、優雅關閉）與綜合專題 DKR15。
- **KUB 的「SRE Fundamentals」放在綜合專題 KUB15**（Toil、On-call、錯誤預算政策、演練），SLI／SLO／SLA 與錯誤預算在 KUB14。
- 每島最後一堂是綜合專題（與既有島嶼一致）。

難度分布：Beginner 16、Intermediate 52、Advanced 21。KUB 沒有 Beginner（以 DKR09 Compose 為入口先修）。

### 2.3 審核結果（機器檢查）

| # | 規則 | 結果 | 檢查者 |
|---|---|---|---|
| 1 | Lesson ID 唯一 | 通過（520） | `validateWorld`、`tests/world.test.ts` |
| 2 | Island ID 唯一 | 通過（29＋實驗島） | `validateWorld` |
| 3 | Slug 唯一（整個 `/curriculum/[slug]` 命名空間） | 通過 | `validateCatalog` |
| 4 | 先修與建議課程存在 | 通過 | `validateCatalog` |
| 5 | 無循環依賴（必要＋建議兩種邊） | 通過 | `validateCatalog`（DFS） |
| 6 | 跨 Region 引用有效 | 通過：SYS → CS／AI／WEB 共 36 個引用（CN 15、OPS 5、DB 4、SA 4、F 3、MIS 3、PL 1、FE 1），**全部是建議先修**；SYS 不需要任何其他區域的必要先修 | `validateCatalog` |
| 7 | 每島課號 01..n 連續、與 `lessonCount` 相符 | 通過 | `validateWorld` |
| 8 | 每堂的活動 id 都在活動 registry | 通過（新增 5 個 T1 活動） | `validateActivities` |
| 9 | 路線包含 targets 與其全部必要先修、順序正確 | 通過（K 62、L 60、M 48 堂） | `validatePaths` |

人工審核（本文件）：難度在島內大致遞增（各島第一堂為 B，專題為 A）；每堂 3 個學習目標、4–5 個概念、一句成果；不為湊數加入的課已在 §2.2 說明。

### 2.4 六島課綱（由 `docs/planning/data/curriculum-blueprint.json` 產生）

難度：B＝Beginner、I＝Intermediate、A＝Advanced。所有課程 `status: planned`（Content Status：規劃中），沒有頁面、沒有連結。

#### LNX — Linux 系統島（`linux-systems`，15 堂；B 5／I 9／A 1）

在模擬終端機中學會 Linux：發行版、Shell、檔案系統、使用者與權限、行程與 systemd、套件、日誌、SSH 與 Bash Script，最後維護一台伺服器。作業系統原理（排程、記憶體管理）目前沒有對應的島，列為課程缺口；程式語法基礎沿用基礎程式島。

| ID | 課程 | 難 | 必要先修 | 建議（跨島） | 活動 | 練習 |
|---|---|---|---|---|---|---|
| LNX01 | Linux 概論與發行版<br><small>`linux-overview-and-distributions`</small> | B | — | MIS05 | `case-study-board` | analysis |
| LNX02 | 終端機與 Shell 基礎<br><small>`terminal-and-shell-basics`</small> | B | LNX01 | — | `terminal-sim` | simulation |
| LNX03 | Linux 檔案系統階層<br><small>`linux-filesystem-hierarchy`</small> | B | LNX02 | — | `terminal-sim` | simulation |
| LNX04 | 檔案與目錄操作<br><small>`files-and-directories`</small> | B | LNX03 | — | `terminal-sim` | simulation |
| LNX05 | 文字處理、管線與重新導向<br><small>`text-processing-and-pipes`</small> | I | LNX04 | — | `terminal-sim` | simulation |
| LNX06 | 使用者與群組<br><small>`users-and-groups`</small> | B | LNX04 | — | `terminal-sim` | simulation |
| LNX07 | Linux 權限與 chmod<br><small>`linux-file-permissions`</small> | I | LNX06 | — | `terminal-sim` | simulation |
| LNX08 | Process 管理與訊號<br><small>`processes-and-signals`</small> | I | LNX05 | PL14 | `terminal-sim` | simulation |
| LNX09 | 套件管理<br><small>`package-management`</small> | I | LNX06 | — | `terminal-sim` | simulation |
| LNX10 | systemd 與服務管理<br><small>`systemd-services`</small> | I | LNX08 | — | `terminal-sim` | config |
| LNX11 | 日誌與 journalctl<br><small>`logs-and-journald`</small> | I | LNX05、LNX10 | — | `terminal-sim` | simulation |
| LNX12 | SSH 遠端連線與金鑰<br><small>`ssh-remote-access`</small> | I | LNX07 | CN13 | `protocol-sequence` | config |
| LNX13 | Bash Script 撰寫<br><small>`bash-scripting`</small> | I | LNX05、LNX07 | F05、F07、F13 | `terminal-sim` | code |
| LNX14 | 排程：cron 與 systemd timer<br><small>`cron-and-systemd-timers`</small> | I | LNX10、LNX13 | — | `terminal-sim` | config |
| LNX15 | Linux 系統島綜合專題：維護一台伺服器<br><small>`linux-systems-capstone`</small> | A | LNX09、LNX11、LNX12、LNX14 | — | `challenge-stages` | simulation |

#### DKR — Docker 容器島（`docker-containers`，15 堂；B 4／I 8／A 3）

從容器與虛擬機的差異出發，學會 Image 與 Container 的生命週期、Dockerfile 與分層快取、Volume、容器網路、Compose、多階段建置、Registry、安全與除錯，最後把一個應用容器化並準備上線。AI 服務的容器化屬 AI 工程島（OPS04），本島是通用的容器基礎。

| ID | 課程 | 難 | 必要先修 | 建議（跨島） | 活動 | 練習 |
|---|---|---|---|---|---|---|
| DKR01 | 容器概念：與虛擬機的差異<br><small>`containers-vs-virtual-machines`</small> | B | LNX08 | — | `architecture-diagram` | analysis |
| DKR02 | Docker 架構：Client、Daemon 與 Registry<br><small>`docker-architecture`</small> | B | DKR01 | — | `architecture-diagram` | analysis |
| DKR03 | Image 與 Container 的生命週期<br><small>`images-and-containers`</small> | B | DKR02 | — | `container-playground` | simulation |
| DKR04 | Docker CLI 常用指令<br><small>`docker-cli-essentials`</small> | B | DKR03 | — | `container-playground` | simulation |
| DKR05 | 撰寫 Dockerfile<br><small>`writing-dockerfiles`</small> | I | DKR04、LNX09 | — | `container-playground` | config |
| DKR06 | Image 分層與建置快取<br><small>`image-layers-and-build-cache`</small> | I | DKR05 | — | `container-playground` | analysis |
| DKR07 | Volume 與資料保存<br><small>`volumes-and-persistent-data`</small> | I | DKR04、LNX07 | — | `container-playground` | simulation |
| DKR08 | 容器網路<br><small>`container-networking`</small> | I | DKR04 | CN09 | `container-playground` | simulation |
| DKR09 | Docker Compose 多容器應用<br><small>`docker-compose`</small> | I | DKR07、DKR08 | DB16 | `container-playground` | config |
| DKR10 | 多階段建置<br><small>`multi-stage-builds`</small> | I | DKR06 | — | `container-playground` | config |
| DKR11 | Container Registry 與版本標籤<br><small>`container-registries`</small> | I | DKR05 | — | `pipeline-diagram` | analysis |
| DKR12 | 容器安全<br><small>`container-security`</small> | A | DKR10、LNX07 | CN18 | `case-study-board` | analysis |
| DKR13 | 容器除錯<br><small>`debugging-containers`</small> | I | DKR09、LNX11 | — | `container-playground` | simulation |
| DKR14 | 健康檢查、資源限制與優雅關閉<br><small>`health-checks-limits-and-shutdown`</small> | A | DKR13 | — | `container-playground` | config |
| DKR15 | Docker 容器島綜合專題：容器化並準備上線<br><small>`docker-containers-capstone`</small> | A | DKR11、DKR12、DKR14 | — | `challenge-stages` | design |

#### SRV — 網路與伺服器島（`network-servers`，14 堂；B 1／I 10／A 3）

從伺服器端操作網路：監聽埠、DNS 記錄、用 curl 觀察 HTTP、TLS 憑證實務、Nginx、反向代理、負載平衡、防火牆、SSH 通道、CDN 與網路診斷，最後架設 HTTPS 網站並追蹤一個請求。TCP/IP、DNS、HTTP、TLS 的協定原理屬計算機網路島，本島只引用不重教。

| ID | 課程 | 難 | 必要先修 | 建議（跨島） | 活動 | 練習 |
|---|---|---|---|---|---|---|
| SRV01 | 伺服器端的網路基礎：IP、Port 與 Socket<br><small>`server-networking-essentials`</small> | B | LNX02 | CN05、CN09、CN11 | `terminal-sim` | simulation |
| SRV02 | 網域與 DNS 記錄管理<br><small>`dns-records-and-domains`</small> | I | SRV01 | CN12 | `request-path` | config |
| SRV03 | 用 curl 觀察 HTTP 請求與回應<br><small>`observing-http-with-curl`</small> | I | SRV01 | CN12、CN14 | `request-path` | simulation |
| SRV04 | TLS 憑證實務：申請、安裝與更新<br><small>`tls-certificates-in-practice`</small> | I | SRV02、SRV03 | CN13 | `request-path` | config |
| SRV05 | 網頁伺服器架構<br><small>`web-server-architecture`</small> | I | SRV03 | — | `architecture-diagram` | analysis |
| SRV06 | Nginx 設定入門<br><small>`nginx-basics`</small> | I | SRV05、LNX10 | — | `request-path` | config |
| SRV07 | 反向代理<br><small>`reverse-proxy`</small> | I | SRV06 | — | `request-path` | config |
| SRV08 | 負載平衡<br><small>`load-balancing`</small> | I | SRV07 | — | `request-path` | simulation |
| SRV09 | 伺服器防火牆：ufw 與 nftables<br><small>`linux-firewalls`</small> | I | SRV01、LNX07 | CN19 | `terminal-sim` | config |
| SRV10 | SSH 通道與跳板機<br><small>`ssh-tunnels-and-bastions`</small> | A | LNX12、SRV09 | — | `protocol-sequence` | config |
| SRV11 | CDN 與快取設定<br><small>`cdn-and-edge-caching`</small> | I | SRV07 | CN15 | `request-path` | config |
| SRV12 | 網路診斷工具<br><small>`network-diagnostics`</small> | I | SRV02、SRV03 | CN17 | `terminal-sim` | simulation |
| SRV13 | 伺服器故障排除方法<br><small>`server-troubleshooting`</small> | A | SRV07、SRV12、LNX11 | — | `case-study-board` | case-study |
| SRV14 | 網路與伺服器島綜合專題：架設 HTTPS 網站並追蹤請求<br><small>`network-servers-capstone`</small> | A | SRV04、SRV08、SRV10、SRV11、SRV13 | — | `challenge-stages` | design |

#### CLD — 雲端基礎設施島（`cloud-infrastructure`，15 堂；B 3／I 8／A 4）

雲端運算的服務模型、區域與帳號、虛擬機、VPC、IAM、物件儲存、託管資料庫、AWS／GCP 服務對照、Infrastructure as Code 與 Terraform、雲端安全、成本與災難復原，最後設計一套雲端架構。管理者視角的雲端服務選擇屬管理資訊系統島（MIS05）。

| ID | 課程 | 難 | 必要先修 | 建議（跨島） | 活動 | 練習 |
|---|---|---|---|---|---|---|
| CLD01 | 雲端運算概論與服務模型<br><small>`cloud-computing-fundamentals`</small> | B | — | MIS05 | `case-study-board` | analysis |
| CLD02 | 區域、可用區與帳號結構<br><small>`regions-zones-and-accounts`</small> | B | CLD01 | — | `architecture-diagram` | analysis |
| CLD03 | 雲端虛擬機<br><small>`cloud-virtual-machines`</small> | B | CLD02、LNX12 | — | `deployment-simulator` | config |
| CLD04 | VPC 與雲端網路<br><small>`vpc-and-cloud-networking`</small> | I | CLD02、SRV01 | CN05 | `architecture-diagram` | design |
| CLD05 | IAM 身分與權限<br><small>`cloud-iam`</small> | I | CLD02 | LNX06 | `decision-simulation` | analysis |
| CLD06 | 物件儲存<br><small>`object-storage`</small> | I | CLD05 | — | `cost-calculator` | config |
| CLD07 | 託管資料庫<br><small>`managed-databases`</small> | I | CLD04 | DB14、DB19 | `architecture-diagram` | analysis |
| CLD08 | AWS 與 GCP 服務對照<br><small>`aws-and-gcp-service-map`</small> | I | CLD03、CLD06、CLD07 | — | `case-study-board` | analysis |
| CLD09 | 基礎設施即程式碼<br><small>`infrastructure-as-code`</small> | I | CLD04、CLD05 | SA18 | `pipeline-diagram` | analysis |
| CLD10 | Terraform 入門<br><small>`terraform-basics`</small> | I | CLD09 | — | `deployment-simulator` | config |
| CLD11 | Terraform State 與模組<br><small>`terraform-state-and-modules`</small> | A | CLD10 | — | `deployment-simulator` | config |
| CLD12 | 雲端安全基礎<br><small>`cloud-security-basics`</small> | A | CLD04、CLD05 | CN18、MIS15 | `case-study-board` | case-study |
| CLD13 | 雲端成本管理<br><small>`cloud-cost-management`</small> | I | CLD08 | — | `cost-calculator` | calculation |
| CLD14 | 備份與災難復原<br><small>`backup-and-disaster-recovery`</small> | A | CLD06、CLD07 | DB19 | `decision-simulation` | design |
| CLD15 | 雲端基礎設施島綜合專題：設計一套雲端架構<br><small>`cloud-infrastructure-capstone`</small> | A | CLD11、CLD12、CLD13、CLD14 | — | `challenge-stages` | design |

#### CICD — DevOps 與 CI/CD 島（`devops-cicd`，15 堂；B 3／I 8／A 4）

DevOps 的文化與實務：團隊 Git 流程、持續整合、GitHub Actions、自動化測試、建置與部署管線、環境變數與機密、部署策略、監控、日誌、回滾與事故應變，最後打造從 commit 到上線的完整管線。AI 系統特有的評估門檻與再訓練屬 AI 工程島。

| ID | 課程 | 難 | 必要先修 | 建議（跨島） | 活動 | 練習 |
|---|---|---|---|---|---|---|
| CICD01 | DevOps 概念與文化<br><small>`devops-culture-and-practices`</small> | B | — | SA02 | `case-study-board` | analysis |
| CICD02 | 團隊 Git 工作流程<br><small>`git-workflows-for-teams`</small> | B | CICD01 | SA18 | `decision-simulation` | analysis |
| CICD03 | 持續整合<br><small>`continuous-integration`</small> | B | CICD02 | — | `pipeline-sim` | simulation |
| CICD04 | GitHub Actions 入門<br><small>`github-actions-basics`</small> | I | CICD03、LNX13 | — | `pipeline-sim` | config |
| CICD05 | 管線中的自動化測試<br><small>`automated-testing-in-pipelines`</small> | I | CICD04 | SA16、FE12 | `pipeline-sim` | simulation |
| CICD06 | 建置管線與產出物<br><small>`build-pipelines-and-artifacts`</small> | I | CICD04、DKR11 | — | `pipeline-sim` | config |
| CICD07 | 環境變數與設定管理<br><small>`environment-variables-and-config`</small> | I | CICD04 | — | `pipeline-sim` | config |
| CICD08 | 機密管理<br><small>`secrets-management`</small> | I | CICD07 | CLD05 | `case-study-board` | analysis |
| CICD09 | 部署管線<br><small>`deployment-pipelines`</small> | I | CICD06、CICD07 | — | `pipeline-sim` | simulation |
| CICD10 | 部署策略：滾動、藍綠與金絲雀<br><small>`deployment-strategies`</small> | A | CICD09 | OPS06 | `deployment-simulator` | simulation |
| CICD11 | 監控與告警<br><small>`monitoring-and-alerting`</small> | I | CICD09 | LNX11 | `monitoring-dashboard` | analysis |
| CICD12 | 集中式日誌<br><small>`centralized-logging`</small> | I | CICD11 | — | `monitoring-dashboard` | analysis |
| CICD13 | 回滾與發布安全<br><small>`rollback-and-release-safety`</small> | A | CICD10、CICD11 | — | `pipeline-sim` | simulation |
| CICD14 | 事故應變與事後檢討<br><small>`incident-response`</small> | A | CICD12、CICD13 | OPS18 | `case-study-board` | case-study |
| CICD15 | DevOps 與 CI/CD 島綜合專題：從 commit 到上線<br><small>`devops-cicd-capstone`</small> | A | CICD05、CICD08、CICD14 | — | `challenge-stages` | design |

#### KUB — Kubernetes 與可靠性工程島（`kubernetes-reliability`，15 堂；B 0／I 9／A 6）

容器編排與 Kubernetes：架構、Pod、Deployment、Service、ConfigMap／Secret、Ingress 與 Gateway API、Persistent Volume、Helm、自動擴展與滾動更新，再到叢集監控、可觀測性、SLI／SLO／SLA 與 SRE 實務。

| ID | 課程 | 難 | 必要先修 | 建議（跨島） | 活動 | 練習 |
|---|---|---|---|---|---|---|
| KUB01 | 容器編排概念<br><small>`container-orchestration`</small> | I | DKR09 | — | `cluster-sim` | analysis |
| KUB02 | Kubernetes 架構<br><small>`kubernetes-architecture`</small> | I | KUB01 | — | `architecture-diagram` | analysis |
| KUB03 | Pod<br><small>`kubernetes-pods`</small> | I | KUB02 | — | `cluster-sim` | config |
| KUB04 | Deployment 與 ReplicaSet<br><small>`deployments-and-replicasets`</small> | I | KUB03 | — | `cluster-sim` | simulation |
| KUB05 | Service 與服務發現<br><small>`services-and-service-discovery`</small> | I | KUB04 | SRV08 | `cluster-sim` | simulation |
| KUB06 | ConfigMap 與 Secret<br><small>`configmaps-and-secrets`</small> | I | KUB04、CICD08 | — | `cluster-sim` | config |
| KUB07 | Ingress 與 Gateway API<br><small>`ingress-and-gateway-api`</small> | A | KUB05、SRV07 | SRV04 | `request-path` | config |
| KUB08 | Persistent Volume 與有狀態應用<br><small>`persistent-volumes`</small> | A | KUB04、DKR07 | — | `cluster-sim` | config |
| KUB09 | Helm 套件管理<br><small>`helm-charts`</small> | I | KUB06 | — | `cluster-sim` | config |
| KUB10 | 自動擴展<br><small>`kubernetes-autoscaling`</small> | A | KUB04 | OPS08 | `cluster-sim` | simulation |
| KUB11 | 滾動更新與回滾<br><small>`rolling-updates-and-rollbacks`</small> | I | KUB04、CICD10 | — | `cluster-sim` | simulation |
| KUB12 | 叢集監控<br><small>`cluster-monitoring`</small> | I | KUB05、CICD11 | — | `monitoring-dashboard` | analysis |
| KUB13 | 可觀測性：指標、日誌與追蹤<br><small>`observability-metrics-logs-traces`</small> | A | KUB12、CICD12 | OPS13 | `metric-explorer` | analysis |
| KUB14 | SLI、SLO 與 SLA<br><small>`sli-slo-sla`</small> | A | KUB13 | OPS19 | `metric-explorer` | calculation |
| KUB15 | Kubernetes 與可靠性工程島綜合專題：SRE 實務演練<br><small>`kubernetes-reliability-capstone`</small> | A | KUB07、KUB08、KUB09、KUB10、KUB11、KUB14、CICD14 | — | `challenge-stages` | design |

## 3. P6b — 五區域資料架構

資料流沿用 P1b：`docs/planning/data/curriculum-blueprint.json`（來源）→ `scripts/planning-data.mjs` → `src/content/world/planning-data.json`（產生物，`--check` 會檢查是否過期）→ `catalog.ts`／`islands.ts` → 頁面。

| 檔案 | 變更 |
|---|---|
| `docs/planning/data/curriculum-blueprint.json` | `regions.sys`、6 個島嶼條目、89 堂 `planned`（只追加） |
| `docs/planning/data/learning-paths.json` | 路線 K、L、M（只追加；J 不變） |
| `src/content/world/planning-data.json` | 由腳本重新產生 |
| `src/content/world/types.ts` | `REGION_IDS` 加 `sys`；`Region.summary?`（區域簡介，選填） |
| `src/content/world/lesson-id.ts` | `LESSON_PREFIXES` 加 6 個前綴 |
| `src/content/world/islands.ts` | `sys` 區域（`order: 5`、簡介）與 6 座 `fromPlan` 島（`status` 由課程推導為 planned、無入口） |
| `src/content/world/index.ts` | `regionCountZh()`：「五大群島」的字由資料決定 |
| `src/content/world/validate.ts` | `summary` 不可為空字串（結構規則；不含任何總數） |
| `src/content/world/activities.ts` | 5 個 T1 活動：`terminal-sim`、`container-playground`、`request-path`、`pipeline-sim`、`cluster-sim` |
| `src/content/world/labs.ts` | 領域 `systems-cloud`（系統與雲端）與 4 個規劃中實驗（P7） |
| `src/content/world/paths.ts` | K、L、M 的說明 |

**數量只釘在 taxonomy contract**：`tests/world.test.ts` 與 [ISLAND_TAXONOMY §1](ISLAND_TAXONOMY.md)。一般 validator 仍只檢查結構（每島 `lessonCount` 與實際課數相符、課號連續、前綴唯一），沒有寫死 5／29／520。

沒有變更：既有 431 堂的任何欄位、`src/content/curriculum`（80 堂教材）、`src/lib/progress.ts` 與 localStorage key、`src/content/trials`／`src/lib/trials`（題庫與考試引擎）、`src/lib/islands`（3D）、`public/models`（GLB）、`next.config.ts`、CI workflow。

## 4. P6c — 側欄與 `/curriculum`

都由資料驅動，不需要為 SYS 寫專屬的導覽程式：

- 側欄「學習群島 → 五大群島 · 完整課綱」的課程樹多出「系統與雲端工程群島 規劃中 · 89 堂」，底下 6 座島，每島列出規劃中的課（停用列：沒有 `href`、不可聚焦，顯示「規劃中」）。
- 收合的群組**不渲染子節點**（`site-sidebar.tsx` 的 `{open && …}`），所以新增 89 堂不會在載入時多出 89 個 DOM 列；展開狀態沿用 `logic-island.nav`（只存開合，不存進度）。
- `/curriculum`：區域列加第 5 張卡（6 座主題島、89 堂大綱、規劃中）；區域段落顯示名稱、英文名、`summary` 簡介、島數與課數，以及 6 張規劃中島卡（課程大綱預設收合在 `<details>`，沒有任何連結）。不顯示任何完成進度。
- 文字「四大群島」／「四大學習群島」改為由區域數產生；用戶端側欄的「五大群島 · 完整課綱」是固定文字（用戶端元件不載入規劃資料），數量由 taxonomy contract 與 `e2e/navigation.spec.ts` 釘住。

### 4.1 瀏覽器驗證（本機 production build，`next start`）

| 檢查 | 結果 |
|---|---|
| 1280×900（深色）：區域列 5 張、無水平捲動 | 通過（`scrollWidth` 1280） |
| 五個區域預設收合（`aria-expanded="false"`） | 通過 |
| 鍵盤：Tab 聚焦 SYS 區域 → Enter 展開 → 6 座島皆收合 | 通過 |
| 展開 Linux 系統島：15 列、0 個連結、0 個可聚焦元素 | 通過 |
| 375×812（手機）：抽屜開啟、展開 SYS、無水平捲動、狀態寫入 `logic-island.nav` | 通過 |
| `/curriculum` 上的課程連結 | 80 個，全部 HTTP 200；沒有任何 SYS slug 的連結 |
| `/curriculum/linux-overview-and-distributions` | 404（規劃中課程沒有頁面，也沒有連結指向它） |
| `/learn`、`/learn/array`、`/learn/bfs`、`/learn/color-contrast` | 200；`/visualize` 仍為轉址 |
| 預設建置 `/world`、`/trials` | 404（旗標關閉） |

## 5. 跨區域學習路線 K、L、M

既有路線 ID 是「字母-kebab」（A–F、J；G、H、I 為 IA v2 §2.7 的候選、未寫入資料）。新增 K、L、M，沒有覆蓋 J；`lessons` 由腳本依「targets＋遞移必要先修」產生並依目錄順序（即相依順序）排列，`validatePaths` 檢查。路線引擎不需要擴充。

| 路線 | 方向 | Targets | 堂數 | 備註 |
|---|---|---|---:|---|
| `K-fullstack-deployment` 全端部署 | WEB → SYS | FE10、DB16、DKR09、LNX12、SRV04、SRV07、CICD09、CLD03 | 62 | 沒有後端框架島，以 DB16 代替（說明中寫明） |
| `L-ai-infrastructure` AI 基礎設施 | AI → SYS | LLM09、OPS02、OPS07、DKR10、CLD03、CICD09、KUB13 | 60 | GPU 推論以 OPS07 代表；CUDA／GPU 叢集為未來方向，本次不新增教材或實驗環境 |
| `M-cloud-devops-foundations` 雲端與 DevOps 基礎 | CS → SYS | CN05、CN09、CN12、LNX10、LNX13、SRV12、DKR09、CLD04、CLD10、CICD09、KUB11 | 48 | 作業系統原理沒有對應的島，路線的 `gaps` 會顯示 |

三條都沒有 ML／DL 課；所有課都是 planned（除了 F、DB 的已開放課），`completion.learnable` 為 false。

## 6. P6d — 3D 世界整合規劃

### 6.1 盤點（`archipelago/p6-sys`）

| 項目 | 現況 |
|---|---|
| World Layout | `/world` 總覽 = 樞紐＋`cs`、`ai` 兩區（M3.1 構圖，已批准為最終）；`LOGIC_ISLAND_REGIONAL_WORLD=1` 才建置，noindex |
| Region Layout | `REGION_LAYOUTS` 只含 `MAPPED_REGION_IDS = ['cs', 'ai']`（`src/lib/islands/regions/region-layouts.ts:81`）；其他區域 `isMappedRegion` 為 false |
| GLB | 只有 `public/models/islands/basics-island.v2.1.glb`（879,708 bytes）；其餘島嶼為程式生成的六角地塊 |
| Marker／相機／手機導覽 | 沿用 M3 的名牌避讓、相機取景與清單導覽；`m3/mobile-marker-occlusion-fix` 未合併（含私人歷史，不在合併路徑） |
| 首頁 `/` | 正式首頁的 3D 群島，不受本次影響 |

### 6.2 本次做法：方案 A（只有清單）

`/world` 的導覽清單由 `unmappedRegions()` 從資料產生，P6 之後**自動**列出 `sys`：「系統與雲端工程群島 · 6 座主題島 · 89 堂 · 規劃中 · 尚無 3D 地圖」，連到 `/curriculum#region-sys`。旗標建置確認：清單有 3 個「尚無 3D 地圖」（design、web、sys）、只有 `/world/cs`、`/world/ai` 有地圖連結、沒有產生 `/world/sys`。3D 場景、座標、GLB、旗標都沒有修改；也沒有建立空白地圖頁。

### 6.3 未來的 3D 建置方案（供後續階段批准）

| 階段 | 內容 | 資產 | 前置條件 |
|---|---|---|---|
| S1 設計稿 | 五區總覽構圖：寬螢幕可用「樞紐＋五瓣環狀」，手機直排；SYS 放在 WEB 與 CS 之間（K、M 兩條路線的方向），以 `validateRegion` 驗證 6 島的 19 格六角座標 | 無 | 重新批准 M3.1 總覽（5 區會改動最終構圖） |
| S2 程式生成地塊（方案 B） | `REGION_LAYOUTS.sys`：6 個 planned 聚落、橋與港口；`MAPPED_REGION_IDS` 加 `sys`；名牌與相機取景 | 無 GLB | S1 批准；draw call 預算（桌機 150、手機 100，暫定）量測 |
| S3 地標 GLB（方案 C） | 依下表的視覺概念，每島一個小型地標，沿用 M3.2 GLB 管線與 Scale／Anchor Contract | 6 個地標 GLB，單檔目標 ≤ 300 KB（Draco／meshopt 後），共用調色盤材質 | 至少一座 SYS 島有已開放的課；資產保全庫流程；真機效能 |

| 島 | 視覺概念（只是概念，現無模型） | 建議節點 |
|---|---|---|
| LNX | 終端機與系統控制中心：控制台、發光的提示字元 | `landmark`、`marker_anchor` |
| DKR | 貨櫃碼頭：堆疊的貨櫃、起重機 | `landmark`、`crane`（可動畫）、`marker_anchor` |
| SRV | 網路節點與通訊塔 | `landmark`、`tower_light` |
| CLD | 雲端運算設施：浮在雲層上的機房 | `landmark`、`cloud_layer` |
| CICD | 自動化部署工廠：輸送帶與檢查站 | `landmark`、`conveyor` |
| KUB | 叢集調度中心：舵輪（Kubernetes 的意象）與多個艙體 | `landmark`、`helm_wheel` |

本階段不新增 GLB、不修改已核准的世界配置、不強制開啟旗標。

## 7. 驗證紀錄

| 層級 | 指令／方法 | 結果 |
|---|---|---|
| TypeScript | `tsc --noEmit` | 0 錯誤 |
| ESLint | `eslint src tests e2e` | 0 |
| Vitest | `vitest run`（公開模式，PATH 加 IntelliJ 內建 JDK 讓 Java 範例實際編譯） | 70 檔、1872 通過、9 skip（私人題庫條件，與 R3 基線相同）；不加 JDK 時 1593 通過、288 skip |
| 預設建置 | `next build` | 通過；101 個預先產生路由，與 P4 之後相同（P6 不改路由契約；P7 才刻意新增 `/learn/linux-terminal`，見 [P7_SYSTEMS_LABS §4](P7_SYSTEMS_LABS.md#4-測試計畫與結果)） |
| E2E（預設） | `navigation.spec`、`player.spec`（桌機＋手機） | 38 通過、2 skip（設計上只跑桌機） |
| 旗標建置 | `LOGIC_ISLAND_TRIALS=1 LOGIC_ISLAND_REGIONAL_WORLD=1 next build`（112 頁） | 通過 |
| E2E（旗標） | `regional-world`、`trials`、`trials-history`、`islands` | 76 通過、6 skip |
| 私人題庫 | T.3J `leak-scan --dir .next`（旗標建置；在 `logic-island-t3j` 唯讀執行，350 題、18,220 片段） | 乾淨 |
| 瀏覽器 | §4.1 | 通過 |

未執行：真機、需私人題庫 fixture 建置的 trials E2E、3D 效能（本次沒有 3D 變更）。

## 8. 區域狀態標籤對比（已在整合時修正）

原紀錄「AI 2.09、設計 3.27、SYS 4.61」量的是強調色對面板底色；標籤實際畫在 12% 的強調色底上，重新計算後亮色模式的 CS 3.12、Web 3.25、SYS 3.05，深色模式的 AI 1.95、設計 3.07、CS 3.88、Web 3.83、SYS 3.96 都未達 AA 4.5。

處理方式（不改已核准的品牌色）：新增前景 token `--island-accent-fg`（`src/app/globals.css`），值為強調色與主題文字色 `--text` 以 55%／45% 混合；邊框、色條、底色仍用原本的 `--island-accent`。用到強調色當文字的四條規則改用它：`/curriculum` 區域列狀態標籤、規劃中島的課號、群島總覽頁的課號、側欄島卡的難度標籤。

實測（瀏覽器計算實際算繪色，含疊色）：`/curriculum` 31 個標籤最低亮色 5.02、深色 4.66；`/regions/sys` 全頁文字最低亮色 4.86、深色 4.70。

## 9. 與 main 的整合（2026-11-12）

R5 之後 `main` 已含 PR #1（`archipelago/v2`）、PR #2（`trials/mvp`）、PR #3（另一個 session 的 R6：群島總覽頁 `/regions/[region]`）。本分支以 **merge**（`7d79146`，未 rebase、未 squash）帶入 `main@6d62e33`：

| 項目 | 處理 |
|---|---|
| 衝突 `region-overview.tsx` | 沿用 R6 的 `export const REGION_ACCENT`，加入 `sys` |
| 衝突 `e2e/navigation.spec.ts` | 爬站涵蓋五個群島總覽與 `/learn/linux-terminal`；終端機與 AI 入口兩個測試都保留 |
| 新路由 `/regions/sys` | R6 由 `REGION_IDS` 產生頁面，加入 sys 後自動出現；路由契約兩種建置各 +1 行（`sys`），已刻意更新 snapshot |
| R6 測試中的四區域釘值 | 首頁「更多學習群島」4 個連結、區域合計含 sys（6 島、89 課）、側欄總覽連結 5 個 |
| 麵包屑「四大群島」 | 改用 `regionCountZh()` |

`/regions/sys`：6 座島、89 堂規劃中、沒有任何 `/curriculum/` 課程連結、無水平捲動。

PR #4（`r7/design-web`，另一個 session）在本分支開 PR 後合併進 `main@aaf1d0a`（之後 PR #5 R7 發布紀錄為 `main@1f93cc8`），本分支再以 merge 帶入：`tool-lab-page.tsx` 保留 Flexbox 與 Linux 終端機兩個實驗；學習路線依序為 A–F、G、H（R7）、J、K、L、M（P6），共 12 條；工具實驗開放 3 個（色彩對比、Flexbox、Linux 終端機）；`planning-data.json` 由 `scripts/planning-data.mjs` 重新產生，與合併結果一致。對 `main` 的路由契約差異只有 `/learn/linux-terminal` 與 `/regions/sys`（兩種建置各一）。
