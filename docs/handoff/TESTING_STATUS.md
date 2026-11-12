# 測試與品質狀態

> 盤點日期：2026-10-29，Asia/Taipei。以當日檔案與隔離檢查為準；本輪僅新增交接文件，未修復功能、變更資產或部署。

## 本輪執行邊界

所有應用程式檢查都在完整來源與依賴的隔離副本執行：`/private/tmp/logiclab-handoff-20261029-4t4fgojd/isolated`，而非原始專案。來源逐檔複製、node_modules 以 macOS clone copy 複製，不是可寫連回原資料的 symlink；未執行 install 來修改正式專案。

Next.js build 會產生 `.next`、型別與可能的設定輸出；Vitest／ESLint／Playwright 也可能寫 cache／報告，所以未在原工作目錄跑。原 `.next` 不被清除或沿用。獨立資產測試本輪僅重新跑 Khronos bytes validation，JSON 寫入 `/private/tmp` 再作為文件證據複製，不重寫模型／GLB。

第一份暫存副本直接呼叫 pnpm 時，pnpm 12 的依賴驗證自動嘗試 install，因 snapshot store／網路限制失敗，甚至暫存 node_modules 被重整；**那不是 lint／unit 的產品測試結果**。後續建立第二份完整副本，直接呼叫 node CLI，避免自動 install。原專案的依賴與 lockfile 不變。未下載新工具或安裝 JDK；本輪不將 wrapper 網路失敗冒充應用錯誤。

## M3.1 Regional World Prototype（2026-11-03）

`/world` 只在 `LOGIC_ISLAND_REGIONAL_WORLD=1` 的 build 存在，所以 E2E 分兩種 build 執行：

- **Flag on**：
  - 以 `LOGIC_ISLAND_REGIONAL_WORLD=1 next build` 建置；
  - 跑 E2E 時也設同一個變數，`e2e/regional-world.spec.ts` 的 flag-on 測試才會執行。
- **Flag off**：預設 build，不設變數；只執行 flag-off 測試（所有 `/world` 路由都是 404，首頁沒有連結）。
- **效能**：flag-on build 上跑 `perf/regions.perf.ts`（`playwright.perf.config.ts`、`PERF_BASE_URL`、`PERF_ROUNDS`、`PERF_OUT`）。

結果（隔離副本，不含 Theme 修改）：

| 檢查 | 結果 |
|---|---|
| tsc／ESLint | exit 0／exit 0 |
| Vitest | **1580 passed**／0 failed／0 skipped |
| E2E 全套（flag on） | **417 passed／44 skipped／3 failed**；3 項是既有 P1-11 |
| E2E（flag off） | 111 passed／23 skipped／0 failed |
| 首頁逐像素前後比對 | 0 差異（桌機、手機，中午） |

`regional-world` 在修正後重跑：16 passed。效能 P0–P5、截圖與 M3.2 進入條件見 `logs/2026-11-03-m3-1-regional-world-prototype.md`。

## 資料庫應用島 3D 世界整合（2026-11-02，**Phase F.1e**，原稱 F.2）

在「HEAD `2378d7c`＋本次檔案」的乾淨副本（不含 Theme 工作階段未提交的修改）驗證：tsc／ESLint exit 0；Vitest **1562 passed**／0 failed／0 skipped；build 成功（97 頁）；E2E 全套 **401 passed／40 skipped／3 failed**（3 項為既有 P1-11；多 1 項 skipped 是新的 hover 測試在手機上跳過）。新的 `e2e/home-databases.spec.ts`（五座島、點擊／觸控／鍵盤／hover、面板內容與連結、既有進度、無 WebGL 清單、DB01–DB20）全部通過。首頁效能（SwiftShader，5 輪）：總覽 draw call 63 → 66、三角形桌機 44,360 → 49,113、手機 33,024 → 36,923；第一個畫面與飛行 fps 沒有明顯變化。截圖：四個時段 × 桌機／手機，五個名牌都在畫面內、不重疊、沒有 console 錯誤。詳見 `logs/2026-11-02-f2-database-island-world.md`。

## Phase F.1d 資料庫應用島完成（2026-11-02；`3401857`、`cef3604`、`49a3bfb`、`808da33`、`c2e2c65`、`14911aa`、`cf0e820` 與文件 commit）

每批提交前都跑 tsc、ESLint 與相關 Vitest；Batch 1、2 另跑 build＋資料庫 E2E。最終驗證在 **HEAD 的乾淨副本**（`git archive`，不含工作目錄裡其他工作階段未提交的 `globals.css`、`layout.tsx`、`curriculum.module.css`、`site-time.ts`）：

| 檢查 | 結果 |
|---|---|
| tsc／ESLint | exit 0／exit 0 |
| 規劃資料同步 | `node scripts/planning-data.mjs --check`：up to date |
| Vitest（全部，JDK 在 PATH，背景執行） | **1557 passed**／0 failed／0 skipped（41 個檔案，259 秒；新增 `curriculum-driver`（Python／JavaScript 驅動程式範例實際執行、Java 編譯）、`sql-sequence`、`ops`；`sql-engine`（參數、當機一致性、`auth`／`documents`）、`sql-plan`（參數組＋計畫）擴充） |
| Build | 成功，97 個靜態頁（F.1c 92；多 DB16–DB20） |
| E2E 全套（desktop＋mobile） | **388 passed／39 skipped／3 failed**：3 項皆為既有 P1-11（`player.spec.ts`）；39 項 skipped 與 F.1c 相同；新的 `db-activities-f1d` 16 項全部通過。最終全套因 3118 埠被另一個工作階段佔用而改用 3121，`sql.spec.ts` 寫死 3118 的來源檢查失敗 2 項，改用 `baseURL` 後 `sql.spec.ts` 重跑 8 項通過（全套 386＋2） |
| 受保護路徑（`git diff d4627e2..HEAD`） | 3D、`src/lib/islands`、`src/app/islands`、`public`、`courses.ts`、`lab.tsx`、`src/lib/engine.ts`、`progress.ts`、60 堂程式教材、DB01–DB13 與 DB15 內容、藍圖資料：0 行差異 |
| Registry | 320 堂；完整 80、規劃 240；15 座學科島；6 條路線；資料庫應用島 complete（20／20） |

Bundle（gzip，頁面自己載入的 JS；F.1c `d4627e2` 與 F.1d 用同一腳本、各自的 production build 量測）：

| 頁面 | F.1c | F.1d |
|---|---:|---:|
| 程式課程（F01、A20） | 212,330 B | 212,581 B（+251 B） |
| SQL 課程（DB01、DB12、DB13、DB17、DB18） | 224,828 B | 228,043 B（+3.2 KB） |
| DB08 | 217,730 B | 218,035 B |
| DB10 | 229,253 B | 232,524 B |
| DB11 | 228,142 B | 231,409 B |
| DB14、DB15 | 232,581 B | 235,853 B |
| DB16 | — | 241,537 B |
| DB19 | — | 232,730 B |
| DB20 | — | 237,978 B |

任何頁面在執行查詢前都不下載 WASM；程式課程不載入資料集與資料庫活動（E2E 檢查，F.1d 加入往返序列、架構模擬、參數綁定的標記）。

## Phase F.1c 資料庫應用島擴充（2026-11-02；`ed4b211`、`581a88c`、`7a93078`、`300f824`、`df0e544` 與文件 commit）

每批提交前都跑 tsc、ESLint 與相關 Vitest；執行器修正、活動基礎、DB11–DB12 各自在只含該 commit 內容的副本或建置上驗證。最終驗證（隔離副本＝HEAD 的程式碼）：

| 檢查 | 結果 |
|---|---|
| tsc／ESLint | exit 0／exit 0 |
| 規劃資料同步 | `node scripts/planning-data.mjs --check`：up to date |
| Vitest（全部，JDK 在 PATH，**背景執行、不加 `< /dev/null`**） | **1501 passed**／0 failed／0 skipped（38 個檔案，246 秒；新增 `run-program`、`bplus`、`sql-plan`、`txn` 測試，`curriculum-db`／`curriculum-sql` 涵蓋 DB11–DB15） |
| Build | 成功，92 個靜態頁（F.1b 87；多 DB11–DB15） |
| E2E 全套（desktop＋mobile，單次） | **372 passed／39 skipped／3 failed**：3 項皆為既有 P1-11（`player.spec.ts`，與 F.1a／F.1b 相同）；39 項 skipped 與 F.1b 相同；**沒有新的失敗**。新的 `db-activities-f1c`（查詢計畫、B+ 樹、依計畫檢查的練習、交易時間軸、交錯排程、交易練習、程式課程不載入資料庫活動與資料集）全部通過 |
| 受保護路徑（`git diff 9e6009e..HEAD`） | 3D、`src/lib/islands`、`public`、`src/app/islands`、`courses.ts`、`lab.tsx`、`engine.ts`、`progress.ts`、60 堂程式教材、DB01–DB10 內容、藍圖資料：0 行差異 |
| Registry | 320 堂；完整 75、規劃 245；15 座學科島；6 條路線；資料庫應用島 available（DB01–DB15 開放、DB16–DB20 規劃中） |

