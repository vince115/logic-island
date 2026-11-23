# 自主課程生產進度與佇列（Autonomous Curriculum Production）

> 由 `scripts/curriculum-queue.ts` 依目錄（catalog）、藍圖先修與課綱內容（發布閘門）計算產生，請勿手改；唯一宣告的輸入是各島需要的課程能力與其狀態（`docs/curriculum/data/island-capabilities.json`）。批次紀錄見 [COURSE_PRODUCTION_PROGRESS](../curriculum/COURSE_PRODUCTION_PROGRESS.md)。

## 恢復工作

新的 Session 從這裡接續：

1. `git fetch origin`，確認 `origin/main`、`git worktree list` 與未合併的課程 PR；不碰其他 Session 的 worktree。
2. 重新產生本檔（上方指令），讀「下一批」與「能力缺口」。
3. 依 [COURSE_CONTENT_SPECIFICATION](../curriculum/COURSE_CONTENT_SPECIFICATION.md) 的流程製作、驗證、發布，並更新 `docs/curriculum/data/course-production.json`、本檔與課程進度報告。
4. 只有在需要產品負責人決策（破壞性操作、敏感資料、不可逆的產品架構）或沒有其他可安全進行的工作時才停止。

## 總覽

已發布 **231／520**（44.4%）；規劃中 289。

| 區域 | 已發布 | 規劃中 | 覆蓋率 |
|---|---|---|---|
| 程式與資訊群島 | 120 | 40 | 75.0% |
| AI 人工智慧群島 | 25 | 135 | 15.6% |
| 數位設計群島 | 0 | 56 | 0.0% |
| 網頁與應用開發群島 | 40 | 15 | 72.7% |
| 系統與雲端工程群島 | 46 | 43 | 51.7% |

## 下一批（自動選擇）

**DevOps 與 CI/CD 島（CICD）**：CICD03 持續整合、CICD04 GitHub Actions 入門、CICD05 管線中的自動化測試、CICD06 建置管線與產出物、CICD07 環境變數與設定管理。島嶼能力：已備妥（可開始撰寫）；這幾堂解鎖其他島的 7 堂。

能力缺口中最優先的是 **機器學習島（ML）**：需要 python-code + data-explorer (fixed datasets, metrics computed in the browser)；先修已滿足、可依序撰寫的有 25 堂，前 5 堂解鎖其他島的 39 堂。

選擇規則：島嶼的課程能力已可用或已備妥 → 先修已滿足（編號即位置，只能從下一個未發布的編號連續往後）→ 解鎖其他島的課程較多 → 區域與島嶼順序。

## 島嶼狀態

