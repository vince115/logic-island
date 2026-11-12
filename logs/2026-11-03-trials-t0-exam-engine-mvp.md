# 2026-11-03 Shared Trial System T.0 — Exam Engine MVP

## 指示範圍

- 使用者核准 [04 題庫 Schema](../docs/exam-system/04_QUESTION_SCHEMA.md) 與 [05 實作計畫](../docs/exam-system/05_SHARED_EXAM_ENGINE_PLAN.md)，§11 的 8 項預設決策照用。
- 從當時的 HEAD `1a57cfd`（M3.1 座標與橋的核准紀錄，在 `caa8d92` 之後）新開分支 `trials/mvp`；執行 Prompt 6（T1–T10）。
- 可以本地 commit，只 stage 本次檔案；不 push、不 merge、不部署。
- MVP 驗收後停止，Prompt 7（題庫匯入與群島入口）等待確認。

## 起點與工作樹

- `trials/mvp` @ `1a57cfd`；文件 commit `3028f10` 之後才開始寫程式。
- Theme 工作階段有 5 個未提交檔案：`globals.css`、`layout.tsx`、`curriculum.module.css`、`islands.module.css`、`site-time.ts`。
  - 本次沒有修改、還原或提交這些檔案；
  - 本次的修改**全部是新檔案**，沒有修改任何已追蹤的檔案。
- 驗證都在隔離副本執行：`git archive HEAD`＋本次新檔案＋node_modules clone。不含 Theme 的修改，也不寫入 repo 的 `.next` 或 cache。

## 實作

| 任務 | 檔案 | 內容 |
|---|---|---|
| T1 | `src/content/trials/schema.ts` | 04 的型別（MVP 子集）；`LICENSE_DISPLAY`；`isPlayable`；`revisionHash`（FNV-1a）；`validateTrials` |
| T2 | `src/content/trials/{exams,sources,tags,papers,entries,index}.ts`、`questions/{original,apcs-reading,bank-it}.ts`、`published-hashes.json` | 4 項考試、4 個版本、6 個科目、6 個來源、17 個標籤、13 題原創題（APCS 程式識讀 7、銀行 6）、2 份固定試卷、4 個群島入口 |
| T3 | `src/lib/trials/{engine,shuffle}.ts` | 純函式：開始（凍結快照）、作答、交卷或到期、放棄、評分（以百分位整數加總）、可重現的選項亂序 |
| T4 | `src/lib/trials/review.ts` | 錯題本：答錯→待複習；連續答對 2 次→精熟；放棄的作答不計 |
| T5 | `src/lib/trials/store.ts`、`src/components/trials/use-trials.ts` | localStorage `logic-island.trials` v1：備份、新版唯讀、每份試卷保留最近 10 次；無法保存時以記憶體繼續作答並提示 |
| T6 | `src/lib/trials/{flag,views}.ts`、`src/app/trials/**` | `LOGIC_ISLAND_TRIALS=1` 才產生頁面；server 端組成 PaperView（Shiki 高亮在 build 時完成） |
| T7 | `src/components/trials/{exam-runner,blocks}.tsx` | 開始、作答即存、依截止時間倒數、重新整理後接續、時間到自動評分、交卷與放棄都要確認 |
| T8 | `result-report.tsx`、`paper-history.tsx` | 分數、通過與否、建議先複習的標籤與課程、逐題對錯、解析與來源 |
| T9 | `review-book.tsx` | 跨考試錯題、單題重做、精熟後移出 |
| T10 | `tests/trials-{validate,engine,store}.test.ts`、`tests/trials-dom.test.tsx`、`e2e/trials.spec.ts` | 31 項 Vitest、8 項 E2E（4 個案例 × desktop／mobile） |

### 路由（flag on 時）

| 路由 | 內容 |
|---|---|
| `/trials` | 試煉大廳：依 world registry 的區域分組；有試卷的考試可以進入，沒有的顯示「題目準備中」 |
| `/trials/apcs`、`/trials/bank-it` | 考試頁：科目（官方格式，未確認者標明）、試卷、免責聲明、官方資訊來源 |
| `/trials/<exam>/<paper>` | 作答 |
| `/trials/<exam>/<paper>/result?session=<id>` | 成績報告（瀏覽器端讀取） |
| `/trials/review` | 錯題本 |

- 所有頁面 `noindex`，全站沒有連結。flag 關閉時，`/trials`、`/trials/review` 在 build 時就是 404；`[exam]` 等動態路由沒有參數，也是 404。
- 導覽列、首頁與 `/world` 都沒有改。

### 與 05 計畫的差異