**程式碼測試不再需要 `< /dev/null`**：F.1b 記錄的原因是錯的。根因是測資經由管線傳給子行程，並行時偶爾送不到「輸入結束」，同步呼叫又沒有逾時。現在測資以檔案作為 stdin，每次執行都有逾時並終止子行程（`tests/support/run-program.ts`），壓力測試 4,000 次 0 次卡住（詳見 log）。

Bundle（gzip，頁面自己載入的 JS；F.1b `9e6009e` 與 F.1c 用同一方法量）：

| 頁面 | F.1b | F.1c |
|---|---:|---:|
| 程式課程（F01、A20） | 212,203 B | 212,330 B（+127 B） |
| SQL 課程（DB01、DB12、DB13） | 222,461 B | 224,828 B（+2.4 KB） |
| DB08 | 217,515 B | 217,730 B |
| DB10 | 226,802 B | 229,253 B |
| DB11 | — | 228,142 B |
| DB14、DB15 | — | 232,581 B |

量測時發現 `sales` 資料集在模組載入時呼叫產生函式，使整個資料集被打包進每一課（程式課程 +4.3 KB），已修正並以 E2E 防止再發生（`df0e544`）。任何頁面在執行查詢前都不下載 WASM。

## Phase F.1b 資料庫應用島擴充（2026-11-02；`74724b6`、`59c5e8a`、`3792e86`、`b681ca2`、`21af909`、`6b0a3ec` 與文件 commit）

每批提交前都跑 tsc、ESLint 與相關 Vitest；Batch 1、3、能力宣告與 Batch 2 另跑 build＋相關 E2E。最終驗證（隔離副本＝HEAD `6b0a3ec` 的程式碼）：

| 檢查 | 結果 |
|---|---|
| tsc／ESLint | exit 0／exit 0 |
| 規劃資料同步 | `node scripts/planning-data.mjs --check`：up to date |
| Vitest（全部，JDK 在 PATH，**`vitest run < /dev/null`**） | **1450 passed**／0 failed／0 skipped（34 個檔案；新增 `er`、`normalization`、`curriculum-db`、`world-navigation` 測試，`curriculum-sql` 涵蓋 DB06–DB10 的 SQL） |
| Build | 成功，87 個靜態頁（F.1a 82；多 DB06–DB10） |
| E2E：`db-activities`＋`sql`（desktop＋mobile） | 20 passed／0 skipped |
| E2E 全套（desktop＋mobile，單次） | **358 passed／39 skipped／3 failed**：3 項皆為既有 P1-11（`player.spec.ts` 的 bfs 教材語言切換、播放中更換輸入，與 F.1a 相同）；39 項 skipped 與 F.1a 相同；**沒有新的失敗** |
| 受保護路徑（`git diff a75e202..HEAD`） | 3D、`src/lib/islands`、`public`、`src/app/islands`、`courses.ts`、`lab.tsx`、`engine.ts`、`progress.ts`、60 堂程式教材、藍圖資料：0 行差異 |
| Registry | 320 堂；完整 70、規劃 250；15 座學科島；6 條路線；資料庫應用島 available（DB01–DB10 開放） |

注意：Vitest 要以 `< /dev/null` 執行。`curriculum-code.test.ts` 對沒有測資的範例不傳 `input`，子行程會繼承標準輸入；標準輸入沒有關閉時（例如背景執行），一個讀標準輸入的 JavaScript 範例會一直等待（KNOWN_ISSUES P2）。有測資的範例以 `input` 傳入，不受影響。

Bundle（gzip，頁面自己載入的 JS；以瀏覽器實際載入的檔案計算，F.1a `a75e202` 與 F.1b 用同一方法量）：

| 頁面 | F.1a | F.1b |
|---|---:|---:|
| 程式課程（F01、A20） | 212,051 B | 212,203 B（+152 B；不含 SQL／ER／正規化程式） |
| SQL 課程（DB01、DB05–DB07、DB09） | 220,077 B | 222,461 B（+2.4 KB） |
| DB08（只有 ER 建構） | — | 217,515 B |
| DB10（SQL＋正規化工作台） | — | 226,802 B |

（F.1a 的表以另一種方式計算，數字不能直接和這張表相比。）任何頁面在第一次執行查詢前都不下載 WASM。

## Phase F.1a 資料庫應用島 MVP（2026-11-02；`ce8014c`（SQL runtime）、`57309b0`（DB01–DB02）、`375c664`（DB03–DB05）與 Batch 4（延遲載入、文件））


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

新增測試：`tests/sql-engine.test.ts`（資料集、執行、錯誤提示、限制、結果比對、練習判定）、`tests/curriculum-sql.test.ts`（每堂 SQL 課的範例結果、預設查詢、參考解答／替代寫法通過、常見錯誤不通過、隱藏資料不同）、`e2e/sql.spec.ts`。

## Phase F.0 多群島資料架構（2026-11-02；`1497718`、`5a33802`、`52b4d12`、`a7654d3`，另有文件 commit）

每批提交前都跑 tsc、ESLint 與相關 Vitest（world 測試與課綱測試）。最終驗證：

| 檢查（隔離副本，HEAD `a7654d3`） | 結果 |
|---|---|
| tsc／ESLint | exit 0／exit 0 |
| 規劃資料同步 | `node scripts/planning-data.mjs --check`：up to date |
| Vitest（全部，JDK 在 PATH） | **1379 passed**／0 skipped（28 個檔案；新增 6 個 world 測試檔 50 項，原 1343 項全部通過、四語程式全部執行） |
| Build | 成功，77 個靜態頁（與 F.0 前相同：沒有為規劃課程產生頁面） |
| 瀏覽器 bundle | `.next/static` 中含規劃 slug（`programming-paradigms`）的檔案：0 |
| E2E（`curriculum.spec.ts`、`navigation.spec.ts`，desktop＋mobile） | **98 passed／2 skipped／0 failed** |
| 受保護路徑（自 `7f6cb9f`） | 3D、Lab、引擎、進度、60 堂內容、`src/app`、`next.config.ts`、`docs/planning`：0 行差異 |

E2E 只跑課綱與導覽：F.0 只改資料層（`schema.ts` 的型別與 ID 解析、`registry.ts` 的三座島來源），兩者只被課綱頁使用；首頁、3D、Lab 的檔案沒有變更，所以沒有重跑 E2E 全套（上一輪 `b52b8e9` 全套結果：只有既有 P1-11 的 3 項失敗）。

新增測試：`tests/world.test.ts`（區域、島嶼、320 個 ID 的完整前綴解析）、`world-planning.test.ts`（產生檔與規劃 JSON 同步）、`world-catalog.test.ts`（320 堂、60／260、無循環、規劃課程沒有頁面、進度格式）、`world-paths.test.ts`（6 條路線、路線 F 無 ML／DL、活動 registry）、`world-config.test.ts`（入口、橋、解鎖規則、讀取 helper）。

## Phase E.5 工作目錄整併（2026-11-02；`a6bacfe`、`3632a75`、`b525608`、`b52b8e9`，另有文件 commit）

每個 commit 提交前把暫存區的樹匯出到隔離目錄，跑 tsc、ESLint 與相關 Vitest（全部通過，見 `logs/2026-11-02-e5-consolidation.md`）。HEAD `b52b8e9` 的最終整合驗證（隔離副本，Shiki 只安裝在那裡）：

| 檢查 | 結果 |
|---|---|
| tsc／ESLint | exit 0／exit 0 |
| Vitest（全部，JDK 在 PATH） | **1343 passed**／0 skipped（23 個檔案） |
| Build | 成功（77 個靜態頁） |
| E2E 全套（單次） | **338 passed／39 skipped／3 failed**：3 項皆為既有 P1-11（`player.spec.ts`：bfs 教材、語言切換（desktop）；播放中更換輸入（desktop、mobile））；沒有新的失敗 |

Vitest 由 1054 增加到 1343：JavaScript 執行測試（六個 Lab 與 60 堂課）與語法高亮測試（`tests/highlight.test.ts`：每一行的片段拼回原文）。工作目錄尚未 `pnpm install` Shiki，在工作目錄直接 build 前需先安裝。

## Phase E.4 演算法島 20／20、課綱 60／60（2026-10-31～11-01；batch A `2ad9116`、B `4a7ca2d`、C `1bf8abe`、D `f2cf961`，另有收尾 commit）

