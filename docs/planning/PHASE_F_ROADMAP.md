# Phase F 路線圖（Multi-Archipelago Expansion）

> Phase F.0 規劃文件（2026-11-02）。**每一階段都需要另行批准才開始**；本文件不代表任何階段已開始或已完成。
> 依據：[ISLAND_TAXONOMY](ISLAND_TAXONOMY.md)、[CURRICULUM_320_BLUEPRINT](CURRICULUM_320_BLUEPRINT.md)、[LEARNING_PATHS](LEARNING_PATHS.md)、
> [INTERACTIVE_ACTIVITY_ARCHITECTURE](INTERACTIVE_ACTIVITY_ARCHITECTURE.md)、[WORLD_EXPANSION_ARCHITECTURE](WORLD_EXPANSION_ARCHITECTURE.md)、[ISLAND_CONFIG_DESIGN](ISLAND_CONFIG_DESIGN.md)。

## 0. 與舊編號的關係

[ROADMAP](../handoff/ROADMAP.md) 原本的 E／F／G／H／I／J 是 2026-10-29 的規劃；實際上 E 已用於 60 堂課綱（E.1–E.4 完成、E.5 進行中）。本文件的 Phase F 取代舊的 F–J：

| 舊 | 新 |
|---|---|
| E Data-Driven Islands（Planned） | F.0（資料驅動設定）＋ M1／M2（見 WORLD_EXPANSION） |
| F RPG Learning System | **F.6** |
| G APCS Challenges | **F.6**（中央挑戰島的 APCS Trial） |
| H AI 群島課程規劃（六島） | **F.0** 規劃（七島）＋ **F.2–F.5** 實作 |
| I 互動式 AI 實驗室與運算服務 | 併入各階段的活動實作；T4 後端不在 Phase F |
| J AI 專題挑戰 | **F.6**（AI Engineering Capstone） |

## 1. 估算基準

E.3／E.4 的實際經驗：一座 20 堂的完整島（教材、四語範例、測驗、練習與測資、視覺化）約需「一個階段」的工作，並以 4–5 個批次各自提交。以 **1 單位＝20 堂完整教材（重用既有視覺化）** 為基準；需要新活動元件的島另加。相對工作量只是排序用的估計，不是工期承諾。

## 2. 階段

### Phase E.5 — 既有平台整併（進行中的收尾）

- **Goal**：讓現有 60 堂與 4 座島穩定、可交付，作為擴充的地基。
- **Scope**：航行指南改版（實驗島置前、無編號、狀態分明，M2）；課程入口；KNOWN_ISSUES（P1-11 player、P1-32 Auto Orbit、P1-33 圖排版、P1-34 Workshop 語意）；教材人工教學審閱（60 堂四語）；**真機效能驗收（D.3-4B，目前 Not Measured）**；CI（含 JDK 17 與 Node，四語程式驗證）。
- **Dependencies**：無。
- **Deliverables**：航行指南改版、問題修正或明確延後、真機報告、CI 設定。
- **Acceptance**：E2E 全綠（P1-11 修正或有明確處置）；真機報告附數據；CI 在乾淨環境跑過全部四語驗證。
- **Effort**：1 單位。 **Risks**：真機效能不足會影響 M3 的區域地圖規模。 **Out of scope**：新課程、新島。

### Phase F.0 — 架構基礎

- **Goal**：讓系統能容納 15＋1 座島與 320 堂課，而畫面不變。
- **Scope**：island registry（[ISLAND_CONFIG_DESIGN](ISLAND_CONFIG_DESIGN.md)）；Lesson ID 完整前綴解析與每島課數；`assembleLayout` 支援 N 座聚落（M1）；Activity Type 合約與 registry（只有 T0，對應既有 20 種）；把藍圖資料轉為規劃中島嶼的大綱；學習路線資料模型。
- **Dependencies**：E.5 的航行指南（可並行）。
- **Deliverables**：`src/content/world/`、`validateWorld`、更新後的 `schema.ts` 前綴與課數、路線資料與驗證。
- **Acceptance**：既有 60 堂、路由、進度 key、首頁畫面不變（截圖比對、世界指紋測試）；validator 檢查 320／260／60、ID、slug、先修 DAG。
- **Effort**：1 單位。 **Risks**：前綴解析改動觸及課程核心型別。 **Out of scope**：新教材內容、新 3D 島。

