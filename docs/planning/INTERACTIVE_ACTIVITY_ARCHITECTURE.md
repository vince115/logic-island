# 互動學習架構（Interactive Activity Architecture）

> Phase F.0 規劃文件（2026-11-02）。**只是架構提案，沒有實作任何 Playground 或 Runtime。** 每堂課建議的活動見
> [CURRICULUM_320_BLUEPRINT](CURRICULUM_320_BLUEPRINT.md)（`activity` 欄位），島嶼定位見 [ISLAND_TAXONOMY](ISLAND_TAXONOMY.md)。

## 1. 現況（已實作）

| 元件 | 位置 | 性質 |
|---|---|---|
| 課程視覺化（20 種，全部 Implemented） | `src/content/curriculum/registry.ts`、`components/curriculum/visualizations.tsx` | **宣告式步驟**：教材資料中寫好 `steps`，或由模擬器產生 |
| 模擬器 | `content/curriculum/simulate.ts`（資料結構）、`simulate-algorithms.ts`（演算法） | 純函式、可單元測試，跑真正的演算法產生步驟；「自己試試看」用同一套 |
| 互動實驗島六個 Lab | `src/lib/engine.ts`（純快照引擎）、`components/lab.tsx`（播放器） | 輸入 → 快照序列 → 播放；程式碼行對應步驟 |
| 程式練習 | `Exercise`（題目、範例、測資、四語參考解答） | **沒有線上評測**，網站不執行學習者的程式；CI 用 `tests/curriculum-code.test.ts` 驗證參考解答 |
| 觀念測驗、進度 | `Quiz`、`src/lib/progress.ts` | 進度只在瀏覽器 localStorage（版本化） |
| 語法高亮 | `src/lib/highlight`（Shiki，建置時） | 唯讀程式碼；沒有可編輯的程式碼區 |

可重用的核心概念：**「資料 → 確定性步驟 → 播放器」**。凡是能預先算出步驟的互動，都應走這條路，不需要伺服器。

## 2. 活動的分類

每個活動屬於下列一種實作等級（由便宜到昂貴）：

| 等級 | 意義 | 例 | 需要 |
|---|---|---|---|
| **T0 重用** | 用既有 20 種視覺化或 Trace | 索引的 B-tree（tree-traversal）、遞迴的 AST 走訪（recursion-tree） | 只寫教材資料 |
| **T1 前端確定性模擬** | 新的 Activity type，純 TypeScript 模擬器＋播放器，步驟可單元測試 | subnet-calculator、protocol-sequence、gradient-descent、attention-explorer（小矩陣）、mdp-gridworld | 新元件與模擬器 |
| **T2 前端沙箱執行** | 在瀏覽器裡**真的執行**學習者的輸入，但隔離在 Web Worker、不出網路 | sql-playground（SQLite WASM）、Python 小程式（Pyodide）、JavaScript（Worker） | WASM／Worker、資源上限、逾時 |
| **T3 預先計算資產** | 昂貴的模型輸出在建置或離線時產生，前端只播放 | diffusion-steps、token-explorer 的分詞表、embedding-space 的 2D 投影 | 資產產生流程與版本 |
| **T4 後端服務** | 需要伺服器（真實 LLM 呼叫、持久化、帳號、評測） | 真實 prompt-lab、Agent 執行、線上評測、跨裝置進度 | 後端、成本與濫用控管 — **目前不規劃** |

原則：**先 T0／T1，T2 只在學習效果明顯更好時才用，T3 取代 T4，T4 不在 Phase F 範圍。** 沒有任何活動需要在瀏覽器內載入真實的大型模型。

## 3. 各島活動評估

| 島 | 主要活動（藍圖 `activity`） | 等級 | 說明 |
|---|---|---|---|
| DB | sql-playground、erd-builder、query-plan、transaction-timeline、normalization-steps | T2（SQL）、T1 | SQL 用 SQLite WASM 在 Worker 執行，資料庫每次重建、唯讀種子資料；ERD 與正規化為圖形化 T1；索引可重用 tree-traversal（T0） |
| CN | packet-journey、subnet-calculator、protocol-sequence、routing-table | T1 | 全部是確定性模擬，不碰真實網路；不允許從瀏覽器發送任意封包 |
| PL | ast-explorer、compiler-pipeline、type-checker、memory-model、gc-visualizer、concurrency-timeline、scope-chain | T1（部分 T0） | 為教學用的迷你語言寫 tokenizer／parser（純 TS），不解析完整的 C++／Java；memory-model 可延伸既有 function-call 的呼叫堆疊 |
| SA | uml-designer、process-model、architecture-diagram、requirements-board | T1 | 圖形編輯器＋規則檢查（例如關聯多重性）；輸出為 JSON，不需後端 |
| MIS | decision-simulation、kpi-dashboard、case-study-board、process-model | T1 | 小型商業模擬（固定隨機種子）、儀表板；個案討論為文字活動 |
| AIF | search-tree、game-tree、logic-proof、knowledge-graph、probability-explorer、bayes-net、mdp-gridworld | T1（search 可延伸 T0 的 graph-traversal） | 全部可在前端精確計算；A* 重用 A16 的優先佇列模擬器 |
| ML | data-explorer、regression-explorer、classification-explorer、decision-tree-explorer、clustering-explorer、metric-explorer | T1；資料集為 T3 | 小資料集（數百點）在前端以 TS 實作訓練（線性迴歸、k-means、決策樹切分）即可；固定種子確保可測；scikit-learn 程式碼只作為範例，不在瀏覽器跑 |
| DL | nn-forward、gradient-descent、backprop-graph、training-curves、conv-visualizer、sequence-model、attention-explorer | T1；訓練曲線 T3 | 迷你網路（≤ 數百參數）前端實算；大型訓練曲線預先計算；PyTorch 程式為範例 |
| LLM | token-explorer、embedding-space、attention-explorer、sampling-explorer、prompt-lab、rag-explorer、eval-dashboard | T3＋T1 | 分詞以預先產生的 BPE 表在前端執行（T1）；embedding 用預算好的小詞表 2D 投影（T3）；prompt-lab 與 RAG **先做模擬**：固定問題、預錄回應與檢索結果，學習者調整參數（chunk 大小、top-k）看預先計算的差異；真實模型呼叫屬 T4 |
| GEN | diffusion-steps、latent-space、multimodal-pipeline | T3 | 去噪步驟、潛在空間插值都是預先產生的圖片序列；不在瀏覽器生成 |
| AG | agent-workflow、tool-call-trace、memory-inspector、multi-agent-board、guardrail-sim | T1（預錄 trace） | 以「錄好的 Agent 執行軌跡」播放（思考、工具呼叫、結果），學習者可改變工具結果或權限設定看流程分歧；MCP 以模擬伺服器回應示範 |
| OPS | deployment-simulator、monitoring-dashboard、cost-calculator、pipeline-diagram | T1 | 部署、擴縮與監控以事件模擬；成本計算為公式；不連接任何雲端 |