| 檢查 | 結果 |
|---|---|
| 每批 | 內容驗證、三語程式碼、演算法正確性（`tests/simulate-algorithms.test.ts`：參考實作、小輸入窮舉、固定種子亂數）、課綱 Vitest、相關 E2E、ESLint、tsc 都通過，並逐題人工核對測驗答案（135 題） |
| Vitest（全部，JDK 在 PATH） | `f2cf961` 與收尾後都是 1054 passed／0 skipped |
| E2E 全套（`f2cf961`，單次，負載約 4～7） | **325 passed／38 skipped／3 failed**：3 項皆為既有 P1-11；P1-32 通過；沒有新的失敗 |
| 受保護路徑 | GLB、島嶼、3D 元件、互動實驗引擎、`courses.ts`、perf、public 自 `a082e58` 起 0 行差異 |

收尾驗證（優先佇列依 dist 顯示、手機標籤換行、A15／A16 說明修正後）：Vitest（全部，JDK 在 PATH）**1054 passed／0 skipped**（21 個檔案）；TypeScript、ESLint exit 0；Build 成功（84 個靜態頁）；E2E `curriculum` **85 passed／1 skipped**（剪貼簿只在桌機）／0 failed。未重跑 E2E 全套（`f2cf961` 已完成，收尾只改視覺化顯示與文字）

## Phase E.3 資料結構島 20／20（2026-10-31，四個本地 commit：batch A `fa6a71b`、B `d09f593`、C `ffcf88b`、D `2f7ee0c`，另有文件 commit）

狀態：完整教材 40／60（F01～F20、D01～D20），演算法島 20 堂規劃中；Phase D 程式未修改（GLB、島嶼、3D 元件、perf、`courses.ts`、`engine.ts`、public 自 `eba24b3` 起 0 行差異）。

| 檢查 | 結果 |
|---|---|
| 每批（A／B／C／D） | 內容驗證、三語程式碼（Vitest，JDK 在 PATH）、課綱 Vitest、相關 E2E、ESLint、TypeScript 都通過：A 357、B 420、C 493 項 Vitest（課綱相關檔案）皆 0 skipped；E2E 課綱 51／55／61（C 時尚未有 D 島測試的 6 項另跑） |
| ESLint／TypeScript | 都是 exit 0 |
| Vitest（全部，JDK 在 PATH） | **765 passed／0 skipped**（20 個檔案）：課綱規則與驗證器（含資料結構面板的一致性檢查）、`tests/simulate.test.ts` 9 項模擬器不變量、進度，以及 F01～F20、D01～D20 全部範例、練習與起始程式碼在 **C++17、Python 3、Java 17（`javac --release 17`）執行通過** |
| Next Build | 成功；84 個靜態頁（`/curriculum/[slug]` 60 頁） |
| E2E `curriculum`（桌機＋手機） | **65 passed／1 skipped**（剪貼簿只在桌機）：E.3 新增 10 項——堆疊（步驟、方向鍵、輸入範圍、underflow）、鏈結串列、動態陣列擴容與上限、資料結構比較、佇列與雙端佇列、雜湊碰撞與重複、樹走訪與 BST、堆積、圖與並查集、D 島進度（不改動 F 島進度）、資料結構島 20／20 完成與目錄 40 堂；40 堂完整教材手機與桌機都沒有水平溢出 |
| E2E 全套（單次，負載約 3） | **305 passed／38 skipped／3 failed**：3 項皆為既有 P1-11（player）；P1-32 這次通過 |

- E.3 先後修正兩個在驗收中發現的 UI 問題：程式輸出中沒有空白的長行會撐寬手機版面（改為在輸出框內捲動）；步驟說明與比較表的反引號以 inline code 顯示。
- 見 `logs/2026-10-31-e3-structures.md`。

## Phase E.2 基礎程式島 20／20（2026-10-31，三個本地 commit：batch A `d71cb6a`、batch B `618ddd9`、batch C「lessons F16-F20 and the foundations island complete (Phase E.2 batch C)」）

狀態：基礎程式島 F01～F20 完整，資料結構島與演算法島 40 堂仍為規劃中；Phase D 程式未修改。完整教材的驗證標準提高（motivation、≥ 3 範例、≥ 4 測驗）。

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0 |
| Vitest（JDK 在 PATH） | **479 passed／0 skipped**：課綱規則、驗證器、進度，以及 F01～F20 共 63 個範例、20 題練習（140 組測資＋範例）、3 份起始程式碼在 **C++17、Python 3、Java 17 全部執行通過** |
| Next Build | 成功 |
| E2E `curriculum` | 43 passed／1 skipped／0 failed：各視覺化（迴圈、陣列、二維、函式呼叫、遞迴、複雜度、挑戰分段、短路）、F13 進度、島嶼 20／20 完成、20 堂手機不溢出 |
| E2E 全套（單次） | 282 passed／38 skipped／4 failed：3 項 P1-11；1 項候選頁 Auto Orbit 測試 30 秒逾時——同一測試在 E.2 之前的 `5c43f98` 建置、相同負載下也 6／6 失敗，E.2 未修改任何 3D 或候選頁程式，屬負載相依的既有問題 |

- Java 執行方式：`PATH="/Applications/IntelliJ IDEA.app/Contents/jbr/Contents/Home/bin:$PATH"`（本機既有的 IntelliJ IDEA 附帶 OpenJDK 25），`javac --release 17`。沒有 JDK 的環境 Java 測試會略過，不得視為通過。
- 見 `logs/2026-10-31-e2-foundations.md`。

## dusk-contrast E2E flake 修正（2026-10-31，獨立 commit「wait for every caption transition in the dusk contrast test (E2E fix)」）

只修改 `e2e/hex-environment.spec.ts` 的等待條件；產品程式、顏色、相機、GLB、光照、renderer 與教材都未修改。

- **根因（有證據）**：以檢測版測試（只在隔離副本）重複 30 次、記錄讀取當下的狀態，60 次讀取中 1 次讀到舊顏色：`data-environment` 已是 dusk、標題底板與 `span` 已是傍晚顏色，但 `strong` 仍是 `rgb(29, 43, 66)`（前一個情境的深色文字），標題本身 `getAnimations()` 為空、子樹 `getAnimations({ subtree: true })` 仍有一個 `color` 轉場（currentTime 0）；300 ms 後 `strong` 變為 `rgb(242, 245, 255)`。用舊文字色算出的對比正好是 1.33:1，與失敗值相同。轉場來自 reduced motion 下 `globals.css` 對所有元素的 `transition-duration: .01ms`（`transition-property` 預設 all），`strong` 繼承顏色並各自轉場。
- **修正**：等待 `caption.getAnimations({ subtree: true }).length === 0`（標題與其中所有文字的轉場都結束）再讀顏色。`getAnimations` 會先套用待處理的樣式變更，所以不會在轉場建立前就判定完成。沒有固定等待，對比門檻 4.5:1 與每個斷言不變。

| 檢查 | 修正前 | 修正後 |
|---|---|---|
| 該測試，桌機連續 20 次（負載約 5～7） | 17 passed／**3 failed**（皆 1.33:1） | **20／20 passed** |
| 該測試，桌機＋手機各 20 次 | — | **40／40 passed** |
| `hex-environment`＋`hex-camera`＋`hex-scale` 全部 | — | 79 passed／9 skipped／0 failed |
| ESLint／TypeScript | — | 都是 exit 0 |

## Phase E.1 課綱架構與學習引擎（2026-10-31，獨立 commit「60-lesson curriculum, lesson pages and progress (Phase E.1)」）

狀態：60 堂課綱（三島各 20）與驗證、`/curriculum` 目錄與 60 個課程頁、F01～F05 完整教材、視覺化 registry、localStorage 進度。Phase D 程式（`src/lib/islands`、`src/components/islands`、`perf/`）、`src/content/courses.ts` 與引擎未修改。

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0 |
| Vitest | 263 passed／30 skipped。`curriculum`：60 堂、三島各 20、ID／slug 唯一、先修在前（無循環）、三語一致、狀態與內容一致、驗證器能抓出各類錯誤；`progress`：狀態、完成條件、遷移與不覆寫 |
| 三語程式碼（`curriculum-code`） | 17 個範例、5 題練習（40 組測資＋範例）、2 份起始程式碼：**C++17、Python 3 全部執行通過；Java Not Executed**（本機沒有 JDK，24 項略過） |
| Next Build | 成功；`/curriculum/[slug]` 60 頁 SSG |
| E2E `curriculum` | 19 passed／1 skipped（剪貼簿只在桌機）：目錄、三語切換與複製、變數追蹤、條件分支、測驗與解析、進度保存與遷移、規劃中課程、上一堂／下一堂、無障礙名稱、手機不溢出、`/learn` 不變 |
| E2E 全套（單次，高負載） | 255 passed／38 skipped／7 failed：3 項 P1-11；3 項候選頁逾時（重跑通過）；1 項 `hex-environment` 對比測試間歇失敗（E.1 與 `250b99f` 各重複 5 次都失敗 1 次，既有時序問題） |