> **2026-11-02 實作狀態**：F.0 已實作（本地 commit `1497718`、`5a33802`、`52b4d12`、`a7654d3`，未 push），見 `logs/2026-11-02-f0-architecture-foundation.md`。與上列 Scope 的差異：`assembleLayout` 支援 N 座聚落（M1）**未做**（依指示不改 3D 世界）；規劃課程留在 `src/content/world/catalog.ts`，沒有轉入 `lessons.ts`；`schema.ts` 只改 Lesson ID 型別與解析，`ISLAND_IDS`／`LESSONS_PER_ISLAND` 保留給有內容的三座島；首頁與 3D 檔案 0 行差異，因此沒有另做截圖比對。

### Phase F.1 — Computer Science 擴充（分三批）

| 批次 | 島 | 新活動（需實作） | 相對工作量 |
|---|---|---|---|
| F.1a | PL（20）、DB（20） | ast-explorer、compiler-pipeline、type-checker、memory-model、gc-visualizer、concurrency-timeline、scope-chain；sql-playground（T2，需新依賴批准）、erd-builder、query-plan、transaction-timeline、normalization-steps | 2 單位＋活動 1.5 |
| F.1b | CN（20）、SA（20） | packet-journey、subnet-calculator、protocol-sequence、routing-table；uml-designer、process-model、architecture-diagram、requirements-board | 2 單位＋活動 1.5 |
| F.1c | MIS（20） | decision-simulation、kpi-dashboard、case-study-board | 1 單位＋活動 0.5 |

- **Goal**：CS 區域 8 座島全部可學；CS 區域地圖（M3）。
- **Dependencies**：F.0；SQL 沙箱需要新增依賴的批准。
- **Deliverables**：100 堂完整教材（每批各自提交、各自驗收）、對應活動、CS 區域地圖。
- **Acceptance**：每堂通過 `validateCurriculum`；程式與 SQL 範例實際執行驗證；活動模擬器單元測試；E2E 與手機無水平溢出。
- **Risks**：SA／MIS 以設計與個案為主，練習難以自動驗證 → 用評分規準（rubric）與參考答案。
- **Out of scope**：線上評測、帳號。

> **2026-11-02 實作狀態**：F.1a 的第一部分已實作：資料庫應用島 DB01–DB05 與 SQL Playground（sql.js，T2；本地 commit，未 push），見 `logs/2026-11-02-f1a-database-mvp.md`。與上表的差異：DB 先做 5 堂而非 20 堂；PL 與 DB06–DB20 未開始；SQL 沙箱的新依賴已在本輪授權下加入。

> **2026-11-02 F.1b**：使用者授權的 F.1b 是「資料庫應用島 DB06–DB10」（不是上表原訂的 CN／SA）：DB06–DB10、SQL 檢查敘述判定、erd-builder 與 normalization-steps 兩個 T1 活動、課程能力宣告與島內導覽已實作（本地 commit，未 push），見 `logs/2026-11-02-f1b-database-expansion.md`。資料庫應用島剩 DB11–DB20（含 query-plan、transaction-timeline 活動）；CN、SA、MIS 與 PL 仍未開始，階段名稱與批次待使用者重新決定。

> **2026-11-02 F.1c**：使用者授權的 F.1c 是「資料庫應用島 DB11–DB15」：DB11–DB15、query-plan（T2）與 transaction-timeline（T1）兩個活動、程式碼測試執行器修正已實作（本地 commit，未 push），見 `logs/2026-11-02-f1c-database-expansion.md`。資料庫應用島剩 DB16–DB20；CN、SA、MIS 與 PL 仍未開始。

> **2026-11-02 F.1d**：使用者授權的 F.1d 是「資料庫應用島 DB16–DB20＋全島驗收」：DB16–DB20、protocol-sequence（T2）與 architecture-diagram（T1，架構圖＋確定性模擬）兩個活動、參數綁定、當機一致性檢查、驅動程式範例已實作（本地 commit，未 push），見 `logs/2026-11-02-f1d-database-island-completion.md`。**資料庫應用島 20／20 完整**；CN、SA、MIS 與 PL 仍未開始，下一階段待使用者決定。

