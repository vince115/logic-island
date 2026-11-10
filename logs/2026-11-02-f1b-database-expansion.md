# 2026-11-02 Phase F.1b 資料庫應用島擴充：DB06–DB10、課程能力宣告與島內導覽

## 指示範圍

使用者授權 Phase F.1b：DB06–DB10 五堂正式教材、重用並按需擴充 SQL Playground、與教材相符的練習與驗證、修正跨島「下一堂」語意、更新 Registry／測試／交接文件；分批本地 commit；禁止 Push、Merge、Deploy；完成後停止，不開始 DB11–DB20。中途使用者要求恢復被中斷的工作並補上「明確的課程能力宣告」、DB08 回歸測試與完整驗證。

## 起點與工作狀態

- `phase-d/basics-glb`，HEAD `a75e202`，工作目錄只有未追蹤的 `.claude/`；沒有其他工作階段在修改本 repository；依賴與 lockfile 未變（`sql.js@1.14.2` 已在 F.1a 安裝）。
- 教材由五位撰寫 agent 各寫一個檔案（私有副本、單一寫入者），主線整合、重新驗證並逐題校對；撰寫 agent 沒有碰 repository（DB10 的撰寫 agent 曾誤把一份 `lessons.ts` 備份放到 `/tmp/x/`，已自行刪除，與 repository 無關）。

## Batch 0：藍圖稽核與差距

| ID | 藍圖活動／練習類型 | 現有能力 | 最小擴充 |
|---|---|---|---|
| DB06 子查詢、CTE 與視窗函式 | sql-playground／sql | runtime 已支援（SQLite 3.49 有視窗函式與遞迴 CTE） | A：只加資料集 `company`／`company-b`（部門、員工、主管階層、同薪） |
| DB07 DDL、DML 與約束 | sql-playground／sql | 判定只比對最後一個查詢結果，無法判定建表與修改資料 | B：檢查敘述（probes）判定；資料集 `empty` |
| DB08 ER 模型 | erd-builder／diagram | 沒有 ER 活動 | C：新活動 erd-builder（T1） |
| DB09 ER 圖到資料表 | erd-builder／design | 同上；DDL 練習需要 B | ER 圖顯示＋ DDL 練習（probes） |
| DB10 正規化 | normalization-steps／design | 沒有正規化活動 | C：新活動 normalization-steps（T1）；資料集 `registrar`／`registrar-b` |

導覽問題：`neighbours()` 依全域順序取前後課，所以 F20→D01、D20→A01、A20→DB01 都被當成「下一堂」。

## DB06–DB10 完成狀態（數字取自整合後的內容）

| ID | 課程 | 能力 | 小節／範例（SQL／ER／正規化）／測驗／練習 | 練習場資料 |
|---|---|---|---|---|
| DB06 | 子查詢、CTE 與視窗函式 | `sql` | 8／13／7／3 查詢 | `company` |
| DB07 | 建立與修改資料：DDL、DML 與約束 | `sql` | 8／9／7／3 檢查敘述 | `shop`（練習另用 `empty`） |
| DB08 | ER 模型 | `er-diagram` | 8／5 ER 圖／7／3 ER 建構 | 無（沒有 SQL） |
| DB09 | 從 ER 圖到資料表綱要 | `sql`＋`er-diagram` | 7／7＋5／7／3 檢查敘述 | `empty` |
| DB10 | 正規化 | `sql`＋`normalization` | 8／9＋2／7／1 查詢＋1 候選鍵＋1 分解 | `registrar` |

標題、slug、學習目標、核心概念、難度、必修與建議先修、活動都讀自藍圖（`fromBlueprint`），沒有改寫主題或順序。DB06 結尾就是藍圖的成果句「每個部門薪資前三名」（同薪規則在題目中寫明）；DB07 的練習全部以檢查敘述判定；DB08 以 crow's foot 畫圖並在文字對照 Chen 表示法，說明 (min, max) 表示法位置相反；DB09 每張 ER 圖緊接它對應的 DDL；DB10 用 SQL 在資料上檢驗函數相依（只能推翻、不能證明），頁面上的鍵與正規形式全部由引擎計算。