- 手機與桌機的版面另以截圖檢查（scratch）：測驗選項原本被全站 `input` 樣式撐滿整列，已在課程樣式中修正。
- 見 `logs/2026-10-31-e1-curriculum.md`、`docs/curriculum/`。

## D.3-4B 真機驗收準備（2026-10-31，獨立 commit「real-device acceptance kit for the candidate world map (Phase D.3-4B preparation)」）

狀態：**D.3-4B Preparation Complete — Real Device Not Measured**。量測 proxy（`perf/device/`）擴充為候選頁的真機驗收工具；應用程式未修改（`src/` 0 行差異）。以下全是工具與既有功能的自動化預檢，**不是真機結果**；工具在 Chromium 模擬上的數字一律標「不可靠」。操作指南：[DEVICE_ACCEPTANCE](DEVICE_ACCEPTANCE.md)。

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0；量測工具另以 `tsc --checkJs --strict` 檢查 `perf/device/*.mjs`，exit 0 |
| Vitest | 194 passed／6 skipped（`device-report` 14 項） |
| Next Build | 成功 |
| E2E 全套（單次） | 240 passed／37 skipped／3 failed：只有既有 P1-11（`player.spec.ts`）。`device-tool` 全部通過；候選頁、`/islands`、legacy 測試照常 |
| 工具自測數字（模擬，不可靠） | 候選頁 draw 43／26／0、三角形 28,569、program 17、時間切換每次 1 幀 0 個新 program；舊版 146／82／112、12,086、5，時間切換與自動旋轉 Not Available |

- 真機狀態用語：Preparation Complete（本輪）／Real Device Not Measured（目前）／Real Device Passed、Real Device Failed（只有審核者依真機報告標示）。
- 執行自己的工具伺服器做測試時用 `--host 127.0.0.1`；預設 `0.0.0.0` 會讓同一區網看得到控制頁（指南 §1.4）。

## D.3-7a 候選頁手機 UI 修飾（2026-10-31，獨立 commit「mobile button row below the candidate world map (Phase D.3-7a)」）

狀態：Level 2，只在 `/islands/candidate`。手機（≤ 780 px）提示與按鈕移到地圖下方一列（44 px 觸控目標）；「跳至主要內容」出現在地圖上查明為截圖 artifact，產品 CSS 不變。候選頁 3D 與 `250b99f` 0 像素差（桌機 1440／1280、手機 360／390／430；全景、聚焦、傍晚），桌機整個候選頁 0 像素差；實驗室頁、`/islands`、`/islands/legacy`、19 格、A2 預覽 0 像素差且控制相同。真機 D.3-4B 仍 Not Measured；iOS Safari／螢幕閱讀器 Not Verified。

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0 |
| Vitest | 190 passed／6 skipped |
| Next Build | 成功 |
| E2E 全套（單次） | 239 passed／37 skipped／4 failed：3 項既有 P1-11（`player.spec.ts`）；1 項手機像素比對因新按鈕列在 canvas 下方而受截圖邊緣影響，修正 `mapShot`（只擷取 canvas 自己的整數像素）後整個 `candidate-integration` 30 passed／0 failed，重複 3 次 12/12。`hex-camera` 28 passed（實驗室頁觸控測試的等待修正仍有效） |
| 候選頁 UI 差異 | 手機：提示改為地圖下方一行、三個控制平分一列 44 px、地圖下方多一條分隔線，頁高 +93 px；桌機無差異；沒有新增或移除控制 |
| 效能 | 不改 3D 渲染，canvas 尺寸不變；draw、陰影 pass、閒置由 D.3-6d 的 E2E 確認不變 |

- `e2e/candidate-integration.spec.ts` 新增 D.3-7a 測試：跳至主要內容（360／390／430／1280：平時在畫面外、Tab 完整可見有外框、Enter 到 `#main` 後離開、捲動與點地圖後仍在畫面外）；手機按鈕列（在地圖下方、44 px、高度與圓角一致、不截字、不被遮住、提示對比 ≥ 4.5:1，全景／黃昏／傍晚／聚焦／深色模式，鍵盤順序）；桌機按鈕仍在地圖上。
- **截圖規則**：比 viewport 高的截圖（`fullPage`，或比 viewport 高的元素）在頁面已捲動時，會把畫面外的 fixed「跳至主要內容」畫在約 scrollY − 80 的位置（Chromium 擷取方式造成，實際畫面不會出現）。這類截圖用 `screenshot({ style: '.skip-link{visibility:hidden!important}' })` 或先捲回頂端；不要為此改全站 CSS。canvas 的元素截圖會多帶下方一列，3D 像素比對只比 canvas 自己的整數像素。見 `logs/2026-10-31-d3-7a-candidate-mobile-ui.md`。

## D.3-5c／D.3-6d 候選頁整合（2026-10-31，獨立 commit「free camera, auto orbit and times of day on the candidate world map (Phase D.3-5c/D.3-6d)」）

狀態：Level 3。`/islands/candidate` 取用實驗室頁的自由相機、Auto Orbit 與四種時間情境（production preset 加兩個旗標，同一套元件）；單欄版面地圖標題移到地圖上方。候選頁中午 3D 畫面與 `0cfb146` 0 像素差（桌機、手機，全景、聚焦）；實驗室頁中午／清晨、`/islands`、`/islands/legacy`、19 格、A2 預覽 0 像素差且按鈕連結相同。真機 D.3-4B 仍 Not Measured；iOS Safari／螢幕閱讀器 Not Verified。

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0 |
| Vitest | 190 passed／6 skipped |
| Next Build | 成功；`/islands` 系列靜態頁、`/islands/hex/scale/{19,37}` SSG |
| E2E 全套（最終一次） | 231 passed／29 skipped／4 failed：3 項既有 P1-11（`player.spec.ts`）；1 項 `hex-camera` 觸控測試為既有不穩定（`0cfb146` 6 次失敗 3 次，捲動慣性），已改為先等捲動停止後連續 8 次通過、整個 `hex-camera` 28 passed。見 `logs/2026-10-31-d3-5c-d3-6d-candidate.md` §4.3 |
| 候選頁 UI 差異 | 新增時間選單與自動旋轉、提示文字、單欄時標題在地圖上方；沒有移除控制 |
| 效能（有界） | draw 43／三角形 28,569／陰影 draw 38／program 17 與基準相同；閒置 0；時間切換 1 幀 1 次陰影 pass、20～36 ms；鏡頭飛行 FPS 三對平均 43.7 對 43.5（雜訊）；Auto Orbit 42.6（桌機）／56.5（手機） |

- `e2e/candidate-integration.spec.ts`（新增，桌機＋手機）：自由相機、觸控、鏡頭飛行與返回全景、Auto Orbit 停止條件、Reduced Motion、時間切換（相機不動、中午逐像素恢復、不編譯 shader、draw 與陰影 pass、閒置 0）、對比、手機 360／390／430 px 版面與旋轉縮放聚焦後的標題、桌機名牌疊在標題上、WebGL fallback 不留 3D 控制。
- 既有測試只更新期待值（候選頁從固定相機／無時間選單改為與實驗室頁相同；標題定位改為可見的那一份），沒有刪除或 skip。

## D.3-6c 傍晚暖光與 Lab 收尾（2026-10-31，獨立 commit「dusk lamp glow and phone caption on the lab world map (Phase D.3-6c)」）

狀態：**只在 37 格實驗室頁**；Fast Iteration Mode Level 2。黃昏、傍晚的燈塔燈室／窗戶與路燈燈籠加強暖光（自有材質的強度與顏色倍率），手機黃昏／傍晚標題不再蓋住燈塔。中午、清晨與 `90a0196` 0 像素差；候選頁、`/islands`、`/islands/legacy`、19 格、A2 預覽 0 像素差且按鈕連結相同。真機 D.3-4B 仍 Not Measured；iOS Safari／螢幕閱讀器 Not Verified。

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0 |
| Vitest | 189 passed／6 skipped |
| Next Build | 成功；`/islands` 系列靜態頁、`/islands/hex/scale/{19,37}` SSG 不變 |
| E2E `hex-environment`＋`hex-camera`＋`hex-scale`＋`hex-world`＋`islands-candidate`＋`islands-acceptance`＋`islands`（單次） | 177 passed／21 skipped／0 failed |
| 視覺 A/B（與 `90a0196`） | 中午、清晨 0；黃昏／傍晚桌機 149～468 像素（燈與窗），手機另含標題改變；其他路由 0 |
| 材質隔離與反覆切換 | 四情境 × 3 輪：只有兩個發光材質改變、原值 × 倍率、材質數不變、回到中午恢復原值、`linkProgram` 不增加 |
| 效能 smoke（一輪） | program 17 → 17、每幀 draw 43、切換到第一幀 22～38 ms、環繞 FPS 各情境相同；陰影 pass 與閒置由 E2E 驗證。見 `logs/2026-10-31-d3-6c-dusk-glow.md` §6 |