> **Phase F.1e — 資料庫應用島 3D 世界整合（2026-11-02，已歸檔）**：執行時稱為「Phase F.2 Database Island 3D World Integration」；2026-11-03 使用者決定歸檔為 **F.1e**。下方的「Phase F.2 — AI Foundations & Machine Learning」教材階段**保留原編號**，不因世界地圖工作改變。commit 訊息、程式註解與 log 檔名（`logs/2026-11-02-f2-database-island-world.md`）中的「Phase F.2」都指 F.1e，不改寫。
> - **決策：首頁由 4 座島擴充為 5 座島**（使用者 2026-11-02 確認）。這改變了 [WORLD_EXPANSION_ARCHITECTURE](WORLD_EXPANSION_ARCHITECTURE.md) §5「M3 之前首頁保持現在的四座島」：資料庫應用島已完成 20／20，在 M3（CS 區域地圖）之前先加入首頁，比照互動實驗島只加在首頁的世界（`islandsHomeWorld`）。`/islands`、`/islands/legacy`、`/islands/candidate`、`/islands/hex/scale/37` 不變。
> - **完成狀態**：資料庫應用島在六角座標 (2, -9)（基礎程式島北方、資料結構島西方，與兩島都隔兩格水面），16 格；木橋 `structures-databases` 從資料結構島 (6, -8) 向西跨兩格水面接到 (3, -8)。滑鼠、鍵盤、觸控與清單（含沒有 WebGL 時的清單）都能進入；選島後顯示 6 個科目、DB01–DB20 連到各自的課、「教材：已開放 20／20 堂」與學習者自己的「已完成 X／20 堂」（沿用原本的進度資料），完整課綱連到 `/curriculum#island-databases`（取自 world registry 的入口）。既有四座島的地形、橋、道路、樹木、岩石、廣場與 GLB 擺放不變（單元測試逐項比對）。見 `logs/2026-11-02-f2-database-island-world.md`。
> - **Transitional Art 的限制**：資料庫主塔、B+ Tree 索引館、資料複寫雙塔、資料表廣場是程式產生的 low-poly 過渡地標（與資料結構島、演算法島、互動實驗島的佔位地標同等級），合併成一個網格加一個狀態燈（2 個 draw call）；不是 Blender 管線的正式美術，沒有 GLB 的節點互動（地點說明、建築入口）。
> - **正式 GLB 的後續工作**：在 Blender 管線製作 `databases-island` 建築部件（節點名稱已預留：`Landmark_DatabaseTower`、`Building_IndexHall`、`Landmark_ReplicaTowers`、`Plaza_DataTables`，見 `src/lib/islands/database-island.ts`），比照 v2.1 的比例 0.6、色系與傍晚發光材質，附節點契約、provenance、驗證報告與 SHA，經人工驗收後以 GLB settlement 接上；過渡地標保留為 fallback。需要另行授權。
> - **M3 的變更**：CS 區域地圖（8 座島）仍是之後的目標；首頁現在是 5 座島（4 座學科島＋互動實驗島）。M3 開始時，資料庫應用島的座標與橋要和區域地圖一起重新規劃；真機效能驗收（Not Measured）仍是 M3 的前置條件。

> **2026-11-03 M3.0**：3D 世界與 GLB 美術的工作另立為 **M3.0–M3.6**（區域架構、代表島 prototype、CS／AI GLB 批次、區域導覽、驗收），與本文件的教材階段（F.x）互不阻擋；見 [M3_CS_AI_MASTER_PLAN](M3_CS_AI_MASTER_PLAN.md) §8。下方的 F.2–F.5 教材階段維持原編號（使用者 2026-11-03 確認）；M3.x 只管理世界地圖、GLB 美術與區域導覽。

### Phase F.2 — AI Foundations & Machine Learning

