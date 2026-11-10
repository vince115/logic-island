# 2026-11-02 Phase F.1d 資料庫應用島完成：DB16–DB20 與全島驗收

## 指示範圍

使用者授權 Phase F.1d，內容如下：

- DB16–DB20 五堂正式教材；能力與活動優先重用既有的；新活動走活動 registry、延遲載入、不加不必要的依賴；
- DB01–DB20 全島一致性與 SQL 正確性驗收；DB13 標明 SQLite／標準概念／其他 DBMS；DB14 若能可靠地加入交易邊界驗證就實作；
- Registry 達 320／80／240、資料庫應用島 20／20；DB20 不連到其他島的第一堂；
- 分批本地 commit；禁止 Push、Merge、Deploy、Rebase、Reset Hard、Git Clean；完成後停止，不開始下一座島。

## 起點

- `phase-d/basics-glb`，HEAD `d4627e2`（F.1c 文件 commit），工作目錄只有未追蹤的 `.claude/`。
- 320 堂：完整 75、規劃 245；資料庫應用島 DB01–DB15。

## Batch 0：藍圖對照與基礎能力

| 課程 | 藍圖活動／練習 | 重用 | 缺口與決定 |
|---|---|---|---|
| DB16 程式串接資料庫與 ORM | protocol-sequence／code | SQL 練習場、檢查敘述 | 參數綁定；應用程式與資料庫的往返序列；驅動程式範例（Python、JavaScript 在測試中執行，Java 編譯） |
| DB17 SQL Injection 與資料庫安全 | sql-playground／code | SQL 練習場 | 參數組練習（含惡意輸入）；`auth` 資料集；GRANT／REVOKE 以標明的 PostgreSQL 文字說明 |
| DB18 NoSQL 資料模型 | ds-comparison／design | 共用視覺化 ds-comparison | 資料庫課程也可宣告 `visualization` 能力；`documents` 資料集（JSON 文件、鍵值、追蹤圖） |
| DB19 備份、複寫與擴展 | architecture-diagram／case-study | SQL 練習場（`sales`） | 架構圖＋備份／複寫的確定性模擬與練習；藍圖缺口 cloud-platforms 維持（只以一般說法提到託管服務） |
| DB20 綜合挑戰 | challenge-stages／sql | ER 建構、正規化、查詢計畫、檢查敘述、驅動程式範例 | 不需新能力；challenge-stages 可以引用 DB 課程 |

結論：不需要新的大型 runtime、外部服務或架構變更，沒有停下來另提方案。新增的都是瀏覽器內的小型 TypeScript 引擎與元件，沒有新依賴：

- 參數綁定（`runSql(db, sql, params)`，佔位符號計數略過字串與註解）；查詢練習的參數組 `paramSets`（可見與隱藏），硬寫的值或對惡意輸入出錯的查詢不會通過。
- 當機一致性檢查（`atomic`）：在學習者 SQL 的每一個敘述之後模擬當機（未提交的交易被撤銷），學習者可能留下的每個狀態都必須是參考解答可能留下的狀態。
- protocol-sequence（T2）：一項工作的幾種做法（N+1 逐筆、JOIN、批次 IN），每次往返都在瀏覽器的 SQLite 實際執行，列出 SQL、參數與列數。
- architecture-diagram（T1）：系統架構圖（SVG＋文字替代）與兩個確定性模擬：備份計畫（完整／增量／日誌封存，故障時間 → 還原步驟、還原點、遺失、還原時間）與複寫（非同步延遲／同步，讀取、切換、遺失的寫入）；練習答案由模擬器算出。**沒有自由繪圖**：活動 registry 的說明已註明。
- driver-code 能力：`tests/curriculum-driver.test.ts` 執行每個 Python（`sqlite3`）與 JavaScript（`node:sqlite`）範例並比對輸出，Java 以 `javac --release 17` 編譯（本機沒有 SQLite JDBC 驅動程式，頁面註明）。
- 資料集 `auth`／`auth-b`（假的密碼雜湊、角色、停用帳號、登入紀錄）與 `documents`／`documents-b`（內嵌顧客與品項的 JSON 訂單、鍵值工作階段、追蹤關係圖）；模組層級的產生呼叫標成 `/* @__PURE__ */`（F.1c 的打包教訓）。
- 跨島的必修先修（DB16 → PL02，程式語言島規劃中）交給目錄檢查，頁面寫成「（規劃中）」、不給連結。

