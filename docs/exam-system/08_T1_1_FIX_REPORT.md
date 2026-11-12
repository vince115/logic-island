# 08 Shared Trial System T.1.1 修正報告

- 依據：[07 驗收報告](07_T1_ACCEPTANCE_REPORT.md) 的 B2、Q1、Q2、Q4、Q5、I1、I2。
- 分支：`trials/mvp`，以 HEAD `5fe4569` 為基準；**尚未 commit**，等待確認。
- 沒有新增考試功能或題目，沒有修改 3D、沒有 push／merge／部署，沒有修改其他工作階段的未提交檔案。
- **沒有**把任何題目標記為已完成人工校對：批次的審稿紀錄沒有變動，B1 仍待使用者處理。

## 1. 修正項目

### A. Vitest 逾時（B2）

**造成額外負載的操作**：
- `trials-import.test.ts` 本身的測試只要約 22 ms；檔案耗時約 1.1 s，其中 76% 是載入模組。
- 逐一量測題庫依賴的模組（Node 直接 import，單次）：

  | 模組 | 載入時間 |
  |---|---:|
  | `@/content/trials/schema` | 16 ms |
  | `@/content/curriculum/lessons` | 60 ms |
  | `@/lib/engine` | 12 ms |
  | `@/content/world/islands` | 58 ms |
  | **`@/content/world/activities`** | **916 ms** |
  | `@/content/trials`（整個題庫） | 977 ms |

- `activities` 為了列出活動，載入整套課綱（`@/content/curriculum`，含所有教材內容）。
  - 題庫只為了 `trialContext()` 的一個 `activityIds` 集合才 import 它；
  - 但 `trialContext()` 放在 `src/content/trials/index.ts`，所以**任何 import 題庫的檔案**都要付出約 0.9 s。包括只讀題庫、不做驗證的 `trials-dom.test.tsx`，以及網站的試煉與世界頁面。
- T.0 有 2 個測試檔付出這個成本（`trials-validate`、`trials-dom`），T.1 變成 3 個（加上 `trials-import`）。這和 07 §5.2 的觀察一致：排除 `trials-import.test.ts` 時 `highlight.test.ts` 會通過。

**修正**：
- 把 `trialContext()` 移到新的 `src/content/trials/context.ts`。只有 `trials-validate.test.ts`、`trials-import.test.ts` 與 CLI 匯入它；網站從未使用它。
- import 題庫的時間從 977 ms 降到 **29 ms**；`trialContext` 本身仍是約 0.7 s，但只在需要驗證的地方載入。
- 付出這個成本的測試檔從 3 個回到 2 個，與 T.0 相同。
- **沒有**修改任何 timeout，沒有跳過或停用測試，沒有刪減測試內容。驗證的對照資料完全相同，同一個函式，只是換了檔案位置。

**這一步不夠**：
- 移出 `trialContext` 之後，預設 worker 數下的全套 Vitest 仍然 4/4 逾時（§4.1）。當時機器負載 7～15，主要來自其他工作階段。
- 改為依你的指示比較 worker 配置：
  - `highlight.test.ts` 單獨執行：3,049 ms（負載 14.8）；
  - 全套限制為 `--maxWorkers=50%`（6 個 worker）：**通過**，3,809 ms（負載 15）；
  - 預設 11 個 worker（核心數 − 1）：4/4 失敗，5,152～6,223 ms。
- 結論：主要原因是 **CPU 過度分配**。11 個 worker 同時跑 CPU 密集的測試檔（highlight、課綱），機器又被其他程序佔用時，單一測試的實際執行時間就會被拉長。

**第二項修正**：
- `vitest.config.mts` 加上 `maxWorkers: '50%'`；
- 測試檔與測試數都不變（48 個檔案、1634 項），只改變同時執行的數量；
- 全套反而比較快：50% 為 216～263 s；預設 11 個 worker 為 266～320 s。

### B. 四題解析（Q1、Q6、Q7、Q36）

- 使用匯入流程既有的版本機制：
  1. 在批次檔中修改 `explanation`，並加上 `change {kind: "editorial", note, at}`；
  2. 先 dry-run（報告：新版本 4、未變更 36、錯誤 0、警告 0）；
  3. 再 `--write`。