- `e2e/hex-environment.spec.ts` 新增 2 項（桌機＋手機）：暖光材質隔離與反覆切換、手機 360／390 px 標題不蓋燈塔（同一項在 `90a0196` 會失敗）。

## D.3-6b 四種時間情境（2026-10-31，獨立 commit「four times of day on the lab world map (Phase D.3-6b)」）

狀態：**只在 37 格實驗室頁**（清晨／中午／黃昏／傍晚與原生選單）；Fast Iteration Mode Level 2，共用的 `HexEnvironment` 另做關鍵路由逐像素 A/B。中午與 `63f972e` 在 6 條路由、桌機＋手機 22 個狀態 0 像素差；候選頁、`/islands`、`/islands/legacy` 的畫面與按鈕、連結相同。真機 D.3-4B 仍 Not Measured；iOS Safari／螢幕閱讀器 Not Verified。

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0 |
| Vitest | 188 passed／6 skipped（`tests/environments.test.ts` 新增 5 項） |
| Next Build | 成功；`/islands` 系列靜態頁、`/islands/hex/scale/{19,37}` SSG 不變 |
| E2E `hex-environment`＋`hex-camera`＋`hex-scale`＋`hex-world`＋`islands-candidate`＋`islands-acceptance`＋`islands`（單次） | 174 passed／20 skipped／0 failed；傍晚月光改為 40° 後重跑 `hex-environment` 18 passed |
| 視覺 A/B（中午） | 22 個狀態 0 像素差；實驗室頁只多了時間選單 |
| draw call／三角形 | 四情境主畫面相同（每幀 43），含陰影 pass 不多於中午 |
| 陰影與閒置 | 每次切換 1 次陰影 pass，之後閒置 0 |
| 效能 smoke（一輪） | 切換不編譯 shader（program 17 → 17）；切換到第一幀 21～44 ms；環繞 FPS 四情境相同（桌機約 38、手機約 40）。載入後第一次環繞的雙峰雜訊兩版都有，無回歸證據。見 `logs/2026-10-31-d3-6b-time-of-day.md` §7 |

- `e2e/hex-environment.spec.ts`（新增 7 項 × 桌機／手機）：選單預設中午與順序、候選頁沒有；每情境的燈光、陰影盒、海面色調、無霧；draw call／三角形；切換只重畫一次陰影且閒置 0；不影響自動旋轉、聚焦、返回全景與清單往返；黃昏與傍晚標題對比 ≥ 4.5:1；Tab 可達、360／390 px 不溢出。
- scratch（不進 repo）：四情境截圖、中午 A/B、效能 smoke、第一次環繞的配對檢查。

## D.3-6a 環境架構重構（2026-10-31，獨立 commit「environment data and HexEnvironment for the world map (Phase D.3-6a)」）

狀態：純重構，只有中午環境。六條 `/islands` 路由（實驗室頁、候選頁、19 格、A2 預覽、`/islands`、`/islands/legacy`）與 `57364a2` 0 像素差、按鈕與連結相同、編譯的 WebGL program／shader 數量相同。候選頁沒有啟用自由相機或 Auto Orbit。全部是 Chromium 模擬；D.3-4B 仍是 Not Measured。

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0 |
| Vitest | 183 passed／6 skipped（新增 `tests/environments.test.ts` 6 項） |
| Next Build | 成功；`/islands` 系列靜態頁、`/islands/hex/scale/{19,37}` SSG 不變 |
| E2E 全套（單次） | 193 passed／22 skipped／3 failed（3 個都是既有 `player.spec.ts`，P1-11） |
| E2E `hex-camera`＋`hex-scale`＋`islands-candidate`＋`islands-acceptance`＋`hex-environment`＋`hex-world` 重複 3 次 | 348 passed／60 skipped／0 failed |
| 突變測試 | 拿掉發光材質的複製後，兩項單元測試失敗；還原後通過 |
| 視覺 A/B | 6 路由 × 桌機／手機，24 張畫面 0 像素差；DOM 相同；program／shader 數量相同 |
| 效能 | draw call、三角形、陰影 pass 逐項相同；時間指標 **Inconclusive（輕微）**：飛行與環繞 FPS 未觀察到可穩定重現的下降，桌機 A2 預覽首幀留有未確認訊號（KNOWN_ISSUES P1-30）。見 `logs/2026-10-31-d3-6a-environment.md` §6 |

- `e2e/hex-environment.spec.ts`（新增，桌機＋手機）：實驗室頁的背景、霧、三盞燈、太陽陰影設定與中午資料一致；GLB 暖光材質只有一份本頁複本（強度 2），色盤材質仍共用。
- scratch 實驗（不進 repo）：霧的成本（§3.4）、經由環境改太陽與陰影範圍只重畫一次陰影且與重新載入相同（§3.5）、P1-29 的確認（§3.6）、CDP profiling 與配對測試（§6）。

## D.3-5b Auto Orbit（2026-10-30，獨立 commit「auto orbit on the lab world map (Phase D.3-5b)」）

狀態：**只在 37 格實驗室頁**；候選頁、`/islands`、`/islands/legacy` 不變（0 像素差、按鈕與連結標記相同、`git diff` 0）。觸控只在 Chromium 模擬驗證；D.3-4B 仍是 Not Measured。

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0 |
| Vitest | 177 passed／6 skipped |
| Next Build | 成功；三條 `/islands` 路由仍是靜態頁 |
| E2E 全套（單次） | 189 passed／22 skipped／3 failed（3 個都是既有 `player.spec.ts`，P1-11） |
| E2E `hex-camera`＋`hex-scale`＋`islands-candidate`＋`islands-acceptance` 重複 3 次 | 276 passed／60 skipped／0 failed |
| 突變測試 | 拿掉「飛行途中先等降落」後新測試失敗，還原後通過 |
| 效能 | 與 `f719f42` 交錯 A/B（E2E 結束後單獨執行，各 6 輪）：draw call、三角形逐項相同；首幀與鏡頭飛行 FPS 在 ±2% 內。環繞 FPS 為同版本鏡頭飛行的 109%（桌機）與 100.6%（手機模擬），每幀 43 個 draw call、陰影 0，停止後重畫 0。見 `logs/2026-10-30-d3-5b-auto-orbit.md` §5 |

- `e2e/hex-camera.spec.ts` 新增 D.3-5b 9 項：預設關閉與 reduced motion、鍵盤、速度與仰角／zoom、每個停止條件、不自動恢復、旋轉中點名牌與島嶼、與鏡頭飛行不互搶、context 遺失、重畫與陰影、版面。
- `perf/world.perf.ts`：有「自動旋轉」的頁面另外量 5 秒環繞的 FPS 與停止後的重畫。

## D.3-5a 自由相機（2026-10-30，獨立 commit「free camera on the lab world map (Phase D.3-5a)」）

狀態：**只在 37 格實驗室頁**；候選頁、`/islands`、`/islands/legacy` 不變。觸控只在 Chromium 模擬驗證，**iOS Safari 待真機驗證**；D.3-4B 仍是 Not Measured。

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0（ESLint 範圍＝repo 檔案；隔離副本中不進 repo 的舊 scratch 資料夾 `capture/` 另行排除） |
| Vitest | 177 passed／6 skipped（兩項 preset／路由測試更新） |
| Next Build | 成功；三條 `/islands` 路由仍是靜態頁 |
| E2E 全套（單次） | 173 passed／20 skipped／3 failed（3 個都是既有 `player.spec.ts`，P1-11） |
| E2E `hex-camera`＋`hex-scale`＋`islands-candidate`＋`islands-acceptance` 重複 3 次 | 228 passed／54 skipped／0 failed（skipped 依設計：只在桌機或只在手機執行的項目） |
| 畫面 | 實驗室頁全景與聚焦的 canvas、候選頁與 `/islands` 的畫面，與 `86efe53` 在桌機與手機都是 0 像素差 |
| 效能 | draw call、三角形逐項相同；首幀與鏡頭飛行 FPS 在 ±10% 內（SwiftShader，交錯 A/B 各 6 輪）；拖曳旋轉與滾輪縮放 FPS 與鏡頭飛行同級，停止後重畫 0，見 `logs/2026-10-30-d3-5a-free-camera.md` §6 |