- **Scope**：AIF（20）、ML（25）；活動：search-tree、game-tree、logic-proof、knowledge-graph、probability-explorer、bayes-net、mdp-gridworld、data-explorer、regression-explorer、classification-explorer、decision-tree-explorer、clustering-explorer、metric-explorer；AI 區域地圖（M4）與世界總覽、樞紐島。
- **Dependencies**：F.0；**數學先修缺口**的處置（見 [LEARNING_PATHS](LEARNING_PATHS.md#4-課程缺口)）需在開始前決定。
- **Acceptance**：模擬器以固定種子驗證（例如迴歸係數與解析解一致）；Python 範例在 CI 執行（需 NumPy／pandas／scikit-learn 的測試環境）。
- **Effort**：2.25 單位＋活動 2。 **Risks**：Python 科學套件的 CI 環境；教材數學深度。 **Out of scope**：瀏覽器內執行 scikit-learn。

### Phase F.3 — Deep Learning & LLM

- **Scope**：DL（25）、LLM（25）。**建議先做 LLM 的應用軌**（不需要 DL，服務 AI Application Engineering 路線），再做 DL 與 LLM 的模型軌。
- **活動**：nn-forward、gradient-descent、backprop-graph、training-curves、conv-visualizer、sequence-model、attention-explorer；token-explorer、embedding-space、sampling-explorer、prompt-lab（模擬）、rag-explorer（模擬）、eval-dashboard。
- **Dependencies**：F.2（模型軌）；應用軌只需 F／CN14／DB03。
- **Acceptance**：預先計算資產有來源與版本紀錄；PyTorch 範例在 CI 以 CPU 小型資料驗證。
- **Effort**：2.5 單位＋活動 2.5。 **Risks**：LLM 領域變化快，課程需標版本與更新日期；真實模型呼叫（T4）不在範圍。

### Phase F.4 — Generative AI & Agents

- **Scope**：AG（25）、GEN（20）。**建議先做 AG**（AI 應用路線的主幹），GEN 次之。
- **活動**：agent-workflow、tool-call-trace、memory-inspector、multi-agent-board、guardrail-sim（預錄 trace）；diffusion-steps、latent-space、multimodal-pipeline（預先產生資產）。
- **Dependencies**：F.3 的 LLM 應用軌。
- **Acceptance**：Agent trace 資料可重現、與教材敘述一致；生成資產的授權與來源紀錄。
- **Effort**：2.25 單位＋活動 2。 **Risks**：MCP 與 Agent 框架變動快；生成資產版權。

### Phase F.5 — AI Engineering & Production

- **Scope**：OPS（20）；活動：deployment-simulator、monitoring-dashboard、cost-calculator、pipeline-diagram。
- **Dependencies**：F.4 的 AG；MLOps 專題課另需 ML（F.2）。
- **Effort**：1 單位＋活動 1。 **Risks**：雲端服務細節易過時 → 以概念與開源工具為主，不綁特定廠商。

### Phase F.6 — RPG 與跨島進度

- **Scope**：NPC 導覽、測驗 EXP、島嶼徽章、課程完成獎勵、挑戰島（APCS Trial、AI Engineering Capstone）、跨島成就；見 [MASTER_PLAN](MULTI_ARCHIPELAGO_MASTER_PLAN.md#5-rpg-學習機制)。
- **Dependencies**：F.0 的進度與條件模型；可與 F.1 之後的任何階段並行（只讀進度）。
- **Acceptance**：獎勵規則有單元測試；**沒有任何學科因 RPG 被硬鎖**；進度資料向後相容（`progress.ts` 版本遷移）。
- **Effort**：1.5 單位。 **Risks**：遊戲化誘導刷題 → 規則限制（見 MASTER_PLAN）。

## 3. 建議順序與並行

```
E.5 ─┬─ F.0 ─┬─ F.1a ─ F.1b ─ F.1c ─ F.1d（資料庫應用島完成）
     │       └─ F.2 ─┬─ F.3（LLM 應用軌先）─ F.4（AG 先）─ F.5
     │               └────────────── F.6（只讀進度，可在 F.1a 之後並行）
```

- CS 與 AI 兩條線在 F.0 之後可以並行，但建議**同時間只開一個教材批次**（E.3／E.4 的經驗：單一寫入者、批次各自驗收）。
- 260 堂不會一次完成；每 20–25 堂為一個可交付的批次，每批獨立驗收、可單獨上線。