### DB14 原子性（交易邊界驗證）

F.1c 的限制是 SQL 轉帳練習分不出「BEGIN…COMMIT」與「兩個自動提交的 UPDATE」。現在 `ex-transfer-sql` 加上 `atomic` 檢查：兩個自動提交的 UPDATE 在中間當機時會留下「扣了款、沒入帳」的狀態，參考解答不可能留下這個狀態，所以不通過；這個寫法也加為第一個常見錯誤（`cef3604`）。

## DB16–DB20 完成狀態

| ID | 課程 | 能力 | 小節／範例／測驗／練習 | 練習場資料 |
|---|---|---|---|---|
| DB16 | 程式串接資料庫與 ORM | `sql`＋`driver-code`＋`protocol-sequence` | 7／5 SQL＋3 驅動程式＋1 往返序列／7／參數組查詢、N+1 改寫、當機檢查的下單交易 | `shop`（參數框） |
| DB17 | SQL Injection 與資料庫安全 | `sql`＋`driver-code` | 7／7 SQL＋2 驅動程式／7／兩個參數組查詢（登入、搜尋）、稽核觸發器檢查敘述 | `auth`（參數框） |
| DB18 | NoSQL 資料模型 | `sql`＋`visualization` | 8／12 SQL＋資料模型比較／7／三個查詢（內嵌欄位、展開陣列、可達人數） | `documents` |
| DB19 | 備份、複寫與擴展 | `sql`＋`architecture-diagram` | 8／5 SQL＋2 備份＋2 複寫／7／重新分片查詢、時間點還原、切換遺失 | `sales` |
| DB20 | 資料庫應用島綜合挑戰 | `sql`＋`er-diagram`＋`normalization`＋`query-plan`＋`driver-code`＋`visualization` | 7／7 SQL＋1 ER 圖＋1 正規化＋1 驅動程式＋五個關卡／7／ER 建構、建表檢查敘述（含計畫）、參數組報表 | `sales`、`empty` |

課程的標題、slug、學習目標、核心概念、難度、先修、活動都讀自藍圖，沒有改動。由五位撰寫 agent 各寫一個檔案（私有副本），主線整合、重新驗證並逐題校對。

整合時主線修改：

- `DsComparison` 的標題、欄名與「適合／較慢」原本寫死為時間複雜度；加上可選的 `wording`，DB18 以資料模型的說法顯示（程式課程不變）。
- 往返序列的摘要用詞統一為「往返」。
- 驗證 DB18 測驗「環狀遞迴在 3 秒後停止」時發現第一次執行要 13 秒：計時器把載入 SQLite 的 10 秒寬限也給了查詢。改為 worker 載入完 SQLite 與資料集時通知頁面，頁面從那一刻重新計時 3 秒；實測第一次執行 3.2 秒停止（`c2e2c65`）。
- `checkSql` 遇到參數組就提前返回，同一題的 `plan` 要求從未檢查；改為所有參數組都通過後再檢查一次計畫，並加測試（`c2e2c65`）。
- 練習測試以第一組可見參數執行參考解答（原本不綁定參數，`?` 變成 NULL）。

## 全島驗收（Batch 3）

- 大小規則：DB01–DB20 每堂 6–8 小節、至少 5 個範例、7 題測驗、3 道練習。
- SQL 正確性：
  - 每個 SQL 範例的結果與頁面相同；
  - 參考解答與替代寫法在可見與隱藏資料（隱藏檢查敘述、隱藏參數組）都通過，每個常見錯誤至少一組不通過；
  - 驅動程式範例實際執行並比對輸出。