- 新增 `e2e/hex-camera.spec.ts`：拖曳旋轉、名牌拖曳不誤選、滾輪與俯仰限制、低仰角最遠時不露底色、旋轉後聚焦與返回全景（像素復原）、鍵盤、視窗尺寸、觸控（水平旋轉／垂直捲頁／雙指縮放）、360／390 px、候選頁維持固定相機。

## D.3-4A 自動化驗收（2026-10-30，獨立 commit「automated acceptance for the world map at phone widths and by keyboard (Phase D.3-4A)」）

狀態：**D.3-4A Automated Acceptance Passed**（限已執行的自動化項目）・**D.3-4B Not Measured**・**iOS Safari／Screen Reader Not Verified**。

D.3-4 分為 A 自動化驗收與 B 真機效能驗收（[DEVICE_ACCEPTANCE](DEVICE_ACCEPTANCE.md) §0）。A 只在 Chromium（桌機 1440 px、iPhone 13 模擬、360／390 px）執行，**不是**真機證據。

| 檢查 | 結果 |
|---|---|
| 新增 `e2e/islands-acceptance.spec.ts`（兩版：360／390 px 整頁無水平溢出、鍵盤 Tab＋Enter 聚焦與返回全景含焦點框、清單模式全鍵盤進入教材、`main` 內按鈕與連結都有可讀名稱） | 重複 3 次 36 passed／24 skipped／0 failed（skipped：手機不跑鍵盤、桌機不跑窄寬度，依設計） |
| `islands-candidate`＋`islands`＋`device-tool`＋`islands-acceptance` 同一次執行（相容性） | 92 passed／14 skipped／0 failed（106 項） |
| ESLint／TypeScript／Vitest／Build | exit 0／exit 0／177 passed、6 skipped／成功（三條 `/islands` 路由仍是靜態頁） |
| 全套其他 spec | 同一份 `src/` 的上一輪全套：149 passed／6 skipped／3 failed（皆為 P1-11 `player.spec.ts`） |
| **B 真機效能** | **Not Measured**：iPhone SE（第 3 代）、iPhone 16、中階 Android |

## D.3-4 真機驗收準備（2026-10-30，獨立 commit「real-device acceptance tool and checklist for the world map (Phase D.3-4 preparation)」）

提交前在新的隔離副本重跑完整工程驗證（含文件修正與量測工具的區網安全修正；`src/` 與 `72e3eb6` 0 行差異）：

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript／checkJs | 都是 exit 0（`perf/device/*.mjs`、`perf/instrument.mjs` 以 `tsc --allowJs --checkJs --strict` 另外檢查） |
| Vitest | 15 files，177 passed／6 skipped（Java 無 JDK） |
| Next Build | 成功；`/islands`、`/islands/candidate`、`/islands/legacy` 仍是靜態頁 |
| E2E 全套（單次） | 149 passed／6 skipped／3 failed；3 個失敗都是既有的 `player.spec.ts`（P1-11），與本輪無關 |
| E2E `device-tool` 重複 3 次 | 42 passed／6 skipped／0 failed（含新增的區網暴露檢查；skipped：雙指縮放只在手機模擬） |
| **真機** | **未執行**，D.3-4 未通過、未判定 |

以下為準備階段當時的紀錄。

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0。ESLint 用 repo 的 `eslint.config.mjs`，沒有額外排除：`perf/device/*.mjs`、`perf/instrument.mjs` 等本輪檔案都在檢查範圍（以 `--print-config` 確認）。D.2c-2／D.3-3 所說的「排除 scratch 量測腳本」指當時放在隔離副本、不進 repo 的暫存腳本，與本輪無關。`perf/device/server.mjs`、`probe.mjs` 另以 `tsc --allowJs --checkJs --strict` 檢查，exit 0 |
| Vitest | 177 passed／6 skipped；新增 `tests/device-report.test.ts` 10 項 |
| Next Build | 成功；三條路由仍是靜態頁 |
| E2E `device-tool` | 重複 3 次 36 passed／6 skipped／0 failed（skipped：雙指縮放只在手機模擬） |
| E2E `islands-candidate`＋`islands`（單次） | 66 passed／4 skipped／0 failed；其餘 spec 本輪未跑（`src/` 無變更） |
| 桌機 harness | 儀器搬到 `perf/instrument.mjs` 前後交錯各 2 次：每幀 draw call 與三角形逐項相同，FPS、首幀在誤差內 |
| 桌機 Safari dry-run | 注入程式在 WebKit 正常計數（每幀成本與 Chromium 相同）；6／8 頁後因視窗在背景而取消，工具正確標為不可靠 |
| **真機** | **未執行**：沒有實體裝置；本機沒有 adb、Xcode／iOS 模擬器。D.3-4 未通過 |

- 真機量測與檢查流程、驗收表、方法：[DEVICE_ACCEPTANCE](DEVICE_ACCEPTANCE.md)。工具是 Mac 上的 proxy（`node perf/device/server.mjs`），不修改應用程式；未開啟量測時頁面逐位元組原樣轉送。
- `e2e/device-tool.spec.ts` 在一般 E2E 中自行以空閒埠啟動 proxy，檢查工具本身（不是真機結果）。數字對照見 `logs/2026-10-30-d3-4-prep.md` §5。

## D.3-3 Preflight 候選頁與回退頁（2026-10-30，獨立 commit「candidate and rollback routes for the world map switch (Phase D.3-3 preflight)」）

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0（ESLint 排除 scratch 量測腳本） |
| Vitest | 167 passed／6 skipped；新增 `tests/islands-routes.test.ts` 3 項（候選頁＝實驗室減探針、候選頁只用共用 Explorer、`/islands/legacy` 就是 `/islands` 且 noindex） |
| Next Build | 成功；`/islands/candidate`、`/islands/legacy` 都是靜態頁 |
| E2E `islands-candidate`＋`islands`＋`hex-scale`＋`hex-world` | 重複 3 次 348 passed／12 skipped／0 failed（skipped：hover 只在桌機、360／390 px 與桌機標題檢查各只在對應裝置） |
| E2E 全套（單次） | 135 passed／3 failed／4 skipped（失敗都是既有 player，P1-11） |
| 渲染成本 | 候選頁與 37 格實驗室的全景／聚焦 draw call、三角形、陰影 draw call 逐項相同（43／28,569、26／38,339、0）；飛行 FPS 與首幀在誤差內，見 `logs/2026-10-30-d3-3-preflight.md` §5 |

- `e2e/islands-candidate.spec.ts`：切換後 `/islands` 的契約（正式文案、無測試控制、3D／清單、BFS、數量、Error Boundary、context 遺失、GLB 失敗、聚焦與返回、hover、手機 360／390 px 工具列、桌機與手機的地圖標題不遮名牌、Skip Link、三條路由互不影響）。
- `e2e/islands.spec.ts` 原有情境改為在 `/islands` 與 `/islands/legacy` 各跑一次。

## D.3-2 共用 Explorer（2026-10-30，獨立 commit「shared hex world explorer with the production safety net (Phase D.3-2)」）

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0 |
| Vitest | 164 passed／6 skipped |
| Next Build | 成功 |
| E2E `hex-scale`＋`hex-world`＋`islands` | 重複 3 次 216/216；新增 37 格的清單模式、Error Boundary、context 遺失、聚焦時的島名與返回全景，以及 A2 預覽的清單模式 |
| E2E 全套（單次） | 91 passed／3 failed（既有 player，P1-11） |
| 3D 畫面 | 畫布像素（不含 HTML 疊層）與 `42b32bc` 在桌機與手機的全景、聚焦都是 0 像素差 |
| 效能 | draw call、三角形、依島拆分不變，時間在誤差內，見 `logs/2026-10-30-d3-2-shared-explorer.md` §4 |

## D.3-1 統一場景設定（2026-10-30，獨立 commit「unify the world map data and scene presets (Phase D.3-1)」）

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0 |
| Vitest | 164 passed／6 skipped；新增 `tests/scene-presets.test.ts` 4 項；世界資料指紋搬移後不變 |
| Next Build | 成功；量測探針是獨立 chunk，只有 `/islands/hex/scale/37` 會載入 |
| E2E `hex-scale`＋`hex-world`＋`islands` | 重複 3 次 186/186 |
| E2E 全套（單次） | 81 passed／3 failed（既有 player，P1-11） |
| 畫面 | 37 格實驗室與 `42b32bc` 同鏡頭截圖逐像素相同（6 張，0 像素差） |
| 效能 | draw call、三角形、依島拆分與基準相同；時間不低於基準 90%，見 `logs/2026-10-30-d3-1-scene-presets.md` §5 |