- 匯入報告：[imports/2026-11-03-moex-114-pukao-computer-t1-1-revisions.md](imports/2026-11-03-moex-114-pukao-computer-t1-1-revisions.md)。
- 系統可以安全建立新版，**沒有發現設計缺口**：
  - **Revision 1 原樣保留**：與 HEAD 逐欄相同，仍在 `revisions[0]`；
  - **雜湊不變**：雜湊只涵蓋題幹、選項、答案與配分，而這次 4 題都沒有改到這些內容。`published-hashes.json` 新增的 `@2` 與 `@1` 相同（見 §3）；
  - **歷史作答**：session 在開始時就凍結了 revision、雜湊、配分、選項順序與正解，所以舊成績不會改變。成績報告只在雜湊不同時顯示「有修訂」，這次不會出現；但會顯示新的解析。新增的 DOM 測試涵蓋這一點；
  - **官方題文、選項與官方答案不變**：`answer.official: true`、`verifiedBy: 'official-key'` 都沒有變；
  - **解析不會被標成官方**：`explanation.origin` 仍是 `logic-island-original`，頁面仍標示「Logic Island 撰寫，非官方解答」；
  - **人工校對**：審稿紀錄沒有新增，B1 仍未完成。

**Q36 的歧義**：在不改變題意的前提下，**無法消除**。題文與選項必須與原卷相同，而 KB 的定義確實會讓 (B) 在十進位下也成立。目前的處理：
- 解析說明兩種定義，以及「本站依官方答案評分；在十進位定義下 (B) 也說得通，這一題有單位上的歧義」；
- **官方答案沒有改**，評分仍以 (A) 為正解。

**題目警示或暫停出題的方案**（未實作，等你決定）：

| 方案 | 內容 | 影響 |
|---|---|---|
| 1. 題目警示（建議） | 在 revision 加一個選填欄位，例如 `notice`（「這一題的 KB 有十進位與二進位兩種解讀，本站依官方答案 (A) 評分」），作答頁在題目下方顯示，成績報告與錯題本也顯示 | 需要 schema、views 與作答頁的小幅修改，屬於新的顯示功能，所以這次沒有做；第 27 題（else 沒有 return）也可以使用。要新增 revision 3，雜湊會不會改變取決於是否把 `notice` 納入雜湊（建議不納入，它不影響評分） |
| 2. 暫停出題 | 把第 36 題移出 `moex-114-pukao-3448` 試卷 | 試卷變成 39 題、97.5 分，與原卷不同，需要在試卷 `note` 說明；版本號 1.0.0 → 1.1.0 |
| 3. 維持現狀 | 只在交卷後的解析說明 | 作答時看不到歧義；答 (B) 的學習者交卷後會看到說明 |

### C. Importer（I1、I2）

- **I1**（`src/lib/trials/import.ts`、`scripts/trials/import.ts`）：
  - 新增 `batchFileOf(id)`；輸出的 `batch.file` 一律記錄 `src/content/trials/batches/<id>.json`，不再記錄執行時給的路徑；
  - 批次檔不在這個位置時，報告出現警告，`--write` 拒絕寫入（exit 1），dry-run 仍然可以執行；
  - 現有兩個批次的檔名都等於 id，所以輸出沒有任何變動；**批次格式不變**。
- **I2**（新增 `scripts/trials/write-files.ts`，CLI 改用它）：
  - `writeAllOrNothing` 先把三個檔案都寫成暫存檔，再逐一把原檔移到備份、換上新檔；
  - 任何一步失敗，都會把原檔放回、刪除暫存檔；成功後才刪除備份；
  - 開發時發現並修正了一個自己的錯誤：搬移原檔失敗時，不能把那個沒有搬成功的「備份」還原回去。
  - 這是小範圍的輔助函式，**不需要架構調整**；它只改變 CLI 寫檔的方式，不影響題目內容。
  - CLI 捕捉寫入錯誤，輸出 `not written (nothing was changed): <原因>` 並以 exit 1 結束。原本是未捕捉的 Node 例外與 stack trace。

## 2. 修改檔案