SQL 標準與 SQLite 的差異都標明為 SQLite 行為：型別親和性與 STRICT、外鍵預設關閉、`INTEGER PRIMARY KEY` 是 rowid、非 `INTEGER PRIMARY KEY` 的主鍵欄位可存 NULL、ALTER TABLE 的限制、`changes()` 不計外鍵連帶修改、沒有 `> ALL`／`= ANY`、純量子查詢多列時取第一列、沒有 `EXCEPT ALL` 與 materialized view 等；寫到其他 DBMS 時只寫確定的事。

## 內容驗證

- `tests/curriculum-sql.test.ts`（真正的 SQLite）：每個 SQL 範例的結果與頁面完全相同、預設查詢不出錯、參考解答與每個替代寫法在所有資料集通過、每個常見錯誤至少一組不通過、隱藏資料（或隱藏檢查敘述）能區分硬寫的答案。
- `tests/curriculum-db.test.ts`（頁面同一套引擎）：ER 參考答案通過 `checkRoles`、`accept` 的其他角色通過、每個常見錯誤不通過、模型結構正確（每個實體有鍵、弱實體有識別關係）；正規化的候選鍵答案等於引擎算出的結果、分解答案與替代分解通過、每個錯誤分解被拒絕；F.1b 每堂 6–8 節、至少 5 個範例、7 題測驗、3 道練習。
- 測驗：五堂 35 題由主線逐題對照資料校對；正式整合後再匯出一次，與校對版本逐字相同；其中 14 個「預測結果」型題目的 SQL 另外在真正的 SQLite 上執行，結果全部與答案一致（例如 `NOT IN` 遇到 NULL 回傳 0 列、`changes()` 在連帶刪除後是 1、部分 UPDATE 後同系有 3 種辦公室）。
- 重設與隔離：每個練習場自己的 Worker 與資料庫；E2E 確認一堂課刪除資料不影響另一堂、重設後與原始資料相同。

## SQL Playground 變更（重用 F.1a，沒有第二套 runtime）

- 檢查敘述（`SqlExercise.probes`，`src/lib/sql/engine.ts`）：學習者的 SQL 與參考解答各自在全新資料上執行後，依序執行檢查敘述，比對結果表、被接受或被拒絕（不比對約束種類）。可見的檢查敘述列在練習中；隱藏的只在隱藏檢查執行，訊息不寫出敘述。
- 資料集：`company`、`company-b`、`empty`、`registrar`、`registrar-b`。
- 限制不變：3 秒、200 列、20 個敘述、4000 字元、約 8 MB；Worker 隔離；沒有後端、沒有外部連線。

## 新活動

- erd-builder（T1，`src/lib/er`、`er-diagram.tsx`、`er-builder.tsx`）：
  - ER 圖以 SVG 畫出（crow's foot：鍵 PK、弱實體雙框與部分鍵 PK*、多值 `{ }`、關係上的屬性、識別關係粗線、遞迴關係），下方有同樣內容的文字版。
  - 練習中，學習者替情境的每個詞語選角色（實體［弱］、屬性［屬於誰、鍵、多值］、關係［哪兩個實體、兩端各對應幾個］、不需要建模），圖會隨選擇即時畫出。
  - 檢查依意義比對：關係反向畫、兩端數量對調仍算正確。錯的詞語附提示，但不給答案；「全部清除」可以重設。
  - 全部是原生、有標籤的表單元件，可以只用鍵盤操作。
  - 限制：不是自由拖拉的繪圖器，版面由網格自動排列；只畫二元關係，沒有三元關係。