- 測驗：DB16–DB20 共 35 題由主線逐題校對，需要資料的題目（N+1 的往返數、LEFT JOIN 的列數、`ORDER BY ?`、`ADD COLUMN … NOT NULL`、注入後的查詢、`->` 與 `->>`、`json_each` 的列數、檢視表在調價後的金額、複合索引的計畫等）都在真正的 SQLite 執行核對；備份與複寫的數字由模擬器核對。
- 無法執行的語法：所有標成 SQL 的程式碼區塊都是 SQLite 能執行的；GRANT／REVOKE、`CREATE ROLE`、`FOR UPDATE`、`PARTITION BY RANGE`、`jsonb`、預存程序等只出現在標明 DBMS 的文字、提示框與表格裡（以腳本掃描確認）。DB13 已區分 SQLite、標準概念與 PostgreSQL／MySQL。
- 用詞：綱要、外鍵、交易、提交／復原、隔離等級、最佳化器等在 20 堂一致。
- 單元重新分組：原本 1–2 堂的單元，在全島寫完後依既有規則（完成的島每個單元至少 3 堂）合併為 6 個單元：資料庫與 SQL 基礎（DB01–04）、進階 SQL 與資料定義（DB05–07）、資料庫設計（DB08–10）、效能與資料庫程式（DB11–13）、交易、應用程式與安全（DB14–17）、資料模型、架構與綜合挑戰（DB18–20）。
- 完整走過：桌機與手機尺寸逐堂開啟 DB16–DB20 的活動與練習，並以新的 E2E（`e2e/db-activities-f1d.spec.ts`，16 項）固定下來。

## Registry、導覽與學習路線

- 320 堂；完整 80、規劃 240；15 座學科島；6 條路線。資料庫應用島 20／20，狀態由課程推導為 `complete`（只影響目錄與 registry；3D 首頁、`/islands` 不讀它，沒有改變）。
- DB20 是本島最後一堂：沒有下一堂，頁尾是「本島課程已到最後一堂」、返回本島課綱與學習路線的下一步，不連到其他島的第一堂。
- 發現並修正：課寫完後離開「規劃中」清單時，藍圖的 `gaps` 一併消失，路線 B 少了 cloud-platforms（DB19 寫完並沒有教雲端平台）；現在完成的課保留藍圖的缺口（`c2e2c65`）。
- 原本描述「島還在撰寫中」的測試（DB20 規劃中、資料庫島 available、路線上還有規劃中的 DB 課、目錄的「規劃中」計數）改為斷言完成後的狀態；規劃中的課沒有頁面、下一堂規劃中不給連結等規則，改用規劃中的島（PL01、PL02）檢查。

| 路線 | 已開放／總數 |
|---|---|
| A | 60／60 |
| B | 46／86 |
| C | 32／54 |
| D | 42／84 |
| E | 32／142 |
| F | 17／89 |

## 測試結果（HEAD 的乾淨副本，不含工作目錄裡其他工作階段未提交的修改）

| 檢查 | 結果 |
|---|---|
| tsc／ESLint | exit 0／exit 0 |
| 規劃資料同步 | `node scripts/planning-data.mjs --check`：up to date |
| Vitest（全部，JDK 在 PATH，背景執行） | **1557 passed**／0 failed／0 skipped（41 個檔案，259 秒；新增 `curriculum-driver`、`sql-sequence`、`ops`，`sql-engine`／`sql-plan`／`curriculum-*`／`world-*` 擴充） |
| Build | 成功，97 個靜態頁（F.1c 92；多 DB16–DB20） |
| E2E 全套（desktop＋mobile，最終 build） | **388 passed／39 skipped／3 failed**：3 項皆為既有 P1-11（`player.spec.ts`）；39 項 skipped 與 F.1c 相同。新的 `db-activities-f1d` 16 項全部通過 |
| 受保護路徑（`git diff d4627e2..HEAD`） | 3D、`src/lib/islands`、`src/app/islands`、`public`、`courses.ts`、`lab.tsx`、`src/lib/engine.ts`、`progress.ts`、60 堂程式教材、DB01–DB13 與 DB15 內容、藍圖資料：0 行差異（DB14 只改了轉帳練習，見上） |