| 區域 | 島嶼 | 已發布 | 課程能力 | 能力狀態 | 下一段可依序撰寫 | 阻礙 |
|---|---|---|---|---|---|---|
| 程式與資訊群島 | 基礎程式島（F） | 20／20 | program-code | 可用 | 全島完成 | — |
| 程式與資訊群島 | 資料結構島（DS） | 20／20 | program-code | 可用 | 全島完成 | — |
| 程式與資訊群島 | 演算法島（AL） | 20／20 | program-code | 可用 | 全島完成 | — |
| 程式與資訊群島 | 程式語言島（PL） | 20／20 | program-code | 可用 | 全島完成 | — |
| 程式與資訊群島 | 資料庫應用島（DB） | 20／20 | sql, er-diagram, normalization, query-plan, transaction-timeline, driver-code, protocol-sequence, architecture-diagram | 可用 | 全島完成 | — |
| 程式與資訊群島 | 計算機網路島（CN） | 20／20 | network-protocol (packets through the layers, message sequences, node tables; field, layer, table, subnet and delay exercises) | 可用 | 全島完成 | — |
| 程式與資訊群島 | 系統分析與設計島（SA） | 0／20 | model-diagram (UML, DFD, BPMN, state and sequence models, checked by structure) | 缺少 | SA01–SA20（20 堂） | 缺少課程能力 |
| 程式與資訊群島 | 管理資訊系統島（MIS） | 0／20 | case-analysis (scenario data, decision tables, KPI calculations checked by value) | 缺少 | MIS01–MIS20（20 堂） | 缺少課程能力 |
| AI 人工智慧群島 | AI 基礎島（AIF） | 20／20 | python-code (Python-only program lessons; search, games, logic and probability on the shared traces) | 可用 | 全島完成 | — |
| AI 人工智慧群島 | 機器學習島（ML） | 0／25 | python-code + data-explorer (fixed datasets, metrics computed in the browser) | 缺少 | ML01–ML25（25 堂） | 缺少課程能力 |
| AI 人工智慧群島 | 深度學習島（DL） | 0／25 | python-code + precomputed training curves (T3) | 缺少 | — | 缺少課程能力；DL01 需要尚未發布的 ML09 |
| AI 人工智慧群島 | 大型語言模型島（LLM） | 3／25 | llm-explorer (token-explorer: byte-level BPE from the lesson's merge table; sampling-explorer: a recorded toy model with temperature, top-k, top-p and a seeded generator; embedding-space: hand-written vectors, cosine similarity and a deterministic PCA; exercises checked by value), alone or with python-code | 已備妥（可開始撰寫） | — | LLM04 需要尚未發布的 DL18 |
| AI 人工智慧群島 | 生成式 AI 島（GEN） | 2／20 | llm-explorer for GEN01, GEN02 (sampling-explorer) and GEN08 (embedding-space); precomputed pipeline steps (T3) for the rest | 已備妥（可開始撰寫） | — | GEN03 需要尚未發布的 DL01 |
| AI 人工智慧群島 | AI 代理島（AG） | 0／25 | agent trace (tool calls and memory as fixed transcripts) | 缺少 | — | 缺少課程能力；AG01 需要尚未發布的 LLM10 |
| AI 人工智慧群島 | AI 工程與 MLOps 島（OPS） | 0／20 | pipeline and deployment simulation | 缺少 | — | 缺少課程能力；OPS01 需要尚未發布的 SA01 |
| 數位設計群島 | UI 設計島（UI） | 0／15 | design-lab (color contrast exists as a standalone lab; visual hierarchy and grid) | 缺少 | UI01–UI15（15 堂） | 缺少課程能力 |
| 數位設計群島 | UX 研究島（UX） | 0／15 | case-analysis + model-diagram | 缺少 | UX01–UX15（15 堂） | 缺少課程能力 |
| 數位設計群島 | 互動設計島（IXD） | 0／14 | case-analysis + a11y checks | 缺少 | IXD01–IXD14（14 堂） | 缺少課程能力 |
| 數位設計群島 | 設計系統島（DSY） | 0／12 | design-token board | 缺少 | DSY01–DSY12（12 堂） | 缺少課程能力 |
| 網頁與應用開發群島 | 網頁基礎島（WEB） | 15／15 | web-code (HTML, CSS and JavaScript pages in a sandboxed frame beside the DOM the browser built; exercises checked by steps on that page, verified in Chromium) | 可用 | 全島完成 | — |
| 網頁與應用開發群島 | 前端開發島（FE） | 0／15 | web-code + state-flow trace | 缺少 | FE01–FE15（15 堂） | 缺少課程能力 |
| 網頁與應用開發群島 | 響應式設計島（RWD） | 12／12 | web-code with preview widths and the resize step (one answer checked at several viewport widths); the standalone labs stay as further practice | 可用 | 全島完成 | — |
| 網頁與應用開發群島 | 行動應用島（MOB） | 13／13 | web-code at phone sizes: pointer steps with modelled capture, touch targets measured with at least and at most, dialogs; analysis lessons are cases a learner repairs on a page | 可用 | 全島完成 | — |
| 系統與雲端工程群島 | Linux 系統島（LNX） | 15／15 | terminal (machines as data, transcripts replayed to their exact output, exercises checked by replaying the learner's commands in the simulated shell) | 可用 | 全島完成 | — |
| 系統與雲端工程群島 | Docker 容器島（DKR） | 15／15 | terminal (engine stage E20 containers: images, the container lifecycle, a simulated Docker Hub, published ports, the docker group; then E21-E24) + network-protocol scenes; container-playground and case-study-board map to terminal-sim, architecture-diagram and pipeline-diagram to network-sequence | 已備妥（可開始撰寫） | 全島完成 | — |
| 系統與雲端工程群島 | 網路與伺服器島（SRV） | 14／14 | terminal (engine stages E10 sockets, E11 dns, E12 http, then E13-E19) + network-protocol scenes; request-path and architecture-diagram map to network-sequence | 可用 | 全島完成 | — |
| 系統與雲端工程群島 | 雲端基礎設施島（CLD） | 0／15 | architecture simulation | 缺少 | CLD01–CLD15（15 堂） | 缺少課程能力 |
| 系統與雲端工程群島 | DevOps 與 CI/CD 島（CICD） | 2／15 | devops-explorer (D1 deployment histories and DORA metrics, D2 the deployment-simulator: rollouts, gates, migrations, feature flags; then D3 dashboards, D4 logs) + terminal (engine stages E25 git, E26 forge, E27 workflows, E28 actions, E29 artifacts, E30 environments, E31 deploy-hosts); a per-lesson mapping (CICD_SHAPES) | 已備妥（可開始撰寫） | CICD03–CICD15（13 堂） | — |
| 系統與雲端工程群島 | Kubernetes 與可靠性工程島（KUB） | 0／15 | cluster simulation | 缺少 | KUB01–KUB05（5 堂） | 缺少課程能力；KUB06 需要尚未發布的 CICD08 |

## 能力缺口

依「先修已滿足、可依序撰寫的課程數」與「解鎖其他島的課程數」排序；建立能力時只做最小可用、可被多堂課重用的版本。

| 島嶼 | 需要的能力 | 可依序撰寫 | 解鎖其他島 | 備註 |
|---|---|---|---|---|
| 機器學習島（ML） | python-code + data-explorer (fixed datasets, metrics computed in the browser) | 25 | 39 | — |
| 系統分析與設計島（SA） | model-diagram (UML, DFD, BPMN, state and sequence models, checked by structure) | 20 | 20 | — |
| 管理資訊系統島（MIS） | case-analysis (scenario data, decision tables, KPI calculations checked by value) | 20 | 0 | — |
| UI 設計島（UI） | design-lab (color contrast exists as a standalone lab; visual hierarchy and grid) | 15 | 0 | — |
| UX 研究島（UX） | case-analysis + model-diagram | 15 | 0 | — |
| 互動設計島（IXD） | case-analysis + a11y checks | 14 | 0 | — |
| 設計系統島（DSY） | design-token board | 12 | 0 | — |
| 前端開發島（FE） | web-code + state-flow trace | 15 | 0 | — |
| 雲端基礎設施島（CLD） | architecture simulation | 15 | 0 | — |
| Kubernetes 與可靠性工程島（KUB） | cluster simulation | 5 | 0 | — |

## 學習路線

| 路線 | 已發布 | 可完整學完 |
|---|---|---|
| APCS／資訊科學基礎 | 60／60 | 是 |
| 軟體工程 | 66／86 | 否 |
| 網路與系統 | 54／54 | 是 |
| 企業資訊系統 | 44／84 | 否 |
| AI 研究 | 62／142 | 否 |
| AI 應用工程 | 31／89 | 否 |
| 前端工程 | 47／62 | 否 |
| 產品設計 | 0／56 | 否 |
| AI 架構 | 23／66 | 否 |
| 全端部署 | 50／62 | 否 |
| AI 基礎設施 | 38／60 | 否 |
| 雲端與 DevOps 基礎 | 31／48 | 否 |

## 先修依賴檢查

- 520 堂課的先修都存在、沒有循環；同島的先修都排在前面，依編號發布即符合拓樸順序。

## 各課程

狀態：已發布（閘門通過）、已撰寫未通過閘門、大綱（能力與先修就緒）、待能力（島嶼缺少課程能力）、待先修（先修尚未發布）。

### 程式與資訊群島 · 基礎程式島（F）

| 課程 | 名稱 | 狀態 | 先修 | 藍圖活動 | 阻礙 |
|---|---|---|---|---|---|
| F01 | 程式與演算法入門 | 已發布（閘門通過） | — | variable-state | — |
| F02 | 變數與資料型別 | 已發布（閘門通過） | F01 | variable-state | — |
| F03 | 輸入與輸出 | 已發布（閘門通過） | F02 | variable-state | — |
| F04 | 運算子與運算順序 | 已發布（閘門通過） | F03 | variable-state | — |
| F05 | 條件判斷 | 已發布（閘門通過） | F04 | conditional-branch | — |
| F06 | 多重條件與邏輯運算 | 已發布（閘門通過） | F05 | conditional-branch | — |
| F07 | For 迴圈 | 已發布（閘門通過） | F05 | loop-execution | — |
| F08 | While 迴圈 | 已發布（閘門通過） | F07 | loop-execution | — |
| F09 | 巢狀迴圈 | 已發布（閘門通過） | F08 | loop-execution | — |
| F10 | 字串基礎 | 已發布（閘門通過） | F07 | array-index | — |
| F11 | 一維陣列 | 已發布（閘門通過） | F07 | array-index | — |
| F12 | 二維陣列 | 已發布（閘門通過） | F09、F11 | array-index | — |
| F13 | 函式基礎 | 已發布（閘門通過） | F07 | function-call | — |
| F14 | 參數與回傳值 | 已發布（閘門通過） | F13 | function-call | — |
| F15 | 變數作用域 | 已發布（閘門通過） | F14 | function-call | — |
| F16 | 字串與陣列操作 | 已發布（閘門通過） | F10、F11、F14 | array-index | — |
| F17 | 基本除錯技巧 | 已發布（閘門通過） | F09、F14 | variable-state | — |
| F18 | 遞迴入門 | 已發布（閘門通過） | F14 | recursion-trace | — |
| F19 | 時間與空間複雜度入門 | 已發布（閘門通過） | F09、F11 | complexity | — |
| F20 | 基礎程式島綜合挑戰 | 已發布（閘門通過） | F12、F16、F17、F18、F19 | challenge-stages | — |

### 程式與資訊群島 · 資料結構島（DS）

| 課程 | 名稱 | 狀態 | 先修 | 藍圖活動 | 阻礙 |
|---|---|---|---|---|---|
| D01 | 資料結構概論 | 已發布（閘門通過） | F11、F13、F19 | ds-comparison | — |
| D02 | Array 與 Dynamic Array | 已發布（閘門通過） | D01 | array-index | — |
| D03 | String Processing | 已發布（閘門通過） | D02、F16 | array-index | — |
| D04 | Linked List | 已發布（閘門通過） | D02 | linked-list | — |
| D05 | Stack | 已發布（閘門通過） | D02 | stack-queue | — |
| D06 | Queue | 已發布（閘門通過） | D02 | stack-queue | — |
| D07 | Deque | 已發布（閘門通過） | D05、D06 | stack-queue | — |
| D08 | Set | 已發布（閘門通過） | D01 | hash-table | — |
| D09 | Map / Dictionary | 已發布（閘門通過） | D08 | hash-table | — |
| D10 | Hash Table | 已發布（閘門通過） | D09 | hash-table | — |
| D11 | Tree 基礎 | 已發布（閘門通過） | D01、F18 | tree-traversal | — |
| D12 | Binary Tree | 已發布（閘門通過） | D11 | tree-traversal | — |
| D13 | Tree Traversal | 已發布（閘門通過） | D12、D05、D06 | tree-traversal | — |
| D14 | Binary Search Tree | 已發布（閘門通過） | D13 | tree-traversal | — |
| D15 | Heap / Priority Queue | 已發布（閘門通過） | D12 | heap | — |
| D16 | Graph 基礎 | 已發布（閘門通過） | D01 | graph-traversal | — |
| D17 | Adjacency List / Matrix | 已發布（閘門通過） | D16 | graph-traversal | — |
| D18 | Disjoint Set Union | 已發布（閘門通過） | D16 | disjoint-set | — |
| D19 | 資料結構選型與複雜度 | 已發布（閘門通過） | D07、D10、D14、D15、D17 | ds-comparison | — |
| D20 | 資料結構島綜合挑戰 | 已發布（閘門通過） | D18、D19 | challenge-stages | — |

### 程式與資訊群島 · 演算法島（AL）

| 課程 | 名稱 | 狀態 | 先修 | 藍圖活動 | 阻礙 |
|---|---|---|---|---|---|
| A01 | 演算法分析 | 已發布（閘門通過） | F19 | complexity | — |
| A02 | Simulation | 已發布（閘門通過） | A01、F12 | array-index | — |
| A03 | Linear Search | 已發布（閘門通過） | A01 | array-index | — |
| A04 | Binary Search | 已發布（閘門通過） | A03 | array-index | — |
| A05 | Bubble / Selection / Insertion Sort | 已發布（閘門通過） | A01 | sorting-steps | — |
| A06 | Merge Sort | 已發布（閘門通過） | A05、F18 | sorting-steps | — |
| A07 | Quick Sort | 已發布（閘門通過） | A06 | sorting-steps | — |
| A08 | Two Pointers | 已發布（閘門通過） | A05 | array-index | — |
| A09 | Sliding Window | 已發布（閘門通過） | A08 | array-index | — |
| A10 | Prefix Sum | 已發布（閘門通過） | A01 | array-index | — |
| A11 | Recursion 與分治 | 已發布（閘門通過） | F18、A06 | recursion-tree | — |
| A12 | Backtracking | 已發布（閘門通過） | A11 | recursion-tree | — |
| A13 | Greedy | 已發布（閘門通過） | A05 | greedy-choice | — |
| A14 | BFS | 已發布（閘門通過） | D06、D17 | graph-traversal | — |
| A15 | DFS | 已發布（閘門通過） | D05、D17、F18 | graph-traversal | — |
| A16 | Graph Shortest Path | 已發布（閘門通過） | A14、D15 | graph-traversal | — |
| A17 | Dynamic Programming 入門 | 已發布（閘門通過） | A11 | dp-table | — |
| A18 | Knapsack 基礎 | 已發布（閘門通過） | A17 | dp-table | — |
| A19 | APCS 題型分析與解題策略 | 已發布（閘門通過） | A02、A04、A10、A13、A15、A17 | challenge-stages | — |
| A20 | 演算法島綜合試煉 | 已發布（閘門通過） | A09、A12、A16、A18、A19 | challenge-stages | — |

### 程式與資訊群島 · 程式語言島（PL）

| 課程 | 名稱 | 狀態 | 先修 | 藍圖活動 | 阻礙 |
|---|---|---|---|---|---|
| PL01 | 程式設計典範 | 已發布（閘門通過） | F13 | variable-state | — |
| PL02 | 物件導向：封裝、繼承與介面 | 已發布（閘門通過） | PL01、F14 | function-call | — |
| PL03 | 函數式程式設計 | 已發布（閘門通過） | PL01、F18 | function-call | — |
| PL04 | 型別系統 | 已發布（閘門通過） | PL01、F02 | none | — |
| PL05 | 泛型與多型 | 已發布（閘門通過） | PL02、PL04 | none | — |
| PL06 | 名稱綁定、作用域鏈與閉包 | 已發布（閘門通過） | PL03、F15 | function-call | — |
| PL07 | 記憶體模型：堆疊與堆積 | 已發布（閘門通過） | PL04、F14 | function-call | — |
| PL08 | 記憶體管理與垃圾回收 | 已發布（閘門通過） | PL07 | graph-traversal | — |
| PL09 | 錯誤處理模型 | 已發布（閘門通過） | PL02、PL07 | function-call | — |
| PL10 | 詞法分析：從字元到 Token | 已發布（閘門通過） | PL01、D03 | variable-state | — |
| PL11 | 語法分析與抽象語法樹 | 已發布（閘門通過） | PL10、D13 | tree-traversal | — |
| PL12 | 直譯器：走訪 AST 求值 | 已發布（閘門通過） | PL11、PL06 | recursion-trace | — |
| PL13 | 並行模型 | 已發布（閘門通過） | PL07 | variable-state | — |
| PL14 | 執行緒與同步 | 已發布（閘門通過） | PL13 | stack-queue | — |
| PL15 | 非同步：Promise、async／await 與事件迴圈 | 已發布（閘門通過） | PL13、PL06 | stack-queue | — |
| PL16 | 編譯流程與中間表示 | 已發布（閘門通過） | PL12、PL04 | graph-traversal | — |
| PL17 | 虛擬機、位元組碼與 JIT | 已發布（閘門通過） | PL16、PL08 | stack-queue | — |
| PL18 | 超程式設計與反射 | 已發布（閘門通過） | PL11、PL05 | function-call | — |
| PL19 | 語言設計取捨 | 已發布（閘門通過） | PL05、PL08、PL13 | none | — |
| PL20 | 程式語言島綜合挑戰：打造迷你語言 | 已發布（閘門通過） | PL12、PL19 | challenge-stages | — |

### 程式與資訊群島 · 資料庫應用島（DB）

| 課程 | 名稱 | 狀態 | 先修 | 藍圖活動 | 阻礙 |
|---|---|---|---|---|---|
| DB01 | 資料庫與 DBMS 概念 | 已發布（閘門通過） | F11 | sql-playground | — |
| DB02 | 關聯式模型：表、鍵與關聯代數 | 已發布（閘門通過） | DB01 | sql-playground | — |
| DB03 | 用 SELECT 查詢資料 | 已發布（閘門通過） | DB02 | sql-playground | — |
| DB04 | 彙總函式與 GROUP BY | 已發布（閘門通過） | DB03 | sql-playground | — |
| DB05 | 多表查詢：JOIN | 已發布（閘門通過） | DB03 | sql-playground | — |
| DB06 | 子查詢、CTE 與視窗函式 | 已發布（閘門通過） | DB04、DB05 | sql-playground | — |
| DB07 | 建立與修改資料：DDL、DML 與約束 | 已發布（閘門通過） | DB03 | sql-playground | — |
| DB08 | ER 模型 | 已發布（閘門通過） | DB02 | erd-builder | — |
| DB09 | 從 ER 圖到資料表綱要 | 已發布（閘門通過） | DB08、DB07 | erd-builder | — |
| DB10 | 正規化 | 已發布（閘門通過） | DB09 | normalization-steps | — |
| DB11 | 索引與 B+ 樹 | 已發布（閘門通過） | DB03、D14 | query-plan | — |
| DB12 | 查詢計畫與效能調校 | 已發布（閘門通過） | DB11、DB05 | query-plan | — |
| DB13 | 檢視表、預存程序與觸發器 | 已發布（閘門通過） | DB07、DB06 | sql-playground | — |
| DB14 | 交易與 ACID | 已發布（閘門通過） | DB07 | transaction-timeline | — |
| DB15 | 隔離等級與並行控制 | 已發布（閘門通過） | DB14 | transaction-timeline | — |
| DB16 | 程式串接資料庫與 ORM | 已發布（閘門通過） | DB07、PL02 | protocol-sequence | — |
| DB17 | SQL Injection 與資料庫安全 | 已發布（閘門通過） | DB16 | sql-playground | — |
| DB18 | NoSQL 資料模型 | 已發布（閘門通過） | DB10 | ds-comparison | — |
| DB19 | 備份、複寫與擴展 | 已發布（閘門通過） | DB14 | architecture-diagram | — |
| DB20 | 資料庫應用島綜合挑戰：設計並實作資料庫系統 | 已發布（閘門通過） | DB10、DB12、DB17 | challenge-stages | — |

### 程式與資訊群島 · 計算機網路島（CN）

| 課程 | 名稱 | 狀態 | 先修 | 藍圖活動 | 阻礙 |
|---|---|---|---|---|---|
| CN01 | 網路分層模型 | 已發布（閘門通過） | F01 | packet-journey | — |
| CN02 | 實體層與網路效能：頻寬、延遲與吞吐量 | 已發布（閘門通過） | CN01 | packet-journey | — |
| CN03 | 資料鏈結層、Ethernet 與交換器 | 已發布（閘門通過） | CN01 | packet-journey | — |
| CN04 | Wi-Fi 與行動網路基礎 | 已發布（閘門通過） | CN03 | network-sequence | — |
| CN05 | IP 位址與子網路 | 已發布（閘門通過） | CN01 | packet-journey | — |
| CN06 | ARP、DHCP 與 NAT | 已發布（閘門通過） | CN05、CN03 | network-sequence | — |
| CN07 | 路由與轉送 | 已發布（閘門通過） | CN05 | packet-journey | — |
| CN08 | 路由協定：距離向量與鏈路狀態 | 已發布（閘門通過） | CN07、A16 | packet-journey | — |
| CN09 | TCP 與 UDP | 已發布（閘門通過） | CN05 | network-sequence | — |
| CN10 | TCP 可靠傳輸、流量控制與壅塞控制 | 已發布（閘門通過） | CN09 | network-sequence | — |
| CN11 | Socket 網路程式設計 | 已發布（閘門通過） | CN09 | stack-queue | — |
| CN12 | DNS 與 HTTP | 已發布（閘門通過） | CN09 | packet-journey | — |
| CN13 | HTTPS 與 TLS | 已發布（閘門通過） | CN12 | network-sequence | — |
| CN14 | REST API 與 JSON | 已發布（閘門通過） | CN12 | variable-state | — |
| CN15 | 快取、CDN 與 HTTP/2、HTTP/3 | 已發布（閘門通過） | CN12 | packet-journey | — |
| CN16 | WebSocket 與即時通訊 | 已發布（閘門通過） | CN11、CN12 | variable-state | — |
| CN17 | 網路除錯工具 | 已發布（閘門通過） | CN07、CN12 | packet-journey | — |
| CN18 | 網路安全基礎 | 已發布（閘門通過） | CN13 | packet-journey | — |
| CN19 | 防火牆、VPN 與零信任 | 已發布（閘門通過） | CN18、CN07 | packet-journey | — |
| CN20 | 計算機網路島綜合挑戰：追蹤並打造一個網路服務 | 已發布（閘門通過） | CN14、CN17、CN18 | challenge-stages | — |

### 程式與資訊群島 · 系統分析與設計島（SA）

| 課程 | 名稱 | 狀態 | 先修 | 藍圖活動 | 阻礙 |
|---|---|---|---|---|---|
| SA01 | 系統開發生命週期 | 待能力 | F13 | process-model | 課程能力 |
| SA02 | 開發方法論：瀑布、迭代與敏捷 | 待能力 | SA01 | decision-simulation | 課程能力、先修 SA01 |
| SA03 | 可行性分析與系統提案 | 待能力 | SA01 | decision-simulation | 課程能力、先修 SA01 |
| SA04 | 需求擷取 | 待能力 | SA01 | requirements-board | 課程能力、先修 SA01 |
| SA05 | 需求規格與使用者故事 | 待能力 | SA04 | requirements-board | 課程能力、先修 SA04 |
| SA06 | 使用案例建模 | 待能力 | SA05 | uml-designer | 課程能力、先修 SA05 |
| SA07 | 流程建模：DFD 與 BPMN | 待能力 | SA05 | process-model | 課程能力、先修 SA05 |
| SA08 | UML 類別圖 | 待能力 | SA05、PL01 | uml-designer | 課程能力、先修 SA05 |
| SA09 | UML 循序圖 | 待能力 | SA08 | uml-designer | 課程能力、先修 SA08 |
| SA10 | UML 活動圖與狀態圖 | 待能力 | SA06 | uml-designer | 課程能力、先修 SA06 |
| SA11 | 物件導向設計原則 | 待能力 | SA08 | uml-designer | 課程能力、先修 SA08 |
| SA12 | 軟體架構風格 | 待能力 | SA05、SA08 | architecture-diagram | 課程能力、先修 SA05、SA08 |
| SA13 | 設計模式概覽 | 待能力 | SA11 | uml-designer | 課程能力、先修 SA11 |
| SA14 | 使用者介面與體驗設計 | 待能力 | SA06 | case-study-board | 課程能力、先修 SA06 |
| SA15 | 設計文件與設計審查 | 待能力 | SA12 | architecture-diagram | 課程能力、先修 SA12 |
| SA16 | 測試策略 | 待能力 | SA05、F17 | conditional-branch | 課程能力、先修 SA05 |
| SA17 | 專案規劃、估算與風險管理 | 待能力 | SA02 | decision-simulation | 課程能力、先修 SA02 |
| SA18 | 系統建置、版本管理與上線轉換 | 待能力 | SA16、SA17 | deployment-simulator | 課程能力、先修 SA16、SA17 |
| SA19 | 軟體維護與演進 | 待能力 | SA18 | decision-simulation | 課程能力、先修 SA18 |
| SA20 | 系統分析與設計島綜合專題 | 待能力 | SA15、SA16、SA19 | challenge-stages | 課程能力、先修 SA15、SA16、SA19 |

### 程式與資訊群島 · 管理資訊系統島（MIS）

| 課程 | 名稱 | 狀態 | 先修 | 藍圖活動 | 阻礙 |
|---|---|---|---|---|---|
| MIS01 | 資訊系統與組織 | 待能力 | F01 | case-study-board | 課程能力 |
| MIS02 | 資訊系統的類型 | 待能力 | MIS01 | case-study-board | 課程能力、先修 MIS01 |
| MIS03 | 資訊系統策略與競爭優勢 | 待能力 | MIS01 | decision-simulation | 課程能力、先修 MIS01 |
| MIS04 | 業務流程管理與改善 | 待能力 | MIS01 | process-model | 課程能力、先修 MIS01 |
| MIS05 | IT 基礎建設與雲端服務 | 待能力 | MIS02 | cost-calculator | 課程能力、先修 MIS02 |
| MIS06 | 資料治理與資料品質 | 待能力 | MIS02、DB01 | data-explorer | 課程能力、先修 MIS02 |
| MIS07 | 電子商務與數位平台 | 待能力 | MIS03 | kpi-dashboard | 課程能力、先修 MIS03 |
| MIS08 | 企業資源規劃 ERP | 待能力 | MIS04 | process-model | 課程能力、先修 MIS04 |
| MIS09 | 顧客關係管理 CRM | 待能力 | MIS08 | kpi-dashboard | 課程能力、先修 MIS08 |
| MIS10 | 供應鏈管理 SCM | 待能力 | MIS08 | decision-simulation | 課程能力、先修 MIS08 |
| MIS11 | 資料倉儲與 OLAP | 待能力 | MIS06、DB03 | sql-playground | 課程能力、先修 MIS06 |
| MIS12 | 商業智慧 | 待能力 | MIS11 | kpi-dashboard | 課程能力、先修 MIS11 |
| MIS13 | 決策支援系統 | 待能力 | MIS12 | decision-simulation | 課程能力、先修 MIS12 |
| MIS14 | IT 治理 | 待能力 | MIS03、MIS05 | case-study-board | 課程能力、先修 MIS03、MIS05 |
| MIS15 | 資訊安全管理與風險 | 待能力 | MIS14 | decision-simulation | 課程能力、先修 MIS14 |
| MIS16 | 資訊倫理、隱私與法規 | 待能力 | MIS06 | case-study-board | 課程能力、先修 MIS06 |
| MIS17 | IT 專案組合與投資評估 | 待能力 | MIS14 | cost-calculator | 課程能力、先修 MIS14 |
| MIS18 | 數位轉型 | 待能力 | MIS03、MIS04 | case-study-board | 課程能力、先修 MIS03、MIS04 |
| MIS19 | 資訊系統成敗個案分析 | 待能力 | MIS17 | case-study-board | 課程能力、先修 MIS17 |
| MIS20 | 管理資訊系統島綜合專題 | 待能力 | MIS18、MIS19 | challenge-stages | 課程能力、先修 MIS18、MIS19 |

### AI 人工智慧群島 · AI 基礎島（AIF）

| 課程 | 名稱 | 狀態 | 先修 | 藍圖活動 | 阻礙 |
|---|---|---|---|---|---|
| AIF01 | AI 是什麼 | 已發布（閘門通過） | F01 | conditional-branch | — |
| AIF02 | AI 的發展史與主要方法 | 已發布（閘門通過） | AIF01 | none | — |
| AIF03 | 智慧代理人 | 已發布（閘門通過） | AIF01 | array-index | — |
| AIF04 | 問題形式化與無資訊搜尋 | 已發布（閘門通過） | AIF03、A14、A15 | tree-traversal | — |
| AIF05 | 啟發式搜尋與 A* | 已發布（閘門通過） | AIF04、A16 | graph-traversal | — |
| AIF06 | 區域搜尋與最佳化 | 已發布（閘門通過） | AIF04 | array-index | — |
| AIF07 | 對抗搜尋與 Minimax | 已發布（閘門通過） | AIF04 | recursion-tree | — |
| AIF08 | Alpha-Beta 剪枝與遊戲 AI | 已發布（閘門通過） | AIF07 | recursion-tree | — |
| AIF09 | 限制滿足問題 | 已發布（閘門通過） | AIF04、A12 | recursion-tree | — |
| AIF10 | 知識表示 | 已發布（閘門通過） | AIF03 | graph-traversal | — |
| AIF11 | 命題邏輯與推論 | 已發布（閘門通過） | AIF10、F06 | dp-table | — |
| AIF12 | 一階邏輯 | 已發布（閘門通過） | AIF11 | variable-state | — |
| AIF13 | AI 的機率基礎 | 已發布（閘門通過） | AIF01 | dp-table | — |
| AIF14 | 貝氏定理與機率推論 | 已發布（閘門通過） | AIF13 | variable-state | — |
| AIF15 | 貝氏網路 | 已發布（閘門通過） | AIF14 | recursion-tree | — |
| AIF16 | 馬可夫鏈與隱馬可夫模型 | 已發布（閘門通過） | AIF14 | dp-table | — |
| AIF17 | 決策理論與效用 | 已發布（閘門通過） | AIF13、AIF03 | variable-state | — |
| AIF18 | 馬可夫決策過程入門 | 已發布（閘門通過） | AIF17 | dp-table | — |
| AIF19 | 負責任的 AI | 已發布（閘門通過） | AIF03 | dp-table | — |
| AIF20 | AI 基礎島綜合專題 | 已發布（閘門通過） | AIF05、AIF08、AIF18 | challenge-stages | — |

### AI 人工智慧群島 · 機器學習島（ML）

| 課程 | 名稱 | 狀態 | 先修 | 藍圖活動 | 阻礙 |
|---|---|---|---|---|---|
| ML01 | 機器學習工作流程 | 待能力 | AIF01 | pipeline-diagram | 課程能力 |
| ML02 | NumPy 與 pandas 資料處理 | 待能力 | ML01、F12 | data-explorer | 課程能力、先修 ML01 |
| ML03 | 探索式資料分析 EDA | 待能力 | ML02 | data-explorer | 課程能力、先修 ML02 |
| ML04 | 資料前處理與資料切分 | 待能力 | ML03 | data-explorer | 課程能力、先修 ML03 |
| ML05 | 線性迴歸 | 待能力 | ML04 | regression-explorer | 課程能力、先修 ML04 |
| ML06 | 過擬合與欠擬合 | 待能力 | ML05 | regression-explorer | 課程能力、先修 ML05 |
| ML07 | 正則化：Ridge 與 Lasso | 待能力 | ML06 | regression-explorer | 課程能力、先修 ML06 |
| ML08 | k-NN 最近鄰分類 | 待能力 | ML04 | classification-explorer | 課程能力、先修 ML04 |
| ML09 | 邏輯迴歸 | 待能力 | ML05 | classification-explorer | 課程能力、先修 ML05 |
| ML10 | 單純貝氏分類器 | 待能力 | ML04、AIF13 | probability-explorer | 課程能力、先修 ML04 |
| ML11 | 決策樹 | 待能力 | ML04 | decision-tree-explorer | 課程能力、先修 ML04 |
| ML12 | 集成學習：Bagging 與隨機森林 | 待能力 | ML11 | decision-tree-explorer | 課程能力、先修 ML11 |
| ML13 | 梯度提升 | 待能力 | ML12 | decision-tree-explorer | 課程能力、先修 ML12 |
| ML14 | 支援向量機 SVM | 待能力 | ML09 | classification-explorer | 課程能力、先修 ML09 |
| ML15 | 特徵工程 | 待能力 | ML04 | data-explorer | 課程能力、先修 ML04 |
| ML16 | k-means 分群 | 待能力 | ML04 | clustering-explorer | 課程能力、先修 ML04 |
| ML17 | 階層式分群與 DBSCAN | 待能力 | ML16 | clustering-explorer | 課程能力、先修 ML16 |
| ML18 | 主成分分析 PCA | 待能力 | ML04 | data-explorer | 課程能力、先修 ML04 |
| ML19 | 模型評估指標 | 待能力 | ML09 | metric-explorer | 課程能力、先修 ML09 |
| ML20 | 交叉驗證 | 待能力 | ML19 | metric-explorer | 課程能力、先修 ML19 |
| ML21 | 不平衡資料處理 | 待能力 | ML20 | metric-explorer | 課程能力、先修 ML20 |
| ML22 | 超參數調整 | 待能力 | ML20 | metric-explorer | 課程能力、先修 ML20 |
| ML23 | scikit-learn Pipeline 與模型組合 | 待能力 | ML15、ML22 | pipeline-diagram | 課程能力、先修 ML15、ML22 |
| ML24 | 模型可解釋性 | 待能力 | ML12、ML19 | classification-explorer | 課程能力、先修 ML12、ML19 |
| ML25 | 機器學習島綜合專題 | 待能力 | ML21、ML23、ML24 | challenge-stages | 課程能力、先修 ML21、ML23、ML24 |

### AI 人工智慧群島 · 深度學習島（DL）

| 課程 | 名稱 | 狀態 | 先修 | 藍圖活動 | 阻礙 |
|---|---|---|---|---|---|
| DL01 | 神經網路基礎 | 待能力 | ML09 | nn-forward | 課程能力、先修 ML09 |
| DL02 | 激活函數與損失函數 | 待能力 | DL01 | nn-forward | 課程能力、先修 DL01 |
| DL03 | 梯度下降 | 待能力 | DL02 | gradient-descent | 課程能力、先修 DL02 |
| DL04 | 計算圖與連鎖律 | 待能力 | DL03 | backprop-graph | 課程能力、先修 DL03 |
| DL05 | 反向傳播 | 待能力 | DL04 | backprop-graph | 課程能力、先修 DL04 |
| DL06 | 從零實作多層感知器 | 待能力 | DL05、ML02 | training-curves | 課程能力、先修 DL05、ML02 |
| DL07 | 權重初始化與梯度消失 | 待能力 | DL06 | training-curves | 課程能力、先修 DL06 |
| DL08 | PyTorch 入門 | 待能力 | DL05、ML02 | backprop-graph | 課程能力、先修 DL05、ML02 |
| DL09 | PyTorch 模型與訓練迴圈 | 待能力 | DL08 | training-curves | 課程能力、先修 DL08 |
| DL10 | PyTorch 資料集與 DataLoader | 待能力 | DL09 | pipeline-diagram | 課程能力、先修 DL09 |
| DL11 | 最佳化器：SGD、Momentum 與 Adam | 待能力 | DL09 | gradient-descent | 課程能力、先修 DL09 |
| DL12 | 深度學習正則化：Dropout 與 Batch Norm | 待能力 | DL11 | training-curves | 課程能力、先修 DL11 |
| DL13 | 卷積神經網路 CNN | 待能力 | DL09 | conv-visualizer | 課程能力、先修 DL09 |
| DL14 | CNN 經典架構與殘差網路 | 待能力 | DL13 | architecture-diagram | 課程能力、先修 DL13 |
| DL15 | 循環神經網路：RNN、LSTM 與 GRU | 待能力 | DL09 | sequence-model | 課程能力、先修 DL09 |
| DL16 | 注意力機制 | 待能力 | DL15 | attention-explorer | 課程能力、先修 DL15 |
| DL17 | 多頭注意力與位置編碼 | 待能力 | DL16 | attention-explorer | 課程能力、先修 DL16 |
| DL18 | Transformer 架構 | 待能力 | DL17 | architecture-diagram | 課程能力、先修 DL17 |
| DL19 | 遷移學習與微調 | 待能力 | DL14 | training-curves | 課程能力、先修 DL14 |
| DL20 | 序列建模實務 | 待能力 | DL15、DL18 | sequence-model | 課程能力、先修 DL15、DL18 |
| DL21 | 深度學習訓練管線 | 待能力 | DL10、DL12 | pipeline-diagram | 課程能力、先修 DL10、DL12 |
| DL22 | 訓練除錯與視覺化 | 待能力 | DL21 | training-curves | 課程能力、先修 DL21 |
| DL23 | 神經網路可解釋性 | 待能力 | DL13 | conv-visualizer | 課程能力、先修 DL13 |
| DL24 | 模型匯出與推論準備 | 待能力 | DL21 | deployment-simulator | 課程能力、先修 DL21 |
| DL25 | 深度學習島綜合專題 | 待能力 | DL19、DL22、DL24 | challenge-stages | 課程能力、先修 DL19、DL22、DL24 |

### AI 人工智慧群島 · 大型語言模型島（LLM）

| 課程 | 名稱 | 狀態 | 先修 | 藍圖活動 | 阻礙 |
|---|---|---|---|---|---|
| LLM01 | 大型語言模型概觀 | 已發布（閘門通過） | AIF01 | sampling-explorer | — |
| LLM02 | Tokenization 斷詞 | 已發布（閘門通過） | LLM01 | token-explorer | — |
| LLM03 | 嵌入向量 | 已發布（閘門通過） | LLM02 | embedding-space | — |
| LLM04 | 用 Transformer 做語言模型 | 待先修 | LLM03、DL18 | attention-explorer | 先修 DL18 |
| LLM05 | 預訓練目標與資料 | 待先修 | LLM04 | token-explorer | 先修 LLM04 |
| LLM06 | 規模法則與運算預算 | 待先修 | LLM05 | cost-calculator | 先修 LLM05 |
| LLM07 | 解碼策略與取樣 | 大綱 | LLM02 | sampling-explorer | — |
| LLM08 | 指令微調與聊天模型 | 待先修 | LLM05 | prompt-lab | 先修 LLM05 |
| LLM09 | 使用 LLM API | 大綱 | LLM01、CN14 | prompt-lab | — |
| LLM10 | 提示工程 | 待先修 | LLM09 | prompt-lab | 先修 LLM09 |
| LLM11 | 上下文與對話管理 | 待先修 | LLM10 | token-explorer | 先修 LLM10 |
| LLM12 | 結構化輸出 | 待先修 | LLM10 | prompt-lab | 先修 LLM10 |
| LLM13 | 函式呼叫基礎 | 待先修 | LLM12 | tool-call-trace | 先修 LLM12 |
| LLM14 | RAG 檢索增強生成 | 待先修 | LLM03、LLM10 | rag-explorer | 先修 LLM10 |
| LLM15 | 向量檢索 | 待先修 | LLM14 | embedding-space | 先修 LLM14 |
| LLM16 | 文件切塊與索引 | 待先修 | LLM15 | rag-explorer | 先修 LLM15 |
| LLM17 | 混合檢索與重排序 | 待先修 | LLM16 | rag-explorer | 先修 LLM16 |
| LLM18 | 幻覺與安全 | 待先修 | LLM14 | guardrail-sim | 先修 LLM14 |
| LLM19 | 偏好對齊：RLHF 與 DPO | 待先修 | LLM08 | pipeline-diagram | 先修 LLM08 |
| LLM20 | LLM 評估 | 待先修 | LLM10 | eval-dashboard | 先修 LLM10 |
| LLM21 | 微調與 LoRA | 待先修 | LLM08、DL19 | training-curves | 先修 LLM08、DL19 |
| LLM22 | 推論與 KV Cache | 待先修 | LLM04、LLM07 | attention-explorer | 先修 LLM04、LLM07 |
| LLM23 | 模型量化 | 待先修 | LLM22 | cost-calculator | 先修 LLM22 |
| LLM24 | LLM 應用評估 | 待先修 | LLM17、LLM20 | eval-dashboard | 先修 LLM17、LLM20 |
| LLM25 | 大型語言模型島綜合專題 | 待先修 | LLM13、LLM18、LLM24 | challenge-stages | 先修 LLM13、LLM18、LLM24 |

### AI 人工智慧群島 · 生成式 AI 島（GEN）

| 課程 | 名稱 | 狀態 | 先修 | 藍圖活動 | 阻礙 |
|---|---|---|---|---|---|
| GEN01 | 生成模型概觀 | 已發布（閘門通過） | AIF01 | sampling-explorer | — |
| GEN02 | 自回歸生成模型 | 已發布（閘門通過） | GEN01、LLM01 | sampling-explorer | — |
| GEN03 | 自編碼器與 VAE | 待先修 | GEN01、DL01 | latent-space | 先修 DL01 |
| GEN04 | GAN 生成對抗網路 | 待先修 | GEN01、DL03 | training-curves | 先修 DL03 |
| GEN05 | 擴散模型 | 大綱 | GEN01 | diffusion-steps | — |
| GEN06 | 流模型與 Flow Matching | 待先修 | GEN05 | diffusion-steps | 先修 GEN05 |
| GEN07 | 擴散取樣器與排程 | 待先修 | GEN05 | diffusion-steps | 先修 GEN05 |
| GEN08 | CLIP 與圖文對齊 | 大綱 | GEN01、LLM03 | embedding-space | — |
| GEN09 | 文字生成圖像：潛在擴散 | 待先修 | GEN07、GEN08 | multimodal-pipeline | 先修 GEN07、GEN08 |
| GEN10 | 條件生成與 Classifier-Free Guidance | 待先修 | GEN09 | diffusion-steps | 先修 GEN09 |
| GEN11 | ControlNet 與結構控制 | 待先修 | GEN10 | multimodal-pipeline | 先修 GEN10 |
| GEN12 | 圖像編輯與修補 | 待先修 | GEN10 | diffusion-steps | 先修 GEN10 |
| GEN13 | 影片生成 | 待先修 | GEN09 | diffusion-steps | 先修 GEN09 |
| GEN14 | 語音合成 TTS | 大綱 | GEN02 | multimodal-pipeline | — |
| GEN15 | 音樂與音訊生成 | 待先修 | GEN05、GEN14 | sequence-model | 先修 GEN05、GEN14 |
| GEN16 | 視覺語言模型 | 待先修 | GEN08、LLM10 | multimodal-pipeline | 先修 GEN08、LLM10 |
| GEN17 | 生成結果評估 | 待先修 | GEN09、LLM20 | eval-dashboard | 先修 GEN09、LLM20 |
| GEN18 | 生成式創作工作流程 | 待先修 | GEN12、GEN16 | pipeline-diagram | 先修 GEN12、GEN16 |
| GEN19 | 著作權、倫理與浮水印 | 大綱 | GEN01、AIF19 | case-study-board | — |
| GEN20 | 生成式 AI 島綜合專題 | 待先修 | GEN17、GEN18、GEN19 | challenge-stages | 先修 GEN17、GEN18、GEN19 |

### AI 人工智慧群島 · AI 代理島（AG）

| 課程 | 名稱 | 狀態 | 先修 | 藍圖活動 | 阻礙 |
|---|---|---|---|---|---|
| AG01 | Agent 架構 | 待能力 | AIF03、LLM10 | agent-workflow | 課程能力、先修 LLM10 |
| AG02 | LLM 作為推理核心 | 待能力 | AG01 | prompt-lab | 課程能力、先修 AG01 |
| AG03 | 工具呼叫 | 待能力 | AG01、LLM12 | tool-call-trace | 課程能力、先修 AG01、LLM12 |
| AG04 | 工具介面設計 | 待能力 | AG03 | tool-call-trace | 課程能力、先修 AG03 |
| AG05 | ReAct：推理與行動交錯 | 待能力 | AG02、AG03 | agent-workflow | 課程能力、先修 AG02、AG03 |
| AG06 | Agent 迴圈 | 待能力 | AG03、AG05 | agent-workflow | 課程能力、先修 AG03、AG05 |
| AG07 | 規劃與執行 | 待能力 | AG06 | agent-workflow | 課程能力、先修 AG06 |
| AG08 | 上下文工程與短期記憶 | 待能力 | AG06 | memory-inspector | 課程能力、先修 AG06 |
| AG09 | 長期記憶 | 待能力 | AG08、LLM15 | memory-inspector | 課程能力、先修 AG08、LLM15 |
| AG10 | Agentic RAG | 待能力 | AG06、LLM14 | rag-explorer | 課程能力、先修 AG06、LLM14 |
| AG11 | 工作流程模式 | 待能力 | AG06 | agent-workflow | 課程能力、先修 AG06 |
| AG12 | MCP 模型上下文協定 | 待能力 | AG03、CN14 | protocol-sequence | 課程能力、先修 AG03 |
| AG13 | 實作 MCP 伺服器 | 待能力 | AG12 | tool-call-trace | 課程能力、先修 AG12 |
| AG14 | 以圖與狀態機編排 Agent | 待能力 | AG07、AG11 | agent-workflow | 課程能力、先修 AG07、AG11 |
| AG15 | 多 Agent 系統 | 待能力 | AG14 | multi-agent-board | 課程能力、先修 AG14 |
| AG16 | 人機協作與審批 | 待能力 | AG14 | agent-workflow | 課程能力、先修 AG14 |
| AG17 | Agent 護欄 | 待能力 | AG06、LLM12 | guardrail-sim | 課程能力、先修 AG06、LLM12 |
| AG18 | 提示注入與防禦 | 待能力 | AG17、CN18 | guardrail-sim | 課程能力、先修 AG17 |
| AG19 | 沙箱與權限：程式與電腦操作 Agent | 待能力 | AG18 | guardrail-sim | 課程能力、先修 AG18 |
| AG20 | Agent 評估 | 待能力 | AG06、LLM20 | eval-dashboard | 課程能力、先修 AG06、LLM20 |
| AG21 | Agent 基準測試 | 待能力 | AG20 | eval-dashboard | 課程能力、先修 AG20 |
| AG22 | Agent 可靠性：重試與冪等 | 待能力 | AG06 | tool-call-trace | 課程能力、先修 AG06 |
| AG23 | Agent 成本與延遲 | 待能力 | AG08 | cost-calculator | 課程能力、先修 AG08 |
| AG24 | Agent 追蹤與除錯 | 待能力 | AG20、AG22 | tool-call-trace | 課程能力、先修 AG20、AG22 |
| AG25 | AI 代理島綜合專題：上線一個 Agent | 待能力 | AG16、AG18、AG24 | challenge-stages | 課程能力、先修 AG16、AG18、AG24 |

### AI 人工智慧群島 · AI 工程與 MLOps 島（OPS）

| 課程 | 名稱 | 狀態 | 先修 | 藍圖活動 | 阻礙 |
|---|---|---|---|---|---|
| OPS01 | AI 工程與 MLOps 概觀 | 待能力 | SA01、LLM01 | pipeline-diagram | 課程能力、先修 SA01 |
| OPS02 | 以 API 提供 AI 服務 | 待能力 | OPS01、CN14 | protocol-sequence | 課程能力、先修 OPS01 |
| OPS03 | 模型閘道與供應商整合 | 待能力 | OPS02 | deployment-simulator | 課程能力、先修 OPS02 |
| OPS04 | 容器與 Docker | 待能力 | OPS02 | pipeline-diagram | 課程能力、先修 OPS02 |
| OPS05 | 模型產出物打包 | 待能力 | OPS04、DL08 | pipeline-diagram | 課程能力、先修 OPS04、DL08 |
| OPS06 | 部署模式 | 待能力 | OPS04 | deployment-simulator | 課程能力、先修 OPS04 |
| OPS07 | GPU 推論與批次處理 | 待能力 | OPS02 | deployment-simulator | 課程能力、先修 OPS02 |
| OPS08 | 自動擴展與負載管理 | 待能力 | OPS06 | deployment-simulator | 課程能力、先修 OPS06 |
| OPS09 | 模型註冊與版本管理 | 待能力 | OPS05、ML20 | pipeline-diagram | 課程能力、先修 OPS05、ML20 |
| OPS10 | 資料與特徵管線 | 待能力 | OPS01、ML02 | pipeline-diagram | 課程能力、先修 OPS01、ML02 |
| OPS11 | AI 系統的 CI／CD | 待能力 | OPS06、SA16 | pipeline-diagram | 課程能力、先修 OPS06、SA16 |
| OPS12 | 持續訓練與再訓練 | 待能力 | OPS09、OPS10、OPS11 | pipeline-diagram | 課程能力、先修 OPS09、OPS10、OPS11 |
| OPS13 | AI 系統可觀測性 | 待能力 | OPS02 | monitoring-dashboard | 課程能力、先修 OPS02 |
| OPS14 | 資料漂移與品質監控 | 待能力 | OPS13 | monitoring-dashboard | 課程能力、先修 OPS13 |
| OPS15 | 上線後評估管線 | 待能力 | OPS13、LLM20 | eval-dashboard | 課程能力、先修 OPS13、LLM20 |
| OPS16 | AI 成本最佳化 | 待能力 | OPS03 | cost-calculator | 課程能力、先修 OPS03 |
| OPS17 | AI 系統安全與法規遵循 | 待能力 | OPS11、CN18 | case-study-board | 課程能力、先修 OPS11 |
| OPS18 | AI 系統事故應變 | 待能力 | OPS06、OPS13 | decision-simulation | 課程能力、先修 OPS06、OPS13 |
| OPS19 | SLO 與容量規劃 | 待能力 | OPS08、OPS13 | monitoring-dashboard | 課程能力、先修 OPS08、OPS13 |
| OPS20 | AI 工程島綜合專題：上線一個 AI 系統 | 待能力 | OPS15、OPS17、OPS18 | challenge-stages | 課程能力、先修 OPS15、OPS17、OPS18 |

### 數位設計群島 · UI 設計島（UI）

| 課程 | 名稱 | 狀態 | 先修 | 藍圖活動 | 阻礙 |
|---|---|---|---|---|---|
| UI01 | 介面設計是什麼：好介面的判準 | 待能力 | — | case-study-board | 課程能力 |
| UI02 | 視覺層級：大小、對比、位置 | 待能力 | UI01 | visual-hierarchy | 課程能力、先修 UI01 |
| UI03 | 格式塔原則與分組 | 待能力 | UI02 | visual-hierarchy | 課程能力、先修 UI02 |
| UI04 | 間距與節奏：4／8 pt 系統 | 待能力 | UI03 | case-study-board | 課程能力、先修 UI03 |
| UI05 | 版面格線與對齊 | 待能力 | UI04 | grid-playground | 課程能力、先修 UI04 |
| UI06 | 字體排印：字級、行高、行長 | 待能力 | UI02 | case-study-board | 課程能力、先修 UI02 |
| UI07 | 中文與多語排版 | 待能力 | UI06 | case-study-board | 課程能力、先修 UI06 |
| UI08 | 色彩基礎：色相、明度、彩度 | 待能力 | UI01 | color-contrast | 課程能力、先修 UI01 |
| UI09 | 色彩系統與語意色 | 待能力 | UI08 | color-contrast | 課程能力、先修 UI08 |
| UI10 | 對比與可讀性：WCAG 對比 | 待能力 | UI08 | color-contrast | 課程能力、先修 UI08 |
| UI11 | 圖示與圖像 | 待能力 | UI03 | case-study-board | 課程能力、先修 UI03 |
| UI12 | 元件狀態：懸停、焦點、停用、錯誤 | 待能力 | UI09 | case-study-board | 課程能力、先修 UI09 |
| UI13 | 深色模式與主題 | 待能力 | UI09、UI10 | color-contrast | 課程能力、先修 UI09、UI10 |
| UI14 | 資料密集介面：表格與儀表板 | 待能力 | UI05、UI12 | case-study-board | 課程能力、先修 UI05、UI12 |
| UI15 | UI 設計島綜合專題：重新設計一個畫面 | 待能力 | UI05、UI07、UI12 | challenge-stages | 課程能力、先修 UI05、UI07、UI12 |

### 數位設計群島 · UX 研究島（UX）

| 課程 | 名稱 | 狀態 | 先修 | 藍圖活動 | 阻礙 |
|---|---|---|---|---|---|
| UX01 | 使用者體驗與可用性 | 待能力 | — | case-study-board | 課程能力 |
| UX02 | 以使用者為中心的設計流程 | 待能力 | UX01 | process-model | 課程能力、先修 UX01 |
| UX03 | 研究問題、研究計畫與研究倫理 | 待能力 | UX02 | requirements-board | 課程能力、先修 UX02 |
| UX04 | 使用者訪談 | 待能力 | UX03 | case-study-board | 課程能力、先修 UX03 |
| UX05 | 問卷與量化研究 | 待能力 | UX03 | data-explorer | 課程能力、先修 UX03 |
| UX06 | 觀察與情境研究 | 待能力 | UX04 | case-study-board | 課程能力、先修 UX04 |
| UX07 | 研究資料整理：親和圖 | 待能力 | UX04 | case-study-board | 課程能力、先修 UX04 |
| UX08 | 人物誌與待完成工作（JTBD） | 待能力 | UX07 | requirements-board | 課程能力、先修 UX07 |
| UX09 | 使用者旅程地圖 | 待能力 | UX08 | process-model | 課程能力、先修 UX08 |
| UX10 | 資訊架構：分類、標籤、導覽 | 待能力 | UX08 | process-model | 課程能力、先修 UX08 |
| UX11 | 卡片分類與樹狀測試 | 待能力 | UX10 | data-explorer | 課程能力、先修 UX10 |
| UX12 | User Flow 與任務流程 | 待能力 | UX10 | process-model | 課程能力、先修 UX10 |
| UX13 | Wireframe：從低擬真到中擬真 | 待能力 | UX12 | case-study-board | 課程能力、先修 UX12 |
| UX14 | 可用性測試與嚴重度評估 | 待能力 | UX13 | case-study-board | 課程能力、先修 UX13 |
| UX15 | UX 研究島綜合專題：一個功能的研究報告 | 待能力 | UX09、UX11、UX14 | challenge-stages | 課程能力、先修 UX09、UX11、UX14 |

### 數位設計群島 · 互動設計島（IXD）

| 課程 | 名稱 | 狀態 | 先修 | 藍圖活動 | 阻礙 |
|---|---|---|---|---|---|
| IXD01 | 可供性、訊號與回饋 | 待能力 | — | case-study-board | 課程能力 |
| IXD02 | 心智模型與一致性 | 待能力 | IXD01 | case-study-board | 課程能力、先修 IXD01 |
| IXD03 | 原型：低擬真與高擬真 | 待能力 | IXD01 | case-study-board | 課程能力、先修 IXD01 |
| IXD04 | 錯誤預防與錯誤訊息 | 待能力 | IXD02 | case-study-board | 課程能力、先修 IXD02 |
| IXD05 | 表單設計 | 待能力 | IXD04 | case-study-board | 課程能力、先修 IXD04 |
| IXD06 | 載入、空狀態與進度 | 待能力 | IXD01 | case-study-board | 課程能力、先修 IXD01 |
| IXD07 | 導覽模式 | 待能力 | IXD02 | mobile-nav-sim | 課程能力、先修 IXD02 |
| IXD08 | 無障礙原則：POUR 與 WCAG | 待能力 | IXD01 | a11y-checker | 課程能力、先修 IXD01 |
| IXD09 | 鍵盤與螢幕閱讀器的使用情境 | 待能力 | IXD08 | a11y-checker | 課程能力、先修 IXD08 |
| IXD10 | 目標尺寸、Fitts 定律與手勢設計 | 待能力 | IXD01 | case-study-board | 課程能力、先修 IXD01 |
| IXD11 | 動效：時間、緩動與減少動態 | 待能力 | IXD06 | case-study-board | 課程能力、先修 IXD06 |
| IXD12 | 原型測試與迭代 | 待能力 | IXD03 | case-study-board | 課程能力、先修 IXD03 |
| IXD13 | 介面文案與微文案 | 待能力 | IXD04 | case-study-board | 課程能力、先修 IXD04 |
| IXD14 | 互動設計島綜合專題：可存取的互動原型 | 待能力 | IXD05、IXD09、IXD12 | challenge-stages | 課程能力、先修 IXD05、IXD09、IXD12 |

### 數位設計群島 · 設計系統島（DSY）

| 課程 | 名稱 | 狀態 | 先修 | 藍圖活動 | 阻礙 |
|---|---|---|---|---|---|
| DSY01 | 什麼是設計系統 | 待能力 | — | case-study-board | 課程能力 |
| DSY02 | Design Tokens：色彩、字體、間距 | 待能力 | DSY01 | design-token-board | 課程能力、先修 DSY01 |
| DSY03 | Token 分層：基礎、語意、元件 | 待能力 | DSY02 | design-token-board | 課程能力、先修 DSY02 |
| DSY04 | 主題與多品牌 | 待能力 | DSY03 | design-token-board | 課程能力、先修 DSY03 |
| DSY05 | 元件解剖：結構、變體、狀態 | 待能力 | DSY02 | case-study-board | 課程能力、先修 DSY02 |
| DSY06 | 元件 API 規格：屬性與組合 | 待能力 | DSY05 | case-study-board | 課程能力、先修 DSY05 |
| DSY07 | 把無障礙內建到元件 | 待能力 | DSY05 | a11y-checker | 課程能力、先修 DSY05 |
| DSY08 | 設計系統文件 | 待能力 | DSY05 | case-study-board | 課程能力、先修 DSY05 |
| DSY09 | 版本、變更紀錄與廢棄 | 待能力 | DSY08 | case-study-board | 課程能力、先修 DSY08 |
| DSY10 | 設計到程式：Token 輸出管線 | 待能力 | DSY03 | pipeline-diagram | 課程能力、先修 DSY03 |
| DSY11 | 治理與貢獻流程 | 待能力 | DSY09 | process-model | 課程能力、先修 DSY09 |
| DSY12 | 設計系統島綜合專題：一個迷你設計系統 | 待能力 | DSY04、DSY07、DSY10 | challenge-stages | 課程能力、先修 DSY04、DSY07、DSY10 |

### 網頁與應用開發群島 · 網頁基礎島（WEB）

| 課程 | 名稱 | 狀態 | 先修 | 藍圖活動 | 阻礙 |
|---|---|---|---|---|---|
| WEB01 | 網頁如何運作：瀏覽器、HTML、CSS、JS | 已發布（閘門通過） | — | dom-explorer | — |
| WEB02 | HTML 文件結構與語意元素 | 已發布（閘門通過） | WEB01 | dom-explorer | — |
| WEB03 | 文字、連結、圖片與媒體 | 已發布（閘門通過） | WEB02 | dom-explorer | — |
| WEB04 | 表單元素與原生驗證 | 已發布（閘門通過） | WEB02 | dom-explorer | — |
| WEB05 | CSS 選擇器、串接與特異性 | 已發布（閘門通過） | WEB02 | dom-explorer | — |
| WEB06 | 盒模型與一般排版流 | 已發布（閘門通過） | WEB05 | dom-explorer | — |
| WEB07 | 定位與堆疊順序 | 已發布（閘門通過） | WEB06 | dom-explorer | — |
| WEB08 | JavaScript 與 DOM：選取與修改 | 已發布（閘門通過） | WEB02、F13 | dom-explorer | — |
| WEB09 | 事件與事件委派 | 已發布（閘門通過） | WEB08 | dom-explorer | — |
| WEB10 | 非同步 JavaScript：Promise 與 async／await | 已發布（閘門通過） | WEB09 | dom-explorer | — |
| WEB11 | fetch、JSON 與 API | 已發布（閘門通過） | WEB10 | dom-explorer | — |
| WEB12 | 瀏覽器儲存：localStorage 與 Cookie | 已發布（閘門通過） | WEB10 | dom-explorer | — |
| WEB13 | 語意 HTML 與 ARIA 的無障礙實作 | 已發布（閘門通過） | WEB04、WEB09 | dom-explorer | — |
| WEB14 | 網頁效能基礎：載入與 Core Web Vitals | 已發布（閘門通過） | WEB07、WEB11 | dom-explorer | — |
| WEB15 | 網頁基礎島綜合專題：無框架的小型網站 | 已發布（閘門通過） | WEB11、WEB13 | challenge-stages | — |

### 網頁與應用開發群島 · 前端開發島（FE）

| 課程 | 名稱 | 狀態 | 先修 | 藍圖活動 | 阻礙 |
|---|---|---|---|---|---|
| FE01 | 為什麼需要框架與元件 | 待能力 | WEB09 | case-study-board | 課程能力 |
| FE02 | TypeScript 基礎型別 | 待能力 | WEB08 | type-checker | 課程能力 |
| FE03 | TypeScript 介面、聯集與泛型 | 待能力 | FE02 | type-checker | 課程能力、先修 FE02 |
| FE04 | 模組與建置工具 | 待能力 | FE02 | pipeline-diagram | 課程能力、先修 FE02 |
| FE05 | React 元件與 JSX | 待能力 | FE01 | react-state-flow | 課程能力、先修 FE01 |
| FE06 | Props 與 State | 待能力 | FE05 | react-state-flow | 課程能力、先修 FE05 |
| FE07 | 事件、表單與受控元件 | 待能力 | FE06 | react-state-flow | 課程能力、先修 FE06 |
| FE08 | Effect 與資料取得 | 待能力 | FE07、WEB11 | react-state-flow | 課程能力、先修 FE07 |
| FE09 | 狀態管理與資料流 | 待能力 | FE08 | react-state-flow | 課程能力、先修 FE08 |
| FE10 | Next.js App Router：路由與版面 | 待能力 | FE06 | architecture-diagram | 課程能力、先修 FE06 |
| FE11 | Server／Client Components 與渲染策略 | 待能力 | FE10 | architecture-diagram | 課程能力、先修 FE10 |
| FE12 | 前端測試：單元與元件測試 | 待能力 | FE07 | case-study-board | 課程能力、先修 FE07 |
| FE13 | 可存取的元件實作 | 待能力 | FE07、WEB13 | a11y-checker | 課程能力、先修 FE07 |
| FE14 | 串流 UI 與 AI 介面 | 待能力 | FE08 | tool-call-trace | 課程能力、先修 FE08 |
| FE15 | 前端開發島綜合專題：Next.js 應用 | 待能力 | FE11、FE12、FE13 | challenge-stages | 課程能力、先修 FE11、FE12、FE13 |

### 網頁與應用開發群島 · 響應式設計島（RWD）

| 課程 | 名稱 | 狀態 | 先修 | 藍圖活動 | 阻礙 |
|---|---|---|---|---|---|
| RWD01 | 響應式原則與行動優先 | 已發布（閘門通過） | WEB06 | dom-explorer | — |
| RWD02 | viewport 與相對單位 | 已發布（閘門通過） | RWD01 | dom-explorer | — |
| RWD03 | Flexbox 基礎：主軸與交錯軸 | 已發布（閘門通過） | WEB06 | dom-explorer | — |
| RWD04 | Flexbox 進階：伸縮、換行與對齊 | 已發布（閘門通過） | RWD03 | dom-explorer | — |
| RWD05 | CSS Grid 基礎 | 已發布（閘門通過） | WEB06 | dom-explorer | — |
| RWD06 | CSS Grid 進階：區域與自動排列 | 已發布（閘門通過） | RWD05 | dom-explorer | — |
| RWD07 | Media Query 與斷點策略 | 已發布（閘門通過） | RWD02 | dom-explorer | — |
| RWD08 | Container Query | 已發布（閘門通過） | RWD07 | dom-explorer | — |
| RWD09 | 流體字級與 clamp() | 已發布（閘門通過） | RWD02 | dom-explorer | — |
| RWD10 | 響應式圖片與媒體 | 已發布（閘門通過） | RWD07 | dom-explorer | — |
| RWD11 | 響應式導覽與表格 | 已發布（閘門通過） | RWD04、RWD07 | dom-explorer | — |
| RWD12 | 響應式設計島綜合專題：一頁跨裝置版面 | 已發布（閘門通過） | RWD06、RWD08、RWD11 | challenge-stages | — |

### 網頁與應用開發群島 · 行動應用島（MOB）

| 課程 | 名稱 | 狀態 | 先修 | 藍圖活動 | 阻礙 |
|---|---|---|---|---|---|
| MOB01 | 行動情境與限制 | 已發布（閘門通過） | RWD01 | dom-explorer | — |
| MOB02 | 行動 UI 模式：Tab bar、Drawer、Bottom sheet | 已發布（閘門通過） | MOB01 | dom-explorer | — |
| MOB03 | 觸控目標與手勢的實作 | 已發布（閘門通過） | MOB02 | dom-explorer | — |
| MOB04 | Pointer Events 與觸控事件 | 已發布（閘門通過） | MOB03、WEB09 | dom-explorer | — |
| MOB05 | 行動表單與虛擬鍵盤 | 已發布（閘門通過） | MOB02、WEB04 | dom-explorer | — |
| MOB06 | 安全區域、方向與動態視窗高度 | 已發布（閘門通過） | RWD07 | dom-explorer | — |
| MOB07 | 原生、跨平台與 PWA 的選擇 | 已發布（閘門通過） | MOB01 | dom-explorer | — |
| MOB08 | PWA 基礎：Manifest 與安裝 | 已發布（閘門通過） | MOB07、WEB11 | dom-explorer | — |
| MOB09 | Service Worker 與離線 | 已發布（閘門通過） | MOB08 | dom-explorer | — |
| MOB10 | 行動效能與省電 | 已發布（閘門通過） | MOB06 | dom-explorer | — |
| MOB11 | 行動無障礙：螢幕閱讀器與縮放 | 已發布（閘門通過） | MOB02 | dom-explorer | — |
| MOB12 | 行動裝置測試：模擬器與真機 | 已發布（閘門通過） | MOB06 | dom-explorer | — |
| MOB13 | 行動應用島綜合專題：一個可離線的 PWA | 已發布（閘門通過） | MOB05、MOB09、MOB11 | challenge-stages | — |

### 系統與雲端工程群島 · Linux 系統島（LNX）

| 課程 | 名稱 | 狀態 | 先修 | 藍圖活動 | 阻礙 |
|---|---|---|---|---|---|
| LNX01 | Linux 概論與發行版 | 已發布（閘門通過） | — | terminal-sim | — |
| LNX02 | 終端機與 Shell 基礎 | 已發布（閘門通過） | LNX01 | terminal-sim | — |
| LNX03 | Linux 檔案系統階層 | 已發布（閘門通過） | LNX02 | terminal-sim | — |
| LNX04 | 檔案與目錄操作 | 已發布（閘門通過） | LNX03 | terminal-sim | — |
| LNX05 | 文字處理、管線與重新導向 | 已發布（閘門通過） | LNX04 | terminal-sim | — |
| LNX06 | 使用者與群組 | 已發布（閘門通過） | LNX04 | terminal-sim | — |
| LNX07 | Linux 權限與 chmod | 已發布（閘門通過） | LNX06 | terminal-sim | — |
| LNX08 | Process 管理與訊號 | 已發布（閘門通過） | LNX05 | terminal-sim | — |
| LNX09 | 套件管理 | 已發布（閘門通過） | LNX06 | terminal-sim | — |
| LNX10 | systemd 與服務管理 | 已發布（閘門通過） | LNX08 | terminal-sim | — |
| LNX11 | 日誌與 journalctl | 已發布（閘門通過） | LNX05、LNX10 | terminal-sim | — |
| LNX12 | SSH 遠端連線與金鑰 | 已發布（閘門通過） | LNX07 | network-sequence | — |
| LNX13 | Bash Script 撰寫 | 已發布（閘門通過） | LNX05、LNX07 | terminal-sim | — |
| LNX14 | 排程：cron 與 systemd timer | 已發布（閘門通過） | LNX10、LNX13 | terminal-sim | — |
| LNX15 | Linux 系統島綜合專題：維護一台伺服器 | 已發布（閘門通過） | LNX09、LNX11、LNX12、LNX14 | challenge-stages | — |

### 系統與雲端工程群島 · Docker 容器島（DKR）

| 課程 | 名稱 | 狀態 | 先修 | 藍圖活動 | 阻礙 |
|---|---|---|---|---|---|
| DKR01 | 容器概念：與虛擬機的差異 | 已發布（閘門通過） | LNX08 | network-sequence | — |
| DKR02 | Docker 架構：Client、Daemon 與 Registry | 已發布（閘門通過） | DKR01 | network-sequence | — |
| DKR03 | Image 與 Container 的生命週期 | 已發布（閘門通過） | DKR02 | terminal-sim | — |
| DKR04 | Docker CLI 常用指令 | 已發布（閘門通過） | DKR03 | terminal-sim | — |
| DKR05 | 撰寫 Dockerfile | 已發布（閘門通過） | DKR04、LNX09 | terminal-sim | — |
| DKR06 | Image 分層與建置快取 | 已發布（閘門通過） | DKR05 | terminal-sim | — |
| DKR07 | Volume 與資料保存 | 已發布（閘門通過） | DKR04、LNX07 | terminal-sim | — |
| DKR08 | 容器網路 | 已發布（閘門通過） | DKR04 | terminal-sim | — |
| DKR09 | Docker Compose 多容器應用 | 已發布（閘門通過） | DKR07、DKR08 | terminal-sim | — |
| DKR10 | 多階段建置 | 已發布（閘門通過） | DKR06 | terminal-sim | — |
| DKR11 | Container Registry 與版本標籤 | 已發布（閘門通過） | DKR05 | network-sequence | — |
| DKR12 | 容器安全 | 已發布（閘門通過） | DKR10、LNX07 | terminal-sim | — |
| DKR13 | 容器除錯 | 已發布（閘門通過） | DKR09、LNX11 | terminal-sim | — |
| DKR14 | 健康檢查、資源限制與優雅關閉 | 已發布（閘門通過） | DKR13 | terminal-sim | — |
| DKR15 | Docker 容器島綜合專題：容器化並準備上線 | 已發布（閘門通過） | DKR11、DKR12、DKR14 | challenge-stages | — |

### 系統與雲端工程群島 · 網路與伺服器島（SRV）

| 課程 | 名稱 | 狀態 | 先修 | 藍圖活動 | 阻礙 |
|---|---|---|---|---|---|
| SRV01 | 伺服器端的網路基礎：IP、Port 與 Socket | 已發布（閘門通過） | LNX02 | terminal-sim | — |
| SRV02 | 網域與 DNS 記錄管理 | 已發布（閘門通過） | SRV01 | network-sequence | — |
| SRV03 | 用 curl 觀察 HTTP 請求與回應 | 已發布（閘門通過） | SRV01 | network-sequence | — |
| SRV04 | TLS 憑證實務：申請、安裝與更新 | 已發布（閘門通過） | SRV02、SRV03 | network-sequence | — |
| SRV05 | 網頁伺服器架構 | 已發布（閘門通過） | SRV03 | network-sequence | — |
| SRV06 | Nginx 設定入門 | 已發布（閘門通過） | SRV05、LNX10 | network-sequence | — |
| SRV07 | 反向代理 | 已發布（閘門通過） | SRV06 | network-sequence | — |
| SRV08 | 負載平衡 | 已發布（閘門通過） | SRV07 | network-sequence | — |
| SRV09 | 伺服器防火牆：ufw 與 nftables | 已發布（閘門通過） | SRV01、LNX07 | terminal-sim | — |
| SRV10 | SSH 通道與跳板機 | 已發布（閘門通過） | LNX12、SRV09 | network-sequence | — |
| SRV11 | CDN 與快取設定 | 已發布（閘門通過） | SRV07 | network-sequence | — |
| SRV12 | 網路診斷工具 | 已發布（閘門通過） | SRV02、SRV03 | terminal-sim | — |
| SRV13 | 伺服器故障排除方法 | 已發布（閘門通過） | SRV07、SRV12、LNX11 | terminal-sim | — |
| SRV14 | 網路與伺服器島綜合專題：架設 HTTPS 網站並追蹤請求 | 已發布（閘門通過） | SRV04、SRV08、SRV10、SRV11、SRV13 | challenge-stages | — |

### 系統與雲端工程群島 · 雲端基礎設施島（CLD）

| 課程 | 名稱 | 狀態 | 先修 | 藍圖活動 | 阻礙 |
|---|---|---|---|---|---|
| CLD01 | 雲端運算概論與服務模型 | 待能力 | — | case-study-board | 課程能力 |
| CLD02 | 區域、可用區與帳號結構 | 待能力 | CLD01 | architecture-diagram | 課程能力、先修 CLD01 |
| CLD03 | 雲端虛擬機 | 待能力 | CLD02、LNX12 | deployment-simulator | 課程能力、先修 CLD02 |
| CLD04 | VPC 與雲端網路 | 待能力 | CLD02、SRV01 | architecture-diagram | 課程能力、先修 CLD02 |
| CLD05 | IAM 身分與權限 | 待能力 | CLD02 | decision-simulation | 課程能力、先修 CLD02 |
| CLD06 | 物件儲存 | 待能力 | CLD05 | cost-calculator | 課程能力、先修 CLD05 |
| CLD07 | 託管資料庫 | 待能力 | CLD04 | architecture-diagram | 課程能力、先修 CLD04 |
| CLD08 | AWS 與 GCP 服務對照 | 待能力 | CLD03、CLD06、CLD07 | case-study-board | 課程能力、先修 CLD03、CLD06、CLD07 |
| CLD09 | 基礎設施即程式碼 | 待能力 | CLD04、CLD05 | pipeline-diagram | 課程能力、先修 CLD04、CLD05 |
| CLD10 | Terraform 入門 | 待能力 | CLD09 | deployment-simulator | 課程能力、先修 CLD09 |
| CLD11 | Terraform State 與模組 | 待能力 | CLD10 | deployment-simulator | 課程能力、先修 CLD10 |
| CLD12 | 雲端安全基礎 | 待能力 | CLD04、CLD05 | case-study-board | 課程能力、先修 CLD04、CLD05 |
| CLD13 | 雲端成本管理 | 待能力 | CLD08 | cost-calculator | 課程能力、先修 CLD08 |
| CLD14 | 備份與災難復原 | 待能力 | CLD06、CLD07 | decision-simulation | 課程能力、先修 CLD06、CLD07 |
| CLD15 | 雲端基礎設施島綜合專題：設計一套雲端架構 | 待能力 | CLD11、CLD12、CLD13、CLD14 | challenge-stages | 課程能力、先修 CLD11、CLD12、CLD13、CLD14 |

### 系統與雲端工程群島 · DevOps 與 CI/CD 島（CICD）

| 課程 | 名稱 | 狀態 | 先修 | 藍圖活動 | 阻礙 |
|---|---|---|---|---|---|
| CICD01 | DevOps 概念與文化 | 已發布（閘門通過） | — | deployment-simulator | — |
| CICD02 | 團隊 Git 工作流程 | 已發布（閘門通過） | CICD01 | terminal-sim | — |
| CICD03 | 持續整合 | 大綱 | CICD02 | pipeline-sim | — |
| CICD04 | GitHub Actions 入門 | 待先修 | CICD03、LNX13 | pipeline-sim | 先修 CICD03 |
| CICD05 | 管線中的自動化測試 | 待先修 | CICD04 | pipeline-sim | 先修 CICD04 |
| CICD06 | 建置管線與產出物 | 待先修 | CICD04、DKR11 | pipeline-sim | 先修 CICD04 |
| CICD07 | 環境變數與設定管理 | 待先修 | CICD04 | pipeline-sim | 先修 CICD04 |
| CICD08 | 機密管理 | 待先修 | CICD07 | case-study-board | 先修 CICD07 |
| CICD09 | 部署管線 | 待先修 | CICD06、CICD07 | pipeline-sim | 先修 CICD06、CICD07 |
| CICD10 | 部署策略：滾動、藍綠與金絲雀 | 待先修 | CICD09 | deployment-simulator | 先修 CICD09 |
| CICD11 | 監控與告警 | 待先修 | CICD09 | monitoring-dashboard | 先修 CICD09 |
| CICD12 | 集中式日誌 | 待先修 | CICD11 | monitoring-dashboard | 先修 CICD11 |
| CICD13 | 回滾與發布安全 | 待先修 | CICD10、CICD11 | pipeline-sim | 先修 CICD10、CICD11 |
| CICD14 | 事故應變與事後檢討 | 待先修 | CICD12、CICD13 | case-study-board | 先修 CICD12、CICD13 |
| CICD15 | DevOps 與 CI/CD 島綜合專題：從 commit 到上線 | 待先修 | CICD05、CICD08、CICD14 | challenge-stages | 先修 CICD05、CICD08、CICD14 |

### 系統與雲端工程群島 · Kubernetes 與可靠性工程島（KUB）

| 課程 | 名稱 | 狀態 | 先修 | 藍圖活動 | 阻礙 |
|---|---|---|---|---|---|
| KUB01 | 容器編排概念 | 待能力 | DKR09 | cluster-sim | 課程能力 |
| KUB02 | Kubernetes 架構 | 待能力 | KUB01 | architecture-diagram | 課程能力、先修 KUB01 |
| KUB03 | Pod | 待能力 | KUB02 | cluster-sim | 課程能力、先修 KUB02 |
| KUB04 | Deployment 與 ReplicaSet | 待能力 | KUB03 | cluster-sim | 課程能力、先修 KUB03 |
| KUB05 | Service 與服務發現 | 待能力 | KUB04 | cluster-sim | 課程能力、先修 KUB04 |
| KUB06 | ConfigMap 與 Secret | 待能力 | KUB04、CICD08 | cluster-sim | 課程能力、先修 KUB04、CICD08 |
| KUB07 | Ingress 與 Gateway API | 待能力 | KUB05、SRV07 | request-path | 課程能力、先修 KUB05 |
| KUB08 | Persistent Volume 與有狀態應用 | 待能力 | KUB04、DKR07 | cluster-sim | 課程能力、先修 KUB04 |
| KUB09 | Helm 套件管理 | 待能力 | KUB06 | cluster-sim | 課程能力、先修 KUB06 |
| KUB10 | 自動擴展 | 待能力 | KUB04 | cluster-sim | 課程能力、先修 KUB04 |
| KUB11 | 滾動更新與回滾 | 待能力 | KUB04、CICD10 | cluster-sim | 課程能力、先修 KUB04、CICD10 |
| KUB12 | 叢集監控 | 待能力 | KUB05、CICD11 | monitoring-dashboard | 課程能力、先修 KUB05、CICD11 |
| KUB13 | 可觀測性：指標、日誌與追蹤 | 待能力 | KUB12、CICD12 | metric-explorer | 課程能力、先修 KUB12、CICD12 |
| KUB14 | SLI、SLO 與 SLA | 待能力 | KUB13 | metric-explorer | 課程能力、先修 KUB13 |
| KUB15 | Kubernetes 與可靠性工程島綜合專題：SRE 實務演練 | 待能力 | KUB07、KUB08、KUB09、KUB10、KUB11、KUB14、CICD14 | challenge-stages | 課程能力、先修 KUB07、KUB08、KUB09、KUB10、KUB11、KUB14、CICD14 |