- normalization-steps（T1，`src/lib/normalization`、`normalization-view.tsx`、`normalization-workbench.tsx`）：
  - 引擎計算屬性閉包、候選鍵、投影相依、最高正規形式（2NF／3NF／BCNF，並說明擋住下一級的相依）、無損（chase）與相依保留。
  - 工作台：閉包計算器，以及可即時分析的分解編輯器，可以「回到原始的表」重設。
  - 練習：找候選鍵、分解到 3NF 或 BCNF，依條件判定，任何符合條件的答案都通過。
  - 限制：1NF 只在文字中教（引擎假設值都是原子值）；最多 10 個屬性。
- 兩個活動與 SQL 練習場一樣，只在用到它們的課程頁載入。

## 課程能力宣告（Explicit Lesson Capabilities）

原本以「沒有 `queryLanguage`」推測是程式課，DB08（只有 ER 模型）因此被當成程式課。改為每堂課明確宣告 `capabilities`：

- F、D、A 的 60 堂：`program-code`；
- DB01–DB07：`sql`；DB08：`er-diagram`；DB09：`sql`＋`er-diagram`；DB10：`sql`＋`normalization`。

選擇「多能力」而不是「單一主要類型」：DB09、DB10 同時需要 SQL 練習場與 ER／正規化內容，各有自己的內容、頁面區塊與檢查。

驗證器把每種能力綁定它的內容：
- `program-code` ⇔ 有 C++／Java／Python，且它單獨存在；
- `sql` ⇔ `queryLanguage: 'SQL'` 且有 `content.sql`；
- `er-diagram` ⇔ `content.er`；
- `normalization` ⇔ `content.normalization`；
- `activity` 必須屬於已宣告的能力。

頁面與測試都以 `hasCapability` 選擇（程式碼測試只跑 `program-code`，SQL 測試只跑 `sql`）。日後 UML、網路、AI 課程新增能力即可。DB08 回歸測試確認它不是程式課、沒有 SQL，宣告錯的能力會被抓到。E2E 確認 DB08 沒有程式分頁與 SQL 練習場、不下載 SQLite、測驗與進度正常。

## 導覽規則

- 上一堂／下一堂只在同一座島內，依目錄（catalog）的島內順序決定，UI 沒有寫死任何 ID 範圍（`src/content/world/navigation.ts`）。
- 下一堂若是規劃中的課，只顯示文字、不給連結，例如 DB10 →「DB11（規劃中，尚未開放）」，並顯示「後續課程規劃中」。
- 島的最後一堂（F20、D20、A20）顯示「本島課程已到最後一堂」與「返回○○島課綱」，另外列出：
  - 包含本課的學習路線，以及每條路線上本課之後第一堂已開放的課（明確標成路線的下一步）；
  - 這座島的橋通往哪些島。
- A20 不再連到 DB01；A20 是路線 A 的最後一堂。
- Lesson ID、slug 與進度 key 都不變。

## Registry 與學習路線

- 320 堂；完整 70、規劃 250；15 座學科島；6 條路線。
- 資料庫應用島 `available`：DB01–DB10 開放，DB11–DB20 規劃中。
- 藍圖不需修改：是否發布仍只由課綱決定。
- 活動：`sql-playground`（T2）、`erd-builder`（T1）、`normalization-steps`（T1）為 implemented，其餘規劃中。

| 路線 | 已開放／總數 | 路線上的 DB 課（已開放） |
|---|---|---|
| A APCS 與資訊基礎 | 60／60 | 無 |
| B 軟體工程 | 36／86 | 20（DB01–DB10） |
| C 網路與系統 | 28／54 | 9（DB01、02、03、05、07） |
| D 企業資訊系統 | 32／84 | 20（DB01–DB10） |
| E AI 研究 | 32／142 | 無 |
| F AI 應用工程 | 16／89 | 5（DB01、02、03、07） |

只有路線 A 可以完整學完；先修與建議先修分開，沒有混用。

## 測試結果（隔離副本，最終程式碼 = HEAD）

