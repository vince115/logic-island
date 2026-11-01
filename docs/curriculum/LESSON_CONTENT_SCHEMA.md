# 課程資料結構（Lesson Content Schema）

> Phase E.1，E.2 擴充（2026-10-31：motivation、範例與測驗下限、共用 trace 與兩種新視覺化），E.3 擴充（2026-10-31：資料結構面板、模擬器、自己試試、結構比較），E.4 擴充（2026-10-31：演算法模擬器、指標與範圍、表格面板、用自己的輸入執行演算法、貪心選擇）。型別與驗證都在 `src/content/curriculum/schema.ts`；`validateCurriculum()` 是唯一的規則來源，`tests/curriculum.test.ts` 要求它對實際資料回傳空陣列。本文件說明欄位與規則，與程式不一致時以程式為準並更新本文件。

## 1. 檔案

| 檔案 | 內容 |
|---|---|
| `src/content/curriculum/schema.ts` | 型別、常數（語言、島嶼、難度、APCS、狀態、視覺化類型）、`validateCurriculum`、條件分支的比較函式 |
| `src/content/curriculum/lessons.ts` | 60 堂課的大綱（`LessonMeta`），依建議順序；lessonId 由島嶼與位置產生 |
| `src/content/curriculum/content/F01.ts` … | 完整課程的內容（`LessonContent`），一堂一檔 |
| `src/content/curriculum/simulate.ts` | E.3：資料結構的模擬器。教材列出操作，模擬器實際執行並產生 `TraceStep[]`（堆疊／佇列／雙端佇列、動態陣列、單向鏈結串列、鏈結法雜湊、二元樹走訪、BST、最小堆積、圖、並查集），步驟因此不會與結構的行為不一致；`tests/simulate.test.ts` 檢查每一種 |
| `src/content/curriculum/simulate-algorithms.ts` | E.4：演算法的模擬器（線性搜尋、二分搜尋與氣泡排序沿用 `src/lib/engine.ts` 的互動實驗引擎、lower bound、選擇／插入／合併／快速排序、雙指標、固定與可變視窗、前綴和、`CallTracer` 遞迴樹與回溯、活動選擇與貪心找零、BFS、DFS、Dijkstra、DP 表格、0/1 背包）；`tests/simulate-algorithms.test.ts` 以參考實作、小輸入窮舉與固定種子的亂數輸入檢查每一個 |
| `src/content/curriculum/registry.ts` | 三座島的資料、視覺化類型的狀態（implemented／planned／not-available）、難度與 APCS 的中文標籤 |
| `src/content/curriculum/index.ts` | 組合成 `curriculum`，提供 `getLessonBySlug`、`getContent`、`neighbours` |
| `src/lib/progress.ts` | 學習進度的資料格式與規則（與教材分開） |

UI（`src/components/curriculum/`）只讀這些資料；60 堂教材不寫在任何 React 元件裡。既有六份互動教材仍以 `src/content/courses.ts` 為來源，課程以 `labs` 欄位連結它們。

## 2. 課程大綱 `LessonMeta`（60 堂都有）

| 欄位 | 型別 | 規則 |
|---|---|---|
| `lessonId` | `F01`…`F20`、`D01`…`D20`、`A01`…`A20` | 唯一；各島 20 堂、依序；穩定識別碼（進度以它儲存，不可重新編號） |
| `islandId` | `foundations`／`structures`／`algorithms` | 與 lessonId 字首一致 |
| `slug` | kebab-case 字串 | 60 堂唯一；網址 `/curriculum/<slug>` |
| `title`、`summary` | 字串 | 不可空白 |
| `learningObjectives` | 字串陣列 | 至少 3 項（規劃中的課也一樣） |
| `difficulty` | `Beginner`／`Intermediate`／`Advanced` | 定義見課綱規格 §2.1 |
| `estimatedMinutes` | 整數 | 10～120 |
| `prerequisites` | lessonId 陣列 | 必須存在、不重複，且在建議順序中排在前面（保證無循環、可解鎖） |
| `concepts` | 字串陣列 | 至少 1 項 |
| `apcsRelevance` | `concept`／`implementation`／`foundation`／`none` 的陣列 | 至少 1 項；`none` 只能單獨出現；不得寫官方題號或成績保證 |
| `supportedLanguages` | `Language[]` | 必須剛好是 C++、Python、Java |
| `visualizationType` | 視覺化類型 | 必須在 registry 中 |
| `lessonStatus` | `complete`／`planned` | 見 §3 |
| `version` | semver | planned 為 0.x；complete 為 1.0.0 以上 |
| `labs` | 既有互動教材 slug（選填） | 必須是 `src/content/courses.ts` 的六份之一 |

