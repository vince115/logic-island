# 島嶼分類（Island Taxonomy）

> Phase F.0 規劃文件（2026-11-02）。**只是規劃**：除了「現況」欄標為 Complete 的三座島與互動實驗島，其餘島嶼都尚未實作。
> 總覽見 [MULTI_ARCHIPELAGO_MASTER_PLAN](MULTI_ARCHIPELAGO_MASTER_PLAN.md)；每堂課的藍圖見 [CURRICULUM_320_BLUEPRINT](CURRICULUM_320_BLUEPRINT.md)。

## 1. 數量（唯一來源）

| 項目 | 數量 |
|---|---:|
| 正式學科島 | **15**（Region A 8 座、Region B 7 座） |
| 共用工具島 | **1**（互動實驗島，不是學科、不計課數） |
| 總課數 | **320**（Region A 160、Region B 160） |
| 已完成（Complete） | **60**（F、D、A 三島各 20 堂，2026-11-01 完成） |
| 規劃中（Planned） | **260** |

其他規劃文件中的數字都以本表為準；[validate](CURRICULUM_320_BLUEPRINT.md#驗證) 以資料檔機器檢查這些數字。

## 2. Region A — Computer Science Archipelago（`cs`，160 堂）

| # | 顯示代碼 | `islandId` | 島嶼 | 課數 | Lesson ID | 現況 |
|---:|---|---|---|---:|---|---|
| 01 | F | `foundations` | 基礎程式島 Programming Fundamentals | 20 | F01–F20 | **Complete** |
| 02 | DS | `structures` | 資料結構島 Data Structures | 20 | **D01–D20** | **Complete** |
| 03 | AL | `algorithms` | 演算法島 Algorithms | 20 | **A01–A20** | **Complete** |
| 04 | PL | `programming-languages` | 程式語言島 Programming Languages | 20 | PL01–PL20 | Planned |
| 05 | DB | `databases` | 資料庫應用島 Database Applications | 20 | DB01–DB20 | Planned |
| 06 | CN | `networks` | 計算機網路島 Computer Networks | 20 | CN01–CN20 | Planned |
| 07 | SA | `systems-analysis` | 系統分析與設計島 Systems Analysis & Design | 20 | SA01–SA20 | Planned |
| 08 | MIS | `information-systems` | 管理資訊系統島 Management Information Systems | 20 | MIS01–MIS20 | Planned |

注意：資料結構島與演算法島的**既有** Lesson ID 是單一字母 `D`／`A`（D01、A01），顯示代碼 DS／AL 只用在文件與介面，**不改既有 ID 或 slug**。

## 3. Region B — Artificial Intelligence Archipelago（`ai`，160 堂）

| # | 顯示代碼 | `islandId` | 島嶼 | 課數 | Lesson ID | 現況 |
|---:|---|---|---|---:|---|---|
| 01 | AIF | `ai-foundations` | AI 基礎島 AI Foundations | 20 | AIF01–AIF20 | Planned |
| 02 | ML | `machine-learning` | 機器學習島 Machine Learning | 25 | ML01–ML25 | Planned |
| 03 | DL | `deep-learning` | 深度學習島 Deep Learning | 25 | DL01–DL25 | Planned |
| 04 | LLM | `large-language-models` | 大型語言模型島 Large Language Models | 25 | LLM01–LLM25 | Planned |
| 05 | GEN | `generative-ai` | 生成式 AI 島 Generative AI | 20 | GEN01–GEN20 | Planned |
| 06 | AG | `ai-agents` | AI 代理島 AI Agents | 25 | AG01–AG25 | Planned |
| 07 | OPS | `ai-engineering` | AI 工程與 MLOps 島 AI Engineering & MLOps | 20 | OPS01–OPS20 | Planned |

## 4. 共用工具島：互動實驗島（Interactive Lab Island）

- `islandId: labs`，路由 `/learn`，目前六個 Lab（Array、Stack、Queue、Binary Search、Bubble Sort、BFS），四種語言。
- **是跨學科共用的工具島，不是第四個學科**：不計入 15 座學科島、沒有 Lesson ID、不參與課程編號與先修。
- 航行指南（規劃，見 [WORLD_EXPANSION_ARCHITECTURE](WORLD_EXPANSION_ARCHITECTURE.md#6-航行指南)）應把它放在學科清單之前、不給 01–15 的學科編號；目前首頁實作仍顯示「04 互動實驗島」，屬待調整項目（Phase E.5）。
- 未來各學科的新互動（SQL Playground、Token Explorer…）以「活動」形式嵌在課程頁中；是否也在實驗島提供獨立入口，依 [INTERACTIVE_ACTIVITY_ARCHITECTURE](INTERACTIVE_ACTIVITY_ARCHITECTURE.md#8-實驗島的角色) 決定。

## 5. 識別碼規則

| 種類 | 規則 | 例 |
|---|---|---|
| `islandId` | 小寫 kebab-case，穩定不改名（沿用 2026-10-29 決議） | `databases`、`ai-agents` |
| 顯示代碼 | 文件與介面用的縮寫，不出現在程式識別碼 | DB、AG |
| Lesson ID | 島嶼前綴＋兩位數；既有三島沿用 `F`／`D`／`A` | DB01、AIF20、ML25 |
| Lesson slug | 小寫 kebab-case，**全站 320 堂唯一**（路由 `/curriculum/[slug]` 是單一命名空間） | `sql-select-queries` |
| `regionId` | `cs`、`ai` | — |

### 前綴碰撞風險（實作時必須處理）

字串層面沒有碰撞（D01 ≠ DB01），但現有程式以**第一個字母**判斷島嶼：

- `src/content/curriculum/schema.ts` 的 `LessonId` 型別是 `` `${'F' | 'D' | 'A'}${string}` ``，`DB01`、`DL01` 會被視為 `D…`，`AIF01`、`AG01` 會被視為 `A…`。
- `validateCurriculum` 以 `startsWith(ISLAND_PREFIX[island])` 檢查歸屬，`DB01` 會被誤認為資料結構島的課。

規定：Lesson ID 一律以**完整前綴**解析，`^(F|D|A|PL|DB|CN|SA|MIS|AIF|ML|DL|LLM|GEN|AG|OPS)(\d{2})$`（regex 會回溯，`DB01` 解析為 `DB`＋`01`）；型別改為列舉前綴的聯集。這是 F.0 實作項目，見 [ISLAND_CONFIG_DESIGN](ISLAND_CONFIG_DESIGN.md#6-lesson-id-與前綴)。

## 6. 島嶼定位與邊界

每座島「教什麼、不教什麼」，避免重複。依賴順序（先修只能指向更前面的島）：
F → DS → AL → PL → DB → CN → SA → MIS → AIF → ML → DL → LLM → GEN → AG → OPS。這是**資料上的拓撲順序**，不是強制學習順序；學習者實際可走的路線見 [LEARNING_PATHS](LEARNING_PATHS.md)。

| 島 | 定位 | 不重複的部分 |
|---|---|---|
| F | 程式入門：變數、條件、迴圈、陣列、函式、遞迴、除錯，四語對照 | — |
| DS | 線性結構、雜湊、樹、堆積、圖與並查集 | — |
| AL | 分析、搜尋、排序、技巧、遞迴分治、圖演算法、DP、APCS | — |
| PL | 程式語言原理：典範、型別系統、記憶體模型、作用域與閉包、語法分析／AST、直譯與編譯、IR／JIT、Runtime 與 GC、並行模型、語言設計 | 不重教 F 的基礎語法；用四語實例比較 |
| DB | 資料庫應用：關聯模型、SQL、ER、正規化、索引與查詢計畫、交易與隔離、NoSQL、應用整合與安全 | 不做資料庫引擎研究；索引引用 D14 |
| CN | 網路：分層、定址與子網、路由、TCP／UDP、DNS、HTTP／TLS、REST API、Socket、網路安全 | API 設計的軟體面交給 SA |
| SA | 系統分析與設計：SDLC、需求、流程與資料建模、UML、架構風格、UI／UX、設計模式、測試、專案管理 | 不重教 PL 原理與 DB 正規化（引用） |
| MIS | 管理資訊系統：組織與策略、流程、ERP／CRM／SCM、電子商務、BI、決策支援、IT 治理、風險、倫理與法規、數位轉型 | 技術細節留給 DB／SA／CN |
| AIF | AI 基礎：代理人、問題形式化、啟發式與對抗搜尋、CSP、知識表示、邏輯推論、機率與貝氏網路、不確定性決策、負責任 AI | 建立在 A14–A16 之上，不重教 BFS／DFS／Dijkstra |
| ML | 機器學習：工作流程、資料處理、迴歸、分類、樹與集成、SVM、分群、降維、特徵工程、評估、交叉驗證、調參 | 神經網路交給 DL |
| DL | 深度學習：神經網路、梯度下降、反向傳播、PyTorch、最佳化與正則化、CNN、RNN、注意力、Transformer、訓練管線 | LLM 的預訓練與應用交給 LLM |
| LLM | 兩條軌：**模型原理**（tokenization、embedding、預訓練、指令微調、對齊、微調、推論最佳化、評估）與**應用開發**（API、提示工程、結構化輸出、RAG、向量檢索、評估） | **Agent 系統交給 AG**；Transformer 細節引用 DL |
| GEN | 生成式 AI：生成模型家族、潛在空間、擴散、文生圖、影像編修、影片、語音、音樂、多模態、創作流程、生成評估與倫理 | 文字生成的模型原理在 LLM |
| AG | AI 代理：架構、工具呼叫、規劃、記憶、Agent 迴圈、MCP、工作流程編排、多 Agent、人機協作、評估、可靠性、安全 | 不重教 RAG（引用 LLM14／LLM15） |
| OPS | AI 工程與 MLOps：AI API 與服務、容器、部署、GPU 推論、Registry、管線、CI／CD、監控與可觀測性、成本、資安、事故處理 | 只在 MLOps 專題課要求 ML／DL |

## 7. 與舊規劃的對應

[ROADMAP](../handoff/ROADMAP.md) 的 Phase H（2026-10-29）曾規劃六座 AI 島（AI-01 ML、AI-02 DL、AI-03 GenAI／LLM／Agent、AI-04 Data Science、AI-05 Computer Vision、AI-06 AIoT／Edge）。本規劃以**七座**取代，對應如下；舊草案中沒有獨立島嶼的主題列為 [課程缺口](LEARNING_PATHS.md#4-課程缺口)：

| 舊 | 新 |
|---|---|
| AI-01 Machine Learning | ML |
| AI-02 Deep Learning | DL |
| AI-03 GenAI／LLM／Agentic AI | 拆成 LLM、GEN、AG |
| AI-04 Data Science／Analysis／Mining／Visualization | 部分併入 ML（資料處理、EDA）與 MIS（BI）；資料探勘與視覺化沒有獨立島 → 缺口 |
| AI-05 Computer Vision／OpenCV／AOI | 部分在 DL（CNN）與 GEN（影像生成、多模態）；傳統影像處理與 AOI → 缺口 |
| AI-06 AIoT／Edge AI | 部分在 OPS（部署、量化、延遲）；感測器與邊緣硬體 → 缺口 |
| （新增） | AIF、OPS |

> **2026-11-03 M3.0 對照**：使用者提出的 CS 代碼 SPM（Software Project Management）沒有獨立島，對應 SA02、SA17–SA19 與 MIS17（SA 島內單元）；AI 候選主題 NLP 對應 LLM01–LLM08 與 DL15–DL18、DL20，Computer Vision 對應 DL13–DL14、DL19 與 GEN08、GEN11–GEN12、GEN16，兩者都沒有獨立島。**數量不變**（15 座學科島、320 堂）。傳統 NLP、物件偵測與影像分割、SPM 獨立島都是 Proposed Extension（需批准）。見 [M3_CS_AI_MASTER_PLAN](M3_CS_AI_MASTER_PLAN.md) §2–§4。