| 檢查 | 結果 |
|---|---|
| tsc／ESLint | exit 0／exit 0 |
| Vitest（全部，JDK 在 PATH，`< /dev/null`） | 1450 passed／0 failed／0 skipped（34 個檔案） |
| Build | 成功，87 個靜態頁（F.1a 82；多 DB06–DB10） |
| E2E：資料庫活動＋SQL（desktop＋mobile） | 20 passed、0 skipped |
| E2E 全套（desktop＋mobile） | 358 passed／39 skipped／3 failed：3 項皆為既有 P1-11（`player.spec.ts`），39 項 skipped 與 F.1a 相同；沒有新的失敗 |
| 受保護路徑（`git diff a75e202..HEAD`） | `src/components/islands`（3D 場景、GLB、相機）、`src/lib/islands`、`public`、`src/app/islands`、`courses.ts`、`lab.tsx`、`engine.ts`、`progress.ts`、60 堂程式教材內容檔、藍圖（`docs/planning/data`、`CURRICULUM_320_BLUEPRINT.md`）：0 行差異（`PHASE_F_ROADMAP.md` 只在文件 commit 加上 F.1b 註記） |

E2E 新增或更新：

- `e2e/db-activities.spec.ts`：
  - 檢查敘述練習；
  - ER 建構：依選擇畫圖與文字版、正確／錯誤判定與提示、全部清除、鍵盤操作；
  - 正規化：候選鍵與分解練習、工作台閉包與重設；
  - DB08 回歸；
  - 練習場隔離與重設。
- `e2e/curriculum.spec.ts` 與 `e2e/sql.spec.ts`：島內導覽，以及最後一堂的路線與橋。

`world-catalog` 測試的失敗是測試資料過時：它把 DB10 當成「規劃中的課」，F.1b 發布 DB10 後，驗證器正確地回報了另一種錯誤。現在改從 registry 取第一個規劃中的資料庫課程（DB11），並先斷言它真的是規劃中、沒有頁面；也補上反方向的檢查：已發布的課沒有頁面會被抓到。驗證器本身沒有缺陷。

## Bundle（gzip，頁面自己載入的 JS；同一方法量 F.1a `a75e202` 與 F.1b HEAD）

| 頁面 | F.1a | F.1b | 載入的活動程式 |
|---|---:|---:|---|
| 程式課程（F01、A20） | 212,051 B | 212,203 B（+152 B） | 無 |
| SQL 課程（DB01、DB05–DB07、DB09） | 220,077 B | 222,461 B（+2.4 KB，SQL 檢查器的檢查敘述顯示） | SQL |
| DB08 | — | 217,515 B | 只有 ER 建構 |
| DB10 | — | 226,802 B | SQL＋正規化工作台 |

- 任何頁面在執行查詢前都不下載 WASM；第一次執行時才載入 Worker 與 WASM（約 14 KB＋322 KB，由瀏覽器快取），E2E 在正式 build 上確認資源來自本站。
- DB09 的 ER 圖是伺服器端畫好的 SVG，不載入 ER 建構。
- 沒有新增依賴。

## 已知限制

- SQL 練習場是學習用的隔離，不是安全產品等級的 sandbox（同 F.1a）；參考解答在頁面上。
- ER 建構不是自由繪圖器，沒有三元關係；正規化的 1NF 只在文字中教。
- 練習不計入學習進度（與其他課相同）。
- sql.js 的 `ALTER TABLE … ADD COLUMN … CHECK` 會多回傳一個空結果表（KNOWN_ISSUES P2，DB07 已避開）。
- 程式碼測試在標準輸入沒有關閉時可能卡住（KNOWN_ISSUES P2；以 `< /dev/null` 執行）。
- P1-11、P1-32、P1-33、P1-34 仍未處理。

## 下一批建議

依藍圖順序，下一批可以是 DB11–DB13：

- DB11 索引與 B+ 樹（藍圖活動 query-plan，可用 SQLite 的 `EXPLAIN QUERY PLAN` 做 T1／T2）；
- DB12–DB13 依藍圖。

每批 2–3 堂，沿用「單一寫入者＋主線逐題校對＋能力宣告」的流程。新的能力（例如查詢計畫）先加入 `LESSON_CAPABILITIES`，並寫好驗證與測試。