## 3. 狀態與內容一致

- `planned`：**不可**有內容檔。頁面只顯示大綱並標示規劃中。
- `complete`：**必須**有內容檔，且通過 §4 的完整性檢查。
- 有內容卻標 planned、或標 complete 卻沒有內容，驗證都會失敗，所以未完成的課程無法偽裝成已完成。

## 4. 完整課程內容 `LessonContent`

| 欄位 | 規則 |
|---|---|
| `motivation` | 必填：為什麼要學這個主題、學會之後能做什麼（E.2 起） |
| `sections` | 至少 3 段；每段 `id`、`title`、`blocks`（不可空） |
| `blocks` | `p`（段落）、`list`（可 `ordered`）、`callout`（`tip`／`warning`／`note`）、`table`（每列欄數與表頭相同）、`example`（引用範例 id，必須存在）。文字中以反引號標示行內程式碼 |
| `examples` | 至少 3 個（E.2 起；E.1 為 1 個）；每個都有三語 `code`、預期 `output`（`stdin` 選填）；語言之間輸出不同時用 `outputByLanguage`；每個範例都要在某一段中被引用 |
| `quiz` | 至少 4 題（E.2 起；E.1 為 3 題）；選項互不相同、至少 2 個；`answer` 是選項索引；`explanation` 不可空；`code` 片段選填（單一語言） |
| `exercises` | 至少 1 題；三語 `solution`；`samples` 至少 1 組；`tests` 至少各有 1 組 `normal` 與 `edge`；有 `error` 測資，或寫 `errorPolicy` 說明為何不需要；`starter`（選填）也要三語；`judge` 必須是 `'none'`（E.1 沒有線上評測） |
| `visualization` | 課程的 `visualizationType` 不是 `none` 時必須有、`kind` 必須相同，且該類型必須是 implemented；`none` 時不可有 |

所有 section、example、quiz、exercise 的 id 在同一堂課內不可重複（section id 也是頁面錨點；section 與 example 不要取同一個名字）。跨課程時以 `lessonId` 加上 id 識別，所以不同課程可以都有 `q1`、`e1`。

## 5. 視覺化設定

### 5.1 共用 trace（`variable-state`、`loop-execution`、`array-index`、`function-call`、`recursion-trace`，E.3 起加上 `stack-queue`、`linked-list`、`hash-table`、`tree-traversal`、`heap`、`graph-traversal`、`disjoint-set`）

十六種類型共用同一個設定與同一個元件（`Trace`）：`{ kind, title, language, code, steps[], playground?, tryIt? }`（E.4 加上 `sorting-steps`、`recursion-tree`、`dp-table`、`greedy-choice`）。每一步 `TraceStep` 描述「執行完 `line` 這一行之後」的狀態，各面板都是選填：