## D.3-0 正式版安全網與效能基準（2026-10-30，獨立 commit「safety net and rendering baseline for the world map (Phase D.3-0)」）

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0 |
| Vitest | 160 passed／6 skipped；新增 `tests/world-data.test.ts`（A2、19 格、37 格世界資料指紋） |
| Next Build | 成功 |
| E2E `hex-scale`＋`hex-world`＋`islands` | 重複 3 次 186/186；`islands.spec.ts` 新增清單模式、WebGL 無法建立（Error Boundary）、WebGL context 遺失、BFS 入口 4 項 × 2 裝置 |
| E2E 全套（單次） | 81 passed／3 failed（既有 player，P1-11） |
| 效能基準 | 見 `logs/2026-10-30-d3-0-baseline.md` §4；建議門檻在 §5，待批准 |

### 效能量測方法（D.3-0 起）

在隔離副本 build 並啟動 production server（不要用 port 3100），再執行：

```bash
PERF_BASE_URL=http://127.0.0.1:3118 PERF_ROUNDS=5 node node_modules/@playwright/test/cli.js test -c playwright.perf.config.ts --workers 1 --reporter line > perf.log
```

```bash
node perf/summarize.mjs perf.log
```

- `PERF_GPU=metal` 改用 Mac GPU；`PERF_CPU=4` 讓 CPU 降速 4 倍；`PERF_ROUTES` 指定要量的路由（預設 `/islands,/islands/hex/scale/37`）。
- 量測內容：每幀主畫面與陰影的 draw call 與三角形、鏡頭飛行 FPS 與幀間隔、首幀與 GLB 就緒時間；有實驗室探針的路由另外量強制渲染與依島拆分的 draw call。
- headless 的單次 rAF 數字不能當依據（P1-20），一律看多輪輪流量測的中位數。

## D.2c-2 渲染效能優化實測（37 格，2026-10-30，獨立 commit「static shadow map, tree LOD and deep-sea frame for the 37-tile prototype (Phase D.2c-2)」）

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0（ESLint 排除 scratch 量測腳本） |
| Vitest | 157 passed／6 skipped；新增 `tests/tree-lod.test.ts` 4 項（只換掉樹冠、樹幹樹枝逐三角形保留、外框與顏色誤差、三角形減半） |
| Next Build | 成功 |
| E2E `hex-scale`＋`hex-world`＋`islands` | 重複 3 次 162/162，沒有略過；新增靜態陰影與即時陰影逐像素相同的檢查（全景、聚焦、GLB 載入失敗後的暫代建築） |
| E2E 全套（單次） | 73 passed／3 failed（既有 player，P1-11） |
| 不變性 | 37 格所有資料（世界、樹、岩石、廣場、地形、海面、道路、橋、GLB 配置）hash 與 D.2c-1 相同；A2、19 格、37 格 GLB 配置與橋樑 hash 與 `fa3a9a9` 相同；受保護檔案無差異；保全庫 81/81 SHA 相符 |
| 畫面 | 同鏡頭比對 D.2c-1：桌機與手機聚焦、Retina 桌機全景 0 像素差；DPR 1 桌機全景 1.5%、手機全景 1.3% 像素不同，只在樹冠（LOD） |
| 效能（production，SwiftShader 5 輪輪流量測中位數） | FPS D.2b／D.2c-1／D.2c-2：桌機全景 19.8／11.2／20.9、桌機聚焦 18.2／10.9／19.1、手機模擬全景 30.5／19.5／35.3、手機模擬聚焦 28.2／19.5／31.2；draw call 81 → 43（聚焦 64 → 26）；三角形 74,042 → 28,569（聚焦 38,339）；Apple M6（Metal）三版都在 60 FPS 上限；閒置 rAF 請求 0。條件與距離掃描見 `logs/2026-10-30-d2c2-performance.md` |

## D.2c-1 視覺改善試作實測（37 格，2026-10-29，`f99f858`）

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0 |
| Vitest | 153 passed／6 skipped；新增 `tests/hex-natural.test.ts` 29 項（地形連續性、沙灘、道路與橋接合、廣場與主動線、森林與岩石、A2／19 格不受影響） |
| Next Build | 成功 |
| E2E `hex-scale`＋`hex-world`＋`islands` | 重複 3 次 156/156，沒有略過任何項目；新增全景名牌不遮住地塊、不超出畫面（桌機與手機） |
| E2E 全套（單次） | 71 passed／3 failed（既有 player，P1-11） |
| 不變性 | A2 世界、道路、地形與 GLB 配置，以及整份 19 格原型，計算結果的 hash 與 `fa3a9a9` 相同；37 格 GLB 配置與橋樑相同，只有燈塔步道延伸；GLB、`public/`、`scripts/`、正式 `/islands`、`camera-controller.tsx` 無差異；保全庫 81/81 SHA 相符 |
| 效能（production build，同時段 A/B） | draw call 全景 80 → 81、聚焦 75／71 → 64；三角形 50,316 → 74,042；閒置時兩版 rAF 請求都是 0；連續渲染幀率（5 次中位數）桌機 32.8 → 21.4、手機尺寸 41.9 → 31.0，成本主要來自樹木，見 P1-21 與 `logs/2026-10-29-d2c1-composition.md` |

## D.2b 工坊入口道路實測（37 格，2026-10-29，獨立 commit「add the 37-tile workshop entrance road」）

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0 |
| Vitest | 124 passed／6 skipped；`hex-scale.test.ts` 新增 5 項工坊道路測試 |
| Next Build | 成功 |
| E2E `hex-scale`＋`hex-world`＋`islands` | 重複 3 次 150/150 |
| E2E 全套（單次） | 69 passed／3 failed（既有 player，P1-11） |
| 不變性 | A2 世界與道路、A2 GLB 配置、整份 19 格原型，以及 37 格的地形三角形、樹木、橋樑，計算結果的 hash 與 `eeea613` 完全相同；GLB、registry、契約、碰撞代理與渲染元件都沒有改動；保全庫 81/81 SHA 相符 |

## D.2b Scale Refinement 實測（37 格，2026-10-29，`eeea613`）

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0 |
| Vitest | 119 passed／6 skipped |
| Next Build | 成功 |
| E2E `hex-scale`＋`hex-world`＋`islands` | 重複 3 次 150/150；沒有略過任何項目（37 格手機版碼頭已可點） |
| E2E 全套（單次） | 69 passed／3 failed（既有 player，P1-11） |
| 效能（同時段 A/B） | 37 格 draw call 241 → 80（聚焦 219 → 75）；每幀時間桌機約少 40～50%、手機模擬（4× CPU）約少 50%；rAF 幀率在 headless 不穩定，不列為依據（P1-20） |

## 島嶼尺度原型實測（2026-10-29，分支 `phase-d/basics-glb`，`34276fe`）

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0 |
| Vitest | 9 files，115 passed／6 skipped；新增 `tests/hex-scale.test.ts` 13 項 |
| Next Build | 成功，新增 `/islands/hex/scale/19`、`/islands/hex/scale/37` |
| E2E `hex-scale.spec.ts`＋`hex-world.spec.ts`＋`islands.spec.ts` | 44 項，重複 3 次 132/132；`hex-scale` 在 37 格手機版略過碼頭點擊（P1-18） |
| E2E 全套（單次） | 62 passed／4 failed：3 個既有 player（P1-11）＋1 個 `islands.spec` 手機版偶發失敗；單獨重複 5 次 70/70（P1-19） |
| 效能（原型內建 `canvas.__hexPerf()`） | 19 格：207 draw call／35k 三角形；37 格：241／50k（含陰影） |
| 受保護檔案 | D.0／D.1 檔案、正式 `/islands`、`camera-controller.tsx` 與 `c14e975` 無差異；保全庫 81/81 SHA 相符 |

## Phase D.2b 第二階段實測（2026-10-29，分支 `phase-d/basics-glb`，`a63217d`）

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0 |
| Vitest | 8 files，102 passed／6 skipped；新增 `tests/hex-terrain.test.ts` 9 項，`hex-buildings.test.ts` 增至 13 項 |
| Next Build | 成功 |
| E2E `hex-world.spec.ts`＋`islands.spec.ts` | 32 項，重複 5 次 160/160 |
| E2E 全套 | 51 passed／3 failed；失敗的仍是 `player.spec.ts` 那 3 個既有案例（P1-11） |
| 受保護檔案 | D.0／D.1 檔案、`/islands` 頁面、`camera-controller.tsx` 與 `c14e975` 比對無差異；保全庫 81/81 SHA 相符 |

## Phase D.2b 第一階段實測（2026-10-29，分支 `phase-d/basics-glb`，`c14e975`）

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0 |
| Vitest | 7 files，90 passed／6 skipped；新增 `tests/hex-buildings.test.ts` 9 項 |
| Next Build | 成功 |
| E2E `hex-world.spec.ts`＋`islands.spec.ts` | 30 項，重複 5 次 150/150 |
| E2E 全套 | 49 passed／3 failed；失敗的仍是 `player.spec.ts` 那 3 個既有案例（P1-11） |
| D.0 資產與 D.1 檔案 | 與 `063f0d4` 比對無差異；保全庫 81/81 SHA 相符 |