| 檔案 | 狀態 | 內容 |
|---|---|---|
| `src/content/trials/context.ts` | 新增 | `trialContext()`（由 index.ts 移入，內容不變） |
| `src/content/trials/index.ts` | 修改 | 移除 `trialContext` 與它的 5 個 import；註解 |
| `src/lib/trials/import.ts` | 修改 | `batchFileOf`；非標準位置的警告；輸出記錄標準路徑（I1） |
| `scripts/trials/import.ts` | 修改 | 從 `context.ts` 匯入；`--write` 只接受標準位置；改用 `writeAllOrNothing`，寫入失敗時輸出明確訊息（I1、I2） |
| `scripts/trials/write-files.ts` | 新增 | `writeAllOrNothing`（I2） |
| `vitest.config.mts` | 修改 | `maxWorkers: '50%'`（B2） |
| `src/content/trials/batches/2026-11-03-moex-114-pukao-computer.json` | 修改 | 第 1、6、7、36 題的 `explanation` 與 `change` |
| `src/content/trials/generated/2026-11-03-moex-114-pukao-computer.json` | 匯入流程寫入 | 4 題新增 revision 2，`currentRevision` 2 |
| `src/content/trials/published-hashes.json` | 匯入流程寫入 | 新增 4 個 `@2` |
| `docs/exam-system/imports/2026-11-03-moex-114-pukao-computer-t1-1-revisions.md` | 新增 | 這次的匯入報告 |
| `tests/trials-import.test.ts` | 修改 | 從 `context.ts` 匯入；I1 測試 1 項、I2 測試 4 項；測試用的批次路徑改為標準位置 |
| `tests/trials-validate.test.ts` | 修改 | 從 `context.ts` 匯入；revision 2 的檢查 |
| `tests/trials-dom.test.tsx` | 修改 | revision 1 的舊 session 仍保留原成績、不顯示「有修訂」、顯示新解析 |
| `docs/exam-system/06_QUESTION_IMPORT_FLOW.md` | 修改 | 標準位置、全有或全無寫入、`context.ts` |
| `docs/exam-system/07_T1_ACCEPTANCE_REPORT.md` | 修改 | 加上 T.1.1 的處理結果 |
| `docs/exam-system/08_T1_1_FIX_REPORT.md` | 新增 | 本報告 |

沒有修改的部分：
- `highlight.test.ts` 與任何 timeout（`vitest.config.mts` 只加了 worker 數）；
- 其他題目：原創 13 題，以及 MOEX 的另外 36 題，都與 HEAD 逐位元組相同；
- 世界、3D、試卷、來源、標籤、頁面元件；
- Theme 的 5 個檔案。

## 3. 題目 Revision 差異

四題都是：
- `revisions` 從 1 筆變成 2 筆，`currentRevision` 為 2；
- revision 2 與 revision 1 只差在 `revision`、`change: editorial`、`note` 與 `explanation`；
- 題幹、選項、答案（`official: true`）、`display` 完全相同。

| 題目 | 雜湊 r1 = r2 | 變更說明（`note`） | 解析 r1 → r2 的重點 |
|---|---|---|---|
| `moex-114-pukao-3448-q01` | `f55bd0cf` | 解析修正：DVI 不只傳數位訊號（DVI-I、DVI-A 也帶類比），改正原解析的過度簡化 | 「DVI 傳數位」→「DVI 以數位訊號為主（DVI-D 只有數位，DVI-I、DVI-A 也帶類比訊號）」 |
| `moex-114-pukao-3448-q06` | `aa5c22b6` | 解析修正：移除對 (A) 出題依據的推測，改為只說明可驗證的選項，並註明題目前提並不常見 | 刪除「例如 RAM disk…能以讀寫檔案的方式快速共享資料」的推測。改成「依官方答案為 (A)」，說明 (B)、(C)、(D) 為何不選，並寫明「考選部沒有公布解析，本站不推測 (A) 的出題依據」 |
| `moex-114-pukao-3448-q07` | `cc4466ce` | 解析修正：寫明 1 GB 的定義，並說明兩種定義下答案相同 | 加上「以 1 GB = 2³⁰ 位元組計」，以及 10⁹ 定義下 2³² < 8 × 10⁹ ≤ 2³³，仍是 33 條 |
| `moex-114-pukao-3448-q36` | `02e9e8fd` | 解析修正：說明 KB 的十進位與二進位定義、(B) 在十進位定義下也說得通，以及本站依官方答案評分 | 並列兩種定義（250 KB＝(B)、約 244 KB＝(A)）；官方答案 (A)，本站依官方答案評分；明示這一題有單位歧義；Mbps 與第 30 題的 kbps 都是十進位 |