| 欄位 | 內容 |
|---|---|
| `line`、`note` | 剛執行的行號（必須在 `code` 範圍內）與文字說明（E.3 起可用反引號標示行內程式碼；不支援粗體） |
| `vars` | 變數名稱 → 值（字串值加引號） |
| `expected` | 變數的預期值；與實際不同時以文字標出「應為 …」（除錯用，F17） |
| `output` | 到目前為止的全部輸出 |
| `loops` | 正在執行的迴圈，由外到內：`label`、第幾輪 `iteration`、剛檢查的 `condition`、`holds`（true／false／null 未檢查） |
| `arrays` | 陣列或字串：`name`、`cells`（一維字串陣列，或二維「列的陣列」）、`marks`（`at` 為索引或 `[列, 行]`，`kind` 為 read／write／bad）。read／write 的位置必須在範圍內；越界一律標 bad，頁面會寫出合法範圍 |
| `frames` | 呼叫堆疊，由舊到新（最後一個正在執行）：`name`、`vars`、`returns`（回傳值） |
| `arrays[].capacity` | E.3：動態陣列的容量；`cells` 之後到容量為止的格子顯示為「未使用」 |
| `containers` | E.3：堆疊、佇列、雙端佇列：`name`、`kind`（stack／queue／deque）、`items`（由底部／前端到頂端／尾端）、`marks`、`underflow`（對空結構讀取或移除時為 true，頁面以文字說明） |
| `list` | E.3：單向鏈結串列：`nodes`（從 head 起）、`marks`、`pointers`（名稱 → 節點位置或 `null`；head、cur、prev 等），頁面顯示 next 與結尾的 null |
| `buckets` | E.3：鏈結法雜湊表：每個桶一條串列；`marks` 以 `bucket`（與選填的 `index`）指出讀取、寫入、找到或移除 |
| `tree` | E.3：樹或森林：`nodes`（`id`、`label`，二元樹用 `left`／`right`，一般樹用 `children`）、`roots`、`marks`。頁面以 SVG 畫在可捲動的區塊內，另有給螢幕閱讀器的文字大綱 |
| `graph` | E.3：圖：`nodes`、`edges`（`from`、`to`、選填 `weight`）、`directed`、`marks`（節點或邊的索引）、`show`（`list`／`matrix`）。頁面同時列出鄰接串列與鄰接矩陣的文字，作為圖形的文字替代 |
| `dsu` | E.3：並查集的 `parent` 與 `size`；頁面顯示表格、集合清單與 parent 森林 |
| `arrays[].pointers` | E.4：命名的索引（lo、mid、hi、i、j、left、right…），標在格子下方；−1 與長度（剛好在陣列外）以文字列在陣列後 |
| `arrays[].range` | E.4：仍在考慮的範圍（搜尋範圍、視窗、分割中的區段），`from..to` 含兩端，`to = from − 1` 表示空的；格子下方有底線，標題寫出範圍 |
| `arrays[].rowLabels`／`colLabels` | E.4：二維表格（DP 表）的列與行標籤，取代單純的索引 |
| `table` | E.4：有表頭的表格（距離與父節點、貪心的候選、查詢），`marks` 標示整列或單一格，並以文字寫出 |

標記 `marks[].kind`：`read`（讀取）、`write`（寫入）、`bad`（越界；在陣列內的格子顯示為「不可行」，例如撞牆）、`removed`（已移除）、`visited`（已拜訪）、`found`（找到）、`current`（目前）、`pending`（待處理，E.4：已發現但還在佇列中、等待中的遞迴呼叫）。每個標記都以文字顯示，不只靠顏色。

驗證：每種類型至少有一步顯示它的面板（variable-state 有 `vars`、loop-execution 有 `loops`、array-index 有 `arrays`、function-call 有 `frames`、recursion-trace 至少一步有兩層以上的 `frames`；E.3：stack-queue 有 `containers`、linked-list 有 `list`、hash-table 有 `buckets`、tree-traversal 有 `tree`、heap 同時有 `tree` 與 `arrays`、graph-traversal 有 `graph`、disjoint-set 有 `dsu`）。另外檢查每一步的內部一致性：標記與指標在範圍內、樹的子節點與根存在且 id 不重複、圖的邊與標記指向存在的節點、並查集的 parent 合法。

`tryIt`（E.4，選填）：用學習者自己的輸入執行這一課的演算法，並逐步顯示（重來／上一步／下一步、方向鍵）。三種形式：陣列演算法 `{ algorithm, initial, target? }`（輸入最多 `TRY_IT_LIMIT` = 10 個 −99～99 的整數；二分搜尋、lower bound、雙指標要求已排序，最短視窗要求非負，否則以文字說明原因而不執行）；圖 `{ algorithm: 'bfs' | 'dfs' | 'dijkstra', nodes, edges, directed, start }`（學習者從選單選起點；Dijkstra 的權重必須非負）；背包 `{ algorithm: 'knapsack', items, capacity }`（容量 0～12）。驗證器檢查初始值、排序與權重。

