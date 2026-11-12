# 2026-11-03 Shared Trial System T.1 — 題庫匯入流程、第一批匯入與群島入口

## 指示範圍

- 使用者逐題校閱 13 題原創題後，接受 T.0 MVP。
- 指示執行 Prompt 7：
  - 建立匯入流程；
  - 第一批匯入 MVP 原創題與考選部 114 年普考《計算機概要》選擇題；
  - 整合群島入口；
  - 需要變更 3D 時停止。
- 延續 T.0 的授權：分支 `trials/mvp`，可本地 commit（只 stage 本次檔案），不 push、不 merge、不部署。

## 結果摘要

| 項目 | 內容 |
|---|---|
| 匯入流程 | `src/lib/trials/import.ts`（純函式）＋ `scripts/trials/import.ts`（CLI），`pnpm trials:import <batch> [--write] [--report]`；說明見 [06](../docs/exam-system/06_QUESTION_IMPORT_FLOW.md) |
| 第一批 | 53 題全部發布：原創 13 題（雜湊與 T.0 相同）＋ 114 普考計算機概要 40 題（答案 40/40 與官方相符）；報告在 `docs/exam-system/imports/` |
| 新試卷 | `moex-114-pukao-3448`：40 題 × 2.5 分、60 分鐘、原卷題序、不打亂選項、不設及格線 |
| 群島入口 | `/world` 導覽的每個群島下方、`/world/cs` 與 `/world/ai` 地圖下方（explorer 原有的 footer 欄位）；iPAS 顯示「題目準備中」 |
| 3D | **沒有任何變更**：沒有改座標、地形、鏡頭或場景；入口是頁面上的 HTML 連結 |

## 實作

### 匯入流程

- 批次檔 → 結構檢查 → 逐題檢查（重複、答案、授權、審稿）→ 版本比對 → 合併後整體 `validateTrials` → 報告。
- 預設 dry-run；`--write` 只在全部通過時寫入。寫入：
  - `generated/<id>.json`
  - `generated/index.ts`
  - `published-hashes.json`（只新增）
- 匯入流程不新增審稿紀錄、不提升狀態。AI 撰寫或轉錄、而沒有人工核准的題目，一律以 `in-review` 匯入。
- 同一批次重匯，輸出逐位元組相同；測試對每個已提交的批次檢查這一點。
- 匯入流程不支援的部分（如實列出）：
  - 只有中繼資料的題目（授權未確認）：不匯入，資料留在 `docs/exam-system/data`；
  - 停用題目（retire）；
  - 單選以外的題型；
  - 圖片。

### 第一批

- **原創 13 題**：
  - 由 T.0 的 `questions/*.ts` 轉成批次檔 `2026-11-03-mvp-originals.json`，刪除原本的 TypeScript 模組；
  - 13 個版本雜湊與 T.0 的 `published-hashes.json` 完全相同，等於證明內容沒有改變；
  - 新增一筆人工審稿紀錄：「MVP 驗收：逐題校閱 13 題後接受」。
- **114 普考計算機概要 40 題**（`2026-11-03-moex-114-pukao-computer.json`）：
  - 試題 PDF 與答案 PDF 是本工作階段稍早已下載的副本，網址取自考選部開放資料 CSV。CSV 的更正答案欄是空的，答案 PDF 的備註欄也是空的。
  - 題文取自 PDF 文字層，四頁都渲染成圖片逐頁對照校正。
  - 程式題實際執行：
    - Java 輸出 4；
    - Python 輸出 `[0, 0, 0, 6]`；
    - 第 27 題虛擬碼改寫成 Python，結果 13。
  - 解析為 Logic Island 撰寫。
- 新增：
  - 2 個來源：試題、答案；
  - 25 個標籤，只連結確實相關的完整課程：F02、F04、F06、F09、F13、F14、F18；
  - 1 份試卷。

### 顯示調整

- 官方題的出處加上原卷題號，例如「第 17 題」。
- 解析標示撰寫者：
  - 原創題：「Logic Island 撰寫」；
  - 官方題：「Logic Island 撰寫，非官方解答」。T.0 原本依 `answerOfficial` 判斷，官方題會漏標，已修正。
- 試煉大廳的說明改為也包含依法可自由利用的官方試題。