## 4. 測試結果

測試環境：
- macOS，12 核心，Node v24.22.0；
- 隔離副本（HEAD `5fe4569` ＋ 本次變更，不含 Theme 的修改）；
- 機器同時有其他工作階段在執行，1 分鐘負載介於 4.7～15.5，無法控制。

依你的調整，**不再重複執行大量的完整測試**。進行中的 6 輪交替比較（基準／修正前／修正後）在第一輪完成前就停止了，所以沒有可以保留的結果。

### 4.1 Vitest：`highlight.test.ts`（spells every line of 1904 programs exactly，上限 5 s）

| 執行 | 版本 | worker | `highlight` 耗時 | 全套結果 | 負載（開始→結束） |
|---|---|---|---:|---|---|
| 單獨執行 | 修正後 | — | 3,049 ms | 2 passed | 14.8 |
| 全套 #1 | 修正後（只移出 context） | 預設 11 | 6,223 ms | 1 failed／1633 passed | 6.8 → 12.6 |
| 全套 #2 | 同上 | 預設 11 | 5,163 ms | 1 failed／1633 passed | 12.6 → 13.0 |
| 全套 #3 | 同上 | 預設 11 | 5,422 ms | 1 failed／1633 passed | 13.0 → 15.4 |
| 全套 #4 | 同上（設定檔誤改成不存在的 `.ts`，實際仍是預設） | 預設 11 | 5,152 ms | 1 failed／1633 passed | 14.9 → 5.7 |
| 全套 #5 | 修正後（只移出 context） | `--maxWorkers=50%`（6） | 3,809 ms | **1634 passed** | 15.0 → 14.7 |
| 全套 #6 | 修正後＋`vitest.config.mts` 的 `maxWorkers: '50%'` | 6 | 3,604 ms | **1634 passed**（48 files） | 4.9 → 5.7 |

參考：07 驗收時的 T.1（`5fe4569`），預設 worker 下 3/3 失敗（5,021～6,293 ms）；基準 `1a57cfd` 通過（4,209 ms）。

### 4.2 其他檢查

| 檢查 | 結果 |
|---|---|
| TypeScript `tsc --noEmit` | exit 0（最後一次修改後） |
| ESLint（全專案） | exit 0（最後一次修改後） |
| Vitest 試煉相關（5 個檔案） | 54 passed（T.1 為 47；新增 7 項：I1 1、I2 4、revision 2 各 1） |
| Build（flag off） | 成功 |
| Build（`LOGIC_ISLAND_TRIALS=1`＋`LOGIC_ISLAND_REGIONAL_WORLD=1`） | 成功；試煉頁含高普考的 3 個動態頁 |
| E2E `trials.spec.ts`（flag off） | 2 passed（所有 `/trials` 路由為 404），10 skipped |
| E2E `trials.spec.ts`＋`regional-world.spec.ts`（兩個 flag 都開） | **26 passed**、6 skipped：作答、重整、交卷、錯題本、高普考試卷、時間到、世界入口，以及 regional world 的島寬、名牌與鏡頭 |
| E2E 全套（flag off） | **本次沒有執行**（依你的指示減少完整測試）。T.1.1 沒有修改頁面元件、播放器或 3D；07 的全套結果是 P1-11 ×3、P1-32 ×2，基準相同 |
| 兩個批次重新 dry-run | 原創 13 題、MOEX 40 題全部「未變更」，錯誤 0、警告 0 |

### 4.3 Importer 原子寫入與 rollback（實際 CLI，隔離副本）

先在批次中真的修改一題的解析（會產生 revision 2），再讓寫入失敗：

| 情境 | exit | 結果 |
|---|---:|---|
| `src/content/trials` 唯讀（`published-hashes.json` 的暫存檔寫不進去，輸出 JSON 的暫存檔已經寫好） | 1 | 所有檔案內容不變；沒有遺留 `.tmp-`／`.bak-` 檔 |
| `generated/` 唯讀（第一個暫存檔就寫不進去） | 1 | 同上；訊息：`not written (nothing was changed): EACCES: permission denied, open '…tmp-…'` |
| 對照：可寫入 | 0 | 該題新增 revision 2，雜湊 `@2` 有記錄（三個檔案一致） |
| 從 repo 外的副本 `--write` | 1 | `not written: --write takes the batch at src/content/trials/batches/…json, not ../scen/copy.json`；檔案不變 |

