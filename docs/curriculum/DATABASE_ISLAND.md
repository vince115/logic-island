# 資料庫應用島（Database Applications）課程規格

> Phase F.1a（2026-11-02 起），F.1b 加上 DB06–DB10，F.1c 加上 DB11–DB15，F.1d 加上 DB16–DB20。全島 20 堂（DB01–DB20，見 [CURRICULUM_320_BLUEPRINT](../planning/CURRICULUM_320_BLUEPRINT.md)）；本表列出**已完成教材**的課程，其餘仍是規劃中（只有大綱、沒有頁面）。

## 1. 與程式課程的差異

- 不教程式語言本身：每堂課以 `capabilities` 宣告用什麼教（F.1b）：`sql`（DB01–DB07、DB09–DB20）、`er-diagram`（DB08、DB09、DB20）、`normalization`（DB10、DB20）、`query-plan`（DB11、DB12、DB20）、`transaction-timeline`（DB14、DB15）、`driver-code`（DB16、DB17、DB20：應用程式透過驅動程式使用資料庫，Python／JavaScript 程式在測試中實際執行並比對輸出，Java 只編譯，頁面註明）、`protocol-sequence`（DB16）、`architecture-diagram`（DB19：架構圖與備份、複寫的確定性模擬，不是自由繪圖）、`visualization`（DB18 資料模型比較、DB20 關卡）。`supportedLanguages: []`：沒有 `program-code` 的課沒有程式練習與四語版本，SQL 也不寫四語版本（[LESSON_CONTENT_SCHEMA](LESSON_CONTENT_SCHEMA.md) §8）；驅動程式範例的語言分頁只屬於範例本身。DB08 只有 ER 模型，沒有 SQL。
- SQL 範例、練習場與練習都在瀏覽器裡用 SQLite（sql.js，WebAssembly）執行：`src/lib/sql/`，資料集 `school`／`shop`／`company`／`registrar`／`empty` 與隱藏檢查用的 `-b` 版本（`src/lib/sql/datasets.ts`）。建表與修改資料的練習（DB07、DB09）以「檢查敘述」判定：執行後比對每個檢查敘述的結果（查詢結果、被接受或被拒絕）。
- ER 圖與 ER 建構（DB08、DB09，`src/lib/er`、`er-builder.tsx`）與正規化工作台（DB10，`src/lib/normalization`）都在瀏覽器裡計算與檢查，依意義或條件判定，不偽裝成 SQL 查詢。
- 練習以**結果比對**判定（不比對 SQL 字串）：學習者的查詢與參考解答各自在全新的資料上執行，比較欄位數、資料列與（題目要求時）順序與欄名；再用隱藏資料檢查一次，只顯示通過與否。
- 課程的標題、slug、學習目標、核心概念、難度、必修與建議先修**直接讀自藍圖**（`planning-data.json`），`lessons.ts` 只補摘要與預估時間；藍圖的 `status` 保持規劃當時的值，是否上線由課綱決定。
- 完成條件與其他課相同：讀完並通過觀念測驗（`src/lib/progress.ts`，key 與版本不變）；SQL 練習不計入進度。

## 2. 已完成的課程

