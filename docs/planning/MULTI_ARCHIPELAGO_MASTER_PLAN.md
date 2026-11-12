# Logic Island 多群島擴充總規劃（Phase F Master Plan）

> 2026-11-02，Phase F.0「Planning & Architecture Design Only」。本目錄只有規劃文件與規劃資料；**沒有修改產品程式碼、3D 模型、教材、測試或部署設定**。
> 除了標為 Complete 的 60 堂課與現有 4 座島，其餘一切都是 **Planned**。

## 文件地圖

| 文件 | 內容 |
|---|---|
| [ISLAND_TAXONOMY](ISLAND_TAXONOMY.md) | 15 座學科島＋1 座實驗島、區域、ID 規則、島嶼邊界（**數量的唯一來源**） |
| [CURRICULUM_320_BLUEPRINT](CURRICULUM_320_BLUEPRINT.md) | 260 堂新課的藍圖（由 [`data/curriculum-blueprint.json`](data/curriculum-blueprint.json) 產生）與驗證結果 |
| [LEARNING_PATHS](LEARNING_PATHS.md) | 6 條跨島學習路線（[`data/learning-paths.json`](data/learning-paths.json)）、先修類型、課程缺口 |
| [INTERACTIVE_ACTIVITY_ARCHITECTURE](INTERACTIVE_ACTIVITY_ARCHITECTURE.md) | 活動等級 T0–T4、各島活動評估、Activity 合約、沙箱、安全成本效能 |
| [WORLD_EXPANSION_ARCHITECTURE](WORLD_EXPANSION_ARCHITECTURE.md) | 3D 方案 A–D 比較、推薦方案、遷移步驟 M0–M5、航行指南 |
| [ISLAND_CONFIG_DESIGN](ISLAND_CONFIG_DESIGN.md) | 資料驅動島嶼設定：JSON Schema、TS 型別、Registry、驗證、相容與遷移 |
| [M3_CS_AI_MASTER_PLAN](M3_CS_AI_MASTER_PLAN.md) | M3.0（2026-11-03）：CS 與 AI 課綱對照、Single／Regional World、兩區 Hex Layout 草案、M3.1–M3.6 Roadmap、待批准決策 |
| [M3_1_REGIONAL_WORLD_ARCHITECTURE](M3_1_REGIONAL_WORLD_ARCHITECTURE.md) | M3.1 提案（2026-11-03）：區域架構、座標驗證結果、導覽流程、Feature Flag、鏡頭、GLB Scale／Anchor Contract、量測方案、M3.2 進入條件 |
| [ARCHIPELAGO_GLB_ART_DIRECTION](ARCHIPELAGO_GLB_ART_DIRECTION.md) | M3.0：CS／AI 各島的 GLB 美術方向、共用 GLB 管線、節點與材質契約、預算 |
| [MULTI_ARCHIPELAGO_IA_V2](MULTI_ARCHIPELAGO_IA_V2.md) | 2026-11-12（D1–D3 已決策，方向原則批准）：四區域（新增 `design`、`web`）、AI 七島保留並以 3 組導覽分組、Design／Web 111 堂大綱、AI 最小曝光方案、活動 registry 評估、驗證改為資料＋規格、P1a／P1b 實作清單（**P1 未批准**） |
| [PHASE_F_ROADMAP](PHASE_F_ROADMAP.md) | E.5、F.0–F.6 分期、依賴、驗收、工作量、風險；與舊 ROADMAP 編號的對應 |

## 1. Repository Audit（2026-11-02）

| 項目 | 實況 |
|---|---|
| 分支／HEAD | `phase-d/basics-glb` @ `763ae18`；比 `origin` 的 `c316fe0`（E.4 收尾）多 15 個本地 commit（首頁 3D、導覽整併 E.5 第一項等），**未 push** |
| 工作樹 | 有大量**未提交**變更（互動實驗島改名、語言順序、Lab 與 60 堂 JavaScript、半透明面板、語法高亮），等待使用者決定提交方式；本次規劃提交**不包含**它們 |
| 課綱 | `src/content/curriculum/`：schema、驗證、`lessons.ts`（60 堂大綱）、`content/F01…A20.ts`（60 堂完整教材，四語）；路由 `/curriculum`、`/curriculum/[slug]` |
| 視覺化 | 20 種（全部 Implemented，`registry.ts`），模擬器 `simulate.ts`、`simulate-algorithms.ts` |
| 實驗島 | `/learn`（六個 Lab，四語）；`/visualize` 永久轉址到 `/learn` |
| 3D | 首頁 4 座島（3 學科＋實驗島），六角群島引擎；只有基礎程式島用正式 GLB；`/islands`（正式原型，受保護）、`/islands/candidate` |
| 進度 | 只在瀏覽器 localStorage（`progress.ts`，版本化）；沒有後端、帳號、線上評測 |
| 架構限制 | `LessonId` 只接受 F／D／A 單字母前綴；每島固定 20 堂；`assembleLayout` 寫死三座學科島 → F.0 需處理 |

### 狀態分帳

- **已實作**：60 堂完整教材（四語）、20 種視覺化、六個 Lab、課程進度（本機）、首頁 4 島 3D、語法高亮、導覽（探索群島／完整課綱／互動實驗島）。
- **已規劃未實作**：舊 ROADMAP 的 Data-Driven Islands、RPG、APCS 挑戰、AI 群島（六島草案）、AI 實驗室與運算服務、AI 專題；本規劃取代其中的島嶼與分期，見 PHASE_F_ROADMAP §0。
- **需要新增的能力**：island registry、完整前綴的 Lesson ID、每島課數、Activity 合約與新活動元件、區域地圖與世界總覽、學習路線資料、RPG 規則引擎、（選擇性）T2 沙箱。
- **技術債與已知問題**：P1-11（player 3 項 E2E）、P1-32（Auto Orbit 測試逾時）、P1-33（大型圖排版）、P1-34（Workshop 指向 `/learn` 的語意）、真機效能未量測、CI 未涵蓋四語驗證（需 JDK 與 Node）。

