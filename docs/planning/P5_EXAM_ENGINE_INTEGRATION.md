# P5：Exam Engine 整合盤點

> 2026-11-12，多群島 v2 的 P5。**只做整合盤點與缺口分析**：沒有修改題庫、題目狀態、答案、manifest、帳本、已發布雜湊、試卷或 CI；沒有發布任何題目。

## 1. 安全檢查（分支 `archipelago/v2`）

| 檢查 | 結果 | 證據 |
|---|---|---|
| 題庫與引擎是否被修改 | **否**：`src/content/trials`、`src/lib/trials`、`scripts/trials`、`docs/exam-system`、`.github` 與公開基線 `origin/trials/mvp`（`4cbe587`）完全相同 | `git diff --stat origin/trials/mvp HEAD -- <這些路徑>` 為空 |
| 分支基底 | 公開線 `origin/trials/mvp`，**不含**本機原始 trials 歷史（含 350 題未發布題目的題文與答案）；本機 `.git/hooks/pre-push` 對 4 次推送都放行 | T.3J 文件 `docs/exam-system/34_*`；本次推送紀錄 |
| 私人題庫 | 這個 worktree 沒有 `private/`，以公開模式建置與測試（與 CI 相同） | `ls private` 不存在 |
| 考試入口與旗標 | 只有 `LOGIC_ISLAND_TRIALS=1` 的建置才有 `/trials`、側欄的「模擬考試」與課綱頁的「相關模擬考試」；預設建置的路由契約沒有任何 `/trials/*` | `tests/route-contract.test.ts` 快照 |
| 課程頁開放是否會公開考試 | **不會**：課綱頁的考試連結只在 trials 建置中出現，且只連到**有試卷**的考試（`regionTrialEntries` 的 `href`）；課程頁本身不讀題庫 | `src/components/curriculum/region-overview.tsx` `RegionExams` |
| 作答資料 | 未改 `logic-island.trials` 的格式、版本或讀寫；P2 的側欄只讀考試清單 | `src/lib/trials/store.ts` 未變 |

## 2. 現況

| 項目 | 公開分支實況 |
|---|---|
| 共用引擎 | `src/lib/trials`：組卷、計時、計分、作答紀錄、錯題本、發布生命週期；所有考試共用，沒有每座島一份 |
| 考試（`exams.ts`） | APCS、高普考資訊處理、銀行資訊類（`archipelago: 'cs'`）；iPAS AI 應用規劃師（初級）、CCAR-F（`archipelago: 'ai'`） |
| 公開題庫 | **53 題**：高普考 40、APCS＋銀行 13（`mvp-originals`）。iPAS 200 題與 CCAR-F 150 題在私人題庫，公開建置中兩者都是「題目準備中」，沒有試卷 |
| 題目與課程的關聯 | 題目 `links: { lessons, labs, activities, plannedIslands }`。公開 53 題中 18 題連到課（高普考 7、mvp 11），35 題沒有連結。依先前對私人題庫的盤點：iPAS 200 題全部只有 `plannedIslands`，CCAR-F 150 題沒有任何連結 |
| 區域 | `Exam.archipelago` 與 `TrialPlace.regionId` 型別為 `'cs' \| 'ai'`；`design`、`web` 目前沒有考試，型別不需要改 |
| 儲存 | 所有考試共用 `logic-island.trials`（含 `.backup`、`.v1-backup`、`quarantine`），以 `paperId`／`paperVersion`／`examId` 區分；沒有每考試一個 key，目前沒有因此產生的衝突 |

## 3. 整合設計（課程能力 ↔ 考試）

原則：**關聯由題目資料推導，不在島嶼或課程上另存考試清單**，避免兩個來源。

| 方向 | 做法 | 狀態 |
|---|---|---|
| 區域 → 考試 | `Exam.archipelago`（已有）；課綱頁與 `/world` 依此列出 | P2／P3 已使用 |
| 課程 → 練習題 | 由題目的 `links.lessons` 反查「這堂課有 N 題相關練習」；只在 trials 建置、且題目已發布時顯示 | 規劃（P5 之後的實作項目） |
| 島嶼 → 考試範圍 | 由 `links.plannedIslands`（未開課）或 `links.lessons` 所屬的島推導 | 規劃 |
| 實驗 → 題目 | `links.labs`、`links.activities` 已在 schema；目前沒有題目使用 | 規劃 |
| 學習路線 J ↔ CCAR-F | CCAR-F 的考試範圍（Agent、工具、MCP、評估、安全）與路線 J 的 targets 對應；需要先為題目補 `links`（見缺口 2） | 規劃 |

## 4. 缺口與需要使用者決定的事

1. **私人題目的公開流程尚未定義**（T.3J 文件 §6.1）。本機 `f241639`「release 350 iPAS and CCAR-F questions on a structural check」只存在於含私人歷史的本機分支；把這 350 題搬到公開 `generated/`（連同 manifest 條目與已發布雜湊）是**發布政策的變更**，本次沒有做，需要你的明確決定與 T.3J 規定的 leak-scan。
2. **CCAR-F 題目沒有 `links`**：補上 `plannedIslands`（AG、LLM、OPS）或 `lessons` 會改變題目版本與雜湊，必須走題庫的審查與發布流程（`docs/exam-system/governance`），不能在這個分支直接改。
3. **iPAS 只有 `plannedIslands`**：AI 島開課後，才能把 `plannedIslands` 換成實際的 `lessons`；同樣走審查流程。
4. **design／web 沒有對應考試**：未來若接入（例如網頁設計相關證照），只要在 `exams.ts` 新增考試並把 `archipelago` 型別放寬為 `RegionId`；引擎不需要改。
5. **E2E fixture 需要私人題庫**（T.3J §6.3）：本分支在公開模式下無法跑 trials 的 fixture E2E；`e2e/trials.spec.ts` 的區域名稱已同步為「程式與資訊群島」「AI 人工智慧群島」，但本次沒有執行該 spec。

## 5. 建議的下一步（需授權）

1. 你決定私人題目的公開流程後，另開 trials 分支處理發布，與本分支分開提交。
2. 在本分支之後的階段實作「課程 → 相關練習題數」的推導顯示（只讀 `links`，trials 建置限定）。
3. CCAR-F 的 `links` 與路線 J 的對應，列入題庫下一輪審查。