| ID | 課程 | 難度 | 時間 | 必修先修 | 建議先修 | 練習場資料 | 狀態 |
|---|---|---|---|---|---|---|---|
| DB01 | 資料庫與 DBMS 概念<br>`database-concepts` | 入門 | 40 分 | F11 | D09、F03 | `school` | **完整 v1.0.0** |
| DB02 | 關聯式模型：表、鍵與關聯代數<br>`relational-model` | 入門 | 50 分 | DB01 | D08 | `school` | **完整 v1.0.0** |
| DB03 | 用 SELECT 查詢資料<br>`sql-select-queries` | 入門 | 50 分 | DB02 | F06 | `school` | **完整 v1.0.0** |
| DB04 | 彙總函式與 GROUP BY<br>`sql-aggregation-and-grouping` | 入門 | 50 分 | DB03 | D09 | `school` | **完整 v1.0.0** |
| DB05 | 多表查詢：JOIN<br>`sql-joins` | 中級 | 60 分 | DB03 | DB02、DB04 | `shop` | **完整 v1.0.0** |
| DB06 | 子查詢、CTE 與視窗函式<br>`sql-subqueries-ctes-and-window-functions` | 中級 | 70 分 | DB04、DB05 | F18 | `company` | **完整 v1.0.0**（F.1b） |
| DB07 | 建立與修改資料：DDL、DML 與約束<br>`sql-ddl-dml-and-constraints` | 中級 | 60 分 | DB03 | DB02、F02 | `shop`（練習另用 `empty`） | **完整 v1.0.0**（F.1b） |
| DB08 | ER 模型<br>`er-modeling` | 中級 | 60 分 | DB02 | DB07、D16 | 無（ER 建構活動） | **完整 v1.0.0**（F.1b） |
| DB09 | 從 ER 圖到資料表綱要<br>`er-to-relational-mapping` | 中級 | 60 分 | DB08、DB07 | DB05 | `empty`（ER 圖＋DDL） | **完整 v1.0.0**（F.1b） |
| DB10 | 正規化<br>`normalization` | 中級 | 70 分 | DB09 | DB05 | `registrar`（＋正規化工作台） | **完整 v1.0.0**（F.1b） |
| DB11 | 索引與 B+ 樹<br>`database-indexes` | 中級 | 70 分 | DB03、D14 | D10、A04、DB07 | `sales`（＋B+ 樹探索、查詢計畫） | **完整 v1.0.0**（F.1c） |
| DB12 | 查詢計畫與效能調校<br>`query-plans-and-optimization` | 進階 | 70 分 | DB11、DB05 | A01、DB06 | `sales`（查詢計畫） | **完整 v1.0.0**（F.1c） |
| DB13 | 檢視表、預存程序與觸發器<br>`views-and-stored-procedures` | 中級 | 60 分 | DB07、DB06 | F13 | `company` | **完整 v1.0.0**（F.1c） |
| DB14 | 交易與 ACID<br>`transactions-and-acid` | 中級 | 60 分 | DB07 | DB13、PL13（規劃中） | `empty`（＋交易時間軸） | **完整 v1.0.0**（F.1c） |
| DB15 | 隔離等級與並行控制<br>`isolation-levels-and-concurrency-control` | 進階 | 70 分 | DB14 | PL14（規劃中）、DB11 | `shop`（＋交錯排程模擬） | **完整 v1.0.0**（F.1c） |
| DB16 | 程式串接資料庫與 ORM<br>`database-application-programming` | 中級 | 70 分 | DB07、PL02（規劃中） | DB05、DB14、PL09（規劃中） | `shop`（＋驅動程式範例、往返序列） | **完整 v1.0.0**（F.1d） |
| DB17 | SQL Injection 與資料庫安全<br>`sql-injection-and-database-security` | 中級 | 60 分 | DB16 | DB13 | `auth`（＋驅動程式範例） | **完整 v1.0.0**（F.1d） |
| DB18 | NoSQL 資料模型<br>`nosql-data-models` | 中級 | 60 分 | DB10 | D09、D16、DB14 | `documents`（＋資料模型比較） | **完整 v1.0.0**（F.1d） |
| DB19 | 備份、複寫與擴展<br>`backup-replication-and-scaling` | 進階 | 70 分 | DB14 | DB15、DB18 | `sales`（＋架構圖、備份與複寫模擬） | **完整 v1.0.0**（F.1d） |
| DB20 | 資料庫應用島綜合挑戰：設計並實作資料庫系統<br>`database-applications-capstone` | 進階 | 120 分 | DB10、DB12、DB17 | DB15、DB18、DB19 | `sales`、`empty`（＋ER 建構、正規化、查詢計畫、關卡） | **完整 v1.0.0**（F.1d） |

全島 20 堂都已完成（F.1d）。DB20 是本島最後一堂：頁尾顯示「本島課程已到最後一堂」、學習路線的下一步與本島的橋，不連到其他島的第一堂。上一堂／下一堂只在本島內移動（F.1b）：DB01 沒有上一堂，A20 的下一堂不再是 DB01。
