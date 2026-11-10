# 2026-11-02 Phase F.1a 資料庫應用島 MVP：DB01–DB05 與 SQL Playground

## 指示範圍

使用者授權 Phase F.1a：資料庫應用島的最小可用版本：DB01–DB05 五堂完整教材、瀏覽器內的 SQL Playground、與 Curriculum Registry 整合、課程入口、測試與文件。不做 DB06–DB20、不改 3D 世界；分批本地 commit；禁止 Push、Merge、Deploy。

## 起點

- `phase-d/basics-glb`，HEAD `1a97a38`，工作目錄只有未追蹤的 `.claude/`；沒有其他工作階段或執行中的測試（只有 10-31 的孤兒 Playwright Chrome，未處理）；依賴完整，F.0 registry 與 `planning-data.json` 同步。

## DB01–DB05 完成狀態

| ID | 課程 | 小節／範例／測驗／練習 | 練習場資料 |
|---|---|---|---|
| DB01 | 資料庫與 DBMS 概念 | 7／5／7／3 | `school` |
| DB02 | 關聯式模型：表、鍵與關聯代數 | 7／5／7／3 | `school` |
| DB03 | 用 SELECT 查詢資料 | 7／5／7／3 | `school` |
| DB04 | 彙總函式與 GROUP BY | 6／5／7／3 | `school` |
| DB05 | 多表查詢：JOIN | 7／5／7／3 | `shop` |

課程的標題、slug、學習目標、核心概念、難度、必修與建議先修都直接讀自藍圖（沒有改寫課程順序或名稱）。DB02 藍圖的練習類型是 `analysis`：練習改成「先手算關聯代數的結果，再寫成 SQL 檢查」，結果仍以比對判定。內容由每堂一位撰寫 agent 撰寫（單一寫入者、在私有副本自我檢查），主線重新驗證、逐題核對 35 題測驗答案（全部與資料一致），並修正一個不可攜的替代解（DB04 的 `SUM(score IS NULL)` 改為 `COUNT(DISTINCT student_id)`）。

## SQL Runtime 選型

| 方案 | WASM（gzip） | 相容性 | 初始化 | Worker | CSP | 離線 | 維護 | 測試 |
|---|---|---|---|---|---|---|---|---|
| **sql.js 1.14.2（採用）** | 658 KB（約 322 KB） | 現代瀏覽器、Node | 數十至數百毫秒 | 可在 Worker 執行 | 需 `'wasm-unsafe-eval'`（目前網站沒有 CSP） | WASM 隨建置發佈，不需網路 | MIT、無依賴、長期維護（SQLite 3.49.1） | Node 可直接執行同一引擎 |
| @sqlite.org/sqlite-wasm | 879 KB（約 407 KB） | 同上；OPFS 等功能需 COOP/COEP | 較重 | 可 | 同上 | 同上 | 官方、Apache-2.0 | Node 支援較複雜 |
| PGlite（PostgreSQL WASM） | 約 3 MB 以上 | — | 慢 | 可 | 同上 | 同上 | Apache-2.0 | 重 |
| AlaSQL | 純 JS | — | 快 | 可 | 不需 | — | 有 2 個依賴 | 非 SQLite 語意，不是真的 DBMS |

選 sql.js：真正的 SQLite、體積最小、無依賴、瀏覽器與 Node 測試共用同一引擎。版本選 1.14.2（2026-08 發佈，超過兩週），已有 `browser` 建置。WASM 以 `new URL('sql.js/dist/sql-wasm-browser.wasm', import.meta.url)` 由 Turbopack 打包成 `/_next/static/media/*.wasm`，不需複製到 `public/`、不需改設定；已在正式 build 與 `next start` 上驗證載入（不是只在 dev server）。

## Curriculum Schema 變更（向後相容）

- `ISLAND_IDS` 加 `databases`、前綴 `DB`；每島課程改為「01..n 連續」（F／D／A 仍是 20 堂，測試確認），不再固定總數 60。
- `LessonMeta.queryLanguage: 'SQL'`、`recommended`、`activity: 'sql-playground'`；SQL 課程 `supportedLanguages: []`，頁面沒有程式語言分頁，也沒有假造四語版本。
- `LessonContent.sql`（`dataset`、`presets`、`examples`、`exercises`）、`SqlExample`、`SqlExercise`；`validateSqlContent` 檢查結構。
- 測驗程式片段可用 `SQL`；Shiki 加上 `sql` 文法（小寫字一律視為識別字，避免 `name` 被上色成關鍵字）。
- 詳見 `docs/curriculum/LESSON_CONTENT_SCHEMA.md` §8 與 `docs/curriculum/DATABASE_ISLAND.md`。

## Registry 變更

- 「課綱規劃」與「已發布內容」分開：藍圖的 `status` 保持規劃快照（DB01–DB05 仍是 `planned`），**是否發布只由課綱（`src/content/curriculum`）決定**；完成一堂課不必改藍圖。
- `world/catalog.ts`：規劃清單排除課綱已有的課；`world/islands.ts`：新島的狀態與入口由課綱推導（0 堂 → planned、部分 → available、全部 → complete），資料庫應用島現為 `available`，入口是 `/curriculum#island-databases` 與 DB01。
- `world/activities.ts`：有完整課程使用的活動即為 implemented：`sql-playground`（T2）。
- 數量：320 堂；完整 65、規劃 255；資料庫應用島 5 開放／15 規劃。

## 入口與導覽