`playground`（E.3，選填）：`{ structure, buckets?, size? }`，structure 為 stack／queue／deque／dynamic-array／list／hash-set／bst／heap／dsu。頁面在逐步追蹤下方提供「自己試試」：學習者輸入 0～99 的整數（並查集為 0～size−1 的編號）並執行操作，最多 `PLAYGROUND_LIMIT`（10）個元素、40 個操作；每個操作用與教材步驟相同的模擬器執行並列出過程。hash-set 需要 2～13 個桶，dsu 需要 2～10 個元素。

### 5.2 其他類型

| kind | 欄位 | 規則 |
|---|---|---|
| `conditional-branch` | `title`、`variable`、`min`、`max`、`initial`、`branches[]`（`label`、`when: { any?, all? }`、`result`）、`otherwise` | 至少一個分支；`initial` 在範圍內；比較 `{ op, value, mod? }`（`mod` 表示先取餘數，採數學上的非負餘數），不使用 `eval`。頁面會逐一列出複合條件中每個比較的 true／false，以及被短路略過的部分 |
| `complexity` | `title`、`min`、`max`、`initial`、`models[]`（`model` 為 `1`／`log n`／`n`／`n log n`／`n^2`，`example` 說明） | 至少兩個模型；`min ≥ 1`；頁面標示為「公式計算的操作次數（示意模型），不是實測時間」 |
| `challenge-stages` | `title`、`stages[]`（`title`、`concepts`（lessonId）、`goal`、`detail`） | 至少兩個階段；`concepts` 必須是課程 ID |
| `greedy-choice` | E.4：共用 trace，步驟帶 `table`（候選、狀態與原因） | 至少一步有 `table` |
| `ds-comparison` | `title`、`operations[]`（`id`、`label`）、`structures[]`（`name`、`note`、`costs`：每個操作的 `{ cost, good }`） | E.3；至少兩個操作與兩種結構，每種結構都要有每個操作的成本。學習者勾選問題需要的操作，表格以文字標示「適合／較慢」，並列出所有操作都適合的結構 |

視覺化類型的狀態在 `registry.ts`。Implemented：`variable-state`、`conditional-branch`、`loop-execution`、`array-index`、`function-call`、`recursion-trace`、`complexity`、`challenge-stages`，E.3 加上 `stack-queue`、`linked-list`、`hash-table`、`tree-traversal`、`heap`、`graph-traversal`、`disjoint-set`、`ds-comparison`，E.4 加上 `sorting-steps`、`recursion-tree`、`dp-table`、`greedy-choice`。目前沒有 Planned 的類型；`planned` 狀態仍保留給之後新增的類型。Not Available：`none`。所有狀態都以文字呈現，不只靠顏色。

## 6. 學習進度（`src/lib/progress.ts`）

- 儲存於瀏覽器 `localStorage` 的 `logic-island.progress`：`{ version: 1, lessons: { [lessonId]: { startedAt, readAt?, quiz?: { correct, total, at }, completedAt? } } }`。
- 狀態：沒有紀錄＝Not Started；有 `startedAt`＝In Progress；有 `completedAt`＝Completed。
- 完成條件：確認讀完（`readAt`）**且**觀念測驗最佳成績答對至少 ⌈題數 × 2/3⌉ 題；完成後不會退回。程式練習沒有評測，不列入。
- 讀取：無資料＝空白；版本 1＝保留（只丟掉格式錯誤的單筆）；無法解析或沒有版本＝先把原文存到 `logic-island.progress.backup`（只存一次）再重新開始；**較新版本＝唯讀，不覆寫**。
- 之後的格式升級：版本號加一，在 `parse` 加入從舊版轉換的步驟，並保留上述「不明資料先備份、新版不覆寫」的規則。

## 7. 驗證項目一覽

Schema（欄位、型別、範圍）、Unique ID（lessonId、slug、課程內 id）、Prerequisite（存在、不重複、排在前面）、Language Coverage（三語一致；完整課程每段程式三語齊全）、Asset Reference（視覺化類型、既有互動教材、範例引用）、Content Completeness（狀態與內容一致、測驗與練習的最低數量、測資類型、視覺化已實作）。另外 `tests/curriculum-code.test.ts` 實際執行每個範例與參考解答。