- **同一份試卷在兩個分頁同時開啟**：05 寫「第二個分頁唯讀」。實作上兩個分頁透過 `storage` 事件同步同一個 session；每次寫入都套在最新的 session 上，不會互相覆寫。比唯讀簡單，也沒有資料遺失。
- **錯題本的「再做一次」**：改成在錯題本內逐題重做，不另外開一份「錯題練習卷」。重做只影響精熟狀態，不影響任何成績。
- **iPAS 與高普考的考試頁**：沒有試卷的考試不產生頁面（大廳只顯示卡片），和 05 §3「不能點」一致。

### 實作中發現並修正的錯誤

- **時間到評分漏掉答案**：計時器的 effect 持有開考時的 session 副本，時間到時拿它評分，會漏掉之後的作答（DOM 測試發現）。
  - 改為在寫入時讀取 store 中**最新**的 session 再評分；
  - 另加防重入：同一個 session 只會交卷一次。

## 題目的審核紀錄

- 13 題來自 03 樣本的原創題，由 Claude 撰寫（`generatedBy: claude-opus-5-5`）。
- 答案驗證：
  - 有程式碼的題目，程式實際執行過：C 用 cc，Python 用 python3，Java 用 IntelliJ 內建的 JDK；
  - 沒有程式碼的題目，依概念核對。
- 人工核准紀錄寫的是「使用者核准 05 §3 的 MVP 題目清單」，**不是逐題審稿**。逐題人工審稿是 MVP 驗收的一部分。
- validator 規定：AI 產生的題目一定要有人工核准，而且答案已驗證，才能發布。

## 驗證（隔離副本）

| 檢查 | 結果 |
|---|---|
| tsc `--noEmit` | exit 0 |
| ESLint（全專案） | exit 0 |
| Vitest（全部，JDK 在 PATH） | **47 files，1611 passed**／0 failed／0 skipped；其中本次 4 個檔案 31 項 |
| Build（`LOGIC_ISLAND_TRIALS=1`） | 成功；試煉頁面 7 個靜態頁 |
| Build（flag off） | 成功 |
| E2E `trials.spec.ts`（flag on） | 6 passed、2 skipped（flag off 才跑的案例），desktop＋mobile |
| E2E 全套（flag off） | **402 passed／64 skipped／6 failed**（見下方） |
| 受保護路徑 | 本次沒有修改任何已追蹤檔案：`progress.ts`、`courses.ts`、`engine.ts`、`lab.tsx`、課綱、world、3D、header 都是 0 行差異 |
| 畫面 | desktop／mobile 截圖：大廳、考試頁、作答、成績、錯題本（scratchpad，未進版控） |

### E2E 全套的 6 項失敗

- **3 項是既有的 P1-11**（`player.spec.ts`），與本次無關。
- **1 項是 P1-32**：`candidate-integration.spec.ts:209`（候選頁的自動旋轉）。
  - 全套執行時機器負載約 9～15；
  - 單獨重跑 3 次，3/3 通過，判定為既有的高負載逾時。
- **2 項是本次 spec 的錯誤**：`trials.spec.ts` 的 flag off 案例。
  - 4 個路由確實都回 404；
  - 但用 `page.goto` 開啟時，瀏覽器把 404 記成 console error，被 console 檢查判為失敗。
  - 已改用 `page.request.get` 檢查狀態碼；在 flag off 的 build 重跑：2/2 通過。
  - flag on 的 build 重跑整份 spec：6 passed、2 skipped。

### 頁面 JS 大小

量測方式：HTML 引用的 JS chunk，gzip 後加總（本次的量法，和 F.1d 的腳本不一定相同）。

| 頁面 | gzip |
|---|---:|
| `/trials` | 192,276 B |
| `/trials/apcs` | 194,532 B |
| `/trials/apcs/apcs-reading-mock-a`（作答） | 198,098 B |
| `…/result` | 199,459 B |
| `/trials/review` | 199,033 B |
| 對照：`/curriculum/programs-and-algorithms`（F01） | 224,664 B |

試煉頁面都比一般課程頁小；作答頁不載入 3D。

測試分層（依 CLAUDE.md）：

- 單元與 DOM 測試：jsdom，不等於瀏覽器；
- 瀏覽器：Playwright Chromium；
- 模擬手機：iPhone 13 viewport＋Chromium；
- 真機：**未測**。

## 未完成與後續

- 逐題人工審稿（13 題）：MVP 驗收時進行。
- 高普考（考選部可自由利用的官方題）與 iPAS（需要另寫原創題）都還沒有題目：屬於 Prompt 7。
- 練習模式、生成式試卷、複選與申論題、公式渲染、圖片資產、程式實作評測：不在 MVP。
- `/world` 樞紐的試煉入口（T11）：MVP 之後另外確認。
- 真機與螢幕閱讀器實測：未做。