「原檔已移到備份、新檔換上一半時失敗」這種情形，在 CLI 層無法安全模擬；由單元測試涵蓋：
- 刻意讓最後一個原檔無法移到備份，前兩個已換上的檔案會還原成原內容，也不會遺留暫存檔（`trials-import.test.ts`）。

## 5. 狀態分類

### 5.1 已修復

| 項目 | 修正 |
|---|---|
| B2 Vitest 逾時 | ① `trialContext` 移到 `context.ts`（題庫載入時間 977 → 29 ms）；② `vitest.config.mts` 設定 `maxWorkers: '50%'` |
| Q1、Q2、Q4、Q5 解析（第 1、6、7、36 題） | revision 2，只改解析；revision 1 與雜湊保留；官方答案不變 |
| I1 批次路徑 | 輸出記錄標準路徑；非標準位置拒絕 `--write` |
| I2 非原子寫入 | `writeAllOrNothing`，失敗時還原；CLI 輸出明確訊息 |

### 5.2 已通過驗證

- TypeScript、ESLint、兩種 build；
- 試煉的 E2E（兩個 flag 都開 26 passed；flag off 2 passed）；
- 試煉的 Vitest：54 passed；
- 全套 Vitest 在新設定下 1634 passed：#6，負載約 5；限制 worker 的 #5 在負載約 15 時也通過；
- revision 2 的雜湊與 revision 1 相同，其餘題目逐位元組不變；
- 舊作答紀錄不受影響（DOM 測試）；
- 原子寫入與 rollback（4 個單元測試，加上 CLI 的 2 個失敗情境）；
- I1 的拒絕寫入。

### 5.3 尚未通過驗證或尚未處理

| 項目 | 說明 |
|---|---|
| B1 人工逐題確認 | 40 題官方題與解析，**需要使用者**；沒有代為標記 |
| Q36 題目警示 | 歧義無法在不改題意下消除；§1.B 的方案待決定（建議方案 1：`notice` 欄位） |
| 全套 E2E（flag off） | 本次沒有重跑；07 的結果是 P1-11 ×3、P1-32 ×2，基準相同 |
| 新設定下的全套 Vitest 重複性 | 新設定（`maxWorkers: '50%'`）只完整執行 1 次（#6），另外 1 次使用相同的 CLI 參數（#5）。依指示沒有再重複 |
| I3 | CLI 子程序層的自動化測試（沒有加，以免加重 Vitest 負載） |
| D1 | T.1 log 的措辭（是否修改已提交的 log，由你決定） |
| P1-11、P1-32 | 既有問題，不在範圍內 |

### 5.4 環境造成的不確定性

- 機器負載由其他工作階段造成（4.7～15.5），無法控制，所以耗時的數字只能在同一時段互相比較。
- 單獨移出 `trialContext`（不改 worker）是否就足以在**低負載**下通過，**沒有驗證**：那 4 次預設 worker 的執行都在負載 7～15 時開始。它降低的成本是可以量測的（每個 import 題庫的檔案少約 0.9 s），但不能單獨證明它解決了逾時。
- `maxWorkers: '50%'` 在負載 15 與 5 時各通過 1 次。由 CPU 過度分配的機制來看這是合理的結論，但樣本只有 2 次。
- 在其他機器（核心數不同）上，50% 代表不同的 worker 數；例如 CI 只有 2 核心時是 1 個 worker。測試數不變，只會比較慢。

## 6. 是否具備進入 T.2 的技術條件

**技術上具備**：
- 型別、lint、build 與試煉 E2E 通過；
- Vitest 在新設定下全綠；
- 版本機制已用真實資料驗證過；
- importer 的寫入是全有或全無。

尚未完成的不是技術條件，而是內容與決策：
- **B1**：使用者逐題確認 40 題。公開發布前必須完成；T.2 的開發不依賴它；
- **Q36 警示方案**：建議在 T.2 之前或 T.2 初期決定，因為方案 1 會改 schema；
- 這次的修改還沒有 commit，等待你確認。