- `/curriculum`：四座島；資料庫應用島列出 20 堂，DB01–DB05 可點，DB06–DB20 標「規劃中」且沒有連結，並顯示「已開放 5／20 堂，15 堂規劃中」；標題與 metadata 的堂數由資料計算。
- 課程頁：A20 的下一堂是 DB01；DB05 的下一堂顯示「DB06（規劃中，尚未開放）」，沒有連結；規劃中的 slug 為 404。
- 首頁 3D、橋、相機、島嶼位置：未改（`src/components/islands` 只改了「查看完整課綱」連結文字）。

## SQL Playground 與練習驗證

- 每個練習場一個 Web Worker 與一個記憶體資料庫（不跨課程共用）；資料保留到「重設資料」；Ctrl／⌘＋Enter 執行；錯誤顯示 SQLite 原文與中文提示；結果是真正的表格（NULL 以文字顯示）；預設查詢按鈕；手機寬度表格在框內捲動。
- 限制：單次 3 秒（逾時就終止 Worker，查詢一定停止，資料重設；新 Worker 另給 10 秒載入）、每次最多 20 個敘述、每個結果最多讀 200 列（無限遞迴查詢在 200 列就停）、SQL 最多 4000 字元、資料庫最多 2048 頁（約 8 MB）。外鍵檢查開啟。
- 練習判定：學習者的 SQL 與參考解答各自在全新的資料上執行，比較欄位數、（題目指定時）欄名、資料列與（題目要求時）順序；數值依值比較（85 = 85.0，小數到 6 位）。另用 `-b` 隱藏資料再檢查一次，只回報通過與否，不送出預期資料列。測試保證：參考解答與每個替代寫法都通過、每個常見錯誤至少一組不通過、至少一組隱藏資料的答案與可見資料不同。

## 測試結果（隔離副本，最終程式碼）

| 檢查 | 結果 |
|---|---|
| tsc／ESLint | exit 0／exit 0 |
| 規劃資料同步 | `node scripts/planning-data.mjs --check`：up to date |
| Vitest（全部，JDK 在 PATH） | **1409 passed**／0 skipped（30 個檔案；含 SQL 引擎測試、`curriculum-sql` 每堂的範例／預設查詢／練習、四語程式、六個 Lab） |
| Build | 成功，82 個靜態頁（F.1a 前 77；多 DB01–DB05） |
| E2E 全套（desktop＋mobile，單次） | **346 passed／39 skipped／3 failed**：3 項皆為既有 P1-11（`player.spec.ts`）；新的 `e2e/sql.spec.ts`（SQL 範例、練習場、錯誤、空結果、重設、重複執行、Ctrl＋Enter、練習判定、目錄與規劃中的下一堂、WASM 只來自本站）全部通過 |
| Batch 2 中途 E2E（課綱、導覽、SQL） | 102 passed 後修正 4 項（標題多一個空白、兩處 A20 的舊期望），重跑通過 |
| 受保護路徑 | 3D 場景、GLB、相機、橋、`src/lib/islands`、`public`、`perf`、`engine.ts`（互動實驗）、`courses.ts`、`lab.tsx`、`progress.ts`、60 堂內容檔：0 行差異 |
| 進度 | key `logic-island.progress`、版本 1 不變；既有紀錄讀回相同（world 測試）；DB 課的完成規則與其他課相同 |

Bundle（gzip，`/curriculum/[slug]` 是所有課程共用的路由）：

| 頁面 | F.1a 前（`1a97a38`） | F.1a 後 |
|---|---:|---:|
| 程式課程（F01）首次載入的 JS | 221,175 B | 222,851 B（+1.7 KB） |
| SQL 課程（DB01、DB05） | — | 230,722 B（多一個 7.9 KB 的 SQL 介面 chunk，只有 SQL 課程載入） |
| 第一次執行 SQL 時 | — | Worker 14.1 KB＋WASM 321.8 KB（原始 658 KB），之後由瀏覽器快取 |

Batch 2 時 SQL 介面直接放在每個課程頁（F01 多 7.1 KB），Batch 4 改用 client 端的 `next/dynamic`（`sql-lazy.tsx`；Next 文件說明 Server Component 動態載入 Client Component 不會切割程式碼），程式課程不再下載它。客戶端 chunk 不含規劃中的課程資料（以 DB06 的 slug 搜尋，0 個檔案）。

## 已知限制

- **不是完整沙箱**：SQL 在瀏覽器的 Web Worker 裡執行，不連網、不上傳、沒有後端，逾時一定能終止；但這是學習用的隔離，不宣稱具有安全產品等級的 sandbox 保證。記憶體上限只靠頁數上限與逾時。
- 練習的參考解答在頁面上（「參考解答」可展開），有心人可以從頁面資料得知答案；隱藏測試只是不顯示預期資料列。練習不計入學習進度（與其他課相同）。
- 若日後加上 CSP，需要 `'wasm-unsafe-eval'`。
- DB04 有一個「裸欄位」示範，說明了 SQLite 3.49 在這份資料上的實際輸出，不是規格保證。
- 課程正文提到之後的課（DB06 以後）只以主題稱呼，目前沒有頁面。

## 下一批建議

DB06（子查詢、CTE、視窗函式）與 DB07（DDL、DML、約束）可沿用同一練習場與資料集（DB07 需要「修改後比對資料表內容」的判定方式，例如以固定查詢比對結果）；DB08–DB10（ER、正規化）以 `analysis`／`design` 為主，需要新的練習形式；之後再評估 ERD 活動（T1）。每批仍建議 2–3 堂、單一寫入者、主線逐題核對。
