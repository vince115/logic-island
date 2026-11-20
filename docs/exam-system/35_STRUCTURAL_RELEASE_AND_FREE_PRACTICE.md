# 35 結構檢查發布與自由練習（2026-11-12）

> 專案負責人的決定（2026-11-12）：不再等每一題人工審核完才開放練習。通過結構檢查的題目先發布供練習，內容品質之後持續改善。本文件記錄這個決定改了什麼、沒改什麼，以及它**不代表**什麼。


> **本文件在公開 repository 的範圍（T.3J 之後）**：公開 repository 只有**程式、測試與文件**：結構檢查（`src/lib/trials/structural.ts`）、自由練習（`practice.ts`）、帳本與匯入的修正、`trials:auto-release` 指令，以及用合成題目驗證它們的 `tests/trials-structural-practice.test.ts`。
> 下文提到的「350 題已發布」是**私人題庫的資料**（`vince115/logic-island-question-bank`）：它們的題文、答案、帳本決定與 hash 不在這個 repository，公開的 `ledger.json`、`published-hashes.json` 與 `generated/` 也**沒有**改動（仍是 53 題）。所以公開的建置沒有 iPAS／CCAR-F 的自由練習，也看不到「可自由練習（N 題）」的大廳文字；有私人題庫的本機建置才會依已發布的題數顯示。
> 要把這 350 題的發布結果帶進公開 repository，還需要 T.3J §6 第 1 點尚未定案的流程（已發布的私人題目搬到公開 `generated/`、manifest 條目與帳本），並由專案負責人決定是否公開這批只通過結構檢查、未經人工驗證的 AI 撰寫題目。在那之前不得把它們放進公開 repository。
> 帳本的自動審核者 `auto-structural` 也只存在於私人端的帳本資料；公開 `ledger.json` 受 `ci-bootstrap.json` 的 sha256 固定，沒有改。`trials:auto-release` 需要該審核者已在帳本中。

## 1. 重點結論

- iPAS AI 應用規劃師 200 題、CCAR-F 150 題，共 **350 題**，已全部通過結構檢查並發布（帳本 350 筆決定、350 筆發布；`trials:preflight` 18／18 通過）。
- 兩個考試現在都有 **自由練習**（每個科目一份，最多 10 題，題數不足時自動縮減）與 **完整模擬考**（題庫已滿足每個考綱項目的配額）。
- **這 350 題沒有經過人工專業驗證。** 「通過結構檢查」只表示題目完整、自洽；不表示答案正確。網站在每份相關試卷上都這樣說（「尚未經人工專業驗證」），`trials:release-gate` 也仍然把「人工審核」關卡判為 not-verified，`releasable` 為 false。

## 2. 結構檢查檢查什麼

實作：`src/lib/trials/structural.ts`。只適用於**原創題**（官方題的來源仍要人檢查）。

| 檢查 | 說明 |
|---|---|
| 狀態與來源 | 審核中、原創、MVP 題型、來源已知且授權已確認 |
| 內容完整 | 題幹、每個選項、解析都有文字，沒有空白 |
| 選項 | 至少 2 個，id 不重複 |
| 答案 | 單選恰好 1 個；複選至少 2 個且不是全部，`select` 等於正解數；每個正解都是選項 |
| 顯示 | 題幹、選項、答案、解析都開放顯示 |
| 解析 | 複選題每個選項都有說明；沒有指向不存在選項的說明 |
| 答案與解析一致 | 解析寫「正解（B）」或「正解（A）（C）」時，必須和答案鍵相同（可抓出鍵與解析不同的錯誤） |
| 考綱 | 恰有一個考綱項目，題目才能被組卷 |

題庫層級的問題（重複 id、未知科目、hash 衝突）仍由 `validateTrials` 與匯入流程擋下。

**它不檢查：** 答案是否真的正確、題意是否清楚、是否有更好的干擾選項、技術內容是否過時。

## 3. 帳本怎麼記（沒有繞過閘門）

沿用既有的 `planDecisions → planPublication → rebuild → 全有或全無寫入`，只新增一種**明確標示的**核准：

- 新增 reviewer `auto-structural`（`kind: "automated"`、只有 `review` 角色，名稱寫「自動結構檢查（不是人工審核）」）。
- 它的決定帶 `basis: "structural-check"`、`checks` 為空；寫入題目時是 `reviewer: "ai"`，**不是**人工核准。
- 發布仍由 `owner`（有 publish 角色的人）執行，綁定修訂與內容 hash，一個核准只能發布一次。
- 守衛：`checkLedger` 與 `planDecisions` 拒絕「真人帶 basis」「自動 reviewer 不帶 basis」「結構檢查帶內容檢查」「官方題用結構檢查」；`schema.ts` 的 `validateTrials` 只承認原創題的結構核准。
- `release-gate` 把結構核准判為 not-verified，所以它永遠不會被當成人工驗證。

發布指令（先 dry run，再 `--confirm N`）：