## Phase D.2a 實測（2026-10-29，分支 `phase-d/basics-glb`）

同一隔離副本與 Playwright 覆寫設定（127.0.0.1:3118）。

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0 |
| Vitest | 6 files，81 passed／6 skipped；新增 `tests/hex-world.test.ts` 14 項 |
| Next Build | 成功，新增靜態路由 `/islands/hex` |
| E2E `hex-world.spec.ts` | 8/8（desktop＋mobile 各 4）；重複 5 次 40/40 |
| E2E 全套 | 41 passed／3 failed；失敗的仍是 `player.spec.ts` 那 3 個既有案例（P1-11）；`islands.spec.ts` 14/14 不變 |

hex 單元測試覆蓋：
- flat-top 角點、鄰格距離 √3·R、邊中點與兩角點一致；
- 地塊不重疊（座標與幾何）；
- 橋頭位於地塊邊緣，兩端相對且跨一格水；
- 道路從廣場連到橋頭；
- 可接受不同格數的聚落與較長的橋；
- 重疊、相鄰、橋不對邊、橋跨陸地、孤島、不連續聚落都會被拒絕；
- 正式 `/islands` 的島嶼資料不變。

## Phase D.1 實測（2026-10-29，分支 `phase-d/basics-glb`）

隔離副本：`/private/tmp/claude-501/-Users-vincelo-dev-hub-github-vince115-logic-island/3691c270-fad4-470d-8a89-a4e7513470b7/scratchpad/iso`（rsync 來源＋clone node_modules）。Playwright 使用副本外的覆寫設定，以 `node node_modules/next/dist/bin/next start` 在 127.0.0.1:3118 啟動，不經 pnpm；:3100 被其他專案占用。

| 檢查 | 結果 |
|---|---|
| ESLint | exit 0 |
| TypeScript | exit 0 |
| Vitest | 5 files，67 passed／6 skipped（Java 無 JDK） |
| Next Build | 成功 |
| E2E `islands.spec.ts` | 14/14 passed（desktop＋mobile 各 7）；連續 5 次重複 70/70 |
| E2E 全套 | 33 passed／3 failed；失敗的 3 個都在 `player.spec.ts`，以 D.0 commit 建立的另一副本重跑同樣失敗，見 KNOWN_ISSUES P1-11 |
| 真實手機 | 未執行 |

islands E2E 覆蓋：GLB 200 載入且無 Draco／外部請求、另外兩島維持原模型與教材連結、Anchor 標籤不攔截點擊且 route_exit 無標籤、燈塔／碼頭說明、工坊導向 `/learn`、GLB 404 與契約節點缺失時回到原創幾何。

以下為交接當時的原始紀錄，保留不改。

## 當前實測結果（2026-10-29）

| 檢查 | 等價工具與本輪指令（隔離副本） | 結果 | 依據 |
|---|---|---|---|
| ESLint | `node node_modules/eslint/bin/eslint.js .` | **失敗，1 error／0 warning** | `evidence/actual-lint.log`；island-scene.tsx:51 react-hooks/immutability |
| TypeScript | `node node_modules/typescript/bin/tsc --noEmit --incremental false` | **失敗，exit 2** | `evidence/actual-typecheck.log`；3 個 TS7016，three 沒有可解析的宣告 |
| Next Build | `NEXT_TELEMETRY_DISABLED=1 node node_modules/next/dist/bin/next build` | **失敗，exit 1** | `evidence/actual-build.log`；5 個 islands.module.css module-not-found |
| Unit／DOM／三語範例 | `node node_modules/vitest/vitest.mjs run` | **3 files passed，45 passed／6 skipped** | `evidence/actual-unit.log` |
| E2E 清單 | `node node_modules/@playwright/test/cli.js test --list` | **22 案例成功列出** | `evidence/actual-e2e-list.log`；不啟動 browser |
| Web Browser E2E | 未執行 `test:e2e` | **Blocked：目前 build 失敗，無可驗證的最新 production bundle** | `playwright.config.ts` 需要先 build，再 start :3100；未拿舊 .next 替代 |
| Java 範例 | 系統 java_home／javac 探測，Vitest skipIf | **未驗證，6 skipped** | 本機無 Java Runtime／JDK，`javac` 只存在 shim |
| 三個 GLB 格式 | 以既有 gltf-validator `validateBytes` 讀取實際 bytes | **Verified，全部 0 error／0 warning** | `evidence/glb-current.json` 含當前 SHA-256、bytes、節點統計 |
| Three.js Desktop／Mobile | 本輪讀取歷史報告與 hashes，未重啟 viewer | **歷史報告 Verified，不是本輪 runtime 驗證** | PhaseA／v2／v2.1 的 Browser_Validation JSON，詳資產盤點 |
| 真實手機 WebGL | 未執行 | **Not Started／未驗證** | 沒有真機 Safari／Android GPU／FPS 證據 |
| R3F 正式 GLB 整合 | 未開始且未批准 | **Not Started／Blocked 批准門檻** | 原型使用 local geometry，無 GLB loader |

本輪「通過」的範圍不超過這張表，沒有 peer check／coverage／跨瀏覽器／部署驗證結果。README 的舊 lint/build 成功不能覆蓋本輪失敗。

## Unit 測試拆分

- 21 個演算法／parser／快照／游標案例：`tests/engine.test.ts`。
- 12 個共用 Lab DOM／fake timers 案例：`tests/player.test.tsx`，jsdom setup 在 `tests/setup.ts`，不是 browser rendering。
- 6 Python＋6 C++17 範例實際執行：`tests/examples.test.ts`；編譯檔寫入 OS tmpdir。
- 6 Java 範例 skip：不能標「Java 已可執行」。Java 17+ 語法是內容意圖，需有 JDK 才驗證。
- 合計 51 tests＝45 passed＋6 skipped。無單獨教材 coverage 百分比、沒有生成 HTML coverage。

測試覆蓋細項與每課限制見 [架構](ARCHITECTURE.md)。HTML number min/max 不等於完整 engine API 驗證，新增輸入與教材應補對應測試。

## 瀏覽器與權限

原 README／playwright.config.ts 記錄 2026-10-28 browser 被權限政策擋住，當時未執行。本輪沒有重新測試該政策，**不推斷今天同樣被擋**；因最新 build 不成立，先停在列出 22 案例，沒有更換 port 或瀏覽器繞過問題。現有 E2E 對教材，沒有任何 `/islands`／GLB 整合案例。

本輪讀過安裝內 `node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md`、`vitest.md`；正式 production E2E 應依該版本指南先取得可建置 bundle。首次修復經授權後，建議順序：lint → tsc → unit → clean build → test:e2e → 新增 islands 整合驗收。禁止直接對 stale .next 開 server 宣稱當前程式通過。

## GLB 與獨立 Three.js 的細節

| 資產 | bytes／triangles／nodes／materials | 本輪 Khronos | 歷史主 pass calls |
|---|---|---|---|
| v1 技術修復 GLB | 74,336／882／49／15 | 0 error、0 warning、0 info | 43 |
| v2 | 828,192／9,324／43／2 | 0 error、0 warning、0 info | 21 |
| v2.1 | 879,748／9,800／46／2 | 0 error、0 warning、**1 info** | 24 |

v2.1 info 為 `UNUSED_OBJECT`，位置 `/meshes/7/primitives/0/attributes/TEXCOORD_0`，不是 warning，但不應隱藏。三份 GLB 皆沒有相機／燈光，沒有 required extension；用到 emissive strength。

歷史 viewer 使用 Three r186、Headless Chrome／SwiftShader，桌面 1600×900、手機視窗 390×844；不等於 iOS Safari 或硬體效能。v2.1 有兩視窗各三地標最近命中 Raycast（lighthouse／learn／entry），前兩版本僅有較小的地標／pivot smoke check；不混用覆蓋程度。原始嚴格共面腳本 exit 1 與 Validator 0/0 並存，詳 [已知問題](KNOWN_ISSUES.md)。

## 重現與證據保全

在新環境需核對 Node／pnpm／編譯器再安裝固定 lockfile，且知道 pnpm 12 會驗證依賴；本輪不更動 workspace.yaml 關閉該行為。若已有完整安裝，直接工具 CLI 可避免 audit 副本自動 install；應先檢查套件可執行，不能使用缺檔的暫存副本。

`evidence/test-summary.json` 記錄 exit codes 與副本位置；`actual-*.log` 是無色彩控制碼的實測輸出。`source-before.json`／`source-protection.json` 證明原始程式未變；暫存路徑可日後失效，關鍵結果已保存至交接文件，不依賴 tmp 永久存在。
