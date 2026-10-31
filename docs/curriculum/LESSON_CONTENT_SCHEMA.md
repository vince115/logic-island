# 課程資料結構（Lesson Content Schema）

> Phase E.1，E.2 擴充（2026-10-31：motivation、範例與測驗下限、共用 trace 與兩種新視覺化）。型別與驗證都在 `src/content/curriculum/schema.ts`；`validateCurriculum()` 是唯一的規則來源，`tests/curriculum.test.ts` 要求它對實際資料回傳空陣列。本文件說明欄位與規則，與程式不一致時以程式為準並更新本文件。

## 1. 檔案

| 檔案 | 內容 |
|---|---|
| `src/content/curriculum/schema.ts` | 型別、常數（語言、島嶼、難度、APCS、狀態、視覺化類型）、`validateCurriculum`、條件分支的比較函式 |
| `src/content/curriculum/lessons.ts` | 60 堂課的大綱（`LessonMeta`），依建議順序；lessonId 由島嶼與位置產生 |
| `src/content/curriculum/content/F01.ts` … | 完整課程的內容（`LessonContent`），一堂一檔 |
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

### 5.1 共用 trace（`variable-state`、`loop-execution`、`array-index`、`function-call`、`recursion-trace`）

五種類型共用同一個設定與同一個元件（`Trace`）：`{ kind, title, language, code, steps[] }`。每一步 `TraceStep` 描述「執行完 `line` 這一行之後」的狀態，各面板都是選填：

| 欄位 | 內容 |
|---|---|
| `line`、`note` | 剛執行的行號（必須在 `code` 範圍內）與文字說明 |
| `vars` | 變數名稱 → 值（字串值加引號） |
| `expected` | 變數的預期值；與實際不同時以文字標出「應為 …」（除錯用，F17） |
| `output` | 到目前為止的全部輸出 |
| `loops` | 正在執行的迴圈，由外到內：`label`、第幾輪 `iteration`、剛檢查的 `condition`、`holds`（true／false／null 未檢查） |
| `arrays` | 陣列或字串：`name`、`cells`（一維字串陣列，或二維「列的陣列」）、`marks`（`at` 為索引或 `[列, 行]`，`kind` 為 read／write／bad）。read／write 的位置必須在範圍內；越界一律標 bad，頁面會寫出合法範圍 |
| `frames` | 呼叫堆疊，由舊到新（最後一個正在執行）：`name`、`vars`、`returns`（回傳值） |

驗證：每種類型至少有一步顯示它的面板（variable-state 有 `vars`、loop-execution 有 `loops`、array-index 有 `arrays`、function-call 有 `frames`、recursion-trace 至少一步有兩層以上的 `frames`）。

### 5.2 其他類型

| kind | 欄位 | 規則 |
|---|---|---|
| `conditional-branch` | `title`、`variable`、`min`、`max`、`initial`、`branches[]`（`label`、`when: { any?, all? }`、`result`）、`otherwise` | 至少一個分支；`initial` 在範圍內；比較 `{ op, value, mod? }`（`mod` 表示先取餘數，採數學上的非負餘數），不使用 `eval`。頁面會逐一列出複合條件中每個比較的 true／false，以及被短路略過的部分 |
| `complexity` | `title`、`min`、`max`、`initial`、`models[]`（`model` 為 `1`／`log n`／`n`／`n log n`／`n^2`，`example` 說明） | 至少兩個模型；`min ≥ 1`；頁面標示為「公式計算的操作次數（示意模型），不是實測時間」 |
| `challenge-stages` | `title`、`stages[]`（`title`、`concepts`（lessonId）、`goal`、`detail`） | 至少兩個階段；`concepts` 必須是課程 ID |

視覺化類型的狀態在 `registry.ts`。Implemented：`variable-state`、`conditional-branch`、`loop-execution`、`array-index`、`function-call`、`recursion-trace`、`complexity`、`challenge-stages`。Planned：`stack-queue`、`tree-traversal`、`sorting-steps`、`graph-traversal`、`linked-list`、`hash-table`、`heap`、`disjoint-set`、`recursion-tree`、`dp-table`。Not Available：`none`。所有狀態都以文字呈現，不只靠顏色。

## 6. 學習進度（`src/lib/progress.ts`）

- 儲存於瀏覽器 `localStorage` 的 `logic-island.progress`：`{ version: 1, lessons: { [lessonId]: { startedAt, readAt?, quiz?: { correct, total, at }, completedAt? } } }`。
- 狀態：沒有紀錄＝Not Started；有 `startedAt`＝In Progress；有 `completedAt`＝Completed。
- 完成條件：確認讀完（`readAt`）**且**觀念測驗最佳成績答對至少 ⌈題數 × 2/3⌉ 題；完成後不會退回。程式練習沒有評測，不列入。
- 讀取：無資料＝空白；版本 1＝保留（只丟掉格式錯誤的單筆）；無法解析或沒有版本＝先把原文存到 `logic-island.progress.backup`（只存一次）再重新開始；**較新版本＝唯讀，不覆寫**。
- 之後的格式升級：版本號加一，在 `parse` 加入從舊版轉換的步驟，並保留上述「不明資料先備份、新版不覆寫」的規則。

## 7. 驗證項目一覽

Schema（欄位、型別、範圍）、Unique ID（lessonId、slug、課程內 id）、Prerequisite（存在、不重複、排在前面）、Language Coverage（三語一致；完整課程每段程式三語齊全）、Asset Reference（視覺化類型、既有互動教材、範例引用）、Content Completeness（狀態與內容一致、測驗與練習的最低數量、測資類型、視覺化已實作）。另外 `tests/curriculum-code.test.ts` 實際執行每個範例與參考解答。