## 4. Activity Type 合約（提案）

延續現有 `VisualizationConfig` 的「判別聯集＋型別化設定」模式，新增一層 `ActivityConfig`，讓課程資料宣告活動，而不是寫死元件：

```ts
/** 課程內一個互動活動。kind 決定元件；config 是該元件的型別化資料。 */
type ActivityConfig =
  | { kind: 'trace'; config: VisualizationConfig }                 // 既有 20 種（T0）
  | { kind: 'sql-playground'; schema: string; seed: string; tasks: SqlTask[] }       // T2
  | { kind: 'subnet-calculator'; presets: string[] }                                   // T1
  | { kind: 'protocol-sequence'; protocol: 'tcp-handshake' | 'tls' | 'dns'; steps: SequenceStep[] }
  | { kind: 'recorded-run'; source: 'agent' | 'llm' | 'diffusion'; asset: AssetRef }  // T3 播放
  // … 每新增一種活動，加一個成員；registry 記錄 label 與 status（planned／implemented）

interface ActivityRegistryEntry {
  label: string;                       // 介面名稱（繁中）
  tier: 'T0' | 'T1' | 'T2' | 'T3' | 'T4';
  status: 'planned' | 'implemented';
  islands: string[];                   // 會用到的島（只作索引）
}
```

- 課程 `visualizationType` 欄位維持相容：既有 60 堂的值都是 T0 的 trace 類型，可以直接映射為 `{ kind: 'trace' }`。
- 每個 T1 模擬器比照 `simulate.ts`：純函式、固定種子、單元測試檢查步驟正確（例如 subnet 計算與標準答案一致）。
- 活動元件以 `next/dynamic` 延遲載入；未實作（`planned`）的活動在課程頁顯示「規劃中」，不阻擋課程上線（目前課程頁對 Planned 視覺化已有此行為）。

## 5. 沙箱執行（T2）

| 項目 | 規劃 |
|---|---|
| 隔離 | Web Worker；不共享 DOM；不提供 `fetch`（以 CSP 與 Worker 內移除網路 API 雙重保證） |
| 資源 | 逾時（例如 2 秒）、輸出大小上限、記憶體上限（WASM heap 上限）；超出時終止 Worker 並說明 |
| SQL | SQLite WASM（例如 sql.js）；每次執行從種子重建、唯讀種子；**需要新增依賴，屆時另行批准** |
| Python | Pyodide 體積大（數 MB），只在 ML／DL 練習「按下執行」時才延遲載入；也可先不做，維持「在自己電腦執行」 |
| 評測 | 仍是「顯示預期輸出、讓學習者比對」；若要自動比對，只比對本地執行結果，不上傳程式 |

## 6. 需要後端的部分（T4，不在 Phase F）

真實 LLM／Agent 呼叫、跨裝置進度、帳號、線上評測、排行榜都需要後端與成本／濫用控管（API 金鑰不得出現在前端、速率限制、內容審查）。Phase F 以 T1／T3 模擬達成學習目標；若產品決定要做 T4，需另立階段並評估：託管位置、每位使用者成本上限、隱私（輸入內容不保存）、失敗時的模擬後備。

## 7. 安全、成本與效能

- **安全**：T2 不執行任意網路請求；預錄的 Agent／LLM trace 以資料檔發佈，不含祕密；prompt injection 等攻擊教學以模擬呈現，不連接真實工具。
- **成本**：T0–T3 沒有執行期成本；T3 的資產產生在離線進行，需記錄來源與授權（比照 `docs/assets` 的 provenance 做法）。
- **效能**：每種活動獨立 chunk、延遲載入；課程頁靜態產生（現況）；Pyodide／SQLite WASM 只在需要時下載；手機以 T1 為主，T2 在手機上提示可能較慢。
- **可測試性**：T1 模擬器與 T3 資產都要有單元測試（步驟正確、資產版本一致）；元件以 E2E 驗證可操作、無水平溢出。

## 8. 實驗島的角色

互動實驗島（`/learn`）是**跨學科的工具島**：

- 現有六個 Lab 保持原樣。
- 未來每座學科島可以挑選 1–2 個代表性活動（例如 DB 的 SQL Playground、CN 的 Subnet Calculator、LLM 的 Token Explorer）以「自由練習」形式加入實驗島，依學科分組；課程內的同一活動帶有教學步驟與題目。
- 實驗島不給學科編號，見 [WORLD_EXPANSION_ARCHITECTURE](WORLD_EXPANSION_ARCHITECTURE.md#6-航行指南)。