## 2. 產品願景

**An Interactive Computer Science & Artificial Intelligence Learning Archipelago.**

不是課程列表，而是一個可以探索的群島：每座島是一個學科，有明確定位、完整課程路徑、對應的互動實驗、先修關係、學習成果與進度；島與島之間有航線（跨島學習路線），中央有實驗島與挑戰島。核心體驗依序是：3D 探索 → 結構化課程 → 互動視覺化 → 程式練習 → 知識測驗 → 學習進度 → 跨學科路線 → （未來）RPG 式成就。

## 3. 規模（以 ISLAND_TAXONOMY 為準）

| | 島 | 課 | Complete | Planned |
|---|---:|---:|---:|---:|
| Region A — Computer Science | 8 | 160 | 60 | 100 |
| Region B — Artificial Intelligence | 7 | 160 | 0 | 160 |
| **合計** | **15**（＋1 實驗島） | **320** | **60** | **260** |

> **2026-11-12 更新**：上表是 2026-11-02 的快照（當時 60 堂完成；資料庫應用島完成後為 80 堂）。依 [MULTI_ARCHIPELAGO_IA_V2](MULTI_ARCHIPELAGO_IA_V2.md#26-重新計算的數量) 的 D2／D3 決策，規劃規模改為 **4 區域、23 座學科島（＋1 實驗島）、431 堂（80 complete、351 planned）**：新增 `design` 4 島 56 堂、`web` 4 島 55 堂，CS 與 AI 不變。程式中的 `EXPECTED` 常數將在 P1 改為以資料＋規格驗證，數字以藍圖資料與 ISLAND_TAXONOMY 為準（P1b 更新）。

## 4. 關鍵決策摘要

1. **實驗島是共用工具島，不是學科**：不編號、放在航行指南最前面、不計課數。
2. **既有 60 堂的 Lesson ID、slug、路由、進度 key 全部不變**；新島使用多字母前綴，程式一律以完整前綴解析。
3. **AI 區域七島**有明確邊界；LLM 分「模型原理」與「應用開發」兩軌；Agent 系統獨立為 AG。
4. **AI 應用工程路線不強制 ML／DL**：驗證器檢查 AG、LLM 應用軌、非 MLOps 的 OPS 課程的必修先修鏈中沒有 ML／DL。
5. **3D 採 Hybrid Navigation**（樞紐島＋區域地圖＋清單／搜尋），不把 16 座島塞進同一張地圖；每一步都可以停在原地上線。
6. **互動以前端確定性模擬為主**（T0／T1），昂貴模型輸出預先計算（T3），不在 Phase F 做後端（T4）。
7. **學科不硬鎖**：先修分必修與建議；RPG 的解鎖只用於獎勵與挑戰島。

## 5. RPG 學習機制

（規劃，F.6；不實作）

| 機制 | 設計 | 防止刷題的規則 |
|---|---|---|
| NPC Guides | 每區一位導覽 NPC，依進度推薦下一堂與路線 | 只推薦，不阻擋 |
| Quiz EXP | 測驗得分換 EXP | 每堂課的 EXP 只在**第一次全對**時給；重做只更新最佳成績 |
| Island Badges | 完成一座島（或島上的核心單元）得徽章 | 以「完成課程」判定，不以 EXP 總量判定 |
| Course Completion Rewards | 課程完成時顯示成果與下一步 | 不額外給可交易的點數 |
| Unlockable Islands | **只用於挑戰島與隱藏內容**；學科島永遠可進入 | 解鎖條件寫成宣告式 `Condition`，可在課綱頁看到 |
| Central Challenge Island | 樞紐的挑戰島：APCS Trial、AI Engineering Capstone、跨島任務 | 條件是「完成相關課程」，不是 EXP |
| APCS Trial | 以 F／DS／AL 為範圍的模擬試題組（沿用既有練習格式） | 練習與正式挑戰分開，挑戰有冷卻但練習沒有 |
| AI Engineering Capstone | 跨 LLM／AG／OPS 的專題（設計文件＋模擬部署） | 以評分規準完成，不以時間或次數 |
| Cross-Island Achievements | 完成某條學習路線、跨區域里程碑 | 只做紀錄與展示 |

原則：RPG 服務學習——獎勵完成與理解，不獎勵重複次數；任何學科內容都不因 RPG 被鎖住；進度只在進度層（`progress.ts` 的後續版本），不寫進靜態設定。

## 6. 課程缺口與風險（摘要）

- 缺口：數學（線性代數、微積分、機率統計）、離散數學、作業系統、雲端平台、軟體工程實務；舊 AI 草案的資料探勘／視覺化、傳統電腦視覺、AIoT。詳見 [LEARNING_PATHS](LEARNING_PATHS.md#4-課程缺口)。
- 風險：教材量（260 堂需分批、單一寫入者）、AI 領域變化快（需版本與更新日期）、新互動元件的工作量、真機效能、CI 的 Python 科學套件與 JDK 環境、SQL 沙箱需新增依賴。詳見 [PHASE_F_ROADMAP](PHASE_F_ROADMAP.md)。

## 7. 驗證

見 [CURRICULUM_320_BLUEPRINT#驗證](CURRICULUM_320_BLUEPRINT.md#驗證)：哪些檢查由資料檔機器驗證、哪些只能人工審核。