### 驗證規則（schema）

- 新增：已發布的官方題必須有 `source-checked` 的核准。
- 放寬：沒有答案的題目（官方送分題暫緩時）不再被誤判成「答案種類錯誤」。仍然規定已發布的題目一定要有答案。
- 新增 `GeneratedBatch` 型別。

### 群島入口

- `RegionTrials` 元件（`src/components/trials/region-trials.tsx`），資料來自 `regionTrialEntries(region)`，依 `entries.ts` 的順序。
- `/world`：每個群島項目下方列出該群島的試煉。
- `/world/[region]`：試煉列在 `RegionalWorldExplorer` 新增的 `footer` prop，這個 prop 只是傳進既有的 `HexWorldExplorer` footer 欄位。
  - fullscreen 地圖的高度固定為 `100svh`，footer 在地圖下方，不影響地圖尺寸與鏡頭；
  - regional-world E2E 的島寬、名牌與鏡頭相關案例全數通過。
- 只在 `LOGIC_ISLAND_TRIALS=1` 時顯示；世界頁本身仍需要 `LOGIC_ISLAND_REGIONAL_WORLD=1`。預設 build 兩者都沒有。
- 沒有改 `/world` 的「中央挑戰島（APCS Trial…）規劃中」說明。05 的預設是區域層級入口，APCS 放在資訊科學群島；中央挑戰島是否也放試煉入口，留待之後決定。

## 修改的既有檔案

- `package.json`：只新增 `trials:import` script，沒有新增或升級套件。
- `src/app/world/page.tsx`、`src/app/world/[region]/page.tsx`
- `src/components/world/world-overview.tsx`、`regional-world-explorer.tsx`、`world.module.css`
- T.0 自己的檔案：
  - `src/content/trials/*`
  - `src/lib/trials/views.ts`
  - `src/components/trials/*`
  - `src/app/trials/page.tsx`
  - `tests/trials-*`
  - `e2e/trials.spec.ts`
- Theme 工作階段的 5 個未提交檔案：沒有修改、沒有 stage。

## 驗證（隔離副本：HEAD ＋ 本次變更，不含 Theme 的修改）

| 檢查 | 結果 |
|---|---|
| tsc `--noEmit` | exit 0 |
| ESLint（全專案） | exit 0 |
| Vitest 全部（JDK 在 PATH） | 48 files：1626 passed、1 failed。失敗的是 `highlight.test.ts` 的 5 秒逾時（實際 6.3 秒，load 約 6～7）；它不讀試煉資料，單獨重跑 2/2 通過 |
| Vitest 試煉相關 | 5 files 全部通過，其中本次新增 `trials-import.test.ts` 與 DOM／驗證案例 |
| Build（兩個 flag 都開） | 成功；試煉 10 個靜態頁（多了高普考的考試頁、作答頁、成績頁），世界 3 頁 |
| Build（flag off） | 成功 |
| E2E `trials.spec.ts`＋`regional-world.spec.ts`（兩個 flag 都開） | 26 passed、6 skipped（flag off 才跑的案例），desktop＋mobile；改字型後重 build 再跑一次，結果相同 |
| E2E 全套（flag off） | **405 passed／68 skipped／3 failed**：3 項都是既有的 P1-11（`player.spec.ts:42`、`:106`，desktop 與 mobile），與 T.0 相同，和本次無關。T.0 那次的 P1-32 這次沒有出現。 |
| 截圖 | desktop／mobile：`/world` 導覽、`/world/cs` 地圖下方入口、第 27 題、第 17 題成績（scratchpad，未進版控） |

截圖發現 footer 套用 explorer 的等寬字型，已改回內文字型。

## 未完成與後續

- **驗收**：40 題轉錄的逐題校對，以及 40 則解析的審稿。人工核准紀錄目前寫的是「使用者指示匯入」，**不是逐題校對**。
- **iPAS**：沒有題目，維持「題目準備中」。官方題的授權未確認，需要另寫原創題，或取得授權。
- **其他高普考試卷**：其他年度或科目要逐批匯入。高考三級的專業科目都是申論題，引擎還不支援。
- 匯入流程不支援的部分：停用題目、單選以外的題型、圖片。
- 沒有做真機與螢幕閱讀器測試；沒有 push、沒有部署。