```bash
pnpm trials:auto-release --exam ipas-aiap-basic --at 2026-11-12
pnpm trials:auto-release --exam ipas-aiap-basic --at 2026-11-12 --confirm 200
```

未通過的題目保持原狀並列出原因，不影響其他題目發布。這次 350 題全數通過。

### 一起修掉的兩個既有缺陷

1. **撤回被舊組卷擋住。** 題目一旦發布，`rebuild` 用舊的模擬卷驗證撤回，會以「題目不可作答」拒絕撤回自己。現在 `planImport` 接受 `papersOf`，`rebuild` 在每批更新後依新題庫重新組出模擬卷與練習卷。已測：撤回一題後題目變 `revoked`、其他不變。
2. **舊修訂的 hash 被記成已發布。** 修訂過的題目匯入時，連未發布的舊修訂 hash 也寫進 `published-hashes.json`，發布前置檢查會擋下。現在只記錄實際發布的修訂。

## 4. 自由練習與模擬考

| | 自由練習 | 完整模擬考 |
|---|---|---|
| 可用條件 | 該科目至少 1 題已發布 | 已發布題數滿足每個考綱項目的配額 |
| 題數 | `min(10, 已發布題數)`，不重複 | iPAS 每科 50、CCAR-F 60 |
| 考綱配額 | 不需要 | 需要（既有規則不變） |
| 成績 | 每題原配分，不判定通過 | 既有規則 |

實作：`src/lib/trials/practice.ts`（每個藍圖科目一份 `*-free`）、`ExamPaper.free`、`FREE_CODE`。題庫不足時模擬考維持不可用，**不會**用重複題湊數；自由練習照常可用（`tests/trials-practice-release.test.ts` 以 1、5、8、10、11 題驗證）。

大廳顯示：0 題「題目準備中」；有題但不足配額「可自由練習（N 題）」；達配額「可自由練習（N 題）・可模擬考」。固定試卷的考試（APCS、高普考、銀行）維持「N 份試卷」。

## 5. `ccarf-e` 只有 8 題

不是異常。批次 E 的名稱是「Q101–Q108，組卷補題」，是補足 D2.2、D2.5、D3.3、D3.4、D4.2、D4.4、D4.6、D5.2 這幾個考綱項目配額的小批次（見該批次的 `generatedBy.note` 與 `docs/exam-system/28`）。CCAR-F 實際共 **150 題**（A–D 各 25、E 8、F 與 G 各 21）。

## 6. 測試怎麼分

罩住「發布前的題庫」的既有測試（約 20 個檔案）很多，它們斷言的是歷史不變量（修訂與 hash 沒被改、匯入冪等、組卷、審核流程）。這些檔案現在用 `vi.mock` 讀**發布前快照**（`tests/helpers/baseline-data.ts`，由已提交的資料反推：移除自動決定、對應的發布與 hash，並與 `git HEAD` 逐位元組比對過）。已發布的狀態由下列測試負責，不使用快照：

- `tests/trials-practice-release.test.ts`：350 題的記錄、帳本健全、結構檢查（正反例）、誰能寫結構決定、自由練習、大廳文字、未驗證標示。
- `tests/trials-exposure.test.ts`、`trials-ledger-ordering.test.ts`、`trials-release-gate.test.ts`、`trials-import.test.ts` 等：用真實資料。
- `pnpm trials:preflight --build .next --probe …`：資料、bundle 洩漏、路由、probe 全部用真實資料。

## 7. 已知風險與取捨

1. **答案隨頁面送到瀏覽器（既有設計）。** 作答是純前端計分（T.0 設計：靜態網站、沒有伺服器評分）。每個試卷頁的 payload 含該卷題庫的正解與解析（以 CCAR-F 自由練習頁為例，150 題的解析都在頁面裡）。因此學習者可以用開發者工具在交卷前看到答案。已發布的 53 題本來就如此；這次新增 350 題。對自我練習的網站可接受，但**不適合當作防作弊的正式考試**。若要改成伺服器評分，需要新的 API 與非靜態部署，是另一個專案。
2. **題目內容未經人工驗證。** 350 題由 AI 撰寫、只過結構檢查。答案可能有誤（尤其 CCAR-F 的 76 題「版本敏感」題，另有技術查證登記簿，`human-verified` 為 0）。使用者須自行對照官方資料。需要時用 `trials:revoke` 撤回單題，不會影響其他題目。
3. **公開與私人題庫分離，在這個 Repository 並不存在。** 題目批次（`batches/`、`generated/`，含審核前的答案與解析）本來就提交在 Git 裡。「未發布不外洩」靠的是建置期間不把未發布題目送進頁面、bundle 與路由（preflight 的 exposure／bundle／routes／probe 四項檢查），不是靠 Repository 隔離。若 Repository 公開，審核前的答案本來就是公開的。這次沒有改變這一點。
4. **試煉功能仍受 `LOGIC_ISLAND_TRIALS=1` 控制**，預設 build 不含 `/trials`，頁面 `noindex`。是否對外開放是另一個部署決定。