E2E 的過程（照實記錄）：

- 第一次全套（Batch 3，含其他工作階段未提交修改的副本）：4 項新的失敗，都是仍然斷言「資料庫島撰寫中」的測試（目錄的「規劃中」計數、最後一堂的「後續課程規劃中」），改為斷言完成狀態後通過（`cf0e820`）。
- 最終全套在 HEAD 的乾淨副本執行。3118 埠被另一個工作階段在原專案啟動的 `next-server` 佔用（沒有停止它），改用 3121 埠；`sql.spec.ts` 的「只載入本站的 WebAssembly」把 `http://127.0.0.1:3118/` 寫死，因此 desktop／mobile 2 項失敗。改為使用 Playwright 的 `baseURL` 後，`sql.spec.ts` 8 項重跑全部通過；全套 386 passed＋重跑的 2 項＝388。

## Bundle

gzip，頁面自己載入的 JS（不含第一次執行才載入的 SQL worker 與 WASM）；F.1c `d4627e2` 與 F.1d 在同一台機器、用同一個腳本從各自的 production build 量測（F.1c 的數字與 F.1c 紀錄逐位元組相同）。

| 頁面 | F.1c | F.1d |
|---|---:|---:|
| 程式課程（F01、A20） | 212,330 B | 212,581 B（+251 B；沒有任何資料庫活動、資料集或 WASM） |
| SQL 課程（DB01、DB12、DB13；DB17、DB18 相同） | 224,828 B | 228,043 B（+3.2 KB） |
| DB08（只有 ER 建構） | 217,730 B | 218,035 B（+305 B） |
| DB10（SQL＋正規化） | 229,253 B | 232,524 B |
| DB11（SQL＋B+ 樹） | 228,142 B | 231,409 B |
| DB14、DB15（SQL＋交易時間軸） | 232,581 B | 235,853 B |
| DB16（SQL＋往返序列＋驅動程式範例） | — | 241,537 B |
| DB19（SQL＋架構圖與模擬） | — | 232,730 B |
| DB20（SQL＋ER＋正規化＋關卡） | — | 237,978 B |

- SQL 課程的 +3.2 KB：參數框與檢查說明在練習場介面裡，以及兩個新資料集（`auth`、`documents`）的定義。SQL 課程的頁面本來就帶著資料集定義（F.1c 也是，用來顯示資料表結構）；之後若資料集再增加，可以改成依課程的資料集分開載入。
- 程式課程只多 251 B，E2E 的 bundle 回歸測試（F.1c 起）已加入 F.1d 的標記：往返序列、架構模擬、參數綁定的程式都不會出現在程式課程。
- 任何頁面在執行查詢之前都不下載 WASM；每個活動只在用到的課載入。沒有新增依賴。

## 已知限制

- SQL 練習場是學習用的隔離，不是安全產品等級的 sandbox；參考解答在頁面上。
- 驅動程式範例的 Java 版本只編譯不執行（沒有 SQLite JDBC 驅動程式）；ORM、連線池、遷移工具、PostgreSQL／MySQL 的權限與分割語法都是標明的文字，網站不執行。
- architecture-diagram 是固定架構圖加確定性的教學模擬，不是自由繪圖；備份與複寫模型不代表任何產品的實際行為。
- DB18 以 SQLite 的 JSON 函式與遞迴 CTE 模擬各種資料模型，頁面註明這不是 MongoDB、Redis、Cassandra、Neo4j 的查詢方式。
- 計畫與 JSON 的範例結果取自 SQLite 3.49.1；升級 sql.js 可能改變，測試會指出。
- P1-11、P1-32、P1-33、P1-34 仍未處理。
- 工作目錄另有其他工作階段未提交的修改（`src/app/globals.css`、`src/app/layout.tsx`、`src/components/curriculum/curriculum.module.css`、`src/lib/site-time.ts`），本階段沒有修改或提交它們。

## 下一步

資料庫應用島已完成。依指示本階段到此停止，不開始下一座島；下一階段（例如程式語言島或其他 CS 島）需要另行授權。
